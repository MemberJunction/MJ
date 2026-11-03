---
"@memberjunction/global": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
---

perf(graphql-dataprovider,server): request and return delta-only fields on Update mutations and transaction groups

- On `GraphQLDataProvider.Save()` `Update` (when `IgnoreDirtyState` is not set), narrow the GraphQL response selection set to primary keys, dirty fields, special date fields (`IsSpecialDateField`), and (when any foreign key field was dirtied) virtual fields, merging the delta response over `entity.GetAll()`.
- On `TransactionResolver.ExecuteTransactionGroup()`, return delta-only `ResultsJSON` for `Update` items containing primary keys, sent fields, transaction variables, special date fields, and any fields whose post-save value changed from the pre-update DB snapshot (using `ValuesEqual` from `@memberjunction/global`).
