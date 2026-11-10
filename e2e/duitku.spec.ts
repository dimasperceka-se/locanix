import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHmac } from "node:crypto";
import { expect, test, type Page } from "./fixtures";
import { DATA_DIR, LARGE_PLOT, SMALL_PLOT, seedPlots, signedInAccount, type Account } from "./helpers";

// Rupiah payments against the built-in mock Duitku (see playwright.config.ts).
// Its merchant code and key must match DUITKU_MERCHANT_CODE / DUITKU_API_KEY there.
const MERCHANT = "DMOCK01";
const KEY = "locanix-duitku-mock-key";
const sign = (text: string) => createHmac("sha256", KEY).update(text).digest("hex");

type Invoice = { merchantOrderId: string; email: string; amount: number; status: string; callbackStatus?: number };
async function invoicesFor(account: Account): Promise<Invoice[]> {
  try {
    const state = JSON.parse(await readFile(path.join(DATA_DIR, "duitku-mock", "state.json"), "utf8"));
    return (Object.values(state.invoices) as Invoice[]).filter((i) => i.email === account.email.toLowerCase());
  } catch {
    return [];
  }
}
const billing = async (page: Page) => (await page.request.get("/api/paypal/checkout")).json();
const amount = (page: Page, text: string) => page.getByText(text, { exact: true }).first();

async function toDuitku(page: Page) {
  await page.getByRole("button", { name: "Continue to Duitku" }).click();
  await page.waitForURL(/\/api\/duitku-mock\/pay\?reference=/);
}

let account: Account;
test.beforeEach(async ({ page }) => {
  account = await signedInAccount(page, "duitku");
});

test("pay as you go in rupiah: Rp10.000 minimum, Duitku's page, and the callback unlocks access", async ({ page, baseURL }) => {
  await seedPlots(page, [SMALL_PLOT], baseURL!);
  await page.goto("/checkout");
  await page.getByRole("button", { name: "IDR" }).click();
  // 0.0895 ha × Rp88.200 is Rp7.894, below Duitku's minimum.
  await expect(amount(page, "Rp10.000")).toBeVisible();
  await expect(page.getByText(/minimum of Rp10\.000/)).toBeVisible();
  expect((await billing(page)).paid).toBe(false);

  await toDuitku(page);
  await expect(page.getByTestId("amount")).toHaveText("Rp10.000");
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await page.waitForURL(/\/dashboard$/);

  expect((await billing(page)).paid).toBe(true);
  const [invoice, ...others] = await invoicesFor(account);
  expect(others).toHaveLength(0);
  expect(invoice).toMatchObject({ amount: 10000, status: "00", callbackStatus: 200 });
});

test("plots already paid for are not charged again", async ({ page, baseURL }) => {
  await seedPlots(page, [SMALL_PLOT], baseURL!);
  await page.goto("/checkout");
  await page.getByRole("button", { name: "IDR" }).click();
  await toDuitku(page);
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await page.waitForURL(/\/dashboard$/);

  const quote = async (rings: [number, number][][]) =>
    page.request.post("/api/paypal/checkout", { data: { action: "quote", plan: "payg", currency: "USD", plots: rings.map((ring) => ({ ring })) } });
  const both = await (await quote([SMALL_PLOT, LARGE_PLOT])).json();
  const large = await (await quote([LARGE_PLOT])).json();
  expect(both).toMatchObject({ count: 1, skipped: 1, amount: large.amount });
  const paidOnly = await quote([SMALL_PLOT]);
  expect(paidOnly.status()).toBe(400);
  expect((await paidOnly.json()).error).toMatch(/already paid for/);
});

