# Angular Packages

MemberJunction's Angular UI framework -- the Bootstrap package, Explorer application components, and a comprehensive library of reusable generic components.

## Packages

| Package | npm | Description |
|---------|-----|-------------|
| [Bootstrap](./Bootstrap/README.md) | `@memberjunction/ng-bootstrap` | Angular bootstrap and class registration manifest |

## [Explorer](./Explorer/README.md)

The MJExplorer application -- MemberJunction's primary Angular-based UI for browsing, editing, and managing data.

### Core / Shell

Foundational packages that provide the application shell, routing, authentication, shared utilities, and module bundling.

| Package | npm | Description |
|---------|-----|-------------|
| [explorer-app](./Explorer/explorer-app/README.md) | `@memberjunction/ng-explorer-app` | Complete branded entry point for Explorer-style applications |
| [explorer-core](./Explorer/explorer-core/README.md) | `@memberjunction/ng-explorer-core` | Core Explorer framework: application shell, routing, resource containers, and navigation |
| [explorer-modules](./Explorer/explorer-modules/README.md) | `@memberjunction/ng-explorer-modules` | Consolidated Explorer NgModule bundle that re-exports all Explorer feature modules |
| [kendo-modules](./Explorer/kendo-modules/README.md) | `@memberjunction/ng-kendo-modules` | Consolidated Kendo UI NgModule bundle for shared Kendo component imports |
| [base-application](./Explorer/base-application/README.md) | `@memberjunction/ng-base-application` | BaseApplication class system for app-centric navigation |
| [auth-services](./Explorer/auth-services/README.md) | `@memberjunction/ng-auth-services` | Authentication services with Auth0, MSAL, and Okta provider support |
| [shared](./Explorer/shared/README.md) | `@memberjunction/ng-shared` | Shared Explorer utilities, base components, services, and events used across Explorer packages |
| [workspace-initializer](./Explorer/workspace-initializer/README.md) | `@memberjunction/ng-workspace-initializer` | Workspace initialization service and components for bootstrapping the Explorer environment |

### Forms & Entity Editing

Components for rendering, editing, and managing entity records through metadata-driven forms.

| Package | npm | Description |
|---------|-----|-------------|
| [base-forms](./Explorer/base-forms/README.md) | `@memberjunction/ng-base-forms` | Base form components, field rendering, and validation framework |
| [core-entity-forms](./Explorer/core-entity-forms/README.md) | `@memberjunction/ng-core-entity-forms` | Auto-generated and custom entity forms with dynamic form loading and registration |
| [entity-form-dialog](./Explorer/entity-form-dialog/README.md) | `@memberjunction/ng-entity-form-dialog` | Modal dialog for displaying and editing any entity record |
| [form-toolbar](./Explorer/form-toolbar/README.md) | `@memberjunction/ng-form-toolbar` | Form action toolbar providing save, cancel, delete, and navigation controls |

### Data Grids & Lists

Grid and list components for browsing and managing collections of entity records.

| Package | npm | Description |
|---------|-----|-------------|
| [list-detail-grid](./Explorer/list-detail-grid/README.md) | `@memberjunction/ng-list-detail-grid` | Master-detail grid for displaying dynamic and saved list details |
| [simple-record-list](./Explorer/simple-record-list/README.md) | `@memberjunction/ng-simple-record-list` | Lightweight component for displaying, editing, creating, and deleting records in any entity |

### Dashboards

Dashboard components for administrative and analytical views.

| Package | npm | Description |
|---------|-----|-------------|
| [dashboards](./Explorer/dashboards/README.md) | `@memberjunction/ng-dashboards` | Dashboard components including AI model management, Entity Admin ERD, and Actions configuration |

### Utility & Navigation

Supporting components for linking, permissions, settings, and change tracking.

