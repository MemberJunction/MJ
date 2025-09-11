# Change Log - @memberjunction/ng-explorer-core

## 2.100.1

### Patch Changes

- @memberjunction/ng-ask-skip@2.100.1
- @memberjunction/ng-auth-services@2.100.1
- @memberjunction/ng-base-forms@2.100.1
- @memberjunction/ng-compare-records@2.100.1
- @memberjunction/ng-dashboards@2.100.1
- @memberjunction/ng-entity-form-dialog@2.100.1
- @memberjunction/ng-explorer-settings@2.100.1
- @memberjunction/ng-record-changes@2.100.1
- @memberjunction/ng-shared@2.100.1
- @memberjunction/ng-user-view-grid@2.100.1
- @memberjunction/ng-user-view-properties@2.100.1
- @memberjunction/ng-container-directives@2.100.1
- @memberjunction/ng-file-storage@2.100.1
- @memberjunction/ng-query-grid@2.100.1
- @memberjunction/ng-record-selector@2.100.1
- @memberjunction/ng-resource-permissions@2.100.1
- @memberjunction/ng-skip-chat@2.100.1
- @memberjunction/ng-tabstrip@2.100.1
- @memberjunction/communication-types@2.100.1
- @memberjunction/entity-communications-client@2.100.1
- @memberjunction/core@2.100.1
- @memberjunction/core-entities@2.100.1
- @memberjunction/global@2.100.1
- @memberjunction/templates-base-types@2.100.1

## 2.100.0

### Patch Changes

- Updated dependencies [4f3ad43]
- Updated dependencies [5f76e3a]
- Updated dependencies [ffc2c1a]
  - @memberjunction/ng-skip-chat@2.100.0
  - @memberjunction/core@2.100.0
  - @memberjunction/core-entities@2.100.0
  - @memberjunction/ng-ask-skip@2.100.0
  - @memberjunction/ng-auth-services@2.100.0
  - @memberjunction/ng-base-forms@2.100.0
  - @memberjunction/ng-compare-records@2.100.0
  - @memberjunction/ng-dashboards@2.100.0
  - @memberjunction/ng-entity-form-dialog@2.100.0
  - @memberjunction/ng-explorer-settings@2.100.0
  - @memberjunction/ng-record-changes@2.100.0
  - @memberjunction/ng-shared@2.100.0
  - @memberjunction/ng-user-view-grid@2.100.0
  - @memberjunction/ng-user-view-properties@2.100.0
  - @memberjunction/ng-container-directives@2.100.0
  - @memberjunction/ng-file-storage@2.100.0
  - @memberjunction/ng-query-grid@2.100.0
  - @memberjunction/ng-record-selector@2.100.0
  - @memberjunction/ng-resource-permissions@2.100.0
  - @memberjunction/communication-types@2.100.0
  - @memberjunction/entity-communications-client@2.100.0
  - @memberjunction/templates-base-types@2.100.0
  - @memberjunction/ng-tabstrip@2.100.0
  - @memberjunction/global@2.100.0

## 2.99.0

### Patch Changes

- c91e416: Redesign query browser with multiple view modes and improved UX

  - Add three view modes: category (hierarchical folders), list (table),
    and panel (cards with SQL preview)
  - Implement breadcrumb navigation for category hierarchy with
    folder-based organization
  - Add search, status filter, and sort functionality with proper state
    management
  - Fix navigation to use proper MJ routing pattern (/resource/record/) for
    entity forms
  - Fix delete functionality to handle BaseEntity objects from RunView
    correctly
  - Add "New Query" button that navigates to empty form with optional
    CategoryID pre-population
  - Remove edit buttons in favor of single-click navigation to query form
  - Show query counts in category folders for better organization
    visibility
  - Fix SQL syntax errors caused by double-quoted GUIDs in query parameters
  - Improve performance with batch data loading and client-side filtering

- Updated dependencies [eb7677d]
- Updated dependencies [2eaf6c9]
- Updated dependencies [8bbb0a9]
  - @memberjunction/core-entities@2.99.0
  - @memberjunction/ng-auth-services@2.99.0
  - @memberjunction/core@2.99.0
  - @memberjunction/ng-dashboards@2.99.0
  - @memberjunction/ng-ask-skip@2.99.0
  - @memberjunction/ng-compare-records@2.99.0
  - @memberjunction/ng-entity-form-dialog@2.99.0
  - @memberjunction/ng-explorer-settings@2.99.0
  - @memberjunction/ng-shared@2.99.0
  - @memberjunction/ng-user-view-grid@2.99.0
  - @memberjunction/ng-user-view-properties@2.99.0
  - @memberjunction/ng-file-storage@2.99.0
  - @memberjunction/ng-query-grid@2.99.0
  - @memberjunction/ng-record-selector@2.99.0
  - @memberjunction/ng-resource-permissions@2.99.0
  - @memberjunction/ng-skip-chat@2.99.0
  - @memberjunction/communication-types@2.99.0
  - @memberjunction/entity-communications-client@2.99.0
  - @memberjunction/templates-base-types@2.99.0
  - @memberjunction/ng-base-forms@2.99.0
  - @memberjunction/ng-record-changes@2.99.0
  - @memberjunction/ng-container-directives@2.99.0
  - @memberjunction/ng-tabstrip@2.99.0
  - @memberjunction/global@2.99.0

## 2.98.0

### Patch Changes

- Updated dependencies [a6a99c4]
  - @memberjunction/ng-skip-chat@2.98.0
  - @memberjunction/ng-ask-skip@2.98.0
  - @memberjunction/ng-dashboards@2.98.0
  - @memberjunction/ng-auth-services@2.98.0
  - @memberjunction/ng-base-forms@2.98.0
  - @memberjunction/ng-compare-records@2.98.0
  - @memberjunction/ng-entity-form-dialog@2.98.0
  - @memberjunction/ng-explorer-settings@2.98.0
  - @memberjunction/ng-record-changes@2.98.0
  - @memberjunction/ng-shared@2.98.0
  - @memberjunction/ng-user-view-grid@2.98.0
  - @memberjunction/ng-user-view-properties@2.98.0
  - @memberjunction/ng-container-directives@2.98.0
  - @memberjunction/ng-file-storage@2.98.0
  - @memberjunction/ng-query-grid@2.98.0
  - @memberjunction/ng-record-selector@2.98.0
  - @memberjunction/ng-resource-permissions@2.98.0
  - @memberjunction/ng-tabstrip@2.98.0
  - @memberjunction/communication-types@2.98.0
  - @memberjunction/entity-communications-client@2.98.0
  - @memberjunction/core@2.98.0
  - @memberjunction/core-entities@2.98.0
  - @memberjunction/global@2.98.0
  - @memberjunction/templates-base-types@2.98.0

## 2.97.0

### Patch Changes

- Updated dependencies [ecacab3]
- Updated dependencies [93ac030]
  - @memberjunction/ng-skip-chat@2.97.0
  - @memberjunction/communication-types@2.97.0
  - @memberjunction/core-entities@2.97.0
  - @memberjunction/ng-ask-skip@2.97.0
  - @memberjunction/ng-user-view-grid@2.97.0
  - @memberjunction/ng-compare-records@2.97.0
  - @memberjunction/ng-dashboards@2.97.0
  - @memberjunction/ng-entity-form-dialog@2.97.0
  - @memberjunction/ng-explorer-settings@2.97.0
  - @memberjunction/ng-shared@2.97.0
  - @memberjunction/ng-user-view-properties@2.97.0
  - @memberjunction/ng-file-storage@2.97.0
  - @memberjunction/ng-query-grid@2.97.0
  - @memberjunction/ng-record-selector@2.97.0
  - @memberjunction/ng-resource-permissions@2.97.0
  - @memberjunction/entity-communications-client@2.97.0
  - @memberjunction/templates-base-types@2.97.0
  - @memberjunction/ng-record-changes@2.97.0
  - @memberjunction/ng-base-forms@2.97.0
  - @memberjunction/ng-auth-services@2.97.0
  - @memberjunction/ng-container-directives@2.97.0
  - @memberjunction/ng-tabstrip@2.97.0
  - @memberjunction/core@2.97.0
  - @memberjunction/global@2.97.0

## 2.96.0

### Patch Changes

- Updated dependencies [01dcfde]
  - @memberjunction/core@2.96.0
  - @memberjunction/ng-ask-skip@2.96.0
  - @memberjunction/ng-auth-services@2.96.0
  - @memberjunction/ng-base-forms@2.96.0
  - @memberjunction/ng-compare-records@2.96.0
  - @memberjunction/ng-dashboards@2.96.0
  - @memberjunction/ng-entity-form-dialog@2.96.0
  - @memberjunction/ng-explorer-settings@2.96.0
  - @memberjunction/ng-record-changes@2.96.0
  - @memberjunction/ng-shared@2.96.0
  - @memberjunction/ng-user-view-grid@2.96.0
  - @memberjunction/ng-user-view-properties@2.96.0
  - @memberjunction/ng-container-directives@2.96.0
  - @memberjunction/ng-file-storage@2.96.0
  - @memberjunction/ng-query-grid@2.96.0
  - @memberjunction/ng-record-selector@2.96.0
  - @memberjunction/ng-resource-permissions@2.96.0
  - @memberjunction/ng-skip-chat@2.96.0
  - @memberjunction/communication-types@2.96.0
  - @memberjunction/entity-communications-client@2.96.0
  - @memberjunction/core-entities@2.96.0
  - @memberjunction/templates-base-types@2.96.0
  - @memberjunction/ng-tabstrip@2.96.0
  - @memberjunction/global@2.96.0

## 2.95.0

### Patch Changes

- Updated dependencies [4b52f29]
- Updated dependencies [a54c014]
- Updated dependencies [95e6360]
  - @memberjunction/ng-auth-services@2.95.0
  - @memberjunction/ng-skip-chat@2.95.0
  - @memberjunction/core@2.95.0
  - @memberjunction/ng-dashboards@2.95.0
  - @memberjunction/ng-ask-skip@2.95.0
  - @memberjunction/ng-base-forms@2.95.0
  - @memberjunction/ng-compare-records@2.95.0
  - @memberjunction/ng-entity-form-dialog@2.95.0
  - @memberjunction/ng-explorer-settings@2.95.0
  - @memberjunction/ng-record-changes@2.95.0
  - @memberjunction/ng-shared@2.95.0
  - @memberjunction/ng-user-view-grid@2.95.0
  - @memberjunction/ng-user-view-properties@2.95.0
  - @memberjunction/ng-container-directives@2.95.0
  - @memberjunction/ng-file-storage@2.95.0
  - @memberjunction/ng-query-grid@2.95.0
  - @memberjunction/ng-record-selector@2.95.0
  - @memberjunction/ng-resource-permissions@2.95.0
  - @memberjunction/communication-types@2.95.0
  - @memberjunction/entity-communications-client@2.95.0
  - @memberjunction/core-entities@2.95.0
  - @memberjunction/templates-base-types@2.95.0
  - @memberjunction/ng-tabstrip@2.95.0
  - @memberjunction/global@2.95.0

## 2.94.0

### Patch Changes

- Updated dependencies [2a87d36]
  - @memberjunction/ng-auth-services@2.94.0
  - @memberjunction/ng-skip-chat@2.94.0
  - @memberjunction/core-entities@2.94.0
  - @memberjunction/ng-ask-skip@2.94.0
  - @memberjunction/ng-compare-records@2.94.0
  - @memberjunction/ng-dashboards@2.94.0
  - @memberjunction/ng-entity-form-dialog@2.94.0
  - @memberjunction/ng-explorer-settings@2.94.0
  - @memberjunction/ng-shared@2.94.0
  - @memberjunction/ng-user-view-grid@2.94.0
  - @memberjunction/ng-user-view-properties@2.94.0
  - @memberjunction/ng-file-storage@2.94.0
  - @memberjunction/ng-query-grid@2.94.0
  - @memberjunction/ng-record-selector@2.94.0
  - @memberjunction/ng-resource-permissions@2.94.0
  - @memberjunction/communication-types@2.94.0
  - @memberjunction/entity-communications-client@2.94.0
  - @memberjunction/templates-base-types@2.94.0
  - @memberjunction/ng-record-changes@2.94.0
  - @memberjunction/ng-base-forms@2.94.0
  - @memberjunction/ng-container-directives@2.94.0
  - @memberjunction/ng-tabstrip@2.94.0
  - @memberjunction/core@2.94.0
  - @memberjunction/global@2.94.0

## 2.93.0

### Patch Changes

- 103e4a9: Added comprehensive tracking fields to AI execution entities:

  - **AIAgentRun**: Added `RunName`, `Comment`, and `ParentID` fields for better run identification and hierarchical tracking
  - **AIPromptRun**: Added `RunName`, `Comment`, and `ParentID` fields for consistent tracking across prompt executions
  - **AIAgentRunStep**: Added `Comment` and `ParentID` fields for detailed step-level tracking
  - **Flow Agent Type**: Added support for Chat message handling to properly bubble up messages from sub-agents to users
  - **Action Execution**: Enhanced action execution logging by capturing input data (action name and parameters) in step entities
  - **CodeGen SQL Execution**: Fixed QUOTED_IDENTIFIER issues by adding `-I` flag to sqlcmd execution (required for indexed views and computed columns)
  - **MetadataSync Push Service**: Improved error reporting with detailed context for field processing failures, lookup failures, and save errors
  - Database migration `V202508231445__v2.93.0` adds the new tracking fields with proper constraints and metadata
  - Updated all generated entity classes, GraphQL types, and Angular forms to support the new fields
  - Enhanced error diagnostics in push service to help identify root causes of sync failures

- Updated dependencies [f8757aa]
- Updated dependencies [103e4a9]
- Updated dependencies [7f465b5]
- Updated dependencies [a94d422]
  - @memberjunction/core@2.93.0
  - @memberjunction/core-entities@2.93.0
  - @memberjunction/ng-skip-chat@2.93.0
  - @memberjunction/ng-ask-skip@2.93.0
  - @memberjunction/ng-auth-services@2.93.0
  - @memberjunction/ng-base-forms@2.93.0
  - @memberjunction/ng-compare-records@2.93.0
  - @memberjunction/ng-dashboards@2.93.0
  - @memberjunction/ng-entity-form-dialog@2.93.0
  - @memberjunction/ng-explorer-settings@2.93.0
  - @memberjunction/ng-record-changes@2.93.0
  - @memberjunction/ng-shared@2.93.0
  - @memberjunction/ng-user-view-grid@2.93.0
  - @memberjunction/ng-user-view-properties@2.93.0
  - @memberjunction/ng-container-directives@2.93.0
  - @memberjunction/ng-file-storage@2.93.0
  - @memberjunction/ng-query-grid@2.93.0
  - @memberjunction/ng-record-selector@2.93.0
  - @memberjunction/ng-resource-permissions@2.93.0
  - @memberjunction/communication-types@2.93.0
  - @memberjunction/entity-communications-client@2.93.0
  - @memberjunction/templates-base-types@2.93.0
  - @memberjunction/ng-tabstrip@2.93.0
  - @memberjunction/global@2.93.0

## 2.92.0

### Patch Changes

- Updated dependencies [8fb03df]
- Updated dependencies [5817bac]
  - @memberjunction/core@2.92.0
  - @memberjunction/ng-dashboards@2.92.0
  - @memberjunction/ng-base-forms@2.92.0
  - @memberjunction/ng-skip-chat@2.92.0
  - @memberjunction/core-entities@2.92.0
  - @memberjunction/ng-ask-skip@2.92.0
  - @memberjunction/ng-auth-services@2.92.0
  - @memberjunction/ng-compare-records@2.92.0
  - @memberjunction/ng-entity-form-dialog@2.92.0
  - @memberjunction/ng-explorer-settings@2.92.0
  - @memberjunction/ng-record-changes@2.92.0
  - @memberjunction/ng-shared@2.92.0
  - @memberjunction/ng-user-view-grid@2.92.0
  - @memberjunction/ng-user-view-properties@2.92.0
  - @memberjunction/ng-container-directives@2.92.0
  - @memberjunction/ng-file-storage@2.92.0
  - @memberjunction/ng-query-grid@2.92.0
  - @memberjunction/ng-record-selector@2.92.0
  - @memberjunction/ng-resource-permissions@2.92.0
  - @memberjunction/communication-types@2.92.0
  - @memberjunction/entity-communications-client@2.92.0
  - @memberjunction/templates-base-types@2.92.0
  - @memberjunction/ng-tabstrip@2.92.0
  - @memberjunction/global@2.92.0

## 2.91.0

### Patch Changes

- Updated dependencies [f703033]
- Updated dependencies [6476d74]
- Updated dependencies [d670e2c]
  - @memberjunction/ng-auth-services@2.91.0
  - @memberjunction/core@2.91.0
  - @memberjunction/core-entities@2.91.0
  - @memberjunction/ng-skip-chat@2.91.0
  - @memberjunction/ng-ask-skip@2.91.0
  - @memberjunction/ng-base-forms@2.91.0
  - @memberjunction/ng-compare-records@2.91.0
  - @memberjunction/ng-dashboards@2.91.0
  - @memberjunction/ng-entity-form-dialog@2.91.0
  - @memberjunction/ng-explorer-settings@2.91.0
  - @memberjunction/ng-record-changes@2.91.0
  - @memberjunction/ng-shared@2.91.0
  - @memberjunction/ng-user-view-grid@2.91.0
  - @memberjunction/ng-user-view-properties@2.91.0
  - @memberjunction/ng-container-directives@2.91.0
  - @memberjunction/ng-file-storage@2.91.0
  - @memberjunction/ng-query-grid@2.91.0
  - @memberjunction/ng-record-selector@2.91.0
  - @memberjunction/ng-resource-permissions@2.91.0
  - @memberjunction/communication-types@2.91.0
  - @memberjunction/entity-communications-client@2.91.0
  - @memberjunction/templates-base-types@2.91.0
  - @memberjunction/ng-tabstrip@2.91.0
  - @memberjunction/global@2.91.0

## 2.90.0

### Patch Changes

- Updated dependencies [146ebcc]
- Updated dependencies [2cb05a1]
- Updated dependencies [d5d26d7]
- Updated dependencies [1e7eb76]
  - @memberjunction/core@2.90.0
  - @memberjunction/core-entities@2.90.0
  - @memberjunction/ng-dashboards@2.90.0
  - @memberjunction/ng-skip-chat@2.90.0
  - @memberjunction/ng-ask-skip@2.90.0
  - @memberjunction/ng-auth-services@2.90.0
  - @memberjunction/ng-base-forms@2.90.0
  - @memberjunction/ng-compare-records@2.90.0
  - @memberjunction/ng-entity-form-dialog@2.90.0
  - @memberjunction/ng-explorer-settings@2.90.0
  - @memberjunction/ng-record-changes@2.90.0
  - @memberjunction/ng-shared@2.90.0
  - @memberjunction/ng-user-view-grid@2.90.0
  - @memberjunction/ng-user-view-properties@2.90.0
  - @memberjunction/ng-container-directives@2.90.0
  - @memberjunction/ng-file-storage@2.90.0
  - @memberjunction/ng-query-grid@2.90.0
  - @memberjunction/ng-record-selector@2.90.0
  - @memberjunction/ng-resource-permissions@2.90.0
  - @memberjunction/communication-types@2.90.0
  - @memberjunction/entity-communications-client@2.90.0
  - @memberjunction/templates-base-types@2.90.0
  - @memberjunction/ng-tabstrip@2.90.0
  - @memberjunction/global@2.90.0

## 2.89.0

### Patch Changes

- Updated dependencies [d1911ed]
  - @memberjunction/core-entities@2.89.0
  - @memberjunction/ng-ask-skip@2.89.0
  - @memberjunction/ng-compare-records@2.89.0
  - @memberjunction/ng-dashboards@2.89.0
  - @memberjunction/ng-entity-form-dialog@2.89.0
  - @memberjunction/ng-explorer-settings@2.89.0
  - @memberjunction/ng-shared@2.89.0
  - @memberjunction/ng-user-view-grid@2.89.0
  - @memberjunction/ng-user-view-properties@2.89.0
  - @memberjunction/ng-file-storage@2.89.0
  - @memberjunction/ng-query-grid@2.89.0
  - @memberjunction/ng-record-selector@2.89.0
  - @memberjunction/ng-resource-permissions@2.89.0
  - @memberjunction/ng-skip-chat@2.89.0
  - @memberjunction/communication-types@2.89.0
  - @memberjunction/entity-communications-client@2.89.0
  - @memberjunction/templates-base-types@2.89.0
  - @memberjunction/ng-record-changes@2.89.0
  - @memberjunction/ng-base-forms@2.89.0
  - @memberjunction/ng-auth-services@2.89.0
  - @memberjunction/ng-container-directives@2.89.0
  - @memberjunction/ng-tabstrip@2.89.0
  - @memberjunction/core@2.89.0
  - @memberjunction/global@2.89.0

## 2.88.0

### Patch Changes

- Updated dependencies [df4031f]
  - @memberjunction/core-entities@2.88.0
  - @memberjunction/ng-ask-skip@2.88.0
  - @memberjunction/ng-shared@2.88.0
  - @memberjunction/ng-file-storage@2.88.0
  - @memberjunction/ng-skip-chat@2.88.0
  - @memberjunction/entity-communications-client@2.88.0
  - @memberjunction/ng-compare-records@2.88.0
  - @memberjunction/ng-dashboards@2.88.0
  - @memberjunction/ng-entity-form-dialog@2.88.0
  - @memberjunction/ng-explorer-settings@2.88.0
  - @memberjunction/ng-user-view-grid@2.88.0
  - @memberjunction/ng-user-view-properties@2.88.0
  - @memberjunction/ng-query-grid@2.88.0
  - @memberjunction/ng-record-selector@2.88.0
  - @memberjunction/ng-resource-permissions@2.88.0
  - @memberjunction/communication-types@2.88.0
  - @memberjunction/templates-base-types@2.88.0
  - @memberjunction/ng-base-forms@2.88.0
  - @memberjunction/ng-record-changes@2.88.0
  - @memberjunction/ng-auth-services@2.88.0
  - @memberjunction/ng-container-directives@2.88.0
  - @memberjunction/ng-tabstrip@2.88.0
  - @memberjunction/core@2.88.0
  - @memberjunction/global@2.88.0

## 2.87.0

### Patch Changes

- Updated dependencies [fa4132a]
- Updated dependencies [58a00df]
  - @memberjunction/ng-dashboards@2.87.0
  - @memberjunction/core@2.87.0
  - @memberjunction/ng-ask-skip@2.87.0
  - @memberjunction/ng-auth-services@2.87.0
  - @memberjunction/ng-base-forms@2.87.0
  - @memberjunction/ng-compare-records@2.87.0
  - @memberjunction/ng-entity-form-dialog@2.87.0
  - @memberjunction/ng-explorer-settings@2.87.0
  - @memberjunction/ng-record-changes@2.87.0
  - @memberjunction/ng-shared@2.87.0
  - @memberjunction/ng-user-view-grid@2.87.0
  - @memberjunction/ng-user-view-properties@2.87.0
  - @memberjunction/ng-container-directives@2.87.0
  - @memberjunction/ng-file-storage@2.87.0
  - @memberjunction/ng-query-grid@2.87.0
  - @memberjunction/ng-record-selector@2.87.0
  - @memberjunction/ng-resource-permissions@2.87.0
  - @memberjunction/ng-skip-chat@2.87.0
  - @memberjunction/communication-types@2.87.0
  - @memberjunction/entity-communications-client@2.87.0
  - @memberjunction/core-entities@2.87.0
  - @memberjunction/templates-base-types@2.87.0
  - @memberjunction/ng-tabstrip@2.87.0
  - @memberjunction/global@2.87.0

## 2.86.0

### Patch Changes

- Updated dependencies [7dd2409]
  - @memberjunction/core-entities@2.86.0
  - @memberjunction/ng-ask-skip@2.86.0
  - @memberjunction/ng-skip-chat@2.86.0
  - @memberjunction/ng-compare-records@2.86.0
  - @memberjunction/ng-dashboards@2.86.0
  - @memberjunction/ng-entity-form-dialog@2.86.0
  - @memberjunction/ng-explorer-settings@2.86.0
  - @memberjunction/ng-shared@2.86.0
  - @memberjunction/ng-user-view-grid@2.86.0
  - @memberjunction/ng-user-view-properties@2.86.0
  - @memberjunction/ng-file-storage@2.86.0
  - @memberjunction/ng-query-grid@2.86.0
  - @memberjunction/ng-record-selector@2.86.0
  - @memberjunction/ng-resource-permissions@2.86.0
  - @memberjunction/communication-types@2.86.0
  - @memberjunction/entity-communications-client@2.86.0
  - @memberjunction/templates-base-types@2.86.0
  - @memberjunction/ng-record-changes@2.86.0
  - @memberjunction/ng-base-forms@2.86.0
  - @memberjunction/ng-auth-services@2.86.0
  - @memberjunction/ng-container-directives@2.86.0
  - @memberjunction/ng-tabstrip@2.86.0
  - @memberjunction/core@2.86.0
  - @memberjunction/global@2.86.0

## 2.85.0

### Patch Changes

- Updated dependencies [747455a]
  - @memberjunction/core-entities@2.85.0
  - @memberjunction/ng-ask-skip@2.85.0
  - @memberjunction/ng-compare-records@2.85.0
  - @memberjunction/ng-dashboards@2.85.0
  - @memberjunction/ng-entity-form-dialog@2.85.0
  - @memberjunction/ng-explorer-settings@2.85.0
  - @memberjunction/ng-shared@2.85.0
  - @memberjunction/ng-user-view-grid@2.85.0
  - @memberjunction/ng-user-view-properties@2.85.0
  - @memberjunction/ng-file-storage@2.85.0
  - @memberjunction/ng-query-grid@2.85.0
  - @memberjunction/ng-record-selector@2.85.0
  - @memberjunction/ng-resource-permissions@2.85.0
  - @memberjunction/ng-skip-chat@2.85.0
  - @memberjunction/communication-types@2.85.0
  - @memberjunction/entity-communications-client@2.85.0
  - @memberjunction/templates-base-types@2.85.0
  - @memberjunction/ng-record-changes@2.85.0
  - @memberjunction/ng-base-forms@2.85.0
  - @memberjunction/ng-auth-services@2.85.0
  - @memberjunction/ng-container-directives@2.85.0
  - @memberjunction/ng-tabstrip@2.85.0
  - @memberjunction/core@2.85.0
  - @memberjunction/global@2.85.0

## 2.84.0

### Patch Changes

- Updated dependencies [0b9d691]
  - @memberjunction/core@2.84.0
  - @memberjunction/ng-ask-skip@2.84.0
  - @memberjunction/ng-shared@2.84.0
  - @memberjunction/ng-file-storage@2.84.0
  - @memberjunction/ng-skip-chat@2.84.0
  - @memberjunction/entity-communications-client@2.84.0
  - @memberjunction/ng-auth-services@2.84.0
  - @memberjunction/ng-base-forms@2.84.0
  - @memberjunction/ng-compare-records@2.84.0
  - @memberjunction/ng-dashboards@2.84.0
  - @memberjunction/ng-entity-form-dialog@2.84.0
  - @memberjunction/ng-explorer-settings@2.84.0
  - @memberjunction/ng-record-changes@2.84.0
  - @memberjunction/ng-user-view-grid@2.84.0
  - @memberjunction/ng-user-view-properties@2.84.0
  - @memberjunction/ng-container-directives@2.84.0
  - @memberjunction/ng-query-grid@2.84.0
  - @memberjunction/ng-record-selector@2.84.0
  - @memberjunction/ng-resource-permissions@2.84.0
  - @memberjunction/communication-types@2.84.0
  - @memberjunction/core-entities@2.84.0
  - @memberjunction/templates-base-types@2.84.0
  - @memberjunction/ng-tabstrip@2.84.0
  - @memberjunction/global@2.84.0

## 2.83.0

### Patch Changes

- Updated dependencies [e2e0415]
  - @memberjunction/core@2.83.0
  - @memberjunction/ng-ask-skip@2.83.0
  - @memberjunction/ng-auth-services@2.83.0
  - @memberjunction/ng-base-forms@2.83.0
  - @memberjunction/ng-compare-records@2.83.0
  - @memberjunction/ng-dashboards@2.83.0
  - @memberjunction/ng-entity-form-dialog@2.83.0
  - @memberjunction/ng-explorer-settings@2.83.0
  - @memberjunction/ng-record-changes@2.83.0
  - @memberjunction/ng-shared@2.83.0
  - @memberjunction/ng-user-view-grid@2.83.0
  - @memberjunction/ng-user-view-properties@2.83.0
  - @memberjunction/ng-container-directives@2.83.0
  - @memberjunction/ng-file-storage@2.83.0
  - @memberjunction/ng-query-grid@2.83.0
  - @memberjunction/ng-record-selector@2.83.0
  - @memberjunction/ng-resource-permissions@2.83.0
  - @memberjunction/ng-skip-chat@2.83.0
  - @memberjunction/communication-types@2.83.0
  - @memberjunction/entity-communications-client@2.83.0
  - @memberjunction/core-entities@2.83.0
  - @memberjunction/templates-base-types@2.83.0
  - @memberjunction/ng-tabstrip@2.83.0
  - @memberjunction/global@2.83.0

## 2.82.0

### Patch Changes

