# @memberjunction/integration-test-suite

MemberJunction's **own integration-test content** — every check bundle, the special rigs, and
their heavy dependencies. This package is the *content* half of the July-2026 framework/content
split; the *framework* half (registry, check contracts, `TestRunner`, bootstraps,
`IntegrationTestDriver`, instrumented cache, tiers) is the published
[`@memberjunction/testing-integration`](../testing-integration/) package.

## Why this package is private

`"private": true` — this package is **never published**, by design. Before the split, the check
bundles lived inside `@memberjunction/testing-integration`, which is a runtime dependency of
`@memberjunction/server-bootstrap` (its generated manifest imports `IntegrationTestDriver` from
the barrel). That meant **MJ's entire test suite — and its heavy dependency tree**
(`ai-agents`, `record-set-processor`, `predictive-studio`, `open-app-engine`, …) **shipped to
every customer install**. The split makes the framework package small and legitimately
shippable, while MJ's own test content stays repo-local here.

Corollary: heavy dependencies belong HERE, never in `testing-integration`. If a new bundle
needs a package the framework doesn't already have, add it to *this* package.json.

## Layout

```
src/
  index.ts              barrel — side-effect-imports every bundle so importing the package
                        registers the full catalog on the shared IntegrationCheckRegistry
  checks/               the 30 check bundles (<bundle>.checks.ts) — the actual test logic
  __tests__/
    check-registry.test.ts   registry semantics + per-bundle count table (coverage-loss guard)
    sibling-parity.test.ts   bundle ↔ IT-record/suite-membership drift check + the
                             mj.config.cjs checkModules assertion (see below)
rigs/                   standalone tsx scripts that are deliberately NOT catalog entry paths
  lib/                  harness.ts + ai-bootstrap.ts (shared by the rigs only)
docs/                   the suite's documentation home — per-sub-suite deep docs (mechanism +
                        per-check inventory for every bundle family) + the candidate
                        test-catalog. Start at docs/README.md.
```

## How bundles load at runtime — the `checkModules` seam

The published `mj` CLI cannot depend on a private package, so it loads this one **at runtime**
via config. The repo root `mj.config.cjs` carries:

```javascript
testing: {
  checkModules: ['@memberjunction/integration-test-suite'],
},
```

At `mj test run` / `mj test suite` startup — **after** the instrumented-cache first-caller
install and **before** provider/engine setup — the CLI side-effect-imports each listed module,
which registers every bundle on the `IntegrationCheckRegistry`. Ad-hoc override:
`--checks-module <specifier>` on `mj test run` / `mj test suite`. External adopters point
`checkModules` at their **own** check packages — the framework stays generic.

`sibling-parity.test.ts` asserts the repo config actually lists this package, so the seam can't
silently rot.

## Running the suite

**Single entry path: `mj test`.** The old per-bundle `tsx` dispatchers and `run-all.ts` are
gone (see [`packages/MJServer/integration-test-scripts/README.md`](../../MJServer/integration-test-scripts/README.md)
for the pointer page).

```bash
# The whole deterministic tier (from repo root)
npm run test:integration          # = MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Deterministic"

# One bundle while iterating (by its IT record name)
MJ_INTEGRATION_TEST=1 npx mj test run --name "IT01 - Server RunView Cache Integrity"

# This package's own unit tests (registry counts + sibling parity — no DB)
npm run test
```

### ⚠️ Metadata is load-bearing

`mj test` discovers tests from `MJ: Tests` / `MJ: Test Suites` records. **Every environment
(fresh dev DB, CI) must seed them once** or `mj test` has nothing to dispatch:

```bash
npx mj sync push --dir=metadata-optional/integration-test
```

## Adding a new bundle

No dispatcher, no run-all registration — five steps:

1. Write `src/checks/<bundle>.checks.ts` — `NamedCheck[]` (throw-on-fail), registered on
   `IntegrationCheckRegistry.Instance`, plus a `BundleLifecycle` if the checks share fixtures.
2. Register it in [`src/index.ts`](src/index.ts) (`export * from './checks/<bundle>.checks';`).
3. Add the metadata Test record —
   `metadata-optional/integration-test/tests/integration/.IT##-<bundle>.json`
   (omit `primaryKey`/`sync`; mj-sync populates them).
4. Join it to the right suite in
   `metadata-optional/integration-test/test-suites/.integration-suite.json`.
5. Update the per-bundle count table in
   [`src/__tests__/check-registry.test.ts`](src/__tests__/check-registry.test.ts).

Then build, push the metadata, and run it via `mj test run`. `sibling-parity.test.ts` fails the
build if a bundle is missing its IT record / suite membership, or if a record points at a
non-existent bundle.

## Rigs are standalone

Everything under [`rigs/`](rigs/) runs as a plain `npx tsx` script — these need topologies or
gates the one-process catalog can't provide, and they are **not** dispatched by `mj test`:

| Rig | Needs |
|---|---|
| `cross-server-invalidation-tests.ts` | TWO MJAPI processes + shared Redis (`RUN_CROSS_SERVER=1`, `MJAPI_A_URL`/`MJAPI_B_URL`) |
| `cache-payload-materialization-tests.ts` | one process + real Redis (`REDIS_URL`) — captures a real cache publish off the wire and replays it as a foreign server; **mutates** (seeds/deletes agent notes) |
| `agent-memory-tests.ts` | live-model gate (`RUN_AGENT_TESTS=1`) |
| `runview-matrix-tests.ts` | running MJAPI + `MJ_API_KEY` — client-first RunView sweep across every entity |
| `ps-inproc-*.ts` / `ps-live-*.ts` | Predictive Studio flows (`PS_INTEGRATION=1`, Python sidecar) |

```bash
npx tsx packages/TestingFramework/integration-test-suite/rigs/runview-matrix-tests.ts
```

## Further reading

- [`docs/README.md`](docs/README.md) — **this suite's documentation home**: comprehensive per-sub-suite docs (cache, data-access, security, writes/transactions, AI, platform — mechanism, per-check inventory, tiers/transports, known pinned gaps) plus the [candidate test-catalog](docs/test-catalog.md)
- [`guides/INTEGRATION_TESTING_QUICKSTART.md`](../../../guides/INTEGRATION_TESTING_QUICKSTART.md) — the full quickstart
- [`packages/TestingFramework/testing-integration/CATALOG.md`](../testing-integration/CATALOG.md) — the living coverage index
- [`plans/integration-test-expansion/framework-restructure-proposal.md`](../../../plans/integration-test-expansion/framework-restructure-proposal.md) — the restructure rationale (executed 2026-07-20)
