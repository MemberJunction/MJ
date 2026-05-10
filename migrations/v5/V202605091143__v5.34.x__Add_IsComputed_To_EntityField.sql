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
-- the other catalog-derived columns. The body merges two prior versions:
--   - v5.30 scoped form (V202604261352__v5.30.x__Scoped_EntityField_SPs.sql) — the
--     @EntityIDs parameter and @ScopedEntityIDs / @IsScoped block CodeGen's Pass 2
--     relies on for entity-scoped runs (see manage-metadata.ts:3373).
--   - v5.0 baseline body — full schema scan when @EntityIDs is NULL/empty.
-- Plus four IsComputed additions on top of the v5.30 form:
--   - @FilteredRows table variable: add IsComputed BIT
--   - INSERT ... SELECT: add fromSQL.IsComputed
--   - WHERE change-detection: add ef.IsComputed <> fromSQL.IsComputed
--   - UPDATE: set ef.IsComputed = fr.IsComputed
DROP PROC IF EXISTS [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema]
GO
CREATE PROC [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema]
    @ExcludedSchemaNames NVARCHAR(MAX),
    @EntityIDs NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ExcludedSchemas TABLE (SchemaName NVARCHAR(255));
    INSERT INTO @ExcludedSchemas(SchemaName)
    SELECT TRIM(value) FROM STRING_SPLIT(@ExcludedSchemaNames, ',');

    -- Materialize the optional entity scope list once (see spDeleteUnneededEntityFields
    -- header comment in V202604261352 for rationale). @IsScoped collapses the WHERE
    -- branch to a cheap int compare on the unscoped path.
    DECLARE @ScopedEntityIDs TABLE (EntityID UNIQUEIDENTIFIER PRIMARY KEY);
    DECLARE @IsScoped BIT = 0;
    IF @EntityIDs IS NOT NULL AND LEN(@EntityIDs) > 0
    BEGIN
        INSERT INTO @ScopedEntityIDs (EntityID)
        SELECT DISTINCT TRY_CONVERT(UNIQUEIDENTIFIER, LTRIM(RTRIM(value)))
        FROM STRING_SPLIT(@EntityIDs, ',')
        WHERE LTRIM(RTRIM(value)) <> ''
          AND TRY_CONVERT(UNIQUEIDENTIFIER, LTRIM(RTRIM(value))) IS NOT NULL;
        IF EXISTS (SELECT 1 FROM @ScopedEntityIDs) SET @IsScoped = 1;
    END

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
        AND (@IsScoped = 0 OR e.ID IN (SELECT EntityID FROM @ScopedEntityIDs)) -- scoped run: only listed entities
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










