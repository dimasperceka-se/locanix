/** Static illustration of the review screen: plot map on the left, ranked table on the right. */

type Row = { id: string; review: boolean; loss: string; protectedArea: string; flag: "loss" | "protected" | null };

const rows: Row[] = [
  { id: "B", review: true, loss: "0 ha", protectedArea: "3.2 ha overlap", flag: "protected" },
  { id: "C", review: true, loss: "0.4 ha", protectedArea: "None", flag: "loss" },
  { id: "A", review: false, loss: "0 ha", protectedArea: "None", flag: null },
  { id: "D", review: false, loss: "0 ha", protectedArea: "None", flag: null },
];

const cols = "grid grid-cols-[40px_1.3fr_1fr_1fr] gap-2.5 px-6";

export default function ProductPreview() {
  return (
    <section aria-label="Product preview" className="mx-auto max-w-[1360px] px-5 py-16 sm:px-10 md:py-24">
      <div
        role="img"
        aria-label="Locanix review screen: a map of four plot boundaries next to a table ranking them by status, with two flagged for review"
        className="flex flex-wrap overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_30px_80px_rgba(13,15,14,0.08)]"
      >
        <div className="relative min-h-[440px] min-w-0 flex-[1_1_520px] bg-[#EEF0EA]">
          <svg viewBox="0 0 600 460" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden="true">
            <g fill="none" stroke="#D6DAD1" strokeWidth="1">
              <path d="M-20 50 C 120 10, 220 90, 340 46 S 540 6, 640 60" />
              <path d="M-20 110 C 130 70, 230 150, 350 106 S 550 66, 640 120" />
              <path d="M-20 170 C 140 130, 240 210, 360 166 S 560 126, 640 180" />
              <path d="M-20 230 C 150 190, 250 270, 370 226 S 570 186, 640 240" />
              <path d="M-20 290 C 160 250, 260 330, 380 286 S 580 246, 640 300" />
              <path d="M-20 350 C 170 310, 270 390, 390 346 S 590 306, 640 360" />
              <path d="M-20 410 C 180 370, 280 450, 400 406 S 600 366, 640 420" />
            </g>
            <path d="M380 0 C 400 120, 470 160, 600 170 L600 0 Z" fill="#DCE6D6" />
            <text x="470" y="60" fontFamily="JetBrains Mono, monospace" fontSize="11" fill="#5C6A58">
              Protected area
            </text>
            <polygon points="70,120 190,80 250,170 140,230" fill="#0D0F0E" fillOpacity="0.06" stroke="#0D0F0E" strokeWidth="1.8" strokeLinejoin="round" />
            <polygon points="300,90 420,70 450,190 330,200" fill="#E07A1F" fillOpacity="0.16" stroke="#C2620F" strokeWidth="2.2" strokeLinejoin="round" />
            <polygon points="110,290 220,260 260,360 150,390" fill="#E07A1F" fillOpacity="0.16" stroke="#C2620F" strokeWidth="2.2" strokeLinejoin="round" />
            <polygon points="330,270 470,250 500,370 360,400" fill="#0D0F0E" fillOpacity="0.06" stroke="#0D0F0E" strokeWidth="1.8" strokeLinejoin="round" />
            <g fontFamily="JetBrains Mono, monospace" fontSize="12" fill="#0D0F0E">
              <text x="130" y="160">A</text>
              <text x="368" y="146">B</text>
              <text x="178" y="334">C</text>
              <text x="410" y="330">D</text>
            </g>
          </svg>
          <div className="absolute bottom-4.5 left-4.5 flex flex-wrap gap-3.5 rounded-[10px] border border-line bg-white px-3.5 py-2.5 text-[13px] text-ink">
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-[3px] border-2 border-ink" />
              Clear
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-[3px] border-2 border-review bg-[#F8DEC4]" />
              Needs review
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-[1_1_420px] flex-col text-ink">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ECEBE5] px-6 py-5">
            <div className="flex flex-col gap-0.5">
              <span className="font-display text-[17px] font-semibold">Supplier plots — Riau</span>
              <span className="text-[13px] text-muted">4 plots · 162.9 ha · 2 need review</span>
            </div>
            <span className="rounded-full border border-line-strong px-3.5 py-2 text-[13px] font-semibold">Export PDF</span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[400px]">
              <div className={`${cols} py-3 font-mono text-[11px] tracking-[0.06em] text-muted uppercase`}>
                <span>ID</span>
                <span>Status</span>
                <span>Forest loss</span>
                <span>Protected</span>
              </div>
              {rows.map((r) => (
                <div key={r.id} className={`${cols} items-center border-t border-[#F0EFEA] py-3.5 text-[14px]`}>
                  <span className="font-mono">{r.id}</span>
                  <span
                    className={`justify-self-start rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                      r.review ? "bg-review-bg text-review-ink" : "bg-clear-bg text-clear-ink"
                    }`}
                  >
                    {r.review ? "Needs review" : "Clear"}
                  </span>
                  <span className={r.flag === "loss" ? "font-semibold text-review-ink" : undefined}>{r.loss}</span>
                  <span className={r.flag === "protected" ? "font-semibold text-review-ink" : undefined}>{r.protectedArea}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mx-6 mt-auto mb-6 rounded-[10px] bg-[#F4F4EF] px-4 py-3.5 text-[14px] leading-[1.55] text-[#3A403C]">
            Plot B overlaps a protected area (IUCN category II). Plot C shows forest loss after 31 Dec 2020. Resolve both before
            filing your due diligence statement.
          </div>
        </div>
      </div>
    </section>
  );
}
