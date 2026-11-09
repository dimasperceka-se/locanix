import { NextResponse } from "next/server";
import { clearSession } from "@/lib/server/session";
import { sameOrigin } from "@/lib/server/http";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!sameOrigin(req))
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  await clearSession();
  return NextResponse.json({ ok: true });
}
