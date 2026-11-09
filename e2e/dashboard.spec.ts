import { expect, test } from "./fixtures";
import { SMALL_PLOT, signedInAccount } from "./helpers";

// The dashboard with plots in it. Plots are put in the browser's plot store, as an
// upload would; nothing is sent to the analysis API (EUDR is never run here).

type Ring = [number, number][];
const MEDIUM_PLOT: Ring = [[106.802, -6.6], [106.8034, -6.6], [106.8034, -6.6014], [106.802, -6.6014]]; // ≈2.40 ha
const BOW_TIE: Ring = [[106.8, -6.6025], [106.8015, -6.604], [106.8015, -6.6025], [106.8, -6.604]]; // self-intersecting

const plot = (id: number, name: string, ring: Ring, areaHa: number, selfIntersection = false) => ({
  id, plotId: `e2e-${id}`, name, ring, areaHa,
  checks: { duplicateVertices: false, zeroArea: false, selfIntersection },
  isValid: !selfIntersection,
  issues: selfIntersection ? ["Self-intersecting boundary"] : [],
});

const PLOTS = [
  plot(1, "Kebun Kopi Bogor A", SMALL_PLOT, 0.0895),
  plot(2, "Kebun Kopi Bogor B", MEDIUM_PLOT, 2.4),
  plot(3, "Kebun Kopi Bogor C", BOW_TIE, 0, true),
];

test("the dashboard lists uploaded plots on a map and lets the user pick which to analyze", async ({ page, baseURL }) => {
  const account = await signedInAccount(page, "dashboard");
  await page.addInitScript(({ value, origin }) => {
    if (location.origin === origin) sessionStorage.setItem("locanix.plots", value);
  }, { value: JSON.stringify({ plots: PLOTS, eudrDone: false }), origin: baseURL! });

  await page.goto("/");
  await expect(page.getByText(`Hi, ${account.name}`)).toBeVisible();
  await page.getByRole("link", { name: "Go to dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await expect(page.getByText("Plot Uploaded")).toBeVisible();
  await expect(page.getByText("2.49", { exact: true })).toBeVisible(); // total hectares
  await expect(page.locator("tbody tr")).toHaveCount(PLOTS.length);
  for (const area of ["0.09 ha", "2.40 ha", "0.00 ha"]) await expect(page.getByText(area, { exact: true })).toBeVisible();
  // The self-intersecting plot cannot be selected for analysis.
  await expect(page.getByLabel("Select plot 3", { exact: true })).toBeDisabled();

  // Let the base map tiles finish loading before the map is captured.
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await expect(page.locator("canvas").first()).toBeVisible();

  // Only valid plots can be selected; unchecking one leaves the other ready to run.
  const selectAll = page.getByLabel("Select all valid plots");
  await expect(selectAll).toBeChecked();
  await page.getByLabel("Select plot 1", { exact: true }).uncheck();
  await expect(selectAll).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Run EUDR Analysis" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Export DDS" })).toBeDisabled();
  await selectAll.check();
  await expect(page.getByLabel("Select plot 1", { exact: true })).toBeChecked();
});
