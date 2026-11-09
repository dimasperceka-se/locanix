"use client";

import { use, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { usePlotStore } from "@/lib/plotStore";
import { geometryIssues, type Plot } from "@/lib/geo";
import { formatAmount } from "@/lib/format";

const PlotDisplayMap = dynamic(() => import("@/components/PlotDisplayMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[360px] items-center justify-center rounded-2xl border border-line bg-white text-sm text-muted">
      Loading map…
    </div>
  ),
});

type TabKey = "rainfall" | "deforestation" | "ghg" | "legality";

const TABS: { key: TabKey; label: string; soon?: boolean }[] = [
  { key: "deforestation", label: "Deforestation" },
  { key: "legality", label: "Legality Analysis" },
  // Coming soon — shown, but not selectable yet.
  { key: "rainfall", label: "Rainfall", soon: true },
  { key: "ghg", label: "GHG Emissions", soon: true },
];

type TabContent = {
  banner: { title: string; description: string };
  tiles: { label: string; value: string; sub?: string }[];
};

const fmt = formatAmount;
const fmtOpt = (n: number | null) => (n === null ? "—" : fmt(n));
const titleCase = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const NO_DATA: TabContent = {
  banner: {
    title: "Not analyzed yet",
    description: "Run the EUDR analysis from the dashboard to populate this section.",
  },
  tiles: [],
};
const NO_RAINFALL: TabContent = {
  banner: {
    title: "No rainfall data for this location",
    description:
      "Satellite rainfall data only covers latitudes 50°S–50°N, so this plot could not be measured.",
  },
  tiles: [],
};

function buildTabContent(plot: Plot): Record<TabKey, TabContent> {
  const d = plot.eudr?.deforestation;
  const r = plot.eudr?.rainfall;
  const g = plot.eudr?.ghg;
  const pa = plot.eudr?.protectedArea;
  const highRisk = (d?.riskLevel ?? "").toLowerCase() === "high";

  return {
    rainfall: !r
      ? NO_DATA
      : r.meanMm === null
        ? NO_RAINFALL
        : {
            banner: {
              title: "Rainfall analysis complete",
              description: r.period
                ? `Annual precipitation measured across the plot (${r.period.start} – ${r.period.end}).`
                : "Annual precipitation measured across the plot using satellite data.",
            },
            tiles: [
              { label: "Annual Mean", value: fmtOpt(r.meanMm), sub: "mm" },
              { label: "Minimum", value: fmtOpt(r.minMm), sub: "mm" },
              { label: "Maximum", value: fmtOpt(r.maxMm), sub: "mm" },
              { label: "Std. Deviation", value: r.stdMm === null ? "—" : `±${fmt(r.stdMm)}`, sub: "mm" },
            ],
          },
    deforestation: d
      ? {
          banner: highRisk
            ? {
                title: "EUDR Non-Compliant — Deforestation detected",
                description:
                  "Deforestation activity was identified within this concession. This plot does not meet EUDR baseline requirements.",
              }
            : {
                title: "EUDR Compliant — No significant loss",
                description:
                  "No material tree-cover loss was detected within this plot against EUDR baselines.",
              },
          tiles: [
            { label: "GFW Loss area", value: `${fmt(d.gfw.ha)} ha`, sub: `${fmt(d.gfw.pct)}% of plot` },
            { label: "JRC Loss area", value: `${fmt(d.jrc.ha)} ha`, sub: `${fmt(d.jrc.pct)}% of plot` },
            { label: "SBTN Loss area", value: `${fmt(d.sbtn.ha)} ha`, sub: `${fmt(d.sbtn.pct)}% of plot` },
            { label: "Risk level", value: d.riskLevel },
          ],
        }
      : NO_DATA,
    ghg: g
      ? {
          banner: {
            title: "GHG emissions estimated",
            description:
              "Estimated greenhouse-gas emissions from deforestation across the available datasets.",
          },
          tiles: [
            { label: "Total net", value: fmt(g.totalTco2e), sub: "tCO₂e" },
            { label: "GFW", value: fmt(g.gfw.tco2e), sub: `tCO₂e · ${fmt(g.gfw.ha)} ha` },
            { label: "JRC", value: fmt(g.jrc.tco2e), sub: `tCO₂e · ${fmt(g.jrc.ha)} ha` },
            { label: "SBTN", value: fmt(g.sbtn.tco2e), sub: `tCO₂e · ${fmt(g.sbtn.ha)} ha` },
          ],
        }
      : NO_DATA,
    legality: pa
      ? {
          banner: {
            title:
              pa.status === "non_compliant"
                ? "Legality — Protected area overlap"
                : pa.status === "indicative"
                  ? "Legality — Indicative overlap"
                  : "Legality review complete",
            description:
              "WDPA protected-area status cross-checked against your plot boundary.",
          },
          tiles: [
            { label: "WDPA Status", value: titleCase(pa.status) },
            { label: "Categories", value: pa.categories.length ? pa.categories.join(", ") : "None" },
            {
              label: "Overlap",
              value:
                pa.status === "non_compliant"
                  ? "Yes"
                  : pa.status === "indicative"
                    ? "Indicative"
                    : "None",
            },
            {
              label: "Verdict",
              value:
                pa.status === "non_compliant"
                  ? "Non-Compliant"
                  : pa.status === "indicative"
                    ? "Review"
                    : "Compliant",
            },
          ],
        }
      : NO_DATA,
  };
}

