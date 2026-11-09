import Navbar from "@/components/Navbar";
import { FREE_QUOTA_HA } from "@/lib/quota";
import Globe from "./Globe";

const features = [
  { label: "Plot screening", icon: <path d="M4 18 L9 5 L20 8 L17 20 Z" /> },
  {
    label: "Evidence review",
    icon: (
      <>
        <circle cx="11" cy="11" r="6" />
        <path d="M20 20l-4.5-4.5" />
      </>
    ),
  },
  {
    label: "Audit-ready PDF",
    icon: (
      <>
        <path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" />
        <path d="M14 3v5h5" />
      </>
    ),
  },
];

export default function Hero({ authed, userName }: { authed: boolean; userName?: string }) {
  return (
    <section id="top" className="overflow-hidden bg-ink-deep text-[#F2F2EE]">
      <div className="mx-auto max-w-[1424px] px-4 pt-6 sm:px-8">
        <Navbar variant="hero" authed={authed} userName={userName} />
      </div>

      <div className="mx-auto grid max-w-[1424px] grid-cols-[repeat(auto-fit,minmax(min(100%,520px),1fr))] items-center gap-8 px-5 pt-14 sm:px-8">
        <div className="flex flex-col gap-7">
          <h1 className="m-0 font-display text-[clamp(52px,6.4vw,92px)] leading-[0.98] font-semibold tracking-[-0.045em] text-[#F7F7F4]">
            Know which plots are safe to ship.
          </h1>
          <p className="m-0 max-w-[470px] text-[20px] leading-[1.5] text-[#C9CCCA]">
            Locanix checks every plot boundary for forest loss after 2020 and overlap with protected areas, and shows which
            ones need a second look before you file.
          </p>
          <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
            <a
              href="/analyze"
              className="inline-flex min-h-12 items-center rounded-full bg-accent px-5.5 text-[16px] font-semibold text-ink no-underline hover:bg-[#5BE59A]"
            >
              Analyze {FREE_QUOTA_HA} ha free →
            </a>
            <a href="#how" className="text-[16px] font-semibold text-accent no-underline hover:text-[#5BE59A]">
              See how it works →
            </a>
          </div>
        </div>

        <div className="relative w-full max-w-[640px] justify-self-center">
          <div role="img" aria-label="Rotating globe made of dots, with plot markers across Indonesia" className="relative aspect-square w-full">
            <Globe />
          </div>
          <div className="absolute right-0 bottom-[6%] flex w-[min(290px,78%)] flex-col gap-2.5 rounded-xl border border-[#343A3F] bg-ink-mid px-4.5 py-4 shadow-[0_20px_40px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-[12px] text-[#A9AFAB]">Plot B · Riau, ID</span>
              <span className="rounded-full bg-[#F2A65A] px-2.5 py-0.5 text-[12px] font-semibold text-[#2A1504]">Needs review</span>
            </div>
            <span className="text-[15px] leading-[1.45] text-[#F2F2EE]">
              3.2 ha overlaps a protected area (IUCN II). No forest loss after 2020.
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-[1424px] flex-wrap gap-x-8 gap-y-3 px-5 pt-6 pb-12 text-[16px] text-[#E4E6E4] sm:px-8">
        {features.map((f) => (
          <span key={f.label} className="inline-flex items-center gap-2.5">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#A9AFAB"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              {f.icon}
            </svg>
            {f.label}
          </span>
        ))}
      </div>
    </section>
  );
}
