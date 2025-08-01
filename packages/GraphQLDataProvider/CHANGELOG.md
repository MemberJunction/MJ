# Change Log - @memberjunction/graphql-dataprovider

## 2.79.0

### Patch Changes

- Updated dependencies [4bf2634]
- Updated dependencies [907e73f]
  - @memberjunction/core-entities@2.79.0
  - @memberjunction/global@2.79.0
  - @memberjunction/actions-base@2.79.0
  - @memberjunction/core@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [06088e5]
  - @memberjunction/core-entities@2.78.0
  - @memberjunction/actions-base@2.78.0
  - @memberjunction/core@2.78.0
  - @memberjunction/global@2.78.0

## 2.77.0

### Minor Changes

- c91269e: migration file for permissions driving minor bump

### Patch Changes

- 8ee0d86: Fix: Query parameter validation and cascade delete transaction handling

  - Added validation to ensure query parameters are JSON objects rather than arrays in GraphQL system user client
  - Implemented automatic transaction wrapping for entities with CascadeDeletes enabled
  - For database providers (server-side), delete operations are wrapped in
    BeginTransaction/CommitTransaction/RollbackTransaction
  - For network providers (client-side), deletes pass through as cascade handling occurs server-side
  - Ensures atomicity of cascade delete operations

- Updated dependencies [d8f14a2]
- Updated dependencies [8ee0d86]
- Updated dependencies [c91269e]
  - @memberjunction/core@2.77.0
  - @memberjunction/core-entities@2.77.0
  - @memberjunction/actions-base@2.77.0
  - @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- f1e5990: bug fix
- 087595d: feat: make DeleteQuery options parameter optional and refactor
  GraphQLSystemUserClient methods

  - Made options parameter optional in DeleteQuerySystemResolver with
    sensible defaults (SkipEntityAIActions: false, SkipEntityActions: false)
  - Refactored GraphQLSystemUserClient method names for better usability by
    removing redundant "SystemUser" suffix
  - Updated method signatures to use proper input types instead of
    individual parameters for better type safety
  - Added DeleteQuery method and missing TypeScript interfaces to
    GraphQLSystemUserClient

  The changes are marked as minor since they add new functionality
  (optional parameters, new method) while maintaining backward
  compatibility with existing method signatures.

- Updated dependencies [4b27b3c]
- Updated dependencies [7dabb22]
- Updated dependencies [ffda243]
  - @memberjunction/core-entities@2.76.0
  - @memberjunction/core@2.76.0
  - @memberjunction/actions-base@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Minor Changes

- 66640d6: This update brings the GraphQLSystemUserClient to feature parity with the
  standard GraphQLDataProvider by adding full Parameters support for
  templated queries, pagination capabilities, and the missing
  GetQueryDataByNameSystemUser resolver.

  Key Features:

  - Parameters support for templated queries (enabling AI cost calculations)
  - MaxRows and StartRow pagination support
  - Complete resolver coverage for system user operations
  - Fixed TypeScript compilation errors with missing TotalRowCount fields
  - Updated both GetQueryDataSystemUser and GetQueryDataByNameSystemUser
    methods with full parameter support

    - Added missing GetQueryDataByNameSystemUser resolver with proper
      @RequireSystemUser decoration
    - Fixed error handling cases to include required TotalRowCount field
    - Updated GraphQL query strings to include TotalRowCount and
      AppliedParameters fields

    This enables system user clients to leverage MemberJunction v2.74's
    templated query functionality, particularly important for AI cost tracking
    and other parameterized operations.

- 6a65fad: feat: Add AI Agent Run cost calculation with high-performance templated
  queries

  - Add AIAgentRunCostService with intelligent caching and single-query
    performance optimization
  - Implement CalculateAIAgentRunCost templated query using recursive CTE for
    hierarchical cost calculation
  - Fix GraphQL scalar type error (JSON → JSONObject) in RunQuery operations
  - Update AI Agent Run components to display consistent cost metrics in both
    top banner and analytics tab
  - Fix analytics component data loading to use proper entity relationships
    via AI Agent Run Steps
  - Add comprehensive metadata structure for AI queries with
    cross-environment schema compatibility
  - Remove debugging console statements for clean production output

  This enhancement provides accurate, performant cost tracking for AI Agent
  Runs including all nested sub-agent hierarchies up to 20 levels deep,
  replacing inefficient multiple database calls with a single optimized
  query.

