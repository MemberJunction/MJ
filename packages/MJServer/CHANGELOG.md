# Change Log - @memberjunction/server

## 4.3.1

### Patch Changes

- @memberjunction/ai-agent-manager-actions@4.3.1
- @memberjunction/ai-agent-manager@4.3.1
- @memberjunction/ai-agents@4.3.1
- @memberjunction/ai@4.3.1
- @memberjunction/ai-core-plus@4.3.1
- @memberjunction/aiengine@4.3.1
- @memberjunction/ai-mcp-client@4.3.1
- @memberjunction/ai-prompts@4.3.1
- @memberjunction/ai-provider-bundle@4.3.1
- @memberjunction/ai-vectors-pinecone@4.3.1
- @memberjunction/api-keys@4.3.1
- @memberjunction/actions-apollo@4.3.1
- @memberjunction/actions-base@4.3.1
- @memberjunction/actions-bizapps-accounting@4.3.1
- @memberjunction/actions-bizapps-crm@4.3.1
- @memberjunction/actions-bizapps-formbuilders@4.3.1
- @memberjunction/actions-bizapps-lms@4.3.1
- @memberjunction/actions-bizapps-social@4.3.1
- @memberjunction/core-actions@4.3.1
- @memberjunction/actions@4.3.1
- @memberjunction/communication-types@4.3.1
- @memberjunction/entity-communications-base@4.3.1
- @memberjunction/entity-communications-server@4.3.1
- @memberjunction/notifications@4.3.1
- @memberjunction/communication-ms-graph@4.3.1
- @memberjunction/communication-sendgrid@4.3.1
- @memberjunction/component-registry-client-sdk@4.3.1
- @memberjunction/config@4.3.1
- @memberjunction/doc-utils@4.3.1
- @memberjunction/encryption@4.3.1
- @memberjunction/external-change-detection@4.3.1
- @memberjunction/graphql-dataprovider@4.3.1
- @memberjunction/interactive-component-types@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/core-entities-server@4.3.1
- @memberjunction/data-context@4.3.1
- @memberjunction/data-context-server@4.3.1
- @memberjunction/global@4.3.1
- @memberjunction/queue@4.3.1
- @memberjunction/storage@4.3.1
- @memberjunction/sqlserver-dataprovider@4.3.1
- @memberjunction/scheduling-actions@4.3.1
- @memberjunction/scheduling-engine-base@4.3.1
- @memberjunction/scheduling-base-types@4.3.1
- @memberjunction/scheduling-engine@4.3.1
- @memberjunction/skip-types@4.3.1
- @memberjunction/templates@4.3.1
- @memberjunction/testing-engine@4.3.1
- @memberjunction/testing-engine-base@4.3.1
- @memberjunction/version-history@4.3.1

## 4.3.0

### Minor Changes

- 564e1af: migration

### Patch Changes

- Updated dependencies [6f4d33f]
- Updated dependencies [564e1af]
  - @memberjunction/ai-agents@4.3.0
  - @memberjunction/graphql-dataprovider@4.3.0
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ai-agent-manager@4.3.0
  - @memberjunction/core-actions@4.3.0
  - @memberjunction/scheduling-engine@4.3.0
  - @memberjunction/testing-engine@4.3.0
  - @memberjunction/ai-agent-manager-actions@4.3.0
  - @memberjunction/ai-core-plus@4.3.0
  - @memberjunction/aiengine@4.3.0
  - @memberjunction/ai-mcp-client@4.3.0
  - @memberjunction/ai-prompts@4.3.0
  - @memberjunction/ai-vectors-pinecone@4.3.0
  - @memberjunction/api-keys@4.3.0
  - @memberjunction/actions-apollo@4.3.0
  - @memberjunction/actions-base@4.3.0
  - @memberjunction/actions-bizapps-accounting@4.3.0
  - @memberjunction/actions-bizapps-crm@4.3.0
  - @memberjunction/actions-bizapps-formbuilders@4.3.0
  - @memberjunction/actions-bizapps-lms@4.3.0
  - @memberjunction/actions-bizapps-social@4.3.0
  - @memberjunction/actions@4.3.0
  - @memberjunction/communication-types@4.3.0
  - @memberjunction/entity-communications-base@4.3.0
  - @memberjunction/entity-communications-server@4.3.0
  - @memberjunction/notifications@4.3.0
  - @memberjunction/communication-ms-graph@4.3.0
  - @memberjunction/communication-sendgrid@4.3.0
  - @memberjunction/component-registry-client-sdk@4.3.0
  - @memberjunction/doc-utils@4.3.0
  - @memberjunction/encryption@4.3.0
  - @memberjunction/external-change-detection@4.3.0
  - @memberjunction/interactive-component-types@4.3.0
  - @memberjunction/core-entities-server@4.3.0
  - @memberjunction/data-context@4.3.0
  - @memberjunction/data-context-server@4.3.0
  - @memberjunction/queue@4.3.0
  - @memberjunction/storage@4.3.0
  - @memberjunction/sqlserver-dataprovider@4.3.0
  - @memberjunction/scheduling-actions@4.3.0
  - @memberjunction/scheduling-engine-base@4.3.0
  - @memberjunction/skip-types@4.3.0
  - @memberjunction/templates@4.3.0
  - @memberjunction/testing-engine-base@4.3.0
  - @memberjunction/version-history@4.3.0
  - @memberjunction/ai-provider-bundle@4.3.0
  - @memberjunction/ai@4.3.0
  - @memberjunction/config@4.3.0
  - @memberjunction/global@4.3.0
  - @memberjunction/scheduling-base-types@4.3.0

## 4.2.0

### Patch Changes

- d2938db: Update auth providers for latest SDK compatibility:
  - MSAL: Fix v5.x error codes (timed_out replaces monitor_window_timeout), add proactive token refresh with refreshTokenExpirationOffsetSeconds, use CacheLookupPolicy.Default
  - Okta: Replace deprecated handleLoginRedirect() with handleRedirect(), add error handling for invalid_grant, access_denied, and user_canceled_request OAuth errors

  Fix GraphQL DeleteOptionsInput schema mismatch:
  - Add missing ReplayOnly and IsParentEntityDelete fields to DeleteOptionsInput GraphQL type
  - These fields were added to EntityDeleteOptions in MJCore but not synced to the GraphQL schema
  - Fixes "Field is not defined by type DeleteOptionsInput" errors when deleting entities
  - @memberjunction/ai-agent-manager-actions@4.2.0
  - @memberjunction/ai-agent-manager@4.2.0
  - @memberjunction/ai-agents@4.2.0
  - @memberjunction/ai@4.2.0
  - @memberjunction/ai-core-plus@4.2.0
  - @memberjunction/aiengine@4.2.0
  - @memberjunction/ai-mcp-client@4.2.0
  - @memberjunction/ai-prompts@4.2.0
  - @memberjunction/ai-provider-bundle@4.2.0
  - @memberjunction/ai-vectors-pinecone@4.2.0
  - @memberjunction/api-keys@4.2.0
  - @memberjunction/actions-apollo@4.2.0
  - @memberjunction/actions-base@4.2.0
  - @memberjunction/actions-bizapps-accounting@4.2.0
  - @memberjunction/actions-bizapps-crm@4.2.0
  - @memberjunction/actions-bizapps-formbuilders@4.2.0
  - @memberjunction/actions-bizapps-lms@4.2.0
  - @memberjunction/actions-bizapps-social@4.2.0
  - @memberjunction/core-actions@4.2.0
  - @memberjunction/actions@4.2.0
  - @memberjunction/communication-types@4.2.0
  - @memberjunction/entity-communications-base@4.2.0
  - @memberjunction/entity-communications-server@4.2.0
  - @memberjunction/notifications@4.2.0
  - @memberjunction/communication-ms-graph@4.2.0
  - @memberjunction/communication-sendgrid@4.2.0
  - @memberjunction/component-registry-client-sdk@4.2.0
  - @memberjunction/config@4.2.0
  - @memberjunction/doc-utils@4.2.0
  - @memberjunction/encryption@4.2.0
  - @memberjunction/external-change-detection@4.2.0
  - @memberjunction/graphql-dataprovider@4.2.0
  - @memberjunction/interactive-component-types@4.2.0
  - @memberjunction/core@4.2.0
  - @memberjunction/core-entities@4.2.0
  - @memberjunction/core-entities-server@4.2.0
  - @memberjunction/data-context@4.2.0
  - @memberjunction/data-context-server@4.2.0
  - @memberjunction/global@4.2.0
  - @memberjunction/queue@4.2.0
  - @memberjunction/storage@4.2.0
  - @memberjunction/sqlserver-dataprovider@4.2.0
  - @memberjunction/scheduling-actions@4.2.0
  - @memberjunction/scheduling-engine-base@4.2.0
  - @memberjunction/scheduling-base-types@4.2.0
  - @memberjunction/scheduling-engine@4.2.0
  - @memberjunction/skip-types@4.2.0
  - @memberjunction/templates@4.2.0
  - @memberjunction/testing-engine@4.2.0
  - @memberjunction/testing-engine-base@4.2.0
  - @memberjunction/version-history@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [f54a9e4]
- Updated dependencies [77839a9]
- Updated dependencies [9fab8ca]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/sqlserver-dataprovider@4.1.0
  - @memberjunction/core@4.1.0
  - @memberjunction/actions-bizapps-formbuilders@4.1.0
  - @memberjunction/core-entities-server@4.1.0
  - @memberjunction/core-actions@4.1.0
  - @memberjunction/data-context-server@4.1.0
  - @memberjunction/templates@4.1.0
  - @memberjunction/storage@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/notifications@4.1.0
  - @memberjunction/communication-ms-graph@4.1.0
  - @memberjunction/external-change-detection@4.1.0
  - @memberjunction/scheduling-engine@4.1.0
  - @memberjunction/ai-agent-manager-actions@4.1.0
  - @memberjunction/ai-agent-manager@4.1.0
  - @memberjunction/ai-agents@4.1.0
  - @memberjunction/ai-core-plus@4.1.0
  - @memberjunction/aiengine@4.1.0
  - @memberjunction/ai-mcp-client@4.1.0
  - @memberjunction/ai-prompts@4.1.0
  - @memberjunction/ai-vectors-pinecone@4.1.0
  - @memberjunction/api-keys@4.1.0
  - @memberjunction/actions-apollo@4.1.0
  - @memberjunction/actions-base@4.1.0
  - @memberjunction/actions-bizapps-accounting@4.1.0
  - @memberjunction/actions-bizapps-crm@4.1.0
  - @memberjunction/actions-bizapps-lms@4.1.0
  - @memberjunction/actions-bizapps-social@4.1.0
  - @memberjunction/actions@4.1.0
  - @memberjunction/communication-types@4.1.0
  - @memberjunction/entity-communications-base@4.1.0
  - @memberjunction/entity-communications-server@4.1.0
  - @memberjunction/communication-sendgrid@4.1.0
  - @memberjunction/component-registry-client-sdk@4.1.0
  - @memberjunction/doc-utils@4.1.0
  - @memberjunction/encryption@4.1.0
  - @memberjunction/graphql-dataprovider@4.1.0
  - @memberjunction/interactive-component-types@4.1.0
  - @memberjunction/data-context@4.1.0
  - @memberjunction/queue@4.1.0
  - @memberjunction/scheduling-actions@4.1.0
  - @memberjunction/scheduling-engine-base@4.1.0
  - @memberjunction/skip-types@4.1.0
  - @memberjunction/testing-engine@4.1.0
  - @memberjunction/testing-engine-base@4.1.0
  - @memberjunction/version-history@4.1.0
  - @memberjunction/ai-provider-bundle@4.1.0
  - @memberjunction/ai@4.1.0
  - @memberjunction/config@4.1.0
  - @memberjunction/global@4.1.0
  - @memberjunction/scheduling-base-types@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 7aa23e7: 4.0
- 5f6306c: 4.0

### Minor Changes

- 65b4274: migration
- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [391393f]
- Updated dependencies [2f86270]
- Updated dependencies [65b4274]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [58ec618]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/communication-ms-graph@4.0.0
  - @memberjunction/aiengine@4.0.0
  - @memberjunction/core-entities-server@4.0.0
  - @memberjunction/graphql-dataprovider@4.0.0
  - @memberjunction/sqlserver-dataprovider@4.0.0
  - @memberjunction/version-history@4.0.0
  - @memberjunction/ai-agent-manager-actions@4.0.0
  - @memberjunction/ai-agent-manager@4.0.0
  - @memberjunction/ai-agents@4.0.0
  - @memberjunction/ai@4.0.0
  - @memberjunction/ai-core-plus@4.0.0
  - @memberjunction/ai-mcp-client@4.0.0
  - @memberjunction/ai-prompts@4.0.0
  - @memberjunction/ai-provider-bundle@4.0.0
  - @memberjunction/ai-vectors-pinecone@4.0.0
  - @memberjunction/api-keys@4.0.0
  - @memberjunction/actions-apollo@4.0.0
  - @memberjunction/actions-bizapps-accounting@4.0.0
  - @memberjunction/actions-bizapps-crm@4.0.0
  - @memberjunction/actions-bizapps-formbuilders@4.0.0
  - @memberjunction/actions-bizapps-lms@4.0.0
  - @memberjunction/actions-bizapps-social@4.0.0
  - @memberjunction/core-actions@4.0.0
  - @memberjunction/actions@4.0.0
  - @memberjunction/entity-communications-server@4.0.0
  - @memberjunction/notifications@4.0.0
  - @memberjunction/communication-sendgrid@4.0.0
  - @memberjunction/component-registry-client-sdk@4.0.0
  - @memberjunction/config@4.0.0
  - @memberjunction/doc-utils@4.0.0
  - @memberjunction/encryption@4.0.0
  - @memberjunction/external-change-detection@4.0.0
  - @memberjunction/interactive-component-types@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/data-context@4.0.0
  - @memberjunction/data-context-server@4.0.0
  - @memberjunction/global@4.0.0
  - @memberjunction/queue@4.0.0
  - @memberjunction/storage@4.0.0
  - @memberjunction/scheduling-actions@4.0.0
  - @memberjunction/scheduling-engine-base@4.0.0
  - @memberjunction/scheduling-base-types@4.0.0
  - @memberjunction/scheduling-engine@4.0.0
  - @memberjunction/skip-types@4.0.0
  - @memberjunction/templates@4.0.0
  - @memberjunction/testing-engine@4.0.0

## 3.4.0

### Minor Changes

- ef7acd8: migration

### Patch Changes

- 3a71e4e: Fix large text field corruptions, cross-platform improvements, more robust environment variable parsing for boolean values
- e552e5f: no migration
- Updated dependencies [d596467]
- Updated dependencies [cf1df5b]
- Updated dependencies [fca3ce4]
- Updated dependencies [ef7acd8]
- Updated dependencies [3a71e4e]
- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/ai-provider-bundle@3.4.0
  - @memberjunction/ai-prompts@3.4.0
  - @memberjunction/ai-mcp-client@3.4.0
  - @memberjunction/core-actions@3.4.0
  - @memberjunction/storage@3.4.0
  - @memberjunction/sqlserver-dataprovider@3.4.0
  - @memberjunction/config@3.4.0
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/communication-ms-graph@3.4.0
  - @memberjunction/core-entities-server@3.4.0
  - @memberjunction/queue@3.4.0
  - @memberjunction/templates@3.4.0
  - @memberjunction/ai-agents@3.4.0
  - @memberjunction/actions@3.4.0
  - @memberjunction/testing-engine@3.4.0
  - @memberjunction/aiengine@3.4.0
  - @memberjunction/notifications@3.4.0
  - @memberjunction/external-change-detection@3.4.0
  - @memberjunction/scheduling-engine@3.4.0
  - @memberjunction/ai-agent-manager-actions@3.4.0
  - @memberjunction/ai-agent-manager@3.4.0
  - @memberjunction/ai-core-plus@3.4.0
  - @memberjunction/api-keys@3.4.0
  - @memberjunction/actions-apollo@3.4.0
  - @memberjunction/actions-bizapps-accounting@3.4.0
  - @memberjunction/actions-bizapps-crm@3.4.0
  - @memberjunction/actions-bizapps-formbuilders@3.4.0
  - @memberjunction/actions-bizapps-lms@3.4.0
  - @memberjunction/actions-bizapps-social@3.4.0
  - @memberjunction/entity-communications-server@3.4.0
  - @memberjunction/communication-sendgrid@3.4.0
  - @memberjunction/doc-utils@3.4.0
  - @memberjunction/encryption@3.4.0
  - @memberjunction/graphql-dataprovider@3.4.0
  - @memberjunction/data-context@3.4.0
  - @memberjunction/scheduling-actions@3.4.0
  - @memberjunction/scheduling-engine-base@3.4.0
  - @memberjunction/ai-vectors-pinecone@3.4.0
  - @memberjunction/component-registry-client-sdk@3.4.0
  - @memberjunction/interactive-component-types@3.4.0
  - @memberjunction/data-context-server@3.4.0
  - @memberjunction/skip-types@3.4.0
  - @memberjunction/ai@3.4.0
  - @memberjunction/global@3.4.0
  - @memberjunction/scheduling-base-types@3.4.0

## 3.3.0

### Minor Changes

- 6ccd9d0: migration from metadata sync so marking this as minor
- 3f17579: migration

### Patch Changes

- ad32a98: no migratin
- Updated dependencies [4bbb600]
- Updated dependencies [ca551dd]
- Updated dependencies [da33601]
- Updated dependencies [d844955]
- Updated dependencies [3f17579]
  - @memberjunction/ai-agents@3.3.0
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/encryption@3.3.0
  - @memberjunction/core-actions@3.3.0
  - @memberjunction/doc-utils@3.3.0
  - @memberjunction/api-keys@3.3.0
  - @memberjunction/ai-agent-manager@3.3.0
  - @memberjunction/scheduling-engine@3.3.0
  - @memberjunction/testing-engine@3.3.0
  - @memberjunction/ai-agent-manager-actions@3.3.0
  - @memberjunction/ai-core-plus@3.3.0
  - @memberjunction/aiengine@3.3.0
  - @memberjunction/ai-prompts@3.3.0
  - @memberjunction/actions-apollo@3.3.0
  - @memberjunction/actions-bizapps-accounting@3.3.0
  - @memberjunction/actions-bizapps-crm@3.3.0
  - @memberjunction/actions-bizapps-formbuilders@3.3.0
  - @memberjunction/actions-bizapps-lms@3.3.0
  - @memberjunction/actions-bizapps-social@3.3.0
  - @memberjunction/actions@3.3.0
  - @memberjunction/entity-communications-server@3.3.0
  - @memberjunction/notifications@3.3.0
  - @memberjunction/communication-ms-graph@3.3.0
  - @memberjunction/communication-sendgrid@3.3.0
  - @memberjunction/external-change-detection@3.3.0
  - @memberjunction/graphql-dataprovider@3.3.0
  - @memberjunction/core-entities-server@3.3.0
  - @memberjunction/data-context@3.3.0
  - @memberjunction/queue@3.3.0
  - @memberjunction/storage@3.3.0
  - @memberjunction/sqlserver-dataprovider@3.3.0
  - @memberjunction/scheduling-actions@3.3.0
  - @memberjunction/scheduling-engine-base@3.3.0
  - @memberjunction/templates@3.3.0
  - @memberjunction/skip-types@3.3.0
  - @memberjunction/ai-vectors-pinecone@3.3.0
  - @memberjunction/ai-provider-bundle@3.3.0
  - @memberjunction/data-context-server@3.3.0
  - @memberjunction/ai@3.3.0
  - @memberjunction/component-registry-client-sdk@3.3.0
  - @memberjunction/config@3.3.0
  - @memberjunction/interactive-component-types@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0
  - @memberjunction/scheduling-base-types@3.3.0

## 3.2.0

### Minor Changes

- 582ca0c: Added unified notification system with email/SMS delivery, user notification preferences, and agent completion notifications

### Patch Changes

- cbd2714: Improve error handling and stability across Skip integration, component artifacts, and metadata sync
- Updated dependencies [039983c]
- Updated dependencies [011c820]
- Updated dependencies [6806a6c]
- Updated dependencies [cbd2714]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/ai-agents@3.2.0
  - @memberjunction/core-actions@3.2.0
  - @memberjunction/graphql-dataprovider@3.2.0
  - @memberjunction/storage@3.2.0
  - @memberjunction/interactive-component-types@3.2.0
  - @memberjunction/skip-types@3.2.0
  - @memberjunction/notifications@3.2.0
  - @memberjunction/ai-agent-manager-actions@3.2.0
  - @memberjunction/ai-agent-manager@3.2.0
  - @memberjunction/ai-core-plus@3.2.0
  - @memberjunction/aiengine@3.2.0
  - @memberjunction/ai-prompts@3.2.0
  - @memberjunction/actions-apollo@3.2.0
  - @memberjunction/actions-bizapps-accounting@3.2.0
  - @memberjunction/actions-bizapps-crm@3.2.0
  - @memberjunction/actions-bizapps-formbuilders@3.2.0
  - @memberjunction/actions-bizapps-lms@3.2.0
  - @memberjunction/actions-bizapps-social@3.2.0
  - @memberjunction/actions@3.2.0
  - @memberjunction/entity-communications-server@3.2.0
  - @memberjunction/communication-ms-graph@3.2.0
  - @memberjunction/communication-sendgrid@3.2.0
  - @memberjunction/doc-utils@3.2.0
  - @memberjunction/encryption@3.2.0
  - @memberjunction/external-change-detection@3.2.0
  - @memberjunction/core-entities-server@3.2.0
  - @memberjunction/data-context@3.2.0
  - @memberjunction/queue@3.2.0
  - @memberjunction/sqlserver-dataprovider@3.2.0
  - @memberjunction/scheduling-actions@3.2.0
  - @memberjunction/scheduling-engine-base@3.2.0
  - @memberjunction/scheduling-engine@3.2.0
  - @memberjunction/templates@3.2.0
  - @memberjunction/testing-engine@3.2.0
  - @memberjunction/ai-provider-bundle@3.2.0
  - @memberjunction/component-registry-client-sdk@3.2.0
  - @memberjunction/ai-vectors-pinecone@3.2.0
  - @memberjunction/data-context-server@3.2.0
  - @memberjunction/ai@3.2.0
  - @memberjunction/config@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0
  - @memberjunction/scheduling-base-types@3.2.0

