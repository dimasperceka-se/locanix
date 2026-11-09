import { NextResponse } from "next/server";
import { findByEmail } from "@/lib/server/userStore";
import { verifyPassword } from "@/lib/server/password";
import { setSession } from "@/lib/server/session";
import { sameOrigin } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  const user = await findByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  if (!user.verified) {
    return NextResponse.json(
      { error: "Please verify your email first — check your inbox.", code: "unverified" },
      { status: 403 },
    );
  }

  await setSession({ uid: user.id, name: user.name, email: user.email });
  return NextResponse.json({ ok: true });
}
