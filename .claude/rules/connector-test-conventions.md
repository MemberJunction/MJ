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
  - `CreateRecord` — happy path (URL templated from `CreateAPIPath` + record; method = `CreateAPIMethod`; body shaped per `CreateAPIBodyShape`/`CreateAPIBodyKey`; ID extracted per `CreateAPIIDLocation`) + filters out `IsReadOnly` fields + applies `FieldMappingMJName` if set.
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

## DO NOT

- Don't fabricate fixture data. Use real vendor responses copied from runs, with PROVENANCE.json citing the source.
- Don't hit live APIs from these tests — that's T10's job (separate runner, real credentials).
- Don't assert against the killed `connector-generator` output. (ADR-001 — generator gone; tests target the hand-written connector class directly.)
- Don't reference the retired `@memberjunction/integration-connector-validator` package; structural invariants moved into T1 of the verification ladder.
