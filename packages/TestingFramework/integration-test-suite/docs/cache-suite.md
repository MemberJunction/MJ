# Cache Sub-Suite — server-cache · client-cache · runquery-cache · dataset-cache · aggregates-cache · cache-gauntlet

**Family:** the caching integrity suites — 6 bundles, **71 checks** (32 + 13 + 12 + 3 + 3 + 8), all members of the **"Integration Tests — Deterministic"** suite (IT01, IT03, IT02, IT07, IT08, IT29). Run via `npm run test:integration` (repo root) or a single bundle with `MJ_INTEGRATION_TEST=1 npx mj test run --name "IT01 - Server RunView Cache Integrity"`. Candidate-design ancestry: [test-catalog.md](test-catalog.md); defect cross-reference: [bug-register.md](../../../../plans/integration-test-expansion/bug-register.md).

This family is the deepest-covered domain in the suite for a reason: MJ's multi-tier cache (server `LocalCacheManager` with `TrustLocalCacheCompletely=true`, the client CacheLocal slots over GraphQL, the RunQuery TTL/smart-validation cache, the dataset cache, and aggregate slots) has repeatedly shipped bugs of the *silent wrong data* class — #3195 (subset `totalRowCount` collapse), #3199/B30 (subset-slot in-place maintenance), B38 (schemaHash stripped by maintenance writes), B40 (aggregates dropped on CacheLocal), B45/B46 (RunQuery permission/category gaps). Every one of those now has a pinning check here.

## Mechanism under test

- **Server cache** (`LocalCacheManager` on the server provider): every `RunView`/`RunViews` checks the cache first; small unfiltered/unordered results auto-cache and are maintained **in place** via BaseEntity save/delete events; filtered or subset slots are **invalidated**, never patched. The proof technique is the `InstrumentedLocalStorageProvider` installed as `LocalCacheManager`'s **first caller** (hence the dedicated-process rule, `MJ_INTEGRATION_TEST=1`): per-category read/write counters (`RunViewCache`, etc.) make "the DB was not touched" an assertable fact.
- **Client cache**: `GraphQLDataProvider` slots keyed by a client fingerprint (incl. the `|f:` fields segment), opt-in via `CacheLocal`, revalidated against the server. Client checks run against a **live MJAPI** through `bootstrapIntegrationClient` (which preflights the server and fails fast).
- **RunQuery cache**: TTL mode and smart-validation mode (`CacheValidationSQL`), with its own fingerprint (`QueryName|QueryID|Category|Params[|Connection]` since the B46 fix).
- **Determinism technique**: `UniqueFilter(...)` appends an always-true, unique-per-run predicate so every check starts from a **cold slot** with zero mutation; `ExecutionTime === 0` is the cache-hit oracle for the gauntlet (a served-from-cache read never touches SQL).

## Bundle: `server-cache` (S1–S31 + S31b — 32 checks · IT01 · server in-process)

Ported verbatim from the original `server-cache-tests.ts`. Transport is deliberately **server in-process** — this is the canonical §3a exception: it counts the *server's* cache reads/writes via the instrumented storage, which the wire cannot observe. Fixtures: none for the deterministic checks (cold-slot reads over `MJ: Entities` / `MJ: Query Categories`); the six mutation checks (`RequiresMutation: true`, gated by `RUN_MUTATION_TESTS=1`) create and delete their own rows. Ordering is load-bearing for S1→S2→S3 (shared `s1` slot).

