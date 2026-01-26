-- Phase 4: Reranking Framework
-- Adds Reranker model type, RerankerConfiguration to AIAgent, and Cohere reranker models
-- This migration supports two-stage retrieval with semantic reranking for agent memory

-- ============================================================================
-- 1. Add 'Reranker' AIModelType
-- ============================================================================
DECLARE @RerankerTypeID UNIQUEIDENTIFIER = '86E771DA-DC64-4E29-94B3-77403A0994C0';
DECLARE @TextModalityID UNIQUEIDENTIFIER;

-- Get Text modality ID for input/output modalities
SELECT @TextModalityID = ID FROM ${flyway:defaultSchema}.AIModality WHERE Name = 'Text';

IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModelType WHERE Name = 'Reranker')
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModelType (ID, Name, Description, DefaultInputModalityID, DefaultOutputModalityID)
    VALUES (
        @RerankerTypeID,
        'Reranker',
        'Models that reorder search results based on query-document relevance. Used in two-stage retrieval to improve accuracy of RAG systems.',
        @TextModalityID,
        @TextModalityID
    );
END

-- ============================================================================
-- 2. Add RerankerConfiguration column to AIAgent table
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.AIAgent') AND name = 'RerankerConfiguration')
BEGIN
    ALTER TABLE ${flyway:defaultSchema}.AIAgent
    ADD RerankerConfiguration NVARCHAR(MAX) NULL;
END

-- ============================================================================
-- 3. Add Cohere as AI Vendor (if not exists)
-- ============================================================================
DECLARE @CohereVendorID UNIQUEIDENTIFIER = '9AF766B4-7720-4807-9C25-2836D685A7E1';
DECLARE @InferenceProviderTypeDefID UNIQUEIDENTIFIER;

-- Get Inference Provider type definition ID
SELECT @InferenceProviderTypeDefID = ID FROM ${flyway:defaultSchema}.AIVendorTypeDefinition WHERE Name = 'Inference Provider';

IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIVendor WHERE Name = 'Cohere')
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIVendor (ID, Name, Description)
    VALUES (
        @CohereVendorID,
        'Cohere',
        'Cohere provides enterprise-grade NLP models including language models and specialized reranking models for improving RAG system accuracy.'
    );

    -- Add vendor type for Cohere (Inference Provider)
    IF @InferenceProviderTypeDefID IS NOT NULL
    BEGIN
        INSERT INTO ${flyway:defaultSchema}.AIVendorType (ID, VendorID, TypeID)
        VALUES (NEWID(), @CohereVendorID, @InferenceProviderTypeDefID);
    END
END
ELSE
BEGIN
    -- Get existing Cohere vendor ID if it already exists
    SELECT @CohereVendorID = ID FROM ${flyway:defaultSchema}.AIVendor WHERE Name = 'Cohere';
END

-- ============================================================================
-- 4. Add Cohere Reranker Models
-- ============================================================================
DECLARE @CohereRerank35ID UNIQUEIDENTIFIER = '1AF4B81D-B7A2-41E4-8514-E72A619E63DE';
DECLARE @CohereRerankMultilingualID UNIQUEIDENTIFIER = '2E8F662B-3842-41E1-87BF-3C14541BF93B';

-- Add rerank-v3.5 model (latest English reranker)
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE Name = 'rerank-v3.5')
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModel (ID, Name, Description, AIModelTypeID, PowerRank, IsActive)
    VALUES (
        @CohereRerank35ID,
        'rerank-v3.5',
        'Cohere Rerank v3.5 - Latest semantic reranking model with state-of-the-art performance for English content. Optimized for RAG retrieval quality improvement.',
        @RerankerTypeID,
        100,
        1
    );

    -- Add model-vendor association for rerank-v3.5
    -- TypeID references Inference Provider type definition
    INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, Priority, DriverClass, APIName, Status, TypeID)
    VALUES (
        'E0BEEDA5-7189-4E6A-9B60-BA65FA41B85F',
        @CohereRerank35ID,
        @CohereVendorID,
        1,
        'CohereReranker',
        'rerank-v3.5',
        'Active',
        @InferenceProviderTypeDefID
    );
