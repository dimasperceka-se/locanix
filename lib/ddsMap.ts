import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import VectorSource from "ol/source/Vector";
import OSM from "ol/source/OSM";
import Feature from "ol/Feature";
import { Point, Polygon } from "ol/geom";
import { Circle, Fill, Stroke, Style, Text } from "ol/style";
import { fromLonLat } from "ol/proj";
import { createEmpty, extend } from "ol/extent";
import type { DdsPlot, Screening } from "./dds";

export const SCREENING_COLOR: Record<Screening, string> = {
  passed: "#16a34a",
  review: "#f59e0b",
  pending: "#94a3b8",
};

export type PlotsMapImage = {
  /** PNG data URL, or null when the map could not be drawn at all. */
  src: string | null;
  width: number;
  height: number;
  /** Scale bar for the drawn image, in image pixels. */
  scale: { label: string; px: number } | null;
  basemap: boolean;
};

const PIXEL_RATIO = 2;

function niceDistance(meters: number) {
  const pow = 10 ** Math.floor(Math.log10(meters));
  const step = [1, 2, 5, 10].find((s) => s * pow >= meters) ?? 10;
  return step * pow;
}

/** Flatten every layer canvas of the map into one PNG (the OpenLayers export recipe). */
function compose(map: Map, width: number, height: number): string {
  const out = document.createElement("canvas");
  out.width = width * PIXEL_RATIO;
  out.height = height * PIXEL_RATIO;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#f1f5f9";
  ctx.fillRect(0, 0, out.width, out.height);
  map.getViewport().querySelectorAll<HTMLCanvasElement>(".ol-layer canvas, canvas.ol-layer").forEach((canvas) => {
    if (canvas.width === 0) return;
    const parent = canvas.parentNode as HTMLElement;
    const opacity = parent.style.opacity || canvas.style.opacity;
    ctx.globalAlpha = opacity === "" ? 1 : Number(opacity);
    const m = canvas.style.transform.match(/^matrix\(([^(]*)\)$/)?.[1].split(",").map(Number) ?? [
      parseFloat(canvas.style.width) / canvas.width, 0, 0, parseFloat(canvas.style.height) / canvas.height, 0, 0,
    ];
    ctx.setTransform(m[0] * PIXEL_RATIO, m[1] * PIXEL_RATIO, m[2] * PIXEL_RATIO, m[3] * PIXEL_RATIO, m[4] * PIXEL_RATIO, m[5] * PIXEL_RATIO);
    ctx.drawImage(canvas, 0, 0);
  });
  ctx.globalAlpha = 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return out.toDataURL("image/png"); // throws if a tile without CORS tainted the canvas
}

/**
 * Draw the DDS plots on an off-screen OpenStreetMap map: each polygon plus a
 * labelled marker (so plots stay visible when they are far apart), coloured by
 * screening result. Falls back to plots without a basemap if tiles fail.
 */
export async function renderPlotsMap(plots: DdsPlot[], width = 900, height = 560): Promise<PlotsMapImage> {
  const el = document.createElement("div");
  Object.assign(el.style, { position: "fixed", left: "-10000px", top: "0", width: `${width}px`, height: `${height}px` });
  document.body.appendChild(el);

  const source = new VectorSource();
  const extent = createEmpty();
  for (const p of plots) {
    const color = SCREENING_COLOR[p.screening];
    const polygon = new Polygon([[...p.ring, p.ring[0]].map((c) => fromLonLat(c))]);
    extend(extent, polygon.getExtent());
    const area = new Feature({ geometry: polygon });
    area.setStyle(new Style({ stroke: new Stroke({ color, width: 2 }), fill: new Fill({ color: `${color}55` }) }));
    source.addFeature(area);
    const marker = new Feature({ geometry: new Point(fromLonLat([p.centroid.lon, p.centroid.lat])) });
    marker.setStyle(
      new Style({
        image: new Circle({ radius: 7, fill: new Fill({ color }), stroke: new Stroke({ color: "#fff", width: 2 }) }),
        text: new Text({
          text: p.code,
          offsetY: -16,
          font: "bold 13px Helvetica, Arial, sans-serif",
          fill: new Fill({ color: "#0f172a" }),
          stroke: new Stroke({ color: "#fff", width: 3 }),
        }),
      }),
    );
    source.addFeature(marker);
  }

  const osm = new TileLayer({ source: new OSM({ crossOrigin: "anonymous" }) });
  const view = new View();
  const map = new Map({
    target: el,
    layers: [osm, new VectorLayer({ source })],
    controls: [],
    interactions: [],
    pixelRatio: PIXEL_RATIO,
    view,
  });

  try {
    // Extra room top-right (north arrow) and bottom (scale bar, attribution).
    view.fit(extent, { size: [width, height], padding: [70, 70, 60, 60], maxZoom: 16 });
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 12_000); // draw whatever loaded
      map.once("rendercomplete", () => {
        clearTimeout(timer);
        resolve();
      });
      map.renderSync();
    });

    let src: string | null = null;
    let basemap = true;
    try {
      src = compose(map, width, height);
    } catch {
      basemap = false;
      osm.setVisible(false);
      map.renderSync();
      try {
        src = compose(map, width, height);
      } catch {
        src = null;
      }
    }

    // Ground resolution at the map centre (EPSG:3857 metres shrink with latitude).
    const center = view.getCenter()!;
    const lat = (Math.atan(Math.sinh(center[1] / 6378137)) * 180) / Math.PI;
    const metersPerPx = (view.getResolution() ?? 1) * Math.cos((lat * Math.PI) / 180);
    const meters = niceDistance(metersPerPx * 120);
    const scale = {
      label: meters >= 1000 ? `${meters / 1000} km` : `${meters} m`,
      px: meters / metersPerPx,
    };
    return { src, width, height, scale, basemap };
  } finally {
    map.setTarget(undefined);
    el.remove();
  }
}
