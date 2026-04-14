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

**Seed data via mj-sync with per-country sub-folders.** Rationale:
- ~250 countries + ~5,000 states/provinces with GeoJSON blobs
- Static data that changes once per decade at most — very rarely updated
- mj-sync with `@file:` references is the right tool: GeoJSON blobs live in separate files, keeping metadata JSON clean and diffable
- Data sources: ISO 3166-1/3166-2 (codes), Natural Earth Data 50m (centroids + boundaries), GeoNames (aliases) — all public domain / free

**Directory structure for seed data:**
```
metadata/
  countries/
    .mj-sync.json                    # entity: "Countries", filePattern, etc.
    .countries.json                   # All ~250 country records (fields only, no GeoJSON inline)
    boundaries/
      US.geojson                     # @file:boundaries/US.geojson referenced from .countries.json
      CA.geojson
      GB.geojson
      ...                            # One file per country (~250 files, ~3MB total)
  state-provinces/
    .mj-sync.json                    # entity: "State Provinces", filePattern, etc.
    by-country/
      US/
        .us-states.json              # All ~50 US state/territory records
        boundaries/
          US-CA.geojson              # @file:boundaries/US-CA.geojson
          US-NY.geojson
          ...
      CA/
        .ca-provinces.json           # All ~13 Canadian province/territory records
        boundaries/
          CA-ON.geojson
          CA-BC.geojson
          ...
      ...                            # One sub-folder per country with states (~200 countries)
```

This structure keeps individual files small and reviewable, leverages mj-sync's `@file:` syntax for the large GeoJSON blobs, and organizes ~5,000 state/province records into manageable per-country chunks rather than one enormous file.

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
  RecordID          NVARCHAR(450)     MJ composite key format string (450 max for SQL Server index support)
  LocationType      NVARCHAR(50)      'Primary','Business','Home','Mailing','PO Box', etc. (default: 'Primary')
  Latitude          DECIMAL(10,6)     Geocoded latitude
  Longitude         DECIMAL(10,6)     Geocoded longitude
  Precision         NVARCHAR(20)      'exact','postal_code','city','county','state_province','country'
  CountryID         UNIQUEIDENTIFIER  FK → Country.ID (nullable) — for choropleth grouping
  StateProvinceID   UNIQUEIDENTIFIER  FK → StateProvince.ID (nullable) — for choropleth grouping
  Status            NVARCHAR(20)      'success','failed','pending' (default: 'pending')
  ErrorMessage      NVARCHAR(MAX)     Error details when Status='failed' (nullable)
  RetryCount        INT               Number of geocoding attempts (default: 0)
  SourceFieldHash   NVARCHAR(64)      SHA-256 of input field values (to detect when re-geocoding needed)
  GeocodedAt        DATETIMEOFFSET    When this geocoding was last attempted
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

#### New Entity-Level Flags

Add to the `Entity` metadata table:

```
SupportsGeoCoding         BIT   DEFAULT 0
AutoUpdateSupportsGeoCoding   BIT   DEFAULT 1
```

**CodeGen auto-detection**: During the LLM field categorization pass, CodeGen analyzes each entity's fields to determine if geo-relevant data exists (address fields, city/state/country fields, lat/lng coordinates, etc.). If the LLM determines the entity has geo-capable fields, **CodeGen automatically sets `SupportsGeoCoding = 1`**. This follows the same pattern as other `AutoUpdate*` flags — the `AutoUpdateSupportsGeoCoding` flag (default: 1) controls whether CodeGen is allowed to change this value. An admin can set `AutoUpdateSupportsGeoCoding = 0` to lock the value (either to force it on for an entity the LLM doesn't detect, or to force it off for an entity that has address-like fields but shouldn't be geocoded).

**Examples of auto-detection**:
- Entity with `Address`, `City`, `State`, `ZipCode` fields → CodeGen sets `SupportsGeoCoding = 1`
- Entity with `Latitude`, `Longitude` fields → CodeGen sets `SupportsGeoCoding = 1`
- Entity with `Country` field (alone) → CodeGen sets `SupportsGeoCoding = 1`
- Entity with only `Name`, `Description`, `Status` fields → CodeGen leaves `SupportsGeoCoding = 0`