END

-- Add rerank-multilingual-v3.0 model (multilingual reranker)
IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE Name = 'rerank-multilingual-v3.0')
BEGIN
    INSERT INTO ${flyway:defaultSchema}.AIModel (ID, Name, Description, AIModelTypeID, PowerRank, IsActive)
    VALUES (
        @CohereRerankMultilingualID,
        'rerank-multilingual-v3.0',
        'Cohere Rerank Multilingual v3.0 - Semantic reranking model supporting 100+ languages for global RAG deployments.',
        @RerankerTypeID,
        80,
        1
    );

    -- Add model-vendor association for rerank-multilingual-v3.0
    INSERT INTO ${flyway:defaultSchema}.AIModelVendor (ID, ModelID, VendorID, Priority, DriverClass, APIName, Status, TypeID)
    VALUES (
        'A7F3B2C1-8D4E-4F5A-9C6B-1E2F3A4B5C6D',
        @CohereRerankMultilingualID,
        @CohereVendorID,
        1,
        'CohereReranker',
        'rerank-multilingual-v3.0',
        'Active',
        @InferenceProviderTypeDefID
    );
END

-- ============================================================================
-- 5. Add LLM-based Reranker Model
-- ============================================================================
-- LLM reranker uses the AI Prompts system instead of a dedicated API
-- This allows reranking using any configured LLM when Cohere is not available

DECLARE @LLMRerankerID UNIQUEIDENTIFIER = '7D3E8F5A-C621-4B89-9E12-8A4C2F7D1B90';

IF NOT EXISTS (SELECT 1 FROM ${flyway:defaultSchema}.AIModel WHERE Name = 'LLM Reranker')
BEGIN
    -- LLM Reranker doesn't need a vendor - it uses the AI Prompts system
    -- The RerankerService handles this model specially by name
    INSERT INTO ${flyway:defaultSchema}.AIModel (ID, Name, Description, AIModelTypeID, PowerRank, IsActive)
    VALUES (
        @LLMRerankerID,
        'LLM Reranker',
        'LLM-based semantic reranking using AI Prompts. Uses any configured language model to score document relevance. Useful when dedicated reranker APIs are not available.',
        @RerankerTypeID,
        50,
        1
    );
END

-- ============================================================================
-- 6. Add Extended Property for RerankerConfiguration Column
-- ============================================================================
IF NOT EXISTS (
    SELECT * FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.AIAgent')
    AND minor_id = (SELECT column_id FROM sys.columns WHERE object_id = OBJECT_ID('${flyway:defaultSchema}.AIAgent') AND name = 'RerankerConfiguration')
    AND name = 'MS_Description'
)
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'JSON configuration for optional reranking of retrieved memory items. Schema: { enabled: boolean, rerankerModelId: string, retrievalMultiplier: number (default 3), minRelevanceThreshold: number (default 0.5), rerankPromptId?: string, contextFields?: string[], fallbackOnError: boolean (default true) }. When null or disabled, vector search results are used directly without reranking.',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = 'AIAgent',
        @level2type = N'COLUMN', @level2name = 'RerankerConfiguration';
