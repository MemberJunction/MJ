---
"@memberjunction/generic-database-provider": patch
"@memberjunction/metadata-sync": patch
"@memberjunction/server": patch
---

Add size-based splitting to MetadataSync SQL-log capture. A new `sqlLogging.maxFileSize` option (default 90 MiB) makes `mj sync push` split a `formatAsMigration` capture into multiple ordered, individually-runnable migration parts (`*.partNNN.sql`) when the output would exceed the limit — so a very large metadata push stays under GitHub's 100 MiB push-block. Splitting is a streaming rollover on statement boundaries: a statement is never torn across files, a `GO` batch never spans a file, and each part gets its own header/footer. A push whose output fits under the limit still produces a single file at the original path (backward compatible); set `maxFileSize: 0` to disable splitting. The TypeScript `SqlLoggingSession` interface now exposes `FilePaths` (all parts) alongside `FilePath` (which names the first part once a split has happened), and a push result reports `sqlLogPaths`. The GraphQL `SqlLoggingSession` type is unchanged: its `filePath` names the first part after a split. Concurrent `LogSqlStatement` and `Dispose` calls on one session are now written one at a time, in call order.

**Breaking (patch, approved in review):** `SqlLoggingSession` and `SqlLoggingSessionImpl` members are now PascalCase, matching MJ's convention for public members: `id` → `Id`, `filePath` → `FilePath`, `startTime` → `StartTime`, `statementCount` → `StatementCount`, `options` → `Options`, `initialize()` → `Initialize()`, `dispose()` → `Dispose()`. In-repo callers (MetadataSync, MJServer) are updated. `GetActiveSqlLoggingSessions()` keeps its camelCase result shape, and the deprecated `logSqlStatement` alias is unchanged.
