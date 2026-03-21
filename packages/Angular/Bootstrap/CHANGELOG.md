# @memberjunction/ng-bootstrap

## 5.14.0

### Patch Changes

- Updated dependencies [8fe1124]
- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/ng-auth-services@5.14.0
  - @memberjunction/core@5.14.0
  - @memberjunction/graphql-dataprovider@5.14.0
  - @memberjunction/actions-base@5.14.0
  - @memberjunction/ng-explorer-core@5.14.0
  - @memberjunction/ai-engine-base@5.14.0
  - @memberjunction/ai-core-plus@5.14.0
  - @memberjunction/ng-core-entity-forms@5.14.0
  - @memberjunction/ng-dashboards@5.14.0
  - @memberjunction/ng-explorer-settings@5.14.0
  - @memberjunction/ng-shared@5.14.0
  - @memberjunction/ng-artifacts@5.14.0
  - @memberjunction/ng-dashboard-viewer@5.14.0
  - @memberjunction/ng-file-storage@5.14.0
  - @memberjunction/communication-types@5.14.0
  - @memberjunction/entity-communications-base@5.14.0
  - @memberjunction/core-entities@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [1bb9b86]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/ng-core-entity-forms@5.13.0
  - @memberjunction/ng-explorer-core@5.13.0
  - @memberjunction/ng-dashboards@5.13.0
  - @memberjunction/ai-engine-base@5.13.0
  - @memberjunction/ai-core-plus@5.13.0
  - @memberjunction/actions-base@5.13.0
  - @memberjunction/ng-auth-services@5.13.0
  - @memberjunction/ng-explorer-settings@5.13.0
  - @memberjunction/ng-shared@5.13.0
  - @memberjunction/ng-artifacts@5.13.0
  - @memberjunction/ng-dashboard-viewer@5.13.0
  - @memberjunction/ng-file-storage@5.13.0
  - @memberjunction/communication-types@5.13.0
  - @memberjunction/entity-communications-base@5.13.0
  - @memberjunction/graphql-dataprovider@5.13.0
  - @memberjunction/core-entities@5.13.0

## 5.12.0

### Minor Changes

- 1e5d181: migration

### Patch Changes

- a57b8d5: Migrate all hardcoded CSS colors to design tokens for dark mode and white-label support. Introduces `--mj-*` semantic CSS custom properties in `_tokens.scss` with full `[data-theme="dark"]` overrides. Migrates 1,544 of 1,659 hardcoded hex values (93%) across 72+ CSS files to semantic tokens. Adds logo token system (`--mj-logo-mark`, `--mj-logo-color`) for themeable branding. Fixes dark mode theming for CodeMirror, AG Grid v35, and Kendo popups. No API or behavioral changes — CSS only.
- e87d153: design tokens phase 1
- 7def002: Fix ExternalChangeDetection unquoted string IDs and log spam, add /healthcheck endpoint before auth middleware, return TechnicalDescription in CreateQuery/UpdateQuery mutations, and improve MJCLI config validation errors with env var hints
- Updated dependencies [05f19ff]
- Updated dependencies [a57b8d5]
- Updated dependencies [e87d153]
- Updated dependencies [7def002]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/ng-artifacts@5.12.0
  - @memberjunction/ng-core-entity-forms@5.12.0
  - @memberjunction/ng-dashboards@5.12.0
  - @memberjunction/ng-explorer-core@5.12.0
  - @memberjunction/ng-explorer-settings@5.12.0
  - @memberjunction/ng-dashboard-viewer@5.12.0
  - @memberjunction/ng-file-storage@5.12.0
  - @memberjunction/graphql-dataprovider@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ai-engine-base@5.12.0
  - @memberjunction/ai-core-plus@5.12.0
  - @memberjunction/actions-base@5.12.0
  - @memberjunction/ng-auth-services@5.12.0
  - @memberjunction/ng-shared@5.12.0
  - @memberjunction/communication-types@5.12.0
  - @memberjunction/entity-communications-base@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
