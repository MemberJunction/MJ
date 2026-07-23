# @memberjunction/integration-test-suite

## 5.49.0

### Patch Changes

- 8d2a454: Correct the release runbook's integration-testing step for the post-#3228 suite, and fix three stale sibling docs. Documentation only — no runtime code changes.

  `DEPLOYMENT.md` Step 4 described a world that no longer exists: it told the build engineer to run `RUN_MUTATION_TESTS=1 RUN_AGENT_TESTS=1 npm run test:integration` and claimed an aggregator collapsed all tiers into one exit code. That command runs **zero** live-model tests — `test:integration` is hardcoded to `mj test suite "Integration Tests — Deterministic"`, the live tests live in a **sibling** suite, and `mj test suite` does not recurse into child suites, so the runbook reported "all three tiers passed" while one never ran. The aggregator (`run-all.ts`) was deleted in the July-2026 restructure.

  Every command and behavior in the rewritten step was verified by executing it against a live throwaway database rather than inferred from source. That surfaced corrections that source-reading alone had gotten wrong:
  - **Seeding is mandatory, not optional.** The old text said skipping `metadata-optional/integration-test` "keeps the suite green"; an unseeded database actually exits **1** with `Test suite not found`. The suite/Test rows exist only in that root.
  - **Two false-green paths, neither visible in the exit code.** With MJAPI down, the 19 client-transport bundles **skip-as-PASS** (a green 52/52 that ran 33 tests); with `MJ_API_KEY` missing they return status `Error` — and `failedTests` counts only `Failed`, so both exit **0**. The step now requires `N === M === 52` plus a DB-side status tally, because the console prints `✗ FAILED` for `Error` too.
  - **`RUN_AGENT_TESTS` is default-ON** (`IsTierEnabled` returns `!== '0'`), so `=1` is a no-op and `=0` silently yields a green 15/15 that executed nothing.
  - **Missing provider keys FAIL the live tier, they do not skip** — verified by blanking `AI_VENDOR_API_KEY__*`. The build-engineering runbook claimed a clean skip, which would have made a keyless CI leg look safe.
  - **A virgin release database cannot reach 52/52.** `IT29 - Cache Gauntlet` enforces an anti-vacuity floor requiring `MJ: User Settings` to already hold ≥2 rows, so a fresh Step-3 database yields 51/52 until a baseline is seeded.
  - Counts and budgets corrected against reality: IT01–IT66 (67 records, 52 + 15), 242 seeded records, deterministic ≈133s, live ≈570s. `[COST]` reports `$0.0000` even on real model calls, so it must not be read as spend.

  Also documents two environment traps that cost real debugging time: the testing CLI loads dotenv with `override: true` (so an inline `DB_DATABASE=…` is silently ignored for `mj test` while it works for `mj sync push` — a mutating run against the wrong database), and a stale `dist/` orphan whose source was deleted will block MJAPI from booting entirely with a duplicate-GraphQL-type error that rebuilding does not clear.

  Finally, records the SQL Server / PostgreSQL parity position honestly: migration parity is verified every release (Step 8), but **runtime** parity is not — the integration suite cannot run on PostgreSQL today. The testing CLI builds an mssql pool and declares no PG driver, and `UserCache.Refresh` is mssql-typed and issues T-SQL, so the context-user cache stays empty regardless of database contents. Provisioning a PG database does not enable it; it needs a code + dependency change. The section is explicitly scoped so it reads as a roadmap gap and never as a reason to halt a release.

  Sibling docs corrected: `guides/INTEGRATION_TESTING_QUICKSTART.md` (member counts and tier-gating table), `.github/workflows/integration.yml` (stale IT-range comments), and `packages/TestingFramework/integration-test-suite/docs/build-engineering-runbook.md` (the credential-skip claim, `RUN_AGENT_TESTS` semantics, bundle count and measured duration).

- 887c80a: Add the required `repository` block to `@memberjunction/integration-test-suite`. The `validate-package-repository.sh` CI gate requires every `@memberjunction/*` package to declare `repository.url` for npm sigstore provenance; this package shipped without it and was failing the build and publish workflows.
- 8af6663: Skip `private: true` packages in `validate-npm-packages.sh`, the `publish.yml` gate that checks every `@memberjunction/*` package already exists on npm.

  The gate exists to predict whether `npm run change publish` will succeed, but it filtered only on the `@memberjunction/` scope and never read `.private`. Changesets never publishes a private package (`@changesets/cli`: `packages.filter(pkg => !pkg.packageJson.private)`), so for a private package the gate was asking a question with no bearing on the outcome it gates, and failing the release over the answer.

  The gap had been masked by workarounds rather than hit: `@memberjunction/mobile-app` and `@memberjunction/ng-test-utils` are both `private: true` yet sit on npm at `0.0.0` and `0.0.1`, throwaway placeholders published purely to satisfy this check. They have stayed frozen at those versions ever since while the in-repo versions moved on, which is what a placeholder for a private package always decays into. `@memberjunction/integration-test-suite` is the first private package added since, so v5.49.0 is the first release where the gate actually fails.

  Skips are logged rather than silent, so an accidental `"private": true` on a package that should ship is still visible in CI output — preserving the only real signal the old behavior provided, without blocking the release on it. The gate still fails correctly for genuinely missing public packages.

