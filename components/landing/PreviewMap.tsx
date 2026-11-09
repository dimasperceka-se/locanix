"use client";

import "ol/ol.css";
import { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import Feature from "ol/Feature";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import { Point, Polygon } from "ol/geom";
import { Fill, Stroke, Style, Text } from "ol/style";
import { fromLonLat } from "ol/proj";
import { createEmpty, extend, getCenter, type Extent } from "ol/extent";
import { DragPan, MouseWheelZoom, defaults as defaultInteractions } from "ol/interaction";
import { platformModifierKeyOnly } from "ol/events/condition";
import type { FeatureLike } from "ol/Feature";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { PARK_RING, PREVIEW_PARK, PREVIEW_PLOTS, needsReview } from "./preview-data";

const ESRI_IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
/** GLAD Landsat deforestation alerts (UMD), styled tiles from Global Forest Watch, since the EUDR cut-off. */
const GLAD_ALERTS = "https://tiles.globalforestwatch.org/umd_glad_landsat_alerts/latest/dynamic/{z}/{x}/{y}.png?start_date=2021-01-01";
const PADDING = [56, 56, 88, 88];

const polygon = (ring: [number, number][]) => new Polygon([[...ring, ring[0]].map((c) => fromLonLat(c))]);

type Layers = { park: boolean; glad: boolean };

/** Satellite view of the preview plots next to Tesso Nilo National Park, with toggleable layers. */
export default function PreviewMap() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const extentRef = useRef<Extent | null>(null);
  const layerRefs = useRef<{ park: VectorLayer[]; glad: TileLayer<XYZ> | null }>({ park: [], glad: null });
  const [layers, setLayers] = useState<Layers>({ park: true, glad: true });
  const [hint, setHint] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // next/font registers hashed family names; read the real one for canvas text.
    const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-jetbrains-mono").trim() || "monospace";
    const halo = new Stroke({ color: "rgba(13,15,14,0.75)", width: 3 });

    const plotStyle = (f: FeatureLike) => {
      const review = f.get("review") as boolean;
      return new Style({
        fill: new Fill({ color: review ? "rgba(242,166,90,0.28)" : "rgba(255,255,255,0.14)" }),
        stroke: new Stroke({ color: review ? "#F2A65A" : "#FFFFFF", width: review ? 2.6 : 2.2 }),
        text: new Text({ text: f.get("label"), font: `600 13px ${mono}, monospace`, fill: new Fill({ color: "#FFFFFF" }), stroke: halo }),
      });
    };
    const parkStyle = new Style({
      fill: new Fill({ color: "rgba(61,220,132,0.14)" }),
      stroke: new Stroke({ color: "#3DDC84", width: 2, lineDash: [7, 5] }),
    });
    const labelStyle = new Style({
      text: new Text({
        text: `${PREVIEW_PARK.name}\nIUCN ${PREVIEW_PARK.iucn}`,
        font: `500 11px ${mono}, monospace`,
        fill: new Fill({ color: "#DDF1E5" }),
        stroke: halo,
        textAlign: "center",
      }),
    });

    const plots = PREVIEW_PLOTS.map((p) => {
      const f = new Feature(polygon(p.ring));
      f.set("label", p.id);
      f.set("review", needsReview(p));
      return f;
    });
    const parkGeom = polygon(PARK_RING);
    const parkLabel = new Feature<Point>();
    const parkLayer = new VectorLayer({ source: new VectorSource({ features: [new Feature(parkGeom)] }), style: parkStyle });
    const parkLabelLayer = new VectorLayer({ source: new VectorSource({ features: [parkLabel] }), style: labelStyle });
    const gladLayer = new TileLayer({
      opacity: 0.9,
      // Nearest-neighbour so the 30 m alert pixels stay crisp when zoomed past z12.
      source: new XYZ({ url: GLAD_ALERTS, maxZoom: 12, interpolate: false }),
    });
    layerRefs.current = { park: [parkLayer, parkLabelLayer], glad: gladLayer };

    // Mouse drags pan; on touch screens one finger keeps scrolling the page and two
    // fingers pan. The wheel only zooms with ⌘/Ctrl so the page still scrolls.
    const dragPan: DragPan = new DragPan({
      condition: (e) => (e.originalEvent as PointerEvent).pointerType === "mouse" || dragPan.getPointerCount() === 2,
    });
    const map = new Map({
      target: el,
      // Attribution is rendered below as a small credit line, independent of ol.css.
      controls: [],
      interactions: defaultInteractions({ mouseWheelZoom: false, dragPan: false }).extend([
        dragPan,
        new MouseWheelZoom({ condition: platformModifierKeyOnly }),
      ]),
      layers: [
        new TileLayer({ source: new XYZ({ url: ESRI_IMAGERY, maxZoom: 18 }) }),
        gladLayer,
        parkLayer,
        parkLabelLayer,
        new VectorLayer({ source: new VectorSource({ features: plots }), style: plotStyle }),
      ],
      view: new View({ center: fromLonLat([101.875, -0.125]), zoom: 14, minZoom: 9, maxZoom: 18 }),
    });
    map.getViewport().style.touchAction = "pan-y";
    mapRef.current = map;

    const extent = createEmpty();
    for (const f of plots) extend(extent, f.getGeometry()!.getExtent());
    extentRef.current = extent;
    const centers = plots.map((f) => getCenter(f.getGeometry()!.getExtent()));

    // Put the park's name where the park is visible: inside it, clear of the plots,
    // the boundary, the view edges and the legend strip at the bottom.
    const placeParkLabel = () => {
      const size = map.getSize();
      if (!size) return;
      const [minX, minY, maxX, maxY] = map.getView().calculateExtent(size);
      const w = maxX - minX;
      const h = maxY - minY;
      let best: number[] | null = null;
      let bestScore = 0;
      for (let i = 1; i < 16; i++) {
        for (let j = 5; j < 16; j++) {
          const c = [minX + (w * i) / 16, minY + (h * j) / 16];
          if (!parkGeom.intersectsCoordinate(c)) continue;
          const edge = Math.min((c[0] - minX) / 2.2, (maxX - c[0]) / 2.2, c[1] - minY, maxY - c[1]);
          const [bx, by] = parkGeom.getClosestPoint(c);
          const boundary = Math.hypot(bx - c[0], by - c[1]);
          const plot = Math.min(...centers.map(([px, py]) => Math.hypot(px - c[0], py - c[1])));
          const score = Math.min(edge, boundary * 1.4, plot * 0.6);
          if (score > bestScore) {
            bestScore = score;
            best = c;
          }
        }
      }
      parkLabel.setGeometry(best ? new Point(best) : undefined);
    };
    map.on("moveend", placeParkLabel);

    map.updateSize();
    map.getView().fit(extent, { padding: PADDING });
    const resize = new ResizeObserver(() => map.updateSize());
    resize.observe(el);
    // Redraw labels once the mono font has loaded.
    document.fonts?.ready.then(() => map.render());

    let hintTimer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      setHint(true);
      clearTimeout(hintTimer);
      hintTimer = setTimeout(() => setHint(false), 1400);
    };
    el.addEventListener("wheel", onWheel, { passive: true });

    return () => {
      clearTimeout(hintTimer);
      el.removeEventListener("wheel", onWheel);
      resize.disconnect();
      map.setTarget(undefined);
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    layerRefs.current.park.forEach((l) => l.setVisible(layers.park));
    layerRefs.current.glad?.setVisible(layers.glad);
  }, [layers]);

  const zoomBy = (delta: number) => {
    const view = mapRef.current?.getView();
    if (view) view.animate({ zoom: (view.getZoom() ?? 14) + delta, duration: 200 });
  };
  const reset = () => {
    const map = mapRef.current;
    if (map && extentRef.current) map.getView().fit(extentRef.current, { padding: PADDING, duration: 300 });
  };

  const button = "flex h-9 w-9 cursor-pointer items-center justify-center border-0 bg-white text-ink hover:bg-canvas";
  const toggle = (key: keyof Layers, label: string, swatch: string) => (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink select-none">
      <input
        type="checkbox"
        checked={layers[key]}
        onChange={(e) => setLayers((l) => ({ ...l, [key]: e.target.checked }))}
        className="h-4 w-4 cursor-pointer accent-ink"
      />
      <span className={`h-3 w-3 flex-none rounded-[3px] ${swatch}`} />
      {label}
    </label>
  );

  return (
    <>
      <div ref={ref} className="landing-preview-map absolute inset-0" />

      <div className="absolute top-4 left-4 z-10 flex flex-col overflow-hidden rounded-[10px] border border-line shadow-sm">
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1)} className={button}>
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(-1)} className={`${button} border-t border-line`}>
          <Minus className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" aria-label="Reset view" onClick={reset} className={`${button} border-t border-line`}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <fieldset className="absolute top-4 right-4 z-10 m-0 flex flex-col gap-2 rounded-[10px] border border-line bg-white px-3.5 py-3 shadow-sm">
        <legend className="sr-only">Map layers</legend>
        <span className="font-mono text-[11px] tracking-[0.06em] text-muted uppercase" aria-hidden="true">
          Layers
        </span>
        {toggle("park", "Protected area", "border-2 border-dashed border-[#1F9D5C] bg-clear-bg")}
        {toggle("glad", "Deforestation alerts (GLAD)", "bg-[#E6639B]")}
      </fieldset>

      <p className="pointer-events-auto absolute right-0 bottom-0 z-10 m-0 max-w-[75%] rounded-tl-md bg-white/70 px-1.5 py-0.5 text-right text-[9.5px] leading-[1.35] text-[#3A403C]">
        <span className="hidden sm:inline">
          © Esri, Maxar, Earthstar Geographics
          {layers.glad && " · GLAD alerts: UMD / Global Forest Watch (CC BY 4.0)"}
          {layers.park && " · Park: © OpenStreetMap contributors"}
        </span>
        <span className="sm:hidden">
          © Esri, Maxar, Earthstar{layers.glad && " · GLAD/UMD, GFW"}
          {layers.park && " · © OSM"}
        </span>
      </p>

      {hint && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/35">
          <span className="rounded-full bg-ink/85 px-4 py-2 text-[14px] font-medium text-white">Use ⌘ / Ctrl + scroll to zoom the map</span>
        </div>
      )}
    </>
  );
}
