-- =============================================================================
-- EntityRelationship.RelatedRecordCollection — declare a relationship as a
-- first-class, code-generated related-record collection.
-- =============================================================================
--
-- WHAT THIS ENABLES. MemberJunction 6.2 adds composite entity graphs: a parent
-- record and its related rows that load, validate and persist as one unit, on
-- both tiers, from a single `entity.Save()`. Today a developer opts in by hand,
-- on a shared (client + server) entity subclass:
--
--     public readonly Lines = this.DeclareRelatedRecords<OrderLineEntity>({
--         Name: 'Lines',
--         RelatedEntity: 'MJ_BizApps_Orders: Order Lines',
--         RelatedEntityJoinField: 'OrderHeaderID',
--         OrderBy: 'LineNumber ASC',
--         Load: 'explicit',
--         OnRemove: 'delete',
--         Sequence: { Field: 'LineNumber', From: 1 },
--     });
--
-- Two of those properties — `RelatedEntity` and `RelatedEntityJoinField` — are
-- already columns on this table. The rest are behavioural policy that has
-- nowhere to live. This column is that home, so CodeGen can emit the whole
-- declaration onto the generated entity subclass instead of every application
-- hand-writing it.
--
-- WHY A JSONType RATHER THAN COLUMNS. The declaration is a small, evolving
-- policy object, not a set of independent facts to query or index. `Sequence` is
-- itself a nested object; `Load` and `OnRemove` are closed value lists that will
-- grow. Modelling it as six-plus nullable scalar columns would mean a migration
-- for every new option and a table where most columns are NULL on most rows —
-- while giving up the one thing that actually matters here, which is a single
-- typed shape that the runtime option type and the generated code both agree on.
--
-- A JSONType gives that: `EntityField.JSONTypeDefinition` holds the TypeScript
-- interface, CodeGen emits a strongly-typed `RelatedRecordCollectionObject`
-- accessor, and adding an option is an interface edit plus `mj sync push` — no
-- schema change at all. This mirrors how `UserView.GridState`, `FilterState` and
-- `CardState` are already modelled.
--
-- ADDITIVE ON PURPOSE. NULL — every existing row — means "this relationship is
-- not a declared collection", which is exactly today's behaviour. Nothing is
-- generated, nothing is loaded eagerly, and no existing consumer changes. Opting
-- in is a per-relationship decision.
--
-- WHO READS IT. `EntitySubClassGeneratorBase.GenerateRelatedRecordCollections()`
-- reads this column together with `RelatedEntity` and `RelatedEntityJoinField`
-- from the same row, and emits the `DeclareRelatedRecords(...)` field initialiser
-- onto the generated entity subclass. Rows with a NULL or malformed value are
-- skipped with a logged error rather than aborting the run — one bad row must not
-- leave the repo with zero generated entities. Hand-written declarations remain
-- valid and are unaffected.
--
-- SEE ALSO. guides/TRANSACTIONS_AND_BATCHING_GUIDE.md — when to use a related
-- record collection versus a provider transaction versus a TransactionGroup.
-- =============================================================================

ALTER TABLE [${flyway:defaultSchema}].[EntityRelationship]
    ADD [RelatedRecordCollection] NVARCHAR(MAX) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional JSON policy object that declares this relationship as a first-class related-record collection, so CodeGen can emit a typed DeclareRelatedRecords(...) declaration on the entity subclass. Shape is IRelatedRecordCollectionConfig: Name (the generated property name, e.g. "Lines"), Load (''explicit'' | ''immediate'' | ''lazy'' | ''never''), Source (''database'' | ''cache''), ReadOnly, OnRemove (''delete'' | ''orphan'' | ''refuse''), OrderBy, Sequence ({ Field, From }), and ClearAfterSave. Source ''cache'' reads the related records from whichever loaded BaseEngine already holds that entity, costing no query, and defaults ReadOnly to true because those are the engine''s own instances; ''lazy'' fills on first access and requires both. RelatedEntity and RelatedEntityJoinField are NOT repeated here — they are read from this row''s own columns. NULL means the relationship is not a declared collection, which is the default and reproduces pre-6.2 behaviour exactly.',
    @level0type = N'SCHEMA',  @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',   @level1name = N'EntityRelationship',
    @level2type = N'COLUMN',  @level2name = N'RelatedRecordCollection';
