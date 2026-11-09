"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { AlertTriangle, ArrowUpRight, Download, FileText } from "lucide-react";
import { usePlotStore } from "@/lib/plotStore";
import { analysisByKey, type AnalysisKey } from "@/lib/data";
import { geometryIssues } from "@/lib/geo";
import { runEudr } from "@/lib/analysisClient";
import { consumeQuota } from "@/lib/usageClient";
import { downloadPlotsExcel } from "@/lib/excel";
import DashboardNavbar from "@/components/DashboardNavbar";
import AnalyzingOverlay from "@/components/AnalyzingOverlay";

const PlotDisplayMap = dynamic(() => import("@/components/PlotDisplayMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[300px] items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-400">
      Loading map…
    </div>
  ),
});

export default function ReportDownload() {
  const router = useRouter();
  const { plots, analyses, survey, updatePlots } = usePlotStore();
  const [running, setRunning] = useState(plots.length > 0);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState<AnalysisKey[]>([]);
  const ranRef = useRef(false);

  // The report runs whatever analyses the user selected on the homepage.
  const keys = analyses;

  useEffect(() => {
    if (ranRef.current || plots.length === 0) return;
    ranRef.current = true;
    // Only valid plots are analyzed and counted toward the free quota.
    const analyzedArea = plots
      .filter((p) => p.isValid)
      .reduce((s, p) => s + p.areaHa, 0);
    (async () => {
      try {
        const run = await runEudr(plots, keys);
        updatePlots(run.plots);
        setFailed(run.failed);
        // Quota is debited only for the area we actually analyzed.
        if (analyzedArea > 0) await consumeQuota(analyzedArea);
      } catch {
        /* graceful: show whatever we have */
      }
      setDone(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const steps = keys.map((k) => {
    const a = analysisByKey(k);
    return { label: a.title, icon: a.icon };
  });

  const [dlError, setDlError] = useState(false);
  const downloadReport = async () => {
    setDlError(false);
    try {
      await downloadPlotsExcel(plots, survey, undefined, failed);
    } catch {
      setDlError(true);
    }
  };

  if (running) {
    return (
      <AnalyzingOverlay
        open
        done={done}
        title="Generating your report"
        steps={steps.length ? steps : [{ label: "Compliance", icon: FileText }]}
        onComplete={() => setRunning(false)}
      />
    );
  }

  const validPlots = plots.filter((p) => p.isValid);
  const invalidCount = plots.length - validPlots.length;
  const analyzedArea = validPlots.reduce((s, p) => s + p.areaHa, 0);
  const noneAnalyzed = validPlots.length === 0;

  return (
    <>
      <DashboardNavbar />
      <main className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
          {plots.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
              <p className="text-base font-bold text-ink">No report yet</p>
              <p className="mt-1 text-sm text-slate-500">
                Run a compliance check first.
              </p>
              <button
                type="button"
                onClick={() => router.push("/")}
                className="mt-5 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-mid"
              >
                Back home
              </button>
            </div>
          ) : (
            <>
              {noneAnalyzed ? (
                <div className="flex items-start gap-3 rounded-2xl bg-amber-100 px-5 py-4">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-600/40 text-amber-700">
                    <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-bold text-amber-900">
                      No plots could be analyzed
                    </p>
                    <p className="mt-1 text-sm text-amber-900/80">
                      All {plots.length} plot{plots.length > 1 ? "s have" : " has"}{" "}
                      invalid geometry, so {plots.length > 1 ? "they were" : "it was"}{" "}
                      not sent for further analysis. See the issue
                      {plots.length > 1 ? "s" : ""} below.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-2xl bg-clear-bg px-5 py-4">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-clear-ink/30 text-clear-ink">
                    <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="font-bold text-clear-ink">
                      Your compliance report is ready
                    </p>
                    <p className="mt-1 text-sm text-clear-ink/80">
                      {validPlots.length} plot{validPlots.length > 1 ? "s" : ""} ·{" "}
                      {analyzedArea.toFixed(2)} ha · analyzed{" "}
                      {keys.map((k) => analysisByKey(k).title).join(" + ")}
                      {invalidCount > 0 && (
                        <>
                          {" "}
                          · {invalidCount} skipped (invalid geometry)
                        </>
                      )}
                      .
                    </p>
                  </div>
                </div>
              )}

              {failed.length > 0 && (
                <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                  <AlertTriangle
                    className="mt-0.5 h-5 w-5 shrink-0 text-amber-600"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-bold text-amber-900">
                      Some analyses are temporarily unavailable
                    </p>
                    <p className="mt-1 text-sm text-amber-900/80">
                      {failed.map((k) => analysisByKey(k).title).join(", ")}{" "}
                      could not be completed because the analysis service returned
                      an error. Those columns are marked “Unavailable”. Please try
                      again later.
                    </p>
                  </div>
                </div>
              )}

              {/* Plot location map */}
              <div className="mt-6 h-[320px]">
                <PlotDisplayMap plots={plots} />
              </div>

              <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
                <h1 className="text-lg font-bold text-slate-900">Compliance Report</h1>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400">
                        <th className="py-3 pr-4 font-medium">Plot</th>
                        <th className="py-3 pr-4 font-medium">Area</th>
                        <th className="py-3 pr-4 font-medium">Geometry</th>
                        <th className="py-3 pr-4 font-medium">Verdict</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plots.map((p) => {
                        const issues = geometryIssues(p);
                        const risk = p.eudr?.deforestation?.riskLevel;
                        const legal = p.eudr?.protectedArea?.status;
                        const verdict = !p.isValid
                          ? "Not analyzed"
                          : risk
                            ? `Deforestation risk: ${risk}`
                            : legal
                              ? `Legality: ${legal}`
                              : "—";
                        return (
                          <tr key={p.id} className="border-b border-slate-50 last:border-0">
                            <td className="py-4 pr-4 font-medium text-slate-700">{p.name}</td>
                            <td className="py-4 pr-4 text-slate-700">{p.areaHa.toFixed(2)} ha</td>
                            <td className="py-4 pr-4">
                              {p.isValid ? (
                                <span className="text-emerald-600">Valid</span>
                              ) : (
                                <span className="text-amber-600" title={issues.join(", ")}>
                                  {issues.join(", ")}
                                </span>
                              )}
                            </td>
                            <td
                              className={
                                p.isValid
                                  ? "py-4 pr-4 text-slate-700"
                                  : "py-4 pr-4 italic text-slate-400"
                              }
                            >
                              {verdict}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {invalidCount > 0 && (
                  <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      Plots with invalid geometry are not sent for further
                      analysis. Fix the geometry (e.g. remove duplicate vertices)
                      and re-run the compliance check.
                    </span>
                  </p>
                )}

                <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
                  <button
                    type="button"
                    onClick={downloadReport}
                    className="inline-flex items-center gap-2 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-mid"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download report
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/dashboard")}
                    className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-ink hover:bg-slate-50"
                  >
                    Go to dashboard
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-400">
                  Report exports as Excel (.xlsx).
                </p>
                {dlError && (
                  <p className="mt-1 text-xs font-medium text-red-500">
                    Couldn&apos;t generate the file — please try again.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
