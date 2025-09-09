-- Add vector embedding model ID columns to Component table
ALTER TABLE ${flyway:defaultSchema}.Component
ADD TechnicalDesignVectorEmbeddingModelID NVARCHAR(MAX) NULL,
    FunctionalRequirementsVectorEmbeddingModelID NVARCHAR(MAX) NULL;
GO

-- Add extended properties for the new columns
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'The ID of the AI model used to generate the vector embedding for the technical design',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Component',
    @level2type = N'COLUMN', @level2name = N'TechnicalDesignVectorEmbeddingModelID';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'The ID of the AI model used to generate the vector embedding for the functional requirements',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Component',
    @level2type = N'COLUMN', @level2name = N'FunctionalRequirementsVectorEmbeddingModelID';
GO




/** CODE GEN RUN **/
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '833ed4b3-6c3c-47aa-bfc7-3285987fa6cd'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'TechnicalDesignVectorEmbeddingModelID')
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
            '833ed4b3-6c3c-47aa-bfc7-3285987fa6cd',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100027,
            'TechnicalDesignVectorEmbeddingModelID',
            'Technical Design Vector Embedding Model ID',
            'The ID of the AI model used to generate the vector embedding for the technical design',
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
         WHERE ID = '85c14134-f3a3-48e4-b04a-756bac3f0bd2'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'FunctionalRequirementsVectorEmbeddingModelID')
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
            '85c14134-f3a3-48e4-b04a-756bac3f0bd2',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100028,
            'FunctionalRequirementsVectorEmbeddingModelID',
            'Functional Requirements Vector Embedding Model ID',
            'The ID of the AI model used to generate the vector embedding for the functional requirements',
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

/* SQL text to delete entity field value ID 124B433E-F36B-1410-8DBE-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='124B433E-F36B-1410-8DBE-00021F8B792E'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=7 WHERE ID='BC4C433E-F36B-1410-8DBE-00021F8B792E'

/* SQL text to delete entity field value ID 174B433E-F36B-1410-8DBE-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='174B433E-F36B-1410-8DBE-00021F8B792E'

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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateEntityRelationship]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRelationship]
    @ID uniqueidentifier = NULL,
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
    @AutoUpdateFromSchema bit
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
                [AutoUpdateFromSchema]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @Sequence,
                @RelatedEntityID,
                @BundleInAPI,
                @IncludeInParentAllQuery,
                @Type,
                @EntityKeyField,
                @RelatedEntityJoinField,
                @JoinView,
                @JoinEntityJoinField,
                @JoinEntityInverseJoinField,
                @DisplayInForm,
                @DisplayLocation,
                @DisplayName,
                @DisplayIconType,
                @DisplayIcon,
                @DisplayComponentID,
                @DisplayComponentConfiguration,
                @AutoUpdateFromSchema
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
                [AutoUpdateFromSchema]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @Sequence,
                @RelatedEntityID,
                @BundleInAPI,
                @IncludeInParentAllQuery,
                @Type,
                @EntityKeyField,
                @RelatedEntityJoinField,
                @JoinView,
                @JoinEntityJoinField,
                @JoinEntityInverseJoinField,
                @DisplayInForm,
                @DisplayLocation,
                @DisplayName,
                @DisplayIconType,
                @DisplayIcon,
                @DisplayComponentID,
                @DisplayComponentConfiguration,
                @AutoUpdateFromSchema
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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateEntityRelationship]
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
    @AutoUpdateFromSchema bit
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
        [AutoUpdateFromSchema] = @AutoUpdateFromSchema
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
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateEntityRelationship
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
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteEntityRelationship]
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



/* SQL text to update entity field related entity name field map for entity field ID 8145433E-F36B-1410-8DBE-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8145433E-F36B-1410-8DBE-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 8545433E-F36B-1410-8DBE-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8545433E-F36B-1410-8DBE-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 8645433E-F36B-1410-8DBE-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8645433E-F36B-1410-8DBE-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 9C45433E-F36B-1410-8DBE-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9C45433E-F36B-1410-8DBE-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID A045433E-F36B-1410-8DBE-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A045433E-F36B-1410-8DBE-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* Index for Foreign Keys for Component */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Components
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SourceRegistryID in table Component
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_Component_SourceRegistryID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[Component]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_Component_SourceRegistryID ON [${flyway:defaultSchema}].[Component] ([SourceRegistryID]);

