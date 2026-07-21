# ⛔ Moved: Integration Tests Now Live in `@memberjunction/integration-test-suite`

**This folder no longer contains MemberJunction's integration tests.** If you're looking for
the test scripts that used to live here (the `*-tests.ts` dispatchers, `run-all.ts`, the
`lib/` bootstraps), they were restructured in July 2026. This page tells you where everything
went and how to run the suite now.

## Where everything lives

| What | Where it is now |
|---|---|
| **Check bundles** (the actual test logic, CC/Q/S/PE/… checks) | [`packages/TestingFramework/integration-test-suite/src/checks/`](../../TestingFramework/integration-test-suite/src/checks/) — the **private, never-published** `@memberjunction/integration-test-suite` package |
| **Framework** (registry, check contracts, `TestRunner`, bootstraps, `IntegrationTestDriver`) | [`packages/TestingFramework/testing-integration/`](../../TestingFramework/testing-integration/) — the published `@memberjunction/testing-integration` package, now **content-free** |
| **Special rigs** (two-server cross-invalidation, agent-memory live-model, runview-matrix, `ps-inproc-*` / `ps-live-*` Predictive Studio flows) + the `lib/` bootstraps they use | [`packages/TestingFramework/integration-test-suite/rigs/`](../../TestingFramework/integration-test-suite/rigs/) — standalone `tsx` scripts, deliberately NOT catalog entry paths |
| **Test composition** (which tests exist, suites, tiers) | [`metadata-optional/integration-test/`](../../../metadata-optional/integration-test/) — `MJ: Tests` records (`.IT##-*.json`) + suite membership |

## How to run the suite (single entry path: `mj test`)

The per-bundle `tsx` dispatchers and the `run-all.ts` aggregator are **gone by design** — there
is now exactly ONE way to invoke the catalog:

```bash
# The whole deterministic tier (same as before, now backed by mj test)
npm run test:integration

# One suite
npx mj test suite "Integration Tests — Deterministic"

# One bundle while iterating (the old `npx tsx …/server-cache-tests.ts` loop)
npx mj test run "IT01 - Server Cache"        # by Test name
```

## ⚠️ The metadata dependency (this is the part that trips people up)

`mj test` is **metadata-driven**: it discovers tests from `MJ: Tests` / `MJ: Test Suites`
records in the database. Those records are version-controlled in `metadata-optional/`
(deliberately outside the default `metadata/` push so they never land in a production DB),
which means **every environment that runs the suite — including a fresh dev DB and CI — must
seed them once first**:

```bash
npx mj sync push --dir=metadata-optional/integration-test
```

If `mj test` reports an unknown suite/test, or the driver reports
"Unknown integration check bundle", the causes are (in order of likelihood):

1. **IT records not seeded** → run the `mj sync push` above.
2. **Suite package not built** → `npm run build` (or `cd packages/TestingFramework/integration-test-suite && npm run build`).
3. **Check modules not configured** → the repo root `mj.config.cjs` must carry
   `testing: { checkModules: ['@memberjunction/integration-test-suite'] }`. This is how the
   published `mj` CLI loads the private bundle package at runtime without depending on it.

## Why the restructure

Two defects in the old layout: (a) the entire test suite — all check bundles and their heavy
dependency tree — **shipped to every customer** inside `@memberjunction/testing-integration`
(a runtime dependency of `server-bootstrap`, whose generated manifest imports
`IntegrationTestDriver` from the barrel); (b) this folder was a runtime package hosting ~40
test files. The split makes the framework pure (small, legitimately shippable), keeps MJ's own
test content private, and collapses three invocation paths into one. Full rationale:
[`plans/integration-test-expansion/framework-restructure-proposal.md`](../../../plans/integration-test-expansion/framework-restructure-proposal.md).

## What's still here

- `COMPACTION_UI_TEST_PLAYBOOK.md` — the manual UI verification playbook for the
  conversation-compaction feature (PR #2732). Browser-driven, not headless; unaffected by the
  restructure. Its headless siblings are the `conversation-compaction` bundle (CC1–CC12, IT30).