- Updated dependencies [2186d7b]
- Updated dependencies [975e8d1]
  - @memberjunction/core-entities@2.82.0
  - @memberjunction/ng-ask-skip@2.82.0
  - @memberjunction/ng-shared@2.82.0
  - @memberjunction/ng-file-storage@2.82.0
  - @memberjunction/ng-skip-chat@2.82.0
  - @memberjunction/entity-communications-client@2.82.0
  - @memberjunction/ng-dashboards@2.82.0
  - @memberjunction/ng-compare-records@2.82.0
  - @memberjunction/ng-entity-form-dialog@2.82.0
  - @memberjunction/ng-explorer-settings@2.82.0
  - @memberjunction/ng-user-view-grid@2.82.0
  - @memberjunction/ng-user-view-properties@2.82.0
  - @memberjunction/ng-query-grid@2.82.0
  - @memberjunction/ng-record-selector@2.82.0
  - @memberjunction/ng-resource-permissions@2.82.0
  - @memberjunction/communication-types@2.82.0
  - @memberjunction/templates-base-types@2.82.0
  - @memberjunction/ng-base-forms@2.82.0
  - @memberjunction/ng-record-changes@2.82.0
  - @memberjunction/ng-auth-services@2.82.0
  - @memberjunction/ng-container-directives@2.82.0
  - @memberjunction/ng-tabstrip@2.82.0
  - @memberjunction/core@2.82.0
  - @memberjunction/global@2.82.0

## 2.81.0

### Patch Changes

- Updated dependencies [6d2d478]
- Updated dependencies [e623f99]
- Updated dependencies [971c5d4]
  - @memberjunction/core@2.81.0
  - @memberjunction/core-entities@2.81.0
  - @memberjunction/ng-dashboards@2.81.0
  - @memberjunction/ng-ask-skip@2.81.0
  - @memberjunction/ng-auth-services@2.81.0
  - @memberjunction/ng-base-forms@2.81.0
  - @memberjunction/ng-compare-records@2.81.0
  - @memberjunction/ng-entity-form-dialog@2.81.0
  - @memberjunction/ng-explorer-settings@2.81.0
  - @memberjunction/ng-record-changes@2.81.0
  - @memberjunction/ng-shared@2.81.0
  - @memberjunction/ng-user-view-grid@2.81.0
  - @memberjunction/ng-user-view-properties@2.81.0
  - @memberjunction/ng-container-directives@2.81.0
  - @memberjunction/ng-file-storage@2.81.0
  - @memberjunction/ng-query-grid@2.81.0
  - @memberjunction/ng-record-selector@2.81.0
  - @memberjunction/ng-resource-permissions@2.81.0
  - @memberjunction/ng-skip-chat@2.81.0
  - @memberjunction/communication-types@2.81.0
  - @memberjunction/entity-communications-client@2.81.0
  - @memberjunction/templates-base-types@2.81.0
  - @memberjunction/ng-tabstrip@2.81.0
  - @memberjunction/global@2.81.0

## 2.80.1

### Patch Changes

- @memberjunction/ng-ask-skip@2.80.1
- @memberjunction/ng-auth-services@2.80.1
- @memberjunction/ng-base-forms@2.80.1
- @memberjunction/ng-compare-records@2.80.1
- @memberjunction/ng-dashboards@2.80.1
- @memberjunction/ng-entity-form-dialog@2.80.1
- @memberjunction/ng-explorer-settings@2.80.1
- @memberjunction/ng-record-changes@2.80.1
- @memberjunction/ng-shared@2.80.1
- @memberjunction/ng-user-view-grid@2.80.1
- @memberjunction/ng-user-view-properties@2.80.1
- @memberjunction/ng-container-directives@2.80.1
- @memberjunction/ng-file-storage@2.80.1
- @memberjunction/ng-query-grid@2.80.1
- @memberjunction/ng-record-selector@2.80.1
- @memberjunction/ng-resource-permissions@2.80.1
- @memberjunction/ng-skip-chat@2.80.1
- @memberjunction/ng-tabstrip@2.80.1
- @memberjunction/communication-types@2.80.1
- @memberjunction/entity-communications-client@2.80.1
- @memberjunction/core@2.80.1
- @memberjunction/core-entities@2.80.1
- @memberjunction/global@2.80.1
- @memberjunction/templates-base-types@2.80.1

## 2.80.0

### Patch Changes

- Updated dependencies [7c5f844]
- Updated dependencies [d03dfae]
  - @memberjunction/core@2.80.0
  - @memberjunction/core-entities@2.80.0
  - @memberjunction/ng-ask-skip@2.80.0
  - @memberjunction/ng-shared@2.80.0
  - @memberjunction/ng-file-storage@2.80.0
  - @memberjunction/ng-skip-chat@2.80.0
  - @memberjunction/entity-communications-client@2.80.0
  - @memberjunction/ng-auth-services@2.80.0
  - @memberjunction/ng-base-forms@2.80.0
  - @memberjunction/ng-compare-records@2.80.0
  - @memberjunction/ng-dashboards@2.80.0
  - @memberjunction/ng-entity-form-dialog@2.80.0
  - @memberjunction/ng-explorer-settings@2.80.0
  - @memberjunction/ng-record-changes@2.80.0
  - @memberjunction/ng-user-view-grid@2.80.0
  - @memberjunction/ng-user-view-properties@2.80.0
  - @memberjunction/ng-container-directives@2.80.0
  - @memberjunction/ng-query-grid@2.80.0
  - @memberjunction/ng-record-selector@2.80.0
  - @memberjunction/ng-resource-permissions@2.80.0
  - @memberjunction/communication-types@2.80.0
  - @memberjunction/templates-base-types@2.80.0
  - @memberjunction/ng-tabstrip@2.80.0
  - @memberjunction/global@2.80.0

## 2.79.0

### Patch Changes

- Updated dependencies [4bf2634]
- Updated dependencies [907e73f]
  - @memberjunction/core-entities@2.79.0
  - @memberjunction/global@2.79.0
  - @memberjunction/ng-dashboards@2.79.0
  - @memberjunction/ng-ask-skip@2.79.0
  - @memberjunction/ng-compare-records@2.79.0
  - @memberjunction/ng-entity-form-dialog@2.79.0
  - @memberjunction/ng-explorer-settings@2.79.0
  - @memberjunction/ng-shared@2.79.0
  - @memberjunction/ng-user-view-grid@2.79.0
  - @memberjunction/ng-user-view-properties@2.79.0
  - @memberjunction/ng-file-storage@2.79.0
  - @memberjunction/ng-query-grid@2.79.0
  - @memberjunction/ng-record-selector@2.79.0
  - @memberjunction/ng-resource-permissions@2.79.0
  - @memberjunction/ng-skip-chat@2.79.0
  - @memberjunction/communication-types@2.79.0
  - @memberjunction/entity-communications-client@2.79.0
  - @memberjunction/templates-base-types@2.79.0
  - @memberjunction/ng-base-forms@2.79.0
  - @memberjunction/ng-record-changes@2.79.0
  - @memberjunction/ng-container-directives@2.79.0
  - @memberjunction/core@2.79.0
  - @memberjunction/ng-tabstrip@2.79.0
  - @memberjunction/ng-auth-services@2.79.0

## 2.78.0

### Patch Changes

- Updated dependencies [06088e5]
  - @memberjunction/core-entities@2.78.0
  - @memberjunction/ng-ask-skip@2.78.0
  - @memberjunction/ng-compare-records@2.78.0
  - @memberjunction/ng-dashboards@2.78.0
  - @memberjunction/ng-entity-form-dialog@2.78.0
  - @memberjunction/ng-explorer-settings@2.78.0
  - @memberjunction/ng-shared@2.78.0
  - @memberjunction/ng-user-view-grid@2.78.0
  - @memberjunction/ng-user-view-properties@2.78.0
  - @memberjunction/ng-file-storage@2.78.0
  - @memberjunction/ng-query-grid@2.78.0
  - @memberjunction/ng-record-selector@2.78.0
  - @memberjunction/ng-resource-permissions@2.78.0
  - @memberjunction/ng-skip-chat@2.78.0
  - @memberjunction/communication-types@2.78.0
  - @memberjunction/entity-communications-client@2.78.0
  - @memberjunction/templates-base-types@2.78.0
  - @memberjunction/ng-record-changes@2.78.0
  - @memberjunction/ng-base-forms@2.78.0
  - @memberjunction/ng-auth-services@2.78.0
  - @memberjunction/ng-container-directives@2.78.0
  - @memberjunction/ng-tabstrip@2.78.0
  - @memberjunction/core@2.78.0
  - @memberjunction/global@2.78.0

## 2.77.0

### Patch Changes

- Updated dependencies [d8f14a2]
- Updated dependencies [8ee0d86]
- Updated dependencies [c91269e]
  - @memberjunction/core@2.77.0
  - @memberjunction/core-entities@2.77.0
  - @memberjunction/ng-ask-skip@2.77.0
  - @memberjunction/ng-auth-services@2.77.0
  - @memberjunction/ng-base-forms@2.77.0
  - @memberjunction/ng-compare-records@2.77.0
  - @memberjunction/ng-dashboards@2.77.0
  - @memberjunction/ng-entity-form-dialog@2.77.0
  - @memberjunction/ng-explorer-settings@2.77.0
  - @memberjunction/ng-record-changes@2.77.0
  - @memberjunction/ng-shared@2.77.0
  - @memberjunction/ng-user-view-grid@2.77.0
  - @memberjunction/ng-user-view-properties@2.77.0
  - @memberjunction/ng-container-directives@2.77.0
  - @memberjunction/ng-file-storage@2.77.0
  - @memberjunction/ng-query-grid@2.77.0
  - @memberjunction/ng-record-selector@2.77.0
  - @memberjunction/ng-resource-permissions@2.77.0
  - @memberjunction/ng-skip-chat@2.77.0
  - @memberjunction/communication-types@2.77.0
  - @memberjunction/entity-communications-client@2.77.0
  - @memberjunction/templates-base-types@2.77.0
  - @memberjunction/ng-tabstrip@2.77.0
  - @memberjunction/global@2.77.0

## 2.76.0

### Patch Changes

- Updated dependencies [4b27b3c]
- Updated dependencies [7dabb22]
- Updated dependencies [ffda243]
  - @memberjunction/core-entities@2.76.0
  - @memberjunction/core@2.76.0
  - @memberjunction/ng-skip-chat@2.76.0
  - @memberjunction/ng-ask-skip@2.76.0
  - @memberjunction/ng-shared@2.76.0
  - @memberjunction/ng-file-storage@2.76.0
  - @memberjunction/entity-communications-client@2.76.0
  - @memberjunction/ng-dashboards@2.76.0
  - @memberjunction/ng-compare-records@2.76.0
  - @memberjunction/ng-entity-form-dialog@2.76.0
  - @memberjunction/ng-explorer-settings@2.76.0
  - @memberjunction/ng-user-view-grid@2.76.0
  - @memberjunction/ng-user-view-properties@2.76.0
  - @memberjunction/ng-query-grid@2.76.0
  - @memberjunction/ng-record-selector@2.76.0
  - @memberjunction/ng-resource-permissions@2.76.0
  - @memberjunction/communication-types@2.76.0
  - @memberjunction/templates-base-types@2.76.0
  - @memberjunction/ng-auth-services@2.76.0
  - @memberjunction/ng-base-forms@2.76.0
  - @memberjunction/ng-record-changes@2.76.0
  - @memberjunction/ng-container-directives@2.76.0
  - @memberjunction/ng-tabstrip@2.76.0
  - @memberjunction/global@2.76.0

## 2.75.0

### Patch Changes

- Updated dependencies [0da7b51]
- Updated dependencies [b403003]
  - @memberjunction/ng-ask-skip@2.75.0
  - @memberjunction/ng-skip-chat@2.75.0
  - @memberjunction/ng-container-directives@2.75.0
  - @memberjunction/ng-dashboards@2.75.0
  - @memberjunction/ng-shared@2.75.0
  - @memberjunction/ng-file-storage@2.75.0
  - @memberjunction/entity-communications-client@2.75.0
  - @memberjunction/ng-base-forms@2.75.0
  - @memberjunction/ng-entity-form-dialog@2.75.0
  - @memberjunction/ng-explorer-settings@2.75.0
  - @memberjunction/ng-record-changes@2.75.0
  - @memberjunction/ng-user-view-grid@2.75.0
  - @memberjunction/ng-query-grid@2.75.0
  - @memberjunction/ng-record-selector@2.75.0
  - @memberjunction/ng-resource-permissions@2.75.0
  - @memberjunction/ng-tabstrip@2.75.0
  - @memberjunction/ng-user-view-properties@2.75.0
  - @memberjunction/ng-auth-services@2.75.0
  - @memberjunction/ng-compare-records@2.75.0
  - @memberjunction/communication-types@2.75.0
  - @memberjunction/core@2.75.0
  - @memberjunction/core-entities@2.75.0
  - @memberjunction/global@2.75.0
  - @memberjunction/templates-base-types@2.75.0

## 2.74.0

### Patch Changes

- Updated dependencies [b70301e]
- Updated dependencies [d316670]
  - @memberjunction/core-entities@2.74.0
  - @memberjunction/core@2.74.0
  - @memberjunction/ng-ask-skip@2.74.0
  - @memberjunction/ng-compare-records@2.74.0
  - @memberjunction/ng-dashboards@2.74.0
  - @memberjunction/ng-entity-form-dialog@2.74.0
  - @memberjunction/ng-explorer-settings@2.74.0
  - @memberjunction/ng-shared@2.74.0
  - @memberjunction/ng-user-view-grid@2.74.0
  - @memberjunction/ng-user-view-properties@2.74.0
  - @memberjunction/ng-file-storage@2.74.0
  - @memberjunction/ng-query-grid@2.74.0
  - @memberjunction/ng-record-selector@2.74.0
  - @memberjunction/ng-resource-permissions@2.74.0
  - @memberjunction/ng-skip-chat@2.74.0
  - @memberjunction/communication-types@2.74.0
  - @memberjunction/entity-communications-client@2.74.0
  - @memberjunction/templates-base-types@2.74.0
  - @memberjunction/ng-auth-services@2.74.0
  - @memberjunction/ng-base-forms@2.74.0
  - @memberjunction/ng-record-changes@2.74.0
  - @memberjunction/ng-container-directives@2.74.0
  - @memberjunction/ng-tabstrip@2.74.0
  - @memberjunction/global@2.74.0

## 2.73.0

### Patch Changes

- Updated dependencies [e99336f]
  - @memberjunction/core-entities@2.73.0
  - @memberjunction/ng-dashboards@2.73.0
  - @memberjunction/ng-ask-skip@2.73.0
  - @memberjunction/ng-compare-records@2.73.0
  - @memberjunction/ng-entity-form-dialog@2.73.0
  - @memberjunction/ng-explorer-settings@2.73.0
  - @memberjunction/ng-shared@2.73.0
  - @memberjunction/ng-user-view-grid@2.73.0
  - @memberjunction/ng-user-view-properties@2.73.0
  - @memberjunction/ng-file-storage@2.73.0
  - @memberjunction/ng-query-grid@2.73.0
  - @memberjunction/ng-record-selector@2.73.0
  - @memberjunction/ng-resource-permissions@2.73.0
  - @memberjunction/ng-skip-chat@2.73.0
  - @memberjunction/communication-types@2.73.0
  - @memberjunction/entity-communications-client@2.73.0
  - @memberjunction/templates-base-types@2.73.0
  - @memberjunction/ng-record-changes@2.73.0
  - @memberjunction/ng-base-forms@2.73.0
  - @memberjunction/ng-auth-services@2.73.0
  - @memberjunction/ng-container-directives@2.73.0
  - @memberjunction/ng-tabstrip@2.73.0
  - @memberjunction/core@2.73.0
  - @memberjunction/global@2.73.0

## 2.72.0

### Patch Changes

- Updated dependencies [636b6ee]
  - @memberjunction/core-entities@2.72.0
  - @memberjunction/ng-dashboards@2.72.0
  - @memberjunction/ng-ask-skip@2.72.0
  - @memberjunction/ng-compare-records@2.72.0
  - @memberjunction/ng-entity-form-dialog@2.72.0
  - @memberjunction/ng-explorer-settings@2.72.0
  - @memberjunction/ng-shared@2.72.0
  - @memberjunction/ng-user-view-grid@2.72.0
  - @memberjunction/ng-user-view-properties@2.72.0
  - @memberjunction/ng-file-storage@2.72.0
  - @memberjunction/ng-query-grid@2.72.0
  - @memberjunction/ng-record-selector@2.72.0
  - @memberjunction/ng-resource-permissions@2.72.0
  - @memberjunction/ng-skip-chat@2.72.0
  - @memberjunction/communication-types@2.72.0
  - @memberjunction/entity-communications-client@2.72.0
  - @memberjunction/templates-base-types@2.72.0
  - @memberjunction/ng-record-changes@2.72.0
  - @memberjunction/ng-base-forms@2.72.0
  - @memberjunction/ng-auth-services@2.72.0
  - @memberjunction/ng-container-directives@2.72.0
  - @memberjunction/ng-tabstrip@2.72.0
  - @memberjunction/core@2.72.0
  - @memberjunction/global@2.72.0

## 2.71.0

### Patch Changes

- 5a127bb: Remove status badge dots
- Updated dependencies [7f78e3f]
- Updated dependencies [c5a409c]
- Updated dependencies [e75f0a4]
- Updated dependencies [5a127bb]
- Updated dependencies [91188ab]
  - @memberjunction/ng-explorer-settings@2.71.0
  - @memberjunction/global@2.71.0
  - @memberjunction/ng-dashboards@2.71.0
  - @memberjunction/ng-ask-skip@2.71.0
  - @memberjunction/ng-auth-services@2.71.0
  - @memberjunction/ng-base-forms@2.71.0
  - @memberjunction/ng-compare-records@2.71.0
  - @memberjunction/ng-entity-form-dialog@2.71.0
  - @memberjunction/ng-record-changes@2.71.0
  - @memberjunction/ng-shared@2.71.0
  - @memberjunction/ng-user-view-grid@2.71.0
  - @memberjunction/ng-user-view-properties@2.71.0
  - @memberjunction/ng-container-directives@2.71.0
  - @memberjunction/ng-file-storage@2.71.0
  - @memberjunction/ng-query-grid@2.71.0
  - @memberjunction/ng-record-selector@2.71.0
  - @memberjunction/ng-resource-permissions@2.71.0
  - @memberjunction/ng-skip-chat@2.71.0
  - @memberjunction/ng-tabstrip@2.71.0
  - @memberjunction/communication-types@2.71.0
  - @memberjunction/entity-communications-client@2.71.0
  - @memberjunction/core@2.71.0
  - @memberjunction/core-entities@2.71.0
  - @memberjunction/templates-base-types@2.71.0

## 2.70.0

### Patch Changes

- Updated dependencies [6f74409]
- Updated dependencies [c9d86cd]
  - @memberjunction/global@2.70.0
  - @memberjunction/ng-skip-chat@2.70.0
  - @memberjunction/ng-ask-skip@2.70.0
  - @memberjunction/ng-base-forms@2.70.0
  - @memberjunction/ng-entity-form-dialog@2.70.0
  - @memberjunction/ng-explorer-settings@2.70.0
  - @memberjunction/ng-record-changes@2.70.0
  - @memberjunction/ng-user-view-grid@2.70.0
  - @memberjunction/ng-user-view-properties@2.70.0
  - @memberjunction/ng-container-directives@2.70.0
  - @memberjunction/ng-file-storage@2.70.0
  - @memberjunction/ng-query-grid@2.70.0
  - @memberjunction/ng-record-selector@2.70.0
  - @memberjunction/ng-resource-permissions@2.70.0
  - @memberjunction/communication-types@2.70.0
  - @memberjunction/entity-communications-client@2.70.0
  - @memberjunction/core@2.70.0
  - @memberjunction/core-entities@2.70.0
  - @memberjunction/templates-base-types@2.70.0
  - @memberjunction/ng-dashboards@2.70.0
  - @memberjunction/ng-shared@2.70.0
  - @memberjunction/ng-tabstrip@2.70.0
  - @memberjunction/ng-auth-services@2.70.0
  - @memberjunction/ng-compare-records@2.70.0

## 2.69.1

### Patch Changes

- Updated dependencies [2aebdf5]
  - @memberjunction/core@2.69.1
  - @memberjunction/ng-ask-skip@2.69.1
  - @memberjunction/ng-auth-services@2.69.1
  - @memberjunction/ng-base-forms@2.69.1
  - @memberjunction/ng-compare-records@2.69.1
  - @memberjunction/ng-dashboards@2.69.1
  - @memberjunction/ng-entity-form-dialog@2.69.1
  - @memberjunction/ng-explorer-settings@2.69.1
  - @memberjunction/ng-record-changes@2.69.1
  - @memberjunction/ng-shared@2.69.1
  - @memberjunction/ng-user-view-grid@2.69.1
  - @memberjunction/ng-user-view-properties@2.69.1
  - @memberjunction/ng-container-directives@2.69.1
  - @memberjunction/ng-file-storage@2.69.1
  - @memberjunction/ng-query-grid@2.69.1
  - @memberjunction/ng-record-selector@2.69.1
  - @memberjunction/ng-resource-permissions@2.69.1
  - @memberjunction/ng-skip-chat@2.69.1
  - @memberjunction/communication-types@2.69.1
  - @memberjunction/entity-communications-client@2.69.1
  - @memberjunction/core-entities@2.69.1
  - @memberjunction/templates-base-types@2.69.1
  - @memberjunction/ng-tabstrip@2.69.1
  - @memberjunction/global@2.69.1

## 2.69.0

### Patch Changes

- Updated dependencies [79e8509]
  - @memberjunction/core@2.69.0
  - @memberjunction/global@2.69.0
  - @memberjunction/ng-ask-skip@2.69.0
  - @memberjunction/ng-auth-services@2.69.0
  - @memberjunction/ng-base-forms@2.69.0
  - @memberjunction/ng-compare-records@2.69.0
  - @memberjunction/ng-dashboards@2.69.0
  - @memberjunction/ng-entity-form-dialog@2.69.0
  - @memberjunction/ng-explorer-settings@2.69.0
  - @memberjunction/ng-record-changes@2.69.0
  - @memberjunction/ng-shared@2.69.0
  - @memberjunction/ng-user-view-grid@2.69.0
  - @memberjunction/ng-user-view-properties@2.69.0
  - @memberjunction/ng-container-directives@2.69.0
  - @memberjunction/ng-file-storage@2.69.0
  - @memberjunction/ng-query-grid@2.69.0
  - @memberjunction/ng-record-selector@2.69.0
  - @memberjunction/ng-resource-permissions@2.69.0
  - @memberjunction/ng-skip-chat@2.69.0
  - @memberjunction/communication-types@2.69.0
  - @memberjunction/entity-communications-client@2.69.0
  - @memberjunction/core-entities@2.69.0
  - @memberjunction/templates-base-types@2.69.0
  - @memberjunction/ng-tabstrip@2.69.0

## 2.68.0

### Patch Changes

- Updated dependencies [b10b7e6]
- Updated dependencies [a0ed038]
  - @memberjunction/core@2.68.0
  - @memberjunction/ng-ask-skip@2.68.0
  - @memberjunction/ng-skip-chat@2.68.0
  - @memberjunction/ng-auth-services@2.68.0
  - @memberjunction/ng-base-forms@2.68.0
  - @memberjunction/ng-compare-records@2.68.0
  - @memberjunction/ng-dashboards@2.68.0
  - @memberjunction/ng-entity-form-dialog@2.68.0
  - @memberjunction/ng-explorer-settings@2.68.0
  - @memberjunction/ng-record-changes@2.68.0
  - @memberjunction/ng-shared@2.68.0
  - @memberjunction/ng-user-view-grid@2.68.0
  - @memberjunction/ng-user-view-properties@2.68.0
  - @memberjunction/ng-container-directives@2.68.0
  - @memberjunction/ng-file-storage@2.68.0
  - @memberjunction/ng-query-grid@2.68.0
  - @memberjunction/ng-record-selector@2.68.0
  - @memberjunction/ng-resource-permissions@2.68.0
  - @memberjunction/communication-types@2.68.0
  - @memberjunction/entity-communications-client@2.68.0
  - @memberjunction/core-entities@2.68.0
  - @memberjunction/templates-base-types@2.68.0
  - @memberjunction/ng-tabstrip@2.68.0
  - @memberjunction/global@2.68.0

## 2.67.0

### Minor Changes

- d2616ef: migration for workspace item permissions

### Patch Changes

- @memberjunction/ng-ask-skip@2.67.0
- @memberjunction/ng-auth-services@2.67.0
- @memberjunction/ng-base-forms@2.67.0
- @memberjunction/ng-compare-records@2.67.0
- @memberjunction/ng-dashboards@2.67.0
- @memberjunction/ng-entity-form-dialog@2.67.0
- @memberjunction/ng-explorer-settings@2.67.0
- @memberjunction/ng-record-changes@2.67.0
- @memberjunction/ng-shared@2.67.0
- @memberjunction/ng-user-view-grid@2.67.0
- @memberjunction/ng-user-view-properties@2.67.0
- @memberjunction/ng-container-directives@2.67.0
- @memberjunction/ng-file-storage@2.67.0
- @memberjunction/ng-query-grid@2.67.0
- @memberjunction/ng-record-selector@2.67.0
- @memberjunction/ng-resource-permissions@2.67.0
- @memberjunction/ng-skip-chat@2.67.0
- @memberjunction/ng-tabstrip@2.67.0
- @memberjunction/communication-types@2.67.0
- @memberjunction/entity-communications-client@2.67.0
- @memberjunction/core@2.67.0
- @memberjunction/core-entities@2.67.0
- @memberjunction/global@2.67.0
- @memberjunction/templates-base-types@2.67.0

## 2.66.0

### Patch Changes

- @memberjunction/ng-user-view-grid@2.66.0
- @memberjunction/ng-ask-skip@2.66.0
- @memberjunction/ng-skip-chat@2.66.0
- @memberjunction/ng-explorer-settings@2.66.0
- @memberjunction/ng-shared@2.66.0
- @memberjunction/ng-file-storage@2.66.0
- @memberjunction/entity-communications-client@2.66.0
- @memberjunction/ng-dashboards@2.66.0
- @memberjunction/ng-base-forms@2.66.0
- @memberjunction/ng-entity-form-dialog@2.66.0
- @memberjunction/ng-user-view-properties@2.66.0
- @memberjunction/ng-query-grid@2.66.0
- @memberjunction/ng-record-selector@2.66.0
- @memberjunction/ng-record-changes@2.66.0
- @memberjunction/ng-resource-permissions@2.66.0
- @memberjunction/ng-auth-services@2.66.0
- @memberjunction/ng-compare-records@2.66.0
- @memberjunction/ng-container-directives@2.66.0
- @memberjunction/ng-tabstrip@2.66.0
- @memberjunction/communication-types@2.66.0
- @memberjunction/core@2.66.0
- @memberjunction/core-entities@2.66.0
- @memberjunction/global@2.66.0
- @memberjunction/templates-base-types@2.66.0

## 2.65.0

### Patch Changes

- Updated dependencies [619488f]
- Updated dependencies [b029c5d]
  - @memberjunction/global@2.65.0
  - @memberjunction/core-entities@2.65.0
  - @memberjunction/ng-ask-skip@2.65.0
  - @memberjunction/ng-base-forms@2.65.0
  - @memberjunction/ng-entity-form-dialog@2.65.0
  - @memberjunction/ng-explorer-settings@2.65.0
  - @memberjunction/ng-record-changes@2.65.0
  - @memberjunction/ng-user-view-grid@2.65.0
  - @memberjunction/ng-user-view-properties@2.65.0
  - @memberjunction/ng-container-directives@2.65.0
  - @memberjunction/ng-file-storage@2.65.0
  - @memberjunction/ng-query-grid@2.65.0
  - @memberjunction/ng-record-selector@2.65.0
  - @memberjunction/ng-resource-permissions@2.65.0
  - @memberjunction/ng-skip-chat@2.65.0
  - @memberjunction/communication-types@2.65.0
  - @memberjunction/entity-communications-client@2.65.0
  - @memberjunction/core@2.65.0
  - @memberjunction/templates-base-types@2.65.0
  - @memberjunction/ng-compare-records@2.65.0
  - @memberjunction/ng-dashboards@2.65.0
  - @memberjunction/ng-shared@2.65.0
  - @memberjunction/ng-tabstrip@2.65.0
  - @memberjunction/ng-auth-services@2.65.0

## 2.64.0

### Patch Changes

- Updated dependencies [e775f2b]
  - @memberjunction/core-entities@2.64.0
  - @memberjunction/ng-ask-skip@2.64.0
  - @memberjunction/ng-compare-records@2.64.0
  - @memberjunction/ng-dashboards@2.64.0
  - @memberjunction/ng-entity-form-dialog@2.64.0
  - @memberjunction/ng-explorer-settings@2.64.0
  - @memberjunction/ng-shared@2.64.0
  - @memberjunction/ng-user-view-grid@2.64.0
  - @memberjunction/ng-user-view-properties@2.64.0
  - @memberjunction/ng-file-storage@2.64.0
  - @memberjunction/ng-query-grid@2.64.0
  - @memberjunction/ng-record-selector@2.64.0
  - @memberjunction/ng-resource-permissions@2.64.0
  - @memberjunction/ng-skip-chat@2.64.0
  - @memberjunction/communication-types@2.64.0
  - @memberjunction/entity-communications-client@2.64.0
  - @memberjunction/templates-base-types@2.64.0
  - @memberjunction/ng-record-changes@2.64.0
  - @memberjunction/ng-base-forms@2.64.0
  - @memberjunction/ng-auth-services@2.64.0
  - @memberjunction/ng-container-directives@2.64.0
  - @memberjunction/ng-tabstrip@2.64.0
  - @memberjunction/core@2.64.0
  - @memberjunction/global@2.64.0

## 2.63.1

### Patch Changes

