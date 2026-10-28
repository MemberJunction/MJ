---
"@memberjunction/codegen-lib": patch
---

PostgreSQL full-text search no longer requires a SQL-Server-only precondition: the primary-key index lookup that only SQL Server's `CREATE FULLTEXT INDEX … KEY INDEX` uses now runs only on providers that declare they need it, so a PostgreSQL entity without a primary-key constraint gets its full-text objects. The full-text write-back's error now names the entity and field, says why the user cache was empty, and guards the cache array rather than its element.
