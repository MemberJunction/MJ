# @memberjunction/component-registry-client-sdk

## 2.107.0

### Patch Changes

- @memberjunction/interactive-component-types@2.107.0
- @memberjunction/core@2.107.0
- @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/interactive-component-types@2.106.0
- @memberjunction/core@2.106.0
- @memberjunction/global@2.106.0

## 2.105.0

### Patch Changes

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

- cd95686: Add user email support to Component Registry Client SDK for usage tracking. The SDK now sends authenticated user email to component registry servers via query parameters (GET requests) or request body (POST requests), enabling per-user analytics and contact tracking.
- Updated dependencies [2ff5428]
  - @memberjunction/global@2.104.0
  - @memberjunction/core@2.104.0
  - @memberjunction/interactive-component-types@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [bd75336]
- Updated dependencies [addf572]
  - @memberjunction/core@2.103.0
  - @memberjunction/interactive-component-types@2.103.0
  - @memberjunction/global@2.103.0

## 2.100.3

### Patch Changes

- Updated dependencies [3cec75a]
  - @memberjunction/interactive-component-types@2.100.3
  - @memberjunction/core@2.100.3
  - @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/interactive-component-types@2.100.2
- @memberjunction/core@2.100.2
- @memberjunction/global@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/interactive-component-types@2.100.1
- @memberjunction/core@2.100.1
- @memberjunction/global@2.100.1

## 2.100.0

### Minor Changes

- b3132ec: migration

### Patch Changes

- Updated dependencies [5f76e3a]
  - @memberjunction/core@2.100.0
  - @memberjunction/interactive-component-types@2.100.0
  - @memberjunction/global@2.100.0