- Updated dependencies [59e2c4b]
  - @memberjunction/global@2.63.1
  - @memberjunction/ng-dashboards@2.63.1
  - @memberjunction/ng-ask-skip@2.63.1
  - @memberjunction/ng-base-forms@2.63.1
  - @memberjunction/ng-entity-form-dialog@2.63.1
  - @memberjunction/ng-explorer-settings@2.63.1
  - @memberjunction/ng-record-changes@2.63.1
  - @memberjunction/ng-user-view-grid@2.63.1
  - @memberjunction/ng-user-view-properties@2.63.1
  - @memberjunction/ng-container-directives@2.63.1
  - @memberjunction/ng-file-storage@2.63.1
  - @memberjunction/ng-query-grid@2.63.1
  - @memberjunction/ng-record-selector@2.63.1
  - @memberjunction/ng-resource-permissions@2.63.1
  - @memberjunction/ng-skip-chat@2.63.1
  - @memberjunction/communication-types@2.63.1
  - @memberjunction/entity-communications-client@2.63.1
  - @memberjunction/core@2.63.1
  - @memberjunction/core-entities@2.63.1
  - @memberjunction/templates-base-types@2.63.1
  - @memberjunction/ng-shared@2.63.1
  - @memberjunction/ng-tabstrip@2.63.1
  - @memberjunction/ng-auth-services@2.63.1
  - @memberjunction/ng-compare-records@2.63.1

## 2.63.0

### Patch Changes

- Updated dependencies [28e8a85]
  - @memberjunction/core-entities@2.63.0
  - @memberjunction/ng-dashboards@2.63.0
  - @memberjunction/ng-ask-skip@2.63.0
  - @memberjunction/ng-compare-records@2.63.0
  - @memberjunction/ng-entity-form-dialog@2.63.0
  - @memberjunction/ng-explorer-settings@2.63.0
  - @memberjunction/ng-shared@2.63.0
  - @memberjunction/ng-user-view-grid@2.63.0
  - @memberjunction/ng-user-view-properties@2.63.0
  - @memberjunction/ng-file-storage@2.63.0
  - @memberjunction/ng-query-grid@2.63.0
  - @memberjunction/ng-record-selector@2.63.0
  - @memberjunction/ng-resource-permissions@2.63.0
  - @memberjunction/ng-skip-chat@2.63.0
  - @memberjunction/communication-types@2.63.0
  - @memberjunction/entity-communications-client@2.63.0
  - @memberjunction/templates-base-types@2.63.0
  - @memberjunction/ng-record-changes@2.63.0
  - @memberjunction/ng-base-forms@2.63.0
  - @memberjunction/ng-auth-services@2.63.0
  - @memberjunction/ng-container-directives@2.63.0
  - @memberjunction/ng-tabstrip@2.63.0
  - @memberjunction/core@2.63.0
  - @memberjunction/global@2.63.0

## 2.62.0

### Patch Changes

- Updated dependencies [c995603]
  - @memberjunction/core-entities@2.62.0
  - @memberjunction/ng-ask-skip@2.62.0
  - @memberjunction/ng-compare-records@2.62.0
  - @memberjunction/ng-dashboards@2.62.0
  - @memberjunction/ng-entity-form-dialog@2.62.0
  - @memberjunction/ng-explorer-settings@2.62.0
  - @memberjunction/ng-shared@2.62.0
  - @memberjunction/ng-user-view-grid@2.62.0
  - @memberjunction/ng-user-view-properties@2.62.0
  - @memberjunction/ng-file-storage@2.62.0
  - @memberjunction/ng-query-grid@2.62.0
  - @memberjunction/ng-record-selector@2.62.0
  - @memberjunction/ng-resource-permissions@2.62.0
  - @memberjunction/ng-skip-chat@2.62.0
  - @memberjunction/communication-types@2.62.0
  - @memberjunction/entity-communications-client@2.62.0
  - @memberjunction/templates-base-types@2.62.0
  - @memberjunction/ng-record-changes@2.62.0
  - @memberjunction/ng-base-forms@2.62.0
  - @memberjunction/ng-auth-services@2.62.0
  - @memberjunction/ng-container-directives@2.62.0
  - @memberjunction/ng-tabstrip@2.62.0
  - @memberjunction/core@2.62.0
  - @memberjunction/global@2.62.0

## 2.61.0

### Patch Changes

- @memberjunction/ng-dashboards@2.61.0
- @memberjunction/ng-ask-skip@2.61.0
- @memberjunction/ng-auth-services@2.61.0
- @memberjunction/ng-base-forms@2.61.0
- @memberjunction/ng-compare-records@2.61.0
- @memberjunction/ng-entity-form-dialog@2.61.0
- @memberjunction/ng-explorer-settings@2.61.0
- @memberjunction/ng-record-changes@2.61.0
- @memberjunction/ng-shared@2.61.0
- @memberjunction/ng-user-view-grid@2.61.0
- @memberjunction/ng-user-view-properties@2.61.0
- @memberjunction/ng-container-directives@2.61.0
- @memberjunction/ng-file-storage@2.61.0
- @memberjunction/ng-query-grid@2.61.0
- @memberjunction/ng-record-selector@2.61.0
- @memberjunction/ng-resource-permissions@2.61.0
- @memberjunction/ng-skip-chat@2.61.0
- @memberjunction/ng-tabstrip@2.61.0
- @memberjunction/communication-types@2.61.0
- @memberjunction/entity-communications-client@2.61.0
- @memberjunction/core@2.61.0
- @memberjunction/core-entities@2.61.0
- @memberjunction/global@2.61.0
- @memberjunction/templates-base-types@2.61.0

## 2.60.0

### Patch Changes

- Updated dependencies [b5fa80a]
- Updated dependencies [e30ee12]
- Updated dependencies [e512e4e]
  - @memberjunction/core@2.60.0
  - @memberjunction/core-entities@2.60.0
  - @memberjunction/ng-ask-skip@2.60.0
  - @memberjunction/ng-auth-services@2.60.0
  - @memberjunction/ng-base-forms@2.60.0
  - @memberjunction/ng-compare-records@2.60.0
  - @memberjunction/ng-dashboards@2.60.0
  - @memberjunction/ng-entity-form-dialog@2.60.0
  - @memberjunction/ng-explorer-settings@2.60.0
  - @memberjunction/ng-record-changes@2.60.0
  - @memberjunction/ng-shared@2.60.0
  - @memberjunction/ng-user-view-grid@2.60.0
  - @memberjunction/ng-user-view-properties@2.60.0
  - @memberjunction/ng-container-directives@2.60.0
  - @memberjunction/ng-file-storage@2.60.0
  - @memberjunction/ng-query-grid@2.60.0
  - @memberjunction/ng-record-selector@2.60.0
  - @memberjunction/ng-resource-permissions@2.60.0
  - @memberjunction/ng-skip-chat@2.60.0
  - @memberjunction/communication-types@2.60.0
  - @memberjunction/entity-communications-client@2.60.0
  - @memberjunction/templates-base-types@2.60.0
  - @memberjunction/ng-tabstrip@2.60.0
  - @memberjunction/global@2.60.0

## 2.59.0

### Patch Changes

- @memberjunction/ng-dashboards@2.59.0
- @memberjunction/ng-ask-skip@2.59.0
- @memberjunction/ng-auth-services@2.59.0
- @memberjunction/ng-base-forms@2.59.0
- @memberjunction/ng-compare-records@2.59.0
- @memberjunction/ng-entity-form-dialog@2.59.0
- @memberjunction/ng-explorer-settings@2.59.0
- @memberjunction/ng-record-changes@2.59.0
- @memberjunction/ng-shared@2.59.0
- @memberjunction/ng-user-view-grid@2.59.0
- @memberjunction/ng-user-view-properties@2.59.0
- @memberjunction/ng-container-directives@2.59.0
- @memberjunction/ng-file-storage@2.59.0
- @memberjunction/ng-query-grid@2.59.0
- @memberjunction/ng-record-selector@2.59.0
- @memberjunction/ng-resource-permissions@2.59.0
- @memberjunction/ng-skip-chat@2.59.0
- @memberjunction/ng-tabstrip@2.59.0
- @memberjunction/communication-types@2.59.0
- @memberjunction/entity-communications-client@2.59.0
- @memberjunction/core@2.59.0
- @memberjunction/core-entities@2.59.0
- @memberjunction/global@2.59.0
- @memberjunction/templates-base-types@2.59.0

## 2.58.0

### Patch Changes

- Updated dependencies [def26fe]
  - @memberjunction/core@2.58.0
  - @memberjunction/ng-ask-skip@2.58.0
  - @memberjunction/ng-auth-services@2.58.0
  - @memberjunction/ng-base-forms@2.58.0
  - @memberjunction/ng-compare-records@2.58.0
  - @memberjunction/ng-dashboards@2.58.0
  - @memberjunction/ng-entity-form-dialog@2.58.0
  - @memberjunction/ng-explorer-settings@2.58.0
  - @memberjunction/ng-record-changes@2.58.0
  - @memberjunction/ng-shared@2.58.0
  - @memberjunction/ng-user-view-grid@2.58.0
  - @memberjunction/ng-user-view-properties@2.58.0
  - @memberjunction/ng-container-directives@2.58.0
  - @memberjunction/ng-file-storage@2.58.0
  - @memberjunction/ng-query-grid@2.58.0
  - @memberjunction/ng-record-selector@2.58.0
  - @memberjunction/ng-resource-permissions@2.58.0
  - @memberjunction/ng-skip-chat@2.58.0
  - @memberjunction/communication-types@2.58.0
  - @memberjunction/entity-communications-client@2.58.0
  - @memberjunction/core-entities@2.58.0
  - @memberjunction/templates-base-types@2.58.0
  - @memberjunction/ng-tabstrip@2.58.0
  - @memberjunction/global@2.58.0

## 2.57.0

### Patch Changes

- Updated dependencies [0ba485f]
  - @memberjunction/core@2.57.0
  - @memberjunction/core-entities@2.57.0
  - @memberjunction/global@2.57.0
  - @memberjunction/ng-dashboards@2.57.0
  - @memberjunction/ng-ask-skip@2.57.0
  - @memberjunction/ng-auth-services@2.57.0
  - @memberjunction/ng-base-forms@2.57.0
  - @memberjunction/ng-compare-records@2.57.0
  - @memberjunction/ng-entity-form-dialog@2.57.0
  - @memberjunction/ng-explorer-settings@2.57.0
  - @memberjunction/ng-record-changes@2.57.0
  - @memberjunction/ng-shared@2.57.0
  - @memberjunction/ng-user-view-grid@2.57.0
  - @memberjunction/ng-user-view-properties@2.57.0
  - @memberjunction/ng-container-directives@2.57.0
  - @memberjunction/ng-file-storage@2.57.0
  - @memberjunction/ng-query-grid@2.57.0
  - @memberjunction/ng-record-selector@2.57.0
  - @memberjunction/ng-resource-permissions@2.57.0
  - @memberjunction/ng-skip-chat@2.57.0
  - @memberjunction/communication-types@2.57.0
  - @memberjunction/entity-communications-client@2.57.0
  - @memberjunction/templates-base-types@2.57.0
  - @memberjunction/ng-tabstrip@2.57.0

## 2.56.0

### Minor Changes

- bf24cae: Various

### Patch Changes

- Updated dependencies [bf24cae]
  - @memberjunction/core-entities@2.56.0
  - @memberjunction/ng-dashboards@2.56.0
  - @memberjunction/ng-ask-skip@2.56.0
  - @memberjunction/ng-compare-records@2.56.0
  - @memberjunction/ng-entity-form-dialog@2.56.0
  - @memberjunction/ng-explorer-settings@2.56.0
  - @memberjunction/ng-shared@2.56.0
  - @memberjunction/ng-user-view-grid@2.56.0
  - @memberjunction/ng-user-view-properties@2.56.0
  - @memberjunction/ng-file-storage@2.56.0
  - @memberjunction/ng-query-grid@2.56.0
  - @memberjunction/ng-record-selector@2.56.0
  - @memberjunction/ng-resource-permissions@2.56.0
  - @memberjunction/ng-skip-chat@2.56.0
  - @memberjunction/communication-types@2.56.0
  - @memberjunction/entity-communications-client@2.56.0
  - @memberjunction/templates-base-types@2.56.0
  - @memberjunction/ng-record-changes@2.56.0
  - @memberjunction/ng-base-forms@2.56.0
  - @memberjunction/ng-auth-services@2.56.0
  - @memberjunction/ng-container-directives@2.56.0
  - @memberjunction/ng-tabstrip@2.56.0
  - @memberjunction/core@2.56.0
  - @memberjunction/global@2.56.0

## 2.55.0

### Minor Changes

- 659f892: Various

### Patch Changes

- Updated dependencies [659f892]
  - @memberjunction/core-entities@2.55.0
  - @memberjunction/ng-dashboards@2.55.0
  - @memberjunction/ng-ask-skip@2.55.0
  - @memberjunction/ng-compare-records@2.55.0
  - @memberjunction/ng-entity-form-dialog@2.55.0
  - @memberjunction/ng-explorer-settings@2.55.0
  - @memberjunction/ng-shared@2.55.0
  - @memberjunction/ng-user-view-grid@2.55.0
  - @memberjunction/ng-user-view-properties@2.55.0
  - @memberjunction/ng-file-storage@2.55.0
  - @memberjunction/ng-query-grid@2.55.0
  - @memberjunction/ng-record-selector@2.55.0
  - @memberjunction/ng-resource-permissions@2.55.0
  - @memberjunction/ng-skip-chat@2.55.0
  - @memberjunction/communication-types@2.55.0
  - @memberjunction/entity-communications-client@2.55.0
  - @memberjunction/templates-base-types@2.55.0
  - @memberjunction/ng-record-changes@2.55.0
  - @memberjunction/ng-base-forms@2.55.0
  - @memberjunction/ng-auth-services@2.55.0
  - @memberjunction/ng-container-directives@2.55.0
  - @memberjunction/ng-tabstrip@2.55.0
  - @memberjunction/core@2.55.0
  - @memberjunction/global@2.55.0

## 2.54.0

### Patch Changes

- cc9daf7: tweaks to UI
- Updated dependencies [20f424d]
- Updated dependencies [b21ba9e]
  - @memberjunction/core@2.54.0
  - @memberjunction/ng-ask-skip@2.54.0
  - @memberjunction/ng-dashboards@2.54.0
  - @memberjunction/ng-tabstrip@2.54.0
  - @memberjunction/ng-auth-services@2.54.0
  - @memberjunction/ng-base-forms@2.54.0
  - @memberjunction/ng-compare-records@2.54.0
  - @memberjunction/ng-entity-form-dialog@2.54.0
  - @memberjunction/ng-explorer-settings@2.54.0
  - @memberjunction/ng-record-changes@2.54.0
  - @memberjunction/ng-shared@2.54.0
  - @memberjunction/ng-user-view-grid@2.54.0
  - @memberjunction/ng-user-view-properties@2.54.0
  - @memberjunction/ng-container-directives@2.54.0
  - @memberjunction/ng-file-storage@2.54.0
  - @memberjunction/ng-query-grid@2.54.0
  - @memberjunction/ng-record-selector@2.54.0
  - @memberjunction/ng-resource-permissions@2.54.0
  - @memberjunction/ng-skip-chat@2.54.0
  - @memberjunction/communication-types@2.54.0
  - @memberjunction/entity-communications-client@2.54.0
  - @memberjunction/core-entities@2.54.0
  - @memberjunction/templates-base-types@2.54.0
  - @memberjunction/global@2.54.0

## 2.53.0

### Minor Changes

- e00127a: added services and system-validation directories to the explorer core package. To these we can components that perform different validation checks when we boot up MJ. The specific error tackled in the PR is the case where a User logs in but has not Roles. Previously we would get a cryptic "Resource Types not Found" error that failed to indicate what the actual problem was, and how in that case we get a banner indicating the lack of roles for the user.

### Patch Changes

- 51fe03b: This PR introduces comprehensive UI enhancements and responsive design improvements to the MemberJunction platform. The changes focus on modernizing the user interface, improving mobile responsiveness, standardizing Kendo UI styling, and creating a cohesive design system.
- Updated dependencies [bddc4ea]
- Updated dependencies [51fe03b]
  - @memberjunction/core@2.53.0
  - @memberjunction/core-entities@2.53.0
  - @memberjunction/ng-container-directives@2.53.0
  - @memberjunction/ng-skip-chat@2.53.0
  - @memberjunction/ng-tabstrip@2.53.0
  - @memberjunction/ng-ask-skip@2.53.0
  - @memberjunction/ng-auth-services@2.53.0
  - @memberjunction/ng-base-forms@2.53.0
  - @memberjunction/ng-compare-records@2.53.0
  - @memberjunction/ng-dashboards@2.53.0
  - @memberjunction/ng-entity-form-dialog@2.53.0
  - @memberjunction/ng-explorer-settings@2.53.0
  - @memberjunction/ng-record-changes@2.53.0
  - @memberjunction/ng-shared@2.53.0
  - @memberjunction/ng-user-view-grid@2.53.0
  - @memberjunction/ng-user-view-properties@2.53.0
  - @memberjunction/ng-file-storage@2.53.0
  - @memberjunction/ng-query-grid@2.53.0
  - @memberjunction/ng-record-selector@2.53.0
  - @memberjunction/ng-resource-permissions@2.53.0
  - @memberjunction/communication-types@2.53.0
  - @memberjunction/entity-communications-client@2.53.0
  - @memberjunction/templates-base-types@2.53.0
  - @memberjunction/global@2.53.0

## 2.52.0

### Patch Changes

- Updated dependencies [e926106]
- Updated dependencies [d6f88c1]
  - @memberjunction/core@2.52.0
  - @memberjunction/core-entities@2.52.0
  - @memberjunction/ng-dashboards@2.52.0
  - @memberjunction/ng-ask-skip@2.52.0
  - @memberjunction/ng-auth-services@2.52.0
  - @memberjunction/ng-base-forms@2.52.0
  - @memberjunction/ng-compare-records@2.52.0
  - @memberjunction/ng-entity-form-dialog@2.52.0
  - @memberjunction/ng-explorer-settings@2.52.0
  - @memberjunction/ng-record-changes@2.52.0
  - @memberjunction/ng-shared@2.52.0
  - @memberjunction/ng-user-view-grid@2.52.0
  - @memberjunction/ng-user-view-properties@2.52.0
  - @memberjunction/ng-container-directives@2.52.0
  - @memberjunction/ng-file-storage@2.52.0
  - @memberjunction/ng-query-grid@2.52.0
  - @memberjunction/ng-record-selector@2.52.0
  - @memberjunction/ng-resource-permissions@2.52.0
  - @memberjunction/ng-skip-chat@2.52.0
  - @memberjunction/communication-types@2.52.0
  - @memberjunction/entity-communications-client@2.52.0
  - @memberjunction/templates-base-types@2.52.0
  - @memberjunction/ng-tabstrip@2.52.0
  - @memberjunction/global@2.52.0

## 2.51.0

### Minor Changes

- 7a9b88e: AI Improvements

### Patch Changes

- Updated dependencies [7a9b88e]
- Updated dependencies [53f8167]
  - @memberjunction/core@2.51.0
  - @memberjunction/core-entities@2.51.0
  - @memberjunction/ng-ask-skip@2.51.0
  - @memberjunction/ng-auth-services@2.51.0
  - @memberjunction/ng-base-forms@2.51.0
  - @memberjunction/ng-compare-records@2.51.0
  - @memberjunction/ng-dashboards@2.51.0
  - @memberjunction/ng-entity-form-dialog@2.51.0
  - @memberjunction/ng-explorer-settings@2.51.0
  - @memberjunction/ng-record-changes@2.51.0
  - @memberjunction/ng-shared@2.51.0
  - @memberjunction/ng-user-view-grid@2.51.0
  - @memberjunction/ng-user-view-properties@2.51.0
  - @memberjunction/ng-container-directives@2.51.0
  - @memberjunction/ng-file-storage@2.51.0
  - @memberjunction/ng-query-grid@2.51.0
  - @memberjunction/ng-record-selector@2.51.0
  - @memberjunction/ng-resource-permissions@2.51.0
  - @memberjunction/ng-skip-chat@2.51.0
  - @memberjunction/communication-types@2.51.0
  - @memberjunction/entity-communications-client@2.51.0
  - @memberjunction/templates-base-types@2.51.0
  - @memberjunction/ng-tabstrip@2.51.0
  - @memberjunction/global@2.51.0

## 2.50.0

### Patch Changes

- @memberjunction/ng-ask-skip@2.50.0
- @memberjunction/ng-auth-services@2.50.0
- @memberjunction/ng-base-forms@2.50.0
- @memberjunction/ng-compare-records@2.50.0
- @memberjunction/ng-dashboards@2.50.0
- @memberjunction/ng-entity-form-dialog@2.50.0
- @memberjunction/ng-explorer-settings@2.50.0
- @memberjunction/ng-record-changes@2.50.0
- @memberjunction/ng-shared@2.50.0
- @memberjunction/ng-user-view-grid@2.50.0
- @memberjunction/ng-user-view-properties@2.50.0
- @memberjunction/ng-container-directives@2.50.0
- @memberjunction/ng-file-storage@2.50.0
- @memberjunction/ng-query-grid@2.50.0
- @memberjunction/ng-record-selector@2.50.0
- @memberjunction/ng-resource-permissions@2.50.0
- @memberjunction/ng-skip-chat@2.50.0
- @memberjunction/ng-tabstrip@2.50.0
- @memberjunction/communication-types@2.50.0
- @memberjunction/entity-communications-client@2.50.0
- @memberjunction/core@2.50.0
- @memberjunction/core-entities@2.50.0
- @memberjunction/global@2.50.0
- @memberjunction/templates-base-types@2.50.0

## 2.49.0

### Minor Changes

- b5d9fbd: Actions system improvements/metadata
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
  - @memberjunction/ng-dashboards@2.49.0
  - @memberjunction/ng-ask-skip@2.49.0
  - @memberjunction/ng-auth-services@2.49.0
  - @memberjunction/ng-base-forms@2.49.0
  - @memberjunction/ng-compare-records@2.49.0
  - @memberjunction/ng-entity-form-dialog@2.49.0
  - @memberjunction/ng-explorer-settings@2.49.0
  - @memberjunction/ng-record-changes@2.49.0
  - @memberjunction/ng-shared@2.49.0
  - @memberjunction/ng-user-view-grid@2.49.0
  - @memberjunction/ng-user-view-properties@2.49.0
  - @memberjunction/ng-container-directives@2.49.0
  - @memberjunction/ng-file-storage@2.49.0
  - @memberjunction/ng-query-grid@2.49.0
  - @memberjunction/ng-record-selector@2.49.0
  - @memberjunction/ng-resource-permissions@2.49.0
  - @memberjunction/ng-skip-chat@2.49.0
  - @memberjunction/ng-tabstrip@2.49.0
  - @memberjunction/communication-types@2.49.0
  - @memberjunction/entity-communications-client@2.49.0
  - @memberjunction/templates-base-types@2.49.0

## 2.48.0

### Patch Changes

- Updated dependencies [e49a91a]
- Updated dependencies [bb01fcf]
- Updated dependencies [031e724]
  - @memberjunction/ng-ask-skip@2.48.0
  - @memberjunction/ng-skip-chat@2.48.0
  - @memberjunction/core@2.48.0
  - @memberjunction/core-entities@2.48.0
  - @memberjunction/ng-auth-services@2.48.0
  - @memberjunction/ng-base-forms@2.48.0
  - @memberjunction/ng-compare-records@2.48.0
  - @memberjunction/ng-dashboards@2.48.0
  - @memberjunction/ng-entity-form-dialog@2.48.0
  - @memberjunction/ng-explorer-settings@2.48.0
  - @memberjunction/ng-record-changes@2.48.0
  - @memberjunction/ng-shared@2.48.0
  - @memberjunction/ng-user-view-grid@2.48.0
  - @memberjunction/ng-user-view-properties@2.48.0
  - @memberjunction/ng-container-directives@2.48.0
  - @memberjunction/ng-file-storage@2.48.0
  - @memberjunction/ng-query-grid@2.48.0
  - @memberjunction/ng-record-selector@2.48.0
  - @memberjunction/ng-resource-permissions@2.48.0
  - @memberjunction/communication-types@2.48.0
  - @memberjunction/entity-communications-client@2.48.0
  - @memberjunction/templates-base-types@2.48.0
  - @memberjunction/ng-tabstrip@2.48.0
  - @memberjunction/global@2.48.0

## 2.47.0

### Patch Changes

- @memberjunction/ng-ask-skip@2.47.0
- @memberjunction/ng-auth-services@2.47.0
- @memberjunction/ng-base-forms@2.47.0
- @memberjunction/ng-compare-records@2.47.0
- @memberjunction/ng-dashboards@2.47.0
- @memberjunction/ng-entity-form-dialog@2.47.0
- @memberjunction/ng-explorer-settings@2.47.0
- @memberjunction/ng-record-changes@2.47.0
- @memberjunction/ng-shared@2.47.0
- @memberjunction/ng-user-view-grid@2.47.0
- @memberjunction/ng-user-view-properties@2.47.0
- @memberjunction/ng-container-directives@2.47.0
- @memberjunction/ng-file-storage@2.47.0
- @memberjunction/ng-query-grid@2.47.0
- @memberjunction/ng-record-selector@2.47.0
- @memberjunction/ng-resource-permissions@2.47.0
- @memberjunction/ng-skip-chat@2.47.0
- @memberjunction/ng-tabstrip@2.47.0
- @memberjunction/communication-types@2.47.0
- @memberjunction/entity-communications-client@2.47.0
- @memberjunction/core@2.47.0
- @memberjunction/core-entities@2.47.0
- @memberjunction/global@2.47.0
- @memberjunction/templates-base-types@2.47.0

## 2.46.0

### Patch Changes

- @memberjunction/ng-ask-skip@2.46.0
- @memberjunction/ng-auth-services@2.46.0
- @memberjunction/ng-base-forms@2.46.0
- @memberjunction/ng-compare-records@2.46.0
- @memberjunction/ng-dashboards@2.46.0
- @memberjunction/ng-entity-form-dialog@2.46.0
- @memberjunction/ng-explorer-settings@2.46.0
- @memberjunction/ng-record-changes@2.46.0
- @memberjunction/ng-shared@2.46.0
- @memberjunction/ng-user-view-grid@2.46.0
- @memberjunction/ng-user-view-properties@2.46.0
- @memberjunction/ng-container-directives@2.46.0
- @memberjunction/ng-file-storage@2.46.0
- @memberjunction/ng-query-grid@2.46.0
- @memberjunction/ng-record-selector@2.46.0
- @memberjunction/ng-resource-permissions@2.46.0
- @memberjunction/ng-skip-chat@2.46.0
- @memberjunction/ng-tabstrip@2.46.0
- @memberjunction/communication-types@2.46.0
- @memberjunction/entity-communications-client@2.46.0
- @memberjunction/core@2.46.0
- @memberjunction/core-entities@2.46.0
- @memberjunction/global@2.46.0
- @memberjunction/templates-base-types@2.46.0

## 2.45.0

### Patch Changes

- Updated dependencies [5f23c1f]
- Updated dependencies [96c06dd]
- Updated dependencies [253de13]
- Updated dependencies [63f57f1]
- Updated dependencies [bbd9064]
- Updated dependencies [556ee8d]
- Updated dependencies [00bb82c]
  - @memberjunction/ng-skip-chat@2.45.0
  - @memberjunction/core-entities@2.45.0
  - @memberjunction/ng-ask-skip@2.45.0
  - @memberjunction/ng-compare-records@2.45.0
  - @memberjunction/ng-dashboards@2.45.0
  - @memberjunction/ng-entity-form-dialog@2.45.0
  - @memberjunction/ng-explorer-settings@2.45.0
  - @memberjunction/ng-shared@2.45.0
  - @memberjunction/ng-user-view-grid@2.45.0
  - @memberjunction/ng-user-view-properties@2.45.0
  - @memberjunction/ng-file-storage@2.45.0
  - @memberjunction/ng-query-grid@2.45.0
  - @memberjunction/ng-record-selector@2.45.0
  - @memberjunction/ng-resource-permissions@2.45.0
  - @memberjunction/communication-types@2.45.0
  - @memberjunction/entity-communications-client@2.45.0
  - @memberjunction/templates-base-types@2.45.0
  - @memberjunction/ng-record-changes@2.45.0
  - @memberjunction/ng-base-forms@2.45.0
  - @memberjunction/ng-auth-services@2.45.0
  - @memberjunction/ng-container-directives@2.45.0
  - @memberjunction/ng-tabstrip@2.45.0
  - @memberjunction/core@2.45.0
  - @memberjunction/global@2.45.0

## 2.44.0

### Minor Changes

- 091c5f6: Align Entity Field sequence ordering with base views for core entities.

### Patch Changes

- fbc30dc: Documentation
- Updated dependencies [fbc30dc]
- Updated dependencies [99b27c5]
- Updated dependencies [091c5f6]
  - @memberjunction/core@2.44.0
  - @memberjunction/core-entities@2.44.0
  - @memberjunction/templates-base-types@2.44.0
  - @memberjunction/ng-ask-skip@2.44.0
  - @memberjunction/ng-auth-services@2.44.0
  - @memberjunction/ng-base-forms@2.44.0
  - @memberjunction/ng-compare-records@2.44.0
  - @memberjunction/ng-dashboards@2.44.0
  - @memberjunction/ng-entity-form-dialog@2.44.0
  - @memberjunction/ng-explorer-settings@2.44.0
  - @memberjunction/ng-record-changes@2.44.0
  - @memberjunction/ng-shared@2.44.0
  - @memberjunction/ng-user-view-grid@2.44.0
  - @memberjunction/ng-user-view-properties@2.44.0
  - @memberjunction/ng-container-directives@2.44.0
  - @memberjunction/ng-file-storage@2.44.0
  - @memberjunction/ng-query-grid@2.44.0
  - @memberjunction/ng-record-selector@2.44.0
  - @memberjunction/ng-resource-permissions@2.44.0
  - @memberjunction/ng-skip-chat@2.44.0
  - @memberjunction/communication-types@2.44.0
  - @memberjunction/entity-communications-client@2.44.0
  - @memberjunction/ng-tabstrip@2.44.0
  - @memberjunction/global@2.44.0

