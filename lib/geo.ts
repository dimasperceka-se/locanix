import GeoJSON from "ol/format/GeoJSON";
import { MultiPolygon, Polygon } from "ol/geom";
import { getArea } from "ol/sphere";
import { toLonLat } from "ol/proj";
import type { Coordinate } from "ol/coordinate";

/** An open polygon ring (no repeated closing vertex), in [lon, lat]. */
export type LonLatRing = [number, number][];

export type GeoChecks = {
  duplicateVertices: boolean;
  zeroArea: boolean;
  selfIntersection: boolean;
};

/** Results from the EUDR analysis endpoints, attached to a plot after "Run EUDR". */
export type DeforestationResult = {
  riskLevel: string;
  gfw: { ha: number; pct: number };
  jrc: { ha: number; pct: number };
  sbtn: { ha: number; pct: number };
};
export type ProtectedAreaResult = { status: string; categories: string[] };
/** Rainfall stats are null where the dataset has no coverage (CHIRPS: 50°S–50°N). */
export type RainfallResult = {
  meanMm: number | null;
  minMm: number | null;
  maxMm: number | null;
  stdMm: number | null;
  areaHa: number;
  period?: { start: string; end: string };
};
export type GhgResult = {
  totalTco2e: number;
  gfw: { ha: number; tco2e: number };
  jrc: { ha: number; tco2e: number };
  sbtn: { ha: number; tco2e: number };
};
export type EudrResult = {
  deforestation?: DeforestationResult;
  protectedArea?: ProtectedAreaResult;
  rainfall?: RainfallResult;
  ghg?: GhgResult;
};

export type Plot = {
  id: number;
  /** Stable id sent to / echoed by the analysis API (matches features across endpoints). */
  plotId: string;
  name: string;
  ring: LonLatRing;
  areaHa: number;
  checks: GeoChecks;
  isValid: boolean;
  issues: string[];
  eudr?: EudrResult;
};

/* ------------------------ GeoJSON FeatureCollection --------------------- */
export type GeoFeature = {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: number[][][] };
};
export type FeatureCollection = { type: "FeatureCollection"; features: GeoFeature[] };

function closedRing(ring: LonLatRing): number[][] {
  return ring.length >= 3 ? [...ring, ring[0]] : [...ring];
}

function feature(ring: LonLatRing, index: number, name: string): GeoFeature {
  return {
    type: "Feature",
    properties: { plot_id: `plot-${index}`, name },
    geometry: { type: "Polygon", coordinates: [closedRing(ring)] },
  };
}

/** Build a FeatureCollection (with stable plot_id per feature) from a GeoJSON string. */
export function featureCollectionFromText(
  text: string,
  baseName: string,
): FeatureCollection | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  let features;
  try {
    features = new GeoJSON().readFeatures(json as object);
  } catch {
    return null;
  }
  const rings: { ring: LonLatRing; name: string }[] = [];
  features.forEach((f, i) => {
    const g = f.getGeometry();
    if (!g) return;
    const existingName =
      (f.get("name") as string) || (f.get("plot_id") as string) || `${baseName} #${i + 1}`;
    if (g.getType() === "Polygon") {
      rings.push({ ring: openRing((g as Polygon).getCoordinates()[0]), name: existingName });
    } else if (g.getType() === "MultiPolygon") {
      (g as MultiPolygon).getCoordinates().forEach((poly, j) => {
        rings.push({ ring: openRing(poly[0]), name: `${existingName}-${j + 1}` });
      });
    }
  });
  if (rings.length === 0) return null;
  return {
    type: "FeatureCollection",
    features: rings.map((r, i) => feature(r.ring, i, r.name)),
  };
}

/** Build a FeatureCollection from coordinates drawn on the map (EPSG:3857). */
export function featureCollectionFromDrawn(
  coords: Coordinate[],
  name = "drawn_plot",
): FeatureCollection {
  const ring = coords.map((c) => {
    const ll = toLonLat(c);
    return [ll[0], ll[1]] as [number, number];
  });
  return { type: "FeatureCollection", features: [feature(ring, 0, name)] };
}

/** Rebuild a FeatureCollection from already-parsed plots (for the EUDR step). */
export function featureCollectionFromPlots(plots: Plot[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: plots.map((p, i) => ({
      type: "Feature",
      properties: { plot_id: p.plotId || `plot-${i}`, name: p.name },
      geometry: { type: "Polygon", coordinates: [closedRing(p.ring)] },
    })),
  };
}

export function sampleFeatureCollection(name = "sample_plot.geojson"): FeatureCollection {
  return featureCollectionFromPlots([samplePlot(name)]);
}

/** Build the human-readable issue list from the effective geometry checks. */
function issuesFromChecks(checks: GeoChecks, notRing: boolean): string[] {
  const out: string[] = [];
  if (checks.duplicateVertices) out.push("Duplicate vertices");
  if (checks.zeroArea) out.push("Zero area");
  if (checks.selfIntersection) out.push("Self-intersecting boundary");
  if (notRing) out.push("Not a closed ring");
  return out;
}

