# @memberjunction/metadata-sync

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
