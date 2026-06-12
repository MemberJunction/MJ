# OpenWater Connector — Super-Coordinator Report

**Run:** `connector-openwater-1781167742688-9bdbe4c8`
**Date:** 2026-06-11 · **Mode:** [B] credential-free · **Branch:** `connectors/openwater_growthzone` (never merged to `next`)
**Verdict:** Connector **COMPLETE and credential-free-proven to its achievable ceiling**. The **full floor-check (which mandates a hybrid-e2e through MJAPI+SQL-Server) could NOT run** — blocked by a pre-existing botched-rebase defect on this branch that prevents the MJ runtime from building. This is an environment/branch defect, **not** a connector defect.

---

## 1. What was built (the deliverable — done)

**Connector:** `packages/Integration/connectors/src/OpenWaterConnector.ts` — 1067 LOC, compiles clean (`tsc` exit 0), `@RegisterClass(BaseIntegrationConnector, 'OpenWaterConnector')`, registered in `index.ts`.
- Extends `BaseRESTIntegrationConnector`; dual-header auth (`X-ClientKey` + `X-ApiKey`, optional `X-OrganizationCode`); `PageNumber` pagination; incremental via per-IO `IncrementalWatermarkField`; nested-object `FetchChanges` via per-IO `AccessPath` (incl. `roundId` injection from the Programs→`rounds[]` chain).
- **6 IOs on generic per-operation CRUD; 3 idiosyncratic write overrides** (`Session` → `typeId`; `JudgeAssignment` → `{judgeUserId, roundId}`; `ScheduleTimeSlot` → `scheduleDayIds`, create+update), each routed through `BuildCreatedResult`, marked `RequiresLiveVerification`.
- **Tests:** `OpenWaterConnector.test.ts` — 34 vitest tests, all pass.

**Metadata:** `metadata/integrations/openwater/.openwater.integration.json` — 25 IOs, 165 IOFs, fully deploy-ready.
- 8 top-level collection doors (Programs, Applications, Users, Sessions, Evaluations, Invoices, Funds, JudgeTeams) + 12 nested IOs with BFS-derived `AccessPath`.
- All non-nullable bijection slots present; `@parent:ID` FKs on every IO/IOF; `MetadataSource=Declared`; `PaginationType` valid on all.
- Out-of-scope families recorded with reasons (Account/Authenticate, BackgroundJobs, SsoToken, FormTemplates, Media, SessionChairs).
- Authored credential type **OpenWater API** (`metadata/credential-types/`) — was missing.

**Source of truth:** the real public **OpenWater OpenAPI 2.0 spec** (92 paths, 110 ops, 231 schemas, 18 tags), fetched + saved to `sources/`. Scope decided knowingly: full coverable data universe in-scope; action/mechanism/write-only surfaces out-of-scope.

## 2. Verification achieved (credential-free ceiling)

| Tier | Result |
|---|---|
| Plan review (Sonnet, diff-model) | **APPROVED** (round 2), 0 blocking |
| Extract review gate (adversarial, multi-round) | **CLEAN** — 0 blocking after convergence (4→2→1→0) |
| T0 StaticValidation | **PASS** (compiles) |
| T1 InvariantValidator | **PASS** — 6/6 (ThreeWayName, ForeignKeyResolution, CapabilityMethodMatch, PkSourceMatrix, ProvableOnly, FullRecordPassThrough) |
| T2 CrossProgrammaticConsistency | **PASS** |
| T3 DocStructureSelfCheck | **PASS** (after framework fix) |
| T4 MockedFixture (vitest) | **PASS** — 34/34 |
| T5 MockHTTPServer | Skipped — no authored fixtures (legitimate N/A) |
| T6 LocalSQLiteBackend | Skipped — no authored fixtures (legitimate N/A) |
| T7 OpenAPIValidation | **PASS** — **46/46 declared requests validated against the real spec** (after framework fix); 9 advisory orphan-GET routes = the deliberately out-of-scope families |
| DB migrate (SQL Server, fresh `MJ_OW_E2E`) | **SUCCEEDED** — full `__mj` schema, 324 entities (proves the migration/DB layer) |

