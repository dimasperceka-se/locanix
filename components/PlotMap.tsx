"use client";

import "ol/ol.css";
import { useEffect, useMemo, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import Feature from "ol/Feature";
import type { FeatureLike } from "ol/Feature";
import { Polygon, LineString, Point } from "ol/geom";
import { Style, Stroke, Fill, Circle as CircleStyle } from "ol/style";
import { fromLonLat } from "ol/proj";
import { getArea } from "ol/sphere";
import { defaults as defaultControls } from "ol/control";
import type { Coordinate } from "ol/coordinate";
import {
  ArrowRight,
  Crosshair,
  Frame,
  Hand,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  Search,
  Undo2,
} from "lucide-react";

type Mode = "grab" | "add";
type Basemap = "osm" | "sat";

// Default view centered on a palm-oil region in Riau, Indonesia.
const DEFAULT_CENTER: [number, number] = [101.45, 0.51];
const DEFAULT_ZOOM = 12;

const GOOGLE_SAT_URL =
  "https://mt{0-3}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";

export type PlotMapProps = {
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  /** Footer CTA — only rendered in the fullscreen floating card. */
  onRunAnalysis?: () => void;
  /** Reports the drawn polygon vertices (EPSG:3857) to the parent. */
  onPolygonChange?: (coords: Coordinate[]) => void;
};

export default function PlotMap({
  isFullscreen,
  onToggleFullscreen,
  onRunAnalysis,
  onPolygonChange,
}: PlotMapProps) {
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const sourceRef = useRef<VectorSource | null>(null);
  const osmRef = useRef<TileLayer<OSM> | null>(null);
  const satRef = useRef<TileLayer<XYZ> | null>(null);
  const modeRef = useRef<Mode>("add");

  const [mode, setMode] = useState<Mode>("add");
  const [basemap, setBasemap] = useState<Basemap>("osm");
  const [coords, setCoords] = useState<Coordinate[]>([]);
  const [redo, setRedo] = useState<Coordinate[]>([]);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);

  // Keep a ref in sync so the (once-bound) click handler reads the live mode.
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Report the drawn polygon upward without re-binding on every parent render.
  const onPolygonChangeRef = useRef(onPolygonChange);
  onPolygonChangeRef.current = onPolygonChange;
  useEffect(() => {
    onPolygonChangeRef.current?.(coords);
  }, [coords]);

  /* ----------------------------- map init ----------------------------- */
  useEffect(() => {
    if (!mapElRef.current || mapRef.current) return;

    const source = new VectorSource();
    sourceRef.current = source;

    const vector = new VectorLayer({
      source,
      style: featureStyle,
    });

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

    const map = new Map({
      target: mapElRef.current,
      layers: [osm, sat, vector],
      controls: defaultControls({ zoom: false, rotate: false }),
      view: new View({
        center: fromLonLat(DEFAULT_CENTER),
        zoom: DEFAULT_ZOOM,
      }),
    });
    mapRef.current = map;

    // Inline so TS infers the MapBrowserEvent type from the "click" overload.
    map.on("click", (evt) => {
      if (modeRef.current !== "add") return;
      setCoords((prev) => [...prev, evt.coordinate]);
      setRedo([]);
    });

    return () => {
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, []);

  /* ----------------- redraw sketch features on coord change ----------- */
  useEffect(() => {
    const source = sourceRef.current;
    if (!source) return;
    source.clear();

    if (coords.length >= 3) {
      source.addFeature(
        new Feature(new Polygon([[...coords, coords[0]]])),
      );
    } else if (coords.length === 2) {
      source.addFeature(new Feature(new LineString(coords)));
    }
    // vertex dots
    for (const c of coords) {
      source.addFeature(new Feature(new Point(c)));
    }
  }, [coords]);

  /* ------------------------- basemap switching ------------------------ */
  useEffect(() => {
    osmRef.current?.setVisible(basemap === "osm");
    satRef.current?.setVisible(basemap === "sat");
  }, [basemap]);

  /* ----------- resize the map when entering/leaving fullscreen -------- */
  useEffect(() => {
    const id = window.setTimeout(() => mapRef.current?.updateSize(), 60);
    return () => window.clearTimeout(id);
  }, [isFullscreen]);

  /* ------------------------------ stats ------------------------------- */
  const pointCount = coords.length;
  const areaHa = useMemo(() => {
    if (coords.length < 3) return 0;
    const poly = new Polygon([[...coords, coords[0]]]);
    const m2 = getArea(poly, { projection: "EPSG:3857" });
    return m2 / 10_000;
  }, [coords]);

  /* ----------------------------- actions ------------------------------ */
  const undo = () => {
    if (!coords.length) return;
    setRedo((r) => [...r, coords[coords.length - 1]]);
    setCoords(coords.slice(0, -1));
  };

  const redoAction = () => {
    if (!redo.length) return;
    setCoords([...coords, redo[redo.length - 1]]);
    setRedo(redo.slice(0, -1));
  };

  const reset = () => {
    setCoords([]);
    setRedo([]);
  };

  const zoomBy = (delta: number) => {
    const view = mapRef.current?.getView();
    if (!view) return;
    const z = view.getZoom() ?? DEFAULT_ZOOM;
    view.animate({ zoom: z + delta, duration: 200 });
  };

  const flyTo = (lon: number, lat: number, zoom = 15) => {
    mapRef.current
      ?.getView()
      .animate({ center: fromLonLat([lon, lat]), zoom, duration: 600 });
  };

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    if (!q) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(
          q,
        )}`,
        { headers: { Accept: "application/json" } },
      );
      const data = (await res.json()) as Array<{ lon: string; lat: string }>;
      if (data[0]) flyTo(parseFloat(data[0].lon), parseFloat(data[0].lat));
    } catch {
      /* network errors are non-fatal for the demo */
    } finally {
      setSearching(false);
    }
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        flyTo(pos.coords.longitude, pos.coords.latitude, 16);
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  /* ------------------------ shared tool buttons ----------------------- */
  const tools = (
    <div className="flex flex-wrap items-center gap-2">
      {/* Grab / Add Point segmented control */}
      <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
        <button
          type="button"
          onClick={() => setMode("grab")}
          aria-pressed={mode === "grab"}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            mode === "grab" ? "bg-ink text-white" : "text-ink"
          }`}
        >
          <Hand className="h-3.5 w-3.5" aria-hidden="true" />
          Grab
        </button>
        <button
          type="button"
          onClick={() => setMode("add")}
          aria-pressed={mode === "add"}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
            mode === "add" ? "bg-ink text-white" : "text-ink"
          }`}
        >
          <Frame className="h-3.5 w-3.5" aria-hidden="true" />
          Add Point
        </button>
      </div>

      <button
        type="button"
        onClick={undo}
        disabled={!coords.length}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
      >
        <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
        Undo
      </button>
      <button
        type="button"
        onClick={redoAction}
        disabled={!redo.length}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
      >
        <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
        Redo
      </button>
      <button
        type="button"
        onClick={reset}
        disabled={!coords.length}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 disabled:opacity-40"
      >
        <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        Reset
      </button>

      <form onSubmit={runSearch} className="relative min-w-[180px] flex-1">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Location"
          aria-label="Search location"
          className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-ink outline-none placeholder:text-slate-400 focus:border-ink"
        />
        {searching && (
          <Loader2
            className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-slate-400"
            aria-hidden="true"
          />
        )}
      </form>

      <button
        type="button"
        onClick={useCurrentLocation}
        className="flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-white hover:bg-ink-mid"
      >
        {locating ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Use current location
      </button>
    </div>
  );

  /* ------------------------ in-map overlay bits ----------------------- */
  const basemapToggle = (
    <div className="absolute bottom-3 left-3 z-10 flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs font-semibold shadow-sm">
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
  );

  const zoomControls = (
    <div className="absolute bottom-3 right-3 z-10 flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
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
  );

  const statsContent = (
    <>
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-clear-bg text-clear-ink">
          <Frame className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="leading-tight">
          <span className="block text-[11px] text-slate-400">Polygon</span>
          <span className="block text-sm font-bold text-ink">
            {pointCount} Point
          </span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-paper-warm text-ink">
          <Layers className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="leading-tight">
          <span className="block text-[11px] text-slate-400">Total Area</span>
          <span className="block text-sm font-bold text-ink">
            {areaHa.toLocaleString(undefined, { maximumFractionDigits: 2 })} Ha
          </span>
        </span>
      </div>
    </>
  );

  /* ------------------------------ render ------------------------------ */
  return (
    <div className={isFullscreen ? "fixed inset-0 z-[120] flex flex-col bg-white" : "space-y-4"}>
      {/* Inline toolbar (normal flow, above the map) */}
      {!isFullscreen && tools}

      {/* Map box — always present so the OL instance is never remounted */}
      <div
        className={
          isFullscreen
            ? "relative flex-1"
            : "relative h-[420px] w-full overflow-hidden rounded-xl border border-slate-200"
        }
      >
        <div ref={mapElRef} className="absolute inset-0 h-full w-full" />

        {/* Fullscreen floating toolbar (top-left) */}
        {isFullscreen && (
          <div className="absolute left-4 top-4 z-10 max-w-[calc(100%-2rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
            {tools}
          </div>
        )}

        {/* Top-right: enter / exit fullscreen */}
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="absolute right-4 top-4 z-10 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-ink shadow-sm hover:bg-slate-50"
        >
          {isFullscreen ? (
            <>
              Exit Fullscreen
              <Minimize2 className="h-4 w-4" aria-hidden="true" />
            </>
          ) : (
            <Maximize2 className="h-4 w-4" aria-hidden="true" />
          )}
          <span className="sr-only">
            {isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          </span>
        </button>

        {basemapToggle}
        {zoomControls}

        {/* Fullscreen floating stats + run card (bottom center) */}
        {isFullscreen && (
          <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-6 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-lg">
            {statsContent}
            <button
              type="button"
              onClick={onRunAnalysis}
              className="flex items-center gap-2 rounded-lg bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:bg-ink-mid"
            >
              Run Analysis
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Inline stats bar (normal flow, below the map) */}
      {!isFullscreen && (
        <div className="flex items-center gap-8 rounded-xl border border-slate-200 px-4 py-3">
          {statsContent}
        </div>
      )}
    </div>
  );
}

/* Style for sketch features: filled polygon, ink edges, white vertex dots. */
function featureStyle(feature: FeatureLike): Style {
  const geom = feature.getGeometry();
  const type = geom?.getType();
  if (type === "Point") {
    return new Style({
      image: new CircleStyle({
        radius: 5,
        fill: new Fill({ color: "#ffffff" }),
        stroke: new Stroke({ color: "#0D0F0E", width: 2 }),
      }),
    });
  }
  return new Style({
    stroke: new Stroke({ color: "#0D0F0E", width: 2 }),
    fill: new Fill({ color: "rgba(52, 214, 133, 0.20)" }),
  });
}
