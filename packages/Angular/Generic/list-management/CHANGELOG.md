# @memberjunction/ng-list-management

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [2e48d1a]
- Updated dependencies [34d17e2]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/graphql-dataprovider@5.41.0
  - @memberjunction/ng-shared@5.41.0
  - @memberjunction/ng-base-types@5.41.0
  - @memberjunction/ng-container-directives@5.41.0
  - @memberjunction/ng-shared-generic@5.41.0
  - @memberjunction/ng-ui-components@5.41.0
  - @memberjunction/lists-base@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ng-shared@5.40.2
- @memberjunction/ng-base-types@5.40.2
- @memberjunction/ng-container-directives@5.40.2
- @memberjunction/ng-shared-generic@5.40.2
- @memberjunction/ng-ui-components@5.40.2
- @memberjunction/graphql-dataprovider@5.40.2
- @memberjunction/lists-base@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ng-shared@5.40.1
  - @memberjunction/ng-base-types@5.40.1
  - @memberjunction/ng-container-directives@5.40.1
  - @memberjunction/ng-shared-generic@5.40.1
  - @memberjunction/graphql-dataprovider@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/ng-ui-components@5.40.1
  - @memberjunction/lists-base@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [7bbfd62]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/graphql-dataprovider@5.40.0
  - @memberjunction/ng-shared@5.40.0
  - @memberjunction/ng-base-types@5.40.0
  - @memberjunction/ng-container-directives@5.40.0
  - @memberjunction/ng-shared-generic@5.40.0
  - @memberjunction/ng-ui-components@5.40.0
  - @memberjunction/lists-base@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [f60e340]
- Updated dependencies [bd95e83]
- Updated dependencies [3c53858]
- Updated dependencies [4bc6fb4]
- Updated dependencies [3b29882]
- Updated dependencies [db4addf]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/core@5.39.0
  - @memberjunction/graphql-dataprovider@5.39.0
  - @memberjunction/ng-ui-components@5.39.0
  - @memberjunction/ng-shared-generic@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ng-shared@5.39.0
  - @memberjunction/ng-base-types@5.39.0
  - @memberjunction/ng-container-directives@5.39.0
  - @memberjunction/lists-base@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [6a571d3]
- Updated dependencies [275afda]
- Updated dependencies [6a3ac36]
- Updated dependencies [c0b40c0]
- Updated dependencies [d5a51b3]
- Updated dependencies [b26d0ee]
- Updated dependencies [60947be]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/ng-shared@5.38.0
  - @memberjunction/graphql-dataprovider@5.38.0
  - @memberjunction/ng-base-types@5.38.0
  - @memberjunction/ng-container-directives@5.38.0
  - @memberjunction/ng-shared-generic@5.38.0
  - @memberjunction/ng-ui-components@5.38.0
  - @memberjunction/lists-base@5.38.0

## 5.37.0

### Patch Changes

- Updated dependencies [dadbde9]
- Updated dependencies [4f15f31]
  - @memberjunction/graphql-dataprovider@5.37.0
  - @memberjunction/core@5.37.0
  - @memberjunction/core-entities@5.37.0
  - @memberjunction/ng-shared@5.37.0
  - @memberjunction/ng-base-types@5.37.0
  - @memberjunction/ng-container-directives@5.37.0
  - @memberjunction/ng-shared-generic@5.37.0
  - @memberjunction/ng-ui-components@5.37.0
  - @memberjunction/lists-base@5.37.0
  - @memberjunction/global@5.37.0

## 5.36.0

### Patch Changes

- 91036ee: Refreshable, shareable, taggable Lists with an agent-callable Actions surface.
  - New `@memberjunction/lists` core: ListOperations (delta + drop-guard + materialize/refresh/set-op), ListSharing, AudienceResolver.
  - `MJ: Lists` lineage fields (SourceViewID, SourceFilterSnapshot, LastRefreshedAt, RefreshMode, UseSnapshot) wired into Refresh-from-source.
  - GraphQL: ListOperationsResolver + GraphQLListsClient. New `SendToAudience` in communication-engine.
  - 12 new Actions covering materialize / refresh / share / invite / move / compose / resolve-audience / send-to-audience.
  - UI: Save-as-List, mixed list+view operands, compose-into-target, Shared With Me tab, invitations + audit-log dialogs, viewer-perspective gating, bulk Move/Copy with delta-confirm, tag chips + filter, list-stats sidebar, audience picker, Communications New Message page, Excel/CSV/JSON column-picker export.

