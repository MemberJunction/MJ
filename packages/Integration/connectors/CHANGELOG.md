# @memberjunction/integration-connectors

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
- Updated dependencies [7006276]
  - @memberjunction/core@5.29.0
  - @memberjunction/core-entities@5.29.0
  - @memberjunction/integration-engine@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Minor Changes

- 1d62875: feat: bidirectional sync engine, HubSpot/YM connector improvements, RSU #2239 fixes
  - Integration engine now respects SyncDirection (Pull/Push/Bidirectional) on entity maps
  - Push sync uses Record Changes to detect MJ-side modifications, reverse-maps fields, and calls connector CRUD methods
  - Separate Push watermarks tracked alongside Pull watermarks
  - New IntegrationWriteRecord GraphQL mutation for ad-hoc writes to any connector
  - HubSpot: 130 objects with full field metadata; association CRUD via v4 PUT/DELETE API; composite hs_object_id for association sync
  - YourMembership: 228 objects with accurate PKs across all endpoints; 400 errors now surfaced (not silently swallowed); DateTime.MinValue → null conversion
  - SchemaBuilder logs DDL history to \_\_mj_integration.SchemaHistory (separate schema, not surfaced as MJ Application)
  - IntegrationObject.IsCustom column added to distinguish static vs runtime-discovered objects
  - RSU #2239: in-process SQL execution for CodeGen (no sqlcmd dependency)
  - RSU #2239: RSU_RESTART_COMMAND env var override for non-PM2 environments
  - SQLServerDataProvider: incremental schema sync improvements

### Patch Changes

- Updated dependencies [1d62875]
- Updated dependencies [115e4da]
  - @memberjunction/integration-engine@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/core-entities@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/integration-engine@5.27.1
  - @memberjunction/core@5.27.1
  - @memberjunction/core-entities@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/integration-engine@5.27.0
- @memberjunction/core@5.27.0
- @memberjunction/core-entities@5.27.0
- @memberjunction/global@5.27.0

## 5.26.0

### Patch Changes

- Updated dependencies [55de456]
- Updated dependencies [a1002f4]
  - @memberjunction/core-entities@5.26.0
  - @memberjunction/core@5.26.0
  - @memberjunction/integration-engine@5.26.0
  - @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- Updated dependencies [fc8cd52]
- Updated dependencies [d6370e8]
- Updated dependencies [7ddf732]
- Updated dependencies [cbcf477]
  - @memberjunction/core@5.25.0
  - @memberjunction/core-entities@5.25.0
  - @memberjunction/integration-engine@5.25.0
  - @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- Updated dependencies [c318a0c]
- Updated dependencies [1912726]
  - @memberjunction/core@5.24.0
  - @memberjunction/core-entities@5.24.0
  - @memberjunction/integration-engine@5.24.0
  - @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
- Updated dependencies [9250070]
- Updated dependencies [513b20c]
- Updated dependencies [44bc22b]
  - @memberjunction/core@5.23.0
  - @memberjunction/global@5.23.0
  - @memberjunction/core-entities@5.23.0
  - @memberjunction/integration-engine@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [6a5093b]
- Updated dependencies [e123e4b]
- Updated dependencies [f2a6bec]
  - @memberjunction/core@5.22.0
  - @memberjunction/global@5.22.0
  - @memberjunction/integration-engine@5.22.0
  - @memberjunction/core-entities@5.22.0

## 5.21.0

### Patch Changes

- Updated dependencies [c7dfb20]
  - @memberjunction/core@5.21.0
  - @memberjunction/integration-engine@5.21.0
  - @memberjunction/core-entities@5.21.0
  - @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- Updated dependencies [2298f8a]
  - @memberjunction/core@5.20.0
  - @memberjunction/integration-engine@5.20.0
  - @memberjunction/core-entities@5.20.0
  - @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/integration-engine@5.19.0
- @memberjunction/core@5.19.0
- @memberjunction/core-entities@5.19.0
- @memberjunction/global@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/integration-engine@5.18.0
- @memberjunction/core@5.18.0
- @memberjunction/core-entities@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Patch Changes

