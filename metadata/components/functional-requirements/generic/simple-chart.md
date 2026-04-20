## Purpose
Standalone single-series chart component with **NO built-in drill-down**. Renders bar/line/pie/doughnut/area/scatter charts using Chart.js 4.4.1. Emits onClick events but doesn't handle navigation - parent component must wire up drill-down logic.

## Data Requirements
- **Input**: Array of objects (detail-level records)
- **Aggregation**: Component performs client-side aggregation (groups by field, applies count/sum/average/min/max)
- **Optional**: `entityName` for metadata-driven field type detection

## Chart Types & Auto-Selection

### Supported Types
- **bar** (default): Vertical bars, each bar gets different color in single-series
- **column**: Alias for bar
- **line**: Connected line chart, single color
- **pie** (preferred over doughnut): Circular chart, each slice gets different color
- **doughnut** (donut): Ring chart with center hole, each slice gets different color
- **area**: Line chart with filled area below
- **scatter**: Points without connecting lines

### Auto-Type Selection Logic
If `chartType` prop omitted, component intelligently selects type:

1. **Date field detected** → line chart
   - Checks entity metadata (Type = 'datetime' or 'date')
   - OR value is Date instance
   - OR string parseable as date
   
2. **≤ 5 categories** after aggregation → pie chart
   - Preferred over doughnut for clarity
   - Better for small datasets

3. **Else** → bar chart (default)
   - Best for general comparison

## Data Aggregation

### Configuration
- **groupBy** (required): Field name to group records by
- **valueField** (optional): Field to aggregate (required for sum/average/min/max)
- **aggregateMethod**: count | sum | average | min | max (default: count)

### Methods

1. **count** (default): Counts records per group
   - No valueField needed
   - Example: "Count of orders by status"

2. **sum**: Sums valueField for each group
   - Example: "Total revenue by product category"

3. **average**: Averages valueField for each group
   - Example: "Average deal size by region"

4. **min**: Minimum valueField value per group
   - Example: "Lowest price by supplier"

5. **max**: Maximum valueField value per group
   - Example: "Highest score by student"

### Date Field Handling
When groupBy field is date/datetime:
- Groups by ISO date string (YYYY-MM-DD) for consistent grouping
- Formats labels as locale-specific dates (e.g., "Jan 15, 2024")
- Preserves chronological order

## Sorting & Limiting

### Sorting
**Default behavior** (sortBy=undefined):
- **Preserves input data order**
- Ideal for time-series (pre-sort by date in query)
- Ideal when query already returns desired order

**Explicit sorting**:
- `sortBy='value'`: Sorts by aggregated values (for rankings like "top products")
- `sortBy='label'`: Sorts alphabetically by category labels
- `sortOrder='asc' | 'desc'`: Controls direction

### Top-N Limiting
`limit={10}`: Shows only top N categories after sorting
- Common pattern: `sortBy='value' sortOrder='desc' limit={10}` for "Top 10"

## Value Formatting

### Automatic Detection
- **Dates**: toLocaleDateString (month short, day, year) → "Jan 15, 2024"
- **Currency**: Intl.NumberFormat USD style → "$1,234.56"
  - Detected when: valueField is 'money' type OR field name includes "amount"/"price"/"cost"
- **Numbers**: Intl.NumberFormat with commas → "1,234"
- **Null**: "N/A"

## Color System

### Single-Series Bar Charts
- **Each bar gets different color** for visual distinction
- Uses color palette from `colors` prop or default palette
- Example: Category A (blue), Category B (green), Category C (orange)

### Pie/Doughnut Charts
- Each slice gets different color from palette
- Consistent color assignment per data point

### Line/Area Charts
- Single color (first from palette)
- Optional fill for area charts

### Custom Colors
`colors={['#FF6384', '#36A2EB', '#FFCE56']}`:
- Array of hex colors
- Applied in order to data points

## Click Interaction

### Element Highlighting
- Clicked element highlighted with **3x thicker border**
- Border persists until another element clicked
- Visual feedback confirms selection

### No Re-animation on Click
- Chart animates once on initial render (750ms)
- Subsequent clicks update **without animation** (instant)
- Prevents jarring re-animation effect

### onClick Event
`onDataPointClick` fires with rich context:
```javascript
{
  chartType: 'bar',
  series: 'Revenue', // valueField or 'Count'
  label: 'Electronics', // Category name
  value: 1234.56, // Aggregated value
  records: [...], // Array of ALL records in this segment
  percentage: 23.5 // Percentage of total
}
```

**Parent must handle**: SimpleChart only emits event, doesn't navigate
- Show DataGrid with filtered records
- Navigate to detail page
- Render child SimpleChart with filtered data
- Open modal/sidebar
- Apply filters to other components

## Features

### Legend
- **position**: 'auto' (default), 'top', 'bottom', 'left', 'right'
- **fontSize**: Configurable legend text size
- **show**: true/false to toggle visibility

### Data Labels
`showDataLabels={true}`:
- Shows values directly on chart elements
- Positioned automatically by Chart.js
- Format uses same value formatting logic

### Export
`enableExport={true}`:
- Shows "⬇ Export" button overlay (top-right)
- Downloads chart as PNG image
- Uses canvas.toDataURL('image/png')
- Filename: auto-generated or custom

### Loading State
Shows spinner while processing data.

### Empty State
Gray background with "No data available" when no records.

### Error Handling
- Validates groupBy field exists in data
- Shows red error panel with available fields if validation fails
- Gracefully handles missing Chart.js library

## Visual Configuration

### Chart Height
`height` prop: Sets canvas height (default 400px)

### Responsive
- Chart resizes with container width
- maintainAspectRatio: false (fills container)

### Hover Effects
- Cursor changes to pointer over data points
- Tooltip shows on hover (label + formatted value)
- Hover mode: 'nearest' for precise targeting

## Metadata Integration
When `entityName` provided:
- Loads entity from `utilities.md.Entities`
- Uses field Type for auto-type detection
- Uses field Type for value formatting
- Enables smart currency/date/number formatting

## Events

1. **onDataPointClick**: Fired on chart element click
   - Includes full segment data with records array
   
2. **onChartRendered**: Fired after successful render
   - Includes `{chartType, dataPointCount, aggregateMethod, totalValue}`
   
3. **onError**: Fired if chart rendering fails

## Use Cases
- Dashboard widgets (view-only charts)
- Building blocks for custom multi-level drill-downs
- Charts requiring custom onClick handling
- Reusable chart component in larger compositions
- Export-only charts (generate reports)
