# Angular Generic Packages

Reusable Angular components and services shared across MemberJunction applications. These 41 packages provide common UI patterns -- chat interfaces, data grids, dashboards, file management, and more -- while integrating with MemberJunction's entity system, metadata, and permissions.

## Packages

### Core & Base Types

Foundation packages that other Generic packages depend on.

| Package | npm | Description |
|---------|-----|-------------|
| [base-types](./base-types/README.md) | `@memberjunction/ng-base-types` | Simple types that are used across many generic Angular UI components for coordination |
| [shared](./shared/README.md) | `@memberjunction/ng-shared-generic` | Utility services and reusable elements used in any Angular application |
| [container-directives](./container-directives/README.md) | `@memberjunction/ng-container-directives` | Fill Container for auto-resizing and plain container directives for element identification/binding |
| [Testing](./Testing/README.md) | `@memberjunction/ng-testing` | Testing components and utilities for Angular applications |

### AI & Chat

Components for AI interactions, chat interfaces, and conversation management.

| Package | npm | Description |
|---------|-----|-------------|
| [chat](./chat/README.md) | `@memberjunction/ng-chat` | Reusable chat component for AI or peer-to-peer chat applications |
| [conversations](./conversations/README.md) | `@memberjunction/ng-conversations` | Conversation, collection, and artifact management components |
| [agents](./agents/README.md) | `@memberjunction/ng-agents` | Reusable components for AI Agent management including permissions panel, dialog, and slideover |
| [ai-test-harness](./ai-test-harness/README.md) | `@memberjunction/ng-ai-test-harness` | Reusable component for testing AI agents and prompts with beautiful UX |
| [skip-chat](./skip-chat/README.md) | `@memberjunction/ng-skip-chat` | **DEPRECATED** -- use `@memberjunction/ng-conversations` instead |
| [artifacts](./artifacts/README.md) | `@memberjunction/ng-artifacts` | Artifact viewer plugin system for rendering different artifact types (JSON, Code, Markdown, HTML, SVG, Components) |

### Entity & Data

Components for viewing, editing, and navigating entity data.

| Package | npm | Description |
|---------|-----|-------------|
| [entity-viewer](./entity-viewer/README.md) | `@memberjunction/ng-entity-viewer` | Components for viewing entity data in multiple formats (grid, cards) with filtering, selection, and shared data management |
| [entity-communication](./entity-communication/README.md) | `@memberjunction/ng-entity-communications` | Components to allow a user to select templates, preview messages, and send them |
| [entity-relationship-diagram](./entity-relationship-diagram/README.md) | `@memberjunction/ng-entity-relationship-diagram` | Entity Relationship Diagram (ERD) component for visualizing entity relationships using D3.js force-directed graphs |
| [data-context](./data-context/README.md) | `@memberjunction/ng-data-context` | Component and pop-up window to display and edit the contents of a data context |
| [deep-diff](./deep-diff/README.md) | `@memberjunction/ng-deep-diff` | Component to display the differences between two objects, using the non-visual functionality from `@memberjunction/global` |
| [record-selector](./record-selector/README.md) | `@memberjunction/ng-record-selector` | Components to allow a user to select/deselect items from a possible set |
| [find-record](./find-record/README.md) | `@memberjunction/ng-find-record` | Component to allow a user to find a single record in any entity |
| [join-grid](./join-grid/README.md) | `@memberjunction/ng-join-grid` | Grid component for displaying/editing the relationship between two entities (e.g., Users + Roles in a single grid) |

### Actions & Workflows

Components for action execution, workflow editing, and task management.

| Package | npm | Description |
|---------|-----|-------------|
| [actions](./actions/README.md) | `@memberjunction/ng-actions` | Reusable components for testing and running actions with no Kendo dependencies |
| [action-gallery](./action-gallery/README.md) | `@memberjunction/ng-action-gallery` | Filterable gallery component for browsing and selecting actions |
| [flow-editor](./flow-editor/README.md) | `@memberjunction/ng-flow-editor` | Generic visual flow editor component powered by Foblex Flow, with an agent-specific Flow Agent Editor |
| [tasks](./tasks/README.md) | `@memberjunction/ng-tasks` | Components for task visualization and management with Gantt chart support |

### Query & Reporting

Components for building queries, viewing results, and filtering data.

| Package | npm | Description |
|---------|-----|-------------|
| [query-grid](./query-grid/README.md) | `@memberjunction/ng-query-grid` | Grid to display any MemberJunction Query |
| [query-viewer](./query-viewer/README.md) | `@memberjunction/ng-query-viewer` | Components for viewing and executing stored queries with parameter input, interactive results grid, and entity linking |
| [filter-builder](./filter-builder/README.md) | `@memberjunction/ng-filter-builder` | Modern, intuitive filter builder for creating complex boolean filter expressions with portable JSON format |

### Dashboard & Layout

Components for dashboards, navigation, content rendering, and notifications.

| Package | npm | Description |
|---------|-----|-------------|
| [dashboard-viewer](./dashboard-viewer/README.md) | `@memberjunction/ng-dashboard-viewer` | Components for metadata-driven dashboards with Golden Layout panels, supporting views, queries, artifacts, and custom content |
| [tab-strip](./tab-strip/README.md) | `@memberjunction/ng-tabstrip` | Simple tab strip component used in the MJ Explorer app and reusable anywhere else |
| [timeline](./timeline/README.md) | `@memberjunction/ng-timeline` | Responsive timeline component; works with MemberJunction entities or plain JavaScript objects with no external dependencies |
| [trees](./trees/README.md) | `@memberjunction/ng-trees` | Tree and tree-dropdown components for hierarchical entity selection |
| [markdown](./markdown/README.md) | `@memberjunction/ng-markdown` | Lightweight markdown component with Prism.js highlighting, Mermaid diagrams, and extensible features |
| [notifications](./notifications/README.md) | `@memberjunction/ng-notifications` | Simple library for displaying user notifications |

### Credentials & Permissions

Components for managing credentials and resource access control.

| Package | npm | Description |
|---------|-----|-------------|
| [credentials](./credentials/README.md) | `@memberjunction/ng-credentials` | Components for credential management -- panels and dialogs for creating and editing credentials |
| [resource-permissions](./resource-permissions/README.md) | `@memberjunction/ng-resource-permissions` | Generic components for displaying/editing permissions for a resource |

### UI Utilities

General-purpose UI components, services, and helpers.

| Package | npm | Description |
|---------|-----|-------------|
| [generic-dialog](./generic-dialog/README.md) | `@memberjunction/ng-generic-dialog` | Component for a generic dialog |
| [code-editor](./code-editor/README.md) | `@memberjunction/ng-code-editor` | Angular code editor component |
| [file-storage](./file-storage/README.md) | `@memberjunction/ng-file-storage` | Components for managing files and related operations |
| [export-service](./export-service/README.md) | `@memberjunction/ng-export-service` | Export service and dialog for exporting data to Excel, CSV, and JSON |
| [list-management](./list-management/README.md) | `@memberjunction/ng-list-management` | Components for managing entity list membership with responsive UI |
| [react](./react/README.md) | `@memberjunction/ng-react` | Angular components for hosting React components in MemberJunction applications |
| [user-avatar](./user-avatar/README.md) | `@memberjunction/ng-user-avatar` | User Avatar Service -- manages user avatar synchronization from auth providers and avatar operations |
| [versions](./versions/README.md) | `@memberjunction/ng-versions` | Version History Components -- label creation, detail viewing, and slide panel |
