import { randomUUID } from "node:crypto";
import { checkGeometry, type Plot } from "../geo";
import { plotKind } from "../plotStatus";
import {
  ACTIVITY_TYPES,
  DDS_FREE_QUOTA_HA,
  EMPTY_DETAILS,
  EU_CODES,
  EUIS_STATUSES,
  STATUS_LABEL,
  isWoodHs,
  type DdsDetails,
  type DdsQuota,
  type DdsStatus,
  type DdsView,
  type EuisIdentityView,
  type ReadinessItem,
} from "../ddsShared";
import { billedPlots } from "./billingGeometry";
import { billingSummary } from "./billing";
import { loadWorkspace } from "./workspace";
import { DdsError, ddsTransaction, readDdsState, type DdsState, type DdsStatement, type EuisIdentity, type StoredPlot } from "./ddsStore";
import { SecretConfigError, openSecret, sealSecret } from "./euis/secret";
import {
  EuisFault,
  EuisUnreachable,
  euisEndpoint,
  getDds,
  getDdsByInternalReference,
  submitDds,
  testEcho,
  withdrawDds,
  type DdsOverview,
  type EuisCredentials,
} from "./euis/client";
import { MAX_GEO_BYTES, statementGeoJson, submitDdsRequest } from "./euis/statement";

export { DdsError } from "./ddsStore";

type User = { uid: string; name: string; email: string };

/* --------------------------------- Timing --------------------------------- */

// EUIS guidance ("Acquiring Credentials" → Usage expectation / Recommended business
// behaviour): wait at least one hour after submitting before asking for the reference
// number, and avoid high-frequency polling. The defaults follow it; the variables let
// the mock EUIS in local runs and e2e tests answer quickly.
const seconds = (name: string, fallback: number) => {
  const raw = process.env[name];
  const value = raw !== undefined && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : fallback;
  return Math.max(process.env.NODE_ENV === "production" ? 60 : 0, value) * 1000;
};
const FIRST_CHECK_MS = () => seconds("EUIS_STATUS_FIRST_CHECK_SEC", 3600);
const CHECK_INTERVAL_MS = () => seconds("EUIS_STATUS_INTERVAL_SEC", 900);
/** "Check needed": how often to look the attempt up, and when "not found" means "not filed". */
const RESOLVE_INTERVAL_MS = () => seconds("EUIS_RESOLVE_INTERVAL_SEC", 120);
const RESOLVE_UNLOCK_MS = () => seconds("EUIS_RESOLVE_UNLOCK_SEC", 600);
/** A submit that never recorded its outcome (crash) is treated as "check needed". */
const SUBMITTING_STALE_MS = 3 * 60 * 1000;

/* -------------------------------- Helpers --------------------------------- */

const now = () => Date.now();
const fmtHa = (n: number) => `${n.toFixed(2)} ha`;
const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max) : "";
const DECIMAL = /^\d{1,10}(\.\d{1,6})?$/;
const positiveDecimal = (s: string) => DECIMAL.test(s) && Number(s) > 0;

function log(st: DdsStatement, event: string, detail?: string) {
  st.history.push({ at: now(), event, ...(detail ? { detail } : {}) });
  if (st.history.length > 200) st.history.splice(0, st.history.length - 200);
}

function effectiveStatus(st: DdsStatement): DdsStatus {
  if (st.status === "SUBMITTING" && now() - (st.submitStartedAt ?? 0) > SUBMITTING_STALE_MS) return "POSSIBLY_FILED";
  return st.status;
}

function describe(e: unknown): string {
  if (e instanceof EuisFault) {
    const errors = e.errors
      .map((x) => [x.id, x.message, x.field ? `(${x.field})` : ""].filter(Boolean).join(" "))
      .filter(Boolean);
    return errors.length && !e.message.includes(errors[0]) ? `${e.message} — ${errors.join("; ")}` : e.message;
  }
  return (e as Error)?.message || String(e);
}

