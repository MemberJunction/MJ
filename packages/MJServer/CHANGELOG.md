# Change Log - @memberjunction/server

## 2.79.0

### Patch Changes

- ddb84c4: fix: Add error handling to CreateQuerySystemUser resolver to prevent
  server crashes

  - Wrap Query Categories entity creation in try/catch block
  - Add null check after GetEntityObject call
  - Improve error messages with actual error details
  - Prevents "Entity Query Categories not found" from killing MJAPI
    process

- Updated dependencies [4bf2634]
- Updated dependencies [907e73f]
- Updated dependencies [db0e5ed]
- Updated dependencies [bad1a60]
  - @memberjunction/ai-agents@2.79.0
  - @memberjunction/ai-prompts@2.79.0
  - @memberjunction/core-entities@2.79.0
  - @memberjunction/core-entities-server@2.79.0
  - @memberjunction/global@2.79.0
  - @memberjunction/ai@2.79.0
  - @memberjunction/ai-core-plus@2.79.0
  - @memberjunction/ai-anthropic@2.79.0
  - @memberjunction/ai-groq@2.79.0
  - @memberjunction/ai-mistral@2.79.0
  - @memberjunction/ai-openai@2.79.0
  - @memberjunction/actions@2.79.0
  - @memberjunction/ai-agent-manager-actions@2.79.0
  - @memberjunction/aiengine@2.79.0
  - @memberjunction/actions-bizapps-accounting@2.79.0
  - @memberjunction/actions-bizapps-lms@2.79.0
  - @memberjunction/actions-bizapps-social@2.79.0
  - @memberjunction/core-actions@2.79.0
  - @memberjunction/entity-communications-server@2.79.0
  - @memberjunction/doc-utils@2.79.0
  - @memberjunction/external-change-detection@2.79.0
  - @memberjunction/graphql-dataprovider@2.79.0
  - @memberjunction/data-context@2.79.0
  - @memberjunction/queue@2.79.0
  - @memberjunction/storage@2.79.0
  - @memberjunction/sqlserver-dataprovider@2.79.0
  - @memberjunction/templates@2.79.0
  - @memberjunction/ai-cerebras@2.79.0
  - @memberjunction/ai-vectors-pinecone@2.79.0
  - @memberjunction/actions-bizapps-crm@2.79.0
  - @memberjunction/core@2.79.0
  - @memberjunction/data-context-server@2.79.0
  - @memberjunction/skip-types@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [ef7c014]
- Updated dependencies [06088e5]
  - @memberjunction/ai-agents@2.78.0
  - @memberjunction/ai@2.78.0
  - @memberjunction/ai-prompts@2.78.0
  - @memberjunction/core-entities@2.78.0
  - @memberjunction/ai-core-plus@2.78.0
  - @memberjunction/aiengine@2.78.0
  - @memberjunction/ai-anthropic@2.78.0
  - @memberjunction/ai-cerebras@2.78.0
  - @memberjunction/ai-groq@2.78.0
  - @memberjunction/ai-mistral@2.78.0
  - @memberjunction/ai-openai@2.78.0
  - @memberjunction/actions@2.78.0
  - @memberjunction/queue@2.78.0
  - @memberjunction/sqlserver-dataprovider@2.78.0
  - @memberjunction/templates@2.78.0
  - @memberjunction/core-entities-server@2.78.0
  - @memberjunction/ai-agent-manager-actions@2.78.0
  - @memberjunction/actions-bizapps-accounting@2.78.0
  - @memberjunction/actions-bizapps-lms@2.78.0
  - @memberjunction/actions-bizapps-social@2.78.0
  - @memberjunction/core-actions@2.78.0
  - @memberjunction/entity-communications-server@2.78.0
  - @memberjunction/doc-utils@2.78.0
  - @memberjunction/external-change-detection@2.78.0
  - @memberjunction/graphql-dataprovider@2.78.0
  - @memberjunction/data-context@2.78.0
  - @memberjunction/storage@2.78.0
  - @memberjunction/ai-vectors-pinecone@2.78.0
  - @memberjunction/actions-bizapps-crm@2.78.0
  - @memberjunction/data-context-server@2.78.0
  - @memberjunction/skip-types@2.78.0
  - @memberjunction/core@2.78.0
  - @memberjunction/global@2.78.0

## 2.77.0

### Minor Changes

- d8f14a2: significant changes in all of these
- c91269e: migration file for permissions driving minor bump

### Patch Changes

- ba11eea: bug fix
- Updated dependencies [476a458]
- Updated dependencies [d8f14a2]
- Updated dependencies [8ee0d86]
- Updated dependencies [c91269e]
  - @memberjunction/sqlserver-dataprovider@2.77.0
  - @memberjunction/core@2.77.0
  - @memberjunction/graphql-dataprovider@2.77.0
  - @memberjunction/core-entities@2.77.0
  - @memberjunction/external-change-detection@2.77.0
  - @memberjunction/core-entities-server@2.77.0
  - @memberjunction/ai-agent-manager-actions@2.77.0
  - @memberjunction/ai-agents@2.77.0
  - @memberjunction/ai-core-plus@2.77.0
  - @memberjunction/aiengine@2.77.0
  - @memberjunction/ai-prompts@2.77.0
  - @memberjunction/ai-vectors-pinecone@2.77.0
  - @memberjunction/actions-bizapps-accounting@2.77.0
  - @memberjunction/actions-bizapps-crm@2.77.0
  - @memberjunction/actions-bizapps-lms@2.77.0
  - @memberjunction/actions-bizapps-social@2.77.0
  - @memberjunction/core-actions@2.77.0
  - @memberjunction/actions@2.77.0
  - @memberjunction/entity-communications-server@2.77.0
  - @memberjunction/doc-utils@2.77.0
  - @memberjunction/data-context@2.77.0
  - @memberjunction/queue@2.77.0
  - @memberjunction/storage@2.77.0
  - @memberjunction/skip-types@2.77.0
  - @memberjunction/templates@2.77.0
  - @memberjunction/data-context-server@2.77.0
  - @memberjunction/ai@2.77.0
  - @memberjunction/ai-anthropic@2.77.0
  - @memberjunction/ai-cerebras@2.77.0
  - @memberjunction/ai-groq@2.77.0
  - @memberjunction/ai-mistral@2.77.0
  - @memberjunction/ai-openai@2.77.0
  - @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- 087595d: feat: make DeleteQuery options parameter optional and refactor
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

- Updated dependencies [f1e5990]
- Updated dependencies [b9a94a9]
- Updated dependencies [4b27b3c]
- Updated dependencies [087595d]
- Updated dependencies [7dabb22]
- Updated dependencies [ffda243]
  - @memberjunction/graphql-dataprovider@2.76.0
  - @memberjunction/ai-agents@2.76.0
  - @memberjunction/core-entities@2.76.0
  - @memberjunction/core-entities-server@2.76.0
  - @memberjunction/core@2.76.0
  - @memberjunction/sqlserver-dataprovider@2.76.0
  - @memberjunction/ai-agent-manager-actions@2.76.0
  - @memberjunction/ai-core-plus@2.76.0
  - @memberjunction/aiengine@2.76.0
  - @memberjunction/ai-prompts@2.76.0
  - @memberjunction/actions-bizapps-accounting@2.76.0
  - @memberjunction/actions-bizapps-lms@2.76.0
  - @memberjunction/actions-bizapps-social@2.76.0
  - @memberjunction/core-actions@2.76.0
  - @memberjunction/actions@2.76.0
  - @memberjunction/entity-communications-server@2.76.0
  - @memberjunction/doc-utils@2.76.0
  - @memberjunction/external-change-detection@2.76.0
  - @memberjunction/data-context@2.76.0
  - @memberjunction/queue@2.76.0
  - @memberjunction/storage@2.76.0
  - @memberjunction/templates@2.76.0
  - @memberjunction/ai-vectors-pinecone@2.76.0
  - @memberjunction/actions-bizapps-crm@2.76.0
  - @memberjunction/skip-types@2.76.0
  - @memberjunction/data-context-server@2.76.0
  - @memberjunction/ai@2.76.0
  - @memberjunction/ai-anthropic@2.76.0
  - @memberjunction/ai-cerebras@2.76.0
  - @memberjunction/ai-groq@2.76.0
  - @memberjunction/ai-mistral@2.76.0
  - @memberjunction/ai-openai@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Minor Changes

- 66640d6: This update brings the GraphQLSystemUserClient to feature parity with the
  standard GraphQLDataProvider by adding full Parameters support for
  templated queries, pagination capabilities, and the missing
  GetQueryDataByNameSystemUser resolver.

  Key Features:

  - Parameters support for templated queries (enabling AI cost calculations)
  - MaxRows and StartRow pagination support
  - Complete resolver coverage for system user operations
  - Fixed TypeScript compilation errors with missing TotalRowCount fields
  - Updated both GetQueryDataSystemUser and GetQueryDataByNameSystemUser
    methods with full parameter support

    - Added missing GetQueryDataByNameSystemUser resolver with proper
      @RequireSystemUser decoration
    - Fixed error handling cases to include required TotalRowCount field
    - Updated GraphQL query strings to include TotalRowCount and
      AppliedParameters fields

    This enables system user clients to leverage MemberJunction v2.74's
    templated query functionality, particularly important for AI cost tracking
    and other parameterized operations.

### Patch Changes

- Updated dependencies [9ccd145]
- Updated dependencies [0da7b51]
- Updated dependencies [66640d6]
- Updated dependencies [6a65fad]
  - @memberjunction/ai-prompts@2.75.0
  - @memberjunction/skip-types@2.75.0
  - @memberjunction/graphql-dataprovider@2.75.0
  - @memberjunction/ai-agents@2.75.0
  - @memberjunction/actions@2.75.0
  - @memberjunction/core-entities-server@2.75.0
  - @memberjunction/ai-agent-manager-actions@2.75.0
  - @memberjunction/actions-bizapps-accounting@2.75.0
  - @memberjunction/actions-bizapps-crm@2.75.0
  - @memberjunction/actions-bizapps-lms@2.75.0
  - @memberjunction/actions-bizapps-social@2.75.0
  - @memberjunction/core-actions@2.75.0
  - @memberjunction/sqlserver-dataprovider@2.75.0
  - @memberjunction/external-change-detection@2.75.0
  - @memberjunction/ai@2.75.0
  - @memberjunction/ai-core-plus@2.75.0
  - @memberjunction/aiengine@2.75.0
  - @memberjunction/ai-anthropic@2.75.0
  - @memberjunction/ai-cerebras@2.75.0
  - @memberjunction/ai-groq@2.75.0
  - @memberjunction/ai-mistral@2.75.0
  - @memberjunction/ai-openai@2.75.0
  - @memberjunction/ai-vectors-pinecone@2.75.0
  - @memberjunction/entity-communications-server@2.75.0
  - @memberjunction/doc-utils@2.75.0
  - @memberjunction/core@2.75.0
  - @memberjunction/core-entities@2.75.0
  - @memberjunction/data-context@2.75.0
  - @memberjunction/data-context-server@2.75.0
  - @memberjunction/global@2.75.0
  - @memberjunction/queue@2.75.0
  - @memberjunction/storage@2.75.0
  - @memberjunction/templates@2.75.0

## 2.74.0

### Patch Changes

- Updated dependencies [b70301e]
- Updated dependencies [9ff358d]
- Updated dependencies [d316670]
  - @memberjunction/core-entities@2.74.0
  - @memberjunction/core-entities-server@2.74.0
  - @memberjunction/ai-agents@2.74.0
  - @memberjunction/ai-prompts@2.74.0
  - @memberjunction/core@2.74.0
  - @memberjunction/ai-agent-manager-actions@2.74.0
  - @memberjunction/ai-core-plus@2.74.0
  - @memberjunction/aiengine@2.74.0
  - @memberjunction/actions-bizapps-accounting@2.74.0
  - @memberjunction/actions-bizapps-lms@2.74.0
  - @memberjunction/actions-bizapps-social@2.74.0
  - @memberjunction/core-actions@2.74.0
  - @memberjunction/actions@2.74.0
  - @memberjunction/entity-communications-server@2.74.0
  - @memberjunction/doc-utils@2.74.0
  - @memberjunction/external-change-detection@2.74.0
  - @memberjunction/graphql-dataprovider@2.74.0
  - @memberjunction/data-context@2.74.0
  - @memberjunction/queue@2.74.0
  - @memberjunction/storage@2.74.0
  - @memberjunction/sqlserver-dataprovider@2.74.0
  - @memberjunction/templates@2.74.0
  - @memberjunction/ai-vectors-pinecone@2.74.0
  - @memberjunction/actions-bizapps-crm@2.74.0
  - @memberjunction/skip-types@2.74.0
  - @memberjunction/data-context-server@2.74.0
  - @memberjunction/ai@2.74.0
  - @memberjunction/ai-anthropic@2.74.0
  - @memberjunction/ai-cerebras@2.74.0
  - @memberjunction/ai-groq@2.74.0
  - @memberjunction/ai-mistral@2.74.0
  - @memberjunction/ai-openai@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- 26c2b03: Added Load function to AIEngine package and call it from MJServer to prevent tree shaking.
- 4863660: - Replace error throwing with warning logging for entity save
  inconsistencies

  - Add ErrorLog table record creation for proper tracking and debugging
  - Maintain existing LogError functionality for immediate logging
  - Allow save operations to continue instead of being cancelled
  - Add structured logging with entity name, differences, and overlap
    details

  **Impact:**

  - Users can now successfully save records that previously failed due to
    inconsistent state
  - All inconsistencies are still logged for debugging purposes
  - No breaking changes to existing functionality

- Updated dependencies [26c2b03]
- Updated dependencies [eab6a48]
- Updated dependencies [e99336f]
- Updated dependencies [9801456]
- Updated dependencies [eebfb9a]
  - @memberjunction/aiengine@2.73.0
  - @memberjunction/ai-agents@2.73.0
  - @memberjunction/ai-prompts@2.73.0
  - @memberjunction/core-entities@2.73.0
  - @memberjunction/ai@2.73.0
  - @memberjunction/ai-vectors-pinecone@2.73.0
  - @memberjunction/actions@2.73.0
  - @memberjunction/core-entities-server@2.73.0
  - @memberjunction/queue@2.73.0
  - @memberjunction/sqlserver-dataprovider@2.73.0
  - @memberjunction/templates@2.73.0
  - @memberjunction/ai-agent-manager-actions@2.73.0
  - @memberjunction/ai-core-plus@2.73.0
  - @memberjunction/actions-bizapps-accounting@2.73.0
  - @memberjunction/actions-bizapps-lms@2.73.0
  - @memberjunction/actions-bizapps-social@2.73.0
  - @memberjunction/core-actions@2.73.0
  - @memberjunction/entity-communications-server@2.73.0
  - @memberjunction/doc-utils@2.73.0
  - @memberjunction/external-change-detection@2.73.0
  - @memberjunction/graphql-dataprovider@2.73.0
  - @memberjunction/data-context@2.73.0
  - @memberjunction/storage@2.73.0
  - @memberjunction/ai-anthropic@2.73.0
  - @memberjunction/ai-cerebras@2.73.0
  - @memberjunction/ai-groq@2.73.0
  - @memberjunction/ai-mistral@2.73.0
  - @memberjunction/ai-openai@2.73.0
  - @memberjunction/actions-bizapps-crm@2.73.0
  - @memberjunction/data-context-server@2.73.0
  - @memberjunction/skip-types@2.73.0
  - @memberjunction/core@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Minor Changes

- 636b6ee: migration

### Patch Changes

- Updated dependencies [636b6ee]
- Updated dependencies [57375c3]
  - @memberjunction/core-entities@2.72.0
  - @memberjunction/ai-agents@2.72.0
  - @memberjunction/ai-agent-manager-actions@2.72.0
  - @memberjunction/ai-core-plus@2.72.0
  - @memberjunction/aiengine@2.72.0
  - @memberjunction/ai-prompts@2.72.0
  - @memberjunction/actions-bizapps-accounting@2.72.0
  - @memberjunction/actions-bizapps-lms@2.72.0
  - @memberjunction/actions-bizapps-social@2.72.0
  - @memberjunction/core-actions@2.72.0
  - @memberjunction/actions@2.72.0
  - @memberjunction/entity-communications-server@2.72.0
  - @memberjunction/doc-utils@2.72.0
  - @memberjunction/external-change-detection@2.72.0
  - @memberjunction/graphql-dataprovider@2.72.0
  - @memberjunction/core-entities-server@2.72.0
  - @memberjunction/data-context@2.72.0
  - @memberjunction/queue@2.72.0
  - @memberjunction/storage@2.72.0
  - @memberjunction/sqlserver-dataprovider@2.72.0
  - @memberjunction/templates@2.72.0
  - @memberjunction/ai-vectors-pinecone@2.72.0
  - @memberjunction/actions-bizapps-crm@2.72.0
  - @memberjunction/data-context-server@2.72.0
  - @memberjunction/skip-types@2.72.0
  - @memberjunction/ai@2.72.0
  - @memberjunction/ai-anthropic@2.72.0
  - @memberjunction/ai-cerebras@2.72.0
  - @memberjunction/ai-groq@2.72.0
  - @memberjunction/ai-mistral@2.72.0
  - @memberjunction/ai-openai@2.72.0
  - @memberjunction/core@2.72.0
  - @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [11e9d0b]
- Updated dependencies [5a127bb]
- Updated dependencies [91188ab]
  - @memberjunction/global@2.71.0
  - @memberjunction/ai-agents@2.71.0
  - @memberjunction/ai-agent-manager-actions@2.71.0
  - @memberjunction/ai@2.71.0
  - @memberjunction/ai-core-plus@2.71.0
  - @memberjunction/aiengine@2.71.0
  - @memberjunction/ai-prompts@2.71.0
  - @memberjunction/ai-anthropic@2.71.0
  - @memberjunction/ai-cerebras@2.71.0
  - @memberjunction/ai-groq@2.71.0
  - @memberjunction/ai-mistral@2.71.0
  - @memberjunction/ai-openai@2.71.0
  - @memberjunction/ai-vectors-pinecone@2.71.0
  - @memberjunction/actions-bizapps-accounting@2.71.0
  - @memberjunction/actions-bizapps-crm@2.71.0
  - @memberjunction/actions-bizapps-lms@2.71.0
  - @memberjunction/actions-bizapps-social@2.71.0
  - @memberjunction/core-actions@2.71.0
  - @memberjunction/actions@2.71.0
  - @memberjunction/entity-communications-server@2.71.0
  - @memberjunction/doc-utils@2.71.0
  - @memberjunction/external-change-detection@2.71.0
  - @memberjunction/graphql-dataprovider@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/core-entities@2.71.0
  - @memberjunction/core-entities-server@2.71.0
  - @memberjunction/data-context@2.71.0
  - @memberjunction/data-context-server@2.71.0
  - @memberjunction/queue@2.71.0
  - @memberjunction/storage@2.71.0
  - @memberjunction/sqlserver-dataprovider@2.71.0
  - @memberjunction/skip-types@2.71.0
  - @memberjunction/templates@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/ai-agents@2.70.0
  - @memberjunction/ai-core-plus@2.70.0
  - @memberjunction/ai-prompts@2.70.0
  - @memberjunction/skip-types@2.70.0
  - @memberjunction/ai-agent-manager-actions@2.70.0
  - @memberjunction/ai@2.70.0
  - @memberjunction/aiengine@2.70.0
  - @memberjunction/ai-anthropic@2.70.0
  - @memberjunction/ai-cerebras@2.70.0
  - @memberjunction/ai-groq@2.70.0
  - @memberjunction/ai-mistral@2.70.0
  - @memberjunction/ai-openai@2.70.0
  - @memberjunction/ai-vectors-pinecone@2.70.0
  - @memberjunction/actions-bizapps-accounting@2.70.0
  - @memberjunction/actions-bizapps-crm@2.70.0
  - @memberjunction/actions-bizapps-lms@2.70.0
  - @memberjunction/actions-bizapps-social@2.70.0
  - @memberjunction/core-actions@2.70.0
  - @memberjunction/actions@2.70.0
  - @memberjunction/entity-communications-server@2.70.0
  - @memberjunction/doc-utils@2.70.0
  - @memberjunction/external-change-detection@2.70.0
  - @memberjunction/graphql-dataprovider@2.70.0
  - @memberjunction/core@2.70.0
  - @memberjunction/core-entities@2.70.0
  - @memberjunction/core-entities-server@2.70.0
  - @memberjunction/data-context@2.70.0
  - @memberjunction/data-context-server@2.70.0
  - @memberjunction/queue@2.70.0
  - @memberjunction/storage@2.70.0
  - @memberjunction/sqlserver-dataprovider@2.70.0
  - @memberjunction/templates@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/ai-agent-manager-actions@2.69.1
  - @memberjunction/ai-agents@2.69.1
  - @memberjunction/ai-core-plus@2.69.1
  - @memberjunction/aiengine@2.69.1
  - @memberjunction/ai-prompts@2.69.1
  - @memberjunction/ai-vectors-pinecone@2.69.1
  - @memberjunction/actions-bizapps-accounting@2.69.1
  - @memberjunction/actions-bizapps-crm@2.69.1
  - @memberjunction/actions-bizapps-lms@2.69.1
  - @memberjunction/actions-bizapps-social@2.69.1
  - @memberjunction/core-actions@2.69.1
  - @memberjunction/actions@2.69.1
  - @memberjunction/entity-communications-server@2.69.1
  - @memberjunction/doc-utils@2.69.1
  - @memberjunction/external-change-detection@2.69.1
  - @memberjunction/graphql-dataprovider@2.69.1
  - @memberjunction/core-entities@2.69.1
  - @memberjunction/core-entities-server@2.69.1
  - @memberjunction/data-context@2.69.1
  - @memberjunction/queue@2.69.1
  - @memberjunction/storage@2.69.1
  - @memberjunction/sqlserver-dataprovider@2.69.1
  - @memberjunction/skip-types@2.69.1
  - @memberjunction/templates@2.69.1
  - @memberjunction/data-context-server@2.69.1
  - @memberjunction/ai@2.69.1
  - @memberjunction/ai-anthropic@2.69.1
  - @memberjunction/ai-cerebras@2.69.1
  - @memberjunction/ai-groq@2.69.1
  - @memberjunction/ai-mistral@2.69.1
  - @memberjunction/ai-openai@2.69.1
  - @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
- Updated dependencies [b4a92ae]
  - @memberjunction/ai-agents@2.69.0
  - @memberjunction/ai-prompts@2.69.0
  - @memberjunction/core@2.69.0
  - @memberjunction/global@2.69.0
  - @memberjunction/actions@2.69.0
  - @memberjunction/core-entities-server@2.69.0
  - @memberjunction/ai-agent-manager-actions@2.69.0
  - @memberjunction/ai-core-plus@2.69.0
  - @memberjunction/aiengine@2.69.0
  - @memberjunction/ai-vectors-pinecone@2.69.0
  - @memberjunction/actions-bizapps-accounting@2.69.0
  - @memberjunction/actions-bizapps-crm@2.69.0
  - @memberjunction/actions-bizapps-lms@2.69.0
  - @memberjunction/actions-bizapps-social@2.69.0
  - @memberjunction/core-actions@2.69.0
  - @memberjunction/entity-communications-server@2.69.0
  - @memberjunction/doc-utils@2.69.0
  - @memberjunction/external-change-detection@2.69.0
  - @memberjunction/graphql-dataprovider@2.69.0
  - @memberjunction/core-entities@2.69.0
  - @memberjunction/data-context@2.69.0
  - @memberjunction/queue@2.69.0
  - @memberjunction/storage@2.69.0
  - @memberjunction/sqlserver-dataprovider@2.69.0
  - @memberjunction/skip-types@2.69.0
  - @memberjunction/templates@2.69.0
  - @memberjunction/ai@2.69.0
  - @memberjunction/ai-anthropic@2.69.0
  - @memberjunction/ai-cerebras@2.69.0
  - @memberjunction/ai-groq@2.69.0
  - @memberjunction/ai-mistral@2.69.0
  - @memberjunction/ai-openai@2.69.0
  - @memberjunction/data-context-server@2.69.0

## 2.68.0

### Patch Changes

- 799982f: Fix AI prompt cost calculations by loading BaseAIEngine during server
  initialization.

  AI prompt runs were not calculating costs because price unit type
  calculators weren't being registered in the ClassFactory system. This
  fix ensures the BaseAIEngine module loads properly, enabling automatic
  cost calculation based on token usage and model pricing configurations.

