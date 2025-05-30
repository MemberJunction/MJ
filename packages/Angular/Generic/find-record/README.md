# @memberjunction/ng-find-record

An Angular component library for searching and selecting records from any MemberJunction entity. This package provides both a standalone search component and a dialog wrapper component for easy integration into Angular applications.

## Purpose and Overview

The `@memberjunction/ng-find-record` package simplifies the process of implementing entity record search functionality in MemberJunction-based Angular applications. It provides a reusable component that can search any entity using the MemberJunction metadata system and RunView API, displaying results in a Kendo UI grid for easy selection.

## Features

- **Entity-Agnostic**: Works with any MemberJunction entity without modification
- **Debounced Search**: Real-time search with configurable debounce time (default: 300ms)
- **Grid Display**: Results displayed in a searchable, sortable Kendo UI grid
- **Customizable Fields**: Configure which fields to display in the results grid
- **Dialog Integration**: Optional dialog wrapper for modal usage scenarios
- **Event Handling**: Events for record selection and dialog closure
- **Loading States**: Visual feedback during search operations
- **TypeScript Support**: Full TypeScript support with proper typing
- **MemberJunction Integration**: Seamlessly integrates with MemberJunction's metadata and entity systems

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
import { Component, OnInit } from '@angular/core';
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

Standalone component for searching and selecting records. This component provides a search input with a grid display of results.

#### Selector
`mj-find-record`

#### Inputs

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `EntityName` | `string` | `''` | **Required.** The name of the MemberJunction entity to search |
| `DisplayFields` | `EntityFieldInfo[]` | `[]` | Optional. Fields to display in the results grid. If not specified, defaults to fields marked as `DefaultInView`, `IsPrimaryKey`, `IsNameField`, or `IncludeInUserSearchAPI` |
| `SearchDebounceTime` | `number` | `300` | Optional. Debounce time in milliseconds for search input |

#### Outputs

| Event | Type | Description |
|-------|------|-------------|
| `OnRecordSelected` | `EventEmitter<BaseEntity>` | Emitted when a user selects a record from the search results grid |

### FindRecordDialogComponent

Dialog wrapper for the FindRecordComponent. Provides a modal dialog containing the search functionality.

#### Selector
`mj-find-record-dialog`

#### Inputs

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `EntityName` | `string` | `''` | **Required.** The name of the MemberJunction entity to search |
| `DisplayFields` | `EntityFieldInfo[]` | `[]` | Optional. Fields to display in the results grid |
| `DialogTitle` | `string` | `'Find Record'` | Optional. Title displayed in the dialog header |
| `DialogWidth` | `string` | `'700px'` | Optional. Width of the dialog |
| `DialogHeight` | `string` | `'450px'` | Optional. Height of the dialog |
| `DialogVisible` | `boolean` | `false` | **Required.** Controls the visibility of the dialog |
| `SelectedRecord` | `BaseEntity \| null` | `null` | Optional. Currently selected record. Can be set to pre-select a record |

#### Outputs

| Event | Type | Description |
|-------|------|-------------|
| `DialogClosed` | `EventEmitter<boolean>` | Emitted when the dialog is closed. `true` if OK was clicked, `false` if cancelled |
| `OnRecordSelected` | `EventEmitter<BaseEntity>` | Emitted when a user selects a record from the search results |

## Search Behavior

The component uses the MemberJunction RunView functionality with the following behavior:

1. As the user types in the search input, the input is debounced (default 300ms) to prevent excessive API calls
2. After the debounce period, a search is executed using `RunView` with the `UserSearchString` parameter
3. The search leverages MemberJunction's entity metadata to search across appropriate fields
4. Results are displayed in a Kendo UI grid with the specified or default fields
5. Users can select a record by clicking on a row in the grid
6. The selected record (as a `BaseEntity` instance) is emitted via the `OnRecordSelected` event

### Search Implementation Details

The component uses the following RunView configuration:
```typescript
{
  EntityName: this.EntityName,
  UserSearchString: searchTerm,
  ResultType: 'entity_object'  // Returns BaseEntity instances
}
```

