import { processDuitkuCallback } from "@/lib/server/billing";
import { BillingError } from "@/lib/server/paypal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 64 * 1024;

export function GET() {
  return Response.json({ service: "Locanix Duitku callback", status: "reachable" });
}

/**
 * Duitku's payment notification (form POST). Duitku retries until it receives
 * HTTP 200, so only answer 200 once the payment state has been stored.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BYTES) return new Response("Payload too large", { status: 413 });
  const fields = Object.fromEntries(new URLSearchParams(raw));
  try {
    const result = await processDuitkuCallback(fields);
    if (result === "ok") return new Response("OK");
    if (result === "missing") return new Response("Bad parameter", { status: 400 });
    if (result === "invalid") return new Response("Bad signature", { status: 401 });
    return new Response("Unknown order", { status: 404 });
  } catch (e) {
    // Not acknowledged: Duitku will retry. Never log keys or full payloads.
    console.error("[duitku callback]", fields.merchantOrderId, (e as Error).message);
    const status = e instanceof BillingError && e.status < 500 ? e.status : 503;
    return new Response("Temporarily unavailable", { status });
  }
}