function credentials(identity: EuisIdentity | null): EuisCredentials {
  if (!identity) throw new DdsError("Add your EUIS Acceptance connection in Settings first.", 409);
  try {
    return {
      username: identity.username,
      authKey: openSecret(identity.authKeySealed),
      clientId: identity.clientId,
      operatorAccessId: identity.operatorAccessId || undefined,
    };
  } catch (e) {
    if (e instanceof SecretConfigError) throw new DdsError(e.message, 503);
    throw e;
  }
}

function seal(key: string): string {
  try {
    return sealSecret(key);
  } catch (e) {
    if (e instanceof SecretConfigError) throw new DdsError(e.message, 503);
    throw e;
  }
}

/* --------------------------------- Views ---------------------------------- */

function identityView(identity: EuisIdentity | null): EuisIdentityView | null {
  if (!identity) return null;
  return {
    name: identity.name,
    username: identity.username,
    clientId: identity.clientId,
    operatorAccessId: identity.operatorAccessId,
    hasKey: true,
    updatedAt: identity.updatedAt,
    lastTest: identity.lastTest,
  };
}

function view(st: DdsStatement, readiness?: ReadinessItem[]): DdsView {
  return {
    id: st.id,
    status: effectiveStatus(st),
    environment: st.environment,
    createdAt: st.createdAt,
    updatedAt: st.updatedAt,
    details: st.details,
    plots: st.plots.map((p) => ({ workspaceId: p.workspaceId, plotId: p.plotId, name: p.name, areaHa: p.areaHa })),
    areaHa: st.areaHa,
    internalReference: st.internalReference,
    submitStartedAt: st.submitStartedAt,
    submittedAt: st.submittedAt,
    lastCheckedAt: st.lastCheckedAt,
    nextCheckAt: st.nextCheckAt,
    lastError: st.lastError,
    euis: st.euis,
    confirmedBy: st.confirmedBy,
    history: st.history,
    ...(readiness ? { readiness } : {}),
  };
}

/* ------------------------------ Free DDS quota ----------------------------- */

/** Statements that used up DDS allowance: everything sent, except what EUIS rejected or cancelled. */
const COUNTS_FOR_QUOTA = (s: DdsStatus) => !["DRAFT", "REJECTED", "CANCELLED"].includes(s);

function usedKeys(state: DdsState, exceptId?: string): Map<string, number> {
  const keys = new Map<string, number>();
  for (const st of Object.values(state.statements)) {
    if (st.id === exceptId || !COUNTS_FOR_QUOTA(effectiveStatus(st))) continue;
    for (const p of st.plots) keys.set(p.key, p.areaHa);
  }
  return keys;
}

function quotaOf(state: DdsState, paid: boolean): DdsQuota {
  const usedHa = [...usedKeys(state).values()].reduce((s, n) => s + n, 0);
  return { paid, usedHa, limitHa: paid ? null : DDS_FREE_QUOTA_HA };
}

/* -------------------------------- Readiness -------------------------------- */

type ReadinessContext = { identity: EuisIdentity | null; workspace: Plot[] | null; paid: boolean; used: Map<string, number> };

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

