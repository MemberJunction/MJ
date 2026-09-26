---
"@memberjunction/open-app-engine": patch
---

Open App schemas on SQL Server are now created owned by the MJ core schema's owner (usually `dbo`), so ownership chaining lets app views read core tables without per-table grants (MJ#4756). When the installer is not permitted to assign that owner, install still succeeds with a plain `CREATE SCHEMA` and a `Schema` warning names the consequence and the remedy. PostgreSQL is unchanged. The Open App README documents the retrofit for existing installs, including that `ALTER AUTHORIZATION` drops the schema's grants.
