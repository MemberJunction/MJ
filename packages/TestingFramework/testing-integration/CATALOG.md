# Integration Test Catalog — `@memberjunction/testing-integration`

The **living index** of MemberJunction's headless integration test coverage: what exists, what's planned, and the rules for adding more. Keep this updated as bundles land. The deep design rationale + full candidate enumeration lives in [`plans/integration-test-expansion/`](../../../plans/integration-test-expansion/README.md) ([catalog](../../../plans/integration-test-expansion/test-catalog.md) · [bug register](../../../plans/integration-test-expansion/bug-register.md)).

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

Each bundle keeps two siblings in sync (enforced by `sibling-parity.test.ts`): a `*-tests.ts` dispatcher under [`packages/MJServer/integration-test-scripts/`](../../../packages/MJServer/integration-test-scripts/) and an `.IT##-*.json` metadata Test under [`metadata-optional/integration-test/`](../../../metadata-optional/integration-test/) (the **metadata home** for tests/suites/fixtures — see its README).

| Bundle | Checks | Tier | Transport |
|---|---|---|---|
| server-cache | 32 | det (+mut) | server |
| client-cache | 13 | det (+mut) | **client** |
| runquery-cache | 10 | det | server |
| rls-isolation (+client) | 10 | det | server + **client** |
| ai-skills | 21 | det | server |
| user-routines | 16 | det | server |
| record-process (+facade) | 10 | det | server |
| remote-operations (+wire-progress +ai-authoring) | 11 | det/live | server + **client** |
| predictive-studio | 5 | det | server |
| aggregates-cache / dataset-cache / api-keys / scheduled-jobs / field-rules-bulk-update / lists / open-app-teardown | 19 | det (+mut) | server |
| prompt-runner / agent-runner / concurrent | 4 | live | server |

**~152 checks / 24 bundles today.** Most are `bootstrapIntegrationServer` (in-process) — migrating them to client transport where a client path exists is tracked in the plan (Workstream M).

## Expansion roadmap (the growth target)

Toward a **1000+-factor** suite (checks × entities × apps × queries). Domains from the plan's [test-catalog](../../../plans/integration-test-expansion/test-catalog.md):

- **Domain 0 — Exhaustive RunView + RunQuery** (client-first): RunView matrix swept across all 379 entities; every catalog query run with valid parameter permutations. *(First bundle landing: `runview-matrix-tests.ts` — a client-first RunView sweep.)*
- **1** Metadata↔DB consistency audit · **2** Core write-side & transactions · **3** Security & permissions · **4** AI stack (cost, permissions, memory guards, + the stand-in-LLM harness for deterministic agent-loop coverage) · **5** Actions & background processing · **6** Entity-server invariants · **7** Communication/Templates · **8** PostgreSQL parity · **9** Metadata tooling · **10** Realtime/PS · **11** Viewing system · **12** All shipped apps.

Target: ~355 authored checks → many-thousand effective assertions (the parameterized sweeps dominate).

## Adding a bundle

1. Author `src/checks/<bundle>.checks.ts` — `NamedCheck` fns (`{ Id, Name, Fn(ctx), RequiresMutation?, RequiresLiveModel? }`), throw-on-fail, register into `IntegrationCheckRegistry.Instance`.
2. Export it from `src/index.ts` (the barrel — registers on load).
3. Create BOTH siblings (dispatcher + `.IT##` metadata) so `sibling-parity.test.ts` passes — see the [integration-scripts README](../../../packages/MJServer/integration-test-scripts/README.md) and CLAUDE.md.
4. Prefer **client transport** (`bootstrapIntegrationClient`) unless it's a documented server-only exception.
5. Self-clean any fixtures; tag them `(mj-integration-test — safe to delete)`.

## Run

```bash
# whole aggregator (deterministic tier; others gated)
npm run test:integration
# via the CLI / metadata driver (needs the optional metadata seeded + MJAPI)
MJ_INTEGRATION_TEST=1 mj test suite --name "Integration Tests — Deterministic"
```