- 838c6c7: Skip `private: true` packages in `validate-package-repository.sh`, matching the rule PR #3236 established in `validate-npm-packages.sh` — so both publish gates now answer "is this a package we publish?" the same way.

  The gate requires `repository.url` for npm sigstore provenance, which only applies to published packages: npm refuses to attest a private package, and changesets never publishes one (`@changesets/cli`: `packages.filter(pkg => !pkg.packageJson.private)`). Requiring the field on a private package forced inert metadata — `@memberjunction/integration-test-suite` had a `repository` block added purely to satisfy this gate, hours before the sibling gate was fixed properly.

  Skips are logged rather than silent, mirroring the sibling gate. Unlike the npm-existence gate (network-bound), this script is pure-local, so it now has a fixture-based vitest suite in `.github/scripts/__tests__/` covering the skip, the not-blunted property (private skip + public failure in one run), and predicate parity with changesets truthiness.

  Also updates `DEPLOYMENT.md` Step 5 and `NEW_PACKAGE_SETUP.md`, which still described the pre-#3236 behavior ("lists every package missing from npm") — the script now lists every _publishable_ package missing, and private packages need no placeholder.

- Updated dependencies [486b276]
- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [0e52ff6]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [3d0255b]
- Updated dependencies [243523e]
- Updated dependencies [88d707b]
- Updated dependencies [7db8ef5]
- Updated dependencies [a7733a9]
- Updated dependencies [3b23275]
- Updated dependencies [505c8b5]
- Updated dependencies [ebe5b88]
- Updated dependencies [a9ec419]
- Updated dependencies [6c910ef]
- Updated dependencies [42a680a]
- Updated dependencies [88d707b]
- Updated dependencies [70113b1]
- Updated dependencies [1a15bd2]
- Updated dependencies [f1ab36f]
- Updated dependencies [4a03c37]
- Updated dependencies [38c69a6]
- Updated dependencies [7d6e8fb]
- Updated dependencies [b64efd1]
- Updated dependencies [d23aa89]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [04cdd67]
- Updated dependencies [5473e9a]
- Updated dependencies [38c220c]
- Updated dependencies [bc388e3]
- Updated dependencies [42fc86b]
- Updated dependencies [373c5f6]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [15e3017]
- Updated dependencies [fc1c693]
- Updated dependencies [70c658c]
- Updated dependencies [9d6e3d9]
- Updated dependencies [78a5e44]
  - @memberjunction/codegen-lib@5.49.0
  - @memberjunction/core@5.49.0
  - @memberjunction/ai-agents@5.49.0
  - @memberjunction/ai-core-plus@5.49.0
  - @memberjunction/ai-prompts@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/graphql-dataprovider@5.49.0
  - @memberjunction/testing-integration@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/communication-types@5.49.0
  - @memberjunction/communication-engine@5.49.0
  - @memberjunction/communication-sendgrid@5.49.0
  - @memberjunction/communication-gmail@5.49.0
  - @memberjunction/communication-twilio@5.49.0
  - @memberjunction/communication-ms-graph@5.49.0
  - @memberjunction/communication-expo-push@5.49.0
  - @memberjunction/scheduling-engine@5.49.0
  - @memberjunction/actions@5.49.0
  - @memberjunction/ai@5.49.0
  - @memberjunction/api-keys@5.49.0
  - @memberjunction/metadata-sync@5.49.0
  - @memberjunction/predictive-studio@5.49.0
  - @memberjunction/predictive-studio-core@5.49.0
  - @memberjunction/search-engine@5.49.0
  - @memberjunction/sqlserver-dataprovider@5.49.0
  - @memberjunction/templates@5.49.0
  - @memberjunction/ai-engine-base@5.49.0
  - @memberjunction/aiengine@5.49.0
  - @memberjunction/ai-bridge-base@5.49.0
  - @memberjunction/ai-bridge-server@5.49.0
  - @memberjunction/actions-base@5.49.0
  - @memberjunction/notifications@5.49.0
  - @memberjunction/conversations-runtime@5.49.0
  - @memberjunction/open-app-engine@5.49.0
  - @memberjunction/query-processor@5.49.0
  - @memberjunction/record-set-processor-base@5.49.0
  - @memberjunction/record-set-processor@5.49.0
  - @memberjunction/templates-base-types@5.49.0
