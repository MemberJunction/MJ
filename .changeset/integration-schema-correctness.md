---
"@memberjunction/integration-engine": minor
"@memberjunction/integration-schema-builder": patch
"@memberjunction/server": patch
---

fix(integration): schema correctness + lifecycle — large-text columns, overflow handling, phantom-skip, sizing

Integration schema fixes proven end-to-end via the GraphQL stand-up path (clean DB, CreateConnection → ApplyAll → StartSync) across PropFuel, OpenWater, Path LMS, ORCID:

- **`json`/`text`/`array`/`object` fields now map to `NVARCHAR(MAX)`** instead of being collapsed to a bounded `nvarchar(255)`. A nested-array field's serialized JSON routinely exceeds 255 chars; under the bounded sizing it was sized at 255 and every record with a non-trivial value was then dropped at sync time. (OpenWater `Program` — whose `rounds` is a json array — went from syncing **0** rows to syncing all of them.)
- **String-overflow is skip-and-surface, not truncate.** A value wider than its bounded column raises a structured `STRING_OVERFLOW_SKIPPED` SyncWarning and skips that one record rather than silently truncating the value or failing the batch. With large-text fields now `MAX`, this is a pathological-case safety valve, not a routine path.
- **Bounded scalar strings keep a small, space-efficient size** (255 floor; declared length + headroom when the source reports one; PK strings capped at the dialect index-key limit). "Provable-first": a declared size wins; the floor is only the default when the source reports none.
- **Schema lifecycle — active-only materialization (phantom-skip).** `buildSourceSchemaFromPersistedRows` now materializes only `Status='Active'` objects/fields, so a deactivated (source-absent) object is never given a table/column — avoiding empty phantom tables and the per-entity CodeGen/advancedGen cost they incur. A `DeactivateAbsent` option on `PersistDiscoveredSchema` deactivates declared-but-absent objects on a comprehensive refresh (deactivate, never delete). The custom-column promoter reactivates an existing inactive field rather than creating a duplicate column (removed-then-re-added handled idempotently).
