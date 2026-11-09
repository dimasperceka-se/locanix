# Contoh Payload & Output API

Dokumen ini berisi contoh payload (GeoJSON file) dan contoh output untuk endpoint berikut:
- /api/v1/deforestation
- /api/v1/protected-area
- /api/v1/validate-geometry
- /api/v1/rainfall
- /api/v1/ghg-emission

Catatan:
- Semua endpoint di atas menerima upload file GeoJSON via multipart/form-data pada field bernama file.
- Contoh output di bawah ini bersifat representatif sesuai skema respon router yang ada.

---

## 1) Deforestation — /api/v1/deforestation

### Contoh curl
```bash
curl -X POST "http://localhost:8000/api/v1/deforestation" \
  -F "file=@sample_deforestation.geojson"
```

### Contoh payload (sample_deforestation.geojson)
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "plot_id": "PLOT-001",
        "name": "Lahan Sawit A"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [106.8, -6.2],
            [106.81, -6.2],
            [106.81, -6.21],
            [106.8, -6.21],
            [106.8, -6.2]
          ]
        ]
      }
    }
  ]
}
```

### Contoh output
```json
{
  "status": "success",
  "message": "Deforestation analysis completed",
  "file_info": {
    "filename": "sample_deforestation.geojson",
    "size_mb": 0.01,
    "features_count": 1
  },
  "analysis_summary": {
    "total_processed": 1,
    "high_risk": 1,
    "low_risk": 0,
    "parallel_processing": true,
    "processing_time_seconds": 2.35
  },
  "data": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": {
          "plot_id": "PLOT-001",
          "name": "Lahan Sawit A",
          "risk_level": "High",
          "gfw_loss_area_ha": 1.25,
          "jrc_loss_area_ha": 0.8,
          "sbtn_loss_area_ha": 0.4,
          "gfw_loss_percent": 2.1,
          "jrc_loss_percent": 1.4,
          "sbtn_loss_percent": 0.7
        },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [106.8, -6.2],
              [106.81, -6.2],
              [106.81, -6.21],
              [106.8, -6.21],
              [106.8, -6.2]
            ]
          ]
        }
      }
    ]
  }
}
```

---

## 2) Protected area — /api/v1/protected-area

### Contoh curl
```bash
curl -X POST "http://localhost:8000/api/v1/protected-area" \
  -F "file=@sample_protected.geojson"
```

### Contoh payload (sample_protected.geojson)
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "plot_id": "PLOT-002",
        "name": "Area Konservasi"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [110.4, -7.8],
            [110.41, -7.8],
            [110.41, -7.81],
            [110.4, -7.81],
            [110.4, -7.8]
          ]
        ]
      }
    }
  ]
}
```

### Contoh output
```json
{
  "status": "success",
  "message": "Protected area analysis completed",
  "file_info": {
    "filename": "sample_protected.geojson",
    "size_mb": 0.01,
    "features_count": 1
  },
  "analysis_summary": {
    "total_processed": 1,
    "compliant": 0,
    "indicative": 1,
    "non_compliant": 0,
    "errors": 0,
    "parallel_processing": true,
    "processing_time_seconds": 3.12
  },
  "data": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": {
          "plot_id": "PLOT-002",
          "name": "Area Konservasi",
          "wdpa_status": "indicative",
          "wdpa_categories": ["V", "VI"],
          "analysis_timestamp": "2026-06-15T12:00:00Z"
        },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [110.4, -7.8],
              [110.41, -7.8],
              [110.41, -7.81],
              [110.4, -7.81],
              [110.4, -7.8]
            ]
          ]
        }
      }
    ]
  }
}
```

---

## 3) Check geometry — /api/v1/validate-geometry

### Contoh curl
```bash
curl -X POST "http://localhost:8000/api/v1/validate-geometry" \
  -F "file=@sample_geometry.geojson"
```

### Contoh payload (sample_geometry.geojson)
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "plot_id": "PLOT-003"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [100.0, 0.0],
            [100.1, 0.0],
            [100.1, 0.1],
            [100.0, 0.1],
            [100.0, 0.0]
          ]
        ]
      }
    }
  ]
}
```

### Contoh output
```json
{
  "status": "success",
  "message": "Geometry validation completed",
  "file_info": {
    "filename": "sample_geometry.geojson",
    "size_mb": 0.01,
    "features_count": 1
  },
  "analysis_summary": {
    "total_processed": 1,
    "valid": 1,
    "invalid": 0,
    "errors": 0,
    "processing_time_seconds": 0.04
  },
  "data": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": {
          "plot_id": "PLOT-003",
          "validation_status": "valid",
          "is_valid": true,
          "self_intersection": false,
          "duplicate_vertices": false,
          "zero_area": false,
          "not_ring": false,
          "issues": [],
          "area_sqm": 1000000.0
        },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [100.0, 0.0],
              [100.1, 0.0],
              [100.1, 0.1],
              [100.0, 0.1],
              [100.0, 0.0]
            ]
          ]
        }
      }
    ]
  }
}
```

---

## 4) Rainfall — /api/v1/rainfall

### Contoh curl
```bash
curl -X POST "http://localhost:8000/api/v1/rainfall" \
  -F "file=@sample_rainfall.geojson"
