# Integration PR-1 — Full Scope & Status Tracker

Canonical mapping of **every** requirement in `plan.md` to its status. This is the
"is plan.md totally scoped out?" tracker. Branch: `feat/integration-framework-expansion`
(canon branch; **not** merged to next). Companion docs:
[redesign](integration-framework-redesign.md) · [phase-0](integration-phase-0-pr1.md) ·
[roadmap](integration-pr-roadmap.md) · [agentic](integration-agentic-local.md) ·
[ddl-schema](integration-ddl-schema-management.md).

Status legend: **DONE** (shipped this branch) · **PRE-EXISTING** (was already on the branch) ·
**PARTIAL** · **DEFERRED** (scoped, intentionally not in PR-1, reason given) ·
**MIGRATION** (gated on a migration the user authors) · **AGENT-BRANCH** (lives on
`agentic/connector-builder`/`connector-improvement`) · **OPEN** (needs a decision/spec).

---

## 1. Postgres parity — the imperative "unblock integrations" core

| # | Item | Status | Evidence |
|---|------|--------|----------|
| Bug 1 | `ALTER…TYPE`/`SET DATA TYPE` mis-quoted by auto-quoter | **DONE** | uppercase-only case-sensitive keyword set, regression-safe for `Type`/`Data` columns; +6 tests. commit `9bb9b0b3be` |
| Bug 2 | soft-PK/FK skipped for brand-new RSU entities | **DONE** | `applySoftPKFKConfigAndRefresh` runs in zero-resolved branch. `9bb9b0b3be` |
| Bug 3 | `= 1` on boolean columns | **DONE** | `boolLit(true)` at 3 sites. `9bb9b0b3be` |
| Bug 4 | unquoted `__mj_UpdatedAt` | **DONE** | `qi()`-wrapped at 3 sites (incl. one the seed list missed). `9bb9b0b3be` |
| Bug 5b | `ALTER…TYPE` missing `USING` cast | **DONE** | `USING <col>::<newtype>` in both ALTER generators; +2 tests. `9bb9b0b3be` |
| Bug 6 | runtime ↔ codegen SP schema mismatch | **DONE** | runtime CRUD calls `entity.EntityInfo.SchemaName`. `9bb9b0b3be` |
| adv-gen | AI-init crash on AI-less boxes | **DONE** | try/catch disables advanced gen for the run. `9bb9b0b3be` |
| Bug 5a | `ALTER…TYPE` blocked by dependent views | **DEFERRED** | Only fires on **column-type evolution** (clean baseline never hits it). Fix blocked by a package boundary: the injected DDL provider is a runtime `PostgreSQLDataProvider`; `viewDependencyCapture` lives in CodeGenLib under a different hierarchy → needs a **shared-utility refactor PR** + guarded `ExecuteMigrationSQL` hook. Full plan in memory `project_pg_bug5a_dependent_views`. |
| Hunt | "every possible Postgres problem" sweep | **DONE** | 6-agent exhaustive hunt across codegen/dialect/provider/engine/schema/connectors. Extra findings (`SyncEnabled=1`, `[brackets]`) were **false positives** already handled by `TransformExternalSQLClause`/`coerceBooleanLiteralsInSQL`/`quoteIdentifiersInSQL`; "fixing" them would have broken SQL Server. No new real blockers. |

**Contract checks (plan §"contract we need to hold true"):** Full PG parity ✅ · schema-aware throughout ✅ (Bug 6) · headless + AI-optional ✅ (adv-gen) · idempotent+recoverable ✅ (see §3) · self-contained PK ✅ (Bug 2).

---

## 2. Structured logging / artifacts over GraphQL — "crucial" (multi-tenant)

| Item | Status | Evidence |
|------|--------|----------|
| Sync runs emit durable, restart-surviving, **growing** JSONL artifacts | **DONE** | `IntegrationEngine.RunSync` builds an `IntegrationProgressEmitter` (runID == `CompanyIntegrationRun.ID`); `SyncLogger` forwards (stage/batch/error granularity, best-effort). commit `5f86890cda` |
| GraphQL: list / get / **tail** runs | **DONE** | `IntegrationListRuns`, `IntegrationGetRun`, `IntegrationTailRunEvents(runID, sinceSeq)` (poll the growing stream). `5f86890cda` |
| Connector-creation/RSU runs already emit artifacts | **PRE-EXISTING** | `IntegrationConnectorCreationPipeline` + `IntegrationProgressEmitter`; now queryable via the same readers. |
| True GraphQL **subscription** (vs. poll-tail) | **DEFERRED (optional)** | Poll-tail with `sinceSeq` satisfies "grows over time / read"; a live `@Subscription IntegrationRunProgress(runID)` is a thin add on the existing reader if a push channel is wanted later. |

