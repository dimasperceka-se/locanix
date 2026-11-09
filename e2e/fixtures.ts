import { mkdirSync } from "node:fs";
import path from "node:path";
import { test as base, type Page } from "@playwright/test";

export { expect } from "@playwright/test";
export type { Page } from "@playwright/test";

/**
 * Step screenshots, opt-in: `E2E_SCREENSHOT_DIR=screenshot-e2e npm run test:e2e:screenshots`.
 * After every page action (goto, click, fill, …) and every web assertion, the page
 * is saved as `<dir>/<spec>__<test>/<nn>-<step>.png`. Unset, the suite runs as before.
 */
const ROOT = process.env.E2E_SCREENSHOT_DIR ? path.resolve(process.env.E2E_SCREENSHOT_DIR) : null;

let current: { dir: string; step: number } | null = null;
let patched = false;

const slug = (text: string, max = 90) =>
  text.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "") || "step";

async function shot(page: Page, label: string) {
  if (!current || page.isClosed()) return;
  const step = ++current.step;
  const file = path.join(current.dir, `${String(step).padStart(2, "0")}-${slug(label)}.png`);
  // Playwright's fullPage capture leaves map canvases blank and paints fixed headers
  // mid-page, so the viewport is grown to the page height for a plain capture instead.
  // A screenshot must never fail or slow down a test by much.
  const viewport = page.viewportSize();
  let grown = false;
  let scrollY = 0;
  try {
    const size = await page.evaluate(() => ({
      height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight ?? 0),
      scrollY: window.scrollY,
    }));
    scrollY = size.scrollY;
    if (viewport && size.height > viewport.height) {
      await page.setViewportSize({ width: viewport.width, height: Math.min(size.height, 10_000) });
      grown = true;
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    if (grown) await page.waitForTimeout(300); // let layout and canvases redraw
  } catch {
    /* page navigating — capture what is there */
  }
  await page.screenshot({ path: file, timeout: 15_000 }).catch(() => {});
  if (grown && viewport) await page.setViewportSize(viewport).catch(() => {});
  await page.evaluate((y) => window.scrollTo(0, y), scrollY).catch(() => {});
}

function wrap(proto: any, method: string, label: (self: any, args: any[]) => string, pageOf: (self: any) => Page, settle = false) {
  const original = proto[method];
  if (typeof original !== "function") return;
  proto[method] = async function (this: any, ...args: any[]) {
    const result = await original.apply(this, args);
    if (current) {
      const page = pageOf(this);
      // waitForURL(..., { waitUntil: "commit" }) returns before anything is drawn.
      if (settle) await page.waitForLoadState("load", { timeout: 15_000 }).catch(() => {});
      await shot(page, label(this, args));
    }
    return result;
  };
}

function patchOnce(page: Page) {
  if (patched) return;
  patched = true;
  const pageProto = Object.getPrototypeOf(page);
  const frameProto = Object.getPrototypeOf(page.mainFrame());
  const locatorProto = Object.getPrototypeOf(page.locator("body"));
  const self = (p: Page) => p;

  wrap(pageProto, "goto", (_, [url]) => `goto ${url}`, self);
  wrap(pageProto, "reload", () => "reload", self);
  wrap(pageProto, "waitForURL", () => "arrived", self, true);

  // Values are left out of the names so passwords never end up in file names.
  for (const action of ["click", "dblclick", "fill", "check", "uncheck", "press", "selectOption", "setInputFiles", "pressSequentially"]) {
    wrap(locatorProto, action, (loc) => `${action} ${loc}`, (loc) => loc.page());
  }

  // Every web assertion (toBeVisible, toHaveURL, toHaveTitle, …) ends up here.
  wrap(
    frameProto,
    "_expect",
    (frame, [expression, options]) =>
      `expect ${options?.isNot ? "not " : ""}${expression} ${options?.selector ? frame.locator(options.selector) : options?.expectedText?.[0]?.string ?? ""}`,
    (frame) => frame.page(),
  );
}

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    if (!ROOT) return use(page);
    patchOnce(page);
    const spec = path.basename(testInfo.file).replace(/\.spec\.ts$/, "");
    const dir = path.join(ROOT, `${spec}__${slug(testInfo.title, 80)}`);
    mkdirSync(dir, { recursive: true });
    current = { dir, step: 0 };
    try {
      await use(page);
    } finally {
      current = null;
    }
  },
});
