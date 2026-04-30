# SimpleMap Technical Design

## Architecture
Single React function component using Leaflet for map rendering. No framework dependencies beyond React (provided by runtime) and Leaflet (declared in libraries). Mirrors all features of the Angular ng-map-view component.

## Dependencies
- **Leaflet 1.9.4**: Map rendering, tile layers, markers, GeoJSON, circleMarker
- **leaflet.markercluster** (optional): Used in point mode when available via L.markerClusterGroup
- Access via `globalVariable: "L"` declared in spec

## State Management
- `mapRef` (ref): Leaflet map instance
- `markerLayerRef` (ref): LayerGroup for all render layers, cleared on mode/data change
- `observerRef` (ref): IntersectionObserver for deferred initialization
- `pendingRenderRef` (ref): Flag for pending render when map becomes visible
- `countryCacheRef` (ref): Cached MJ: Countries data to avoid repeated RunView calls
- `renderMode` (state): Current visualization mode (point/heatmap/choropleth)
- `markerCount` (state): Count of records with valid coordinates
- `isLoading` (state): Loading indicator during map initialization
- `error` (state): Error message if initialization fails

## Data Processing
- Records with null/NaN coordinates are filtered out early
- BaseEntity objects supported via getField() helper that checks for .Get() method
- Record names auto-detected from entity NameField metadata

## Spatial Clustering Algorithm
Used by heatmap mode and choropleth fallback. Groups nearby records within a configurable lat/lng radius (default 2 degrees / ~200km):
1. Iterate records in order
2. For each unassigned record, create a new cluster with it as seed
3. Find all unassigned neighbors within radius (Manhattan distance on lat/lng)
4. Compute cluster center as mean of member coordinates
5. Return array of { centerLat, centerLng, records[] }

## Country Matching (FindCountryMatch)
Matches free-text country names from record data to MJ: Countries reference data:
1. Direct Name match (case-insensitive)
2. ISO2 code match (case-insensitive)
3. CommonAliases JSON array match (case-insensitive)
Returns first match or null.

## Render Modes

### Point Mode
- Creates L.marker for each record with valid coordinates
- Uses L.markerClusterGroup when available and clusterMarkers=true
- Each marker gets a popup with clickable record name link
- Auto-fits bounds with 30px padding, maxZoom 12

### Heatmap Mode
- Runs spatial clustering on all records with coordinates
- Renders L.circleMarker for each cluster
- Radius: min(12 + count*5, 40), opacity: min(0.3 + count*0.08, 0.85)
- Colors: red (#e74c3c fill, #c0392b stroke)
- Cluster popup shows first N records as clickable links

### Choropleth Mode
- Groups records by countryField (default 'Country')
- Loads MJ: Countries via utilities.rv.RunView (cached after first load)
- For each country group: match to reference data, render L.geoJSON polygon if boundary available
- Falls back to L.circleMarker for countries without GeoJSON
- Falls back entirely to spatial clustering if RunView fails
- 15-color palette cycles for region distinction

### Boundary Mode
- Renders one GeoJSON polygon per record — no grouping, no external data loading
- Reads GeoJSON from `config.boundaryField` (e.g. `"BoundaryGeoJSON"`) on each record
- Each polygon gets a cycling color from the 15-color palette
- Hover: increases fillOpacity + weight, calls bringToFront, resets on mouseout
- Tooltip: record name (via getRecordName) bound with `sticky: true`
- Click: fires `onMarkerClick` with the individual record (not onRegionClick)
- Fallback: records without boundary data render as L.circleMarker at lat/lng centroid
- Auto-fits bounds from all rendered polygon extents
- Use case: entities carrying their own GeoJSON boundaries (states, counties, districts, territories)

## Popup System
- All popups use BuildClusterPopup pattern: title, HR divider, up to maxPopupRecords clickable links, overflow text
- Click handlers attached via map 'popupopen' event using class selector '.mj-map-popup-record'
- data-record-id attribute carries composite primary key for OpenEntityRecord callback

## IntersectionObserver Deferred Init
- Observer watches container div with 0.1 threshold
- First intersection: calls initializeMap()
- Subsequent intersections: invalidateSize() + render pending changes
- Fallback: init immediately if IntersectionObserver not available
- Cleanup: disconnect observer and remove map on unmount

## Map Initialization
1. Create L.map with compact attribution (prefix: false)
2. Add OSM tile layer with abbreviated attribution
3. Create markerLayer (L.layerGroup)
4. Setup popup click handler for record drill-through
5. invalidateSize after 100ms, render markers
6. Double-invalidate after 500ms to fix partial tile rendering

## Performance
- Records with null coordinates are filtered out early
- Country data cached in ref to avoid repeated RunView calls
- IntersectionObserver prevents initialization of hidden maps
- Bounds computation is O(n) single pass
- Leaflet handles DOM-efficient marker rendering internally
- Choropleth GeoJSON loaded lazily on mode switch only
