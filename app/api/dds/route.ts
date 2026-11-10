import { ddsRoute, jsonBody } from "@/lib/server/ddsApi";
import { createDraft, ddsOverview } from "@/lib/server/dds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Statements, identity status and the DDS allowance. */
export async function GET(req: Request) {
  return ddsRoute(req, (user) => ddsOverview(user));
}

/** New draft from Clear plots of the saved workspace: `{ plotIds: number[] }`. */
export async function POST(req: Request) {
  return ddsRoute(req, async (user) => ({ statement: await createDraft(user, await jsonBody(req)) }), { write: true });
}
