import { ddsRoute } from "@/lib/server/ddsApi";
import { testIdentity } from "@/lib/server/dds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Run the EUIS echo test with the saved identity. */
export async function POST(req: Request) {
  return ddsRoute(req, (user) => testIdentity(user), { write: true });
}