| Package | npm | Description |
|---------|-----|-------------|
| [link-directives](./Explorer/link-directives/README.md) | `@memberjunction/ng-link-directives` | Directives for turning elements into email, web, or record links |
| [entity-permissions](./Explorer/entity-permissions/README.md) | `@memberjunction/ng-entity-permissions` | Components for displaying and editing entity-level permissions |
| [explorer-settings](./Explorer/explorer-settings/README.md) | `@memberjunction/ng-explorer-settings` | Reusable components for the Explorer settings section |
| [record-changes](./Explorer/record-changes/README.md) | `@memberjunction/ng-record-changes` | Change-tracking dialog with diff visualization for individual records |

## [Generic](./Generic/README.md)

Reusable Angular components and services shared across MemberJunction applications.

### Core & Base Types

Foundation packages that other Generic packages depend on.

| Package | npm | Description |
|---------|-----|-------------|
| [base-types](./Generic/base-types/README.md) | `@memberjunction/ng-base-types` | Simple types that are used across many generic Angular UI components for coordination |
| [shared](./Generic/shared/README.md) | `@memberjunction/ng-shared-generic` | Utility services and reusable elements used in any Angular application |
| [container-directives](./Generic/container-directives/README.md) | `@memberjunction/ng-container-directives` | Fill Container for auto-resizing and plain container directives for element identification/binding |
| [Testing](./Generic/Testing/README.md) | `@memberjunction/ng-testing` | Testing components and utilities for Angular applications |

### AI & Chat

Components for AI interactions, chat interfaces, and conversation management.

| Package | npm | Description |
|---------|-----|-------------|
| [chat](./Generic/chat/README.md) | `@memberjunction/ng-chat` | Reusable chat component for AI or peer-to-peer chat applications |
| [conversations](./Generic/conversations/README.md) | `@memberjunction/ng-conversations` | Conversation, collection, and artifact management components |
| [agents](./Generic/agents/README.md) | `@memberjunction/ng-agents` | Reusable components for AI Agent management including permissions panel, dialog, and slideover |
| [ai-test-harness](./Generic/ai-test-harness/README.md) | `@memberjunction/ng-ai-test-harness` | Reusable component for testing AI agents and prompts with beautiful UX |
| [skip-chat](./Generic/skip-chat/README.md) | `@memberjunction/ng-skip-chat` | **DEPRECATED** -- use `@memberjunction/ng-conversations` instead |
| [artifacts](./Generic/artifacts/README.md) | `@memberjunction/ng-artifacts` | Artifact viewer plugin system for rendering different artifact types (JSON, Code, Markdown, HTML, SVG, Components) |

### Entity & Data

Components for viewing, editing, and navigating entity data.

| Package | npm | Description |
|---------|-----|-------------|
| [entity-viewer](./Generic/entity-viewer/README.md) | `@memberjunction/ng-entity-viewer` | Components for viewing entity data in multiple formats (grid, cards) with filtering, selection, and shared data management |
| [entity-communication](./Generic/entity-communication/README.md) | `@memberjunction/ng-entity-communications` | Components to allow a user to select templates, preview messages, and send them |
| [entity-relationship-diagram](./Generic/entity-relationship-diagram/README.md) | `@memberjunction/ng-entity-relationship-diagram` | Entity Relationship Diagram (ERD) component for visualizing entity relationships using D3.js force-directed graphs |
| [data-context](./Generic/data-context/README.md) | `@memberjunction/ng-data-context` | Component and pop-up window to display and edit the contents of a data context |
| [deep-diff](./Generic/deep-diff/README.md) | `@memberjunction/ng-deep-diff` | Component to display the differences between two objects, using the non-visual functionality from `@memberjunction/global` |
| [record-selector](./Generic/record-selector/README.md) | `@memberjunction/ng-record-selector` | Components to allow a user to select/deselect items from a possible set |
| [find-record](./Generic/find-record/README.md) | `@memberjunction/ng-find-record` | Component to allow a user to find a single record in any entity |
| [join-grid](./Generic/join-grid/README.md) | `@memberjunction/ng-join-grid` | Grid component for displaying/editing the relationship between two entities (e.g., Users + Roles in a single grid) |

### Actions & Workflows

Components for action execution, workflow editing, and task management.

