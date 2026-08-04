# Integration Test Catalog

The **living index** of MemberJunction's headless integration test coverage: what exists, what's planned, and the rules for adding more. Keep this updated as bundles land. The deep design rationale lives in [`plans/integration-test-expansion/`](../../../plans/integration-test-expansion/README.md) ([candidate catalog](../integration-test-suite/docs/test-catalog.md) · [bug register](../../../plans/integration-test-expansion/bug-register.md)), and the **comprehensive per-sub-suite documentation** (mechanism + per-check inventory for every shipped bundle) lives in [`integration-test-suite/docs/`](../integration-test-suite/docs/README.md).

> **Where the code lives (July-2026 restructure):** this package (`@memberjunction/testing-integration`) is **framework-only** — registry, check contracts, driver, bootstraps, instrumented cache, tiers. The check bundles themselves live in the **private, never-published sibling** [`@memberjunction/integration-test-suite`](../integration-test-suite/), loaded into `mj test` at runtime via `mj.config.cjs` `testing.checkModules`.

## What this layer is

Real DB + real providers/engines, **no mocks, no browser**. Sits between the mocked vitest unit layer and the AI-driven Computer-Use UI regression suite. Catches the seams between packages that unit tests mock away — cache integrity, RLS, transactions, provider SQL, permissions, cost accounting, class resolution.

## 🚦 Transport doctrine — CLIENT-FIRST (governing rule)

Write checks **over the GraphQL wire** via `GraphQLDataProvider` and the other non-visual client objects in `@memberjunction/graphql-dataprovider` (NOT Angular), against a running MJAPI (`bootstrapIntegrationClient`). Driving BaseEntity CRUD / `RunView` / `RunViews` / `RunQuery` / Remote Operations over the real wire exercises serialization, resolver auth/scope, field mapping, and transport framing — where a large bug class lives that in-process calls never touch (it also proves the resolver dispatches to the right server-entity subclass).

Use `bootstrapIntegrationServer` (in-process) **only** where there's no client surface: server-cache instrumentation, internal provider-SQL-shape probes, raw `sys.*`/`information_schema` audits. When an otherwise server-only capability needs coverage, **prefer adding a typed Remote Operation** (invoked client-side) over a server-side check — but exposing capability client-side is a security decision (**AI proposes, human approves**; never auto-add a remote op for a sensitive/privileged capability). One dimension is structurally out of the wire's reach — Angular `@RegisterClass(BaseResourceComponent)` resolution — which is a **static CI grep gate**, not a runtime test.

