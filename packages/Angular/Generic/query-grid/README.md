# @memberjunction/ng-query-grid

An Angular component for displaying and interacting with data from any MemberJunction query. This component provides a flexible, feature-rich grid interface with built-in pagination, sorting, Excel export capabilities, and more.

## Overview

The Query Grid component is designed to seamlessly display results from MemberJunction queries in a highly configurable Kendo UI Grid. It handles all the complexity of data loading, pagination, and user interactions while providing a clean API for developers to integrate query results into their Angular applications.

## Features

- **Query-Based Data Display**: Execute and display results from any MemberJunction query
- **Virtual Scrolling**: Efficient handling of large datasets with virtual scrolling
- **Pagination**: Built-in pagination with configurable page size (default: 40 rows)
- **Excel Export**: One-click export to Excel with automatic filename generation
- **Sorting and Reordering**: Sort columns and reorder them via drag and drop
- **Column Resizing**: Resize columns to fit your data
- **Row Selection**: Select rows for further operations
- **Row Click Events**: Handle row clicks with detailed event data
- **Loading States**: Visual feedback during data fetching
- **Responsive Layout**: Automatically fills container with `mjFillContainer` directive
- **Refresh Capability**: Built-in refresh button to reload data
- **Deferred Loading**: Control when data loads with the `AllowLoad` input

## Installation

```bash
npm install @memberjunction/ng-query-grid
```

## Usage

### Import the Module

```typescript
import { QueryGridModule } from '@memberjunction/ng-query-grid';

@NgModule({
  imports: [
    QueryGridModule,
    // other imports
  ],
  // ...
})
export class YourModule { }
```

### Basic Component Usage

```html
<!-- Basic query grid with default settings -->
<mj-query-grid
  [Params]="queryParams"
  (rowClicked)="onRowClicked($event)">
</mj-query-grid>
```

### Advanced Configuration

```html
<!-- Fully configured query grid -->
<mj-query-grid
  [Params]="queryParams"
  [BottomMargin]="20"
  [AutoNavigate]="false"
  [AllowLoad]="isReadyToLoad"
  [InEditMode]="false"
  [EditMode]="'None'"
  (rowClicked)="handleRowClick($event)">
</mj-query-grid>
```

### Complete TypeScript Example

```typescript
import { Component, OnInit, ViewChild } from '@angular/core';
import { RunQueryParams } from '@memberjunction/core';
import { GridRowClickedEvent, QueryGridComponent } from '@memberjunction/ng-query-grid';

@Component({
  selector: 'app-customer-orders',
  template: `
    <div class="orders-container">
      <h2>Customer Orders</h2>
      
      <div class="controls">
        <button kendoButton (click)="refreshData()">
          <span class="fa-solid fa-refresh"></span> Refresh
        </button>
        
        <label>
          Date Range:
          <input type="date" [(ngModel)]="startDate" (change)="updateQueryParams()">
          to
          <input type="date" [(ngModel)]="endDate" (change)="updateQueryParams()">
        </label>
      </div>
      
      <div class="grid-container" style="height: 600px;">
        <mj-query-grid
          #orderGrid
          [Params]="orderQueryParams"
          [AutoNavigate]="false"
          [AllowLoad]="true"
          (rowClicked)="onOrderRowClicked($event)">
        </mj-query-grid>
      </div>
      
      <div *ngIf="selectedOrder" class="order-details">
        <h3>Selected Order Details</h3>
        <dl>
          <dt>Order ID:</dt>
          <dd>{{ getOrderField('OrderID') }}</dd>
          
          <dt>Customer:</dt>
          <dd>{{ getOrderField('CustomerName') }}</dd>
          
          <dt>Order Date:</dt>
          <dd>{{ getOrderField('OrderDate') | date }}</dd>
          
          <dt>Total Amount:</dt>
          <dd>{{ getOrderAmount() | currency }}</dd>
        </dl>
      </div>
    </div>
  `,
  styles: [`
    .orders-container {
      padding: 20px;
    }
    
    .controls {
      margin-bottom: 20px;
      display: flex;
      gap: 20px;
      align-items: center;
    }
    
    .grid-container {
      border: 1px solid #ddd;
      margin-bottom: 20px;
    }
    
    .order-details {
      background: #f5f5f5;
      padding: 20px;
      border-radius: 4px;
    }
    
    dl {
      display: grid;
      grid-template-columns: 150px 1fr;
      gap: 10px;
    }
    
    dt {
      font-weight: bold;
    }
  `]
})
export class CustomerOrdersComponent implements OnInit {
  @ViewChild('orderGrid') orderGrid!: QueryGridComponent;
  
  orderQueryParams: RunQueryParams;
  selectedOrder: GridRowClickedEvent | null = null;
  startDate: string;
  endDate: string;
  
  constructor() {
    // Initialize dates
    const today = new Date();
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
    
    this.startDate = lastMonth.toISOString().split('T')[0];
    this.endDate = today.toISOString().split('T')[0];
    
    // Initialize query parameters
    this.orderQueryParams = this.createQueryParams();
  }
  
  ngOnInit() {
    // Component initialization
  }
  
  private createQueryParams(): RunQueryParams {
    return {
      QueryID: 'CustomerOrdersWithDetails',
      Parameters: [
        { Name: 'StartDate', Value: this.startDate },
        { Name: 'EndDate', Value: this.endDate },
        { Name: 'Status', Value: 'Active' }
      ],
      MaxRows: 1000
    };
  }
  
  updateQueryParams() {
    this.orderQueryParams = this.createQueryParams();
    // The grid will automatically refresh when params change
  }
  
  refreshData() {
    // Method 1: Using ViewChild reference
    if (this.orderGrid) {
      this.orderGrid.RefreshFromSavedParams();
    }
    
    // Method 2: Update params to trigger refresh
    // this.orderQueryParams = { ...this.createQueryParams() };
  }
  
  onOrderRowClicked(event: GridRowClickedEvent) {
    console.log('Order clicked:', event);
    this.selectedOrder = event;
    
    // You could navigate to a detail page here
    // this.router.navigate(['/orders', event.entityId]);
  }
  
  getOrderField(fieldName: string): string {
    if (!this.selectedOrder) return '';
    
    const field = this.selectedOrder.KeyValuePairs.find(kvp => kvp.Key === fieldName);
    return field?.Value || '';
  }
  
  getOrderAmount(): number {
    const amount = this.getOrderField('TotalAmount');
    return amount ? parseFloat(amount) : 0;
  }
}
```