function readiness(st: DdsStatement, ctx: ReadinessContext): ReadinessItem[] {
  const d = st.details;
  const items: ReadinessItem[] = [];

  items.push({
    key: "identity",
    label: "EUIS Acceptance connection",
    ok: !!ctx.identity,
    detail: ctx.identity ? `Web-service user ${ctx.identity.username}` : "Add your EUIS web-service user in Settings.",
  });

  const byId = new Map((ctx.workspace ?? []).map((p) => [p.id, p]));
  const missing = st.plots.filter((p) => {
    const w = byId.get(p.workspaceId);
    return !w || JSON.stringify(w.ring) !== JSON.stringify(p.ring);
  });
  const notClear = st.plots.filter((p) => {
    const w = byId.get(p.workspaceId);
    return w && !missing.includes(p) && plotKind(w) !== "clear";
  });
  items.push({
    key: "plots",
    label: "Every plot is Clear in your workspace",
    ok: st.plots.length > 0 && !missing.length && !notClear.length,
    detail: !st.plots.length
      ? "Add at least one plot."
      : missing.length
        ? `${missing.map((p) => p.name).join(", ")} changed or left your workspace. Remove ${missing.length === 1 ? "it" : "them"} or start a new draft.`
        : notClear.length
          ? `${notClear.map((p) => p.name).join(", ")} ${notClear.length === 1 ? "is" : "are"} no longer Clear.`
          : `${st.plots.length} plot${st.plots.length === 1 ? "" : "s"} · ${fmtHa(st.areaHa)}`,
  });

  // The geolocation exactly as it will be sent: 6 decimals, then the same checks again.
  let geo: ReadinessItem = { key: "geometry", label: "Geolocation meets the EUIS GeoJSON rules", ok: true };
  try {
    const bad = st.plots.filter((p) => {
      const c = checkGeometry(p.ring.map(([x, y]) => [round6(x), round6(y)] as [number, number]));
      return c.selfIntersection || c.zeroArea;
    });
    const bytes = Buffer.byteLength(statementGeoJson({ ...d, producerName: d.producerName || "x", producerCountry: d.producerCountry || "XX" }, st.plots));
    if (bad.length) geo = { ...geo, ok: false, detail: `${bad.map((p) => p.name).join(", ")}: invalid after rounding to 6 decimals.` };
    else if (bytes > MAX_GEO_BYTES) geo = { ...geo, ok: false, detail: `${(bytes / 1048576).toFixed(1)} MB; EUIS accepts up to 25 MB per DDS.` };
    else geo.detail = `${st.plots.length} polygon${st.plots.length === 1 ? "" : "s"}, WGS 84, 6 decimals · ${Math.max(1, Math.round(bytes / 1024))} KB of 25 MB`;
  } catch (e) {
    geo = { ...geo, ok: false, detail: (e as Error).message };
  }
  if (st.plots.length) items.push(geo);

  const activityOk = EU_CODES.has(d.countryOfActivity) && (!d.borderCrossCountry || EU_CODES.has(d.borderCrossCountry));
  items.push({
    key: "activity",
    label: "Activity and EU Member State",
    ok: activityOk,
    detail: activityOk ? `${d.activityType} · ${d.countryOfActivity}${d.borderCrossCountry && d.activityType !== "DOMESTIC" ? ` · border ${d.borderCrossCountry}` : ""}` : "Choose the EU Member State where the activity takes place.",
  });

  const hsOk = /^[0-9]{2,10}$/.test(d.hsHeading);
  const descOk = d.description.length > 0 && d.description.length <= 150;
  items.push({
    key: "product",
    label: "HS heading and description of goods",
    ok: hsOk && descOk,
    detail: !hsOk ? "Enter an HS heading of 2–10 digits." : !descOk ? "Describe the goods (up to 150 characters)." : `HS ${d.hsHeading} · ${d.description}`,
  });

  const hasNet = d.netWeightKg !== "";
  const hasSupp = d.supplementaryUnit !== "";
  let qty = "";
  if (hasNet && !positiveDecimal(d.netWeightKg)) qty = "Net mass must be a positive number in kg (up to 6 decimals).";
  else if (hasSupp && !positiveDecimal(d.supplementaryUnit)) qty = "The supplementary unit must be a positive number.";
  else if (hasSupp && !/^.{3,4}$/.test(d.supplementaryUnitQualifier)) qty = "Give the supplementary unit type (3–4 characters, e.g. MTQ).";
  else if (d.activityType !== "DOMESTIC" && !hasNet) qty = "Net mass in kg is required for import and export.";
  else if (!hasNet && !hasSupp) qty = "Give the net mass in kg or a supplementary unit.";
  items.push({
    key: "quantity",
    label: "Quantity",
    ok: !qty,
    detail: qty || [hasNet ? `${d.netWeightKg} kg net` : "", hasSupp ? `${d.supplementaryUnit} ${d.supplementaryUnitQualifier}` : ""].filter(Boolean).join(" · "),
  });

  const producerOk = d.producerName.length > 0 && /^[A-Z]{2}$/.test(d.producerCountry);
  items.push({
    key: "producer",
    label: "Producer and country of production",
    ok: producerOk,
    detail: producerOk ? `${d.producerName} · ${d.producerCountry}` : "Enter the producer name and the ISO country code (e.g. ID).",
  });

  if (isWoodHs(d.hsHeading)) {
    const ok = d.scientificName.length > 0 && d.commonName.length > 0;
    items.push({ key: "species", label: "Species (wood products)", ok, detail: ok ? `${d.scientificName} (${d.commonName})` : "Wood products need a scientific and a common name." });
  }

  if (ctx.paid) {
    items.push({ key: "quota", label: "Plan allowance", ok: true, detail: "Paid plan: no DDS area limit." });
  } else {
    const usedHa = [...ctx.used.values()].reduce((s, n) => s + n, 0);
    const fresh = st.plots.filter((p) => !ctx.used.has(p.key)).reduce((s, p) => s + p.areaHa, 0);
    const total = usedHa + fresh;
    const ok = total <= DDS_FREE_QUOTA_HA + 1e-8;
    items.push({
      key: "quota",
      label: `Free plan: up to ${DDS_FREE_QUOTA_HA} ha in DDS`,
      ok,
      detail: ok
        ? `${fmtHa(total)} of ${DDS_FREE_QUOTA_HA} ha used after this DDS.`
        : `This DDS would bring you to ${fmtHa(total)} of ${DDS_FREE_QUOTA_HA} ha. Choose a plan to submit more, or remove plots.`,
    });
  }
  return items;
}

