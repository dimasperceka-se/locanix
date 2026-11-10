"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, Shapes } from "lucide-react";
import { analysisByKey } from "@/lib/data";
import { usePlotStore } from "@/lib/plotStore";
import type { FeatureCollection, Plot } from "@/lib/geo";
import { runEudr, validateGeometry } from "@/lib/analysisClient";
import { persistPlots } from "@/lib/plotsClient";
import { authorize } from "@/lib/usageClient";
import { FREE_QUOTA_HA } from "@/lib/quota";
import { KIND_BADGE, KIND_TONE, plotView, type PlotKind } from "@/lib/plotStatus";
import AddPlotModal from "@/components/AddPlotModal";
import AnalyzingOverlay from "@/components/AnalyzingOverlay";
import { useConsentGate } from "@/components/ConsentGate";
import DdsModal from "@/components/DdsModal";
import Popup from "@/components/Popup";
import PlotMiniMap from "@/components/workspace/PlotMiniMap";
import { ui } from "@/components/workspace/ui";

type Filter = "all" | PlotKind;
const COLS = "grid grid-cols-[28px_minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,0.8fr)_minmax(0,1fr)_max-content] items-center gap-2.5";

export default function DashboardPage() {
  const router = useRouter();
  const { plots, userName, analyses, addPlots, updatePlots, setEudrDone, workspaceLoaded } = usePlotStore();
  const eudrSteps = analyses.map((k) => {
    const a = analysisByKey(k);
    return { label: a.title, icon: a.icon };
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [addRunning, setAddRunning] = useState(false);
  const [addDone, setAddDone] = useState(false);
  const [eudrRunning, setEudrRunning] = useState(false);
  const [eudrAnimDone, setEudrAnimDone] = useState(false);
  const [ddsPlots, setDdsPlots] = useState<Plot[] | null>(null);
  // Over-quota selection: what's left on the free tier or the user's plan.
  type QuotaBlock = { paid: boolean; remainingHa: number };
  const [quotaBlock, setQuotaBlock] = useState<QuotaBlock | null>(null);
  const [runError, setRunError] = useState("");
  const quotaAfterRun = useRef<QuotaBlock | null>(null);
  // Plots the user unchecked. Tracking exclusions (not selections) keeps every
  // valid plot — including ones added later — checked by default.
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [focusId, setFocusId] = useState<number | null>(null);
  const { ensureConsent, consentModal } = useConsentGate();
  const openAddPlot = async () => {
    if (await ensureConsent()) setModalOpen(true);
  };

  const views = useMemo(() => new Map(plots.map((p) => [p.id, plotView(p)])), [plots]);
  const view = (p: Plot) => views.get(p.id) ?? plotView(p);

  const { selectable, selected, selectedArea } = useMemo(() => {
    const ok = plots.filter((p) => p.isValid);
    const sel = ok.filter((p) => !excluded.has(p.id));
    return { selectable: ok, selected: sel, selectedArea: sel.reduce((s, p) => s + p.areaHa, 0) };
  }, [plots, excluded]);
  const allSelected = selectable.length > 0 && selected.length === selectable.length;

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: plots.length, review: 0, clear: 0, pending: 0, invalid: 0 };
    for (const p of plots) c[(views.get(p.id) ?? plotView(p)).kind]++;
    return c;
  }, [plots, views]);
  const totalArea = plots.reduce((s, p) => s + p.areaHa, 0);

  const rows = plots.filter((p) => filter === "all" || view(p).kind === filter);
  // Focus the clicked plot; otherwise the first one needing review, as in the design.
  const focus =
    plots.find((p) => p.id === focusId) ?? rows.find((p) => view(p).kind === "review") ?? rows[0] ?? plots[0];

  const toggle = (id: number) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setExcluded(allSelected ? new Set(selectable.map((p) => p.id)) : new Set());

  const handleAddPlot = async (fc: FeatureCollection, filename: string) => {
    setModalOpen(false);
    setAddDone(false);
    setAddRunning(true);
    try {
      const added = await validateGeometry(fc, filename);
      addPlots(added);
      void persistPlots(added, "upload");
    } finally {
      setAddDone(true);
    }
  };

  const startEudr = async () => {
    if (!selected.length || !(await ensureConsent())) return;
    setRunError("");
    // Check the quota first, so an over-quota selection never starts a run.
    const auth = await authorize(selected);
    if (!auth) {
      setRunError("We couldn't check your quota. Please try again.");
      return;
    }
    const quota = { paid: auth.paid, remainingHa: auth.remainingHa };
    if (auth.decision === "payment") {
      setQuotaBlock(quota);
      return;
    }
    quotaAfterRun.current = null;
    setEudrAnimDone(false);
    setEudrRunning(true);
    try {
      // Only the checked plots are analyzed; the others keep their results.
      const run = await runEudr(selected, analyses);
      if (run.paymentRequired) {
        // Quota ran out between the check and the run — keep current results.
        quotaAfterRun.current = quota;
        return;
      }
      const byId = new Map(run.plots.map((p) => [p.id, p]));
      updatePlots(plots.map((p) => byId.get(p.id) ?? p));
      setEudrDone(true);
    } finally {
      setEudrAnimDone(true);
    }
  };

  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "review", label: "Needs review" },
    { key: "clear", label: "Clear" },
    ...(counts.pending ? [{ key: "pending" as const, label: "Not analyzed" }] : []),
    { key: "invalid", label: "Invalid" },
  ];

  const stats: { label: string; value: React.ReactNode; tone?: string }[] = [
    { label: "Plots", value: plots.length },
    {
      label: "Total area",
      value: (
        <>
          {totalArea.toFixed(2)} <span className="text-[15px] text-muted">ha</span>
        </>
      ),
    },
    { label: "Clear", value: counts.clear, tone: "text-clear-ink" },
    { label: "Needs review", value: counts.review, tone: "text-review-ink" },
    ...(counts.pending ? [{ label: "Not analyzed", value: counts.pending }] : []),
    { label: "Invalid geometry", value: counts.invalid },
  ];

  const fv = focus ? view(focus) : null;
  const tone = fv ? KIND_TONE[fv.kind] : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className={ui.eyebrow}>Workspace · {userName}</span>
          <h1 className={ui.h1}>Plots</h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" onClick={openAddPlot} className={ui.btnOutline}>
            + Add plots
          </button>
          <button type="button" onClick={startEudr} disabled={selected.length === 0} className={ui.btnDark}>
            Run EUDR analysis
          </button>
        </div>
      </div>
      {runError && (
        <p role="alert" className="-mt-2 text-[14px] font-medium text-red-700">
          {runError}
        </p>
      )}

      {plots.length === 0 && !workspaceLoaded ? (
        <p role="status" className="m-0 py-16 text-center text-[14px] text-muted">
          Loading your plots…
        </p>
      ) : plots.length === 0 ? (
        <div className={`${ui.card} mx-auto mt-6 flex w-full max-w-md flex-col items-center gap-2 p-10 text-center`}>
          <p className="m-0 text-[16px] font-semibold">No plots yet</p>
          <p className="m-0 text-[14px] text-muted">Upload a GeoJSON file or draw a boundary to start.</p>
          <button type="button" onClick={openAddPlot} className={`${ui.btnDark} mt-3`}>
            + Add plots
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col gap-1 rounded-[14px] border border-line bg-white px-4.5 py-4">
                <span className={`text-[13px] ${s.tone ?? "text-muted"}`}>{s.label}</span>
                <span className="font-display text-[28px] font-semibold">{s.value}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-start gap-4">
            <section aria-label="Plot list" className={`${ui.card} min-w-0 flex-[999_1_520px] overflow-hidden`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-3.5">
                <div className="flex flex-wrap gap-2">
                  {filters.map((f) => (
                    <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} className={ui.chip(filter === f.key)}>
                      {f.label} · {counts[f.key]}
                    </button>
                  ))}
                </div>
                <span className="text-[13px] text-muted">
                  {selected.length} of {selectable.length} selected · {selectedArea.toFixed(2)} ha
                </span>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[600px]">
                  <div className={`${COLS} px-4.5 py-3 font-mono text-[11px] tracking-[0.06em] text-muted uppercase`}>
                    <input
                      type="checkbox"
                      aria-label="Select all valid plots"
                      checked={allSelected}
                      disabled={selectable.length === 0}
                      onChange={toggleAll}
                      ref={(el) => {
                        if (el) el.indeterminate = selected.length > 0 && !allSelected;
                      }}
                      className="h-4 w-4 cursor-pointer accent-ink disabled:cursor-not-allowed"
                    />
                    <span>Plot</span>
                    <span>Area</span>
                    <span>Geometry</span>
                    <span>Forest loss</span>
                    <span>Protected</span>
                    <span>Status</span>
                  </div>
                  {rows.map((p) => {
                    const v = view(p);
                    const on = focus?.id === p.id;
                    const n = plots.indexOf(p) + 1;
                    return (
                      <div
                        key={p.id}
                        onClick={() => setFocusId(p.id)}
                        className={`${COLS} cursor-pointer border-t border-[#F0EFEA] px-4.5 py-3.5 text-[14px] ${
                          on ? "bg-canvas shadow-[inset_3px_0_0_#0D0F0E]" : "bg-white hover:bg-[#FAFAF7]"
                        }`}
                      >
                        <input
                          type="checkbox"
                          aria-label={`Select plot ${n}`}
                          title={p.isValid ? undefined : "Invalid geometry — can't be analyzed"}
                          checked={p.isValid && !excluded.has(p.id)}
                          disabled={!p.isValid}
                          onClick={(e) => e.stopPropagation()}
                          onChange={() => toggle(p.id)}
                          className="h-4 w-4 cursor-pointer accent-ink disabled:cursor-not-allowed disabled:opacity-40"
                        />
                        <button
                          type="button"
                          aria-pressed={on}
                          onClick={() => setFocusId(p.id)}
                          className="flex min-w-0 cursor-pointer flex-col gap-0.5 border-0 bg-transparent p-0 text-left"
                        >
                          <span className="truncate font-semibold text-ink">{p.name || `Plot ${n}`}</span>
                          <span className="text-[12px] text-muted">{v.coords}</span>
                        </button>
                        <span className="font-mono text-[13px]">{v.area}</span>
                        <span className="text-[13px]">{v.geometry}</span>
                        <span className={v.lossWarn ? "font-semibold text-review-ink" : ""}>{v.loss}</span>
                        <span className={v.protectedWarn ? "font-semibold text-review-ink" : ""}>{v.protectedArea}</span>
                        <span>
                          <span className={`${ui.badge} ${KIND_BADGE[v.kind]}`}>{v.status}</span>
                        </span>
                      </div>
                    );
                  })}
                  {rows.length === 0 && <p className="m-0 border-t border-[#F0EFEA] px-4.5 py-8 text-center text-[14px] text-muted">No plots in this filter.</p>}
                </div>
              </div>
            </section>

            {focus && fv && tone && (
              <section aria-label="Plot detail" className={`${ui.card} flex min-w-0 flex-[1_1_340px] flex-col overflow-hidden`}>
                <PlotMiniMap plot={focus} stroke={tone[0]} fill={tone[1]} showProtected={fv.protectedWarn} coords={fv.coords} />
                <div className="flex flex-col gap-4 p-5">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <h2 className="m-0 truncate font-display text-[22px] font-semibold tracking-[-0.02em]">{focus.name || `Plot ${plots.indexOf(focus) + 1}`}</h2>
                      <span className="text-[13px] text-muted">
                        Plot {plots.indexOf(focus) + 1} · {fv.area}
                      </span>
                    </div>
                    <span className={`${ui.badge} ${KIND_BADGE[fv.kind]}`}>{fv.status}</span>
                  </div>
                  <p className="m-0 rounded-[10px] px-3.5 py-3 text-[14px] leading-[1.55]" style={{ background: tone[2], color: tone[3] }}>
                    {fv.verdict}
                  </p>
                  <div className="grid grid-cols-2 gap-2.5">
                    {[
                      ["Forest loss after 2020", fv.loss],
                      ["Protected-area overlap", fv.protectedArea],
                      ["Geometry", fv.geometry],
                      ["Vertices", String(fv.vertices)],
                    ].map(([label, value]) => (
                      <div key={label} className="flex flex-col gap-1 rounded-[10px] border border-line-soft p-3">
                        <span className="text-[12px] text-muted">{label}</span>
                        <span className="font-semibold">{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    <button
                      type="button"
                      disabled={fv.kind !== "clear" && fv.kind !== "review"}
                      title={fv.kind === "clear" || fv.kind === "review" ? undefined : "Run the EUDR analysis on this plot first"}
                      onClick={() => setDdsPlots([focus])}
                      className={`${ui.btnDark} flex-[1_1_140px]`}
                    >
                      Export DDS (PDF)
                    </button>
                    <button type="button" onClick={() => router.push(`/dashboard/eudr/${focus.id}`)} className={`${ui.btnOutline} flex-[1_1_120px]`}>
                      Open on map
                    </button>
                  </div>
                </div>
              </section>
            )}
          </div>
        </>
      )}

      <AddPlotModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        selectedAnalyses={analyses.map((k) => analysisByKey(k).title)}
        onAnalyze={handleAddPlot}
      />

      {/* Add-plot geometry check */}
      <AnalyzingOverlay open={addRunning} done={addDone} steps={[{ label: "Geometry Checker", icon: Shapes }]} onComplete={() => setAddRunning(false)} />

      {/* EUDR analysis */}
      <AnalyzingOverlay
        open={eudrRunning}
        done={eudrAnimDone}
        steps={eudrSteps}
        onComplete={() => {
          setEudrRunning(false);
          if (quotaAfterRun.current) setQuotaBlock(quotaAfterRun.current);
          else router.push("/dashboard/eudr");
        }}
      />

      {quotaBlock && (
        <Popup
          icon={<Lock className="h-6 w-6 text-review" aria-hidden="true" />}
          tone="bg-review-bg text-review"
          title={quotaBlock.paid ? "Not enough quota" : "Free allowance exceeded"}
          body={
            quotaBlock.paid
              ? "The checked plots need more than your plan has left. Uncheck some plots, or choose a plan with more quota."
              : `The checked plots need more than the ${quotaBlock.remainingHa.toFixed(2)} ha left of your free ${FREE_QUOTA_HA} ha allowance (plots you already analyzed don't count again). Uncheck some plots, or upgrade to analyze more.`
          }
          primaryLabel="View plans"
          // Checkout prices exactly the checked plots, not the whole workspace.
          onPrimary={() => router.push(`/checkout?plots=${selected.map((p) => p.id).join(",")}`)}
          onClose={() => setQuotaBlock(null)}
        />
      )}

      <DdsModal open={!!ddsPlots} onClose={() => setDdsPlots(null)} plots={ddsPlots ?? []} />

      {consentModal}
    </>
  );
}
