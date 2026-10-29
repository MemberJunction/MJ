---
"@memberjunction/core": minor
"@memberjunction/sqlserver-dataprovider": minor
"@memberjunction/postgresql-dataprovider": minor
---

Re-base `SQLServerTransactionGroup` and `PostgreSQLTransactionGroup` onto their owning provider's `BeginTransaction()` / `CommitTransaction()` / `RollbackTransaction()` lifecycle (`CreateTransactionGroup()` now passes `this`), enabling per-request provider isolation, nested savepoints inside `provider.BeginTransaction()`, `TransactionAffinity` propagation, `RunAfterCommit` deferral until physical commit, and `OnSaveCompleted` execution on `TransactionGroup` saves.
