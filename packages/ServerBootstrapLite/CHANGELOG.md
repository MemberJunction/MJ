# @memberjunction/server-bootstrap-lite

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core-entities-server@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/doc-utils@5.2.0
  - @memberjunction/ai-agent-manager@5.2.0
  - @memberjunction/ai-agents@5.2.0
  - @memberjunction/ai-engine-base@5.2.0
  - @memberjunction/ai-core-plus@5.2.0
  - @memberjunction/ai-reranker@5.2.0
  - @memberjunction/actions-base@5.2.0
  - @memberjunction/core-actions@5.2.0
  - @memberjunction/scheduling-engine-base@5.2.0
  - @memberjunction/scheduling-engine@5.2.0
  - @memberjunction/templates@5.2.0
  - @memberjunction/actions-apollo@5.2.0
  - @memberjunction/actions-bizapps-accounting@5.2.0
  - @memberjunction/actions-bizapps-crm@5.2.0
  - @memberjunction/actions-bizapps-formbuilders@5.2.0
  - @memberjunction/actions-bizapps-lms@5.2.0
  - @memberjunction/actions-bizapps-social@5.2.0
  - @memberjunction/actions@5.2.0
  - @memberjunction/encryption@5.2.0
  - @memberjunction/scheduling-actions@5.2.0
  - @memberjunction/testing-engine@5.2.0
  - @memberjunction/data-context-server@5.2.0
  - @memberjunction/ai-provider-bundle@5.2.0

## 5.1.0

### Patch Changes

- f426d43: Fix CodeGen to apply excludeSchemas filter consistently across all generators (TypeScript, Angular, GraphQL), not just SQL generation. Also adds cleanup for orphaned Angular entity form directories when entities are renamed or deleted.
  - @memberjunction/ai-agent-manager@5.1.0
  - @memberjunction/ai-agents@5.1.0
  - @memberjunction/ai-engine-base@5.1.0
  - @memberjunction/ai-core-plus@5.1.0
  - @memberjunction/ai-reranker@5.1.0
  - @memberjunction/actions-apollo@5.1.0
  - @memberjunction/actions-base@5.1.0
  - @memberjunction/actions-bizapps-accounting@5.1.0
  - @memberjunction/actions-bizapps-crm@5.1.0
  - @memberjunction/actions-bizapps-formbuilders@5.1.0
  - @memberjunction/actions-bizapps-lms@5.1.0
  - @memberjunction/actions-bizapps-social@5.1.0
  - @memberjunction/core-actions@5.1.0
  - @memberjunction/actions@5.1.0
  - @memberjunction/doc-utils@5.1.0
  - @memberjunction/encryption@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/core-entities-server@5.1.0
  - @memberjunction/data-context-server@5.1.0
  - @memberjunction/scheduling-actions@5.1.0
  - @memberjunction/scheduling-engine-base@5.1.0
  - @memberjunction/scheduling-engine@5.1.0
  - @memberjunction/templates@5.1.0
  - @memberjunction/testing-engine@5.1.0
  - @memberjunction/ai-provider-bundle@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- 737b56b: Add SimpleQueryFieldInfo for query field lineage tracking in InteractiveComponents, sync DeleteOptionsInput fields with server schema in GraphQLDataProvider, and flatten tsconfig files in distribution for cleaner package builds
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ai-agent-manager@5.0.0
  - @memberjunction/ai-agents@5.0.0
  - @memberjunction/ai-engine-base@5.0.0
  - @memberjunction/ai-core-plus@5.0.0
  - @memberjunction/ai-provider-bundle@5.0.0
  - @memberjunction/ai-reranker@5.0.0
  - @memberjunction/actions-apollo@5.0.0
  - @memberjunction/actions-base@5.0.0
  - @memberjunction/actions-bizapps-accounting@5.0.0
  - @memberjunction/actions-bizapps-crm@5.0.0
  - @memberjunction/actions-bizapps-formbuilders@5.0.0
  - @memberjunction/actions-bizapps-lms@5.0.0
  - @memberjunction/actions-bizapps-social@5.0.0
  - @memberjunction/core-actions@5.0.0
  - @memberjunction/actions@5.0.0
  - @memberjunction/doc-utils@5.0.0
  - @memberjunction/encryption@5.0.0
  - @memberjunction/core-entities-server@5.0.0
  - @memberjunction/data-context-server@5.0.0
  - @memberjunction/scheduling-actions@5.0.0
  - @memberjunction/scheduling-engine-base@5.0.0
  - @memberjunction/scheduling-engine@5.0.0
  - @memberjunction/templates@5.0.0
  - @memberjunction/testing-engine@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
