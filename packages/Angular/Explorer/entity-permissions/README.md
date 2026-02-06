# @memberjunction/ng-entity-permissions

The `@memberjunction/ng-entity-permissions` package provides Angular components for displaying and editing permissions for MemberJunction entities. It allows administrators to manage role-based access control (RBAC) for entities in a user-friendly grid interface.

## Overview

This package is part of the MemberJunction platform and provides essential UI components for managing entity-level permissions. It offers two primary components:

1. **EntityPermissionsGridComponent** - A grid that displays and allows editing of permissions for either a specific entity across all roles, or for a specific role across all entities
2. **EntityPermissionsSelectorWithGridComponent** - A composite component that combines an entity dropdown selector with the permissions grid

## Features

- **Dual-mode operation**: View permissions by entity (all roles for one entity) or by role (all entities for one role)
- **Grid-based interface** for intuitive permission management
- **Batch editing** with transaction support for atomic updates
- **Visual feedback** with dirty state indicators and row highlighting
- **Quick actions**:
  - Flip all permissions of a specific type (Read/Create/Update/Delete)
  - Toggle all permissions in a row with intelligent logic
  - Revert individual row changes
- **Real-time permission change events** with cancellation support
- **Automatic permission record creation** for missing role/entity combinations
- **Responsive loading states** with Kendo UI indicators

## Installation

```bash
npm install @memberjunction/ng-entity-permissions
```

## Requirements

### Peer Dependencies
- Angular 21+
- @angular/common
- @angular/core
- @angular/forms
- @angular/router

### Runtime Dependencies
- @memberjunction/core (v2.43.0+)
- @memberjunction/core-entities (v2.43.0+)
- @memberjunction/global (v2.43.0+)
- @memberjunction/ng-container-directives (v2.43.0+)
- @memberjunction/ng-shared (v2.43.0+)
- @progress/kendo-angular-grid (v16.2.0)
- @progress/kendo-angular-dropdowns (v16.2.0)
- @progress/kendo-angular-buttons (v16.2.0)
- @progress/kendo-angular-dialog (v16.2.0)
- @progress/kendo-angular-indicators (v16.2.0)

## Usage

### Module Setup

First, import the `EntityPermissionsModule` in your Angular module:

```typescript
import { EntityPermissionsModule } from '@memberjunction/ng-entity-permissions';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    // ... other imports
    EntityPermissionsModule
  ],
})
export class YourModule { }
```

### Basic Usage Examples

#### Entity Permissions Grid - Entity Mode

Display and manage permissions for a specific entity across all roles:

```typescript
import { Component } from '@angular/core';
import { EntityPermissionChangedEvent } from '@memberjunction/ng-entity-permissions';

@Component({
  selector: 'app-entity-permissions',
  template: `
    <mj-entity-permissions-grid
      [EntityName]="'Customers'"
      [Mode]="'Entity'"
      (PermissionChanged)="onPermissionChanged($event)">
    </mj-entity-permissions-grid>
  `
})
export class EntityPermissionsComponent {
  onPermissionChanged(event: EntityPermissionChangedEvent) {
    console.log(`Permission ${event.PermissionTypeChanged} changed to ${event.Value} for role ${event.RoleID}`);
    
    // Optionally cancel the change based on business logic
    if (this.shouldPreventChange(event)) {
      event.Cancel = true;
    }
  }
  
  private shouldPreventChange(event: EntityPermissionChangedEvent): boolean {
    // Implement your business logic here
    return false;
  }
}
```

#### Entity Permissions Grid - Role Mode

Display and manage permissions for a specific role across all entities:

```typescript
@Component({
  selector: 'app-role-permissions',
  template: `
    <mj-entity-permissions-grid
      [RoleName]="selectedRole"
      [Mode]="'Role'"
      (PermissionChanged)="onPermissionChanged($event)">
    </mj-entity-permissions-grid>
  `
})
export class RolePermissionsComponent {
  selectedRole = 'Administrator';
  
  onPermissionChanged(event: EntityPermissionChangedEvent) {
    // Handle permission changes for the role
    console.log(`Entity ${event.EntityName}: ${event.PermissionTypeChanged} = ${event.Value}`);
  }
}
```

