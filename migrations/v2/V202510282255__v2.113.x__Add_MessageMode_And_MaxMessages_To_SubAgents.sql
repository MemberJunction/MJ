/*
   Add MessageMode and MaxMessages to AIAgentRelationship and AIAgent tables

   Version: 2.113.x
   Date: 2025-10-28

   Purpose:
   - Enable configuration of conversation message passing strategy for sub-agents
   - AIAgentRelationship.MessageMode: Controls message flow for related sub-agents
     (stored here because one sub-agent can have multiple parent relationships)
   - AIAgent.MessageMode: Controls message flow for child sub-agents
     (stored here because each child sub-agent has only one parent via ParentID)

   Valid Values for MessageMode (default: 'None'):
   - 'None': Pass only context message and task message (fresh start - default)
   - 'All': Pass all parent conversation history
   - 'Latest': Pass most recent MaxMessages messages from conversation
   - 'Bookend': Pass first 2 messages + most recent (MaxMessages - 2) messages, with indicator message between

   MaxMessages: Maximum number of messages to include (NULL = no limit, only applies to Latest/Bookend modes)
*/

-- Add MessageMode column to AIAgentRelationship
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[AIAgentRelationship]') AND name = 'MessageMode')
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[AIAgentRelationship]
    ADD [MessageMode] NVARCHAR(50) NOT NULL DEFAULT 'None'
    CONSTRAINT [CK_AIAgentRelationship_MessageMode] CHECK ([MessageMode] IN ('None', 'All', 'Latest', 'Bookend'));
END
GO

-- Add MaxMessages column to AIAgentRelationship
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[AIAgentRelationship]') AND name = 'MaxMessages')
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[AIAgentRelationship]
    ADD [MaxMessages] INT NULL
    CONSTRAINT [CK_AIAgentRelationship_MaxMessages] CHECK ([MaxMessages] > 0);
END
GO

-- Add MessageMode column to AIAgent
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[AIAgent]') AND name = 'MessageMode')
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[AIAgent]
    ADD [MessageMode] NVARCHAR(50) NOT NULL DEFAULT 'None'
    CONSTRAINT [CK_AIAgent_MessageMode] CHECK ([MessageMode] IN ('None', 'All', 'Latest', 'Bookend'));
END
GO

-- Add MaxMessages column to AIAgent
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[AIAgent]') AND name = 'MaxMessages')
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[AIAgent]
    ADD [MaxMessages] INT NULL
    CONSTRAINT [CK_AIAgent_MaxMessages] CHECK ([MaxMessages] > 0);
END
GO

-- Add extended property for AIAgentRelationship.MessageMode
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Specifies how conversation messages are passed from parent agent to related sub-agent. Valid values: ''None'' (fresh start - only context and task message, default), ''All'' (all parent conversation history), ''Latest'' (most recent MaxMessages messages), ''Bookend'' (first 2 messages + most recent MaxMessages-2 messages with indicator between). Stored on relationship because related sub-agents can have multiple parents with different message passing needs.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentRelationship',
    @level2type = N'COLUMN', @level2name = N'MessageMode';
GO

-- Add extended property for AIAgentRelationship.MaxMessages
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum number of conversation messages to include when MessageMode is ''Latest'' or ''Bookend''. NULL means no limit (ignored for ''None'' and ''All'' modes). Must be greater than 0 if specified. For ''Latest'': keeps most recent N messages. For ''Bookend'': keeps first 2 + most recent (N-2) messages.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgentRelationship',
    @level2type = N'COLUMN', @level2name = N'MaxMessages';
GO

-- Add extended property for AIAgent.MessageMode
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Specifies how conversation messages are passed from parent agent to this child sub-agent (when this agent is a child via ParentID). Valid values: ''None'' (fresh start - only context and task message, default), ''All'' (all parent conversation history), ''Latest'' (most recent MaxMessages messages), ''Bookend'' (first 2 messages + most recent MaxMessages-2 messages with indicator between). Stored on child agent because each child has only one parent relationship.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'MessageMode';
GO

