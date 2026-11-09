import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";

/**
 * Server gate: any signed-in user — free tier included — gets the dashboard,
 * results and DDS export. Quota is enforced by the analysis API itself.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/login?next=/dashboard");
  return <>{children}</>;
}