/* Codegen Script */

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b6ad8443-7319-451f-8e3e-a586cebe87eb' OR (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IsComputed')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b6ad8443-7319-451f-8e3e-a586cebe87eb',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Fields
            100141,
            'IsComputed',
            'Is Computed',
            'When 1, this field is a SQL Server computed column or PostgreSQL generated column — physically present in the base table but read-only at the SQL layer. Distinct from IsVirtual, which means the column is not in the base table at all (e.g., joined name lookups in the base view). A computed column has both IsVirtual=1 (read-only at the API layer) and IsComputed=1 (physically in the table). The difference matters for base-view JOIN target selection: when an FK''s related Name Field is computed, the generated view joins to the related entity''s base table instead of its view.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert entity field value with ID c01acf62-cab6-4617-8df6-787ef9f8fb4f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('c01acf62-cab6-4617-8df6-787ef9f8fb4f', 'A261204E-3866-41B3-92EB-784C74D2F906', 1, 'BeginsWith', 'BeginsWith', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 209a1857-c326-4704-bd07-241230c9760f */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('209a1857-c326-4704-bd07-241230c9760f', 'A261204E-3866-41B3-92EB-784C74D2F906', 2, 'Contains', 'Contains', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 51719ae9-cf64-47eb-96b1-8e3ce002098b */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('51719ae9-cf64-47eb-96b1-8e3ce002098b', 'A261204E-3866-41B3-92EB-784C74D2F906', 3, 'EndsWith', 'EndsWith', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 3c28291f-27ab-4120-ab5b-8f344f096362 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('3c28291f-27ab-4120-ab5b-8f344f096362', 'A261204E-3866-41B3-92EB-784C74D2F906', 4, 'Exact', 'Exact', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID A261204E-3866-41B3-92EB-784C74D2F906 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='A261204E-3866-41B3-92EB-784C74D2F906';

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField]
    @ID uniqueidentifier = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @AutoUpdateDescription bit = NULL,
    @IsPrimaryKey bit = NULL,
    @IsUnique bit = NULL,
    @Category_Clear bit = 0,
    @Category nvarchar(255) = NULL,
    @ValueListType nvarchar(20) = NULL,
    @ExtendedType_Clear bit = 0,
    @ExtendedType nvarchar(50) = NULL,
    @CodeType_Clear bit = 0,
    @CodeType nvarchar(50) = NULL,
    @DefaultInView bit = NULL,
    @ViewCellTemplate_Clear bit = 0,
    @ViewCellTemplate nvarchar(MAX) = NULL,
    @DefaultColumnWidth_Clear bit = 0,
    @DefaultColumnWidth int = NULL,
    @AllowUpdateAPI bit = NULL,
    @AllowUpdateInView bit = NULL,
    @IncludeInUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @UserSearchParamFormatAPI_Clear bit = 0,
    @UserSearchParamFormatAPI nvarchar(500) = NULL,
    @IncludeInGeneratedForm bit = NULL,
    @GeneratedFormSection nvarchar(10) = NULL,
    @IsNameField bit = NULL,
    @RelatedEntityID_Clear bit = 0,
    @RelatedEntityID uniqueidentifier = NULL,
    @RelatedEntityFieldName_Clear bit = 0,
    @RelatedEntityFieldName nvarchar(255) = NULL,
    @IncludeRelatedEntityNameFieldInBaseView bit = NULL,
    @RelatedEntityNameFieldMap_Clear bit = 0,
    @RelatedEntityNameFieldMap nvarchar(255) = NULL,
    @RelatedEntityDisplayType nvarchar(20) = NULL,
    @EntityIDFieldName_Clear bit = 0,
    @EntityIDFieldName nvarchar(100) = NULL,
    @ScopeDefault_Clear bit = 0,
    @ScopeDefault nvarchar(100) = NULL,
    @AutoUpdateRelatedEntityInfo bit = NULL,
    @ValuesToPackWithSchema nvarchar(10) = NULL,
    @Status nvarchar(25) = NULL,
    @AutoUpdateIsNameField bit = NULL,
    @AutoUpdateDefaultInView bit = NULL,
    @AutoUpdateCategory bit = NULL,
    @AutoUpdateDisplayName bit = NULL,
    @AutoUpdateIncludeInUserSearchAPI bit = NULL,
    @Encrypt bit = NULL,
    @EncryptionKeyID_Clear bit = 0,
    @EncryptionKeyID uniqueidentifier = NULL,
    @AllowDecryptInAPI bit = NULL,
    @SendEncryptedValue bit = NULL,
    @IsSoftPrimaryKey bit = NULL,
    @IsSoftForeignKey bit = NULL,
    @RelatedEntityJoinFields_Clear bit = 0,
    @RelatedEntityJoinFields nvarchar(MAX) = NULL,
    @JSONType_Clear bit = 0,
    @JSONType nvarchar(255) = NULL,
    @JSONTypeIsArray bit = NULL,
    @JSONTypeDefinition_Clear bit = 0,
    @JSONTypeDefinition nvarchar(MAX) = NULL,
    @UserSearchPredicateAPI nvarchar(20) = NULL,
    @AutoUpdateUserSearchPredicate bit = NULL,
    @AutoUpdateFullTextSearch bit = NULL,
    @AutoUpdateExtendedType bit = NULL,
    @IsComputed bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityField]
            (
                [ID],
                [DisplayName],
                [Description],
                [AutoUpdateDescription],
                [IsPrimaryKey],
                [IsUnique],
                [Category],
                [ValueListType],
                [ExtendedType],
                [CodeType],
                [DefaultInView],
                [ViewCellTemplate],
                [DefaultColumnWidth],
                [AllowUpdateAPI],
                [AllowUpdateInView],
                [IncludeInUserSearchAPI],
                [FullTextSearchEnabled],
                [UserSearchParamFormatAPI],
                [IncludeInGeneratedForm],
                [GeneratedFormSection],
                [IsNameField],
                [RelatedEntityID],
                [RelatedEntityFieldName],
                [IncludeRelatedEntityNameFieldInBaseView],
                [RelatedEntityNameFieldMap],
                [RelatedEntityDisplayType],
                [EntityIDFieldName],
                [ScopeDefault],
                [AutoUpdateRelatedEntityInfo],
                [ValuesToPackWithSchema],
                [Status],
                [AutoUpdateIsNameField],
                [AutoUpdateDefaultInView],
                [AutoUpdateCategory],
                [AutoUpdateDisplayName],
                [AutoUpdateIncludeInUserSearchAPI],
                [Encrypt],
                [EncryptionKeyID],
                [AllowDecryptInAPI],
                [SendEncryptedValue],
                [IsSoftPrimaryKey],
                [IsSoftForeignKey],
                [RelatedEntityJoinFields],
                [JSONType],
                [JSONTypeIsArray],
                [JSONTypeDefinition],
                [UserSearchPredicateAPI],
                [AutoUpdateUserSearchPredicate],
                [AutoUpdateFullTextSearch],
                [AutoUpdateExtendedType],
                [IsComputed]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, NULL) END,
                ISNULL(@ValueListType, 'None'),
                CASE WHEN @ExtendedType_Clear = 1 THEN NULL ELSE ISNULL(@ExtendedType, NULL) END,
                CASE WHEN @CodeType_Clear = 1 THEN NULL ELSE ISNULL(@CodeType, NULL) END,
                ISNULL(@DefaultInView, 0),
                CASE WHEN @ViewCellTemplate_Clear = 1 THEN NULL ELSE ISNULL(@ViewCellTemplate, NULL) END,
                CASE WHEN @DefaultColumnWidth_Clear = 1 THEN NULL ELSE ISNULL(@DefaultColumnWidth, NULL) END,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                CASE WHEN @UserSearchParamFormatAPI_Clear = 1 THEN NULL ELSE ISNULL(@UserSearchParamFormatAPI, NULL) END,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                CASE WHEN @RelatedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityID, NULL) END,
                CASE WHEN @RelatedEntityFieldName_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityFieldName, NULL) END,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                CASE WHEN @RelatedEntityNameFieldMap_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityNameFieldMap, NULL) END,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                CASE WHEN @EntityIDFieldName_Clear = 1 THEN NULL ELSE ISNULL(@EntityIDFieldName, NULL) END,
                CASE WHEN @ScopeDefault_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDefault, NULL) END,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                CASE WHEN @EncryptionKeyID_Clear = 1 THEN NULL ELSE ISNULL(@EncryptionKeyID, NULL) END,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0),
                ISNULL(@IsSoftPrimaryKey, 0),
                ISNULL(@IsSoftForeignKey, 0),
                CASE WHEN @RelatedEntityJoinFields_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityJoinFields, NULL) END,
                CASE WHEN @JSONType_Clear = 1 THEN NULL ELSE ISNULL(@JSONType, NULL) END,
                ISNULL(@JSONTypeIsArray, 0),
                CASE WHEN @JSONTypeDefinition_Clear = 1 THEN NULL ELSE ISNULL(@JSONTypeDefinition, NULL) END,
                ISNULL(@UserSearchPredicateAPI, 'Contains'),
                ISNULL(@AutoUpdateUserSearchPredicate, 1),
                ISNULL(@AutoUpdateFullTextSearch, 1),
                ISNULL(@AutoUpdateExtendedType, 1),
                ISNULL(@IsComputed, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityField]
            (
                [DisplayName],
                [Description],
                [AutoUpdateDescription],
                [IsPrimaryKey],
                [IsUnique],
                [Category],
                [ValueListType],
                [ExtendedType],
                [CodeType],
                [DefaultInView],
                [ViewCellTemplate],
                [DefaultColumnWidth],
                [AllowUpdateAPI],
                [AllowUpdateInView],
                [IncludeInUserSearchAPI],
                [FullTextSearchEnabled],
                [UserSearchParamFormatAPI],
                [IncludeInGeneratedForm],
                [GeneratedFormSection],
                [IsNameField],
                [RelatedEntityID],
                [RelatedEntityFieldName],
                [IncludeRelatedEntityNameFieldInBaseView],
                [RelatedEntityNameFieldMap],
                [RelatedEntityDisplayType],
                [EntityIDFieldName],
                [ScopeDefault],
                [AutoUpdateRelatedEntityInfo],
                [ValuesToPackWithSchema],
                [Status],
                [AutoUpdateIsNameField],
                [AutoUpdateDefaultInView],
                [AutoUpdateCategory],
                [AutoUpdateDisplayName],
                [AutoUpdateIncludeInUserSearchAPI],
                [Encrypt],
                [EncryptionKeyID],
                [AllowDecryptInAPI],
                [SendEncryptedValue],
                [IsSoftPrimaryKey],
                [IsSoftForeignKey],
                [RelatedEntityJoinFields],
                [JSONType],
                [JSONTypeIsArray],
                [JSONTypeDefinition],
                [UserSearchPredicateAPI],
                [AutoUpdateUserSearchPredicate],
                [AutoUpdateFullTextSearch],
                [AutoUpdateExtendedType],
                [IsComputed]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, NULL) END,
                ISNULL(@ValueListType, 'None'),
                CASE WHEN @ExtendedType_Clear = 1 THEN NULL ELSE ISNULL(@ExtendedType, NULL) END,
                CASE WHEN @CodeType_Clear = 1 THEN NULL ELSE ISNULL(@CodeType, NULL) END,
                ISNULL(@DefaultInView, 0),
                CASE WHEN @ViewCellTemplate_Clear = 1 THEN NULL ELSE ISNULL(@ViewCellTemplate, NULL) END,
                CASE WHEN @DefaultColumnWidth_Clear = 1 THEN NULL ELSE ISNULL(@DefaultColumnWidth, NULL) END,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                CASE WHEN @UserSearchParamFormatAPI_Clear = 1 THEN NULL ELSE ISNULL(@UserSearchParamFormatAPI, NULL) END,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                CASE WHEN @RelatedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityID, NULL) END,
                CASE WHEN @RelatedEntityFieldName_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityFieldName, NULL) END,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                CASE WHEN @RelatedEntityNameFieldMap_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityNameFieldMap, NULL) END,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                CASE WHEN @EntityIDFieldName_Clear = 1 THEN NULL ELSE ISNULL(@EntityIDFieldName, NULL) END,
                CASE WHEN @ScopeDefault_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDefault, NULL) END,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                CASE WHEN @EncryptionKeyID_Clear = 1 THEN NULL ELSE ISNULL(@EncryptionKeyID, NULL) END,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0),
                ISNULL(@IsSoftPrimaryKey, 0),
                ISNULL(@IsSoftForeignKey, 0),
                CASE WHEN @RelatedEntityJoinFields_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityJoinFields, NULL) END,
                CASE WHEN @JSONType_Clear = 1 THEN NULL ELSE ISNULL(@JSONType, NULL) END,
                ISNULL(@JSONTypeIsArray, 0),
                CASE WHEN @JSONTypeDefinition_Clear = 1 THEN NULL ELSE ISNULL(@JSONTypeDefinition, NULL) END,
                ISNULL(@UserSearchPredicateAPI, 'Contains'),
                ISNULL(@AutoUpdateUserSearchPredicate, 1),
                ISNULL(@AutoUpdateFullTextSearch, 1),
                ISNULL(@AutoUpdateExtendedType, 1),
                ISNULL(@IsComputed, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spUpdateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityField]
    @ID uniqueidentifier,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @AutoUpdateDescription bit = NULL,
    @IsPrimaryKey bit = NULL,
    @IsUnique bit = NULL,
    @Category_Clear bit = 0,
    @Category nvarchar(255) = NULL,
    @ValueListType nvarchar(20) = NULL,
    @ExtendedType_Clear bit = 0,
    @ExtendedType nvarchar(50) = NULL,
    @CodeType_Clear bit = 0,
    @CodeType nvarchar(50) = NULL,
    @DefaultInView bit = NULL,
    @ViewCellTemplate_Clear bit = 0,
    @ViewCellTemplate nvarchar(MAX) = NULL,
    @DefaultColumnWidth_Clear bit = 0,
    @DefaultColumnWidth int = NULL,
    @AllowUpdateAPI bit = NULL,
    @AllowUpdateInView bit = NULL,
    @IncludeInUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @UserSearchParamFormatAPI_Clear bit = 0,
    @UserSearchParamFormatAPI nvarchar(500) = NULL,
    @IncludeInGeneratedForm bit = NULL,
    @GeneratedFormSection nvarchar(10) = NULL,
    @IsNameField bit = NULL,
    @RelatedEntityID_Clear bit = 0,
    @RelatedEntityID uniqueidentifier = NULL,
    @RelatedEntityFieldName_Clear bit = 0,
    @RelatedEntityFieldName nvarchar(255) = NULL,
    @IncludeRelatedEntityNameFieldInBaseView bit = NULL,
    @RelatedEntityNameFieldMap_Clear bit = 0,
    @RelatedEntityNameFieldMap nvarchar(255) = NULL,
    @RelatedEntityDisplayType nvarchar(20) = NULL,
    @EntityIDFieldName_Clear bit = 0,
    @EntityIDFieldName nvarchar(100) = NULL,
    @ScopeDefault_Clear bit = 0,
    @ScopeDefault nvarchar(100) = NULL,
    @AutoUpdateRelatedEntityInfo bit = NULL,
    @ValuesToPackWithSchema nvarchar(10) = NULL,
    @Status nvarchar(25) = NULL,
    @AutoUpdateIsNameField bit = NULL,
    @AutoUpdateDefaultInView bit = NULL,
    @AutoUpdateCategory bit = NULL,
    @AutoUpdateDisplayName bit = NULL,
    @AutoUpdateIncludeInUserSearchAPI bit = NULL,
    @Encrypt bit = NULL,
    @EncryptionKeyID_Clear bit = 0,
    @EncryptionKeyID uniqueidentifier = NULL,
    @AllowDecryptInAPI bit = NULL,
    @SendEncryptedValue bit = NULL,
    @IsSoftPrimaryKey bit = NULL,
    @IsSoftForeignKey bit = NULL,
    @RelatedEntityJoinFields_Clear bit = 0,
    @RelatedEntityJoinFields nvarchar(MAX) = NULL,
    @JSONType_Clear bit = 0,
    @JSONType nvarchar(255) = NULL,
    @JSONTypeIsArray bit = NULL,
    @JSONTypeDefinition_Clear bit = 0,
    @JSONTypeDefinition nvarchar(MAX) = NULL,
    @UserSearchPredicateAPI nvarchar(20) = NULL,
    @AutoUpdateUserSearchPredicate bit = NULL,
    @AutoUpdateFullTextSearch bit = NULL,
    @AutoUpdateExtendedType bit = NULL,
    @IsComputed bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        [DisplayName] = CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, [DisplayName]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [AutoUpdateDescription] = ISNULL(@AutoUpdateDescription, [AutoUpdateDescription]),
        [IsPrimaryKey] = ISNULL(@IsPrimaryKey, [IsPrimaryKey]),
        [IsUnique] = ISNULL(@IsUnique, [IsUnique]),
        [Category] = CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, [Category]) END,
        [ValueListType] = ISNULL(@ValueListType, [ValueListType]),
        [ExtendedType] = CASE WHEN @ExtendedType_Clear = 1 THEN NULL ELSE ISNULL(@ExtendedType, [ExtendedType]) END,
        [CodeType] = CASE WHEN @CodeType_Clear = 1 THEN NULL ELSE ISNULL(@CodeType, [CodeType]) END,
        [DefaultInView] = ISNULL(@DefaultInView, [DefaultInView]),
        [ViewCellTemplate] = CASE WHEN @ViewCellTemplate_Clear = 1 THEN NULL ELSE ISNULL(@ViewCellTemplate, [ViewCellTemplate]) END,
        [DefaultColumnWidth] = CASE WHEN @DefaultColumnWidth_Clear = 1 THEN NULL ELSE ISNULL(@DefaultColumnWidth, [DefaultColumnWidth]) END,
        [AllowUpdateAPI] = ISNULL(@AllowUpdateAPI, [AllowUpdateAPI]),
        [AllowUpdateInView] = ISNULL(@AllowUpdateInView, [AllowUpdateInView]),
        [IncludeInUserSearchAPI] = ISNULL(@IncludeInUserSearchAPI, [IncludeInUserSearchAPI]),
        [FullTextSearchEnabled] = ISNULL(@FullTextSearchEnabled, [FullTextSearchEnabled]),
        [UserSearchParamFormatAPI] = CASE WHEN @UserSearchParamFormatAPI_Clear = 1 THEN NULL ELSE ISNULL(@UserSearchParamFormatAPI, [UserSearchParamFormatAPI]) END,
        [IncludeInGeneratedForm] = ISNULL(@IncludeInGeneratedForm, [IncludeInGeneratedForm]),
        [GeneratedFormSection] = ISNULL(@GeneratedFormSection, [GeneratedFormSection]),
        [IsNameField] = ISNULL(@IsNameField, [IsNameField]),
        [RelatedEntityID] = CASE WHEN @RelatedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityID, [RelatedEntityID]) END,
        [RelatedEntityFieldName] = CASE WHEN @RelatedEntityFieldName_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityFieldName, [RelatedEntityFieldName]) END,
        [IncludeRelatedEntityNameFieldInBaseView] = ISNULL(@IncludeRelatedEntityNameFieldInBaseView, [IncludeRelatedEntityNameFieldInBaseView]),
        [RelatedEntityNameFieldMap] = CASE WHEN @RelatedEntityNameFieldMap_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityNameFieldMap, [RelatedEntityNameFieldMap]) END,
        [RelatedEntityDisplayType] = ISNULL(@RelatedEntityDisplayType, [RelatedEntityDisplayType]),
        [EntityIDFieldName] = CASE WHEN @EntityIDFieldName_Clear = 1 THEN NULL ELSE ISNULL(@EntityIDFieldName, [EntityIDFieldName]) END,
        [ScopeDefault] = CASE WHEN @ScopeDefault_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDefault, [ScopeDefault]) END,
        [AutoUpdateRelatedEntityInfo] = ISNULL(@AutoUpdateRelatedEntityInfo, [AutoUpdateRelatedEntityInfo]),
        [ValuesToPackWithSchema] = ISNULL(@ValuesToPackWithSchema, [ValuesToPackWithSchema]),
        [Status] = ISNULL(@Status, [Status]),
        [AutoUpdateIsNameField] = ISNULL(@AutoUpdateIsNameField, [AutoUpdateIsNameField]),
        [AutoUpdateDefaultInView] = ISNULL(@AutoUpdateDefaultInView, [AutoUpdateDefaultInView]),
        [AutoUpdateCategory] = ISNULL(@AutoUpdateCategory, [AutoUpdateCategory]),
        [AutoUpdateDisplayName] = ISNULL(@AutoUpdateDisplayName, [AutoUpdateDisplayName]),
        [AutoUpdateIncludeInUserSearchAPI] = ISNULL(@AutoUpdateIncludeInUserSearchAPI, [AutoUpdateIncludeInUserSearchAPI]),
        [Encrypt] = ISNULL(@Encrypt, [Encrypt]),
        [EncryptionKeyID] = CASE WHEN @EncryptionKeyID_Clear = 1 THEN NULL ELSE ISNULL(@EncryptionKeyID, [EncryptionKeyID]) END,
        [AllowDecryptInAPI] = ISNULL(@AllowDecryptInAPI, [AllowDecryptInAPI]),
        [SendEncryptedValue] = ISNULL(@SendEncryptedValue, [SendEncryptedValue]),
        [IsSoftPrimaryKey] = ISNULL(@IsSoftPrimaryKey, [IsSoftPrimaryKey]),
        [IsSoftForeignKey] = ISNULL(@IsSoftForeignKey, [IsSoftForeignKey]),
        [RelatedEntityJoinFields] = CASE WHEN @RelatedEntityJoinFields_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityJoinFields, [RelatedEntityJoinFields]) END,
        [JSONType] = CASE WHEN @JSONType_Clear = 1 THEN NULL ELSE ISNULL(@JSONType, [JSONType]) END,
        [JSONTypeIsArray] = ISNULL(@JSONTypeIsArray, [JSONTypeIsArray]),
        [JSONTypeDefinition] = CASE WHEN @JSONTypeDefinition_Clear = 1 THEN NULL ELSE ISNULL(@JSONTypeDefinition, [JSONTypeDefinition]) END,
        [UserSearchPredicateAPI] = ISNULL(@UserSearchPredicateAPI, [UserSearchPredicateAPI]),
        [AutoUpdateUserSearchPredicate] = ISNULL(@AutoUpdateUserSearchPredicate, [AutoUpdateUserSearchPredicate]),
        [AutoUpdateFullTextSearch] = ISNULL(@AutoUpdateFullTextSearch, [AutoUpdateFullTextSearch]),
        [AutoUpdateExtendedType] = ISNULL(@AutoUpdateExtendedType, [AutoUpdateExtendedType]),
        [IsComputed] = ISNULL(@IsComputed, [IsComputed])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityFields] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityFields]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityField table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityField]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityField];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityField
