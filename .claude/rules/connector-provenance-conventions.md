---
description: Conventions for PROVENANCE.json + CODE_EVIDENCE.json files.
applies_to: connectors-registry/**/{PROVENANCE,CODE_EVIDENCE}.json
---

# Provenance + code-evidence conventions

Apply to `connectors-registry/<vendor>/PROVENANCE.json` + `CODE_EVIDENCE.json`. These files satisfy the **provable-only** discipline — every hard constraint in the metadata file must trace back to one of these. They drive the workshop's `verify-claim` locked primitive: it re-runs the cited script or re-fetches the URL and asserts the claim reproduces.

## PROVENANCE.json shape

```json
{
  "Entries": [
    {
      "URL": "https://developers.vendor.com/docs/api/...",
      "AccessedAt": "2026-05-18T12:34:56.000Z",
      "UsedFor": "Confirming vendor rate limit (e.g., N requests per M-second window)",
      "SourceTier": 1,
      "SourceCategory": "OfficialDocs",
      "EvidenceStrength": "ExplicitStatement",
      "TargetField": "integration.BatchMaxRequestCount",
      "Excerpt": "Per-app rate limit: <N> requests per <M>-second window."
    }
  ]
}
```

### Required fields

- `URL` — must be reachable + tier-1 or tier-2 (community blog posts not acceptable for hard constraints).
- `AccessedAt` — ISO 8601 timestamp.
- `UsedFor` — human-readable purpose.
- `SourceTier` — 1 (vendor-owned), 2 (official-structured: OpenAPI/Postman/SDK type defs), 3 (community).
- `SourceCategory` — `OfficialDocs` | `OfficialSDK` | `OpenAPISpec` | `PostmanCollection` | `CommunityFixture`.
- `EvidenceStrength` — `ExplicitStatement` (vendor says it), `ImpliedFromExample` (inferred from an example), `InferredFromContext` (educated guess).
- `TargetField` — the metadata field this evidence supports. Format: `integration.<Field>` for the Integration row, `io.<IOName>.<Field>` for an IntegrationObject, `iof.<IOName>.<IOFName>.<Field>` for an IntegrationObjectField.
- `Excerpt` — relevant text snippet from the source (≤ 500 chars).

### Authority hierarchy

For hard-constraint fields (IsPrimaryKey, IsRequired, IsUniqueKey, IsReadOnly, FK refs, SupportsWrite, per-operation CRUD paths/methods, CredentialTypeID, IncrementalWatermarkField, batch limits):
- `ExplicitStatement` from Tier 1 → strong evidence (accept).
- `ExplicitStatement` from Tier 2 → strong evidence (accept).
- `ImpliedFromExample` from Tier 1 → moderate (accept with warning).
- `ImpliedFromExample` from Tier 2 → moderate (accept with warning).
- `InferredFromContext` (any tier) → weak (REJECT — value should not be hard-coded; either find better evidence or leave undefined / fall back to safe default).

The `verify-claim` locked primitive enforces this — a claim with `EvidenceStrength: 'InferredFromContext'` on a hard-constraint field is rejected before adversarial-verify even runs.

## CODE_EVIDENCE.json shape

```json
{
  "Entries": [
    {
      "ScriptPath": "scripts/extract-io-iof.ts",
      "ScriptRunAt": "2026-05-18T12:34:56.000Z",
      "StructuredOutput": { "IOCreated": 47, "IOFCreated": 312 },
      "SchemaValidationStatus": "Passed",
      "TargetField": "io.contacts"
    }
  ]
}
```

### When to use code-evidence vs provenance

- **CODE_EVIDENCE** — the value came from running a script that fetched + parsed a vendor response. The structured output is the evidence. `verify-claim` reproduces it by re-running the script.
- **PROVENANCE** — the value came from reading vendor docs (HTML, PDF, prose). The URL + excerpt is the evidence. `verify-claim` reproduces it by re-fetching the URL and asserting the excerpt is still present.

Code-evidence is preferred for IO/IOF rows (script extracts from OpenAPI/Postman). Provenance is fine for root-level Integration constants that aren't easily scriptable.

## Bijection alignment (Phase 0)

Every slot in `packages/Integration/connector-builder-workshop/floor/phase0-slots.json` that is NOT `nullable: true` MUST have either a PROVENANCE.json or CODE_EVIDENCE.json entry whose `TargetField` resolves to it. The floor-check primitive iterates the bijection slot table and rejects on any missing emission.

## v5.39.x per-operation columns

Each IO row's per-operation CRUD columns (`CreateAPIPath`, `CreateAPIMethod`, `CreateAPIBodyShape`, `CreateAPIBodyKey`, `CreateAPIIDLocation`, `Update*`, `DeleteAPIPath`, `DeleteIDLocation`) MUST be cited individually. A single provenance entry citing "the write API section" is insufficient — each column gets its own targeted entry.

The exception: when multiple columns share an evidence excerpt (e.g. an OpenAPI POST operation simultaneously declares path + method + body shape), one entry may list multiple `TargetField`s as an array. Default is single-field per entry.

## DO NOT

- Don't fabricate URLs. The `audit-source` locked primitive verifies them.
- Don't reuse a provenance entry for multiple unrelated TargetFields. One entry per (URL, TargetField) pair (or per (URL, TargetField-group) when the columns are clearly co-stated).
- Don't accept Tier-3 community blog posts for hard constraints. Find Tier 1/2 or leave the field unset.
- Don't author provenance entries citing credential bytes. Credentials never enter agent context; provenance is for public source material only.
