-- =============================================
-- Advanced Generation: Metadata Intelligence
-- Version: 2.x
-- Date: 2025-11-02
-- Description: Add metadata tracking for LLM-powered
--              field identification and form layout generation
-- =============================================

-- Add AutoUpdate flags to EntityField for Smart Field Identification
ALTER TABLE [${flyway:defaultSchema}].EntityField
ADD AutoUpdateIsNameField BIT NOT NULL DEFAULT 1,
    AutoUpdateDefaultInView BIT NOT NULL DEFAULT 1,
    AutoUpdateCategory BIT NOT NULL DEFAULT 1;

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, allows system/LLM to auto-update IsNameField; when 0, user has locked this field',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityField',
    @level2type = N'COLUMN', @level2name = 'AutoUpdateIsNameField';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, allows system/LLM to auto-update DefaultInView; when 0, user has locked this field',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityField',
    @level2type = N'COLUMN', @level2name = 'AutoUpdateDefaultInView';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, allows system/LLM to auto-update Category; when 0, user has locked this field',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityField',
    @level2type = N'COLUMN', @level2name = 'AutoUpdateCategory';

-- Add transitive join metadata to EntityRelationship
ALTER TABLE [${flyway:defaultSchema}].EntityRelationship
ADD AdditionalFieldsToInclude NVARCHAR(MAX) NULL,
    AutoUpdateAdditionalFieldsToInclude BIT NOT NULL DEFAULT 1;

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON array of additional field names to include when joining through this relationship (for junction tables, e.g., ["RoleName", "UserEmail"])',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityRelationship',
    @level2type = N'COLUMN', @level2name = 'AdditionalFieldsToInclude';

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When 1, allows system/LLM to auto-update AdditionalFieldsToInclude; when 0, user has locked this field',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'EntityRelationship',
    @level2type = N'COLUMN', @level2name = 'AutoUpdateAdditionalFieldsToInclude';














































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2d57799a-a40c-4095-905a-bdea51c2a1f4'  OR 
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateIsNameField')
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
            '2d57799a-a40c-4095-905a-bdea51c2a1f4',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            100102,
            'AutoUpdateIsNameField',
            'Auto Update Is Name Field',
            'When 1, allows system/LLM to auto-update IsNameField; when 0, user has locked this field',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
         WHERE ID = 'a5c73b71-f3f8-4b28-84cb-b77aa24e5ce3'  OR 
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateDefaultInView')
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
            'a5c73b71-f3f8-4b28-84cb-b77aa24e5ce3',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            100103,
            'AutoUpdateDefaultInView',
            'Auto Update Default In View',
            'When 1, allows system/LLM to auto-update DefaultInView; when 0, user has locked this field',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
         WHERE ID = 'dd9377f4-9ed6-471f-bead-787c0ca98982'  OR 
               (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateCategory')
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
            'dd9377f4-9ed6-471f-bead-787c0ca98982',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Fields
            100104,
            'AutoUpdateCategory',
            'Auto Update Category',
            'When 1, allows system/LLM to auto-update Category; when 0, user has locked this field',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
         WHERE ID = 'eefbc535-d8e1-4619-a5a9-2ea88a40531d'  OR 
               (EntityID = 'E2238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AdditionalFieldsToInclude')
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
            'eefbc535-d8e1-4619-a5a9-2ea88a40531d',
            'E2238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Relationships
            100057,
            'AdditionalFieldsToInclude',
            'Additional Fields To Include',
            'JSON array of additional field names to include when joining through this relationship (for junction tables, e.g., ["RoleName", "UserEmail"])',
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
         WHERE ID = 'a217258f-f849-4538-b85f-16da7c926b12'  OR 
               (EntityID = 'E2238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoUpdateAdditionalFieldsToInclude')
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
            'a217258f-f849-4538-b85f-16da7c926b12',
            'E2238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Relationships
            100058,
            'AutoUpdateAdditionalFieldsToInclude',
            'Auto Update Additional Fields To Include',
            'When 1, allows system/LLM to auto-update AdditionalFieldsToInclude; when 0, user has locked this field',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
    @AutoUpdateCategory bit = NULL
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
                [AutoUpdateCategory]
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
                ISNULL(@AutoUpdateCategory, 1)
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
                [AutoUpdateCategory]
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
                ISNULL(@AutoUpdateCategory, 1)
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
    @AutoUpdateCategory bit
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
        [AutoUpdateCategory] = @AutoUpdateCategory
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



/* Index for Foreign Keys for EntityRelationship */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_EntityID ON [${flyway:defaultSchema}].[EntityRelationship] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_RelatedEntityID ON [${flyway:defaultSchema}].[EntityRelationship] ([RelatedEntityID]);

-- Index for foreign key DisplayUserViewID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayUserViewID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayUserViewID ON [${flyway:defaultSchema}].[EntityRelationship] ([DisplayUserViewID]);

-- Index for foreign key DisplayComponentID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayComponentID ON [${flyway:defaultSchema}].[EntityRelationship] ([DisplayComponentID]);

/* Base View Permissions SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: Permissions for vwEntityRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityRelationships] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spCreateEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRelationship]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @Sequence int = NULL,
    @RelatedEntityID uniqueidentifier,
    @BundleInAPI bit = NULL,
    @IncludeInParentAllQuery bit = NULL,
    @Type nchar(20) = NULL,
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit = NULL,
    @DisplayLocation nvarchar(50) = NULL,
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50) = NULL,
    @DisplayIcon nvarchar(255),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX),
    @AutoUpdateFromSchema bit = NULL,
    @AdditionalFieldsToInclude nvarchar(MAX),
    @AutoUpdateAdditionalFieldsToInclude bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityRelationship]
            (
                [ID],
                [EntityID],
                [Sequence],
                [RelatedEntityID],
                [BundleInAPI],
                [IncludeInParentAllQuery],
                [Type],
                [EntityKeyField],
                [RelatedEntityJoinField],
                [JoinView],
                [JoinEntityJoinField],
                [JoinEntityInverseJoinField],
                [DisplayInForm],
                [DisplayLocation],
                [DisplayName],
                [DisplayIconType],
                [DisplayIcon],
                [DisplayComponentID],
                [DisplayComponentConfiguration],
                [AutoUpdateFromSchema],
                [AdditionalFieldsToInclude],
                [AutoUpdateAdditionalFieldsToInclude]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                ISNULL(@Sequence, 0),
                @RelatedEntityID,
                ISNULL(@BundleInAPI, 1),
                ISNULL(@IncludeInParentAllQuery, 0),
                ISNULL(@Type, 'One To Many'),
                @EntityKeyField,
                @RelatedEntityJoinField,
                @JoinView,
                @JoinEntityJoinField,
                @JoinEntityInverseJoinField,
                ISNULL(@DisplayInForm, 1),
                ISNULL(@DisplayLocation, 'After Field Tabs'),
                @DisplayName,
                ISNULL(@DisplayIconType, 'Related Entity Icon'),
                @DisplayIcon,
                @DisplayComponentID,
                @DisplayComponentConfiguration,
                ISNULL(@AutoUpdateFromSchema, 1),
                @AdditionalFieldsToInclude,
                ISNULL(@AutoUpdateAdditionalFieldsToInclude, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityRelationship]
            (
                [EntityID],
                [Sequence],
                [RelatedEntityID],
                [BundleInAPI],
                [IncludeInParentAllQuery],
                [Type],
                [EntityKeyField],
                [RelatedEntityJoinField],
                [JoinView],
                [JoinEntityJoinField],
                [JoinEntityInverseJoinField],
                [DisplayInForm],
                [DisplayLocation],
                [DisplayName],
                [DisplayIconType],
                [DisplayIcon],
                [DisplayComponentID],
                [DisplayComponentConfiguration],
                [AutoUpdateFromSchema],
                [AdditionalFieldsToInclude],
                [AutoUpdateAdditionalFieldsToInclude]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                ISNULL(@Sequence, 0),
                @RelatedEntityID,
                ISNULL(@BundleInAPI, 1),
                ISNULL(@IncludeInParentAllQuery, 0),
                ISNULL(@Type, 'One To Many'),
                @EntityKeyField,
                @RelatedEntityJoinField,
                @JoinView,
                @JoinEntityJoinField,
                @JoinEntityInverseJoinField,
                ISNULL(@DisplayInForm, 1),
                ISNULL(@DisplayLocation, 'After Field Tabs'),
                @DisplayName,
                ISNULL(@DisplayIconType, 'Related Entity Icon'),
                @DisplayIcon,
                @DisplayComponentID,
                @DisplayComponentConfiguration,
                ISNULL(@AutoUpdateFromSchema, 1),
                @AdditionalFieldsToInclude,
                ISNULL(@AutoUpdateAdditionalFieldsToInclude, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityRelationships] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRelationship] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spUpdateEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRelationship]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Sequence int,
    @RelatedEntityID uniqueidentifier,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayLocation nvarchar(50),
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50),
    @DisplayIcon nvarchar(255),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX),
    @AutoUpdateFromSchema bit,
    @AdditionalFieldsToInclude nvarchar(MAX),
    @AutoUpdateAdditionalFieldsToInclude bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRelationship]
    SET
        [EntityID] = @EntityID,
        [Sequence] = @Sequence,
        [RelatedEntityID] = @RelatedEntityID,
        [BundleInAPI] = @BundleInAPI,
        [IncludeInParentAllQuery] = @IncludeInParentAllQuery,
        [Type] = @Type,
        [EntityKeyField] = @EntityKeyField,
        [RelatedEntityJoinField] = @RelatedEntityJoinField,
        [JoinView] = @JoinView,
        [JoinEntityJoinField] = @JoinEntityJoinField,
        [JoinEntityInverseJoinField] = @JoinEntityInverseJoinField,
        [DisplayInForm] = @DisplayInForm,
        [DisplayLocation] = @DisplayLocation,
        [DisplayName] = @DisplayName,
        [DisplayIconType] = @DisplayIconType,
        [DisplayIcon] = @DisplayIcon,
        [DisplayComponentID] = @DisplayComponentID,
        [DisplayComponentConfiguration] = @DisplayComponentConfiguration,
        [AutoUpdateFromSchema] = @AutoUpdateFromSchema,
        [AdditionalFieldsToInclude] = @AdditionalFieldsToInclude,
        [AutoUpdateAdditionalFieldsToInclude] = @AutoUpdateAdditionalFieldsToInclude
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityRelationships] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityRelationships]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRelationship] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityRelationship table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityRelationship]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityRelationship];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityRelationship
ON [${flyway:defaultSchema}].[EntityRelationship]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRelationship]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityRelationship] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spDeleteEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityRelationship]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityRelationship]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]



