---
'@memberjunction/sql-converter': patch
'@memberjunction/metadata-sync': patch
---

PostgreSQL conversion of metadata-sync migrations whose `SET` values are natural-key subqueries now works, and a lookup subquery finds its row whatever the column's case sensitivity.

- `ExecBlockRule` converts bracket identifiers in `SET` values, so `(SELECT [ID] FROM [__mj].[Entity] …)` becomes `(SELECT "ID" FROM __mj."Entity" …)` inside the `DO $mj$` block (#6074).
- The conversion summary counts a T-SQL bracket identifier left inside any dollar-quoted block as a gap, so such a file no longer reports `0 gaps`.
- `mj sync push` writes string criteria of a lookup subquery as `LOWER(column) = LOWER(value)`, matching how the push itself finds the row. Uuid, date, number and bit criteria are compared as before.
