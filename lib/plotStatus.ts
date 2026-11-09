import { geometryIssues, type Plot } from "./geo";

/** Workspace status of a plot, as shown in the plot table, stats and detail panel. */
export type PlotKind = "review" | "clear" | "pending" | "invalid";

export const KIND_LABEL: Record<PlotKind, string> = {
  review: "Needs review",
  clear: "Clear",
  pending: "Not analyzed",
  invalid: "Fix geometry",
};

/** Badge classes per status (v2 workspace design). */
export const KIND_BADGE: Record<PlotKind, string> = {
  review: "bg-review-bg text-review-ink",
  clear: "bg-clear-bg text-clear-ink",
  pending: "bg-[#ECEBE5] text-[#3A403C]",
  invalid: "bg-[#ECEBE5] text-[#3A403C]",
};

/** Map stroke, map fill, verdict background, verdict text. */
export const KIND_TONE: Record<PlotKind, [string, string, string, string]> = {
  review: ["#C2620F", "#E07A1F", "#FBE6D2", "#5C2A04"],
  clear: ["#145236", "#1F9D5C", "#DDF1E5", "#0E3B26"],
  pending: ["#0D0F0E", "#0D0F0E", "#F4F4EF", "#3A403C"],
  invalid: ["#6A706C", "#9AA59F", "#ECEBE5", "#3A403C"],
};

const highRisk = (p: Plot) => (p.eudr?.deforestation?.riskLevel ?? "").toLowerCase() === "high";
const protectedHit = (p: Plot) => ["non_compliant", "indicative"].includes(p.eudr?.protectedArea?.status ?? "");

export function plotKind(p: Plot): PlotKind {
  if (!p.isValid) return "invalid";
  if (!p.eudr) return "pending";
  return highRisk(p) || protectedHit(p) ? "review" : "clear";
}

export type PlotView = {
  kind: PlotKind;
  status: string;
  area: string;
  geometry: string;
  /** Forest loss after 2020; `warn` when the analysis flags it. */
  loss: string;
  lossWarn: boolean;
  protectedArea: string;
  protectedWarn: boolean;
  verdict: string;
  coords: string;
  vertices: number;
};

const ha = (n: number) => `${n.toFixed(2)} ha`;

function centroid(p: Plot): [number, number] {
  const n = p.ring.length || 1;
  return p.ring.reduce<[number, number]>((acc, [lon, lat]) => [acc[0] + lon / n, acc[1] + lat / n], [0, 0]);
}

export function formatCoords(p: Plot): string {
  const [lon, lat] = centroid(p);
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
}

export function plotView(p: Plot): PlotView {
  const kind = plotKind(p);
  const d = p.eudr?.deforestation;
  const pa = p.eudr?.protectedArea;
  const analyzed = kind === "clear" || kind === "review";

  // The largest loss across the datasets; the risk level decides whether it counts.
  const lossHa = d ? Math.max(d.gfw.ha, d.jrc.ha, d.sbtn.ha) : 0;
  const loss = !analyzed ? "—" : d ? (lossHa > 0 ? `${lossHa.toFixed(2)} ha` : "0 ha") : "—";
  const categories = pa?.categories.length ? ` · ${pa.categories.map((c) => `IUCN ${c}`).join(", ")}` : "";
  const protectedArea = !analyzed || !pa
    ? "—"
    : pa.status === "non_compliant"
      ? `Overlap${categories}`
      : pa.status === "indicative"
        ? `Indicative${categories}`
        : "None";

  let verdict: string;
  if (kind === "invalid") verdict = "The boundary has a geometry problem, so it can’t be analyzed. Redraw or re-upload this plot.";
  else if (kind === "pending") verdict = "Not analyzed yet. Select it and run the EUDR analysis to check forest loss and protected areas.";
  else if (highRisk(p) && protectedHit(p)) verdict = "Tree-cover loss after 31 Dec 2020 and a protected-area overlap were found. Resolve both before filing.";
  else if (highRisk(p)) verdict = "Tree-cover loss detected after 31 Dec 2020. This plot is not EUDR-compliant as it stands.";
  else if (pa?.status === "non_compliant") verdict = "Part of this plot lies inside a protected area. Resolve the boundary or document legality before filing.";
  else if (pa?.status === "indicative") verdict = "This plot may overlap a protected area. Check the boundary before filing.";
  else verdict = "No forest loss after the cut-off and no protected-area overlap. Ready for your due diligence statement.";

  return {
    kind,
    status: KIND_LABEL[kind],
    area: ha(p.areaHa),
    geometry: p.isValid ? "Valid" : geometryIssues(p).join(", ") || "Invalid",
    loss,
    lossWarn: analyzed && highRisk(p),
    protectedArea,
    protectedWarn: analyzed && protectedHit(p),
    verdict,
    coords: formatCoords(p),
    vertices: p.ring.length,
  };
}
