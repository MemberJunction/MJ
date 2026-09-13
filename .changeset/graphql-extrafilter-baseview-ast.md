---
"@memberjunction/server": patch
"@memberjunction/sql-parser": patch
---

Replace the GraphQL ExtraFilter SELECT/EXISTS keyword ban with an AST screen that allows `IN (SELECT … FROM <entity BaseView>)` and still rejects base tables (`__mj.User`). Uses `@memberjunction/sql-parser` (same wrap as EDS `assertReadOnlyClause`). SQLParser now walks `expr.value` so `IN (SELECT …)` subqueries are visible to ExtractTableRefs.
