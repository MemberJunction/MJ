# Resource Permissions Components

A suite of Angular components for managing and displaying permissions for resources in MemberJunction applications. This package provides components for viewing and managing resource permissions, viewing available resources, and requesting access to restricted resources.

## Features

- **Permission Management**: View, add, edit, and delete permissions for resources
- **Available Resources Display**: Show resources available to a specific user
- **Access Requests**: Allow users to request access to resources they don't have permission for
- **Multiple Permission Types**: Support for both user and role-based permissions
- **Configurable Permission Levels**: Customizable permission levels (View, Edit, Owner)
- **Transaction Support**: All permission changes are grouped in transactions for data integrity
- **Batch Operations**: Multiple permission changes can be saved together in a single transaction
- **Filtering Options**: Filter available resources with custom criteria
- **Resource Type Support**: Works with all MemberJunction resource types
- **Responsive Design**: Adapts to different screen sizes and layouts
- **Error Handling**: Comprehensive error handling with optional user notifications

## Installation

```bash
npm install @memberjunction/ng-resource-permissions
```

## Usage

### Import the Module

```typescript
import { ResourcePermissionsModule } from '@memberjunction/ng-resource-permissions';

@NgModule({
  imports: [
    ResourcePermissionsModule,
    // other imports
  ],
  // ...
})
export class YourModule { }
```

### Resource Permissions Component

```html
<!-- Component for managing permissions for a resource -->
<mj-resource-permissions
  [ResourceTypeID]="reportResourceTypeID"
  [ResourceRecordID]="reportID"
  [ShowSaveButton]="true"
  [AllowAddPermissions]="true"
  [AllowEditPermissions]="true"
  [AllowDeletePermissions]="true">
</mj-resource-permissions>
```

### Available Resources Component

```html
<!-- Component for displaying resources available to a user -->
<mj-available-resources
  [User]="currentUser"
  [ResourceTypeID]="dashboardResourceTypeID"
  [ResourceExtraFilter]="'IsActive = 1'"
  [SelectionMode]="'Multiple'"
  [ExtraColumns]="'CreatedAt,LastUpdatedAt'"
  (SelectionChanged)="onResourceSelectionChanged($event)">
</mj-available-resources>
```

### Request Access Component

```html
<!-- Component for requesting access to a resource -->
<mj-request-resource-access
  [ResourceType]="'Report'"
  [ResourceName]="'Sales Dashboard'"
  [ResourceRecordID]="reportID"
  [PermissionLevel]="'View'"
  [ShowPermissionLevelDropdown]="true"
  (AccessRequested)="onAccessRequested($event)">
</mj-request-resource-access>
```

### TypeScript Component Example

