# Cache Sub-Suites — server-cache · runquery-cache · client-cache · dataset-cache · aggregates-cache · cache-gauntlet

This document describes the **caching family** of MemberJunction's integration-test catalog as it ships and runs today: **6 bundles, 71 checks** (server-cache 32, client-cache 13, runquery-cache 12, dataset-cache 3, aggregates-cache 3, cache-gauntlet 8) exercising the multi-tier RunView/RunQuery/dataset cache against a **live database** (server transport) and a **running MJAPI over GraphQL** (client transport). All six are registered bundles on the shared `IntegrationCheckRegistry`, dispatched by the metadata-driven `mj test` driver — `npm run test:integration` (= `MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Deterministic"`) runs the family, or one bundle at a time via `MJ_INTEGRATION_TEST=1 npx mj test run --name "IT01 - Server RunView Cache Integrity"`. Candidate-design ancestry: [test-catalog.md](./test-catalog.md); every bug ID cited below (B30, B38, B39, B40/B40b, B41, B42, B43/B43b, B44, B45, B46, H1/H2, and the rest) resolves in the [bug register](../../../../plans/integration-test-expansion/bug-register.md).

This family is the deepest-covered domain in the catalog for a reason: the cache has repeatedly shipped bugs of the *silent wrong data* class — #3195 (subset `totalRowCount` collapse), #3199/B30 (subset-slot rows maintained in place), B38 (schemaHash stripped by maintenance writes), B40/B40b (aggregates dropped on CacheLocal, four distinct drop points), B45/B46 (RunQuery permission-parity and category-collision gaps). Every one of those now has a pinning check here.

---

## 1. The machinery under test (shared mechanism primer)

The family covers one subsystem with several serving paths, rooted in two files:

