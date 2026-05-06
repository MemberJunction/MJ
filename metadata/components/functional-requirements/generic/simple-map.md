# SimpleMap Functional Requirements

## Data Input
- Accepts any array of objects with latitude/longitude fields
- Default field names: `__mj_Latitude`, `__mj_Longitude` (MJ geo virtual fields)
- Overridable via `latitudeField` / `longitudeField` props
- Gracefully skips records with null/missing coordinates
- Supports both BaseEntity objects (with .Get()) and plain JavaScript objects

## Rendering Modes
- **Point Map** (default): Individual markers at each record's coordinates
  - Auto-fits map bounds to encompass all markers
  - Marker clustering via L.markerClusterGroup when available and enabled
  - Click marker popup link to open entity record via callbacks.OpenEntityRecord
- **Heatmap**: Density visualization using spatial clustering
  - Groups nearby records within configurable lat/lng radius (default 2.0 degrees)
  - Renders colored circle markers sized and shaded by cluster density
  - Larger/more opaque circles where records cluster together
  - Click a cluster bubble to see matching records in a popup
- **Choropleth / Regions**: Shaded geographic regions using GeoJSON boundaries
  - Groups records by country field (configurable via `countryField` prop)
  - Loads Country boundary data from MJ: Countries entity via utilities.rv.RunView
  - FindCountryMatch logic matches free-text country names via Name, ISO2, and CommonAliases
  - Renders shaded L.geoJSON polygons for countries with boundary data
  - Falls back to colored circle markers for countries without GeoJSON boundaries
  - Falls back to spatial clustering if boundary loading fails entirely
- **Boundary**: Renders one GeoJSON polygon per record from a field on the record itself
  - Set `renderMode="boundary"` and `boundaryField="FieldName"` (e.g. `"BoundaryGeoJSON"`)
  - Each record's GeoJSON is read from the named field and drawn as a colored polygon
  - Cycling color palette distinguishes adjacent regions
  - Hover highlights the polygon and shows the record name as a tooltip
  - Click fires onMarkerClick with the record (same as point mode)
  - Records without boundary data fall back to a centroid circle marker using lat/lng fields
  - Auto-fits map bounds to all rendered polygons
  - Ideal for visualizing entity data that carries its own geographic boundaries (e.g. states, counties, districts, sales territories)

## Interactivity
- **Clickable popup cards**: Show first N records as clickable blue links, "and X more..." for overflow
  - Record clicks call callbacks.OpenEntityRecord with entity name and primary key pairs
  - maxPopupRecords controls how many records show before overflow text
- Marker click / popup link click → calls callbacks.OpenEntityRecord
- Region click (choropleth) → emits onRegionClick with all records in region
- Map rendered → emits onMapRendered with marker count and bounds

## Entity Metadata Integration
- When `entityName` provided: uses `utilities.md.Entities` for smart name field detection in popups
- Auto-detects record name from entity NameField metadata
- Primary key extraction for OpenEntityRecord callback via entityPrimaryKeys

## Deferred Initialization
- IntersectionObserver defers Leaflet map initialization until container is visible
- Prevents wasted resources when map is in a hidden tab or below the fold
- Handles re-visibility by invalidating map size and rendering pending changes

## Appearance
- Title rendered above map when provided
- Height configurable (default 400px)
- Compact attribution (copyright OSM, not the full Leaflet attribution text)
- Toolbar with mode toggle buttons and marker/location count
- Loading indicator while map initializes
- Clean marker icons with Leaflet defaults
- OSM tile layer (free, no API key)
