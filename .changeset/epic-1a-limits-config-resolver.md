---
"@memberjunction/core": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/server": patch
---

Add strongly-typed 5-tier `LimitsConfigResolver` with approved backstop defaults (`DEFAULT_MJ_LIMITS_CONFIG` / `CODE_FALLBACK_LIMITS`) in `@memberjunction/core`, `mj.config.cjs` `limits` schema validation and startup registration in `@memberjunction/server`, plus agent run limits adapters and serializable diagnostic snapshots in `@memberjunction/ai-core-plus`.