ON [${flyway:defaultSchema}].[EntityField]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityField] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer];

/* spDelete SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spDeleteEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityField]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityField]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer];

GO

/* Set categories for 77 fields */

-- UPDATE Entity Field Category Info MJ: Entity Fields.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '414D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FA5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Field Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FC5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IsPrimaryKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '754317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IsUnique 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5E4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoIncrement 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '045817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IsVirtual 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '075817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IsSoftPrimaryKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F31790E1-FAA3-425A-B020-AEACAFCB2B6E' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IsSoftForeignKey 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5203089E-9FFC-4BB7-B23C-91F2555504D1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.FieldCodeName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '07AD23D5-DEBD-4657-8E3C-7F1F1342BCE3' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IsComputed 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Identification & Keys',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B6AD8443-7319-451F-8E3E-A586CEBE87EB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FB5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FD5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FE5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateDescription 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '044417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Category 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F24217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.DefaultInView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '065817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.ViewCellTemplate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F34217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.DefaultColumnWidth 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5C4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AllowUpdateInView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F44217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IncludeInGeneratedForm 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Include In Form',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F54217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.GeneratedFormSection 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Form Section',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F64217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityDisplayType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F05717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.ScopeDefault 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0C2449FB-1BDA-4BE9-A059-7224C05A14B9' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateDisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '8486168A-5082-48DC-BE13-EF53F49922CB' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'SQL Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FF5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Length 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '005817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Precision 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '015817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Scale 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '025817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AllowsNull 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '035817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.DefaultValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D74217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.ValueListType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C64D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.ExtendedType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '055817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.CodeType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'TypeScript'
WHERE 
   ID = 'B04C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AllowUpdateAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '404F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IncludeInUserSearchAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Include In Search',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '424F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.FullTextSearchEnabled 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5E4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.UserSearchParamFormatAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '434F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IsNameField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B64217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateIncludeInUserSearchAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9E1D732F-E33E-40FE-AFAD-477623AC9DEA' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.JSONType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D97C0BEC-3B59-4BA2-BAB5-432944AD257B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.JSONTypeIsArray 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'JSON Is Array',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B94F8690-5226-48A9-9C89-4549F141FBB7' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.JSONTypeDefinition 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'TypeScript'
