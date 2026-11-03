---
"@memberjunction/core": patch
"@memberjunction/sql-dialect": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/ai-vector-sync": patch
"@memberjunction/ai-vector-dupe": patch
"@memberjunction/ng-list-detail-grid": patch
---

List membership filters run on SQL Server and PostgreSQL. `ListMembershipFilter` takes the entity's key fields: a single key keeps the `IN` form with `RecordID` cast to the key's type, and a composite key builds the `F1|v1||F2|v2` record id with `CONCAT` instead of T-SQL `+` and `NVARCHAR(MAX)`. The list grid, vector sync and the duplicate detector (which now reads the configured core schema instead of `__mj`) use it, and the prior view-run exclusion quotes its identifiers and GUID literals and casts `RecordID`. The PostgreSQL auto-quoter's deliberately unquoted words are now a list the test suite checks in full.
