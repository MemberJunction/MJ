---
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
---

A query's parameters can now be declared in metadata instead of existing only because extraction inferred them.

Declaring a `MJ: Query Parameters` row under a `MJ: Queries` record used to fail the whole push with `Violation of UNIQUE KEY constraint 'UQ_QueryParameter_QueryID_Name'`. `MJQueryEntityServer.Save()` derives a query's parameters from its SQL after `super.Save()`, and a nested `relatedEntities` child is ordered *after* its parent because it carries the parent's foreign key — so extraction always created its own row first and the declared INSERT collided with it.

`MJ: Queries → MJ: Query Parameters` is now declared as a related-record collection named `Parameters`. Collection items are staged on the entity and written *inside* `super.Save()`, so extraction runs afterwards, sees the declared rows and reconciles with them by name. The ordering problem disappears rather than being worked around, and the write is covered by the save's own transaction. Author them under `collections.Parameters` and omit `QueryID` — the collection stamps the foreign key. Sync the collection in the default `upsert` mode; `authoritative` would delete the rows extraction owns.

Alongside it, extraction stops asserting over authored values:

- A parameter whose `DetectionMethod` is `'Manual'` is authoritative for how it is described: `DetectionMethod`, `Description`, `SampleValue`, `Type`, `IsRequired` and `DefaultValue` are left alone. That value is the column's own schema default and its documented meaning is "explicitly defined by a user".
- The SQL still decides *which* parameters exist, so a row it stops referencing is still removed whatever declared it — keeping it would break the query, because parameter validation demands a value for every `IsRequired` definition whether or not the SQL uses it. Removing a declared row now logs a warning naming the query and the parameter.
- The no-parameters case routes through `SyncParameters` with an empty list rather than `RemoveAllRecords`, which used to wipe declared rows silently because it was the one path that knew nothing about `DetectionMethod`.

Two long-standing cross-connection bugs in the same pipeline are fixed: `loadExistingRecords` now always reads through the caller's provider instead of trusting `QueryEngine`'s debounced cache, and `MJQuerySQLEntityServer`/`MJQueryEntityServer` resolve the parent query and its `MJ: Query SQLs` records through `ProviderToUse` rather than globally-bound cached entities. Both previously read or wrote over a different connection than the one saving the record, which inside a transaction could neither see its rows nor settle with it.

Fixes #4545.
