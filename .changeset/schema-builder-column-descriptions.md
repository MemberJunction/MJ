---
"@memberjunction/integration-schema-builder": patch
---

Emit column and table descriptions across `ALTER TABLE ADD COLUMN` and PostgreSQL `CREATE TABLE` in `@memberjunction/integration-schema-builder`:

- `DDLGenerator.GenerateAlterTableAddColumn` now emits guarded `MS_Description` extended properties on SQL Server (`IF NOT EXISTS (SELECT 1 FROM sys.fn_listextendedproperty(...))`) and `COMMENT ON COLUMN` statements on PostgreSQL when a column carries a non-whitespace `Description`.
- `DDLGenerator.GenerateCreateTable` now emits `COMMENT ON TABLE` and `COMMENT ON COLUMN` statements on PostgreSQL via `GeneratePostgresComments`, matching the SQL Server extended-property behavior.
- Export `STANDARD_COLUMN_DESCRIPTIONS` covering all 12 `__mj_integration_*` tracking columns, share it across `DDLGenerator`, `SchemaBuilder.integrationSyncColumns`, and `SchemaEvolution.ensureStandardColumns` so newly created and evolved tables stay in sync.
