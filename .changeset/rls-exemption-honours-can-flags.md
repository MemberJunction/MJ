---
"@memberjunction/core": patch
---

`EntityInfo.UserExemptFromRowLevelSecurity` now requires the permission row to GRANT the operation before it can exempt the user from row-level security for it.

A permission row carries an RLS filter only for the operations it grants, so a row with `CanCreate=false` also has `CreateRLSFilterID=null`. The exemption check read that null as "unrestricted" and returned exempt. Every authenticated user holds the `UI` role, whose rows are read-only on most entities, so any user whose tenant role bound Create/Update/Delete to a row filter was silently exempt from that filter on the client (RunView/GraphQL) path: an org admin could write a record into another organization.

The check is now `ep.CanCreate && !ep.CreateRLSFilterID` (and likewise for Read/Update/Delete). A filter-less row that grants the operation still exempts, exactly as before; a row that does not grant it no longer says anything about exemption. Regression tests added to `entityInfo.rlsExemption.test.ts`.
