---
'@memberjunction/integration-schema-builder': patch
'@memberjunction/sql-dialect': patch
---

PostgreSQL string columns wider than `VARCHAR` allows are created as `TEXT`. The integration schema builder treats a declared length at or past nvarchar(max) (1073741823) as unbounded instead of padding it, and the PostgreSQL dialect renders any `VARCHAR` width over 10485760 as `TEXT`, as SQL Server falls back to `NVARCHAR(MAX)` above 4000. A netFORUM source that reports nvarchar(max) as 2147483646 previously produced `VARCHAR(2147483946)`, and the migration failed at its first statement.
