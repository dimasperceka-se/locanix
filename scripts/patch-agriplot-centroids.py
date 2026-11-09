#!/usr/bin/env python3
"""
Add a centroid point marker to every AgriPlot plot so they stay visible when
zoomed out; clicking a marker zooms in to that plot.

Run from the sustainit project root (e.g. /var/www/sustainit):
    python3 /var/www/locanix.id/scripts/patch-agriplot-centroids.py
    npm run build && pm2 restart sustainit-live

Idempotent (detects the already-patched state). Anchors are regions untouched by
the other AgriPlot patches, so this applies cleanly before or after them.
"""
import sys

F = "client/src/pages/maps/agri-plot-map.tsx"
try:
    s = open(F, encoding="utf-8").read()
except FileNotFoundError:
    sys.exit("ERROR: run from the sustainit project root (client/ must exist).")

if "function PlotCentroids" in s:
    print("Already patched — nothing to do.")
    sys.exit(0)

edits = [
(
'import { MapContainer, TileLayer, GeoJSON, useMap, LayersControl } from "react-leaflet";',
'import { MapContainer, TileLayer, GeoJSON, useMap, LayersControl, CircleMarker, Tooltip } from "react-leaflet";'
),
(
'    function FitBounds({ data, onDone }: { data: any, onDone?: () => void }) {',
'''    // Centroid dot per plot — visible when zoomed out; click to zoom into the plot.
    function PlotCentroids({ data }: { data: any }) {
        const map = useMap();
        if (!data?.features?.length) return null;
        return (
            <>
                {data.features.map((f: any, i: number) => {
                    let bounds;
                    try {
                        bounds = L.geoJSON(f).getBounds();
                    } catch {
                        return null;
                    }
                    if (!bounds || !bounds.isValid()) return null;
                    const c = bounds.getCenter();
                    return (
                        <CircleMarker
                            key={f?.properties?.id ?? i}
                            center={[c.lat, c.lng]}
                            radius={5}
                            pathOptions={{ color: "#14532d", weight: 2, fillColor: "#22c55e", fillOpacity: 1 }}
                            eventHandlers={{ click: () => map.flyToBounds(bounds, { maxZoom: 15, padding: [40, 40] }) }}
                        >
                            <Tooltip>{f?.properties?.plot_id ?? "Plot"}</Tooltip>
                        </CircleMarker>
                    );
                })}
            </>
        );
    }

    function FitBounds({ data, onDone }: { data: any, onDone?: () => void }) {'''
),
(
'''                    {factoryPoint && showFactory && (
                        <FactoryPointLayer data={factoryPoint} />
                    )}''',
'''                    {geojson && showGeojson && <PlotCentroids data={geojson} />}

                    {factoryPoint && showFactory && (
                        <FactoryPointLayer data={factoryPoint} />
                    )}'''
),
]

for i, (old, new) in enumerate(edits, 1):
    assert old in s, f"edit #{i} PATTERN NOT FOUND — send this to Claude"
    assert s.count(old) == 1, f"edit #{i} not unique ({s.count(old)}x)"
    s = s.replace(old, new)

open(F, "w", encoding="utf-8").write(s)
print("centroids added OK — now: npm run build && pm2 restart sustainit-live")
