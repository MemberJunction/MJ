-- Migration: Add ParentID to AIConfiguration for configuration inheritance
-- This enables child configurations to inherit prompt-model mappings and parameters
-- from parent configurations, allowing easy experimentation with configuration variations.


-- WE had another 3.1 migration that did mutation on AI Configuration so we need to do this first
-- Adding the timestamp here ensures the checksum changes each time so this runs every time
-- ${flyway:timestamp}

/* SQL text to recompile all views */
EXEC [${flyway:defaultSchema}].spRecompileAllViews

/* SQL text to update existing entities from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntitiesFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to sync schema info from database schemas */
EXEC [${flyway:defaultSchema}].spUpdateSchemaInfoFromDatabase @ExcludedSchemaNames='sys,staging'

/* SQL text to delete unneeded entity fields */
EXEC [${flyway:defaultSchema}].spDeleteUnneededEntityFields @ExcludedSchemaNames='sys,staging'

/* SQL text to update existing entity fields from schema */
EXEC [${flyway:defaultSchema}].spUpdateExistingEntityFieldsFromSchema @ExcludedSchemaNames='sys,staging'

/* SQL text to set default column width where needed */
EXEC [${flyway:defaultSchema}].spSetDefaultColumnWidthWhereNeeded @ExcludedSchemaNames='sys,staging'

/* SQL text to recompile all stored procedures in dependency order */
EXEC [${flyway:defaultSchema}].spRecompileAllProceduresInDependencyOrder @ExcludedSchemaNames='sys,staging', @LogOutput=0, @ContinueOnError=1

--- THEN WE CAN DO our migration
GO

-- Add ParentID column to AIConfiguration
ALTER TABLE ${flyway:defaultSchema}.AIConfiguration
ADD ParentID uniqueidentifier NULL;
GO

-- Add foreign key constraint (self-referential)
ALTER TABLE ${flyway:defaultSchema}.AIConfiguration
ADD CONSTRAINT FK_AIConfiguration_ParentID
FOREIGN KEY (ParentID) REFERENCES ${flyway:defaultSchema}.AIConfiguration(ID);
GO

-- Document the field with extended property
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional reference to a parent configuration. When set, this configuration inherits prompt-model mappings and parameters from its parent. Child configurations can override specific settings while inheriting defaults from the parent chain. Supports N-level deep inheritance.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIConfiguration',
    @level2type = N'COLUMN', @level2name = N'ParentID';
GO




















































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '112e12b6-d1bf-41da-be57-bcb64da0ac1c'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'ParentID')
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
            '112e12b6-d1bf-41da-be57-bcb64da0ac1c',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            100026,
            'ParentID',
            'Parent ID',
            'Optional reference to a parent configuration. When set, this configuration inherits prompt-model mappings and parameters from its parent. Child configurations can override specific settings while inheriting defaults from the parent chain. Supports N-level deep inheritance.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '6AE1BBF0-2085-4D2F-B724-219DC4212026',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '7ab253b4-9ec5-45a2-8faa-6fd7474cdce8'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('7ab253b4-9ec5-45a2-8faa-6fd7474cdce8', '6AE1BBF0-2085-4D2F-B724-219DC4212026', '6AE1BBF0-2085-4D2F-B724-219DC4212026', 'ParentID', 'One To Many', 1, 1, 'MJ: AI Configurations', 8);
   END
                              

