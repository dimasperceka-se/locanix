"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { usePlotStore } from "@/lib/plotStore";
import {
  ACTIVITY_TYPES,
  COMMODITY_PRESETS,
  EU_COUNTRIES,
  STATUS_BADGE,
  STATUS_LABEL,
  isWoodHs,
  type DdsDetails,
  type DdsView,
  type ReadinessItem,
} from "@/lib/ddsShared";
import { ddsApi, environmentLabel, formatDateTime, inMinutes, type DdsStatementData } from "@/lib/ddsClient";
import { ui } from "@/components/workspace/ui";

const ha = (n: number) => `${n.toFixed(2)} ha`;
const card = `${ui.card} flex flex-col gap-4 p-5`;
const h2 = "m-0 font-display text-[19px] font-semibold";
const field = "flex flex-col gap-1.5 text-[13px] font-semibold text-ink";
const input =
  "min-h-11 w-full min-w-0 rounded-xl border border-line-strong bg-white px-3 text-[14px] font-normal text-ink outline-none focus:border-ink disabled:bg-paper-warm";
const hint = "text-[12px] font-normal text-muted";

/** Annex II of Regulation (EU) 2023/1115: the operator's confirmation in every DDS. */
const DECLARATION =
  "By submitting this due diligence statement the operator confirms that due diligence in accordance with Regulation (EU) 2023/1115 was carried out and that no or only a negligible risk was found that the relevant products do not comply with Article 3, point (a) or (b), of that Regulation.";

type Busy = "" | "save" | "submit" | "refresh" | "withdraw" | "delete" | "remove";

