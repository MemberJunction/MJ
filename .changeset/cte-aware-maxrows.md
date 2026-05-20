---
"@memberjunction/generic-database-provider": patch
---

Rewrite `RenderPipeline.applyMaxRows` to inject the row cap (`TOP N` for SQL Server, `LIMIT N` for PostgreSQL) via an AST rewrite instead of a string-anchored regex. CTE queries (`WITH … SELECT …`) and queries whose CTE definitions contain their own `TOP N` now correctly receive the outer cap on the outermost SELECT. Queries that already specify an outermost `TOP` / `LIMIT` are left untouched, and shapes the parser can't represent at the top level (UNION/INTERSECT/EXCEPT, vendor-specific syntax, sqlify round-trip failures) fall back to a `SELECT TOP N * FROM (<original>) AS _capped` wrap.
