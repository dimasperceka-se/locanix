import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { processBillingEvent } from "./billing";
import { paypal } from "./paypal";
import { dataDir } from "./dataDir";

const MAX_BYTES = 1024 * 1024;

/** Verify with PayPal before durably accepting an event into the local inbox. */
export async function receivePayPalWebhook(req: Request): Promise<Response> {
  const headers = ["paypal-auth-algo", "paypal-cert-url", "paypal-transmission-id", "paypal-transmission-sig", "paypal-transmission-time"];
  if (headers.some((name) => !req.headers.get(name))) {
    return Response.json({ error: "Missing PayPal signature headers" }, { status: 400 });
  }
  const reader = req.body?.getReader();
  if (!reader) return Response.json({ error: "Missing body" }, { status: 400 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return Response.json({ error: "Payload too large" }, { status: 413 });
    }
    chunks.push(value);
  }
  let event;
  try {
    event = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!event || typeof event.id !== "string" || !event.id || typeof event.event_type !== "string" || !event.resource) throw new Error();
  } catch {
    return Response.json({ error: "Invalid webhook event" }, { status: 400 });
  }
  const { PAYPAL_ENV, PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID } = process.env;
  if (!["sandbox", "live"].includes(PAYPAL_ENV ?? "") || !PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET || !PAYPAL_WEBHOOK_ID) {
    return Response.json({ error: "PayPal webhook is not configured" }, { status: 503 });
  }
  try {
    const verification = await paypal<{ verification_status?: string }>("/v1/notifications/verify-webhook-signature", "POST", {
      auth_algo: req.headers.get("paypal-auth-algo"), cert_url: req.headers.get("paypal-cert-url"),
      transmission_id: req.headers.get("paypal-transmission-id"), transmission_sig: req.headers.get("paypal-transmission-sig"),
      transmission_time: req.headers.get("paypal-transmission-time"), webhook_id: PAYPAL_WEBHOOK_ID, webhook_event: event,
    });
    if (verification.verification_status !== "SUCCESS") {
      return Response.json({ error: "Invalid PayPal signature" }, { status: 401 });
    }
    await processBillingEvent(event);
    // Keep a durable copy after applying billing state. Retries are idempotent.
    // A stable event filename prevents duplicate deliveries from adding duplicate records.
    const directory = dataDir("paypal-webhooks", PAYPAL_ENV!);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const filename = createHash("sha256").update(event.id).digest("hex");
    const temporary = path.join(directory, `${filename}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify({ status: "received", event }), { mode: 0o600 });
      await rename(temporary, path.join(directory, `${filename}.json`));
    } finally {
      await rm(temporary, { force: true });
    }
    return Response.json({ received: true });
  } catch (e) {
    // Do not acknowledge failures: PayPal should retry. Never log credentials or payloads.
    console.error("[paypal webhook]", event.event_type, event.id, (e as Error).message);
    return Response.json({ error: "Webhook temporarily unavailable" }, { status: 503 });
  }
}
