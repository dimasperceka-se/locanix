import { receivePayPalWebhook } from "@/lib/server/paypalWebhook";

export const runtime = "nodejs";

export function GET() {
  return Response.json({ service: "Locanix PayPal webhook", status: "reachable" });
}

export const POST = receivePayPalWebhook;
