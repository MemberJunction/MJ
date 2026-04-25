# @memberjunction/integration-schema-builder

## 5.29.0

### Patch Changes

- Updated dependencies [e02e24e]
  - @memberjunction/core@5.29.0
  - @memberjunction/schema-engine@5.29.0
  - @memberjunction/integration-engine@5.29.0
  - @memberjunction/global@5.29.0

## 5.28.0

### Patch Changes

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

- Updated dependencies [1d62875]
- Updated dependencies [115e4da]
  - @memberjunction/integration-engine@5.28.0
  - @memberjunction/schema-engine@5.28.0
  - @memberjunction/core@5.28.0
  - @memberjunction/global@5.28.0

## 5.27.1

### Patch Changes

- Updated dependencies [d18aa6c]
  - @memberjunction/global@5.27.1
  - @memberjunction/integration-engine@5.27.1
  - @memberjunction/schema-engine@5.27.1

## 5.27.0

### Patch Changes

- @memberjunction/integration-engine@5.27.0
- @memberjunction/global@5.27.0
- @memberjunction/schema-engine@5.27.0

## 5.26.0

### Patch Changes

- @memberjunction/integration-engine@5.26.0
- @memberjunction/schema-engine@5.26.0
- @memberjunction/global@5.26.0

## 5.25.0

### Patch Changes

- @memberjunction/integration-engine@5.25.0
- @memberjunction/schema-engine@5.25.0
- @memberjunction/global@5.25.0

## 5.24.0

### Patch Changes

- @memberjunction/integration-engine@5.24.0
- @memberjunction/schema-engine@5.24.0
- @memberjunction/global@5.24.0

## 5.23.0

### Patch Changes

- Updated dependencies [247df16]
  - @memberjunction/global@5.23.0
  - @memberjunction/integration-engine@5.23.0
  - @memberjunction/schema-engine@5.23.0

## 5.22.0

### Patch Changes

- Updated dependencies [f2a6bec]
  - @memberjunction/global@5.22.0
  - @memberjunction/integration-engine@5.22.0
  - @memberjunction/schema-engine@5.22.0

## 5.21.0

### Patch Changes

- @memberjunction/integration-engine@5.21.0
- @memberjunction/schema-engine@5.21.0
- @memberjunction/global@5.21.0

## 5.20.0

### Patch Changes

- @memberjunction/integration-engine@5.20.0
- @memberjunction/schema-engine@5.20.0
- @memberjunction/global@5.20.0

## 5.19.0

### Patch Changes

- @memberjunction/integration-engine@5.19.0
- @memberjunction/global@5.19.0
- @memberjunction/schema-engine@5.19.0

## 5.18.0

### Patch Changes

- @memberjunction/integration-engine@5.18.0
- @memberjunction/schema-engine@5.18.0
- @memberjunction/global@5.18.0

## 5.17.0

### Minor Changes

- bbfbf5e: Runtime Schema Update (RSU) system with 32 integration lifecycle API endpoints, schema evolution, sync cancellation, watermark filtering, progress polling, and cascade delete fixes.

### Patch Changes

- Updated dependencies [bbfbf5e]
  - @memberjunction/schema-engine@5.17.0
  - @memberjunction/integration-engine@5.17.0
  - @memberjunction/global@5.17.0

## 5.16.0

### Patch Changes

- @memberjunction/integration-engine@5.16.0
- @memberjunction/global@5.16.0

## 5.15.0

### Patch Changes

- @memberjunction/integration-engine@5.15.0
- @memberjunction/global@5.15.0

## 5.14.0

### Patch Changes

- Updated dependencies [140fc6d]
- Updated dependencies [6489cd8]
  - @memberjunction/integration-engine@5.14.0
  - @memberjunction/global@5.14.0

## 5.13.0

### Patch Changes

- Updated dependencies [f72b538]
  - @memberjunction/global@5.13.0
  - @memberjunction/integration-engine@5.13.0

## 5.12.0

### Minor Changes

- 6f9350c: migration

### Patch Changes

- Updated dependencies [6f9350c]
- Updated dependencies [257512b]
  - @memberjunction/integration-engine@5.12.0
  - @memberjunction/global@5.12.0

## 5.11.0

### Patch Changes

- @memberjunction/integration-engine@5.11.0
- @memberjunction/global@5.11.0

## 5.10.1

### Patch Changes

- @memberjunction/integration-engine@5.10.1
- @memberjunction/global@5.10.1

## 5.10.0

### Patch Changes

- @memberjunction/integration-engine@5.10.0
- @memberjunction/global@5.10.0

## 5.9.0

### Minor Changes

- 89b6abe: migration

### Patch Changes

- Updated dependencies [89b6abe]
- Updated dependencies [194ddf2]
  - @memberjunction/integration-engine@5.9.0
  - @memberjunction/global@5.9.0

## 5.8.0

### Patch Changes

- @memberjunction/integration-engine@5.8.0
- @memberjunction/global@5.8.0