- Updated dependencies [a6b43d0]
- Updated dependencies [6fa0b2d]
- Updated dependencies [f9625d0]
- Updated dependencies [9fac8a4]
- Updated dependencies [b10b7e6]
- Updated dependencies [a0ed038]
- Updated dependencies [0f38a61]
- Updated dependencies [61c6572]
  - @memberjunction/sqlserver-dataprovider@2.68.0
  - @memberjunction/ai-prompts@2.68.0
  - @memberjunction/ai-agents@2.68.0
  - @memberjunction/core@2.68.0
  - @memberjunction/skip-types@2.68.0
  - @memberjunction/core-entities-server@2.68.0
  - @memberjunction/external-change-detection@2.68.0
  - @memberjunction/actions@2.68.0
  - @memberjunction/ai-agent-manager-actions@2.68.0
  - @memberjunction/ai-core-plus@2.68.0
  - @memberjunction/aiengine@2.68.0
  - @memberjunction/ai-vectors-pinecone@2.68.0
  - @memberjunction/actions-bizapps-accounting@2.68.0
  - @memberjunction/actions-bizapps-crm@2.68.0
  - @memberjunction/actions-bizapps-lms@2.68.0
  - @memberjunction/actions-bizapps-social@2.68.0
  - @memberjunction/core-actions@2.68.0
  - @memberjunction/entity-communications-server@2.68.0
  - @memberjunction/doc-utils@2.68.0
  - @memberjunction/graphql-dataprovider@2.68.0
  - @memberjunction/core-entities@2.68.0
  - @memberjunction/data-context@2.68.0
  - @memberjunction/queue@2.68.0
  - @memberjunction/storage@2.68.0
  - @memberjunction/templates@2.68.0
  - @memberjunction/data-context-server@2.68.0
  - @memberjunction/ai@2.68.0
  - @memberjunction/ai-anthropic@2.68.0
  - @memberjunction/ai-cerebras@2.68.0
  - @memberjunction/ai-groq@2.68.0
  - @memberjunction/ai-mistral@2.68.0
  - @memberjunction/ai-openai@2.68.0
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- 1057060: Log config file
- Updated dependencies [1fbfc26]
  - @memberjunction/sqlserver-dataprovider@2.67.0
  - @memberjunction/external-change-detection@2.67.0
  - @memberjunction/core-entities-server@2.67.0
  - @memberjunction/core-actions@2.67.0
  - @memberjunction/ai-agent-manager-actions@2.67.0
  - @memberjunction/ai-agents@2.67.0
  - @memberjunction/ai@2.67.0
  - @memberjunction/ai-core-plus@2.67.0
  - @memberjunction/aiengine@2.67.0
  - @memberjunction/ai-prompts@2.67.0
  - @memberjunction/ai-anthropic@2.67.0
  - @memberjunction/ai-cerebras@2.67.0
  - @memberjunction/ai-groq@2.67.0
  - @memberjunction/ai-mistral@2.67.0
  - @memberjunction/ai-openai@2.67.0
  - @memberjunction/ai-vectors-pinecone@2.67.0
  - @memberjunction/actions-bizapps-accounting@2.67.0
  - @memberjunction/actions-bizapps-crm@2.67.0
  - @memberjunction/actions-bizapps-lms@2.67.0
  - @memberjunction/actions-bizapps-social@2.67.0
  - @memberjunction/actions@2.67.0
  - @memberjunction/entity-communications-server@2.67.0
  - @memberjunction/doc-utils@2.67.0
  - @memberjunction/graphql-dataprovider@2.67.0
  - @memberjunction/core@2.67.0
  - @memberjunction/core-entities@2.67.0
  - @memberjunction/data-context@2.67.0
  - @memberjunction/data-context-server@2.67.0
  - @memberjunction/global@2.67.0
  - @memberjunction/queue@2.67.0
  - @memberjunction/storage@2.67.0
  - @memberjunction/skip-types@2.67.0
  - @memberjunction/templates@2.67.0

## 2.66.0

### Minor Changes

- 7e22e3e: Child Generated Actions - completed implementation!

### Patch Changes

- Updated dependencies [8d3d322]
- Updated dependencies [1be2d4c]
- Updated dependencies [7e22e3e]
- Updated dependencies [a4f3631]
- Updated dependencies [22c1340]
  - @memberjunction/ai-agents@2.66.0
  - @memberjunction/core-actions@2.66.0
  - @memberjunction/actions@2.66.0
  - @memberjunction/core-entities-server@2.66.0
  - @memberjunction/skip-types@2.66.0
  - @memberjunction/ai-agent-manager-actions@2.66.0
  - @memberjunction/ai-core-plus@2.66.0
  - @memberjunction/aiengine@2.66.0
  - @memberjunction/actions-bizapps-lms@2.66.0
  - @memberjunction/actions-bizapps-social@2.66.0
  - @memberjunction/graphql-dataprovider@2.66.0
  - @memberjunction/actions-bizapps-accounting@2.66.0
  - @memberjunction/actions-bizapps-crm@2.66.0
  - @memberjunction/sqlserver-dataprovider@2.66.0
  - @memberjunction/ai-prompts@2.66.0
  - @memberjunction/ai-vectors-pinecone@2.66.0
  - @memberjunction/queue@2.66.0
  - @memberjunction/templates@2.66.0
  - @memberjunction/external-change-detection@2.66.0
  - @memberjunction/entity-communications-server@2.66.0
  - @memberjunction/ai@2.66.0
  - @memberjunction/ai-anthropic@2.66.0
  - @memberjunction/ai-cerebras@2.66.0
  - @memberjunction/ai-groq@2.66.0
  - @memberjunction/ai-mistral@2.66.0
  - @memberjunction/ai-openai@2.66.0
  - @memberjunction/doc-utils@2.66.0
  - @memberjunction/core@2.66.0
  - @memberjunction/core-entities@2.66.0
  - @memberjunction/data-context@2.66.0
  - @memberjunction/data-context-server@2.66.0
  - @memberjunction/global@2.66.0
  - @memberjunction/storage@2.66.0

## 2.65.0

### Patch Changes

- 2fab5e6: fix MaxRows parameter
- Updated dependencies [1d034b7]
- Updated dependencies [619488f]
- Updated dependencies [b029c5d]
  - @memberjunction/ai-agents@2.65.0
  - @memberjunction/ai@2.65.0
  - @memberjunction/ai-core-plus@2.65.0
  - @memberjunction/global@2.65.0
  - @memberjunction/sqlserver-dataprovider@2.65.0
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/aiengine@2.65.0
  - @memberjunction/ai-prompts@2.65.0
  - @memberjunction/ai-anthropic@2.65.0
  - @memberjunction/ai-cerebras@2.65.0
  - @memberjunction/ai-groq@2.65.0
  - @memberjunction/ai-mistral@2.65.0
  - @memberjunction/ai-openai@2.65.0
  - @memberjunction/actions@2.65.0
  - @memberjunction/queue@2.65.0
  - @memberjunction/templates@2.65.0
  - @memberjunction/core-actions@2.65.0
  - @memberjunction/core-entities-server@2.65.0
  - @memberjunction/ai-agent-manager-actions@2.65.0
  - @memberjunction/ai-vectors-pinecone@2.65.0
  - @memberjunction/actions-bizapps-accounting@2.65.0
  - @memberjunction/actions-bizapps-crm@2.65.0
  - @memberjunction/actions-bizapps-lms@2.65.0
  - @memberjunction/actions-bizapps-social@2.65.0
  - @memberjunction/entity-communications-server@2.65.0
  - @memberjunction/doc-utils@2.65.0
  - @memberjunction/external-change-detection@2.65.0
  - @memberjunction/graphql-dataprovider@2.65.0
  - @memberjunction/core@2.65.0
  - @memberjunction/data-context@2.65.0
  - @memberjunction/data-context-server@2.65.0
  - @memberjunction/storage@2.65.0
  - @memberjunction/skip-types@2.65.0

## 2.64.0

### Minor Changes

- e775f2b: Found bug in metadata extraction from SQL Server, fixed and migration to capture changes for 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/core-entities-server@2.64.0
  - @memberjunction/skip-types@2.64.0
  - @memberjunction/ai-agent-manager-actions@2.64.0
  - @memberjunction/ai-agents@2.64.0
  - @memberjunction/ai-core-plus@2.64.0
  - @memberjunction/aiengine@2.64.0
  - @memberjunction/ai-prompts@2.64.0
  - @memberjunction/actions-bizapps-accounting@2.64.0
  - @memberjunction/actions-bizapps-lms@2.64.0
  - @memberjunction/actions-bizapps-social@2.64.0
  - @memberjunction/core-actions@2.64.0
  - @memberjunction/actions@2.64.0
  - @memberjunction/entity-communications-server@2.64.0
  - @memberjunction/doc-utils@2.64.0
  - @memberjunction/external-change-detection@2.64.0
  - @memberjunction/graphql-dataprovider@2.64.0
  - @memberjunction/data-context@2.64.0
  - @memberjunction/queue@2.64.0
  - @memberjunction/storage@2.64.0
  - @memberjunction/sqlserver-dataprovider@2.64.0
  - @memberjunction/templates@2.64.0
  - @memberjunction/ai-vectors-pinecone@2.64.0
  - @memberjunction/actions-bizapps-crm@2.64.0
  - @memberjunction/data-context-server@2.64.0
  - @memberjunction/ai@2.64.0
  - @memberjunction/ai-anthropic@2.64.0
  - @memberjunction/ai-cerebras@2.64.0
  - @memberjunction/ai-groq@2.64.0
  - @memberjunction/ai-mistral@2.64.0
  - @memberjunction/ai-openai@2.64.0
  - @memberjunction/core@2.64.0
  - @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/ai-agent-manager-actions@2.63.1
  - @memberjunction/ai-agents@2.63.1
  - @memberjunction/ai@2.63.1
  - @memberjunction/ai-core-plus@2.63.1
  - @memberjunction/aiengine@2.63.1
  - @memberjunction/ai-prompts@2.63.1
  - @memberjunction/ai-anthropic@2.63.1
  - @memberjunction/ai-cerebras@2.63.1
  - @memberjunction/ai-groq@2.63.1
  - @memberjunction/ai-mistral@2.63.1
  - @memberjunction/ai-openai@2.63.1
  - @memberjunction/ai-vectors-pinecone@2.63.1
  - @memberjunction/actions-bizapps-accounting@2.63.1
  - @memberjunction/actions-bizapps-crm@2.63.1
  - @memberjunction/actions-bizapps-lms@2.63.1
  - @memberjunction/actions-bizapps-social@2.63.1
  - @memberjunction/core-actions@2.63.1
  - @memberjunction/actions@2.63.1
  - @memberjunction/entity-communications-server@2.63.1
  - @memberjunction/doc-utils@2.63.1
  - @memberjunction/external-change-detection@2.63.1
  - @memberjunction/graphql-dataprovider@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1
  - @memberjunction/core-entities-server@2.63.1
  - @memberjunction/data-context@2.63.1
  - @memberjunction/data-context-server@2.63.1
  - @memberjunction/queue@2.63.1
  - @memberjunction/storage@2.63.1
  - @memberjunction/sqlserver-dataprovider@2.63.1
  - @memberjunction/templates@2.63.1
  - @memberjunction/skip-types@2.63.1

## 2.63.0

### Minor Changes

- 28e8a85: Migration included to modify the AIAgentRun table, so minor bump

### Patch Changes

- Updated dependencies [28e8a85]
  - @memberjunction/ai-agents@2.63.0
  - @memberjunction/ai-core-plus@2.63.0
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/aiengine@2.63.0
  - @memberjunction/ai-prompts@2.63.0
  - @memberjunction/core-actions@2.63.0
  - @memberjunction/actions@2.63.0
  - @memberjunction/core-entities-server@2.63.0
  - @memberjunction/ai-agent-manager-actions@2.63.0
  - @memberjunction/actions-bizapps-accounting@2.63.0
  - @memberjunction/actions-bizapps-lms@2.63.0
  - @memberjunction/actions-bizapps-social@2.63.0
  - @memberjunction/entity-communications-server@2.63.0
  - @memberjunction/doc-utils@2.63.0
  - @memberjunction/external-change-detection@2.63.0
  - @memberjunction/graphql-dataprovider@2.63.0
  - @memberjunction/data-context@2.63.0
  - @memberjunction/queue@2.63.0
  - @memberjunction/storage@2.63.0
  - @memberjunction/sqlserver-dataprovider@2.63.0
  - @memberjunction/skip-types@2.63.0
  - @memberjunction/templates@2.63.0
  - @memberjunction/ai-vectors-pinecone@2.63.0
  - @memberjunction/actions-bizapps-crm@2.63.0
  - @memberjunction/data-context-server@2.63.0
  - @memberjunction/ai@2.63.0
  - @memberjunction/ai-anthropic@2.63.0
  - @memberjunction/ai-cerebras@2.63.0
  - @memberjunction/ai-groq@2.63.0
  - @memberjunction/ai-mistral@2.63.0
  - @memberjunction/ai-openai@2.63.0
  - @memberjunction/core@2.63.0
  - @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [4a4b488]
- Updated dependencies [c995603]
  - @memberjunction/ai-prompts@2.62.0
  - @memberjunction/ai@2.62.0
  - @memberjunction/ai-core-plus@2.62.0
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/ai-agents@2.62.0
  - @memberjunction/actions@2.62.0
  - @memberjunction/core-entities-server@2.62.0
  - @memberjunction/aiengine@2.62.0
  - @memberjunction/ai-anthropic@2.62.0
  - @memberjunction/ai-cerebras@2.62.0
  - @memberjunction/ai-groq@2.62.0
  - @memberjunction/ai-mistral@2.62.0
  - @memberjunction/ai-openai@2.62.0
  - @memberjunction/queue@2.62.0
  - @memberjunction/sqlserver-dataprovider@2.62.0
  - @memberjunction/templates@2.62.0
  - @memberjunction/core-actions@2.62.0
  - @memberjunction/ai-agent-manager-actions@2.62.0
  - @memberjunction/entity-communications-server@2.62.0
  - @memberjunction/doc-utils@2.62.0
  - @memberjunction/external-change-detection@2.62.0
  - @memberjunction/graphql-dataprovider@2.62.0
  - @memberjunction/data-context@2.62.0
  - @memberjunction/storage@2.62.0
  - @memberjunction/skip-types@2.62.0
  - @memberjunction/ai-vectors-pinecone@2.62.0
  - @memberjunction/data-context-server@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Minor Changes

- 51b2b47: Improvements to AI Agents and Added Social Actions

### Patch Changes

- Updated dependencies [51b2b47]
  - @memberjunction/ai-agents@2.61.0
  - @memberjunction/ai-core-plus@2.61.0
  - @memberjunction/actions@2.61.0
  - @memberjunction/aiengine@2.61.0
  - @memberjunction/ai-prompts@2.61.0
  - @memberjunction/core-actions@2.61.0
  - @memberjunction/core-entities-server@2.61.0
  - @memberjunction/ai-agent-manager-actions@2.61.0
  - @memberjunction/sqlserver-dataprovider@2.61.0
  - @memberjunction/ai-vectors-pinecone@2.61.0
  - @memberjunction/queue@2.61.0
  - @memberjunction/templates@2.61.0
  - @memberjunction/external-change-detection@2.61.0
  - @memberjunction/entity-communications-server@2.61.0
  - @memberjunction/ai@2.61.0
  - @memberjunction/ai-anthropic@2.61.0
  - @memberjunction/ai-cerebras@2.61.0
  - @memberjunction/ai-groq@2.61.0
  - @memberjunction/ai-mistral@2.61.0
  - @memberjunction/ai-openai@2.61.0
  - @memberjunction/doc-utils@2.61.0
  - @memberjunction/graphql-dataprovider@2.61.0
  - @memberjunction/core@2.61.0
  - @memberjunction/core-entities@2.61.0
  - @memberjunction/data-context@2.61.0
  - @memberjunction/data-context-server@2.61.0
  - @memberjunction/global@2.61.0
  - @memberjunction/storage@2.61.0
  - @memberjunction/skip-types@2.61.0

## 2.60.0

### Minor Changes

- e30ee12: migrations

### Patch Changes

- Updated dependencies [bb46c63]
- Updated dependencies [b5fa80a]
- Updated dependencies [e30ee12]
- Updated dependencies [e512e4e]
  - @memberjunction/ai-core-plus@2.60.0
  - @memberjunction/core@2.60.0
  - @memberjunction/ai-agents@2.60.0
  - @memberjunction/core-entities@2.60.0
  - @memberjunction/core-entities-server@2.60.0
  - @memberjunction/ai-prompts@2.60.0
  - @memberjunction/aiengine@2.60.0
  - @memberjunction/core-actions@2.60.0
  - @memberjunction/actions@2.60.0
  - @memberjunction/ai-agent-manager-actions@2.60.0
  - @memberjunction/ai-vectors-pinecone@2.60.0
  - @memberjunction/entity-communications-server@2.60.0
  - @memberjunction/doc-utils@2.60.0
  - @memberjunction/external-change-detection@2.60.0
  - @memberjunction/graphql-dataprovider@2.60.0
  - @memberjunction/data-context@2.60.0
  - @memberjunction/queue@2.60.0
  - @memberjunction/storage@2.60.0
  - @memberjunction/sqlserver-dataprovider@2.60.0
  - @memberjunction/templates@2.60.0
  - @memberjunction/skip-types@2.60.0
  - @memberjunction/data-context-server@2.60.0
  - @memberjunction/ai@2.60.0
  - @memberjunction/ai-anthropic@2.60.0
  - @memberjunction/ai-cerebras@2.60.0
  - @memberjunction/ai-groq@2.60.0
  - @memberjunction/ai-mistral@2.60.0
  - @memberjunction/ai-openai@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- Updated dependencies [008fb65]
- Updated dependencies [2d8913a]
  - @memberjunction/ai-agents@2.59.0
  - @memberjunction/ai-agent-manager-actions@2.59.0
  - @memberjunction/ai@2.59.0
  - @memberjunction/ai-core-plus@2.59.0
  - @memberjunction/aiengine@2.59.0
  - @memberjunction/ai-prompts@2.59.0
  - @memberjunction/ai-anthropic@2.59.0
  - @memberjunction/ai-cerebras@2.59.0
  - @memberjunction/ai-groq@2.59.0
  - @memberjunction/ai-mistral@2.59.0
  - @memberjunction/ai-openai@2.59.0
  - @memberjunction/ai-vectors-pinecone@2.59.0
  - @memberjunction/core-actions@2.59.0
  - @memberjunction/actions@2.59.0
  - @memberjunction/entity-communications-server@2.59.0
  - @memberjunction/doc-utils@2.59.0
  - @memberjunction/external-change-detection@2.59.0
  - @memberjunction/graphql-dataprovider@2.59.0
  - @memberjunction/core@2.59.0
  - @memberjunction/core-entities@2.59.0
  - @memberjunction/core-entities-server@2.59.0
  - @memberjunction/data-context@2.59.0
  - @memberjunction/data-context-server@2.59.0
  - @memberjunction/global@2.59.0
  - @memberjunction/queue@2.59.0
  - @memberjunction/storage@2.59.0
  - @memberjunction/sqlserver-dataprovider@2.59.0
  - @memberjunction/skip-types@2.59.0
  - @memberjunction/templates@2.59.0

## 2.58.0

### Minor Changes

- db88416: migrations

### Patch Changes

- Updated dependencies [def26fe]
- Updated dependencies [db88416]
  - @memberjunction/core@2.58.0
  - @memberjunction/sqlserver-dataprovider@2.58.0
  - @memberjunction/ai@2.58.0
  - @memberjunction/ai-core-plus@2.58.0
  - @memberjunction/ai-prompts@2.58.0
  - @memberjunction/ai-cerebras@2.58.0
  - @memberjunction/ai-groq@2.58.0
  - @memberjunction/skip-types@2.58.0
  - @memberjunction/ai-agent-manager-actions@2.58.0
  - @memberjunction/ai-agents@2.58.0
  - @memberjunction/aiengine@2.58.0
  - @memberjunction/ai-vectors-pinecone@2.58.0
  - @memberjunction/core-actions@2.58.0
  - @memberjunction/actions@2.58.0
  - @memberjunction/entity-communications-server@2.58.0
  - @memberjunction/doc-utils@2.58.0
  - @memberjunction/external-change-detection@2.58.0
  - @memberjunction/graphql-dataprovider@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/core-entities-server@2.58.0
  - @memberjunction/data-context@2.58.0
  - @memberjunction/queue@2.58.0
  - @memberjunction/storage@2.58.0
  - @memberjunction/templates@2.58.0
  - @memberjunction/ai-anthropic@2.58.0
  - @memberjunction/ai-mistral@2.58.0
  - @memberjunction/ai-openai@2.58.0
  - @memberjunction/data-context-server@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Minor Changes

- d68d3cf: fix: increase File ContentType column length to 255 characters

  - Updated database migration to increase ContentType column from 50 to 255 characters
  - Fixed FileResolver to properly handle file creation with updated entity
  - This allows for longer MIME type strings that were previously truncated

- 0ba485f: various bug fixes

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/core-entities-server@2.57.0
  - @memberjunction/global@2.57.0
  - @memberjunction/sqlserver-dataprovider@2.57.0
  - @memberjunction/ai-agent-manager-actions@2.57.0
  - @memberjunction/ai-agents@2.57.0
  - @memberjunction/aiengine@2.57.0
  - @memberjunction/ai-prompts@2.57.0
  - @memberjunction/ai-vectors-pinecone@2.57.0
  - @memberjunction/core-actions@2.57.0
  - @memberjunction/actions@2.57.0
  - @memberjunction/entity-communications-server@2.57.0
  - @memberjunction/doc-utils@2.57.0
  - @memberjunction/external-change-detection@2.57.0
  - @memberjunction/graphql-dataprovider@2.57.0
  - @memberjunction/data-context@2.57.0
  - @memberjunction/queue@2.57.0
  - @memberjunction/storage@2.57.0
  - @memberjunction/templates@2.57.0
  - @memberjunction/ai@2.57.0
  - @memberjunction/skip-types@2.57.0
  - @memberjunction/ai-mistral@2.57.0
  - @memberjunction/ai-openai@2.57.0
  - @memberjunction/data-context-server@2.57.0

## 2.56.0

### Minor Changes

- bf24cae: Various

### Patch Changes

- Updated dependencies [bf24cae]
  - @memberjunction/ai-agents@2.56.0
  - @memberjunction/ai-agent-manager-actions@2.56.0
  - @memberjunction/core-actions@2.56.0
  - @memberjunction/actions@2.56.0
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/core-entities-server@2.56.0
  - @memberjunction/sqlserver-dataprovider@2.56.0
  - @memberjunction/aiengine@2.56.0
  - @memberjunction/ai-prompts@2.56.0
  - @memberjunction/entity-communications-server@2.56.0
  - @memberjunction/doc-utils@2.56.0
  - @memberjunction/external-change-detection@2.56.0
  - @memberjunction/graphql-dataprovider@2.56.0
  - @memberjunction/data-context@2.56.0
  - @memberjunction/queue@2.56.0
  - @memberjunction/storage@2.56.0
  - @memberjunction/skip-types@2.56.0
  - @memberjunction/templates@2.56.0
  - @memberjunction/ai-vectors-pinecone@2.56.0
  - @memberjunction/data-context-server@2.56.0
  - @memberjunction/ai@2.56.0
  - @memberjunction/ai-mistral@2.56.0
  - @memberjunction/ai-openai@2.56.0
  - @memberjunction/core@2.56.0
  - @memberjunction/global@2.56.0

## 2.55.0

### Patch Changes

- Updated dependencies [c3a49ff]
- Updated dependencies [659f892]
- Updated dependencies [967bd1d]
- Updated dependencies [f672320]
  - @memberjunction/ai-agents@2.55.0
  - @memberjunction/ai@2.55.0
  - @memberjunction/ai-agent-manager-actions@2.55.0
  - @memberjunction/sqlserver-dataprovider@2.55.0
  - @memberjunction/aiengine@2.55.0
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/core-actions@2.55.0
  - @memberjunction/ai-prompts@2.55.0
  - @memberjunction/ai-mistral@2.55.0
  - @memberjunction/ai-openai@2.55.0
  - @memberjunction/actions@2.55.0
  - @memberjunction/queue@2.55.0
  - @memberjunction/templates@2.55.0
  - @memberjunction/external-change-detection@2.55.0
  - @memberjunction/core-entities-server@2.55.0
  - @memberjunction/ai-vectors-pinecone@2.55.0
  - @memberjunction/entity-communications-server@2.55.0
  - @memberjunction/doc-utils@2.55.0
  - @memberjunction/graphql-dataprovider@2.55.0
  - @memberjunction/data-context@2.55.0
  - @memberjunction/storage@2.55.0
  - @memberjunction/skip-types@2.55.0
  - @memberjunction/data-context-server@2.55.0
  - @memberjunction/core@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- Updated dependencies [20f424d]
