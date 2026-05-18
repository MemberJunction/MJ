---
description: Conventions for connector metadata JSON files.
applies_to: connectors-registry/**/metadata/**/*.json
---

# Metadata file conventions

These rules apply when reading/writing files under
`packages/Integration/connectors-registry/**/metadata/`.

## Authorship

- NEVER edit metadata files directly via Write or Edit. Use the `mj-metadata` MCP's `upsert_integration_object`, `upsert_integration_object_field`, `append_provenance`, `append_code_evidence` tools.
- These tools provide atomic writes + automatic backups under `.backups/`. Direct edits skip both.

## File shape

- Each file is mj-sync-compatible. Required keys: `fields` (root), optional `relatedEntities` (nested).
- NEVER include system-generated fields: `primaryKey`, `sync`, `__mj_CreatedAt`, `__mj_UpdatedAt`. These are auto-populated by `mj sync push`.
- Use `@lookup:` / `@file:` / `@parent:` / `@root:` references where appropriate.

## Reference patterns

- `@lookup:MJ: Integration Objects.Name=<ObjectName>&IntegrationID=@parent:ID` — for FK refs from IOF to IO.
- `@lookup:MJ: Integrations.Name=<IntegrationName>` — for CredentialTypeID + other top-level lookups.
- `@parent:ID` — for FK refs from IOF to its containing IO.

## Hard-constraint fields (require evidence)

Per `INTEGRATION-FRAMEWORK-REQUIREMENTS.md` §6 + §7.4. The following MUST have a provenance OR code-evidence entry. Without it, Invariant 1 fails:

**Root level:**
- `CredentialTypeID`, `BatchMaxRequestCount`, `BatchRequestWaitTime`
- `IncrementalSyncCapability`, `IncrementalQueryParamName`
- `WebhooksAvailable`, `WebhookSignatureAlgorithm`
- `BulkOperationsAvailable`
- `CustomObjectMarkerPattern`, `CustomFieldMarkerPattern`
- `APIVersioningStrategy`, `TokenRefreshStrategy`, `AuthHeaderPattern`
- `ErrorResponseShape`

**IO level:**
- `SupportsWrite=true`, `IsBidirectional=true`
- `SupportsIncrementalSync=true`, `IncrementalCursorFieldName`, `IncrementalWatermarkType`
- `IsCustomObject=true`
- `BulkAPIPath` (when populated)

**IOF level:**
- `IsPrimaryKey=true`, `IsRequired=true`, `IsReadOnly=true` (when non-default)
- `IsAPIWritable` (any value — default is false; true requires evidence)
- `IsComputed`, `IsImmutableAfterCreate`, `IsForeignKey`, `FKDetectionMethod`
- `IsCustomField`, `IsIncrementalCursorCandidate`
- `RelatedIntegrationObjectID` (FK target reference)

`EvidenceStrength` per requirements §6:
- Hard constraints accept `ExplicitStatement` (preferred) or `ImpliedFromExample` (with warning)
- `InferredFromContext` is REJECTED for hard constraints — field stays at safe default (false/null) with provenance citing the absence of evidence
- Soft / descriptive fields accept any `EvidenceStrength` and may be absent (will surface in `GapsForLLMCompletion`)

Per-flag CODE_EVIDENCE: every hard-constraint flag emission gets a per-IO or per-IOF CODE_EVIDENCE entry citing the source signal (cf. requirements §3.4 "Per-flag CODE_EVIDENCE emission" + ioiof-extractor role file). Generalizes the original Gap-1 fix to all hard-constraint flags above.

Use `/evidence-script-runner` to bind a script's structured output to a target field; that's the canonical way.

## DO NOT

- Don't author IO/IOF rows by hand. Use the extractor script. Hand-transcription bypasses Invariant 1.
- Don't put credentials in metadata files. They live in CompanyIntegration entity rows + the credential-store; the agent never sees them.
- Don't hardcode UUIDs. Use `@lookup:` references and let mj-sync resolve at push time.
