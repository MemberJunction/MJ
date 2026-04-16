---
"@memberjunction/ng-conversations": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/content-autotagging": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/sql-parser": patch
---

Repair three query composition pipeline regressions surfaced by Skip-Brain, clear test feedback dialog state when switching conversations, strip tag IDs from taxonomy context injected into LLM prompts, exclude in-progress runs from last-run-date lookups, and replace direct UUID equality checks with `UUIDsEqual()` in the AI analytics dashboards to comply with the cross-platform UUID compliance test.
