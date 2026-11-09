import { notFound, redirect } from "next/navigation";
import Navbar from "@/components/Navbar";
import { getSession } from "@/lib/server/session";
import { SHOW_AGRIPLOT } from "@/lib/data";

export const metadata = { title: "AgriPlot Map — Locanix" };

// The AgriPlot map is served by the sustainit app on the same VM.
const AGRIPLOT_URL = "https://app.sustainit.id/agri-plot-map";

export default async function AgriPlotPage() {
  if (!SHOW_AGRIPLOT) notFound();
  const session = await getSession();
  if (!session) redirect("/login?next=/agriplot");
  return (
    <div className="flex h-screen flex-col">
      <Navbar authed={!!session} userName={session?.name} />
      <iframe
        src={AGRIPLOT_URL}
        title="AgriPlot Map"
        className="min-h-0 w-full flex-1 border-0"
        allow="geolocation; clipboard-write"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
