# @memberjunction/ng-entity-permissions

The `@memberjunction/ng-entity-permissions` package provides Angular components for displaying and editing permissions for MemberJunction entities. It allows administrators to manage role-based access control (RBAC) for entities in a user-friendly grid interface.

## Features

- Grid-based interface for viewing and editing entity permissions
- Support for managing permissions in two modes: by entity or by role
- Ability to toggle Read, Create, Update, and Delete permissions individually
- Batch editing capabilities with transaction support
- Entity selector with integrated permissions grid
- Visual indication of modified permissions before saving
- Quick actions to flip all permissions or reset changes

## Installation

```bash
npm install @memberjunction/ng-entity-permissions
```

## Requirements

- Angular 18+
- @memberjunction/core
- @memberjunction/core-entities
- @progress/kendo-angular-grid
- @progress/kendo-angular-dropdowns
- @progress/kendo-angular-buttons
- @progress/kendo-angular-dialog
- @progress/kendo-angular-indicators

## Usage

### Basic Setup

First, import the EntityPermissionsModule in your module:

```typescript
import { EntityPermissionsModule } from '@memberjunction/ng-entity-permissions';

@NgModule({
  imports: [
    // other imports...
    EntityPermissionsModule
  ],
})
export class YourModule { }
```

### Entity Permissions Grid

Use the grid component to display and edit permissions for a specific entity:

```html
<mj-entity-permissions-grid
  [EntityName]="'Customer'"
  [Mode]="'Entity'"
  (PermissionChanged)="handlePermissionChanged($event)">
</mj-entity-permissions-grid>
```

Or to display permissions for a specific role across all entities:

```html
<mj-entity-permissions-grid
  [RoleName]="'Administrator'"
  [Mode]="'Role'"
  (PermissionChanged)="handlePermissionChanged($event)">
</mj-entity-permissions-grid>
```

In your component:

```typescript
import { Component } from '@angular/core';
import { EntityPermissionChangedEvent } from '@memberjunction/ng-entity-permissions';

@Component({
  selector: 'app-permissions-manager',
  templateUrl: './permissions-manager.component.html',
})
export class PermissionsManagerComponent {
  handlePermissionChanged(event: EntityPermissionChangedEvent) {
    console.log('Permission changed:', event);
    // You can cancel the change if needed by setting event.Cancel = true
  }
}
```

### Entity Selector with Permissions Grid

Use the selector component to allow users to choose an entity and then manage its permissions:

```html
<mj-entity-permissions-selector-with-grid
  (PermissionChanged)="handlePermissionChanged($event)">
</mj-entity-permissions-selector-with-grid>
```

## API Reference

### EntityPermissionsGridComponent

#### Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `Mode` | `'Entity' \| 'Role'` | `'Entity'` | Whether to display permissions for a specific entity or role |
| `EntityName` | `string` | `undefined` | Name of the entity to show permissions for (when Mode is 'Entity') |
| `RoleName` | `string` | `undefined` | Name of the role to show permissions for (when Mode is 'Role') |
| `BottomMargin` | `number` | `0` | Margin to apply at the bottom of the grid |

#### Outputs

| Name | Type | Description |
|------|------|-------------|
| `PermissionChanged` | `EventEmitter<EntityPermissionChangedEvent>` | Emitted when a permission is changed |

#### Methods

| Name | Parameters | Return Type | Description |
|------|------------|-------------|-------------|
| `Refresh` | None | `Promise<void>` | Reloads permissions data |
| `savePermissions` | None | `Promise<void>` | Saves all modified permissions |
| `cancelEdit` | None | `Promise<void>` | Reverts all unsaved changes |
| `flipAllPermissions` | `type: 'Read' \| 'Create' \| 'Update' \| 'Delete'` | `void` | Toggles all permissions of the specified type |

### EntityPermissionsSelectorWithGridComponent

#### Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `EntityName` | `string` | `undefined` | Name of the initially selected entity |
| `BottomMargin` | `number` | `0` | Margin to apply at the bottom of the component |

#### Outputs

| Name | Type | Description |
|------|------|-------------|
| `PermissionChanged` | `EventEmitter<EntityPermissionChangedEvent>` | Emitted when a permission is changed |

### EntityPermissionChangedEvent Interface

```typescript
type EntityPermissionChangedEvent = {
  EntityName: string,      // Name of the entity
  RoleID: string           // ID of the role
  PermissionTypeChanged: 'Read' | 'Create' | 'Update' | 'Delete' // Type of permission changed
  Value: boolean           // New value of the permission
  Cancel: boolean          // Set to true to cancel the change
}
```

## Styling

The components use the following CSS classes that can be customized:

- `.grid`: Main permissions grid
- `.permission-left-col`: Left column in the grid (entity/role name)
- `.dirty-row`: Applied to rows with unsaved changes
- `.entity-selector`: Applied to the entity dropdown
- `.inner-grid`: Applied to the grid within the selector component

## Dependencies

- @angular/common
- @angular/core
- @angular/forms
- @memberjunction/core
- @memberjunction/core-entities
- @memberjunction/ng-container-directives
- @memberjunction/ng-shared
- @progress/kendo-angular-dropdowns
- @progress/kendo-angular-grid
- @progress/kendo-angular-buttons
- @progress/kendo-angular-dialog
- @progress/kendo-angular-indicators