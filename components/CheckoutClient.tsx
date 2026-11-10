"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";
import { ui } from "@/components/workspace/ui";
import { usePlotStore } from "@/lib/plotStore";
import { pricingTiers, type CurrencyKey } from "@/lib/data";
import { SELECTION_KEY } from "@/lib/checkoutSelection";

type PlanId = "payg" | "regular" | "pro";
type MethodId = "duitku" | "card" | "paypal";
type Quote = { amount: string; currency: "USD" | "IDR"; areaHa: number; count: number; skipped: number; quotaHa: number | null; exceedsQuota: boolean; minimumApplied: boolean };type Subscription = { id: string; plan: string; status: string; provider: "paypal" | "duitku"; active: boolean; expiresAt?: number; remainingHa: number };

/** Display data per plan; prices come from the landing page tiers (lib/data.ts). */
const PLANS: { id: PlanId; tier: (typeof pricingTiers)[number]; idrPerUnit: number }[] = [
  { id: "payg", tier: pricingTiers[0], idrPerUnit: 88200 },
  { id: "regular", tier: pricingTiers[1], idrPerUnit: 522000 },
  { id: "pro", tier: pricingTiers[2], idrPerUnit: 1782000 },
];

/** Rupiah methods run on Duitku's hosted page, where the customer picks QRIS, a virtual account or an e-wallet. */
const METHODS: { id: MethodId; name: string; desc: string }[] = [
  { id: "duitku", name: "QRIS, bank transfer or e-wallet", desc: "Virtual accounts (BCA, Mandiri, BNI, BRI…), QRIS, OVO, DANA, ShopeePay — on Duitku's secure page" },
  { id: "card", name: "Credit or debit card", desc: "Visa, Mastercard, JCB — on PayPal's secure card form" },
  { id: "paypal", name: "PayPal", desc: "Pay with your PayPal balance or linked card" },
];

const idr = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");
const area = (n: number) => (n >= 1 ? n.toFixed(2) : n.toFixed(4));

function availability(method: (typeof METHODS)[number], cur: CurrencyKey, plan: PlanId, duitku: boolean): { ok: boolean; tag: string } {
  if (method.id === "duitku") {
    if (!duitku) return { ok: false, tag: "Coming soon" };
    if (cur !== "idr") return { ok: false, tag: "IDR only" };
    return { ok: true, tag: plan === "payg" ? "" : "1 month" };
  }
  if (cur === "idr") return { ok: false, tag: "USD only" };
  // PayPal subscriptions have no guest card form; monthly plans need a PayPal account.
  if (method.id === "card") return plan === "payg" ? { ok: true, tag: "" } : { ok: false, tag: "Pay as you go only" };
  return { ok: true, tag: plan === "payg" ? "" : "Auto-renew" };
}

async function paymentRequest(body: unknown) {
  const response = await fetch("/api/paypal/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Payment request failed.");
  return result;
}

const radioDot = (on: boolean) =>
  `box-border h-[18px] w-[18px] flex-none rounded-full bg-white ${on ? "border-[6px] border-ink" : "border-[1.5px] border-[#A9A8A0]"}`;
const option = (on: boolean, ok = true) =>
  `w-full rounded-xl border-2 text-left text-ink ${on ? "border-ink bg-canvas" : "border-line bg-white"} ${
    ok ? "cursor-pointer hover:border-ink" : "cursor-not-allowed opacity-55"
  }`;
const sectionH2 = "m-0 font-display text-[20px] font-semibold";
const stepNo = "mr-2.5 font-mono text-[13px] font-normal text-muted";
const note = "m-0 text-[14px] leading-[1.6] text-[#3A403C]";