export default function EudrPlotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { plots, workspaceLoaded } = usePlotStore();
  const plot = plots.find((p) => String(p.id) === id);
  const [tab, setTab] = useState<TabKey>("deforestation");

  if (!plot && !workspaceLoaded) {
    return (
      <p role="status" className="m-0 py-16 text-center text-[14px] text-muted">
        Loading your plots…
      </p>
    );
  }
  if (!plot) {
    return (
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-[14px] text-ink-soft no-underline hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to plots
        </Link>
        <p className="mt-8 text-[14px] text-muted">Plot not found. It may have been cleared — return to your plots.</p>
      </div>
    );
  }

  const content = buildTabContent(plot)[tab];
  const centroid = plot.ring.reduce(
    (acc, [lon, lat]) => [acc[0] + lon / plot.ring.length, acc[1] + lat / plot.ring.length],
    [0, 0],
  );
  const d = plot.eudr?.deforestation;
  const pa = plot.eudr?.protectedArea;
  const highRisk = (d?.riskLevel ?? "").toLowerCase() === "high";
  // EUDR needs both: no post-2020 deforestation and no protected-area overlap.
  const eudrStatus = !plot.isValid
    ? "Not analyzed"
    : !d && !pa
      ? "—"
      : highRisk || pa?.status === "non_compliant"
        ? "Non-Compliant"
        : pa?.status === "indicative"
          ? "Review"
          : "Compliant";

  const info: { label: string; value: string }[] = [
    { label: "Plot Name", value: plot.name },
    { label: "Area", value: `${plot.areaHa.toFixed(2)} ha` },
    { label: "Vertices", value: String(plot.ring.length) },
    {
      label: "Geometry",
      value: plot.isValid ? "Valid" : geometryIssues(plot).join(", "),
    },
    { label: "Data Source", value: "GeoJSON" },
    { label: "EUDR Status", value: eudrStatus },
    { label: "Risk Level", value: !plot.isValid ? "Not analyzed" : (d?.riskLevel ?? "—") },
    { label: "Country", value: "Indonesia" },
    { label: "Centroid", value: `${centroid[1].toFixed(4)}, ${centroid[0].toFixed(4)}` },
    {
      label: "Analyzed",
      value: plot.eudr ? "Latest run" : plot.isValid ? "Pending" : "Skipped (invalid geometry)",
    },
  ];

  return (
    <div>
      <div className="flex flex-col gap-1.5">
        <Link href="/dashboard/eudr" className="inline-flex items-center gap-2 text-[14px] text-ink-soft no-underline hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to reports
        </Link>
        <h1 className="m-0 font-display text-[34px] font-semibold tracking-[-0.03em] text-ink">{plot.name || "Plot detail"}</h1>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="h-[320px] lg:col-span-2">
          <PlotDisplayMap plots={[plot]} />
        </div>
        <div className="rounded-2xl border border-line bg-white p-6">
          <h2 className="font-display text-[20px] font-semibold text-ink">Plot Information</h2>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
            {info.map((row) => (
              <div key={row.label} className="min-w-0">
                <dt className="text-sm font-semibold text-ink">{row.label}</dt>
                <dd className="truncate text-sm text-muted">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-white p-6">
        <div
          role="tablist"
          aria-label="Analysis results"
          className="flex flex-wrap gap-6 border-b border-line-soft"
        >
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              type="button"
              disabled={t.soon}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 pb-3 text-sm font-semibold transition-colors ${
                t.soon
                  ? "cursor-not-allowed border-transparent text-line-strong"
                  : tab === t.key
                    ? "border-ink text-ink"
                    : "border-transparent text-muted hover:text-ink-soft"
              }`}
            >
              {t.label}
              {t.soon && (
                <span className="ml-2 rounded-full bg-[#ECEBE5] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Soon
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-xl bg-clear-bg px-5 py-4">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-clear-ink/30 text-clear-ink">
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="font-bold text-clear-ink">{content.banner.title}</p>
            <p className="mt-1 text-sm text-clear-ink/80">{content.banner.description}</p>
          </div>
        </div>

        {content.tiles.length > 0 ? (
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {content.tiles.map((tile) => (
              <div key={tile.label} className="rounded-xl border border-line-soft bg-canvas p-5">
                <p className="text-sm font-medium text-muted">{tile.label}</p>
                <p className="mt-2 font-display text-[28px] font-semibold text-ink">{tile.value}</p>
                {tile.sub && <p className="text-sm text-muted">{tile.sub}</p>}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-5 text-sm text-muted">
            No data for this analysis — re-run the EUDR analysis from the dashboard.
          </p>
        )}
      </div>
    </div>
  );
}
