---
"@memberjunction/integration-engine": minor
"@memberjunction/integration-schema-builder": patch
"@memberjunction/server": minor
"@memberjunction/codegen-lib": patch
---

fix(integration): schema/sync correctness — large-text columns, overflow handling, phantom-skip, sizing, StartSync honesty, soft-PK cache

Integration framework fixes proven end-to-end via the GraphQL stand-up path (clean DB,
CreateConnection → ApplyAll → StartSync) across PropFuel, OpenWater, Path LMS, ORCID, GrowthZone.

**Schema correctness (`integration-engine`, `integration-schema-builder`):**
- `json`/`text`/`array`/`object` fields now map to `NVARCHAR(MAX)` instead of being collapsed to a
  bounded `nvarchar(255)`. A nested-array field's serialized JSON routinely exceeds 255 chars; under
  the bounded sizing it was sized at 255 and every record with a non-trivial value was then dropped at
  sync time. (OpenWater `Program` — whose `rounds` is a json array — went from syncing **0** rows to
  syncing all of them.)
- String-overflow is **skip-and-surface, not truncate**: a value wider than its bounded column raises
  a structured `STRING_OVERFLOW_SKIPPED` SyncWarning (new `StringOverflowError`) and skips that one
  record rather than silently truncating or failing the batch. With large-text fields now `MAX`, this
  is a pathological-case safety valve, not a routine path.
- Bounded scalar strings keep a small, space-efficient size (255 floor; declared length + headroom when
  the source reports one; PK strings capped at the dialect index-key limit). Provable-first: a declared
  size wins; the floor is only the default when the source reports none.
- Schema lifecycle — **active-only materialization (phantom-skip)**: `buildSourceSchemaFromPersistedRows`
  materializes only `Status='Active'` objects/fields, so a deactivated (source-absent) object is never
  given a table/column — avoiding empty phantom tables and their per-entity CodeGen/advancedGen cost.

**StartSync honesty (`server`):**
- `IntegrationStartSync` no longer returns an optimistic `{Success:true, RunID:null}` for fast/no-op
  syncs. It resolves the run by recency (`StartedAt >= firedAt`, any status) over a short bounded poll,
  so an already-finished run is reported with its real `RunID`; when no run appears, it returns
  `Success:false` with an explanatory message so a caller/scheduler can act instead of being stranded.

**Soft-PK config cache (`codegen-lib`):**
- `RunInProcess` now invalidates `ManageMetadataBase`'s soft-PK/FK config cache at the start of each
  in-process run. The cache was keyed on file path only and never reloaded, so in the long-lived MJAPI
  RSU CodeGen path a connector's first ApplyAll wrote its soft PKs but CodeGen returned the pre-write
  cached config → "No primary key found" → entity never created → 0 rows synced until restart.
  Deterministic + event-driven (no mtime/TOCTOU); the CLI `Run()` path is unchanged.

**Migration + metadata (additive schema → minor):** ships a forward migration and integration
metadata seeds. Additive only — no column drops, narrowing, renames, or new required params — so it
is a backward-compatible **minor** per the publish-then-no-breaking-changes policy.