When `SupportsGeoCoding = 1`:
- CodeGen generates geo-aware subclass code for this entity (GeoFieldMappings + AfterSave hook)
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
        AND rgc.RecordID = CAST(e.ID AS NVARCHAR(450))
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

**Form visibility**: `__mj_Latitude` and `__mj_Longitude` are displayed in generated entity forms as **read-only fields** alongside the `__mj_CreatedAt`/`__mj_UpdatedAt` system fields. They are rendered as clickable Google Maps links (e.g., `https://www.google.com/maps?q={lat},{lng}`) so users can quickly view the geocoded location on a map. If either value is null (not yet geocoded), the link is hidden and a "Not geocoded" label is shown instead.

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

// Hook into save lifecycle — fire-and-forget geocoding (NOT in transaction scope)
// Geocoding failures never block or roll back the user's save operation.
// Errors are captured in RecordGeoCode.Status/ErrorMessage for retry by scheduled job.
protected override async AfterSave(): Promise<boolean> {
    const result = await super.AfterSave();
    if (result) {
        // Fire-and-forget: intentionally not awaited so the save completes immediately.
        // SyncIfChanged handles its own error capture internally.
        GeoCodeSyncService.Instance.SyncIfChanged(this, this.GeoFieldMappings)
            .catch(e => LogError(`Geocoding failed for ${this.EntityInfo.Name} ${this.ID}: ${e.message}`));
    }
    return result;
}
```

**What `GeoCodeSyncService.Instance.SyncIfChanged()` does internally**:
1. For each GeoFieldMapping, extracts field values from the entity instance
2. Computes SHA-256 hash of the field values
3. Checks existing RecordGeoCode row for matching hash
4. If stale or missing: upserts RecordGeoCode row with `Status='pending'`, then dispatches geocoding
5. On success: updates row with lat/lng, CountryID, StateProvinceID, hash, LocationType, `Status='success'`
6. On failure: updates row with `Status='failed'`, `ErrorMessage`, increments `RetryCount`
7. Never throws — all errors are captured in the RecordGeoCode row for the scheduled job to retry

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
2. For each entity, find records in three categories:
   - **No RecordGeoCode row at all** — records that were never geocoded (e.g., bulk SQL imports that bypass the entity Save path entirely, or records that existed before geocoding was enabled). These have no hash because no AfterSave ever fired.
   - **Status = 'pending'** — geocoding was triggered but hasn't completed yet (e.g., AfterSave fired but the async geocode hasn't returned)
   - **Status = 'failed'** — previous geocoding attempt failed. Retry with exponential backoff based on `RetryCount` (skip if `RetryCount >= maxRetries`, configurable, default 3).
   - **Stale SourceFieldHash** — source fields changed but geocoding didn't fire on save (e.g., direct SQL UPDATE bypassing the entity layer). Detected by recomputing the hash from current field values and comparing to stored hash.
3. Batch geocode with rate limiting (Google Geocoding API: 50 req/sec — global pool shared across all entities, simpler than per-entity limits)
4. Parallelize across entities (each entity gets its own geocoding stream, all sharing the global rate limiter)
5. Log results: success count, failures by category, retry count, API quota usage

**Schedule options**: Daily, weekly, monthly — configurable per deployment.
**Purpose**: Catches all gaps — bulk imports, failed retries, bypassed Save paths — so that runtime map rendering almost never encounters un-geocoded records.

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

#### Choropleth Boundary Data Loading Strategy

BoundaryGeoJSON for all countries (~3MB) and all states (~15-20MB) could be expensive to load eagerly on every map render. The loading strategy uses MJ's existing multi-tier caching:

1. **Lazy load on demand**: Boundary data is only fetched when the user switches to choropleth mode (not on initial point map render). Country boundaries load first (~3MB); state boundaries load only when the user drills into a specific country or selects state-level grouping.

2. **Server-side RunView cache**: The boundary data RunView results are automatically cached by MJ's server-side cache (small result sets, unfiltered, auto-cached). Subsequent requests from any user are served from memory/Redis with zero DB queries.

3. **Client-side caching**: The Angular map component uses BaseEngine-style caching backed by IndexedDB for the boundary GeoJSON. Once loaded, ~20MB of boundary data persists across browser sessions. Cache invalidation is timestamp-based (boundaries change once per decade at most).

4. **Practical impact**: ~20MB in IndexedDB is negligible on modern browsers and even mobile devices. First load takes a few seconds; all subsequent loads are instant from local cache. This is comparable to a single high-res image download — not a concern for any modern device.

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

### Layer 9: Reusable React `SimpleMap` Component (metadata/components)

MemberJunction's `metadata/components` system provides a library of reusable React components (SimpleChart, DataGrid, SimpleDrilldownChart, etc.) that are compiled and executed at runtime by the React runtime (`@memberjunction/react-runtime`). These components are used by Skip and other dynamic code generators to build dashboards and reports without Angular compilation. A `SimpleMap` component extends this library with geographic visualization.

#### Why a Separate React Component (Not Just Angular)

The Angular `ng-map-view` (Layer 7) is a compiled TypeScript component integrated into MJExplorer's entity viewer. The React `SimpleMap` serves a different purpose:
- **Runtime-compiled**: Skip and other code generators can compose it dynamically without a build step
- **Composable**: Other generated components can embed it (map + chart, map + grid drill-down)
- **Portable**: Works anywhere the React runtime runs (Skip dashboards, embedded views, external apps)

#### Code Sharing Between Angular and React: Independent Implementations

The Angular and React map components are **independent implementations** that both use Leaflet directly. Rationale:
- The shareable surface (Leaflet API calls) is ~100-150 lines — the easy part
- The hard parts (state management, reactivity, lifecycle) are fundamentally framework-specific
- Angular uses compiled TypeScript with ChangeDetectorRef/Observables; React components are runtime JS with hooks
- Coupling their release cycles for marginal code reuse is net-negative
- Both are self-contained (~25-30KB each), similar to SimpleChart (26KB)

#### Component Specification

**Name**: `SimpleMap`
**Namespace**: `Generic/UI/Map`
**Type**: `Map`
**Libraries**: Leaflet 1.9.x (BSD, no API key, 42KB), leaflet.markercluster, leaflet-heat

**Input Properties** (camelCase, following existing spec convention):

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `data` | array | yes | — | Array of records (same contract as SimpleChart/DataGrid) |
| `latitudeField` | string | no | `'__mj_Latitude'` | Field name for latitude |
| `longitudeField` | string | no | `'__mj_Longitude'` | Field name for longitude |
| `entityName` | string | no | — | Entity name for metadata-aware formatting + OpenEntityRecord |
| `entityPrimaryKeys` | array | no | — | Key fields for record opening (same pattern as DataGrid) |
| `renderMode` | string | no | `'point'` | `'point'`, `'choropleth'`, `'heatmap'` |
| `choroplethGroupBy` | string | no | — | `'country'` or `'state_province'` |
| `choroplethMetric` | string | no | `'count'` | `'count'` or field name for sum aggregation |
| `clusterMarkers` | boolean | no | `true` | Enable marker clustering in point mode |
| `height` | number | no | `400` | Map height in pixels (same default as SimpleChart) |
| `title` | string | no | — | Map title |
| `popupFields` | array | no | — | Fields to show in marker popup (auto-detect if omitted) |
| `center` | object | no | — | `{ lat, lng }` initial center (auto-fit to data bounds if omitted) |
| `zoom` | number | no | — | Initial zoom level (auto-fit if omitted) |
| `colors` | array | no | — | Custom color palette for choropleth gradient |

**Events** (following existing event pattern):

| Event | Parameters | Description |
|-------|-----------|-------------|
| `onMarkerClick` | `{ record, lat, lng, entityName }` | User clicks a map marker. Same shape as SimpleChart's `onDataPointClick` for composability. |
| `onRegionClick` | `{ region, records, groupBy, count, metric }` | User clicks a choropleth region. Emits all records in that country/state — enables drill-down to DataGrid or SimpleChart. |
| `onMapRendered` | `{ renderMode, markerCount, bounds }` | Map finished rendering. |

#### MJ Geo Integration (Zero-Config for Geo-Enabled Entities)

- **Default fields**: `__mj_Latitude` / `__mj_Longitude` — the virtual fields from the geo plan. When `entityName` is provided for a geo-enabled entity, the map works with zero additional configuration.
- **Choropleth boundaries**: Loaded via `utilities.rv.RunView()` against Country/StateProvince entities with `Fields: ['ID', 'Name', 'ISO2', 'BoundaryGeoJSON']` and `ResultType: 'simple'`. Benefits from the same RunView server cache → client cache pipeline.
- **Record opening**: `callbacks.OpenEntityRecord(entityName, [{ FieldName: 'ID', Value: record.ID }])` on marker click — identical to DataGrid's pattern.
- **Smart metadata formatting**: Uses `utilities.md.Entities` to auto-detect field types for popup content, same pattern as DataGrid's smart formatting.
- **Overridable**: `latitudeField`/`longitudeField` props allow the component to work with any data that has coordinates, not just MJ geo-enabled entities.

#### Composition Examples

Skip and other generators can compose `SimpleMap` with existing components:

```jsx
// Map + drill-down grid (click marker → see details below)
function MapDrilldown({ data, entityName, utilities, callbacks, components }) {
    const [selected, setSelected] = useState(null);
    const SimpleMap = components['SimpleMap'];
    const DataGrid = components['DataGrid'];

    return React.createElement('div', null,
        React.createElement(SimpleMap, {
            data, entityName,
            onMarkerClick: (e) => setSelected([e.record])
        }),
        selected && React.createElement(DataGrid, {
            data: selected, entityName
        })
    );
}