- Updated dependencies [a6f553e]
- Updated dependencies [81913a6]
- Updated dependencies [c96d6dd]
- Updated dependencies [dfca664]
- Updated dependencies [0f6e995]
- Updated dependencies [e267cc4]
- Updated dependencies [08b032c]
- Updated dependencies [1273b07]
- Updated dependencies [98ef1f7]
- Updated dependencies [5e2cfa1]
- Updated dependencies [0046359]
- Updated dependencies [91dd7d8]
  - @memberjunction/core@2.54.0
  - @memberjunction/ai-agents@2.54.0
  - @memberjunction/aiengine@2.54.0
  - @memberjunction/ai-prompts@2.54.0
  - @memberjunction/sqlserver-dataprovider@2.54.0
  - @memberjunction/ai-vectors-pinecone@2.54.0
  - @memberjunction/core-actions@2.54.0
  - @memberjunction/actions@2.54.0
  - @memberjunction/entity-communications-server@2.54.0
  - @memberjunction/doc-utils@2.54.0
  - @memberjunction/external-change-detection@2.54.0
  - @memberjunction/graphql-dataprovider@2.54.0
  - @memberjunction/core-entities@2.54.0
  - @memberjunction/core-entities-server@2.54.0
  - @memberjunction/data-context@2.54.0
  - @memberjunction/queue@2.54.0
  - @memberjunction/storage@2.54.0
  - @memberjunction/templates@2.54.0
  - @memberjunction/skip-types@2.54.0
  - @memberjunction/data-context-server@2.54.0
  - @memberjunction/ai@2.54.0
  - @memberjunction/ai-mistral@2.54.0
  - @memberjunction/ai-openai@2.54.0
  - @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- 720aa19: Add system user GraphQL resolvers for RunView and Query operations
- Updated dependencies [bddc4ea]
- Updated dependencies [720aa19]
- Updated dependencies [390f587]
- Updated dependencies [b5560c0]
  - @memberjunction/core-actions@2.53.0
  - @memberjunction/core@2.53.0
  - @memberjunction/core-entities@2.53.0
  - @memberjunction/graphql-dataprovider@2.53.0
  - @memberjunction/actions@2.53.0
  - @memberjunction/templates@2.53.0
  - @memberjunction/ai-agents@2.53.0
  - @memberjunction/aiengine@2.53.0
  - @memberjunction/ai-prompts@2.53.0
  - @memberjunction/ai-vectors-pinecone@2.53.0
  - @memberjunction/entity-communications-server@2.53.0
  - @memberjunction/doc-utils@2.53.0
  - @memberjunction/external-change-detection@2.53.0
  - @memberjunction/core-entities-server@2.53.0
  - @memberjunction/data-context@2.53.0
  - @memberjunction/queue@2.53.0
  - @memberjunction/storage@2.53.0
  - @memberjunction/sqlserver-dataprovider@2.53.0
  - @memberjunction/skip-types@2.53.0
  - @memberjunction/data-context-server@2.53.0
  - @memberjunction/ai@2.53.0
  - @memberjunction/ai-mistral@2.53.0
  - @memberjunction/ai-openai@2.53.0
  - @memberjunction/global@2.53.0

## 2.52.0

### Patch Changes

- Updated dependencies [e926106]
- Updated dependencies [760e844]
  - @memberjunction/ai@2.52.0
  - @memberjunction/aiengine@2.52.0
  - @memberjunction/ai-mistral@2.52.0
  - @memberjunction/ai-openai@2.52.0
  - @memberjunction/ai-vectors-pinecone@2.52.0
  - @memberjunction/core@2.52.0
  - @memberjunction/core-entities@2.52.0
  - @memberjunction/ai-agents@2.52.0
  - @memberjunction/actions@2.52.0
  - @memberjunction/ai-prompts@2.52.0
  - @memberjunction/queue@2.52.0
  - @memberjunction/sqlserver-dataprovider@2.52.0
  - @memberjunction/templates@2.52.0
  - @memberjunction/core-entities-server@2.52.0
  - @memberjunction/core-actions@2.52.0
  - @memberjunction/entity-communications-server@2.52.0
  - @memberjunction/doc-utils@2.52.0
  - @memberjunction/external-change-detection@2.52.0
  - @memberjunction/graphql-dataprovider@2.52.0
  - @memberjunction/data-context@2.52.0
  - @memberjunction/storage@2.52.0
  - @memberjunction/skip-types@2.52.0
  - @memberjunction/data-context-server@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Patch Changes

- Updated dependencies [4a79606]
- Updated dependencies [faf513c]
- Updated dependencies [7a9b88e]
- Updated dependencies [53f8167]
- Updated dependencies [0ddb438]
  - @memberjunction/ai-agents@2.51.0
  - @memberjunction/ai@2.51.0
  - @memberjunction/aiengine@2.51.0
  - @memberjunction/ai-prompts@2.51.0
  - @memberjunction/core-entities-server@2.51.0
  - @memberjunction/core-actions@2.51.0
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/actions@2.51.0
  - @memberjunction/ai-mistral@2.51.0
  - @memberjunction/ai-openai@2.51.0
  - @memberjunction/queue@2.51.0
  - @memberjunction/sqlserver-dataprovider@2.51.0
  - @memberjunction/templates@2.51.0
  - @memberjunction/ai-vectors-pinecone@2.51.0
  - @memberjunction/entity-communications-server@2.51.0
  - @memberjunction/doc-utils@2.51.0
  - @memberjunction/external-change-detection@2.51.0
  - @memberjunction/graphql-dataprovider@2.51.0
  - @memberjunction/data-context@2.51.0
  - @memberjunction/storage@2.51.0
  - @memberjunction/skip-types@2.51.0
  - @memberjunction/data-context-server@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Minor Changes

- 099e4bb: Add missing dependency and add migration to filter constraint

### Patch Changes

- @memberjunction/ai-agents@2.50.0
- @memberjunction/ai@2.50.0
- @memberjunction/aiengine@2.50.0
- @memberjunction/ai-prompts@2.50.0
- @memberjunction/ai-mistral@2.50.0
- @memberjunction/ai-openai@2.50.0
- @memberjunction/ai-vectors-pinecone@2.50.0
- @memberjunction/core-actions@2.50.0
- @memberjunction/actions@2.50.0
- @memberjunction/entity-communications-server@2.50.0
- @memberjunction/doc-utils@2.50.0
- @memberjunction/external-change-detection@2.50.0
- @memberjunction/graphql-dataprovider@2.50.0
- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0
- @memberjunction/core-entities-server@2.50.0
- @memberjunction/data-context@2.50.0
- @memberjunction/data-context-server@2.50.0
- @memberjunction/global@2.50.0
- @memberjunction/queue@2.50.0
- @memberjunction/storage@2.50.0
- @memberjunction/sqlserver-dataprovider@2.50.0
- @memberjunction/skip-types@2.50.0
- @memberjunction/templates@2.50.0

## 2.49.0

### Minor Changes

- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [2f974e2]
- Updated dependencies [cc52ced]
- Updated dependencies [ca3365f]
- Updated dependencies [b5d9fbd]
- Updated dependencies [db17ed7]
- Updated dependencies [62cf1b6]
  - @memberjunction/core-entities@2.49.0
  - @memberjunction/core@2.49.0
  - @memberjunction/core-entities-server@2.49.0
  - @memberjunction/global@2.49.0
  - @memberjunction/sqlserver-dataprovider@2.49.0
  - @memberjunction/core-actions@2.49.0
  - @memberjunction/actions@2.49.0
  - @memberjunction/ai@2.49.0
  - @memberjunction/aiengine@2.49.0
  - @memberjunction/ai-prompts@2.49.0
  - @memberjunction/ai-mistral@2.49.0
  - @memberjunction/ai-openai@2.49.0
  - @memberjunction/ai-vectors-pinecone@2.49.0
  - @memberjunction/entity-communications-server@2.49.0
  - @memberjunction/doc-utils@2.49.0
  - @memberjunction/external-change-detection@2.49.0
  - @memberjunction/graphql-dataprovider@2.49.0
  - @memberjunction/data-context@2.49.0
  - @memberjunction/data-context-server@2.49.0
  - @memberjunction/queue@2.49.0
  - @memberjunction/storage@2.49.0
  - @memberjunction/skip-types@2.49.0
  - @memberjunction/templates@2.49.0

## 2.48.0

### Minor Changes

- bb01fcf: bug fixes but bumping minor version here since we have a migration in this PR
- 031e724: Implement agent architecture separation of concerns

  - **NEW**: Add BaseAgent class for domain-specific prompt execution
  - **NEW**: Add ConductorAgent for autonomous orchestration decisions and action planning
  - **NEW**: Add AgentRunner class to coordinate BaseAgent + ConductorAgent interactions
  - **NEW**: Add AgentFactory with `GetConductorAgent()` and `GetAgentRunner()` methods using MJGlobal
    class factory
  - **NEW**: Add comprehensive execution tracking with AIAgentRun and AIAgentRunStep entities
  - **NEW**: Support parallel and sequential action execution with proper ordering
  - **NEW**: Structured JSON response format for deterministic decision parsing
  - **NEW**: Database persistence for execution history and step tracking
  - **NEW**: Cancellation and progress monitoring support
  - **NEW**: Context compression for long conversations
  - **NEW**: Template rendering with data context

  This implements clean separation of concerns:

  - BaseAgent: Domain-specific execution only (~500 lines)
  - ConductorAgent: Orchestration decisions with structured responses
  - AgentRunner: Coordination layer providing unified user interface

  Includes comprehensive TypeScript typing and MemberJunction framework integration.

### Patch Changes

- Updated dependencies [e49a91a]
- Updated dependencies [bb01fcf]
- Updated dependencies [031e724]
- Updated dependencies [5c72641]
  - @memberjunction/skip-types@2.48.0
  - @memberjunction/core@2.48.0
  - @memberjunction/ai-prompts@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/core-entities-server@2.48.0
  - @memberjunction/aiengine@2.48.0
  - @memberjunction/ai-vectors-pinecone@2.48.0
  - @memberjunction/core-actions@2.48.0
  - @memberjunction/actions@2.48.0
  - @memberjunction/entity-communications-server@2.48.0
  - @memberjunction/doc-utils@2.48.0
  - @memberjunction/external-change-detection@2.48.0
  - @memberjunction/graphql-dataprovider@2.48.0
  - @memberjunction/data-context@2.48.0
  - @memberjunction/queue@2.48.0
  - @memberjunction/storage@2.48.0
  - @memberjunction/sqlserver-dataprovider@2.48.0
  - @memberjunction/templates@2.48.0
  - @memberjunction/data-context-server@2.48.0
  - @memberjunction/ai@2.48.0
  - @memberjunction/ai-mistral@2.48.0
  - @memberjunction/ai-openai@2.48.0
  - @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- Updated dependencies [3621e2f]
- Updated dependencies [3f31192]
- Updated dependencies [4c4751c]
  - @memberjunction/ai-prompts@2.47.0
  - @memberjunction/sqlserver-dataprovider@2.47.0
  - @memberjunction/external-change-detection@2.47.0
  - @memberjunction/aiengine@2.47.0
  - @memberjunction/core-actions@2.47.0
  - @memberjunction/ai-vectors-pinecone@2.47.0
  - @memberjunction/actions@2.47.0
  - @memberjunction/core-entities-server@2.47.0
  - @memberjunction/queue@2.47.0
  - @memberjunction/templates@2.47.0
  - @memberjunction/entity-communications-server@2.47.0
  - @memberjunction/ai@2.47.0
  - @memberjunction/ai-mistral@2.47.0
  - @memberjunction/ai-openai@2.47.0
  - @memberjunction/doc-utils@2.47.0
  - @memberjunction/graphql-dataprovider@2.47.0
  - @memberjunction/core@2.47.0
  - @memberjunction/core-entities@2.47.0
  - @memberjunction/data-context@2.47.0
  - @memberjunction/data-context-server@2.47.0
  - @memberjunction/global@2.47.0
  - @memberjunction/storage@2.47.0
  - @memberjunction/skip-types@2.47.0

## 2.46.0

### Patch Changes

- 49d9436: minor bug fix
- Updated dependencies [fa98215]
  - @memberjunction/core-entities-server@2.46.0
  - @memberjunction/ai@2.46.0
  - @memberjunction/aiengine@2.46.0
  - @memberjunction/ai-prompts@2.46.0
  - @memberjunction/ai-mistral@2.46.0
  - @memberjunction/ai-openai@2.46.0
  - @memberjunction/ai-vectors-pinecone@2.46.0
  - @memberjunction/core-actions@2.46.0
  - @memberjunction/actions@2.46.0
  - @memberjunction/entity-communications-server@2.46.0
  - @memberjunction/doc-utils@2.46.0
  - @memberjunction/external-change-detection@2.46.0
  - @memberjunction/graphql-dataprovider@2.46.0
  - @memberjunction/core@2.46.0
  - @memberjunction/core-entities@2.46.0
  - @memberjunction/data-context@2.46.0
  - @memberjunction/data-context-server@2.46.0
  - @memberjunction/global@2.46.0
  - @memberjunction/queue@2.46.0
  - @memberjunction/storage@2.46.0
  - @memberjunction/sqlserver-dataprovider@2.46.0
  - @memberjunction/skip-types@2.46.0
  - @memberjunction/templates@2.46.0

## 2.45.0

### Minor Changes

- 556ee8d: Add AI Agent framework database entities and enhanced agent execution support

  New entity classes generated for AIAgentType, AIAgentRun, and AIAgentRunStep tables. Enhanced AIAgent and AIPromptRun entities with new foreign key relationships. Updated DataContextItem entity with CodeName property for improved code generation. These changes provide the foundational data layer for the AI Agent execution framework with hierarchical agent support, execution tracking, and pause/resume capabilities.

### Patch Changes

- 253de13: Tweaks to Skip Types and propogate changes
- Updated dependencies [96c06dd]
- Updated dependencies [253de13]
- Updated dependencies [21d456d]
- Updated dependencies [63f57f1]
- Updated dependencies [eff73f8]
- Updated dependencies [bbd9064]
- Updated dependencies [556ee8d]
  - @memberjunction/skip-types@2.45.0
  - @memberjunction/ai@2.45.0
  - @memberjunction/aiengine@2.45.0
  - @memberjunction/ai-prompts@2.45.0
  - @memberjunction/core-entities@2.45.0
  - @memberjunction/ai-mistral@2.45.0
  - @memberjunction/ai-openai@2.45.0
  - @memberjunction/actions@2.45.0
  - @memberjunction/queue@2.45.0
  - @memberjunction/sqlserver-dataprovider@2.45.0
  - @memberjunction/templates@2.45.0
  - @memberjunction/ai-vectors-pinecone@2.45.0
  - @memberjunction/core-actions@2.45.0
  - @memberjunction/entity-communications-server@2.45.0
  - @memberjunction/doc-utils@2.45.0
  - @memberjunction/external-change-detection@2.45.0
  - @memberjunction/graphql-dataprovider@2.45.0
  - @memberjunction/data-context@2.45.0
  - @memberjunction/storage@2.45.0
  - @memberjunction/data-context-server@2.45.0
  - @memberjunction/core@2.45.0
  - @memberjunction/global@2.45.0

## 2.44.0

### Minor Changes

- 091c5f6: Align Entity Field sequence ordering with base views for core entities.

### Patch Changes

- 161f82b: Fix bug where conversation remains stuck on "Processing" state when HTTP post request to Skip API throws an error. Conversation will now be switched back to "Available".
- 99b27c5: various updates
- Updated dependencies [f7aec1c]
- Updated dependencies [fbc30dc]
- Updated dependencies [d723c0c]
- Updated dependencies [9f02cd8]
- Updated dependencies [99b27c5]
- Updated dependencies [091c5f6]
  - @memberjunction/aiengine@2.44.0
  - @memberjunction/ai-prompts@2.44.0
  - @memberjunction/ai@2.44.0
  - @memberjunction/core-actions@2.44.0
  - @memberjunction/core@2.44.0
  - @memberjunction/core-entities@2.44.0
  - @memberjunction/templates@2.44.0
  - @memberjunction/ai-vectors-pinecone@2.44.0
  - @memberjunction/actions@2.44.0
  - @memberjunction/queue@2.44.0
  - @memberjunction/sqlserver-dataprovider@2.44.0
  - @memberjunction/ai-mistral@2.44.0
  - @memberjunction/ai-openai@2.44.0
  - @memberjunction/entity-communications-server@2.44.0
  - @memberjunction/doc-utils@2.44.0
  - @memberjunction/external-change-detection@2.44.0
  - @memberjunction/graphql-dataprovider@2.44.0
  - @memberjunction/data-context@2.44.0
  - @memberjunction/storage@2.44.0
  - @memberjunction/skip-types@2.44.0
  - @memberjunction/data-context-server@2.44.0
  - @memberjunction/global@2.44.0

## 2.43.0

### Patch Changes

- Updated dependencies [1629c04]
  - @memberjunction/core@2.43.0
  - @memberjunction/templates@2.43.0
  - @memberjunction/aiengine@2.43.0
  - @memberjunction/ai-vectors-pinecone@2.43.0
  - @memberjunction/core-actions@2.43.0
  - @memberjunction/actions@2.43.0
  - @memberjunction/entity-communications-server@2.43.0
  - @memberjunction/doc-utils@2.43.0
  - @memberjunction/external-change-detection@2.43.0
  - @memberjunction/graphql-dataprovider@2.43.0
  - @memberjunction/core-entities@2.43.0
  - @memberjunction/data-context@2.43.0
  - @memberjunction/queue@2.43.0
  - @memberjunction/storage@2.43.0
  - @memberjunction/sqlserver-dataprovider@2.43.0
  - @memberjunction/skip-types@2.43.0
  - @memberjunction/data-context-server@2.43.0
  - @memberjunction/ai@2.43.0
  - @memberjunction/ai-mistral@2.43.0
  - @memberjunction/ai-openai@2.43.0
  - @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/ai@2.42.1
- @memberjunction/aiengine@2.42.1
- @memberjunction/ai-mistral@2.42.1
- @memberjunction/ai-openai@2.42.1
- @memberjunction/ai-vectors-pinecone@2.42.1
- @memberjunction/core-actions@2.42.1
- @memberjunction/actions@2.42.1
- @memberjunction/entity-communications-server@2.42.1
- @memberjunction/doc-utils@2.42.1
- @memberjunction/external-change-detection@2.42.1
- @memberjunction/graphql-dataprovider@2.42.1
- @memberjunction/core@2.42.1
- @memberjunction/core-entities@2.42.1
- @memberjunction/data-context@2.42.1
- @memberjunction/data-context-server@2.42.1
- @memberjunction/global@2.42.1
- @memberjunction/queue@2.42.1
- @memberjunction/storage@2.42.1
- @memberjunction/sqlserver-dataprovider@2.42.1
- @memberjunction/skip-types@2.42.1
- @memberjunction/templates@2.42.1

## 2.42.0

### Minor Changes

- d49f25c: Key Areas Addressed:

### Patch Changes

- Updated dependencies [8efc301]
- Updated dependencies [5c4ff39]
- Updated dependencies [d49f25c]
  - @memberjunction/storage@2.42.0
  - @memberjunction/sqlserver-dataprovider@2.42.0
  - @memberjunction/ai@2.42.0
  - @memberjunction/aiengine@2.42.0
  - @memberjunction/external-change-detection@2.42.0
  - @memberjunction/ai-mistral@2.42.0
  - @memberjunction/ai-openai@2.42.0
  - @memberjunction/actions@2.42.0
  - @memberjunction/queue@2.42.0
  - @memberjunction/templates@2.42.0
  - @memberjunction/ai-vectors-pinecone@2.42.0
  - @memberjunction/core-actions@2.42.0
  - @memberjunction/entity-communications-server@2.42.0
  - @memberjunction/doc-utils@2.42.0
  - @memberjunction/graphql-dataprovider@2.42.0
  - @memberjunction/core@2.42.0
  - @memberjunction/core-entities@2.42.0
  - @memberjunction/data-context@2.42.0
  - @memberjunction/data-context-server@2.42.0
  - @memberjunction/global@2.42.0
  - @memberjunction/skip-types@2.42.0

## 2.41.0

### Minor Changes

- 7e0523d: Persist Skip conversation status and add completion time display

  - Added 'Status' column to Conversation table with 'Processing' and 'Available' states
  - Added 'CompletionTime' column to ConversationDetail table to track processing duration
  - Updated AskSkipResolver to manage conversation status and track processing time
  - Enabled GraphQLDataProvider to cache and retrieve session IDs from IndexedDB
  - Enhanced skip-chat component to poll for 'Processing' conversations after page refresh
  - Added CompletionTime display in the UI for completed AI messages
  - Fixed session persistence for conversation status across page reloads

### Patch Changes

- Updated dependencies [3be3f71]
- Updated dependencies [c20558b]
- Updated dependencies [c20558b]
- Updated dependencies [9d3b577]
- Updated dependencies [276371d]
- Updated dependencies [7e0523d]
  - @memberjunction/core@2.41.0
  - @memberjunction/sqlserver-dataprovider@2.41.0
  - @memberjunction/storage@2.41.0
  - @memberjunction/ai@2.41.0
  - @memberjunction/graphql-dataprovider@2.41.0
  - @memberjunction/core-entities@2.41.0
  - @memberjunction/aiengine@2.41.0
  - @memberjunction/ai-vectors-pinecone@2.41.0
  - @memberjunction/core-actions@2.41.0
  - @memberjunction/actions@2.41.0
  - @memberjunction/entity-communications-server@2.41.0
  - @memberjunction/doc-utils@2.41.0
  - @memberjunction/external-change-detection@2.41.0
  - @memberjunction/data-context@2.41.0
  - @memberjunction/queue@2.41.0
  - @memberjunction/templates@2.41.0
  - @memberjunction/ai-mistral@2.41.0
  - @memberjunction/ai-openai@2.41.0
  - @memberjunction/skip-types@2.41.0
  - @memberjunction/data-context-server@2.41.0
  - @memberjunction/global@2.41.0

## 2.40.0

### Patch Changes

- 40fee8d: Documentation updates for MJServer/AskSkipResolver
- 23d08d8: Various
- Updated dependencies [23d08d8]
- Updated dependencies [2309d02]
- Updated dependencies [b6ce661]
- Updated dependencies [c9a8991]
  - @memberjunction/skip-types@2.40.0
  - @memberjunction/storage@2.40.0
  - @memberjunction/ai@2.40.0
  - @memberjunction/ai-openai@2.40.0
  - @memberjunction/ai-mistral@2.40.0
  - @memberjunction/templates@2.40.0
  - @memberjunction/aiengine@2.40.0
  - @memberjunction/actions@2.40.0
  - @memberjunction/queue@2.40.0
  - @memberjunction/sqlserver-dataprovider@2.40.0
  - @memberjunction/ai-vectors-pinecone@2.40.0
  - @memberjunction/core-actions@2.40.0
  - @memberjunction/external-change-detection@2.40.0
  - @memberjunction/entity-communications-server@2.40.0
  - @memberjunction/doc-utils@2.40.0
  - @memberjunction/graphql-dataprovider@2.40.0
  - @memberjunction/core@2.40.0
  - @memberjunction/core-entities@2.40.0
  - @memberjunction/data-context@2.40.0
  - @memberjunction/data-context-server@2.40.0
  - @memberjunction/global@2.40.0

## 2.39.0

### Patch Changes

- e93f580: Various minor updates for Skip
- a827f49: minor bug fixes
- c9ccc36: Added SupportsEffortLevel to AIModels entity - generated artifacts to suit...
- Updated dependencies [f73ea0e]
- Updated dependencies [0583a20]
- Updated dependencies [e93f580]
- Updated dependencies [f3fa7ec]
- Updated dependencies [c9ccc36]
  - @memberjunction/ai@2.39.0
  - @memberjunction/ai-openai@2.39.0
  - @memberjunction/aiengine@2.39.0
  - @memberjunction/skip-types@2.39.0
  - @memberjunction/core-entities@2.39.0
  - @memberjunction/ai-mistral@2.39.0
  - @memberjunction/actions@2.39.0
  - @memberjunction/queue@2.39.0
  - @memberjunction/sqlserver-dataprovider@2.39.0
  - @memberjunction/templates@2.39.0
  - @memberjunction/ai-vectors-pinecone@2.39.0
  - @memberjunction/core-actions@2.39.0
  - @memberjunction/entity-communications-server@2.39.0
  - @memberjunction/doc-utils@2.39.0
  - @memberjunction/external-change-detection@2.39.0
  - @memberjunction/graphql-dataprovider@2.39.0
  - @memberjunction/data-context@2.39.0
  - @memberjunction/storage@2.39.0
  - @memberjunction/data-context-server@2.39.0
  - @memberjunction/core@2.39.0
  - @memberjunction/global@2.39.0

## 2.38.0

### Patch Changes

