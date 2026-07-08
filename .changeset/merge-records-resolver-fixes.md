---
'@memberjunction/server': patch
---

Fix the MergeRecords GraphQL mutation: rehydrate the input's plain `{ KeyValuePairs }` objects into `CompositeKey` class instances before calling the provider (every merge previously failed with "request.SurvivingRecordCompositeKey.Values is not a function"), and correct `RecordMergeLogID` / `RecordMergeDeletionLogID` field types from `Int` to `String` — Record Merge Log IDs are uniqueidentifiers since the v2 GUID migration, so successful merges failed at response serialization.