## 2.43.0

### Patch Changes

- Updated dependencies [1629c04]
  - @memberjunction/core@2.43.0
  - @memberjunction/ng-ask-skip@2.43.0
  - @memberjunction/ng-auth-services@2.43.0
  - @memberjunction/ng-base-forms@2.43.0
  - @memberjunction/ng-compare-records@2.43.0
  - @memberjunction/ng-dashboards@2.43.0
  - @memberjunction/ng-entity-form-dialog@2.43.0
  - @memberjunction/ng-explorer-settings@2.43.0
  - @memberjunction/ng-record-changes@2.43.0
  - @memberjunction/ng-shared@2.43.0
  - @memberjunction/ng-user-view-grid@2.43.0
  - @memberjunction/ng-user-view-properties@2.43.0
  - @memberjunction/ng-container-directives@2.43.0
  - @memberjunction/ng-file-storage@2.43.0
  - @memberjunction/ng-query-grid@2.43.0
  - @memberjunction/ng-record-selector@2.43.0
  - @memberjunction/ng-resource-permissions@2.43.0
  - @memberjunction/ng-skip-chat@2.43.0
  - @memberjunction/communication-types@2.43.0
  - @memberjunction/entity-communications-client@2.43.0
  - @memberjunction/core-entities@2.43.0
  - @memberjunction/templates-base-types@2.43.0
  - @memberjunction/ng-tabstrip@2.43.0
  - @memberjunction/global@2.43.0

## 2.42.1

### Patch Changes

- bd36dce: User Prefs Dialog for Dashboards
- Updated dependencies [f5da874]
  - @memberjunction/ng-record-changes@2.42.1
  - @memberjunction/ng-base-forms@2.42.1
  - @memberjunction/ng-entity-form-dialog@2.42.1
  - @memberjunction/ng-explorer-settings@2.42.1
  - @memberjunction/ng-user-view-properties@2.42.1
  - @memberjunction/ng-user-view-grid@2.42.1
  - @memberjunction/ng-ask-skip@2.42.1
  - @memberjunction/ng-auth-services@2.42.1
  - @memberjunction/ng-compare-records@2.42.1
  - @memberjunction/ng-dashboards@2.42.1
  - @memberjunction/ng-shared@2.42.1
  - @memberjunction/ng-container-directives@2.42.1
  - @memberjunction/ng-file-storage@2.42.1
  - @memberjunction/ng-query-grid@2.42.1
  - @memberjunction/ng-record-selector@2.42.1
  - @memberjunction/ng-resource-permissions@2.42.1
  - @memberjunction/ng-skip-chat@2.42.1
  - @memberjunction/ng-tabstrip@2.42.1
  - @memberjunction/communication-types@2.42.1
  - @memberjunction/entity-communications-client@2.42.1
  - @memberjunction/core@2.42.1
  - @memberjunction/core-entities@2.42.1
  - @memberjunction/global@2.42.1
  - @memberjunction/templates-base-types@2.42.1

## 2.42.0

### Minor Changes

- d49f25c: Key Areas Addressed:

### Patch Changes

- Updated dependencies [5a3466c]
- Updated dependencies [d49f25c]
  - @memberjunction/ng-skip-chat@2.42.0
  - @memberjunction/ng-dashboards@2.42.0
  - @memberjunction/ng-ask-skip@2.42.0
  - @memberjunction/ng-auth-services@2.42.0
  - @memberjunction/ng-base-forms@2.42.0
  - @memberjunction/ng-compare-records@2.42.0
  - @memberjunction/ng-entity-form-dialog@2.42.0
  - @memberjunction/ng-explorer-settings@2.42.0
  - @memberjunction/ng-record-changes@2.42.0
  - @memberjunction/ng-shared@2.42.0
  - @memberjunction/ng-user-view-grid@2.42.0
  - @memberjunction/ng-user-view-properties@2.42.0
  - @memberjunction/ng-container-directives@2.42.0
  - @memberjunction/ng-file-storage@2.42.0
  - @memberjunction/ng-query-grid@2.42.0
  - @memberjunction/ng-record-selector@2.42.0
  - @memberjunction/ng-resource-permissions@2.42.0
  - @memberjunction/ng-tabstrip@2.42.0
  - @memberjunction/communication-types@2.42.0
  - @memberjunction/entity-communications-client@2.42.0
  - @memberjunction/core@2.42.0
  - @memberjunction/core-entities@2.42.0
  - @memberjunction/global@2.42.0
  - @memberjunction/templates-base-types@2.42.0

## 2.41.0

### Patch Changes

- Updated dependencies [3be3f71]
- Updated dependencies [7e0523d]
  - @memberjunction/core@2.41.0
  - @memberjunction/ng-skip-chat@2.41.0
  - @memberjunction/core-entities@2.41.0
  - @memberjunction/ng-ask-skip@2.41.0
  - @memberjunction/ng-auth-services@2.41.0
  - @memberjunction/ng-base-forms@2.41.0
  - @memberjunction/ng-compare-records@2.41.0
  - @memberjunction/ng-entity-form-dialog@2.41.0
  - @memberjunction/ng-explorer-settings@2.41.0
  - @memberjunction/ng-record-changes@2.41.0
  - @memberjunction/ng-shared@2.41.0
  - @memberjunction/ng-user-view-grid@2.41.0
  - @memberjunction/ng-user-view-properties@2.41.0
  - @memberjunction/ng-container-directives@2.41.0
  - @memberjunction/ng-file-storage@2.41.0
  - @memberjunction/ng-query-grid@2.41.0
  - @memberjunction/ng-record-selector@2.41.0
  - @memberjunction/ng-resource-permissions@2.41.0
  - @memberjunction/communication-types@2.41.0
  - @memberjunction/entity-communications-client@2.41.0
  - @memberjunction/templates-base-types@2.41.0
  - @memberjunction/ng-tabstrip@2.41.0
  - @memberjunction/global@2.41.0

## 2.40.0

### Patch Changes

- Updated dependencies [2309d02]
  - @memberjunction/ng-skip-chat@2.40.0
  - @memberjunction/ng-ask-skip@2.40.0
  - @memberjunction/ng-auth-services@2.40.0
  - @memberjunction/ng-base-forms@2.40.0
  - @memberjunction/ng-compare-records@2.40.0
  - @memberjunction/ng-entity-form-dialog@2.40.0
  - @memberjunction/ng-explorer-settings@2.40.0
  - @memberjunction/ng-record-changes@2.40.0
  - @memberjunction/ng-shared@2.40.0
  - @memberjunction/ng-user-view-grid@2.40.0
  - @memberjunction/ng-user-view-properties@2.40.0
  - @memberjunction/ng-container-directives@2.40.0
  - @memberjunction/ng-file-storage@2.40.0
  - @memberjunction/ng-query-grid@2.40.0
  - @memberjunction/ng-record-selector@2.40.0
  - @memberjunction/ng-resource-permissions@2.40.0
  - @memberjunction/ng-tabstrip@2.40.0
  - @memberjunction/communication-types@2.40.0
  - @memberjunction/entity-communications-client@2.40.0
  - @memberjunction/core@2.40.0
  - @memberjunction/core-entities@2.40.0
  - @memberjunction/global@2.40.0
  - @memberjunction/templates-base-types@2.40.0

## 2.39.0

### Patch Changes

- Updated dependencies [945e538]
- Updated dependencies [ae338ac]
- Updated dependencies [c9ccc36]
  - @memberjunction/ng-skip-chat@2.39.0
  - @memberjunction/ng-ask-skip@2.39.0
  - @memberjunction/core-entities@2.39.0
  - @memberjunction/ng-compare-records@2.39.0
  - @memberjunction/ng-entity-form-dialog@2.39.0
  - @memberjunction/ng-explorer-settings@2.39.0
  - @memberjunction/ng-shared@2.39.0
  - @memberjunction/ng-user-view-grid@2.39.0
  - @memberjunction/ng-user-view-properties@2.39.0
  - @memberjunction/ng-file-storage@2.39.0
  - @memberjunction/ng-query-grid@2.39.0
  - @memberjunction/ng-record-selector@2.39.0
  - @memberjunction/ng-resource-permissions@2.39.0
  - @memberjunction/communication-types@2.39.0
  - @memberjunction/entity-communications-client@2.39.0
  - @memberjunction/templates-base-types@2.39.0
  - @memberjunction/ng-record-changes@2.39.0
  - @memberjunction/ng-base-forms@2.39.0
  - @memberjunction/ng-auth-services@2.39.0
  - @memberjunction/ng-container-directives@2.39.0
  - @memberjunction/ng-tabstrip@2.39.0
  - @memberjunction/core@2.39.0
  - @memberjunction/global@2.39.0

## 2.38.0

### Patch Changes

- Updated dependencies [c835ded]
  - @memberjunction/core-entities@2.38.0
  - @memberjunction/ng-ask-skip@2.38.0
  - @memberjunction/ng-compare-records@2.38.0
  - @memberjunction/ng-entity-form-dialog@2.38.0
  - @memberjunction/ng-explorer-settings@2.38.0
  - @memberjunction/ng-shared@2.38.0
  - @memberjunction/ng-user-view-grid@2.38.0
  - @memberjunction/ng-user-view-properties@2.38.0
  - @memberjunction/ng-file-storage@2.38.0
  - @memberjunction/ng-query-grid@2.38.0
  - @memberjunction/ng-record-selector@2.38.0
  - @memberjunction/ng-resource-permissions@2.38.0
  - @memberjunction/ng-skip-chat@2.38.0
  - @memberjunction/communication-types@2.38.0
  - @memberjunction/entity-communications-client@2.38.0
  - @memberjunction/templates-base-types@2.38.0
  - @memberjunction/ng-record-changes@2.38.0
  - @memberjunction/ng-base-forms@2.38.0
  - @memberjunction/ng-auth-services@2.38.0
  - @memberjunction/ng-container-directives@2.38.0
  - @memberjunction/ng-tabstrip@2.38.0
  - @memberjunction/core@2.38.0
  - @memberjunction/global@2.38.0

## 2.37.1

### Patch Changes

- Updated dependencies [65b4c60]
  - @memberjunction/ng-skip-chat@2.37.1
  - @memberjunction/ng-ask-skip@2.37.1
  - @memberjunction/ng-auth-services@2.37.1
  - @memberjunction/ng-base-forms@2.37.1
  - @memberjunction/ng-compare-records@2.37.1
  - @memberjunction/ng-entity-form-dialog@2.37.1
  - @memberjunction/ng-explorer-settings@2.37.1
  - @memberjunction/ng-record-changes@2.37.1
  - @memberjunction/ng-shared@2.37.1
  - @memberjunction/ng-user-view-grid@2.37.1
  - @memberjunction/ng-user-view-properties@2.37.1
  - @memberjunction/ng-container-directives@2.37.1
  - @memberjunction/ng-file-storage@2.37.1
  - @memberjunction/ng-query-grid@2.37.1
  - @memberjunction/ng-record-selector@2.37.1
  - @memberjunction/ng-resource-permissions@2.37.1
  - @memberjunction/ng-tabstrip@2.37.1
  - @memberjunction/communication-types@2.37.1
  - @memberjunction/entity-communications-client@2.37.1
  - @memberjunction/core@2.37.1
  - @memberjunction/core-entities@2.37.1
  - @memberjunction/global@2.37.1
  - @memberjunction/templates-base-types@2.37.1

## 2.37.0

### Patch Changes

- Updated dependencies [1418b71]
- Updated dependencies [6a75f8d]
- Updated dependencies [cb78827]
- Updated dependencies [38ef3ec]
  - @memberjunction/core-entities@2.37.0
  - @memberjunction/ng-container-directives@2.37.0
  - @memberjunction/ng-skip-chat@2.37.0
  - @memberjunction/ng-ask-skip@2.37.0
  - @memberjunction/ng-compare-records@2.37.0
  - @memberjunction/ng-entity-form-dialog@2.37.0
  - @memberjunction/ng-explorer-settings@2.37.0
  - @memberjunction/ng-shared@2.37.0
  - @memberjunction/ng-user-view-grid@2.37.0
  - @memberjunction/ng-user-view-properties@2.37.0
  - @memberjunction/ng-file-storage@2.37.0
  - @memberjunction/ng-query-grid@2.37.0
  - @memberjunction/ng-record-selector@2.37.0
  - @memberjunction/ng-resource-permissions@2.37.0
  - @memberjunction/communication-types@2.37.0
  - @memberjunction/entity-communications-client@2.37.0
  - @memberjunction/templates-base-types@2.37.0
  - @memberjunction/ng-base-forms@2.37.0
  - @memberjunction/ng-record-changes@2.37.0
  - @memberjunction/ng-tabstrip@2.37.0
  - @memberjunction/ng-auth-services@2.37.0
  - @memberjunction/core@2.37.0
  - @memberjunction/global@2.37.0

## 2.36.1

### Patch Changes

- Updated dependencies [9d709e2]
  - @memberjunction/core@2.36.1
  - @memberjunction/ng-ask-skip@2.36.1
  - @memberjunction/ng-auth-services@2.36.1
  - @memberjunction/ng-base-forms@2.36.1
  - @memberjunction/ng-compare-records@2.36.1
  - @memberjunction/ng-entity-form-dialog@2.36.1
  - @memberjunction/ng-explorer-settings@2.36.1
  - @memberjunction/ng-record-changes@2.36.1
  - @memberjunction/ng-shared@2.36.1
  - @memberjunction/ng-user-view-grid@2.36.1
  - @memberjunction/ng-user-view-properties@2.36.1
  - @memberjunction/ng-container-directives@2.36.1
  - @memberjunction/ng-file-storage@2.36.1
  - @memberjunction/ng-query-grid@2.36.1
  - @memberjunction/ng-record-selector@2.36.1
  - @memberjunction/ng-resource-permissions@2.36.1
  - @memberjunction/ng-skip-chat@2.36.1
  - @memberjunction/communication-types@2.36.1
  - @memberjunction/entity-communications-client@2.36.1
  - @memberjunction/core-entities@2.36.1
  - @memberjunction/templates-base-types@2.36.1
  - @memberjunction/ng-tabstrip@2.36.1
  - @memberjunction/global@2.36.1

## 2.36.0

### Minor Changes

- 920867c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table
- 2e6fd3c: This PR mainly introduces the components to wire up the new Skip Learning Cycle. It also includes the addition of several reasoning models. Changes include:Additions to the AskSkipResolver.ts file: Includes methods to build the necessary entities for a call to the learning cycle API, the actual call to the API, and post-processing of resulting note changes.Addition of a LearningCycleScheduler: This class handles the asynchronous calls to the learning cycle API on an interval that defaults to 60 minutes.Reasoning models from OpenAI and Gemini added to AI Models tableNew field "SupportsEffortLevel" added to AI Models table

### Patch Changes

- Updated dependencies [920867c]
- Updated dependencies [2e6fd3c]
- Updated dependencies [160f24f]
  - @memberjunction/ng-user-view-properties@2.36.0
  - @memberjunction/ng-container-directives@2.36.0
  - @memberjunction/ng-resource-permissions@2.36.0
  - @memberjunction/ng-entity-form-dialog@2.36.0
  - @memberjunction/ng-explorer-settings@2.36.0
  - @memberjunction/ng-compare-records@2.36.0
  - @memberjunction/entity-communications-client@2.36.0
  - @memberjunction/ng-record-changes@2.36.0
  - @memberjunction/ng-user-view-grid@2.36.0
  - @memberjunction/ng-record-selector@2.36.0
  - @memberjunction/ng-auth-services@2.36.0
  - @memberjunction/ng-file-storage@2.36.0
  - @memberjunction/ng-base-forms@2.36.0
  - @memberjunction/ng-query-grid@2.36.0
  - @memberjunction/ng-ask-skip@2.36.0
  - @memberjunction/ng-skip-chat@2.36.0
  - @memberjunction/ng-tabstrip@2.36.0
  - @memberjunction/communication-types@2.36.0
  - @memberjunction/ng-shared@2.36.0
  - @memberjunction/templates-base-types@2.36.0
  - @memberjunction/core-entities@2.36.0
  - @memberjunction/global@2.36.0
  - @memberjunction/core@2.36.0

## 2.35.1

### Patch Changes

- Updated dependencies [3e7ec64]
  - @memberjunction/core@2.35.1
  - @memberjunction/ng-ask-skip@2.35.1
  - @memberjunction/ng-auth-services@2.35.1
  - @memberjunction/ng-base-forms@2.35.1
  - @memberjunction/ng-compare-records@2.35.1
  - @memberjunction/ng-entity-form-dialog@2.35.1
  - @memberjunction/ng-explorer-settings@2.35.1
  - @memberjunction/ng-record-changes@2.35.1
  - @memberjunction/ng-shared@2.35.1
  - @memberjunction/ng-user-view-grid@2.35.1
  - @memberjunction/ng-user-view-properties@2.35.1
  - @memberjunction/ng-container-directives@2.35.1
  - @memberjunction/ng-file-storage@2.35.1
  - @memberjunction/ng-query-grid@2.35.1
  - @memberjunction/ng-record-selector@2.35.1
  - @memberjunction/ng-resource-permissions@2.35.1
  - @memberjunction/ng-skip-chat@2.35.1
  - @memberjunction/communication-types@2.35.1
  - @memberjunction/entity-communications-client@2.35.1
  - @memberjunction/core-entities@2.35.1
  - @memberjunction/templates-base-types@2.35.1
  - @memberjunction/ng-tabstrip@2.35.1
  - @memberjunction/global@2.35.1

## 2.35.0

### Patch Changes

- Updated dependencies [8863e80]
  - @memberjunction/ng-skip-chat@2.35.0
  - @memberjunction/ng-ask-skip@2.35.0
  - @memberjunction/ng-auth-services@2.35.0
  - @memberjunction/ng-base-forms@2.35.0
  - @memberjunction/ng-compare-records@2.35.0
  - @memberjunction/ng-entity-form-dialog@2.35.0
  - @memberjunction/ng-explorer-settings@2.35.0
  - @memberjunction/ng-record-changes@2.35.0
  - @memberjunction/ng-shared@2.35.0
  - @memberjunction/ng-user-view-grid@2.35.0
  - @memberjunction/ng-user-view-properties@2.35.0
  - @memberjunction/ng-container-directives@2.35.0
  - @memberjunction/ng-file-storage@2.35.0
  - @memberjunction/ng-query-grid@2.35.0
  - @memberjunction/ng-record-selector@2.35.0
  - @memberjunction/ng-resource-permissions@2.35.0
  - @memberjunction/ng-tabstrip@2.35.0
  - @memberjunction/communication-types@2.35.0
  - @memberjunction/entity-communications-client@2.35.0
  - @memberjunction/core@2.35.0
  - @memberjunction/core-entities@2.35.0
  - @memberjunction/global@2.35.0
  - @memberjunction/templates-base-types@2.35.0

## 2.34.2

### Patch Changes

- @memberjunction/ng-ask-skip@2.34.2
- @memberjunction/ng-auth-services@2.34.2
- @memberjunction/ng-base-forms@2.34.2
- @memberjunction/ng-compare-records@2.34.2
- @memberjunction/ng-entity-form-dialog@2.34.2
- @memberjunction/ng-explorer-settings@2.34.2
- @memberjunction/ng-record-changes@2.34.2
- @memberjunction/ng-shared@2.34.2
- @memberjunction/ng-user-view-grid@2.34.2
- @memberjunction/ng-user-view-properties@2.34.2
- @memberjunction/ng-container-directives@2.34.2
- @memberjunction/ng-file-storage@2.34.2
- @memberjunction/ng-query-grid@2.34.2
- @memberjunction/ng-record-selector@2.34.2
- @memberjunction/ng-resource-permissions@2.34.2
- @memberjunction/ng-skip-chat@2.34.2
- @memberjunction/ng-tabstrip@2.34.2
- @memberjunction/communication-types@2.34.2
- @memberjunction/entity-communications-client@2.34.2
- @memberjunction/core@2.34.2
- @memberjunction/core-entities@2.34.2
- @memberjunction/global@2.34.2
- @memberjunction/templates-base-types@2.34.2

## 2.34.1

### Patch Changes

- @memberjunction/ng-ask-skip@2.34.1
- @memberjunction/ng-auth-services@2.34.1
- @memberjunction/ng-base-forms@2.34.1
- @memberjunction/ng-compare-records@2.34.1
- @memberjunction/ng-entity-form-dialog@2.34.1
- @memberjunction/ng-explorer-settings@2.34.1
- @memberjunction/ng-record-changes@2.34.1
- @memberjunction/ng-shared@2.34.1
- @memberjunction/ng-user-view-grid@2.34.1
- @memberjunction/ng-user-view-properties@2.34.1
- @memberjunction/ng-container-directives@2.34.1
- @memberjunction/ng-file-storage@2.34.1
- @memberjunction/ng-query-grid@2.34.1
- @memberjunction/ng-record-selector@2.34.1
- @memberjunction/ng-resource-permissions@2.34.1
- @memberjunction/ng-skip-chat@2.34.1
- @memberjunction/ng-tabstrip@2.34.1
- @memberjunction/communication-types@2.34.1
- @memberjunction/entity-communications-client@2.34.1
- @memberjunction/core@2.34.1
- @memberjunction/core-entities@2.34.1
- @memberjunction/global@2.34.1
- @memberjunction/templates-base-types@2.34.1

## 2.34.0

### Patch Changes

- 54ac86c: Optimize streaming implementation + bug fixes
- Updated dependencies [e60f326]
- Updated dependencies [785f06a]
- Updated dependencies [b48d6b4]
  - @memberjunction/ng-ask-skip@2.34.0
  - @memberjunction/ng-skip-chat@2.34.0
  - @memberjunction/core-entities@2.34.0
  - @memberjunction/core@2.34.0
  - @memberjunction/ng-compare-records@2.34.0
  - @memberjunction/ng-entity-form-dialog@2.34.0
  - @memberjunction/ng-explorer-settings@2.34.0
  - @memberjunction/ng-shared@2.34.0
  - @memberjunction/ng-user-view-grid@2.34.0
  - @memberjunction/ng-user-view-properties@2.34.0
  - @memberjunction/ng-file-storage@2.34.0
  - @memberjunction/ng-query-grid@2.34.0
  - @memberjunction/ng-record-selector@2.34.0
  - @memberjunction/ng-resource-permissions@2.34.0
  - @memberjunction/communication-types@2.34.0
  - @memberjunction/entity-communications-client@2.34.0
  - @memberjunction/templates-base-types@2.34.0
  - @memberjunction/ng-auth-services@2.34.0
  - @memberjunction/ng-base-forms@2.34.0
  - @memberjunction/ng-record-changes@2.34.0
  - @memberjunction/ng-container-directives@2.34.0
  - @memberjunction/ng-tabstrip@2.34.0
  - @memberjunction/global@2.34.0

## 2.33.0

### Patch Changes

- Updated dependencies [42b7deb]
- Updated dependencies [aab9935]
- Updated dependencies [9537497]
  - @memberjunction/ng-base-forms@2.33.0
  - @memberjunction/ng-explorer-settings@2.33.0
  - @memberjunction/ng-shared@2.33.0
  - @memberjunction/communication-types@2.33.0
  - @memberjunction/ng-user-view-grid@2.33.0
  - @memberjunction/ng-entity-form-dialog@2.33.0
  - @memberjunction/ng-user-view-properties@2.33.0
  - @memberjunction/ng-ask-skip@2.33.0
  - @memberjunction/ng-file-storage@2.33.0
  - @memberjunction/ng-query-grid@2.33.0
  - @memberjunction/ng-record-selector@2.33.0
  - @memberjunction/ng-skip-chat@2.33.0
  - @memberjunction/entity-communications-client@2.33.0
  - @memberjunction/ng-resource-permissions@2.33.0
  - @memberjunction/ng-auth-services@2.33.0
  - @memberjunction/ng-compare-records@2.33.0
  - @memberjunction/ng-record-changes@2.33.0
  - @memberjunction/ng-container-directives@2.33.0
  - @memberjunction/ng-tabstrip@2.33.0
  - @memberjunction/core@2.33.0
  - @memberjunction/core-entities@2.33.0
  - @memberjunction/global@2.33.0
  - @memberjunction/templates-base-types@2.33.0

## 2.32.2

### Patch Changes

- @memberjunction/ng-ask-skip@2.32.2
- @memberjunction/ng-auth-services@2.32.2
- @memberjunction/ng-base-forms@2.32.2
- @memberjunction/ng-compare-records@2.32.2
- @memberjunction/ng-entity-form-dialog@2.32.2
- @memberjunction/ng-explorer-settings@2.32.2
- @memberjunction/ng-record-changes@2.32.2
- @memberjunction/ng-shared@2.32.2
- @memberjunction/ng-user-view-grid@2.32.2
- @memberjunction/ng-user-view-properties@2.32.2
- @memberjunction/ng-container-directives@2.32.2
- @memberjunction/ng-file-storage@2.32.2
- @memberjunction/ng-query-grid@2.32.2
- @memberjunction/ng-record-selector@2.32.2
- @memberjunction/ng-resource-permissions@2.32.2
- @memberjunction/ng-skip-chat@2.32.2
- @memberjunction/ng-tabstrip@2.32.2
- @memberjunction/communication-types@2.32.2
- @memberjunction/entity-communications-client@2.32.2
- @memberjunction/core@2.32.2
- @memberjunction/core-entities@2.32.2
- @memberjunction/global@2.32.2
- @memberjunction/templates-base-types@2.32.2

## 2.32.1

### Patch Changes

- @memberjunction/ng-ask-skip@2.32.1
- @memberjunction/ng-auth-services@2.32.1
- @memberjunction/ng-base-forms@2.32.1
- @memberjunction/ng-compare-records@2.32.1
- @memberjunction/ng-entity-form-dialog@2.32.1
- @memberjunction/ng-explorer-settings@2.32.1
- @memberjunction/ng-record-changes@2.32.1
- @memberjunction/ng-shared@2.32.1
- @memberjunction/ng-user-view-grid@2.32.1
- @memberjunction/ng-user-view-properties@2.32.1
- @memberjunction/ng-container-directives@2.32.1
- @memberjunction/ng-file-storage@2.32.1
- @memberjunction/ng-query-grid@2.32.1
- @memberjunction/ng-record-selector@2.32.1
- @memberjunction/ng-resource-permissions@2.32.1
- @memberjunction/ng-skip-chat@2.32.1
- @memberjunction/ng-tabstrip@2.32.1
- @memberjunction/communication-types@2.32.1
- @memberjunction/entity-communications-client@2.32.1
- @memberjunction/core@2.32.1
- @memberjunction/core-entities@2.32.1
- @memberjunction/global@2.32.1
- @memberjunction/templates-base-types@2.32.1

## 2.32.0

### Patch Changes

- @memberjunction/ng-ask-skip@2.32.0
- @memberjunction/ng-auth-services@2.32.0
- @memberjunction/ng-base-forms@2.32.0
- @memberjunction/ng-compare-records@2.32.0
- @memberjunction/ng-entity-form-dialog@2.32.0
- @memberjunction/ng-explorer-settings@2.32.0
- @memberjunction/ng-record-changes@2.32.0
- @memberjunction/ng-shared@2.32.0
- @memberjunction/ng-user-view-grid@2.32.0
- @memberjunction/ng-user-view-properties@2.32.0
- @memberjunction/ng-container-directives@2.32.0
- @memberjunction/ng-file-storage@2.32.0
- @memberjunction/ng-query-grid@2.32.0
- @memberjunction/ng-record-selector@2.32.0
- @memberjunction/ng-resource-permissions@2.32.0
- @memberjunction/ng-skip-chat@2.32.0
- @memberjunction/ng-tabstrip@2.32.0
- @memberjunction/communication-types@2.32.0
- @memberjunction/entity-communications-client@2.32.0
- @memberjunction/core@2.32.0
- @memberjunction/core-entities@2.32.0
- @memberjunction/global@2.32.0
- @memberjunction/templates-base-types@2.32.0

## 2.31.0

### Patch Changes

- Updated dependencies [566d2f0]
- Updated dependencies [7862d2a]
- Updated dependencies [0899b8b]
- Updated dependencies [946b64e]
- Updated dependencies [f3bf773]
  - @memberjunction/ng-skip-chat@2.31.0
  - @memberjunction/communication-types@2.31.0
  - @memberjunction/ng-ask-skip@2.31.0
  - @memberjunction/ng-user-view-grid@2.31.0
  - @memberjunction/ng-shared@2.31.0
  - @memberjunction/ng-file-storage@2.31.0
  - @memberjunction/entity-communications-client@2.31.0
  - @memberjunction/ng-explorer-settings@2.31.0
  - @memberjunction/ng-base-forms@2.31.0
  - @memberjunction/ng-entity-form-dialog@2.31.0
  - @memberjunction/ng-user-view-properties@2.31.0
  - @memberjunction/ng-query-grid@2.31.0
  - @memberjunction/ng-record-selector@2.31.0
  - @memberjunction/ng-resource-permissions@2.31.0
  - @memberjunction/ng-auth-services@2.31.0
  - @memberjunction/ng-compare-records@2.31.0
  - @memberjunction/ng-record-changes@2.31.0
  - @memberjunction/ng-container-directives@2.31.0
  - @memberjunction/ng-tabstrip@2.31.0
  - @memberjunction/core@2.31.0
  - @memberjunction/core-entities@2.31.0
  - @memberjunction/global@2.31.0
  - @memberjunction/templates-base-types@2.31.0

## 2.30.0

### Patch Changes

