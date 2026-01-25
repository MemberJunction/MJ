-- =============================================
-- Soft Primary Key and Foreign Key Support
-- Enables CodeGen to work with databases lacking PK/FK constraints
-- =============================================

-- Add soft PK/FK flag columns to EntityField
ALTER TABLE [${flyway:defaultSchema}].[EntityField] ADD
    [IsSoftPrimaryKey] BIT NOT NULL DEFAULT 0,
    [IsSoftForeignKey] BIT NOT NULL DEFAULT 0;
GO

-- Add descriptions
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates this field is a soft primary key (metadata-defined, not a database constraint). When set to 1, the field is treated as a primary key even without a database PK constraint.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'IsSoftPrimaryKey';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates this field is a soft foreign key (metadata-defined, not a database constraint). When set to 1, RelatedEntityID and RelatedEntityFieldName are preserved and not overwritten by CodeGen schema sync.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'IsSoftForeignKey';
GO

-- Recreate vwEntityFields to include soft PK/FK flags
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwEntityFields];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwEntityFields]
AS
SELECT
    ef.ID,
    ef.EntityID,
    ef.Sequence,
    ef.Name,
    ef.DisplayName,
    ef.Description,
    ef.AutoUpdateDescription,
    -- Use OR so soft PKs appear as regular PKs to existing code
    CASE WHEN ef.IsPrimaryKey = 1 OR ef.IsSoftPrimaryKey = 1 THEN CAST(1 AS BIT) ELSE CAST(0 AS BIT) END AS IsPrimaryKey,
    ef.IsUnique,
    ef.Category,
    ef.Type,
    ef.Length,
    ef.Precision,
    ef.Scale,
    ef.AllowsNull,
    ef.DefaultValue,
    ef.AutoIncrement,
    ef.ValueListType,
    ef.ExtendedType,
    ef.CodeType,
    ef.DefaultInView,
    ef.ViewCellTemplate,
    ef.DefaultColumnWidth,
    ef.AllowUpdateAPI,
    ef.AllowUpdateInView,
    ef.IncludeInUserSearchAPI,
    ef.FullTextSearchEnabled,
    ef.UserSearchParamFormatAPI,
    ef.IncludeInGeneratedForm,
    ef.GeneratedFormSection,
    ef.IsVirtual,
    ef.IsNameField,
    -- RelatedEntityID is now the single source of truth (hard or soft FK)
    ef.RelatedEntityID,
    ef.RelatedEntityFieldName,
    ef.IncludeRelatedEntityNameFieldInBaseView,
    ef.RelatedEntityNameFieldMap,
    ef.RelatedEntityDisplayType,
    ef.EntityIDFieldName,
    ef.__mj_CreatedAt,
    ef.__mj_UpdatedAt,
    ef.ScopeDefault,
    ef.AutoUpdateRelatedEntityInfo,
    ef.ValuesToPackWithSchema,
    ef.Status,
    ef.AutoUpdateIsNameField,
    ef.AutoUpdateDefaultInView,
    ef.AutoUpdateCategory,
    ef.AutoUpdateDisplayName,
    ef.AutoUpdateIncludeInUserSearchAPI,
    ef.Encrypt,
    ef.EncryptionKeyID,
    ef.AllowDecryptInAPI,
    ef.SendEncryptedValue,
    -- Computed field
    [${flyway:defaultSchema}].GetProgrammaticName(REPLACE(ef.Name,' ','')) AS FieldCodeName,
    -- Entity info
    e.Name Entity,
    e.SchemaName,
    e.BaseTable,
    e.BaseView,
    e.CodeName EntityCodeName,
    e.ClassName EntityClassName,
    -- Related entity info
    re.Name RelatedEntity,
    re.SchemaName RelatedEntitySchemaName,
    re.BaseTable RelatedEntityBaseTable,
    re.BaseView RelatedEntityBaseView,
    re.CodeName RelatedEntityCodeName,
    re.ClassName RelatedEntityClassName,
    -- Soft PK/FK flags (at end to preserve existing sequence numbers)
    ef.IsSoftPrimaryKey,
    ef.IsSoftForeignKey
FROM
    [${flyway:defaultSchema}].EntityField ef
INNER JOIN
    [${flyway:defaultSchema}].vwEntities e ON ef.EntityID = e.ID
LEFT OUTER JOIN
    [${flyway:defaultSchema}].vwEntities re ON ef.RelatedEntityID = re.ID;
GO

