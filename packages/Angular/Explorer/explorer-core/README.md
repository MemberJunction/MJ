# @memberjunction/ng-explorer-core

The `@memberjunction/ng-explorer-core` package provides the core components and infrastructure for the MemberJunction Explorer application. It serves as the foundation for building a complete data exploration and management interface based on MemberJunction entities.

## Features

- Resource container architecture for dynamic loading of components
- Navigation and browsing components for entity records, reports, dashboards, and queries
- Resource wrapper components that facilitate consistent display of different resource types
- Header, navigation, and UI structure components
- Authentication and user profile components
- Home screen and application components
- Dashboard builder and viewer components
- Form toolbar and common UI patterns
- Integration with MemberJunction's metadata system

## Installation

```bash
npm install @memberjunction/ng-explorer-core
```

## Requirements

- Angular 18+
- MemberJunction core libraries (@memberjunction/core, @memberjunction/core-entities)
- Various MemberJunction UI components
- Kendo UI Angular components

## Usage

### Basic Setup

Import the ExplorerCoreModule in your application module:

```typescript
import { ExplorerCoreModule } from '@memberjunction/ng-explorer-core';

@NgModule({
  imports: [
    // other imports...
    ExplorerCoreModule
  ],
})
export class AppModule { }
```

### Resource Container Architecture

The core of the Explorer is built on a resource container architecture that dynamically loads components based on resource type:

```html
<mj-resource
  [Data]="resourceData"
  [isVisible]="activeResourceId === resourceData.ID"
  (ResourceRecordSaved)="handleResourceSaved($event)"
  (ContentLoadingStarted)="handleLoadingStarted($event)"
  (ContentLoadingComplete)="handleLoadingComplete($event)">
</mj-resource>
```

Where resourceData is a ResourceData object that includes configuration for loading the appropriate component.

### Navigation Component

The navigation component provides the main menu structure:

```html
<mj-navigation
  [selectedItem]="currentNavigationItem"
  (itemSelected)="handleNavigationItemSelected($event)">
</mj-navigation>
```

### Home Component

The home component serves as the landing page for the application:

```html
<mj-home></mj-home>
```

### Entity and Record Management

For displaying and managing entity records:

```html
<mj-single-entity [entityName]="entityName"></mj-single-entity>
<mj-single-record [entityName]="entityName" [PrimaryKey]="recordKey"></mj-single-record>
```

### Dashboard Components

For displaying and managing dashboards:

```html
<mj-single-dashboard [dashboardId]="dashboardId"></mj-single-dashboard>
```

## Architecture

### Resource Wrappers

The Explorer is built on a resource wrapper pattern where different types of content (records, reports, dashboards, etc.) are wrapped in specialized components that handle their specific requirements:

- `EntityRecordResource` - For displaying and editing entity records
- `ReportResource` - For displaying and managing reports
- `DashboardResource` - For displaying dashboards
- `QueryResource` - For displaying query results
- `SearchResultsResource` - For displaying search results
- `UserViewResource` - For displaying custom user views
- `ListDetailResource` - For displaying list-detail interfaces

### Component Registration

Components register themselves with MemberJunction's class factory system:

```typescript
@RegisterClass(BaseResourceComponent, 'ResourceType')
@Component({
  selector: 'mj-example-resource',
  template: `...`
})
export class ExampleResource extends BaseResourceComponent {
  // Component implementation
}
```

This allows the `ResourceContainerComponent` to dynamically load the appropriate component based on the resource type.

## Key Components

### Resource Container

The `ResourceContainerComponent` is the core of the dynamic loading system, using Angular's ViewContainerRef to create components at runtime.

### Form Toolbar

The `FormToolbarComponent` provides a consistent interface for form actions like save, delete, and cancel.

### Home Component

The `HomeComponent` serves as the landing page for the application, displaying navigation items marked for home screen display.

### Navigation Component

The `NavigationComponent` provides the main menu structure based on the Explorer navigation items defined in the metadata.

### Single Entity/Record Components

These components display entity lists and individual records, handling all CRUD operations.

### Dashboard Components

Components for creating, editing, and viewing dashboards with support for multiple dashboard items.

## Integration

This package integrates with many other MemberJunction packages including:

- Auth services for authentication
- Container directives for layout management
- Entity permissions for access control
- File storage for document management
- Record changes for audit trail
- User view grid for data display
- Skip Chat for AI integration

## Dependencies

- @angular/common
- @angular/core
- @angular/forms
- @angular/router
- @memberjunction/global
- @memberjunction/core
- @memberjunction/core-entities
- Various MemberJunction UI component packages
- Kendo UI Angular components