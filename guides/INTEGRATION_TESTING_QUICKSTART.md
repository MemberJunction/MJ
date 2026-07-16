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
| **Integration tests** | DB, providers, cache managers, engines, GraphQL transport | *Only the top layer* — the test process stands in for MJAPI/MJExplorer | `tsx` scripts + the Testing Framework | ~10–60s/suite |
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

### 2.1 One library of checks, two execution front-ends

All check logic lives **once**, in
[`@memberjunction/testing-integration`](../packages/TestingFramework/testing-integration/)
(`packages/TestingFramework/testing-integration/`). Two front-ends execute the same registered
checks, so coverage can never drift between them:

```
                 ┌──────────────────────────────────────────────────────────┐
                 │            @memberjunction/testing-integration           │
                 │                                                          │
                 │  IntegrationCheckRegistry (BaseSingleton)                │
                 │    · 21 check bundles · ~130 NamedChecks                 │
                 │    · BundleLifecycles (shared fixtures, setup/teardown)  │
                 │  bootstrap  (server / client / PostgreSQL)               │
                 │  InstrumentedLocalStorageProvider + UniqueFilter         │
                 │  tiers  (IsTierEnabled — the ONE gate predicate)         │
                 │  TestRunner + Assert helpers · ai-verify                 │
                 │  IntegrationTestDriver  (@RegisterClass)                 │
                 └─────────────▲─────────────────────────▲──────────────────┘
                               │                         │
        ┌──────────────────────┴───────┐   ┌─────────────┴──────────────────────┐
        │  Metadata-driven front-end   │   │  Script front-end                  │
        │  TestEngine → TestType row → │   │  npx tsx <suite>-tests.ts          │
        │  IntegrationTestDriver       │   │  (one dedicated process per suite) │
        │  mj test run / mj test suite │   │  run-all.ts aggregator             │
        │  results → MJ: Test Runs     │   │  (npm run test:integration)        │
        └──────────────────────────────┘   └────────────────────────────────────┘
```

- **The script front-end** (`packages/MJServer/integration-test-scripts/`) runs each suite as
  its own `tsx` process. Each script bootstraps the provider stack, pulls its bundle from the
  registry, runs the checks sequentially, and exits `0/1/2`. `run-all.ts` orchestrates all of
  them and is the CI gate.
- **The metadata-driven front-end** runs the same bundles through the Testing Framework: a
  `MJ: Test Types` row named **`Integration Test`** points at `DriverClass:
  "IntegrationTestDriver"`; `MJ: Tests` rows select bundles via their `Configuration` JSON;
  suites group tests; results persist as `MJ: Test Runs` rows browsable in the Explorer
  Testing dashboard.

Both front-ends call the same `IntegrationCheckRegistry.GetBundle(...)`, the same
`BundleLifecycle` setup/teardown, and the same `IsTierEnabled(...)` gate — one source of truth.

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
the next asserts a hit on), so both front-ends run a bundle's checks strictly in array order.

Every check receives one shared **`IntegrationCheckContext`**:

| Field | What it is |
|---|---|
| `User` | Resolved context user (`MJ_TEST_USER_EMAIL` override → Owner-type → first user) |
| `Provider` | The run-scoped real provider — `SQLServerDataProvider` (server) or `GraphQLDataProvider` (client) |
| `Storage` | The `InstrumentedLocalStorageProvider` — per-category cache counters (§2.4) |
| `Pool` | Raw `mssql` pool for fixture SQL (server transport only) |
| `Schema` | Core schema (e.g. `__mj`) |
| `Config` | The opaque per-bundle `config` bag from the selector (e.g. `datasetName`, `entityName`) |
| `Fixtures` / `RlsFixture` / `AiSkillsFixture` / … | Typed slots populated by the bundle's lifecycle or the front-end |

