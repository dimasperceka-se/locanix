# Locanix — Product Requirements Document (PRD)

| | |
|---|---|
| **Product** | Locanix — Land/plot geospatial compliance platform (EUDR) |
| **Document** | PRD v1.1 — revised to align with approved user flow |
| **Date** | 2026-06-15 |
| **Status** | MVP built & verified; some analyses pending backend Earth Engine auth |
| **Owner** | Locanix team |
| **Changelog** | v1.1: Rewrote §6 UX Flows to match approved flow diagram (bulk/non-bulk branching, 2ha threshold, Package & Quota gating, differentiated analysis paths). Updated §8 Functional Requirements accordingly. |

---

## 1. Overview

Locanix turns a land/plot boundary (GeoJSON or hand-drawn polygon) into a structured compliance report. The flagship use case is **EUDR (EU Deforestation Regulation) compliance**: for each plot, Locanix checks geometry validity and runs satellite-backed analyses (deforestation, land legality, GHG emissions, rainfall), then presents the results in a downloadable report or a dashboard with a per-plot detail view.

This document focuses on the **end-to-end UI/UX flow** as implemented, plus the supporting functional, data, and integration requirements.

---

## 2. Goals & non-goals

**Goals**
- Let a user go from "I have a plot boundary" to "I have a compliance verdict" in minutes.
- Route users through the correct analysis and payment path based on data type (bulk vs single) and plot area (< 2 ha vs ≥ 2 ha).
- Deliver an audit-ready, scannable report (downloadable report or dashboard + per-plot detail).
- Frictionless onboarding (email sign-up, Google option) and a pay-as-you-go/subscription model.

**Non-goals (current build)**
- Real payment capture (checkout is a UI prototype; no gateway charge).
- Production-grade identity (file-based user store; no SSO/CAM, no passkeys).
- Team/multi-tenant management, RBAC, billing history.

---

## 3. Personas

| Persona | Need |
|---|---|
| **Smallholder / estate operator** | Quick EUDR check on a small plot (< 2 ha) before selling/exporting. |
| **Sustainability / compliance officer** | Audit-ready evidence (deforestation, legality) per plot, typically ≥ 2 ha estates. |
| **Supply-chain analyst** | Bulk plots, risk screening, exportable data. |

---

## 4. Scope

**In scope (built)**
- Marketing homepage with analysis selection.
- Auth: email register → email verification → login → logout.
- Add plot: GeoJSON upload **or** draw-on-map (OpenLayers).
- Bulk vs non-bulk detection and routing.
- Geometry validation + dashboard summary.
- Area-based branching (< 2 ha → Plot Survey + Deforestation; ≥ 2 ha → Payment + Land Legality).
- Package & Quota check at decision points.
- EUDR analysis run (selected analyses) → results table → per-plot detail.
- Checkout (plan + voucher + survey discount + payment form UI).
- Downloadable reports (non-dashboard path).

**Coming soon (shown, not active)**
- Biomass, Fire Detection, Crop Health, Mill Nearby.

**Out of scope (current)**
- CAM login, passkey login, real Google OAuth, real payment, password reset.

---

## 5. Information architecture (routes)

| Route | Screen | Auth | Notes |
|---|---|---|---|
| `/` | Homepage (marketing + analysis selection) | public | Auth-aware navbar |
| `/login` | **F51** Login | public | Tencent-style two-pane |
| `/register` | **F52** Create account | public | |
| `/verify-sent` | **F53** Check your email | public | |
| `/api/auth/verify` | Email link handler → `/login?verified=1` | public | |
| `/dashboard` | **F28** Plot dashboard | public* | Reads client store |
| `/dashboard/eudr` | **F30** EUDR results table | public* | Sidebar layout |
| `/dashboard/eudr/[id]` | **F31** Per-plot EUDR detail | public* | Sidebar layout |
| `/checkout` | **F55–F57** Choose plan & pay | **required** | Redirects to `/login?next=/checkout` |
| `/reports/download` | Report download (non-dashboard) | **required** | For plots routed through non-dashboard path |

\* Dashboard routes are not server-gated today; they rely on client plot state.

**Modal / overlay screens (not routes):**
- **F27 / F65 / F66 / FD** — "Add plot data" modal (upload row / draw map / map / fullscreen map).
- **F29** — "Analyzing your land" (Geometry Checker) interstitial.
- **F32** — "Analyzing your land" (EUDR) interstitial.

---

## 6. UX FLOWS (primary section)

