-- Add Min/Max execution limits to AIAgentAction table
ALTER TABLE ${flyway:defaultSchema}.[AIAgentAction]
ADD MinExecutionsPerRun INT NULL,
    MaxExecutionsPerRun INT NULL;
GO

-- Add check constraint to ensure MinExecutionsPerRun is not negative
ALTER TABLE ${flyway:defaultSchema}.[AIAgentAction]
ADD CONSTRAINT CK_AIAgentAction_MinExecutionsPerRun_NonNegative 
CHECK (MinExecutionsPerRun IS NULL OR MinExecutionsPerRun >= 0);
GO

-- Add check constraint to ensure MaxExecutionsPerRun is positive
ALTER TABLE ${flyway:defaultSchema}.[AIAgentAction]
ADD CONSTRAINT CK_AIAgentAction_MaxExecutionsPerRun_Positive 
CHECK (MaxExecutionsPerRun IS NULL OR MaxExecutionsPerRun > 0);
GO

-- Add check constraint to ensure Min <= Max when both are specified
ALTER TABLE ${flyway:defaultSchema}.[AIAgentAction]
ADD CONSTRAINT CK_AIAgentAction_MinLessThanOrEqualMax 
CHECK (MinExecutionsPerRun IS NULL OR MaxExecutionsPerRun IS NULL OR MinExecutionsPerRun <= MaxExecutionsPerRun);
GO

-- Add descriptions for AIAgentAction fields
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Minimum number of times this action must be executed per agent run',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIAgentAction',
    @level2type = N'COLUMN', @level2name = 'MinExecutionsPerRun';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'Maximum number of times this action can be executed per agent run',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIAgentAction',
    @level2type = N'COLUMN', @level2name = 'MaxExecutionsPerRun';
GO

-- Add Min/Max execution limits to AIAgent table (for sub-agent usage)
ALTER TABLE ${flyway:defaultSchema}.[AIAgent]
ADD MinExecutionsPerRun INT NULL,
    MaxExecutionsPerRun INT NULL;
GO

-- Add check constraint to ensure MinExecutionsPerRun is not negative
ALTER TABLE ${flyway:defaultSchema}.[AIAgent]
ADD CONSTRAINT CK_AIAgent_MinExecutionsPerRun_NonNegative 
CHECK (MinExecutionsPerRun IS NULL OR MinExecutionsPerRun >= 0);
GO

-- Add check constraint to ensure MaxExecutionsPerRun is positive
ALTER TABLE ${flyway:defaultSchema}.[AIAgent]
ADD CONSTRAINT CK_AIAgent_MaxExecutionsPerRun_Positive 
CHECK (MaxExecutionsPerRun IS NULL OR MaxExecutionsPerRun > 0);
GO

-- Add check constraint to ensure Min <= Max when both are specified
ALTER TABLE ${flyway:defaultSchema}.[AIAgent]
ADD CONSTRAINT CK_AIAgent_MinLessThanOrEqualMax 
CHECK (MinExecutionsPerRun IS NULL OR MaxExecutionsPerRun IS NULL OR MinExecutionsPerRun <= MaxExecutionsPerRun);
GO

-- Add descriptions for AIAgent fields
EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'When acting as a sub-agent, minimum number of times this agent must be executed per parent agent run',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'MinExecutionsPerRun';
GO

EXEC sp_addextendedproperty 
    @name = N'MS_Description',
    @value = N'When acting as a sub-agent, maximum number of times this agent can be executed per parent agent run',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'MaxExecutionsPerRun';
GO


/****** CODEGEN RUN *******/