/** Map a validate-geometry API FeatureCollection back into Plot[]. */
export function plotsFromValidation(features: GeoFeature[]): Plot[] {
  return features.map((f, i) => {
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const ring = openRing((f.geometry?.coordinates?.[0] ?? []) as Coordinate[]);
    // The API counts a closed ring's mandatory closing vertex (first === last)
    // as a "duplicate", so it flags every well-formed polygon. Re-check
    // duplicates locally on the OPEN ring (closing vertex already stripped) to
    // drop that false positive; honor zero-area / self-intersection / not-ring
    // from the API as-is.
    const localChecks = checkGeometry(ring);
    const checks: GeoChecks = {
      duplicateVertices: localChecks.duplicateVertices,
      zeroArea: Boolean(props.zero_area),
      selfIntersection: Boolean(props.self_intersection),
    };
    const notRing = Boolean(props.not_ring);
    const areaSqm = Number(props.area_sqm ?? 0);
    return {
      id: nextId(),
      plotId: String(props.plot_id ?? `plot-${i}`),
      name: String(props.name ?? props.plot_id ?? `Plot ${i + 1}`),
      ring,
      areaHa: areaSqm > 0 ? areaSqm / 10_000 : ringAreaHa(ring),
      checks,
      // A plot is valid only when the effective checks report no defects.
      // Invalid plots are surfaced with their specific issue(s) and skipped
      // from further analysis (see geometryIssues / runEudr).
      isValid:
        !checks.duplicateVertices &&
        !checks.zeroArea &&
        !checks.selfIntersection &&
        !notRing,
      issues: issuesFromChecks(checks, notRing),
    };
  });
}

/**
 * Human-readable list of why a plot's geometry is invalid (empty when valid).
 * Uses the issues recorded on the plot, falling back to the boolean checks.
 */
export function geometryIssues(plot: Plot): string[] {
  if (plot.isValid) return [];
  if (plot.issues.length) return plot.issues;
  return issuesFromChecks(plot.checks, false).length
    ? issuesFromChecks(plot.checks, false)
    : ["Invalid geometry"];
}

let _id = 0;
const nextId = () => ++_id;

/* --------------------------------- area --------------------------------- */
export function ringAreaHa(ring: LonLatRing): number {
  if (ring.length < 3) return 0;
  const poly = new Polygon([[...ring, ring[0]]]);
  return getArea(poly, { projection: "EPSG:4326" }) / 10_000;
}

/* ------------------------------ geometry QA ----------------------------- */
const keyOf = (p: [number, number]) => `${p[0].toFixed(7)},${p[1].toFixed(7)}`;

export function checkGeometry(ring: LonLatRing): GeoChecks {
  const seen = new Set<string>();
  let duplicateVertices = false;
  for (const p of ring) {
    const k = keyOf(p);
    if (seen.has(k)) {
      duplicateVertices = true;
      break;
    }
    seen.add(k);
  }
  return {
    duplicateVertices,
    zeroArea: ringAreaHa(ring) < 1e-4,
    selfIntersection: hasSelfIntersection(ring),
  };
}

function hasSelfIntersection(ring: LonLatRing): boolean {
  const n = ring.length;
  if (n < 4) return false;
  const closed = [...ring, ring[0]];
  const edges: [[number, number], [number, number]][] = [];
  for (let i = 0; i < closed.length - 1; i++) {
    edges.push([closed[i], closed[i + 1]]);
  }
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if (j === i + 1) continue; // adjacent edges share a vertex
      if (i === 0 && j === edges.length - 1) continue; // first/last wrap around
      if (
        segmentsIntersect(edges[i][0], edges[i][1], edges[j][0], edges[j][1])
      ) {
        return true;
      }
    }
  }
  return false;
}

function orientation(
  a: [number, number],
  b: [number, number],
  c: [number, number],
): number {
  const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  if (Math.abs(v) < 1e-12) return 0;
  return v > 0 ? 1 : 2;
}

function segmentsIntersect(
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  p4: [number, number],
): boolean {
  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);
  return o1 !== o2 && o3 !== o4;
}

/* ------------------------------ builders -------------------------------- */
function openRing(closed: Coordinate[]): LonLatRing {
  const ring = closed.map((c) => [c[0], c[1]] as [number, number]);
  if (ring.length > 1) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) ring.pop();
  }
  return ring;
}

function makePlot(ring: LonLatRing, name: string, index = 0): Plot {
  const checks = checkGeometry(ring);
  return {
    id: nextId(),
    plotId: `plot-${index}`,
    name,
    ring,
    areaHa: ringAreaHa(ring),
    checks,
    isValid:
      !checks.duplicateVertices && !checks.zeroArea && !checks.selfIntersection,
    issues: issuesFromChecks(checks, false),
  };
}

/** Local fallback: build plots (with locally-computed checks) straight from a FeatureCollection. */
export function plotsFromFeatureCollection(fc: FeatureCollection): Plot[] {
  return fc.features.map((f, i) => {
    const ring = openRing((f.geometry?.coordinates?.[0] ?? []) as Coordinate[]);
    const plot = makePlot(ring, String(f.properties?.name ?? `Plot ${i + 1}`), i);
    plot.plotId = String(f.properties?.plot_id ?? `plot-${i}`);
    return plot;
  });
}

/**
 * Demo fallback near Sumber Jaya / Perk Pulau Rambung (North Sumatra) — used
 * when an uploaded file contains no parseable polygon, so the dashboard flow
 * still has something to show. ~1.9 ha quad.
 */
export function samplePlot(name = "sample_plot.geojson"): Plot {
  const ring: LonLatRing = [
    [98.2978, 3.5216],
    [98.2995, 3.5219],
    [98.2997, 3.5204],
    [98.2979, 3.5202],
  ];
  return makePlot(ring, name);
}
