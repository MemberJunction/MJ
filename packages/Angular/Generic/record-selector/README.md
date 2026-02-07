# @memberjunction/ng-record-selector

An Angular component library for selecting records from dual lists in MemberJunction applications. This package provides both a standalone selection component and a dialog wrapper component for easy integration.

## Overview

The `@memberjunction/ng-record-selector` package provides Angular components that allow users to select and deselect items from a possible set using a dual listbox interface. It's designed to work seamlessly with MemberJunction's BaseEntity objects and provides a clean, intuitive UI for managing selections.

## Features

- **Dual Listbox Interface**: Side-by-side lists for available and selected items
- **Drag and Drop**: Intuitive item movement between lists using Kendo UI's drag and drop functionality
- **Double-Click Support**: Quickly move items between lists by double-clicking
- **Icon Support**: Display icons alongside item text using CSS classes from entity fields
- **Configurable Toolbar**: Customize available toolbar actions (move up/down, transfer items, transfer all)
- **Dialog Integration**: Optional dialog wrapper for modal usage with OK/Cancel functionality
- **Entity Integration**: Works natively with MemberJunction BaseEntity objects
- **State Management**: Dialog component maintains selection state and can revert changes on cancel
- **Responsive Design**: Uses MemberJunction's container directives for proper layout

## Installation

```bash
npm install @memberjunction/ng-record-selector
```

Note: This package has peer dependencies on Angular 21 and Kendo UI Angular components. Ensure these are installed in your project.

## Usage

### Import the Module

```typescript
import { RecordSelectorModule } from '@memberjunction/ng-record-selector';

@NgModule({
  imports: [
    RecordSelectorModule,
    // other imports
  ],
  // ...
})
export class YourModule { }
```

### Basic Component Usage

```html
<!-- Standalone selector component -->
<mj-record-selector
  [EntityName]="'Users'"
  [DisplayField]="'Name'"
  [DisplayIconField]="'IconCSSClass'"
  [AvailableRecords]="allUsers"
  [SelectedRecords]="selectedUsers"
  [UnselectedRecords]="unselectedUsers"
  (RecordSelected)="onUserSelected($event)"
  (RecordUnselected)="onUserUnselected($event)">
</mj-record-selector>
```

**Note**: The component accesses entity field values directly using bracket notation (e.g., `dataItem[DisplayField]`), so ensure your DisplayField and DisplayIconField names match the actual property names in your BaseEntity objects.

### Dialog Component Usage

```html
<!-- Selector component in a dialog -->
<button kendoButton (click)="showSelectorDialog = true">
  Select Users
</button>

<mj-record-selector-dialog
  *ngIf="showSelectorDialog"
  [EntityName]="'Users'"
  [DisplayField]="'Name'"
  [DisplayIconField]="'IconCSSClass'"
  [AvailableRecords]="allUsers"
  [SelectedRecords]="selectedUsers"
  [UnselectedRecords]="unselectedUsers"
  [DialogTitle]="'Select Users'"
  [DialogVisible]="showSelectorDialog"
  (DialogClosed)="onDialogClosed($event)"
  (RecordSelected)="onUserSelected($event)"
  (RecordUnselected)="onUserUnselected($event)">
</mj-record-selector-dialog>
```

### TypeScript Component Example

