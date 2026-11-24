---
"@memberjunction/sql-dialect": patch
"@memberjunction/schema-engine": patch
"@memberjunction/integration-schema-builder": patch
---

Emit column descriptions on `ALTER TABLE ADD COLUMN` across both `@memberjunction/schema-engine` and `@memberjunction/integration-schema-builder`, and harden description escaping and migration batch/statement splitting in `@memberjunction/sql-dialect`:

- `@memberjunction/sql-dialect`: make `SplitStatements` single-quote-, comment-, and (on PostgreSQL) `E'...'`/dollar-quote-aware so `;\n` and `$$` inside description literals never break RSU batch chunking; add quote- and comment-aware `SplitBatches` for `GO` batch splitting; add `MaxCommentLength` (3,700 UTF-16 code units, surrogate-pair safe, on SQL Server to stay under `sp_addextendedproperty`'s 7,500-byte `sql_variant` limit; uncapped on PostgreSQL) and NUL-byte stripping in `CommentOnObject` / `CommentOnColumn`.
- `@memberjunction/schema-engine`: emit idempotent column descriptions (`CommentOnColumnIfAbsent`) in `DDLGenerator.GenerateAlterTableAddColumn`, skip whitespace-only / NUL-only descriptions and validate identifiers in `DDLGenerator.GenerateDescriptions`, and route `RuntimeSchemaManager.executeMigration` batch splitting through `SQLDialect.SplitBatches`.
- `@memberjunction/integration-schema-builder`: emit idempotent column descriptions in `DDLGenerator.GenerateAlterTableAddColumn`, delegate all description SQL in `DDLGenerator` (`GenerateDescriptions` / `GenerateExtendedProperties`) to `SQLDialect`, and share frozen, strongly-typed `STANDARD_COLUMN_DESCRIPTIONS` across `DDLGenerator`, `SchemaBuilder`, and `SchemaEvolution` (existing already-present columns on evolved tables are not retroactively backfilled).