const contextFor = (state: DdsState, workspace: Plot[] | null, paid: boolean, st: DdsStatement): ReadinessContext => ({
  identity: state.identity,
  workspace,
  paid,
  used: usedKeys(state, st.id),
});

/* --------------------------------- Details -------------------------------- */

function sanitizeDetails(input: unknown, base: DdsDetails): DdsDetails {
  const d = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const has = (k: keyof DdsDetails) => k in d;
  const str = (k: keyof DdsDetails, max: number, f: (s: string) => string = (s) => s) => (has(k) ? f(text(d[k], max)) : (base[k] as string));
  const upper = (s: string) => s.toUpperCase();
  const decimal = (s: string) => s.replace(/[\s_]/g, "").replace(/^(\d+),(\d+)$/, "$1.$2");
  return {
    activityType: ACTIVITY_TYPES.some((a) => a.value === d.activityType) ? (d.activityType as DdsDetails["activityType"]) : base.activityType,
    countryOfActivity: str("countryOfActivity", 2, upper),
    borderCrossCountry: str("borderCrossCountry", 2, upper),
    hsHeading: str("hsHeading", 10, (s) => s.replace(/\s/g, "")),
    description: str("description", 150),
    netWeightKg: str("netWeightKg", 20, decimal),
    supplementaryUnit: str("supplementaryUnit", 20, decimal),
    supplementaryUnitQualifier: str("supplementaryUnitQualifier", 4, upper),
    producerName: str("producerName", 500),
    producerCountry: str("producerCountry", 2, upper),
    scientificName: str("scientificName", 200),
    commonName: str("commonName", 200),
    geoLocationConfidential: typeof d.geoLocationConfidential === "boolean" ? d.geoLocationConfidential : base.geoLocationConfidential,
    comment: str("comment", 2000),
  };
}

/* ------------------------------- Operations -------------------------------- */

export async function ddsOverview(user: User) {
  const [state, billing] = await Promise.all([readDdsState(user.uid), billingSummary(user.uid)]);
  const statements = Object.values(state.statements)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((st) => view(st));
  return { identity: identityView(state.identity), statements, quota: quotaOf(state, billing.paid), environment: euisEndpoint().environment };
}

export async function getStatement(user: User, id: string) {
  const [state, workspace, billing] = await Promise.all([readDdsState(user.uid), loadWorkspace(user.uid), billingSummary(user.uid)]);
  const st = state.statements[id];
  if (!st) throw new DdsError("Statement not found.", 404);
  const items = st.status === "DRAFT" ? readiness(st, contextFor(state, workspace?.plots ?? null, billing.paid, st)) : undefined;
  return { statement: view(st, items), identity: identityView(state.identity), quota: quotaOf(state, billing.paid), environment: euisEndpoint().environment };
}

const MAX_PLOTS_PER_DDS = 1000;
const MAX_DRAFTS = 50;