/* Base View SQL for MJ: Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Components
-- Item: vwComponents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Components
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  Component
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwComponents]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwComponents]
AS
SELECT
    c.*,
    ComponentRegistry_SourceRegistryID.[Name] AS [SourceRegistry]
FROM
    [${flyway:defaultSchema}].[Component] AS c
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ComponentRegistry] AS ComponentRegistry_SourceRegistryID
  ON
    [c].[SourceRegistryID] = ComponentRegistry_SourceRegistryID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwComponents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Components
-- Item: Permissions for vwComponents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwComponents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Components
-- Item: spCreateComponent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Component
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateComponent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateComponent]
    @ID uniqueidentifier = NULL,
    @Namespace nvarchar(MAX),
    @Name nvarchar(500),
    @Version nvarchar(50),
    @VersionSequence int,
    @Title nvarchar(1000),
    @Description nvarchar(MAX),
    @Type nvarchar(255),
    @Status nvarchar(50),
    @DeveloperName nvarchar(255),
    @DeveloperEmail nvarchar(255),
    @DeveloperOrganization nvarchar(255),
    @SourceRegistryID uniqueidentifier,
    @ReplicatedAt datetimeoffset,
    @LastSyncedAt datetimeoffset,
    @Specification nvarchar(MAX),
    @FunctionalRequirements nvarchar(MAX),
    @TechnicalDesign nvarchar(MAX),
    @FunctionalRequirementsVector nvarchar(MAX),
    @TechnicalDesignVector nvarchar(MAX),
    @HasCustomProps bit,
    @HasCustomEvents bit,
    @RequiresData bit,
    @DependencyCount int,
    @TechnicalDesignVectorEmbeddingModelID nvarchar(MAX),
    @FunctionalRequirementsVectorEmbeddingModelID nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[Component]
            (
                [ID],
                [Namespace],
                [Name],
                [Version],
                [VersionSequence],
                [Title],
                [Description],
                [Type],
                [Status],
                [DeveloperName],
                [DeveloperEmail],
                [DeveloperOrganization],
                [SourceRegistryID],
                [ReplicatedAt],
                [LastSyncedAt],
                [Specification],
                [FunctionalRequirements],
                [TechnicalDesign],
                [FunctionalRequirementsVector],
                [TechnicalDesignVector],
                [HasCustomProps],
                [HasCustomEvents],
                [RequiresData],
                [DependencyCount],
                [TechnicalDesignVectorEmbeddingModelID],
                [FunctionalRequirementsVectorEmbeddingModelID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Namespace,
                @Name,
                @Version,
                @VersionSequence,
                @Title,
                @Description,
                @Type,
                @Status,
                @DeveloperName,
                @DeveloperEmail,
                @DeveloperOrganization,
                @SourceRegistryID,
                @ReplicatedAt,
                @LastSyncedAt,
                @Specification,
                @FunctionalRequirements,
                @TechnicalDesign,
                @FunctionalRequirementsVector,
                @TechnicalDesignVector,
                @HasCustomProps,
                @HasCustomEvents,
                @RequiresData,
                @DependencyCount,
                @TechnicalDesignVectorEmbeddingModelID,
                @FunctionalRequirementsVectorEmbeddingModelID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[Component]
            (
                [Namespace],
                [Name],
                [Version],
                [VersionSequence],
                [Title],
                [Description],
                [Type],
                [Status],
                [DeveloperName],
                [DeveloperEmail],
                [DeveloperOrganization],
                [SourceRegistryID],
                [ReplicatedAt],
                [LastSyncedAt],
                [Specification],
                [FunctionalRequirements],
                [TechnicalDesign],
                [FunctionalRequirementsVector],
                [TechnicalDesignVector],
                [HasCustomProps],
                [HasCustomEvents],
                [RequiresData],
                [DependencyCount],
                [TechnicalDesignVectorEmbeddingModelID],
                [FunctionalRequirementsVectorEmbeddingModelID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Namespace,
                @Name,
                @Version,
                @VersionSequence,
                @Title,
                @Description,
                @Type,
                @Status,
                @DeveloperName,
                @DeveloperEmail,
                @DeveloperOrganization,
                @SourceRegistryID,
                @ReplicatedAt,
                @LastSyncedAt,
                @Specification,
                @FunctionalRequirements,
                @TechnicalDesign,
                @FunctionalRequirementsVector,
                @TechnicalDesignVector,
                @HasCustomProps,
                @HasCustomEvents,
                @RequiresData,
                @DependencyCount,
                @TechnicalDesignVectorEmbeddingModelID,
                @FunctionalRequirementsVectorEmbeddingModelID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwComponents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateComponent] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Components */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateComponent] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Components