/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bccca2dc-8a15-4701-98e2-337fb60b463a'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'MinExecutionsPerRun')
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
            'bccca2dc-8a15-4701-98e2-337fb60b463a',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100032,
            'MinExecutionsPerRun',
            'Min Executions Per Run',
            'When acting as a sub-agent, minimum number of times this agent must be executed per parent agent run',
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
         WHERE ID = 'f0cca759-dea4-4f61-b233-c632ee9317e1'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'MaxExecutionsPerRun')
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
            'f0cca759-dea4-4f61-b233-c632ee9317e1',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100033,
            'MaxExecutionsPerRun',
            'Max Executions Per Run',
            'When acting as a sub-agent, maximum number of times this agent can be executed per parent agent run',
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
         WHERE ID = '5a770457-277e-45d0-9898-080f0d20e28e'  OR 
               (EntityID = '196B0316-6078-47A4-94B9-44A2FC5E8A55' AND Name = 'MinExecutionsPerRun')
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
            '5a770457-277e-45d0-9898-080f0d20e28e',
            '196B0316-6078-47A4-94B9-44A2FC5E8A55', -- Entity: AI Agent Actions
            100007,
            'MinExecutionsPerRun',
            'Min Executions Per Run',
            'Minimum number of times this action must be executed per agent run',
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
         WHERE ID = '272bc74b-f298-448e-857b-a4707e7bf457'  OR 
               (EntityID = '196B0316-6078-47A4-94B9-44A2FC5E8A55' AND Name = 'MaxExecutionsPerRun')
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
            '272bc74b-f298-448e-857b-a4707e7bf457',
            '196B0316-6078-47A4-94B9-44A2FC5E8A55', -- Entity: AI Agent Actions
            100008,
            'MaxExecutionsPerRun',
            'Max Executions Per Run',
            'Maximum number of times this action can be executed per agent run',
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
    @MaxExecutionsPerRun int
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
                [MaxExecutionsPerRun]
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
                @MaxTimePerRun,
                @MinExecutionsPerRun,
                @MaxExecutionsPerRun
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
                [MaxExecutionsPerRun]
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
                @MaxTimePerRun,
                @MinExecutionsPerRun,
                @MaxExecutionsPerRun
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
    @MaxTimePerRun int,
    @MinExecutionsPerRun int,
    @MaxExecutionsPerRun int
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
        [MaxExecutionsPerRun] = @MaxExecutionsPerRun
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



/* Index for Foreign Keys for AIAgentAction */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Actions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentAction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentAction_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentAction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentAction_AgentID ON [${flyway:defaultSchema}].[AIAgentAction] ([AgentID]);

-- Index for foreign key ActionID in table AIAgentAction
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentAction_ActionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentAction]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentAction_ActionID ON [${flyway:defaultSchema}].[AIAgentAction] ([ActionID]);

/* Base View SQL for AI Agent Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Actions
-- Item: vwAIAgentActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      AI Agent Actions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentAction
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentActions]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentActions]
AS
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    Action_ActionID.[Name] AS [Action]
FROM
    [${flyway:defaultSchema}].[AIAgentAction] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Action] AS Action_ActionID
  ON
    [a].[ActionID] = Action_ActionID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentActions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for AI Agent Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Actions
-- Item: Permissions for vwAIAgentActions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentActions] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for AI Agent Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Actions
-- Item: spCreateAIAgentAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentAction
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentAction]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentAction]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Status nvarchar(15),
    @MinExecutionsPerRun int,
    @MaxExecutionsPerRun int
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentAction]
            (
                [ID],
                [AgentID],
                [ActionID],
                [Status],
                [MinExecutionsPerRun],
                [MaxExecutionsPerRun]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @ActionID,
                @Status,
                @MinExecutionsPerRun,
                @MaxExecutionsPerRun
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentAction]
            (
                [AgentID],
                [ActionID],
                [Status],
                [MinExecutionsPerRun],
                [MaxExecutionsPerRun]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @ActionID,
                @Status,
                @MinExecutionsPerRun,
                @MaxExecutionsPerRun
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentActions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentAction] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for AI Agent Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentAction] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for AI Agent Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Actions
-- Item: spUpdateAIAgentAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentAction
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentAction]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentAction]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ActionID uniqueidentifier,
    @Status nvarchar(15),
    @MinExecutionsPerRun int,
    @MaxExecutionsPerRun int
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentAction]
    SET
        [AgentID] = @AgentID,
        [ActionID] = @ActionID,
        [Status] = @Status,
        [MinExecutionsPerRun] = @MinExecutionsPerRun,
        [MaxExecutionsPerRun] = @MaxExecutionsPerRun
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentActions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentActions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentAction] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentAction table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentAction
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentAction
ON [${flyway:defaultSchema}].[AIAgentAction]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentAction]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentAction] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for AI Agent Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentAction] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for AI Agent Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: AI Agent Actions
-- Item: spDeleteAIAgentAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentAction
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentAction]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentAction]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentAction]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentAction] TO [cdp_Integration]
    

/* spDelete Permissions for AI Agent Actions */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentAction] TO [cdp_Integration]



