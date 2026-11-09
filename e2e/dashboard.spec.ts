import { expect, test } from "./fixtures";
import { SMALL_PLOT, signedInAccount } from "./helpers";

// The plot workspace with plots in it. Plots (and, for two of them, EUDR results)
// are put in the browser's plot store, as an upload and a finished run would;
// nothing is sent to the analysis API.

type Ring = [number, number][];
const MEDIUM_PLOT: Ring = [[106.802, -6.6], [106.8034, -6.6], [106.8034, -6.6014], [106.802, -6.6014]]; // ≈2.40 ha
const ONE_HA_PLOT: Ring = [[106.805, -6.6], [106.8059, -6.6], [106.8059, -6.6009], [106.805, -6.6009]]; // ≈0.99 ha
const BOW_TIE: Ring = [[106.8, -6.6025], [106.8015, -6.604], [106.8015, -6.6025], [106.8, -6.604]]; // self-intersecting

const none = { ha: 0, pct: 0 };
const plot = (id: number, name: string, ring: Ring, areaHa: number, extra: Record<string, unknown> = {}) => ({
  id, plotId: `e2e-${id}`, name, ring, areaHa,
  checks: { duplicateVertices: false, zeroArea: false, selfIntersection: false },
  isValid: true, issues: [], ...extra,
});

const PLOTS = [
  plot(1, "Kebun Kopi Bogor A", SMALL_PLOT, 0.0895, {
    eudr: { deforestation: { riskLevel: "Low", gfw: none, jrc: none, sbtn: none }, protectedArea: { status: "compliant", categories: [] } },
  }),
  plot(2, "Kebun Kopi Bogor B", MEDIUM_PLOT, 2.4, {
    eudr: { deforestation: { riskLevel: "Low", gfw: none, jrc: none, sbtn: none }, protectedArea: { status: "non_compliant", categories: ["II"] } },
  }),
  plot(3, "Kebun Kopi Bogor C", BOW_TIE, 0, {
    checks: { duplicateVertices: false, zeroArea: false, selfIntersection: true },
    isValid: false, issues: ["Self-intersecting boundary"],
  }),
  plot(4, "Kebun Kopi Bogor D", ONE_HA_PLOT, 0.99),
];

