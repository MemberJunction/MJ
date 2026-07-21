# Build-Engineering Runbook — Integration Test Suite

**Audience:** the engineer running the release/CI build. **Purpose:** where the headless integration suite fits in the build, how to run each tier, and how to read the results.

This suite is the tier **between** unit tests (mocked, per-package) and the browser/E2E regression suite. It runs real server componentry against a live database — real `SQLServerDataProvider`, real engines, real entity saves, and (client-transport bundles) the real GraphQL wire through a running MJAPI. No mocks. Because it touches the live DB and the generated types, **it doubles as a smoke test that the schema, generated entity classes, and engines all agree** — a stale migration or an un-run CodeGen surfaces here as a failure, by design.

## Where it goes in the build order

Run it **after** the schema is current and the app is built — never before:

1. Apply DB migrations (Flyway) to the target database.
2. Run CodeGen (`mj codegen`) so `@memberjunction/core-entities` generated types match the DB.
3. `npm run build` (the suite imports built `dist/`; the private `@memberjunction/integration-test-suite` package must build).
4. **Seed the test metadata** (once per fresh DB): `npx mj sync push --dir=metadata-optional/integration-test`.
5. Start MJAPI on the configured GraphQL port (required for the client-transport bundles).
6. Run the tiers below.

If you run it before migrations/CodeGen, the `codegen-determinism` checks will (correctly) fail with a "generated file has N entities, DB has N-1" mismatch — that is the smoke test doing its job, not a suite bug.

## The tiers and how to run them

Single entry path: **`mj test`** (dispatched from `MJ: Tests` / `MJ: Test Suites` rows; bundles load via the `testing.checkModules` seam in `mj.config.cjs`). There are no per-bundle scripts.

| Tier | Command | Gate? | Cost |
|---|---|---|---|
| **Deterministic** (default) | `npm run test:integration` | **Yes — required to pass** | \$0, no LLM |
| **+ Mutation axis** | `RUN_MUTATION_TESTS=1 npm run test:integration` | Recommended | \$0, self-cleaning writes |
| **Live-model** | `RUN_AGENT_TESTS=1 MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Live Model"` | Nightly / on-demand | Real tokens, < \$1/run |
| **Predictive Studio** | `PS_INTEGRATION=1 …` | On-demand | Varies |

`npm run test:integration` expands to `MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Deterministic"`.

**Environment flags:** `MJ_INTEGRATION_TEST=1` is **required** on every run (it marks the dedicated process whose instrumented cache must be the first `LocalCacheManager` caller). `RUN_MUTATION_TESTS=1`, `RUN_AGENT_TESTS=1`, `PS_INTEGRATION=1` each opt a tier in.

### CI recommendation
- **PR gate:** the deterministic tier (with mutation axis) must pass. It is credential-light, self-cleaning, and $0 — safe to run on every PR against a migrated ephemeral DB.
- **Nightly:** add the live-model tier (needs provider API keys in the environment; skips cleanly with a loud message if keys are absent).
- Provider keys are read from the environment / `mj.config.cjs`; the live tier degrades to a documented skip (never a false pass) when they're missing, so a keyless CI leg is safe.

## Reading the results

- Console prints `[SUMMARY] N/M passed (X%)` and per-bundle lines; a failure shows `✗ FAILED` with the failing check's oracle message (e.g. `Oracle 'codegen-determinism.CD6' failed: …`).
- **Results are persisted** (queryable via `RunView`/`RunQuery`, or a dashboard):
  - `MJ: Test Runs` — one row per bundle: `DurationSeconds`, `PassedChecks` / `FailedChecks` / `TotalChecks`, `Score`, `CostUSD`, `MachineName`, `RunByUserName`, Started/Completed.
  - `MJ: Test Suite Runs` — one row per suite run: `TotalDurationSeconds`, `TotalTests` / `PassedTests`, `TotalCostUSD`. (Reference: a full deterministic tier is ~50 bundles, ~4–5 minutes wall-clock, \$0.)
- Use these to trend duration over builds and catch a bundle that's slowing down.

## Triaging a failure (do this before touching anything)

A red check is one of three things — classify it, don't reflexively "fix the test":

1. **Real product defect** the check caught → file it / fix the product; leave the check red until fixed. (This suite has surfaced real bugs — dead HTML-body fallbacks, un-enforced validation filters, permission-parity cache leaks, dead driver classes.)
2. **Environment gap** → stale migration (`codegen-determinism` mismatch), MJAPI down (client-transport bundles error), or un-seeded metadata (`mj sync push` not run). Fix the environment and re-run.
3. **Check bug / flake** → fix the check, then re-run that single bundle to confirm.

Re-run one bundle with `MJ_INTEGRATION_TEST=1 npx mj test run "IT## - <name>"` before re-running the whole tier.

## Notes for maintainers

- Every check bundle has a metadata sibling — an `MJ: Tests` (IT) record joined to a suite. A `sibling-parity.test.ts` in the suite package fails the build if a bundle lacks its record or a record points at a missing bundle, so the catalog can't silently drift.
- Fixtures self-clean their own rows, tagged `(mj-integration-test — safe to delete)`. If a run is killed mid-flight, those tagged rows are safe to sweep manually.
- Full authoring/running detail: [Integration Testing Quickstart](../../../guides/INTEGRATION_TESTING_QUICKSTART.md) and the suite [README](../README.md).
