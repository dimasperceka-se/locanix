import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/server/http";
import { sendContactEmail } from "@/lib/server/mailer";

export const runtime = "nodejs";

const isEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const firstName = String(body.firstName ?? "").trim().slice(0, 100);
  const lastName = String(body.lastName ?? "").trim().slice(0, 100);
  const email = String(body.email ?? "").trim().slice(0, 200);
  const phone = String(body.phone ?? "").trim().slice(0, 40);
  const message = String(body.message ?? "").trim().slice(0, 4000);
  const agree = Boolean(body.agree);

  if (!firstName || !isEmail(email)) {
    return NextResponse.json(
      { error: "Please enter your name and a valid email address." },
      { status: 400 },
    );
  }
  if (!agree) {
    return NextResponse.json(
      { error: "Please agree to the Terms & Conditions." },
      { status: 400 },
    );
  }

  try {
    await sendContactEmail({ firstName, lastName, email, phone, message });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[contact] send failed:", (e as Error).message);
    return NextResponse.json(
      { error: "Couldn't send your message — please try again." },
      { status: 500 },
    );
  }
}
