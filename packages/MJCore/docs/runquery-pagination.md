# RunQuery Pagination Documentation

## Overview

The MemberJunction RunQuery infrastructure now supports server-side pagination through the addition of `StartRow` and `MaxRows` parameters. This enables efficient handling of large query result sets by retrieving data in manageable chunks.

## Key Features

### 1. Pagination Parameters

The `RunQueryParams` type now includes two optional pagination parameters:

```typescript
export type RunQueryParams = {
    QueryID?: string
    QueryName?: string
    CategoryName?: string
    CategoryID?: string
    Parameters?: Record<string, any>
    /**
     * Optional maximum number of rows to return from the query.
     * If not provided, all rows will be returned.
     */
    MaxRows?: number
    /**
     * Optional - if provided, this value will be used to offset the rows returned.
     * Used for pagination in conjunction with MaxRows.
     */
    StartRow?: number
}
```

### 2. Enhanced Result Type

The `RunQueryResult` type now includes `TotalRowCount` to support pagination UI:

```typescript
export type RunQueryResult = {
    QueryID: string;
    QueryName: string;
    Success: boolean;
    Results: any[];
    RowCount: number;
    /**
     * Total number of rows that would be returned without pagination.
     * Only differs from RowCount when StartRow or MaxRows are used.
     */
    TotalRowCount: number;
    ExecutionTime: number;
    ErrorMessage: string;
    AppliedParameters?: Record<string, any>;
}
```

## Usage Examples

### Basic Pagination

```typescript
const runQuery = new RunQuery();

// Get first 100 rows
const firstPage = await runQuery.RunQuery({
    QueryID: 'query-id-here',
    MaxRows: 100,
    StartRow: 0
});

console.log(`Showing ${firstPage.RowCount} of ${firstPage.TotalRowCount} total rows`);

// Get next 100 rows
const secondPage = await runQuery.RunQuery({
    QueryID: 'query-id-here',
    MaxRows: 100,
    StartRow: 100
});
```

### With Parameters

```typescript
const results = await runQuery.RunQuery({
    QueryName: 'Sales By Region',
    Parameters: {
        startDate: '2024-01-01',
        endDate: '2024-12-31',
        region: 'North America'
    },
    MaxRows: 50,
    StartRow: 0
});
```

### GraphQL Usage

```graphql
query GetQueryData {
  GetQueryData(
    QueryID: "12345",
    Parameters: {
      status: "active"
    },
    MaxRows: 25,
    StartRow: 0
  ) {
    Success
    Results
    RowCount
    TotalRowCount
    ExecutionTime
    ErrorMessage
  }
}
```

## Implementation Details

### How It Works

1. **Query Execution**: The full query is executed on the database to ensure accurate results
2. **Total Count**: The total number of rows is captured before pagination
3. **Pagination**: Results are sliced based on `StartRow` and `MaxRows` parameters
4. **Response**: Both `RowCount` (actual rows returned) and `TotalRowCount` (total available) are provided

### Performance Considerations

- The current implementation executes the full query and applies pagination in memory
- This ensures result consistency and accurate total counts
- For very large result sets, consider adding query-level filtering to reduce the initial dataset

### Consistent Ordering

- Ensure your queries include an `ORDER BY` clause for consistent pagination
- Without ordering, results may appear in different positions across page requests

## UI Integration Example

Here's an example of implementing pagination controls in Angular:

```typescript
export class QueryResultsComponent {
    maxRows = 100;
    startRow = 0;
    totalRowCount = 0;
    
    async loadPage() {
        const result = await this.runQuery.RunQuery({
            QueryID: this.queryId,
            MaxRows: this.maxRows,
            StartRow: this.startRow
        });
        
        this.totalRowCount = result.TotalRowCount;
        this.processResults(result.Results);
    }
    
    nextPage() {
        if (this.startRow + this.maxRows < this.totalRowCount) {
            this.startRow += this.maxRows;
            this.loadPage();
        }
    }
    
    previousPage() {
        if (this.startRow > 0) {
            this.startRow = Math.max(0, this.startRow - this.maxRows);
            this.loadPage();
        }
    }
}
```

## Best Practices

1. **Always specify MaxRows** when implementing pagination to avoid loading excessive data
2. **Include ORDER BY** in your queries to ensure consistent pagination
3. **Display pagination info** to users (e.g., "Showing 1-100 of 2,543 rows")
4. **Handle edge cases** such as when StartRow exceeds TotalRowCount
5. **Consider caching** for frequently accessed pages to improve performance

## Backward Compatibility

The pagination parameters are optional, ensuring full backward compatibility:
- Existing queries without pagination parameters continue to work unchanged
- `TotalRowCount` equals `RowCount` when pagination is not used
- No changes required to existing code unless pagination is desired