END






















































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '269087f5-debe-4b14-8fa3-5938adcf7325'  OR 
               (EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'RerankerConfiguration')
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
            '269087f5-debe-4b14-8fa3-5938adcf7325',
            'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- Entity: AI Agents
            100128,
            'RerankerConfiguration',
            'Reranker Configuration',
            'JSON configuration for optional reranking of retrieved memory items. Schema: { enabled: boolean, rerankerModelId: string, retrievalMultiplier: number (default 3), minRelevanceThreshold: number (default 0.5), rerankPromptId?: string, contextFields?: string[], fallbackOnError: boolean (default true) }. When null or disabled, vector search results are used directly without reranking.',
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
    @AgentTypePromptParams nvarchar(MAX),
    @ScopeConfig nvarchar(MAX),
    @NoteRetentionDays int,
    @ExampleRetentionDays int,
    @AutoArchiveEnabled bit = NULL,
    @RerankerConfiguration nvarchar(MAX)
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
                [AgentTypePromptParams],
                [ScopeConfig],
                [NoteRetentionDays],
                [ExampleRetentionDays],
                [AutoArchiveEnabled],
                [RerankerConfiguration]
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
                @AgentTypePromptParams,
                @ScopeConfig,
                @NoteRetentionDays,
                @ExampleRetentionDays,
                ISNULL(@AutoArchiveEnabled, 1),
                @RerankerConfiguration
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
                [AgentTypePromptParams],
                [ScopeConfig],
                [NoteRetentionDays],
                [ExampleRetentionDays],
                [AutoArchiveEnabled],
                [RerankerConfiguration]
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
                @AgentTypePromptParams,
                @ScopeConfig,
                @NoteRetentionDays,
                @ExampleRetentionDays,
                ISNULL(@AutoArchiveEnabled, 1),
                @RerankerConfiguration
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
    @AgentTypePromptParams nvarchar(MAX),
    @ScopeConfig nvarchar(MAX),
    @NoteRetentionDays int,
    @ExampleRetentionDays int,
    @AutoArchiveEnabled bit,
    @RerankerConfiguration nvarchar(MAX)
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
        [AgentTypePromptParams] = @AgentTypePromptParams,
        [ScopeConfig] = @ScopeConfig,
        [NoteRetentionDays] = @NoteRetentionDays,
        [ExampleRetentionDays] = @ExampleRetentionDays,
        [AutoArchiveEnabled] = @AutoArchiveEnabled,
        [RerankerConfiguration] = @RerankerConfiguration
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
            WHERE ID = '090830CE-4073-486C-BBF2-E2105BEADD91'
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
               WHERE ID = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

               UPDATE [${flyway:defaultSchema}].EntityField
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'B098B41F-7953-473E-8257-DB6BFFEF48A0'
               AND AutoUpdateIncludeInUserSearchAPI = 1
            

/* Set categories for 68 fields */
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
       DisplayName = 'Parent',
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
       DisplayName = 'Context Compression Prompt ID',
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
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Type',
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
       DisplayName = 'Owner User ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '261B4D18-464B-4AD9-9FFD-EA8B70C576D8'
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
       DisplayName = 'Attachment Storage Provider ID',
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
   SET Category = 'Agent Identity & Presentation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Agent Type Prompt Params',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'FD515BF1-7E8A-4CB0-A8CE-D5C0C8C132D7'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Scope Configuration',
       GeneratedFormSection = 'Category',
       DisplayName = 'Scope Config',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'F644A0DD-0C7D-44E5-A2D5-0DAE4F0455AD'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Retention & Archiving',
       GeneratedFormSection = 'Category',
       DisplayName = 'Note Retention Days',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '38ABFFF6-5E0D-4AF1-B5CC-AB46B2358FB4'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Retention & Archiving',
       GeneratedFormSection = 'Category',
       DisplayName = 'Example Retention Days',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'A112A808-63DB-4B48-B38F-06554B912DED'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Retention & Archiving',
       GeneratedFormSection = 'Category',
       DisplayName = 'Auto Archive Enabled',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '85774265-68C5-4067-9C2B-F70A7F21B94A'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Retrieval & Ranking',
       GeneratedFormSection = 'Category',
       DisplayName = 'Reranker Configuration',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '269087F5-DEBE-4B14-8FA3-5938ADCF7325'
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
       DisplayName = 'Type',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529'
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
       DisplayName = 'Owner User',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B098B41F-7953-473E-8257-DB6BFFEF48A0'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Attachment Storage',
       GeneratedFormSection = 'Category',
       DisplayName = 'Attachment Storage Provider',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = 'B6261245-1F52-43BA-9C92-A3E494D8C5BE'
   AND AutoUpdateCategory = 1
