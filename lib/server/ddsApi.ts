import { NextResponse } from "next/server";
import { getSession } from "./session";
import { sameOrigin } from "./http";
import { findById } from "./userStore";
import { DdsError } from "./ddsStore";

export type ApiUser = { uid: string; name: string; email: string };

const MAX_BODY = 100 * 1024;

/** Signed-in user, same-origin check for writes, and DdsError → JSON. */
export async function ddsRoute(req: Request, fn: (user: ApiUser) => Promise<unknown>, { write = false } = {}) {
  if (write && !sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const session = await getSession();
  if (!session || !(await findById(session.uid))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await fn({ uid: session.uid, name: session.name, email: session.email }));
  } catch (e) {
    if (e instanceof DdsError) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
    console.error("[dds]", (e as Error)?.stack || e);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
}

export async function jsonBody(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (raw.length > MAX_BODY) throw new DdsError("Request too large.", 413);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    throw new DdsError("Invalid JSON.");
  }
}
