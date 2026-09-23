---
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
---

Fix the `GetRecordDependencies` GraphQL contract (P1.2):
- In `@memberjunction/server`, rename `RecordDependencyResult.CompositeKey` to `PrimaryKey` to match `RecordDependency` in `@memberjunction/core`, add nullable `IsSoftLink` and `EntityIDFieldName`, and pass them through from the provider.
- In `@memberjunction/graphql-dataprovider`, update `GetRecordDependencies` query selection set to include `PrimaryKey`, `IsSoftLink`, and `EntityIDFieldName`, and rehydrate real `CompositeKey` instances on the client.
