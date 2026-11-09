import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { findByEmail, newToken, updateUser } from "@/lib/server/userStore";
import { sendPasswordResetEmail } from "@/lib/server/mailer";
import { appBaseUrl, sameOrigin } from "@/lib/server/http";

export const runtime = "nodejs";

const RESET_TTL_MS = 60 * 60 * 1000; // link valid for 1 hour
const RESEND_AFTER_MS = 60 * 1000; // at most one email per minute per account

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
  const user = email ? await findByEmail(email) : null;

  // Always respond ok (don't leak which emails exist).
  if (!user || Date.now() - (user.resetRequestedAt ?? 0) < RESEND_AFTER_MS) {
    return NextResponse.json({ ok: true });
  }

  const token = newToken();
  await updateUser(user.id, {
    resetTokenHash: createHash("sha256").update(token).digest("hex"),
    resetExpires: Date.now() + RESET_TTL_MS,
    resetRequestedAt: Date.now(),
  });

  const link = `${appBaseUrl(req)}/reset-password?token=${token}`;
  void sendPasswordResetEmail(user.email, user.name, link).catch((e) =>
    console.error("[mailer] password reset email failed:", (e as Error).message),
  );
  if (process.env.NODE_ENV !== "production") {
    console.log(`[dev] password reset link for ${user.email}: ${link}`);
  }
  return NextResponse.json({ ok: true });
}
