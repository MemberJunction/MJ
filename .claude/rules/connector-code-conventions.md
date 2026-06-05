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
- `ExternalFieldSchema` distinguishes `IsPrimaryKey` from `IsUniqueKey` (Phase 0 B-fix). Emit `IsPrimaryKey=true` only when the source explicitly identifies the field as a primary key — uniqueness alone is not sufficient. The base `IntrospectSchema` derives `PrimaryKeyFields` by filtering on `IsPrimaryKey` (NOT `IsUniqueKey`); an object can have several unique fields (email, phone) of which only one is the PK. Set BOTH flags independently when the source distinguishes them.
- `AllowsNull` is distinct from `IsRequired` — required is a create-time constraint; nullable is a record-state constraint. Leave `AllowsNull` undefined when the source doesn't state it explicitly (provable-only); consumers default to permissive (nullable). Never infer NOT NULL from sample data.
- `IsReadOnly` — mark computed / system-managed / non-user-writable fields. It feeds whether a field is included in Create/Update bodies, so getting it wrong either drops a writable field or sends a read-only field the API rejects.
- `IsForeignKey` + `ForeignKeyTarget` — set the source object name a FK references. The base `IntrospectSchema` only emits a `Relationships` entry when BOTH `IsForeignKey` is true AND `ForeignKeyTarget` is non-null; a half-set FK is silently dropped.

### Provable-only PK/FK/watermark — NEVER fabricated, the overlay enforces it

