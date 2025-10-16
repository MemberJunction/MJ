# Change Log - @memberjunction/cli

## 2.107.0

### Patch Changes

- @memberjunction/ai-cli@2.107.0
- @memberjunction/codegen-lib@2.107.0
- @memberjunction/metadata-sync@2.107.0
- @memberjunction/sqlserver-dataprovider@2.107.0

## 2.106.0

### Patch Changes

- Updated dependencies [3ca1b36]
  - @memberjunction/codegen-lib@2.106.0
  - @memberjunction/metadata-sync@2.106.0
  - @memberjunction/ai-cli@2.106.0
  - @memberjunction/sqlserver-dataprovider@2.106.0

## 2.105.0

### Patch Changes

- 9b67e0c: This release addresses critical stability issues across build processes, runtime execution, and AI model management in the MemberJunction platform. The changes focus on three main areas: production build reliability, database migration consistency, and intelligent AI error handling.

  Resolved critical issues where Angular production builds with optimization enabled would remove essential classes through aggressive tree-shaking. Moved `TemplateEntityExtended` to `@memberjunction/core-entities` and created new `@memberjunction/ai-provider-bundle` package to centralize AI provider loading while maintaining clean separation between core infrastructure and provider implementations. Added `LoadEntityCommunicationsEngineClient()` calls to prevent removal of inherited singleton methods. These changes prevent runtime errors in production deployments where previously registered classes would become inaccessible, while improving architectural separation of concerns.

  Enhanced CodeGen SQL generation to use `IF OBJECT_ID()` patterns instead of `DROP ... IF EXISTS` syntax, fixing silent failures with Flyway placeholder substitution. Improved validator generation to properly handle nullable fields and correctly set `result.Success` status. Centralized GraphQL type name generation using schema-aware naming (`{schema}_{basetable}_`) to eliminate type collisions between entities with identical base table names across different schemas. These changes ensure reliable database migrations and prevent recurring cascade delete regressions.

  Implemented sophisticated error classification with new `NoCredit` error type for billing failures, message-first error detection, and permissive failover for 403 errors. Added hierarchical configuration-aware failover that respects configuration boundaries (Production vs Development models) while maintaining candidate list caching for performance. Enhanced error analysis to properly classify credit/quota issues and enable appropriate failover behavior.

  Improved model selection caching by checking all candidates for valid API keys instead of stopping at first match, ensuring retry logic has access to complete list of viable model/vendor combinations. Added `extractValidCandidates()` method to `AIModelSelectionInfo` class and `buildCandidatesFromSelectionInfo()` helper to properly reconstruct candidate lists from selection metadata during hierarchical template execution.

  Enhanced error-based retry and failover with intelligent handling for authentication and rate limit errors. Authentication errors now trigger vendor-level filtering (excluding all models from vendors with invalid API keys) and immediate failover to different vendors. Rate limit errors now retry the same model/vendor using configurable `MaxRetries` (default: 3) with backoff delay based on `RetryStrategy` (Fixed/Linear/Exponential) before failing over. Improved log messages with human-readable formatting showing model/vendor names, time in seconds, and clear status indicators. Fixed MJCLI sync commands to properly propagate exit codes for CI/CD integration.

- Updated dependencies [dc50349]
- Updated dependencies [9b67e0c]
- Updated dependencies [f215288]
  - @memberjunction/codegen-lib@2.105.0
  - @memberjunction/sqlserver-dataprovider@2.105.0
  - @memberjunction/ai-cli@2.105.0
  - @memberjunction/metadata-sync@2.105.0

## 2.104.0

### Patch Changes

- 3f71ef4: Add new storage actions and external API integrations

  - Add 13 individual file storage actions
  - Add Gamma API integration for AI-powered presentation generation
  - Add Perplexity Search action for AI-powered web search with
    citations
  - Add centralized configuration system for MJStorage drivers and
    Core Actions
  - Complete Box SDK v10 migration for BoxFileStorage driver
  - Fix Box storage driver API endpoint errors (405 Method Not
    Allowed)
  - Fix CLI action parameter passing bug

