"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { downloadText } from "@/lib/euisExport";
import { previewDdr, previewGeoJson } from "./preview-export";

const OPTIONS = [
  {
    key: "geojson",
    label: "GeoJSON",
    hint: "EUIS geolocation file for your DDS",
    run: () => downloadText("locanix-sample-plots.geojson", previewGeoJson(), "application/geo+json"),
  },
  {
    key: "ddr",
    label: "DDR (CSV)",
    hint: "Due diligence report, 35 columns. Analysis results filled in; supplier evidence left blank.",
    run: () => downloadText("locanix-sample-ddr.csv", previewDdr(), "text/csv;charset=utf-8"),
  },
];

/** "Export" button with GeoJSON and DDR downloads of the preview plots. */
export default function ExportMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line-strong bg-white px-3.5 py-2 text-[13px] font-semibold text-ink hover:border-ink"
      >
        Export
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" aria-label="Export plots" className="absolute top-full right-0 z-30 mt-2 w-[min(280px,80vw)] overflow-hidden rounded-xl border border-line bg-white shadow-[0_12px_32px_rgba(13,15,14,0.14)]">
          {OPTIONS.map((o, i) => (
            <button
              key={o.key}
              type="button"
              role="menuitem"
              onClick={() => {
                o.run();
                setOpen(false);
              }}
              className={`flex w-full cursor-pointer flex-col gap-0.5 border-0 bg-white px-4 py-3 text-left hover:bg-canvas ${i > 0 ? "border-t border-line-soft" : ""}`}
            >
              <span className="text-[14px] font-semibold text-ink">{o.label}</span>
              <span className="text-[12px] leading-[1.45] text-muted">{o.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
