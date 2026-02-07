-- Add soft PK/FK flag columns to EntityField
ALTER TABLE [${flyway:defaultSchema}].[EntityField] ADD
    [IsSoftPrimaryKey] BIT NOT NULL DEFAULT 0,
    [IsSoftForeignKey] BIT NOT NULL DEFAULT 0;
GO

-- Add extended properties (descriptions)
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, indicates IsPrimaryKey was set via metadata (not a database constraint). Protects IsPrimaryKey from being cleared by schema sync.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'IsSoftPrimaryKey';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, indicates RelatedEntityID/RelatedEntityFieldName were set via metadata (not a database constraint). Protects these fields from being cleared by schema sync.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'IsSoftForeignKey';
GO

-- Update spUpdateExistingEntityFieldsFromSchema to respect soft PK/FK flags
ALTER PROC [${flyway:defaultSchema}].[spUpdateExistingEntityFieldsFromSchema]
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
          ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, ef.RelatedEntityID), '00000000-0000-0000-0000-000000000000') <> ISNULL(TRY_CONVERT(UNIQUEIDENTIFIER, re.ID), '00000000-0000-0000-0000-000000000000') OR -- Use TRY_CONVERT here
          ISNULL(LTRIM(RTRIM(ef.RelatedEntityFieldName)), '') <> ISNULL(LTRIM(RTRIM(fk.referenced_column)), '') OR
          ef.IsPrimaryKey <> CASE WHEN pk.ColumnName IS NOT NULL THEN 1 ELSE 0 END OR
          ef.IsUnique <> CASE
              WHEN pk.ColumnName IS NOT NULL THEN 1
              ELSE CASE WHEN uk.ColumnName IS NOT NULL THEN 1 ELSE 0 END
          END
        );

    -- Perform the update using the table variable
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
        -- Protect soft FKs: don't overwrite if IsSoftForeignKey=1
        ef.RelatedEntityID = IIF(ef.AutoUpdateRelatedEntityInfo = 1 AND ef.IsSoftForeignKey = 0, fr.RelatedEntityID, ef.RelatedEntityID),
        ef.RelatedEntityFieldName = IIF(ef.AutoUpdateRelatedEntityInfo = 1 AND ef.IsSoftForeignKey = 0, fr.RelatedEntityFieldName, ef.RelatedEntityFieldName),
        -- Protect soft PKs: don't overwrite if IsSoftPrimaryKey=1
        ef.IsPrimaryKey = IIF(ef.IsSoftPrimaryKey = 0, fr.IsPrimaryKey, ef.IsPrimaryKey),
        ef.IsUnique = fr.IsUnique,
        ef.__mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].EntityField ef
    INNER JOIN
        @FilteredRows fr
    ON
        ef.ID = fr.EntityFieldID;

    -- Return the modified rows
    SELECT * FROM @FilteredRows;
END;
GO



/*
  Migration: Add RelatedEntityJoinFields column to EntityField table

  Purpose: Enables configuration of additional fields to join from related entities
  into base views, extending or overriding the default NameField behavior.

  JSON Schema:
  {
    "mode": "extend" | "override" | "disable",
    "fields": [
      { "field": "FieldName", "alias": "OptionalAlias" }
    ]
  }
*/

-- Add the new column
ALTER TABLE ${flyway:defaultSchema}.EntityField
ADD RelatedEntityJoinFields NVARCHAR(MAX) NULL;
GO

-- Add extended property documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON configuration for additional fields to join from the related entity into this entity''s base view. Supports modes: extend (add to NameField), override (replace NameField), disable (no joins). Schema: { mode?: string, fields?: [{ field: string, alias?: string }] }',
    @level0type = N'SCHEMA', @level0name = ${flyway:defaultSchema},
    @level1type = N'TABLE',  @level1name = N'EntityField',
    @level2type = N'COLUMN', @level2name = N'RelatedEntityJoinFields';
GO

