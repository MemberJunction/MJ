# Change Log - @memberjunction/ai

## 5.0.0

### Major Changes

- 4aa1b54: breaking changes due to class name updates/approach

### Patch Changes

- Updated dependencies [4aa1b54]
  - @memberjunction/global@5.0.0

## 4.4.0

### Patch Changes

- @memberjunction/global@4.4.0

## 4.3.1

### Patch Changes

- @memberjunction/global@4.3.1

## 4.3.0

### Patch Changes

- @memberjunction/global@4.3.0

## 4.2.0

### Patch Changes

- @memberjunction/global@4.2.0

## 4.1.0

### Patch Changes

- @memberjunction/global@4.1.0

## 4.0.0

### Major Changes

- 8366d44: we goin' to 4.0!
- fe73344: Angular 21/Node 24/ESM everywhere, and more
- 5f6306c: 4.0

### Minor Changes

- e06f81c: changed SO much!

### Patch Changes

- Updated dependencies [8366d44]
- Updated dependencies [718b0ee]
- Updated dependencies [fe73344]
- Updated dependencies [5f6306c]
- Updated dependencies [e06f81c]
  - @memberjunction/global@4.0.0

## 3.4.0

### Patch Changes

- @memberjunction/global@3.4.0

## 3.3.0

### Patch Changes

- @memberjunction/global@3.3.0

## 3.2.0

### Patch Changes

- @memberjunction/global@3.2.0

## 3.1.1

### Patch Changes

- @memberjunction/global@3.1.1

## 3.0.0

### Patch Changes

- @memberjunction/global@3.0.0

## 2.133.0

### Patch Changes

- @memberjunction/global@2.133.0

## 2.132.0

### Patch Changes

- @memberjunction/global@2.132.0

## 2.131.0

### Patch Changes

- @memberjunction/global@2.131.0

## 2.130.1

### Patch Changes

- @memberjunction/global@2.130.1

## 2.130.0

### Minor Changes

- 83ae347: migrations

### Patch Changes

- @memberjunction/global@2.130.0

## 2.129.0

### Patch Changes

- Updated dependencies [fbae243]
- Updated dependencies [c7e38aa]
  - @memberjunction/global@2.129.0

## 2.128.0

### Patch Changes

- @memberjunction/global@2.128.0

## 2.127.0

### Patch Changes

- Updated dependencies [c7c3378]
  - @memberjunction/global@2.127.0

## 2.126.1

### Patch Changes

- @memberjunction/global@2.126.1

## 2.126.0

### Patch Changes

- @memberjunction/global@2.126.0

## 2.125.0

### Patch Changes

- @memberjunction/global@2.125.0

## 2.124.0

### Patch Changes

- @memberjunction/global@2.124.0

## 2.123.1

### Patch Changes

- @memberjunction/global@2.123.1

## 2.123.0

### Patch Changes

- @memberjunction/global@2.123.0

## 2.122.2

### Patch Changes

- @memberjunction/global@2.122.2

## 2.122.1

### Patch Changes

- @memberjunction/global@2.122.1

## 2.122.0

### Patch Changes

- @memberjunction/global@2.122.0

## 2.121.0

### Patch Changes

- a2bef0a: Refactor component-linter with fixture-based testing infrastructure, fix agent execution error handling and payload propagation, add Gemini API parameter fixes, and improve vendor failover with VendorValidationError type
  - @memberjunction/global@2.121.0

## 2.120.0

### Patch Changes

- @memberjunction/global@2.120.0

## 2.119.0

### Patch Changes

- @memberjunction/global@2.119.0

## 2.118.0

### Patch Changes

- @memberjunction/global@2.118.0

## 2.117.0

### Patch Changes

- @memberjunction/global@2.117.0

## 2.116.0

### Patch Changes

- Updated dependencies [a8d5592]
  - @memberjunction/global@2.116.0

## 2.115.0

### Patch Changes

- @memberjunction/global@2.115.0

## 2.114.0

### Patch Changes

- @memberjunction/global@2.114.0

## 2.113.2

### Patch Changes

