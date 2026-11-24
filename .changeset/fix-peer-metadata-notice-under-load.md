---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
---

Fix peer metadata change notices being silently dropped or stalled during concurrent background saves on SQL Server, eliminate redundant timestamp reads and `set`-notice jitter, and run the cross-server invalidation CI rig with `MJ_SERVER_ROLE=api`.