/* Index for Foreign Keys for AIConfiguration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DefaultPromptForContextCompressionID in table AIConfiguration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultPromptForContextCompressionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIConfiguration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultPromptForContextCompressionID ON [${flyway:defaultSchema}].[AIConfiguration] ([DefaultPromptForContextCompressionID]);

-- Index for foreign key DefaultPromptForContextSummarizationID in table AIConfiguration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultPromptForContextSummarizationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIConfiguration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultPromptForContextSummarizationID ON [${flyway:defaultSchema}].[AIConfiguration] ([DefaultPromptForContextSummarizationID]);

-- Index for foreign key DefaultStorageProviderID in table AIConfiguration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultStorageProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIConfiguration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIConfiguration_DefaultStorageProviderID ON [${flyway:defaultSchema}].[AIConfiguration] ([DefaultStorageProviderID]);

-- Index for foreign key ParentID in table AIConfiguration
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIConfiguration_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIConfiguration]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIConfiguration_ParentID ON [${flyway:defaultSchema}].[AIConfiguration] ([ParentID]);

/* Root ID Function SQL for MJ: AI Configurations.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: fnAIConfigurationParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIConfiguration].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIConfigurationParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIConfigurationParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIConfigurationParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        -- Anchor: Start from @ParentID if not null, otherwise start from @RecordID
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIConfiguration]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        -- Recursive: Keep going up the hierarchy until ParentID is NULL
        -- Includes depth counter to prevent infinite loops from circular references
        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIConfiguration] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100  -- Prevent infinite loops, max 100 levels
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


/* SQL text to update entity field related entity name field map for entity field ID 112E12B6-D1BF-41DA-BE57-BCB64DA0AC1C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='112E12B6-D1BF-41DA-BE57-BCB64DA0AC1C',
         @RelatedEntityNameFieldMap='Parent'

/* Base View SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: vwAIConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Configurations
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIConfiguration
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIConfigurations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIConfigurations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIConfigurations]
AS
SELECT
    a.*,
    AIPrompt_DefaultPromptForContextCompressionID.[Name] AS [DefaultPromptForContextCompression],
    AIPrompt_DefaultPromptForContextSummarizationID.[Name] AS [DefaultPromptForContextSummarization],
    FileStorageProvider_DefaultStorageProviderID.[Name] AS [DefaultStorageProvider],
    AIConfiguration_ParentID.[Name] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[AIConfiguration] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_DefaultPromptForContextCompressionID
  ON
    [a].[DefaultPromptForContextCompressionID] = AIPrompt_DefaultPromptForContextCompressionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_DefaultPromptForContextSummarizationID
  ON
    [a].[DefaultPromptForContextSummarizationID] = AIPrompt_DefaultPromptForContextSummarizationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageProvider] AS FileStorageProvider_DefaultStorageProviderID
  ON
    [a].[DefaultStorageProviderID] = FileStorageProvider_DefaultStorageProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_ParentID
  ON
    [a].[ParentID] = AIConfiguration_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIConfigurationParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIConfigurations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: Permissions for vwAIConfigurations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIConfigurations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: spCreateAIConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIConfiguration]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @IsDefault bit = NULL,
    @Status nvarchar(20) = NULL,
    @DefaultPromptForContextCompressionID uniqueidentifier,
    @DefaultPromptForContextSummarizationID uniqueidentifier,
    @DefaultStorageProviderID uniqueidentifier,
    @DefaultStorageRootPath nvarchar(500),
    @ParentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIConfiguration]
            (
                [ID],
                [Name],
                [Description],
                [IsDefault],
                [Status],
                [DefaultPromptForContextCompressionID],
                [DefaultPromptForContextSummarizationID],
                [DefaultStorageProviderID],
                [DefaultStorageRootPath],
                [ParentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                ISNULL(@IsDefault, 0),
                ISNULL(@Status, 'Active'),
                @DefaultPromptForContextCompressionID,
                @DefaultPromptForContextSummarizationID,
                @DefaultStorageProviderID,
                @DefaultStorageRootPath,
                @ParentID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIConfiguration]
            (
                [Name],
                [Description],
                [IsDefault],
                [Status],
                [DefaultPromptForContextCompressionID],
                [DefaultPromptForContextSummarizationID],
                [DefaultStorageProviderID],
                [DefaultStorageRootPath],
                [ParentID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                ISNULL(@IsDefault, 0),
                ISNULL(@Status, 'Active'),
                @DefaultPromptForContextCompressionID,
                @DefaultPromptForContextSummarizationID,
                @DefaultStorageProviderID,
                @DefaultStorageRootPath,
                @ParentID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIConfigurations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIConfiguration] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIConfiguration] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: spUpdateAIConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIConfiguration]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @IsDefault bit,
    @Status nvarchar(20),
    @DefaultPromptForContextCompressionID uniqueidentifier,
    @DefaultPromptForContextSummarizationID uniqueidentifier,
    @DefaultStorageProviderID uniqueidentifier,
    @DefaultStorageRootPath nvarchar(500),
    @ParentID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIConfiguration]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [IsDefault] = @IsDefault,
        [Status] = @Status,
        [DefaultPromptForContextCompressionID] = @DefaultPromptForContextCompressionID,
        [DefaultPromptForContextSummarizationID] = @DefaultPromptForContextSummarizationID,
        [DefaultStorageProviderID] = @DefaultStorageProviderID,
        [DefaultStorageRootPath] = @DefaultStorageRootPath,
        [ParentID] = @ParentID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIConfigurations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIConfigurations]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIConfiguration] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIConfiguration table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIConfiguration]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIConfiguration];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIConfiguration
ON [${flyway:defaultSchema}].[AIConfiguration]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIConfiguration]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIConfiguration] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIConfiguration] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: spDeleteAIConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIConfiguration
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIConfiguration]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIConfiguration]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfiguration] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Configurations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIConfiguration] TO [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1a9ea21c-ff69-42bf-afa6-f36714fd7925'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'Parent')
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
            '1a9ea21c-ff69-42bf-afa6-f36714fd7925',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            100031,
            'Parent',
            'Parent',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
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
         WHERE ID = 'f8967e9f-85fe-4871-8c33-34198ff5c5df'  OR 
               (EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'RootParentID')
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
            'f8967e9f-85fe-4871-8c33-34198ff5c5df',
            '6AE1BBF0-2085-4D2F-B724-219DC4212026', -- Entity: MJ: AI Configurations
            100032,
            'RootParentID',
            'Root Parent ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
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

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '25C9E89A-F411-4205-A031-E0A8C35E63BD'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '25C9E89A-F411-4205-A031-E0A8C35E63BD'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5516DAE6-EF96-411C-B7AA-9C20B9006577'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'F885F179-DFA5-4B9A-BDB6-6BFB0DC90601'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '25C9E89A-F411-4205-A031-E0A8C35E63BD'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'D0CAF45E-4B1B-4BB6-80B7-A49631AF0F96'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'F885F179-DFA5-4B9A-BDB6-6BFB0DC90601'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'A338AAFE-A046-42C4-8CE8-657C8B0F3887'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1A9EA21C-FF69-42BF-AFA6-F36714FD7925'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 17 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Basic Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '88E41CB0-F013-4493-8CEF-5145918AC6D7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Basic Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '25C9E89A-F411-4205-A031-E0A8C35E63BD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Basic Information',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'D0CAF45E-4B1B-4BB6-80B7-A49631AF0F96'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Default',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5516DAE6-EF96-411C-B7AA-9C20B9006577'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F885F179-DFA5-4B9A-BDB6-6BFB0DC90601'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Prompt For Context Compression',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7C9C04C8-4778-48D6-A1BE-D85D8381DC4B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Prompt For Context Summarization',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6686738D-6185-4899-AED0-2295F02D5F75'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '18266A8C-DFEE-4658-99C6-9B8D49667F27'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '484D0280-C551-4A7B-A0EA-ADF3A098DFD0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Storage Provider',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '303B2C68-A58D-468D-9CD3-766922EF93B6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Storage Root Path',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4AA505E8-7E1C-4EC9-8462-D70F60200CB1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Inheritance Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '112E12B6-D1BF-41DA-BE57-BCB64DA0AC1C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Prompt For Context Compression',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '335ADD17-B5D8-4702-AD59-FC2C287F119B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Prompt For Context Summarization',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6AB184FD-B925-4533-B2F9-6FF29030D036'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Configuration Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Storage Provider',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A338AAFE-A046-42C4-8CE8-657C8B0F3887'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Inheritance Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1A9EA21C-FF69-42BF-AFA6-F36714FD7925'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Inheritance Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F8967E9F-85FE-4871-8C33-34198FF5C5DF'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Inheritance Settings":{"icon":"fa fa-sitemap","description":"Settings that define configuration inheritance and parent‑child relationships between AI configurations"},"Basic Information":{"icon":"fa fa-id-card","description":""},"Configuration Settings":{"icon":"fa fa-sliders-h","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Inheritance Settings":"fa fa-sitemap","Basic Information":"fa fa-id-card","Configuration Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND Name = 'FieldCategoryIcons'
            

