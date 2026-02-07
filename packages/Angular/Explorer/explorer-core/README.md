# @memberjunction/ng-explorer-core

The `@memberjunction/ng-explorer-core` package provides the core components and infrastructure for the MemberJunction Explorer application. It serves as the foundation for building a complete data exploration and management interface based on MemberJunction entities.

## Overview

Explorer Core is a comprehensive Angular library that implements the MemberJunction Explorer application's core functionality. It provides a dynamic resource-based architecture for managing entities, records, reports, dashboards, queries, and other data resources within the MemberJunction ecosystem.

## Features

- **Dynamic Resource Container Architecture**: Loads components at runtime based on resource type
- **Complete Navigation System**: Drawer-based navigation with workspace and tab management
- **Entity Management**: Browse, view, create, edit, and delete entity records
- **Dashboard System**: Create, edit, and view interactive dashboards
- **Report Integration**: Display and manage reports
- **Query Support**: Execute and display query results
- **Search Integration**: Unified search results display
- **User Views**: Support for custom user-defined views
- **Authentication**: Built-in authentication components and guards
- **Responsive Design**: Mobile-friendly UI that adapts to different screen sizes
- **Workspace Management**: Persistent workspace with saved tabs and state
- **Event-Driven Architecture**: Comprehensive event system for component communication

## Installation

```bash
npm install @memberjunction/ng-explorer-core
```

## Requirements

- Angular 21 or higher
- MemberJunction core libraries:
  - `@memberjunction/core` v2.43.0+
  - `@memberjunction/core-entities` v2.43.0+
  - `@memberjunction/global` v2.43.0+
- Kendo UI for Angular v16.2.0+
- TypeScript 4.9+

## Basic Setup

### Module Import

Import the `ExplorerCoreModule` in your application module:

```typescript
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { ExplorerCoreModule } from '@memberjunction/ng-explorer-core';

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    ExplorerCoreModule
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
```

### Routing Configuration

The Explorer Core module includes its own routing configuration. You can integrate it with your application's routing:

```typescript
import { Routes } from '@angular/router';
import { AuthGuardService } from '@memberjunction/ng-explorer-core';

const routes: Routes = [
  {
    path: '',
    canActivate: [AuthGuardService],
    loadChildren: () => import('@memberjunction/ng-explorer-core').then(m => m.ExplorerCoreModule)
  }
];
```

## Core Components

### Resource Container Component

The heart of the Explorer architecture, dynamically loading components based on resource type:

```typescript
import { Component } from '@angular/core';
import { ResourceData } from '@memberjunction/core-entities';

@Component({
  template: `
    <mj-resource
      [Data]="resourceData"
      [isVisible]="isActive"
      (ResourceRecordSaved)="onResourceSaved($event)"
      (ContentLoadingStarted)="onLoadingStarted($event)"
      (ContentLoadingComplete)="onLoadingComplete($event)">
    </mj-resource>
  `
})
export class MyComponent {
  resourceData: ResourceData = {
    ID: 'unique-id',
    Name: 'My Resource',
    ResourceType: 'Records',
    ResourceRecordID: '123',
    Configuration: {
      Entity: 'Contacts'
    }
  };
  
  isActive = true;
  
  onResourceSaved(entity: BaseEntity) {
    console.log('Resource saved:', entity);
  }
  
  onLoadingStarted(container: ResourceContainerComponent) {
    console.log('Loading started');
  }
  
  onLoadingComplete(container: ResourceContainerComponent) {
    console.log('Loading complete');
  }
}
```

### Navigation Component

Provides the main application navigation with workspace and tab management:

```typescript
@Component({
  template: `
    <mj-navigation 
      [applicationName]="'My Application'">
    </mj-navigation>
  `
})
export class AppComponent { }
```

### Home Component

Displays navigation items configured to show on the home screen:

```typescript
@Component({
  template: `<mj-home></mj-home>`
})
export class HomePageComponent { }
```

### Entity Management Components