UPDATE [${flyway:defaultSchema}].EntityField
   SET Category = 'Hierarchy & Invocation',
       GeneratedFormSection = 'Category',
       DisplayName = 'Root Parent ID',
       ExtendedType = NULL,
       CodeType = NULL
   WHERE ID = '644AA4B2-1044-430C-BCBA-245644294E02'
   AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Retrieval & Ranking":{"icon":"fa fa-search","description":"Configuration for reranking retrieved memory items during agent execution"},"Retention & Archiving":{"icon":"fa fa-archive","description":"Settings that control automatic retention periods and archival of notes and examples."},"Attachment Storage":{"icon":"fa fa-paperclip","description":"Configuration for handling large attachment files, including storage provider, root path, and inline size threshold."},"Agent Identity & Presentation":{"icon":"fa fa-id-card","description":""},"Hierarchy & Invocation":{"icon":"fa fa-sitemap","description":""},"Runtime Limits & Execution Settings":{"icon":"fa fa-tachometer-alt","description":""},"Payload & Data Flow":{"icon":"fa fa-exchange-alt","description":""},"Context Compression":{"icon":"fa fa-compress","description":""}}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting for entity (legacy format) */

               UPDATE [${flyway:defaultSchema}].EntitySetting
               SET Value = '{"Retrieval & Ranking":"fa fa-search","Retention & Archiving":"fa fa-archive","Attachment Storage":"fa fa-paperclip","Agent Identity & Presentation":"fa fa-id-card","Hierarchy & Invocation":"fa fa-sitemap","Runtime Limits & Execution Settings":"fa fa-tachometer-alt","Payload & Data Flow":"fa fa-exchange-alt","Context Compression":"fa fa-compress"}',
                   __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND Name = 'FieldCategoryIcons'
            







































































































