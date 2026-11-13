---
"@memberjunction/codegen-lib": patch
"@memberjunction/sql-converter": patch
---

PostgreSQL CodeGen: the logged base-view SQL (migration log and bake capture) now carries the guarded `spRebindLayeredOuterView` call for each alternate base view, so `vw*Active` views pick up new columns on migrate-only installs (#6539). `vwSQLColumnsAndEntityFields` reports `NULL` as the `DefaultValue` of a generated column; the expression stays in `ComputedColumnDefinition` (#6511).