```

### Contoh payload (sample_rainfall.geojson)
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "plot_id": "PLOT-004"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [112.0, -2.0],
            [112.01, -2.0],
            [112.01, -2.01],
            [112.0, -2.01],
            [112.0, -2.0]
          ]
        ]
      }
    }
  ]
}
```

### Contoh output
```json
{
  "status": "success",
  "message": "Rainfall analysis completed",
  "file_info": {
    "filename": "sample_rainfall.geojson",
    "size_mb": 0.01,
    "features_count": 1
  },
  "analysis_summary": {
    "total_processed": 1,
    "average_rainfall_mm": 452.3,
    "parallel_processing": true,
    "processing_time_seconds": 4.11
  },
  "data": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": {
          "plot_id": "PLOT-004",
          "rainfall_mean_mm": 452.3,
          "rainfall_min_mm": 410.1,
          "rainfall_max_mm": 490.2,
          "rainfall_std_mm": 18.4,
          "area_hectares": 10.2,
          "analysis_period": {
            "start_date": "2023-10-01",
            "end_date": "2024-01-31"
          },
          "analysis_timestamp": "2026-06-15T12:00:00Z"
        },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [112.0, -2.0],
              [112.01, -2.0],
              [112.01, -2.01],
              [112.0, -2.01],
              [112.0, -2.0]
            ]
          ]
        }
      }
    ]
  }
}
```

---

## 5) GHG emission — /api/v1/ghg-emission

### Contoh curl
```bash
curl -X POST "http://localhost:8000/api/v1/ghg-emission" \
  -F "file=@sample_ghg.geojson"
```

### Contoh payload (sample_ghg.geojson)
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "plot_id": "PLOT-005",
        "forest_type": "Secondary Forest"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [108.0, -2.0],
            [108.01, -2.0],
            [108.01, -2.01],
            [108.0, -2.01],
            [108.0, -2.0]
          ]
        ]
      }
    }
  ]
}
```

### Contoh output
```json
{
  "status": "success",
  "message": "GHG emission from deforestation analysis completed",
  "file_info": {
    "filename": "sample_ghg.geojson",
    "size_mb": 0.01,
    "features_count": 1
  },
  "analysis_summary": {
    "total_processed": 1,
    "high_risk": 1,
    "low_risk": 0,
    "total_deforestation_area_ha": 2.35,
    "total_net_emission_tco2e": 1280.4,
    "datasets": {
      "gfw": {
        "total_area_ha": 1.2,
        "total_emission_tco2e": 540.2
      },
      "jrc": {
        "total_area_ha": 0.8,
        "total_emission_tco2e": 420.1
      },
      "sbtn": {
        "total_area_ha": 0.35,
        "total_emission_tco2e": 320.1
      }
    },
    "parallel_processing": true,
    "processing_time_seconds": 5.21
  },
  "data": {
    "type": "FeatureCollection",
    "features": [
      {
        "type": "Feature",
        "properties": {
          "plot_id": "PLOT-005",
          "forest_type": "Secondary Forest",
          "gfw_loss_area_ha": 1.2,
          "jrc_loss_area_ha": 0.8,
          "sbtn_loss_area_ha": 0.35,
          "risk_level": "High",
          "gfw_ghg_emission": {
            "area_hectares": 1.2,
            "forest_type": "Secondary Forest",
            "net_emission_tco2e": 540.2
          },
          "jrc_ghg_emission": {
            "area_hectares": 0.8,
            "forest_type": "Secondary Forest",
            "net_emission_tco2e": 420.1
          },
          "sbtn_ghg_emission": {
            "area_hectares": 0.35,
            "forest_type": "Secondary Forest",
            "net_emission_tco2e": 320.1
          },
          "total_net_emission_tco2e": 1280.4
        },
        "geometry": {
          "type": "Polygon",
          "coordinates": [
            [
              [108.0, -2.0],
              [108.01, -2.0],
              [108.01, -2.01],
              [108.0, -2.01],
              [108.0, -2.0]
            ]
          ]
        }
      }
    ]
  }
}
```
