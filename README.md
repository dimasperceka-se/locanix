# Locanix

Locanix checks plot boundaries for EUDR compliance: forest loss after
31 Dec 2020 and overlap with protected areas (WDPA). Users upload GeoJSON or draw
a plot, see which plots need review, and export an audit-ready report and Due
Diligence Statement.

Live domain: `https://locanix.id` · contact: info@locanix.id

## Stack

- **Next.js 15** (App Router) + **React 19**, **TypeScript** (strict)
- **Tailwind CSS v4**, design tokens in [`app/globals.css`](app/globals.css)
- Fonts via `next/font/google`: **Inter Tight** (display), **Inter** (body), **JetBrains Mono** (labels)
- **OpenLayers** for maps, **@react-pdf/renderer** for the DDS PDF, **xlsx** for Excel export
- File-based stores in `.data/` (users, billing ledger, a mirror of each workspace), PostgreSQL for uploaded plots and saved workspaces
- **PayPal** for one-time and subscription payments; EUDR analysis comes from an external FastAPI service

## Getting started

```bash
cp .env.example .env   # then fill in the values
npm install
npm run dev            # http://localhost:3000
```

Other scripts: `npm run build`, `npm run start`, `npm run lint`.

### Environment

See [`.env.example`](.env.example). The important ones:

| Variable | Purpose |
| --- | --- |
| `APP_URL` | Public origin, used in email links and PayPal return URLs |
| `SESSION_SECRET` | Signs the session cookie; required in production |
| `DATABASE_URL` | PostgreSQL: the upload log (`plots`) and each user's saved workspace with analysis results (`workspaces`, `workspace_plots`); tables are created on first use |
| `ANALYSIS_API_BASE` | Root of the EUDR analysis API (see [`docs/FRONTEND-INTEGRATION.md`](docs/FRONTEND-INTEGRATION.md)) |
| `PAYPAL_*` | PayPal app, plans and webhook; set up with [`scripts/setup-paypal.mjs`](scripts/setup-paypal.mjs) and [`scripts/PAYPAL-WEBHOOK.md`](scripts/PAYPAL-WEBHOOK.md) |
| `SMTP_*` | Verification, password-reset and contact emails |
| `LOCANIX_DATA_DIR` | Optional: folder for the file stores (default `.data`) |
| `EUIS_CREDENTIAL_ENC_KEY` | Encrypts the EUIS authentication keys saved for DDS Submission (32 bytes, base64 or hex); required in production |
| `EUIS_MOCK`, `EUIS_BASE_URL` | Local only: send DDS to the built-in mock EUIS (`/api/euis-mock`) instead of EUIS Acceptance |

## Pages

| Route | What it is |
| --- | --- |
| `/` | Landing page (v2 editorial design) |
| `/analyze` | Upload or draw plots and start the EUDR checks |
| `/dashboard` | Plot workspace: status per plot, filters, plot detail, start the EUDR run |
| `/dashboard/eudr`, `/dashboard/eudr/[id]` | Reports & DDS: results list, Excel and DDS export, full map per plot |
| `/dashboard/dds`, `/dashboard/dds/[id]` | DDS Submission: Due Diligence Statements from Clear plots, filed with EUIS (TRACES) Acceptance |
| `/dashboard/settings` | Account: profile, EUIS connection, password reset link, log out |
| `/checkout` | Plans and payment. Card and PayPal work today (USD, via PayPal); QRIS, virtual account and e-wallets are shown as coming soon |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Accounts |
| `/about`, `/contact`, `/privacy` | Company pages |

## DDS Submission (EUIS)