- Updated dependencies [a3ab749]
- Updated dependencies [6b5278a]
  - @memberjunction/core-entities@2.30.0
  - @memberjunction/global@2.30.0
  - @memberjunction/communication-types@2.30.0
  - @memberjunction/ng-ask-skip@2.30.0
  - @memberjunction/ng-compare-records@2.30.0
  - @memberjunction/ng-entity-form-dialog@2.30.0
  - @memberjunction/ng-explorer-settings@2.30.0
  - @memberjunction/ng-shared@2.30.0
  - @memberjunction/ng-user-view-grid@2.30.0
  - @memberjunction/ng-user-view-properties@2.30.0
  - @memberjunction/ng-file-storage@2.30.0
  - @memberjunction/ng-query-grid@2.30.0
  - @memberjunction/ng-record-selector@2.30.0
  - @memberjunction/ng-resource-permissions@2.30.0
  - @memberjunction/ng-skip-chat@2.30.0
  - @memberjunction/entity-communications-client@2.30.0
  - @memberjunction/templates-base-types@2.30.0
  - @memberjunction/ng-base-forms@2.30.0
  - @memberjunction/ng-record-changes@2.30.0
  - @memberjunction/ng-container-directives@2.30.0
  - @memberjunction/core@2.30.0
  - @memberjunction/ng-tabstrip@2.30.0
  - @memberjunction/ng-auth-services@2.30.0

## 2.29.2

### Patch Changes

- 64aa7f0: New query for 2.29.0 to get version history since we aren't using an entity for flyway data anymore. Improvements to query execution to support query execution by name as well as by ID, and general cleanup (code wasn't working before as query ID wasn't enclosed in quotes from days of INT ID types)
- Updated dependencies [07bde92]
- Updated dependencies [64aa7f0]
- Updated dependencies [69c3505]
  - @memberjunction/core@2.29.2
  - @memberjunction/core-entities@2.29.2
  - @memberjunction/ng-ask-skip@2.29.2
  - @memberjunction/ng-auth-services@2.29.2
  - @memberjunction/ng-base-forms@2.29.2
  - @memberjunction/ng-compare-records@2.29.2
  - @memberjunction/ng-entity-form-dialog@2.29.2
  - @memberjunction/ng-explorer-settings@2.29.2
  - @memberjunction/ng-record-changes@2.29.2
  - @memberjunction/ng-shared@2.29.2
  - @memberjunction/ng-user-view-grid@2.29.2
  - @memberjunction/ng-user-view-properties@2.29.2
  - @memberjunction/ng-container-directives@2.29.2
  - @memberjunction/ng-file-storage@2.29.2
  - @memberjunction/ng-query-grid@2.29.2
  - @memberjunction/ng-record-selector@2.29.2
  - @memberjunction/ng-resource-permissions@2.29.2
  - @memberjunction/ng-skip-chat@2.29.2
  - @memberjunction/communication-types@2.29.2
  - @memberjunction/entity-communications-client@2.29.2
  - @memberjunction/templates-base-types@2.29.2
  - @memberjunction/ng-tabstrip@2.29.2
  - @memberjunction/global@2.29.2

## 2.28.0

### Patch Changes

- Updated dependencies [8259093]
- Updated dependencies [19d0383]
- Updated dependencies [ffb98bf]
  - @memberjunction/core@2.28.0
  - @memberjunction/ng-skip-chat@2.28.0
  - @memberjunction/communication-types@2.28.0
  - @memberjunction/ng-ask-skip@2.28.0
  - @memberjunction/ng-auth-services@2.28.0
  - @memberjunction/ng-base-forms@2.28.0
  - @memberjunction/ng-compare-records@2.28.0
  - @memberjunction/ng-entity-form-dialog@2.28.0
  - @memberjunction/ng-explorer-settings@2.28.0
  - @memberjunction/ng-record-changes@2.28.0
  - @memberjunction/ng-shared@2.28.0
  - @memberjunction/ng-user-view-grid@2.28.0
  - @memberjunction/ng-user-view-properties@2.28.0
  - @memberjunction/ng-container-directives@2.28.0
  - @memberjunction/ng-file-storage@2.28.0
  - @memberjunction/ng-query-grid@2.28.0
  - @memberjunction/ng-record-selector@2.28.0
  - @memberjunction/ng-resource-permissions@2.28.0
  - @memberjunction/entity-communications-client@2.28.0
  - @memberjunction/core-entities@2.28.0
  - @memberjunction/templates-base-types@2.28.0
  - @memberjunction/ng-tabstrip@2.28.0
  - @memberjunction/global@2.28.0

## 2.27.1

### Patch Changes

- Updated dependencies [2770442]
- Updated dependencies [aceeef2]
  - @memberjunction/ng-skip-chat@2.27.1
  - @memberjunction/ng-ask-skip@2.27.1
  - @memberjunction/ng-auth-services@2.27.1
  - @memberjunction/ng-base-forms@2.27.1
  - @memberjunction/ng-compare-records@2.27.1
  - @memberjunction/ng-entity-form-dialog@2.27.1
  - @memberjunction/ng-explorer-settings@2.27.1
  - @memberjunction/ng-record-changes@2.27.1
  - @memberjunction/ng-shared@2.27.1
  - @memberjunction/ng-user-view-grid@2.27.1
  - @memberjunction/ng-user-view-properties@2.27.1
  - @memberjunction/ng-container-directives@2.27.1
  - @memberjunction/ng-file-storage@2.27.1
  - @memberjunction/ng-query-grid@2.27.1
  - @memberjunction/ng-record-selector@2.27.1
  - @memberjunction/ng-resource-permissions@2.27.1
  - @memberjunction/ng-tabstrip@2.27.1
  - @memberjunction/communication-types@2.27.1
  - @memberjunction/entity-communications-client@2.27.1
  - @memberjunction/core@2.27.1
  - @memberjunction/core-entities@2.27.1
  - @memberjunction/global@2.27.1
  - @memberjunction/templates-base-types@2.27.1

## 2.27.0

### Patch Changes

- Updated dependencies [54ab868]
- Updated dependencies [5a81451]
- Updated dependencies [2be5fb4]
  - @memberjunction/core@2.27.0
  - @memberjunction/core-entities@2.27.0
  - @memberjunction/ng-ask-skip@2.27.0
  - @memberjunction/ng-auth-services@2.27.0
  - @memberjunction/ng-base-forms@2.27.0
  - @memberjunction/ng-compare-records@2.27.0
  - @memberjunction/ng-entity-form-dialog@2.27.0
  - @memberjunction/ng-explorer-settings@2.27.0
  - @memberjunction/ng-record-changes@2.27.0
  - @memberjunction/ng-shared@2.27.0
  - @memberjunction/ng-user-view-grid@2.27.0
  - @memberjunction/ng-user-view-properties@2.27.0
  - @memberjunction/ng-container-directives@2.27.0
  - @memberjunction/ng-file-storage@2.27.0
  - @memberjunction/ng-query-grid@2.27.0
  - @memberjunction/ng-record-selector@2.27.0
  - @memberjunction/ng-resource-permissions@2.27.0
  - @memberjunction/ng-skip-chat@2.27.0
  - @memberjunction/communication-types@2.27.0
  - @memberjunction/entity-communications-client@2.27.0
  - @memberjunction/templates-base-types@2.27.0
  - @memberjunction/ng-tabstrip@2.27.0
  - @memberjunction/global@2.27.0

## 2.26.1

### Patch Changes

- Updated dependencies [00e9718]
  - @memberjunction/ng-skip-chat@2.26.1
  - @memberjunction/ng-ask-skip@2.26.1
  - @memberjunction/ng-auth-services@2.26.1
  - @memberjunction/ng-base-forms@2.26.1
  - @memberjunction/ng-compare-records@2.26.1
  - @memberjunction/ng-entity-form-dialog@2.26.1
  - @memberjunction/ng-explorer-settings@2.26.1
  - @memberjunction/ng-record-changes@2.26.1
  - @memberjunction/ng-shared@2.26.1
  - @memberjunction/ng-user-view-grid@2.26.1
  - @memberjunction/ng-user-view-properties@2.26.1
  - @memberjunction/ng-container-directives@2.26.1
  - @memberjunction/ng-file-storage@2.26.1
  - @memberjunction/ng-query-grid@2.26.1
  - @memberjunction/ng-record-selector@2.26.1
  - @memberjunction/ng-resource-permissions@2.26.1
  - @memberjunction/ng-tabstrip@2.26.1
  - @memberjunction/communication-types@2.26.1
  - @memberjunction/entity-communications-client@2.26.1
  - @memberjunction/core@2.26.1
  - @memberjunction/core-entities@2.26.1
  - @memberjunction/global@2.26.1
  - @memberjunction/templates-base-types@2.26.1

## 2.26.0

### Patch Changes

- Updated dependencies [23801c5]
  - @memberjunction/core@2.26.0
  - @memberjunction/ng-ask-skip@2.26.0
  - @memberjunction/ng-auth-services@2.26.0
  - @memberjunction/ng-base-forms@2.26.0
  - @memberjunction/ng-compare-records@2.26.0
  - @memberjunction/ng-entity-form-dialog@2.26.0
  - @memberjunction/ng-explorer-settings@2.26.0
  - @memberjunction/ng-record-changes@2.26.0
  - @memberjunction/ng-shared@2.26.0
  - @memberjunction/ng-user-view-grid@2.26.0
  - @memberjunction/ng-user-view-properties@2.26.0
  - @memberjunction/ng-container-directives@2.26.0
  - @memberjunction/ng-file-storage@2.26.0
  - @memberjunction/ng-query-grid@2.26.0
  - @memberjunction/ng-record-selector@2.26.0
  - @memberjunction/ng-resource-permissions@2.26.0
  - @memberjunction/ng-skip-chat@2.26.0
  - @memberjunction/communication-types@2.26.0
  - @memberjunction/entity-communications-client@2.26.0
  - @memberjunction/core-entities@2.26.0
  - @memberjunction/templates-base-types@2.26.0
  - @memberjunction/ng-tabstrip@2.26.0
  - @memberjunction/global@2.26.0

## 2.25.0

### Patch Changes

- 86e6d3b: Finished debug for Variables support in transaction groups!
- Updated dependencies [fd07dcd]
- Updated dependencies [88db85c]
- Updated dependencies [26c990d]
- Updated dependencies [83a32c7]
- Updated dependencies [26ad691]
- Updated dependencies [86e6d3b]
  - @memberjunction/core@2.25.0
  - @memberjunction/ng-skip-chat@2.25.0
  - @memberjunction/ng-user-view-grid@2.25.0
  - @memberjunction/ng-resource-permissions@2.25.0
  - @memberjunction/ng-ask-skip@2.25.0
  - @memberjunction/ng-auth-services@2.25.0
  - @memberjunction/ng-base-forms@2.25.0
  - @memberjunction/ng-compare-records@2.25.0
  - @memberjunction/ng-entity-form-dialog@2.25.0
  - @memberjunction/ng-explorer-settings@2.25.0
  - @memberjunction/ng-record-changes@2.25.0
  - @memberjunction/ng-shared@2.25.0
  - @memberjunction/ng-user-view-properties@2.25.0
  - @memberjunction/ng-container-directives@2.25.0
  - @memberjunction/ng-file-storage@2.25.0
  - @memberjunction/ng-query-grid@2.25.0
  - @memberjunction/ng-record-selector@2.25.0
  - @memberjunction/communication-types@2.25.0
  - @memberjunction/entity-communications-client@2.25.0
  - @memberjunction/core-entities@2.25.0
  - @memberjunction/templates-base-types@2.25.0
  - @memberjunction/ng-tabstrip@2.25.0
  - @memberjunction/global@2.25.0

## 2.24.1

### Patch Changes

- @memberjunction/ng-ask-skip@2.24.1
- @memberjunction/ng-auth-services@2.24.1
- @memberjunction/ng-base-forms@2.24.1
- @memberjunction/ng-compare-records@2.24.1
- @memberjunction/ng-entity-form-dialog@2.24.1
- @memberjunction/ng-explorer-settings@2.24.1
- @memberjunction/ng-record-changes@2.24.1
- @memberjunction/ng-shared@2.24.1
- @memberjunction/ng-user-view-grid@2.24.1
- @memberjunction/ng-user-view-properties@2.24.1
- @memberjunction/ng-container-directives@2.24.1
- @memberjunction/ng-file-storage@2.24.1
- @memberjunction/ng-query-grid@2.24.1
- @memberjunction/ng-record-selector@2.24.1
- @memberjunction/ng-resource-permissions@2.24.1
- @memberjunction/ng-skip-chat@2.24.1
- @memberjunction/ng-tabstrip@2.24.1
- @memberjunction/communication-types@2.24.1
- @memberjunction/entity-communications-client@2.24.1
- @memberjunction/core@2.24.1
- @memberjunction/core-entities@2.24.1
- @memberjunction/global@2.24.1
- @memberjunction/templates-base-types@2.24.1

## 2.24.0

### Patch Changes

- Updated dependencies [9cb85cc]
- Updated dependencies [7c6ff41]
  - @memberjunction/global@2.24.0
  - @memberjunction/core-entities@2.24.0
  - @memberjunction/ng-ask-skip@2.24.0
  - @memberjunction/ng-base-forms@2.24.0
  - @memberjunction/ng-entity-form-dialog@2.24.0
  - @memberjunction/ng-explorer-settings@2.24.0
  - @memberjunction/ng-record-changes@2.24.0
  - @memberjunction/ng-user-view-grid@2.24.0
  - @memberjunction/ng-user-view-properties@2.24.0
  - @memberjunction/ng-container-directives@2.24.0
  - @memberjunction/ng-file-storage@2.24.0
  - @memberjunction/ng-query-grid@2.24.0
  - @memberjunction/ng-record-selector@2.24.0
  - @memberjunction/ng-resource-permissions@2.24.0
  - @memberjunction/ng-skip-chat@2.24.0
  - @memberjunction/communication-types@2.24.0
  - @memberjunction/entity-communications-client@2.24.0
  - @memberjunction/core@2.24.0
  - @memberjunction/templates-base-types@2.24.0
  - @memberjunction/ng-compare-records@2.24.0
  - @memberjunction/ng-shared@2.24.0
  - @memberjunction/ng-tabstrip@2.24.0
  - @memberjunction/ng-auth-services@2.24.0

## 2.23.2

### Patch Changes

- @memberjunction/ng-ask-skip@2.23.2
- @memberjunction/ng-auth-services@2.23.2
- @memberjunction/ng-base-forms@2.23.2
- @memberjunction/ng-compare-records@2.23.2
- @memberjunction/ng-entity-form-dialog@2.23.2
- @memberjunction/ng-explorer-settings@2.23.2
- @memberjunction/ng-record-changes@2.23.2
- @memberjunction/ng-shared@2.23.2
- @memberjunction/ng-user-view-grid@2.23.2
- @memberjunction/ng-user-view-properties@2.23.2
- @memberjunction/ng-container-directives@2.23.2
- @memberjunction/ng-file-storage@2.23.2
- @memberjunction/ng-query-grid@2.23.2
- @memberjunction/ng-record-selector@2.23.2
- @memberjunction/ng-resource-permissions@2.23.2
- @memberjunction/ng-skip-chat@2.23.2
- @memberjunction/ng-tabstrip@2.23.2
- @memberjunction/communication-types@2.23.2
- @memberjunction/entity-communications-client@2.23.2
- @memberjunction/core@2.23.2
- @memberjunction/core-entities@2.23.2
- @memberjunction/global@2.23.2
- @memberjunction/templates-base-types@2.23.2

## 2.23.1

### Patch Changes

- @memberjunction/ng-ask-skip@2.23.1
- @memberjunction/ng-auth-services@2.23.1
- @memberjunction/ng-base-forms@2.23.1
- @memberjunction/ng-compare-records@2.23.1
- @memberjunction/ng-entity-form-dialog@2.23.1
- @memberjunction/ng-explorer-settings@2.23.1
- @memberjunction/ng-record-changes@2.23.1
- @memberjunction/ng-shared@2.23.1
- @memberjunction/ng-user-view-grid@2.23.1
- @memberjunction/ng-user-view-properties@2.23.1
- @memberjunction/ng-container-directives@2.23.1
- @memberjunction/ng-file-storage@2.23.1
- @memberjunction/ng-query-grid@2.23.1
- @memberjunction/ng-record-selector@2.23.1
- @memberjunction/ng-resource-permissions@2.23.1
- @memberjunction/ng-skip-chat@2.23.1
- @memberjunction/ng-tabstrip@2.23.1
- @memberjunction/communication-types@2.23.1
- @memberjunction/entity-communications-client@2.23.1
- @memberjunction/core@2.23.1
- @memberjunction/core-entities@2.23.1
- @memberjunction/global@2.23.1
- @memberjunction/templates-base-types@2.23.1

## 2.23.0

### Patch Changes

- Updated dependencies [38b7507]
  - @memberjunction/global@2.23.0
  - @memberjunction/ng-ask-skip@2.23.0
  - @memberjunction/ng-base-forms@2.23.0
  - @memberjunction/ng-entity-form-dialog@2.23.0
  - @memberjunction/ng-explorer-settings@2.23.0
  - @memberjunction/ng-record-changes@2.23.0
  - @memberjunction/ng-user-view-grid@2.23.0
  - @memberjunction/ng-user-view-properties@2.23.0
  - @memberjunction/ng-container-directives@2.23.0
  - @memberjunction/ng-file-storage@2.23.0
  - @memberjunction/ng-query-grid@2.23.0
  - @memberjunction/ng-record-selector@2.23.0
  - @memberjunction/ng-resource-permissions@2.23.0
  - @memberjunction/ng-skip-chat@2.23.0
  - @memberjunction/communication-types@2.23.0
  - @memberjunction/entity-communications-client@2.23.0
  - @memberjunction/core@2.23.0
  - @memberjunction/core-entities@2.23.0
  - @memberjunction/templates-base-types@2.23.0
  - @memberjunction/ng-shared@2.23.0
  - @memberjunction/ng-tabstrip@2.23.0
  - @memberjunction/ng-auth-services@2.23.0
  - @memberjunction/ng-compare-records@2.23.0

## 2.22.2

### Patch Changes

- Updated dependencies [94ebf81]
  - @memberjunction/core@2.22.2
  - @memberjunction/ng-ask-skip@2.22.2
  - @memberjunction/ng-auth-services@2.22.2
  - @memberjunction/ng-base-forms@2.22.2
  - @memberjunction/ng-compare-records@2.22.2
  - @memberjunction/ng-entity-form-dialog@2.22.2
  - @memberjunction/ng-explorer-settings@2.22.2
  - @memberjunction/ng-record-changes@2.22.2
  - @memberjunction/ng-shared@2.22.2
  - @memberjunction/ng-user-view-grid@2.22.2
  - @memberjunction/ng-user-view-properties@2.22.2
  - @memberjunction/ng-container-directives@2.22.2
  - @memberjunction/ng-file-storage@2.22.2
  - @memberjunction/ng-query-grid@2.22.2
  - @memberjunction/ng-record-selector@2.22.2
  - @memberjunction/ng-resource-permissions@2.22.2
  - @memberjunction/ng-skip-chat@2.22.2
  - @memberjunction/communication-types@2.22.2
  - @memberjunction/entity-communications-client@2.22.2
  - @memberjunction/core-entities@2.22.2
  - @memberjunction/templates-base-types@2.22.2
  - @memberjunction/ng-tabstrip@2.22.2
  - @memberjunction/global@2.22.2

## 2.22.1

### Patch Changes

- @memberjunction/ng-ask-skip@2.22.1
- @memberjunction/ng-auth-services@2.22.1
- @memberjunction/ng-base-forms@2.22.1
- @memberjunction/ng-compare-records@2.22.1
- @memberjunction/ng-entity-form-dialog@2.22.1
- @memberjunction/ng-explorer-settings@2.22.1
- @memberjunction/ng-record-changes@2.22.1
- @memberjunction/ng-shared@2.22.1
- @memberjunction/ng-user-view-grid@2.22.1
- @memberjunction/ng-user-view-properties@2.22.1
- @memberjunction/ng-container-directives@2.22.1
- @memberjunction/ng-file-storage@2.22.1
- @memberjunction/ng-query-grid@2.22.1
- @memberjunction/ng-record-selector@2.22.1
- @memberjunction/ng-resource-permissions@2.22.1
- @memberjunction/ng-skip-chat@2.22.1
- @memberjunction/ng-tabstrip@2.22.1
- @memberjunction/communication-types@2.22.1
- @memberjunction/entity-communications-client@2.22.1
- @memberjunction/core@2.22.1
- @memberjunction/core-entities@2.22.1
- @memberjunction/global@2.22.1
- @memberjunction/templates-base-types@2.22.1

## 2.22.0

### Patch Changes

- Updated dependencies [a598f1a]
- Updated dependencies [9660275]
  - @memberjunction/core@2.22.0
  - @memberjunction/global@2.22.0
  - @memberjunction/ng-ask-skip@2.22.0
  - @memberjunction/ng-shared@2.22.0
  - @memberjunction/ng-file-storage@2.22.0
  - @memberjunction/ng-skip-chat@2.22.0
  - @memberjunction/entity-communications-client@2.22.0
  - @memberjunction/ng-auth-services@2.22.0
  - @memberjunction/ng-base-forms@2.22.0
  - @memberjunction/ng-compare-records@2.22.0
  - @memberjunction/ng-entity-form-dialog@2.22.0
  - @memberjunction/ng-explorer-settings@2.22.0
  - @memberjunction/ng-record-changes@2.22.0
  - @memberjunction/ng-user-view-grid@2.22.0
  - @memberjunction/ng-user-view-properties@2.22.0
  - @memberjunction/ng-container-directives@2.22.0
  - @memberjunction/ng-query-grid@2.22.0
  - @memberjunction/ng-record-selector@2.22.0
  - @memberjunction/ng-resource-permissions@2.22.0
  - @memberjunction/communication-types@2.22.0
  - @memberjunction/core-entities@2.22.0
  - @memberjunction/templates-base-types@2.22.0
  - @memberjunction/ng-tabstrip@2.22.0

This log was last generated on Thu, 06 Feb 2025 05:11:44 GMT and should not be manually modified.

<!-- Start content -->

## 2.21.0

Thu, 06 Feb 2025 05:11:44 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.21.0
- Bump @memberjunction/core to v2.21.0
- Bump @memberjunction/core-entities to v2.21.0
- Bump @memberjunction/entity-communications-client to v2.21.0
- Bump @memberjunction/communication-types to v2.21.0
- Bump @memberjunction/templates-base-types to v2.21.0
- Bump @memberjunction/ng-compare-records to v2.21.0
- Bump @memberjunction/ng-file-storage to v2.21.0
- Bump @memberjunction/ng-record-changes to v2.21.0
- Bump @memberjunction/ng-container-directives to v2.21.0
- Bump @memberjunction/ng-user-view-grid to v2.21.0
- Bump @memberjunction/ng-query-grid to v2.21.0
- Bump @memberjunction/ng-user-view-properties to v2.21.0
- Bump @memberjunction/ng-shared to v2.21.0
- Bump @memberjunction/ng-tabstrip to v2.21.0
- Bump @memberjunction/ng-skip-chat to v2.21.0
- Bump @memberjunction/ng-ask-skip to v2.21.0
- Bump @memberjunction/ng-auth-services to v2.21.0
- Bump @memberjunction/ng-explorer-settings to v2.21.0
- Bump @memberjunction/ng-base-forms to v2.21.0
- Bump @memberjunction/ng-entity-form-dialog to v2.21.0
- Bump @memberjunction/ng-record-selector to v2.21.0
- Bump @memberjunction/ng-resource-permissions to v2.21.0

## 2.20.3

Thu, 06 Feb 2025 04:34:26 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)

### Patches

- Bump @memberjunction/global to v2.20.3
- Bump @memberjunction/core to v2.20.3
- Bump @memberjunction/core-entities to v2.20.3
- Bump @memberjunction/entity-communications-client to v2.20.3
- Bump @memberjunction/communication-types to v2.20.3
- Bump @memberjunction/templates-base-types to v2.20.3
- Bump @memberjunction/ng-compare-records to v2.20.3
- Bump @memberjunction/ng-file-storage to v2.20.3
- Bump @memberjunction/ng-record-changes to v2.20.3
- Bump @memberjunction/ng-container-directives to v2.20.3
- Bump @memberjunction/ng-user-view-grid to v2.20.3
- Bump @memberjunction/ng-query-grid to v2.20.3
- Bump @memberjunction/ng-user-view-properties to v2.20.3
- Bump @memberjunction/ng-shared to v2.20.3
- Bump @memberjunction/ng-tabstrip to v2.20.3
- Bump @memberjunction/ng-skip-chat to v2.20.3
- Bump @memberjunction/ng-ask-skip to v2.20.3
- Bump @memberjunction/ng-auth-services to v2.20.3
- Bump @memberjunction/ng-explorer-settings to v2.20.3
- Bump @memberjunction/ng-base-forms to v2.20.3
- Bump @memberjunction/ng-entity-form-dialog to v2.20.3
- Bump @memberjunction/ng-record-selector to v2.20.3
- Bump @memberjunction/ng-resource-permissions to v2.20.3

## 2.20.2

Mon, 03 Feb 2025 01:16:07 GMT

### Patches

- Bump @memberjunction/global to v2.20.2
- Bump @memberjunction/core to v2.20.2
- Bump @memberjunction/core-entities to v2.20.2
- Bump @memberjunction/entity-communications-client to v2.20.2
- Bump @memberjunction/communication-types to v2.20.2
- Bump @memberjunction/templates-base-types to v2.20.2
- Bump @memberjunction/ng-compare-records to v2.20.2
- Bump @memberjunction/ng-file-storage to v2.20.2
- Bump @memberjunction/ng-record-changes to v2.20.2
- Bump @memberjunction/ng-container-directives to v2.20.2
- Bump @memberjunction/ng-user-view-grid to v2.20.2
- Bump @memberjunction/ng-query-grid to v2.20.2
- Bump @memberjunction/ng-user-view-properties to v2.20.2
- Bump @memberjunction/ng-shared to v2.20.2
- Bump @memberjunction/ng-tabstrip to v2.20.2
- Bump @memberjunction/ng-skip-chat to v2.20.2
- Bump @memberjunction/ng-ask-skip to v2.20.2
- Bump @memberjunction/ng-auth-services to v2.20.2
- Bump @memberjunction/ng-explorer-settings to v2.20.2
- Bump @memberjunction/ng-base-forms to v2.20.2
- Bump @memberjunction/ng-entity-form-dialog to v2.20.2
- Bump @memberjunction/ng-record-selector to v2.20.2
- Bump @memberjunction/ng-resource-permissions to v2.20.2

## 2.20.1

Mon, 27 Jan 2025 02:32:09 GMT

### Patches

- Bump @memberjunction/global to v2.20.1
- Bump @memberjunction/core to v2.20.1
- Bump @memberjunction/core-entities to v2.20.1
- Bump @memberjunction/entity-communications-client to v2.20.1
- Bump @memberjunction/communication-types to v2.20.1
- Bump @memberjunction/templates-base-types to v2.20.1
- Bump @memberjunction/ng-compare-records to v2.20.1
- Bump @memberjunction/ng-file-storage to v2.20.1
- Bump @memberjunction/ng-record-changes to v2.20.1
- Bump @memberjunction/ng-container-directives to v2.20.1
- Bump @memberjunction/ng-user-view-grid to v2.20.1
- Bump @memberjunction/ng-query-grid to v2.20.1
- Bump @memberjunction/ng-user-view-properties to v2.20.1
- Bump @memberjunction/ng-shared to v2.20.1
- Bump @memberjunction/ng-tabstrip to v2.20.1
- Bump @memberjunction/ng-skip-chat to v2.20.1
- Bump @memberjunction/ng-ask-skip to v2.20.1
- Bump @memberjunction/ng-auth-services to v2.20.1
- Bump @memberjunction/ng-explorer-settings to v2.20.1
- Bump @memberjunction/ng-base-forms to v2.20.1
- Bump @memberjunction/ng-entity-form-dialog to v2.20.1
- Bump @memberjunction/ng-record-selector to v2.20.1
- Bump @memberjunction/ng-resource-permissions to v2.20.1

## 2.20.0

Sun, 26 Jan 2025 20:07:04 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.20.0
- Bump @memberjunction/core to v2.20.0
- Bump @memberjunction/core-entities to v2.20.0
- Bump @memberjunction/entity-communications-client to v2.20.0
- Bump @memberjunction/communication-types to v2.20.0
- Bump @memberjunction/templates-base-types to v2.20.0
- Bump @memberjunction/ng-compare-records to v2.20.0
- Bump @memberjunction/ng-file-storage to v2.20.0
- Bump @memberjunction/ng-record-changes to v2.20.0
- Bump @memberjunction/ng-container-directives to v2.20.0
- Bump @memberjunction/ng-user-view-grid to v2.20.0
- Bump @memberjunction/ng-query-grid to v2.20.0
- Bump @memberjunction/ng-user-view-properties to v2.20.0
- Bump @memberjunction/ng-shared to v2.20.0
- Bump @memberjunction/ng-tabstrip to v2.20.0
- Bump @memberjunction/ng-skip-chat to v2.20.0
- Bump @memberjunction/ng-ask-skip to v2.20.0
- Bump @memberjunction/ng-auth-services to v2.20.0
- Bump @memberjunction/ng-explorer-settings to v2.20.0
- Bump @memberjunction/ng-base-forms to v2.20.0
- Bump @memberjunction/ng-entity-form-dialog to v2.20.0
- Bump @memberjunction/ng-record-selector to v2.20.0
- Bump @memberjunction/ng-resource-permissions to v2.20.0

## 2.19.5

Thu, 23 Jan 2025 21:51:08 GMT

### Patches

