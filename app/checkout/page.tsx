import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import CheckoutClient from "@/components/CheckoutClient";

type Params = Promise<Record<string, string | string[] | undefined>>;

export default async function CheckoutPage({ searchParams }: { searchParams: Params }) {
  const session = await getSession();
  if (!session) redirect("/login?next=/checkout");
  // ?plots=1,4 — the plots checked on the Plots page (workspace plot ids).
  const raw = (await searchParams).plots;
  const ids = typeof raw === "string" ? raw.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 1000) : [];
  return <CheckoutClient selectedIds={ids.length ? ids : null} />;
}