- Updated dependencies [883933e]
- Updated dependencies [6e7f14a]
  - @memberjunction/codegen-lib@2.104.0
  - @memberjunction/sqlserver-dataprovider@2.104.0
  - @memberjunction/ai-cli@2.104.0
  - @memberjunction/metadata-sync@2.104.0

## 2.103.0

### Patch Changes

- addf572: Bump all packages to 2.101.0
- fcdc151: Modified bump command to skip core and global when bumping versions. Core and Global will be pinned at v2.100.3.
- Updated dependencies [addf572]
  - @memberjunction/sqlserver-dataprovider@2.103.0
  - @memberjunction/metadata-sync@2.103.0
  - @memberjunction/codegen-lib@2.103.0
  - @memberjunction/ai-cli@2.103.0

## 2.100.3

### Patch Changes

- Updated dependencies [30afb26]
  - @memberjunction/metadata-sync@2.100.3
  - @memberjunction/ai-cli@2.100.3
  - @memberjunction/codegen-lib@2.100.3
  - @memberjunction/sqlserver-dataprovider@2.100.3

## 2.100.2

### Patch Changes

- @memberjunction/ai-cli@2.100.2
- @memberjunction/codegen-lib@2.100.2
- @memberjunction/metadata-sync@2.100.2
- @memberjunction/sqlserver-dataprovider@2.100.2

## 2.100.1

### Patch Changes

- @memberjunction/ai-cli@2.100.1
- @memberjunction/codegen-lib@2.100.1
- @memberjunction/metadata-sync@2.100.1
- @memberjunction/sqlserver-dataprovider@2.100.1

## 2.100.0

### Patch Changes

- @memberjunction/ai-cli@2.100.0
- @memberjunction/codegen-lib@2.100.0
- @memberjunction/metadata-sync@2.100.0
- @memberjunction/sqlserver-dataprovider@2.100.0

## 2.99.0

### Patch Changes

- @memberjunction/ai-cli@2.99.0
- @memberjunction/codegen-lib@2.99.0
- @memberjunction/metadata-sync@2.99.0
- @memberjunction/sqlserver-dataprovider@2.99.0

## 2.98.0

### Patch Changes

- @memberjunction/ai-cli@2.98.0
- @memberjunction/codegen-lib@2.98.0
- @memberjunction/metadata-sync@2.98.0
- @memberjunction/sqlserver-dataprovider@2.98.0

## 2.97.0

### Patch Changes

- @memberjunction/ai-cli@2.97.0
- @memberjunction/codegen-lib@2.97.0
- @memberjunction/metadata-sync@2.97.0
- @memberjunction/sqlserver-dataprovider@2.97.0

## 2.96.0

### Patch Changes

- d7b5647: feat(metadata-sync): add deleteRecord feature for removing records via sync

  - Added deleteRecord directive to mark records for deletion in JSON files
  - Records with deleteRecord.delete=true are deleted during push operations
  - After successful deletion, adds deletedAt timestamp to track when deleted

- Updated dependencies [d7b5647]
- Updated dependencies [8e1c946]
  - @memberjunction/metadata-sync@2.96.0
  - @memberjunction/ai-cli@2.96.0
  - @memberjunction/codegen-lib@2.96.0
  - @memberjunction/sqlserver-dataprovider@2.96.0

## 2.95.0

### Patch Changes

- @memberjunction/ai-cli@2.95.0
- @memberjunction/codegen-lib@2.95.0
- @memberjunction/metadata-sync@2.95.0
- @memberjunction/sqlserver-dataprovider@2.95.0

## 2.94.0

### Patch Changes

- @memberjunction/ai-cli@2.94.0
- @memberjunction/codegen-lib@2.94.0
- @memberjunction/metadata-sync@2.94.0
- @memberjunction/sqlserver-dataprovider@2.94.0

## 2.93.0

