/**
 * Data-use consent shown before a user's first analysis. Bump the version
 * whenever the statement in components/ConsentGate.tsx changes, so every user
 * is asked to agree to the new wording.
 */
export const CONSENT_VERSION = "2026-10-data-use";

export type DataConsent = { version: string; acceptedAt: number };

export const hasConsent = (user: { dataConsent?: DataConsent | null } | null) =>
  user?.dataConsent?.version === CONSENT_VERSION;