- Updated dependencies [f29b7c0]
- Updated dependencies [1c0fce9]
- Updated dependencies [91036ee]
- Updated dependencies [70fce34]
- Updated dependencies [4d16916]
  - @memberjunction/graphql-dataprovider@5.36.0
  - @memberjunction/ng-ui-components@5.36.0
  - @memberjunction/lists-base@5.36.0
  - @memberjunction/core-entities@5.36.0
  - @memberjunction/core@5.36.0
  - @memberjunction/ng-shared@5.36.0
  - @memberjunction/ng-base-types@5.36.0
  - @memberjunction/ng-shared-generic@5.36.0
  - @memberjunction/ng-container-directives@5.36.0
  - @memberjunction/global@5.36.0

## 5.35.0

### Patch Changes

- Updated dependencies [6fa8e13]
- Updated dependencies [ee380f7]
- Updated dependencies [31f2a7f]
- Updated dependencies [c1f1cad]
- Updated dependencies [32c4a02]
- Updated dependencies [9580189]
- Updated dependencies [207cba4]
- Updated dependencies [aedd4dc]
- Updated dependencies [383784c]
- Updated dependencies [ac4b9a5]
  - @memberjunction/core@5.35.0
  - @memberjunction/ng-ui-components@5.35.0
  - @memberjunction/core-entities@5.35.0
  - @memberjunction/ng-shared@5.35.0
  - @memberjunction/global@5.35.0
  - @memberjunction/ng-base-types@5.35.0
  - @memberjunction/ng-container-directives@5.35.0
  - @memberjunction/ng-shared-generic@5.35.0

## 5.34.1

### Patch Changes

- Updated dependencies [3a35358]
  - @memberjunction/core@5.34.1
  - @memberjunction/ng-shared@5.34.1
  - @memberjunction/ng-base-types@5.34.1
  - @memberjunction/ng-container-directives@5.34.1
  - @memberjunction/ng-shared-generic@5.34.1
  - @memberjunction/core-entities@5.34.1
  - @memberjunction/ng-ui-components@5.34.1
  - @memberjunction/global@5.34.1

## 5.34.0

### Patch Changes

- 7d8a0f9: Bound memory leaks: ResultHistory cap, QueueBase Stop/ IShutdownable, A2AServer, TaskStore, sweep, MJLruCache for provider / issuer caches, BaseLLM streaming reset, ShutdownRegister + SIGTERM contract.
- Updated dependencies [7d8a0f9]
- Updated dependencies [003317f]
- Updated dependencies [0caffca]
- Updated dependencies [cfffb6d]
- Updated dependencies [e999e0d]
- Updated dependencies [389d356]
- Updated dependencies [ae5cfbd]
- Updated dependencies [6d8ee1a]
- Updated dependencies [72cb92e]
  - @memberjunction/ng-shared@5.34.0
  - @memberjunction/ng-base-types@5.34.0
  - @memberjunction/ng-container-directives@5.34.0
  - @memberjunction/ng-shared-generic@5.34.0
  - @memberjunction/ng-ui-components@5.34.0
  - @memberjunction/core@5.34.0
  - @memberjunction/core-entities@5.34.0
  - @memberjunction/global@5.34.0

## 5.33.0

### Patch Changes

- Updated dependencies [95eb27e]
- Updated dependencies [74b0be0]
- Updated dependencies [5cc5326]
- Updated dependencies [7e4957d]
  - @memberjunction/core@5.33.0
  - @memberjunction/global@5.33.0
  - @memberjunction/ng-shared@5.33.0
  - @memberjunction/ng-base-types@5.33.0
  - @memberjunction/ng-container-directives@5.33.0
  - @memberjunction/ng-shared-generic@5.33.0
  - @memberjunction/core-entities@5.33.0
  - @memberjunction/ng-ui-components@5.33.0

