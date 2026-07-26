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
| **Live-model** | `MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Live Model"` | Nightly / on-demand | Real tokens, < \$1/run |
| **Predictive Studio** | `PS_INTEGRATION=1 …` | On-demand | Varies |

`npm run test:integration` expands to `MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Deterministic"`.

**Environment flags:** `MJ_INTEGRATION_TEST=1` is **required** on every run (it marks the dedicated process whose instrumented cache must be the first `LocalCacheManager` caller). `RUN_MUTATION_TESTS=1` and `PS_INTEGRATION=1` each opt a tier in — strict `=== '1'`, so `true` does not work.

`RUN_AGENT_TESTS` is **not** an opt-in any more: `IsTierEnabled('live-model')` returns `RUN_AGENT_TESTS !== '0'` (`packages/TestingFramework/testing-integration/src/tiers.ts`), so the live-model tier is **default-ON**, `=1` is a back-compat no-op, and only an explicit `RUN_AGENT_TESTS=0` disables it. What actually keeps live-model checks out of a normal run is **suite selection** — they are members of `"Integration Tests — Live Model"`, and `mj test suite` does not recurse into sibling or child suites. Setting `RUN_AGENT_TESTS=0` while running the live suite yields a green 15/15 that executed nothing.

### CI recommendation
- **PR gate:** the deterministic tier (with mutation axis) must pass. It is credential-light, self-cleaning, and $0 — safe to run on every PR against a migrated ephemeral DB.
- **Nightly:** add the live-model tier. It needs working provider API keys in the environment — see the warning below.
- Provider keys are read from the environment / `mj.config.cjs`. **A keyless leg is NOT safe: the live tier FAILS, it does not skip.** There is no credential preflight in the live bundles, so an absent key surfaces as an ordinary red test — verified by blanking `AI_VENDOR_API_KEY__*` and re-running a previously-green bundle, which failed at fixture setup (`agent-rag-search fixture setup failed: sentinel note save: undefined`) and exited 1, with no skip message anywhere. Gate a keyless CI leg by **not selecting the live suite**, not by relying on a graceful degrade.

### PostgreSQL — run the suite as a platform matrix (REQUESTED)

The suite is authored to be **platform-portable** (checks use `UUIDsEqual` for casing, avoid T-SQL-isms, reference views by unqualified `schema.view`), so the intent is to run **the same deterministic tier against a PostgreSQL backend** in addition to SQL Server — a two-cell platform matrix. Point `mj.config.cjs` / the `PG_*` env vars at a migrated PostgreSQL database (see the root CLAUDE.md "CodeGen Database Connections" and "Switching Database Platforms" sections) and run the same `npm run test:integration`.

Two things to expect, both normal:
1. **A few checks may surface accidental SQL-Server-isms** on the first PG run (a check that assumed a T-SQL behavior). Report these — they're portability fixes for the suite, not product bugs.
2. **PG-divergence coverage (catalog Domain 8) is authored separately** by the dev team — the things that genuinely differ on PG (lowercase UUIDs, schema-name casing folding / `CanonicalSchemaName`, PG-specific SQL). Running the SS-authored suite on PG is the build-engineer's matrix; authoring the divergence checks is dev work.

Treat a clean PG run of the deterministic tier as the goal; escalate SS-isms to the dev team rather than editing checks in the build.

## Reading the results

- Console prints `[SUMMARY] N/M passed (X%)` and per-bundle lines; a failure shows `✗ FAILED` with the failing check's oracle message (e.g. `Oracle 'codegen-determinism.CD6' failed: …`).
- **Results are persisted** (queryable via `RunView`/`RunQuery`, or a dashboard):
  - `MJ: Test Runs` — one row per bundle: `DurationSeconds`, `PassedChecks` / `FailedChecks` / `TotalChecks`, `Score`, `CostUSD`, `MachineName`, `RunByUserName`, Started/Completed.
  - `MJ: Test Suite Runs` — one row per suite run: `TotalDurationSeconds`, `TotalTests` / `PassedTests`, `TotalCostUSD`. (Reference: the deterministic tier is **52** bundles, roughly 2–5 minutes wall-clock, \$0 — a fully-seeded local run with MJAPI up measured 127s.)
- Use these to trend duration over builds and catch a bundle that's slowing down.

## Triaging a failure (do this before touching anything)

A red check is one of three things — classify it, don't reflexively "fix the test":

1. **Real product defect** the check caught → file it / fix the product; leave the check red until fixed. (This suite has surfaced real bugs — dead HTML-body fallbacks, un-enforced validation filters, permission-parity cache leaks, dead driver classes.)
2. **Environment gap** → stale migration (`codegen-determinism` mismatch), MJAPI down (client-transport bundles error), or un-seeded metadata (`mj sync push` not run). Fix the environment and re-run.
3. **Check bug / flake** → fix the check, then re-run that single bundle to confirm.

Re-run one bundle with `MJ_INTEGRATION_TEST=1 npx mj test run "IT## - <name>"` before re-running the whole tier. Single-bundle runs are equivalent to the in-suite run for every bundle with a declared transport (the driver enforces the declared `transport` against the resolved provider and aborts loudly on a mismatch), so a red single-bundle re-run is genuine signal.

**Transport is server-in-process for the live-agent bundles (Q8), not the wire.** Despite the "live" naming, `agent-loop-live`, `shipped-agents-live`, `agent-carry-forward`, `agent-payload-guards`, and `agent-artifact-tools` run the agent in-process via `AgentRunner.RunAgent` (the headless client can't consume the wire's fire-and-forget PubSub; the dedicated wire path is IT63). These bundles pass `ctx.User` explicitly — `provider.CurrentUser` is null on the CLI's SQL provider, so a missing contextUser dies in `BaseEngine.Load`.

**Distinguish `agent-run-failed:` from `model-noncompliance:`.** The former is an execution failure (the run never landed a run id) — read the run's `ErrorMessage`; the latter is accepted model variance after 3 bounded attempts. Before #3251 the two were conflated (a no-run was retried as non-compliance), which turned a `contextUser` harness defect into phantom model-variance reports during the v5.49.0 build. Post-mortem + mechanism: [`plans/integration-test-expansion/fix-3251-live-agent-contextuser-and-transport-guard.md`](../../../../plans/integration-test-expansion/fix-3251-live-agent-contextuser-and-transport-guard.md).

## Notes for maintainers

- Every check bundle has a metadata sibling — an `MJ: Tests` (IT) record joined to a suite. A `sibling-parity.test.ts` in the suite package fails the build if a bundle lacks its record or a record points at a missing bundle, so the catalog can't silently drift.
- Fixtures self-clean their own rows, tagged `(mj-integration-test — safe to delete)`. If a run is killed mid-flight, those tagged rows are safe to sweep manually.
- Full authoring/running detail: [Integration Testing Quickstart](../../../guides/INTEGRATION_TESTING_QUICKSTART.md) and the suite [README](../README.md).
