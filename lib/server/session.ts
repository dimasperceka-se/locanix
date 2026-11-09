import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "locanix_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type SessionData = { uid: string; name: string; email: string };

// Fail closed: never run production with the public dev fallback signing key.
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET must be set in production");
}

const secret = () => process.env.SESSION_SECRET || "dev-locanix-insecure-secret";

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function serialize(data: SessionData): string {
  const payload = Buffer.from(JSON.stringify(data)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parse(token: string | undefined): SessionData | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionData;
  } catch {
    return null;
  }
}

/** Read the current session (safe in Server Components and Route Handlers). */
export async function getSession(): Promise<SessionData | null> {
  const store = await cookies();
  return parse(store.get(SESSION_COOKIE)?.value);
}

/** Write the session cookie (Route Handlers / Server Actions only). */
export async function setSession(data: SessionData): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, serialize(data), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
