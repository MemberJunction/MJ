---
"@memberjunction/codegen-lib": patch
---

Tighten CodeGen smart-field-identification: prompt template defaults search OFF with a narrow whitelist, anti-pattern list for filter/narrative fields, and FTS-only Contains predicate. New search-guardrails module enforces the rules in code (narrative-field block, per-entity cap, predicate normalization, default-off entity-level enable) so flag drift can't sneak back in regardless of LLM output.