### Patch Changes

- Updated dependencies [f8757aa]
- Updated dependencies [103e4a9]
  - @memberjunction/sqlserver-dataprovider@2.93.0
  - @memberjunction/metadata-sync@2.93.0
  - @memberjunction/codegen-lib@2.93.0
  - @memberjunction/ai-cli@2.93.0

## 2.92.0

### Patch Changes

- Updated dependencies [8fb03df]
  - @memberjunction/sqlserver-dataprovider@2.92.0
  - @memberjunction/ai-cli@2.92.0
  - @memberjunction/codegen-lib@2.92.0
  - @memberjunction/metadata-sync@2.92.0

## 2.91.0

### Patch Changes

- Updated dependencies [70bf265]
  - @memberjunction/codegen-lib@2.91.0
  - @memberjunction/ai-cli@2.91.0
  - @memberjunction/metadata-sync@2.91.0
  - @memberjunction/sqlserver-dataprovider@2.91.0

## 2.90.0

### Patch Changes

- @memberjunction/codegen-lib@2.90.0
- @memberjunction/sqlserver-dataprovider@2.90.0
- @memberjunction/ai-cli@2.90.0
- @memberjunction/metadata-sync@2.90.0

## 2.89.0

### Patch Changes

- Updated dependencies [34d456e]
  - @memberjunction/sqlserver-dataprovider@2.89.0
  - @memberjunction/ai-cli@2.89.0
  - @memberjunction/codegen-lib@2.89.0
  - @memberjunction/metadata-sync@2.89.0

## 2.88.0

### Patch Changes

- Updated dependencies [56257ed]
  - @memberjunction/sqlserver-dataprovider@2.88.0
  - @memberjunction/ai-cli@2.88.0
  - @memberjunction/codegen-lib@2.88.0
  - @memberjunction/metadata-sync@2.88.0

## 2.87.0

### Patch Changes

- @memberjunction/ai-cli@2.87.0
- @memberjunction/codegen-lib@2.87.0
- @memberjunction/metadata-sync@2.87.0
- @memberjunction/sqlserver-dataprovider@2.87.0

## 2.86.0

### Patch Changes

- Updated dependencies [7675555]
  - @memberjunction/metadata-sync@2.86.0
  - @memberjunction/ai-cli@2.86.0
  - @memberjunction/codegen-lib@2.86.0
  - @memberjunction/sqlserver-dataprovider@2.86.0

## 2.85.0

### Patch Changes

- Updated dependencies [9b74582]
  - @memberjunction/metadata-sync@2.85.0
  - @memberjunction/ai-cli@2.85.0
  - @memberjunction/codegen-lib@2.85.0
  - @memberjunction/sqlserver-dataprovider@2.85.0

## 2.84.0

### Patch Changes

- Updated dependencies [0b9d691]
  - @memberjunction/sqlserver-dataprovider@2.84.0
  - @memberjunction/ai-cli@2.84.0
  - @memberjunction/codegen-lib@2.84.0
  - @memberjunction/metadata-sync@2.84.0

## 2.83.0

### Patch Changes

- @memberjunction/ai-cli@2.83.0
- @memberjunction/codegen-lib@2.83.0
- @memberjunction/metadata-sync@2.83.0
- @memberjunction/sqlserver-dataprovider@2.83.0

## 2.82.0

### Patch Changes

- Updated dependencies [2ebf9c7]
  - @memberjunction/codegen-lib@2.82.0
  - @memberjunction/metadata-sync@2.82.0
  - @memberjunction/ai-cli@2.82.0
  - @memberjunction/sqlserver-dataprovider@2.82.0

## 2.81.0

### Patch Changes

- Updated dependencies [6d2d478]
- Updated dependencies [76cf3e3]
- Updated dependencies [971c5d4]
  - @memberjunction/codegen-lib@2.81.0
  - @memberjunction/sqlserver-dataprovider@2.81.0
  - @memberjunction/ai-cli@2.81.0
  - @memberjunction/metadata-sync@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/ai-cli@2.80.1
