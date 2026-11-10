import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test, type Page } from "./fixtures";
import { DATA_DIR, SMALL_PLOT, signedInAccount } from "./helpers";

// DDS Submission against the built-in mock EUIS (playwright.config.ts sets EUIS_MOCK
// and EUIS_BASE_URL). The mock checks the WS-Security digest with the key below.

const MOCK_KEY = "locanix-mock-key";

type Ring = [number, number][];
const MEDIUM_PLOT: Ring = [[106.802, -6.6], [106.8034, -6.6], [106.8034, -6.6014], [106.802, -6.6014]]; // ≈2.40 ha
const NINE_HA_PLOT: Ring = [[106.81, -6.6], [106.8127, -6.6], [106.8127, -6.6027], [106.81, -6.6027]]; // ≈8.9 ha

const none = { ha: 0, pct: 0 };
const clearResult = { deforestation: { riskLevel: "Low", gfw: none, jrc: none, sbtn: none }, protectedArea: { status: "compliant", categories: [] } };
const plot = (id: number, name: string, ring: Ring, areaHa: number, extra: Record<string, unknown> = {}) => ({
  id, plotId: `e2e-${id}`, name, ring, areaHa,
  checks: { duplicateVertices: false, zeroArea: false, selfIntersection: false },
  isValid: true, issues: [], ...extra,
});

const PLOTS = [
  plot(1, "Kebun Kopi Bogor A", SMALL_PLOT, 0.0895, { eudr: clearResult }),
  plot(2, "Kebun Kopi Bogor B", MEDIUM_PLOT, 2.4, {
    eudr: { ...clearResult, protectedArea: { status: "non_compliant", categories: ["II"] } },
  }),
  plot(3, "Kebun Kopi Bogor C", NINE_HA_PLOT, 8.92), // not analyzed
];

const DETAILS = {
  activityType: "IMPORT", countryOfActivity: "BE", hsHeading: "0901", description: "Green arabica coffee beans",
  netWeightKg: "1200", producerName: "Koperasi Kopi Bogor", producerCountry: "ID",
};

/** Signed-in account with consent and a saved workspace. */
async function workspaceAccount(page: Page, label: string, plots: unknown[] = PLOTS) {
  const account = await signedInAccount(page, label);
  const { version } = await (await page.request.get("/api/consent")).json();
  expect((await page.request.post("/api/consent", { data: { version } })).ok()).toBeTruthy();
  expect((await page.request.post("/api/workspace", { data: { plots, eudrDone: true } })).ok()).toBeTruthy();
  return account;
}

async function mockRecords(): Promise<{ internalReference: string; user: string }[]> {
  try {
    return JSON.parse(await readFile(path.join(DATA_DIR, "euis-mock", "state.json"), "utf8")).records;
  } catch {
    return [];
  }
}

