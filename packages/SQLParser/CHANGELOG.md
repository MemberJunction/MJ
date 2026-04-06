# @memberjunction/sql-parser

## 5.23.0

## 5.22.0

### Patch Changes

- cf91278: Fix NVARCHAR(MAX) mangling in SQL parser, resolve Invalid string length error in AI monitoring dashboard, add unit tests for AI agent components, and add replaceElements guidance for loop agent prompts

## 5.21.0

## 5.20.0

## 5.19.0

## 5.18.0

### Patch Changes

- 931740a: Fix SQLParser to extract parameters from Jinja2 control flow conditions ({% if %}/{% elif %}) and remove hardcoded golden-queries reusability check from QueryEntityServer.

## 5.17.0

### Patch Changes

- 4b6fd2a: Add composable query passthrough parameter bubbling, deterministic field type resolution from dependency queries and entity metadata, MJLexer-based template variable manipulation, and refactor MJQueryEntityServer into a 5-stage extraction pipeline

## 5.16.0

## 5.15.0

### Patch Changes

- 5e85b29: Fix nested WITH syntax error by hoisting inner CTEs from dependency queries, and disable External Change Detection scheduled job to prevent OOM crash-restart cycles
- d01f697: MJ SQL Parser: unified parser for SQL + Nunjucks templates + composition tokens. Replaces fragmented regex-based SQL parsing across 6 packages with a single MJSQLParser class providing AST-based tokenization, placeholder substitution, CTE extraction, ORDER BY remapping, and deterministic parameter/field extraction. Moves QueryPagingEngine from MJCore to GenericDatabaseProvider with AST-based paging. Fixes backtick quoting, table-qualified ORDER BY remapping, trailing semicolon, and FOR XML parsing bugs.

## 5.14.0