- @memberjunction/codegen-lib@2.80.1
- @memberjunction/metadata-sync@2.80.1
- @memberjunction/sqlserver-dataprovider@2.80.1

## 2.80.0

### Patch Changes

- Updated dependencies [7c5f844]
  - @memberjunction/sqlserver-dataprovider@2.80.0
  - @memberjunction/ai-cli@2.80.0
  - @memberjunction/codegen-lib@2.80.0
  - @memberjunction/metadata-sync@2.80.0

## 2.79.0

### Patch Changes

- @memberjunction/ai-cli@2.79.0
- @memberjunction/codegen-lib@2.79.0
- @memberjunction/metadata-sync@2.79.0
- @memberjunction/sqlserver-dataprovider@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [ef7c014]
- Updated dependencies [d9abd67]
- Updated dependencies [4652675]
  - @memberjunction/ai-cli@2.78.0
  - @memberjunction/codegen-lib@2.78.0
  - @memberjunction/sqlserver-dataprovider@2.78.0
  - @memberjunction/metadata-sync@2.78.0

## 2.77.0

### Patch Changes

- Updated dependencies [476a458]
- Updated dependencies [d8f14a2]
- Updated dependencies [8ee0d86]
- Updated dependencies [c91269e]
  - @memberjunction/sqlserver-dataprovider@2.77.0
  - @memberjunction/codegen-lib@2.77.0
  - @memberjunction/metadata-sync@2.77.0

## 2.76.0

### Patch Changes

- Updated dependencies [7dabb22]
  - @memberjunction/sqlserver-dataprovider@2.76.0
  - @memberjunction/metadata-sync@2.76.0
  - @memberjunction/codegen-lib@2.76.0

## 2.75.0

### Patch Changes

- Updated dependencies [9ccd145]
- Updated dependencies [4ee29f2]
  - @memberjunction/codegen-lib@2.75.0
  - @memberjunction/metadata-sync@2.75.0
  - @memberjunction/sqlserver-dataprovider@2.75.0

## 2.74.0

### Patch Changes

- Updated dependencies [b70301e]
  - @memberjunction/codegen-lib@2.74.0
  - @memberjunction/metadata-sync@2.74.0
  - @memberjunction/sqlserver-dataprovider@2.74.0

## 2.73.0

### Patch Changes

- @memberjunction/codegen-lib@2.73.0
- @memberjunction/sqlserver-dataprovider@2.73.0
- @memberjunction/metadata-sync@2.73.0

## 2.72.0

### Patch Changes

- @memberjunction/codegen-lib@2.72.0
- @memberjunction/metadata-sync@2.72.0
- @memberjunction/sqlserver-dataprovider@2.72.0

## 2.71.0

### Patch Changes

- e75f0a4: Major AI Agent and AI Prompt Management Enhancements

  - **AI Agent Forms**: Complete redesign with comprehensive sub-agent creation, advanced settings management, and transaction-based persistence
  - **AI Prompt Forms**: Implemented atomic "Create New Prompt" feature with template linking and proper MemberJunction navigation
  - **User Permissions**: Added comprehensive user permission reflection across AI forms and dashboards
  - **UX Improvements**: Enhanced prompt selector with visual indicators for already linked prompts, proper cancel/revert functionality
  - **Template Management**: Resolved template management issues with improved template editor and selector dialogs
  - **Sub-Agent System**: Full implementation of sub-agent selector with deferred transactions and database constraint compliance
  - **Advanced Settings**: New dialogs for AI Agent prompts, sub-agents, and actions with modern UI components
  - **CLI**: Fixed AUTH0 environment variable casing in install command

  This release significantly improves the AI management experience with better transaction handling, user permissions, and modern UI components.

- 5a127bb: Remove status badge dots
- Updated dependencies [5a127bb]
  - @memberjunction/codegen-lib@2.71.0
  - @memberjunction/metadata-sync@2.71.0
  - @memberjunction/sqlserver-dataprovider@2.71.0

