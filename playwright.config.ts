import { defineConfig, devices } from "@playwright/test";

// The suite starts its own `next dev` on a separate port, with an isolated data
// folder and build folder, so it never touches `.data/` or a running dev server.
// Emails are never sent (SMTP points at a closed port) and PayPal is Sandbox only,
// using the Sandbox credentials from `.env`.
const PORT = Number(process.env.E2E_PORT || 3100);
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000, // `next dev` compiles each page on first visit
  expect: { timeout: 20_000 },
  workers: 1, // every test shares one file-based data store
  reporter: [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL,
    navigationTimeout: 90_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `${baseURL}/api/paypal/webhook`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      LOCANIX_DATA_DIR: ".data-e2e",
      APP_URL: baseURL,
      PAYPAL_RETURN_BASE: baseURL,
      PAYPAL_ENV: "sandbox",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: "9",
      NEXT_TELEMETRY_DISABLED: "1",
      // DDS Submission talks to the built-in mock EUIS, never to the real one,
      // and may ask for the status right away instead of after an hour.
      EUIS_MOCK: "1",
      EUIS_BASE_URL: `${baseURL}/api/euis-mock`,
      EUIS_MOCK_ANALYSIS_MS: "1500",
      EUIS_STATUS_FIRST_CHECK_SEC: "0",
      EUIS_STATUS_INTERVAL_SEC: "0",
      EUIS_RESOLVE_INTERVAL_SEC: "0",
      // Rupiah payments go to the built-in mock Duitku, never to Duitku itself.
      DUITKU_ENV: "sandbox",
      DUITKU_MERCHANT_CODE: "DMOCK01",
      DUITKU_API_KEY: "locanix-duitku-mock-key",
      DUITKU_MOCK: "1",
      DUITKU_BASE_URL: `${baseURL}/api/duitku-mock`,
    },
  },
});
