-- ============================================================================
-- Migration: Fix vwAIAgents OwnerUser LEFT OUTER JOIN and MJ: AI Agents MC9 __mj_UpdatedAt Contract
--
-- Forward-only repair for V202611221400__v6.3.x__TaskGraph_Workflow_Isolation.sql:
--   1. Restores LEFT OUTER JOIN on nullable AIAgent.OwnerUserID -> User in vwAIAgents
--      so CodeGen warm-twice does not flip OwnerUser between non-null and nullable.
--   2. Restores [__mj_UpdatedAt] = GETUTCDATE() in spUpdateAIAgent and the
--      IF NOT UPDATE([__mj_UpdatedAt]) guard in trgUpdateAIAgent so
--      metadata-consistency.MC9 passes.
-- ============================================================================

DROP VIEW [${flyway:defaultSchema}].[vwAIAgents];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgents]
AS
SELECT
    a.*,
    MJAIAgent_ParentID.[Name] AS [Parent],
    MJAIPrompt_ContextCompressionPromptID.[Name] AS [ContextCompressionPrompt],
    MJAIAgentType_TypeID.[Name] AS [Type],
    MJArtifactType_DefaultArtifactTypeID.[Name] AS [DefaultArtifactType],
    MJUser_OwnerUserID.[Name] AS [OwnerUser],
    MJFileStorageProvider_AttachmentStorageProviderID.[Name] AS [AttachmentStorageProvider],
    MJAIAgentCategory_CategoryID.[Name] AS [Category],
    MJFileStorageAccount_DefaultStorageAccountID.[Name] AS [DefaultStorageAccount],
    MJAIAgent_DefaultCoAgentID.[Name] AS [DefaultCoAgent],
    MJFileStorageProvider_RecordingStorageProviderID.[Name] AS [RecordingStorageProvider],
    MJCollection_DefaultMediaCollectionID.[Name] AS [DefaultMediaCollection],
    MJAIPrompt_ConversationSummaryPromptID.[Name] AS [ConversationSummaryPrompt],
    hier_ParentID.RootID AS [RootParentID],
    hier_ParentID.Depth AS [ParentIDDepth],
    hier_ParentID.Path AS [ParentIDPath],
    hier_ParentID.IsLeaf AS [ParentIDIsLeaf],
    hier_ParentID.ChildCount AS [ParentIDChildCount]
FROM
    [${flyway:defaultSchema}].[AIAgent] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_ParentID
  ON
    [a].[ParentID] = MJAIAgent_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_ContextCompressionPromptID
  ON
    [a].[ContextCompressionPromptID] = MJAIPrompt_ContextCompressionPromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentType] AS MJAIAgentType_TypeID
  ON
    [a].[TypeID] = MJAIAgentType_TypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ArtifactType] AS MJArtifactType_DefaultArtifactTypeID
  ON
    [a].[DefaultArtifactTypeID] = MJArtifactType_DefaultArtifactTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_OwnerUserID
  ON
    [a].[OwnerUserID] = MJUser_OwnerUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageProvider] AS MJFileStorageProvider_AttachmentStorageProviderID
  ON
    [a].[AttachmentStorageProviderID] = MJFileStorageProvider_AttachmentStorageProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentCategory] AS MJAIAgentCategory_CategoryID
  ON
    [a].[CategoryID] = MJAIAgentCategory_CategoryID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageAccount] AS MJFileStorageAccount_DefaultStorageAccountID
  ON
    [a].[DefaultStorageAccountID] = MJFileStorageAccount_DefaultStorageAccountID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_DefaultCoAgentID
  ON
    [a].[DefaultCoAgentID] = MJAIAgent_DefaultCoAgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageProvider] AS MJFileStorageProvider_RecordingStorageProviderID
  ON
    [a].[RecordingStorageProviderID] = MJFileStorageProvider_RecordingStorageProviderID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Collection] AS MJCollection_DefaultMediaCollectionID
  ON
    [a].[DefaultMediaCollectionID] = MJCollection_DefaultMediaCollectionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_ConversationSummaryPromptID
  ON
    [a].[ConversationSummaryPromptID] = MJAIPrompt_ConversationSummaryPromptID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentParentID_GetHierarchyMeta]([a].[ID], [a].[ParentID]) AS hier_ParentID
