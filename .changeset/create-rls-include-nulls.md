---
"@memberjunction/generic-database-provider": patch
---

The Create row-level-security check now projects NULL fields into its candidate row, as the Update post-image check already does.

`CheckCreateRLS` left NULL fields out of the synthetic row it tests the filter against, so a create filter that references a nullable column the new row leaves NULL failed with `Invalid column name` instead of evaluating. Example: a create filter `OwnerUserID = '{{UserID}}'` on `MJ: Projects` turned "save a shared folder" (OwnerUserID NULL) into a SQL error rather than a clean "Access denied", and a filter with an `OwnerUserID IS NULL` branch could never pass. NULLs are now emitted as typed `CAST(NULL AS <type>)`, and the now-unused `includeNulls` parameter on `BuildRLSSyntheticRowProjections` is removed.
