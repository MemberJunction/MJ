---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
---

Skip redundant JavaScript `fullRecordJSON` serialization in `DatabaseProviderBase.BuildRecordChangePayload` when the database dialect builds `FullRecordJSON` directly from the returned row, and unlock the `GenericDatabaseProvider.CanCountFromBaseTable` `COUNT(*)` fast path for safe `EXISTS`/`IN`/scalar subqueries and PostgreSQL temporal expressions (`AT TIME ZONE`, `INTERVAL`, `EXTRACT`, `DATE_TRUNC`).
