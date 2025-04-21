# @memberjunction/ng-list-detail-grid

The `@memberjunction/ng-list-detail-grid` package provides an Angular grid component for displaying and managing list details in the MemberJunction Explorer application. It allows users to view, edit, compare, merge, and export records in MemberJunction lists.

## Features

- Display records from MemberJunction lists with pagination
- Inline editing of records with validation
- Column reordering, resizing, and sorting
- Record comparison and merging capabilities
- Duplicate detection and handling
- Excel export functionality
- Keyboard navigation and CRUD operations
- Integration with MemberJunction metadata system
- Virtual scrolling for performance with large datasets
- Selection modes for multi-record operations
- Customizable column formatting

## Installation

```bash
npm install @memberjunction/ng-list-detail-grid
```

## Requirements

- Angular 18+
- @memberjunction/core
- @memberjunction/core-entities
- @memberjunction/ng-compare-records
- @memberjunction/ng-container-directives
- @progress/kendo-angular-grid
- @progress/kendo-angular-layout
- @progress/kendo-angular-inputs
- @progress/kendo-angular-buttons

## Usage

### Basic Setup

First, import the ListDetailGridModule in your module:

```typescript
import { ListDetailGridModule } from '@memberjunction/ng-list-detail-grid';

@NgModule({
  imports: [
    // other imports...
    ListDetailGridModule
  ],
})
export class YourModule { }
```

### Basic Usage

Use the component in your template:

```html
<mj-list-detail-grid
  [Params]="viewParams"
  [BottomMargin]="15"
  [AutoNavigate]="true"
  (rowClicked)="onRowClicked($event)"
  (rowEdited)="onRowEdited($event)">
</mj-list-detail-grid>
```

In your component:

```typescript
import { Component } from '@angular/core';
import { RunViewParams } from '@memberjunction/core';
import { GridRowClickedEvent, GridRowEditedEvent } from '@memberjunction/ng-list-detail-grid';

@Component({
  selector: 'app-my-list-view',
  templateUrl: './my-list-view.component.html',
})
export class MyListViewComponent {
  viewParams: RunViewParams = {
    EntityName: 'Lists',
    ExtraFilter: "Name LIKE '%Customer%'",
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
<mj-list-detail-grid
  [Params]="viewParams"
  [InEditMode]="false"
  [EditMode]="'Save'"
  (rowEdited)="onRowEdited($event)">
</mj-list-detail-grid>
```

The `EditMode` property supports three values:
- `"None"` - Editing is disabled
- `"Save"` - Changes are saved immediately
- `"Queue"` - Changes are queued for later saving

### Record Operations

The grid supports comparing, merging, and finding duplicates:

```typescript
// In your component
import { ViewChild } from '@angular/core';
import { ListDetailGridComponent } from '@memberjunction/ng-list-detail-grid';

@Component({
  // ...
})
export class MyListViewComponent {
  @ViewChild(ListDetailGridComponent) listDetailGrid!: ListDetailGridComponent;
  
  // Start compare mode
  startCompare() {
    this.listDetailGrid.enableCheckbox(false, 'compare');
  }
  
  // Start merge mode
  startMerge() {
    this.listDetailGrid.enableCheckbox(false, 'merge');
  }
  
  // Start duplicate detection
  findDuplicates() {
    this.listDetailGrid.enableCheckbox(false, 'duplicate');
  }
}
```

## API Reference

### ListDetailGridComponent

#### Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `Params` | `RunViewParams` | `undefined` | Parameters for the view to display |
| `BottomMargin` | `number` | `0` | Margin to apply at the bottom of the grid |
| `InEditMode` | `boolean` | `false` | Whether the grid is currently in edit mode |
| `EditMode` | `"None" \| "Save" \| "Queue"` | `"None"` | Mode for handling edited records |
| `AutoNavigate` | `boolean` | `true` | Whether to auto-navigate to a record when clicked |
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
| `EditingComplete` | None | `Promise<boolean>` | Completes the current edit operation |
| `RevertPendingChanges` | None | `void` | Reverts all pending changes |
| `enableCheckbox` | `cancel: boolean, type: 'merge' \| 'compare' \| 'duplicate' \| ''` | `void` | Enables selection mode for operations |
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

## Customization

### Column Customization

The grid automatically formats columns based on entity metadata, but you can customize the formatting by modifying the view columns:

```typescript
// In your component
modifyColumns() {
  const columns = this.listDetailGrid.viewColumns;
  // Customize columns here
  columns.forEach(col => {
    if (col.Name === 'Priority') {
      col.width = 80;
    }
  });
  this.listDetailGrid.Refresh(this.listDetailGrid.Params!);
}
```

### Styling

The component uses the following CSS classes that can be customized:

- `.list-detail-grid-wrap`: Main container for the grid

## Dependencies

- @angular/common
- @angular/core
- @angular/forms
- @angular/router
- @memberjunction/core
- @memberjunction/core-entities
- @memberjunction/ng-shared
- @memberjunction/ng-compare-records
- @memberjunction/ng-container-directives
- @progress/kendo-angular-grid
- @progress/kendo-angular-layout
- @progress/kendo-angular-inputs
- @progress/kendo-angular-buttons