---
'@memberjunction/server': patch
'@memberjunction/core': patch
---

Fix the MergeRecords GraphQL mutation end-to-end. Server: rehydrate the input's plain `{ KeyValuePairs }` objects into `CompositeKey` class instances before calling the provider (every merge previously failed with "request.SurvivingRecordCompositeKey.Values is not a function"), and correct the `RecordMergeLogID` / `RecordMergeDeletionLogID` output field types from `Int` to `String` — merge log IDs are uniqueidentifiers since the v2 GUID migration, so successful merges failed at response serialization of the `RecordMergeLogID` GUID. Core: `CompleteMergeLogging` now writes each deletion log's ID back into `RecordStatus[].RecordMergeDeletionLogID` (it was created but never returned, so the field was always null), and `RecordMergeDetailResult.RecordMergeDeletionLogID` is typed `string | null` to match the GUID it actually carries (was `number | null`).