- Updated dependencies [3bab2cd]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-provider-bundle@4.4.0
  - @memberjunction/ai-agent-manager@4.4.0
  - @memberjunction/ai-agents@4.4.0
  - @memberjunction/ai-engine-base@4.4.0
  - @memberjunction/ai-core-plus@4.4.0
  - @memberjunction/ai-reranker@4.4.0
  - @memberjunction/actions-apollo@4.4.0
  - @memberjunction/actions-base@4.4.0
  - @memberjunction/actions-bizapps-accounting@4.4.0
  - @memberjunction/actions-bizapps-crm@4.4.0
  - @memberjunction/actions-bizapps-formbuilders@4.4.0
  - @memberjunction/actions-bizapps-lms@4.4.0
  - @memberjunction/actions-bizapps-social@4.4.0
  - @memberjunction/core-actions@4.4.0
  - @memberjunction/actions@4.4.0
  - @memberjunction/doc-utils@4.4.0
  - @memberjunction/encryption@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/core-entities-server@4.4.0
  - @memberjunction/data-context-server@4.4.0
  - @memberjunction/scheduling-actions@4.4.0
  - @memberjunction/scheduling-engine-base@4.4.0
  - @memberjunction/scheduling-engine@4.4.0
  - @memberjunction/templates@4.4.0
  - @memberjunction/testing-engine@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ai-agent-manager@4.3.1
- @memberjunction/ai-agents@4.3.1
- @memberjunction/ai-engine-base@4.3.1
- @memberjunction/ai-core-plus@4.3.1
- @memberjunction/ai-provider-bundle@4.3.1
- @memberjunction/ai-reranker@4.3.1
- @memberjunction/actions-apollo@4.3.1
- @memberjunction/actions-base@4.3.1
- @memberjunction/actions-bizapps-accounting@4.3.1
- @memberjunction/actions-bizapps-crm@4.3.1
- @memberjunction/actions-bizapps-formbuilders@4.3.1
- @memberjunction/actions-bizapps-lms@4.3.1
- @memberjunction/actions-bizapps-social@4.3.1
- @memberjunction/core-actions@4.3.1
- @memberjunction/actions@4.3.1
- @memberjunction/doc-utils@4.3.1
- @memberjunction/encryption@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/core-entities-server@4.3.1
- @memberjunction/data-context-server@4.3.1
- @memberjunction/scheduling-actions@4.3.1
- @memberjunction/scheduling-engine-base@4.3.1
- @memberjunction/scheduling-engine@4.3.1
- @memberjunction/templates@4.3.1
- @memberjunction/testing-engine@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [6f4d33f]
- Updated dependencies [564e1af]
  - @memberjunction/ai-agents@4.3.0
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ai-agent-manager@4.3.0
  - @memberjunction/core-actions@4.3.0
  - @memberjunction/scheduling-engine@4.3.0
  - @memberjunction/testing-engine@4.3.0
  - @memberjunction/ai-engine-base@4.3.0
  - @memberjunction/ai-core-plus@4.3.0
  - @memberjunction/ai-reranker@4.3.0
  - @memberjunction/actions-apollo@4.3.0
  - @memberjunction/actions-base@4.3.0
  - @memberjunction/actions-bizapps-accounting@4.3.0
  - @memberjunction/actions-bizapps-crm@4.3.0
  - @memberjunction/actions-bizapps-formbuilders@4.3.0
  - @memberjunction/actions-bizapps-lms@4.3.0
  - @memberjunction/actions-bizapps-social@4.3.0
  - @memberjunction/actions@4.3.0
  - @memberjunction/doc-utils@4.3.0
  - @memberjunction/encryption@4.3.0
  - @memberjunction/core-entities-server@4.3.0
  - @memberjunction/data-context-server@4.3.0
  - @memberjunction/scheduling-actions@4.3.0
  - @memberjunction/scheduling-engine-base@4.3.0
  - @memberjunction/templates@4.3.0
  - @memberjunction/ai-provider-bundle@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ai-agent-manager@4.2.0
