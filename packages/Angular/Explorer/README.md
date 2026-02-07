# Angular Explorer Packages

These packages comprise the **MJExplorer** application, MemberJunction's primary Angular-based UI for browsing, editing, and managing data. They are published individually under the `@memberjunction` npm scope and consumed together by the MJExplorer host application.

## Packages

### Core / Shell

Foundational packages that provide the application shell, routing, authentication, shared utilities, and module bundling.

| Package | npm | Description |
|---------|-----|-------------|
| [explorer-app](./explorer-app/) | `@memberjunction/ng-explorer-app` | Complete branded entry point for Explorer-style applications |
| [explorer-core](./explorer-core/) | `@memberjunction/ng-explorer-core` | Core Explorer framework: application shell, routing, resource containers, and navigation |
| [explorer-modules](./explorer-modules/) | `@memberjunction/ng-explorer-modules` | Consolidated Explorer NgModule bundle that re-exports all Explorer feature modules |
| [kendo-modules](./kendo-modules/) | `@memberjunction/ng-kendo-modules` | Consolidated Kendo UI NgModule bundle for shared Kendo component imports |
| [base-application](./base-application/) | `@memberjunction/ng-base-application` | BaseApplication class system for app-centric navigation |
| [auth-services](./auth-services/) | `@memberjunction/ng-auth-services` | Authentication services with Auth0, MSAL, and Okta provider support |
| [shared](./shared/) | `@memberjunction/ng-shared` | Shared Explorer utilities, base components, services, and events used across Explorer packages |
| [workspace-initializer](./workspace-initializer/) | `@memberjunction/ng-workspace-initializer` | Workspace initialization service and components for bootstrapping the Explorer environment |

### Forms & Entity Editing

Components for rendering, editing, and managing entity records through metadata-driven forms.

| Package | npm | Description |
|---------|-----|-------------|
| [base-forms](./base-forms/) | `@memberjunction/ng-base-forms` | Base form components, field rendering, and validation framework |
| [core-entity-forms](./core-entity-forms/) | `@memberjunction/ng-core-entity-forms` | Auto-generated and custom entity forms with dynamic form loading and registration |
| [entity-form-dialog](./entity-form-dialog/) | `@memberjunction/ng-entity-form-dialog` | Modal dialog for displaying and editing any entity record |
| [form-toolbar](./form-toolbar/) | `@memberjunction/ng-form-toolbar` | Form action toolbar providing save, cancel, delete, and navigation controls |

### Data Grids & Lists

Grid and list components for browsing and managing collections of entity records.

| Package | npm | Description |
|---------|-----|-------------|
| [list-detail-grid](./list-detail-grid/) | `@memberjunction/ng-list-detail-grid` | Master-detail grid for displaying dynamic and saved list details |
| [simple-record-list](./simple-record-list/) | `@memberjunction/ng-simple-record-list` | Lightweight component for displaying, editing, creating, and deleting records in any entity |

### Dashboards

Dashboard components for administrative and analytical views.

| Package | npm | Description |
|---------|-----|-------------|
| [dashboards](./dashboards/) | `@memberjunction/ng-dashboards` | Dashboard components including AI model management, Entity Admin ERD, and Actions configuration |

### Utility & Navigation

Supporting components for linking, permissions, settings, and change tracking.

| Package | npm | Description |
|---------|-----|-------------|
| [link-directives](./link-directives/) | `@memberjunction/ng-link-directives` | Directives for turning elements into email, web, or record links |
| [entity-permissions](./entity-permissions/) | `@memberjunction/ng-entity-permissions` | Components for displaying and editing entity-level permissions |
| [explorer-settings](./explorer-settings/) | `@memberjunction/ng-explorer-settings` | Reusable components for the Explorer settings section |
| [record-changes](./record-changes/) | `@memberjunction/ng-record-changes` | Change-tracking dialog with diff visualization for individual records |