-- Item: spUpdateComponent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Component
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateComponent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateComponent]
    @ID uniqueidentifier,
    @Namespace nvarchar(MAX),
    @Name nvarchar(500),
    @Version nvarchar(50),
    @VersionSequence int,
    @Title nvarchar(1000),
    @Description nvarchar(MAX),
    @Type nvarchar(255),
    @Status nvarchar(50),
    @DeveloperName nvarchar(255),
    @DeveloperEmail nvarchar(255),
    @DeveloperOrganization nvarchar(255),
    @SourceRegistryID uniqueidentifier,
    @ReplicatedAt datetimeoffset,
    @LastSyncedAt datetimeoffset,
    @Specification nvarchar(MAX),
    @FunctionalRequirements nvarchar(MAX),
    @TechnicalDesign nvarchar(MAX),
    @FunctionalRequirementsVector nvarchar(MAX),
    @TechnicalDesignVector nvarchar(MAX),
    @HasCustomProps bit,
    @HasCustomEvents bit,
    @RequiresData bit,
    @DependencyCount int,
    @TechnicalDesignVectorEmbeddingModelID nvarchar(MAX),
    @FunctionalRequirementsVectorEmbeddingModelID nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Component]
    SET
        [Namespace] = @Namespace,
        [Name] = @Name,
        [Version] = @Version,
        [VersionSequence] = @VersionSequence,
        [Title] = @Title,
        [Description] = @Description,
        [Type] = @Type,
        [Status] = @Status,
        [DeveloperName] = @DeveloperName,
        [DeveloperEmail] = @DeveloperEmail,
        [DeveloperOrganization] = @DeveloperOrganization,
        [SourceRegistryID] = @SourceRegistryID,
        [ReplicatedAt] = @ReplicatedAt,
        [LastSyncedAt] = @LastSyncedAt,
        [Specification] = @Specification,
        [FunctionalRequirements] = @FunctionalRequirements,
        [TechnicalDesign] = @TechnicalDesign,
        [FunctionalRequirementsVector] = @FunctionalRequirementsVector,
        [TechnicalDesignVector] = @TechnicalDesignVector,
        [HasCustomProps] = @HasCustomProps,
        [HasCustomEvents] = @HasCustomEvents,
        [RequiresData] = @RequiresData,
        [DependencyCount] = @DependencyCount,
        [TechnicalDesignVectorEmbeddingModelID] = @TechnicalDesignVectorEmbeddingModelID,
        [FunctionalRequirementsVectorEmbeddingModelID] = @FunctionalRequirementsVectorEmbeddingModelID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwComponents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwComponents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateComponent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Component table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateComponent
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateComponent
ON [${flyway:defaultSchema}].[Component]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[Component]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[Component] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Components */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateComponent] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Components */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Components
-- Item: spDeleteComponent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Component
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteComponent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteComponent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[Component]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteComponent] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Components */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteComponent] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID BF43433E-F36B-1410-8DBE-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BF43433E-F36B-1410-8DBE-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID EC43433E-F36B-1410-8DBE-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EC43433E-F36B-1410-8DBE-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID F143433E-F36B-1410-8DBE-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F143433E-F36B-1410-8DBE-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID F643433E-F36B-1410-8DBE-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F643433E-F36B-1410-8DBE-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 0F44433E-F36B-1410-8DBE-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0F44433E-F36B-1410-8DBE-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 7844433E-F36B-1410-8DBE-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7844433E-F36B-1410-8DBE-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID D244433E-F36B-1410-8DBE-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D244433E-F36B-1410-8DBE-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 0E45433E-F36B-1410-8DBE-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0E45433E-F36B-1410-8DBE-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 2C45433E-F36B-1410-8DBE-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2C45433E-F36B-1410-8DBE-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID E144433E-F36B-1410-8DBE-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E144433E-F36B-1410-8DBE-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID E644433E-F36B-1410-8DBE-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E644433E-F36B-1410-8DBE-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID EB44433E-F36B-1410-8DBE-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EB44433E-F36B-1410-8DBE-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

