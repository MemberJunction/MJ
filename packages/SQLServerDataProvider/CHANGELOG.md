# Change Log - @memberjunction/sqlserver-dataprovider

## 2.79.0

### Patch Changes

- Updated dependencies [4bf2634]
- Updated dependencies [907e73f]
- Updated dependencies [bad1a60]
  - @memberjunction/core-entities@2.79.0
  - @memberjunction/global@2.79.0
  - @memberjunction/ai@2.79.0
  - @memberjunction/actions@2.79.0
  - @memberjunction/aiengine@2.79.0
  - @memberjunction/ai-vector-dupe@2.79.0
  - @memberjunction/queue@2.79.0
  - @memberjunction/core@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [ef7c014]
- Updated dependencies [06088e5]
  - @memberjunction/ai@2.78.0
  - @memberjunction/core-entities@2.78.0
  - @memberjunction/aiengine@2.78.0
  - @memberjunction/ai-vector-dupe@2.78.0
  - @memberjunction/actions@2.78.0
  - @memberjunction/queue@2.78.0
  - @memberjunction/core@2.78.0
  - @memberjunction/global@2.78.0

## 2.77.0

### Minor Changes

- d8f14a2: significant changes in all of these
- c91269e: migration file for permissions driving minor bump

### Patch Changes

- 476a458: minor comment
- Updated dependencies [d8f14a2]
- Updated dependencies [8ee0d86]
- Updated dependencies [c91269e]
  - @memberjunction/core@2.77.0
  - @memberjunction/core-entities@2.77.0
  - @memberjunction/aiengine@2.77.0
  - @memberjunction/ai-vector-dupe@2.77.0
  - @memberjunction/actions@2.77.0
  - @memberjunction/queue@2.77.0
  - @memberjunction/ai@2.77.0
  - @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- 7dabb22: feat: add hierarchical CategoryName support for query lookup

  Adds support for hierarchical category paths in query lookup operations.
  The CategoryName parameter now accepts filesystem-like paths (e.g.,
  "/MJ/AI/Agents/") that walk through the QueryCategory parent-child
  relationships.

  ### New Features

  - **Hierarchical Path Resolution**: CategoryName now supports paths like
    "/MJ/AI/Agents/" that are parsed by splitting on "/" and walking down the
    category hierarchy using ParentID relationships
  - **CategoryPath Property**: Added CategoryPath getter to QueryInfo class
    that returns the full hierarchical path for any query
  - **Backward Compatibility**: Existing simple CategoryName usage (e.g.,
    "Agents") continues to work unchanged

- Updated dependencies [4b27b3c]
- Updated dependencies [7dabb22]
- Updated dependencies [ffda243]
  - @memberjunction/core-entities@2.76.0
  - @memberjunction/core@2.76.0
  - @memberjunction/aiengine@2.76.0
  - @memberjunction/ai-vector-dupe@2.76.0
  - @memberjunction/actions@2.76.0
  - @memberjunction/queue@2.76.0
  - @memberjunction/ai@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- @memberjunction/actions@2.75.0
- @memberjunction/ai@2.75.0
- @memberjunction/aiengine@2.75.0
- @memberjunction/ai-vector-dupe@2.75.0
- @memberjunction/core@2.75.0
- @memberjunction/core-entities@2.75.0
- @memberjunction/global@2.75.0
- @memberjunction/queue@2.75.0

## 2.74.0

### Patch Changes

- Updated dependencies [b70301e]
- Updated dependencies [d316670]
  - @memberjunction/core-entities@2.74.0
  - @memberjunction/core@2.74.0
  - @memberjunction/aiengine@2.74.0
  - @memberjunction/ai-vector-dupe@2.74.0
  - @memberjunction/actions@2.74.0
  - @memberjunction/queue@2.74.0
  - @memberjunction/ai@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- Updated dependencies [26c2b03]
- Updated dependencies [e99336f]
- Updated dependencies [eebfb9a]
  - @memberjunction/aiengine@2.73.0
  - @memberjunction/core-entities@2.73.0
  - @memberjunction/ai@2.73.0
  - @memberjunction/ai-vector-dupe@2.73.0
  - @memberjunction/actions@2.73.0
  - @memberjunction/queue@2.73.0
  - @memberjunction/core@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- Updated dependencies [636b6ee]
  - @memberjunction/core-entities@2.72.0
  - @memberjunction/aiengine@2.72.0
  - @memberjunction/ai-vector-dupe@2.72.0
  - @memberjunction/actions@2.72.0
  - @memberjunction/queue@2.72.0
  - @memberjunction/ai@2.72.0
  - @memberjunction/core@2.72.0
  - @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0
  - @memberjunction/ai@2.71.0
  - @memberjunction/aiengine@2.71.0
  - @memberjunction/ai-vector-dupe@2.71.0
  - @memberjunction/actions@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/core-entities@2.71.0
  - @memberjunction/queue@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/ai@2.70.0
  - @memberjunction/aiengine@2.70.0
  - @memberjunction/ai-vector-dupe@2.70.0
  - @memberjunction/actions@2.70.0
  - @memberjunction/core@2.70.0
  - @memberjunction/core-entities@2.70.0
  - @memberjunction/queue@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/aiengine@2.69.1
  - @memberjunction/ai-vector-dupe@2.69.1
  - @memberjunction/actions@2.69.1
  - @memberjunction/core-entities@2.69.1
  - @memberjunction/queue@2.69.1
  - @memberjunction/ai@2.69.1
  - @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/core@2.69.0
  - @memberjunction/global@2.69.0
  - @memberjunction/actions@2.69.0
  - @memberjunction/aiengine@2.69.0
  - @memberjunction/ai-vector-dupe@2.69.0
  - @memberjunction/core-entities@2.69.0
  - @memberjunction/queue@2.69.0
  - @memberjunction/ai@2.69.0

## 2.68.0

### Minor Changes

- a6b43d0: major changes to spDelete handling

### Patch Changes

- Updated dependencies [b10b7e6]
  - @memberjunction/core@2.68.0
  - @memberjunction/actions@2.68.0
  - @memberjunction/aiengine@2.68.0
  - @memberjunction/ai-vector-dupe@2.68.0
  - @memberjunction/core-entities@2.68.0
  - @memberjunction/queue@2.68.0
  - @memberjunction/ai@2.68.0
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- 1fbfc26: handle flyway templates like ${id} becoming

## 2.66.0

### Patch Changes

- Updated dependencies [7e22e3e]
  - @memberjunction/actions@2.66.0
  - @memberjunction/aiengine@2.66.0
  - @memberjunction/ai-vector-dupe@2.66.0
  - @memberjunction/queue@2.66.0
  - @memberjunction/ai@2.66.0
  - @memberjunction/core@2.66.0
  - @memberjunction/core-entities@2.66.0
  - @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- 619488f: Pattern filtering for sql logging
- Updated dependencies [1d034b7]
- Updated dependencies [619488f]
- Updated dependencies [b029c5d]
  - @memberjunction/ai@2.65.0
  - @memberjunction/global@2.65.0
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/aiengine@2.65.0
  - @memberjunction/ai-vector-dupe@2.65.0
  - @memberjunction/actions@2.65.0
  - @memberjunction/queue@2.65.0
  - @memberjunction/core@2.65.0

## 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/aiengine@2.64.0
  - @memberjunction/ai-vector-dupe@2.64.0
  - @memberjunction/actions@2.64.0
  - @memberjunction/queue@2.64.0
  - @memberjunction/ai@2.64.0
  - @memberjunction/core@2.64.0
  - @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/ai@2.63.1
  - @memberjunction/aiengine@2.63.1
  - @memberjunction/ai-vector-dupe@2.63.1
  - @memberjunction/actions@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1
  - @memberjunction/queue@2.63.1

## 2.63.0

### Patch Changes

- Updated dependencies [28e8a85]
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/aiengine@2.63.0
  - @memberjunction/actions@2.63.0
  - @memberjunction/ai-vector-dupe@2.63.0
  - @memberjunction/queue@2.63.0
  - @memberjunction/ai@2.63.0
  - @memberjunction/core@2.63.0
  - @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [c995603]
  - @memberjunction/ai@2.62.0
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/actions@2.62.0
  - @memberjunction/aiengine@2.62.0
  - @memberjunction/ai-vector-dupe@2.62.0
  - @memberjunction/queue@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- Updated dependencies [51b2b47]
  - @memberjunction/actions@2.61.0
  - @memberjunction/aiengine@2.61.0
  - @memberjunction/ai-vector-dupe@2.61.0
  - @memberjunction/queue@2.61.0
  - @memberjunction/ai@2.61.0
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
  - @memberjunction/aiengine@2.60.0
  - @memberjunction/actions@2.60.0
  - @memberjunction/ai-vector-dupe@2.60.0
  - @memberjunction/queue@2.60.0
  - @memberjunction/ai@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/ai@2.59.0
- @memberjunction/aiengine@2.59.0
- @memberjunction/ai-vector-dupe@2.59.0
- @memberjunction/actions@2.59.0
- @memberjunction/core@2.59.0
- @memberjunction/core-entities@2.59.0
- @memberjunction/global@2.59.0
- @memberjunction/queue@2.59.0

## 2.58.0

### Patch Changes

- def26fe: Added UUID generation to BaseEntity for entities that have single-column pkey that is uniqueidentifier type
- Updated dependencies [def26fe]
- Updated dependencies [db88416]
  - @memberjunction/core@2.58.0
  - @memberjunction/ai@2.58.0
  - @memberjunction/aiengine@2.58.0
  - @memberjunction/ai-vector-dupe@2.58.0
  - @memberjunction/actions@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/queue@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Minor Changes

- 0ba485f: various bug fixes

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/global@2.57.0
  - @memberjunction/aiengine@2.57.0
  - @memberjunction/ai-vector-dupe@2.57.0
  - @memberjunction/actions@2.57.0
  - @memberjunction/queue@2.57.0
  - @memberjunction/ai@2.57.0

## 2.56.0

### Patch Changes

- Updated dependencies [bf24cae]
  - @memberjunction/actions@2.56.0
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/aiengine@2.56.0
  - @memberjunction/ai-vector-dupe@2.56.0
  - @memberjunction/queue@2.56.0
  - @memberjunction/ai@2.56.0
  - @memberjunction/core@2.56.0
  - @memberjunction/global@2.56.0

## 2.55.0

### Minor Changes

- c3a49ff: Agent Manager + SQL Server fix + fix deps in core-entity-forms

### Patch Changes

- Updated dependencies [c3a49ff]
- Updated dependencies [659f892]
  - @memberjunction/ai@2.55.0
  - @memberjunction/aiengine@2.55.0
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/ai-vector-dupe@2.55.0
  - @memberjunction/actions@2.55.0
  - @memberjunction/queue@2.55.0
  - @memberjunction/core@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- dfca664: **SQLServerDataProvider Changes:**

  - SQLServerTransactionGroup now immediately rolls back and stops processing on first operation failure
  - Enhanced error handling to prevent double rollback attempts
  - Improved error messages to clearly indicate when transactions are rolled back

- 1273b07: fix transaction handling
- Updated dependencies [20f424d]
- Updated dependencies [a6f553e]
- Updated dependencies [0f6e995]
- Updated dependencies [0046359]
  - @memberjunction/core@2.54.0
  - @memberjunction/aiengine@2.54.0
  - @memberjunction/ai-vector-dupe@2.54.0
  - @memberjunction/actions@2.54.0
  - @memberjunction/core-entities@2.54.0
  - @memberjunction/queue@2.54.0
  - @memberjunction/ai@2.54.0
  - @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- Updated dependencies [bddc4ea]
- Updated dependencies [390f587]
- Updated dependencies [b5560c0]
  - @memberjunction/core@2.53.0
  - @memberjunction/core-entities@2.53.0
  - @memberjunction/actions@2.53.0
  - @memberjunction/aiengine@2.53.0
  - @memberjunction/ai-vector-dupe@2.53.0
  - @memberjunction/queue@2.53.0
  - @memberjunction/ai@2.53.0
  - @memberjunction/global@2.53.0

## 2.52.0

### Patch Changes

- Updated dependencies [e926106]
- Updated dependencies [760e844]
  - @memberjunction/ai@2.52.0
  - @memberjunction/aiengine@2.52.0
  - @memberjunction/ai-vector-dupe@2.52.0
  - @memberjunction/core@2.52.0
  - @memberjunction/core-entities@2.52.0
  - @memberjunction/actions@2.52.0
  - @memberjunction/queue@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Patch Changes

- Updated dependencies [4a79606]
- Updated dependencies [faf513c]
- Updated dependencies [7a9b88e]
- Updated dependencies [53f8167]
- Updated dependencies [0ddb438]
  - @memberjunction/ai@2.51.0
  - @memberjunction/aiengine@2.51.0
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/actions@2.51.0
  - @memberjunction/ai-vector-dupe@2.51.0
  - @memberjunction/queue@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/ai@2.50.0
- @memberjunction/aiengine@2.50.0
- @memberjunction/ai-vector-dupe@2.50.0
- @memberjunction/actions@2.50.0
- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0
- @memberjunction/global@2.50.0
- @memberjunction/queue@2.50.0

## 2.49.0

### Minor Changes

- cc52ced: Significant changes all around
- db17ed7: Further Updates
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
  - @memberjunction/global@2.49.0
  - @memberjunction/actions@2.49.0
  - @memberjunction/ai@2.49.0
  - @memberjunction/aiengine@2.49.0
  - @memberjunction/ai-vector-dupe@2.49.0
  - @memberjunction/queue@2.49.0

## 2.48.0

### Patch Changes

- Updated dependencies [bb01fcf]
- Updated dependencies [031e724]
  - @memberjunction/core@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/aiengine@2.48.0
  - @memberjunction/ai-vector-dupe@2.48.0
  - @memberjunction/actions@2.48.0
  - @memberjunction/queue@2.48.0
  - @memberjunction/ai@2.48.0
  - @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- 3f31192: bug fixes for date handling ISO strings for null dates
  - @memberjunction/aiengine@2.47.0
  - @memberjunction/ai-vector-dupe@2.47.0
  - @memberjunction/actions@2.47.0
  - @memberjunction/queue@2.47.0
  - @memberjunction/ai@2.47.0
  - @memberjunction/core@2.47.0
  - @memberjunction/core-entities@2.47.0
  - @memberjunction/global@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/ai@2.46.0
- @memberjunction/aiengine@2.46.0
- @memberjunction/ai-vector-dupe@2.46.0
- @memberjunction/actions@2.46.0
- @memberjunction/core@2.46.0
- @memberjunction/core-entities@2.46.0
- @memberjunction/global@2.46.0
- @memberjunction/queue@2.46.0

## 2.45.0

### Patch Changes

- Updated dependencies [21d456d]
- Updated dependencies [556ee8d]
  - @memberjunction/ai@2.45.0
  - @memberjunction/aiengine@2.45.0
  - @memberjunction/core-entities@2.45.0
  - @memberjunction/ai-vector-dupe@2.45.0
  - @memberjunction/actions@2.45.0
  - @memberjunction/queue@2.45.0
  - @memberjunction/core@2.45.0
  - @memberjunction/global@2.45.0

## 2.44.0

### Patch Changes

- Updated dependencies [f7aec1c]
- Updated dependencies [fbc30dc]
- Updated dependencies [9f02cd8]
- Updated dependencies [99b27c5]
- Updated dependencies [091c5f6]
  - @memberjunction/aiengine@2.44.0
  - @memberjunction/ai@2.44.0
  - @memberjunction/core@2.44.0
  - @memberjunction/core-entities@2.44.0
  - @memberjunction/ai-vector-dupe@2.44.0
  - @memberjunction/actions@2.44.0
  - @memberjunction/queue@2.44.0
  - @memberjunction/global@2.44.0

## 2.43.0

### Patch Changes

- Updated dependencies [1629c04]
  - @memberjunction/core@2.43.0
  - @memberjunction/aiengine@2.43.0
  - @memberjunction/ai-vector-dupe@2.43.0
  - @memberjunction/actions@2.43.0
  - @memberjunction/core-entities@2.43.0
  - @memberjunction/queue@2.43.0
  - @memberjunction/ai@2.43.0
  - @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/ai@2.42.1
