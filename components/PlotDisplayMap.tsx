"use client";

import "ol/ol.css";
import { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import Feature from "ol/Feature";
import { Polygon } from "ol/geom";
import { Style, Stroke, Fill } from "ol/style";
import { fromLonLat } from "ol/proj";
import { defaults as defaultControls } from "ol/control";
import { Layers, Maximize2, Minimize2, Minus, Plus } from "lucide-react";
import type { Plot } from "@/lib/geo";

type Basemap = "osm" | "sat";

const GOOGLE_SAT_URL = "https://mt{0-3}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";

const plotStyle = new Style({
  stroke: new Stroke({ color: "#0D0F0E", width: 2 }),
  fill: new Fill({ color: "rgba(27, 58, 107, 0.22)" }),
});

export default function PlotDisplayMap({ plots }: { plots: Plot[] }) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const sourceRef = useRef<VectorSource | null>(null);
  const osmRef = useRef<TileLayer<OSM> | null>(null);
  const satRef = useRef<TileLayer<XYZ> | null>(null);
  const [basemap, setBasemap] = useState<Basemap>("osm");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Init map once.
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const source = new VectorSource();
    sourceRef.current = source;
    const osm = new TileLayer({ source: new OSM(), visible: true });
    const sat = new TileLayer({
      source: new XYZ({
        url: GOOGLE_SAT_URL,
        maxZoom: 20,
        crossOrigin: "anonymous",
        attributions: "Imagery © Google",
      }),
      visible: false,
    });
    osmRef.current = osm;
    satRef.current = sat;
    mapRef.current = new Map({
      target: elRef.current,
      layers: [osm, sat, new VectorLayer({ source, style: plotStyle })],
      controls: defaultControls({ zoom: false, rotate: false }),
      view: new View({ center: fromLonLat([101.45, 0.51]), zoom: 5 }),
    });
    return () => {
      mapRef.current?.setTarget(undefined);
      mapRef.current = null;
    };
  }, []);

  // Render plot polygons and fit the view whenever plots change.
  useEffect(() => {
    const source = sourceRef.current;
    const map = mapRef.current;
    if (!source || !map) return;
    source.clear();
    for (const plot of plots) {
      const ring = plot.ring.map((c) => fromLonLat(c));
      if (ring.length >= 3) {
        source.addFeature(new Feature(new Polygon([[...ring, ring[0]]])));
      }
    }
    const extent = source.getExtent();
    if (extent && Number.isFinite(extent[0]) && extent[0] !== Infinity) {
      map.getView().fit(extent, { padding: [50, 50, 50, 50], maxZoom: 16, duration: 400 });
    }
  }, [plots]);

  useEffect(() => {
    osmRef.current?.setVisible(basemap === "osm");
    satRef.current?.setVisible(basemap === "sat");
  }, [basemap]);

  useEffect(() => {
    const id = window.setTimeout(() => mapRef.current?.updateSize(), 60);
    return () => window.clearTimeout(id);
  }, [isFullscreen]);

  // Esc exits fullscreen.
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setIsFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isFullscreen]);

  const zoomBy = (d: number) => {
    const view = mapRef.current?.getView();
    if (!view) return;
    view.animate({ zoom: (view.getZoom() ?? 12) + d, duration: 200 });
  };

  return (
    <div
      className={
        isFullscreen
          ? "fixed inset-0 z-[120] bg-white"
          : "relative h-full min-h-[360px] w-full overflow-hidden rounded-2xl border border-slate-200"
      }
    >
      <div ref={elRef} className="absolute inset-0 h-full w-full" />

      <button
        type="button"
        onClick={() => setIsFullscreen((v) => !v)}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-ink shadow-sm hover:bg-slate-50"
      >
        {isFullscreen ? (
          <Minimize2 className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
        )}
      </button>

      {/* Basemap toggle */}
      <div className="absolute bottom-4 left-4 z-10 flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs font-semibold shadow-sm">
        <button
          type="button"
          onClick={() => setBasemap("osm")}
          aria-pressed={basemap === "osm"}
          className={`flex items-center gap-1 px-2.5 py-1.5 ${
            basemap === "osm" ? "bg-ink text-white" : "text-ink"
          }`}
        >
          <Layers className="h-3 w-3" aria-hidden="true" />
          Street
        </button>
        <button
          type="button"
          onClick={() => setBasemap("sat")}
          aria-pressed={basemap === "sat"}
          className={`px-2.5 py-1.5 ${
            basemap === "sat" ? "bg-ink text-white" : "text-ink"
          }`}
        >
          Satellite
        </button>
      </div>

      {/* Zoom */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => zoomBy(1)}
          aria-label="Zoom in"
          className="flex h-8 w-8 items-center justify-center text-ink hover:bg-slate-100"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="h-px w-full bg-slate-200" />
        <button
          type="button"
          onClick={() => zoomBy(-1)}
          aria-label="Zoom out"
          className="flex h-8 w-8 items-center justify-center text-ink hover:bg-slate-100"
        >
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
