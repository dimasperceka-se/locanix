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