- @memberjunction/aiengine@2.42.1
- @memberjunction/ai-vector-dupe@2.42.1
- @memberjunction/actions@2.42.1
- @memberjunction/core@2.42.1
- @memberjunction/core-entities@2.42.1
- @memberjunction/global@2.42.1
- @memberjunction/queue@2.42.1

## 2.42.0

### Minor Changes

- 5c4ff39: bug fix for DatasetTimestamp comparison

### Patch Changes

- Updated dependencies [d49f25c]
  - @memberjunction/ai@2.42.0
  - @memberjunction/aiengine@2.42.0
  - @memberjunction/ai-vector-dupe@2.42.0
  - @memberjunction/actions@2.42.0
  - @memberjunction/queue@2.42.0
  - @memberjunction/core@2.42.0
  - @memberjunction/core-entities@2.42.0
  - @memberjunction/global@2.42.0

## 2.41.0

### Patch Changes

- 3be3f71: Patched sql stored procedure name for tables with name colisions.
- Updated dependencies [3be3f71]
- Updated dependencies [9d3b577]
- Updated dependencies [276371d]
- Updated dependencies [7e0523d]
  - @memberjunction/core@2.41.0
  - @memberjunction/ai@2.41.0
  - @memberjunction/core-entities@2.41.0
  - @memberjunction/aiengine@2.41.0
  - @memberjunction/ai-vector-dupe@2.41.0
  - @memberjunction/actions@2.41.0
  - @memberjunction/queue@2.41.0
  - @memberjunction/global@2.41.0

## 2.40.0

### Patch Changes

- Updated dependencies [b6ce661]
  - @memberjunction/ai@2.40.0
  - @memberjunction/aiengine@2.40.0
  - @memberjunction/ai-vector-dupe@2.40.0
  - @memberjunction/actions@2.40.0
  - @memberjunction/queue@2.40.0
  - @memberjunction/core@2.40.0
  - @memberjunction/core-entities@2.40.0
  - @memberjunction/global@2.40.0

## 2.39.0

### Patch Changes

- Updated dependencies [f73ea0e]
- Updated dependencies [e93f580]
- Updated dependencies [c9ccc36]
  - @memberjunction/ai@2.39.0
  - @memberjunction/aiengine@2.39.0
  - @memberjunction/core-entities@2.39.0
  - @memberjunction/ai-vector-dupe@2.39.0
  - @memberjunction/actions@2.39.0
  - @memberjunction/queue@2.39.0
  - @memberjunction/core@2.39.0
  - @memberjunction/global@2.39.0

## 2.38.0

### Patch Changes

- Updated dependencies [c835ded]
  - @memberjunction/core-entities@2.38.0
  - @memberjunction/aiengine@2.38.0
  - @memberjunction/ai-vector-dupe@2.38.0
  - @memberjunction/actions@2.38.0
  - @memberjunction/queue@2.38.0
  - @memberjunction/ai@2.38.0
  - @memberjunction/core@2.38.0
  - @memberjunction/global@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/ai@2.37.1
- @memberjunction/aiengine@2.37.1
- @memberjunction/ai-vector-dupe@2.37.1
- @memberjunction/actions@2.37.1
- @memberjunction/core@2.37.1
- @memberjunction/core-entities@2.37.1
- @memberjunction/global@2.37.1
- @memberjunction/queue@2.37.1

## 2.37.0

### Patch Changes

- Updated dependencies [1418b71]
  - @memberjunction/core-entities@2.37.0
  - @memberjunction/aiengine@2.37.0
  - @memberjunction/ai-vector-dupe@2.37.0
  - @memberjunction/actions@2.37.0
  - @memberjunction/queue@2.37.0
  - @memberjunction/ai@2.37.0
  - @memberjunction/core@2.37.0
  - @memberjunction/global@2.37.0

## 2.36.1

### Patch Changes

- Updated dependencies [d9defc9]
- Updated dependencies [9d709e2]
- Updated dependencies [577cc6a]
- Updated dependencies [b45b336]
  - @memberjunction/ai@2.36.1
  - @memberjunction/core@2.36.1
  - @memberjunction/aiengine@2.36.1
  - @memberjunction/ai-vector-dupe@2.36.1
  - @memberjunction/actions@2.36.1
  - @memberjunction/queue@2.36.1
  - @memberjunction/core-entities@2.36.1
  - @memberjunction/global@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
- Updated dependencies [160f24f]
  - @memberjunction/ai-vector-dupe@2.36.0
  - @memberjunction/actions@2.36.0
  - @memberjunction/core-entities@2.36.0
  - @memberjunction/aiengine@2.36.0
  - @memberjunction/global@2.36.0
  - @memberjunction/ai@2.36.0
  - @memberjunction/queue@2.36.0
  - @memberjunction/core@2.36.0

## 2.35.1

### Patch Changes

- 3e7ec64: Strong typing for transaction item callback function and fix bug in SQL Server Data Provider caused by weak typing
- Updated dependencies [3e7ec64]
  - @memberjunction/core@2.35.1
  - @memberjunction/aiengine@2.35.1
  - @memberjunction/ai-vector-dupe@2.35.1
  - @memberjunction/actions@2.35.1
  - @memberjunction/core-entities@2.35.1
  - @memberjunction/queue@2.35.1
  - @memberjunction/ai@2.35.1
  - @memberjunction/global@2.35.1

## 2.35.0

### Patch Changes

- @memberjunction/ai-vector-dupe@2.35.0
- @memberjunction/ai@2.35.0
- @memberjunction/aiengine@2.35.0
- @memberjunction/actions@2.35.0
- @memberjunction/core@2.35.0
- @memberjunction/core-entities@2.35.0
- @memberjunction/global@2.35.0
- @memberjunction/queue@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/ai@2.34.2
- @memberjunction/aiengine@2.34.2
- @memberjunction/ai-vector-dupe@2.34.2
- @memberjunction/actions@2.34.2
- @memberjunction/core@2.34.2
- @memberjunction/core-entities@2.34.2
- @memberjunction/global@2.34.2
- @memberjunction/queue@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/ai@2.34.1
- @memberjunction/aiengine@2.34.1
- @memberjunction/ai-vector-dupe@2.34.1
- @memberjunction/actions@2.34.1
- @memberjunction/core@2.34.1
- @memberjunction/core-entities@2.34.1
- @memberjunction/global@2.34.1
- @memberjunction/queue@2.34.1

## 2.34.0

### Patch Changes

- Updated dependencies [e60f326]
- Updated dependencies [785f06a]
- Updated dependencies [b48d6b4]
- Updated dependencies [4c7f532]
- Updated dependencies [54ac86c]
  - @memberjunction/core-entities@2.34.0
  - @memberjunction/core@2.34.0
  - @memberjunction/ai@2.34.0
  - @memberjunction/aiengine@2.34.0
  - @memberjunction/ai-vector-dupe@2.34.0
  - @memberjunction/actions@2.34.0
  - @memberjunction/queue@2.34.0
  - @memberjunction/global@2.34.0

## 2.33.0

### Patch Changes

- 02d7391: Claude Code Performance Optimizations for MJServer and SQLServerDataProvider as proposed
- Updated dependencies [efafd0e]
  - @memberjunction/ai@2.33.0
  - @memberjunction/ai-vector-dupe@2.33.0
  - @memberjunction/aiengine@2.33.0
  - @memberjunction/actions@2.33.0
  - @memberjunction/queue@2.33.0
  - @memberjunction/core@2.33.0
  - @memberjunction/core-entities@2.33.0
  - @memberjunction/global@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/ai@2.32.2
- @memberjunction/aiengine@2.32.2
- @memberjunction/ai-vector-dupe@2.32.2
- @memberjunction/actions@2.32.2
- @memberjunction/core@2.32.2
- @memberjunction/core-entities@2.32.2
- @memberjunction/global@2.32.2
- @memberjunction/queue@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/ai@2.32.1
- @memberjunction/aiengine@2.32.1
- @memberjunction/ai-vector-dupe@2.32.1
- @memberjunction/actions@2.32.1
- @memberjunction/core@2.32.1
- @memberjunction/core-entities@2.32.1
- @memberjunction/global@2.32.1
- @memberjunction/queue@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/ai@2.32.0
- @memberjunction/aiengine@2.32.0
- @memberjunction/ai-vector-dupe@2.32.0
- @memberjunction/actions@2.32.0
- @memberjunction/core@2.32.0
- @memberjunction/core-entities@2.32.0
- @memberjunction/global@2.32.0
- @memberjunction/queue@2.32.0

## 2.31.0

### Patch Changes

- Updated dependencies [67c0b7f]
  - @memberjunction/aiengine@2.31.0
  - @memberjunction/ai-vector-dupe@2.31.0
  - @memberjunction/actions@2.31.0
  - @memberjunction/queue@2.31.0
  - @memberjunction/ai@2.31.0
  - @memberjunction/core@2.31.0
  - @memberjunction/core-entities@2.31.0
  - @memberjunction/global@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [8f71da0]
- Updated dependencies [a3ab749]
- Updated dependencies [63dc5a9]
  - @memberjunction/actions@2.30.0
  - @memberjunction/aiengine@2.30.0
  - @memberjunction/core-entities@2.30.0
  - @memberjunction/global@2.30.0
  - @memberjunction/ai-vector-dupe@2.30.0
  - @memberjunction/queue@2.30.0
  - @memberjunction/ai@2.30.0
  - @memberjunction/core@2.30.0

## 2.29.2

### Patch Changes

- 64aa7f0: New query for 2.29.0 to get version history since we aren't using an entity for flyway data anymore. Improvements to query execution to support query execution by name as well as by ID, and general cleanup (code wasn't working before as query ID wasn't enclosed in quotes from days of INT ID types)
- Updated dependencies [07bde92]
- Updated dependencies [64aa7f0]
- Updated dependencies [69c3505]
  - @memberjunction/core@2.29.2
  - @memberjunction/core-entities@2.29.2
  - @memberjunction/aiengine@2.29.2
  - @memberjunction/ai-vector-dupe@2.29.2
  - @memberjunction/actions@2.29.2
  - @memberjunction/queue@2.29.2
  - @memberjunction/ai@2.29.2
  - @memberjunction/global@2.29.2

## 2.28.0

### Patch Changes

- Updated dependencies [8259093]
  - @memberjunction/core@2.28.0
  - @memberjunction/aiengine@2.28.0
  - @memberjunction/ai-vector-dupe@2.28.0
  - @memberjunction/actions@2.28.0
  - @memberjunction/core-entities@2.28.0
  - @memberjunction/queue@2.28.0
  - @memberjunction/ai@2.28.0
  - @memberjunction/global@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/ai@2.27.1
- @memberjunction/aiengine@2.27.1
- @memberjunction/ai-vector-dupe@2.27.1
- @memberjunction/actions@2.27.1
- @memberjunction/core@2.27.1
- @memberjunction/core-entities@2.27.1
- @memberjunction/global@2.27.1
- @memberjunction/queue@2.27.1

## 2.27.0

### Patch Changes

- Updated dependencies [54ab868]
- Updated dependencies [b4d3cbc]
- Updated dependencies [5a81451]
  - @memberjunction/core@2.27.0
  - @memberjunction/ai@2.27.0
  - @memberjunction/core-entities@2.27.0
  - @memberjunction/aiengine@2.27.0
  - @memberjunction/ai-vector-dupe@2.27.0
  - @memberjunction/actions@2.27.0
  - @memberjunction/queue@2.27.0
  - @memberjunction/global@2.27.0

## 2.26.1

### Patch Changes

- @memberjunction/ai@2.26.1
- @memberjunction/aiengine@2.26.1
- @memberjunction/ai-vector-dupe@2.26.1
- @memberjunction/actions@2.26.1
- @memberjunction/core@2.26.1
- @memberjunction/core-entities@2.26.1
- @memberjunction/global@2.26.1
- @memberjunction/queue@2.26.1

## 2.26.0

### Minor Changes

- 23801c5: Changes to use of TransactionGroup to use await at all times.Fixed up some metadata bugs in the \_\_mj schema that somehow existed from prior builds.Cleaned up SQL Server Data Provider handling of virtual fields in track record changesFixed CodeGen to not emit null wrapped as a string that was happening in some casesHardened MJCore.BaseEntity to treat a string with the word null in it as same as a true null value (in case someone throws that into the DB)

### Patch Changes

- Updated dependencies [23801c5]
  - @memberjunction/core@2.26.0
  - @memberjunction/aiengine@2.26.0
  - @memberjunction/ai-vector-dupe@2.26.0
  - @memberjunction/actions@2.26.0
  - @memberjunction/core-entities@2.26.0
  - @memberjunction/queue@2.26.0
  - @memberjunction/ai@2.26.0
  - @memberjunction/global@2.26.0

## 2.25.0

### Minor Changes

- 26c990d: - Add Conversations to Resource Types Entity* Update User View Grid to fix multi-edit bug* Transaction Management Changes - fixes bug in #803 - but not new feature in there* Clean bug in Notification Service to only show user-centric messages* Add Sharing dialog to Skip Chat component

### Patch Changes

- 0647504: support new TransactionItem constructor in SQLServerDataProvider
- 824eca2: Transaction Group improvements
- 86e6d3b: Finished debug for Variables support in transaction groups!
- Updated dependencies [fd07dcd]
- Updated dependencies [26c990d]
- Updated dependencies [86e6d3b]
  - @memberjunction/core@2.25.0
  - @memberjunction/aiengine@2.25.0
  - @memberjunction/ai-vector-dupe@2.25.0
  - @memberjunction/actions@2.25.0
  - @memberjunction/core-entities@2.25.0
  - @memberjunction/queue@2.25.0
  - @memberjunction/ai@2.25.0
  - @memberjunction/global@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/ai@2.24.1
- @memberjunction/aiengine@2.24.1
- @memberjunction/ai-vector-dupe@2.24.1
- @memberjunction/actions@2.24.1
- @memberjunction/core@2.24.1
- @memberjunction/core-entities@2.24.1
- @memberjunction/global@2.24.1
- @memberjunction/queue@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [9cb85cc]
- Updated dependencies [7c6ff41]
  - @memberjunction/global@2.24.0
  - @memberjunction/core-entities@2.24.0
  - @memberjunction/ai@2.24.0
  - @memberjunction/aiengine@2.24.0
  - @memberjunction/ai-vector-dupe@2.24.0
  - @memberjunction/actions@2.24.0
  - @memberjunction/core@2.24.0
  - @memberjunction/queue@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/ai@2.23.2
- @memberjunction/aiengine@2.23.2
- @memberjunction/ai-vector-dupe@2.23.2
- @memberjunction/actions@2.23.2
- @memberjunction/core@2.23.2
- @memberjunction/core-entities@2.23.2
- @memberjunction/global@2.23.2
- @memberjunction/queue@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/ai@2.23.1
- @memberjunction/aiengine@2.23.1
- @memberjunction/ai-vector-dupe@2.23.1
- @memberjunction/actions@2.23.1
- @memberjunction/core@2.23.1
- @memberjunction/core-entities@2.23.1
- @memberjunction/global@2.23.1
- @memberjunction/queue@2.23.1

## 2.23.0

### Minor Changes

- 09d3fa9: Defaulting cache refresh interval to disabled to allow database pausing unless refresh is explicitly set.

### Patch Changes

- Updated dependencies [38b7507]
  - @memberjunction/global@2.23.0
  - @memberjunction/ai@2.23.0
  - @memberjunction/aiengine@2.23.0
  - @memberjunction/ai-vector-dupe@2.23.0
  - @memberjunction/actions@2.23.0
  - @memberjunction/core@2.23.0
  - @memberjunction/core-entities@2.23.0
  - @memberjunction/queue@2.23.0

## 2.22.2

### Patch Changes

- Updated dependencies [94ebf81]
  - @memberjunction/core@2.22.2
  - @memberjunction/aiengine@2.22.2
  - @memberjunction/ai-vector-dupe@2.22.2
  - @memberjunction/actions@2.22.2
  - @memberjunction/core-entities@2.22.2
  - @memberjunction/queue@2.22.2
  - @memberjunction/ai@2.22.2
  - @memberjunction/global@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/ai@2.22.1
