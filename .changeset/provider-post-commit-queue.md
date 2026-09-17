---
'@memberjunction/core': patch
'@memberjunction/generic-database-provider': patch
'@memberjunction/sqlserver-dataprovider': patch
'@memberjunction/actions-base': patch
'@memberjunction/actions': patch
---

Add a provider post-commit queue: `DatabaseProviderBase.RunAfterCommit(task, description, token?)` plus `CapturePostCommitToken()`, which returns a `PostCommitToken` naming the transaction frames open at that moment. Inside a transaction a task waits for the outermost commit and is discarded on rollback, failed commit, abandoned (doomed) transaction, or `ResetTransactionState`; a savepoint rollback discards only the tasks registered inside that savepoint. Work dispatched fire-and-forget by a save registers after the transaction may already have settled, so the entity-action and AI-action dispatchers capture a token before their first `await` and pass it along: the task then follows the transaction that caused it rather than whatever is open when it registers. SQL Server's deferred Entity AI Action queueing uses this, and Durable After* entity actions with no queue submitter (e.g. `mj sync push`) are handed to it instead of polling `TransactionDepth` on every tick — so they no longer busy-spin during a long transaction, and never fire for rows a rollback removed.
