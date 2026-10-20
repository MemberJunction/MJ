---
"@memberjunction/open-app-engine": patch
---

Open App schemas on SQL Server are now created owned by the MJ core schema's owner (usually `dbo`), so ownership chaining lets app views read core tables without per-table grants (MJ#4756). When the installer is not permitted to assign that owner, install still succeeds with a plain `CREATE SCHEMA` and a `Schema` warning names the consequence and the remedy. Upgrades, and installs that reuse an existing schema, now check before changing anything that the login has `CONTROL` on the app schema, which its migrations need to record their history and grant on their objects. If it doesn't, they stop with an error naming the owner, the login and the remedy. PostgreSQL is unchanged. The Open App README documents the retrofit for existing installs, including that `ALTER AUTHORIZATION` drops the schema's grants (objects, columns, types and XML schema collections included).
