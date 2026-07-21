# Run Integration Tests

Run MemberJunction's headless integration test suite (the live-provider tier: real DB + GraphQL + engines, no mocks) and report results. Use this to verify a feature/PR is done, smoke-test after migrations + CodeGen, or investigate an integration failure.

## Prerequisites (verify, don't assume)

Before running anything, confirm the environment is ready — the suite runs against the **live dev database**, so it doubles as a schema/types/engines-agree smoke test and WILL fail loudly if any of these are stale:

1. **Migrations applied.** The DB must be at the branch's schema. If a `codegen-determinism` check reports "generated file registers N entities but live metadata has N-1", a migration from a recent pull hasn't been applied — run migrations first (Flyway), then re-run.
2. **CodeGen run** after any schema change (so `packages/MJCoreEntities` generated types match the DB).
3. **Packages built** — `npm run build` (the suite imports built `dist/`). The private `@memberjunction/integration-test-suite` package must be built.
4. **Metadata seeded** — the suite is dispatched from `MJ: Tests` / `MJ: Test Suites` rows. Seed once per fresh DB:
   ```bash
   npx mj sync push --dir=metadata-optional/integration-test
   ```
   (Note: `&` in a metadata Name breaks the lookup parser — the seeded records use "and".)
5. **MJAPI running** on the configured port — REQUIRED for the **client-transport** bundles (they exercise the real GraphQL wire). Server-transport bundles run in-process and don't need it. If MJAPI has run a very long time, restart it fresh (a resource-degraded server produces spurious timeouts).

## How to run

The single entry path is `mj test` (there are no per-bundle dispatcher scripts — do not create any). It loads the check bundles via the `testing.checkModules` seam in `mj.config.cjs`.

- **Whole deterministic tier** (the gate — credential-light, self-cleaning, $0, no LLM):
  ```bash
  npm run test:integration
  # = MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Deterministic"
  ```
- **Include the mutation axis** (create/update/delete fixture rows — still self-cleaning):
  ```bash
  RUN_MUTATION_TESTS=1 npm run test:integration
  ```
- **A single bundle** while iterating (by its `MJ: Tests` record Name):
  ```bash
  MJ_INTEGRATION_TEST=1 npx mj test run "IT30 - Conversation Compaction (assembly layer)"
  # add RUN_MUTATION_TESTS=1 for mutation-gated checks in that bundle
  ```
- **Live-model tier** (real agent/prompt runs against real models — spends tokens, well under \$1/run; opt-IN):
  ```bash
  RUN_AGENT_TESTS=1 MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Live Model"
  ```
- **Predictive Studio tier**: `PS_INTEGRATION=1`.

### Environment flags summary
| Flag | Effect |
|---|---|
| `MJ_INTEGRATION_TEST=1` | **Required.** Marks this as the dedicated instrumented-cache process (must be `LocalCacheManager`'s first caller). |
| `RUN_MUTATION_TESTS=1` | Enables the create/update/delete mutation axis. |
| `RUN_AGENT_TESTS=1` | Enables the live-model tier (real LLM calls, token cost). |
| `PS_INTEGRATION=1` | Enables the Predictive Studio rig. |

## Reporting

1. Report the headline: `SUMMARY N/M passed (X%)` and any `✗ FAILED` bundle names with the failing check's oracle message.
2. **Triage each failure honestly** — distinguish: (a) a real product defect the check caught, (b) a check bug, (c) an environment gap (stale DB/migration, MJAPI down, missing seed). Do NOT "fix" a check to make a real defect go green.
3. Timing/telemetry is persisted to `MJ: Test Runs` (per-bundle `DurationSeconds`, pass/fail counts, `CostUSD`, `MachineName`) and `MJ: Test Suite Runs` (suite `TotalDurationSeconds`). Pull recent rows with `RunView` when asked about trends or slow bundles.
4. If asked to fix a failure, apply the fix at the correct layer, then re-run just that bundle to confirm before re-running the tier.

## Guardrails
- Never mark a feature/PR "done" on unit tests alone — the deterministic integration tier passing is the required bar.
- Fixtures self-clean their own tagged rows (`(mj-integration-test — safe to delete)`); never widen a teardown to touch other data.
- Don't run destructive DB operations to "reset" state — the suite is designed to be idempotent and self-cleaning.