- @memberjunction/aiengine@2.22.1
- @memberjunction/ai-vector-dupe@2.22.1
- @memberjunction/actions@2.22.1
- @memberjunction/core@2.22.1
- @memberjunction/core-entities@2.22.1
- @memberjunction/global@2.22.1
- @memberjunction/queue@2.22.1

## 2.22.0

### Patch Changes

- Updated dependencies [a598f1a]
- Updated dependencies [9660275]
  - @memberjunction/core@2.22.0
  - @memberjunction/global@2.22.0
  - @memberjunction/aiengine@2.22.0
  - @memberjunction/ai-vector-dupe@2.22.0
  - @memberjunction/actions@2.22.0
  - @memberjunction/core-entities@2.22.0
  - @memberjunction/queue@2.22.0
  - @memberjunction/ai@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.21.0
- Bump @memberjunction/ai to v2.21.0
- Bump @memberjunction/ai-vector-dupe to v2.21.0
- Bump @memberjunction/aiengine to v2.21.0
- Bump @memberjunction/core to v2.21.0
- Bump @memberjunction/core-entities to v2.21.0
- Bump @memberjunction/global to v2.21.0
- Bump @memberjunction/queue to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

### Patches

- Bump @memberjunction/actions to v2.20.3
- Bump @memberjunction/ai to v2.20.3
- Bump @memberjunction/ai-vector-dupe to v2.20.3
- Bump @memberjunction/aiengine to v2.20.3
- Bump @memberjunction/core to v2.20.3
- Bump @memberjunction/core-entities to v2.20.3
- Bump @memberjunction/global to v2.20.3
- Bump @memberjunction/queue to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Bump @memberjunction/actions to v2.20.2
- Bump @memberjunction/ai to v2.20.2
- Bump @memberjunction/ai-vector-dupe to v2.20.2
- Bump @memberjunction/aiengine to v2.20.2
- Bump @memberjunction/core to v2.20.2
- Bump @memberjunction/core-entities to v2.20.2
- Bump @memberjunction/global to v2.20.2
- Bump @memberjunction/queue to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/actions to v2.20.1
- Bump @memberjunction/ai to v2.20.1
- Bump @memberjunction/ai-vector-dupe to v2.20.1
- Bump @memberjunction/aiengine to v2.20.1
- Bump @memberjunction/core to v2.20.1
- Bump @memberjunction/core-entities to v2.20.1
- Bump @memberjunction/global to v2.20.1
- Bump @memberjunction/queue to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:03 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.20.0
- Bump @memberjunction/ai to v2.20.0
- Bump @memberjunction/ai-vector-dupe to v2.20.0
- Bump @memberjunction/aiengine to v2.20.0
- Bump @memberjunction/core to v2.20.0
- Bump @memberjunction/core-entities to v2.20.0
- Bump @memberjunction/global to v2.20.0
- Bump @memberjunction/queue to v2.20.0

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/actions to v2.19.5
- Bump @memberjunction/ai to v2.19.5
- Bump @memberjunction/ai-vector-dupe to v2.19.5
- Bump @memberjunction/aiengine to v2.19.5
- Bump @memberjunction/core to v2.19.5
- Bump @memberjunction/core-entities to v2.19.5
- Bump @memberjunction/global to v2.19.5
- Bump @memberjunction/queue to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/actions to v2.19.4
- Bump @memberjunction/ai to v2.19.4
- Bump @memberjunction/ai-vector-dupe to v2.19.4
- Bump @memberjunction/aiengine to v2.19.4
- Bump @memberjunction/core to v2.19.4
- Bump @memberjunction/core-entities to v2.19.4
- Bump @memberjunction/global to v2.19.4
- Bump @memberjunction/queue to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/actions to v2.19.3
- Bump @memberjunction/ai to v2.19.3
- Bump @memberjunction/ai-vector-dupe to v2.19.3
- Bump @memberjunction/aiengine to v2.19.3
- Bump @memberjunction/core to v2.19.3
- Bump @memberjunction/core-entities to v2.19.3
- Bump @memberjunction/global to v2.19.3
- Bump @memberjunction/queue to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/actions to v2.19.2
- Bump @memberjunction/ai to v2.19.2
- Bump @memberjunction/ai-vector-dupe to v2.19.2
- Bump @memberjunction/aiengine to v2.19.2
- Bump @memberjunction/core to v2.19.2
- Bump @memberjunction/core-entities to v2.19.2
- Bump @memberjunction/global to v2.19.2
- Bump @memberjunction/queue to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/actions to v2.19.1
- Bump @memberjunction/ai to v2.19.1
- Bump @memberjunction/ai-vector-dupe to v2.19.1
- Bump @memberjunction/aiengine to v2.19.1
- Bump @memberjunction/core to v2.19.1
- Bump @memberjunction/core-entities to v2.19.1
- Bump @memberjunction/global to v2.19.1
- Bump @memberjunction/queue to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:47 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.19.0
- Bump @memberjunction/ai to v2.19.0
- Bump @memberjunction/ai-vector-dupe to v2.19.0
- Bump @memberjunction/aiengine to v2.19.0
- Bump @memberjunction/core to v2.19.0
- Bump @memberjunction/core-entities to v2.19.0
- Bump @memberjunction/global to v2.19.0
- Bump @memberjunction/queue to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.18.3
- Bump @memberjunction/ai to v2.18.3
- Bump @memberjunction/ai-vector-dupe to v2.18.3
- Bump @memberjunction/aiengine to v2.18.3
- Bump @memberjunction/core to v2.18.3
- Bump @memberjunction/core-entities to v2.18.3
- Bump @memberjunction/global to v2.18.3
- Bump @memberjunction/queue to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/actions to v2.18.2
- Bump @memberjunction/ai to v2.18.2
- Bump @memberjunction/ai-vector-dupe to v2.18.2
- Bump @memberjunction/aiengine to v2.18.2
- Bump @memberjunction/core to v2.18.2
- Bump @memberjunction/core-entities to v2.18.2
- Bump @memberjunction/global to v2.18.2
- Bump @memberjunction/queue to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/actions to v2.18.1
- Bump @memberjunction/ai to v2.18.1
- Bump @memberjunction/ai-vector-dupe to v2.18.1
- Bump @memberjunction/aiengine to v2.18.1
- Bump @memberjunction/core to v2.18.1
- Bump @memberjunction/core-entities to v2.18.1
- Bump @memberjunction/global to v2.18.1
- Bump @memberjunction/queue to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Bump @memberjunction/actions to v2.18.0
- Bump @memberjunction/ai to v2.18.0
- Bump @memberjunction/ai-vector-dupe to v2.18.0
- Bump @memberjunction/aiengine to v2.18.0
- Bump @memberjunction/core to v2.18.0
- Bump @memberjunction/core-entities to v2.18.0
- Bump @memberjunction/global to v2.18.0
- Bump @memberjunction/queue to v2.18.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Bump @memberjunction/actions to v2.17.0
- Bump @memberjunction/ai to v2.17.0
- Bump @memberjunction/ai-vector-dupe to v2.17.0
- Bump @memberjunction/aiengine to v2.17.0
- Bump @memberjunction/core to v2.17.0
- Bump @memberjunction/core-entities to v2.17.0
- Bump @memberjunction/global to v2.17.0
- Bump @memberjunction/queue to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:27 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.16.1
- Bump @memberjunction/ai to v2.16.1
- Bump @memberjunction/ai-vector-dupe to v2.16.1
- Bump @memberjunction/aiengine to v2.16.1
- Bump @memberjunction/core to v2.16.1
- Bump @memberjunction/core-entities to v2.16.1
- Bump @memberjunction/global to v2.16.1
- Bump @memberjunction/queue to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Bump @memberjunction/actions to v2.16.0
- Bump @memberjunction/ai to v2.16.0
- Bump @memberjunction/ai-vector-dupe to v2.16.0
- Bump @memberjunction/aiengine to v2.16.0
- Bump @memberjunction/core to v2.16.0
- Bump @memberjunction/core-entities to v2.16.0
- Bump @memberjunction/global to v2.16.0
- Bump @memberjunction/queue to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:27 GMT

### Patches

- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.15.2
- Bump @memberjunction/ai to v2.15.2
- Bump @memberjunction/ai-vector-dupe to v2.15.2
- Bump @memberjunction/aiengine to v2.15.2
- Bump @memberjunction/core to v2.15.2
- Bump @memberjunction/core-entities to v2.15.2
- Bump @memberjunction/global to v2.15.2
- Bump @memberjunction/queue to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.14.0
- Bump @memberjunction/ai to v2.14.0
- Bump @memberjunction/ai-vector-dupe to v2.14.0
- Bump @memberjunction/aiengine to v2.14.0
- Bump @memberjunction/core to v2.14.0
- Bump @memberjunction/core-entities to v2.14.0
- Bump @memberjunction/global to v2.14.0
- Bump @memberjunction/queue to v2.14.0

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/actions to v2.13.4
- Bump @memberjunction/ai to v2.13.4
- Bump @memberjunction/ai-vector-dupe to v2.13.4
- Bump @memberjunction/aiengine to v2.13.4
- Bump @memberjunction/core to v2.13.4
- Bump @memberjunction/core-entities to v2.13.4
- Bump @memberjunction/global to v2.13.4
- Bump @memberjunction/queue to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:45 GMT

### Patches

- Bump @memberjunction/actions to v2.13.3
- Bump @memberjunction/ai to v2.13.3
- Bump @memberjunction/ai-vector-dupe to v2.13.3
- Bump @memberjunction/aiengine to v2.13.3
- Bump @memberjunction/core to v2.13.3
- Bump @memberjunction/core-entities to v2.13.3
- Bump @memberjunction/global to v2.13.3
- Bump @memberjunction/queue to v2.13.3

## 2.13.2

Tue, 03 Dec 2024 23:30:43 GMT

### Patches

- Bump @memberjunction/actions to v2.13.2
- Bump @memberjunction/ai to v2.13.2
- Bump @memberjunction/ai-vector-dupe to v2.13.2
- Bump @memberjunction/aiengine to v2.13.2
- Bump @memberjunction/core to v2.13.2
- Bump @memberjunction/core-entities to v2.13.2
- Bump @memberjunction/global to v2.13.2
- Bump @memberjunction/queue to v2.13.2

## 2.13.1

Wed, 27 Nov 2024 20:42:53 GMT

### Patches

- Bump @memberjunction/actions to v2.13.1
- Bump @memberjunction/ai to v2.13.1
- Bump @memberjunction/ai-vector-dupe to v2.13.1
- Bump @memberjunction/aiengine to v2.13.1
- Bump @memberjunction/core to v2.13.1
- Bump @memberjunction/core-entities to v2.13.1
- Bump @memberjunction/global to v2.13.1
- Bump @memberjunction/queue to v2.13.1

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Minor changes

- Bump @memberjunction/actions to v2.13.0
- Bump @memberjunction/ai to v2.13.0
- Bump @memberjunction/ai-vector-dupe to v2.13.0
- Bump @memberjunction/aiengine to v2.13.0
- Bump @memberjunction/core to v2.13.0
- Bump @memberjunction/core-entities to v2.13.0
- Bump @memberjunction/global to v2.13.0
- Bump @memberjunction/queue to v2.13.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.12.0

Mon, 04 Nov 2024 23:07:22 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.12.0
- Bump @memberjunction/ai to v2.12.0
- Bump @memberjunction/ai-vector-dupe to v2.12.0
- Bump @memberjunction/aiengine to v2.12.0
- Bump @memberjunction/core to v2.12.0
- Bump @memberjunction/core-entities to v2.12.0
- Bump @memberjunction/global to v2.12.0
- Bump @memberjunction/queue to v2.12.0

## 2.11.0

Thu, 24 Oct 2024 15:33:07 GMT

### Minor changes

- Bump @memberjunction/actions to v2.11.0
- Bump @memberjunction/ai to v2.11.0
- Bump @memberjunction/ai-vector-dupe to v2.11.0
- Bump @memberjunction/aiengine to v2.11.0
- Bump @memberjunction/core to v2.11.0
- Bump @memberjunction/core-entities to v2.11.0
- Bump @memberjunction/global to v2.11.0
- Bump @memberjunction/queue to v2.11.0

## 2.10.0

Wed, 23 Oct 2024 22:49:59 GMT

### Minor changes

- Bump @memberjunction/actions to v2.10.0
- Bump @memberjunction/ai to v2.10.0
- Bump @memberjunction/ai-vector-dupe to v2.10.0
- Bump @memberjunction/aiengine to v2.10.0
- Bump @memberjunction/core to v2.10.0
- Bump @memberjunction/core-entities to v2.10.0
- Bump @memberjunction/global to v2.10.0
- Bump @memberjunction/queue to v2.10.0

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Minor changes

- Bump @memberjunction/actions to v2.9.0
- Bump @memberjunction/ai to v2.9.0
- Bump @memberjunction/ai-vector-dupe to v2.9.0
- Bump @memberjunction/aiengine to v2.9.0
- Bump @memberjunction/core to v2.9.0
- Bump @memberjunction/core-entities to v2.9.0
- Bump @memberjunction/global to v2.9.0
- Bump @memberjunction/queue to v2.9.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.8.0

Tue, 15 Oct 2024 17:01:03 GMT

### Minor changes

- Bump @memberjunction/actions to v2.8.0
- Bump @memberjunction/ai to v2.8.0
- Bump @memberjunction/ai-vector-dupe to v2.8.0
- Bump @memberjunction/aiengine to v2.8.0
- Bump @memberjunction/core to v2.8.0
- Bump @memberjunction/core-entities to v2.8.0
- Bump @memberjunction/global to v2.8.0
- Bump @memberjunction/queue to v2.8.0

## 2.7.1

Tue, 08 Oct 2024 22:16:58 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.7.1
- Bump @memberjunction/ai to v2.7.1
- Bump @memberjunction/ai-vector-dupe to v2.7.1
- Bump @memberjunction/aiengine to v2.7.1
- Bump @memberjunction/core to v2.7.1
- Bump @memberjunction/core-entities to v2.7.1
- Bump @memberjunction/global to v2.7.1
- Bump @memberjunction/queue to v2.7.1

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.7.0
- Bump @memberjunction/ai to v2.7.0
- Bump @memberjunction/ai-vector-dupe to v2.7.0
- Bump @memberjunction/aiengine to v2.7.0
- Bump @memberjunction/core to v2.7.0
- Bump @memberjunction/core-entities to v2.7.0
- Bump @memberjunction/global to v2.7.0
- Bump @memberjunction/queue to v2.7.0

## 2.6.1

Mon, 30 Sep 2024 15:55:48 GMT

### Patches

- Bump @memberjunction/actions to v2.6.1
- Bump @memberjunction/ai to v2.6.1
- Bump @memberjunction/ai-vector-dupe to v2.6.1
- Bump @memberjunction/aiengine to v2.6.1
- Bump @memberjunction/core to v2.6.1
- Bump @memberjunction/core-entities to v2.6.1
- Bump @memberjunction/global to v2.6.1
- Bump @memberjunction/queue to v2.6.1

## 2.6.0

Sat, 28 Sep 2024 00:19:39 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.6.0
- Bump @memberjunction/ai to v2.6.0
- Bump @memberjunction/ai-vector-dupe to v2.6.0
- Bump @memberjunction/aiengine to v2.6.0
- Bump @memberjunction/core to v2.6.0
- Bump @memberjunction/core-entities to v2.6.0
- Bump @memberjunction/global to v2.6.0
- Bump @memberjunction/queue to v2.6.0

## 2.5.2

Sat, 28 Sep 2024 00:06:02 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

### Patches

- Bump @memberjunction/actions to v2.5.2
- Bump @memberjunction/ai to v2.5.2
- Bump @memberjunction/ai-vector-dupe to v2.5.2
- Bump @memberjunction/aiengine to v2.5.2
- Bump @memberjunction/core to v2.5.2
- Bump @memberjunction/core-entities to v2.5.2
- Bump @memberjunction/global to v2.5.2
- Bump @memberjunction/queue to v2.5.2

## 2.5.1

