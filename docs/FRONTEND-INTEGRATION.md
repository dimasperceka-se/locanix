# Locanix — Panduan Integrasi Frontend dengan Analysis API

Backend analisis EUDR sudah **live** dan memenuhi kontrak di
[`ANALYSIS-API-SPEC.md`](ANALYSIS-API-SPEC.md). Frontend (Next.js) bisa langsung
memakainya **tanpa mengubah kode** — cukup set satu env variable.

| | |
|---|---|
| **Base URL** | `https://api.averos.land` |
| **Endpoint** | `POST /api/v1/{validate-geometry, deforestation, protected-area, rainfall, ghg-emission}` |
| **Health check** | `GET https://api.averos.land/health` → `{"status": "healthy", ...}` |
| **Status** | Kelima endpoint sudah dites live (HTTP 200, `plot_id` & urutan sesuai input) |

---

## Daftar isi

1. [Setup](#1-setup)
2. [Request](#2-request)
3. [Response](#3-response)
4. [Field per endpoint](#4-field-per-endpoint)
5. [Error](#5-error)
6. [Hal yang perlu ditangani di UI](#6-hal-yang-perlu-ditangani-di-ui)
7. [Perubahan dibanding backend lama](#7-perubahan-dibanding-backend-lama)
8. [Cara test](#8-cara-test)
9. [Performa](#9-performa)
10. [Keamanan (rencana)](#10-keamanan-rencana)

---

## 1. Setup

Di env **server** Next.js (bukan `NEXT_PUBLIC_*`):

```env
ANALYSIS_API_BASE=https://api.averos.land
```

- Isi root saja, tanpa `/api/v1` dan tanpa trailing slash — proxy
  `app/api/analysis/[type]/route.ts` yang menambahkan `/api/v1/{type}`.
- Restart app Next.js setelah mengubah env.
- API dipanggil server-to-server lewat proxy, jadi tidak ada urusan CORS.

---

## 2. Request

```
POST https://api.averos.land/api/v1/{type}
Content-Type: multipart/form-data
```

| Field form | Isi |
|---|---|
| `file` | GeoJSON `FeatureCollection` (filename & content-type bebas, mis. `plots.geojson`, `application/geo+json`) |

Batasan:

| | Batas | Jika dilanggar |
|---|---|---|
| Jumlah feature | 1 – 1000 | `400` (0 feature) / `413` (> 1000) |
| Ukuran file | 100 MB | `413` |
| Geometry (endpoint analisis) | `Polygon` / `MultiPolygon`, ring tertutup, koordinat `[lon, lat]` valid | `422`, pesan menyebut `plot_id` yang bermasalah |
| Geometry (`validate-geometry`) | apa saja — polygon rusak tetap dijawab dengan flag | tidak error |

`properties` input (`plot_id`, `name`, dll.) dikembalikan apa adanya. Koordinat
dengan altitude (`[lon, lat, z]`) diterima.

---

## 3. Response

HTTP `200`, `Content-Type: application/json`. Frontend cukup membaca
`data.features`:

```json
{
  "status": "success",
  "message": "Deforestation analysis completed",
  "file_info": { "filename": "plots.geojson", "size_mb": 0.0, "features_count": 5 },
  "analysis_summary": { "total_processed": 5, "high_risk": 2, "low_risk": 3, "processing_time_seconds": 1.72 },
  "data": {
    "type": "FeatureCollection",
    "features": [
      { "type": "Feature", "geometry": { "...": "geometry input, tidak diubah" }, "properties": { "plot_id": "plot-0", "...": "..." } }
    ]
  },
  "metadata": { "api_version": "2.0.0", "...": "..." }
}
```

Jaminan backend:

- **Satu feature output per feature input, urutan sama.** Tidak ada plot yang
  di-skip.
- **`plot_id` dan `name` dari input dikembalikan**, jadi pencocokan berdasarkan
  `plot_id` di `lib/analysisClient.ts` langsung jalan (fallback urutan tetap aman).
- `geometry` = geometry input, tidak diubah.
- Field di luar tabel bagian 4 (`status`, `file_info`, `analysis_summary`,
  `metadata`, dan field tambahan di `properties`) boleh diabaikan.

---

## 4. Field per endpoint

Semua contoh di bawah adalah **output asli** dari `https://api.averos.land`.

### 4.1 `validate-geometry` — Geometry Checker

Tidak memakai Earth Engine dan tidak memotong kuota.

| Field | Tipe | Keterangan |
|---|---|---|
| `area_sqm` | number | luas geodesik (WGS84) dalam **m²** |
| `zero_area` | bool | luas < 1 m² atau polygon datar (titik segaris) |
| `self_intersection` | bool | garis batas saling memotong |
| `not_ring` | bool | ring tidak tertutup, < 4 titik, **atau** koordinat rusak / di luar rentang lon-lat (mis. lat-lon tertukar) |
| `duplicate_vertices` | bool | ada titik yang berulang (selain titik penutup) |
| `is_valid` | bool | tambahan: `true` jika tidak ada masalah sama sekali |
| `validation_status` | string | tambahan: `"valid"` / `"invalid"` |
| `issues` | string[] | tambahan: alasan dalam teks |

```json
{
  "plot_id": "plot-0", "name": "BENER-MERIAH-002",
  "area_sqm": 2993.96,
  "zero_area": false, "self_intersection": false, "not_ring": false, "duplicate_vertices": false,
  "is_valid": true, "validation_status": "valid", "issues": []
}
```

### 4.2 `deforestation` — Deforestation Analysis

Loss tutupan hutan **2021–2024** (setelah cutoff EUDR 31 Des 2020) dari GFW,
JRC, SBTN. Ada loss sekecil apa pun di salah satu dataset → `high`.

| Field | Tipe | Satuan |
|---|---|---|
| `overall_compliance.overall_risk` | `"high"` / `"low"` | — |
| `gfw_loss.gfw_loss_area`, `jrc_loss.jrc_loss_area`, `sbtn_loss.sbtn_loss_area` | number | **ha** |
| `gfw_loss.gfw_loss_percent`, `jrc_loss.jrc_loss_percent`, `sbtn_loss.sbtn_loss_percent` | number | **0–100** % luas plot |
| `*_loss.*_loss_year_compilation` | number / null | tambahan: tahun dengan loss terbesar |
| `total_area_hectares` | number | tambahan: luas plot (ha) |

Hanya format **bersarang** yang dikirim (format datar `risk_level`,
`gfw_loss_area_ha`, dst. tidak ada).

```json
{
  "plot_id": "plot-1", "name": "Riau loss A",
  "total_area_hectares": 8.97331232467409,
  "overall_compliance": {
    "overall_risk": "high", "compliance_status": "NON_COMPLIANT",
    "high_risk_datasets": ["GFW Forest Loss", "JRC Forest Loss", "SBTN Natural Lands Loss"],
    "total_high_risk_indicators": 3
  },
  "gfw_loss":  { "gfw_loss_stat": "high",  "gfw_loss_area": 7.7355123752249915,  "gfw_loss_percent": 86.20576321582504,  "gfw_loss_year_compilation": 2023 },
  "jrc_loss":  { "jrc_loss_stat": "high",  "jrc_loss_area": 5.613461314146754,   "jrc_loss_percent": 62.55729334987383,  "jrc_loss_year_compilation": 2022 },
  "sbtn_loss": { "sbtn_loss_stat": "high", "sbtn_loss_area": 7.914307358135147,  "sbtn_loss_percent": 88.19828254916551, "sbtn_loss_year_compilation": 2023 }
}
```

### 4.3 `protected-area` — Land Legality Analysis

Overlap dengan kawasan lindung **WDPA**.

| `wdpa_status` | Arti | UI |
|---|---|---|
| `"non_compliant"` | overlap kawasan lindung ketat (IUCN Ia, Ib, II, III, IV) | Non-Compliant |
| `"indicative"` | overlap kawasan lain (IUCN V, VI, Not Reported / Assigned / Applicable) | Review |
| `"compliant"` | tidak ada overlap | Compliant |

`wdpa_categories` (string[]): kategori IUCN kawasan yang overlap, `[]` jika
tidak ada. Satu plot bisa overlap beberapa kawasan sekaligus.

```json
{
  "plot_id": "plot-3", "name": "Ketambe, Gunung Leuser NP",
  "wdpa_status": "non_compliant",
  "wdpa_categories": ["Not Applicable", "II"]
}
```

### 4.4 `rainfall` — Rainfall

**Total curah hujan tahunan** (CHIRPS) untuk **tahun kalender terakhir yang
lengkap** — saat ini `2025-01-01` s/d `2025-12-31`. Tahun berganti otomatis
mulai bulan Maret.

| Field | Tipe | Satuan |
|---|---|---|
| `rainfall_mean_mm`, `rainfall_min_mm`, `rainfall_max_mm` | number / **null** | mm/tahun |
| `rainfall_std_mm` | number / **null** | mm ("±X mm") |
| `area_hectares` | number | ha |
| `analysis_period.start_date`, `analysis_period.end_date` | string | `YYYY-MM-DD` |

```json
{
  "plot_id": "plot-1", "name": "Riau loss A",
  "rainfall_mean_mm": 3584.18, "rainfall_min_mm": 3579.43, "rainfall_max_mm": 3588.96, "rainfall_std_mm": 2.16,
  "area_hectares": 8.9733,
  "analysis_period": { "start_date": "2025-01-01", "end_date": "2025-12-31" }
}
```

### 4.5 `ghg-emission` — GHG Emission

Emisi dari loss hutan yang ditemukan `deforestation`, per dataset.

| Field | Tipe | Satuan |
|---|---|---|
| `gfw_ghg_emission.area_hectares` (juga `jrc_`, `sbtn_`) | number | ha (= luas loss dataset itu) |
| `gfw_ghg_emission.net_emission_tco2e` (juga `jrc_`, `sbtn_`) | number | tCO₂e |
| `total_net_emission_tco2e` | number | tCO₂e = **nilai terbesar** dari GFW/JRC/SBTN |
| `forest_type` | string | tambahan: `"Secondary Forest"` (default) |

`total_net_emission_tco2e` sengaja **bukan jumlah** ketiganya: ketiga dataset
mengukur loss di area yang sama, jadi dijumlah akan terhitung ganda. Ini sama
dengan fallback yang sudah ada di frontend.

```json
{
  "plot_id": "plot-1", "name": "Riau loss A",
  "gfw_ghg_emission":  { "area_hectares": 7.7355, "net_emission_tco2e": 1926.1468, "...": "rincian gross/SOC/carbon stock" },
  "jrc_ghg_emission":  { "area_hectares": 5.6135, "net_emission_tco2e": 1397.755 },
  "sbtn_ghg_emission": { "area_hectares": 7.9143, "net_emission_tco2e": 1970.6669 },
  "total_net_emission_tco2e": 1970.6669,
  "forest_type": "Secondary Forest"
}
```

---

## 5. Error

Semua kegagalan = status **non-2xx** dengan body `{"detail": "<pesan>"}`.
Proxy Next.js meneruskannya ke browser, dan UI menandai analisis itu gagal
("Not analyzed yet") tanpa mengganggu analisis lain.

| Status | Kapan | Contoh `detail` |
|---|---|---|
| `400` | JSON / GeoJSON tidak valid, atau 0 feature | `Invalid JSON: ...`, `GeoJSON contains no features` |
| `413` | file > 100 MB atau > 1000 feature | `Too many features: 1001. Max: 1000` |
| `422` | ada plot dengan polygon rusak (endpoint analisis) | `Feature plot-1: Ring is not closed` |
| `502` | Earth Engine mengembalikan error | `Earth Engine error: Computation timed out.` |
| `503` | Earth Engine tidak bisa diinisialisasi | `Earth Engine not available: ...` |
| `500` | error lain di server | `Deforestation analysis failed: ...` |

Backend **tidak pernah** mengembalikan nilai default (0 / `"compliant"`) saat
gagal — kalau statusnya 200, angkanya hasil analisis sungguhan.

---

## 6. Hal yang perlu ditangani di UI

- **Rainfall bisa `null`.** CHIRPS hanya mencakup lintang 50°LS–50°LU. Plot di
  luar itu (mis. kayu dari Eropa utara) mendapat `null` → tampilkan "No data",
  jangan `NaN mm`.
- **Plot sangat kecil di rainfall:** `min = max = mean` dan `std = 0`. Ini wajar
  (resolusi data ~5 km), bukan error.
- **Angka tidak dibulatkan** di `deforestation` (mis. `86.20576321582504`) —
  format di UI. Rainfall dibulatkan 2 desimal, GHG 4 desimal.
- **`overall_risk: "high"` bisa muncul dengan loss sangat kecil** (mis. 0.001 ha
  di tepi plot) karena aturannya "loss > 0 → high". Format angka kecil dengan
  cukup desimal agar tidak tampil "High risk — 0 ha".
- **`wdpa_categories` bisa berisi nilai non-IUCN** seperti `"Not Applicable"`,
  `"Not Reported"`, `"Not Assigned"`.
- **Field `dataset`** di dalam `*_loss` hanya label internal — jangan
  ditampilkan.
- **Angka GHG** masih memakai parameter default (biomassa, carbon stock, dll.)
  dan perlu divalidasi metodologinya sebelum dipakai untuk pelaporan resmi.
  Sebaiknya UI memberi label "estimasi".

---

## 7. Perubahan dibanding backend lama

Kalau sebelumnya frontend sudah pernah memanggil backend lama, ini yang akan
terlihat berbeda:

| | Backend lama | Sekarang |
|---|---|---|
| Plot yang gagal | di-skip (jumlah output ≠ input) | selalu satu output per input, atau seluruh request error |
| Earth Engine error | HTTP 200 dengan angka 0 / `"compliant"` | HTTP 502 / 503 |
| `plot_id` | kadang `"unknown"` | selalu dari input |
| `wdpa_status` kawasan ketat | `"non-compliant"` (tanda hubung → UI salah menampilkan Compliant) | `"non_compliant"` |
| Luas loss deforestasi | salah hitung, maksimal ~0.09 ha | luas sebenarnya (ha) |
| GHG emission | selalu 0 | terhitung dari luas loss |
| Rainfall | Okt 2023 – Jan 2024 (4 bulan) | tahunan, tahun lengkap terakhir |
| Polygon tidak tertutup / < 4 titik | lolos sebagai valid | `not_ring: true` |
| `area_sqm` | perkiraan kasar (derajat × 111 km) | luas geodesik |

---

## 8. Cara test

Pakai file `test.geojson` dari bagian 8 `ANALYSIS-API-SPEC.md`, lalu:

```bash
BASE=https://api.averos.land
for t in validate-geometry deforestation protected-area rainfall ghg-emission; do
  echo "== $t"
  curl -sS -w "\nHTTP %{http_code} in %{time_total}s\n" \
    -F "file=@test.geojson;type=application/geo+json;filename=plots.geojson" \
    "$BASE/api/v1/$t"
done
```

Hasil yang diharapkan: HTTP 200, `data.features` berisi 2 feature dengan
`plot_id` `plot-0`, `plot-1` (urutan sama). Kedua plot contoh ini bersih:
`low`, `compliant`, emisi 0, curah hujan ~2.090 mm/tahun.

Swagger UI ada di `https://api.averos.land/docs`, tapi tombol "Try it out" saat
ini masih mengarah ke server lain — untuk test pakai curl di atas.

---

## 9. Performa

| Skenario | Waktu |
|---|---|
| 2 plot, per endpoint (live) | 0.7 – 4 detik |
| 5 plot, per endpoint (live) | 1.2 – 2.4 detik |
| 1000 plot × 4 endpoint paralel (test ke Earth Engine dari mesin lokal) | maks. 26.6 detik |

Batas timeout proxy 110 detik aman. Uji 1000 plot belum dijalankan di server
live, jadi jika batch besar mulai lambat, laporkan ke tim backend.

---

## 10. Keamanan (rencana)

Saat ini API terbuka tanpa auth (sesuai spec). Jika nanti ditambahkan header
`X-API-Key`, frontend perlu perubahan kecil di
`app/api/analysis/[type]/route.ts`: kirim header dari env server baru,
mis. `ANALYSIS_API_KEY`. Tim backend akan mengabari sebelum diaktifkan.
