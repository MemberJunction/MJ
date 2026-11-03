---
"@memberjunction/server": patch
---

`GetData` runs its queries through the read-only provider's `ExecuteSQL` instead of an mssql `Request`, so it works on PostgreSQL; it still never falls back to the read-write login and still refuses anything but a SELECT. `ExtendConnectionPoolWithQuery` (now deprecated) leaves a non-mssql pool such as the PostgreSQL compatibility pool unchanged instead of replacing its `query`. A test now fails if a hand-written resolver imports mssql or opens an mssql `Request`.