#### Entity Selector with Permissions Grid

Provide a dropdown to select entities dynamically:

```typescript
@Component({
  selector: 'app-dynamic-permissions',
  template: `
    <div class="permissions-container">
      <h2>Entity Permissions Manager</h2>
      <mj-entity-permissions-selector-with-grid
        [EntityName]="initialEntity"
        (PermissionChanged)="handlePermissionChange($event)">
      </mj-entity-permissions-selector-with-grid>
    </div>
  `
})
export class DynamicPermissionsComponent {
  initialEntity = 'Customers'; // Optional initial selection
  
  handlePermissionChange(event: EntityPermissionChangedEvent) {
    // Process permission changes
    this.logPermissionChange(event);
  }
  
  private logPermissionChange(event: EntityPermissionChangedEvent) {
    console.log('Permission change:', {
      entity: event.EntityName,
      role: event.RoleID,
      type: event.PermissionTypeChanged,
      value: event.Value
    });
  }
}
```

### Advanced Usage

#### Programmatic Grid Control

Access the grid component directly to perform operations:

```typescript
import { ViewChild } from '@angular/core';
import { EntityPermissionsGridComponent } from '@memberjunction/ng-entity-permissions';

@Component({
  template: `
    <mj-entity-permissions-grid #permGrid
      [EntityName]="'Orders'"
      [Mode]="'Entity'">
    </mj-entity-permissions-grid>
    
    <button (click)="refreshPermissions()">Refresh</button>
    <button (click)="saveAllChanges()">Save All</button>
    <button (click)="flipReadPermissions()">Toggle All Read</button>
  `
})
export class AdvancedPermissionsComponent {
  @ViewChild('permGrid') permissionsGrid!: EntityPermissionsGridComponent;
  
  async refreshPermissions() {
    await this.permissionsGrid.Refresh();
  }
  
  async saveAllChanges() {
    if (this.permissionsGrid.NumDirtyPermissions > 0) {
      await this.permissionsGrid.savePermissions();
      console.log('All permissions saved successfully');
    }
  }
  
  flipReadPermissions() {
    this.permissionsGrid.flipAllPermissions('Read');
  }
}
```

#### Handling Transactions

The component automatically handles batch updates using MemberJunction's transaction system:

```typescript
// The grid component internally uses transaction groups for atomic updates
// When savePermissions() is called, all dirty permissions are saved in a single transaction
// This ensures data consistency and allows for rollback if any permission update fails
```

## API Reference

### EntityPermissionsGridComponent

**Selector:** `mj-entity-permissions-grid`

#### Properties

##### Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `Mode` | `'Entity' \| 'Role'` | `'Entity'` | Determines whether to display permissions for a specific entity across all roles or for a specific role across all entities |
| `EntityName` | `string` | `undefined` | Required when Mode is 'Entity'. The name of the entity to show permissions for |
| `RoleName` | `string` | `undefined` | Required when Mode is 'Role'. The name of the role to show permissions for |
| `BottomMargin` | `number` | `0` | Bottom margin in pixels to apply to the grid container |

##### Outputs

| Name | Type | Description |
|------|------|-------------|
| `PermissionChanged` | `EventEmitter<EntityPermissionChangedEvent>` | Emitted whenever a permission checkbox is toggled. The event can be cancelled by setting `event.Cancel = true` |

##### Public Properties

| Name | Type | Description |
|------|------|-------------|
| `permissions` | `EntityPermissionEntity[]` | Array of permission records currently displayed in the grid |
| `gridHeight` | `number` | Height of the grid in pixels (default: 750) |
| `isLoading` | `boolean` | Loading state indicator |
| `NumDirtyPermissions` | `number` | Count of permissions that have been modified but not saved |

