# PayPal payments (local)

Checkout lives in `lib/server/billing.ts` and the `/api/paypal/checkout` route:
pay-as-you-go is a one-time PayPal order captured on `/checkout/return`;
Regular and Professional are monthly PayPal subscriptions. Entitlements are kept
in the ignored `.data/billing/<environment>/ledger.json` ledger.

The Node route `/api/paypal/webhook` verifies incoming signatures using PayPal's
verification API, re-reads the matching purchase from PayPal to update the
ledger (activation, renewals, refunds, reversals, cancellations), then saves the
event under `.data/paypal-webhooks/<environment>/`. Repeated event IDs are
ignored. The return page is the primary confirmation path; the webhook keeps
state current afterwards (renewals, refunds, cancellations made in PayPal).

Set `PAYPAL_ENV` (`sandbox` or `live`), `PAYPAL_CLIENT_ID`,
`PAYPAL_CLIENT_SECRET`, and, after dashboard registration, `PAYPAL_WEBHOOK_ID`.
All values must belong to the same PayPal environment and app. In Sandbox,
`node --env-file=.env scripts/setup-paypal.mjs` creates the product and the two
plans and writes `PAYPAL_PLAN_REGULAR_ID` / `PAYPAL_PLAN_PRO_ID` to `.env`; add
`--webhook-url=https://<tunnel-host>/api/paypal/webhook` to also register the
webhook and write `PAYPAL_WEBHOOK_ID`. Re-running reuses what already exists.

Subscribe the webhook to: `BILLING.SUBSCRIPTION.ACTIVATED`, `.CANCELLED`,
`.EXPIRED`, `.PAYMENT.FAILED`, `.SUSPENDED`, `.UPDATED`;
`PAYMENT.CAPTURE.COMPLETED`, `.DECLINED`, `.PENDING`, `.REFUNDED`, `.REVERSED`;
`PAYMENT.SALE.COMPLETED`, `.REFUNDED`, `.REVERSED`.

Run these in separate terminals:

```sh
npm run dev -- --port 3001
node scripts/paypal-webhook-proxy.mjs
cloudflared tunnel --url http://127.0.0.1:3002 --no-autoupdate
```

The proxy exposes only GET/POST `/api/paypal/webhook`; other paths return 404.
Set `WEBHOOK_UPSTREAM` to change the Next.js origin if needed.

Register `https://<tunnel-host>/api/paypal/webhook` in the PayPal app dashboard.
Copy the returned Webhook ID to `.env` and restart Next.js if necessary.
GET returning `reachable` only checks connectivity; POST requires configuration
and a valid PayPal signature. Missing configuration or upstream/storage failure
returns 503 so PayPal retries. Invalid signatures return 401.

Open the app at `http://localhost:3001` (not 127.0.0.1) so the session cookie
matches `PAYPAL_RETURN_BASE` when PayPal sends the buyer back. Pay with a
Sandbox **personal** account (developer.paypal.com → Testing Tools → Sandbox
Accounts); no real money moves.

Quick Tunnel URLs change when recreated and require these processes and this
computer to remain running. When the URL changes, edit the webhook URL in the
PayPal dashboard (the Webhook ID stays the same). Use a stable deployed HTTPS
URL for production, with live credentials, live plans and a live webhook ID.
PayPal's mock webhook simulator cannot be verified with the postback verification
API used here; use real sandbox transactions for end-to-end verification.

## Going live

1. In the PayPal Developer Dashboard, switch to **Live** and create a REST app
   under the Locanix PayPal **Business** account. Keep its client ID and secret
   out of git and chat.
2. Provision the live plans and webhook. On the production server, or locally
   with a `.env.paypal-live` file (ignored by git, not loaded by Next.js)
   containing `PAYPAL_ENV=live`, `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`:

   ```sh
   node --env-file=.env.paypal-live scripts/setup-paypal.mjs --live \
     --webhook-url=https://locanix.id/api/paypal/webhook
   ```

   It prints `PAYPAL_PLAN_REGULAR_ID`, `PAYPAL_PLAN_PRO_ID` and
   `PAYPAL_WEBHOOK_ID`. Its state is kept in `.data/paypal-live-setup.json`, so
   re-running never creates duplicate plans.
3. Set the production environment **before** deploying this code. Billing reads
   `PAYPAL_ENV` on every dashboard, usage and analysis request, and those fail
   while it is missing:

   ```sh
   PAYPAL_ENV=live
   PAYPAL_CLIENT_ID=...
   PAYPAL_CLIENT_SECRET=...
   PAYPAL_CURRENCY=USD
   PAYPAL_PLAN_REGULAR_ID=...
   PAYPAL_PLAN_PRO_ID=...
   PAYPAL_WEBHOOK_ID=...
   APP_URL=https://locanix.id
   ```

   Leave `PAYPAL_RETURN_BASE` unset (it falls back to `APP_URL`); live return
   URLs must be HTTPS.
4. Deploy (`npm ci && npm run build`, then restart). Check that
   `curl https://locanix.id/api/paypal/webhook` returns `reachable` from
   outside. A CDN or firewall in front must let PayPal POST to this path.
5. Run one real low-value payment and refund it from the PayPal Business
   account. Then subscribe with a real account and cancel. Include an
   Indonesian buyer: in Sandbox, subscription approval failed for an
   Indonesian personal account but worked for a US one.

Operational notes:

- The ledger (`.data/billing/live/ledger.json`) is the record of who paid. Run a
  single app instance on a persistent disk, not serverless or several replicas,
  and back up `.data/billing/` and `.data/paypal-webhooks/` with `.data/users.json`.
- Access now comes only from verified PayPal purchases. Users marked `paid` by
  the old prototype button lose dashboard access until they pay.
