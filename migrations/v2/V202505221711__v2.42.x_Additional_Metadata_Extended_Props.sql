-- Update the Status field for these to deprecated
UPDATE ${flyway:defaultSchema}.Entity SET Status='Deprecated' WHERE ID IN (
    'FE238F34-2837-EF11-86D4-6045BDEE16E6', -- AI Actions ---- do this in future with regular Action and invoke an AI Agent that has been exposed as an action
	'785C70B0-A456-4844-AF74-03AB8B55F633',	-- AI Agent Models - using AIPromptModel instead - more granular
	'FF238F34-2837-EF11-86D4-6045BDEE16E6',	-- AI Model Actions - using AIAgentAction instead
	'00248F34-2837-EF11-86D4-6045BDEE16E6'	-- Entity AI Actions ---- do this in future with regular Entity ction and invoke an AI Agent that has been exposed as an action
)





/************* CODEGEN *************/
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField
         WHERE ID = '2212928a-d5d0-4ae3-8f5a-25c4dfe8c373'  OR
               (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'AutoRowCountFrequency')
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
            '2212928a-d5d0-4ae3-8f5a-25c4dfe8c373',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entities
            53,
            'AutoRowCountFrequency',
            'Auto Row Count Frequency',
            'Frequency in hours for automatically performing row counts on this entity. If NULL, automatic row counting is disabled. If greater than 0, schedules recurring SELECT COUNT(*) queries at the specified interval.',
            'int',
            4,
            10,
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
         WHERE ID = '84c51291-65ab-4677-a0b6-5dacd698a255'  OR
               (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RowCount')
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
            '84c51291-65ab-4677-a0b6-5dacd698a255',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entities
            54,
            'RowCount',
            'Row Count',
            'Cached row count for this entity, populated by automatic row count processes when AutoRowCountFrequency is configured.',
            'bigint',
            8,
            19,
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
         WHERE ID = '5a02de6f-6d75-46b7-b800-d42b82227d1a'  OR
               (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RowCountRunAt')
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
            '5a02de6f-6d75-46b7-b800-d42b82227d1a',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entities
            55,
            'RowCountRunAt',
            'Row Count Run At',
            'Timestamp indicating when the last automatic row count was performed for this entity.',
            'datetimeoffset',
            10,
            34,
            7,
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
         WHERE ID = 'b9992893-7bd7-42ea-a2a8-48928d7a5cce'  OR
               (EntityID = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Status')
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
            'b9992893-7bd7-42ea-a2a8-48928d7a5cce',
            'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entities
            56,
            'Status',
            'Status',
            'Status of the entity. Active: fully functional; Deprecated: functional but generates console warnings when used; Disabled: not available for use even though metadata and physical table remain.',
            'nvarchar',
            50,
            0,
            0,
            0,
            'Active',
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
         WHERE ID = '1ab8dcbd-7946-42f0-866d-f9123fc4dc5d'  OR
               (EntityID = 'E4238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Thumbnail')
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
            '1ab8dcbd-7946-42f0-866d-f9123fc4dc5d',
            'E4238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: User Views
            21,
            'Thumbnail',
            'Thumbnail',
            'Thumbnail image for the user view that can be displayed in gallery views. Can contain either a URL to an image file or a Base64-encoded image string.',
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
         WHERE ID = '42de7b62-c988-451f-8a65-7a2b26b66067'  OR
               (EntityID = '05248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DriverClass')
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
            '42de7b62-c988-451f-8a65-7a2b26b66067',
            '05248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Dashboards
            14,
            'DriverClass',
            'Driver Class',
            'Specifies the runtime class that will be used for the Dashboard when Type is set to ''Code''. This class contains the custom logic and implementation for code-based dashboards.',
            'nvarchar',
            510,
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
         WHERE ID = '291ef341-1318-4b86-a9a7-1180ce820609'  OR
               (EntityID = '09248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Thumbnail')
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
            '291ef341-1318-4b86-a9a7-1180ce820609',
            '09248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Reports
            19,
            'Thumbnail',
            'Thumbnail',
            'Thumbnail image for the report that can be displayed in gallery views. Can contain either a URL to an image file or a Base64-encoded image string.',
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

/* Index for Foreign Keys for Entity */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Entity
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Entity_ParentID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Entity]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Entity_ParentID ON [${flyway:defaultSchema}].[Entity] ([ParentID]);

/* Base View Permissions SQL for Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: Permissions for vwEntities
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntities] TO [cdp_Developer], [cdp_Integration], [cdp_UI]

/* spCreate SQL for Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: spCreateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Entity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntity]
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @DeleteType nvarchar(10),
    @AllowRecordMerge bit,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @ScopeDefault nvarchar(100),
    @RowsToPackWithSchema nvarchar(20),
    @RowsToPackSampleMethod nvarchar(20),
    @RowsToPackSampleCount int,
    @RowsToPackSampleOrder nvarchar(MAX),
    @AutoRowCountFrequency int,
    @RowCount bigint,
    @RowCountRunAt datetimeoffset,
    @Status nvarchar(25)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[Entity]
        (
            [ParentID],
            [Name],
            [NameSuffix],
            [Description],
            [AutoUpdateDescription],
            [BaseView],
            [BaseViewGenerated],
            [VirtualEntity],
            [TrackRecordChanges],
            [AuditRecordAccess],
            [AuditViewRuns],
            [IncludeInAPI],
            [AllowAllRowsAPI],
            [AllowUpdateAPI],
            [AllowCreateAPI],
            [AllowDeleteAPI],
            [CustomResolverAPI],
            [AllowUserSearchAPI],
            [FullTextSearchEnabled],
            [FullTextCatalog],
            [FullTextCatalogGenerated],
            [FullTextIndex],
            [FullTextIndexGenerated],
            [FullTextSearchFunction],
            [FullTextSearchFunctionGenerated],
            [UserViewMaxRows],
            [spCreate],
            [spUpdate],
            [spDelete],
            [spCreateGenerated],
            [spUpdateGenerated],
            [spDeleteGenerated],
            [CascadeDeletes],
            [DeleteType],
            [AllowRecordMerge],
            [spMatch],
            [RelationshipDefaultDisplayType],
            [UserFormGenerated],
            [EntityObjectSubclassName],
            [EntityObjectSubclassImport],
            [PreferredCommunicationField],
            [Icon],
            [ScopeDefault],
            [RowsToPackWithSchema],
            [RowsToPackSampleMethod],
            [RowsToPackSampleCount],
            [RowsToPackSampleOrder],
            [AutoRowCountFrequency],
            [RowCount],
            [RowCountRunAt],
            [Status]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ParentID,
            @Name,
            @NameSuffix,
            @Description,
            @AutoUpdateDescription,
            @BaseView,
            @BaseViewGenerated,
            @VirtualEntity,
            @TrackRecordChanges,
            @AuditRecordAccess,
            @AuditViewRuns,
            @IncludeInAPI,
            @AllowAllRowsAPI,
            @AllowUpdateAPI,
            @AllowCreateAPI,
            @AllowDeleteAPI,
            @CustomResolverAPI,
            @AllowUserSearchAPI,
            @FullTextSearchEnabled,
            @FullTextCatalog,
            @FullTextCatalogGenerated,
            @FullTextIndex,
            @FullTextIndexGenerated,
            @FullTextSearchFunction,
            @FullTextSearchFunctionGenerated,
            @UserViewMaxRows,
            @spCreate,
            @spUpdate,
            @spDelete,
            @spCreateGenerated,
            @spUpdateGenerated,
            @spDeleteGenerated,
            @CascadeDeletes,
            @DeleteType,
            @AllowRecordMerge,
            @spMatch,
            @RelationshipDefaultDisplayType,
            @UserFormGenerated,
            @EntityObjectSubclassName,
            @EntityObjectSubclassImport,
            @PreferredCommunicationField,
            @Icon,
            @ScopeDefault,
            @RowsToPackWithSchema,
            @RowsToPackSampleMethod,
            @RowsToPackSampleCount,
            @RowsToPackSampleOrder,
            @AutoRowCountFrequency,
            @RowCount,
            @RowCountRunAt,
            @Status
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntities] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration]


/* spCreate Permissions for Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntity] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: spUpdateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Entity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntity]
    @ID uniqueidentifier,
    @ParentID uniqueidentifier,
    @Name nvarchar(255),
    @NameSuffix nvarchar(255),
    @Description nvarchar(MAX),
    @AutoUpdateDescription bit,
    @BaseView nvarchar(255),
    @BaseViewGenerated bit,
    @VirtualEntity bit,
    @TrackRecordChanges bit,
    @AuditRecordAccess bit,
    @AuditViewRuns bit,
    @IncludeInAPI bit,
    @AllowAllRowsAPI bit,
    @AllowUpdateAPI bit,
    @AllowCreateAPI bit,
    @AllowDeleteAPI bit,
    @CustomResolverAPI bit,
    @AllowUserSearchAPI bit,
    @FullTextSearchEnabled bit,
    @FullTextCatalog nvarchar(255),
    @FullTextCatalogGenerated bit,
    @FullTextIndex nvarchar(255),
    @FullTextIndexGenerated bit,
    @FullTextSearchFunction nvarchar(255),
    @FullTextSearchFunctionGenerated bit,
    @UserViewMaxRows int,
    @spCreate nvarchar(255),
    @spUpdate nvarchar(255),
    @spDelete nvarchar(255),
    @spCreateGenerated bit,
    @spUpdateGenerated bit,
    @spDeleteGenerated bit,
    @CascadeDeletes bit,
    @DeleteType nvarchar(10),
    @AllowRecordMerge bit,
    @spMatch nvarchar(255),
    @RelationshipDefaultDisplayType nvarchar(20),
    @UserFormGenerated bit,
    @EntityObjectSubclassName nvarchar(255),
    @EntityObjectSubclassImport nvarchar(255),
    @PreferredCommunicationField nvarchar(255),
    @Icon nvarchar(500),
    @ScopeDefault nvarchar(100),
    @RowsToPackWithSchema nvarchar(20),
    @RowsToPackSampleMethod nvarchar(20),
    @RowsToPackSampleCount int,
    @RowsToPackSampleOrder nvarchar(MAX),
    @AutoRowCountFrequency int,
    @RowCount bigint,
    @RowCountRunAt datetimeoffset,
    @Status nvarchar(25)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        [ParentID] = @ParentID,
        [Name] = @Name,
        [NameSuffix] = @NameSuffix,
        [Description] = @Description,
        [AutoUpdateDescription] = @AutoUpdateDescription,
        [BaseView] = @BaseView,
        [BaseViewGenerated] = @BaseViewGenerated,
        [VirtualEntity] = @VirtualEntity,
        [TrackRecordChanges] = @TrackRecordChanges,
        [AuditRecordAccess] = @AuditRecordAccess,
        [AuditViewRuns] = @AuditViewRuns,
        [IncludeInAPI] = @IncludeInAPI,
        [AllowAllRowsAPI] = @AllowAllRowsAPI,
        [AllowUpdateAPI] = @AllowUpdateAPI,
        [AllowCreateAPI] = @AllowCreateAPI,
        [AllowDeleteAPI] = @AllowDeleteAPI,
        [CustomResolverAPI] = @CustomResolverAPI,
        [AllowUserSearchAPI] = @AllowUserSearchAPI,
        [FullTextSearchEnabled] = @FullTextSearchEnabled,
        [FullTextCatalog] = @FullTextCatalog,
        [FullTextCatalogGenerated] = @FullTextCatalogGenerated,
        [FullTextIndex] = @FullTextIndex,
        [FullTextIndexGenerated] = @FullTextIndexGenerated,
        [FullTextSearchFunction] = @FullTextSearchFunction,
        [FullTextSearchFunctionGenerated] = @FullTextSearchFunctionGenerated,
        [UserViewMaxRows] = @UserViewMaxRows,
        [spCreate] = @spCreate,
        [spUpdate] = @spUpdate,
        [spDelete] = @spDelete,
        [spCreateGenerated] = @spCreateGenerated,
        [spUpdateGenerated] = @spUpdateGenerated,
        [spDeleteGenerated] = @spDeleteGenerated,
        [CascadeDeletes] = @CascadeDeletes,
        [DeleteType] = @DeleteType,
        [AllowRecordMerge] = @AllowRecordMerge,
        [spMatch] = @spMatch,
        [RelationshipDefaultDisplayType] = @RelationshipDefaultDisplayType,
        [UserFormGenerated] = @UserFormGenerated,
        [EntityObjectSubclassName] = @EntityObjectSubclassName,
        [EntityObjectSubclassImport] = @EntityObjectSubclassImport,
        [PreferredCommunicationField] = @PreferredCommunicationField,
        [Icon] = @Icon,
        [ScopeDefault] = @ScopeDefault,
        [RowsToPackWithSchema] = @RowsToPackWithSchema,
        [RowsToPackSampleMethod] = @RowsToPackSampleMethod,
        [RowsToPackSampleCount] = @RowsToPackSampleCount,
        [RowsToPackSampleOrder] = @RowsToPackSampleOrder,
        [AutoRowCountFrequency] = @AutoRowCountFrequency,
        [RowCount] = @RowCount,
        [RowCountRunAt] = @RowCountRunAt,
        [Status] = @Status
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntities]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the Entity table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateEntity
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntity
ON [${flyway:defaultSchema}].[Entity]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Entity]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Entity] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntity] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entities
-- Item: spDeleteEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Entity
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteEntity]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntity]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Entity]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration]


/* spDelete Permissions for Entities */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntity] TO [cdp_Developer], [cdp_Integration]



/* Index for Foreign Keys for UserView */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table UserView
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserView_UserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserView_UserID ON [${flyway:defaultSchema}].[UserView] ([UserID]);

-- Index for foreign key EntityID in table UserView
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserView_EntityID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserView_EntityID ON [${flyway:defaultSchema}].[UserView] ([EntityID]);

-- Index for foreign key CategoryID in table UserView
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_UserView_CategoryID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[UserView]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_UserView_CategoryID ON [${flyway:defaultSchema}].[UserView] ([CategoryID]);

/* Base View Permissions SQL for User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: Permissions for vwUserViews
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwUserViews] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: spCreateUserView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserView
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateUserView]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserView]
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @IsShared bit,
    @IsDefault bit,
    @GridState nvarchar(MAX),
    @FilterState nvarchar(MAX),
    @CustomFilterState bit,
    @SmartFilterEnabled bit,
    @SmartFilterPrompt nvarchar(MAX),
    @SmartFilterWhereClause nvarchar(MAX),
    @SmartFilterExplanation nvarchar(MAX),
    @WhereClause nvarchar(MAX),
    @CustomWhereClause bit,
    @SortState nvarchar(MAX),
    @Thumbnail nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[UserView]
        (
            [UserID],
            [EntityID],
            [Name],
            [Description],
            [CategoryID],
            [IsShared],
            [IsDefault],
            [GridState],
            [FilterState],
            [CustomFilterState],
            [SmartFilterEnabled],
            [SmartFilterPrompt],
            [SmartFilterWhereClause],
            [SmartFilterExplanation],
            [WhereClause],
            [CustomWhereClause],
            [SortState],
            [Thumbnail]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @UserID,
            @EntityID,
            @Name,
            @Description,
            @CategoryID,
            @IsShared,
            @IsDefault,
            @GridState,
            @FilterState,
            @CustomFilterState,
            @SmartFilterEnabled,
            @SmartFilterPrompt,
            @SmartFilterWhereClause,
            @SmartFilterExplanation,
            @WhereClause,
            @CustomWhereClause,
            @SortState,
            @Thumbnail
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwUserViews] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]


/* spCreate Permissions for User Views */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spUpdate SQL for User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: spUpdateUserView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserView
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateUserView]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserView]
    @ID uniqueidentifier,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @IsShared bit,
    @IsDefault bit,
    @GridState nvarchar(MAX),
    @FilterState nvarchar(MAX),
    @CustomFilterState bit,
    @SmartFilterEnabled bit,
    @SmartFilterPrompt nvarchar(MAX),
    @SmartFilterWhereClause nvarchar(MAX),
    @SmartFilterExplanation nvarchar(MAX),
    @WhereClause nvarchar(MAX),
    @CustomWhereClause bit,
    @SortState nvarchar(MAX),
    @Thumbnail nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserView]
    SET
        [UserID] = @UserID,
        [EntityID] = @EntityID,
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [IsShared] = @IsShared,
        [IsDefault] = @IsDefault,
        [GridState] = @GridState,
        [FilterState] = @FilterState,
        [CustomFilterState] = @CustomFilterState,
        [SmartFilterEnabled] = @SmartFilterEnabled,
        [SmartFilterPrompt] = @SmartFilterPrompt,
        [SmartFilterWhereClause] = @SmartFilterWhereClause,
        [SmartFilterExplanation] = @SmartFilterExplanation,
        [WhereClause] = @WhereClause,
        [CustomWhereClause] = @CustomWhereClause,
        [SortState] = @SortState,
        [Thumbnail] = @Thumbnail
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwUserViews]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the UserView table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateUserView
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserView
ON [${flyway:defaultSchema}].[UserView]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserView]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserView] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for User Views */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* spDelete SQL for User Views */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: User Views
-- Item: spDeleteUserView
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR UserView
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteUserView]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteUserView]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[UserView]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]


