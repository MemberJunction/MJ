Wrapper that makes one data element exportable. It renders its child unchanged and adds a small export icon in the element's top-right corner. The icon opens a menu: **CSV** and **Excel** for every element, plus **PNG** when `kind="chart"`. Files are named `<label>_<YYYY-MM-DD>.<ext>`. The wrapper writes the files itself; generated code contains no export logic, only which element is exportable and which rows it displays.

#### ExportableData - wrap:
✅ A custom table: a raw `<table>` or an antd `Table`
✅ A custom chart: Chart.js, ApexCharts, D3, or a data-driven `<svg>`, whatever the spec calls it

❌ DO NOT wrap:
- `DataGrid`, `EntityDataGrid` or `SimpleChart` → they export on their own
- KPI tiles, a single record's detail panel, a layout table, decorative SVG, a tiny inline sparkline → leave unwrapped with `{/* export-opt-out: <reason> */}` beside it
- Never guard it (`ExportableData ? … : …`) or alias it; it is always in `components` once listed as a dependency

**`rows` is the displayed data**, not the raw fetched records. Table: all rows after the user's filters and sort, across all pages. Chart: wide rows, one per x-axis value with one column per series or measure. Percents are fractions (0.25), not strings.

**Wrap the sized container**, not a bare `<canvas>`: the wrapper's div becomes the element's parent, and a responsive chart sizes itself to its parent.
