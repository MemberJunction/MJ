/* SQL text to update existing entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'


-- Add missing fields to Component table for component specifications and vectors

-- Add all fields in a single ALTER TABLE statement for efficiency
ALTER TABLE ${flyway:defaultSchema}.Component 
ADD 
    Specification NVARCHAR(MAX) NOT NULL,
    FunctionalRequirements NVARCHAR(MAX) NULL,
    TechnicalDesign NVARCHAR(MAX) NULL,
    FunctionalRequirementsVector NVARCHAR(MAX) NULL,
    TechnicalDesignVector NVARCHAR(MAX) NULL;
GO

-- Add extended properties for all new columns
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Complete JSON specification object for the component',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'Component',
    @level2type = N'Column', @level2name = 'Specification';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Functional requirements describing what the component should accomplish',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'Component',
    @level2type = N'Column', @level2name = 'FunctionalRequirements';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Technical design describing how the component is implemented',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'Component',
    @level2type = N'Column', @level2name = 'TechnicalDesign';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Vector embedding of the functional requirements for similarity search',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'Component',
    @level2type = N'Column', @level2name = 'FunctionalRequirementsVector';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Vector embedding of the technical design for similarity search',
    @level0type = N'Schema', @level0name = '${flyway:defaultSchema}',
    @level1type = N'Table',  @level1name = 'Component',
    @level2type = N'Column', @level2name = 'TechnicalDesignVector';
GO



/*** CODE GEN RUN ***/

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e543ef18-82ed-427a-b456-53a834fefa28'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'Specification')
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
            'e543ef18-82ed-427a-b456-53a834fefa28',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100018,
            'Specification',
            'Specification',
            'Complete JSON specification object for the component',
            'nvarchar',
            -1,
            0,
            0,
            0,
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
         WHERE ID = '1779b5ec-6146-4259-be81-a62f3978e303'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'FunctionalRequirements')
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
            '1779b5ec-6146-4259-be81-a62f3978e303',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100019,
            'FunctionalRequirements',
            'Functional Requirements',
            'Functional requirements describing what the component should accomplish',
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
         WHERE ID = 'a4c87f04-5bd4-4c3f-93a5-e70115bb83bf'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'TechnicalDesign')
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
            'a4c87f04-5bd4-4c3f-93a5-e70115bb83bf',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100020,
            'TechnicalDesign',
            'Technical Design',
            'Technical design describing how the component is implemented',
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
         WHERE ID = 'ed747c2e-fadb-46d6-a01a-f73c91f7f91a'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'FunctionalRequirementsVector')
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
            'ed747c2e-fadb-46d6-a01a-f73c91f7f91a',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100021,
            'FunctionalRequirementsVector',
            'Functional Requirements Vector',
            'Vector embedding of the functional requirements for similarity search',
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
         WHERE ID = 'bf553c57-a14a-4aef-8919-fed4eb939719'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'TechnicalDesignVector')
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
            'bf553c57-a14a-4aef-8919-fed4eb939719',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100022,
            'TechnicalDesignVector',
            'Technical Design Vector',
            'Vector embedding of the technical design for similarity search',
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
    @TechnicalDesignVector nvarchar(MAX)
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
                [TechnicalDesignVector]
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
                @TechnicalDesignVector
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
                [TechnicalDesignVector]
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
                @TechnicalDesignVector
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
    @TechnicalDesignVector nvarchar(MAX)
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
        [TechnicalDesignVector] = @TechnicalDesignVector
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



