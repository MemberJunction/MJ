---
"@memberjunction/codegen-lib": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/core-entities": patch
---

Fix: Query parameter validation and cascade delete transaction handling

- Added validation to ensure query parameters are JSON objects rather than arrays in GraphQL system user client
- Implemented automatic transaction wrapping for entities with CascadeDeletes enabled
- For database providers (server-side), delete operations are wrapped in
  BeginTransaction/CommitTransaction/RollbackTransaction
- For network providers (client-side), deletes pass through as cascade handling occurs server-side
- Ensures atomicity of cascade delete operations
