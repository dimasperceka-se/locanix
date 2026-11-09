import { expect, test } from "./fixtures";

test("home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Locanix/);
  await expect(page.getByRole("heading", { level: 1, name: "Know which plots are safe to ship." })).toBeVisible();
});

test("pricing shows USD first and switches to IDR", async ({ page }) => {
  await page.goto("/#pricing");
  const pricing = page.locator("#pricing");
  await expect(pricing.getByRole("button", { name: "USD" })).toHaveAttribute("aria-pressed", "true");
  await expect(pricing.getByText("$4.90", { exact: true })).toBeVisible();
  await expect(pricing.getByText("$29", { exact: true })).toBeVisible();
  await pricing.getByRole("button", { name: "IDR" }).click();
  await expect(pricing.getByText("Rp88.200", { exact: true })).toBeVisible();
  await expect(pricing.getByText("Rp1.782.000", { exact: true })).toBeVisible();
  await expect(pricing.getByText("Extra usage Rp9.000/ha. Quota does not roll over.")).toBeVisible();
});

test("the free-analysis call to action leads to the upload page, which asks signed-out visitors to log in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Analyze 10 ha free →" }).click();
  await expect(page).toHaveURL(/\/analyze$/);
  await expect(page.getByRole("heading", { level: 1, name: "Your EUDR compliance check, ready in minutes." })).toBeVisible();
  await page.getByRole("link", { name: "Run compliance check" }).click();
  await expect(page).toHaveURL(/\/login\?next=(%2F|\/)analyze/);
});

test("the landing preview map zooms and toggles its layers", async ({ page }) => {
  await page.goto("/");
  const preview = page.getByRole("region", { name: "Product preview" });
  await preview.scrollIntoViewIfNeeded();
  await expect(preview.locator(".landing-preview-map canvas").first()).toBeVisible();
  await expect(preview.getByText("Supplier plots — Pelalawan, Riau")).toBeVisible();
  await expect(preview.getByText("Overlap · IUCN II")).toBeVisible();
  await preview.getByRole("button", { name: "Zoom in" }).click();
  await preview.getByRole("button", { name: "Zoom out" }).click();
  await preview.getByLabel("Deforestation alerts (GLAD)").uncheck();
  await expect(preview.getByText("GLAD alerts: UMD / Global Forest Watch", { exact: false })).toHaveCount(0);
  await preview.getByLabel("Deforestation alerts (GLAD)").check();
  await expect(preview.getByText("GLAD alerts: UMD / Global Forest Watch", { exact: false })).toBeVisible();
});

test("privacy page shows the published terms", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { name: "PRIVACY POLICY" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Limitation of Liability" })).toBeVisible();
});

