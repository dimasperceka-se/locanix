import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getSession } from "@/lib/server/session";
import { policyIntro, policySections, policyUpdated } from "@/lib/data";

export const metadata: Metadata = {
  title: "Privacy Policy — Locanix",
  description: "Locanix policies, terms, and conditions.",
};

export default async function PrivacyPage() {
  const session = await getSession();
  return (
    <>
      <Navbar authed={!!session} userName={session?.name} />

      {/* Title band */}
      <div className="bg-ink-gradient">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            PRIVACY POLICY
          </h1>
        </div>
      </div>

      <main className="bg-white">
        <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-ink">Welcome to Locanix.</h2>
          <p className="mt-6 leading-relaxed text-slate-600">{policyIntro}</p>

          <div className="mt-10 space-y-8">
            {policySections.map((s) => (
              <section key={s.heading} id={s.id} className="scroll-mt-24">
                <h3 className="text-base font-bold text-slate-900">{s.heading}</h3>
                <p className="mt-2 leading-relaxed text-slate-600">{s.body}</p>
              </section>
            ))}
          </div>

          <p className="mt-12 text-sm text-slate-700">
            <span className="font-bold">Last updated:</span> {policyUpdated}
          </p>
        </div>
      </main>

      <Footer />
    </>
  );
}