- Updated dependencies [c835ded]
- Updated dependencies [3235b8b]
  - @memberjunction/core-entities@2.38.0
  - @memberjunction/ai-mistral@2.38.0
  - @memberjunction/aiengine@2.38.0
  - @memberjunction/core-actions@2.38.0
  - @memberjunction/actions@2.38.0
  - @memberjunction/entity-communications-server@2.38.0
  - @memberjunction/doc-utils@2.38.0
  - @memberjunction/external-change-detection@2.38.0
  - @memberjunction/graphql-dataprovider@2.38.0
  - @memberjunction/data-context@2.38.0
  - @memberjunction/queue@2.38.0
  - @memberjunction/storage@2.38.0
  - @memberjunction/sqlserver-dataprovider@2.38.0
  - @memberjunction/skip-types@2.38.0
  - @memberjunction/templates@2.38.0
  - @memberjunction/ai-vectors-pinecone@2.38.0
  - @memberjunction/data-context-server@2.38.0
  - @memberjunction/ai@2.38.0
  - @memberjunction/ai-openai@2.38.0
  - @memberjunction/core@2.38.0
  - @memberjunction/global@2.38.0

## 2.37.1

### Patch Changes

- 65b4c60: Artifact support in AskSkipResolver + some UI cleanup
- Updated dependencies [3798dbb]
  - @memberjunction/storage@2.37.1
  - @memberjunction/ai@2.37.1
  - @memberjunction/aiengine@2.37.1
  - @memberjunction/ai-mistral@2.37.1
  - @memberjunction/ai-openai@2.37.1
  - @memberjunction/ai-vectors-pinecone@2.37.1
  - @memberjunction/core-actions@2.37.1
  - @memberjunction/actions@2.37.1
  - @memberjunction/entity-communications-server@2.37.1
  - @memberjunction/doc-utils@2.37.1
  - @memberjunction/external-change-detection@2.37.1
  - @memberjunction/graphql-dataprovider@2.37.1
  - @memberjunction/core@2.37.1
  - @memberjunction/core-entities@2.37.1
  - @memberjunction/data-context@2.37.1
  - @memberjunction/data-context-server@2.37.1
  - @memberjunction/global@2.37.1
  - @memberjunction/queue@2.37.1
  - @memberjunction/sqlserver-dataprovider@2.37.1
  - @memberjunction/skip-types@2.37.1
  - @memberjunction/templates@2.37.1

## 2.37.0

### Minor Changes

- 526bffb: Add mapping for an environment variable that indicates whether or not we should run learning cycles. Then, if disabled, we do not start up the learning cycle process at all. If enabled but no endpoint provided, we throw an error idicating as much as disable the recurring calls to the endpoint.

### Patch Changes

- dff8688: Updated ResolverBase's UpdateRecord to handle decimal values
- cd1557a: Added a check of the learning cycle endpoint provided from the env file such that, in the case the not endpoint is set we simply disable the calls to the learning cycle. In the case that an endpoint is set but fails immediately, we throw an error once and disable the recurring calls to the invalid endpoint.
- Updated dependencies [1418b71]
- Updated dependencies [78ffaa6]
- Updated dependencies [a1a7a52]
  - @memberjunction/core-entities@2.37.0
  - @memberjunction/storage@2.37.0
  - @memberjunction/aiengine@2.37.0
  - @memberjunction/core-actions@2.37.0
  - @memberjunction/actions@2.37.0
  - @memberjunction/entity-communications-server@2.37.0
  - @memberjunction/doc-utils@2.37.0
  - @memberjunction/external-change-detection@2.37.0
  - @memberjunction/graphql-dataprovider@2.37.0
  - @memberjunction/data-context@2.37.0
  - @memberjunction/queue@2.37.0
  - @memberjunction/sqlserver-dataprovider@2.37.0
  - @memberjunction/skip-types@2.37.0
  - @memberjunction/templates@2.37.0
  - @memberjunction/ai-vectors-pinecone@2.37.0
  - @memberjunction/data-context-server@2.37.0
  - @memberjunction/ai@2.37.0
  - @memberjunction/ai-mistral@2.37.0
  - @memberjunction/ai-openai@2.37.0
  - @memberjunction/core@2.37.0
  - @memberjunction/global@2.37.0

## 2.36.1

### Patch Changes

- Updated dependencies [d9defc9]
- Updated dependencies [38db5e1]
- Updated dependencies [9d709e2]
- Updated dependencies [577cc6a]
  - @memberjunction/ai@2.36.1
  - @memberjunction/ai-mistral@2.36.1
  - @memberjunction/ai-openai@2.36.1
  - @memberjunction/core@2.36.1
  - @memberjunction/aiengine@2.36.1
  - @memberjunction/actions@2.36.1
  - @memberjunction/queue@2.36.1
  - @memberjunction/sqlserver-dataprovider@2.36.1
  - @memberjunction/templates@2.36.1
  - @memberjunction/ai-vectors-pinecone@2.36.1
  - @memberjunction/core-actions@2.36.1
  - @memberjunction/entity-communications-server@2.36.1
  - @memberjunction/doc-utils@2.36.1
  - @memberjunction/external-change-detection@2.36.1
  - @memberjunction/graphql-dataprovider@2.36.1
  - @memberjunction/core-entities@2.36.1
  - @memberjunction/data-context@2.36.1
  - @memberjunction/storage@2.36.1
  - @memberjunction/skip-types@2.36.1
  - @memberjunction/data-context-server@2.36.1
  - @memberjunction/global@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- 917a4ac: Proposed REST server implementation - Claude Code
- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
- Updated dependencies [160f24f]
  - @memberjunction/entity-communications-server@2.36.0
  - @memberjunction/ai-vectors-pinecone@2.36.0
  - @memberjunction/external-change-detection@2.36.0
  - @memberjunction/sqlserver-dataprovider@2.36.0
  - @memberjunction/ai-mistral@2.36.0
  - @memberjunction/ai-openai@2.36.0
  - @memberjunction/core-actions@2.36.0
  - @memberjunction/graphql-dataprovider@2.36.0
  - @memberjunction/data-context-server@2.36.0
  - @memberjunction/templates@2.36.0
  - @memberjunction/actions@2.36.0
  - @memberjunction/core-entities@2.36.0
  - @memberjunction/data-context@2.36.0
  - @memberjunction/aiengine@2.36.0
  - @memberjunction/storage@2.36.0
  - @memberjunction/skip-types@2.36.0
  - @memberjunction/doc-utils@2.36.0
  - @memberjunction/global@2.36.0
  - @memberjunction/ai@2.36.0
  - @memberjunction/queue@2.36.0
  - @memberjunction/core@2.36.0

## 2.35.1

### Patch Changes

- Updated dependencies [3e7ec64]
  - @memberjunction/core@2.35.1
  - @memberjunction/sqlserver-dataprovider@2.35.1
  - @memberjunction/aiengine@2.35.1
  - @memberjunction/ai-vectors-pinecone@2.35.1
  - @memberjunction/core-actions@2.35.1
  - @memberjunction/actions@2.35.1
  - @memberjunction/entity-communications-server@2.35.1
  - @memberjunction/doc-utils@2.35.1
  - @memberjunction/external-change-detection@2.35.1
  - @memberjunction/graphql-dataprovider@2.35.1
  - @memberjunction/core-entities@2.35.1
  - @memberjunction/data-context@2.35.1
  - @memberjunction/queue@2.35.1
  - @memberjunction/storage@2.35.1
  - @memberjunction/templates@2.35.1
  - @memberjunction/skip-types@2.35.1
  - @memberjunction/data-context-server@2.35.1
  - @memberjunction/ai@2.35.1
  - @memberjunction/ai-mistral@2.35.1
  - @memberjunction/ai-openai@2.35.1
  - @memberjunction/global@2.35.1

## 2.35.0

### Patch Changes

- 8863e80: Minor tweaks for Skip UI stuff
- 4dae30c: Removed HTML QA Agent from MJServer
- Updated dependencies [989a9b8]
- Updated dependencies [364f754]
  - @memberjunction/ai-openai@2.35.0
  - @memberjunction/core-actions@2.35.0
  - @memberjunction/sqlserver-dataprovider@2.35.0
  - @memberjunction/external-change-detection@2.35.0
  - @memberjunction/ai@2.35.0
  - @memberjunction/aiengine@2.35.0
  - @memberjunction/ai-mistral@2.35.0
  - @memberjunction/ai-vectors-pinecone@2.35.0
  - @memberjunction/actions@2.35.0
  - @memberjunction/entity-communications-server@2.35.0
  - @memberjunction/doc-utils@2.35.0
  - @memberjunction/graphql-dataprovider@2.35.0
  - @memberjunction/core@2.35.0
  - @memberjunction/core-entities@2.35.0
  - @memberjunction/data-context@2.35.0
  - @memberjunction/data-context-server@2.35.0
  - @memberjunction/global@2.35.0
  - @memberjunction/queue@2.35.0
  - @memberjunction/storage@2.35.0
  - @memberjunction/skip-types@2.35.0
  - @memberjunction/templates@2.35.0

## 2.34.2

### Patch Changes

- ae5d495: Fix migration script
  - @memberjunction/ai@2.34.2
  - @memberjunction/aiengine@2.34.2
  - @memberjunction/ai-mistral@2.34.2
  - @memberjunction/ai-openai@2.34.2
  - @memberjunction/ai-vectors-pinecone@2.34.2
  - @memberjunction/core-actions@2.34.2
  - @memberjunction/actions@2.34.2
  - @memberjunction/entity-communications-server@2.34.2
  - @memberjunction/doc-utils@2.34.2
  - @memberjunction/external-change-detection@2.34.2
  - @memberjunction/graphql-dataprovider@2.34.2
  - @memberjunction/core@2.34.2
  - @memberjunction/core-entities@2.34.2
  - @memberjunction/data-context@2.34.2
  - @memberjunction/data-context-server@2.34.2
  - @memberjunction/global@2.34.2
  - @memberjunction/queue@2.34.2
  - @memberjunction/storage@2.34.2
  - @memberjunction/sqlserver-dataprovider@2.34.2
  - @memberjunction/skip-types@2.34.2
  - @memberjunction/templates@2.34.2

## 2.34.1

### Patch Changes

- 5e4dd59: Fixed broken import syntax
  - @memberjunction/ai@2.34.1
  - @memberjunction/aiengine@2.34.1
  - @memberjunction/ai-mistral@2.34.1
  - @memberjunction/ai-openai@2.34.1
  - @memberjunction/ai-vectors-pinecone@2.34.1
  - @memberjunction/core-actions@2.34.1
  - @memberjunction/actions@2.34.1
  - @memberjunction/entity-communications-server@2.34.1
  - @memberjunction/doc-utils@2.34.1
  - @memberjunction/external-change-detection@2.34.1
  - @memberjunction/graphql-dataprovider@2.34.1
  - @memberjunction/core@2.34.1
  - @memberjunction/core-entities@2.34.1
  - @memberjunction/data-context@2.34.1
  - @memberjunction/data-context-server@2.34.1
  - @memberjunction/global@2.34.1
  - @memberjunction/queue@2.34.1
  - @memberjunction/storage@2.34.1
  - @memberjunction/sqlserver-dataprovider@2.34.1
  - @memberjunction/skip-types@2.34.1
  - @memberjunction/templates@2.34.1

## 2.34.0

### Patch Changes

- Updated dependencies [e60f326]
- Updated dependencies [4c80a28]
- Updated dependencies [785f06a]
- Updated dependencies [b48d6b4]
- Updated dependencies [4c7f532]
- Updated dependencies [54ac86c]
  - @memberjunction/core-entities@2.34.0
  - @memberjunction/skip-types@2.34.0
  - @memberjunction/storage@2.34.0
  - @memberjunction/core@2.34.0
  - @memberjunction/ai@2.34.0
  - @memberjunction/ai-mistral@2.34.0
  - @memberjunction/ai-openai@2.34.0
  - @memberjunction/aiengine@2.34.0
  - @memberjunction/core-actions@2.34.0
  - @memberjunction/actions@2.34.0
  - @memberjunction/entity-communications-server@2.34.0
  - @memberjunction/doc-utils@2.34.0
  - @memberjunction/external-change-detection@2.34.0
  - @memberjunction/graphql-dataprovider@2.34.0
  - @memberjunction/data-context@2.34.0
  - @memberjunction/queue@2.34.0
  - @memberjunction/sqlserver-dataprovider@2.34.0
  - @memberjunction/templates@2.34.0
  - @memberjunction/ai-vectors-pinecone@2.34.0
  - @memberjunction/data-context-server@2.34.0
  - @memberjunction/global@2.34.0

## 2.33.0

### Patch Changes

- 02d7391: Claude Code Performance Optimizations for MJServer and SQLServerDataProvider as proposed
- fa7239f: Fix import syntax
- 9537497: Implement infra to handle action and entity action invocation from anywhere via GQL and added to User View Grid.
- 64f95ce: Fixed duplicate KeyValuePairInput class issue
- efafd0e: Readme documentation, courtesy of Claude
- Updated dependencies [02d7391]
- Updated dependencies [9537497]
- Updated dependencies [efafd0e]
  - @memberjunction/sqlserver-dataprovider@2.33.0
  - @memberjunction/graphql-dataprovider@2.33.0
  - @memberjunction/ai@2.33.0
  - @memberjunction/ai-mistral@2.33.0
  - @memberjunction/ai-openai@2.33.0
  - @memberjunction/ai-vectors-pinecone@2.33.0
  - @memberjunction/external-change-detection@2.33.0
  - @memberjunction/aiengine@2.33.0
  - @memberjunction/actions@2.33.0
  - @memberjunction/queue@2.33.0
  - @memberjunction/templates@2.33.0
  - @memberjunction/core-actions@2.33.0
  - @memberjunction/entity-communications-server@2.33.0
  - @memberjunction/doc-utils@2.33.0
  - @memberjunction/core@2.33.0
  - @memberjunction/core-entities@2.33.0
  - @memberjunction/data-context@2.33.0
  - @memberjunction/data-context-server@2.33.0
  - @memberjunction/global@2.33.0
  - @memberjunction/storage@2.33.0
  - @memberjunction/skip-types@2.33.0

## 2.32.2

### Patch Changes

- Updated dependencies [3788339]
  - @memberjunction/storage@2.32.2
  - @memberjunction/ai@2.32.2
  - @memberjunction/aiengine@2.32.2
  - @memberjunction/ai-mistral@2.32.2
  - @memberjunction/ai-openai@2.32.2
  - @memberjunction/ai-vectors-pinecone@2.32.2
  - @memberjunction/core-actions@2.32.2
  - @memberjunction/actions@2.32.2
  - @memberjunction/entity-communications-server@2.32.2
  - @memberjunction/doc-utils@2.32.2
  - @memberjunction/external-change-detection@2.32.2
  - @memberjunction/graphql-dataprovider@2.32.2
  - @memberjunction/core@2.32.2
  - @memberjunction/core-entities@2.32.2
  - @memberjunction/data-context@2.32.2
  - @memberjunction/data-context-server@2.32.2
  - @memberjunction/global@2.32.2
  - @memberjunction/queue@2.32.2
  - @memberjunction/sqlserver-dataprovider@2.32.2
  - @memberjunction/skip-types@2.32.2
  - @memberjunction/templates@2.32.2

## 2.32.1

### Patch Changes

- Updated dependencies [7f4a5b8]
  - @memberjunction/storage@2.32.1
  - @memberjunction/ai@2.32.1
  - @memberjunction/aiengine@2.32.1
  - @memberjunction/ai-mistral@2.32.1
  - @memberjunction/ai-openai@2.32.1
  - @memberjunction/ai-vectors-pinecone@2.32.1
  - @memberjunction/core-actions@2.32.1
  - @memberjunction/actions@2.32.1
  - @memberjunction/entity-communications-server@2.32.1
  - @memberjunction/doc-utils@2.32.1
  - @memberjunction/external-change-detection@2.32.1
  - @memberjunction/graphql-dataprovider@2.32.1
  - @memberjunction/core@2.32.1
  - @memberjunction/core-entities@2.32.1
  - @memberjunction/data-context@2.32.1
  - @memberjunction/data-context-server@2.32.1
  - @memberjunction/global@2.32.1
  - @memberjunction/queue@2.32.1
  - @memberjunction/sqlserver-dataprovider@2.32.1
  - @memberjunction/skip-types@2.32.1
  - @memberjunction/templates@2.32.1

## 2.32.0

### Patch Changes

- Updated dependencies [0d01e52]
- Updated dependencies [59b6f89]
  - @memberjunction/storage@2.32.0
  - @memberjunction/ai@2.32.0
  - @memberjunction/aiengine@2.32.0
  - @memberjunction/ai-mistral@2.32.0
  - @memberjunction/ai-openai@2.32.0
  - @memberjunction/ai-vectors-pinecone@2.32.0
  - @memberjunction/core-actions@2.32.0
  - @memberjunction/actions@2.32.0
  - @memberjunction/entity-communications-server@2.32.0
  - @memberjunction/doc-utils@2.32.0
  - @memberjunction/external-change-detection@2.32.0
  - @memberjunction/graphql-dataprovider@2.32.0
  - @memberjunction/core@2.32.0
  - @memberjunction/core-entities@2.32.0
  - @memberjunction/data-context@2.32.0
  - @memberjunction/data-context-server@2.32.0
  - @memberjunction/global@2.32.0
  - @memberjunction/queue@2.32.0
  - @memberjunction/sqlserver-dataprovider@2.32.0
  - @memberjunction/skip-types@2.32.0
  - @memberjunction/templates@2.32.0

## 2.31.0

### Minor Changes

- 946b64e: Added new metadata for Report Versions and Report User States, added plumbing for them and various bug fixes

### Patch Changes

- f3bf773: SkipTypes - further cleanup to normalize for HTML Report that won't use a sub process
- Updated dependencies [566d2f0]
- Updated dependencies [67c0b7f]
- Updated dependencies [7862d2a]
- Updated dependencies [b86a75d]
- Updated dependencies [f3bf773]
  - @memberjunction/skip-types@2.31.0
  - @memberjunction/aiengine@2.31.0
  - @memberjunction/templates@2.31.0
  - @memberjunction/graphql-dataprovider@2.31.0
  - @memberjunction/data-context@2.31.0
  - @memberjunction/data-context-server@2.31.0
  - @memberjunction/ai-vectors-pinecone@2.31.0
  - @memberjunction/actions@2.31.0
  - @memberjunction/queue@2.31.0
  - @memberjunction/sqlserver-dataprovider@2.31.0
  - @memberjunction/core-actions@2.31.0
  - @memberjunction/external-change-detection@2.31.0
  - @memberjunction/entity-communications-server@2.31.0
  - @memberjunction/ai@2.31.0
  - @memberjunction/ai-mistral@2.31.0
  - @memberjunction/ai-openai@2.31.0
  - @memberjunction/doc-utils@2.31.0
  - @memberjunction/core@2.31.0
  - @memberjunction/core-entities@2.31.0
  - @memberjunction/global@2.31.0
  - @memberjunction/storage@2.31.0

## 2.30.0

### Minor Changes

- a3ab749: Updated CodeGen for more generalized CHECK constraint validation function generation and built new metadata constructs to hold generated code for future needs as well.

### Patch Changes

- Updated dependencies [97c69b4]
- Updated dependencies [8f71da0]
- Updated dependencies [a3ab749]
- Updated dependencies [63dc5a9]
  - @memberjunction/ai-mistral@2.30.0
  - @memberjunction/actions@2.30.0
  - @memberjunction/aiengine@2.30.0
  - @memberjunction/core-entities@2.30.0
  - @memberjunction/global@2.30.0
  - @memberjunction/core-actions@2.30.0
  - @memberjunction/sqlserver-dataprovider@2.30.0
  - @memberjunction/ai-vectors-pinecone@2.30.0
  - @memberjunction/queue@2.30.0
  - @memberjunction/templates@2.30.0
  - @memberjunction/entity-communications-server@2.30.0
  - @memberjunction/doc-utils@2.30.0
  - @memberjunction/external-change-detection@2.30.0
  - @memberjunction/graphql-dataprovider@2.30.0
  - @memberjunction/data-context@2.30.0
  - @memberjunction/storage@2.30.0
  - @memberjunction/skip-types@2.30.0
  - @memberjunction/ai@2.30.0
  - @memberjunction/ai-openai@2.30.0
  - @memberjunction/core@2.30.0
  - @memberjunction/data-context-server@2.30.0

## 2.29.2

### Patch Changes

- 07bde92: New CodeGen Advanced Generation Functionality and supporting metadata schema changes
- 64aa7f0: New query for 2.29.0 to get version history since we aren't using an entity for flyway data anymore. Improvements to query execution to support query execution by name as well as by ID, and general cleanup (code wasn't working before as query ID wasn't enclosed in quotes from days of INT ID types)
- Updated dependencies [07bde92]
- Updated dependencies [64aa7f0]
- Updated dependencies [69c3505]
  - @memberjunction/core@2.29.2
  - @memberjunction/core-entities@2.29.2
  - @memberjunction/graphql-dataprovider@2.29.2
  - @memberjunction/sqlserver-dataprovider@2.29.2
  - @memberjunction/aiengine@2.29.2
  - @memberjunction/ai-vectors-pinecone@2.29.2
  - @memberjunction/core-actions@2.29.2
  - @memberjunction/actions@2.29.2
  - @memberjunction/entity-communications-server@2.29.2
  - @memberjunction/doc-utils@2.29.2
  - @memberjunction/external-change-detection@2.29.2
  - @memberjunction/data-context@2.29.2
  - @memberjunction/queue@2.29.2
  - @memberjunction/storage@2.29.2
  - @memberjunction/templates@2.29.2
  - @memberjunction/skip-types@2.29.2
  - @memberjunction/data-context-server@2.29.2
  - @memberjunction/ai@2.29.2
  - @memberjunction/ai-mistral@2.29.2
  - @memberjunction/ai-openai@2.29.2
  - @memberjunction/global@2.29.2

## 2.28.0

### Patch Changes

- Updated dependencies [8259093]
  - @memberjunction/core@2.28.0
  - @memberjunction/aiengine@2.28.0
  - @memberjunction/ai-vectors-pinecone@2.28.0
  - @memberjunction/core-actions@2.28.0
  - @memberjunction/actions@2.28.0
  - @memberjunction/entity-communications-server@2.28.0
  - @memberjunction/doc-utils@2.28.0
  - @memberjunction/external-change-detection@2.28.0
  - @memberjunction/graphql-dataprovider@2.28.0
  - @memberjunction/core-entities@2.28.0
  - @memberjunction/data-context@2.28.0
  - @memberjunction/queue@2.28.0
  - @memberjunction/storage@2.28.0
  - @memberjunction/sqlserver-dataprovider@2.28.0
  - @memberjunction/templates@2.28.0
  - @memberjunction/skip-types@2.28.0
  - @memberjunction/data-context-server@2.28.0
  - @memberjunction/ai@2.28.0
  - @memberjunction/ai-mistral@2.28.0
  - @memberjunction/ai-openai@2.28.0
  - @memberjunction/global@2.28.0

## 2.27.1

### Patch Changes

- aceeef2: Fixed Cloud Logging issues in MJServer, modified functionality for thumbs up/down in Skip Chat component
  - @memberjunction/ai@2.27.1
  - @memberjunction/aiengine@2.27.1
  - @memberjunction/ai-mistral@2.27.1
  - @memberjunction/ai-openai@2.27.1
  - @memberjunction/ai-vectors-pinecone@2.27.1
  - @memberjunction/core-actions@2.27.1
  - @memberjunction/actions@2.27.1
  - @memberjunction/entity-communications-server@2.27.1
  - @memberjunction/doc-utils@2.27.1
  - @memberjunction/external-change-detection@2.27.1
  - @memberjunction/graphql-dataprovider@2.27.1
  - @memberjunction/core@2.27.1
  - @memberjunction/core-entities@2.27.1
  - @memberjunction/data-context@2.27.1
  - @memberjunction/data-context-server@2.27.1
  - @memberjunction/global@2.27.1
  - @memberjunction/queue@2.27.1
  - @memberjunction/storage@2.27.1
  - @memberjunction/sqlserver-dataprovider@2.27.1
  - @memberjunction/skip-types@2.27.1
  - @memberjunction/templates@2.27.1

## 2.27.0

### Patch Changes

- c48d3b7: Added logging for Debug/Events to ResolverBase
- 5a81451: Added a UserID column to the Conversation Details Entity for the future extensibility of multi-user conversations with Skip.
- Updated dependencies [54ab868]
- Updated dependencies [b4d3cbc]
- Updated dependencies [5a81451]
  - @memberjunction/core@2.27.0
  - @memberjunction/ai@2.27.0
  - @memberjunction/core-entities@2.27.0
  - @memberjunction/templates@2.27.0
  - @memberjunction/aiengine@2.27.0
  - @memberjunction/ai-vectors-pinecone@2.27.0
  - @memberjunction/core-actions@2.27.0
  - @memberjunction/actions@2.27.0
  - @memberjunction/entity-communications-server@2.27.0
  - @memberjunction/doc-utils@2.27.0
  - @memberjunction/external-change-detection@2.27.0
  - @memberjunction/graphql-dataprovider@2.27.0
  - @memberjunction/data-context@2.27.0
  - @memberjunction/queue@2.27.0
  - @memberjunction/storage@2.27.0
  - @memberjunction/sqlserver-dataprovider@2.27.0
  - @memberjunction/ai-mistral@2.27.0
  - @memberjunction/ai-openai@2.27.0
  - @memberjunction/skip-types@2.27.0
  - @memberjunction/data-context-server@2.27.0
  - @memberjunction/global@2.27.0

