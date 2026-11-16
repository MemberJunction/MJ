---
'@memberjunction/integration-schema-builder': patch
---

A `json` integration source column is created as `TEXT` on PostgreSQL instead of `JSONB` (it stays `NVARCHAR(MAX)` on SQL Server). MJ metadata reads the column as nvarchar, so CodeGen's CRUD functions take and write text, and PostgreSQL rejects text into a `JSONB` column.
