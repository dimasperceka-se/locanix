import { expect, test } from "./fixtures";

test("the webhook answers a reachability check", async ({ request }) => {
  const response = await request.get("/api/paypal/webhook");
  expect(response.ok()).toBeTruthy();
  expect(await response.json()).toMatchObject({ status: "reachable" });
});

test("a webhook without PayPal signature headers is rejected", async ({ request }) => {
  const response = await request.post("/api/paypal/webhook", { data: {} });
  expect(response.status()).toBe(400);
});

test("a webhook with a forged signature is rejected by PayPal verification", async ({ request }) => {
  const response = await request.post("/api/paypal/webhook", {
    headers: {
      "paypal-auth-algo": "SHA256withRSA",
      "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-fake",
      "paypal-transmission-id": "00000000-0000-0000-0000-000000000000",
      "paypal-transmission-sig": "ZmFrZQ==",
      "paypal-transmission-time": new Date().toISOString(),
    },
    data: { id: "WH-E2E-FORGED", event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "X" } },
  });
  expect(response.status()).toBe(401);
});