- @memberjunction/global@2.113.2

## 2.112.0

### Patch Changes

- Updated dependencies [c126b59]
  - @memberjunction/global@2.112.0

## 2.110.1

### Patch Changes

- @memberjunction/global@2.110.1

## 2.110.0

### Patch Changes

- @memberjunction/global@2.110.0

## 2.109.0

### Patch Changes

- @memberjunction/global@2.109.0

## 2.108.0

### Minor Changes

- 656d86c: Migration

### Patch Changes

- @memberjunction/global@2.108.0

## 2.107.0

### Patch Changes

- @memberjunction/global@2.107.0

## 2.106.0

### Patch Changes

- @memberjunction/global@2.106.0

## 2.105.0

### Patch Changes

- 9b67e0c: This release addresses critical stability issues across build processes, runtime execution, and AI model management in the MemberJunction platform. The changes focus on three main areas: production build reliability, database migration consistency, and intelligent AI error handling.

  Resolved critical issues where Angular production builds with optimization enabled would remove essential classes through aggressive tree-shaking. Moved `TemplateEntityExtended` to `@memberjunction/core-entities` and created new `@memberjunction/ai-provider-bundle` package to centralize AI provider loading while maintaining clean separation between core infrastructure and provider implementations. Added `LoadEntityCommunicationsEngineClient()` calls to prevent removal of inherited singleton methods. These changes prevent runtime errors in production deployments where previously registered classes would become inaccessible, while improving architectural separation of concerns.

  Enhanced CodeGen SQL generation to use `IF OBJECT_ID()` patterns instead of `DROP ... IF EXISTS` syntax, fixing silent failures with Flyway placeholder substitution. Improved validator generation to properly handle nullable fields and correctly set `result.Success` status. Centralized GraphQL type name generation using schema-aware naming (`{schema}_{basetable}_`) to eliminate type collisions between entities with identical base table names across different schemas. These changes ensure reliable database migrations and prevent recurring cascade delete regressions.

  Implemented sophisticated error classification with new `NoCredit` error type for billing failures, message-first error detection, and permissive failover for 403 errors. Added hierarchical configuration-aware failover that respects configuration boundaries (Production vs Development models) while maintaining candidate list caching for performance. Enhanced error analysis to properly classify credit/quota issues and enable appropriate failover behavior.

  Improved model selection caching by checking all candidates for valid API keys instead of stopping at first match, ensuring retry logic has access to complete list of viable model/vendor combinations. Added `extractValidCandidates()` method to `AIModelSelectionInfo` class and `buildCandidatesFromSelectionInfo()` helper to properly reconstruct candidate lists from selection metadata during hierarchical template execution.

  Enhanced error-based retry and failover with intelligent handling for authentication and rate limit errors. Authentication errors now trigger vendor-level filtering (excluding all models from vendors with invalid API keys) and immediate failover to different vendors. Rate limit errors now retry the same model/vendor using configurable `MaxRetries` (default: 3) with backoff delay based on `RetryStrategy` (Fixed/Linear/Exponential) before failing over. Improved log messages with human-readable formatting showing model/vendor names, time in seconds, and clear status indicators. Fixed MJCLI sync commands to properly propagate exit codes for CI/CD integration.
  - @memberjunction/global@2.105.0

## 2.104.0

### Patch Changes

- Updated dependencies [2ff5428]
  - @memberjunction/global@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- Updated dependencies [addf572]
  - @memberjunction/global@2.103.0

## 2.100.3

### Patch Changes

- @memberjunction/global@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/global@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/global@2.100.1

## 2.100.0

### Patch Changes

- @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/global@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/global@2.97.0

## 2.96.0

### Patch Changes

- @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- @memberjunction/global@2.93.0

## 2.92.0

### Patch Changes

- @memberjunction/global@2.92.0

## 2.91.0

### Patch Changes

- @memberjunction/global@2.91.0

## 2.90.0

### Patch Changes

- @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- @memberjunction/global@2.86.0

## 2.85.0

### Minor Changes

- a96c1a7: migration

### Patch Changes

- @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- @memberjunction/global@2.83.0