Fri, 20 Sep 2024 17:51:58 GMT

### Patches

- Bump @memberjunction/actions to v2.5.1
- Bump @memberjunction/ai to v2.5.1
- Bump @memberjunction/ai-vector-dupe to v2.5.1
- Bump @memberjunction/aiengine to v2.5.1
- Bump @memberjunction/core to v2.5.1
- Bump @memberjunction/core-entities to v2.5.1
- Bump @memberjunction/global to v2.5.1
- Bump @memberjunction/queue to v2.5.1

## 2.5.0

Fri, 20 Sep 2024 16:17:06 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.5.0
- Bump @memberjunction/ai to v2.5.0
- Bump @memberjunction/ai-vector-dupe to v2.5.0
- Bump @memberjunction/aiengine to v2.5.0
- Bump @memberjunction/core to v2.5.0
- Bump @memberjunction/core-entities to v2.5.0
- Bump @memberjunction/global to v2.5.0
- Bump @memberjunction/queue to v2.5.0

## 2.4.1

Sun, 08 Sep 2024 19:33:23 GMT

### Patches

- Bump @memberjunction/actions to v2.4.1
- Bump @memberjunction/ai to v2.4.1
- Bump @memberjunction/ai-vector-dupe to v2.4.1
- Bump @memberjunction/aiengine to v2.4.1
- Bump @memberjunction/core to v2.4.1
- Bump @memberjunction/core-entities to v2.4.1
- Bump @memberjunction/global to v2.4.1
- Bump @memberjunction/queue to v2.4.1

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.4.0
- Bump @memberjunction/ai to v2.4.0
- Bump @memberjunction/ai-vector-dupe to v2.4.0
- Bump @memberjunction/aiengine to v2.4.0
- Bump @memberjunction/core to v2.4.0
- Bump @memberjunction/core-entities to v2.4.0
- Bump @memberjunction/global to v2.4.0
- Bump @memberjunction/queue to v2.4.0

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Bump @memberjunction/actions to v2.3.3
- Bump @memberjunction/ai to v2.3.3
- Bump @memberjunction/ai-vector-dupe to v2.3.3
- Bump @memberjunction/aiengine to v2.3.3
- Bump @memberjunction/core to v2.3.3
- Bump @memberjunction/core-entities to v2.3.3
- Bump @memberjunction/global to v2.3.3
- Bump @memberjunction/queue to v2.3.3

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.3.2
- Bump @memberjunction/ai to v2.3.2
- Bump @memberjunction/ai-vector-dupe to v2.3.2
- Bump @memberjunction/aiengine to v2.3.2
- Bump @memberjunction/core to v2.3.2
- Bump @memberjunction/core-entities to v2.3.2
- Bump @memberjunction/global to v2.3.2
- Bump @memberjunction/queue to v2.3.2

## 2.3.1

Fri, 16 Aug 2024 03:57:15 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.3.1
- Bump @memberjunction/ai to v2.3.1
- Bump @memberjunction/ai-vector-dupe to v2.3.1
- Bump @memberjunction/aiengine to v2.3.1
- Bump @memberjunction/core to v2.3.1
- Bump @memberjunction/core-entities to v2.3.1
- Bump @memberjunction/global to v2.3.1
- Bump @memberjunction/queue to v2.3.1

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Minor changes

- Bump @memberjunction/actions to v2.3.0
- Bump @memberjunction/ai to v2.3.0
- Bump @memberjunction/ai-vector-dupe to v2.3.0
- Bump @memberjunction/aiengine to v2.3.0
- Bump @memberjunction/core to v2.2.2
- Bump @memberjunction/core-entities to v2.3.0
- Bump @memberjunction/global to v2.3.0
- Bump @memberjunction/queue to v2.3.0

## 2.2.1

Fri, 09 Aug 2024 01:29:44 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.2.1
- Bump @memberjunction/ai to v2.2.1
- Bump @memberjunction/ai-vector-dupe to v2.2.1
- Bump @memberjunction/aiengine to v2.2.1
- Bump @memberjunction/core to v2.2.1
- Bump @memberjunction/core-entities to v2.2.1
- Bump @memberjunction/global to v2.2.1
- Bump @memberjunction/queue to v2.2.1

## 2.2.0

Thu, 08 Aug 2024 02:53:16 GMT

### Minor changes

- Bump @memberjunction/actions to v2.2.0
- Bump @memberjunction/ai to v2.2.0
- Bump @memberjunction/ai-vector-dupe to v2.2.0
- Bump @memberjunction/aiengine to v2.2.0
- Bump @memberjunction/core to v2.2.0
- Bump @memberjunction/core-entities to v2.1.6
- Bump @memberjunction/global to v2.2.0
- Bump @memberjunction/queue to v2.2.0

## 2.1.5

Thu, 01 Aug 2024 17:23:11 GMT

### Patches

- Bump @memberjunction/actions to v2.1.5
- Bump @memberjunction/ai to v2.1.5
- Bump @memberjunction/ai-vector-dupe to v2.1.5
- Bump @memberjunction/aiengine to v2.1.5
- Bump @memberjunction/core to v2.1.5
- Bump @memberjunction/core-entities to v2.1.5
- Bump @memberjunction/global to v2.1.5
- Bump @memberjunction/queue to v2.1.5

## 2.1.4

Thu, 01 Aug 2024 14:43:41 GMT

### Patches

- Bump @memberjunction/actions to v2.1.4
- Bump @memberjunction/ai to v2.1.4
- Bump @memberjunction/ai-vector-dupe to v2.1.4
- Bump @memberjunction/aiengine to v2.1.4
- Bump @memberjunction/core to v2.1.4
- Bump @memberjunction/core-entities to v2.1.4
- Bump @memberjunction/global to v2.1.4
- Bump @memberjunction/queue to v2.1.4

## 2.1.3

Wed, 31 Jul 2024 19:36:47 GMT

### Patches

- Bump @memberjunction/actions to v2.1.3
- Bump @memberjunction/ai to v2.1.3
- Bump @memberjunction/ai-vector-dupe to v2.1.3
- Bump @memberjunction/aiengine to v2.1.3
- Bump @memberjunction/core to v2.1.3
- Bump @memberjunction/core-entities to v2.1.3
- Bump @memberjunction/global to v2.1.3
- Bump @memberjunction/queue to v2.1.3

## 2.1.2

Mon, 29 Jul 2024 22:52:11 GMT

### Patches

- Bump @memberjunction/actions to v2.1.2
- Bump @memberjunction/ai to v2.1.2
- Bump @memberjunction/ai-vector-dupe to v2.1.2
- Bump @memberjunction/aiengine to v2.1.2
- Bump @memberjunction/core to v2.1.2
- Bump @memberjunction/core-entities to v2.1.2
- Bump @memberjunction/global to v2.1.2
- Bump @memberjunction/queue to v2.1.2

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Bump @memberjunction/actions to v2.1.1
- Bump @memberjunction/ai to v2.1.1
- Bump @memberjunction/ai-vector-dupe to v2.1.1
- Bump @memberjunction/aiengine to v2.1.1
- Bump @memberjunction/core to v2.1.1
- Bump @memberjunction/core-entities to v2.1.1
- Bump @memberjunction/global to v2.1.1
- Bump @memberjunction/queue to v2.1.1

## 1.8.1

Fri, 21 Jun 2024 13:15:28 GMT

### Patches

- Bump @memberjunction/actions to v1.8.1
- Bump @memberjunction/ai to v1.8.1
- Bump @memberjunction/ai-vector-dupe to v1.8.1
- Bump @memberjunction/aiengine to v1.8.1
- Bump @memberjunction/core to v1.8.1
- Bump @memberjunction/core-entities to v1.8.1
- Bump @memberjunction/global to v1.8.1
- Bump @memberjunction/queue to v1.8.1

## 1.8.0

Wed, 19 Jun 2024 16:32:44 GMT

### Minor changes

- Bump @memberjunction/actions to v1.8.0
- Bump @memberjunction/ai to v1.8.0
- Bump @memberjunction/ai-vector-dupe to v1.8.0
- Bump @memberjunction/aiengine to v1.8.0
- Bump @memberjunction/core to v1.8.0
- Bump @memberjunction/core-entities to v1.8.0
- Bump @memberjunction/global to v1.8.0
- Bump @memberjunction/queue to v1.8.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.7.1

Wed, 12 Jun 2024 20:13:28 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v1.7.1
- Bump @memberjunction/ai to v1.7.1
- Bump @memberjunction/ai-vector-dupe to v1.7.1
- Bump @memberjunction/aiengine to v1.7.1
- Bump @memberjunction/core to v1.7.1
- Bump @memberjunction/core-entities to v1.7.1
- Bump @memberjunction/global to v1.7.1
- Bump @memberjunction/queue to v1.7.1

## 1.6.2

Wed, 12 Jun 2024 18:53:39 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v1.7.0
- Bump @memberjunction/ai to v1.7.0
- Bump @memberjunction/ai-vector-dupe to v1.7.0
- Bump @memberjunction/aiengine to v1.7.0
- Bump @memberjunction/core to v1.7.0
- Bump @memberjunction/core-entities to v1.7.0
- Bump @memberjunction/global to v1.7.0
- Bump @memberjunction/queue to v1.7.0

## 1.6.1

Tue, 11 Jun 2024 06:50:06 GMT

### Patches

- Bump @memberjunction/actions to v1.6.1
- Bump @memberjunction/ai to v1.6.1
- Bump @memberjunction/ai-vector-dupe to v1.6.1
- Bump @memberjunction/aiengine to v1.6.1
- Bump @memberjunction/core to v1.6.1
- Bump @memberjunction/core-entities to v1.6.1
- Bump @memberjunction/global to v1.6.1
- Bump @memberjunction/queue to v1.6.1

## 1.6.0

Tue, 11 Jun 2024 04:59:29 GMT

### Minor changes

- Bump @memberjunction/actions to v1.6.0
- Bump @memberjunction/ai to v1.6.0
- Bump @memberjunction/ai-vector-dupe to v1.6.0
- Bump @memberjunction/aiengine to v1.6.0
- Bump @memberjunction/core to v1.6.0
- Bump @memberjunction/core-entities to v1.6.0
- Bump @memberjunction/global to v1.6.0
- Bump @memberjunction/queue to v1.6.0

## 1.5.3

Tue, 11 Jun 2024 04:01:37 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v1.5.3
- Bump @memberjunction/ai to v1.5.3
- Bump @memberjunction/ai-vector-dupe to v1.5.3
- Bump @memberjunction/aiengine to v1.5.3
- Bump @memberjunction/core to v1.5.3
- Bump @memberjunction/core-entities to v1.5.3
- Bump @memberjunction/global to v1.5.3
- Bump @memberjunction/queue to v1.5.3

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Bump @memberjunction/ai to v1.5.2
- Bump @memberjunction/actions to v1.5.2
- Bump @memberjunction/aiengine to v1.5.2
- Bump @memberjunction/core to v1.5.2
- Bump @memberjunction/core-entities to v1.5.2
- Bump @memberjunction/global to v1.5.2
- Bump @memberjunction/queue to v1.5.2
- Bump @memberjunction/ai-vector-dupe to v1.5.2

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Bump @memberjunction/ai to v1.5.1
- Bump @memberjunction/actions to v1.5.1
- Bump @memberjunction/aiengine to v1.5.1
- Bump @memberjunction/core to v1.5.1
- Bump @memberjunction/core-entities to v1.5.1
- Bump @memberjunction/global to v1.5.1
- Bump @memberjunction/queue to v1.5.1
- Bump @memberjunction/ai-vector-dupe to v1.5.1

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.5.0
- Bump @memberjunction/actions to v1.5.0
- Bump @memberjunction/aiengine to v1.5.0
- Bump @memberjunction/core to v1.5.0
- Bump @memberjunction/core-entities to v1.5.0
- Bump @memberjunction/global to v1.5.0
- Bump @memberjunction/queue to v1.5.0
- Bump @memberjunction/ai-vector-dupe to v1.5.0

## 1.4.1

Fri, 07 Jun 2024 04:36:53 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.4.1
- Bump @memberjunction/actions to v1.4.1
- Bump @memberjunction/aiengine to v1.4.1
- Bump @memberjunction/core to v1.4.1
- Bump @memberjunction/core-entities to v1.4.1
- Bump @memberjunction/global to v1.4.1
- Bump @memberjunction/queue to v1.4.1
- Bump @memberjunction/ai-vector-dupe to v1.4.1

## 1.4.0

Sat, 25 May 2024 15:30:16 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.4.0
- Bump @memberjunction/aiengine to v1.4.0
- Bump @memberjunction/core to v1.4.0
- Bump @memberjunction/core-entities to v1.4.0
- Bump @memberjunction/global to v1.4.0
- Bump @memberjunction/queue to v1.4.0
- Bump @memberjunction/ai-vector-dupe to v1.4.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.3.3

Thu, 23 May 2024 18:35:52 GMT

### Patches

- Bump @memberjunction/ai to v1.3.3
- Bump @memberjunction/aiengine to v1.3.3
- Bump @memberjunction/core to v1.3.3
- Bump @memberjunction/core-entities to v1.3.3
- Bump @memberjunction/global to v1.3.3
- Bump @memberjunction/queue to v1.3.3
- Bump @memberjunction/ai-vector-dupe to v1.3.3

## 1.3.2

Thu, 23 May 2024 14:19:50 GMT

### Patches

- Bump @memberjunction/ai to v1.3.2
- Bump @memberjunction/aiengine to v1.3.2
- Bump @memberjunction/core to v1.3.2
- Bump @memberjunction/core-entities to v1.3.2
- Bump @memberjunction/global to v1.3.2
- Bump @memberjunction/queue to v1.3.2
- Bump @memberjunction/ai-vector-dupe to v1.3.2

## 1.3.1

Thu, 23 May 2024 02:29:25 GMT

### Patches

- Bump @memberjunction/ai to v1.3.1
- Bump @memberjunction/aiengine to v1.3.1
- Bump @memberjunction/core to v1.3.1
- Bump @memberjunction/core-entities to v1.3.1
- Bump @memberjunction/global to v1.3.1
- Bump @memberjunction/queue to v1.3.1
- Bump @memberjunction/ai-vector-dupe to v1.3.1

## 1.3.0

Wed, 22 May 2024 02:26:03 GMT

### Minor changes