### 6.1 Flow map

```mermaid
flowchart TD
    Start((Start))
    RunAnalyze[User run analyze<br>from landing page]
    CheckLogin{Check<br>Login}
    RegisterFlow([Register Flow])
    Login[Login]
    Upload[Upload GeoJSON<br>return / polygon]
    CheckBulk{Bulk data<br>or not?}

    %% Bulk path
    CheckPkgQuotaBulk{Check<br>Package &<br>Quota}
    PaymentPro[Payment Page<br>Pay as you go /<br>professionals]
    RunAnalysis[Run the analysis]

    %% Non-bulk path
    GeoCheck{Geometry<br>check}
    PopupFailed([Pop-up failed])
    ResultGeo{Result of<br>geometry check}
    LessThan2ha[Less than 2ha]
    MoreThan2ha[More than 2ha]

    %% Right side
    PkgQuotaCheck{Package &<br>Quota Check}
    PlotSurvey([Plot Survey])
    PaymentPAYG[Payment Page<br>Pay as you go]
    DeforestCheck{Deforestation<br>check}
    LandLegality{Land Legality<br>check}
    DownloadReport[Download reports<br>tanpa dashboard]

    %% Main flow
    Start --> RunAnalyze --> CheckLogin
    CheckLogin -- Not logged in -.-> RegisterFlow
    RegisterFlow -.-> CheckLogin
    CheckLogin -- Logged in --> Login
    Login --> Upload

    %% Bulk vs non-bulk
    Upload --> CheckBulk
    CheckBulk -- Bulk --> CheckPkgQuotaBulk
    CheckPkgQuotaBulk --> PaymentPro
    CheckPkgQuotaBulk --> RunAnalysis
    CheckBulk -- Not bulk --> GeoCheck

    %% Geometry check
    GeoCheck -- Failed --> PopupFailed
    PopupFailed --> Upload
    GeoCheck -- Passed --> ResultGeo

    %% Area threshold
    ResultGeo --> LessThan2ha
    ResultGeo --> MoreThan2ha

    %% Less than 2ha path
    LessThan2ha --> PkgQuotaCheck
    PkgQuotaCheck -.-> PlotSurvey
    PlotSurvey --> DeforestCheck
    DeforestCheck --> DownloadReport

    %% More than 2ha path
    MoreThan2ha --> PkgQuotaCheck
    PkgQuotaCheck --> PaymentPAYG
    PaymentPAYG --> LandLegality
    LandLegality --> DownloadReport
```

### 6.2 Flow A — Discovery → Account → Login

1. **Homepage (`/`)** shows the value prop and the EUDR analysis selection.
   - Logged-out navbar: **Login**. Logged-in navbar: **Hi {name} · Go to dashboard · Logout**.
2. **Login (F51)** — Tencent Cloud-style two-pane:
   - Left card: *Log in with email* → Email, Password (show/hide), **Log in**, divider, **Log in with Google**, `Sign up | Forgot password`.
   - Right: Locanix marketing ("EUDR compliance checks, ready in minutes") + **Start Free**.
   - No "Log in as CAM" / "Log in with Passkey".
3. **Register (F52)** — Continue with Google, or Name / Email / Password / Password Confirmation → **Create account**.
4. **Verify email (F53)** — "You're ready to go! / Check your email to begin." Includes **resend the email**.
5. User clicks the verification link → account marked verified → redirected to **F51** with a success banner.
6. **Log in** → lands on **homepage** (`/`), navbar now in logged-in state.

**Rules**
- Login requires a **verified** email.
- `?next=` is sanitized to internal paths only (open-redirect guard).
- Verification email is sent via Brevo SMTP (see §10).

### 6.3 Flow B — Add plot & bulk/non-bulk routing

1. From homepage, the user clicks **Run compliance check** (or **Add plot** on the dashboard).
2. **Add plot data modal** opens with two tabs:
   - **Upload file** — drag/drop or browse a `.geojson`/`.json` (≤ 10 MB). After selection it shows the **uploaded file row (F27)**: file icon, name, size, ✓, delete. **Run Analysis** enables.
   - **Draw on map (F66)** — OpenLayers map (OSM **and** Google Satellite basemaps), tools: Grab / Add Point / Undo / Redo / Reset, Search location (Nominatim), Use current location, zoom. Live **Polygon point count + Total Area (ha)**. **Expand → fullscreen (FD)** with floating toolbar + bottom card (stats + Run Analysis).