## 3.1.1

### Patch Changes

- 8c0b624: no migration
- Updated dependencies [8c0b624]
  - @memberjunction/graphql-dataprovider@3.1.1
  - @memberjunction/ai-agent-manager-actions@3.1.1
  - @memberjunction/ai-agent-manager@3.1.1
  - @memberjunction/ai-agents@3.1.1
  - @memberjunction/ai@3.1.1
  - @memberjunction/ai-core-plus@3.1.1
  - @memberjunction/aiengine@3.1.1
  - @memberjunction/ai-prompts@3.1.1
  - @memberjunction/ai-provider-bundle@3.1.1
  - @memberjunction/ai-vectors-pinecone@3.1.1
  - @memberjunction/actions-apollo@3.1.1
  - @memberjunction/actions-bizapps-accounting@3.1.1
  - @memberjunction/actions-bizapps-crm@3.1.1
  - @memberjunction/actions-bizapps-formbuilders@3.1.1
  - @memberjunction/actions-bizapps-lms@3.1.1
  - @memberjunction/actions-bizapps-social@3.1.1
  - @memberjunction/core-actions@3.1.1
  - @memberjunction/actions@3.1.1
  - @memberjunction/entity-communications-server@3.1.1
  - @memberjunction/communication-ms-graph@3.1.1
  - @memberjunction/communication-sendgrid@3.1.1
  - @memberjunction/component-registry-client-sdk@3.1.1
  - @memberjunction/config@3.1.1
  - @memberjunction/doc-utils@3.1.1
  - @memberjunction/encryption@3.1.1
  - @memberjunction/external-change-detection@3.1.1
  - @memberjunction/interactive-component-types@3.1.1
  - @memberjunction/core@3.1.1
  - @memberjunction/core-entities@3.1.1
  - @memberjunction/core-entities-server@3.1.1
  - @memberjunction/data-context@3.1.1
  - @memberjunction/data-context-server@3.1.1
  - @memberjunction/global@3.1.1
  - @memberjunction/queue@3.1.1
  - @memberjunction/storage@3.1.1
  - @memberjunction/sqlserver-dataprovider@3.1.1
  - @memberjunction/scheduling-actions@3.1.1
  - @memberjunction/scheduling-engine-base@3.1.1
  - @memberjunction/scheduling-base-types@3.1.1
  - @memberjunction/scheduling-engine@3.1.1
  - @memberjunction/skip-types@3.1.1
  - @memberjunction/templates@3.1.1
  - @memberjunction/testing-engine@3.1.1

## 3.0.0

### Major Changes

- f25f757: The foundation for MemberJunction v3.0's improved architecture, making it easier for developers to adopt and customize MJ for their needs.

### Patch Changes

- Updated dependencies [f25f757]
  - @memberjunction/config@3.0.0
  - @memberjunction/ai-agent-manager-actions@3.0.0
  - @memberjunction/ai-agent-manager@3.0.0
  - @memberjunction/ai-agents@3.0.0
  - @memberjunction/ai@3.0.0
  - @memberjunction/ai-core-plus@3.0.0
  - @memberjunction/aiengine@3.0.0
  - @memberjunction/ai-prompts@3.0.0
  - @memberjunction/ai-provider-bundle@3.0.0
  - @memberjunction/ai-vectors-pinecone@3.0.0
  - @memberjunction/actions-apollo@3.0.0
  - @memberjunction/actions-bizapps-accounting@3.0.0
  - @memberjunction/actions-bizapps-crm@3.0.0
  - @memberjunction/actions-bizapps-formbuilders@3.0.0
  - @memberjunction/actions-bizapps-lms@3.0.0
  - @memberjunction/actions-bizapps-social@3.0.0
  - @memberjunction/core-actions@3.0.0
  - @memberjunction/actions@3.0.0
  - @memberjunction/entity-communications-server@3.0.0
  - @memberjunction/communication-ms-graph@3.0.0
  - @memberjunction/communication-sendgrid@3.0.0
  - @memberjunction/component-registry-client-sdk@3.0.0
  - @memberjunction/doc-utils@3.0.0
  - @memberjunction/encryption@3.0.0
  - @memberjunction/external-change-detection@3.0.0
  - @memberjunction/graphql-dataprovider@3.0.0
  - @memberjunction/interactive-component-types@3.0.0
  - @memberjunction/core@3.0.0
  - @memberjunction/core-entities@3.0.0
  - @memberjunction/core-entities-server@3.0.0
  - @memberjunction/data-context@3.0.0
  - @memberjunction/data-context-server@3.0.0
  - @memberjunction/global@3.0.0
  - @memberjunction/queue@3.0.0
  - @memberjunction/storage@3.0.0
  - @memberjunction/sqlserver-dataprovider@3.0.0
  - @memberjunction/scheduling-actions@3.0.0
  - @memberjunction/scheduling-engine-base@3.0.0
  - @memberjunction/scheduling-base-types@3.0.0
  - @memberjunction/scheduling-engine@3.0.0
  - @memberjunction/skip-types@3.0.0
  - @memberjunction/templates@3.0.0
  - @memberjunction/testing-engine@3.0.0

## 2.133.0

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/ai-agent-manager-actions@2.133.0
  - @memberjunction/ai-agent-manager@2.133.0
  - @memberjunction/ai-agents@2.133.0
  - @memberjunction/ai-core-plus@2.133.0
  - @memberjunction/aiengine@2.133.0
  - @memberjunction/ai-prompts@2.133.0
  - @memberjunction/ai-vectors-pinecone@2.133.0
  - @memberjunction/actions-apollo@2.133.0
  - @memberjunction/actions-bizapps-accounting@2.133.0
  - @memberjunction/actions-bizapps-crm@2.133.0
  - @memberjunction/actions-bizapps-formbuilders@2.133.0
  - @memberjunction/actions-bizapps-lms@2.133.0
  - @memberjunction/actions-bizapps-social@2.133.0
  - @memberjunction/core-actions@2.133.0
  - @memberjunction/actions@2.133.0
  - @memberjunction/entity-communications-server@2.133.0
  - @memberjunction/communication-ms-graph@2.133.0
  - @memberjunction/communication-sendgrid@2.133.0
  - @memberjunction/component-registry-client-sdk@2.133.0
  - @memberjunction/doc-utils@2.133.0
  - @memberjunction/encryption@2.133.0
  - @memberjunction/external-change-detection@2.133.0
  - @memberjunction/graphql-dataprovider@2.133.0
  - @memberjunction/interactive-component-types@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/core-entities-server@2.133.0
  - @memberjunction/data-context@2.133.0
  - @memberjunction/data-context-server@2.133.0
  - @memberjunction/queue@2.133.0
  - @memberjunction/storage@2.133.0
  - @memberjunction/sqlserver-dataprovider@2.133.0
  - @memberjunction/scheduling-actions@2.133.0
  - @memberjunction/scheduling-engine-base@2.133.0
  - @memberjunction/scheduling-engine@2.133.0
  - @memberjunction/skip-types@2.133.0
  - @memberjunction/templates@2.133.0
  - @memberjunction/testing-engine@2.133.0
  - @memberjunction/ai-provider-bundle@2.133.0
  - @memberjunction/ai@2.133.0
  - @memberjunction/global@2.133.0
  - @memberjunction/scheduling-base-types@2.133.0

## 2.132.0

### Patch Changes

- Updated dependencies [55a2b08]
  - @memberjunction/core@2.132.0
  - @memberjunction/ai-agent-manager-actions@2.132.0
  - @memberjunction/ai-agent-manager@2.132.0
  - @memberjunction/ai-agents@2.132.0
  - @memberjunction/ai-core-plus@2.132.0
  - @memberjunction/aiengine@2.132.0
  - @memberjunction/ai-prompts@2.132.0
  - @memberjunction/ai-vectors-pinecone@2.132.0
  - @memberjunction/actions-apollo@2.132.0
  - @memberjunction/actions-bizapps-accounting@2.132.0
  - @memberjunction/actions-bizapps-crm@2.132.0
  - @memberjunction/actions-bizapps-formbuilders@2.132.0
  - @memberjunction/actions-bizapps-lms@2.132.0
  - @memberjunction/actions-bizapps-social@2.132.0
  - @memberjunction/core-actions@2.132.0
  - @memberjunction/actions@2.132.0
  - @memberjunction/entity-communications-server@2.132.0
  - @memberjunction/communication-ms-graph@2.132.0
  - @memberjunction/communication-sendgrid@2.132.0
  - @memberjunction/component-registry-client-sdk@2.132.0
  - @memberjunction/doc-utils@2.132.0
  - @memberjunction/encryption@2.132.0
  - @memberjunction/external-change-detection@2.132.0
  - @memberjunction/graphql-dataprovider@2.132.0
  - @memberjunction/interactive-component-types@2.132.0
  - @memberjunction/core-entities@2.132.0
  - @memberjunction/core-entities-server@2.132.0
  - @memberjunction/data-context@2.132.0
  - @memberjunction/data-context-server@2.132.0
  - @memberjunction/queue@2.132.0
  - @memberjunction/storage@2.132.0
  - @memberjunction/sqlserver-dataprovider@2.132.0
  - @memberjunction/scheduling-actions@2.132.0
  - @memberjunction/scheduling-engine-base@2.132.0
  - @memberjunction/scheduling-engine@2.132.0
  - @memberjunction/skip-types@2.132.0
  - @memberjunction/templates@2.132.0
  - @memberjunction/testing-engine@2.132.0
  - @memberjunction/ai-provider-bundle@2.132.0
  - @memberjunction/ai@2.132.0
  - @memberjunction/global@2.132.0
  - @memberjunction/scheduling-base-types@2.132.0

## 2.131.0

### Patch Changes

- 3604aa1: Fix Conversations Performance: Replace Timer Polling with PubSub + Fix Race Conditions
- Updated dependencies [280a4c7]
- Updated dependencies [3604aa1]
- Updated dependencies [81598e3]
- Updated dependencies [d3d2926]
  - @memberjunction/core@2.131.0
  - @memberjunction/ai-agents@2.131.0
  - @memberjunction/ai-agent-manager-actions@2.131.0
  - @memberjunction/ai-agent-manager@2.131.0
  - @memberjunction/ai-core-plus@2.131.0
  - @memberjunction/aiengine@2.131.0
  - @memberjunction/ai-prompts@2.131.0
  - @memberjunction/ai-vectors-pinecone@2.131.0
  - @memberjunction/actions-apollo@2.131.0
  - @memberjunction/actions-bizapps-accounting@2.131.0
  - @memberjunction/actions-bizapps-crm@2.131.0
  - @memberjunction/actions-bizapps-formbuilders@2.131.0
  - @memberjunction/actions-bizapps-lms@2.131.0
  - @memberjunction/actions-bizapps-social@2.131.0
  - @memberjunction/core-actions@2.131.0
  - @memberjunction/actions@2.131.0
  - @memberjunction/entity-communications-server@2.131.0
  - @memberjunction/communication-ms-graph@2.131.0
  - @memberjunction/communication-sendgrid@2.131.0
  - @memberjunction/component-registry-client-sdk@2.131.0
  - @memberjunction/doc-utils@2.131.0
  - @memberjunction/encryption@2.131.0
  - @memberjunction/external-change-detection@2.131.0
  - @memberjunction/graphql-dataprovider@2.131.0
  - @memberjunction/interactive-component-types@2.131.0
  - @memberjunction/core-entities@2.131.0
  - @memberjunction/core-entities-server@2.131.0
  - @memberjunction/data-context@2.131.0
  - @memberjunction/data-context-server@2.131.0
  - @memberjunction/queue@2.131.0
  - @memberjunction/storage@2.131.0
  - @memberjunction/sqlserver-dataprovider@2.131.0
  - @memberjunction/scheduling-actions@2.131.0
  - @memberjunction/scheduling-engine-base@2.131.0
  - @memberjunction/scheduling-engine@2.131.0
  - @memberjunction/skip-types@2.131.0
  - @memberjunction/templates@2.131.0
  - @memberjunction/testing-engine@2.131.0
  - @memberjunction/ai-provider-bundle@2.131.0
  - @memberjunction/ai@2.131.0
  - @memberjunction/global@2.131.0
  - @memberjunction/scheduling-base-types@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/ai-agent-manager-actions@2.130.1
- @memberjunction/ai-agent-manager@2.130.1
- @memberjunction/ai-agents@2.130.1
- @memberjunction/ai@2.130.1
- @memberjunction/ai-core-plus@2.130.1
- @memberjunction/aiengine@2.130.1
- @memberjunction/ai-prompts@2.130.1
- @memberjunction/ai-provider-bundle@2.130.1
- @memberjunction/ai-vectors-pinecone@2.130.1
- @memberjunction/actions-apollo@2.130.1
- @memberjunction/actions-bizapps-accounting@2.130.1
- @memberjunction/actions-bizapps-crm@2.130.1
- @memberjunction/actions-bizapps-formbuilders@2.130.1
- @memberjunction/actions-bizapps-lms@2.130.1
- @memberjunction/actions-bizapps-social@2.130.1
- @memberjunction/core-actions@2.130.1
- @memberjunction/actions@2.130.1
- @memberjunction/entity-communications-server@2.130.1
- @memberjunction/communication-ms-graph@2.130.1
- @memberjunction/communication-sendgrid@2.130.1
- @memberjunction/component-registry-client-sdk@2.130.1
- @memberjunction/doc-utils@2.130.1
- @memberjunction/encryption@2.130.1
- @memberjunction/external-change-detection@2.130.1
- @memberjunction/graphql-dataprovider@2.130.1
- @memberjunction/interactive-component-types@2.130.1
- @memberjunction/core@2.130.1
- @memberjunction/core-entities@2.130.1
- @memberjunction/core-entities-server@2.130.1
- @memberjunction/data-context@2.130.1
- @memberjunction/data-context-server@2.130.1
- @memberjunction/global@2.130.1
- @memberjunction/queue@2.130.1
- @memberjunction/storage@2.130.1
- @memberjunction/sqlserver-dataprovider@2.130.1
- @memberjunction/scheduling-actions@2.130.1
- @memberjunction/scheduling-engine-base@2.130.1
- @memberjunction/scheduling-base-types@2.130.1
- @memberjunction/scheduling-engine@2.130.1
- @memberjunction/skip-types@2.130.1
- @memberjunction/templates@2.130.1
- @memberjunction/testing-engine@2.130.1

## 2.130.0

### Minor Changes

- 83ae347: migrations

### Patch Changes

- Updated dependencies [83ae347]
- Updated dependencies [9f2ece4]
- Updated dependencies [02e84a2]
- Updated dependencies [f4e1f05]
  - @memberjunction/ai-agents@2.130.0
  - @memberjunction/ai@2.130.0
  - @memberjunction/ai-core-plus@2.130.0
  - @memberjunction/aiengine@2.130.0
  - @memberjunction/ai-prompts@2.130.0
  - @memberjunction/ai-provider-bundle@2.130.0
  - @memberjunction/graphql-dataprovider@2.130.0
  - @memberjunction/sqlserver-dataprovider@2.130.0
  - @memberjunction/core@2.130.0
  - @memberjunction/ai-agent-manager@2.130.0
  - @memberjunction/core-actions@2.130.0
  - @memberjunction/scheduling-engine@2.130.0
  - @memberjunction/testing-engine@2.130.0
  - @memberjunction/ai-agent-manager-actions@2.130.0
  - @memberjunction/core-entities-server@2.130.0
  - @memberjunction/actions@2.130.0
  - @memberjunction/communication-ms-graph@2.130.0
  - @memberjunction/core-entities@2.130.0
  - @memberjunction/queue@2.130.0
  - @memberjunction/templates@2.130.0
  - @memberjunction/skip-types@2.130.0
  - @memberjunction/ai-vectors-pinecone@2.130.0
  - @memberjunction/external-change-detection@2.130.0
  - @memberjunction/actions-apollo@2.130.0
  - @memberjunction/actions-bizapps-accounting@2.130.0
  - @memberjunction/actions-bizapps-crm@2.130.0
  - @memberjunction/actions-bizapps-formbuilders@2.130.0
  - @memberjunction/actions-bizapps-lms@2.130.0
  - @memberjunction/actions-bizapps-social@2.130.0
  - @memberjunction/entity-communications-server@2.130.0
  - @memberjunction/communication-sendgrid@2.130.0
  - @memberjunction/component-registry-client-sdk@2.130.0
  - @memberjunction/doc-utils@2.130.0
  - @memberjunction/encryption@2.130.0
  - @memberjunction/interactive-component-types@2.130.0
  - @memberjunction/data-context@2.130.0
  - @memberjunction/data-context-server@2.130.0
  - @memberjunction/storage@2.130.0
  - @memberjunction/scheduling-actions@2.130.0
  - @memberjunction/scheduling-engine-base@2.130.0
  - @memberjunction/global@2.130.0
  - @memberjunction/scheduling-base-types@2.130.0

## 2.129.0

### Minor Changes

- fbae243: migration
- c7e38aa: migration

### Patch Changes

- 7a39231: Add Vertex AI provider with Google GenAI SDK integration, resolve database connection timeout, and improve conversation UI
- Updated dependencies [c391d7d]
- Updated dependencies [8c412cf]
- Updated dependencies [fbae243]
- Updated dependencies [573179f]
- Updated dependencies [6ce6e67]
- Updated dependencies [0fb62af]
- Updated dependencies [7d42aa5]
- Updated dependencies [c7e38aa]
- Updated dependencies [7a39231]
  - @memberjunction/core@2.129.0
  - @memberjunction/encryption@2.129.0
  - @memberjunction/global@2.129.0
  - @memberjunction/sqlserver-dataprovider@2.129.0
  - @memberjunction/ai-agents@2.129.0
  - @memberjunction/ai-core-plus@2.129.0
  - @memberjunction/ai-prompts@2.129.0
  - @memberjunction/graphql-dataprovider@2.129.0
  - @memberjunction/aiengine@2.129.0
  - @memberjunction/ai-provider-bundle@2.129.0
  - @memberjunction/ai-vectors-pinecone@2.129.0
  - @memberjunction/core-actions@2.129.0
  - @memberjunction/entity-communications-server@2.129.0
  - @memberjunction/core-entities@2.129.0
  - @memberjunction/core-entities-server@2.129.0
  - @memberjunction/ai-agent-manager-actions@2.129.0
  - @memberjunction/ai-agent-manager@2.129.0
  - @memberjunction/actions-apollo@2.129.0
  - @memberjunction/actions-bizapps-accounting@2.129.0
  - @memberjunction/actions-bizapps-crm@2.129.0
  - @memberjunction/actions-bizapps-formbuilders@2.129.0
  - @memberjunction/actions-bizapps-lms@2.129.0
  - @memberjunction/actions-bizapps-social@2.129.0
  - @memberjunction/actions@2.129.0
  - @memberjunction/communication-ms-graph@2.129.0
  - @memberjunction/communication-sendgrid@2.129.0
  - @memberjunction/component-registry-client-sdk@2.129.0
  - @memberjunction/doc-utils@2.129.0
  - @memberjunction/external-change-detection@2.129.0
  - @memberjunction/interactive-component-types@2.129.0
  - @memberjunction/data-context@2.129.0
  - @memberjunction/data-context-server@2.129.0
  - @memberjunction/queue@2.129.0
  - @memberjunction/storage@2.129.0
  - @memberjunction/scheduling-actions@2.129.0
  - @memberjunction/scheduling-engine-base@2.129.0
  - @memberjunction/scheduling-engine@2.129.0
  - @memberjunction/skip-types@2.129.0
  - @memberjunction/templates@2.129.0
  - @memberjunction/testing-engine@2.129.0
  - @memberjunction/ai@2.129.0
  - @memberjunction/scheduling-base-types@2.129.0

## 2.128.0

### Patch Changes

- f407abe: Add EffortLevel support to AIPromptModel with priority hierarchy and fix GPT 5.2 naming convention to align with standards
- Updated dependencies [f407abe]
- Updated dependencies [5f70858]
  - @memberjunction/core@2.128.0
  - @memberjunction/ai-prompts@2.128.0
  - @memberjunction/core-entities@2.128.0
  - @memberjunction/ai-provider-bundle@2.128.0
  - @memberjunction/ai-agent-manager-actions@2.128.0
  - @memberjunction/ai-agent-manager@2.128.0
  - @memberjunction/ai-agents@2.128.0
  - @memberjunction/ai-core-plus@2.128.0
  - @memberjunction/aiengine@2.128.0
  - @memberjunction/ai-vectors-pinecone@2.128.0
  - @memberjunction/actions-apollo@2.128.0
  - @memberjunction/actions-bizapps-accounting@2.128.0
  - @memberjunction/actions-bizapps-crm@2.128.0
  - @memberjunction/actions-bizapps-formbuilders@2.128.0
  - @memberjunction/actions-bizapps-lms@2.128.0
  - @memberjunction/actions-bizapps-social@2.128.0
  - @memberjunction/core-actions@2.128.0
  - @memberjunction/actions@2.128.0
  - @memberjunction/entity-communications-server@2.128.0
  - @memberjunction/communication-ms-graph@2.128.0
  - @memberjunction/communication-sendgrid@2.128.0
  - @memberjunction/component-registry-client-sdk@2.128.0
  - @memberjunction/doc-utils@2.128.0
  - @memberjunction/external-change-detection@2.128.0
  - @memberjunction/graphql-dataprovider@2.128.0
  - @memberjunction/interactive-component-types@2.128.0
  - @memberjunction/core-entities-server@2.128.0
  - @memberjunction/data-context@2.128.0
  - @memberjunction/data-context-server@2.128.0
  - @memberjunction/queue@2.128.0
  - @memberjunction/storage@2.128.0
  - @memberjunction/sqlserver-dataprovider@2.128.0
  - @memberjunction/scheduling-actions@2.128.0
  - @memberjunction/scheduling-engine-base@2.128.0
  - @memberjunction/scheduling-engine@2.128.0
  - @memberjunction/skip-types@2.128.0
  - @memberjunction/templates@2.128.0
  - @memberjunction/testing-engine@2.128.0
  - @memberjunction/ai@2.128.0
  - @memberjunction/global@2.128.0
  - @memberjunction/scheduling-base-types@2.128.0