## 2.70.0

### Patch Changes

- @memberjunction/codegen-lib@2.70.0
- @memberjunction/metadata-sync@2.70.0
- @memberjunction/sqlserver-dataprovider@2.70.0

## 2.69.1

### Patch Changes

- @memberjunction/codegen-lib@2.69.1
- @memberjunction/metadata-sync@2.69.1
- @memberjunction/sqlserver-dataprovider@2.69.1

## 2.69.0

### Patch Changes

- @memberjunction/codegen-lib@2.69.0
- @memberjunction/metadata-sync@2.69.0
- @memberjunction/sqlserver-dataprovider@2.69.0

## 2.68.0

### Patch Changes

- 035690c: MetadataSync pull operations major improvements

  - **JSON Property Ordering**: Fixed inconsistent JSON property ordering
    across metadata files by implementing JsonWriteHelper with
    deterministic serialization
  - **File Write Batching**: Replaced individual file writes with
    batching system for 90% performance improvement and eliminated write
    conflicts
  - **RelatedEntities Support**: Added complete support for pulling
    related entities as embedded collections with foreign key references
    (@parent:ID syntax)
  - **Field Configuration Options**:
    - Added `ignoreNullFields` option to exclude null values during pull
      operations
    - Added `ignoreVirtualFields` option to exclude virtual fields from
      pulled data
  - **ExternalizeFields Implementation**: Complete field externalization
    functionality with:

    - Configurable file patterns with placeholders ({Name}, {ID}, etc.)
    - Smart merge strategy support preserving existing @file: references
    - Enhanced checksum calculation including external file content
    - Automatic JSON formatting and filename sanitization

  - **Change Detection**: Fixed checksum calculation for related entities
    to prevent unnecessary timestamp updates
  - **Bug Fixes**: Resolved critical issue where new record operations
    overwrote existing record updates in batch system

  These improvements provide robust, performant, and feature-complete
  metadata synchronization with proper change tracking and file
  organization.

- Updated dependencies [035690c]
- Updated dependencies [a6b43d0]
- Updated dependencies [23250f1]
- Updated dependencies [732c04a]
  - @memberjunction/metadata-sync@2.68.0
  - @memberjunction/sqlserver-dataprovider@2.68.0
  - @memberjunction/codegen-lib@2.68.0

## 2.67.0

### Patch Changes

- Updated dependencies [1fbfc26]
  - @memberjunction/sqlserver-dataprovider@2.67.0
  - @memberjunction/codegen-lib@2.67.0
  - @memberjunction/metadata-sync@2.67.0

## 2.66.0

### Patch Changes

- Updated dependencies [7e22e3e]
  - @memberjunction/codegen-lib@2.66.0
  - @memberjunction/sqlserver-dataprovider@2.66.0
  - @memberjunction/metadata-sync@2.66.0

## 2.65.0

### Patch Changes

- Updated dependencies [619488f]
- Updated dependencies [b029c5d]
  - @memberjunction/metadata-sync@2.65.0
  - @memberjunction/sqlserver-dataprovider@2.65.0
  - @memberjunction/codegen-lib@2.65.0

## 2.64.0

### Patch Changes

- @memberjunction/codegen-lib@2.64.0
- @memberjunction/metadata-sync@2.64.0
- @memberjunction/sqlserver-dataprovider@2.64.0

## 2.63.1

### Patch Changes

- @memberjunction/codegen-lib@2.63.1
- @memberjunction/metadata-sync@2.63.1
- @memberjunction/sqlserver-dataprovider@2.63.1

## 2.63.0

### Patch Changes

- Updated dependencies [00e19b4]
  - @memberjunction/metadata-sync@2.63.0
  - @memberjunction/codegen-lib@2.63.0
  - @memberjunction/sqlserver-dataprovider@2.63.0

## 2.62.0

### Patch Changes