-- Update spUpdateExistingEntityFieldsFromSchema to respect IsSoftForeignKey flag
-- When IsSoftForeignKey = 1, do not overwrite RelatedEntityID/RelatedEntityFieldName
ALTER PROC [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema]
    @ExcludedSchemaNames NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    -- Step 1: Parse the excluded schema names into a table variable
    DECLARE @ExcludedSchemas TABLE (SchemaName NVARCHAR(255));
    INSERT INTO @ExcludedSchemas(SchemaName)
    SELECT TRIM(value) FROM STRING_SPLIT(@ExcludedSchemaNames, ',');

    -- Step 2: Declare a table variable to store filtered rows
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
        Sequence INT,
        RelatedEntityID UNIQUEIDENTIFIER,
        RelatedEntityFieldName NVARCHAR(255),
        IsPrimaryKey BIT,
        IsUnique BIT,
        IsSoftForeignKey BIT
    );

    -- Step 3: Populate the table variable with filtered rows
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
        fromSQL.Sequence,
        re.ID AS RelatedEntityID,
        fk.referenced_column AS RelatedEntityFieldName,
        CASE WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END AS IsPrimaryKey,
        CASE
            WHEN pk.ColumnName IS NOT NULL THEN 1
            ELSE CASE WHEN uk.ColumnName IS NOT NULL THEN 1 ELSE 0 END
        END AS IsUnique,
        ef.IsSoftForeignKey
    FROM
        [${flyway:defaultSchema}].EntityField ef
    INNER JOIN
        vwSQLColumnsAndEntityFields fromSQL
    ON
        ef.EntityID = fromSQL.EntityID AND
        ef.Name = fromSQL.FieldName
    INNER JOIN
        [${flyway:defaultSchema}].Entity e
    ON
        ef.EntityID = e.ID
    LEFT OUTER JOIN
        vwForeignKeys fk
    ON
        ef.Name = fk.[column] AND
        e.BaseTable = fk.[table] AND
        e.SchemaName = fk.[schema_name]
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].Entity re -- Related Entity
    ON
        re.BaseTable = fk.referenced_table AND
        re.SchemaName = fk.[referenced_schema]
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].vwTablePrimaryKeys pk
    ON
        e.BaseTable = pk.TableName AND
        ef.Name = pk.ColumnName AND
        e.SchemaName = pk.SchemaName
    LEFT OUTER JOIN
        [${flyway:defaultSchema}].vwTableUniqueKeys uk
    ON
        e.BaseTable = uk.TableName AND
        ef.Name = uk.ColumnName AND
        e.SchemaName = uk.SchemaName
    LEFT OUTER JOIN
        @ExcludedSchemas excludedSchemas
    ON
        e.SchemaName = excludedSchemas.SchemaName
    WHERE
        e.VirtualEntity = 0
        AND excludedSchemas.SchemaName IS NULL -- Only include non-excluded schemas
        AND ef.ID IS NOT NULL -- Only where we have already created EntityField records
        AND (
          -- this large filtering block includes ONLY the rows that have changes
          ISNULL(LTRIM(RTRIM(ef.Description)), '') <> ISNULL(LTRIM(RTRIM(IIF(ef.AutoUpdateDescription=1, CONVERT(NVARCHAR(MAX), fromSQL.Description), ef.Description))), '') OR
          ef.Type <> fromSQL.Type OR
          ef.Length <> fromSQL.Length OR
          ef.Precision <> fromSQL.Precision OR
          ef.Scale <> fromSQL.Scale OR
          ef.AllowsNull <> fromSQL.AllowsNull OR
          ISNULL(LTRIM(RTRIM(ef.DefaultValue)), '') <> ISNULL(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), fromSQL.DefaultValue))), '') OR
          ef.AutoIncrement <> fromSQL.AutoIncrement OR
          ef.IsVirtual <> fromSQL.IsVirtual OR
          ef.Sequence <> fromSQL.Sequence OR
          -- Only check FK changes if NOT a soft FK (IsSoftForeignKey = 0)
          (ef.IsSoftForeignKey = 0 AND (
              ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, ef.RelatedEntityID), '00000000-0000-0000-0000-000000000000') <> ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, re.ID), '00000000-0000-0000-0000-000000000000') OR
              ISNULL(LTRIM(RTRIM(ef.RelatedEntityFieldName)), '') <> ISNULL(LTRIM(RTRIM(fk.referenced_column)), '')
          )) OR
          ef.IsPrimaryKey <> CASE WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END OR
          ef.IsUnique <> CASE
              WHEN pk.ColumnName IS NOT NULL THEN 1
              ELSE CASE WHEN uk.ColumnName IS NOT NULL THEN 1 ELSE 0 END
          END
        );

    -- Step 4: Perform the update using the table variable
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
        ef.Sequence = fr.Sequence,
        -- Only update FK fields if NOT a soft FK AND AutoUpdateRelatedEntityInfo is on
        ef.RelatedEntityID = IIF(ef.IsSoftForeignKey = 1, ef.RelatedEntityID, IIF(ef.AutoUpdateRelatedEntityInfo = 1, fr.RelatedEntityID, ef.RelatedEntityID)),
        ef.RelatedEntityFieldName = IIF(ef.IsSoftForeignKey = 1, ef.RelatedEntityFieldName, IIF(ef.AutoUpdateRelatedEntityInfo = 1, fr.RelatedEntityFieldName, ef.RelatedEntityFieldName)),
        ef.IsPrimaryKey = fr.IsPrimaryKey,
        ef.IsUnique = fr.IsUnique,
        ef.__mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].EntityField ef
    INNER JOIN
        @FilteredRows fr
    ON
        ef.ID = fr.EntityFieldID;

    -- Step 5: Return the modified rows
    SELECT * FROM @FilteredRows;
END
GO
