Standalone single-level chart component with NO built-in drill-down functionality. Renders bar/line/pie/doughnut/area/scatter charts using Chart.js 4.4.1. Emits onClick events but doesn't handle navigation - parent component must wire up drill-down logic.

#### SimpleChart - ONLY use when:
✅ Single data series (one line, one set of bars, one pie)
✅ No built-in drill-down needed (parent handles onClick)
✅ Standard chart types (bar, line, pie, doughnut, area, scatter)

❌ DO NOT USE SimpleChart when:
- Multiple series on same chart (e.g., "this year vs last year", "revenue AND count")
- Dual Y-axes needed
- Complex legend with multiple data series
- Any multi-dimensional comparison
- User explicitly wants 'drill-down to table' (use SimpleDrilldownChart instead)

**Use For:** standalone visualizations, dashboard widgets, building blocks in custom multi-level drill-downs.

Auto-aggregates data client-side by groupBy field with count/sum/average/min/max methods. Smart auto-type selection: date fields→line, ≤5 categories→pie (preferred over doughnut), else→bar. Single-series bar charts use different colors for each bar. Formats values automatically: currency ($ for Amount fields), dates (locale format), numbers (commas). Click events highlight the selected element and return {label, value, records: Array<object>, percentage} for parent to implement custom drill logic. No re-animation on element clicks.

**Layout:** SimpleChart manages its own height via the `height` prop (default 400px). To control chart size, pass `height` directly — do not use a fixed-height wrapper div.

**Export is built in**: an export icon over the chart's top-right corner, shown on hover offers CSV and Excel of the data the chart draws (one row per category, one column per series, or per stack value when `stackBy` is set; aggregated, sorted and limited as drawn) and a PNG of the chart. Never wrap SimpleChart in `ExportableData`. Use `exportLabel` to name the file; `exportable={false}` only for a decorative chart. `enableExport` is a deprecated alias.
