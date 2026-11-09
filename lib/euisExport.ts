/**
 * File formats around EUIS (the EU's TRACES system for EUDR).
 *
 * - GeoJSON geolocation, the EUIS standard: FeatureCollection, WGS 84 lon/lat,
 *   coordinates cut to 6 decimals, closed polygons, and exactly four properties in a
 *   fixed order. Reference: TRACES "EUDR GeoJSON description".
 * - DDR (Due Diligence Report), the SystemEarth CSV kept as evidence behind a DDS; it is
 *   not sent to EUIS. 35 columns in the order of eudr-api `_transform_to_ddr_format`,
 *   every cell quoted, as written by `_generate_csv` (Python csv, QUOTE_ALL, CRLF).
 */

export type EuisPlot = {
  producerName: string;
  /** ISO 3166-1 alpha-2, e.g. "ID". */
  producerCountry: string;
  /** Plot ID; must equal `a3_plot_id` in the DDR. */
  productionPlace: string;
  areaHa: number;
  /** Outer ring as [lon, lat], open or closed. */
  ring: [number, number][];
};

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Closed ring with 6-decimal coordinates and no repeated consecutive points. */
function euisRing(ring: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [lon, lat] of ring) {
    const p: [number, number] = [round6(lon), round6(lat)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  if (out.length > 1 && out[0][0] === out[out.length - 1][0] && out[0][1] === out[out.length - 1][1]) out.pop();
  if (out.length < 3) throw new Error("A polygon needs at least three distinct points.");
  return [...out, out[0]];
}

const natural = new Intl.Collator("en", { numeric: true });

/** EUIS geolocation GeoJSON (Type II: every feature carries its producer). */
export function euisGeoJson(plots: EuisPlot[]): string {
  const features = [...plots]
    .sort((a, b) => a.producerName.localeCompare(b.producerName) || natural.compare(a.productionPlace, b.productionPlace))
    .map((p) => ({
      type: "Feature",
      // Exactly these four, in this order; names are case-sensitive and Area must be a number.
      properties: {
        ProducerName: p.producerName,
        ProducerCountry: p.producerCountry,
        ProductionPlace: p.productionPlace,
        Area: Math.round(p.areaHa * 100) / 100,
      },
      geometry: { type: "Polygon", coordinates: [euisRing(p.ring)] },
    }));
  // One feature per line: compact (EUIS caps a DDS at 25 MB of GeoJSON) yet readable.
  return `{"type":"FeatureCollection","features":[\n${features.map((f) => JSON.stringify(f)).join(",\n")}\n]}\n`;
}

export const DDR_COLUMNS = [
  "a1_factory_id",
  "a2_lot_number",
  "a3_plot_id",
  "a4_processing_date",
  "a5_production_harvest_date",
  "a6_tier1_supplier_id",
  "a7_size_of_plot_ha",
  "a8_plantation_size_type",
  "b1_supply_chain_type",
  "b2_leakage_mitigation",
  "c1_indicate_deforestation_analysis_layer_used",
  "c2_deforestation_spatial_analysis_result",
  "c3_mitigation_if_indication_found",
  "c4_reference_or_link_if_applicable",
  "c5_deforestation_final_status",
  "d1_strict_protected_area_spatial_analysis_result",
  "d2_restricted_use_area_spatial_analysis_result",
  "d3_land_tenure_or_documentation",
  "d4_further_mitigation_if_any",
  "d5_land_tenure_and_use_rights_final_status",
  "e1_plot_located_on_environmentally_non_compliant_area",
  "e2_non_compliant_chemical_use",
  "e3_environmental_protection_final_status",
  "f1_child_labor",
  "f2_workers",
  "f3_forced_or_migrant_labor",
  "f4_labor_and_human_rights_final_status",
  "g1_fpic_and_land_conflict_with_local_communities",
  "h1_trade_tax_and_corruption",
  "i1_eudr_status",
  "j1_contribution_from_plot_dry_weight_kg",
  "j2_annual_quota_from_plot_dry_weight_kg",
  "j3_country_of_origin",
  "j4_province_of_origin",
  "j5_district_of_origin",
] as const;

export type DdrColumn = (typeof DDR_COLUMNS)[number];
export type DdrRow = Partial<Record<DdrColumn, string>>;

const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;

/** DDR CSV: fixed 35-column header, every cell quoted, CRLF line endings. */
export function ddrCsv(rows: DdrRow[]): string {
  const lines = [DDR_COLUMNS.map(quote).join(","), ...rows.map((r) => DDR_COLUMNS.map((c) => quote(r[c] ?? "")).join(","))];
  return lines.join("\r\n") + "\r\n";
}

/**
 * Under 25 ha is a smallholding in Indonesia (no plantation business licence needed).
 * The DDR has no fixed medium/large threshold; 1,000 ha is our assumption.
 */
export function plantationSizeType(areaHa: number): string {
  if (areaHa < 25) return "a. Smallholder";
  if (areaHa < 1000) return "b. Medium Plantation";
  return "c. Large Plantation";
}

/** Save text as a file in the browser. */
export function downloadText(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
