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

## Primary Key Detection (Internal)
EntityDataGrid auto-detects primary keys from entity metadata for OpenEntityRecord integration. Users do NOT need to pass primary key information -- this is handled entirely internally.

Detection supports:
- Single keys: `'ID'`
- Composite keys: `['OrderID', 'LineNumber']`

The detected keys are passed internally to the wrapped DataGrid component.

## Integration with DataGrid
EntityDataGrid passes managed data to DataGrid with these overrides:

- `data`: Current page records (loaded/cached)
- `entityName`: Passed through
- `entityPrimaryKeys`: Auto-detected from entity metadata (not a user-facing prop)
- `columns`: Maps `fields` prop to DataGrid columns (auto-detected if omitted)
- `sorting={false}`: Component handles sorting logic (client vs server)
- `paging={false}`: Component handles pagination logic (client vs server)
- `filtering={enableFiltering}`: Passed through (component handles filter behavior)
- `exportable`, `exportLabel`, `exportGetRows`: the inner DataGrid shows the export button, with EntityDataGrid's all-records loader as its rows (see Export)
- All other props: selection, autoFitColumns, onRowClick, events passed through

## Export (built in)
`exportable={true}` (default):
- An export icon (via the registry `ExportableData` component) beside the inner DataGrid's search box (the inner DataGrid shows it, with this component's rows). Menu: **CSV** and **Excel**, named `<exportLabel or entityName>_<YYYY-MM-DD>.<ext>`.
- Rows: every record matching `extraFilter` and the user's text filter, in the current sort, not only the loaded page.
  - Full cache mode: the cached records (already in the current sort), text-filtered in memory. No server call.
  - Partial cache mode: one RunView for all matching records (`ExtraFilter`, the current `OrderBy`, only the displayed fields), capped at 100,000 records with a console warning when capped, then text-filtered like the grid's search.
- Columns: the displayed fields, headed like the grid (ColumnDef `header`, else the field's DisplayName), typed from entity metadata (money → currency, date/time → date, bit → boolean, numeric → number, value lists and text → text). Raw values; custom `render` output is not exported.
- The inner DataGrid shows the icon; `exportGetRows` replaces its one loaded page with every matching record.
- `exportable={false}` renders no export icon and no wrapper.
- Callers must NOT wrap EntityDataGrid in `ExportableData`.

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
