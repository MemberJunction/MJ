---
"@memberjunction/generic-database-provider": patch
"@memberjunction/postgresql-dataprovider": patch
---

User search on PostgreSQL is case-insensitive, as on SQL Server: the built-in predicates compare `LOWER(column)` with `LOWER(term)`.