## 2.127.0

### Minor Changes

- 65318c4: migration

### Patch Changes

- Updated dependencies [65318c4]
- Updated dependencies [0e56e97]
- Updated dependencies [c7c3378]
- Updated dependencies [b748848]
  - @memberjunction/interactive-component-types@2.127.0
  - @memberjunction/skip-types@2.127.0
  - @memberjunction/ai-agents@2.127.0
  - @memberjunction/ai-core-plus@2.127.0
  - @memberjunction/core@2.127.0
  - @memberjunction/global@2.127.0
  - @memberjunction/component-registry-client-sdk@2.127.0
  - @memberjunction/graphql-dataprovider@2.127.0
  - @memberjunction/core-entities@2.127.0
  - @memberjunction/core-entities-server@2.127.0
  - @memberjunction/ai-agent-manager@2.127.0
  - @memberjunction/core-actions@2.127.0
  - @memberjunction/scheduling-engine@2.127.0
  - @memberjunction/testing-engine@2.127.0
  - @memberjunction/aiengine@2.127.0
  - @memberjunction/ai-prompts@2.127.0
  - @memberjunction/actions@2.127.0
  - @memberjunction/ai-agent-manager-actions@2.127.0
  - @memberjunction/ai-vectors-pinecone@2.127.0
  - @memberjunction/actions-apollo@2.127.0
  - @memberjunction/actions-bizapps-accounting@2.127.0
  - @memberjunction/actions-bizapps-crm@2.127.0
  - @memberjunction/actions-bizapps-formbuilders@2.127.0
  - @memberjunction/actions-bizapps-lms@2.127.0
  - @memberjunction/actions-bizapps-social@2.127.0
  - @memberjunction/entity-communications-server@2.127.0
  - @memberjunction/communication-ms-graph@2.127.0
  - @memberjunction/communication-sendgrid@2.127.0
  - @memberjunction/doc-utils@2.127.0
  - @memberjunction/external-change-detection@2.127.0
  - @memberjunction/data-context@2.127.0
  - @memberjunction/data-context-server@2.127.0
  - @memberjunction/queue@2.127.0
  - @memberjunction/storage@2.127.0
  - @memberjunction/sqlserver-dataprovider@2.127.0
  - @memberjunction/scheduling-actions@2.127.0
  - @memberjunction/scheduling-engine-base@2.127.0
  - @memberjunction/templates@2.127.0
  - @memberjunction/ai@2.127.0
  - @memberjunction/scheduling-base-types@2.127.0
  - @memberjunction/ai-provider-bundle@2.127.0

## 2.126.1

### Patch Changes

- Updated dependencies [d6ae2a0]
  - @memberjunction/graphql-dataprovider@2.126.1
  - @memberjunction/ai-agent-manager-actions@2.126.1
  - @memberjunction/ai-agent-manager@2.126.1
  - @memberjunction/ai-agents@2.126.1
  - @memberjunction/ai@2.126.1
  - @memberjunction/ai-core-plus@2.126.1
  - @memberjunction/aiengine@2.126.1
  - @memberjunction/ai-prompts@2.126.1
  - @memberjunction/ai-provider-bundle@2.126.1
  - @memberjunction/ai-vectors-pinecone@2.126.1
  - @memberjunction/actions-apollo@2.126.1
  - @memberjunction/actions-bizapps-accounting@2.126.1
  - @memberjunction/actions-bizapps-crm@2.126.1
  - @memberjunction/actions-bizapps-formbuilders@2.126.1
  - @memberjunction/actions-bizapps-lms@2.126.1
  - @memberjunction/actions-bizapps-social@2.126.1
  - @memberjunction/core-actions@2.126.1
  - @memberjunction/actions@2.126.1
  - @memberjunction/entity-communications-server@2.126.1
  - @memberjunction/communication-ms-graph@2.126.1
  - @memberjunction/communication-sendgrid@2.126.1
  - @memberjunction/component-registry-client-sdk@2.126.1
  - @memberjunction/doc-utils@2.126.1
  - @memberjunction/external-change-detection@2.126.1
  - @memberjunction/interactive-component-types@2.126.1
  - @memberjunction/core@2.126.1
  - @memberjunction/core-entities@2.126.1
  - @memberjunction/core-entities-server@2.126.1
  - @memberjunction/data-context@2.126.1
  - @memberjunction/data-context-server@2.126.1
  - @memberjunction/global@2.126.1
  - @memberjunction/queue@2.126.1
  - @memberjunction/storage@2.126.1
  - @memberjunction/sqlserver-dataprovider@2.126.1
  - @memberjunction/scheduling-actions@2.126.1
  - @memberjunction/scheduling-engine-base@2.126.1
  - @memberjunction/scheduling-base-types@2.126.1
  - @memberjunction/scheduling-engine@2.126.1
  - @memberjunction/skip-types@2.126.1
  - @memberjunction/templates@2.126.1
  - @memberjunction/testing-engine@2.126.1

## 2.126.0

### Patch Changes

- Updated dependencies [d424fce]
- Updated dependencies [389183e]
- Updated dependencies [4d1d468]
- Updated dependencies [703221e]
  - @memberjunction/ai-agents@2.126.0
  - @memberjunction/skip-types@2.126.0
  - @memberjunction/communication-ms-graph@2.126.0
  - @memberjunction/core@2.126.0
  - @memberjunction/ai-agent-manager@2.126.0
  - @memberjunction/core-actions@2.126.0
  - @memberjunction/scheduling-engine@2.126.0
  - @memberjunction/testing-engine@2.126.0
  - @memberjunction/core-entities-server@2.126.0
  - @memberjunction/entity-communications-server@2.126.0
  - @memberjunction/communication-sendgrid@2.126.0
  - @memberjunction/ai-agent-manager-actions@2.126.0
  - @memberjunction/ai-core-plus@2.126.0
  - @memberjunction/aiengine@2.126.0
  - @memberjunction/ai-prompts@2.126.0
  - @memberjunction/ai-vectors-pinecone@2.126.0
  - @memberjunction/actions-apollo@2.126.0
  - @memberjunction/actions-bizapps-accounting@2.126.0
  - @memberjunction/actions-bizapps-crm@2.126.0
  - @memberjunction/actions-bizapps-formbuilders@2.126.0
  - @memberjunction/actions-bizapps-lms@2.126.0
  - @memberjunction/actions-bizapps-social@2.126.0
  - @memberjunction/actions@2.126.0
  - @memberjunction/component-registry-client-sdk@2.126.0
  - @memberjunction/doc-utils@2.126.0
  - @memberjunction/external-change-detection@2.126.0
  - @memberjunction/graphql-dataprovider@2.126.0
  - @memberjunction/interactive-component-types@2.126.0
  - @memberjunction/core-entities@2.126.0
  - @memberjunction/data-context@2.126.0
  - @memberjunction/data-context-server@2.126.0
  - @memberjunction/queue@2.126.0
  - @memberjunction/storage@2.126.0
  - @memberjunction/sqlserver-dataprovider@2.126.0
  - @memberjunction/scheduling-actions@2.126.0
  - @memberjunction/scheduling-engine-base@2.126.0
  - @memberjunction/templates@2.126.0
  - @memberjunction/ai-provider-bundle@2.126.0
  - @memberjunction/ai@2.126.0
  - @memberjunction/global@2.126.0
  - @memberjunction/scheduling-base-types@2.126.0

## 2.125.0

### Patch Changes

- c0bbbf7: Add logging to skip-sdk when refreshing entities
- e0f53ef: Fix duplicate CloudEvent emissions for entity saves
- Updated dependencies [1115143]
- Updated dependencies [e1569fc]
- Updated dependencies [bd4aa3d]
- Updated dependencies [a692034]
  - @memberjunction/interactive-component-types@2.125.0
  - @memberjunction/communication-ms-graph@2.125.0
  - @memberjunction/communication-sendgrid@2.125.0
  - @memberjunction/core@2.125.0
  - @memberjunction/component-registry-client-sdk@2.125.0
  - @memberjunction/graphql-dataprovider@2.125.0
  - @memberjunction/core-entities@2.125.0
  - @memberjunction/skip-types@2.125.0
  - @memberjunction/core-actions@2.125.0
  - @memberjunction/entity-communications-server@2.125.0
  - @memberjunction/ai-agent-manager-actions@2.125.0
  - @memberjunction/ai-agent-manager@2.125.0
  - @memberjunction/ai-agents@2.125.0
  - @memberjunction/ai-core-plus@2.125.0
  - @memberjunction/aiengine@2.125.0
  - @memberjunction/ai-prompts@2.125.0
  - @memberjunction/ai-vectors-pinecone@2.125.0
  - @memberjunction/actions-apollo@2.125.0
  - @memberjunction/actions-bizapps-accounting@2.125.0
  - @memberjunction/actions-bizapps-crm@2.125.0
  - @memberjunction/actions-bizapps-formbuilders@2.125.0
  - @memberjunction/actions-bizapps-lms@2.125.0
  - @memberjunction/actions-bizapps-social@2.125.0
  - @memberjunction/actions@2.125.0
  - @memberjunction/doc-utils@2.125.0
  - @memberjunction/external-change-detection@2.125.0
  - @memberjunction/core-entities-server@2.125.0
  - @memberjunction/data-context@2.125.0
  - @memberjunction/data-context-server@2.125.0
  - @memberjunction/queue@2.125.0
  - @memberjunction/storage@2.125.0
  - @memberjunction/sqlserver-dataprovider@2.125.0
  - @memberjunction/scheduling-actions@2.125.0
  - @memberjunction/scheduling-engine-base@2.125.0
  - @memberjunction/scheduling-engine@2.125.0
  - @memberjunction/templates@2.125.0
  - @memberjunction/testing-engine@2.125.0
  - @memberjunction/ai-provider-bundle@2.125.0
  - @memberjunction/ai@2.125.0
  - @memberjunction/global@2.125.0
  - @memberjunction/scheduling-base-types@2.125.0

## 2.124.0

### Patch Changes

- 0ff58fa: Fix AskSkipResolver issue with Entities cache
- 9dcbcdc: Add logging to AskSkipResolver
- Updated dependencies [75058a9]
- Updated dependencies [1fe9db4]
- Updated dependencies [4b2181d]
- Updated dependencies [cabe329]
- Updated dependencies [629cf5a]
  - @memberjunction/core@2.124.0
  - @memberjunction/core-entities@2.124.0
  - @memberjunction/communication-ms-graph@2.124.0
  - @memberjunction/ai-agents@2.124.0
  - @memberjunction/ai-core-plus@2.124.0
  - @memberjunction/ai-prompts@2.124.0
  - @memberjunction/ai-agent-manager-actions@2.124.0
  - @memberjunction/ai-agent-manager@2.124.0
  - @memberjunction/aiengine@2.124.0
  - @memberjunction/ai-vectors-pinecone@2.124.0
  - @memberjunction/actions-apollo@2.124.0
  - @memberjunction/actions-bizapps-accounting@2.124.0
  - @memberjunction/actions-bizapps-crm@2.124.0
  - @memberjunction/actions-bizapps-formbuilders@2.124.0
  - @memberjunction/actions-bizapps-lms@2.124.0
  - @memberjunction/actions-bizapps-social@2.124.0
  - @memberjunction/core-actions@2.124.0
  - @memberjunction/actions@2.124.0
  - @memberjunction/entity-communications-server@2.124.0
  - @memberjunction/communication-sendgrid@2.124.0
  - @memberjunction/component-registry-client-sdk@2.124.0
  - @memberjunction/doc-utils@2.124.0
  - @memberjunction/external-change-detection@2.124.0
  - @memberjunction/graphql-dataprovider@2.124.0
  - @memberjunction/interactive-component-types@2.124.0
  - @memberjunction/core-entities-server@2.124.0
  - @memberjunction/data-context@2.124.0
  - @memberjunction/data-context-server@2.124.0
  - @memberjunction/queue@2.124.0
  - @memberjunction/storage@2.124.0
  - @memberjunction/sqlserver-dataprovider@2.124.0
  - @memberjunction/scheduling-actions@2.124.0
  - @memberjunction/scheduling-engine-base@2.124.0
  - @memberjunction/scheduling-engine@2.124.0
  - @memberjunction/skip-types@2.124.0
  - @memberjunction/templates@2.124.0
  - @memberjunction/testing-engine@2.124.0
  - @memberjunction/ai-provider-bundle@2.124.0
  - @memberjunction/ai@2.124.0
  - @memberjunction/global@2.124.0
  - @memberjunction/scheduling-base-types@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/ai-agent-manager-actions@2.123.1
- @memberjunction/ai-agent-manager@2.123.1
- @memberjunction/ai-agents@2.123.1
- @memberjunction/ai@2.123.1
- @memberjunction/ai-core-plus@2.123.1
- @memberjunction/aiengine@2.123.1
- @memberjunction/ai-prompts@2.123.1
- @memberjunction/ai-provider-bundle@2.123.1
- @memberjunction/ai-vectors-pinecone@2.123.1
- @memberjunction/actions-apollo@2.123.1
- @memberjunction/actions-bizapps-accounting@2.123.1
- @memberjunction/actions-bizapps-crm@2.123.1
- @memberjunction/actions-bizapps-formbuilders@2.123.1
- @memberjunction/actions-bizapps-lms@2.123.1
- @memberjunction/actions-bizapps-social@2.123.1
- @memberjunction/core-actions@2.123.1
- @memberjunction/actions@2.123.1
- @memberjunction/entity-communications-server@2.123.1
- @memberjunction/communication-ms-graph@2.123.1
- @memberjunction/communication-sendgrid@2.123.1
- @memberjunction/component-registry-client-sdk@2.123.1
- @memberjunction/doc-utils@2.123.1
- @memberjunction/external-change-detection@2.123.1
- @memberjunction/graphql-dataprovider@2.123.1
- @memberjunction/interactive-component-types@2.123.1
- @memberjunction/core@2.123.1
- @memberjunction/core-entities@2.123.1
- @memberjunction/core-entities-server@2.123.1
- @memberjunction/data-context@2.123.1
- @memberjunction/data-context-server@2.123.1
- @memberjunction/global@2.123.1
- @memberjunction/queue@2.123.1
- @memberjunction/storage@2.123.1
- @memberjunction/sqlserver-dataprovider@2.123.1
- @memberjunction/scheduling-actions@2.123.1
- @memberjunction/scheduling-engine-base@2.123.1
- @memberjunction/scheduling-base-types@2.123.1
- @memberjunction/scheduling-engine@2.123.1
- @memberjunction/skip-types@2.123.1
- @memberjunction/templates@2.123.1
- @memberjunction/testing-engine@2.123.1

## 2.123.0

### Patch Changes

- 52cf482: Fix conversation state reference after service refactor, improve component linter test structure, and fix chart ordering
- Updated dependencies [0944f59]
  - @memberjunction/ai-agents@2.123.0
  - @memberjunction/ai-core-plus@2.123.0
  - @memberjunction/ai-agent-manager@2.123.0
  - @memberjunction/core-actions@2.123.0
  - @memberjunction/scheduling-engine@2.123.0
  - @memberjunction/testing-engine@2.123.0
  - @memberjunction/aiengine@2.123.0
  - @memberjunction/ai-prompts@2.123.0
  - @memberjunction/actions@2.123.0
  - @memberjunction/graphql-dataprovider@2.123.0
  - @memberjunction/core-entities-server@2.123.0
  - @memberjunction/ai-agent-manager-actions@2.123.0
  - @memberjunction/ai-vectors-pinecone@2.123.0
  - @memberjunction/communication-ms-graph@2.123.0
  - @memberjunction/queue@2.123.0
  - @memberjunction/sqlserver-dataprovider@2.123.0
  - @memberjunction/templates@2.123.0
  - @memberjunction/actions-apollo@2.123.0
  - @memberjunction/actions-bizapps-accounting@2.123.0
  - @memberjunction/actions-bizapps-crm@2.123.0
  - @memberjunction/actions-bizapps-formbuilders@2.123.0
  - @memberjunction/actions-bizapps-lms@2.123.0
  - @memberjunction/actions-bizapps-social@2.123.0
  - @memberjunction/scheduling-actions@2.123.0
  - @memberjunction/ai-provider-bundle@2.123.0
  - @memberjunction/external-change-detection@2.123.0
  - @memberjunction/entity-communications-server@2.123.0
  - @memberjunction/ai@2.123.0
  - @memberjunction/communication-sendgrid@2.123.0
  - @memberjunction/component-registry-client-sdk@2.123.0
  - @memberjunction/doc-utils@2.123.0
  - @memberjunction/interactive-component-types@2.123.0
  - @memberjunction/core@2.123.0
  - @memberjunction/core-entities@2.123.0
  - @memberjunction/data-context@2.123.0
  - @memberjunction/data-context-server@2.123.0
  - @memberjunction/global@2.123.0
  - @memberjunction/storage@2.123.0
  - @memberjunction/scheduling-engine-base@2.123.0
  - @memberjunction/scheduling-base-types@2.123.0
  - @memberjunction/skip-types@2.123.0

## 2.122.2

### Patch Changes

- 3d763e9: Fix MJExplorer UI rendering issues including conversation messages not displaying, collections page showing duplicate items on reload, dialog containers for deletions, loading spinner flashes during navigation, and improve JWT token handling for WebSocket connections
- 81f0c44: Add comprehensive dependency management system with automated detection and fixes, optimize migration validation workflow to only trigger on migration file changes
- Updated dependencies [3d763e9]
- Updated dependencies [81f0c44]
  - @memberjunction/graphql-dataprovider@2.122.2
  - @memberjunction/actions-apollo@2.122.2
  - @memberjunction/actions-bizapps-accounting@2.122.2
  - @memberjunction/actions-bizapps-crm@2.122.2
  - @memberjunction/actions-bizapps-formbuilders@2.122.2
  - @memberjunction/ai-agent-manager@2.122.2
  - @memberjunction/ai-agents@2.122.2
  - @memberjunction/ai-prompts@2.122.2
  - @memberjunction/communication-ms-graph@2.122.2
  - @memberjunction/communication-sendgrid@2.122.2
  - @memberjunction/core-actions@2.122.2
  - @memberjunction/core-entities@2.122.2
  - @memberjunction/core-entities-server@2.122.2
  - @memberjunction/entity-communications-server@2.122.2
  - @memberjunction/scheduling-engine@2.122.2
  - @memberjunction/sqlserver-dataprovider@2.122.2
  - @memberjunction/testing-engine@2.122.2
  - @memberjunction/ai-agent-manager-actions@2.122.2
  - @memberjunction/ai-provider-bundle@2.122.2
  - @memberjunction/actions@2.122.2
  - @memberjunction/ai-core-plus@2.122.2
  - @memberjunction/aiengine@2.122.2
  - @memberjunction/actions-bizapps-lms@2.122.2
  - @memberjunction/actions-bizapps-social@2.122.2
  - @memberjunction/doc-utils@2.122.2
  - @memberjunction/external-change-detection@2.122.2
  - @memberjunction/data-context@2.122.2
  - @memberjunction/queue@2.122.2
  - @memberjunction/storage@2.122.2
  - @memberjunction/scheduling-actions@2.122.2
  - @memberjunction/scheduling-engine-base@2.122.2
  - @memberjunction/templates@2.122.2
  - @memberjunction/ai-vectors-pinecone@2.122.2
  - @memberjunction/data-context-server@2.122.2
  - @memberjunction/skip-types@2.122.2
  - @memberjunction/ai@2.122.2
  - @memberjunction/component-registry-client-sdk@2.122.2
  - @memberjunction/interactive-component-types@2.122.2
  - @memberjunction/core@2.122.2
  - @memberjunction/global@2.122.2
  - @memberjunction/scheduling-base-types@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/ai-agent-manager-actions@2.122.1
- @memberjunction/ai-agent-manager@2.122.1
- @memberjunction/ai-agents@2.122.1
- @memberjunction/ai@2.122.1
- @memberjunction/ai-core-plus@2.122.1
- @memberjunction/aiengine@2.122.1
- @memberjunction/ai-prompts@2.122.1
- @memberjunction/ai-provider-bundle@2.122.1
- @memberjunction/ai-vectors-pinecone@2.122.1
- @memberjunction/actions-apollo@2.122.1
- @memberjunction/actions-bizapps-accounting@2.122.1
- @memberjunction/actions-bizapps-crm@2.122.1
- @memberjunction/actions-bizapps-formbuilders@2.122.1
- @memberjunction/actions-bizapps-lms@2.122.1
- @memberjunction/actions-bizapps-social@2.122.1
- @memberjunction/core-actions@2.122.1
- @memberjunction/actions@2.122.1
- @memberjunction/entity-communications-server@2.122.1
- @memberjunction/communication-ms-graph@2.122.1
- @memberjunction/communication-sendgrid@2.122.1
- @memberjunction/component-registry-client-sdk@2.122.1
- @memberjunction/doc-utils@2.122.1
- @memberjunction/external-change-detection@2.122.1
- @memberjunction/graphql-dataprovider@2.122.1
- @memberjunction/core@2.122.1
- @memberjunction/core-entities@2.122.1
- @memberjunction/core-entities-server@2.122.1
- @memberjunction/data-context@2.122.1
- @memberjunction/data-context-server@2.122.1
- @memberjunction/global@2.122.1
- @memberjunction/queue@2.122.1
- @memberjunction/storage@2.122.1
- @memberjunction/sqlserver-dataprovider@2.122.1
- @memberjunction/scheduling-actions@2.122.1
- @memberjunction/scheduling-engine-base@2.122.1
- @memberjunction/scheduling-base-types@2.122.1
- @memberjunction/scheduling-engine@2.122.1
- @memberjunction/skip-types@2.122.1
- @memberjunction/templates@2.122.1
- @memberjunction/testing-engine@2.122.1