```typescript
import { Component, OnInit } from '@angular/core';
import { ResourceData, ResourcePermissionEntity } from '@memberjunction/core-entities';
import { UserInfo } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';

@Component({
  selector: 'app-resource-access-manager',
  template: `
    <div class="resource-manager">
      <h2>Resource Access Manager</h2>
      
      <!-- Tab navigation -->
      <ul class="nav-tabs">
        <li [class.active]="activeTab === 'permissions'">
          <a (click)="activeTab = 'permissions'">Manage Permissions</a>
        </li>
        <li [class.active]="activeTab === 'available'">
          <a (click)="activeTab = 'available'">Available Resources</a>
        </li>
      </ul>
      
      <!-- Permissions management tab -->
      <div *ngIf="activeTab === 'permissions'" class="tab-content">
        <h3>Manage Report Permissions</h3>
        <p>Control who can access this report and at what permission level.</p>
        
        <mj-resource-permissions
          [ResourceTypeID]="reportResourceTypeID"
          [ResourceRecordID]="selectedReportID"
          [ShowSaveButton]="true"
          [ShowPermissionLevels]="true"
          [PermissionTypes]="['User', 'Role']"
          [ExcludedRoleNames]="['System Administrator']">
        </mj-resource-permissions>
      </div>
      
      <!-- Available resources tab -->
      <div *ngIf="activeTab === 'available'" class="tab-content">
        <h3>Resources Available to User</h3>
        <p>Select a user to view their accessible resources:</p>
        
        <select [(ngModel)]="selectedUser">
          <option *ngFor="let user of users" [ngValue]="user">
            {{user.Name}} ({{user.Email}})
          </option>
        </select>
        
        <mj-available-resources
          *ngIf="selectedUser"
          [User]="selectedUser"
          [ResourceTypeID]="reportResourceTypeID"
          [ExtraColumns]="'CreatedAt,ModifiedAt'"
          (SelectionChanged)="onAvailableResourcesChanged($event)">
        </mj-available-resources>
      </div>
    </div>
  `,
  styles: [`
    .resource-manager {
      padding: 20px;
    }
    .nav-tabs {
      display: flex;
      list-style: none;
      padding: 0;
      border-bottom: 1px solid #ccc;
    }
    .nav-tabs li {
      padding: 10px 20px;
      cursor: pointer;
    }
    .nav-tabs li.active {
      border-bottom: 2px solid #0066cc;
      font-weight: bold;
    }
    .tab-content {
      padding: 20px 0;
    }
  `]
})
export class ResourceAccessManagerComponent implements OnInit {
  activeTab = 'permissions';
  reportResourceTypeID = '1'; // Resource type ID for reports
  selectedReportID = '123'; // ID of the selected report
  selectedUser?: UserInfo;
  users: UserInfo[] = [];
  
  constructor(private notificationService: MJNotificationService) {}
  
  async ngOnInit() {
    // Load users
    // This would typically come from your user service
    this.users = await this.loadUsers();
  }
  
  async loadUsers(): Promise<UserInfo[]> {
    // Implementation for loading users
    return [];
  }
  
  onAvailableResourcesChanged(resources: ResourceData[]) {
    console.log('Selected resources:', resources);
  }
  
  onAccessRequested(permission: ResourcePermissionEntity) {
    this.notificationService.CreateSimpleNotification(
      `Access request submitted for ${permission.Get('ResourceType')}`,
      'success',
      3000
    );
  }
}
```

## API Reference

### ResourcePermissionsComponent

Component for managing permissions for a specific resource.

#### Inputs

- `ResourceTypeID`: string - ID of the resource type record (required)
- `ResourceRecordID`: string - ID of the resource record (required)
- `ShowSaveButton`: boolean - Whether to show the Save button (default: false)
- `ShowPermissionLevels`: boolean - Whether to show permission level options (default: true)
- `ShowUserErrorMessages`: boolean - Whether to show error messages to the user (default: false)
- `AllowAddPermissions`: boolean - Whether the user can add permissions (default: true)
- `AllowEditPermissions`: boolean - Whether the user can edit permissions (default: true)
- `AllowDeletePermissions`: boolean - Whether the user can delete permissions (default: true)
- `PermissionLevels`: string[] - Available permission levels (default: ['View', 'Edit', 'Owner'])
- `PermissionTypes`: string[] - Available permission types (default: ['User', 'Role'])
- `ExcludedRoleNames`: string[] - Role names to exclude from selection
- `ExcludedUserEmails`: string[] - User emails to exclude from selection

#### Methods

- `SavePermissions()`: Promise<boolean> - Saves all permission changes
- `UpdateResourceRecordID(ResourceRecordID: string)`: Updates the resource record ID

### AvailableResourcesComponent

Component for displaying resources available to a specific user.

#### Inputs

- `User`: UserInfo - The user to show resources for (required)
- `ResourceTypeID`: string - ID of the resource type (required)
- `ResourceExtraFilter`: string - Additional filter for resources
- `SelectionMode`: 'Single' | 'Multiple' - Selection mode for the grid (default: 'Single')
- `ExtraColumns`: string - Comma-delimited list of additional columns to display
- `SelectedResources`: ResourceData[] - Array of currently selected resources

#### Outputs

- `SelectionChanged`: EventEmitter<ResourceData[]> - Emitted when resource selection changes

