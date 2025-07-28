---
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/server": patch
---

feat: make DeleteQuery options parameter optional and refactor
GraphQLSystemUserClient methods

- Made options parameter optional in DeleteQuerySystemResolver with
  sensible defaults (SkipEntityAIActions: false, SkipEntityActions: false)
- Refactored GraphQLSystemUserClient method names for better usability by
  removing redundant "SystemUser" suffix
- Updated method signatures to use proper input types instead of
  individual parameters for better type safety
- Added DeleteQuery method and missing TypeScript interfaces to
  GraphQLSystemUserClient

The changes are marked as minor since they add new functionality
(optional parameters, new method) while maintaining backward
compatibility with existing method signatures.
