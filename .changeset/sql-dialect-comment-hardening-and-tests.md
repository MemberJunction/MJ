---
"@memberjunction/sql-dialect": patch
"@memberjunction/integration-schema-builder": patch
---

Escape identifier arguments and use consistent `N'...'` Unicode literals across SQL Server extended-property comment helpers in `@memberjunction/sql-dialect`, and add regression tests for `GO` batch splitting after comments/multi-line strings, doubled-`]]` bracket identifiers, and PostgreSQL `CommentOnColumn` identifier quoting and NUL stripping.
