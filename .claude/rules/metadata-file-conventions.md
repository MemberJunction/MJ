---
description: Conventions for connector metadata JSON files.
applies_to: metadata/integrations/**/*.json
---

# Metadata file conventions

These rules apply when reading/writing files under `metadata/integrations/<vendor>/`. The structure was formalized in Phase 0 (v5.39.x); see `metadata/integrations/README.md` for the layout overview.

## Authorship

- NEVER edit metadata files directly via Write or Edit. Use the `mj-metadata` MCP's `upsert_integration_object`, `upsert_integration_object_field`, `append_provenance`, `append_code_evidence` tools.
- These tools provide atomic writes + automatic backups under `.backups/`. Direct edits skip both.

## File shape

- Each file is mj-sync-compatible. Required keys: `fields` (root), optional `relatedEntities` (nested).
- NEVER include system-generated fields: `primaryKey`, `sync`, `__mj_CreatedAt`, `__mj_UpdatedAt`. These are auto-populated by `mj sync push`.
- Use `@lookup:` / `@file:` / `@parent:` / `@root:` references.

## Reference patterns

- `@lookup:MJ: Integration Objects.Name=<ObjectName>&IntegrationID=@parent:ID` — for FK refs from IOF to a sibling IO under the same Integration.
- `@lookup:MJ: Integrations.Name=<IntegrationName>` — for top-level lookups.
- `@parent:ID` — for FK refs from IOF to its containing IO.

## MetadataSource (v5.39.x enum)

The `MetadataSource` enum on both `MJ: Integration Objects` and `MJ: Integration Object Fields` is `{Declared, Discovered, Custom}`:
- **Declared** — content authored in this folder. mj sync push sets it on insert.
- **Discovered** — added by the live `IntegrationConnectorCreationPipeline` (D0+D1) during its Introspect+Persist stages.
- **Custom** — added by a customer's runtime extension.

Metadata files should NOT set `MetadataSource` explicitly. The persistence layer enforces the right value based on the write path.

## Hard-constraint fields (require evidence)

The following MUST have a provenance OR code-evidence entry. Without it, `verify-claim` rejects the row at floor-check time:

**Integration row:**
- `Name`, `Description`, `ClassName`, `ImportPath`, `CredentialTypeID`
- `BatchMaxRequestCount`, `BatchRequestWaitTime`

**MJ: Integration Objects row:**
- `Name`, `APIPath`, `PaginationType`
- `SupportsPagination`, `SupportsIncrementalSync`, `SupportsWrite`
- `IncrementalWatermarkField` (REQUIRED when `SupportsIncrementalSync=true`)
- `Create/Update/Delete{APIPath, Method, BodyShape, BodyKey, IDLocation}` per capability flag set
- `Status`

**MJ: Integration Object Fields row:**
- `Name`, `Type`, `IsPrimaryKey`, `IsRequired`, `IsReadOnly`, `IsUniqueKey`
- `RelatedIntegrationObjectID` (FK target reference, when set)
- `Status`

`EvidenceStrength` ladder:
- Hard constraints accept `ExplicitStatement` (preferred) or `ImpliedFromExample` (with warning).
- `InferredFromContext` is REJECTED for hard constraints — leave the field unset rather than guessing.
- Soft / descriptive fields accept any `EvidenceStrength`.

## Per-flag CODE_EVIDENCE granularity

Every hard-constraint flag emission gets a per-IO or per-IOF CODE_EVIDENCE entry citing the source signal. The workshop's `extract-iiof-pipeline` enforces this — it walks each emitted row and rejects ones without per-flag evidence.

Multi-field grouped emissions are allowed when the source clearly co-states them (e.g. an OpenAPI POST operation simultaneously declares path + method + request body shape).

## Bijection floor-check alignment

The slot table at `packages/Integration/connector-builder-workshop/floor/phase0-slots.json` is the source of truth for required-vs-nullable. Every non-nullable slot must have an entry in this metadata file OR a documented `skip-logged` reason (needs-auth / docs-unscrapable / deprecated / vendor-confirmed-absent).

## DO NOT

- Don't author IO/IOF rows by hand. Use the extractor script. Hand-transcription bypasses `verify-claim`.
- Don't put credentials in metadata files. They live in CompanyIntegration entity rows + the credential-store; the agent never sees them.
- Don't hardcode UUIDs. Use `@lookup:` references and let mj-sync resolve at push time.
- Don't set `MetadataSource` explicitly. The pipeline enforces the value at persist time.