/* spDelete Permissions for User Views */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteUserView] TO [cdp_Integration], [cdp_Developer], [cdp_UI]



/* Index for Foreign Keys for Dashboard */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key UserID in table Dashboard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dashboard_UserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dashboard_UserID ON [${flyway:defaultSchema}].[Dashboard] ([UserID]);

-- Index for foreign key CategoryID in table Dashboard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dashboard_CategoryID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dashboard_CategoryID ON [${flyway:defaultSchema}].[Dashboard] ([CategoryID]);

-- Index for foreign key ApplicationID in table Dashboard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Dashboard_ApplicationID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Dashboard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Dashboard_ApplicationID ON [${flyway:defaultSchema}].[Dashboard] ([ApplicationID]);

/* Index for Foreign Keys for Report */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_CategoryID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_CategoryID ON [${flyway:defaultSchema}].[Report] ([CategoryID]);

-- Index for foreign key UserID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_UserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_UserID ON [${flyway:defaultSchema}].[Report] ([UserID]);

-- Index for foreign key ConversationID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_ConversationID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_ConversationID ON [${flyway:defaultSchema}].[Report] ([ConversationID]);

-- Index for foreign key ConversationDetailID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_ConversationDetailID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_ConversationDetailID ON [${flyway:defaultSchema}].[Report] ([ConversationDetailID]);

