import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { sameOrigin } from "@/lib/server/http";
import { savePlots, type SavePlotInput } from "@/lib/server/db";
import { findById } from "@/lib/server/userStore";
import { hasConsent } from "@/lib/consent";

export const runtime = "nodejs";

type Incoming = Partial<SavePlotInput>;

/** Persist every uploaded plot for the signed-in user. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Plots are only stored for users who agreed to the data-use statement.
  if (!hasConsent(await findById(session.uid))) {
    return NextResponse.json({ error: "Consent required", code: "consent_required" }, { status: 403 });
  }

  let body: { plots?: Incoming[]; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad JSON" }, { status: 400 });
  }

  const clean: SavePlotInput[] = (Array.isArray(body.plots) ? body.plots : [])
    .slice(0, 1000)
    .map((p) => ({
      plotId: String(p?.plotId ?? ""),
      name: String(p?.name ?? "Plot"),
      areaHa: Number(p?.areaHa) || 0,
      isValid: Boolean(p?.isValid),
      issues: Array.isArray(p?.issues) ? p!.issues!.map(String) : [],
      ring: Array.isArray(p?.ring)
        ? (p!.ring!.map((c) => [Number(c[0]), Number(c[1])]) as [number, number][])
        : [],
    }))
    .filter((p) => p.ring.length >= 3);

  if (clean.length === 0) return NextResponse.json({ saved: 0 });

  try {
    const saved = await savePlots(
      { uid: session.uid, email: session.email },
      clean,
      String(body.source ?? "upload"),
    );
    return NextResponse.json({ saved });
  } catch (e) {
    console.error("[plots] save failed:", (e as Error).message);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
