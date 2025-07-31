# @memberjunction/ai-prompts

## 2.78.0

### Minor Changes

- ef7c014: migration file

### Patch Changes

- Updated dependencies [ef7c014]
- Updated dependencies [06088e5]
  - @memberjunction/ai@2.78.0
  - @memberjunction/core-entities@2.78.0
  - @memberjunction/ai-core-plus@2.78.0
  - @memberjunction/aiengine@2.78.0
  - @memberjunction/templates@2.78.0
  - @memberjunction/templates-base-types@2.78.0
  - @memberjunction/core@2.78.0
  - @memberjunction/global@2.78.0

## 2.77.0

### Patch Changes

- Updated dependencies [d8f14a2]
- Updated dependencies [8ee0d86]
- Updated dependencies [c91269e]
  - @memberjunction/core@2.77.0
  - @memberjunction/core-entities@2.77.0
  - @memberjunction/ai-core-plus@2.77.0
  - @memberjunction/aiengine@2.77.0
  - @memberjunction/templates-base-types@2.77.0
  - @memberjunction/templates@2.77.0
  - @memberjunction/ai@2.77.0
  - @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- Updated dependencies [4b27b3c]
- Updated dependencies [7dabb22]
- Updated dependencies [ffda243]
  - @memberjunction/core-entities@2.76.0
  - @memberjunction/core@2.76.0
  - @memberjunction/ai-core-plus@2.76.0
  - @memberjunction/aiengine@2.76.0
  - @memberjunction/templates-base-types@2.76.0
  - @memberjunction/templates@2.76.0
  - @memberjunction/ai@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Minor Changes

- 9ccd145: migration

### Patch Changes

- @memberjunction/ai@2.75.0
- @memberjunction/ai-core-plus@2.75.0
- @memberjunction/aiengine@2.75.0
- @memberjunction/core@2.75.0
- @memberjunction/core-entities@2.75.0
- @memberjunction/global@2.75.0
- @memberjunction/templates-base-types@2.75.0
- @memberjunction/templates@2.75.0

## 2.74.0

### Minor Changes

- 9ff358d: migration

### Patch Changes

- Updated dependencies [b70301e]
- Updated dependencies [d316670]
  - @memberjunction/core-entities@2.74.0
  - @memberjunction/core@2.74.0
  - @memberjunction/ai-core-plus@2.74.0
  - @memberjunction/aiengine@2.74.0
  - @memberjunction/templates-base-types@2.74.0
  - @memberjunction/templates@2.74.0
  - @memberjunction/ai@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Minor Changes

- eab6a48: migration files
- 9801456: migration

### Patch Changes

- eebfb9a: Add comprehensive context length handling with intelligent model
  selection

  This release adds sophisticated context length management to prevent
  infinite retry loops when AI models encounter context length exceeded
  errors.

  **New Features:**

  - **ContextLengthExceeded Error Type**: New error classification for
    context length exceeded errors
  - **Smart Failover Logic**: Automatically switches to models with larger
    context windows when context errors occur
  - **Proactive Model Selection**: Estimates token usage and selects
    appropriate models before execution
  - **Context-Aware Sorting**: Prioritizes models by context window size
    during failover

  **Enhanced Components:**

  - **ErrorAnalyzer**: Detects context_length_exceeded errors from
    provider codes, error messages, and JSON objects
  - **AIPromptRunner**: Adds token estimation, context validation, and
    intelligent model reselection
  - **Failover System**: Context-aware candidate selection with detailed
    logging

  **Key Improvements:**

  - Prevents infinite agent stalling on context length exceeded errors
  - Reduces API costs by avoiding repeated failed attempts with
    insufficient context models
  - Improves reliability through proactive context length validation
  - Provides detailed logging for monitoring and debugging

  **Breaking Changes:**

  - None - all changes are backward compatible

  **Migration Notes:**

  - No migration required - existing code will automatically benefit from
    enhanced context handling
  - Models with MaxInputTokens/MaxOutputTokens configured will be
    prioritized appropriately
  - Context length validation occurs transparently during prompt execution

  This resolves the critical issue where agents would infinitely retry
  prompts that exceed model context limits, improving system reliability
  and reducing unnecessary API calls.