test("a rupiah monthly plan is one month, has nothing to cancel, and blocks a second plan", async ({ page }) => {
  await page.goto("/checkout");
  await page.getByRole("button", { name: "IDR" }).click();
  await page.getByRole("radio", { name: /^Regular/ }).click();
  await expect(amount(page, "Rp522.000")).toBeVisible();
  await expect(page.getByRole("radio", { name: /^QRIS, bank transfer or e-wallet/ })).toContainText("1 month");
  await expect(page.getByText(/does not renew/).first()).toBeVisible();
  await toDuitku(page);
  await page.getByRole("button", { name: "Pay", exact: true }).click();
  await page.waitForURL(/\/dashboard$/);

  const sub = (await billing(page)).subscriptions.find((s: { plan: string }) => s.plan === "regular");
  expect(sub).toMatchObject({ provider: "duitku", status: "SUCCESS", active: true, remainingHa: 100 });
  const days = (sub.expiresAt - Date.now()) / 86400000;
  expect(days).toBeGreaterThan(27);
  expect(days).toBeLessThan(32);

  await page.goto("/checkout");
  await expect(page.getByText(/regular — paid/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel subscription" })).toHaveCount(0);

  await page.getByRole("button", { name: "IDR" }).click();
  await page.getByRole("radio", { name: /^Professional/ }).click();
  await expect(amount(page, "Rp1.782.000")).toBeVisible();
  await page.getByRole("button", { name: "Continue to Duitku" }).click();
  await expect(page.getByText(/already have a subscription or pending checkout/)).toBeVisible();
});

test("a cancelled payment unlocks nothing; the retry is a new invoice, confirmed from Duitku's status without a callback", async ({ page, baseURL }) => {
  await seedPlots(page, [LARGE_PLOT], baseURL!);
  await page.goto("/checkout");
  await page.getByRole("button", { name: "IDR" }).click();
  await toDuitku(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForURL(/\/checkout\/return\/duitku\?/);
  await expect(page.getByRole("status")).toContainText("cancelled or has expired");
  expect((await billing(page)).paid).toBe(false);

  await page.goto("/checkout");
  await page.getByRole("button", { name: "IDR" }).click();
  await toDuitku(page);
  await page.getByRole("button", { name: "Pay without callback" }).click();
  await page.waitForURL(/\/dashboard$/);
  expect((await billing(page)).paid).toBe(true);

  const invoices = await invoicesFor(account);
  expect(invoices.map((i) => i.status).sort()).toEqual(["00", "02"]);
  expect(new Set(invoices.map((i) => i.merchantOrderId)).size).toBe(2);
});

test("the callback only accepts signed notifications and never trusts their result", async ({ page, baseURL }) => {
  const post = (form: Record<string, string>) => page.request.post("/api/duitku/callback", { form });
  expect((await page.request.get("/api/duitku/callback")).ok()).toBeTruthy();
  expect((await post({})).status()).toBe(400);

  const unknown = "00000000-0000-4000-8000-000000000000";
  expect((await post({ merchantCode: MERCHANT, amount: "10000", merchantOrderId: unknown, signature: "ab".repeat(32) })).status()).toBe(401);
  expect((await post({ merchantCode: "OTHER", amount: "10000", merchantOrderId: unknown, signature: sign(`OTHER10000${unknown}`) })).status()).toBe(401);
  expect((await post({ merchantCode: MERCHANT, amount: "10000", merchantOrderId: unknown, signature: sign(`${MERCHANT}10000${unknown}`) })).status()).toBe(404);

  // A pending invoice, then a correctly signed "success" callback for it. Duitku still
  // reports it unpaid, so nothing unlocks.
  await seedPlots(page, [SMALL_PLOT], baseURL!);
  await page.goto("/checkout");
  await page.getByRole("button", { name: "IDR" }).click();
  await toDuitku(page);
  const [pending] = await invoicesFor(account);
  expect(pending.status).toBe("01");
  const forged = { merchantCode: MERCHANT, amount: "10000", merchantOrderId: pending.merchantOrderId, resultCode: "00", reference: "X", signature: sign(`${MERCHANT}10000${pending.merchantOrderId}`) };
  expect((await post(forged)).status()).toBe(200);
  expect((await billing(page)).paid).toBe(false);
  // The amount must match the order too.
  expect((await post({ ...forged, amount: "99999", signature: sign(`${MERCHANT}99999${pending.merchantOrderId}`) })).status()).toBe(404);
});
