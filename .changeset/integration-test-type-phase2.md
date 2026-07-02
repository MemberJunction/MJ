---
"@memberjunction/testing-integration": patch
---

Integration Test TestType — graduation Phase 2: migrate the cache suites to metadata, with proven equivalence.

- **All ~47 live-harness checks ported into the shared `IntegrationCheckRegistry`** as three ordered bundles — `server-cache` (S1–S26), `client-cache` (C1–C12), `runquery-cache` (Q1–Q9). Check bodies are lifted verbatim from `packages/MJServer/integration-test-scripts/*`; the only edits are static `RunQuery` imports (no dynamic `import()`) and `MJ`-prefixed entity classes.
- **`IntegrationTestDriver` now dispatches by bundle**: `Configuration.checks[].type` selects a registry bundle (`GetBundle`) the driver runs in order against one bootstrapped context. Per-selector `config.runMutationTests` gates the `RequiresMutation` checks (S17/S23/S24, C10); transport is inferred (`client-cache` ⇒ GraphQL client, else SQL server); the `runquery-cache` bundle's Query/Category fixtures are created/torn down in a driver-level `try/finally`; an `EMIT_OUTCOMES` sidecar mirrors the tsx scripts' shape for the golden diff.
- **Single source of truth**: the three standalone `tsx` scripts are rewritten to register from the same registry (no second copy of any check body) and reuse the package bootstraps; the `lib/harness.ts` shim re-exports the new surface.
- **Golden-equivalence proven** against a live DB: the migrated `{checkId, passed}` set matches the committed originals for server (23 default + 26 mutation) and runquery (9), via both the script and driver front-ends. New `scripts/integration-golden-diff.mjs` + `CHECK_MAP.md` document and enforce no coverage loss.
- Per-check results persist to `MJ: Test Runs.ResultDetails` as a bare `OracleResult[]` (the custom TestRun form's check list renders these after the Phase 5 `getCheckResults()` reconciliation). Metadata: IT01 becomes the full `server-cache` bundle, IT02 (`runquery-cache`) and IT03 (`client-cache`, seeded Skip until MJAPI is provisioned in CI) added.
