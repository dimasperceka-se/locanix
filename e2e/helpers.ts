import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** Must match LOCANIX_DATA_DIR in playwright.config.ts. */
export const DATA_DIR = path.resolve(".data-e2e");
const USERS_FILE = path.join(DATA_DIR, "users.json");

type StoredUser = { id: string; email: string; verifyToken: string | null; resetTokenHash?: string | null; resetExpires?: number | null };
export type Account = { name: string; email: string; password: string };

export async function findUser(email: string): Promise<StoredUser | undefined> {
  try {
    const users: StoredUser[] = JSON.parse(await readFile(USERS_FILE, "utf8"));
    return users.find((u) => u.email === email.toLowerCase());
  } catch {
    return undefined;
  }
}

async function patchUser(email: string, patch: Partial<StoredUser>) {
  const users: StoredUser[] = JSON.parse(await readFile(USERS_FILE, "utf8"));
  const user = users.find((u) => u.email === email.toLowerCase());
  if (!user) throw new Error(`No stored user ${email}`);
  Object.assign(user, patch);
  await writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

export function newAccount(label = "user"): Account {
  const id = Date.now().toString(36) + randomBytes(3).toString("hex");
  return { name: `E2E ${label}`, email: `e2e-${label}-${id}@example.test`, password: `pw-${randomBytes(6).toString("hex")}` };
}

/** Open the verification link exactly as the emailed one would. */
export async function openVerificationLink(request: APIRequestContext, email: string) {
  const token = (await findUser(email))?.verifyToken;
  expect(token, "verification token stored").toBeTruthy();
  const response = await request.get(`/api/auth/verify?token=${token}`, { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers()["location"]).toContain("/login?verified=1");
}

/** Register + verify through the API, then sign the page's browser context in. */
export async function signedInAccount(page: Page, label = "user"): Promise<Account> {
  const account = newAccount(label);
  const register = await page.request.post("/api/auth/register", { data: { ...account, confirm: account.password } });
  expect(register.ok()).toBeTruthy();
  await openVerificationLink(page.request, account.email);
  const login = await page.request.post("/api/auth/login", { data: { email: account.email, password: account.password } });
  expect(login.ok()).toBeTruthy();
  return account;
}

export async function logInThroughForm(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

/**
 * The emailed reset token is only stored as a hash, so tests replace it with a
 * token they know — the same shape the email would carry.
 */
export async function knownResetToken(email: string, { expired = false } = {}) {
  const token = randomBytes(24).toString("hex");
  await patchUser(email, {
    resetTokenHash: createHash("sha256").update(token).digest("hex"),
    resetExpires: Date.now() + (expired ? -1000 : 3600_000),
  });
  return token;
}

type Ring = [number, number][];
/** ≈0.0895 ha near Bogor: $0.44 at $4.90/ha. */
export const SMALL_PLOT: Ring = [[106.8, -6.6], [106.80027, -6.6], [106.80027, -6.60027], [106.8, -6.60027]];
/** ≈770 ha: above both the Regular (100 ha) and Professional (500 ha) quotas. */
export const LARGE_PLOT: Ring = [[96.0, 4.0], [96.025, 4.0], [96.025, 4.025], [96.0, 4.025]];

/** Put plots in the browser's plot store, as an upload on the home page would. */
export async function seedPlots(page: Page, rings: Ring[], origin: string) {
  const plots = rings.map((ring, i) => ({
    id: i + 1, plotId: `e2e-${i + 1}`, name: `E2E plot ${i + 1}`, ring, areaHa: 0,
    checks: { duplicateVertices: false, zeroArea: false, selfIntersection: false }, isValid: true, issues: [],
  }));
  await page.addInitScript(({ value, origin }) => {
    if (location.origin === origin) sessionStorage.setItem("locanix.plots", value);
  }, { value: JSON.stringify({ plots, eudrDone: false }), origin });
}
