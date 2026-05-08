-- ============================================================================
-- Migration: Add IsComputed flag to EntityField
-- ============================================================================
-- Adds the new EntityField.IsComputed column, updates the metadata view
-- (vwSQLColumnsAndEntityFields) to project it, and updates the sync sproc
-- (spUpdateExistingEntityFieldsFromSchema) to propagate it from the catalog.
--
-- IsComputed distinguishes SQL Server computed columns (and PostgreSQL
-- generated columns, post-conversion via SQLConverter) from view-only
-- virtual columns. Both are flagged IsVirtual = 1 today, which conflates two
-- distinct cases:
--   IsVirtual=1, IsComputed=0  → view-only (column not in base table)
--   IsVirtual=1, IsComputed=1  → SQL-computed (in base table, read-only in SQL)
--
-- The downstream consumer of the new flag is base-view JOIN target selection
-- in CodeGen — when an FK's related Name Field is computed, the join targets
-- the related entity's base table (not its view). This avoids unnecessary
-- view materialization and unblocks self-referencing FKs whose Name Field
-- is computed (which previously hit the self-virtual-NameField skip path).
--
-- See plans/computed-columns-support.md for the full design.
-- ============================================================================


-- 1. Add the IsComputed column to EntityField. Default 0 keeps existing rows
-- correct until the next CodeGen run repopulates from the catalog. Single
-- ALTER TABLE per the consolidation rule in CLAUDE.md.
ALTER TABLE ${flyway:defaultSchema}.EntityField ADD
    IsComputed BIT NOT NULL DEFAULT 0;
GO


-- 2. Document the new column. CodeGen pulls this into TSDoc on
-- EntityFieldEntity.IsComputed, so the explanation surfaces in IntelliSense
-- everywhere the property is used.
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, this field is a SQL Server computed column or PostgreSQL generated column — physically present in the base table but read-only at the SQL layer. Distinct from IsVirtual, which means the column is not in the base table at all (e.g., joined name lookups in the base view). A computed column has both IsVirtual=1 (read-only at the API layer) and IsComputed=1 (physically in the table). The difference matters for base-view JOIN target selection: when an FK''s related Name Field is computed, the generated view joins to the related entity''s base table instead of its view.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'IsComputed';
GO


-- 3. Update the existing IsVirtual description to cross-reference IsComputed.
-- The current value is the literal string 'NULL' (effectively undocumented).
-- sp_updateextendedproperty (not sp_addextendedproperty) is required because
-- the property already exists with that placeholder value.
EXEC sp_updateextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, this field is read-only at the API layer (excluded from spCreate / spUpdate / GraphQL input types). Set automatically when the column is either (a) not present in the base table — e.g., a joined name lookup in the base view, or (b) a SQL Server computed column or PostgreSQL generated column. Cases (a) and (b) are distinguished by the IsComputed flag: IsVirtual=1, IsComputed=0 means view-only; IsVirtual=1, IsComputed=1 means computed/generated and physically present in the base table.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'IsVirtual';
GO


-- 4. Recreate vwSQLColumnsAndEntityFields with the new IsComputed projection.
-- Same shape as the prior version (see migrations/v5/B202602151200__v5.0__Baseline.sql:23393),
-- with one new line:
--     IIF(cc.definition IS NOT NULL, 1, 0) IsComputed,
-- The IsVirtual logic is unchanged — both view-only columns and computed columns
-- continue to be flagged IsVirtual = 1, preserving every existing IsVirtual
-- consumer's behavior.
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwSQLColumnsAndEntityFields]
GO
CREATE VIEW [${flyway:defaultSchema}].[vwSQLColumnsAndEntityFields]
AS
WITH FilteredColumns AS (
    SELECT *
    FROM sys.all_columns
    WHERE default_object_id IS NOT NULL
)
SELECT
    e.EntityID,
    e.EntityName Entity,
    e.SchemaName,
    e.TableName TableName,
    ef.ID EntityFieldID,
    ef.Sequence EntityFieldSequence,
    ef.Name EntityFieldName,
    c.column_id Sequence,
    basetable_columns.column_id BaseTableSequence,
    c.name FieldName,
    COALESCE(bt.name, t.name) Type,
    IIF(t.is_user_defined = 1, t.name, NULL) UserDefinedType,
    c.max_length Length,
    c.precision Precision,
    c.scale Scale,
    c.is_nullable AllowsNull,
    IIF(COALESCE(bt.name, t.name) IN ('timestamp', 'rowversion'), 1, IIF(basetable_columns.is_identity IS NULL, 0, basetable_columns.is_identity)) AutoIncrement,
    c.column_id,
    IIF(basetable_columns.column_id IS NULL OR cc.definition IS NOT NULL, 1, 0) IsVirtual, -- view-only OR computed; use IsComputed below to disambiguate
    IIF(cc.definition IS NOT NULL, 1, 0) IsComputed, -- physically in base table but read-only at SQL layer
    basetable_columns.object_id,
    dc.name AS DefaultConstraintName,
    dc.definition AS DefaultValue,
    cc.definition ComputedColumnDefinition,
    COALESCE(EP_View.value, EP_Table.value) AS [Description],
    EP_View.value AS ViewColumnDescription,
    EP_Table.value AS TableColumnDescription
