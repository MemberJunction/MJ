-- =============================================================================
-- Migration: Add metadata fields to Component table for faster lookups
-- Version: v2.88.x
-- Description: Adds fields to track component capabilities and characteristics
--              directly in the database to avoid parsing specs for common queries
-- =============================================================================

-- Add new fields to track component capabilities (single ALTER TABLE for efficiency)
ALTER TABLE ${flyway:defaultSchema}.Component ADD 
    HasCustomProps bit NOT NULL CONSTRAINT DF_Component_HasCustomProps DEFAULT 0,
    HasCustomEvents bit NOT NULL CONSTRAINT DF_Component_HasCustomEvents DEFAULT 0,
    RequiresData bit NOT NULL CONSTRAINT DF_Component_RequiresData DEFAULT 0,
    DependencyCount int NOT NULL CONSTRAINT DF_Component_DependencyCount DEFAULT 0;

GO

-- Add extended properties for documentation
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Indicates if the component has custom properties defined in its specification. Components with custom props cannot be used directly by deterministic containers.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Component',
    @level2type = N'COLUMN', @level2name = N'HasCustomProps';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Indicates if the component has custom events defined in its specification. Components with custom events may have limited functionality in generic containers.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Component',
    @level2type = N'COLUMN', @level2name = N'HasCustomEvents';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Indicates if the component requires data access (utilities object with md, rv, rq). Used to determine if component needs data context.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Component',
    @level2type = N'COLUMN', @level2name = N'RequiresData';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Number of component dependencies defined in the specification. Used to assess component complexity.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'Component',
    @level2type = N'COLUMN', @level2name = N'DependencyCount';

GO
 






/***** CODE GEN RUN ******/
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7ff83ad2-20d0-43f9-9ea9-47d213836359'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'HasCustomProps')
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
            '7ff83ad2-20d0-43f9-9ea9-47d213836359',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100023,
            'HasCustomProps',
            'Has Custom Props',
            'Indicates if the component has custom properties defined in its specification. Components with custom props cannot be used directly by deterministic containers.',
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
         WHERE ID = 'f481764e-2c49-4c13-9bd5-006804061d86'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'HasCustomEvents')
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
            'f481764e-2c49-4c13-9bd5-006804061d86',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100024,
            'HasCustomEvents',
            'Has Custom Events',
            'Indicates if the component has custom events defined in its specification. Components with custom events may have limited functionality in generic containers.',
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
         WHERE ID = 'c32f9aa1-bd19-4111-b9ac-918a1c27ddb8'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'RequiresData')
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
            'c32f9aa1-bd19-4111-b9ac-918a1c27ddb8',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100025,
            'RequiresData',
            'Requires Data',
            'Indicates if the component requires data access (utilities object with md, rv, rq). Used to determine if component needs data context.',
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
         WHERE ID = 'b86a1342-613e-4c48-96a2-4e34eaf681ac'  OR 
               (EntityID = '0FB98A1D-C6AE-4427-B66C-7B31E669756F' AND Name = 'DependencyCount')
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
            'b86a1342-613e-4c48-96a2-4e34eaf681ac',
            '0FB98A1D-C6AE-4427-B66C-7B31E669756F', -- Entity: MJ: Components
            100026,
            'DependencyCount',
            'Dependency Count',
            'Number of component dependencies defined in the specification. Used to assess component complexity.',
            'int',
            4,
            10,
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
    @DependencyCount int
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
                [DependencyCount]
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
                @DependencyCount
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
                [DependencyCount]
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
                @DependencyCount
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
    @DependencyCount int
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
        [DependencyCount] = @DependencyCount
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



