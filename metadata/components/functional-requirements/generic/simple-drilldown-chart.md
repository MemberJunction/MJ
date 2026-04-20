## Purpose
**FIXED two-level pattern ONLY**: Chart → Table. Built-in drill-down from chart segment to filtered data grid. Composes SimpleChart + DataGrid + optional SingleRecordView with automatic state management.

## Architectural Limitation
**HARDCODED vertical structure**: This component implements exactly ONE pattern - click chart, see table below. It **CANNOT** support:
- Chart-to-chart transitions
- Three or more drill levels (chart → chart → table)
- Dynamic level insertion
- Custom hierarchy depths
- Multiple chart children
- Progressive multi-dimensional drill-downs

For complex drill patterns, use multiple SimpleChart instances with custom state management.

## Data Requirements
- **Input**: Array of objects (detail-level entity records)
- **Aggregation**: SimpleChart performs client-side grouping
- **Optional**: `entityName` for metadata formatting and record opening

## Two Layout Modes

### Mode 1: Two-Column (Default)
**`showSingleRecordView={false}`**

Vertical stack:
1. **Chart** (top, full width)
2. **Info Bar** (middle, when segment selected)
   - Segment label
   - Aggregated value (formatted with commas)
   - Record count
   - Percentage of total
   - Clear selection button
3. **DataGrid** (bottom, full width)
   - Filtered records from clicked segment
   - Sortable, filterable, pageable
   - **Row click behavior**:
     - If `entityName` + `entityPrimaryKeys` provided → Opens record via callbacks.OpenEntityRecord
     - Else → Read-only grid

### Mode 2: Three-Column (Entity Mode)
**`showSingleRecordView={true}` + `entityName` required**

Layout:
1. **Chart** (top, full width)
2. **Info Bar** (middle, when segment selected)
3. **Side-by-side below**:
   - **DataGrid** (left, 60% width) - List of records
   - **SingleRecordView** (right, 40% width) - Selected record details

**Row click behavior in this mode**:
- Clicking grid row populates SingleRecordView panel (does NOT open record form)
- To open full record form, use OpenRecordButton in SingleRecordView (set `allowOpenRecord={true}`)

## Required Props

### Minimal Configuration
```javascript
<SimpleDrilldownChart
  data={salesData}
  groupBy="ProductCategory"
/>
```
- Uses count aggregation by default
- Auto-detects chart type
- Auto-detects grid columns

### With Entity Features
```javascript
<SimpleDrilldownChart
  data={invoices}
  entityName="Invoices"
  entityPrimaryKeys={['ID']}
  groupBy="Status"
  valueField="Amount"
  aggregateMethod="sum"
/>
```
- Metadata-driven formatting
- Row click opens record form
- Optional SingleRecordView integration

## Chart Configuration
All SimpleChart props pass through:
- **chartType**: bar | line | pie | doughnut | area | scatter (auto-detected if omitted)
- **groupBy**: Field to group by (required)
- **valueField**: Field to aggregate (required for sum/average/min/max)
- **aggregateMethod**: count | sum | average | min | max
- **sortBy**: 'value' | 'label' | undefined (preserves order)
- **sortOrder**: 'asc' | 'desc'
- **limit**: Top-N limiting
- **colors**: Custom color palette
- **legend**, **showDataLabels**, **enableExport**: All SimpleChart features

## Grid Configuration

### Column Selection
`gridFields={['InvoiceNumber', 'CustomerName', 'Amount', 'DueDate']}`:
- Explicit column list
- Controls column order

**Auto-detection** (if omitted):
- Discovers from first record in segment
- Filters out `__mj` system fields, `ID`, nested objects
- Limits to first 10 fields
- Uses metadata DisplayName for headers

### Grid Features
All DataGrid features available:
- Sorting (column headers)
- Text filtering (search box)
- Pagination (configurable page size)
- Row selection (if needed for batch operations)
- Custom column rendering

