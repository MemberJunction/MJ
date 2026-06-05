---
"@memberjunction/generic-database-provider": patch
---

Use `UUIDsEqual()` instead of `===` for the AIModel ID comparison in `searchEntitiesSemanticPass`, fixing the repo-wide UUID-comparison compliance check.
