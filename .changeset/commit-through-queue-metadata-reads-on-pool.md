---
'@memberjunction/core': patch
'@memberjunction/generic-database-provider': patch
'@memberjunction/sqlserver-dataprovider': patch
'@memberjunction/postgresql-dataprovider': patch
---

fix: commit and rollback run inside the SQL Server provider's serial SQL queue, and the metadata dataset is read on the pool regardless of the ambient transaction

`SQLServerDataProvider` drained its instance SQL queue and then committed, leaving a microtask window in which a query enqueued after the drain could still race the handle — `ENOTBEGUN` for a caller that fired without awaiting, and `EINVALIDSTATE` / `ECLOSE` when the framework's own debounced metadata refresh was the concurrent caller. Commit and rollback are now items in the same strictly serial queue, so ordering is the queue's: everything enqueued before them has finished, everything after runs after, and a query that reaches the front after its ambient transaction ended is rejected with a message naming the cause instead of reaching mssql on a finished handle. A query on an explicit handle a caller passed in is never subject to that check. Closes MJ#4454.

`ExecuteSQLOptions` and `ExecuteSQLBatchOptions` gain `ignoreAmbientTransaction`, honored by both providers: the statement runs on the pool even while an ambient transaction is open. `GetDatasetByName` and `GetDatasetStatusByName` set it for `MJ_Metadata` only — that dataset is loaded by a timer-driven refresh that is not part of any caller's unit of work — while every other dataset keeps joining the ambient transaction so a caller that writes and then loads inside one transaction still sees its own rows. Closes MJ#4514.
