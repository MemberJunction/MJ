---
"@memberjunction/sql-dialect": patch
"@memberjunction/schema-engine": patch
"@memberjunction/integration-schema-builder": patch
"@memberjunction/integration-test-suite": patch
---

Emit column descriptions on `ALTER TABLE ADD COLUMN` across both `@memberjunction/schema-engine` and `@memberjunction/integration-schema-builder`, and harden description escaping and migration batch/statement splitting in `@memberjunction/sql-dialect`:

- `@memberjunction/sql-dialect`: drive `SplitStatements` and new `SplitBatches` from each dialect's `DialectLexicalRules` facet (covering single-quoted strings, quoted identifiers, line/block comments, and PostgreSQL `E'...'`/dollar-quoted blocks without misreading `$` inside unquoted identifiers) so `;\n`, `GO`, and `$$` inside description literals never break RSU batch chunking; add `MaxCommentLength` (3,700 UTF-16 code units, surrogate-pair safe, on SQL Server to stay under `sp_addextendedproperty`'s 7,500-byte `sql_variant` limit; uncapped on PostgreSQL) and NUL-byte stripping in `CommentOnObject` / `CommentOnColumn`; quote schema names consistently via `Writer.QuoteSchema` in PostgreSQL `CommentOnObject` / `CommentOnColumn`.
- `@memberjunction/schema-engine`: emit idempotent column descriptions (`CommentOnColumnIfAbsent`) in `DDLGenerator.GenerateAlterTableAddColumn`, skip whitespace-only / NUL-only descriptions and validate identifiers in `DDLGenerator.GenerateDescriptions`, and route `RuntimeSchemaManager.executeMigration` batch/chunk splitting through `RuntimeSchemaManager.SplitMigrationBatches` and `SQLDialect.SplitBatches`.
- `@memberjunction/integration-schema-builder`: emit idempotent column descriptions in `DDLGenerator.GenerateAlterTableAddColumn`, delegate all description SQL in `DDLGenerator` (`GenerateDescriptions` / `GenerateExtendedProperties`) to `SQLDialect`, and share frozen, strongly-typed `STANDARD_COLUMN_DESCRIPTIONS` across `DDLGenerator`, `SchemaBuilder`, and `SchemaEvolution` (existing already-present columns on evolved tables are not retroactively backfilled).
- `@memberjunction/integration-test-suite`: add live-database check `integration-schema-pipeline.ISP5` verifying `ALTER TABLE ADD COLUMN` column descriptions, multi-line `;\n`/`GO`/`$$` preservation, `MaxCommentLength` truncation, whitespace-only skipping, and re-run idempotency through `RuntimeSchemaManager.SplitMigrationBatches`.
