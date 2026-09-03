---
"@memberjunction/generic-database-provider": minor
"@memberjunction/metadata-sync": minor
---

Add size-based splitting to MetadataSync SQL-log capture. A new `sqlLogging.maxFileSize` option (default 90 MiB) makes `mj sync push` split a `formatAsMigration` capture into multiple ordered, individually-runnable migration parts (`*.partNN.sql`) when the output would exceed the limit — so a very large metadata push stays under GitHub's 100 MiB push-block. Splitting is a streaming rollover on statement boundaries: a statement is never torn across files, a `GO` batch never spans a file, and each part gets its own header/footer. A push whose output fits under the limit still produces a single file at the original path (backward compatible); set `maxFileSize: 0` to disable splitting. The SQL logging session now exposes `filePaths` (all parts) alongside the existing `filePath`, and a push result reports `sqlLogPaths`.
