import { createHmac, timingSafeEqual } from "node:crypto";
import { BillingError } from "./paypal";

/**
 * Duitku POP (hosted payment page), written from the public Duitku documentation
 * (docs.duitku.com/pop/en, docs.duitku.com/api/en):
 * - Create invoice: POST {api}/api/merchant/createInvoice, JSON. Headers
 *   x-duitku-merchantcode, x-duitku-timestamp (Unix ms) and
 *   x-duitku-signature = HMAC-SHA256(merchantCode + timestamp, apiKey), lowercase hex.
 * - Callback: form POST, signature = HMAC-SHA256(merchantCode + amount + merchantOrderId, apiKey).
 *   Duitku retries until it gets HTTP 200 (at most 5 times).
 * - Transaction status: POST {status}/webapi/api/merchant/transactionStatus, JSON,
 *   signature = HMAC-SHA256(merchantCode + merchantOrderId, apiKey).
 *   statusCode 00 = success, 01 = in process, 02 = failed or expired.
 * Payments are in rupiah only, at least Rp10.000.
 */
export type DuitkuEnv = "sandbox" | "production";

const HOSTS: Record<DuitkuEnv, { api: string; status: string }> = {
  sandbox: { api: "https://api-sandbox.duitku.com", status: "https://sandbox.duitku.com" },
  production: { api: "https://api-prod.duitku.com", status: "https://passport.duitku.com" },
};

export function duitkuEnvironment(): DuitkuEnv | null {
  const env = process.env.DUITKU_ENV;
  return env === "sandbox" || env === "production" ? env : null;
}

export function duitkuConfigured() {
  return !!duitkuEnvironment() && !!process.env.DUITKU_MERCHANT_CODE && !!process.env.DUITKU_API_KEY;
}

/** The built-in mock (local tests only) stands in for both Duitku hosts. */
function mockBase() {
  return process.env.NODE_ENV !== "production" && process.env.DUITKU_MOCK === "1" ? process.env.DUITKU_BASE_URL || null : null;
}

function config() {
  const env = duitkuEnvironment();
  const merchantCode = process.env.DUITKU_MERCHANT_CODE;
  const apiKey = process.env.DUITKU_API_KEY;
  if (!env || !merchantCode || !apiKey) throw new BillingError("Rupiah payments are not available yet.", 503);
  const mock = mockBase();
  return { merchantCode, apiKey, hosts: mock ? { api: mock, status: mock } : HOSTS[env], mock };
}

export const duitkuSignature = (text: string, apiKey: string) => createHmac("sha256", apiKey).update(text, "utf8").digest("hex");

function sameHex(a: string, b: string) {
  const x = Buffer.from(a.toLowerCase());
  const y = Buffer.from(b.toLowerCase());
  return x.length === y.length && timingSafeEqual(x, y);
}

async function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const text = await response.text();
  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* Duitku answers some errors in plain text */
  }
  return { status: response.status, ok: response.ok, data, text };
}

export type DuitkuInvoice = { reference: string; paymentUrl: string };

export async function createInvoice(input: {
  merchantOrderId: string;
  paymentAmount: number;
  productDetails: string;
  email: string;
  returnUrl: string;
  callbackUrl: string;
}): Promise<DuitkuInvoice> {
  const c = config();
  if (!Number.isInteger(input.paymentAmount) || input.paymentAmount < 10000) throw new BillingError("Rupiah payments start at Rp10.000.");
  if (input.email.length > 50) throw new BillingError("Your email address is too long for Duitku (50 characters at most).");
  const timestamp = String(Date.now());
  const name = input.productDetails.slice(0, 50);
  const result = await post(
    `${c.hosts.api}/api/merchant/createInvoice`,
    {
      paymentAmount: input.paymentAmount,
      merchantOrderId: input.merchantOrderId,
      productDetails: input.productDetails.slice(0, 255),
      email: input.email,
      customerVaName: "Locanix",
      itemDetails: [{ name, price: input.paymentAmount, quantity: 1 }],
      returnUrl: input.returnUrl,
      callbackUrl: input.callbackUrl,
    },
    {
      "x-duitku-merchantcode": c.merchantCode,
      "x-duitku-timestamp": timestamp,
      "x-duitku-signature": duitkuSignature(c.merchantCode + timestamp, c.apiKey),
    },
  );
  const d = result.data as { reference?: unknown; paymentUrl?: unknown; statusCode?: unknown; statusMessage?: unknown; Message?: unknown } | null;
  if (!result.ok || d?.statusCode !== "00" || typeof d.reference !== "string" || typeof d.paymentUrl !== "string") {
    // Log Duitku's reason (never the key) so a misconfigured project is easy to spot.
    console.error("[duitku] createInvoice", result.status, d?.statusMessage ?? d?.Message ?? result.text.slice(0, 200));
    throw new BillingError("Duitku could not start the payment. Please retry.", 502);
  }
  const url = new URL(d.paymentUrl);
  const allowed = c.mock ? url.origin === new URL(c.mock).origin : url.protocol === "https:" && (url.hostname === "duitku.com" || url.hostname.endsWith(".duitku.com"));
  if (!allowed) throw new BillingError("Invalid Duitku payment link.", 502);
  return { reference: d.reference, paymentUrl: d.paymentUrl };
}

export type DuitkuStatus = { merchantOrderId: string; reference: string; amount: number; statusCode: string; statusMessage: string };

/** Authoritative payment state. Duitku rate-limits this call, so callers throttle it. */
export async function transactionStatus(merchantOrderId: string): Promise<DuitkuStatus> {
  const c = config();
  const result = await post(`${c.hosts.status}/webapi/api/merchant/transactionStatus`, {
    merchantCode: c.merchantCode,
    merchantOrderId,
    signature: duitkuSignature(c.merchantCode + merchantOrderId, c.apiKey),
  });
  const d = result.data;
  if (!result.ok || !d || typeof d.statusCode !== "string") {
    console.error("[duitku] transactionStatus", result.status, d?.statusMessage ?? d?.Message ?? result.text.slice(0, 200));
    throw new BillingError("Could not check the payment with Duitku. Please retry.", 502);
  }
  return {
    merchantOrderId: String(d.merchantOrderId ?? ""),
    reference: String(d.reference ?? ""),
    amount: Number(d.amount),
    statusCode: d.statusCode,
    statusMessage: String(d.statusMessage ?? ""),
  };
}

/** Checks a callback's merchant code and signature. */
export function verifyCallback(fields: Record<string, string>): "ok" | "missing" | "invalid" {
  const c = config();
  const { merchantCode, amount, merchantOrderId, signature } = fields;
  if (!merchantCode || !amount || !merchantOrderId || !signature) return "missing";
  if (merchantCode !== c.merchantCode) return "invalid";
  return sameHex(duitkuSignature(merchantCode + amount + merchantOrderId, c.apiKey), signature) ? "ok" : "invalid";
}
