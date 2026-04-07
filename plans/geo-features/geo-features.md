# Geo Features: Universal Map View & Geocoding Architecture

## Overview

Add universal geographic visualization capabilities to MemberJunction so that any entity with location-relevant data can be rendered on a map. The system pre-computes geocoded lat/lng for all geo-enabled entities and exposes virtual `__mj_Latitude`/`__mj_Longitude` fields via the base view, making the map view a simple consumer of standard entity data.

**Core Principle**: Shift geocoding cost to infrequent background computation, not runtime. The map view should be a dumb renderer that just reads two virtual fields.

---

## Architecture Layers

### Layer 1: Reference Geo Entities (Country, StateProvince)

#### Tables

```
Country
  ID              UNIQUEIDENTIFIER  PK (UUID, MJ standard)
  Name            NVARCHAR(200)     'United States', 'Canada'
  ISO2            NVARCHAR(2)       'US', 'CA' — UNIQUE INDEX
  ISO3            NVARCHAR(3)       'USA', 'CAN' — UNIQUE INDEX
  NumericCode     INT               840, 124 — ISO 3166-1 numeric
  Latitude        DECIMAL(10,6)     Centroid latitude
  Longitude       DECIMAL(10,6)     Centroid longitude
  BoundaryGeoJSON NVARCHAR(MAX)     Medium-res boundary for choropleth (~3MB total)
  CommonAliases   NVARCHAR(MAX)     JSON array: ["United States","USA","U.S.","America"]

StateProvince
  ID              UNIQUEIDENTIFIER  PK (UUID, MJ standard)
  CountryID       UNIQUEIDENTIFIER  FK → Country.ID
  Name            NVARCHAR(200)     'California', 'Ontario'
  Code            NVARCHAR(10)      'CA', 'ON'
  ISO3166_2       NVARCHAR(10)      'US-CA', 'CA-ON' — UNIQUE INDEX
  Latitude        DECIMAL(10,6)     Centroid latitude
  Longitude       DECIMAL(10,6)     Centroid longitude
  BoundaryGeoJSON NVARCHAR(MAX)     Medium-res boundary (~15-20MB total all states)
  CommonAliases   NVARCHAR(MAX)     JSON array: ["Calif.","California","Cal"]
```

#### Design Decisions

**Primary Keys: UUID for both.** Rationale:
- Consistent with all MJ entities (no special-casing)
- ISO codes are unique-indexed business keys for lookups but NOT the PK
- UUIDs are immutable; ISO codes technically *can* change (rare but real — e.g., Swaziland SZ → Eswatini SZ kept code but name changed)
- Avoids composite key for StateProvince (CountryID + Code would be the natural composite key; UUID avoids this)