### Patch Changes

- @memberjunction/actions-base@2.75.0
- @memberjunction/core@2.75.0
- @memberjunction/core-entities@2.75.0
- @memberjunction/global@2.75.0

## 2.74.0

### Patch Changes

- Updated dependencies [b70301e]
- Updated dependencies [d316670]
  - @memberjunction/core-entities@2.74.0
  - @memberjunction/core@2.74.0
  - @memberjunction/actions-base@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- Updated dependencies [e99336f]
  - @memberjunction/core-entities@2.73.0
  - @memberjunction/actions-base@2.73.0
  - @memberjunction/core@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- Updated dependencies [636b6ee]
  - @memberjunction/core-entities@2.72.0
  - @memberjunction/actions-base@2.72.0
  - @memberjunction/core@2.72.0
  - @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [c5a409c]
- Updated dependencies [5a127bb]
  - @memberjunction/global@2.71.0
  - @memberjunction/actions-base@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/core-entities@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/actions-base@2.70.0
  - @memberjunction/core@2.70.0
  - @memberjunction/core-entities@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/actions-base@2.69.1
  - @memberjunction/core-entities@2.69.1
  - @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/core@2.69.0
  - @memberjunction/global@2.69.0
  - @memberjunction/actions-base@2.69.0
  - @memberjunction/core-entities@2.69.0

## 2.68.0

### Patch Changes

- Updated dependencies [b10b7e6]
  - @memberjunction/core@2.68.0
  - @memberjunction/actions-base@2.68.0
  - @memberjunction/core-entities@2.68.0
  - @memberjunction/global@2.68.0

## 2.67.0

### Patch Changes

- @memberjunction/actions-base@2.67.0
- @memberjunction/core@2.67.0
- @memberjunction/core-entities@2.67.0
- @memberjunction/global@2.67.0

## 2.66.0

### Patch Changes

- Updated dependencies [7e22e3e]
  - @memberjunction/actions-base@2.66.0
  - @memberjunction/core@2.66.0
  - @memberjunction/core-entities@2.66.0
  - @memberjunction/global@2.66.0

## 2.65.0

### Patch Changes

- Updated dependencies [619488f]
- Updated dependencies [b029c5d]
  - @memberjunction/global@2.65.0
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/actions-base@2.65.0
  - @memberjunction/core@2.65.0

## 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/actions-base@2.64.0
  - @memberjunction/core@2.64.0
  - @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/actions-base@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1

## 2.63.0

### Patch Changes

- Updated dependencies [28e8a85]
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/actions-base@2.63.0
  - @memberjunction/core@2.63.0
  - @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [c995603]
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/actions-base@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/actions-base@2.61.0
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
  - @memberjunction/actions-base@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/actions-base@2.59.0
- @memberjunction/core@2.59.0
- @memberjunction/core-entities@2.59.0
- @memberjunction/global@2.59.0

## 2.58.0

### Patch Changes

- Updated dependencies [def26fe]
  - @memberjunction/core@2.58.0
  - @memberjunction/actions-base@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/global@2.57.0
  - @memberjunction/actions-base@2.57.0

## 2.56.0

### Patch Changes

- Updated dependencies [bf24cae]
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/actions-base@2.56.0
  - @memberjunction/core@2.56.0
  - @memberjunction/global@2.56.0

## 2.55.0

### Patch Changes

- Updated dependencies [659f892]
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/actions-base@2.55.0
  - @memberjunction/core@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- Updated dependencies [20f424d]
  - @memberjunction/core@2.54.0
  - @memberjunction/actions-base@2.54.0
  - @memberjunction/core-entities@2.54.0
  - @memberjunction/global@2.54.0

## 2.53.0

### Patch Changes

- 720aa19: Add system user GraphQL resolvers for RunView and Query operations
- Updated dependencies [bddc4ea]
  - @memberjunction/core@2.53.0
  - @memberjunction/core-entities@2.53.0
  - @memberjunction/actions-base@2.53.0
  - @memberjunction/global@2.53.0

