## Geographic Infrastructure

MemberJunction includes built-in geocoding and proximity query infrastructure. When working with geo-enabled entities, these tools are available:

### Virtual Geo Fields

Entities with `SupportsGeoCoding = 1` have two virtual fields in their base view:
- `__mj_Latitude` (DECIMAL(10,6)) — geocoded latitude coordinate
- `__mj_Longitude` (DECIMAL(10,6)) — geocoded longitude coordinate

These fields are always present for geo-enabled entities. They come from either:
- Native lat/lng fields on the entity (aliased directly)
- A LEFT JOIN to the `RecordGeoCode` table (for entities without native coordinates)

### Proximity SQL Functions

**Distance calculation** — returns great-circle distance between two points:
```sql
__mj.fn_MJ_GeoDistance(lat1, lng1, lat2, lng2, unit)
-- unit: 'mi' (miles) or 'km' (kilometers)
-- Returns FLOAT distance, NULL if any input is NULL
```

**Radius query** — returns records within a radius of a center point:
```sql
__mj.fn_MJ_GeoRecordsNear(entityName, centerLat, centerLng, radius, unit)
-- entityName: Entity.Name (string, e.g., 'Organizations')
-- Returns rows with ID, RecordID, Latitude, Longitude, Distance columns
```

### Common Proximity Patterns

**Filter by distance:**
```sql
WHERE __mj.fn_MJ_GeoDistance(__mj_Latitude, __mj_Longitude, 41.8781, -87.6298, 'mi') <= 50
```

**Sort by distance from a point:**
```sql
ORDER BY __mj.fn_MJ_GeoDistance(__mj_Latitude, __mj_Longitude, 40.7128, -74.0060, 'mi')
```

**Add distance as a computed column:**
```sql
SELECT *, __mj.fn_MJ_GeoDistance(__mj_Latitude, __mj_Longitude, 40.7128, -74.0060, 'mi') AS DistanceMiles
FROM vwOrganizations
```

### Reference Tables

- **Country** (`__mj.Country`) — ~250 rows with ISO2, ISO3 codes, centroids, boundary GeoJSON
- **StateProvince** (`__mj.StateProvince`) — ~5,000 rows with ISO 3166-2 codes, centroids, boundary GeoJSON
- **RecordGeoCode** (`__mj.RecordGeoCode`) — polymorphic table linking any entity record to lat/lng coordinates

### RecordGeoCode Structure

Each row maps an entity record + location type to a geocoded coordinate:
- `EntityID` + `RecordID` + `LocationType` form the unique key
- `LocationType`: 'Primary' (default), 'Home', 'Business', 'Mailing', etc.
- `Status`: 'success', 'failed', 'pending'
- `Precision`: 'exact', 'postal_code', 'city', 'county', 'state_province', 'country'
- `CountryID` / `StateProvinceID`: FKs to reference tables for choropleth grouping

### Important Notes

- Always use `__mj_Latitude` and `__mj_Longitude` (the virtual fields) when querying entity views, not the RecordGeoCode table directly
- Proximity functions use the Haversine formula (great-circle distance) — accurate for most use cases
- The `fn_MJ_GeoRecordsNear` TVF uses a bounding box pre-filter for performance, then applies exact Haversine
- Not all records will have geocoded coordinates — `__mj_Latitude` can be NULL for un-geocoded records
- When generating WHERE clauses for proximity, always geocode the reference location first (e.g., "Chicago" -> 41.8781, -87.6298) then use literal coordinates in the SQL
