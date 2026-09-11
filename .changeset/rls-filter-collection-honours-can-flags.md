---
"@memberjunction/core": patch
---

`EntityInfo.GetUserRowLevelSecurityInfo` now collects a row filter only from a permission row that GRANTS the operation.

The filters of a user's roles are OR'd together, so a filter collected from a row whose `Can*` flag is false widened the clause: a user granted Create by role A (bound to F1) created against `F1 OR F2` whenever role B kept a leftover `CreateRLSFilterID = F2` beside `CanCreate = false`. Nothing clears the filter column when the flag is cleared, and `GetUserPermisions` ORs the flags across roles, so such a user passed the permission gate on role A alone. The check is now `ep.CanCreate && ep.CreateRLSFilterID` (and likewise Read/Update/Delete). Granting rows are unchanged. Companion to the `UserExemptFromRowLevelSecurity` fix in the same shape. Regression tests in `entityInfo.rlsFilterCollection.test.ts`.