## 2.52.0

### Patch Changes

- Updated dependencies [e926106]
- Updated dependencies [760e844]
  - @memberjunction/core@2.52.0
  - @memberjunction/core-entities@2.52.0
  - @memberjunction/actions-base@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Patch Changes

- Updated dependencies [7a9b88e]
- Updated dependencies [53f8167]
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/actions-base@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/actions-base@2.50.0
- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0
- @memberjunction/global@2.50.0

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
  - @memberjunction/actions-base@2.49.0

## 2.48.0

### Patch Changes

- Updated dependencies [bb01fcf]
- Updated dependencies [031e724]
  - @memberjunction/core@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/actions-base@2.48.0
  - @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- @memberjunction/actions-base@2.47.0
- @memberjunction/core@2.47.0
- @memberjunction/core-entities@2.47.0
- @memberjunction/global@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/actions-base@2.46.0
- @memberjunction/core@2.46.0
- @memberjunction/core-entities@2.46.0
- @memberjunction/global@2.46.0

## 2.45.0

### Patch Changes

- Updated dependencies [556ee8d]
  - @memberjunction/core-entities@2.45.0
  - @memberjunction/actions-base@2.45.0
  - @memberjunction/core@2.45.0
  - @memberjunction/global@2.45.0

## 2.44.0

### Patch Changes

- Updated dependencies [fbc30dc]
- Updated dependencies [99b27c5]
- Updated dependencies [091c5f6]
  - @memberjunction/core@2.44.0
  - @memberjunction/core-entities@2.44.0
  - @memberjunction/actions-base@2.44.0
  - @memberjunction/global@2.44.0

## 2.43.0

### Patch Changes

- Updated dependencies [1629c04]
  - @memberjunction/core@2.43.0
  - @memberjunction/actions-base@2.43.0
  - @memberjunction/core-entities@2.43.0
  - @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- @memberjunction/actions-base@2.42.1
- @memberjunction/core@2.42.1
- @memberjunction/core-entities@2.42.1
- @memberjunction/global@2.42.1

## 2.42.0

### Patch Changes

- @memberjunction/actions-base@2.42.0
- @memberjunction/core@2.42.0
- @memberjunction/core-entities@2.42.0
- @memberjunction/global@2.42.0

## 2.41.0

### Minor Changes

- 7e0523d: Persist Skip conversation status and add completion time display

  - Added 'Status' column to Conversation table with 'Processing' and 'Available' states
  - Added 'CompletionTime' column to ConversationDetail table to track processing duration
  - Updated AskSkipResolver to manage conversation status and track processing time
  - Enabled GraphQLDataProvider to cache and retrieve session IDs from IndexedDB
  - Enhanced skip-chat component to poll for 'Processing' conversations after page refresh
  - Added CompletionTime display in the UI for completed AI messages
  - Fixed session persistence for conversation status across page reloads

### Patch Changes

- Updated dependencies [3be3f71]
- Updated dependencies [7e0523d]
  - @memberjunction/core@2.41.0
  - @memberjunction/core-entities@2.41.0
  - @memberjunction/actions-base@2.41.0
  - @memberjunction/global@2.41.0

## 2.40.0

### Patch Changes

- @memberjunction/actions-base@2.40.0
- @memberjunction/core@2.40.0
- @memberjunction/core-entities@2.40.0
- @memberjunction/global@2.40.0

## 2.39.0

### Patch Changes

- Updated dependencies [c9ccc36]
  - @memberjunction/core-entities@2.39.0
  - @memberjunction/actions-base@2.39.0
  - @memberjunction/core@2.39.0
  - @memberjunction/global@2.39.0

## 2.38.0

### Patch Changes

- Updated dependencies [c835ded]
  - @memberjunction/core-entities@2.38.0
  - @memberjunction/actions-base@2.38.0
  - @memberjunction/core@2.38.0
  - @memberjunction/global@2.38.0

## 2.37.1

### Patch Changes

- @memberjunction/actions-base@2.37.1
- @memberjunction/core@2.37.1
- @memberjunction/core-entities@2.37.1
- @memberjunction/global@2.37.1

