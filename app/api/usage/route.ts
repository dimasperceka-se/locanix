import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { findById, type User } from "@/lib/server/userStore";
import { billingSummary, authorizePlots, freeUsedHa as ledgerFreeUsedHa } from "@/lib/server/billing";
import { FREE_QUOTA_HA } from "@/lib/quota";
import { billedPlots } from "@/lib/server/billingGeometry";
import { sameOrigin } from "@/lib/server/http";

export const runtime = "nodejs";

async function usageOf(u: User | null) {
  // Legacy per-user counter plus the per-plot ledger the analysis gate uses.
  const freeUsedHa = u ? (u.freeUsedHa ?? 0) + (await ledgerFreeUsedHa(u.id)) : 0;
  const paid = u ? (await billingSummary(u.id)).paid : false;
  return {
    freeUsedHa,
    paid,
    quotaHa: FREE_QUOTA_HA,
    remainingHa: Math.max(0, FREE_QUOTA_HA - freeUsedHa),
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await usageOf(await findById(session.uid)));
}

export async function POST(req: Request) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { action?: string; area?: unknown; totalArea?: unknown; count?: unknown; plots?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const user = await findById(session.uid);
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.action === "authorize") {
    try {
      const plots = billedPlots(body.plots);
      const decision = await authorizePlots(user.id, plots, false, user.freeUsedHa || 0);
      return NextResponse.json({ decision, ...await usageOf(user) });
    } catch {
      return NextResponse.json({ error: "Cannot authorize these plots." }, { status: 400 });
    }
  }
  if (body.action === "pay") {
    return NextResponse.json({ error: "Complete a verified PayPal payment." }, { status: 403 });
  }
  // Analysis requests now reserve quota on the server. Browser consume calls
  // cannot grant access or double-debit the quota.
  return NextResponse.json(await usageOf(user));
}
