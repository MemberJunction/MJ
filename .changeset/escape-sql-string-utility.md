---
"@memberjunction/global": patch
---

Add canonical `EscapeSQLString` utility to `@memberjunction/global` for safe escaping of string literals in SQL statements, clauses, and `ExtraFilter` predicates, and adopt it across core packages in place of duplicate ad-hoc implementations.

Call sites now use `EscapeSQLString` directly rather than package-local aliases. `@memberjunction/schema-engine` no longer exports `EscapeSqlString` at all — it had no callers, so it is removed outright rather than deprecated. The remaining three exported aliases — `EscapeSqlString` (`@memberjunction/open-app-engine`), `escapeSqlLiteral` (`@memberjunction/database-designer-core`) and `escapeSqlString` (`@memberjunction/version-history`) — are kept as `@deprecated` re-exports so external callers do not break, and will be removed in the next major.

`EscapeSQLString` escapes string literals only. Its documentation, and the `data-access` rule, now spell out the three cases it does not cover: `LIKE` patterns (where `%`, `_` and `[` remain live wildcards), identifier names (use SchemaEngine's `ValidateIdentifier()`), and values whose absence should be an error (`null`/`undefined` escape to `''` rather than throwing).
