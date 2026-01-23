## Purpose
Entity-aware data grid that automatically loads MemberJunction entity records via RunView with intelligent adaptive caching. Wraps DataGrid component with automatic data management.

## Data Source
- **Required**: `entityName` prop (MemberJunction entity name)
- **Automatic**: Calls `utilities.rv.RunView` internally
- **Optional**: `extraFilter` (SQL WHERE clause), `orderBy` (SQL ORDER BY clause), `fields` (array of field names)

## Adaptive Caching Strategy

### Mode Selection Logic
On initial load, fetches `maxCachedRows` records (default 1000) and checks `result.RowCount`:

**FULL CACHE MODE** (`totalRecords ≤ maxCachedRows`):
- Loads ALL entity records into memory upfront
- All sorting, filtering, pagination happens client-side (instant, no server calls)
- Perfect for drill-down scenarios where filtered datasets are typically small
- Shows indicator: "All X records loaded"

**PARTIAL CACHE MODE** (`totalRecords > maxCachedRows`):
- Loads first `maxCachedRows` records initially
- Server-side sorting (new RunView with OrderBy, clears cache)
- Server-side pagination (RunView with Skip/MaxRows parameters)
- Caches visited pages (Map<pageNumber, pageData>) for instant back/forward
- Shows warning: "Showing first 1,000 of 15,000 records - refine extraFilter for better performance"

### Cache Invalidation
Clears all caches when:
- `entityName` prop changes
- `extraFilter` prop changes
- `orderBy` prop changes (in partial mode only)
- `refreshTrigger` increments (manual refresh)

Resets to page 1 and re-enters loading state.

## Sorting Behavior

### Full Cache Mode
- Client-side array.sort() on cached records
- Instant sorting (no server calls)
- Uses JavaScript string localeCompare or numeric comparison

### Partial Cache Mode
- Server-side: Triggers new RunView with OrderBy parameter
- Clears all caches and reloads from page 1
- Loading indicator shows during fetch

**Control**: DataGrid's `enableSorting` prop controls column sort UI. Component's `orderBy` prop sets initial/default sort.

## Filtering Behavior

### extraFilter Prop (Database-level)
- Always server-side (RunView ExtraFilter parameter)
- Affects both full and partial cache modes
- Use for: WHERE clauses, date ranges, status filters, user scoping
- Changing `extraFilter` clears cache and reloads

### DataGrid Text Filter (UI Search)
**Full cache mode**:
- Client-side filtering of cached records (instant)
- Searches across specified fields or all display fields

**Partial cache mode**:
- Filters current page data only (doesn't refetch)
- Shows warning banner: "Text filtering searches loaded records only. Use extraFilter prop for database-level filtering."

## Pagination Strategy

### Full Cache Mode
- Pure client-side array slicing
- No server calls on page change
- Instant page navigation

### Partial Cache Mode
- Checks page cache: `pageCache.has(pageNum)`
- **Cache hit**: Uses cached data (instant)
- **Cache miss**: Fetches via RunView with Skip/MaxRows (loading indicator)
- Stores result in pageCache
- Smart eviction: Keeps last 10 pages (LRU strategy)

Page size changes always reset to page 1.

## Field Selection

### Auto-detection (if `fields` prop omitted)
- Loads entity from `utilities.md.Entities`
- Gets first 15 non-system fields (filters out `__mj*` fields)
- Uses DisplayName from metadata for column headers

### Explicit fields
- Pass array of field names: `['Name', 'Email', 'Status']`
- Component validates fields exist in entity metadata
- Warning logged for unknown fields

## Primary Key Detection
Auto-detects primary keys from entity metadata for OpenEntityRecord integration:
- Handles single keys: `'ID'`
- Handles composite keys: `['OrderID', 'LineNumber']`
- Passes to DataGrid as `entityPrimaryKeys` prop for row click behavior

## Integration with DataGrid
EntityDataGrid passes managed data to DataGrid with these overrides:

- `data`: Current page records (loaded/cached)
- `entityName`: Passed through
- `entityPrimaryKeys`: Auto-detected from metadata
- `columns`: Maps `fields` prop to DataGrid columns (auto-detected if omitted)
- `sorting={false}`: Component handles sorting logic (client vs server)
- `paging={false}`: Component handles pagination logic (client vs server)
- `filtering={enableFiltering}`: Passed through (component handles filter behavior)
- All other props: selection, autoFitColumns, onRowClick, events passed through

## User Experience Indicators

### Loading States
- Initial load: Full-page spinner
- Pagination in partial mode: Subtle overlay
- Sorting in partial mode: Loading indicator

### Cache Mode Indicators
- Full mode: Badge showing "All X records loaded"
- Partial mode: Warning banner "Showing first X of Y records"

### Warnings
- Partial mode text filter: "Searches loaded records only - use extraFilter for database filtering"
- Large dataset: Suggests refining extraFilter for better performance

### Refresh Button
- Visible in all modes
- Clears all caches and reloads from page 1
- Useful after external data changes

## Error Handling
- Network errors: "Unable to load data. [Retry]" button
- Invalid filters: Shows error with filter details
- Permission errors: "You do not have access to this entity"
- Empty results: "No {entityName} found" or "No {entityName} match your filters"
- RunView.Success=false: Shows ErrorMessage with retry option

## Events
All DataGrid events bubble up:
- `onPageChanged`: Fires after page change completes (includes current page data)
- `onSortChanged`: Fires after sort completes
- `onFilterChanged`: Fires after filter applied
- `onRowClick`: Fires on row click
- `onSelectionChanged`: Fires on selection change

Additional EntityDataGrid events:
- `onDataLoaded`: Fires after successful RunView (includes rowCount, cacheMode)
- `onLoadError`: Fires on RunView errors
- `onCacheModeChanged`: Fires when switching full↔partial (optional)
