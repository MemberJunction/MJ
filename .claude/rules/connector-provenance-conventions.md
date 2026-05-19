---
description: Conventions for PROVENANCE.json + CODE_EVIDENCE.json files.
applies_to: connectors-registry/**/{PROVENANCE,CODE_EVIDENCE}.json
---

# Provenance + code-evidence conventions

Apply to `connectors-registry/<name>/PROVENANCE.json` + `CODE_EVIDENCE.json`. These files satisfy **Invariant 1 (provable-only)** — every hard constraint in the metadata file must trace back to one of these.

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
- `SourceTier` — 1 (vendor-owned), 2 (official-structured), 3 (community).
- `SourceCategory` — `OfficialDocs` | `OfficialSDK` | `OpenAPISpec` | `PostmanCollection` | `CommunityFixture`.
- `EvidenceStrength` — `ExplicitStatement` (vendor says it), `ImpliedFromExample` (inferred from an example), `InferredFromContext` (educated guess).
- `TargetField` — the metadata field this evidence supports. Format: `integration.<Field>` for root, `io.<IOName>.<Field>` for IO, `iof.<IOName>.<IOFName>.<Field>` for IOF.
- `Excerpt` — relevant text snippet from the source (≤ 500 chars).

### Authority hierarchy

For hard-constraint fields (IsPrimaryKey, IsRequired, FK refs, SupportsWrite, CredentialTypeID, batch limits):
- `ExplicitStatement` from Tier 1 → strong evidence (accept).
- `ExplicitStatement` from Tier 2 → strong evidence (accept).
- `ImpliedFromExample` from Tier 1 → moderate (accept with warning).
- `ImpliedFromExample` from Tier 2 → moderate (accept with warning).
- `InferredFromContext` (any tier) → weak (REJECT — value should not be hard-coded; either find better evidence or set to false/null).

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

- **CODE_EVIDENCE** — the value came from running a script that fetched + parsed a vendor response. The structured output is the evidence.
- **PROVENANCE** — the value came from reading vendor docs (HTML, PDF, prose). The URL + excerpt is the evidence.

Code-evidence is preferred for IO/IOF rows (script extracts from OpenAPI/Postman). Provenance is fine for root-level constants (rate limits, auth model) that aren't easily scriptable.

## DO NOT

- Don't fabricate URLs. The `audit-source` skill verifies them.
- Don't reuse a provenance entry for multiple unrelated TargetFields. One entry per (URL, TargetField) pair.
- Don't accept Tier-3 community blog posts for hard constraints. Find Tier 1/2 or set the field to a safe default.