WHERE 
   ID = '1187C2FF-0226-4790-8D0D-036D9F8A15C1' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.UserSearchPredicateAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Search Predicate',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A261204E-3866-41B3-92EB-784C74D2F906' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '954D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityFieldName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B74217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.IncludeRelatedEntityNameFieldInBaseView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '974D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityNameFieldMap 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F74217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.EntityIDFieldName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '35A18EA5-5641-EF11-86C3-00224821D189' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateRelatedEntityInfo 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'FFC3C691-2E33-46D0-B11C-AB348997E08C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityJoinFields 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Join Fields',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EE0B81ED-767A-4BCE-9E6E-E4E48711B482' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B84217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntitySchemaName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9B4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityBaseTable 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Entity Base Table',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9C4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityBaseView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Entity Base View',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9D4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityCodeName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9E4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.RelatedEntityClassName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9F4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Encrypt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '04C52058-4E01-4316-ABAE-9958AFB71B5C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.EncryptionKeyID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B24D31A6-A3BE-449C-9FE7-98C87E40DA55' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AllowDecryptInAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7C097F3D-79AC-4144-A3B6-A8BFF64EDF3C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.SendEncryptedValue 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '901EE131-BC99-4B80-B5E5-D974057EEA8A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CE5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CF5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.ValuesToPackWithSchema 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Values To Pack',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '20818E34-47E7-4371-A51E-3D29BCC4B4B8' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '407A96C8-580A-4427-BEED-ABB46F015586' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateIsNameField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Auto Update Name Field',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5EFD956B-0DB1-491B-9153-0891A7B1835D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateDefaultInView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Auto Update View Default',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E9707755-1A43-4DE3-815D-37E41CA7C7D0' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateCategory 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D64DD327-8057-4DF5-A24C-F951932C1A26' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateUserSearchPredicate 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '292A1BED-3CA2-4C24-8B8E-CAB2A4B2125C' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateFullTextSearch 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Auto Update Full Text',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C3CAF473-D086-44CF-AD6C-99A5CCA926DD' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.AutoUpdateExtendedType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '58A3A9F6-EE7A-409F-BF3D-AD34C153B84A' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '584D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.SchemaName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BA4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.BaseTable 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '594D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.BaseView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5A4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.EntityCodeName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A04D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Entity Fields.EntityClassName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B94217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntityFields';
GO