---
"@memberjunction/core": patch
"@memberjunction/sql-dialect": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
---

Nested transactions live on GenericDatabaseProvider. Depth 1 is a physical BEGIN; depth 2+ is a dialect savepoint. A savepoint error on a published handle (`ENOTBEGUN`/`EABORT`/`25P01`) throws `DoomedTransactionError` instead of opening a second physical TX (torn write). Nested begin with no physical TX is corruption. Physical hooks are abstract; `AbandonPhysicalTransaction` unpublishes on EABORT; `AfterPhysicalCommit` runs after the mutex. `TransactionDepth` moved to `@memberjunction/core` with deprecated camelCase aliases (`transactionDepth`, `savepointStack`, `inTransaction`, `inNestedTransaction`) for one release. `ResetTransactionState()` replaces poking private fields. Upgraders: read `TransactionDepth` (not a duck-typed `transactionDepth` that would be undefined).
