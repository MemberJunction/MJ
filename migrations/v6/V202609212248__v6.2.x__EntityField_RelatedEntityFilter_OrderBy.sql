-- =============================================================================
-- EntityField.RelatedEntityFilter / RelatedEntityOrderBy — scope and order a
-- foreign-key picker from metadata instead of from every form that renders it.
-- =============================================================================
--
-- WHAT THIS ENABLES. A foreign key currently offers every row of the related
-- entity. On a directory with hundreds of thousands of rows that means a user
-- typing three letters is shown an arbitrary twenty records containing those
-- letters, most of which are not plausible values for the field. The app knows
-- which rows are plausible and has nowhere to say so: RelatedEntityID and
-- RelatedEntityDisplayType are already on this row, but neither narrows or
-- orders the population.
--
--     RelatedEntityFilter  = N'Status = ''Active'''
--     RelatedEntityOrderBy = N'[Name]'
--
-- RelatedEntityFilter is AND-ed with whatever the user types, on both the
-- browse list and the search path. RelatedEntityOrderBy orders the browse list
-- the user sees on focus; the search path is ranked by relevance instead.
--
-- WHY COLUMNS RATHER THAN A JSONType. Unlike EmbeddedRecord, these are not an
-- evolving policy object — they are two SQL fragments with no options and no
-- foreseeable third sibling. A JSONType would buy nothing and cost every
-- consumer a parse.
--
-- WHY AUTHORED, NOT DERIVED. CodeGen discovers foreign keys from the catalog,
-- but the catalog cannot know which rows of the target are plausible for a
-- given field — that is a statement about the business, not the schema. So
-- these two columns are hand-set (metadata JSON or the Entity Field form) and
-- CodeGen must leave them alone, exactly as RelatedEntityNameFieldMap is.
--
-- ADDITIVE ON PURPOSE. NULL — every existing row — means no filter and order
-- by the related entity's name field, which is the behaviour a picker already
-- has. Nothing changes for a field nobody configures.
--
-- SEE ALSO. MemberJunction/MJ#4639 and the FKLookupStrategy seam in
-- @memberjunction/ng-base-forms, which is what reads these.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[EntityField]
    ADD [RelatedEntityFilter] NVARCHAR(MAX) NULL,
        [RelatedEntityOrderBy] NVARCHAR(500) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional SQL WHERE fragment applied to every lookup on this foreign key (e.g. Status = ''Active''), AND-ed with whatever the user types, on both the browse list and the search path. Lets a picker be scoped from metadata rather than from every form template that renders the field. Authored by hand — CodeGen never derives or overwrites it. NULL means no filter, which is the pre-feature behaviour.',
    @level0type = N'SCHEMA',  @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',   @level1name = N'EntityField',
    @level2type = N'COLUMN',  @level2name = N'RelatedEntityFilter';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional ORDER BY fragment for the empty-query browse list on this foreign key, e.g. [Name] or [LastActivityDate] DESC. Does not affect the typed-query path, which is ordered by search relevance. Authored by hand — CodeGen never derives or overwrites it. NULL means order by the related entity''s name field.',
    @level0type = N'SCHEMA',  @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',   @level1name = N'EntityField',
    @level2type = N'COLUMN',  @level2name = N'RelatedEntityOrderBy';
GO



















































/* ============================================================================
 * ============================================================================
 *
 *   E V E R Y T H I N G   B E L O W   T H I S   L I N E   I S   G E N E R A T E D
 *
 *   Produced by the MemberJunction CodeGen tool from the hand-written DDL above,
 *   against a database built from migrations alone. It contains:
 *
 *     - the EntityField metadata rows for RelatedEntityFilter and RelatedEntityOrderBy
 *       (Sequence is an apply-time MAX(Sequence)+1 expression, never a literal)
 *     - the regenerated spCreateEntityField / spUpdateEntityField / spDeleteEntityField
 *       procedures, which learn the two new parameters and their _Clear flags
 *     - the permission grants that go with them
 *
 *   DO NOT EDIT BY HAND. If the DDL above changes, re-run `mj codegen` through THIS
 *   branch's own CLI (packages/MJCLI) — not a globally installed `mj`, whose bundled
 *   CodeGenLib generates against older templates — and replace this whole section.
 *
 * ============================================================================
 * ============================================================================
 */