## 2.122.0

### Patch Changes

- 6de83ec: Add component linter enhancements with type inference and control flow analysis, DBAutoDoc query generation features, MCP server diagnostic tools, metadata sync improvements, and enhanced JWKS client with HTTP keep-alive connections and connection pooling to prevent socket hangups
- Updated dependencies [6de83ec]
- Updated dependencies [c989c45]
  - @memberjunction/core@2.122.0
  - @memberjunction/graphql-dataprovider@2.122.0
  - @memberjunction/core-entities-server@2.122.0
  - @memberjunction/sqlserver-dataprovider@2.122.0
  - @memberjunction/skip-types@2.122.0
  - @memberjunction/core-entities@2.122.0
  - @memberjunction/ai-agent-manager-actions@2.122.0
  - @memberjunction/ai-agent-manager@2.122.0
  - @memberjunction/ai-agents@2.122.0
  - @memberjunction/ai-core-plus@2.122.0
  - @memberjunction/aiengine@2.122.0
  - @memberjunction/ai-prompts@2.122.0
  - @memberjunction/ai-vectors-pinecone@2.122.0
  - @memberjunction/actions-apollo@2.122.0
  - @memberjunction/actions-bizapps-accounting@2.122.0
  - @memberjunction/actions-bizapps-crm@2.122.0
  - @memberjunction/actions-bizapps-formbuilders@2.122.0
  - @memberjunction/actions-bizapps-lms@2.122.0
  - @memberjunction/actions-bizapps-social@2.122.0
  - @memberjunction/core-actions@2.122.0
  - @memberjunction/actions@2.122.0
  - @memberjunction/entity-communications-server@2.122.0
  - @memberjunction/communication-ms-graph@2.122.0
  - @memberjunction/communication-sendgrid@2.122.0
  - @memberjunction/component-registry-client-sdk@2.122.0
  - @memberjunction/doc-utils@2.122.0
  - @memberjunction/external-change-detection@2.122.0
  - @memberjunction/data-context@2.122.0
  - @memberjunction/data-context-server@2.122.0
  - @memberjunction/queue@2.122.0
  - @memberjunction/storage@2.122.0
  - @memberjunction/scheduling-actions@2.122.0
  - @memberjunction/scheduling-engine-base@2.122.0
  - @memberjunction/scheduling-engine@2.122.0
  - @memberjunction/templates@2.122.0
  - @memberjunction/testing-engine@2.122.0
  - @memberjunction/ai-provider-bundle@2.122.0
  - @memberjunction/ai@2.122.0
  - @memberjunction/global@2.122.0
  - @memberjunction/scheduling-base-types@2.122.0

## 2.121.0

### Patch Changes

- Updated dependencies [a2bef0a]
- Updated dependencies [7d5a046]
  - @memberjunction/core@2.121.0
  - @memberjunction/ai-agents@2.121.0
  - @memberjunction/ai@2.121.0
  - @memberjunction/ai-prompts@2.121.0
  - @memberjunction/testing-engine@2.121.0
  - @memberjunction/ai-agent-manager-actions@2.121.0
  - @memberjunction/ai-agent-manager@2.121.0
  - @memberjunction/ai-core-plus@2.121.0
  - @memberjunction/aiengine@2.121.0
  - @memberjunction/ai-vectors-pinecone@2.121.0
  - @memberjunction/actions-apollo@2.121.0
  - @memberjunction/actions-bizapps-accounting@2.121.0
  - @memberjunction/actions-bizapps-crm@2.121.0
  - @memberjunction/actions-bizapps-formbuilders@2.121.0
  - @memberjunction/actions-bizapps-lms@2.121.0
  - @memberjunction/actions-bizapps-social@2.121.0
  - @memberjunction/core-actions@2.121.0
  - @memberjunction/actions@2.121.0
  - @memberjunction/entity-communications-server@2.121.0
  - @memberjunction/communication-ms-graph@2.121.0
  - @memberjunction/communication-sendgrid@2.121.0
  - @memberjunction/component-registry-client-sdk@2.121.0
  - @memberjunction/doc-utils@2.121.0
  - @memberjunction/external-change-detection@2.121.0
  - @memberjunction/graphql-dataprovider@2.121.0
  - @memberjunction/core-entities@2.121.0
  - @memberjunction/core-entities-server@2.121.0
  - @memberjunction/data-context@2.121.0
  - @memberjunction/data-context-server@2.121.0
  - @memberjunction/queue@2.121.0
  - @memberjunction/storage@2.121.0
  - @memberjunction/sqlserver-dataprovider@2.121.0
  - @memberjunction/scheduling-actions@2.121.0
  - @memberjunction/scheduling-engine-base@2.121.0
  - @memberjunction/scheduling-engine@2.121.0
  - @memberjunction/skip-types@2.121.0
  - @memberjunction/templates@2.121.0
  - @memberjunction/ai-provider-bundle@2.121.0
  - @memberjunction/global@2.121.0
  - @memberjunction/scheduling-base-types@2.121.0

## 2.120.0

### Patch Changes

- Updated dependencies [3074b66]
- Updated dependencies [60a1831]
- Updated dependencies [5dc805c]
  - @memberjunction/core@2.120.0
  - @memberjunction/ai-agents@2.120.0
  - @memberjunction/graphql-dataprovider@2.120.0
  - @memberjunction/ai-agent-manager-actions@2.120.0
  - @memberjunction/ai-agent-manager@2.120.0
  - @memberjunction/ai-core-plus@2.120.0
  - @memberjunction/aiengine@2.120.0
  - @memberjunction/ai-prompts@2.120.0
  - @memberjunction/ai-vectors-pinecone@2.120.0
  - @memberjunction/actions-apollo@2.120.0
  - @memberjunction/actions-bizapps-accounting@2.120.0
  - @memberjunction/actions-bizapps-crm@2.120.0
  - @memberjunction/actions-bizapps-formbuilders@2.120.0
  - @memberjunction/actions-bizapps-lms@2.120.0
  - @memberjunction/actions-bizapps-social@2.120.0
  - @memberjunction/core-actions@2.120.0
  - @memberjunction/actions@2.120.0
  - @memberjunction/entity-communications-server@2.120.0
  - @memberjunction/communication-ms-graph@2.120.0
  - @memberjunction/communication-sendgrid@2.120.0
  - @memberjunction/component-registry-client-sdk@2.120.0
  - @memberjunction/doc-utils@2.120.0
  - @memberjunction/external-change-detection@2.120.0
  - @memberjunction/core-entities@2.120.0
  - @memberjunction/core-entities-server@2.120.0
  - @memberjunction/data-context@2.120.0
  - @memberjunction/data-context-server@2.120.0
  - @memberjunction/queue@2.120.0
  - @memberjunction/storage@2.120.0
  - @memberjunction/sqlserver-dataprovider@2.120.0
  - @memberjunction/scheduling-actions@2.120.0
  - @memberjunction/scheduling-engine-base@2.120.0
  - @memberjunction/scheduling-engine@2.120.0
  - @memberjunction/skip-types@2.120.0
  - @memberjunction/templates@2.120.0
  - @memberjunction/testing-engine@2.120.0
  - @memberjunction/ai@2.120.0
  - @memberjunction/ai-provider-bundle@2.120.0
  - @memberjunction/global@2.120.0
  - @memberjunction/scheduling-base-types@2.120.0

## 2.119.0

### Patch Changes

- ed2394c: Add sample query generation feature with configurable maxTokens and maxTables options, fix config validation errors for commands that don't need database connection, and update DBAutoDoc documentation
- 0a133df: Agent Conversation UI Improvement
- Updated dependencies [7dd7cca]
- Updated dependencies [62790f4]
- Updated dependencies [0a133df]
- Updated dependencies [efc6451]
  - @memberjunction/core@2.119.0
  - @memberjunction/ai-agents@2.119.0
  - @memberjunction/ai-core-plus@2.119.0
  - @memberjunction/ai-prompts@2.119.0
  - @memberjunction/ai-agent-manager-actions@2.119.0
  - @memberjunction/ai-agent-manager@2.119.0
  - @memberjunction/aiengine@2.119.0
  - @memberjunction/ai-vectors-pinecone@2.119.0
  - @memberjunction/actions-apollo@2.119.0
  - @memberjunction/actions-bizapps-accounting@2.119.0
  - @memberjunction/actions-bizapps-crm@2.119.0
  - @memberjunction/actions-bizapps-formbuilders@2.119.0
  - @memberjunction/actions-bizapps-lms@2.119.0
  - @memberjunction/actions-bizapps-social@2.119.0
  - @memberjunction/core-actions@2.119.0
  - @memberjunction/actions@2.119.0
  - @memberjunction/entity-communications-server@2.119.0
  - @memberjunction/communication-ms-graph@2.119.0
  - @memberjunction/communication-sendgrid@2.119.0
  - @memberjunction/component-registry-client-sdk@2.119.0
  - @memberjunction/doc-utils@2.119.0
  - @memberjunction/external-change-detection@2.119.0
  - @memberjunction/graphql-dataprovider@2.119.0
  - @memberjunction/core-entities@2.119.0
  - @memberjunction/core-entities-server@2.119.0
  - @memberjunction/data-context@2.119.0
  - @memberjunction/data-context-server@2.119.0
  - @memberjunction/queue@2.119.0
  - @memberjunction/storage@2.119.0
  - @memberjunction/sqlserver-dataprovider@2.119.0
  - @memberjunction/scheduling-actions@2.119.0
  - @memberjunction/scheduling-engine-base@2.119.0
  - @memberjunction/scheduling-engine@2.119.0
  - @memberjunction/skip-types@2.119.0
  - @memberjunction/templates@2.119.0
  - @memberjunction/testing-engine@2.119.0
  - @memberjunction/ai@2.119.0
  - @memberjunction/ai-provider-bundle@2.119.0
  - @memberjunction/global@2.119.0
  - @memberjunction/scheduling-base-types@2.119.0

## 2.118.0

### Patch Changes

- Updated dependencies [a2901ff]
- Updated dependencies [264c57a]
- Updated dependencies [a49a7a8]
- Updated dependencies [096ece6]
- Updated dependencies [7dcfd9c]
- Updated dependencies [78721d8]
- Updated dependencies [1bb5c29]
  - @memberjunction/ai-agents@2.118.0
  - @memberjunction/core-entities@2.118.0
  - @memberjunction/testing-engine@2.118.0
  - @memberjunction/ai-core-plus@2.118.0
  - @memberjunction/core-entities-server@2.118.0
  - @memberjunction/core@2.118.0
  - @memberjunction/ai-agent-manager@2.118.0
  - @memberjunction/core-actions@2.118.0
  - @memberjunction/scheduling-engine@2.118.0
  - @memberjunction/ai-agent-manager-actions@2.118.0
  - @memberjunction/aiengine@2.118.0
  - @memberjunction/ai-prompts@2.118.0
  - @memberjunction/actions-apollo@2.118.0
  - @memberjunction/actions-bizapps-accounting@2.118.0
  - @memberjunction/actions-bizapps-formbuilders@2.118.0
  - @memberjunction/actions-bizapps-lms@2.118.0
  - @memberjunction/actions-bizapps-social@2.118.0
  - @memberjunction/actions@2.118.0
  - @memberjunction/entity-communications-server@2.118.0
  - @memberjunction/communication-ms-graph@2.118.0
  - @memberjunction/communication-sendgrid@2.118.0
  - @memberjunction/doc-utils@2.118.0
  - @memberjunction/external-change-detection@2.118.0
  - @memberjunction/graphql-dataprovider@2.118.0
  - @memberjunction/data-context@2.118.0
  - @memberjunction/queue@2.118.0
  - @memberjunction/storage@2.118.0
  - @memberjunction/sqlserver-dataprovider@2.118.0
  - @memberjunction/scheduling-actions@2.118.0
  - @memberjunction/scheduling-engine-base@2.118.0
  - @memberjunction/templates@2.118.0
  - @memberjunction/component-registry-client-sdk@2.118.0
  - @memberjunction/skip-types@2.118.0
  - @memberjunction/ai-vectors-pinecone@2.118.0
  - @memberjunction/actions-bizapps-crm@2.118.0
  - @memberjunction/data-context-server@2.118.0
  - @memberjunction/ai@2.118.0
  - @memberjunction/ai-provider-bundle@2.118.0
  - @memberjunction/global@2.118.0
  - @memberjunction/scheduling-base-types@2.118.0

## 2.117.0

### Patch Changes

- Updated dependencies [36db9d9]
- Updated dependencies [8c092ec]
  - @memberjunction/ai-agents@2.117.0
  - @memberjunction/core@2.117.0
  - @memberjunction/ai-agent-manager@2.117.0
  - @memberjunction/core-actions@2.117.0
  - @memberjunction/scheduling-engine@2.117.0
  - @memberjunction/ai-agent-manager-actions@2.117.0
  - @memberjunction/ai-core-plus@2.117.0
  - @memberjunction/aiengine@2.117.0
  - @memberjunction/ai-prompts@2.117.0
  - @memberjunction/ai-vectors-pinecone@2.117.0
  - @memberjunction/actions-apollo@2.117.0
  - @memberjunction/actions-bizapps-accounting@2.117.0
  - @memberjunction/actions-bizapps-crm@2.117.0
  - @memberjunction/actions-bizapps-formbuilders@2.117.0
  - @memberjunction/actions-bizapps-lms@2.117.0
  - @memberjunction/actions-bizapps-social@2.117.0
  - @memberjunction/actions@2.117.0
  - @memberjunction/entity-communications-server@2.117.0
  - @memberjunction/communication-ms-graph@2.117.0
  - @memberjunction/communication-sendgrid@2.117.0
  - @memberjunction/component-registry-client-sdk@2.117.0
  - @memberjunction/doc-utils@2.117.0
  - @memberjunction/external-change-detection@2.117.0
  - @memberjunction/graphql-dataprovider@2.117.0
  - @memberjunction/core-entities@2.117.0
  - @memberjunction/core-entities-server@2.117.0
  - @memberjunction/data-context@2.117.0
  - @memberjunction/data-context-server@2.117.0
  - @memberjunction/queue@2.117.0
  - @memberjunction/storage@2.117.0
  - @memberjunction/sqlserver-dataprovider@2.117.0
  - @memberjunction/scheduling-actions@2.117.0
  - @memberjunction/scheduling-engine-base@2.117.0
  - @memberjunction/skip-types@2.117.0
  - @memberjunction/templates@2.117.0
  - @memberjunction/ai@2.117.0
  - @memberjunction/ai-provider-bundle@2.117.0
  - @memberjunction/global@2.117.0
  - @memberjunction/scheduling-base-types@2.117.0

## 2.116.0

### Minor Changes

- b80fe44: Migration

### Patch Changes

- a860a7d: fix(agents): Pass dataSource context to agent execution.

  feat(codegen): Sync SchemaInfo from database schemas with extended properties. CodeGen now automatically synchronizes SchemaInfo records from database schemas, capturing MS_Description extended properties as schema descriptions. This includes a new Description column on SchemaInfo table, vwSQLSchemas view for querying schemas with extended properties, spUpdateSchemaInfoFromDatabase stored procedure for automatic sync, and integration into the CodeGen workflow to run on every execution.

- Updated dependencies [81bb7a4]
- Updated dependencies [a8d5592]
- Updated dependencies [f294854]
  - @memberjunction/core@2.116.0
  - @memberjunction/global@2.116.0
  - @memberjunction/communication-ms-graph@2.116.0
  - @memberjunction/ai-agent-manager-actions@2.116.0
  - @memberjunction/ai-agent-manager@2.116.0
  - @memberjunction/ai-agents@2.116.0
  - @memberjunction/ai-core-plus@2.116.0
  - @memberjunction/aiengine@2.116.0
  - @memberjunction/ai-prompts@2.116.0
  - @memberjunction/ai-vectors-pinecone@2.116.0
  - @memberjunction/actions-apollo@2.116.0
  - @memberjunction/actions-bizapps-accounting@2.116.0
  - @memberjunction/actions-bizapps-crm@2.116.0
  - @memberjunction/actions-bizapps-formbuilders@2.116.0
  - @memberjunction/actions-bizapps-lms@2.116.0
  - @memberjunction/actions-bizapps-social@2.116.0
  - @memberjunction/core-actions@2.116.0
  - @memberjunction/actions@2.116.0
  - @memberjunction/entity-communications-server@2.116.0
  - @memberjunction/communication-sendgrid@2.116.0
  - @memberjunction/component-registry-client-sdk@2.116.0
  - @memberjunction/doc-utils@2.116.0
  - @memberjunction/external-change-detection@2.116.0
  - @memberjunction/graphql-dataprovider@2.116.0
  - @memberjunction/core-entities@2.116.0
  - @memberjunction/core-entities-server@2.116.0
  - @memberjunction/data-context@2.116.0
  - @memberjunction/data-context-server@2.116.0
  - @memberjunction/queue@2.116.0
  - @memberjunction/storage@2.116.0
  - @memberjunction/sqlserver-dataprovider@2.116.0
  - @memberjunction/scheduling-actions@2.116.0
  - @memberjunction/scheduling-engine-base@2.116.0
  - @memberjunction/scheduling-engine@2.116.0
  - @memberjunction/skip-types@2.116.0
  - @memberjunction/templates@2.116.0
  - @memberjunction/ai@2.116.0
  - @memberjunction/scheduling-base-types@2.116.0
  - @memberjunction/ai-provider-bundle@2.116.0

## 2.115.0

### Patch Changes

- Updated dependencies [6378103]
- Updated dependencies [c29e21b]
- Updated dependencies [2e0fe8b]
  - @memberjunction/ai-agents@2.115.0
  - @memberjunction/core-actions@2.115.0
  - @memberjunction/aiengine@2.115.0
  - @memberjunction/ai-agent-manager@2.115.0
  - @memberjunction/scheduling-engine@2.115.0
  - @memberjunction/ai-prompts@2.115.0
  - @memberjunction/ai-vectors-pinecone@2.115.0
  - @memberjunction/actions@2.115.0
  - @memberjunction/communication-ms-graph@2.115.0
  - @memberjunction/core-entities-server@2.115.0
  - @memberjunction/queue@2.115.0
  - @memberjunction/sqlserver-dataprovider@2.115.0
  - @memberjunction/templates@2.115.0
  - @memberjunction/ai-agent-manager-actions@2.115.0
  - @memberjunction/actions-apollo@2.115.0
  - @memberjunction/actions-bizapps-accounting@2.115.0
  - @memberjunction/actions-bizapps-crm@2.115.0
  - @memberjunction/actions-bizapps-formbuilders@2.115.0
  - @memberjunction/actions-bizapps-lms@2.115.0
  - @memberjunction/actions-bizapps-social@2.115.0
  - @memberjunction/scheduling-actions@2.115.0
  - @memberjunction/external-change-detection@2.115.0
  - @memberjunction/entity-communications-server@2.115.0
  - @memberjunction/ai@2.115.0
  - @memberjunction/ai-core-plus@2.115.0
  - @memberjunction/ai-provider-bundle@2.115.0
  - @memberjunction/communication-sendgrid@2.115.0
  - @memberjunction/component-registry-client-sdk@2.115.0
  - @memberjunction/doc-utils@2.115.0
  - @memberjunction/graphql-dataprovider@2.115.0
  - @memberjunction/core@2.115.0
  - @memberjunction/core-entities@2.115.0
  - @memberjunction/data-context@2.115.0
  - @memberjunction/data-context-server@2.115.0
  - @memberjunction/global@2.115.0
  - @memberjunction/storage@2.115.0
  - @memberjunction/scheduling-engine-base@2.115.0
  - @memberjunction/scheduling-base-types@2.115.0
  - @memberjunction/skip-types@2.115.0

## 2.114.0

### Patch Changes