#### Methods

| Method | Parameters | Return Type | Description |
|--------|------------|-------------|-------------|
| `Refresh()` | None | `Promise<void>` | Reloads all permissions data from the database. Automatically creates missing permission records for display |
| `savePermissions()` | None | `Promise<void>` | Saves all modified permissions in a single transaction. Only saves permissions that are truly dirty |
| `cancelEdit()` | None | `Promise<void>` | Reverts all unsaved changes to their original values |
| `flipAllPermissions(type)` | `type: 'Read' \| 'Create' \| 'Update' \| 'Delete'` | `void` | Intelligently toggles all permissions of the specified type. If majority are ON, turns all OFF; otherwise turns all ON |
| `flipRow(permission)` | `permission: EntityPermissionEntity` | `void` | Toggles all permissions in a row. If 2+ are ON, turns all OFF; otherwise turns all ON |
| `revertRow(event, permission)` | `event: MouseEvent, permission: EntityPermissionEntity` | `void` | Reverts a single row to its original state |

### EntityPermissionsSelectorWithGridComponent

**Selector:** `mj-entity-permissions-selector-with-grid`

#### Properties

##### Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `EntityName` | `string` | `undefined` | Optional. Name of the initially selected entity |
| `BottomMargin` | `number` | `0` | Bottom margin in pixels to apply to the component |
| `CurrentEntity` | `EntityInfo \| undefined` | `undefined` | The currently selected entity object. Can be used for two-way binding |

##### Outputs

| Name | Type | Description |
|------|------|-------------|
| `PermissionChanged` | `EventEmitter<EntityPermissionChangedEvent>` | Bubbles up permission change events from the embedded grid |

##### Public Properties

| Name | Type | Description |
|------|------|-------------|
| `entityList` | `EntityInfo[]` | Alphabetically sorted list of all entities available for selection |

### EntityPermissionChangedEvent Interface

```typescript
export type EntityPermissionChangedEvent = {
  EntityName: string;                                          // Name of the entity whose permission changed
  RoleID: string;                                             // ID of the role whose permission changed
  PermissionTypeChanged: 'Read' | 'Create' | 'Update' | 'Delete'; // The specific permission type that was modified
  Value: boolean;                                             // The new value of the permission (true = granted, false = revoked)
  Cancel: boolean;                                            // Set to true in event handler to cancel the change
}
```

### Internal Behavior Notes

1. **Automatic Record Creation**: When loading permissions, the component automatically creates unsaved EntityPermission records for any missing role/entity combinations. These appear in the grid but are only saved if the user enables at least one permission.

2. **Dirty State Logic**: A permission is considered "really dirty" if:
   - It's an existing saved record that has been modified, OR
   - It's a new record with at least one permission enabled

3. **Transaction Support**: All save operations use MemberJunction's TransactionGroup to ensure atomic updates across multiple permission records.

4. **Event Handling**: The grid uses a sophisticated event system where clicking on checkboxes or table cells properly toggles permissions while preventing event bubbling conflicts.

## Styling

The components use standard HTML tables with custom CSS classes that can be overridden:

### CSS Classes

| Class | Applied To | Description |
|-------|------------|-------------|
| `.grid` | `<table>` | Main permissions grid table |
| `.permission-left-col` | First `<td>` in each row | Left column containing entity/role names and revert icon |
| `.dirty-row` | `<tr>` | Applied to rows that have unsaved changes |
| `.entity-selector` | `<kendo-dropdownlist>` | Styles the entity selection dropdown |
| `.inner-grid` | `<mj-entity-permissions-grid>` | Applied to the grid within the selector component |
| `.fa-arrow-rotate-left` | `<span>` icon | Revert icon shown in dirty rows |

### Customization Example

