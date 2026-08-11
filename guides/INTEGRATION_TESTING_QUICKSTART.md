# Integration Testing Quickstart

MemberJunction's **integration-test tier** exercises the *real* server stack — live database,
real data providers, real cache managers, real engines — from a headless Node process, with no
browser and (by default) no LLM calls. It proves the **seams between packages**: the places
unit tests mock away and browser tests traverse but cannot assert.

This guide covers the architecture, every way to run the tier, and every way to add coverage.

---

## 1. Where this tier sits

| Tier | What's real | What stands in | Tooling | Speed |
|---|---|---|---|---|
| **Unit tests** | The function under test | Providers, DB, transport (all mocked) | Vitest | ms |
| **Integration tests** | DB, providers, cache managers, engines, GraphQL transport | *Only the top layer* — the test process stands in for MJAPI/MJExplorer | `mj test` (the Testing Framework CLI) | ~10–60s/suite |
| **Browser / computer-use regression** | Everything, end to end | Nothing | Playwright / CU | minutes |

The guiding principle is **"mock the top layer, keep everything else real."** A mocked provider
never proves the real cache fingerprint is correct; a browser never notices that a cached
payload came back with 2 columns instead of 5, and it can't count how many times the cache was
read. This tier asserts exactly those things — against the live dev database, deterministically.

**The rule for shipping:** no server-side feature is done until the deterministic integration
tier passes headless (`npm run test:integration`), and new server capability comes with new
integration coverage.

---

## 2. Architecture

### 2.1 Framework and content, one execution front-end

Since the July-2026 restructure, the tier is split into a **framework** package (published,
content-free) and a **content** package (private, never published) — and there is exactly
**one** way to execute the catalog: `mj test`.

```
  ┌───────────────────────────────────────────┐   ┌──────────────────────────────────────────┐
  │   @memberjunction/testing-integration     │   │  @memberjunction/integration-test-suite  │
  │   (published — FRAMEWORK ONLY)            │   │  (private: true — MJ's OWN test content) │
  │                                           │   │                                          │
  │  IntegrationCheckRegistry (BaseSingleton) │◀──┤  src/checks/  · 80 bundles · 569 checks  │
  │  NamedCheck / BundleLifecycle contracts   │   │  src/index.ts barrel (side-effect-       │
  │  bootstrap  (server / client / PostgreSQL)│   │    imports every bundle → registers all) │
  │  InstrumentedLocalStorageProvider         │   │  src/__tests__/  count table + parity    │
  │  tiers  (IsTierEnabled — the ONE gate)    │   │  rigs/  standalone tsx scripts           │
  │  TestRunner + Assert helpers · ai-verify  │   │        (NOT catalog entry paths)         │
  │  IntegrationTestDriver  (@RegisterClass)  │   └──────────────────────────────────────────┘
  └─────────────────────▲─────────────────────┘                       ▲
                        │                                             │ loaded at runtime via
  ┌─────────────────────┴─────────────────────────────────────────────┴──────┐
  │  The ONE front-end: mj test                                              │
  │  TestEngine → "Integration Test" TestType → IntegrationTestDriver        │
  │  mj test run / mj test suite  ·  results → MJ: Test Runs                 │
  │  mj.config.cjs testing.checkModules (or --checks-module) loads bundles   │
  └──────────────────────────────────────────────────────────────────────────┘
```

- **The framework** (`packages/TestingFramework/testing-integration/`) ships to customers —
  `@memberjunction/server-bootstrap`'s manifest imports `IntegrationTestDriver` from its
  barrel — so it deliberately carries **no check bundles and no heavy dependencies**.
- **The content** (`packages/TestingFramework/integration-test-suite/`, `private: true`) holds
  every check bundle plus the heavy dependency tree (`ai-agents`, `record-set-processor`,
  `predictive-studio`, …). Importing its barrel registers the full catalog on the shared
  registry as a side effect.
- **The loading seam**: the published `mj` CLI cannot depend on the private package, so
  `mj test run` / `mj test suite` side-effect-import it at startup via the repo root
  `mj.config.cjs` — `testing: { checkModules: ['@memberjunction/integration-test-suite'] }` —
  after the instrumented-cache install and before provider setup. Ad-hoc override:
  `--checks-module <specifier>`. **External adopters point `checkModules` at their own check
  packages** — that is the extension point.
- **Execution is metadata-driven**: a `MJ: Test Types` row named **`Integration Test`** points
  at `DriverClass: "IntegrationTestDriver"`; `MJ: Tests` rows select bundles via their
  `Configuration` JSON; suites group tests; results persist as `MJ: Test Runs` rows browsable
  in the Explorer Testing dashboard.

(The old second front-end — per-suite `tsx` dispatchers + a `run-all.ts` aggregator under
`packages/MJServer/integration-test-scripts/` — was **deleted by design**; that folder is now a
pointer README. One registry, one driver, one entry path: coverage cannot drift because there
is nothing left to drift.)

### 2.2 The check contract

A **check** is an async function that **throws on failure** and returns on pass (the `Assert*`
helpers throw). There is no per-check result interface — the harness wraps each check in
try/catch and records the outcome.

```typescript
// packages/TestingFramework/testing-integration/src/check.ts
export type IntegrationCheckFn = (ctx: IntegrationCheckContext) => Promise<void>;

export interface NamedCheck {
    Id: string;                    // '<bundle>.<localId>', e.g. 'server-cache.S1'
    Name: string;                  // human-readable, shown in output / TestRun details
    Fn: IntegrationCheckFn;
    RequiresMutation?: boolean;    // runs only when the mutation tier is enabled
    RequiresLiveModel?: boolean;   // runs only when the live-model tier is enabled
}
```

Checks are grouped into **bundles** — ordered arrays registered under a shared prefix
(`server-cache`, `rls-isolation`, `ai-skills`, …). **Order is load-bearing**: several checks
intentionally build on cache state from earlier ones (e.g. one check warms a cache slot that
the next asserts a hit on), so the driver runs a bundle's checks strictly in array order.

Every check receives one shared **`IntegrationCheckContext`**:

