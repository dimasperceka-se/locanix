import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { sameOrigin } from "@/lib/server/http";
import { findById } from "@/lib/server/userStore";
import { hasConsent } from "@/lib/consent";
import { WorkspaceError, loadWorkspace, sanitizeWorkspace, saveWorkspace } from "@/lib/server/workspace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 10 * 1024 * 1024;

/** The signed-in user's saved plots and analysis results. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workspace = await loadWorkspace(session.uid);
  return NextResponse.json({ owner: session.email, workspace });
}

/** Replace the saved workspace (POST, so the browser can also send it with sendBeacon). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await findById(session.uid);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) throw new WorkspaceError("Workspace too large.", 413);
    const data = sanitizeWorkspace(JSON.parse(raw));
    // Plot data is only kept for users who agreed to the data-use statement.
    if (data.plots.length && !hasConsent(user)) {
      return NextResponse.json({ error: "Consent required", code: "consent_required" }, { status: 403 });
    }
    const saved = await saveWorkspace({ uid: session.uid, email: session.email }, data);
    return NextResponse.json({ ok: true, ...saved });
  } catch (e) {
    if (e instanceof WorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof SyntaxError) return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
    console.error("[workspace] save failed:", (e as Error).message);
    return NextResponse.json({ error: "Could not save your plots." }, { status: 500 });
  }
}
