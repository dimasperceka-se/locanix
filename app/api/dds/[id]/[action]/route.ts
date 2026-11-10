import { NextResponse } from "next/server";
import { ddsRoute, jsonBody } from "@/lib/server/ddsApi";
import { refreshStatement, submitStatement, withdrawStatement } from "@/lib/server/dds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A submit waits for EUIS (up to 90 s) before answering.
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string; action: string }> };

/** submit (`{ confirm: true }`), refresh, withdraw. */
export async function POST(req: Request, { params }: Ctx) {
  const { id, action } = await params;
  if (action === "submit") return ddsRoute(req, async (user) => submitStatement(user, id, await jsonBody(req)), { write: true });
  if (action === "refresh") return ddsRoute(req, (user) => refreshStatement(user, id), { write: true });
  if (action === "withdraw") return ddsRoute(req, (user) => withdrawStatement(user, id), { write: true });
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
