# @memberjunction/ai-prompts

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
