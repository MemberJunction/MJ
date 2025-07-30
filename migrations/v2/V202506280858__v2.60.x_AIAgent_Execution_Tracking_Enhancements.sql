-- =======================================================================
-- Title: AI Agent Execution Tracking Enhancements
-- Summary: Add fields to AIAgentRun and AIAgentRunStep for better execution tracking,
--          add payload paths to AIAgent, and improve state management
-- =======================================================================

-- Update NULL StepType values to default before making NOT NULL
UPDATE ${flyway:defaultSchema}.AIAgentRunStep
SET StepType = 'Prompt'
WHERE StepType IS NULL;

-- ALTER TABLE statements for AIAgentRunStep
ALTER TABLE ${flyway:defaultSchema}.AIAgentRunStep
ALTER COLUMN StepType nvarchar(50) NOT NULL;

-- ALTER TABLE statements for AIAgentRun
ALTER TABLE ${flyway:defaultSchema}.AIAgentRun 
ADD ConversationDetailID uniqueidentifier NULL,
    ConversationDetailSequence INT NULL,
    CancellationReason nvarchar(30) NULL,
    FinalStep nvarchar(30) NULL,
    FinalPayload nvarchar(MAX) NULL;
GO

-- Add foreign key constraint
ALTER TABLE ${flyway:defaultSchema}.AIAgentRun
ADD CONSTRAINT FK_AIAgentRun_ConversationDetail 
FOREIGN KEY (ConversationDetailID) REFERENCES ${flyway:defaultSchema}.ConversationDetail(ID);

-- Add check constraints
ALTER TABLE ${flyway:defaultSchema}.AIAgentRun
ADD CONSTRAINT CK_AIAgentRun_CancellationReason 
CHECK (CancellationReason IN ('User Request', 'Timeout', 'System'));

ALTER TABLE ${flyway:defaultSchema}.AIAgentRun
ADD CONSTRAINT CK_AIAgentRun_FinalStep 
CHECK (FinalStep IN ('Success', 'Failed', 'Retry', 'Sub-Agent', 'Actions', 'Chat'));


-- Drop existing default constraint if it exists
DECLARE @DefaultConstraintName NVARCHAR(255)
SELECT @DefaultConstraintName = dc.name 
FROM sys.default_constraints dc
INNER JOIN sys.columns c ON dc.parent_object_id = c.object_id AND dc.parent_column_id = c.column_id
WHERE dc.parent_object_id = OBJECT_ID('${flyway:defaultSchema}.AIAgentRunStep') 
AND c.name = 'StepType'

IF @DefaultConstraintName IS NOT NULL
BEGIN
    EXEC('ALTER TABLE ${flyway:defaultSchema}.AIAgentRunStep DROP CONSTRAINT ' + @DefaultConstraintName)
END


UPDATE ${flyway:defaultSchema}.AIAgentRunStep SET StepType='Actions' WHERE StepType='action' 
UPDATE ${flyway:defaultSchema}.AIAgentRunStep SET StepType='Sub-Agent' WHERE StepType='subagent' 

-- Add default constraint for StepType
ALTER TABLE ${flyway:defaultSchema}.AIAgentRunStep
ADD CONSTRAINT DF_AIAgentRunStep_StepType DEFAULT 'Prompt' FOR StepType;

ALTER TABLE ${flyway:defaultSchema}.AIAgentRunStep
ADD CONSTRAINT CK_AIAgentRunStep_StepType 
CHECK (StepType IN ('Prompt', 'Actions', 'Sub-Agent', 'Decision', 'Chat', 'Validation'));

-- Add payload tracking fields
ALTER TABLE ${flyway:defaultSchema}.AIAgentRunStep
ADD PayloadAtStart nvarchar(MAX) NULL,
    PayloadAtEnd nvarchar(MAX) NULL;
 

-- Extended properties section
-- Drop existing extended property for StepType if it exists
IF EXISTS (SELECT * FROM sys.extended_properties 
           WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.AIAgentRunStep') 
           AND minor_id = (SELECT column_id FROM sys.columns 
                          WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.AIAgentRunStep') 
                          AND name = 'StepType')
           AND name = 'MS_Description')
BEGIN
    EXEC sp_dropextendedproperty 
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = 'AIAgentRunStep',
        @level2type = N'COLUMN', @level2name = 'StepType';
END