- Bump @memberjunction/global to v2.19.5
- Bump @memberjunction/core to v2.19.5
- Bump @memberjunction/core-entities to v2.19.5
- Bump @memberjunction/entity-communications-client to v2.19.5
- Bump @memberjunction/communication-types to v2.19.5
- Bump @memberjunction/templates-base-types to v2.19.5
- Bump @memberjunction/ng-compare-records to v2.19.5
- Bump @memberjunction/ng-file-storage to v2.19.5
- Bump @memberjunction/ng-record-changes to v2.19.5
- Bump @memberjunction/ng-container-directives to v2.19.5
- Bump @memberjunction/ng-user-view-grid to v2.19.5
- Bump @memberjunction/ng-query-grid to v2.19.5
- Bump @memberjunction/ng-user-view-properties to v2.19.5
- Bump @memberjunction/ng-shared to v2.19.5
- Bump @memberjunction/ng-tabstrip to v2.19.5
- Bump @memberjunction/ng-skip-chat to v2.19.5
- Bump @memberjunction/ng-ask-skip to v2.19.5
- Bump @memberjunction/ng-auth-services to v2.19.5
- Bump @memberjunction/ng-explorer-settings to v2.19.5
- Bump @memberjunction/ng-base-forms to v2.19.5
- Bump @memberjunction/ng-entity-form-dialog to v2.19.5
- Bump @memberjunction/ng-record-selector to v2.19.5
- Bump @memberjunction/ng-resource-permissions to v2.19.5

## 2.19.4

Thu, 23 Jan 2025 17:28:51 GMT

### Patches

- Bump @memberjunction/global to v2.19.4
- Bump @memberjunction/core to v2.19.4
- Bump @memberjunction/core-entities to v2.19.4
- Bump @memberjunction/entity-communications-client to v2.19.4
- Bump @memberjunction/communication-types to v2.19.4
- Bump @memberjunction/templates-base-types to v2.19.4
- Bump @memberjunction/ng-compare-records to v2.19.4
- Bump @memberjunction/ng-file-storage to v2.19.4
- Bump @memberjunction/ng-record-changes to v2.19.4
- Bump @memberjunction/ng-container-directives to v2.19.4
- Bump @memberjunction/ng-user-view-grid to v2.19.4
- Bump @memberjunction/ng-query-grid to v2.19.4
- Bump @memberjunction/ng-user-view-properties to v2.19.4
- Bump @memberjunction/ng-shared to v2.19.4
- Bump @memberjunction/ng-tabstrip to v2.19.4
- Bump @memberjunction/ng-skip-chat to v2.19.4
- Bump @memberjunction/ng-ask-skip to v2.19.4
- Bump @memberjunction/ng-auth-services to v2.19.4
- Bump @memberjunction/ng-explorer-settings to v2.19.4
- Bump @memberjunction/ng-base-forms to v2.19.4
- Bump @memberjunction/ng-entity-form-dialog to v2.19.4
- Bump @memberjunction/ng-record-selector to v2.19.4
- Bump @memberjunction/ng-resource-permissions to v2.19.4

## 2.19.3

Wed, 22 Jan 2025 21:05:42 GMT

### Patches

- Bump @memberjunction/global to v2.19.3
- Bump @memberjunction/core to v2.19.3
- Bump @memberjunction/core-entities to v2.19.3
- Bump @memberjunction/entity-communications-client to v2.19.3
- Bump @memberjunction/communication-types to v2.19.3
- Bump @memberjunction/templates-base-types to v2.19.3
- Bump @memberjunction/ng-compare-records to v2.19.3
- Bump @memberjunction/ng-file-storage to v2.19.3
- Bump @memberjunction/ng-record-changes to v2.19.3
- Bump @memberjunction/ng-container-directives to v2.19.3
- Bump @memberjunction/ng-user-view-grid to v2.19.3
- Bump @memberjunction/ng-query-grid to v2.19.3
- Bump @memberjunction/ng-user-view-properties to v2.19.3
- Bump @memberjunction/ng-shared to v2.19.3
- Bump @memberjunction/ng-tabstrip to v2.19.3
- Bump @memberjunction/ng-skip-chat to v2.19.3
- Bump @memberjunction/ng-ask-skip to v2.19.3
- Bump @memberjunction/ng-auth-services to v2.19.3
- Bump @memberjunction/ng-explorer-settings to v2.19.3
- Bump @memberjunction/ng-base-forms to v2.19.3
- Bump @memberjunction/ng-entity-form-dialog to v2.19.3
- Bump @memberjunction/ng-record-selector to v2.19.3
- Bump @memberjunction/ng-resource-permissions to v2.19.3

## 2.19.2

Wed, 22 Jan 2025 16:39:41 GMT

### Patches

- Bump @memberjunction/global to v2.19.2
- Bump @memberjunction/core to v2.19.2
- Bump @memberjunction/core-entities to v2.19.2
- Bump @memberjunction/entity-communications-client to v2.19.2
- Bump @memberjunction/communication-types to v2.19.2
- Bump @memberjunction/templates-base-types to v2.19.2
- Bump @memberjunction/ng-compare-records to v2.19.2
- Bump @memberjunction/ng-file-storage to v2.19.2
- Bump @memberjunction/ng-record-changes to v2.19.2
- Bump @memberjunction/ng-container-directives to v2.19.2
- Bump @memberjunction/ng-user-view-grid to v2.19.2
- Bump @memberjunction/ng-query-grid to v2.19.2
- Bump @memberjunction/ng-user-view-properties to v2.19.2
- Bump @memberjunction/ng-shared to v2.19.2
- Bump @memberjunction/ng-tabstrip to v2.19.2
- Bump @memberjunction/ng-skip-chat to v2.19.2
- Bump @memberjunction/ng-ask-skip to v2.19.2
- Bump @memberjunction/ng-auth-services to v2.19.2
- Bump @memberjunction/ng-explorer-settings to v2.19.2
- Bump @memberjunction/ng-base-forms to v2.19.2
- Bump @memberjunction/ng-entity-form-dialog to v2.19.2
- Bump @memberjunction/ng-record-selector to v2.19.2
- Bump @memberjunction/ng-resource-permissions to v2.19.2

## 2.19.1

Tue, 21 Jan 2025 14:07:27 GMT

### Patches

- Bump @memberjunction/global to v2.19.1
- Bump @memberjunction/core to v2.19.1
- Bump @memberjunction/core-entities to v2.19.1
- Bump @memberjunction/entity-communications-client to v2.19.1
- Bump @memberjunction/communication-types to v2.19.1
- Bump @memberjunction/templates-base-types to v2.19.1
- Bump @memberjunction/ng-compare-records to v2.19.1
- Bump @memberjunction/ng-file-storage to v2.19.1
- Bump @memberjunction/ng-record-changes to v2.19.1
- Bump @memberjunction/ng-container-directives to v2.19.1
- Bump @memberjunction/ng-user-view-grid to v2.19.1
- Bump @memberjunction/ng-query-grid to v2.19.1
- Bump @memberjunction/ng-user-view-properties to v2.19.1
- Bump @memberjunction/ng-shared to v2.19.1
- Bump @memberjunction/ng-tabstrip to v2.19.1
- Bump @memberjunction/ng-skip-chat to v2.19.1
- Bump @memberjunction/ng-ask-skip to v2.19.1
- Bump @memberjunction/ng-auth-services to v2.19.1
- Bump @memberjunction/ng-explorer-settings to v2.19.1
- Bump @memberjunction/ng-base-forms to v2.19.1
- Bump @memberjunction/ng-entity-form-dialog to v2.19.1
- Bump @memberjunction/ng-record-selector to v2.19.1
- Bump @memberjunction/ng-resource-permissions to v2.19.1

## 2.19.0

Tue, 21 Jan 2025 00:15:48 GMT

### Minor changes

- Bump minor version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.19.0
- Bump @memberjunction/core to v2.19.0
- Bump @memberjunction/core-entities to v2.19.0
- Bump @memberjunction/entity-communications-client to v2.19.0
- Bump @memberjunction/communication-types to v2.19.0
- Bump @memberjunction/templates-base-types to v2.19.0
- Bump @memberjunction/ng-compare-records to v2.19.0
- Bump @memberjunction/ng-file-storage to v2.19.0
- Bump @memberjunction/ng-record-changes to v2.19.0
- Bump @memberjunction/ng-container-directives to v2.19.0
- Bump @memberjunction/ng-user-view-grid to v2.19.0
- Bump @memberjunction/ng-query-grid to v2.19.0
- Bump @memberjunction/ng-user-view-properties to v2.19.0
- Bump @memberjunction/ng-shared to v2.19.0
- Bump @memberjunction/ng-tabstrip to v2.19.0
- Bump @memberjunction/ng-skip-chat to v2.19.0
- Bump @memberjunction/ng-ask-skip to v2.19.0
- Bump @memberjunction/ng-auth-services to v2.19.0
- Bump @memberjunction/ng-explorer-settings to v2.19.0
- Bump @memberjunction/ng-base-forms to v2.19.0
- Bump @memberjunction/ng-entity-form-dialog to v2.19.0
- Bump @memberjunction/ng-record-selector to v2.19.0
- Bump @memberjunction/ng-resource-permissions to v2.19.0

## 2.18.3

Fri, 17 Jan 2025 01:58:34 GMT

### Patches

- Bump @memberjunction/global to v2.18.3
- Bump @memberjunction/core to v2.18.3
- Bump @memberjunction/core-entities to v2.18.3
- Bump @memberjunction/entity-communications-client to v2.18.3
- Bump @memberjunction/communication-types to v2.18.3
- Bump @memberjunction/templates-base-types to v2.18.3
- Bump @memberjunction/ng-compare-records to v2.18.3
- Bump @memberjunction/ng-file-storage to v2.18.3
- Bump @memberjunction/ng-record-changes to v2.18.3
- Bump @memberjunction/ng-container-directives to v2.18.3
- Bump @memberjunction/ng-user-view-grid to v2.18.3
- Bump @memberjunction/ng-query-grid to v2.18.3
- Bump @memberjunction/ng-user-view-properties to v2.18.3
- Bump @memberjunction/ng-shared to v2.18.3
- Bump @memberjunction/ng-tabstrip to v2.18.3
- Bump @memberjunction/ng-skip-chat to v2.18.3
- Bump @memberjunction/ng-ask-skip to v2.18.3
- Bump @memberjunction/ng-auth-services to v2.18.3
- Bump @memberjunction/ng-explorer-settings to v2.18.3
- Bump @memberjunction/ng-base-forms to v2.18.3
- Bump @memberjunction/ng-entity-form-dialog to v2.18.3
- Bump @memberjunction/ng-record-selector to v2.18.3
- Bump @memberjunction/ng-resource-permissions to v2.18.3

## 2.18.2

Thu, 16 Jan 2025 22:06:37 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.18.2
- Bump @memberjunction/core to v2.18.2
- Bump @memberjunction/core-entities to v2.18.2
- Bump @memberjunction/entity-communications-client to v2.18.2
- Bump @memberjunction/communication-types to v2.18.2
- Bump @memberjunction/templates-base-types to v2.18.2
- Bump @memberjunction/ng-compare-records to v2.18.2
- Bump @memberjunction/ng-file-storage to v2.18.2
- Bump @memberjunction/ng-record-changes to v2.18.2
- Bump @memberjunction/ng-container-directives to v2.18.2
- Bump @memberjunction/ng-user-view-grid to v2.18.2
- Bump @memberjunction/ng-query-grid to v2.18.2
- Bump @memberjunction/ng-user-view-properties to v2.18.2
- Bump @memberjunction/ng-shared to v2.18.2
- Bump @memberjunction/ng-tabstrip to v2.18.2
- Bump @memberjunction/ng-skip-chat to v2.18.2
- Bump @memberjunction/ng-ask-skip to v2.18.2
- Bump @memberjunction/ng-auth-services to v2.18.2
- Bump @memberjunction/ng-explorer-settings to v2.18.2
- Bump @memberjunction/ng-base-forms to v2.18.2
- Bump @memberjunction/ng-entity-form-dialog to v2.18.2
- Bump @memberjunction/ng-record-selector to v2.18.2
- Bump @memberjunction/ng-resource-permissions to v2.18.2

## 2.18.1

Thu, 16 Jan 2025 16:25:06 GMT

### Patches

- Bump @memberjunction/global to v2.18.1
- Bump @memberjunction/core to v2.18.1
- Bump @memberjunction/core-entities to v2.18.1
- Bump @memberjunction/entity-communications-client to v2.18.1
- Bump @memberjunction/communication-types to v2.18.1
- Bump @memberjunction/templates-base-types to v2.18.1
- Bump @memberjunction/ng-compare-records to v2.18.1
- Bump @memberjunction/ng-file-storage to v2.18.1
- Bump @memberjunction/ng-record-changes to v2.18.1
- Bump @memberjunction/ng-container-directives to v2.18.1
- Bump @memberjunction/ng-user-view-grid to v2.18.1
- Bump @memberjunction/ng-query-grid to v2.18.1
- Bump @memberjunction/ng-user-view-properties to v2.18.1
- Bump @memberjunction/ng-shared to v2.18.1
- Bump @memberjunction/ng-tabstrip to v2.18.1
- Bump @memberjunction/ng-skip-chat to v2.18.1
- Bump @memberjunction/ng-ask-skip to v2.18.1
- Bump @memberjunction/ng-auth-services to v2.18.1
- Bump @memberjunction/ng-explorer-settings to v2.18.1
- Bump @memberjunction/ng-base-forms to v2.18.1
- Bump @memberjunction/ng-entity-form-dialog to v2.18.1
- Bump @memberjunction/ng-record-selector to v2.18.1
- Bump @memberjunction/ng-resource-permissions to v2.18.1

## 2.18.0

Thu, 16 Jan 2025 06:06:20 GMT

### Minor changes

- Bump @memberjunction/global to v2.18.0
- Bump @memberjunction/core to v2.18.0
- Bump @memberjunction/core-entities to v2.18.0
- Bump @memberjunction/entity-communications-client to v2.18.0
- Bump @memberjunction/communication-types to v2.18.0
- Bump @memberjunction/templates-base-types to v2.18.0
- Bump @memberjunction/ng-compare-records to v2.18.0
- Bump @memberjunction/ng-file-storage to v2.18.0
- Bump @memberjunction/ng-record-changes to v2.18.0
- Bump @memberjunction/ng-container-directives to v2.18.0
- Bump @memberjunction/ng-user-view-grid to v2.18.0
- Bump @memberjunction/ng-query-grid to v2.18.0
- Bump @memberjunction/ng-user-view-properties to v2.18.0
- Bump @memberjunction/ng-shared to v2.18.0
- Bump @memberjunction/ng-tabstrip to v2.18.0
- Bump @memberjunction/ng-skip-chat to v2.18.0
- Bump @memberjunction/ng-ask-skip to v2.18.0
- Bump @memberjunction/ng-auth-services to v2.18.0
- Bump @memberjunction/ng-explorer-settings to v2.18.0
- Bump @memberjunction/ng-base-forms to v2.18.0
- Bump @memberjunction/ng-entity-form-dialog to v2.18.0
- Bump @memberjunction/ng-record-selector to v2.18.0
- Bump @memberjunction/ng-resource-permissions to v2.18.0

## 2.17.0

Wed, 15 Jan 2025 03:17:07 GMT

### Minor changes

- Applying package updates [skip ci] (craig@memberjunction.com)
- Bump @memberjunction/global to v2.17.0
- Bump @memberjunction/core to v2.17.0
- Bump @memberjunction/core-entities to v2.17.0
- Bump @memberjunction/entity-communications-client to v2.17.0
- Bump @memberjunction/communication-types to v2.17.0
- Bump @memberjunction/templates-base-types to v2.17.0
- Bump @memberjunction/ng-compare-records to v2.17.0
- Bump @memberjunction/ng-file-storage to v2.17.0
- Bump @memberjunction/ng-record-changes to v2.17.0
- Bump @memberjunction/ng-container-directives to v2.17.0
- Bump @memberjunction/ng-user-view-grid to v2.17.0
- Bump @memberjunction/ng-query-grid to v2.17.0
- Bump @memberjunction/ng-user-view-properties to v2.17.0
- Bump @memberjunction/ng-shared to v2.17.0
- Bump @memberjunction/ng-tabstrip to v2.17.0
- Bump @memberjunction/ng-skip-chat to v2.17.0
- Bump @memberjunction/ng-ask-skip to v2.17.0
- Bump @memberjunction/ng-auth-services to v2.17.0
- Bump @memberjunction/ng-explorer-settings to v2.17.0
- Bump @memberjunction/ng-base-forms to v2.17.0
- Bump @memberjunction/ng-entity-form-dialog to v2.17.0
- Bump @memberjunction/ng-record-selector to v2.17.0
- Bump @memberjunction/ng-resource-permissions to v2.17.0

## 2.16.1

Tue, 14 Jan 2025 14:12:27 GMT

### Patches

- Fix for SQL scripts (craig@memberjunction.com)
- Bump @memberjunction/global to v2.16.1
- Bump @memberjunction/core to v2.16.1
- Bump @memberjunction/entity-communications-client to v2.16.1
- Bump @memberjunction/communication-types to v2.16.1
- Bump @memberjunction/templates-base-types to v2.16.1
- Bump @memberjunction/ng-compare-records to v2.16.1
- Bump @memberjunction/ng-file-storage to v2.16.1
- Bump @memberjunction/ng-record-changes to v2.16.1
- Bump @memberjunction/ng-container-directives to v2.16.1
- Bump @memberjunction/ng-user-view-grid to v2.16.1
- Bump @memberjunction/ng-query-grid to v2.16.1
- Bump @memberjunction/ng-user-view-properties to v2.16.1
- Bump @memberjunction/ng-shared to v2.16.1
- Bump @memberjunction/ng-tabstrip to v2.16.1
- Bump @memberjunction/ng-skip-chat to v2.16.1
- Bump @memberjunction/ng-ask-skip to v2.16.1
- Bump @memberjunction/ng-auth-services to v2.16.1
- Bump @memberjunction/ng-explorer-settings to v2.16.1
- Bump @memberjunction/ng-base-forms to v2.16.1
- Bump @memberjunction/ng-entity-form-dialog to v2.16.1
- Bump @memberjunction/ng-record-selector to v2.16.1
- Bump @memberjunction/ng-resource-permissions to v2.16.1

## 2.16.0

Tue, 14 Jan 2025 03:59:31 GMT

### Minor changes

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.16.0
- Bump @memberjunction/core to v2.16.0
- Bump @memberjunction/entity-communications-client to v2.16.0
- Bump @memberjunction/communication-types to v2.16.0
- Bump @memberjunction/templates-base-types to v2.16.0
- Bump @memberjunction/ng-compare-records to v2.16.0
- Bump @memberjunction/ng-file-storage to v2.16.0
- Bump @memberjunction/ng-record-changes to v2.16.0
- Bump @memberjunction/ng-container-directives to v2.16.0
- Bump @memberjunction/ng-user-view-grid to v2.16.0
- Bump @memberjunction/ng-query-grid to v2.16.0
- Bump @memberjunction/ng-user-view-properties to v2.16.0
- Bump @memberjunction/ng-shared to v2.16.0
- Bump @memberjunction/ng-tabstrip to v2.16.0
- Bump @memberjunction/ng-skip-chat to v2.16.0
- Bump @memberjunction/ng-ask-skip to v2.16.0
- Bump @memberjunction/ng-auth-services to v2.16.0
- Bump @memberjunction/ng-explorer-settings to v2.16.0
- Bump @memberjunction/ng-base-forms to v2.16.0
- Bump @memberjunction/ng-entity-form-dialog to v2.16.0
- Bump @memberjunction/ng-record-selector to v2.16.0
- Bump @memberjunction/ng-resource-permissions to v2.16.0

## 2.15.2

Mon, 13 Jan 2025 18:14:28 GMT

### Patches

- Bump patch version (craig@memberjunction.com)
- Bump patch version (craig@memberjunction.com)
- Bump @memberjunction/global to v2.15.2
- Bump @memberjunction/core to v2.15.2
- Bump @memberjunction/entity-communications-client to v2.15.2
- Bump @memberjunction/communication-types to v2.15.2
- Bump @memberjunction/templates-base-types to v2.15.2
- Bump @memberjunction/ng-compare-records to v2.15.2
- Bump @memberjunction/ng-file-storage to v2.15.2
- Bump @memberjunction/ng-record-changes to v2.15.2
- Bump @memberjunction/ng-container-directives to v2.15.2
- Bump @memberjunction/ng-user-view-grid to v2.15.2
- Bump @memberjunction/ng-query-grid to v2.15.2
- Bump @memberjunction/ng-user-view-properties to v2.15.2
- Bump @memberjunction/ng-shared to v2.15.2
- Bump @memberjunction/ng-tabstrip to v2.15.2
- Bump @memberjunction/ng-skip-chat to v2.15.2
- Bump @memberjunction/ng-ask-skip to v2.15.2
- Bump @memberjunction/ng-auth-services to v2.15.2
- Bump @memberjunction/ng-explorer-settings to v2.15.2
- Bump @memberjunction/ng-base-forms to v2.15.2
- Bump @memberjunction/ng-entity-form-dialog to v2.15.2
- Bump @memberjunction/ng-record-selector to v2.15.2
- Bump @memberjunction/ng-resource-permissions to v2.15.2

## 2.14.0

Wed, 08 Jan 2025 04:33:32 GMT

### Minor changes

- Bump @memberjunction/global to v2.14.0
- Bump @memberjunction/core to v2.14.0
- Bump @memberjunction/entity-communications-client to v2.14.0
- Bump @memberjunction/communication-types to v2.14.0
- Bump @memberjunction/templates-base-types to v2.14.0
- Bump @memberjunction/ng-compare-records to v2.14.0
- Bump @memberjunction/ng-file-storage to v2.14.0
- Bump @memberjunction/ng-record-changes to v2.14.0
- Bump @memberjunction/ng-container-directives to v2.14.0
- Bump @memberjunction/ng-user-view-grid to v2.14.0
- Bump @memberjunction/ng-query-grid to v2.14.0
- Bump @memberjunction/ng-user-view-properties to v2.14.0
- Bump @memberjunction/ng-shared to v2.14.0
- Bump @memberjunction/ng-tabstrip to v2.14.0
- Bump @memberjunction/ng-skip-chat to v2.14.0
- Bump @memberjunction/ng-ask-skip to v2.14.0
- Bump @memberjunction/ng-auth-services to v2.14.0
- Bump @memberjunction/ng-explorer-settings to v2.14.0
- Bump @memberjunction/ng-base-forms to v2.14.0
- Bump @memberjunction/ng-entity-form-dialog to v2.14.0
- Bump @memberjunction/ng-record-selector to v2.14.0
- Bump @memberjunction/ng-resource-permissions to v2.14.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.13.4

Sun, 22 Dec 2024 04:19:34 GMT

### Patches

- Bump @memberjunction/global to v2.13.4
- Bump @memberjunction/core to v2.13.4
- Bump @memberjunction/entity-communications-client to v2.13.4
- Bump @memberjunction/communication-types to v2.13.4
- Bump @memberjunction/templates-base-types to v2.13.4
- Bump @memberjunction/ng-compare-records to v2.13.4
- Bump @memberjunction/ng-file-storage to v2.13.4
- Bump @memberjunction/ng-record-changes to v2.13.4
- Bump @memberjunction/ng-container-directives to v2.13.4
- Bump @memberjunction/ng-user-view-grid to v2.13.4
- Bump @memberjunction/ng-query-grid to v2.13.4
- Bump @memberjunction/ng-user-view-properties to v2.13.4
- Bump @memberjunction/ng-shared to v2.13.4
- Bump @memberjunction/ng-tabstrip to v2.13.4
- Bump @memberjunction/ng-ask-skip to v2.13.4
- Bump @memberjunction/ng-auth-services to v2.13.4
- Bump @memberjunction/ng-explorer-settings to v2.13.4
- Bump @memberjunction/ng-base-forms to v2.13.4
- Bump @memberjunction/ng-entity-form-dialog to v2.13.4
- Bump @memberjunction/ng-record-selector to v2.13.4
- Bump @memberjunction/ng-resource-permissions to v2.13.4

## 2.13.3

Sat, 21 Dec 2024 21:46:45 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.13.3
- Bump @memberjunction/core to v2.13.3
- Bump @memberjunction/entity-communications-client to v2.13.3
- Bump @memberjunction/communication-types to v2.13.3
- Bump @memberjunction/templates-base-types to v2.13.3
- Bump @memberjunction/ng-compare-records to v2.13.3
- Bump @memberjunction/ng-file-storage to v2.13.3
- Bump @memberjunction/ng-record-changes to v2.13.3
- Bump @memberjunction/ng-container-directives to v2.13.3
- Bump @memberjunction/ng-user-view-grid to v2.13.3
- Bump @memberjunction/ng-query-grid to v2.13.3
- Bump @memberjunction/ng-user-view-properties to v2.13.3
- Bump @memberjunction/ng-shared to v2.13.3
- Bump @memberjunction/ng-tabstrip to v2.13.3
- Bump @memberjunction/ng-ask-skip to v2.13.3
- Bump @memberjunction/ng-auth-services to v2.13.3
- Bump @memberjunction/ng-explorer-settings to v2.13.3
- Bump @memberjunction/ng-base-forms to v2.13.3
- Bump @memberjunction/ng-entity-form-dialog to v2.13.3
- Bump @memberjunction/ng-record-selector to v2.13.3
- Bump @memberjunction/ng-resource-permissions to v2.13.3

## 2.13.2

Tue, 03 Dec 2024 23:30:43 GMT

### Patches

- Bump @memberjunction/global to v2.13.2
- Bump @memberjunction/core to v2.13.2
- Bump @memberjunction/entity-communications-client to v2.13.2
- Bump @memberjunction/communication-types to v2.13.2
- Bump @memberjunction/templates-base-types to v2.13.2
- Bump @memberjunction/ng-compare-records to v2.13.2
- Bump @memberjunction/ng-file-storage to v2.13.2
- Bump @memberjunction/ng-record-changes to v2.13.2
- Bump @memberjunction/ng-container-directives to v2.13.2
- Bump @memberjunction/ng-user-view-grid to v2.13.2
- Bump @memberjunction/ng-query-grid to v2.13.2
- Bump @memberjunction/ng-user-view-properties to v2.13.2
- Bump @memberjunction/ng-shared to v2.13.2
- Bump @memberjunction/ng-tabstrip to v2.13.2
- Bump @memberjunction/ng-ask-skip to v2.13.2
- Bump @memberjunction/ng-auth-services to v2.13.2
- Bump @memberjunction/ng-explorer-settings to v2.13.2
- Bump @memberjunction/ng-base-forms to v2.13.2
- Bump @memberjunction/ng-entity-form-dialog to v2.13.2
- Bump @memberjunction/ng-record-selector to v2.13.2
- Bump @memberjunction/ng-resource-permissions to v2.13.2

## 2.13.1

Wed, 27 Nov 2024 20:42:53 GMT

### Patches

- Bump @memberjunction/global to v2.13.1
- Bump @memberjunction/core to v2.13.1
- Bump @memberjunction/entity-communications-client to v2.13.1
- Bump @memberjunction/communication-types to v2.13.1
- Bump @memberjunction/templates-base-types to v2.13.1
- Bump @memberjunction/ng-compare-records to v2.13.1
- Bump @memberjunction/ng-file-storage to v2.13.1
- Bump @memberjunction/ng-record-changes to v2.13.1
- Bump @memberjunction/ng-container-directives to v2.13.1
- Bump @memberjunction/ng-user-view-grid to v2.13.1
- Bump @memberjunction/ng-query-grid to v2.13.1
- Bump @memberjunction/ng-user-view-properties to v2.13.1
- Bump @memberjunction/ng-shared to v2.13.1
- Bump @memberjunction/ng-tabstrip to v2.13.1
- Bump @memberjunction/ng-ask-skip to v2.13.1
- Bump @memberjunction/ng-auth-services to v2.13.1
- Bump @memberjunction/ng-explorer-settings to v2.13.1
- Bump @memberjunction/ng-base-forms to v2.13.1
- Bump @memberjunction/ng-entity-form-dialog to v2.13.1
- Bump @memberjunction/ng-record-selector to v2.13.1
- Bump @memberjunction/ng-resource-permissions to v2.13.1

## 2.13.0

Wed, 20 Nov 2024 19:21:35 GMT

### Minor changes

- Bump @memberjunction/global to v2.13.0
- Bump @memberjunction/core to v2.13.0
- Bump @memberjunction/entity-communications-client to v2.13.0
- Bump @memberjunction/communication-types to v2.13.0
- Bump @memberjunction/templates-base-types to v2.13.0
- Bump @memberjunction/ng-compare-records to v2.13.0
- Bump @memberjunction/ng-file-storage to v2.13.0
- Bump @memberjunction/ng-record-changes to v2.13.0
- Bump @memberjunction/ng-container-directives to v2.13.0
- Bump @memberjunction/ng-user-view-grid to v2.13.0
- Bump @memberjunction/ng-query-grid to v2.13.0
- Bump @memberjunction/ng-user-view-properties to v2.13.0
- Bump @memberjunction/ng-shared to v2.13.0
- Bump @memberjunction/ng-tabstrip to v2.13.0
- Bump @memberjunction/ng-ask-skip to v2.13.0
- Bump @memberjunction/ng-auth-services to v2.13.0
- Bump @memberjunction/ng-explorer-settings to v2.13.0
- Bump @memberjunction/ng-base-forms to v2.13.0
- Bump @memberjunction/ng-entity-form-dialog to v2.13.0
- Bump @memberjunction/ng-record-selector to v2.13.0
- Bump @memberjunction/ng-resource-permissions to v2.13.0

### Patches

- Applying package updates [skip ci] (nico.ortiz@bluecypress.io)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.12.0

Mon, 04 Nov 2024 23:07:22 GMT

