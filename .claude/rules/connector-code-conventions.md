---
description: Conventions for connector TypeScript source files.
applies_to: connectors-registry/**/src/*.ts
---

# Connector code conventions

Applies to TS files under `packages/Integration/connectors-registry/<name>/src/`. Inherits MJ-wide rules from `CLAUDE.md`.

## Class structure

- Connector extends a protocol base — `BaseRESTIntegrationConnector` is the standard for REST/JSON APIs; `BaseGraphQLIntegrationConnector`, `BaseSOAPIntegrationConnector`, `BaseFileFeedConnector`, or `RelationalDBConnector` for other protocols. All live in `@memberjunction/integration-engine`.
- Decorated with `@RegisterClass(BaseIntegrationConnector, '<DriverClass>')` — grandparent registration, NOT the intermediate base. The factory dispatches off `BaseIntegrationConnector`.
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
- Types: `@memberjunction/integration-engine/type-helpers` (`MapSourceType`).

## Source-side DTOs (post-Phase 0 schema)

When implementing `DiscoverObjects` / `DiscoverFields`:
- Return `ExternalObjectSchema[]` / `ExternalFieldSchema[]` from `@memberjunction/integration-engine`.
- `ExternalFieldSchema` distinguishes `IsPrimaryKey` from `IsUniqueKey` (Phase 0 B-fix). Emit `IsPrimaryKey=true` only when the source explicitly identifies the field as a primary key — uniqueness alone is not sufficient.
- `AllowsNull` is distinct from `IsRequired` — required is a create-time constraint; nullable is a record-state constraint. Leave `AllowsNull` undefined when the source doesn't state it explicitly (provable-only).

## Template-var paths

Paths like `/contacts/{ContactID}/notes` work IFF either:
- the child IO's IOF has `RelatedIntegrationObjectID` + `RelatedIntegrationObjectFieldName` set, OR
- a sibling IO has an `IsPrimaryKey` IOF whose name exactly matches the template variable (case-insensitive).

Substring-include match is gone. Multi-level paths (`/orgs/{OrgID}/projects/{ProjectID}/tasks`) are supported via `ResolveParentChain`; both template vars must resolve.

## Generic CRUD via per-operation IO columns (v5.39.x — REQUIRED)

`BaseRESTIntegrationConnector.CreateRecord` / `UpdateRecord` / `DeleteRecord` / `GetRecord` read these IO columns at runtime:

| Operation | Path | Method | Body shape | Body key | ID location |
|---|---|---|---|---|---|
| Create | `CreateAPIPath` | `CreateAPIMethod` | `CreateAPIBodyShape` | `CreateAPIBodyKey` | `CreateAPIIDLocation` |
| Update | `UpdateAPIPath` | `UpdateAPIMethod` | `UpdateAPIBodyShape` | `UpdateAPIBodyKey` | `UpdateAPIIDLocation` |
| Delete | `DeleteAPIPath` | `'DELETE'` (fixed) | n/a | n/a | `DeleteIDLocation` |
| Get | `APIPath` (read path) | `'GET'` | n/a | n/a | path-templated |

Concrete connectors should **NOT** re-implement these unless the vendor has a genuinely idiosyncratic shape (multipart upload, GraphQL mutation, SOAP envelope). If you do override, document why with a one-line comment.

### Capability ↔ method consistency (bijection)

If `SupportsCreate=true`, the IO MUST have non-null `CreateAPIPath` + `CreateAPIMethod`. Same for Update/Delete. The floor-check rejects rows that declare a capability without a path. No stubs — escalate metadata gaps upstream rather than stubbing.

## Incremental sync via WatermarkService + `IncrementalWatermarkField` (v5.39.x)

`FetchChanges` reads watermark via `WatermarkService.Load`, formats it per the IO's documented incremental param, iterates paginated batches, tracks max-watermark-seen, persists new max via `WatermarkService.Update` only on full success. Partial failure leaves watermark unchanged so next sync resumes from same point.

The IO column `IncrementalWatermarkField` (NEW in v5.39.x) names the vendor-side cursor/timestamp field. If `SupportsIncrementalSync=true`, `IncrementalWatermarkField` MUST be set; bijection floor-check enforces.

## Connector creation pipeline (D1)

The canonical flow connector → integration is `IntegrationConnectorCreationPipeline` from `@memberjunction/integration-engine`:

1. ConnectionTest stage
2. Introspect stage (uses `IntrospectSchema`)
3. Persist stage (`IntegrationSchemaSync.PersistDiscoveredSchema` with overlay precedence)
4. PKClassify stage (`SoftPKClassifier` from `@memberjunction/integration-pk-classifier` — runs ONLY at runtime, NEVER from the agent)

Connectors do not invoke the classifier themselves. The agent's job is to extract or defer.

## MetadataSource discipline (v5.39.x enum)

The MetadataSource enum is `{Declared, Discovered, Custom}`. Connectors NEVER set it directly — the pipeline does:
- Declared = curated metadata file content (`.<vendor>.integration.json`).
- Discovered = first-time discovery via `IntrospectSchema`.
- Custom = customer's runtime extension.

Static-research emissions are always `Declared`. Runtime emissions are always `Discovered`. The agent does not author `MetadataSource` values.

## DO NOT

- Don't restore the killed `connector-generator` / `ConnectorSpec` / `LLM_COMPLETE` / `spec.json` / `DeterministicLOCRatio` pattern (ADR-001 — gone). Write the connector directly using docs-first research; if a pattern recurs across 3+ connectors, extract to strategy library (`@memberjunction/connector-extractor-strategies`).
- Don't return `{Success: false, ErrorMessage: 'not implemented', StatusCode: 501}` from a CRUD method whose capability flag is `true`. Set the capability `false` if the vendor doesn't support it; otherwise wire it up through the generic per-operation column path.
- Don't inline crypto. Extend `auth-helpers` if a primitive is missing.
- Don't use `any` types. Use `Record<string, unknown>` for opaque shapes; type vendor responses with Zod schemas.
- Don't invoke `SoftPKClassifier` from the connector. That's runtime D4's job inside the creation pipeline.
- Don't reference the retired `@memberjunction/integration-connector-validator` package. It was removed in Phase 0; its structural invariants moved into T1 of the verification ladder.
