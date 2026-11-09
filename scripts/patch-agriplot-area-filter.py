#!/usr/bin/env python3
"""
Relax the /plots/search area filter from `area_hectares > 0.5` to `> 0` so real
smallholder plots (coffee/cocoa parcels well under 0.5 ha) still show on the map.

Run from the sustainit project root (e.g. /var/www/sustainit):
    python3 /var/www/locanix.id/scripts/patch-agriplot-area-filter.py
    npm run build && pm2 restart sustainit-live

Idempotent: detects the already-relaxed state and does nothing.
"""
import sys

F = "server/routes.ts"
OLD = "sql`sp.area_hectares > 0.5`"
NEW = "sql`sp.area_hectares > 0`"

try:
    s = open(F, encoding="utf-8").read()
except FileNotFoundError:
    sys.exit("ERROR: run from the sustainit project root (server/ must exist).")

if OLD not in s:
    if NEW in s:
        print("Already relaxed — nothing to do.")
        sys.exit(0)
    sys.exit("ERROR: neither the 0.5 nor the 0 area filter was found — "
             "run patch-agriplot-sustainit.py first, then re-run this.")

assert s.count(OLD) == 1, f"expected 1 area filter, found {s.count(OLD)}"
open(F, "w", encoding="utf-8").write(s.replace(OLD, NEW))
print("area filter relaxed to > 0 — now: npm run build && pm2 restart sustainit-live")
