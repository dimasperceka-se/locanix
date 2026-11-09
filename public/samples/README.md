# Sample GeoJSON files

Drop any of these into **Add plot data → Upload file** to exercise the flow.
(When the dev server is running they're also served at `/samples/<file>`.)

## Flow test scenarios (v1.1 quota/area logic)

| File | Polygons | Total area | Flow it triggers |
| --- | --- | --- | --- |
| `single_small_under2ha.geojson` | 1 | ~1.22 ha | Single **< 2 ha** → **no survey** → Excel report. Consumes free quota. |
| `single_large_over2ha.geojson` | 1 | ~5.96 ha | Single **> 2 ha** → **plot survey required** → Excel report. |
| `bulk_4plots.geojson` | 4 | ~3.99 ha | **Bulk** (>1) → **plot survey required** (while free quota remains) → Excel report. |

Rules: free quota = **2 ha cumulative**. Once used up, uploading again shows the
**payment** notification. **Paid** users skip the gates and get the **dashboard + Excel export**.

## Other samples

| File | Purpose |
| --- | --- |
| `single_plot.geojson` | One plot (~1.88 ha), North Sumatra. |
| `kebun_sawit_riau.geojson` | 3 plots (~242 ha), Riau — bulk. |
| `invalid_selfintersection.geojson` | "Bowtie" polygon → trips the **geometry-failed** popup. |

All coordinates are `[lon, lat]` in EPSG:4326 (WGS84), the GeoJSON standard.
