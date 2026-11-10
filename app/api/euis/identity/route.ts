import { ddsRoute, jsonBody } from "@/lib/server/ddsApi";
import { deleteIdentity, getIdentity, saveIdentity } from "@/lib/server/dds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The user's EUIS Acceptance identity, without the authentication key. */
export async function GET(req: Request) {
  return ddsRoute(req, (user) => getIdentity(user));
}

/** Save it. An empty `authKey` keeps the stored key. */
export async function PUT(req: Request) {
  return ddsRoute(req, async (user) => saveIdentity(user, await jsonBody(req)), { write: true });
}

export async function DELETE(req: Request) {
  return ddsRoute(req, (user) => deleteIdentity(user), { write: true });
}
