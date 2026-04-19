---
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
---

Performance: O(1) caches for BaseEntity.GetFieldByName/GetFieldByCodeName, Metadata.EntityByName/EntityByID fallback lookups, and BaseInfo.copyInitData property assignment (bundled from #2397, #2405, #2406).
