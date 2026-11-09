"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Coordinate } from "ol/coordinate";
import {
  ArrowRight,
  Box,
  CheckCircle2,
  FileJson,
  Frame,
  Lock,
  Trash2,
  Upload,
  UploadCloud,
  X,
} from "lucide-react";
import {
  featureCollectionFromDrawn,
  featureCollectionFromText,
  sampleFeatureCollection,
  type FeatureCollection,
} from "@/lib/geo";

// OpenLayers touches the DOM, so load the map only on the client.
const PlotMap = dynamic(() => import("./PlotMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] w-full items-center justify-center rounded-xl border border-slate-200 text-sm text-slate-400">
      Loading map…
    </div>
  ),
});

type Tab = "upload" | "draw";

export type AddPlotModalProps = {
  open: boolean;
  onClose: () => void;
  selectedAnalyses: string[];
  /** Called with the GeoJSON to analyze when "Run Analysis" is pressed. */
  onAnalyze: (geojson: FeatureCollection, filename: string) => void;
};

const MAX_MB = 10;

export default function AddPlotModal({
  open,
  onClose,
  selectedAnalyses,
  onAnalyze,
}: AddPlotModalProps) {
  const [tab, setTab] = useState<Tab>("upload");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [drawnCoords, setDrawnCoords] = useState<Coordinate[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Lock body scroll while open; start each open from a clean slate.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    setTab("upload");
    setFile(null);
    setDrawnCoords([]);
    setError(null);
    setIsFullscreen(false);
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Esc: exit fullscreen first, otherwise close the modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (isFullscreen) setIsFullscreen(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isFullscreen, onClose]);

  if (!open) return null;

  const acceptFile = (f: File | undefined | null) => {
    if (!f) return;
    const okExt = /\.(geojson|json)$/i.test(f.name);
    if (!okExt) {
      setError("Please upload a .geojson or .json file.");
      return;
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`File is larger than ${MAX_MB} MB.`);
      return;
    }
    setError(null);
    setFile(f);
  };

  const canRun = tab === "upload" ? !!file : true;

  const handleAnalyze = async () => {
    if (busy) return;
    setBusy(true);
    let fc: FeatureCollection | null = null;
    let filename = "plots.geojson";
    try {
      if (tab === "upload" && file) {
        filename = file.name;
        fc = featureCollectionFromText(await file.text(), file.name);
      } else if (tab === "draw" && drawnCoords.length >= 3) {
        filename = "drawn_plot.geojson";
        fc = featureCollectionFromDrawn(drawnCoords);
      }
    } catch {
      fc = null;
    }
    // No parseable geometry — fall back to a sample so the demo still flows.
    if (!fc) fc = sampleFeatureCollection(file?.name ?? undefined);
    setBusy(false);
    onAnalyze(fc, filename);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onMouseDown={(e) => {
        // Backdrop click closes (ignore drags that start inside the panel).
        if (e.target === e.currentTarget && !isFullscreen) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-plot-title"
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl transition-[max-width] ${
          tab === "draw" ? "max-w-4xl" : "max-w-2xl"
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-6 pt-6">
          <h2 id="add-plot-title" className="text-xl font-extrabold text-slate-900">
            Add plot data
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {/* Selected-analysis chips */}
          {selectedAnalyses.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-2">
              {selectedAnalyses.map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700"
                >
                  <Box className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  {name}
                </span>
              ))}
            </div>
          )}

          <h3 className="mt-6 text-base font-bold text-ink">
            Where are your plots?
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Upload a GeoJSON file or draw your plot boundaries directly on the map
            — we&apos;ll run your selected analyses on them.
          </p>

          {/* Tab toggle */}
          <div
            role="tablist"
            aria-label="Plot input method"
            className="mt-5 grid grid-cols-2 gap-0 overflow-hidden rounded-lg border border-ink"
          >
            <button
              role="tab"
              aria-selected={tab === "upload"}
              type="button"
              onClick={() => setTab("upload")}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                tab === "upload" ? "bg-ink text-white" : "bg-white text-ink"
              }`}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              Upload file
            </button>
            <button
              role="tab"
              aria-selected={tab === "draw"}
              type="button"
              onClick={() => setTab("draw")}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                tab === "draw" ? "bg-ink text-white" : "bg-white text-ink"
              }`}
            >
              <Frame className="h-4 w-4" aria-hidden="true" />
              Draw on map
            </button>
          </div>

          {/* Tab panels */}
          <div className="mt-5">
            {tab === "upload" ? (
              <div>
                {file ? (
                  // F27 — uploaded file row
                  <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3.5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-ink text-white">
                      <FileJson className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm font-bold text-slate-800">
                        {file.name}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {(file.size / 1024).toFixed(0)} Kb
                      </span>
                    </span>
                    <CheckCircle2
                      className="h-5 w-5 shrink-0 text-accent"
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setFile(null);
                        setError(null);
                        if (inputRef.current) inputRef.current.value = "";
                      }}
                      aria-label="Remove file"
                      className="shrink-0 rounded-md p-1.5 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragging(false);
                      acceptFile(e.dataTransfer.files?.[0]);
                    }}
                    className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
                      dragging
                        ? "border-ink bg-paper-warm"
                        : "border-ink/30 bg-paper hover:bg-paper-warm"
                    }`}
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink shadow-sm">
                      <UploadCloud className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <span className="text-sm font-bold text-slate-700">
                      Drop your GeoJSON file here
                    </span>
                    <span className="text-xs text-slate-400">
                      Or click to browse | Max {MAX_MB} MB
                    </span>
                  </button>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".geojson,.json,application/geo+json,application/json"
                  className="hidden"
                  onChange={(e) => acceptFile(e.target.files?.[0])}
                />
                {error && (
                  <p className="mt-2 text-xs font-medium text-red-500">{error}</p>
                )}
              </div>
            ) : (
              <PlotMap
                isFullscreen={isFullscreen}
                onToggleFullscreen={() => setIsFullscreen((v) => !v)}
                onPolygonChange={setDrawnCoords}
                onRunAnalysis={handleAnalyze}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 border-t border-slate-100 px-6 py-4">
          <span className="flex items-center gap-2 text-sm text-slate-400">
            <Lock className="h-4 w-4" aria-hidden="true" />
            Your data stays private
          </span>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={!canRun || busy}
            className="flex items-center gap-2 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink-mid disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run Analysis
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
