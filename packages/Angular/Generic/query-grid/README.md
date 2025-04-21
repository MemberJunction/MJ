# Query Grid Component

An Angular grid component for displaying and interacting with data from any MemberJunction query. This component provides a flexible way to display query results in a feature-rich grid with pagination, sorting, and Excel export capabilities.

## Features

- **Query-Based Data Display**: Show results from any MemberJunction query
- **Pagination**: Built-in pagination with configurable page size
- **Virtual Scrolling**: Efficient handling of large datasets
- **Excel Export**: One-click export to Excel
- **Sorting and Reordering**: Sort columns and reorder them via drag and drop
- **Row Selection**: Select rows for further operations
- **Responsive Layout**: Automatically adjusts to container size
- **Event Handling**: Row click events for interactive applications
- **Loading States**: Visual feedback during data fetching

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

### With Configuration Options

```html
<!-- Configured query grid -->
<mj-query-grid
  [Params]="queryParams"
  [BottomMargin]="20"
  [AutoNavigate]="false"
  [AllowLoad]="isAllowedToLoad"
  (rowClicked)="onRowClicked($event)">
</mj-query-grid>
```

### TypeScript Component Example

```typescript
import { Component, OnInit } from '@angular/core';
import { RunQueryParams } from '@memberjunction/core';
import { GridRowClickedEvent } from '@memberjunction/ng-query-grid';

@Component({
  selector: 'app-sales-dashboard',
  template: `
    <h2>Sales Query Results</h2>
    
    <div class="query-controls">
      <button kendoButton (click)="refreshData()">Refresh Data</button>
      <button kendoButton (click)="toggleAutoNavigate()">
        {{ autoNavigate ? 'Disable' : 'Enable' }} Auto Navigation
      </button>
    </div>
    
    <div class="query-container">
      <mj-query-grid
        [Params]="salesQueryParams"
        [AutoNavigate]="autoNavigate"
        (rowClicked)="onSalesRowClicked($event)">
      </mj-query-grid>
    </div>
    
    <div *ngIf="selectedRow">
      <h3>Selected Order Details</h3>
      <p>Order ID: {{ getOrderId() }}</p>
      <p>Customer: {{ getCustomerName() }}</p>
      <p>Amount: {{ getOrderAmount() | currency }}</p>
    </div>
  `,
  styles: [`
    .query-container {
      height: 600px;
      margin-bottom: 20px;
    }
    .query-controls {
      margin-bottom: 10px;
    }
    button {
      margin-right: 10px;
    }
  `]
})
export class SalesDashboardComponent implements OnInit {
  salesQueryParams: RunQueryParams;
  autoNavigate = true;
  selectedRow: GridRowClickedEvent | null = null;
  
  constructor() {
    // Initialize query parameters
    this.salesQueryParams = {
      QueryID: 'SalesOrdersSummary',
      Parameters: [
        { Name: 'StartDate', Value: '2023-01-01' },
        { Name: 'EndDate', Value: '2023-12-31' }
      ]
    };
  }
  
  ngOnInit() {
    // Additional initialization if needed
  }
  
  refreshData() {
    // Get a reference to the grid and refresh it
    const grid = document.querySelector('mj-query-grid') as any;
    if (grid) {
      grid.RefreshFromSavedParams();
    }
  }
  
  toggleAutoNavigate() {
    this.autoNavigate = !this.autoNavigate;
  }
  
  onSalesRowClicked(event: GridRowClickedEvent) {
    console.log('Row clicked:', event);
    this.selectedRow = event;
    
    // If auto-navigate is enabled, you could navigate to a detail page
    if (this.autoNavigate) {
      const orderId = this.getOrderId();
      // this.router.navigate(['/orders', orderId]);
    }
  }
  
  getOrderId(): string {
    return this.selectedRow?.KeyValuePairs.find(kvp => kvp.Key === 'OrderID')?.Value || '';
  }
  
  getCustomerName(): string {
    return this.selectedRow?.KeyValuePairs.find(kvp => kvp.Key === 'CustomerName')?.Value || '';
  }
  
  getOrderAmount(): number {
    const amount = this.selectedRow?.KeyValuePairs.find(kvp => kvp.Key === 'TotalAmount')?.Value;
    return amount ? parseFloat(amount) : 0;
  }
}
```

## API Reference

### Inputs

- `Params`: RunQueryParams - Parameters for running the query
- `BottomMargin`: number - Bottom margin in pixels (default: 0)
- `InEditMode`: boolean - Whether the grid is in edit mode (default: false)
- `EditMode`: "None" | "Save" | "Queue" - Edit mode type (default: "None")
- `AutoNavigate`: boolean - Whether to auto-navigate on row click (default: true)
- `AllowLoad`: boolean - Whether to allow loading data (default: true)

### Outputs

- `rowClicked`: EventEmitter<GridRowClickedEvent> - Emitted when a row is clicked

### Methods

- `Refresh(params: RunQueryParams)`: Refreshes the grid data with the given query parameters
- `RefreshFromSavedParams()`: Refreshes the grid data using the previously saved parameters
- `doExcelExport()`: Exports the current grid data to Excel

### Types

```typescript
export type GridRowClickedEvent = {
  entityId: number;
  entityName: string;
  KeyValuePairs: KeyValuePair[];
}
```

## Query Parameters

The component accepts a `RunQueryParams` object that specifies which query to run:

```typescript
const queryParams: RunQueryParams = {
  QueryID: 'MyQueryID',              // ID of the query to run
  Parameters: [                      // Optional query parameters
    { Name: 'Param1', Value: 'Value1' },
    { Name: 'Param2', Value: 42 }
  ],
  MaxRows: 1000                      // Optional maximum rows to return
};
```

## Excel Export

The component includes built-in Excel export functionality. Users can click the Excel export button in the grid toolbar to download the current data as an Excel file. The file will be named based on the QueryID (e.g., "MyQueryID_Query.xlsx").

## Grid Features

The grid component leverages Kendo UI Grid and includes the following features:

- Virtual scrolling for performance with large datasets
- Column resizing, reordering, and sorting
- Row selection
- Pagination with configurable page size
- Loading indicator during data fetch
- Responsive design that fills its container

## Styling

The component uses Kendo UI Grid component styles and includes basic CSS that can be overridden in your application.

## Dependencies

- `@memberjunction/core`: For metadata and query execution
- `@memberjunction/core-entities`: For entity types
- `@memberjunction/global`: For global utilities
- `@progress/kendo-angular-grid`: For the grid component
- `@progress/kendo-angular-excel-export`: For Excel export functionality