// Choropleth + chart (click region → see breakdown)
function GeoBreakdown({ data, entityName, utilities, callbacks, components }) {
    const [regionData, setRegionData] = useState(null);
    const SimpleMap = components['SimpleMap'];
    const SimpleChart = components['SimpleChart'];

    return React.createElement('div', null,
        React.createElement(SimpleMap, {
            data, renderMode: 'choropleth', choroplethGroupBy: 'country',
            onRegionClick: (e) => setRegionData(e.records)
        }),
        regionData && React.createElement(SimpleChart, {
            data: regionData, groupBy: 'Status', chartType: 'pie'
        })
    );
}
```

#### File Structure (Following Existing Convention)

```
metadata/components/
  spec/generic/simple-map.spec.json         # Component specification
  code/generic/simple-map.js                # Implementation (~25-30KB)
  descriptions/generic/simple-map.md        # One-line summary + use cases
  functional-requirements/generic/simple-map.md  # Feature list
  technical-design/generic/simple-map.md    # Architecture + data pipeline
```

Registered in `.components.json` with `Namespace: "Generic/UI/Map"`, `Type: "Map"`.

---

### Layer 10: Recommended Future React Components

Based on analysis of the existing component library (SimpleChart, DataGrid, SimpleDrilldownChart, EntityDataGrid, SingleRecordView, AIInsightsPanel, DataExportPanel, OpenRecordButton), these are the highest-value additions beyond SimpleMap:

#### SimpleKPI — High Priority (Recommend: Phase 1 or Soon After)

Every generated dashboard needs KPI tiles. Big number + label + trend indicator + optional sparkline. This is the most common dashboard primitive currently missing.

```
┌─────────────────────┐
│  Revenue             │
│  $1,247,832          │
│  ▲ 12.3% vs last mo  │
│  ▂▃▅▆▇█▇▅ (sparkline)│
└─────────────────────┘
```

**Props**: `data`, `valueField`, `aggregateMethod` (count/sum/avg), `title`, `comparisonData` (for trend), `comparisonLabel`, `format` (currency/number/percent), `sparkline` (boolean), `sparklineField` (date for x-axis).

Skip would use this constantly: "show me total revenue, active users, and open tickets" → three SimpleKPI instances. Small component (~10KB), high ROI.

#### SimpleTimeline — Medium-High Priority

Chronological event display for activity feeds, audit trails, status histories. MJ has timeline in Angular but nothing for Skip-generated views.

**Props**: `data`, `dateField`, `titleField`, `descriptionField`, `statusField`, `entityName`, `groupBy` (day/week/month).

#### SimpleFilterPanel — Medium Priority

Visual filter builder that emits WHERE clauses. Currently Skip hardcodes filters; a reusable filter component enables interactive filtering across connected components (filter → chart + grid + map all update).

**Props**: `entityName`, `fields`, `onChange` (emits ExtraFilter string).

#### SimpleKanban — Lower Priority, High Impact

Board view for status-based workflows. Columns = status values, cards = records.

**Props**: `data`, `columnField`, `titleField`, `entityName`, `allowDrag`.

**Recommended sequencing**: SimpleMap (this plan) → SimpleKPI (next) → SimpleTimeline → SimpleFilterPanel → SimpleKanban.

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
| `Country` | New table + entity | ~250 rows seeded via mj-sync, medium-res boundaries in `@file:` GeoJSON |
| `StateProvince` | New table + entity | ~5,000 rows seeded via mj-sync (per-country sub-folders), medium-res boundaries |
| `RecordGeoCode` | New table + entity | Polymorphic, grows as records are geocoded. Includes Status/ErrorMessage/RetryCount for error tracking |
| `vwRecordGeoCodes` | New view | Wrapper view for the LEFT JOIN |
| `fn_MJ_GeoDistance` | Scalar SQL function | Haversine distance calc, baseline infrastructure |
| `fn_MJ_GeoRecordsNear` | Inline TVF | Bounding box + Haversine radius query, baseline infrastructure |
| `Entity.SupportsGeoCoding` | New column | BIT, controls geo feature availability. **Auto-set by CodeGen** when LLM detects geo-capable fields |
| `Entity.AutoUpdateSupportsGeoCoding` | New column | BIT DEFAULT 1, controls whether CodeGen can auto-update SupportsGeoCoding |
| `EntityField.ExtendedType` | Existing column | Add recognized values: GeoLatitude, GeoLongitude, GeoCountry, GeoStateProvince, GeoCity, GeoPostalCode, GeoAddress |
| `EntityField.AutoUpdateExtendedType` | New column | BIT DEFAULT 1, controls LLM auto-suggestion of ExtendedType |
| Base views for geo entities | Modified by CodeGen | LEFT JOIN to vwRecordGeoCodes or native field alias |
| AI prompts (Smart Filter, Query Builder, DB Research) | Updated | Geo-awareness via shared `@include` template |
| `SimpleMap` React component | New metadata component | `metadata/components/code/generic/simple-map.js` — reusable map for Skip and other code generators |

---

## Data Flow Summary

```
                                    WRITE PATH (infrequent)
                                    ========================
