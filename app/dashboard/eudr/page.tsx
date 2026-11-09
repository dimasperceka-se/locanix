"use client";

import { useState } from "react";
import Link from "next/link";
import { usePlotStore } from "@/lib/plotStore";
import { downloadPlotsExcel } from "@/lib/excel";
import { KIND_BADGE, plotView } from "@/lib/plotStatus";
import DdsModal from "@/components/DdsModal";
import { ui } from "@/components/workspace/ui";

const COLS = "grid grid-cols-[1.5fr_0.8fr_1fr_1.1fr_1fr_88px] items-center gap-2.5";

export default function ReportsPage() {
  const { plots, workspaceLoaded } = usePlotStore();
  const [ddsOpen, setDdsOpen] = useState(false);
  const rows = plots.map((p, i) => ({ plot: p, n: i + 1, v: plotView(p) }));
  const analyzed = rows.filter((r) => r.v.kind === "clear" || r.v.kind === "review").map((r) => r.plot);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className={ui.eyebrow}>EUDR analysis results</span>
          <h1 className={ui.h1}>Reports &amp; DDS</h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" disabled={!plots.length} onClick={() => downloadPlotsExcel(plots).catch(() => {})} className={ui.btnOutline}>
            Export Excel
          </button>
          <button
            type="button"
            disabled={!analyzed.length}
            title={analyzed.length ? "Due Diligence Statement for every analyzed plot" : "Run the EUDR analysis first"}
            onClick={() => setDdsOpen(true)}
            className={ui.btnDark}
          >
            Export DDS (PDF)
          </button>
        </div>
      </div>

      <section aria-label="Analysis results" className={`${ui.card} overflow-hidden`}>
        <div className="border-b border-line-soft px-4.5 py-3.5 text-[13px] text-muted">
          {analyzed.length} of {plots.length} plot{plots.length === 1 ? "" : "s"} analyzed. The DDS covers the analyzed plots.
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className={`${COLS} px-4.5 py-3 font-mono text-[11px] tracking-[0.06em] text-muted uppercase`}>
              <span>Plot</span>
              <span>Area</span>
              <span>Forest loss</span>
              <span>Protected</span>
              <span>Status</span>
              <span className="sr-only">Open</span>
            </div>
            {rows.map(({ plot, n, v }) => (
              <div key={plot.id} className={`${COLS} border-t border-[#F0EFEA] px-4.5 py-3.5 text-[14px]`}>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-semibold">{plot.name || `Plot ${n}`}</span>
                  <span className="text-[12px] text-muted">{v.coords}</span>
                </span>
                <span className="font-mono text-[13px]">{v.area}</span>
                <span className={v.lossWarn ? "font-semibold text-review-ink" : ""}>{v.loss}</span>
                <span className={v.protectedWarn ? "font-semibold text-review-ink" : ""}>{v.protectedArea}</span>
                <span>
                  <span className={`${ui.badge} ${KIND_BADGE[v.kind]}`}>{v.status}</span>
                </span>
                <Link href={`/dashboard/eudr/${plot.id}`} aria-label={`Open plot ${n} detail`} className="justify-self-end text-[13px] font-semibold text-ink no-underline hover:text-accent-deep">
                  Details →
                </Link>
              </div>
            ))}
            {!plots.length && !workspaceLoaded && (
              <p role="status" className="m-0 border-t border-[#F0EFEA] px-4.5 py-8 text-center text-[14px] text-muted">
                Loading your plots…
              </p>
            )}
            {!plots.length && workspaceLoaded && (
              <p className="m-0 border-t border-[#F0EFEA] px-4.5 py-8 text-center text-[14px] text-muted">
                No plots yet. <Link href="/dashboard" className="font-semibold text-ink">Add plots</Link> to see results here.
              </p>
            )}
          </div>
        </div>
      </section>

      <DdsModal open={ddsOpen} onClose={() => setDdsOpen(false)} plots={analyzed} />
    </>
  );
}
