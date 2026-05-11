---
"@memberjunction/core-entities-server": patch
---

Fix deterministic QueryField extraction for explicit SELECT columns — previously relied solely on LLM fallback which silently failed, leaving queries with 0 fields. Also prevents destructive deletion of existing fields when extraction returns null.
