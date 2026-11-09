import LazyPreviewMap from "./LazyPreviewMap";
import { PREVIEW_PARK, PREVIEW_PLOTS, PREVIEW_REGION, lossLabel, needsReview, protectedLabel, reviewNote } from "./preview-data";

/**
 * The review screen with real results: four sample plots next to Tesso Nilo National
 * Park on satellite imagery, and the Locanix analysis results for them.
 */

const cols = "grid grid-cols-[28px_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,1.1fr)] gap-2 px-5 sm:grid-cols-[40px_1.1fr_0.8fr_1.2fr] sm:gap-2.5 sm:px-6";
const rows = [...PREVIEW_PLOTS].sort((a, b) => Number(needsReview(b)) - Number(needsReview(a)));
const totalHa = PREVIEW_PLOTS.reduce((s, p) => s + p.areaHa, 0);
const reviewCount = PREVIEW_PLOTS.filter(needsReview).length;

export default function ProductPreview() {
  return (
    <section aria-label="Product preview" className="mx-auto max-w-[1360px] px-5 py-16 sm:px-10 md:py-24">
      <div className="flex flex-wrap overflow-hidden rounded-[20px] border border-line bg-white shadow-[0_30px_80px_rgba(13,15,14,0.08)]">
        <div
          role="img"
          aria-label={`Satellite map of ${PREVIEW_PLOTS.length} plots in ${PREVIEW_REGION} next to ${PREVIEW_PARK.name}; ${reviewCount} need review`}
          className="relative min-h-[440px] min-w-0 flex-[1_1_520px] bg-[#1E2A22]"
        >
          <LazyPreviewMap />
          <div className="pointer-events-none absolute bottom-4.5 left-4.5 z-10 flex flex-wrap gap-3.5 rounded-[10px] border border-line bg-white px-3.5 py-2.5 text-[13px] text-ink">
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-[3px] border-2 border-white bg-[#45594A] ring-1 ring-black/25" />
              Clear
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-[3px] border-2 border-[#F2A65A] bg-[#F8DEC4]" />
              Needs review
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-[1_1_420px] flex-col text-ink">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ECEBE5] px-6 py-5">
            <div className="flex flex-col gap-0.5">
              <span className="font-display text-[17px] font-semibold">Supplier plots — {PREVIEW_REGION}</span>
              <span className="text-[13px] text-muted">
                {PREVIEW_PLOTS.length} plots · {totalHa.toFixed(2)} ha · {reviewCount} need review
              </span>
            </div>
            <span className="rounded-full border border-line-strong px-3.5 py-2 text-[13px] font-semibold">Export PDF</span>
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[320px]">
              <div className={`${cols} py-3 font-mono text-[11px] tracking-[0.06em] text-muted uppercase`}>
                <span>ID</span>
                <span>Status</span>
                <span>Forest loss</span>
                <span>Protected</span>
              </div>
              {rows.map((p) => {
                const review = needsReview(p);
                return (
                  <div key={p.id} className={`${cols} items-center border-t border-[#F0EFEA] py-3.5 text-[14px]`}>
                    <span className="font-mono">{p.id}</span>
                    <span
                      className={`justify-self-start rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                        review ? "bg-review-bg text-review-ink" : "bg-clear-bg text-clear-ink"
                      }`}
                    >
                      {review ? "Needs review" : "Clear"}
                    </span>
                    <span className={p.risk === "high" ? "font-semibold text-review-ink" : undefined}>{lossLabel(p)}</span>
                    <span className={p.wdpaStatus !== "compliant" ? "font-semibold text-review-ink" : undefined}>{protectedLabel(p)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mx-6 mt-auto mb-6 flex flex-col gap-2 pt-4">
            <p className="m-0 rounded-[10px] bg-[#F4F4EF] px-4 py-3.5 text-[14px] leading-[1.55] text-[#3A403C]">{reviewNote()}</p>
            <p className="m-0 text-[12px] leading-[1.5] text-muted">
              Sample plots, analyzed by Locanix. Forest loss 2021–2024 from GFW, JRC and SBTN; protected areas from WDPA.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
