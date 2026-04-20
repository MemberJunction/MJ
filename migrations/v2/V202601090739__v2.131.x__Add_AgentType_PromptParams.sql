-- Migration: Add PromptParamsSchema to AIAgentType and AgentTypePromptParams to AIAgent
-- Description: Enables per-agent customization of which system prompt sections to include,
--              allowing significant token savings for agents that don't need all capabilities.

---------------------------------------------------------------
-- SECTION 1: DDL Operations - Add new columns
---------------------------------------------------------------

-- Add PromptParamsSchema to AIAgentType
-- This column stores the JSON Schema defining available parameters for agents of this type
ALTER TABLE ${flyway:defaultSchema}.AIAgentType
ADD PromptParamsSchema NVARCHAR(MAX) NULL;

-- Add AgentTypePromptParams to AIAgent
-- This column stores the JSON values that customize prompt rendering for this specific agent
ALTER TABLE ${flyway:defaultSchema}.AIAgent
ADD AgentTypePromptParams NVARCHAR(MAX) NULL;

GO
---------------------------------------------------------------
-- SECTION 2: Extended Properties - Column descriptions
---------------------------------------------------------------

-- Add description for AIAgentType.PromptParamsSchema
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON Schema defining the available prompt parameters for this agent type. Includes property definitions with types, defaults, and descriptions. Used by agents of this type to customize which prompt sections are included in the system prompt. The schema follows JSON Schema draft-07 format.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIAgentType',
    @level2type = N'COLUMN', @level2name = 'PromptParamsSchema';

-- Add description for AIAgent.AgentTypePromptParams
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON object containing parameter values that customize how this agent''s type-level system prompt is rendered. The schema is defined by the agent type''s PromptParamsSchema field. Allows per-agent control over which prompt sections are included, enabling token savings by excluding unused documentation.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'AIAgent',
    @level2type = N'COLUMN', @level2name = 'AgentTypePromptParams';


 






































































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'fd515bf1-7e8a-4cb0-a8ce-d5c0c8c132d7'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'AgentTypePromptParams')
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
            'fd515bf1-7e8a-4cb0-a8ce-d5c0c8c132d7',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100118,
            'AgentTypePromptParams',
            'Agent Type Prompt Params',
            'JSON object containing parameter values that customize how this agent''s type-level system prompt is rendered. The schema is defined by the agent type''s PromptParamsSchema field. Allows per-agent control over which prompt sections are included, enabling token savings by excluding unused documentation.',
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
         WHERE ID = '41da3898-26c0-4ae9-b934-84ea97c726b7'  OR 
               (EntityID = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND Name = 'PromptParamsSchema')
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
            '41da3898-26c0-4ae9-b934-84ea97c726b7',
            '65CDC348-C4A6-4D00-A57B-2D489C56F128', -- Entity: MJ: AI Agent Types
            100026,
            'PromptParamsSchema',
            'Prompt Params Schema',
            'JSON Schema defining the available prompt parameters for this agent type. Includes property definitions with types, defaults, and descriptions. Used by agents of this type to customize which prompt sections are included in the system prompt. The schema follows JSON Schema draft-07 format.',
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

/* SQL text to update entity field related entity name field map for entity field ID 4138222C-82C1-49CE-9A8C-9E6ED72764ED */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4138222C-82C1-49CE-9A8C-9E6ED72764ED',
         @RelatedEntityNameFieldMap='LegislativeIssue'

