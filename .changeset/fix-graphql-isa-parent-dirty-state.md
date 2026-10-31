---
"@memberjunction/graphql-dataprovider": patch
---

Preserve IS-A parent field dirty state and `OldValue` across `IsParentEntitySave` in `GraphQLDataProvider.Save()` and `GraphQLTransactionGroup` serialization, and invalidate stale parent snapshots if a leaf save aborts before reaching the provider.

