---
"@memberjunction/skip-types": patch
"@memberjunction/server": patch
---

Add SkipQueryEntityInfo type to track entity-query relationships

- Added new SkipQueryEntityInfo type to represent entities referenced by queries
- Includes detection method tracking (AI vs Manual) and confidence scores
- Updated SkipQueryInfo to include optional entities array
- Implemented population of entities in AskSkipResolver's BuildSkipQueries method
- Helps Skip better understand which entities are involved in each query
