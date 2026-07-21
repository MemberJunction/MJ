# Integration-Test Suite Documentation

The documentation home for MemberJunction's integration-test content package
(`@memberjunction/integration-test-suite`). Everything here documents what is **shipped and
running today** — 52 registered bundles / ~365 checks — organized into six sub-suite families,
each with a deep per-bundle doc: the machinery under test, transport (client-over-GraphQL vs
server in-process), fixtures and lifecycle, tier per check (deterministic / mutation /
live-model), a full per-check inventory with the failure each check catches, and the honest
list of pinned gaps and known-offender exceptions with their
[bug-register](../../../../plans/integration-test-expansion/bug-register.md) IDs.

Run the deterministic tier with `npm run test:integration` (repo root), or a single bundle via
`MJ_INTEGRATION_TEST=1 npx mj test run --name "IT## - <name>"`. See the package
[README](../README.md) for the `mj test` entry path and the
[Integration Testing Quickstart](../../../../guides/INTEGRATION_TESTING_QUICKSTART.md) for the
full workflow.

## The sub-suite docs

| Doc | Bundles | Checks | Scope |
|---|---|---:|---|
| [cache-suite.md](cache-suite.md) | server-cache, client-cache, runquery-cache, dataset-cache, aggregates-cache, cache-gauntlet | 71 | The multi-tier cache: server LocalCacheManager (instrumented counters), client CacheLocal slots, RunQuery TTL/smart-validation, dataset cache, aggregate slots, and the subset-slot mutation gauntlet (#3195/#3199 family) |
| [data-access-suite.md](data-access-suite.md) | runview-matrix, runview-features, runquery-catalog, runquery-params, runquery-features, view-execution, lists | 62 | The two core data primitives swept exhaustively (RunView across every entity, every catalog query), cross-feature edges, the viewing-system data layer, and ListSource keyset pagination |
| [security-suite.md](security-suite.md) | rls-isolation (+rls-isolation-client), permission-engine, scope-enforcement, subscription-isolation, api-keys | 34 | RLS row filtering across genuinely-scoped users, the unified PermissionEngine provider fan-out, API-key scope ceilings and deny precedence, subscription channel isolation, APIKeyEngine lifecycle |
| [writes-transactions-suite.md](writes-transactions-suite.md) | entity-writes, entity-server-invariants, transaction-groups, field-rules-bulk-update, record-process (+facade) | 31 | The write path over the wire: BaseEntity CRUD + server-subclass dispatch, TransactionGroup atomicity and scope gating (B1/B49 pins), FieldRules bulk update, the Record Set Processing substrate and Record Process facade |
| [ai-suite.md](ai-suite.md) | ai-skills, ai-cost, ai-permissions, ai-embeddings, agent-loop-standin, conversation-compaction, prompt-runner, agent-runner, concurrent, remote-op-ai-authoring | 63 | The AI stack's deterministic seams (skill gates, cost math, permission dual-paths, persisted embeddings, loop machinery without an LLM, compaction assembly) plus the four live-model smoke bundles (IT16–IT19) |
| [platform-suite.md](platform-suite.md) | metadata-consistency, class-resolution, metadata-sync, codegen-determinism, app-wiring, open-app-teardown, scheduled-jobs, scheduling-concurrency, actions-pipeline, user-routines, remote-operations, remote-op-wire-progress, realtime-deterministic, predictive-studio, search, templates, communication | 104 | Everything platform: metadata↔DB consistency (MC4/MC6 ratchet), ClassFactory resolution, mj-sync, CodeGen determinism, app wiring across every shipped app, OpenApp teardown, scheduling/actions/routines, Remote Operations, realtime deterministic legs, Predictive Studio, unified search, templates, communication |

## The candidate catalog

[test-catalog.md](test-catalog.md) — the full enumerated candidate list from the adversarial
repo sweep (Domains 0–13), moved here from `plans/integration-test-expansion/` on 2026-07-21.
It is the *design ancestor*: proposed checks, tiers, and anchors. The sub-suite docs above
document what actually shipped (IDs and semantics sometimes diverge from the catalog sketch —
the docs note where).

## The agents extended suite (forthcoming)

The extended live-model agents family — carry-forward, payload guards, artifact tools,
plan-mode/skills loop legs, compaction e2e, memory guards, RAG/search (~65 checks across 10
proposed bundles) — is specified in
[plans/integration-test-expansion/agents-suite.md](agents-suite.md).
It lives there while under review/build and **will move into this folder as `agents-suite.md`
when the build lands**.

## Running it

- [`build-engineering-runbook.md`](build-engineering-runbook.md) — **for the release/CI build engineer**: where the suite fits in the build order (migrations → CodeGen → build → seed → MJAPI → run), the tier commands + env flags, CI recommendations, how to read the persisted `MJ: Test Runs` / `MJ: Test Suite Runs` telemetry, and the three-way failure triage.
- From Claude Code: the `/run-integration-tests` slash command runs a tier and triages the results.

## Related reading

- [`packages/TestingFramework/testing-integration/CATALOG.md`](../../testing-integration/CATALOG.md) — the living one-page coverage index (bundle × count × tier × transport)
- [`plans/integration-test-expansion/README.md`](../../../../plans/integration-test-expansion/README.md) — the strategic expansion plan (tracks, phases, transport doctrine)
- [`plans/integration-test-expansion/bug-register.md`](../../../../plans/integration-test-expansion/bug-register.md) — every defect the audit and the live runs surfaced, with dispositions
- [`metadata-optional/integration-test/`](../../../../metadata-optional/integration-test/) — the IT01–IT52 Test records, suites, and seeded fixtures (must be pushed once per environment)
