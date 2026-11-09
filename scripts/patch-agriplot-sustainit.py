#!/usr/bin/env python3
"""
Patch the SUSTAINIT dev app (branch: development) for the dummy AgriPlot flow.

Run from the sustainit project root (e.g. /var/www/sustainit):
    python3 /var/www/locanix.id/scripts/patch-agriplot-sustainit.py
    npm run build && pm2 restart sustainit-live

Idempotent: re-runs detect the already-patched state and do nothing.
Changes:
  server/routes.ts (/plots/search)
    - drop the hard is_deforestation=0 / is_protected_areas=0 / is_not_valid=0
      filters so flagged plots still show
    - add optional Deforestation / Land Legality / Polygon Validity filters
    - return the three flags in each feature's properties
  client/src/pages/maps/agri-plot-map.tsx
    - remove the "Radius (km)" field
    - remove the Administrative Boundary layer (overlay + toggle + fetch + import)
    - fix the Plot Search card so Layer Info expands inside it (scrolls, no spill)
    - send the three filter values; show the flags in the plot popup
"""
import sys

ROUTES = "server/routes.ts"
AGRI = "client/src/pages/maps/agri-plot-map.tsx"


def already_patched() -> bool:
    try:
        rt = open(ROUTES, encoding="utf-8").read()
        ap = open(AGRI, encoding="utf-8").read()
    except FileNotFoundError:
        sys.exit("ERROR: run this from the sustainit project root (server/ and client/ must exist).")
    return "polygonValidity } = req.body" in rt and "max-h-[85vh]" in ap


def patch(path, edits):
    s = open(path, encoding="utf-8").read()
    for i, (old, new) in enumerate(edits, 1):
        assert old in s, f"[{path}] edit #{i} PATTERN NOT FOUND — send this message to Claude"
        assert s.count(old) == 1, f"[{path}] edit #{i} pattern not unique ({s.count(old)}x)"
        s = s.replace(old, new)
    open(path, "w", encoding="utf-8").write(s)
    print(f"OK  {path}  ({len(edits)} edits)")


if already_patched():
    print("Already patched — nothing to do.")
    sys.exit(0)

patch(ROUTES, [
(
'''    const { country, province, district, cropType, plotId, latitude, longitude, umlId, radius } = req.body;

    try {
      const conditions = [
        sql`sp.polygon IS NOT NULL`,
        sql`NOT ST_IsEmpty(sp.polygon)`,
        sql`sp.area_hectares > 0.5`,
        sql`sp.is_not_valid = 0`,
        sql`sp.is_deforestation = 0`,
        sql`sp.is_protected_areas = 0`,
      ];''',
'''    const { country, province, district, cropType, plotId, latitude, longitude, umlId, radius, deforestation, landLegality, polygonValidity } = req.body;

    try {
      const conditions = [
        sql`sp.polygon IS NOT NULL`,
        sql`NOT ST_IsEmpty(sp.polygon)`,
        sql`sp.area_hectares > 0.5`,
      ];

      // Optional flag filters (dummy dataset carries these flags)
      if (deforestation === "no_deforestation") conditions.push(sql`sp.is_deforestation = 0`);
      else if (deforestation === "deforestation_detected") conditions.push(sql`sp.is_deforestation = 1`);
      if (landLegality === "outside_protected") conditions.push(sql`sp.is_protected_areas = 0`);
      else if (landLegality === "inside_protected") conditions.push(sql`sp.is_protected_areas = 1`);
      if (polygonValidity === "valid") conditions.push(sql`sp.is_not_valid = 0`);
      else if (polygonValidity === "invalid") conditions.push(sql`sp.is_not_valid = 1`);'''
),
(
'''          sp.crop_type,
          sp.area_hectares,
          ST_AsGeoJSON(sp.polygon) AS geometry''',
'''          sp.crop_type,
          sp.area_hectares,
          sp.is_deforestation,
          sp.is_protected_areas,
          sp.is_not_valid,
          ST_AsGeoJSON(sp.polygon) AS geometry'''
),
(
'''          crop_type: row.crop_type,
          area_hectares: row.area_hectares,
        },''',
'''          crop_type: row.crop_type,
          area_hectares: row.area_hectares,
          is_deforestation: row.is_deforestation,
          is_protected_areas: row.is_protected_areas,
          is_not_valid: row.is_not_valid,
        },'''
),
])

patch(AGRI, [
('import AdminBoundaryLayer from "./layers/AdminBoundaryLayer";\n', ''),
(
'''            if (!cropType.trim()) {
                toast({
                    title: "Invalid crop type",
                    description: "Crop type must be selected",
                    variant: "destructive",
                });
                return;
            }

''', ''
),
(
'''                    {adminGeojson && showAdminBoundary && (
                        <AdminBoundaryLayer data={adminGeojson} />
                    )}
''', ''
),
(
'''                                        <b>Area:</b> ${feature.properties.area_hectares} ha
                                    `);''',
'''                                        <b>Area:</b> ${feature.properties.area_hectares} ha<br/>
                                        <b>Deforestation:</b> ${feature.properties.is_deforestation ? "Detected" : "No Deforestation"}<br/>
                                        <b>Land Legality:</b> ${feature.properties.is_protected_areas ? "Inside Protected Area" : "Outside Protected Area"}<br/>
                                        <b>Polygon Validity:</b> ${feature.properties.is_not_valid ? "Invalid" : "Valid"}
                                    `);'''
),
(
'body: JSON.stringify({ country, province, district, cropType, plotId, latitude, longitude, umlId, radius }),',
'body: JSON.stringify({ country, province, district, cropType, plotId, latitude, longitude, umlId, radius, deforestation, landLegality, polygonValidity }),'
),
(
'''            const data = await res.json();
            setGeojson(data);

            // --- ADMIN BOUNDARY ---
            const resAdmin = await fetch("/api/admin-boundary", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ country, province, district }),
                signal: controller.signal,
            });

            const dataAdmin = await resAdmin.json();
            setAdminGeojson(dataAdmin);''',
'''            const data = await res.json();
            setGeojson(data);'''
),
(
'''                            <Input
                                type="number"
                                placeholder="Radius (km)"
                                min={0}
                                step={0.1}
                                value={radius}
                                onChange={(e) =>
                                    setRadius(e.target.value === "" ? "" : Number(e.target.value))
                                }
                            />

''', ''
),
(
'                        open ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0"',
'                        open ? "max-h-[85vh] opacity-100 overflow-y-auto" : "max-h-0 opacity-0 overflow-hidden"'
),
(
'                        <CardContent className="space-y-4 overflow-y-auto max-h-[460px] pr-2">',
'                        <CardContent className="space-y-4 pr-2">'
),
(
'''                                        <div className="flex items-center justify-between">
                                            <span
                                                className="h-3 w-3 rounded-sm"
                                                style={{ backgroundColor: '#d95f0e' }}
                                            ></span>
                                            <span className="text-sm text-muted-foreground flex-1 ml-2">
                                                Administrative Boundary
                                            </span>
                                            <span className="font-semibold text-sm flex items-center gap-2 transition-all">
                                                <Switch
                                                    disabled={!adminGeojson}
                                                    checked={showAdminBoundary}
                                                    onCheckedChange={setShowAdminBoundary}
                                                />
                                            </span>
                                        </div>
''', ''
),
])

print("ALL PATCHES APPLIED — now: npm run build && pm2 restart sustainit-live")
