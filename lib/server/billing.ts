import { billedPlots } from "./billingGeometry";
import { billingEnvironment, billingTransaction, readBillingState, type BillingState, type Purchase, type Plan, type BilledPlot, type PayMethod } from "./billingStore";
import { BillingError, paypal, paypalConfigured, paypalEnvironment } from "./paypal";
import { createInvoice, duitkuConfigured, duitkuEnvironment, transactionStatus, verifyCallback } from "./duitku";
import { findById } from "./userStore";
import { FREE_QUOTA_HA } from "../quota";

// Regular/Professional must match the PayPal plans (scripts/setup-paypal.mjs).
export const PRICES = { payg: 4.9, regular: 29, pro: 99 };
// Rupiah prices (Duitku). Must match the IDR tiers shown in lib/data.ts.
export const PRICES_IDR = { payg: 88200, regular: 522000, pro: 1782000 };
// Duitku rejects payments below Rp10.000.
export const IDR_MINIMUM = 10000;
// Ledger records from the retired Hasbi Foundation free programme (Oct 2026):
// never active, never block a PayPal subscription.
const RETIRED_PROMO = "PROMO";
export const QUOTAS = { regular: 100, pro: 500 };
type Money = { value: string; currency_code: string };
type Capture = { id: string; status: string; amount: Money };
type Order = { id: string; status: string; purchase_units?: { custom_id?: string; amount: Money; payments?: { captures?: Capture[] } }[]; links?: { rel: string; href: string }[] };
type Subscription = { id: string; status: string; custom_id?: string; plan_id: string; links?: { rel: string; href: string }[]; billing_info?: { next_billing_time?: string } };
type Sale = { id: string; status: string; time: string; amount_with_breakdown: { gross_amount: Money } };

function isPlan(plan: unknown): plan is Plan { return plan === "payg" || plan === "regular" || plan === "pro"; }
/**
 * Plots the account may analyze again without paying: bought per hectare, analyzed
 * on the free allowance, or already counted in an active monthly plan.
 */
function coveredKeys(state: BillingState, uid: string) {
  const keys = new Set(Object.keys(state.free[uid] || {}));
  for (const p of Object.values(state.purchases)) {
    if (p.uid !== uid || !purchaseActive(p)) continue;
    if (p.plan === "payg") for (const plot of p.plots) keys.add(plot.key);
    else for (const key of Object.keys(p.used)) keys.add(key);
  }
  return keys;
}

/** With a user, plots they are already covered for are left out (and counted in `skipped`). */
export async function quote(plan: unknown, input: unknown, currency: unknown = "USD", uid?: string) {
  if (!isPlan(plan)) throw new BillingError("Choose a valid plan.");
  if (currency !== "USD" && currency !== "IDR") throw new BillingError("Choose USD or IDR.");
  if (currency === "USD" && (process.env.PAYPAL_CURRENCY || "USD") !== "USD") throw new BillingError("Only USD pricing is configured.", 503);
  let plots = Array.isArray(input) && input.length ? billedPlots(input) : [];
  let skipped = 0;
  if (uid && plots.length) {
    const covered = coveredKeys(await readBillingState(), uid);
    const billable = plots.filter(p => !covered.has(p.key));
    skipped = plots.length - billable.length;
    plots = billable;
  }
  const areaHa = plots.reduce((sum, p) => sum + p.areaHa, 0);
  if (plan === "payg" && !plots.length) {
    throw new BillingError(skipped ? "The selected plots are already paid for or covered by your free allowance. Run the analysis from Plots." : "Add valid plots before paying per hectare.");
  }
  // A subscription is a monthly allowance, not a purchase of these plots: selecting more
  // than the quota only warns; analysis enforces the quota per plot later.
  const quotaHa = plan === "payg" ? null : QUOTAS[plan];
  let amount: string;
  let minimumApplied = false;
  if (currency === "USD") amount = (plan === "payg" ? Math.max(0.01, Math.round(areaHa * PRICES.payg * 100) / 100) : PRICES[plan]).toFixed(2);
  else {
    const raw = plan === "payg" ? Math.round(areaHa * PRICES_IDR.payg) : PRICES_IDR[plan];
    minimumApplied = raw < IDR_MINIMUM;
    amount = String(Math.max(IDR_MINIMUM, raw));
  }
  return { plan, plots, areaHa, amount, currency, count: plots.length, skipped, quotaHa, exceedsQuota: quotaHa !== null && areaHa > quotaHa + 1e-8, minimumApplied };
}

