# Geocoding Efficiency & Address-Level Dedup — Analysis and Improvement Plan

**Status:** Phases 1 & 2 IMPLEMENTED (branch `feature/geocoding-efficiency-address-dedup`); Phase 3 deferred
**Scope:** `packages/geo/geo-core`, `packages/Actions/CoreActions` (`ScheduledGeocodingAction`), `GenericDatabaseProvider` save hook, `RecordGeoCode` schema
**Date:** 2026-07-06

## Implementation status (2026-07-06)

| Plan item | Status | Notes |
|---|---|---|
| #1 SQL-side NOT EXISTS missing filter | ✅ | `buildNeedsWorkFilter` in the action; `existingGeoCodesMap` / `ExistingGeoCodeInfo` / bulk map load removed entirely |
| #2 DB-side distinct EntityIDs | ✅ | Keyset-distinct loop (`TOP 1 WHERE EntityID > @last ORDER BY EntityID`) — one indexed query per distinct entity, no metadata query needed |
| #3 In-run address memo | ✅ | `GeocodeMemo` (`Map<provider\|normalizedAddress, Promise>`), passed via new `GeoSyncOptions.memo`; coalesces concurrent duplicates; rejected promises evicted so transient errors retry |
| #4 Collapse pending double-save | ✅ | `CreateGeoCodeRow` carries hash + pending on the INSERT (3 saves → 2 per new geocode) |
| #5 Retry pagination drift | ✅ | Refetch-from-start + attempted-ID guard (mirrors orphan-cleanup pattern; guard prevents re-failed-row loops) |
| #6 Cheaper cache invalidation | ✅ | `cacheInvalidationNeeded()` — reload + synthetic save event skipped when LocalCacheManager is uninitialized/entity-caching-disabled AND no BaseEngine caches the entity. Per-fingerprint checks deliberately NOT used (Redis shared storage can hold entries the local index doesn't see) |
| #7 Persistent `GeoAddressCache` | ✅ | Migration `V202607091200__v5.47.x__Geo_Address_Cache.sql` → entity `MJ: Geo Address Caches`. Layered lookup in `GeoCodeSyncService`: memo → cache → provider, write-through gated on `AllowsPersistentStorage` (the flag finally has its job), negative caching with 30-day TTL. **Deviation:** per-record indexed point reads instead of per-page `IN (...)` — with the memo, cache reads = unique addresses per run, so batching added no value |
| #8 Staleness sweep for bulk SQL updates | ✅ | Stale clause (`__mj_UpdatedAt > rgc.GeocodedAt`, Status='success') OR'd into the needs-work filter; `GeoSyncOptions.touchOnHashMatch` refreshes GeocodedAt on hash match (no API call) so verified rows exit the sweep |
| #9 Provider batch APIs | ⏸ Deferred | Phase 3 |
| #10 RunView count suppression | ⏸ Deferred | Phase 3 (framework-level) — mostly moot now that pages contain only actionable records |

**Implementation note:** CodeGen's LLM geo-detection auto-flagged the new cache
table itself as geo-enabled (`SupportsGeoCoding=1` + Geo* ExtendedTypes on its
address/lat/lng columns), which would have made the scheduled job geocode the
cache table. The migration's hand-written correction block locks
`SupportsGeoCoding=0` / `AutoUpdateSupportsGeoCoding=0`, clears the
ExtendedTypes, removes the erroneous virtual lat/lng EntityFields, and a second
generated section recreates `vwGeoAddressCaches` without the geo JOIN.

---

## 1. How the system works today

Three cooperating layers:

1. **Save path (live)** — `GenericDatabaseProvider.OnSaveCompleted()` calls
   `GeoCodeSyncService.SyncIfChanged(entity, user)` when a geo field was dirty or the
   record is new. Per-record SHA-256 hash of the geo field values (`SourceFieldHash`)
   is compared against the stored `RecordGeoCode` row; unchanged hash → no API call.