- Updated dependencies [fc2bd47]
- Updated dependencies [457afcf]
  - @memberjunction/graphql-dataprovider@5.11.0
  - @memberjunction/core@5.11.0
  - @memberjunction/ng-explorer-core@5.11.0
  - @memberjunction/ng-core-entity-forms@5.11.0
  - @memberjunction/ng-dashboards@5.11.0
  - @memberjunction/ng-artifacts@5.11.0
  - @memberjunction/ng-dashboard-viewer@5.11.0
  - @memberjunction/ng-explorer-settings@5.11.0
  - @memberjunction/ng-shared@5.11.0
  - @memberjunction/ng-file-storage@5.11.0
  - @memberjunction/ai-engine-base@5.11.0
  - @memberjunction/ai-core-plus@5.11.0
  - @memberjunction/actions-base@5.11.0
  - @memberjunction/ng-auth-services@5.11.0
  - @memberjunction/communication-types@5.11.0
  - @memberjunction/entity-communications-base@5.11.0
  - @memberjunction/core-entities@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ai-engine-base@5.10.1
- @memberjunction/ai-core-plus@5.10.1
- @memberjunction/actions-base@5.10.1
- @memberjunction/ng-auth-services@5.10.1
- @memberjunction/ng-core-entity-forms@5.10.1
- @memberjunction/ng-dashboards@5.10.1
- @memberjunction/ng-explorer-core@5.10.1
- @memberjunction/ng-explorer-settings@5.10.1
- @memberjunction/ng-shared@5.10.1
- @memberjunction/ng-artifacts@5.10.1
- @memberjunction/ng-dashboard-viewer@5.10.1
- @memberjunction/ng-file-storage@5.10.1
- @memberjunction/communication-types@5.10.1
- @memberjunction/entity-communications-base@5.10.1
- @memberjunction/graphql-dataprovider@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [3df5e4b]
- Updated dependencies [4e298b7]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/ng-core-entity-forms@5.10.0
  - @memberjunction/ng-dashboards@5.10.0
  - @memberjunction/graphql-dataprovider@5.10.0
  - @memberjunction/ai-engine-base@5.10.0
  - @memberjunction/ai-core-plus@5.10.0
  - @memberjunction/actions-base@5.10.0
  - @memberjunction/ng-auth-services@5.10.0
  - @memberjunction/ng-explorer-core@5.10.0
  - @memberjunction/ng-explorer-settings@5.10.0
  - @memberjunction/ng-shared@5.10.0
  - @memberjunction/ng-artifacts@5.10.0
  - @memberjunction/ng-dashboard-viewer@5.10.0
  - @memberjunction/ng-file-storage@5.10.0
  - @memberjunction/communication-types@5.10.0
  - @memberjunction/entity-communications-base@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ai-engine-base@5.9.0
  - @memberjunction/ai-core-plus@5.9.0
  - @memberjunction/actions-base@5.9.0
  - @memberjunction/ng-core-entity-forms@5.9.0
  - @memberjunction/ng-dashboards@5.9.0
  - @memberjunction/ng-explorer-core@5.9.0
  - @memberjunction/ng-explorer-settings@5.9.0
  - @memberjunction/ng-shared@5.9.0
  - @memberjunction/ng-artifacts@5.9.0
  - @memberjunction/ng-dashboard-viewer@5.9.0
  - @memberjunction/ng-file-storage@5.9.0
  - @memberjunction/communication-types@5.9.0
  - @memberjunction/entity-communications-base@5.9.0
  - @memberjunction/graphql-dataprovider@5.9.0
  - @memberjunction/ng-auth-services@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [de9f2c0]
- Updated dependencies [0753249]
  - @memberjunction/graphql-dataprovider@5.8.0
  - @memberjunction/core@5.8.0
  - @memberjunction/ng-core-entity-forms@5.8.0
  - @memberjunction/ng-dashboards@5.8.0
  - @memberjunction/ng-explorer-core@5.8.0
  - @memberjunction/ng-explorer-settings@5.8.0
  - @memberjunction/ng-shared@5.8.0
  - @memberjunction/ng-file-storage@5.8.0
  - @memberjunction/ai-engine-base@5.8.0
  - @memberjunction/ai-core-plus@5.8.0
  - @memberjunction/actions-base@5.8.0
  - @memberjunction/ng-auth-services@5.8.0
  - @memberjunction/ng-artifacts@5.8.0
  - @memberjunction/ng-dashboard-viewer@5.8.0
  - @memberjunction/communication-types@5.8.0
  - @memberjunction/entity-communications-base@5.8.0
  - @memberjunction/core-entities@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [f52e156]
