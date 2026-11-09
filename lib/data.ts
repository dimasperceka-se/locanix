import { type LucideIcon, ShieldCheck, TreePine } from "lucide-react";

/* -------------------------------------------------------------------------- */
/*  Navigation                                                                */
/* -------------------------------------------------------------------------- */

export type NavLink = { label: string; href: string };

/** AgriPlot Subscription is hidden for now: no nav links, /agriplot returns 404. */
export const SHOW_AGRIPLOT = false;

/** Main navigation, shared by the landing header and the site navbar. */
export const navLinks: NavLink[] = [
  { label: "How it works", href: "/#how" },
  { label: "EUDR", href: "/#eudr" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Company", href: "/about" },
];

/* -------------------------------------------------------------------------- */
/*  EUDR compliance analyses (live)                                           */
/* -------------------------------------------------------------------------- */

/**
 * Analysis identifiers; `endpoint` maps to the FastAPI route /api/v1/<endpoint>.
 * "ghg" and "rainfall" are coming soon: their result mapping is kept, but they
 * are not offered in `eudrAnalyses` (and the proxy rejects their endpoints).
 */
export type AnalysisKey = "deforestation" | "legality" | "ghg" | "rainfall";

export type AnalysisType = {
  key: AnalysisKey;
  endpoint: string;
  icon: LucideIcon;
  title: string;
  caption: string;
  description: string;
  /* Tailwind classes for the icon tile (background + icon color). */
  tile: string;
};

export const eudrAnalyses: AnalysisType[] = [
  {
    key: "deforestation",
    endpoint: "deforestation",
    icon: TreePine,
    title: "Deforestation Analysis",
    caption: "Forest loss detection",
    description:
      "Identify tree cover loss within your plot boundaries using satellite-verified data, aligned with EUDR baselines.",
    tile: "bg-clear-bg text-clear-ink",
  },
  {
    key: "legality",
    endpoint: "protected-area",
    icon: ShieldCheck,
    title: "Land Legality Analysis",
    caption: "Conservation zone check",
    description:
      "Check for overlaps with national parks, wildlife reserves, and other protected areas (WDPA) — including the IUCN category of each overlap.",
    tile: "bg-review-bg text-review-ink",
  },
];

export const ALL_ANALYSIS_KEYS: AnalysisKey[] = eudrAnalyses.map((a) => a.key);

export const analysisByKey = (key: AnalysisKey): AnalysisType =>
  eudrAnalyses.find((a) => a.key === key) ?? eudrAnalyses[0];

/** Analyses on the roadmap, listed on the landing page. */
export const comingSoonAnalyses = ["GHG emission", "rainfall", "biomass", "fire detection", "crop health", "mills nearby"];

/* -------------------------------------------------------------------------- */
/*  Pricing                                                                   */
/* -------------------------------------------------------------------------- */

export type CurrencyKey = "idr" | "usd";
export const CURRENCIES: Record<CurrencyKey, { symbol: string; label: string }> = {
  idr: { symbol: "Rp", label: "IDR" },
  usd: { symbol: "$", label: "USD" },
};

/** Price as shown: `amount` already includes the currency symbol. */
type Price = { amount: string; unit: string };

export type PricingTier = {
  name: string;
  tagline: string;
  idr: Price;
  usd: Price;
  sub: string;
  cta: string;
  features: string[];
  note: Record<CurrencyKey, string>;
  /* Highlighted (dark) card. */
  featured?: boolean;
};

/** Must match PRICES and QUOTAS in lib/server/billing.ts. */
export const pricingTiers: PricingTier[] = [
  {
    name: "Pay As You Go",
    tagline: "For occasional checks, no commitment.",
    idr: { amount: "Rp88.200", unit: "/ ha" },
    usd: { amount: "$4.90", unit: "/ ha" },
    sub: "No monthly fee",
    cta: "Start pay as you go",
    features: ["EUDR compliance analysis", "Review dashboard", "GeoJSON upload & map draw", "PDF export"],
    note: { idr: "Billed per hectare analyzed.", usd: "Billed per hectare analyzed." },
  },
  {
    name: "Regular",
    tagline: "For teams checking plots every month.",
    idr: { amount: "Rp522.000", unit: "/ month" },
    usd: { amount: "$29", unit: "/ month" },
    sub: "100 ha included per month",
    cta: "Choose Regular",
    features: ["Everything in Pay As You Go", "AI insights", "100 ha monthly quota"],
    note: {
      idr: "Extra usage Rp9.000/ha. Quota does not roll over.",
      usd: "Extra usage $0.50/ha. Quota does not roll over.",
    },
    featured: true,
  },
  {
    name: "Professional",
    tagline: "For supply-chain intelligence at scale.",
    idr: { amount: "Rp1.782.000", unit: "/ month" },
    usd: { amount: "$99", unit: "/ month" },
    sub: "500 ha included per month",
    cta: "Choose Professional",
    features: ["Everything in Regular", "Buy & export raw data", "Supply-chain sustainability insight", "Insight per business & country"],
    note: {
      idr: "Extra usage Rp4.500/ha. Quota does not roll over.",
      usd: "Extra usage $0.25/ha. Quota does not roll over.",
    },
  },
];

/* -------------------------------------------------------------------------- */
/*  Footer                                                                    */
/* -------------------------------------------------------------------------- */

export const legalLinks: NavLink[] = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Data Security", href: "/privacy#security" },
];

