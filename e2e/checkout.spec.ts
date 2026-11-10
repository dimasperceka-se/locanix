import { expect, test, type Page } from "./fixtures";
import { LARGE_PLOT, SMALL_PLOT, seedPlots, signedInAccount } from "./helpers";

// Uses PayPal Sandbox (credentials from .env). Checkouts are created but never
// approved; pending subscriptions are cancelled again.

const toPayPal = async (page: Page) => {
  await page.getByRole("radio", { name: /^PayPal/ }).click();
  await page.getByRole("button", { name: "Continue to PayPal" }).click();
  await page.waitForURL(/^https:\/\/www\.sandbox\.paypal\.com\//, { waitUntil: "commit" });
};
const total = (page: Page, text: string) => page.getByText(text, { exact: true });

test.beforeEach(async ({ page }) => {
  await signedInAccount(page, "checkout");
});

test("free-tier users get the dashboard, and checkout runs on Sandbox", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("No plots yet")).toBeVisible();
  await page.getByRole("link", { name: "Billing" }).click();
  await expect(page).toHaveURL(/\/checkout$/);
  await expect(page.getByText("Sandbox testing")).toBeVisible();
});

test("pay-as-you-go needs plots and is priced from their area", async ({ page, baseURL }) => {
  await page.goto("/checkout");
  await expect(page.getByText("Add valid plots before paying per hectare.")).toBeVisible();
  await expect(page.getByRole("button", { name: /with card$/ })).toBeDisabled();

  await seedPlots(page, [SMALL_PLOT], baseURL!);
  await page.reload();
  await expect(page.getByText("0.0895 ha", { exact: true })).toBeVisible();
  await expect(total(page, "$0.44 USD")).toBeVisible();
  await toPayPal(page);
  expect(page.url()).toContain("sandbox.paypal.com");
});

test("IDR pays through Duitku; cards pay as you go through PayPal; monthly plans need a PayPal account", async ({ page, baseURL }) => {
  await seedPlots(page, [SMALL_PLOT], baseURL!);
  await page.goto("/checkout");
  await expect(total(page, "$0.44 USD")).toBeVisible();

  // Rupiah goes to Duitku (the mock here); PayPal and cards stay in USD.
  const rupiah = page.getByRole("radio", { name: /^QRIS, bank transfer or e-wallet/ });
  await expect(rupiah).toContainText("IDR only");
  await page.getByRole("button", { name: "IDR" }).click();
  await expect(rupiah).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: /^PayPal/ })).toContainText("USD only");
  await expect(page.getByRole("button", { name: "Continue to Duitku" })).toBeEnabled();
  await page.getByRole("button", { name: "USD" }).click();

  await page.getByRole("radio", { name: /^Regular/ }).click();
  await expect(total(page, "$29.00 USD")).toBeVisible();
  await expect(page.getByRole("radio", { name: /^Credit or debit card/ })).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("radio", { name: /^Pay As You Go/ }).click();
  await expect(total(page, "$0.44 USD")).toBeVisible();
  await page.getByRole("radio", { name: /^Credit or debit card/ }).click();
  await page.getByRole("button", { name: "Pay $0.44 with card" }).click();
  await page.waitForURL(/^https:\/\/www\.sandbox\.paypal\.com\//, { waitUntil: "commit" });
});

test("a subscription over quota warns, still opens PayPal, and a pending one can be cancelled", async ({ page, baseURL }) => {
  await seedPlots(page, [LARGE_PLOT], baseURL!);
  await page.goto("/checkout");
  await page.getByRole("radio", { name: /^Regular/ }).click();
  await expect(total(page, "$29.00 USD")).toBeVisible();
  await expect(page.getByText(/exceed this plan.s 100 ha monthly quota/)).toBeVisible();
  await toPayPal(page);

  await page.goto("/checkout");
  await expect(page.getByText(/regular — approval pending/i)).toBeVisible();
  // Only one subscription at a time.
  await page.getByRole("radio", { name: /^Professional/ }).click();
  await expect(total(page, "$99.00 USD")).toBeVisible();
  await page.getByRole("radio", { name: /^PayPal/ }).click();
  await page.getByRole("button", { name: "Continue to PayPal" }).click();
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