/* SQL text to update entity field related entity name field map for entity field ID B98AA103-EACB-42F8-AB0F-3C0506817529 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B98AA103-EACB-42F8-AB0F-3C0506817529',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 773E643F-F529-47E8-90E6-F1C4C510DE8B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='773E643F-F529-47E8-90E6-F1C4C510DE8B',
         @RelatedEntityNameFieldMap='GovernmentContact'

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

-- Index for foreign key AttachmentStorageProviderID in table AIAgent
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgent_AttachmentStorageProviderID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgent]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgent_AttachmentStorageProviderID ON [${flyway:defaultSchema}].[AIAgent] ([AttachmentStorageProviderID]);

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
    FileStorageProvider_AttachmentStorageProviderID.[Name] AS [AttachmentStorageProvider],
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
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageProvider] AS FileStorageProvider_AttachmentStorageProviderID
  ON
    [a].[AttachmentStorageProviderID] = FileStorageProvider_AttachmentStorageProviderID.[ID]
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
    @MaxMessages int,
    @AttachmentStorageProviderID uniqueidentifier,
    @AttachmentRootPath nvarchar(500),
    @InlineStorageThresholdBytes int,
    @AgentTypePromptParams nvarchar(MAX)
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
                [MaxMessages],
                [AttachmentStorageProviderID],
                [AttachmentRootPath],
                [InlineStorageThresholdBytes],
                [AgentTypePromptParams]
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
                @MaxMessages,
                @AttachmentStorageProviderID,
                @AttachmentRootPath,
                @InlineStorageThresholdBytes,
                @AgentTypePromptParams
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
                [MaxMessages],
                [AttachmentStorageProviderID],
                [AttachmentRootPath],
                [InlineStorageThresholdBytes],
                [AgentTypePromptParams]
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
                @MaxMessages,
                @AttachmentStorageProviderID,
                @AttachmentRootPath,
                @InlineStorageThresholdBytes,
                @AgentTypePromptParams
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
    @MaxMessages int,
    @AttachmentStorageProviderID uniqueidentifier,
    @AttachmentRootPath nvarchar(500),
    @InlineStorageThresholdBytes int,
    @AgentTypePromptParams nvarchar(MAX)
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
        [MaxMessages] = @MaxMessages,
        [AttachmentStorageProviderID] = @AttachmentStorageProviderID,
        [AttachmentRootPath] = @AttachmentRootPath,
        [InlineStorageThresholdBytes] = @InlineStorageThresholdBytes,
        [AgentTypePromptParams] = @AgentTypePromptParams
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



/* SQL text to update entity field related entity name field map for entity field ID 649A3483-4C38-4D0A-A4E8-E18582AF1C4C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='649A3483-4C38-4D0A-A4E8-E18582AF1C4C',
         @RelatedEntityNameFieldMap='BoardPosition'

/* SQL text to update entity field related entity name field map for entity field ID 217230F4-5F0F-4D58-BB37-67C83779E529 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='217230F4-5F0F-4D58-BB37-67C83779E529',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 48EF505E-A3C3-4B16-A98D-84A77E936981 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='48EF505E-A3C3-4B16-A98D-84A77E936981',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 74E581A8-C02B-48E6-BE54-1250E582B11A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='74E581A8-C02B-48E6-BE54-1250E582B11A',
         @RelatedEntityNameFieldMap='Enrollment'

/* SQL text to update entity field related entity name field map for entity field ID 78C443B3-F183-46C8-A8DE-039E5F5971E5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='78C443B3-F183-46C8-A8DE-039E5F5971E5',
         @RelatedEntityNameFieldMap='Certification'

/* SQL text to update entity field related entity name field map for entity field ID D7AD4275-B5BB-4D26-8133-C9829BA1CFC3 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D7AD4275-B5BB-4D26-8133-C9829BA1CFC3',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 9080E8F4-72E2-4E1D-AE91-D2FF51D27A21 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9080E8F4-72E2-4E1D-AE91-D2FF51D27A21',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 366693D8-CB69-41A9-9784-264A7F733FC0 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='366693D8-CB69-41A9-9784-264A7F733FC0',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 7968D5EA-97B2-47C7-A23E-B2232E17553A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7968D5EA-97B2-47C7-A23E-B2232E17553A',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 41281F63-DC75-45C2-922A-FA75C6407DC5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='41281F63-DC75-45C2-922A-FA75C6407DC5',
         @RelatedEntityNameFieldMap='ChairMember'

/* SQL text to update entity field related entity name field map for entity field ID 689D03AE-D03F-42E9-A9C1-23D8130910FC */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='689D03AE-D03F-42E9-A9C1-23D8130910FC',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID BCDD94AC-99B2-47B0-996D-7B260772B30D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BCDD94AC-99B2-47B0-996D-7B260772B30D',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID EB060277-79E0-4E76-9F86-FCCA82A940A6 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='EB060277-79E0-4E76-9F86-FCCA82A940A6',
         @RelatedEntityNameFieldMap='Certification'