---

## 3. Framework requirements (plan §C)

| Ref | Requirement | Status | Notes |
|-----|-------------|--------|-------|
| C1 | 4 `__mj_integration_*` mirror columns + snapshot ancestor | **PRE-EXISTING** | SyncStatus/LastSyncedAt/LastSyncedSnapshot/SyncMessage. |
| C1 | **ContentHash** (no-watermark change detection) | **DONE** | `__mj_integration_ContentHash` + `computeContentHash` + batch-prefetch load-skip; +10 tests. commit `33e8854a58` |
| C1 | Full §2.5 ledger: ExternalVersion/ETag (OCC), LastSeenModifiedValue, LastReconciledAt, LastWriterDirection, IsTombstoned/DeletedDetectedAt | **DEFERRED** | Additional `__mj_integration_*` columns + engine usage. Same migration-gated shape as ContentHash. **Scope:** add columns via SchemaBuilder/Evolution (no hand migration for connector tables); engine writes ETag on fetch (OCC guard on push), tombstone on delete-detect, LastWriterDirection on combine. Sequence after PR-1. |
| C2 | 3-tier metadata (Declared/Discovered/Custom) + MetadataSource enum | **PRE-EXISTING** | `IntegrationSchemaSync` overlay (static-constraints-win / runtime-type-wins / no-fabrication). |
| C3 | **Template formalization / multi-level FK-DAG traversal** | **DONE** | `BaseRESTIntegrationConnector.FetchWithTemplateVars` generalized from single-level to a recursive descent over ALL template vars: each layer's records are pruned to the **valid subset of the combinations of every prior layer** (one AND-filter per FK to any prior-layer parent; no FK ⇒ that axis is unconstrained/cartesian — the user's "syncs run on a subset of combinations of tables from ALL prior layers"). Cycle detection bails with the offending edge named. Single-var paths behave exactly as before. +2 tests (FK-pruned combination set + cycle skip). Engine-only, no migration. |
| C4 | 3-way combine / conflict / soft-delete | **PRE-EXISTING (mostly)** | combine + DestWins/SourceWins/Manual + soft-delete(Archived) + orphan-detection on full sync. |
| C4 | `MostRecent` conflict policy (real timestamp compare) | **DONE** | `computePushCombine` now compares the MJ row's `__mj_UpdatedAt` against the external record's `ModifiedAt` (record-level recency, computed once, applied to all conflicting fields); newer side wins, ties → MJ. Indeterminate (missing/unparseable stamp) falls back to DestWins so a conflict is never dropped. Pure comparison extracted to `ConflictRecency.ts`; +9 tests. Conflict log records the actual winner. Engine-only, no migration. |
| C4 | Delete detection on **incremental** (not just full) | **PARTIAL → SCOPE** | Orphan detection guarded to clean full fetch. **Scope:** tombstone-based delete detection (needs IsTombstoned from C1 ledger) OR periodic full-reconcile cadence. Couple with C1 ledger. |
| C5 | watermark-first incremental · pagination · rate-limit · opt-in parallelism | **PRE-EXISTING** | + ContentHash (C1) for the no-watermark case. |
| C5 | Vendor object-level **batch read/write** (HubSpot batch-read, SF composite as default) | **DEFERRED** | Per-connector capability. **Scope:** add batch-read/write to BaseREST driven by IO batch metadata; opt-in per connector. Fits the per-connector PRs. |
| C6 | Provability (provable→hard / uncertain→soft / never NVARCHAR(MAX) default) | **AGENT-BRANCH + PRE-EXISTING** | Schema-builder never defaults to MAX; the provability rubric is the agent framework's. |
| C7 | Generic CRUD action canonical + selective strong-typed; retire BizApps CRUD | **PARTIAL** | `ActionMetadataGenerator` + generic CRUD + custom-object action gen exist. **Scope:** retire the per-record BizApps CRUD actions (dedup) — confirm before deleting. |
| C8 | `EnrichSchemaConstraints` (DBAutoDoc-lite) + retire connector-validator | **PARTIAL → SCOPE** | Package scaffolded, wiring incomplete (per state map). **Scope:** finish `Enrich()` (deterministic PK/FK detectors + one-shot LLM descriptions, AI-optional), RSU applies; keep validator invariants as an agent rubric. |
| C9 | GL/facade abstraction (per-company member tables) | **DEFERRED (own PR)** | Explicitly out of scope per plan. |
| keystone | unique index on RecordMap `(CompanyIntegrationID, EntityID, ExternalSystemRecordID)` | **MIGRATION** | Engine already does app-level upsert-by-identity (`SaveRecordMap`); index is a DB race-guard on a core `__mj` table = user migration. DDL in memory `project_watermark_hash_identity_index`. |
| — | idempotency (re-run Apply / partial failure / re-sync) | **DONE** | dirty-flag skip + ContentHash skip + per-batch transactions + record-map upsert. Minor open: pipeline-level migration-file dedup (re-submitting a migration re-commits) — documented, low priority. |
| — | refresh-metadata method | **PRE-EXISTING** | `IntegrationRefreshConnectorSchema` mutation. |
| — | clean MJ-idiomatic code (no non-MJ generalizations) | **DONE** | dialect helpers (`boolLit`/`qi`/`qs`), `BaseEntity`, `RunView`; no `any`. |