- Updated dependencies [642c4df]
  - @memberjunction/ng-artifacts@5.7.0
  - @memberjunction/core@5.7.0
  - @memberjunction/ai-engine-base@5.7.0
  - @memberjunction/ai-core-plus@5.7.0
  - @memberjunction/ng-core-entity-forms@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/ng-explorer-core@5.7.0
  - @memberjunction/ng-dashboard-viewer@5.7.0
  - @memberjunction/actions-base@5.7.0
  - @memberjunction/ng-auth-services@5.7.0
  - @memberjunction/ng-dashboards@5.7.0
  - @memberjunction/ng-explorer-settings@5.7.0
  - @memberjunction/ng-shared@5.7.0
  - @memberjunction/ng-file-storage@5.7.0
  - @memberjunction/communication-types@5.7.0
  - @memberjunction/entity-communications-base@5.7.0
  - @memberjunction/graphql-dataprovider@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [d24a7ff]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ng-explorer-core@5.6.0
  - @memberjunction/ng-dashboards@5.6.0
  - @memberjunction/graphql-dataprovider@5.6.0
  - @memberjunction/ai-engine-base@5.6.0
  - @memberjunction/ai-core-plus@5.6.0
  - @memberjunction/actions-base@5.6.0
  - @memberjunction/ng-auth-services@5.6.0
  - @memberjunction/ng-core-entity-forms@5.6.0
  - @memberjunction/ng-explorer-settings@5.6.0
  - @memberjunction/ng-shared@5.6.0
  - @memberjunction/ng-artifacts@5.6.0
  - @memberjunction/ng-dashboard-viewer@5.6.0
  - @memberjunction/ng-file-storage@5.6.0
  - @memberjunction/communication-types@5.6.0
  - @memberjunction/entity-communications-base@5.6.0
  - @memberjunction/core-entities@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [7ca2459]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
- Updated dependencies [6421543]
  - @memberjunction/core@5.5.0
  - @memberjunction/graphql-dataprovider@5.5.0
  - @memberjunction/ng-core-entity-forms@5.5.0
  - @memberjunction/ng-explorer-core@5.5.0
  - @memberjunction/ng-dashboards@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/ai-engine-base@5.5.0
  - @memberjunction/ai-core-plus@5.5.0
  - @memberjunction/actions-base@5.5.0
  - @memberjunction/ng-auth-services@5.5.0
  - @memberjunction/ng-explorer-settings@5.5.0
  - @memberjunction/ng-shared@5.5.0
  - @memberjunction/ng-artifacts@5.5.0
  - @memberjunction/ng-dashboard-viewer@5.5.0
  - @memberjunction/ng-file-storage@5.5.0
  - @memberjunction/communication-types@5.5.0
  - @memberjunction/entity-communications-base@5.5.0

## 5.4.1

### Patch Changes

- Updated dependencies [8789e86]
  - @memberjunction/ng-shared@5.4.1
  - @memberjunction/ng-core-entity-forms@5.4.1
  - @memberjunction/ng-explorer-core@5.4.1
  - @memberjunction/ng-explorer-settings@5.4.1
  - @memberjunction/ng-dashboards@5.4.1
  - @memberjunction/ng-file-storage@5.4.1
  - @memberjunction/ai-engine-base@5.4.1
  - @memberjunction/ai-core-plus@5.4.1
  - @memberjunction/actions-base@5.4.1
  - @memberjunction/ng-auth-services@5.4.1
  - @memberjunction/ng-artifacts@5.4.1
  - @memberjunction/ng-dashboard-viewer@5.4.1
  - @memberjunction/communication-types@5.4.1
  - @memberjunction/entity-communications-base@5.4.1
  - @memberjunction/graphql-dataprovider@5.4.1
  - @memberjunction/core@5.4.1
  - @memberjunction/core-entities@5.4.1

## 5.4.0

### Patch Changes

