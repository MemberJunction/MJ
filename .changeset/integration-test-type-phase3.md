---
"@memberjunction/testing-integration": patch
"@memberjunction/testing-cli": patch
"@memberjunction/testing-engine": patch
---

Integration Test TestType — graduation Phase 3: tiering, gating & guaranteed cleanup.

- **Single-source-of-truth tier model** in a new `tiers.ts`: `IntegrationTier` (`deterministic` | `mutation` | `live-model`), `TIER_ENV_GATE` (mutation ⇒ `RUN_MUTATION_TESTS`, live-model ⇒ `RUN_AGENT_TESTS`, deterministic ungated), and `IsTierEnabled()`. Both the standalone `tsx` scripts and the `IntegrationTestDriver` now gate through this one predicate, so a flag is honored identically in both execution paths.
- **`IntegrationTestDriver` tier gating**: `Configuration.tier` (defaults to `deterministic`) drives a whole-test env gate — a gated tier whose env var is unset skip-passes with a single `gate` `OracleResult` (the driver result enum has no `Skipped`, so this is the honest v1: a green run noting why it was skipped). An explicit `requiresEnv` still overrides. Per-check `RequiresMutation` / `RequiresLiveModel` flags now gate through `IsTierEnabled` (env-driven), so a deterministic Test carrying mutation checks runs them under `RUN_MUTATION_TESTS=1` — matching the `tsx` scripts exactly (23 default / 26 mutation, proven by golden diff at both tiers).
- **Sibling tier suites** under a new parent `Integration Tests`: `Integration Tests — Deterministic` (the blocking, credential-free tier; mutation checks ride inside it, gated at runtime — no separate mutation suite) and `Integration Tests — Live Model` (opt-in, never in the default gate). The `tsx` scripts replace inline `process.env.RUN_MUTATION_TESTS` checks with `IsTierEnabled('mutation')`.
- **Serial-execution invariant (CANONICAL D)**: the CLI `suite` command forces `parallel:false` / `maxParallel:1` under `MJ_INTEGRATION_TEST=1`, since integration bundles share process-global cache/counter singletons and must never round-robin across workers.
- **Suite-membership `Status` is now honored on execution** (`MJTestSuiteTest.Status`): a `Skip`/`Disabled` membership is excluded from a suite run (was previously ignored — every membership executed). This is how the deterministic suite parks IT03 (client/GraphQL, needs MJAPI) without deleting it; the fix lives in the engine's execution path only, leaving the shared suite-test getter's display semantics unchanged.
- Validated live against a real DB: `mj test suite "Integration Tests — Deterministic"` excludes IT03 and passes IT01+IT02; the driver honors `RUN_MUTATION_TESTS=1` (26 checks) golden-equivalent to the `tsx` script. CI workflow wiring is deferred to Phase 5 (the `release-test.yml` `integration-suite` job and the `run-all.ts` aggregator are introduced there).
