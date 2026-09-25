---
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
---

Fix the `GetRecordDependencies` GraphQL contract (P1.2). The old client passed raw rows through, so `dep.PrimaryKey` was always undefined.
- In `@memberjunction/server`, `RecordDependencyResult` gains `PrimaryKey`, matching `RecordDependency` in `@memberjunction/core`, plus nullable `IsSoftLink` and `EntityIDFieldName`. `CompositeKey` stays as a deprecated alias carrying the same key, so older clients keep working; it will be removed in a later release.
- In `@memberjunction/graphql-dataprovider`, `GetRecordDependencies` selects `PrimaryKey`, `IsSoftLink` and `EntityIDFieldName` and rehydrates real `CompositeKey` instances.
- Wire change: a client from this release needs a server from this release (an older server has no `PrimaryKey` field).