export async function createDraft(user: User, input: { plotIds?: unknown }) {
  const ids = input.plotIds;
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_PLOTS_PER_DDS || ids.some((n) => !Number.isInteger(n))) {
    throw new DdsError(`Select 1–${MAX_PLOTS_PER_DDS} plots.`);
  }
  const workspace = await loadWorkspace(user.uid);
  if (!workspace) throw new DdsError("Your plots aren't saved yet. Open Plots, then try again.", 409);
  const byId = new Map(workspace.plots.map((p) => [p.id, p]));
  const chosen = [...new Set(ids as number[])].map((id) => byId.get(id));
  if (chosen.some((p) => !p)) throw new DdsError("Some selected plots are no longer in your workspace. Reload and try again.", 409);
  const notClear = (chosen as Plot[]).filter((p) => plotKind(p) !== "clear");
  if (notClear.length) throw new DdsError(`Only Clear plots can go into a DDS (${notClear.map((p) => p.name).join(", ")}).`, 409);

  const plots: StoredPlot[] = [];
  const seen = new Set<string>();
  for (const p of chosen as Plot[]) {
    let billed;
    try {
      billed = billedPlots([{ ring: p.ring }])[0];
    } catch (e) {
      throw new DdsError(`${p.name}: ${(e as Error).message}`, 409);
    }
    if (seen.has(billed.key)) continue; // the same boundary twice
    seen.add(billed.key);
    plots.push({ workspaceId: p.id, plotId: p.plotId, name: p.name || p.plotId, ring: p.ring, areaHa: billed.areaHa, key: billed.key });
  }

  const st = await ddsTransaction(user, (state) => {
    const drafts = Object.values(state.statements).filter((s) => s.status === "DRAFT");
    if (drafts.length >= MAX_DRAFTS) throw new DdsError(`You have ${MAX_DRAFTS} drafts. Submit or delete some first.`, 409);
    // Product and producer usually repeat between shipments: start from the last statement.
    const last = Object.values(state.statements).sort((a, b) => b.createdAt - a.createdAt)[0]?.details;
    const details: DdsDetails = last
      ? { ...EMPTY_DETAILS, ...last, description: "", netWeightKg: "", supplementaryUnit: "", supplementaryUnitQualifier: "", comment: "" }
      : { ...EMPTY_DETAILS };
    const created: DdsStatement = {
      id: randomUUID(),
      status: "DRAFT",
      environment: euisEndpoint().environment,
      createdAt: now(),
      updatedAt: now(),
      details,
      plots,
      areaHa: plots.reduce((s, p) => s + p.areaHa, 0),
      attempt: 0,
      euis: {},
      history: [],
    };
    log(created, "Draft created", `${plots.length} Clear plot${plots.length === 1 ? "" : "s"} · ${fmtHa(created.areaHa)}`);
    state.statements[created.id] = created;
    return created;
  });
  return view(st);
}

export async function updateDraft(user: User, id: string, input: { details?: unknown; removePlotIds?: unknown }) {
  await ddsTransaction(user, (state) => {
    const st = state.statements[id];
    if (!st) throw new DdsError("Statement not found.", 404);
    if (st.status !== "DRAFT") throw new DdsError("Only drafts can be edited.", 409);
    if (input.details !== undefined) st.details = sanitizeDetails(input.details, st.details);
    if (Array.isArray(input.removePlotIds) && input.removePlotIds.length) {
      const remove = new Set(input.removePlotIds.filter((n) => Number.isInteger(n)));
      const kept = st.plots.filter((p) => !remove.has(p.workspaceId));
      if (!kept.length) throw new DdsError("A DDS needs at least one plot. Delete the draft instead.", 409);
      const removed = st.plots.filter((p) => remove.has(p.workspaceId));
      st.plots = kept;
      st.areaHa = kept.reduce((s, p) => s + p.areaHa, 0);
      if (removed.length) log(st, `Removed ${removed.map((p) => p.name).join(", ")}`);
    }
    st.updatedAt = now();
  });
  return getStatement(user, id);
}

export async function deleteDraft(user: User, id: string) {
  await ddsTransaction(user, (state) => {
    const st = state.statements[id];
    if (!st) throw new DdsError("Statement not found.", 404);
    if (st.status !== "DRAFT" || st.euis.uuid) throw new DdsError("Only drafts that were never filed can be deleted.", 409);
    delete state.statements[id];
  });
  return { deleted: true };
}