### Minor changes

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.12.0
- Bump @memberjunction/core to v2.12.0
- Bump @memberjunction/entity-communications-client to v2.12.0
- Bump @memberjunction/communication-types to v2.12.0
- Bump @memberjunction/templates-base-types to v2.12.0
- Bump @memberjunction/ng-compare-records to v2.12.0
- Bump @memberjunction/ng-file-storage to v2.12.0
- Bump @memberjunction/ng-record-changes to v2.12.0
- Bump @memberjunction/ng-container-directives to v2.12.0
- Bump @memberjunction/ng-user-view-grid to v2.12.0
- Bump @memberjunction/ng-query-grid to v2.12.0
- Bump @memberjunction/ng-user-view-properties to v2.12.0
- Bump @memberjunction/ng-shared to v2.12.0
- Bump @memberjunction/ng-tabstrip to v2.12.0
- Bump @memberjunction/ng-ask-skip to v2.12.0
- Bump @memberjunction/ng-auth-services to v2.12.0
- Bump @memberjunction/ng-explorer-settings to v2.12.0
- Bump @memberjunction/ng-base-forms to v2.12.0
- Bump @memberjunction/ng-entity-form-dialog to v2.12.0
- Bump @memberjunction/ng-record-selector to v2.12.0
- Bump @memberjunction/ng-resource-permissions to v2.12.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.11.0

Thu, 24 Oct 2024 15:33:07 GMT

### Minor changes

- Bump @memberjunction/global to v2.11.0
- Bump @memberjunction/core to v2.11.0
- Bump @memberjunction/entity-communications-client to v2.11.0
- Bump @memberjunction/communication-types to v2.11.0
- Bump @memberjunction/templates-base-types to v2.11.0
- Bump @memberjunction/ng-compare-records to v2.11.0
- Bump @memberjunction/ng-file-storage to v2.11.0
- Bump @memberjunction/ng-record-changes to v2.11.0
- Bump @memberjunction/ng-container-directives to v2.11.0
- Bump @memberjunction/ng-user-view-grid to v2.11.0
- Bump @memberjunction/ng-query-grid to v2.11.0
- Bump @memberjunction/ng-user-view-properties to v2.11.0
- Bump @memberjunction/ng-shared to v2.11.0
- Bump @memberjunction/ng-tabstrip to v2.11.0
- Bump @memberjunction/ng-ask-skip to v2.11.0
- Bump @memberjunction/ng-auth-services to v2.11.0
- Bump @memberjunction/ng-explorer-settings to v2.11.0
- Bump @memberjunction/ng-base-forms to v2.11.0
- Bump @memberjunction/ng-entity-form-dialog to v2.11.0
- Bump @memberjunction/ng-record-selector to v2.11.0
- Bump @memberjunction/ng-resource-permissions to v2.11.0

## 2.10.0

Wed, 23 Oct 2024 22:49:59 GMT

### Minor changes

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.10.0
- Bump @memberjunction/core to v2.10.0
- Bump @memberjunction/entity-communications-client to v2.10.0
- Bump @memberjunction/communication-types to v2.10.0
- Bump @memberjunction/templates-base-types to v2.10.0
- Bump @memberjunction/ng-compare-records to v2.10.0
- Bump @memberjunction/ng-file-storage to v2.10.0
- Bump @memberjunction/ng-record-changes to v2.10.0
- Bump @memberjunction/ng-container-directives to v2.10.0
- Bump @memberjunction/ng-user-view-grid to v2.10.0
- Bump @memberjunction/ng-query-grid to v2.10.0
- Bump @memberjunction/ng-user-view-properties to v2.10.0
- Bump @memberjunction/ng-shared to v2.10.0
- Bump @memberjunction/ng-tabstrip to v2.10.0
- Bump @memberjunction/ng-ask-skip to v2.10.0
- Bump @memberjunction/ng-auth-services to v2.10.0
- Bump @memberjunction/ng-explorer-settings to v2.10.0
- Bump @memberjunction/ng-base-forms to v2.10.0
- Bump @memberjunction/ng-entity-form-dialog to v2.10.0
- Bump @memberjunction/ng-record-selector to v2.10.0
- Bump @memberjunction/ng-resource-permissions to v2.10.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.9.0

Tue, 22 Oct 2024 14:57:08 GMT

### Minor changes

- Bump @memberjunction/global to v2.9.0
- Bump @memberjunction/core to v2.9.0
- Bump @memberjunction/entity-communications-client to v2.9.0
- Bump @memberjunction/communication-types to v2.9.0
- Bump @memberjunction/templates-base-types to v2.9.0
- Bump @memberjunction/ng-compare-records to v2.9.0
- Bump @memberjunction/ng-file-storage to v2.9.0
- Bump @memberjunction/ng-record-changes to v2.9.0
- Bump @memberjunction/ng-container-directives to v2.9.0
- Bump @memberjunction/ng-user-view-grid to v2.9.0
- Bump @memberjunction/ng-query-grid to v2.9.0
- Bump @memberjunction/ng-user-view-properties to v2.9.0
- Bump @memberjunction/ng-shared to v2.9.0
- Bump @memberjunction/ng-tabstrip to v2.9.0
- Bump @memberjunction/ng-ask-skip to v2.9.0
- Bump @memberjunction/ng-auth-services to v2.9.0
- Bump @memberjunction/ng-explorer-settings to v2.9.0
- Bump @memberjunction/ng-base-forms to v2.9.0
- Bump @memberjunction/ng-entity-form-dialog to v2.9.0
- Bump @memberjunction/ng-record-selector to v2.9.0
- Bump @memberjunction/ng-resource-permissions to v2.9.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.8.0

Tue, 15 Oct 2024 17:01:03 GMT

### Minor changes

- Bump @memberjunction/global to v2.8.0
- Bump @memberjunction/core to v2.8.0
- Bump @memberjunction/entity-communications-client to v2.8.0
- Bump @memberjunction/communication-types to v2.8.0
- Bump @memberjunction/templates-base-types to v2.8.0
- Bump @memberjunction/ng-compare-records to v2.8.0
- Bump @memberjunction/ng-file-storage to v2.8.0
- Bump @memberjunction/ng-record-changes to v2.8.0
- Bump @memberjunction/ng-container-directives to v2.8.0
- Bump @memberjunction/ng-user-view-grid to v2.8.0
- Bump @memberjunction/ng-query-grid to v2.8.0
- Bump @memberjunction/ng-user-view-properties to v2.8.0
- Bump @memberjunction/ng-shared to v2.8.0
- Bump @memberjunction/ng-tabstrip to v2.8.0
- Bump @memberjunction/ng-ask-skip to v2.8.0
- Bump @memberjunction/ng-auth-services to v2.8.0
- Bump @memberjunction/ng-explorer-settings to v2.8.0
- Bump @memberjunction/ng-base-forms to v2.8.0
- Bump @memberjunction/ng-entity-form-dialog to v2.8.0
- Bump @memberjunction/ng-record-selector to v2.8.0
- Bump @memberjunction/ng-resource-permissions to v2.8.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 2.7.1

Tue, 08 Oct 2024 22:16:58 GMT

### Patches

- Applying package updates [skip ci] (nico.ortiz@bluecypress.io)
- Bump @memberjunction/global to v2.7.1
- Bump @memberjunction/core to v2.7.1
- Bump @memberjunction/entity-communications-client to v2.7.1
- Bump @memberjunction/communication-types to v2.7.1
- Bump @memberjunction/templates-base-types to v2.7.1
- Bump @memberjunction/ng-compare-records to v2.7.1
- Bump @memberjunction/ng-file-storage to v2.7.1
- Bump @memberjunction/ng-record-changes to v2.7.1
- Bump @memberjunction/ng-container-directives to v2.7.1
- Bump @memberjunction/ng-user-view-grid to v2.7.1
- Bump @memberjunction/ng-query-grid to v2.7.1
- Bump @memberjunction/ng-user-view-properties to v2.7.1
- Bump @memberjunction/ng-shared to v2.7.1
- Bump @memberjunction/ng-tabstrip to v2.7.1
- Bump @memberjunction/ng-ask-skip to v2.7.1
- Bump @memberjunction/ng-auth-services to v2.7.1
- Bump @memberjunction/ng-explorer-settings to v2.7.1
- Bump @memberjunction/ng-base-forms to v2.7.1
- Bump @memberjunction/ng-entity-form-dialog to v2.7.1
- Bump @memberjunction/ng-record-selector to v2.7.1

## 2.7.0

Thu, 03 Oct 2024 23:03:31 GMT

### Minor changes

- Bump minor version (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.7.0
- Bump @memberjunction/core to v2.7.0
- Bump @memberjunction/entity-communications-client to v2.7.0
- Bump @memberjunction/communication-types to v2.7.0
- Bump @memberjunction/templates-base-types to v2.7.0
- Bump @memberjunction/ng-compare-records to v2.7.0
- Bump @memberjunction/ng-file-storage to v2.7.0
- Bump @memberjunction/ng-record-changes to v2.7.0
- Bump @memberjunction/ng-container-directives to v2.7.0
- Bump @memberjunction/ng-user-view-grid to v2.7.0
- Bump @memberjunction/ng-query-grid to v2.7.0
- Bump @memberjunction/ng-user-view-properties to v2.7.0
- Bump @memberjunction/ng-shared to v2.7.0
- Bump @memberjunction/ng-tabstrip to v2.7.0
- Bump @memberjunction/ng-ask-skip to v2.7.0
- Bump @memberjunction/ng-auth-services to v2.7.0
- Bump @memberjunction/ng-explorer-settings to v2.7.0
- Bump @memberjunction/ng-base-forms to v2.7.0
- Bump @memberjunction/ng-entity-form-dialog to v2.7.0
- Bump @memberjunction/ng-record-selector to v2.7.0

## 2.6.1

Mon, 30 Sep 2024 15:55:48 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.6.1
- Bump @memberjunction/core to v2.6.1
- Bump @memberjunction/entity-communications-client to v2.6.1
- Bump @memberjunction/communication-types to v2.6.1
- Bump @memberjunction/templates-base-types to v2.6.1
- Bump @memberjunction/ng-compare-records to v2.6.1
- Bump @memberjunction/ng-file-storage to v2.6.1
- Bump @memberjunction/ng-record-changes to v2.6.1
- Bump @memberjunction/ng-container-directives to v2.6.1
- Bump @memberjunction/ng-user-view-grid to v2.6.1
- Bump @memberjunction/ng-query-grid to v2.6.1
- Bump @memberjunction/ng-user-view-properties to v2.6.1
- Bump @memberjunction/ng-shared to v2.6.1
- Bump @memberjunction/ng-tabstrip to v2.6.1
- Bump @memberjunction/ng-ask-skip to v2.6.1
- Bump @memberjunction/ng-auth-services to v2.6.1
- Bump @memberjunction/ng-explorer-settings to v2.6.1
- Bump @memberjunction/ng-base-forms to v2.6.1
- Bump @memberjunction/ng-entity-form-dialog to v2.6.1
- Bump @memberjunction/ng-record-selector to v2.6.1

## 2.6.0

Sat, 28 Sep 2024 00:19:39 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.6.0
- Bump @memberjunction/core to v2.6.0
- Bump @memberjunction/entity-communications-client to v2.6.0
- Bump @memberjunction/communication-types to v2.6.0
- Bump @memberjunction/templates-base-types to v2.6.0
- Bump @memberjunction/ng-compare-records to v2.6.0
- Bump @memberjunction/ng-file-storage to v2.6.0
- Bump @memberjunction/ng-record-changes to v2.6.0
- Bump @memberjunction/ng-container-directives to v2.6.0
- Bump @memberjunction/ng-user-view-grid to v2.6.0
- Bump @memberjunction/ng-query-grid to v2.6.0
- Bump @memberjunction/ng-user-view-properties to v2.6.0
- Bump @memberjunction/ng-shared to v2.6.0
- Bump @memberjunction/ng-tabstrip to v2.6.0
- Bump @memberjunction/ng-ask-skip to v2.6.0
- Bump @memberjunction/ng-auth-services to v2.6.0
- Bump @memberjunction/ng-explorer-settings to v2.6.0
- Bump @memberjunction/ng-base-forms to v2.6.0
- Bump @memberjunction/ng-entity-form-dialog to v2.6.0
- Bump @memberjunction/ng-record-selector to v2.6.0

## 2.5.2

Sat, 28 Sep 2024 00:06:02 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)

### Patches

- Bump @memberjunction/global to v2.5.2
- Bump @memberjunction/core to v2.5.2
- Bump @memberjunction/entity-communications-client to v2.5.2
- Bump @memberjunction/communication-types to v2.5.2
- Bump @memberjunction/templates-base-types to v2.5.2
- Bump @memberjunction/ng-compare-records to v2.5.2
- Bump @memberjunction/ng-file-storage to v2.5.2
- Bump @memberjunction/ng-record-changes to v2.5.2
- Bump @memberjunction/ng-container-directives to v2.5.2
- Bump @memberjunction/ng-user-view-grid to v2.5.2
- Bump @memberjunction/ng-query-grid to v2.5.2
- Bump @memberjunction/ng-user-view-properties to v2.5.2
- Bump @memberjunction/ng-shared to v2.5.2
- Bump @memberjunction/ng-tabstrip to v2.5.2
- Bump @memberjunction/ng-ask-skip to v2.5.2
- Bump @memberjunction/ng-auth-services to v2.5.2
- Bump @memberjunction/ng-explorer-settings to v2.5.2
- Bump @memberjunction/ng-base-forms to v2.5.2
- Bump @memberjunction/ng-entity-form-dialog to v2.5.2
- Bump @memberjunction/ng-record-selector to v2.5.2

## 2.5.1

Fri, 20 Sep 2024 17:51:58 GMT

### Patches

- Bump @memberjunction/global to v2.5.1
- Bump @memberjunction/core to v2.5.1
- Bump @memberjunction/entity-communications-client to v2.5.1
- Bump @memberjunction/communication-types to v2.5.1
- Bump @memberjunction/templates-base-types to v2.5.1
- Bump @memberjunction/ng-compare-records to v2.5.1
- Bump @memberjunction/ng-file-storage to v2.5.1
- Bump @memberjunction/ng-record-changes to v2.5.1
- Bump @memberjunction/ng-container-directives to v2.5.1
- Bump @memberjunction/ng-user-view-grid to v2.5.1
- Bump @memberjunction/ng-query-grid to v2.5.1
- Bump @memberjunction/ng-user-view-properties to v2.5.1
- Bump @memberjunction/ng-shared to v2.5.1
- Bump @memberjunction/ng-tabstrip to v2.5.1
- Bump @memberjunction/ng-ask-skip to v2.5.1
- Bump @memberjunction/ng-auth-services to v2.5.1
- Bump @memberjunction/ng-explorer-settings to v2.5.1
- Bump @memberjunction/ng-base-forms to v2.5.1
- Bump @memberjunction/ng-entity-form-dialog to v2.5.1
- Bump @memberjunction/ng-record-selector to v2.5.1

## 2.5.0

Fri, 20 Sep 2024 16:17:06 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.5.0
- Bump @memberjunction/core to v2.5.0
- Bump @memberjunction/entity-communications-client to v2.5.0
- Bump @memberjunction/communication-types to v2.5.0
- Bump @memberjunction/templates-base-types to v2.5.0
- Bump @memberjunction/ng-compare-records to v2.5.0
- Bump @memberjunction/ng-file-storage to v2.5.0
- Bump @memberjunction/ng-record-changes to v2.5.0
- Bump @memberjunction/ng-container-directives to v2.5.0
- Bump @memberjunction/ng-user-view-grid to v2.5.0
- Bump @memberjunction/ng-query-grid to v2.5.0
- Bump @memberjunction/ng-user-view-properties to v2.5.0
- Bump @memberjunction/ng-shared to v2.5.0
- Bump @memberjunction/ng-tabstrip to v2.5.0
- Bump @memberjunction/ng-ask-skip to v2.5.0
- Bump @memberjunction/ng-auth-services to v2.5.0
- Bump @memberjunction/ng-explorer-settings to v2.5.0
- Bump @memberjunction/ng-base-forms to v2.5.0
- Bump @memberjunction/ng-entity-form-dialog to v2.5.0
- Bump @memberjunction/ng-record-selector to v2.5.0

## 2.4.1

Sun, 08 Sep 2024 19:33:23 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.4.1
- Bump @memberjunction/core to v2.4.1
- Bump @memberjunction/entity-communications-client to v2.4.1
- Bump @memberjunction/communication-types to v2.4.1
- Bump @memberjunction/templates-base-types to v2.4.1
- Bump @memberjunction/ng-compare-records to v2.4.1
- Bump @memberjunction/ng-file-storage to v2.4.1
- Bump @memberjunction/ng-record-changes to v2.4.1
- Bump @memberjunction/ng-container-directives to v2.4.1
- Bump @memberjunction/ng-user-view-grid to v2.4.1
- Bump @memberjunction/ng-query-grid to v2.4.1
- Bump @memberjunction/ng-user-view-properties to v2.4.1
- Bump @memberjunction/ng-shared to v2.4.1
- Bump @memberjunction/ng-tabstrip to v2.4.1
- Bump @memberjunction/ng-ask-skip to v2.4.1
- Bump @memberjunction/ng-auth-services to v2.4.1
- Bump @memberjunction/ng-explorer-settings to v2.4.1
- Bump @memberjunction/ng-base-forms to v2.4.1
- Bump @memberjunction/ng-entity-form-dialog to v2.4.1
- Bump @memberjunction/ng-record-selector to v2.4.1

## 2.4.0

Sat, 07 Sep 2024 18:07:40 GMT

### Minor changes

- Bump minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.4.0
- Bump @memberjunction/core to v2.4.0
- Bump @memberjunction/ng-compare-records to v2.4.0
- Bump @memberjunction/ng-file-storage to v2.4.0
- Bump @memberjunction/ng-record-changes to v2.4.0
- Bump @memberjunction/ng-container-directives to v2.4.0
- Bump @memberjunction/ng-user-view-grid to v2.4.0
- Bump @memberjunction/ng-query-grid to v2.4.0
- Bump @memberjunction/ng-user-view-properties to v2.4.0
- Bump @memberjunction/ng-shared to v2.4.0
- Bump @memberjunction/ng-tabstrip to v2.4.0
- Bump @memberjunction/ng-ask-skip to v2.4.0
- Bump @memberjunction/ng-auth-services to v2.4.0
- Bump @memberjunction/ng-explorer-settings to v2.4.0
- Bump @memberjunction/ng-base-forms to v2.4.0
- Bump @memberjunction/ng-entity-form-dialog to v2.4.0
- Bump @memberjunction/ng-record-selector to v2.4.0

## 2.3.3

Sat, 07 Sep 2024 17:28:16 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.3.3
- Bump @memberjunction/core to v2.3.3
- Bump @memberjunction/ng-compare-records to v2.3.3
- Bump @memberjunction/ng-file-storage to v2.3.3
- Bump @memberjunction/ng-record-changes to v2.3.3
- Bump @memberjunction/ng-container-directives to v2.3.3
- Bump @memberjunction/ng-user-view-grid to v2.3.3
- Bump @memberjunction/ng-query-grid to v2.3.3
- Bump @memberjunction/ng-user-view-properties to v2.3.3
- Bump @memberjunction/ng-shared to v2.3.3
- Bump @memberjunction/ng-tabstrip to v2.3.3
- Bump @memberjunction/ng-ask-skip to v2.3.3
- Bump @memberjunction/ng-auth-services to v2.3.3
- Bump @memberjunction/ng-explorer-settings to v2.3.3
- Bump @memberjunction/ng-base-forms to v2.3.3
- Bump @memberjunction/ng-entity-form-dialog to v2.3.3
- Bump @memberjunction/ng-record-selector to v2.3.3

## 2.3.2

Fri, 30 Aug 2024 18:25:54 GMT

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v2.3.2
- Bump @memberjunction/core to v2.3.2
- Bump @memberjunction/ng-compare-records to v2.3.2
- Bump @memberjunction/ng-file-storage to v2.3.2
- Bump @memberjunction/ng-record-changes to v2.3.2
- Bump @memberjunction/ng-container-directives to v2.3.2
- Bump @memberjunction/ng-user-view-grid to v2.3.2
- Bump @memberjunction/ng-query-grid to v2.3.2
- Bump @memberjunction/ng-user-view-properties to v2.3.2
- Bump @memberjunction/ng-shared to v2.3.2
- Bump @memberjunction/ng-tabstrip to v2.3.2
- Bump @memberjunction/ng-ask-skip to v2.3.2
- Bump @memberjunction/ng-auth-services to v2.3.2
- Bump @memberjunction/ng-explorer-settings to v2.3.2
- Bump @memberjunction/ng-base-forms to v2.3.2
- Bump @memberjunction/ng-entity-form-dialog to v2.3.2
- Bump @memberjunction/ng-record-selector to v2.3.2

## 2.3.1

Fri, 16 Aug 2024 03:57:15 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v2.3.1
- Bump @memberjunction/core to v2.3.1
- Bump @memberjunction/ng-compare-records to v2.3.1
- Bump @memberjunction/ng-file-storage to v2.3.1
- Bump @memberjunction/ng-record-changes to v2.3.1
- Bump @memberjunction/ng-container-directives to v2.3.1
- Bump @memberjunction/ng-user-view-grid to v2.3.1
- Bump @memberjunction/ng-query-grid to v2.3.1
- Bump @memberjunction/ng-user-view-properties to v2.3.1
- Bump @memberjunction/ng-shared to v2.3.1
- Bump @memberjunction/ng-tabstrip to v2.3.1
- Bump @memberjunction/ng-ask-skip to v2.3.1
- Bump @memberjunction/ng-auth-services to v2.3.1
- Bump @memberjunction/ng-explorer-settings to v2.3.1
- Bump @memberjunction/ng-base-forms to v2.3.1
- Bump @memberjunction/ng-entity-form-dialog to v2.3.1
- Bump @memberjunction/ng-record-selector to v2.3.1

## 2.3.0

Fri, 16 Aug 2024 03:10:41 GMT

### Minor changes

- Bump @memberjunction/global to v2.3.0
- Bump @memberjunction/core to v2.2.2
- Bump @memberjunction/ng-compare-records to v2.3.0
- Bump @memberjunction/ng-file-storage to v2.3.0
- Bump @memberjunction/ng-record-changes to v2.3.0
- Bump @memberjunction/ng-container-directives to v2.3.0
- Bump @memberjunction/ng-user-view-grid to v2.3.0
- Bump @memberjunction/ng-query-grid to v2.3.0
- Bump @memberjunction/ng-user-view-properties to v2.3.0
- Bump @memberjunction/ng-shared to v2.3.0
- Bump @memberjunction/ng-tabstrip to v2.3.0
- Bump @memberjunction/ng-ask-skip to v2.3.0
- Bump @memberjunction/ng-auth-services to v2.3.0
- Bump @memberjunction/ng-explorer-settings to v2.3.0
- Bump @memberjunction/ng-base-forms to v2.3.0
- Bump @memberjunction/ng-entity-form-dialog to v2.3.0
- Bump @memberjunction/ng-record-selector to v2.3.0

## 2.2.1

Fri, 09 Aug 2024 01:29:44 GMT

### Patches

- Bump @memberjunction/global to v2.2.1
- Bump @memberjunction/core to v2.2.1
- Bump @memberjunction/ng-compare-records to v2.2.1
- Bump @memberjunction/ng-file-storage to v2.2.1
- Bump @memberjunction/ng-record-changes to v2.2.1
- Bump @memberjunction/ng-container-directives to v2.2.1
- Bump @memberjunction/ng-user-view-grid to v2.2.1
- Bump @memberjunction/ng-query-grid to v2.2.1
- Bump @memberjunction/ng-user-view-properties to v2.2.1
- Bump @memberjunction/ng-shared to v2.2.1
- Bump @memberjunction/ng-tabstrip to v2.2.1
- Bump @memberjunction/ng-ask-skip to v2.2.1
- Bump @memberjunction/ng-auth-services to v2.2.1
- Bump @memberjunction/ng-explorer-settings to v2.2.1
- Bump @memberjunction/ng-base-forms to v2.2.1
- Bump @memberjunction/ng-entity-form-dialog to v2.2.1
- Bump @memberjunction/ng-record-selector to v2.2.1

## 2.2.0

Thu, 08 Aug 2024 02:53:16 GMT

### Minor changes

- Bump @memberjunction/global to v2.2.0
- Bump @memberjunction/core to v2.2.0
- Bump @memberjunction/ng-compare-records to v2.2.0
- Bump @memberjunction/ng-file-storage to v2.2.0
- Bump @memberjunction/ng-record-changes to v2.2.0
- Bump @memberjunction/ng-container-directives to v2.2.0
- Bump @memberjunction/ng-user-view-grid to v2.2.0
- Bump @memberjunction/ng-query-grid to v2.2.0
- Bump @memberjunction/ng-user-view-properties to v2.2.0
- Bump @memberjunction/ng-shared to v2.2.0
- Bump @memberjunction/ng-tabstrip to v2.2.0
- Bump @memberjunction/ng-ask-skip to v2.2.0
- Bump @memberjunction/ng-auth-services to v2.2.0
- Bump @memberjunction/ng-explorer-settings to v2.2.0
- Bump @memberjunction/ng-base-forms to v2.2.0
- Bump @memberjunction/ng-entity-form-dialog to v2.2.0
- Bump @memberjunction/ng-record-selector to v2.2.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 2.1.5

Thu, 01 Aug 2024 17:23:11 GMT

### Patches

- Bump @memberjunction/global to v2.1.5
- Bump @memberjunction/core to v2.1.5
- Bump @memberjunction/ng-compare-records to v2.1.5
- Bump @memberjunction/ng-file-storage to v2.1.5
- Bump @memberjunction/ng-record-changes to v2.1.5
- Bump @memberjunction/ng-container-directives to v2.1.5
- Bump @memberjunction/ng-user-view-grid to v2.1.5
- Bump @memberjunction/ng-query-grid to v2.1.5
- Bump @memberjunction/ng-user-view-properties to v2.1.5
- Bump @memberjunction/ng-shared to v2.1.5
- Bump @memberjunction/ng-tabstrip to v2.1.5
- Bump @memberjunction/ng-ask-skip to v2.1.5
- Bump @memberjunction/ng-auth-services to v2.1.5
- Bump @memberjunction/ng-explorer-settings to v2.1.5
- Bump @memberjunction/ng-base-forms to v2.1.5
- Bump @memberjunction/ng-entity-form-dialog to v2.1.5
- Bump @memberjunction/ng-record-selector to v2.1.5

## 2.1.4

Thu, 01 Aug 2024 14:43:41 GMT

### Patches

- Bump @memberjunction/global to v2.1.4
- Bump @memberjunction/core to v2.1.4
- Bump @memberjunction/ng-compare-records to v2.1.4
- Bump @memberjunction/ng-file-storage to v2.1.4
- Bump @memberjunction/ng-record-changes to v2.1.4
- Bump @memberjunction/ng-container-directives to v2.1.4
- Bump @memberjunction/ng-user-view-grid to v2.1.4
- Bump @memberjunction/ng-query-grid to v2.1.4
- Bump @memberjunction/ng-user-view-properties to v2.1.4
- Bump @memberjunction/ng-shared to v2.1.4
- Bump @memberjunction/ng-tabstrip to v2.1.4
- Bump @memberjunction/ng-ask-skip to v2.1.4
- Bump @memberjunction/ng-auth-services to v2.1.4
- Bump @memberjunction/ng-explorer-settings to v2.1.4
- Bump @memberjunction/ng-base-forms to v2.1.4
- Bump @memberjunction/ng-entity-form-dialog to v2.1.4
- Bump @memberjunction/ng-record-selector to v2.1.4

## 2.1.3

Wed, 31 Jul 2024 19:36:47 GMT

### Patches

- Bump @memberjunction/global to v2.1.3
- Bump @memberjunction/core to v2.1.3
- Bump @memberjunction/ng-compare-records to v2.1.3
- Bump @memberjunction/ng-file-storage to v2.1.3
- Bump @memberjunction/ng-record-changes to v2.1.3
- Bump @memberjunction/ng-container-directives to v2.1.3
- Bump @memberjunction/ng-user-view-grid to v2.1.3
- Bump @memberjunction/ng-query-grid to v2.1.3
- Bump @memberjunction/ng-user-view-properties to v2.1.3
- Bump @memberjunction/ng-shared to v2.1.3
- Bump @memberjunction/ng-tabstrip to v2.1.3
- Bump @memberjunction/ng-ask-skip to v2.1.3
- Bump @memberjunction/ng-auth-services to v2.1.3
- Bump @memberjunction/ng-explorer-settings to v2.1.3
- Bump @memberjunction/ng-base-forms to v2.1.3
- Bump @memberjunction/ng-entity-form-dialog to v2.1.3
- Bump @memberjunction/ng-record-selector to v2.1.3

## 2.1.2

Mon, 29 Jul 2024 22:52:11 GMT

### Patches

- Bump @memberjunction/global to v2.1.2
- Bump @memberjunction/core to v2.1.2
- Bump @memberjunction/ng-compare-records to v2.1.2
- Bump @memberjunction/ng-file-storage to v2.1.2
- Bump @memberjunction/ng-record-changes to v2.1.2
- Bump @memberjunction/ng-container-directives to v2.1.2
- Bump @memberjunction/ng-user-view-grid to v2.1.2
- Bump @memberjunction/ng-query-grid to v2.1.2
- Bump @memberjunction/ng-user-view-properties to v2.1.2
- Bump @memberjunction/ng-shared to v2.1.2
- Bump @memberjunction/ng-tabstrip to v2.1.2
- Bump @memberjunction/ng-ask-skip to v2.1.2
- Bump @memberjunction/ng-auth-services to v2.1.2
- Bump @memberjunction/ng-explorer-settings to v2.1.2
- Bump @memberjunction/ng-base-forms to v2.1.2
- Bump @memberjunction/ng-entity-form-dialog to v2.1.2
- Bump @memberjunction/ng-record-selector to v2.1.2