- @memberjunction/codegen-lib@2.62.0
- @memberjunction/sqlserver-dataprovider@2.62.0
- @memberjunction/metadata-sync@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/codegen-lib@2.61.0
- @memberjunction/sqlserver-dataprovider@2.61.0
- @memberjunction/metadata-sync@2.61.0

## 2.60.0

### Patch Changes

- Updated dependencies [6eabd10]
  - @memberjunction/codegen-lib@2.60.0
  - @memberjunction/metadata-sync@2.60.0
  - @memberjunction/sqlserver-dataprovider@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/codegen-lib@2.59.0
- @memberjunction/metadata-sync@2.59.0
- @memberjunction/sqlserver-dataprovider@2.59.0

## 2.58.0

### Patch Changes

- Updated dependencies [def26fe]
- Updated dependencies [a5f0905]
- Updated dependencies [264bdc9]
  - @memberjunction/metadata-sync@2.58.0
  - @memberjunction/sqlserver-dataprovider@2.58.0
  - @memberjunction/codegen-lib@2.58.0

## 2.57.0

### Minor Changes

- 0ba485f: various bug fixes

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/metadata-sync@2.57.0
  - @memberjunction/sqlserver-dataprovider@2.57.0
  - @memberjunction/codegen-lib@2.57.0

## 2.56.0

### Patch Changes

- 17c7634: Integrate MetadataSync commands into MJCLI

  - Refactored MetadataSync from standalone CLI to reusable library
  - Moved all sync commands under `mj sync` namespace in MJCLI
  - Added service-based architecture for better modularity
  - Removed oclif dependencies from MetadataSync package

- Updated dependencies [17c7634]
  - @memberjunction/metadata-sync@2.56.0
  - @memberjunction/codegen-lib@2.56.0
  - @memberjunction/sqlserver-dataprovider@2.56.0

## 2.55.0

### Patch Changes

- Updated dependencies [9232ce9]
  - @memberjunction/codegen-lib@2.55.0

## 2.54.0

### Patch Changes

- @memberjunction/codegen-lib@2.54.0

## 2.53.0

### Patch Changes

- @memberjunction/codegen-lib@2.53.0

## 2.52.0

### Patch Changes

- @memberjunction/codegen-lib@2.52.0

## 2.51.0

### Patch Changes

- @memberjunction/codegen-lib@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/codegen-lib@2.50.0

## 2.49.0

### Minor Changes

- 62cf1b6: Removed TypeORM which resulted in changes to nearly every package

### Patch Changes

- Updated dependencies [72cbb2c]
- Updated dependencies [62cf1b6]
  - @memberjunction/codegen-lib@2.49.0

## 2.48.0

### Patch Changes

- @memberjunction/codegen-lib@2.48.0

## 2.47.0

### Patch Changes

- Updated dependencies [31afe2a]
- Updated dependencies [6e60efe]
  - @memberjunction/codegen-lib@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/codegen-lib@2.46.0

## 2.45.0

### Patch Changes

- @memberjunction/codegen-lib@2.45.0

## 2.44.0

### Patch Changes

- @memberjunction/codegen-lib@2.44.0

## 2.43.0

### Patch Changes

- Updated dependencies [1629c04]
  - @memberjunction/codegen-lib@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/codegen-lib@2.42.1

## 2.42.0

### Patch Changes

- @memberjunction/codegen-lib@2.42.0

## 2.41.0

### Patch Changes

- @memberjunction/codegen-lib@2.41.0

## 2.40.0

### Patch Changes

- @memberjunction/codegen-lib@2.40.0

## 2.39.0

### Patch Changes

- @memberjunction/codegen-lib@2.39.0

## 2.38.0

### Patch Changes

- @memberjunction/codegen-lib@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/codegen-lib@2.37.1

## 2.37.0

### Patch Changes

- @memberjunction/codegen-lib@2.37.0

## 2.36.1

### Patch Changes

- @memberjunction/codegen-lib@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
  - @memberjunction/codegen-lib@2.36.0