## 2.82.0

### Patch Changes

- @memberjunction/global@2.82.0

## 2.81.0

### Patch Changes

- @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/global@2.80.1

## 2.80.0

### Patch Changes

- @memberjunction/global@2.80.0

## 2.79.0

### Minor Changes

- bad1a60: migration

### Patch Changes

- Updated dependencies [907e73f]
  - @memberjunction/global@2.79.0

## 2.78.0

### Minor Changes

- ef7c014: migration file

### Patch Changes

- @memberjunction/global@2.78.0

## 2.77.0

### Patch Changes

- @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- @memberjunction/global@2.75.0

## 2.74.0

### Patch Changes

- @memberjunction/global@2.74.0

## 2.73.0

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
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0

## 2.69.1

### Patch Changes

- @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/global@2.69.0

## 2.68.0

### Patch Changes

- @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/global@2.67.0

## 2.66.0

### Patch Changes

- @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- 1d034b7: Added features for agent payload manager + api keys for models
- Updated dependencies [619488f]
  - @memberjunction/global@2.65.0

## 2.64.0

### Patch Changes

- @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1

## 2.63.0

### Patch Changes

- @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- c995603: Better Error Handling and Failover in AI core and Promts
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/global@2.61.0

## 2.60.0

### Patch Changes

- @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/global@2.59.0

## 2.58.0

### Minor Changes

- db88416: migrations

### Patch Changes

- @memberjunction/global@2.58.0

## 2.57.0

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/global@2.57.0

## 2.56.0

### Patch Changes

- @memberjunction/global@2.56.0

## 2.55.0

### Minor Changes

- c3a49ff: Agent Manager + SQL Server fix + fix deps in core-entity-forms
- 659f892: Various

### Patch Changes

- @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- @memberjunction/global@2.53.0

## 2.52.0

### Minor Changes

- e926106: Significant improvements to AI functionality

### Patch Changes

- @memberjunction/global@2.52.0

## 2.51.0

### Minor Changes

- faf513c: circ deps + migration

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
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/global@2.50.0

## 2.49.0

### Minor Changes

- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [cc52ced]
- Updated dependencies [62cf1b6]
  - @memberjunction/global@2.49.0

## 2.48.0

### Patch Changes

- @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- @memberjunction/global@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/global@2.46.0

## 2.45.0

### Minor Changes

- 21d456d: Metadata and functional improvements for AI system (mainly parallelization and logging)

### Patch Changes

- @memberjunction/global@2.45.0

## 2.44.0

### Patch Changes

- fbc30dc: Documentation
  - @memberjunction/global@2.44.0

## 2.43.0

### Patch Changes

- @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/global@2.42.1

## 2.42.0

### Minor Changes

- d49f25c: Key Areas Addressed:

### Patch Changes

- @memberjunction/global@2.42.0

## 2.41.0

### Patch Changes

- 9d3b577: - Clarify that @memberjunction/ai can be used completely independently without database or environment setup
- 276371d: Added Google Vertex and Amazon Bedrock AI providers!
  - @memberjunction/global@2.41.0

## 2.40.0

### Patch Changes

- b6ce661: Proposed implementation for handling more complex `content` types in BaseLLM
  - @memberjunction/global@2.40.0

## 2.39.0

### Minor Changes

- f73ea0e: New Claude Models - bumping to 2.39.0

### Patch Changes

- @memberjunction/global@2.39.0

## 2.38.0

### Patch Changes

- @memberjunction/global@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/global@2.37.1

## 2.37.0

### Patch Changes

- @memberjunction/global@2.37.0

## 2.36.1

### Patch Changes

- d9defc9: Azure AI Inference - Implementation
- 577cc6a: Support for parallel LLM completions in BaseLLM and AIEngine
  - @memberjunction/global@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
  - @memberjunction/global@2.36.0

## 2.35.1

### Patch Changes

- @memberjunction/global@2.35.1

## 2.35.0

### Patch Changes

- @memberjunction/global@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/global@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/global@2.34.1

## 2.34.0

### Patch Changes

