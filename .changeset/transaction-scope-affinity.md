---
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/core": patch
---

A transaction opened on a shared database provider no longer captures unrelated callers (#4786).

The transaction now belongs to the async scope that began it (tracked with `AsyncLocalStorage` in `GenericDatabaseProvider`): that scope and everything it starts run on the transaction; any other caller on the same provider instance — another request on the global `Metadata.Provider`, a background timer — runs on the pool. Previously every query issued through the instance while `_transaction` was set ran inside it, so an unrelated read ran on the transaction's connection, an unrelated write was rolled back with it, and reads that queued behind its COMMIT failed with "The ambient transaction ended before this query ran".

- SQL Server (`ExecuteSQL`, `ExecuteSQLBatch`) and PostgreSQL (`ExecuteSQL`, `RunColocatedSQL`) route to the transaction only for callers in its scope; `ignoreAmbientTransaction` keeps working inside the scope.
- Savepoint SQL always reaches the handle, whichever scope settles a frame.
- `RunAfterCommit` / `CapturePostCommitToken` from a caller outside the transaction no longer tie that caller's work to a transaction it is not part of — that work is held until the provider goes idle rather than run immediately, so it can never land on the connection that transaction is committing or rolling back on.
- A caller outside the scope that *begins* a transaction while one is open still joins it as a savepoint, now logged once per transaction.
- Work launched inside the scope that runs after it ends runs on the pool, as before, and never joins a later transaction.