**MJAPI is a hard prerequisite** for the suite (`bootstrapIntegrationClient` fails fast if it isn't running). Standalone-vs-co-host topology is an open decision (see the plan).

## Tiers (`src/tiers.ts`)

| Tier | Gate | Runs in CI gate? |
|---|---|---|
| `deterministic` | none | ✅ blocking (per-PR) |
| `mutation` | `RUN_MUTATION_TESTS=1` | ⛔ (target: gated CI lane) |
| `live-model` | `RUN_AGENT_TESTS=1` | ⛔ (real LLM cost) |

> ⚠️ The driver has **no `Skipped` status** yet — gated/degraded checks currently report as `Passed` (false green). Adding a real `Skipped` state is the #1 harness fix (plan Track A / A1).

## Current bundles (registered in `IntegrationCheckRegistry`)

Bundles live in [`integration-test-suite/src/checks/`](../integration-test-suite/src/checks/). Each bundle keeps its sibling in sync (enforced by that package's `sibling-parity.test.ts`): an `.IT##-*.json` metadata Test under [`metadata-optional/integration-test/`](../../../metadata-optional/integration-test/) (the **metadata home** for tests/suites/fixtures — see its README), joined to the integration suite. The parity test also asserts the repo `mj.config.cjs` actually loads the suite package via `testing.checkModules`. (The tsx-dispatcher leg of the old three-way parity is gone — `mj test` is the single entry path.)

| Bundle | Checks | Tier | Transport |
|---|---|---|---|
| server-cache | 32 | det (+mut) | server |
| client-cache | 13 | det (+mut) | **client** |
| runquery-cache | 12 | det | server |
| rls-isolation (+client) | 10 | det | server + **client** |
| ai-skills | 21 | det | server |
| user-routines | 16 | det | server |
| record-process (+facade) | 10 | det | server |
| remote-operations (+wire-progress +ai-authoring) | 11 | det/live | server + **client** |
| predictive-studio | 5 | det | server |
| aggregates-cache / dataset-cache / api-keys / scheduled-jobs / field-rules-bulk-update / lists / open-app-teardown | 19 | det (+mut) | server |
| metadata-consistency | 7 | det | server |
| view-execution | 9 | det | **client** |
| app-wiring | 10 | det | **client** |
| entity-writes | 9 | det | **client** |
| permission-engine | 14 | det | **client** |
| cache-gauntlet | 8 | det | server |
| conversation-compaction | 12 | det | server |
| prompt-runner / agent-runner / concurrent | 4 | live | server |
| runview-matrix | 18 | det | **client** |
| runview-features | 6 | det | **client** |
| runquery-catalog | 6 | det | **client** |
| runquery-params | 10 | det | **client** |
| runquery-features | 10 | det | server |
| scope-enforcement | 5 | det | server |
| subscription-isolation | 2 | det | **client** |
| templates | 6 | det | server |
| actions-pipeline | 5 | det | server |
| entity-server-invariants | 4 | det | **client** |
| scheduling-concurrency | 3 | det | server |
| communication | 4 | det | server |
| ai-cost | 6 | det | **client** |
| ai-permissions | 6 | det | **client** |
| ai-embeddings | 5 | det | **client** |
| agent-loop-standin | 6 | det | server |
| transaction-groups | 5 | det | **client** |
| class-resolution | 5 | det | server |
| metadata-sync | 9 | det | server |
| codegen-determinism | 6 | det | **client** |
| realtime-deterministic | 9 | det | server |
| search | 7 | det | **client** |

**~365 checks / 52 registered bundles today** (IT01–IT52): 48 land in the **deterministic** suite, 4 (IT16–IT19) are **live-model**. The 2026-07 expansion added 22 bundles (IT31–IT52, ~143 checks) + EW9 to entity-writes. The older bundles are `bootstrapIntegrationServer` (in-process) — migrating them to client transport where a client path exists is tracked in the plan (Workstream M); the 2026-07 bundles are client-first where a client surface exists.

## Expansion roadmap (the growth target)

Toward a **1000+-factor** suite (checks × entities × apps × queries). Domains from the [test-catalog](../integration-test-suite/docs/test-catalog.md):

- **Domain 0 — Exhaustive RunView + RunQuery** (client-first): RunView matrix swept across all 379 entities; every catalog query run with valid parameter permutations. *(First landing: `runview-matrix-tests.ts` — a client-first RunView sweep, currently a standalone rig in [`integration-test-suite/rigs/`](../integration-test-suite/rigs/).)*
- **1** Metadata↔DB consistency audit · **2** Core write-side & transactions · **3** Security & permissions · **4** AI stack (cost, permissions, memory guards, + the stand-in-LLM harness for deterministic agent-loop coverage) · **5** Actions & background processing · **6** Entity-server invariants · **7** Communication/Templates · **8** PostgreSQL parity · **9** Metadata tooling · **10** Realtime/PS · **11** Viewing system · **12** All shipped apps · **13** Unified Search (client-first via `GraphQLSearchClient` — SearchEntities/FullTextSearch/SearchEngine + result permission scoping).

Target: ~355 authored checks → many-thousand effective assertions (the parameterized sweeps dominate).

## Adding a bundle

All in the suite package ([`integration-test-suite/`](../integration-test-suite/)) — no dispatcher:

1. Author `src/checks/<bundle>.checks.ts` — `NamedCheck` fns (`{ Id, Name, Fn(ctx), RequiresMutation?, RequiresLiveModel? }`), throw-on-fail, register into `IntegrationCheckRegistry.Instance`.
2. Export it from the suite package's `src/index.ts` (the barrel — registers on load).
3. Add the `.IT##-<bundle>.json` metadata Test + join it to the suite in `.integration-suite.json`, and update the count table in `check-registry.test.ts` — `sibling-parity.test.ts` enforces the bundle↔metadata pairing.
4. Prefer **client transport** (`bootstrapIntegrationClient`) unless it's a documented server-only exception.
5. Self-clean any fixtures; tag them `(mj-integration-test — safe to delete)`.

## Run

Single entry path: `mj test`. **Seed the metadata once per environment first** (`npx mj sync push --dir=metadata-optional/integration-test`).

```bash
# whole deterministic tier (others gated)
npm run test:integration          # = MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Deterministic"
# one bundle while iterating
MJ_INTEGRATION_TEST=1 mj test run --name "IT01 - Server RunView Cache Integrity"
```
