#!/usr/bin/env python3
"""
Re-skin the AgriPlot plot popup into a modern, theme-colored card.
Run from the sustainit project root (e.g. /var/www/sustainit):
    python3 /var/www/locanix.id/scripts/patch-agriplot-popup.py
    npm run build && pm2 restart sustainit-live

Robust + idempotent: replaces the whole `layer.bindPopup(`...`)` call regardless
of its current contents (works before or after other patches, re-run safe).
"""
import re
import sys

F = "client/src/pages/maps/agri-plot-map.tsx"
try:
    s = open(F, encoding="utf-8").read()
except FileNotFoundError:
    sys.exit("ERROR: run from the sustainit project root (client/ must exist).")

NEW = r"""layer.bindPopup(`
                                        <div style="font-family:Inter,system-ui,sans-serif;min-width:230px">
                                          <div style="background:#14532d;color:#fff;padding:10px 14px;border-radius:10px 10px 0 0;font-weight:700;font-size:13px">${feature.properties.plot_id}</div>
                                          <div style="padding:12px 14px;display:grid;gap:6px;font-size:12.5px">
                                            <div style="display:flex;justify-content:space-between;gap:12px"><span style="color:#64748b">Owner</span><b style="color:#0f172a">${feature.properties.respondent_status}</b></div>
                                            <div style="display:flex;justify-content:space-between;gap:12px"><span style="color:#64748b">Crop</span><b style="color:#0f172a;text-transform:capitalize">${feature.properties.crop_type}</b></div>
                                            <div style="display:flex;justify-content:space-between;gap:12px"><span style="color:#64748b">Area</span><b style="color:#0f172a">${feature.properties.area_hectares} ha</b></div>
                                            <div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">
                                              ${feature.properties.is_deforestation ? '<span style="background:#fee2e2;color:#b91c1c;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600">Deforestation detected</span>' : '<span style="background:#dcfce7;color:#15803d;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600">No deforestation</span>'}
                                              ${feature.properties.is_protected_areas ? '<span style="background:#fef3c7;color:#b45309;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600">Inside protected area</span>' : '<span style="background:#dcfce7;color:#15803d;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600">Outside protected area</span>'}
                                              ${feature.properties.is_not_valid ? '<span style="background:#fee2e2;color:#b91c1c;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600">Invalid geometry</span>' : '<span style="background:#dbeafe;color:#1d4ed8;padding:3px 9px;border-radius:999px;font-size:11px;font-weight:600">Valid polygon</span>'}
                                            </div>
                                          </div>
                                        </div>
                                    `);"""

new_s, n = re.subn(r"layer\.bindPopup\(`.*?`\);", lambda _m: NEW, s, count=1, flags=re.DOTALL)
if n != 1:
    sys.exit(f"ERROR: expected 1 bindPopup(...) call, found {n} — send this to Claude.")
open(F, "w", encoding="utf-8").write(new_s)
print("popup re-skinned OK — now: npm run build && pm2 restart sustainit-live")