-- Add extended property for AIAgent.MaxMessages
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum number of conversation messages to include when MessageMode is ''Latest'' or ''Bookend''. NULL means no limit (ignored for ''None'' and ''All'' modes). Must be greater than 0 if specified. For ''Latest'': keeps most recent N messages. For ''Bookend'': keeps first 2 + most recent (N-2) messages.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'MaxMessages';
GO








/***** CODEGEN RUN *****/
         

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '445c1618-eadb-4b34-b318-40c662141fe1'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'MessageMode')
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
            '445c1618-eadb-4b34-b318-40c662141fe1',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100109,
            'MessageMode',
            'Message Mode',
            'Specifies how conversation messages are passed from parent agent to this child sub-agent (when this agent is a child via ParentID). Valid values: ''None'' (fresh start - only context and task message, default), ''All'' (all parent conversation history), ''Latest'' (most recent MaxMessages messages), ''Bookend'' (first 2 messages + most recent MaxMessages-2 messages with indicator between). Stored on child agent because each child has only one parent relationship.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'None',
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
         WHERE ID = 'f8924303-d53a-43b0-b70f-5b74fa6248d9'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'MaxMessages')
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
            'f8924303-d53a-43b0-b70f-5b74fa6248d9',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100110,
            'MaxMessages',
            'Max Messages',
            'Maximum number of conversation messages to include when MessageMode is ''Latest'' or ''Bookend''. NULL means no limit (ignored for ''None'' and ''All'' modes). Must be greater than 0 if specified. For ''Latest'': keeps most recent N messages. For ''Bookend'': keeps first 2 + most recent (N-2) messages.',
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
         WHERE ID = 'c7823cb8-5b5c-431b-924b-429015d897a9'  OR 
               (EntityID = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' AND Name = 'MessageMode')
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
            'c7823cb8-5b5c-431b-924b-429015d897a9',
            '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7', -- Entity: MJ: AI Agent Relationships
            100023,
            'MessageMode',
            'Message Mode',
            'Specifies how conversation messages are passed from parent agent to related sub-agent. Valid values: ''None'' (fresh start - only context and task message, default), ''All'' (all parent conversation history), ''Latest'' (most recent MaxMessages messages), ''Bookend'' (first 2 messages + most recent MaxMessages-2 messages with indicator between). Stored on relationship because related sub-agents can have multiple parents with different message passing needs.',
            'nvarchar',
            100,
            0,
            0,
            0,
            'None',
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
         WHERE ID = '68fc644e-70a6-4731-b79c-7e2931cecc42'  OR 
               (EntityID = '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7' AND Name = 'MaxMessages')
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
            '68fc644e-70a6-4731-b79c-7e2931cecc42',
            '24F8E069-1ACD-4DC4-B013-B6D5CE47EEA7', -- Entity: MJ: AI Agent Relationships
            100024,
            'MaxMessages',
            'Max Messages',
            'Maximum number of conversation messages to include when MessageMode is ''Latest'' or ''Bookend''. NULL means no limit (ignored for ''None'' and ''All'' modes). Must be greater than 0 if specified. For ''Latest'': keeps most recent N messages. For ''Bookend'': keeps first 2 + most recent (N-2) messages.',
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

/* SQL text to insert entity field value with ID 01582937-b36b-4992-93b8-147eb3f03cd7 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('01582937-b36b-4992-93b8-147eb3f03cd7', 'C7823CB8-5B5C-431B-924B-429015D897A9', 1, 'All', 'All')

/* SQL text to insert entity field value with ID 1cf10961-1467-4add-9610-265fccccb3bf */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1cf10961-1467-4add-9610-265fccccb3bf', 'C7823CB8-5B5C-431B-924B-429015D897A9', 2, 'Bookend', 'Bookend')

/* SQL text to insert entity field value with ID 647df0af-bdda-444d-a670-ae2adbc6bc0d */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('647df0af-bdda-444d-a670-ae2adbc6bc0d', 'C7823CB8-5B5C-431B-924B-429015D897A9', 3, 'Latest', 'Latest')

/* SQL text to insert entity field value with ID c2d4a330-c4d7-4c50-b49d-ed24b5979b3a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('c2d4a330-c4d7-4c50-b49d-ed24b5979b3a', 'C7823CB8-5B5C-431B-924B-429015D897A9', 4, 'None', 'None')

/* SQL text to update ValueListType for entity field ID C7823CB8-5B5C-431B-924B-429015D897A9 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='C7823CB8-5B5C-431B-924B-429015D897A9'

/* SQL text to insert entity field value with ID 4ab0dcf6-d0c1-4f2a-b7cc-7cd40d3f345d */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4ab0dcf6-d0c1-4f2a-b7cc-7cd40d3f345d', '445C1618-EADB-4B34-B318-40C662141FE1', 1, 'All', 'All')

/* SQL text to insert entity field value with ID 7e1ad36b-df8e-49fa-a35f-923c021d3c39 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('7e1ad36b-df8e-49fa-a35f-923c021d3c39', '445C1618-EADB-4B34-B318-40C662141FE1', 2, 'Bookend', 'Bookend')

/* SQL text to insert entity field value with ID acbf8fc8-2118-4fdc-aea9-a6e5b01fd855 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('acbf8fc8-2118-4fdc-aea9-a6e5b01fd855', '445C1618-EADB-4B34-B318-40C662141FE1', 3, 'Latest', 'Latest')

/* SQL text to insert entity field value with ID 27227362-32f6-4866-8eb9-09465492d482 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('27227362-32f6-4866-8eb9-09465492d482', '445C1618-EADB-4B34-B318-40C662141FE1', 4, 'None', 'None')

/* SQL text to update ValueListType for entity field ID 445C1618-EADB-4B34-B318-40C662141FE1 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='445C1618-EADB-4B34-B318-40C662141FE1'

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

-- Index for foreign key DefaultArtifactTypeID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_DefaultArtifactTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_DefaultArtifactTypeID ON [${flyway:defaultSchema}].[AIAgent] ([DefaultArtifactTypeID]);

-- Index for foreign key OwnerUserID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_OwnerUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_OwnerUserID ON [${flyway:defaultSchema}].[AIAgent] ([OwnerUserID]);

/* Root ID Function SQL for AI Agents.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agents
-- Item: fnAIAgentParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgent].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID]
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
            [${flyway:defaultSchema}].[AIAgent]
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
            [${flyway:defaultSchema}].[AIAgent] c
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
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgents]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgents];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgents]
AS
SELECT
    a.*,
    AIAgent_ParentID.[Name] AS [Parent],
    AIPrompt_ContextCompressionPromptID.[Name] AS [ContextCompressionPrompt],
    AIAgentType_TypeID.[Name] AS [Type],
    ArtifactType_DefaultArtifactTypeID.[Name] AS [DefaultArtifactType],
    User_OwnerUserID.[Name] AS [OwnerUser],
    root_ParentID.RootID AS [RootParentID]
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
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS ArtifactType_DefaultArtifactTypeID
  ON
    [a].[DefaultArtifactTypeID] = ArtifactType_DefaultArtifactTypeID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS User_OwnerUserID
  ON
    [a].[OwnerUserID] = User_OwnerUserID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgent]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @LogoURL nvarchar(255),
    @ParentID uniqueidentifier,
    @ExposeAsAction bit = NULL,
    @ExecutionOrder int = NULL,
    @ExecutionMode nvarchar(20) = NULL,
    @EnableContextCompression bit = NULL,
    @ContextCompressionMessageThreshold int,
    @ContextCompressionPromptID uniqueidentifier,
    @ContextCompressionMessageRetentionCount int,
    @TypeID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @DriverClass nvarchar(255),
    @IconClass nvarchar(100),
    @ModelSelectionMode nvarchar(50) = NULL,
    @PayloadDownstreamPaths nvarchar(MAX) = NULL,
    @PayloadUpstreamPaths nvarchar(MAX) = NULL,
    @PayloadSelfReadPaths nvarchar(MAX),
    @PayloadSelfWritePaths nvarchar(MAX),
    @PayloadScope nvarchar(MAX),
    @FinalPayloadValidation nvarchar(MAX),
    @FinalPayloadValidationMode nvarchar(25) = NULL,
    @FinalPayloadValidationMaxRetries int = NULL,
    @MaxCostPerRun decimal(10, 4),
    @MaxTokensPerRun int,
    @MaxIterationsPerRun int,
    @MaxTimePerRun int,
    @MinExecutionsPerRun int,
    @MaxExecutionsPerRun int,
    @StartingPayloadValidation nvarchar(MAX),
    @StartingPayloadValidationMode nvarchar(25) = NULL,
    @DefaultPromptEffortLevel int,
    @ChatHandlingOption nvarchar(30),
    @DefaultArtifactTypeID uniqueidentifier,
    @OwnerUserID uniqueidentifier = NULL,
    @InvocationMode nvarchar(20) = NULL,
    @ArtifactCreationMode nvarchar(20) = NULL,
    @FunctionalRequirements nvarchar(MAX),
    @TechnicalDesign nvarchar(MAX),
    @InjectNotes bit = NULL,
    @MaxNotesToInject int = NULL,
    @NoteInjectionStrategy nvarchar(20) = NULL,
    @InjectExamples bit = NULL,
    @MaxExamplesToInject int = NULL,
    @ExampleInjectionStrategy nvarchar(20) = NULL,
    @IsRestricted bit = NULL,
    @MessageMode nvarchar(50) = NULL,
    @MaxMessages int
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
                [PayloadUpstreamPaths],
                [PayloadSelfReadPaths],
                [PayloadSelfWritePaths],
                [PayloadScope],
                [FinalPayloadValidation],
                [FinalPayloadValidationMode],
                [FinalPayloadValidationMaxRetries],
                [MaxCostPerRun],
                [MaxTokensPerRun],
                [MaxIterationsPerRun],
                [MaxTimePerRun],
                [MinExecutionsPerRun],
                [MaxExecutionsPerRun],
                [StartingPayloadValidation],
                [StartingPayloadValidationMode],
                [DefaultPromptEffortLevel],
                [ChatHandlingOption],
                [DefaultArtifactTypeID],
                [OwnerUserID],
                [InvocationMode],
                [ArtifactCreationMode],
                [FunctionalRequirements],
                [TechnicalDesign],
                [InjectNotes],
                [MaxNotesToInject],
                [NoteInjectionStrategy],
                [InjectExamples],
                [MaxExamplesToInject],
                [ExampleInjectionStrategy],
                [IsRestricted],
                [MessageMode],
                [MaxMessages]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @LogoURL,
                @ParentID,
                ISNULL(@ExposeAsAction, 0),
                ISNULL(@ExecutionOrder, 0),
                ISNULL(@ExecutionMode, 'Sequential'),
                ISNULL(@EnableContextCompression, 0),
                @ContextCompressionMessageThreshold,
                @ContextCompressionPromptID,
                @ContextCompressionMessageRetentionCount,
                @TypeID,
                ISNULL(@Status, 'Pending'),
                @DriverClass,
                @IconClass,
                ISNULL(@ModelSelectionMode, 'Agent Type'),
                ISNULL(@PayloadDownstreamPaths, '["*"]'),
                ISNULL(@PayloadUpstreamPaths, '["*"]'),
                @PayloadSelfReadPaths,
                @PayloadSelfWritePaths,
                @PayloadScope,
                @FinalPayloadValidation,
                ISNULL(@FinalPayloadValidationMode, 'Retry'),
                ISNULL(@FinalPayloadValidationMaxRetries, 3),
                @MaxCostPerRun,
                @MaxTokensPerRun,
                @MaxIterationsPerRun,
                @MaxTimePerRun,
                @MinExecutionsPerRun,
                @MaxExecutionsPerRun,
                @StartingPayloadValidation,
                ISNULL(@StartingPayloadValidationMode, 'Fail'),
                @DefaultPromptEffortLevel,
                @ChatHandlingOption,
                @DefaultArtifactTypeID,
                CASE @OwnerUserID WHEN '00000000-0000-0000-0000-000000000000' THEN 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E' ELSE ISNULL(@OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E') END,
                ISNULL(@InvocationMode, 'Any'),
                ISNULL(@ArtifactCreationMode, 'Always'),
                @FunctionalRequirements,
                @TechnicalDesign,
                ISNULL(@InjectNotes, 1),
                ISNULL(@MaxNotesToInject, 5),
                ISNULL(@NoteInjectionStrategy, 'Relevant'),
                ISNULL(@InjectExamples, 0),
                ISNULL(@MaxExamplesToInject, 3),
                ISNULL(@ExampleInjectionStrategy, 'Semantic'),
                ISNULL(@IsRestricted, 0),
                ISNULL(@MessageMode, 'None'),
                @MaxMessages
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
                [PayloadUpstreamPaths],
                [PayloadSelfReadPaths],
                [PayloadSelfWritePaths],
                [PayloadScope],
                [FinalPayloadValidation],
                [FinalPayloadValidationMode],
                [FinalPayloadValidationMaxRetries],
                [MaxCostPerRun],
                [MaxTokensPerRun],
                [MaxIterationsPerRun],
                [MaxTimePerRun],
                [MinExecutionsPerRun],
                [MaxExecutionsPerRun],
                [StartingPayloadValidation],
                [StartingPayloadValidationMode],
                [DefaultPromptEffortLevel],
                [ChatHandlingOption],
                [DefaultArtifactTypeID],
                [OwnerUserID],
                [InvocationMode],
                [ArtifactCreationMode],
                [FunctionalRequirements],
                [TechnicalDesign],
                [InjectNotes],
                [MaxNotesToInject],
                [NoteInjectionStrategy],
                [InjectExamples],
                [MaxExamplesToInject],
                [ExampleInjectionStrategy],
                [IsRestricted],
                [MessageMode],
                [MaxMessages]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @LogoURL,
                @ParentID,
                ISNULL(@ExposeAsAction, 0),
                ISNULL(@ExecutionOrder, 0),
                ISNULL(@ExecutionMode, 'Sequential'),
                ISNULL(@EnableContextCompression, 0),
                @ContextCompressionMessageThreshold,
                @ContextCompressionPromptID,
                @ContextCompressionMessageRetentionCount,
                @TypeID,
                ISNULL(@Status, 'Pending'),
                @DriverClass,
                @IconClass,
                ISNULL(@ModelSelectionMode, 'Agent Type'),
                ISNULL(@PayloadDownstreamPaths, '["*"]'),
                ISNULL(@PayloadUpstreamPaths, '["*"]'),
                @PayloadSelfReadPaths,
                @PayloadSelfWritePaths,
                @PayloadScope,
                @FinalPayloadValidation,
                ISNULL(@FinalPayloadValidationMode, 'Retry'),
                ISNULL(@FinalPayloadValidationMaxRetries, 3),
                @MaxCostPerRun,
                @MaxTokensPerRun,
                @MaxIterationsPerRun,
                @MaxTimePerRun,
                @MinExecutionsPerRun,
                @MaxExecutionsPerRun,
                @StartingPayloadValidation,
                ISNULL(@StartingPayloadValidationMode, 'Fail'),
                @DefaultPromptEffortLevel,
                @ChatHandlingOption,
                @DefaultArtifactTypeID,
                CASE @OwnerUserID WHEN '00000000-0000-0000-0000-000000000000' THEN 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E' ELSE ISNULL(@OwnerUserID, 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E') END,
                ISNULL(@InvocationMode, 'Any'),
                ISNULL(@ArtifactCreationMode, 'Always'),
                @FunctionalRequirements,
                @TechnicalDesign,
                ISNULL(@InjectNotes, 1),
                ISNULL(@MaxNotesToInject, 5),
                ISNULL(@NoteInjectionStrategy, 'Relevant'),
                ISNULL(@InjectExamples, 0),
                ISNULL(@MaxExamplesToInject, 3),
                ISNULL(@ExampleInjectionStrategy, 'Semantic'),
                ISNULL(@IsRestricted, 0),
                ISNULL(@MessageMode, 'None'),
                @MaxMessages
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgent];
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
    @PayloadUpstreamPaths nvarchar(MAX),
    @PayloadSelfReadPaths nvarchar(MAX),
    @PayloadSelfWritePaths nvarchar(MAX),
    @PayloadScope nvarchar(MAX),
    @FinalPayloadValidation nvarchar(MAX),
    @FinalPayloadValidationMode nvarchar(25),
    @FinalPayloadValidationMaxRetries int,
    @MaxCostPerRun decimal(10, 4),
    @MaxTokensPerRun int,
    @MaxIterationsPerRun int,
    @MaxTimePerRun int,
    @MinExecutionsPerRun int,
    @MaxExecutionsPerRun int,
    @StartingPayloadValidation nvarchar(MAX),
    @StartingPayloadValidationMode nvarchar(25),
    @DefaultPromptEffortLevel int,
    @ChatHandlingOption nvarchar(30),
    @DefaultArtifactTypeID uniqueidentifier,
    @OwnerUserID uniqueidentifier,
    @InvocationMode nvarchar(20),
    @ArtifactCreationMode nvarchar(20),
    @FunctionalRequirements nvarchar(MAX),
    @TechnicalDesign nvarchar(MAX),
    @InjectNotes bit,
    @MaxNotesToInject int,
    @NoteInjectionStrategy nvarchar(20),
    @InjectExamples bit,
    @MaxExamplesToInject int,
    @ExampleInjectionStrategy nvarchar(20),
    @IsRestricted bit,
    @MessageMode nvarchar(50),
    @MaxMessages int
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
        [PayloadUpstreamPaths] = @PayloadUpstreamPaths,
        [PayloadSelfReadPaths] = @PayloadSelfReadPaths,
        [PayloadSelfWritePaths] = @PayloadSelfWritePaths,
        [PayloadScope] = @PayloadScope,
        [FinalPayloadValidation] = @FinalPayloadValidation,
        [FinalPayloadValidationMode] = @FinalPayloadValidationMode,
        [FinalPayloadValidationMaxRetries] = @FinalPayloadValidationMaxRetries,
        [MaxCostPerRun] = @MaxCostPerRun,
        [MaxTokensPerRun] = @MaxTokensPerRun,
        [MaxIterationsPerRun] = @MaxIterationsPerRun,
        [MaxTimePerRun] = @MaxTimePerRun,
        [MinExecutionsPerRun] = @MinExecutionsPerRun,
        [MaxExecutionsPerRun] = @MaxExecutionsPerRun,
        [StartingPayloadValidation] = @StartingPayloadValidation,
        [StartingPayloadValidationMode] = @StartingPayloadValidationMode,
        [DefaultPromptEffortLevel] = @DefaultPromptEffortLevel,
        [ChatHandlingOption] = @ChatHandlingOption,
        [DefaultArtifactTypeID] = @DefaultArtifactTypeID,
        [OwnerUserID] = @OwnerUserID,
        [InvocationMode] = @InvocationMode,
        [ArtifactCreationMode] = @ArtifactCreationMode,
        [FunctionalRequirements] = @FunctionalRequirements,
        [TechnicalDesign] = @TechnicalDesign,
        [InjectNotes] = @InjectNotes,
        [MaxNotesToInject] = @MaxNotesToInject,
        [NoteInjectionStrategy] = @NoteInjectionStrategy,
        [InjectExamples] = @InjectExamples,
        [MaxExamplesToInject] = @MaxExamplesToInject,
        [ExampleInjectionStrategy] = @ExampleInjectionStrategy,
        [IsRestricted] = @IsRestricted,
        [MessageMode] = @MessageMode,
        [MaxMessages] = @MaxMessages
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
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
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgent]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgent];
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgent]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgent];
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


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration]
    

/* spDelete Permissions for AI Agents */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Integration]


