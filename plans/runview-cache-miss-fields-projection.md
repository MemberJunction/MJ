# RunView Cache-Miss Fields Projection Fix

**Status:** Implemented (this branch)
**Package:** `@memberjunction/core` — [providerBase.ts](../packages/MJCore/src/generic/providerBase.ts)
**Discovered:** 2026-06-10, while debugging Query Builder agent runs whose `ALL_ENTITIES`
data source returned ~745KB of full entity-metadata rows despite requesting only 5 fields.

## Problem

The RunView caching pipeline intentionally widens `params.Fields` to ALL entity fields
whenever a query is cacheable, so each cache entry is a **universal superset** that can
satisfy any future field subset for the same entity+filter (the cache fingerprint
deliberately excludes `Fields` and `ResultType`). The design contract is:

- **Cache write:** store all columns (superset)
- **Cache read (hit):** project the cached rows down to the caller's requested `Fields`
- **Cache miss:** fetch all columns from the DB, store them, **and return the caller's
  requested shape**

The first two were implemented. The third was not — `callerRequestedFields` was captured
in `PreRunView`/`PreRunViews` but never used on the miss path, so the widened all-columns
DB result was returned to the caller as-is.

### Symptoms

1. **Asymmetric result shapes.** The same `RunView` call returns every column on a cache
   miss and only the requested columns on a cache hit. Callers cannot rely on the shape
   of their results; code that serializes results (agents, exports, logs) silently bloats
   depending on cache temperature.
2. **Agent context/storage bloat (observed).** The AI Agent framework's data-source
   preloader requested `["Name", "Description", "SchemaName", "BaseTable", "BaseView"]`
   from `MJ: Entities` (342 rows). On miss it received all ~70 columns — ~745KB instead
   of ~50KB — which was then persisted into every `AIPromptRun.Messages` row (~2.5MB
   each, 6+ prompt runs per agent run).
3. **Downstream cache poisoning risk.** Client-side smart-cache flows store whatever rows
   the server returns under a `Fields`-agnostic fingerprint. A server that sometimes
   returns narrow rows (hit) and sometimes wide rows (miss) makes the client cache's
   contents nondeterministic.

## Fix

All changes in [packages/MJCore/src/generic/providerBase.ts](../packages/MJCore/src/generic/providerBase.ts):

1. **New exported pure helper `ProjectRowsToFields(rows, requestedFields)`** — the single
   projection primitive: case-insensitive, whitespace-trimming, never mutates input rows,
   returns the original array untouched when no projection is requested. The two existing
   inline (duplicated) hit-path filters were replaced with calls to it.
2. **Single path:** `_preRunViewResultType` gains `callerRequestedFields?: string[] | null`.
   `PreRunView` returns it **only when it actually widened `params.Fields`** (entity
   resolved + `willCache`). `PostRunView` projects `result.Results` down to it — strictly
   **after** the cache writes (the cache must keep the superset) and **before**
   `TransformSimpleObjectToEntityObject`, and only when `ResultType !== 'entity_object'`
   (entity objects need all fields).
3. **Batch path:** `_preRunViewsResultType` gains `callerFieldsMap?: Map<number, string[]>`
   keyed by original param index, populated in `PreRunViews` under the same
   widening-happened condition. `PostRunViews` projects each non-hit, successful,
   non-`entity_object` result after `Promise.all(cachePromises)` and before the
   transform loop. Cache-hit indexes are skipped (already projected at read time).

### Invariants preserved

- Cache entries still store the full-column superset (projection happens after writes).
- `entity_object` results are never projected (they require all fields to be valid).
- Non-cacheable calls (`BypassCache`, `AfterKey`, cache-disallowed entities) are
  untouched — `Fields` was never widened for them, so `callerRequestedFields` is null
  and projection is a no-op.
- Original key casing from the DB rows is preserved; matching is case-insensitive.

## Tests

[providerBase.projectRowsToFields.test.ts](../packages/MJCore/src/__tests__/providerBase.projectRowsToFields.test.ts)
— 16 tests covering projection (case-insensitivity, trimming, missing/unknown fields,
falsy value preservation, ragged rows), pass-through identity behavior, immutability,
and a hit/miss shape-symmetry regression case.

Also fixed a pre-existing flaky test in `metadata.test.ts` (`should pass contextUser to
provider`): module-level `vi.fn()` mocks kept call history across tests because
`restoreAllMocks()` only restores spies. Added `vi.clearAllMocks()` to `beforeEach`.

Full MJCore suite: 64 files, 1,230 tests passing.

## Follow-up (not in this branch)

**Client smart-cache `Fields` handling** ([providerBase.ts](../packages/MJCore/src/generic/providerBase.ts),
`prepareSmartCacheCheckParams` / `executeSmartCacheCheck`): the client-side smart-cache
flow only widens `Fields` for `entity_object` results. A `simple` + narrow-`Fields` +
`CacheLocal` query sends narrow fields to the server and stores the (now consistently
narrow) response under a `Fields`-agnostic client fingerprint — a later client query for
a *different* field subset of the same entity+filter would hit that narrow entry and
silently miss columns. This predates the fix here and needs its own design decision:
either widen `Fields` client-side before sending when `CacheLocal` (mirroring the
traditional flow, at the cost of wider wire payloads), or include `Fields` in the
client-side fingerprint. Tracked separately.