-- CHECK constraint for AI Agent Actions: Field: MaxExecutionsPerRun was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([MaxExecutionsPerRun] IS NULL OR [MaxExecutionsPerRun]>(0))', 'public ValidateMaxExecutionsPerRunGreaterThanZero(result: ValidationResult) {
	if (this.MaxExecutionsPerRun !== null && this.MaxExecutionsPerRun <= 0) {
		result.Errors.push(new ValidationErrorInfo("MaxExecutionsPerRun", "If a maximum executions per run is specified, it must be greater than zero.", this.MaxExecutionsPerRun, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if a value for the maximum number of executions per run is provided, it must be greater than zero. If no value is provided, that''s acceptable.', 'ValidateMaxExecutionsPerRunGreaterThanZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '272BC74B-F298-448E-857B-A4707E7BF457');
  
            -- CHECK constraint for AI Agent Actions @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([MinExecutionsPerRun] IS NULL OR [MaxExecutionsPerRun] IS NULL OR [MinExecutionsPerRun]<=[MaxExecutionsPerRun])', 'public ValidateMinExecutionsPerRunLessThanOrEqualToMax(result: ValidationResult) {
	if (
		this.MinExecutionsPerRun !== null &&
		this.MaxExecutionsPerRun !== null &&
		this.MinExecutionsPerRun > this.MaxExecutionsPerRun
	) {
		result.Errors.push(new ValidationErrorInfo("MinExecutionsPerRun", "The minimum executions per run cannot be greater than the maximum executions per run.", this.MinExecutionsPerRun, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the minimum number of executions per run cannot be greater than the maximum number of executions per run. If either value is not specified, the rule is considered satisfied.', 'ValidateMinExecutionsPerRunLessThanOrEqualToMax', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', '196B0316-6078-47A4-94B9-44A2FC5E8A55');
  
            -- CHECK constraint for AI Agent Actions: Field: MinExecutionsPerRun was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([MinExecutionsPerRun] IS NULL OR [MinExecutionsPerRun]>=(0))', 'public ValidateMinExecutionsPerRunIsNonNegative(result: ValidationResult) {
	if (this.MinExecutionsPerRun !== null && this.MinExecutionsPerRun < 0) {
		result.Errors.push(new ValidationErrorInfo("MinExecutionsPerRun", "Minimum executions per run must be zero or greater.", this.MinExecutionsPerRun, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if a value for ''Minimum Executions Per Run'' is provided, it must be zero or greater. If the value is not provided (left blank), that''s also allowed.', 'ValidateMinExecutionsPerRunIsNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '5A770457-277E-45D0-9898-080F0D20E28E');
  
            

-- CHECK constraint for AI Agents: Field: MinExecutionsPerRun was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([MinExecutionsPerRun] IS NULL OR [MinExecutionsPerRun]>=(0))', 'public ValidateMinExecutionsPerRunIsNonNegative(result: ValidationResult) {
	if (this.MinExecutionsPerRun !== null && this.MinExecutionsPerRun < 0) {
		result.Errors.push(new ValidationErrorInfo("MinExecutionsPerRun", "If specified, the minimum executions per run must be zero or greater.", this.MinExecutionsPerRun, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if the minimum executions per run value is provided, it must be zero or greater.', 'ValidateMinExecutionsPerRunIsNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'BCCCA2DC-8A15-4701-98E2-337FB60B463A');
  
            -- CHECK constraint for AI Agents @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([MinExecutionsPerRun] IS NULL OR [MaxExecutionsPerRun] IS NULL OR [MinExecutionsPerRun]<=[MaxExecutionsPerRun])', 'public ValidateMinExecutionsPerRunLessThanOrEqualToMaxExecutionsPerRun(result: ValidationResult) {
	if (this.MinExecutionsPerRun !== null && this.MaxExecutionsPerRun !== null && this.MinExecutionsPerRun > this.MaxExecutionsPerRun) {
		result.Errors.push(new ValidationErrorInfo("MinExecutionsPerRun", "Minimum executions per run cannot be greater than maximum executions per run.", this.MinExecutionsPerRun, ValidationErrorType.Failure));
	}
}', 'This rule ensures that if both ''Minimum Executions Per Run'' and ''Maximum Executions Per Run'' are specified, the minimum must not be greater than the maximum. If either field is not specified, this rule does not apply.', 'ValidateMinExecutionsPerRunLessThanOrEqualToMaxExecutionsPerRun', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1');
  
            -- CHECK constraint for AI Agents: Field: MaxExecutionsPerRun was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([MaxExecutionsPerRun] IS NULL OR [MaxExecutionsPerRun]>(0))', 'public ValidateMaxExecutionsPerRunIsNullOrPositive(result: ValidationResult) {
	if (this.MaxExecutionsPerRun !== null && this.MaxExecutionsPerRun <= 0) {
		result.Errors.push(new ValidationErrorInfo("MaxExecutionsPerRun", "MaxExecutionsPerRun must be left blank or must be greater than zero.", this.MaxExecutionsPerRun, ValidationErrorType.Failure));
	}
}', 'This rule ensures that the maximum number of executions per run can either be left blank (unspecified) or, if provided, it must be a positive number greater than zero.', 'ValidateMaxExecutionsPerRunIsNullOrPositive', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'F0CCA759-DEA4-4F61-B233-C632EE9317E1');
  
            

