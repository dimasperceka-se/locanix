import {
  featureCollectionFromPlots,
  plotsFromFeatureCollection,
  plotsFromValidation,
  type EudrResult,
  type FeatureCollection,
  type GeoFeature,
  type Plot,
} from "./geo";
import type { AnalysisKey } from "./data";

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** Like num(), but keeps "no data" (null / missing) distinct from a real 0. */
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

class AnalysisError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function callAnalysis(
  type: string,
  geojson: FeatureCollection,
  filename: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`/api/analysis/${type}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ geojson, filename }),
  });
  if (!res.ok) throw new AnalysisError(`${type} failed (HTTP ${res.status})`, res.status);
  return res.json();
}

function featuresOf(json: Record<string, unknown>): GeoFeature[] {
  const data = json?.data as { features?: GeoFeature[] } | undefined;
  return Array.isArray(data?.features) ? data!.features! : [];
}

function indexByPlotId(json: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const f of featuresOf(json)) {
    const id = String((f.properties as Record<string, unknown>)?.plot_id ?? "");
    if (id) map.set(id, f.properties as Record<string, unknown>);
  }
  return map;
}

/** POST the GeoJSON to /validate-geometry and map the result into plots (local fallback on error). */
export async function validateGeometry(
  fc: FeatureCollection,
  filename: string,
): Promise<Plot[]> {
  try {
    const json = await callAnalysis("validate-geometry", fc, filename);
    const features = featuresOf(json);
    if (features.length > 0) return plotsFromValidation(features);
    throw new Error("empty response");
  } catch (e) {
    console.warn("[analysis] validate-geometry fallback:", (e as Error).message);
    return plotsFromFeatureCollection(fc);
  }
}

/**
 * Result of an EUDR run: analyzed plots + any selected analyses that failed.
 * paymentRequired: the server refused the plots for lack of quota (HTTP 402).
 */
export type EudrRun = { plots: Plot[]; failed: AnalysisKey[]; paymentRequired: boolean };

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" ? (v as Record<string, unknown>) : {};
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Run the selected analyses in parallel and merge results back onto each plot. */
export async function runEudr(plots: Plot[], keys: AnalysisKey[]): Promise<EudrRun> {
  // Only plots with valid geometry are sent for analysis. Invalid plots are
  // returned untouched (no `eudr`) so the report can show their issues + skip.
  const analyzable = plots.filter((p) => p.isValid);
  if (analyzable.length === 0) return { plots, failed: [], paymentRequired: false };

  // Plots from separate uploads can share a plot_id (every file starts at
  // plot-0), so tag each feature with an id unique to this request.
  const fc = featureCollectionFromPlots(
    analyzable.map((p, i) => ({ ...p, plotId: `req-${i}` })),
  );
  const filename = "plots.geojson";
  const want = new Set(keys);

  let paymentRequired = false;
  const fetchIf = (enabled: boolean, endpoint: string) =>
    enabled
      ? callAnalysis(endpoint, fc, filename).catch((e) => {
          if (e instanceof AnalysisError && e.status === 402) paymentRequired = true;
          return null;
        })
      : Promise.resolve(null);

  const [defoJson, protJson, rainJson, ghgJson] = await Promise.all([
    fetchIf(want.has("deforestation"), "deforestation"),
    fetchIf(want.has("legality"), "protected-area"),
    fetchIf(want.has("rainfall"), "rainfall"),
    fetchIf(want.has("ghg"), "ghg-emission"),
  ]);

  // A selected analysis with no JSON back means the endpoint errored (e.g. the
  // backend returns 500 when Earth Engine isn't authorized) — surface it.
  const failed: AnalysisKey[] = [];
  if (want.has("deforestation") && !defoJson) failed.push("deforestation");
  if (want.has("legality") && !protJson) failed.push("legality");
  if (want.has("rainfall") && !rainJson) failed.push("rainfall");
  if (want.has("ghg") && !ghgJson) failed.push("ghg");

  // Match results by the per-request plot_id the API echoes back, falling back
  // to position within the analyzable subset.
  const defoMap = defoJson ? indexByPlotId(defoJson) : new Map();
  const protMap = protJson ? indexByPlotId(protJson) : new Map();
  const rainMap = rainJson ? indexByPlotId(rainJson) : new Map();
  const ghgMap = ghgJson ? indexByPlotId(ghgJson) : new Map();
  const defoArr = defoJson ? featuresOf(defoJson).map((f) => f.properties) : [];
  const protArr = protJson ? featuresOf(protJson).map((f) => f.properties) : [];
  const rainArr = rainJson ? featuresOf(rainJson).map((f) => f.properties) : [];
  const ghgArr = ghgJson ? featuresOf(ghgJson).map((f) => f.properties) : [];

  let ai = -1; // index within the analyzable (valid) plots
  const merged = plots.map((p) => {
    if (!p.isValid) return p; // skipped — invalid geometry carries no results
    ai += 1;
    const at = ai;
    const pick = (
      map: Map<string, Record<string, unknown>>,
      arr: Record<string, unknown>[],
    ) => map.get(`req-${at}`) ?? arr[at];

    const eudr: EudrResult = {};

    const d = pick(defoMap, defoArr);
    if (d) {
      const oc = obj(d.overall_compliance);
      const gfw = obj(d.gfw_loss);
      const jrc = obj(d.jrc_loss);
      const sbtn = obj(d.sbtn_loss);
      eudr.deforestation = {
        riskLevel: cap(String(oc.overall_risk ?? d.risk_level ?? "Unknown")),
        gfw: {
          ha: num(gfw.gfw_loss_area ?? d.gfw_loss_area_ha),
          pct: num(gfw.gfw_loss_percent ?? d.gfw_loss_percent),
        },
        jrc: {
          ha: num(jrc.jrc_loss_area ?? d.jrc_loss_area_ha),
          pct: num(jrc.jrc_loss_percent ?? d.jrc_loss_percent),
        },
        sbtn: {
          ha: num(sbtn.sbtn_loss_area ?? d.sbtn_loss_area_ha),
          pct: num(sbtn.sbtn_loss_percent ?? d.sbtn_loss_percent),
        },
      };
    }

    const pa = pick(protMap, protArr);
    if (pa)
      eudr.protectedArea = {
        status: String(pa.wdpa_status ?? "unknown"),
        categories: Array.isArray(pa.wdpa_categories)
          ? (pa.wdpa_categories as unknown[]).map(String)
          : [],
      };

    const r = pick(rainMap, rainArr);
    if (r) {
      const period = r.analysis_period as
        | { start_date?: string; end_date?: string }
        | undefined;
      eudr.rainfall = {
        meanMm: numOrNull(r.rainfall_mean_mm),
        minMm: numOrNull(r.rainfall_min_mm),
        maxMm: numOrNull(r.rainfall_max_mm),
        stdMm: numOrNull(r.rainfall_std_mm),
        areaHa: num(r.area_hectares),
        period: period
          ? { start: String(period.start_date ?? ""), end: String(period.end_date ?? "") }
          : undefined,
      };
    }

    const g = pick(ghgMap, ghgArr);
    if (g) {
      const ds = (k: string) =>
        (g[k] as { area_hectares?: unknown; net_emission_tco2e?: unknown }) ?? {};
      const gfwNet = num(ds("gfw_ghg_emission").net_emission_tco2e);
      const jrcNet = num(ds("jrc_ghg_emission").net_emission_tco2e);
      const sbtnNet = num(ds("sbtn_ghg_emission").net_emission_tco2e);
      eudr.ghg = {
        // No per-feature total from the API — fall back to the largest of the
        // three dataset estimates (GFW/JRC/SBTN are alternative methodologies).
        totalTco2e:
          g.total_net_emission_tco2e !== undefined
            ? num(g.total_net_emission_tco2e)
            : Math.max(gfwNet, jrcNet, sbtnNet),
        gfw: { ha: num(ds("gfw_ghg_emission").area_hectares), tco2e: gfwNet },
        jrc: { ha: num(ds("jrc_ghg_emission").area_hectares), tco2e: jrcNet },
        sbtn: { ha: num(ds("sbtn_ghg_emission").area_hectares), tco2e: sbtnNet },
      };
    }

    return { ...p, eudr };
  });

  return { plots: merged, failed, paymentRequired };
}
