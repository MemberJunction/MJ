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

Auto-aggregates data client-side by groupBy field with count/sum/average/min/max methods. Smart auto-type selection: date fields→line, ≤5 categories→pie (preferred over doughnut), else→bar. Single-series bar charts use different colors for each bar. Formats values automatically: currency ($ for Amount fields), dates (locale format), numbers (commas). Exports as PNG image. Click events highlight the selected element and return {label, value, records: Array<object>, percentage} for parent to implement custom drill logic. No re-animation on element clicks.