- c9a760c: no migration
- Updated dependencies [439129c]
- Updated dependencies [8a11457]
- Updated dependencies [c9a760c]
- Updated dependencies [081d657]
- Updated dependencies [6bcfa1c]
  - @memberjunction/ng-dashboards@5.4.0
  - @memberjunction/graphql-dataprovider@5.4.0
  - @memberjunction/ng-core-entity-forms@5.4.0
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ng-explorer-settings@5.4.0
  - @memberjunction/ng-explorer-core@5.4.0
  - @memberjunction/ng-shared@5.4.0
  - @memberjunction/ng-file-storage@5.4.0
  - @memberjunction/ai-engine-base@5.4.0
  - @memberjunction/ai-core-plus@5.4.0
  - @memberjunction/actions-base@5.4.0
  - @memberjunction/ng-artifacts@5.4.0
  - @memberjunction/ng-dashboard-viewer@5.4.0
  - @memberjunction/communication-types@5.4.0
  - @memberjunction/entity-communications-base@5.4.0
  - @memberjunction/ng-auth-services@5.4.0
  - @memberjunction/core@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ai-engine-base@5.3.1
- @memberjunction/ai-core-plus@5.3.1
- @memberjunction/actions-base@5.3.1
- @memberjunction/ng-auth-services@5.3.1
- @memberjunction/ng-core-entity-forms@5.3.1
- @memberjunction/ng-dashboards@5.3.1
- @memberjunction/ng-explorer-core@5.3.1
- @memberjunction/ng-explorer-settings@5.3.1
- @memberjunction/ng-shared@5.3.1
- @memberjunction/ng-artifacts@5.3.1
- @memberjunction/ng-dashboard-viewer@5.3.1
- @memberjunction/ng-file-storage@5.3.1
- @memberjunction/communication-types@5.3.1
- @memberjunction/entity-communications-base@5.3.1
- @memberjunction/graphql-dataprovider@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [a6aea29]
- Updated dependencies [1692c53]
- Updated dependencies [7af1846]
  - @memberjunction/graphql-dataprovider@5.3.0
  - @memberjunction/ng-dashboards@5.3.0
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ng-artifacts@5.3.0
  - @memberjunction/ng-explorer-core@5.3.0
  - @memberjunction/ng-core-entity-forms@5.3.0
  - @memberjunction/ng-explorer-settings@5.3.0
  - @memberjunction/ng-shared@5.3.0
  - @memberjunction/ng-file-storage@5.3.0
  - @memberjunction/ng-dashboard-viewer@5.3.0
  - @memberjunction/ai-engine-base@5.3.0
  - @memberjunction/ai-core-plus@5.3.0
  - @memberjunction/actions-base@5.3.0
  - @memberjunction/communication-types@5.3.0
  - @memberjunction/entity-communications-base@5.3.0
  - @memberjunction/ng-auth-services@5.3.0
  - @memberjunction/core@5.3.0

## 5.2.0

### Patch Changes

- 5e5fab6: Standardize entity subclass naming with MJ-prefix rename map in CodeGen, update cross-package references to use new names, add share/edit/delete UI triggers to collections dashboard, add dbEncrypt CLI config, and fix stale entity name references in migration JSON config columns
- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
- Updated dependencies [4618227]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/graphql-dataprovider@5.2.0
  - @memberjunction/ai-engine-base@5.2.0
  - @memberjunction/ai-core-plus@5.2.0
  - @memberjunction/actions-base@5.2.0
  - @memberjunction/ng-core-entity-forms@5.2.0
  - @memberjunction/ng-dashboards@5.2.0
  - @memberjunction/ng-explorer-core@5.2.0
  - @memberjunction/ng-explorer-settings@5.2.0
  - @memberjunction/ng-shared@5.2.0
  - @memberjunction/ng-dashboard-viewer@5.2.0
  - @memberjunction/communication-types@5.2.0
  - @memberjunction/entity-communications-base@5.2.0
  - @memberjunction/ng-artifacts@5.2.0
  - @memberjunction/ng-file-storage@5.2.0
  - @memberjunction/ng-auth-services@5.2.0

## 5.1.0

### Patch Changes

- f426d43: Fix CodeGen to apply excludeSchemas filter consistently across all generators (TypeScript, Angular, GraphQL), not just SQL generation. Also adds cleanup for orphaned Angular entity form directories when entities are renamed or deleted.
  - @memberjunction/ai-engine-base@5.1.0
  - @memberjunction/ai-core-plus@5.1.0
  - @memberjunction/actions-base@5.1.0
  - @memberjunction/ng-auth-services@5.1.0
  - @memberjunction/ng-core-entity-forms@5.1.0
  - @memberjunction/ng-dashboards@5.1.0
  - @memberjunction/ng-explorer-core@5.1.0
  - @memberjunction/ng-explorer-settings@5.1.0
  - @memberjunction/ng-shared@5.1.0
  - @memberjunction/ng-artifacts@5.1.0
  - @memberjunction/ng-dashboard-viewer@5.1.0
  - @memberjunction/ng-file-storage@5.1.0
  - @memberjunction/communication-types@5.1.0
  - @memberjunction/entity-communications-base@5.1.0
  - @memberjunction/graphql-dataprovider@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- 786a390: Remove explicit 3.0 references in several areas
