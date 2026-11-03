---
"@memberjunction/sql-converter": patch
---

Legacy converter: index names and `ASC`/`DESC` or `__mj_` index columns are quoted; guarded grants (`IF OBJECT_ID(…) IS NOT NULL` / `IF EXISTS (… sys.database_principals …)` around `sp_executesql N'GRANT …'`) become guarded DO blocks or counted gaps instead of being dropped; a statement after a CTE statement (`PRINT`, a guarded index drop) is split off; a self-referencing CTE gets `RECURSIVE`; `TRY_CONVERT` to uniqueidentifier or an integer type becomes a guarded cast (other targets are a gap); the UPDATE-alias rewrite accepts `${mjSchema}`-qualified joins; and `DATEDIFF(day, …)` becomes a `date - date` difference (#5567, #5799, #5920).
