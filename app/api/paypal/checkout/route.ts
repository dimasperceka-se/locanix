import { getSession } from "@/lib/server/session";
import { sameOrigin } from "@/lib/server/http";
import { findById } from "@/lib/server/userStore";
import { billingSummary, cancelSubscription, confirmCheckout, createCheckout, quote } from "@/lib/server/billing";
import { BillingError } from "@/lib/server/paypal";
import { billingTransaction } from "@/lib/server/billingStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Please sign in." }, { status: 401 });
  try { return Response.json(await billingSummary(session.uid)); }
  catch (e) { return failure(e); }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return Response.json({ error: "Invalid origin." }, { status: 403 });
  const session = await getSession();
  if (!session || !await findById(session.uid)) return Response.json({ error: "Please sign in." }, { status: 401 });
  try {
    const raw = await req.text();
    if (raw.length > 1024 * 1024) throw new BillingError("Too many coordinates.", 413);
    const body = JSON.parse(raw);
    if (body.action === "quote") return Response.json(quote(body.plan, body.plots));
    if (body.action === "create") return Response.json(await createCheckout(session.uid, body));
    if (body.action === "confirm" && typeof body.id === "string") return Response.json(await confirmCheckout(session.uid, body.id));
    if (body.action === "cancel" && typeof body.id === "string") return Response.json(await cancelSubscription(session.uid, body.id));
    if (body.action === "resume" && typeof body.id === "string") {
      return Response.json(await billingTransaction(state => {
        const p = state.purchases[body.id];
        if (!p || p.uid !== session.uid || !p.approvalUrl || p.status !== "APPROVAL_PENDING") throw new BillingError("Pending subscription not found.", 404);
        return { approvalUrl: p.approvalUrl };
      }));
    }
    throw new BillingError("Invalid payment request.");
  } catch (e) { return failure(e); }
}

function failure(error: unknown) {
  return Response.json({ error: error instanceof BillingError ? error.message : "Payment service unavailable. Please retry." }, { status: error instanceof BillingError ? error.status : 503 });
}