- Updated dependencies [3cca644]
- Updated dependencies [786a390]
- Updated dependencies [737b56b]
- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/ng-dashboards@5.0.0
  - @memberjunction/communication-types@5.0.0
  - @memberjunction/graphql-dataprovider@5.0.0
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ai-engine-base@5.0.0
  - @memberjunction/ai-core-plus@5.0.0
  - @memberjunction/actions-base@5.0.0
  - @memberjunction/ng-auth-services@5.0.0
  - @memberjunction/ng-core-entity-forms@5.0.0
  - @memberjunction/ng-explorer-core@5.0.0
  - @memberjunction/ng-explorer-settings@5.0.0
  - @memberjunction/ng-shared@5.0.0
  - @memberjunction/ng-artifacts@5.0.0
  - @memberjunction/ng-dashboard-viewer@5.0.0
  - @memberjunction/ng-file-storage@5.0.0
  - @memberjunction/entity-communications-base@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ai-engine-base@4.4.0
  - @memberjunction/ai-core-plus@4.4.0
  - @memberjunction/actions-base@4.4.0
  - @memberjunction/ng-auth-services@4.4.0
  - @memberjunction/ng-core-entity-forms@4.4.0
  - @memberjunction/ng-dashboards@4.4.0
  - @memberjunction/ng-explorer-core@4.4.0
  - @memberjunction/ng-explorer-settings@4.4.0
  - @memberjunction/ng-shared@4.4.0
  - @memberjunction/ng-artifacts@4.4.0
  - @memberjunction/ng-dashboard-viewer@4.4.0
  - @memberjunction/ng-file-storage@4.4.0
  - @memberjunction/communication-types@4.4.0
  - @memberjunction/entity-communications-base@4.4.0
  - @memberjunction/graphql-dataprovider@4.4.0
  - @memberjunction/core-entities@4.4.0

## 4.3.1

### Patch Changes

- f1b4a98: Restore singleton packages as regular dependencies in Angular Bootstrap and Explorer packages, and fix false positive error detection in CLI migrate command.
- Updated dependencies [f1b4a98]
  - @memberjunction/ng-auth-services@4.3.1
  - @memberjunction/ng-explorer-core@4.3.1
  - @memberjunction/ng-core-entity-forms@4.3.1
  - @memberjunction/ng-explorer-settings@4.3.1
  - @memberjunction/ng-dashboards@4.3.1
  - @memberjunction/ai-engine-base@4.3.1
  - @memberjunction/ai-core-plus@4.3.1
  - @memberjunction/actions-base@4.3.1
  - @memberjunction/ng-shared@4.3.1
  - @memberjunction/ng-artifacts@4.3.1
  - @memberjunction/ng-dashboard-viewer@4.3.1
  - @memberjunction/ng-file-storage@4.3.1
  - @memberjunction/communication-types@4.3.1
  - @memberjunction/entity-communications-base@4.3.1
  - @memberjunction/graphql-dataprovider@4.3.1
  - @memberjunction/core@4.3.1
  - @memberjunction/core-entities@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/graphql-dataprovider@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ng-core-entity-forms@4.3.0
  - @memberjunction/ng-dashboards@4.3.0
  - @memberjunction/ng-explorer-core@4.3.0
  - @memberjunction/ng-explorer-settings@4.3.0
  - @memberjunction/ng-shared@4.3.0
  - @memberjunction/ng-file-storage@4.3.0
  - @memberjunction/ai-engine-base@4.3.0
  - @memberjunction/ai-core-plus@4.3.0
  - @memberjunction/actions-base@4.3.0
  - @memberjunction/ng-artifacts@4.3.0
  - @memberjunction/ng-dashboard-viewer@4.3.0
  - @memberjunction/communication-types@4.3.0
  - @memberjunction/entity-communications-base@4.3.0

## 4.2.0

