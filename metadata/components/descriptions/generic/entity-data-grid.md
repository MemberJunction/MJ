Entity-aware data grid that **automatically loads records via RunView** with adaptive caching. Requires entityName prop, calls RunView internally. Smart caching: if totalRecords ≤ maxCachedRows (default 1000), loads ALL data upfront for instant client-side sort/filter. If totalRecords > maxCachedRows, uses paginated server-side loading with optional page caching. Auto-detects fields from metadata (first 15 non-system fields) or use explicit fields array. Built-in record opening on row click (auto-detects primary keys). Wraps DataGrid component for rendering.

#### EntityDataGrid - ONLY use when:
✅ Loading records directly from a MemberJunction entity (single table, no complex joins)
✅ Want automatic RunView calls with caching (don't want to manage data loading yourself)
✅ Need 'click chart segment → see actual records' drill-down pattern
✅ Optional SQL WHERE filtering via extraFilter prop
✅ Prefer smart adaptive caching (instant UX for small datasets, paginated for large ones)
✅ Typical drill-down scenarios: chart segment with < 1000 matching records

❌ DO NOT USE EntityDataGrid when:
- You already have the data from your own query → **Use DataGrid instead** (pass data via props)
- Need complex joins, aggregations, or multi-entity queries → **Use DataGrid with custom RunQuery/RunView**
- Need full control over data loading timing/logic → **Use DataGrid instead**
- Displaying aggregated/calculated data → **Use DataGrid** (EntityDataGrid loads raw entity records only)
- Data source is not a MemberJunction entity (external API, calculated results) → **Use DataGrid**

**Key difference from DataGrid**: EntityDataGrid is opinionated and automatic (manages RunView, caching, pagination). DataGrid is flexible and passive (you control data loading). Choose EntityDataGrid for simple 'show me the records' scenarios, DataGrid for custom data sources or complex queries.