---

## 4. Existing connectors — "fit to framework, no regressions, leave no gaps"

| Item | Status | Notes |
|------|--------|-------|
| All 25 connectors compile against the re-tooled framework | **DONE** | connectors package builds clean after every framework change this session. |
| No regressions | **DONE** | engine 274 + schema-builder 96 + provider/codegen/dialect suites green. |
| Expand stub connectors (Betty, Wicket, ConstantContact, IMIS, Mailchimp, NetSuite, …) | **DEFERRED → connector PRs** | Per roadmap, PR-1 re-tools the framework; expansion is the daily paired PRs (ride the agent architecture). |

---

## 5. Agent framework — "optimal for completeness/correctness/fullness/provability"

| Item | Status | Notes |
|------|--------|-------|
| Multi-phase pipeline, locked primitives, provability ladders, floor-check, testing-without-creds, credential guard | **AGENT-BRANCH** | Fully built on `agentic/connector-builder` + `connector-improvement` (10 agents, all primitives, planner/reviewer, spec-digest, escalation). **Reference, do NOT rebuild in PR-1.** memory `project_integration_agent_branches`. |
| "Fill in blanks vs. figure out standard stuff" / common API motifs (e.g. don't assume per-column PK when vendor specifies PK once) | **AGENT-BRANCH** | identity-establisher (vendor-wide PK convention) + ioiof-extractor rungs already encode this. |

---

## 6. The 3 PRs (plan §"Finally")

| PR | Scope | Status |
|----|-------|--------|
| **PR 1** | framework + full Postgres parity + structured logging (this branch) | **substantially DONE this session** (see §1–3); remaining PR-1-eligible follow-ups: C3 templates, MostRecent, EnrichSchemaConstraints — see Open Work below |
| **PR 2** | `[AMS Connector] — Fonteva (new) + GrowthZone expansion`, via agent architecture | **DEFERRED** — needs GrowthZone creds + credential-isolation mechanism + multi-hour agent run |
| **PR 3** | `[LMS Connector] — Path LMS (new) + Reach360 expansion`, via agent architecture | **DEFERRED** — Reach360 chosen as the LMS-themed expansion; needs creds + isolation + agent run |
| all | "next is latest per pr" | **OPEN** — branch is ~108 commits behind `origin/next`; merge-up at PR finalization (needs go-ahead; potential conflicts) |

---

## 7. OPEN — needs your decision / input

1. **MJExplorer Integration App UI redesign** — `plan.md` §"Some more on the MJExplorer" has an empty `Specification:`. **Awaiting your spec** (you're adding it). Once in, I'll scope it as its own work item (likely its own PR/commit, Explorer-side, follows the dashboard/page-chrome conventions).
2. **Credential-isolation mechanism** (PRs 2 & 3) — agents must use creds by env-var NAME but be physically unable to read the VALUE. Earlier answer was "idk" → needs a decision (deny-rules + out-of-band runner vs. Docker isolation). Settle before PR 2/3.
3. **§2.5 full ledger (C1), batch read/write (C5), BizApps CRUD retirement (C7)** — confirm whether these belong in PR-1 follow-ups or later PRs.
4. **Pre-existing `c4cfb3339e` WIP commit** (generated CodeGen output) is on the branch/remote — rework/squash, or leave?

---

## 8. Suggested PR-1 follow-up commits (no migration, engine-only, testable) — pending your go-ahead

- **C3**: multi-level FK-DAG template traversal in `BaseRESTIntegrationConnector` (+ cycle detection).
- **C4**: `MostRecent` conflict real timestamp-compare.
- **C8**: finish `EnrichSchemaConstraints.Enrich()` (AI-optional one-shot).

These are the remaining items that are genuinely PR-1-shaped (framework, no migration, low blast radius). C1-full-ledger / C5-batch / identity-index are migration-gated or per-connector and sequenced after.