`drilldownHeight` prop: Sets grid container height (default 300px)

## Entity Integration

### Metadata Formatting
When `entityName` provided:
- Dates formatted with locale (Jan 15, 2024)
- Currency fields show $USD
- Boolean fields show Yes/No
- Value lists show colored tags
- Number fields right-aligned

### Record Opening
**Two-column mode** (`showSingleRecordView={false}`):
- Requires both `entityName` AND `entityPrimaryKeys` props
- Example: `entityPrimaryKeys={['ID']}` for single key
- Example: `entityPrimaryKeys={['OrderID', 'LineNumber']}` for composite key
- Row click calls `callbacks.OpenEntityRecord(entityName, keyValues)`
- Opens full record form in MemberJunction

**Three-column mode** (`showSingleRecordView={true}`):
- Requires `entityName` only
- Row click populates SingleRecordView panel (right side)
- Does NOT open full record form on row click
- Use `allowOpenRecord={true}` on SingleRecordView for Open Record button

## Visual States

### Initial State
- Chart only (full width)
- No info bar
- No grid
- Blue border: none

### Segment Selected State
- Chart has **blue 2px border** (highlight)
- Info bar slides down (light blue background #f0f5ff, 4px left border #1890ff)
- Grid slides in below with filtered records
- Smooth CSS animations (slideDown, slideIn)

### Clear Selection
- "Clear Selection" button in info bar
- Resets to initial state
- Hides grid with smooth animation

## State Management
Component manages three state variables:
1. **selectedSegment**: `{label, value, records: Array, percentage}`
2. **showGrid**: Boolean to control grid visibility
3. **selectedRecord**: For SingleRecordView (three-column mode only)

State flow:
```
Initial → Click chart segment → Set selectedSegment + showGrid=true
       → Grid renders with segment.records
       → (Optional) Click grid row → Set selectedRecord → SingleRecordView updates
       → Click "Clear Selection" → Reset all state
```

## Events

1. **segmentSelected**: `({segment}) => void`
   - Fired when chart segment clicked
   - Includes full segment data with records array

2. **selectionCleared**: `() => void`
   - Fired when clear button clicked

3. **rowSelected**: `({record, segment}) => void`
   - Fired when grid row clicked (three-column mode)

4. **dataPointClick**: Bubbles from SimpleChart
5. **All DataGrid events**: rowClick, pageChanged, sortChanged, etc.

## Component Composition
Requires from components registry:
- **SimpleChart**: For chart rendering (required)
- **DataGrid**: For table display (required)
- **SingleRecordView**: For detail panel (optional, three-column mode only)

Shows error if DataGrid not found.

## Styling

### Info Bar
- Light blue background: #f0f5ff
- Blue left border: 4px #1890ff
- Padding: 12px 16px
- Flex layout: label/value on left, button on right

### Chart Border
- Normal: No border
- Selected: 2px solid #1890ff (blue highlight)

### Grid Container
- Border: 1px solid #d9d9d9
- Height: `drilldownHeight` prop (default 300px)
- Overflow: auto (scrollable)

### Animations
- `@keyframes slideDown`: 0.3s ease-out
- `@keyframes slideIn`: 0.3s ease-out
- Smooth transitions on expand/collapse

## When NOT to Use
❌ Multi-level drill-downs (3+ levels)
❌ Chart-to-chart navigation
❌ Progressive hierarchies (e.g., "by Industry → by Region → by Product")
❌ Custom visualization at drill levels
❌ Dynamic drill-down structures
❌ Any pattern beyond fixed chart→table

**For these scenarios**: Build custom component with multiple SimpleChart instances and custom state management.

## Use Cases
✅ Revenue by Product Category → see line items
✅ Order Count by Status → see actual orders
✅ Average Deal Size by Region → see individual deals
✅ Top 10 Customers by Spend → see customer invoices
✅ Bug Count by Severity → see bug details in grid