## 2.1.1

Fri, 26 Jul 2024 17:54:29 GMT

### Patches

- Bump @memberjunction/global to v2.1.1
- Bump @memberjunction/core to v2.1.1
- Bump @memberjunction/ng-compare-records to v2.1.1
- Bump @memberjunction/ng-file-storage to v2.1.1
- Bump @memberjunction/ng-record-changes to v2.1.1
- Bump @memberjunction/ng-container-directives to v2.1.1
- Bump @memberjunction/ng-user-view-grid to v2.1.1
- Bump @memberjunction/ng-query-grid to v2.1.1
- Bump @memberjunction/ng-user-view-properties to v2.1.1
- Bump @memberjunction/ng-shared to v2.1.1
- Bump @memberjunction/ng-tabstrip to v2.1.1
- Bump @memberjunction/ng-ask-skip to v2.1.1
- Bump @memberjunction/ng-auth-services to v2.1.1
- Bump @memberjunction/ng-explorer-settings to v2.1.1
- Bump @memberjunction/ng-base-forms to v2.1.1
- Bump @memberjunction/ng-entity-form-dialog to v2.1.1
- Bump @memberjunction/ng-record-selector to v2.1.1

## 1.8.1

Fri, 21 Jun 2024 13:15:28 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.8.1
- Bump @memberjunction/core to v1.8.1
- Bump @memberjunction/ng-compare-records to v1.8.1
- Bump @memberjunction/ng-file-storage to v1.8.1
- Bump @memberjunction/ng-record-changes to v1.8.1
- Bump @memberjunction/ng-container-directives to v1.8.1
- Bump @memberjunction/ng-user-view-grid to v1.8.1
- Bump @memberjunction/ng-query-grid to v1.8.1
- Bump @memberjunction/ng-user-view-properties to v1.8.1
- Bump @memberjunction/ng-shared to v1.8.1
- Bump @memberjunction/ng-tabstrip to v1.8.1
- Bump @memberjunction/ng-ask-skip to v1.8.1
- Bump @memberjunction/ng-auth-services to v1.8.1
- Bump @memberjunction/ng-explorer-settings to v1.8.1
- Bump @memberjunction/ng-base-forms to v1.8.1
- Bump @memberjunction/ng-entity-form-dialog to v1.8.1
- Bump @memberjunction/ng-record-selector to v1.8.1

## 1.8.0

Wed, 19 Jun 2024 16:32:44 GMT

### Minor changes

- Applying package updates [skip ci] (jonathan.stfelix@bluecypress.io)
- Bump @memberjunction/global to v1.8.0
- Bump @memberjunction/core to v1.8.0
- Bump @memberjunction/ng-compare-records to v1.8.0
- Bump @memberjunction/ng-file-storage to v1.8.0
- Bump @memberjunction/ng-record-changes to v1.8.0
- Bump @memberjunction/ng-container-directives to v1.8.0
- Bump @memberjunction/ng-user-view-grid to v1.8.0
- Bump @memberjunction/ng-query-grid to v1.8.0
- Bump @memberjunction/ng-user-view-properties to v1.8.0
- Bump @memberjunction/ng-shared to v1.8.0
- Bump @memberjunction/ng-tabstrip to v1.8.0
- Bump @memberjunction/ng-ask-skip to v1.8.0
- Bump @memberjunction/ng-auth-services to v1.8.0
- Bump @memberjunction/ng-explorer-settings to v1.8.0
- Bump @memberjunction/ng-base-forms to v1.8.0
- Bump @memberjunction/ng-entity-form-dialog to v1.8.0
- Bump @memberjunction/ng-record-selector to v1.8.0

## 1.7.1

Wed, 12 Jun 2024 20:13:29 GMT

### Patches

- Bump @memberjunction/global to v1.7.1
- Bump @memberjunction/core to v1.7.1
- Bump @memberjunction/ng-compare-records to v1.7.1
- Bump @memberjunction/ng-file-storage to v1.7.1
- Bump @memberjunction/ng-record-changes to v1.7.1
- Bump @memberjunction/ng-container-directives to v1.7.1
- Bump @memberjunction/ng-user-view-grid to v1.7.1
- Bump @memberjunction/ng-query-grid to v1.7.1
- Bump @memberjunction/ng-user-view-properties to v1.7.1
- Bump @memberjunction/ng-shared to v1.7.1
- Bump @memberjunction/ng-tabstrip to v1.7.1
- Bump @memberjunction/ng-ask-skip to v1.7.1
- Bump @memberjunction/ng-auth-services to v1.7.1
- Bump @memberjunction/ng-explorer-settings to v1.7.1
- Bump @memberjunction/ng-base-forms to v1.7.1
- Bump @memberjunction/ng-entity-form-dialog to v1.7.1
- Bump @memberjunction/ng-record-selector to v1.7.1

## 1.7.0

Wed, 12 Jun 2024 18:53:39 GMT

### Minor changes

- Bump @memberjunction/global to v1.7.0
- Bump @memberjunction/core to v1.7.0
- Bump @memberjunction/ng-compare-records to v1.7.0
- Bump @memberjunction/ng-file-storage to v1.7.0
- Bump @memberjunction/ng-record-changes to v1.7.0
- Bump @memberjunction/ng-container-directives to v1.7.0
- Bump @memberjunction/ng-user-view-grid to v1.7.0
- Bump @memberjunction/ng-query-grid to v1.7.0
- Bump @memberjunction/ng-user-view-properties to v1.7.0
- Bump @memberjunction/ng-shared to v1.7.0
- Bump @memberjunction/ng-tabstrip to v1.7.0
- Bump @memberjunction/ng-ask-skip to v1.7.0
- Bump @memberjunction/ng-auth-services to v1.7.0
- Bump @memberjunction/ng-explorer-settings to v1.7.0
- Bump @memberjunction/ng-base-forms to v1.7.0
- Bump @memberjunction/ng-entity-form-dialog to v1.7.0
- Bump @memberjunction/ng-record-selector to v1.7.0

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)

## 1.6.1

Tue, 11 Jun 2024 06:50:06 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.6.1
- Bump @memberjunction/core to v1.6.1
- Bump @memberjunction/ng-compare-records to v1.6.1
- Bump @memberjunction/ng-file-storage to v1.6.1
- Bump @memberjunction/ng-record-changes to v1.6.1
- Bump @memberjunction/ng-container-directives to v1.6.1
- Bump @memberjunction/ng-user-view-grid to v1.6.1
- Bump @memberjunction/ng-query-grid to v1.6.1
- Bump @memberjunction/ng-user-view-properties to v1.6.1
- Bump @memberjunction/ng-shared to v1.6.1
- Bump @memberjunction/ng-tabstrip to v1.6.1
- Bump @memberjunction/ng-ask-skip to v1.6.1
- Bump @memberjunction/ng-auth-services to v1.6.1
- Bump @memberjunction/ng-explorer-settings to v1.6.1
- Bump @memberjunction/ng-base-forms to v1.6.1
- Bump @memberjunction/ng-entity-form-dialog to v1.6.1

## 1.6.0

Tue, 11 Jun 2024 04:59:29 GMT

### Minor changes

- Bump @memberjunction/global to v1.6.0
- Bump @memberjunction/core to v1.6.0
- Bump @memberjunction/ng-compare-records to v1.6.0
- Bump @memberjunction/ng-file-storage to v1.6.0
- Bump @memberjunction/ng-record-changes to v1.6.0
- Bump @memberjunction/ng-container-directives to v1.6.0
- Bump @memberjunction/ng-user-view-grid to v1.5.4
- Bump @memberjunction/ng-query-grid to v1.6.0
- Bump @memberjunction/ng-user-view-properties to v1.6.0
- Bump @memberjunction/ng-shared to v1.6.0
- Bump @memberjunction/ng-tabstrip to v1.6.0
- Bump @memberjunction/ng-ask-skip to v1.6.0
- Bump @memberjunction/ng-auth-services to v1.6.0
- Bump @memberjunction/ng-explorer-settings to v1.6.0
- Bump @memberjunction/ng-base-forms to v1.6.0
- Bump @memberjunction/ng-entity-form-dialog to v1.6.0

## 1.5.3

Tue, 11 Jun 2024 04:01:37 GMT

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.5.3
- Bump @memberjunction/core to v1.5.3
- Bump @memberjunction/ng-compare-records to v1.5.3
- Bump @memberjunction/ng-file-storage to v1.5.3
- Bump @memberjunction/ng-record-changes to v1.5.3
- Bump @memberjunction/ng-container-directives to v1.5.3
- Bump @memberjunction/ng-user-view-grid to v1.5.3
- Bump @memberjunction/ng-query-grid to v1.5.3
- Bump @memberjunction/ng-user-view-properties to v1.5.3
- Bump @memberjunction/ng-shared to v1.5.3
- Bump @memberjunction/ng-tabstrip to v1.5.3
- Bump @memberjunction/ng-ask-skip to v1.5.3
- Bump @memberjunction/ng-auth-services to v1.5.3
- Bump @memberjunction/ng-explorer-settings to v1.5.3
- Bump @memberjunction/ng-base-forms to v1.5.3
- Bump @memberjunction/ng-entity-form-dialog to v1.5.3

## 1.5.2

Fri, 07 Jun 2024 15:05:21 GMT

### Patches

- Bump @memberjunction/global to v1.5.2
- Bump @memberjunction/core to v1.5.2
- Bump @memberjunction/ng-compare-records to v1.5.2
- Bump @memberjunction/ng-file-storage to v1.5.2
- Bump @memberjunction/ng-record-changes to v1.5.2
- Bump @memberjunction/ng-container-directives to v1.5.2
- Bump @memberjunction/ng-user-view-grid to v1.5.2
- Bump @memberjunction/ng-query-grid to v1.5.2
- Bump @memberjunction/ng-user-view-properties to v1.5.2
- Bump @memberjunction/ng-shared to v1.5.2
- Bump @memberjunction/ng-tabstrip to v1.5.2
- Bump @memberjunction/ng-ask-skip to v1.5.2
- Bump @memberjunction/ng-auth-services to v1.5.2
- Bump @memberjunction/ng-explorer-settings to v1.5.2
- Bump @memberjunction/ng-base-forms to v1.5.2
- Bump @memberjunction/ng-entity-form-dialog to v1.5.2

## 1.5.1

Fri, 07 Jun 2024 14:26:47 GMT

### Patches

- Bump @memberjunction/global to v1.5.1
- Bump @memberjunction/core to v1.5.1
- Bump @memberjunction/ng-compare-records to v1.5.1
- Bump @memberjunction/ng-file-storage to v1.5.1
- Bump @memberjunction/ng-record-changes to v1.5.1
- Bump @memberjunction/ng-container-directives to v1.5.1
- Bump @memberjunction/ng-user-view-grid to v1.5.1
- Bump @memberjunction/ng-query-grid to v1.5.1
- Bump @memberjunction/ng-user-view-properties to v1.5.1
- Bump @memberjunction/ng-shared to v1.5.1
- Bump @memberjunction/ng-tabstrip to v1.5.1
- Bump @memberjunction/ng-ask-skip to v1.5.1
- Bump @memberjunction/ng-auth-services to v1.5.1
- Bump @memberjunction/ng-explorer-settings to v1.5.1
- Bump @memberjunction/ng-base-forms to v1.5.1
- Bump @memberjunction/ng-entity-form-dialog to v1.5.1

## 1.5.0

Fri, 07 Jun 2024 05:45:57 GMT

### Minor changes

- Update minor version (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.5.0
- Bump @memberjunction/core to v1.5.0
- Bump @memberjunction/ng-compare-records to v1.5.0
- Bump @memberjunction/ng-file-storage to v1.5.0
- Bump @memberjunction/ng-record-changes to v1.5.0
- Bump @memberjunction/ng-container-directives to v1.5.0
- Bump @memberjunction/ng-user-view-grid to v1.5.0
- Bump @memberjunction/ng-query-grid to v1.5.0
- Bump @memberjunction/ng-user-view-properties to v1.5.0
- Bump @memberjunction/ng-shared to v1.5.0
- Bump @memberjunction/ng-tabstrip to v1.5.0
- Bump @memberjunction/ng-ask-skip to v1.5.0
- Bump @memberjunction/ng-auth-services to v1.5.0
- Bump @memberjunction/ng-explorer-settings to v1.5.0
- Bump @memberjunction/ng-base-forms to v1.5.0
- Bump @memberjunction/ng-entity-form-dialog to v1.5.0

## 1.4.1

Fri, 07 Jun 2024 04:36:54 GMT

### Minor changes

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

### Patches

- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.4.1
- Bump @memberjunction/core to v1.4.1
- Bump @memberjunction/ng-compare-records to v1.4.1
- Bump @memberjunction/ng-file-storage to v1.4.1
- Bump @memberjunction/ng-record-changes to v1.4.1
- Bump @memberjunction/ng-container-directives to v1.4.1
- Bump @memberjunction/ng-user-view-grid to v1.4.1
- Bump @memberjunction/ng-query-grid to v1.4.1
- Bump @memberjunction/ng-user-view-properties to v1.4.1
- Bump @memberjunction/ng-shared to v1.4.1
- Bump @memberjunction/ng-tabstrip to v1.4.1
- Bump @memberjunction/ng-ask-skip to v1.4.1
- Bump @memberjunction/ng-auth-services to v1.4.1
- Bump @memberjunction/ng-explorer-settings to v1.4.1
- Bump @memberjunction/ng-base-forms to v1.4.1
- Bump @memberjunction/ng-entity-form-dialog to v1.4.1

## 1.4.0

Sat, 25 May 2024 15:30:17 GMT

### Minor changes

- Updates to SQL scripts (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.4.0
- Bump @memberjunction/core to v1.4.0
- Bump @memberjunction/ng-compare-records to v1.4.0
- Bump @memberjunction/ng-file-storage to v1.4.0
- Bump @memberjunction/ng-record-changes to v1.4.0
- Bump @memberjunction/ng-container-directives to v1.4.0
- Bump @memberjunction/ng-user-view-grid to v1.4.0
- Bump @memberjunction/ng-query-grid to v1.4.0
- Bump @memberjunction/ng-user-view-properties to v1.4.0
- Bump @memberjunction/ng-shared to v1.4.0
- Bump @memberjunction/ng-tabstrip to v1.4.0
- Bump @memberjunction/ng-ask-skip to v1.4.0
- Bump @memberjunction/ng-auth-services to v1.4.0
- Bump @memberjunction/ng-explorer-settings to v1.4.0
- Bump @memberjunction/ng-base-forms to v1.4.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 1.3.3

Thu, 23 May 2024 18:35:52 GMT

### Patches

- Bump @memberjunction/global to v1.3.3
- Bump @memberjunction/core to v1.3.3
- Bump @memberjunction/ng-compare-records to v1.3.3
- Bump @memberjunction/ng-file-storage to v1.3.3
- Bump @memberjunction/ng-record-changes to v1.3.3
- Bump @memberjunction/ng-container-directives to v1.3.3
- Bump @memberjunction/ng-user-view-grid to v1.3.3
- Bump @memberjunction/ng-query-grid to v1.3.3
- Bump @memberjunction/ng-user-view-properties to v1.3.3
- Bump @memberjunction/ng-shared to v1.3.3
- Bump @memberjunction/ng-tabstrip to v1.3.3
- Bump @memberjunction/ng-ask-skip to v1.3.3
- Bump @memberjunction/ng-auth-services to v1.3.3
- Bump @memberjunction/ng-explorer-settings to v1.3.3
- Bump @memberjunction/ng-base-forms to v1.3.3

## 1.3.2

Thu, 23 May 2024 14:19:50 GMT

### Patches

- Bump @memberjunction/global to v1.3.2
- Bump @memberjunction/core to v1.3.2
- Bump @memberjunction/ng-compare-records to v1.3.2
- Bump @memberjunction/ng-file-storage to v1.3.2
- Bump @memberjunction/ng-record-changes to v1.3.2
- Bump @memberjunction/ng-container-directives to v1.3.2
- Bump @memberjunction/ng-user-view-grid to v1.3.2
- Bump @memberjunction/ng-query-grid to v1.3.2
- Bump @memberjunction/ng-user-view-properties to v1.3.2
- Bump @memberjunction/ng-shared to v1.3.2
- Bump @memberjunction/ng-tabstrip to v1.3.2
- Bump @memberjunction/ng-ask-skip to v1.3.2
- Bump @memberjunction/ng-auth-services to v1.3.2
- Bump @memberjunction/ng-explorer-settings to v1.3.2
- Bump @memberjunction/ng-base-forms to v1.3.2

## 1.3.1

Thu, 23 May 2024 02:29:25 GMT

### Patches

- Bump @memberjunction/global to v1.3.1
- Bump @memberjunction/core to v1.3.1
- Bump @memberjunction/ng-compare-records to v1.3.1
- Bump @memberjunction/ng-file-storage to v1.3.1
- Bump @memberjunction/ng-record-changes to v1.3.1
- Bump @memberjunction/ng-container-directives to v1.3.1
- Bump @memberjunction/ng-user-view-grid to v1.3.1
- Bump @memberjunction/ng-query-grid to v1.3.1
- Bump @memberjunction/ng-user-view-properties to v1.3.1
- Bump @memberjunction/ng-shared to v1.3.1
- Bump @memberjunction/ng-tabstrip to v1.3.1
- Bump @memberjunction/ng-ask-skip to v1.3.1
- Bump @memberjunction/ng-auth-services to v1.3.1
- Bump @memberjunction/ng-explorer-settings to v1.3.1
- Bump @memberjunction/ng-base-forms to v1.3.1

## 1.3.0

Wed, 22 May 2024 02:26:03 GMT

### Minor changes

- Overhaul the way we vectorize records (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.3.0
- Bump @memberjunction/core to v1.3.0
- Bump @memberjunction/ng-compare-records to v1.3.0
- Bump @memberjunction/ng-file-storage to v1.3.0
- Bump @memberjunction/ng-record-changes to v1.3.0
- Bump @memberjunction/ng-container-directives to v1.3.0
- Bump @memberjunction/ng-user-view-grid to v1.3.0
- Bump @memberjunction/ng-query-grid to v1.3.0
- Bump @memberjunction/ng-user-view-properties to v1.3.0
- Bump @memberjunction/ng-shared to v1.3.0
- Bump @memberjunction/ng-tabstrip to v1.3.0
- Bump @memberjunction/ng-ask-skip to v1.3.0
- Bump @memberjunction/ng-auth-services to v1.3.0
- Bump @memberjunction/ng-explorer-settings to v1.3.0
- Bump @memberjunction/ng-base-forms to v1.3.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)
- Applying package updates [skip ci] (craig.adam@bluecypress.io)

## 1.2.2

Thu, 02 May 2024 19:46:38 GMT

### Patches

- Applying package updates [skip ci] (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.2.2
- Bump @memberjunction/core to v1.2.2
- Bump @memberjunction/ng-compare-records to v1.2.2
- Bump @memberjunction/ng-file-storage to v1.2.2
- Bump @memberjunction/ng-record-changes to v1.2.2
- Bump @memberjunction/ng-container-directives to v1.2.2
- Bump @memberjunction/ng-user-view-grid to v1.2.2
- Bump @memberjunction/ng-query-grid to v1.2.2
- Bump @memberjunction/ng-user-view-properties to v1.2.2
- Bump @memberjunction/ng-shared to v1.2.2
- Bump @memberjunction/ng-tabstrip to v1.2.2
- Bump @memberjunction/ng-ask-skip to v1.2.2
- Bump @memberjunction/ng-auth-services to v1.2.2
- Bump @memberjunction/ng-explorer-settings to v1.2.2
- Bump @memberjunction/ng-base-forms to v1.2.2

## 1.2.1

Thu, 02 May 2024 16:46:11 GMT

### Minor changes

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

### Patches

- Bump @memberjunction/global to v1.2.1
- Bump @memberjunction/core to v1.2.1
- Bump @memberjunction/ng-compare-records to v1.2.1
- Bump @memberjunction/ng-file-storage to v1.2.1
- Bump @memberjunction/ng-record-changes to v1.2.1
- Bump @memberjunction/ng-container-directives to v1.2.1
- Bump @memberjunction/ng-user-view-grid to v1.2.1
- Bump @memberjunction/ng-query-grid to v1.2.1
- Bump @memberjunction/ng-user-view-properties to v1.2.1
- Bump @memberjunction/ng-shared to v1.2.1
- Bump @memberjunction/ng-tabstrip to v1.2.1
- Bump @memberjunction/ng-ask-skip to v1.2.1
- Bump @memberjunction/ng-auth-services to v1.2.1
- Bump @memberjunction/ng-explorer-settings to v1.2.1
- Bump @memberjunction/ng-base-forms to v1.2.1

## 1.2.0

Mon, 29 Apr 2024 18:51:58 GMT

### Minor changes

- Bump @memberjunction/global to v1.2.0
- Bump @memberjunction/core to v1.2.0
- Bump @memberjunction/ng-compare-records to v1.2.0
- Bump @memberjunction/ng-file-storage to v1.2.0
- Bump @memberjunction/ng-record-changes to v1.2.0
- Bump @memberjunction/ng-container-directives to v1.2.0
- Bump @memberjunction/ng-user-view-grid to v1.2.0
- Bump @memberjunction/ng-query-grid to v1.2.0
- Bump @memberjunction/ng-user-view-properties to v1.2.0
- Bump @memberjunction/ng-shared to v1.2.0
- Bump @memberjunction/ng-tabstrip to v1.2.0
- Bump @memberjunction/ng-ask-skip to v1.2.0
- Bump @memberjunction/ng-auth-services to v1.2.0
- Bump @memberjunction/ng-explorer-settings to v1.2.0
- Bump @memberjunction/ng-base-forms to v1.2.0

### Patches

- Applying package updates [skip ci] (155523863+JS-BC@users.noreply.github.com)

## 1.1.3

Fri, 26 Apr 2024 23:48:54 GMT

### Patches

- Bump @memberjunction/global to v1.1.3
- Bump @memberjunction/core to v1.1.3
- Bump @memberjunction/ng-compare-records to v1.1.3
- Bump @memberjunction/ng-file-storage to v1.1.3
- Bump @memberjunction/ng-record-changes to v1.1.3
- Bump @memberjunction/ng-container-directives to v1.1.3
- Bump @memberjunction/ng-user-view-grid to v1.1.3
- Bump @memberjunction/ng-query-grid to v1.1.3
- Bump @memberjunction/ng-user-view-properties to v1.1.3
- Bump @memberjunction/ng-shared to v1.1.3
- Bump @memberjunction/ng-tabstrip to v1.1.3
- Bump @memberjunction/ng-ask-skip to v1.1.3
- Bump @memberjunction/ng-auth-services to v1.1.3
- Bump @memberjunction/ng-explorer-settings to v1.1.3
- Bump @memberjunction/ng-base-forms to v1.1.3

## 1.1.2

Fri, 26 Apr 2024 21:11:21 GMT

### Patches

- Bump @memberjunction/global to v1.1.2
- Bump @memberjunction/core to v1.1.2
- Bump @memberjunction/ng-compare-records to v1.1.2
- Bump @memberjunction/ng-file-storage to v1.1.2
- Bump @memberjunction/ng-record-changes to v1.1.2
- Bump @memberjunction/ng-container-directives to v1.1.2
- Bump @memberjunction/ng-user-view-grid to v1.1.2
- Bump @memberjunction/ng-query-grid to v1.1.2
- Bump @memberjunction/ng-user-view-properties to v1.1.2
- Bump @memberjunction/ng-shared to v1.1.2
- Bump @memberjunction/ng-tabstrip to v1.1.2
- Bump @memberjunction/ng-ask-skip to v1.1.2
- Bump @memberjunction/ng-auth-services to v1.1.2
- Bump @memberjunction/ng-explorer-settings to v1.1.2
- Bump @memberjunction/ng-base-forms to v1.1.2

## 1.1.1

Fri, 26 Apr 2024 17:57:09 GMT

### Patches

- Bump @memberjunction/global to v1.1.1
- Bump @memberjunction/core to v1.1.1
- Bump @memberjunction/ng-compare-records to v1.1.1
- Bump @memberjunction/ng-file-storage to v1.1.1
- Bump @memberjunction/ng-record-changes to v1.1.1
- Bump @memberjunction/ng-container-directives to v1.1.1
- Bump @memberjunction/ng-user-view-grid to v1.1.1
- Bump @memberjunction/ng-query-grid to v1.1.1
- Bump @memberjunction/ng-user-view-properties to v1.1.1
- Bump @memberjunction/ng-shared to v1.1.1
- Bump @memberjunction/ng-tabstrip to v1.1.1
- Bump @memberjunction/ng-ask-skip to v1.1.1
- Bump @memberjunction/ng-auth-services to v1.1.1
- Bump @memberjunction/ng-explorer-settings to v1.1.1
- Bump @memberjunction/ng-base-forms to v1.1.1

## 1.1.0

Fri, 26 Apr 2024 15:23:26 GMT

### Minor changes

- Bump @memberjunction/global to v1.1.0
- Bump @memberjunction/core to v1.1.0
- Bump @memberjunction/ng-compare-records to v1.1.0
- Bump @memberjunction/ng-file-storage to v1.1.0
- Bump @memberjunction/ng-record-changes to v1.1.0
- Bump @memberjunction/ng-container-directives to v1.1.0
- Bump @memberjunction/ng-user-view-grid to v1.1.0
- Bump @memberjunction/ng-query-grid to v1.1.0
- Bump @memberjunction/ng-user-view-properties to v1.1.0
- Bump @memberjunction/ng-shared to v1.1.0
- Bump @memberjunction/ng-tabstrip to v1.1.0
- Bump @memberjunction/ng-ask-skip to v1.1.0
- Bump @memberjunction/ng-auth-services to v1.1.0
- Bump @memberjunction/ng-explorer-settings to v1.1.0
- Bump @memberjunction/ng-base-forms to v1.1.0

## 1.0.11

Wed, 24 Apr 2024 20:57:41 GMT

### Minor changes

- Update base-browser-component.ts (155523863+JS-BC@users.noreply.github.com)
- use new @if and @for, load resourceTypes on init (155523863+JS-BC@users.noreply.github.com)

### Patches

- - bug fixes in Skip UI \* added exception handling to ReportResolver (97354817+AN-BC@users.noreply.github.com)
- change cursor to pointer when hovering over inbox, improve way we fetch resource types (155523863+JS-BC@users.noreply.github.com)
- - Completed removed Kendo SVG Icons and standardized on Font Awesome. Done for consistency, simplicity and also because Kendo SVG Icons seem to be having a major impact on rendering performance/resizing/etc * In several areas while removing KendoSVG and replacing with Font Awesome, implemented the new Angular 17 style control flow (@if instead of *ngIf as an example) (97354817+AN-BC@users.noreply.github.com)
- Bump @memberjunction/global to v1.0.11
- Bump @memberjunction/core to v1.0.11
- Bump @memberjunction/ng-compare-records to v1.0.11
- Bump @memberjunction/ng-file-storage to v1.0.11
- Bump @memberjunction/ng-record-changes to v1.0.11
- Bump @memberjunction/ng-container-directives to v1.0.11
- Bump @memberjunction/ng-user-view-grid to v1.0.11
- Bump @memberjunction/ng-query-grid to v1.0.11
- Bump @memberjunction/ng-user-view-properties to v1.0.11
- Bump @memberjunction/ng-shared to v1.0.11
- Bump @memberjunction/ng-tabstrip to v1.0.11
- Bump @memberjunction/ng-ask-skip to v1.0.11
- Bump @memberjunction/ng-auth-services to v1.0.11
- Bump @memberjunction/ng-explorer-settings to v1.0.11
- Bump @memberjunction/ng-base-forms to v1.0.11

## 1.0.10

Sun, 14 Apr 2024 15:50:05 GMT

### Patches

- Bump @memberjunction/global to v1.0.9
- Bump @memberjunction/core to v1.0.9
- Bump @memberjunction/ng-compare-records to v1.0.9
- Bump @memberjunction/ng-file-storage to v1.0.9
- Bump @memberjunction/ng-record-changes to v1.0.9
- Bump @memberjunction/ng-container-directives to v1.0.9
- Bump @memberjunction/ng-user-view-grid to v1.0.9
- Bump @memberjunction/ng-query-grid to v1.0.9
- Bump @memberjunction/ng-user-view-properties to v1.0.9
- Bump @memberjunction/ng-shared to v1.0.9
- Bump @memberjunction/ng-tabstrip to v1.0.9
- Bump @memberjunction/ng-ask-skip to v1.0.9
- Bump @memberjunction/ng-auth-services to v1.0.9
- Bump @memberjunction/ng-explorer-settings to v1.0.9
- Bump @memberjunction/ng-base-forms to v1.0.9

## 1.0.8

Sat, 13 Apr 2024 02:32:44 GMT

### Patches

- Update build and publish automation (craig.adam@bluecypress.io)
- Bump @memberjunction/global to v1.0.8
- Bump @memberjunction/core to v1.0.8
- Bump @memberjunction/ng-compare-records to v1.0.8
- Bump @memberjunction/ng-file-storage to v1.0.8
- Bump @memberjunction/ng-record-changes to v1.0.8
- Bump @memberjunction/ng-container-directives to v1.0.8
- Bump @memberjunction/ng-user-view-grid to v1.0.8
- Bump @memberjunction/ng-query-grid to v1.0.8
- Bump @memberjunction/ng-user-view-properties to v1.0.8
- Bump @memberjunction/ng-shared to v1.0.8
- Bump @memberjunction/ng-tabstrip to v1.0.8
- Bump @memberjunction/ng-ask-skip to v1.0.8
- Bump @memberjunction/ng-auth-services to v1.0.8
- Bump @memberjunction/ng-explorer-settings to v1.0.8
- Bump @memberjunction/ng-base-forms to v1.0.8