-- Add extended properties for AIAgentRun
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Optional tracking of a specific conversation detail (e.g. a specific message) that spawned this agent run',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRun',
    @level2type = N'COLUMN', @level2name = 'ConversationDetailID';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'If a conversation detail spawned multiple agent runs, tracks the order of their spawn/execution',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRun',
    @level2type = N'COLUMN', @level2name = 'ConversationDetailSequence';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Reason for cancellation if the agent run was cancelled',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRun',
    @level2type = N'COLUMN', @level2name = 'CancellationReason';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'The final step type that concluded the agent run',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRun',
    @level2type = N'COLUMN', @level2name = 'FinalStep';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON serialization of the final Payload state at the end of the agent run',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRun',
    @level2type = N'COLUMN', @level2name = 'FinalPayload';

-- Add extended properties for AIAgentRunStep
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Type of execution step: Prompt, Actions, Sub-Agent, Decision, Chat, Validation',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRunStep',
    @level2type = N'COLUMN', @level2name = 'StepType';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON serialization of the Payload state at the start of this step',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRunStep',
    @level2type = N'COLUMN', @level2name = 'PayloadAtStart';

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'JSON serialization of the Payload state at the end of this step',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgentRunStep',
    @level2type = N'COLUMN', @level2name = 'PayloadAtEnd';
 



/**** CODE GEN RUN *****/






/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8505597e-558f-4222-abf7-5ba4e163a97d'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'ConversationDetailID')
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
            '8505597e-558f-4222-abf7-5ba4e163a97d',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100023,
            'ConversationDetailID',
            'Conversation Detail ID',
            'Optional tracking of a specific conversation detail (e.g. a specific message) that spawned this agent run',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '12248F34-2837-EF11-86D4-6045BDEE16E6',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd4896b2f-d530-4844-8c96-a0016f0a81d4'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'ConversationDetailSequence')
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
            'd4896b2f-d530-4844-8c96-a0016f0a81d4',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100024,
            'ConversationDetailSequence',
            'Conversation Detail Sequence',
            'If a conversation detail spawned multiple agent runs, tracks the order of their spawn/execution',
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
         WHERE ID = '14a76d05-d24c-4ee0-b24e-b840dd330f60'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'CancellationReason')
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
            '14a76d05-d24c-4ee0-b24e-b840dd330f60',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100025,
            'CancellationReason',
            'Cancellation Reason',
            'Reason for cancellation if the agent run was cancelled',
            'nvarchar',
            60,
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
         WHERE ID = 'a04bedcf-f261-4734-a1a6-91a1aefee5ed'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'FinalStep')
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
            'a04bedcf-f261-4734-a1a6-91a1aefee5ed',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100026,
            'FinalStep',
            'Final Step',
            'The final step type that concluded the agent run',
            'nvarchar',
            60,
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
         WHERE ID = '6fff2754-a03e-4dfd-ac17-fb16cdad5346'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'FinalPayload')
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
            '6fff2754-a03e-4dfd-ac17-fb16cdad5346',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100027,
            'FinalPayload',
            'Final Payload',
            'JSON serialization of the final Payload state at the end of the agent run',
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
         WHERE ID = '93a2c3a5-2773-4dea-847c-0d1aad1929aa'  OR 
               (EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'PayloadAtStart')
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
            '93a2c3a5-2773-4dea-847c-0d1aad1929aa',
            '99273DAD-560E-4ABC-8332-C97AB58B7463', -- Entity: MJ: AI Agent Run Steps
            100017,
            'PayloadAtStart',
            'Payload At Start',
            'JSON serialization of the Payload state at the start of this step',
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
         WHERE ID = 'dd7a82bd-c269-434b-9bb4-bbac6064af98'  OR 
               (EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'PayloadAtEnd')
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
            'dd7a82bd-c269-434b-9bb4-bbac6064af98',
            '99273DAD-560E-4ABC-8332-C97AB58B7463', -- Entity: MJ: AI Agent Run Steps
            100018,
            'PayloadAtEnd',
            'Payload At End',
            'JSON serialization of the Payload state at the end of this step',
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

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '9f73c4a0-5f11-48cc-9426-94174ba8ce36'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('9f73c4a0-5f11-48cc-9426-94174ba8ce36', '12248F34-2837-EF11-86D4-6045BDEE16E6', '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'ConversationDetailID', 'One To Many', 1, 1, 'MJ: AI Agent Runs', 4);
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
    @FinalPayload nvarchar(MAX)
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
                [FinalPayload]
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
                @FinalPayload
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
                [FinalPayload]
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
                @FinalPayload
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
    @FinalPayload nvarchar(MAX)
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
        [FinalPayload] = @FinalPayload
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
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


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Integration]



