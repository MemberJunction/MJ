# @memberjunction/ng-list-detail-grid

The `@memberjunction/ng-list-detail-grid` package provides a powerful Angular grid component for displaying and managing list details in the MemberJunction Explorer application. It enables users to view, edit, compare, merge, and export records from any MemberJunction entity with comprehensive data management capabilities.

## Features

- **Data Display & Navigation**
  - Display records from both saved views and dynamic queries
  - Virtual scrolling with pagination for optimal performance
  - Automatic column formatting based on entity metadata
  - Support for boolean values with checkmark display
  - Configurable bottom margin for layout flexibility

- **Editing Capabilities**
  - Inline cell editing with validation
  - Three edit modes: None, Save (immediate), and Queue (batch)
  - Keyboard navigation support (ESC to cancel edits)
  - Automatic data type detection for appropriate editors
  - Revert pending changes functionality

- **Column Management**
  - Column reordering via drag and drop
  - Column resizing with persistence
  - Multi-column sorting
  - Hide/show columns
  - Automatic column width based on entity metadata

- **Record Operations**
  - Compare multiple records side-by-side
  - Merge duplicate records with field-level selection
  - Find potential duplicates within datasets
  - Multi-record selection with checkbox mode
  - Excel export with full dataset support

- **Integration Features**
  - Deep integration with MemberJunction metadata system
  - Automatic permission checking for CRUD operations
  - State persistence for saved views
  - Event-driven architecture for parent component interaction

## Installation

```bash
npm install @memberjunction/ng-list-detail-grid
```

## Requirements

- Angular 21+
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

The main component that renders the grid and handles all data operations.

#### Inputs

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `Params` | `RunViewParams` | `undefined` | Parameters for the view to display. Can include ViewID, ViewName, ViewEntity, or EntityName with ExtraFilter |
| `BottomMargin` | `number` | `0` | Margin to apply at the bottom of the grid in pixels |
| `InEditMode` | `boolean` | `false` | Whether the grid is currently in edit mode |
| `EditMode` | `"None" \| "Save" \| "Queue"` | `"None"` | Mode for handling edited records. "Save" saves immediately, "Queue" batches changes |
| `AutoNavigate` | `boolean` | `true` | Whether to auto-navigate to a record detail page when clicked |
| `AllowLoad` | `boolean` | `true` | Whether to allow loading the data. Useful for deferring load until ready |

#### Outputs

| Name | Type | Description |
|------|------|-------------|
| `rowClicked` | `EventEmitter<GridRowClickedEvent>` | Emitted when a row is clicked, includes entity info and composite key |
| `rowEdited` | `EventEmitter<GridRowEditedEvent>` | Emitted when a row is edited, includes the record and save status |

#### Public Methods

| Name | Parameters | Return Type | Description |
|------|------------|-------------|-------------|
| `Refresh` | `params: RunViewParams` | `Promise<void>` | Refreshes the grid data with new parameters |
| `RefreshFromSavedParams` | None | `Promise<void>` | Refreshes using the current saved parameters |
| `EditingComplete` | None | `Promise<boolean>` | Completes the current edit operation and closes any open cells |
| `RevertPendingChanges` | None | `void` | Reverts all pending changes in Queue mode |
| `enableCheckbox` | `cancel: boolean, type: 'merge' \| 'compare' \| 'duplicate' \| ''` | `void` | Enables/disables selection mode for operations |
| `doExcelExport` | None | `Promise<void>` | Exports the entire dataset to Excel |
| `IsDynamicView` | None | `boolean` | Returns true if using a dynamic view (not saved) |

#### Public Properties

| Name | Type | Description |
|------|------|-------------|
| `PendingRecords` | `GridPendingRecordItem[]` | Array of records with pending changes in Queue mode |
| `ViewID` | `string` | The ID of the current view (if using a saved view) |
| `viewColumns` | `ViewColumnInfo[]` | Array of all column configurations |
| `visibleColumns` | `ViewColumnInfo[]` | Array of visible (non-hidden) columns |
| `viewExecutionTime` | `number` | Time taken to execute the view query (in seconds) |

### Type Definitions

#### GridRowClickedEvent

Emitted when a user clicks on a grid row.

```typescript
type GridRowClickedEvent = {
  entityId: string;         // The ID of the entity definition
  entityName: string;       // The name of the entity
  CompositeKey: CompositeKey; // Composite key object for the clicked record
}
```

#### GridRowEditedEvent

Emitted when a row edit operation completes.

```typescript
type GridRowEditedEvent = {
  record: BaseEntity;  // The entity record that was edited
  row: number;         // The row index in the grid
  saved: boolean;      // Whether the save was successful (always false in Queue mode)
}
```

#### GridPendingRecordItem

Represents a record with pending changes in Queue mode.

```typescript
type GridPendingRecordItem = {
  record: BaseEntity;  // The entity record with changes
  row: number;         // The row index in the grid
  dataItem: any;       // The raw data item from the grid
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

### Advanced Usage

#### Working with Dynamic Views

For scenarios where you need to display data without a saved view:

```typescript
// Dynamic view with custom filtering
const dynamicParams: RunViewParams = {
  EntityName: 'Customers',
  ExtraFilter: "Status='Active' AND Country='USA'",
  OrderBy: 'CreatedAt DESC',
  Skip: 0,
  Take: 100
};

