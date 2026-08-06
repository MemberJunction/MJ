# @memberjunction/integration-test-suite

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [e4a6fa3]
- Updated dependencies [cd520e2]
- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [fe7bd9d]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
- Updated dependencies [0acf96e]
- Updated dependencies [8d0d45a]
- Updated dependencies [1100077]
- Updated dependencies [e76b195]
  - @memberjunction/api-keys@6.1.0-edge.0
  - @memberjunction/codegen-lib@6.1.0-edge.0
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/actions@6.1.0-edge.0
  - @memberjunction/actions-base@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/sqlserver-dataprovider@6.1.0-edge.0
  - @memberjunction/search-engine@6.1.0-edge.0
  - @memberjunction/testing-integration@6.1.0-edge.0
  - @memberjunction/aiengine@6.1.0-edge.0
  - @memberjunction/ai-agents@6.1.0-edge.0
  - @memberjunction/ai-engine-base@6.1.0-edge.0
  - @memberjunction/ai-core-plus@6.1.0-edge.0
  - @memberjunction/predictive-studio@6.1.0-edge.0
  - @memberjunction/ai-prompts@6.1.0-edge.0
  - @memberjunction/ai-bridge-base@6.1.0-edge.0
  - @memberjunction/ai-bridge-server@6.1.0-edge.0
  - @memberjunction/communication-types@6.1.0-edge.0
  - @memberjunction/communication-engine@6.1.0-edge.0
  - @memberjunction/notifications@6.1.0-edge.0
  - @memberjunction/communication-ms-graph@6.1.0-edge.0
  - @memberjunction/communication-sendgrid@6.1.0-edge.0
  - @memberjunction/content-autotagging@6.1.0-edge.0
  - @memberjunction/conversations-runtime@6.1.0-edge.0
  - @memberjunction/graphql-dataprovider@6.1.0-edge.0
  - @memberjunction/metadata-sync@6.1.0-edge.0
  - @memberjunction/open-app-engine@6.1.0-edge.0
  - @memberjunction/query-processor@6.1.0-edge.0
  - @memberjunction/record-set-processor@6.1.0-edge.0
  - @memberjunction/scheduling-engine@6.1.0-edge.0
  - @memberjunction/templates-base-types@6.1.0-edge.0
  - @memberjunction/templates@6.1.0-edge.0
  - @memberjunction/communication-expo-push@6.1.0-edge.0
  - @memberjunction/communication-gmail@6.1.0-edge.0
  - @memberjunction/communication-twilio@6.1.0-edge.0
  - @memberjunction/record-set-processor-base@6.1.0-edge.0
  - @memberjunction/ai@6.1.0-edge.0
  - @memberjunction/predictive-studio-core@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-agents@6.0.0
  - @memberjunction/ai-engine-base@6.0.0
  - @memberjunction/ai-core-plus@6.0.0
  - @memberjunction/aiengine@6.0.0
  - @memberjunction/predictive-studio@6.0.0
  - @memberjunction/ai-prompts@6.0.0
  - @memberjunction/ai-bridge-base@6.0.0
  - @memberjunction/ai-bridge-server@6.0.0
  - @memberjunction/api-keys@6.0.0
  - @memberjunction/actions-base@6.0.0
  - @memberjunction/actions@6.0.0
  - @memberjunction/codegen-lib@6.0.0
  - @memberjunction/communication-types@6.0.0
  - @memberjunction/communication-engine@6.0.0
  - @memberjunction/notifications@6.0.0
  - @memberjunction/communication-ms-graph@6.0.0
  - @memberjunction/communication-expo-push@6.0.0
  - @memberjunction/communication-gmail@6.0.0
  - @memberjunction/communication-sendgrid@6.0.0
  - @memberjunction/communication-twilio@6.0.0
  - @memberjunction/content-autotagging@6.0.0
  - @memberjunction/conversations-runtime@6.0.0
  - @memberjunction/graphql-dataprovider@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/metadata-sync@6.0.0
  - @memberjunction/open-app-engine@6.0.0
  - @memberjunction/query-processor@6.0.0
  - @memberjunction/record-set-processor-base@6.0.0
  - @memberjunction/record-set-processor@6.0.0
  - @memberjunction/sqlserver-dataprovider@6.0.0
  - @memberjunction/scheduling-engine@6.0.0
  - @memberjunction/search-engine@6.0.0
  - @memberjunction/templates-base-types@6.0.0
  - @memberjunction/templates@6.0.0
  - @memberjunction/testing-integration@6.0.0
  - @memberjunction/ai@6.0.0
  - @memberjunction/predictive-studio-core@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- aa4fbcd: Fix the live-agent harness reaching prompt runs through a column that does not exist, and stop it swallowing the failure

  Three live-harness helpers filtered `MJ: AI Prompt Runs` on `AgentRunID`. That column is not on
  `AIPromptRun` — its only agent-facing field is `AgentID`. A prompt run is reachable from its agent
  run only through the step that invoked it: an `MJ: AI Agent Run Steps` row whose `TargetLogID` is
  the prompt run's ID.

  The reason a nonexistent column survived in committed code is the second half. `RunView` does not
  throw — it returns `Success: false` with an `ErrorMessage` — and each helper coalesced that to `[]`,
  making a SQL error indistinguishable from "this run made no model calls". Callers read zero prompt
  runs and either passed vacuously or failed on an unrelated-looking assertion. The swallow was the
  actual defect; the wrong column name only exploited it.

  Which step types carry a prompt run is the other half of the rule, and `Prompt` alone is wrong.
  base-agent writes a prompt run's id into `TargetLogID` on three step types: `Prompt` (the ordinary
  model call), `Compaction` (cross-turn conversation compaction), and `Tool` (a conversation tool call
  that made its own model call, deliberately with no duplicate `Prompt` step — so a Prompt-only rule
  cannot reach it by any route). Two named sets now encode this, because the correct answer differs by
  purpose: `PROMPT_RUN_BEARING_STEP_TYPES` (all three) for deletion, which must be exhaustive or it
  orphans rows, and `ROLLUP_BEARING_STEP_TYPES` (`Prompt` + `Compaction`) for token reads, mirroring
  the step types base-agent actually counts toward `AIAgentRun.TotalTokensUsed`. A single blanket
  filter would have fixed the orphaning and broken the token reconciliation in the same stroke.

  The linkage rule now exists once, in `promptRunIdsFromSteps`, instead of being restated in four
  places with three of them wrong. `deepDeleteRunTrees` resolves prompt runs _before_ deleting steps —
  the previous order deleted the steps first and destroyed the only path to those rows, so teardown
  silently leaked every prompt run it claimed to purge. `requireRows` replaces the swallow in the read
  helpers; teardown paths stay non-throwing by design but now log rather than going quiet.

  `RS7` asserted a short-circuit with a 2-char query while `SearchEngine.MIN_TERM_LENGTH` is now 2
  (lowered from 3 so short queries like "AI" and "US" are searchable), so it no longer described
  product behavior. It now probes with a single character, below both the old and current thresholds,
  testing the short-circuit rather than tracking the threshold's value. `SR5` had already been changed
  this way when the 3-to-2 fix landed; `RS7` was missed because its bundle is live-model tier and the
  deterministic gate never runs it.

  Adds `prompt-run-linkage.test.ts`. Its unit tests pin the linkage rule and the loud-failure
  property, but neither can catch someone re-adding an `AgentRunID` filter — only a real database
  rejects that, and the live tier is triage-only, so the regression would ship exactly as it did the
  first time. The file therefore also scans the check sources, the same filesystem-drift technique
  `sibling-parity.test.ts` uses for bundle-to-metadata parity.