## 2.26.1

### Patch Changes

- @memberjunction/ai@2.26.1
- @memberjunction/aiengine@2.26.1
- @memberjunction/ai-mistral@2.26.1
- @memberjunction/ai-openai@2.26.1
- @memberjunction/ai-vectors-pinecone@2.26.1
- @memberjunction/core-actions@2.26.1
- @memberjunction/actions@2.26.1
- @memberjunction/entity-communications-server@2.26.1
- @memberjunction/doc-utils@2.26.1
- @memberjunction/external-change-detection@2.26.1
- @memberjunction/graphql-dataprovider@2.26.1
- @memberjunction/core@2.26.1
- @memberjunction/core-entities@2.26.1
- @memberjunction/data-context@2.26.1
- @memberjunction/data-context-server@2.26.1
- @memberjunction/global@2.26.1
- @memberjunction/queue@2.26.1
- @memberjunction/storage@2.26.1
- @memberjunction/sqlserver-dataprovider@2.26.1
- @memberjunction/skip-types@2.26.1
- @memberjunction/templates@2.26.1

## 2.26.0

### Minor Changes

- 23801c5: Changes to use of TransactionGroup to use await at all times.Fixed up some metadata bugs in the \_\_mj schema that somehow existed from prior builds.Cleaned up SQL Server Data Provider handling of virtual fields in track record changesFixed CodeGen to not emit null wrapped as a string that was happening in some casesHardened MJCore.BaseEntity to treat a string with the word null in it as same as a true null value (in case someone throws that into the DB)

### Patch Changes

- 7171f2b: logging for cloud events
- Updated dependencies [23801c5]
  - @memberjunction/core@2.26.0
  - @memberjunction/data-context@2.26.0
  - @memberjunction/data-context-server@2.26.0
  - @memberjunction/sqlserver-dataprovider@2.26.0
  - @memberjunction/aiengine@2.26.0
  - @memberjunction/ai-vectors-pinecone@2.26.0
  - @memberjunction/core-actions@2.26.0
  - @memberjunction/actions@2.26.0
  - @memberjunction/entity-communications-server@2.26.0
  - @memberjunction/doc-utils@2.26.0
  - @memberjunction/external-change-detection@2.26.0
  - @memberjunction/graphql-dataprovider@2.26.0
  - @memberjunction/core-entities@2.26.0
  - @memberjunction/queue@2.26.0
  - @memberjunction/storage@2.26.0
  - @memberjunction/templates@2.26.0
  - @memberjunction/skip-types@2.26.0
  - @memberjunction/ai@2.26.0
  - @memberjunction/ai-mistral@2.26.0
  - @memberjunction/ai-openai@2.26.0
  - @memberjunction/global@2.26.0

## 2.25.0

### Patch Changes

- 824eca2: Transaction Group improvements
- 86e6d3b: Finished debug for Variables support in transaction groups!
- 801a9db: assert -> with
- Updated dependencies [0647504]
- Updated dependencies [fd07dcd]
- Updated dependencies [26c990d]
- Updated dependencies [824eca2]
- Updated dependencies [86e6d3b]
  - @memberjunction/sqlserver-dataprovider@2.25.0
  - @memberjunction/core@2.25.0
  - @memberjunction/graphql-dataprovider@2.25.0
  - @memberjunction/external-change-detection@2.25.0
  - @memberjunction/aiengine@2.25.0
  - @memberjunction/ai-vectors-pinecone@2.25.0
  - @memberjunction/core-actions@2.25.0
  - @memberjunction/actions@2.25.0
  - @memberjunction/entity-communications-server@2.25.0
  - @memberjunction/doc-utils@2.25.0
  - @memberjunction/core-entities@2.25.0
  - @memberjunction/data-context@2.25.0
  - @memberjunction/queue@2.25.0
  - @memberjunction/storage@2.25.0
  - @memberjunction/templates@2.25.0
  - @memberjunction/skip-types@2.25.0
  - @memberjunction/data-context-server@2.25.0
  - @memberjunction/ai@2.25.0
  - @memberjunction/ai-mistral@2.25.0
  - @memberjunction/ai-openai@2.25.0
  - @memberjunction/global@2.25.0

## 2.24.1

### Patch Changes

- ff327ff: Fix module import syntax
- b59c0ac: fix logic in ask skip entity packing
  - @memberjunction/ai@2.24.1
  - @memberjunction/aiengine@2.24.1
  - @memberjunction/ai-mistral@2.24.1
  - @memberjunction/ai-openai@2.24.1
  - @memberjunction/ai-vectors-pinecone@2.24.1
  - @memberjunction/core-actions@2.24.1
  - @memberjunction/actions@2.24.1
  - @memberjunction/entity-communications-server@2.24.1
  - @memberjunction/doc-utils@2.24.1
  - @memberjunction/external-change-detection@2.24.1
  - @memberjunction/graphql-dataprovider@2.24.1
  - @memberjunction/core@2.24.1
  - @memberjunction/core-entities@2.24.1
  - @memberjunction/data-context@2.24.1
  - @memberjunction/data-context-server@2.24.1
  - @memberjunction/global@2.24.1
  - @memberjunction/queue@2.24.1
  - @memberjunction/storage@2.24.1
  - @memberjunction/sqlserver-dataprovider@2.24.1
  - @memberjunction/skip-types@2.24.1
  - @memberjunction/templates@2.24.1

## 2.24.0

### Minor Changes

- 7c6ff41: Updates to support a new Description field in the DataContextItem entity and flow from the Skip API response where Skip can add new items separately from the DATA_REQUESTED response phase via the new GetData GQL query that MJ Server now supports.
- 32331a6: Run codegen to genreate new resolvers for MJ Server with read + read/write datasources

### Patch Changes

- 85e4bbe: Change instance to static variables for MJServer Cloud Events functionality to prevent multiple subs as instances of Resolver Base are created/destroyed
- 3fa9e9a: Event raising for MJServer
- Updated dependencies [9cb85cc]
- Updated dependencies [7c6ff41]
  - @memberjunction/global@2.24.0
  - @memberjunction/core-entities@2.24.0
  - @memberjunction/data-context@2.24.0
  - @memberjunction/ai@2.24.0
  - @memberjunction/aiengine@2.24.0
  - @memberjunction/ai-mistral@2.24.0
  - @memberjunction/ai-openai@2.24.0
  - @memberjunction/ai-vectors-pinecone@2.24.0
  - @memberjunction/core-actions@2.24.0
  - @memberjunction/actions@2.24.0
  - @memberjunction/entity-communications-server@2.24.0
  - @memberjunction/doc-utils@2.24.0
  - @memberjunction/external-change-detection@2.24.0
  - @memberjunction/graphql-dataprovider@2.24.0
  - @memberjunction/core@2.24.0
  - @memberjunction/data-context-server@2.24.0
  - @memberjunction/queue@2.24.0
  - @memberjunction/storage@2.24.0
  - @memberjunction/sqlserver-dataprovider@2.24.0
  - @memberjunction/templates@2.24.0
  - @memberjunction/skip-types@2.24.0

## 2.23.2

### Patch Changes

- d69811b: Fix bug in RunView
  - @memberjunction/ai@2.23.2
  - @memberjunction/aiengine@2.23.2
  - @memberjunction/ai-mistral@2.23.2
  - @memberjunction/ai-openai@2.23.2
  - @memberjunction/ai-vectors-pinecone@2.23.2
  - @memberjunction/core-actions@2.23.2
  - @memberjunction/actions@2.23.2
  - @memberjunction/entity-communications-server@2.23.2
  - @memberjunction/doc-utils@2.23.2
  - @memberjunction/external-change-detection@2.23.2
  - @memberjunction/graphql-dataprovider@2.23.2
  - @memberjunction/core@2.23.2
  - @memberjunction/core-entities@2.23.2
  - @memberjunction/data-context@2.23.2
  - @memberjunction/data-context-server@2.23.2
  - @memberjunction/global@2.23.2
  - @memberjunction/queue@2.23.2
  - @memberjunction/storage@2.23.2
  - @memberjunction/sqlserver-dataprovider@2.23.2
  - @memberjunction/skip-types@2.23.2
  - @memberjunction/templates@2.23.2

## 2.23.1

### Patch Changes

- 3d67b82: Auto detect changes to data via SyncData/SyncUsersAndRoles and auto refresh the respective cache
  - @memberjunction/ai@2.23.1
  - @memberjunction/aiengine@2.23.1
  - @memberjunction/ai-mistral@2.23.1
  - @memberjunction/ai-openai@2.23.1
  - @memberjunction/ai-vectors-pinecone@2.23.1
  - @memberjunction/core-actions@2.23.1
  - @memberjunction/actions@2.23.1
  - @memberjunction/entity-communications-server@2.23.1
  - @memberjunction/doc-utils@2.23.1
  - @memberjunction/external-change-detection@2.23.1
  - @memberjunction/graphql-dataprovider@2.23.1
  - @memberjunction/core@2.23.1
  - @memberjunction/core-entities@2.23.1
  - @memberjunction/data-context@2.23.1
  - @memberjunction/data-context-server@2.23.1
  - @memberjunction/global@2.23.1
  - @memberjunction/queue@2.23.1
  - @memberjunction/storage@2.23.1
  - @memberjunction/sqlserver-dataprovider@2.23.1
  - @memberjunction/skip-types@2.23.1
  - @memberjunction/templates@2.23.1

## 2.23.0

### Patch Changes

- Updated dependencies [09d3fa9]
- Updated dependencies [38b7507]
  - @memberjunction/sqlserver-dataprovider@2.23.0
  - @memberjunction/global@2.23.0
  - @memberjunction/external-change-detection@2.23.0
  - @memberjunction/ai@2.23.0
  - @memberjunction/aiengine@2.23.0
  - @memberjunction/ai-mistral@2.23.0
  - @memberjunction/ai-openai@2.23.0
  - @memberjunction/ai-vectors-pinecone@2.23.0
  - @memberjunction/core-actions@2.23.0
  - @memberjunction/actions@2.23.0
  - @memberjunction/entity-communications-server@2.23.0
  - @memberjunction/doc-utils@2.23.0
  - @memberjunction/graphql-dataprovider@2.23.0
  - @memberjunction/core@2.23.0
  - @memberjunction/core-entities@2.23.0
  - @memberjunction/data-context@2.23.0
  - @memberjunction/data-context-server@2.23.0
  - @memberjunction/queue@2.23.0
  - @memberjunction/storage@2.23.0
  - @memberjunction/templates@2.23.0
  - @memberjunction/skip-types@2.23.0

## 2.22.2

### Patch Changes

- Updated dependencies [94ebf81]
  - @memberjunction/core@2.22.2
  - @memberjunction/aiengine@2.22.2
  - @memberjunction/ai-vectors-pinecone@2.22.2
  - @memberjunction/core-actions@2.22.2
  - @memberjunction/actions@2.22.2
  - @memberjunction/entity-communications-server@2.22.2
  - @memberjunction/doc-utils@2.22.2
  - @memberjunction/external-change-detection@2.22.2
  - @memberjunction/graphql-dataprovider@2.22.2
  - @memberjunction/core-entities@2.22.2
  - @memberjunction/data-context@2.22.2
  - @memberjunction/queue@2.22.2
  - @memberjunction/storage@2.22.2
  - @memberjunction/sqlserver-dataprovider@2.22.2
  - @memberjunction/templates@2.22.2
  - @memberjunction/skip-types@2.22.2
  - @memberjunction/data-context-server@2.22.2
  - @memberjunction/ai@2.22.2
  - @memberjunction/ai-mistral@2.22.2
  - @memberjunction/ai-openai@2.22.2
  - @memberjunction/global@2.22.2

## 2.22.1

### Patch Changes

- e8b3632: Updates to lockfile and publishing
  - @memberjunction/ai@2.22.1
  - @memberjunction/aiengine@2.22.1
  - @memberjunction/ai-mistral@2.22.1
  - @memberjunction/ai-openai@2.22.1
  - @memberjunction/ai-vectors-pinecone@2.22.1
  - @memberjunction/core-actions@2.22.1
  - @memberjunction/actions@2.22.1
  - @memberjunction/entity-communications-server@2.22.1
  - @memberjunction/doc-utils@2.22.1
  - @memberjunction/external-change-detection@2.22.1
  - @memberjunction/graphql-dataprovider@2.22.1
  - @memberjunction/core@2.22.1
  - @memberjunction/core-entities@2.22.1
  - @memberjunction/data-context@2.22.1
  - @memberjunction/data-context-server@2.22.1
  - @memberjunction/global@2.22.1
  - @memberjunction/queue@2.22.1
  - @memberjunction/storage@2.22.1
  - @memberjunction/sqlserver-dataprovider@2.22.1
  - @memberjunction/skip-types@2.22.1
  - @memberjunction/templates@2.22.1

## 2.22.0

### Patch Changes

- e9a6c78: Lock types/ws package to specific patch version
- Updated dependencies [12d2186]
- Updated dependencies [a598f1a]
- Updated dependencies [9660275]
  - @memberjunction/graphql-dataprovider@2.22.0
  - @memberjunction/core@2.22.0
  - @memberjunction/global@2.22.0
  - @memberjunction/aiengine@2.22.0
  - @memberjunction/ai-vectors-pinecone@2.22.0
  - @memberjunction/core-actions@2.22.0
  - @memberjunction/actions@2.22.0
  - @memberjunction/entity-communications-server@2.22.0
  - @memberjunction/doc-utils@2.22.0
  - @memberjunction/external-change-detection@2.22.0
  - @memberjunction/core-entities@2.22.0
  - @memberjunction/data-context@2.22.0
  - @memberjunction/queue@2.22.0
  - @memberjunction/storage@2.22.0
  - @memberjunction/sqlserver-dataprovider@2.22.0
  - @memberjunction/templates@2.22.0
  - @memberjunction/ai@2.22.0
  - @memberjunction/ai-mistral@2.22.0
  - @memberjunction/ai-openai@2.22.0
  - @memberjunction/data-context-server@2.22.0
  - @memberjunction/skip-types@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.21.0