- Updated dependencies [26c2b03]
- Updated dependencies [e99336f]
- Updated dependencies [eebfb9a]
  - @memberjunction/aiengine@2.73.0
  - @memberjunction/core-entities@2.73.0
  - @memberjunction/ai@2.73.0
  - @memberjunction/templates@2.73.0
  - @memberjunction/ai-core-plus@2.73.0
  - @memberjunction/templates-base-types@2.73.0
  - @memberjunction/core@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- Updated dependencies [636b6ee]
  - @memberjunction/core-entities@2.72.0
  - @memberjunction/ai-core-plus@2.72.0
  - @memberjunction/aiengine@2.72.0
  - @memberjunction/templates-base-types@2.72.0
  - @memberjunction/templates@2.72.0
  - @memberjunction/ai@2.72.0
  - @memberjunction/core@2.72.0
  - @memberjunction/global@2.72.0

## 2.71.0

### Minor Changes

- 91188ab: migration file + various improvements and reorganization

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0
  - @memberjunction/ai@2.71.0
  - @memberjunction/ai-core-plus@2.71.0
  - @memberjunction/aiengine@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/core-entities@2.71.0
  - @memberjunction/templates-base-types@2.71.0
  - @memberjunction/templates@2.71.0

## 2.70.0

### Minor Changes

- c9d86cd: migration

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/ai-core-plus@2.70.0
  - @memberjunction/ai@2.70.0
  - @memberjunction/aiengine@2.70.0
  - @memberjunction/core@2.70.0
  - @memberjunction/core-entities@2.70.0
  - @memberjunction/templates-base-types@2.70.0
  - @memberjunction/templates@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/ai-core-plus@2.69.1
  - @memberjunction/aiengine@2.69.1
  - @memberjunction/core-entities@2.69.1
  - @memberjunction/templates-base-types@2.69.1
  - @memberjunction/templates@2.69.1
  - @memberjunction/ai@2.69.1
  - @memberjunction/global@2.69.1

## 2.69.0

### Minor Changes

- 79e8509: Several changes to improve validation functionality

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/core@2.69.0
  - @memberjunction/global@2.69.0
  - @memberjunction/ai-core-plus@2.69.0
  - @memberjunction/aiengine@2.69.0
  - @memberjunction/core-entities@2.69.0
  - @memberjunction/templates-base-types@2.69.0
  - @memberjunction/templates@2.69.0
  - @memberjunction/ai@2.69.0

## 2.68.0

### Patch Changes

- 6fa0b2d: child template rendering fix
- Updated dependencies [b10b7e6]
  - @memberjunction/core@2.68.0
  - @memberjunction/ai-core-plus@2.68.0
  - @memberjunction/aiengine@2.68.0
  - @memberjunction/core-entities@2.68.0
  - @memberjunction/templates-base-types@2.68.0
  - @memberjunction/templates@2.68.0
  - @memberjunction/ai@2.68.0
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/ai@2.67.0
- @memberjunction/ai-core-plus@2.67.0
- @memberjunction/aiengine@2.67.0
- @memberjunction/core@2.67.0
- @memberjunction/core-entities@2.67.0
- @memberjunction/global@2.67.0
- @memberjunction/templates-base-types@2.67.0
- @memberjunction/templates@2.67.0

## 2.66.0

### Patch Changes

- @memberjunction/ai-core-plus@2.66.0
- @memberjunction/aiengine@2.66.0
- @memberjunction/templates@2.66.0
- @memberjunction/ai@2.66.0
- @memberjunction/core@2.66.0
- @memberjunction/core-entities@2.66.0
- @memberjunction/global@2.66.0
- @memberjunction/templates-base-types@2.66.0

## 2.65.0

### Patch Changes

- Updated dependencies [1d034b7]
- Updated dependencies [619488f]
- Updated dependencies [b029c5d]
  - @memberjunction/ai@2.65.0
  - @memberjunction/ai-core-plus@2.65.0
  - @memberjunction/global@2.65.0
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/aiengine@2.65.0
  - @memberjunction/templates@2.65.0
  - @memberjunction/core@2.65.0
  - @memberjunction/templates-base-types@2.65.0

## 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/ai-core-plus@2.64.0
  - @memberjunction/aiengine@2.64.0
  - @memberjunction/templates-base-types@2.64.0
  - @memberjunction/templates@2.64.0
  - @memberjunction/ai@2.64.0
  - @memberjunction/core@2.64.0
  - @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/ai@2.63.1
  - @memberjunction/ai-core-plus@2.63.1
  - @memberjunction/aiengine@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1
  - @memberjunction/templates-base-types@2.63.1
  - @memberjunction/templates@2.63.1

## 2.63.0

### Patch Changes

