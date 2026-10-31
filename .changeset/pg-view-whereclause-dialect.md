---
"@memberjunction/generic-database-provider": patch
---

PostgreSQL: a saved view's WhereClause now gets the same platform rewrite as `ExtraFilter` before it runs. The filter builder saves WhereClauses in SQL Server syntax (`[Field] LIKE '%x%'`), so every filtered saved view run server-side failed on PostgreSQL with `syntax error at or near "["`. That broke Save View as List, saved views as List Operations sources, and Refresh List From Source. The balance check now reads the rewritten clause, the text that actually runs. No change on SQL Server.
