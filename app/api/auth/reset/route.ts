import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { findByResetTokenHash, updateUser } from "@/lib/server/userStore";
import { hashPassword } from "@/lib/server/password";
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

  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  const confirm = body.confirm === undefined ? password : String(body.confirm);

  if (password.length < 8) return bad("Password must be at least 8 characters.");
  if (password !== confirm) return bad("Passwords do not match.");

  const user = /^[a-f0-9]{48}$/.test(token)
    ? await findByResetTokenHash(createHash("sha256").update(token).digest("hex"))
    : null;
  if (!user) return bad("This reset link is invalid or has expired. Please request a new one.");

  // The link was delivered to this inbox, so it also confirms the email address.
  await updateUser(user.id, {
    passwordHash: hashPassword(password),
    resetTokenHash: null,
    resetExpires: null,
    verified: true,
    verifyToken: null,
  });
  return NextResponse.json({ ok: true });
}

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}