## API Reference

### Component Selector
`mj-query-grid`

### Inputs

| Input | Type | Default | Description |
|-------|------|---------|-------------|
| `Params` | `RunQueryParams \| undefined` | `undefined` | Query parameters for data loading |
| `BottomMargin` | `number` | `0` | Bottom margin in pixels |
| `InEditMode` | `boolean` | `false` | Whether the grid is in edit mode |
| `EditMode` | `"None" \| "Save" \| "Queue"` | `"None"` | Type of edit mode |
| `AutoNavigate` | `boolean` | `true` | Whether to auto-navigate on row click |
| `AllowLoad` | `boolean` | `true` | Controls whether data loading is allowed |

### Outputs

| Output | Type | Description |
|--------|------|-------------|
| `rowClicked` | `EventEmitter<GridRowClickedEvent>` | Emitted when a grid row is clicked |

### Public Methods

| Method | Parameters | Return Type | Description |
|--------|------------|-------------|-------------|
| `Refresh` | `params: RunQueryParams` | `Promise<void>` | Refreshes grid data with new query parameters |
| `RefreshFromSavedParams` | none | `Promise<void>` | Refreshes grid using previously saved parameters |
| `doExcelExport` | none | `Promise<void>` | Exports current grid data to Excel file |

### Types

#### GridRowClickedEvent
```typescript
export type GridRowClickedEvent = {
  entityId: number;
  entityName: string;
  KeyValuePairs: KeyValuePair[];
}
```

#### RunQueryParams (from @memberjunction/core)
```typescript
interface RunQueryParams {
  QueryID: string;              // ID of the query to execute
  Parameters?: QueryParam[];    // Optional query parameters
  MaxRows?: number;            // Maximum rows to return
}

interface QueryParam {
  Name: string;
  Value: any;
}
```

## Grid Configuration

The component uses Kendo UI Grid with the following configuration:

- **Virtual Scrolling**: Enabled for performance with large datasets
- **Row Height**: 36px fixed height for virtual scrolling
- **Page Size**: 40 rows per page
- **Features**: Sorting, resizing, reordering, and selection enabled
- **Toolbar**: Excel export and refresh buttons

## Excel Export

The Excel export feature:
- Exports all loaded data (not just visible page)
- Automatically names file as `{QueryID}_Query.xlsx`
- Shows progress notifications during export
- Dynamically generates columns based on query results

## Styling and Layout

The component uses:
- `mjFillContainer` directive to fill available space
- Kendo UI Grid default styling
- Font Awesome icons for buttons
- Customizable through CSS

## Dependencies

### Peer Dependencies
- `@angular/common`: ^18.0.2
- `@angular/core`: ^18.0.2
- `@angular/forms`: ^18.0.2
- `@angular/router`: ^18.0.2
- `@progress/kendo-angular-grid`: ^16.2.0
- `@progress/kendo-angular-buttons`: ^16.2.0
- `@progress/kendo-angular-dialog`: ^16.2.0

### Runtime Dependencies
- `@memberjunction/core`: For query execution and metadata
- `@memberjunction/core-entities`: For entity types
- `@memberjunction/global`: For global utilities and events
- `@memberjunction/ng-container-directives`: For layout directives
- `@memberjunction/ng-compare-records`: For record comparison
- `@memberjunction/ng-shared`: For shared Angular utilities

## Integration with MemberJunction

This component integrates seamlessly with the MemberJunction ecosystem:

1. **Query Execution**: Uses `RunQuery` class from `@memberjunction/core` to execute queries
2. **Metadata Support**: Leverages MemberJunction metadata system
3. **Event System**: Uses `MJGlobal` event system for notifications
4. **Layout Integration**: Works with MemberJunction container directives

## Best Practices

1. **Container Height**: Always wrap the component in a container with defined height for virtual scrolling
2. **Query Parameters**: Validate query parameters before passing to the component
3. **Error Handling**: The component shows error notifications automatically
4. **Performance**: Use `MaxRows` parameter for large datasets
5. **Deferred Loading**: Use `AllowLoad` input to control when data loads

## Troubleshooting

### Grid Not Displaying
- Ensure the parent container has a defined height
- Check that `Params` includes a valid `QueryID`
- Verify query permissions in MemberJunction

### Export Not Working
- Check browser permissions for file downloads
- Ensure data is loaded before attempting export
- Verify Excel export module is properly imported

### Performance Issues
- Use `MaxRows` to limit result set size
- Enable virtual scrolling (default)
- Consider server-side pagination for very large datasets

## License

ISC