| Id | Assertion | Failure it catches |
|---|---|---|
| S1 | Cache MISS with narrow `Fields` returns only requested columns (+ forced PK); a `RunViewCache` write occurred | projection loss on the miss path; cache never populating |
| S2 | Subsequent HIT returns the identical shape | miss/hit shape asymmetry |
| S3 | HIT with a different field subset is served from the same superset entry | superset-serving regression (needless re-query) |
| S4 | No `Fields` → full entity width | pass-through width loss |
| S5 | Fields matching case-insensitive, original casing preserved | case-sensitivity drift |
| S6 | `entity_object` results are real BaseEntity instances even when a simple superset is cached | plain-object leakage into entity results |
| S7 | `BypassCache` skips cache entirely, still honors narrow Fields | bypass reading/writing the cache |
| S8 | `TotalRowCount` parity between miss and hit | count divergence on the hit path (#3195 family) |
| S9 | Batch `RunViews` projects each result to its own params | cross-item projection bleed |
| S10 | Mixed HIT+MISS batch — warm from cache, cold from DB, each correctly projected | batch-path cache dispatch errors |
| S11 | Linger-window callers with different Fields get their own shapes | dedup serving the wrong projection |
| S12 | Linger-window callers with different ResultType get their own representation | dedup serving the wrong result type |
| S13 | Identical repeat within linger window served without touching storage | linger dedup broken (double execution) |
| S14 | Different `ExtraFilter` values → independent entries | filter missing from fingerprint |
| S15 | `OrderBy` honored on miss and hit | order lost on cache serve |
| S16 | `MaxRows` limits rows and fingerprints separately | subset/unlimited slot collision (#3199 precondition) |
| S17 (mut) | Save invalidates the **filtered** entry; delete removes the row | stale filtered slots after mutation |
| S18 | `AfterKey` keyset pages never touch the cache, never poison the entity+filter slot | keyset pages cached as full sets |
| S19 | `count_only` returns TotalRowCount, zero rows, no row-cache poisoning | count queries corrupting row slots |
| S20 | Full-width query after a narrow bypass stays full-width (poisoning regression) | bypass writes poisoning subsequent reads |
| S21 | `entity_object` ignores narrow Fields — full field set always | partial entity instances (invalid saves) |
| S22 | Concurrent identical RunViews share one execution (in-flight dedup) | dedup loss → duplicate DB executions |
| S23 (mut) | Unfiltered auto-maintained entry upserts on save / removes on delete **in place** | in-place maintenance regression (stale or missing rows) |
| S24 (mut) | `AllowCaching=false` entities never touch the cache (flipped live, restored) | cache honoring stale AllowCaching |
| S25 | `TrustServerCacheCompletely=false` entities never touch the server cache | trust flag ignored |
| S26 | `MJ: Record Changes` is hardcoded cache-exempt | caching raw-SQL-written rows |
| S27 | `OrderBy` is part of cache identity — ASC/DESC never cross-serve | order missing from fingerprint |
| S28 | `IgnoreMaxRows` returns all rows even when the capped query cached first | cap leaking into uncapped reads |
| S29 (mut) | A stored view honors its own WhereClause through the cache | view/entity slot cross-serving |
| S30 (mut) | Renaming a parent refreshes cached child rows that denormalize its name | denormalized-name staleness |
| S31 | A read-denied user is never served cached rows | **security:** cache bypassing entity permissions |
| S31b (mut) | A read-denied user is never served a cached saved-view (ViewID) result another user warmed | **security:** ViewID slots bypassing permissions |

## Bundle: `client-cache` (C1–C13 — 13 checks · IT03 · client over GraphQL)

Runs against a live MJAPI via `GraphQLDataProvider` (`TrustLocalCacheCompletely=false`, `CacheLocal` opt-in); checks call `RunView` **without** a context user — the provider owns the identity, exactly as a browser does. C10 is the lone `RequiresMutation` check.

| Id | Assertion | Failure it catches |
|---|---|---|
| C1 | Plain RunView with narrow Fields returns only those columns over the wire | transport projection loss |
| C2 | Identical narrow request twice keeps identical shape (hit/miss symmetry over the wire) | server-cache shape drift observed from the client |
| C3 | `CacheLocal` MISS stores a client slot; repeat validated-current and served locally | client slot never written / never served |
| C4 | Different field subset gets its own client slot (the `|f:` fingerprint fix) | cross-subset serving (B44 family) |
| C5 | Full-width CacheLocal request not served from a narrow slot | narrow slot masquerading as full set |
| C6 | `entity_object` results materialize as BaseEntity instances client-side with CacheLocal | cached plain objects breaking entity semantics |
| C7 | Linger-window callers with different Fields get their own shapes (client dedup keying) | client dedup projection bleed |
| C8 | Batch RunViews with mixed CacheLocal projects each result to its own param | batch cache dispatch bleed |
| C9 | `count_only` works over the GraphQL transport | count queries broken on the wire |
| C10 (mut) | Client slot refreshes after save, drops the row after delete (revalidation round trip) | stale client slots after local mutation (B30/#3199 client leg) |
| C11 | Client RunQuery with CacheLocal — slot written, repeat revalidates over GraphQL | RunQuery client caching broken |
| C12 | Trust=0 entities: server never caches; client slots only with a validation timestamp | trust semantics diverging between tiers |
| C13 | `AggregateResults` returned in the caller's requested order over the client transport | **B40/B40b** (fixed): aggregates silently dropped on CacheLocal — this check went red on all four drop points and is the regression pin |

## Bundle: `runquery-cache` (Q1–Q12 — 12 checks · IT02 · server in-process, mutating by design)

Fixtures via `BundleLifecycle` (one Query Category + two Queries: TTL-mode and smart-validation-mode) with guaranteed Teardown; fixture-counted rows are `MJ: User Settings` under the `mj.integrationtest.rq` prefix so teardown can sweep leftovers. The whole bundle mutates by design, so the checks are **not** `RequiresMutation`-gated. Q12 reuses the seeded role-less principal `it-nogrant@integration.test` (shared with permission-engine PE9/PE10) and skips loudly if the seed isn't pushed.

| Id | Assertion | Failure it catches |
|---|---|---|
| Q1 | No CacheLocal → RunQuery cache never touched | cache writes without opt-in |
| Q2 | TTL mode: miss writes a slot; repeat serves with **zero execution** | TTL serve broken / double execution |
| Q3 | `CacheLocalTTL` expiry: expired slot re-executes and rewrites | immortal TTL slots |
| Q4 | BREAK: `MaxRows` must fingerprint separately | cross-shape serving (subset-slot family) |
| Q5 | TTL serves stale-by-design within TTL, fresh after expiry | TTL semantics drift |
| Q6 | Smart validation: current vs stale via `CacheValidationSQL` | validation SQL ignored (stale serves) |
| Q7 | Queries without CacheValidationSQL answer `no_validation` with fresh rows | fabricated validation status |
| Q8 | BREAK: failed executions are never cached | error results poisoning the cache |
| Q9 | BREAK: param objects with different key order are equivalent or safely separate | key-order fingerprint instability |
| Q10 | TTL slot serves byte-identical row data on hit | shape-only hits masking data corruption |
| Q11 | BREAK (**B46**, fixed): same-named queries in different categories must not share a slot — proven-to-fail (category-segment neuter → red) | category-blind fingerprint collision |
| Q12 | BREAK (**B45**, fixed): a cache HIT must enforce the same permissions as a MISS — proven-to-fail (roles-only neuter → red) | **security:** TTL hit weaker than the miss-path gate (also pins the B43 fix lineage) |

## Bundle: `dataset-cache` (DS1–DS3 — 3 checks · IT07 · server in-process, read-only)

Exercises `ProviderBase.GetAndCacheDatasetByName` over the real seeded `MJ_Metadata` dataset (overridable via selector config `datasetName`). Assertions are **behavioral**, not counter-based — verified against the live server that the dataset cache writes through the provider's own `LocalStorageProvider`, a *different* storage from the instrumented `LocalCacheManager` provider, so counters structurally cannot observe it. Zero mutation.

| Id | Assertion | Failure it catches |
|---|---|---|
| DS1 | Cold fetch populates the cache (`IsDatasetCached` false→true); warm fetch serves the same dataset | cold path never caching / warm divergence |
| DS2 | `IsDatasetCached` / `IsDatasetCacheUpToDate` agree with the warm state | status APIs lying about cache state |
| DS3 | `ClearDatasetCache` flips both status APIs back to false | cleared datasets still reporting cached/up-to-date |

## Bundle: `aggregates-cache` (AGG1–AGG3 — 3 checks · IT08 · server in-process, read-only)

Directly exercises `LocalCacheManager.GenerateRunViewFingerprint` / `generateAggregateHash` plus the aggregate round-trip. Default entity `MJ: User Settings` (selector-config overridable). Cold slots via an always-true column-agnostic unique predicate; zero mutation.

| Id | Assertion | Failure it catches |
|---|---|---|
| AGG1 | `Aggregates[]` participates in the fingerprint (aggHash) — no cross-aggregate collision | two views differing only in aggregates sharing a slot |
| AGG2 | `AggregateResults` round-trips through the cache — warm hit still returns aggregates | cache dropping aggregates (B40's server-side sibling risk) |
| AGG3 | Aggregate ORDER survives the cache — reordered `Aggregates[]` must not inherit the warming caller's order | order-blind aggregate serving |

## Bundle: `cache-gauntlet` (CG1–CG8 — 8 checks · IT29 · server in-process, ALL mutation tier)

The adversarial bundle for the **subset-slot × mutation** cell that shipped #3195 and #3199 — an audit found the exact bug class had no live coverage (S16 = slot identity, S17 = filtered maintenance, S23 = unfiltered maintenance; nothing ever *saved into* a subset slot). Contract asserted per-cell: unfiltered+unlimited maintains on save AND delete; filtered invalidates on save but legitimately removes-in-place on delete; MaxRows/StartRow subsets invalidate on both. Oracle: `ExecutionTime === 0` = cache hit. Every check creates/deletes its own tagged `MJ: User Settings` rows.

| Id | Assertion | Failure it catches |
|---|---|---|
| CG1 (mut) | A save must never inflate a `MaxRows` slot beyond its limit | #3199 save half regressing |
| CG2 (mut) | Deleting the cached row must not leave a `MaxRows` slot serving zero rows | #3199 delete half regressing |
| CG3 (mut) | A FILTERED slot still removes a deleted row in place — the legitimate half of the asymmetry | over-invalidation "fix" destroying correct behavior |
| CG4 (mut) | A `StartRow` offset window is not maintained in place (the page must not silently shift) | offset windows treated as maintainable sets |
| CG5 (mut) | A subset slot keeps a DB-accurate `TotalRowCount` across a save (#3195 × #3199 composed) | count and rows drifting together |
| CG6 (mut) | A slot whose `schemaHash` no longer matches the entity is rejected, not served | **B38** (fixed — maintenance writes now carry the hash forward): post-migration stale-schema serves |
| CG7 (mut) | A saved view must never gain a row its own WhereClause excludes (**H1**) | view-scoped slots admitting out-of-predicate rows via in-place upsert |
| CG8 (mut) | An aggregate slot never serves a COUNT that disagrees with its own rows (**H2**) | aggregate/row divergence inside one slot |

## Known pinned gaps and honest caveats

- **B41** (fixed): `ApplyDifferentialUpdate` narrowing refusals now trigger a real full fetch instead of failing the batch — covered by client-cache running 13/13 with the `hasNarrowingSegment` guard restored.
- **B42** (fixed): ordered slots now invalidate on SAVE (remove-in-place on DELETE) — pinned at unit level (`universalInvalidation` B42 pin) with the live asymmetry contract carried by CG3.
- **B43/B43b/B45/B46** (all fixed): the RunQuery TTL-hit permission/category lineage — Q11/Q12 are the proven-to-fail live pins; the finer-grained legs are unit-pinned in MJCore (`providerBase.queryCacheAuthorization.test.ts`, `localCacheManager.queryCategoryFingerprint.test.ts`).
- **B44** (fixed, perf-only): `entity_object` full-coverage field lists normalize to `*` in the client fingerprint only — pinned by the unit-level `f:*`/`f:<narrow>` matrix, observable here through C4/C5 slot separation.
- **Dataset writes are counter-invisible** on this transport (by architecture, not omission) — dataset-cache asserts behavior instead; the header documents the verification.
- **Stale header comments** (cosmetic drift, noted during documentation): `client-cache.checks.ts` says "C1–C12" (13 checks exist), `dataset-cache.checks.ts` says "DS1/DS2" (DS3 exists), `aggregates-cache.checks.ts` says "AGG1/AGG2" (AGG3 exists), `cache-gauntlet.checks.ts` says "CG1–CG5" (CG1–CG8 exist).

## See also

- [data-access-suite.md](data-access-suite.md) — the RunView/RunQuery feature surface these caches sit under
- [security-suite.md](security-suite.md) — the permission engine behind S31/S31b/Q12
- `packages/TestingFramework/testing-integration/CATALOG.md` — the living coverage index
