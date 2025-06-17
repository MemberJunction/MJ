# @memberjunction/core-entities-server

## 2.51.0

### Minor Changes

- 7a9b88e: AI Improvements

### Patch Changes

- 4a79606: **Breaking circular dependency between AI packages**

  Resolves a circular dependency that was preventing `@memberjunction/core-entities-server` and other packages from
  building during `npm install`.

  **Root Cause:**

  - `@memberjunction/aiengine` imported `AIPromptRunResult` from `@memberjunction/ai-prompts`
  - `@memberjunction/ai-prompts` depended on `@memberjunction/aiengine` in package.json
  - This circular dependency blocked the build chain

  **Solution:**

  - Moved `AIPromptRunResult` and related types to `@memberjunction/ai` as shared types
  - Updated all packages to import from the shared location instead of creating circular references
  - Added comprehensive build failure debugging guide to development documentation

  **Packages Fixed:**

  - `@memberjunction/core-entities-server` now builds successfully
  - All AI packages (`aiengine`, `ai-prompts`, `ai-agents`) build without circular dependency issues
  - Build order now resolves properly in the monorepo

- Updated dependencies [4a79606]
- Updated dependencies [7a9b88e]
- Updated dependencies [53f8167]
  - @memberjunction/aiengine@2.51.0
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/ai-vector-dupe@2.51.0
  - @memberjunction/skip-types@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/aiengine@2.50.0
- @memberjunction/ai-vector-dupe@2.50.0
- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0
- @memberjunction/global@2.50.0
- @memberjunction/skip-types@2.50.0

## 2.49.0

### Minor Changes

- cc52ced: Significant changes all around
- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [2f974e2]
- Updated dependencies [cc52ced]
- Updated dependencies [ca3365f]
- Updated dependencies [db17ed7]
- Updated dependencies [62cf1b6]
  - @memberjunction/core-entities@2.49.0
  - @memberjunction/core@2.49.0
  - @memberjunction/global@2.49.0
  - @memberjunction/aiengine@2.49.0
  - @memberjunction/ai-vector-dupe@2.49.0
  - @memberjunction/skip-types@2.49.0

## 2.48.0

### Patch Changes

- Updated dependencies [e49a91a]
- Updated dependencies [bb01fcf]
- Updated dependencies [031e724]
- Updated dependencies [5c72641]
  - @memberjunction/skip-types@2.48.0
  - @memberjunction/core@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/aiengine@2.48.0
  - @memberjunction/ai-vector-dupe@2.48.0
  - @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- @memberjunction/aiengine@2.47.0
- @memberjunction/ai-vector-dupe@2.47.0
- @memberjunction/core@2.47.0
- @memberjunction/core-entities@2.47.0
- @memberjunction/global@2.47.0
- @memberjunction/skip-types@2.47.0

## 2.46.0

### Minor Changes

- fa98215: Migration to fix issues in Sequences + new package

### Patch Changes

- @memberjunction/aiengine@2.46.0
- @memberjunction/ai-vector-dupe@2.46.0
- @memberjunction/core@2.46.0
- @memberjunction/core-entities@2.46.0
- @memberjunction/global@2.46.0
- @memberjunction/skip-types@2.46.0
