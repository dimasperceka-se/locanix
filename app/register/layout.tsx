import { redirect } from "next/navigation";
import { getSession } from "@/lib/server/session";

/** Already signed in: "Try Locanix" and other sign-up links lead to the workspace. */
export default async function RegisterLayout({ children }: { children: React.ReactNode }) {
  if (await getSession()) redirect("/dashboard");
  return <>{children}</>;
}