-- codegen run
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '24dacea5-6dcf-4153-b3ab-c6b4343484db'  OR 
               (EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'APIKey')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '24dacea5-6dcf-4153-b3ab-c6b4343484db',
            'C49BBAB8-6944-44AF-871B-01F599272E6E', -- Entity: MJ: API Key Usage Logs
            100035,
            'APIKey',
            'API Key',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f31790e1-faa3-425a-b020-aeacafcb2b6e'  OR 
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IsSoftPrimaryKey')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f31790e1-faa3-425a-b020-aeacafcb2b6e',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            100123,
            'IsSoftPrimaryKey',
            'Is Soft Primary Key',
            'When 1, indicates IsPrimaryKey was set via metadata (not a database constraint). Protects IsPrimaryKey from being cleared by schema sync.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5203089e-9ffc-4bb7-b23c-91f2555504d1'  OR 
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'IsSoftForeignKey')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5203089e-9ffc-4bb7-b23c-91f2555504d1',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            100124,
            'IsSoftForeignKey',
            'Is Soft Foreign Key',
            'When 1, indicates RelatedEntityID/RelatedEntityFieldName were set via metadata (not a database constraint). Protects these fields from being cleared by schema sync.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ee0b81ed-767a-4bce-9e6e-e4e48711b482'  OR 
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RelatedEntityJoinFields')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ee0b81ed-767a-4bce-9e6e-e4e48711b482',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            100125,
            'RelatedEntityJoinFields',
            'Related Entity Join Fields',
            'JSON configuration for additional fields to join from the related entity into this entity''s base view. Supports modes: extend (add to NameField), override (replace NameField), disable (no joins). Schema: { mode?: string, fields?: [{ field: string, alias?: string }] }',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f6a4fc68-ceb1-4ad1-a51e-dadebb101994'  OR 
               (EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'APIKey')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f6a4fc68-ceb1-4ad1-a51e-dadebb101994',
            'F1741CE5-EACA-492D-9869-9B55D33D9C29', -- Entity: MJ: API Key Scopes
            100021,
            'APIKey',
            'API Key',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
            0,
            0,
            1,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to delete entity field value ID 44EA433E-F36B-1410-8495-00E2629BC298 */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='44EA433E-F36B-1410-8495-00E2629BC298'