/* SQL text to insert 2 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd66d3ff4-b743-4b07-a0a3-3491db80dc88' OR (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RelatedEntityFilter')) BEGIN
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
            'd66d3ff4-b743-4b07-a0a3-3491db80dc88',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6'),
            'RelatedEntityFilter',
            'Related Entity Filter',
            'Optional SQL WHERE fragment applied to every lookup on this foreign key (e.g. Status = ''Active''), AND-ed with whatever the user types, on both the browse list and the search path. Lets a picker be scoped from metadata rather than from every form template that renders the field. Authored by hand — CodeGen never derives or overwrites it. NULL means no filter, which is the pre-feature behaviour.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c0cfaf1e-d95b-4b46-996f-d00adfb2d31a' OR (EntityID = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RelatedEntityOrderBy')) BEGIN
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
            'c0cfaf1e-d95b-4b46-996f-d00adfb2d31a',
            'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Fields
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6'),
            'RelatedEntityOrderBy',
            'Related Entity Order By',
            'Optional ORDER BY fragment for the empty-query browse list on this foreign key, e.g. [Name] or [LastActivityDate] DESC. Does not affect the typed-query path, which is ordered by search relevance. Authored by hand — CodeGen never derives or overwrites it. NULL means order by the related entity''s name field.',
            'nvarchar',
            1000,
            0,
            0,
            1,
            NULL,
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

/* Index for Foreign Keys for EntityField */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
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

/* Base View Permissions SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: Permissions for vwEntityFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityFields] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityFields] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwEntityFields] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityFields] TO [cdp_UI], [cdp_Integration], [cdp_Developer];

/* spCreate SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
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
    @IsComputed bit = NULL,
    @EmbeddedRecord_Clear bit = 0,
    @EmbeddedRecord nvarchar(MAX) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @RelatedEntityFilter_Clear bit = 0,
    @RelatedEntityFilter nvarchar(MAX) = NULL,
    @RelatedEntityOrderBy_Clear bit = 0,
    @RelatedEntityOrderBy nvarchar(500) = NULL
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
                [IsComputed],
                [EmbeddedRecord],
                [Configuration],
                [RelatedEntityFilter],
                [RelatedEntityOrderBy]
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
                ISNULL(@IsComputed, 0),
                CASE WHEN @EmbeddedRecord_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddedRecord, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @RelatedEntityFilter_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityFilter, NULL) END,
                CASE WHEN @RelatedEntityOrderBy_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityOrderBy, NULL) END
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
                [IsComputed],
                [EmbeddedRecord],
                [Configuration],
                [RelatedEntityFilter],
                [RelatedEntityOrderBy]
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
                ISNULL(@IsComputed, 0),
                CASE WHEN @EmbeddedRecord_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddedRecord, NULL) END,
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @RelatedEntityFilter_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityFilter, NULL) END,
                CASE WHEN @RelatedEntityOrderBy_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityOrderBy, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityFields] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Entity Fields */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityField] FROM [cdp_Integration]
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
    @IsComputed bit = NULL,
    @EmbeddedRecord_Clear bit = 0,
    @EmbeddedRecord nvarchar(MAX) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @RelatedEntityFilter_Clear bit = 0,
    @RelatedEntityFilter nvarchar(MAX) = NULL,
    @RelatedEntityOrderBy_Clear bit = 0,
    @RelatedEntityOrderBy nvarchar(500) = NULL
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
        [IsComputed] = ISNULL(@IsComputed, [IsComputed]),
        [EmbeddedRecord] = CASE WHEN @EmbeddedRecord_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddedRecord, [EmbeddedRecord]) END,
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [RelatedEntityFilter] = CASE WHEN @RelatedEntityFilter_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityFilter, [RelatedEntityFilter]) END,
        [RelatedEntityOrderBy] = CASE WHEN @RelatedEntityOrderBy_Clear = 1 THEN NULL ELSE ISNULL(@RelatedEntityOrderBy, [RelatedEntityOrderBy]) END
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] FROM [cdp_Integration]
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityField] FROM [cdp_Integration]
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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Entity Fields */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityField] TO [cdp_Integration], [cdp_Developer];

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntityFields';
