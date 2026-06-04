---
description: Conventions for connector test files.
applies_to: connectors-registry/**/src/__tests__/*.test.ts
---

# Connector test conventions

Applies to vitest test files under `packages/Integration/connectors-registry/<vendor>/src/__tests__/`. These tests are consumed by tiers T4 (mocked fixture) + T5 (mock HTTP server) of the verification ladder.

## Framework

- Vitest (the MJ standard; not Jest).
- Imports: `import { describe, it, expect, vi, beforeEach } from 'vitest';`
- All credential-required cases run via `mj-test-runner` MCP at T10 — NOT in these vitest files.

## Test structure

- One test file per connector (`<Name>Connector.test.ts`).
- Group tests by lifecycle phase: `describe('TestConnection', ...)`, `describe('DiscoverObjects', ...)`, `describe('FetchChanges', ...)`, etc.
- Use real fixtures from `__tests__/fixtures/` — canonical vendor response samples copied from real responses with all PII scrubbed via `scrub-fixture`. PROVENANCE.json entries cite the source URL.

## What to test

- **TestConnection** — happy path + auth failure path + network-error path + (if applicable) scope-missing path.
- **DiscoverObjects** — at least one IO present + capability flags (`SupportsCreate`/`SupportsUpdate`/`SupportsDelete`/`SupportsRead`) match the IO metadata.
- **DiscoverFields** — at least one IOF per known IO; `IsPrimaryKey` set only where the source declares a PK (per the Phase 0 B-fix), not inferred from `IsUniqueKey`.
- **Generic CRUD via per-operation IO columns** (v5.39.x — required when capability flag is true):
  - `CreateRecord` — happy path (URL templated from `CreateAPIPath` + record; method = `CreateMethod`; body shaped per `CreateBodyShape`/`CreateBodyKey`; ID extracted per `CreateIDLocation`) + filters out `IsReadOnly` fields + applies `FieldMappingMJName` if set.
  - `UpdateRecord` — same as Create + honors `If-Match` ETag when the IO declares one.
  - `DeleteRecord` — happy path + soft-delete pattern if applicable; ID location per `DeleteIDLocation`.
  - `GetRecord` — happy path + 404 path.
  - `SearchRecords` — filter syntax per vendor + pagination.
  - `ListRecords` — pagination + `NextCursor` surfacing.
- **FetchChanges (incremental)** for every IO with `SupportsIncrementalSync=true`:
  - First sync: no watermark → full fetch + max-watermark persisted (reads from `IncrementalWatermarkField`).
  - Subsequent sync: watermark → incremental query param added + new max persisted.
  - Out-of-order batch: tracks max-seen, not most-recent.
  - Partial failure: watermark NOT updated; next call resumes from old value.
  - Format-mismatch: ValidateWatermark rejects.
- **State recovery** — mid-fetch failure leaves watermark unchanged; idempotent Create with same key returns same vendor result.
- **OnUninstall** — revoke succeeds + tolerates failure.
- **NormalizeResponse** — envelope unwrapping for wrapped + direct shapes.
- **ExtractPaginationInfo** — every supported `PaginationType` the connector declares.
- **TransformRecord** (v5.39.x hook) — when overridden, both happy + null-input paths. Default identity does not need a test.
- **Per-tenant overrides** — `BatchSizeOverride`, `ExcludedIOs`, `FieldMappingOverrides`, `WatermarkResetIOs` respected.
- **Multi-tenant** — two `CompanyIntegration` contexts don't cross-contaminate state (per the "global provider" guidance in CLAUDE.md — connectors must respect their bound provider).

## Mocking

- Mock `companyIntegration.Configuration` as a string (post-§2.3, code reads the typed property directly).
- Mock HTTP via a test subclass that overrides `LoadMetadata`, `Authenticate`, `MakeHTTPRequest` — captures the call args (URL/method/headers/body) and returns canned responses. Read whichever existing connector's `__tests__/<Name>Connector.test.ts` exercises the same protocol family for the canonical `Mocked<Name>Connector` pattern.
- For T10 live tests, do NOT mock — those run via the `mj-test-runner` MCP with real credentials.

## PII safety in fixtures (Gap 7)

- Fixtures derived from real vendor responses MUST run through `scrub-fixture` before commit:
  - Names → `<scrubbed-name-N>`
  - Emails → `example+N@example.com`
  - Phones → `555-01XX` test-range
  - Addresses → `123 Test St, Example, XX 00000`
  - Dates → randomized in `2026-01-01` to `2026-12-31`
  - IDs (ExternalIDs) → kept (needed for FK relationship verification)
  - Free-text → `<redacted>` when no safe substitution
- Run-directory test data under `connectors-registry/<vendor>/runs/<runID>/test-data/` is wiped before PR open. Presence of unscrubbed test data at PR-open time is a floor-check failure.

## Live e2e harness (T10/T11) — separate from the vitest files; the HubSpot framework is the template

The vitest files above are the credential-free mocked tiers (T4/T5). The **live** tier is a separate artifact: a connector-specific e2e harness modeled on the reference framework at `packages/Integration/connectors/test/` — `gql-live-harness.mjs` (orchestration), `gql-live-adapters.mjs` (the fetch/DB/vendor adapters), `plans.mjs` (the named read-only + write plans), run through `credential-broker.mjs`. It is NOT a vitest file and does NOT hit the vendor directly from test code; it drives the connector **through the MJ GraphQL API** (`IntegrationCreateConnection` → discover → `CreateEntityMaps`/`FieldMaps` → `ApplyAll` → `StartSync` → `IntegrationTailRunEvents`/`GetRun` → teardown) exactly as a real client would.

Author one per connector, covering only the subset of the capability matrix the connector supports (pull-only → no push/bidirectional plans; no incremental signal → content-hash/keyset cells instead of watermark). It must:
- **Assert outcomes, never `Status='Success'`** — ground-truth counts vs MJ rowcounts, every second-layer/association table `> 0` when its upstream has data, and read the structured `SyncWarning`s.
- **Run on BOTH SQL Server and Postgres** — Postgres is a first-class axis; UUID comparisons go through `UUIDsEqual` (SQL Server upper- vs Postgres lower-case).
- **Tag + clean up** — every created record carries `mj_test_run=<runID>`; teardown deletes exactly those in a `finally`, and the result reports `cleanup:{created,deleted,remaining:0}`. Never touch users/owners or pre-existing data.
- **Support token-free reference mode** — run against a pre-seeded `companyIntegrationID` with no secret declared (completeness checked via the internal record-map 1:1).
- **Emit dual NLP + JSON results** per cell (a plain-English statement of what was proven + the scrubbed `IntegrationGetRun` payload / DB counts / `progress.jsonl` evidence).

### The ordered §1→§7 phase skeleton — the authoring spec (FIXED order, enforced by `floor-check`)

Every per-connector harness MUST follow the canonical **"Integration Major Enhancement — Test Plan" §1→§7** phase order, declared machine-readably in `packages/Integration/connector-builder-workshop/floor/phase0-slots.json` under `e2eLivePhases`. The HubSpot framework at `packages/Integration/connectors/test/` is the reference implementation of this skeleton. This is the authoring contract; `floor-check` rejects any T10/T11 run that skips, reorders, or leaves a phase unevidenced (see the rule list below). Author phases in this exact order:

| `order` | `phaseId` | Phase | What the harness runs |
|---|---|---|---|
| 0 | `E2E.Env` | §1 Env bring-up | empty DB → `mj migrate` → `mj sync push` → `mj codegen` (in order) → build+start mjapi/mjexplorer → obtain GQL key without exposing it (§0) → create initial Company |
| 1 | `E2E.PhaseA` | §2 Integration & Metadata | create `CompanyIntegration` → link credential + connection-test (broker) → `RefreshMetadata` (all custom tables/columns/absent-metadata/watermark) → LLM/stats **PK-classify** → `additionalSchemaInfo.json` → **`ApplyAllBatch`** over all selectable tables → inspect subscription → structured Phase-A report |
| 2 | `E2E.PhaseB` | §3 Sync 2^N matrix | sub-phases **3.1→3.8** in order (see below) |
| 3 | `E2E.PhaseC` | §4 Value Handling | different value types map + persist without throwing |
| 4 | `E2E.GenAction` | §5 Generation Action / Agents | generation-action path + `mj ai` agent invocation + observe outcome |
| 5 | `E2E.Observability` | §6 Observability (continuous) | structured logs captured throughout EVERY phase, not at the end — this IS the per-test NL+JSON+pass/fail contract below |
| 6 | `E2E.DualDialect` | §7 Dual-dialect | run the ENTIRE applicable suite again on Postgres; both suites as DISTINCT artifacts; SQL-Server↔Postgres concept mapping |

**Phase B sub-phases (run 3.1→3.8 in order):** 3.1 change-detection/efficiency (watermark-first→full/rest + no-watermark path, timestamp incremental, content-hash/Merkle actually skipping work, keyset pagination with mid-sync API restart resuming from logs) · 3.2 directions & write paths (inbound, bidirectional [conflict/echo-loopback/simultaneous-both-sides/ordering], write-backs, watermark fallback save) · 3.3 identity/idempotency (dedupe, replay idempotent) · 3.4 deletes & tombstoning (disposable test records only, §0) · 3.5 schema drift (source-side AND local-side column removal, adversarial, plus other source-side surprises) · 3.6 DAG (ordering follows the contract, deeply) · 3.7 rate-limit/concurrency (429 characterization + per-layer concurrency) · 3.8 resilience (strategy rotation mid-sync, infinite-pagination recovery, generic mid-process failure, grace handling that maximizes landed data).

### Per-connector adaptation — applicable subset, fixed skeleton, no silent omission

The harness runs the **applicable subset** of each phase: a pull-only connector skips Phase B's push/bidirectional cells (3.2) and §5 if no generation action; a connector with **no watermark** exercises the content-hash/keyset axes of 3.1 in place of the watermark cell. **But the phase skeleton + ordering is FIXED** — you may not reorder phases or drop a whole phase. **Any skipped phase/cell MUST be logged with a `skipReason`** (a `livePhaseLog` entry with `status:'skip'` and a non-empty `skipReason`); silent omission is a `floor-check` failure. Determine applicability from the frozen contract's capability flags (`SupportsWrite`, `SupportsIncrementalSync`, generation-action availability), not from convenience.

### Dual-dialect (§7) is MANDATORY

Every phase marked `dualDialect:true` in `e2eLivePhases` runs once on **SQL Server** and then identically on **Postgres** — every assertion on BOTH. The two runs are DISTINCT artifacts; the harness also emits the SQL-Server↔Postgres concept mapping. UUID comparisons go through `UUIDsEqual`. Flag anything that wouldn't hold on production Azure/AWS SQL Server + Postgres. A `dualDialect` phase proven on only one dialect is a `floor-check` failure (`e2e-dual-dialect-missing`).

### Per-phase structured output (§6) — the `livePhaseLog` the floor reads

Each phase/sub-phase/cell emits a `livePhaseLog` entry the testing-agent returns on its T10/T11 tier result and `floor-check` enforces against `e2eLivePhases`:

```json
{ "phaseId": "E2E.PhaseB.3_1", "order": 2, "dialect": "sqlserver",
  "nl": "Plain-English: what was tested + the result",
  "json": { "IntegrationGetRun": { "...scrubbed..." }, "dbCounts": { "...": 0 }, "progressEvents": [] },
  "status": "pass" | "fail" | "skip", "skipReason": "required only when status==='skip'" }
```

`floor-check` rejects the run (`pass=false`) when, for any APPLICABLE `e2eLivePhases` entry, the union of the T10+T11 `livePhaseLog` shows the phase **missing** (`e2e-phase-missing` / `e2e-subphase-missing`), **out of order** (`e2e-phase-out-of-order`), **lacking NL + JSON + explicit pass/fail** (`e2e-phase-evidence-missing`), **skipped without a reason** (`e2e-skip-without-reason`), or — for a `dualDialect` phase — proven on **only one** of SQL Server / Postgres (`e2e-dual-dialect-missing`). This is what makes "run the full thing, in order" enforced rather than trusted.

## DO NOT

- Don't fabricate fixture data. Use real vendor responses copied from runs, with PROVENANCE.json citing the source.
- Don't hit live APIs from these tests — that's T10's job (separate runner, real credentials).
- Don't assert against the killed `connector-generator` output. (ADR-001 — generator gone; tests target the hand-written connector class directly.)
- Don't reference the retired `@memberjunction/integration-connector-validator` package; structural invariants moved into T1 of the verification ladder.
