---
"@memberjunction/ai-core-plus": patch
"@memberjunction/ai-agents": patch
"@memberjunction/server": patch
"@memberjunction/search-engine": patch
"@memberjunction/core-actions": patch
---

Implement Sub-Epic S3 runtime and configuration seams (zero SQL migrations): add structural `ScopeCommonReach` Audience mode for O(1) start without reader-list enumeration (`@memberjunction/ai-core-plus`, `@memberjunction/ai-agents`), enforce and document invite-only external `userHandling` safeguards (`@memberjunction/server`), carry originating scope attribution on `SearchResultItem` across RRF fusion and deduplication (`@memberjunction/search-engine`, `@memberjunction/ai-agents`), and add deterministic query unquoting/normalization in the Scoped Search action (`@memberjunction/core-actions`).