## 2.37.0

### Patch Changes

- Updated dependencies [1418b71]
  - @memberjunction/core-entities@2.37.0
  - @memberjunction/actions-base@2.37.0
  - @memberjunction/core@2.37.0
  - @memberjunction/global@2.37.0

## 2.36.1

### Patch Changes

- Updated dependencies [9d709e2]
  - @memberjunction/core@2.36.1
  - @memberjunction/actions-base@2.36.1
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
  - @memberjunction/core-entities@2.36.0
  - @memberjunction/actions-base@2.36.0
  - @memberjunction/global@2.36.0
  - @memberjunction/core@2.36.0

## 2.35.1

### Patch Changes

- Updated dependencies [3e7ec64]
  - @memberjunction/core@2.35.1
  - @memberjunction/actions-base@2.35.1
  - @memberjunction/core-entities@2.35.1
  - @memberjunction/global@2.35.1

## 2.35.0

### Patch Changes

- @memberjunction/actions-base@2.35.0
- @memberjunction/core@2.35.0
- @memberjunction/core-entities@2.35.0
- @memberjunction/global@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/actions-base@2.34.2
- @memberjunction/core@2.34.2
- @memberjunction/core-entities@2.34.2
- @memberjunction/global@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/actions-base@2.34.1
- @memberjunction/core@2.34.1
- @memberjunction/core-entities@2.34.1
- @memberjunction/global@2.34.1

## 2.34.0

### Patch Changes

- Updated dependencies [e60f326]
- Updated dependencies [785f06a]
  - @memberjunction/core-entities@2.34.0
  - @memberjunction/core@2.34.0
  - @memberjunction/actions-base@2.34.0
  - @memberjunction/global@2.34.0

## 2.33.0

### Patch Changes

- 9537497: Implement infra to handle action and entity action invocation from anywhere via GQL and added to User View Grid.
  - @memberjunction/actions-base@2.33.0
  - @memberjunction/core@2.33.0
  - @memberjunction/core-entities@2.33.0
  - @memberjunction/global@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/core@2.32.2
- @memberjunction/core-entities@2.32.2
- @memberjunction/global@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/core@2.32.1
- @memberjunction/core-entities@2.32.1
- @memberjunction/global@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/core@2.32.0
- @memberjunction/core-entities@2.32.0
- @memberjunction/global@2.32.0

## 2.31.0

### Patch Changes

- f3bf773: SkipTypes - further cleanup to normalize for HTML Report that won't use a sub process
  - @memberjunction/core@2.31.0
  - @memberjunction/core-entities@2.31.0
  - @memberjunction/global@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [a3ab749]
  - @memberjunction/core-entities@2.30.0
  - @memberjunction/global@2.30.0
  - @memberjunction/core@2.30.0

## 2.29.2

### Patch Changes

- 64aa7f0: New query for 2.29.0 to get version history since we aren't using an entity for flyway data anymore. Improvements to query execution to support query execution by name as well as by ID, and general cleanup (code wasn't working before as query ID wasn't enclosed in quotes from days of INT ID types)
- Updated dependencies [07bde92]
- Updated dependencies [64aa7f0]
- Updated dependencies [69c3505]
  - @memberjunction/core@2.29.2
  - @memberjunction/core-entities@2.29.2
  - @memberjunction/global@2.29.2

## 2.28.0

### Patch Changes

- Updated dependencies [8259093]
  - @memberjunction/core@2.28.0
  - @memberjunction/core-entities@2.28.0
  - @memberjunction/global@2.28.0

## 2.27.1

### Patch Changes

- @memberjunction/core@2.27.1
- @memberjunction/core-entities@2.27.1
- @memberjunction/global@2.27.1

## 2.27.0

### Patch Changes

- Updated dependencies [54ab868]
- Updated dependencies [5a81451]
  - @memberjunction/core@2.27.0
  - @memberjunction/core-entities@2.27.0
  - @memberjunction/global@2.27.0

## 2.26.1

### Patch Changes

- @memberjunction/core@2.26.1
- @memberjunction/core-entities@2.26.1
- @memberjunction/global@2.26.1

## 2.26.0

### Patch Changes

