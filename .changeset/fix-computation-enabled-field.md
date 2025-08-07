---
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
---

Fix: Remove non-existent ComputationEnabled field from Query operations

- Removed ComputationEnabled field from GraphQL mutations (CreateQuerySystemUser and UpdateQuerySystemUser) in GraphQLSystemUserClient
- Removed ComputationEnabled from QueryField TypeScript interface
- Fixed CreateQueryResolver to not set ComputationEnabled when mapping query fields
- This fixes GraphQL validation errors when creating or updating queries