- Updated dependencies [bbfbf5e]
- Updated dependencies [9881045]
  - @memberjunction/integration-engine@5.17.0
  - @memberjunction/core@5.17.0
  - @memberjunction/core-entities@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- Updated dependencies [2387400]
- Updated dependencies [11dba07]
  - @memberjunction/core@5.16.0
  - @memberjunction/integration-engine@5.16.0
  - @memberjunction/core-entities@5.16.0
  - @memberjunction/global@5.16.0

## 5.15.0

### Minor Changes

- 95a7b8e: metadata
- ee64a9a: metadata

### Patch Changes

- Updated dependencies [662d56b]
- Updated dependencies [d01f697]
  - @memberjunction/core@5.15.0
  - @memberjunction/integration-engine@5.15.0
  - @memberjunction/core-entities@5.15.0
  - @memberjunction/global@5.15.0

## 5.14.0

### Minor Changes

- 140fc6d: Add HubSpot v4 association fetch, fix empty-string-to-null coercion for HubSpot datetime fields, widen GetCachedObject/GetCachedFields visibility to protected, and fix OpenAI streaming max_completion_tokens parameter

### Patch Changes

- Updated dependencies [69b5af4]
- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/core@5.14.0
  - @memberjunction/integration-engine@5.14.0
  - @memberjunction/core-entities@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
- Updated dependencies [d0d9eba]
  - @memberjunction/core@5.13.0
  - @memberjunction/global@5.13.0
  - @memberjunction/integration-engine@5.13.0
  - @memberjunction/core-entities@5.13.0

## 5.12.0

### Minor Changes

- 6f9350c: migration
- 257512b: feat: Integration scheduled job type, YM/HubSpot connector improvements, CodeGen custom view refresh
  - Add ScheduledJobRunID FK to CompanyIntegrationRun and ScheduledJobID FK to CompanyIntegration (migration v5.12.x)
  - Add Integration Sync scheduled job type metadata
  - Pass contextUser through HubSpot credential loading for proper server-side data isolation
  - Make YM connector performance defaults (retries, timeouts, batch size, throttle) overrideable per Configuration JSON
  - CodeGen now auto-emits sp_refreshview for custom base views (BaseViewGenerated=false) so devs don't need to add it manually to migrations
  - BaseIntegrationPointAction scaffold for future write-back actions

- 492de8e: Add Rasa.io newsletter platform integration connector with sync support for persons, posts, insight actions, and insight topics. Includes credential type metadata and integration object definitions.

### Patch Changes

- 93a9f7d: Update YourMembership connector watermark tests to match simplified FetchMemberBatch that delegates pagination to the engine instead of filtering client-side.
- Updated dependencies [6f9350c]
- Updated dependencies [05f19ff]
- Updated dependencies [257512b]
- Updated dependencies [d92502e]
- Updated dependencies [1567293]
- Updated dependencies [1e5d181]
  - @memberjunction/integration-engine@5.12.0
  - @memberjunction/core@5.12.0
  - @memberjunction/core-entities@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- Updated dependencies [a4c3c81]
  - @memberjunction/core@5.11.0
  - @memberjunction/integration-engine@5.11.0
  - @memberjunction/core-entities@5.11.0
  - @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/integration-engine@5.10.1
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
  - @memberjunction/integration-engine@5.10.0
  - @memberjunction/global@5.10.0

## 5.9.0

### Minor Changes

- 89b6abe: migration

### Patch Changes

- Updated dependencies [c6a0df2]
- Updated dependencies [89b6abe]
- Updated dependencies [194ddf2]
  - @memberjunction/core-entities@5.9.0
  - @memberjunction/integration-engine@5.9.0
  - @memberjunction/global@5.9.0
  - @memberjunction/core@5.9.0

## 5.8.0

### Patch Changes

- Updated dependencies [0753249]
  - @memberjunction/core@5.8.0
  - @memberjunction/core-entities@5.8.0
  - @memberjunction/integration-engine@5.8.0
  - @memberjunction/global@5.8.0