#### Entity Browser
```typescript
@Component({
  template: `
    <mj-single-entity 
      [entityName]="'Contacts'"
      [viewID]="viewId">
    </mj-single-entity>
  `
})
export class EntityBrowserComponent {
  viewId?: string; // Optional view ID
}
```

#### Record Editor
```typescript
@Component({
  template: `
    <mj-single-record 
      [entityName]="'Contacts'"
      [PrimaryKey]="recordKey"
      [newRecordValues]="defaultValues"
      (recordSaved)="onRecordSaved($event)"
      (loadComplete)="onLoadComplete()">
    </mj-single-record>
  `
})
export class RecordEditorComponent {
  recordKey = new CompositeKey([{ FieldName: 'ID', Value: '123' }]);
  defaultValues = { CompanyID: 1 }; // For new records
  
  onRecordSaved(entity: BaseEntity) {
    console.log('Record saved:', entity);
  }
  
  onLoadComplete() {
    console.log('Record loaded');
  }
}
```

### Dashboard Components

```typescript
@Component({
  template: `
    <mj-single-dashboard 
      [dashboardId]="dashboardId"
      [editMode]="false">
    </mj-single-dashboard>
  `
})
export class DashboardViewerComponent {
  dashboardId = '456';
}
```

### Form Toolbar

Provides consistent form actions across the application:

```typescript
@Component({
  template: `
    <mj-form-toolbar
      [record]="entity"
      [EditMode]="true"
      (SaveRecord)="save()"
      (DeleteRecord)="delete()"
      (CancelEdit)="cancel()">
    </mj-form-toolbar>
  `
})
export class FormComponent {
  entity: BaseEntity;
  
  save() { /* Save logic */ }
  delete() { /* Delete logic */ }
  cancel() { /* Cancel logic */ }
}
```

## Resource Types and Wrappers

The Explorer supports multiple resource types through specialized wrapper components:

### Creating Custom Resource Types

```typescript
import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';

@RegisterClass(BaseResourceComponent, 'CustomResource')
@Component({
  selector: 'mj-custom-resource',
  template: `
    <div class="custom-resource">
      <h2>{{ Data.Name }}</h2>
      <!-- Custom resource implementation -->
    </div>
  `
})
export class CustomResource extends BaseResourceComponent {
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return `Custom: ${data.Name}`;
  }
  
  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-star';
  }
}
```

### Built-in Resource Types

- **Records**: Entity record viewing and editing
- **Reports**: Report display and execution
- **Dashboards**: Interactive dashboard display
- **Queries**: Query execution and results
- **UserViews**: Custom user-defined views
- **SearchResults**: Unified search results
- **ListDetail**: Master-detail layouts

## Event System

The Explorer uses a comprehensive event system for component communication:

```typescript
import { MJGlobal, MJEventType } from '@memberjunction/global';
import { EventCodes } from '@memberjunction/ng-shared';

// Subscribe to events
const subscription = MJGlobal.Instance.GetEventListener(false)
  .subscribe((event) => {
    if (event.eventCode === EventCodes.ComponentEvent) {
      console.log('Component event:', event.args);
    }
  });

// Emit events
MJGlobal.Instance.RaiseEvent({
  eventCode: EventCodes.ComponentEvent,
  eventType: MJEventType.ComponentEvent,
  sourceComponent: this,
  args: { action: 'save', entityName: 'Contacts' }
});
```

## Authentication and Guards

### Auth Guard Service

```typescript
import { Routes } from '@angular/router';
import { AuthGuardService } from '@memberjunction/ng-explorer-core';

const routes: Routes = [
  {
    path: 'secure',
    canActivate: [AuthGuardService],
    component: SecureComponent
  }
];
```

### Entities Guard

```typescript
import { EntitiesGuard } from '@memberjunction/ng-explorer-core';

const routes: Routes = [
  {
    path: 'entities/:entityName',
    canActivate: [EntitiesGuard],
    component: EntityComponent
  }
];
```

## Advanced Features

### Workspace Management

The Explorer automatically manages workspace state, including:
- Open tabs and their state
- Navigation history
- User preferences
- Resource configurations