- **`packages/MJCore/src/generic/localCacheManager.ts`** — `LocalCacheManager` (a `BaseSingleton`, `:283`). Owns:
  - **Fingerprinting** — `GenerateRunViewFingerprint` (`:1389`) builds the slot key from entity + filter + OrderBy + MaxRows/StartRow + Fields (the `|f:` segment) + IgnoreMaxRows (`imr:`) + view/RLS segments + the aggregate hash; `generateAggregateHash` (`:1491`) is **deliberately order-insensitive** over `Aggregates[]` (reordered aggregate lists share one slot; the caller's order is restored at serve time). `GenerateRunQueryFingerprint` (`:2268`) is the RunQuery analog — since B46 it carries the resolved query's canonical `CategoryPath` segment.
  - **In-place slot maintenance** — the classifier (`:459`–`:505`, including `hasOrderBy`) decides per BaseEntity save/delete event whether a slot is upserted/removed in place, invalidated, or left alone. The contract is **per-cell, not per-slot**: unfiltered+unlimited slots maintain on both save and delete; filtered slots invalidate on save but legitimately remove-in-place on delete; MaxRows/StartRow **subset** slots invalidate on both (the cell that shipped #3195 and #3199); ordered slots invalidate on save since B42. `UpsertSingleEntity`/`RemoveSingleEntity` (`:938`–`:963`, `:1079`–`:1084`) perform the writes and — since B38 — carry `schemaHash` and `totalRowCount` forward through `storeCachedResults`.
  - **Schema-drift rejection** — `isSchemaStaleCacheEntry` (`:674`) refuses a slot whose stored `schemaHash` no longer matches the entity's current field list (the post-migration case). It short-circuits on a **missing** hash, which is exactly why B38 (maintenance writes stripping the hash) silently disabled the guard until fixed.
  - **Differential merge** — `ApplyDifferentialUpdate` (`:1899`) refuses to merge deltas into subset/narrowing (`vw:`/`rls:`/narrow-`f:`) slots; since B41 the caller performs a real full fetch on decline instead of failing the batch.
- **`packages/MJCore/src/generic/providerBase.ts`** — the serving paths. `PreRunView` (`:2205`) is the cache-first gate every RunView/RunViews passes through (it also **widens `Fields` on cacheable calls** so a superset slot can serve any subset — the reason `entity_object` ignores narrow Fields); `cacheDeniedForViewOnlyRequest` (`:1259`) is the S31b security fix (a ViewID-only request resolves no entity for the primary permission gate, so a dedicated deny path exists); the RunQuery TTL hit path (`serveFromSlot`, `:1843`) is gated by `ResolveQueryCacheAuthorization` (`:1773`) — the B45 seam that makes a cache HIT never easier to read than a cache MISS; the dataset APIs (`GetAndCacheDatasetByName`, `IsDatasetCached`, `IsDatasetCacheUpToDate`, `ClearDatasetCache`) write through the provider's **own** `LocalStorageProvider`, a different store from `LocalCacheManager` (this asymmetry drives dataset-cache's assertion style — §6).

Why it matters: this cache is **trusted completely on the server** (`TrustLocalCacheCompletely = true` — event-driven invalidation is the only freshness mechanism; there is no TTL safety net for RunView slots), while the client (`GraphQLDataProvider`) runs `TrustLocalCacheCompletely = false` with opt-in `CacheLocal` slots revalidated against the server. A wrong maintenance decision on either tier is not an error — it is a `Success: true` response carrying wrong rows.

### Observability: the instrumented cache

Both bootstraps install an `InstrumentedLocalStorageProvider` (`packages/TestingFramework/testing-integration/src/instrumented-cache.ts`) as the **first caller** of `LocalCacheManager.Instance.Initialize(...)` — the load-bearing "D1" invariant in `bootstrap.ts`; `Initialize` is first-caller-wins, so this must be a **dedicated process** (`MJ_INTEGRATION_TEST=1`; the bootstrap refuses to run inside a live MJAPI). Checks then read deterministic counters from `ctx.Storage`: per-category `GetCount('RunViewCache')` / `SetCount('RunQueryCache')`, the raw `GetItemsCount`/`SetItemCount`, and `ResetCounts()`. A cache WRITE is a `SetCount` increment, a cache READ a `GetCount` increment, and "served without touching storage" (the in-flight dedup/linger path) is **zero of both**. The second oracle is `ExecutionTime === 0` — a served-from-cache result never touched the DB (established by S13/S23, load-bearing for the whole cache-gauntlet bundle).

### Determinism: `UniqueFilter`

Deterministic checks get cold slots with **zero mutation** via `UniqueFilter(column, tag)` — an always-true, run-unique predicate that fingerprints to a fresh slot every run while returning the entity's full row set. Checks that deliberately share a slot reuse the same tag (S1→S2→S3 share `'s1'`; C3→C4→C5 share `'c3'`) — which is why **registration order within a bundle is load-bearing** and pinned by `check-registry.test.ts`.

### Transports and context

`IntegrationTestDriver.ts:55` declares `CLIENT_BUNDLES = {'client-cache', 'rls-isolation-client', 'remote-op-wire-progress'}` — of this family, **only client-cache runs on the client transport** (`bootstrapIntegrationClient` in `bootstrap-client.ts`: server-free by construction, GraphQL against a separately running MJAPI reachable via `MJ_API_KEY`, MJAPI preflight with fail-fast, CLIENT entity subclasses only). Its checks call `rv.RunView(params)` **without** a context user — the provider carries the authenticated identity, exactly like a browser. The other five run in-process on `bootstrapIntegrationServer` (live `SQLServerDataProvider`, server entity subclasses via `server-bootstrap-lite`) and pass `ctx.User` explicitly — the canonical exception to the client-first transport doctrine, because these bundles count the *server's* cache reads/writes, which the wire cannot observe. Suite-level ordering invariant: client-transport members are sequenced **last** in the deterministic suite, because `bootstrapIntegrationClient` rebinds the process's global provider to GraphQL.

### Tiers

Per `tiers.ts`: `deterministic` is ungated and blocking; `mutation` requires `RUN_MUTATION_TESTS=1` (or a selector's `runMutationTests: true`); the driver silently `continue`s past `RequiresMutation` checks when the gate is closed (`IntegrationTestDriver.ts:271`). No check in this family is live-model. Per-bundle composition:

| Bundle | IT record | Suite / sequence | Transport | Checks | Deterministic | Mutation-gated |
|---|---|---|---|---|---|---|
| server-cache | IT01 - Server RunView Cache Integrity | Deterministic, seq 1 | server | 32 | 26 | 6 (S17, S23, S24, S29, S30, S31b) |
| runquery-cache | IT02 - RunQuery Cache Integrity | Deterministic, seq 2 | server | 12 | 12 (bundle mutates by design, ungated — §3) | 0 flagged |
| client-cache | IT03 - Client GraphQL Cache Integrity | Deterministic, seq 30 (client-last; seeded Skip until MJAPI is CI-provisioned, Phase 5) | **client** | 13 | 12 | 1 (C10) |
| dataset-cache | IT07 - Dataset Cache (DatasetCache category) | Deterministic, seq 4 | server | 3 | 3 | 0 |
| aggregates-cache | IT08 - Aggregates Through The Cache | Deterministic, seq 5 | server | 3 | 3 | 0 |
| cache-gauntlet | IT29 - Cache Gauntlet (subset-slot x mutation) | Deterministic, seq 18 | server | 8 | 0 | **8 (all)** |

Note the cache-gauntlet consequence: because **every** CG check is `RequiresMutation` and IT29's selector config sets no `runMutationTests`, a plain `npm run test:integration` run executes **zero** gauntlet checks — the bundle only fires under `RUN_MUTATION_TESTS=1`. The two production regressions it guards (#3195/#3199) are therefore pinned in the default gate only by the unit-level `localCacheManager.slotMaintenanceMatrix.test.ts`, not by the live suite.

---

## 2. `server-cache` — IT01 (32 checks: S1–S31 + S31b)

**Machinery:** the full server-side RunView cache serving surface of `ProviderBase` + `LocalCacheManager` over a live `SQLServerDataProvider` — miss/hit/shape symmetry, superset-serves-subset field projection, in-flight dedup ("linger"), fingerprint axes (filter, OrderBy, MaxRows, IgnoreMaxRows, ViewID), cache-exempt entity classes, event-driven maintenance, and the read-permission security gates. Source: `src/checks/server-cache.checks.ts` (ported verbatim from the retired tsx dispatcher; the registry is now the single source of truth).

**Transport / fixtures:** server in-process; `ctx.User` threaded on every call. No `BundleLifecycle` — the deterministic checks are read-only via `UniqueFilter` cold slots over `MJ: Entities` / `MJ: Query Categories`; the mutation checks create and delete their own rows (`MJ: User Settings`, a throwaway `MJ: User Views` view, a throwaway Query Category + Query) inside per-check try/finally. Event-driven maintenance is asynchronous, so mutation checks settle ~2000–2500 ms after each save/delete.

| Id | Short name | Deterministic observable asserted | Failure it catches |
|---|---|---|---|
| S1 | Miss with narrow Fields | Miss returns exactly requested columns + PK; `SetCount('RunViewCache') > 0` | Miss path leaking full width, or miss never writing the cache |
| S2 | Hit shape symmetry | Same fingerprint served with identical shape, zero rewrites, `ExecutionTime === 0` | Hit-path projection divergence; hit rewriting the slot |
| S3 | Different subset from superset | Wider field subset served from the same slot, no rewrite | Per-subset slot explosion, or subset projection breaking |
| S4 | No Fields = full width | 20+ columns returned | Pass-through path narrowing rows |
| S5 | Case-insensitive Fields | `['name','schemaname']` returns `Name`/`SchemaName` (original casing) | Case-sensitive projection dropping columns |
| S6 | entity_object over simple-warmed slot | `BaseEntity` instances with the full field set despite a narrow warm | Materialization from a narrow cached superset producing crippled entities |
| S7 | BypassCache end-to-end | No cache write; direct-SQL shape (requested + PK) | BypassCache reading or writing the cache |
| S8 | TotalRowCount parity | Hit `TotalRowCount` == miss | Count collapse through the cache (the #3195 family, unlimited leg) |
| S9 | Batch per-param projection | Each `RunViews` index projected to its own Fields | Batch results cross-projected |
| S10 | Mixed hit+miss batch | Warm index from cache, cold from DB, each with its own shape | Batch hit/miss classification bleeding shapes |
| S11 | Linger, different Fields | Second caller within the 5 s window gets its own (wider) shape | Fields-less dedup key serving caller B caller A's narrower rows |
| S12 | Linger, different ResultType | simple caller gets plain rows; entity_object caller gets BaseEntity | Dedup slot sharing one representation across ResultTypes |
| S13 | Linger identical repeat | Repeat served with **zero** storage reads AND writes | In-flight dedup slot broken (repeat hitting storage/DB) |
| S14 | Filter is a fingerprint axis | Narrower filter returns fewer, only-matching rows | Cross-filter slot collision |
| S15 | OrderBy honored miss+hit | Sorted on both paths, equal counts | Cache dropping/reshuffling order |
| S16 | MaxRows fingerprints separately | `MaxRows:10` returns exactly 10; unlimited query returns more | Unlimited read served a truncated slot (slot-identity half of #3199) |
| S17 (MUT) | Filtered slot invalidates on save; delete removes | Post-save filtered read sees the new row; post-delete sees it gone | Event-driven invalidation of filtered slots broken (stale reads forever) |
| S18 | AfterKey never touches the cache | Keyset page: no cache write, no page overlap; entity+filter slot unpoisoned afterwards | Keyset pages cached as if complete sets, poisoning the plain slot |
| S19 | count_only non-poisoning | `TotalRowCount` populated, zero rows; later row query sees all rows | An empty count_only result cached as the row set |
| S20 | BypassCache non-poisoning | Full-width query after a narrow bypass stays full-width | Bypass writes leaking into the shared slot |
| S21 | entity_object ignores narrow Fields | Instances carry the full field set | `PreRunView` Fields-widening regression producing partial entities (invalid saves) |
| S22 | Concurrent dedup | 5 identical concurrent calls: equal row counts, at most one cache write | Thundering-herd duplicate executions/writes |
| S23 (MUT) | Unfiltered auto-maintained slot | Save upserts / delete removes **in place**; post-mutation reads still `ExecutionTime === 0` | In-place maintenance broken (falling back to invalidate+refetch, or serving stale) |
| S24 (MUT) | AllowCaching=false honored (flag flipped live and restored) | Zero cache reads/writes; never-widened shape | Cache-ineligible entities silently entering the cache |
| S25 | TrustServerCacheCompletely=false honored | `MJ: Audit Logs` (real metadata): zero cache reads/writes | The Trust=0 eligibility branch (distinct from AllowCaching) regressing — raw-SQL-populated rows served stale |
| S26 | Record Changes hardcoded exemption | Zero cache reads/writes regardless of flags | The raw-SQL-populated entity exemption list regressing |
| S27 | OrderBy is a fingerprint axis | ASC and DESC slots never cross-serve (DESC results actually descending) | DESC read served the ASC-ordered slot |
| S28 | IgnoreMaxRows vs capped slot | `IgnoreMaxRows:true` returns > cap even when the capped query was cached first (skip-warn when no capped entity exists on this DB) | `imr:` fingerprint segment collision serving the capped slot |
| S29 (MUT) | Stored view honors its own WhereClause | View read after a plain unfiltered warm returns only WhereClause-matching rows (skip-warn when the probe filter doesn't discriminate) | View served the unfiltered entity slot — a data-scoping leak |
| S30 (MUT) | Parent rename refreshes denormalized child rows | DB truth asserted with `BypassCache`; the cached-child assertion is **skip-as-pass** (see pins below) | Cross-entity denormalization staleness (currently a pinned, deferred limitation) |
| S31 | SECURITY: read-permission enforced on hits | Discovered (A can-read / B cannot) pair on a cacheable RLS-free entity: B denied cold AND after A warms the slot (skip-warn when no pair exists) | An unauthorized user served another user's cached rows |
| S31b (MUT) | SECURITY: ViewID-only saved-view hit gate | Same pair + a throwaway saved view: B denied on the ViewID cache path A warmed (pins the `cacheDeniedForViewOnlyRequest` fix) | The entity-keyed permission gate disarmed by ViewID-only requests (the pre-fix S31b leak) |

**Pins / loud-warn / known gaps:**

- **S30 skip-as-pass — cross-entity denormalization invalidation is a known, deferred cache limitation** (no bug-register ID; "tracked separately" in the check body). Invalidation keys on the *changed* entity's name, not on entities that denormalize it, so renaming a parent does not refresh cached child rows carrying its name. The check is self-healing: it warns and returns today, and the dormant assertion turns itself back on the moment the invalidation fan-out lands.
- **S31b carries a B39 workaround** — it threads `EntityName` alongside `ViewID` because ViewID-only reads used to throw opaquely for every user (B39: contextUser-less inner view lookup + undefined fall-through). The body says "drop it once B39 is fixed"; B39 is marked **FIXED** in the bug register, so the workaround is now droppable (see §8). The same comment exists in CG7.
- **Related pin (not in this bundle):** B18 — ViewID/ViewName-only results are not drop-invalidated on save (PIN/decide; catalog candidate CD6).
- Discovery-dependent checks (S28, S29, S31, S31b) **skip loudly with a console.warn** rather than passing silently when the DB lacks the required shape — per the suite's honest-status policy. S31b additionally survives per-entity permission/RLS evaluation throws during discovery (counted and reported, never aborting the security scan).

---

## 3. `runquery-cache` — IT02 (12 checks: Q1–Q12)

**Machinery:** the `RunQuery` cache in its two modes — **TTL** (`CacheLocal` + `CacheLocalTTL`, serve-stale-by-design within the window) and **smart validation** (`CacheValidationSQL` → `RunQueriesWithCacheCheck` answering `current` / `stale` / `no_validation`) — plus the two security fixes on the TTL hit path: **B45** (hit-path permission parity via the `ResolveQueryCacheAuthorization` seam, `providerBase.ts:1773`) and **B46** (the category segment in `GenerateRunQueryFingerprint`, `localCacheManager.ts:2268`). Source: `src/checks/runquery-cache.checks.ts`.

**Transport / fixtures / lifecycle:** server in-process. This is the family's canonical **`BundleLifecycle`** bundle: `RegisterLifecycle('runquery-cache', {Setup, Teardown})` creates one Query Category + two Queries (TTL-mode and validated-mode, both counting `MJ: User Settings` rows tagged `mj.integrationtest.rq*`) and threads them onto `ctx.Fixtures`; the driver runs Setup **inside the same try whose finally guarantees Teardown**, and the fixture handle is published up-front so a mid-Setup crash still tears down partial state. Teardown also sweeps leftover tagged settings with `BypassCache: true`. **The whole bundle mutates the DB by design** and is deliberately NOT `RequiresMutation`-gated — its writes are self-contained fixture rows, so it always runs with the bundle. Q12 additionally uses the seeded role-less principal `it-nogrant@integration.test` (shared with the permission-engine bundle; from `metadata-optional/integration-test/users/`) and skip-warns with the exact `mj sync push` remedy when the seed is absent — refusing a fixture user that has acquired roles rather than producing a confusing downstream failure.

| Id | Short name | Deterministic observable asserted | Failure it catches |
|---|---|---|---|
| Q1 | No CacheLocal = no cache | Zero `RunQueryCache` reads and writes across two runs | RunQuery caching becoming opt-out instead of opt-in |
| Q2 | TTL miss/hit | Miss writes a slot; hit: `ExecutionTime === 0`, `CacheHit === true`, equal rows, no rewrite | TTL mode not serving, or hits re-executing/rewriting |
| Q3 | TTL expiry | Post-expiry read is NOT a hit and rewrites the slot | Immortal TTL slots (stale forever) |
| Q4 | BREAK: MaxRows fingerprints separately | `MaxRows:1` within the unlimited slot's TTL is not a hit | Truncated request served the unlimited slot verbatim |
| Q5 | TTL stale-by-design pinned | Within TTL the **stale** count is served (a hit); after expiry the fresh count appears | Either direction: TTL serving fresh (defeating the point) or never refreshing |
| Q6 | Smart validation current/stale | `RunQueriesWithCacheCheck`: matching cacheStatus → `current` with **no rows**; after a data mutation the same status → `stale` with fresh rows | Validation SQL not detecting change, or `current` responses shipping redundant rows |
| Q7 | no_validation contract | Query without `CacheValidationSQL` answers `no_validation` + fresh rows | Unvalidatable queries mislabeled `current` (served stale) |
| Q8 | BREAK: failed executions never cached | Broken-SQL query fails with zero slot writes | Error results cached and replayed as data |
| Q9 | BREAK: Parameters key order | `{x,y}` vs `{y,x}` produce identical results (worst case a redundant slot, never wrong rows) | The JSON-stringify Parameters fingerprint producing cross-served wrong results |
| Q10 | Byte-identical hit data | `JSON.stringify(hit.Results) === JSON.stringify(miss.Results)` | Serialization/projection corruption that count-only assertions miss |
| Q11 | BREAK (**B46**): category collision | Two same-named queries in different categories: each by-name + CategoryPath request executes ITS query, then each repeat hits its **own** slot (CategoryPaths taken canonically from the `QueryEngine`) | The pre-B46 `Name\|ID\|Params` fingerprint serving category A's rows for category B (and permission evaluated against the wrong query) |
| Q12 | BREAK (**B45**): hit/miss permission parity | Anti-vacuity preconditions pinned (roles-only check PASSES the role-less user; full check DENIES via a `MJ: Query Entities` bridge row); the warmed slot serves the warmer, but the role-less user gets no hit and `Success === false` (or a throw) | The pre-B45 leak: a TTL hit served rows the miss path would deny — a cache HIT easier to read than a MISS |

**Pins / gaps:** Q5 **pins** TTL serve-stale-by-design as documented semantics. Q9 **pins** the key-order fingerprint behavior (redundant slot acceptable, wrong data never). Q12 relates to **B43/B43b** (the original hit-path permission gate + its `!checker` fall-through guard, both FIXED); B45 was the strictly-narrower follow-up this check proves live — both Q11 and Q12 were **proven-to-fail** (gate/segment neutered → red; restored → green), complementing the unit pins `providerBase.queryCacheAuthorization.test.ts` and `localCacheManager.queryCategoryFingerprint.test.ts`. **B12** (`CategoryPath` matches the flat category name, not a hierarchical path — open DECIDE) is sidestepped by Q11 taking each query's canonical `CategoryPath` from the engine rather than hand-assembling one.

---

## 4. `client-cache` — IT03 (13 checks: C1–C13)

**Machinery:** the browser-faithful cache stack — `GraphQLDataProvider` against a running MJAPI, `TrustLocalCacheCompletely = false`, `CacheLocal` **opt-in**, smart-cache revalidation (`current` → serve slot / `stale` → fresh rows) over the wire, the per-`Fields` client fingerprint (the `|f:` segment), the stamp-less-response write gate, and client-side `AggregateResults` fidelity. This transport is where B40's triple aggregate drop and B30's client MaxRows-slot corruption lived — bugs invisible to any in-process check. Source: `src/checks/client-cache.checks.ts`.

**Transport / fixtures:** the family's only **client-transport** bundle (`CLIENT_BUNDLES`, `IntegrationTestDriver.ts:55`/`:365-367`): `bootstrapIntegrationClient` preflights MJAPI (fail-fast when unreachable; requires `MJ_API_KEY`), registers only CLIENT entity subclasses, and installs/reuses the instrumented cache. Checks call `rv.RunView(params)` **without** a context user. No lifecycle; C10 creates/deletes its own `MJ: User Settings` row through the same GraphQL client (a real end-to-end mutation). Timing discipline: client slot writes are fire-and-forget (300 ms settles) and the client dedup linger window is outlived with 5200 ms sleeps so second calls genuinely revalidate. Suite note: IT03 is sequenced 30 (client members last) and is seeded Skip on the DB-only CI suite membership until MJAPI provisioning (Phase 5).

| Id | Short name | Deterministic observable asserted | Failure it catches |
|---|---|---|---|
| C1 | Plain narrow read over the wire | Requested fields + PK only, 100+ rows | GraphQL transport widening/narrowing projections |
| C2 | Server hit/miss symmetry over the wire | Identical shape and counts across a true (post-linger) round trip | Server cache hits serialized differently than misses |
| C3 | CacheLocal miss stores, repeat serves locally | First call writes a client slot (`SetItemCount++`); post-linger repeat reads the slot (`GetItemsCount++`) without rewriting | Client slots never written, or "current" slots rewritten on every read |
| C4 | Per-Fields client slot (the `\|f:` fix) | A different subset over the same entity+filter fetches fresh and writes its OWN slot; shape includes the new column | The old Fields-agnostic client fingerprint validating C3's narrow slot as current and serving rows WITHOUT the requested column |
| C5 | Full-width not served from a narrow slot | No-Fields CacheLocal read returns 20+ columns | A `*` request satisfied by a narrow slot |
| C6 | entity_object re-materialization | Both cold and cache-served results are `BaseEntity` instances | Cached plain JSON served un-materialized to entity_object callers |
| C7 | Client dedup keying by Fields | Linger-window callers with different Fields each get their own shape | Client in-flight dedup collapsing distinct projections |
| C8 | Mixed-CacheLocal batch | Each batch index projected to its own param | Batch entries cross-contaminating cache treatment/shape |
| C9 | count_only over the wire | `TotalRowCount` populated, zero rows, and no row-cache poisoning | Wire transport of count_only corrupting the row slot |
| C10 (MUT) | Save/delete revalidation round trip | Client slot revalidation surfaces the saved row post-save and drops it post-delete, keeping the slot shape | The client revalidation loop serving stale membership after real mutations (the B30/#3199 client leg's neighborhood) |
| C11 | RunQuery CacheLocal client-side | First run writes a `RunQueryCache` slot; repeat revalidates with matching rows | Client RunQuery cache never writing, or revalidation returning divergent data |
| C12 | Trust=0 write gate | Stamp-less response (no `__mj_UpdatedAt` requested on a cache-ineligible entity) is NOT cached; a stamped response IS, and revalidates | Unvalidatable slots stored (they could never validate later → permanently stale), or DB-checked validation refused for Trust=0 entities |
| C13 | **B40 guard**: AggregateResults order over the wire | Warm `[A,B]`, read `[B,A]`: exactly 2 aggregates returned **in the second caller's order** | The B40 family — CacheLocal dropping aggregates entirely (3 layers: client input map, resolver coreParams, engine stale reply) plus B40b's server-slot-hit drop; also order inherited from the warming caller |

**Pins / gaps:** C13 is the live guard for **B40** and **B40b** (all four drop points FIXED; client-cache runs 13/13 green); its title understates the history — order was moot when zero aggregates came back. **B30** (a `MaxRows`-truncated result stored as the complete set and then grown by in-place maintenance, client transport, FIXED) and **B41** (differential-merge narrowing refusal + full-fetch fallback, FIXED) have no *dedicated* named check — the register credits "client-cache passing 13/13 with the guard restored" plus the unit-level `slotMaintenanceMatrix`/`differential` tests. **B44** (entity_object full-field lists fingerprinted as narrow `f:<all>` instead of `*` — pure hit-rate, FIXED) is pinned at the unit level only, observable here indirectly through C4/C5 slot separation. **B32** (client dispatchers importing the server-laden barrel — test-fidelity, FIXED) is why `bootstrap-client.ts` exists as a server-free `./client` subpath; its header contract is the guard.

---

## 5. `dataset-cache` — IT07 (3 checks: DS1–DS3)

**Machinery:** the dataset cache through `ProviderBase.GetAndCacheDatasetByName` and its status APIs (`IsDatasetCached`, `IsDatasetCacheUpToDate`, `ClearDatasetCache`). Datasets (the default fixture is the real seeded `MJ_Metadata`) are the bulk-load primitive behind client metadata hydration — a stale "up to date" answer would suppress refetches platform-wide.

**Transport / fixtures / assertion style:** server in-process; **no mutation** (read-and-observe on an existing dataset; name overridable via the IT record's selector config `datasetName`). Assertions are deliberately **behavioral, not counter-based** — verified against the live server: `ProviderBase.CacheDataset` writes through the provider's **own** `LocalStorageProvider` (`SetItem` with no category), a *different* store from the `LocalCacheManager` the `InstrumentedLocalStorageProvider` instruments, so `RunViewCache`-style counters structurally cannot observe dataset writes on this transport. The honest proof is the observable state transition. (Aggregates DO flow through `LocalCacheManager` and are counter-checked — §6.)

| Id | Short name | Deterministic observable asserted | Failure it catches |
|---|---|---|---|
| DS1 | Cold populates, warm serves | `ClearDatasetCache` → `IsDatasetCached` false; cold fetch succeeds with rows AND flips it true; warm fetch serves the same item count | Cold path not writing the dataset cache, or warm divergence |
| DS2 | Status APIs agree when warm | `IsDatasetCached` true and `IsDatasetCacheUpToDate` true immediately after caching | Status APIs disagreeing with the store (spurious refetch storms or false freshness) |
| DS3 | Negative transition | After `ClearDatasetCache`: `IsDatasetCached` false AND `IsDatasetCacheUpToDate` **false** | A cleared dataset masquerading as up-to-date — suppressing the refetch and serving nothing/stale |

**Pins / gaps:** DS1 warms what DS2 inspects and DS3 clears — in-bundle ordering is load-bearing (DS3 re-warms defensively so it stays self-sufficient). Known coverage gap (catalog candidate **CD14**, not yet shipped): dataset invalidation on member-entity mutation (saving entity X flipping dataset-over-X `UpToDate`) — explicitly tagged "(dataset-cache gap)" in [test-catalog.md](./test-catalog.md).

---

## 6. `aggregates-cache` — IT08 (3 checks: AGG1–AGG3)

**Machinery:** the RunView `Aggregates` surface through the **server** cache — the `aggHash` fingerprint segment (`generateAggregateHash`, `localCacheManager.ts:1491`), aggregate round-tripping through slot storage, and the documented order contract on `RunViewResult.AggregateResults` ("same order as input Aggregates array") surviving the deliberately order-insensitive hash. Unlike dataset-cache, aggregates DO flow through `LocalCacheManager`, so these checks are counter-instrumented.

**Transport / fixtures:** server in-process; no mutation — pure cold-slot reads over `MJ: User Settings` (overridable via selector config `entityName`) using an always-true, column-agnostic unique predicate. AGG1 needs no DB read at all: it calls `GenerateRunViewFingerprint` directly.

| Id | Short name | Deterministic observable asserted | Failure it catches |
|---|---|---|---|
| AGG1 | Aggregates[] in the fingerprint | No-aggregate vs COUNT vs MAX params yield three distinct fingerprints (direct `GenerateRunViewFingerprint` call, no DB) | Two views identical except for their aggregates colliding on one slot |
| AGG2 | Aggregates round-trip | Cold run writes a slot AND returns `AggregateResults`; warm run is served (zero writes) and STILL returns them | The warm hit dropping aggregates — `Success` with rows but no COUNT the caller asked for (the server-side sibling of B40) |
| AGG3 | Order survives the cache | Warm `[A,B]`, read `[B,A]` (same slot — the aggHash is order-insensitive by design): results returned in the **second caller's** order | A reordered request inheriting the warming caller's aggregate order — silently mislabeled values |

**Pins / gaps:** AGG3 is the server-transport twin of client-cache C13 (which covers the same contract over the wire, where B40 actually lived). The mutation-adjacent aggregate case — a save leaving a cached aggregate stale next to fresh rows (**H2**) — lives in cache-gauntlet CG8, not here.

---

## 7. `cache-gauntlet` — IT29 (8 checks: CG1–CG8)

**Machinery:** LIVE, real-SQL coverage of the **subset-slot × mutation** cell and its neighbors — the exact cell that shipped #3195 (`totalRowCount` collapse) and #3199 (subset rows maintained in place: a `MaxRows:1` slot growing 2, 3, 4 on saves and shrinking to 0 on delete while the DB still had rows for a `TOP 1`). The pre-gauntlet audit of the then-61 cache checks found this cell had **no live coverage**: S16 proved slot *identity*, S17 filtered-save, S23 unfiltered maintenance — nothing ever saved *into* a subset slot. The per-cell maintainability contract (§1) is asserted where SQL `TOP`/`OFFSET` semantics actually apply; `ExecutionTime === 0` is the cache-hit oracle throughout. Also here: the live schema-drift leg (CG6/B38), the saved-view maintenance leak (CG7/H1), and aggregate-consistency-across-save (CG8/H2). Source: `src/checks/cache-gauntlet.checks.ts`.

**Transport / fixtures / tier:** server in-process; **entirely mutation-tier** (all 8 `RequiresMutation` — see the §1 gating note: zero checks fire on the default deterministic run). Every check creates and deletes its own `MJ: User Settings` rows tagged `mj.cachegauntlet.* (mj-integration-test — safe to delete)` with best-effort try/finally teardown, so a crashed run leaves identifiable debris; CG7 additionally creates/deletes a throwaway `MJ: User Views` row. 2000 ms settles after each mutation (the S17/S23 convention). CG2 compares UUIDs with `UUIDsEqual` (SQL Server uppercase vs PostgreSQL lowercase).

| Id | Short name | Deterministic observable asserted | Failure it catches |
|---|---|---|---|
| CG1 | Save never inflates a MaxRows slot | Anti-vacuity floor (≥2 pre-existing rows); 3 successive saves against a warm `MaxRows:1` slot each still return exactly 1 row | The #3199 save half — in-place upsert growing a truncated slot past the caller's own limit |
| CG2 | Delete never empties a MaxRows slot | Delete the row the slot cached (or a seeded sibling); `MaxRows:1` still returns 1 row (the DB has plenty for a TOP 1) | The #3199 delete half — remove-in-place serving an empty result as authoritative |
| CG3 | Filtered-DELETE stays maintained (the legitimate half) | A predicate-scoped slot drops its deleted row in place (0 rows after) | A future over-correction invalidating filtered slots on delete unnecessarily (a deleted row can never violate a predicate) |
| CG4 | StartRow window not maintained | An offset window (`MaxRows:2, StartRow:1`) never exceeds MaxRows across a save | Offset pages silently shifting/growing under in-place maintenance |
| CG5 | Subset TotalRowCount tracks the DB | Warm subset: `TotalRowCount` > truncated row count (the #3195 anti-collapse pin); after a save it is exactly `before + 1` while rows stay capped at 1 | #3195 and #3199 composing — a subset slot with both wrong rows and a frozen count |
| CG6 | **B38**: schema-drift rejection live | Precondition: the slot genuinely serves (`ExecutionTime === 0`); then EVERY cached slot for the entity has its stored `schemaHash` rewritten to a drifted value — drifting only the first hash-bearing slot proved nothing, since sibling slots differing only in trailing segments (e.g. `imr:1`) served the read, and two earlier versions of the check died exactly there; the next read re-executes (`ExecutionTime > 0`). Fails loudly if NO slot carries a hash (guard unreachable by construction) | Post-migration reads served with a stale column set; the B38 regression (maintenance stripping the hash → `isSchemaStaleCacheEntry` permanently disarmed for mutated slots) |
| CG7 | **H1**: saved view never gains an excluded row | A view whose WhereClause matches exactly 1 row still returns 1 row after saving a row the WhereClause excludes | View WhereClause living on the VIEW (fingerprint filter segment `_`) making the slot look unfiltered/maintainable — an excluded row upserted into a *restricted* view (a data/permission leak, since views are how users are shown a restricted set) |
| CG8 | **H2**: aggregate never disagrees with its rows | Cold `COUNT(*)` == returned row count; after a save the aggregate is still present AND equals the served rows | Either failure mode: the aggregate vanishing on maintenance, or (worse — the first fix attempt did exactly this) a stale COUNT carried forward next to fresh rows, undetectable by the caller |

**Pins / gaps:** CG3 is an explicit **pin of legitimate behavior** so the maintenance asymmetry (filtered-DELETE maintained, subset-DELETE invalidated) is protected in both directions. CG6 pins the **carry-forward** (not recompute) resolution of B38 — recomputing would stamp today's schema onto rows fetched under the old one, masking the very drift the guard exists to catch. CG7 carries the same **B39** `EntityName`-alongside-`ViewID` workaround as S31b (B39 now FIXED — droppable). H1/H2 are hypothesis IDs from the adversarial cache review; both proved real and both fixes are live-pinned here.

---

## 8. Bug-register cross-reference (cache family)

| Bug | State | Live guard in this family | Notes |
|---|---|---|---|
| B12 | DECIDE (open) | Q11 sidesteps (canonical CategoryPath from the engine) | `CategoryPath` matches flat category name, not a hierarchical path |
| B18 | PIN (or small fix — undecided) | none yet (catalog candidate CD6) | ViewID-only results not drop-invalidated on save |
| B30 | FIXED | client-cache bundle green (no dedicated check) | Client MaxRows slot stored as a complete set + maintained in place |
| B32 | FIXED | `bootstrap-client.ts` server-free contract | Client dispatchers were importing the server-laden barrel |
| B38 | FIXED | **CG6** (green post-fix) | Maintenance write stripped `schemaHash`, disarming drift detection |
| B39 | FIXED | none — S31b/CG7 still carry the workaround | ViewID-only resolution: contextUser threaded + descriptive error |
| B40 / B40b | FIXED | **C13** (client-cache 13/13) | Four distinct `AggregateResults` drops on the CacheLocal pipe |
| B41 | FIXED | client-cache 13/13 with the guard restored | Differential-merge narrowing refusal + real full-fetch fallback |
| B42 | FIXED | unit pins (slot-maintenance matrix, `universalInvalidation` B42 pin); CG3 pins the delete half of the asymmetry | Ordered slots now invalidate on save (delete still in place) |
| B43 / B43b | FIXED | gate lives on the hit path itself; **Q12** covers the successor | RunQuery TTL hit served before the permission gate; `!checker` fall-through |
| B44 | FIXED (perf-only) | unit pin (`f:*`/`f:<narrow>` fingerprint matrix) | entity_object full-field list fingerprinted narrow — hit-rate regression only |
| B45 | FIXED | **Q12** (proven-to-fail both directions) | Hit-path permission weaker than the miss path — `ResolveQueryCacheAuthorization` seam |
| B46 | FIXED | **Q11** (proven-to-fail both directions) | RunQuery fingerprint + gate ignored category |
| H1 / H2 | FIXED | **CG7** / **CG8** | Saved-view maintenance leak; aggregate/rows disagreement |
| S30 limitation | OPEN (deferred, no B-id) | S30 skip-as-pass (self-healing) | Cross-entity denormalization invalidation fan-out not implemented |
| CD14 gap | OPEN (candidate) | none | Dataset `UpToDate` flip on member-entity mutation |

## 9. Housekeeping — known drift observed while writing this doc (2026-07-21)

These are documentation/guard inconsistencies, not product bugs; none affect what the checks assert.

1. **Stale bundle-header ranges** in four check files: `client-cache.checks.ts` says "C1–C12" (13 checks exist), `dataset-cache.checks.ts` says "DS1/DS2" (3), `aggregates-cache.checks.ts` says "AGG1/AGG2" (3), and `cache-gauntlet.checks.ts` says "CG1–CG5" (8 — its own body documents CG6, but CG7/CG8 are absent from the header too).
2. **`check-registry.test.ts` count-table omissions**: the coverage-loss guard pins server-cache (32), client-cache (13), and runquery-cache (12) but does **not** list dataset-cache, aggregates-cache, or cache-gauntlet — a dropped DS/AGG/CG check would not fail that table. (`testing-integration/CATALOG.md` does carry the correct 3/3/8 counts.)
3. **IT02's Description says "Q1–Q10"** while the bundle carries Q1–Q12 (Q11/Q12 added 2026-07-20; the registry-test comment records the addition, the metadata record text does not).
4. **cache-gauntlet is invisible to the default gate**: IT29 sits in the deterministic suite with no `runMutationTests` selector, and all 8 checks are `RequiresMutation` — so `npm run test:integration` runs the bundle as a structural no-op. Either flip the selector or accept that #3195/#3199 live coverage requires `RUN_MUTATION_TESTS=1`.
5. **B39 workarounds now droppable**: S31b and CG7 still thread `EntityName` alongside `ViewID` "until B39 is fixed" — the register marks B39 FIXED.
6. **Retired-path references**: the server-cache/client-cache/runquery-cache headers cite their `packages/MJServer/integration-test-scripts/*-tests.ts` origins; those tsx dispatchers were removed in the July-2026 restructure (`mj test` is the single entry path) — the references are historical provenance only.

## See also

- [test-catalog.md](./test-catalog.md) — the candidate catalog this family shipped from (Domain: cache/data access)
- [bug register](../../../../plans/integration-test-expansion/bug-register.md) — every B##/H# cited above
- [data-access-suite.md](data-access-suite.md) — the RunView/RunQuery feature surface these caches sit under
- [security-suite.md](security-suite.md) — the permission machinery behind S31/S31b/Q12
- [README.md](README.md) — the docs index for all six sub-suite families
- `packages/TestingFramework/testing-integration/CATALOG.md` — the living coverage index (per-bundle counts/tiers/transports)
