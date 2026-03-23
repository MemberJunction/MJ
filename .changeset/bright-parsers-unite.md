---
"@memberjunction/sql-parser": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/core": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/core-actions": patch
"@memberjunction/react-test-harness": patch
---

MJ SQL Parser: unified parser for SQL + Nunjucks templates + composition tokens. Replaces fragmented regex-based SQL parsing across 6 packages with a single MJSQLParser class providing AST-based tokenization, placeholder substitution, CTE extraction, ORDER BY remapping, and deterministic parameter/field extraction. Moves QueryPagingEngine from MJCore to GenericDatabaseProvider with AST-based paging. Fixes backtick quoting, table-qualified ORDER BY remapping, trailing semicolon, and FOR XML parsing bugs.
