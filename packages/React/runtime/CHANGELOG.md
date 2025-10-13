# @memberjunction/react-runtime

## 2.105.0

### Patch Changes

- Updated dependencies [4807f35]
- Updated dependencies [9b67e0c]
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/graphql-dataprovider@2.105.0
  - @memberjunction/interactive-component-types@2.105.0
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

- Updated dependencies [2ff5428]
- Updated dependencies [4567af3]
- Updated dependencies [9ad6353]
  - @memberjunction/global@2.104.0
  - @memberjunction/graphql-dataprovider@2.104.0
  - @memberjunction/core-entities@2.104.0
  - @memberjunction/core@2.104.0
  - @memberjunction/interactive-component-types@2.104.0

## 2.103.0

### Patch Changes

- bd75336: ix: Improve React component system registry handling and chart
  flexibility

  - Enhanced component manager to optimize pre-registered component loading
    by skipping redundant fetches
  - Fixed SimpleChart component to accept any field for grouping, not just
    numeric fields
  - Removed backup metadata file to clean up repository
  - Added support for components with pre-populated code in the registry
  - Improved dependency resolution for local registry components
  - Better logging for component loading optimization paths

- addf572: Bump all packages to 2.101.0
- Updated dependencies [bd75336]
- Updated dependencies [addf572]
- Updated dependencies [3ba01de]
- Updated dependencies [a38eec3]
  - @memberjunction/core@2.103.0
  - @memberjunction/interactive-component-types@2.103.0
  - @memberjunction/graphql-dataprovider@2.103.0
  - @memberjunction/core-entities@2.103.0
  - @memberjunction/global@2.103.0

## 2.100.3

### Patch Changes

- 3cec75a: CreateSimpleNotification added up and down stack
- Updated dependencies [3cec75a]
  - @memberjunction/interactive-component-types@2.100.3
  - @memberjunction/core-entities@2.100.3
  - @memberjunction/graphql-dataprovider@2.100.3
  - @memberjunction/core@2.100.3
  - @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/graphql-dataprovider@2.100.2
- @memberjunction/interactive-component-types@2.100.2
- @memberjunction/core@2.100.2
- @memberjunction/core-entities@2.100.2
- @memberjunction/global@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/graphql-dataprovider@2.100.1
- @memberjunction/interactive-component-types@2.100.1
- @memberjunction/core@2.100.1
- @memberjunction/core-entities@2.100.1
- @memberjunction/global@2.100.1

## 2.100.0

### Patch Changes

- 6dfe03c: tweaks
- Updated dependencies [5f76e3a]
- Updated dependencies [b3132ec]
- Updated dependencies [ffc2c1a]
  - @memberjunction/core@2.100.0
  - @memberjunction/graphql-dataprovider@2.100.0
  - @memberjunction/core-entities@2.100.0
  - @memberjunction/interactive-component-types@2.100.0
  - @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- 5af2d74: updates to react runtime
- Updated dependencies [eb7677d]
- Updated dependencies [8bbb0a9]
  - @memberjunction/core-entities@2.99.0
  - @memberjunction/core@2.99.0
  - @memberjunction/interactive-component-types@2.99.0
  - @memberjunction/global@2.99.0

## 2.98.0

### Minor Changes

- ce949f4: migration

### Patch Changes

- 56a4e9d: tweaks to linter
  - @memberjunction/interactive-component-types@2.98.0
  - @memberjunction/core@2.98.0
  - @memberjunction/core-entities@2.98.0
  - @memberjunction/global@2.98.0

## 2.97.0

### Patch Changes

- Updated dependencies [dc497d5]
  - @memberjunction/interactive-component-types@2.97.0
  - @memberjunction/core-entities@2.97.0
  - @memberjunction/core@2.97.0
  - @memberjunction/global@2.97.0

## 2.96.0

### Minor Changes

- 8f34e55: migration
- 22e365f: migration
- ad06a79: migration
- 8e1c946: migration

### Patch Changes

- a3d32ec: tweaks
- Updated dependencies [01dcfde]
  - @memberjunction/core@2.96.0
  - @memberjunction/interactive-component-types@2.96.0
  - @memberjunction/core-entities@2.96.0
  - @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- 3cd7db6: fix rendering issue
- Updated dependencies [a54c014]
- Updated dependencies [85985bd]
  - @memberjunction/core@2.95.0
  - @memberjunction/interactive-component-types@2.95.0
  - @memberjunction/core-entities@2.95.0
  - @memberjunction/global@2.95.0

## 2.94.0

### Minor Changes

- 455654e: migration (unrelated) to bump to minor
- 7c27b04: migration
- 98afc80: migrations

### Patch Changes

- Updated dependencies [eed16e0]
  - @memberjunction/interactive-component-types@2.94.0
  - @memberjunction/core-entities@2.94.0
  - @memberjunction/core@2.94.0
  - @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- bfcd737: Refactoring and new AI functionality