| Field | What it is |
|---|---|
| `User` | Resolved context user (`MJ_TEST_USER_EMAIL` override → Owner-type → first user) |
| `Provider` | The run-scoped real provider — `SQLServerDataProvider` (server) or `GraphQLDataProvider` (client) |
| `Storage` | The `InstrumentedLocalStorageProvider` — per-category cache counters (§2.4) |
| `Pool` | Raw `mssql` pool for fixture SQL (server transport only) |
| `Schema` | Core schema (e.g. `__mj`) |
| `Config` | The opaque per-bundle `config` bag from the selector (e.g. `datasetName`, `entityName`) |
| `Fixtures` / `RlsFixture` / `AiSkillsFixture` / … | Typed slots populated by the bundle's lifecycle or the driver |

**Mutating bundles register a `BundleLifecycle`** — `Setup` creates the bundle's shared fixture
(throwaway rows, prefixed names) and assigns it onto the context; `Teardown` deletes everything
in FK-safe order. The driver wraps the bundle's checks in `Setup → run → Teardown
(finally)`, and teardown is best-effort (it never throws, so a failing check still cleans up).

The registry itself
([`check-registry.ts`](../packages/TestingFramework/testing-integration/src/check-registry.ts))
is a `BaseSingleton` with `Register`, `Get(id)`, `GetBundle(prefix)`, `RegisterLifecycle`, and
`GetLifecycle` — it lives in the **framework** package. Bundle modules **self-register on
import** — the **suite** package's
[`index.ts`](../packages/TestingFramework/integration-test-suite/src/index.ts) exports every
`checks/*.checks.ts`, so importing `@memberjunction/integration-test-suite` (which the CLI does
via the `checkModules` seam) loads the full catalog. The driver's `@RegisterClass` decorator
fires from the framework package's own barrel.

### 2.3 The bootstrap and the dedicated-process rule

Every integration run **owns its process**. The load-bearing invariant:

> The `InstrumentedLocalStorageProvider` must be installed as the **first caller** of
> `LocalCacheManager.Instance.Initialize(...)` — *before* any provider setup.
> `Initialize` is first-caller-wins: installed late, instrumentation is a **silent no-op**
> (caching still works against the provider's own storage, but the counters never see traffic,
> which looks exactly like a product bug).

[`bootstrap.ts`](../packages/TestingFramework/testing-integration/src/bootstrap.ts) enforces
this with three install paths that share one process-global instrumented storage:

| Function | Use |
|---|---|
| `bootstrapIntegrationServer(opts?)` | Owns the process: instrumented cache first, then the real database provider (SQL Server by default; PostgreSQL when `DB_PLATFORM=postgresql`), user-cache refresh, context-user resolution. Used by the smoke test, the standalone rigs, and as the driver's self-bootstrap fallback. |
| `bootstrapIntegrationClient()` | Same first-caller discipline, then `setupGraphQLClient` against a **running MJAPI** (preflights the endpoint first; authenticates via `MJ_API_KEY` → `x-mj-api-key`). |
| `installInstrumentedCacheFirst()` | Installs ONLY the cache — for the testing CLI, which sets up its own provider afterwards. Triggered by `MJ_INTEGRATION_TEST=1`. |

Configuration is resolved from the repo root's `.env` / `mj.config.cjs`
(`databaseSettings` takes precedence over `DB_*` env vars) — **never hardcoded secrets** — which
is why everything runs **from the repo root**.

Two consequences:

1. **Server-transport suites cannot run inside a live MJAPI** — its `StartupManager` already
   initialized the cache. The driver detects this (`serverProcessAlreadyClaimed()`) and fails
   fast with an actionable `Error` result telling you to run via the CLI in a dedicated
   process. The Explorer Testing dashboard therefore **browses** integration runs and their
   per-check results, but execution belongs to the CLI / scripts.
2. **Integration suites run strictly serially.** Bundles share process-global singletons
   (`LocalCacheManager`, the instrumented counters, `UserCache`, `Metadata.Provider`), so the
   CLI forces `parallel: false` whenever `MJ_INTEGRATION_TEST=1`, overriding any `--parallel`.

**PostgreSQL:** `DB_PLATFORM=postgresql` routes the same bootstrap (and the same downstream
check code) through `@memberjunction/postgresql-dataprovider` (an optional dependency, loaded
only on that path). Context-user resolution on PG requires a populated user cache; without one
the bootstrap throws a clear, actionable error rather than fabricating a user.

### 2.4 The two proof techniques

These make integration checks *assertion-precise* rather than vibes-based
([`instrumented-cache.ts`](../packages/TestingFramework/testing-integration/src/instrumented-cache.ts)):

1. **`UniqueFilter(column, tag)`** → `Name <> 'zzz-cache-test-<tag>'` — an always-true filter
   that is textually unique per tag. Because `ExtraFilter` is part of the cache fingerprint,
   every tag yields a **guaranteed-cold cache entry** while matching the same rows. Cold-cache
   determinism with **zero data mutation** — critical against a live shared dev database.

2. **`InstrumentedLocalStorageProvider`** — wraps the real in-memory cache storage with
   per-category Get/Set counters. Checks don't *guess* whether the cache was used; they *prove*
   it: a miss shows a `RunViewCache` write, a hit shows none, a dedup/linger-served result
   shows **zero storage traffic at all**, and `BypassCache` must leave the counters untouched.
   Scope assertions to the `'RunViewCache'` **category** (`Storage.SetCount('RunViewCache')`)
   — `LocalCacheManager` persists its registry index asynchronously in a different category, so
   global counters are noisy.

### 2.5 Tiers and gating

Every check (and every metadata Test) belongs to a **tier**
([`tiers.ts`](../packages/TestingFramework/testing-integration/src/tiers.ts)):

| Tier | Contract | Gate |
|---|---|---|
| `deterministic` | Credential-free, read-only or self-cleaning; **the blocking CI gate** | none — always runs |
| `mutation` | Writes to the DB and cleans up unconditionally | `RUN_MUTATION_TESTS=1` |
| `live-model` | Real LLM calls — costs tokens, needs model credentials | **default-ON**; opt *out* with `RUN_AGENT_TESTS=0` |

`IsTierEnabled(tier)` is the **single predicate** every consumer (driver, rigs) calls, so a
gate is honored identically everywhere. Gating exists at two granularities:

- **Whole-test**: a metadata Test's `Configuration.tier` (or an explicit `requiresEnv` env-var
  override). When gated off, the driver reports a real **`Skipped`** status with one `gate`
  oracle whose message reads `Skipped: <VAR> not set (tier '<tier>')`. A skipped test is
  visible in every summary (`X passed / Y failed / Z skipped`) and never counts as passed —
  but it doesn't fail the suite either.
- **Per-check**: `RequiresMutation` / `RequiresLiveModel` flags on individual `NamedCheck`s
  inside an otherwise-deterministic bundle (e.g. the save/delete invalidation checks in the
  server-cache bundle). Gated-off checks are recorded as skipped oracle entries (never
  silently dropped). A bundle selector can also opt mutation checks in declaratively via
  `config.runMutationTests: true`, independent of env.

Adjacent gates outside the tier enum: the Predictive Studio *flow* rigs
(`integration-test-suite/rigs/ps-*.ts`) run only under `PS_INTEGRATION=1` (they also need the
Python sidecar), the cross-server rig under `RUN_CROSS_SERVER=1`, and client-transport tests
need a reachable MJAPI + `MJ_API_KEY`.

### 2.6 Transports

| Transport | Stack under test | Needs |
|---|---|---|
| `server` (default) | `SQLServerDataProvider` (or PostgreSQL) directly — server-side cache semantics (`TrustLocalCacheCompletely = true`) | Database only |
| `client` | `GraphQLDataProvider` → a **running MJAPI** — client cache semantics (`TrustLocalCacheCompletely = false`, `CacheLocal` opt-in, smart-cache-check round-trips) | MJAPI up + `MJ_API_KEY` |

A metadata Test declares `Configuration.transport` explicitly, or the driver infers it from the
selected bundles (the client-transport bundles are `client-cache`, `rls-isolation-client`, and
`remote-op-wire-progress`).

### 2.7 The metadata layer

The Testing Framework ([`packages/TestingFramework/`](../packages/TestingFramework/)) is
metadata-driven end to end:

```
MJ: Test Types ──▶ "Integration Test"  { DriverClass: "IntegrationTestDriver", Status: Active }
      │                                  metadata/test-types/.integration-test-type.json  (normal metadata — inert type def)
      ▼
MJ: Tests ───────▶ IT01…IT80            Configuration selects bundles + tier + transport
      │                                  metadata-optional/integration-test/tests/integration/.IT*.json
      ▼
MJ: Test Suites ─▶ "Integration Tests"  (parent — 0 members; running it errors, exit 1)
                   ├─ "Integration Tests — Deterministic"   IT01–IT15, IT20–IT52, IT64–IT80  (65 members, the blocking tier;
                   │                                        ORDERING INVARIANT: server-transport members seq 1–45, client seq 46–65 —
                   │                                        the first client bundle rebinds the global provider (#3251), so a server
                   │                                        member sequenced after any client member hard-errors)
                   └─ "Integration Tests — Live Model"      IT16–IT19, IT53–IT63  (15 members)
                                         metadata-optional/integration-test/test-suites/.integration-suite.json
      ▼
MJ: Test Runs ───▶ one row per execution; ResultDetails = the per-check OracleResult[]
```

**How execution works:** the CLI first side-effect-imports the configured `checkModules`
(populating the registry — a missing/unbuilt suite package surfaces as an
`Unknown integration check bundle` failure), then `TestEngine` resolves the driver from the
TestType's `DriverClass` via the ClassFactory
(`CreateInstance(BaseTestDriver, 'IntegrationTestDriver')`) and calls `Execute()`. The
[`IntegrationTestDriver`](../packages/TestingFramework/testing-integration/src/IntegrationTestDriver.ts):

1. parses the Test's `Configuration` (below);
2. applies the whole-test tier gate (a real **`Skipped`** result when gated — visible in the
   suite summary as `X passed / Y failed / Z skipped`, never reported as `Passed`);
3. infers/uses the transport and obtains the instrumented provider stack (the one the CLI
   installed first-caller, or a self-bootstrap in a dedicated process — with the fail-fast
   host check from §2.3);
4. runs each selected bundle's checks in order against one shared context, wrapping each
   bundle in its registered lifecycle (`Setup` → checks → `Teardown` in `finally`) and each
   check in try/catch — a thrown check becomes one failing `OracleResult`, never a re-throw
   (a re-throw would leave the TestRun stuck `'Running'`);
5. arms its own timeout (`Configuration.maxExecutionTime` → `Test.MaxExecutionTimeMS` →
   5-minute default) and reports `Timeout` with partial results if it fires;
6. maps outcomes onto the framework result: `status = Passed | Failed | Error | Timeout`,
   `score = passedChecks / totalChecks`, one `OracleResult` per check with
   `oracleType = '<bundle>.<id>'`.

The engine persists `TestRun.ResultDetails` as a **bare `OracleResult[]`**; the Explorer Test
Run form parses it into a per-check pass/fail breakdown.

**The Configuration shape** (parsed off `MJ: Tests.Configuration`,
[`types.ts`](../packages/TestingFramework/testing-integration/src/types.ts)):

```jsonc
{
  "tier": "deterministic",          // or "mutation" | "live-model" (whole-test gate)
  "transport": "server",            // or "client"; optional — inferred from bundles
  "checks": [                       // ORDERED list of check bundles
    {
      "type": "aggregates-cache",   // bundle name, expanded via GetBundle at runtime
      "config": {                   // optional per-bundle knobs, surfaced as ctx.Config
        "entityName": "MJ: User Settings"
      }
    }
  ]
}
```

The metadata layer is intentionally thin: **metadata selects, TypeScript asserts.** There is no
JSON assertion DSL — a Test row picks which registered bundles run (and with what knobs); the
assertions live in the bundle code.

**Suite mechanics:** suite membership rows (`MJ: Test Suite Tests`) carry a `Sequence` (tests
run in order — integration suites are serial) and a `Status` — members marked `Skip` are
excluded from suite runs (IT03, IT15, and IT23 ship as `Skip` in the deterministic suite; run
them individually with MJAPI up).
For suites, the engine also gives drivers **suite-scoped fixtures**: it builds one
`SuiteFixtureContext` (`{ SuiteRunID, Data, CreatedRecords }`) per suite run, calls each
distinct driver's `SetupSuite` once before the tests and `TeardownSuite` in a guaranteed
`finally`, and threads the context into every `Execute` as `context.fixtures`. The
IntegrationTestDriver uses this to discover the RLS two-user fixture once per suite run; on the
no-suite `mj test run` path it lazily re-discovers.

**Server registration:** `@memberjunction/testing-integration` is part of the
[`ServerBootstrap`](../packages/ServerBootstrap/) class-registration manifest, so any process
that boots through it (MJAPI included) can *resolve* the driver — but remember §2.3: inside a
live MJAPI, server-transport tests refuse to execute by design.

### 2.8 Seeded RLS fixtures

The RLS isolation coverage is the security core of this tier: **prove one user's
Row-Level-Security-filtered cache entry can never serve a different user.** It uses two fixture
strategies together:

- **Discovery** (`discoverRlsFixture`) — finds two users with *different* effective RLS
  predicates from the live user cache + provider RLS filters. Nothing is created, so teardown
  is a no-op; on databases with only RLS-exempt admins the dependent checks degrade to
  skipped-with-a-note (surfaced in the skip count, never counted as passed).
- **Seeded, purpose-built users** — these live in the **optional sibling root
  `metadata-optional/integration-test/`, NOT the default-pushed `metadata/` tree**, so the synthetic
  `IsActive` accounts never land in a production DB that only syncs `metadata/`:
  [`metadata-optional/integration-test/users/.integration-test-users.json`](../metadata-optional/integration-test/users/.integration-test-users.json),
  [`metadata-optional/integration-test/roles/.integration-test-roles.json`](../metadata-optional/integration-test/roles/.integration-test-roles.json),
  [`metadata-optional/integration-test/entity-permissions/.integration-test-permissions.json`](../metadata-optional/integration-test/entity-permissions/.integration-test-permissions.json).
  `it-rls-a@integration.test` / `it-rls-b@integration.test` each hold ONLY the
  **`Integration Test: RLS Scoped Reader`** role (read on `MJ: AI Agent Runs`, scoped to the
  caller's own UserID via the `UI: Own AI Agent Runs` RLS filter) — genuinely non-exempt users
  for the deterministic multi-user isolation checks. `it-nogrant@integration.test` has no roles
  at all — the negative check that a user with no grant is served no rows (cached or not).
  When the seed isn't pushed, those checks report Skipped (visible in the skip count).

---

## 3. Running the tier

Everything runs **from the repo root** (`.env` / `mj.config.cjs` resolution is cwd-relative).
Exit codes are uniform across every entry point: **`0` passed (or cleanly skipped) · `1`
failures · `2` bootstrap/connectivity error**.

### 3.1 One-time setup — seed the metadata (load-bearing)

`mj test` is **metadata-driven**: it discovers tests from `MJ: Tests` / `MJ: Test Suites`
records in the database. Without them it has **nothing to dispatch** — so every environment
that runs the tier (a fresh dev DB, CI) must seed them once. The "Integration Test" TestType
lives in the normal `metadata/` tree (an inert type definition), so it lands with a normal
`metadata/` push; the IT tests, the suite hierarchy, and the RLS fixture
users/roles/permissions live under the optional sibling root:

```bash
npx mj sync push --dir=metadata                             # includes the Integration Test TestType
npx mj sync push --dir=metadata-optional/integration-test   # IT tests + suite + RLS fixtures
```

Two more things are load-bearing on every run:

- **`MJ_INTEGRATION_TEST=1`** makes the CLI install the instrumented cache *first-caller*
  before its own provider setup (otherwise counters silently see nothing) and forces the suite
  serial.
- **Use the workspace-local `mj`** (`./node_modules/.bin/mj`; `npm run` scripts and `npx mj`
  from the repo root resolve it automatically). A globally-installed `mj` cannot load the
  private suite package, so every bundle dispatch fails with
  `Unknown integration check bundle`.

The bundles themselves reach the CLI through the **`checkModules` seam** (§2.1): the repo root
`mj.config.cjs` carries `testing: { checkModules: ['@memberjunction/integration-test-suite'] }`,
and the suite package must be **built** (`npm run build` covers it). If `mj test` reports an
unknown bundle, check — in order — metadata seeded, suite package built, `checkModules`
configured.

### 3.2 The whole tier

```bash
npm run test:integration                      # deterministic suite (gated checks report Skipped)
RUN_MUTATION_TESTS=1 npm run test:integration # + mutation-gated checks inside the bundles
```

`npm run test:integration` is exactly
`MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Deterministic"` — the suite runs
serially, one `MJ: Test Runs` row per test, one exit code for CI.

### 3.3 One test / one suite — `mj test`

The per-bundle iteration loop is `mj test run` with the bundle's IT record name:

```bash
# One test (the old "run one suite's dispatcher" loop)
MJ_INTEGRATION_TEST=1 npx mj test run --name "IT01 - Server RunView Cache Integrity"

# A whole suite (runs serially under MJ_INTEGRATION_TEST=1 regardless of --parallel)
MJ_INTEGRATION_TEST=1 npx mj test suite --name "Integration Tests — Deterministic"

# The live-model suite (also needs the tier gate)
RUN_AGENT_TESTS=1 MJ_INTEGRATION_TEST=1 npx mj test suite --name "Integration Tests — Live Model"

# Client-transport tests — start MJAPI first: (cd packages/MJAPI && npm run start)
MJ_INTEGRATION_TEST=1 npx mj test run --name "IT03 - Client GraphQL Cache Integrity"

# Validate definitions without executing (driver resolvable, Configuration parses)
npx mj test validate --type "Integration Test"
npx mj test run --name "IT01 - Server RunView Cache Integrity" --dry-run
```

Useful extras: `mj test list`, `mj test history`, `mj test suite --flaky-check 3` (runs each
test N times and reports variance), and `--checks-module <specifier>` to preload an ad-hoc
check package on top of the configured `checkModules`.

### 3.4 Browsing results — the Explorer Testing dashboard

Integration `TestRun` rows appear in the Testing dashboard like any other test type, with the
per-check breakdown parsed from `ResultDetails` (each check's `<bundle>.<id>`, pass/fail, and
message) on the Test Run form. Execution from inside a live MJAPI is deliberately refused for
server-transport tests (§2.3) — the run records an `Error` result whose message points you at
the CLI invocation. Treat the dashboard as the observability surface; the CLI and scripts are
the execution surface.

### 3.5 Special rigs — standalone by design

Coverage that can't live inside the one-process `mj test` catalog runs as **standalone `tsx`
scripts** under
[`packages/TestingFramework/integration-test-suite/rigs/`](../packages/TestingFramework/integration-test-suite/rigs/)
(with their shared `lib/harness.ts` + `lib/ai-bootstrap.ts`). They are deliberately NOT catalog
entry paths.

**Bootstrap smoke test** — proves the first-caller invariant end to end (a cold RunView must
show an instrumented `RunViewCache` write); lives with the framework package:

```bash
npx tsx packages/TestingFramework/testing-integration/smoke/bootstrap-smoke.ts
```

**Cross-server cache invalidation** — two MJAPI processes sharing one DB and one Redis; a save
through server A must invalidate server B's cache (Redis pub/sub → remote-invalidate). Uses a
compose overlay on the regression stack:

```bash
docker compose -f docker/regression/docker-compose.test.yml \
               -f docker/regression/docker-compose.cross-server.yml \
               --profile full up -d --wait sqlserver db-setup mjapi mjapi-b

MJAPI_A_URL=http://localhost:14000/ MJAPI_B_URL=http://localhost:14001/ \
MJ_API_KEY=<system-api-key> \
npx tsx packages/TestingFramework/integration-test-suite/rigs/cross-server-invalidation-tests.ts
```

**Other rigs**: `agent-memory-tests.ts` (live-model, `RUN_AGENT_TESTS=1`),
`runview-matrix-tests.ts` (client-first RunView sweep across every entity — needs MJAPI +
`MJ_API_KEY`), and the ten `ps-inproc-*` / `ps-live-*` Predictive Studio flows
(`PS_INTEGRATION=1` + the Python sidecar). All run the same way:

```bash
PS_INTEGRATION=1 npx tsx packages/TestingFramework/integration-test-suite/rigs/ps-inproc-operate-flow.ts
```

**Outcome files** — a run can emit per-check outcome JSON via `EMIT_OUTCOMES=<path>`
(`{name, passed, durationMs, error?}[]`);
[`scripts/integration-golden-diff.mjs`](../scripts/integration-golden-diff.mjs) diffs two such
files by check id and fails on missing/extra/pass-mismatch (timing differences only warn) —
originally the front-end-equivalence proof during the migration, still useful for comparing two
runs.

**The packages' own unit tests** (registry semantics, config parsing, tier gating, driver
mapping in the framework; per-bundle count table + sibling parity in the suite — mocked, no
DB):

```bash
cd packages/TestingFramework/testing-integration && npm run test
cd packages/TestingFramework/integration-test-suite && npm run test
```

### 3.6 Environment reference

| Variable | Consumed by | Meaning |
|---|---|---|
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | server bootstrap | SQL connection (`mj.config.cjs` `databaseSettings` takes precedence) |
| `DB_PLATFORM` | server bootstrap | `sqlserver` (default) or `postgresql` |
| `MJ_TEST_USER_EMAIL` | server bootstrap | Context-user override (default: Owner-type user, else first user) |
| `RUN_MUTATION_TESTS=1` | tier gate | Enables the mutation tier / `RequiresMutation` checks |
| `RUN_AGENT_TESTS` | tier gate | Live-model tier / `RequiresLiveModel` checks. **Default-ON** — `IsTierEnabled` returns `RUN_AGENT_TESTS !== '0'`, so `=1` is a no-op kept for back-compat and only `=0` disables. Note `RUN_MUTATION_TESTS` is the opposite: strictly `=== '1'` |
| `PS_INTEGRATION=1` | `ps-*` rigs | Enables the Predictive Studio flow rigs |
| `MJ_API_KEY` | client bootstrap | System API key MJAPI accepts via `x-mj-api-key` |
| `GRAPHQL_PORT` / `GRAPHQL_ROOT_PATH` / `MJAPI_URL` | client bootstrap | Endpoint resolution; `MJAPI_URL` overrides the composed localhost URL |
| `MJ_INTEGRATION_TEST=1` | testing CLI | Install instrumented cache first-caller + force serial suite execution |
| `EMIT_OUTCOMES=<path>` | driver / TestRunner | Write the per-check outcomes JSON (golden-diff format) |
| `MJ_TEST_DATASET` | dataset-cache bundle | Dataset name override (default `MJ_Metadata`) |
| `MJ_CORE_SCHEMA` | client transport | Core schema override (default `__mj`) |
| `RUN_CROSS_SERVER=1` / `MJAPI_A_URL` / `MJAPI_B_URL` | cross-server rig | Gate + the two MJAPI endpoints |

### 3.7 CI

[`.github/workflows/integration.yml`](../.github/workflows/integration.yml) is the tier's CI
home — a **blocking PR gate** into `next` (path-filtered to `packages/**`, the integration
metadata dirs, and the workflow itself; also `workflow_dispatch`). The job:

1. starts SQL Server 2022 in Docker on the runner and creates an empty `test` database;
2. `npm ci`, then builds the needed graph with turbo;
3. `mj migrate` (applies committed migrations — no live CodeGen), then
   `mj sync push --dir=metadata --ci` (the default metadata, including the inert Integration
   Test TestType) **and** `mj sync push --dir=metadata-optional/integration-test --ci` (the IT
   tests, suites, and RLS fixtures — the metadata `mj test` dispatches from);
4. verifies the RLS fixture users actually landed (a silent no-op seed would leave the
   strongest checks Skipped while the gate stays green — the hard verification plus the
   visible skip count both guard that);
5. `npm run test:integration` — the deterministic suite via `mj test`, pass/fail on its exit
   code.

`PS_INTEGRATION` stays unset and `RUN_AGENT_TESTS` is pinned to `0` in the PR lane (live-model
is default-ON per `tiers.ts`, so the pin is explicit — no token cost, no flakiness). The lane
**boots MJAPI** against the provisioned DB with a per-run `MJ_API_KEY`, so the client-transport
members execute rather than skipping. Anything still gated (Predictive Studio; mutation checks
outside the nightly lane) reports a real `Skipped` status in the summary. Scheduled lanes cover
the rest: nightly `RUN_MUTATION_TESTS=1` + the cross-server Redis rig; weekly Live Model
(gated on the `INTEGRATION_LIVE_MODEL_KEYS` secret).

---

## 4. Writing new tests — pick your method

| You want to… | Method |
|---|---|
| Add an invariant to an area that already has a bundle | **1 — add a check to the bundle** |
| Cover a new area (new engine, new subsystem) | **2 — create a new bundle** (+ Test row) |
| Re-target or recombine existing checks (different dataset/entity, new grouping, new gate) | **3 — metadata only** |
| Exercise infrastructure that can't share one process (multi-server), or prototype freely | **4 — standalone rig** |

### Rules of the road (all methods)

- **Deterministic by default.** No credentials, no LLM calls, no reliance on specific business
  data. Gate anything else behind the right tier flag.
- **Self-cleaning fixtures only.** Create your own throwaway rows (clearly-prefixed names,
  e.g. `mj-frbu-test-*`, or tagged `(mj-integration-test — safe to delete)`) and delete them in
  teardown, FK-safe order. Be **reference-only** toward pre-existing records.
- **Checks throw on failure** — use `Assert` / `AssertEqual` / `AssertRowShape` /
  `AssertKeysInclude` / `AssertKeysExclude` from the package.
- **Construct fresh RunView param objects per call.** The pipeline widens `params.Fields` in
  place on cacheable calls; reusing a params object silently turns the second call into an
  all-fields request. Use a `makeParams()` factory.
- **Fresh `UniqueFilter` tag** for every check that needs a cold cache entry; share a tag
  across checks *only* when the warm/hit chain is the thing under test.
- **Scope counters to the category** (`Storage.SetCount('RunViewCache')`), and
  `Storage.ResetCounts()` at the start of a counter-asserting check.
- **`await settle(ms)`** after fire-and-forget saves (run/step/log finalization goes through
  the async save queue) before reading rows back; outlive the ~5s in-flight dedup linger window
  (sleep ~5.2s) when the second call must genuinely reach the cache/DB.
- **Teardown never throws.** Best-effort deletes (`.catch(() => undefined)`) so a failing check
  still cleans up.
- **Read `BypassCache: true`** when a check must observe true DB state.
- **A new bundle needs its metadata sibling — an IT `Test` record joined to the suite.** The
  bundle is the single source of truth; the metadata record (`.IT##-<bundle>.json` + its
  membership in `.integration-suite.json`) is a thin pointer to it. The suite package's
  `sibling-parity.test.ts` drift-check fails the build if a bundle lacks its IT record / suite
  membership, if a record points at a non-existent bundle, or if `mj.config.cjs` stops loading
  the suite package via `testing.checkModules`. (The old third sibling — a per-bundle `tsx`
  dispatcher — no longer exists.)

### Method 1 — add a check to an existing bundle

Find the bundle in
[`packages/TestingFramework/integration-test-suite/src/checks/`](../packages/TestingFramework/integration-test-suite/src/checks/)
and append a `NamedCheck` to its exported array (the file's registration loop picks it up):

```typescript
// in src/checks/dataset-cache.checks.ts — appended to DatasetCacheChecks
{
    Id: 'dataset-cache.DS4',                       // '<bundle>.<next local id>'
    Name: 'DS4: <the invariant, stated as a sentence>',
    Fn: async (ctx: IntegrationCheckContext) => {
        const md = new Metadata();
        // arrange … act … assert (throw on failure)
        Assert(await md.IsDatasetCached(datasetName(ctx)), 'DS4: expected the dataset cached');
    }
    // RequiresMutation: true,   // ← only if it writes (runs under RUN_MUTATION_TESTS / runMutationTests)
    // RequiresLiveModel: true,  // ← only if it calls a model (runs under RUN_AGENT_TESTS)
}
```

That's almost the whole change — the corresponding ITxx Test expands the bundle at runtime, so
the new check runs with no metadata edit. Mind the ordering: add stateful checks after the
state they depend on, and keep them self-contained (reset your own counters, restore anything
you flip). Update the bundle's row in the count table in
[`check-registry.test.ts`](../packages/TestingFramework/integration-test-suite/src/__tests__/check-registry.test.ts)
(the coverage-loss guard). Then verify:

```bash
cd packages/TestingFramework/integration-test-suite && npm run build && npm run test
MJ_INTEGRATION_TEST=1 npx mj test run --name "IT07 - Dataset Cache (DatasetCache category)"
```

### Method 2 — create a new bundle (new coverage area)

**1. Write the bundle** — `src/checks/<area>.checks.ts` in the **suite package**
(`packages/TestingFramework/integration-test-suite/`), importing the contracts from the
framework:

```typescript
import { Assert, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
import type { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

export const MyAreaChecks: NamedCheck[] = [
    {
        Id: 'my-area.MA1',
        Name: 'MA1: <invariant one>',
        Fn: async (ctx: IntegrationCheckContext) => { /* … Assert(...) … */ }
    },
    {
        Id: 'my-area.MA2',
        Name: 'MA2: <invariant two>',
        Fn: async (ctx: IntegrationCheckContext) => { /* … */ }
    }
];