/** Company / contact details shown in the footer. */
export const company = {
  tagline: "Know which plots are safe to ship.",
  email: "info@locanix.id",
};

/* -------------------------------------------------------------------------- */
/*  Policies, Terms & Conditions — shown on /privacy and in the T&C modal     */
/* -------------------------------------------------------------------------- */

export type PolicySection = { id?: string; heading: string; body: string };

export const policyIntro =
  "Welcome to Locanix. By accessing or using our website, platform, services, or any related materials, you agree to comply with the following policies, terms, and conditions. Please read them carefully before using our services.";

export const policyUpdated = "Jakarta, June 19th 2026";

export const policySections: PolicySection[] = [
  {
    heading: "About Locanix",
    body: "Locanix provides spatial data verification, plantation mapping, traceability support, field data acquisition, and related digital solutions for agriculture, sustainability, and supply chain management. Information presented on this website is intended for general business and service information purposes only.",
  },
  {
    heading: "Use of Website and Services",
    body: "You agree to use this website and our services only for lawful, professional, and authorized purposes. You must not misuse the website, attempt unauthorized access, interfere with system security, copy or reproduce protected materials without permission, or use our services in a way that may harm Locanix, our clients, partners, or third parties.",
  },
  {
    heading: "Data and Information Submitted",
    body: "Any data, documents, coordinates, polygons, maps, images, survey results, or other information submitted to Locanix must be accurate, lawful, and authorized for use. You are responsible for ensuring that you have the right to share such information with us. Locanix may use submitted information solely for the purpose of delivering agreed services, technical assessment, proposal preparation, verification, reporting, or communication with you.",
  },
  {
    id: "security",
    heading: "Privacy and Confidentiality",
    body: "Locanix respects the confidentiality of client and user information. We will take reasonable measures to protect personal, business, and spatial data provided to us. We do not sell user data to third parties. Any confidential project data, including farm boundaries, GPS points, supply chain information, and operational records, will be handled with care and used only for the intended business purpose, unless otherwise required by law or agreed in writing.",
  },
  {
    heading: "Intellectual Property",
    body: "We aim to keep website information accurate and up to date. However, Locanix does not guarantee that all content is free from errors, omissions, or outdated information. Service availability, features, pricing, timelines, and technical specifications may change without prior notice. Any final scope, deliverables, fees, and responsibilities will be governed by a separate proposal, agreement, quotation, or contract.",
  },
  {
    heading: "Third-Party Tools and Links",
    body: "Our website or services may refer to third-party platforms, tools, datasets, maps, APIs, satellite imagery, or external websites. Locanix is not responsible for the accuracy, availability, security, or policies of third-party services. Your use of third-party services may be subject to their own terms and conditions.",
  },
  {
    heading: "Limitation of Liability",
    body: "To the maximum extent permitted by applicable law, Locanix shall not be liable for any indirect, incidental, consequential, or business losses arising from the use of this website, reliance on website information, technical interruptions, or the use of third-party data and services. Any liability related to paid services shall be limited to the terms stated in the applicable written agreement between Locanix and the client.",
  },
  {
    heading: "User Responsibilities",
    body: "Users and clients are responsible for providing accurate information, maintaining the confidentiality of account credentials where applicable, ensuring legal rights over submitted data, reviewing outputs before operational or regulatory use, and complying with relevant laws, regulations, and industry standards.",
  },
  {
    heading: "Changes to These Terms",
    body: "Locanix may update these Policies, Terms & Conditions from time to time. Any updates will be posted on this page with the latest revision date. Continued use of our website or services after changes are published means you accept the updated terms.",
  },
  {
    heading: "Contact",
    body: "For questions regarding these Policies, Terms & Conditions, or to request clarification about how your data is handled, please contact Locanix through the official contact information provided on our website.",
  },
];
