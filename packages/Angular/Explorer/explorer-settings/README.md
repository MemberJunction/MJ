# @memberjunction/ng-explorer-settings

Angular components for managing MemberJunction application settings, including users, roles, applications, and entity permissions. This package provides a comprehensive administrative interface for configuring system access and permissions.

## Overview

The `@memberjunction/ng-explorer-settings` package provides a complete settings management interface for MemberJunction Explorer applications. It offers a unified navigation system with dedicated components for managing users, roles, applications, and entity permissions.

## Features

- **User Management**: Create, edit, activate/deactivate users with role assignments
- **Role Management**: Define and manage security roles with user assignments
- **Application Configuration**: Configure applications and their associated entities
- **Entity Permissions**: Granular control over entity-level permissions
- **Transaction-based Updates**: Batch updates using MemberJunction's transaction system
- **Responsive Navigation**: Left-side navigation with dynamic content area
- **Real-time Updates**: Immediate reflection of permission and assignment changes

## Installation

```bash
npm install @memberjunction/ng-explorer-settings
```

## Usage

### Module Import

Import the `ExplorerSettingsModule` in your Angular application:

```typescript
import { ExplorerSettingsModule } from '@memberjunction/ng-explorer-settings';

@NgModule({
  imports: [
    CommonModule,
    ExplorerSettingsModule,
    // other imports...
  ]
})
export class YourModule { }
```

### Basic Implementation

Add the main settings component to your application:

```html
<mj-settings></mj-settings>
```

The component automatically handles routing to different settings sections based on the URL path.

## Components

### SettingsComponent

The main navigation component that provides a consistent interface for all settings sections.

**Selector**: `mj-settings`

**Features**:
- Left-side navigation menu
- Dynamic content area based on selected section
- URL-based routing support
- Responsive layout using MemberJunction's container directives

**Routes Handled**:
- `/settings/users` - User list view
- `/settings/user/:id` - Individual user details
- `/settings/roles` - Role list view
- `/settings/role/:id` - Individual role details
- `/settings/applications` - Application list view
- `/settings/application/:name` - Individual application details
- `/settings/entitypermissions` - Entity permission management

**Example**:
```typescript
// Navigate to a specific user
this.router.navigate(['/settings/user', userId]);

// Navigate to roles section
this.router.navigate(['/settings/roles']);
```

### SingleUserComponent

Manages individual user details and configurations.

**Selector**: `mj-single-user`

**Inputs**:
- `UserID: string` - The ID of the user to display/edit

**Features**:
- User information display and editing
- User role assignments via embedded grid
- User views management
- Integration with entity form dialog for editing

**Example**:
```html
<mj-single-user [UserID]="selectedUserId"></mj-single-user>
```

### SingleRoleComponent

Manages individual role details and user assignments.

**Selector**: `mj-single-role`

**Inputs**:
- `RoleID: string` - The ID of the role to display/edit

**Features**:
- Role information display and editing
- User assignments to the role
- Batch operations for user-role assignments

**Example**:
```html
<mj-single-role [RoleID]="selectedRoleId"></mj-single-role>
```

### SingleApplicationComponent

Manages application configurations and entity associations.

**Selector**: `mj-single-application`

**Inputs**:
- `ApplicationID: string` - The ID of the application to manage

**Features**:
- Application details management
- Entity associations configuration
- Bulk entity assignment operations

**Example**:
```html
<mj-single-application [ApplicationID]="selectedApplicationId"></mj-single-application>
```

### UserRolesGridComponent

A specialized grid for managing user-role relationships.

**Selector**: `mj-user-roles-grid`

**Inputs**:
- `UserID: string` - User ID when in 'Users' mode
- `RoleID: string` - Role ID when in 'Roles' mode
- `Mode: 'Users' | 'Roles'` - Determines the grid's perspective
- `UserRecord: UserEntity | null` - User entity when in 'Users' mode
- `RoleRecord: RoleEntity | null` - Role entity when in 'Roles' mode

**Features**:
- Checkbox-based role/user selection
- Batch save/cancel operations
- Flip all functionality
- Transaction-based updates
- Visual indication of pending changes

**Example**:
```html
<!-- For managing roles assigned to a user -->
<mj-user-roles-grid 
  [UserID]="userId" 
  [UserRecord]="userEntity"
  Mode="Users">
</mj-user-roles-grid>

<!-- For managing users assigned to a role -->
<mj-user-roles-grid 
  [RoleID]="roleId" 
  [RoleRecord]="roleEntity"
  Mode="Roles">
</mj-user-roles-grid>
```

### ApplicationEntitiesGridComponent

Manages entity associations with applications.

**Selector**: `mj-application-entities-grid`

**Inputs**:
- `ApplicationID: string` - Application ID when in 'Applications' mode
- `EntityID: string` - Entity ID when in 'Entities' mode
- `Mode: 'Applications' | 'Entities'` - Determines the grid's perspective
- `ApplicationRecord: ApplicationEntity | null` - Application entity
- `EntityRecord: EntityEntity | null` - Entity record

**Features**:
- Entity-application association management
- Bulk selection/deselection
- Transaction-based saves
- Dirty state tracking