/** Each attempt has its own reference, so a lost answer can be looked up in EUIS. */
function internalReference(st: DdsStatement): string {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `LCX-${ymd}-${st.id.slice(0, 8).toUpperCase()}-${st.attempt}`;
}

/**
 * Sign and submit. The statement is marked SUBMITTING before the request leaves and
 * the request is sent exactly once; it is never retried automatically. Without a clear
 * answer it becomes "check needed" and is resolved by looking its internal reference
 * up in EUIS, so a DDS can never be filed twice by accident.
 */
export async function submitStatement(user: User, id: string, input: { confirm?: unknown }) {
  if (input.confirm !== true) throw new DdsError("Confirm the declaration before signing.");
  const [workspace, billing] = await Promise.all([loadWorkspace(user.uid), billingSummary(user.uid)]);
  const endpoint = euisEndpoint();

  const prepared = await ddsTransaction(user, (state) => {
    const st = state.statements[id];
    if (!st) throw new DdsError("Statement not found.", 404);
    if (st.status !== "DRAFT") throw new DdsError("This statement has already been sent.", 409);
    const items = readiness(st, contextFor(state, workspace?.plots ?? null, billing.paid, st));
    if (items.some((i) => !i.ok)) throw new DdsError("The statement isn't ready to submit.", 409, { readiness: items });
    const cred = credentials(state.identity);
    st.attempt += 1;
    const ref = internalReference(st);
    const xml = submitDdsRequest(st.details, st.plots, ref);
    st.status = "SUBMITTING";
    st.environment = endpoint.environment;
    st.internalReference = ref;
    st.submitStartedAt = now();
    st.confirmedBy = { name: user.name, email: user.email, at: now() };
    st.lastError = undefined;
    st.updatedAt = now();
    log(st, `Signed by ${user.name} and sent to EUIS ${endpoint.environment === "mock" ? "(mock)" : "Acceptance"}`, `Internal reference ${ref}`);
    return { cred, xml, ref };
  });

  let uuid: string | undefined;
  let userMessage: string | undefined;
  let failure: unknown;
  try {
    ({ uuid, userMessage } = await submitDds(prepared.cred, prepared.xml));
  } catch (e) {
    failure = e;
  }

  await ddsTransaction(user, (state) => {
    const st = state.statements[id];
    if (!st || st.internalReference !== prepared.ref) return;
    st.updatedAt = now();
    if (uuid) {
      st.status = "SUBMITTED";
      st.euis = { uuid, status: "SUBMITTED", ...(userMessage ? { userMessage } : {}) };
      st.submittedAt = now();
      st.nextCheckAt = now() + FIRST_CHECK_MS();
      log(st, "Received by EUIS", `UUID ${uuid}`);
    } else if (failure instanceof EuisFault && failure.definite) {
      st.status = "DRAFT";
      st.lastError = describe(failure);
      st.internalReference = undefined;
      st.submitStartedAt = undefined;
      st.confirmedBy = undefined;
      log(st, "Refused by EUIS — nothing was filed", st.lastError);
    } else {
      st.status = "POSSIBLY_FILED";
      st.lastError = describe(failure);
      st.nextCheckAt = now() + RESOLVE_INTERVAL_MS();
      log(st, "No confirmation from EUIS", "Locanix won't resend it. Check EUIS to find out whether it was filed.");
    }
  });
  return getStatement(user, id);
}

function adopt(st: DdsStatement, o: DdsOverview) {
  const before = st.status;
  st.euis = {
    ...st.euis,
    uuid: o.uuid,
    referenceNumber: o.referenceNumber,
    verificationNumber: o.verificationNumber,
    referenceNumberInfo: o.referenceNumberInfo,
    status: o.status,
    rejectionReason: o.rejectionReason,
    communication: o.communicationToOperator,
    date: o.date,
    version: o.version,
  };
  if ((EUIS_STATUSES as readonly string[]).includes(o.status)) st.status = o.status as DdsStatus;
  st.lastCheckedAt = now();
  st.lastError = undefined;
  if (st.status !== before) {
    const detail =
      st.status === "AVAILABLE"
        ? `Reference ${o.referenceNumber ?? "—"} · verification ${o.verificationNumber ?? "—"}`
        : st.status === "REJECTED"
          ? o.rejectionReason
          : o.referenceNumberInfo;
    log(st, `EUIS status: ${STATUS_LABEL[st.status]}`, detail);
  }
}

