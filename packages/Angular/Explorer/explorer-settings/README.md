# @memberjunction/ng-explorer-settings

Angular components for managing MemberJunction application settings, including users, roles, and permissions.

## Features

- Complete settings management for MemberJunction Explorer
- User management with activation/deactivation functionality
- Role management and assignment
- Application entity configuration
- Entity permissions management
- Consistent navigation between settings sections

## Installation

```bash
npm install @memberjunction/ng-explorer-settings
```

## Usage

Import the module in your application:

```typescript
import { ExplorerSettingsModule } from '@memberjunction/ng-explorer-settings';

@NgModule({
  imports: [
    // ...
    ExplorerSettingsModule
  ]
})
export class YourModule { }
```

## Components

### SettingsComponent

The main component that provides navigation between different settings sections:

```html
<mj-settings></mj-settings>
```

The component handles routing to different settings sections:
- `/settings/users` - User management
- `/settings/user/:id` - Individual user details
- `/settings/roles` - Role management
- `/settings/role/:id` - Individual role details
- `/settings/applications` - Application management
- `/settings/application/:name` - Individual application details
- `/settings/entitypermissions` - Entity permission management

### SingleUserComponent

Component for managing an individual user:

```html
<mj-single-user [UserID]="userId"></mj-single-user>
```

### SingleRoleComponent

Component for managing an individual role:

```html
<mj-single-role [RoleID]="roleId"></mj-single-role>
```

### SingleApplicationComponent

Component for managing an individual application:

```html
<mj-single-application [ApplicationID]="applicationId"></mj-single-application>
```

### UserRolesGridComponent

Grid component for managing role assignments for a user:

```html
<mj-user-roles-grid [UserID]="userId"></mj-user-roles-grid>
```

### ApplicationEntitiesGridComponent

Grid component for managing entities associated with an application:

```html
<mj-application-entities-grid [ApplicationID]="applicationId"></mj-application-entities-grid>
```

## User Management Features

The settings module includes special functionality for user management, such as:

- Activating/deactivating users instead of deleting them
- Role assignment
- User details editing

Example of user activation toggle:

```typescript
// Toggle user activation status
async function toggleUserActivation(user: UserEntity) {
  user.IsActive = !user.IsActive;
  await user.Save();
}
```

## Integration

This module integrates with other MemberJunction Explorer components:
- Uses simple-record-list for displaying entity records
- Uses entity-form-dialog for editing records
- Uses entity-permissions for permission management
- Uses tabstrip for sectioned display
- Uses notifications for user feedback