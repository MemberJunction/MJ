---
"@memberjunction/core-actions": patch
"@memberjunction/ng-artifacts": patch
"@memberjunction/communication-gmail": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/templates": patch
---

Security (#4253): only Owner-type users may create or change a view with `CustomWhereClause` enabled, and every other saved view's rendered `WhereClause` now passes the same provider screen as `ExtraFilter`. The Conditional action refuses conditions with dangerous code patterns and always evaluates in strict mode. The JSON artifact viewer's HTML iframe no longer gets `allow-same-origin`. The Gmail provider strips CR/LF from header values. Nunjucks runs with `dev: false`, so render errors no longer carry stack traces.
