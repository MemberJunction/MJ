Flexible data grid component with its own simplified API. Accepts **data via props** (you manage data loading). Supports sorting, filtering, paging, row selection. Optional native record opening on row click (provide entityName + entityPrimaryKeys). Two column modes: simple (string array `['Name', 'Price']`) or advanced (ColumnDef objects: `{field, header, render, width, sortable}`). Metadata-aware formatting: dates (locale with time), booleans (Yes/No), value lists (colored tags with 50+ status colors), money ($USD), decimals, integers (commas). Long text handling: truncate (ellipsis), expand (click 'show more/less'), tooltip (hover), wrap (word-break), none.

#### DataGrid - ONLY use when:
✅ You already have the data (from your own RunView call, aggregated query, joined tables, API response, etc.)
✅ You need custom data manipulation before display (filtering, transformation, merging multiple sources)
✅ You need full control over the data loading logic
✅ Displaying 2+ records in a list/table format
✅ Works with any array of objects (not just entity records)

❌ DO NOT USE DataGrid when:
- You want automatic entity record loading → **Use EntityDataGrid instead** (it calls RunView for you)
- Displaying a single record → **Use SingleRecordView instead**
- Need data visualization → **Use SimpleChart or SimpleDrilldownChart instead**
- Need automatic caching and pagination logic → **Use EntityDataGrid instead**

**Key difference from EntityDataGrid**: DataGrid is data-agnostic and passive (you pass data in). EntityDataGrid is entity-aware and active (it loads data via RunView). Choose DataGrid when you need control over data loading, EntityDataGrid for automatic entity record loading with smart caching.
