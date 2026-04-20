## Architecture
React functional component with dual-mode operation (UI vs headless) supporting CSV, Excel (XLSX), and PDF exports.

## Dependencies & Libraries
- **xlsx** (0.18.5): Excel/CSV generation (global: XLSX)
- **jspdf** (2.5.1): PDF creation (global: jspdf)
- **html2canvas** (1.4.1): HTML element capture (global: html2canvas)
- **dayjs** (1.11.10): Date formatting (global: dayjs)

## State Management (React Hooks)
- **exporting** (boolean): Export operation in progress
- **progress** (number): Export progress percentage (0-100)
- **selectedFormat** (string): Currently selected format ('csv' | 'excel' | 'pdf')
- **selectedColumns** (Array): User-selected columns for export
- **showPreviewModal** (boolean): Preview modal visibility
- **previewData** (Array): Data preview (first 50 rows)
- **error** (string | null): Export error message

## Modes of Operation

### UI Mode (mode='ui', default)
Renders visible interface with button:
- **Button styles**: button, icon, dropdown (default), menu
- **Positions**: top, bottom, inline, floating
- User selects format from dropdown
- Optional preview before export
- Optional column selection UI

### Headless Mode (mode='headless')
No UI rendered, exposes ref-based API:
```javascript
const exportPanelRef = useRef();
// Later:
exportPanelRef.current.exportToCSV();
exportPanelRef.current.exportToExcel();
exportPanelRef.current.exportToPDF();
```

## Export Implementation