#### Methods

- `Refresh()`: Promise<void> - Refreshes the component data

### RequestResourceAccessComponent

Component for requesting access to a resource.

#### Inputs

- `ResourceType`: string - The name of the resource type (required)
- `ResourceName`: string - The name of the resource to display
- `ResourceRecordID`: string - ID of the resource record (required)
- `PermissionLevel`: 'View' | 'Edit' | 'Owner' - Default permission level (default: 'View')
- `ShowPermissionLevelDropdown`: boolean - Whether to show permission level selection (default: true)

#### Outputs

- `AccessRequested`: EventEmitter<ResourcePermissionEntity> - Emitted when access is requested

#### Methods

- `requestAccess()`: Promise<void> - Submits the access request

## Permission Workflow

1. **Managing Permissions**: Use the ResourcePermissionsComponent to add, edit, or remove permissions for users and roles
2. **Viewing Available Resources**: Use the AvailableResourcesComponent to display resources a user has access to
3. **Requesting Access**: Use the RequestResourceAccessComponent to allow users to request access to resources they don't have permission for

### Permission Status

When using the RequestResourceAccessComponent, permissions are created with a status of 'Requested'. This allows resource owners to review and approve/deny access requests. The typical workflow is:

1. User requests access to a resource → Permission created with Status = 'Requested'
2. Resource owner reviews the request in ResourcePermissionsComponent
3. Resource owner can approve (change status) or deny (delete) the permission
4. Once approved, the user gains access to the resource at the specified permission level

## Resource Types

The resource permissions system works with any resource type defined in MemberJunction, including:

- Reports
- Dashboards
- Queries
- Documents
- Other custom resource types

## Styling

The components include basic CSS that can be customized to match your application's design.

## Dependencies

- `@memberjunction/core`: For metadata and entity access
- `@memberjunction/core-entities`: For resource and permission entity types
- `@memberjunction/global`: For global utilities
- `@memberjunction/ng-base-types`: For Angular component base classes
- `@memberjunction/ng-notifications`: For notification services
- `@memberjunction/ng-container-directives`: For container directive utilities
- `@memberjunction/ng-generic-dialog`: For dialog components
- `@memberjunction/ng-compare-records`: For record comparison functionality
- `@progress/kendo-angular-grid`: For grid components
- `@progress/kendo-angular-buttons`: For UI buttons
- `@progress/kendo-angular-dropdowns`: For dropdown selectors
- `@progress/kendo-angular-dialog`: For dialog windows
- `@progress/kendo-angular-indicators`: For loading indicators
- `@progress/kendo-angular-listview`: For list view components
- `@progress/kendo-angular-layout`: For layout components

## Building

This package is part of the MemberJunction monorepo. To build:

```bash
# From the package directory
npm run build

# Or from the monorepo root
turbo build --filter="@memberjunction/ng-resource-permissions"
```

## Integration with MemberJunction

This package integrates seamlessly with the MemberJunction ecosystem:

- **ResourcePermissionEngine**: Leverages the core ResourcePermissionEngine for permission logic
- **Entity Framework**: Uses MemberJunction's entity system for data access
- **Metadata System**: Utilizes the metadata provider for entity discovery
- **Transaction Support**: Integrates with MemberJunction's transaction management
- **Notification System**: Sends notifications when access is requested

## Advanced Usage

### Custom Permission Validation

You can extend the permission validation logic by implementing custom checks in your application before calling the save methods on the components.

### Programmatic Permission Management

```typescript
import { ResourcePermissionEngine } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';

// Get the engine instance
const engine = ResourcePermissionEngine.Instance;
await engine.Config();

// Check if a user has access to a resource
const hasAccess = engine.UserHasPermission(
  userID,
  resourceTypeID,
  resourceRecordID,
  'View' // minimum permission level
);

// Get all permissions for a resource
const permissions = await engine.GetResourcePermissions(
  resourceTypeID,
  resourceRecordID
);
```

## Version

Current version: 2.43.0

## License

ISC