- @memberjunction/ai-agents@4.2.0
- @memberjunction/ai-engine-base@4.2.0
- @memberjunction/ai-core-plus@4.2.0
- @memberjunction/ai-provider-bundle@4.2.0
- @memberjunction/ai-reranker@4.2.0
- @memberjunction/actions-apollo@4.2.0
- @memberjunction/actions-base@4.2.0
- @memberjunction/actions-bizapps-accounting@4.2.0
- @memberjunction/actions-bizapps-crm@4.2.0
- @memberjunction/actions-bizapps-formbuilders@4.2.0
- @memberjunction/actions-bizapps-lms@4.2.0
- @memberjunction/actions-bizapps-social@4.2.0
- @memberjunction/core-actions@4.2.0
- @memberjunction/actions@4.2.0
- @memberjunction/doc-utils@4.2.0
- @memberjunction/encryption@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/core-entities-server@4.2.0
- @memberjunction/data-context-server@4.2.0
- @memberjunction/scheduling-actions@4.2.0
- @memberjunction/scheduling-engine-base@4.2.0
- @memberjunction/scheduling-engine@4.2.0
- @memberjunction/templates@4.2.0
- @memberjunction/testing-engine@4.2.0

## 4.1.0

### Patch Changes

- 77839a9: Enable cascade deletes for AI Agent and Prompt entities, add cross-file dependency detection and --delete-db-only flag to MetadataSync for proper deletion ordering, fix CodeGen duplicate variable names for self-referential FKs, add requireConnectivity config to QueryGen, and add Gemini JSON parser support to DBAutoDoc.
- Updated dependencies [77839a9]
- Updated dependencies [9fab8ca]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/actions-bizapps-formbuilders@4.1.0
  - @memberjunction/core-entities-server@4.1.0
  - @memberjunction/core-actions@4.1.0
  - @memberjunction/data-context-server@4.1.0
  - @memberjunction/templates@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/scheduling-engine@4.1.0
  - @memberjunction/ai-agent-manager@4.1.0
  - @memberjunction/ai-agents@4.1.0
  - @memberjunction/ai-engine-base@4.1.0
  - @memberjunction/ai-core-plus@4.1.0
  - @memberjunction/ai-reranker@4.1.0
  - @memberjunction/actions-apollo@4.1.0
  - @memberjunction/actions-base@4.1.0
  - @memberjunction/actions-bizapps-accounting@4.1.0
  - @memberjunction/actions-bizapps-crm@4.1.0
  - @memberjunction/actions-bizapps-lms@4.1.0
  - @memberjunction/actions-bizapps-social@4.1.0
  - @memberjunction/actions@4.1.0
  - @memberjunction/doc-utils@4.1.0
  - @memberjunction/encryption@4.1.0
  - @memberjunction/scheduling-actions@4.1.0
  - @memberjunction/scheduling-engine-base@4.1.0
  - @memberjunction/testing-engine@4.1.0
  - @memberjunction/ai-provider-bundle@4.1.0

## 4.0.0

### Major Changes

- 5f6306c: 4.0

### Patch Changes

- Updated dependencies [2f86270]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [58ec618]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/core-entities-server@4.0.0
  - @memberjunction/ai-agent-manager@4.0.0
  - @memberjunction/ai-agents@4.0.0
  - @memberjunction/ai-engine-base@4.0.0
  - @memberjunction/ai-core-plus@4.0.0
  - @memberjunction/ai-provider-bundle@4.0.0
  - @memberjunction/ai-reranker@4.0.0
  - @memberjunction/actions-apollo@4.0.0
  - @memberjunction/actions-base@4.0.0
  - @memberjunction/actions-bizapps-accounting@4.0.0
  - @memberjunction/actions-bizapps-crm@4.0.0
  - @memberjunction/actions-bizapps-formbuilders@4.0.0
  - @memberjunction/actions-bizapps-lms@4.0.0
  - @memberjunction/actions-bizapps-social@4.0.0
  - @memberjunction/core-actions@4.0.0
  - @memberjunction/actions@4.0.0
  - @memberjunction/doc-utils@4.0.0
  - @memberjunction/encryption@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/data-context-server@4.0.0
  - @memberjunction/scheduling-actions@4.0.0
  - @memberjunction/scheduling-engine-base@4.0.0
  - @memberjunction/scheduling-engine@4.0.0
  - @memberjunction/templates@4.0.0
  - @memberjunction/testing-engine@4.0.0