- Bump @memberjunction/ai to v2.21.0
- Bump @memberjunction/ai-mistral to v2.21.0
- Bump @memberjunction/ai-openai to v2.21.0
- Bump @memberjunction/ai-vectors-pinecone to v2.21.0
- Bump @memberjunction/aiengine to v2.21.0
- Bump @memberjunction/core to v2.21.0
- Bump @memberjunction/core-actions to v2.21.0
- Bump @memberjunction/core-entities to v2.21.0
- Bump @memberjunction/data-context to v2.21.0
- Bump @memberjunction/data-context-server to v2.21.0
- Bump @memberjunction/doc-utils to v2.21.0
- Bump @memberjunction/entity-communications-server to v2.21.0
- Bump @memberjunction/external-change-detection to v2.21.0
- Bump @memberjunction/global to v2.21.0
- Bump @memberjunction/graphql-dataprovider to v2.21.0
- Bump @memberjunction/queue to v2.21.0
- Bump @memberjunction/skip-types to v2.21.0
- Bump @memberjunction/sqlserver-dataprovider to v2.21.0
- Bump @memberjunction/storage to v2.21.0
- Bump @memberjunction/templates to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.20.3
- Bump @memberjunction/ai to v2.20.3
- Bump @memberjunction/ai-mistral to v2.20.3
- Bump @memberjunction/ai-openai to v2.20.3
- Bump @memberjunction/ai-vectors-pinecone to v2.20.3
- Bump @memberjunction/aiengine to v2.20.3
- Bump @memberjunction/core to v2.20.3
- Bump @memberjunction/core-actions to v2.20.3
- Bump @memberjunction/core-entities to v2.20.3
- Bump @memberjunction/data-context to v2.20.3
- Bump @memberjunction/data-context-server to v2.20.3
- Bump @memberjunction/doc-utils to v2.20.3
- Bump @memberjunction/entity-communications-server to v2.20.3
- Bump @memberjunction/external-change-detection to v2.20.3
- Bump @memberjunction/global to v2.20.3
- Bump @memberjunction/graphql-dataprovider to v2.20.3
- Bump @memberjunction/queue to v2.20.3
- Bump @memberjunction/skip-types to v2.20.3
- Bump @memberjunction/sqlserver-dataprovider to v2.20.3
- Bump @memberjunction/storage to v2.20.3
- Bump @memberjunction/templates to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig@memberjunction.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.20.2
- Bump @memberjunction/ai to v2.20.2
- Bump @memberjunction/ai-mistral to v2.20.2
- Bump @memberjunction/ai-openai to v2.20.2
- Bump @memberjunction/ai-vectors-pinecone to v2.20.2
- Bump @memberjunction/aiengine to v2.20.2
- Bump @memberjunction/core to v2.20.2
- Bump @memberjunction/core-actions to v2.20.2
- Bump @memberjunction/core-entities to v2.20.2
- Bump @memberjunction/data-context to v2.20.2
- Bump @memberjunction/data-context-server to v2.20.2
- Bump @memberjunction/doc-utils to v2.20.2
- Bump @memberjunction/entity-communications-server to v2.20.2
- Bump @memberjunction/external-change-detection to v2.20.2
- Bump @memberjunction/global to v2.20.2
- Bump @memberjunction/graphql-dataprovider to v2.20.2
- Bump @memberjunction/queue to v2.20.2
- Bump @memberjunction/skip-types to v2.20.2
- Bump @memberjunction/sqlserver-dataprovider to v2.20.2
- Bump @memberjunction/storage to v2.20.2
- Bump @memberjunction/templates to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/actions to v2.20.1
- Bump @memberjunction/ai to v2.20.1
- Bump @memberjunction/ai-mistral to v2.20.1
- Bump @memberjunction/ai-openai to v2.20.1
- Bump @memberjunction/ai-vectors-pinecone to v2.20.1
- Bump @memberjunction/aiengine to v2.20.1
- Bump @memberjunction/core to v2.20.1
- Bump @memberjunction/core-actions to v2.20.1
- Bump @memberjunction/core-entities to v2.20.1
- Bump @memberjunction/data-context to v2.20.1
- Bump @memberjunction/data-context-server to v2.20.1
- Bump @memberjunction/doc-utils to v2.20.1
- Bump @memberjunction/entity-communications-server to v2.20.1
- Bump @memberjunction/external-change-detection to v2.20.1
- Bump @memberjunction/global to v2.20.1
- Bump @memberjunction/graphql-dataprovider to v2.20.1
- Bump @memberjunction/queue to v2.20.1
- Bump @memberjunction/skip-types to v2.20.1
- Bump @memberjunction/sqlserver-dataprovider to v2.20.1
- Bump @memberjunction/storage to v2.20.1
- Bump @memberjunction/templates to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:03 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.20.0
- Bump @memberjunction/ai to v2.20.0
- Bump @memberjunction/ai-mistral to v2.20.0
- Bump @memberjunction/ai-openai to v2.20.0
- Bump @memberjunction/ai-vectors-pinecone to v2.20.0
- Bump @memberjunction/aiengine to v2.20.0
- Bump @memberjunction/core to v2.20.0
- Bump @memberjunction/core-actions to v2.20.0
- Bump @memberjunction/core-entities to v2.20.0
- Bump @memberjunction/data-context to v2.20.0
- Bump @memberjunction/data-context-server to v2.20.0
- Bump @memberjunction/doc-utils to v2.20.0
- Bump @memberjunction/entity-communications-server to v2.20.0
- Bump @memberjunction/external-change-detection to v2.20.0
- Bump @memberjunction/global to v2.20.0
- Bump @memberjunction/graphql-dataprovider to v2.20.0
- Bump @memberjunction/queue to v2.20.0
- Bump @memberjunction/skip-types to v2.20.0
- Bump @memberjunction/sqlserver-dataprovider to v2.20.0
- Bump @memberjunction/storage to v2.20.0
- Bump @memberjunction/templates to v2.20.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Applying package updates [skip ci] (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.19.5
- Bump @memberjunction/ai to v2.19.5
- Bump @memberjunction/ai-mistral to v2.19.5
- Bump @memberjunction/ai-openai to v2.19.5
- Bump @memberjunction/ai-vectors-pinecone to v2.19.5
- Bump @memberjunction/aiengine to v2.19.5
- Bump @memberjunction/core to v2.19.5
- Bump @memberjunction/core-actions to v2.19.5
- Bump @memberjunction/core-entities to v2.19.5
- Bump @memberjunction/data-context to v2.19.5
- Bump @memberjunction/data-context-server to v2.19.5
- Bump @memberjunction/doc-utils to v2.19.5
- Bump @memberjunction/entity-communications-server to v2.19.5
- Bump @memberjunction/external-change-detection to v2.19.5
- Bump @memberjunction/global to v2.19.5
- Bump @memberjunction/graphql-dataprovider to v2.19.5
- Bump @memberjunction/queue to v2.19.5
- Bump @memberjunction/skip-types to v2.19.5
- Bump @memberjunction/sqlserver-dataprovider to v2.19.5
- Bump @memberjunction/storage to v2.19.5
- Bump @memberjunction/templates to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.19.4
- Bump @memberjunction/ai to v2.19.4
- Bump @memberjunction/ai-mistral to v2.19.4
- Bump @memberjunction/ai-openai to v2.19.4
- Bump @memberjunction/ai-vectors-pinecone to v2.19.4
- Bump @memberjunction/aiengine to v2.19.4
- Bump @memberjunction/core to v2.19.4
- Bump @memberjunction/core-actions to v2.19.4
- Bump @memberjunction/core-entities to v2.19.4
- Bump @memberjunction/data-context to v2.19.4
- Bump @memberjunction/data-context-server to v2.19.4
- Bump @memberjunction/doc-utils to v2.19.4
- Bump @memberjunction/entity-communications-server to v2.19.4
- Bump @memberjunction/external-change-detection to v2.19.4
- Bump @memberjunction/global to v2.19.4
- Bump @memberjunction/graphql-dataprovider to v2.19.4
- Bump @memberjunction/queue to v2.19.4
- Bump @memberjunction/skip-types to v2.19.4
- Bump @memberjunction/sqlserver-dataprovider to v2.19.4
- Bump @memberjunction/storage to v2.19.4
- Bump @memberjunction/templates to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/actions to v2.19.3
- Bump @memberjunction/ai to v2.19.3
- Bump @memberjunction/ai-mistral to v2.19.3
- Bump @memberjunction/ai-openai to v2.19.3
- Bump @memberjunction/ai-vectors-pinecone to v2.19.3
- Bump @memberjunction/aiengine to v2.19.3
- Bump @memberjunction/core to v2.19.3
- Bump @memberjunction/core-actions to v2.19.3
- Bump @memberjunction/core-entities to v2.19.3
- Bump @memberjunction/data-context to v2.19.3
- Bump @memberjunction/data-context-server to v2.19.3
- Bump @memberjunction/doc-utils to v2.19.3
- Bump @memberjunction/entity-communications-server to v2.19.3
- Bump @memberjunction/external-change-detection to v2.19.3
- Bump @memberjunction/global to v2.19.3
- Bump @memberjunction/graphql-dataprovider to v2.19.3
- Bump @memberjunction/queue to v2.19.3
- Bump @memberjunction/skip-types to v2.19.3
- Bump @memberjunction/sqlserver-dataprovider to v2.19.3
- Bump @memberjunction/storage to v2.19.3
- Bump @memberjunction/templates to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/actions to v2.19.2
- Bump @memberjunction/ai to v2.19.2
- Bump @memberjunction/ai-mistral to v2.19.2
- Bump @memberjunction/ai-openai to v2.19.2
- Bump @memberjunction/ai-vectors-pinecone to v2.19.2
- Bump @memberjunction/aiengine to v2.19.2
- Bump @memberjunction/core to v2.19.2
- Bump @memberjunction/core-actions to v2.19.2
- Bump @memberjunction/core-entities to v2.19.2
- Bump @memberjunction/data-context to v2.19.2
- Bump @memberjunction/data-context-server to v2.19.2
- Bump @memberjunction/doc-utils to v2.19.2
- Bump @memberjunction/entity-communications-server to v2.19.2
- Bump @memberjunction/external-change-detection to v2.19.2
- Bump @memberjunction/global to v2.19.2
- Bump @memberjunction/graphql-dataprovider to v2.19.2
- Bump @memberjunction/queue to v2.19.2
- Bump @memberjunction/skip-types to v2.19.2
- Bump @memberjunction/sqlserver-dataprovider to v2.19.2
- Bump @memberjunction/storage to v2.19.2
- Bump @memberjunction/templates to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/actions to v2.19.1
- Bump @memberjunction/ai to v2.19.1
- Bump @memberjunction/ai-mistral to v2.19.1
- Bump @memberjunction/ai-openai to v2.19.1
- Bump @memberjunction/ai-vectors-pinecone to v2.19.1
- Bump @memberjunction/aiengine to v2.19.1
- Bump @memberjunction/core to v2.19.1
- Bump @memberjunction/core-actions to v2.19.1
- Bump @memberjunction/core-entities to v2.19.1
- Bump @memberjunction/data-context to v2.19.1
- Bump @memberjunction/data-context-server to v2.19.1
- Bump @memberjunction/doc-utils to v2.19.1
- Bump @memberjunction/entity-communications-server to v2.19.1
- Bump @memberjunction/external-change-detection to v2.19.1
- Bump @memberjunction/global to v2.19.1
- Bump @memberjunction/graphql-dataprovider to v2.19.1
- Bump @memberjunction/queue to v2.19.1
- Bump @memberjunction/skip-types to v2.19.1
- Bump @memberjunction/sqlserver-dataprovider to v2.19.1
- Bump @memberjunction/storage to v2.19.1
- Bump @memberjunction/templates to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:47 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.19.0
- Bump @memberjunction/ai to v2.19.0
- Bump @memberjunction/ai-mistral to v2.19.0
- Bump @memberjunction/ai-openai to v2.19.0
- Bump @memberjunction/ai-vectors-pinecone to v2.19.0
- Bump @memberjunction/aiengine to v2.19.0
- Bump @memberjunction/core to v2.19.0
- Bump @memberjunction/core-actions to v2.19.0
- Bump @memberjunction/core-entities to v2.19.0
- Bump @memberjunction/data-context to v2.19.0
- Bump @memberjunction/data-context-server to v2.19.0
- Bump @memberjunction/doc-utils to v2.19.0
- Bump @memberjunction/entity-communications-server to v2.19.0
- Bump @memberjunction/external-change-detection to v2.19.0
- Bump @memberjunction/global to v2.19.0
- Bump @memberjunction/graphql-dataprovider to v2.19.0
- Bump @memberjunction/queue to v2.19.0
- Bump @memberjunction/skip-types to v2.19.0
- Bump @memberjunction/sqlserver-dataprovider to v2.19.0
- Bump @memberjunction/storage to v2.19.0
- Bump @memberjunction/templates to v2.19.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Applying package updates [skip ci] (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.18.3
- Bump @memberjunction/ai to v2.18.3
- Bump @memberjunction/ai-mistral to v2.18.3
- Bump @memberjunction/ai-openai to v2.18.3
- Bump @memberjunction/ai-vectors-pinecone to v2.18.3
- Bump @memberjunction/aiengine to v2.18.3
- Bump @memberjunction/core to v2.18.3
- Bump @memberjunction/core-actions to v2.18.3
- Bump @memberjunction/core-entities to v2.18.3
- Bump @memberjunction/data-context to v2.18.3
- Bump @memberjunction/data-context-server to v2.18.3
- Bump @memberjunction/doc-utils to v2.18.3
- Bump @memberjunction/entity-communications-server to v2.18.3
- Bump @memberjunction/external-change-detection to v2.18.3
- Bump @memberjunction/global to v2.18.3
- Bump @memberjunction/graphql-dataprovider to v2.18.3
- Bump @memberjunction/queue to v2.18.3
- Bump @memberjunction/skip-types to v2.18.3
- Bump @memberjunction/sqlserver-dataprovider to v2.18.3
- Bump @memberjunction/storage to v2.18.3
- Bump @memberjunction/templates to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Applying package updates [skip ci] (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.18.2
- Bump @memberjunction/ai to v2.18.2
- Bump @memberjunction/ai-mistral to v2.18.2
- Bump @memberjunction/ai-openai to v2.18.2
- Bump @memberjunction/ai-vectors-pinecone to v2.18.2
- Bump @memberjunction/aiengine to v2.18.2
- Bump @memberjunction/core to v2.18.2
- Bump @memberjunction/core-actions to v2.18.2
- Bump @memberjunction/core-entities to v2.18.2
- Bump @memberjunction/data-context to v2.18.2
- Bump @memberjunction/data-context-server to v2.18.2
- Bump @memberjunction/doc-utils to v2.18.2
- Bump @memberjunction/entity-communications-server to v2.18.2
- Bump @memberjunction/external-change-detection to v2.18.2
- Bump @memberjunction/global to v2.18.2
- Bump @memberjunction/graphql-dataprovider to v2.18.2
- Bump @memberjunction/queue to v2.18.2
- Bump @memberjunction/skip-types to v2.18.2
- Bump @memberjunction/sqlserver-dataprovider to v2.18.2
- Bump @memberjunction/storage to v2.18.2
- Bump @memberjunction/templates to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/actions to v2.18.1
- Bump @memberjunction/ai to v2.18.1
- Bump @memberjunction/ai-mistral to v2.18.1
- Bump @memberjunction/ai-openai to v2.18.1
- Bump @memberjunction/ai-vectors-pinecone to v2.18.1
- Bump @memberjunction/aiengine to v2.18.1
- Bump @memberjunction/core to v2.18.1
- Bump @memberjunction/core-actions to v2.18.1
- Bump @memberjunction/core-entities to v2.18.1
- Bump @memberjunction/data-context to v2.18.1
- Bump @memberjunction/data-context-server to v2.18.1
- Bump @memberjunction/doc-utils to v2.18.1
- Bump @memberjunction/entity-communications-server to v2.18.1
- Bump @memberjunction/external-change-detection to v2.18.1
- Bump @memberjunction/global to v2.18.1
- Bump @memberjunction/graphql-dataprovider to v2.18.1
- Bump @memberjunction/queue to v2.18.1
- Bump @memberjunction/skip-types to v2.18.1
- Bump @memberjunction/sqlserver-dataprovider to v2.18.1
- Bump @memberjunction/storage to v2.18.1
- Bump @memberjunction/templates to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.18.0
- Bump @memberjunction/ai to v2.18.0
- Bump @memberjunction/ai-mistral to v2.18.0
- Bump @memberjunction/ai-openai to v2.18.0
- Bump @memberjunction/ai-vectors-pinecone to v2.18.0
- Bump @memberjunction/aiengine to v2.18.0
- Bump @memberjunction/core to v2.18.0
- Bump @memberjunction/core-actions to v2.18.0
- Bump @memberjunction/core-entities to v2.18.0
- Bump @memberjunction/data-context to v2.18.0
- Bump @memberjunction/data-context-server to v2.18.0
- Bump @memberjunction/doc-utils to v2.18.0
- Bump @memberjunction/entity-communications-server to v2.18.0
- Bump @memberjunction/external-change-detection to v2.18.0
- Bump @memberjunction/global to v2.18.0
- Bump @memberjunction/graphql-dataprovider to v2.18.0
- Bump @memberjunction/queue to v2.18.0
- Bump @memberjunction/skip-types to v2.18.0
- Bump @memberjunction/sqlserver-dataprovider to v2.18.0
- Bump @memberjunction/storage to v2.18.0
- Bump @memberjunction/templates to v2.18.0

## 2.17.0

Wed, 15 Jan 2025 03:17:07 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.17.0
- Bump @memberjunction/ai to v2.17.0
- Bump @memberjunction/ai-mistral to v2.17.0
- Bump @memberjunction/ai-openai to v2.17.0
- Bump @memberjunction/ai-vectors-pinecone to v2.17.0
- Bump @memberjunction/aiengine to v2.17.0
- Bump @memberjunction/core to v2.17.0
- Bump @memberjunction/core-actions to v2.17.0
- Bump @memberjunction/core-entities to v2.17.0
- Bump @memberjunction/data-context to v2.17.0
- Bump @memberjunction/data-context-server to v2.17.0
- Bump @memberjunction/doc-utils to v2.17.0
- Bump @memberjunction/entity-communications-server to v2.17.0
- Bump @memberjunction/external-change-detection to v2.17.0
- Bump @memberjunction/global to v2.17.0
- Bump @memberjunction/graphql-dataprovider to v2.17.0
- Bump @memberjunction/queue to v2.17.0
- Bump @memberjunction/skip-types to v2.17.0
- Bump @memberjunction/sqlserver-dataprovider to v2.17.0
- Bump @memberjunction/storage to v2.17.0
- Bump @memberjunction/templates to v2.17.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.16.1

Tue, 14 Jan 2025 14:12:27 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.16.1
- Bump @memberjunction/ai to v2.16.1
- Bump @memberjunction/ai-mistral to v2.16.1
- Bump @memberjunction/ai-openai to v2.16.1
- Bump @memberjunction/ai-vectors-pinecone to v2.16.1
- Bump @memberjunction/aiengine to v2.16.1
- Bump @memberjunction/core to v2.16.1
- Bump @memberjunction/core-actions to v2.16.1
- Bump @memberjunction/core-entities to v2.16.1
- Bump @memberjunction/data-context to v2.16.1
- Bump @memberjunction/data-context-server to v2.16.1
- Bump @memberjunction/doc-utils to v2.16.1
- Bump @memberjunction/entity-communications-server to v2.16.1
- Bump @memberjunction/external-change-detection to v2.16.1
- Bump @memberjunction/global to v2.16.1
- Bump @memberjunction/graphql-dataprovider to v2.16.1
- Bump @memberjunction/queue to v2.16.1
- Bump @memberjunction/skip-types to v2.16.1
- Bump @memberjunction/sqlserver-dataprovider to v2.16.1
- Bump @memberjunction/storage to v2.16.1
- Bump @memberjunction/templates to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.16.0
- Bump @memberjunction/ai to v2.16.0
- Bump @memberjunction/ai-mistral to v2.16.0
- Bump @memberjunction/ai-openai to v2.16.0
- Bump @memberjunction/ai-vectors-pinecone to v2.16.0
- Bump @memberjunction/aiengine to v2.16.0
- Bump @memberjunction/core to v2.16.0
- Bump @memberjunction/core-actions to v2.16.0
- Bump @memberjunction/core-entities to v2.16.0
- Bump @memberjunction/data-context to v2.16.0
- Bump @memberjunction/data-context-server to v2.16.0
- Bump @memberjunction/doc-utils to v2.16.0
- Bump @memberjunction/entity-communications-server to v2.16.0
- Bump @memberjunction/external-change-detection to v2.16.0
- Bump @memberjunction/global to v2.16.0
- Bump @memberjunction/graphql-dataprovider to v2.16.0
- Bump @memberjunction/queue to v2.16.0
- Bump @memberjunction/skip-types to v2.16.0
- Bump @memberjunction/sqlserver-dataprovider to v2.16.0
- Bump @memberjunction/storage to v2.16.0
- Bump @memberjunction/templates to v2.16.0

### Patches

- Applying package updates [skip ci] (craig@memberjunction.com)

## 2.15.2

Mon, 13 Jan 2025 18:14:27 GMT

### Patches

- Bump patch version (craig@memberjunction.com)
- Applying package updates [skip ci] (nico.ortiz@bluecypress.io)
- Applying package updates [skip ci] (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Applying package updates [skip ci] (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.15.2
- Bump @memberjunction/ai to v2.15.2
- Bump @memberjunction/ai-mistral to v2.15.2
- Bump @memberjunction/ai-openai to v2.15.2
- Bump @memberjunction/ai-vectors-pinecone to v2.15.2
- Bump @memberjunction/aiengine to v2.15.2
- Bump @memberjunction/core to v2.15.2
- Bump @memberjunction/core-actions to v2.15.2
- Bump @memberjunction/core-entities to v2.15.2
- Bump @memberjunction/data-context to v2.15.2
- Bump @memberjunction/data-context-server to v2.15.2
- Bump @memberjunction/doc-utils to v2.15.2
- Bump @memberjunction/entity-communications-server to v2.15.2
- Bump @memberjunction/external-change-detection to v2.15.2
- Bump @memberjunction/global to v2.15.2
- Bump @memberjunction/queue to v2.15.2
- Bump @memberjunction/skip-types to v2.15.2
- Bump @memberjunction/sqlserver-dataprovider to v2.15.2
- Bump @memberjunction/graphql-dataprovider to v2.15.2
- Bump @memberjunction/storage to v2.15.2
- Bump @memberjunction/templates to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.14.0
- Bump @memberjunction/ai to v2.14.0
- Bump @memberjunction/ai-mistral to v2.14.0
- Bump @memberjunction/ai-openai to v2.14.0
- Bump @memberjunction/ai-vectors-pinecone to v2.14.0
- Bump @memberjunction/aiengine to v2.14.0
- Bump @memberjunction/core to v2.14.0
- Bump @memberjunction/core-actions to v2.14.0
- Bump @memberjunction/core-entities to v2.14.0
- Bump @memberjunction/data-context to v2.14.0
- Bump @memberjunction/data-context-server to v2.14.0
- Bump @memberjunction/doc-utils to v2.14.0
- Bump @memberjunction/entity-communications-server to v2.14.0
- Bump @memberjunction/external-change-detection to v2.14.0
- Bump @memberjunction/global to v2.14.0
- Bump @memberjunction/queue to v2.14.0
- Bump @memberjunction/skip-types to v2.14.0
- Bump @memberjunction/sqlserver-dataprovider to v2.14.0
- Bump @memberjunction/graphql-dataprovider to v2.14.0
- Bump @memberjunction/storage to v2.14.0
- Bump @memberjunction/templates to v2.14.0

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/actions to v2.13.4
- Bump @memberjunction/ai to v2.13.4
- Bump @memberjunction/ai-mistral to v2.13.4
- Bump @memberjunction/ai-openai to v2.13.4
- Bump @memberjunction/ai-vectors-pinecone to v2.13.4
- Bump @memberjunction/aiengine to v2.13.4
- Bump @memberjunction/core to v2.13.4
- Bump @memberjunction/core-actions to v2.13.4
- Bump @memberjunction/core-entities to v2.13.4
- Bump @memberjunction/data-context to v2.13.4
- Bump @memberjunction/data-context-server to v2.13.4
- Bump @memberjunction/doc-utils to v2.13.4
- Bump @memberjunction/entity-communications-server to v2.13.4
- Bump @memberjunction/external-change-detection to v2.13.4
- Bump @memberjunction/global to v2.13.4
- Bump @memberjunction/queue to v2.13.4
- Bump @memberjunction/skip-types to v2.13.4
- Bump @memberjunction/sqlserver-dataprovider to v2.13.4
- Bump @memberjunction/graphql-dataprovider to v2.13.4
- Bump @memberjunction/storage to v2.13.4
- Bump @memberjunction/templates to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:44 GMT

### Patches

- Applying package updates [skip ci] (craig@memberjunction.com)
- Applying package updates [skip ci] (craig@memberjunction.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.13.3
- Bump @memberjunction/ai to v2.13.3
- Bump @memberjunction/ai-mistral to v2.13.3
- Bump @memberjunction/ai-openai to v2.13.3
- Bump @memberjunction/ai-vectors-pinecone to v2.13.3
- Bump @memberjunction/aiengine to v2.13.3
- Bump @memberjunction/core to v2.13.3
- Bump @memberjunction/core-actions to v2.13.3
- Bump @memberjunction/core-entities to v2.13.3
- Bump @memberjunction/data-context to v2.13.3
- Bump @memberjunction/data-context-server to v2.13.3
- Bump @memberjunction/doc-utils to v2.13.3
- Bump @memberjunction/entity-communications-server to v2.13.3
- Bump @memberjunction/external-change-detection to v2.13.3
- Bump @memberjunction/global to v2.13.3
- Bump @memberjunction/queue to v2.13.3
- Bump @memberjunction/skip-types to v2.13.3
- Bump @memberjunction/sqlserver-dataprovider to v2.13.3
- Bump @memberjunction/graphql-dataprovider to v2.13.3
- Bump @memberjunction/storage to v2.13.3
- Bump @memberjunction/templates to v2.13.3

## 2.13.2

Tue, 03 Dec 2024 23:30:43 GMT

### Patches

- Bump @memberjunction/actions to v2.13.2
- Bump @memberjunction/ai to v2.13.2
- Bump @memberjunction/ai-mistral to v2.13.2
- Bump @memberjunction/ai-openai to v2.13.2
- Bump @memberjunction/ai-vectors-pinecone to v2.13.2
- Bump @memberjunction/aiengine to v2.13.2
- Bump @memberjunction/core to v2.13.2
- Bump @memberjunction/core-actions to v2.13.2
- Bump @memberjunction/core-entities to v2.13.2
- Bump @memberjunction/data-context to v2.13.2
- Bump @memberjunction/data-context-server to v2.13.2
- Bump @memberjunction/doc-utils to v2.13.2
- Bump @memberjunction/entity-communications-server to v2.13.2
- Bump @memberjunction/external-change-detection to v2.13.2
- Bump @memberjunction/global to v2.13.2
- Bump @memberjunction/queue to v2.13.2
- Bump @memberjunction/skip-types to v2.13.2
- Bump @memberjunction/sqlserver-dataprovider to v2.13.2
- Bump @memberjunction/graphql-dataprovider to v2.13.2
- Bump @memberjunction/storage to v2.13.2
- Bump @memberjunction/templates to v2.13.2

## 2.13.1

Wed, 27 Nov 2024 20:42:53 GMT

### Patches

- Bump @memberjunction/actions to v2.13.1
- Bump @memberjunction/ai to v2.13.1
- Bump @memberjunction/ai-mistral to v2.13.1
- Bump @memberjunction/ai-openai to v2.13.1
- Bump @memberjunction/ai-vectors-pinecone to v2.13.1
- Bump @memberjunction/aiengine to v2.13.1
- Bump @memberjunction/core to v2.13.1
- Bump @memberjunction/core-actions to v2.13.1
- Bump @memberjunction/core-entities to v2.13.1
- Bump @memberjunction/data-context to v2.13.1
- Bump @memberjunction/data-context-server to v2.13.1
- Bump @memberjunction/doc-utils to v2.13.1
- Bump @memberjunction/entity-communications-server to v2.13.1
- Bump @memberjunction/external-change-detection to v2.13.1
- Bump @memberjunction/global to v2.13.1
- Bump @memberjunction/queue to v2.13.1
- Bump @memberjunction/skip-types to v2.13.1
- Bump @memberjunction/sqlserver-dataprovider to v2.13.1
- Bump @memberjunction/graphql-dataprovider to v2.13.1
- Bump @memberjunction/storage to v2.13.1
- Bump @memberjunction/templates to v2.13.1

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Minor changes

- Bump @memberjunction/actions to v2.13.0
- Bump @memberjunction/ai to v2.13.0
- Bump @memberjunction/ai-mistral to v2.13.0
- Bump @memberjunction/ai-openai to v2.13.0
- Bump @memberjunction/ai-vectors-pinecone to v2.13.0
- Bump @memberjunction/aiengine to v2.13.0
- Bump @memberjunction/core to v2.13.0
- Bump @memberjunction/core-actions to v2.13.0
- Bump @memberjunction/core-entities to v2.13.0
- Bump @memberjunction/data-context to v2.13.0
- Bump @memberjunction/data-context-server to v2.13.0
- Bump @memberjunction/doc-utils to v2.13.0
- Bump @memberjunction/entity-communications-server to v2.13.0
- Bump @memberjunction/external-change-detection to v2.13.0
- Bump @memberjunction/global to v2.13.0
- Bump @memberjunction/queue to v2.13.0
- Bump @memberjunction/skip-types to v2.13.0
- Bump @memberjunction/sqlserver-dataprovider to v2.13.0
- Bump @memberjunction/graphql-dataprovider to v2.13.0
- Bump @memberjunction/storage to v2.13.0
- Bump @memberjunction/templates to v2.13.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.12.0

Mon, 04 Nov 2024 23:07:22 GMT

### Minor changes

- Bump @memberjunction/actions to v2.12.0
- Bump @memberjunction/ai to v2.12.0
- Bump @memberjunction/ai-mistral to v2.12.0
- Bump @memberjunction/ai-openai to v2.12.0
- Bump @memberjunction/ai-vectors-pinecone to v2.12.0
- Bump @memberjunction/aiengine to v2.12.0
- Bump @memberjunction/core to v2.12.0
- Bump @memberjunction/core-actions to v2.12.0
- Bump @memberjunction/core-entities to v2.12.0
- Bump @memberjunction/data-context to v2.12.0
- Bump @memberjunction/data-context-server to v2.12.0
- Bump @memberjunction/doc-utils to v2.12.0
- Bump @memberjunction/entity-communications-server to v2.12.0
- Bump @memberjunction/external-change-detection to v2.12.0
- Bump @memberjunction/global to v2.12.0
- Bump @memberjunction/queue to v2.12.0
- Bump @memberjunction/skip-types to v2.12.0
- Bump @memberjunction/sqlserver-dataprovider to v2.12.0
- Bump @memberjunction/graphql-dataprovider to v2.12.0
- Bump @memberjunction/storage to v2.12.0
- Bump @memberjunction/templates to v2.12.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (nico.ortiz@bluecypress.io)

## 2.11.0

Thu, 24 Oct 2024 15:33:07 GMT

### Minor changes

- Bump @memberjunction/actions to v2.11.0
- Bump @memberjunction/ai to v2.11.0
- Bump @memberjunction/ai-mistral to v2.11.0
- Bump @memberjunction/ai-openai to v2.11.0
- Bump @memberjunction/ai-vectors-pinecone to v2.11.0
- Bump @memberjunction/aiengine to v2.11.0
- Bump @memberjunction/core to v2.11.0
- Bump @memberjunction/core-actions to v2.11.0
- Bump @memberjunction/core-entities to v2.11.0
- Bump @memberjunction/data-context to v2.11.0
- Bump @memberjunction/data-context-server to v2.11.0
- Bump @memberjunction/doc-utils to v2.11.0
- Bump @memberjunction/entity-communications-server to v2.11.0
- Bump @memberjunction/external-change-detection to v2.11.0
- Bump @memberjunction/global to v2.11.0
- Bump @memberjunction/queue to v2.11.0
- Bump @memberjunction/skip-types to v2.11.0
- Bump @memberjunction/sqlserver-dataprovider to v2.11.0
- Bump @memberjunction/graphql-dataprovider to v2.11.0
- Bump @memberjunction/storage to v2.11.0
- Bump @memberjunction/templates to v2.11.0

### Patches

- Applying package updates [skip ci] (nico.ortiz@bluecypress.io)

## 2.10.0

Wed, 23 Oct 2024 22:49:59 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.10.0
- Bump @memberjunction/ai to v2.10.0
- Bump @memberjunction/ai-mistral to v2.10.0
- Bump @memberjunction/ai-openai to v2.10.0
- Bump @memberjunction/ai-vectors-pinecone to v2.10.0
- Bump @memberjunction/aiengine to v2.10.0
- Bump @memberjunction/core to v2.10.0
- Bump @memberjunction/core-actions to v2.10.0
- Bump @memberjunction/core-entities to v2.10.0
- Bump @memberjunction/data-context to v2.10.0
- Bump @memberjunction/data-context-server to v2.10.0
- Bump @memberjunction/doc-utils to v2.10.0
- Bump @memberjunction/entity-communications-server to v2.10.0
- Bump @memberjunction/external-change-detection to v2.10.0
- Bump @memberjunction/global to v2.10.0
- Bump @memberjunction/queue to v2.10.0
- Bump @memberjunction/skip-types to v2.10.0
- Bump @memberjunction/sqlserver-dataprovider to v2.10.0
- Bump @memberjunction/graphql-dataprovider to v2.10.0
- Bump @memberjunction/storage to v2.10.0
- Bump @memberjunction/templates to v2.10.0

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Minor changes

- Applying package updates [skip ci] (nico.ortiz@bluecypress.io)
- Bump @memberjunction/actions to v2.9.0
- Bump @memberjunction/ai to v2.9.0
- Bump @memberjunction/ai-mistral to v2.9.0
- Bump @memberjunction/ai-openai to v2.9.0
- Bump @memberjunction/ai-vectors-pinecone to v2.9.0
- Bump @memberjunction/aiengine to v2.9.0
- Bump @memberjunction/core to v2.9.0
- Bump @memberjunction/core-actions to v2.9.0
- Bump @memberjunction/core-entities to v2.9.0
- Bump @memberjunction/data-context to v2.9.0
- Bump @memberjunction/data-context-server to v2.9.0
- Bump @memberjunction/doc-utils to v2.9.0
- Bump @memberjunction/entity-communications-server to v2.9.0
- Bump @memberjunction/external-change-detection to v2.9.0
- Bump @memberjunction/global to v2.9.0
- Bump @memberjunction/queue to v2.9.0
- Bump @memberjunction/skip-types to v2.9.0
- Bump @memberjunction/sqlserver-dataprovider to v2.9.0
- Bump @memberjunction/graphql-dataprovider to v2.9.0
- Bump @memberjunction/storage to v2.9.0
- Bump @memberjunction/templates to v2.9.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.8.0

Tue, 15 Oct 2024 17:01:03 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.8.0
- Bump @memberjunction/ai to v2.8.0
- Bump @memberjunction/ai-mistral to v2.8.0
- Bump @memberjunction/ai-openai to v2.8.0
- Bump @memberjunction/ai-vectors-pinecone to v2.8.0
- Bump @memberjunction/aiengine to v2.8.0
- Bump @memberjunction/core to v2.8.0
- Bump @memberjunction/core-actions to v2.8.0
- Bump @memberjunction/core-entities to v2.8.0
- Bump @memberjunction/data-context to v2.8.0
- Bump @memberjunction/data-context-server to v2.8.0
- Bump @memberjunction/doc-utils to v2.8.0
- Bump @memberjunction/entity-communications-server to v2.8.0
- Bump @memberjunction/external-change-detection to v2.8.0
- Bump @memberjunction/global to v2.8.0
- Bump @memberjunction/queue to v2.8.0
- Bump @memberjunction/skip-types to v2.8.0
- Bump @memberjunction/sqlserver-dataprovider to v2.8.0
- Bump @memberjunction/graphql-dataprovider to v2.8.0
- Bump @memberjunction/storage to v2.8.0
- Bump @memberjunction/templates to v2.8.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.7.1

Tue, 08 Oct 2024 22:16:58 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.7.1
- Bump @memberjunction/ai to v2.7.1
- Bump @memberjunction/ai-mistral to v2.7.1
- Bump @memberjunction/ai-openai to v2.7.1
- Bump @memberjunction/ai-vectors-pinecone to v2.7.1
- Bump @memberjunction/aiengine to v2.7.1
- Bump @memberjunction/core to v2.7.1
- Bump @memberjunction/core-actions to v2.7.1
- Bump @memberjunction/core-entities to v2.7.1
- Bump @memberjunction/data-context to v2.7.1
- Bump @memberjunction/data-context-server to v2.7.1
- Bump @memberjunction/doc-utils to v2.7.1
- Bump @memberjunction/entity-communications-server to v2.7.1
- Bump @memberjunction/external-change-detection to v2.7.1
- Bump @memberjunction/global to v2.7.1
- Bump @memberjunction/queue to v2.7.1
- Bump @memberjunction/skip-types to v2.7.1
- Bump @memberjunction/sqlserver-dataprovider to v2.7.1
- Bump @memberjunction/graphql-dataprovider to v2.7.1
- Bump @memberjunction/storage to v2.7.1
- Bump @memberjunction/templates to v2.7.1

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.7.0
- Bump @memberjunction/ai to v2.7.0
- Bump @memberjunction/ai-mistral to v2.7.0
- Bump @memberjunction/ai-openai to v2.7.0
- Bump @memberjunction/ai-vectors-pinecone to v2.7.0
- Bump @memberjunction/aiengine to v2.7.0
- Bump @memberjunction/core to v2.7.0
- Bump @memberjunction/core-actions to v2.7.0
- Bump @memberjunction/core-entities to v2.7.0
- Bump @memberjunction/data-context to v2.7.0
- Bump @memberjunction/data-context-server to v2.7.0
- Bump @memberjunction/doc-utils to v2.7.0
- Bump @memberjunction/entity-communications-server to v2.7.0
- Bump @memberjunction/external-change-detection to v2.7.0
- Bump @memberjunction/global to v2.7.0
- Bump @memberjunction/queue to v2.7.0
- Bump @memberjunction/skip-types to v2.7.0
- Bump @memberjunction/sqlserver-dataprovider to v2.7.0
- Bump @memberjunction/graphql-dataprovider to v2.7.0
- Bump @memberjunction/storage to v2.7.0
- Bump @memberjunction/templates to v2.7.0

### Patches

- Applying package updates [skip ci] (nico.ortiz@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.6.1

Mon, 30 Sep 2024 15:55:48 GMT

### Patches

- Bump @memberjunction/actions to v2.6.1
- Bump @memberjunction/ai to v2.6.1
- Bump @memberjunction/ai-mistral to v2.6.1
- Bump @memberjunction/ai-openai to v2.6.1
- Bump @memberjunction/ai-vectors-pinecone to v2.6.1
- Bump @memberjunction/aiengine to v2.6.1
- Bump @memberjunction/core to v2.6.1
- Bump @memberjunction/core-actions to v2.6.1
- Bump @memberjunction/core-entities to v2.6.1
- Bump @memberjunction/data-context to v2.6.1
- Bump @memberjunction/data-context-server to v2.6.1
- Bump @memberjunction/doc-utils to v2.6.1
- Bump @memberjunction/entity-communications-server to v2.6.1
- Bump @memberjunction/external-change-detection to v2.6.1
- Bump @memberjunction/global to v2.6.1
- Bump @memberjunction/queue to v2.6.1
- Bump @memberjunction/skip-types to v2.6.1
- Bump @memberjunction/sqlserver-dataprovider to v2.6.1
- Bump @memberjunction/graphql-dataprovider to v2.6.1
- Bump @memberjunction/storage to v2.6.1
- Bump @memberjunction/templates to v2.6.1

## 2.6.0

Sat, 28 Sep 2024 00:19:39 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.6.0
- Bump @memberjunction/ai to v2.6.0
- Bump @memberjunction/ai-mistral to v2.6.0
- Bump @memberjunction/ai-openai to v2.6.0
- Bump @memberjunction/ai-vectors-pinecone to v2.6.0
- Bump @memberjunction/aiengine to v2.6.0
- Bump @memberjunction/core to v2.6.0
- Bump @memberjunction/core-actions to v2.6.0
- Bump @memberjunction/core-entities to v2.6.0
- Bump @memberjunction/data-context to v2.6.0
- Bump @memberjunction/data-context-server to v2.6.0
- Bump @memberjunction/doc-utils to v2.6.0
- Bump @memberjunction/entity-communications-server to v2.6.0
- Bump @memberjunction/external-change-detection to v2.6.0
- Bump @memberjunction/global to v2.6.0
- Bump @memberjunction/queue to v2.6.0
- Bump @memberjunction/skip-types to v2.6.0
- Bump @memberjunction/sqlserver-dataprovider to v2.6.0
- Bump @memberjunction/graphql-dataprovider to v2.6.0
- Bump @memberjunction/storage to v2.6.0
- Bump @memberjunction/templates to v2.6.0

## 2.5.2

Sat, 28 Sep 2024 00:06:02 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.5.2
- Bump @memberjunction/ai to v2.5.2
- Bump @memberjunction/ai-mistral to v2.5.2
- Bump @memberjunction/ai-openai to v2.5.2
- Bump @memberjunction/ai-vectors-pinecone to v2.5.2
- Bump @memberjunction/aiengine to v2.5.2
- Bump @memberjunction/core to v2.5.2
- Bump @memberjunction/core-actions to v2.5.2
- Bump @memberjunction/core-entities to v2.5.2
- Bump @memberjunction/data-context to v2.5.2
- Bump @memberjunction/data-context-server to v2.5.2
- Bump @memberjunction/doc-utils to v2.5.2
- Bump @memberjunction/entity-communications-server to v2.5.2
- Bump @memberjunction/external-change-detection to v2.5.2
- Bump @memberjunction/global to v2.5.2
- Bump @memberjunction/queue to v2.5.2
- Bump @memberjunction/skip-types to v2.5.2
- Bump @memberjunction/sqlserver-dataprovider to v2.5.2
- Bump @memberjunction/graphql-dataprovider to v2.5.2
- Bump @memberjunction/storage to v2.5.2
- Bump @memberjunction/templates to v2.5.2

## 2.5.1

Fri, 20 Sep 2024 17:51:58 GMT

### Patches

- Bump @memberjunction/actions to v2.5.1
- Bump @memberjunction/ai to v2.5.1
- Bump @memberjunction/ai-mistral to v2.5.1
- Bump @memberjunction/ai-openai to v2.5.1
- Bump @memberjunction/ai-vectors-pinecone to v2.5.1
- Bump @memberjunction/aiengine to v2.5.1
- Bump @memberjunction/core to v2.5.1
- Bump @memberjunction/core-actions to v2.5.1
- Bump @memberjunction/core-entities to v2.5.1
- Bump @memberjunction/data-context to v2.5.1
- Bump @memberjunction/data-context-server to v2.5.1
- Bump @memberjunction/doc-utils to v2.5.1
- Bump @memberjunction/entity-communications-server to v2.5.1
- Bump @memberjunction/external-change-detection to v2.5.1
- Bump @memberjunction/global to v2.5.1
- Bump @memberjunction/queue to v2.5.1
- Bump @memberjunction/skip-types to v2.5.1
- Bump @memberjunction/sqlserver-dataprovider to v2.5.1
- Bump @memberjunction/graphql-dataprovider to v2.5.1
- Bump @memberjunction/storage to v2.5.1
- Bump @memberjunction/templates to v2.5.1

## 2.5.0

Fri, 20 Sep 2024 16:17:06 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.5.0
- Bump @memberjunction/ai to v2.5.0
- Bump @memberjunction/ai-mistral to v2.5.0
- Bump @memberjunction/ai-openai to v2.5.0
- Bump @memberjunction/ai-vectors-pinecone to v2.5.0
- Bump @memberjunction/aiengine to v2.5.0
- Bump @memberjunction/core to v2.5.0
- Bump @memberjunction/core-actions to v2.5.0
- Bump @memberjunction/core-entities to v2.5.0
- Bump @memberjunction/data-context to v2.5.0
- Bump @memberjunction/data-context-server to v2.5.0
- Bump @memberjunction/doc-utils to v2.5.0
- Bump @memberjunction/entity-communications-server to v2.5.0
- Bump @memberjunction/external-change-detection to v2.5.0
- Bump @memberjunction/global to v2.5.0
- Bump @memberjunction/queue to v2.5.0
- Bump @memberjunction/skip-types to v2.5.0
- Bump @memberjunction/sqlserver-dataprovider to v2.5.0
- Bump @memberjunction/graphql-dataprovider to v2.5.0
- Bump @memberjunction/storage to v2.5.0
- Bump @memberjunction/templates to v2.5.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.4.1

Sun, 08 Sep 2024 19:33:23 GMT

### Patches

- Bump @memberjunction/actions to v2.4.1
- Bump @memberjunction/ai to v2.4.1
- Bump @memberjunction/ai-mistral to v2.4.1
- Bump @memberjunction/ai-openai to v2.4.1
- Bump @memberjunction/ai-vectors-pinecone to v2.4.1
- Bump @memberjunction/aiengine to v2.4.1
- Bump @memberjunction/core to v2.4.1
- Bump @memberjunction/core-actions to v2.4.1
- Bump @memberjunction/core-entities to v2.4.1
- Bump @memberjunction/data-context to v2.4.1
- Bump @memberjunction/data-context-server to v2.4.1
- Bump @memberjunction/doc-utils to v2.4.1
- Bump @memberjunction/entity-communications-server to v2.4.1
- Bump @memberjunction/external-change-detection to v2.4.1
- Bump @memberjunction/global to v2.4.1
- Bump @memberjunction/queue to v2.4.1
- Bump @memberjunction/skip-types to v2.4.1
- Bump @memberjunction/sqlserver-dataprovider to v2.4.1
- Bump @memberjunction/graphql-dataprovider to v2.4.1
- Bump @memberjunction/storage to v2.4.1
- Bump @memberjunction/templates to v2.4.1

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.4.0
- Bump @memberjunction/ai to v2.4.0
- Bump @memberjunction/ai-mistral to v2.4.0
- Bump @memberjunction/ai-openai to v2.4.0
- Bump @memberjunction/ai-vectors-pinecone to v2.4.0
- Bump @memberjunction/aiengine to v2.4.0
- Bump @memberjunction/core to v2.4.0
- Bump @memberjunction/core-actions to v2.4.0
- Bump @memberjunction/core-entities to v2.4.0
- Bump @memberjunction/data-context to v2.4.0
- Bump @memberjunction/data-context-server to v2.4.0
- Bump @memberjunction/doc-utils to v2.4.0
- Bump @memberjunction/entity-communications-server to v2.4.0
- Bump @memberjunction/external-change-detection to v2.4.0
- Bump @memberjunction/global to v2.4.0
- Bump @memberjunction/queue to v2.4.0
- Bump @memberjunction/skip-types to v2.4.0
- Bump @memberjunction/sqlserver-dataprovider to v2.4.0
- Bump @memberjunction/graphql-dataprovider to v2.4.0
- Bump @memberjunction/storage to v2.4.0
- Bump @memberjunction/templates to v2.4.0

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Bump @memberjunction/actions to v2.3.3
- Bump @memberjunction/ai to v2.3.3
- Bump @memberjunction/ai-mistral to v2.3.3
- Bump @memberjunction/ai-openai to v2.3.3
- Bump @memberjunction/ai-vectors-pinecone to v2.3.3
- Bump @memberjunction/aiengine to v2.3.3
- Bump @memberjunction/core to v2.3.3
- Bump @memberjunction/core-actions to v2.3.3
- Bump @memberjunction/core-entities to v2.3.3
- Bump @memberjunction/data-context to v2.3.3
- Bump @memberjunction/data-context-server to v2.3.3
- Bump @memberjunction/doc-utils to v2.3.3
- Bump @memberjunction/entity-communications-server to v2.3.3
- Bump @memberjunction/external-change-detection to v2.3.3
- Bump @memberjunction/global to v2.3.3
- Bump @memberjunction/queue to v2.3.3
- Bump @memberjunction/skip-types to v2.3.3
- Bump @memberjunction/sqlserver-dataprovider to v2.3.3
- Bump @memberjunction/graphql-dataprovider to v2.3.3
- Bump @memberjunction/storage to v2.3.3
- Bump @memberjunction/templates to v2.3.3

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.3.2
- Bump @memberjunction/ai to v2.3.2
- Bump @memberjunction/ai-mistral to v2.3.2
- Bump @memberjunction/ai-openai to v2.3.2
- Bump @memberjunction/ai-vectors-pinecone to v2.3.2
- Bump @memberjunction/aiengine to v2.3.2
- Bump @memberjunction/core to v2.3.2
- Bump @memberjunction/core-actions to v2.3.2
- Bump @memberjunction/core-entities to v2.3.2
- Bump @memberjunction/data-context to v2.3.2
- Bump @memberjunction/data-context-server to v2.3.2
- Bump @memberjunction/doc-utils to v2.3.2
- Bump @memberjunction/entity-communications-server to v2.3.2
- Bump @memberjunction/external-change-detection to v2.3.2
- Bump @memberjunction/global to v2.3.2
- Bump @memberjunction/queue to v2.3.2
- Bump @memberjunction/skip-types to v2.3.2
- Bump @memberjunction/sqlserver-dataprovider to v2.3.2
- Bump @memberjunction/graphql-dataprovider to v2.3.2
- Bump @memberjunction/storage to v2.3.2
- Bump @memberjunction/templates to v2.3.2

## 2.3.1

Fri, 16 Aug 2024 03:57:15 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.3.1
- Bump @memberjunction/ai to v2.3.1
- Bump @memberjunction/ai-mistral to v2.3.1
- Bump @memberjunction/ai-openai to v2.3.1
- Bump @memberjunction/ai-vectors-pinecone to v2.3.1
- Bump @memberjunction/aiengine to v2.3.1
- Bump @memberjunction/core to v2.3.1
- Bump @memberjunction/core-actions to v2.3.1
- Bump @memberjunction/core-entities to v2.3.1
- Bump @memberjunction/data-context to v2.3.1
- Bump @memberjunction/data-context-server to v2.3.1
- Bump @memberjunction/doc-utils to v2.3.1
- Bump @memberjunction/entity-communications-server to v2.3.1
- Bump @memberjunction/external-change-detection to v2.3.1
- Bump @memberjunction/global to v2.3.1
- Bump @memberjunction/queue to v2.3.1
- Bump @memberjunction/skip-types to v2.3.1
- Bump @memberjunction/sqlserver-dataprovider to v2.3.1
- Bump @memberjunction/graphql-dataprovider to v2.3.1
- Bump @memberjunction/storage to v2.3.1
- Bump @memberjunction/templates to v2.3.1

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Minor changes

- Bump @memberjunction/actions to v2.3.0
- Bump @memberjunction/ai to v2.3.0
- Bump @memberjunction/ai-mistral to v2.3.0
- Bump @memberjunction/ai-openai to v2.3.0
- Bump @memberjunction/ai-vectors-pinecone to v2.3.0
- Bump @memberjunction/aiengine to v2.3.0
- Bump @memberjunction/core to v2.2.2
- Bump @memberjunction/core-actions to v2.3.0
- Bump @memberjunction/core-entities to v2.3.0
- Bump @memberjunction/data-context to v2.3.0
- Bump @memberjunction/data-context-server to v2.3.0
- Bump @memberjunction/doc-utils to v2.3.0
- Bump @memberjunction/entity-communications-server to v2.3.0
- Bump @memberjunction/external-change-detection to v2.3.0
- Bump @memberjunction/global to v2.3.0
- Bump @memberjunction/queue to v2.3.0
- Bump @memberjunction/skip-types to v2.3.0
- Bump @memberjunction/sqlserver-dataprovider to v2.3.0
- Bump @memberjunction/graphql-dataprovider to v2.3.0
- Bump @memberjunction/storage to v2.3.0
- Bump @memberjunction/templates to v2.3.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.2.1

Fri, 09 Aug 2024 01:29:44 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.2.1
- Bump @memberjunction/ai to v2.2.1
- Bump @memberjunction/ai-mistral to v2.2.1
- Bump @memberjunction/ai-openai to v2.2.1
- Bump @memberjunction/ai-vectors-pinecone to v2.2.1
- Bump @memberjunction/aiengine to v2.2.1
- Bump @memberjunction/core to v2.2.1
- Bump @memberjunction/core-actions to v2.2.1
- Bump @memberjunction/core-entities to v2.2.1
- Bump @memberjunction/data-context to v2.2.1
- Bump @memberjunction/data-context-server to v2.2.1
- Bump @memberjunction/doc-utils to v2.2.1
- Bump @memberjunction/entity-communications-server to v2.2.1
- Bump @memberjunction/external-change-detection to v2.2.1
- Bump @memberjunction/global to v2.2.1
- Bump @memberjunction/queue to v2.2.1
- Bump @memberjunction/skip-types to v2.2.1
- Bump @memberjunction/sqlserver-dataprovider to v2.2.1
- Bump @memberjunction/graphql-dataprovider to v2.2.1
- Bump @memberjunction/storage to v2.2.1
- Bump @memberjunction/templates to v2.2.1

## 2.2.0

Thu, 08 Aug 2024 02:53:16 GMT

### Minor changes

- Bump @memberjunction/actions to v2.2.0
- Bump @memberjunction/ai to v2.2.0
- Bump @memberjunction/ai-mistral to v2.2.0
- Bump @memberjunction/ai-openai to v2.2.0
- Bump @memberjunction/ai-vectors-pinecone to v2.2.0
- Bump @memberjunction/aiengine to v2.2.0
- Bump @memberjunction/core to v2.2.0
- Bump @memberjunction/core-actions to v2.2.0
- Bump @memberjunction/core-entities to v2.1.6
- Bump @memberjunction/data-context to v2.2.0
- Bump @memberjunction/data-context-server to v2.2.0
- Bump @memberjunction/doc-utils to v2.2.0
- Bump @memberjunction/entity-communications-server to v2.2.0
- Bump @memberjunction/external-change-detection to v2.2.0
- Bump @memberjunction/global to v2.2.0
- Bump @memberjunction/queue to v2.2.0
- Bump @memberjunction/skip-types to v2.2.0
- Bump @memberjunction/sqlserver-dataprovider to v2.2.0
- Bump @memberjunction/graphql-dataprovider to v2.2.0
- Bump @memberjunction/storage to v2.2.0
- Bump @memberjunction/templates to v2.2.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 2.1.5

Thu, 01 Aug 2024 17:23:11 GMT

### Patches

- Bump @memberjunction/actions to v2.1.5
- Bump @memberjunction/ai to v2.1.5
- Bump @memberjunction/ai-mistral to v2.1.5
- Bump @memberjunction/ai-openai to v2.1.5
- Bump @memberjunction/ai-vectors-pinecone to v2.1.5
- Bump @memberjunction/aiengine to v2.1.5
- Bump @memberjunction/core to v2.1.5
- Bump @memberjunction/core-actions to v2.1.5
- Bump @memberjunction/core-entities to v2.1.5
- Bump @memberjunction/data-context to v2.1.5
- Bump @memberjunction/data-context-server to v2.1.5
- Bump @memberjunction/doc-utils to v2.1.5
- Bump @memberjunction/entity-communications-server to v2.1.5
- Bump @memberjunction/external-change-detection to v2.1.5
- Bump @memberjunction/global to v2.1.5
- Bump @memberjunction/queue to v2.1.5
- Bump @memberjunction/skip-types to v2.1.5
- Bump @memberjunction/sqlserver-dataprovider to v2.1.5
- Bump @memberjunction/graphql-dataprovider to v2.1.5
- Bump @memberjunction/storage to v2.1.5
- Bump @memberjunction/templates to v2.1.5

## 2.1.4

Thu, 01 Aug 2024 14:43:41 GMT

### Patches

- Bump @memberjunction/actions to v2.1.4
- Bump @memberjunction/ai to v2.1.4
- Bump @memberjunction/ai-mistral to v2.1.4
- Bump @memberjunction/ai-openai to v2.1.4
- Bump @memberjunction/ai-vectors-pinecone to v2.1.4
- Bump @memberjunction/aiengine to v2.1.4
- Bump @memberjunction/core to v2.1.4
- Bump @memberjunction/core-actions to v2.1.4
- Bump @memberjunction/core-entities to v2.1.4
- Bump @memberjunction/data-context to v2.1.4
- Bump @memberjunction/data-context-server to v2.1.4
- Bump @memberjunction/doc-utils to v2.1.4
- Bump @memberjunction/entity-communications-server to v2.1.4
- Bump @memberjunction/external-change-detection to v2.1.4
- Bump @memberjunction/global to v2.1.4
- Bump @memberjunction/queue to v2.1.4
- Bump @memberjunction/skip-types to v2.1.4
- Bump @memberjunction/sqlserver-dataprovider to v2.1.4
- Bump @memberjunction/graphql-dataprovider to v2.1.4
- Bump @memberjunction/storage to v2.1.4
- Bump @memberjunction/templates to v2.1.4

## 2.1.3

Wed, 31 Jul 2024 19:36:47 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.1.3
- Bump @memberjunction/ai to v2.1.3
- Bump @memberjunction/ai-mistral to v2.1.3
- Bump @memberjunction/ai-openai to v2.1.3
- Bump @memberjunction/ai-vectors-pinecone to v2.1.3
- Bump @memberjunction/aiengine to v2.1.3
- Bump @memberjunction/core to v2.1.3
- Bump @memberjunction/core-actions to v2.1.3
- Bump @memberjunction/core-entities to v2.1.3
- Bump @memberjunction/data-context to v2.1.3
- Bump @memberjunction/data-context-server to v2.1.3
- Bump @memberjunction/doc-utils to v2.1.3
- Bump @memberjunction/entity-communications-server to v2.1.3
- Bump @memberjunction/external-change-detection to v2.1.3
- Bump @memberjunction/global to v2.1.3
- Bump @memberjunction/queue to v2.1.3
- Bump @memberjunction/skip-types to v2.1.3
- Bump @memberjunction/sqlserver-dataprovider to v2.1.3
- Bump @memberjunction/graphql-dataprovider to v2.1.3
- Bump @memberjunction/storage to v2.1.3
- Bump @memberjunction/templates to v2.1.3

## 2.1.2

Mon, 29 Jul 2024 22:52:11 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.1.2
- Bump @memberjunction/ai to v2.1.2
- Bump @memberjunction/ai-mistral to v2.1.2
- Bump @memberjunction/ai-openai to v2.1.2
- Bump @memberjunction/ai-vectors-pinecone to v2.1.2
- Bump @memberjunction/aiengine to v2.1.2
- Bump @memberjunction/core to v2.1.2
- Bump @memberjunction/core-actions to v2.1.2
- Bump @memberjunction/core-entities to v2.1.2
- Bump @memberjunction/data-context to v2.1.2
- Bump @memberjunction/data-context-server to v2.1.2
- Bump @memberjunction/doc-utils to v2.1.2
- Bump @memberjunction/entity-communications-server to v2.1.2
- Bump @memberjunction/external-change-detection to v2.1.2
- Bump @memberjunction/global to v2.1.2
- Bump @memberjunction/queue to v2.1.2
- Bump @memberjunction/skip-types to v2.1.2
- Bump @memberjunction/sqlserver-dataprovider to v2.1.2
- Bump @memberjunction/storage to v2.1.2
- Bump @memberjunction/templates to v2.1.2

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Bump @memberjunction/actions to v2.1.1
- Bump @memberjunction/ai to v2.1.1
- Bump @memberjunction/ai-mistral to v2.1.1
- Bump @memberjunction/ai-openai to v2.1.1
- Bump @memberjunction/ai-vectors-pinecone to v2.1.1
- Bump @memberjunction/aiengine to v2.1.1
- Bump @memberjunction/core to v2.1.1
- Bump @memberjunction/core-actions to v2.1.1
- Bump @memberjunction/core-entities to v2.1.1
- Bump @memberjunction/data-context to v2.1.1
- Bump @memberjunction/data-context-server to v2.1.1
- Bump @memberjunction/doc-utils to v2.1.1
- Bump @memberjunction/entity-communications-server to v2.1.1
- Bump @memberjunction/external-change-detection to v2.1.1
- Bump @memberjunction/global to v2.1.1
- Bump @memberjunction/queue to v2.1.1
- Bump @memberjunction/skip-types to v2.1.1
- Bump @memberjunction/sqlserver-dataprovider to v2.1.1
- Bump @memberjunction/storage to v2.1.1
- Bump @memberjunction/templates to v2.1.1

## 1.8.1

Fri, 21 Jun 2024 13:15:28 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v1.8.1
- Bump @memberjunction/ai to v1.8.1
- Bump @memberjunction/ai-mistral to v1.8.1
- Bump @memberjunction/ai-openai to v1.8.1
- Bump @memberjunction/ai-vectors-pinecone to v1.8.1
- Bump @memberjunction/aiengine to v1.8.1
- Bump @memberjunction/core to v1.8.1
- Bump @memberjunction/core-actions to v1.8.1
- Bump @memberjunction/core-entities to v1.8.1
- Bump @memberjunction/data-context to v1.8.1
- Bump @memberjunction/data-context-server to v1.8.1
- Bump @memberjunction/doc-utils to v1.8.1
- Bump @memberjunction/global to v1.8.1
- Bump @memberjunction/queue to v1.8.1
- Bump @memberjunction/skip-types to v1.8.1
- Bump @memberjunction/sqlserver-dataprovider to v1.8.1
- Bump @memberjunction/storage to v1.8.1
- Bump @memberjunction/templates to v1.8.1
- Bump @memberjunction/external-change-detection to v1.8.1
- Bump @memberjunction/entity-communications-server to v1.8.1

## 1.8.0

Wed, 19 Jun 2024 16:32:43 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (jonathan.stfelix@bluecypress.io)
- Bump @memberjunction/actions to v1.8.0
- Bump @memberjunction/ai to v1.8.0
- Bump @memberjunction/ai-mistral to v1.8.0
- Bump @memberjunction/ai-openai to v1.8.0
- Bump @memberjunction/ai-vectors-pinecone to v1.8.0
- Bump @memberjunction/aiengine to v1.8.0
- Bump @memberjunction/core to v1.8.0
- Bump @memberjunction/core-actions to v1.8.0
- Bump @memberjunction/core-entities to v1.8.0
- Bump @memberjunction/data-context to v1.8.0
- Bump @memberjunction/data-context-server to v1.8.0
- Bump @memberjunction/doc-utils to v1.8.0
- Bump @memberjunction/global to v1.8.0
- Bump @memberjunction/queue to v1.8.0
- Bump @memberjunction/skip-types to v1.8.0
- Bump @memberjunction/sqlserver-dataprovider to v1.8.0
- Bump @memberjunction/storage to v1.8.0
- Bump @memberjunction/templates to v1.8.0
- Bump @memberjunction/external-change-detection to v1.8.0
- Bump @memberjunction/entity-communications-server to v1.8.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.7.1

Wed, 12 Jun 2024 20:13:28 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v1.7.1
- Bump @memberjunction/ai to v1.7.1
- Bump @memberjunction/ai-mistral to v1.7.1
- Bump @memberjunction/ai-openai to v1.7.1
- Bump @memberjunction/ai-vectors-pinecone to v1.7.1
- Bump @memberjunction/aiengine to v1.7.1
- Bump @memberjunction/core to v1.7.1
- Bump @memberjunction/core-actions to v1.7.1
- Bump @memberjunction/core-entities to v1.7.1
- Bump @memberjunction/data-context to v1.7.1
- Bump @memberjunction/data-context-server to v1.7.1
- Bump @memberjunction/doc-utils to v1.7.1
- Bump @memberjunction/global to v1.7.1
- Bump @memberjunction/queue to v1.7.1
- Bump @memberjunction/skip-types to v1.7.1
- Bump @memberjunction/sqlserver-dataprovider to v1.7.1
- Bump @memberjunction/storage to v1.7.1
- Bump @memberjunction/templates to v1.7.1
- Bump @memberjunction/external-change-detection to v1.7.1
- Bump @memberjunction/entity-communications-server to v1.7.1

## 1.7.0

Wed, 12 Jun 2024 18:53:39 GMT

### Minor changes

- Bump @memberjunction/actions to v1.7.0
- Bump @memberjunction/ai to v1.7.0
- Bump @memberjunction/ai-mistral to v1.7.0
- Bump @memberjunction/ai-openai to v1.7.0
- Bump @memberjunction/ai-vectors-pinecone to v1.7.0
- Bump @memberjunction/aiengine to v1.7.0
- Bump @memberjunction/core to v1.7.0
- Bump @memberjunction/core-actions to v1.7.0
- Bump @memberjunction/core-entities to v1.7.0
- Bump @memberjunction/data-context to v1.7.0
- Bump @memberjunction/data-context-server to v1.7.0
- Bump @memberjunction/doc-utils to v1.7.0
- Bump @memberjunction/global to v1.7.0
- Bump @memberjunction/queue to v1.7.0
- Bump @memberjunction/skip-types to v1.7.0
- Bump @memberjunction/sqlserver-dataprovider to v1.6.2
- Bump @memberjunction/storage to v1.7.0
- Bump @memberjunction/templates to v1.7.0
- Bump @memberjunction/external-change-detection to v1.7.0
- Bump @memberjunction/entity-communications-server to v1.7.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.6.1

Tue, 11 Jun 2024 06:50:06 GMT

### Patches

- Bump @memberjunction/actions to v1.6.1
- Bump @memberjunction/ai to v1.6.1
- Bump @memberjunction/ai-mistral to v1.6.1
- Bump @memberjunction/ai-openai to v1.6.1
- Bump @memberjunction/ai-vectors-pinecone to v1.6.1
- Bump @memberjunction/aiengine to v1.6.1
- Bump @memberjunction/core to v1.6.1
- Bump @memberjunction/core-actions to v1.6.1
- Bump @memberjunction/core-entities to v1.6.1
- Bump @memberjunction/data-context to v1.6.1
- Bump @memberjunction/data-context-server to v1.6.1
- Bump @memberjunction/doc-utils to v1.6.1
- Bump @memberjunction/global to v1.6.1
- Bump @memberjunction/queue to v1.6.1
- Bump @memberjunction/skip-types to v1.6.1
- Bump @memberjunction/sqlserver-dataprovider to v1.6.1
- Bump @memberjunction/storage to v1.6.1
- Bump @memberjunction/templates to v1.6.1
- Bump @memberjunction/entity-communications-server to v1.6.1

## 1.6.0

Tue, 11 Jun 2024 04:59:29 GMT

### Minor changes

- Bump @memberjunction/actions to v1.6.0
- Bump @memberjunction/ai to v1.6.0
- Bump @memberjunction/ai-mistral to v1.6.0
- Bump @memberjunction/ai-openai to v1.6.0
- Bump @memberjunction/ai-vectors-pinecone to v1.6.0
- Bump @memberjunction/aiengine to v1.6.0
- Bump @memberjunction/core to v1.6.0
- Bump @memberjunction/core-actions to v1.6.0
- Bump @memberjunction/core-entities to v1.6.0
- Bump @memberjunction/data-context to v1.6.0
- Bump @memberjunction/data-context-server to v1.6.0
- Bump @memberjunction/doc-utils to v1.6.0
- Bump @memberjunction/global to v1.6.0
- Bump @memberjunction/queue to v1.6.0
- Bump @memberjunction/skip-types to v1.6.0
- Bump @memberjunction/sqlserver-dataprovider to v1.6.0
- Bump @memberjunction/storage to v1.6.0
- Bump @memberjunction/templates to v1.6.0
- Bump @memberjunction/entity-communications-server to v1.6.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.5.3

Tue, 11 Jun 2024 04:01:37 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v1.5.3
- Bump @memberjunction/ai to v1.5.3
- Bump @memberjunction/ai-mistral to v1.5.3
- Bump @memberjunction/ai-openai to v1.5.3
- Bump @memberjunction/ai-vectors-pinecone to v1.5.3
- Bump @memberjunction/aiengine to v1.5.3
- Bump @memberjunction/core to v1.5.3
- Bump @memberjunction/core-actions to v1.5.3
- Bump @memberjunction/core-entities to v1.5.3
- Bump @memberjunction/data-context to v1.5.3
- Bump @memberjunction/data-context-server to v1.5.3
- Bump @memberjunction/doc-utils to v1.5.3
- Bump @memberjunction/global to v1.5.3
- Bump @memberjunction/queue to v1.5.3
- Bump @memberjunction/skip-types to v1.5.3
- Bump @memberjunction/sqlserver-dataprovider to v1.5.3
- Bump @memberjunction/storage to v1.5.3
- Bump @memberjunction/templates to v1.5.3
- Bump @memberjunction/entity-communications-server to v1.5.3

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Bump @memberjunction/actions to v1.5.2
- Bump @memberjunction/core-actions to v1.5.2
- Bump @memberjunction/ai to v1.5.2
- Bump @memberjunction/ai-openai to v1.5.2
- Bump @memberjunction/aiengine to v1.5.2
- Bump @memberjunction/ai-mistral to v1.5.2
- Bump @memberjunction/ai-vectors-pinecone to v1.5.2
- Bump @memberjunction/core to v1.5.2
- Bump @memberjunction/core-entities to v1.5.2
- Bump @memberjunction/communication-core to v1.5.2
- Bump @memberjunction/doc-utils to v1.5.2
- Bump @memberjunction/templates to v1.5.2
- Bump @memberjunction/data-context to v1.5.2
- Bump @memberjunction/data-context-server to v1.5.2
- Bump @memberjunction/global to v1.5.2
- Bump @memberjunction/storage to v1.5.2
- Bump @memberjunction/queue to v1.5.2
- Bump @memberjunction/sqlserver-dataprovider to v1.5.2
- Bump @memberjunction/skip-types to v1.5.2

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Bump @memberjunction/actions to v1.5.1
- Bump @memberjunction/core-actions to v1.5.1
- Bump @memberjunction/ai to v1.5.1
- Bump @memberjunction/ai-openai to v1.5.1
- Bump @memberjunction/aiengine to v1.5.1
- Bump @memberjunction/ai-mistral to v1.5.1
- Bump @memberjunction/ai-vectors-pinecone to v1.5.1
- Bump @memberjunction/core to v1.5.1
- Bump @memberjunction/core-entities to v1.5.1
- Bump @memberjunction/communication-core to v1.5.1
- Bump @memberjunction/doc-utils to v1.5.1
- Bump @memberjunction/templates to v1.5.1
- Bump @memberjunction/data-context to v1.5.1
- Bump @memberjunction/data-context-server to v1.5.1
- Bump @memberjunction/global to v1.5.1
- Bump @memberjunction/storage to v1.5.1
- Bump @memberjunction/queue to v1.5.1
- Bump @memberjunction/sqlserver-dataprovider to v1.5.1
- Bump @memberjunction/skip-types to v1.5.1

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v1.5.0
- Bump @memberjunction/core-actions to v1.5.0
- Bump @memberjunction/ai to v1.5.0
- Bump @memberjunction/ai-openai to v1.5.0
- Bump @memberjunction/aiengine to v1.5.0
- Bump @memberjunction/ai-mistral to v1.5.0
- Bump @memberjunction/ai-vectors-pinecone to v1.5.0
- Bump @memberjunction/core to v1.5.0
- Bump @memberjunction/core-entities to v1.5.0
- Bump @memberjunction/communication-core to v1.5.0
- Bump @memberjunction/doc-utils to v1.5.0
- Bump @memberjunction/templates to v1.5.0
- Bump @memberjunction/data-context to v1.5.0
- Bump @memberjunction/data-context-server to v1.5.0
- Bump @memberjunction/global to v1.5.0
- Bump @memberjunction/storage to v1.5.0
- Bump @memberjunction/queue to v1.5.0
- Bump @memberjunction/sqlserver-dataprovider to v1.5.0
- Bump @memberjunction/skip-types to v1.5.0

## 1.4.1

Fri, 07 Jun 2024 04:36:53 GMT

### Minor changes

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v1.4.1
- Bump @memberjunction/core-actions to v1.4.1
- Bump @memberjunction/ai to v1.4.1
- Bump @memberjunction/ai-openai to v1.4.1
- Bump @memberjunction/aiengine to v1.4.1
- Bump @memberjunction/ai-mistral to v1.4.1
- Bump @memberjunction/ai-vectors-pinecone to v1.4.1
- Bump @memberjunction/core to v1.4.1
- Bump @memberjunction/core-entities to v1.4.1
- Bump @memberjunction/communication-core to v1.4.1
- Bump @memberjunction/doc-utils to v1.4.1
- Bump @memberjunction/templates to v1.4.1
- Bump @memberjunction/data-context to v1.4.1
- Bump @memberjunction/data-context-server to v1.4.1
- Bump @memberjunction/global to v1.4.1
- Bump @memberjunction/storage to v1.4.1
- Bump @memberjunction/queue to v1.4.1
- Bump @memberjunction/sqlserver-dataprovider to v1.4.1
- Bump @memberjunction/skip-types to v1.4.1

## 1.4.0

Sat, 25 May 2024 15:30:17 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.4.0
- Bump @memberjunction/ai-openai to v1.4.0
- Bump @memberjunction/aiengine to v1.4.0
- Bump @memberjunction/ai-mistral to v1.4.0
- Bump @memberjunction/ai-vectors-pinecone to v1.4.0
- Bump @memberjunction/core to v1.4.0
- Bump @memberjunction/core-entities to v1.4.0
- Bump @memberjunction/data-context to v1.4.0
- Bump @memberjunction/data-context-server to v1.4.0
- Bump @memberjunction/global to v1.4.0
- Bump @memberjunction/storage to v1.4.0
- Bump @memberjunction/queue to v1.4.0
- Bump @memberjunction/sqlserver-dataprovider to v1.4.0
- Bump @memberjunction/skip-types to v1.4.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.3.3

Thu, 23 May 2024 18:35:52 GMT

### Patches

- Bump @memberjunction/ai to v1.3.3
- Bump @memberjunction/ai-openai to v1.3.3
- Bump @memberjunction/aiengine to v1.3.3
- Bump @memberjunction/ai-mistral to v1.3.3
- Bump @memberjunction/ai-vectors-pinecone to v1.3.3
- Bump @memberjunction/core to v1.3.3
- Bump @memberjunction/core-entities to v1.3.3
- Bump @memberjunction/data-context to v1.3.3
- Bump @memberjunction/data-context-server to v1.3.3
- Bump @memberjunction/global to v1.3.3
- Bump @memberjunction/storage to v1.3.3
- Bump @memberjunction/queue to v1.3.3
- Bump @memberjunction/sqlserver-dataprovider to v1.3.3
- Bump @memberjunction/skip-types to v1.3.3

## 1.3.2

Thu, 23 May 2024 14:19:50 GMT

### Patches

- Bump @memberjunction/ai to v1.3.2
- Bump @memberjunction/ai-openai to v1.3.2
- Bump @memberjunction/aiengine to v1.3.2
- Bump @memberjunction/ai-mistral to v1.3.2
- Bump @memberjunction/ai-vectors-pinecone to v1.3.2
- Bump @memberjunction/core to v1.3.2
- Bump @memberjunction/core-entities to v1.3.2
- Bump @memberjunction/data-context to v1.3.2
- Bump @memberjunction/data-context-server to v1.3.2
- Bump @memberjunction/global to v1.3.2
- Bump @memberjunction/storage to v1.3.2
- Bump @memberjunction/queue to v1.3.2
- Bump @memberjunction/sqlserver-dataprovider to v1.3.2
- Bump @memberjunction/skip-types to v1.3.2

## 1.3.1

Thu, 23 May 2024 02:29:25 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.3.1
- Bump @memberjunction/ai-openai to v1.3.1
- Bump @memberjunction/aiengine to v1.3.1
- Bump @memberjunction/ai-mistral to v1.3.1
- Bump @memberjunction/ai-vectors-pinecone to v1.3.1
- Bump @memberjunction/core to v1.3.1
- Bump @memberjunction/core-entities to v1.3.1
- Bump @memberjunction/data-context to v1.3.1
- Bump @memberjunction/data-context-server to v1.3.1
- Bump @memberjunction/global to v1.3.1
- Bump @memberjunction/storage to v1.3.1
- Bump @memberjunction/queue to v1.3.1
- Bump @memberjunction/sqlserver-dataprovider to v1.3.1
- Bump @memberjunction/skip-types to v1.3.1

## 1.3.0

Wed, 22 May 2024 02:26:03 GMT

### Minor changes

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Overhaul the way we vectorize records (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.3.0
- Bump @memberjunction/ai-openai to v1.3.0
- Bump @memberjunction/aiengine to v1.3.0
- Bump @memberjunction/ai-mistral to v1.3.0
- Bump @memberjunction/ai-vectors-pinecone to v1.3.0
- Bump @memberjunction/core to v1.3.0
- Bump @memberjunction/core-entities to v1.3.0
- Bump @memberjunction/data-context to v1.3.0
- Bump @memberjunction/data-context-server to v1.3.0
- Bump @memberjunction/global to v1.3.0
- Bump @memberjunction/storage to v1.3.0
- Bump @memberjunction/queue to v1.3.0
- Bump @memberjunction/sqlserver-dataprovider to v1.3.0
- Bump @memberjunction/skip-types to v1.3.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.2.2

Thu, 02 May 2024 19:46:38 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.2.2
- Bump @memberjunction/ai-openai to v1.2.2
- Bump @memberjunction/aiengine to v1.2.2
- Bump @memberjunction/core to v1.2.2
- Bump @memberjunction/core-entities to v1.2.2
- Bump @memberjunction/data-context to v1.2.2
- Bump @memberjunction/data-context-server to v1.2.2
- Bump @memberjunction/global to v1.2.2
- Bump @memberjunction/storage to v1.2.2
- Bump @memberjunction/queue to v1.2.2
- Bump @memberjunction/sqlserver-dataprovider to v1.2.2
- Bump @memberjunction/skip-types to v1.2.2

## 1.2.1

Thu, 02 May 2024 16:46:11 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.2.1
- Bump @memberjunction/ai-openai to v1.2.1
- Bump @memberjunction/aiengine to v1.2.1
- Bump @memberjunction/core to v1.2.1
- Bump @memberjunction/core-entities to v1.2.1
- Bump @memberjunction/data-context to v1.2.1
- Bump @memberjunction/data-context-server to v1.2.1
- Bump @memberjunction/global to v1.2.1
- Bump @memberjunction/storage to v1.2.1
- Bump @memberjunction/queue to v1.2.1
- Bump @memberjunction/sqlserver-dataprovider to v1.2.1
- Bump @memberjunction/skip-types to v1.2.1

## 1.2.0

Mon, 29 Apr 2024 18:51:58 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.2.0
- Bump @memberjunction/ai-openai to v1.2.0
- Bump @memberjunction/aiengine to v1.2.0
- Bump @memberjunction/core to v1.2.0
- Bump @memberjunction/core-entities to v1.2.0
- Bump @memberjunction/data-context to v1.2.0
- Bump @memberjunction/data-context-server to v1.2.0
- Bump @memberjunction/global to v1.2.0
- Bump @memberjunction/storage to v1.2.0
- Bump @memberjunction/queue to v1.2.0
- Bump @memberjunction/sqlserver-dataprovider to v1.2.0
- Bump @memberjunction/skip-types to v1.2.0

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Bump @memberjunction/ai to v1.1.3
- Bump @memberjunction/ai-openai to v1.1.3
- Bump @memberjunction/aiengine to v1.1.3
- Bump @memberjunction/core to v1.1.3
- Bump @memberjunction/core-entities to v1.1.3
- Bump @memberjunction/data-context to v1.1.3
- Bump @memberjunction/data-context-server to v1.1.3
- Bump @memberjunction/global to v1.1.3
- Bump @memberjunction/storage to v1.1.3
- Bump @memberjunction/queue to v1.1.3
- Bump @memberjunction/sqlserver-dataprovider to v1.1.3
- Bump @memberjunction/skip-types to v1.1.3

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Bump @memberjunction/ai to v1.1.2
- Bump @memberjunction/ai-openai to v1.1.2
- Bump @memberjunction/aiengine to v1.1.2
- Bump @memberjunction/core to v1.1.2
- Bump @memberjunction/core-entities to v1.1.2
- Bump @memberjunction/data-context to v1.1.2
- Bump @memberjunction/data-context-server to v1.1.2
- Bump @memberjunction/global to v1.1.2
- Bump @memberjunction/storage to v1.1.2
- Bump @memberjunction/queue to v1.1.2
- Bump @memberjunction/sqlserver-dataprovider to v1.1.2
- Bump @memberjunction/skip-types to v1.1.2

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Bump @memberjunction/ai to v1.1.1
- Bump @memberjunction/ai-openai to v1.1.1
- Bump @memberjunction/aiengine to v1.1.1
- Bump @memberjunction/core to v1.1.1
- Bump @memberjunction/core-entities to v1.1.1
- Bump @memberjunction/data-context to v1.1.1
- Bump @memberjunction/data-context-server to v1.1.1
- Bump @memberjunction/global to v1.1.1
- Bump @memberjunction/storage to v1.1.1
- Bump @memberjunction/queue to v1.1.1
- Bump @memberjunction/sqlserver-dataprovider to v1.1.1
- Bump @memberjunction/skip-types to v1.1.1

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Bump @memberjunction/ai to v1.1.0
- Bump @memberjunction/ai-openai to v1.1.0
- Bump @memberjunction/aiengine to v1.1.0
- Bump @memberjunction/core to v1.1.0
- Bump @memberjunction/core-entities to v1.1.0
- Bump @memberjunction/data-context to v1.1.0
- Bump @memberjunction/data-context-server to v1.1.0
- Bump @memberjunction/global to v1.1.0
- Bump @memberjunction/storage to v1.1.0
- Bump @memberjunction/queue to v1.1.0
- Bump @memberjunction/sqlserver-dataprovider to v1.1.0
- Bump @memberjunction/skip-types to v1.1.0

## 1.0.11

Wed, 24 Apr 2024 20:57:42 GMT

### Patches

- - Created mj-form-field component in the ng-base-forms package which is a higher order way of binding to a given field on an entity and it dynamically selects the needed control. Provides several advantages including the ability to easily upgrade functionality on forms and to conditionally render fields in their entirety only when needed (e.g. not show them at all when read only field and new record). _ Updated CodeGenLib to emit this new style of Angular Code _ Ran Code Gen (97354817+AN-BC@users.noreply.github.com)
- - bug fixes in Skip UI \* added exception handling to ReportResolver (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.0.11
- Bump @memberjunction/ai-openai to v1.0.11
- Bump @memberjunction/aiengine to v1.0.11
- Bump @memberjunction/core to v1.0.11
- Bump @memberjunction/core-entities to v1.0.11
- Bump @memberjunction/data-context to v1.0.11
- Bump @memberjunction/data-context-server to v1.0.11
- Bump @memberjunction/global to v1.0.11
- Bump @memberjunction/storage to v1.0.11
- Bump @memberjunction/queue to v1.0.11
- Bump @memberjunction/sqlserver-dataprovider to v1.0.11
- Bump @memberjunction/skip-types to v1.0.11

## 1.0.9

Sun, 14 Apr 2024 15:50:05 GMT

### Patches

- Bump @memberjunction/ai to v1.0.9
- Bump @memberjunction/ai-openai to v1.0.9
- Bump @memberjunction/aiengine to v1.0.9
- Bump @memberjunction/core to v1.0.9
- Bump @memberjunction/core-entities to v1.0.9
- Bump @memberjunction/data-context to v1.0.9
- Bump @memberjunction/data-context-server to v1.0.9
- Bump @memberjunction/global to v1.0.9
- Bump @memberjunction/storage to v1.0.9
- Bump @memberjunction/queue to v1.0.9
- Bump @memberjunction/sqlserver-dataprovider to v1.0.9
- Bump @memberjunction/skip-types to v1.0.9

## 1.0.8

Sat, 13 Apr 2024 02:32:44 GMT

### Patches

- Update build and publish automation (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.0.8
- Bump @memberjunction/ai-openai to v1.0.8
- Bump @memberjunction/aiengine to v1.0.8
- Bump @memberjunction/core to v1.0.8
- Bump @memberjunction/core-entities to v1.0.8
- Bump @memberjunction/data-context to v1.0.8
- Bump @memberjunction/data-context-server to v1.0.8
- Bump @memberjunction/global to v1.0.8
- Bump @memberjunction/storage to v1.0.8
- Bump @memberjunction/queue to v1.0.8
- Bump @memberjunction/sqlserver-dataprovider to v1.0.8
- Bump @memberjunction/skip-types to v1.0.8