-- Index for foreign key DataContextID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_DataContextID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_DataContextID ON [${flyway:defaultSchema}].[Report] ([DataContextID]);

-- Index for foreign key OutputTriggerTypeID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_OutputTriggerTypeID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_OutputTriggerTypeID ON [${flyway:defaultSchema}].[Report] ([OutputTriggerTypeID]);

-- Index for foreign key OutputFormatTypeID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_OutputFormatTypeID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_OutputFormatTypeID ON [${flyway:defaultSchema}].[Report] ([OutputFormatTypeID]);

-- Index for foreign key OutputDeliveryTypeID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_OutputDeliveryTypeID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_OutputDeliveryTypeID ON [${flyway:defaultSchema}].[Report] ([OutputDeliveryTypeID]);

-- Index for foreign key OutputWorkflowID in table Report
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Report_OutputWorkflowID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Report]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Report_OutputWorkflowID ON [${flyway:defaultSchema}].[Report] ([OutputWorkflowID]);

/* Base View SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: vwDashboards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Dashboards
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Dashboard
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwDashboards]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDashboards]
AS
SELECT
    d.*,
    User_UserID.[Name] AS [User],
    DashboardCategory_CategoryID.[Name] AS [Category],
    Application_ApplicationID.[Name] AS [Application]
FROM
    [${flyway:defaultSchema}].[Dashboard] AS d
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [d].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DashboardCategory] AS DashboardCategory_CategoryID
  ON
    [d].[CategoryID] = DashboardCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Application] AS Application_ApplicationID
  ON
    [d].[ApplicationID] = Application_ApplicationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboards] TO [cdp_UI]


/* Base View Permissions SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: Permissions for vwDashboards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDashboards] TO [cdp_UI]

/* spCreate SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: spCreateDashboard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Dashboard
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateDashboard]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDashboard]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @UIConfigDetails nvarchar(MAX),
    @Type nvarchar(20),
    @Thumbnail nvarchar(MAX),
    @Scope nvarchar(20),
    @ApplicationID uniqueidentifier,
    @Code nvarchar(255),
    @DriverClass nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[Dashboard]
        (
            [Name],
            [Description],
            [UserID],
            [CategoryID],
            [UIConfigDetails],
            [Type],
            [Thumbnail],
            [Scope],
            [ApplicationID],
            [Code],
            [DriverClass]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @UserID,
            @CategoryID,
            @UIConfigDetails,
            @Type,
            @Thumbnail,
            @Scope,
            @ApplicationID,
            @Code,
            @DriverClass
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDashboards] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboard] TO [cdp_UI]


/* spCreate Permissions for Dashboards */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDashboard] TO [cdp_UI]



