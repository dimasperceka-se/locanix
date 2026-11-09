import type { LonLatRing, Plot } from "./geo";
import { formatAmount } from "./format";

/**
 * Due Diligence Statement (EUDR, Reg. (EU) 2023/1115) built from the analyzed
 * plots plus the operator/product details the user enters before exporting.
 * Everything shown in the PDF is derived here, so the document only states
 * what the screening actually found.
 */

export type DdsDetails = {
  legalName: string;
  vat: string;
  eori: string;
  operatorCountry: string;
  operatorType: "operator" | "trader";
  size: "micro" | "small" | "medium" | "large";
  product: string;
  hsCode: string;
  quantityKg: string;
  productionCountry: string;
  countryRisk: "low" | "standard" | "high";
  suppliers: string;
  riskNotes: string;
  euReference: string;
  representative: string;
};

export const EMPTY_DDS_DETAILS: DdsDetails = {
  legalName: "",
  vat: "",
  eori: "",
  operatorCountry: "",
  operatorType: "operator",
  size: "small",
  product: "",
  hsCode: "",
  quantityKg: "",
  productionCountry: "Indonesia",
  countryRisk: "standard",
  suppliers: "",
  riskNotes: "",
  euReference: "",
  representative: "",
};

/** passed: no loss, no protected-area overlap · review: something was found · pending: not screened. */
export type Screening = "passed" | "review" | "pending";

export const SCREENING_LABEL: Record<Screening, string> = {
  passed: "Passed",
  review: "Review needed",
  pending: "Not screened",
};

export type DdsPlot = {
  code: string; // P1, P2, …
  name: string;
  areaHa: number;
  ring: LonLatRing;
  centroid: { lat: number; lon: number };
  screening: Screening;
  /** Dataset agreement for deforestation, e.g. "3 of 3 datasets clear". */
  evidence: string;
  details: string;
  /** Short reason used in the risk summary, e.g. "tree-cover loss". */
  finding?: string;
};

export type DdsChecklistItem = { label: string; done: boolean; optional?: boolean };

export type DdsModel = {
  reference: string;
  date: Date;
  details: DdsDetails;
  plots: DdsPlot[];
  counts: Record<Screening, number>;
  checklist: DdsChecklistItem[];
  mandatoryDone: number;
  mandatoryTotal: number;
  ready: boolean;
  negligibleRisk: boolean;
  riskSummary: string;
  deforestationFree: boolean;
  legalityClear: boolean;
};

const DATASETS = ["GFW", "JRC", "SBTN"] as const;
const COUNTRY_RISK_LABEL = { low: "low", standard: "standard", high: "high" } as const;

function centroidOf(ring: LonLatRing) {
  const n = ring.length || 1;
  const [lon, lat] = ring.reduce((a, [x, y]) => [a[0] + x / n, a[1] + y / n], [0, 0]);
  return { lat, lon };
}

function screenPlot(plot: Plot, index: number): DdsPlot {
  const d = plot.eudr?.deforestation;
  const pa = plot.eudr?.protectedArea;
  const base = {
    code: `P${index + 1}`,
    name: plot.name,
    areaHa: plot.areaHa,
    ring: plot.ring,
    centroid: centroidOf(plot.ring),
  };

  const findings: string[] = [];
  const sentences: string[] = [];
  let evidence = "—";

  if (d) {
    const losses = DATASETS.map((k) => ({ k, ...d[k.toLowerCase() as "gfw" | "jrc" | "sbtn"] }));
    const withLoss = losses.filter((l) => l.ha > 0);
    evidence = withLoss.length
      ? `${withLoss.length} of 3 datasets show loss`
      : "3 of 3 datasets clear";
    if (d.riskLevel.toLowerCase() === "high") {
      const worst = withLoss.reduce((a, b) => (b.ha > a.ha ? b : a), withLoss[0] ?? losses[0]);
      sentences.push(
        `Tree-cover loss after 31 Dec 2020: up to ${formatAmount(worst.ha)} ha (${formatAmount(worst.pct)}% of plot), reported by ${withLoss.map((l) => l.k).join(", ") || "the screening"}.`,
      );
      findings.push("tree-cover loss");
    } else {
      sentences.push("No tree-cover loss after the 31 Dec 2020 cut-off (GFW, JRC, SBTN).");
    }
  } else {
    sentences.push("Deforestation not screened yet.");
  }

  if (pa) {
    const cats = pa.categories.length ? ` (IUCN: ${pa.categories.join(", ")})` : "";
    if (pa.status === "non_compliant") {
      sentences.push(`Overlaps a strictly protected area${cats}.`);
      findings.push("protected-area overlap");
    } else if (pa.status === "indicative") {
      sentences.push(`Overlaps a protected area${cats}; confirm production is permitted there.`);
      findings.push("protected-area overlap");
    } else {
      sentences.push("No overlap with protected areas (WDPA).");
    }
  } else {
    sentences.push("Protected areas not screened yet.");
  }

  const screening: Screening = !d || !pa ? "pending" : findings.length ? "review" : "passed";
  return {
    ...base,
    screening,
    evidence,
    details: sentences.join(" "),
    finding: findings.join(" and ") || undefined,
  };
}