test("the plot workspace shows statuses, filters plots and explains the selected one", async ({ page, baseURL }) => {
  const account = await signedInAccount(page, "dashboard");
  await page.addInitScript(({ value, origin }) => {
    if (location.origin === origin) sessionStorage.setItem("locanix.plots", value);
  }, { value: JSON.stringify({ plots: PLOTS, eudrDone: true }), origin: baseURL! });

  await page.goto("/");
  await expect(page.getByText(`Hi, ${account.name}`)).toBeVisible();
  await page.getByRole("link", { name: "Go to dashboard" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: "Plots" })).toBeVisible();

  // Stats and the free allowance in the sidebar.
  await expect(page.getByText("3.48 ha", { exact: true })).toBeVisible();
  await expect(page.getByText("Free allowance")).toBeVisible();
  await expect(page.getByText(`0 of 10 free ha used`)).toBeVisible();

  // The plot needing review is shown first, with the reason.
  const detail = page.getByRole("region", { name: "Plot detail" });
  await expect(detail.getByRole("heading", { name: "Kebun Kopi Bogor B" })).toBeVisible();
  await expect(detail.getByText("Part of this plot lies inside a protected area.", { exact: false })).toBeVisible();
  await expect(detail.getByText("Overlap · IUCN II")).toBeVisible();
  await expect(detail.getByRole("button", { name: "Export DDS (PDF)" })).toBeEnabled();

  // Filters.
  const list = page.getByRole("region", { name: "Plot list" });
  await list.getByRole("button", { name: "Invalid · 1" }).click();
  await expect(list.getByRole("button", { name: /Kebun Kopi Bogor C/ })).toBeVisible();
  await expect(list.getByRole("button", { name: /Kebun Kopi Bogor A/ })).toHaveCount(0);
  await list.getByRole("button", { name: /Kebun Kopi Bogor C/ }).click();
  await expect(detail.getByText("Fix geometry")).toBeVisible();
  await expect(detail.getByRole("button", { name: "Export DDS (PDF)" })).toBeDisabled();
  await list.getByRole("button", { name: "All · 4" }).click();
  await list.getByRole("button", { name: /Kebun Kopi Bogor A/ }).click();
  await expect(detail.getByText("Ready for your due diligence statement.", { exact: false })).toBeVisible();

  // Only valid plots can be selected for a run.
  const selectAll = page.getByLabel("Select all valid plots");
  await expect(selectAll).toBeChecked();
  await expect(page.getByLabel("Select plot 3", { exact: true })).toBeDisabled();
  await page.getByLabel("Select plot 1", { exact: true }).uncheck();
  await expect(selectAll).not.toBeChecked();
  await expect(list.getByText("2 of 3 selected · 3.39 ha")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run EUDR analysis" })).toBeEnabled();
  await selectAll.check();

  // The full map view, then the other workspace pages.
  await detail.getByRole("button", { name: "Open on map" }).click();
  await expect(page).toHaveURL(/\/dashboard\/eudr\/1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Kebun Kopi Bogor A" })).toBeVisible();
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await expect(page.locator("canvas").first()).toBeVisible();
  // Protected-area (WDPA) and deforestation (GLAD) layers, on by default and toggleable.
  const wdpa = page.getByLabel("Protected areas (WDPA)");
  const glad = page.getByLabel("Deforestation alerts (GLAD)");
  await expect(wdpa).toBeChecked();
  await expect(glad).toBeChecked();
  await glad.uncheck();
  await expect(page.getByText("GLAD alerts: UMD via GFW", { exact: false })).toHaveCount(0);
  await glad.check();
  await page.getByRole("button", { name: "Layers" }).click();
  await expect(wdpa).toHaveCount(0);
  await page.getByRole("button", { name: "Layers" }).click();
  await expect(wdpa).toBeChecked();

  await page.getByRole("link", { name: "Reports & DDS" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reports & DDS" })).toBeVisible();
  await expect(page.getByText("2 of 4 plots analyzed.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export DDS (PDF)" })).toBeEnabled();

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByText(account.email, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Send password reset link" })).toBeVisible();
});

test("plots and analysis results are saved to the account and survive a reload and a new tab", async ({ page, context }) => {
  await signedInAccount(page, "persist");
  // Agree to the data-use statement, as the app asks before the first upload.
  const { version } = await (await page.request.get("/api/consent")).json();
  expect((await page.request.post("/api/consent", { data: { version } })).ok()).toBeTruthy();

  // Plots with results in this tab's cache, as an upload and a run leave them; the
  // workspace then saves them to the account.
  await page.goto("/dashboard");
  await page.evaluate((v) => sessionStorage.setItem("locanix.plots", v), JSON.stringify({ plots: PLOTS, eudrDone: true }));
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/workspace") && r.request().method() === "POST");
  await page.reload();
  expect((await saved).ok()).toBeTruthy();
  await expect(page.getByText("3.48 ha", { exact: true })).toBeVisible();

  // A new tab has no cache: everything comes from the server.
  const tab = await context.newPage();
  await tab.goto("/dashboard/eudr");
  await expect(tab.getByText("2 of 4 plots analyzed.", { exact: false })).toBeVisible();
  await expect(tab.getByText("Overlap · IUCN II")).toBeVisible();
  await tab.goto("/dashboard/eudr/2");
  await expect(tab.getByRole("heading", { level: 1, name: "Kebun Kopi Bogor B" })).toBeVisible();

  const { workspace } = await (await tab.request.get("/api/workspace")).json();
  expect(workspace.plots).toHaveLength(4);
  expect(workspace.plots[1].eudr.protectedArea).toEqual({ status: "non_compliant", categories: ["II"] });
});

test("the workspace API refuses plots without data-use consent", async ({ page }) => {
  await signedInAccount(page, "noconsent");
  const res = await page.request.post("/api/workspace", { data: { plots: PLOTS, eudrDone: true } });
  expect(res.status()).toBe(403);
});