const unreachable = (e: unknown) =>
  e instanceof EuisUnreachable
    ? new DdsError("EUIS isn't reachable right now. Try again later.", 502)
    : e instanceof EuisFault
      ? new DdsError(`EUIS refused the request: ${describe(e)}`, 502)
      : e;

/** Ask EUIS for the current status (or, for "check needed", whether the attempt was filed). */
export async function refreshStatement(user: User, id: string) {
  const prepared = await ddsTransaction(user, (state) => {
    const st = state.statements[id];
    if (!st) throw new DdsError("Statement not found.", 404);
    const status = effectiveStatus(st);
    if (status === "DRAFT") throw new DdsError("This statement hasn't been submitted.", 409);
    if (status === "SUBMITTING") throw new DdsError("Still sending. Wait a moment.", 409);
    if (st.nextCheckAt && now() < st.nextCheckAt) {
      throw new DdsError("EUIS was asked recently. Locanix checks again later.", 429, { nextCheckAt: st.nextCheckAt });
    }
    const cred = credentials(state.identity);
    const resolving = status === "POSSIBLY_FILED";
    // Reserve the slot first, so parallel clicks never become parallel EUIS calls.
    st.nextCheckAt = now() + (resolving ? RESOLVE_INTERVAL_MS() : CHECK_INTERVAL_MS());
    return { cred, resolving, ref: st.internalReference, uuid: st.euis.uuid };
  });

  if (prepared.resolving) {
    let found: DdsOverview[];
    try {
      found = await getDdsByInternalReference(prepared.cred, prepared.ref!);
    } catch (e) {
      throw unreachable(e);
    }
    await ddsTransaction(user, (state) => {
      const st = state.statements[id];
      if (!st || effectiveStatus(st) !== "POSSIBLY_FILED" || st.internalReference !== prepared.ref) return;
      st.updatedAt = now();
      const match = found.find((o) => o.internalReferenceNumber === prepared.ref) ?? found[0];
      if (match) {
        st.status = "SUBMITTED";
        st.submittedAt ??= st.submitStartedAt;
        log(st, "Found in EUIS — it was filed", `UUID ${match.uuid}`);
        adopt(st, match);
        st.nextCheckAt = Math.max(now() + CHECK_INTERVAL_MS(), (st.submittedAt ?? now()) + FIRST_CHECK_MS());
      } else if (now() - (st.submitStartedAt ?? 0) > RESOLVE_UNLOCK_MS()) {
        st.status = "DRAFT";
        st.lastError = "EUIS has no record of the last attempt, so nothing was filed. You can submit again.";
        st.internalReference = undefined;
        st.submitStartedAt = undefined;
        st.confirmedBy = undefined;
        st.nextCheckAt = undefined;
        log(st, "Not filed — EUIS has no record of the attempt");
      } else {
        st.lastCheckedAt = now();
        log(st, "Not found in EUIS yet", "Check again in a few minutes.");
      }
    });
    return getStatement(user, id);
  }

  let list: DdsOverview[];
  try {
    list = await getDds(prepared.cred, [prepared.uuid!]);
  } catch (e) {
    throw unreachable(e);
  }
  await ddsTransaction(user, (state) => {
    const st = state.statements[id];
    if (!st || st.euis.uuid !== prepared.uuid) return;
    st.updatedAt = now();
    const match = list.find((o) => o.uuid.toLowerCase() === prepared.uuid!.toLowerCase());
    if (match) adopt(st, match);
    else {
      st.lastCheckedAt = now();
      st.lastError = "EUIS returned no statement for this UUID.";
    }
  });
  return getStatement(user, id);
}