The persist-time overlay (`IntegrationSchemaSync` + `decideBooleanOverlay`) is the safety net that makes "provable-only" structural, not a guideline:
- A discovered boolean of `undefined` means **"the source has no opinion"** — the curated (Declared) value sticks; discovery NEVER overwrites it. Emitting `false` where you mean "unknown" is a fabrication: pre-Phase-0 this wiped every declared PK the moment live discovery ran on HubSpot/Salesforce (whose property-list APIs don't return an `IsPrimaryKey` field at all). Emit `undefined`, not `false`, for unprovable booleans.
- A discovered boolean that is **defined and different** from the curated value wins (it reflects the live system's current truth — e.g. a column flipped nullable→non-nullable). Describe-output wins for DDL-affecting attributes (Type, AllowsNull, IsRequired, IsPrimaryKey, IsUniqueKey, IsReadOnly); curated wins for semantic attributes (Description-if-nonempty, DisplayName, Sequence, Category).
- FK targets resolve by sibling-object name → UUID at persist time. An unresolvable `ForeignKeyTarget` leaves the field FK-less rather than fabricating a `RelatedIntegrationObjectID` — never hardcode the UUID.

### Synthetic-PK / content-hash identity fallback (§4)

`ToExternalRecord` only uses the declared PK as the record identity when **every** PK component is present and non-empty. A composite key with a missing part (`"abc|"`) is NOT a stable identity — the base falls back to a deterministic content hash so PK-less / partial-key tables stay syncable and dedupable. This is automatic; the connector's job is simply to mark the real PK fields honestly so the happy path uses them and only genuinely-keyless rows fall through to the hash.

## Template-var paths

Paths like `/contacts/{ContactID}/notes` work IFF either:
- the child IO's IOF has `RelatedIntegrationObjectID` + `RelatedIntegrationObjectFieldName` set, OR
- a sibling IO has an `IsPrimaryKey` IOF whose name exactly matches the template variable (case-insensitive).

Substring-include match is gone. Multi-level paths (`/orgs/{OrgID}/projects/{ProjectID}/tasks`) are supported via `ResolveParentChain`; both template vars must resolve.

## Generic CRUD via per-operation IO columns (v5.39.x — REQUIRED)

`BaseRESTIntegrationConnector.CreateRecord` / `UpdateRecord` / `DeleteRecord` / `GetRecord` read these IO columns at runtime:

| Operation | Path | Method | Body shape | Body key | ID location |
|---|---|---|---|---|---|
| Create | `CreateAPIPath` | `CreateMethod` | `CreateBodyShape` | `CreateBodyKey` | `CreateIDLocation` |
| Update | `UpdateAPIPath` | `UpdateMethod` | `UpdateBodyShape` | `UpdateBodyKey` | `UpdateIDLocation` |
| Delete | `DeleteAPIPath` | `DeleteMethod` | n/a | n/a | `DeleteIDLocation` |
| Get | `UpdateAPIPath` ?? `APIPath`+`/{id}` | `'GET'` | n/a | n/a | path-templated |

The delete verb is **NOT** fixed — the generic `DeleteRecord` calls `MakeHTTPRequest(..., obj.DeleteMethod, ...)`, so `DeleteMethod` MUST be populated whenever `DeleteAPIPath` is (some vendors use `POST`/`PUT` soft-deletes, not `DELETE`). Get-one reuses `UpdateAPIPath` when present (typically the same single-record path), else falls back to `APIPath` + `/{encoded-id}`.

Column enum domains (emit these literal values, nothing else):
- `Create/Update BodyShape` ∈ `{ flat, wrapped, literal }` — `flat` = body is the attributes verbatim; `wrapped` = body is `{ [BodyKey]: attributes }` (BodyKey REQUIRED when wrapped, e.g. `member` → `{member:{...}}`); `literal` = the connector overrode the operation (the generic path falls back to `flat` as a safety net, so `literal` is a signal to the human, not a generic behavior).
- `Create/Update/Delete IDLocation` ∈ `{ body, header, n/a, path }` — where the created-record ID is read from (Create) or where the target ID goes (Update/Delete). `path` substitutes `{ID}`/`{id}`/`{ExternalID}` into the path template; `body`/`header` mean the ID is NOT path-substituted and must be handled by the connector.

Concrete connectors should **NOT** re-implement these unless the vendor has a genuinely idiosyncratic shape (multipart upload, GraphQL mutation, SOAP envelope, multi-step write). If you do override, document why with a one-line comment **and still route the create through `BuildCreatedResult`** (see below).

### Create must fail LOUDLY on an empty ID — `BuildCreatedResult`

The base class owns `protected BuildCreatedResult(externalID, statusCode, objectName)`. A 2xx create whose response carries **no usable record ID** (empty/undefined after trim) is a **FAILURE**, not a success — returning `Success:true` there silently loses the record and causes a duplicate create on the very next sync (the HubSpot-association class of bug). The generic `CreateRecord` already routes through it:

- generic path: `ExtractIDFromResponse(response, obj.CreateIDLocation)` → `BuildCreatedResult(...)`.
- `ExtractIDFromResponse` reads the new ID per `CreateIDLocation`: `body`/null → scans the response body for `id|ID|Id|externalID|ExternalID`; `header` → parses the `Location` header's trailing segment. Override `ExtractIDFromResponse` for vendor-specific ID field names / non-standard headers.

**If you override `CreateRecord`, you MUST still call `this.BuildCreatedResult(extractedID, status, objectName)` to build the success/failure result — never hand-construct `{Success:true, ExternalID:''}`.** This is the single non-negotiable write-path invariant.

### Capability ↔ method consistency (bijection)

If `SupportsCreate=true`, the IO MUST have non-null `CreateAPIPath` + `CreateMethod`. If `SupportsUpdate=true` → `UpdateAPIPath` + `UpdateMethod`. If `SupportsDelete=true` → `DeleteAPIPath` + `DeleteMethod` (the verb is metadata-driven, not assumed `DELETE`). The floor-check rejects rows that declare a capability without its path+method pair. No stubs — escalate metadata gaps upstream rather than stubbing.

The inverse also holds (null-capability honesty): if a per-operation column is null, the generic path THROWS for that verb (`"CreateRecord not supported ... CreateAPIPath / CreateMethod not configured"`). So a capability getter returning `true` while its columns are null is a latent runtime crash — keep the getter and the columns in lockstep.

## Incremental sync via WatermarkService + `IncrementalWatermarkField` (v5.39.x)

`FetchChanges` reads watermark via `WatermarkService.Load`, formats it per the IO's documented incremental param, iterates paginated batches, tracks max-watermark-seen, persists new max via `WatermarkService.Update` only on full success. Partial failure leaves watermark unchanged so next sync resumes from same point.

The IO column `IncrementalWatermarkField` (NEW in v5.39.x) names the vendor-side cursor/timestamp field. If `SupportsIncrementalSync=true`, `IncrementalWatermarkField` MUST be set; bijection floor-check enforces.

## Sync-efficiency contract — OPTIONAL hooks, fill what the source supports

The universal sync engine consumes a set of OPTIONAL connector hooks on `BaseIntegrationConnector` for peak-aware throughput, no-watermark resume, bounded typing, and clean target writes (framework §7/§10). **Every hook has a safe default — a connector that overrides none still works.** You "fill out the contract" only where the vendor *documents/supports* the capability; everywhere else leave the default and the engine degrades gracefully. Provable-only still applies: override a hook only on evidence, never on a guess. This is how a connector graduates from "syncs" to "syncs efficiently, at scale, with no issues" — add the hooks as discovery surfaces the capability, not up front.

- **Bounded typing (the NVARCHAR(MAX) problem).** Surface *every* field, and in `DiscoverFields` populate `ExternalFieldSchema.MaxLength` / `Precision` / `Scale` / `DefaultValue` whenever the source reports them, so the schema builder emits a bounded column instead of MAX. Where the source doesn't state a size, leave it `null` so the builder sizes it *generously* — err larger; a roomy bounded column beats a truncating tight one, and both beat MAX. "Provable" only forbids *inventing* a constraint the source doesn't have; it never means drop a field or size it stingily — get everything, size it comfortably.
- **Keyset / no-watermark resume.** Override `StableOrderingKey(objectName)` to name a stable, monotonic ordering column (usually the PK) for objects that have *no* incremental watermark. The engine resumes a scan from the last-seen key (`FetchContext.AfterKeyValue` → return `FetchBatchResult.NextAfterKeyValue`), robust to mid-stream insert/delete. Return `null` where no stable key exists — keyset resume is simply unavailable, not an error.
- **Peak-aware rate limiting.** Override the `RateLimitPolicy` getter (`{TokensPerSec, Burst?, ThrottleBackoffFactor?}`) with the source's documented limits and `ExtractRetryAfterMs(error)` to parse a Retry-After / limit header into ms. The engine runs an AIMD token bucket; with no policy it derives a conservative rate. Override `MaxConcurrencyHint` with the highest safe per-layer concurrency the source tolerates.
- **Aggressive batching.** If the API has batch endpoints, set `SupportsBatchWrite=true` and override `BatchCreateRecords` / `BatchUpdateRecords` / `BatchDeleteRecords`. Defaults loop the single-record methods, so the engine may always call the batch form — overriding only buys throughput, never correctness.
- **Per-record transform (`TransformRecord`).** Optional protected hook on `BaseRESTIntegrationConnector`, called between `NormalizeResponse` (vendor envelope-stripping) and `ToExternalRecord` (composite-PK assembly). DISTINCT from `NormalizeResponse`: that strips the response envelope to expose individual records; `TransformRecord` does per-record vendor-specific shape changes the standard pipeline shouldn't carry — nested-field flattening, empty-string→null coercion for date columns, computed fields, removing vendor metadata blobs (e.g. Salesforce `attributes`). Default is identity; override ONLY when the vendor needs it. It is a slot in the bijection table (nullable — omitting it is fine).
- **Type-enforcement post-process (`PostProcessRecord`).** Override `PostProcessRecord(record)` to normalize a record's values to the resolved column formats AFTER transform/normalize and BEFORE write (the connector-side complement to the engine's target-type enforcement). Default returns the record unchanged. (This is THIS system's hook — not MCP, not `take`.)
- **Surface silent-empties.** When a fetch returns zero records for a structural reason (e.g. a second-layer/association object whose parents weren't available), attach a `FetchWarning` to `FetchBatchResult.Warnings` so the engine reports it in the run artifact instead of a swallowed `console.warn`.

None of these gate shipping a connector — they're the difference between a connector that technically works and one that syncs cleanly under real volume on both SQL Server and Postgres targets.

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
