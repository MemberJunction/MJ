---
"@memberjunction/core": minor
"@memberjunction/codegen-lib": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/core-entities": patch
"@memberjunction/server": patch
"@memberjunction/search-engine": patch
"@memberjunction/ng-workspace-initializer": patch
---

Fix AllowUpdateAPI clearing when EntityField transitions to virtual, use subqueries for organic key INSERTs for portable SQL, prevent permanent engine failure when MJAPI is temporarily unavailable, and centralize RLS exemption check in GetUserRowLevelSecurityWhereClause