## Styling

The component includes basic CSS styling with the following classes:
- `.find-textbox` - Styles the search input field
- `.find-button` - Styles the Find button

You can override these styles in your application's global styles or component-specific stylesheets.

## Dependencies

### Production Dependencies
- `@memberjunction/core`: ^2.43.0 - Core MemberJunction functionality including metadata, RunView, and BaseEntity
- `@memberjunction/core-entities`: ^2.43.0 - Entity type definitions
- `@memberjunction/global`: ^2.43.0 - Global utilities and helpers
- `@memberjunction/ng-container-directives`: ^2.43.0 - Angular container directives
- `@memberjunction/ng-shared`: ^2.43.0 - Shared Angular utilities
- `rxjs`: ^7.8.1 - Reactive programming support for debouncing and search handling
- `tslib`: ^2.3.0 - TypeScript runtime library

### Peer Dependencies (must be installed in your application)
- `@angular/common`: 18.0.2
- `@angular/core`: 18.0.2
- `@angular/forms`: 18.0.2
- `@angular/router`: 18.0.2
- `@progress/kendo-angular-grid`: 16.2.0
- `@progress/kendo-angular-buttons`: 16.2.0
- `@progress/kendo-angular-inputs`: 16.2.0
- `@progress/kendo-angular-dialog`: 16.2.0
- `@progress/kendo-angular-listbox`: 16.2.0

## Integration with MemberJunction

This package is designed to work seamlessly with the MemberJunction ecosystem:

1. **Metadata Integration**: Uses MemberJunction's Metadata class to retrieve entity information and field definitions
2. **Entity System**: Works with any entity registered in the MemberJunction metadata system
3. **RunView API**: Leverages the powerful RunView API for searching, which respects entity permissions and field-level security
4. **BaseEntity**: Returns actual BaseEntity instances, allowing full access to entity methods and properties

## Build and Development

This package is part of the MemberJunction monorepo. To build:

```bash
# From the package directory
npm run build

# Or from the monorepo root
turbo build --filter="@memberjunction/ng-find-record"
```

The package uses Angular's `ngc` compiler for building Angular libraries.

## Module Configuration

The package exports a `FindRecordModule` that includes both components. Import this module in your Angular application:

```typescript
import { FindRecordModule } from '@memberjunction/ng-find-record';

@NgModule({
  imports: [
    FindRecordModule,
    // ... other imports
  ]
})
export class YourFeatureModule { }
```

## Advanced Usage

### Custom Field Selection

You can programmatically select which fields to display based on your requirements:

```typescript
// Display only specific fields
const entity = this.metadata.EntityByName('Products');
this.displayFields = entity.Fields.filter(f => 
  ['Name', 'SKU', 'Price', 'Category'].includes(f.Name)
);
```

### Pre-selecting Records

You can pre-select a record in the dialog component:

```typescript
// Load a record and pre-select it
const md = new Metadata();
const user = await md.GetEntityObject<UserEntity>('Users');
await user.Load(userId);
this.selectedRecord = user;
```

### Handling Selection Events

Process selected records with full type safety:

```typescript
onRecordSelected(record: BaseEntity) {
  // Cast to specific entity type if needed
  if (record.EntityInfo.Name === 'Users') {
    const user = record as UserEntity;
    console.log('Selected user email:', user.Email);
  }
  
  // Or use generic BaseEntity methods
  console.log('Selected record ID:', record.Get('ID'));
  console.log('Selected record name:', record.Get(record.EntityInfo.NameField));
}
```

## Error Handling

The component includes built-in error handling:

- Failed searches will log errors using MemberJunction's `LogError` function
- Loading states provide visual feedback during searches
- Empty search results display a user-friendly message

## Performance Considerations

- **Debouncing**: The default 300ms debounce prevents excessive API calls during typing
- **Entity Objects**: Using `ResultType: 'entity_object'` in RunView ensures efficient object creation
- **Grid Virtualization**: The Kendo Grid component provides built-in virtualization for large result sets

## License

This package is part of the MemberJunction open-source project. See the root repository for license information.