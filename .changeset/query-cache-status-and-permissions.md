---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
---

The SQL Server batched query cache-status check now reads the documented `TotalRows` column as well as `RowCount`, so a validated query written from the docs validates as current. The query cache permission check reads the permissions of the provider that owns the query instead of the global provider's, so a client connection that is not the global one no longer crashes or authorizes against another server's permissions.