2. **Scheduled job (safety net)** — `ScheduledGeocodingAction` (weekly, Sat 2 AM UTC,
   `metadata/scheduled-jobs/.geocoding-maintenance-job.json`, BatchSize 100) runs three
   phases: **missing** (records with address data but no `RecordGeoCode` row),
   **failed retries** (`Status='failed' AND RetryCount < MaxRetries`), and **orphan
   cleanup** (`RecordGeoCode` rows whose source record was deleted).

3. **Provider layer** — `GeocodingProviderRegistry` resolves `geocodio` / `here` /
   `google`; each provider issues **one HTTP request per address** via
   `BaseGeocodingProvider.fetchJson`.

`RecordGeoCode` is keyed `UNIQUE(EntityID, RecordID, LocationType)` — strictly
**per-record**, never per-address.

---

## 2. Answer: is there address-level reuse? **No.**

There is currently **no mechanism that reuses a previously computed geocode for the
same address value on a different record**:

- `SourceFieldHash` is *change detection for one record*, not a shared cache key.
  Two records (or 10,000 members at the same organization address) with byte-identical
  addresses each make their own external API call.
- No persistent address→coordinates cache table exists.
- No in-run/in-memory memoization exists — even within a single scheduled run, a
  concurrent batch of 100 records containing 40 copies of the same address fires 40
  API calls.
- No negative caching by address — a not-geocodable address string ("TBD") is marked
  `RetryCount=9999` per record; the same string on another record is retried fresh.
- Provider batch endpoints are unused (Geocod.io supports up to 10,000 addresses per
  batch POST; HERE has a batch geocoder). Everything is 1 address = 1 HTTP round trip.
- `IGeocodingProvider.AllowsPersistentStorage` is declared (and set `true` on all three
  providers) but **never consumed anywhere** — it was clearly intended as the ToS gate
  for exactly this kind of cache and is dormant.

For association-style datasets (members sharing organization/chapter addresses,
households, PO boxes), 30–60% duplicate address rates are common — meaning roughly
that fraction of external API spend and wall-clock time is currently wasted.

---

## 3. Memory analysis of the scheduled job (ranked by impact)

### 3.1 `loadExistingGeoCodesMap` — O(entire RecordGeoCode table per entity) ← biggest
`scheduled-geocoding.action.ts` loads **every** `RecordGeoCode` row for the entity
(`IgnoreMaxRows: true`) into a `Map<string, ExistingGeoCodeInfo>` before paging begins.
The in-code comment estimates ~15 MB per 50k rows; at 500k records that's ~150 MB
retained for the whole entity pass, **plus** the transient raw `RunView` results array
(similar size) alive until GC — peak roughly 2× the map. It is rebuilt per geo-entity,
and the full cost is paid even when the entity has **zero** missing records.

