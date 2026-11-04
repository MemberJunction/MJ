---
"@memberjunction/core": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
---

Re-base `SQLServerTransactionGroup` and `PostgreSQLTransactionGroup` onto their owning provider's `BeginTransaction()` / `CommitTransaction()` / `RollbackTransaction()` lifecycle (`CreateTransactionGroup()` now passes `this`), enabling per-request provider isolation, nested savepoints inside `provider.BeginTransaction()`, `TransactionAffinity` propagation, `RunAfterCommit` deferral until physical commit, and `OnSaveCompleted` execution on `TransactionGroup` saves.
