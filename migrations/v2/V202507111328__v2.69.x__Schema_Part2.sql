-- Add guardrail fields to AIAgent table
ALTER TABLE ${flyway:defaultSchema}.[AIAgent]
ADD MaxCostPerRun DECIMAL(10,4) NULL,
    MaxTokensPerRun INT NULL,
    MaxIterationsPerRun INT NULL,
    MaxTimePerRun INT NULL;

-- Add extended properties for documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum cost in dollars allowed for a single agent run. Run will be terminated
if this limit is exceeded.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'MaxCostPerRun';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum total tokens (input + output) allowed for a single agent run. Run will
be terminated if this limit is exceeded.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'MaxTokensPerRun';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum number of prompt iterations allowed for a single agent run. Run will be
terminated if this limit is exceeded.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'MaxIterationsPerRun';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Maximum time in seconds allowed for a single agent run. Run will be terminated
if this limit is exceeded.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgent',
    @level2type = N'COLUMN', @level2name = N'MaxTimePerRun';

-- Add TotalPromptIterations to AIAgentRun table
ALTER TABLE ${flyway:defaultSchema}.[AIAgentRun]
ADD TotalPromptIterations INT NOT NULL DEFAULT 0;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total number of prompt iterations executed during this agent run. Incremented
each time the agent processes a prompt step.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AIAgentRun',
    @level2type = N'COLUMN', @level2name = N'TotalPromptIterations';









/**** CodeGen Run *****/
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7411d673-9c57-4419-96ba-1c607b77da43'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'TotalPromptIterations')
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
            '7411d673-9c57-4419-96ba-1c607b77da43',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100031,
            'TotalPromptIterations',
            'Total Prompt Iterations',
            'Total number of prompt iterations executed during this agent run. Incremented
  each time the agent processes a prompt step.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '23850c5a-311a-4271-ae53-bd36921c5aa5'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'MaxCostPerRun')
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
            '23850c5a-311a-4271-ae53-bd36921c5aa5',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100028,
            'MaxCostPerRun',
            'Max Cost Per Run',
            'Maximum cost in dollars allowed for a single agent run. Run will be terminated
  if this limit is exceeded.',
            'decimal',
            9,
            10,
            4,
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
         WHERE ID = 'c5f8bb50-dc10-4dfc-ac45-8613c152ee94'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'MaxTokensPerRun')
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
            'c5f8bb50-dc10-4dfc-ac45-8613c152ee94',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100029,
            'MaxTokensPerRun',
            'Max Tokens Per Run',
            'Maximum total tokens (input + output) allowed for a single agent run. Run will
  be terminated if this limit is exceeded.',
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
         WHERE ID = '3fa6b9f3-60bc-4631-8eb4-7ed0d04844c4'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'MaxIterationsPerRun')
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
            '3fa6b9f3-60bc-4631-8eb4-7ed0d04844c4',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100030,
            'MaxIterationsPerRun',
            'Max Iterations Per Run',
            'Maximum number of prompt iterations allowed for a single agent run. Run will be
   terminated if this limit is exceeded.',
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
         WHERE ID = 'e64a4ff8-bad5-491c-9d8d-e5e70378ed67'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'MaxTimePerRun')
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
            'e64a4ff8-bad5-491c-9d8d-e5e70378ed67',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100031,
            'MaxTimePerRun',
            'Max Time Per Run',
            'Maximum time in seconds allowed for a single agent run. Run will be terminated
  if this limit is exceeded.',
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

