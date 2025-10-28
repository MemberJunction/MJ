# @memberjunction/ng-user-view-grid

The `@memberjunction/ng-user-view-grid` package provides a powerful Angular grid component for displaying both saved and dynamic views of MemberJunction entity data. It offers a comprehensive set of features for viewing, editing, exporting, comparing, and merging entity records with full integration into the MemberJunction ecosystem.

## Features

- **View Management**
  - Display entities using saved user views or dynamic configurations
  - Support for both stored views (by ID) and dynamic views (by entity/filter)
  - Virtual scrolling for optimal performance with large datasets
  - Customizable columns with reordering, resizing, and sorting
  - Column formatting based on entity field types

- **Data Operations**
  - Inline record editing with validation
  - Create new records directly from the grid (dialog or tab mode)
  - Export to Excel with formatted data
  - Record comparison and merging capabilities
  - Duplicate detection functionality
  - Add records to lists for organization

- **Integration Features**
  - Entity action execution from the grid
  - Communication capabilities (send emails related to records)
  - Role-based permission controls for all operations
  - Auto-save and queue-based editing modes
  - Navigation to record details on row click

## Installation

```bash
npm install @memberjunction/ng-user-view-grid
```

## Requirements

### Angular Version
- Angular 18.0.2 or higher

### Peer Dependencies
- `@angular/common`: ^18.0.2
- `@angular/core`: ^18.0.2
- `@angular/forms`: ^18.0.2
- `@angular/router`: ^18.0.2

### MemberJunction Dependencies
- `@memberjunction/global`: ^2.43.0
- `@memberjunction/core`: ^2.43.0
- `@memberjunction/core-entities`: ^2.43.0
- `@memberjunction/entity-communications-client`: ^2.43.0
- `@memberjunction/communication-types`: ^2.43.0
- `@memberjunction/templates-base-types`: ^2.43.0
- `@memberjunction/actions-base`: ^2.43.0
- `@memberjunction/ng-shared`: ^2.43.0
- `@memberjunction/ng-entity-form-dialog`: ^2.43.0
- `@memberjunction/ng-compare-records`: ^2.43.0
- `@memberjunction/ng-container-directives`: ^2.43.0
- `@memberjunction/ng-entity-communications`: ^2.43.0
- `@memberjunction/ng-base-types`: ^2.43.0

### Kendo UI Dependencies
- `@progress/kendo-angular-grid`: ^16.2.0
- `@progress/kendo-angular-layout`: ^16.2.0
- `@progress/kendo-angular-inputs`: ^16.2.0
- `@progress/kendo-angular-buttons`: ^16.2.0

## Usage

### Module Setup

Import the `UserViewGridModule` in your Angular module:

```typescript
import { UserViewGridModule } from '@memberjunction/ng-user-view-grid';

@NgModule({
  imports: [
    // other imports...
    UserViewGridModule
  ],
})
export class YourModule { }
```

### Basic Example

Use the component in your template:

```html
<mj-user-view-grid
  [Params]="viewParams"
  [AutoNavigate]="true"
  (rowClicked)="onRowClicked($event)"
  (rowEdited)="onRowEdited($event)">
</mj-user-view-grid>
```

Component implementation:

```typescript
import { Component } from '@angular/core';
import { RunViewParams } from '@memberjunction/core';
import { GridRowClickedEvent, GridRowEditedEvent } from '@memberjunction/ng-user-view-grid';

@Component({
  selector: 'app-my-view',
  templateUrl: './my-view.component.html',
})
export class MyViewComponent {
  // Option 1: Using a saved view by ID
  viewParams: RunViewParams = {
    ViewID: 'view-id-here'
  };
  
  // Option 2: Using a dynamic view with entity and filter
  dynamicViewParams: RunViewParams = {
    EntityName: 'Customer',
    ExtraFilter: "Status = 'Active'",
    OrderBy: 'Name ASC',
    Skip: 0,
    Take: 40
  };
  
  onRowClicked(event: GridRowClickedEvent) {
    console.log('Row clicked:', event);
    // Access event.entityName, event.entityId, event.CompositeKey
  }
  
  onRowEdited(event: GridRowEditedEvent) {
    console.log('Row edited:', event);
    // Access event.record, event.row, event.saved
  }
}
```

### Editing Records

Enable inline editing with different save modes:

```html
<mj-user-view-grid
  [Params]="viewParams"
  [InEditMode]="false"
  [EditMode]="'Save'"
  (rowEdited)="onRowEdited($event)">
</mj-user-view-grid>
```