/* Index for Foreign Keys for EntityField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EntityID ON [${flyway:defaultSchema}].[EntityField] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID ON [${flyway:defaultSchema}].[EntityField] ([RelatedEntityID]);

-- Index for foreign key EncryptionKeyID in table EntityField
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityField]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID ON [${flyway:defaultSchema}].[EntityField] ([EncryptionKeyID]);

/* Base View Permissions SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: Permissions for vwEntityFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFields] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
-- Item: spCreateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityField
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityField]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityField]
    @ID uniqueidentifier = NULL,
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit = NULL,
    @IsPrimaryKey bit = NULL,
    @IsUnique bit = NULL,
    @Category nvarchar(255),
    @ValueListType nvarchar(20) = NULL,
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit = NULL,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit = NULL,
    @AllowUpdateInView bit = NULL,
    @IncludeInUserSearchAPI bit = NULL,
    @FullTextSearchEnabled bit = NULL,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit = NULL,
    @GeneratedFormSection nvarchar(10) = NULL,
    @IsNameField bit = NULL,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit = NULL,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20) = NULL,
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit = NULL,
    @ValuesToPackWithSchema nvarchar(10) = NULL,
    @Status nvarchar(25) = NULL,
    @AutoUpdateIsNameField bit = NULL,
    @AutoUpdateDefaultInView bit = NULL,
    @AutoUpdateCategory bit = NULL,
    @AutoUpdateDisplayName bit = NULL,
    @AutoUpdateIncludeInUserSearchAPI bit = NULL,
    @Encrypt bit = NULL,
    @EncryptionKeyID uniqueidentifier,
    @AllowDecryptInAPI bit = NULL,
    @SendEncryptedValue bit = NULL,
    @IsSoftPrimaryKey bit = NULL,
    @IsSoftForeignKey bit = NULL,
    @RelatedEntityJoinFields nvarchar(MAX)
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
                [RelatedEntityJoinFields]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DisplayName,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                @Category,
                ISNULL(@ValueListType, 'None'),
                @ExtendedType,
                @CodeType,
                ISNULL(@DefaultInView, 0),
                @ViewCellTemplate,
                @DefaultColumnWidth,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @UserSearchParamFormatAPI,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                @RelatedEntityID,
                @RelatedEntityFieldName,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                @RelatedEntityNameFieldMap,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                @EntityIDFieldName,
                @ScopeDefault,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                @EncryptionKeyID,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0),
                ISNULL(@IsSoftPrimaryKey, 0),
                ISNULL(@IsSoftForeignKey, 0),
                @RelatedEntityJoinFields
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
                [RelatedEntityJoinFields]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DisplayName,
                @Description,
                ISNULL(@AutoUpdateDescription, 1),
                ISNULL(@IsPrimaryKey, 0),
                ISNULL(@IsUnique, 0),
                @Category,
                ISNULL(@ValueListType, 'None'),
                @ExtendedType,
                @CodeType,
                ISNULL(@DefaultInView, 0),
                @ViewCellTemplate,
                @DefaultColumnWidth,
                ISNULL(@AllowUpdateAPI, 1),
                ISNULL(@AllowUpdateInView, 1),
                ISNULL(@IncludeInUserSearchAPI, 0),
                ISNULL(@FullTextSearchEnabled, 0),
                @UserSearchParamFormatAPI,
                ISNULL(@IncludeInGeneratedForm, 1),
                ISNULL(@GeneratedFormSection, 'Details'),
                ISNULL(@IsNameField, 0),
                @RelatedEntityID,
                @RelatedEntityFieldName,
                ISNULL(@IncludeRelatedEntityNameFieldInBaseView, 1),
                @RelatedEntityNameFieldMap,
                ISNULL(@RelatedEntityDisplayType, 'Search'),
                @EntityIDFieldName,
                @ScopeDefault,
                ISNULL(@AutoUpdateRelatedEntityInfo, 1),
                ISNULL(@ValuesToPackWithSchema, 'Auto'),
                ISNULL(@Status, 'Active'),
                ISNULL(@AutoUpdateIsNameField, 1),
                ISNULL(@AutoUpdateDefaultInView, 1),
                ISNULL(@AutoUpdateCategory, 1),
                ISNULL(@AutoUpdateDisplayName, 1),
                ISNULL(@AutoUpdateIncludeInUserSearchAPI, 1),
                ISNULL(@Encrypt, 0),
                @EncryptionKeyID,
                ISNULL(@AllowDecryptInAPI, 0),
                ISNULL(@SendEncryptedValue, 0),
                ISNULL(@IsSoftPrimaryKey, 0),
                ISNULL(@IsSoftForeignKey, 0),
                @RelatedEntityJoinFields
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
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
    @DisplayName nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @IsPrimaryKey bit,
    @IsUnique bit,
    @Category nvarchar(255),
    @ValueListType nvarchar(20),
    @ExtendedType nvarchar(50),
    @CodeType nvarchar(50),
    @DefaultInView bit,
    @ViewCellTemplate nvarchar(MAX),
    @DefaultColumnWidth int,
    @AllowUpdateAPI bit,
    @AllowUpdateInView bit,
    @IncludeInUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @UserSearchParamFormatAPI nvarchar(500),
    @IncludeInGeneratedForm bit,
    @GeneratedFormSection nvarchar(10),
    @IsNameField bit,
    @RelatedEntityID uniqueidentifier,
    @RelatedEntityFieldName nvarchar(255),
    @IncludeRelatedEntityNameFieldInBaseView bit,
    @RelatedEntityNameFieldMap nvarchar(255),
    @RelatedEntityDisplayType nvarchar(20),
    @EntityIDFieldName nvarchar(100),
    @ScopeDefault nvarchar(100),
    @AutoUpdateRelatedEntityInfo bit,
    @ValuesToPackWithSchema nvarchar(10),
    @Status nvarchar(25),
    @AutoUpdateIsNameField bit,
    @AutoUpdateDefaultInView bit,
    @AutoUpdateCategory bit,
    @AutoUpdateDisplayName bit,
    @AutoUpdateIncludeInUserSearchAPI bit,
    @Encrypt bit,
    @EncryptionKeyID uniqueidentifier,
    @AllowDecryptInAPI bit,
    @SendEncryptedValue bit,
    @IsSoftPrimaryKey bit,
    @IsSoftForeignKey bit,
    @RelatedEntityJoinFields nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityField]
    SET
        [DisplayName] = @DisplayName,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [IsPrimaryKey] = @IsPrimaryKey,
        [IsUnique] = @IsUnique,
        [Category] = @Category,
        [ValueListType] = @ValueListType,
        [ExtendedType] = @ExtendedType,
        [CodeType] = @CodeType,
        [DefaultInView] = @DefaultInView,
        [ViewCellTemplate] = @ViewCellTemplate,
        [DefaultColumnWidth] = @DefaultColumnWidth,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowUpdateInView] = @AllowUpdateInView,
        [IncludeInUserSearchAPI] = @IncludeInUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [UserSearchParamFormatAPI] = @UserSearchParamFormatAPI,
        [IncludeInGeneratedForm] = @IncludeInGeneratedForm,
        [GeneratedFormSection] = @GeneratedFormSection,
        [IsNameField] = @IsNameField,
        [RelatedEntityID] = @RelatedEntityID,
        [RelatedEntityFieldName] = @RelatedEntityFieldName,
        [IncludeRelatedEntityNameFieldInBaseView] = @IncludeRelatedEntityNameFieldInBaseView,
        [RelatedEntityNameFieldMap] = @RelatedEntityNameFieldMap,
        [RelatedEntityDisplayType] = @RelatedEntityDisplayType,
        [EntityIDFieldName] = @EntityIDFieldName,
        [ScopeDefault] = @ScopeDefault,
        [AutoUpdateRelatedEntityInfo] = @AutoUpdateRelatedEntityInfo,
        [ValuesToPackWithSchema] = @ValuesToPackWithSchema,
        [Status] = @Status,
        [AutoUpdateIsNameField] = @AutoUpdateIsNameField,
        [AutoUpdateDefaultInView] = @AutoUpdateDefaultInView,
        [AutoUpdateCategory] = @AutoUpdateCategory,
        [AutoUpdateDisplayName] = @AutoUpdateDisplayName,
        [AutoUpdateIncludeInUserSearchAPI] = @AutoUpdateIncludeInUserSearchAPI,
        [Encrypt] = @Encrypt,
        [EncryptionKeyID] = @EncryptionKeyID,
        [AllowDecryptInAPI] = @AllowDecryptInAPI,
        [SendEncryptedValue] = @SendEncryptedValue,
        [IsSoftPrimaryKey] = @IsSoftPrimaryKey,
        [IsSoftForeignKey] = @IsSoftForeignKey,
        [RelatedEntityJoinFields] = @RelatedEntityJoinFields
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
        

/* spUpdate Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Fields
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Entity Fields */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer]



