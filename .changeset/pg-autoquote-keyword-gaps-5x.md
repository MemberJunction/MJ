---
'@memberjunction/postgresql-dataprovider': patch
---

PostgreSQL no longer rejects valid SQL because MJ quoted one of its keywords.

Before sending SQL to PostgreSQL, the provider quotes mixed-case identifiers so their case is preserved. It treated any capitalized word it did not recognize as an identifier, so valid SQL was rewritten into SQL PostgreSQL rejects: `SELECT CURRENT_DATE` became `SELECT "CURRENT_DATE"` (`column "CURRENT_DATE" does not exist`), and `ORDER BY x ASC NULLS LAST` became `ASC "NULLS" "LAST"`.

87 PostgreSQL words are now recognized, the same list 6.x uses: `CURRENT_DATE` and the other niladic functions, `NULLS`/`FIRST`/`LAST`, `WITHIN GROUP` and the other window and grouping words, type names such as `CHARACTER VARYING` and `INT8`, and utility, transaction and `MERGE` keywords.

They are recognized only in ALL-CAPS, so nothing that worked before changes: a mixed-case column such as `Cycle` or `Current_Date` is still quoted, and keywords written in Title Case (`Select … From …`) still pass through as before.