test("a Clear plot goes from draft to an Available DDS, then is withdrawn", async ({ page }) => {
  await workspaceAccount(page, "dds");

  await page.goto("/dashboard/dds");
  await expect(page.getByRole("heading", { level: 1, name: "DDS Submission" })).toBeVisible();
  await expect(page.getByRole("link", { name: "DDS Submission", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Mock EUIS (local test) · TRACES")).toBeVisible();
  await expect(page.getByText("Free plan: 0.00 of 10 ha used in submitted DDS")).toBeVisible();

  // Only Clear plots can be picked.
  const create = page.getByRole("region", { name: "New DDS from Clear plots" });
  await expect(create.getByText("Kebun Kopi Bogor A")).toBeVisible();
  await expect(create.getByText("Kebun Kopi Bogor B")).toHaveCount(0);
  await expect(create.getByText("2 plots aren’t Clear and can’t be included.")).toBeVisible();

  // Connect EUIS: a wrong key fails the echo test, the right one passes.
  await page.getByRole("link", { name: "Open Settings" }).click();
  await expect(page).toHaveURL(/\/dashboard\/settings#euis$/);
  const euis = page.getByRole("region", { name: "EUIS connection" });
  await euis.getByLabel("Web-service username").fill("e2e-operator");
  await euis.getByLabel("Authentication key").fill("wrong-key");
  await euis.getByLabel("WebServiceClientId").fill("eudr-test");
  await euis.getByRole("button", { name: "Save connection" }).click();
  await expect(euis.getByText("EUIS connection saved.", { exact: false })).toBeVisible();
  await expect(euis.getByText("•••••••• (saved)")).toBeVisible();
  await euis.getByRole("button", { name: "Test connection" }).click();
  await expect(euis.getByText("Connection failed: InternalSystemException")).toBeVisible();
  await euis.getByRole("button", { name: "Edit" }).click();
  await euis.getByLabel("Authentication key").fill(MOCK_KEY);
  await euis.getByRole("button", { name: "Save connection" }).click();
  await euis.getByRole("button", { name: "Test connection" }).click();
  await expect(euis.getByText("Connected. EUIS answered the echo test (“OK”).")).toBeVisible();
  const identity = await (await page.request.get("/api/euis/identity")).json();
  expect(JSON.stringify(identity)).not.toContain(MOCK_KEY);

  // New draft from plot A.
  await page.getByRole("link", { name: "DDS Submission", exact: true }).click();
  await create.getByRole("checkbox", { name: /Kebun Kopi Bogor A/ }).check();
  await expect(create.getByText("1 selected · 0.09 ha")).toBeVisible();
  await create.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/dashboard\/dds\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId("dds-status")).toHaveText("Draft");

  const checklist = page.getByRole("list", { name: "Readiness checklist" });
  await expect(checklist.getByText("Every plot is Clear in your workspace — ready")).toBeVisible();
  await expect(checklist.getByText("Activity and EU Member State — needs attention")).toBeVisible();
  await expect(page.getByRole("button", { name: "Review & submit" })).toBeDisabled();

  await page.getByLabel("Country of activity").selectOption("BE");
  await page.getByLabel("Commodity").selectOption("0901");
  await page.getByLabel("Description of goods").fill(DETAILS.description);
  await page.getByLabel("Net mass (kg)").fill("1200");
  await page.getByLabel("Producer name").fill(DETAILS.producerName);
  await page.getByLabel("Country of production").fill("id");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved.")).toBeVisible();
  await expect(checklist.locator('[data-ok="false"]')).toHaveCount(0);
  await expect(checklist.getByText("0.09 ha of 10 ha used after this DDS.")).toBeVisible();

  // Review, confirm the declaration, sign.
  await page.getByRole("button", { name: "Review & submit" }).click();
  const dialog = page.getByRole("dialog", { name: "Review and sign" });
  await expect(dialog.getByText("Green arabica coffee beans")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Confirm & sign" })).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Confirm & sign" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Received by EUIS")).toBeVisible();

  // The page follows the status until EUIS assigns the numbers.
  await expect(page.getByTestId("dds-status")).toHaveText("Available", { timeout: 30_000 });
  const status = page.getByRole("region", { name: "EUIS status" });
  await expect(status.getByText(/^\d{2}BE[A-Z0-9]{10}$/)).toBeVisible();
  await expect(status.getByText("Assigned")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^\d{2}BE[A-Z0-9]{10}$/);

  page.once("dialog", (d) => d.accept());
  await status.getByRole("button", { name: "Withdraw DDS" }).click();
  await expect(page.getByTestId("dds-status")).toHaveText("Withdrawn");
  await expect(page.getByText("Withdrawal accepted by EUIS: Withdrawn")).toBeVisible();

  await page.getByRole("link", { name: "← DDS Submission" }).click();
  const list = page.getByRole("region", { name: "Statements" });
  await expect(list.getByText("Withdrawn")).toBeVisible();
  await expect(list.getByText("Green arabica coffee beans")).toBeVisible();
});

test("a refused submit leaves a draft, and an unanswered one is never sent twice", async ({ page, browser, baseURL }) => {
  await workspaceAccount(page, "ddsfail");
  const username = `e2e-fail-${Date.now()}`;
  expect((await page.request.put("/api/euis/identity", { data: { username, authKey: MOCK_KEY, clientId: "eudr-test" } })).ok()).toBeTruthy();

  // Not Clear: refused before anything is created.
  const notClear = await page.request.post("/api/dds", { data: { plotIds: [2] } });
  expect(notClear.status()).toBe(409);
  expect((await notClear.json()).error).toContain("Only Clear plots");

  const { statement } = await (await page.request.post("/api/dds", { data: { plotIds: [1] } })).json();
  const url = `/api/dds/${statement.id}`;

  // The declaration must be confirmed.
  expect((await page.request.post(`${url}/submit`, { data: {} })).status()).toBe(400);

  // EUIS validation fault: nothing filed, back to draft with the reason.
  await page.request.patch(url, { data: { details: { ...DETAILS, description: "Coffee MOCK-FAULT" } } });
  let res = await (await page.request.post(`${url}/submit`, { data: { confirm: true } })).json();
  expect(res.statement.status).toBe("DRAFT");
  expect(res.statement.lastError).toContain("EUDR_MOCK_RULE");

  // No usable answer: "check needed", and a second submit is refused.
  await page.request.patch(url, { data: { details: { ...DETAILS, description: "Coffee MOCK-TIMEOUT" } } });
  res = await (await page.request.post(`${url}/submit`, { data: { confirm: true } })).json();
  expect(res.statement.status).toBe("POSSIBLY_FILED");
  const ref = res.statement.internalReference as string;
  expect(ref).toMatch(/^LCX-\d{6}-[0-9A-F]{8}-2$/);
  const again = await page.request.post(`${url}/submit`, { data: { confirm: true } });
  expect(again.status()).toBe(409);

  const filed = (await mockRecords()).filter((r) => r.user === username);
  expect(filed.map((r) => r.internalReference)).toEqual([ref]); // the fault stored nothing, the timeout exactly once

  // "Check EUIS" finds it by the internal reference and follows it from there.
  // (The page also checks by itself while it is open, so the button may already be gone.)
  await page.goto(`/dashboard/dds/${statement.id}`);
  const found = page.getByText("Found in EUIS — it was filed");
  const checkButton = page.getByRole("button", { name: "Check EUIS" });
  await expect(found.or(checkButton)).toBeVisible();
  if (await checkButton.isVisible()) {
    await expect(page.getByText("EUIS didn't confirm whether it received this statement")).toBeVisible();
    await checkButton.click({ timeout: 5000 }).catch(() => {});
  }
  await expect(found).toBeVisible();
  await expect(page.getByTestId("dds-status")).toHaveText(/Submitted|Available/);
  await expect(page.getByTestId("dds-status")).toHaveText("Available", { timeout: 30_000 });
  expect((await mockRecords()).filter((r) => r.user === username)).toHaveLength(1);

  // Statements belong to their owner.
  const other = await browser.newContext({ baseURL });
  const stranger = await other.newPage();
  await signedInAccount(stranger, "ddsstranger");
  expect((await stranger.request.get(url)).status()).toBe(404);
  await other.close();
});

test("free users can file DDS for at most 10 ha of distinct plots", async ({ page }) => {
  const plots = [
    plot(1, "Nine hectare plot", NINE_HA_PLOT, 8.92, { eudr: clearResult }),
    plot(2, "Medium plot", MEDIUM_PLOT, 2.4, { eudr: clearResult }),
  ];
  await workspaceAccount(page, "ddsquota", plots);
  expect((await page.request.put("/api/euis/identity", { data: { username: `e2e-quota-${Date.now()}`, authKey: MOCK_KEY, clientId: "eudr-test" } })).ok()).toBeTruthy();

  const draft = async (plotIds: number[]) => {
    const { statement } = await (await page.request.post("/api/dds", { data: { plotIds } })).json();
    await page.request.patch(`/api/dds/${statement.id}`, { data: { details: DETAILS } });
    return statement.id as string;
  };

  const first = await draft([1]);
  const ok = await (await page.request.post(`/api/dds/${first}/submit`, { data: { confirm: true } })).json();
  expect(ok.statement.status).toBe("SUBMITTED");

  // 8.9 ha used: the 2.4 ha plot would go past 10 ha.
  const second = await draft([2]);
  const blocked = await page.request.post(`/api/dds/${second}/submit`, { data: { confirm: true } });
  expect(blocked.status()).toBe(409);
  const quota = (await blocked.json()).readiness.find((r: { key: string }) => r.key === "quota");
  expect(quota.ok).toBe(false);
  expect(quota.detail).toMatch(/would bring you to 11\.\d\d ha of 10 ha/);

  await page.goto(`/dashboard/dds/${second}`);
  const checklist = page.getByRole("list", { name: "Readiness checklist" });
  await expect(checklist.getByText("Free plan: up to 10 ha in DDS — needs attention")).toBeVisible();
  await expect(checklist.getByText(/Choose a plan to submit more/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Review & submit" })).toBeDisabled();

  // Filing the same plot again does not count twice.
  const repeat = await draft([1]);
  const again = await (await page.request.post(`/api/dds/${repeat}/submit`, { data: { confirm: true } })).json();
  expect(again.statement.status).toBe("SUBMITTED");
});
