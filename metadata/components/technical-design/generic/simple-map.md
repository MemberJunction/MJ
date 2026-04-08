# SimpleMap Technical Design

## Architecture
Single React function component using Leaflet for map rendering. No framework dependencies beyond React (provided by runtime) and Leaflet (declared in libraries).

## Dependencies
- **Leaflet 1.9.4**: Map rendering, tile layers, markers, GeoJSON
- Access via `globalVariable: "L"` declared in spec

## State Management
- `mapInstance` (ref): Leaflet map instance, managed via canvasRef
- `markerLayer` (ref): LayerGroup for markers, cleared and re-populated on data change
- `renderMode` (state): Current visualization mode (point/choropleth/heatmap)
- `selectedMarker` (state): Currently highlighted marker for click feedback

## Data Processing Pipeline (React.useMemo)
1. Filter records with valid lat/lng values
2. Extract coordinates and associated record data
3. Compute bounds for auto-fit
4. Create marker configs with popup content
5. Return processed data for rendering

## Map Lifecycle
1. **Mount**: Create Leaflet map in container div, add OSM tile layer
2. **Data change**: Clear existing markers, create new ones from processed data, fit bounds
3. **Mode change**: Switch between point/choropleth/heatmap rendering
4. **Unmount**: Destroy Leaflet map instance to prevent memory leaks

## Popup Content Generation
- When `entityName` provided: look up entity metadata, use NameField + key fields
- When `popupFields` provided: render those specific fields
- Fallback: show first 3-4 non-null fields from the record

## OpenEntityRecord Integration
When `entityName` and `entityPrimaryKeys` provided, marker click calls:
```javascript
callbacks.OpenEntityRecord(entityName, entityPrimaryKeys.map(k => ({
    FieldName: k,
    Value: record[k]
})))
```

## Performance
- Records with null coordinates are filtered out early (no DOM overhead)
- Bounds computation is O(n) single pass
- Leaflet handles DOM-efficient marker rendering internally
- Choropleth GeoJSON loaded lazily on mode switch only
