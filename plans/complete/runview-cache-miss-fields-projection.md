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

## Client smart-cache `Fields` handling (implemented in this branch)

Originally documented here as a tracked follow-up; implemented after review sizing
showed the fix could be small. The client-side smart-cache flow
(`prepareSmartCacheCheckParams` / `executeSmartCacheCheck` /
`processSingleSmartCacheResult`) does NOT widen `Fields` (narrow wire payloads are
the point client-side) and does NOT project on read — rows are stored exactly as
the server returned them. Under the `Fields`-agnostic fingerprint, a narrow cached
entry passed the staleness check for a DIFFERENT field subset of the same
entity+filter (`maxUpdatedAt`/`rowCount` are column-independent) and silently
served rows missing the newly requested columns.

**Fix — exact-match per-Fields client slots:** a new `clientCacheFingerprint()`
appends `|f:<normalized fields>` (trim + lowercase + sort; `*` for all-fields) to
the shared fingerprint, used at all five client smart-cache read/write/merge
sites. Each field subset now stores, validates, and serves its own shape. The
SERVER fingerprint is unchanged — it stores one widened superset per entity+filter
and projects per-read, so a single Fields-agnostic slot remains correct there.

**Deliberately rejected:** subset-serving narrow requests from wider cached
entries (candidate enumeration + per-entry field metadata + "prefer widest" +
row-level differential merge). Codebase scan found exactly one file (13 call
sites, Testing dashboard KPIs) combining client `CacheLocal` + narrow `Fields` —
the hit-rate upside doesn't justify the machinery, and the design carries two
correctness traps: staleness validation must target the candidate entry actually
served, and `{...existingWideRow, ...freshNarrowRow}` merges can blend fresh and
stale column values into one row under an advanced `maxUpdatedAt` that never
re-validates.

Cost: client entries written before this change are orphaned (new suffixed keys
miss them); they expire/invalidate normally. One-time cold start, no migration.

## Addendum (review follow-up, same branch)

A skeptical review of the original commit surfaced two gaps, both fixed here:

### 1. Dedup/linger key now includes `Fields` and `ResultType`

`GenerateDedupKey` excluded `Fields` with the rationale "cache stores full entity
width and filters on return" — but that premise describes the **cache** layer, not
the **dedup** layer. The dedup/linger machinery (`RunViews` in-flight sharing, the
5s linger window, `RunViewsUncoalesced`, and per-param coalescing slots) shares the
FINAL pipeline output: rows already projected down to one caller's `Fields` and
already transformed per that caller's `ResultType`, handed to subsequent callers
via shallow array copy with no re-projection. So caller B requesting
`['ID','Name','Description']` within the linger window of caller A's `['ID','Name']`
query received A's narrower rows and silently lost `Description`.

This was **pre-existing** on the hit path (since the May 2026 widening change) and
for non-cacheable calls (where Fields is respected end-to-end); the miss-projection
fix made shapes consistently narrow and so removed the last configuration in which
the stale rationale happened to hold. The fix: `Fields` (normalized — trim,
lowercase, sort — so semantically identical requests still share) and `ResultType`
(entity objects vs plain rows vs count-only are not interchangeable representations)
are now part of the dedup key. The **cache** fingerprint correctly still excludes
both — the cache stores the superset and projects/transforms per-read.

Trade-off: truly concurrent same-query-different-Fields callers no longer share one
execution. The second caller typically lands a cache hit written by the first, so
the realistic cost is one extra cache read — correctness over a marginal share.

### 2. End-to-end integration tests for the pipeline wiring

The original commit unit-tested only the pure `ProjectRowsToFields` helper. The
pipeline wiring — the guard conditions in `PostRunView`, the hit-skip + per-index
alignment in `PostRunViews`, and the cache-write-before-projection ordering — is
the part a refactor is most likely to break, and `providerBase.fieldsOverride.test.ts`
already had a full harness (`FieldsOverrideTestProvider` + `MockCacheStorageProvider`)
capable of exercising it. Added a `cache MISS projection (hit/miss shape symmetry)`
describe block: miss returns narrow while cache stores wide; miss/hit shape equality;
no-Fields pass-through; batch per-index projection; and a mixed HIT+MISS batch that
pins merge/projection index alignment. Also corrected a stale comment in the existing
cache-coherence test that documented the old "MISS returns wide rows" behavior, and
strengthened that test to assert the projected miss shape.

`providerBase.dedup.test.ts`: inverted the test that locked in Fields-exclusion
(now asserts separation), plus new tests for normalization-equivalence sharing,
ResultType separation, and linger isolation across different-Fields callers.

### 3. Client-side Fields-aware cache fingerprint (see section above)

`providerBase.clientFieldsFingerprint.test.ts` adds a client-mode harness (stub
`RunViewsWithCacheCheck` server) pinning: cross-subset isolation (the poisoning
regression), same-subset revalidation, normalization equivalence, all-fields
slot separation, and the `|f:` storage key shape. `MockCacheStorageProvider`
gained the batched `GetItems` API that `LocalCacheManager.GetRunViewResults`
requires (its absence silently disabled smart-cache reads in tests).