/* Index for Foreign Keys for AIAgentRunStep */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentRunID in table AIAgentRunStep
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRunStep_AgentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRunStep]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRunStep_AgentRunID ON [${flyway:defaultSchema}].[AIAgentRunStep] ([AgentRunID]);

/* Base View SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: vwAIAgentRunSteps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Run Steps
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRunStep
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentRunSteps]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRunSteps]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[AIAgentRunStep] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunSteps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: Permissions for vwAIAgentRunSteps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunSteps] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: spCreateAIAgentRunStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRunStep
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentRunStep]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRunStep]
    @ID uniqueidentifier = NULL,
    @AgentRunID uniqueidentifier,
    @StepNumber int,
    @StepType nvarchar(50),
    @StepName nvarchar(255),
    @TargetID uniqueidentifier,
    @Status nvarchar(50),
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @InputData nvarchar(MAX),
    @OutputData nvarchar(MAX),
    @TargetLogID uniqueidentifier,
    @PayloadAtStart nvarchar(MAX),
    @PayloadAtEnd nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRunStep]
            (
                [ID],
                [AgentRunID],
                [StepNumber],
                [StepType],
                [StepName],
                [TargetID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [InputData],
                [OutputData],
                [TargetLogID],
                [PayloadAtStart],
                [PayloadAtEnd]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentRunID,
                @StepNumber,
                @StepType,
                @StepName,
                @TargetID,
                @Status,
                @StartedAt,
                @CompletedAt,
                @Success,
                @ErrorMessage,
                @InputData,
                @OutputData,
                @TargetLogID,
                @PayloadAtStart,
                @PayloadAtEnd
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRunStep]
            (
                [AgentRunID],
                [StepNumber],
                [StepType],
                [StepName],
                [TargetID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [InputData],
                [OutputData],
                [TargetLogID],
                [PayloadAtStart],
                [PayloadAtEnd]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentRunID,
                @StepNumber,
                @StepType,
                @StepName,
                @TargetID,
                @Status,
                @StartedAt,
                @CompletedAt,
                @Success,
                @ErrorMessage,
                @InputData,
                @OutputData,
                @TargetLogID,
                @PayloadAtStart,
                @PayloadAtEnd
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRunSteps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunStep] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Run Steps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunStep] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: spUpdateAIAgentRunStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRunStep
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentRunStep]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRunStep]
    @ID uniqueidentifier,
    @AgentRunID uniqueidentifier,
    @StepNumber int,
    @StepType nvarchar(50),
    @StepName nvarchar(255),
    @TargetID uniqueidentifier,
    @Status nvarchar(50),
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @InputData nvarchar(MAX),
    @OutputData nvarchar(MAX),
    @TargetLogID uniqueidentifier,
    @PayloadAtStart nvarchar(MAX),
    @PayloadAtEnd nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRunStep]
    SET
        [AgentRunID] = @AgentRunID,
        [StepNumber] = @StepNumber,
        [StepType] = @StepType,
        [StepName] = @StepName,
        [TargetID] = @TargetID,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt,
        [Success] = @Success,
        [ErrorMessage] = @ErrorMessage,
        [InputData] = @InputData,
        [OutputData] = @OutputData,
        [TargetLogID] = @TargetLogID,
        [PayloadAtStart] = @PayloadAtStart,
        [PayloadAtEnd] = @PayloadAtEnd
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
    SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRunSteps]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRunStep table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentRunStep
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRunStep
ON [${flyway:defaultSchema}].[AIAgentRunStep]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRunStep]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRunStep] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Run Steps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: spDeleteAIAgentRunStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRunStep
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentRunStep]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRunStep]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRunStep]
    WHERE
        [ID] = @ID


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Run Steps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] TO [cdp_Integration]



-- CHECK constraint for MJ: AI Agent Runs: Field: FinalStep was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([FinalStep]=''Chat'' OR [FinalStep]=''Actions'' OR [FinalStep]=''Sub-Agent'' OR [FinalStep]=''Retry'' OR [FinalStep]=''Failed'' OR [FinalStep]=''Success'' OR [FinalStep] IS NULL)', 'public ValidateFinalStepAgainstAllowedValues(result: ValidationResult) {
	const allowedValues = ["Chat", "Actions", "Sub-Agent", "Retry", "Failed", "Success", null];
	if (!allowedValues.includes(this.FinalStep)) {
		result.Errors.push(new ValidationErrorInfo("FinalStep", "FinalStep must be one of ''Chat'', ''Actions'', ''Sub-Agent'', ''Retry'', ''Failed'', ''Success'', or left blank (null).", this.FinalStep, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the FinalStep field can only contain the values ''Chat'', ''Actions'', ''Sub-Agent'', ''Retry'', ''Failed'', ''Success'', or be left blank.', 'ValidateFinalStepAgainstAllowedValues', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'A04BEDCF-F261-4734-A1A6-91A1AEFEE5ED');
  
            -- CHECK constraint for MJ: AI Agent Runs: Field: CancellationReason was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([CancellationReason]=''System'' OR [CancellationReason]=''Timeout'' OR [CancellationReason]=''User Request'' OR [CancellationReason] IS NULL)', 'public ValidateCancellationReasonInAllowedValues(result: ValidationResult) {
	const allowedReasons = ["System", "Timeout", "User Request"];
	if (this.CancellationReason !== null && !allowedReasons.includes(this.CancellationReason)) {
		result.Errors.push(new ValidationErrorInfo("CancellationReason", "The cancellation reason must be either ''System'', ''Timeout'', ''User Request'', or left blank.", this.CancellationReason, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the cancellation reason, if provided, must be either ''System'', ''Timeout'', or ''User Request''. It can also be left blank (null).', 'ValidateCancellationReasonInAllowedValues', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '14A76D05-D24C-4EE0-B24E-B840DD330F60');
  
            








/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('B04A327B-55BF-4914-9DCF-3552A5DD0293', 1, 'Prompt', 'Prompt')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('B04A327B-55BF-4914-9DCF-3552A5DD0293', 2, 'Actions', 'Actions')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('B04A327B-55BF-4914-9DCF-3552A5DD0293', 3, 'Sub-Agent', 'Sub-Agent')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('B04A327B-55BF-4914-9DCF-3552A5DD0293', 4, 'Decision', 'Decision')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('B04A327B-55BF-4914-9DCF-3552A5DD0293', 5, 'Chat', 'Chat')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('B04A327B-55BF-4914-9DCF-3552A5DD0293', 6, 'Validation', 'Validation')

/* SQL text to update ValueListType for entity field ID B04A327B-55BF-4914-9DCF-3552A5DD0293 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='B04A327B-55BF-4914-9DCF-3552A5DD0293'













/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('14A76D05-D24C-4EE0-B24E-B840DD330F60', 1, 'User Request', 'User Request')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('14A76D05-D24C-4EE0-B24E-B840DD330F60', 2, 'Timeout', 'Timeout')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('14A76D05-D24C-4EE0-B24E-B840DD330F60', 3, 'System', 'System')

/* SQL text to update ValueListType for entity field ID 14A76D05-D24C-4EE0-B24E-B840DD330F60 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='14A76D05-D24C-4EE0-B24E-B840DD330F60'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A04BEDCF-F261-4734-A1A6-91A1AEFEE5ED', 1, 'Success', 'Success')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A04BEDCF-F261-4734-A1A6-91A1AEFEE5ED', 2, 'Failed', 'Failed')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A04BEDCF-F261-4734-A1A6-91A1AEFEE5ED', 3, 'Retry', 'Retry')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A04BEDCF-F261-4734-A1A6-91A1AEFEE5ED', 4, 'Sub-Agent', 'Sub-Agent')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A04BEDCF-F261-4734-A1A6-91A1AEFEE5ED', 5, 'Actions', 'Actions')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('A04BEDCF-F261-4734-A1A6-91A1AEFEE5ED', 6, 'Chat', 'Chat')

/* SQL text to update ValueListType for entity field ID A04BEDCF-F261-4734-A1A6-91A1AEFEE5ED */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='A04BEDCF-F261-4734-A1A6-91A1AEFEE5ED'