// Use with the grid
<mj-list-detail-grid [Params]="dynamicParams"></mj-list-detail-grid>
```

#### Handling Batch Edits

When using Queue mode for batch editing:

```typescript
export class MyComponent {
  @ViewChild(ListDetailGridComponent) grid!: ListDetailGridComponent;
  
  async savePendingChanges() {
    // Get all pending records
    const pendingRecords = this.grid.PendingRecords;
    
    // Save each record
    for (const item of pendingRecords) {
      const saved = await item.record.Save();
      if (!saved) {
        console.error('Failed to save record:', item.record.PrimaryKey);
      }
    }
    
    // Refresh the grid
    await this.grid.RefreshFromSavedParams();
  }
  
  cancelChanges() {
    this.grid.RevertPendingChanges();
  }
}
```

#### Programmatic Record Operations

```typescript
export class MyComponent {
  @ViewChild(ListDetailGridComponent) grid!: ListDetailGridComponent;
  
  // Start duplicate detection
  async detectDuplicates() {
    // Enable duplicate mode
    this.grid.enableCheckbox(false, 'duplicate');
    
    // Programmatically select records if needed
    this.grid.selectedKeys = [0, 1, 2]; // Select first 3 records
    
    // Trigger duplicate detection
    await this.grid.findDuplicateRecords();
  }
}
```

### Performance Optimization

The grid implements several performance optimizations:

1. **Virtual Scrolling**: Only renders visible rows, enabling smooth scrolling through large datasets
2. **Lazy Column Formatting**: Formats data only when needed for display
3. **Debounced View Saving**: Column and sort changes are saved after a 5-second delay to reduce API calls
4. **Efficient Data Loading**: Uses MemberJunction's RunView for optimized server-side queries

### Styling

The component uses the following CSS classes that can be customized:

- `.list-detail-grid-wrap`: Main container for the grid
- Column-specific styles are applied based on data types (right-aligned for numbers, left-aligned for text)

### Best Practices

1. **Use Saved Views When Possible**: Saved views persist user preferences and are more performant
2. **Choose Appropriate Edit Mode**: 
   - Use "Save" mode for immediate persistence
   - Use "Queue" mode when users need to review changes before saving
3. **Handle Events Properly**: Always handle `rowEdited` events to provide user feedback
4. **Export Considerations**: Large exports may take time; the component shows notifications during export
5. **Permission Checking**: The component automatically checks entity permissions before allowing edits

## Integration with MemberJunction

This component deeply integrates with MemberJunction's metadata system:

- Automatically formats columns based on entity field metadata
- Respects entity permissions for CRUD operations
- Uses entity field validation rules
- Supports all MemberJunction field types including virtual fields
- Integrates with the MemberJunction audit log for exports

## Dependencies

### Angular Dependencies
- `@angular/common`: ^18.0.2
- `@angular/core`: ^18.0.2
- `@angular/forms`: ^18.0.2
- `@angular/router`: ^18.0.2

### MemberJunction Dependencies
- `@memberjunction/core`: ^2.43.0
- `@memberjunction/core-entities`: ^2.43.0
- `@memberjunction/global`: ^2.43.0
- `@memberjunction/ng-shared`: ^2.43.0
- `@memberjunction/ng-compare-records`: ^2.43.0
- `@memberjunction/ng-container-directives`: ^2.43.0

### Kendo UI Dependencies
- `@progress/kendo-angular-grid`: ^16.2.0
- `@progress/kendo-angular-layout`: ^16.2.0
- `@progress/kendo-angular-inputs`: ^16.2.0
- `@progress/kendo-angular-buttons`: ^16.2.0
- `@progress/kendo-angular-excel-export`: (via GridModule)
- `@progress/kendo-angular-dialog`: (via GridModule)

## Troubleshooting

### Common Issues

#### Grid Not Loading Data
- Ensure `AllowLoad` is set to `true` (default)
- Verify that `Params` contains valid view parameters
- Check console for API errors or permission issues

#### Edit Mode Not Working
- Verify the entity has `AllowUpdateAPI` set to true
- Check user permissions for the entity
- Ensure `EditMode` is set to either "Save" or "Queue"

#### Export Failing
- Check for large dataset timeouts
- Ensure user has appropriate permissions
- Verify the export audit log entry was created

#### Column Reordering Not Persisting
- Only works with saved views (not dynamic views)
- User must own the view to save changes
- Check for save errors in the console

### Debug Tips

1. Enable console logging to see detailed error messages
2. Check the Network tab for failed API calls
3. Verify entity metadata is loaded before grid initialization
4. Use `viewExecutionTime` property to identify slow queries

## Migration Guide

### From Earlier Versions

If upgrading from versions prior to 2.43.0:

1. Update all MemberJunction dependencies to matching versions
2. Update Angular to version 18
3. Update Kendo UI components to version 16.2.0
4. Review breaking changes in the CHANGELOG.md

## Contributing

When contributing to this package:

1. Follow the MemberJunction coding standards
2. Ensure all TypeScript compiles without errors
3. Update this README for any API changes
4. Add unit tests for new functionality
5. Update the CHANGELOG.md

## License

This package is part of the MemberJunction framework and follows the same [ISC License](../../../LICENSE).