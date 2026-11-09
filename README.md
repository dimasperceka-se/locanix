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
- File-based stores in `.data/` (users, billing ledger), PostgreSQL for uploaded plots
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
| `DATABASE_URL` | PostgreSQL for uploaded plots |
| `ANALYSIS_API_BASE` | Root of the EUDR analysis API (see [`docs/FRONTEND-INTEGRATION.md`](docs/FRONTEND-INTEGRATION.md)) |
| `PAYPAL_*` | PayPal app, plans and webhook; set up with [`scripts/setup-paypal.mjs`](scripts/setup-paypal.mjs) and [`scripts/PAYPAL-WEBHOOK.md`](scripts/PAYPAL-WEBHOOK.md) |
| `SMTP_*` | Verification, password-reset and contact emails |
| `LOCANIX_DATA_DIR` | Optional: folder for the file stores (default `.data`) |

## Pages

| Route | What it is |
| --- | --- |
| `/` | Landing page (v2 editorial design) |
| `/analyze` | Upload or draw plots and start the EUDR checks |
| `/dashboard`, `/dashboard/eudr` | Plot review, results per plot, Excel and DDS export |
| `/checkout` | Pay as you go, Regular and Professional plans via PayPal |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Accounts |
| `/about`, `/contact`, `/privacy` | Company pages |

## Structure

```
app/                 routes and API handlers (app/api/*)
components/
  landing/           landing sections: Hero (+ Globe), ProductPreview, HowItWorks, Pricing, FinalCta
  Navbar.tsx         site header (hero card on the landing, sticky bar elsewhere)
  Footer.tsx
  Logo.tsx           logo mark + wordmark
lib/
  data.ts            nav links, analyses, pricing tiers, company details, policy text
  server/            sessions, users, billing, PayPal, mailer, database
docs/design/v2-editorial/   design reference for the landing page (open Redesign-v2.dc.html)
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
