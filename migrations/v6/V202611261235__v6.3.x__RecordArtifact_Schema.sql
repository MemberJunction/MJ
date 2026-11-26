-- ============================================================================
-- MJ Docs Unification Phase 0 (P0.1) — Polymorphic RecordArtifact Join Table
-- ============================================================================
-- Additive only:
--   * Creates [${flyway:defaultSchema}].[RecordArtifact] to link any entity record
--     (EntityID + RecordID) to an MJ: Artifacts record with optional pinned version,
--     semantic Role (NOT NULL DEFAULT N'General' for identical SQL Server and
--     PostgreSQL uniqueness semantics), ordering Sequence, ContextDescription,
--     and LinkedByUserID attribution.
--   * Enforces uniqueness on (EntityID, RecordID, ArtifactID, Role) via
--     UQ_RecordArtifact_Record_Artifact_Role and provides composite lookup index
--     IDX_RecordArtifact_Entity_Record on (EntityID, RecordID, Sequence).
--   * Updates [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies] to
--     delete RecordArtifact rows when a referenced Entity is removed.
--
-- CodeGen owns: __mj_CreatedAt/__mj_UpdatedAt, single-column FK indexes
-- (IDX_AUTO_MJ_FKEY_RecordArtifact_*), vwRecordArtifacts, CRUD stored procedures,
-- update triggers, and Entity/EntityField metadata rows.
--
-- Shipped separately as /metadata JSON (NOT in this migration):
--   * Polymorphic FK decoration (EntityIDFieldName = 'EntityID' on
--     MJ: Record Artifacts.RecordID) in metadata/entities/.polymorphic-fk-entity-fields.json.
-- ============================================================================

CREATE TABLE [${flyway:defaultSchema}].[RecordArtifact] (
    [ID]                      UNIQUEIDENTIFIER NOT NULL CONSTRAINT [DF_RecordArtifact_ID] DEFAULT (NEWSEQUENTIALID()),
    [EntityID]                UNIQUEIDENTIFIER NOT NULL,
    [RecordID]                NVARCHAR(700) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL,
    [ArtifactID]              UNIQUEIDENTIFIER NOT NULL,
    [PinnedArtifactVersionID] UNIQUEIDENTIFIER NULL,
    [Role]                    NVARCHAR(100) COLLATE SQL_Latin1_General_CP1_CI_AS NOT NULL CONSTRAINT [DF_RecordArtifact_Role] DEFAULT (N'General'),
    [Sequence]                INT NOT NULL CONSTRAINT [DF_RecordArtifact_Sequence] DEFAULT (0),
    [ContextDescription]      NVARCHAR(MAX) COLLATE SQL_Latin1_General_CP1_CI_AS NULL,
    [LinkedByUserID]          UNIQUEIDENTIFIER NULL,
    CONSTRAINT [PK_RecordArtifact] PRIMARY KEY CLUSTERED ([ID]),
    CONSTRAINT [FK_RecordArtifact_Entity] FOREIGN KEY ([EntityID])
        REFERENCES [${flyway:defaultSchema}].[Entity]([ID]),
    CONSTRAINT [FK_RecordArtifact_Artifact] FOREIGN KEY ([ArtifactID])
        REFERENCES [${flyway:defaultSchema}].[Artifact]([ID]),
    CONSTRAINT [FK_RecordArtifact_PinnedArtifactVersion] FOREIGN KEY ([PinnedArtifactVersionID])
        REFERENCES [${flyway:defaultSchema}].[ArtifactVersion]([ID]),
    CONSTRAINT [FK_RecordArtifact_LinkedByUser] FOREIGN KEY ([LinkedByUserID])
        REFERENCES [${flyway:defaultSchema}].[User]([ID]),
    CONSTRAINT [UQ_RecordArtifact_Record_Artifact_Role] UNIQUE ([EntityID], [RecordID], [ArtifactID], [Role])
);
GO

CREATE NONCLUSTERED INDEX [IDX_RecordArtifact_Entity_Record]
    ON [${flyway:defaultSchema}].[RecordArtifact] ([EntityID], [RecordID], [Sequence]);
GO

-- ============================================================================
-- Extended Properties (Table & Column Descriptions)
-- ============================================================================

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Polymorphic join table linking any MemberJunction entity record (EntityID + RecordID) to an MJ: Artifacts document or asset with semantic Role, ordering Sequence, optional PinnedArtifactVersionID, context notes, and attribution.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordArtifact';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to Entity identifying the type of host record linked to the artifact.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordArtifact',
    @level2type = N'COLUMN', @level2name = N'EntityID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Serialized primary key (compact URL segment for single or composite keys) of the host record in EntityID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordArtifact',
    @level2type = N'COLUMN', @level2name = N'RecordID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Foreign key to Artifact identifying the linked MJ Docs artifact.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordArtifact',
    @level2type = N'COLUMN', @level2name = N'ArtifactID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional foreign key to ArtifactVersion pinning this record link to a specific immutable version instead of floating to latest.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordArtifact',
    @level2type = N'COLUMN', @level2name = N'PinnedArtifactVersionID';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Semantic role of the linked artifact on the host record (for example General, Brief, Spec, Proposal, MeetingNotes, Reference). Non-null with default General for identical SQL Server and PostgreSQL uniqueness semantics.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordArtifact',
    @level2type = N'COLUMN', @level2name = N'Role';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Display sort order for artifacts linked to the same host record (lower numbers appear first).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordArtifact',
    @level2type = N'COLUMN', @level2name = N'Sequence';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional human-readable context note explaining why this artifact is linked to the host record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordArtifact',
    @level2type = N'COLUMN', @level2name = N'ContextDescription';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional foreign key to User identifying who linked this artifact to the host record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RecordArtifact',
    @level2type = N'COLUMN', @level2name = N'LinkedByUserID';
GO

-- =============================================================================
-- spDeleteEntityWithCoreDependencies: add RecordArtifact.EntityID cleanup.
-- Full procedure from V202611231029__v6.3.x__Communications_V2_Schema.sql with
-- RecordArtifact.EntityID added to @Handled and the no-dependents DELETE block.
-- =============================================================================
CREATE OR ALTER PROC [${flyway:defaultSchema}].[spDeleteEntityWithCoreDependencies]
  @EntityID uniqueidentifier
AS
BEGIN
SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Own the transaction only when the caller has none (CodeGen calls in autocommit; a migration
-- runner may already hold one, and its rollback then covers this proc too).
DECLARE @OwnsTransaction bit = 0;
IF @@TRANCOUNT = 0
BEGIN
    BEGIN TRANSACTION;
    SET @OwnsTransaction = 1;
END

