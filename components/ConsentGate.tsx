"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { CONSENT_VERSION } from "@/lib/consent";

/**
 * Asks for the data-use consent once per account before the first analysis.
 * `ensureConsent()` resolves true right away when the user already agreed,
 * otherwise it opens the statement and resolves with the user's choice.
 * Render `consentModal` once in the page that calls it.
 */
export function useConsentGate() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const agreed = useRef(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ensureConsent = useCallback(async () => {
    if (agreed.current) return true;
    try {
      const res = await fetch("/api/consent", { cache: "no-store" });
      if (res.ok && (await res.json()).accepted) {
        agreed.current = true;
        return true;
      }
    } catch {
      /* ask below */
    }
    setError("");
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const finish = useCallback((ok: boolean) => {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  }, []);

  const accept = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: CONSENT_VERSION }),
      });
      if (!res.ok) throw new Error();
      agreed.current = true;
      finish(true);
    } catch {
      setError("We couldn't save your choice. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const consentModal = (
    <ConsentModal
      open={open}
      busy={busy}
      error={error}
      onAccept={accept}
      onDecline={() => finish(false)}
    />
  );
  return { ensureConsent, consentModal };
}

function ConsentModal({
  open,
  busy,
  error,
  onAccept,
  onDecline,
}: {
  open: boolean;
  busy: boolean;
  error: string;
  onAccept: () => void;
  onDecline: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onDecline();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onDecline]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-title"
    >
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-6 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 id="consent-title" className="text-lg font-bold text-slate-900">
            Before we analyze your plots
          </h2>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-slate-600">
          <p>We&apos;d like to ask for your permission first.</p>
          <p>
            To run the analysis, Locanix processes the plot boundaries you upload. With your
            agreement, we would also like to keep this plot data so that we can use it for
            further analysis and to keep improving our services in the future.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Your plot data stays linked to your account and is handled in line with our{" "}
              <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline">
                Privacy Policy
              </a>
              .
            </li>
            <li>
              You&apos;re welcome to withdraw your consent at any time — simply{" "}
              <a href="/contact" target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline">
                contact us
              </a>
              .
            </li>
          </ul>
          <p className="text-xs text-slate-500">
            By selecting &ldquo;I agree and continue&rdquo;, you allow Locanix to store and use your
            plot data as described above.
          </p>
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={busy}
            onClick={onDecline}
            className="rounded-lg border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Not now
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onAccept}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink-mid disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Saving…" : "I agree and continue"}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