GO























































/*
================================================================================================
================================================================================================
====                                                                                        ====
====                  GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL                          ====
====                          DO NOT EDIT BY HAND                                           ====
====                                                                                        ====
================================================================================================
================================================================================================

Everything below this block was produced by `mj codegen` against a database carrying the
hand-written DDL above. It is the generated counterpart of that DDL.

HOW IT WAS GENERATED
  A dedicated database (MJ_6_1_0_BaseEntity) was built from this branch's full migration set --
  `next` plus the DDL above -- so the output is attributable to this migration alone and carries
  no in-flight work from any other branch.

WHAT IT CONTAINS
  * The new EntityField row for MJ: Entity Relationships.RelatedRecordCollection. This row is
    what makes the column visible to the metadata layer at all: without it
    `EntityRelationshipInfo.RelatedRecordCollection` is always null and CodeGen's
    `GenerateRelatedRecordCollections()` has nothing to read.
  * 36 EntityField category/display updates for MJ: Entity Relationships (GeneratedFormSection,
    DisplayName, ExtendedType, CodeType), each guarded by `AutoUpdateCategory = 1` so a field a
    deployment has deliberately pinned is left alone.
  * Regenerated spCreateEntityRelationship / spUpdateEntityRelationship / spDeleteEntityRelationship
    plus their permission grants, so the new column round-trips through the write path.
  * `sp_refreshview` on vwEntityRelationships -- that view is a custom base view, so it is rebound
    rather than regenerated, which is how the new column reaches the read path.

Verified on generation: references ${flyway:defaultSchema} throughout with no hardcoded schema
name, and every statement is attributable to the DDL above.

IF THE HAND-WRITTEN DDL ABOVE CHANGES, DO NOT PATCH THIS SECTION BY HAND.
Re-run CodeGen and replace this entire generated section wholesale.
================================================================================================
*/

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '63d34842-09ba-47e6-8467-ae8783446cec' OR (EntityID = 'E2238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RelatedRecordCollection')) BEGIN
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
            '63d34842-09ba-47e6-8467-ae8783446cec',
            'E2238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Entity Relationships
            100062,
            'RelatedRecordCollection',
            'Related Record Collection',
            'Optional JSON policy object that declares this relationship as a first-class related-record collection, so CodeGen can emit a typed DeclareRelatedRecords(...) declaration on the entity subclass. Shape is IRelatedRecordCollectionConfig: Name (the generated property name, e.g. "Lines"), Load (''explicit'' | ''immediate'' | ''lazy'' | ''never''), Source (''database'' | ''cache''), ReadOnly, OnRemove (''delete'' | ''orphan'' | ''refuse''), OrderBy, Sequence ({ Field, From }), and ClearAfterSave. Source ''cache'' reads the related records from whichever loaded BaseEngine already holds that entity, costing no query, and defaults ReadOnly to true because those are the engine''s own instances; ''lazy'' fills on first access and requires both. RelatedEntity and RelatedEntityJoinField are NOT repeated here — they are read from this row''s own columns. NULL means the relationship is not a declared collection, which is the default and reproduces pre-6.2 behaviour exactly.',
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

/* Index for Foreign Keys for EntityRelationship */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Relationships
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