### Patch Changes

- Updated dependencies [d2938db]
  - @memberjunction/ng-auth-services@4.2.0
  - @memberjunction/ng-explorer-core@4.2.0
  - @memberjunction/ai-engine-base@4.2.0
  - @memberjunction/ai-core-plus@4.2.0
  - @memberjunction/actions-base@4.2.0
  - @memberjunction/ng-core-entity-forms@4.2.0
  - @memberjunction/ng-dashboards@4.2.0
  - @memberjunction/ng-explorer-settings@4.2.0
  - @memberjunction/ng-shared@4.2.0
  - @memberjunction/ng-artifacts@4.2.0
  - @memberjunction/ng-dashboard-viewer@4.2.0
  - @memberjunction/ng-file-storage@4.2.0
  - @memberjunction/communication-types@4.2.0
  - @memberjunction/entity-communications-base@4.2.0
  - @memberjunction/graphql-dataprovider@4.2.0
  - @memberjunction/core@4.2.0
  - @memberjunction/core-entities@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/ng-core-entity-forms@4.1.0
  - @memberjunction/ng-dashboards@4.1.0
  - @memberjunction/ng-explorer-core@4.1.0
  - @memberjunction/ng-explorer-settings@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ai-engine-base@4.1.0
  - @memberjunction/ai-core-plus@4.1.0
  - @memberjunction/actions-base@4.1.0
  - @memberjunction/ng-auth-services@4.1.0
  - @memberjunction/ng-shared@4.1.0
  - @memberjunction/ng-artifacts@4.1.0
  - @memberjunction/ng-dashboard-viewer@4.1.0
  - @memberjunction/ng-file-storage@4.1.0
  - @memberjunction/communication-types@4.1.0
  - @memberjunction/entity-communications-base@4.1.0
  - @memberjunction/graphql-dataprovider@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 7aa23e7: 4.0
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [2f86270]
- Updated dependencies [4723079]
- Updated dependencies [65b4274]
- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [0a0cda1]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ng-dashboards@4.0.0
  - @memberjunction/ng-core-entity-forms@4.0.0
  - @memberjunction/graphql-dataprovider@4.0.0
  - @memberjunction/ai-engine-base@4.0.0
  - @memberjunction/ai-core-plus@4.0.0
  - @memberjunction/actions-base@4.0.0
  - @memberjunction/ng-auth-services@4.0.0
  - @memberjunction/ng-explorer-core@4.0.0
  - @memberjunction/ng-explorer-settings@4.0.0
  - @memberjunction/ng-shared@4.0.0
  - @memberjunction/ng-artifacts@4.0.0
  - @memberjunction/ng-dashboard-viewer@4.0.0
  - @memberjunction/ng-file-storage@4.0.0
  - @memberjunction/communication-types@4.0.0
  - @memberjunction/entity-communications-base@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0

## 3.4.0

### Patch Changes

- 3a71e4e: Fix large text field corruptions, cross-platform improvements, more robust environment variable parsing for boolean values
- Updated dependencies [a3961d5]
  - @memberjunction/core@3.4.0
  - @memberjunction/ng-shared@3.4.0
  - @memberjunction/graphql-dataprovider@3.4.0
  - @memberjunction/ng-auth-services@3.4.0

## 3.3.0

### Patch Changes

- @memberjunction/ng-shared@3.3.0
- @memberjunction/graphql-dataprovider@3.3.0
- @memberjunction/ng-auth-services@3.3.0
- @memberjunction/core@3.3.0

## 3.2.0

### Patch Changes

- 470bc9d: Fix npm deployment issue with Angular/Bootstrap package
- Updated dependencies [6806a6c]
  - @memberjunction/graphql-dataprovider@3.2.0
  - @memberjunction/ng-shared@3.2.0
  - @memberjunction/ng-auth-services@3.2.0
  - @memberjunction/core@3.2.0

## 3.1.1

### Patch Changes

- Updated dependencies [8c0b624]
  - @memberjunction/graphql-dataprovider@3.1.1
  - @memberjunction/ng-shared@3.1.1
  - @memberjunction/ng-auth-services@3.1.1
  - @memberjunction/core@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/ng-auth-services@3.0.0
- @memberjunction/ng-shared@3.0.0
- @memberjunction/graphql-dataprovider@3.0.0
- @memberjunction/core@3.0.0
