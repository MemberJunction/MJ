---
"@memberjunction/core": patch
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/task-graph": patch
"@memberjunction/core-actions": patch
"@memberjunction/ai-bridge-server": patch
"@memberjunction/server": patch
"@memberjunction/standards": patch
---

Add strongly-typed 5-tier `LimitsConfigResolver` with approved backstop defaults (`DEFAULT_MJ_LIMITS_CONFIG` / `CODE_FALLBACK_LIMITS`) in `@memberjunction/core`, migrate `RunawayGuard`, `ResourceGuard`, and `Tuning` work bounds across AI/TaskGraph/Actions/Bridge/Server to resolve through `LimitsConfigResolver.Instance`, commit the categorized `docs/limits-sweep-inventory.csv` sweep inventory, and enforce the `limits-literals` CI/Standards guard.
