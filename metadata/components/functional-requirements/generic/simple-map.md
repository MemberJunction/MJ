# SimpleMap Functional Requirements

## Data Input
- Accepts any array of objects with latitude/longitude fields
- Default field names: `__mj_Latitude`, `__mj_Longitude` (MJ geo virtual fields)
- Overridable via `latitudeField` / `longitudeField` props
- Gracefully skips records with null/missing coordinates

## Rendering Modes
- **Point Map** (default): Individual markers at each record's coordinates
  - Auto-fits map bounds to encompass all markers
  - Marker clustering when dense (via leaflet.markercluster)
  - Click marker to view popup with record summary
- **Choropleth**: Color regions by record count or metric
  - Group by country or state_province
  - Loads BoundaryGeoJSON from Country/StateProvince entities via utilities.rv.RunView()
  - Click region to emit records within that region
- **Heat Map**: Density visualization using lat/lng points
  - Good for large datasets (1000+ records)

## Interactivity
- Marker click → emits `onMarkerClick` with record data, coordinates
- Region click (choropleth) → emits `onRegionClick` with all records in region
- Map rendered → emits `onMapRendered` with marker count and bounds
- OpenEntityRecord integration when entityName + entityPrimaryKeys provided

## Entity Metadata Integration
- When `entityName` provided: uses `utilities.md.Entities` for smart field formatting in popups
- Auto-detects popup fields from entity metadata if `popupFields` not specified
- Primary key extraction for OpenEntityRecord callback

## Appearance
- Title rendered above map when provided
- Height configurable (default 400px)
- Clean marker icons with Leaflet defaults
- OSM tile layer (free, no API key)
