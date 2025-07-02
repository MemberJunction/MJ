# @memberjunction/metadata-sync

## 2.62.0

### Patch Changes

- Updated dependencies [c995603]
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/core-entities-server@2.62.0
  - @memberjunction/sqlserver-dataprovider@2.62.0
  - @memberjunction/graphql-dataprovider@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/core-entities-server@2.61.0
- @memberjunction/sqlserver-dataprovider@2.61.0
- @memberjunction/graphql-dataprovider@2.61.0
- @memberjunction/core@2.61.0
- @memberjunction/core-entities@2.61.0
- @memberjunction/global@2.61.0

## 2.60.0

### Patch Changes

- Updated dependencies [b5fa80a]
- Updated dependencies [e30ee12]
- Updated dependencies [e512e4e]
  - @memberjunction/core@2.60.0
  - @memberjunction/core-entities@2.60.0
  - @memberjunction/core-entities-server@2.60.0
  - @memberjunction/graphql-dataprovider@2.60.0
  - @memberjunction/sqlserver-dataprovider@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/graphql-dataprovider@2.59.0
- @memberjunction/core@2.59.0
- @memberjunction/core-entities@2.59.0
- @memberjunction/core-entities-server@2.59.0
- @memberjunction/global@2.59.0
- @memberjunction/sqlserver-dataprovider@2.59.0

## 2.58.0

### Minor Changes

- a5f0905: Metadata fixes requires a minor bump
- 264bdc9: Migration Data Fixes

### Patch Changes

- def26fe: Added UUID generation to BaseEntity for entities that have single-column pkey that is uniqueidentifier type
- Updated dependencies [def26fe]
  - @memberjunction/core@2.58.0
  - @memberjunction/sqlserver-dataprovider@2.58.0
  - @memberjunction/graphql-dataprovider@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/core-entities-server@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Minor Changes

- 0ba485f: various bug fixes

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/core-entities-server@2.57.0
  - @memberjunction/global@2.57.0
  - @memberjunction/sqlserver-dataprovider@2.57.0
  - @memberjunction/graphql-dataprovider@2.57.0

## 2.56.0

### Patch Changes

- 17c7634: Integrate MetadataSync commands into MJCLI

  - Refactored MetadataSync from standalone CLI to reusable library
  - Moved all sync commands under `mj sync` namespace in MJCLI
  - Added service-based architecture for better modularity
  - Removed oclif dependencies from MetadataSync package

- Updated dependencies [bf24cae]
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/core-entities-server@2.56.0
  - @memberjunction/sqlserver-dataprovider@2.56.0
  - @memberjunction/graphql-dataprovider@2.56.0
  - @memberjunction/core@2.56.0
  - @memberjunction/global@2.56.0

## 2.55.0

### Minor Changes

- 49a4bd2: Migration file for new metadata for demo marketing agent along with metadata sync tool improvement

### Patch Changes

- Updated dependencies [c3a49ff]
- Updated dependencies [659f892]
  - @memberjunction/sqlserver-dataprovider@2.55.0
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/core-entities-server@2.55.0
  - @memberjunction/graphql-dataprovider@2.55.0
  - @memberjunction/core@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- 98ef1f7: Loop Agent Type improvement + Metadata Sync tool Feeature for @include
- Updated dependencies [20f424d]
- Updated dependencies [dfca664]
- Updated dependencies [1273b07]
  - @memberjunction/core@2.54.0
  - @memberjunction/sqlserver-dataprovider@2.54.0
  - @memberjunction/graphql-dataprovider@2.54.0
  - @memberjunction/core-entities@2.54.0
  - @memberjunction/core-entities-server@2.54.0
  - @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- Updated dependencies [bddc4ea]
- Updated dependencies [720aa19]
  - @memberjunction/core@2.53.0
  - @memberjunction/core-entities@2.53.0
  - @memberjunction/graphql-dataprovider@2.53.0
  - @memberjunction/core-entities-server@2.53.0
  - @memberjunction/sqlserver-dataprovider@2.53.0
  - @memberjunction/global@2.53.0

## 2.52.0

### Minor Changes

- e926106: Significant improvements to AI functionality

### Patch Changes

- Updated dependencies [e926106]
  - @memberjunction/core@2.52.0
  - @memberjunction/core-entities@2.52.0
  - @memberjunction/sqlserver-dataprovider@2.52.0
  - @memberjunction/core-entities-server@2.52.0
  - @memberjunction/graphql-dataprovider@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Patch Changes

- Updated dependencies [4a79606]
- Updated dependencies [7a9b88e]
- Updated dependencies [53f8167]
  - @memberjunction/core-entities-server@2.51.0
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/sqlserver-dataprovider@2.51.0
  - @memberjunction/graphql-dataprovider@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/graphql-dataprovider@2.50.0
- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0
- @memberjunction/core-entities-server@2.50.0
- @memberjunction/global@2.50.0
- @memberjunction/sqlserver-dataprovider@2.50.0

## 2.49.0

### Minor Changes

- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- 9350c54: Enhance error handling and add comprehensive user guidance

  - Improve error message formatting across all CLI commands to show readable errors instead of "[object
    Object]"
  - Add extensive documentation for creating error-free entity files with step-by-step guides
  - Include entity structure discovery guidance and troubleshooting reference
  - Fix common configuration mistakes in test data and examples
  - Add AI/LLM guidelines to prevent future automation errors

- ec4807f: Add recursive patterns support for self-referencing entities in pull commands. Enable automatic hierarchy traversal with `recursive: true` flag, eliminating manual nesting level configuration. Includes configurable depth limits, circular reference protection, and maintains backward compatibility with existing configurations.
- Updated dependencies [2f974e2]
- Updated dependencies [cc52ced]
- Updated dependencies [ca3365f]
- Updated dependencies [db17ed7]
- Updated dependencies [62cf1b6]
  - @memberjunction/core-entities@2.49.0
  - @memberjunction/core@2.49.0
  - @memberjunction/core-entities-server@2.49.0
  - @memberjunction/global@2.49.0
  - @memberjunction/sqlserver-dataprovider@2.49.0
  - @memberjunction/graphql-dataprovider@2.49.0

## 2.48.0

### Patch Changes

- Updated dependencies [bb01fcf]
- Updated dependencies [031e724]
  - @memberjunction/core@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/core-entities-server@2.48.0
  - @memberjunction/graphql-dataprovider@2.48.0
  - @memberjunction/sqlserver-dataprovider@2.48.0

## 2.47.0

### Patch Changes

- Updated dependencies [3f31192]
  - @memberjunction/sqlserver-dataprovider@2.47.0
  - @memberjunction/core-entities-server@2.47.0
  - @memberjunction/graphql-dataprovider@2.47.0
  - @memberjunction/core@2.47.0
  - @memberjunction/core-entities@2.47.0

## 2.46.0

### Patch Changes

- Updated dependencies [fa98215]
  - @memberjunction/core-entities-server@2.46.0
  - @memberjunction/graphql-dataprovider@2.46.0
  - @memberjunction/core@2.46.0
  - @memberjunction/core-entities@2.46.0
  - @memberjunction/sqlserver-dataprovider@2.46.0