**BoundaryGeoJSON included in base table, nullable.** Rationale:
- ~20MB total for medium-res country + state/province boundaries is negligible in a modern database
- Column is nullable so someone pedantic about size can strip it; all map code treats null BoundaryGeoJSON gracefully (point map falls back to centroid marker instead of choropleth region)
- No separate table or file reference needed — keeps the model simple
- When loading for choropleth, use `Fields` parameter with `ResultType: 'simple'` to select only the columns needed (don't load GeoJSON unless rendering boundaries)

**Seed data via SQL migration, not mj-sync.** Rationale:
- ~250 countries + ~5,000 states/provinces with GeoJSON blobs
- Static data that changes once per decade at most
- GeoJSON strings are multi-KB each — awkward in JSON metadata files
- mj-sync's pull/push workflow adds zero value for data this static
- A single SQL file with INSERT statements is the natural format
- Data sources: ISO 3166-1/3166-2 (codes), Natural Earth Data 50m (centroids + boundaries), GeoNames (aliases) — all public domain / free

**Resolution: ~50m (medium resolution) for boundaries.** Rationale:
- Low-res (110m): ~500KB but visibly jagged at state level
- Medium-res (50m): ~20MB, clean enough for dashboards
- High-res (10m): ~100MB, unnecessary for analytics views
- 50m is the sweet spot for choropleth at country and state/province level

---

### Layer 2: RecordGeoCode Table (Persisted Geocoding Results)

```
RecordGeoCode
  ID                UNIQUEIDENTIFIER  PK
  EntityID          UNIQUEIDENTIFIER  FK → Entity.ID
  RecordID          NVARCHAR(750)     MJ composite key format string
  LocationType      NVARCHAR(50)      'Primary','Business','Home','Mailing','PO Box', etc. (default: 'Primary')
  Latitude          DECIMAL(10,6)     Geocoded latitude
  Longitude         DECIMAL(10,6)     Geocoded longitude
  Precision         NVARCHAR(20)      'exact','postal_code','city','county','state_province','country'
  CountryID         UNIQUEIDENTIFIER  FK → Country.ID (nullable) — for choropleth grouping
  StateProvinceID   UNIQUEIDENTIFIER  FK → StateProvince.ID (nullable) — for choropleth grouping
  SourceFieldHash   NVARCHAR(64)      SHA-256 of input field values (to detect when re-geocoding needed)
  GeocodedAt        DATETIMEOFFSET    When this geocoding was performed
  GeocodingSource   NVARCHAR(30)      'google','reference_data','manual','ip_geolocation'
  UNIQUE(EntityID, RecordID, LocationType)   One geocode result per record per location type
```

#### Multi-Location Support (LocationType Discriminator)

Many real-world entities have denormalized address data with multiple locations per record (e.g., a Person with Business Address, Home Address, Mailing Address). The `LocationType` field handles this:

- **Default**: `'Primary'` for entities with a single address
- **Multi-address**: The LLM in CodeGen analyzes the entity's fields and detects address groupings. For example, if a Person entity has `HomeAddress, HomeCity, HomeState` AND `WorkAddress, WorkCity, WorkState`, the LLM emits two geo sync calls with `LocationType='Home'` and `LocationType='Business'`
- **Normalized address tables**: If an entity has a dedicated Address table via FK, the geo would be on the Address entity itself — no LocationType needed since each Address row is a separate record
- The UNIQUE constraint is on `(EntityID, RecordID, LocationType)` — one geocode per location type per record
- The `__mj_Latitude`/`__mj_Longitude` virtual fields in the base view JOIN to LocationType = 'Primary' by default. Other location types are accessible via direct query to RecordGeoCode

#### How It Works

1. **On entity Save** (for geo-enabled entities): Generated subclass computes hash of geo-relevant source fields (address, city, state, zip, country). If hash differs from stored `SourceFieldHash`, the existing RecordGeoCode row is stale and gets re-geocoded.

2. **Geocoding priority order**:
   - If entity has native lat/lng fields → use those directly, `GeocodingSource='native'` (no API call)
   - If address-level fields exist → call existing Google Geocode Action, `GeocodingSource='google'`
   - If only state/country → resolve via GeoResolver against reference tables, `GeocodingSource='reference_data'`

3. **CountryID / StateProvinceID** are populated alongside lat/lng. This enables choropleth without reverse-geocoding at render time. For Google-geocoded results, the response includes country/state components which we map to our reference table IDs.

4. **SourceFieldHash** is critical for change detection. Example: for an entity with Address, City, State, PostalCode, Country fields, the hash = SHA-256(concat(Address, '|', City, '|', State, '|', PostalCode, '|', Country)). When any of these change on Save, the hash won't match and we know to re-geocode.

#### Why Not Store Lat/Lng Directly on Every Entity Table?

- Would require schema changes to every geo-enabled entity table (migration burden)
- Many entities are in customer schemas, not MJ-controlled
- Polymorphic RecordGeoCode is zero-touch for existing tables
- Single table = single cache, single index, one JOIN pattern

---

### Layer 3: Entity Metadata & Virtual Fields

#### New Entity-Level Flag

Add to the `Entity` metadata table:

```
SupportsGeoCoding   BIT   DEFAULT 0
```

When `true`:
- CodeGen generates geo-aware subclass code for this entity
- CodeGen adds `__mj_Latitude` and `__mj_Longitude` virtual fields to the base view
- UI shows map view toggle in EntityViewer
- Scheduled geocoding job includes this entity

#### Virtual Fields in Base View (CodeGen-Generated)

For entities where `SupportsGeoCoding = 1` AND the entity does NOT have native lat/lng fields:

```sql
-- CodeGen adds this LEFT JOIN to the generated base view
CREATE VIEW vwMyEntities AS
SELECT
    e.*,
    rgc.Latitude AS __mj_Latitude,
    rgc.Longitude AS __mj_Longitude
FROM
    ${flyway:defaultSchema}.MyEntity e
    LEFT JOIN ${flyway:defaultSchema}.vwRecordGeoCodes rgc
        ON rgc.EntityID = '<MyEntityID-UUID>'
        AND rgc.RecordID = CAST(e.ID AS NVARCHAR(750))
```

For entities where `SupportsGeoCoding = 1` AND the entity HAS native lat/lng fields:

```sql
-- CodeGen aliases the native fields directly
CREATE VIEW vwMyEntities AS
SELECT
    e.*,
    e.Latitude AS __mj_Latitude,
    e.Longitude AS __mj_Longitude
FROM
    ${flyway:defaultSchema}.MyEntity e
    -- No LEFT JOIN needed, data is local
```

**Result**: Every geo-enabled entity has `__mj_Latitude` and `__mj_Longitude` in its view. The map component doesn't care where they came from.

#### How CodeGen Identifies Native Lat/Lng Fields

Rather than convention-based guessing, we use the `ExtendedType` metadata on EntityField:

- Admin (or CodeGen AI suggestion workflow) marks fields with `ExtendedType = 'GeoLatitude'` or `ExtendedType = 'GeoLongitude'`
- CodeGen reads these to decide: alias native fields vs. LEFT JOIN to RecordGeoCode
- If both `GeoLatitude` and `GeoLongitude` ExtendedType fields exist → native path
- Otherwise → RecordGeoCode JOIN path

---

### Layer 4: CodeGen Integration (LLM-Generated Geo Logic)

#### What CodeGen Generates

For each entity with `SupportsGeoCoding = 1`, CodeGen uses the LLM (similar to how it generates validation functions from CHECK constraints) to:

1. **Analyze the entity's fields** and determine which are geo-relevant
2. **Generate a `GeoSourceFields` constant** listing the fields that contribute to geocoding
3. **Generate a `ComputeGeoSourceHash()` method** that hashes those fields
4. **Generate an `AfterSave` hook** that calls a helper library when the hash changes

#### Generated Code Pattern (Thin — Delegates to Singleton Service)

The generated entity subclass code is minimal: it only defines field mappings and calls a singleton service. All geocoding logic, rate limiting, API calls, hash computation, and RecordGeoCode table management lives in `GeoCodeSyncService` (a `BaseSingleton<T>`).

```typescript
// In generated entity subclass
import { GeoCodeSyncService, GeoFieldMapping } from '@memberjunction/geo-core';

// CodeGen-generated (LLM analyzes fields and produces the field mappings)
// For a single-address entity:
protected override get GeoFieldMappings(): GeoFieldMapping[] {
    return [{
        locationType: 'Primary',
        fields: ['Address', 'City', 'State', 'PostalCode', 'Country']
    }];
}

// For a multi-address entity (e.g., Person with Home + Work addresses):
// protected override get GeoFieldMappings(): GeoFieldMapping[] {
//     return [
//         { locationType: 'Home', fields: ['HomeAddress', 'HomeCity', 'HomeState', 'HomeZip', 'HomeCountry'] },
//         { locationType: 'Business', fields: ['WorkAddress', 'WorkCity', 'WorkState', 'WorkZip', 'WorkCountry'] }
//     ];
// }

// Hook into save lifecycle — single call to singleton service
protected override async AfterSave(): Promise<boolean> {
    const result = await super.AfterSave();
    if (result) {
        await GeoCodeSyncService.Instance.SyncIfChanged(this, this.GeoFieldMappings);
    }
    return result;
}
```

**What `GeoCodeSyncService.Instance.SyncIfChanged()` does internally**:
1. For each GeoFieldMapping, extracts field values from the entity instance
2. Computes SHA-256 hash of the field values
3. Checks existing RecordGeoCode row for matching hash
4. If stale or missing: dispatches geocoding (Google Geocode Action, GeoResolver, or native lat/lng copy)
5. Upserts RecordGeoCode row with lat/lng, CountryID, StateProvinceID, hash, LocationType

The generated code never contains geocoding logic, hash computation, or RecordGeoCode operations — just the field-to-location mapping that the LLM determines from analyzing the entity's schema.

#### LLM Analysis Examples

The LLM in CodeGen would receive the entity field list and produce the geo source field mapping:

| Entity Fields | LLM Output |
|---------------|------------|
| `Address, City, State, ZipCode, Country` | Standard US address pattern → fields: [Address, City, State, ZipCode, Country] |
| `Country` (alone) | Country-only → fields: [Country], precision: 'country' |
| `City, StateProvince, CountryCode` | International address → fields: [City, StateProvince, CountryCode] |
| `Latitude, Longitude` | Native coordinates → skip geocoding, use ExtendedType alias path |
| `IPAddress` | IP-based → use IP Geolocation action instead of Google Geocode |

#### What the LLM Does NOT Generate

- Actual geocoding API calls (helper library)
- Rate limiting logic (helper library)
- RecordGeoCode table operations (helper library)
- Retry/error handling (helper library)
- Alias resolution ("United States" → Country record) (GeoResolver service)

---

### Layer 5: GeoResolver Service

Singleton that handles messy text → reference record matching. Lives in **MJServer** (not geo-core) and is exposed via a thin **GraphQL resolver** so clients can also resolve locations.

```typescript
export class GeoResolver extends BaseSingleton<GeoResolver> {
    // Loaded once on first use — ~250 countries, ~5000 states
    private countries: CountryEntity[] = [];
    private states: StateProvinceEntity[] = [];

    /** Resolve free-text country to reference record */
    async ResolveCountry(input: string): Promise<CountryEntity | null> {
        // 1. Exact match: Name, ISO2, ISO3
        // 2. Case-insensitive match
        // 3. CommonAliases JSON array search
        // Returns null if no match (caller decides: skip or log warning)
    }

    /** Resolve state text with country context */
    async ResolveState(stateInput: string, countryInput: string): Promise<StateProvinceEntity | null> {
        // Country context is critical: "CA" = California (US) vs Canada (ISO2)
        const country = await this.ResolveCountry(countryInput);
        // Match within country's states
    }
}
```

**Architecture**: `@memberjunction/geo-core` contains only core types, interfaces, `GeoCodeSyncService`, and hash utilities (server-only consumers can use without MJServer). `GeoResolver` lives in MJServer and is wrapped with a GQL resolver for client access. This separation keeps geo-core lightweight for server-only deployments.

- Used by GeoCodeSyncService when geocoding results come back to populate CountryID/StateProvinceID
- Used by scheduled job when doing reference-data-only resolution (country/state level, no API needed)
- CommonAliases grows organically as edge cases surface — just update the JSON array in the Country/StateProvince row

---

### Layer 6: Scheduled Geocoding Job

An MJ Action (or scheduled task) that runs on a configurable schedule:

1. Query all entities where `SupportsGeoCoding = 1`
2. For each entity, find records that either:
   - Have no RecordGeoCode entry at all (new records never geocoded)
   - Have a stale SourceFieldHash (source fields changed but geocoding didn't fire on save — e.g., bulk import)
3. Batch geocode with rate limiting (Google Geocoding API: 50 req/sec limit)
4. Parallelize across entities (each entity gets its own geocoding stream)
5. Log results: success count, failures, API quota usage

**Schedule options**: Daily, weekly, monthly — configurable per deployment.
**Purpose**: Catches gaps so that runtime map rendering almost never encounters un-geocoded records.

---

### Layer 7: Map View in EntityViewer

#### Integration Point

Extend `EntityViewMode` type:
```typescript
type EntityViewMode = 'grid' | 'cards' | 'timeline' | 'map';
```

#### When Map Toggle Appears

The map toggle button shows **only** when the entity has `SupportsGeoCoding = 1` (read from EntityInfo metadata). Same pattern as timeline toggle only appearing when entity has date fields.

#### Map Component Inputs

```typescript
@Input() Records: BaseEntity[];        // Same filtered/sorted data as grid
@Input() Entity: EntityInfo;           // Entity metadata

// The component reads __mj_Latitude and __mj_Longitude from each record
// No special configuration needed — these virtual fields are always present
// when SupportsGeoCoding = true
```

#### Rendering Modes

1. **Point Map** (default): Individual markers at each record's lat/lng. Marker clustering when dense. Click marker → popup with record summary → click to open record.

2. **Choropleth**: Group records by CountryID or StateProvinceID (from RecordGeoCode table or aggregated via view). Color regions by count/metric. Requires loading BoundaryGeoJSON from Country/StateProvince reference tables.

3. **Heat Map**: Density visualization using lat/lng points. Good for large datasets.

The mode selector is within the map view itself (not a separate EntityViewMode).

#### DisplayState Persistence

```typescript
interface MJUserViewEntity_IMapDisplayState {
    renderMode: 'point' | 'choropleth' | 'heatmap';
    zoomLevel?: number;
    centerLat?: number;
    centerLng?: number;
    clusterMarkers?: boolean;
    choroplethGroupBy?: 'country' | 'state_province';
    choroplethMetric?: 'count' | string;  // field name for metric
}
```

#### Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Map library | Leaflet | Free, OSS (BSD), no API key, 42KB, massive ecosystem |
| Tile provider | OpenStreetMap | Free, no API key, good default |
| Angular wrapper | Raw Leaflet (thin MJ wrapper) | Avoids extra dependency, Leaflet JS API is clean enough to wrap directly |
| Marker clustering | `leaflet.markercluster` | Standard Leaflet plugin |
| Choropleth | Leaflet GeoJSON layer | Built-in Leaflet capability |

---

### Layer 8: Proximity Query Infrastructure (SQL Functions)

Built-in SQL functions deployed as **baseline MJ infrastructure** (one-time migration, not CodeGen-emitted). Available on every MJ database, like `__mj_CreatedAt` triggers.

#### SQL Functions

**1. Scalar Distance Function**

```sql
-- fn_MJ_GeoDistance(lat1, lng1, lat2, lng2, unit)
-- Returns FLOAT distance between two points
-- unit: 'mi' (miles) or 'km' (kilometers)
-- Uses Haversine formula (great-circle distance)

-- Example: Get distance from each record to a point
SELECT
    o.Name,
    dbo.fn_MJ_GeoDistance(o.__mj_Latitude, o.__mj_Longitude, 40.7128, -74.0060, 'mi') AS DistanceMiles
FROM vwOrganizations o
ORDER BY DistanceMiles
```

Use cases: SELECT clauses, ORDER BY distance, display distance in UI columns.

**2. Inline Table-Valued Function (TVF) for Radius Queries**

```sql
-- fn_MJ_GeoRecordsNear(entityName, centerLat, centerLng, radius, unit)
-- Takes Entity Name (not ID) for readability — unique, easier for humans and AI to verify
-- Returns matching RecordGeoCode rows within radius
-- INTERNALLY applies bounding box pre-filter for index usage, then Haversine for precision
-- The optimizer inlines TVFs, so bounding box predicates CAN use indexes on Latitude/Longitude

-- Example: All geocoded records for an entity within 50 miles of NYC
SELECT r.*
FROM dbo.fn_MJ_GeoRecordsNear('Organizations', 40.7128, -74.0060, 50, 'mi') r
```

The TVF encapsulates the bounding box + Haversine two-step so callers never think about it. Internally:
1. Computes lat/lng delta from radius (1 degree latitude ~ 69 miles, longitude adjusted for latitude)
2. Filters RecordGeoCode with `BETWEEN` on lat/lng (uses index)
3. Applies exact Haversine on the small remaining set
4. Returns rows with a computed `Distance` column

Both functions implemented for SQL Server and PostgreSQL (and MySQL in future). Deployed via baseline migration alongside the reference tables.

#### Indexes

CodeGen adds indexes on `__mj_Latitude` and `__mj_Longitude` in RecordGeoCode to support bounding box range scans. For views that alias native lat/lng fields, the underlying table columns already have whatever indexes the schema owner created.

#### Integration: Smart Filter (Not Classical Filter)

Proximity filtering is consumed through **Smart Filter only** — not the classical filter UI. This is consistent with how Smart Filter handles other complex query patterns (like list filtering) that don't fit the dropdown/operator paradigm.

**AI Agent/Prompt updates**: Three AI surfaces need geo-awareness:

1. **Smart Filter prompt**: Updated to know about `__mj_Latitude`/`__mj_Longitude` columns and `fn_MJ_GeoDistance`/`fn_MJ_GeoRecordsNear` functions for proximity filtering and distance-based sorting.

2. **Query Builder Agent prompt**: Updated so that when users build queries involving geo-enabled entities, the agent knows about the virtual lat/lng fields, the proximity functions, and can construct geographic WHERE clauses and JOINs to reference tables (Country, StateProvince) for grouping.

3. **Database Research Agent prompt**: Updated to understand the geo infrastructure — RecordGeoCode table structure, reference table relationships, available SQL functions — so it can answer questions about geographic data distribution, coverage gaps, and spatial relationships across entities.

**Shared prompt template via `@include`**: All three prompts include the same geo context from a single shared file at `metadata/prompts/templates/_includes/geo-context.md` using the existing `{@include ./_includes/geo-context.md}` Nunjucks directive (same pattern already used by query-gen templates for `entity-metadata.md` and `simplicity-principles.md`). This ensures geo documentation stays DRY across all AI surfaces — update one file, all three prompts pick it up.

**Example Smart Filter interactions**:

```
User: "Show me organizations within 50 miles of Chicago"
Smart Filter:
  1. Calls Geocode Address action → Chicago → lat: 41.8781, lng: -87.6298
  2. Generates ExtraFilter:
     "dbo.fn_MJ_GeoDistance(__mj_Latitude, __mj_Longitude, 41.8781, -87.6298, 'mi') <= 50"
  3. The resolved lat/lng is baked into the WHERE clause string
     → persisted in SmartFilterWhereClause → no re-geocoding on view reload

User: "Sort by distance from our HQ"
Smart Filter:
  1. Resolves "our HQ" → lat/lng (via geocode or known reference)
  2. Generates OrderBy: "dbo.fn_MJ_GeoDistance(__mj_Latitude, __mj_Longitude, 40.71, -74.00, 'mi')"
```

**Key insight**: The geocoded lat/lng for the reference point is inherently persisted as literal numbers in the WHERE clause string. No separate caching needed. If the user changes the filter, Smart Filter re-resolves and generates a new WHERE clause.

#### Cross-View-Mode Filtering

Because Smart Filter produces `ExtraFilter` (a WHERE clause), geo filtering works identically across **all** view modes:
- **Grid**: Shows filtered rows with optional Distance column
- **Cards**: Shows filtered cards
- **Timeline**: Shows filtered timeline entries
- **Map**: Shows filtered markers/regions

A user can Smart Filter "within 50 miles of Denver" while in grid view and never touch the map. The map view is one visualization option, not the only way to consume geo-filtered data.

---

## New Packages

| Package | Purpose |
|---------|---------|
| `@memberjunction/geo-core` | Core types, interfaces, `GeoCodeSyncService`, hash utilities. Lightweight, server-side only. Does NOT include GeoResolver. |
| `@memberjunction/ng-map-view` | Angular map component (raw Leaflet wrapper). Client-side. |

**GeoResolver** lives in MJServer (not a separate package) and is exposed via a thin GQL resolver. This keeps `geo-core` lightweight for server-only consumers while making resolution available to clients via GraphQL.

---

## Migration & Entity Summary

| Object | Type | Notes |
|--------|------|-------|
| `Country` | New table + entity | ~250 rows seeded, medium-res boundaries |
| `StateProvince` | New table + entity | ~5,000 rows seeded, medium-res boundaries |
| `RecordGeoCode` | New table + entity | Polymorphic, grows as records are geocoded |
| `vwRecordGeoCodes` | New view | Wrapper view for the LEFT JOIN |
| `fn_MJ_GeoDistance` | Scalar SQL function | Haversine distance calc, baseline infrastructure |
| `fn_MJ_GeoRecordsNear` | Inline TVF | Bounding box + Haversine radius query, baseline infrastructure |
| `Entity.SupportsGeoCoding` | New column | BIT, controls geo feature availability |
| `EntityField.ExtendedType` | Existing column | Add recognized values: GeoLatitude, GeoLongitude, GeoCountry, GeoStateProvince, GeoCity, GeoPostalCode, GeoAddress |
| `EntityField.AutoUpdateExtendedType` | New column | BIT DEFAULT 1, controls LLM auto-suggestion of ExtendedType |
| Base views for geo entities | Modified by CodeGen | LEFT JOIN to vwRecordGeoCodes or native field alias |
| AI prompts (Smart Filter, Query Builder, DB Research) | Updated | Geo-awareness via shared `@include` template |

---

## Data Flow Summary

```
                                    WRITE PATH (infrequent)
                                    ========================
Record Save (address changed)
    → Generated subclass calls GeoCodeSyncService.Instance.SyncIfChanged(entity, fieldMappings)
    → Service computes hash per LocationType, compares to stored SourceFieldHash
    → If stale: dispatches geocoding (Google Geocode Action, GeoResolver, or native lat/lng copy)
    → Upserts RecordGeoCode row (lat, lng, CountryID, StateProvinceID, hash, LocationType)

Scheduled Job (daily/weekly)
    → Finds un-geocoded or stale records across all geo-enabled entities
    → Batch geocodes with rate limiting
    → Fills RecordGeoCode gaps

                                    READ PATH (fast, no API calls)
                                    ===============================
Map View loads entity data
    → Standard RunView call (same as grid/cards/timeline)
    → Base view includes __mj_Latitude, __mj_Longitude via LEFT JOIN
    → Records have lat/lng as regular fields
    → Map component renders markers/choropleth/heatmap
    → Zero geocoding API calls at read time
```

---

## Implementation Phases

### Phase 1: Foundation (Reference Data + Infrastructure)
1. Create Country and StateProvince tables + migrations
2. Seed ~250 countries + ~5,000 states/provinces with centroids, ISO codes, aliases, medium-res boundaries (GeoJSON format)
3. Create RecordGeoCode table (with LocationType discriminator) + vwRecordGeoCodes view
4. Create `fn_MJ_GeoDistance` (scalar) and `fn_MJ_GeoRecordsNear` (inline TVF, takes Entity Name) SQL functions — baseline infrastructure, SQL Server + PostgreSQL
5. Add `Entity.SupportsGeoCoding` column to Entity table
6. Add `EntityField.AutoUpdateExtendedType` BIT column (default: 1)
7. Run CodeGen to generate entity classes for new tables
8. Build `@memberjunction/geo-core` package: core types, interfaces, `GeoCodeSyncService` (BaseSingleton), hash utilities
9. Build GeoResolver in MJServer with thin GQL resolver wrapper

### Phase 2: CodeGen Integration
1. Expand ExtendedType valid values: GeoLatitude, GeoLongitude, GeoCountry, GeoStateProvince, GeoCity, GeoPostalCode, GeoAddress
2. Update CodeGen LLM field categorization to auto-suggest ExtendedType values (controlled by `AutoUpdateExtendedType` flag)
3. Update CodeGen base view generation: when `SupportsGeoCoding = 1`, add LEFT JOIN to vwRecordGeoCodes (LocationType='Primary') or alias native lat/lng fields
4. Update CodeGen entity subclass generation: LLM-based analysis of fields → generate `GeoFieldMappings` property + `AfterSave` hook calling `GeoCodeSyncService.Instance.SyncIfChanged()` (multi-location aware)
5. Add `__mj_Latitude` / `__mj_Longitude` as virtual fields in EntityField metadata for geo-enabled entities
6. Create shared geo context template at `metadata/prompts/templates/_includes/geo-context.md`
7. Update AI prompts via `{@include}` directive:
   - **Smart Filter**: proximity query syntax, available SQL functions, `__mj_Latitude`/`__mj_Longitude` fields
   - **Query Builder Agent**: geographic WHERE clauses, reference table JOINs, proximity functions
   - **Database Research Agent**: RecordGeoCode structure, reference table relationships, spatial SQL functions

### Phase 3: Map View UI
1. Create `@memberjunction/ng-map-view` package with Leaflet-based component
2. Add `'map'` to `EntityViewMode` union type
3. Wire map toggle into EntityViewerComponent (conditional on `SupportsGeoCoding`)
4. Implement point map with marker clustering
5. Implement choropleth mode (load BoundaryGeoJSON from reference tables)
6. Implement heatmap mode
7. Add map configuration to DisplayState persistence
8. Add map settings to ViewConfigPanel

### Phase 4: Scheduled Geocoding & Polish
1. Build scheduled geocoding Action/job
2. Admin UI for toggling `SupportsGeoCoding` on entities
3. Admin UI for reviewing/correcting geocoding results
4. Add CommonAliases management UI (or just direct DB edits, given rarity of changes)
5. Performance testing with large datasets (10K+ markers, clustering behavior)

---

## Resolved Design Decisions

1. **Choropleth for native lat/lng entities**: **Yes, Phase 1.** Support reverse-geocoding (lat/lng → which country/state contains this point) so choropleth works even for entities with only coordinates and no country/state text fields. This uses the existing Reverse Geocode action to populate CountryID/StateProvinceID on the RecordGeoCode row.

2. **GeoJSON storage format**: **Standard GeoJSON.** ~20MB is small. No TopoJSON complexity needed. Readable, no client-side decode step.

3. **ExtendedType — AI-suggested with AutoUpdate control**: CodeGen's LLM auto-suggests and applies ExtendedType values by default. A new `AutoUpdateExtendedType` BIT flag (default: 1) on EntityField follows the existing AutoUpdate pattern (like `AutoUpdateDisplayName`, `AutoUpdateCategory`, etc.) — admin sets it to 0 to lock their override.

   **Expanded ExtendedType vocabulary** (added to existing values: Code, Email, Geo, Tel, URL, WhatsApp, etc.):
   - `GeoLatitude`, `GeoLongitude` — numeric coordinate fields
   - `GeoCountry` — text field containing country names/codes
   - `GeoStateProvince` — text field containing state/province
   - `GeoCity`, `GeoPostalCode`, `GeoAddress` — other address components
   - `Phone` (alias for Tel), `Website` (alias for URL) — also auto-detected

   **Existing CodeGen infrastructure** already supports this:
   - LLM-based ExtendedType detection in `advanced_generation.ts` (field category assignment pass)
   - `EXTENDED_TYPE_ALIASES` map in `manage-metadata.ts` (includes `'address' → 'Geo'`, `'location' → 'Geo'`)
   - 11 existing `AutoUpdate*` flags on EntityField — `AutoUpdateExtendedType` is the 12th
   - The LLM already suggests ExtendedType during field categorization — it just needs the expanded vocabulary and the new geo-specific types added to the valid values list

4. **Sub-country granularity**: **Not Phase 1.** Data size estimate: ~40,000 admin-2 regions worldwide, ~200-500MB boundary data at 50m resolution (Natural Earth, public domain). US counties alone (~3,200) would be ~30-50MB. Feasible as a future optional add-on schema — just another reference table + RecordGeoCode gains a new FK column.

5. **Multi-location entities**: **Supported in Phase 1 via LocationType discriminator.** `RecordGeoCode.LocationType` (NVARCHAR(50), default: 'Primary') with UNIQUE constraint on `(EntityID, RecordID, LocationType)`. The LLM in CodeGen detects address field groupings (e.g., HomeAddress/HomeCity vs WorkAddress/WorkCity) and emits separate `GeoFieldMapping` entries with appropriate LocationType values ('Home', 'Business', etc.). For normalized address tables, geo attaches to the Address record itself — no LocationType needed. The `__mj_Latitude`/`__mj_Longitude` virtual fields JOIN to LocationType = 'Primary' by default.

## Remaining Open Questions

1. **County-level precision**: The `Precision` enum includes `'county'` but Phase 1 has no County reference table. Should Google Geocode results that resolve to county level store `Precision='county'` with null CountryID for the county-level FK? (Yes — store the precision, leave the FK null until a County table exists.)

2. **Rate limiting strategy for scheduled job**: Per-entity parallelism with per-entity rate limits, or a global rate limit pool shared across all entities? Google's limit is 50 req/sec — probably a global pool is simpler.