### Tab Management

```typescript
// Access tab management through the navigation component
@ViewChild(NavigationComponent) navigation: NavigationComponent;

// Open a new tab
this.navigation.openTab({
  label: 'New Contact',
  icon: 'fa-user',
  data: {
    resourceType: 'Records',
    entityName: 'Contacts',
    recordId: 'new'
  }
});
```

### Custom Expansion Panels

```typescript
@Component({
  template: `
    <mj-expansion-panel
      [title]="'Advanced Options'"
      [expanded]="false"
      (expandedChange)="onExpandedChange($event)">
      <!-- Panel content -->
    </mj-expansion-panel>
  `
})
export class MyPanelComponent { }
```

## User Menu Plugin System

The Explorer shell includes a fully extensible user menu system that appears when clicking the user avatar in the header. This plugin architecture allows you to customize, add, or replace menu items without modifying core Explorer code.

### Architecture Overview

The user menu system consists of several components:

- **`BaseUserMenu`**: The base class with default menu implementation, registered via `@RegisterClass`
- **`UserMenuItem`**: Interface defining menu item properties (id, label, icon, group, etc.)
- **`UserMenuContext`**: Context passed to menu handlers with user info, shell reference, and services
- **`DeveloperModeService`**: Service managing developer mode state, persisted via MJ: User Settings entity

### Default Menu Items

The default `BaseUserMenu` implementation provides these menu items:

| ID | Label | Group | Developer Only |
|----|-------|-------|----------------|
| `profile` | Profile | primary | No |
| `toggle-dev-mode` | Toggle Developer Mode | developer | Yes |
| `log-layout` | Log Layout to Console | developer | Yes |
| `inspect-state` | Inspect Workspace State | developer | Yes |
| `reset-layout` | Reset Layout | system | No |
| `logout` | Logout | danger | No |

Menu items are organized into groups with dividers automatically inserted between groups.

### Creating a Custom User Menu

To customize the user menu, create a subclass of `BaseUserMenu` and register it with `@RegisterClass`. Because your subclass is compiled after the base class (due to the import dependency), it automatically gets higher priority in the ClassFactory.

```typescript
import { RegisterClass } from '@memberjunction/global';
import {
  BaseUserMenu,
  UserMenuItem,
  UserMenuActionResult,
  UserMenuContext
} from '@memberjunction/ng-explorer-core';

@RegisterClass(BaseUserMenu)
export class CustomUserMenu extends BaseUserMenu {

  /**
   * Override to customize menu items.
   * Call super.GetMenuItems() to include default items, or return entirely new items.
   */
  public GetMenuItems(): UserMenuItem[] {
    // Get default items
    const items = super.GetMenuItems();

    // Add a custom item
    items.push({
      id: 'my-custom-action',
      label: 'My Custom Action',
      icon: 'fa-solid fa-star',
      group: 'primary',
      order: 50,
      developerOnly: false,
      visible: true,
      enabled: true,
      tooltip: 'Perform my custom action',
      shortcut: '⌘K'
    });

    // Remove an item by filtering
    const filteredItems = items.filter(item => item.id !== 'reset-layout');

    return filteredItems;
  }

  /**
   * Handle custom menu item clicks.
   * Method naming convention: Handle_<item-id-with-hyphens-replaced-by-underscores>
   */
  protected async Handle_my_custom_action(): Promise<UserMenuActionResult> {
    // Access context for user info, shell, services, etc.
    const user = this._context?.user;
    console.log(`Custom action triggered by user: ${user?.Name}`);

    // Perform your custom logic here
    // ...

    return {
      success: true,
      closeMenu: true,  // Close the menu after action
      message: 'Action completed!'
    };
  }
}
```

### UserMenuItem Interface

Each menu item has the following properties:

```typescript
interface UserMenuItem {
  /** Unique identifier for the menu item */
  id: string;

  /** Display text for the menu item */
  label: string;

  /** Font Awesome icon class (e.g., 'fa-solid fa-gear') */
  icon: string;

  /** Optional icon/text color (CSS color value) */
  color?: string;

  /** Optional CSS class for custom styling (e.g., 'danger' for red styling) */
  cssClass?: string;

  /** Group ID for organizing items. Items with same group are grouped together. */
  group: 'primary' | 'developer' | 'system' | 'danger' | string;

  /** Sort order within group (lower = higher in menu) */
  order: number;

  /** Whether item requires Developer role to be visible */
  developerOnly: boolean;

  /** Whether the item is currently visible (dynamic control) */
  visible: boolean;

  /** Whether the item is currently enabled/clickable */
  enabled: boolean;

  /** Optional tooltip text */
  tooltip?: string;

  /** Optional keyboard shortcut hint displayed on the right */
  shortcut?: string;
}
```

### UserMenuContext

The context provides access to user information and shell services:

```typescript
interface UserMenuContext {
  /** Current authenticated user info */
  user: UserInfo;

  /** Full user entity with all fields */
  userEntity: UserEntity;

  /** Reference to shell component for advanced operations */
  shell: Record<string, unknown>;

  /** View container for opening dialogs/modals */
  viewContainerRef: ViewContainerRef;

  /** Whether user has Developer role */
  isDeveloper: boolean;

  /** Whether developer mode is currently enabled */
  developerModeEnabled: boolean;

  /** Current application context */
  currentApplication: ApplicationInfoRef | null;

  /** Workspace manager for layout operations */
  workspaceManager: WorkspaceManagerRef;

  /** Auth service for logout operations */
  authService: AuthServiceRef;

  /** Function to open settings dialog */
  openSettings: () => void;
}
```

### Menu Options

Customize menu display options by overriding `GetOptions()`:

```typescript
@RegisterClass(BaseUserMenu)
export class CustomUserMenu extends BaseUserMenu {

  public GetOptions(): UserMenuOptions {
    return {
      showUserName: true,      // Show user name in menu header
      showUserEmail: true,     // Show user email below name
      menuPosition: 'below-left',  // Position relative to avatar
      animationStyle: 'fade'   // 'fade', 'slide', or 'none'
    };
  }
}
```

### Developer Mode

The Developer Mode feature allows users with developer privileges to toggle additional debugging tools in the UI.

#### Checking Developer Status

```typescript
import { DeveloperModeService } from '@memberjunction/ng-shared';

@Component({...})
export class MyComponent implements OnInit {

  constructor(private devMode: DeveloperModeService) {}

  ngOnInit() {
    // Subscribe to developer mode changes
    this.devMode.IsEnabled$.subscribe(enabled => {
      this.showDevTools = enabled;
    });

    // Check if user has developer role (can enable dev mode)
    if (this.devMode.IsDeveloper) {
      console.log('User can toggle developer mode');
    }

    // Check current state synchronously
    if (this.devMode.IsEnabled) {
      console.log('Developer mode is currently ON');
    }
  }
}
```

#### Developer Roles

Users with any of these roles can toggle developer mode:
- Developer
- Admin
- System Administrator
- Integration

The setting is persisted per-user in the `MJ: User Settings` entity with the key `Explorer.DeveloperMode`.

### Example: Adding Organization-Specific Menu Items