for (const check of MyAreaChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
```

If the checks share created fixtures, register a lifecycle in the same file — the driver
runs it around the bundle (setup before the checks, teardown in `finally`):

```typescript
IntegrationCheckRegistry.Instance.RegisterLifecycle('my-area', {
    Setup: async (ctx) => { /* create throwaway rows; assign ctx.<MyAreaFixture> */ },
    Teardown: async (ctx) => { /* delete them FK-safe; never throw */ }
});
```

(For a typed fixture slot, add an optional property to `IntegrationCheckContext` in
[`check.ts`](../packages/TestingFramework/testing-integration/src/check.ts) alongside the
existing ones. Ad-hoc knobs can ride the untyped `ctx.Config` bag instead.)

**2. Export the module** from the suite package's
[`src/index.ts`](../packages/TestingFramework/integration-test-suite/src/index.ts) (this is
what registers it on import):

```typescript
export * from './checks/my-area.checks';
```

**3. Build:** `cd packages/TestingFramework/integration-test-suite && npm run build`.

**4. Add the Test row** — `metadata-optional/integration-test/tests/integration/.IT31-my-area.json` (omit
`primaryKey`/`sync`; the sync tool populates them):

```json
{
  "fields": {
    "TypeID": "@lookup:MJ: Test Types.Name=Integration Test",
    "Name": "IT31 - My Area",
    "Description": "What the checks prove, stated as invariants.",
    "InputDefinition": {},
    "ExpectedOutcomes": { "summary": "One-line statement of the proven behavior." },
    "Configuration": {
      "tier": "deterministic",
      "transport": "server",
      "checks": [ { "type": "my-area" } ]
    },
    "Status": "Active"
  }
}
```

For a **client-transport** bundle, set `"transport": "client"` explicitly (or add the bundle
name to the driver's `CLIENT_BUNDLES` set so inference covers it).

**5. Add suite membership** — in
[`metadata-optional/integration-test/test-suites/.integration-suite.json`](../metadata-optional/integration-test/test-suites/.integration-suite.json),
append to the right child suite's `MJ: Test Suite Tests`:

```json
{ "fields": { "SuiteID": "@parent:ID", "TestID": "@lookup:MJ: Tests.Name=IT31 - My Area", "Sequence": 27, "Status": "Active" } }
```

**6. Update the count table** — add the bundle's row (name, checks array, expected count) to
[`check-registry.test.ts`](../packages/TestingFramework/integration-test-suite/src/__tests__/check-registry.test.ts);
`sibling-parity.test.ts` will already be asserting the IT record + suite membership exist.

**7. Push and run:**

```bash
npx mj sync push --dir=metadata-optional/integration-test
MJ_INTEGRATION_TEST=1 npx mj test run --name "IT31 - My Area"
```

No dispatcher, no aggregator registration — the metadata record IS the entry point.

### Method 3 — metadata only (no code)

Because Tests *select* registered bundles, you can add coverage variants without touching
TypeScript:

- **Re-target a parameterized bundle** — e.g. a Test that runs `dataset-cache` against a
  different dataset, or `aggregates-cache` against a different entity:

  ```json
  "checks": [ { "type": "dataset-cache", "config": { "datasetName": "MJ_Skills" } } ]
  ```

  Per-bundle knobs today: `datasetName` (dataset-cache), `entityName` (aggregates-cache),
  `runMutationTests` (server-cache / client-cache), `requireTwoDistinctUsers` (rls-isolation).

- **Compose several bundles into one Test** — `checks` is an ordered array; all selected
  bundles run in one `Execute()` against one bootstrapped context:

  ```json
  "checks": [ { "type": "dataset-cache" }, { "type": "aggregates-cache" } ]
  ```

- **Declare mutation coverage on** for a scheduled (non-CI) run profile via
  `"config": { "runMutationTests": true }` — declarative, no env needed.

- **Regroup with suites** — new `MJ: Test Suites` rows (optionally under the
  `Integration Tests` parent) with any membership/ordering; `Status: "Skip"` on a membership
  row parks a test without deleting it.

- **Gate specially** with `"requiresEnv": "MY_FLAG"` — the driver then skip-passes unless
  `MY_FLAG=1`, overriding the tier-derived gate.

Push with `npx mj sync push --dir=metadata-optional/integration-test` and run via `mj test`.

### Method 4 — standalone rig

For coverage that can't live inside the one-process model — multi-process topologies
(cross-server invalidation), sidecar-dependent end-to-end flows (`ps-*`), or exploratory work
that isn't ready to be a bundle — write a self-contained script in
[`packages/TestingFramework/integration-test-suite/rigs/`](../packages/TestingFramework/integration-test-suite/rigs/).
Use the shared harness + the framework bootstrap so the process discipline stays right:

```typescript
import { TestRunner, Assert, bootstrapIntegrationServer } from './lib/harness';

async function main(): Promise<void> {
    // Self-skip protocol: exit 0 with a clear SKIPPED message when prerequisites are
    // absent, so ad-hoc CI wrappers stay green on boxes without the rig's topology.
    if (process.env.MY_PREREQ !== '1') {
        console.log('my-area-tests: SKIPPED — MY_PREREQ not set.');
        process.exit(0);
    }

    const ic = await bootstrapIntegrationServer({ ContextUserEmail: process.env.MJ_TEST_USER_EMAIL });
    const suite = new TestRunner('My area (standalone)');
    suite.Test('does the thing against the real stack', async () => {
        Assert(true, 'assertion message');
    });

    const failures = await suite.Run();
    await ic.ClosePool();
    process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => { console.error(`\nBootstrap error: ${err}`); process.exit(2); });
```

Honor the exit-code contract (`0/1/2`) and keep it self-cleaning. Rigs are **not** part of the
`mj test` catalog or `npm run test:integration` — they run only when invoked directly. When a
rig's coverage stabilizes (and it can live in one process), prefer folding it into a bundle
(Method 2) so the metadata path runs it too.

---

## 5. Reference

### 5.1 Bundle inventory

All bundles live in
[`packages/TestingFramework/integration-test-suite/src/checks/`](../packages/TestingFramework/integration-test-suite/src/checks/)
(the per-bundle count table in that package's `check-registry.test.ts` guards against silent
coverage loss):

| Bundle | Checks | Transport | Lifecycle fixture | Selected by | Notes |
|---|---|---|---|---|---|
| `server-cache` | 32 (S17/S23/S24/S29/S30/S31b mutation-gated) | server | — | IT01 | RunView server cache: shape parity, fingerprint identity, dedup/linger, BypassCache, invalidation |
| `runquery-cache` | Q1–Q12 (12) | server | Query Category + TTL/validated Queries | IT02 | RunQuery caching (TTL + smart validation); the bundle mutates by design |
| `client-cache` | C1–C13 (13; C10 mutation-gated) | client | — | IT03 | `CacheLocal` opt-in caching + smart cache-check over GraphQL |
| `record-process` | RP1–RP8 (8) | server | — | IT04 | RecordSetProcessor substrate: persistence, isolation, circuit breaker, concurrency |
| `record-process-facade` | RPF1–RPF2 (2) | server | Record Process definition | IT05 | RecordProcessExecutor facade (`Run`/`RunByID`) |
| `rls-isolation` | RLS1–RLS6, RLS8–RLS10 (9) | server | discovered + seeded users | IT06 | RLS token substitution, predicate divergence, fingerprint no-leak, live scoping, no-grant negative |
| `rls-isolation-client` | RLS7 (1) | client | — | IT23 | The client-transport RLS leg |
| `dataset-cache` | DS1–DS3 (3) | server | — | IT07 | `GetAndCacheDatasetByName` + status APIs (`datasetName` knob) |
| `aggregates-cache` | AGG1–AGG3 (3) | server | — | IT08 | Aggregates in the fingerprint + round-trip + ordering (`entityName` knob) |
| `scheduled-jobs` | SJ1–SJ2 (2) | server | Scheduled Job row | IT09 | Run lifecycle + distributed lease |
| `field-rules-bulk-update` | FR1–FR3 (3) | server | 3 Action Categories | IT10 | FieldRules dry-run/apply/conditional gating |
| `remote-operations` | RO1–RO7 (7) | server | Template + Record Process + categories | IT11 | The Remote Operations primitive, headless full-stack |
| `ai-skills` | AS1–AS21 (21) | server | 4 skills + grants/junctions | IT12 | Skills gates, resolution, SKILL.md round-trip, activation governance — no LLM |
| `api-keys` | AK1–AK3 (3) | server | key fixtures | IT13 | API Keys engine `Config` + end-to-end `Authorize` allow/deny |
| `predictive-studio` | PS1–PS5 (5) | server | Pipeline → Model → Binding chain | IT14 | PS stack seams (entities, work-type registration, Actions) — no sidecar |
| `remote-op-wire-progress` | WIRE1 (1) | client | over-the-wire fixtures | IT15 | Remote Operation progress streamed over GraphQL |
| `prompt-runner` | PR1 (1) | server | lifecycle | IT16 (live-model) | Real prompt run + persisted `MJ: AI Prompt Runs` verification |
| `agent-runner` | AR1 (1) | server | lifecycle | IT17 (live-model) | Real agent run, deep-verified (steps → prompt runs → action logs → sub-agents) |
| `concurrent` | CC1–CC2 (2) | server | lifecycle | IT18 (live-model) | N concurrent prompt/agent runs persist independently |
| `remote-op-ai-authoring` | RO4-1→RO4-3 (3) | server | AI-generated Remote Operation | IT19 (live-model) | The AI-authored operation loop (save → approve → emit) |
| `lists` | LS1–LS3 (3) | server | List fixture | IT20 | Lists substrate + the ListSource keyset-pagination change |
| `open-app-teardown` | OAT1–OAT2 (2) | server | seeded Open-App metadata | IT21 | Open-App metadata teardown seam |
| `user-routines` | UR1–UR16 (16) | server | routine fixtures | IT22 | User Routines entity servers + dispatcher, end to end |
| `metadata-consistency` | 7 | server | — | IT24 | Read-only audit: entity metadata vs the physical DB catalog |
| `view-execution` | 9 | client | — | IT25 | Viewing-system deterministic tier, over the wire |
| `app-wiring` | AW1–AW10 (10) | client | — | IT26 | Every shipped app wired correctly (parameterized over all apps) |
| `entity-writes` | EW1–EW8 (8) | client | — | IT27 | Core data write-side contract over GraphQL |
| `permission-engine` | 14 | client | — | IT28 | Unified PermissionEngine + scope enforcement, live |
| `cache-gauntlet` | 8 | server | — | IT29 | The subset-slot × mutation cell that shipped two production cache bugs |
| `conversation-compaction` | CC1–CC12 (12) | server | — | IT30 | Compaction assembly layer (graduated from PR #2732) |
| `self-test` | cache-warm (1) | server | — | smoke script | Proves the instrumented cache observes RunView traffic (lives in the framework package) |

There are no script-only suites anymore — the former `lists` / `user-routines` /
`open-app-teardown` scripts graduated to bundles (IT20–IT22), and the multi-process /
sidecar-dependent scripts (`cross-server-invalidation-tests.ts`, `agent-memory-tests.ts`,
`runview-matrix-tests.ts`, the ten `ps-*` flows) live on as standalone **rigs** (§3.5).

> Some checks are **executable bug reproductions**: they encode the *correct* invariant and
> stay red until the product fix lands. Each documents its symptom, root cause, and proposed
> fix inline in the bundle source.

### 5.2 Key paths

| Path | What |
|---|---|
| [`packages/TestingFramework/testing-integration/`](../packages/TestingFramework/testing-integration/) | The **framework** (published): driver, registry, check contracts, bootstraps, tiers, instrumented cache |
| [`packages/TestingFramework/integration-test-suite/`](../packages/TestingFramework/integration-test-suite/) | The **content** (private, never published): all 30 check bundles, their unit tests, and the standalone rigs |
| [`metadata/test-types/.integration-test-type.json`](../metadata/test-types/.integration-test-type.json) | The `Integration Test` TestType — an inert type definition, kept in the normal `metadata/` tree |
| [`metadata-optional/integration-test/`](../metadata-optional/integration-test/) | The optional sibling root — the IT01–IT80 Tests (80 records), the suite hierarchy, the seeded RLS test users/role/permission, AND the synthetic AI stack the live tier drives (14 `IT: *` agents, 14 prompts, 42 model bindings, a skill, a search scope). Kept out of the default-pushed `metadata/` tree so these test-only records never reach production. **Must be seeded once per environment** |
| `mj.config.cjs` → `testing.checkModules` | The runtime seam that loads the private suite package (or a consumer's own check packages) into `mj test` |
| [`packages/TestingFramework/Engine/`](../packages/TestingFramework/Engine/) | `TestEngine`, `BaseTestDriver`, suite fixture lifecycle |
| [`packages/TestingFramework/CLI/`](../packages/TestingFramework/CLI/) | `mj test run` / `suite` / `list` / `validate` / `history` |
| [`.github/workflows/integration.yml`](../.github/workflows/integration.yml) | The CI gate |
| [`scripts/integration-golden-diff.mjs`](../scripts/integration-golden-diff.mjs) | Per-check outcome diff (`EMIT_OUTCOMES` format) |

### 5.3 Further reading

- **The coverage index:**
  [`packages/TestingFramework/testing-integration/CATALOG.md`](../packages/TestingFramework/testing-integration/CATALOG.md)
  — the living catalog: transport doctrine, current bundles, expansion roadmap.
- **Per-sub-suite deep docs:**
  [`packages/TestingFramework/integration-test-suite/docs/`](../packages/TestingFramework/integration-test-suite/docs/README.md)
  — mechanism + per-check inventory for every shipped bundle family (cache, data-access,
  security, writes/transactions, AI, platform), plus the candidate
  [test-catalog](../packages/TestingFramework/integration-test-suite/docs/test-catalog.md).
- **The restructure rationale:**
  [`plans/integration-test-expansion/framework-restructure-proposal.md`](../plans/integration-test-expansion/framework-restructure-proposal.md)
  (executed 2026-07-20) and the pointer README at
  [`packages/MJServer/integration-test-scripts/README.md`](../packages/MJServer/integration-test-scripts/README.md)
  for where the old scripts went.
- **Test metadata authoring:**
  [`metadata-optional/integration-test/tests/integration/README.md`](../metadata-optional/integration-test/tests/integration/README.md).
- **The Testing Framework generally:**
  [`packages/TestingFramework/README.md`](../packages/TestingFramework/README.md) — the
  `TestType` / `Test` / `TestSuite` / `TestRun` model shared by every test type (agent evals,
  computer use, integration).
