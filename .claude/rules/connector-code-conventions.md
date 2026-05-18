---
description: Conventions for connector TypeScript source files.
applies_to: connectors-registry/**/src/*.ts
---

# Connector code conventions

Applies to TS files under `packages/Integration/connectors-registry/<name>/src/`. Inherits MJ-wide rules from `CLAUDE.md`.

## Class structure

- Connector extends a protocol base (`BaseRESTIntegrationConnector`, `BaseGraphQLIntegrationConnector`, `BaseSOAPIntegrationConnector`, `BaseFileFeedConnector`, or `RelationalDBConnector`).
- Decorated with `@RegisterClass(BaseIntegrationConnector, '<DriverClass>')` — grandparent registration, NOT against the intermediate base. Enforced by `registration-target.test.ts`.
- Public `IntegrationName` getter returns the exact `MJ: Integrations.Name` string. Part of the three-way invariant.

## Naming

- Public class members: PascalCase (`SupportsCreate`, `BuildHeaders`, `ParseConfig`).
- Private/protected members: camelCase (`cachedToken`, `parseConfig`).
- `@Input()` / `@Output()` (when Angular adjacent) — PascalCase.

## Strong typing

- NO `any` types. NO `unknown` as substitute.
- NO `.Get()` / `.Set()` on BaseEntity-typed objects. Use the typed properties.
- All `BaseEntity.Save()` / `.Delete()` results checked via boolean return; use `LatestResult?.CompleteMessage` on failure.

## Use the shared submodules

- Auth: `@memberjunction/integration-engine/auth-helpers` (`JWTSigner`, `OAuth2TokenManager`, `HMACSigner`, `APIKeyHeaderBuilder`). NEVER inline crypto.
- Types: `@memberjunction/integration-engine/type-helpers` (`MapVendorType`, `GetSemanticDefault`).

## Source-side DTOs

When implementing `DiscoverObjects` / `DiscoverFields`:
- Return `ExternalObjectDTO[]` / `ExternalFieldDTO[]` (post-§2.2 rename — `DisplayName` not `Label`, `Type` not `DataType`).
- The deprecated `ExternalObjectSchema` / `ExternalFieldSchema` aliases still resolve but should NOT appear in new code.

## Template-var paths

Paths like `/contacts/{ContactID}/notes` work IFF the child IO's IOF has `RelatedIntegrationObjectID` + `RelatedIntegrationObjectFieldName` set, OR a sibling IO has an IsPrimaryKey IOF whose name exactly matches the template variable (case-insensitive). Substring-include match is gone (§2.5 hardened).

Multi-level paths (`/orgs/{OrgID}/projects/{ProjectID}/tasks`) are supported via `ResolveParentChain`. Both template vars must resolve; if either fails, the connector logs a warning + skips the fetch.

## Capability ↔ method consistency

If `SupportsCreate=true`, you MUST implement `CreateRecord` with a REAL body (Invariant 4 enforces existence; Invariant 7 enforces non-stub). Same for Update/Delete/Search/List/Get. No 501-stubs — escalate metadata gaps upstream rather than stubbing (per `INTEGRATION-FRAMEWORK-REQUIREMENTS.md` §1.5 + Directive §2.1).

## CRUD bodies must use metadata routing

Per `INTEGRATION-FRAMEWORK-REQUIREMENTS.md` §3.5:

- `LoadMetadata()` once per instance; cache IOs by name
- `ResolveIO(name)` looks up the IO row
- `ResolvePathTemplate(path, ctx)` substitutes `{var}` from ctx.Record + parent-chain
- Construct URL from `<verb>APIPath`; method from `<verb>Method`; body shape per `<verb>RequestBodyShape`
- Parse responses per `ResponseDataKey` + `ErrorResponseShape`
- Honor `ConcurrencyControlStrategy`, `IdempotencyHeaderName`, `IsImmutableAfterCreate` filtering

## Incremental sync via WatermarkService

`FetchChanges` reads watermark via `WatermarkService.Load`, applies `IncrementalQueryParamName` formatted per `IncrementalQueryParamFormat`, iterates paginated batches, tracks max-watermark-seen, persists new max via `WatermarkService.Update` only on full success. Partial failure leaves watermark unchanged so next sync resumes from same point.

## DO NOT

- Don't restore the killed `connector-generator` / `ConnectorSpec` / `LLM_COMPLETE` / `spec.json` / `DeterministicLOCRatio` pattern (ADR-001 — gone). Write the connector directly using docs-first research; if a pattern recurs across 3+ connectors, extract to strategy library (`@memberjunction/connector-extractor-strategies`).
- Don't return `{Success: false, ErrorMessage: 'not implemented', StatusCode: 501}` from a CRUD method whose capability flag is `true` — that's a stub; Invariant 7 will fail. Escalate the metadata gap instead.
- Don't inline crypto. Extend `auth-helpers` if a primitive is missing.
- Don't use `any` types. Use `Record<string, unknown>` for opaque shapes; type vendor responses with Zod schemas.