/* Index for Foreign Keys for APIKeyScope */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key APIKeyID in table APIKeyScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyScope_APIKeyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyScope_APIKeyID ON [${flyway:defaultSchema}].[APIKeyScope] ([APIKeyID]);

-- Index for foreign key ScopeID in table APIKeyScope
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyScope_ScopeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyScope]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyScope_ScopeID ON [${flyway:defaultSchema}].[APIKeyScope] ([ScopeID]);

/* Base View SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: vwAPIKeyScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: API Key Scopes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  APIKeyScope
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAPIKeyScopes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAPIKeyScopes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAPIKeyScopes]
AS
SELECT
    a.*,
    APIKey_APIKeyID.[Label] AS [APIKey],
    APIScope_ScopeID.[Name] AS [Scope]
FROM
    [${flyway:defaultSchema}].[APIKeyScope] AS a
INNER JOIN
    [${flyway:defaultSchema}].[APIKey] AS APIKey_APIKeyID
  ON
    [a].[APIKeyID] = APIKey_APIKeyID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[APIScope] AS APIScope_ScopeID
  ON
    [a].[ScopeID] = APIScope_ScopeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: Permissions for vwAPIKeyScopes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyScopes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spCreateAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIKeyScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAPIKeyScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyScope]
    @ID uniqueidentifier = NULL,
    @APIKeyID uniqueidentifier,
    @ScopeID uniqueidentifier,
    @ResourcePattern nvarchar(750),
    @PatternType nvarchar(20) = NULL,
    @IsDeny bit = NULL,
    @Priority int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[APIKeyScope]
            (
                [ID],
                [APIKeyID],
                [ScopeID],
                [ResourcePattern],
                [PatternType],
                [IsDeny],
                [Priority]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @APIKeyID,
                @ScopeID,
                @ResourcePattern,
                ISNULL(@PatternType, 'Include'),
                ISNULL(@IsDeny, 0),
                ISNULL(@Priority, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[APIKeyScope]
            (
                [APIKeyID],
                [ScopeID],
                [ResourcePattern],
                [PatternType],
                [IsDeny],
                [Priority]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @APIKeyID,
                @ScopeID,
                @ResourcePattern,
                ISNULL(@PatternType, 'Include'),
                ISNULL(@IsDeny, 0),
                ISNULL(@Priority, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAPIKeyScopes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyScope] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: API Key Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyScope] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spUpdateAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIKeyScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAPIKeyScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyScope]
    @ID uniqueidentifier,
    @APIKeyID uniqueidentifier,
    @ScopeID uniqueidentifier,
    @ResourcePattern nvarchar(750),
    @PatternType nvarchar(20),
    @IsDeny bit,
    @Priority int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyScope]
    SET
        [APIKeyID] = @APIKeyID,
        [ScopeID] = @ScopeID,
        [ResourcePattern] = @ResourcePattern,
        [PatternType] = @PatternType,
        [IsDeny] = @IsDeny,
        [Priority] = @Priority
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAPIKeyScopes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAPIKeyScopes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyScope] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the APIKeyScope table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAPIKeyScope]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAPIKeyScope];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAPIKeyScope
ON [${flyway:defaultSchema}].[APIKeyScope]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyScope]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[APIKeyScope] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: API Key Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyScope] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: API Key Scopes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Scopes
-- Item: spDeleteAPIKeyScope
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIKeyScope
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAPIKeyScope]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyScope];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyScope]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[APIKeyScope]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyScope] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: API Key Scopes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyScope] TO [cdp_Integration]



/* Index for Foreign Keys for APIKeyUsageLog */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key APIKeyID in table APIKeyUsageLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyUsageLog_APIKeyID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyUsageLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyUsageLog_APIKeyID ON [${flyway:defaultSchema}].[APIKeyUsageLog] ([APIKeyID]);

