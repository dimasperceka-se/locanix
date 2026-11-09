import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "./fixtures";
import { DATA_DIR, SMALL_PLOT, seedPlots, signedInAccount } from "./helpers";

// Full buyer flow on PayPal's own Sandbox pages. Opt-in, because it needs a
// Sandbox *personal* account and depends on PayPal's page markup:
//   E2E_PAYPAL_BUYER_EMAIL=sb-…@personal.example.com E2E_PAYPAL_BUYER_PASSWORD=… npm run test:e2e -- paypal-approval
const buyerEmail = process.env.E2E_PAYPAL_BUYER_EMAIL;
const buyerPassword = process.env.E2E_PAYPAL_BUYER_PASSWORD;

test.skip(!buyerEmail || !buyerPassword, "Set E2E_PAYPAL_BUYER_EMAIL and E2E_PAYPAL_BUYER_PASSWORD to run");

test("a Sandbox buyer pays for a plot and gets dashboard access", async ({ page, baseURL }) => {
  test.setTimeout(240_000);
  await signedInAccount(page, "buyer");
  await seedPlots(page, [SMALL_PLOT], baseURL!);
  await page.goto("/checkout");
  await expect(page.getByText("$0.44 USD")).toBeVisible();
  await page.getByRole("button", { name: "Pay with PayPal" }).click();
  await page.waitForURL(/sandbox\.paypal\.com/);

  await page.locator("#email").fill(buyerEmail!);
  const next = page.locator("#btnNext");
  if (await next.isVisible()) await next.click();
  await page.locator("#password").fill(buyerPassword!);
  await page.locator("#btnLogin").click();
  await page.locator('#payment-submit-btn, [data-testid="submit-button-initial"]').first().click({ timeout: 90_000 });

  await page.waitForURL(new RegExp(`^${baseURL}/dashboard`), { timeout: 120_000 });
  const ledger = JSON.parse(await readFile(path.join(DATA_DIR, "billing", "sandbox", "ledger.json"), "utf8"));
  const purchases = Object.values(ledger.purchases) as { plan: string; amount: string; status: string }[];
  expect(purchases.some((p) => p.plan === "payg" && p.amount === "0.44" && p.status === "COMPLETED")).toBeTruthy();
});
