## Structure
```
<div data-export-id={exportID} style={{ position: 'relative', ...style }}>
  {children}
  <ExportMenu />   // absolutely positioned top-right, z-index above the child
</div>
```
- The div is the only element added to the layout. A flex or grid item that is wrapped keeps its layout by moving its layout styles to `style`.
- The menu is an antd `Dropdown` (renders in a portal, so a parent with `overflow: hidden` does not clip it). The trigger is a plain `<button>` so it works without antd styles loaded.
- Nothing in the child is cloned or given extra props; the wrapper finds chart instances by searching its own subtree.

## Data flow
1. On a menu click, resolve rows: `await getRows()` when given, else `rows`, else `[]`. `getRows` may return `{ rows, note }` instead of an array; the note is written as the file's last row (CSV and Excel). The host registration's `GetRows` returns the rows only.
2. Resolve columns: `columns`, else the keys of the first row as `string` columns (logs a `console.warn` with the `exportID`).
3. Normalize each cell by column type (shared by CSV and Excel):
   - `number` / `currency` / `percent`: `Number(value)` when finite, else empty.
   - `date`: `Date` or parseable ISO string → `Date`; anything else is written as text.
   - `boolean`: `true`/`false`.
   - `string`: `String(value)`; `null`/`undefined` → empty.
4. Write the file and download it through a temporary object URL and anchor, revoked right after.

The download goes through one internal `deliverFile(blob, fileName, utilities)` function. When the host provides `utilities.export.DownloadFile(blob, fileName)` (MJ host releases after this component; the name is provisional until MJ defines the service), it is used instead of the browser download.

## Writers
- **CSV**: hand-written (no library). BOM `﻿`, fields quoted when they contain `"`, `,`, CR or LF, quotes doubled, formula-prefix guard on text cells.
- **Excel**: the sheet is built cell by cell with typed cells (`t: 'n' | 'b' | 's'` and `z` number formats), `!cols` widths and an `!autofilter` on the header row, then `XLSX.write(..., { type: 'array', bookType: 'xlsx' })`. Dates are written as Excel serial numbers computed from their calendar parts, so no time zone shifts them; a bare `YYYY-MM-DD` string stays on its day.

## PNG
In order:
1. `getImage()` when given.
2. A Chart.js chart in the subtree: `Chart.getChart(canvas)`. Temporarily set `devicePixelRatio: 3`, `animation: false`, resize, `toBase64Image('image/png')`, then restore options and resize.
3. An ApexCharts chart in the subtree (`.apexcharts-canvas`): find the instance through `ApexCharts.getChartByID` on the element's id, then `dataURI({ scale: 3 })`.
4. Fallback: `html2canvas(wrapperDiv, { scale: 2, backgroundColor: <background>, ignoreElements: the export button })`.

The image from steps 1–3 is drawn onto a canvas filled with `<background>`: the nearest opaque `background-color` from the wrapper up (translucent ones blended over it, white when there is none), resolved through a 1×1 canvas so any CSS colour syntax works. A dark theme's light chart text would vanish on white. An opaque image is unchanged.

## Runtime registration
When the host provides `utilities.export.RegisterElement` (MJ host releases after this component; provisional name), register on mount and call the returned function on unmount:
`{ ExportID, GetLabel, GetKind, GetRows, GetColumns, GetImage, Element }`, with stable callbacks that read the latest props through a ref (not data snapshots). Feature-detected; an absent service is not an error.

The export button sits in a `data-export-control="true"` container, which the PNG capture ignores and a host print mode can hide.

## Error handling
Every export path is wrapped in try/catch: the error is logged with the `exportID` and format, and the menu shows "Export failed". No error reaches the host component or its error boundary.

## Libraries
- `antd` 5.12.0: menu.
- `xlsx` 0.18.5: Excel writer.
- `html2canvas` 1.4.1: PNG fallback.
