"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, FileCheck2, X } from "lucide-react";
import type { Plot } from "@/lib/geo";
import { EMPTY_DDS_DETAILS, buildDds, type DdsDetails } from "@/lib/dds";

const STORAGE_KEY = "locanix.dds.details";

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-slate-400 focus:border-ink";

function loadDetails(): DdsDetails {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...EMPTY_DDS_DETAILS, ...(JSON.parse(raw) as Partial<DdsDetails>) };
  } catch {
    /* storage unavailable */
  }
  return EMPTY_DDS_DETAILS;
}

/**
 * Collects the operator and product details a Due Diligence Statement needs
 * (the screening results come from the plots), then downloads the PDF.
 */
export default function DdsModal({
  open,
  onClose,
  plots,
}: {
  open: boolean;
  onClose: () => void;
  plots: Plot[];
}) {
  const [details, setDetails] = useState<DdsDetails>(EMPTY_DDS_DETAILS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDetails(loadDetails());
      setError("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const preview = useMemo(() => buildDds(plots, details), [plots, details]);

  if (!open) return null;

  const set = <K extends keyof DdsDetails>(key: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setDetails((d) => ({ ...d, [key]: e.target.value as DdsDetails[K] }));

  const download = async () => {
    setBusy(true);
    setError("");
    try {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(details));
      } catch {
        /* storage unavailable */
      }
      const { downloadDdsPdf } = await import("@/lib/ddsPdf"); // lazy — keep react-pdf out of the page bundle
      await downloadDdsPdf(buildDds(plots, details));
      onClose();
    } catch (e) {
      console.error("[dds]", e);
      setError("We couldn't create the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const { counts } = preview;
  const missing = preview.checklist.filter((c) => !c.done && !c.optional);

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dds-title"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <FileCheck2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="dds-title" className="text-lg font-bold text-slate-900">
                Due Diligence Statement
              </h2>
              <p className="text-xs text-slate-500">Regulation (EU) 2023/1115 — export as PDF</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-6 py-5">
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p>
              <strong className="text-slate-900">{plots.length}</strong> plot{plots.length === 1 ? "" : "s"} included:{" "}
              <span className="font-semibold text-emerald-700">{counts.passed} passed</span>
              {counts.review > 0 && <>, <span className="font-semibold text-amber-600">{counts.review} need review</span></>}
              {counts.pending > 0 && <>, <span className="font-semibold text-slate-500">{counts.pending} not screened</span></>}.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {preview.ready
                ? "All mandatory items are complete — the statement will be marked Ready for TRACES."
                : `The PDF will be marked as a draft until these are complete: ${missing.map((m) => m.label).join("; ")}.`}
            </p>
          </div>

          <fieldset>
            <legend className="text-sm font-bold text-ink">Operator</legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Legal name" required>
                <input className={inputCls} value={details.legalName} onChange={set("legalName")} placeholder="PT Kopi Nusantara" />
              </Field>
              <Field label="Country">
                <input className={inputCls} value={details.operatorCountry} onChange={set("operatorCountry")} placeholder="ID" />
              </Field>
              <Field label="VAT / Tax ID" required hint="VAT or EORI">
                <input className={inputCls} value={details.vat} onChange={set("vat")} />
              </Field>
              <Field label="EORI number">
                <input className={inputCls} value={details.eori} onChange={set("eori")} />
              </Field>
              <Field label="Operator type">
                <select className={inputCls} value={details.operatorType} onChange={set("operatorType")}>
                  <option value="operator">Operator</option>
                  <option value="trader">Trader</option>
                </select>
              </Field>
              <Field label="Size">
                <select className={inputCls} value={details.size} onChange={set("size")}>
                  <option value="micro">Micro</option>
                  <option value="small">Small</option>
                  <option value="medium">Medium</option>
                  <option value="large">Large</option>
                </select>
              </Field>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-bold text-ink">Product</legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field label="Product" required>
                <input className={inputCls} value={details.product} onChange={set("product")} placeholder="Coffee (green bean, washed)" />
              </Field>
              <Field label="HS code" required>
                <input className={inputCls} value={details.hsCode} onChange={set("hsCode")} placeholder="0901.11" />
              </Field>
              <Field label="Quantity (kg)" required>
                <input className={inputCls} type="number" min="0" inputMode="decimal" value={details.quantityKg} onChange={set("quantityKg")} />
              </Field>
              <Field label="Country of production" required>
                <input className={inputCls} value={details.productionCountry} onChange={set("productionCountry")} />
              </Field>
              <Field label="Country risk (EU benchmarking)">
                <select className={inputCls} value={details.countryRisk} onChange={set("countryRisk")}>
                  <option value="low">Low</option>
                  <option value="standard">Standard</option>
                  <option value="high">High</option>
                </select>
              </Field>
              <Field label="Suppliers">
                <input className={inputCls} value={details.suppliers} onChange={set("suppliers")} placeholder="Cooperative or supplier name" />
              </Field>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-bold text-ink">Risk & submission</legend>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field
                label="Risk mitigation measures"
                required={!preview.negligibleRisk}
                hint={preview.negligibleRisk ? "Optional" : "Needed because some plots need review"}
                full
              >
                <textarea
                  className={`${inputCls} min-h-[72px]`}
                  value={details.riskNotes}
                  onChange={set("riskNotes")}
                  placeholder="e.g. Field verification scheduled for P3; plot excluded from this shipment until cleared."
                />
              </Field>
              <Field label="Authorised representative">
                <input className={inputCls} value={details.representative} onChange={set("representative")} placeholder="Full name" />
              </Field>
              <Field label="EU Information System reference" hint="Optional">
                <input className={inputCls} value={details.euReference} onChange={set("euReference")} />
              </Field>
            </div>
          </fieldset>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={download}
            disabled={busy || plots.length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink-mid disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            {busy ? "Generating PDF…" : preview.ready ? "Download PDF" : "Download draft PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  full,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500">*</span>}
        {hint && <span className="ml-1.5 text-xs font-normal text-slate-400">{hint}</span>}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