function reference(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `DDS-${date.getFullYear()}-${pad(date.getMonth() + 1)}${pad(date.getDate())}-${rand}`;
}

export function buildDds(plots: Plot[], details: DdsDetails, date = new Date()): DdsModel {
  const rows = plots.map(screenPlot);
  const counts: Record<Screening, number> = { passed: 0, review: 0, pending: 0 };
  rows.forEach((p) => counts[p.screening]++);

  const screened = rows.length > 0 && counts.pending === 0;
  const negligibleRisk = screened && counts.review === 0;
  const deforestationFree =
    rows.length > 0 && plots.every((p) => p.eudr?.deforestation?.riskLevel.toLowerCase() === "low");
  const legalityClear =
    rows.length > 0 && plots.every((p) => p.eudr?.protectedArea?.status === "compliant");
  const has = (s: string) => s.trim().length > 0;

  const checklist: DdsChecklistItem[] = [
    { label: "Operator identification (name + VAT/EORI)", done: has(details.legalName) && (has(details.vat) || has(details.eori)) },
    { label: "Product and HS code", done: has(details.product) && has(details.hsCode) },
    { label: "Quantity (kg)", done: Number(details.quantityKg) > 0 },
    { label: "Country of production", done: has(details.productionCountry) },
    { label: "Farm geolocation (plots)", done: rows.length > 0 && rows.every((p) => p.ring.length >= 3) },
    { label: "Deforestation-free statement", done: deforestationFree },
    { label: "Legality-of-production statement", done: legalityClear },
    // A non-negligible risk needs the mitigation measures described.
    { label: "Risk assessment completed", done: screened && (negligibleRisk || has(details.riskNotes)) },
    { label: "Satellite screening completed", done: screened },
    { label: "EU Information System reference (optional)", done: has(details.euReference), optional: true },
  ];
  const mandatory = checklist.filter((c) => !c.optional);
  const mandatoryDone = mandatory.filter((c) => c.done).length;

  const summary: string[] = [
    `${counts.passed} of ${rows.length} plot${rows.length === 1 ? "" : "s"} passed satellite screening for deforestation after 31 December 2020 and for overlap with protected areas.`,
  ];
  const review = rows.filter((p) => p.screening === "review");
  if (review.length) {
    summary.push(`Plot${review.length === 1 ? "" : "s"} needing review: ${review.map((p) => `${p.code} (${p.finding})`).join(", ")}.`);
  }
  if (counts.pending) summary.push(`${counts.pending} plot${counts.pending === 1 ? " has" : "s have"} not been screened yet.`);
  summary.push(
    `Country of production (${details.productionCountry || "not specified"}) declared as ${COUNTRY_RISK_LABEL[details.countryRisk]} risk under EU country benchmarking.`,
  );
  if (has(details.riskNotes)) summary.push(`Mitigation: ${details.riskNotes.trim()}`);

  return {
    reference: reference(date),
    date,
    details,
    plots: rows,
    counts,
    checklist,
    mandatoryDone,
    mandatoryTotal: mandatory.length,
    ready: mandatoryDone === mandatory.length,
    negligibleRisk,
    riskSummary: summary.join(" "),
    deforestationFree,
    legalityClear,
  };
}
