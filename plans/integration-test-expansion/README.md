# Integration Test Expansion — Strategic Plan

**Status:** DRAFT for review (2026-07-18) · Owner: Amith + Claude · Branch: `an-dev-34` (omnibus quality PR #3181)

> Goal: grow MemberJunction's **headless, deterministic integration tier** from ~152 checks in 24 bundles to **300+ checks** that adversarially exercise the real server stack — the fast/cheap/deterministic layer that sits below the AI-driven Computer-Use UI regression suite. This document is the prioritized roadmap; the full enumerated candidate list is in **[test-catalog.md](test-catalog.md)**, and every defect the audit surfaced — made fix-ready with a disposition — is in **[bug-register.md](bug-register.md)**.

---

## 1. Why now / what this layer is

MJ has **three test worlds** and they must not be conflated:

| Layer | What | Where | In CI? |
|---|---|---|---|
| **Unit** | Mocked, in-memory, per-function | 1,827 `*.test.ts` / ~295 vitest configs | Yes (affected via turbo) — but **~40 real suites are disabled** (see §7) |
| **Integration** (THIS PLAN) | Real DB + real providers/engines, no mocks, no browser; deterministic tier = no LLM | `packages/TestingFramework/testing-integration` (~152 checks / 24 bundles) | Deterministic tier only, per-PR |
| **UI Regression** | AI Computer-Use driving the real browser/Explorer | `metadata/tests/regression/T01–T25` (25 tests) | **No** — Docker-only, manual |

The integration tier is the **highest-leverage place to add coverage**: it catches the **seams between packages** that unit tests mock away, at a fraction of the cost/latency/flakiness of the UI suite. It's where the real bug classes live (cache invalidation, RLS leakage, transaction rollback, provider SQL generation, permission gating, cost accounting, class resolution).

## 2. The breadth/coverage mismatch (the case for expansion)

- **283 packages** across **72 non-UI package families**; **379 generated entities**; ~40 `@RegisterClass(BaseEntity, …)` server subclasses each encoding real invariants.
- Current **152 checks are heavily lopsided**: 58 (38%) are cache-integrity; another 37 cluster on two recent features (ai-skills 21, user-routines 16). Broad swaths have **zero** integration coverage.
- **Entirely uncovered families:** MetadataSync, CodeGenLib, the whole metadata↔DB consistency surface, Communication, Templates, PermissionEngine (the unified permissions headline feature), TransactionGroup-over-wire, magic links, subscriptions/pub-sub isolation, RLS-on-write, ClassFactory server-subclass resolution, provider SQL generation (record-changes, virtual-field capture, datetimeoffset), PostgreSQL parity (zero PG bundles), and the AI stack's deterministic seams (cost accounting, memory guards, permission hierarchy, persisted embeddings).

## 3. Design principles (adversarial QA lens)

1. **Client-first transport — test over the GraphQL wire (GOVERNING DECISION).** Integration checks should exercise the real stack **through the client layer** — `GraphQLDataProvider` and the other non-visual client-side objects in `@memberjunction/graphql-dataprovider` (NOT the Angular UI) — against a running MJAPI. Driving BaseEntity CRUD, `RunView`/`RunViews`/`RunQuery`, and Remote Operations over the actual GraphQL wire exercises serialization, the resolver auth/scope layer, field mapping, and transport framing — where a large class of real bugs lives that pure in-process server calls never touch. **Server-side in-process invocation is the exception, used only where there is genuinely no client surface** (see §3a). This flips the current default (20 server / 3 client → client-first). It requires MJAPI running for the integration lane (§4 A8).
2. **Deterministic-first.** A check earns a spot in the blocking CI gate only if it's read-only or self-cleaning, needs no LLM, and no external network. Everything below is triaged onto **deterministic** / **mutation** / **live-model** tiers accordingly.
3. **Attack invariants, not happy paths.** Every candidate targets a specific way an adversary (or a regression) breaks a documented contract — boundary conditions (`> ` vs `>=`), exact-threshold breakers, deny-precedence, last-write-wins, skip-as-pass, cross-user leakage.
4. **Regression-anchored.** Prioritize seams with a recent fix history (they break repeatedly): virtual-field capture order (#3102/#3107), PG casing/multi-word PK (#3112), dedup/linger invalidation, embedding dimensions, CodeGen determinism.
5. **Exploit the deterministic levers.** Two force-multipliers make "needs an LLM" seams testable deterministically: a **stand-in `@RegisterClass(BaseLLM,…)` scripted driver** (converts the live-only "agent step reaches terminal" invariant into a CI-gated check) and **LocalEmbeddings** (credential-free vectors). Use them aggressively.
6. **Don't duplicate the UI suite.** Stay at provider/engine/remote-op/cache/RLS/permission seams; never re-drive the browser.
7. **Push improvements to the generic level.** Harness gaps (Skipped status, per-bundle cache scoping) are fixed once in the framework, benefiting every future check.

### 3a. Transport doctrine — client-first, with narrow server-side exceptions

**The rule:** *if a capability has a client surface (a resolver, or a Remote Operation the client can invoke), test it over the wire via `GraphQLDataProvider`. Fall back to in-process server invocation ONLY when no such surface exists — and when it doesn't, the preferred fix is usually to add a Remote Operation, not to test server-side.*

- **Client surface = almost everything.** `GraphQLDataProvider implements IMetadataProvider` (`graphQLDataProvider.ts:166`), so `md.GetEntityObject(...).Save()/Delete()`, `RunView`/`RunViews`/`RunQuery`, and `BaseRemotableOperation` invocations all marshal over GraphQL. Entity-server invariants (e.g. `MJTagEntityServer` `IsGlobal⊕TagScope`) are **better** tested client-side: saving over the wire proves the resolver dispatches to the right server subclass AND that the validation error round-trips to the client — coverage a direct in-process `Save()` cannot provide.
- **Prefer a Remote Operation over a server-side fallback — but exposing capability client-side is a security decision (AI + HUMAN sign-off).** When a capability the browser can't yet reach needs coverage (e.g. a schema audit, an engine method), the MJ-idiomatic move — per the [Remote Operations](../../guides/REMOTE_OPERATIONS_GUIDE.md) and [Transport-Layer](../../guides/TRANSPORT_LAYER_ARCHITECTURE_GUIDE.md) guides — is to expose it as a typed Remote Operation, then invoke it client-side. This makes the capability wire-testable *and* available to agents/workflows, so "no client path" is often a signal to **build** one. **BUT this has limits:** adding a remote op widens the client-reachable attack surface, and some capabilities (privileged/system-only operations, raw SQL, schema mutation, anything security- or data-integrity-sensitive) we may deliberately choose to **keep off the client**. Therefore: **whenever building a remote op purely to enable a test, treat "should this be client-exposable at all?" as an explicit AI-proposes / human-approves decision — never auto-add one for a sensitive capability.** When exposure is declined, that check stays a §3a server-in-process exception (or co-hosted), and the reason is recorded. Every remote op added for testing must still carry proper auth/scope gating (it is a real production surface, not a test-only backdoor).
- **Legitimately server-side-only (in-process) checks** — the narrow exceptions where the wire adds no value or can't observe the thing:
  - **Server-cache instrumentation** (counting the *server's* `LocalCacheManager` reads via the instrumented storage). The wire hides this; the client cache is a separate, client-observable thing (already covered client-side by the `client-cache` bundle).
  - **Internal provider-SQL shape assertions** (e.g. the `@ResultTable` base-before-virtual column ordering) — though the *observable effect* (correct values returned) IS asserted client-side; only the internal SQL-shape probe stays in-process.
  - **Raw catalog/consistency audits** (`sys.objects`/`information_schema`) — no wire protocol worth testing; run in-process OR wrap in a "Schema Audit" Remote Operation to make it client-invocable and agent-reusable (preferred).
- **Topology & MJAPI — integration tests run against a real MJAPI runtime, always.** A design decision (Amith): integration tests must exercise the **real runtime environment**, so **MJAPI is a hard prerequisite for the whole suite**, not just the client bundles. Running server logic in-process against the DB (`bootstrapIntegrationServer`, no MJAPI) is no longer "real enough" — it bypasses the exact server the app runs on. `bootstrapIntegrationClient()` already requires a separately-running MJAPI and fails fast if unreachable (`bootstrap.ts:289,105`). **Open topology question for review (A8):**
  - **(Recommended) Standalone MJAPI + separate test-runner process.** Boot MJAPI as the real server-under-test; the MJ Integration Test suite runs as a **client process** driving it over GraphQL and collecting/monitoring results. This tests the true HTTP/GraphQL boundary exactly as MJExplorer/external clients hit it, keeps a clean client/server separation, and matches the Docker regression stack's shape. Server-internal-only observations (the §3a exceptions like server-cache counters) run via a co-hosted helper or a purpose-built remote op.
  - **(Alt) Co-host the suite inside the serving MJAPI process**, driven/monitored from calling code (Amith's "run the suite in the MJAPI instance … monitor from calling code"). Gives direct access to server-internal state (no remote-op needed for cache instrumentation), but muddies the client/server boundary and complicates parallelism; the instrumented-cache-first install must yield to MJAPI's StartupManager (`serverProcessAlreadyClaimed()` already handles this cache-ownership case).
  - Net: **decide standalone-vs-co-host in review.** Either way, MJAPI-is-running becomes universal (A8), and the current no-MJAPI in-process default is retired.
- **Existing tests must be migrated.** 20 of 23 current bundles are server-in-process. Part of this initiative is auditing them and moving each to client transport where a client path exists (Track B / Workstream M), fixing any wire-only issues surfaced in the process.

## 4. Two parallel tracks

Expansion is gated by harness limits. Run **Track A (infrastructure)** and **Track B (new tests)** concurrently, but Track A's P0 items unblock the scale of Track B.

### Track A — Harness hardening (prerequisites for scale)
Ordered by how soon they hurt:

| # | Item | Why it blocks scale | Effort |
|---|---|---|---|
| A1 | **Add a real `Skipped` status** to `DriverExecutionResult.status` + `TestRun`; stop coercing gated/degraded checks to `Passed` | At 300 checks, skip-as-pass makes a green board meaningless (already patched over by a bespoke row-count guard in `integration.yml:166`). **THE priority fix.** | S |
| A2 | **Per-bundle cache-counter scoping** — give each bundle its own instrumented-cache counter/context instead of the process-global singleton (`bootstrap.ts:67`, `instrumented-cache.ts:25`) | Prerequisite for running many bundles in one process AND for any parallelism | M |
| A3 | **Amortize bootstrap** — one owning process runs many bundles sequentially instead of ~5s cold-boot × N `tsx` spawns | Bootstrap time dominates wall-clock at 300 checks | M (needs A2) |
| A4 | **Metadata-driven run manifest** — derive the run set from `IntegrationCheckRegistry.GetBundleNames()` so `run-all.ts` GROUPS, IT01–IT23 metadata, and the registry can't drift (retire `sibling-parity` band-aid) | Three hand-maintained lists guarantee drift as bundles multiply | S |
| A5 | **Mutation-tier CI lane** (gated/scheduled) + **fixture-leak sweep** that fails if a bundle leaves rows | Most new high-value checks are write-path (mutation tier) — pointless if never executed in CI | M |
| A6 | **Sharding** — shard index/count to fan bundles across M runners | Only way 300 checks stay under a PR-gate time budget | M |
| A7 | **Golden-diff + timing gates** — wire `EMIT_OUTCOMES` diff into CI; emit per-bundle timing + slow-check alert | Prevents front-end drift and silent slow-downs | S |
| A8 | **MJAPI in the integration lane** — start MJAPI (+ health-gate) in the CI integration job and as a standard local pre-req; make client transport the default the driver bootstraps | Client-first (§3) mandates a live MJAPI; the lane doesn't start one today (client bundles self-skip). The Docker regression stack already does this — lift that wiring | M |
| A9 | **Client-transport ergonomics** — make it trivial for a bundle to declare client transport (widen `CLIENT_BUNDLES`/`config.transport` to be the default), and give client checks the same instrumented-cache-scoped observability the server ones have | Lowers the friction so authors reach for client-first by default, not server | S |

### Track B — New test bundles (the coverage)
Grouped into domains, each a prioritized set of new bundles. **Default transport is client (over GraphQL); server-in-process only per the §3a exceptions.** Full enumeration in **[test-catalog.md](test-catalog.md)**. Summary and priority in §5.

**Workstream M — Existing-test transport migration (runs alongside all phases).** Audit the 20 server-in-process bundles; migrate each to client transport where a client path exists (BaseEntity CRUD, RunView/RunQuery, remote ops all have one), leaving in-process only the §3a exceptions (server-cache instrumentation, internal SQL-shape probes, raw catalog audits). Fix any wire-only defects the migration surfaces (these are exactly the bugs client-first is meant to catch). Track which bundles are migrated vs. legitimately server-only.

## 5. Prioritized roadmap (phases)

Priority = **(security/data-integrity severity) × (coverage gap) × (regression-proneness) ÷ (cost)**. P0 first.

### Phase 0 — Unblock + highest-severity (do first)
- **A1 (Skipped status)**, **A2 (cache scoping)**, **A4 (metadata-driven manifest)** — the harness floor.
- **`transaction-group-scope-bypass`** (SEC, highest severity) — verify/close the API-key-scope bypass on `ExecuteTransactionGroup` (no `ResolverBase`, no scope check → a `view:run`-only key may Create/Update/Delete).
- **`metadata-consistency-audit`** bundle (greenfield, read-only, ~8–15 checks, zero infra) — every entity has view + sps; CHECK values == EntityFieldValue == TS union; FK indexes present; sequences gapless & match view column order (lift `system_integrity.ts:102`). **The single highest value-per-effort addition.**

### Phase 1 — Core integrity + security (deterministic/mutation)
- **Core data write-side:** record-change fidelity, virtual-field save-capture order, keyset completeness + guardrails, linger-invalidation-after-save, RLS-on-write, transaction-group rollback + variable-dependency, ClassFactory server-subclass resolution, UUID case-insensitive FK round-trip, datetimeoffset round-trip, save-clobbers-concurrent-edit (pin the contract).
- **Permissions/security:** permission-engine domain fan-out, scope deny-precedence + app-ceiling, RLS-cache cross-user leak, subscription/pub-sub channel isolation, `@RequireSystemUser` boundary, agent-permission dual-path default.

### Phase 2 — Broad coverage expansion (deterministic + stand-in LLM)
- **AI deterministic seams:** stand-in-LLM harness (foundational), prompt-run cost accounting + parent rollup, AISkill/AIAgent permission hierarchy, memory-write guard pipeline, persisted-embedding pattern (LocalEmbeddings), leakage-guard blocks promotion, provider registration/capability parity, model-selection determinism, HITL pause-side linkage.
- **Actions/processing:** RSP resume-from-cursor (marquee gap), circuit-breaker exact boundary + granularity, budget-gate, maxRecords cap, pause handshake halts live loop, generic WriteBackProcessor dry-run, Action pipeline e2e + log-on-throw + per-action validation contract, entity-action dispatch, scheduled-job double-execution lease race, ConcurrencyMode=Queue orphan probe.
- **Entity-server invariants (the long tail):** Tag IsGlobal⊕Scope + FK sweep, Application slug trio, DuplicateRun threshold + fire-once, Attachment MIME gate ordering, CompanyIntegration transition guard, RemoteOperation ShouldRegenerate + approval-reset (SEC), EntityPermission queue, plus SQLExpressionValidator `xp_`/`sp_` boundary probe.
- **Viewing system (`view-execution`, all client-first):** dynamic + saved view execution over the wire, filter-JSON→SQL compilation + injection-safety, Fields projection (+forced PK), sort/column round-trips, OFFSET + keyset pagination completeness, MaxRows, aggregates-vs-pagination, and the two security invariants — **view ExtraFilter AND-combines with RLS (no leak)** and **per-user view isolation**. Smart-filter WHERE regeneration is the one live-model leg. (Domain 11 — the `ng-entity-viewer` *rendering* stays with the Computer-Use suite; only the `RunViewParams`-in → rows-out data layer is here.)
- **Applications — every shipped app (`app-wiring` + `app-behavioral`):** a parameterized "every active app is wired correctly" bundle over all 25 apps (metadata loads, nav items parse, exactly-one-default, DriverClass non-empty + globally unique, AppEntities/Roles/Settings resolve) plus behavioral checks (Data Explorer default-agent chain, DfNU fan-out = exactly 8 apps, install idempotency, slug uniqueness, Deprecated-app exclusion). **Wiring is currently 0-orphan — value is locking it in + catching 4 latent risks.** One dimension (DriverClass→Angular component) is a **static CI grep gate**, not a wire test (§3a).

### Phase 3 — Specialized + cross-cutting (higher effort)
- **PostgreSQL parity bundle** (needs PG in the harness matrix — the one structural blocker): mirror core CRUD/RunView/composite-PK/casing/type round-trips against `PostgreSQLDataProvider`.
- **OpenApp lifecycle (`openapp-lifecycle`):** install→teardown→reinstall idempotency, `schema.name`→`CanonicalSchemaName` binding, and OpenApp-created apps inheriting the `app-wiring` contract.
- **Magic links** (single-use CAS race, privilege confinement), **OAuth state cross-user 403**, **communication preview-no-send**, **template render injection/validation**, **realtime Loopback session-bridge + janitor**, **experiment orchestrator wave loop**, **MetadataSync pull→push round-trip + atomic rollback**, **CodeGen idempotence/byte-identical** (mutation + git-restore).

### Phase 4 — Live-tier expansion (gated, semantic quality)
Smaller, deliberately gated behind `RUN_AGENT_TESTS` / `PS_INTEGRATION`: real multi-vendor failover, agent reasoning quality, `resumeAgent()` real continuation, sidecar `/train`+`/predict` numeric parity. Also fix the earlier-found **false-green gated-skip** (A1 addresses the root) and the **300s CLI-vs-aggregator deadline divergence** for `agent-runner`.

## 6. Target shape & metrics

| Metric | Now | Target |
|---|---|---|
| Deterministic checks | ~94 | ~220 |
| Mutation-tier checks (in a CI lane) | ~10 (never run in CI) | ~70 (gated lane) |
| Bundles | 24 | ~45 |
| **Client-transport (over-the-wire) bundles** | **3 of 24 (12%)** | **majority — server-in-process only for §3a exceptions** |
| Package families with ≥1 integration check | ~12 | ~35 |
| MJAPI in the integration CI lane | No | Yes (A8) |
| Blocking-gate wall time | ~40s | < 5 min at 3× count (via A3/A6) |
| PG parity bundles | 0 | 1 (core) |

**Definition of done for the initiative:** every P0/P1 bundle green in the deterministic + gated-mutation CI lanes; **the CI integration lane runs MJAPI and the default transport is client/GraphQL**; existing server-only bundles are either migrated to client transport or documented as legitimate §3a exceptions; consistency-audit catches a real drift on introduction; the harness reports `Skipped` honestly; PG parity bundle running (even if PG stays a separate matrix leg).

## 7. Cross-cutting notes & risks

- **Unit-test backlog interaction:** ~40 vitest suites are disabled (`chore/track-test-coverage-backlog`), incl. `Angular/Generic/conversations` (528 `it()` running on nothing), Templates/engine, Communication/base-types. Some integration candidates here (Templates, Communication) would be cheaper as *enabled unit tests* — coordinate so we don't build an integration test for something a disabled unit suite already covers. **Flag for the review discussion.**
- **Bugs the audit surfaced → [bug-register.md](bug-register.md).** 23 defects/anomalies/latent-risks, each with severity + fix approach + a disposition (**FIX-NOW** safe fixes for this PR / **DECIDE** security-or-behavior calls needing your sign-off / **PIN** by-design / **VERIFY** / **GUARD** / **DONE**). The recommended split: land the 5 quick safe fixes (the `since` injection hole, OAuth escaping, the `console.log` leak, seed samples, PG variant) with guarding tests, and bring the 10 sensitive ones (TG scope bypass, subscription/cache-broadcast isolation, queue-orphan, param round-trip, etc.) to you for a decision before touching. Nothing lands silently. In-line examples:  TransactionGroup scope bypass; `ConcurrencyMode=Queue` never terminalizes a run (orphan-Running); ViewID-only linger never invalidated; `ValidateInputs`/`RunSingleFilter` are no-op stubs in ActionEngine; possible `\bXP_\b` word-boundary gap letting `xp_cmdshell` through SQLExpressionValidator; reflected-XSS in OAuth success/error pages. **From the query-catalog sweep:** query parameter metadata is **not round-tripped** into the metadata dotfiles (only the SQL baseline seed has it — a `mj sync push` from metadata would create queries *without* parameters, breaking required-param validation); `ValidationFilters` are parsed then **never enforced** (`queryParameterProcessor.ts:206`); `GetConversationsForMemoryManager`'s `since` param is **raw-interpolated inside quotes** (`'{{ since }}'`, no `sqlString` filter — a genuine injection hole mitigated only by date-typing); `GetConversationArtifactsMap` has **no PostgreSQL variant** (breaks on PG); `CategoryPath` is a **misnomer** (matches the flat category *name*, not the hierarchical path the docs promise); and `QueryResolver` **`console.log`s query Parameters + Results** on every call (data hygiene). Several seeded ExternalChangeDetection `SampleValue`s are non-executable (reference `vwCustomers`/`dbo` that don't exist).
- **Stand-in LLM** must be registered carefully (ClassFactory priority) so it never leaks into non-test runs — scope it to the integration bootstrap.
- **Cost of mutation tier:** write-path checks need airtight self-cleaning + the A5 leak sweep, or they'll pollute the shared dev DB.

## 8. How to review this plan

Suggested discussion order: (1) ratify the **client-first transport doctrine** (§3/§3a) as governing, and accept its corollary that **MJAPI must run in the integration CI lane** (A8) — this is the biggest directional decision and reshapes every bundle; (2) agree the **two-track** shape and that A1/A2/A4/A8 precede mass expansion; (3) confirm **Phase 0** scope (consistency-audit + TG-scope-bypass + harness floor + MJAPI-in-lane) as the first buildable slice; (4) triage **[test-catalog.md](test-catalog.md)** P1/P2 items — cut/keep/re-rank, and confirm the §3a server-only exceptions; (5) decide the **PG-in-harness** question (Phase 3 blocker); (6) decide **unit-vs-integration** placement for Templates/Communication given the disabled-suite backlog. After iteration, green-light Phase 0 as the first PR onto the omnibus branch.