- Updated dependencies [3e2fe1d]
- Updated dependencies [683eaeb]
- Updated dependencies [7f46575]
- Updated dependencies [9af02f0]
  - @memberjunction/core-actions@2.114.0
  - @memberjunction/ai-agents@2.114.0
  - @memberjunction/ai-agent-manager@2.114.0
  - @memberjunction/scheduling-engine@2.114.0
  - @memberjunction/ai-agent-manager-actions@2.114.0
  - @memberjunction/ai@2.114.0
  - @memberjunction/ai-core-plus@2.114.0
  - @memberjunction/aiengine@2.114.0
  - @memberjunction/ai-prompts@2.114.0
  - @memberjunction/ai-provider-bundle@2.114.0
  - @memberjunction/ai-vectors-pinecone@2.114.0
  - @memberjunction/actions-apollo@2.114.0
  - @memberjunction/actions-bizapps-accounting@2.114.0
  - @memberjunction/actions-bizapps-crm@2.114.0
  - @memberjunction/actions-bizapps-formbuilders@2.114.0
  - @memberjunction/actions-bizapps-lms@2.114.0
  - @memberjunction/actions-bizapps-social@2.114.0
  - @memberjunction/actions@2.114.0
  - @memberjunction/entity-communications-server@2.114.0
  - @memberjunction/communication-ms-graph@2.114.0
  - @memberjunction/communication-sendgrid@2.114.0
  - @memberjunction/component-registry-client-sdk@2.114.0
  - @memberjunction/doc-utils@2.114.0
  - @memberjunction/external-change-detection@2.114.0
  - @memberjunction/graphql-dataprovider@2.114.0
  - @memberjunction/core@2.114.0
  - @memberjunction/core-entities@2.114.0
  - @memberjunction/core-entities-server@2.114.0
  - @memberjunction/data-context@2.114.0
  - @memberjunction/data-context-server@2.114.0
  - @memberjunction/global@2.114.0
  - @memberjunction/queue@2.114.0
  - @memberjunction/storage@2.114.0
  - @memberjunction/sqlserver-dataprovider@2.114.0
  - @memberjunction/scheduling-actions@2.114.0
  - @memberjunction/scheduling-engine-base@2.114.0
  - @memberjunction/scheduling-base-types@2.114.0
  - @memberjunction/skip-types@2.114.0
  - @memberjunction/templates@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/ai-agent-manager-actions@2.113.2
  - @memberjunction/ai-agent-manager@2.113.2
  - @memberjunction/ai-agents@2.113.2
  - @memberjunction/ai-core-plus@2.113.2
  - @memberjunction/aiengine@2.113.2
  - @memberjunction/ai-prompts@2.113.2
  - @memberjunction/ai-vectors-pinecone@2.113.2
  - @memberjunction/actions-apollo@2.113.2
  - @memberjunction/actions-bizapps-accounting@2.113.2
  - @memberjunction/actions-bizapps-crm@2.113.2
  - @memberjunction/actions-bizapps-lms@2.113.2
  - @memberjunction/actions-bizapps-social@2.113.2
  - @memberjunction/core-actions@2.113.2
  - @memberjunction/actions@2.113.2
  - @memberjunction/entity-communications-server@2.113.2
  - @memberjunction/communication-ms-graph@2.113.2
  - @memberjunction/communication-sendgrid@2.113.2
  - @memberjunction/component-registry-client-sdk@2.113.2
  - @memberjunction/doc-utils@2.113.2
  - @memberjunction/external-change-detection@2.113.2
  - @memberjunction/graphql-dataprovider@2.113.2
  - @memberjunction/core-entities@2.113.2
  - @memberjunction/core-entities-server@2.113.2
  - @memberjunction/data-context@2.113.2
  - @memberjunction/queue@2.113.2
  - @memberjunction/storage@2.113.2
  - @memberjunction/sqlserver-dataprovider@2.113.2
  - @memberjunction/scheduling-actions@2.113.2
  - @memberjunction/scheduling-engine-base@2.113.2
  - @memberjunction/scheduling-engine@2.113.2
  - @memberjunction/skip-types@2.113.2
  - @memberjunction/templates@2.113.2
  - @memberjunction/data-context-server@2.113.2
  - @memberjunction/ai@2.113.2
  - @memberjunction/ai-provider-bundle@2.113.2
  - @memberjunction/global@2.113.2
  - @memberjunction/scheduling-base-types@2.113.2

## 2.112.0

### Patch Changes

- e237ca9: - Optimize AIEngine embedding generation to eliminate wasteful auto-refresh regeneration (~3s → <1ms)
  - Enhance Skip artifact retrieval with optimized query and conversationDetailID for reliable modification workflow
  - Add Query Parameter Processor to SQLServerDataProvider index exports
  - Replace 4 RunView calls with single optimized query for Skip artifact retrieval
- Updated dependencies [2ac2120]
- Updated dependencies [2ac2120]
- Updated dependencies [e237ca9]
- Updated dependencies [c126b59]
- Updated dependencies [2ac2120]
- Updated dependencies [ed74bb8]
- Updated dependencies [621960a]
- Updated dependencies [2ac2120]
  - @memberjunction/ai-agent-manager@2.112.0
  - @memberjunction/ai-agents@2.112.0
  - @memberjunction/core-actions@2.112.0
  - @memberjunction/sqlserver-dataprovider@2.112.0
  - @memberjunction/aiengine@2.112.0
  - @memberjunction/skip-types@2.112.0
  - @memberjunction/global@2.112.0
  - @memberjunction/storage@2.112.0
  - @memberjunction/ai-core-plus@2.112.0
  - @memberjunction/ai-agent-manager-actions@2.112.0
  - @memberjunction/scheduling-engine@2.112.0
  - @memberjunction/external-change-detection@2.112.0
  - @memberjunction/core-entities-server@2.112.0
  - @memberjunction/ai-prompts@2.112.0
  - @memberjunction/ai-vectors-pinecone@2.112.0
  - @memberjunction/actions@2.112.0
  - @memberjunction/queue@2.112.0
  - @memberjunction/templates@2.112.0
  - @memberjunction/ai@2.112.0
  - @memberjunction/actions-apollo@2.112.0
  - @memberjunction/actions-bizapps-accounting@2.112.0
  - @memberjunction/actions-bizapps-crm@2.112.0
  - @memberjunction/actions-bizapps-lms@2.112.0
  - @memberjunction/actions-bizapps-social@2.112.0
  - @memberjunction/entity-communications-server@2.112.0
  - @memberjunction/component-registry-client-sdk@2.112.0
  - @memberjunction/doc-utils@2.112.0
  - @memberjunction/graphql-dataprovider@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/core-entities@2.112.0
  - @memberjunction/data-context@2.112.0
  - @memberjunction/data-context-server@2.112.0
  - @memberjunction/scheduling-actions@2.112.0
  - @memberjunction/scheduling-engine-base@2.112.0
  - @memberjunction/scheduling-base-types@2.112.0
  - @memberjunction/ai-provider-bundle@2.112.0

## 2.110.1

### Patch Changes

- Updated dependencies [47733e0]
  - @memberjunction/core-actions@2.110.1
  - @memberjunction/ai-agent-manager-actions@2.110.1
  - @memberjunction/ai-agent-manager@2.110.1
  - @memberjunction/ai-agents@2.110.1
  - @memberjunction/ai@2.110.1
  - @memberjunction/ai-core-plus@2.110.1
  - @memberjunction/aiengine@2.110.1
  - @memberjunction/ai-prompts@2.110.1
  - @memberjunction/ai-provider-bundle@2.110.1
  - @memberjunction/ai-vectors-pinecone@2.110.1
  - @memberjunction/actions-apollo@2.110.1
  - @memberjunction/actions-bizapps-accounting@2.110.1
  - @memberjunction/actions-bizapps-crm@2.110.1
  - @memberjunction/actions-bizapps-lms@2.110.1
  - @memberjunction/actions-bizapps-social@2.110.1
  - @memberjunction/actions@2.110.1
  - @memberjunction/entity-communications-server@2.110.1
  - @memberjunction/component-registry-client-sdk@2.110.1
  - @memberjunction/doc-utils@2.110.1
  - @memberjunction/external-change-detection@2.110.1
  - @memberjunction/graphql-dataprovider@2.110.1
  - @memberjunction/core@2.110.1
  - @memberjunction/core-entities@2.110.1
  - @memberjunction/core-entities-server@2.110.1
  - @memberjunction/data-context@2.110.1
  - @memberjunction/data-context-server@2.110.1
  - @memberjunction/global@2.110.1
  - @memberjunction/queue@2.110.1
  - @memberjunction/storage@2.110.1
  - @memberjunction/sqlserver-dataprovider@2.110.1
  - @memberjunction/scheduling-actions@2.110.1
  - @memberjunction/scheduling-engine-base@2.110.1
  - @memberjunction/scheduling-base-types@2.110.1
  - @memberjunction/scheduling-engine@2.110.1
  - @memberjunction/skip-types@2.110.1
  - @memberjunction/templates@2.110.1

## 2.110.0

### Minor Changes

- d2d7ab9: migration
- c8b9aca: Migration

### Patch Changes

- 02d72ff: - Sort Zod schema entity field values by sequence in CodeGen for consistent ordering
  - Add unique constraints to QueryCategory and Query tables to prevent duplicates
  - Improve concurrent query creation handling in CreateQueryResolver
  - Fix metadata provider usage in entity server classes
  - Remove automatic error logging from SQLServerDataProvider
- Updated dependencies [02d72ff]
- Updated dependencies [d2d7ab9]
- Updated dependencies [c8b9aca]
- Updated dependencies [93c00ac]
- Updated dependencies [8f1384a]
  - @memberjunction/core-entities@2.110.0
  - @memberjunction/sqlserver-dataprovider@2.110.0
  - @memberjunction/core-entities-server@2.110.0
  - @memberjunction/core-actions@2.110.0
  - @memberjunction/graphql-dataprovider@2.110.0
  - @memberjunction/ai-agent-manager@2.110.0
  - @memberjunction/ai-core-plus@2.110.0
  - @memberjunction/ai-agents@2.110.0
  - @memberjunction/entity-communications-server@2.110.0
  - @memberjunction/ai-agent-manager-actions@2.110.0
  - @memberjunction/aiengine@2.110.0
  - @memberjunction/ai-prompts@2.110.0
  - @memberjunction/actions-apollo@2.110.0
  - @memberjunction/actions-bizapps-accounting@2.110.0
  - @memberjunction/actions-bizapps-lms@2.110.0
  - @memberjunction/actions-bizapps-social@2.110.0
  - @memberjunction/actions@2.110.0
  - @memberjunction/doc-utils@2.110.0
  - @memberjunction/external-change-detection@2.110.0
  - @memberjunction/data-context@2.110.0
  - @memberjunction/queue@2.110.0
  - @memberjunction/storage@2.110.0
  - @memberjunction/scheduling-actions@2.110.0
  - @memberjunction/scheduling-engine-base@2.110.0
  - @memberjunction/scheduling-engine@2.110.0
  - @memberjunction/templates@2.110.0
  - @memberjunction/ai-vectors-pinecone@2.110.0
  - @memberjunction/actions-bizapps-crm@2.110.0
  - @memberjunction/data-context-server@2.110.0
  - @memberjunction/skip-types@2.110.0
  - @memberjunction/ai@2.110.0
  - @memberjunction/ai-provider-bundle@2.110.0
  - @memberjunction/component-registry-client-sdk@2.110.0
  - @memberjunction/core@2.110.0
  - @memberjunction/global@2.110.0
  - @memberjunction/scheduling-base-types@2.110.0

## 2.109.0

### Minor Changes

- a38989b: Migration

### Patch Changes

- Updated dependencies [6e45c17]
- Updated dependencies [e9e8a36]
- Updated dependencies [e2a6338]
- Updated dependencies [a38989b]
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/doc-utils@2.109.0
  - @memberjunction/ai-agents@2.109.0
  - @memberjunction/ai-agent-manager@2.109.0
  - @memberjunction/core-actions@2.109.0
  - @memberjunction/ai-core-plus@2.109.0
  - @memberjunction/aiengine@2.109.0
  - @memberjunction/ai-agent-manager-actions@2.109.0
  - @memberjunction/ai-prompts@2.109.0
  - @memberjunction/actions-apollo@2.109.0
  - @memberjunction/actions-bizapps-accounting@2.109.0
  - @memberjunction/actions-bizapps-lms@2.109.0
  - @memberjunction/actions-bizapps-social@2.109.0
  - @memberjunction/actions@2.109.0
  - @memberjunction/entity-communications-server@2.109.0
  - @memberjunction/external-change-detection@2.109.0
  - @memberjunction/graphql-dataprovider@2.109.0
  - @memberjunction/core-entities-server@2.109.0
  - @memberjunction/data-context@2.109.0
  - @memberjunction/queue@2.109.0
  - @memberjunction/storage@2.109.0
  - @memberjunction/sqlserver-dataprovider@2.109.0
  - @memberjunction/scheduling-actions@2.109.0
  - @memberjunction/scheduling-engine-base@2.109.0
  - @memberjunction/scheduling-engine@2.109.0
  - @memberjunction/templates@2.109.0
  - @memberjunction/ai-vectors-pinecone@2.109.0
  - @memberjunction/actions-bizapps-crm@2.109.0
  - @memberjunction/data-context-server@2.109.0
  - @memberjunction/skip-types@2.109.0
  - @memberjunction/ai@2.109.0
  - @memberjunction/ai-provider-bundle@2.109.0
  - @memberjunction/component-registry-client-sdk@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0
  - @memberjunction/scheduling-base-types@2.109.0

## 2.108.0

### Minor Changes

- a4d545b: migration
- 656d86c: Migration

### Patch Changes

- Updated dependencies [5d51137]
- Updated dependencies [687e2ae]
- Updated dependencies [30ec87a]
- Updated dependencies [d205a6c]
- Updated dependencies [4a7e34c]
- Updated dependencies [c8983c6]
- Updated dependencies [656d86c]
  - @memberjunction/core-actions@2.108.0
  - @memberjunction/ai-agents@2.108.0
  - @memberjunction/aiengine@2.108.0
  - @memberjunction/ai-agent-manager-actions@2.108.0
  - @memberjunction/ai-core-plus@2.108.0
  - @memberjunction/ai@2.108.0
  - @memberjunction/actions@2.108.0
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/scheduling-engine@2.108.0
  - @memberjunction/ai-prompts@2.108.0
  - @memberjunction/ai-vectors-pinecone@2.108.0
  - @memberjunction/core-entities-server@2.108.0
  - @memberjunction/queue@2.108.0
  - @memberjunction/sqlserver-dataprovider@2.108.0
  - @memberjunction/templates@2.108.0
  - @memberjunction/graphql-dataprovider@2.108.0
  - @memberjunction/actions-bizapps-lms@2.108.0
  - @memberjunction/actions-bizapps-social@2.108.0
  - @memberjunction/scheduling-actions@2.108.0
  - @memberjunction/actions-apollo@2.108.0
  - @memberjunction/actions-bizapps-accounting@2.108.0
  - @memberjunction/actions-bizapps-crm@2.108.0
  - @memberjunction/entity-communications-server@2.108.0
  - @memberjunction/doc-utils@2.108.0
  - @memberjunction/external-change-detection@2.108.0
  - @memberjunction/data-context@2.108.0
  - @memberjunction/storage@2.108.0
  - @memberjunction/scheduling-engine-base@2.108.0
  - @memberjunction/ai-provider-bundle@2.108.0
  - @memberjunction/data-context-server@2.108.0
  - @memberjunction/skip-types@2.108.0
  - @memberjunction/component-registry-client-sdk@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0
  - @memberjunction/scheduling-base-types@2.108.0

## 2.107.0

### Minor Changes

- e05a672: migration
- c4291f9: MJ migration
- 0dd1d04: migration

### Patch Changes

- Updated dependencies [e05a672]
- Updated dependencies [0dd1d04]
- Updated dependencies [af67760]
- Updated dependencies [0be127f]
  - @memberjunction/scheduling-engine-base@2.107.0
  - @memberjunction/scheduling-base-types@2.107.0
  - @memberjunction/scheduling-engine@2.107.0
  - @memberjunction/core-actions@2.107.0
  - @memberjunction/storage@2.107.0
  - @memberjunction/scheduling-actions@2.107.0
  - @memberjunction/ai-agent-manager-actions@2.107.0
  - @memberjunction/ai-agents@2.107.0
  - @memberjunction/ai@2.107.0
  - @memberjunction/ai-core-plus@2.107.0
  - @memberjunction/aiengine@2.107.0
  - @memberjunction/ai-prompts@2.107.0
  - @memberjunction/ai-provider-bundle@2.107.0
  - @memberjunction/ai-vectors-pinecone@2.107.0
  - @memberjunction/actions-apollo@2.107.0
  - @memberjunction/actions-bizapps-accounting@2.107.0
  - @memberjunction/actions-bizapps-crm@2.107.0
  - @memberjunction/actions-bizapps-lms@2.107.0
  - @memberjunction/actions-bizapps-social@2.107.0
  - @memberjunction/actions@2.107.0
  - @memberjunction/entity-communications-server@2.107.0
  - @memberjunction/component-registry-client-sdk@2.107.0
  - @memberjunction/doc-utils@2.107.0
  - @memberjunction/external-change-detection@2.107.0
  - @memberjunction/graphql-dataprovider@2.107.0
  - @memberjunction/core@2.107.0
  - @memberjunction/core-entities@2.107.0
  - @memberjunction/core-entities-server@2.107.0
  - @memberjunction/data-context@2.107.0
  - @memberjunction/data-context-server@2.107.0
  - @memberjunction/global@2.107.0
  - @memberjunction/queue@2.107.0
  - @memberjunction/sqlserver-dataprovider@2.107.0
  - @memberjunction/skip-types@2.107.0
  - @memberjunction/templates@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/core-actions@2.106.0
- @memberjunction/entity-communications-server@2.106.0
- @memberjunction/ai-agent-manager-actions@2.106.0
- @memberjunction/ai-agents@2.106.0
- @memberjunction/ai@2.106.0
- @memberjunction/ai-core-plus@2.106.0
- @memberjunction/aiengine@2.106.0
- @memberjunction/ai-prompts@2.106.0
- @memberjunction/ai-provider-bundle@2.106.0
- @memberjunction/ai-vectors-pinecone@2.106.0
- @memberjunction/actions-apollo@2.106.0
- @memberjunction/actions-bizapps-accounting@2.106.0
- @memberjunction/actions-bizapps-crm@2.106.0
- @memberjunction/actions-bizapps-lms@2.106.0
- @memberjunction/actions-bizapps-social@2.106.0
- @memberjunction/actions@2.106.0
- @memberjunction/component-registry-client-sdk@2.106.0
- @memberjunction/doc-utils@2.106.0
- @memberjunction/external-change-detection@2.106.0
- @memberjunction/graphql-dataprovider@2.106.0
- @memberjunction/core@2.106.0
- @memberjunction/core-entities@2.106.0
- @memberjunction/core-entities-server@2.106.0
- @memberjunction/data-context@2.106.0
- @memberjunction/data-context-server@2.106.0
- @memberjunction/global@2.106.0
- @memberjunction/queue@2.106.0
- @memberjunction/storage@2.106.0
- @memberjunction/sqlserver-dataprovider@2.106.0
- @memberjunction/skip-types@2.106.0
- @memberjunction/templates@2.106.0

## 2.105.0

### Patch Changes

- 1d7a841: migration
- 9b67e0c: This release addresses critical stability issues across build processes, runtime execution, and AI model management in the MemberJunction platform. The changes focus on three main areas: production build reliability, database migration consistency, and intelligent AI error handling.

  Resolved critical issues where Angular production builds with optimization enabled would remove essential classes through aggressive tree-shaking. Moved `TemplateEntityExtended` to `@memberjunction/core-entities` and created new `@memberjunction/ai-provider-bundle` package to centralize AI provider loading while maintaining clean separation between core infrastructure and provider implementations. Added `LoadEntityCommunicationsEngineClient()` calls to prevent removal of inherited singleton methods. These changes prevent runtime errors in production deployments where previously registered classes would become inaccessible, while improving architectural separation of concerns.

  Enhanced CodeGen SQL generation to use `IF OBJECT_ID()` patterns instead of `DROP ... IF EXISTS` syntax, fixing silent failures with Flyway placeholder substitution. Improved validator generation to properly handle nullable fields and correctly set `result.Success` status. Centralized GraphQL type name generation using schema-aware naming (`{schema}_{basetable}_`) to eliminate type collisions between entities with identical base table names across different schemas. These changes ensure reliable database migrations and prevent recurring cascade delete regressions.

  Implemented sophisticated error classification with new `NoCredit` error type for billing failures, message-first error detection, and permissive failover for 403 errors. Added hierarchical configuration-aware failover that respects configuration boundaries (Production vs Development models) while maintaining candidate list caching for performance. Enhanced error analysis to properly classify credit/quota issues and enable appropriate failover behavior.

  Improved model selection caching by checking all candidates for valid API keys instead of stopping at first match, ensuring retry logic has access to complete list of viable model/vendor combinations. Added `extractValidCandidates()` method to `AIModelSelectionInfo` class and `buildCandidatesFromSelectionInfo()` helper to properly reconstruct candidate lists from selection metadata during hierarchical template execution.

  Enhanced error-based retry and failover with intelligent handling for authentication and rate limit errors. Authentication errors now trigger vendor-level filtering (excluding all models from vendors with invalid API keys) and immediate failover to different vendors. Rate limit errors now retry the same model/vendor using configurable `MaxRetries` (default: 3) with backoff delay based on `RetryStrategy` (Fixed/Linear/Exponential) before failing over. Improved log messages with human-readable formatting showing model/vendor names, time in seconds, and clear status indicators. Fixed MJCLI sync commands to properly propagate exit codes for CI/CD integration.

- Updated dependencies [4807f35]
- Updated dependencies [d66070e]
- Updated dependencies [9b67e0c]
  - @memberjunction/ai-core-plus@2.105.0
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/ai-agents@2.105.0
  - @memberjunction/ai@2.105.0
  - @memberjunction/aiengine@2.105.0
  - @memberjunction/ai-prompts@2.105.0
  - @memberjunction/ai-provider-bundle@2.105.0
  - @memberjunction/ai-vectors-pinecone@2.105.0
  - @memberjunction/entity-communications-server@2.105.0
  - @memberjunction/core-entities-server@2.105.0
  - @memberjunction/queue@2.105.0
  - @memberjunction/sqlserver-dataprovider@2.105.0
  - @memberjunction/templates@2.105.0
  - @memberjunction/core-actions@2.105.0
  - @memberjunction/actions@2.105.0
  - @memberjunction/graphql-dataprovider@2.105.0
  - @memberjunction/ai-agent-manager-actions@2.105.0
  - @memberjunction/actions-apollo@2.105.0
  - @memberjunction/actions-bizapps-accounting@2.105.0
  - @memberjunction/actions-bizapps-lms@2.105.0
  - @memberjunction/actions-bizapps-social@2.105.0
  - @memberjunction/doc-utils@2.105.0
  - @memberjunction/external-change-detection@2.105.0
  - @memberjunction/data-context@2.105.0
  - @memberjunction/storage@2.105.0
  - @memberjunction/actions-bizapps-crm@2.105.0
  - @memberjunction/data-context-server@2.105.0
  - @memberjunction/skip-types@2.105.0
  - @memberjunction/component-registry-client-sdk@2.105.0
  - @memberjunction/core@2.105.0
  - @memberjunction/global@2.105.0

## 2.104.0

### Patch Changes