/* SQL text to update entity field related entity name field map for entity field ID 428248B6-BA7C-49D6-9148-29EB9E0D763F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='428248B6-BA7C-49D6-9148-29EB9E0D763F',
         @RelatedEntityNameFieldMap='PrerequisiteCourse'

/* SQL text to update entity field related entity name field map for entity field ID F8D1BF57-A9BA-4120-BCFD-3BA863DA0A6F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F8D1BF57-A9BA-4120-BCFD-3BA863DA0A6F',
         @RelatedEntityNameFieldMap='EmailSend'

/* SQL text to update entity field related entity name field map for entity field ID FFA3DFE5-52FA-4859-A4DE-107D639F7316 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='FFA3DFE5-52FA-4859-A4DE-107D639F7316',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID D518FAC3-839D-4B30-8B35-BB821ABFA275 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D518FAC3-839D-4B30-8B35-BB821ABFA275',
         @RelatedEntityNameFieldMap='Course'

/* SQL text to update entity field related entity name field map for entity field ID CF661C5D-B922-43D3-9331-AA230BD5BFE7 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='CF661C5D-B922-43D3-9331-AA230BD5BFE7',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 8DCF4904-B5A8-480B-A905-2BC88D445AAE */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8DCF4904-B5A8-480B-A905-2BC88D445AAE',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 466F5C4A-2B35-466D-9AD8-9E4B1F0E527F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='466F5C4A-2B35-466D-9AD8-9E4B1F0E527F',
         @RelatedEntityNameFieldMap='LastPostAuthor'

/* SQL text to update entity field related entity name field map for entity field ID 1A282F35-5073-481C-9EDE-2EAFA1981C98 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1A282F35-5073-481C-9EDE-2EAFA1981C98',
         @RelatedEntityNameFieldMap='Post'

/* SQL text to update entity field related entity name field map for entity field ID DE95369E-CA11-449D-A8CC-03CDB071FF19 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DE95369E-CA11-449D-A8CC-03CDB071FF19',
         @RelatedEntityNameFieldMap='ReportedBy'

/* SQL text to update entity field related entity name field map for entity field ID DB9DCAEF-3474-4A97-9C76-D7F6A7C5077D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DB9DCAEF-3474-4A97-9C76-D7F6A7C5077D',
         @RelatedEntityNameFieldMap='ModeratedBy'

/* SQL text to update entity field related entity name field map for entity field ID 899EFD1C-3786-4EB5-A07E-947DE8A8768F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='899EFD1C-3786-4EB5-A07E-947DE8A8768F',
         @RelatedEntityNameFieldMap='Thread'

/* SQL text to update entity field related entity name field map for entity field ID 7B05794B-697B-4FE2-948A-3BF888A53514 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7B05794B-697B-4FE2-948A-3BF888A53514',
         @RelatedEntityNameFieldMap='Author'

/* SQL text to update entity field related entity name field map for entity field ID 0BEBC1D8-B0B1-4C15-8412-D24CD5D9B52D */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0BEBC1D8-B0B1-4C15-8412-D24CD5D9B52D',
         @RelatedEntityNameFieldMap='ParentPost'

/* SQL text to update entity field related entity name field map for entity field ID 74D9B1CC-870D-4FC0-8406-F579F041EB6F */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='74D9B1CC-870D-4FC0-8406-F579F041EB6F',
         @RelatedEntityNameFieldMap='LastReplyAuthor'