```css
/* Custom styling for your application */
::ng-deep {
  .mj-entity-permissions-grid {
    .grid {
      border: 1px solid #ddd;
      width: 100%;
    }
    
    .dirty-row {
      background-color: #fff3cd;
      
      .permission-left-col {
        font-weight: bold;
        
        .fa-arrow-rotate-left {
          color: #856404;
          cursor: pointer;
          margin-left: 10px;
          
          &:hover {
            color: #533f03;
          }
        }
      }
    }
    
    th {
      cursor: pointer;
      user-select: none;
      
      &:hover {
        background-color: #f0f0f0;
      }
    }
  }
}
```

## Integration with MemberJunction

This package integrates seamlessly with the MemberJunction ecosystem:

### Entity Permission System
- Works with the `EntityPermissionEntity` from `@memberjunction/core-entities`
- Respects the MemberJunction metadata system for entities and roles
- Uses MemberJunction's transaction system for atomic updates

### Metadata Integration
- Automatically discovers all entities and roles from the Metadata provider
- Validates entity and role names against the metadata
- Creates properly typed entity objects using the metadata system

### RunView Integration
- Uses `RunView` for efficient data loading with proper filtering
- Leverages `ResultType: 'entity_object'` for automatic entity instantiation
- Implements proper ordering for consistent display

## Build and Development

This package uses the Angular compiler (`ngc`) for building:

```bash
# Build the package
npm run build

# The built files will be in the dist/ directory
```

### TypeScript Configuration
- Targets ES2015 with ES2020 modules
- Generates declaration files with source maps
- Uses strict mode for type safety
- Configured for Angular library compilation with strict templates

## Performance Considerations

1. **Efficient Loading**: The component loads all permissions in a single query and creates missing records in memory
2. **Batch Updates**: Uses transaction groups to minimize database round trips
3. **Smart Dirty Checking**: Only saves records that have actual changes
4. **Lazy Initialization**: Permission records for missing combinations are created on-demand

## Common Use Cases

### Admin Dashboard
```typescript
// Create a comprehensive admin interface for managing all permissions
@Component({
  template: `
    <mat-tab-group>
      <mat-tab label="By Entity">
        <mj-entity-permissions-selector-with-grid></mj-entity-permissions-selector-with-grid>
      </mat-tab>
      <mat-tab label="By Role">
        <select [(ngModel)]="selectedRole">
          <option *ngFor="let role of roles" [value]="role.Name">{{role.Name}}</option>
        </select>
        <mj-entity-permissions-grid 
          *ngIf="selectedRole"
          [Mode]="'Role'" 
          [RoleName]="selectedRole">
        </mj-entity-permissions-grid>
      </mat-tab>
    </mat-tab-group>
  `
})
export class PermissionsDashboardComponent { 
  // Implementation
}
```

### Role Creation Wizard
```typescript
// Include permissions step in role creation
@Component({
  template: `
    <div *ngIf="currentStep === 'permissions'">
      <h3>Configure Permissions for {{newRole.Name}}</h3>
      <mj-entity-permissions-grid
        [Mode]="'Role'"
        [RoleName]="newRole.Name"
        (PermissionChanged)="trackPermissionChanges($event)">
      </mj-entity-permissions-grid>
    </div>
  `
})
export class RoleWizardComponent {
  // Track changes and save with role
}
```

## Troubleshooting

### Common Issues

1. **"EntityName is required when Mode is 'Entity'"**
   - Ensure you provide the EntityName input when using Entity mode
   - Check that the entity name matches exactly (case-sensitive)

2. **"Entity not found: [EntityName]"**
   - Verify the entity exists in MemberJunction metadata
   - Ensure metadata is properly loaded before component initialization

3. **Permissions not saving**
   - Check browser console for transaction errors
   - Verify user has permission to modify EntityPermission records
   - Ensure database constraints are not violated

4. **Grid not displaying**
   - Confirm all Kendo UI modules are properly imported
   - Check that EntityPermissionsModule is imported in your module

## License

ISC License - see the root MemberJunction repository for details.