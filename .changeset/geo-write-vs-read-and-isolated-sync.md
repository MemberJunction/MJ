---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/actions": patch
"@memberjunction/ng-map-view": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/geo-core": patch
---

Split geo **read** (`SupportsGeoCoding`, maps, distance, virtual PrimaryAddress / `__mj_Latitude_{FK}`) from geo **write** (GeoCodeSyncService only when 1+ writable Geo* fields exist; skip provider when native lat/lng already set). mj-sync `push.skipGeoCoding` per entity. Parallel push default 10 uses `CreateIndependentInstance()` (shared pool, own TX) instead of defaulting to 1. Durable AfterCreate without a queue submitter defers until transaction depth is 0 (fire-and-forget), not nested in the save.
