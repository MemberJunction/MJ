---
"@memberjunction/core": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
"@memberjunction/integration-test-suite": patch
---

Check `TransactionGroup` updates for concurrent changes, as single-record saves already are. An update queued with `ConcurrencyCheck` of `'log'` or `'enforce'` (per save, or the provider-wide setting) now gets a locked read of its row inside the group's transaction, before any of the group's statements run; in `'enforce'` mode a conflict rolls back the whole group, `Submit()` returns `false`, and the conflicting entity's `LatestResult.ConcurrencyConflict` names the fields. Groups with checking off do no extra work, and batched submits stay batched. Grouped saves from the browser now send each update's old values, and `ExecuteTransactionGroup` checks them the way the single-record update mutation does, so a form that saves child records alongside its main record no longer silently overwrites another user's change. Adds integration test IT170.