/* SQL text to update entity field related entity name field map for entity field ID C5AC51F6-5D0C-4A17-9DD9-DCD128CF06E1 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C5AC51F6-5D0C-4A17-9DD9-DCD128CF06E1',
         @RelatedEntityNameFieldMap='Author'

/* SQL text to update entity field related entity name field map for entity field ID 07736FFB-BC0C-4E88-9B6A-ACEB66C43DB3 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='07736FFB-BC0C-4E88-9B6A-ACEB66C43DB3',
         @RelatedEntityNameFieldMap='EditedBy'

/* SQL text to update entity field related entity name field map for entity field ID F88BC2AD-7E71-4B09-800B-E2CE54ED133C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='F88BC2AD-7E71-4B09-800B-E2CE54ED133C',
         @RelatedEntityNameFieldMap='Invoice'

/* SQL text to update entity field related entity name field map for entity field ID 261E2A98-D5FC-49B2-B07B-873E12852629 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='261E2A98-D5FC-49B2-B07B-873E12852629',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 5A54CBA5-5F92-4030-8C96-B4326B9B42B9 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5A54CBA5-5F92-4030-8C96-B4326B9B42B9',
         @RelatedEntityNameFieldMap='Follower'

/* SQL text to update entity field related entity name field map for entity field ID 9C83E253-6342-4C73-B92C-D288B9488B14 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='9C83E253-6342-4C73-B92C-D288B9488B14',
         @RelatedEntityNameFieldMap='Member'

/* Index for Foreign Keys for AIAgentType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key SystemPromptID in table AIAgentType
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentType_SystemPromptID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentType]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentType_SystemPromptID ON [${flyway:defaultSchema}].[AIAgentType] ([SystemPromptID]);

/* Base View SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: vwAIAgentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentType
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentTypes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentTypes]
AS
SELECT
    a.*,
    AIPrompt_SystemPromptID.[Name] AS [SystemPrompt]
FROM
    [${flyway:defaultSchema}].[AIAgentType] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS AIPrompt_SystemPromptID
  ON
    [a].[SystemPromptID] = AIPrompt_SystemPromptID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: Permissions for vwAIAgentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: spCreateAIAgentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @SystemPromptID uniqueidentifier,
    @IsActive bit = NULL,
    @AgentPromptPlaceholder nvarchar(255),
    @DriverClass nvarchar(255),
    @UIFormSectionKey nvarchar(500),
    @UIFormKey nvarchar(500),
    @UIFormSectionExpandedByDefault bit = NULL,
    @PromptParamsSchema nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentType]
            (
                [ID],
                [Name],
                [Description],
                [SystemPromptID],
                [IsActive],
                [AgentPromptPlaceholder],
                [DriverClass],
                [UIFormSectionKey],
                [UIFormKey],
                [UIFormSectionExpandedByDefault],
                [PromptParamsSchema]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @SystemPromptID,
                ISNULL(@IsActive, 1),
                @AgentPromptPlaceholder,
                @DriverClass,
                @UIFormSectionKey,
                @UIFormKey,
                ISNULL(@UIFormSectionExpandedByDefault, 1),
                @PromptParamsSchema
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentType]
            (
                [Name],
                [Description],
                [SystemPromptID],
                [IsActive],
                [AgentPromptPlaceholder],
                [DriverClass],
                [UIFormSectionKey],
                [UIFormKey],
                [UIFormSectionExpandedByDefault],
                [PromptParamsSchema]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @SystemPromptID,
                ISNULL(@IsActive, 1),
                @AgentPromptPlaceholder,
                @DriverClass,
                @UIFormSectionKey,
                @UIFormKey,
                ISNULL(@UIFormSectionExpandedByDefault, 1),
                @PromptParamsSchema
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: spUpdateAIAgentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @SystemPromptID uniqueidentifier,
    @IsActive bit,
    @AgentPromptPlaceholder nvarchar(255),
    @DriverClass nvarchar(255),
    @UIFormSectionKey nvarchar(500),
    @UIFormKey nvarchar(500),
    @UIFormSectionExpandedByDefault bit,
    @PromptParamsSchema nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [SystemPromptID] = @SystemPromptID,
        [IsActive] = @IsActive,
        [AgentPromptPlaceholder] = @AgentPromptPlaceholder,
        [DriverClass] = @DriverClass,
        [UIFormSectionKey] = @UIFormSectionKey,
        [UIFormKey] = @UIFormKey,
        [UIFormSectionExpandedByDefault] = @UIFormSectionExpandedByDefault,
        [PromptParamsSchema] = @PromptParamsSchema
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentType table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentType];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentType
ON [${flyway:defaultSchema}].[AIAgentType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: spDeleteAIAgentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentType
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentType] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 112628A1-BB02-45A1-BA26-ED678109CE69 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='112628A1-BB02-45A1-BA26-ED678109CE69',
         @RelatedEntityNameFieldMap='Invoice'

/* SQL text to update entity field related entity name field map for entity field ID 87754C3C-C1D9-4778-84CA-4973E8E897B1 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='87754C3C-C1D9-4778-84CA-4973E8E897B1',
         @RelatedEntityNameFieldMap='LegislativeIssue'

/* SQL text to update entity field related entity name field map for entity field ID 3B6F5927-D3E8-46D5-B854-E40B2A02D332 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3B6F5927-D3E8-46D5-B854-E40B2A02D332',
         @RelatedEntityNameFieldMap='Post'

/* SQL text to update entity field related entity name field map for entity field ID 54758C07-2B46-4DD5-8BDC-DEEC28ED6866 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='54758C07-2B46-4DD5-8BDC-DEEC28ED6866',
         @RelatedEntityNameFieldMap='Post'

/* SQL text to update entity field related entity name field map for entity field ID 3731FD89-8802-4BC0-82EF-891B9E89B274 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3731FD89-8802-4BC0-82EF-891B9E89B274',
         @RelatedEntityNameFieldMap='Post'

/* SQL text to update entity field related entity name field map for entity field ID A27ACAD7-C121-4B02-966D-653A4FB17F69 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A27ACAD7-C121-4B02-966D-653A4FB17F69',
         @RelatedEntityNameFieldMap='CompetitionEntry'

/* SQL text to update entity field related entity name field map for entity field ID 992D070D-5ECF-4770-B9C2-A38A5C296841 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='992D070D-5ECF-4770-B9C2-A38A5C296841',
         @RelatedEntityNameFieldMap='UploadedBy'

/* SQL text to update entity field related entity name field map for entity field ID 7EACDE22-77D2-4ABB-A14C-F66D937D0420 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7EACDE22-77D2-4ABB-A14C-F66D937D0420',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 0A7EF24C-BBF4-41D1-BE82-B9A93AD354A5 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0A7EF24C-BBF4-41D1-BE82-B9A93AD354A5',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID BD91D85A-2B59-4CB9-B03A-00B9ABDAA22C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='BD91D85A-2B59-4CB9-B03A-00B9ABDAA22C',
         @RelatedEntityNameFieldMap='LegislativeIssue'

/* SQL text to update entity field related entity name field map for entity field ID DBFBF308-F2E4-4AD4-B624-EEEB109AEE63 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='DBFBF308-F2E4-4AD4-B624-EEEB109AEE63',
         @RelatedEntityNameFieldMap='Resource'

/* SQL text to update entity field related entity name field map for entity field ID B444B45A-1952-44D9-9832-5D5D0C96694A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B444B45A-1952-44D9-9832-5D5D0C96694A',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 7ECB58BF-8ACF-4203-93E0-E7D777CE2A0C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='7ECB58BF-8ACF-4203-93E0-E7D777CE2A0C',
         @RelatedEntityNameFieldMap='Resource'

/* SQL text to update entity field related entity name field map for entity field ID 5E0B84F8-49DF-4276-B936-504BFD8F7DDE */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5E0B84F8-49DF-4276-B936-504BFD8F7DDE',
         @RelatedEntityNameFieldMap='Resource'