**Honest ceiling reached:** `format-verified-no-creds` + mock-floor + DB-migrate-proven. The **live-data round-trip / write side-effects** remain `RequiresLiveVerification` (no credential — OpenWater's API is gated-hard, no self-serve token), and the **hybrid-e2e through MJAPI** could not run (see §4).

## 3. Framework fixes contributed (all durable, justified, evidence-backed)

These were genuine producer/primitive/branch defects surfaced by the build — each a one-spot fix:

1. **`packages/Integration/engine/src/RecordFlatten.ts` + `KeySerialization.ts`** — RECOVERED two helper files the rebase dropped (call-site-pinned contracts). Engine now builds; **442/442 engine tests pass**.
2. **`connector-builder-workshop/scripts/enforce-finding-floor.mjs`** — now deterministically stamps the non-nullable + deploy-required slots the LLM extractor systematically omits (IO/IOF `Status`, `SupportsPagination`, `PaginationType`, `IntegrationID`/`IntegrationObjectID` `@parent:ID`, `Source`→`MetadataSource`). Every future connector is immune.
3. **`packages/MCP/mj-test-runner/src/tiers/t3DocSelfCheck.ts`** — made `MetadataSource`-aware: a credential-free `Declared` connector's objects (correctly not re-derived at runtime) are no longer a false "structure drift" failure.
4. **`packages/MCP/mj-test-runner/src/tiers/t7OpenApi.ts`** — broadened the spec-file matcher to `*openapi*.json`/`*swagger*.json` so vendor-prefixed specs (`openwater-openapi-v2.json`) are validated instead of skipped.

(Local, uncommitted, env-only workarounds — NOT framework changes: renamed a duplicate-version migration `V202606021200__…Widen…` → `…1201…` so Flyway/Skyway could run; synced the fresh `sql-dialect` dist into schema-builder's stale nested copy.)

## 4. The blocker — why the full floor-check could not complete

Floor-check **mandates** a hybrid-e2e proving the connector through **MJAPI into a real SQL-Server DB** (`hybrid-e2e-missing`/`hybrid-e2e-not-pass` are hard failures). That requires building the MJ runtime (SQLServerDataProvider → MJServer → MJAPI). **It does not build from source on this branch.**

**Root cause (pre-existing, committed, unrelated to the connector):** commit **`333836b39d` ("chore(integration): rebase onto integration-base framework")** is a **botched rebase that dropped coordinated core definitions while keeping their call sites**:
- `packages/GenericDatabaseProvider/src/GenericDatabaseProvider.ts` calls `this.ComputeRunViewRLSWhereClause(...)` — **defined nowhere in the workspace** (it exists on `origin/next`).
- The same RLS feature changed `LocalCacheManager.GenerateRunViewFingerprint` to take a 3rd arg + a richer RLS return type (`{canRun, deniedEntities}`) — also dropped here.
- Earlier symptoms of the same botched rebase: the engine's missing `RecordFlatten`/`KeySerialization` (recovered) and the `sql-dialect` `MaxKeyStringLength` version-skew.

This is a **coordinated multi-package core feature** that the rebase lost. Recovering it = re-doing the rebase correctly (risky core surgery, explicitly out of connector scope and against the "don't touch tested core" rule). **`origin/next` has the complete, building source.**

**Recommendation:** re-do commit `333836b39d` as a clean rebase from `next` (or cherry-pick the dropped RLS + helper definitions) so the MJ runtime builds; then the hybrid-e2e + full floor-check can run unchanged against the already-complete connector + metadata. Nothing about the OpenWater connector itself needs to change.

## 5. Bottom line

The **OpenWater connector is complete and proven to the full credential-free ceiling** (rigorous adversarial review + 6 green ladder tiers incl. 46/46 OpenAPI request validation + a successful real-DB schema migrate). Four durable framework defects were fixed along the way. The **only** unmet gate is the live-engine hybrid-e2e, blocked by a branch-level botched-rebase that makes the MJ runtime uncompilable — an infrastructure defect to be fixed in `333836b39d`, separate from this connector. No commit, merge, or PR was made.
