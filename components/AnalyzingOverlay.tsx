"use client";

import { useEffect, useRef, useState } from "react";
import { Leaf, type LucideIcon } from "lucide-react";

export type AnalyzingStep = {
  label: string;
  icon: LucideIcon;
};

export type AnalyzingOverlayProps = {
  open: boolean;
  title?: string;
  steps: AnalyzingStep[];
  description?: string;
  /** Set true when the real work finishes — the bar then completes to 100%. */
  done: boolean;
  onComplete: () => void;
};

const DEFAULT_DESCRIPTION =
  "We're cross-referencing your land boundary against satellite data and protected area databases.";

export default function AnalyzingOverlay({
  open,
  title = "Analyzing your land",
  steps,
  description = DEFAULT_DESCRIPTION,
  done,
  onComplete,
}: AnalyzingOverlayProps) {
  const [progress, setProgress] = useState(0);
  const doneRef = useRef(done);
  doneRef.current = done;
  const completedRef = useRef(false);

  // Animate: creep toward 92% while working, then rush to 100% once done.
  useEffect(() => {
    if (!open) {
      setProgress(0);
      completedRef.current = false;
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      setProgress((prev) => {
        if (doneRef.current) return Math.min(100, prev + 3);
        const target = Math.min(92, (elapsed / 6000) * 92);
        return Math.max(prev, target);
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Fire completion once the bar has filled and the work is done.
  useEffect(() => {
    if (open && done && progress >= 100 && !completedRef.current) {
      completedRef.current = true;
      onComplete();
    }
  }, [open, done, progress, onComplete]);

  if (!open) return null;

  const rounded = Math.round(progress);
  const activeIndex = Math.min(
    steps.length - 1,
    Math.floor((progress / 100) * steps.length),
  );

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-white px-6"
      role="status"
      aria-live="polite"
      aria-label={`${title}, ${rounded}%`}
    >
      <h2 className="text-xl font-extrabold text-slate-900">{title}</h2>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        {steps.map((step, i) => {
          const Icon = step.icon;
          const active = i <= activeIndex;
          return (
            <span
              key={step.label}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition-colors ${
                active ? "bg-green-200/80 text-green-900" : "bg-pink-100 text-pink-700"
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {step.label}
            </span>
          );
        })}
      </div>

      <div className="relative mt-10 h-28 w-36">
        <Corner className="left-0 top-0 rounded-tl-lg border-l-2 border-t-2" />
        <Corner className="right-0 top-0 rounded-tr-lg border-r-2 border-t-2" />
        <Corner className="bottom-0 left-0 rounded-bl-lg border-b-2 border-l-2" />
        <Corner className="bottom-0 right-0 rounded-br-lg border-b-2 border-r-2" />
        <Leaf
          className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 animate-pulse text-ink"
          aria-hidden="true"
        />
      </div>

      <p className="mt-10 text-lg font-bold text-ink">{rounded}%</p>
      <div className="mt-3 h-1.5 w-64 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-150 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      <p className="mt-4 max-w-md text-center text-sm leading-relaxed text-slate-500">
        {description}
      </p>
    </div>
  );
}

function Corner({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute h-8 w-8 border-slate-300 ${className}`}
    />
  );
}
