---
"@memberjunction/server": patch
"@memberjunction/core": patch
"@memberjunction/core-entities": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-clustering": patch
"@memberjunction/ng-entity-viewer": patch
---

Security audit fixes: parameterize SQL queries in GraphQL resolvers to prevent injection, validate entity read permissions on query execution, centralize permission logic in UserCanRun with recursive dependency checks, and fix UUID/multi-provider compliance violations.
