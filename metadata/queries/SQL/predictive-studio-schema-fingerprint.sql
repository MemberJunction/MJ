-- Predictive Studio: the schema's column fingerprint, the applied-migration count and the newest entity-metadata change.
--
-- Read before and after a publish, binding and scoring run by the zero-schema-change checks (IT182, gate G5.6): a
-- prediction must reach a record with no column added, no migration applied and no CodeGen run (D-058, D-078), so all
-- three values must be unchanged. CHECKSUM_AGG over every sys.columns row's object, name, ordinal and type changes when
-- any column of any table or view is added, dropped, renamed or retyped; flyway_schema_history gains a row per applied
-- migration; CodeGen stamps __mj_UpdatedAt on the MJ: Entities rows it touches. Always one row. Single statement.
-- SQL Server only (D-057).
SELECT
    (SELECT COUNT(*) FROM sys.columns) AS ColumnCount,
    (SELECT CHECKSUM_AGG(CHECKSUM(object_id, name, column_id, system_type_id)) FROM sys.columns) AS ColumnChecksum,
    (SELECT COUNT(*) FROM [__mj].flyway_schema_history) AS MigrationCount,
    (SELECT MAX(__mj_UpdatedAt) FROM [__mj].Entity) AS EntityMetadataUpdatedAt