Record Save (address changed)
    → Generated subclass fires GeoCodeSyncService.Instance.SyncIfChanged() (fire-and-forget, NOT awaited)
    → Service computes hash per LocationType, compares to stored SourceFieldHash
    → If stale: upserts RecordGeoCode row with Status='pending', dispatches geocoding
    → On success: updates Status='success' with lat/lng, CountryID, StateProvinceID, hash
    → On failure: updates Status='failed' with ErrorMessage, increments RetryCount
    → Save ALWAYS succeeds regardless of geocoding outcome

Scheduled Job (daily/weekly)
    → Finds records across all geo-enabled entities that need geocoding:
       • No RecordGeoCode row (bulk imports, pre-existing records)
       • Status='pending' (in-flight but not completed)
       • Status='failed' (retries with exponential backoff, up to maxRetries)
       • Stale SourceFieldHash (direct SQL updates bypassing entity layer)
    → Batch geocodes with global rate limiter (50 req/sec Google API limit)
    → Fills all gaps

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
2. Seed ~250 countries + ~5,000 states/provinces via mj-sync with per-country sub-folders and `@file:` GeoJSON references (centroids, ISO codes, aliases, medium-res boundaries)
3. Create RecordGeoCode table (with LocationType discriminator) + vwRecordGeoCodes view
4. Create `fn_MJ_GeoDistance` (scalar) and `fn_MJ_GeoRecordsNear` (inline TVF, takes Entity Name) SQL functions — baseline infrastructure, SQL Server + PostgreSQL
5. Add `Entity.SupportsGeoCoding` and `Entity.AutoUpdateSupportsGeoCoding` columns to Entity table
6. Add `EntityField.AutoUpdateExtendedType` BIT column (default: 1)
7. Run CodeGen to generate entity classes for new tables
8. Build `@memberjunction/geo-core` package: core types, interfaces, `GeoCodeSyncService` (BaseSingleton), hash utilities
9. Build GeoResolver in MJServer with thin GQL resolver wrapper

