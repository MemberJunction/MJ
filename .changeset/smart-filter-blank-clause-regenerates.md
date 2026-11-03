---
"@memberjunction/core-entities": patch
---

A Smart Filter view whose generated WHERE clause is blank regenerates it, instead of returning every row.

The clause was regenerated only when it was `null`. The server's generator can return `''` (or a
model's whitespace), and `WhereClause = SmartFilterWhereClause` then made the view return every row,
with no error anywhere. The state was also permanent: a re-save of the same prompt leaves no field
dirty, so `Save()` never retried. A blank clause now counts as missing in `UpdateWhereClause()`, and
`Save()` runs the where-clause pass for a view whose Smart Filter is on, has a prompt, and has no
clause. A view with a generated clause is untouched, and no extra AI call is made for it.
