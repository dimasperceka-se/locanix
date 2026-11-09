import type { Metadata } from "next";
import { Recycle, ShieldCheck, Users, Zap } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { getSession } from "@/lib/server/session";

export const metadata: Metadata = {
  title: "About Us — Locanix",
  description: "Locanix — digital sustainability & compliance.",
};

const VALUES = [
  {
    icon: ShieldCheck,
    title: "Technology Excellence",
    desc: "Cutting-edge digital platforms using cloud-based technologies for scalable sustainability solutions.",
  },
  {
    icon: Users,
    title: "Strategic Partnership",
    desc: "Collaborating with corporate sustainability teams to align technology with ESG strategies.",
  },
  {
    icon: Zap,
    title: "Innovation-Driven",
    desc: "Leveraging blockchain, AI, and analytics for real-time ESG monitoring and compliance.",
  },
  {
    icon: Recycle,
    title: "Impact-Focused",
    desc: "Measuring success through verifiable sustainability outcomes and ESG commitments.",
  },
];

const BADGES = ["Technology Leader", "ESG Certified", "Compliance Ready"];

export default async function AboutPage() {
  const session = await getSession();
  return (
    <>
      <Navbar authed={!!session} userName={session?.name} />

      {/* Title band */}
      <div className="bg-ink-gradient">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            About Us
          </h1>
        </div>
      </div>

      <main className="bg-white">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            {/* Left: mission + values */}
            <div className="space-y-8">
              <div className="space-y-4">
                <h2 className="text-4xl font-extrabold text-ink">Our Mission</h2>
                <p className="text-lg leading-relaxed text-slate-600">
                  Locanix transforms environmental sustainability
                  through cutting-edge digital technology solutions, empowering
                  enterprises to achieve verified ESG compliance and supply chain
                  transparency.
                </p>
                <p className="leading-relaxed text-slate-500">
                  We combine advanced software development capabilities with deep
                  sustainability consulting expertise, delivering end-to-end
                  solutions for EUDR, CSRD, and global ESG regulatory
                  requirements.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                {VALUES.map((v) => (
                  <div
                    key={v.title}
                    className="space-y-2 rounded-xl border border-slate-100 p-4 transition-shadow hover:shadow-md"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-accent/10 text-accent">
                      <v.icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <h3 className="font-semibold text-ink">{v.title}</h3>
                    <p className="text-sm text-slate-500">{v.desc}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                {BADGES.map((b) => (
                  <span
                    key={b}
                    className="rounded-full bg-ink/5 px-3 py-1 text-xs font-semibold text-ink"
                  >
                    {b}
                  </span>
                ))}
              </div>
            </div>

            {/* Right: image */}
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=600&h=400"
                alt="Team collaborating on digital sustainability and compliance"
                className="w-full rounded-2xl shadow-xl"
              />
              <div className="absolute -left-6 -top-6 rounded-xl border border-slate-100 bg-white p-4 shadow-lg">
                <span className="flex items-center gap-3">
                  <span className="h-3 w-3 animate-pulse rounded-full bg-accent" />
                  <span className="text-sm font-medium text-ink">
                    Digital Excellence
                  </span>
                </span>
              </div>
              <div className="absolute -bottom-6 -right-6 rounded-xl border border-slate-100 bg-white p-4 shadow-lg">
                <span className="flex items-center gap-3">
                  <span className="h-3 w-3 animate-pulse rounded-full bg-ink" />
                  <span className="text-sm font-medium text-ink">
                    Compliance Ready
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
