## Purpose
Display tabular data with sorting, filtering, paging, and row selection. Data-agnostic component that accepts any array of objects via props (you manage data loading).

## Data Requirements
- **Input**: Array of objects passed via `data` prop
- **Optional**: `entityName` for metadata-driven formatting
- **Optional**: `entityPrimaryKeys` array for built-in record opening on row click

## Column Configuration
**Two modes supported:**

1. **Simple mode** (backward compatible):
   - String array of field names: `['Name', 'SKU', 'Price']`
   - Uses smart defaults from metadata (DisplayName, Type for formatting/alignment)

2. **Advanced mode** (full control):
   - ColumnDef objects: `{field: 'Price', header: 'Unit Price', render: (value, record, fieldInfo) => JSX, width: '120px', sortable: true}`
   - Custom render functions receive value, full record, and field metadata
   - Per-column width and sortable overrides

**Auto-detection**: If `columns` prop omitted, discovers fields from first data record (filters out 'key' field).

## Metadata-Aware Formatting
When `entityName` provided, uses entity metadata for intelligent display:

- **Dates**: Locale format with hour/minute (e.g., "Jan 15, 2024, 3:30 PM")
- **Booleans**: "Yes" / "No" text
- **Value Lists**: Colored Tag components with smart color assignment
  - 50+ predefined status colors (active→green, pending→orange, failed→red, processing→blue)
  - 50 fallback colors for other values
  - Consistent color per value across dataset
- **Money**: Intl.NumberFormat with $USD currency
- **Decimals/Floats**: 2 decimal places with comma thousands separator
- **Integers**: Comma thousands separator
- **Right-alignment**: Numbers, money, bit fields automatically right-aligned

## Long Text Handling
Five modes for fields exceeding `longTextThreshold` (default 200 chars):

1. **truncate**: Substring + '...' with ellipsis
2. **expand** (default): Click to toggle 'show more/less' (tracks expanded state per cell)
3. **tooltip**: Full text on hover with Ant Tooltip
4. **wrap**: Word-break normal, shows all text with wrapping
5. **none**: Default browser behavior

## Features

### Sorting
- Column-level sorting with string/number comparison
- Click header to sort ascending/descending
- Global `sorting` prop enables/disables all columns
- Per-column `sortable` override in ColumnDef
- Fires `sortChanged` event: `{column: string, direction: 'asc' | 'desc'}`

### Filtering
- Global text search across specified fields or all columns
- Debounced input (default 300ms) prevents excessive re-renders
- Highlight matches with yellow background
- Shows "Found N matching records" count
- Configurable `filterFields` array to limit search scope
- Fires `filterChanged` event: `{filterValue: string, matchingData: Array<object>}`

### Pagination
- Configurable page size (default 10, options: 5/10/20/50/100)
- Shows "X-Y of Z" range display
- Optional page size changer dropdown
- Fires `pageChanged` event: `{pageNumber: number (0-based), visibleRows: Array<object>}`

### Row Selection
Four modes via `selectionMode` prop:

1. **none** (default): No selection
2. **checkbox**: Multi-select with checkboxes
3. **radio**: Single-select with radio buttons
4. **row**: Click anywhere on row to toggle selection

Fires `selectionChanged` event with full selected record objects.

### Row Click & Record Opening
**Priority order**:

1. **If `onRowClick` provided**: Fires event with record, overrides default behavior
2. **Else if `entityName` + `entityPrimaryKeys` + `callbacks.OpenEntityRecord` exist**:
   - Extracts primary key values from record using `entityPrimaryKeys` field names
   - Validates all key values exist (not null)
   - Calls `callbacks.OpenEntityRecord(entityName, keyValues)`
   - Use for 1:1 record-to-row scenarios only (not aggregated data)

### Column Widths
**Auto-fit mode** (`autoFitColumns={true}`, default):
- Columns auto-size to fill container width
- No horizontal scrolling

**Fixed mode** (`autoFitColumns={false}`):
- Intelligent width based on SQL type and field length:
  - GUIDs: 280px
  - Long text (varchar(max), nvarchar(max), length=-1, or >200 chars): 400px
  - Variable char fields: Scale by length (50→100-200px, 100→250px, 200→300px)
  - Dates: 160px
  - Bit: 80px
  - Int: 100px
  - Decimal/Numeric: 120px
  - Money: 130px
- Horizontal scrolling enabled
- Per-column `width` override in ColumnDef

## Visual States

### Loading
Shows spinner when `data === null` (use null for initial load, not empty array).

### Empty
Shows "No {entityName || 'records'} found" message for empty datasets.

### No Animations
CSS overrides disable all Ant Design animations to prevent render loop detection issues.

## Events

1. **rowClick**: `(event: {record: object, cancel: boolean}) => void`
   - Fired on row click with cancelable pattern
   - Set `event.cancel = true` to prevent default OpenEntityRecord behavior

2. **selectionChanged**: `({selectedRows: Array<object>}) => void`
   - Fired when row selection changes

3. **pageChanged**: `({pageNumber: number, visibleRows: Array<object>}) => void`
   - Fired on page change with 0-based page number

4. **sortChanged**: `({sortState: {column: string, direction: 'asc' | 'desc'}}) => void`
   - Fired when column sort changes

5. **filterChanged**: `({filterValue: string, matchingData: Array<object>}) => void`
   - Fired when filter text changes with all matching records