- Updated dependencies [28e8a85]
  - @memberjunction/ai-core-plus@2.63.0
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/aiengine@2.63.0
  - @memberjunction/templates-base-types@2.63.0
  - @memberjunction/templates@2.63.0
  - @memberjunction/ai@2.63.0
  - @memberjunction/core@2.63.0
  - @memberjunction/global@2.63.0

## 2.62.0

### Minor Changes

- 4a4b488: Failover support

### Patch Changes

- c995603: Better Error Handling and Failover in AI core and Promts
- Updated dependencies [c995603]
  - @memberjunction/ai@2.62.0
  - @memberjunction/ai-core-plus@2.62.0
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/aiengine@2.62.0
  - @memberjunction/templates@2.62.0
  - @memberjunction/templates-base-types@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- Updated dependencies [51b2b47]
  - @memberjunction/ai-core-plus@2.61.0
  - @memberjunction/aiengine@2.61.0
  - @memberjunction/templates@2.61.0
  - @memberjunction/ai@2.61.0
  - @memberjunction/core@2.61.0
  - @memberjunction/core-entities@2.61.0
  - @memberjunction/global@2.61.0
  - @memberjunction/templates-base-types@2.61.0

## 2.60.0

### Minor Changes

- e512e4e: metadata + core + ai changes

### Patch Changes

- Updated dependencies [bb46c63]
- Updated dependencies [b5fa80a]
- Updated dependencies [e30ee12]
- Updated dependencies [e512e4e]
  - @memberjunction/ai-core-plus@2.60.0
  - @memberjunction/core@2.60.0
  - @memberjunction/core-entities@2.60.0
  - @memberjunction/aiengine@2.60.0
  - @memberjunction/templates-base-types@2.60.0
  - @memberjunction/templates@2.60.0
  - @memberjunction/ai@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/ai@2.59.0
- @memberjunction/ai-core-plus@2.59.0
- @memberjunction/aiengine@2.59.0
- @memberjunction/core@2.59.0
- @memberjunction/core-entities@2.59.0
- @memberjunction/global@2.59.0
- @memberjunction/templates-base-types@2.59.0
- @memberjunction/templates@2.59.0

## 2.58.0

### Minor Changes

- db88416: migrations

### Patch Changes

- Updated dependencies [def26fe]
- Updated dependencies [db88416]
  - @memberjunction/core@2.58.0
  - @memberjunction/ai@2.58.0
  - @memberjunction/ai-core-plus@2.58.0
  - @memberjunction/aiengine@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/templates-base-types@2.58.0
  - @memberjunction/templates@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/global@2.57.0
  - @memberjunction/aiengine@2.57.0
  - @memberjunction/templates-base-types@2.57.0
  - @memberjunction/templates@2.57.0
  - @memberjunction/ai@2.57.0

## 2.56.0

### Patch Changes

- Updated dependencies [bf24cae]
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/aiengine@2.56.0
  - @memberjunction/templates-base-types@2.56.0
  - @memberjunction/templates@2.56.0
  - @memberjunction/ai@2.56.0
  - @memberjunction/core@2.56.0
  - @memberjunction/global@2.56.0

## 2.55.0

### Patch Changes

- Updated dependencies [c3a49ff]
- Updated dependencies [659f892]
  - @memberjunction/ai@2.55.0
  - @memberjunction/aiengine@2.55.0
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/templates@2.55.0
  - @memberjunction/templates-base-types@2.55.0
  - @memberjunction/core@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- c96d6dd: various
- Updated dependencies [20f424d]
- Updated dependencies [a6f553e]
- Updated dependencies [0f6e995]
- Updated dependencies [0046359]
  - @memberjunction/core@2.54.0
  - @memberjunction/aiengine@2.54.0
  - @memberjunction/core-entities@2.54.0
  - @memberjunction/templates-base-types@2.54.0
  - @memberjunction/templates@2.54.0
  - @memberjunction/ai@2.54.0
  - @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- Updated dependencies [bddc4ea]
- Updated dependencies [390f587]
  - @memberjunction/core@2.53.0
  - @memberjunction/core-entities@2.53.0
  - @memberjunction/templates@2.53.0
  - @memberjunction/aiengine@2.53.0
  - @memberjunction/templates-base-types@2.53.0
  - @memberjunction/ai@2.53.0
  - @memberjunction/global@2.53.0

## 2.52.0

### Patch Changes