The irony: the map's only use in the missing pass is `!existingMap.has(key)` — a
filter that SQL could apply for free (see fix #1).

### 3.2 Orphan cleanup pre-query — full-table column scan into memory
`cleanupOrphanedRecords` fetches `EntityID` of **every** `RecordGeoCode` row
(`IgnoreMaxRows: true`) just to compute a client-side distinct. At 500k rows that's a
~50–80 MB transient array for what should be `SELECT DISTINCT EntityID` (a few rows).

### 3.3 Full-table walk as `entity_object`, mostly over already-geocoded rows
The missing pass pages **all** records with address data (500/page) as full
`BaseEntity` instances — every field materialized, getters/setters, dirty-tracking
old-value copies — then discards ~100% of each page on a steady-state run where almost
everything is already geocoded. Bounded retained size, but enormous allocation/GC churn
on large entities (500k rows → 500k heavyweight entity instantiations per run), which
reads as sustained high memory in process monitors.

### 3.4 Per-page `COUNT(*)` on the DB
`RunView` issues a `SELECT COUNT(*)` over the filtered base view whenever a page comes
back full (confirmed in `GenericDatabaseProvider` `BuildTotalRowCountSQL` + the
`retData.length === maxRowsUsed` re-count path). The geo base view LEFT JOINs
`vwRecordGeoCodes`, so a 500k-row entity walk = ~1,000 data queries **and ~1,000 full
COUNT(*) scans**. Not client memory, but a major hidden DB cost; the count only feeds
the log denominator.

### 3.5 Per-success overhead: reload + synthetic save event + write amplification
For each record actually geocoded:
- `entity.InnerLoad(entity.PrimaryKey)` — full reload just to fire a cache-invalidation
  event.
- A synthetic BaseEntity save event → `LocalCacheManager`/`BaseEngine` listener work
  per record (50k geocodes = 50k event dispatches).
- **Three** `RecordGeoCode` saves per new geocode: `CreateGeoCodeRow` INSERT (save #1),
  the pending-status UPDATE in `ProcessMapping` (save #2), then `UpdateSuccess` (save #3).
  Two of those are trivially mergeable.

### 3.6 Functional gaps found along the way (not memory, worth fixing)
- **Stale-hash records are never revisited by the job.** The missing pass skips any
  record that has *any* `RecordGeoCode` row; the retry pass only takes `Status='failed'`.
  So a bulk SQL `UPDATE` that changes addresses (the exact scenario the job exists for)
  leaves `success` rows with stale hashes that nothing re-geocodes.
- **Retry pagination offset drift.** `processFailedRetries` advances `StartRow` by
  PAGE_SIZE, but processed rows leave the `Status='failed'` filter (or reorder via
  `RetryCount ASC`), so later pages skip unprocessed rows within a run. (Orphan cleanup
  already uses the correct "always refetch page 1" pattern.)
- `loadSourceEntities` is an N+1 per-row `InnerLoad` loop (acceptable for small retry
  sets; batch with an `IN` filter if retry volumes grow).

---

## 4. Improvement plan

### Phase 1 — Memory & query efficiency (no schema change, biggest wins)

1. **Push the "missing" filter into SQL; delete `loadExistingGeoCodesMap`.**
   Mirror the existing orphan-cleanup `NOT EXISTS` technique in reverse:
   ```sql
   (<geoField1> IS NOT NULL OR ...) AND NOT EXISTS (
     SELECT 1 FROM __mj.vwRecordGeoCodes rgc
     WHERE rgc.EntityID = '<id>' AND rgc.RecordID = CAST(src.<pk> AS NVARCHAR(450))
   )
   ```
   (built via `SQLDialect` like the orphan filter). Effects:
   - The whole-table `ExistingGeoCodeInfo` map disappears → removes the single largest
     memory consumer (§3.1).
   - Pages now contain **only actionable records**, so `entity_object` per page is
     justified (every row gets geocoded) and the steady-state run touches ~0 rows
     instead of walking the entire table (§3.3) — also eliminating most per-page
     COUNT(*) scans (§3.4).
   - Keyset pagination note: because processed rows immediately leave the NOT EXISTS
     filter, this can also use the refetch-from-start pattern; keep keyset for safety
     against permanently-failing rows (they get a row, so they leave the filter anyway).

2. **Orphan cleanup: distinct at the database.** Replace the `IgnoreMaxRows` full
   column scan with a metadata query (`SELECT DISTINCT EntityID FROM vwRecordGeoCodes`),
   alongside the existing `geocode-bulk-lookup` query, or a RunView aggregate. Kills §3.2.

3. **In-run address memoization.** In `GeoCodeSyncService` (or the action), key a
   `Map<normalizedAddressKey, Promise<GeocodeResult | null>>` per run so concurrent and
   sequential duplicates within a run coalesce into one provider call — including
   negative results. Normalization: lowercase, trim, collapse whitespace over the
   ordered geo component values. This alone removes intra-run duplicate API calls with
   ~30 lines of code and no schema work.

4. **Collapse the pending-row double save.** `CreateGeoCodeRow` should accept
   hash/status so INSERT carries them (3 saves → 2 per new geocode).

5. **Fix retry pagination drift** — refetch from `StartRow: 1` each loop (rows leave
   the filter as they're processed), guarding against infinite loops when every row in
   a page fails again (track processed IDs or stop when a full pass makes no progress).

6. **Cheapen cache invalidation.** Before the per-record `InnerLoad` + synthetic save
   event, check whether the server cache actually holds anything for that entity (or
   batch invalidations per entity at end-of-page). Skips ~1 SQL round trip + event
   dispatch per geocoded record when nothing is cached.

### Phase 2 — Persistent address-level geocode cache (the real dedup answer)

7. **New table `GeoAddressCache`** (name TBD; entity `MJ: Geo Address Caches`):
   ```
   ID, AddressHash NVARCHAR(64) UNIQUE,      -- SHA-256 of normalized address string
   NormalizedAddress NVARCHAR(1000),          -- for debuggability/audit
   Latitude, Longitude, Precision,
   CountryID, StateProvinceID,
   Status ('success' | 'not_geocodable'),     -- negative caching included
   GeocodingSource, Provider, Confidence,
   GeocodedAt, ExpiresAt NULL                 -- optional TTL, esp. for negatives
   ```
   Lookup order in `GeoCodeSyncService.Geocode()`: native lat/lng → **address cache** →
   external provider (write-through on hit-miss) → reference-data centroid.
   - **Gate persistence on `provider.AllowsPersistentStorage`** — this finally gives the
     dormant flag its intended job and keeps ToS-restricted providers cache-exempt.
   - Batch-friendly: the scheduled job pre-computes the page's address hashes and does
     one `WHERE AddressHash IN (...)` lookup per page (bounded — never a whole-table
     load; do not repeat §3.1's mistake here).
   - Serves the **save path too**: bulk imports where thousands of rows share addresses
     get instant cache hits at save time, not just in the weekly job.
   - Expected effect at 100k+ record scale with typical duplicate rates: 30–60% fewer
     external API calls, plus cross-run and cross-entity reuse forever after.

8. **Staleness pass for bulk SQL updates** (fixes the §3.6 gap). Cheap SQL-side
   detection, no hashing needed:
   ```sql
   EXISTS (SELECT 1 FROM __mj.vwRecordGeoCodes rgc
           WHERE rgc.EntityID='<id>' AND rgc.RecordID = <pk-as-string>
             AND rgc.Status='success' AND src.__mj_UpdatedAt > rgc.GeocodedAt)
   ```
   Records updated after their geocode get re-run through `SyncIfChanged`, whose
   existing hash comparison then decides cheaply whether the address actually changed
   (most such records won't have — hash matches, no API call, just refresh
   `GeocodedAt`/hash row so they exit the stale filter).

### Phase 3 — Provider throughput (optional, when volumes demand it)

9. **Batch geocoding support.** Add an optional `GeocodeBatch(requests: GeocodeRequest[])`
   to `IGeocodingProvider` (capability-gated, like the bridge-feature pattern).
   Geocod.io: up to 10,000 addresses per POST; HERE: async batch jobs. The scheduled
   job collects a page's unique uncached addresses into one batch call. Turns 500
   sequential-ish HTTP round trips per page into 1, and dramatically shortens run time
   (shorter runs = shorter memory-elevated windows).

10. **RunView count suppression (framework-level, nice-to-have).** A
    `SkipTotalRowCount` param on `RunViewParams` for pagination loops that don't need a
    denominator — the geocoding job would count once per entity (`count_only`) for the
    progress log, then page without per-page COUNT(*).

---

## 5. Expected outcomes

| Fix | Memory | External API calls | DB load |
|---|---|---|---|
| #1 NOT EXISTS missing filter | −150–300 MB peak/entity; near-zero churn on steady-state | — | −(N/500) COUNT(*) scans + full-table page walk |
| #2 DISTINCT EntityID | −50–80 MB transient | — | one aggregate vs full column scan |
| #3 in-run memo | negligible | −(intra-run duplicate rate) | — |
| #7 persistent address cache | bounded per-page lookups | −30–60% typical; compounding across runs | +1 indexed lookup/write per geocode |
| #9 batch API | shorter run window | same count, ~100× fewer HTTP round trips | — |

Phases 1–2 are independent of each other per-item and all low-risk; #1 + #2 + #3 alone
should resolve the observed memory profile, and #7 answers the dedup requirement
durably. Testing: extend `geo-core`'s existing Vitest suite
(`GeoCodeSyncService.test.ts`) for the memo + cache lookup paths, and add a
deterministic integration suite case per the repo's integration-testing rule.
