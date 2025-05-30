# @memberjunction/ng-simple-record-list

A lightweight, reusable Angular component for displaying, editing, creating, and deleting records in any MemberJunction entity. This component provides a streamlined grid interface with built-in CRUD operations and customizable actions.

## Features

- **Simple Grid Display**: Clean table layout for entity records with automatic column detection
- **CRUD Operations**: Built-in support for Create, Read, Update, and Delete operations
- **Automatic Column Detection**: Intelligently selects columns based on entity metadata
- **Custom Actions**: Support for custom actions with dynamic icons and tooltips
- **Confirmation Dialogs**: Built-in dialogs for delete and custom action confirmations
- **Responsive Design**: Loading indicators and scrollable content area
- **Entity Form Integration**: Seamless integration with MemberJunction's entity form dialog
- **Sorting Support**: Client-side sorting capability for displayed records
- **Click-to-Select**: Row selection with event emission for parent handling

## Installation

```bash
npm install @memberjunction/ng-simple-record-list
```

## Usage

### Module Import

Import the module in your Angular application:

```typescript
import { SimpleRecordListModule } from '@memberjunction/ng-simple-record-list';

@NgModule({
  imports: [
    CommonModule,
    SimpleRecordListModule
  ]
})
export class YourModule { }
```

### Basic Implementation

Simple usage with automatic column detection:

```html
<mj-simple-record-list
  EntityName="Users"
  (RecordSelected)="handleRecordSelected($event)"
></mj-simple-record-list>
```

### Advanced Implementation

Full-featured implementation with custom columns and actions:

```html
<mj-simple-record-list
  EntityName="Users"
  [Columns]="['Name', 'Email', 'IsActive', 'CreatedAt']"
  SortBy="Name"
  [AllowDelete]="true"
  [AllowNew]="true"
  [AllowEdit]="true"
  EditSectionName="user-details"
  (RecordSelected)="onUserSelected($event)"
  (RecordEdited)="onUserEdited($event)"
  (RecordCreated)="onUserCreated($event)"
></mj-simple-record-list>
```

### Component Implementation

```typescript
import { Component } from '@angular/core';
import { BaseEntity, UserEntity } from '@memberjunction/core-entities';

@Component({
  selector: 'app-user-management',
  templateUrl: './user-management.component.html'
})
export class UserManagementComponent {
  
  onUserSelected(user: BaseEntity): void {
    console.log('User selected:', user.Get('Name'));
    // Navigate to detail view or perform other actions
  }
  
  onUserEdited(user: BaseEntity): void {
    console.log('User edited:', user.Get('ID'));
    // Handle post-edit logic
  }
  
  onUserCreated(user: BaseEntity): void {
    console.log('New user created:', user.Get('ID'));
    // Handle post-creation logic
  }
}
```

## API Documentation

### Input Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `EntityName` | `string` | `''` | **Required.** Name of the MemberJunction entity to display records for |
| `Columns` | `string[]` | `[]` | List of column names to display. If empty, columns are auto-detected based on entity metadata |
| `SortBy` | `string` | `''` | Column name to sort by. Uses client-side string comparison sorting |
| `AllowDelete` | `boolean` | `true` | Shows/hides delete button for each record |
| `AllowNew` | `boolean` | `true` | Shows/hides the "New" button above the grid |
| `AllowEdit` | `boolean` | `true` | Shows/hides edit button for each record |
| `AllowCustomAction` | `boolean` | `false` | Enables custom action button for each record |
| `CustomActionIcon` | `string` | `''` | Font Awesome icon class for custom action (e.g., 'fa-user-lock') |
| `CustomActionIconFunction` | `Function` | `null` | Function to dynamically determine icon based on record |
| `CustomActionTooltip` | `string` | `''` | Tooltip text for custom action button |
| `CustomActionTooltipFunction` | `Function` | `null` | Function to dynamically determine tooltip based on record |
| `CustomActionDialogTitle` | `string` | `'Confirm Action'` | Title for custom action confirmation dialog |
| `CustomActionDialogMessage` | `string` | `'Are you sure you want to perform this action?'` | Message for custom action dialog. Supports `{{recordName}}` placeholder |
| `CustomActionDialogInfo` | `string` | `''` | Additional information shown in custom action dialog |
| `EditSectionName` | `string` | `'details'` | Section name passed to entity form dialog for edit/new operations |

### Output Events

| Event | Type | Description |
|-------|------|-------------|
| `RecordSelected` | `EventEmitter<BaseEntity>` | Fired when a record row is clicked |
| `RecordEdited` | `EventEmitter<BaseEntity>` | Fired after a record is successfully edited |
| `RecordCreated` | `EventEmitter<BaseEntity>` | Fired after a new record is successfully created |
| `CustomActionClicked` | `EventEmitter<BaseEntity>` | Fired when custom action button is clicked (before confirmation) |
| `CustomActionConfirmed` | `EventEmitter<BaseEntity>` | Fired when custom action is confirmed in dialog |

## Column Auto-Detection Logic

When no columns are specified, the component uses the following logic:

1. If the entity has fewer than 10 fields, all fields are displayed
2. If the entity has 10+ fields:
   - Fields with `DefaultInView = true` are selected
   - If no fields have `DefaultInView = true`, the first 10 fields are used

## Custom Actions

### Example: Toggle User Activation