## 5.32.0

### Patch Changes

- Updated dependencies [a7e8b3b]
- Updated dependencies [b9c67ac]
  - @memberjunction/core@5.32.0
  - @memberjunction/ng-shared@5.32.0
  - @memberjunction/ng-base-types@5.32.0
  - @memberjunction/ng-container-directives@5.32.0
  - @memberjunction/ng-shared-generic@5.32.0
  - @memberjunction/core-entities@5.32.0
  - @memberjunction/ng-ui-components@5.32.0
  - @memberjunction/global@5.32.0

## 5.31.0

### Patch Changes

- 7ed7a4b: no metadata/migration changes
- Updated dependencies [fc8b9b8]
- Updated dependencies [cde4d2c]
- Updated dependencies [7ed7a4b]
- Updated dependencies [60e7541]
- Updated dependencies [18be074]
- Updated dependencies [17b8087]
- Updated dependencies [6779c1e]
- Updated dependencies [de34786]
- Updated dependencies [5db36d9]
- Updated dependencies [0e3365f]
  - @memberjunction/core-entities@5.31.0
  - @memberjunction/ng-shared@5.31.0
  - @memberjunction/ng-base-types@5.31.0
  - @memberjunction/ng-container-directives@5.31.0
  - @memberjunction/ng-shared-generic@5.31.0
  - @memberjunction/ng-ui-components@5.31.0
  - @memberjunction/core@5.31.0
  - @memberjunction/global@5.31.0

## 5.30.1

### Patch Changes

- @memberjunction/ng-shared@5.30.1
- @memberjunction/ng-container-directives@5.30.1
- @memberjunction/ng-shared-generic@5.30.1
- @memberjunction/ng-ui-components@5.30.1
- @memberjunction/core@5.30.1
- @memberjunction/core-entities@5.30.1
- @memberjunction/global@5.30.1

## 5.30.0

### Patch Changes

- Updated dependencies [c2c5892]
- Updated dependencies [68bf87f]
- Updated dependencies [963f2df]
- Updated dependencies [4729398]
- Updated dependencies [b1f32a4]
- Updated dependencies [c199f3b]
  - @memberjunction/core-entities@5.30.0
  - @memberjunction/core@5.30.0
  - @memberjunction/ng-shared@5.30.0
  - @memberjunction/ng-shared-generic@5.30.0
  - @memberjunction/ng-container-directives@5.30.0
  - @memberjunction/ng-ui-components@5.30.0
  - @memberjunction/global@5.30.0

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/ng-shared@5.29.0
  - @memberjunction/ng-container-directives@5.29.0
  - @memberjunction/ng-shared-generic@5.29.0
  - @memberjunction/ng-ui-components@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

- Updated dependencies [2542615]
- Updated dependencies [115e4da]
  - @memberjunction/ng-shared@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/ng-container-directives@5.28.0
  - @memberjunction/ng-shared-generic@5.28.0
  - @memberjunction/ng-ui-components@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/ng-shared@5.27.1
  - @memberjunction/ng-container-directives@5.27.1
  - @memberjunction/ng-shared-generic@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1
  - @memberjunction/ng-ui-components@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/ng-shared@5.27.0
- @memberjunction/ng-container-directives@5.27.0
- @memberjunction/ng-shared-generic@5.27.0
- @memberjunction/ng-ui-components@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/ng-shared-generic@5.26.0
  - @memberjunction/ng-ui-components@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/ng-shared@5.26.0
  - @memberjunction/ng-container-directives@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/ng-shared@5.25.0
  - @memberjunction/ng-container-directives@5.25.0
  - @memberjunction/ng-shared-generic@5.25.0
  - @memberjunction/ng-ui-components@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/ng-shared@5.24.0
  - @memberjunction/ng-container-directives@5.24.0
  - @memberjunction/ng-shared-generic@5.24.0
  - @memberjunction/ng-ui-components@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