- Updated dependencies [23801c5]
  - @memberjunction/core@2.26.0
  - @memberjunction/core-entities@2.26.0
  - @memberjunction/global@2.26.0

## 2.25.0

### Minor Changes

- 26c990d: - Add Conversations to Resource Types Entity* Update User View Grid to fix multi-edit bug* Transaction Management Changes - fixes bug in #803 - but not new feature in there* Clean bug in Notification Service to only show user-centric messages* Add Sharing dialog to Skip Chat component

### Patch Changes

- 824eca2: Transaction Group improvements
- Updated dependencies [fd07dcd]
- Updated dependencies [26c990d]
- Updated dependencies [86e6d3b]
  - @memberjunction/core@2.25.0
  - @memberjunction/core-entities@2.25.0
  - @memberjunction/global@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/core@2.24.1
- @memberjunction/core-entities@2.24.1
- @memberjunction/global@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [9cb85cc]
- Updated dependencies [7c6ff41]
  - @memberjunction/global@2.24.0
  - @memberjunction/core-entities@2.24.0
  - @memberjunction/core@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/core@2.23.2
- @memberjunction/core-entities@2.23.2
- @memberjunction/global@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/core@2.23.1
- @memberjunction/core-entities@2.23.1
- @memberjunction/global@2.23.1

## 2.23.0

### Patch Changes

- Updated dependencies [38b7507]
  - @memberjunction/global@2.23.0
  - @memberjunction/core@2.23.0
  - @memberjunction/core-entities@2.23.0

## 2.22.2

### Patch Changes

- Updated dependencies [94ebf81]
  - @memberjunction/core@2.22.2
  - @memberjunction/core-entities@2.22.2
  - @memberjunction/global@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/core@2.22.1
- @memberjunction/core-entities@2.22.1
- @memberjunction/global@2.22.1

## 2.22.0

### Minor Changes

- 12d2186: Update to GraphQLDataProvider to fix up a bug - using a minor bump to force 2.22.0

### Patch Changes

- Updated dependencies [a598f1a]
- Updated dependencies [9660275]
  - @memberjunction/core@2.22.0
  - @memberjunction/global@2.22.0
  - @memberjunction/core-entities@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.21.0
- Bump @memberjunction/core-entities to v2.21.0
- Bump @memberjunction/global to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.20.3
- Bump @memberjunction/core-entities to v2.20.3
- Bump @memberjunction/global to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.20.2
- Bump @memberjunction/core-entities to v2.20.2
- Bump @memberjunction/global to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/core to v2.20.1
- Bump @memberjunction/core-entities to v2.20.1
- Bump @memberjunction/global to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:04 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.20.0
- Bump @memberjunction/core-entities to v2.20.0
- Bump @memberjunction/global to v2.20.0

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/core to v2.19.5
- Bump @memberjunction/core-entities to v2.19.5
- Bump @memberjunction/global to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/core to v2.19.4
- Bump @memberjunction/core-entities to v2.19.4
- Bump @memberjunction/global to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/core to v2.19.3
- Bump @memberjunction/core-entities to v2.19.3
- Bump @memberjunction/global to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/core to v2.19.2
- Bump @memberjunction/core-entities to v2.19.2
- Bump @memberjunction/global to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/core to v2.19.1
- Bump @memberjunction/core-entities to v2.19.1
- Bump @memberjunction/global to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:48 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.19.0
- Bump @memberjunction/core-entities to v2.19.0
- Bump @memberjunction/global to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.18.3
- Bump @memberjunction/core-entities to v2.18.3
- Bump @memberjunction/global to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Bump @memberjunction/core to v2.18.2
- Bump @memberjunction/core-entities to v2.18.2
- Bump @memberjunction/global to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/core to v2.18.1
- Bump @memberjunction/core-entities to v2.18.1
- Bump @memberjunction/global to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Bump @memberjunction/core to v2.18.0
- Bump @memberjunction/core-entities to v2.18.0
- Bump @memberjunction/global to v2.18.0

## 2.17.0

Wed, 15 Jan 2025 03:17:08 GMT

### Minor changes