```typescript
import { Component, OnInit } from '@angular/core';
import { BaseEntity, Metadata, RunView } from '@memberjunction/core';
import { UserEntity } from '@memberjunction/core-entities';
import { ListBoxToolbarConfig } from '@progress/kendo-angular-listbox';

@Component({
  selector: 'app-user-role-assignment',
  template: `
    <h3>Assign Users to Role</h3>
    <button kendoButton (click)="openUserSelector()">Select Users</button>
    
    <div *ngIf="selectedUsers.length > 0">
      <h4>Selected Users ({{ selectedUsers.length }}):</h4>
      <ul>
        <li *ngFor="let user of selectedUsers">
          {{ user.Name }} - {{ user.Email }}
        </li>
      </ul>
      <button kendoButton (click)="saveUserAssignments()">Save Assignments</button>
    </div>
    
    <mj-record-selector-dialog
      *ngIf="selectorDialogVisible"
      [EntityName]="'Users'"
      [DisplayField]="'Name'"
      [DisplayIconField]="'IconCSSClass'"
      [AvailableRecords]="allUsers"
      [SelectedRecords]="selectedUsers"
      [UnselectedRecords]="unselectedUsers"
      [ToolbarSettings]="toolbarSettings"
      [DialogTitle]="'Select Users for Role'"
      [DialogVisible]="selectorDialogVisible"
      [DialogWidth]="'800px'"
      [DialogHeight]="'600px'"
      (DialogClosed)="onSelectorDialogClosed($event)">
    </mj-record-selector-dialog>
  `
})
export class UserRoleAssignmentComponent implements OnInit {
  allUsers: UserEntity[] = [];
  selectedUsers: UserEntity[] = [];
  unselectedUsers: UserEntity[] = [];
  selectorDialogVisible = false;
  
  toolbarSettings: ListBoxToolbarConfig = {
    position: "right",
    tools: ["transferFrom", "transferAllFrom", "transferAllTo", "transferTo"]
  };
  
  constructor(private metadata: Metadata) {}
  
  async ngOnInit() {
    await this.loadUsers();
  }
  
  async loadUsers() {
    // Load all users using MemberJunction's recommended pattern
    const rv = new RunView();
    const result = await rv.RunView<UserEntity>({
      EntityName: 'Users',
      ResultType: 'entity_object'
    });
    
    if (result.Success) {
      this.allUsers = result.Results;
      // Initially all users are unselected
      this.unselectedUsers = [...this.allUsers];
      this.selectedUsers = [];
    } else {
      console.error('Failed to load users:', result.ErrorMessage);
    }
  }
  
  openUserSelector() {
    this.selectorDialogVisible = true;
  }
  
  onSelectorDialogClosed(confirmed: boolean) {
    this.selectorDialogVisible = false;
    
    if (confirmed) {
      console.log('User selection confirmed:', this.selectedUsers);
      // The selectedUsers array has been updated by the dialog component
    } else {
      console.log('User selection cancelled');
      // The dialog component has already reverted any changes
    }
  }
  
  async saveUserAssignments() {
    // Example: Save user role assignments
    for (const user of this.selectedUsers) {
      // Create role assignment records or update user roles
      console.log(`Assigning role to user: ${user.Name} (${user.ID})`);
    }
  }
}
```

## API Reference

### RecordSelectorComponent

The base component that provides the dual listbox functionality for selecting records.

**Selector**: `mj-record-selector`

#### Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `EntityName` | `string` | `''` | The name of the entity to show records for |
| `DisplayField` | `string` | `''` | The field name to display in the list items |
| `DisplayIconField` | `string` | `''` | The field name containing CSS class for icons (optional) |
| `AvailableRecords` | `BaseEntity[]` | `[]` | List of all available records |
| `SelectedRecords` | `BaseEntity[]` | `[]` | List of currently selected records |
| `UnselectedRecords` | `BaseEntity[]` | `[]` | List of currently unselected records |
| `ToolbarSettings` | `ListBoxToolbarConfig` | See below | Configuration for the listbox toolbar |

Default toolbar settings:
```typescript
{
  position: "right",
  tools: ["moveUp", "transferFrom", "transferAllFrom", "transferAllTo", "transferTo", "moveDown"]
}
```

#### Outputs

| Output | Type | Description |
|--------|------|-------------|
| `RecordSelected` | `EventEmitter<BaseEntity[]>` | Emitted when records are moved to the selected list |
| `RecordUnselected` | `EventEmitter<BaseEntity[]>` | Emitted when records are moved to the unselected list |

#### Methods

The component handles double-click events internally to move items between lists. No public methods are exposed.

### RecordSelectorDialogComponent

A dialog wrapper that contains the RecordSelectorComponent with OK/Cancel functionality.

**Selector**: `mj-record-selector-dialog`

#### Inputs

Inherits all inputs from `RecordSelectorComponent`, plus:

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `DialogTitle` | `string` | `'Select Records'` | Title displayed in the dialog header |
| `DialogWidth` | `string` | `'700px'` | Width of the dialog |
| `DialogHeight` | `string` | `'450px'` | Height of the dialog |
| `DialogVisible` | `boolean` | `false` | Controls the visibility of the dialog |

#### Outputs

Inherits all outputs from `RecordSelectorComponent`, plus:

| Output | Type | Description |
|--------|------|-------------|
| `DialogClosed` | `EventEmitter<boolean>` | Emitted when the dialog is closed. `true` if OK was clicked, `false` if Cancel was clicked or dialog was closed by other means |

#### Behavior

- When the dialog is opened, it saves the initial state of selected/unselected records
- Clicking OK commits the changes and closes the dialog
- Clicking Cancel or closing the dialog by other means reverts all changes to the initial state
- The component maintains references to the same arrays passed in as inputs, modifying them in place

