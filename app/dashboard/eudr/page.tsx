"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { usePlotStore } from "@/lib/plotStore";
import type { Plot } from "@/lib/geo";

const NA = { text: "Not analyzed", cls: "italic text-slate-400" };

function deforestationLabel(plot: Plot) {
  if (!plot.isValid || !plot.eudr) return NA;
  const d = plot.eudr?.deforestation;
  if (!d) return { text: "—", cls: "text-slate-400" };
  const high = d.riskLevel.toLowerCase() === "high";
  return high
    ? { text: "Loss detected", cls: "text-amber-600 font-medium" }
    : { text: "No loss detected", cls: "text-emerald-600 font-medium" };
}

function legalityLabel(plot: Plot) {
  if (!plot.isValid || !plot.eudr) return NA;
  const status = plot.eudr?.protectedArea?.status;
  if (!status) return { text: "—", cls: "text-slate-400" };
  if (status === "non_compliant") return { text: "Non-Compliant", cls: "text-red-500 font-medium" };
  if (status === "indicative") return { text: "Review", cls: "text-amber-600 font-medium" };
  return { text: "Compliant", cls: "text-emerald-600 font-medium" };
}

function riskBadge(plot: Plot) {
  if (!plot.isValid || !plot.eudr) {
    return (
      <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
        {plot.isValid ? "Not analyzed" : "Invalid geometry"}
      </span>
    );
  }
  const level = plot.eudr?.deforestation?.riskLevel ?? "—";
  const high = level.toLowerCase() === "high";
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        high ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
      }`}
    >
      {level}
    </span>
  );
}

export default function EudrResultsPage() {
  const router = useRouter();
  const { plots } = usePlotStore();

  return (
    <main className="min-h-screen">
      <div className="p-6 lg:p-8">
        <button
          type="button"
          onClick={() => router.push("/dashboard")}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to dashboard
        </button>

        <h1 className="mt-4 text-3xl font-extrabold text-slate-900">
          EUDR Analysis Results
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Deforestation, legality and risk screening across your plots.
        </p>

        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wider text-slate-400">
                  <th className="py-3 pr-4 font-medium">No</th>
                  <th className="py-3 pr-4 font-medium">Area</th>
                  <th className="py-3 pr-4 font-medium">Deforestation</th>
                  <th className="py-3 pr-4 font-medium">Land Legality</th>
                  <th className="py-3 pr-4 font-medium">Risk</th>
                  <th className="py-3 pr-4 font-medium">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {plots.map((plot, i) => {
                  const defo = deforestationLabel(plot);
                  const legal = legalityLabel(plot);
                  return (
                    <tr key={plot.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-4 pr-4 text-slate-700">{i + 1}</td>
                      <td className="py-4 pr-4 font-medium text-slate-700">
                        {plot.areaHa.toFixed(2)} ha
                      </td>
                      <td className={`py-4 pr-4 ${defo.cls}`}>{defo.text}</td>
                      <td className={`py-4 pr-4 ${legal.cls}`}>{legal.text}</td>
                      <td className="py-4 pr-4">{riskBadge(plot)}</td>
                      <td className="py-4 pr-4 text-right">
                        <button
                          type="button"
                          onClick={() => router.push(`/dashboard/eudr/${plot.id}`)}
                          aria-label={`Open plot ${i + 1} detail`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-ink hover:bg-slate-50"
                        >
                          <ArrowRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {plots.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-sm text-slate-400">
                      No plots to analyze. Add a plot from the dashboard first.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