- Applying package updates [skip ci] (craig@memberjunction.com)
- Bump @memberjunction/core to v2.17.0
- Bump @memberjunction/core-entities to v2.17.0
- Bump @memberjunction/global to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:27 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/core to v2.16.1
- Bump @memberjunction/core-entities to v2.16.1
- Bump @memberjunction/global to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Bump @memberjunction/core to v2.16.0
- Bump @memberjunction/core-entities to v2.16.0
- Bump @memberjunction/global to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:28 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Bump @memberjunction/core to v2.15.2
- Bump @memberjunction/core-entities to v2.15.2
- Bump @memberjunction/global to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Bump @memberjunction/core to v2.14.0
- Bump @memberjunction/core-entities to v2.14.0
- Bump @memberjunction/global to v2.14.0

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/core to v2.13.4
- Bump @memberjunction/core-entities to v2.13.4
- Bump @memberjunction/global to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:45 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.13.3
- Bump @memberjunction/core-entities to v2.13.3
- Bump @memberjunction/global to v2.13.3

## 2.13.2

Tue, 03 Dec 2024 23:30:43 GMT

### Patches

- Bump @memberjunction/core to v2.13.2
- Bump @memberjunction/core-entities to v2.13.2
- Bump @memberjunction/global to v2.13.2

## 2.13.1

Wed, 27 Nov 2024 20:42:53 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.13.1
- Bump @memberjunction/core-entities to v2.13.1
- Bump @memberjunction/global to v2.13.1

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Minor changes

- Bump @memberjunction/core to v2.13.0
- Bump @memberjunction/core-entities to v2.13.0
- Bump @memberjunction/global to v2.13.0

## 2.12.0

Mon, 04 Nov 2024 23:07:22 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.12.0
- Bump @memberjunction/core-entities to v2.12.0
- Bump @memberjunction/global to v2.12.0

## 2.11.0

Thu, 24 Oct 2024 15:33:07 GMT

### Minor changes

- Bump @memberjunction/core to v2.11.0
- Bump @memberjunction/core-entities to v2.11.0
- Bump @memberjunction/global to v2.11.0

## 2.10.0

Wed, 23 Oct 2024 22:49:59 GMT

### Minor changes

- Bump @memberjunction/core to v2.10.0
- Bump @memberjunction/core-entities to v2.10.0
- Bump @memberjunction/global to v2.10.0

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.9.0
- Bump @memberjunction/core-entities to v2.9.0
- Bump @memberjunction/global to v2.9.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.8.0

Tue, 15 Oct 2024 17:01:03 GMT

### Minor changes

- Bump @memberjunction/core to v2.8.0
- Bump @memberjunction/core-entities to v2.8.0
- Bump @memberjunction/global to v2.8.0

## 2.7.1

Tue, 08 Oct 2024 22:16:58 GMT

### Patches

- Bump @memberjunction/core to v2.7.1
- Bump @memberjunction/core-entities to v2.7.1
- Bump @memberjunction/global to v2.7.1

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/core to v2.7.0
- Bump @memberjunction/core-entities to v2.7.0
- Bump @memberjunction/global to v2.7.0

## 2.6.1

Mon, 30 Sep 2024 15:55:48 GMT

### Patches

- Bump @memberjunction/core to v2.6.1
- Bump @memberjunction/core-entities to v2.6.1
- Bump @memberjunction/global to v2.6.1

## 2.6.0

Sat, 28 Sep 2024 00:19:39 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.6.0
- Bump @memberjunction/core-entities to v2.6.0
- Bump @memberjunction/global to v2.6.0

## 2.5.2

Sat, 28 Sep 2024 00:06:02 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

### Patches

- Bump @memberjunction/core to v2.5.2
- Bump @memberjunction/core-entities to v2.5.2
- Bump @memberjunction/global to v2.5.2

## 2.5.1

Fri, 20 Sep 2024 17:51:58 GMT

### Patches

- Bump @memberjunction/core to v2.5.1
- Bump @memberjunction/core-entities to v2.5.1
- Bump @memberjunction/global to v2.5.1

## 2.5.0

Fri, 20 Sep 2024 16:17:07 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.5.0
- Bump @memberjunction/core-entities to v2.5.0
- Bump @memberjunction/global to v2.5.0

## 2.4.1

