---
"@memberjunction/generic-database-provider": patch
---

A NULL `binary(n)` / `varbinary(n)` field no longer breaks the row-level-security synthetic row on SQL Server.

The Create and Update post-image RLS checks project NULL fields as typed `CAST(NULL AS <type>)`, with the length taken from `MaxLength`. `MaxLength` is a character count and is 0 for the binary types, so a NULL `varbinary(16)` became `CAST(NULL AS VARBINARY(0))`, which SQL Server rejects, and the save failed with a SQL error. Binary types now keep their byte length (`field.Length`). `varbinary(MAX)` and PostgreSQL (`BYTEA`) were not affected.