/* spUpdate SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: spUpdateDashboard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Dashboard
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateDashboard]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDashboard]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @UserID uniqueidentifier,
    @CategoryID uniqueidentifier,
    @UIConfigDetails nvarchar(MAX),
    @Type nvarchar(20),
    @Thumbnail nvarchar(MAX),
    @Scope nvarchar(20),
    @ApplicationID uniqueidentifier,
    @Code nvarchar(255),
    @DriverClass nvarchar(255)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Dashboard]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [UserID] = @UserID,
        [CategoryID] = @CategoryID,
        [UIConfigDetails] = @UIConfigDetails,
        [Type] = @Type,
        [Thumbnail] = @Thumbnail,
        [Scope] = @Scope,
        [ApplicationID] = @ApplicationID,
        [Code] = @Code,
        [DriverClass] = @DriverClass
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDashboards]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboard] TO [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the Dashboard table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateDashboard
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDashboard
ON [${flyway:defaultSchema}].[Dashboard]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Dashboard]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Dashboard] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for Dashboards */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDashboard] TO [cdp_UI]



/* spDelete SQL for Dashboards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Dashboards
-- Item: spDeleteDashboard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Dashboard
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteDashboard]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDashboard]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Dashboard]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboard] TO [cdp_UI]


/* spDelete Permissions for Dashboards */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDashboard] TO [cdp_UI]



