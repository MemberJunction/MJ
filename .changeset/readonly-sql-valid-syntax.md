---
"@memberjunction/sql-parser": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/server": patch
---

Test SQL and ad-hoc SQL no longer refuse valid read-only statements as "not a safe read-only statement".

- `StrictFragmentValidator.ValidateReadOnlyStatement` accepts a set operation (`UNION`, `UNION ALL`, `INTERSECT`, `EXCEPT`) whose branches are all read-only SELECTs. Every branch is still read and screened, a branch that is a `SELECT … INTO` is still refused, and the WHERE / ORDER BY fragment validators still refuse any set operation.
- On SQL Server, valid syntax node-sql-parser's TransactSQL grammar cannot read is parsed through a strict-only rewrite that keeps every relation and subquery in place: `STRING_AGG(…) WITHIN GROUP (ORDER BY …)`, `INTERSECT`, `EXCEPT`, `TRY_CAST`, `COUNT_BIG(*)`, `RANGE` window frames, `LIKE … ESCAPE`, `TOP … PERCENT WITH TIES` / `TOP (n) WITH TIES`, and a leading `;`. The database still runs the original text, and `SQLParser`'s own output is unchanged.
