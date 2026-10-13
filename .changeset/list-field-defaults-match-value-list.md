---
"@memberjunction/core-entities": minor
"@memberjunction/core": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/testing-integration": minor
"@memberjunction/codegen-lib": minor
---

Fix eight MJ core List fields whose SQL default was not one of their own values (#3985). `MJ: Queue Tasks`.Status now allows `Pending`, which `QueueManager.AddTask` writes and the column default already produced, so queued tasks (every after-save Entity AI Action) are no longer refused by the CHECK. Seven defaults move to a listed value: Audit Logs Status → `Success`, Authorization Roles Type → `Allow`, Record Merge Logs ProcessingStatus → `Started`, Version Installations Type → `New`, Conversation Details Role → `User`, and Entity AI Actions TriggerEvent/OutputType → `after save`/`field` (the latter was misspelled `FIeld`). The six affected `spCreate` procedures are regenerated with the new defaults. CodeGen's schema-to-metadata default sync now catches a default changed only in case, on both platforms: `spUpdateExistingEntityFieldsFromSchema` compares `DefaultValue` case-sensitively on SQL Server, and on PostgreSQL the new `fnDefaultValueChanged` adds a case-sensitive comparison of the quoted literal to the lower-casing normalizer, so equivalent spellings (`getutcdate()`/`now()`) still do not churn. New integration checks: `metadata-consistency.MC9` (every List default is an exact member of its value list) and `queue.QU8` (a task created at its default Status persists).
