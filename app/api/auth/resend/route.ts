import { NextResponse } from "next/server";
import { findByEmail, newToken, updateUser } from "@/lib/server/userStore";
import { sendVerificationEmail } from "@/lib/server/mailer";
import { appBaseUrl, sameOrigin } from "@/lib/server/http";

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
  const user = await findByEmail(email);

  // Always respond ok (don't leak which emails exist).
  if (!user || user.verified) return NextResponse.json({ ok: true });

  const verifyToken = newToken();
  await updateUser(user.id, { verifyToken });

  const link = `${appBaseUrl(req)}/api/auth/verify?token=${verifyToken}`;
  void sendVerificationEmail(user.email, user.name, link).catch((e) =>
    console.error("[mailer] resend failed:", (e as Error).message),
  );
  if (process.env.NODE_ENV !== "production") {
    console.log(`[dev] resent verification link for ${email}: ${link}`);
  }
  return NextResponse.json({ ok: true });
}