- Updated dependencies [58af481]
- Updated dependencies [fb0c69f]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/ng-ui-components@5.23.0
  - @memberjunction/ng-shared@5.23.0
  - @memberjunction/ng-container-directives@5.23.0
  - @memberjunction/ng-shared-generic@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/ng-shared@5.22.0
  - @memberjunction/ng-container-directives@5.22.0
  - @memberjunction/ng-shared-generic@5.22.0
  - @memberjunction/core-entities@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/ng-shared@5.21.0
  - @memberjunction/ng-container-directives@5.21.0
  - @memberjunction/ng-shared-generic@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/ng-shared@5.20.0
  - @memberjunction/ng-container-directives@5.20.0
  - @memberjunction/ng-shared-generic@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/ng-shared@5.19.0
- @memberjunction/ng-container-directives@5.19.0
- @memberjunction/ng-shared-generic@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/ng-shared@5.18.0
- @memberjunction/ng-container-directives@5.18.0
- @memberjunction/ng-shared-generic@5.18.0
- @memberjunction/core@5.18.0
- @memberjunction/core-entities@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [9881045]
  - @memberjunction/core@5.17.0
  - @memberjunction/ng-shared@5.17.0
  - @memberjunction/ng-container-directives@5.17.0
  - @memberjunction/ng-shared-generic@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/ng-shared@5.16.0
  - @memberjunction/ng-container-directives@5.16.0
  - @memberjunction/ng-shared-generic@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/ng-shared@5.15.0
  - @memberjunction/ng-container-directives@5.15.0
  - @memberjunction/ng-shared-generic@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
  - @memberjunction/core@5.14.0
  - @memberjunction/ng-shared@5.14.0
  - @memberjunction/ng-container-directives@5.14.0
  - @memberjunction/ng-shared-generic@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/ng-shared@5.13.0
  - @memberjunction/ng-container-directives@5.13.0
  - @memberjunction/ng-shared-generic@5.13.0
  - @memberjunction/core-entities@5.13.0

## 5.12.0

### Patch Changes

- a57b8d5: Migrate all hardcoded CSS colors to design tokens for dark mode and white-label support. Introduces `--mj-*` semantic CSS custom properties in `_tokens.scss` with full `[data-theme="dark"]` overrides. Migrates 1,544 of 1,659 hardcoded hex values (93%) across 72+ CSS files to semantic tokens. Adds logo token system (`--mj-logo-mark`, `--mj-logo-color`) for themeable branding. Fixes dark mode theming for CodeMirror, AG Grid v35, and Kendo popups. No API or behavioral changes — CSS only.
- e87d153: design tokens phase 1
- Updated dependencies [05f19ff]
- Updated dependencies [a57b8d5]
- Updated dependencies [e87d153]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/core@5.12.0
  - @memberjunction/ng-shared-generic@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/ng-shared@5.12.0
  - @memberjunction/ng-container-directives@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/ng-shared@5.11.0
  - @memberjunction/ng-container-directives@5.11.0
  - @memberjunction/ng-shared-generic@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/ng-shared@5.10.1
- @memberjunction/ng-container-directives@5.10.1
- @memberjunction/ng-shared-generic@5.10.1
- @memberjunction/core@5.10.1
- @memberjunction/core-entities@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- Updated dependencies [f2df653]
- Updated dependencies [98e9f15]
- Updated dependencies [5ce18ff]
- Updated dependencies [75dd36b]
  - @memberjunction/core@5.10.0
  - @memberjunction/core-entities@5.10.0
  - @memberjunction/ng-shared@5.10.0
  - @memberjunction/ng-container-directives@5.10.0
  - @memberjunction/ng-shared-generic@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0
  - @memberjunction/ng-shared@5.9.0
  - @memberjunction/ng-shared-generic@5.9.0
  - @memberjunction/ng-container-directives@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/ng-shared@5.8.0
  - @memberjunction/ng-container-directives@5.8.0
  - @memberjunction/ng-shared-generic@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/global@5.8.0

## 5.7.0

### Patch Changes

