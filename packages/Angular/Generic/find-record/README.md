# Find Record Component

An Angular component for searching and selecting records from any MemberJunction entity. This package provides both a standalone search component and a dialog wrapper component for easy integration into applications.

## Features

- **Entity-Agnostic**: Works with any MemberJunction entity
- **Debounced Search**: Real-time search with configurable debounce time
- **Grid Display**: Results displayed in a searchable, sortable grid
- **Customizable Fields**: Configure which fields to display in the results
- **Dialog Integration**: Optional dialog wrapper for modal usage
- **Event Handling**: Events for record selection and dialog closure
- **Loading States**: Visual feedback during search operations

## Installation

```bash
npm install @memberjunction/ng-find-record
```

## Usage

### Import the Module

```typescript
import { FindRecordModule } from '@memberjunction/ng-find-record';

@NgModule({
  imports: [
    FindRecordModule,
    // other imports
  ],
  // ...
})
export class YourModule { }
```

### Basic Component Usage

```html
<!-- Standalone search component -->
<mj-find-record
  [EntityName]="'Users'"
  [SearchDebounceTime]="500"
  (OnRecordSelected)="handleRecordSelected($event)">
</mj-find-record>
```

### Dialog Component Usage

```html
<!-- Search component in a dialog -->
<button kendoButton (click)="showFindDialog = true">
  Find User
</button>

<mj-find-record-dialog
  *ngIf="showFindDialog"
  [EntityName]="'Users'"
  [DialogTitle]="'Find User'"
  [DialogVisible]="showFindDialog"
  (DialogClosed)="handleDialogClosed($event)"
  (OnRecordSelected)="handleRecordSelected($event)">
</mj-find-record-dialog>
```

### TypeScript Component Example

```typescript
import { Component } from '@angular/core';
import { BaseEntity, EntityFieldInfo, Metadata } from '@memberjunction/core';

@Component({
  selector: 'app-user-finder',
  template: `
    <h3>Find User</h3>
    <button kendoButton (click)="showDialog()">Open User Finder</button>
    
    <div *ngIf="selectedUser">
      <h4>Selected User:</h4>
      <p>{{ selectedUser.Get('UserName') }}</p>
      <p>{{ selectedUser.Get('Email') }}</p>
    </div>
    
    <mj-find-record-dialog
      *ngIf="dialogVisible"
      [EntityName]="'Users'"
      [DisplayFields]="displayFields"
      [DialogTitle]="'Find User'"
      [DialogVisible]="dialogVisible"
      [DialogWidth]="'800px'"
      [DialogHeight]="'500px'"
      (DialogClosed)="onDialogClosed($event)"
      (OnRecordSelected)="onUserSelected($event)">
    </mj-find-record-dialog>
  `
})
export class UserFinderComponent implements OnInit {
  dialogVisible = false;
  selectedUser: BaseEntity | null = null;
  displayFields: EntityFieldInfo[] = [];
  
  constructor(private metadata: Metadata) {}
  
  ngOnInit() {
    // Get specific fields to display in the grid
    const userEntity = this.metadata.EntityByName('Users');
    if (userEntity) {
      this.displayFields = [
        userEntity.Fields.find(f => f.Name === 'UserName')!,
        userEntity.Fields.find(f => f.Name === 'Email')!,
        userEntity.Fields.find(f => f.Name === 'FirstName')!,
        userEntity.Fields.find(f => f.Name === 'LastName')!
      ];
    }
  }
  
  showDialog() {
    this.dialogVisible = true;
  }
  
  onUserSelected(user: BaseEntity) {
    this.selectedUser = user;
    console.log('Selected user:', user);
  }
  
  onDialogClosed(confirmed: boolean) {
    this.dialogVisible = false;
    
    if (confirmed && this.selectedUser) {
      console.log('User selection confirmed:', this.selectedUser);
      // Do something with the selected user
    } else {
      console.log('User selection cancelled');
    }
  }
}
```

## API Reference

### FindRecordComponent

Standalone component for searching and selecting records.

#### Inputs

- `EntityName`: string - The name of the entity to search
- `DisplayFields`: EntityFieldInfo[] - Fields to display in the results grid (optional)
- `SearchDebounceTime`: number - Debounce time in milliseconds for search (default: 300)

#### Outputs

- `OnRecordSelected`: EventEmitter<BaseEntity> - Emitted when a record is selected

### FindRecordDialogComponent

Dialog wrapper for the FindRecordComponent.

#### Inputs

- `EntityName`: string - The name of the entity to search
- `DisplayFields`: EntityFieldInfo[] - Fields to display in the results grid (optional)
- `DialogTitle`: string - Title of the dialog (default: 'Find Record')
- `DialogWidth`: string - Width of the dialog (default: '700px')
- `DialogHeight`: string - Height of the dialog (default: '450px')
- `DialogVisible`: boolean - Controls the visibility of the dialog
- `SelectedRecord`: BaseEntity | null - Currently selected record (optional)

#### Outputs

- `DialogClosed`: EventEmitter<boolean> - Emitted when the dialog is closed (true if confirmed, false if canceled)
- `OnRecordSelected`: EventEmitter<BaseEntity> - Emitted when a record is selected

## Search Behavior

The component uses the MemberJunction RunView functionality with the following behavior:

1. As the user types, the search input is debounced (default 300ms)
2. After debounce, a search is executed against the specified entity
3. Results are displayed in a grid with the specified fields
4. User can select a record from the grid
5. The selected record is emitted via the OnRecordSelected event

## Styling

The component includes basic CSS styling that can be overridden in your application.

## Dependencies

- `@memberjunction/core`: For metadata and entity access
- `@memberjunction/core-entities`: For entity types
- `@memberjunction/global`: For global utilities
- `@progress/kendo-angular-grid`: For displaying search results
- `@progress/kendo-angular-buttons`: For UI buttons
- `@progress/kendo-angular-inputs`: For search input
- `@progress/kendo-angular-dialog`: For dialog wrapper