/* SQL text to update entity field related entity name field map for entity field ID C30F33B6-2077-4705-B71B-BA414B35FC35 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C30F33B6-2077-4705-B71B-BA414B35FC35',
         @RelatedEntityNameFieldMap='Resource'

/* SQL text to update entity field related entity name field map for entity field ID 6A9B74CA-D17E-4B70-AB78-E48A87A0ED7A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6A9B74CA-D17E-4B70-AB78-E48A87A0ED7A',
         @RelatedEntityNameFieldMap='CreatedBy'

/* SQL text to update entity field related entity name field map for entity field ID E8CAF904-77B6-4B25-AC92-9B4FD186B62C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E8CAF904-77B6-4B25-AC92-9B4FD186B62C',
         @RelatedEntityNameFieldMap='Member'

/* SQL text to update entity field related entity name field map for entity field ID 56761D65-33BC-48F0-B169-3FF1ABC1E074 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='56761D65-33BC-48F0-B169-3FF1ABC1E074',
         @RelatedEntityNameFieldMap='Author'

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '5C0C0D1C-4B14-417E-9280-B4545A8AF1EF'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '5C0C0D1C-4B14-417E-9280-B4545A8AF1EF'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '0C6E768F-C587-4538-BC48-C869854F3A18'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '980B9BE8-5C4E-45A4-BE62-32874A339AF6'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '5C0C0D1C-4B14-417E-9280-B4545A8AF1EF'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '0C6E768F-C587-4538-BC48-C869854F3A18'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 14 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Basic Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5BDF7CC2-8BB6-4B10-A69B-F5C4EF647FAF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Basic Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '5C0C0D1C-4B14-417E-9280-B4545A8AF1EF'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Basic Definition',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0C6E768F-C587-4538-BC48-C869854F3A18'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'System Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '24424A6A-C0E3-4DB0-9AF1-551D12AE7E10'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Prompt Placeholder',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '47FCBE6A-43EA-47FA-912B-ACB82A311471'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'System Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '200792E6-E7EC-4293-A821-77B42A49DAB5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Prompt Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Prompt Params Schema',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '41DA3898-26C0-4AE9-B934-84EA97C726B7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Behavior & UI Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Active',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '980B9BE8-5C4E-45A4-BE62-32874A339AF6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Behavior & UI Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Driver Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DB83502E-F00C-4CF8-AD0E-FFE9BF3C8904'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Behavior & UI Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'UI Form Section Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7763B64B-E410-4247-89DE-5E9E565F15A0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Behavior & UI Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'UI Form Key',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FAC68362-126A-4F7E-B706-8DD7B40897A1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Behavior & UI Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'UI Form Section Expanded By Default',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DA3D74E3-D1A2-4932-A1FB-4219F3BE1CC9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '7A190481-BB1D-4B6D-8EA1-E554E56B83B9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4AEB4F4F-664A-409A-AD4E-FD96800BF5FF'
   AND AutoUpdateCategory = 1

/* Insert FieldCategoryInfo setting for entity */

               INSERT INTO [${flyway:defaultSchema}].EntitySetting (ID, EntityID, Name, Value, __mj_CreatedAt, __mj_UpdatedAt)
               VALUES ('e3db2186-3df8-4502-adbb-6eeaf2e7b6ab', '65CDC348-C4A6-4D00-A57B-2D489C56F128', 'FieldCategoryInfo', '{"Basic Definition":{"icon":"fa fa-tag","description":""},"Prompt Configuration":{"icon":"fa fa-comment-dots","description":""},"Behavior & UI Settings":{"icon":"fa fa-sliders-h","description":""},"System Metadata":{"icon":"fa fa-cog","description":""}}', GETUTCDATE(), GETUTCDATE())
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Basic Definition":"fa fa-tag","Prompt Configuration":"fa fa-comment-dots","Behavior & UI Settings":"fa fa-sliders-h","System Metadata":"fa fa-cog"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND Name = 'FieldCategoryIcons'
            

