import { geometryIssues, type Plot } from "./geo";
import type { SurveyData } from "./plotStore";
import type { AnalysisKey } from "./data";

const n = (v: number | null | undefined) => (typeof v === "number" ? Number(v.toFixed(3)) : "-");

/** Build and download an .xlsx compliance report from analyzed plots. */
export async function downloadPlotsExcel(
  plots: Plot[],
  survey?: SurveyData | null,
  filename = "locanix-compliance-report.xlsx",
  failed: AnalysisKey[] = [],
) {
  const XLSX = await import("xlsx"); // lazy — keep it out of the page bundle
  const NA = "Not analyzed"; // shown for plots skipped due to invalid geometry
  const DOWN = "Unavailable"; // analysis endpoint errored (e.g. service down)
  const down = new Set(failed);
  // For a valid plot, show "Unavailable" when the endpoint failed, else the value.
  const cell = (ok: boolean, key: AnalysisKey, value: string | number) =>
    !ok ? NA : down.has(key) ? DOWN : value;
  const rows = plots.map((p, i) => {
    const d = p.eudr?.deforestation;
    const pa = p.eudr?.protectedArea;
    const ok = p.isValid;
    return {
      No: i + 1,
      Plot: p.name,
      "Area (ha)": Number(p.areaHa.toFixed(4)),
      Geometry: ok ? "Valid" : geometryIssues(p).join("; "),
      Status: ok ? "Analyzed" : "Not analyzed (invalid geometry)",
      "Deforestation Risk": cell(ok, "deforestation", d?.riskLevel ?? "-"),
      "GFW Loss (ha)": cell(ok, "deforestation", n(d?.gfw.ha)),
      "JRC Loss (ha)": cell(ok, "deforestation", n(d?.jrc.ha)),
      "SBTN Loss (ha)": cell(ok, "deforestation", n(d?.sbtn.ha)),
      "Land Legality": cell(ok, "legality", pa?.status ?? "-"),
      "WDPA Categories": cell(ok, "legality", pa?.categories?.join(", ") || "-"),
    };
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Plots");

  if (survey && Object.keys(survey).length > 0) {
    const surveyRows = Object.entries(survey).map(([Field, Value]) => ({ Field, Value }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(surveyRows), "Plot Survey");
  }

  XLSX.writeFile(wb, filename);
}
