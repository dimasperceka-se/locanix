"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, Leaf, Lock, Shapes } from "lucide-react";
import { eudrAnalyses, type AnalysisKey } from "@/lib/data";
import { usePlotStore } from "@/lib/plotStore";
import type { FeatureCollection } from "@/lib/geo";
import { validateGeometry } from "@/lib/analysisClient";
import { persistPlots } from "@/lib/plotsClient";
import { authorize } from "@/lib/usageClient";
import AddPlotModal from "./AddPlotModal";
import AnalyzingOverlay from "./AnalyzingOverlay";
import { useConsentGate } from "./ConsentGate";
import Popup from "./Popup";
import { FREE_QUOTA_HA } from "@/lib/quota";

const DEFAULT_SELECTED = eudrAnalyses.map((a) => a.key);

type Outcome = "fail" | "dashboard" | "survey" | "report" | "payment";

export default function AnalysisTypes({ authed = false }: { authed?: boolean }) {
  const router = useRouter();
  const { setPlots, setAnalyses, setIsBulk } = usePlotStore();
  const [selected, setSelected] = useState<AnalysisKey[]>(DEFAULT_SELECTED);
  const [modalOpen, setModalOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeDone, setAnalyzeDone] = useState(false);
  const [geoFailed, setGeoFailed] = useState(false);
  const [paymentNeeded, setPaymentNeeded] = useState(false);
  const outcomeRef = useRef<Outcome>("fail");
  const { ensureConsent, consentModal } = useConsentGate();

  const toggle = (key: AnalysisKey) =>
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  const selectedInOrder = useMemo(
    () => eudrAnalyses.filter((a) => selected.includes(a.key)).map((a) => a.title),
    [selected],
  );

  // Login gate: must be signed in to run a compliance check.
  const onRunClick = async () => {
    if (!authed) router.push("/login?next=/analyze");
    // Ask for the data-use consent (once per account) before any plot is sent.
    else if (await ensureConsent()) setModalOpen(true);
  };

  const handleAnalyze = async (fc: FeatureCollection, filename: string) => {
    setAnalyses(selected);
    setModalOpen(false);
    setAnalyzeDone(false);
    setAnalyzing(true);
    try {
      const plots = await validateGeometry(fc, filename);
      if (plots.length === 0) {
        outcomeRef.current = "fail";
        return;
      }
      setPlots(plots);
      // Persist every uploaded plot to the database (best-effort).
      void persistPlots(plots, "upload");

      // Invalid plots (duplicate vertices, self-intersection, …) are kept but
      // never analyzed. Only valid plots count toward area, quota and survey.
      const validPlots = plots.filter((p) => p.isValid);
      setIsBulk(validPlots.length > 1);

      if (validPlots.length === 0) {
        // Nothing analyzable — the dashboard lists each plot's geometry issue.
        // No quota spent.
        outcomeRef.current = "dashboard";
        return;
      }


      // Server decides routing (the free-quota gate is enforced server-side).
      // Free-tier plots within the allowance get the dashboard, like paid ones.
      const auth = await authorize(validPlots);
      outcomeRef.current = auth
        ? auth.decision === "paid" || auth.decision === "report"
          ? "dashboard"
          : auth.decision // "survey" | "payment"
        : "fail";
    } catch {
      outcomeRef.current = "fail";
    } finally {
      setAnalyzeDone(true);
    }
  };

  const onGeometryComplete = () => {
    setAnalyzing(false);
    switch (outcomeRef.current) {
      case "dashboard":
        router.push("/dashboard");
        break;
      case "survey":
        router.push("/survey?return=/reports/download");
        break;
      case "report":
        router.push("/reports/download");
        break;
      case "payment":
        setPaymentNeeded(true);
        break;
      default:
        setGeoFailed(true);
    }
  };

  return (
    <section id="analyze" className="bg-paper">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <span className="eyebrow inline-flex items-center gap-1.5 text-accent-deep">
          <Leaf className="h-4 w-4" aria-hidden="true" />
          EUDR compliance
        </span>

        <h1 className="mt-4 font-display text-[clamp(36px,4.4vw,56px)] leading-[1.02] font-semibold tracking-[-0.035em] text-ink">
          Your EUDR compliance check, ready in minutes.
        </h1>
        <p className="mt-3 max-w-2xl text-ink-soft">
          Upload your plot boundaries — we run every analysis automatically and
          deliver one structured report.
        </p>

        <p className="mt-8 text-sm font-medium text-slate-500">What&apos;s included:</p>

        <ul
          role="group"
          aria-label="EUDR compliance analyses"
          className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-2"
        >
          {eudrAnalyses.map((type) => {
            const isSelected = selected.includes(type.key);
            return (
              <li key={type.key}>
                <button
                  type="button"
                  onClick={() => toggle(type.key)}
                  aria-pressed={isSelected}
                  className={`relative flex h-full w-full flex-col rounded-2xl border bg-white p-6 text-left transition-shadow hover:shadow-md ${
                    isSelected
                      ? "border-ink shadow-sm ring-2 ring-ink/15"
                      : "border-slate-200"
                  }`}
                >
                  <span
                    className={`absolute right-5 top-5 flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                      isSelected
                        ? "bg-ink text-white"
                        : "border border-slate-300 bg-white"
                    }`}
                    aria-hidden="true"
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>

                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ${type.tile}`}
                  >
                    <type.icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="mt-5 block text-lg font-bold text-ink">
                    {type.title}
                  </span>
                  <span className="mt-1 block text-xs font-medium text-slate-400">
                    {type.caption}
                  </span>
                  <span className="mt-4 block max-w-md text-sm leading-relaxed text-slate-600">
                    {type.description}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <div className="mt-8">
          <button
            type="button"
            onClick={onRunClick}
            disabled={selected.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-ink-mid disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run compliance check
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
          {!authed && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
              <Lock className="h-3 w-3" aria-hidden="true" />
              You&apos;ll be asked to log in first.
            </p>
          )}
          {authed && selected.length === 0 && (
            <p className="mt-2 text-xs text-slate-400">
              Select at least one analysis to continue.
            </p>
          )}
        </div>
      </div>

      <AddPlotModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        selectedAnalyses={selectedInOrder}
        onAnalyze={handleAnalyze}
      />

      <AnalyzingOverlay
        open={analyzing}
        done={analyzeDone}
        steps={[{ label: "Geometry Checker", icon: Shapes }]}
        onComplete={onGeometryComplete}
      />

      {geoFailed && (
        <GeometryFailedPopup
          onRetry={() => {
            setGeoFailed(false);
            setModalOpen(true);
          }}
          onClose={() => setGeoFailed(false)}
        />
      )}

      {paymentNeeded && (
        <PaymentNeededPopup
          onPay={() => router.push("/checkout")}
          onClose={() => setPaymentNeeded(false)}
        />
      )}

      {consentModal}
    </section>
  );
}

function GeometryFailedPopup({ onRetry, onClose }: { onRetry: () => void; onClose: () => void }) {
  return (
    <Popup
      icon={<AlertTriangle className="h-6 w-6 text-red-600" aria-hidden="true" />}
      tone="bg-red-100 text-red-600"
      title="No plots found"
      body="We couldn't read any plot boundary from this file. Please check the file is a valid GeoJSON with at least one polygon and try again."
      primaryLabel="Try again"
      onPrimary={onRetry}
      onClose={onClose}
    />
  );
}

function PaymentNeededPopup({ onPay, onClose }: { onPay: () => void; onClose: () => void }) {
  return (
    <Popup
      icon={<Lock className="h-6 w-6 text-amber-600" aria-hidden="true" />}
      tone="bg-amber-100 text-amber-600"
      title="Free allowance exceeded"
      body={`Your free allowance covers ${FREE_QUOTA_HA} ha in total, in one plot or several. These plots go beyond what's left — upgrade to keep analyzing more plots.`}
      primaryLabel="Go to payment"
      onPrimary={onPay}
      onClose={onClose}
    />
  );
}
