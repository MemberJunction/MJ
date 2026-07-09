---
"@memberjunction/core": patch
---

Fix: a failed `TransactionGroup` no longer crashes the host process. `BaseEntity.Save()`'s `TransactionNotifications$` subscriber threw on transaction-group failure, but that handler runs asynchronously (after `Save()` has returned and its `try/catch` has unwound), so the throw escaped as an `uncaughtException` and exited the process — e.g. MJAPI would die on the first rolled-back transaction group (it guards `unhandledRejection` but not `uncaughtException`). The subscriber now records a failed `BaseEntityResult` on the entity's `ResultHistory` instead of throwing, mirroring the `Delete()` transaction-group path and MJ's Save-doesn't-throw contract. The transaction still rolls back, `Submit()` still returns `false`, and each entity's `LatestResult` carries the error.
