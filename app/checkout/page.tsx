import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import CheckoutClient from "@/components/CheckoutClient";

export default async function CheckoutPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/checkout");
  return <CheckoutClient />;
}
