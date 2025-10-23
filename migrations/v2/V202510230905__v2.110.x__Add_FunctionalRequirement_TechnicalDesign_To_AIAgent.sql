-- Add FunctionalRequirement and TechnicalDesign columns to AIAgent table
-- These store markdown-formatted requirements and design docs for agents
-- v2.110.x - Agent Manager payload restructuring

ALTER TABLE ${flyway:defaultSchema}.AIAgent
ADD FunctionalRequirement NVARCHAR(MAX) NULL,
    TechnicalDesign NVARCHAR(MAX) NULL;

-- Add extended properties (descriptions)
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed markdown formatted requirements that explain the business goals of the agent without specific technical implementation details.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'FunctionalRequirement';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed markdown that explains the structure of the agent including agent architecture, actions, sub-agents, prompts, and payload structure.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'TechnicalDesign';












-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2842ec8b-2f3a-478a-9f16-e1b58bbc41bc'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'FunctionalRequirement')
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
            '2842ec8b-2f3a-478a-9f16-e1b58bbc41bc',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100089,
            'FunctionalRequirement',
            'Functional Requirement',
            'Detailed markdown formatted requirements that explain the business goals of the agent without specific technical implementation details.',
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
         WHERE ID = '54ca0ce7-fe81-4fb0-8d6a-70d27882be9e'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'TechnicalDesign')
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
            '54ca0ce7-fe81-4fb0-8d6a-70d27882be9e',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100090,
            'TechnicalDesign',
            'Technical Design',
            'Detailed markdown that explains the structure of the agent including agent architecture, actions, sub-agents, prompts, and payload structure.',
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
    @Status nvarchar(20),
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
    @FunctionalRequirement nvarchar(MAX),
    @TechnicalDesign nvarchar(MAX)
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
                [FunctionalRequirement],
                [TechnicalDesign]
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
                @Status,
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
                @FunctionalRequirement,
                @TechnicalDesign
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
                [FunctionalRequirement],
                [TechnicalDesign]
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
                @Status,
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
                @FunctionalRequirement,
                @TechnicalDesign
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
    @FunctionalRequirement nvarchar(MAX),
    @TechnicalDesign nvarchar(MAX)
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
        [FunctionalRequirement] = @FunctionalRequirement,
        [TechnicalDesign] = @TechnicalDesign
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



/* SQL text to update entity field related entity name field map for entity field ID A10D443E-F36B-1410-8488-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A10D443E-F36B-1410-8488-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID CB0D443E-F36B-1410-8488-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CB0D443E-F36B-1410-8488-00E2629BC298',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 4D0D443E-F36B-1410-8488-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4D0D443E-F36B-1410-8488-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID CC0B443E-F36B-1410-8488-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CC0B443E-F36B-1410-8488-00E2629BC298',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 3C0C443E-F36B-1410-8488-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3C0C443E-F36B-1410-8488-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 620D443E-F36B-1410-8488-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='620D443E-F36B-1410-8488-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 690D443E-F36B-1410-8488-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='690D443E-F36B-1410-8488-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 700D443E-F36B-1410-8488-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='700D443E-F36B-1410-8488-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 0B0C443E-F36B-1410-8488-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0B0C443E-F36B-1410-8488-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID CF0C443E-F36B-1410-8488-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CF0C443E-F36B-1410-8488-00E2629BC298',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 120C443E-F36B-1410-8488-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='120C443E-F36B-1410-8488-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 190C443E-F36B-1410-8488-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='190C443E-F36B-1410-8488-00E2629BC298',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 890E443E-F36B-1410-8488-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='890E443E-F36B-1410-8488-00E2629BC298',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 460E443E-F36B-1410-8488-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='460E443E-F36B-1410-8488-00E2629BC298',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 520E443E-F36B-1410-8488-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='520E443E-F36B-1410-8488-00E2629BC298',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 8A0E443E-F36B-1410-8488-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8A0E443E-F36B-1410-8488-00E2629BC298',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 550E443E-F36B-1410-8488-00E2629BC298 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='550E443E-F36B-1410-8488-00E2629BC298',
         @RelatedEntityNameFieldMap='User'

