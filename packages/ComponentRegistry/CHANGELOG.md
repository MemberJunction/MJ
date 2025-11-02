# @memberjunction/component-registry-server

## 2.115.0

### Patch Changes

- @memberjunction/sqlserver-dataprovider@2.115.0
- @memberjunction/interactive-component-types@2.115.0
- @memberjunction/core@2.115.0
- @memberjunction/core-entities@2.115.0
- @memberjunction/global@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/interactive-component-types@2.114.0
- @memberjunction/core@2.114.0
- @memberjunction/core-entities@2.114.0
- @memberjunction/global@2.114.0
- @memberjunction/sqlserver-dataprovider@2.114.0

## 2.113.2

### Patch Changes

- Updated dependencies [61d1df4]
  - @memberjunction/core@2.113.2
  - @memberjunction/interactive-component-types@2.113.2
  - @memberjunction/core-entities@2.113.2
  - @memberjunction/sqlserver-dataprovider@2.113.2
  - @memberjunction/global@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [e237ca9]
- Updated dependencies [c126b59]
  - @memberjunction/sqlserver-dataprovider@2.112.0
  - @memberjunction/global@2.112.0
  - @memberjunction/core@2.112.0
  - @memberjunction/core-entities@2.112.0
  - @memberjunction/interactive-component-types@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/interactive-component-types@2.110.1
- @memberjunction/core@2.110.1
- @memberjunction/core-entities@2.110.1
- @memberjunction/global@2.110.1
- @memberjunction/sqlserver-dataprovider@2.110.1

## 2.110.0

### Patch Changes

- Updated dependencies [02d72ff]
- Updated dependencies [d2d7ab9]
- Updated dependencies [c8b9aca]
  - @memberjunction/core-entities@2.110.0
  - @memberjunction/sqlserver-dataprovider@2.110.0
  - @memberjunction/interactive-component-types@2.110.0
  - @memberjunction/core@2.110.0
  - @memberjunction/global@2.110.0

## 2.109.0

### Patch Changes

- Updated dependencies [6e45c17]
  - @memberjunction/core-entities@2.109.0
  - @memberjunction/sqlserver-dataprovider@2.109.0
  - @memberjunction/interactive-component-types@2.109.0
  - @memberjunction/core@2.109.0
  - @memberjunction/global@2.109.0

## 2.108.0

### Patch Changes

- Updated dependencies [656d86c]
  - @memberjunction/core-entities@2.108.0
  - @memberjunction/sqlserver-dataprovider@2.108.0
  - @memberjunction/interactive-component-types@2.108.0
  - @memberjunction/core@2.108.0
  - @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/interactive-component-types@2.107.0
- @memberjunction/core@2.107.0
- @memberjunction/core-entities@2.107.0
- @memberjunction/global@2.107.0
- @memberjunction/sqlserver-dataprovider@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/interactive-component-types@2.106.0
- @memberjunction/core@2.106.0
- @memberjunction/core-entities@2.106.0
- @memberjunction/global@2.106.0
- @memberjunction/sqlserver-dataprovider@2.106.0

## 2.105.0

### Patch Changes

- Updated dependencies [4807f35]
- Updated dependencies [9b67e0c]
  - @memberjunction/core-entities@2.105.0
  - @memberjunction/sqlserver-dataprovider@2.105.0
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
- Updated dependencies [9ad6353]
- Updated dependencies [6e7f14a]
  - @memberjunction/global@2.104.0
  - @memberjunction/core-entities@2.104.0
  - @memberjunction/sqlserver-dataprovider@2.104.0
  - @memberjunction/core@2.104.0
  - @memberjunction/interactive-component-types@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [bd75336]
- Updated dependencies [addf572]
- Updated dependencies [3ba01de]
- Updated dependencies [a38eec3]
  - @memberjunction/core@2.103.0
  - @memberjunction/interactive-component-types@2.103.0
  - @memberjunction/sqlserver-dataprovider@2.103.0
  - @memberjunction/core-entities@2.103.0
  - @memberjunction/global@2.103.0

## 2.100.3

### Patch Changes

- 4bd084f: Add router mode support to ComponentRegistryAPIServer

  Enables mounting the registry as an Express Router on existing
  applications instead of running as a standalone service. The
  server can now operate in 'router' mode (returns Express Router)
  or 'standalone' mode (default, unchanged behavior).

  New `ComponentRegistryServerOptions` interface supports mode
  selection, custom base paths, and optional database setup
  skipping

- Updated dependencies [3cec75a]
  - @memberjunction/interactive-component-types@2.100.3
  - @memberjunction/core-entities@2.100.3
  - @memberjunction/sqlserver-dataprovider@2.100.3
  - @memberjunction/core@2.100.3
  - @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- 525bb13: fix: Move @types/express to dependencies in ComponentRegistry package
  - @memberjunction/interactive-component-types@2.100.2
  - @memberjunction/core@2.100.2
  - @memberjunction/core-entities@2.100.2
  - @memberjunction/global@2.100.2
  - @memberjunction/sqlserver-dataprovider@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/interactive-component-types@2.100.1
- @memberjunction/core@2.100.1
- @memberjunction/core-entities@2.100.1
- @memberjunction/global@2.100.1
- @memberjunction/sqlserver-dataprovider@2.100.1

## 2.100.0

### Minor Changes

- b3132ec: migration

### Patch Changes

- Updated dependencies [5f76e3a]
- Updated dependencies [ffc2c1a]
  - @memberjunction/core@2.100.0
  - @memberjunction/core-entities@2.100.0
  - @memberjunction/interactive-component-types@2.100.0
  - @memberjunction/sqlserver-dataprovider@2.100.0
  - @memberjunction/global@2.100.0

## 2.99.0

### Minor Changes

- d88dc62: Component Registry Server

### Patch Changes

- Updated dependencies [eb7677d]
- Updated dependencies [8bbb0a9]
  - @memberjunction/core-entities@2.99.0
  - @memberjunction/core@2.99.0
  - @memberjunction/sqlserver-dataprovider@2.99.0
  - @memberjunction/interactive-component-types@2.99.0
  - @memberjunction/global@2.99.0
