---
"@memberjunction/generic-database-provider": patch
"@memberjunction/integration-test-suite": patch
---

A capped or paged set operation (`UNION` / `INTERSECT` / `EXCEPT`) that has to be wrapped as a derived table now keeps its ORDER BY valid and its own row cap in force (#3778).

The derived-table form is used when the set operation's own cap is not a plain row count, for example `TOP` on more than one branch. The set operation's ORDER BY moves outside the derived table, which used to have two problems on SQL Server:

- **The ORDER BY could not bind.** It was moved as written, so `ORDER BY a.Name` named a branch's table alias outside the scope where that alias exists, and the query failed with `The multi-part identifier "a.Name" could not be bound`. Qualifiers are now dropped (`ORDER BY Name`) so the clause names the derived table's output columns.
- **The set operation's own `OFFSET … FETCH` was dropped.** The inside was cut at the ORDER BY, so the cap after it was lost and the query returned rows its own cap excludes. That cap is now applied by a second derived table around the set operation, ordered the same way. It cannot stay in the original text: SQL Server refuses the branches' `TOP` and the set operation's `OFFSET` in one subquery.

The original #3778 case, an unparseable query ordered by an aliased column, was already fixed when the row cap moved to editing the statement in place. Two SQL Server cases are added to the `runquery-rendering` integration bundle.
