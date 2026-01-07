## Architecture
React functional component that wraps DataGrid with automatic RunView data loading and adaptive caching logic.

## State Management
- **data** (Array | null): Current page records for display
- **allDataCache** (Array | null): All records in full cache mode
- **pageCache** (Map<number, Array>): Cached pages in partial cache mode
- **cacheMode** ('full' | 'partial' | 'loading'): Current cache strategy
- **loading** (boolean): Data fetch in progress
- **error** (string | null): Error message if load failed
- **currentPage** (number, 1-based): Current pagination page
- **currentPageSize** (number): Records per page
- **totalRecords** (number | null): Total record count from RowCount
- **entityInfo** (object): Entity metadata from `utilities.md`
- **currentOrderBy** (string): Active sort order
- **refreshTrigger** (number): Increment to force reload

## Initial Load Logic (useEffect)

### Triggers
Runs on: `entityName`, `extraFilter`, `refreshTrigger` changes

### Process
1. Call `RunView` with:
   - EntityName: `entityName`
   - ExtraFilter: `extraFilter` prop
   - OrderBy: `orderBy` prop or primary key
   - MaxRows: `maxCachedRows` (default 1000)
   - Skip: 0
   - ResultType: 'entity_object'

2. **On success**:
   - Check `result.RowCount` vs `maxCachedRows`
   - **If RowCount ≤ maxCachedRows OR RowCount is null**:
     - `setCacheMode('full')`
     - `setAllDataCache(result.Results)`
     - `setData(result.Results.slice(0, pageSize))`
   - **If RowCount > maxCachedRows**:
     - `setCacheMode('partial')`
     - `setPageCache(Map with page 1 = result.Results)`
     - `setData(first page slice)`
   - Store `totalRecords` from RowCount

3. **On failure**:
   - Set error message
   - Clear all caches

## Cache Modes

### Full Cache Mode
**When**: `totalRecords ≤ maxCachedRows`

**Behavior**:
- All data stored in `allDataCache`
- **Pagination**: Client-side array slicing (instant)
- **Sorting**: `sortClientSide()` - array.sort(), instant
- **Text filtering**: Client-side array.filter(), instant
- No loading states on interactions

**Benefits**:
- Instant UX for all interactions
- Perfect for drill-down scenarios (typically < 1000 records)
- Reduces server load

### Partial Cache Mode
**When**: `totalRecords > maxCachedRows`

**Behavior**:
- **pageCache**: Map<pageNum, data[]>
- **Pagination**: Check cache, fetch if miss
  - Cache hit: Instant
  - Cache miss: RunView with Skip/MaxRows, show loading
- **Sorting**: `sortServerSide()` - clears caches, new RunView with OrderBy
- **Text filtering**: Filters current page only, shows warning banner
- **Smart eviction**: Keep last 10 pages (LRU strategy)

**Warning banner**: "Showing first 1,000 of 15,000 records - refine extraFilter for better performance"

## Cache Invalidation
Clears `allDataCache` and `pageCache` when:
- `entityName` changes
- `extraFilter` changes
- `orderBy` changes (partial mode only)
- `refreshTrigger` increments

Resets to page 1 and `cacheMode='loading'`.

## Sort Handling

### Full Cache Mode
`sortClientSide()`:
- Sorts `allDataCache` in place
- Updates `data` slice for current page
- Fires `onSortChanged` event
- Instant (no server call)

### Partial Cache Mode
`sortServerSide()`:
- Clears all caches
- Sets `orderBy` state with new sort
- Triggers useEffect reload
- Shows loading indicator
- Fires `onSortChanged` after completion

## Filter Handling

### extraFilter Prop (Database-level)
- Always server-side (RunView ExtraFilter parameter)
- Affects both full and partial modes
- Clears cache and reloads on change

### DataGrid Text Filter (UI Search)
**Full mode**:
- Filters `allDataCache` instantly
- Shows filtered results
- No server call

