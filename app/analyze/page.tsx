import type { Metadata } from "next";
import AnalysisTypes from "@/components/AnalysisTypes";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { getSession } from "@/lib/server/session";

export const metadata: Metadata = {
  title: "Analyze plots — Locanix",
  description: "Upload plot boundaries and run the EUDR deforestation and land legality checks.",
};

export default async function AnalyzePage() {
  const session = await getSession();
  return (
    <>
      <Navbar authed={!!session} userName={session?.name} />
      <main>
        <AnalysisTypes authed={!!session} />
      </main>
      <Footer />
    </>
  );
}
