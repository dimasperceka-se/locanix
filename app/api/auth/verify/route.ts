import { NextResponse } from "next/server";
import { findByToken, updateUser } from "@/lib/server/userStore";
import { appBaseUrl } from "@/lib/server/http";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const base = appBaseUrl(req);

  if (token) {
    const user = await findByToken(token);
    if (user) {
      await updateUser(user.id, { verified: true, verifyToken: null });
      return NextResponse.redirect(`${base}/login?verified=1`);
    }
  }
  return NextResponse.redirect(`${base}/login?verified=0`);
}
