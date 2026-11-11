---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
---

Wave 4.3a runtime SQL and `TransactionGroup` optimizations: release database locks (`CommitGroupTransaction` / `RollbackGroupTransaction`) before `TransactionNotifications$` and `LocalCacheManager.EndEntityEventBatch`, defer transactional `GeoCodeSyncService` HTTP I/O via `RunAfterCommit`, skip redundant post-hook `CheckCreateRLS` when `BeforeSave` leaves field state unchanged, quote `UserViewID` / `UserViewRunID` GUID filters, rewrite eligible `COUNT(*)` queries to `BaseTable`, extend bound-parameter RLS to `Load` and `CheckCreateRLS` / `CheckUpdateRLSPostImage`, chunk `SQLServerTransactionGroup.BatchedSubmit` under SQL Server's 2,100-parameter ceiling, and implement `ExecuteSQLBatch` + `UNION ALL` `getBatchedServerCacheStatus` on `PostgreSQLDataProvider`.