### CSV Export
**Process**:
1. **Column validation**: Check columns exist in data, warn if missing
2. **Header row**: Build from column labels
3. **Data rows**: Iterate records, format values
4. **Value formatting**:
   - Dates: dayjs format (configurable via dateFormat prop)
   - Numbers: Apply numberFormat config (decimals, separators)
   - Strings: Escape quotes (replace " with ""), wrap in quotes if contains comma/newline
   - Null/undefined: Empty string
5. **Chunked processing**: For large datasets (>1000 rows), process 1000 rows at a time
   - Uses requestAnimationFrame for progress updates
   - Prevents UI freeze
6. **UTF-8 BOM**: Prepend `\uFEFF` for Excel compatibility
7. **Download**: Create Blob with `type: 'text/csv;charset=utf-8;'`, trigger download

**Performance**:
- Chunk size: 1000 rows
- Progress callback every chunk
- Memory-efficient string concatenation

### Excel Export
**Process**:
1. **Create workbook**: `XLSX.utils.book_new()`
2. **Build worksheet data**:
   - Header row from column labels
   - Data rows with formatted values (dates, numbers, currency)
3. **Apply formatting**:
   - Header row: Bold, background color
   - Column widths: Auto-calculate from content (if autoWidth=true)
   - Number formats: Apply to numeric columns
4. **Add filters** (if includeFilters=true):
   - Uses XLSX autofilter on header row
5. **Create worksheet**: `XLSX.utils.aoa_to_sheet(data)`
6. **Add to workbook**: `XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)`
7. **Generate binary**: `XLSX.write(workbook, {bookType: 'xlsx', type: 'binary'})`
8. **Download**: Convert to Blob, trigger download

**Options**:
- `sheetName`: Worksheet name (default 'Data')
- `includeFilters`: Add filter dropdowns
- `autoWidth`: Auto-size columns

### PDF Export
**Two sub-modes**:

#### 1. Data Table Export
When `data` + `columns` provided (no getHtmlElement):
1. **Create jsPDF instance**: `new jsPDF(orientation, 'pt', pageSize)`
2. **Set margins**: From pdfOptions.margins (default: 40pt all sides)
3. **Add title** (if provided): fontSize 18, bold, centered at top
4. **Build table data**:
   - Header row from column labels
   - Data rows with formatted values
5. **Calculate layout**:
   - Page width = pageSize - leftMargin - rightMargin
   - Column widths: Proportional to content or specified widths
6. **Render table**:
   - Use jsPDF autoTable plugin for advanced table rendering
   - OR manual rendering: Draw borders, cells, text
   - Headers with background color
   - Alternating row colors for readability
7. **Multi-page support** (if includeDataTable + multiPage):
   - Calculate rows per page
   - Add page breaks as needed
   - Repeat headers on each page
8. **Save**: `pdf.save(filename + '.pdf')`

#### 2. HTML Element Capture
When `getHtmlElement()` provided:
1. **Get element**: Call `getHtmlElement()` to get DOM element
2. **Capture with html2canvas**:
   ```javascript
   html2canvas(element, {
     scale: 2, // High quality
     useCORS: true,
     logging: false,
     backgroundColor: '#ffffff'
   })
   ```
3. **Convert to image**: Canvas → base64 PNG data URL
4. **Create jsPDF instance**: Orientation/pageSize from options
5. **Calculate dimensions**:
   - PDF page dimensions in points
   - Image dimensions from canvas
   - Scale factor to fit image on page
6. **Add image to PDF**: `pdf.addImage(imgData, 'PNG', x, y, width, height)`
7. **Multi-page support** (if multiPage=true):
   - Calculate if image exceeds page height
   - Split image into multiple page-height segments
   - Add each segment to separate page
   - Repeat for tall dashboards/charts
8. **Add data table** (if includeDataTable=true):
   - Add new page
   - Render data table as in mode #1
9. **Add AI insights** (if includeAIInsights + aiInsightsText):
   - Add new page
   - Title: "AI Insights"
   - Render markdown as formatted text:
     - Parse headings: Bold, larger font
     - Parse lists: Indent, bullet points
     - Parse bold/italic: Font style changes
     - Parse code blocks: Monospace font, gray background
     - Word-wrap long lines
10. **Save PDF**

**AI Insights Rendering**:
- Parses markdown using simple regex patterns
- No full markdown library (keeps PDF small)
- Handles: `#` headings, `**bold**`, `*italic*`, `` `code` ``, lists, blockquotes
- Preserves line breaks and spacing
- Selectable text in PDF (not rasterized)

## Column Validation (useEffect)
On mount and when data/columns change:
1. Get all available field names from first data record
2. Compare with columns configuration
3. Warn in console if column.key not found in data
4. Filter out invalid columns from selectedColumns

## Progress Tracking
For large exports (>1000 rows):
1. Calculate total chunks: `Math.ceil(rowCount / chunkSize)`
2. Process each chunk with progress update:
   ```javascript
   for (let i = 0; i < totalChunks; i++) {
     processChunk(i);
     setProgress((i + 1) / totalChunks * 100);
     await new Promise(resolve => requestAnimationFrame(resolve));
   }
   ```
3. Fire onExportStart at 0%
4. Fire onExportComplete at 100%
5. Fire onExportError if exception

## Event Flow
1. User clicks format button OR parent calls ref method
2. Fire `onExportStart(format)`
3. Validate data and columns
4. If showPreview=true: Show preview modal, await user confirmation
5. Set exporting=true
6. Execute format-specific export function
7. Handle progress updates
8. On success: Fire `onExportComplete({format, filename})`
9. On error: Fire `onExportError({error, format})`
10. Set exporting=false

## UI Rendering (mode='ui')

### Dropdown Button (buttonStyle='dropdown', default)
- Uses Ant Design Dropdown component
- Menu items for each format in `formats` array
- Icon for each format (csv, excel, pdf)
- Click triggers handleExport(format)

### Button Style (buttonStyle='button')
- Single button per format
- Horizontal button group
- Each button triggers that format directly

### Icon Style (buttonStyle='icon')
- Icon-only buttons (no text)
- Tooltips show format names
- Compact layout

### Positioning
- **top**: marginBottom spacing
- **bottom**: marginTop spacing
- **inline**: Display inline-block
- **floating**: Absolute position (top-right default)

### Custom Styling
`customStyles` prop applies CSS overrides to button container.

## Error Handling
1. **Missing libraries**: Check if XLSX/jsPDF/html2canvas loaded, show error if not
2. **Empty data**: Alert "No data to export"
3. **Invalid columns**: Warn and filter out
4. **File size warnings**: Alert if export exceeds 50MB (approximate)
5. **Browser compatibility**: Check Blob/download support, fallback message
6. **Try/catch**: All export functions wrapped with error boundaries

## Memory Management
- Clear large variables after use (imgData, workbook)
- Revoke object URLs: `URL.revokeObjectURL(url)` after download
- Cancel in-progress exports on unmount (AbortController)

## File Download Mechanism
```javascript
function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

## Ref API Exposure (Headless Mode)
```javascript
useImperativeHandle(ref, () => ({
  exportToCSV: () => handleExport('csv'),
  exportToExcel: () => handleExport('excel'),
  exportToPDF: () => handleExport('pdf')
}), [data, columns, /* other deps */]);
```

## Performance Optimizations
- Chunked processing for large CSVs (prevents UI freeze)
- html2canvas scale factor: 2 (balance quality vs size)
- PDF compression options
- Worker threads for export (future enhancement)
- Memoize column calculations
- Debounce preview data slicing