FROM
    FilteredColumns c
INNER JOIN
    [${flyway:defaultSchema}].vwSQLTablesAndEntities e
    ON c.object_id = COALESCE(e.view_object_id, e.object_id)
INNER JOIN
    sys.types t ON c.user_type_id = t.user_type_id
LEFT OUTER JOIN
    sys.types bt ON t.system_type_id = bt.user_type_id AND t.is_user_defined = 1
INNER JOIN
    sys.all_objects basetable ON e.object_id = basetable.object_id
LEFT OUTER JOIN
    sys.computed_columns cc ON e.object_id = cc.object_id AND c.name = cc.name
LEFT OUTER JOIN
    sys.all_columns basetable_columns
    ON basetable.object_id = basetable_columns.object_id AND c.name = basetable_columns.name
LEFT OUTER JOIN
    [${flyway:defaultSchema}].EntityField ef ON e.EntityID = ef.EntityID AND c.name = ef.Name
LEFT OUTER JOIN
    sys.default_constraints dc
    ON e.object_id = dc.parent_object_id AND basetable_columns.column_id = dc.parent_column_id
LEFT OUTER JOIN
    sys.extended_properties EP_Table
    ON EP_Table.major_id = basetable_columns.object_id
       AND EP_Table.minor_id = basetable_columns.column_id
       AND EP_Table.name = 'MS_Description'
       AND EP_Table.class_desc = 'OBJECT_OR_COLUMN'
LEFT OUTER JOIN
    sys.extended_properties EP_View
    ON EP_View.major_id = c.object_id
       AND EP_View.minor_id = c.column_id
       AND EP_View.name = 'MS_Description'
       AND EP_View.class_desc = 'OBJECT_OR_COLUMN'
GO