## Toolbar Configuration

The component accepts a `ListBoxToolbarConfig` object to customize the available toolbar actions:

```typescript
const toolbarSettings: ListBoxToolbarConfig = {
  position: "right", // or "left", "top", "bottom"
  tools: [
    "moveUp",          // Move selected item up
    "transferFrom",    // Move selected item from unselected to selected
    "transferAllFrom", // Move all items from unselected to selected
    "transferAllTo",   // Move all items from selected to unselected
    "transferTo",      // Move selected item from selected to unselected
    "moveDown"         // Move selected item down
  ]
};
```

## Selection Behavior

The component uses Kendo UI ListBox components with the following interaction patterns:

1. **Toolbar Actions**: Use the toolbar buttons to move items between lists
2. **Drag and Drop**: Items can be dragged from one list to another
3. **Double-Click**: Double-clicking an item instantly moves it to the opposite list
4. **Multi-Select**: Hold Ctrl/Cmd to select multiple items, or Shift to select a range
5. **Dialog State Management**: When using the dialog wrapper:
   - Changes are held in memory until confirmed
   - OK button commits all changes
   - Cancel button reverts to the initial state

## Styling

The component uses Kendo UI ListBox styles with additional custom styling:

- `.list-box`: Applied to each listbox container
- `.item-icon`: Applied to icon spans when DisplayIconField is used

You can override these styles in your application's CSS:

```css
/* Example: Custom styling for the record selector */
mj-record-selector .list-box {
  min-height: 300px;
}

mj-record-selector .item-icon {
  margin-right: 8px;
  color: #666;
}
```

## Dependencies

### Runtime Dependencies
- `@memberjunction/core`: ^2.43.0 - Core MemberJunction functionality
- `@memberjunction/core-entities`: ^2.43.0 - Entity type definitions
- `@memberjunction/global`: ^2.43.0 - Global utilities and types
- `@memberjunction/ng-container-directives`: ^2.43.0 - Layout directives
- `@memberjunction/ng-shared`: ^2.43.0 - Shared Angular utilities

### Peer Dependencies
- `@angular/common`: 18.0.2
- `@angular/core`: 18.0.2
- `@angular/forms`: 18.0.2
- `@angular/router`: 18.0.2
- `@progress/kendo-angular-buttons`: 16.2.0
- `@progress/kendo-angular-dialog`: 16.2.0
- `@progress/kendo-angular-listbox`: 16.2.0

## Integration with Other MemberJunction Packages

This package integrates seamlessly with other MemberJunction components:

- **Entity Framework**: Works with any BaseEntity subclass from `@memberjunction/core`
- **Metadata System**: Compatible with entities loaded through the MJ metadata system
- **Container Directives**: Uses `mjFillContainer` directive for proper layout integration
- **RunView**: Designed to work with records loaded via RunView queries

## Common Use Cases

1. **User Role Assignment**: Select users to assign to specific roles
2. **Permission Management**: Choose permissions to grant to users or roles
3. **Category Assignment**: Assign items to multiple categories
4. **Team Membership**: Manage team member selections
5. **Feature Selection**: Enable/disable features for specific tenants

## Best Practices

1. **Data Loading**: Always use the MemberJunction RunView pattern with `ResultType: 'entity_object'` for optimal performance
2. **Memory Management**: The dialog component maintains state internally, so you don't need to manage temporary arrays
3. **Field Names**: Ensure DisplayField matches actual property names in your entities (not the Get() method parameters)
4. **Icon Fields**: If using DisplayIconField, ensure the field contains valid CSS class names (e.g., 'fa-user', 'fas fa-star')
5. **Array References**: The component modifies the input arrays in place, so use the same array references throughout your component's lifecycle

## Troubleshooting

### Records not displaying
- Verify that DisplayField matches an actual property name in your BaseEntity objects
- Check that AvailableRecords is populated with valid BaseEntity instances
- Ensure SelectedRecords and UnselectedRecords are subsets of AvailableRecords

### Icons not showing
- Confirm DisplayIconField contains valid CSS class names
- Ensure required icon fonts (Font Awesome, etc.) are loaded in your application

### Dialog state issues
- Make sure DialogVisible is properly bound and updated
- Handle the DialogClosed event to update your component's state

## Version History

See [CHANGELOG.md](./CHANGELOG.md) for detailed version history.

## License

ISC