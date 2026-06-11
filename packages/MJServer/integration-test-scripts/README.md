# RunView Caching — Live Integration Test Scripts

Live, end-to-end integration tests for MemberJunction's RunView caching pipeline, exercising
the **real** server componentry (SQLServerDataProvider against live SQL Server) and the
**real** client componentry (GraphQLDataProvider against a running MJAPI) — the exact same
code paths MJAPI and MJExplorer run in production, just bootstrapped from Node scripts.

This sits **between** the unit-test layer (mocked providers, vitest) and the full
browser-driven regression suite: real database, real GraphQL transport, real cache
managers — but scripted, fast (~10s server / ~25s client), and assertion-precise. It
tests the **seams between packages** that unit tests mock away and browser tests
traverse but cannot assert (a browser test never notices a 2-column cached payload,
and it can't count cache reads).

## Contents

| File | Purpose |
|---|---|
| `server-cache-tests.ts` | 17 tests against SQLServerDataProvider (`TrustLocalCacheCompletely = true`) |
| `client-cache-tests.ts` | 8 tests against a running MJAPI via GraphQLDataProvider (`TrustLocalCacheCompletely = false`) |
| `lib/harness.ts` | Env/config loading, minimal test runner, shape assertions, instrumented storage provider |

---

## The design under test (30-second refresher)

MJ's RunView cache stores **one full-width superset per entity+filter** and projects
per-caller on every read:

- The **server cache fingerprint** deliberately *excludes* `Fields` and `ResultType` —
  when a query is cacheable, `params.Fields` is widened to ALL entity fields before the
  DB hit, so a single cache entry can satisfy any future field subset.
- **Projection** (`ProjectRowsToFields`) restores the caller's requested shape on cache
  **hits** (filtering the cached superset) AND on cache **misses** (filtering the widened
  DB result) — identical shapes regardless of cache temperature.
- The **dedup/linger key** (in-flight request sharing + 5s linger window) *includes*
  `Fields` and `ResultType`, because the dedup layer shares the FINAL pipeline output —
  rows already projected and transformed for one caller.
- The **client cache fingerprint** appends `|f:<normalized fields>` — the client never
  widens (narrow wire payloads are the point) and never projects on read, so each field
  subset gets its own exact-match slot.

| Layer | Keyed by Fields? | Why |
|---|---|---|
| Server cache fingerprint | No | Stores full-width superset; projects per-read |
| Dedup / linger key | **Yes** (+ ResultType) | Shares post-projection output verbatim |
| Client cache fingerprint | **Yes** (`\|f:` suffix) | Stores rows as returned; no projection on read |

These suites verify every row of that table against the live stack.

---

## How it works

### Architecture

```mermaid
flowchart TD
    subgraph ServerSuite["server-cache-tests.ts  (Node script, repo root)"]
        SBOOT["LoadEnv + LoadDbConfig<br/>(.env / mj.config.cjs — no hardcoded secrets)"]
        SCACHE["LocalCacheManager.Initialize(<br/>InstrumentedLocalStorageProvider<br/>wrapping InMemoryLocalStorageProvider)<br/><i>BEFORE provider setup — first caller wins</i>"]
        SSETUP["setupSQLServerClient(...)<br/>+ UserCache → context user"]
        SRV["new RunView( ) calls<br/>S1–S17"]
        SBOOT --> SCACHE --> SSETUP --> SRV
    end

    subgraph Pipeline["MJCore ProviderBase pipeline (real, unmocked)"]
        PRE["PreRunView/PreRunViews<br/>widen Fields → superset<br/>fingerprint + cache read"]
        DEDUP["RunViews dedup + 5s linger<br/>key includes Fields + ResultType"]
        POST["PostRunView/PostRunViews<br/>cache write (superset)<br/>→ project to caller Fields<br/>→ entity_object transform"]
    end

    subgraph Storage["Instrumented cache storage"]
        LCM["LocalCacheManager"]
        WRAP["InstrumentedLocalStorageProvider<br/>per-category Get/Set counters"]
        MEM["InMemoryLocalStorageProvider"]
        LCM --> WRAP --> MEM
    end

    SRV --> DEDUP --> PRE
    PRE -- "hit: project cached superset" --> POST
    PRE -- "miss" --> SQL[("live SQL Server<br/>(DB_* env settings)")]
    SQL --> POST
    PRE <--> LCM
    POST <--> LCM

    subgraph ClientSuite["client-cache-tests.ts  (Node script, repo root)"]
        CBOOT["LoadEnv + LoadClientConfig<br/>(MJ_API_KEY, GRAPHQL_PORT / MJAPI_URL)"]
        CSETUP["setupGraphQLClient(...)<br/>x-mj-api-key auth, no browser"]
        CCACHE["LocalCacheManager.Initialize(<br/>instrumented in-memory provider)<br/>per-Fields |f: slots"]
        CRV["new RunView( ) calls<br/>C1–C8 (CacheLocal opt-in)"]
        CBOOT --> CSETUP --> CCACHE --> CRV
    end

    CRV -- "GraphQL over HTTP<br/>RunViews / RunViewsWithCacheCheck" --> MJAPI["running MJAPI<br/>(GenericDatabaseProvider +<br/>its own server-side cache)"]
    MJAPI --> SQL
```

### Client smart-cache round trip (what `CacheLocal: true` does)

```mermaid
sequenceDiagram
    participant T as Test (RunView CacheLocal)
    participant G as GraphQLDataProvider
    participant CC as Client LocalCacheManager<br/>(instrumented, per-|f: slots)
    participant API as MJAPI (RunViewsWithCacheCheck)
    participant SC as Server LocalCacheManager
    participant DB as SQL Server

    T->>G: RunView({ Fields, CacheLocal: true })
    G->>CC: lookup slot fingerprint|f:fields
    alt slot exists
        G->>API: params + cacheStatus { maxUpdatedAt, rowCount }
        API->>SC: validate / serve
        API-->>G: status = current | differential | stale(+rows)
        G->>CC: current → serve slot · differential → merge · stale → rewrite slot
    else no slot
        G->>API: params (no cacheStatus)
        API->>SC: server-cache check
        alt server hit
            SC-->>API: cached rows
        else server miss
            API->>DB: execute query
            DB-->>API: rows (cached server-side)
        end
        API-->>G: fresh rows
        G->>CC: write new |f: slot (fire-and-forget)
    end
    G-->>T: RunViewResult (assert exact column shape + counters)
```

### The two proof techniques

**1. `UniqueFilter(column, tag)`** — every test that needs a guaranteed-cold cache entry
uses an always-true filter that is textually unique per tag
(`Name <> 'zzz-cache-test-<tag>'`). `ExtraFilter` is part of the fingerprint, so each tag
yields a fresh entry while matching the same rows — cold-cache determinism with **zero
data mutation**.

**2. `InstrumentedLocalStorageProvider`** — wraps the real in-memory storage with
per-category Get/Set counters. Tests don't guess whether the cache was used; they prove
it: a miss shows a `RunViewCache` write, a hit shows none, a linger-served dedup result
shows **zero storage traffic at all**, and `BypassCache` must leave the counters
untouched. Counters are scoped per category because `LocalCacheManager` also persists
its registry index asynchronously in a different category.

---

## Test inventory

### Server suite (S1–S17)

| # | Verifies |
|---|---|
| S1 | Cold miss with narrow `Fields` returns ONLY requested columns + writes the cache |
| S2 | Hit returns the identical shape (miss/hit symmetry — the original defect) + `ExecutionTime: 0` |
| S3 | A different field subset is served from the same superset entry, no rewrite |
| S4 | No `Fields` → full entity width (pass-through) |
| S5 | Case-insensitive field matching; original column casing preserved |
| S6 | `entity_object` results are full `BaseEntity` instances even from a cached superset |
| S7 | `BypassCache` skips cache read AND write, narrow fields end-to-end *(known-red — bug #1)* |
| S8 | `TotalRowCount` parity across miss/hit |
| S9 | Batch `RunViews`: each result projected to its OWN param's fields |
| S10 | Mixed hit+miss batch: warm index from cache, cold index from DB, both correct |
| S11 | Linger-window callers with different `Fields` get their own shapes (dedup key regression) |
| S12 | Linger-window callers with different `ResultType` get their own representations |
| S13 | Identical repeat in the linger window is served with zero storage traffic |
| S14 | Different `ExtraFilter` values fingerprint independently |
| S15 | `OrderBy` honored on miss and hit |
| S16 | `MaxRows` limits rows and fingerprints separately from the unlimited query |
| S17 | *(gated)* Save invalidates filtered entries; delete removes the row *(delete half known-red — bug #3)* |

### Client suite (C1–C8)

| # | Verifies |
|---|---|
| C1 | Narrow `Fields` shape survives the GraphQL transport end-to-end (no CacheLocal) |
| C2 | Server miss/hit symmetry over the wire (second call past the linger window) |
| C3 | `CacheLocal` miss writes a client slot; repeat validates `current` and serves locally *(known-red — bug #2)* |
| C4 | Different subset gets its OWN `\|f:` slot — no cross-subset serving *(known-red — bug #2)* |
| C5 | Full-width (`'*'`) request is not satisfied by a narrow slot *(known-red — bug #2)* |
| C6 | `entity_object` materializes as `BaseEntity` client-side, including from cache |
| C7 | Client dedup keying: different `Fields` in the linger window get their own shapes |
| C8 | Mixed-CacheLocal batch projects each result to its own param *(known-red — bug #2)* |

---

## Running

Both scripts run from the **repo root** (cwd-relative `.env` / `mj.config.cjs`):

```bash
# Server-side suite — needs only the database
npx tsx packages/MJServer/integration-test-scripts/server-cache-tests.ts

# Server-side suite including the save/delete invalidation test
# (creates + deletes ONE "MJ: User Settings" row for the context user)
RUN_MUTATION_TESTS=1 npx tsx packages/MJServer/integration-test-scripts/server-cache-tests.ts

# Client-side suite — needs MJAPI running (cd packages/MJAPI && npm run start)
npx tsx packages/MJServer/integration-test-scripts/client-cache-tests.ts
```

Exit codes: `0` all passed · `1` failures · `2` bootstrap/connectivity error.

These scripts are **not** part of the MJServer build (its tsconfig includes `./src` only)
and have no package.json footprint — they resolve workspace packages through the monorepo
root `node_modules` and run directly via `tsx`.

### Environment variables used (all looked up, never hardcoded)

| Variable | Used by | Meaning |
|---|---|---|
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | server suite | SQL Server connection (`mj.config.cjs` `databaseSettings` takes precedence) |
| `MJ_TEST_USER_EMAIL` | server suite | Optional context-user override (defaults to the Owner-type user) |
| `MJ_API_KEY` | client suite | System API key MJAPI accepts via `x-mj-api-key` |
| `GRAPHQL_PORT` / `GRAPHQL_ROOT_PATH` / `MJAPI_URL` | client suite | Endpoint resolution; `MJAPI_URL` overrides the composed localhost URL |
| `RUN_MUTATION_TESTS` | server suite | `1` enables the save/delete invalidation test |

---

## Known-red tests (real product bugs found by this suite, 2026-06-11)

These tests assert **intended** behavior and are expected to stay red until the bugs are
fixed. Do not "fix" the tests.

1. **S7 — BypassCache cache poisoning (server, batch path).**
   `PostRunViews`' cache-write gate (`providerBase.ts`) checks
   `CacheLocal || TrustLocalCacheCompletely` but never `BypassCache` (or `AfterKey`), and
   computes the fingerprint inline — unlike `PostRunView` (singular) which is guarded by
   `preResult.fingerprint`. Server-side singular `RunView({BypassCache: true})` routes
   through the batch path, so the **narrow, un-widened** result gets written under the
   Fields-agnostic superset fingerprint. Demonstrated consequence: a following normal
   full-width query for the same entity+filter is served from cache with 2 columns
   instead of ~70. (`AfterKey` keyset pages would poison the same way.)

2. **C3/C4/C5/C8 — smart-cache server path bypasses widening AND projection.**
   `GenericDatabaseProvider.RunViewsWithCacheCheck` reimplements caching outside the
   ProviderBase pipeline: `runFullQueryAndCacheResult` caches the caller's **narrow**
   result under the Fields-agnostic server fingerprint, and the Phase-3
   `serveFromServerCache` shortcut returns cached rows to no-cacheStatus clients with
   **no per-caller Fields projection**. Net effect observed live: one client's
   `CacheLocal` shape poisons the server slot, and every subsequent client request for
   the same entity+filter receives that first caller's columns regardless of what it
   asked for (including full-width `'*'` requests getting 3 columns).

3. **S17 — DELETE-driven invalidation fails for filtered cache entries (ghost rows).**
   Save-driven invalidation works (a saved row appears in a previously-cached filtered
   query after the fire-and-forget event lands). But after `BaseEntity.Delete()`, the
   filtered cache entry keeps serving the deleted row: reproduced in isolation —
   post-delete cached query returns 1 row with `ExecutionTime: 0` while a
   `BypassCache` DB-truth query returns 0 rows. Deleted records remain visible to
   every cached filtered RunView until the entry expires or is otherwise invalidated.

Also noted while building the suite:
- `ResultType: 'count_only'` is documented in `RunViewParams` but implemented by no
  provider — it silently returns 0 rows / 0 TotalRowCount.
- The direct (non-cached) SQL path includes the primary key alongside explicitly
  requested `Fields`, while the cached path projects to exactly the requested fields —
  a minor shape asymmetry between `BypassCache` and cached narrow queries.
- Swapping storage providers post-initialization via
  `LocalCacheManager.SetStorageProvider` appeared to break save-driven invalidation for
  entries created after the swap (the suite originally used the swap and S17's save
  half failed; initializing first instead made it pass). Needs verification — the same
  swap is how MJServer installs Redis, though that happens at startup before traffic.
- The RunView pipeline **mutates caller params objects** (`Fields` widened in place on
  cacheable calls) — caller-visible side effect worth knowing about.

---

## Gotchas when writing tests here (learned the hard way)

1. **Construct fresh param objects per call.** The pipeline widens `params.Fields` in
   place on cacheable calls — reusing a params object makes your second call a
   different (all-fields) request. Use a `makeParams()` factory.
2. **Scope counter assertions to the `'RunViewCache'` category.** The registry index
   persists asynchronously in another category and will randomly bump global counters.
3. **Initialize the instrumented cache BEFORE provider setup.** `Initialize` is
   first-caller-wins; the provider's `StartupManager` initializes it during setup, and a
   post-hoc `SetStorageProvider` swap showed invalidation side effects (see findings).
4. **Outlive the 5-second dedup linger window** (sleep ~5.2s) when a test needs the
   second call to genuinely reach the cache or the server rather than the in-flight
   dedup slot.
5. **Mutation tests: settle after Save/Delete.** Cache invalidation is fire-and-forget
   off BaseEntity events — allow ~2s before asserting, and clean up in `finally`.
6. **Mind the deferred engines.** `StartupManager` kicks `AIEngine` ~15s after
   bootstrap; it runs its own RunViews in the background. UniqueFilter isolation keeps
   it from touching your fingerprints, but global counters will move.

## Extending the suite

- Add tests with `suite.Test('name', async () => { ... })` — they run sequentially in
  registration order, and several intentionally build on cache state from earlier tests.
- Use a fresh `UniqueFilter` tag for each new test that needs a cold cache entry.
- Keep everything read-only by default; gate any data mutation behind an env flag and
  clean up in a `finally` block (see S17).
- The harness (`lib/harness.ts`) is deliberately dependency-light and copy-friendly —
  if a second suite area appears (RunQuery caching, dataset caching, RLS, keyset
  pagination), promote it to a shared location rather than duplicating it.