- Updated dependencies [642c4df]
  - @memberjunction/core@5.7.0
  - @memberjunction/core-entities@5.7.0
  - @memberjunction/ng-shared@5.7.0
  - @memberjunction/ng-container-directives@5.7.0
  - @memberjunction/ng-shared-generic@5.7.0
  - @memberjunction/global@5.7.0

## 5.6.0

### Patch Changes

- Updated dependencies [4547d05]
- Updated dependencies [76eaabc]
  - @memberjunction/core@5.6.0
  - @memberjunction/ng-shared@5.6.0
  - @memberjunction/ng-container-directives@5.6.0
  - @memberjunction/ng-shared-generic@5.6.0
  - @memberjunction/core-entities@5.6.0
  - @memberjunction/global@5.6.0

## 5.5.0

### Patch Changes

- df2457c: no migration, just small code changes
- Updated dependencies [2b1d842]
- Updated dependencies [a1648c5]
- Updated dependencies [ee9f788]
- Updated dependencies [df2457c]
  - @memberjunction/core@5.5.0
  - @memberjunction/core-entities@5.5.0
  - @memberjunction/global@5.5.0
  - @memberjunction/ng-shared@5.5.0
  - @memberjunction/ng-container-directives@5.5.0
  - @memberjunction/ng-shared-generic@5.5.0

## 5.4.1

### Patch Changes

- Updated dependencies [8789e86]
  - @memberjunction/ng-shared@5.4.1
  - @memberjunction/ng-container-directives@5.4.1
  - @memberjunction/ng-shared-generic@5.4.1
  - @memberjunction/core@5.4.1
  - @memberjunction/core-entities@5.4.1
  - @memberjunction/global@5.4.1

## 5.4.0

### Patch Changes

- Updated dependencies [c9a760c]
- Updated dependencies [6bcfa1c]
  - @memberjunction/core-entities@5.4.0
  - @memberjunction/ng-shared@5.4.0
  - @memberjunction/ng-shared-generic@5.4.0
  - @memberjunction/ng-container-directives@5.4.0
  - @memberjunction/core@5.4.0
  - @memberjunction/global@5.4.0

## 5.3.1

### Patch Changes

- @memberjunction/ng-shared@5.3.1
- @memberjunction/ng-container-directives@5.3.1
- @memberjunction/ng-shared-generic@5.3.1
- @memberjunction/core@5.3.1
- @memberjunction/core-entities@5.3.1
- @memberjunction/global@5.3.1

## 5.3.0

### Patch Changes

- Updated dependencies [1692c53]
  - @memberjunction/core-entities@5.3.0
  - @memberjunction/ng-shared@5.3.0
  - @memberjunction/ng-shared-generic@5.3.0
  - @memberjunction/ng-container-directives@5.3.0
  - @memberjunction/core@5.3.0
  - @memberjunction/global@5.3.0

## 5.2.0

### Patch Changes

- Updated dependencies [5e5fab6]
- Updated dependencies [06d889c]
- Updated dependencies [3542cb6]
  - @memberjunction/core-entities@5.2.0
  - @memberjunction/core@5.2.0
  - @memberjunction/ng-shared@5.2.0
  - @memberjunction/ng-shared-generic@5.2.0
  - @memberjunction/ng-container-directives@5.2.0
  - @memberjunction/global@5.2.0

## 5.1.0

### Patch Changes

- Updated dependencies [61079e9]
  - @memberjunction/global@5.1.0
  - @memberjunction/ng-shared@5.1.0
  - @memberjunction/ng-container-directives@5.1.0
  - @memberjunction/core@5.1.0
  - @memberjunction/core-entities@5.1.0
  - @memberjunction/ng-shared-generic@5.1.0

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Minor Changes

- 90bfa37: migration

### Patch Changes

