import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { sameOrigin } from "@/lib/server/http";
import { findById, updateUser } from "@/lib/server/userStore";
import { CONSENT_VERSION, hasConsent } from "@/lib/consent";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await findById(session.uid);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ accepted: hasConsent(user), version: CONSENT_VERSION });
}

/** Record that the user agreed to the current data-use statement. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { version?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  // An outdated version means the page showed old wording — ask again.
  if (body.version !== CONSENT_VERSION) {
    return NextResponse.json({ error: "Please review the latest statement." }, { status: 409 });
  }
  if (!(await findById(session.uid))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await updateUser(session.uid, {
    dataConsent: { version: CONSENT_VERSION, acceptedAt: Date.now() },
  });
  return NextResponse.json({ accepted: true });
}