/* Base View SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: vwReports
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      Reports
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Report
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwReports]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwReports]
AS
SELECT
    r.*,
    ReportCategory_CategoryID.[Name] AS [Category],
    User_UserID.[Name] AS [User],
    Conversation_ConversationID.[Name] AS [Conversation],
    DataContext_DataContextID.[Name] AS [DataContext],
    OutputTriggerType_OutputTriggerTypeID.[Name] AS [OutputTriggerType],
    OutputFormatType_OutputFormatTypeID.[Name] AS [OutputFormatType],
    OutputDeliveryType_OutputDeliveryTypeID.[Name] AS [OutputDeliveryType],
    Workflow_OutputWorkflowID.[Name] AS [OutputWorkflow]
FROM
    [${flyway:defaultSchema}].[Report] AS r
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ReportCategory] AS ReportCategory_CategoryID
  ON
    [r].[CategoryID] = ReportCategory_CategoryID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [r].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS Conversation_ConversationID
  ON
    [r].[ConversationID] = Conversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[DataContext] AS DataContext_DataContextID
  ON
    [r].[DataContextID] = DataContext_DataContextID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OutputTriggerType] AS OutputTriggerType_OutputTriggerTypeID
  ON
    [r].[OutputTriggerTypeID] = OutputTriggerType_OutputTriggerTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OutputFormatType] AS OutputFormatType_OutputFormatTypeID
  ON
    [r].[OutputFormatTypeID] = OutputFormatType_OutputFormatTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[OutputDeliveryType] AS OutputDeliveryType_OutputDeliveryTypeID
  ON
    [r].[OutputDeliveryTypeID] = OutputDeliveryType_OutputDeliveryTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Workflow] AS Workflow_OutputWorkflowID
  ON
    [r].[OutputWorkflowID] = Workflow_OutputWorkflowID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwReports] TO [cdp_UI]


/* Base View Permissions SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: Permissions for vwReports
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwReports] TO [cdp_UI]

/* spCreate SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: spCreateReport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Report
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateReport]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateReport]
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @UserID uniqueidentifier,
    @SharingScope nvarchar(20),
    @ConversationID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @DataContextID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @OutputTriggerTypeID uniqueidentifier,
    @OutputFormatTypeID uniqueidentifier,
    @OutputDeliveryTypeID uniqueidentifier,
    @OutputFrequency nvarchar(50),
    @OutputTargetEmail nvarchar(255),
    @OutputWorkflowID uniqueidentifier,
    @Thumbnail nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    INSERT INTO
    [${flyway:defaultSchema}].[Report]
        (
            [Name],
            [Description],
            [CategoryID],
            [UserID],
            [SharingScope],
            [ConversationID],
            [ConversationDetailID],
            [DataContextID],
            [Configuration],
            [OutputTriggerTypeID],
            [OutputFormatTypeID],
            [OutputDeliveryTypeID],
            [OutputFrequency],
            [OutputTargetEmail],
            [OutputWorkflowID],
            [Thumbnail]
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @Name,
            @Description,
            @CategoryID,
            @UserID,
            @SharingScope,
            @ConversationID,
            @ConversationDetailID,
            @DataContextID,
            @Configuration,
            @OutputTriggerTypeID,
            @OutputFormatTypeID,
            @OutputDeliveryTypeID,
            @OutputFrequency,
            @OutputTargetEmail,
            @OutputWorkflowID,
            @Thumbnail
        )
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwReports] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReport] TO [cdp_UI]


/* spCreate Permissions for Reports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateReport] TO [cdp_UI]



/* spUpdate SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: spUpdateReport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Report
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateReport]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateReport]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @CategoryID uniqueidentifier,
    @UserID uniqueidentifier,
    @SharingScope nvarchar(20),
    @ConversationID uniqueidentifier,
    @ConversationDetailID uniqueidentifier,
    @DataContextID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @OutputTriggerTypeID uniqueidentifier,
    @OutputFormatTypeID uniqueidentifier,
    @OutputDeliveryTypeID uniqueidentifier,
    @OutputFrequency nvarchar(50),
    @OutputTargetEmail nvarchar(255),
    @OutputWorkflowID uniqueidentifier,
    @Thumbnail nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Report]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [CategoryID] = @CategoryID,
        [UserID] = @UserID,
        [SharingScope] = @SharingScope,
        [ConversationID] = @ConversationID,
        [ConversationDetailID] = @ConversationDetailID,
        [DataContextID] = @DataContextID,
        [Configuration] = @Configuration,
        [OutputTriggerTypeID] = @OutputTriggerTypeID,
        [OutputFormatTypeID] = @OutputFormatTypeID,
        [OutputDeliveryTypeID] = @OutputDeliveryTypeID,
        [OutputFrequency] = @OutputFrequency,
        [OutputTargetEmail] = @OutputTargetEmail,
        [OutputWorkflowID] = @OutputWorkflowID,
        [Thumbnail] = @Thumbnail
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwReports]
                                    WHERE
                                        [ID] = @ID

END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReport] TO [cdp_UI]
GO

------------------------------------------------------------
----- TRIGGER FOR ${flyway:defaultSchema}_UpdatedAt field for the Report table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateReport
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateReport
ON [${flyway:defaultSchema}].[Report]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Report]
    SET
        ${flyway:defaultSchema}_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Report] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO


/* spUpdate Permissions for Reports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateReport] TO [cdp_UI]



/* spDelete SQL for Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Reports
-- Item: spDeleteReport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Report
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteReport]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteReport]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from ReportSnapshot
    DELETE FROM
        [${flyway:defaultSchema}].[ReportSnapshot]
    WHERE
        [ReportID] = @ID

    -- Cascade delete from ReportUserState
    DELETE FROM
        [${flyway:defaultSchema}].[ReportUserState]
    WHERE
        [ReportID] = @ID

    -- Cascade delete from ReportVersion
    DELETE FROM
        [${flyway:defaultSchema}].[ReportVersion]
    WHERE
        [ReportID] = @ID


    DELETE FROM
        [${flyway:defaultSchema}].[Report]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReport] TO [cdp_UI]


/* spDelete Permissions for Reports */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteReport] TO [cdp_UI]



