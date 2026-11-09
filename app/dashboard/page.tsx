"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowRight, ArrowUpRight, Download, FileCheck2, Lock, Plus, Shapes } from "lucide-react";
import { analysisByKey } from "@/lib/data";
import { usePlotStore } from "@/lib/plotStore";
import type { FeatureCollection, Plot } from "@/lib/geo";
import { runEudr, validateGeometry } from "@/lib/analysisClient";
import { persistPlots } from "@/lib/plotsClient";
import { downloadPlotsExcel } from "@/lib/excel";
import { authorize } from "@/lib/usageClient";
import { FREE_QUOTA_HA } from "@/lib/quota";
import DashboardNavbar from "@/components/DashboardNavbar";
import AddPlotModal from "@/components/AddPlotModal";
import AnalyzingOverlay from "@/components/AnalyzingOverlay";
import { useConsentGate } from "@/components/ConsentGate";
import DdsModal from "@/components/DdsModal";
import Popup from "@/components/Popup";

const PlotDisplayMap = dynamic(() => import("@/components/PlotDisplayMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[360px] items-center justify-center rounded-2xl border border-slate-200 text-sm text-slate-400">
      Loading map…
    </div>
  ),
});

const isInvalid = (p: Plot) => !p.isValid;

export default function DashboardPage() {
  const router = useRouter();
  const { plots, userName, analyses, addPlots, updatePlots, setEudrDone } =
    usePlotStore();
  const eudrSteps = analyses.map((k) => {
    const a = analysisByKey(k);
    return { label: a.title, icon: a.icon };
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [addRunning, setAddRunning] = useState(false);
  const [addDone, setAddDone] = useState(false);
  const [eudrRunning, setEudrRunning] = useState(false);
  const [eudrAnimDone, setEudrAnimDone] = useState(false);
  const [ddsOpen, setDdsOpen] = useState(false);
  // Over-quota selection: what's left on the free tier or the user's plan.
  type QuotaBlock = { paid: boolean; remainingHa: number };
  const [quotaBlock, setQuotaBlock] = useState<QuotaBlock | null>(null);
  const [runError, setRunError] = useState("");
  const quotaAfterRun = useRef<QuotaBlock | null>(null);
  // Plots the user unchecked. Tracking exclusions (not selections) keeps every
  // valid plot — including ones added later — checked by default.
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set());
  const { ensureConsent, consentModal } = useConsentGate();
  const openAddPlot = async () => {
    if (await ensureConsent()) setModalOpen(true);
  };

  const { selectable, selected, selectedArea } = useMemo(() => {
    const ok = plots.filter((p) => !isInvalid(p));
    const sel = ok.filter((p) => !excluded.has(p.id));
    return {
      selectable: ok,
      selected: sel,
      selectedArea: sel.reduce((s, p) => s + p.areaHa, 0),
    };
  }, [plots, excluded]);
  const allSelected = selectable.length > 0 && selected.length === selectable.length;
  // The DDS covers the checked plots; it needs at least one analyzed plot.
  const canExportDds = selected.some((p) => p.eudr);

  const toggle = (id: number) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setExcluded(allSelected ? new Set(selectable.map((p) => p.id)) : new Set());

  const { totalArea, valid, invalid } = useMemo(() => {
    const inv = plots.filter(isInvalid).length;
    return {
      totalArea: plots.reduce((s, p) => s + p.areaHa, 0),
      valid: plots.length - inv,
      invalid: inv,
    };
  }, [plots]);

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

  return (
    <>
      <DashboardNavbar />

      <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          {/* Welcome header */}
          <div className="text-center">
            <h1 className="text-3xl font-extrabold text-slate-900">
              Welcome, {userName}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Here&apos;s your land at a glance
            </p>
          </div>

          {plots.length === 0 ? (
            <div className="mx-auto mt-12 max-w-md rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
              <p className="text-base font-bold text-ink">No plots yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Add a plot to see your land analysis here.
              </p>
              <button
                type="button"
                onClick={openAddPlot}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-mid"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add plot
              </button>
            </div>
          ) : (
            <>
              <div className="mt-10 grid gap-6 lg:grid-cols-2">
                {/* Left: summary card */}
                <div className="rounded-2xl bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-3 rounded-xl bg-clear-bg px-4 py-3.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-clear-ink/30 text-clear-ink">
                      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="font-bold text-clear-ink">Plot Uploaded</span>
                  </div>

                  <div className="mt-4 grid grid-cols-[1fr_auto] gap-4">
                    <div className="rounded-xl bg-slate-100 p-5">
                      <p className="text-sm font-medium text-slate-500">
                        Total Plot Area
                      </p>
                      <p className="mt-2 text-4xl font-extrabold text-slate-900">
                        {totalArea.toFixed(2)}
                      </p>
                      <p className="text-sm text-slate-400">Hectare</p>
                    </div>
                    <button
                      type="button"
                      onClick={openAddPlot}
                      className="flex w-28 flex-col items-center justify-center gap-1 rounded-xl bg-ink text-sm font-semibold text-white hover:bg-ink-mid"
                    >
                      <Plus className="h-6 w-6" aria-hidden="true" />
                      Add plot
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <Stat label="Total Plot" value={plots.length} unit="Plot" />
                    <Stat label="Valid" value={valid} unit="Plot" tone="green" />
                    <Stat label="Invalid" value={invalid} unit="Plot" />
                  </div>
                </div>

                {/* Right: map */}
                <PlotDisplayMap plots={plots} />
              </div>

              {/* Plots table */}
              <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-900">Plots</h2>
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        downloadPlotsExcel(plots).catch(() => {});
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-ink hover:bg-slate-50"
                    >
                      <Download className="h-4 w-4" aria-hidden="true" />
                      Export Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => setDdsOpen(true)}
                      disabled={!canExportDds}
                      title={canExportDds ? "Due Diligence Statement for the checked plots" : "Run the EUDR analysis on the checked plots first"}
                      className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink-mid disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                      Export DDS
                    </button>
                  </div>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400">
                        <th className="w-10 py-3 pr-4 font-medium">
                          <input
                            type="checkbox"
                            aria-label="Select all valid plots"
                            checked={allSelected}
                            disabled={selectable.length === 0}
                            onChange={toggleAll}
                            ref={(el) => {
                              if (el) el.indeterminate = selected.length > 0 && !allSelected;
                            }}
                            className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-ink disabled:cursor-not-allowed"
                          />
                        </th>
                        <th className="py-3 pr-4 font-medium">No</th>
                        <th className="py-3 pr-4 font-medium">Area</th>
                        <th className="py-3 pr-4 font-medium">Duplicate Vertices</th>
                        <th className="py-3 pr-4 font-medium">Zero Area</th>
                        <th className="py-3 pr-4 font-medium">Self-Intersection</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plots.map((plot, i) => (
                        <tr key={plot.id} className="border-b border-slate-50 last:border-0">
                          <td className="py-4 pr-4">
                            <input
                              type="checkbox"
                              aria-label={`Select plot ${i + 1}`}
                              title={plot.isValid ? undefined : "Invalid geometry — can't be analyzed"}
                              checked={plot.isValid && !excluded.has(plot.id)}
                              disabled={!plot.isValid}
                              onChange={() => toggle(plot.id)}
                              className="h-4 w-4 cursor-pointer rounded border-slate-300 accent-ink disabled:cursor-not-allowed disabled:opacity-40"
                            />
                          </td>
                          <td className="py-4 pr-4 text-slate-700">{i + 1}</td>
                          <td className="py-4 pr-4 font-medium text-slate-700">
                            {plot.areaHa.toFixed(2)} ha
                          </td>
                          <Flag bad={plot.checks.duplicateVertices} />
                          <Flag bad={plot.checks.zeroArea} />
                          <Flag bad={plot.checks.selfIntersection} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Run EUDR */}
              <button
                type="button"
                onClick={startEudr}
                disabled={selected.length === 0}
                className="mt-6 flex w-full items-center justify-between gap-4 rounded-2xl bg-ink px-8 py-6 text-lg font-bold text-white transition-colors hover:bg-ink-mid disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-ink"
              >
                Run EUDR Analysis
                <span className="flex items-center gap-4">
                  <span className="text-right text-sm font-medium text-white/70">
                    {selected.length} of {selectable.length} plot
                    {selectable.length === 1 ? "" : "s"} · {selectedArea.toFixed(2)} ha
                  </span>
                  <ArrowRight className="h-6 w-6 shrink-0" aria-hidden="true" />
                </span>
              </button>
              {runError && (
                <p role="alert" className="mt-3 text-center text-sm font-medium text-red-600">
                  {runError}
                </p>
              )}
            </>
          )}
        </div>
      </main>

      <AddPlotModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        selectedAnalyses={analyses.map((k) => analysisByKey(k).title)}
        onAnalyze={handleAddPlot}
      />

      {/* Add-plot geometry check */}
      <AnalyzingOverlay
        open={addRunning}
        done={addDone}
        steps={[{ label: "Geometry Checker", icon: Shapes }]}
        onComplete={() => setAddRunning(false)}
      />

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
          icon={<Lock className="h-6 w-6 text-amber-600" aria-hidden="true" />}
          tone="bg-amber-100 text-amber-600"
          title={quotaBlock.paid ? "Not enough quota" : "Free allowance exceeded"}
          body={
            quotaBlock.paid
              ? "The checked plots need more than your plan has left. Uncheck some plots, or choose a plan with more quota."
              : `The checked plots need more than the ${quotaBlock.remainingHa.toFixed(2)} ha left of your free ${FREE_QUOTA_HA} ha allowance (plots you already analyzed don't count again). Uncheck some plots, or upgrade to analyze more.`
          }
          primaryLabel="View plans"
          onPrimary={() => router.push("/checkout")}
          onClose={() => setQuotaBlock(null)}
        />
      )}

      <DdsModal open={ddsOpen} onClose={() => setDdsOpen(false)} plots={selected} />

      {consentModal}
    </>
  );
}

function Stat({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number;
  unit: string;
  tone?: "green";
}) {
  return (
    <div className="rounded-xl bg-slate-100 p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-extrabold ${
          tone === "green" ? "text-accent" : "text-slate-900"
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-slate-400">{unit}</p>
    </div>
  );
}

function Flag({ bad }: { bad: boolean }) {
  return (
    <td className="py-4 pr-4">
      <span className={bad ? "font-semibold text-red-500" : "text-slate-500"}>
        {bad ? "Found" : "None"}
      </span>
    </td>
  );
}
