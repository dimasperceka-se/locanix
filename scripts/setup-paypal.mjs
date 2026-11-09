import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";

// Provisions the PayPal product, the two monthly plans and, with --webhook-url, the webhook.
// Safe to re-run: existing plans/webhooks are verified and reused.
//   Sandbox: node --env-file=.env scripts/setup-paypal.mjs [--webhook-url=https://<tunnel>/api/paypal/webhook]
//   Live:    node --env-file=.env.paypal-live scripts/setup-paypal.mjs --live --webhook-url=https://locanix.id/api/paypal/webhook
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const i = a.indexOf("=");
  return i < 0 ? [a.replace(/^--/, ""), true] : [a.slice(0, i).replace(/^--/, ""), a.slice(i + 1)];
}));
const environment = process.env.PAYPAL_ENV;
if (environment !== "sandbox" && environment !== "live") throw new Error("Set PAYPAL_ENV to sandbox or live.");
if (environment === "live" && !args.live) throw new Error("PAYPAL_ENV=live creates real PayPal plans. Re-run with --live to confirm.");
if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) throw new Error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET.");
const base = environment === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const EVENTS = [
  "BILLING.SUBSCRIPTION.ACTIVATED", "BILLING.SUBSCRIPTION.CANCELLED", "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.PAYMENT.FAILED", "BILLING.SUBSCRIPTION.SUSPENDED", "BILLING.SUBSCRIPTION.UPDATED",
  "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DECLINED", "PAYMENT.CAPTURE.PENDING", "PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED",
  "PAYMENT.SALE.COMPLETED", "PAYMENT.SALE.REFUNDED", "PAYMENT.SALE.REVERSED",
];

const auth = await fetch(base + "/v1/oauth2/token", {
  method: "POST", headers: { Authorization: "Basic " + Buffer.from(process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_CLIENT_SECRET).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials",
});
if (!auth.ok) throw new Error("PayPal authentication failed: " + auth.status + " (check the credentials belong to " + environment + ")");
const token = (await auth.json()).access_token;
async function api(endpoint, body, requestId, method = body ? "POST" : "GET") {
  const response = await fetch(base + endpoint, { method, headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", ...(requestId ? { "PayPal-Request-Id": requestId } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(JSON.stringify({ status: response.status, name: data.name, details: data.details }));
  return data;
}

await mkdir(".data", { recursive: true });
const file = `.data/paypal-${environment}-setup.json`;
let setup;
try { setup = JSON.parse(await readFile(file, "utf8")); }
catch (e) { if (e.code !== "ENOENT") throw e; setup = { productRequest: randomUUID(), regularRequest: randomUUID(), proRequest: randomUUID() }; }
const save = () => writeFile(file, JSON.stringify(setup, null, 2), { mode: 0o600 });
await save();
const output = {};

// Prices must match PRICES in lib/server/billing.ts. A PayPal plan keeps its
// price, so a new price gets a new plan; existing subscribers stay on theirs.
const PLANS = [["regular", "Locanix Regular — 100 ha/month", "29.00"], ["pro", "Locanix Professional — 500 ha/month", "99.00"]];
const matches = (plan, price) => {
  const c = plan.billing_cycles;
  return plan.status === "ACTIVE" && c?.length === 1 && c[0].frequency.interval_unit === "MONTH" && c[0].frequency.interval_count === 1
    && Number(c[0].pricing_scheme.fixed_price.value) === Number(price) && c[0].pricing_scheme.fixed_price.currency_code === "USD";
};

for (const [key, name, price] of PLANS) {
  const envKey = key === "regular" ? "PAYPAL_PLAN_REGULAR_ID" : "PAYPAL_PLAN_PRO_ID";
  // Reuse the configured plan, or one this script already created at this price.
  let plan;
  for (const id of new Set([process.env[envKey], setup[key + "Id"]].filter(Boolean))) {
    const candidate = await api("/v1/billing/plans/" + encodeURIComponent(id));
    if (matches(candidate, price)) { plan = candidate; break; }
    console.log(key + ": " + id + " does not bill USD " + price + "/month — a new plan is needed");
    setup.productId ||= candidate.product_id; // keep using the same PayPal product
  }
  if (!plan) {
    if (!setup.productId) {
      const product = await api("/v1/catalogs/products", { name: "Locanix land analysis", description: "Monthly land compliance analysis", type: "SERVICE", category: "SOFTWARE" }, setup.productRequest);
      setup.productId = product.id;
    }
    // One idempotency key per plan and price, so re-runs never create duplicates.
    const requestKey = key + "Request_" + price;
    setup[requestKey] ||= randomUUID();
    await save();
    const created = await api("/v1/billing/plans", {
      product_id: setup.productId, name, status: "ACTIVE",
      billing_cycles: [{ frequency: { interval_unit: "MONTH", interval_count: 1 }, tenure_type: "REGULAR", sequence: 1, total_cycles: 0, pricing_scheme: { fixed_price: { value: price, currency_code: "USD" } } }],
      payment_preferences: { auto_bill_outstanding: false, payment_failure_threshold: 1 },
    }, setup[requestKey]);
    setup[key + "Id"] = created.id;
    await save();
    plan = await api("/v1/billing/plans/" + encodeURIComponent(created.id));
    if (!matches(plan, price)) throw new Error("Plan pricing mismatch: " + key);
  }
  output[envKey] = plan.id;
  console.log(key + ": " + plan.id + " configured and verified (USD " + price + "/month)");
}

if (args["webhook-url"]) {
  const url = new URL(args["webhook-url"]);
  if (url.protocol !== "https:" || url.pathname !== "/api/paypal/webhook") throw new Error("Webhook URL must be https://<host>/api/paypal/webhook");
  const { webhooks = [] } = await api("/v1/notifications/webhooks");
  let hook = webhooks.find(w => w.url === url.href);
  if (!hook) hook = await api("/v1/notifications/webhooks", { url: url.href, event_types: EVENTS.map(name => ({ name })) });
  else if (EVENTS.some(e => !hook.event_types.some(t => t.name === e))) {
    const names = [...new Set([...hook.event_types.map(t => t.name), ...EVENTS])];
    hook = await api("/v1/notifications/webhooks/" + hook.id, [{ op: "replace", path: "/event_types", value: names.map(name => ({ name })) }], undefined, "PATCH");
  }
  if (process.env.PAYPAL_WEBHOOK_ID && process.env.PAYPAL_WEBHOOK_ID !== hook.id) console.warn("Warning: PAYPAL_WEBHOOK_ID in the environment differs from the webhook for " + url.href);
  output.PAYPAL_WEBHOOK_ID = hook.id;
  console.log("webhook: " + url.href + " subscribed to " + EVENTS.length + " events");
}

if (environment === "sandbox") {
  // Local convenience: keep .env in sync (only lines that changed).
  let env = await readFile(".env", "utf8");
  const before = env;
  for (const [key, value] of Object.entries({ ...output, ...(/^PAYPAL_RETURN_BASE=/m.test(env) ? {} : { PAYPAL_RETURN_BASE: "http://localhost:3001" }) })) {
    const line = key + "=" + value, pattern = new RegExp("^" + key + "=.*$", "m");
    env = pattern.test(env) ? env.replace(pattern, line) : env.replace(/\n?$/, "\n") + line + "\n";
  }
  if (env !== before) { await writeFile(".env", env); console.log(".env updated"); }
} else {
  console.log("\nSet these on the production server (with PAYPAL_ENV=live and the live client ID/secret):");
  for (const [key, value] of Object.entries(output)) console.log(key + "=" + value);
}
