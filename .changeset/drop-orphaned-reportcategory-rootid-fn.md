---
"@memberjunction/core": minor
---

Drop `fnReportCategoryParentID_GetRootID`, an orphaned function left behind when the ReportCategory table was removed. The dangling table reference made Azure SQL's database export (bacpac) fail module validation, so affected installations could not be exported. Existence-guarded: a no-op wherever the function is already gone.