### Phase 2: CodeGen Integration
1. Expand ExtendedType valid values: GeoLatitude, GeoLongitude, GeoCountry, GeoStateProvince, GeoCity, GeoPostalCode, GeoAddress
2. Update CodeGen LLM field categorization to auto-suggest ExtendedType values (controlled by `AutoUpdateExtendedType` flag)
3. **Update CodeGen to auto-detect geo-capable entities**: During the LLM field analysis pass, if geo-relevant fields are detected (address, city/state/country, lat/lng, etc.), CodeGen automatically sets `SupportsGeoCoding = 1` on the entity (controlled by `AutoUpdateSupportsGeoCoding` flag). This means admins don't need to manually enable geocoding — CodeGen discovers it.
4. Update CodeGen base view generation: when `SupportsGeoCoding = 1`, add LEFT JOIN to vwRecordGeoCodes (LocationType='Primary') or alias native lat/lng fields
5. Update CodeGen entity subclass generation: LLM-based analysis of fields → generate `GeoFieldMappings` property + `AfterSave` hook calling `GeoCodeSyncService.Instance.SyncIfChanged()` (multi-location aware)
5. Add `__mj_Latitude` / `__mj_Longitude` as virtual fields in EntityField metadata for geo-enabled entities
6. Create shared geo context template at `metadata/prompts/templates/_includes/geo-context.md`
7. Update AI prompts via `{@include}` directive:
   - **Smart Filter**: proximity query syntax, available SQL functions, `__mj_Latitude`/`__mj_Longitude` fields
   - **Query Builder Agent**: geographic WHERE clauses, reference table JOINs, proximity functions
   - **Database Research Agent**: RecordGeoCode structure, reference table relationships, spatial SQL functions