3. **Run Analysis** → system determines whether the submitted data is **bulk** (multiple features / large dataset) or **non-bulk** (single plot).

#### 6.3.1 Bulk path

4. **Bulk data detected** → **Check Package & Quota**: system checks whether the user's current plan/quota covers the submission.
   - **Quota sufficient** → proceed directly to **Run the analysis** (all selected analyses execute).
   - **Quota insufficient or no plan** → redirect to **Payment Page (Pay as you go / Professionals)** for plan selection/upgrade, then proceed to analysis.

#### 6.3.2 Non-bulk path (single plot)

4. **Non-bulk data** → **Geometry check (F29)**: "Analyzing your land" interstitial. The loading bar tracks the **real** API call (`POST /api/analysis/validate-geometry`).
   - **Geometry check failed** → **Pop-up failed** notification. User is returned to the upload step to correct and re-submit.
   - **Geometry check passed** → proceed to **area-based routing** (§6.4).

### 6.4 Flow C — Area-based routing (< 2 ha vs ≥ 2 ha)

After a successful geometry check, the system evaluates the validated plot area.

#### 6.4.1 Less than 2 ha

1. **Package & Quota Check** — system verifies entitlement.
2. **Plot Survey** — user is prompted to fill plot information (a short survey about the plot's use, crop type, ownership context). This serves both data-enrichment and as a discount mechanism (see §6.6).
3. **Deforestation check** — the system runs deforestation analysis on the plot.
4. **Download reports (tanpa dashboard)** — user receives a downloadable compliance report. This path does not route through the full dashboard; the report is the deliverable.

#### 6.4.2 More than or equal to 2 ha

1. **Package & Quota Check** — system verifies entitlement.
2. **Payment Page (Pay as you go)** — user must complete payment before analysis proceeds. Total = area (ha) × per-ha rate.
3. **Land Legality check** — the system runs land legality / protected area analysis on the plot.
4. **Download reports (tanpa dashboard)** — user receives a downloadable compliance report.

**Rules**
- The 2 ha threshold is a system constant; configurable in environment/admin settings.
- Both paths end at a downloadable report, not the dashboard. The dashboard (F28 → F30 → F31) remains available as a separate entry point for users who want to browse all their plots interactively.
- Package & Quota Check appears in both paths: the system must verify entitlement before any analysis runs, regardless of area.

### 6.5 Flow D — Dashboard & EUDR detail (F28 → F30 → F31)

The dashboard is a persistent workspace for users who have run analyses. It is accessible independently of the primary report-download flow.

1. **Dashboard (F28)**:
   - "Plot Uploaded" banner; **Total Plot Area** (sum ha); **Add plot** tile.
   - Stat tiles: **Total Plot / Valid / Invalid**.
   - **Map** showing the plot(s), fit-to-extent (OSM/Satellite, expand, zoom).
   - **Plots table**: No, Area, Duplicate Vertices, Zero Area, Self-Intersection.
   - **Run EUDR Analysis** CTA.
2. **Run EUDR Analysis** → **F32 "Analyzing your land" (EUDR)** interstitial. The step pills reflect the analyses the user selected. Only the selected endpoints are called, in parallel.
3. **EUDR results (F30)** — sidebar workspace. Table per plot: No, Area, Deforestation, Land Legality, Risk, and a **→** to open detail.
4. **Plot detail (F31)** — same sidebar; header "EUDR Analysis" + back link; **map** of the plot; **Plot Information** card (name, area, vertices, geometry, status, risk, country, centroid); tabbed results: **Rainfall · Deforestation · GHG Emissions · Legality Analysis**, each with a verdict banner + metric tiles. Tabs without data show "Not analyzed yet".

### 6.6 Flow E — Checkout & payment (F55 → F56 → F57)

1. **Get Started** (pricing) or **area ≥ 2 ha path** or **bulk with insufficient quota** → `/checkout`. If not logged in → redirect to **F51** with `next=/checkout`; after login, return to checkout.
2. **F55 Checkout**: left **Choose A Plan** (Pay As You Go / Regular / Professional); right **Voucher Code**, a teal **"You don't have to pay if you fill the plot information / Fill Information"** banner, **Order summary** (Total Plot Area, Total Plot, Total due now), and **payment form** (cardholder, card number, expire, CVC) + **Pay**.
   - *Pay As You Go* total = `Total Plot Area (ha) × $14.9`.
3. **F56 Voucher applied**: entering `LocanixEUDR` → **Voucher Discount** zeroes the total ("Total due now $0").
4. **F57 Survey completed**: completing **Fill Information** → **Survey Discount** zeroes the total; banner becomes **"Edit the survey ✎"** with a check.
5. **Pay** → returns to analysis execution (or dashboard if coming from pricing page).

---

## 7. Screen specifications (summary)

| Code | Screen | Key elements | States |
|---|---|---|---|
| **F51** | Login | email, password (show/hide), Log in, Google, Sign up/Forgot, lang selector, marketing, footer | idle / error / busy / `verified=1\|0` banner |
| **F52** | Register | name, email, password, confirm, Google, Create account | validation error / busy |
| **F53** | Verify sent | mail icon, recipient email, resend | idle / sending / sent |
| **F27** | Upload row | file icon, name, size, ✓, delete; Run Analysis enabled | empty dropzone / file selected / error |
| **F66/FD** | Draw map | OSM+Satellite, draw tools, search, locate, zoom, stats; fullscreen | grab / add-point; inline / fullscreen |
| **F29** | Geometry loading | "Geometry Checker" pill, %, progress | waiting on API → complete / failed |
| **F28** | Dashboard | banner, area, stat tiles, map, plots table, Run EUDR | empty (no plots) / populated |
| **F32** | EUDR loading | pills = selected analyses, %, progress | waiting on APIs → complete |
| **F30** | EUDR results | per-plot table + open arrows | empty / populated |
| **F31** | Plot detail | map, plot info, 4 result tabs | tab w/ data / "not analyzed yet" |
| **F55–57** | Checkout | plan, voucher, survey, summary, payment | base / voucher / survey discount |
| **NEW** | Geometry failed popup | error message, retry CTA | modal overlay |
| **NEW** | Plot Survey | plot info form (crop type, ownership, use) | empty / filled / edit mode |
| **NEW** | Report download | downloadable report file, summary | ready / downloading |

---

## 8. Functional requirements

**Auth**
- FR-A1: Register with name/email/password (+confirm); email format + min length validated.
- FR-A2: Send a verification email with a tokenized link; account starts unverified.
- FR-A3: Verify via link → mark verified.
- FR-A4: Login requires correct credentials **and** a verified account; sets an httpOnly session cookie.
- FR-A5: Logout clears the session (server + client) only on success.
- FR-A6: Auth POST routes enforce same-origin; `next` redirect restricted to internal paths.

**Plot submission & routing**
- FR-B1: Accept a plot via GeoJSON upload or map-drawn polygon → normalized to a FeatureCollection with a stable `plot_id` per feature.
- FR-B2: On submission, detect whether input is **bulk** (multi-feature or dataset above a size/count threshold) or **non-bulk** (single plot).
- FR-B3 (Bulk): Check user's package & quota. If sufficient, proceed to analysis. If insufficient, route to checkout/payment.
- FR-B4 (Non-bulk): Run geometry validation via `/validate-geometry`. On failure, show pop-up and return user to upload. On success, proceed to area-based routing.
- FR-B5: After geometry validation, evaluate plot area against the **2 ha threshold**.

**Analysis routing by area**
- FR-C1 (< 2 ha): Check package & quota → prompt Plot Survey → run **Deforestation check** → deliver downloadable report.
- FR-C2 (≥ 2 ha): Check package & quota → route to **Payment Page (PAYG)** → run **Land Legality check** → deliver downloadable report.
- FR-C3: Both paths terminate at a downloadable report, not the dashboard. Dashboard access is independent.
- FR-C4: Package & Quota Check is mandatory before any analysis, regardless of path.

**Analysis execution**
- FR-D1: User selects which analyses run (from homepage); the EUDR step calls **only** the selected endpoints, in parallel, and merges results by `plot_id`.
- FR-D2: Loading interstitials track the real async calls (not a fixed timer) and reflect the selected analyses.
- FR-D3: Any analysis failure degrades gracefully (per-tab "not analyzed yet"); local fallback for geometry if the API is unreachable.

**Checkout**
- FR-E1: Auth-gated; unauthenticated users routed through login and back.
- FR-E2: Total = plan price (PAYG = area × $14.9/ha); voucher `LocanixEUDR` or completed survey → $0.
- FR-E3: Checkout is triggered by: (a) ≥ 2 ha area path, (b) bulk path with insufficient quota, or (c) user clicking "Get Started" from pricing.

**Plot Survey**
- FR-F1: The Plot Survey collects: crop type, land ownership type, intended use/export destination.
- FR-F2: Completing the survey qualifies the user for a survey discount (see FR-E2).
- FR-F3: Survey data is stored per-plot and included in the downloadable report.

---

## 9. Data model (client/runtime)

```
Plot {
  id, plotId, name,
  ring: [lon,lat][], areaHa,
  checks: { duplicateVertices, zeroArea, selfIntersection },
  isValid, issues[],
  isBulk: boolean,
  survey?: { cropType, ownershipType, intendedUse, exportDestination },
  eudr?: {
    deforestation?: { riskLevel, gfw/jrc/sbtn: {ha, pct} },
    protectedArea?: { status, categories[] },
    rainfall?: { meanMm, minMm, maxMm, stdMm, areaHa, period },
    ghg?: { totalTco2e, gfw/jrc/sbtn: {ha, tco2e} }
  }
}

PackageQuota {
  userId, plan: "payg" | "regular" | "professional",
  remainingHa: number,
  remainingPlots: number
}

AnalysisKey = "deforestation" | "legality" | "ghg" | "rainfall"
AreaThreshold = 2.0  // ha; configurable

Session (httpOnly, HMAC-signed) { uid, name, email }
User (server store) { id, name, email, passwordHash, verified, verifyToken, createdAt }
```

Client plot/selection state persists in a React context + `sessionStorage`.

---

## 10. Integrations

**Analysis API (FastAPI, `global-compliance-system.com`)** — proxied by `/api/analysis/[type]` (server-side, multipart `file`, avoids CORS):

| Analysis | Endpoint | Status | Used by path |
|---|---|---|---|
| Geometry | `/api/v1/validate-geometry` | ✅ live | Non-bulk only |
| Deforestation | `/api/v1/deforestation` | ✅ live | < 2 ha path |
| Land Legality | `/api/v1/protected-area` | ⏳ needs Earth Engine auth | ≥ 2 ha path |
| GHG Emission | `/api/v1/ghg-emission` | ⏳ needs Earth Engine auth | Dashboard / full EUDR |
| Rainfall | `/api/v1/rainfall` | ⏳ needs Earth Engine auth | Dashboard / full EUDR |

**Email (Brevo SMTP)** — `smtp-relay.brevo.com:587`, used for verification emails. Sending works (250 OK); inbox **deliverability** requires an authenticated sender domain (SPF/DKIM) + a verified `SMTP_FROM`.

---

## 11. Technical architecture

- **Next.js 15 (App Router) + React 19 + TypeScript**, **Tailwind v4**, **lucide-react**, **OpenLayers** (maps), **nodemailer** (Brevo).
- Server: Route Handlers for auth + analysis proxy; HMAC-signed httpOnly session cookie; file-based user store (`.data/users.json`).
- Fonts via `next/font` (Plus Jakarta Sans + Inter).

---

## 12. Non-functional requirements

- **Responsive**: mobile-first; grids collapse, navbar → hamburger, map sidebar hides on small screens.
- **Accessibility**: semantic headings, `aria-pressed` toggles, labelled controls, decorative icons `aria-hidden`.
- **Security**: passwords hashed (scrypt); httpOnly+SameSite session; same-origin checks on auth POSTs; open-redirect guard; fail-closed `SESSION_SECRET` in production.
- **Performance**: heavy deps (OpenLayers) dynamically imported; loading interstitials cover multi-second API calls.

---

## 13. Known limitations & dependencies

1. **Earth Engine**: rainfall/GHG/protected-area return 500 until EE is authenticated on the FastAPI server (service-account keys exist; auth pending).
2. **Email deliverability**: configure SPF/DKIM + a verified Brevo sender for inbox delivery.
3. **Payment**: checkout is a UI prototype — no real charge.
4. **Auth store**: file-based (good for prototype; replace with a DB for production). No password reset, no real Google OAuth, no CAM/passkey.
5. **Dashboard routes** are not server-gated yet.
6. **Bulk detection logic**: threshold for "bulk" (feature count or file size) needs to be defined and tuned.
7. **Report generation**: downloadable report format (PDF) and template need to be built; currently placeholder.
8. **Plot Survey**: form fields and validation rules need final sign-off from product.

---

## 14. Roadmap (Coming Soon)

Biomass · Fire Detection · Crop Health · Mill Nearby — surfaced on the homepage as "Coming Soon" tiles; plus production hardening of the items in §13.