Sun, 08 Sep 2024 19:33:23 GMT

### Patches

- Bump @memberjunction/core to v2.4.1
- Bump @memberjunction/core-entities to v2.4.1
- Bump @memberjunction/global to v2.4.1

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.4.0
- Bump @memberjunction/core-entities to v2.4.0
- Bump @memberjunction/global to v2.4.0

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Bump @memberjunction/core to v2.3.3
- Bump @memberjunction/core-entities to v2.3.3
- Bump @memberjunction/global to v2.3.3

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.3.2
- Bump @memberjunction/core-entities to v2.3.2
- Bump @memberjunction/global to v2.3.2

## 2.3.1

Fri, 16 Aug 2024 03:57:15 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v2.3.1
- Bump @memberjunction/core-entities to v2.3.1
- Bump @memberjunction/global to v2.3.1

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Minor changes

- Bump @memberjunction/core to v2.2.2
- Bump @memberjunction/core-entities to v2.3.0
- Bump @memberjunction/global to v2.3.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.2.1

Fri, 09 Aug 2024 01:29:44 GMT

### Patches

- Bump @memberjunction/core to v2.2.1
- Bump @memberjunction/core-entities to v2.2.1
- Bump @memberjunction/global to v2.2.1

## 2.2.0

Thu, 08 Aug 2024 02:53:16 GMT

### Minor changes

- Bump @memberjunction/core to v2.2.0
- Bump @memberjunction/core-entities to v2.1.6
- Bump @memberjunction/global to v2.2.0

## 2.1.5

Thu, 01 Aug 2024 17:23:11 GMT

### Patches

- Bump @memberjunction/core to v2.1.5
- Bump @memberjunction/core-entities to v2.1.5
- Bump @memberjunction/global to v2.1.5

## 2.1.4

Thu, 01 Aug 2024 14:43:41 GMT

### Patches

- Bump @memberjunction/core to v2.1.4
- Bump @memberjunction/core-entities to v2.1.4
- Bump @memberjunction/global to v2.1.4

## 2.1.3

Wed, 31 Jul 2024 19:36:47 GMT

### Patches

- Bump @memberjunction/core to v2.1.3
- Bump @memberjunction/core-entities to v2.1.3
- Bump @memberjunction/global to v2.1.3

## 2.1.2

Mon, 29 Jul 2024 22:52:11 GMT

### Patches

- Bump @memberjunction/core to v2.1.2
- Bump @memberjunction/core-entities to v2.1.2
- Bump @memberjunction/global to v2.1.2

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Bump @memberjunction/core to v2.1.1
- Bump @memberjunction/core-entities to v2.1.1
- Bump @memberjunction/global to v2.1.1

## 1.8.1

Fri, 21 Jun 2024 13:15:28 GMT

### Patches

- Bump @memberjunction/core to v1.8.1
- Bump @memberjunction/core-entities to v1.8.1
- Bump @memberjunction/global to v1.8.1

## 1.8.0

Wed, 19 Jun 2024 16:32:44 GMT

### Minor changes

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.8.0
- Bump @memberjunction/core-entities to v1.8.0
- Bump @memberjunction/global to v1.8.0

## 1.7.1

Wed, 12 Jun 2024 20:13:28 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.7.1
- Bump @memberjunction/core-entities to v1.7.1
- Bump @memberjunction/global to v1.7.1

## 1.7.0

Wed, 12 Jun 2024 18:53:39 GMT

### Minor changes

- Bump @memberjunction/core to v1.7.0
- Bump @memberjunction/core-entities to v1.7.0
- Bump @memberjunction/global to v1.7.0

## 1.6.1

Tue, 11 Jun 2024 06:50:06 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v1.6.1
- Bump @memberjunction/core-entities to v1.6.1
- Bump @memberjunction/global to v1.6.1

## 1.6.0

Tue, 11 Jun 2024 04:59:29 GMT

### Minor changes

- Bump @memberjunction/core to v1.6.0
- Bump @memberjunction/core-entities to v1.6.0
- Bump @memberjunction/global to v1.6.0

## 1.5.3

