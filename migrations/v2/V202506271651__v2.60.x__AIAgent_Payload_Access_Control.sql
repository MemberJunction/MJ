-- Migration: Add Payload Access Control fields to AIAgent table
-- Description: Adds PayloadDownstreamPaths and PayloadUpstreamPaths fields to control
--              which parts of the payload are accessible to sub-agents
-- Version: 2.60.x
-- Date: 2025-06-27

-- Add PayloadDownstreamPaths and PayloadUpstreamPaths fields
ALTER TABLE ${flyway:defaultSchema}.AIAgent
ADD PayloadDownstreamPaths NVARCHAR(MAX) NULL,
    PayloadUpstreamPaths NVARCHAR(MAX) NULL;
GO

-- Add default constraints
ALTER TABLE ${flyway:defaultSchema}.AIAgent
ADD CONSTRAINT DF_AIAgent_PayloadDownstreamPaths DEFAULT '["*"]' FOR PayloadDownstreamPaths,
    CONSTRAINT DF_AIAgent_PayloadUpstreamPaths DEFAULT '["*"]' FOR PayloadUpstreamPaths;
GO

-- Update existing NULL values to default
UPDATE ${flyway:defaultSchema}.AIAgent
SET PayloadDownstreamPaths = '["*"]',
    PayloadUpstreamPaths = '["*"]'
WHERE PayloadDownstreamPaths IS NULL 
   OR PayloadUpstreamPaths IS NULL;
GO

-- Make columns NOT NULL
ALTER TABLE ${flyway:defaultSchema}.AIAgent
ALTER COLUMN PayloadDownstreamPaths NVARCHAR(MAX) NOT NULL;
ALTER TABLE ${flyway:defaultSchema}.AIAgent
ALTER COLUMN PayloadUpstreamPaths NVARCHAR(MAX) NOT NULL;
GO

-- Update field descriptions
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON array of paths that define which parts of the payload should be sent downstream to sub-agents. Use ["*"] to send entire payload, or specify paths like ["customer.id", "campaign.*", "analysis.sentiment"]',
    @level0type = N'SCHEMA', @level0name = '__mj',
    @level1type = N'TABLE',  @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'PayloadDownstreamPaths';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON array of paths that define which parts of the payload sub-agents are allowed to write back upstream. Use ["*"] to allow all writes, or specify paths like ["analysis.results", "recommendations.*"]',
    @level0type = N'SCHEMA', @level0name = '__mj',
    @level1type = N'TABLE',  @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'PayloadUpstreamPaths';
GO



/********* CODE GEN RUN *********/



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '85b6aa86-796d-4970-9e35-5a483498b517'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'PayloadDownstreamPaths')
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
            '85b6aa86-796d-4970-9e35-5a483498b517',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100020,
            'PayloadDownstreamPaths',
            'Payload Downstream Paths',
            'JSON array of paths that define which parts of the payload should be sent downstream to sub-agents. Use ["*"] to send entire payload, or specify paths like ["customer.id", "campaign.*", "analysis.sentiment"]',
            'nvarchar',
            -1,
            0,
            0,
            0,
            '["*"]',
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
         WHERE ID = 'da784b76-66cd-434b-90bd-dec808917e68'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'PayloadUpstreamPaths')
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
            'da784b76-66cd-434b-90bd-dec808917e68',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100021,
            'PayloadUpstreamPaths',
            'Payload Upstream Paths',
            'JSON array of paths that define which parts of the payload sub-agents are allowed to write back upstream. Use ["*"] to allow all writes, or specify paths like ["analysis.results", "recommendations.*"]',
            'nvarchar',
            -1,
            0,
            0,
            0,
            '["*"]',
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

/* SQL text to delete entity field value ID A203443E-F36B-1410-8DB6-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='A203443E-F36B-1410-8DB6-00021F8B792E'

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].EntityFieldValue SET Sequence=7 WHERE ID='7605443E-F36B-1410-8DB6-00021F8B792E'

/* SQL text to delete entity field value ID C003443E-F36B-1410-8DB6-00021F8B792E */
DELETE FROM [${flyway:defaultSchema}].EntityFieldValue WHERE ID='C003443E-F36B-1410-8DB6-00021F8B792E'

