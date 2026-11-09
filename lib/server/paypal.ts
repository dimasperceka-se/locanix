export class BillingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function paypalEnvironment() {
  const env = process.env.PAYPAL_ENV;
  if (env !== "sandbox" && env !== "live") throw new BillingError("PayPal is not configured.", 503);
  return env;
}

function paypalBase() {
  return paypalEnvironment() === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
}

// Reuse the OAuth token until shortly before it expires instead of fetching one per call.
let cachedToken: { key: string; value: string; expiresAt: number } | undefined;

async function accessToken(fresh: boolean): Promise<string> {
  const { PAYPAL_CLIENT_ID: id, PAYPAL_CLIENT_SECRET: secret } = process.env;
  if (!id || !secret) throw new BillingError("PayPal is not configured.", 503);
  const base = paypalBase();
  const key = `${base}|${id}`;
  if (!fresh && cachedToken?.key === key && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const auth = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST", headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials", cache: "no-store", signal: AbortSignal.timeout(15000),
  });
  if (!auth.ok) throw new BillingError("PayPal authentication failed. Please contact support.", 503);
  const token = await auth.json();
  if (typeof token.access_token !== "string") throw new BillingError("PayPal authentication failed. Please contact support.", 503);
  cachedToken = { key, value: token.access_token, expiresAt: Date.now() + Math.max(0, (Number(token.expires_in) || 0) - 300) * 1000 };
  return token.access_token;
}

export async function paypal<T = Record<string, unknown>>(endpoint: string, method = "GET", body?: unknown, requestId?: string): Promise<T> {
  const send = async (fresh: boolean) => fetch(`${paypalBase()}${endpoint}`, {
    method, headers: { Authorization: `Bearer ${await accessToken(fresh)}`, "Content-Type": "application/json", Prefer: "return=representation", ...(requestId ? { "PayPal-Request-Id": requestId } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: "no-store", signal: AbortSignal.timeout(20000),
  });
  let response = await send(false);
  // A 401 means the cached token was rejected before processing; retry once with a new one.
  if (response.status === 401) response = await send(true);
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    console.error("[paypal]", response.status, failure.name, failure.debug_id);
    throw new BillingError("PayPal could not complete the request. Please retry.", 502);
  }
  return response.status === 204 ? {} as T : response.json();
}