- Overhaul the way we vectorize records (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.3.0
- Bump @memberjunction/aiengine to v1.3.0
- Bump @memberjunction/core to v1.3.0
- Bump @memberjunction/core-entities to v1.3.0
- Bump @memberjunction/global to v1.3.0
- Bump @memberjunction/queue to v1.3.0
- Bump @memberjunction/ai-vector-dupe to v1.3.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.2.2

Thu, 02 May 2024 19:46:38 GMT

### Patches

- Bump @memberjunction/ai to v1.2.2
- Bump @memberjunction/aiengine to v1.2.2
- Bump @memberjunction/core to v1.2.2
- Bump @memberjunction/core-entities to v1.2.2
- Bump @memberjunction/global to v1.2.2
- Bump @memberjunction/queue to v1.2.2
- Bump @memberjunction/ai-vector-dupe to v1.2.2

## 1.2.1

Thu, 02 May 2024 16:46:11 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.2.1
- Bump @memberjunction/aiengine to v1.2.1
- Bump @memberjunction/core to v1.2.1
- Bump @memberjunction/core-entities to v1.2.1
- Bump @memberjunction/global to v1.2.1
- Bump @memberjunction/queue to v1.2.1
- Bump @memberjunction/ai-vector-dupe to v1.2.1

## 1.2.0

Mon, 29 Apr 2024 18:51:58 GMT

### Minor changes

- Bump @memberjunction/ai to v1.2.0
- Bump @memberjunction/aiengine to v1.2.0
- Bump @memberjunction/core to v1.2.0
- Bump @memberjunction/core-entities to v1.2.0
- Bump @memberjunction/global to v1.2.0
- Bump @memberjunction/queue to v1.2.0
- Bump @memberjunction/ai-vector-dupe to v1.2.0

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Bump @memberjunction/ai to v1.1.3
- Bump @memberjunction/aiengine to v1.1.3
- Bump @memberjunction/core to v1.1.3
- Bump @memberjunction/core-entities to v1.1.3
- Bump @memberjunction/global to v1.1.3
- Bump @memberjunction/queue to v1.1.3
- Bump @memberjunction/ai-vector-dupe to v1.1.3

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Bump @memberjunction/ai to v1.1.2
- Bump @memberjunction/aiengine to v1.1.2
- Bump @memberjunction/core to v1.1.2
- Bump @memberjunction/core-entities to v1.1.2
- Bump @memberjunction/global to v1.1.2
- Bump @memberjunction/queue to v1.1.2
- Bump @memberjunction/ai-vector-dupe to v1.1.2

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Bump @memberjunction/ai to v1.1.1
- Bump @memberjunction/aiengine to v1.1.1
- Bump @memberjunction/core to v1.1.1
- Bump @memberjunction/core-entities to v1.1.1
- Bump @memberjunction/global to v1.1.1
- Bump @memberjunction/queue to v1.1.1
- Bump @memberjunction/ai-vector-dupe to v1.1.1

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Bump @memberjunction/ai to v1.1.0
- Bump @memberjunction/aiengine to v1.1.0
- Bump @memberjunction/core to v1.1.0
- Bump @memberjunction/core-entities to v1.1.0
- Bump @memberjunction/global to v1.1.0
- Bump @memberjunction/queue to v1.1.0
- Bump @memberjunction/ai-vector-dupe to v1.1.0

## 1.0.11

Wed, 24 Apr 2024 20:57:42 GMT

### Patches

- - bug fixes in Skip UI \* added exception handling to ReportResolver (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.0.11
- Bump @memberjunction/aiengine to v1.0.11
- Bump @memberjunction/core to v1.0.11
- Bump @memberjunction/core-entities to v1.0.11
- Bump @memberjunction/global to v1.0.11
- Bump @memberjunction/queue to v1.0.11
- Bump @memberjunction/ai-vector-dupe to v1.0.11

## 1.0.9

Sun, 14 Apr 2024 15:50:05 GMT

### Patches

- Bump @memberjunction/ai to v1.0.9
- Bump @memberjunction/aiengine to v1.0.9
- Bump @memberjunction/core to v1.0.9
- Bump @memberjunction/core-entities to v1.0.9
- Bump @memberjunction/global to v1.0.9
- Bump @memberjunction/queue to v1.0.9
- Bump @memberjunction/ai-vector-dupe to v1.0.9

## 1.0.8

Sat, 13 Apr 2024 02:32:44 GMT

### Patches

- Update build and publish automation (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.0.8
- Bump @memberjunction/aiengine to v1.0.8
- Bump @memberjunction/core to v1.0.8
- Bump @memberjunction/core-entities to v1.0.8
- Bump @memberjunction/global to v1.0.8
- Bump @memberjunction/queue to v1.0.8
- Bump @memberjunction/ai-vector-dupe to v1.0.8
  +'{ so it doesn't break flyway
  - @memberjunction/ai@2.67.0
  - @memberjunction/aiengine@2.67.0
  - @memberjunction/ai-vector-dupe@2.67.0
  - @memberjunction/actions@2.67.0
  - @memberjunction/core@2.67.0
  - @memberjunction/core-entities@2.67.0
  - @memberjunction/global@2.67.0
  - @memberjunction/queue@2.67.0

## 2.66.0

### Patch Changes

- Updated dependencies [7e22e3e]
  - @memberjunction/actions@2.66.0
  - @memberjunction/aiengine@2.66.0
  - @memberjunction/ai-vector-dupe@2.66.0
  - @memberjunction/queue@2.66.0
  - @memberjunction/ai@2.66.0
  - @memberjunction/core@2.66.0
  - @memberjunction/core-entities@2.66.0
  - @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- 619488f: Pattern filtering for sql logging
- Updated dependencies [1d034b7]
- Updated dependencies [619488f]
- Updated dependencies [b029c5d]
  - @memberjunction/ai@2.65.0
  - @memberjunction/global@2.65.0
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/aiengine@2.65.0
  - @memberjunction/ai-vector-dupe@2.65.0
  - @memberjunction/actions@2.65.0
  - @memberjunction/queue@2.65.0
  - @memberjunction/core@2.65.0

## 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/aiengine@2.64.0
  - @memberjunction/ai-vector-dupe@2.64.0
  - @memberjunction/actions@2.64.0
  - @memberjunction/queue@2.64.0
  - @memberjunction/ai@2.64.0
  - @memberjunction/core@2.64.0
  - @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/ai@2.63.1
  - @memberjunction/aiengine@2.63.1
  - @memberjunction/ai-vector-dupe@2.63.1
  - @memberjunction/actions@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1
  - @memberjunction/queue@2.63.1

## 2.63.0

### Patch Changes

- Updated dependencies [28e8a85]
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/aiengine@2.63.0
  - @memberjunction/actions@2.63.0
  - @memberjunction/ai-vector-dupe@2.63.0
  - @memberjunction/queue@2.63.0
  - @memberjunction/ai@2.63.0
  - @memberjunction/core@2.63.0
  - @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [c995603]
  - @memberjunction/ai@2.62.0
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/actions@2.62.0
  - @memberjunction/aiengine@2.62.0
  - @memberjunction/ai-vector-dupe@2.62.0
  - @memberjunction/queue@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- Updated dependencies [51b2b47]
  - @memberjunction/actions@2.61.0
  - @memberjunction/aiengine@2.61.0
  - @memberjunction/ai-vector-dupe@2.61.0
  - @memberjunction/queue@2.61.0
  - @memberjunction/ai@2.61.0
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
  - @memberjunction/aiengine@2.60.0
  - @memberjunction/actions@2.60.0
  - @memberjunction/ai-vector-dupe@2.60.0
  - @memberjunction/queue@2.60.0
  - @memberjunction/ai@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/ai@2.59.0
- @memberjunction/aiengine@2.59.0
- @memberjunction/ai-vector-dupe@2.59.0
- @memberjunction/actions@2.59.0
- @memberjunction/core@2.59.0
- @memberjunction/core-entities@2.59.0
- @memberjunction/global@2.59.0
- @memberjunction/queue@2.59.0

## 2.58.0

### Patch Changes

- def26fe: Added UUID generation to BaseEntity for entities that have single-column pkey that is uniqueidentifier type
- Updated dependencies [def26fe]
- Updated dependencies [db88416]
  - @memberjunction/core@2.58.0
  - @memberjunction/ai@2.58.0
  - @memberjunction/aiengine@2.58.0
  - @memberjunction/ai-vector-dupe@2.58.0
  - @memberjunction/actions@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/queue@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Minor Changes

- 0ba485f: various bug fixes

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/global@2.57.0
  - @memberjunction/aiengine@2.57.0
  - @memberjunction/ai-vector-dupe@2.57.0
  - @memberjunction/actions@2.57.0
  - @memberjunction/queue@2.57.0
  - @memberjunction/ai@2.57.0

## 2.56.0

### Patch Changes

- Updated dependencies [bf24cae]
  - @memberjunction/actions@2.56.0
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/aiengine@2.56.0
  - @memberjunction/ai-vector-dupe@2.56.0
  - @memberjunction/queue@2.56.0
  - @memberjunction/ai@2.56.0
  - @memberjunction/core@2.56.0
  - @memberjunction/global@2.56.0

## 2.55.0

### Minor Changes

- c3a49ff: Agent Manager + SQL Server fix + fix deps in core-entity-forms

### Patch Changes

- Updated dependencies [c3a49ff]
- Updated dependencies [659f892]
  - @memberjunction/ai@2.55.0
  - @memberjunction/aiengine@2.55.0
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/ai-vector-dupe@2.55.0
  - @memberjunction/actions@2.55.0
  - @memberjunction/queue@2.55.0
  - @memberjunction/core@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- dfca664: **SQLServerDataProvider Changes:**

  - SQLServerTransactionGroup now immediately rolls back and stops processing on first operation failure
  - Enhanced error handling to prevent double rollback attempts
  - Improved error messages to clearly indicate when transactions are rolled back

- 1273b07: fix transaction handling
- Updated dependencies [20f424d]
- Updated dependencies [a6f553e]
- Updated dependencies [0f6e995]
- Updated dependencies [0046359]
  - @memberjunction/core@2.54.0
  - @memberjunction/aiengine@2.54.0
  - @memberjunction/ai-vector-dupe@2.54.0
  - @memberjunction/actions@2.54.0
  - @memberjunction/core-entities@2.54.0
  - @memberjunction/queue@2.54.0
  - @memberjunction/ai@2.54.0
  - @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- Updated dependencies [bddc4ea]
- Updated dependencies [390f587]
- Updated dependencies [b5560c0]
  - @memberjunction/core@2.53.0
  - @memberjunction/core-entities@2.53.0
  - @memberjunction/actions@2.53.0
  - @memberjunction/aiengine@2.53.0
  - @memberjunction/ai-vector-dupe@2.53.0
  - @memberjunction/queue@2.53.0
  - @memberjunction/ai@2.53.0
  - @memberjunction/global@2.53.0

## 2.52.0

### Patch Changes

- Updated dependencies [e926106]
- Updated dependencies [760e844]
  - @memberjunction/ai@2.52.0
  - @memberjunction/aiengine@2.52.0
  - @memberjunction/ai-vector-dupe@2.52.0
  - @memberjunction/core@2.52.0
  - @memberjunction/core-entities@2.52.0
  - @memberjunction/actions@2.52.0
  - @memberjunction/queue@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Patch Changes

- Updated dependencies [4a79606]
- Updated dependencies [faf513c]
- Updated dependencies [7a9b88e]
- Updated dependencies [53f8167]
- Updated dependencies [0ddb438]
  - @memberjunction/ai@2.51.0
  - @memberjunction/aiengine@2.51.0
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/actions@2.51.0
  - @memberjunction/ai-vector-dupe@2.51.0
  - @memberjunction/queue@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/ai@2.50.0
- @memberjunction/aiengine@2.50.0
- @memberjunction/ai-vector-dupe@2.50.0
- @memberjunction/actions@2.50.0
- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0
- @memberjunction/global@2.50.0
- @memberjunction/queue@2.50.0

## 2.49.0

### Minor Changes

- cc52ced: Significant changes all around
- db17ed7: Further Updates
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
  - @memberjunction/global@2.49.0
  - @memberjunction/actions@2.49.0
  - @memberjunction/ai@2.49.0
  - @memberjunction/aiengine@2.49.0
  - @memberjunction/ai-vector-dupe@2.49.0
  - @memberjunction/queue@2.49.0

## 2.48.0

### Patch Changes

- Updated dependencies [bb01fcf]
- Updated dependencies [031e724]
  - @memberjunction/core@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/aiengine@2.48.0
  - @memberjunction/ai-vector-dupe@2.48.0
  - @memberjunction/actions@2.48.0
  - @memberjunction/queue@2.48.0
  - @memberjunction/ai@2.48.0
  - @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- 3f31192: bug fixes for date handling ISO strings for null dates
  - @memberjunction/aiengine@2.47.0
  - @memberjunction/ai-vector-dupe@2.47.0
  - @memberjunction/actions@2.47.0
  - @memberjunction/queue@2.47.0
  - @memberjunction/ai@2.47.0
  - @memberjunction/core@2.47.0
  - @memberjunction/core-entities@2.47.0
  - @memberjunction/global@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/ai@2.46.0
- @memberjunction/aiengine@2.46.0
- @memberjunction/ai-vector-dupe@2.46.0
- @memberjunction/actions@2.46.0
- @memberjunction/core@2.46.0
- @memberjunction/core-entities@2.46.0
- @memberjunction/global@2.46.0
- @memberjunction/queue@2.46.0

## 2.45.0

### Patch Changes

- Updated dependencies [21d456d]
- Updated dependencies [556ee8d]
  - @memberjunction/ai@2.45.0
  - @memberjunction/aiengine@2.45.0
  - @memberjunction/core-entities@2.45.0
  - @memberjunction/ai-vector-dupe@2.45.0
  - @memberjunction/actions@2.45.0
  - @memberjunction/queue@2.45.0
  - @memberjunction/core@2.45.0
  - @memberjunction/global@2.45.0

## 2.44.0

### Patch Changes

- Updated dependencies [f7aec1c]
- Updated dependencies [fbc30dc]
- Updated dependencies [9f02cd8]
- Updated dependencies [99b27c5]
- Updated dependencies [091c5f6]
  - @memberjunction/aiengine@2.44.0
  - @memberjunction/ai@2.44.0
  - @memberjunction/core@2.44.0
  - @memberjunction/core-entities@2.44.0
  - @memberjunction/ai-vector-dupe@2.44.0
  - @memberjunction/actions@2.44.0
  - @memberjunction/queue@2.44.0
  - @memberjunction/global@2.44.0

## 2.43.0

### Patch Changes

- Updated dependencies [1629c04]
  - @memberjunction/core@2.43.0
  - @memberjunction/aiengine@2.43.0
  - @memberjunction/ai-vector-dupe@2.43.0
  - @memberjunction/actions@2.43.0
  - @memberjunction/core-entities@2.43.0
  - @memberjunction/queue@2.43.0
  - @memberjunction/ai@2.43.0
  - @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/ai@2.42.1
- @memberjunction/aiengine@2.42.1
- @memberjunction/ai-vector-dupe@2.42.1
- @memberjunction/actions@2.42.1
- @memberjunction/core@2.42.1
- @memberjunction/core-entities@2.42.1
- @memberjunction/global@2.42.1
- @memberjunction/queue@2.42.1

## 2.42.0

### Minor Changes

- 5c4ff39: bug fix for DatasetTimestamp comparison

### Patch Changes

- Updated dependencies [d49f25c]
  - @memberjunction/ai@2.42.0
  - @memberjunction/aiengine@2.42.0
  - @memberjunction/ai-vector-dupe@2.42.0
  - @memberjunction/actions@2.42.0
  - @memberjunction/queue@2.42.0
  - @memberjunction/core@2.42.0
  - @memberjunction/core-entities@2.42.0
  - @memberjunction/global@2.42.0

## 2.41.0

### Patch Changes

- 3be3f71: Patched sql stored procedure name for tables with name colisions.
- Updated dependencies [3be3f71]
- Updated dependencies [9d3b577]
- Updated dependencies [276371d]
- Updated dependencies [7e0523d]
  - @memberjunction/core@2.41.0
  - @memberjunction/ai@2.41.0
  - @memberjunction/core-entities@2.41.0
  - @memberjunction/aiengine@2.41.0
  - @memberjunction/ai-vector-dupe@2.41.0
  - @memberjunction/actions@2.41.0
  - @memberjunction/queue@2.41.0
  - @memberjunction/global@2.41.0

## 2.40.0

### Patch Changes

- Updated dependencies [b6ce661]
  - @memberjunction/ai@2.40.0
  - @memberjunction/aiengine@2.40.0
  - @memberjunction/ai-vector-dupe@2.40.0
  - @memberjunction/actions@2.40.0
  - @memberjunction/queue@2.40.0
  - @memberjunction/core@2.40.0
  - @memberjunction/core-entities@2.40.0
  - @memberjunction/global@2.40.0

## 2.39.0

### Patch Changes

- Updated dependencies [f73ea0e]
- Updated dependencies [e93f580]
- Updated dependencies [c9ccc36]
  - @memberjunction/ai@2.39.0
  - @memberjunction/aiengine@2.39.0
  - @memberjunction/core-entities@2.39.0
  - @memberjunction/ai-vector-dupe@2.39.0
  - @memberjunction/actions@2.39.0
  - @memberjunction/queue@2.39.0
  - @memberjunction/core@2.39.0
  - @memberjunction/global@2.39.0

## 2.38.0

### Patch Changes

- Updated dependencies [c835ded]
  - @memberjunction/core-entities@2.38.0
  - @memberjunction/aiengine@2.38.0
  - @memberjunction/ai-vector-dupe@2.38.0
  - @memberjunction/actions@2.38.0
  - @memberjunction/queue@2.38.0
  - @memberjunction/ai@2.38.0
  - @memberjunction/core@2.38.0
  - @memberjunction/global@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/ai@2.37.1
- @memberjunction/aiengine@2.37.1
- @memberjunction/ai-vector-dupe@2.37.1
- @memberjunction/actions@2.37.1
- @memberjunction/core@2.37.1
- @memberjunction/core-entities@2.37.1
- @memberjunction/global@2.37.1
- @memberjunction/queue@2.37.1

## 2.37.0

### Patch Changes

- Updated dependencies [1418b71]
  - @memberjunction/core-entities@2.37.0
  - @memberjunction/aiengine@2.37.0
  - @memberjunction/ai-vector-dupe@2.37.0
  - @memberjunction/actions@2.37.0
  - @memberjunction/queue@2.37.0
  - @memberjunction/ai@2.37.0
  - @memberjunction/core@2.37.0
  - @memberjunction/global@2.37.0

## 2.36.1

### Patch Changes

- Updated dependencies [d9defc9]
- Updated dependencies [9d709e2]
- Updated dependencies [577cc6a]
- Updated dependencies [b45b336]
  - @memberjunction/ai@2.36.1
  - @memberjunction/core@2.36.1
  - @memberjunction/aiengine@2.36.1
  - @memberjunction/ai-vector-dupe@2.36.1
  - @memberjunction/actions@2.36.1
  - @memberjunction/queue@2.36.1
  - @memberjunction/core-entities@2.36.1
  - @memberjunction/global@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
- Updated dependencies [160f24f]
  - @memberjunction/ai-vector-dupe@2.36.0
  - @memberjunction/actions@2.36.0
  - @memberjunction/core-entities@2.36.0
  - @memberjunction/aiengine@2.36.0
  - @memberjunction/global@2.36.0
  - @memberjunction/ai@2.36.0
  - @memberjunction/queue@2.36.0
  - @memberjunction/core@2.36.0

## 2.35.1

### Patch Changes

- 3e7ec64: Strong typing for transaction item callback function and fix bug in SQL Server Data Provider caused by weak typing
- Updated dependencies [3e7ec64]
  - @memberjunction/core@2.35.1
  - @memberjunction/aiengine@2.35.1
  - @memberjunction/ai-vector-dupe@2.35.1
  - @memberjunction/actions@2.35.1
  - @memberjunction/core-entities@2.35.1
  - @memberjunction/queue@2.35.1
  - @memberjunction/ai@2.35.1
  - @memberjunction/global@2.35.1

## 2.35.0

### Patch Changes

- @memberjunction/ai-vector-dupe@2.35.0
- @memberjunction/ai@2.35.0
- @memberjunction/aiengine@2.35.0
- @memberjunction/actions@2.35.0
- @memberjunction/core@2.35.0
- @memberjunction/core-entities@2.35.0
- @memberjunction/global@2.35.0
- @memberjunction/queue@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/ai@2.34.2
- @memberjunction/aiengine@2.34.2
- @memberjunction/ai-vector-dupe@2.34.2
- @memberjunction/actions@2.34.2
- @memberjunction/core@2.34.2
- @memberjunction/core-entities@2.34.2
- @memberjunction/global@2.34.2
- @memberjunction/queue@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/ai@2.34.1
- @memberjunction/aiengine@2.34.1
- @memberjunction/ai-vector-dupe@2.34.1
- @memberjunction/actions@2.34.1
- @memberjunction/core@2.34.1
- @memberjunction/core-entities@2.34.1
- @memberjunction/global@2.34.1
- @memberjunction/queue@2.34.1

## 2.34.0

### Patch Changes

- Updated dependencies [e60f326]
- Updated dependencies [785f06a]
- Updated dependencies [b48d6b4]
- Updated dependencies [4c7f532]
- Updated dependencies [54ac86c]
  - @memberjunction/core-entities@2.34.0
  - @memberjunction/core@2.34.0
  - @memberjunction/ai@2.34.0
  - @memberjunction/aiengine@2.34.0
  - @memberjunction/ai-vector-dupe@2.34.0
  - @memberjunction/actions@2.34.0
  - @memberjunction/queue@2.34.0
  - @memberjunction/global@2.34.0

## 2.33.0

### Patch Changes

- 02d7391: Claude Code Performance Optimizations for MJServer and SQLServerDataProvider as proposed
- Updated dependencies [efafd0e]
  - @memberjunction/ai@2.33.0
  - @memberjunction/ai-vector-dupe@2.33.0
  - @memberjunction/aiengine@2.33.0
  - @memberjunction/actions@2.33.0
  - @memberjunction/queue@2.33.0
  - @memberjunction/core@2.33.0
  - @memberjunction/core-entities@2.33.0
  - @memberjunction/global@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/ai@2.32.2
- @memberjunction/aiengine@2.32.2
- @memberjunction/ai-vector-dupe@2.32.2
- @memberjunction/actions@2.32.2
- @memberjunction/core@2.32.2
- @memberjunction/core-entities@2.32.2
- @memberjunction/global@2.32.2
- @memberjunction/queue@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/ai@2.32.1
- @memberjunction/aiengine@2.32.1
- @memberjunction/ai-vector-dupe@2.32.1
- @memberjunction/actions@2.32.1
- @memberjunction/core@2.32.1
- @memberjunction/core-entities@2.32.1
- @memberjunction/global@2.32.1
- @memberjunction/queue@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/ai@2.32.0
- @memberjunction/aiengine@2.32.0
- @memberjunction/ai-vector-dupe@2.32.0
- @memberjunction/actions@2.32.0
- @memberjunction/core@2.32.0
- @memberjunction/core-entities@2.32.0
- @memberjunction/global@2.32.0
- @memberjunction/queue@2.32.0

## 2.31.0

### Patch Changes

- Updated dependencies [67c0b7f]
  - @memberjunction/aiengine@2.31.0
  - @memberjunction/ai-vector-dupe@2.31.0
  - @memberjunction/actions@2.31.0
  - @memberjunction/queue@2.31.0
  - @memberjunction/ai@2.31.0
  - @memberjunction/core@2.31.0
  - @memberjunction/core-entities@2.31.0
  - @memberjunction/global@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [8f71da0]
- Updated dependencies [a3ab749]
- Updated dependencies [63dc5a9]
  - @memberjunction/actions@2.30.0
  - @memberjunction/aiengine@2.30.0
  - @memberjunction/core-entities@2.30.0
  - @memberjunction/global@2.30.0
  - @memberjunction/ai-vector-dupe@2.30.0
  - @memberjunction/queue@2.30.0
  - @memberjunction/ai@2.30.0
  - @memberjunction/core@2.30.0

## 2.29.2

### Patch Changes

- 64aa7f0: New query for 2.29.0 to get version history since we aren't using an entity for flyway data anymore. Improvements to query execution to support query execution by name as well as by ID, and general cleanup (code wasn't working before as query ID wasn't enclosed in quotes from days of INT ID types)
- Updated dependencies [07bde92]
- Updated dependencies [64aa7f0]
- Updated dependencies [69c3505]
  - @memberjunction/core@2.29.2
  - @memberjunction/core-entities@2.29.2
  - @memberjunction/aiengine@2.29.2
  - @memberjunction/ai-vector-dupe@2.29.2
  - @memberjunction/actions@2.29.2
  - @memberjunction/queue@2.29.2
  - @memberjunction/ai@2.29.2
  - @memberjunction/global@2.29.2

## 2.28.0

### Patch Changes

- Updated dependencies [8259093]
  - @memberjunction/core@2.28.0
  - @memberjunction/aiengine@2.28.0
  - @memberjunction/ai-vector-dupe@2.28.0
  - @memberjunction/actions@2.28.0
  - @memberjunction/core-entities@2.28.0
  - @memberjunction/queue@2.28.0
  - @memberjunction/ai@2.28.0
  - @memberjunction/global@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/ai@2.27.1
- @memberjunction/aiengine@2.27.1
- @memberjunction/ai-vector-dupe@2.27.1
- @memberjunction/actions@2.27.1
- @memberjunction/core@2.27.1
- @memberjunction/core-entities@2.27.1
- @memberjunction/global@2.27.1
- @memberjunction/queue@2.27.1

## 2.27.0

### Patch Changes

- Updated dependencies [54ab868]
- Updated dependencies [b4d3cbc]
- Updated dependencies [5a81451]
  - @memberjunction/core@2.27.0
  - @memberjunction/ai@2.27.0
  - @memberjunction/core-entities@2.27.0
  - @memberjunction/aiengine@2.27.0
  - @memberjunction/ai-vector-dupe@2.27.0
  - @memberjunction/actions@2.27.0
  - @memberjunction/queue@2.27.0
  - @memberjunction/global@2.27.0

## 2.26.1

### Patch Changes

- @memberjunction/ai@2.26.1
- @memberjunction/aiengine@2.26.1
- @memberjunction/ai-vector-dupe@2.26.1
- @memberjunction/actions@2.26.1
- @memberjunction/core@2.26.1
- @memberjunction/core-entities@2.26.1
- @memberjunction/global@2.26.1
- @memberjunction/queue@2.26.1

## 2.26.0

### Minor Changes

- 23801c5: Changes to use of TransactionGroup to use await at all times.Fixed up some metadata bugs in the \_\_mj schema that somehow existed from prior builds.Cleaned up SQL Server Data Provider handling of virtual fields in track record changesFixed CodeGen to not emit null wrapped as a string that was happening in some casesHardened MJCore.BaseEntity to treat a string with the word null in it as same as a true null value (in case someone throws that into the DB)

### Patch Changes

- Updated dependencies [23801c5]
  - @memberjunction/core@2.26.0
  - @memberjunction/aiengine@2.26.0
  - @memberjunction/ai-vector-dupe@2.26.0
  - @memberjunction/actions@2.26.0
  - @memberjunction/core-entities@2.26.0
  - @memberjunction/queue@2.26.0
  - @memberjunction/ai@2.26.0
  - @memberjunction/global@2.26.0

## 2.25.0

### Minor Changes

- 26c990d: - Add Conversations to Resource Types Entity* Update User View Grid to fix multi-edit bug* Transaction Management Changes - fixes bug in #803 - but not new feature in there* Clean bug in Notification Service to only show user-centric messages* Add Sharing dialog to Skip Chat component

### Patch Changes

- 0647504: support new TransactionItem constructor in SQLServerDataProvider
- 824eca2: Transaction Group improvements
- 86e6d3b: Finished debug for Variables support in transaction groups!
- Updated dependencies [fd07dcd]
- Updated dependencies [26c990d]
- Updated dependencies [86e6d3b]
  - @memberjunction/core@2.25.0
  - @memberjunction/aiengine@2.25.0
  - @memberjunction/ai-vector-dupe@2.25.0
  - @memberjunction/actions@2.25.0
  - @memberjunction/core-entities@2.25.0
  - @memberjunction/queue@2.25.0
  - @memberjunction/ai@2.25.0
  - @memberjunction/global@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/ai@2.24.1
- @memberjunction/aiengine@2.24.1
- @memberjunction/ai-vector-dupe@2.24.1
- @memberjunction/actions@2.24.1
- @memberjunction/core@2.24.1
- @memberjunction/core-entities@2.24.1
- @memberjunction/global@2.24.1
- @memberjunction/queue@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [9cb85cc]
- Updated dependencies [7c6ff41]
  - @memberjunction/global@2.24.0
  - @memberjunction/core-entities@2.24.0
  - @memberjunction/ai@2.24.0
  - @memberjunction/aiengine@2.24.0
  - @memberjunction/ai-vector-dupe@2.24.0
  - @memberjunction/actions@2.24.0
  - @memberjunction/core@2.24.0
  - @memberjunction/queue@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/ai@2.23.2
- @memberjunction/aiengine@2.23.2
- @memberjunction/ai-vector-dupe@2.23.2
- @memberjunction/actions@2.23.2
- @memberjunction/core@2.23.2
- @memberjunction/core-entities@2.23.2
- @memberjunction/global@2.23.2
- @memberjunction/queue@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/ai@2.23.1
- @memberjunction/aiengine@2.23.1
- @memberjunction/ai-vector-dupe@2.23.1
- @memberjunction/actions@2.23.1
- @memberjunction/core@2.23.1
- @memberjunction/core-entities@2.23.1
- @memberjunction/global@2.23.1
- @memberjunction/queue@2.23.1

## 2.23.0

### Minor Changes

- 09d3fa9: Defaulting cache refresh interval to disabled to allow database pausing unless refresh is explicitly set.

### Patch Changes

- Updated dependencies [38b7507]
  - @memberjunction/global@2.23.0
  - @memberjunction/ai@2.23.0
  - @memberjunction/aiengine@2.23.0
  - @memberjunction/ai-vector-dupe@2.23.0
  - @memberjunction/actions@2.23.0
  - @memberjunction/core@2.23.0
  - @memberjunction/core-entities@2.23.0
  - @memberjunction/queue@2.23.0

## 2.22.2

### Patch Changes

- Updated dependencies [94ebf81]
  - @memberjunction/core@2.22.2
  - @memberjunction/aiengine@2.22.2
  - @memberjunction/ai-vector-dupe@2.22.2
  - @memberjunction/actions@2.22.2
  - @memberjunction/core-entities@2.22.2
  - @memberjunction/queue@2.22.2
  - @memberjunction/ai@2.22.2
  - @memberjunction/global@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/ai@2.22.1
- @memberjunction/aiengine@2.22.1
- @memberjunction/ai-vector-dupe@2.22.1
- @memberjunction/actions@2.22.1
- @memberjunction/core@2.22.1
- @memberjunction/core-entities@2.22.1
- @memberjunction/global@2.22.1
- @memberjunction/queue@2.22.1

## 2.22.0

### Patch Changes

- Updated dependencies [a598f1a]
- Updated dependencies [9660275]
  - @memberjunction/core@2.22.0
  - @memberjunction/global@2.22.0
  - @memberjunction/aiengine@2.22.0
  - @memberjunction/ai-vector-dupe@2.22.0
  - @memberjunction/actions@2.22.0
  - @memberjunction/core-entities@2.22.0
  - @memberjunction/queue@2.22.0
  - @memberjunction/ai@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.21.0
- Bump @memberjunction/ai to v2.21.0
- Bump @memberjunction/ai-vector-dupe to v2.21.0
- Bump @memberjunction/aiengine to v2.21.0
- Bump @memberjunction/core to v2.21.0
- Bump @memberjunction/core-entities to v2.21.0
- Bump @memberjunction/global to v2.21.0
- Bump @memberjunction/queue to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

### Patches

- Bump @memberjunction/actions to v2.20.3
- Bump @memberjunction/ai to v2.20.3
- Bump @memberjunction/ai-vector-dupe to v2.20.3
- Bump @memberjunction/aiengine to v2.20.3
- Bump @memberjunction/core to v2.20.3
- Bump @memberjunction/core-entities to v2.20.3
- Bump @memberjunction/global to v2.20.3
- Bump @memberjunction/queue to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Bump @memberjunction/actions to v2.20.2
- Bump @memberjunction/ai to v2.20.2
- Bump @memberjunction/ai-vector-dupe to v2.20.2
- Bump @memberjunction/aiengine to v2.20.2
- Bump @memberjunction/core to v2.20.2
- Bump @memberjunction/core-entities to v2.20.2
- Bump @memberjunction/global to v2.20.2
- Bump @memberjunction/queue to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/actions to v2.20.1
- Bump @memberjunction/ai to v2.20.1
- Bump @memberjunction/ai-vector-dupe to v2.20.1
- Bump @memberjunction/aiengine to v2.20.1
- Bump @memberjunction/core to v2.20.1
- Bump @memberjunction/core-entities to v2.20.1
- Bump @memberjunction/global to v2.20.1
- Bump @memberjunction/queue to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:03 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.20.0
- Bump @memberjunction/ai to v2.20.0
- Bump @memberjunction/ai-vector-dupe to v2.20.0
- Bump @memberjunction/aiengine to v2.20.0
- Bump @memberjunction/core to v2.20.0
- Bump @memberjunction/core-entities to v2.20.0
- Bump @memberjunction/global to v2.20.0
- Bump @memberjunction/queue to v2.20.0

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/actions to v2.19.5
- Bump @memberjunction/ai to v2.19.5
- Bump @memberjunction/ai-vector-dupe to v2.19.5
- Bump @memberjunction/aiengine to v2.19.5
- Bump @memberjunction/core to v2.19.5
- Bump @memberjunction/core-entities to v2.19.5
- Bump @memberjunction/global to v2.19.5
- Bump @memberjunction/queue to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/actions to v2.19.4
- Bump @memberjunction/ai to v2.19.4
- Bump @memberjunction/ai-vector-dupe to v2.19.4
- Bump @memberjunction/aiengine to v2.19.4
- Bump @memberjunction/core to v2.19.4
- Bump @memberjunction/core-entities to v2.19.4
- Bump @memberjunction/global to v2.19.4
- Bump @memberjunction/queue to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/actions to v2.19.3
- Bump @memberjunction/ai to v2.19.3
- Bump @memberjunction/ai-vector-dupe to v2.19.3
- Bump @memberjunction/aiengine to v2.19.3
- Bump @memberjunction/core to v2.19.3
- Bump @memberjunction/core-entities to v2.19.3
- Bump @memberjunction/global to v2.19.3
- Bump @memberjunction/queue to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/actions to v2.19.2
- Bump @memberjunction/ai to v2.19.2
- Bump @memberjunction/ai-vector-dupe to v2.19.2
- Bump @memberjunction/aiengine to v2.19.2
- Bump @memberjunction/core to v2.19.2
- Bump @memberjunction/core-entities to v2.19.2
- Bump @memberjunction/global to v2.19.2
- Bump @memberjunction/queue to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/actions to v2.19.1
- Bump @memberjunction/ai to v2.19.1
- Bump @memberjunction/ai-vector-dupe to v2.19.1
- Bump @memberjunction/aiengine to v2.19.1
- Bump @memberjunction/core to v2.19.1
- Bump @memberjunction/core-entities to v2.19.1
- Bump @memberjunction/global to v2.19.1
- Bump @memberjunction/queue to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:47 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.19.0
- Bump @memberjunction/ai to v2.19.0
- Bump @memberjunction/ai-vector-dupe to v2.19.0
- Bump @memberjunction/aiengine to v2.19.0
- Bump @memberjunction/core to v2.19.0
- Bump @memberjunction/core-entities to v2.19.0
- Bump @memberjunction/global to v2.19.0
- Bump @memberjunction/queue to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.18.3
- Bump @memberjunction/ai to v2.18.3
- Bump @memberjunction/ai-vector-dupe to v2.18.3
- Bump @memberjunction/aiengine to v2.18.3
- Bump @memberjunction/core to v2.18.3
- Bump @memberjunction/core-entities to v2.18.3
- Bump @memberjunction/global to v2.18.3
- Bump @memberjunction/queue to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/actions to v2.18.2
- Bump @memberjunction/ai to v2.18.2
- Bump @memberjunction/ai-vector-dupe to v2.18.2
- Bump @memberjunction/aiengine to v2.18.2
- Bump @memberjunction/core to v2.18.2
- Bump @memberjunction/core-entities to v2.18.2
- Bump @memberjunction/global to v2.18.2
- Bump @memberjunction/queue to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/actions to v2.18.1
- Bump @memberjunction/ai to v2.18.1
- Bump @memberjunction/ai-vector-dupe to v2.18.1
- Bump @memberjunction/aiengine to v2.18.1
- Bump @memberjunction/core to v2.18.1
- Bump @memberjunction/core-entities to v2.18.1
- Bump @memberjunction/global to v2.18.1
- Bump @memberjunction/queue to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Bump @memberjunction/actions to v2.18.0
- Bump @memberjunction/ai to v2.18.0
- Bump @memberjunction/ai-vector-dupe to v2.18.0
- Bump @memberjunction/aiengine to v2.18.0
- Bump @memberjunction/core to v2.18.0
- Bump @memberjunction/core-entities to v2.18.0
- Bump @memberjunction/global to v2.18.0
- Bump @memberjunction/queue to v2.18.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Bump @memberjunction/actions to v2.17.0
- Bump @memberjunction/ai to v2.17.0
- Bump @memberjunction/ai-vector-dupe to v2.17.0
- Bump @memberjunction/aiengine to v2.17.0
- Bump @memberjunction/core to v2.17.0
- Bump @memberjunction/core-entities to v2.17.0
- Bump @memberjunction/global to v2.17.0
- Bump @memberjunction/queue to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:27 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/actions to v2.16.1
- Bump @memberjunction/ai to v2.16.1
- Bump @memberjunction/ai-vector-dupe to v2.16.1
- Bump @memberjunction/aiengine to v2.16.1
- Bump @memberjunction/core to v2.16.1
- Bump @memberjunction/core-entities to v2.16.1
- Bump @memberjunction/global to v2.16.1
- Bump @memberjunction/queue to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Bump @memberjunction/actions to v2.16.0
- Bump @memberjunction/ai to v2.16.0
- Bump @memberjunction/ai-vector-dupe to v2.16.0
- Bump @memberjunction/aiengine to v2.16.0
- Bump @memberjunction/core to v2.16.0
- Bump @memberjunction/core-entities to v2.16.0
- Bump @memberjunction/global to v2.16.0
- Bump @memberjunction/queue to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:27 GMT

### Patches

- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.15.2
- Bump @memberjunction/ai to v2.15.2
- Bump @memberjunction/ai-vector-dupe to v2.15.2
- Bump @memberjunction/aiengine to v2.15.2
- Bump @memberjunction/core to v2.15.2
- Bump @memberjunction/core-entities to v2.15.2
- Bump @memberjunction/global to v2.15.2
- Bump @memberjunction/queue to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.14.0
- Bump @memberjunction/ai to v2.14.0
- Bump @memberjunction/ai-vector-dupe to v2.14.0
- Bump @memberjunction/aiengine to v2.14.0
- Bump @memberjunction/core to v2.14.0
- Bump @memberjunction/core-entities to v2.14.0
- Bump @memberjunction/global to v2.14.0
- Bump @memberjunction/queue to v2.14.0

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/actions to v2.13.4
- Bump @memberjunction/ai to v2.13.4
- Bump @memberjunction/ai-vector-dupe to v2.13.4
- Bump @memberjunction/aiengine to v2.13.4
- Bump @memberjunction/core to v2.13.4
- Bump @memberjunction/core-entities to v2.13.4
- Bump @memberjunction/global to v2.13.4
- Bump @memberjunction/queue to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:45 GMT

### Patches

- Bump @memberjunction/actions to v2.13.3
- Bump @memberjunction/ai to v2.13.3
- Bump @memberjunction/ai-vector-dupe to v2.13.3
- Bump @memberjunction/aiengine to v2.13.3
- Bump @memberjunction/core to v2.13.3
- Bump @memberjunction/core-entities to v2.13.3
- Bump @memberjunction/global to v2.13.3
- Bump @memberjunction/queue to v2.13.3

## 2.13.2

Tue, 03 Dec 2024 23:30:43 GMT

### Patches

- Bump @memberjunction/actions to v2.13.2
- Bump @memberjunction/ai to v2.13.2
- Bump @memberjunction/ai-vector-dupe to v2.13.2
- Bump @memberjunction/aiengine to v2.13.2
- Bump @memberjunction/core to v2.13.2
- Bump @memberjunction/core-entities to v2.13.2
- Bump @memberjunction/global to v2.13.2
- Bump @memberjunction/queue to v2.13.2

## 2.13.1

Wed, 27 Nov 2024 20:42:53 GMT

### Patches

- Bump @memberjunction/actions to v2.13.1
- Bump @memberjunction/ai to v2.13.1
- Bump @memberjunction/ai-vector-dupe to v2.13.1
- Bump @memberjunction/aiengine to v2.13.1
- Bump @memberjunction/core to v2.13.1
- Bump @memberjunction/core-entities to v2.13.1
- Bump @memberjunction/global to v2.13.1
- Bump @memberjunction/queue to v2.13.1

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Minor changes

- Bump @memberjunction/actions to v2.13.0
- Bump @memberjunction/ai to v2.13.0
- Bump @memberjunction/ai-vector-dupe to v2.13.0
- Bump @memberjunction/aiengine to v2.13.0
- Bump @memberjunction/core to v2.13.0
- Bump @memberjunction/core-entities to v2.13.0
- Bump @memberjunction/global to v2.13.0
- Bump @memberjunction/queue to v2.13.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.12.0

Mon, 04 Nov 2024 23:07:22 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.12.0
- Bump @memberjunction/ai to v2.12.0
- Bump @memberjunction/ai-vector-dupe to v2.12.0
- Bump @memberjunction/aiengine to v2.12.0
- Bump @memberjunction/core to v2.12.0
- Bump @memberjunction/core-entities to v2.12.0
- Bump @memberjunction/global to v2.12.0
- Bump @memberjunction/queue to v2.12.0

## 2.11.0

Thu, 24 Oct 2024 15:33:07 GMT

### Minor changes

- Bump @memberjunction/actions to v2.11.0
- Bump @memberjunction/ai to v2.11.0
- Bump @memberjunction/ai-vector-dupe to v2.11.0
- Bump @memberjunction/aiengine to v2.11.0
- Bump @memberjunction/core to v2.11.0
- Bump @memberjunction/core-entities to v2.11.0
- Bump @memberjunction/global to v2.11.0
- Bump @memberjunction/queue to v2.11.0

## 2.10.0

Wed, 23 Oct 2024 22:49:59 GMT

### Minor changes

- Bump @memberjunction/actions to v2.10.0
- Bump @memberjunction/ai to v2.10.0
- Bump @memberjunction/ai-vector-dupe to v2.10.0
- Bump @memberjunction/aiengine to v2.10.0
- Bump @memberjunction/core to v2.10.0
- Bump @memberjunction/core-entities to v2.10.0
- Bump @memberjunction/global to v2.10.0
- Bump @memberjunction/queue to v2.10.0

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Minor changes

- Bump @memberjunction/actions to v2.9.0
- Bump @memberjunction/ai to v2.9.0
- Bump @memberjunction/ai-vector-dupe to v2.9.0
- Bump @memberjunction/aiengine to v2.9.0
- Bump @memberjunction/core to v2.9.0
- Bump @memberjunction/core-entities to v2.9.0
- Bump @memberjunction/global to v2.9.0
- Bump @memberjunction/queue to v2.9.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.8.0

Tue, 15 Oct 2024 17:01:03 GMT

### Minor changes

- Bump @memberjunction/actions to v2.8.0
- Bump @memberjunction/ai to v2.8.0
- Bump @memberjunction/ai-vector-dupe to v2.8.0
- Bump @memberjunction/aiengine to v2.8.0
- Bump @memberjunction/core to v2.8.0
- Bump @memberjunction/core-entities to v2.8.0
- Bump @memberjunction/global to v2.8.0
- Bump @memberjunction/queue to v2.8.0

## 2.7.1

Tue, 08 Oct 2024 22:16:58 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.7.1
- Bump @memberjunction/ai to v2.7.1
- Bump @memberjunction/ai-vector-dupe to v2.7.1
- Bump @memberjunction/aiengine to v2.7.1
- Bump @memberjunction/core to v2.7.1
- Bump @memberjunction/core-entities to v2.7.1
- Bump @memberjunction/global to v2.7.1
- Bump @memberjunction/queue to v2.7.1

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.7.0
- Bump @memberjunction/ai to v2.7.0
- Bump @memberjunction/ai-vector-dupe to v2.7.0
- Bump @memberjunction/aiengine to v2.7.0
- Bump @memberjunction/core to v2.7.0
- Bump @memberjunction/core-entities to v2.7.0
- Bump @memberjunction/global to v2.7.0
- Bump @memberjunction/queue to v2.7.0

## 2.6.1

Mon, 30 Sep 2024 15:55:48 GMT

### Patches

- Bump @memberjunction/actions to v2.6.1
- Bump @memberjunction/ai to v2.6.1
- Bump @memberjunction/ai-vector-dupe to v2.6.1
- Bump @memberjunction/aiengine to v2.6.1
- Bump @memberjunction/core to v2.6.1
- Bump @memberjunction/core-entities to v2.6.1
- Bump @memberjunction/global to v2.6.1
- Bump @memberjunction/queue to v2.6.1

## 2.6.0

Sat, 28 Sep 2024 00:19:39 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.6.0
- Bump @memberjunction/ai to v2.6.0
- Bump @memberjunction/ai-vector-dupe to v2.6.0
- Bump @memberjunction/aiengine to v2.6.0
- Bump @memberjunction/core to v2.6.0
- Bump @memberjunction/core-entities to v2.6.0
- Bump @memberjunction/global to v2.6.0
- Bump @memberjunction/queue to v2.6.0

## 2.5.2

Sat, 28 Sep 2024 00:06:02 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

### Patches

- Bump @memberjunction/actions to v2.5.2
- Bump @memberjunction/ai to v2.5.2
- Bump @memberjunction/ai-vector-dupe to v2.5.2
- Bump @memberjunction/aiengine to v2.5.2
- Bump @memberjunction/core to v2.5.2
- Bump @memberjunction/core-entities to v2.5.2
- Bump @memberjunction/global to v2.5.2
- Bump @memberjunction/queue to v2.5.2

## 2.5.1

Fri, 20 Sep 2024 17:51:58 GMT

### Patches

- Bump @memberjunction/actions to v2.5.1
- Bump @memberjunction/ai to v2.5.1
- Bump @memberjunction/ai-vector-dupe to v2.5.1
- Bump @memberjunction/aiengine to v2.5.1
- Bump @memberjunction/core to v2.5.1
- Bump @memberjunction/core-entities to v2.5.1
- Bump @memberjunction/global to v2.5.1
- Bump @memberjunction/queue to v2.5.1

## 2.5.0

Fri, 20 Sep 2024 16:17:06 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.5.0
- Bump @memberjunction/ai to v2.5.0
- Bump @memberjunction/ai-vector-dupe to v2.5.0
- Bump @memberjunction/aiengine to v2.5.0
- Bump @memberjunction/core to v2.5.0
- Bump @memberjunction/core-entities to v2.5.0
- Bump @memberjunction/global to v2.5.0
- Bump @memberjunction/queue to v2.5.0

## 2.4.1

Sun, 08 Sep 2024 19:33:23 GMT

### Patches

- Bump @memberjunction/actions to v2.4.1
- Bump @memberjunction/ai to v2.4.1
- Bump @memberjunction/ai-vector-dupe to v2.4.1
- Bump @memberjunction/aiengine to v2.4.1
- Bump @memberjunction/core to v2.4.1
- Bump @memberjunction/core-entities to v2.4.1
- Bump @memberjunction/global to v2.4.1
- Bump @memberjunction/queue to v2.4.1

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.4.0
- Bump @memberjunction/ai to v2.4.0
- Bump @memberjunction/ai-vector-dupe to v2.4.0
- Bump @memberjunction/aiengine to v2.4.0
- Bump @memberjunction/core to v2.4.0
- Bump @memberjunction/core-entities to v2.4.0
- Bump @memberjunction/global to v2.4.0
- Bump @memberjunction/queue to v2.4.0

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Bump @memberjunction/actions to v2.3.3
- Bump @memberjunction/ai to v2.3.3
- Bump @memberjunction/ai-vector-dupe to v2.3.3
- Bump @memberjunction/aiengine to v2.3.3
- Bump @memberjunction/core to v2.3.3
- Bump @memberjunction/core-entities to v2.3.3
- Bump @memberjunction/global to v2.3.3
- Bump @memberjunction/queue to v2.3.3

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.3.2
- Bump @memberjunction/ai to v2.3.2
- Bump @memberjunction/ai-vector-dupe to v2.3.2
- Bump @memberjunction/aiengine to v2.3.2
- Bump @memberjunction/core to v2.3.2
- Bump @memberjunction/core-entities to v2.3.2
- Bump @memberjunction/global to v2.3.2
- Bump @memberjunction/queue to v2.3.2

## 2.3.1

Fri, 16 Aug 2024 03:57:15 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/actions to v2.3.1
- Bump @memberjunction/ai to v2.3.1
- Bump @memberjunction/ai-vector-dupe to v2.3.1
- Bump @memberjunction/aiengine to v2.3.1
- Bump @memberjunction/core to v2.3.1
- Bump @memberjunction/core-entities to v2.3.1
- Bump @memberjunction/global to v2.3.1
- Bump @memberjunction/queue to v2.3.1

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Minor changes

- Bump @memberjunction/actions to v2.3.0
- Bump @memberjunction/ai to v2.3.0
- Bump @memberjunction/ai-vector-dupe to v2.3.0
- Bump @memberjunction/aiengine to v2.3.0
- Bump @memberjunction/core to v2.2.2
- Bump @memberjunction/core-entities to v2.3.0
- Bump @memberjunction/global to v2.3.0
- Bump @memberjunction/queue to v2.3.0

## 2.2.1

Fri, 09 Aug 2024 01:29:44 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v2.2.1
- Bump @memberjunction/ai to v2.2.1
- Bump @memberjunction/ai-vector-dupe to v2.2.1
- Bump @memberjunction/aiengine to v2.2.1
- Bump @memberjunction/core to v2.2.1
- Bump @memberjunction/core-entities to v2.2.1
- Bump @memberjunction/global to v2.2.1
- Bump @memberjunction/queue to v2.2.1

## 2.2.0

Thu, 08 Aug 2024 02:53:16 GMT

### Minor changes

- Bump @memberjunction/actions to v2.2.0
- Bump @memberjunction/ai to v2.2.0
- Bump @memberjunction/ai-vector-dupe to v2.2.0
- Bump @memberjunction/aiengine to v2.2.0
- Bump @memberjunction/core to v2.2.0
- Bump @memberjunction/core-entities to v2.1.6
- Bump @memberjunction/global to v2.2.0
- Bump @memberjunction/queue to v2.2.0

## 2.1.5

Thu, 01 Aug 2024 17:23:11 GMT

### Patches

- Bump @memberjunction/actions to v2.1.5
- Bump @memberjunction/ai to v2.1.5
- Bump @memberjunction/ai-vector-dupe to v2.1.5
- Bump @memberjunction/aiengine to v2.1.5
- Bump @memberjunction/core to v2.1.5
- Bump @memberjunction/core-entities to v2.1.5
- Bump @memberjunction/global to v2.1.5
- Bump @memberjunction/queue to v2.1.5

## 2.1.4

Thu, 01 Aug 2024 14:43:41 GMT

### Patches

- Bump @memberjunction/actions to v2.1.4
- Bump @memberjunction/ai to v2.1.4
- Bump @memberjunction/ai-vector-dupe to v2.1.4
- Bump @memberjunction/aiengine to v2.1.4
- Bump @memberjunction/core to v2.1.4
- Bump @memberjunction/core-entities to v2.1.4
- Bump @memberjunction/global to v2.1.4
- Bump @memberjunction/queue to v2.1.4

## 2.1.3

Wed, 31 Jul 2024 19:36:47 GMT

### Patches

- Bump @memberjunction/actions to v2.1.3
- Bump @memberjunction/ai to v2.1.3
- Bump @memberjunction/ai-vector-dupe to v2.1.3
- Bump @memberjunction/aiengine to v2.1.3
- Bump @memberjunction/core to v2.1.3
- Bump @memberjunction/core-entities to v2.1.3
- Bump @memberjunction/global to v2.1.3
- Bump @memberjunction/queue to v2.1.3

## 2.1.2

Mon, 29 Jul 2024 22:52:11 GMT

### Patches

- Bump @memberjunction/actions to v2.1.2
- Bump @memberjunction/ai to v2.1.2
- Bump @memberjunction/ai-vector-dupe to v2.1.2
- Bump @memberjunction/aiengine to v2.1.2
- Bump @memberjunction/core to v2.1.2
- Bump @memberjunction/core-entities to v2.1.2
- Bump @memberjunction/global to v2.1.2
- Bump @memberjunction/queue to v2.1.2

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Bump @memberjunction/actions to v2.1.1
- Bump @memberjunction/ai to v2.1.1
- Bump @memberjunction/ai-vector-dupe to v2.1.1
- Bump @memberjunction/aiengine to v2.1.1
- Bump @memberjunction/core to v2.1.1
- Bump @memberjunction/core-entities to v2.1.1
- Bump @memberjunction/global to v2.1.1
- Bump @memberjunction/queue to v2.1.1

## 1.8.1

Fri, 21 Jun 2024 13:15:28 GMT

### Patches

- Bump @memberjunction/actions to v1.8.1
- Bump @memberjunction/ai to v1.8.1
- Bump @memberjunction/ai-vector-dupe to v1.8.1
- Bump @memberjunction/aiengine to v1.8.1
- Bump @memberjunction/core to v1.8.1
- Bump @memberjunction/core-entities to v1.8.1
- Bump @memberjunction/global to v1.8.1
- Bump @memberjunction/queue to v1.8.1

## 1.8.0

Wed, 19 Jun 2024 16:32:44 GMT

### Minor changes

- Bump @memberjunction/actions to v1.8.0
- Bump @memberjunction/ai to v1.8.0
- Bump @memberjunction/ai-vector-dupe to v1.8.0
- Bump @memberjunction/aiengine to v1.8.0
- Bump @memberjunction/core to v1.8.0
- Bump @memberjunction/core-entities to v1.8.0
- Bump @memberjunction/global to v1.8.0
- Bump @memberjunction/queue to v1.8.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.7.1

Wed, 12 Jun 2024 20:13:28 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v1.7.1
- Bump @memberjunction/ai to v1.7.1
- Bump @memberjunction/ai-vector-dupe to v1.7.1
- Bump @memberjunction/aiengine to v1.7.1
- Bump @memberjunction/core to v1.7.1
- Bump @memberjunction/core-entities to v1.7.1
- Bump @memberjunction/global to v1.7.1
- Bump @memberjunction/queue to v1.7.1

## 1.6.2

Wed, 12 Jun 2024 18:53:39 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v1.7.0
- Bump @memberjunction/ai to v1.7.0
- Bump @memberjunction/ai-vector-dupe to v1.7.0
- Bump @memberjunction/aiengine to v1.7.0
- Bump @memberjunction/core to v1.7.0
- Bump @memberjunction/core-entities to v1.7.0
- Bump @memberjunction/global to v1.7.0
- Bump @memberjunction/queue to v1.7.0

## 1.6.1

Tue, 11 Jun 2024 06:50:06 GMT

### Patches

- Bump @memberjunction/actions to v1.6.1
- Bump @memberjunction/ai to v1.6.1
- Bump @memberjunction/ai-vector-dupe to v1.6.1
- Bump @memberjunction/aiengine to v1.6.1
- Bump @memberjunction/core to v1.6.1
- Bump @memberjunction/core-entities to v1.6.1
- Bump @memberjunction/global to v1.6.1
- Bump @memberjunction/queue to v1.6.1

## 1.6.0

Tue, 11 Jun 2024 04:59:29 GMT

### Minor changes

- Bump @memberjunction/actions to v1.6.0
- Bump @memberjunction/ai to v1.6.0
- Bump @memberjunction/ai-vector-dupe to v1.6.0
- Bump @memberjunction/aiengine to v1.6.0
- Bump @memberjunction/core to v1.6.0
- Bump @memberjunction/core-entities to v1.6.0
- Bump @memberjunction/global to v1.6.0
- Bump @memberjunction/queue to v1.6.0

## 1.5.3

Tue, 11 Jun 2024 04:01:37 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/actions to v1.5.3
- Bump @memberjunction/ai to v1.5.3
- Bump @memberjunction/ai-vector-dupe to v1.5.3
- Bump @memberjunction/aiengine to v1.5.3
- Bump @memberjunction/core to v1.5.3
- Bump @memberjunction/core-entities to v1.5.3
- Bump @memberjunction/global to v1.5.3
- Bump @memberjunction/queue to v1.5.3

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Bump @memberjunction/ai to v1.5.2
- Bump @memberjunction/actions to v1.5.2
- Bump @memberjunction/aiengine to v1.5.2
- Bump @memberjunction/core to v1.5.2
- Bump @memberjunction/core-entities to v1.5.2
- Bump @memberjunction/global to v1.5.2
- Bump @memberjunction/queue to v1.5.2
- Bump @memberjunction/ai-vector-dupe to v1.5.2

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Bump @memberjunction/ai to v1.5.1
- Bump @memberjunction/actions to v1.5.1
- Bump @memberjunction/aiengine to v1.5.1
- Bump @memberjunction/core to v1.5.1
- Bump @memberjunction/core-entities to v1.5.1
- Bump @memberjunction/global to v1.5.1
- Bump @memberjunction/queue to v1.5.1
- Bump @memberjunction/ai-vector-dupe to v1.5.1

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.5.0
- Bump @memberjunction/actions to v1.5.0
- Bump @memberjunction/aiengine to v1.5.0
- Bump @memberjunction/core to v1.5.0
- Bump @memberjunction/core-entities to v1.5.0
- Bump @memberjunction/global to v1.5.0
- Bump @memberjunction/queue to v1.5.0
- Bump @memberjunction/ai-vector-dupe to v1.5.0

## 1.4.1

Fri, 07 Jun 2024 04:36:53 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.4.1
- Bump @memberjunction/actions to v1.4.1
- Bump @memberjunction/aiengine to v1.4.1
- Bump @memberjunction/core to v1.4.1
- Bump @memberjunction/core-entities to v1.4.1
- Bump @memberjunction/global to v1.4.1
- Bump @memberjunction/queue to v1.4.1
- Bump @memberjunction/ai-vector-dupe to v1.4.1

## 1.4.0

Sat, 25 May 2024 15:30:16 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.4.0
- Bump @memberjunction/aiengine to v1.4.0
- Bump @memberjunction/core to v1.4.0
- Bump @memberjunction/core-entities to v1.4.0
- Bump @memberjunction/global to v1.4.0
- Bump @memberjunction/queue to v1.4.0
- Bump @memberjunction/ai-vector-dupe to v1.4.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.3.3

Thu, 23 May 2024 18:35:52 GMT

### Patches

- Bump @memberjunction/ai to v1.3.3
- Bump @memberjunction/aiengine to v1.3.3
- Bump @memberjunction/core to v1.3.3
- Bump @memberjunction/core-entities to v1.3.3
- Bump @memberjunction/global to v1.3.3
- Bump @memberjunction/queue to v1.3.3
- Bump @memberjunction/ai-vector-dupe to v1.3.3

## 1.3.2

Thu, 23 May 2024 14:19:50 GMT

### Patches

- Bump @memberjunction/ai to v1.3.2
- Bump @memberjunction/aiengine to v1.3.2
- Bump @memberjunction/core to v1.3.2
- Bump @memberjunction/core-entities to v1.3.2
- Bump @memberjunction/global to v1.3.2
- Bump @memberjunction/queue to v1.3.2
- Bump @memberjunction/ai-vector-dupe to v1.3.2

## 1.3.1

Thu, 23 May 2024 02:29:25 GMT

### Patches

- Bump @memberjunction/ai to v1.3.1
- Bump @memberjunction/aiengine to v1.3.1
- Bump @memberjunction/core to v1.3.1
- Bump @memberjunction/core-entities to v1.3.1
- Bump @memberjunction/global to v1.3.1
- Bump @memberjunction/queue to v1.3.1
- Bump @memberjunction/ai-vector-dupe to v1.3.1

## 1.3.0

Wed, 22 May 2024 02:26:03 GMT

### Minor changes

- Overhaul the way we vectorize records (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.3.0
- Bump @memberjunction/aiengine to v1.3.0
- Bump @memberjunction/core to v1.3.0
- Bump @memberjunction/core-entities to v1.3.0
- Bump @memberjunction/global to v1.3.0
- Bump @memberjunction/queue to v1.3.0
- Bump @memberjunction/ai-vector-dupe to v1.3.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.2.2

Thu, 02 May 2024 19:46:38 GMT

### Patches

- Bump @memberjunction/ai to v1.2.2
- Bump @memberjunction/aiengine to v1.2.2
- Bump @memberjunction/core to v1.2.2
- Bump @memberjunction/core-entities to v1.2.2
- Bump @memberjunction/global to v1.2.2
- Bump @memberjunction/queue to v1.2.2
- Bump @memberjunction/ai-vector-dupe to v1.2.2

## 1.2.1

Thu, 02 May 2024 16:46:11 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.2.1
- Bump @memberjunction/aiengine to v1.2.1
- Bump @memberjunction/core to v1.2.1
- Bump @memberjunction/core-entities to v1.2.1
- Bump @memberjunction/global to v1.2.1
- Bump @memberjunction/queue to v1.2.1
- Bump @memberjunction/ai-vector-dupe to v1.2.1

## 1.2.0

Mon, 29 Apr 2024 18:51:58 GMT

### Minor changes

- Bump @memberjunction/ai to v1.2.0
- Bump @memberjunction/aiengine to v1.2.0
- Bump @memberjunction/core to v1.2.0
- Bump @memberjunction/core-entities to v1.2.0
- Bump @memberjunction/global to v1.2.0
- Bump @memberjunction/queue to v1.2.0
- Bump @memberjunction/ai-vector-dupe to v1.2.0

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Bump @memberjunction/ai to v1.1.3
- Bump @memberjunction/aiengine to v1.1.3
- Bump @memberjunction/core to v1.1.3
- Bump @memberjunction/core-entities to v1.1.3
- Bump @memberjunction/global to v1.1.3
- Bump @memberjunction/queue to v1.1.3
- Bump @memberjunction/ai-vector-dupe to v1.1.3

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Bump @memberjunction/ai to v1.1.2
- Bump @memberjunction/aiengine to v1.1.2
- Bump @memberjunction/core to v1.1.2
- Bump @memberjunction/core-entities to v1.1.2
- Bump @memberjunction/global to v1.1.2
- Bump @memberjunction/queue to v1.1.2
- Bump @memberjunction/ai-vector-dupe to v1.1.2

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Bump @memberjunction/ai to v1.1.1
- Bump @memberjunction/aiengine to v1.1.1
- Bump @memberjunction/core to v1.1.1
- Bump @memberjunction/core-entities to v1.1.1
- Bump @memberjunction/global to v1.1.1
- Bump @memberjunction/queue to v1.1.1
- Bump @memberjunction/ai-vector-dupe to v1.1.1

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Bump @memberjunction/ai to v1.1.0
- Bump @memberjunction/aiengine to v1.1.0
- Bump @memberjunction/core to v1.1.0
- Bump @memberjunction/core-entities to v1.1.0
- Bump @memberjunction/global to v1.1.0
- Bump @memberjunction/queue to v1.1.0
- Bump @memberjunction/ai-vector-dupe to v1.1.0

## 1.0.11

Wed, 24 Apr 2024 20:57:42 GMT

### Patches

- - bug fixes in Skip UI \* added exception handling to ReportResolver (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/ai to v1.0.11
- Bump @memberjunction/aiengine to v1.0.11
- Bump @memberjunction/core to v1.0.11
- Bump @memberjunction/core-entities to v1.0.11
- Bump @memberjunction/global to v1.0.11
- Bump @memberjunction/queue to v1.0.11
- Bump @memberjunction/ai-vector-dupe to v1.0.11

## 1.0.9

Sun, 14 Apr 2024 15:50:05 GMT

### Patches

- Bump @memberjunction/ai to v1.0.9
- Bump @memberjunction/aiengine to v1.0.9
- Bump @memberjunction/core to v1.0.9
- Bump @memberjunction/core-entities to v1.0.9
- Bump @memberjunction/global to v1.0.9
- Bump @memberjunction/queue to v1.0.9
- Bump @memberjunction/ai-vector-dupe to v1.0.9

## 1.0.8

Sat, 13 Apr 2024 02:32:44 GMT

### Patches

- Update build and publish automation (craig.adam@bluecypress.io)
- Bump @memberjunction/ai to v1.0.8
- Bump @memberjunction/aiengine to v1.0.8
- Bump @memberjunction/core to v1.0.8
- Bump @memberjunction/core-entities to v1.0.8
- Bump @memberjunction/global to v1.0.8
- Bump @memberjunction/queue to v1.0.8
- Bump @memberjunction/ai-vector-dupe to v1.0.8