**Example**:
```html
<mj-application-entities-grid 
  [ApplicationID]="appId" 
  [ApplicationRecord]="appEntity"
  Mode="Applications">
</mj-application-entities-grid>
```

## User Management Features

### User Activation/Deactivation

The settings module implements a soft-delete pattern for users:

```typescript
// Example implementation in SettingsComponent
public async toggleUserActivation(record: BaseEntity) {
  try {
    const user = record as UserEntity;
    const currentlyActive = user.IsActive;
    
    // Toggle the IsActive flag
    user.IsActive = !currentlyActive;
    
    if (await user.Save()) {
      MJNotificationService.Instance.CreateSimpleNotification(
        `User ${user.Name} has been ${currentlyActive ? 'deactivated' : 'activated'} successfully.`, 
        'success', 
        3000
      );
    }
  } catch (error) {
    console.error('Error toggling user activation:', error);
    MJNotificationService.Instance.CreateSimpleNotification(
      'An error occurred while toggling user activation.', 
      'error', 
      5000
    );
  }
}
```

### Custom Action Support

The user list supports custom actions with configurable icons and tooltips:

```typescript
// Icon function for toggle button
public getUserToggleIcon(record: BaseEntity): string {
  const user = record as UserEntity;
  return user.IsActive ? 'fa-user-lock' : 'fa-user-check';
}

// Tooltip function for toggle button
public getUserToggleTooltip(record: BaseEntity): string {
  const user = record as UserEntity;
  return user.IsActive ? 'Deactivate user' : 'Activate user';
}
```

## Configuration Options

### Navigation Options

The settings component defines navigation options:

```typescript
public options = [
  { label: 'Users', value: SettingsItem.Users },
  { label: 'Roles', value: SettingsItem.Roles },
  { label: 'Applications', value: SettingsItem.Applications },
  { label: 'Entity Permissions', value: SettingsItem.EntityPermissions }
];
```

### Grid Configuration

User roles and application entities grids support various configurations:

```typescript
// Example: Configure grid height
<mj-user-roles-grid 
  [UserID]="userId"
  style="height: 600px;">
</mj-user-roles-grid>
```

## Dependencies

This package depends on several MemberJunction and third-party packages:

### MemberJunction Dependencies
- `@memberjunction/core`: Core functionality and metadata
- `@memberjunction/core-entities`: Entity definitions
- `@memberjunction/global`: Global utilities and decorators
- `@memberjunction/ng-container-directives`: Layout directives
- `@memberjunction/ng-shared`: Shared Angular components
- `@memberjunction/ng-notifications`: Notification service
- `@memberjunction/ng-entity-permissions`: Entity permission components
- `@memberjunction/ng-base-forms`: Base form components
- `@memberjunction/ng-entity-form-dialog`: Entity editing dialogs
- `@memberjunction/ng-user-view-grid`: User view grid component
- `@memberjunction/ng-simple-record-list`: Record list component
- `@memberjunction/ng-tabstrip`: Tab navigation component

### Kendo UI Dependencies
- `@progress/kendo-angular-dropdowns`: Dropdown components
- `@progress/kendo-angular-grid`: Grid functionality
- `@progress/kendo-angular-buttons`: Button components
- `@progress/kendo-angular-dialog`: Dialog components
- `@progress/kendo-angular-layout`: Layout utilities
- `@progress/kendo-angular-indicators`: Loading indicators

### Angular Dependencies (Peer)
- `@angular/common`: ^18.0.2
- `@angular/core`: ^18.0.2
- `@angular/forms`: ^18.0.2
- `@angular/router`: ^18.0.2

## Integration with MemberJunction

### Entity Registration

Components register with MemberJunction's class system:

```typescript
@RegisterClass(BaseNavigationComponent, 'Settings')
export class SettingsComponent extends BaseNavigationComponent {
  // Component implementation
}
```

### Transaction Support

Batch operations use MemberJunction's transaction system:

```typescript
const md = new Metadata();
const tg = await md.CreateTransactionGroup();

for (const record of records) {
  record.TransactionGroup = tg;
  await record.Save();
}

await tg.Submit();
```

### Metadata Integration

Components leverage MemberJunction's metadata system:

```typescript
const md = new Metadata();
const userEntity = await md.GetEntityObject<UserEntity>('Users');
const applications = md.Applications;
const roles = md.Roles;
```

## Build and Development

### Building the Package

```bash
# From the package directory
npm run build

# Or from the repository root
npm run build -- --filter="@memberjunction/ng-explorer-settings"
```

### TypeScript Configuration

The package uses strict TypeScript settings:
- Target: ES2015
- Module: ES2020
- Strict mode enabled
- Source maps generated
- Declaration files generated

## Best Practices

1. **Always use transactions** for batch operations to ensure data consistency
2. **Leverage entity metadata** instead of hardcoding entity names
3. **Use the provided navigation methods** for consistent routing behavior
4. **Handle errors appropriately** with user-friendly notifications
5. **Follow MemberJunction patterns** for entity instantiation and data loading

## Version

Current version: 2.43.0

## License

ISC