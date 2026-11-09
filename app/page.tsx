import Footer from "@/components/Footer";
import FinalCta from "@/components/landing/FinalCta";
import Hero from "@/components/landing/Hero";
import HowItWorks, { Customers } from "@/components/landing/HowItWorks";
import Pricing from "@/components/landing/Pricing";
import ProductPreview from "@/components/landing/ProductPreview";
import { getSession } from "@/lib/server/session";

export default async function Home() {
  const session = await getSession();
  return (
    <div className="bg-paper leading-[normal] text-ink">
      <main>
        <Hero authed={!!session} userName={session?.name} />
        <ProductPreview />
        <Customers />
        <HowItWorks />
        <Pricing />
        <FinalCta authed={!!session} />
      </main>
      <Footer />
    </div>
  );
}
