## Architecture
React functional component wrapping Ant Design Table 5.12.0 with MemberJunction metadata enhancements. **Note**: This describes internal implementation details. The public API uses `{field, header, render}`, not Ant Design's `{dataIndex, title, key}`.

## State Management (React Hooks)
- **filterText** (string): Raw search input
- **debouncedFilter** (string): Processed search term after 300ms delay
- **selectedRowKeys** (array): Row selection state
- **currentPage** (number): Pagination state
- **sortConfig** (object): Sort state `{column, direction}`
- **entityInfo** (object): Entity metadata from `utilities.md.Entities`
- **expandedCells** (object): Tracks expanded long-text cells `{recordKey_fieldName: boolean}`

## Initialization

### Library Unwrapping
Uses `unwrapLibraryComponents(antd, 'Table', 'Input', 'Space', 'Typography', 'Tag', 'Tooltip')` to handle various Ant Design package formats (ESM/CJS/UMD).

### Metadata Loading (useEffect)
If `entityName` provided:
- Loads entity from `utilities.md.Entities`
- Stores field metadata (Type, Length, DisplayName, ValueListType, EntityFieldValues)
- Else sets `entityInfo = null`, uses basic type detection

## Column Processing Pipeline (useMemo)

### 1. Normalization
Accepts `columns` as:
- **String array**: `['Name', 'Price']` → Normalizes to ColumnDef format
- **ColumnDef objects**: `{field, header, render, width, sortable}`
- **Auto-detection**: If omitted, discovers from `Object.keys(data[0])`, excludes 'key' field

Handles invalid configs with console warnings.

### 2. Column Building
Converts ColumnDef format (`{field, header}`) to Ant Design Table format internally:
- **Alignment**: Based on SQL type (int/decimal/float/money/bit → right, others → left)
- **Width calculation** (when `autoFitColumns=false`):
  - GUIDs: 280px
  - Long text (text type OR varchar(max) with length=-1 OR varchar >200): 400px
  - Variable char: Scales by length (≤50→100-200px, ≤100→250px, ≤200→300px, else→350px)
  - Dates: 160px
  - Bit: 80px
  - Int: 100px
  - Decimal/numeric: 120px
  - Money: 130px
- **Override**: `colDef.width` if provided
- **Sorter**: Creates function if `sortable` (string localeCompare, number subtraction, null handling)
- **Render**: Priority: (1) Custom `colDef.render`, (2) Metadata-driven default

### 3. Field Rendering Logic
For each cell:
1. **Custom render**: If provided, call with `(value, record, fieldInfo)`
2. **Null handling**: Return '-'
3. **Cell key**: Create unique key `${record.key/ID/id}_${fieldName}` for expansion tracking
4. **Type-based formatting**:
   - **date/time**: formatDate with locale (hour/minute)
   - **bit**: Yes/No text
   - **Value lists**: Tag component with `getValueColor(value, entityInfo)`
   - **money**: Intl.NumberFormat USD currency
   - **decimal/float**: toLocaleString with 2 decimals
   - **int**: toLocaleString with commas
5. **Long text handling** (if field is long text type AND length > `longTextThreshold`):
   - **truncate**: substring + '...'
   - **expand**: Toggle on click, shows 'show more/less' links, tracks state in `expandedCells`
   - **tooltip**: Ant Tooltip wrapper
   - **wrap**: whiteSpace:normal, wordBreak:break-word
   - **none**: default
6. **Filter highlighting**: If `debouncedFilter` exists, wrap matches in `Typography.Text mark`

## Value List Coloring System

### statusColorMap
50+ predefined colors for common statuses:
- active → #389e0d (green)
- pending → #d48806 (orange)
- failed → #a8071a (red)
- processing → #096dd9 (blue)
- etc.

### fallbackColors
Array of 50 distinct colors (purple, magenta, teal, indigo, vermillion, brown, etc.)

### getValueColor Function
1. Build `colorAssignments` Map
2. Iterate `possibleValues` from entity metadata
3. Assign `statusColorMap` color if exists, else next `fallbackColor`
4. Ensures consistent colors per value across dataset
5. Unknown values: Check `statusColorMap` first, then hash-based fallback index

## Header Styling
- `headerStyle` ({ background, color, borderColor }, all optional) colors the header row through each column's antd `onHeaderCell`; `borderColor` draws a 2px bottom border
- Memoized into `headerCellStyle` from its three fields, so a new object with the same values does not rebuild the columns
- Unset, or with no fields set, the header keeps the antd theme the host derives from the viewer's theme
- Callers pass their table-header brand tokens here: `headerStyle={{ background: brand.tableHeaderBackground, color: brand.tableHeaderText, borderColor: brand.tableHeaderBorder }}`

## Filter Debouncing (useEffect)
- `setTimeout` with `filterDebounceTime` (300ms default)
- Updates `debouncedFilter` after delay
- Cleanup clears timer on unmount or input change

## Filtered Data (useMemo)
If `filtering=false` or `!debouncedFilter`:
- Return original `data`

Else:
- Determine `searchFields` (`filterFields` prop or all display fields)
- Filter rows where any searchField value includes searchTerm (case-insensitive)
- Handle null/undefined gracefully

## Filter Change Effect (useEffect)
Fires `onFilterChanged` event with `{filterValue: debouncedFilter, matchingData: filteredData}`