**Mutating bundles register a `BundleLifecycle`** — `Setup` creates the bundle's shared fixture
(throwaway rows, prefixed names) and assigns it onto the context; `Teardown` deletes everything
in FK-safe order. Both front-ends wrap the bundle's checks in `Setup → run → Teardown
(finally)`, and teardown is best-effort (it never throws, so a failing check still cleans up).

The registry itself
([`check-registry.ts`](../packages/TestingFramework/testing-integration/src/check-registry.ts))
is a `BaseSingleton` with `Register`, `Get(id)`, `GetBundle(prefix)`, `RegisterLifecycle`, and
`GetLifecycle`. Bundle modules **self-register on import** — the package's
[`index.ts`](../packages/TestingFramework/testing-integration/src/index.ts) exports every
`checks/*.checks.ts`, so importing the package (or calling `LoadTestingIntegration()`) loads
the full catalog and fires the driver's `@RegisterClass` decorator.

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
| `bootstrapIntegrationServer(opts?)` | Owns the process: instrumented cache first, then the real database provider (SQL Server by default; PostgreSQL when `DB_PLATFORM=postgresql`), user-cache refresh, context-user resolution. Used by the scripts, the smoke test, and as the driver's self-bootstrap fallback. |
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
| `live-model` | Real LLM calls — costs tokens, needs model credentials | `RUN_AGENT_TESTS=1` |

`IsTierEnabled(tier)` is the **single predicate** both front-ends call, so a gate is honored
identically everywhere. Gating exists at two granularities:

- **Whole-test**: a metadata Test's `Configuration.tier` (or an explicit `requiresEnv` env-var
  override). When gated off, the driver **skips-as-Passed** with one `gate` oracle whose
  message reads `Skipped: <VAR> not set (tier '<tier>')`.
- **Per-check**: `RequiresMutation` / `RequiresLiveModel` flags on individual `NamedCheck`s
  inside an otherwise-deterministic bundle (e.g. the save/delete invalidation checks in the
  server-cache bundle). A bundle selector can also opt mutation checks in declaratively via
  `config.runMutationTests: true`, independent of env.

Adjacent gates outside the tier enum: the Predictive Studio *flow* scripts run only under
`PS_INTEGRATION=1` (they also need the Python sidecar), and client-transport suites self-skip
when no MJAPI is reachable or `MJ_API_KEY` is unset.

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
      │                                  metadata/test-types/.integration-test-type.json
      ▼
MJ: Tests ───────▶ IT01…IT19            Configuration selects bundles + tier + transport
      │                                  metadata/tests/integration/.IT*.json
      ▼
MJ: Test Suites ─▶ "Integration Tests"  (parent)
                   ├─ "Integration Tests — Deterministic"   IT01–IT15  (the blocking tier)
                   └─ "Integration Tests — Live Model"      IT16–IT19  (opt-in)
                                         metadata/test-suites/.integration-suite.json
      ▼
MJ: Test Runs ───▶ one row per execution; ResultDetails = the per-check OracleResult[]
```

**How execution works:** `TestEngine` resolves the driver from the TestType's `DriverClass` via
the ClassFactory (`CreateInstance(BaseTestDriver, 'IntegrationTestDriver')`), then calls
`Execute()`. The
[`IntegrationTestDriver`](../packages/TestingFramework/testing-integration/src/IntegrationTestDriver.ts):

1. parses the Test's `Configuration` (below);
2. applies the whole-test tier gate (skip-as-Passed when gated);
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
excluded from suite runs (the two client-transport tests, IT03 and IT15, ship as `Skip` in the
deterministic suite because the CI gate has no MJAPI; run them individually with MJAPI up).
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
  skip-as-pass with a note.
- **Seeded, purpose-built users** — these live in the **sibling `metadata-integration-fixtures/`
  root, NOT the default-pushed `metadata/` tree**, so the synthetic `IsActive` accounts never land
  in a production DB that only syncs `metadata/`:
  [`metadata-integration-fixtures/users/.integration-test-users.json`](../metadata-integration-fixtures/users/.integration-test-users.json),
  [`metadata-integration-fixtures/roles/.integration-test-roles.json`](../metadata-integration-fixtures/roles/.integration-test-roles.json),
  [`metadata-integration-fixtures/entity-permissions/.integration-test-permissions.json`](../metadata-integration-fixtures/entity-permissions/.integration-test-permissions.json).
  `it-rls-a@integration.test` / `it-rls-b@integration.test` each hold ONLY the
  **`Integration Test: RLS Scoped Reader`** role (read on `MJ: AI Agent Runs`, scoped to the
  caller's own UserID via the `UI: Own AI Agent Runs` RLS filter) — genuinely non-exempt users
  for the deterministic multi-user isolation checks. `it-nogrant@integration.test` has no roles
  at all — the negative check that a user with no grant is served no rows (cached or not).
  When the seed isn't pushed, those checks skip-as-pass.

---

## 3. Running the tier

Everything runs **from the repo root** (`.env` / `mj.config.cjs` resolution is cwd-relative).
Exit codes are uniform across every entry point: **`0` passed (or cleanly skipped) · `1`
failures · `2` bootstrap/connectivity error**.

### 3.1 Everything at once — the aggregator

```bash
npm run test:integration                      # deterministic tier (gated tiers report SKIP)
RUN_MUTATION_TESTS=1 npm run test:integration # + mutation-gated checks inside the suites
RUN_AGENT_TESTS=1  npm run test:integration   # + the live-model tier (real LLM calls)
PS_INTEGRATION=1   npm run test:integration   # + the Predictive Studio flows (needs the sidecar)
npx tsx packages/MJServer/integration-test-scripts/run-all.ts --verbose   # stream all output
```

[`run-all.ts`](../packages/MJServer/integration-test-scripts/run-all.ts) spawns each suite as
its own `tsx` process (dedicated-process rule), groups them by tier, and prints a grouped
results table with one aggregate exit code:

| Group | Gate | Suites |
|---|---|---|
| **Deterministic** | always runs | server-cache, runquery-cache, dataset-cache, aggregates-cache, record-process, record-process-facade, lists, rls-isolation, api-keys, scheduled-jobs, field-rules-bulk-update, open-app-teardown, remote-operations, ai-skills, user-routines, predictive-studio (16) |
| **Deterministic · client** | spawns; self-skips without a reachable MJAPI / `MJ_API_KEY` | remote-op-wire-progress |
| **Predictive Studio flows** | `PS_INTEGRATION=1` (else SKIP without spawning) | 10 `ps-inproc-*` / `ps-live-*` scripts |
| **Live Model** | `RUN_AGENT_TESTS=1` (else SKIP without spawning) | prompt-runner, agent-runner, concurrent, remote-op-ai-authoring |

Suite output is hidden unless the suite fails (or `--verbose` / `INTEGRATION_VERBOSE=1`). A
suite that exits `0` without printing a `X/Y passed` summary is reported **SKIP**, not PASS —
that's the self-skip protocol (§4.4).

### 3.2 One suite at a time — the scripts

Every suite in [`packages/MJServer/integration-test-scripts/`](../packages/MJServer/integration-test-scripts/)
is independently runnable:

```bash
# Server-transport (database only)
npx tsx packages/MJServer/integration-test-scripts/server-cache-tests.ts
npx tsx packages/MJServer/integration-test-scripts/rls-isolation-tests.ts
npx tsx packages/MJServer/integration-test-scripts/ai-skills-tests.ts
# … and the rest of the deterministic list in §3.1

# Include the mutation-gated checks (e.g. S17/S23/S24 save/delete invalidation)
RUN_MUTATION_TESTS=1 npx tsx packages/MJServer/integration-test-scripts/server-cache-tests.ts

# Client transport — start MJAPI first: (cd packages/MJAPI && npm run start)
npx tsx packages/MJServer/integration-test-scripts/client-cache-tests.ts

# Live model (real LLM calls — costs tokens)
RUN_AGENT_TESTS=1 npx tsx packages/MJServer/integration-test-scripts/agent-runner-tests.ts
```

Each script is a thin dispatcher: it bootstraps its transport, pulls its bundle from the
registry (`IntegrationCheckRegistry.Instance.GetBundle('<bundle>')`), and runs the checks on
the minimal sequential `TestRunner`. A handful of suites are fully self-contained scripts
rather than registry bundles — `lists-tests.ts`, `user-routines-tests.ts`,
`open-app-teardown-tests.ts`, the `ps-*` flow scripts, and the cross-server rig (§3.5).

### 3.3 The metadata-driven path — `mj test`

The same bundles, executed through the Testing Framework with results persisted to
`MJ: Test Runs`.

**One-time setup — push the metadata** (test type, tests, suites, and the RLS fixture
users/roles/permissions):

```bash
npx mj sync push --dir=metadata --include=test-types,tests,test-suites
npx mj sync push --dir=metadata-integration-fixtures                       # RLS fixtures (sibling root)
```

**Run** — two things are load-bearing:

- **`MJ_INTEGRATION_TEST=1`** makes the CLI install the instrumented cache *first-caller*
  before its own provider setup (otherwise counters silently see nothing) and forces the suite
  serial.
- **Use the workspace-local `mj`** (`./node_modules/.bin/mj`). A globally-installed `mj` does
  not carry `@memberjunction/testing-integration`, so the driver's `@RegisterClass` never fires
  and the run fails with `driver.Execute is not a function`.

```bash
# One test
MJ_INTEGRATION_TEST=1 ./node_modules/.bin/mj test run --name "IT01 - Server RunView Cache Integrity"

# A whole suite (runs serially under MJ_INTEGRATION_TEST=1 regardless of --parallel)
MJ_INTEGRATION_TEST=1 ./node_modules/.bin/mj test suite --name "Integration Tests — Deterministic"

# The live-model suite (also needs the tier gate)
RUN_AGENT_TESTS=1 MJ_INTEGRATION_TEST=1 ./node_modules/.bin/mj test suite --name "Integration Tests — Live Model"

# Validate definitions without executing (driver resolvable, Configuration parses)
./node_modules/.bin/mj test validate --type "Integration Test"
./node_modules/.bin/mj test run --name "IT01 - Server RunView Cache Integrity" --dry-run
```

Useful extras: `mj test list`, `mj test history`, `mj test suite --flaky-check 3` (runs each
test N times and reports variance).

### 3.4 Browsing results — the Explorer Testing dashboard

Integration `TestRun` rows appear in the Testing dashboard like any other test type, with the
per-check breakdown parsed from `ResultDetails` (each check's `<bundle>.<id>`, pass/fail, and
message) on the Test Run form. Execution from inside a live MJAPI is deliberately refused for
server-transport tests (§2.3) — the run records an `Error` result whose message points you at
the CLI invocation. Treat the dashboard as the observability surface; the CLI and scripts are
the execution surface.

### 3.5 Special rigs

**Bootstrap smoke test** — proves the first-caller invariant end to end (a cold RunView must
show an instrumented `RunViewCache` write):

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
npx tsx packages/MJServer/integration-test-scripts/cross-server-invalidation-tests.ts
```

(Not part of the aggregate run — it needs the two-server topology provisioned.)

**Front-end equivalence (golden diff)** — both front-ends can emit identical per-check outcome
files via `EMIT_OUTCOMES=<path>` (`{name, passed, durationMs, error?}[]`);
[`scripts/integration-golden-diff.mjs`](../scripts/integration-golden-diff.mjs) diffs two such
files by check id and fails on missing/extra/pass-mismatch (timing differences only warn):

```bash
EMIT_OUTCOMES=/tmp/golden/script.json npx tsx packages/MJServer/integration-test-scripts/server-cache-tests.ts
EMIT_OUTCOMES=/tmp/golden/driver.json MJ_INTEGRATION_TEST=1 ./node_modules/.bin/mj test run --name "IT01 - Server RunView Cache Integrity"
node scripts/integration-golden-diff.mjs /tmp/golden/script.json /tmp/golden/driver.json server-cache
```

**The package's own unit tests** (registry semantics, config parsing, tier gating, driver
mapping — mocked, no DB):

```bash
cd packages/TestingFramework/testing-integration && npm run test
```

### 3.6 Environment reference

| Variable | Consumed by | Meaning |
|---|---|---|
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` / `DB_DATABASE` | server bootstrap | SQL connection (`mj.config.cjs` `databaseSettings` takes precedence) |
| `DB_PLATFORM` | server bootstrap | `sqlserver` (default) or `postgresql` |
| `MJ_TEST_USER_EMAIL` | server bootstrap | Context-user override (default: Owner-type user, else first user) |
| `RUN_MUTATION_TESTS=1` | tier gate | Enables the mutation tier / `RequiresMutation` checks |
| `RUN_AGENT_TESTS=1` | tier gate | Enables the live-model tier / `RequiresLiveModel` checks |
| `PS_INTEGRATION=1` | run-all + `ps-*` scripts | Enables the Predictive Studio flow scripts |
| `MJ_API_KEY` | client bootstrap | System API key MJAPI accepts via `x-mj-api-key` |
| `GRAPHQL_PORT` / `GRAPHQL_ROOT_PATH` / `MJAPI_URL` | client bootstrap | Endpoint resolution; `MJAPI_URL` overrides the composed localhost URL |
| `MJ_INTEGRATION_TEST=1` | testing CLI | Install instrumented cache first-caller + force serial suite execution |
| `EMIT_OUTCOMES=<path>` | both front-ends | Write the per-check outcomes JSON for the golden diff |
| `INTEGRATION_VERBOSE=1` (or `--verbose`) | run-all | Stream every suite's output live |
| `MJ_TEST_DATASET` | dataset-cache script | Dataset name override (default `MJ_Metadata`) |
| `MJ_CORE_SCHEMA` | client transport | Core schema override (default `__mj`) |
| `MJAPI_A_URL` / `MJAPI_B_URL` | cross-server rig | The two MJAPI endpoints |

### 3.7 CI

[`.github/workflows/integration.yml`](../.github/workflows/integration.yml) is the tier's CI
home — a **blocking PR gate** into `next` (path-filtered to `packages/**`, the integration
metadata dirs, and the workflow itself; also `workflow_dispatch`). The job:

1. starts SQL Server 2022 in Docker on the runner and creates an empty `test` database;
2. `npm ci`, then builds only the needed graph
   (`npx turbo build --filter=@memberjunction/cli --filter=@memberjunction/testing-integration --filter=@memberjunction/open-app-engine`);
3. `mj migrate` (applies committed migrations — no live CodeGen), then
   `mj sync push --dir=metadata --ci` (seeds the full metadata, including the test
   type/tests/suites and RLS fixture users);
4. `npm run test:integration` — pass/fail rides the aggregator's `0/1/2` contract.

`PS_INTEGRATION` and `RUN_AGENT_TESTS` are deliberately unset in CI (no token cost, no
flakiness) and no MJAPI is up, so **the deterministic tier is the gate** and client suites
self-skip.

---

## 4. Writing new tests — pick your method

| You want to… | Method |
|---|---|
| Add an invariant to an area that already has a bundle | **1 — add a check to the bundle** |
| Cover a new area (new engine, new subsystem) | **2 — create a new bundle** (+ Test row) |
| Re-target or recombine existing checks (different dataset/entity, new grouping, new gate) | **3 — metadata only** |
| Exercise infrastructure that can't share one process (multi-server), or prototype freely | **4 — standalone script** |

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
- **A new bundle needs BOTH siblings — a `tsx` dispatcher AND an IT `Test` record.** The bundle
  is the single source of truth; the dispatcher (`<bundle>-tests.ts`) and the metadata record
  (`.IT##-<bundle>.json` joined to the deterministic suite) are thin pointers to it. Generate both
  when you add a bundle — the `sibling-parity.test.ts` drift-check fails the build if either is
  missing (or points at a non-existent bundle). A deliberately dispatcher-less bundle
  (driver/MJAPI-only) must be listed with a reason in that test's `NO_TSX_DISPATCHER` set and still
  have an IT record.

### Method 1 — add a check to an existing bundle

Find the bundle in
[`packages/TestingFramework/testing-integration/src/checks/`](../packages/TestingFramework/testing-integration/src/checks/)
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

That's the whole change — the check now runs in **both** front-ends (the suite's `tsx` script
and the corresponding ITxx Test) because both expand the bundle at runtime. Mind the ordering:
add stateful checks after the state they depend on, and keep them self-contained (reset your
own counters, restore anything you flip). Then verify:

```bash
cd packages/TestingFramework/testing-integration && npm run build
npx tsx packages/MJServer/integration-test-scripts/dataset-cache-tests.ts
MJ_INTEGRATION_TEST=1 ./node_modules/.bin/mj test run --name "IT07 - Dataset Cache (DatasetCache category)"
```

### Method 2 — create a new bundle (new coverage area)

**1. Write the bundle** — `src/checks/<area>.checks.ts`:

```typescript
import { Assert } from '../test-runner';
import { IntegrationCheckRegistry } from '../check-registry';
import { NamedCheck, IntegrationCheckContext } from '../check';

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

If the checks share created fixtures, register a lifecycle in the same file — both front-ends
run it identically (setup before the checks, teardown in `finally`):

```typescript
IntegrationCheckRegistry.Instance.RegisterLifecycle('my-area', {
    Setup: async (ctx) => { /* create throwaway rows; assign ctx.<MyAreaFixture> */ },
    Teardown: async (ctx) => { /* delete them FK-safe; never throw */ }
});
```

(For a typed fixture slot, add an optional property to `IntegrationCheckContext` in
[`check.ts`](../packages/TestingFramework/testing-integration/src/check.ts) alongside the
existing ones. Ad-hoc knobs can ride the untyped `ctx.Config` bag instead.)

**2. Export the module** from
[`src/index.ts`](../packages/TestingFramework/testing-integration/src/index.ts) (this is what
registers it on import):

```typescript
export * from './checks/my-area.checks';
```

**3. Build:** `cd packages/TestingFramework/testing-integration && npm run build`.

**4. Add the Test row** — `metadata/tests/integration/.IT20-my-area.json` (omit
`primaryKey`/`sync`; the sync tool populates them):

```json
{
  "fields": {
    "TypeID": "@lookup:MJ: Test Types.Name=Integration Test",
    "Name": "IT20 - My Area",
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
[`metadata/test-suites/.integration-suite.json`](../metadata/test-suites/.integration-suite.json),
append to the right child suite's `MJ: Test Suite Tests`:

```json
{ "fields": { "SuiteID": "@parent:ID", "TestID": "@lookup:MJ: Tests.Name=IT20 - My Area", "Sequence": 16, "Status": "Active" } }
```

**6. Push and run both front-ends:**

```bash
npx mj sync push --dir=metadata --include=tests,test-suites
MJ_INTEGRATION_TEST=1 ./node_modules/.bin/mj test run --name "IT20 - My Area"
```

**7. (Optional but conventional) Add a standalone dispatcher script** so the suite is also
independently runnable and part of the aggregate: copy the ~50-line shape of
[`dataset-cache-tests.ts`](../packages/MJServer/integration-test-scripts/dataset-cache-tests.ts)
(bootstrap → `GetBundle('my-area')` → `TestRunner` → exit code), then add the filename to the
right tier group in [`run-all.ts`](../packages/MJServer/integration-test-scripts/run-all.ts)'s
`GROUPS`. Update the folder README's suite table.

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

Push with `npx mj sync push --dir=metadata --include=tests,test-suites` and run via `mj test`.

### Method 4 — standalone script

For coverage that can't live inside the one-process model — multi-process topologies
(cross-server invalidation), sidecar-dependent end-to-end flows (`ps-*`), or exploratory work
that isn't ready to be a bundle — write a self-contained script in
[`packages/MJServer/integration-test-scripts/`](../packages/MJServer/integration-test-scripts/).
Use the package's bootstrap + runner so the process discipline stays right:

```typescript
import { TestRunner, Assert, bootstrapIntegrationServer } from './lib/harness';

async function main(): Promise<void> {
    // Self-skip protocol: exit 0 WITHOUT printing an "X/Y passed" line when prerequisites
    // are absent (run-all classifies that as SKIP, and CI stays green on serverless boxes).
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

Honor the exit-code contract (`0/1/2`), keep it self-cleaning, and register it in `run-all.ts`
`GROUPS` under the right tier if it belongs in the aggregate. When a standalone script's
coverage stabilizes, prefer folding it into a bundle (Method 2) so the metadata path runs it
too.

---

## 5. Reference

### 5.1 Bundle inventory

| Bundle | Checks | Transport | Lifecycle fixture | Selected by | Notes |
|---|---|---|---|---|---|
| `server-cache` | S1–S31 (31; 26 default — S17/S23/S24/S29/S30 mutation-gated) | server | — | IT01 | RunView server cache: shape parity, fingerprint identity, dedup/linger, BypassCache, invalidation |
| `runquery-cache` | Q1–Q10 (10) | server | Query Category + TTL/validated Queries | IT02 | RunQuery caching (TTL + smart validation); the bundle mutates by design |
| `client-cache` | C1–C13 (13; C10 mutation-gated) | client | — | IT03 | `CacheLocal` opt-in caching + smart cache-check over GraphQL |
| `record-process` | RP1–RP8 (8) | server | — | IT04 | RecordSetProcessor substrate: persistence, isolation, circuit breaker, concurrency |
| `record-process-facade` | RPF1–RPF2 (2) | server | Record Process definition | IT05 | RecordProcessExecutor facade (`Run`/`RunByID`) |
| `rls-isolation` | RLS1–RLS6, RLS8–RLS10 (9) | server | discovered + seeded users | IT06 | RLS token substitution, predicate divergence, fingerprint no-leak, live scoping, no-grant negative |
| `rls-isolation-client` | RLS7 (1) | client | — | *(compose via metadata)* | The client-transport RLS leg |
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
| `self-test` | cache-warm (1) | server | — | smoke script | Proves the instrumented cache observes RunView traffic |

Script-only suites (no bundle): `lists-tests.ts`, `user-routines-tests.ts`,
`open-app-teardown-tests.ts`, `cross-server-invalidation-tests.ts`, and the ten `ps-*` flow
scripts.

> Some checks are **executable bug reproductions**: they encode the *correct* invariant and
> stay red until the product fix lands. Each documents its symptom, root cause, and proposed
> fix inline in the bundle source.

### 5.2 Key paths

| Path | What |
|---|---|
| [`packages/TestingFramework/testing-integration/`](../packages/TestingFramework/testing-integration/) | The library: driver, registry, bundles, bootstrap, tiers, instrumented cache |
| [`packages/MJServer/integration-test-scripts/`](../packages/MJServer/integration-test-scripts/) | Runnable suites + `run-all.ts` aggregator (+ [README](../packages/MJServer/integration-test-scripts/README.md) deep dive) |
| [`metadata/test-types/`](../metadata/test-types/) · [`metadata/tests/integration/`](../metadata/tests/integration/) · [`metadata/test-suites/`](../metadata/test-suites/) | The Integration Test type, the IT01–IT19 Tests, the suite hierarchy |
| [`metadata-integration-fixtures/`](../metadata-integration-fixtures/) | Seeded RLS test users/role/permission — a **sibling root**, kept out of the default-pushed `metadata/` tree so the synthetic accounts never reach production |
| [`packages/TestingFramework/Engine/`](../packages/TestingFramework/Engine/) | `TestEngine`, `BaseTestDriver`, suite fixture lifecycle |
| [`packages/TestingFramework/CLI/`](../packages/TestingFramework/CLI/) | `mj test run` / `suite` / `list` / `validate` / `history` |
| [`.github/workflows/integration.yml`](../.github/workflows/integration.yml) | The CI gate |
| [`scripts/integration-golden-diff.mjs`](../scripts/integration-golden-diff.mjs) | Front-end equivalence diff |

### 5.3 Further reading

- **Suite deep dive:**
  [`packages/MJServer/integration-test-scripts/README.md`](../packages/MJServer/integration-test-scripts/README.md)
  — the design under test per suite, the full check inventories, and the hard-won gotchas
  (linger windows, params mutation, counter categories).
- **Test metadata authoring:**
  [`metadata/tests/integration/README.md`](../metadata/tests/integration/README.md).
- **The Testing Framework generally:**
  [`packages/TestingFramework/README.md`](../packages/TestingFramework/README.md) — the
  `TestType` / `Test` / `TestSuite` / `TestRun` model shared by every test type (agent evals,
  computer use, integration).
