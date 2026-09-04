---
"@memberjunction/core": patch
"@memberjunction/sql-dialect": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
---

Nested transactions (savepoints) now live on GenericDatabaseProvider so every database provider shares them. Depth 1 is a physical BEGIN; depth 2+ is a dialect savepoint on that same transaction. A savepoint error on a published handle (`ENOTBEGUN`/`EABORT`/`25P01`) is treated as a doomed ambient transaction — the handle is abandoned and the caller gets a loud error, instead of opening a second physical TX that would commit inner work after the outer writes were already rolled back. Nested begin with no physical TX is corruption, not recovery. `AfterPhysicalCommit` (SQL Server deferred tasks) runs after the mutex is released. Deprecated camelCase aliases (`transactionDepth`, `savepointStack`, `inTransaction`, `inNestedTransaction`) remain for one release. `ResetTransactionState()` is the public recovery path.
