#!/usr/bin/env python3
"""
Restrict the AgriPlot crop-type filter to Coffee only (the dummy dataset is all
coffee). Removes the Cocoa / Oil Palm / Rubber options from the dropdown.

Run from the sustainit project root (e.g. /var/www/sustainit):
    python3 /var/www/locanix.id/scripts/patch-agriplot-coffee-only.py
    npm run build && pm2 restart sustainit-live

Idempotent: detects the already-restricted state and does nothing.
"""
import sys

F = "client/src/pages/maps/agri-plot-map.tsx"
OLD = (
    '                                    <SelectItem value="cocoa">Cocoa</SelectItem>\n'
    '                                    <SelectItem value="coffee">Coffee</SelectItem>\n'
    '                                    <SelectItem value="oil_palm">Oil Palm</SelectItem>\n'
    '                                    <SelectItem value="rubber">Rubber</SelectItem>\n'
)
NEW = '                                    <SelectItem value="coffee">Coffee</SelectItem>\n'

try:
    s = open(F, encoding="utf-8").read()
except FileNotFoundError:
    sys.exit("ERROR: run from the sustainit project root (client/ must exist).")

if OLD not in s:
    if 'value="cocoa"' not in s and 'value="coffee"' in s:
        print("Already coffee-only — nothing to do.")
        sys.exit(0)
    sys.exit("ERROR: crop-option block not found as expected — send this to Claude.")

assert s.count(OLD) == 1, f"crop-option block not unique ({s.count(OLD)}x)"
open(F, "w", encoding="utf-8").write(s.replace(OLD, NEW))
print("crop filter restricted to Coffee only — now: npm run build && pm2 restart sustainit-live")