for (const path of ["/dashboard", "/checkout"]) {
  test(`signed-out visitors to ${path} are sent to log in`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=(%2F|/)${path.slice(1)}`));
  });
}

test.describe("landing preview export", () => {
  // Rules: TRACES "EUDR GeoJSON description" and the SystemEarth DDR (eudr-api
  // _transform_to_ddr_format, csv-validation-function config).
  const DDR_HEADER = [
    "a1_factory_id", "a2_lot_number", "a3_plot_id", "a4_processing_date", "a5_production_harvest_date",
    "a6_tier1_supplier_id", "a7_size_of_plot_ha", "a8_plantation_size_type", "b1_supply_chain_type",
    "b2_leakage_mitigation", "c1_indicate_deforestation_analysis_layer_used", "c2_deforestation_spatial_analysis_result",
    "c3_mitigation_if_indication_found", "c4_reference_or_link_if_applicable", "c5_deforestation_final_status",
    "d1_strict_protected_area_spatial_analysis_result", "d2_restricted_use_area_spatial_analysis_result",
    "d3_land_tenure_or_documentation", "d4_further_mitigation_if_any", "d5_land_tenure_and_use_rights_final_status",
    "e1_plot_located_on_environmentally_non_compliant_area", "e2_non_compliant_chemical_use",
    "e3_environmental_protection_final_status", "f1_child_labor", "f2_workers", "f3_forced_or_migrant_labor",
    "f4_labor_and_human_rights_final_status", "g1_fpic_and_land_conflict_with_local_communities",
    "h1_trade_tax_and_corruption", "i1_eudr_status", "j1_contribution_from_plot_dry_weight_kg",
    "j2_annual_quota_from_plot_dry_weight_kg", "j3_country_of_origin", "j4_province_of_origin", "j5_district_of_origin",
  ];
  const ALLOWED: Record<string, string[]> = {
    a8_plantation_size_type: ["a. Smallholder", "b. Medium Plantation", "c. Large Plantation"],
    c2_deforestation_spatial_analysis_result: ["a. No Indication of deforestation", "b. Indication of deforestation"],
    c3_mitigation_if_indication_found: ["a. Secondary satellite analysis check", "b. On-site verification with evidence", "c. Not Applicable"],
    c5_deforestation_final_status: ["a. Deforestation-free", "b. Deforestation present"],
    d1_strict_protected_area_spatial_analysis_result: ["a. No overlap with strict PA", "b. Overlap with strict PA"],
    d2_restricted_use_area_spatial_analysis_result: ["a. No overlap with RA", "b. Overlap with RA"],
    i1_eudr_status: ["a. Compliant", "b. Non-compliant"],
  };

  const download = async (page: import("@playwright/test").Page, option: string) => {
    const preview = page.getByRole("region", { name: "Product preview" });
    await preview.getByRole("button", { name: "Export" }).click();
    const [file] = await Promise.all([page.waitForEvent("download"), preview.getByRole("menuitem", { name: new RegExp(`^${option}`) }).click()]);
    const { readFile } = await import("node:fs/promises");
    return { name: file.suggestedFilename(), text: await readFile((await file.path())!, "utf8") };
  };

  test("GeoJSON follows the EUIS geolocation format", async ({ page }) => {
    await page.goto("/");
    const { name, text } = await download(page, "GeoJSON");
    expect(name).toMatch(/\.geojson$/);
    const fc = JSON.parse(text);
    expect(fc.type).toBe("FeatureCollection");
    expect(fc.features).toHaveLength(4);
    for (const f of fc.features) {
      expect(Object.keys(f.properties)).toEqual(["ProducerName", "ProducerCountry", "ProductionPlace", "Area"]);
      expect(typeof f.properties.Area).toBe("number");
      expect(f.properties.ProducerCountry).toMatch(/^[A-Z]{2}$/);
      expect(f.geometry.type).toBe("Polygon");
      const ring: number[][] = f.geometry.coordinates[0];
      expect(f.geometry.coordinates).toHaveLength(1); // no holes
      expect(ring.length).toBeGreaterThanOrEqual(4);
      expect(ring[0]).toEqual(ring[ring.length - 1]);
      for (const [i, [lon, lat]] of ring.entries()) {
        expect(Math.abs(lon)).toBeLessThanOrEqual(180);
        expect(Math.abs(lat)).toBeLessThanOrEqual(90);
        for (const n of [lon, lat]) expect(String(n).split(".")[1]?.length ?? 0).toBeLessThanOrEqual(6);
        if (i > 0) expect(ring[i]).not.toEqual(ring[i - 1]);
      }
    }
    expect(fc.features.map((f: { properties: { ProductionPlace: string } }) => f.properties.ProductionPlace)).toEqual(["A", "B", "C", "D"]);
  });

  test("DDR is the 35-column SystemEarth CSV and matches the GeoJSON plot IDs", async ({ page }) => {
    await page.goto("/");
    const { name, text } = await download(page, "DDR");
    expect(name).toMatch(/\.csv$/);
    expect(text.endsWith("\r\n")).toBe(true);
    const lines = text.trimEnd().split("\r\n");
    const parse = (line: string) => {
      expect(line).toMatch(/^"(?:[^"]|"")*"(?:,"(?:[^"]|"")*")*$/); // every cell quoted
      return [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((m) => m[1].replace(/""/g, '"'));
    };
    expect(parse(lines[0])).toEqual(DDR_HEADER);
    const rows = lines.slice(1).map((l) => Object.fromEntries(parse(l).map((v, i) => [DDR_HEADER[i], v])));
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.a3_plot_id)).toEqual(["A", "B", "C", "D"]);
    for (const r of rows) {
      expect(Object.keys(r)).toHaveLength(35);
      expect(Number.isFinite(Number(r.a7_size_of_plot_ha))).toBe(true);
      expect(r.j3_country_of_origin).toBe("ID");
      for (const [col, allowed] of Object.entries(ALLOWED)) if (r[col]) expect(allowed).toContain(r[col]);
    }
    // Real results: B overlaps the national park, C has post-2020 loss.
    const byId = Object.fromEntries(rows.map((r) => [r.a3_plot_id, r]));
    expect(byId.B.d1_strict_protected_area_spatial_analysis_result).toBe("b. Overlap with strict PA");
    expect(byId.C.c2_deforestation_spatial_analysis_result).toBe("b. Indication of deforestation");
    expect(byId.A.c5_deforestation_final_status).toBe("a. Deforestation-free");
  });
});
