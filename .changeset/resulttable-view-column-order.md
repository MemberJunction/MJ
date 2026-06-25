---
"@memberjunction/sqlserver-dataprovider": patch
---

Save-capture `@ResultTable` now matches the base view's **actual** column order (read from `sys.columns` at `Config`, cached per entity) instead of inferring it from `EntityField` metadata.

The save wrapper captures the row via a **positional** `INSERT INTO @ResultTable EXEC <sp>` where the sp returns `SELECT * FROM <BaseView>`; SQL Server maps that result set by ordinal, so `@ResultTable` must be declared in the view's physical column order. The prior heuristics (≤5.40.1 `EntityField.Sequence` order; 5.42 non-virtual-then-virtual partition) only matched canonical CodeGen views. For a manually-maintained view that places a base column **after** the virtual/join columns, the declared order diverged from the view and values mis-routed into wrong-typed slots — a `nvarchar→bit`/`nvarchar→uniqueidentifier` type-conversion error that failed the save and rolled back the transaction.

Reading the view directly makes the column order authoritative by construction — correct for canonical, computed-column, and hand-maintained views alike. Output is byte-identical to the 5.42 partition for canonical views (a no-op for the overwhelming majority); falls back to the partition when a view is uncached or has a column with no matching field.