- b48d6b4: LLM Streaming Support + HTML Report Fixes
- 4c7f532: Documentation for new core AI package
- 54ac86c: Optimize streaming implementation + bug fixes
  - @memberjunction/global@2.34.0

## 2.33.0

### Patch Changes

- efafd0e: Readme documentation, courtesy of Claude
  - @memberjunction/global@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/global@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/global@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/global@2.32.0

## 2.31.0

### Patch Changes

- @memberjunction/global@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [a3ab749]
  - @memberjunction/global@2.30.0

## 2.29.2

### Patch Changes

- @memberjunction/global@2.29.2

## 2.28.0

### Patch Changes

- @memberjunction/global@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/global@2.27.1

## 2.27.0

### Patch Changes

- b4d3cbc: Proposed base classes for audio and video generation
  - @memberjunction/global@2.27.0

## 2.26.1

### Patch Changes

- @memberjunction/global@2.26.1

## 2.26.0

### Patch Changes

- @memberjunction/global@2.26.0

## 2.25.0

### Patch Changes

- @memberjunction/global@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/global@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [9cb85cc]
  - @memberjunction/global@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/global@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/global@2.23.1

## 2.23.0

### Patch Changes

- Updated dependencies [38b7507]
  - @memberjunction/global@2.23.0

## 2.22.2

### Patch Changes

- @memberjunction/global@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/global@2.22.1

## 2.22.0

### Patch Changes

- Updated dependencies [9660275]
  - @memberjunction/global@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:45 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:45 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Bump @memberjunction/global to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/global to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:04 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.20.0

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/global to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/global to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/global to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/global to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/global to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:48 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Bump @memberjunction/global to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/global to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/global to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.18.0

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Bump @memberjunction/global to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:28 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/global to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Bump @memberjunction/global to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:29 GMT

### Patches

- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Bump @memberjunction/global to v2.14.0

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/global to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:45 GMT

### Patches

- Bump @memberjunction/global to v2.13.3

## 2.13.2

Tue, 03 Dec 2024 23:30:43 GMT

### Patches

- Bump @memberjunction/global to v2.13.2

## 2.13.1

Wed, 27 Nov 2024 20:42:53 GMT

### Patches

- Bump @memberjunction/global to v2.13.1

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Minor changes

- Bump @memberjunction/global to v2.13.0

## 2.12.0

Mon, 04 Nov 2024 23:07:22 GMT

### Minor changes

- Bump @memberjunction/global to v2.12.0

## 2.11.0

Thu, 24 Oct 2024 15:33:07 GMT

### Minor changes

- Bump @memberjunction/global to v2.11.0

## 2.10.0

Wed, 23 Oct 2024 22:49:59 GMT

### Minor changes

- Bump @memberjunction/global to v2.10.0

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Minor changes

- Bump @memberjunction/global to v2.9.0

## 2.8.0

Tue, 15 Oct 2024 17:01:03 GMT

### Minor changes

- Bump @memberjunction/global to v2.8.0

## 2.7.1

Tue, 08 Oct 2024 22:16:58 GMT

### Patches

- Bump @memberjunction/global to v2.7.1

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.7.0

## 2.6.1

Mon, 30 Sep 2024 15:55:48 GMT

### Patches

- Bump @memberjunction/global to v2.6.1

## 2.6.0

Sat, 28 Sep 2024 00:19:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.6.0

## 2.5.2

Sat, 28 Sep 2024 00:06:03 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

### Patches

- Bump @memberjunction/global to v2.5.2

## 2.5.1

Fri, 20 Sep 2024 17:51:58 GMT

### Patches

- Bump @memberjunction/global to v2.5.1

## 2.5.0

Fri, 20 Sep 2024 16:17:07 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.5.0

### Patches

- Applying package updates [skip ci] (nico.ortiz@bluecypress.io)

## 2.4.1

Sun, 08 Sep 2024 19:33:23 GMT

### Patches

- Bump @memberjunction/global to v2.4.1

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.4.0

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Bump @memberjunction/global to v2.3.3

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Bump @memberjunction/global to v2.3.2