/* Index for Foreign Keys for AIAgent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_ParentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_ParentID ON [${flyway:defaultSchema}].[AIAgent] ([ParentID]);

-- Index for foreign key ContextCompressionPromptID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID ON [${flyway:defaultSchema}].[AIAgent] ([ContextCompressionPromptID]);

-- Index for foreign key TypeID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_TypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_TypeID ON [${flyway:defaultSchema}].[AIAgent] ([TypeID]);

/* Base View SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Agents
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgent
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgents]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgents]
AS
SELECT
    a.*,
    AIAgent_ParentID.[Name] AS [Parent],
    AIPrompt_ContextCompressionPromptID.[Name] AS [ContextCompressionPrompt],
    AIAgentType_TypeID.[Name] AS [Type]
FROM
    [${flyway:defaultSchema}].[AIAgent] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_ParentID
  ON
    [a].[ParentID] = AIAgent_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_ContextCompressionPromptID
  ON
    [a].[ContextCompressionPromptID] = AIPrompt_ContextCompressionPromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentType] AS AIAgentType_TypeID
  ON
    [a].[TypeID] = AIAgentType_TypeID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: Permissions for vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spCreateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255),
    @ParentID uniqueidentifier,
    @ExposeAsAction bit,
    @ExecutionOrder int,
    @ExecutionMode nvarchar(20),
    @EnableContextCompression bit,
    @ContextCompressionMessageThreshold int,
    @ContextCompressionPromptID uniqueidentifier,
    @ContextCompressionMessageRetentionCount int,
    @TypeID uniqueidentifier,
    @Status nvarchar(20),
    @DriverClass nvarchar(255),
    @IconClass nvarchar(100),
    @ModelSelectionMode nvarchar(50),
    @PayloadDownstreamPaths nvarchar(MAX),
    @PayloadUpstreamPaths nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgent]
            (
                [ID],
                [Name],
                [Description],
                [LogoURL],
                [ParentID],
                [ExposeAsAction],
                [ExecutionOrder],
                [ExecutionMode],
                [EnableContextCompression],
                [ContextCompressionMessageThreshold],
                [ContextCompressionPromptID],
                [ContextCompressionMessageRetentionCount],
                [TypeID],
                [Status],
                [DriverClass],
                [IconClass],
                [ModelSelectionMode],
                [PayloadDownstreamPaths],
                [PayloadUpstreamPaths]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @LogoURL,
                @ParentID,
                @ExposeAsAction,
                @ExecutionOrder,
                @ExecutionMode,
                @EnableContextCompression,
                @ContextCompressionMessageThreshold,
                @ContextCompressionPromptID,
                @ContextCompressionMessageRetentionCount,
                @TypeID,
                @Status,
                @DriverClass,
                @IconClass,
                @ModelSelectionMode,
                @PayloadDownstreamPaths,
                @PayloadUpstreamPaths
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgent]
            (
                [Name],
                [Description],
                [LogoURL],
                [ParentID],
                [ExposeAsAction],
                [ExecutionOrder],
                [ExecutionMode],
                [EnableContextCompression],
                [ContextCompressionMessageThreshold],
                [ContextCompressionPromptID],
                [ContextCompressionMessageRetentionCount],
                [TypeID],
                [Status],
                [DriverClass],
                [IconClass],
                [ModelSelectionMode],
                [PayloadDownstreamPaths],
                [PayloadUpstreamPaths]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @LogoURL,
                @ParentID,
                @ExposeAsAction,
                @ExecutionOrder,
                @ExecutionMode,
                @EnableContextCompression,
                @ContextCompressionMessageThreshold,
                @ContextCompressionPromptID,
                @ContextCompressionMessageRetentionCount,
                @TypeID,
                @Status,
                @DriverClass,
                @IconClass,
                @ModelSelectionMode,
                @PayloadDownstreamPaths,
                @PayloadUpstreamPaths
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgent] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spUpdateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgent]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255),
    @ParentID uniqueidentifier,
    @ExposeAsAction bit,
    @ExecutionOrder int,
    @ExecutionMode nvarchar(20),
    @EnableContextCompression bit,
    @ContextCompressionMessageThreshold int,
    @ContextCompressionPromptID uniqueidentifier,
    @ContextCompressionMessageRetentionCount int,
    @TypeID uniqueidentifier,
    @Status nvarchar(20),
    @DriverClass nvarchar(255),
    @IconClass nvarchar(100),
    @ModelSelectionMode nvarchar(50),
    @PayloadDownstreamPaths nvarchar(MAX),
    @PayloadUpstreamPaths nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [LogoURL] = @LogoURL,
        [ParentID] = @ParentID,
        [ExposeAsAction] = @ExposeAsAction,
        [ExecutionOrder] = @ExecutionOrder,
        [ExecutionMode] = @ExecutionMode,
        [EnableContextCompression] = @EnableContextCompression,
        [ContextCompressionMessageThreshold] = @ContextCompressionMessageThreshold,
        [ContextCompressionPromptID] = @ContextCompressionPromptID,
        [ContextCompressionMessageRetentionCount] = @ContextCompressionMessageRetentionCount,
        [TypeID] = @TypeID,
        [Status] = @Status,
        [DriverClass] = @DriverClass,
        [IconClass] = @IconClass,
        [ModelSelectionMode] = @ModelSelectionMode,
        [PayloadDownstreamPaths] = @PayloadDownstreamPaths,
        [PayloadUpstreamPaths] = @PayloadUpstreamPaths
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgents]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgent
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgent
ON [${flyway:defaultSchema}].[AIAgent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgent] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: spDeleteAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgent
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgent]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgent]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration]
    

/* spDelete Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID EAFC433E-F36B-1410-8DB6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EAFC433E-F36B-1410-8DB6-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 73FD433E-F36B-1410-8DB6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='73FD433E-F36B-1410-8DB6-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 06FD433E-F36B-1410-8DB6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='06FD433E-F36B-1410-8DB6-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 75FD433E-F36B-1410-8DB6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='75FD433E-F36B-1410-8DB6-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 0DFD433E-F36B-1410-8DB6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0DFD433E-F36B-1410-8DB6-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 58FA433E-F36B-1410-8DB6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='58FA433E-F36B-1410-8DB6-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 97FA433E-F36B-1410-8DB6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='97FA433E-F36B-1410-8DB6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID C8FA433E-F36B-1410-8DB6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C8FA433E-F36B-1410-8DB6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 9EFA433E-F36B-1410-8DB6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9EFA433E-F36B-1410-8DB6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID A5FA433E-F36B-1410-8DB6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A5FA433E-F36B-1410-8DB6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 5BFB433E-F36B-1410-8DB6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5BFB433E-F36B-1410-8DB6-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID D9FB433E-F36B-1410-8DB6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D9FB433E-F36B-1410-8DB6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 2DFC433E-F36B-1410-8DB6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2DFC433E-F36B-1410-8DB6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID EEFB433E-F36B-1410-8DB6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EEFB433E-F36B-1410-8DB6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID F5FB433E-F36B-1410-8DB6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F5FB433E-F36B-1410-8DB6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID FCFB433E-F36B-1410-8DB6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FCFB433E-F36B-1410-8DB6-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 57FC433E-F36B-1410-8DB6-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='57FC433E-F36B-1410-8DB6-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'











-- SQL Logging Session
-- Session ID: 24fc9522-7d94-46f9-88c5-c9f604e6e077
-- Started: 2025-06-28T01:40:49.817Z
-- Description: MetadataSync push operation
-- Format: Migration-ready with Flyway schema placeholders
-- Generated by MemberJunction SQLServerDataProvider

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = N'Copywriter Agent',
@Description = N'Creative wordsmith specializing in crafting compelling initial drafts of marketing content with persuasive messaging!',
@LogoURL = NULL,
@ParentID = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF',
@ExposeAsAction = 0,
@ExecutionOrder = 1,
@ExecutionMode = N'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = N'Active',
@DriverClass = NULL,
@IconClass = N'fa-solid fa-feather',
@ModelSelectionMode = N'Agent Type',
@PayloadDownstreamPaths = N'[
  "metadata.*",
  "content.*",
  "copywriter.*",
  "seo.primaryKeyword",
  "seo.secondaryKeywords",
  "editor.feedback",
  "editor.suggestions",
  "brand.voiceConsistency",
  "brand.messagingPillars",
  "iterations.*"
]',
@PayloadUpstreamPaths = N'[
  "content.*",
  "copywriter.*",
  "metadata.lastModifiedBy",
  "metadata.updatedAt"
]',
@ID = '8A322A1B-27EE-4A89-A6C4-A47C856E5842';

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = N'SEO AIEO Specialist Agent',
@Description = N'Expert in optimizing content for both traditional search engines and AI-powered discovery platforms.',
@LogoURL = NULL,
@ParentID = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF',
@ExposeAsAction = 0,
@ExecutionOrder = 1,
@ExecutionMode = N'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = N'Active',
@DriverClass = NULL,
@IconClass = N'fa-solid fa-chart-line',
@ModelSelectionMode = N'Agent Type',
@PayloadDownstreamPaths = N'[
  "metadata.*",
  "content.*",
  "copywriter.*",
  "seo.*",
  "editor.feedback",
  "brand.messagingPillars",
  "iterations.*"
]',
@PayloadUpstreamPaths = N'[
  "content.headline",
  "content.alternativeHeadlines",
  "content.keyPoints",
  "seo.*",
  "metadata.lastModifiedBy",
  "metadata.updatedAt"
]',
@ID = '62CF643B-18E5-4C3B-BD0A-B3206E87BCE8';

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = N'Editor Agent',
@Description = N'Meticulous content professional ensuring quality, accuracy, and effectiveness of all marketing materials.',
@LogoURL = NULL,
@ParentID = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF',
@ExposeAsAction = 0,
@ExecutionOrder = 1,
@ExecutionMode = N'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = N'Active',
@DriverClass = NULL,
@IconClass = N'fa-solid fa-edit',
@ModelSelectionMode = N'Agent Type',
@PayloadDownstreamPaths = N'[
  "metadata.*",
  "content.*",
  "copywriter.*",
  "seo.*",
  "editor.*",
  "brand.*",
  "iterations.*"
]',
@PayloadUpstreamPaths = N'[
  "content.*",
  "editor.*",
  "copywriter.researchInsights",
  "seo.metaDescription",
  "metadata.lastModifiedBy",
  "metadata.updatedAt"
]',
@ID = '383FA7A1-E654-4D65-BC88-6CFE1C90086E';

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = N'Brand Guardian Agent',
@Description = N'Final checkpoint ensuring all marketing content aligns with brand values, voice, and visual identity.',
@LogoURL = NULL,
@ParentID = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF',
@ExposeAsAction = 0,
@ExecutionOrder = 1,
@ExecutionMode = N'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = N'Active',
@DriverClass = NULL,
@IconClass = N'fa-solid fa-shield-alt',
@ModelSelectionMode = N'Agent Type',
@PayloadDownstreamPaths = N'[
  "metadata.*",
  "content.*",
  "copywriter.*",
  "seo.*",
  "editor.*",
  "brand.*",
  "iterations.*"
]',
@PayloadUpstreamPaths = N'[
  "content.headline",
  "content.callToAction",
  "brand.*",
  "metadata.status",
  "metadata.lastModifiedBy",
  "metadata.updatedAt"
]',
@ID = '414901EA-0BAE-43C1-9B9F-0A6B48B6B768';

-- Save AI Agents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIAgent @Name = N'Publisher Agent',
@Description = N'Handles final content distribution with platform-specific optimization (publishing tools under development).',
@LogoURL = NULL,
@ParentID = '4A7B4F1D-C536-409F-9206-F36FDEE64EDF',
@ExposeAsAction = 0,
@ExecutionOrder = 1,
@ExecutionMode = N'Sequential',
@EnableContextCompression = 0,
@ContextCompressionMessageThreshold = NULL,
@ContextCompressionPromptID = NULL,
@ContextCompressionMessageRetentionCount = NULL,
@TypeID = 'F7926101-5099-4FA5-836A-479D9707C818',
@Status = N'Active',
@DriverClass = NULL,
@IconClass = N'fa-solid fa-paper-plane',
@ModelSelectionMode = N'Agent Type',
@PayloadDownstreamPaths = N'[
  "metadata.*",
  "content.*",
  "brand.approvalStatus",
  "iterations.*"
]',
@PayloadUpstreamPaths = N'[
  "publisher.*",
  "metadata.lastModifiedBy",
  "metadata.updatedAt"
]',
@ID = '6AD5B39D-CC3B-45E3-90F2-A00E2BC42E6D';


-- End of SQL Logging Session
-- Session ID: 24fc9522-7d94-46f9-88c5-c9f604e6e077
-- Completed: 2025-06-28T01:41:25.189Z
-- Duration: 35372ms
-- Total Statements: 5






-- SQL Logging Session
-- Session ID: 0e10433c-9af9-43bb-833c-c9047fc5259d
-- Started: 2025-06-28T02:21:39.977Z
-- Description: MetadataSync push operation
-- Format: Migration-ready with Flyway schema placeholders
-- Generated by MemberJunction SQLServerDataProvider

-- Save AI Prompts (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateAIPrompt @Name = N'Loop Agent Type: System Prompt',
@Description = N'Basic control structure for the Loop Agent Type',
@TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@CategoryID = '838572BE-9464-4935-BC34-4806FD80A69C',
@TypeID = 'A6DA423E-F36B-1410-8DAC-00021F8B792E',
@Status = N'Active',
@ResponseFormat = N'JSON',
@ModelSpecificResponseFormat = NULL,
@AIModelTypeID = NULL,
@MinPowerRank = 0,
@SelectionStrategy = N'Specific',
@PowerPreference = N'Highest',
@ParallelizationMode = N'None',
@ParallelCount = NULL,
@ParallelConfigParam = NULL,
@OutputType = N'object',
@OutputExample = N'{
  "taskComplete": "[BOOLEAN: true if task is fully complete, false if more steps needed]",
  "message": "[STRING: Human-readable message about current status or final result - this is what the user/caller sees - they do NOT see what is in the payload, so include EVERYTHING here that is important for the user even if it overlaps with the payload]",
  "payload*": {
    "[KEY]": "[VALUE: Your agent-specific data structure goes here]",
    "[EXAMPLE_STRUCTURE]": {
      "resultsFound": "[NUMBER or other data]",
      "processedItems": "[Array of processed data]",
      "customField": "[Any structure your agent needs to return]"
    },
    "[NOTE]": "This payload structure is completely flexible based on your agent''s purpose"
  },
  "reasoning": "[STRING: Your internal explanation of why you made this decision - helps with debugging]",
  "confidence?": "[OPTIONAL NUMBER: 0.0 to 1.0 indicating confidence in this decision]",
  "nextStep?": {
    "type": "[REQUIRED if taskComplete=false: Must be exactly one of: ''action'' | ''sub-agent'' | ''chat'']",
    "actions?": [
      {
        "id": "[UUID: The exact ID from available actions list]",
        "name": "[STRING: The exact name from available actions list]",
        "params*": {
          "[PARAM_NAME]": "[PARAM_VALUE: Must match action''s expected parameters]",
          "[ANOTHER_PARAM]": "[Value matching the action''s parameter type]"
        }
      }
    ],
    "subAgent?": {
      "id": "[UUID: The exact ID from available sub-agents list]",
      "name": "[STRING: The exact name from available sub-agents list]",
      "message": "[STRING: Complete context and instructions for the sub-agent - they don''t see conversation history]",
      "templateParameters*": {
        "[TEMPLATE_PARAM_NAME]": "[VALUE: If sub-agent has template parameters, provide values here]"
      },
      "terminateAfter?": "[BOOLEAN: true to end parent agent after sub-agent completes, false to continue]"
    }
  }
}',
@ValidationBehavior = N'Strict',
@MaxRetries = 2,
@RetryDelayMS = 1000,
@RetryStrategy = N'Fixed',
@ResultSelectorPromptID = NULL,
@EnableCaching = 0,
@CacheTTLSeconds = NULL,
@CacheMatchType = N'Exact',
@CacheSimilarityThreshold = NULL,
@CacheMustMatchModel = 1,
@CacheMustMatchVendor = 1,
@CacheMustMatchAgent = 0,
@CacheMustMatchConfig = 0,
@PromptRole = N'System',
@PromptPosition = N'First',
@Temperature = NULL,
@TopP = NULL,
@TopK = NULL,
@MinP = NULL,
@FrequencyPenalty = NULL,
@PresencePenalty = NULL,
@Seed = NULL,
@StopSequences = NULL,
@IncludeLogProbs = 0,
@TopLogProbs = NULL,
@ID = 'FF7D441F-36E1-458A-B548-0FC2208923BE';


-- End of SQL Logging Session
-- Session ID: 0e10433c-9af9-43bb-833c-c9047fc5259d
-- Completed: 2025-06-28T02:21:44.332Z
-- Duration: 4355ms
-- Total Statements: 1
