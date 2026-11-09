import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import ReportDownload from "@/components/ReportDownload";

export default async function ReportDownloadPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/reports/download");
  return <ReportDownload />;
}