export default function CheckoutClient({ selectedIds = null }: { selectedIds?: number[] | null }) {
  const { plots, loadWorkspace } = usePlotStore();
  const [chosenIds, setChosenIds] = useState<number[] | null>(selectedIds);
  const [cur, setCur] = useState<CurrencyKey>("usd");
  const [planId, setPlanId] = useState<PlanId>("payg");
  const [methodId, setMethodId] = useState<MethodId>("card");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [environment, setEnvironment] = useState("");
  const [duitku, setDuitku] = useState(false);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [cancelled, setCancelled] = useState(false);
  // Only the plots checked on Plots when there is a selection; otherwise every valid plot.
  const only = chosenIds ? new Set(chosenIds) : null;
  const geometry = JSON.stringify(plots.filter((p) => p.isValid && (!only || only.has(p.id))).map((p) => ({ ring: p.ring })));
  const currency = cur === "idr" ? "IDR" : "USD";

  const plan = PLANS.find((p) => p.id === planId)!;
  const methods = METHODS.map((m) => ({ ...m, ...availability(m, cur, planId, duitku) }));
  // Keep the chosen method valid when the plan or currency changes.
  const method = methods.find((m) => m.id === methodId && m.ok) ?? methods.find((m) => m.ok) ?? null;

  const refreshBilling = async () => {
    const res = await fetch("/api/paypal/checkout", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    setEnvironment(data.environment);
    setDuitku(!!data.methods?.duitku);
    setSubscriptions(data.subscriptions);
  };
  useEffect(() => {
    void loadWorkspace();
    const back = new URLSearchParams(window.location.search).has("cancelled");
    setCancelled(back);
    try {
      if (selectedIds) sessionStorage.setItem(SELECTION_KEY, selectedIds.join(","));
      else if (back) {
        // PayPal's cancel link has no selection: restore the one this checkout started with.
        const saved = sessionStorage.getItem(SELECTION_KEY)?.split(",").map(Number).filter((n) => n > 0);
        if (saved?.length) setChosenIds(saved);
      } else sessionStorage.removeItem(SELECTION_KEY);
    } catch {
      /* storage unavailable: the selection just isn't remembered */
    }
    refreshBilling().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let current = true;
    setQuote(null);
    setError("");
    paymentRequest({ action: "quote", plan: planId, plots: JSON.parse(geometry), currency })
      .then((data) => {
        if (current) setQuote(data);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, [planId, geometry, currency]);

  const pay = async () => {
    if (!quote || busy || !method) return;
    const via = method.id;
    setBusy(true);
    setError("");
    try {
      // One request id per plan, method and quote: retries after a reload or an
      // interrupted redirect reuse the same order instead of creating a new one.
      const key = ["locanix.checkout", planId, via, quote.currency, quote.amount, geometry].join(".");
      const create = (requestId: string) =>
        paymentRequest({ action: "create", plan: planId, method: via, currency: quote.currency, plots: JSON.parse(geometry), amount: quote.amount, requestId });
      const fresh = () => {
        const id = crypto.randomUUID();
        sessionStorage.setItem(key, id);
        return id;
      };
      let data = await create(sessionStorage.getItem(key) ?? fresh());
      // The earlier Duitku invoice for this order was cancelled or expired: start a new one.
      if (data.expired) data = await create(fresh());
      if (data.paid) {
        sessionStorage.removeItem(key);
        window.location.assign("/dashboard");
        return;
      }
      window.location.assign(data.approvalUrl);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  const cancel = async (id: string) => {
    if (!window.confirm("Cancel this subscription? Completed paid periods remain available until they expire.")) return;
    setBusy(true);
    setError("");
    try {
      await paymentRequest({ action: "cancel", id });
      await refreshBilling();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const resume = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      const data = await paymentRequest({ action: "resume", id });
      window.location.assign(data.approvalUrl);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  // The server quotes both currencies; the rupiah total is what Duitku charges.
  const total = !quote || quote.currency !== currency ? "—" : quote.currency === "IDR" ? idr(Number(quote.amount)) : `$${quote.amount}`;
  const unitPrice = plan.tier[cur].amount;
  const line =
    planId === "payg"
      ? { label: quote ? `${area(quote.areaHa)} ha × ${unitPrice}` : `ha × ${unitPrice}`, value: total }
      : { label: cur === "idr" ? "One month" : "First month", value: total };
  const renewNote =
    planId === "payg"
      ? "One-time payment for this order."
      : cur === "idr"
        ? "One month of access, paid once. It does not renew: buy the next month when this one ends."
        : `Renews automatically at ${plan.tier.usd.amount}.00 USD each month until cancelled. Cancel here or in your PayPal account.`;
  const payLabel = busy
    ? "Please wait…"
    : !method
      ? cur === "idr"
        ? "IDR payments coming soon"
        : "Choose a payment method"
      : method.id === "paypal"
        ? "Continue to PayPal"
        : method.id === "duitku"
          ? "Continue to Duitku"
          : `Pay ${total} with card`;
  const subscriptionStatus = (s: Subscription) =>
    s.provider !== "duitku"
      ? s.status.toLowerCase().replaceAll("_", " ")
      : s.status === "SUCCESS"
        ? s.active
          ? "paid"
          : "ended"
        : "waiting for payment";

  return (
    <div className="min-h-screen bg-canvas leading-[normal] text-ink">
      <header className="bg-ink-deep text-[#F7F7F4]">
        <div className="mx-auto flex max-w-[1264px] flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-8">
          <Link href="/dashboard" aria-label="Locanix workspace" className="flex items-center gap-2.5 text-[#F7F7F4] no-underline">
            <LogoMark size={28} tone="light" />
            <span className="font-display text-[19px] font-bold tracking-[-0.01em]">Locanix</span>
          </Link>
          <span className="inline-flex items-center gap-2 text-[14px] text-[#C9CCCA]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
            Secure checkout
          </span>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1264px] flex-col gap-6 px-5 pt-8 pb-16 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <Link href="/dashboard" className="text-[14px] text-ink-soft no-underline hover:text-ink">
              ← Back to plots
            </Link>
            <h1 className={ui.h1}>Checkout</h1>
          </div>
          <div role="group" aria-label="Currency" className="inline-flex gap-1 rounded-full border border-[#DAD9D2] bg-white p-1">
            {(["idr", "usd"] as const).map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={cur === c}
                onClick={() => setCur(c)}
                className={`min-h-10 cursor-pointer rounded-full border-0 px-4.5 text-[14px] ${cur === c ? "bg-ink font-semibold text-paper" : "bg-transparent font-medium text-ink-soft"}`}
              >
                {c.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {environment === "sandbox" && (
          <p className="m-0 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-[14px] text-amber-900">
            Sandbox testing — use a PayPal Sandbox account{duitku ? ", or Duitku's sandbox test payments for rupiah" : ""}. No real money is charged.
          </p>
        )}
        {cancelled && (
          <p role="status" className="m-0 rounded-xl border border-line bg-white px-5 py-3 text-[14px] text-ink-soft">
            You returned without completing checkout. You can try again below.
          </p>
        )}

        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-5">
            <section className={`${ui.card} flex flex-col gap-4 p-6`}>
              <h2 className={sectionH2}>
                <span className={stepNo}>01</span>Choose a plan
              </h2>
              <div role="radiogroup" aria-label="Plan" className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
                {PLANS.map((p) => {
                  const on = planId === p.id;
                  const price = p.tier[cur];
                  const sub =
                    p.id === "payg"
                      ? "No monthly fee. Pay only for this order."
                      : p.id === "regular"
                        ? `100 ha a month.${quote && planId === "regular" ? ` This order uses ${area(quote.areaHa)} ha.` : ""}`
                        : "500 ha a month, raw data export and supply-chain insight.";
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={busy}
                      onClick={() => setPlanId(p.id)}
                      className={`${option(on)} flex flex-col items-start gap-2 p-4`}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="text-[15px] font-semibold">{p.tier.name}</span>
                        <span className={radioDot(on)} />
                      </span>
                      <span className="font-display text-[24px] font-semibold tracking-[-0.02em]">
                        {price.amount}
                        <span className="font-sans text-[13px] font-medium text-muted"> {price.unit}</span>
                      </span>
                      <span className="text-[13px] leading-[1.45] text-ink-soft">{sub}</span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className={`${ui.card} flex flex-col gap-4 p-6`}>
              <h2 className={sectionH2}>
                <span className={stepNo}>02</span>Payment method
              </h2>
              <div role="radiogroup" aria-label="Payment method" className="flex flex-col gap-2">
                {methods.map((m) => {
                  const on = method?.id === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-disabled={!m.ok}
                      onClick={() => m.ok && setMethodId(m.id)}
                      className={`${option(on, m.ok)} flex items-center gap-3.5 px-4 py-3.5`}
                    >
                      <span className={radioDot(on)} />
                      <span className="flex min-w-0 flex-auto flex-col gap-0.5">
                        <span className="text-[15px] font-semibold">{m.name}</span>
                        <span className="text-[13px] text-muted">{m.desc}</span>
                      </span>
                      {m.tag && (
                        <span
                          className={`flex-none rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                            m.ok ? "border border-[#DAD9D2] bg-canvas text-[#3A403C]" : "bg-[#ECEBE5] text-ink-soft"
                          }`}
                        >
                          {m.tag}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="border-t border-line-soft pt-4.5">
                {!method && cur === "idr" && (
                  <p className={note}>
                    QRIS, bank transfer and e-wallets are coming soon. Switch to USD to pay by card or PayPal now.
                  </p>
                )}
                {method?.id === "duitku" && (
                  <p className={note}>
                    You&apos;ll continue to Duitku&apos;s secure page to pay by QRIS, virtual account or e-wallet, then return to Locanix. Charged in rupiah.
                    {planId !== "payg" && " This pays for one month and does not renew automatically."}
                  </p>
                )}
                {method?.id === "card" && (
                  <p className={note}>
                    You&apos;ll enter your card on PayPal&apos;s secure card form — no PayPal account needed — then return to Locanix.
                    Charged in USD. Availability can depend on your country and card.
                  </p>
                )}
                {method?.id === "paypal" && (
                  <p className={note}>
                    You&apos;ll continue to PayPal to log in and approve, then return to Locanix. Charged in USD.
                    {planId !== "payg" && " Monthly plans renew through your PayPal account; you can add a card there."}
                  </p>
                )}
              </div>
            </section>

            {!!subscriptions.length && (
              <section className={`${ui.card} flex flex-col gap-3 p-6`}>
                <h2 className={sectionH2}>Your subscriptions</h2>
                {subscriptions.map((s) => (
                  <div key={s.id} className="border-t border-line-soft pt-3 text-[14px] text-ink-soft">
                    <p className="m-0 font-semibold text-ink capitalize">
                      {s.plan} — {subscriptionStatus(s)}
                    </p>
                    {s.active && (
                      <p className="m-0 mt-1">
                        {s.remainingHa.toFixed(2)} ha remaining. Paid access until {new Date(s.expiresAt!).toLocaleDateString()}.
                        {s.provider === "duitku" && " Paid in rupiah for one month; it does not renew automatically."}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-4">
                      {(s.status === "APPROVAL_PENDING" || (s.provider === "duitku" && s.status === "PENDING")) && (
                        <button type="button" disabled={busy} onClick={() => resume(s.id)} className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-ink underline">
                          {s.provider === "duitku" ? "Continue payment" : "Resume checkout"}
                        </button>
                      )}
                      {s.provider !== "duitku" && !["CANCELLED", "EXPIRED"].includes(s.status) && (
                        <button type="button" disabled={busy} onClick={() => cancel(s.id)} className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-red-700 underline">
                          Cancel subscription
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </section>
            )}
          </div>

          <aside className={`${ui.card} flex min-w-0 flex-[1_1_340px] flex-col gap-4 p-6`}>
            <h2 className={sectionH2}>Order summary</h2>
            <div className="flex flex-col gap-2.5 text-[14px]">
              {[
                ["Plots to analyze", quote ? String(quote.count) : "—", false],
                ["Total area", quote ? `${area(quote.areaHa)} ha` : "—", true],
                ["Plan", plan.tier.name, false],
                [line.label, line.value, true],
              ].map(([label, value, mono]) => (
                <div key={String(label)} className="flex justify-between gap-2">
                  <span className="text-ink-soft">{label}</span>
                  <span className={`font-semibold ${mono ? "font-mono" : ""}`}>{value}</span>
                </div>
              ))}
            </div>
            {(chosenIds || !!quote?.skipped) && (
              <p className="m-0 text-[13px] leading-[1.5] text-muted">
                {chosenIds && "Only the plots you checked on Plots. "}
                {!!quote?.skipped &&
                  `${quote.skipped} of them ${quote.skipped === 1 ? "is" : "are"} already paid for or covered by your free allowance, so ${quote.skipped === 1 ? "it isn’t" : "they aren’t"} charged again. `}
                {chosenIds && (
                  <Link href="/dashboard" className="text-muted underline">
                    Change selection
                  </Link>
                )}
              </p>
            )}
            {quote?.currency === "IDR" && quote.minimumApplied && cur === "idr" && (
              <p className="m-0 text-[13px] leading-[1.5] text-muted">Rupiah payments have a minimum of Rp10.000, so this small order is charged Rp10.000.</p>
            )}
            {quote?.exceedsQuota && (
              <p className="m-0 rounded-xl bg-review-bg p-3 text-[13px] leading-[1.5] text-review-ink">
                Your selected plots ({quote.areaHa.toFixed(2)} ha) exceed this plan’s {quote.quotaHa} ha monthly quota, so they can’t all be analysed
                under it. You can still subscribe and analyse up to {quote.quotaHa} ha each month.
              </p>
            )}
            <div className="flex items-baseline justify-between gap-2 border-t border-line-soft pt-4">
              <span className="font-semibold">Total due now</span>
              <span className="font-display text-[30px] font-semibold tracking-[-0.02em]">
                {total}
                {cur === "usd" && quote && <span className="font-sans text-[14px] font-medium text-muted"> USD</span>}
              </span>
            </div>
            <p className="-mt-2 mb-0 text-[13px] leading-[1.5] text-muted">
              {cur === "idr" && !duitku ? "Estimate in rupiah. IDR payment methods are coming soon." : renewNote}
            </p>
            {error && (
              <p role="alert" className="m-0 rounded-xl bg-red-50 p-3 text-[14px] text-red-700">
                {error}
              </p>
            )}
            <button type="button" disabled={!quote || busy || !method} onClick={pay} className={`${ui.btnDark} min-h-13 text-[16px]`}>
              {payLabel}
            </button>
            <p className="m-0 text-center text-[12px] leading-[1.5] text-muted">
              By paying you agree to the{" "}
              <Link href="/privacy" className="text-muted underline">
                Terms &amp; Privacy Policy
              </Link>
              .
            </p>
          </aside>
        </div>
      </main>
    </div>
  );
}