-- CHECK constraint for Entities: Field: Status was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Status]=N''Disabled'' OR [Status]=N''Deprecated'' OR [Status]=N''Active'')', 'public ValidateStatusAllowedValues(result: ValidationResult) {
	const allowedValues = ["Disabled", "Deprecated", "Active"];
	if (this.Status !== undefined && this.Status !== null && !allowedValues.includes(this.Status)) {
		result.Errors.push(new ValidationErrorInfo("Status", "Status must be either ''Disabled'', ''Deprecated'', or ''Active''.", this.Status, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the status of the record can only be ''Disabled'', ''Deprecated'', or ''Active''. No other values are allowed.', 'ValidateStatusAllowedValues', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'B9992893-7BD7-42EA-A2A8-48928D7A5CCE');




/***** CAUGHT MISSING EntityFieldValues and EntityField.ValueListType missing because of N' prefix on their literals in check
       constraint. This was fixed in the codegen and the migration was generated again. *****/
/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('B007D2D5-549E-4688-B48D-8EDD2C5075D4', 1, 'Exact', 'Exact')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('B007D2D5-549E-4688-B48D-8EDD2C5075D4', 2, 'Vector', 'Vector')

/* SQL text to update ValueListType for entity field ID B007D2D5-549E-4688-B48D-8EDD2C5075D4 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B007D2D5-549E-4688-B48D-8EDD2C5075D4'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('F928E66C-7FA4-46B7-A08C-DB1784B52F58', 1, 'Active', 'Active')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('F928E66C-7FA4-46B7-A08C-DB1784B52F58', 2, 'Inactive', 'Inactive')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('F928E66C-7FA4-46B7-A08C-DB1784B52F58', 3, 'Deprecated', 'Deprecated')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('F928E66C-7FA4-46B7-A08C-DB1784B52F58', 4, 'Preview', 'Preview')

/* SQL text to update ValueListType for entity field ID F928E66C-7FA4-46B7-A08C-DB1784B52F58 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F928E66C-7FA4-46B7-A08C-DB1784B52F58'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1B9F8D2C-F8B4-45D1-B45C-2E946B0C9429', 1, 'Active', 'Active')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1B9F8D2C-F8B4-45D1-B45C-2E946B0C9429', 2, 'Inactive', 'Inactive')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1B9F8D2C-F8B4-45D1-B45C-2E946B0C9429', 3, 'Deprecated', 'Deprecated')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1B9F8D2C-F8B4-45D1-B45C-2E946B0C9429', 4, 'Preview', 'Preview')

/* SQL text to update ValueListType for entity field ID 1B9F8D2C-F8B4-45D1-B45C-2E946B0C9429 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='1B9F8D2C-F8B4-45D1-B45C-2E946B0C9429'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0E223DFA-F70D-4185-ADF4-196AAEB2B9CA', 1, 'None', 'None')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0E223DFA-F70D-4185-ADF4-196AAEB2B9CA', 2, 'SpecificUsers', 'SpecificUsers')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0E223DFA-F70D-4185-ADF4-196AAEB2B9CA', 3, 'Everyone', 'Everyone')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0E223DFA-F70D-4185-ADF4-196AAEB2B9CA', 4, 'Public', 'Public')

/* SQL text to update ValueListType for entity field ID 0E223DFA-F70D-4185-ADF4-196AAEB2B9CA */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='0E223DFA-F70D-4185-ADF4-196AAEB2B9CA'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8548F57A-0342-42BF-9FD0-D3BA3EFACDD4', 1, 'Config', 'Config')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8548F57A-0342-42BF-9FD0-D3BA3EFACDD4', 2, 'Code', 'Code')

/* SQL text to update ValueListType for entity field ID 8548F57A-0342-42BF-9FD0-D3BA3EFACDD4 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='8548F57A-0342-42BF-9FD0-D3BA3EFACDD4'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('47BB4821-6981-41B4-9ED0-9E007934DF5D', 1, 'Global', 'Global')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('47BB4821-6981-41B4-9ED0-9E007934DF5D', 2, 'App', 'App')

/* SQL text to update ValueListType for entity field ID 47BB4821-6981-41B4-9ED0-9E007934DF5D */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='47BB4821-6981-41B4-9ED0-9E007934DF5D'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5F8B5527-C9C9-4B72-8B5B-CF07EABFF61D', 1, 'Read', 'Read')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5F8B5527-C9C9-4B72-8B5B-CF07EABFF61D', 2, 'Edit', 'Edit')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5F8B5527-C9C9-4B72-8B5B-CF07EABFF61D', 3, 'Owner', 'Owner')

/* SQL text to update ValueListType for entity field ID 5F8B5527-C9C9-4B72-8B5B-CF07EABFF61D */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='5F8B5527-C9C9-4B72-8B5B-CF07EABFF61D'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('C58AAAC7-5375-41CD-867A-0FE967C3A791', 1, 'Global', 'Global')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('C58AAAC7-5375-41CD-867A-0FE967C3A791', 2, 'App', 'App')

/* SQL text to update ValueListType for entity field ID C58AAAC7-5375-41CD-867A-0FE967C3A791 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C58AAAC7-5375-41CD-867A-0FE967C3A791'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('F885F179-DFA5-4B9A-BDB6-6BFB0DC90601', 1, 'Active', 'Active')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('F885F179-DFA5-4B9A-BDB6-6BFB0DC90601', 2, 'Inactive', 'Inactive')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('F885F179-DFA5-4B9A-BDB6-6BFB0DC90601', 3, 'Deprecated', 'Deprecated')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('F885F179-DFA5-4B9A-BDB6-6BFB0DC90601', 4, 'Preview', 'Preview')

/* SQL text to update ValueListType for entity field ID F885F179-DFA5-4B9A-BDB6-6BFB0DC90601 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='F885F179-DFA5-4B9A-BDB6-6BFB0DC90601'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A68F157F-802A-433B-81A3-0B01ECC39C25', 1, 'string', 'string')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A68F157F-802A-433B-81A3-0B01ECC39C25', 2, 'number', 'number')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A68F157F-802A-433B-81A3-0B01ECC39C25', 3, 'boolean', 'boolean')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A68F157F-802A-433B-81A3-0B01ECC39C25', 4, 'date', 'date')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A68F157F-802A-433B-81A3-0B01ECC39C25', 5, 'object', 'object')

/* SQL text to update ValueListType for entity field ID A68F157F-802A-433B-81A3-0B01ECC39C25 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A68F157F-802A-433B-81A3-0B01ECC39C25'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A014DE78-5FB6-4114-AC50-40739A24E122', 1, 'Default', 'Default')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A014DE78-5FB6-4114-AC50-40739A24E122', 2, 'Specific', 'Specific')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A014DE78-5FB6-4114-AC50-40739A24E122', 3, 'ByPower', 'ByPower')

/* SQL text to update ValueListType for entity field ID A014DE78-5FB6-4114-AC50-40739A24E122 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A014DE78-5FB6-4114-AC50-40739A24E122'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3A0FD2B4-C4DB-4E4B-B971-1C0F319DFA5A', 1, 'Highest', 'Highest')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3A0FD2B4-C4DB-4E4B-B971-1C0F319DFA5A', 2, 'Lowest', 'Lowest')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3A0FD2B4-C4DB-4E4B-B971-1C0F319DFA5A', 3, 'Balanced', 'Balanced')

/* SQL text to update ValueListType for entity field ID 3A0FD2B4-C4DB-4E4B-B971-1C0F319DFA5A */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3A0FD2B4-C4DB-4E4B-B971-1C0F319DFA5A'

/* SQL text to delete entity field value ID 8852302D-7236-EF11-86D4-6045BDEE16E6 */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='8852302D-7236-EF11-86D4-6045BDEE16E6'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('FC5817F0-6F36-EF11-86D4-6045BDEE16E6', 6, 'JSO', 'JSO')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('70E7FF76-A99F-4886-AE7C-3DE0C620B4A5', 1, 'Active', 'Active')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('70E7FF76-A99F-4886-AE7C-3DE0C620B4A5', 2, 'Inactive', 'Inactive')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('70E7FF76-A99F-4886-AE7C-3DE0C620B4A5', 3, 'Deprecated', 'Deprecated')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('70E7FF76-A99F-4886-AE7C-3DE0C620B4A5', 4, 'Preview', 'Preview')

/* SQL text to update ValueListType for entity field ID 70E7FF76-A99F-4886-AE7C-3DE0C620B4A5 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='70E7FF76-A99F-4886-AE7C-3DE0C620B4A5'

/* SQL text to delete entity field value ID F1BB433E-F36B-1410-8DAB-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='F1BB433E-F36B-1410-8DAB-00021F8B792E'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4EBEB02B-AC46-4440-948F-0FCD6C6C26DE', 4, 'JSO', 'JSO')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8261D630-2560-4C03-BE14-C8A9682ABBB4', 1, 'Sequential', 'Sequential')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8261D630-2560-4C03-BE14-C8A9682ABBB4', 2, 'Parallel', 'Parallel')

/* SQL text to update ValueListType for entity field ID 8261D630-2560-4C03-BE14-C8A9682ABBB4 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='8261D630-2560-4C03-BE14-C8A9682ABBB4'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('B9992893-7BD7-42EA-A2A8-48928D7A5CCE', 1, 'Active', 'Active')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('B9992893-7BD7-42EA-A2A8-48928D7A5CCE', 2, 'Deprecated', 'Deprecated')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('B9992893-7BD7-42EA-A2A8-48928D7A5CCE', 3, 'Disabled', 'Disabled')

/* SQL text to update ValueListType for entity field ID B9992893-7BD7-42EA-A2A8-48928D7A5CCE */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B9992893-7BD7-42EA-A2A8-48928D7A5CCE'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0049EE44-5535-4D29-9CE2-2522E5BCD811', 1, 'Fixed', 'Fixed')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0049EE44-5535-4D29-9CE2-2522E5BCD811', 2, 'Exponential', 'Exponential')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('0049EE44-5535-4D29-9CE2-2522E5BCD811', 3, 'Linear', 'Linear')

/* SQL text to update ValueListType for entity field ID 0049EE44-5535-4D29-9CE2-2522E5BCD811 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='0049EE44-5535-4D29-9CE2-2522E5BCD811'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A93C0CBB-A329-4E92-90D8-471FF627D055', 1, 'None', 'None')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A93C0CBB-A329-4E92-90D8-471FF627D055', 2, 'StaticCount', 'StaticCount')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A93C0CBB-A329-4E92-90D8-471FF627D055', 3, 'ConfigParam', 'ConfigParam')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A93C0CBB-A329-4E92-90D8-471FF627D055', 4, 'ModelSpecific', 'ModelSpecific')

/* SQL text to update ValueListType for entity field ID A93C0CBB-A329-4E92-90D8-471FF627D055 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A93C0CBB-A329-4E92-90D8-471FF627D055'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('FEC78D56-641A-4866-9049-2F3684DF4592', 1, 'None', 'None')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('FEC78D56-641A-4866-9049-2F3684DF4592', 2, 'StaticCount', 'StaticCount')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('FEC78D56-641A-4866-9049-2F3684DF4592', 3, 'ConfigParam', 'ConfigParam')

/* SQL text to update ValueListType for entity field ID FEC78D56-641A-4866-9049-2F3684DF4592 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='FEC78D56-641A-4866-9049-2F3684DF4592'

-- Add documentation for the Report Thumbnail column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Thumbnail image for the report that can be displayed in gallery views. Can contain either a URL to an image file or a Base64-encoded image string.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Report',
    @level2type = N'COLUMN', @level2name = N'Thumbnail';

-- Add documentation for the UserView Thumbnail column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Thumbnail image for the user view that can be displayed in gallery views. Can contain either a URL to an image file or a Base64-encoded image string.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'UserView',
    @level2type = N'COLUMN', @level2name = N'Thumbnail';

-- Add documentation for the AutoRowCountFrequency column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Frequency in hours for automatically performing row counts on this entity. If NULL, automatic row counting is disabled. If greater than 0, schedules recurring SELECT COUNT(*) queries at the specified interval.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'AutoRowCountFrequency';

-- Add documentation for the RowCount column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cached row count for this entity, populated by automatic row count processes when AutoRowCountFrequency is configured.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'RowCount';

-- Add documentation for the RowCountRunAt column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp indicating when the last automatic row count was performed for this entity.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'RowCountRunAt';

-- Add documentation for the Status column
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Status of the entity. Active: fully functional; Deprecated: functional but generates console warnings when used; Disabled: not available for use even though metadata and physical table remain.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Entity',
    @level2type = N'COLUMN', @level2name = N'Status';