/* Base View Permissions SQL for MJ: Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Relationships
-- Item: Permissions for vwEntityRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityRelationships] TO [cdp_Integration], [cdp_Developer], [cdp_UI];

/* spCreate SQL for MJ: Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Relationships
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
    @EntityKeyField_Clear bit = 0,
    @EntityKeyField nvarchar(255) = NULL,
    @RelatedEntityJoinField nvarchar(255),
    @JoinView_Clear bit = 0,
    @JoinView nvarchar(255) = NULL,
    @JoinEntityJoinField_Clear bit = 0,
    @JoinEntityJoinField nvarchar(255) = NULL,
    @JoinEntityInverseJoinField_Clear bit = 0,
    @JoinEntityInverseJoinField nvarchar(255) = NULL,
    @DisplayInForm bit = NULL,
    @DisplayLocation nvarchar(50) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @DisplayIconType nvarchar(50) = NULL,
    @DisplayIcon_Clear bit = 0,
    @DisplayIcon nvarchar(255) = NULL,
    @DisplayComponentID_Clear bit = 0,
    @DisplayComponentID uniqueidentifier = NULL,
    @DisplayComponentConfiguration_Clear bit = 0,
    @DisplayComponentConfiguration nvarchar(MAX) = NULL,
    @AutoUpdateFromSchema bit = NULL,
    @AdditionalFieldsToInclude_Clear bit = 0,
    @AdditionalFieldsToInclude nvarchar(MAX) = NULL,
    @AutoUpdateAdditionalFieldsToInclude bit = NULL,
    @RelatedRecordCollection_Clear bit = 0,
    @RelatedRecordCollection nvarchar(MAX) = NULL
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
                [AutoUpdateAdditionalFieldsToInclude],
                [RelatedRecordCollection]
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
                CASE WHEN @EntityKeyField_Clear = 1 THEN NULL ELSE ISNULL(@EntityKeyField, NULL) END,
                @RelatedEntityJoinField,
                CASE WHEN @JoinView_Clear = 1 THEN NULL ELSE ISNULL(@JoinView, NULL) END,
                CASE WHEN @JoinEntityJoinField_Clear = 1 THEN NULL ELSE ISNULL(@JoinEntityJoinField, NULL) END,
                CASE WHEN @JoinEntityInverseJoinField_Clear = 1 THEN NULL ELSE ISNULL(@JoinEntityInverseJoinField, NULL) END,
                ISNULL(@DisplayInForm, 1),
                ISNULL(@DisplayLocation, 'After Field Tabs'),
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                ISNULL(@DisplayIconType, 'Related Entity Icon'),
                CASE WHEN @DisplayIcon_Clear = 1 THEN NULL ELSE ISNULL(@DisplayIcon, NULL) END,
                CASE WHEN @DisplayComponentID_Clear = 1 THEN NULL ELSE ISNULL(@DisplayComponentID, NULL) END,
                CASE WHEN @DisplayComponentConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@DisplayComponentConfiguration, NULL) END,
                ISNULL(@AutoUpdateFromSchema, 1),
                CASE WHEN @AdditionalFieldsToInclude_Clear = 1 THEN NULL ELSE ISNULL(@AdditionalFieldsToInclude, NULL) END,
                ISNULL(@AutoUpdateAdditionalFieldsToInclude, 1),
                CASE WHEN @RelatedRecordCollection_Clear = 1 THEN NULL ELSE ISNULL(@RelatedRecordCollection, NULL) END
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
                [AutoUpdateAdditionalFieldsToInclude],
                [RelatedRecordCollection]
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
                CASE WHEN @EntityKeyField_Clear = 1 THEN NULL ELSE ISNULL(@EntityKeyField, NULL) END,
                @RelatedEntityJoinField,
                CASE WHEN @JoinView_Clear = 1 THEN NULL ELSE ISNULL(@JoinView, NULL) END,
                CASE WHEN @JoinEntityJoinField_Clear = 1 THEN NULL ELSE ISNULL(@JoinEntityJoinField, NULL) END,
                CASE WHEN @JoinEntityInverseJoinField_Clear = 1 THEN NULL ELSE ISNULL(@JoinEntityInverseJoinField, NULL) END,
                ISNULL(@DisplayInForm, 1),
                ISNULL(@DisplayLocation, 'After Field Tabs'),
                CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, NULL) END,
                ISNULL(@DisplayIconType, 'Related Entity Icon'),
                CASE WHEN @DisplayIcon_Clear = 1 THEN NULL ELSE ISNULL(@DisplayIcon, NULL) END,
                CASE WHEN @DisplayComponentID_Clear = 1 THEN NULL ELSE ISNULL(@DisplayComponentID, NULL) END,
                CASE WHEN @DisplayComponentConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@DisplayComponentConfiguration, NULL) END,
                ISNULL(@AutoUpdateFromSchema, 1),
                CASE WHEN @AdditionalFieldsToInclude_Clear = 1 THEN NULL ELSE ISNULL(@AdditionalFieldsToInclude, NULL) END,
                ISNULL(@AutoUpdateAdditionalFieldsToInclude, 1),
                CASE WHEN @RelatedRecordCollection_Clear = 1 THEN NULL ELSE ISNULL(@RelatedRecordCollection, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityRelationships] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRelationship] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRelationship] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Relationships
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
    @EntityID uniqueidentifier = NULL,
    @Sequence int = NULL,
    @RelatedEntityID uniqueidentifier = NULL,
    @BundleInAPI bit = NULL,
    @IncludeInParentAllQuery bit = NULL,
    @Type nchar(20) = NULL,
    @EntityKeyField_Clear bit = 0,
    @EntityKeyField nvarchar(255) = NULL,
    @RelatedEntityJoinField nvarchar(255) = NULL,
    @JoinView_Clear bit = 0,
    @JoinView nvarchar(255) = NULL,
    @JoinEntityJoinField_Clear bit = 0,
    @JoinEntityJoinField nvarchar(255) = NULL,
    @JoinEntityInverseJoinField_Clear bit = 0,
    @JoinEntityInverseJoinField nvarchar(255) = NULL,
    @DisplayInForm bit = NULL,
    @DisplayLocation nvarchar(50) = NULL,
    @DisplayName_Clear bit = 0,
    @DisplayName nvarchar(255) = NULL,
    @DisplayIconType nvarchar(50) = NULL,
    @DisplayIcon_Clear bit = 0,
    @DisplayIcon nvarchar(255) = NULL,
    @DisplayComponentID_Clear bit = 0,
    @DisplayComponentID uniqueidentifier = NULL,
    @DisplayComponentConfiguration_Clear bit = 0,
    @DisplayComponentConfiguration nvarchar(MAX) = NULL,
    @AutoUpdateFromSchema bit = NULL,
    @AdditionalFieldsToInclude_Clear bit = 0,
    @AdditionalFieldsToInclude nvarchar(MAX) = NULL,
    @AutoUpdateAdditionalFieldsToInclude bit = NULL,
    @RelatedRecordCollection_Clear bit = 0,
    @RelatedRecordCollection nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRelationship]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [RelatedEntityID] = ISNULL(@RelatedEntityID, [RelatedEntityID]),
        [BundleInAPI] = ISNULL(@BundleInAPI, [BundleInAPI]),
        [IncludeInParentAllQuery] = ISNULL(@IncludeInParentAllQuery, [IncludeInParentAllQuery]),
        [Type] = ISNULL(@Type, [Type]),
        [EntityKeyField] = CASE WHEN @EntityKeyField_Clear = 1 THEN NULL ELSE ISNULL(@EntityKeyField, [EntityKeyField]) END,
        [RelatedEntityJoinField] = ISNULL(@RelatedEntityJoinField, [RelatedEntityJoinField]),
        [JoinView] = CASE WHEN @JoinView_Clear = 1 THEN NULL ELSE ISNULL(@JoinView, [JoinView]) END,
        [JoinEntityJoinField] = CASE WHEN @JoinEntityJoinField_Clear = 1 THEN NULL ELSE ISNULL(@JoinEntityJoinField, [JoinEntityJoinField]) END,
        [JoinEntityInverseJoinField] = CASE WHEN @JoinEntityInverseJoinField_Clear = 1 THEN NULL ELSE ISNULL(@JoinEntityInverseJoinField, [JoinEntityInverseJoinField]) END,
        [DisplayInForm] = ISNULL(@DisplayInForm, [DisplayInForm]),
        [DisplayLocation] = ISNULL(@DisplayLocation, [DisplayLocation]),
        [DisplayName] = CASE WHEN @DisplayName_Clear = 1 THEN NULL ELSE ISNULL(@DisplayName, [DisplayName]) END,
        [DisplayIconType] = ISNULL(@DisplayIconType, [DisplayIconType]),
        [DisplayIcon] = CASE WHEN @DisplayIcon_Clear = 1 THEN NULL ELSE ISNULL(@DisplayIcon, [DisplayIcon]) END,
        [DisplayComponentID] = CASE WHEN @DisplayComponentID_Clear = 1 THEN NULL ELSE ISNULL(@DisplayComponentID, [DisplayComponentID]) END,
        [DisplayComponentConfiguration] = CASE WHEN @DisplayComponentConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@DisplayComponentConfiguration, [DisplayComponentConfiguration]) END,
        [AutoUpdateFromSchema] = ISNULL(@AutoUpdateFromSchema, [AutoUpdateFromSchema]),
        [AdditionalFieldsToInclude] = CASE WHEN @AdditionalFieldsToInclude_Clear = 1 THEN NULL ELSE ISNULL(@AdditionalFieldsToInclude, [AdditionalFieldsToInclude]) END,
        [AutoUpdateAdditionalFieldsToInclude] = ISNULL(@AutoUpdateAdditionalFieldsToInclude, [AutoUpdateAdditionalFieldsToInclude]),
        [RelatedRecordCollection] = CASE WHEN @RelatedRecordCollection_Clear = 1 THEN NULL ELSE ISNULL(@RelatedRecordCollection, [RelatedRecordCollection]) END
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

/* spUpdate Permissions for MJ: Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRelationship] TO [cdp_Integration], [cdp_Developer];

/* spDelete SQL for MJ: Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Relationships
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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer];

/* spDelete Permissions for MJ: Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer];

/* Set categories for 36 fields */

