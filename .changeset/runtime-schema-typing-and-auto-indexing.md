---
"@memberjunction/sql-dialect": patch
"@memberjunction/schema-engine": patch
"@memberjunction/integration-engine": patch
"@memberjunction/integration-schema-builder": patch
"@memberjunction/server": patch
"@memberjunction/integration-test-suite": patch
---

Preserve native SQL column types (`INT`, `BIGINT`, `SMALLINT`, `TINYINT`, `DECIMAL(p,s)`, `FLOAT`, `BIT`/`BOOLEAN`, `DATE`, `DATETIMEOFFSET`/`TIMESTAMPTZ`, `TIME`, `UNIQUEIDENTIFIER`/`UUID`) and `Precision`/`Scale` across `IntegrationSchemaSync` and `TypeMapper` instead of falling back to `NVARCHAR`/`NVARCHAR(MAX)`. Add idempotent non-unique auto-indexing for Soft PKs (`IX_*_PK`), Soft FKs (`IX_*_FK_*`), and Organic Keys (`IX_*_OK_*`) across runtime `CREATE TABLE` and `SchemaEvolution` `ALTER TABLE` with SQL Server key-width capping (`<= 450` chars) and `sys.index_columns` key-tuple deduplication.