## 2.35.1

### Patch Changes

- @memberjunction/codegen-lib@2.35.1

## 2.35.0

### Patch Changes

- @memberjunction/codegen-lib@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/codegen-lib@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/codegen-lib@2.34.1

## 2.34.0

### Patch Changes

- @memberjunction/codegen-lib@2.34.0

## 2.33.0

### Patch Changes

- @memberjunction/codegen-lib@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/codegen-lib@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/codegen-lib@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/codegen-lib@2.32.0

## 2.31.0

### Patch Changes

- Updated dependencies [946b64e]
- Updated dependencies [45a552e]
  - @memberjunction/codegen-lib@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [90dd865]
- Updated dependencies [a3ab749]
  - @memberjunction/codegen-lib@2.30.0

## 2.29.2

### Patch Changes

- 7a9ee63: Adjust exports to avoid loading config during build
- Updated dependencies [07bde92]
- Updated dependencies [598b9b5]
  - @memberjunction/codegen-lib@2.29.2

## 2.28.0

### Patch Changes

- @memberjunction/codegen-lib@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/codegen-lib@2.27.1

## 2.27.0

### Patch Changes

- @memberjunction/codegen-lib@2.27.0

## 2.26.1

### Patch Changes

- Updated dependencies [896ada0]
- Updated dependencies [a8ff81f]
  - @memberjunction/codegen-lib@2.26.1

## 2.26.0

### Patch Changes

- Updated dependencies [23801c5]
  - @memberjunction/codegen-lib@2.26.0

## 2.25.0

### Patch Changes

- Updated dependencies [fd07dcd]
  - @memberjunction/codegen-lib@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/codegen-lib@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [b5d480c]
- Updated dependencies [871fa69]
- Updated dependencies [93d3ee2]
  - @memberjunction/codegen-lib@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/codegen-lib@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/codegen-lib@2.23.1

## 2.23.0

### Minor Changes

- cae74af: Added some better handling of the tag argument for `mj migrate` so semver strings like `2.22.2` work as well as properly formatted tags like `v2.22.2`.

  #### Unrelated tweak that triggers a minor version

  Also added a flyway variable to the repeatable metadata maintenance migration to ensure it runs every time (not just every time its checksum changes).

### Patch Changes

- Updated dependencies [38b7507]
  - @memberjunction/codegen-lib@2.23.0

## 2.22.2

### Patch Changes

- @memberjunction/codegen-lib@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/codegen-lib@2.22.1

## 2.22.0

### Patch Changes

- Updated dependencies [9660275]
  - @memberjunction/codegen-lib@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

### Patches

- Bump @memberjunction/codegen-lib to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Applying package updates [skip ci] (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:04 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.20.0

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:48 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Bump @memberjunction/codegen-lib to v2.18.0

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Bump @memberjunction/codegen-lib to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:28 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Bump @memberjunction/codegen-lib to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:29 GMT

### Patches

- Applying package updates [skip ci] (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Bump @memberjunction/codegen-lib to v2.14.0

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/codegen-lib to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:44 GMT

### Patches

- Applying package updates [skip ci] (craig@memberjunction.com)
- Applying package updates [skip ci] (craig@memberjunction.com)
- Applying package updates [skip ci] (craig@memberjunction.com)
- Bump @memberjunction/codegen-lib to v2.13.3

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)

## 2.6.0

Sat, 28 Sep 2024 00:19:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

## 2.5.2

Sat, 28 Sep 2024 00:06:03 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

## 2.5.0

Fri, 20 Sep 2024 16:17:07 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.7.0

Wed, 12 Jun 2024 18:53:38 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.5.3

Tue, 11 Jun 2024 04:01:38 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)

## 1.4.0

Sat, 25 May 2024 15:30:17 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Add more validation in install script (craig.adam@bluecypress.io)

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Check node version in install (closes #161) (craig.adam@bluecypress.io)

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Add CLI package (craig.adam@bluecypress.io)
