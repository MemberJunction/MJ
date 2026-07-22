---
"@memberjunction/integration-test-suite": patch
---

Correct the release runbook's integration-testing step for the post-#3228 suite, and fix three stale sibling docs. Documentation only — no runtime code changes.

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