- 4567af3: **Component Feedback System (Registry-Agnostic)**

  Implement comprehensive component feedback system that works across any component registry (Skip, MJ Central, etc.) with support for custom feedback handlers.
  - Add skip-component-feedback-panel component with sliding panel UI (444 lines CSS, 161 lines HTML, 274 lines TS)
  - Add star ratings (0-5 scale), comments, and component hierarchy visualization
  - Add FeedbackHandler interface for customizable feedback logic per registry
  - Add ComponentFeedbackParams and ComponentFeedbackResponse types with full parameter set
  - Add POST /api/v1/feedback endpoint to ComponentRegistryAPIServer
  - Add submitFeedback() method to ComponentRegistryClient SDK
  - Add SendComponentFeedback mutation to ComponentRegistryResolver (replaces AskSkipResolver implementation)
  - Use ComponentRegistryClient SDK with REGISTRY*URI_OVERRIDE*_ and REGISTRY*API_KEY*_ support
  - Update skip-artifact-viewer to use GraphQLComponentRegistryClient for feedback submission
  - Extract registry name from component spec with fallback to 'Skip'
  - Update dynamic-ui-component and linear-report with component hierarchy tracking
  - Pass conversationID and authenticated user email for contact resolution

  **React Runtime Debug Logging Enhancements**

  Restore debug logging with production guards for better debugging capabilities.
  - Restore 12 debug console.log statements throughout React runtime (prop-builder, component-hierarchy)
  - Wrap all debug logs with LogStatus/GetProductionStatus checks
  - Add comprehensive README.md documentation (95 lines) for debug configuration
  - Logs only execute when not in production mode
  - Update ReactDebugConfig with enhanced environment variable support

  **AI Prompt Error Handling Improvements**

  Replace hardcoded error truncation with configurable maxErrorLength parameter.
  - Add maxErrorLength?: number property to AIPromptParams class
  - Update AIPromptRunner.logError() to accept maxErrorLength in options
  - Thread maxErrorLength through 18 logError calls throughout AIPromptRunner
  - Remove hardcoded MAX_ERROR_LENGTH constant (500 chars)
  - When undefined (default), errors are returned in full for debugging
  - When set, errors are truncated with "... [truncated]" suffix

  **Bug Fixes**
  - Fix AI parameter extraction edge cases in AIPromptRunner and QueryEntity
  - Fix mj.config.cjs configuration
  - Fix component hierarchy tracking in dynamic reports

  Addresses PR #1426 comments #5, #7, and #8

- 16b2084: tweaks
- cd95686: Add user email support to Component Registry Client SDK for usage tracking. The SDK now sends authenticated user email to component registry servers via query parameters (GET requests) or request body (POST requests), enabling per-user analytics and contact tracking.
- Updated dependencies [aafa827]
- Updated dependencies [49171c3]
- Updated dependencies [2ff5428]
- Updated dependencies [4567af3]
- Updated dependencies [9ad6353]
- Updated dependencies [8f2a4fa]
- Updated dependencies [6e7f14a]
- Updated dependencies [3f71ef4]
- Updated dependencies [cd95686]
- Updated dependencies [e6df147]
- Updated dependencies [7980171]
  - @memberjunction/ai-prompts@2.104.0
  - @memberjunction/ai-anthropic@2.104.0
  - @memberjunction/ai-openai@2.104.0
  - @memberjunction/ai-agent-manager-actions@2.104.0
  - @memberjunction/global@2.104.0
  - @memberjunction/core-entities-server@2.104.0
  - @memberjunction/component-registry-client-sdk@2.104.0
  - @memberjunction/graphql-dataprovider@2.104.0
  - @memberjunction/ai-core-plus@2.104.0
  - @memberjunction/core-entities@2.104.0
  - @memberjunction/core-actions@2.104.0
  - @memberjunction/sqlserver-dataprovider@2.104.0
  - @memberjunction/storage@2.104.0
  - @memberjunction/ai-agents@2.104.0
  - @memberjunction/actions@2.104.0
  - @memberjunction/ai-openrouter@2.104.0
  - @memberjunction/ai@2.104.0
  - @memberjunction/aiengine@2.104.0
  - @memberjunction/ai-cerebras@2.104.0
  - @memberjunction/ai-groq@2.104.0
  - @memberjunction/ai-lmstudio@2.104.0
  - @memberjunction/ai-local-embeddings@2.104.0
  - @memberjunction/ai-mistral@2.104.0
  - @memberjunction/ai-ollama@2.104.0
  - @memberjunction/ai-vectors-pinecone@2.104.0
  - @memberjunction/actions-apollo@2.104.0
  - @memberjunction/actions-bizapps-accounting@2.104.0
  - @memberjunction/actions-bizapps-crm@2.104.0
  - @memberjunction/actions-bizapps-lms@2.104.0
  - @memberjunction/actions-bizapps-social@2.104.0
  - @memberjunction/entity-communications-server@2.104.0
  - @memberjunction/doc-utils@2.104.0
  - @memberjunction/external-change-detection@2.104.0
  - @memberjunction/core@2.104.0
  - @memberjunction/data-context@2.104.0
  - @memberjunction/data-context-server@2.104.0
  - @memberjunction/queue@2.104.0
  - @memberjunction/templates@2.104.0
  - @memberjunction/skip-types@2.104.0

## 2.103.0

### Minor Changes

- 3ba01de: migration

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [bd75336]
- Updated dependencies [addf572]
- Updated dependencies [3ba01de]
- Updated dependencies [a38eec3]
  - @memberjunction/core@2.103.0
  - @memberjunction/entity-communications-server@2.103.0
  - @memberjunction/ai-vectors-pinecone@2.103.0
  - @memberjunction/ai-local-embeddings@2.103.0
  - @memberjunction/actions-bizapps-accounting@2.103.0
  - @memberjunction/component-registry-client-sdk@2.103.0
  - @memberjunction/actions-apollo@2.103.0
  - @memberjunction/ai-agent-manager-actions@2.103.0
  - @memberjunction/ai-openrouter@2.103.0
  - @memberjunction/external-change-detection@2.103.0
  - @memberjunction/ai-anthropic@2.103.0
  - @memberjunction/actions-bizapps-social@2.103.0
  - @memberjunction/ai-cerebras@2.103.0
  - @memberjunction/ai-lmstudio@2.103.0
  - @memberjunction/sqlserver-dataprovider@2.103.0
  - @memberjunction/ai-mistral@2.103.0
  - @memberjunction/core-entities-server@2.103.0
  - @memberjunction/ai-ollama@2.103.0
  - @memberjunction/ai-openai@2.103.0
  - @memberjunction/actions-bizapps-crm@2.103.0
  - @memberjunction/actions-bizapps-lms@2.103.0
  - @memberjunction/core-actions@2.103.0
  - @memberjunction/graphql-dataprovider@2.103.0
  - @memberjunction/data-context-server@2.103.0
  - @memberjunction/ai-groq@2.103.0
  - @memberjunction/templates@2.103.0
  - @memberjunction/actions@2.103.0
  - @memberjunction/core-entities@2.103.0
  - @memberjunction/data-context@2.103.0
  - @memberjunction/ai-core-plus@2.103.0
  - @memberjunction/ai-prompts@2.103.0
  - @memberjunction/ai-agents@2.103.0
  - @memberjunction/aiengine@2.103.0
  - @memberjunction/storage@2.103.0
  - @memberjunction/skip-types@2.103.0
  - @memberjunction/doc-utils@2.103.0
  - @memberjunction/global@2.103.0
  - @memberjunction/ai@2.103.0
  - @memberjunction/queue@2.103.0

## 2.100.3

### Patch Changes

- 5d48c71: Component Registry Cache Fix. Pass Registry ID, not Name to cache method
  - @memberjunction/component-registry-client-sdk@2.100.3
  - @memberjunction/core-entities@2.100.3
  - @memberjunction/skip-types@2.100.3
  - @memberjunction/ai-agent-manager-actions@2.100.3
  - @memberjunction/ai-agents@2.100.3
  - @memberjunction/ai-core-plus@2.100.3
  - @memberjunction/aiengine@2.100.3
  - @memberjunction/ai-prompts@2.100.3
  - @memberjunction/actions-apollo@2.100.3
  - @memberjunction/actions-bizapps-accounting@2.100.3
  - @memberjunction/actions-bizapps-lms@2.100.3
  - @memberjunction/actions-bizapps-social@2.100.3
  - @memberjunction/core-actions@2.100.3
  - @memberjunction/actions@2.100.3
  - @memberjunction/entity-communications-server@2.100.3
  - @memberjunction/doc-utils@2.100.3
  - @memberjunction/external-change-detection@2.100.3
  - @memberjunction/graphql-dataprovider@2.100.3
  - @memberjunction/core-entities-server@2.100.3
  - @memberjunction/data-context@2.100.3
  - @memberjunction/queue@2.100.3
  - @memberjunction/storage@2.100.3
  - @memberjunction/sqlserver-dataprovider@2.100.3
  - @memberjunction/templates@2.100.3
  - @memberjunction/ai-vectors-pinecone@2.100.3
  - @memberjunction/actions-bizapps-crm@2.100.3
  - @memberjunction/data-context-server@2.100.3
  - @memberjunction/ai@2.100.3
  - @memberjunction/ai-anthropic@2.100.3
  - @memberjunction/ai-cerebras@2.100.3
  - @memberjunction/ai-groq@2.100.3
  - @memberjunction/ai-lmstudio@2.100.3
  - @memberjunction/ai-local-embeddings@2.100.3
  - @memberjunction/ai-mistral@2.100.3
  - @memberjunction/ai-ollama@2.100.3
  - @memberjunction/ai-openai@2.100.3
  - @memberjunction/ai-openrouter@2.100.3
  - @memberjunction/core@2.100.3
  - @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- 1e3e5e6: Update ComponentRegistryResolver.ts to add .js extensions to match other resolvers.
  - @memberjunction/ai-agent-manager-actions@2.100.2
  - @memberjunction/ai-agents@2.100.2
  - @memberjunction/ai@2.100.2
  - @memberjunction/ai-core-plus@2.100.2
  - @memberjunction/aiengine@2.100.2
  - @memberjunction/ai-prompts@2.100.2
  - @memberjunction/ai-anthropic@2.100.2
  - @memberjunction/ai-cerebras@2.100.2
  - @memberjunction/ai-groq@2.100.2
  - @memberjunction/ai-lmstudio@2.100.2
  - @memberjunction/ai-local-embeddings@2.100.2
  - @memberjunction/ai-mistral@2.100.2
  - @memberjunction/ai-ollama@2.100.2
  - @memberjunction/ai-openai@2.100.2
  - @memberjunction/ai-openrouter@2.100.2
  - @memberjunction/ai-vectors-pinecone@2.100.2
  - @memberjunction/actions-apollo@2.100.2
  - @memberjunction/actions-bizapps-accounting@2.100.2
  - @memberjunction/actions-bizapps-crm@2.100.2
  - @memberjunction/actions-bizapps-lms@2.100.2
  - @memberjunction/actions-bizapps-social@2.100.2
  - @memberjunction/core-actions@2.100.2
  - @memberjunction/actions@2.100.2
  - @memberjunction/entity-communications-server@2.100.2
  - @memberjunction/component-registry-client-sdk@2.100.2
  - @memberjunction/doc-utils@2.100.2
  - @memberjunction/external-change-detection@2.100.2
  - @memberjunction/graphql-dataprovider@2.100.2
  - @memberjunction/core@2.100.2
  - @memberjunction/core-entities@2.100.2
  - @memberjunction/core-entities-server@2.100.2
  - @memberjunction/data-context@2.100.2
  - @memberjunction/data-context-server@2.100.2
  - @memberjunction/global@2.100.2
  - @memberjunction/queue@2.100.2
  - @memberjunction/storage@2.100.2
  - @memberjunction/sqlserver-dataprovider@2.100.2
  - @memberjunction/skip-types@2.100.2
  - @memberjunction/templates@2.100.2

## 2.100.1

### Patch Changes

- b617834: Add @memberjunction/component-registry-client-sdk to MJServer's dependency
  - @memberjunction/ai-agent-manager-actions@2.100.1
  - @memberjunction/ai-agents@2.100.1
  - @memberjunction/ai@2.100.1
  - @memberjunction/ai-core-plus@2.100.1
  - @memberjunction/aiengine@2.100.1
  - @memberjunction/ai-prompts@2.100.1
  - @memberjunction/ai-anthropic@2.100.1
  - @memberjunction/ai-cerebras@2.100.1
  - @memberjunction/ai-groq@2.100.1
  - @memberjunction/ai-lmstudio@2.100.1
  - @memberjunction/ai-local-embeddings@2.100.1
  - @memberjunction/ai-mistral@2.100.1
  - @memberjunction/ai-ollama@2.100.1
  - @memberjunction/ai-openai@2.100.1
  - @memberjunction/ai-openrouter@2.100.1
  - @memberjunction/ai-vectors-pinecone@2.100.1
  - @memberjunction/actions-apollo@2.100.1
  - @memberjunction/actions-bizapps-accounting@2.100.1
  - @memberjunction/actions-bizapps-crm@2.100.1
  - @memberjunction/actions-bizapps-lms@2.100.1
  - @memberjunction/actions-bizapps-social@2.100.1
  - @memberjunction/core-actions@2.100.1
  - @memberjunction/actions@2.100.1
  - @memberjunction/entity-communications-server@2.100.1
  - @memberjunction/component-registry-client-sdk@2.100.1
  - @memberjunction/doc-utils@2.100.1
  - @memberjunction/external-change-detection@2.100.1
  - @memberjunction/graphql-dataprovider@2.100.1
  - @memberjunction/core@2.100.1
  - @memberjunction/core-entities@2.100.1
  - @memberjunction/core-entities-server@2.100.1
  - @memberjunction/data-context@2.100.1
  - @memberjunction/data-context-server@2.100.1
  - @memberjunction/global@2.100.1
  - @memberjunction/queue@2.100.1
  - @memberjunction/storage@2.100.1
  - @memberjunction/sqlserver-dataprovider@2.100.1
  - @memberjunction/skip-types@2.100.1
  - @memberjunction/templates@2.100.1

## 2.100.0

### Minor Changes

- b3132ec: migration

### Patch Changes

- Updated dependencies [5f76e3a]
- Updated dependencies [b3132ec]
- Updated dependencies [ffc2c1a]
  - @memberjunction/core@2.100.0
  - @memberjunction/graphql-dataprovider@2.100.0
  - @memberjunction/core-entities@2.100.0
  - @memberjunction/ai-agent-manager-actions@2.100.0
  - @memberjunction/ai-agents@2.100.0
  - @memberjunction/ai-core-plus@2.100.0
  - @memberjunction/aiengine@2.100.0
  - @memberjunction/ai-prompts@2.100.0
  - @memberjunction/ai-vectors-pinecone@2.100.0
  - @memberjunction/actions-apollo@2.100.0
  - @memberjunction/actions-bizapps-accounting@2.100.0
  - @memberjunction/actions-bizapps-crm@2.100.0
  - @memberjunction/actions-bizapps-lms@2.100.0
  - @memberjunction/actions-bizapps-social@2.100.0
  - @memberjunction/core-actions@2.100.0
  - @memberjunction/actions@2.100.0
  - @memberjunction/entity-communications-server@2.100.0
  - @memberjunction/doc-utils@2.100.0
  - @memberjunction/external-change-detection@2.100.0
  - @memberjunction/core-entities-server@2.100.0
  - @memberjunction/data-context@2.100.0
  - @memberjunction/queue@2.100.0
  - @memberjunction/storage@2.100.0
  - @memberjunction/sqlserver-dataprovider@2.100.0
  - @memberjunction/skip-types@2.100.0
  - @memberjunction/templates@2.100.0
  - @memberjunction/data-context-server@2.100.0
  - @memberjunction/ai@2.100.0
  - @memberjunction/ai-anthropic@2.100.0
  - @memberjunction/ai-cerebras@2.100.0
  - @memberjunction/ai-groq@2.100.0
  - @memberjunction/ai-lmstudio@2.100.0
  - @memberjunction/ai-local-embeddings@2.100.0
  - @memberjunction/ai-mistral@2.100.0
  - @memberjunction/ai-ollama@2.100.0
  - @memberjunction/ai-openai@2.100.0
  - @memberjunction/ai-openrouter@2.100.0
  - @memberjunction/global@2.100.0

## 2.99.0

### Minor Changes