Tue, 11 Jun 2024 04:01:37 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.5.3
- Bump @memberjunction/core-entities to v1.5.3
- Bump @memberjunction/global to v1.5.3

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Bump @memberjunction/core to v1.5.2
- Bump @memberjunction/core-entities to v1.5.2
- Bump @memberjunction/global to v1.5.2

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Bump @memberjunction/core to v1.5.1
- Bump @memberjunction/core-entities to v1.5.1
- Bump @memberjunction/global to v1.5.1

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v1.5.0
- Bump @memberjunction/core-entities to v1.5.0
- Bump @memberjunction/global to v1.5.0

## 1.4.1

Fri, 07 Jun 2024 04:36:53 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.4.1
- Bump @memberjunction/core-entities to v1.4.1
- Bump @memberjunction/global to v1.4.1

## 1.4.0

Sat, 25 May 2024 15:30:17 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v1.4.0
- Bump @memberjunction/core-entities to v1.4.0
- Bump @memberjunction/global to v1.4.0

## 1.3.3

Thu, 23 May 2024 18:35:52 GMT

### Patches

- Bump @memberjunction/core to v1.3.3
- Bump @memberjunction/core-entities to v1.3.3
- Bump @memberjunction/global to v1.3.3

## 1.3.2

Thu, 23 May 2024 14:19:50 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.3.2
- Bump @memberjunction/core-entities to v1.3.2
- Bump @memberjunction/global to v1.3.2

## 1.3.1

Thu, 23 May 2024 02:29:25 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.3.1
- Bump @memberjunction/core-entities to v1.3.1
- Bump @memberjunction/global to v1.3.1

## 1.3.0

Wed, 22 May 2024 02:26:03 GMT

### Minor changes

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Overhaul the way we vectorize records (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.3.0
- Bump @memberjunction/core-entities to v1.3.0
- Bump @memberjunction/global to v1.3.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.2.2

Thu, 02 May 2024 19:46:38 GMT

### Patches

- Bump @memberjunction/core to v1.2.2
- Bump @memberjunction/core-entities to v1.2.2
- Bump @memberjunction/global to v1.2.2

## 1.2.1

Thu, 02 May 2024 16:46:11 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.2.1
- Bump @memberjunction/core-entities to v1.2.1
- Bump @memberjunction/global to v1.2.1

## 1.2.0

Mon, 29 Apr 2024 18:51:58 GMT

### Minor changes

- Bump @memberjunction/core to v1.2.0
- Bump @memberjunction/core-entities to v1.2.0
- Bump @memberjunction/global to v1.2.0

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Bump @memberjunction/core to v1.1.3
- Bump @memberjunction/core-entities to v1.1.3
- Bump @memberjunction/global to v1.1.3

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Bump @memberjunction/core to v1.1.2
- Bump @memberjunction/core-entities to v1.1.2
- Bump @memberjunction/global to v1.1.2

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Bump @memberjunction/core to v1.1.1
- Bump @memberjunction/core-entities to v1.1.1
- Bump @memberjunction/global to v1.1.1

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Bump @memberjunction/core to v1.1.0
- Bump @memberjunction/core-entities to v1.1.0
- Bump @memberjunction/global to v1.1.0

## 1.0.11

Wed, 24 Apr 2024 20:57:41 GMT

### Patches

- - bug fixes in Skip UI \* added exception handling to ReportResolver (97354817+AN-BC@users.noreply.github.com)
- minor tweak to build.order.json - this doesn't affect the "real" build of the system going forward which uses turbo, but I wanted to maintain this script for backup use if needed for some reason. (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/core to v1.0.11
- Bump @memberjunction/core-entities to v1.0.11
- Bump @memberjunction/global to v1.0.11

## 1.0.9

Sun, 14 Apr 2024 15:50:05 GMT

### Patches

- Bump @memberjunction/core to v1.0.9
- Bump @memberjunction/core-entities to v1.0.9
- Bump @memberjunction/global to v1.0.9

## 1.0.8

Sat, 13 Apr 2024 02:32:44 GMT

### Patches

- Update build and publish automation (craig.adam@bluecypress.io)
- Bump @memberjunction/core to v1.0.8
- Bump @memberjunction/core-entities to v1.0.8
- Bump @memberjunction/global to v1.0.8
