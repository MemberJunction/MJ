---
"@memberjunction/core": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/ai-vectors": minor
"@memberjunction/ai-vector-sync": patch
"@memberjunction/core-actions": patch
---

Add keyset (seek) pagination to `RunView` via the new `RunViewParams.AfterKey: CompositeKey` field. Iterating large entities (background jobs, scheduled actions, bulk processing) now stays O(log N) per page regardless of depth — `StartRow`-based OFFSET pagination is unchanged and remains the right choice for UI grids.

**Framework changes**
- New `RunViewParams.AfterKey: CompositeKey` accepted by all RunView entry points (TS, GraphQL, REST flows that go through RunView).
- New exported error class `AfterKeyNotSupportedError` (with `Reason` codes `CompositePK | UnsupportedPKType | IncompatibleOrderBy | StartRowConflict | AfterKeyShape`).
- New exported helper `IsKeysetPaginationOrderableType(sqlType)` and constant `KEYSET_PAGINATION_ORDERABLE_PK_TYPES`.
- Keyset queries bypass server cache (read + write) automatically — they're inherently single-use so caching is pure overhead.
- v1 constraint: single-column PK only. Composite-PK entities throw `AfterKeyNotSupportedError` with `Reason: 'CompositePK'`.

**Migrated callers (now use keyset by default when entity has a single-column PK)**
- `ScheduledGeocodingAction` (`processMissingForEntity`) — falls back to OFFSET on composite-PK entities.
- `VectorBase.PageRecordsByEntityID` + `EntityVectorSyncer.startDataPaging` — auto-promotes to keyset when possible. New helper `VectorBase.CanUseKeysetPagination()`. New optional `PageRecordsParams.AfterKey`.

**Metadata**
- `Geocoding Maintenance` scheduled job cron updated to weekly (Saturdays 2 AM UTC); description reworded to not hard-code a cadence. Administrators can adjust the `CronExpression` as needed.

**Documentation**
- New guide: `guides/KEYSET_PAGINATION_GUIDE.md`.
- `CLAUDE.md` performance section updated.

**Out of scope for v1**
- `ExternalChangeDetection.ChangeDetector` uses `RunQuery` (saved queries with arbitrary SQL), which the framework can't safely rewrite. Stays on OFFSET; tracked as a follow-up.

**Backwards compatibility**
- Fully additive. Existing callers that don't pass `AfterKey` are unaffected.
