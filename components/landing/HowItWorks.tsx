import { comingSoonAnalyses } from "@/lib/data";

const card = "flex flex-col gap-5 rounded-[18px] p-8";
const step = "font-mono text-[12px] tracking-[0.12em]";
const h3 = "m-0 font-display text-[26px] font-semibold tracking-[-0.02em]";

const checks = [
  { title: "Deforestation", body: "Tree-cover loss after 31 Dec 2020 inside the boundary." },
  { title: "Land legality", body: "Overlap with WDPA protected areas, with IUCN category." },
];

const outputs = [
  { title: "Review table", body: "Plots ranked by status, with a detail view per plot." },
  { title: "Audit-ready PDF", body: "Evidence for buyers, auditors and your due diligence statement." },
  { title: "AI insights", body: "What to fix first, written from your own plot data." },
];

const comingNext = comingSoonAnalyses.join(", ");

/** Placeholder until customer logos are available. */
export function Customers() {
  return (
    <section aria-label="Customers" className="border-y border-line">
      <div className="mx-auto flex max-w-[1360px] flex-wrap items-center justify-between gap-6 px-5 py-9 sm:px-10">
        <span className="text-[14px] text-muted">Used by exporters, estates and cooperatives</span>
        <div className="flex flex-wrap gap-4">
          {[1, 2, 3, 4].map((i) => (
            <span key={i} className="rounded-lg border border-dashed border-line-strong px-5 py-3 font-mono text-[12px] text-muted">
              [Customer logo]
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function HowItWorks() {
  return (
    <section id="how" className="mx-auto flex max-w-[1360px] flex-col gap-14 px-5 pt-20 pb-20 text-ink sm:px-10 md:pt-32 md:pb-28">
      <div className="flex max-w-[760px] flex-col gap-4.5">
        <span className="eyebrow text-accent-deep">How it works</span>
        <h2 className="m-0 font-display text-[clamp(36px,4.4vw,60px)] leading-[1.02] font-semibold tracking-[-0.035em]">
          One upload in. A clear verdict out.
        </h2>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-4">
        <div className={`${card} border border-line bg-white`}>
          <span className={`${step} text-muted`}>01 · INPUT</span>
          <h3 className={h3}>Add your plots</h3>
          <div className="flex flex-col items-center gap-2.5 rounded-xl border-[1.5px] border-dashed border-line-strong bg-paper px-5 py-7 text-center">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#0D0F0E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            <span className="text-[15px] font-semibold">Drop a GeoJSON file</span>
            <span className="text-[13px] text-muted">or draw the boundary on the map</span>
          </div>
          <p className="m-0 text-[15px] leading-[1.6] text-ink-soft">
            One plot or a whole supplier list. Every polygon is checked for self-intersections, area and perimeter before analysis
            starts.
          </p>
        </div>

        <div id="eudr" className={`${card} scroll-mt-6 bg-ink text-[#F2F2EE]`}>
          <span className={`${step} text-[#A9AFAB]`}>02 · ANALYSIS</span>
          <h3 className={h3}>Run EUDR checks</h3>
          <div className="flex flex-col gap-2.5">
            {checks.map((c) => (
              <div key={c.title} className="flex flex-col gap-1.5 rounded-xl border border-[#2E3431] p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-semibold">{c.title}</span>
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-ink">Live</span>
                </div>
                <span className="text-[14px] leading-[1.5] text-[#B9BFBB]">{c.body}</span>
              </div>
            ))}
          </div>
          <p className="m-0 text-[13px] leading-[1.6] text-[#A9AFAB]">Coming next: {comingNext}.</p>
        </div>

        <div className={`${card} border border-line bg-white`}>
          <span className={`${step} text-muted`}>03 · OUTPUT</span>
          <h3 className={h3}>Review and export</h3>
          <div className="flex flex-col">
            {outputs.map((o, i) => (
              <div key={o.title} className={`flex flex-col gap-1 py-3.5 ${i < outputs.length - 1 ? "border-b border-[#ECEBE5]" : ""}`}>
                <span className="text-[15px] font-semibold">{o.title}</span>
                <span className="text-[14px] leading-[1.5] text-ink-soft">{o.body}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