BEGIN TRY

    -- ── Precondition: refuse to start if something not covered by the policy points at this entity ──
    -- @Handled is the policy's delete and null references. A reference marked block
    -- (Entity.ParentID), a core table added after this migration, or an FK from an app schema is
    -- reported here, before anything is deleted.
    DECLARE @blockers nvarchar(max) = N'', @probe nvarchar(max) = N'';

    DECLARE @Handled TABLE (Pair nvarchar(400) PRIMARY KEY);
    INSERT INTO @Handled (Pair) VALUES
      (N'AccessControlRule.EntityID'), (N'ActionExecutionLog.TargetEntityID'),
      (N'AIAgentExample.PrimaryScopeEntityID'), (N'AIAgentNote.PrimaryScopeEntityID'),
      (N'AIAgentRun.PrimaryScopeEntityID'), (N'AIAgentSession.LinkedEntityID'),
      (N'ApplicationEntity.EntityID'), (N'ArchiveConfigurationEntity.EntityID'),
      (N'ArchiveRunDetail.EntityID'), (N'Artifact.DelegateEntityID'), (N'AuditLog.EntityID'),
      (N'CalendarEventLink.EntityID'),
      (N'ClusterAnalysis.EntityID'), (N'CompanyIntegrationEntityMap.EntityID'),
      (N'CompanyIntegrationRecordMap.EntityID'), (N'CompanyIntegrationRunDetail.EntityID'),
      (N'ContentSource.EntityID'), (N'Conversation.LinkedEntityID'), (N'DataContextItem.EntityID'),
      (N'DatasetItem.EntityID'), (N'DuplicateRun.EntityID'), (N'EntityAction.EntityID'),
      (N'EntityAction.ScopeEntityID'), (N'EntityAIAction.EntityID'), (N'EntityAIAction.OutputEntityID'),
      (N'EntityAlternateBaseView.EntityID'), (N'EntityCommunicationMessageType.EntityID'),
      (N'EntityDocument.EntityID'), (N'EntityField.EntityID'), (N'EntityField.RelatedEntityID'),
      (N'EntityFormContribution.EntityID'), (N'EntityFormContribution.RelatedEntityID'),
      (N'EntityFormOverride.EntityID'), (N'EntityOrganicKey.EntityID'),
      (N'EntityOrganicKeyRelatedEntity.RelatedEntityID'), (N'EntityPermission.EntityID'),
      (N'EntityRecordDocument.EntityID'), (N'EntityRelationship.EntityID'),
      (N'EntityRelationship.RelatedEntityID'), (N'EntitySetting.EntityID'),
      (N'EntityUniqueKey.EntityID'), (N'FeatureValue.EntityID'),
      (N'FileEntityRecordLink.EntityID'), (N'FormChromeRule.EntityID'),
      (N'FormChromeRule.RelatedEntityID'), (N'GeneratedCode.LinkedEntityID'),
      (N'GraphEdge.SourceEntityID'), (N'GraphEdge.TargetEntityID'), (N'GraphEdgeTypeEndpoint.EntityID'),
      (N'IdentityClaim.EntityID'), (N'IntegrationURLFormat.EntityID'), (N'InteractionLink.EntityID'),
      (N'List.EntityID'), (N'MaterializedResult.GeneratedEntityID'),
      (N'MaterializedResult.SourceEntityID'), (N'MLModelScoringBinding.TargetEntityID'),
      (N'MLScoringRun.ScopeEntityID'), (N'MLTrainingPipeline.TargetEntityID'), (N'ProcessRunDetail.EntityID'), (N'ProcessRun.EntityID'),
      (N'QueryEntity.EntityID'), (N'QueryField.SourceEntityID'),
      (N'RecommendationItem.DestinationEntityID'), (N'Recommendation.SourceEntityID'),
      (N'RecordArtifact.EntityID'),
      (N'RecordChange.EntityID'), (N'RecordCloneLogItem.EntityID'), (N'RecordCloneLog.RootEntityID'),
      (N'RecordGeoCode.EntityID'), (N'RecordLink.SourceEntityID'), (N'RecordLink.TargetEntityID'),
      (N'RecordMergeLog.EntityID'), (N'RecordProcess.EntityID'), (N'RecordProcessWatermark.EntityID'),
      (N'ResourceType.CategoryEntityID'), (N'ResourceType.EntityID'),
      (N'RubricEvaluation.ContextEntityID'), (N'RubricEvaluation.SubjectEntityID'),
      (N'ScopedNotificationConfig.PrimaryScopeEntityID'), (N'ScopedPromptConfig.PrimaryScopeEntityID'),
      (N'ScopedPromptPart.PrimaryScopeEntityID'), (N'SearchScopeEntity.EntityID'),
      (N'SignatureRequest.EntityID'), (N'SystemEvent.EntityID'), (N'TaggedItem.EntityID'),
      (N'TagScope.ScopeEntityID'), (N'TemplateParam.EntityID'), (N'TestRun.TargetLogEntityID'),
      (N'UserApplicationEntity.EntityID'), (N'UserFavorite.EntityID'), (N'User.LinkedEntityID'),
      (N'UserRecordLog.EntityID'), (N'UserViewCategory.EntityID'), (N'UserView.EntityID'),
      (N'VersionLabel.EntityID'), (N'VersionLabelItem.EntityID'),
      (N'CommunicationEndpointPrincipal.EntityID'), (N'CommunicationLog.EntityID'),
      (N'CommunicationPrincipal.EntityID'), (N'CommunicationPrincipalPreference.EntityID'),
      (N'CommunicationSenderType.EntityID'), (N'CommunicationSuppression.EntityID');

    -- FOR XML PATH concatenation is deterministic (the += accumulator idiom is not). Only enabled
    -- NO_ACTION FKs can block the final DELETE; CASCADE / SET NULL / SET DEFAULT and disabled FKs
    -- are cleared or ignored by SQL Server itself.
    SELECT @probe = (
        SELECT DISTINCT
             N' UNION ALL SELECT ''' + REPLACE(SCHEMA_NAME(pt.schema_id) + '.' + pt.name + '.' + pc.name, '''', '''''')
           + N''' WHERE EXISTS (SELECT 1 FROM ' + QUOTENAME(SCHEMA_NAME(pt.schema_id)) + N'.' + QUOTENAME(pt.name)
           + N' WHERE ' + QUOTENAME(pc.name) + N' = @EntityID)'
        FROM sys.foreign_keys fk
        JOIN sys.tables rt ON rt.object_id = fk.referenced_object_id
             AND rt.name = 'Entity' AND SCHEMA_NAME(rt.schema_id) = '${flyway:defaultSchema}'
        JOIN sys.tables pt ON pt.object_id = fk.parent_object_id
        JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
        JOIN sys.columns pc ON pc.object_id = pt.object_id AND pc.column_id = fkc.parent_column_id
        WHERE fk.delete_referential_action = 0
          AND fk.is_disabled = 0
          AND NOT (SCHEMA_NAME(pt.schema_id) = '${flyway:defaultSchema}'
                   AND pt.name + '.' + pc.name IN (SELECT Pair FROM @Handled))
        FOR XML PATH(''), TYPE
    ).value('.', 'nvarchar(max)');

    IF LEN(ISNULL(@probe, N'')) > 0
    BEGIN
        DECLARE @found TABLE (Ref nvarchar(400));
        SET @probe = N'SELECT Ref FROM (SELECT CAST(NULL AS nvarchar(400)) Ref WHERE 1=0' + @probe + N') q;';
        INSERT INTO @found (Ref) EXEC sp_executesql @probe, N'@EntityID uniqueidentifier', @EntityID = @EntityID;

        SELECT @blockers = STUFF((SELECT N', ' + Ref FROM @found ORDER BY Ref FOR XML PATH(''), TYPE).value('.', 'nvarchar(max)'), 1, 2, N'');

        IF @blockers IS NOT NULL AND @blockers <> N''
        BEGIN
            DECLARE @msg nvarchar(2048) = N'Cannot delete entity ' + CAST(@EntityID AS nvarchar(50))
                + N': rows still reference it through foreign keys this procedure does not clear ('
                + LEFT(@blockers, 1600) + N'). Clear them first. Nothing has been deleted.';
            THROW 50000, @msg, 1;
        END
    END

    -- ── Rows this proc deletes that other rows can reference: capture their IDs up front ──
    -- (Taken before any delete, so every child statement below sees the full parent set.)
    DECLARE @EntityFieldIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @EntityFieldIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = @EntityID;

    DECLARE @UserViewIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @UserViewIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[UserView] WHERE [EntityID] = @EntityID;

    DECLARE @UserViewCategoryIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @UserViewCategoryIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[UserViewCategory] WHERE [EntityID] = @EntityID;

    DECLARE @UserViewRunIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @UserViewRunIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[UserViewRun] WHERE [UserViewID] IN (SELECT ID FROM @UserViewIDs);

    DECLARE @ListIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @ListIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[List] WHERE [EntityID] = @EntityID;

    DECLARE @EntityDocumentIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @EntityDocumentIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityDocument] WHERE [EntityID] = @EntityID;

    DECLARE @EntityRecordDocumentIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @EntityRecordDocumentIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityRecordDocument]
        WHERE [EntityID] = @EntityID OR [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);

    DECLARE @DuplicateRunIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @DuplicateRunIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[DuplicateRun]
        WHERE [EntityID] = @EntityID OR [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);

    DECLARE @DuplicateRunDetailIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @DuplicateRunDetailIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[DuplicateRunDetail]
        WHERE [DuplicateRunID] IN (SELECT ID FROM @DuplicateRunIDs);

    DECLARE @EntityActionIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @EntityActionIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityAction]
        WHERE [EntityID] = @EntityID OR [ScopeEntityID] = @EntityID;

    DECLARE @AlternateBaseViewIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @AlternateBaseViewIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityAlternateBaseView] WHERE [EntityID] = @EntityID;

    DECLARE @MessageTypeIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @MessageTypeIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityCommunicationMessageType] WHERE [EntityID] = @EntityID;

    -- Communications V2: rows keyed to a record of this entity
    DECLARE @CommsPrincipalIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @CommsPrincipalIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[CommunicationPrincipal] WHERE [EntityID] = @EntityID;

    DECLARE @CommsPreferenceIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @CommsPreferenceIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[CommunicationPrincipalPreference] WHERE [EntityID] = @EntityID;

    DECLARE @CommsSuppressionIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    -- Only principal-only suppressions go with the entity. A suppression that also names an endpoint
    -- (a hard bounce or spam complaint recorded against a principal) keeps blocking that address.
    INSERT INTO @CommsSuppressionIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[CommunicationSuppression]
        WHERE [EntityID] = @EntityID AND [CommunicationEndpointID] IS NULL;

    DECLARE @OrganicKeyIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @OrganicKeyIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[EntityOrganicKey] WHERE [EntityID] = @EntityID;

    DECLARE @IntegrationEntityMapIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @IntegrationEntityMapIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] WHERE [EntityID] = @EntityID;

    DECLARE @IntegrationRunDetailIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @IntegrationRunDetailIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] WHERE [EntityID] = @EntityID;

    DECLARE @PipelineIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @PipelineIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingPipeline] WHERE [TargetEntityID] = @EntityID;

    DECLARE @MLModelIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @MLModelIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[MLModel] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);

    DECLARE @ProcessRunDetailIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @ProcessRunDetailIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[ProcessRunDetail] WHERE [EntityID] = @EntityID;

    DECLARE @RecommendationIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RecommendationIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[Recommendation] WHERE [SourceEntityID] = @EntityID;

    DECLARE @RecordCloneLogIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RecordCloneLogIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[RecordCloneLog] WHERE [RootEntityID] = @EntityID;

    DECLARE @RecordMergeLogIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RecordMergeLogIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[RecordMergeLog] WHERE [EntityID] = @EntityID;

    DECLARE @RecordProcessIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RecordProcessIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[RecordProcess] WHERE [EntityID] = @EntityID;

    DECLARE @RubricEvaluationIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @RubricEvaluationIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[RubricEvaluation] WHERE [SubjectEntityID] = @EntityID;

    DECLARE @ResourceTypeIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @ResourceTypeIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[ResourceType] WHERE [EntityID] = @EntityID;

    DECLARE @AgentNoteIDs TABLE (ID uniqueidentifier PRIMARY KEY);
    INSERT INTO @AgentNoteIDs (ID) SELECT ID FROM [${flyway:defaultSchema}].[AIAgentNote] WHERE [PrimaryScopeEntityID] = @EntityID;

    -- RecordChange can be large, so its doomed set stays a subquery instead of a table variable.

    -- ── Nullable references to this entity: cleared, the rows survive ──
    UPDATE [${flyway:defaultSchema}].[ActionExecutionLog] SET [TargetEntityID] = NULL WHERE [TargetEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[AIAgentRun] SET [PrimaryScopeEntityID] = NULL WHERE [PrimaryScopeEntityID] = @EntityID;
    -- CK_AIAgentSession_LinkBinding / CK_Conversation_LinkBinding / CK_Artifact_DelegateBinding: both columns or neither
    UPDATE [${flyway:defaultSchema}].[AIAgentSession] SET [LinkedEntityID] = NULL, [LinkedRecordID] = NULL WHERE [LinkedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[Artifact] SET [DelegateEntityID] = NULL, [DelegateRecordID] = NULL WHERE [DelegateEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[AuditLog] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[ClusterAnalysis] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    -- CK_CommunicationLog_PrincipalPair: EntityID and RecordID are set together or not at all
    UPDATE [${flyway:defaultSchema}].[CommunicationLog] SET [EntityID] = NULL, [RecordID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[CommunicationSenderType] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[ContentSource] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    -- CK_Conversation_LinkBinding / CK_Conversation_AnchorLinkBinding: clear LinkedRecordID and anchor columns with LinkedEntityID
    UPDATE [${flyway:defaultSchema}].[Conversation] SET [LinkedEntityID] = NULL, [LinkedRecordID] = NULL, [AnchorType] = NULL, [AnchorKey] = NULL, [AnchorMetadata] = NULL WHERE [LinkedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[DataContextItem] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    -- Other entities' fields that point AT this entity (#3561)
    UPDATE [${flyway:defaultSchema}].[EntityField] SET [RelatedEntityID] = NULL WHERE [RelatedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[GeneratedCode] SET [LinkedEntityID] = NULL WHERE [LinkedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[IdentityClaim] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[MaterializedResult] SET [GeneratedEntityID] = NULL WHERE [GeneratedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[MaterializedResult] SET [SourceEntityID] = NULL WHERE [SourceEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[MLModelScoringBinding] SET [TargetEntityID] = NULL WHERE [TargetEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[ProcessRun] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[QueryField] SET [SourceEntityID] = NULL WHERE [SourceEntityID] = @EntityID;
    -- ResourceType references Entity twice; EntityID is a delete (below), CategoryEntityID is cleared (#4483)
    UPDATE [${flyway:defaultSchema}].[ResourceType] SET [CategoryEntityID] = NULL WHERE [CategoryEntityID] = @EntityID;
    -- CK_RubricEvaluation_ContextPair: both columns or neither
    UPDATE [${flyway:defaultSchema}].[RubricEvaluation] SET [ContextEntityID] = NULL, [ContextRecordID] = NULL WHERE [ContextEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[SignatureRequest] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    -- SystemEvent has a physical FK but no entity, so generated metadata does not list it
    UPDATE [${flyway:defaultSchema}].[SystemEvent] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[TemplateParam] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[TestRun] SET [TargetLogEntityID] = NULL WHERE [TargetLogEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[User] SET [LinkedEntityID] = NULL WHERE [LinkedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[VersionLabel] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;

    -- ── Nullable references to rows deleted below: cleared first ──
    UPDATE [${flyway:defaultSchema}].[AIAgentNote] SET [ConsolidatedIntoNoteID] = NULL WHERE [ConsolidatedIntoNoteID] IN (SELECT ID FROM @AgentNoteIDs);
    UPDATE [${flyway:defaultSchema}].[ErrorLog] SET [CompanyIntegrationRunDetailID] = NULL WHERE [CompanyIntegrationRunDetailID] IN (SELECT ID FROM @IntegrationRunDetailIDs);
    UPDATE [${flyway:defaultSchema}].[ActionExecutionLog] SET [EntityActionID] = NULL WHERE [EntityActionID] IN (SELECT ID FROM @EntityActionIDs);
    UPDATE [${flyway:defaultSchema}].[EntityCommunicationMessageType] SET [CommunicationPrincipalID] = NULL WHERE [CommunicationPrincipalID] IN (SELECT ID FROM @CommsPrincipalIDs);
    UPDATE [${flyway:defaultSchema}].[EntityAlternateBaseView] SET [ParentID] = NULL WHERE [ParentID] IN (SELECT ID FROM @AlternateBaseViewIDs);
    UPDATE [${flyway:defaultSchema}].[QueryEntity] SET [AlternateBaseViewID] = NULL WHERE [AlternateBaseViewID] IN (SELECT ID FROM @AlternateBaseViewIDs);
    UPDATE [${flyway:defaultSchema}].[ContentSource] SET [EntityDocumentID] = NULL WHERE [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);
    UPDATE [${flyway:defaultSchema}].[ContentItem] SET [EntityRecordDocumentID] = NULL WHERE [EntityRecordDocumentID] IN (SELECT ID FROM @EntityRecordDocumentIDs);
    UPDATE [${flyway:defaultSchema}].[DuplicateRun] SET [SourceListID] = NULL WHERE [SourceListID] IN (SELECT ID FROM @ListIDs);
    UPDATE [${flyway:defaultSchema}].[RecordProcess] SET [ScopeListID] = NULL WHERE [ScopeListID] IN (SELECT ID FROM @ListIDs);
    UPDATE [${flyway:defaultSchema}].[MLTrainingRun] SET [ResultingModelID] = NULL WHERE [ResultingModelID] IN (SELECT ID FROM @MLModelIDs);
    UPDATE [${flyway:defaultSchema}].[FeatureValue] SET [ProcessRunDetailID] = NULL WHERE [ProcessRunDetailID] IN (SELECT ID FROM @ProcessRunDetailIDs);
    UPDATE [${flyway:defaultSchema}].[RecordChange] SET [RestoredFromID] = NULL
        WHERE [RestoredFromID] IN (SELECT ID FROM [${flyway:defaultSchema}].[RecordChange] WHERE [EntityID] = @EntityID);
    UPDATE [${flyway:defaultSchema}].[DuplicateRunDetailMatch] SET [RecordMergeLogID] = NULL WHERE [RecordMergeLogID] IN (SELECT ID FROM @RecordMergeLogIDs);
    UPDATE [${flyway:defaultSchema}].[FeatureValueCache] SET [RecordProcessID] = NULL WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    UPDATE [${flyway:defaultSchema}].[MLModelScoringBinding] SET [RecordProcessID] = NULL WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    UPDATE [${flyway:defaultSchema}].[ProcessRun] SET [RecordProcessID] = NULL WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    UPDATE [${flyway:defaultSchema}].[MagicLinkInvite] SET [ResourceTypeID] = NULL WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    UPDATE [${flyway:defaultSchema}].[UserNotification] SET [ResourceTypeID] = NULL WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    UPDATE [${flyway:defaultSchema}].[RubricEvaluation] SET [SupersedesEvaluationID] = NULL WHERE [SupersedesEvaluationID] IN (SELECT ID FROM @RubricEvaluationIDs);
    UPDATE [${flyway:defaultSchema}].[UserView] SET [CategoryID] = NULL WHERE [CategoryID] IN (SELECT ID FROM @UserViewCategoryIDs);
    UPDATE [${flyway:defaultSchema}].[UserViewCategory] SET [ParentID] = NULL WHERE [ParentID] IN (SELECT ID FROM @UserViewCategoryIDs);
    UPDATE [${flyway:defaultSchema}].[DataContextItem] SET [ViewID] = NULL WHERE [ViewID] IN (SELECT ID FROM @UserViewIDs);
    UPDATE [${flyway:defaultSchema}].[EntityRelationship] SET [DisplayUserViewID] = NULL WHERE [DisplayUserViewID] IN (SELECT ID FROM @UserViewIDs);
    UPDATE [${flyway:defaultSchema}].[List] SET [SourceViewID] = NULL WHERE [SourceViewID] IN (SELECT ID FROM @UserViewIDs);
    UPDATE [${flyway:defaultSchema}].[RecordProcess] SET [ScopeViewID] = NULL WHERE [ScopeViewID] IN (SELECT ID FROM @UserViewIDs);

    -- ── Deletes, children before parents ──

    -- Entity fields: values and permissions first; the EntityField rows go last, just before Entity
    DELETE FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [EntityFieldID] IN (SELECT ID FROM @EntityFieldIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityFieldPermission] WHERE [EntityFieldID] IN (SELECT ID FROM @EntityFieldIDs);
    UPDATE [${flyway:defaultSchema}].[QueryField] SET [SourceEntityFieldID] = NULL WHERE [SourceEntityFieldID] IN (SELECT ID FROM @EntityFieldIDs);

    -- Saved-view run history
    DELETE FROM [${flyway:defaultSchema}].[UserViewRunDetail] WHERE [UserViewRunID] IN (SELECT ID FROM @UserViewRunIDs);
    DELETE FROM [${flyway:defaultSchema}].[UserViewRun] WHERE [UserViewID] IN (SELECT ID FROM @UserViewIDs);

    -- Lists
    DELETE FROM [${flyway:defaultSchema}].[ListDetail] WHERE [ListID] IN (SELECT ID FROM @ListIDs);
    DELETE FROM [${flyway:defaultSchema}].[ListInvitation] WHERE [ListID] IN (SELECT ID FROM @ListIDs);
    DELETE FROM [${flyway:defaultSchema}].[ListShare] WHERE [ListID] IN (SELECT ID FROM @ListIDs);
    DELETE FROM [${flyway:defaultSchema}].[List] WHERE [EntityID] = @EntityID;

    -- Duplicate detection (a run is tied to the entity directly or through its entity document)
    DELETE FROM [${flyway:defaultSchema}].[DuplicateRunDetailMatch] WHERE [DuplicateRunDetailID] IN (SELECT ID FROM @DuplicateRunDetailIDs);
    DELETE FROM [${flyway:defaultSchema}].[DuplicateRunDetail] WHERE [DuplicateRunID] IN (SELECT ID FROM @DuplicateRunIDs);
    DELETE FROM [${flyway:defaultSchema}].[DuplicateRun] WHERE [EntityID] = @EntityID OR [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);

    -- Entity documents
    DELETE FROM [${flyway:defaultSchema}].[EntityDocumentRun] WHERE [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityDocumentSetting] WHERE [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityRecordDocument] WHERE [EntityID] = @EntityID OR [EntityDocumentID] IN (SELECT ID FROM @EntityDocumentIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityDocument] WHERE [EntityID] = @EntityID;

    -- Entity actions (on this entity, or scoped to one of its records)
    DELETE FROM [${flyway:defaultSchema}].[EntityActionFilter] WHERE [EntityActionID] IN (SELECT ID FROM @EntityActionIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityActionInvocation] WHERE [EntityActionID] IN (SELECT ID FROM @EntityActionIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityActionParam] WHERE [EntityActionID] IN (SELECT ID FROM @EntityActionIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityAction] WHERE [EntityID] = @EntityID OR [ScopeEntityID] = @EntityID;

    -- Communication message types
    DELETE FROM [${flyway:defaultSchema}].[EntityCommunicationField] WHERE [EntityCommunicationMessageTypeID] IN (SELECT ID FROM @MessageTypeIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityCommunicationMessageType] WHERE [EntityID] = @EntityID;

    -- Communications V2. Preferences and principal-only suppressions record a choice made by a
    -- record of this entity, so they go with it, and so do the consent audit rows that point at
    -- them (an audit row must reference exactly one of the two: CK_CommunicationConsentAuditLog_OneSubject).
    -- A suppression that also names an endpoint is kept, with its principal link cleared, so the
    -- address stays blocked; its consent audit rows are kept with it.
    -- trgCommunicationConsentAuditLog_AppendOnly refuses audit deletes unless this session key is set.
    EXEC sp_set_session_context @key = N'MJ.CommsAuditErase', @value = 1;
    DELETE FROM [${flyway:defaultSchema}].[CommunicationConsentAuditLog]
        WHERE [CommunicationPrincipalPreferenceID] IN (SELECT ID FROM @CommsPreferenceIDs)
           OR [CommunicationSuppressionID] IN (SELECT ID FROM @CommsSuppressionIDs);
    EXEC sp_set_session_context @key = N'MJ.CommsAuditErase', @value = NULL;
    DELETE FROM [${flyway:defaultSchema}].[CommunicationPrincipalPreference] WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[CommunicationSuppression] SET [EntityID] = NULL, [RecordID] = NULL
        WHERE [EntityID] = @EntityID AND [CommunicationEndpointID] IS NOT NULL;
    DELETE FROM [${flyway:defaultSchema}].[CommunicationSuppression] WHERE [EntityID] = @EntityID AND [CommunicationEndpointID] IS NULL;
    DELETE FROM [${flyway:defaultSchema}].[CommunicationEndpointPrincipal] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[CommunicationPrincipal] WHERE [EntityID] = @EntityID;

    -- Organic keys
    DELETE FROM [${flyway:defaultSchema}].[EntityOrganicKeyRelatedEntity] WHERE [RelatedEntityID] = @EntityID OR [EntityOrganicKeyID] IN (SELECT ID FROM @OrganicKeyIDs);
    DELETE FROM [${flyway:defaultSchema}].[EntityOrganicKey] WHERE [EntityID] = @EntityID;

    -- Company integrations
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationFieldMap] WHERE [EntityMapID] IN (SELECT ID FROM @IntegrationEntityMapIDs);
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationSyncWatermark] WHERE [EntityMapID] IN (SELECT ID FROM @IntegrationEntityMapIDs);
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationEntityMap] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationRecordMap] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] WHERE [EntityID] = @EntityID;

    -- ML pipelines targeting this entity, their models, runs and scoring bindings
    -- the serving ledger: the models' publish records and the runs' run-level refusals (ModelID NULL) are deleted; a
    -- surviving record that consumed one of their sign-offs, replaced one of the models or names one of the runs loses
    -- only the link.
    -- the only mutation of a publish record: spDeleteEntityWithCoreDependencies clears SignOffID/ReplacesModelID when the referenced row is removed with its entity
    UPDATE [${flyway:defaultSchema}].[MLModelPublishRecord] SET [SignOffID] = NULL WHERE [SignOffID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLModelPublishRecord] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs) OR ([ModelID] IS NULL AND [TrainingRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs))));
    UPDATE [${flyway:defaultSchema}].[MLModelPublishRecord] SET [ReplacesModelID] = NULL WHERE [ReplacesModelID] IN (SELECT ID FROM @MLModelIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLModelPublishRecord] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs) OR ([ModelID] IS NULL AND [TrainingRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs)));
    -- the rows left that name one of the runs have a ModelID, so clearing TrainingRunID keeps CK_MLModelPublishRecord_Subject
    UPDATE [${flyway:defaultSchema}].[MLModelPublishRecord] SET [TrainingRunID] = NULL WHERE [TrainingRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs));
    -- another pipeline's model that names one of these runs or snapshots loses only the lineage link
    UPDATE [${flyway:defaultSchema}].[MLModel] SET [TrainingRunID] = NULL WHERE [TrainingRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs));
    UPDATE [${flyway:defaultSchema}].[MLModel] SET [TrainingSnapshotID] = NULL WHERE [TrainingSnapshotID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingSnapshot] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs));
    -- the models' predictions are deleted before MLModelID is cleared on any other Feature Value
    DELETE FROM [${flyway:defaultSchema}].[FeatureValue] WHERE [Source] = N'Model' AND [MLModelID] IN (SELECT ID FROM @MLModelIDs);
    UPDATE [${flyway:defaultSchema}].[FeatureValue] SET [MLModelID] = NULL WHERE [MLModelID] IN (SELECT ID FROM @MLModelIDs);
    -- output bindings, scoring runs (CK_MLScoringRun_Model forbids clearing a run's model) and monitoring results
    DELETE FROM [${flyway:defaultSchema}].[MLOutputBinding] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs);
    DELETE FROM [${flyway:defaultSchema}].[FeatureValue] WHERE [MLScoringRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLScoringRun] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs));
    DELETE FROM [${flyway:defaultSchema}].[MLScoringRun] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs);
    UPDATE [${flyway:defaultSchema}].[MLScoringRun] SET [MLModelScoringBindingID] = NULL WHERE [MLModelScoringBindingID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLModelScoringBinding] WHERE [MLTrainingPipelineID] IN (SELECT ID FROM @PipelineIDs));
    DELETE FROM [${flyway:defaultSchema}].[MLMonitoringResult] WHERE [ModelID] IN (SELECT ID FROM @MLModelIDs);
    UPDATE [${flyway:defaultSchema}].[MLMonitoringResult] SET [ChallengerRunID] = NULL WHERE [ChallengerRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs));
    DELETE FROM [${flyway:defaultSchema}].[FeatureValue] WHERE [MLModelScoringBindingID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLModelScoringBinding] WHERE [MLTrainingPipelineID] IN (SELECT ID FROM @PipelineIDs));
    DELETE FROM [${flyway:defaultSchema}].[MLModelScoringBinding] WHERE [MLTrainingPipelineID] IN (SELECT ID FROM @PipelineIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLModel] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);
    -- the pipelines' training snapshots; a run of another pipeline that names one loses only the link
    UPDATE [${flyway:defaultSchema}].[MLTrainingRun] SET [TrainingSnapshotID] = NULL WHERE [TrainingSnapshotID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLTrainingSnapshot] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs));
    DELETE FROM [${flyway:defaultSchema}].[MLTrainingSnapshot] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLTrainingPipeline] WHERE [TargetEntityID] = @EntityID;
    -- scoring runs scoped to this entity, whatever model they ran (ScopeEntityID is NOT NULL)
    DELETE FROM [${flyway:defaultSchema}].[FeatureValue] WHERE [MLScoringRunID] IN (SELECT ID FROM [${flyway:defaultSchema}].[MLScoringRun] WHERE [ScopeEntityID] = @EntityID);
    DELETE FROM [${flyway:defaultSchema}].[MLScoringRun] WHERE [ScopeEntityID] = @EntityID;

    -- Record processes and feature values
    DELETE FROM [${flyway:defaultSchema}].[FeatureValue] WHERE [EntityID] = @EntityID OR [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    DELETE FROM [${flyway:defaultSchema}].[FeaturePipelineVersion] WHERE [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    DELETE FROM [${flyway:defaultSchema}].[RecordProcessWatermark] WHERE [EntityID] = @EntityID OR [RecordProcessID] IN (SELECT ID FROM @RecordProcessIDs);
    DELETE FROM [${flyway:defaultSchema}].[RecordProcess] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ProcessRunDetail] WHERE [EntityID] = @EntityID;

    -- Recommendations
    DELETE FROM [${flyway:defaultSchema}].[RecommendationItem] WHERE [DestinationEntityID] = @EntityID OR [RecommendationID] IN (SELECT ID FROM @RecommendationIDs);
    DELETE FROM [${flyway:defaultSchema}].[Recommendation] WHERE [SourceEntityID] = @EntityID;

    -- Record history: version labels, changes, clone and merge logs
    DELETE FROM [${flyway:defaultSchema}].[VersionLabelItem] WHERE [EntityID] = @EntityID
        OR [RecordChangeID] IN (SELECT ID FROM [${flyway:defaultSchema}].[RecordChange] WHERE [EntityID] = @EntityID);
    DELETE FROM [${flyway:defaultSchema}].[RecordChange] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[RecordCloneLogItem] WHERE [EntityID] = @EntityID OR [RecordCloneLogID] IN (SELECT ID FROM @RecordCloneLogIDs);
    DELETE FROM [${flyway:defaultSchema}].[RecordCloneLog] WHERE [RootEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[RecordMergeDeletionLog] WHERE [RecordMergeLogID] IN (SELECT ID FROM @RecordMergeLogIDs);
    DELETE FROM [${flyway:defaultSchema}].[RecordMergeLog] WHERE [EntityID] = @EntityID;

    -- Rubric evaluations of this entity's records
    DELETE FROM [${flyway:defaultSchema}].[RubricEvaluationScore] WHERE [EvaluationID] IN (SELECT ID FROM @RubricEvaluationIDs);
    DELETE FROM [${flyway:defaultSchema}].[RubricEvaluation] WHERE [SubjectEntityID] = @EntityID;

    -- Resource types for this entity, with their links, permissions and workspace items
    DELETE FROM [${flyway:defaultSchema}].[ResourceLink] WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    DELETE FROM [${flyway:defaultSchema}].[ResourcePermission] WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    DELETE FROM [${flyway:defaultSchema}].[WorkspaceItem] WHERE [ResourceTypeID] IN (SELECT ID FROM @ResourceTypeIDs);
    DELETE FROM [${flyway:defaultSchema}].[ResourceType] WHERE [EntityID] = @EntityID;

    -- Scope columns whose NULL means "global": delete rather than widen the scope
    DELETE FROM [${flyway:defaultSchema}].[AIAgentNote] WHERE [PrimaryScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[AIAgentExample] WHERE [PrimaryScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ScopedNotificationConfig] WHERE [PrimaryScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ScopedPromptConfig] WHERE [PrimaryScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ScopedPromptPart] WHERE [PrimaryScopeEntityID] = @EntityID;

    -- Datasets: bump the parent so cached datasets refresh, then drop the item
    UPDATE [${flyway:defaultSchema}].[Dataset] SET [__mj_UpdatedAt] = GETUTCDATE()
        WHERE [ID] IN (SELECT [DatasetID] FROM [${flyway:defaultSchema}].[DatasetItem] WHERE [EntityID] = @EntityID);
    DELETE FROM [${flyway:defaultSchema}].[DatasetItem] WHERE [EntityID] = @EntityID;

    -- Saved views, then their categories (UserView.CategoryID was cleared above)
    DELETE FROM [${flyway:defaultSchema}].[UserView] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[UserViewCategory] WHERE [EntityID] = @EntityID;

    -- Rows with no dependents of their own
    DELETE FROM [${flyway:defaultSchema}].[AccessControlRule] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ArchiveConfigurationEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[ArchiveRunDetail] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[CalendarEventLink] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityAIAction] WHERE [EntityID] = @EntityID OR [OutputEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityAlternateBaseView] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityFormContribution] WHERE [EntityID] = @EntityID OR [RelatedEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityFormOverride] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityPermission] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [EntityID] = @EntityID OR [RelatedEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[EntityUniqueKey] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[FileEntityRecordLink] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[FormChromeRule] WHERE [EntityID] = @EntityID OR [RelatedEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[GraphEdge] WHERE [SourceEntityID] = @EntityID OR [TargetEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[IntegrationURLFormat] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[InteractionLink] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[QueryEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[RecordArtifact] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[RecordGeoCode] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[RecordLink] WHERE [SourceEntityID] = @EntityID OR [TargetEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[SearchScopeEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[TaggedItem] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[TagScope] WHERE [ScopeEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[UserApplicationEntity] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[UserFavorite] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[UserRecordLog] WHERE [EntityID] = @EntityID;

    -- The entity's own fields, then the entity
    DELETE FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[Entity] WHERE [ID] = @EntityID;

    IF @OwnsTransaction = 1 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    -- Never leave the audit-erase key set on a pooled connection.
    EXEC sp_set_session_context @key = N'MJ.CommsAuditErase', @value = NULL;
    IF @OwnsTransaction = 1 AND @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH
END
GO






















































/* ============================================================================ */
/* GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND                    */
/*                                                                              */
/* Everything below this banner was emitted by `mj codegen --skipfiles` for     */
/* `[${flyway:defaultSchema}].[RecordArtifact]` (entity `MJ: Record Artifacts`): */
/* Entity + ApplicationEntity + EntityPermission rows, __mj_CreatedAt /         */
/* __mj_UpdatedAt columns, EntityField inserts (apply-time MAX(Sequence)+1),    */
/* EntityUniqueKey, EntityRelationships, FK indexes (IDX_AUTO_MJ_FKEY_*),       */
/* vwRecordArtifacts, spCreate/spUpdate/spDeleteRecordArtifact, trgUpdate,      */
/* and grants. Unrelated fresh-install regenerations for pre-existing entities  */
/* (spDeleteAIAgent/AIPrompt/Application/Conversation and SubtypeSelector       */
/* updates) were excluded per migrations/CLAUDE.md.                             */
/*                                                                              */
/* If the hand-written DDL above changes, re-run CodeGen and replace this       */
/* entire generated section.                                                    */
/* ============================================================================ */

/* SQL generated to create new entity MJ: Record Artifacts */

      INSERT INTO [${flyway:defaultSchema}].[Entity] (
         [ID],
         [Name],
         [DisplayName],
         [Description],
         [NameSuffix],
         [BaseTable],
         [BaseView],
         [SchemaName],
         [IncludeInAPI],
         [AllowUserSearchAPI],
         [AllowCaching],
         [TrackRecordChanges],
         [AuditRecordAccess],
         [AuditViewRuns],
         [AllowAllRowsAPI],
         [AllowCreateAPI],
         [AllowUpdateAPI],
         [AllowDeleteAPI],
         [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'e70cb104-6ddb-4590-938b-988d5eccba80',
         'MJ: Record Artifacts',
         'Record Artifacts',
         'Polymorphic join table linking any MemberJunction entity record (EntityID + RecordID) to an MJ: Artifacts document or asset with semantic Role, ordering Sequence, optional PinnedArtifactVersionID, context notes, and attribution.',
         NULL,
         'RecordArtifact',
         'vwRecordArtifacts',
         '${flyway:defaultSchema}',
         1,
         1,
         1,
         1,
         0,
         0,
         0,
         1,
         1,
         1,
         1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add entity MJ: Record Artifacts to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                    ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                    ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'e70cb104-6ddb-4590-938b-988d5eccba80', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: Record Artifacts for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('e70cb104-6ddb-4590-938b-988d5eccba80' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('e70cb104-6ddb-4590-938b-988d5eccba80' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Record Artifacts for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('e70cb104-6ddb-4590-938b-988d5eccba80' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('e70cb104-6ddb-4590-938b-988d5eccba80' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: Record Artifacts for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('e70cb104-6ddb-4590-938b-988d5eccba80' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('e70cb104-6ddb-4590-938b-988d5eccba80' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordArtifact */
ALTER TABLE [${flyway:defaultSchema}].[RecordArtifact] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordArtifact */
UPDATE [${flyway:defaultSchema}].[RecordArtifact] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordArtifact */
ALTER TABLE [${flyway:defaultSchema}].[RecordArtifact] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RecordArtifact */
ALTER TABLE [${flyway:defaultSchema}].[RecordArtifact] ADD CONSTRAINT [DF___mj_RecordArtifact___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordArtifact */
ALTER TABLE [${flyway:defaultSchema}].[RecordArtifact] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordArtifact */
UPDATE [${flyway:defaultSchema}].[RecordArtifact] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordArtifact */
ALTER TABLE [${flyway:defaultSchema}].[RecordArtifact] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RecordArtifact */
ALTER TABLE [${flyway:defaultSchema}].[RecordArtifact] ADD CONSTRAINT [DF___mj_RecordArtifact___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 11 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8c102b38-7274-450b-ac9f-eae2aeafda5c' OR (EntityID = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND Name = 'ID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '8c102b38-7274-450b-ac9f-eae2aeafda5c',
            'E70CB104-6DDB-4590-938B-988D5ECCBA80', -- Entity: MJ: Record Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80'),
            'ID',
            'ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'newsequentialid()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '349ac6bb-c74b-4f7e-ad6f-fe31e3812d61' OR (EntityID = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND Name = 'EntityID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '349ac6bb-c74b-4f7e-ad6f-fe31e3812d61',
            'E70CB104-6DDB-4590-938B-988D5ECCBA80', -- Entity: MJ: Record Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80'),
            'EntityID',
            'Entity ID',
            'Foreign key to Entity identifying the type of host record linked to the artifact.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'E0238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'b0dcd9a7-eff1-4c63-8e0c-7ede33aa8ceb' OR (EntityID = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND Name = 'RecordID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'b0dcd9a7-eff1-4c63-8e0c-7ede33aa8ceb',
            'E70CB104-6DDB-4590-938B-988D5ECCBA80', -- Entity: MJ: Record Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80'),
            'RecordID',
            'Record ID',
            'Serialized primary key (compact URL segment for single or composite keys) of the host record in EntityID.',
            'nvarchar',
            1400,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            1,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '13e09997-ae2f-4678-b659-b02688bcc650' OR (EntityID = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND Name = 'ArtifactID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '13e09997-ae2f-4678-b659-b02688bcc650',
            'E70CB104-6DDB-4590-938B-988D5ECCBA80', -- Entity: MJ: Record Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80'),
            'ArtifactID',
            'Artifact ID',
            'Foreign key to Artifact identifying the linked MJ Docs artifact.',
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            NULL,
            0,
            1,
            0,
            0,
            'F48D2341-8667-40BB-BCA8-87D7F80E16CD',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '4c656e5d-0b40-4c9a-8b53-24a8ee62a65c' OR (EntityID = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND Name = 'PinnedArtifactVersionID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '4c656e5d-0b40-4c9a-8b53-24a8ee62a65c',
            'E70CB104-6DDB-4590-938B-988D5ECCBA80', -- Entity: MJ: Record Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80'),
            'PinnedArtifactVersionID',
            'Pinned Artifact Version ID',
            'Optional foreign key to ArtifactVersion pinning this record link to a specific immutable version instead of floating to latest.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0f86a3e7-8aaa-4598-97f6-4cc836390d8b' OR (EntityID = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND Name = 'Role')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '0f86a3e7-8aaa-4598-97f6-4cc836390d8b',
            'E70CB104-6DDB-4590-938B-988D5ECCBA80', -- Entity: MJ: Record Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80'),
            'Role',
            'Role',
            'Semantic role of the linked artifact on the host record (for example General, Brief, Spec, Proposal, MeetingNotes, Reference). Non-null with default General for identical SQL Server and PostgreSQL uniqueness semantics.',
            'nvarchar',
            200,
            0,
            0,
            0,
            'General',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6dce71d3-29bc-45b5-a3dc-fb7c66eb9cc6' OR (EntityID = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND Name = 'Sequence')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6dce71d3-29bc-45b5-a3dc-fb7c66eb9cc6',
            'E70CB104-6DDB-4590-938B-988D5ECCBA80', -- Entity: MJ: Record Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80'),
            'Sequence',
            'Sequence',
            'Display sort order for artifacts linked to the same host record (lower numbers appear first).',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c1c672a3-bd33-4b11-a694-d920c13eccb6' OR (EntityID = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND Name = 'ContextDescription')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'c1c672a3-bd33-4b11-a694-d920c13eccb6',
            'E70CB104-6DDB-4590-938B-988D5ECCBA80', -- Entity: MJ: Record Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80'),
            'ContextDescription',
            'Context Description',
            'Optional human-readable context note explaining why this artifact is linked to the host record.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'bc988971-1a07-4e90-bdce-75f759629e22' OR (EntityID = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND Name = 'LinkedByUserID')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'bc988971-1a07-4e90-bdce-75f759629e22',
            'E70CB104-6DDB-4590-938B-988D5ECCBA80', -- Entity: MJ: Record Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80'),
            'LinkedByUserID',
            'Linked By User ID',
            'Optional foreign key to User identifying who linked this artifact to the host record.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6a6094ca-cb9a-4e35-845f-b49d85dd0d8f' OR (EntityID = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND Name = '__mj_CreatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '6a6094ca-cb9a-4e35-845f-b49d85dd0d8f',
            'E70CB104-6DDB-4590-938B-988D5ECCBA80', -- Entity: MJ: Record Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80'),
            '__mj_CreatedAt',
            'Created At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '62f1667b-43a8-468c-98c8-59c7bc1b6a56' OR (EntityID = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND Name = '__mj_UpdatedAt')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '62f1667b-43a8-468c-98c8-59c7bc1b6a56',
            'E70CB104-6DDB-4590-938B-988D5ECCBA80', -- Entity: MJ: Record Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80'),
            '__mj_UpdatedAt',
            'Updated At',
            NULL,
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'getutcdate()',
            0,
            0,
            0,
            0,
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to sync entity unique keys (1 added, 0 updated, 0 removed) */
INSERT INTO [${flyway:defaultSchema}].[EntityUniqueKey] ([ID], [EntityID], [Name], [FieldNames], [FilterDefinition]) VALUES ('4b649f8b-1e07-4211-b5ab-e1faa4aa7885', 'E70CB104-6DDB-4590-938B-988D5ECCBA80', 'UQ_RecordArtifact_Record_Artifact_Role', 'EntityID,RecordID,ArtifactID,Role', NULL);

/* Deterministic search-flag hygiene — clear AllowUserSearchAPI */

         UPDATE [${flyway:defaultSchema}].[Entity]
         SET [AllowUserSearchAPI] = 0
         WHERE [ID] IN (
            SELECT e.[ID]
            FROM [${flyway:defaultSchema}].[Entity] e
            WHERE e.[AllowUserSearchAPI] = 1
              AND e.[AutoUpdateAllowUserSearchAPI] = 1
              AND e.[VirtualEntity] = 0
              AND ISNULL(e.[FullTextSearchEnabled], 0) = 0
              AND e.[SchemaName] NOT IN ('sys','staging')
              AND NOT EXISTS (
               SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] f2
               WHERE f2.[EntityID] = e.[ID]
                 AND f2.[IncludeInUserSearchAPI] = 1
            )
         );


/* Create Entity Relationship: MJ: Entities -> MJ: Record Artifacts (One To Many via EntityID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '0205b328-79c5-4be6-ac03-f1f3dbfe652f' OR ([EntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND [RelatedEntityJoinField] = 'EntityID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('0205b328-79c5-4be6-ac03-f1f3dbfe652f', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'E70CB104-6DDB-4590-938B-988D5ECCBA80', 'EntityID', 'One To Many', 1, 1, 102, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Users -> MJ: Record Artifacts (One To Many via LinkedByUserID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9e6ef5cc-2812-45b6-93f8-3258fd47d165' OR ([EntityID] = 'E1238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND [RelatedEntityJoinField] = 'LinkedByUserID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9e6ef5cc-2812-45b6-93f8-3258fd47d165', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'E70CB104-6DDB-4590-938B-988D5ECCBA80', 'LinkedByUserID', 'One To Many', 1, 1, 141, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Artifacts -> MJ: Record Artifacts (One To Many via ArtifactID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '36d6bcd4-6daa-48fe-ab40-6d2eb205ead7' OR ([EntityID] = 'F48D2341-8667-40BB-BCA8-87D7F80E16CD' AND [RelatedEntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND [RelatedEntityJoinField] = 'ArtifactID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('36d6bcd4-6daa-48fe-ab40-6d2eb205ead7', 'F48D2341-8667-40BB-BCA8-87D7F80E16CD', 'E70CB104-6DDB-4590-938B-988D5ECCBA80', 'ArtifactID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;


/* Create Entity Relationship: MJ: Artifact Versions -> MJ: Record Artifacts (One To Many via PinnedArtifactVersionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = 'bfe77f6b-8756-4daa-b7d4-d275f87acdb4' OR ([EntityID] = 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01' AND [RelatedEntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND [RelatedEntityJoinField] = 'PinnedArtifactVersionID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('bfe77f6b-8756-4daa-b7d4-d275f87acdb4', 'AEB408D2-162A-49AE-9DC2-DBE9A21A3C01', 'E70CB104-6DDB-4590-938B-988D5ECCBA80', 'PinnedArtifactVersionID', 'One To Many', 1, 1, 8, GETUTCDATE(), GETUTCDATE())
   END;

-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Artifacts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table RecordArtifact
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordArtifact_EntityID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordArtifact]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordArtifact]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'EntityID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordArtifact_EntityID ON [${flyway:defaultSchema}].[RecordArtifact] ([EntityID]);

-- Index for foreign key ArtifactID in table RecordArtifact
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordArtifact_ArtifactID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordArtifact]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordArtifact]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ArtifactID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordArtifact_ArtifactID ON [${flyway:defaultSchema}].[RecordArtifact] ([ArtifactID]);

-- Index for foreign key PinnedArtifactVersionID in table RecordArtifact
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordArtifact_PinnedArtifactVersionID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordArtifact]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordArtifact]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'PinnedArtifactVersionID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordArtifact_PinnedArtifactVersionID ON [${flyway:defaultSchema}].[RecordArtifact] ([PinnedArtifactVersionID]);

-- Index for foreign key LinkedByUserID in table RecordArtifact
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordArtifact_LinkedByUserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordArtifact]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordArtifact]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'LinkedByUserID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordArtifact_LinkedByUserID ON [${flyway:defaultSchema}].[RecordArtifact] ([LinkedByUserID]);

/* Base View SQL for MJ: Record Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Artifacts
-- Item: vwRecordArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Record Artifacts
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RecordArtifact
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRecordArtifacts]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRecordArtifacts];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRecordArtifacts]
AS
SELECT
    r.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJArtifact_ArtifactID.[Name] AS [Artifact],
    MJArtifactVersion_PinnedArtifactVersionID.[Name] AS [PinnedArtifactVersion],
    MJUser_LinkedByUserID.[Name] AS [LinkedByUser]
FROM
    [${flyway:defaultSchema}].[RecordArtifact] AS r
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [r].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Artifact] AS MJArtifact_ArtifactID
  ON
    [r].[ArtifactID] = MJArtifact_ArtifactID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ArtifactVersion] AS MJArtifactVersion_PinnedArtifactVersionID
  ON
    [r].[PinnedArtifactVersionID] = MJArtifactVersion_PinnedArtifactVersionID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_LinkedByUserID
  ON
    [r].[LinkedByUserID] = MJUser_LinkedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Record Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Artifacts
-- Item: Permissions for vwRecordArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordArtifacts] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Record Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Artifacts
-- Item: spCreateRecordArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordArtifact
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRecordArtifact]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRecordArtifact];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecordArtifact]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(700),
    @ArtifactID uniqueidentifier,
    @PinnedArtifactVersionID_Clear bit = 0,
    @PinnedArtifactVersionID uniqueidentifier = NULL,
    @Role nvarchar(100) = NULL,
    @Sequence int = NULL,
    @ContextDescription_Clear bit = 0,
    @ContextDescription nvarchar(MAX) = NULL,
    @LinkedByUserID_Clear bit = 0,
    @LinkedByUserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RecordArtifact]
            (
                [ID],
                [EntityID],
                [RecordID],
                [ArtifactID],
                [PinnedArtifactVersionID],
                [Role],
                [Sequence],
                [ContextDescription],
                [LinkedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @RecordID,
                @ArtifactID,
                CASE WHEN @PinnedArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@PinnedArtifactVersionID, NULL) END,
                ISNULL(@Role, 'General'),
                ISNULL(@Sequence, 0),
                CASE WHEN @ContextDescription_Clear = 1 THEN NULL ELSE ISNULL(@ContextDescription, NULL) END,
                CASE WHEN @LinkedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedByUserID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RecordArtifact]
            (
                [EntityID],
                [RecordID],
                [ArtifactID],
                [PinnedArtifactVersionID],
                [Role],
                [Sequence],
                [ContextDescription],
                [LinkedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @RecordID,
                @ArtifactID,
                CASE WHEN @PinnedArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@PinnedArtifactVersionID, NULL) END,
                ISNULL(@Role, 'General'),
                ISNULL(@Sequence, 0),
                CASE WHEN @ContextDescription_Clear = 1 THEN NULL ELSE ISNULL(@ContextDescription, NULL) END,
                CASE WHEN @LinkedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedByUserID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRecordArtifacts] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordArtifact] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Record Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordArtifact] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Record Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Artifacts
-- Item: spUpdateRecordArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecordArtifact
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRecordArtifact]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordArtifact];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordArtifact]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier = NULL,
    @RecordID nvarchar(700) = NULL,
    @ArtifactID uniqueidentifier = NULL,
    @PinnedArtifactVersionID_Clear bit = 0,
    @PinnedArtifactVersionID uniqueidentifier = NULL,
    @Role nvarchar(100) = NULL,
    @Sequence int = NULL,
    @ContextDescription_Clear bit = 0,
    @ContextDescription nvarchar(MAX) = NULL,
    @LinkedByUserID_Clear bit = 0,
    @LinkedByUserID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordArtifact]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [RecordID] = ISNULL(@RecordID, [RecordID]),
        [ArtifactID] = ISNULL(@ArtifactID, [ArtifactID]),
        [PinnedArtifactVersionID] = CASE WHEN @PinnedArtifactVersionID_Clear = 1 THEN NULL ELSE ISNULL(@PinnedArtifactVersionID, [PinnedArtifactVersionID]) END,
        [Role] = ISNULL(@Role, [Role]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [ContextDescription] = CASE WHEN @ContextDescription_Clear = 1 THEN NULL ELSE ISNULL(@ContextDescription, [ContextDescription]) END,
        [LinkedByUserID] = CASE WHEN @LinkedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedByUserID, [LinkedByUserID]) END,
        [__mj_UpdatedAt] = GETUTCDATE()
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRecordArtifacts] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRecordArtifacts]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordArtifact] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordArtifact table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRecordArtifact]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRecordArtifact];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRecordArtifact
ON [${flyway:defaultSchema}].[RecordArtifact]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    IF NOT UPDATE([__mj_UpdatedAt])
    BEGIN
        UPDATE
            [${flyway:defaultSchema}].[RecordArtifact]
        SET
            __mj_UpdatedAt = GETUTCDATE()
        FROM
            [${flyway:defaultSchema}].[RecordArtifact] AS _organicTable
        INNER JOIN
            INSERTED AS I ON
            _organicTable.[ID] = I.[ID];
    END
END;
GO

/* spUpdate Permissions for MJ: Record Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordArtifact] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Record Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Artifacts
-- Item: spDeleteRecordArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordArtifact
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRecordArtifact]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordArtifact];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordArtifact]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RecordArtifact]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordArtifact] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Record Artifacts */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRecordArtifact] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 4 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '06c8661c-d0b8-43e8-853e-334a77add107' OR (EntityID = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND Name = 'Entity')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '06c8661c-d0b8-43e8-853e-334a77add107',
            'E70CB104-6DDB-4590-938B-988D5ECCBA80', -- Entity: MJ: Record Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80'),
            'Entity',
            'Entity',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f91628f0-2f4f-4b9f-b669-ddffe45036b5' OR (EntityID = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND Name = 'Artifact')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f91628f0-2f4f-4b9f-b669-ddffe45036b5',
            'E70CB104-6DDB-4590-938B-988D5ECCBA80', -- Entity: MJ: Record Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80'),
            'Artifact',
            'Artifact',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f97479e5-8f35-4883-be24-18c9dc716d46' OR (EntityID = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND Name = 'PinnedArtifactVersion')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            'f97479e5-8f35-4883-be24-18c9dc716d46',
            'E70CB104-6DDB-4590-938B-988D5ECCBA80', -- Entity: MJ: Record Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80'),
            'PinnedArtifactVersion',
            'Pinned Artifact Version',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            1,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '87e5bdc9-d310-4fc3-820c-a4b713cba25b' OR (EntityID = 'E70CB104-6DDB-4590-938B-988D5ECCBA80' AND Name = 'LinkedByUser')) BEGIN
         INSERT INTO [${flyway:defaultSchema}].[EntityField]
         (
            [ID],
            [EntityID],
            [Sequence],
            [Name],
            [DisplayName],
            [Description],
            [Type],
            [Length],
            [Precision],
            [Scale],
            [AllowsNull],
            [DefaultValue],
            [AutoIncrement],
            [AllowUpdateAPI],
            [IsVirtual],
            [IsComputed],
            [RelatedEntityID],
            [RelatedEntityFieldName],
            [IsNameField],
            [IncludeInUserSearchAPI],
            [IncludeRelatedEntityNameFieldInBaseView],
            [DefaultInView],
            [IsPrimaryKey],
            [IsUnique],
            [RelatedEntityDisplayType],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '87e5bdc9-d310-4fc3-820c-a4b713cba25b',
            'E70CB104-6DDB-4590-938B-988D5ECCBA80', -- Entity: MJ: Record Artifacts
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'E70CB104-6DDB-4590-938B-988D5ECCBA80'),
            'LinkedByUser',
            'Linked By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            NULL,
            0,
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
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;