/* Index for Foreign Keys for AIAgentRelationship */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRelationship_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRelationship_AgentID ON [${flyway:defaultSchema}].[AIAgentRelationship] ([AgentID]);

-- Index for foreign key SubAgentID in table AIAgentRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRelationship_SubAgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRelationship_SubAgentID ON [${flyway:defaultSchema}].[AIAgentRelationship] ([SubAgentID]);

/* Base View SQL for MJ: AI Agent Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: vwAIAgentRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Relationships
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRelationship
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentRelationships]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentRelationships];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRelationships]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    AIAgent_SubAgentID.[Name] AS [SubAgent]
FROM
    [${flyway:defaultSchema}].[AIAgentRelationship] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_SubAgentID
  ON
    [a].[SubAgentID] = AIAgent_SubAgentID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRelationships] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: Permissions for vwAIAgentRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRelationships] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: spCreateAIAgentRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRelationship]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @SubAgentID uniqueidentifier,
    @Status nvarchar(50),
    @SubAgentOutputMapping nvarchar(MAX),
    @SubAgentInputMapping nvarchar(MAX),
    @SubAgentContextPaths nvarchar(MAX),
    @MessageMode nvarchar(50) = NULL,
    @MaxMessages int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRelationship]
            (
                [ID],
                [AgentID],
                [SubAgentID],
                [Status],
                [SubAgentOutputMapping],
                [SubAgentInputMapping],
                [SubAgentContextPaths],
                [MessageMode],
                [MaxMessages]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @SubAgentID,
                @Status,
                @SubAgentOutputMapping,
                @SubAgentInputMapping,
                @SubAgentContextPaths,
                ISNULL(@MessageMode, 'None'),
                @MaxMessages
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRelationship]
            (
                [AgentID],
                [SubAgentID],
                [Status],
                [SubAgentOutputMapping],
                [SubAgentInputMapping],
                [SubAgentContextPaths],
                [MessageMode],
                [MaxMessages]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @SubAgentID,
                @Status,
                @SubAgentOutputMapping,
                @SubAgentInputMapping,
                @SubAgentContextPaths,
                ISNULL(@MessageMode, 'None'),
                @MaxMessages
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRelationships] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRelationship] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRelationship] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: spUpdateAIAgentRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRelationship]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @SubAgentID uniqueidentifier,
    @Status nvarchar(50),
    @SubAgentOutputMapping nvarchar(MAX),
    @SubAgentInputMapping nvarchar(MAX),
    @SubAgentContextPaths nvarchar(MAX),
    @MessageMode nvarchar(50),
    @MaxMessages int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRelationship]
    SET
        [AgentID] = @AgentID,
        [SubAgentID] = @SubAgentID,
        [Status] = @Status,
        [SubAgentOutputMapping] = @SubAgentOutputMapping,
        [SubAgentInputMapping] = @SubAgentInputMapping,
        [SubAgentContextPaths] = @SubAgentContextPaths,
        [MessageMode] = @MessageMode,
        [MaxMessages] = @MaxMessages
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentRelationships] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRelationships]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRelationship] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRelationship table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentRelationship]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentRelationship];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRelationship
ON [${flyway:defaultSchema}].[AIAgentRelationship]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRelationship]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRelationship] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRelationship] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Relationships
-- Item: spDeleteAIAgentRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRelationship]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRelationship]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] TO [cdp_Integration]

/* Generated Validation Functions for AI Agents */
-- CHECK constraint for AI Agents: Field: MaxMessages was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([MaxMessages]>(0))', 'public ValidateMaxMessagesGreaterThanZero(result: ValidationResult) {
	if (this.MaxMessages != null && this.MaxMessages <= 0) {
		result.Errors.push(new ValidationErrorInfo("MaxMessages", "If a maximum number of messages is specified, it must be greater than zero.", this.MaxMessages, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the maximum number of messages, if specified, must be greater than zero.', 'ValidateMaxMessagesGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'F8924303-D53A-43B0-B70F-5B74FA6248D9');
  
            

/* Generated Validation Functions for MJ: AI Agent Relationships */
-- CHECK constraint for MJ: AI Agent Relationships: Field: MaxMessages was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([MaxMessages]>(0))', 'public ValidateMaxMessagesGreaterThanZero(result: ValidationResult) {
	if (this.MaxMessages != null && this.MaxMessages <= 0) {
		result.Errors.push(new ValidationErrorInfo("MaxMessages", "MaxMessages must be greater than 0 when specified.", this.MaxMessages, ValidationErrorType.Failure));
	}
}', 'This rule makes sure that if a value is specified for MaxMessages, it must be greater than 0.', 'ValidateMaxMessagesGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '68FC644E-70A6-4731-B79C-7E2931CECC42');
  