export default function DdsDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { userName, userEmail } = usePlotStore();
  const [data, setData] = useState<DdsStatementData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState<DdsDetails | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<Busy>("");
  const [notice, setNotice] = useState<{ tone: "error" | "ok"; text: string } | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  const apply = useCallback((next: DdsStatementData) => {
    setData(next);
    if (!dirtyRef.current) setForm(next.statement.details);
  }, []);

  const load = useCallback(async () => {
    const res = await ddsApi<DdsStatementData>(`/api/dds/${id}`);
    if (res.ok) apply(res.data);
    else if (res.status === 404) setNotFound(true);
    else setNotice({ tone: "error", text: res.error.error });
  }, [id, apply]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const st = data?.statement;
  const status = st?.status;

  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setBusy("refresh");
      const res = await ddsApi<DdsStatementData>(`/api/dds/${id}/refresh`, "POST");
      if (res.ok) {
        apply(res.data);
        setNotice(null);
      } else if (!silent) setNotice({ tone: "error", text: res.error.error });
      if (!silent) setBusy("");
      setNow(Date.now());
    },
    [id, apply],
  );

  // Status follow-up while the page is open, never sooner than the server allows
  // (EUIS asks for at least an hour before the first status check).
  useEffect(() => {
    if (!st) return;
    if (status === "SUBMITTING") {
      const t = setTimeout(() => void load(), 5000);
      return () => clearTimeout(t);
    }
    if ((status === "SUBMITTED" || status === "POSSIBLY_FILED") && st.nextCheckAt) {
      const wait = Math.max(0, st.nextCheckAt - Date.now()) + 1500;
      if (wait > 2 ** 31 - 1) return;
      const t = setTimeout(() => {
        if (document.visibilityState === "visible") void refresh(true);
      }, wait);
      return () => clearTimeout(t);
    }
  }, [st, status, load, refresh]);

  if (notFound) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className={ui.h1}>Statement not found</h1>
        <Link href="/dashboard/dds" className="text-[14px] font-semibold text-ink">
          ← Back to DDS Submission
        </Link>
      </div>
    );
  }
  if (!data || !st || !form) {
    return (
      <p role="status" className="m-0 text-[14px] text-muted">
        Loading statement…
      </p>
    );
  }

  const draft = st.status === "DRAFT";
  const readiness = st.readiness ?? [];
  const ready = draft && readiness.length > 0 && readiness.every((r) => r.ok);

  const set = <K extends keyof DdsDetails>(key: K, value: DdsDetails[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
    setDirty(true);
    setNotice(null);
  };

  const save = async (): Promise<boolean> => {
    setBusy("save");
    const res = await ddsApi<DdsStatementData>(`/api/dds/${id}`, "PATCH", { details: form });
    setBusy("");
    if (!res.ok) {
      setNotice({ tone: "error", text: res.error.error });
      return false;
    }
    setDirty(false);
    dirtyRef.current = false;
    setData(res.data);
    setForm(res.data.statement.details);
    setNotice({ tone: "ok", text: "Draft saved." });
    return true;
  };

  const openReview = async () => {
    if (dirty && !(await save())) return;
    setConfirmed(false);
    setReviewing(true);
  };

  const submit = async () => {
    setBusy("submit");
    const res = await ddsApi<DdsStatementData>(`/api/dds/${id}/submit`, "POST", { confirm: true });
    setBusy("");
    setReviewing(false);
    if (res.ok) {
      apply(res.data);
      const s = res.data.statement.status;
      setNotice(
        s === "SUBMITTED"
          ? { tone: "ok", text: "EUIS received the statement." }
          : s === "DRAFT"
            ? { tone: "error", text: "EUIS refused the statement. Nothing was filed; see the reason below." }
            : null,
      );
    } else {
      if (res.error.readiness && data) setData({ ...data, statement: { ...data.statement, readiness: res.error.readiness } });
      setNotice({ tone: "error", text: res.error.error });
      void load();
    }
  };

  const withdraw = async () => {
    if (!window.confirm("Withdraw this DDS in EUIS? This can't be undone.")) return;
    setBusy("withdraw");
    const res = await ddsApi<DdsStatementData>(`/api/dds/${id}/withdraw`, "POST");
    setBusy("");
    if (res.ok) {
      apply(res.data);
      setNotice({ tone: "ok", text: "The statement was withdrawn in EUIS." });
    } else {
      setNotice({ tone: "error", text: res.error.error });
      void load();
    }
  };

  const remove = async () => {
    if (!window.confirm("Delete this draft?")) return;
    setBusy("delete");
    const res = await ddsApi(`/api/dds/${id}`, "DELETE");
    if (res.ok) router.push("/dashboard/dds");
    else {
      setBusy("");
      setNotice({ tone: "error", text: res.error.error });
    }
  };

  const removePlot = async (workspaceId: number) => {
    setBusy("remove");
    const res = await ddsApi<DdsStatementData>(`/api/dds/${id}`, "PATCH", { removePlotIds: [workspaceId] });
    setBusy("");
    if (res.ok) apply(res.data);
    else setNotice({ tone: "error", text: res.error.error });
  };

  const title = st.euis.referenceNumber ?? st.internalReference ?? "Draft statement";
  const canCheck = !st.nextCheckAt || st.nextCheckAt <= now;
  const preset = COMMODITY_PRESETS.find((c) => c.hs === form.hsHeading)?.hs ?? (form.hsHeading ? "other" : "");

  return (
    <>
      <div className="flex flex-col gap-3">
        <Link href="/dashboard/dds" className="text-[13px] font-semibold text-ink-soft no-underline hover:text-ink">
          ← DDS Submission
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className={ui.eyebrow}>Due Diligence Statement · {environmentLabel(st.status === "DRAFT" ? data.environment : st.environment)}</span>
            <h1 className={`${ui.h1} ${st.euis.referenceNumber || st.internalReference ? "font-mono !text-[28px]" : ""}`}>{title}</h1>
          </div>
          <span className={`${ui.badge} ${STATUS_BADGE[st.status]} !text-[13px]`} data-testid="dds-status">
            {STATUS_LABEL[st.status]}
          </span>
        </div>
      </div>

      {notice && (
        <p
          role={notice.tone === "error" ? "alert" : "status"}
          className={`m-0 max-w-[1100px] rounded-xl border px-4 py-3 text-[14px] ${
            notice.tone === "error" ? "border-[#F2C9C2] bg-[#FDF1EF] text-[#7A1F14]" : "border-[#BFE3CD] bg-clear-bg text-clear-ink"
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="grid max-w-[1100px] items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {st.status === "POSSIBLY_FILED" && (
            <section aria-label="Check needed" className="flex flex-col gap-3 rounded-2xl border border-[#F1C9A5] bg-review-bg p-5 text-review-ink">
              <strong className="text-[15px]">EUIS didn&apos;t confirm whether it received this statement</strong>
              <p className="m-0 text-[14px] leading-[1.6]">
                Locanix won&apos;t send it again, so it can never be filed twice. Check EUIS: if it has the statement, Locanix follows it from there; if EUIS
                has no record of it after ten minutes, the draft unlocks and you can submit again.
              </p>
              {st.lastError && <p className="m-0 font-mono text-[12px]">{st.lastError}</p>}
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => refresh()} disabled={busy !== "" || !canCheck} className={ui.btnDark}>
                  {busy === "refresh" ? "Checking…" : "Check EUIS"}
                </button>
                {!canCheck && <span className="text-[13px]">Next check {inMinutes(st.nextCheckAt, now)}</span>}
              </div>
            </section>
          )}

          {draft && st.lastError && (
            <section aria-label="Last attempt" className="flex flex-col gap-2 rounded-2xl border border-[#F2C9C2] bg-[#FDF1EF] p-5 text-[#7A1F14]">
              <strong className="text-[15px]">The last attempt was not filed</strong>
              <p className="m-0 text-[14px] leading-[1.6]">{st.lastError}</p>
            </section>
          )}

          {!draft && st.status !== "POSSIBLY_FILED" && <EuisStatus st={st} now={now} busy={busy} canCheck={canCheck} onRefresh={() => refresh()} onWithdraw={withdraw} />}

          <section aria-labelledby="details-h" className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="details-h" className={h2}>
                Statement details
              </h2>
              {draft && <span className={hint}>Operator role: Operator</span>}
            </div>
            {draft ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={field}>
                  Activity
                  <select className={input} value={form.activityType} onChange={(e) => set("activityType", e.target.value as DdsDetails["activityType"])}>
                    {ACTIVITY_TYPES.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                  <span className={hint}>Operators outside the EU can only import. Import and export need an EORI in your EUIS profile.</span>
                </label>
                <label className={field}>
                  Country of activity
                  <select className={input} value={form.countryOfActivity} onChange={(e) => set("countryOfActivity", e.target.value)}>
                    <option value="">Choose an EU Member State</option>
                    {EU_COUNTRIES.map(([c, n]) => (
                      <option key={c} value={c}>
                        {n} ({c})
                      </option>
                    ))}
                  </select>
                </label>
                {form.activityType !== "DOMESTIC" && (
                  <label className={field}>
                    Border crossing country <span className={hint}>(optional)</span>
                    <select className={input} value={form.borderCrossCountry} onChange={(e) => set("borderCrossCountry", e.target.value)}>
                      <option value="">—</option>
                      {EU_COUNTRIES.map(([c, n]) => (
                        <option key={c} value={c}>
                          {n} ({c})
                        </option>
                      ))}
                    </select>
                    <span className={hint}>Country of entry (import) or exit (export).</span>
                  </label>
                )}
                <label className={field}>
                  Commodity
                  <select
                    className={input}
                    value={preset}
                    onChange={(e) => {
                      if (e.target.value !== "other") set("hsHeading", e.target.value);
                      else if (preset !== "other") set("hsHeading", "");
                    }}
                  >
                    <option value="">Choose a commodity</option>
                    {COMMODITY_PRESETS.map((c) => (
                      <option key={c.hs} value={c.hs}>
                        {c.label} — HS {c.hs}
                      </option>
                    ))}
                    <option value="other">Other HS heading…</option>
                  </select>
                </label>
                <label className={field}>
                  HS heading
                  <input className={input} inputMode="numeric" maxLength={10} value={form.hsHeading} onChange={(e) => set("hsHeading", e.target.value.replace(/\D/g, ""))} />
                  <span className={hint}>2–10 digits.</span>
                </label>
                <label className={`${field} sm:col-span-2`}>
                  Description of goods
                  <input className={input} maxLength={150} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Green arabica coffee beans" />
                </label>
                <label className={field}>
                  Net mass (kg)
                  <input className={input} inputMode="decimal" value={form.netWeightKg} onChange={(e) => set("netWeightKg", e.target.value)} />
                  <span className={hint}>Required for import and export.</span>
                </label>
                <div className="grid grid-cols-[1fr_96px] gap-2">
                  <label className={field}>
                    Supplementary unit <span className={hint}>(optional)</span>
                    <input className={input} inputMode="decimal" value={form.supplementaryUnit} onChange={(e) => set("supplementaryUnit", e.target.value)} />
                  </label>
                  <label className={field}>
                    Unit type
                    <input className={input} maxLength={4} value={form.supplementaryUnitQualifier} onChange={(e) => set("supplementaryUnitQualifier", e.target.value.toUpperCase())} placeholder="MTQ" />
                  </label>
                </div>
                <label className={field}>
                  Producer name
                  <input className={input} maxLength={500} value={form.producerName} onChange={(e) => set("producerName", e.target.value)} />
                </label>
                <label className={field}>
                  Country of production
                  <input className={input} maxLength={2} value={form.producerCountry} onChange={(e) => set("producerCountry", e.target.value.toUpperCase().replace(/[^A-Z]/g, ""))} placeholder="ID" />
                  <span className={hint}>ISO 3166-1 alpha-2 code.</span>
                </label>
                {isWoodHs(form.hsHeading) && (
                  <>
                    <label className={field}>
                      Scientific name
                      <input className={input} maxLength={200} value={form.scientificName} onChange={(e) => set("scientificName", e.target.value)} />
                    </label>
                    <label className={field}>
                      Common name
                      <input className={input} maxLength={200} value={form.commonName} onChange={(e) => set("commonName", e.target.value)} />
                    </label>
                  </>
                )}
                <label className="flex items-start gap-2.5 text-[14px] sm:col-span-2">
                  <input type="checkbox" checked={form.geoLocationConfidential} onChange={(e) => set("geoLocationConfidential", e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#0D0F0E]" />
                  <span>
                    Keep the geolocation confidential
                    <span className={`${hint} block`}>When ticked, EUIS doesn&apos;t share the plot coordinates with downstream operators and traders.</span>
                  </span>
                </label>
                <label className={`${field} sm:col-span-2`}>
                  Comment for the competent authority <span className={hint}>(optional)</span>
                  <textarea className={`${input} min-h-20 py-2`} maxLength={2000} value={form.comment} onChange={(e) => set("comment", e.target.value)} />
                </label>
                <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                  <button type="button" onClick={save} disabled={!dirty || busy !== ""} className={ui.btnOutline}>
                    {busy === "save" ? "Saving…" : dirty ? "Save draft" : "Saved"}
                  </button>
                </div>
              </div>
            ) : (
              <DetailsList d={st.details} />
            )}
          </section>

          <section aria-labelledby="plots-h" className={card}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="plots-h" className={h2}>
                Plots
              </h2>
              <span className="text-[13px] text-muted">
                {st.plots.length} · {ha(st.areaHa)}
              </span>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {st.plots.map((p) => (
                <li key={p.workspaceId} className="flex items-center gap-3 border-t border-[#F0EFEA] py-2.5 text-[14px] first:border-t-0">
                  <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                  <span className="font-mono text-[12px] text-muted">{ha(p.areaHa)}</span>
                  {draft && st.plots.length > 1 && (
                    <button type="button" onClick={() => removePlot(p.workspaceId)} disabled={busy !== ""} aria-label={`Remove ${p.name}`} className="text-[13px] font-semibold text-ink-soft hover:text-ink">
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <Timeline st={st} />
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">
          {draft && (
            <section aria-labelledby="ready-h" className={card}>
              <h2 id="ready-h" className={h2}>
                Ready to submit?
              </h2>
              <Readiness items={readiness} />
              {dirty && <p className="m-0 text-[13px] text-muted">Unsaved changes are saved when you continue.</p>}
              <button type="button" onClick={openReview} disabled={busy !== "" || (!ready && !dirty)} className={ui.btnDark}>
                Review &amp; submit
              </button>
              <button type="button" onClick={remove} disabled={busy !== ""} className="self-start text-[13px] font-semibold text-ink-soft hover:text-[#7A1F14]">
                Delete draft
              </button>
            </section>
          )}
          {!draft && st.confirmedBy && (
            <section aria-label="Signature" className={card}>
              <h2 className={h2}>Signed</h2>
              <p className="m-0 text-[14px] leading-[1.6] text-ink-soft">
                {st.confirmedBy.name} ({st.confirmedBy.email}) confirmed the declaration on {formatDateTime(st.confirmedBy.at)}.
              </p>
            </section>
          )}
        </aside>
      </div>

      {reviewing && (
        <Review
          st={st}
          environment={data.environment}
          signer={`${userName} (${userEmail})`}
          readiness={readiness}
          confirmed={confirmed}
          setConfirmed={setConfirmed}
          busy={busy === "submit"}
          onCancel={() => setReviewing(false)}
          onSubmit={submit}
        />
      )}
    </>
  );
}

function Readiness({ items }: { items: ReadinessItem[] }) {
  return (
    <ul aria-label="Readiness checklist" className="m-0 flex list-none flex-col gap-2.5 p-0">
      {items.map((r) => (
        <li key={r.key} className="flex items-start gap-2.5 text-[14px]" data-ok={r.ok}>
          <span
            aria-hidden="true"
            className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[12px] font-bold ${r.ok ? "bg-clear-bg text-clear-ink" : "bg-review-bg text-review-ink"}`}
          >
            {r.ok ? "✓" : "!"}
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="font-semibold">
              {r.label}
              <span className="sr-only">{r.ok ? " — ready" : " — needs attention"}</span>
            </span>
            {r.detail && <span className="text-[13px] break-words text-ink-soft">{r.detail}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}

function DetailsList({ d }: { d: DdsDetails }) {
  const rows: [string, string][] = [
    ["Activity", d.activityType],
    ["Country of activity", d.countryOfActivity],
    ...(d.borderCrossCountry && d.activityType !== "DOMESTIC" ? ([["Border crossing", d.borderCrossCountry]] as [string, string][]) : []),
    ["HS heading", d.hsHeading],
    ["Description", d.description],
    ["Net mass", d.netWeightKg ? `${d.netWeightKg} kg` : "—"],
    ...(d.supplementaryUnit ? ([["Supplementary unit", `${d.supplementaryUnit} ${d.supplementaryUnitQualifier}`]] as [string, string][]) : []),
    ["Producer", `${d.producerName} · ${d.producerCountry}`],
    ...(isWoodHs(d.hsHeading) ? ([["Species", `${d.scientificName} (${d.commonName})`]] as [string, string][]) : []),
    ["Geolocation", d.geoLocationConfidential ? "Confidential" : "Shared downstream"],
    ...(d.comment ? ([["Comment", d.comment]] as [string, string][]) : []),
  ];
  return (
    <dl className="m-0 grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-[12px] text-muted">{k}</dt>
          <dd className="m-0 text-[14px] font-semibold break-words">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function EuisStatus({ st, now, busy, canCheck, onRefresh, onWithdraw }: { st: DdsView; now: number; busy: Busy; canCheck: boolean; onRefresh: () => void; onWithdraw: () => void }) {
  const e = st.euis;
  const rows: [string, string | undefined, boolean?][] = [
    ["Reference number", e.referenceNumber, true],
    ["Verification number", e.verificationNumber, true],
    ["Reference status", e.referenceNumberInfo],
    ["EUIS UUID", e.uuid, true],
    ["Internal reference", st.internalReference, true],
    ["Submitted", formatDateTime(st.submittedAt)],
    ["Last checked", formatDateTime(st.lastCheckedAt)],
  ];
  return (
    <section aria-labelledby="euis-h" className={card}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="euis-h" className={h2}>
          EUIS status
        </h2>
        <span className="text-[13px] text-muted">{environmentLabel(st.environment)}</span>
      </div>
      {st.status === "SUBMITTED" && (
        <p className="m-0 text-[14px] leading-[1.6] text-ink-soft">
          EUIS assigns the reference and verification numbers after its risk analysis. The EU asks systems to wait at least an hour after submitting
          before checking; Locanix checks {st.nextCheckAt && st.nextCheckAt > now ? inMinutes(st.nextCheckAt, now) : "now"} while this page is open.
        </p>
      )}
      <dl className="m-0 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v, mono]) => (
          <div key={k} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-[12px] text-muted">{k}</dt>
            <dd className={`m-0 text-[14px] font-semibold break-all ${mono ? "font-mono" : ""}`}>{v || "—"}</dd>
          </div>
        ))}
      </dl>
      {e.rejectionReason && (
        <p className="m-0 rounded-xl bg-[#FDF1EF] px-4 py-3 text-[14px] text-[#7A1F14]">
          <strong>Rejection reason:</strong> {e.rejectionReason}
        </p>
      )}
      {e.communication?.content && (
        <p className="m-0 rounded-xl bg-paper-warm px-4 py-3 text-[14px]">
          <strong>From the competent authority{e.communication.date ? ` (${formatDateTime(Date.parse(e.communication.date))})` : ""}:</strong> {e.communication.content}
        </p>
      )}
      {e.userMessage && <p className="m-0 rounded-xl bg-paper-warm px-4 py-3 text-[13px] text-ink-soft">EUIS notice: {e.userMessage}</p>}
      {st.lastError && <p className="m-0 text-[13px] text-[#7A1F14]">{st.lastError}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onRefresh} disabled={busy !== "" || !canCheck} className={ui.btnOutline}>
          {busy === "refresh" ? "Checking…" : "Refresh status"}
        </button>
        {!canCheck && <span className="text-[13px] text-muted">Next check {inMinutes(st.nextCheckAt, now)}</span>}
        {st.status === "AVAILABLE" && (
          <button type="button" onClick={onWithdraw} disabled={busy !== ""} className="ml-auto text-[13px] font-semibold text-[#7A1F14] hover:underline">
            {busy === "withdraw" ? "Withdrawing…" : "Withdraw DDS"}
          </button>
        )}
      </div>
      {st.status === "AVAILABLE" && <p className="m-0 text-[12px] text-muted">EUIS allows a withdrawal within 72 hours of the statement becoming available.</p>}
    </section>
  );
}

function Timeline({ st }: { st: DdsView }) {
  return (
    <section aria-labelledby="timeline-h" className={card}>
      <h2 id="timeline-h" className={h2}>
        Timeline
      </h2>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {[...st.history].reverse().map((h, i) => (
          <li key={`${h.at}-${i}`} className="grid grid-cols-[10px_1fr] gap-3 text-[14px]">
            <span aria-hidden="true" className={`mt-1.5 h-2.5 w-2.5 rounded-full ${i === 0 ? "bg-ink" : "bg-line-strong"}`} />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-semibold">{h.event}</span>
              {h.detail && <span className="text-[13px] break-words text-ink-soft">{h.detail}</span>}
              <span className="text-[12px] text-muted">{formatDateTime(h.at)}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Review(props: {
  st: DdsView;
  environment: "acceptance" | "mock";
  signer: string;
  readiness: ReadinessItem[];
  confirmed: boolean;
  setConfirmed: (v: boolean) => void;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const { st, environment, signer, readiness, confirmed, setConfirmed, busy, onCancel, onSubmit } = props;
  const ready = readiness.length > 0 && readiness.every((r) => r.ok);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-[#0D0F0E]/55 p-4" role="dialog" aria-modal="true" aria-labelledby="review-title">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-col gap-1 border-b border-line-soft px-6 py-5">
          <span className={ui.eyebrow}>{environmentLabel(environment)}</span>
          <h2 id="review-title" className="m-0 font-display text-[22px] font-semibold">
            Review and sign
          </h2>
        </div>
        <div className="flex flex-col gap-4 overflow-y-auto px-6 py-5">
          <p className="m-0 rounded-xl bg-[#E4EEF9] px-4 py-3 text-[14px] text-[#1D3F66]">
            {environment === "mock"
              ? "This goes to the mock EUIS used for local testing. Nothing reaches the EU."
              : "This goes to the EUIS Acceptance environment, the EU’s test system. It has no legal effect."}
          </p>
          <DetailsList d={st.details} />
          <p className="m-0 text-[14px]">
            <strong>{st.plots.length}</strong> Clear plot{st.plots.length === 1 ? "" : "s"} · <span className="font-mono">{ha(st.areaHa)}</span>, sent as GeoJSON polygons (WGS 84, 6 decimals).
          </p>
          {!ready && (
            <div className="flex flex-col gap-2">
              <strong className="text-[14px] text-review-ink">Fix these first:</strong>
              <Readiness items={readiness.filter((r) => !r.ok)} />
            </div>
          )}
          <label className="flex items-start gap-3 rounded-xl border border-line p-4 text-[14px] leading-[1.6]">
            <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={!ready} className="mt-1 h-4 w-4 flex-none accent-[#0D0F0E]" />
            <span>{DECLARATION}</span>
          </label>
          <p className="m-0 text-[13px] text-muted">Signed by {signer}. Locanix sends the statement once and never resends it on its own.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2.5 border-t border-line-soft px-6 py-4">
          <button type="button" onClick={onCancel} disabled={busy} className={ui.btnOutline}>
            Back
          </button>
          <button type="button" onClick={onSubmit} disabled={!ready || !confirmed || busy} className={ui.btnDark}>
            {busy ? "Submitting…" : "Confirm & sign"}
          </button>
        </div>
      </div>
    </div>
  );
}