```typescript
import { Component } from '@angular/core';
import { BaseEntity, UserEntity } from '@memberjunction/core-entities';

@Component({
  selector: 'app-user-list',
  template: `
    <mj-simple-record-list
      EntityName="Users"
      [Columns]="['Name', 'Email', 'IsActive']"
      [AllowDelete]="false"
      [AllowCustomAction]="true"
      [CustomActionIconFunction]="getUserToggleIcon"
      [CustomActionTooltipFunction]="getUserToggleTooltip"
      CustomActionDialogTitle="Toggle User Activation"
      CustomActionDialogMessage="Are you sure you want to toggle activation for {{recordName}}?"
      CustomActionDialogInfo="Active users can log in. Inactive users cannot."
      (CustomActionConfirmed)="toggleUserActivation($event)"
    ></mj-simple-record-list>
  `
})
export class UserListComponent {
  
  getUserToggleIcon = (record: BaseEntity): string => {
    const user = record as UserEntity;
    return user.IsActive ? 'fa-user-lock' : 'fa-user-check';
  }
  
  getUserToggleTooltip = (record: BaseEntity): string => {
    const user = record as UserEntity;
    return user.IsActive ? 'Deactivate user' : 'Activate user';
  }
  
  async toggleUserActivation(record: BaseEntity): Promise<void> {
    const user = record as UserEntity;
    user.IsActive = !user.IsActive;
    
    if (await user.Save()) {
      console.log('User activation toggled successfully');
    } else {
      console.error('Failed to toggle user activation:', user.LatestResult.Message);
    }
  }
}
```

## Record Name Resolution

The component determines display names for records using this hierarchy:

1. First field marked with `IsNameField = true` in entity metadata
2. Field named "Name" if it exists
3. Concatenated primary key values with "Record: " prefix

## Styling

The component uses:
- Font Awesome icons (must be included in your application)
- Kendo UI Angular theme styles
- Custom CSS with scrollable table and sticky headers
- Hover effects for better user interaction

### CSS Classes

- `.wrapper`: Main container with padding and scrolling
- `.grid`: Table styling with collapsed borders
- `.sticky-header`: Keeps table headers visible during scroll
- `.icon`: Styling for action buttons with cursor pointer

## Dependencies

### Production Dependencies
- `@memberjunction/core`: Core MemberJunction functionality
- `@memberjunction/core-entities`: Entity base classes
- `@memberjunction/global`: Global utilities
- `@memberjunction/ng-container-directives`: Layout directives
- `@memberjunction/ng-notifications`: Notification service
- `@memberjunction/ng-entity-form-dialog`: Entity form dialog component
- `@progress/kendo-angular-*`: Kendo UI components

### Peer Dependencies
- `@angular/common`: ^18.0.2
- `@angular/core`: ^18.0.2
- `@angular/forms`: ^18.0.2
- `@angular/router`: ^18.0.2

## Integration with MemberJunction

This component is designed to work seamlessly with the MemberJunction framework:

- **Entity Metadata**: Automatically reads entity configuration from MJ metadata
- **Entity Objects**: Uses MJ's BaseEntity class for all operations
- **RunView**: Leverages MJ's RunView for efficient data loading
- **Entity Forms**: Integrates with MJ's entity form dialog for editing
- **Notifications**: Uses MJ's notification service for user feedback

## Best Practices

1. **Column Selection**: Specify columns explicitly for better performance and control
2. **Custom Actions**: Use function-based icons/tooltips for dynamic UI updates
3. **Event Handling**: Always handle the output events for proper integration
4. **Error Handling**: Check entity save results and handle failures appropriately
5. **Performance**: For large datasets, consider implementing server-side pagination

## Troubleshooting

### Common Issues

1. **No records displayed**: Verify EntityName matches exactly with MJ metadata
2. **Columns not showing**: Check that column names match entity field names
3. **Edit form not opening**: Ensure EditSectionName exists in entity form configuration
4. **Custom actions not working**: Verify function bindings use arrow functions or proper binding

### Debug Tips

- Check browser console for entity loading errors
- Verify MemberJunction metadata is properly initialized
- Ensure all required Angular and Kendo modules are imported
- Check that Font Awesome is properly included for icons

## Examples

### Minimal Setup

```typescript
// app.component.ts
import { Component } from '@angular/core';

@Component({
  selector: 'app-root',
  template: `
    <mj-simple-record-list 
      EntityName="Employees"
    ></mj-simple-record-list>
  `
})
export class AppComponent { }
```

### Read-Only Grid

```html
<mj-simple-record-list
  EntityName="AuditLogs"
  [Columns]="['Timestamp', 'User', 'Action', 'Description']"
  SortBy="Timestamp"
  [AllowNew]="false"
  [AllowEdit]="false"
  [AllowDelete]="false"
></mj-simple-record-list>
```

### With Custom Filtering

```typescript
@Component({
  template: `
    <mj-simple-record-list
      EntityName="Products"
      [Columns]="['Name', 'Category', 'Price', 'InStock']"
      [AllowCustomAction]="true"
      CustomActionIcon="fa-filter"
      CustomActionTooltip="Toggle out of stock items"
      (CustomActionConfirmed)="toggleStockFilter($event)"
    ></mj-simple-record-list>
  `
})
export class ProductListComponent {
  private showOutOfStock = true;

  async toggleStockFilter(record: BaseEntity): Promise<void> {
    this.showOutOfStock = !this.showOutOfStock;
    // Implement filtering logic
  }
}
```

## Building

To build this package individually:

```bash
cd packages/Angular/Explorer/simple-record-list
npm run build
```

## Contributing

When contributing to this component:

1. Follow the MemberJunction coding standards
2. Ensure all TypeScript compiles without errors
3. Test with various entity types
4. Update this README for any API changes
5. Add appropriate TSDoc comments for public methods

## License

This package is part of the MemberJunction framework and follows the same license terms.
```