export function purchaseActive(p: Purchase, now = Date.now()): boolean {
  if (p.revoked) return false;
  // A Duitku monthly plan is paid once for one month; it never renews by itself.
  if (p.provider === "duitku") return p.status === "SUCCESS" && (p.plan === "payg" || (!!p.expiresAt && p.expiresAt > now));
  if (p.plan === "payg") return p.status === "COMPLETED";
  return ["ACTIVE", "CANCELLED", "EXPIRED"].includes(p.status) && !!p.expiresAt && p.expiresAt > now;
}

export async function billingSummary(uid: string) {
  return billingTransaction(state => {
    const own = Object.values(state.purchases).filter(p => p.uid === uid);
    return {
      paid: own.some(p => purchaseActive(p)), environment: billingEnvironment(),
      methods: { paypal: paypalConfigured(), duitku: duitkuConfigured() },
      subscriptions: own.filter(p => p.plan !== "payg" && p.providerId && !(p.provider === "duitku" && p.status === "FAILED")).map(p => ({ id: p.id, plan: p.plan, status: p.status, provider: p.provider ?? "paypal", active: purchaseActive(p), expiresAt: p.expiresAt, remainingHa: Math.max(0, QUOTAS[p.plan as "regular" | "pro"] - Object.values(p.used).reduce((s, n) => s + n, 0)) })),
    };
  });
}