### Phase 3: Map View UI (Angular + React)

**Angular — MJExplorer Entity Viewer:**
1. Create `@memberjunction/ng-map-view` package with Leaflet-based component
2. Add `'map'` to `EntityViewMode` union type
3. Wire map toggle into EntityViewerComponent (conditional on `SupportsGeoCoding`)
4. Implement point map with marker clustering
5. Implement choropleth mode (load BoundaryGeoJSON from reference tables)
6. Implement heatmap mode
7. Add map configuration to DisplayState persistence
8. Add map settings to ViewConfigPanel

**React — SimpleMap for Skip / Dynamic Code Generators:**
9. Create `SimpleMap` component: spec, code, descriptions, functional-requirements, technical-design files
10. Register in `.components.json` under `Generic/UI/Map`
11. Implement point map with marker clustering (Leaflet + leaflet.markercluster)
12. Implement choropleth mode (loads BoundaryGeoJSON via `utilities.rv.RunView()`)
13. Implement heatmap mode (leaflet-heat)
14. Wire `onMarkerClick` / `onRegionClick` events for drill-down composition with DataGrid/SimpleChart
15. Test via `@memberjunction/react-test-harness` with geo-enabled entity data

Both implementations use Leaflet independently — no shared code between Angular and React (see Layer 9 rationale).

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

5. **Rate limiting strategy**: **Global pool.** A single global rate limiter (50 req/sec for Google Geocoding API) shared across all entities is simpler and more predictable than per-entity limits. Entity-level parallelism is achieved by having each entity produce geocoding requests into the shared pool.

6. **Multi-location entities**: **Supported in Phase 1 via LocationType discriminator.** `RecordGeoCode.LocationType` (NVARCHAR(50), default: 'Primary') with UNIQUE constraint on `(EntityID, RecordID, LocationType)`. The LLM in CodeGen detects address field groupings (e.g., HomeAddress/HomeCity vs WorkAddress/WorkCity) and emits separate `GeoFieldMapping` entries with appropriate LocationType values ('Home', 'Business', etc.). For normalized address tables, geo attaches to the Address record itself — no LocationType needed. The `__mj_Latitude`/`__mj_Longitude` virtual fields JOIN to LocationType = 'Primary' by default.

## Remaining Open Questions

1. **County-level precision**: The `Precision` enum includes `'county'` but Phase 1 has no County reference table. Should Google Geocode results that resolve to county level store `Precision='county'` with null CountryID for the county-level FK? (Yes — store the precision, leave the FK null until a County table exists.)