```typescript
// Component
export class MyViewComponent {
  editMode: "None" | "Save" | "Queue" = "Save";
  
  onRowEdited(event: GridRowEditedEvent) {
    if (event.saved) {
      console.log('Record saved successfully:', event.record);
    } else {
      console.log('Record queued for saving:', event.record);
    }
  }
}
```

The `EditMode` property supports three values:
- `"None"` - Editing is disabled
- `"Save"` - Changes are saved immediately to the database
- `"Queue"` - Changes are queued locally for batch saving later

### Creating New Records

Configure new record creation behavior:

```html
<mj-user-view-grid
  [Params]="viewParams"
  [ShowCreateNewRecordButton]="true"
  [CreateRecordMode]="'Dialog'"
  [NewRecordValues]="initialValues">
</mj-user-view-grid>
```

```typescript
// Component
export class MyViewComponent {
  // Pre-populate new records with default values
  initialValues = {
    Status: 'Active',
    CreatedDate: new Date(),
    DepartmentID: 123
  };
}
```

The `CreateRecordMode` property supports:
- `"Dialog"` - Opens a modal dialog to create a new record
- `"Tab"` - Opens a new browser tab to create a new record

### Entity Actions and Communication

Enable entity-specific actions and communication features:

```html
<mj-user-view-grid
  [Params]="viewParams"
  [ShowEntityActionButtons]="true"
  [ShowCommunicationButton]="true">
</mj-user-view-grid>
```

These features integrate with:
- **Entity Actions**: Execute custom actions defined in entity metadata
- **Communications**: Send emails or other communications related to selected records

## API Reference

### UserViewGridComponent

The main component for displaying entity data in a grid format.

#### Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `Params` | `RunViewParams` | `undefined` | Parameters defining which view to display (either ViewID for saved views or EntityName with filters for dynamic views) |
| `BottomMargin` | `number` | `0` | Bottom margin in pixels to apply to the grid container |
| `InEditMode` | `boolean` | `false` | Controls whether the grid is currently in edit mode |
| `EditMode` | `"None" \| "Save" \| "Queue"` | `"None"` | Determines how edits are handled: None (no editing), Save (immediate), or Queue (batch) |
| `AutoNavigate` | `boolean` | `true` | Whether to automatically navigate to a record's detail view when clicked |
| `NewRecordValues` | `any` | `undefined` | Default values to populate when creating new records |
| `ShowCreateNewRecordButton` | `boolean` | `true` | Whether to display the Create New Record button (if user has permission) |
| `ShowEntityActionButtons` | `boolean` | `true` | Whether to display entity action buttons for the current entity |
| `ShowCommunicationButton` | `boolean` | `true` | Whether to display the communication button (if entity supports it) |
| `CreateRecordMode` | `"Dialog" \| "Tab"` | `"Tab"` | How to open the new record form: Dialog (modal) or Tab (new browser tab) |
| `AllowLoad` | `boolean` | `true` | Controls whether the grid loads data. Set to false to defer loading until ready |

#### Outputs

| Name | Type | Description |
|------|------|-------------|
| `rowClicked` | `EventEmitter<GridRowClickedEvent>` | Fired when a user clicks on a grid row |
| `rowEdited` | `EventEmitter<GridRowEditedEvent>` | Fired when a row edit is completed (saved or queued) |

#### Public Methods

| Name | Parameters | Return Type | Description |
|------|------------|-------------|-------------|
| `Refresh` | `params: RunViewParams` | `Promise<void>` | Refreshes the grid with new view parameters |
| `RefreshFromSavedParams` | None | `Promise<void>` | Refreshes the grid using the currently stored parameters |
| `EditingComplete` | None | `Promise<boolean>` | Completes any in-progress editing and returns true when done |
| `RevertPendingChanges` | None | `void` | Reverts all pending changes in Queue mode |
| `enableMergeOrCompare` | `cancel: boolean, type: 'merge' \| 'compare'` | `void` | Enables or disables merge/compare selection mode |
| `enableCheckbox` | `cancel: boolean, type: 'merge' \| 'compare' \| 'duplicate' \| 'addToList' \| ''` | `void` | Enables checkbox selection for various operations |
| `doExcelExport` | None | `Promise<void>` | Exports the current view data to Excel format |

#### Public Properties

| Name | Type | Description |
|------|------|-------------|
| `PendingRecords` | `GridPendingRecordItem[]` | Array of records with pending changes (readonly) |
| `ViewID` | `string` | The ID of the current view being displayed (readonly) |
| `UserCanCreateNewRecord` | `boolean` | Whether the current user can create new records (readonly) |
| `UserCanEdit` | `boolean` | Whether the current user can edit the view (readonly) |