-- Index for foreign key ApplicationID in table APIKeyUsageLog
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_APIKeyUsageLog_ApplicationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[APIKeyUsageLog]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_APIKeyUsageLog_ApplicationID ON [${flyway:defaultSchema}].[APIKeyUsageLog] ([ApplicationID]);

/* Base View SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: vwAPIKeyUsageLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: API Key Usage Logs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  APIKeyUsageLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAPIKeyUsageLogs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAPIKeyUsageLogs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAPIKeyUsageLogs]
AS
SELECT
    a.*,
    APIKey_APIKeyID.[Label] AS [APIKey],
    APIApplication_ApplicationID.[Name] AS [Application]
FROM
    [${flyway:defaultSchema}].[APIKeyUsageLog] AS a
INNER JOIN
    [${flyway:defaultSchema}].[APIKey] AS APIKey_APIKeyID
  ON
    [a].[APIKeyID] = APIKey_APIKeyID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[APIApplication] AS APIApplication_ApplicationID
  ON
    [a].[ApplicationID] = APIApplication_ApplicationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyUsageLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: Permissions for vwAPIKeyUsageLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAPIKeyUsageLogs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: spCreateAPIKeyUsageLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIKeyUsageLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAPIKeyUsageLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog]
    @ID uniqueidentifier = NULL,
    @APIKeyID uniqueidentifier,
    @Endpoint nvarchar(500),
    @Operation nvarchar(255),
    @Method nvarchar(10),
    @StatusCode int,
    @ResponseTimeMs int,
    @IPAddress nvarchar(45),
    @UserAgent nvarchar(500),
    @ApplicationID uniqueidentifier,
    @RequestedResource nvarchar(500),
    @ScopesEvaluated nvarchar(MAX),
    @AuthorizationResult nvarchar(20) = NULL,
    @DeniedReason nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[APIKeyUsageLog]
            (
                [ID],
                [APIKeyID],
                [Endpoint],
                [Operation],
                [Method],
                [StatusCode],
                [ResponseTimeMs],
                [IPAddress],
                [UserAgent],
                [ApplicationID],
                [RequestedResource],
                [ScopesEvaluated],
                [AuthorizationResult],
                [DeniedReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @APIKeyID,
                @Endpoint,
                @Operation,
                @Method,
                @StatusCode,
                @ResponseTimeMs,
                @IPAddress,
                @UserAgent,
                @ApplicationID,
                @RequestedResource,
                @ScopesEvaluated,
                ISNULL(@AuthorizationResult, 'Allowed'),
                @DeniedReason
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[APIKeyUsageLog]
            (
                [APIKeyID],
                [Endpoint],
                [Operation],
                [Method],
                [StatusCode],
                [ResponseTimeMs],
                [IPAddress],
                [UserAgent],
                [ApplicationID],
                [RequestedResource],
                [ScopesEvaluated],
                [AuthorizationResult],
                [DeniedReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @APIKeyID,
                @Endpoint,
                @Operation,
                @Method,
                @StatusCode,
                @ResponseTimeMs,
                @IPAddress,
                @UserAgent,
                @ApplicationID,
                @RequestedResource,
                @ScopesEvaluated,
                ISNULL(@AuthorizationResult, 'Allowed'),
                @DeniedReason
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAPIKeyUsageLogs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: API Key Usage Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: spUpdateAPIKeyUsageLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIKeyUsageLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog]
    @ID uniqueidentifier,
    @APIKeyID uniqueidentifier,
    @Endpoint nvarchar(500),
    @Operation nvarchar(255),
    @Method nvarchar(10),
    @StatusCode int,
    @ResponseTimeMs int,
    @IPAddress nvarchar(45),
    @UserAgent nvarchar(500),
    @ApplicationID uniqueidentifier,
    @RequestedResource nvarchar(500),
    @ScopesEvaluated nvarchar(MAX),
    @AuthorizationResult nvarchar(20),
    @DeniedReason nvarchar(500)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyUsageLog]
    SET
        [APIKeyID] = @APIKeyID,
        [Endpoint] = @Endpoint,
        [Operation] = @Operation,
        [Method] = @Method,
        [StatusCode] = @StatusCode,
        [ResponseTimeMs] = @ResponseTimeMs,
        [IPAddress] = @IPAddress,
        [UserAgent] = @UserAgent,
        [ApplicationID] = @ApplicationID,
        [RequestedResource] = @RequestedResource,
        [ScopesEvaluated] = @ScopesEvaluated,
        [AuthorizationResult] = @AuthorizationResult,
        [DeniedReason] = @DeniedReason
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAPIKeyUsageLogs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAPIKeyUsageLogs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the APIKeyUsageLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAPIKeyUsageLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAPIKeyUsageLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAPIKeyUsageLog
ON [${flyway:defaultSchema}].[APIKeyUsageLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyUsageLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[APIKeyUsageLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: API Key Usage Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: spDeleteAPIKeyUsageLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR APIKeyUsageLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[APIKeyUsageLog]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: API Key Usage Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAPIKeyUsageLog] TO [cdp_Integration]



/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'FC5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FC5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FD5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '754317F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F24217F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'FF5717F0-6F36-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FC5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FD5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'FE5717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F24217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'E239643B-E6D9-4819-B6B7-C1E02B214460'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E239643B-E6D9-4819-B6B7-C1E02B214460'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B06F57AD-7786-4E2D-BB40-F6F9F6513524'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'CCD93F16-175E-4253-88DF-9FA33BA9F4E6'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E3CA9BA9-8E26-43DD-9EF1-0005E2478C8B'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F2B9EDC3-1DD0-4D9F-8B52-5CCDBA7AE525'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '24DACEA5-6DCF-4153-B3AB-C6B4343484DB'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '610DD273-C8EA-4D1C-8FE6-24853366BFA2'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E239643B-E6D9-4819-B6B7-C1E02B214460'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '784C2EC3-393A-43CD-B235-4104C171F126'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F2B9EDC3-1DD0-4D9F-8B52-5CCDBA7AE525'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'EDD465A7-A126-42DF-A214-BBC237FAF942'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '72EFCD20-BD28-408A-88C7-1A91703DA172'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '333B3099-1F1C-4034-86F0-40D2C5D86188'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E456759C-27B8-4197-893C-F44A6015A8E8'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '24DACEA5-6DCF-4153-B3AB-C6B4343484DB'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '610DD273-C8EA-4D1C-8FE6-24853366BFA2'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 18 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '48219BCC-5A2B-42B8-A832-5459118ECD6D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8B521399-DDA4-47BD-B13A-0597F1F9F08D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F1ADE12E-28EE-4360-B5E5-DE58A8DA2F8D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '222DB89A-825A-41E4-BA64-FA489F5BCAB1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Endpoint',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E239643B-E6D9-4819-B6B7-C1E02B214460'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Operation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '784C2EC3-393A-43CD-B235-4104C171F126'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Request Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Method',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B06F57AD-7786-4E2D-BB40-F6F9F6513524'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response & Client Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status Code',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CCD93F16-175E-4253-88DF-9FA33BA9F4E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response & Client Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'Response Time (ms)',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E3CA9BA9-8E26-43DD-9EF1-0005E2478C8B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response & Client Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'IP Address',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F2B9EDC3-1DD0-4D9F-8B52-5CCDBA7AE525'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Response & Client Info',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EDD465A7-A126-42DF-A214-BBC237FAF942'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Application ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7A229B80-2D65-44DD-861A-E1CF6FE9D98A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Requested Resource',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '72EFCD20-BD28-408A-88C7-1A91703DA172'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scopes Evaluated',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E6AFEEC9-80D9-4193-9E4F-0B1B7FDA310A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Authorization Result',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '333B3099-1F1C-4034-86F0-40D2C5D86188'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Denied Reason',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E456759C-27B8-4197-893C-F44A6015A8E8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'Application',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '610DD273-C8EA-4D1C-8FE6-24853366BFA2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Authorization Details',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '24DACEA5-6DCF-4153-B3AB-C6B4343484DB'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Authorization Details":{"icon":"fa fa-lock","description":"Information about the API key, application context, requested resource, and authorization outcome for each request"},"Request Information":{"icon":"fa fa-code","description":"Core details of the API call such as key, endpoint, operation and HTTP method"},"Response & Client Info":{"icon":"fa fa-network-wired","description":"Outcome of the request plus client context like status, timing, IP and user-agent"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed identifiers and audit timestamps"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Authorization Details":"fa fa-lock","Request Information":"fa fa-code","Response & Client Info":"fa fa-network-wired","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'FieldCategoryIcons'
            

/* Set categories for 69 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '414D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FA5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Sequence',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FB5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FC5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Display Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FE5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '044417F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Primary Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '754317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Unique',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5E4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F24217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FF5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Length',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '005817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Precision',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '015817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scale',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '025817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Allows Null',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '035817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Value',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D74217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Increment',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '045817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Value List Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C64D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Extended Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '055817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Code Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B04C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default In View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '065817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'View Cell Template',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F34217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Column Width',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Allow Update API',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '404F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Allow Update In View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F44217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Include In User Search API',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '424F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Full Text Search Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5E4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'User Search Param Format API',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '434F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Include In Generated Form',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F54217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Generated Form Section',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F64217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Virtual',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '075817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Name Field',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B64217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '954D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Field Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B74217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Include Related Entity Name Field In Base View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '974D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Name Field Map',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F74217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity ID Field Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '35A18EA5-5641-EF11-86C3-00224821D189'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Related Entity Info',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FFC3C691-2E33-46D0-B11C-AB348997E08C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B84217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Schema Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Base Table',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Base View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9D4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Code Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9E4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Class Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9F4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CE5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CF5717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope Default',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0C2449FB-1BDA-4BE9-A059-7224C05A14B9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Category',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D64DD327-8057-4DF5-A24C-F951932C1A26'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Values To Pack With Schema',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '20818E34-47E7-4371-A51E-3D29BCC4B4B8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '407A96C8-580A-4427-BEED-ABB46F015586'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Is Name Field',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5EFD956B-0DB1-491B-9153-0891A7B1835D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Default In View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E9707755-1A43-4DE3-815D-37E41CA7C7D0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Display Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8486168A-5082-48DC-BE13-EF53F49922CB'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Data Constraints & Validation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Update Include In User Search API',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '9E1D732F-E33E-40FE-AFAD-477623AC9DEA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Security & Encryption',
       GeneratedFormSection = 'Category',
       DisplayName = 'Encrypt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '04C52058-4E01-4316-ABAE-9958AFB71B5C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Security & Encryption',
       GeneratedFormSection = 'Category',
       DisplayName = 'Encryption Key ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B24D31A6-A3BE-449C-9FE7-98C87E40DA55'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Security & Encryption',
       GeneratedFormSection = 'Category',
       DisplayName = 'Allow Decrypt In API',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7C097F3D-79AC-4144-A3B6-A8BFF64EDF3C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Security & Encryption',
       GeneratedFormSection = 'Category',
       DisplayName = 'Send Encrypted Value',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '901EE131-BC99-4B80-B5E5-D974057EEA8A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Soft Primary Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F31790E1-FAA3-425A-B020-AEACAFCB2B6E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Soft Foreign Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5203089E-9FFC-4BB7-B23C-91F2555504D1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Relationships & Linking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Join Fields',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EE0B81ED-767A-4BCE-9E6E-E4E48711B482'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Identification & Keys',
       GeneratedFormSection = 'Category',
       DisplayName = 'Field Code Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '07AD23D5-DEBD-4657-8E3C-7F1F1342BCE3'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '584D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Schema Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BA4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Base Table',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '594D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Base View',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5A4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Code Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A04D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System & Audit Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Entity Class Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B94217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'User Interface & Display Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Related Entity Display Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F05717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Security & Encryption":{"icon":"fa fa-lock","description":"Settings that control encryption, key management, and decryption behavior for sensitive fields"},"Identification & Keys":{"icon":"fa fa-key","description":""},"User Interface & Display Settings":{"icon":"fa fa-palette","description":""},"Data Constraints & Validation":{"icon":"fa fa-gavel","description":""},"Relationships & Linking":{"icon":"fa fa-link","description":""},"System & Audit Metadata":{"icon":"fa fa-cog","description":""}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Security & Encryption":"fa fa-lock","Identification & Keys":"fa fa-key","User Interface & Display Settings":"fa fa-palette","Data Constraints & Validation":"fa fa-gavel","Relationships & Linking":"fa fa-link","System & Audit Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = 'E0212C32-E0F6-45EB-8670-4E8738CB1C73'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '66CF7D0C-5045-4173-9605-4F5019045F40'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'D0B5354C-4FD6-4867-9B00-2DCA6F503311'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '887A096A-6BFA-42BF-949A-69E936E809F2'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '6FF07094-84F7-4095-B677-5D5ACDF6C74C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F6A4FC68-CEB1-4AD1-A51E-DADEBB101994'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'E0212C32-E0F6-45EB-8670-4E8738CB1C73'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '66CF7D0C-5045-4173-9605-4F5019045F40'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F6A4FC68-CEB1-4AD1-A51E-DADEBB101994'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E0212C32-E0F6-45EB-8670-4E8738CB1C73'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 11 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E9EF38A8-150A-40E1-8181-2CCB30379BC0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '432E223B-5DEB-4563-9B63-E51DDEEE7741'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '311BA3D2-F958-4A38-91F7-A5786C96C75F'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E0212C32-E0F6-45EB-8670-4E8738CB1C73'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Key Scope Mapping',
       GeneratedFormSection = 'Category',
       DisplayName = 'API Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F6A4FC68-CEB1-4AD1-A51E-DADEBB101994'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B4D1B26B-A8A1-4A41-A353-DFC8F1AAC03D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '23C53CEB-2D8F-42F5-B42E-C239644D10CA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Rules',
       GeneratedFormSection = 'Category',
       DisplayName = 'Resource Pattern',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '66CF7D0C-5045-4173-9605-4F5019045F40'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Rules',
       GeneratedFormSection = 'Category',
       DisplayName = 'Pattern Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D0B5354C-4FD6-4867-9B00-2DCA6F503311'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Rules',
       GeneratedFormSection = 'Category',
       DisplayName = 'Deny',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '887A096A-6BFA-42BF-949A-69E936E809F2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Access Rules',
       GeneratedFormSection = 'Category',
       DisplayName = 'Priority',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6FF07094-84F7-4095-B677-5D5ACDF6C74C'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Access Rules":{"icon":"fa fa-shield-alt","description":"Defines pattern-based allow/deny rules that govern how a scope authorizes API requests"},"Key Scope Mapping":{"icon":"fa fa-link","description":"Defines which permission scopes are assigned to each API key"},"System Metadata":{"icon":"fa fa-cog","description":"System-managed audit fields tracking creation and modification dates"}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Access Rules":"fa fa-shield-alt","Key Scope Mapping":"fa fa-link","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'FieldCategoryIcons'
            


