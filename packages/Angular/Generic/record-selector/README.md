# Record Selector Component

An Angular component for selecting records from a list of available items in MemberJunction applications. This package provides both a standalone selection component and a dialog wrapper component for easy integration.

## Features

- **Dual Listbox Interface**: Easy selection between available and selected items
- **Drag and Drop**: Intuitive item movement between lists
- **Double-Click Support**: Quickly move items by double-clicking
- **Icon Support**: Display icons alongside item text
- **Configurable Toolbar**: Customize available toolbar actions
- **Dialog Integration**: Optional dialog wrapper for modal usage
- **Entity Integration**: Works with MemberJunction BaseEntity objects
- **Memory Management**: Maintains selection state within dialog sessions

## Installation

```bash
npm install @memberjunction/ng-record-selector
```

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
  [DisplayField]="'UserName'"
  [DisplayIconField]="'UserIcon'"
  [AvailableRecords]="allUsers"
  [SelectedRecords]="selectedUsers"
  [UnselectedRecords]="unselectedUsers"
  (RecordSelected)="onUserSelected($event)"
  (RecordUnselected)="onUserUnselected($event)">
</mj-record-selector>
```

### Dialog Component Usage

```html
<!-- Selector component in a dialog -->
<button kendoButton (click)="showSelectorDialog = true">
  Select Users
</button>

<mj-record-selector-dialog
  *ngIf="showSelectorDialog"
  [EntityName]="'Users'"
  [DisplayField]="'UserName'"
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
          {{ user.Get('UserName') }} - {{ user.Get('Email') }}
        </li>
      </ul>
      <button kendoButton (click)="saveUserAssignments()">Save Assignments</button>
    </div>
    
    <mj-record-selector-dialog
      *ngIf="selectorDialogVisible"
      [EntityName]="'Users'"
      [DisplayField]="'UserName'"
      [DisplayIconField]="'UserIcon'"
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
  allUsers: BaseEntity[] = [];
  selectedUsers: BaseEntity[] = [];
  unselectedUsers: BaseEntity[] = [];
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
    // Load all users
    const rv = new RunView();
    const result = await rv.RunView({
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
    } else {
      console.log('User selection cancelled');
    }
  }
  
  saveUserAssignments() {
    // Logic to save user role assignments
    console.log('Saving role assignments for users:', this.selectedUsers);
  }
}
```

## API Reference

### RecordSelectorComponent

Standalone component for selecting records.

#### Inputs

- `EntityName`: string - The name of the entity to show records for
- `DisplayField`: string - The field name to display in the list items
- `DisplayIconField`: string - The field name containing CSS class for icons (optional)
- `AvailableRecords`: BaseEntity[] - List of all available records
- `SelectedRecords`: BaseEntity[] - List of selected records
- `UnselectedRecords`: BaseEntity[] - List of unselected records
- `ToolbarSettings`: ListBoxToolbarConfig - Configuration for the listbox toolbar

#### Outputs

- `RecordSelected`: EventEmitter<BaseEntity[]> - Emitted when records are selected
- `RecordUnselected`: EventEmitter<BaseEntity[]> - Emitted when records are unselected

### RecordSelectorDialogComponent

Dialog wrapper for the RecordSelectorComponent.

#### Inputs

- All inputs from RecordSelectorComponent, plus:
- `DialogTitle`: string - Title of the dialog (default: 'Select Records')
- `DialogWidth`: string - Width of the dialog (default: '700px')
- `DialogHeight`: string - Height of the dialog (default: '450px')
- `DialogVisible`: boolean - Controls the visibility of the dialog

#### Outputs

- All outputs from RecordSelectorComponent, plus:
- `DialogClosed`: EventEmitter<boolean> - Emitted when the dialog is closed (true if confirmed, false if canceled)

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

The component uses Kendo UI ListBox components with the following behavior:

1. Items can be moved between lists using the toolbar buttons
2. Items can be dragged and dropped between lists
3. Double-clicking an item moves it to the other list
4. When used in a dialog, changes are only committed when the OK button is clicked; Cancel reverts to the previous state

## Styling

The component uses Kendo UI ListBox component styles and includes basic CSS that can be overridden in your application.

## Dependencies

- `@memberjunction/core`: For metadata and entity types
- `@memberjunction/core-entities`: For entity types
- `@memberjunction/global`: For global utilities
- `@progress/kendo-angular-listbox`: For the list box component
- `@progress/kendo-angular-buttons`: For UI buttons
- `@progress/kendo-angular-dialog`: For dialog wrapper