```typescript
import { RegisterClass } from '@memberjunction/global';
import { BaseUserMenu, UserMenuItem, UserMenuActionResult } from '@memberjunction/ng-explorer-core';
import { WindowService } from '@progress/kendo-angular-dialog';

@RegisterClass(BaseUserMenu)
export class AcmeUserMenu extends BaseUserMenu {

  public GetMenuItems(): UserMenuItem[] {
    const items = super.GetMenuItems();

    // Add company-specific items
    items.push(
      {
        id: 'help-center',
        label: 'ACME Help Center',
        icon: 'fa-solid fa-circle-question',
        group: 'primary',
        order: 25,
        developerOnly: false,
        visible: true,
        enabled: true
      },
      {
        id: 'submit-feedback',
        label: 'Submit Feedback',
        icon: 'fa-solid fa-comment',
        group: 'primary',
        order: 30,
        developerOnly: false,
        visible: true,
        enabled: true
      },
      {
        id: 'admin-console',
        label: 'Admin Console',
        icon: 'fa-solid fa-screwdriver-wrench',
        color: '#6366f1',
        group: 'system',
        order: 10,
        developerOnly: true,  // Only visible to developers
        visible: true,
        enabled: this._context?.isDeveloper ?? false
      }
    );

    return items;
  }

  protected async Handle_help_center(): Promise<UserMenuActionResult> {
    window.open('https://help.acme.com', '_blank');
    return { success: true, closeMenu: true };
  }

  protected async Handle_submit_feedback(): Promise<UserMenuActionResult> {
    // Open feedback dialog
    // You could inject WindowService and open a Kendo dialog here
    return { success: true, closeMenu: true };
  }

  protected async Handle_admin_console(): Promise<UserMenuActionResult> {
    // Navigate to admin console
    window.location.href = '/admin';
    return { success: true, closeMenu: false };
  }
}
```

### Ensuring Your Custom Menu is Loaded

To ensure your custom menu class is included in the bundle and not tree-shaken:

1. **Create a loader function** in your module:

```typescript
// custom-user-menu.ts
export function LoadCustomUserMenu() {
  // This function exists to prevent tree-shaking
}
```

2. **Call the loader** from your module's public API or app initialization:

```typescript
// In your app.module.ts or public-api.ts
import { LoadCustomUserMenu } from './custom-user-menu';
LoadCustomUserMenu();
```

This pattern ensures the `@RegisterClass` decorator executes and registers your custom implementation.

## Build Scripts

```json
{
  "scripts": {
    "build": "ngc",
    "watch": "ngc -w",
    "test": "echo \"Error: no test specified\" && exit 1"
  }
}
```

## Development

### Building the Package

```bash
# Build the package
npm run build

# Watch mode for development
npm run watch
```

### Package Structure

```
explorer-core/
├── src/
│   ├── lib/
│   │   ├── auth-button/
│   │   ├── dashboard-browser-component/
│   │   ├── generic/
│   │   ├── guards/
│   │   ├── header/
│   │   ├── home-component/
│   │   ├── navigation/
│   │   ├── resource-wrappers/
│   │   ├── shell/                    # Main shell component
│   │   ├── single-dashboard/
│   │   ├── single-entity/
│   │   ├── single-record/
│   │   ├── user-menu/                # User menu plugin system
│   │   │   ├── base-user-menu.ts     # Base class with default implementation
│   │   │   ├── user-menu.types.ts    # Type definitions
│   │   │   └── index.ts              # Module exports
│   │   └── ...
│   ├── generic/
│   ├── shared/
│   ├── module.ts
│   └── public-api.ts
├── package.json
└── tsconfig.json
```

## Integration with Other MJ Packages

The Explorer Core integrates seamlessly with:

- **@memberjunction/ng-auth-services**: Authentication and authorization
- **@memberjunction/ng-container-directives**: Layout management
- **@memberjunction/ng-entity-permissions**: Entity-level permissions
- **@memberjunction/ng-file-storage**: File upload and management
- **@memberjunction/ng-record-changes**: Audit trail functionality
- **@memberjunction/ng-user-view-grid**: Data grid components
- **@memberjunction/ng-dashboards**: Dashboard creation and management
- **@memberjunction/ng-resource-permissions**: Resource-level permissions

## Best Practices

1. **Resource Loading**: Always check `isVisible` before loading heavy resources
2. **Event Handling**: Unsubscribe from events in `ngOnDestroy`
3. **Tab Management**: Limit concurrent tabs to maintain performance
4. **Entity Access**: Use metadata to check entity permissions before operations
5. **Error Handling**: Implement proper error handling for all async operations

## Troubleshooting

### Common Issues

1. **Resource not loading**: Ensure the resource type is properly registered
2. **Navigation errors**: Check route configuration and guards
3. **Missing icons**: Verify Font Awesome is properly loaded
4. **Performance issues**: Review tab count and resource loading strategies

## License

ISC License - see LICENSE file for details