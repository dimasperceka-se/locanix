import type { DdsDetails } from "@/lib/dds";
import { ddrCsv, euisGeoJson, plantationSizeType, type DdrRow, type EuisPlot } from "@/lib/euisExport";
import type { Plot } from "@/lib/geo";
import { PREVIEW_PLOTS, type PreviewPlot } from "./preview-data";

/** The preview's sample plots as EUIS GeoJSON and as a DDR. */

const PRODUCER = { name: "Locanix sample supplier", country: "ID", province: "Riau", district: "Pelalawan" };

export function previewGeoJson(): string {
  const plots: EuisPlot[] = PREVIEW_PLOTS.map((p) => ({
    producerName: PRODUCER.name,
    producerCountry: PRODUCER.country,
    productionPlace: p.id,
    areaHa: p.areaHa,
    ring: p.ring,
  }));
  return euisGeoJson(plots);
}

/**
 * Only what the analysis establishes is filled in: plot size, deforestation (C),
 * protected-area overlap (D1, D2), origin (J3–J5), and a non-compliant EUDR status
 * where the analysis alone proves it. Supplier and operator evidence (factory, lots,
 * land documents, labour, tax, mitigation) is left blank rather than invented.
 */
function ddrRow(p: PreviewPlot): DdrRow {
  const loss = p.risk === "high";
  const strict = p.wdpaStatus === "non_compliant";
  return {
    a3_plot_id: p.id,
    a7_size_of_plot_ha: p.areaHa.toFixed(2),
    a8_plantation_size_type: plantationSizeType(p.areaHa),
    c1_indicate_deforestation_analysis_layer_used: "GFW, JRC and SBTN tree cover loss 2021-2024",
    c2_deforestation_spatial_analysis_result: loss ? "b. Indication of deforestation" : "a. No Indication of deforestation",
    c3_mitigation_if_indication_found: loss ? "" : "c. Not Applicable",
    c4_reference_or_link_if_applicable: "Locanix analysis, 9 Nov 2026",
    c5_deforestation_final_status: loss ? "b. Deforestation present" : "a. Deforestation-free",
    d1_strict_protected_area_spatial_analysis_result: strict ? "b. Overlap with strict PA" : "a. No overlap with strict PA",
    d2_restricted_use_area_spatial_analysis_result: p.wdpaStatus === "indicative" ? "b. Overlap with RA" : "a. No overlap with RA",
    i1_eudr_status: loss || strict ? "b. Non-compliant" : "",
    j3_country_of_origin: PRODUCER.country,
    j4_province_of_origin: PRODUCER.province,
    j5_district_of_origin: PRODUCER.district,
  };
}

export function previewDdr(): string {
  // Same plot order as the GeoJSON, so a3_plot_id lines up with ProductionPlace.
  const plots = [...PREVIEW_PLOTS].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  return ddrCsv(plots.map(ddrRow));
}

/**
 * The preview plots as a Due Diligence Statement, built by the same generator as the
 * dashboard's DDS export. Screening comes from the real API results; the operator and
 * product fields are sample placeholders, since the landing page has no operator.
 */
export async function downloadPreviewDds() {
  const [{ buildDds }, { downloadDdsPdf }] = await Promise.all([import("@/lib/dds"), import("@/lib/ddsPdf")]);
  const plots: Plot[] = [...PREVIEW_PLOTS]
    .sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))
    .map((p, i) => ({
      id: i + 1,
      plotId: p.id,
      name: `Plot ${p.id}`,
      ring: p.ring,
      areaHa: p.areaHa,
      checks: { duplicateVertices: false, zeroArea: false, selfIntersection: false },
      isValid: true,
      issues: [],
      eudr: {
        deforestation: { riskLevel: p.risk === "high" ? "High" : "Low", ...p.datasets },
        protectedArea: { status: p.wdpaStatus, categories: p.wdpaCategories },
      },
    }));
  const details: DdsDetails = {
    legalName: "Sample operator (Locanix demo)",
    vat: "SAMPLE-VAT",
    eori: "SAMPLE-EORI",
    operatorCountry: "ID",
    operatorType: "operator",
    size: "medium",
    product: "Crude palm oil",
    hsCode: "1511.10",
    quantityKg: "25000",
    productionCountry: "Indonesia",
    countryRisk: "standard",
    suppliers: `${PRODUCER.name} (${PRODUCER.district}, ${PRODUCER.province})`,
    riskNotes: "",
    euReference: "",
    representative: "",
  };
  const date = new Date();
  const model = buildDds(plots, details, date);
  const pad = (n: number) => String(n).padStart(2, "0");
  model.reference = `DDS-SAMPLE-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  await downloadDdsPdf(model);
}