-- SQL Logging Session
-- Session ID: 207bc1c4-f0e5-46eb-9fe6-a38dd6a986d1
-- Started: 2025-06-28T21:09:22.540Z
-- Description: MetadataSync push operation
-- Format: Migration-ready with Flyway schema placeholders
-- Generated by MemberJunction SQLServerDataProvider

-- Save Template Contents (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateContent @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@TypeID = 'E7AFCCEC-6A37-EF11-86D4-000D3A4E707E',
@TemplateText = N'# Loop Agent Type System Prompt

You are an AI agent operating in a **continuous loop-based execution pattern**. Your role is to iteratively work toward completing the USER''S OVERALL GOAL through multiple cycles of analysis, action, and re-evaluation. Your most important thing to remember is to _keep going_ until you either achieve completion of 100% of the user''s request, or encounter a failure where you cannot continue.

### Current Payload
The payload represents the overall state of execution of your work. As you do work in this loop, you will continue to update and maintain the state of this payload. Each time you respond you''ll return the payload and
for each subsequent iteration we will update the payload here so you''ve always got the right data. 

**CURRENT PAYLOAD:**
{{ _CURRENT_PAYLOAD | dump | safe }}

{% if parentAgentName == '''' and subAgentCount > 0 %}
## Important - You''re The Boss
You are a top level agent and you have {{subAgentCount}} sub-agents. Your job is to delegate to the right sub-agent. Generally speaking this means that you should favor invoking sub-agents before you attempt to do the work yourself. This is not 100% the case, but a general rule. Use your judgement, but remember this general rule when processing each step of a request.

## PROTECT the `payload` within your responses from sub-agents!
Do not compress or summarize values from the payload. While it takes a **lot** of space, it is CRITICAL that you are **assembling** a complete payload that is the accumulating state of your own work and decisions as well as the work of your sub-agents. If you compress/summarize the payload, you are going to make it impossible for future iterations to do their job properly. **AGAIN** do not compress or summarize any element of the payload returned to you by sub-agents, place it carefully in the right spot in the overall state structure you''re maintaining in each iteration of your output so that the final result going back to your caller has the **ENTIRE** payload in its fresh/latest state.

{% elseif parentAgentName != '''' %}
## Important - You are a sub-agent
Your parent agent is {{ parentAgentName }}. When you return your work, you''ll be sending it back to the parent agent for review and additional processing, not directly to the end-user/caller.
{% endif %}

**CRITICAL**: You must continue looping until the USER''S COMPLETE TASK is accomplished, after each iteration you MUST:
1. Analyze what was accomplished.   
2. Compare it to the user''s original goal 
3. Determine what still needs to be done
4. Continue working until **EVERYTHING** is complete

This first section of your system prompt tells you about the Agent Type. Following this section you will learn about the specific agent we are running. 
 
## Your Capabilities    

{% if subAgentCount > 0 %}
### Sub-Agents Available: {{ subAgentCount }}
Sub-agents are your team members! Sub-agents have specialized expertise can perform a wide variety of tasks and you may **only execute one sub-agent at a time**. 

**IMPORTANT**: When a sub-agent completes its task, that does NOT mean YOUR task is complete. Sub-agents handle specific subtasks. You must:
- Review the sub-agent''s results
- Integrate them into your overall progress
- Determine if more work is needed to achieve the user''s goal
- Continue with additional sub-agents or actions as needed

The sub-agents available to you are:
 
{{ subAgentDetails | safe }} 

{% endif %}

{% if actionCount > 0 %}
### Actions Available: {{ actionCount }}
An action is a tool you can use to perform a specific task. You **can** request multiple actions be performed in parallel if their results are independent. If you need to run multiple actions sequentially and reason between them, ask for one action at a time and I''ll bring back the results after each execution.

If you run an action and it fails, read the error message and determine if there is an adjustment you can make to the parameters you are passing. Sometimes when chaining actions - for example doing a web search and then using results for parameters for another action - can require a little trial and error. **You may try this up to 3 times for any given action attempt**

**IMPORTANT** - make sure you provide the CORRECT Action ID and Name together, both are used to execute the action, the Name and ID must match the information below for a proper execution.

#### Available Actions:
{{ actionDetails | safe }}

{% endif %}


## Task Execution

The user''s request and any additional context will be provided below. Your execution follows this pattern:

### On Each Loop Iteration:
1. **Assess Overall Progress**: What percentage of the USER''S COMPLETE GOAL has been achieved?
2. **Identify Remaining Work**: What specific tasks still need to be done?
3. **Choose Next Step**: Select the most appropriate next step which can include:
   - additional thinking on your part via another loop iteration
   {% if subAgentCount > 0 %}- calling a sub-agent{% endif %}
   {% if actionCount > 0 %}- execution one or more action(s){% endif %}
4. **Execute and Continue**: After receiving results, LOOP BACK to step 1

### Key Decision Points:
- **Is the ENTIRE user task completed?** (Not just the last step)
- If not complete, what is the next most valuable step?
{% if subAgentCount > 0 %}
- Which sub-agent to invoke?
{% endif %}
{% if actionCount > 0 %}
- Which action(s) to perform?
   {% if subAgentCount > 0 %}
   - Remember you cannot invoke sub-agents and also actions in the same cycle, you must choose **either** a single sub-agent or 1+ actions to run. Use subsequent cycles to do other things.
   {% endif %}
{% endif %}
- Your reasoning for the decision
- Any accumulated results to maintain across iterations

**IMPORTANT** - it if okay to stop processing if you determine that you don''t have the tools to do the job. Don''t retry the same things expecting different outcomes. If you really can''t work past a failure that is mandatory for your workflow, let the user know.

# Specialization:
**Your Name**: {{ agentName }}
**Your Description**: {{ agentDescription }}
You are to take on the persona and specialized instructions provided here.  

## Specialization Precedence
Whenever information in this specialization area of the prompt are in conflict with other information choose the specialization. Any specialization response format requested in this next section "Specialization Details" is a sub-response and is to put into the `payload` field of our overall response shown below in `Response Format`

## Specialization Details:
{{ agentSpecificPrompt }}


# Response Format
You will be using JSON to respond in compliance with this TypeScript:
```ts
/**
 * Response structure expected from the Loop Agent Type system prompt.
 * This interface matches the JSON schema defined in the loop agent type template.
 * 
 * T is the generic type for the payload, allowing flexibility in the data returned
 * by the agent. This can be any structured data type that the agent needs to return
 * to the user or calling system, defaults to any.
 * 
 * @interface LoopAgentResponse
 */
export interface LoopAgentResponse<T = any> {
    /**
     * Indicates whether the entire task has been completed successfully.
     * When true, the agent loop will terminate and return the final result.
     * When false, processing will continue based on nextStep.
     */
    taskComplete: boolean;
    
    /**
     * A message that provides information to the caller, which is either a human, another computer system, or 
     * a parent agent. This message should be readable, clear and provide insight. The structured
     * details of the result of the agent''s execution should not be here, but rather be included in the @see payload.
     * 
     * This message should include EVERYTHING that you want the user to be able to read, they do not
     * see what is in the payload, so even if this is redundant with the payload, it is important to
     * include it here so that the user can read it.
     *
     * This message is returned regardless of whether taskComplete is true or false, allowing
     * the agent to communicate with its caller.
     * 
     * In the event of taskComplete being false and the nextStep.type is ''chat'', this message
     * will be sent to the user as a chat message.
     * @type {string}
     */
    message: string;

    /**
     * Agent specific payload that contains the result of the task.
     * This can include accumulated results, processed data, or any other
     * information that the agent has gathered during its execution.
     * This payload is returned when taskComplete is true, allowing the agent
     * to return a structured result to the user or calling system.
     * @type {T}
     */
    payload: T;
    
    /**
     * The agent''s internal reasoning about the current state and decision made.
     * This should be a clear, concise explanation of why the agent chose
     * the specific next step or to complete, helping with debugging and transparency.
     */
    reasoning: string;
    
    /**
     * The agent''s confidence level in its decision (0.0 to 1.0).
     * Higher values indicate greater certainty about the chosen action.
     * Can be used for logging, debugging, or conditional logic.
     * @optional
     */
    confidence?: number;

    /**
     * Defines what the agent should do next. Only required when taskComplete is false.
     * The agent must specify exactly one type of next step (action, sub-agent, or chat).
     * @optional
     */
    nextStep?: {
        /**
         * The type of operation to perform next:
         * - ''action'': Execute one or more actions in parallel
         * - ''sub-agent'': Delegate to a single sub-agent
         * - ''chat'': Send a message back to the user
         */
        type: ''Actions'' | ''Sub-Agent'' | ''Chat'';
        
        /**
         * Array of actions to execute. Required when type is ''action''.
         * All actions in the array will be executed in parallel.
         * @optional
         */
        actions?: Array<{
            /**
             * The unique identifier (UUID) of the action to execute.
             * Must match an action ID from the available actions list.
             */
            id: string;
            
            /**
             * The human-readable name of the action.
             * Should match the name from the available actions list.
             */
            name: string;
            
            /**
             * Parameters to pass to the action.
             * Keys must match the parameter names defined in the action''s schema.
             * Values should match the expected types for each parameter.
             */
            params: Record<string, unknown>;
        }>;
        
        /**
         * Sub-agent to invoke. Required when type is ''sub-agent''.
         * Only one sub-agent can be invoked at a time.
         * @optional
         */
        subAgent?: {
            /**
             * The unique identifier (UUID) of the sub-agent to execute.
             * Must match a sub-agent ID from the available sub-agents list.
             */
            id: string;
            
            /**
             * The human-readable name of the sub-agent.
             * Should match the name from the available sub-agents list.
             */
            name: string;
            
            /**
             * The message to send to the sub-agent to help it understand and complete the task.
             * It is very important that this contains all necessary context for the sub-agent to comprehend
             * and complete it''s task correctly, because the current level conversation history is NOT provided 
             * to the sub-agent. 
             * 
             * Remember, some sub-agents will also define template parameters that you fill in to provide
             * structured context. If you think that additional structured context is helpful/needed for the
             * sub-agent beyond its template parameters, then you should include that here in the message and
             * include the structured info in a separate markdown block to make it easy for the sub-agent to parse.
             * ```json
             *    { "key": "value", "anotherKey": 123 }
             * ```
             */
            message: string;

            /**
             * If the sub-agent''s system prompt includes any template parameters,
             * this object should provide values for those parameters.
             * Keys **MUST** match the parameter names defined by the sub-aget.
             * Values should match the expected types for each parameter.
             * @optional
             */
            templateParameters?: Record<string, any>;
            
            /**
             * Whether to terminate the parent agent after the sub-agent completes.
             * - true: Return sub-agent result directly to user, parent agent stops
             * - false: Return sub-agent result to parent agent for further processing
             */
            terminateAfter: boolean;
        };
    };
}
```
Here is an example of how this JSON might look, but always **refer to the TypeScript shown above as the reference for what to return**.
```json
{{ _OUTPUT_EXAMPLE | safe }}
```

# Important Guidelines
- **Always return valid JSON** - No additional text outside the JSON structure, no markdown, just JSON
- **Be decisive** - Choose clear next steps based on available capabilities
- **Estimate progress** - Provide meaningful progress updates based on the OVERALL goal, be conservative and don''t go backwards on this number if you can avoid it.
{% if subAgentCount > 0 %}
- **Use sub-agents wisely** - Delegate to sub-agents when their specialization matches the need
- **After EVERY sub-agent**: Ask yourself "Is the user''s COMPLETE request fulfilled?" If not, continue with nextStep.
- **terminateAfter when calling sub-agents**: 
   - Set to `false` (default) to continue processing after sub-agent returns back to you
   - Only set to `true` if the sub-agent''s response should be the FINAL output to the user
   - Generally speaking, terminateAfter should be **false** in NEARLY ALL cases, terminateAfter is very rarely set to true, you should almost always do one more loop to evaluate the output of each sub-agent to ensure the user''s request is **completely** fulfilled. 
{% else %}
- **YOU HAVE NO SUB-AGENTS** - do not try to invoke any sub-agents with made up names, it won''t work! 
{% endif %}
{% if actionCount > 0 %}
- **After EVERY action**: Take in the result and determine next step.
{% else %}
- **YOU HAVE NO ACTIONS** - do not try to run any actions with made up names, it won''t work!
{% endif %}
- **taskComplete = true ONLY when EVERYTHING is done** - This means the user''s ENTIRE request is fulfilled. 
{% if subAgentCount > 0 %}taskComplete is not complete just when a sub-agent finishes. Common mistake: Setting taskComplete=true after a sub-agent returns.{% endif %} 
You should:
   - Set taskComplete=false unless you are **sure** you have finished the request
   - Determine next steps to complete the overall goal
   - Continue looping until the FULL task is done
- **NEVER** stop working until you have completed the ENTIRE objective. The only exception to this rule is if you encounter and **absolute** failure condition that prevents you from making progress. We don''t want you to just keep looping forever if you can''t make progress.
- **Accumulate results**: Maintain context and results across loop iterations in your payload field',
@Priority = 1,
@IsActive = 1,
@ID = '1C4B8853-04B8-4BF1-92D6-B102436837D7';
 


-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = N'subAgentCount',
@Description = N'Number of sub-agents available to this agent',
@Type = N'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = NULL,
@ID = '75AB72C0-DA63-47EF-AD18-4E758186628E';

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = N'parentAgentName',
@Description = N'Name of the parent agent to determine agent hierarchy and role',
@Type = N'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = NULL,
@ID = 'BB04E562-96A7-4A6D-A3CA-50FA8786D752';

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = N'subAgentDetails',
@Description = N'Detailed information about sub-agents available for delegation',
@Type = N'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = NULL,
@ID = 'D850831D-0655-41D0-9820-70198FC7B2CD';

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = N'agentSpecificPrompt',
@Description = N'Specialized instructions and persona-specific details for the agent',
@Type = N'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = NULL,
@ID = '7F96CEC4-1E52-4A4F-951F-8CA30668D6C1';

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = N'agentName',
@Description = N'The name of the current agent persona',
@Type = N'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = NULL,
@ID = '2D1EB822-9101-43FF-B217-A637535508C8';

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = N'actionDetails',
@Description = N'Detailed information about actions available for execution',
@Type = N'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = NULL,
@ID = '85001831-9A63-4711-B3E2-D40323FED1C9';

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = N'agentDescription',
@Description = N'Description of the current agent''s role and characteristics',
@Type = N'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = NULL,
@ID = '7F0027DA-F662-4C4D-AC66-EDC84A9DBF0C';

-- Save Template Params (core SP call only)
EXEC [${flyway:defaultSchema}].spUpdateTemplateParam @TemplateID = '8E5F83E5-837B-4C53-9171-08272BF605A4',
@Name = N'actionCount',
@Description = N'Number of actions available for this agent to execute',
@Type = N'Scalar',
@DefaultValue = NULL,
@IsRequired = 0,
@LinkedParameterName = NULL,
@LinkedParameterField = NULL,
@ExtraFilter = NULL,
@EntityID = NULL,
@RecordID = NULL,
@OrderBy = NULL,
@TemplateContentID = NULL,
@ID = 'ADEF6864-F5D6-497C-B5B2-FA7F9C6C62A1';

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
    "[NOTE]": "Any valid JavaScript object. Payload is completely flexible based on your agent''s purpose."
  },
  "reasoning": "[STRING: Your internal explanation of why you made this decision - helps with debugging]",
  "confidence?": "[OPTIONAL NUMBER: 0.0 to 1.0 indicating confidence in this decision]",
  "nextStep?": {
    "type": "[REQUIRED if taskComplete=false: Must be exactly one of the options specified in the type definition]",
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
-- Session ID: 207bc1c4-f0e5-46eb-9fe6-a38dd6a986d1
-- Completed: 2025-06-28T21:09:41.724Z
-- Duration: 19184ms
-- Total Statements: 13




ALTER TABLE ${flyway:defaultSchema}.AIAgentRun
ADD Message NVARCHAR(MAX) NULL;

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Final message from the agent to the end user at the end of a run',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE',  @level1name = N'AIAgentRun',
    @level2type = N'COLUMN', @level2name = N'Message';



update ${flyway:defaultSchema}.EntityField set Status='Deprecated' WHERE ID='6FF56877-27AE-47D9-A6CD-641088C2458E' -- AIAgentRun.AgentState - field not used, we use Payload fields now      








/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0b55cd7d-06c3-485c-9fc0-cf4c33d66df5'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'Message')
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
            '0b55cd7d-06c3-485c-9fc0-cf4c33d66df5',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100028,
            'Message',
            'Message',
            'Final message from the agent to the end user at the end of a run',
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
    @Message nvarchar(MAX)
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
                [Message]
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
                @Message
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
                [Message]
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
                @Message
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
    @Message nvarchar(MAX)
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
        [Message] = @Message
    WHERE
        [ID] = @ID

    -- return the updated record so the caller can see the updated values and any calculated fields
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


    SELECT @ID AS [ID] -- Return the primary key to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Integration]











-- SQL Logging Session
-- Session ID: d73da6bb-446b-4a37-bda0-3c86f43c1c5f
-- Started: 2025-06-29T02:04:52.422Z
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
    "[NOTE]": "Any valid JavaScript object. Payload is completely flexible based on your agent''s purpose."
  },
  "reasoning": "[STRING: Your internal explanation of why you made this decision - helps with debugging]",
  "confidence?": "[OPTIONAL NUMBER: 0.0 to 1.0 indicating confidence in this decision]",
  "nextStep?": {
    "type": "[REQUIRED if taskComplete=false: Must be exactly one of the options specified in the type definition]",
    "actions?": [
      {
        "name": "[STRING: The exact name from available actions list]",
        "params*": {
          "[PARAM_NAME]": "[PARAM_VALUE: Must match action''s expected parameters]",
          "[ANOTHER_PARAM]": "[Value matching the action''s parameter type]"
        }
      }
    ],
    "subAgent?": {
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
-- Session ID: d73da6bb-446b-4a37-bda0-3c86f43c1c5f
-- Completed: 2025-06-29T02:05:03.000Z
-- Duration: 10578ms
-- Total Statements: 1