### Type Definitions

#### GridRowClickedEvent

Emitted when a user clicks on a grid row:

```typescript
type GridRowClickedEvent = {
  entityId: string;        // The ID of the clicked entity
  entityName: string;      // The name of the entity type
  CompositeKey: CompositeKey; // Composite key object for multi-key entities
}
```

#### GridRowEditedEvent

Emitted when a row edit is completed:

```typescript
type GridRowEditedEvent = {
  record: BaseEntity;      // The edited entity record
  row: number;            // The row index in the grid
  saved: boolean;         // Whether the record was saved (true) or queued (false)
}
```

#### GridPendingRecordItem

Represents a record with pending changes:

```typescript
type GridPendingRecordItem = {
  record: BaseEntity;     // The entity record with changes
  row: number;           // The row index in the grid
  dataItem: any;         // The raw data item from the view
}
```

## Advanced Features

### Record Operations

The grid provides powerful multi-record operations:

#### Compare Records
Select multiple records to view their differences side-by-side:

```typescript
// Enable compare mode programmatically
@ViewChild(UserViewGridComponent) grid!: UserViewGridComponent;

startCompare() {
  this.grid.enableCheckbox(false, 'compare');
}
```

#### Merge Records
Combine multiple records into a single record:
1. Select records to merge
2. Choose which field values to keep
3. Confirm the merge operation

#### Duplicate Detection
Find potential duplicate records based on field similarity:
1. Select records to check
2. System analyzes field similarities
3. Results are saved to a list for review

#### List Management
Add selected records to lists for organization:

```typescript
// Enable add to list mode
addToLists() {
  this.grid.enableCheckbox(false, 'addToList');
}
```

### Excel Export

Export grid data with formatting:

```typescript
async exportToExcel() {
  await this.grid.doExcelExport();
  // Notification will appear when complete
}
```

### Deferred Loading

Control when the grid loads data:

```html
<mj-user-view-grid
  [Params]="viewParams"
  [AllowLoad]="false"
  #gridRef>
</mj-user-view-grid>
```

```typescript
// Load when ready
ngAfterViewInit() {
  // Do some initialization...
  setTimeout(() => {
    this.gridRef.AllowLoad = true; // Grid will now load
  }, 1000);
}
```

### Working with Pending Changes

In Queue mode, manage pending changes:

```typescript
// Access pending records
const pending = this.grid.PendingRecords;
console.log(`${pending.length} records have pending changes`);

// Revert all pending changes
this.grid.RevertPendingChanges();

// Complete editing and get status
const completed = await this.grid.EditingComplete();
if (completed) {
  // All edits are complete
}
```

## Integration with MemberJunction

### Entity Permissions

The grid automatically respects entity-level permissions:
- Create button only shows if user has create permission
- Edit capabilities respect user's update permissions
- All operations check appropriate permissions

### Entity Actions

Entity actions defined in metadata appear automatically:
- Actions with 'View' invocation context are displayed
- Actions are filtered by status (only 'Active' shown)
- Custom action handlers can be implemented

### Communication Integration

For entities with communication support:
- Send emails to related contacts
- Use template-based communications
- Track communication history

## Best Practices

1. **Use ViewID for Saved Views**: When displaying user-created views, use the ViewID parameter for better performance and consistency

2. **Implement Error Handling**: Always handle errors in row edit events:
   ```typescript
   onRowEdited(event: GridRowEditedEvent) {
     if (!event.saved && this.editMode === 'Save') {
       // Handle save failure
       console.error('Failed to save record:', event.record);
     }
   }
   ```

3. **Optimize Dynamic Views**: For dynamic views, use appropriate filters and pagination:
   ```typescript
   dynamicParams: RunViewParams = {
     EntityName: 'LargeTable',
     ExtraFilter: 'IsActive = 1',
     OrderBy: 'ModifiedDate DESC',
     Take: 50 // Limit initial load
   };
   ```

4. **Defer Loading for Complex Scenarios**: Use AllowLoad=false when you need to prepare data or configuration before loading

5. **Column Customization**: Customize columns after the grid loads to ensure proper initialization

## Module Exports

The package exports:
- `UserViewGridModule` - The Angular module to import
- `UserViewGridComponent` - The grid component
- `GridRowClickedEvent` - Type for row click events
- `GridRowEditedEvent` - Type for row edit events
- `GridPendingRecordItem` - Type for pending records

## Support

For issues or questions:
- Check the [MemberJunction documentation](https://docs.memberjunction.com)
- Submit issues to the [GitHub repository](https://github.com/MemberJunction/MJ)
- Contact MemberJunction support