import { NextResponse } from "next/server";
import { createUser, findByEmail, newToken } from "@/lib/server/userStore";
import { hashPassword } from "@/lib/server/password";
import { sendVerificationEmail } from "@/lib/server/mailer";
import { appBaseUrl, sameOrigin } from "@/lib/server/http";

export const runtime = "nodejs";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: Request) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");
  const confirm = body.confirm === undefined ? password : String(body.confirm);

  if (!name) return bad("Please enter your name.");
  if (!EMAIL_RE.test(email)) return bad("Please enter a valid email address.");
  if (password.length < 8)
    return bad("Password must be at least 8 characters.");
  if (password !== confirm) return bad("Passwords do not match.");

  if (await findByEmail(email)) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 },
    );
  }

  const verifyToken = newToken();
  await createUser({
    name,
    email,
    passwordHash: hashPassword(password),
    verifyToken,
  });

  const link = `${appBaseUrl(req)}/api/auth/verify?token=${verifyToken}`;

  // Fire-and-forget so registration returns instantly (SMTP can take seconds).
  void sendVerificationEmail(email, name, link).catch((e) =>
    console.error("[mailer] verification email failed:", (e as Error).message),
  );
  if (process.env.NODE_ENV !== "production") {
    console.log(`[dev] verification link for ${email}: ${link}`);
  }

  return NextResponse.json({ ok: true, email });
}

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}
