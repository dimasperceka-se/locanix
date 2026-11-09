import { createHash } from "node:crypto";
import { checkGeometry, ringAreaHa, type LonLatRing } from "../geo";
import { BillingError } from "./paypal";
import type { BilledPlot } from "./billingStore";

/** Prices and entitlements derive from geometry, never a browser-supplied area. */
export function billedPlots(input: unknown): BilledPlot[] {
  if (!Array.isArray(input) || !input.length || input.length > 1000) throw new BillingError("Select 1–1000 valid plots.");
  return input.map((item) => {
    if (!Array.isArray(item?.ring) || item.ring.length < 3 || item.ring.length > 2000) throw new BillingError("Invalid plot geometry.");
    const ring = item.ring.map((p: unknown) => {
      if (!Array.isArray(p) || p.length !== 2 || p.some(n => typeof n !== "number" || !Number.isFinite(n)) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) throw new BillingError("Invalid plot coordinates.");
      return [p[0], p[1]];
    }) as LonLatRing;
    if (JSON.stringify(ring[0]) === JSON.stringify(ring[ring.length - 1])) ring.pop();
    if (ring.length < 3) throw new BillingError("Invalid plot geometry.");
    const checks = checkGeometry(ring);
    if (checks.selfIntersection || checks.duplicateVertices || checks.zeroArea) throw new BillingError("Fix invalid plots before paying.");
    const areaHa = ringAreaHa(ring);
    if (!Number.isFinite(areaHa) || areaHa <= 0 || areaHa > 100000) throw new BillingError("Plot area is out of range.");
    // Same boundary has the same key irrespective of starting vertex or direction.
    const strings = ring.map(p => JSON.stringify(p));
    const start = strings.indexOf([...strings].sort()[0]);
    const forward = [...strings.slice(start), ...strings.slice(0, start)];
    const reverse = [forward[0], ...forward.slice(1).reverse()];
    const canonical = [forward.join(";"), reverse.join(";")].sort()[0];
    return { key: createHash("sha256").update(canonical).digest("hex"), areaHa };
  }).filter((p, i, all) => all.findIndex(other => other.key === p.key) === i);
}

export function plotsFromGeoJSON(value: unknown): BilledPlot[] {
  const fc = value as { type?: string; features?: { geometry?: { type?: string; coordinates?: unknown[] } }[] };
  if (fc?.type !== "FeatureCollection" || !Array.isArray(fc.features)) throw new BillingError("Invalid GeoJSON.");
  return billedPlots(fc.features.map(f => {
    if (f.geometry?.type !== "Polygon" || f.geometry.coordinates?.length !== 1) throw new BillingError("Only single-ring polygons are supported.");
    return { ring: f.geometry.coordinates[0] };
  }));
}
