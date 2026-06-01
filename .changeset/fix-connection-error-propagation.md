---
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/generic-database-provider": patch
---

fix: re-throw connection errors from RunView/RunQuery instead of swallowing into Success=false

Preserve mssql ConnectionError type through executeSQLCore so GenericDatabaseProvider can structurally detect infrastructure failures (DB unreachable, pool closed) and re-throw them from InternalRunView and InternalRunQuery. Previously these were silently converted to { Success: false }, making it impossible for callers to distinguish "database is down" from "query returned no results."
