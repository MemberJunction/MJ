# @memberjunction/ng-user-view-grid

The `@memberjunction/ng-user-view-grid` package provides a powerful grid component for displaying both saved and dynamic views of MemberJunction entity data. It offers a rich set of features for viewing, editing, exporting, comparing, and merging entity records.

## Features

- Display entities using saved user views or dynamic configurations
- Inline record editing with validation
- Export to Excel functionality
- Record comparison and merging
- Duplicate detection
- Add records to lists
- Customizable columns with reordering, resizing, and sorting
- Integration with entity actions and communication capabilities
- Create new records directly from the grid
- Virtual scrolling for performance with large datasets
- Role-based permission controls for editing and operations
- Selection modes for multi-record operations

## Installation

```bash
npm install @memberjunction/ng-user-view-grid
```

## Requirements

- Angular 18+
- @memberjunction/core
- @memberjunction/core-entities
- @memberjunction/ng-compare-records
- @memberjunction/ng-container-directives
- @memberjunction/ng-entity-form-dialog
- @progress/kendo-angular-grid
- @progress/kendo-angular-buttons
- Various other MemberJunction dependencies

## Usage

### Basic Setup

First, import the UserViewGridModule in your module:

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

### Basic Usage

Use the component in your template:

```html
<mj-user-view-grid
  [Params]="viewParams"
  [BottomMargin]="15"
  [AutoNavigate]="true"
  (rowClicked)="onRowClicked($event)"
  (rowEdited)="onRowEdited($event)">
</mj-user-view-grid>
```

In your component:

```typescript
import { Component } from '@angular/core';
import { RunViewParams } from '@memberjunction/core';
import { GridRowClickedEvent, GridRowEditedEvent } from '@memberjunction/ng-user-view-grid';

@Component({
  selector: 'app-my-view',
  templateUrl: './my-view.component.html',
})
export class MyViewComponent {
  // Using a saved view by ID
  viewParams: RunViewParams = {
    ViewID: 'view-id-here'
  };
  
  // Or using a dynamic view
  dynamicViewParams: RunViewParams = {
    EntityName: 'Customer',
    ExtraFilter: "Status = 'Active'",
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

### Editing Mode

Enable inline editing in the grid:

```html
<mj-user-view-grid
  [Params]="viewParams"
  [InEditMode]="false"
  [EditMode]="'Save'"
  (rowEdited)="onRowEdited($event)">
</mj-user-view-grid>
```

The `EditMode` property supports three values:
- `"None"` - Editing is disabled
- `"Save"` - Changes are saved immediately
- `"Queue"` - Changes are queued for later saving

### Create New Record

Control how new records are created:

```html
<mj-user-view-grid
  [Params]="viewParams"
  [ShowCreateNewRecordButton]="true"
  [CreateRecordMode]="'Dialog'"
  [NewRecordValues]="initialValues">
</mj-user-view-grid>
```

The `CreateRecordMode` property supports two values:
- `"Dialog"` - Opens a dialog to create a new record
- `"Tab"` - Opens a new tab to create a new record

### Entity Actions and Communication

Control additional features:

```html
<mj-user-view-grid
  [Params]="viewParams"
  [ShowEntityActionButtons]="true"
  [ShowCommunicationButton]="true">
</mj-user-view-grid>
```

## API Reference

### UserViewGridComponent

#### Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `Params` | `RunViewParams` | `undefined` | Parameters for the view to display |
| `BottomMargin` | `number` | `0` | Margin to apply at the bottom of the grid |
| `InEditMode` | `boolean` | `false` | Whether the grid is currently in edit mode |
| `EditMode` | `"None" \| "Save" \| "Queue"` | `"None"` | Mode for handling edited records |
| `AutoNavigate` | `boolean` | `true` | Whether to auto-navigate to a record when clicked |
| `NewRecordValues` | `any` | `undefined` | Initial values for new records |
| `ShowCreateNewRecordButton` | `boolean` | `true` | Whether to show the Create New Record button |
| `ShowEntityActionButtons` | `boolean` | `true` | Whether to show entity action buttons |
| `ShowCommunicationButton` | `boolean` | `true` | Whether to show the communication button |
| `CreateRecordMode` | `"Dialog" \| "Tab"` | `"Tab"` | How to open the new record form |
| `AllowLoad` | `boolean` | `true` | Whether to allow loading the data |

#### Outputs

| Name | Type | Description |
|------|------|-------------|
| `rowClicked` | `EventEmitter<GridRowClickedEvent>` | Emitted when a row is clicked |
| `rowEdited` | `EventEmitter<GridRowEditedEvent>` | Emitted when a row is edited |

#### Methods

| Name | Parameters | Return Type | Description |
|------|------------|-------------|-------------|
| `Refresh` | `params: RunViewParams` | `Promise<void>` | Refreshes the grid data |
| `RefreshFromSavedParams` | None | `Promise<void>` | Refreshes using the current parameters |
| `EditingComplete` | None | `Promise<boolean>` | Completes the current edit operation |
| `RevertPendingChanges` | None | `void` | Reverts all pending changes |
| `enableMergeOrCompare` | `cancel: boolean, type: 'merge' \| 'compare'` | `void` | Enables merge or compare mode |
| `enableCheckbox` | `cancel: boolean, type: 'merge' \| 'compare' \| 'duplicate' \| 'addToList' \| ''` | `void` | Enables selection mode for operations |
| `doExcelExport` | None | `Promise<void>` | Exports the grid data to Excel |

### Events

#### GridRowClickedEvent

```typescript
type GridRowClickedEvent = {
  entityId: string;
  entityName: string;
  CompositeKey: CompositeKey;
}
```

#### GridRowEditedEvent

```typescript
type GridRowEditedEvent = {
  record: BaseEntity;
  row: number;
  saved: boolean;
}
```

## Features in Detail

### Record Operations

The grid provides several powerful operations for working with records:

1. **Compare Records** - Select multiple records and visually compare their field values side by side
2. **Merge Records** - Select multiple records, compare them, choose which field values to keep, and merge them into a single record
3. **Duplicate Detection** - Select records and find potential duplicates based on field similarity
4. **List Management** - Add selected records to one or more lists for organization and later retrieval

### Entity Actions and Communication

The grid integrates with MemberJunction's entity action and communication frameworks:

1. **Entity Actions** - Display and execute entity-specific actions defined in the metadata
2. **Communication** - Send emails or other communications related to the entity records

### Excel Export

Export the current view data to Excel with all visible columns and proper formatting.

## Customization

### Column Customization

The grid automatically formats columns based on entity metadata, but you can customize the display:

```typescript
// In your component
modifyColumns() {
  const columns = this.userViewGrid.viewColumns;
  // Customize columns here
  columns.forEach(col => {
    if (col.Name === 'Priority') {
      col.width = 80;
    }
  });
  this.userViewGrid.Refresh(this.userViewGrid.Params!);
}
```

## Dependencies

- @angular/common
- @angular/core
- @angular/forms
- @angular/router
- @memberjunction/global
- @memberjunction/core
- @memberjunction/core-entities
- @memberjunction/entity-communications-client
- @memberjunction/communication-types
- @memberjunction/templates-base-types
- @memberjunction/actions-base
- @memberjunction/ng-shared
- @memberjunction/ng-entity-form-dialog
- @memberjunction/ng-compare-records
- @memberjunction/ng-container-directives
- @memberjunction/ng-entity-communications
- @memberjunction/ng-base-types
- @progress/kendo-angular-grid
- @progress/kendo-angular-layout
- @progress/kendo-angular-inputs
- @progress/kendo-angular-buttons