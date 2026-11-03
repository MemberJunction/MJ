---
"@memberjunction/graphql-dataprovider": patch
---

Send delta-only `EntityObjectJSON` (primary keys and dirty writable fields) on `Update` items in `GraphQLTransactionGroup` (`ExecuteTransactionGroup`), matching the singular GraphQL `Save()` delta wire protocol.