/* Index for Foreign Keys for AIAgentRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_AgentID ON [${flyway:defaultSchema}].[AIAgentRun] ([AgentID]);

-- Index for foreign key ParentRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ParentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ParentRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([ParentRunID]);

-- Index for foreign key ConversationID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationID ON [${flyway:defaultSchema}].[AIAgentRun] ([ConversationID]);

-- Index for foreign key UserID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_UserID ON [${flyway:defaultSchema}].[AIAgentRun] ([UserID]);

-- Index for foreign key ConversationDetailID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationDetailID ON [${flyway:defaultSchema}].[AIAgentRun] ([ConversationDetailID]);

-- Index for foreign key LastRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_LastRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_LastRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([LastRunID]);

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

/* Base View SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: vwAIAgentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentRuns]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRuns]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    Conversation_ConversationID.[Name] AS [Conversation],
    User_UserID.[Name] AS [User]
FROM
    [${flyway:defaultSchema}].[AIAgentRun] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS Conversation_ConversationID
  ON
    [a].[ConversationID] = Conversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: Permissions for vwAIAgentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spCreateAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRun]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @ParentRunID uniqueidentifier,
    @Status nvarchar(50),
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @ConversationID uniqueidentifier,
    @UserID uniqueidentifier,
    @Result nvarchar(MAX),
    @AgentState nvarchar(MAX),
    @TotalTokensUsed int,
    @TotalCost decimal(18, 6),
    @TotalPromptTokensUsed int,
    @TotalCompletionTokensUsed int,
    @TotalTokensUsedRollup int,
    @TotalPromptTokensUsedRollup int,
    @TotalCompletionTokensUsedRollup int,
    @TotalCostRollup decimal(19, 8),
    @ConversationDetailID uniqueidentifier,
    @ConversationDetailSequence int,
    @CancellationReason nvarchar(30),
    @FinalStep nvarchar(30),
    @FinalPayload nvarchar(MAX),
    @Message nvarchar(MAX),
    @LastRunID uniqueidentifier,
    @StartingPayload nvarchar(MAX),
    @TotalPromptIterations int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRun]
            (
                [ID],
                [AgentID],
                [ParentRunID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [ConversationID],
                [UserID],
                [Result],
                [AgentState],
                [TotalTokensUsed],
                [TotalCost],
                [TotalPromptTokensUsed],
                [TotalCompletionTokensUsed],
                [TotalTokensUsedRollup],
                [TotalPromptTokensUsedRollup],
                [TotalCompletionTokensUsedRollup],
                [TotalCostRollup],
                [ConversationDetailID],
                [ConversationDetailSequence],
                [CancellationReason],
                [FinalStep],
                [FinalPayload],
                [Message],
                [LastRunID],
                [StartingPayload],
                [TotalPromptIterations]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @ParentRunID,
                @Status,
                @StartedAt,
                @CompletedAt,
                @Success,
                @ErrorMessage,
                @ConversationID,
                @UserID,
                @Result,
                @AgentState,
                @TotalTokensUsed,
                @TotalCost,
                @TotalPromptTokensUsed,
                @TotalCompletionTokensUsed,
                @TotalTokensUsedRollup,
                @TotalPromptTokensUsedRollup,
                @TotalCompletionTokensUsedRollup,
                @TotalCostRollup,
                @ConversationDetailID,
                @ConversationDetailSequence,
                @CancellationReason,
                @FinalStep,
                @FinalPayload,
                @Message,
                @LastRunID,
                @StartingPayload,
                @TotalPromptIterations
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRun]
            (
                [AgentID],
                [ParentRunID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [ConversationID],
                [UserID],
                [Result],
                [AgentState],
                [TotalTokensUsed],
                [TotalCost],
                [TotalPromptTokensUsed],
                [TotalCompletionTokensUsed],
                [TotalTokensUsedRollup],
                [TotalPromptTokensUsedRollup],
                [TotalCompletionTokensUsedRollup],
                [TotalCostRollup],
                [ConversationDetailID],
                [ConversationDetailSequence],
                [CancellationReason],
                [FinalStep],
                [FinalPayload],
                [Message],
                [LastRunID],
                [StartingPayload],
                [TotalPromptIterations]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @ParentRunID,
                @Status,
                @StartedAt,
                @CompletedAt,
                @Success,
                @ErrorMessage,
                @ConversationID,
                @UserID,
                @Result,
                @AgentState,
                @TotalTokensUsed,
                @TotalCost,
                @TotalPromptTokensUsed,
                @TotalCompletionTokensUsed,
                @TotalTokensUsedRollup,
                @TotalPromptTokensUsedRollup,
                @TotalCompletionTokensUsedRollup,
                @TotalCostRollup,
                @ConversationDetailID,
                @ConversationDetailSequence,
                @CancellationReason,
                @FinalStep,
                @FinalPayload,
                @Message,
                @LastRunID,
                @StartingPayload,
                @TotalPromptIterations
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spUpdateAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRun]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ParentRunID uniqueidentifier,
    @Status nvarchar(50),
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @ConversationID uniqueidentifier,
    @UserID uniqueidentifier,
    @Result nvarchar(MAX),
    @AgentState nvarchar(MAX),
    @TotalTokensUsed int,
    @TotalCost decimal(18, 6),
    @TotalPromptTokensUsed int,
    @TotalCompletionTokensUsed int,
    @TotalTokensUsedRollup int,
    @TotalPromptTokensUsedRollup int,
    @TotalCompletionTokensUsedRollup int,
    @TotalCostRollup decimal(19, 8),
    @ConversationDetailID uniqueidentifier,
    @ConversationDetailSequence int,
    @CancellationReason nvarchar(30),
    @FinalStep nvarchar(30),
    @FinalPayload nvarchar(MAX),
    @Message nvarchar(MAX),
    @LastRunID uniqueidentifier,
    @StartingPayload nvarchar(MAX),
    @TotalPromptIterations int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRun]
    SET
        [AgentID] = @AgentID,
        [ParentRunID] = @ParentRunID,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt,
        [Success] = @Success,
        [ErrorMessage] = @ErrorMessage,
        [ConversationID] = @ConversationID,
        [UserID] = @UserID,
        [Result] = @Result,
        [AgentState] = @AgentState,
        [TotalTokensUsed] = @TotalTokensUsed,
        [TotalCost] = @TotalCost,
        [TotalPromptTokensUsed] = @TotalPromptTokensUsed,
        [TotalCompletionTokensUsed] = @TotalCompletionTokensUsed,
        [TotalTokensUsedRollup] = @TotalTokensUsedRollup,
        [TotalPromptTokensUsedRollup] = @TotalPromptTokensUsedRollup,
        [TotalCompletionTokensUsedRollup] = @TotalCompletionTokensUsedRollup,
        [TotalCostRollup] = @TotalCostRollup,
        [ConversationDetailID] = @ConversationDetailID,
        [ConversationDetailSequence] = @ConversationDetailSequence,
        [CancellationReason] = @CancellationReason,
        [FinalStep] = @FinalStep,
        [FinalPayload] = @FinalPayload,
        [Message] = @Message,
        [LastRunID] = @LastRunID,
        [StartingPayload] = @StartingPayload,
        [TotalPromptIterations] = @TotalPromptIterations
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentRun
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRun
ON [${flyway:defaultSchema}].[AIAgentRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Integration]



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
    @MaxTimePerRun int
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
                [MaxTimePerRun]
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
                @PayloadUpstreamPaths,
                @PayloadSelfReadPaths,
                @PayloadSelfWritePaths,
                @PayloadScope,
                @FinalPayloadValidation,
                @FinalPayloadValidationMode,
                @FinalPayloadValidationMaxRetries,
                @MaxCostPerRun,
                @MaxTokensPerRun,
                @MaxIterationsPerRun,
                @MaxTimePerRun
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
                [MaxTimePerRun]
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
                @PayloadUpstreamPaths,
                @PayloadSelfReadPaths,
                @PayloadSelfWritePaths,
                @PayloadScope,
                @FinalPayloadValidation,
                @FinalPayloadValidationMode,
                @FinalPayloadValidationMaxRetries,
                @MaxCostPerRun,
                @MaxTokensPerRun,
                @MaxIterationsPerRun,
                @MaxTimePerRun
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
    @MaxTimePerRun int
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
        [MaxTimePerRun] = @MaxTimePerRun
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