| Package | npm | Description |
|---------|-----|-------------|
| [actions](./Generic/actions/README.md) | `@memberjunction/ng-actions` | Reusable components for testing and running actions with no Kendo dependencies |
| [action-gallery](./Generic/action-gallery/README.md) | `@memberjunction/ng-action-gallery` | Filterable gallery component for browsing and selecting actions |
| [flow-editor](./Generic/flow-editor/README.md) | `@memberjunction/ng-flow-editor` | Generic visual flow editor component powered by Foblex Flow, with an agent-specific Flow Agent Editor |
| [tasks](./Generic/tasks/README.md) | `@memberjunction/ng-tasks` | Components for task visualization and management with Gantt chart support |

### Query & Reporting

Components for building queries, viewing results, and filtering data.

| Package | npm | Description |
|---------|-----|-------------|
| [query-grid](./Generic/query-grid/README.md) | `@memberjunction/ng-query-grid` | Grid to display any MemberJunction Query |
| [query-viewer](./Generic/query-viewer/README.md) | `@memberjunction/ng-query-viewer` | Components for viewing and executing stored queries with parameter input, interactive results grid, and entity linking |
| [filter-builder](./Generic/filter-builder/README.md) | `@memberjunction/ng-filter-builder` | Modern, intuitive filter builder for creating complex boolean filter expressions with portable JSON format |

### Dashboard & Layout

Components for dashboards, navigation, content rendering, and notifications.

| Package | npm | Description |
|---------|-----|-------------|
| [dashboard-viewer](./Generic/dashboard-viewer/README.md) | `@memberjunction/ng-dashboard-viewer` | Components for metadata-driven dashboards with Golden Layout panels, supporting views, queries, artifacts, and custom content |
| [tab-strip](./Generic/tab-strip/README.md) | `@memberjunction/ng-tabstrip` | Simple tab strip component used in the MJ Explorer app and reusable anywhere else |
| [timeline](./Generic/timeline/README.md) | `@memberjunction/ng-timeline` | Responsive timeline component; works with MemberJunction entities or plain JavaScript objects with no external dependencies |
| [trees](./Generic/trees/README.md) | `@memberjunction/ng-trees` | Tree and tree-dropdown components for hierarchical entity selection |
| [markdown](./Generic/markdown/README.md) | `@memberjunction/ng-markdown` | Lightweight markdown component with Prism.js highlighting, Mermaid diagrams, and extensible features |
| [notifications](./Generic/notifications/README.md) | `@memberjunction/ng-notifications` | Simple library for displaying user notifications |

### Credentials & Permissions

Components for managing credentials and resource access control.

| Package | npm | Description |
|---------|-----|-------------|
| [credentials](./Generic/credentials/README.md) | `@memberjunction/ng-credentials` | Components for credential management -- panels and dialogs for creating and editing credentials |
| [resource-permissions](./Generic/resource-permissions/README.md) | `@memberjunction/ng-resource-permissions` | Generic components for displaying/editing permissions for a resource |

### UI Utilities

General-purpose UI components, services, and helpers.

| Package | npm | Description |
|---------|-----|-------------|
| [generic-dialog](./Generic/generic-dialog/README.md) | `@memberjunction/ng-generic-dialog` | Component for a generic dialog |
| [code-editor](./Generic/code-editor/README.md) | `@memberjunction/ng-code-editor` | Angular code editor component |
| [file-storage](./Generic/file-storage/README.md) | `@memberjunction/ng-file-storage` | Components for managing files and related operations |
| [export-service](./Generic/export-service/README.md) | `@memberjunction/ng-export-service` | Export service and dialog for exporting data to Excel, CSV, and JSON |
| [list-management](./Generic/list-management/README.md) | `@memberjunction/ng-list-management` | Components for managing entity list membership with responsive UI |
| [react](./Generic/react/README.md) | `@memberjunction/ng-react` | Angular components for hosting React components in MemberJunction applications |
| [user-avatar](./Generic/user-avatar/README.md) | `@memberjunction/ng-user-avatar` | User Avatar Service -- manages user avatar synchronization from auth providers and avatar operations |
| [versions](./Generic/versions/README.md) | `@memberjunction/ng-versions` | Version History Components -- label creation, detail viewing, and slide panel |