Users file a Due Diligence Statement for their Clear plots with the EU Information
System (EUIS, on TRACES), **Acceptance environment only**: there is no production
endpoint in the code. The SOAP client in [`lib/server/euis/`](lib/server/euis/) is
built from public EU sources only: the V4 service WSDL/XSDs the system publishes
(`…/tracesnt/ws/EUDRDueDiligenceStatementServiceV4?wsdl`, `EudrEchoService?wsdl`) and the
*EUDR Information System – Operator API Reference*
(`https://acceptance.eudr.webcloud.ec.europa.eu/tracesnt/help/eudr-documentation/operator/`).
Authentication is WS-Security UsernameToken with PasswordDigest (OASIS UsernameToken
Profile 1.0) plus a timestamp and the `WebServiceClientId` header.

- Each user saves their own EUIS web-service user in Settings; the authentication key is
  stored AES-256-GCM encrypted (`EUIS_CREDENTIAL_ENC_KEY`) and never sent back to the browser.
- A statement is marked as sending before the request leaves and is sent once; it is never
  retried automatically. Without a clear answer it becomes "Check needed" and is resolved by
  looking its internal reference up in EUIS, so nothing is filed twice.
- Status checks follow the EU guidance: the first one an hour after submitting, then at most
  every 15 minutes, while the statement page is open or on "Refresh status".
- Free users can file DDS for up to 10 ha of distinct plots; paid plans have no DDS limit.
- Statements are stored in `.data/dds/` and mirrored to PostgreSQL (`dds_accounts`, `dds_statements`).
- `EUIS_MOCK=1` with `EUIS_BASE_URL=http://localhost:3000/api/euis-mock` (never in production)
  runs everything against a built-in mock that checks the same WS-Security digest; the
  e2e tests use it with the key `locanix-mock-key`.

## Structure

```
app/                 routes and API handlers (app/api/*)
components/
  landing/           landing sections: Hero (+ Globe), ProductPreview, HowItWorks, Pricing, FinalCta
  Navbar.tsx         site header (hero card on the landing, sticky bar elsewhere)
  Footer.tsx
  Logo.tsx           logo mark + wordmark
  workspace/         WorkspaceShell (sidebar + plan usage), PlotMiniMap, shared classes
  CheckoutClient.tsx checkout page
lib/
  data.ts            nav links, analyses, pricing tiers, company details, policy text
  plotStatus.ts      Clear / Needs review / Not analyzed / Fix geometry, per plot
  server/            sessions, users, billing, PayPal, mailer, database
docs/design/         design references (open the .dc.html files through a local web server):
  v2-editorial/        landing page
  app-plot-workspace/  dashboard
  app-checkout/        checkout
e2e/                 Playwright tests
```

Prices appear twice: display copy in `pricingTiers` ([`lib/data.ts`](lib/data.ts)) and
the charged amounts in `PRICES`/`QUOTAS` ([`lib/server/billing.ts`](lib/server/billing.ts)).
Change both together.

## Design tokens

From the v2 design, in [`app/globals.css`](app/globals.css):

| Token | Value | Usage |
| --- | --- | --- |
| `ink` | `#0D0F0E` | text, primary buttons, dark sections |
| `ink-deep` | `#16191C` | landing hero background |
| `ink-soft` | `#4A504C` | body copy |
| `paper` / `paper-warm` | `#FAFAF7` / `#F1F1EB` | page and section backgrounds |
| `line` | `#E2E1DA` | borders and hairlines |
| `accent` | `#3DDC84` | green buttons on dark, "Live" badges |
| `accent-deep` | `#1F7A50` | green text on light backgrounds |
| `review-*` / `clear-*` | | "Needs review" and "Clear" status colors |

The logo mark in [`components/Logo.tsx`](components/Logo.tsx) is the interim one from the
design reference; replace the SVG there (and `app/icon.svg`, `app/apple-icon.png`)
when the final logo is ready.

## Tests

```bash
npx playwright install chromium   # first time only
npm run test:e2e                  # full suite against its own dev server on :3100
npm run test:e2e:screenshots      # same, plus a screenshot of every step in screenshot-e2e/
```

See [`e2e/README.md`](e2e/README.md) for details.
