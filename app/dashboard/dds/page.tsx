"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePlotStore } from "@/lib/plotStore";
import { plotKind } from "@/lib/plotStatus";
import { STATUS_BADGE, STATUS_LABEL, type DdsView } from "@/lib/ddsShared";
import { ddsApi, environmentLabel, formatDateTime, type DdsOverviewData } from "@/lib/ddsClient";
import { ui } from "@/components/workspace/ui";

const COLS = "grid grid-cols-[1.6fr_0.9fr_0.8fr_1fr_80px] items-center gap-2.5";
const ha = (n: number) => `${n.toFixed(2)} ha`;

function title(s: DdsView) {
  return s.euis.referenceNumber ?? s.internalReference ?? "Draft";
}

export default function DdsSubmissionPage() {
  const router = useRouter();
  const { plots, workspaceLoaded, flushWorkspace } = usePlotStore();
  const [data, setData] = useState<DdsOverviewData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const load = useCallback(async () => {
    const res = await ddsApi<DdsOverviewData>("/api/dds");
    if (res.ok) {
      setData(res.data);
      setLoadError("");
    } else setLoadError(res.error.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const clear = useMemo(() => plots.filter((p) => plotKind(p) === "clear"), [plots]);
  const otherCount = plots.length - clear.length;
  const chosen = clear.filter((p) => selected.has(p.id));
  const chosenHa = chosen.reduce((s, p) => s + p.areaHa, 0);
  const allChosen = clear.length > 0 && chosen.length === clear.length;

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const create = async () => {
    setCreating(true);
    setCreateError("");
    await flushWorkspace(); // the server builds the draft from the saved workspace
    const res = await ddsApi<{ statement: DdsView }>("/api/dds", "POST", { plotIds: chosen.map((p) => p.id) });
    if (res.ok) {
      router.push(`/dashboard/dds/${res.data.statement.id}`);
      return;
    }
    setCreateError(res.error.error);
    setCreating(false);
  };

  const quota = data?.quota;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <span className={ui.eyebrow}>{data ? environmentLabel(data.environment) : "EUIS"} · TRACES</span>
          <h1 className={ui.h1}>DDS Submission</h1>
        </div>
        {quota && (
          <p className="m-0 text-[14px] text-ink-soft">
            {quota.limitHa === null ? "Paid plan: no DDS area limit" : `Free plan: ${quota.usedHa.toFixed(2)} of ${quota.limitHa} ha used in submitted DDS`}
          </p>
        )}
      </div>

      <p className="m-0 max-w-[880px] text-[14px] leading-[1.6] text-ink-soft">
        File a Due Diligence Statement with the EU Information System (EUIS) for plots that came out Clear. Locanix sends it to the
        EUIS <strong className="text-ink">Acceptance</strong> environment, the EU&apos;s test system: statements filed there have no
        legal effect.
      </p>

      {loadError && (
        <p role="alert" className="m-0 rounded-xl border border-[#F2C9C2] bg-[#FDF1EF] px-4 py-3 text-[14px] text-[#7A1F14]">
          {loadError}
        </p>
      )}

      {data && !data.identity && (
        <section aria-label="EUIS connection" className={`${ui.card} flex flex-wrap items-center justify-between gap-3 p-5`}>
          <div className="flex flex-col gap-1">
            <strong className="text-[15px]">Connect your EUIS Acceptance account</strong>
            <span className="text-[14px] text-ink-soft">Add your web-service user and authentication key in Settings before submitting.</span>
          </div>
          <Link href="/dashboard/settings#euis" className={ui.btnDark}>
            Open Settings
          </Link>
        </section>
      )}

      <section aria-label="Statements" className={`${ui.card} overflow-hidden`}>
        <div className="border-b border-line-soft px-4.5 py-3.5 text-[13px] text-muted">
          {data ? `${data.statements.length} statement${data.statements.length === 1 ? "" : "s"}` : "Loading statements…"}
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <div className={`${COLS} px-4.5 py-3 font-mono text-[11px] tracking-[0.06em] text-muted uppercase`}>
              <span>Statement</span>
              <span>Plots</span>
              <span>Status</span>
              <span>Updated</span>
              <span className="sr-only">Open</span>
            </div>
            {data?.statements.map((s) => (
              <div key={s.id} className={`${COLS} border-t border-[#F0EFEA] px-4.5 py-3.5 text-[14px]`}>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-mono text-[13px] font-semibold">{title(s)}</span>
                  <span className="truncate text-[12px] text-muted">{s.details.description || "No product details yet"}</span>
                </span>
                <span className="text-[13px]">
                  {s.plots.length} · <span className="font-mono">{ha(s.areaHa)}</span>
                </span>
                <span>
                  <span className={`${ui.badge} ${STATUS_BADGE[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                </span>
                <span className="text-[13px] text-ink-soft">{formatDateTime(s.updatedAt)}</span>
                <Link href={`/dashboard/dds/${s.id}`} aria-label={`Open statement ${title(s)}`} className="justify-self-end text-[13px] font-semibold text-ink no-underline hover:text-accent-deep">
                  Open →
                </Link>
              </div>
            ))}
            {data && !data.statements.length && (
              <p className="m-0 border-t border-[#F0EFEA] px-4.5 py-8 text-center text-[14px] text-muted">No statements yet. Start one from your Clear plots below.</p>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="new-dds" className={`${ui.card} flex flex-col gap-4 p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="new-dds" className="m-0 font-display text-[20px] font-semibold">
            New DDS from Clear plots
          </h2>
          {otherCount > 0 && (
            <span className="text-[13px] text-muted">
              {otherCount} plot{otherCount === 1 ? " isn’t" : "s aren’t"} Clear and can’t be included.
            </span>
          )}
        </div>

        {!workspaceLoaded && !plots.length ? (
          <p role="status" className="m-0 text-[14px] text-muted">
            Loading your plots…
          </p>
        ) : !clear.length ? (
          <p className="m-0 text-[14px] text-ink-soft">
            No Clear plots yet. <Link href="/dashboard" className="font-semibold text-ink">Run the EUDR analysis</Link> on your plots first; only plots without
            forest loss or protected-area overlap can go into a DDS.
          </p>
        ) : (
          <>
            <label className="flex items-center gap-2.5 text-[14px] font-semibold">
              <input
                type="checkbox"
                checked={allChosen}
                onChange={() => setSelected(allChosen ? new Set() : new Set(clear.map((p) => p.id)))}
                className="h-4 w-4 accent-[#0D0F0E]"
              />
              Select all Clear plots
            </label>
            <ul className="m-0 grid list-none gap-1.5 p-0 sm:grid-cols-2">
              {clear.map((p, i) => (
                <li key={p.id}>
                  <label className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2.5 text-[14px] hover:border-ink">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-[#0D0F0E]" />
                    <span className="min-w-0 flex-1 truncate">{p.name || `Plot ${i + 1}`}</span>
                    <span className="font-mono text-[12px] text-muted">{ha(p.areaHa)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={!chosen.length || creating} onClick={create} className={ui.btnDark}>
                {creating ? "Creating…" : "Create draft"}
              </button>
              <span className="text-[13px] text-muted">
                {chosen.length} selected · {ha(chosenHa)}
              </span>
              {createError && (
                <span role="alert" className="text-[14px] text-red-700">
                  {createError}
                </span>
              )}
            </div>
          </>
        )}
      </section>
    </>
  );
}
