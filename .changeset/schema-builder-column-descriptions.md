---
"@memberjunction/integration-schema-builder": patch
---

Emit and harden column and table descriptions across `ALTER TABLE ADD COLUMN`, `CREATE TABLE`, and `SchemaBuilder.BuildSchema` in `@memberjunction/integration-schema-builder`:

- `DDLGenerator.GenerateAlterTableAddColumn` now emits guarded `MS_Description` extended properties on SQL Server (`IF NOT EXISTS (SELECT 1 FROM sys.fn_listextendedproperty(...))`) and `COMMENT ON COLUMN` statements on PostgreSQL when a newly added column carries a non-whitespace `Description` (existing already-present columns on evolved tables are not retroactively backfilled).
- `DDLGenerator.GenerateCreateTable` now emits `COMMENT ON TABLE` and `COMMENT ON COLUMN` statements on PostgreSQL via `GeneratePostgresComments`, and `SchemaBuilder.BuildSchema` normalizes table and column descriptions consistently across SQL Server and PostgreSQL.
- Add `DDLGenerator.NormalizeDescription` to skip whitespace-only descriptions, collapse `;\n` sequences so RSU's 32 KB batch chunker (`SplitStatements`) cannot split mid-literal, and cap SQL Server `MS_Description` payloads at 3,700 UTF-16 code units (`MAX_SQLSERVER_DESCRIPTION_CHARS`, surrogate-pair safe) to stay within `sp_addextendedproperty`'s 7,500-byte `sql_variant` limit.
- Export frozen, strongly-typed `STANDARD_COLUMN_DESCRIPTIONS` (`Readonly<Record<StandardIntegrationColumnName, string>>`) covering all 12 `__mj_integration_*` tracking columns, shared across `DDLGenerator`, `SchemaBuilder.integrationSyncColumns`, and `SchemaEvolution.ensureStandardColumns`.
