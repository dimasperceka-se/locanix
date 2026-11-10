import { FREE_QUOTA_HA } from "./quota";

/**
 * DDS Submission: types and constants shared by the API routes and the pages.
 * Field rules follow the EUIS V4 XSDs and the "API and UI Validation Rules" page of
 * the EUDR Information System – Operator API Reference.
 */

/** Free users may file DDS covering this many hectares of distinct plots in total. */
export const DDS_FREE_QUOTA_HA = FREE_QUOTA_HA;

export type ActivityType = "IMPORT" | "EXPORT" | "DOMESTIC";
export const ACTIVITY_TYPES: { value: ActivityType; label: string }[] = [
  { value: "IMPORT", label: "Import (release for free circulation)" },
  { value: "EXPORT", label: "Export" },
  { value: "DOMESTIC", label: "Domestic (placing on the EU market)" },
];

/** EuropeanCountryType in the EUIS common schema (EU Member States + XI). */
export const EU_COUNTRIES: [string, string][] = [
  ["AT", "Austria"], ["BE", "Belgium"], ["BG", "Bulgaria"], ["HR", "Croatia"], ["CY", "Cyprus"], ["CZ", "Czech Republic"],
  ["DK", "Denmark"], ["EE", "Estonia"], ["FI", "Finland"], ["FR", "France"], ["DE", "Germany"], ["GR", "Greece"],
  ["HU", "Hungary"], ["IE", "Ireland"], ["IT", "Italy"], ["LV", "Latvia"], ["LT", "Lithuania"], ["LU", "Luxembourg"],
  ["MT", "Malta"], ["NL", "Netherlands"], ["PL", "Poland"], ["PT", "Portugal"], ["RO", "Romania"], ["SK", "Slovakia"],
  ["SI", "Slovenia"], ["ES", "Spain"], ["SE", "Sweden"], ["XI", "United Kingdom (Northern Ireland)"],
];
export const EU_CODES = new Set(EU_COUNTRIES.map(([c]) => c));

/** Common HS headings for the relevant commodities (Regulation (EU) 2023/1115, Annex I). */
export const COMMODITY_PRESETS: { hs: string; label: string }[] = [
  { hs: "0901", label: "Coffee" },
  { hs: "1801", label: "Cocoa beans" },
  { hs: "1511", label: "Palm oil" },
  { hs: "1207", label: "Palm nuts and kernels" },
  { hs: "4001", label: "Natural rubber" },
  { hs: "1201", label: "Soya beans" },
  { hs: "4403", label: "Wood in the rough" },
  { hs: "4407", label: "Sawn wood" },
  { hs: "0102", label: "Live cattle" },
];

/** Wood products need species information (scientific and common name). */
export const isWoodHs = (hs: string) => /^(44|47|48|49|9401|9403|9406)/.test(hs);

export type DdsDetails = {
  activityType: ActivityType;
  countryOfActivity: string;
  borderCrossCountry: string;
  hsHeading: string;
  description: string;
  /** Decimal strings, as sent: up to 10 integer and 6 fraction digits. */
  netWeightKg: string;
  supplementaryUnit: string;
  supplementaryUnitQualifier: string;
  producerName: string;
  producerCountry: string;
  scientificName: string;
  commonName: string;
  geoLocationConfidential: boolean;
  comment: string;
};

export const EMPTY_DETAILS: DdsDetails = {
  activityType: "IMPORT",
  countryOfActivity: "",
  borderCrossCountry: "",
  hsHeading: "",
  description: "",
  netWeightKg: "",
  supplementaryUnit: "",
  supplementaryUnitQualifier: "",
  producerName: "",
  producerCountry: "",
  scientificName: "",
  commonName: "",
  geoLocationConfidential: false,
  comment: "",
};

/** Locanix states around the EUIS lifecycle (EudrStatusType) values. */
export type DdsStatus =
  | "DRAFT"
  | "SUBMITTING"
  | "POSSIBLY_FILED"
  | "SUBMITTED"
  | "AVAILABLE"
  | "REJECTED"
  | "WITHDRAWN"
  | "CANCELLED"
  | "ARCHIVED"
  | "GROUPED"
  | "OBSOLETE";

export const EUIS_STATUSES = ["SUBMITTED", "AVAILABLE", "REJECTED", "WITHDRAWN", "CANCELLED", "ARCHIVED", "GROUPED", "OBSOLETE"] as const;

export const STATUS_LABEL: Record<DdsStatus, string> = {
  DRAFT: "Draft",
  SUBMITTING: "Sending…",
  POSSIBLY_FILED: "Check needed",
  SUBMITTED: "Submitted",
  AVAILABLE: "Available",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  CANCELLED: "Cancelled",
  ARCHIVED: "Archived",
  GROUPED: "Grouped",
  OBSOLETE: "Obsolete",
};

export const STATUS_BADGE: Record<DdsStatus, string> = {
  DRAFT: "bg-[#ECEBE5] text-[#3A403C]",
  SUBMITTING: "bg-[#E4EEF9] text-[#1D3F66]",
  POSSIBLY_FILED: "bg-review-bg text-review-ink",
  SUBMITTED: "bg-[#E4EEF9] text-[#1D3F66]",
  AVAILABLE: "bg-clear-bg text-clear-ink",
  REJECTED: "bg-[#F9E1DE] text-[#7A1F14]",
  WITHDRAWN: "bg-[#ECEBE5] text-[#3A403C]",
  CANCELLED: "bg-[#ECEBE5] text-[#3A403C]",
  ARCHIVED: "bg-[#ECEBE5] text-[#3A403C]",
  GROUPED: "bg-[#ECEBE5] text-[#3A403C]",
  OBSOLETE: "bg-[#ECEBE5] text-[#3A403C]",
};

export type ReadinessItem = { key: string; label: string; ok: boolean; detail?: string };

export type DdsPlotView = { workspaceId: number; plotId: string; name: string; areaHa: number };

export type DdsHistoryEntry = { at: number; event: string; detail?: string };

export type EuisInfo = {
  uuid?: string;
  referenceNumber?: string;
  verificationNumber?: string;
  referenceNumberInfo?: string;
  status?: string;
  rejectionReason?: string;
  communication?: { date?: string; content?: string };
  date?: string;
  version?: number;
  userMessage?: string;
};

/** A statement as the pages see it (no geometry, no credentials). */
export type DdsView = {
  id: string;
  status: DdsStatus;
  environment: "acceptance" | "mock";
  createdAt: number;
  updatedAt: number;
  details: DdsDetails;
  plots: DdsPlotView[];
  areaHa: number;
  internalReference?: string;
  submitStartedAt?: number;
  submittedAt?: number;
  lastCheckedAt?: number;
  /** Earliest time Locanix will ask EUIS for the status again. */
  nextCheckAt?: number;
  lastError?: string;
  euis: EuisInfo;
  confirmedBy?: { name: string; email: string; at: number };
  history: DdsHistoryEntry[];
  readiness?: ReadinessItem[];
};

export type EuisIdentityView = {
  name: string;
  username: string;
  clientId: string;
  operatorAccessId: string;
  hasKey: true;
  updatedAt: number;
  lastTest?: { ok: boolean; at: number; message: string };
};

export type DdsQuota = { paid: boolean; usedHa: number; limitHa: number | null };