- Updated dependencies [a3e7cb6]
- Updated dependencies [4aa1b54]
  - @memberjunction/core@5.0.0
  - @memberjunction/core-entities@5.0.0
  - @memberjunction/ng-shared@5.0.0
  - @memberjunction/ng-container-directives@5.0.0
  - @memberjunction/ng-shared-generic@5.0.0
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- Updated dependencies [61079e9]
- Updated dependencies [bef7f69]
  - @memberjunction/core@4.4.0
  - @memberjunction/ng-shared@4.4.0
  - @memberjunction/ng-container-directives@4.4.0
  - @memberjunction/ng-shared-generic@4.4.0
  - @memberjunction/core-entities@4.4.0
  - @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/ng-shared@4.3.1
- @memberjunction/ng-container-directives@4.3.1
- @memberjunction/ng-shared-generic@4.3.1
- @memberjunction/core@4.3.1
- @memberjunction/core-entities@4.3.1
- @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- Updated dependencies [564e1af]
  - @memberjunction/core@4.3.0
  - @memberjunction/core-entities@4.3.0
  - @memberjunction/ng-shared@4.3.0
  - @memberjunction/ng-container-directives@4.3.0
  - @memberjunction/ng-shared-generic@4.3.0
  - @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/ng-shared@4.2.0
- @memberjunction/ng-container-directives@4.2.0
- @memberjunction/ng-shared-generic@4.2.0
- @memberjunction/core@4.2.0
- @memberjunction/core-entities@4.2.0
- @memberjunction/global@4.2.0

## 4.1.0

### Patch Changes

- Updated dependencies [77839a9]
- Updated dependencies [2ea241f]
- Updated dependencies [5af036f]
  - @memberjunction/core@4.1.0
  - @memberjunction/core-entities@4.1.0
  - @memberjunction/ng-shared@4.1.0
  - @memberjunction/ng-container-directives@4.1.0
  - @memberjunction/ng-shared-generic@4.1.0
  - @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [8366d44]
- Updated dependencies [f159146]
- Updated dependencies [718b0ee]
- Updated dependencies [5c7f6ab]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/ng-shared@4.0.0
  - @memberjunction/ng-container-directives@4.0.0
  - @memberjunction/ng-shared-generic@4.0.0
  - @memberjunction/core@4.0.0
  - @memberjunction/core-entities@4.0.0
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- Updated dependencies [18b4e65]
- Updated dependencies [a3961d5]
  - @memberjunction/core-entities@3.4.0
  - @memberjunction/core@3.4.0
  - @memberjunction/ng-shared@3.4.0
  - @memberjunction/ng-shared-generic@3.4.0
  - @memberjunction/ng-container-directives@3.4.0
  - @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [ca551dd]
  - @memberjunction/core-entities@3.3.0
  - @memberjunction/ng-shared@3.3.0
  - @memberjunction/ng-shared-generic@3.3.0
  - @memberjunction/ng-container-directives@3.3.0
  - @memberjunction/core@3.3.0
  - @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- Updated dependencies [039983c]
- Updated dependencies [6806a6c]
- Updated dependencies [582ca0c]
  - @memberjunction/core-entities@3.2.0
  - @memberjunction/ng-shared@3.2.0
  - @memberjunction/ng-shared-generic@3.2.0
  - @memberjunction/ng-container-directives@3.2.0
  - @memberjunction/core@3.2.0
  - @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/ng-shared@3.1.1
- @memberjunction/ng-container-directives@3.1.1
- @memberjunction/ng-shared-generic@3.1.1
- @memberjunction/core@3.1.1
- @memberjunction/core-entities@3.1.1
- @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- 528041e: no migration
  - @memberjunction/ng-shared@3.0.0
  - @memberjunction/ng-container-directives@3.0.0
  - @memberjunction/ng-shared-generic@3.0.0
  - @memberjunction/core@3.0.0
  - @memberjunction/core-entities@3.0.0
  - @memberjunction/global@3.0.0

## 2.133.0

### Minor Changes

- 43df8f4: migration

### Patch Changes

- Updated dependencies [c00bd13]
  - @memberjunction/core@2.133.0
  - @memberjunction/ng-shared@2.133.0
  - @memberjunction/ng-container-directives@2.133.0
  - @memberjunction/ng-shared-generic@2.133.0
  - @memberjunction/core-entities@2.133.0
  - @memberjunction/global@2.133.0