-- SECOND CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '35817bf6-d6af-4dd2-b588-50012f512fa8'  OR 
               (EntityID = 'C49BBAB8-6944-44AF-871B-01F599272E6E' AND Name = 'APIKey')
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
            '35817bf6-d6af-4dd2-b588-50012f512fa8',
            'C49BBAB8-6944-44AF-871B-01F599272E6E', -- Entity: MJ: API Key Usage Logs
            100023,
            'APIKey',
            'API Key',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
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
         WHERE ID = '039426c0-fa6d-4793-8bb4-7eef187f2712'  OR 
               (EntityID = '78AD0238-8B56-EF11-991A-6045BDEBA539' AND Name = 'PromptRun')
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
            '039426c0-fa6d-4793-8bb4-7eef187f2712',
            '78AD0238-8B56-EF11-991A-6045BDEBA539', -- Entity: AI Result Cache
            100041,
            'PromptRun',
            'Prompt Run',
            NULL,
            'nvarchar',
            510,
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
         WHERE ID = 'aa772c24-6d8a-476e-907c-ebc70a353e8e'  OR 
               (EntityID = 'D7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
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
            'aa772c24-6d8a-476e-907c-ebc70a353e8e',
            'D7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Employee Company Integrations
            100016,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
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
         WHERE ID = 'ba75afb7-a9d9-415f-8c7e-c6c3d56fe11e'  OR 
               (EntityID = 'D8238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
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
            'ba75afb7-a9d9-415f-8c7e-c6c3d56fe11e',
            'D8238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Employee Roles
            100012,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
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
         WHERE ID = '51221c59-080a-4c26-b269-c7eb87804350'  OR 
               (EntityID = 'D9238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Employee')
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
            '51221c59-080a-4c26-b269-c7eb87804350',
            'D9238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Employee Skills
            100012,
            'Employee',
            'Employee',
            NULL,
            'nvarchar',
            162,
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
         WHERE ID = 'f4bf30df-1577-4caa-810d-b42f9b847fdd'  OR 
               (EntityID = 'E7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CompanyIntegrationRun')
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
            'f4bf30df-1577-4caa-810d-b42f9b847fdd',
            'E7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Error Logs
            100023,
            'CompanyIntegrationRun',
            'Company Integration Run',
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
         WHERE ID = '77e98c13-73de-4e00-b10c-cb3f422f3c77'  OR 
               (EntityID = 'E7238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CompanyIntegrationRunDetail')
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
            '77e98c13-73de-4e00-b10c-cb3f422f3c77',
            'E7238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Error Logs
            100024,
            'CompanyIntegrationRunDetail',
            'Company Integration Run Detail',
            NULL,
            'nvarchar',
            900,
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
         WHERE ID = '40a20a73-9881-483e-8d09-c9a718cc89e6'  OR 
               (EntityID = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ReplayRun')
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
            '40a20a73-9881-483e-8d09-c9a718cc89e6',
            'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Record Changes
            100040,
            'ReplayRun',
            'Replay Run',
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
         WHERE ID = '21de0487-ab36-400a-952d-85f4ec3619e4'  OR 
               (EntityID = '09248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ConversationDetail')
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
            '21de0487-ab36-400a-952d-85f4ec3619e4',
            '09248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Reports
            100053,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
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
         WHERE ID = 'cc2d2302-d16a-428b-83d3-573f676c64b6'  OR 
               (EntityID = '13248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TestRun')
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
            'cc2d2302-d16a-428b-83d3-573f676c64b6',
            '13248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Conversations
            100045,
            'TestRun',
            'Test Run',
            NULL,
            'nvarchar',
            510,
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
         WHERE ID = 'ba562257-4ce3-4772-8b3a-153054bba89a'  OR 
               (EntityID = '18248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RecordMergeLog')
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
            'ba562257-4ce3-4772-8b3a-153054bba89a',
            '18248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Record Merge Deletion Logs
            100015,
            'RecordMergeLog',
            'Record Merge Log',
            NULL,
            'nvarchar',
            900,
            0,
            0,
            0,
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
         WHERE ID = '0d2e82e0-26b2-4a6d-b141-ebaae502a090'  OR 
               (EntityID = '31248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'DuplicateRun')
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
            '0d2e82e0-26b2-4a6d-b141-ebaae502a090',
            '31248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Duplicate Run Details
            100021,
            'DuplicateRun',
            'Duplicate Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
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
         WHERE ID = '95332c19-835b-449b-ae82-45b626a27feb'  OR 
               (EntityID = '35248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
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
            '95332c19-835b-449b-ae82-45b626a27feb',
            '35248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Invocations
            100014,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
            0,
            0,
            0,
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
         WHERE ID = '4c552037-4307-477a-bf8f-9ca14a2767b9'  OR 
               (EntityID = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
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
            '4c552037-4307-477a-bf8f-9ca14a2767b9',
            '39248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Filters
            100015,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
            0,
            0,
            0,
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
         WHERE ID = '91453765-9e7f-491d-96ed-781435b6aafe'  OR 
               (EntityID = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ActionFilter')
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
            '91453765-9e7f-491d-96ed-781435b6aafe',
            '39248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Filters
            100016,
            'ActionFilter',
            'Action Filter',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
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
         WHERE ID = '936e89e2-d283-43bc-88d4-e957050a1269'  OR 
               (EntityID = '4B248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'TemplateContent')
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
            '936e89e2-d283-43bc-88d4-e957050a1269',
            '4B248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Template Params
            100037,
            'TemplateContent',
            'Template Content',
            NULL,
            'nvarchar',
            510,
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
         WHERE ID = 'ce56c13b-d61c-4178-b10a-e7ac66a5be70'  OR 
               (EntityID = '4D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RecommendationRun')
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
            'ce56c13b-d61c-4178-b10a-e7ac66a5be70',
            '4D248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Recommendations
            100014,
            'RecommendationRun',
            'Recommendation Run',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
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
         WHERE ID = '99b37c66-0889-4711-b417-f70a72b6dc31'  OR 
               (EntityID = '50248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'Recommendation')
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
            '99b37c66-0889-4711-b417-f70a72b6dc31',
            '50248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Recommendation Items
            100016,
            'Recommendation',
            'Recommendation',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
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
         WHERE ID = 'b0ac3f1e-121c-4e10-b41b-a5bf17382794'  OR 
               (EntityID = '52248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityCommunicationMessageType')
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
            'b0ac3f1e-121c-4e10-b41b-a5bf17382794',
            '52248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Communication Fields
            100013,
            'EntityCommunicationMessageType',
            'Entity Communication Message Type',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
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
         WHERE ID = '0b86f752-ec84-4249-a13d-b59cd71e7f68'  OR 
               (EntityID = '56248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'EntityAction')
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
            '0b86f752-ec84-4249-a13d-b59cd71e7f68',
            '56248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: Entity Action Params
            100018,
            'EntityAction',
            'Entity Action',
            NULL,
            'nvarchar',
            850,
            0,
            0,
            0,
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
         WHERE ID = 'c95aa5be-0a0d-4889-b135-cf8f4e4ab395'  OR 
               (EntityID = 'F1741CE5-EACA-492D-9869-9B55D33D9C29' AND Name = 'APIKey')
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
            'c95aa5be-0a0d-4889-b135-cf8f4e4ab395',
            'F1741CE5-EACA-492D-9869-9B55D33D9C29', -- Entity: MJ: API Key Scopes
            100012,
            'APIKey',
            'API Key',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
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
         WHERE ID = '9046d466-4041-462d-82ba-6647aa25d2c7'  OR 
               (EntityID = 'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E' AND Name = 'ConversationDetail')
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
            '9046d466-4041-462d-82ba-6647aa25d2c7',
            'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E', -- Entity: MJ: Conversation Detail Ratings
            100016,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
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
         WHERE ID = '83a6007b-78fc-49a6-b32d-0082d8a899c5'  OR 
               (EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'AgentRun')
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
            '83a6007b-78fc-49a6-b32d-0082d8a899c5',
            '99273DAD-560E-4ABC-8332-C97AB58B7463', -- Entity: MJ: AI Agent Run Steps
            100046,
            'AgentRun',
            'Agent Run',
            NULL,
            'nvarchar',
            510,
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
         WHERE ID = '9d0b5447-12dd-46f4-aa7a-324745462e8f'  OR 
               (EntityID = '99273DAD-560E-4ABC-8332-C97AB58B7463' AND Name = 'Parent')
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
            '9d0b5447-12dd-46f4-aa7a-324745462e8f',
            '99273DAD-560E-4ABC-8332-C97AB58B7463', -- Entity: MJ: AI Agent Run Steps
            100047,
            'Parent',
            'Parent',
            NULL,
            'nvarchar',
            510,
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
         WHERE ID = '9bdf47e4-ad34-474b-aaf4-63abaa1e985e'  OR 
               (EntityID = '16AB21D1-8047-41B9-8AEA-CD253DED9743' AND Name = 'ConversationDetail')
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
            '9bdf47e4-ad34-474b-aaf4-63abaa1e985e',
            '16AB21D1-8047-41B9-8AEA-CD253DED9743', -- Entity: MJ: Conversation Detail Artifacts
            100014,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            0,
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
         WHERE ID = 'ec40f614-c1f5-40c3-ae5a-5d93dbec5d47'  OR 
               (EntityID = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND Name = 'ConversationDetail')
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
            'ec40f614-c1f5-40c3-ae5a-5d93dbec5d47',
            '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- Entity: MJ: Tasks
            100046,
            'ConversationDetail',
            'Conversation Detail',
            NULL,
            'nvarchar',
            -1,
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

