---
"@memberjunction/sql-parser": patch
"@memberjunction/generic-database-provider": patch
"@memberjunction/global": patch
"@memberjunction/core-entities-server": patch
"@memberjunction/codegen-lib": patch
---

refactor(sql-parser): instance-based parser with dialect adapters, parse-preprocessing, and a render-pipeline mutation guard

- **`SQLParser` is now instance-based** (`new SQLParser(sql, dialect)`). AST inspection/mutation (`IsValid`, `StatementKind`, `OuterCap`, `SetOuterCap`, `ClearOuterCap`, `ToSQL`) and extraction (`ExtractCTEs`, `ExtractTableRefs`, `ExtractColumnRefs`, `ExtractSelectColumns`) are instance members; pure string/token utilities (`ParseSQL`, `SqlifyAST`, `StripComments`, `Tokenize`, `Analyze`, `HasUnwrappableTrailingClause`, the MJ-template helpers, …) remain static.
- **Dialect-neutral row caps via an internal `ASTDialectAdapter`** (keyed by `ParserDialect`). The exported `SQLOuterCap` (with its `kind: 'top' | 'limit'`) is replaced by `RowCapInfo` with an explicit `form: 'numeric' | 'percent' | 'opaque'` discriminant. The `isSQLServerDialect()` quote-probe and the `dialect.PlatformKey === 'sqlserver'` branch in the row-cap path are gone (`outerWrap` now uses `dialect.LimitClause()`).
- **Parse-preprocessing fallback** in the constructor: on a direct-parse failure it aliases bracket-quoted identifiers with parser-defeating characters (`[Active People]`, `[my-cte]`) and splits a trailing `OPTION (...)` clause, then restores both on `ToSQL`. This lets Skip-style CTE queries and `OPTION` queries reach the precise AST row-cap path (`TOP N` / `LIMIT N`) instead of the OFFSET/FETCH or outer-wrap fallback.
- **Render-pipeline mutation guard**: `RenderPipeline.Run` now rejects a rendered query that resolves to a top-level data mutation (INSERT/UPDATE/DELETE/MERGE) via the AST `StatementKind`. (The broad dangerous-keyword scan stays on the ad-hoc execution path; it is unsuitable as a blanket gate because it false-positives on legitimate constructs like the `REPLACE()` function.)
- **`SQLExpressionValidator`**: `FOR` is now allowed in `full_query` context so `FOR JSON` / `FOR XML` queries aren't wrongly rejected (`FOR UPDATE` remains blocked via the independent `UPDATE` keyword).

No behavior change for already-valid queries; preprocessing only widens coverage and the guard only rejects mutations. All consumers (`queryPagingEngine`, `queryCompositionEngine`, `query-extraction`, `manage-metadata`, `structuralParser`) migrated to the instance API.
