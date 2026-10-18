---
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
---

Optimize GraphQL entity `Update` return selection sets in `GraphQLDataProvider.Save()` (and `TransactionGroupResolver.PrepareReturnValue`) to request and return only primary keys, dirty fields, `__mj_CreatedAt` / `__mj_UpdatedAt` timestamps, and virtual fields when a foreign key is modified, merging the delta response onto loaded entity fields before applying field-level security.
