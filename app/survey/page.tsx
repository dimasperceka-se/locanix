import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";
import SurveyForm from "@/components/SurveyForm";

export default async function SurveyPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/survey");
  return <SurveyForm />;
}