- eb7677d: feat(ai-agents): Add ChatHandlingOption for flexible Chat step
  handling
  - Add ChatHandlingOption field to AIAgent table with values:
    Success, Failed, Retry
  - Implement Chat step remapping in
    BaseAgent.validateChatNextStep() based on agent configuration
  - Fix executeChatStep to mark Chat steps as successful
    (they're valid terminal states for user interaction)
  - Remove complex sub-agent Chat handling from FlowAgentType in
    favor of agent-level configuration
  - Enables agents like Requirements Expert to request user
    clarification without breaking parent flows
  - Parent agents can control whether Chat steps should continue
    (Success), fail (Failed), or retry (Retry)

### Patch Changes

- f1a08f2: fallback for file resolver
- 8bbb0a9: - Updated RunView resolver and GraphQL data provider to work with any
  primary key configuration
  - Changed from hardcoded "ID" field to dynamic PrimaryKey array from
    entity metadata
  - Added utility functions for handling primary key values in client code
  - Supports single non-ID primary keys (e.g., ProductID) and composite
    primary keys
  - Fixes compatibility with databases like AdventureWorks that use
    non-standard primary key names
- Updated dependencies [eb7677d]
- Updated dependencies [830815e]
- Updated dependencies [8bbb0a9]
  - @memberjunction/core-entities@2.99.0
  - @memberjunction/ai-agents@2.99.0
  - @memberjunction/actions-apollo@2.99.0
  - @memberjunction/graphql-dataprovider@2.99.0
  - @memberjunction/core@2.99.0
  - @memberjunction/ai-agent-manager-actions@2.99.0
  - @memberjunction/ai-core-plus@2.99.0
  - @memberjunction/aiengine@2.99.0
  - @memberjunction/ai-prompts@2.99.0
  - @memberjunction/actions-bizapps-accounting@2.99.0
  - @memberjunction/actions-bizapps-lms@2.99.0
  - @memberjunction/actions-bizapps-social@2.99.0
  - @memberjunction/core-actions@2.99.0
  - @memberjunction/actions@2.99.0
  - @memberjunction/entity-communications-server@2.99.0
  - @memberjunction/doc-utils@2.99.0
  - @memberjunction/external-change-detection@2.99.0
  - @memberjunction/core-entities-server@2.99.0
  - @memberjunction/data-context@2.99.0
  - @memberjunction/queue@2.99.0
  - @memberjunction/storage@2.99.0
  - @memberjunction/sqlserver-dataprovider@2.99.0
  - @memberjunction/templates@2.99.0
  - @memberjunction/ai-vectors-pinecone@2.99.0
  - @memberjunction/actions-bizapps-crm@2.99.0
  - @memberjunction/skip-types@2.99.0
  - @memberjunction/data-context-server@2.99.0
  - @memberjunction/ai@2.99.0
  - @memberjunction/ai-anthropic@2.99.0
  - @memberjunction/ai-cerebras@2.99.0
  - @memberjunction/ai-groq@2.99.0
  - @memberjunction/ai-lmstudio@2.99.0
  - @memberjunction/ai-local-embeddings@2.99.0
  - @memberjunction/ai-mistral@2.99.0
  - @memberjunction/ai-ollama@2.99.0
  - @memberjunction/ai-openai@2.99.0
  - @memberjunction/ai-openrouter@2.99.0
  - @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/ai-agent-manager-actions@2.98.0
- @memberjunction/ai-agents@2.98.0
- @memberjunction/ai@2.98.0
- @memberjunction/ai-core-plus@2.98.0
- @memberjunction/aiengine@2.98.0
- @memberjunction/ai-prompts@2.98.0
- @memberjunction/ai-anthropic@2.98.0
- @memberjunction/ai-cerebras@2.98.0
- @memberjunction/ai-groq@2.98.0
- @memberjunction/ai-lmstudio@2.98.0
- @memberjunction/ai-local-embeddings@2.98.0
- @memberjunction/ai-mistral@2.98.0
- @memberjunction/ai-ollama@2.98.0
- @memberjunction/ai-openai@2.98.0
- @memberjunction/ai-openrouter@2.98.0
- @memberjunction/ai-vectors-pinecone@2.98.0
- @memberjunction/actions-apollo@2.98.0
- @memberjunction/actions-bizapps-accounting@2.98.0
- @memberjunction/actions-bizapps-crm@2.98.0
- @memberjunction/actions-bizapps-lms@2.98.0
- @memberjunction/actions-bizapps-social@2.98.0
- @memberjunction/core-actions@2.98.0
- @memberjunction/actions@2.98.0
- @memberjunction/entity-communications-server@2.98.0
- @memberjunction/doc-utils@2.98.0
- @memberjunction/external-change-detection@2.98.0
- @memberjunction/graphql-dataprovider@2.98.0
- @memberjunction/core@2.98.0
- @memberjunction/core-entities@2.98.0
- @memberjunction/core-entities-server@2.98.0
- @memberjunction/data-context@2.98.0
- @memberjunction/data-context-server@2.98.0
- @memberjunction/global@2.98.0
- @memberjunction/queue@2.98.0
- @memberjunction/storage@2.98.0
- @memberjunction/sqlserver-dataprovider@2.98.0
- @memberjunction/skip-types@2.98.0
- @memberjunction/templates@2.98.0

## 2.97.0

### Minor Changes

- dc497d5: migration

### Patch Changes

- Updated dependencies [dc497d5]
  - @memberjunction/ai-agents@2.97.0
  - @memberjunction/core-entities@2.97.0
  - @memberjunction/skip-types@2.97.0
  - @memberjunction/ai-agent-manager-actions@2.97.0
  - @memberjunction/ai-core-plus@2.97.0
  - @memberjunction/aiengine@2.97.0
  - @memberjunction/ai-prompts@2.97.0
  - @memberjunction/actions-apollo@2.97.0
  - @memberjunction/actions-bizapps-accounting@2.97.0
  - @memberjunction/actions-bizapps-lms@2.97.0
  - @memberjunction/actions-bizapps-social@2.97.0
  - @memberjunction/core-actions@2.97.0
  - @memberjunction/actions@2.97.0
  - @memberjunction/entity-communications-server@2.97.0
  - @memberjunction/doc-utils@2.97.0
  - @memberjunction/external-change-detection@2.97.0
  - @memberjunction/graphql-dataprovider@2.97.0
  - @memberjunction/core-entities-server@2.97.0
  - @memberjunction/data-context@2.97.0
  - @memberjunction/queue@2.97.0
  - @memberjunction/storage@2.97.0
  - @memberjunction/sqlserver-dataprovider@2.97.0
  - @memberjunction/templates@2.97.0
  - @memberjunction/ai-vectors-pinecone@2.97.0
  - @memberjunction/actions-bizapps-crm@2.97.0
  - @memberjunction/data-context-server@2.97.0
  - @memberjunction/ai@2.97.0
  - @memberjunction/ai-anthropic@2.97.0
  - @memberjunction/ai-cerebras@2.97.0
  - @memberjunction/ai-groq@2.97.0
  - @memberjunction/ai-lmstudio@2.97.0
  - @memberjunction/ai-local-embeddings@2.97.0
  - @memberjunction/ai-mistral@2.97.0
  - @memberjunction/ai-ollama@2.97.0
  - @memberjunction/ai-openai@2.97.0
  - @memberjunction/ai-openrouter@2.97.0
  - @memberjunction/core@2.97.0
  - @memberjunction/global@2.97.0

## 2.96.0

### Minor Changes

- 11bf948: migration

### Patch Changes

- Updated dependencies [01dcfde]
- Updated dependencies [8f34e55]
  - @memberjunction/core@2.96.0
  - @memberjunction/ai-prompts@2.96.0
  - @memberjunction/ai-agent-manager-actions@2.96.0
  - @memberjunction/ai-agents@2.96.0
  - @memberjunction/ai-core-plus@2.96.0
  - @memberjunction/aiengine@2.96.0
  - @memberjunction/ai-vectors-pinecone@2.96.0
  - @memberjunction/actions-apollo@2.96.0
  - @memberjunction/actions-bizapps-accounting@2.96.0
  - @memberjunction/actions-bizapps-crm@2.96.0
  - @memberjunction/actions-bizapps-lms@2.96.0
  - @memberjunction/actions-bizapps-social@2.96.0
  - @memberjunction/core-actions@2.96.0
  - @memberjunction/actions@2.96.0
  - @memberjunction/entity-communications-server@2.96.0
  - @memberjunction/doc-utils@2.96.0
  - @memberjunction/external-change-detection@2.96.0
  - @memberjunction/graphql-dataprovider@2.96.0
  - @memberjunction/core-entities@2.96.0
  - @memberjunction/core-entities-server@2.96.0
  - @memberjunction/data-context@2.96.0
  - @memberjunction/queue@2.96.0
  - @memberjunction/storage@2.96.0
  - @memberjunction/sqlserver-dataprovider@2.96.0
  - @memberjunction/skip-types@2.96.0
  - @memberjunction/templates@2.96.0
  - @memberjunction/data-context-server@2.96.0
  - @memberjunction/ai@2.96.0
  - @memberjunction/ai-anthropic@2.96.0
  - @memberjunction/ai-cerebras@2.96.0
  - @memberjunction/ai-groq@2.96.0
  - @memberjunction/ai-lmstudio@2.96.0
  - @memberjunction/ai-local-embeddings@2.96.0
  - @memberjunction/ai-mistral@2.96.0
  - @memberjunction/ai-ollama@2.96.0
  - @memberjunction/ai-openai@2.96.0
  - @memberjunction/ai-openrouter@2.96.0
  - @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- 4b52f29: Skip Chat UI improvements and auth provider fixes
  - **Skip Chat UI Enhancements**:
    - Fixed timer display persistence when switching between conversations
    - Prevented clock icon from disappearing when other conversations complete
    - Eliminated delay when displaying status messages on conversation switch
    - Fixed status message and timer persistence across page refreshes
    - Preserved whitespace formatting in chat messages
    - Updated chat input style to match MS Teams design
    - Fixed text overflow issues under buttons in chat input area

  - **Auth Provider Improvements**:
    - Simplified Load function implementation across auth providers (Auth0, MSAL,
      Okta)

  - **MJAPI Configuration**:
    - Added configurable public URL support for MJAPI callbacks to enable hybrid
      development scenarios

- Updated dependencies [a54c014]
  - @memberjunction/core@2.95.0
  - @memberjunction/ai-agent-manager-actions@2.95.0
  - @memberjunction/ai-agents@2.95.0
  - @memberjunction/ai-core-plus@2.95.0
  - @memberjunction/aiengine@2.95.0
  - @memberjunction/ai-prompts@2.95.0
  - @memberjunction/ai-vectors-pinecone@2.95.0
  - @memberjunction/actions-apollo@2.95.0
  - @memberjunction/actions-bizapps-accounting@2.95.0
  - @memberjunction/actions-bizapps-crm@2.95.0
  - @memberjunction/actions-bizapps-lms@2.95.0
  - @memberjunction/actions-bizapps-social@2.95.0
  - @memberjunction/core-actions@2.95.0
  - @memberjunction/actions@2.95.0
  - @memberjunction/entity-communications-server@2.95.0
  - @memberjunction/doc-utils@2.95.0
  - @memberjunction/external-change-detection@2.95.0
  - @memberjunction/graphql-dataprovider@2.95.0
  - @memberjunction/core-entities@2.95.0
  - @memberjunction/core-entities-server@2.95.0
  - @memberjunction/data-context@2.95.0
  - @memberjunction/queue@2.95.0
  - @memberjunction/storage@2.95.0
  - @memberjunction/sqlserver-dataprovider@2.95.0
  - @memberjunction/skip-types@2.95.0
  - @memberjunction/templates@2.95.0
  - @memberjunction/data-context-server@2.95.0
  - @memberjunction/ai@2.95.0
  - @memberjunction/ai-anthropic@2.95.0
  - @memberjunction/ai-cerebras@2.95.0
  - @memberjunction/ai-groq@2.95.0
  - @memberjunction/ai-lmstudio@2.95.0
  - @memberjunction/ai-local-embeddings@2.95.0
  - @memberjunction/ai-mistral@2.95.0
  - @memberjunction/ai-ollama@2.95.0
  - @memberjunction/ai-openai@2.95.0
  - @memberjunction/ai-openrouter@2.95.0
  - @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/core-entities@2.94.0
- @memberjunction/skip-types@2.94.0
- @memberjunction/ai-agent-manager-actions@2.94.0
- @memberjunction/ai-agents@2.94.0
- @memberjunction/ai-core-plus@2.94.0
- @memberjunction/aiengine@2.94.0
- @memberjunction/ai-prompts@2.94.0
- @memberjunction/actions-apollo@2.94.0
- @memberjunction/actions-bizapps-accounting@2.94.0
- @memberjunction/actions-bizapps-lms@2.94.0
- @memberjunction/actions-bizapps-social@2.94.0
- @memberjunction/core-actions@2.94.0
- @memberjunction/actions@2.94.0
- @memberjunction/entity-communications-server@2.94.0
- @memberjunction/doc-utils@2.94.0
- @memberjunction/external-change-detection@2.94.0
- @memberjunction/graphql-dataprovider@2.94.0
- @memberjunction/core-entities-server@2.94.0
- @memberjunction/data-context@2.94.0
- @memberjunction/queue@2.94.0
- @memberjunction/storage@2.94.0
- @memberjunction/sqlserver-dataprovider@2.94.0
- @memberjunction/templates@2.94.0
- @memberjunction/ai-vectors-pinecone@2.94.0
- @memberjunction/actions-bizapps-crm@2.94.0
- @memberjunction/data-context-server@2.94.0
- @memberjunction/ai@2.94.0
- @memberjunction/ai-anthropic@2.94.0
- @memberjunction/ai-cerebras@2.94.0
- @memberjunction/ai-groq@2.94.0
- @memberjunction/ai-lmstudio@2.94.0
- @memberjunction/ai-local-embeddings@2.94.0
- @memberjunction/ai-mistral@2.94.0
- @memberjunction/ai-ollama@2.94.0
- @memberjunction/ai-openai@2.94.0
- @memberjunction/ai-openrouter@2.94.0
- @memberjunction/core@2.94.0
- @memberjunction/global@2.94.0

## 2.93.0

### Minor Changes

- d0eaee2: migration
- b15b3cf: migration

### Patch Changes

- bfcd737: Refactoring and new AI functionality
- 103e4a9: Added comprehensive tracking fields to AI execution entities:
  - **AIAgentRun**: Added `RunName`, `Comment`, and `ParentID` fields for better run identification and hierarchical tracking
  - **AIPromptRun**: Added `RunName`, `Comment`, and `ParentID` fields for consistent tracking across prompt executions
  - **AIAgentRunStep**: Added `Comment` and `ParentID` fields for detailed step-level tracking
  - **Flow Agent Type**: Added support for Chat message handling to properly bubble up messages from sub-agents to users
  - **Action Execution**: Enhanced action execution logging by capturing input data (action name and parameters) in step entities
  - **CodeGen SQL Execution**: Fixed QUOTED_IDENTIFIER issues by adding `-I` flag to sqlcmd execution (required for indexed views and computed columns)
  - **MetadataSync Push Service**: Improved error reporting with detailed context for field processing failures, lookup failures, and save errors
  - Database migration `V202508231445__v2.93.0` adds the new tracking fields with proper constraints and metadata
  - Updated all generated entity classes, GraphQL types, and Angular forms to support the new fields
  - Enhanced error diagnostics in push service to help identify root causes of sync failures

- Updated dependencies [f8757aa]
- Updated dependencies [bfcd737]
- Updated dependencies [103e4a9]
- Updated dependencies [7f465b5]
  - @memberjunction/core@2.93.0
  - @memberjunction/sqlserver-dataprovider@2.93.0
  - @memberjunction/graphql-dataprovider@2.93.0
  - @memberjunction/core-entities@2.93.0
  - @memberjunction/ai-agents@2.93.0
  - @memberjunction/ai-agent-manager-actions@2.93.0
  - @memberjunction/ai-core-plus@2.93.0
  - @memberjunction/aiengine@2.93.0
  - @memberjunction/ai-prompts@2.93.0
  - @memberjunction/ai-vectors-pinecone@2.93.0
  - @memberjunction/actions-apollo@2.93.0
  - @memberjunction/actions-bizapps-accounting@2.93.0
  - @memberjunction/actions-bizapps-crm@2.93.0
  - @memberjunction/actions-bizapps-lms@2.93.0
  - @memberjunction/actions-bizapps-social@2.93.0
  - @memberjunction/core-actions@2.93.0
  - @memberjunction/actions@2.93.0
  - @memberjunction/entity-communications-server@2.93.0
  - @memberjunction/doc-utils@2.93.0
  - @memberjunction/external-change-detection@2.93.0
  - @memberjunction/core-entities-server@2.93.0
  - @memberjunction/data-context@2.93.0
  - @memberjunction/queue@2.93.0
  - @memberjunction/storage@2.93.0
  - @memberjunction/skip-types@2.93.0
  - @memberjunction/templates@2.93.0
  - @memberjunction/data-context-server@2.93.0
  - @memberjunction/ai@2.93.0
  - @memberjunction/ai-anthropic@2.93.0
  - @memberjunction/ai-cerebras@2.93.0
  - @memberjunction/ai-groq@2.93.0
  - @memberjunction/ai-lmstudio@2.93.0
  - @memberjunction/ai-local-embeddings@2.93.0
  - @memberjunction/ai-mistral@2.93.0
  - @memberjunction/ai-ollama@2.93.0
  - @memberjunction/ai-openai@2.93.0
  - @memberjunction/ai-openrouter@2.93.0
  - @memberjunction/global@2.93.0

## 2.92.0

### Patch Changes

- Updated dependencies [5161d9f]
- Updated dependencies [8fb03df]
- Updated dependencies [5817bac]
  - @memberjunction/ai-local-embeddings@2.92.0
  - @memberjunction/core@2.92.0
  - @memberjunction/sqlserver-dataprovider@2.92.0
  - @memberjunction/core-entities@2.92.0
  - @memberjunction/skip-types@2.92.0
  - @memberjunction/core-entities-server@2.92.0
  - @memberjunction/ai-agent-manager-actions@2.92.0
  - @memberjunction/ai-agents@2.92.0
  - @memberjunction/ai-core-plus@2.92.0
  - @memberjunction/aiengine@2.92.0
  - @memberjunction/ai-prompts@2.92.0
  - @memberjunction/ai-vectors-pinecone@2.92.0
  - @memberjunction/actions-apollo@2.92.0
  - @memberjunction/actions-bizapps-accounting@2.92.0
  - @memberjunction/actions-bizapps-crm@2.92.0
  - @memberjunction/actions-bizapps-lms@2.92.0
  - @memberjunction/actions-bizapps-social@2.92.0
  - @memberjunction/core-actions@2.92.0
  - @memberjunction/actions@2.92.0
  - @memberjunction/entity-communications-server@2.92.0
  - @memberjunction/doc-utils@2.92.0
  - @memberjunction/external-change-detection@2.92.0
  - @memberjunction/graphql-dataprovider@2.92.0
  - @memberjunction/data-context@2.92.0
  - @memberjunction/queue@2.92.0
  - @memberjunction/storage@2.92.0
  - @memberjunction/templates@2.92.0
  - @memberjunction/data-context-server@2.92.0
  - @memberjunction/ai@2.92.0
  - @memberjunction/ai-anthropic@2.92.0
  - @memberjunction/ai-cerebras@2.92.0
  - @memberjunction/ai-groq@2.92.0
  - @memberjunction/ai-lmstudio@2.92.0
  - @memberjunction/ai-mistral@2.92.0
  - @memberjunction/ai-ollama@2.92.0
  - @memberjunction/ai-openai@2.92.0
  - @memberjunction/ai-openrouter@2.92.0
  - @memberjunction/global@2.92.0

## 2.91.0

### Minor Changes

- f703033: Implement extensible N-provider authentication architecture
  - Created shared authentication types in @memberjunction/core for use
    across frontend and backend
  - Refactored authentication to support multiple providers using MJGlobal
    ClassFactory pattern
  - Implemented dynamic provider discovery and registration without
    modifying core code
  - Added support for multiple concurrent auth providers via authProviders
    array configuration
  - Replaced static method with cleaner property pattern for Angular
    provider dependencies
  - Eliminated code duplication and removed unused configuration methods
  - Maintained full backward compatibility with existing auth
    implementations

  This enables teams to add custom authentication providers (SAML,
  proprietary SSO, etc.)
  without forking or modifying the core authentication modules.

- 6476d74: migrations

### Patch Changes

- 6891a01: Pass StartRow parameter through RunView resolver chain for pagination.
- Updated dependencies [f703033]
- Updated dependencies [6476d74]
  - @memberjunction/core@2.91.0
  - @memberjunction/ai-local-embeddings@2.91.0
  - @memberjunction/core-entities@2.91.0
  - @memberjunction/core-entities-server@2.91.0
  - @memberjunction/ai-agent-manager-actions@2.91.0
  - @memberjunction/ai-agents@2.91.0
  - @memberjunction/ai-core-plus@2.91.0
  - @memberjunction/aiengine@2.91.0
  - @memberjunction/ai-prompts@2.91.0
  - @memberjunction/ai-vectors-pinecone@2.91.0
  - @memberjunction/actions-apollo@2.91.0
  - @memberjunction/actions-bizapps-accounting@2.91.0
  - @memberjunction/actions-bizapps-crm@2.91.0
  - @memberjunction/actions-bizapps-lms@2.91.0
  - @memberjunction/actions-bizapps-social@2.91.0
  - @memberjunction/core-actions@2.91.0
  - @memberjunction/actions@2.91.0
  - @memberjunction/entity-communications-server@2.91.0
  - @memberjunction/doc-utils@2.91.0
  - @memberjunction/external-change-detection@2.91.0
  - @memberjunction/graphql-dataprovider@2.91.0
  - @memberjunction/data-context@2.91.0
  - @memberjunction/queue@2.91.0
  - @memberjunction/storage@2.91.0
  - @memberjunction/sqlserver-dataprovider@2.91.0
  - @memberjunction/skip-types@2.91.0
  - @memberjunction/templates@2.91.0
  - @memberjunction/data-context-server@2.91.0
  - @memberjunction/ai@2.91.0
  - @memberjunction/ai-anthropic@2.91.0
  - @memberjunction/ai-cerebras@2.91.0
  - @memberjunction/ai-groq@2.91.0
  - @memberjunction/ai-lmstudio@2.91.0
  - @memberjunction/ai-mistral@2.91.0
  - @memberjunction/ai-ollama@2.91.0
  - @memberjunction/ai-openai@2.91.0
  - @memberjunction/ai-openrouter@2.91.0
  - @memberjunction/global@2.91.0

## 2.90.0

### Patch Changes

- Updated dependencies [146ebcc]
- Updated dependencies [d5d26d7]
- Updated dependencies [1e7eb76]
  - @memberjunction/aiengine@2.90.0
  - @memberjunction/core@2.90.0
  - @memberjunction/core-entities@2.90.0
  - @memberjunction/core-entities-server@2.90.0
  - @memberjunction/skip-types@2.90.0
  - @memberjunction/ai-agents@2.90.0
  - @memberjunction/ai-prompts@2.90.0
  - @memberjunction/ai-vectors-pinecone@2.90.0
  - @memberjunction/actions@2.90.0
  - @memberjunction/queue@2.90.0
  - @memberjunction/sqlserver-dataprovider@2.90.0
  - @memberjunction/templates@2.90.0
  - @memberjunction/ai-agent-manager-actions@2.90.0
  - @memberjunction/ai-core-plus@2.90.0
  - @memberjunction/actions-apollo@2.90.0
  - @memberjunction/actions-bizapps-accounting@2.90.0
  - @memberjunction/actions-bizapps-crm@2.90.0
  - @memberjunction/actions-bizapps-lms@2.90.0
  - @memberjunction/actions-bizapps-social@2.90.0
  - @memberjunction/core-actions@2.90.0
  - @memberjunction/entity-communications-server@2.90.0
  - @memberjunction/doc-utils@2.90.0
  - @memberjunction/external-change-detection@2.90.0
  - @memberjunction/graphql-dataprovider@2.90.0
  - @memberjunction/data-context@2.90.0
  - @memberjunction/storage@2.90.0
  - @memberjunction/data-context-server@2.90.0
  - @memberjunction/ai@2.90.0
  - @memberjunction/ai-anthropic@2.90.0
  - @memberjunction/ai-cerebras@2.90.0
  - @memberjunction/ai-groq@2.90.0
  - @memberjunction/ai-lmstudio@2.90.0
  - @memberjunction/ai-local-embeddings@2.90.0
  - @memberjunction/ai-mistral@2.90.0
  - @memberjunction/ai-ollama@2.90.0
  - @memberjunction/ai-openai@2.90.0
  - @memberjunction/ai-openrouter@2.90.0
  - @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- 34d456e: Patch issues with GraphQLClientUser creating and running queries.
- 604ef0c: tweaks to mutation/graphql client
- Updated dependencies [d1911ed]
- Updated dependencies [34d456e]
- Updated dependencies [604ef0c]
  - @memberjunction/ai-core-plus@2.89.0
  - @memberjunction/core-entities@2.89.0
  - @memberjunction/sqlserver-dataprovider@2.89.0
  - @memberjunction/graphql-dataprovider@2.89.0
  - @memberjunction/ai-agents@2.89.0
  - @memberjunction/aiengine@2.89.0
  - @memberjunction/ai-prompts@2.89.0
  - @memberjunction/core-actions@2.89.0
  - @memberjunction/actions@2.89.0
  - @memberjunction/core-entities-server@2.89.0
  - @memberjunction/ai-agent-manager-actions@2.89.0
  - @memberjunction/actions-apollo@2.89.0
  - @memberjunction/actions-bizapps-accounting@2.89.0
  - @memberjunction/actions-bizapps-lms@2.89.0
  - @memberjunction/actions-bizapps-social@2.89.0
  - @memberjunction/entity-communications-server@2.89.0
  - @memberjunction/doc-utils@2.89.0
  - @memberjunction/external-change-detection@2.89.0
  - @memberjunction/data-context@2.89.0
  - @memberjunction/queue@2.89.0
  - @memberjunction/storage@2.89.0
  - @memberjunction/templates@2.89.0
  - @memberjunction/ai-vectors-pinecone@2.89.0
  - @memberjunction/actions-bizapps-crm@2.89.0
  - @memberjunction/data-context-server@2.89.0
  - @memberjunction/skip-types@2.89.0
  - @memberjunction/ai@2.89.0
  - @memberjunction/ai-anthropic@2.89.0
  - @memberjunction/ai-cerebras@2.89.0
  - @memberjunction/ai-groq@2.89.0
  - @memberjunction/ai-lmstudio@2.89.0
  - @memberjunction/ai-local-embeddings@2.89.0
  - @memberjunction/ai-mistral@2.89.0
  - @memberjunction/ai-ollama@2.89.0
  - @memberjunction/ai-openai@2.89.0
  - @memberjunction/ai-openrouter@2.89.0
  - @memberjunction/core@2.89.0
  - @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- 56257ed: Fix RunView pagination implementation
  - Added StartRow parameter support for server-side pagination
  - Fixed SQL generation to prevent TOP and OFFSET/FETCH conflicts
  - Improved total row count calculation for paginated queries
  - Ensures proper parameter passing through GraphQL to SQL layer

  Fixes issue where pagination parameters were lost in the RunView processing chain, preventing proper
  server-side pagination from working.

- Updated dependencies [56257ed]
- Updated dependencies [df4031f]
  - @memberjunction/sqlserver-dataprovider@2.88.0
  - @memberjunction/graphql-dataprovider@2.88.0
  - @memberjunction/core-entities@2.88.0
  - @memberjunction/external-change-detection@2.88.0
  - @memberjunction/core-entities-server@2.88.0
  - @memberjunction/ai-agent-manager-actions@2.88.0
  - @memberjunction/ai-agents@2.88.0
  - @memberjunction/ai-core-plus@2.88.0
  - @memberjunction/aiengine@2.88.0
  - @memberjunction/ai-prompts@2.88.0
  - @memberjunction/actions-apollo@2.88.0
  - @memberjunction/actions-bizapps-accounting@2.88.0
  - @memberjunction/actions-bizapps-lms@2.88.0
  - @memberjunction/actions-bizapps-social@2.88.0
  - @memberjunction/core-actions@2.88.0
  - @memberjunction/actions@2.88.0
  - @memberjunction/entity-communications-server@2.88.0
  - @memberjunction/doc-utils@2.88.0
  - @memberjunction/data-context@2.88.0
  - @memberjunction/queue@2.88.0
  - @memberjunction/storage@2.88.0
  - @memberjunction/templates@2.88.0
  - @memberjunction/ai-vectors-pinecone@2.88.0
  - @memberjunction/actions-bizapps-crm@2.88.0
  - @memberjunction/data-context-server@2.88.0
  - @memberjunction/skip-types@2.88.0
  - @memberjunction/ai@2.88.0
  - @memberjunction/ai-anthropic@2.88.0
  - @memberjunction/ai-cerebras@2.88.0
  - @memberjunction/ai-groq@2.88.0
  - @memberjunction/ai-lmstudio@2.88.0
  - @memberjunction/ai-local-embeddings@2.88.0
  - @memberjunction/ai-mistral@2.88.0
  - @memberjunction/ai-ollama@2.88.0
  - @memberjunction/ai-openai@2.88.0
  - @memberjunction/ai-openrouter@2.88.0
  - @memberjunction/core@2.88.0
  - @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- Updated dependencies [58a00df]
  - @memberjunction/core@2.87.0
  - @memberjunction/ai-agent-manager-actions@2.87.0
  - @memberjunction/ai-agents@2.87.0
  - @memberjunction/ai-core-plus@2.87.0
  - @memberjunction/aiengine@2.87.0
  - @memberjunction/ai-prompts@2.87.0
  - @memberjunction/ai-vectors-pinecone@2.87.0
  - @memberjunction/actions-apollo@2.87.0
  - @memberjunction/actions-bizapps-accounting@2.87.0
  - @memberjunction/actions-bizapps-crm@2.87.0
  - @memberjunction/actions-bizapps-lms@2.87.0
  - @memberjunction/actions-bizapps-social@2.87.0
  - @memberjunction/core-actions@2.87.0
  - @memberjunction/actions@2.87.0
  - @memberjunction/entity-communications-server@2.87.0
  - @memberjunction/doc-utils@2.87.0
  - @memberjunction/external-change-detection@2.87.0
  - @memberjunction/graphql-dataprovider@2.87.0
  - @memberjunction/core-entities@2.87.0
  - @memberjunction/core-entities-server@2.87.0
  - @memberjunction/data-context@2.87.0
  - @memberjunction/queue@2.87.0
  - @memberjunction/storage@2.87.0
  - @memberjunction/sqlserver-dataprovider@2.87.0
  - @memberjunction/skip-types@2.87.0
  - @memberjunction/templates@2.87.0
  - @memberjunction/data-context-server@2.87.0
  - @memberjunction/ai@2.87.0
  - @memberjunction/ai-anthropic@2.87.0
  - @memberjunction/ai-cerebras@2.87.0
  - @memberjunction/ai-groq@2.87.0
  - @memberjunction/ai-lmstudio@2.87.0
  - @memberjunction/ai-local-embeddings@2.87.0
  - @memberjunction/ai-mistral@2.87.0
  - @memberjunction/ai-ollama@2.87.0
  - @memberjunction/ai-openai@2.87.0
  - @memberjunction/ai-openrouter@2.87.0
  - @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- 8846ccc: Add SkipQueryEntityInfo type to track entity-query relationships
  - Added new SkipQueryEntityInfo type to represent entities referenced by queries
  - Includes detection method tracking (AI vs Manual) and confidence scores
  - Updated SkipQueryInfo to include optional entities array
  - Implemented population of entities in AskSkipResolver's BuildSkipQueries method
  - Helps Skip better understand which entities are involved in each query

- Updated dependencies [8846ccc]
- Updated dependencies [7dd2409]
  - @memberjunction/skip-types@2.86.0
  - @memberjunction/core-entities@2.86.0
  - @memberjunction/core-entities-server@2.86.0
  - @memberjunction/ai-agent-manager-actions@2.86.0
  - @memberjunction/ai-agents@2.86.0
  - @memberjunction/ai-core-plus@2.86.0
  - @memberjunction/aiengine@2.86.0
  - @memberjunction/ai-prompts@2.86.0
  - @memberjunction/actions-apollo@2.86.0
  - @memberjunction/actions-bizapps-accounting@2.86.0
  - @memberjunction/actions-bizapps-lms@2.86.0
  - @memberjunction/actions-bizapps-social@2.86.0
  - @memberjunction/core-actions@2.86.0
  - @memberjunction/actions@2.86.0
  - @memberjunction/entity-communications-server@2.86.0
  - @memberjunction/doc-utils@2.86.0
  - @memberjunction/external-change-detection@2.86.0
  - @memberjunction/graphql-dataprovider@2.86.0
  - @memberjunction/data-context@2.86.0
  - @memberjunction/queue@2.86.0
  - @memberjunction/storage@2.86.0
  - @memberjunction/sqlserver-dataprovider@2.86.0
  - @memberjunction/templates@2.86.0
  - @memberjunction/ai-vectors-pinecone@2.86.0
  - @memberjunction/actions-bizapps-crm@2.86.0
  - @memberjunction/data-context-server@2.86.0
  - @memberjunction/ai@2.86.0
  - @memberjunction/ai-anthropic@2.86.0
  - @memberjunction/ai-cerebras@2.86.0
  - @memberjunction/ai-groq@2.86.0
  - @memberjunction/ai-lmstudio@2.86.0
  - @memberjunction/ai-local-embeddings@2.86.0
  - @memberjunction/ai-mistral@2.86.0
  - @memberjunction/ai-ollama@2.86.0
  - @memberjunction/ai-openai@2.86.0
  - @memberjunction/ai-openrouter@2.86.0
  - @memberjunction/core@2.86.0
  - @memberjunction/global@2.86.0

## 2.85.0

### Minor Changes

- a96c1a7: migration

### Patch Changes

- Updated dependencies [a96c1a7]
- Updated dependencies [747455a]
  - @memberjunction/ai@2.85.0
  - @memberjunction/ai-lmstudio@2.85.0
  - @memberjunction/ai-ollama@2.85.0
  - @memberjunction/core-entities@2.85.0
  - @memberjunction/skip-types@2.85.0
  - @memberjunction/ai-agents@2.85.0
  - @memberjunction/ai-core-plus@2.85.0
  - @memberjunction/aiengine@2.85.0
  - @memberjunction/ai-prompts@2.85.0
  - @memberjunction/ai-anthropic@2.85.0
  - @memberjunction/ai-cerebras@2.85.0
  - @memberjunction/ai-groq@2.85.0
  - @memberjunction/ai-local-embeddings@2.85.0
  - @memberjunction/ai-mistral@2.85.0
  - @memberjunction/ai-openai@2.85.0
  - @memberjunction/ai-openrouter@2.85.0
  - @memberjunction/actions@2.85.0
  - @memberjunction/queue@2.85.0
  - @memberjunction/sqlserver-dataprovider@2.85.0
  - @memberjunction/templates@2.85.0
  - @memberjunction/ai-agent-manager-actions@2.85.0
  - @memberjunction/actions-apollo@2.85.0
  - @memberjunction/actions-bizapps-accounting@2.85.0
  - @memberjunction/actions-bizapps-lms@2.85.0
  - @memberjunction/actions-bizapps-social@2.85.0
  - @memberjunction/core-actions@2.85.0
  - @memberjunction/entity-communications-server@2.85.0
  - @memberjunction/doc-utils@2.85.0
  - @memberjunction/external-change-detection@2.85.0
  - @memberjunction/graphql-dataprovider@2.85.0
  - @memberjunction/core-entities-server@2.85.0
  - @memberjunction/data-context@2.85.0
  - @memberjunction/storage@2.85.0
  - @memberjunction/ai-vectors-pinecone@2.85.0
  - @memberjunction/actions-bizapps-crm@2.85.0
  - @memberjunction/data-context-server@2.85.0
  - @memberjunction/core@2.85.0
  - @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- Updated dependencies [75badca]
- Updated dependencies [0b9d691]
- Updated dependencies [25e3697]
  - @memberjunction/ai-openai@2.84.0
  - @memberjunction/graphql-dataprovider@2.84.0
  - @memberjunction/core@2.84.0
  - @memberjunction/sqlserver-dataprovider@2.84.0
  - @memberjunction/ai-agent-manager-actions@2.84.0
  - @memberjunction/ai-agents@2.84.0
  - @memberjunction/ai-core-plus@2.84.0
  - @memberjunction/aiengine@2.84.0
  - @memberjunction/ai-prompts@2.84.0
  - @memberjunction/ai-vectors-pinecone@2.84.0
  - @memberjunction/actions-apollo@2.84.0
  - @memberjunction/actions-bizapps-accounting@2.84.0
  - @memberjunction/actions-bizapps-crm@2.84.0
  - @memberjunction/actions-bizapps-lms@2.84.0
  - @memberjunction/actions-bizapps-social@2.84.0
  - @memberjunction/core-actions@2.84.0
  - @memberjunction/actions@2.84.0
  - @memberjunction/entity-communications-server@2.84.0
  - @memberjunction/doc-utils@2.84.0
  - @memberjunction/external-change-detection@2.84.0
  - @memberjunction/core-entities@2.84.0
  - @memberjunction/core-entities-server@2.84.0
  - @memberjunction/data-context@2.84.0
  - @memberjunction/queue@2.84.0
  - @memberjunction/storage@2.84.0
  - @memberjunction/skip-types@2.84.0
  - @memberjunction/templates@2.84.0
  - @memberjunction/data-context-server@2.84.0
  - @memberjunction/ai@2.84.0
  - @memberjunction/ai-anthropic@2.84.0
  - @memberjunction/ai-cerebras@2.84.0
  - @memberjunction/ai-groq@2.84.0
  - @memberjunction/ai-mistral@2.84.0
  - @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- Updated dependencies [e2e0415]
- Updated dependencies [1dc69bf]
- Updated dependencies [1eebeda]
  - @memberjunction/core@2.83.0
  - @memberjunction/ai-agents@2.83.0
  - @memberjunction/aiengine@2.83.0
  - @memberjunction/ai-groq@2.83.0
  - @memberjunction/ai-agent-manager-actions@2.83.0
  - @memberjunction/ai-core-plus@2.83.0
  - @memberjunction/ai-prompts@2.83.0
  - @memberjunction/ai-vectors-pinecone@2.83.0
  - @memberjunction/actions-apollo@2.83.0
  - @memberjunction/actions-bizapps-accounting@2.83.0
  - @memberjunction/actions-bizapps-crm@2.83.0
  - @memberjunction/actions-bizapps-lms@2.83.0
  - @memberjunction/actions-bizapps-social@2.83.0
  - @memberjunction/core-actions@2.83.0
  - @memberjunction/actions@2.83.0
  - @memberjunction/entity-communications-server@2.83.0
  - @memberjunction/doc-utils@2.83.0
  - @memberjunction/external-change-detection@2.83.0
  - @memberjunction/graphql-dataprovider@2.83.0
  - @memberjunction/core-entities@2.83.0
  - @memberjunction/core-entities-server@2.83.0
  - @memberjunction/data-context@2.83.0
  - @memberjunction/queue@2.83.0
  - @memberjunction/storage@2.83.0
  - @memberjunction/sqlserver-dataprovider@2.83.0
  - @memberjunction/skip-types@2.83.0
  - @memberjunction/templates@2.83.0
  - @memberjunction/data-context-server@2.83.0
  - @memberjunction/ai@2.83.0
  - @memberjunction/ai-anthropic@2.83.0
  - @memberjunction/ai-cerebras@2.83.0
  - @memberjunction/ai-mistral@2.83.0
  - @memberjunction/ai-openai@2.83.0
  - @memberjunction/global@2.83.0

## 2.82.0

### Patch Changes

- c35f869: Fix: Remove non-existent ComputationEnabled field from Query operations
  - Removed ComputationEnabled field from GraphQL mutations (CreateQuerySystemUser and UpdateQuerySystemUser) in GraphQLSystemUserClient
  - Removed ComputationEnabled from QueryField TypeScript interface
  - Fixed CreateQueryResolver to not set ComputationEnabled when mapping query fields
  - This fixes GraphQL validation errors when creating or updating queries

- Updated dependencies [c35f869]
- Updated dependencies [2186d7b]
- Updated dependencies [975e8d1]
  - @memberjunction/graphql-dataprovider@2.82.0
  - @memberjunction/core-entities@2.82.0
  - @memberjunction/ai-agents@2.82.0
  - @memberjunction/ai-core-plus@2.82.0
  - @memberjunction/ai-prompts@2.82.0
  - @memberjunction/core-entities-server@2.82.0
  - @memberjunction/ai-agent-manager-actions@2.82.0
  - @memberjunction/aiengine@2.82.0
  - @memberjunction/actions-apollo@2.82.0
  - @memberjunction/actions-bizapps-accounting@2.82.0
  - @memberjunction/actions-bizapps-lms@2.82.0
  - @memberjunction/actions-bizapps-social@2.82.0
  - @memberjunction/core-actions@2.82.0
  - @memberjunction/actions@2.82.0
  - @memberjunction/entity-communications-server@2.82.0
  - @memberjunction/doc-utils@2.82.0
  - @memberjunction/external-change-detection@2.82.0
  - @memberjunction/data-context@2.82.0
  - @memberjunction/queue@2.82.0
  - @memberjunction/storage@2.82.0
  - @memberjunction/sqlserver-dataprovider@2.82.0
  - @memberjunction/templates@2.82.0
  - @memberjunction/ai-vectors-pinecone@2.82.0
  - @memberjunction/actions-bizapps-crm@2.82.0
  - @memberjunction/data-context-server@2.82.0
  - @memberjunction/skip-types@2.82.0
  - @memberjunction/ai@2.82.0
  - @memberjunction/ai-anthropic@2.82.0
  - @memberjunction/ai-cerebras@2.82.0
  - @memberjunction/ai-groq@2.82.0
  - @memberjunction/ai-mistral@2.82.0
  - @memberjunction/ai-openai@2.82.0
  - @memberjunction/core@2.82.0
  - @memberjunction/global@2.82.0

## 2.81.0

### Minor Changes

- 971c5d4: feat: implement query audit logging and TTL-based caching

  Add comprehensive audit logging and caching capabilities to the
  MemberJunction Query system:
  - Add ForceAuditLog and AuditLogDescription parameters to RunQuery for
    granular audit control
  - Implement TTL-based result caching with LRU eviction strategy for
    improved performance
  - Add cache configuration columns to Query and QueryCategory entities
  - Support category-level cache configuration inheritance
  - Update GraphQL resolvers to handle new audit and cache fields
  - Refactor RunQuery method into logical helper methods for better
    maintainability
  - Follow established RunView pattern for fire-and-forget audit logging

### Patch Changes

- 6d2d478: feat: AI Agent UI improvements and server-side context fixes
  - Enhanced AI Agent dialogs with resizable and draggable functionality
    using Kendo UI Window component
  - Improved dialog positioning with consistent center placement and proper
    container context
  - Fixed prompt selector in AI Agent form for better user experience
  - Added missing contextUser parameter to GetEntityObject calls in
    BaseResolver for proper multi-user isolation
  - Fixed createRecordAccessAuditLogRecord calls in generated resolvers to
    include provider argument
  - Added JSDoc documentation to ViewInfo class properties for better code
    documentation
  - Applied consistent dialog styling across all AI Agent management
    components

- Updated dependencies [42a6954]
- Updated dependencies [6d2d478]
- Updated dependencies [e623f99]
- Updated dependencies [971c5d4]
  - @memberjunction/ai-agents@2.81.0
  - @memberjunction/core-actions@2.81.0
  - @memberjunction/core@2.81.0
  - @memberjunction/core-entities@2.81.0
  - @memberjunction/core-entities-server@2.81.0
  - @memberjunction/sqlserver-dataprovider@2.81.0
  - @memberjunction/ai-agent-manager-actions@2.81.0
  - @memberjunction/ai-core-plus@2.81.0
  - @memberjunction/aiengine@2.81.0
  - @memberjunction/ai-prompts@2.81.0
  - @memberjunction/ai-vectors-pinecone@2.81.0
  - @memberjunction/actions-apollo@2.81.0
  - @memberjunction/actions-bizapps-accounting@2.81.0
  - @memberjunction/actions-bizapps-crm@2.81.0
  - @memberjunction/actions-bizapps-lms@2.81.0
  - @memberjunction/actions-bizapps-social@2.81.0
  - @memberjunction/actions@2.81.0
  - @memberjunction/entity-communications-server@2.81.0
  - @memberjunction/doc-utils@2.81.0
  - @memberjunction/external-change-detection@2.81.0
  - @memberjunction/graphql-dataprovider@2.81.0
  - @memberjunction/data-context@2.81.0
  - @memberjunction/queue@2.81.0
  - @memberjunction/storage@2.81.0
  - @memberjunction/skip-types@2.81.0
  - @memberjunction/templates@2.81.0
  - @memberjunction/data-context-server@2.81.0
  - @memberjunction/ai@2.81.0
  - @memberjunction/ai-anthropic@2.81.0
  - @memberjunction/ai-cerebras@2.81.0
  - @memberjunction/ai-groq@2.81.0
  - @memberjunction/ai-mistral@2.81.0
  - @memberjunction/ai-openai@2.81.0
  - @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- f049852: Add imports and dependency from @memberjunction/apollo-actions to MJServer
  - @memberjunction/ai-agent-manager-actions@2.80.1
  - @memberjunction/ai-agents@2.80.1
  - @memberjunction/ai@2.80.1
  - @memberjunction/ai-core-plus@2.80.1
  - @memberjunction/aiengine@2.80.1
  - @memberjunction/ai-prompts@2.80.1
  - @memberjunction/ai-anthropic@2.80.1
  - @memberjunction/ai-cerebras@2.80.1
  - @memberjunction/ai-groq@2.80.1
  - @memberjunction/ai-mistral@2.80.1
  - @memberjunction/ai-openai@2.80.1
  - @memberjunction/ai-vectors-pinecone@2.80.1
  - @memberjunction/actions-apollo@2.80.1
  - @memberjunction/actions-bizapps-accounting@2.80.1
  - @memberjunction/actions-bizapps-crm@2.80.1
  - @memberjunction/actions-bizapps-lms@2.80.1
  - @memberjunction/actions-bizapps-social@2.80.1
  - @memberjunction/core-actions@2.80.1
  - @memberjunction/actions@2.80.1
  - @memberjunction/entity-communications-server@2.80.1
  - @memberjunction/doc-utils@2.80.1
  - @memberjunction/external-change-detection@2.80.1
  - @memberjunction/graphql-dataprovider@2.80.1
  - @memberjunction/core@2.80.1
  - @memberjunction/core-entities@2.80.1
  - @memberjunction/core-entities-server@2.80.1
  - @memberjunction/data-context@2.80.1
  - @memberjunction/data-context-server@2.80.1
  - @memberjunction/global@2.80.1
  - @memberjunction/queue@2.80.1
  - @memberjunction/storage@2.80.1
  - @memberjunction/sqlserver-dataprovider@2.80.1
  - @memberjunction/skip-types@2.80.1
  - @memberjunction/templates@2.80.1

## 2.80.0

### Patch Changes

- 44a749c: updated system client
- Updated dependencies [3073dc3]
- Updated dependencies [7c5f844]
- Updated dependencies [44a749c]
- Updated dependencies [d03dfae]
  - @memberjunction/core-entities-server@2.80.0
  - @memberjunction/graphql-dataprovider@2.80.0
  - @memberjunction/core@2.80.0
  - @memberjunction/core-entities@2.80.0
  - @memberjunction/sqlserver-dataprovider@2.80.0
  - @memberjunction/core-actions@2.80.0
  - @memberjunction/ai-agent-manager-actions@2.80.0
  - @memberjunction/ai-agents@2.80.0
  - @memberjunction/ai-core-plus@2.80.0
  - @memberjunction/aiengine@2.80.0
  - @memberjunction/ai-prompts@2.80.0
  - @memberjunction/ai-vectors-pinecone@2.80.0
  - @memberjunction/actions-bizapps-accounting@2.80.0
  - @memberjunction/actions-bizapps-crm@2.80.0
  - @memberjunction/actions-bizapps-lms@2.80.0
  - @memberjunction/actions-bizapps-social@2.80.0
  - @memberjunction/actions@2.80.0
  - @memberjunction/entity-communications-server@2.80.0
  - @memberjunction/doc-utils@2.80.0
  - @memberjunction/external-change-detection@2.80.0
  - @memberjunction/data-context@2.80.0
  - @memberjunction/queue@2.80.0
  - @memberjunction/storage@2.80.0
  - @memberjunction/skip-types@2.80.0
  - @memberjunction/templates@2.80.0
  - @memberjunction/data-context-server@2.80.0
  - @memberjunction/ai@2.80.0
  - @memberjunction/ai-anthropic@2.80.0
  - @memberjunction/ai-cerebras@2.80.0
  - @memberjunction/ai-groq@2.80.0
  - @memberjunction/ai-mistral@2.80.0
  - @memberjunction/ai-openai@2.80.0
  - @memberjunction/global@2.80.0

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
