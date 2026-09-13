---
"@memberjunction/core": minor
---

Restore FileStorageProvider create/update stored procedures so they accept SupportsSearch and RequiresOAuth again. V202608191200 regenerated those procs without the two bit columns even though the table and EntityField metadata still have them, which made mj sync push fail with "too many arguments specified".
