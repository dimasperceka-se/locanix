import { expect, test, type Page } from "./fixtures";
import { LARGE_PLOT, SMALL_PLOT, seedPlots, signedInAccount } from "./helpers";

// Uses PayPal Sandbox (credentials from .env). Checkouts are created but never
// approved; pending subscriptions are cancelled again.

const toPayPal = async (page: Page) => {
  await page.getByRole("button", { name: "Pay with PayPal" }).click();
  await page.waitForURL(/^https:\/\/www\.sandbox\.paypal\.com\//, { waitUntil: "commit" });
};

test.beforeEach(async ({ page }) => {
  await signedInAccount(page, "checkout");
});

test("free-tier users get the dashboard, and checkout runs on Sandbox", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("No plots yet")).toBeVisible();
  await page.goto("/checkout");
  await expect(page.getByText("Sandbox testing")).toBeVisible();
});

test("pay-as-you-go needs plots and is priced from their area", async ({ page, baseURL }) => {
  await page.goto("/checkout");
  await expect(page.getByText("Add valid plots before paying per hectare.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay with PayPal" })).toBeDisabled();

  await seedPlots(page, [SMALL_PLOT], baseURL!);
  await page.reload();
  await expect(page.getByText("0.0895 ha")).toBeVisible();
  await expect(page.getByText("$0.44 USD")).toBeVisible();
  await toPayPal(page);
  expect(page.url()).toContain("sandbox.paypal.com");
});

test("pay-as-you-go can be paid by card through PayPal; monthly plans need a PayPal account", async ({ page, baseURL }) => {
  await seedPlots(page, [SMALL_PLOT], baseURL!);
  await page.goto("/checkout");
  await expect(page.getByText("$0.44 USD")).toBeVisible();
  await page.getByRole("button", { name: /^REGULAR/ }).click();
  await expect(page.getByText("$29.00 USD")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay with card" })).toBeDisabled();
  await page.getByRole("button", { name: /^PAY AS YOU GO/ }).click();
  await expect(page.getByText("$0.44 USD")).toBeVisible();
  await page.getByRole("button", { name: "Pay with card" }).click();
  await page.waitForURL(/^https:\/\/www\.sandbox\.paypal\.com\//, { waitUntil: "commit" });
});

test("a subscription over quota warns, still opens PayPal, and a pending one can be cancelled", async ({ page, baseURL }) => {
  await seedPlots(page, [LARGE_PLOT], baseURL!);
  await page.goto("/checkout");
  await page.getByRole("button", { name: /^REGULAR/ }).click();
  await expect(page.getByText("$29.00 USD")).toBeVisible();
  await expect(page.getByText(/exceed this plan.s 100 ha monthly quota/)).toBeVisible();
  await toPayPal(page);

  await page.goto("/checkout");
  await expect(page.getByText(/regular — approval pending/i)).toBeVisible();
  // Only one subscription at a time.
  await page.getByRole("button", { name: /^Professional/ }).click();
  await expect(page.getByText("$99.00 USD")).toBeVisible();
  await page.getByRole("button", { name: "Pay with PayPal" }).click();
  await expect(page.getByText(/already have a subscription or pending checkout/)).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel subscription" }).click();
  await expect(page.getByText(/regular — cancelled/i)).toBeVisible();

  // Cancelling frees the account to choose another plan.
  await toPayPal(page);
  await page.goto("/checkout");
  await expect(page.getByText(/pro — approval pending/i)).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel subscription" }).click();
  await expect(page.getByText(/pro — cancelled/i)).toBeVisible();
});
