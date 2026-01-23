## Purpose
Multi-format export component supporting CSV, Excel (XLSX), and PDF exports with both UI and headless (programmatic) modes.

## Operating Modes

### UI Mode (`mode='ui'`, default)
- Dropdown button with format selection
- User-facing export interface
- Configurable button style: button, icon, dropdown (default), menu
- Position options: top, bottom, inline, floating
- Optional preview before export
- Optional column selection UI

### Headless Mode (`mode='headless'`)
- No UI rendered
- Programmatic export via ref-based API
- For background jobs, scheduled exports, automation
- Example: `exportPanelRef.current.exportToCSV()`

## Data Input Methods

### Tabular Data (Array + Columns)
- `data` prop: Array of objects
- `columns` prop: Column definitions `[{key: 'field', label: 'Display Name', width: 100}]`
- Use for: Data grids, report tables, entity records

### HTML Element Capture (PDF only)
- `getHtmlElement()` function: Returns DOM element to capture
- Uses html2canvas to convert element to image
- Use for: Charts, dashboards, complex visualizations
- Multi-page support for tall elements

## Export Formats

### CSV Export
- Proper escaping of quotes, commas, newlines
- Configurable date/number formatting
- Optional headers (includeHeaders prop)
- Chunked processing for large datasets (prevents browser freezing)
- UTF-8 BOM for Excel compatibility
- Downloads as `.csv` file

### Excel (XLSX) Export
- Uses SheetJS (XLSX) library 0.18.5
- Features:
  - Auto-width columns (autoWidth option)
  - Filter dropdowns (includeFilters option)
  - Custom sheet name (sheetName option, default 'Data')
  - Number/date formatting
  - Style support (bold headers, borders)
- Single worksheet (use XLSX library directly for multi-sheet)
- Downloads as `.xlsx` file

### PDF Export
- Uses jsPDF 2.5.1 + html2canvas 1.4.1
- Two sub-modes:
  1. **Data table**: Renders tabular data as formatted table
  2. **HTML capture**: Captures HTML element as image

**PDF Options**:
- Orientation: `'portrait'` (default) | `'landscape'`
- Page size: `'a4'` (default) | `'letter'`
- Margins: `{top: 40, bottom: 40, left: 40, right: 40}` (in points)
- Title: Custom PDF title (rendered at top)
- `includeDataTable`: Boolean - include data table below captured HTML
- `multiPage`: Boolean - split tall content across multiple pages
- `includeAIInsights`: Boolean - include AI insights section

**AI Insights in PDF**:
- `aiInsightsText` prop: Raw markdown text
- Renders markdown as formatted text (not as rendered HTML)
- Preserves: headings, lists, bold/italic, code blocks
- Better than element capture (smaller file size, selectable text)

## Features

### Column Selection
- `allowColumnSelection={true}` (default)
- User can check/uncheck columns before export
- Applies to CSV and Excel exports
- PDF captures full element (no column selection)

### Preview
- `showPreview={true}` enables preview modal
- Shows first 50 rows before exporting
- User can confirm or cancel
- Useful for large exports

### Progress Indication
- Progress bar for large dataset exports (>1000 rows)
- Shows percentage complete
- Chunked processing prevents UI freeze
- Fires `onExportStart` and `onExportComplete` events

### Formatting Options
- **Date format**: Configurable via `dateFormat` prop (default 'YYYY-MM-DD')
- **Number format**: `{decimals: 2, thousandsSeparator: ',', decimalSeparator: '.'}`
- Applied consistently across all formats

### Custom Styling
- `customStyles` prop: CSS overrides for UI elements
- `buttonText`: Custom button label (default "Export")
- `icon`: Font Awesome icon class (default "fa-download")

## Events

1. **onExportStart**: `(format: string) => void`
   - Fired when export begins
   - Use for: Show loading indicator, track analytics

2. **onExportComplete**: `({format: string, filename: string}) => void`
   - Fired on successful export
   - Use for: Success message, download tracking

3. **onExportError**: `({error: Error, format: string}) => void`
   - Fired if export fails
   - Use for: Error handling, user notification

## File Naming
- `filename` prop: Base name without extension (default 'export')
- Component adds format extension automatically
- Example: `filename='sales-report-2024'` → `sales-report-2024.csv`

## Error Handling
- Column validation: Warns if columns not found in data
- Empty data: Shows "No data to export" message
- Library loading: Graceful fallback if XLSX/jsPDF not available
- Large file warning: Alerts if export exceeds recommended size

## Performance Considerations
- Chunked processing for CSV (1000 rows at a time)
- HTML capture optimization (scale factor, quality settings)
- Memory management for large PDFs (multi-page splitting)
- Progress updates via requestAnimationFrame

## Dependencies
- **xlsx** (0.18.5): Excel/CSV generation
- **jspdf** (2.5.1): PDF creation
- **html2canvas** (1.4.1): HTML to image conversion
- **dayjs** (1.11.10): Date formatting
