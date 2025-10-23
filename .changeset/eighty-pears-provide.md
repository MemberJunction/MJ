---
"@memberjunction/core-entities": minor
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/core-actions": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/server": patch
---

- Sort Zod schema entity field values by sequence in CodeGen for consistent ordering
- Add unique constraints to QueryCategory and Query tables to prevent duplicates
- Improve concurrent query creation handling in CreateQueryResolver
- Fix metadata provider usage in entity server classes
- Remove automatic error logging from SQLServerDataProvider
