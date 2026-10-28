---
"@memberjunction/core-entities-server": patch
"@memberjunction/metadata-sync": patch
---

Query parameter extraction no longer overwrites parameters a person defined.

- A parameter whose `DetectionMethod` is `'Manual'` keeps its `DetectionMethod`, `Description`, `SampleValue`, `Type`, `IsRequired` and `DefaultValue` when extraction re-runs. Before, extraction forced every row back to `'AI'` and rewrote those fields.
- The SQL still decides which parameters exist: a `'Manual'` row the SQL no longer references is removed, and the removal is logged with the query and parameter name.
- When extraction finds no parameters, it now goes through `SyncParameters` with an empty list instead of `RemoveAllRecords`, which deleted every row without checking `DetectionMethod`.
- Extraction reads existing parameters, fields, entities and dependencies through the caller's provider instead of `QueryEngine`'s cache, and `MJQueryEntityServer`/`MJQuerySQLEntityServer` load the parent query and its `MJ: Query SQLs` rows through `ProviderToUse`. The cache could be stale (it refreshes on a debounce) and its entities are bound to a different connection than the one saving, so inside a transaction the delta could re-insert existing rows and hit `UQ_QueryParameter_QueryID_Name`.
- MetadataSync pull's `merge` and `overwrite` strategies now keep `collections`, `embeds` and `extension` on a file that already exists. Before, updating an existing record dropped them.