- c382605: Fix realtime relayed-tool dispatch for scoped anonymous magic-link sessions (#3371): delegated agent runs, co-agent observability writes (creation, transcript/tool-turn appends, usage accumulation, finalize), and recording uploads now execute under the system user once session ownership is proven — gated on MagicLinkScope, excluding public web-widget guests, and failing closed to the caller when no system user is available. The session's `allowedAgents` colleague union is now CanRun-gated against the original caller before dispatch, so elevation cannot widen agent authority, and delegated runs carry the visitor's id as `userId` so run attribution and context-memory scope stay the person's. Adds the IT68 scoped-anon-elevation deterministic integration bundle proving the permission contract on a live database.
- Updated dependencies [c382605]
- Updated dependencies [1e048ef]
- Updated dependencies [a8fc549]
  - @memberjunction/ai-agents@5.51.0
  - @memberjunction/codegen-lib@5.51.0
  - @memberjunction/core@5.51.0
  - @memberjunction/predictive-studio@5.51.0
  - @memberjunction/record-set-processor@5.51.0
  - @memberjunction/scheduling-engine@5.51.0
  - @memberjunction/ai-engine-base@5.51.0
  - @memberjunction/ai-core-plus@5.51.0
  - @memberjunction/aiengine@5.51.0
  - @memberjunction/ai-prompts@5.51.0
  - @memberjunction/ai-bridge-base@5.51.0
  - @memberjunction/ai-bridge-server@5.51.0
  - @memberjunction/api-keys@5.51.0
  - @memberjunction/actions-base@5.51.0
  - @memberjunction/actions@5.51.0
  - @memberjunction/communication-types@5.51.0
  - @memberjunction/communication-engine@5.51.0
  - @memberjunction/notifications@5.51.0
  - @memberjunction/communication-ms-graph@5.51.0
  - @memberjunction/communication-expo-push@5.51.0
  - @memberjunction/communication-gmail@5.51.0
  - @memberjunction/communication-sendgrid@5.51.0
  - @memberjunction/communication-twilio@5.51.0
  - @memberjunction/content-autotagging@5.51.0
  - @memberjunction/conversations-runtime@5.51.0
  - @memberjunction/graphql-dataprovider@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/metadata-sync@5.51.0
  - @memberjunction/open-app-engine@5.51.0
  - @memberjunction/query-processor@5.51.0
  - @memberjunction/record-set-processor-base@5.51.0
  - @memberjunction/sqlserver-dataprovider@5.51.0
  - @memberjunction/search-engine@5.51.0
  - @memberjunction/templates-base-types@5.51.0
  - @memberjunction/templates@5.51.0
  - @memberjunction/testing-integration@5.51.0
  - @memberjunction/ai@5.51.0
  - @memberjunction/predictive-studio-core@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- 623dfc5: Break CodeGen FK cycle between AIAgentRun, AIPromptRun, and ConversationDetail. Move SummaryPromptRunID from ConversationDetail to a new ConversationCompactionRun audit table. Remove AgentRunID from AIPromptRun (derivable via AIAgentRunStep.TargetLogID). Remove agentRunId from AIPromptParams and all write sites across the prompt/agent stack.
- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [54a037f]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [a3bd648]
- Updated dependencies [c221553]
- Updated dependencies [fab223d]
- Updated dependencies [a7dfaf5]
- Updated dependencies [d79dd11]
- Updated dependencies [86832fa]
- Updated dependencies [deb02b4]
- Updated dependencies [8b4c6b2]
- Updated dependencies [918563e]
- Updated dependencies [0686d52]
- Updated dependencies [c7b6710]
- Updated dependencies [764d6f6]
- Updated dependencies [408e4bf]
- Updated dependencies [0ba33b3]
- Updated dependencies [03fc891]
- Updated dependencies [76c0ffb]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai-agents@5.50.0
  - @memberjunction/ai-core-plus@5.50.0
  - @memberjunction/ai-prompts@5.50.0
  - @memberjunction/codegen-lib@5.50.0
  - @memberjunction/content-autotagging@5.50.0
  - @memberjunction/ai@5.50.0
  - @memberjunction/testing-integration@5.50.0
  - @memberjunction/open-app-engine@5.50.0
  - @memberjunction/communication-types@5.50.0
  - @memberjunction/communication-ms-graph@5.50.0
  - @memberjunction/search-engine@5.50.0
  - @memberjunction/communication-gmail@5.50.0
  - @memberjunction/communication-sendgrid@5.50.0
  - @memberjunction/actions-base@5.50.0
  - @memberjunction/predictive-studio-core@5.50.0
  - @memberjunction/metadata-sync@5.50.0
  - @memberjunction/ai-engine-base@5.50.0
  - @memberjunction/aiengine@5.50.0
  - @memberjunction/predictive-studio@5.50.0
  - @memberjunction/ai-bridge-base@5.50.0
  - @memberjunction/ai-bridge-server@5.50.0
  - @memberjunction/api-keys@5.50.0
  - @memberjunction/actions@5.50.0
  - @memberjunction/communication-engine@5.50.0
  - @memberjunction/notifications@5.50.0
  - @memberjunction/conversations-runtime@5.50.0
  - @memberjunction/graphql-dataprovider@5.50.0
  - @memberjunction/query-processor@5.50.0
  - @memberjunction/record-set-processor@5.50.0
  - @memberjunction/sqlserver-dataprovider@5.50.0
  - @memberjunction/scheduling-engine@5.50.0
  - @memberjunction/templates-base-types@5.50.0
  - @memberjunction/templates@5.50.0
  - @memberjunction/communication-expo-push@5.50.0
  - @memberjunction/communication-twilio@5.50.0
  - @memberjunction/record-set-processor-base@5.50.0
  - @memberjunction/global@5.50.0

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
