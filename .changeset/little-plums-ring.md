---
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/codegen-lib": patch
---

Fix stored procedure name construction for entities with special characters in
names. Changed fallback logic to use `BaseTableCodeName` instead of `ClassName`
when `spCreate`, `spUpdate`, or `spDelete` fields are null. This prevents
incorrect SP names like `spUpdateMJ_ComponentLibraries` (from ClassName) and
ensures correct names like `spUpdateComponentLibrary` (from BaseTableCodeName)
that match actual database stored procedures.