-- UPDATE Entity Field Category Info MJ: Entity Relationships.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5D4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5E4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.Sequence 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '104F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Entity',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5F4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Relationship Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '614D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.EntityKeyField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '824D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedEntityJoinField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '624D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.JoinView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '634D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.JoinEntityJoinField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '644D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.JoinEntityInverseJoinField 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '654D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '205817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.EntityBaseTable 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '215817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.EntityBaseView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '225817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '235817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedEntityBaseTable 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '245817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedEntityBaseView 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '255817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedEntityClassName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedEntityCodeName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BC4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedEntityBaseTableCodeName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BD4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.BundleInAPI 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '604D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.IncludeInParentAllQuery 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Include In Parent Query',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '944D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.AdditionalFieldsToInclude 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Additional Fields',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '77AF286F-1A6B-4119-B569-86664154F757' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.AutoUpdateAdditionalFieldsToInclude 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Auto-Update Additional Fields',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AC4AB7A1-6B60-4D47-8443-BFAFC15B0E6A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.RelatedRecordCollection 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'API & Query Settings',
   GeneratedFormSection = 'Category',
   DisplayName = 'Related Record Collection Policy',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '63D34842-09BA-47E6-8467-AE8783446CEC' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayInForm 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '984D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayLocation 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '994D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayIconType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '304D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayIcon 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EE5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayUserViewID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Display User View',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3E4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayComponentID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Display Component',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F15717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayComponentConfiguration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Display Component Config',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'F25717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.DisplayUserViewName 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3D4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Created At',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D25717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Updated At',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D35717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Entity Relationships.AutoUpdateFromSchema 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Auto-Update From Schema',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7E307D9F-A7FE-44A8-85D9-A97C85EF1C71' AND AutoUpdateCategory = 1;

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwEntityRelationships';