- Updated dependencies [e926106]
  - @memberjunction/ai@2.52.0
  - @memberjunction/aiengine@2.52.0
  - @memberjunction/core@2.52.0
  - @memberjunction/core-entities@2.52.0
  - @memberjunction/templates@2.52.0
  - @memberjunction/templates-base-types@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

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
- Updated dependencies [faf513c]
- Updated dependencies [7a9b88e]
- Updated dependencies [53f8167]
  - @memberjunction/ai@2.51.0
  - @memberjunction/aiengine@2.51.0
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/templates@2.51.0
  - @memberjunction/templates-base-types@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/ai@2.50.0
- @memberjunction/aiengine@2.50.0
- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0
- @memberjunction/global@2.50.0
- @memberjunction/templates-base-types@2.50.0
- @memberjunction/templates@2.50.0

## 2.49.0

### Minor Changes

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
  - @memberjunction/ai@2.49.0
  - @memberjunction/aiengine@2.49.0
  - @memberjunction/templates-base-types@2.49.0
  - @memberjunction/templates@2.49.0

## 2.48.0

### Minor Changes

- 031e724: Implement agent architecture separation of concerns

  - **NEW**: Add BaseAgent class for domain-specific prompt execution
  - **NEW**: Add ConductorAgent for autonomous orchestration decisions and action planning
  - **NEW**: Add AgentRunner class to coordinate BaseAgent + ConductorAgent interactions
  - **NEW**: Add AgentFactory with `GetConductorAgent()` and `GetAgentRunner()` methods using MJGlobal
    class factory
  - **NEW**: Add comprehensive execution tracking with AIAgentRun and AIAgentRunStep entities
  - **NEW**: Support parallel and sequential action execution with proper ordering
  - **NEW**: Structured JSON response format for deterministic decision parsing
  - **NEW**: Database persistence for execution history and step tracking
  - **NEW**: Cancellation and progress monitoring support
  - **NEW**: Context compression for long conversations
  - **NEW**: Template rendering with data context

  This implements clean separation of concerns:

  - BaseAgent: Domain-specific execution only (~500 lines)
  - ConductorAgent: Orchestration decisions with structured responses
  - AgentRunner: Coordination layer providing unified user interface

  Includes comprehensive TypeScript typing and MemberJunction framework integration.

### Patch Changes

- Updated dependencies [bb01fcf]
- Updated dependencies [031e724]
  - @memberjunction/core@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/aiengine@2.48.0
  - @memberjunction/templates@2.48.0
  - @memberjunction/ai@2.48.0
  - @memberjunction/global@2.48.0

## 2.47.0

### Minor Changes

- 4c4751c: Changed datetime2 to datetimeoffset for RunAt/CompletedAt columns in the AIPromptRun table

### Patch Changes

- 3621e2f: Tweaks to prompt interface
  - @memberjunction/aiengine@2.47.0
  - @memberjunction/templates@2.47.0
  - @memberjunction/ai@2.47.0
  - @memberjunction/core@2.47.0
  - @memberjunction/core-entities@2.47.0
  - @memberjunction/global@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/ai@2.46.0
- @memberjunction/aiengine@2.46.0
- @memberjunction/core@2.46.0
- @memberjunction/core-entities@2.46.0
- @memberjunction/global@2.46.0
- @memberjunction/templates@2.46.0

## 2.45.0

### Minor Changes

- 21d456d: Metadata and functional improvements for AI system (mainly parallelization and logging)

### Patch Changes

- Updated dependencies [21d456d]
- Updated dependencies [556ee8d]
  - @memberjunction/ai@2.45.0
  - @memberjunction/aiengine@2.45.0
  - @memberjunction/core-entities@2.45.0
  - @memberjunction/templates@2.45.0
  - @memberjunction/core@2.45.0
  - @memberjunction/global@2.45.0

## 2.44.0

### Minor Changes

- f7aec1c: Moved functionality around in the AI packages to reflect new organization plus elim cyclical dep issue with @memberjunction/templates engine

### Patch Changes

- Updated dependencies [f7aec1c]
- Updated dependencies [fbc30dc]
- Updated dependencies [d723c0c]
- Updated dependencies [9f02cd8]
- Updated dependencies [99b27c5]
- Updated dependencies [091c5f6]
  - @memberjunction/aiengine@2.44.0
  - @memberjunction/ai@2.44.0
  - @memberjunction/core@2.44.0
  - @memberjunction/core-entities@2.44.0
  - @memberjunction/templates@2.44.0
  - @memberjunction/global@2.44.0
