---
"@memberjunction/sql-parser": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/server": patch
---

Refactor the SQL render pipeline's row-cap path to be AST-based. Add `SQLParser.StripComments`, a token-aware comment stripper that preserves string literals and quoted identifiers (including SQL Server brackets) and handles nested block comments. Replace the regex-based `applyMaxRows` in `RenderPipeline` with `QueryPagingEngine.WrapWithMaxRows`, which injects `TOP`/`LIMIT` via the AST and falls back to OFFSET/FETCH for parser-unsupported CTE shapes. Throw on `MaxRows + Paging` conflicts instead of silently overriding. Route `AdhocQueryResolver` through `RenderPipeline.Run` so composition macros, templates, and row capping run consistently with saved queries.