GO
EXEC sp_refreshview '${flyway:defaultSchema}.vwAIAgentsActive';
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgents] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgents] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgents] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgents] TO [cdp_UI], [cdp_Developer], [cdp_Integration];
GO

DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgent];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgent]
    @ID uniqueidentifier,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @LogoURL_Clear bit = 0,
    @LogoURL nvarchar(255) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @ExposeAsAction bit = NULL,
    @ExecutionOrder int = NULL,
    @ExecutionMode nvarchar(20) = NULL,
    @EnableContextCompression bit = NULL,
    @ContextCompressionMessageThreshold_Clear bit = 0,
    @ContextCompressionMessageThreshold int = NULL,
    @ContextCompressionPromptID_Clear bit = 0,
    @ContextCompressionPromptID uniqueidentifier = NULL,
    @ContextCompressionMessageRetentionCount_Clear bit = 0,
    @ContextCompressionMessageRetentionCount int = NULL,
    @TypeID_Clear bit = 0,
    @TypeID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @DriverClass_Clear bit = 0,
    @DriverClass nvarchar(255) = NULL,
    @IconClass_Clear bit = 0,
    @IconClass nvarchar(100) = NULL,
    @ModelSelectionMode nvarchar(50) = NULL,
    @PayloadDownstreamPaths nvarchar(MAX) = NULL,
    @PayloadUpstreamPaths nvarchar(MAX) = NULL,
    @PayloadSelfReadPaths_Clear bit = 0,
    @PayloadSelfReadPaths nvarchar(MAX) = NULL,
    @PayloadSelfWritePaths_Clear bit = 0,
    @PayloadSelfWritePaths nvarchar(MAX) = NULL,
    @PayloadScope_Clear bit = 0,
    @PayloadScope nvarchar(MAX) = NULL,
    @FinalPayloadValidation_Clear bit = 0,
    @FinalPayloadValidation nvarchar(MAX) = NULL,
    @FinalPayloadValidationMode nvarchar(25) = NULL,
    @FinalPayloadValidationMaxRetries int = NULL,
    @MaxCostPerRun_Clear bit = 0,
    @MaxCostPerRun decimal(10, 4) = NULL,
    @MaxTokensPerRun_Clear bit = 0,
    @MaxTokensPerRun int = NULL,
    @MaxIterationsPerRun_Clear bit = 0,
    @MaxIterationsPerRun int = NULL,
    @MaxTimePerRun_Clear bit = 0,
    @MaxTimePerRun int = NULL,
    @MinExecutionsPerRun_Clear bit = 0,
    @MinExecutionsPerRun int = NULL,
    @MaxExecutionsPerRun_Clear bit = 0,
    @MaxExecutionsPerRun int = NULL,
    @StartingPayloadValidation_Clear bit = 0,
    @StartingPayloadValidation nvarchar(MAX) = NULL,
    @StartingPayloadValidationMode nvarchar(25) = NULL,
    @DefaultPromptEffortLevel_Clear bit = 0,
    @DefaultPromptEffortLevel int = NULL,
    @ChatHandlingOption_Clear bit = 0,
    @ChatHandlingOption nvarchar(30) = NULL,
    @DefaultArtifactTypeID_Clear bit = 0,
    @DefaultArtifactTypeID uniqueidentifier = NULL,
    @OwnerUserID uniqueidentifier = NULL,
    @InvocationMode nvarchar(20) = NULL,
    @ArtifactCreationMode nvarchar(20) = NULL,
    @FunctionalRequirements_Clear bit = 0,
    @FunctionalRequirements nvarchar(MAX) = NULL,
    @TechnicalDesign_Clear bit = 0,
    @TechnicalDesign nvarchar(MAX) = NULL,
    @InjectNotes bit = NULL,
    @MaxNotesToInject int = NULL,
    @NoteInjectionStrategy nvarchar(20) = NULL,
    @InjectExamples bit = NULL,
    @MaxExamplesToInject int = NULL,
    @ExampleInjectionStrategy nvarchar(20) = NULL,
    @IsRestricted bit = NULL,
    @MessageMode nvarchar(50) = NULL,
    @MaxMessages_Clear bit = 0,
    @MaxMessages int = NULL,
    @AttachmentStorageProviderID_Clear bit = 0,
    @AttachmentStorageProviderID uniqueidentifier = NULL,
    @AttachmentRootPath_Clear bit = 0,
    @AttachmentRootPath nvarchar(500) = NULL,
    @InlineStorageThresholdBytes_Clear bit = 0,
    @InlineStorageThresholdBytes int = NULL,
    @AgentTypePromptParams_Clear bit = 0,
    @AgentTypePromptParams nvarchar(MAX) = NULL,
    @ScopeConfig_Clear bit = 0,
    @ScopeConfig nvarchar(MAX) = NULL,
    @NoteRetentionDays_Clear bit = 0,
    @NoteRetentionDays int = NULL,
    @ExampleRetentionDays_Clear bit = 0,
    @ExampleRetentionDays int = NULL,
    @AutoArchiveEnabled bit = NULL,
    @RerankerConfiguration_Clear bit = 0,
    @RerankerConfiguration nvarchar(MAX) = NULL,
    @CategoryID_Clear bit = 0,
    @CategoryID uniqueidentifier = NULL,
    @AllowEphemeralClientTools bit = NULL,
    @DefaultStorageAccountID_Clear bit = 0,
    @DefaultStorageAccountID uniqueidentifier = NULL,
    @SearchScopeAccess nvarchar(20) = NULL,
    @AcceptUnregisteredFiles bit = NULL,
    @DefaultCoAgentID_Clear bit = 0,
    @DefaultCoAgentID uniqueidentifier = NULL,
    @TypeConfiguration_Clear bit = 0,
    @TypeConfiguration nvarchar(MAX) = NULL,
    @AllowMemoryWrite bit = NULL,
    @RecordingDefault_Clear bit = 0,
    @RecordingDefault nvarchar(20) = NULL,
    @RecordingStorageProviderID_Clear bit = 0,
    @RecordingStorageProviderID uniqueidentifier = NULL,
    @DefaultMediaCollectionID_Clear bit = 0,
    @DefaultMediaCollectionID uniqueidentifier = NULL,
    @SupportsPlanMode bit = NULL,
    @AcceptsSkills nvarchar(20) = NULL,
    @SkillActivationMode nvarchar(20) = NULL,
    @RequirePlanMode bit = NULL,
    @ContextWindowMaxTokens_Clear bit = 0,
    @ContextWindowMaxTokens int = NULL,
    @CompactionTriggerPercent_Clear bit = 0,
    @CompactionTriggerPercent int = NULL,
    @CompactionTargetPercent_Clear bit = 0,
    @CompactionTargetPercent int = NULL,
    @ConversationSummaryPromptID_Clear bit = 0,
    @ConversationSummaryPromptID uniqueidentifier = NULL,
    @DeclareActionsAsNativeTools bit = NULL,
    @MaxSubAgentConsultRounds_Clear bit = 0,
    @MaxSubAgentConsultRounds int = NULL,
    @Isolation nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgent]
    SET
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [LogoURL] = CASE WHEN @LogoURL_Clear = 1 THEN NULL ELSE ISNULL(@LogoURL, [LogoURL]) END,
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [ExposeAsAction] = ISNULL(@ExposeAsAction, [ExposeAsAction]),
        [ExecutionOrder] = ISNULL(@ExecutionOrder, [ExecutionOrder]),
        [ExecutionMode] = ISNULL(@ExecutionMode, [ExecutionMode]),
        [EnableContextCompression] = ISNULL(@EnableContextCompression, [EnableContextCompression]),
        [ContextCompressionMessageThreshold] = CASE WHEN @ContextCompressionMessageThreshold_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionMessageThreshold, [ContextCompressionMessageThreshold]) END,
        [ContextCompressionPromptID] = CASE WHEN @ContextCompressionPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionPromptID, [ContextCompressionPromptID]) END,
        [ContextCompressionMessageRetentionCount] = CASE WHEN @ContextCompressionMessageRetentionCount_Clear = 1 THEN NULL ELSE ISNULL(@ContextCompressionMessageRetentionCount, [ContextCompressionMessageRetentionCount]) END,
        [TypeID] = CASE WHEN @TypeID_Clear = 1 THEN NULL ELSE ISNULL(@TypeID, [TypeID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [DriverClass] = CASE WHEN @DriverClass_Clear = 1 THEN NULL ELSE ISNULL(@DriverClass, [DriverClass]) END,
        [IconClass] = CASE WHEN @IconClass_Clear = 1 THEN NULL ELSE ISNULL(@IconClass, [IconClass]) END,
        [ModelSelectionMode] = ISNULL(@ModelSelectionMode, [ModelSelectionMode]),
        [PayloadDownstreamPaths] = ISNULL(@PayloadDownstreamPaths, [PayloadDownstreamPaths]),
        [PayloadUpstreamPaths] = ISNULL(@PayloadUpstreamPaths, [PayloadUpstreamPaths]),
        [PayloadSelfReadPaths] = CASE WHEN @PayloadSelfReadPaths_Clear = 1 THEN NULL ELSE ISNULL(@PayloadSelfReadPaths, [PayloadSelfReadPaths]) END,
        [PayloadSelfWritePaths] = CASE WHEN @PayloadSelfWritePaths_Clear = 1 THEN NULL ELSE ISNULL(@PayloadSelfWritePaths, [PayloadSelfWritePaths]) END,
        [PayloadScope] = CASE WHEN @PayloadScope_Clear = 1 THEN NULL ELSE ISNULL(@PayloadScope, [PayloadScope]) END,
        [FinalPayloadValidation] = CASE WHEN @FinalPayloadValidation_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidation, [FinalPayloadValidation]) END,
        [FinalPayloadValidationMode] = ISNULL(@FinalPayloadValidationMode, [FinalPayloadValidationMode]),
        [FinalPayloadValidationMaxRetries] = ISNULL(@FinalPayloadValidationMaxRetries, [FinalPayloadValidationMaxRetries]),
        [MaxCostPerRun] = CASE WHEN @MaxCostPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxCostPerRun, [MaxCostPerRun]) END,
        [MaxTokensPerRun] = CASE WHEN @MaxTokensPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxTokensPerRun, [MaxTokensPerRun]) END,
        [MaxIterationsPerRun] = CASE WHEN @MaxIterationsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxIterationsPerRun, [MaxIterationsPerRun]) END,
        [MaxTimePerRun] = CASE WHEN @MaxTimePerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxTimePerRun, [MaxTimePerRun]) END,
        [MinExecutionsPerRun] = CASE WHEN @MinExecutionsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MinExecutionsPerRun, [MinExecutionsPerRun]) END,
        [MaxExecutionsPerRun] = CASE WHEN @MaxExecutionsPerRun_Clear = 1 THEN NULL ELSE ISNULL(@MaxExecutionsPerRun, [MaxExecutionsPerRun]) END,
        [StartingPayloadValidation] = CASE WHEN @StartingPayloadValidation_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayloadValidation, [StartingPayloadValidation]) END,
        [StartingPayloadValidationMode] = ISNULL(@StartingPayloadValidationMode, [StartingPayloadValidationMode]),
        [DefaultPromptEffortLevel] = CASE WHEN @DefaultPromptEffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@DefaultPromptEffortLevel, [DefaultPromptEffortLevel]) END,
        [ChatHandlingOption] = CASE WHEN @ChatHandlingOption_Clear = 1 THEN NULL ELSE ISNULL(@ChatHandlingOption, [ChatHandlingOption]) END,
        [DefaultArtifactTypeID] = CASE WHEN @DefaultArtifactTypeID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultArtifactTypeID, [DefaultArtifactTypeID]) END,
        [OwnerUserID] = ISNULL(@OwnerUserID, [OwnerUserID]),
        [InvocationMode] = ISNULL(@InvocationMode, [InvocationMode]),
        [ArtifactCreationMode] = ISNULL(@ArtifactCreationMode, [ArtifactCreationMode]),
        [FunctionalRequirements] = CASE WHEN @FunctionalRequirements_Clear = 1 THEN NULL ELSE ISNULL(@FunctionalRequirements, [FunctionalRequirements]) END,
        [TechnicalDesign] = CASE WHEN @TechnicalDesign_Clear = 1 THEN NULL ELSE ISNULL(@TechnicalDesign, [TechnicalDesign]) END,
        [InjectNotes] = ISNULL(@InjectNotes, [InjectNotes]),
        [MaxNotesToInject] = ISNULL(@MaxNotesToInject, [MaxNotesToInject]),
        [NoteInjectionStrategy] = ISNULL(@NoteInjectionStrategy, [NoteInjectionStrategy]),
        [InjectExamples] = ISNULL(@InjectExamples, [InjectExamples]),
        [MaxExamplesToInject] = ISNULL(@MaxExamplesToInject, [MaxExamplesToInject]),
        [ExampleInjectionStrategy] = ISNULL(@ExampleInjectionStrategy, [ExampleInjectionStrategy]),
        [IsRestricted] = ISNULL(@IsRestricted, [IsRestricted]),
        [MessageMode] = ISNULL(@MessageMode, [MessageMode]),
        [MaxMessages] = CASE WHEN @MaxMessages_Clear = 1 THEN NULL ELSE ISNULL(@MaxMessages, [MaxMessages]) END,
        [AttachmentStorageProviderID] = CASE WHEN @AttachmentStorageProviderID_Clear = 1 THEN NULL ELSE ISNULL(@AttachmentStorageProviderID, [AttachmentStorageProviderID]) END,
        [AttachmentRootPath] = CASE WHEN @AttachmentRootPath_Clear = 1 THEN NULL ELSE ISNULL(@AttachmentRootPath, [AttachmentRootPath]) END,
        [InlineStorageThresholdBytes] = CASE WHEN @InlineStorageThresholdBytes_Clear = 1 THEN NULL ELSE ISNULL(@InlineStorageThresholdBytes, [InlineStorageThresholdBytes]) END,
        [AgentTypePromptParams] = CASE WHEN @AgentTypePromptParams_Clear = 1 THEN NULL ELSE ISNULL(@AgentTypePromptParams, [AgentTypePromptParams]) END,
        [ScopeConfig] = CASE WHEN @ScopeConfig_Clear = 1 THEN NULL ELSE ISNULL(@ScopeConfig, [ScopeConfig]) END,
        [NoteRetentionDays] = CASE WHEN @NoteRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@NoteRetentionDays, [NoteRetentionDays]) END,
        [ExampleRetentionDays] = CASE WHEN @ExampleRetentionDays_Clear = 1 THEN NULL ELSE ISNULL(@ExampleRetentionDays, [ExampleRetentionDays]) END,
        [AutoArchiveEnabled] = ISNULL(@AutoArchiveEnabled, [AutoArchiveEnabled]),
        [RerankerConfiguration] = CASE WHEN @RerankerConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@RerankerConfiguration, [RerankerConfiguration]) END,
        [CategoryID] = CASE WHEN @CategoryID_Clear = 1 THEN NULL ELSE ISNULL(@CategoryID, [CategoryID]) END,
        [AllowEphemeralClientTools] = ISNULL(@AllowEphemeralClientTools, [AllowEphemeralClientTools]),
        [DefaultStorageAccountID] = CASE WHEN @DefaultStorageAccountID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultStorageAccountID, [DefaultStorageAccountID]) END,
        [SearchScopeAccess] = ISNULL(@SearchScopeAccess, [SearchScopeAccess]),
        [AcceptUnregisteredFiles] = ISNULL(@AcceptUnregisteredFiles, [AcceptUnregisteredFiles]),
        [DefaultCoAgentID] = CASE WHEN @DefaultCoAgentID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultCoAgentID, [DefaultCoAgentID]) END,
        [TypeConfiguration] = CASE WHEN @TypeConfiguration_Clear = 1 THEN NULL ELSE ISNULL(@TypeConfiguration, [TypeConfiguration]) END,
        [AllowMemoryWrite] = ISNULL(@AllowMemoryWrite, [AllowMemoryWrite]),
        [RecordingDefault] = CASE WHEN @RecordingDefault_Clear = 1 THEN NULL ELSE ISNULL(@RecordingDefault, [RecordingDefault]) END,
        [RecordingStorageProviderID] = CASE WHEN @RecordingStorageProviderID_Clear = 1 THEN NULL ELSE ISNULL(@RecordingStorageProviderID, [RecordingStorageProviderID]) END,
        [DefaultMediaCollectionID] = CASE WHEN @DefaultMediaCollectionID_Clear = 1 THEN NULL ELSE ISNULL(@DefaultMediaCollectionID, [DefaultMediaCollectionID]) END,
        [SupportsPlanMode] = ISNULL(@SupportsPlanMode, [SupportsPlanMode]),
        [AcceptsSkills] = ISNULL(@AcceptsSkills, [AcceptsSkills]),
        [SkillActivationMode] = ISNULL(@SkillActivationMode, [SkillActivationMode]),
        [RequirePlanMode] = ISNULL(@RequirePlanMode, [RequirePlanMode]),
        [ContextWindowMaxTokens] = CASE WHEN @ContextWindowMaxTokens_Clear = 1 THEN NULL ELSE ISNULL(@ContextWindowMaxTokens, [ContextWindowMaxTokens]) END,
        [CompactionTriggerPercent] = CASE WHEN @CompactionTriggerPercent_Clear = 1 THEN NULL ELSE ISNULL(@CompactionTriggerPercent, [CompactionTriggerPercent]) END,
        [CompactionTargetPercent] = CASE WHEN @CompactionTargetPercent_Clear = 1 THEN NULL ELSE ISNULL(@CompactionTargetPercent, [CompactionTargetPercent]) END,
        [ConversationSummaryPromptID] = CASE WHEN @ConversationSummaryPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationSummaryPromptID, [ConversationSummaryPromptID]) END,
        [DeclareActionsAsNativeTools] = ISNULL(@DeclareActionsAsNativeTools, [DeclareActionsAsNativeTools]),
        [MaxSubAgentConsultRounds] = CASE WHEN @MaxSubAgentConsultRounds_Clear = 1 THEN NULL ELSE ISNULL(@MaxSubAgentConsultRounds, [MaxSubAgentConsultRounds]) END,
        [Isolation] = ISNULL(@Isolation, [Isolation]),
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE 1=0
    ELSE
        SELECT * FROM [${flyway:defaultSchema}].[vwAIAgents] WHERE [ID] = @ID
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration]
GO

/* spUpdate Permissions for MJ: AI Agents */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgent] TO [cdp_Developer], [cdp_Integration];

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgent table
------------------------------------------------------------
DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgent];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgent
ON [${flyway:defaultSchema}].[AIAgent]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
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
END;
GO
