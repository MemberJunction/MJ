---
"@memberjunction/db-auto-doc": patch
"@memberjunction/core": patch
---

DBAutoDoc organic-key detection + PR #2193 per-column normalization:

- **Organic-key detection phase** in DBAutoDoc's analyze pipeline (optional, off by default): prefilter → per-table LLM normalize (business-space descriptions + concept names + per-column normalization strategy + organic-key gate) → embed → agglomerative cluster → concept-name split → FK-graph transitive bridges → emit to `additionalSchemaInfo.json`. Runs on MemberJunction's AI infrastructure (`BaseLLM` / `BaseEmbeddings` via the ClassFactory), no standalone provider clients.
- **Per-column normalization**: each emitted `EntityOrganicKey` carries its own normalization function for its column, so a cluster of differently-formatted columns (e.g. phone numbers across systems) each canonicalize to a shared form. Runtime (`EntityInfo.BuildOrganicKeyViewParams`) applies each side's own expression at match time, looking up the spoke entity's organic key by name.
