---
"@memberjunction/core-entities-server": patch
"@memberjunction/integration-test-suite": patch
---

Role row-level-security filters that use subqueries, or that are shared across several entities, can be edited again once permission rows reference them. Editing such a filter's `FilterText` (through the entity layer or `mj sync push`) used to be refused by the checks built for API-key row filters, which treat every word of a subquery as a column and require every referrer to be on one entity. A filter referenced only by role permission rows is now screened for dangerous SQL (subqueries and function calls allowed; DDL/DML/EXEC, comments, semicolons and system catalogs still refused) and compiled against the base view of every entity that references it, so a bad column, table or function is still refused with the database's own error. A filter referenced by any API-key or API-application scope rule keeps the strict API-key rules unchanged. New mutation-gated integration checks RF1–RF3 in the `rls-isolation` bundle cover the edit, the read restriction for users whose only role carries the filter, and both negative cases.