/** withdrawDds: EUIS allows it for an AVAILABLE statement within the 72-hour window. */
export async function withdrawStatement(user: User, id: string) {
  const prepared = await ddsTransaction(user, (state) => {
    const st = state.statements[id];
    if (!st) throw new DdsError("Statement not found.", 404);
    if (st.status !== "AVAILABLE" || !st.euis.uuid) throw new DdsError("Only an Available DDS can be withdrawn.", 409);
    return { cred: credentials(state.identity), uuid: st.euis.uuid };
  });
  let result: { uuid: string; status: string } | undefined;
  let failure: unknown;
  try {
    result = await withdrawDds(prepared.cred, prepared.uuid);
  } catch (e) {
    failure = e;
  }
  await ddsTransaction(user, (state) => {
    const st = state.statements[id];
    if (!st) return;
    st.updatedAt = now();
    if (result) {
      if ((EUIS_STATUSES as readonly string[]).includes(result.status)) st.status = result.status as DdsStatus;
      st.euis = { ...st.euis, status: result.status };
      log(st, `Withdrawal accepted by EUIS: ${STATUS_LABEL[st.status] ?? result.status}`);
    } else if (failure instanceof EuisFault) {
      log(st, "Withdrawal refused by EUIS", describe(failure));
    } else {
      st.nextCheckAt = undefined; // let the user refresh right away
      log(st, "Withdrawal sent, no confirmation from EUIS", "Refresh the status to see whether it went through.");
    }
  });
  if (failure instanceof EuisFault) throw new DdsError(`EUIS refused the withdrawal: ${describe(failure)}`, 409);
  if (failure) throw new DdsError("No confirmation from EUIS. Refresh the status to see whether the withdrawal went through.", 502);
  return getStatement(user, id);
}

/* -------------------------------- Identity -------------------------------- */

export async function getIdentity(user: User) {
  const state = await readDdsState(user.uid);
  return { identity: identityView(state.identity), environment: euisEndpoint().environment };
}

export async function saveIdentity(user: User, input: Record<string, unknown>) {
  const name = text(input.name, 100);
  const username = text(input.username, 100);
  const clientId = text(input.clientId, 100);
  const operatorAccessId = text(input.operatorAccessId, 32);
  const authKey = typeof input.authKey === "string" ? input.authKey.trim() : "";
  if (!username) throw new DdsError("Enter the web-service username.");
  if (!clientId) throw new DdsError("Enter the WebServiceClientId from the Web Services Access section of your EUDR profile.");
  if (operatorAccessId && !/^[A-Za-z0-9._-]+$/.test(operatorAccessId)) throw new DdsError("The Web Service Access Identifier has unexpected characters.");
  if (authKey.length > 500 || /\s/.test(authKey)) throw new DdsError("The authentication key looks wrong.");
  await ddsTransaction(user, (state) => {
    const prev = state.identity;
    if (!authKey && !prev) throw new DdsError("Enter the authentication key.");
    const sealed = authKey ? seal(authKey) : prev!.authKeySealed;
    const unchanged = !!prev && !authKey && prev.username === username && prev.clientId === clientId && prev.operatorAccessId === operatorAccessId;
    state.identity = {
      name: name || username,
      username,
      clientId,
      operatorAccessId,
      authKeySealed: sealed,
      updatedAt: now(),
      ...(unchanged && prev?.lastTest ? { lastTest: prev.lastTest } : {}),
    };
  });
  return getIdentity(user);
}

export async function deleteIdentity(user: User) {
  await ddsTransaction(user, (state) => {
    state.identity = null;
  });
  return { identity: null };
}

/** EudrEchoService.testEcho with the saved identity. */
export async function testIdentity(user: User) {
  const state = await readDdsState(user.uid);
  const identity = state.identity;
  const cred = credentials(identity);
  let result: { ok: boolean; message: string };
  try {
    const status = await testEcho(cred);
    result = { ok: true, message: `EUIS answered the echo test${status ? ` (“${status}”)` : ""}.` };
  } catch (e) {
    result = { ok: false, message: describe(e) };
  }
  await ddsTransaction(user, (s) => {
    if (s.identity && s.identity.updatedAt === identity!.updatedAt) s.identity.lastTest = { ...result, at: now() };
  });
  return { ...result, environment: euisEndpoint().environment };
}