function returnBase() {
  const base = process.env.PAYPAL_RETURN_BASE || process.env.APP_URL;
  if (!base) throw new BillingError("Payment return URL is not configured.", 503);
  const url = new URL(base);
  if (url.protocol !== "https:" && !(billingEnvironment() === "sandbox" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new BillingError("Invalid payment return URL.", 503);
  return url.origin;
}

// A CREATING record that never reached the provider (failed call, abandoned retry) should not block a new plan.
const abandoned = (p: Purchase, now: number) => p.status === "CREATING" && !p.providerId && now - p.createdAt > 120000;

/** Only one monthly plan at a time: one that can still bill, or still grants access. */
function blocksNewPlan(p: Purchase, now: number) {
  if (p.plan === "payg" || abandoned(p, now)) return false;
  // An unpaid Duitku invoice simply lapses, so only a paid month (or one being created) blocks.
  if (p.provider === "duitku") return purchaseActive(p, now) || (p.status === "CREATING" && !p.providerId);
  return !["CANCELLED", "EXPIRED", RETIRED_PROMO].includes(p.status);
}

export async function createCheckout(uid: string, input: { plan?: unknown; plots?: unknown; amount?: unknown; requestId?: unknown; method?: unknown; currency?: unknown }) {
  const q = await quote(input.plan, input.plots, input.currency ?? "USD", uid);
  if (q.amount !== input.amount) throw new BillingError("The quote changed. Please refresh and check the total.", 409);
  const method: PayMethod = input.method === "duitku" ? "duitku" : input.method === "card" ? "card" : "paypal";
  if (method === "duitku" && q.currency !== "IDR") throw new BillingError("QRIS, bank transfer and e-wallets are charged in rupiah. Switch to IDR.");
  if (method !== "duitku" && q.currency !== "USD") throw new BillingError("PayPal and cards are charged in USD. Switch to USD.");
  if (method === "duitku" && !duitkuConfigured()) throw new BillingError("Rupiah payments are not available yet.", 503);
  // PayPal subscriptions have no guest card form; monthly plans need a PayPal account.
  if (method === "card" && q.plan !== "payg") throw new BillingError("Card payment is available for pay-as-you-go. Monthly plans are paid with a PayPal account.");
  if (typeof input.requestId !== "string" || !/^[a-f0-9-]{36}$/.test(input.requestId)) throw new BillingError("Invalid checkout request.");
  const id = input.requestId;
  // Persist the request before calling the provider, allowing retry after a timeout/crash.
  await billingTransaction(state => {
    const existing = state.purchases[id];
    if (existing) {
      if (existing.uid !== uid || existing.plan !== q.plan || existing.amount !== q.amount || existing.currency !== q.currency || (existing.method ?? "paypal") !== method || JSON.stringify(existing.plots) !== JSON.stringify(q.plots)) throw new BillingError("Checkout request does not match.", 409);
      return;
    }
    const now = Date.now();
    if (q.plan !== "payg" && Object.values(state.purchases).some(p => p.uid === uid && blocksNewPlan(p, now))) throw new BillingError("You already have a subscription or pending checkout. Resume or cancel it first.", 409);
    state.purchases[id] = {
      id, uid, plan: q.plan, amount: q.amount, currency: q.currency, plots: q.plots, createdAt: now, status: "CREATING", used: {}, method,
      ...(method === "duitku" ? { provider: "duitku" as const, providerEnv: duitkuEnvironment()! } : {}),
    };
  });
  if (method === "duitku") return startDuitku(uid, id);
  return billingTransaction(async state => {
    const p = state.purchases[id];
    if (p.approvalUrl) return { id: p.id, approvalUrl: p.approvalUrl };
    const base = returnBase();
    const context = { brand_name: "Locanix", shipping_preference: "NO_SHIPPING", return_url: `${base}/checkout/return?purchase=${id}`, cancel_url: `${base}/checkout?cancelled=1&purchase=${id}` };
    let result: Order | Subscription;
    if (p.plan === "payg") {
      result = await paypal<Order>("/v2/checkout/orders", "POST", {
        intent: "CAPTURE", purchase_units: [{ custom_id: p.id, description: `Locanix analysis — ${q.areaHa.toFixed(4)} ha`, amount: { currency_code: p.currency, value: p.amount } }],
        // GUEST_CHECKOUT opens PayPal's debit/credit card form instead of the login page.
        payment_source: { paypal: { experience_context: { ...context, user_action: "PAY_NOW", ...(method === "card" ? { landing_page: "GUEST_CHECKOUT" } : {}) } } },
      }, p.id);
    } else {
      const planId = process.env[p.plan === "regular" ? "PAYPAL_PLAN_REGULAR_ID" : "PAYPAL_PLAN_PRO_ID"];
      if (!planId) throw new BillingError("This subscription plan is not configured.", 503);
      // Guard against a stale plan ID: PayPal must bill exactly the price shown here.
      const plan = await paypal<{ status: string; billing_cycles?: { pricing_scheme?: { fixed_price?: Money } }[] }>(`/v1/billing/plans/${encodeURIComponent(planId)}`);
      if (plan.status !== "ACTIVE" || plan.billing_cycles?.length !== 1 || !matchMoney(plan.billing_cycles[0].pricing_scheme?.fixed_price, p)) {
        throw new BillingError("This subscription plan is not configured.", 503);
      }
      p.planId = planId;
      result = await paypal<Subscription>("/v1/billing/subscriptions", "POST", { plan_id: planId, custom_id: p.id, application_context: { ...context, user_action: "SUBSCRIBE_NOW" } }, p.id);
    }
    const approval = result.links?.find(l => ["approve", "payer-action"].includes(l.rel))?.href;
    if (!approval) throw new BillingError("PayPal did not provide an approval link.", 502);
    const approvedHost = paypalEnvironment() === "sandbox" ? "www.sandbox.paypal.com" : "www.paypal.com";
    if (new URL(approval).hostname !== approvedHost || new URL(approval).protocol !== "https:") throw new BillingError("Invalid PayPal approval link.", 502);
    p.providerId = result.id; p.status = result.status; p.approvalUrl = approval;
    return { id: p.id, approvalUrl: approval };
  });
}

function matchMoney(money: Money | undefined, p: Purchase) { return money?.currency_code === p.currency && Number(money.value) === Number(p.amount); }

export async function refreshPurchase(p: Purchase, capture = false) {
  if (!p.providerId) throw new BillingError("Checkout has not been created yet.", 409);
  if (p.plan === "payg") {
    let order = await paypal<Order>(`/v2/checkout/orders/${encodeURIComponent(p.providerId)}`);
    if (capture && order.status === "APPROVED") {
      await paypal(`/v2/checkout/orders/${encodeURIComponent(p.providerId)}/capture`, "POST", {}, `cap-${p.id.slice(0, 32)}`);
      // Validate against the full order, not whatever subset the capture response echoes back.
      order = await paypal<Order>(`/v2/checkout/orders/${encodeURIComponent(p.providerId)}`);
    }
    const unit = order.purchase_units?.[0];
    if (order.id !== p.providerId || order.purchase_units?.length !== 1 || unit?.custom_id !== p.id || !matchMoney(unit?.amount, p)) throw new BillingError("Payment details do not match the order.", 409);
    const captures = unit.payments?.captures ?? [];
    // Do not accept split/partial captures as a full payment.
    const full = captures.length === 1 && captures[0];
    if (full && matchMoney(full.amount, p)) {
      const latest = await paypal<Capture>(`/v2/payments/captures/${encodeURIComponent(full.id)}`);
      if (!matchMoney(latest.amount, p)) throw new BillingError("Payment amount does not match.", 409);
      p.captureId = latest.id; p.status = latest.status;
      if (["REFUNDED", "PARTIALLY_REFUNDED", "REVERSED", "DECLINED", "FAILED"].includes(latest.status)) p.revoked = true;
    } else p.status = order.status === "COMPLETED" ? "UNVERIFIED" : order.status;
    return;
  }
  const subscription = await paypal<Subscription>(`/v1/billing/subscriptions/${encodeURIComponent(p.providerId)}`);
  if (subscription.id !== p.providerId || subscription.custom_id !== p.id || subscription.plan_id !== p.planId) throw new BillingError("Subscription does not match the checkout.", 409);
  p.status = subscription.status;
  const end = new Date();
  const start = new Date(end.getTime() - 35 * 86400000);
  const query = new URLSearchParams({ start_time: start.toISOString(), end_time: end.toISOString() });
  const response = await paypal<{ transactions: Sale[] }>(`/v1/billing/subscriptions/${encodeURIComponent(p.providerId)}/transactions?${query}`);
  const sales = (response.transactions || []).filter(t => t.status === "COMPLETED" && matchMoney(t.amount_with_breakdown?.gross_amount, p)).sort((a, b) => Date.parse(b.time) - Date.parse(a.time));
  const sale = sales[0];
  if (!sale) { p.expiresAt = 0; return; }
  const expires = oneMonthAfter(new Date(sale.time));
  if (p.periodId !== sale.id) { p.periodId = sale.id; p.used = {}; p.revoked = false; }
  p.expiresAt = expires.getTime();
}

/** Same day next month, clamped to that month's last day (31 Jan → 28/29 Feb). */
function oneMonthAfter(paidAt: Date) {
  const expires = new Date(paidAt);
  const day = expires.getUTCDate();
  expires.setUTCDate(1); expires.setUTCMonth(expires.getUTCMonth() + 1);
  const last = new Date(Date.UTC(expires.getUTCFullYear(), expires.getUTCMonth() + 1, 0)).getUTCDate();
  expires.setUTCDate(Math.min(day, last));
  if (!Number.isFinite(expires.getTime())) throw new BillingError("Invalid payment date.", 502);
  return expires;
}

export async function confirmCheckout(uid: string, id: string) {
  return billingTransaction(async state => {
    const p = state.purchases[id];
    if (!p || p.uid !== uid) throw new BillingError("Checkout not found.", 404);
    if (p.provider === "duitku") await refreshDuitku(p);
    else await refreshPurchase(p, true);
    const waiting = p.provider === "duitku" && p.status === "PENDING";
    return { paid: purchaseActive(p), status: p.status, plan: p.plan, provider: p.provider ?? "paypal", ...(waiting ? { paymentUrl: p.approvalUrl } : {}) };
  });
}

// ---------------------------------------------------------------------------
// Duitku (rupiah): one-time payments. A monthly plan bought here is one month
// of access that does not renew; the next month is bought again.

async function startDuitku(uid: string, id: string) {
  const user = await findById(uid);
  if (!user) throw new BillingError("Please sign in.", 401);
  return billingTransaction(async state => {
    const p = state.purchases[id];
    if (p.approvalUrl) {
      // A retry of the same checkout: reuse the invoice while it can still be paid.
      await refreshDuitku(p).catch(() => undefined);
      if (p.status === "SUCCESS") return { id: p.id, paid: true as const };
      if (p.status === "FAILED") return { id: p.id, expired: true as const };
      return { id: p.id, approvalUrl: p.approvalUrl };
    }
    const base = returnBase();
    const areaHa = p.plots.reduce((s, plot) => s + plot.areaHa, 0);
    const label = p.plan === "payg" ? `Locanix analysis ${areaHa.toFixed(4)} ha` : `Locanix ${p.plan === "pro" ? "Professional" : "Regular"} plan, 1 month`;
    const invoice = await createInvoice({
      merchantOrderId: p.id, paymentAmount: Number(p.amount), productDetails: label, email: user.email,
      // Duitku appends ?merchantOrderId=…&resultCode=…&reference=… to the return URL.
      returnUrl: `${base}/checkout/return/duitku`, callbackUrl: `${base}/api/duitku/callback`,
    });
    p.providerId = invoice.reference; p.approvalUrl = invoice.paymentUrl; p.status = "PENDING";
    return { id: p.id, approvalUrl: invoice.paymentUrl };
  });
}

/** Applies Duitku's transaction status. Throttled: Duitku blocks clients that poll too often. */
async function refreshDuitku(p: Purchase, force = false) {
  if (!p.providerId) throw new BillingError("Checkout has not been created yet.", 409);
  if (p.status === "SUCCESS") return;
  if (!force && p.checkedAt && Date.now() - p.checkedAt < 5000) return;
  const s = await transactionStatus(p.id);
  p.checkedAt = Date.now();
  if (s.merchantOrderId !== p.id || (s.reference && s.reference !== p.providerId) || s.amount !== Number(p.amount)) throw new BillingError("Payment details do not match the order.", 409);
  if (s.statusCode === "00") {
    p.status = "SUCCESS";
    p.paidAt = Date.now();
    p.periodId = p.providerId;
    if (p.plan !== "payg") { p.used = {}; p.expiresAt = oneMonthAfter(new Date(p.paidAt)).getTime(); }
  } else p.status = s.statusCode === "02" ? "FAILED" : "PENDING";
}

/** A callback is a hint: its signature is checked, then the status is read back from Duitku. */
export async function processDuitkuCallback(fields: Record<string, string>): Promise<"ok" | "missing" | "invalid" | "unknown"> {
  const check = verifyCallback(fields);
  if (check !== "ok") return check;
  return billingTransaction(async state => {
    const p = state.purchases[fields.merchantOrderId];
    if (!p || p.provider !== "duitku" || Number(fields.amount) !== Number(p.amount)) return "unknown";
    await refreshDuitku(p, true);
    return "ok";
  });
}

export async function cancelSubscription(uid: string, id: string) {
  return billingTransaction(async state => {
    const p = state.purchases[id];
    if (!p || p.uid !== uid || p.plan === "payg") throw new BillingError("Subscription not found.", 404);
    if (p.provider === "duitku") throw new BillingError("This month was paid once and does not renew, so there is nothing to cancel.", 409);
    if (p.providerId && !["CANCELLED", "EXPIRED"].includes(p.status)) {
      // PayPal only cancels ACTIVE/SUSPENDED subscriptions. One never approved (APPROVAL_PENDING)
      // has nothing to cancel at PayPal and simply lapses there, so only close it locally.
      const current = await paypal<Subscription>(`/v1/billing/subscriptions/${encodeURIComponent(p.providerId)}`);
      if (current.id !== p.providerId || current.custom_id !== p.id) throw new BillingError("Subscription does not match the checkout.", 409);
      if (current.status === "APPROVED") throw new BillingError("PayPal is still activating this subscription. Please retry in a minute.", 409);
      if (["ACTIVE", "SUSPENDED"].includes(current.status)) {
        await paypal(`/v1/billing/subscriptions/${encodeURIComponent(p.providerId)}/cancel`, "POST", { reason: "Customer requested cancellation in Locanix" });
      }
      if (current.status === "EXPIRED") { p.status = "EXPIRED"; return { cancelled: true }; }
    }
    p.status = "CANCELLED";
    return { cancelled: true };
  });
}

/** A single transaction processes each verified event; retries are safe. */
export async function processBillingEvent(event: { id: string; event_type: string; resource: Record<string, unknown> }) {
  return billingTransaction(async state => {
    if (state.events[event.id]) return;
    const r = event.resource as { id?: string; billing_agreement_id?: string; custom_id?: string; supplementary_data?: { related_ids?: { order_id?: string; capture_id?: string } }; sale_id?: string; links?: { rel: string; href: string }[] };
    const related = r.supplementary_data?.related_ids;
    const up = r.links?.find(l => l.rel === "up")?.href;
    const captureId = related?.capture_id || (up?.match(/\/v2\/payments\/captures\/([A-Z0-9]+)(?:\?|$)/)?.[1]);
    // PayPal events only ever concern PayPal purchases.
    const purchase = Object.values(state.purchases).filter(p => p.provider !== "duitku").find(p =>
      (p.providerId && (p.providerId === r.billing_agreement_id || p.providerId === related?.order_id || p.providerId === r.id)) ||
      (p.captureId && (p.captureId === r.id || p.captureId === captureId)) || (p.periodId && (p.periodId === r.id || p.periodId === r.sale_id)) || p.id === r.custom_id);
    if (purchase) {
      await refreshPurchase(purchase);
      if (event.event_type === "PAYMENT.CAPTURE.REVERSED" || event.event_type === "PAYMENT.CAPTURE.REFUNDED") purchase.revoked = true;
      if (["PAYMENT.SALE.REVERSED", "PAYMENT.SALE.REFUNDED"].includes(event.event_type) && (purchase.periodId === r.id || purchase.periodId === r.sale_id)) purchase.revoked = true;
    }
    state.events[event.id] = Date.now();
  });
}

function coverage(state: BillingState, uid: string, plots: BilledPlot[], commit: boolean, legacyFreeUsed = 0) {
  const own = Object.values(state.purchases).filter(p => p.uid === uid && purchaseActive(p));
  const paygKeys = new Set(own.filter(p => p.plan === "payg").flatMap(p => p.plots.map(plot => plot.key)));
  const uncovered = plots.filter(p => !paygKeys.has(p.key));
  if (!uncovered.length) return "paid";
  for (const subscription of own.filter(p => p.plan !== "payg")) {
    const fresh = uncovered.filter(p => subscription.used[p.key] === undefined);
    const total = Object.values(subscription.used).reduce((s, n) => s + n, 0) + fresh.reduce((s, p) => s + p.areaHa, 0);
    if (total <= QUOTAS[subscription.plan as "regular" | "pro"] + 1e-8) {
      if (commit) for (const p of fresh) subscription.used[p.key] = p.areaHa;
      return "paid";
    }
  }
  const free = state.free[uid] || {};
  const fresh = uncovered.filter(p => free[p.key] === undefined);
  const total = legacyFreeUsed + Object.values(free).reduce((s, n) => s + n, 0) + fresh.reduce((s, p) => s + p.areaHa, 0);
  if (total <= FREE_QUOTA_HA + 1e-8) {
    if (commit) { for (const p of fresh) free[p.key] = p.areaHa; state.free[uid] = free; }
    return "report";
  }
  return "payment";
}

/** Hectares used on the free tier (ledger entries, one per distinct plot). */
export async function freeUsedHa(uid: string) {
  return billingTransaction(state => Object.values(state.free[uid] || {}).reduce((s, n) => s + n, 0));
}

export async function authorizePlots(uid: string, plots: BilledPlot[], commit = false, legacyFreeUsed = 0) {
  return billingTransaction(state => coverage(state, uid, plots, commit, legacyFreeUsed));
}
