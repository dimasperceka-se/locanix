import { ddsRoute, jsonBody } from "@/lib/server/ddsApi";
import { deleteDraft, getStatement, updateDraft } from "@/lib/server/dds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  return ddsRoute(req, (user) => getStatement(user, id));
}

/** Edit a draft: `{ details?, removePlotIds? }`. */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  return ddsRoute(req, async (user) => updateDraft(user, id, await jsonBody(req)), { write: true });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  return ddsRoute(req, (user) => deleteDraft(user, id), { write: true });
}
