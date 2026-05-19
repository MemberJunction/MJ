---
description: Conventions for connector test files.
applies_to: connectors-registry/**/src/__tests__/*.test.ts
---

# Connector test conventions

Applies to vitest test files under `packages/Integration/connectors-registry/<name>/src/__tests__/`.

## Framework

- Vitest (the MJ standard; not Jest).
- Imports: `import { describe, it, expect, vi, beforeEach } from 'vitest';`

## Test structure

- One test file per connector (`<Name>Connector.test.ts`).
- Group tests by lifecycle phase: `describe('TestConnection', ...)`, `describe('DiscoverObjects', ...)`, `describe('FetchChanges', ...)`, etc.
- Use real fixtures from `__tests__/fixtures/` — canonical vendor response samples copied verbatim from real responses (PROVENANCE.json entries cite the URL).

## What to test

- **TestConnection** — happy path + auth failure path + network-error path + (if applicable) scope-missing path.
- **DiscoverObjects** — at least one IO present + capability flags match metadata.
- **DiscoverFields** — at least one IOF per known IO.
- **CRUD bodies** (per IO with the respective Supports* flag) — REQUIRED:
  - `CreateRecord` — happy path (correct URL after template resolution, correct method, correct body shape per `CreateRequestBodyShape`, correct response parsing) + filters out `IsReadOnly` / `IsComputed` / `IsAPIWritable=false` fields + applies `FieldMappingMJName` + adds idempotency header if configured.
  - `UpdateRecord` — same as Create + filters out `IsImmutableAfterCreate` + honors `If-Match` ETag if `ConcurrencyControlStrategy=etag-if-match` + returns `RequiresRefetch=true` on 409 Conflict.
  - `DeleteRecord` — happy path + soft-delete pattern if applicable.
  - `GetRecord` — happy path + 404 path.
  - `SearchRecords` — filter syntax per vendor + pagination.
  - `ListRecords` — pagination + `NextCursor` surfacing.
- **FetchChanges (incremental)** for every IO with `SupportsIncrementalSync=true`:
  - First sync: no watermark → full fetch + max-watermark persisted.
  - Subsequent sync: watermark → incremental query param added + new max persisted.
  - Out-of-order batch: tracks max-seen not most-recent.
  - Partial failure: watermark NOT updated; next call resumes from old value.
  - Format-mismatch: ValidateWatermark rejects.
- **State recovery** — mid-fetch failure leaves watermark unchanged; idempotent Create with same key returns same vendor result.
- **OnUninstall** — revoke succeeds + tolerates failure.
- **NormalizeResponse** — envelope unwrapping for wrapped + direct shapes.
- **ExtractPaginationInfo** — every supported `PaginationType` the connector declares.
- **TransformRecord** — when overridden, both happy + null-input paths.
- **IsVendorCustomObject** — when overridden, both true + false cases.
- **Per-tenant overrides** — `BatchSizeOverride`, `ExcludedIOs`, `FieldMappingOverrides`, `WatermarkResetIOs` respected.
- **Multi-tenant** — two CompanyIntegration contexts don't cross-contaminate state.

## Mocking

- Mock `companyIntegration.Configuration` as a string (post-§2.3, code reads the typed property directly).
- Mock HTTP via a test subclass that overrides `LoadMetadata`, `Authenticate`, `MakeHTTPRequest` — captures the call args (URL/method/headers/body) and returns canned responses. (Read whichever existing connector's `__tests__/<Name>Connector.test.ts` exercises the same protocol family for the canonical `Mocked<Name>Connector` pattern.)
- For T10 live tests, do NOT mock — those run via the `mj-test-runner` MCP with real credentials.

## DO NOT

- Don't fabricate fixture data. Use real vendor responses copied verbatim, with PROVENANCE.json citing the URL.
- Don't hit live APIs from these tests — that's T10's job (separate runner, real credentials).
- Don't assert against the killed `connector-generator` output. (ADR-001 — generator gone; tests target the hand-written connector class directly.)