/* Set field properties for entity */

            UPDATE [${flyway:defaultSchema}].EntityField
            SET IsNameField = 1
            WHERE ID = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA'
            AND AutoUpdateIsNameField = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529'
            AND AutoUpdateDefaultInView = 1
         

            UPDATE [${flyway:defaultSchema}].EntityField
            SET DefaultInView = 1
            WHERE ID = 'B098B41F-7953-473E-8257-DB6BFFEF48A0'
            AND AutoUpdateDefaultInView = 1
         

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '6EDC921F-36C4-4739-9F2A-8F9F00E95AE7'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B098B41F-7953-473E-8257-DB6BFFEF48A0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 63 fields */
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AA64DA98-1DA1-4525-8CC5-BC3E3E4893B6'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Name',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Description',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6EDC921F-36C4-4739-9F2A-8F9F00E95AE7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Logo URL',
       ExtendedType = 'URL',
       CodeType = NULL
   WHERE ID = '77845738-5781-458B-AD3C-5DAE745373C2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Created At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '353D4710-73B2-4AF5-8A93-9DC1F47FF6E5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'System Metadata',
       GeneratedFormSection = 'Category',
       DisplayName = 'Updated At',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3177830D-10A0-4003-B95D-8514974BA846'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent Agent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A6F8773F-4021-45DD-B142-9BFE4F67EC87'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Expose As Action',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DF61AC7C-79A7-4058-96A1-85EBA9339D45'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Execution Order',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '090830CE-4073-486C-BBF2-E2105BEADD91'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Execution Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8261D630-2560-4C03-BE14-C8A9682ABBB4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Invocation Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Parent',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '52E74C81-D246-4B52-B7A7-91757C299671'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '644AA4B2-1044-430C-BCBA-245644294E02'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Compression',
       GeneratedFormSection = 'Category',
       DisplayName = 'Enable Context Compression',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '09AFE563-63E3-4F2B-B6F1-5945432FF07B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Compression',
       GeneratedFormSection = 'Category',
       DisplayName = 'Context Compression Message Threshold',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '451D5C8F-6749-4789-A158-658B38A74AE4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Compression',
       GeneratedFormSection = 'Category',
       DisplayName = 'Context Compression Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FFD209C5-48F3-45D1-9094-E76EC832EA07'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Compression',
       GeneratedFormSection = 'Category',
       DisplayName = 'Context Compression Message Retention Count',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '73A50D68-976F-49A7-9737-12D1D26C6011'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Context Compression',
       GeneratedFormSection = 'Category',
       DisplayName = 'Context Compression Prompt',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AD36EF69-1494-409C-A97E-FE73669DD28A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '91CA077D-3F59-48E1-A593-AF8686276115'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Status',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Driver Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BB9AD9CB-40C0-41F1-B54B-750C844FD41B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Icon Class',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E3E05E29-CDAF-4BFE-9FC8-4450EEBE05E5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Model Selection Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FEEBD49D-5572-45D7-9F1E-08AE762F41D9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Type Prompt Params',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD515BF1-7E8A-4CB0-A8CE-D5C0C8C132D7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload Downstream Paths',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '85B6AA86-796D-4970-9E35-5A483498B517'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload Upstream Paths',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DA784B76-66CD-434B-90BD-DEC808917E68'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload Self Read Paths',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EBF3B958-F07C-420B-82BE-2CB1E396A0F5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload Self Write Paths',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '61E51FC3-8EFA-40D9-9525-F3FAD0A95DCA'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Payload Scope',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '2E542986-0164-4B9E-8457-06826A4AB892'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Final Payload Validation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1C7959AE-F48B-4858-8383-28C3F4706314'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Final Payload Validation Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '8931DE12-4048-4DEB-A2A3-E821354CFFB2'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Final Payload Validation Max Retries',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'AF62DAAB-74D4-4539-9B47-58DD4A023E4B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Starting Payload Validation',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B7A2371C-A22C-48EA-827E-824F8A40DA3D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Starting Payload Validation Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '0947203D-A5CA-4ED2-895B-17A8007323FC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Inject Notes',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '37E075BD-CC4B-4AE1-8D12-7EC45B663F69'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Notes To Inject',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A8DA4C67-B2F7-4C1D-8522-A2B5B4BADA21'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Note Injection Strategy',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F5F6BE87-06F4-404D-A1C3-B315C562C32B'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Inject Examples',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '1C9957C7-A851-4C05-83B3-F49A5FC3FE4D'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Examples To Inject',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DDEE3E91-4B0D-4264-9EF1-ACAAB8D105E5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Payload & Data Flow',
       GeneratedFormSection = 'Category',
       DisplayName = 'Example Injection Strategy',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '291FEE7A-1245-4C82-A470-07EEB8847F1E'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Is Restricted',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E5B17B79-282F-4F19-9656-246DE119D588'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Message Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '445C1618-EADB-4B34-B318-40C662141FE1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Messages',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F8924303-D53A-43B0-B70F-5B74FA6248D9'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Cost Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '23850C5A-311A-4271-AE53-BD36921C5AA5'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Tokens Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C5F8BB50-DC10-4DFC-AC45-8613C152EE94'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Iterations Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '3FA6B9F3-60BC-4631-8EB4-7ED0D04844C4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Time Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'E64A4FF8-BAD5-491C-9D8D-E5E70378ED67'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Min Executions Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BCCCA2DC-8A15-4701-98E2-337FB60B463A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Max Executions Per Run',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F0CCA759-DEA4-4F61-B233-C632EE9317E1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Prompt Effort Level',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'DCBAEEFD-C5A2-449D-A4B9-EAB1290C2F89'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Runtime Limits & Execution Settings',
       GeneratedFormSection = 'Category',
       DisplayName = 'Chat Handling Option',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BC671EC0-ED51-4F0B-A46C-50BE0CE53E51'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Artifact Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F58EA638-CE95-4D2A-9095-9909149B83C7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Owner User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '261B4D18-464B-4AD9-9FFD-EA8B70C576D8'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Artifact Creation Mode',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4371BED0-7C4A-4D24-9E07-17E15D617607'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Functional Requirements',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F613597C-C38F-4D71-B64A-8BBCFD87D8CC'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Technical Design',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CAEA2872-B089-4192-8FA8-1737FF357FFD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Storage',
       GeneratedFormSection = 'Category',
       DisplayName = 'Attachment Storage Provider',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '4B5A24CC-1BC2-40E3-B83E-C8E164E6CFED'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Storage',
       GeneratedFormSection = 'Category',
       DisplayName = 'Attachment Root Path',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'BA112220-B0D8-4C6F-B63A-027EB706B132'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Storage',
       GeneratedFormSection = 'Category',
       DisplayName = 'Inline Storage Threshold Bytes',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'EC3D6539-FAF4-49B7-9A9B-6327249C9D06'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Storage',
       GeneratedFormSection = 'Category',
       DisplayName = 'Attachment Storage Provider',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'CA63582B-F29E-47E3-86A5-F2B4C2292085'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Owner User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B098B41F-7953-473E-8257-DB6BFFEF48A0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Default Artifact Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '6C1C76DF-BBFF-4903-9BB9-3325B5ABB4B1'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Attachment Storage":{"icon":"fa fa-paperclip","description":"Configuration for handling large attachment files, including storage provider, root path, and inline size threshold."},"Agent Identity & Presentation":{"icon":"fa fa-id-card","description":""},"Hierarchy & Invocation":{"icon":"fa fa-sitemap","description":""},"Runtime Limits & Execution Settings":{"icon":"fa fa-tachometer-alt","description":""},"Payload & Data Flow":{"icon":"fa fa-exchange-alt","description":""},"Context Compression":{"icon":"fa fa-compress","description":""}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Attachment Storage":"fa fa-paperclip","Agent Identity & Presentation":"fa fa-id-card","Hierarchy & Invocation":"fa fa-sitemap","Runtime Limits & Execution Settings":"fa fa-tachometer-alt","Payload & Data Flow":"fa fa-exchange-alt","Context Compression":"fa fa-compress"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'FieldCategoryIcons'
            