## 2.3.1

Fri, 16 Aug 2024 03:57:15 GMT

### Patches

- Bump @memberjunction/global to v2.3.1

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Minor changes

- Bump @memberjunction/global to v2.3.0

## 2.2.1

Fri, 09 Aug 2024 01:29:44 GMT

### Patches

- Bump @memberjunction/global to v2.2.1

## 2.2.0

Thu, 08 Aug 2024 02:53:16 GMT

### Minor changes

- Bump @memberjunction/global to v2.2.0

## 2.1.5

Thu, 01 Aug 2024 17:23:11 GMT

### Patches

- Bump @memberjunction/global to v2.1.5

## 2.1.4

Thu, 01 Aug 2024 14:43:41 GMT

### Patches

- Bump @memberjunction/global to v2.1.4

## 2.1.3

Wed, 31 Jul 2024 19:36:47 GMT

### Patches

- Bump @memberjunction/global to v2.1.3

## 2.1.2

Mon, 29 Jul 2024 22:52:11 GMT

### Patches

- Bump @memberjunction/global to v2.1.2

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Bump @memberjunction/global to v2.1.1

## 1.8.1

Fri, 21 Jun 2024 13:15:28 GMT

### Patches

- Bump @memberjunction/global to v1.8.1

## 1.8.0

Wed, 19 Jun 2024 16:32:44 GMT

### Minor changes

- Bump @memberjunction/global to v1.8.0

## 1.7.1

Wed, 12 Jun 2024 20:13:29 GMT

### Patches

- Bump @memberjunction/global to v1.7.1

## 1.7.0

Wed, 12 Jun 2024 18:53:39 GMT

### Minor changes

- Bump @memberjunction/global to v1.7.0

## 1.6.1

Tue, 11 Jun 2024 06:50:06 GMT

### Patches

- Bump @memberjunction/global to v1.6.1

## 1.6.0

Tue, 11 Jun 2024 04:59:29 GMT

### Minor changes

- Bump @memberjunction/global to v1.6.0

## 1.5.3

Tue, 11 Jun 2024 04:01:37 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.5.3

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Bump @memberjunction/global to v1.5.2

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Bump @memberjunction/global to v1.5.1

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.5.0

## 1.4.1

Fri, 07 Jun 2024 04:36:54 GMT

### Patches

- Bump @memberjunction/global to v1.4.1

## 1.4.0

Sat, 25 May 2024 15:30:16 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.4.0

## 1.3.3

Thu, 23 May 2024 18:35:52 GMT

### Patches

- Bump @memberjunction/global to v1.3.3

## 1.3.2

Thu, 23 May 2024 14:19:50 GMT

### Patches

- Bump @memberjunction/global to v1.3.2

## 1.3.1

Thu, 23 May 2024 02:29:25 GMT

### Patches

- Bump @memberjunction/global to v1.3.1

## 1.3.0

Wed, 22 May 2024 02:26:03 GMT

### Minor changes

- Overhaul the way we vectorize records (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.3.0

## 1.2.2

Thu, 02 May 2024 19:46:38 GMT

### Patches

- Bump @memberjunction/global to v1.2.2

## 1.2.1

Thu, 02 May 2024 16:46:11 GMT

### Patches

- Bump @memberjunction/global to v1.2.1

## 1.2.0

Mon, 29 Apr 2024 18:51:58 GMT

### Minor changes

- Bump @memberjunction/global to v1.2.0

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Bump @memberjunction/global to v1.1.3

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Bump @memberjunction/global to v1.1.2

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Bump @memberjunction/global to v1.1.1

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Bump @memberjunction/global to v1.1.0

## 1.0.11

Wed, 24 Apr 2024 20:57:42 GMT

### Patches

- - bug fixes in Skip UI \* added exception handling to ReportResolver (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.0.11

## 1.0.9

Sun, 14 Apr 2024 15:50:05 GMT

### Patches

- Bump @memberjunction/global to v1.0.9

## 1.0.8

Sat, 13 Apr 2024 02:32:44 GMT

### Patches

- Update build and publish automation (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.0.8