**Partial mode**:
- Filters current page data only
- Shows warning: "Text filtering searches loaded records only. Use extraFilter for database-level filtering."
- Does not refetch from server

## Page Navigation
`handlePageChange(newPage)`:
1. Validate page bounds
2. **If full cache mode**:
   - Slice `allDataCache` at new offset
   - Instant
3. **If partial cache mode**:
   - Check `pageCache.has(newPage)`
   - **Cache hit**: Use cached data (instant)
   - **Cache miss**: Fetch via RunView (show loading)
     - Parameters: EntityName, ExtraFilter, OrderBy, Skip=(page-1)*pageSize, MaxRows=pageSize
     - Store result in `pageCache`
     - Update `data`
4. Update `currentPage` state

## Entity Metadata Loading (useEffect)
On `entityName` change:
- Loads entity from `utilities.md.Entities`
- Extracts primary key fields for default `orderBy`
- Auto-detects fields if not provided (first 15 non-system fields)
- Stores in `entityInfo` state

## Field Auto-Detection
If `fields` prop omitted:
- Gets entity from metadata
- Filters out `__mj*` system fields
- Excludes ID, nested objects
- Takes first 15 fields
- Uses DisplayName for column headers

## Primary Key Detection
For OpenEntityRecord integration:
- Checks `entity.PrimaryKeys` array
- Fallback to `entity.FirstPrimaryKey`
- Fallback to 'ID'
- Passed to DataGrid as `entityPrimaryKeys` prop

## DataGrid Integration
EntityDataGrid passes to DataGrid:
- **data**: Current page records (managed)
- **entityName**: Pass through
- **entityPrimaryKeys**: Auto-detected
- **columns**: Maps `fields` prop (auto-detected if omitted)
- **sorting={false}**: Component manages sort logic
- **paging={false}**: Component manages pagination
- **filtering={enableFiltering}**: Pass through
- **All other props**: selection, autoFitColumns, onRowClick, events

## Pagination Calculation
- **totalPages**: `totalRecords && pageSize ? Math.ceil(totalRecords / pageSize) : null`
- **hasPrevious**: `currentPage > 1`
- **hasNext**:
  - Full mode: checks `allDataCache.length`
  - Partial mode: checks `currentPage < totalPages`
- **startRecord**, **endRecord**: For display

## Render Output

### Error State
Red error panel with:
- Error message
- Retry button (clears error, increments `refreshTrigger`)

### Loading State
Full-page spinner when `loading && data===null`

### Success State
1. **Warning banner** (if partial mode):
   - Light yellow background
   - Text: "Showing first X of Y records..."
   - Suggestion to refine extraFilter

2. **Cache mode indicator** (badge):
   - Full mode: "All X records loaded" (green)
   - Partial mode: "Showing X of Y" (orange)

3. **DataGrid component**:
   - All DataGrid features available
   - Receives current page data

4. **Custom pagination controls** (below grid):
   - Page buttons
   - Page size selector
   - "X-Y of Z" display

5. **Refresh button**:
   - Icon button (top-right)
   - Increments `refreshTrigger`

6. **Loading overlay** (partial mode page fetch):
   - Subtle spinner overlay
   - Doesn't block UI

## Event Firing
Bubbles up DataGrid events:
- `onPageChanged`: After page change completes
- `onSortChanged`: After sort completes
- `onFilterChanged`: After filter applied
- `onRowClick`, `onSelectionChanged`: Pass through

Additional events:
- `onDataLoaded`: After successful RunView (includes rowCount, cacheMode)
- `onLoadError`: On RunView errors
- `onCacheModeChanged`: When switching full↔partial (optional)

## Performance Optimizations
- useMemo for tableColumns, paginationInfo, autoDetectedFields
- useCallback for handlers (prevents re-renders)
- Debounce text filter (300ms)
- AbortController to cancel in-flight requests
- LRU cache eviction (keep last 10 pages)
- Smart cache mode selection (full vs partial)
