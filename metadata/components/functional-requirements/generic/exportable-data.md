## Purpose
Give every table and chart in an interactive component the same export affordance, the same formats and the same file quality, whatever code the LLM wrote around it.

## Affordance
- One icon button in the element's top-right corner, over the element (no layout change to the child).
- Subtle at rest, stronger on hover and keyboard focus, always visible on touch devices.
- Opens a menu: **CSV**, **Excel**, and **PNG** (charts only), in that order.
- Keyboard accessible: the button is focusable, Enter/Space opens the menu, arrow keys move, Escape closes. The button's accessible name is "Export <label>".
- While a file is being prepared (async `getRows`, image capture) the menu item shows a spinner; a failure shows a short message and logs the error. It never throws into the host component.

## Data
- Exports `rows` (or the result of `getRows()`) with `columns`, in column order. `getRows` may return `{ rows, note }`; the note becomes the file's last row, for a caller whose rows are partial.
- A table exports every row that passes the user's filters, in the current sort, across all pages.
- A chart exports what it draws, in wide rows.
- Empty rows: the menu still opens; CSV and Excel produce a header-only file.

## Formats
| Format | Behaviour |
|---|---|
| CSV | UTF-8 with BOM, RFC 4180 quoting, CRLF line endings, header row of column labels. Dates as ISO `YYYY-MM-DD` (or ISO date-time when the value has a time). Cells starting with `=`, `+`, `-` or `@` are prefixed with `'` so spreadsheets do not run them as formulas. |
| Excel | One `.xlsx` sheet named after the label (31-character limit). Typed cells: number, currency (`$#,##0.00`), percent (`0.0%`), date (`yyyy-mm-dd`, or with time), boolean. A filter on the header row and column widths fitted to content. (The community build of SheetJS writes no cell styles, so the header is not bold or frozen.) |
| PNG | Charts only. Native export when the chart library offers one (Chart.js at 3× pixel ratio; ApexCharts at scale 3), otherwise an html2canvas capture of the wrapper's subtree at 2×. Drawn on the background the element is shown on, so a dark theme's labels stay readable. |

- Filename: `<label>_<YYYY-MM-DD>.<ext>`, with characters outside letters, digits, space, `-` and `_` replaced by `_`.
- Excel's row limit (1,048,576) is enforced: larger exports are cut off, with a note row at the end.

## Integration
- Registry components (`DataGrid`, `EntityDataGrid`, `SimpleChart`) render it internally; generated code never wraps them.
- When the host provides the export runtime context (MJ host releases after this component), the element registers with it so the host can list and drive element exports and the root PDF. Without that context it works on its own.

## Out of scope
- Save as List (later, depends on MJ List write paths).
- Raw underlying records behind a summarized chart.
- Whole-component PDF (host-owned).