- Updated dependencies [f8757aa]
- Updated dependencies [bfcd737]
- Updated dependencies [103e4a9]
- Updated dependencies [7f465b5]
- Updated dependencies [1461a44]
  - @memberjunction/core@2.93.0
  - @memberjunction/interactive-component-types@2.93.0
  - @memberjunction/core-entities@2.93.0
  - @memberjunction/global@2.93.0

## 2.92.0

### Minor Changes

- b303b84: migrations

### Patch Changes

- Updated dependencies [b303b84]
- Updated dependencies [8fb03df]
- Updated dependencies [5817bac]
  - @memberjunction/interactive-component-types@2.92.0
  - @memberjunction/core@2.92.0
  - @memberjunction/core-entities@2.92.0
  - @memberjunction/global@2.92.0

## 2.91.0

### Minor Changes

- 6476d74: migrations

### Patch Changes

- Updated dependencies [f703033]
- Updated dependencies [6476d74]
  - @memberjunction/core@2.91.0
  - @memberjunction/core-entities@2.91.0
  - @memberjunction/interactive-component-types@2.91.0
  - @memberjunction/global@2.91.0

## 2.90.0

### Minor Changes

- 187527b: migration
- da3eb4f: migration

### Patch Changes

- Updated dependencies [d4530d7]
- Updated dependencies [146ebcc]
  - @memberjunction/interactive-component-types@2.90.0
  - @memberjunction/core@2.90.0
  - @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- @memberjunction/interactive-component-types@2.89.0
- @memberjunction/core@2.89.0
- @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- @memberjunction/interactive-component-types@2.88.0
- @memberjunction/core@2.88.0
- @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- Updated dependencies [58a00df]
  - @memberjunction/core@2.87.0
  - @memberjunction/interactive-component-types@2.87.0
  - @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- @memberjunction/interactive-component-types@2.86.0
- @memberjunction/core@2.86.0
- @memberjunction/global@2.86.0

## 2.85.0

### Patch Changes

- @memberjunction/interactive-component-types@2.85.0
- @memberjunction/core@2.85.0
- @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- Updated dependencies [0b9d691]
  - @memberjunction/core@2.84.0
  - @memberjunction/interactive-component-types@2.84.0
  - @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- 87f7308: registration improvements
- Updated dependencies [e2e0415]
  - @memberjunction/core@2.83.0
  - @memberjunction/interactive-component-types@2.83.0
  - @memberjunction/global@2.83.0

## 2.82.0

### Patch Changes

- @memberjunction/interactive-component-types@2.82.0
- @memberjunction/core@2.82.0
- @memberjunction/global@2.82.0

## 2.81.0

### Patch Changes

- Updated dependencies [6d2d478]
- Updated dependencies [971c5d4]
  - @memberjunction/core@2.81.0
  - @memberjunction/interactive-component-types@2.81.0
  - @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/interactive-component-types@2.80.1
- @memberjunction/core@2.80.1
- @memberjunction/global@2.80.1

## 2.80.0

### Patch Changes

- Updated dependencies [7c5f844]
  - @memberjunction/core@2.80.0
  - @memberjunction/interactive-component-types@2.80.0
  - @memberjunction/global@2.80.0

## 2.79.0

### Patch Changes

- Updated dependencies [907e73f]
  - @memberjunction/global@2.79.0
  - @memberjunction/core@2.79.0
  - @memberjunction/interactive-component-types@2.79.0

## 2.78.0

### Patch Changes

- @memberjunction/interactive-component-types@2.78.0
- @memberjunction/core@2.78.0
- @memberjunction/global@2.78.0

## 2.77.0

### Patch Changes

- Updated dependencies [d8f14a2]
- Updated dependencies [c91269e]
  - @memberjunction/core@2.77.0
  - @memberjunction/interactive-component-types@2.77.0
  - @memberjunction/global@2.77.0

## 2.76.0

### Minor Changes

- ffda243: migration

### Patch Changes

- Updated dependencies [7dabb22]
  - @memberjunction/core@2.76.0
  - @memberjunction/interactive-component-types@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Minor Changes

- 9ccd145: migration

### Patch Changes

- 0da7b51: tweaks to types
- Updated dependencies [b403003]
  - @memberjunction/interactive-component-types@2.75.0
  - @memberjunction/core@2.75.0
  - @memberjunction/global@2.75.0

## 2.74.0

### Patch Changes

- Updated dependencies [d316670]
  - @memberjunction/core@2.74.0
  - @memberjunction/interactive-component-types@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- @memberjunction/interactive-component-types@2.73.0
- @memberjunction/core@2.73.0
- @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- @memberjunction/interactive-component-types@2.72.0
- @memberjunction/core@2.72.0
- @memberjunction/global@2.72.0

## 2.71.0

### Minor Changes

- 91188ab: migration file + various improvements and reorganization

### Patch Changes

- 062918f: fix package.json
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
- Updated dependencies [91188ab]
  - @memberjunction/global@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/interactive-component-types@2.71.0

## 2.70.0