## Row Selection Config
If `selectionMode !== 'none'`:
- Creates `rowSelection` object with:
  - type: 'radio' or 'checkbox'
  - selectedRowKeys state
  - onChange handler (updates state, fires `onSelectionChanged`)
- For 'row' mode: Adds `onSelect` handler

## Pagination Config
If `paging=true`:
- Creates pagination object:
  - current: `currentPage`
  - pageSize: From prop
  - total: `filteredData.length`
  - showSizeChanger: false
  - showTotal: Formatter function
  - onChange: Updates `currentPage`, fires `onPageChanged` with 0-based page number and visible rows slice

## Sort Handling
`handleTableChange` extracts sorter from Ant Table onChange:
- Always updates `sortConfig` state (the export reads it, so it is tracked even without `onSortChanged`)
- Fires `onSortChanged` with `{sortState: {column: sorter.field, direction: sorter.order === 'ascend' ? 'asc' : 'desc'}}`

## Row Click Handling
`handleRowClick` with priority logic:
1. If `onRowClick` provided: Call with record and return early (custom handler overrides)
2. Else if `entityName` AND `entityPrimaryKeys` AND `callbacks.OpenEntityRecord` exist:
   - Maps `entityPrimaryKeys` to key-value pairs `[{FieldName, Value}]`
   - Extracts values from record
   - Checks all key values exist (!=null)
   - If yes: Calls `callbacks.OpenEntityRecord(entityName, keyValues)`
   - Else: Logs warning
3. Wrapped in try/catch with error logging

## Data with Keys (useMemo)
Maps `filteredData` to add unique `key` prop:
- Uses existing key/ID/id or falls back to index
- Required for Ant Design Table row selection

## CSS Style Injection
Disables all Ant Design animations to prevent render loop detection:
```css
.data-grid-component * {
  animation: none !important;
  transition: none !important;
  animation-duration: 0s !important;
  transition-duration: 0s !important;
}
```

## Render Output
Wrapper div with `.data-grid-component` class:

1. **Search UI** (if `filtering=true`):
   - Ant Input.Search with value/onChange/allowClear/onClear
   - Placeholder shows filterFields or 'all fields'
   - Full width style
   - Text showing "Found N matching records" if `debouncedFilter` exists

2. **Ant Table**:
   - columns: `tableColumns`
   - dataSource: `dataWithKeys`
   - rowSelection: If enabled
   - pagination: If enabled
   - onChange: `handleTableChange` for sort
   - scroll: `{x: 'max-content'}` only if `autoFitColumns=false`
   - loading: true only when `data===null`
   - locale: emptyText uses `entityName` if provided
   - size: 'middle'
   - onRow: Returns object with onClick handler and cursor style

## Built-in Export
Dependency: registry component `ExportableData` (`Generic/UI/Export`), read from `components`. When `exportable === false`, or the host did not provide `ExportableData`, the grid renders exactly as before with no wrapper.

Helpers declared at the top of the component body (plain functions, no hooks; MJ components must be a single top-level function):
- `activeTableSort(tableColumns, sortConfig)`: the sort the table shows. If any column has a controlled `sortOrder` (antd's rule), the one set to ascend/descend; otherwise the column whose `key` matches `sortConfig.columnKey` (or `field`) with `sortConfig.order`.
- `sortRowsLikeTable(rows, sort)`: copies `rows` and sorts them with that column's own `sorter` function, negating the result for `descend` exactly as antd does. Array sort is stable, so ties keep the `data` order like the table.
- `buildExportColumns(tableColumns, entityInfo, data)`: `{field: dataIndex, label: title, type}` per displayed column; type from `exportTypeFromFieldType(fieldInfo.Type)` (value-list fields are text) or `sniffExportType` over the first 200 rows.
- `gridExportID(label)`: kebab-case of the label plus `-grid`, else `data-grid`.

Render: the existing `.data-grid-component` div becomes `grid`; the component returns
```jsx
<ExportableData exportID={gridExportID(exportTitle)} label={exportTitle} kind="table"
  getRows={getExportRows} columns={exportColumns}
  placement={filtering ? 'toolbar' : 'overlay'} style={{ width: '100%' }}>{grid}</ExportableData>
```
In auto-fit mode the antd Table sits in a `width: 100%; overflowX: auto; contain: inline-size` div: columns still shrink and wrap, but a table whose unbreakable content (an email, a tag) cannot fit scrolls inside the grid instead of spilling past its parent and widening the page. `contain: inline-size` keeps the table's width out of the parent's minimum size, so a flex item or `fr` grid track holding the grid (a roster beside a side panel) shrinks to fit instead of growing past the page. `minWidth: 240` keeps a squeezed grid usable. Trade-off: a parent that sizes to its content (an absolutely positioned popover, `inline-block`, a table cell, an `auto` grid track) no longer sees the table's width, so the grid there takes the search row's width and scrolls; stretch layouts (cards, flex rows, `fr` tracks, modals, drawers) are unaffected.

`getRows` is a closure over `filteredData`, `tableColumns` and `sortConfig`, so the sort runs only when the user exports. With filtering on, the search row gets `paddingRight: 40` and the 32px toolbar button sits flush with the top and bottom of the search box, 8px to its right. `exportGetRows` (EntityDataGrid) replaces this closure.

## Performance Optimizations
- useMemo for column building, filtered data, data with keys
- useCallback for event handlers (prevents re-renders)
- Debounced filter input (prevents excessive re-renders)
- CSS transitions disabled (prevents render loop)
