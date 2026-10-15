---
"@memberjunction/sql-parser": patch
---

Security: `ExtractTableRefs` now sees the table inside an `IN (SELECT …)` subquery (hand-ported from #4293, commit 806e7f2dc3), so the dataset ItemFilter screen ported to lts/5 for #5265 can refuse a subquery over a base table or an entity the caller cannot read.