-- 5. Recreate spUpdateExistingEntityFieldsFromSchema to sync IsComputed alongside
-- the other catalog-derived columns. Same body as the prior version (see
-- migrations/v5/B202602151200__v5.0__Baseline.sql:34121) plus three additions:
--   - @FilteredRows table variable: add IsComputed BIT
--   - INSERT ... SELECT: add fromSQL.IsComputed
--   - WHERE change-detection: add ef.IsComputed <> fromSQL.IsComputed
--   - UPDATE: set ef.IsComputed = fr.IsComputed
DROP PROC IF EXISTS [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema]
GO
CREATE PROC [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema]
    @ExcludedSchemaNames NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ExcludedSchemas TABLE (SchemaName NVARCHAR(255));
    INSERT INTO @ExcludedSchemas(SchemaName)
    SELECT TRIM(value) FROM STRING_SPLIT(@ExcludedSchemaNames, ',');

    DECLARE @FilteredRows TABLE (
        EntityID UNIQUEIDENTIFIER,
        EntityName NVARCHAR(500),
        EntityFieldID UNIQUEIDENTIFIER,
        EntityFieldName NVARCHAR(500),
        AutoUpdateDescription BIT,
        ExistingDescription NVARCHAR(MAX),
        SQLDescription NVARCHAR(MAX),
        Type NVARCHAR(255),
        Length INT,
        Precision INT,
        Scale INT,
        AllowsNull BIT,
        DefaultValue NVARCHAR(MAX),
        AutoIncrement BIT,
        IsVirtual BIT,
        IsComputed BIT,
        Sequence INT,
        RelatedEntityID UNIQUEIDENTIFIER,
        RelatedEntityFieldName NVARCHAR(255),
        IsPrimaryKey BIT,
        IsUnique BIT
    );

    INSERT INTO @FilteredRows
    SELECT
        e.ID as EntityID,
        e.Name as EntityName,
        ef.ID AS EntityFieldID,
        ef.Name as EntityFieldName,
        ef.AutoUpdateDescription,
        ef.Description AS ExistingDescription,
        CONVERT(nvarchar(max),fromSQL.Description) AS SQLDescription,
        fromSQL.Type,
        fromSQL.Length,
        fromSQL.Precision,
        fromSQL.Scale,
        fromSQL.AllowsNull,
        CONVERT(nvarchar(max),fromSQL.DefaultValue),
        fromSQL.AutoIncrement,
        fromSQL.IsVirtual,
        fromSQL.IsComputed,
        fromSQL.Sequence,
        re.ID AS RelatedEntityID,
        fk.referenced_column AS RelatedEntityFieldName,
        CASE WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END AS IsPrimaryKey,
        CASE
            WHEN pk.ColumnName IS NOT NULL THEN 1
            ELSE CASE WHEN uk.ColumnName IS NOT NULL THEN 1 ELSE 0 END
        END AS IsUnique
    FROM
        [${flyway:defaultSchema}].EntityField ef
    INNER JOIN
        vwSQLColumnsAndEntityFields fromSQL
        ON ef.EntityID = fromSQL.EntityID AND ef.Name = fromSQL.FieldName
    INNER JOIN
        [${flyway:defaultSchema}].Entity e ON ef.EntityID = e.ID
    LEFT OUTER JOIN
        vwForeignKeys fk
        ON ef.Name = fk.[column]
           AND e.BaseTable = fk.[table]
           AND e.SchemaName = fk.[schema_name]
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].Entity re
        ON re.BaseTable = fk.referenced_table AND re.SchemaName = fk.[referenced_schema]
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].vwTablePrimaryKeys pk
        ON e.BaseTable = pk.TableName AND ef.Name = pk.ColumnName AND e.SchemaName = pk.SchemaName
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].vwTableUniqueKeys uk
        ON e.BaseTable = uk.TableName AND ef.Name = uk.ColumnName AND e.SchemaName = uk.SchemaName
    LEFT OUTER JOIN
        @ExcludedSchemas excludedSchemas ON e.SchemaName = excludedSchemas.SchemaName
    WHERE
        e.VirtualEntity = 0
        AND excludedSchemas.SchemaName IS NULL
        AND ef.ID IS NOT NULL
        AND (
          ISNULL(LTRIM(RTRIM(ef.Description)), '') <> ISNULL(LTRIM(RTRIM(IIF(ef.AutoUpdateDescription=1, CONVERT(NVARCHAR(MAX), fromSQL.Description), ef.Description))), '') OR
          ef.Type <> fromSQL.Type OR
          ef.Length <> fromSQL.Length OR
          ef.Precision <> fromSQL.Precision OR
          ef.Scale <> fromSQL.Scale OR
          ef.AllowsNull <> fromSQL.AllowsNull OR
          ISNULL(LTRIM(RTRIM(ef.DefaultValue)), '') <> ISNULL(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), fromSQL.DefaultValue))), '') OR
          ef.AutoIncrement <> fromSQL.AutoIncrement OR
          ef.IsVirtual <> fromSQL.IsVirtual OR
          ef.IsComputed <> fromSQL.IsComputed OR
          ef.Sequence <> fromSQL.Sequence OR
          ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, ef.RelatedEntityID), '00000000-0000-0000-0000-000000000000') <> ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, re.ID), '00000000-0000-0000-0000-000000000000') OR
          ISNULL(LTRIM(RTRIM(ef.RelatedEntityFieldName)), '') <> ISNULL(LTRIM(RTRIM(fk.referenced_column)), '') OR
          ef.IsPrimaryKey <> CASE WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END OR
          ef.IsUnique <> CASE
              WHEN pk.ColumnName IS NOT NULL THEN 1
              ELSE CASE WHEN uk.ColumnName IS NOT NULL THEN 1 ELSE 0 END
          END
        );

    UPDATE ef
    SET
        ef.Description = IIF(fr.AutoUpdateDescription=1, fr.SQLDescription, ef.Description),
        ef.Type = fr.Type,
        ef.Length = fr.Length,
        ef.Precision = fr.Precision,
        ef.Scale = fr.Scale,
        ef.AllowsNull = fr.AllowsNull,
        ef.DefaultValue = fr.DefaultValue,
        ef.AutoIncrement = fr.AutoIncrement,
        ef.IsVirtual = fr.IsVirtual,
        ef.IsComputed = fr.IsComputed,
        ef.Sequence = fr.Sequence,
        ef.RelatedEntityID = IIF(ef.AutoUpdateRelatedEntityInfo = 1, fr.RelatedEntityID, ef.RelatedEntityID),
        ef.RelatedEntityFieldName = IIF(ef.AutoUpdateRelatedEntityInfo = 1, fr.RelatedEntityFieldName, ef.RelatedEntityFieldName),
        ef.IsPrimaryKey = fr.IsPrimaryKey,
        ef.IsUnique = fr.IsUnique,
        ef.__mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].EntityField ef
    INNER JOIN
        @FilteredRows fr ON ef.ID = fr.EntityFieldID;

    SELECT * FROM @FilteredRows;
END;
GO
