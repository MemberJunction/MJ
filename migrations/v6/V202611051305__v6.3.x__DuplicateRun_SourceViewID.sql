-- =============================================================================
-- DuplicateRun.SourceViewID (v6.3.x)
-- =============================================================================
-- A duplicate run can now scan the records of one saved view, as it already could one list
-- (SourceListID). The detector has always accepted a view; the run record had no column to carry
-- it, so runs started from the Duplicates tab could only scan the whole entity (#5200).
--
-- A run scans the whole entity (both NULL), one list, or one view; never a list and a view
-- together. The server entity refuses that combination, and a view of another entity.
--
-- DDL and extended properties, plus a redefinition of spDeleteEntityWithCoreDependencies: the new
-- column is a nullable FK into UserView, a table that proc deletes from, so the proc clears
-- DuplicateRun.SourceViewID for the entity's views first, as it does List.SourceViewID (policy:
-- packages/CodeGenLib/src/__tests__/fixtures/entity-delete-fk-policy.json). The proc body is the
-- one from V202611030816__v6.2.x__spDeleteEntityWithCoreDependencies_Graph_Edges plus that one
-- UPDATE. The FK index, base view, stored procedures and EntityField metadata are produced by
-- CodeGen and appended below the CodeGen banner.
-- =============================================================================

ALTER TABLE ${flyway:defaultSchema}.DuplicateRun ADD SourceViewID UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.DuplicateRun
    ADD CONSTRAINT FK_DuplicateRun_SourceView
        FOREIGN KEY (SourceViewID) REFERENCES ${flyway:defaultSchema}.UserView(ID);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The saved view whose records this run scanned. NULL when the run scanned the whole entity or a list (SourceListID); a run never sets both.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'DuplicateRun',
    @level2type = N'COLUMN', @level2name = N'SourceViewID';
GO

-- spDeleteEntityWithCoreDependencies: clear DuplicateRun.SourceViewID before deleting the entity's views

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
      (N'ArchiveRunDetail.EntityID'), (N'AuditLog.EntityID'), (N'CalendarEventLink.EntityID'),
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
      (N'EntityRelationship.RelatedEntityID'), (N'EntitySetting.EntityID'), (N'FeatureValue.EntityID'),
      (N'FileEntityRecordLink.EntityID'), (N'FormChromeRule.EntityID'),
      (N'FormChromeRule.RelatedEntityID'), (N'GeneratedCode.LinkedEntityID'),
      (N'GraphEdge.SourceEntityID'), (N'GraphEdge.TargetEntityID'), (N'GraphEdgeTypeEndpoint.EntityID'),
      (N'IdentityClaim.EntityID'), (N'IntegrationURLFormat.EntityID'), (N'InteractionLink.EntityID'),
      (N'List.EntityID'), (N'MaterializedResult.GeneratedEntityID'),
      (N'MaterializedResult.SourceEntityID'), (N'MLModelScoringBinding.TargetEntityID'),
      (N'MLTrainingPipeline.TargetEntityID'), (N'ProcessRunDetail.EntityID'), (N'ProcessRun.EntityID'),
      (N'QueryEntity.EntityID'), (N'QueryField.SourceEntityID'),
      (N'RecommendationItem.DestinationEntityID'), (N'Recommendation.SourceEntityID'),
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
      (N'VersionLabel.EntityID'), (N'VersionLabelItem.EntityID');

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
    -- CK_AIAgentSession_LinkBinding / CK_Conversation_LinkBinding: both columns or neither
    UPDATE [${flyway:defaultSchema}].[AIAgentSession] SET [LinkedEntityID] = NULL, [LinkedRecordID] = NULL WHERE [LinkedEntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[AuditLog] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
    UPDATE [${flyway:defaultSchema}].[ClusterAnalysis] SET [EntityID] = NULL WHERE [EntityID] = @EntityID;
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
    UPDATE [${flyway:defaultSchema}].[DuplicateRun] SET [SourceViewID] = NULL WHERE [SourceViewID] IN (SELECT ID FROM @UserViewIDs);
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
    DELETE FROM [${flyway:defaultSchema}].[MLModelScoringBinding] WHERE [MLModelID] IN (SELECT ID FROM @MLModelIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLTrainingRun] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLModel] WHERE [PipelineID] IN (SELECT ID FROM @PipelineIDs);
    DELETE FROM [${flyway:defaultSchema}].[MLTrainingPipeline] WHERE [TargetEntityID] = @EntityID;

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
    DELETE FROM [${flyway:defaultSchema}].[FileEntityRecordLink] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[FormChromeRule] WHERE [EntityID] = @EntityID OR [RelatedEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[GraphEdge] WHERE [SourceEntityID] = @EntityID OR [TargetEntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[GraphEdgeTypeEndpoint] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[IntegrationURLFormat] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[InteractionLink] WHERE [EntityID] = @EntityID;
    DELETE FROM [${flyway:defaultSchema}].[QueryEntity] WHERE [EntityID] = @EntityID;
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
    IF @OwnsTransaction = 1 AND @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH
END
GO























































/******************************************************************************************
 * EVERYTHING BELOW THIS LINE WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
 *
 * It contains the EntityField and EntityRelationship rows for DuplicateRun.SourceViewID,
 * the foreign-key indexes, the regenerated vwDuplicateRuns view, and spCreate/spUpdate/spDelete
 * for MJ: Duplicate Runs, with their permission grants.
 *
 * DO NOT EDIT BY HAND. If the DDL above changes, re-run CodeGen and replace this entire
 * generated section.
 ******************************************************************************************/

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8b171f91-4dcb-4ce7-a821-40445d7cdd3d' OR (EntityID = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SourceViewID')) BEGIN
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
            '8b171f91-4dcb-4ce7-a821-40445d7cdd3d',
            '30248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '30248F34-2837-EF11-86D4-6045BDEE16E6'),
            'SourceViewID',
            'Source View ID',
            'The saved view whose records this run scanned. NULL when the run scanned the whole entity or a list (SourceListID); a run never sets both.',
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
            'E4238F34-2837-EF11-86D4-6045BDEE16E6',
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


/* Create Entity Relationship: MJ: User Views -> MJ: Duplicate Runs (One To Many via SourceViewID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '36661d06-3122-4fb4-847b-48d894bfcbe8' OR ([EntityID] = 'E4238F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityID] = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND [RelatedEntityJoinField] = 'SourceViewID')
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('36661d06-3122-4fb4-847b-48d894bfcbe8', 'E4238F34-2837-EF11-86D4-6045BDEE16E6', '30248F34-2837-EF11-86D4-6045BDEE16E6', 'SourceViewID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for DuplicateRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_EntityID ON [${flyway:defaultSchema}].[DuplicateRun] ([EntityID]);

-- Index for foreign key StartedByUserID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_StartedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_StartedByUserID ON [${flyway:defaultSchema}].[DuplicateRun] ([StartedByUserID]);

-- Index for foreign key SourceListID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_SourceListID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_SourceListID ON [${flyway:defaultSchema}].[DuplicateRun] ([SourceListID]);

-- Index for foreign key ApprovedByUserID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_ApprovedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_ApprovedByUserID ON [${flyway:defaultSchema}].[DuplicateRun] ([ApprovedByUserID]);

-- Index for foreign key EntityDocumentID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_EntityDocumentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_EntityDocumentID ON [${flyway:defaultSchema}].[DuplicateRun] ([EntityDocumentID]);

-- Index for foreign key SourceViewID in table DuplicateRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRun_SourceViewID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRun_SourceViewID ON [${flyway:defaultSchema}].[DuplicateRun] ([SourceViewID]);

/* SQL text to update entity field related entity name field map for entity field ID 8B171F91-4DCB-4CE7-A821-40445D7CDD3D */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='8B171F91-4DCB-4CE7-A821-40445D7CDD3D', @RelatedEntityNameFieldMap='SourceView';

/* Base View SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: vwDuplicateRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Duplicate Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DuplicateRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDuplicateRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDuplicateRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDuplicateRuns]
AS
SELECT
    d.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJUser_StartedByUserID.[Name] AS [StartedByUser],
    MJList_SourceListID.[Name] AS [SourceList],
    MJUser_ApprovedByUserID.[Name] AS [ApprovedByUser],
    MJEntityDocument_EntityDocumentID.[Name] AS [EntityDocument],
    MJUserView_SourceViewID.[Name] AS [SourceView]
FROM
    [${flyway:defaultSchema}].[DuplicateRun] AS d
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [d].[EntityID] = MJEntity_EntityID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_StartedByUserID
  ON
    [d].[StartedByUserID] = MJUser_StartedByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[List] AS MJList_SourceListID
  ON
    [d].[SourceListID] = MJList_SourceListID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ApprovedByUserID
  ON
    [d].[ApprovedByUserID] = MJUser_ApprovedByUserID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[EntityDocument] AS MJEntityDocument_EntityDocumentID
  ON
    [d].[EntityDocumentID] = MJEntityDocument_EntityDocumentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[UserView] AS MJUserView_SourceViewID
  ON
    [d].[SourceViewID] = MJUserView_SourceViewID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwDuplicateRuns] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwDuplicateRuns] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwDuplicateRuns] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* Base View Permissions SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: Permissions for vwDuplicateRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwDuplicateRuns] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwDuplicateRuns] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwDuplicateRuns] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: spCreateDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DuplicateRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDuplicateRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRun]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @StartedByUserID uniqueidentifier,
    @SourceListID_Clear bit = 0,
    @SourceListID uniqueidentifier = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @ApprovalStatus nvarchar(20) = NULL,
    @ApprovalComments_Clear bit = 0,
    @ApprovalComments nvarchar(MAX) = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ProcessingStatus nvarchar(20) = NULL,
    @ProcessingErrorMessage_Clear bit = 0,
    @ProcessingErrorMessage nvarchar(MAX) = NULL,
    @TotalItemCount_Clear bit = 0,
    @TotalItemCount int = NULL,
    @ProcessedItemCount_Clear bit = 0,
    @ProcessedItemCount int = NULL,
    @LastProcessedOffset_Clear bit = 0,
    @LastProcessedOffset int = NULL,
    @BatchSize_Clear bit = 0,
    @BatchSize int = NULL,
    @CancellationRequested bit = NULL,
    @EntityDocumentID uniqueidentifier,
    @SourceViewID_Clear bit = 0,
    @SourceViewID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRun]
            (
                [ID],
                [EntityID],
                [StartedByUserID],
                [SourceListID],
                [StartedAt],
                [EndedAt],
                [ApprovalStatus],
                [ApprovalComments],
                [ApprovedByUserID],
                [ProcessingStatus],
                [ProcessingErrorMessage],
                [TotalItemCount],
                [ProcessedItemCount],
                [LastProcessedOffset],
                [BatchSize],
                [CancellationRequested],
                [EntityDocumentID],
                [SourceViewID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @StartedByUserID,
                CASE WHEN @SourceListID_Clear = 1 THEN NULL ELSE ISNULL(@SourceListID, NULL) END,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                ISNULL(@ApprovalStatus, 'Pending'),
                CASE WHEN @ApprovalComments_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalComments, NULL) END,
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                ISNULL(@ProcessingStatus, 'Pending'),
                CASE WHEN @ProcessingErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ProcessingErrorMessage, NULL) END,
                CASE WHEN @TotalItemCount_Clear = 1 THEN NULL ELSE ISNULL(@TotalItemCount, NULL) END,
                CASE WHEN @ProcessedItemCount_Clear = 1 THEN NULL ELSE ISNULL(@ProcessedItemCount, 0) END,
                CASE WHEN @LastProcessedOffset_Clear = 1 THEN NULL ELSE ISNULL(@LastProcessedOffset, 0) END,
                CASE WHEN @BatchSize_Clear = 1 THEN NULL ELSE ISNULL(@BatchSize, 100) END,
                ISNULL(@CancellationRequested, 0),
                @EntityDocumentID,
                CASE WHEN @SourceViewID_Clear = 1 THEN NULL ELSE ISNULL(@SourceViewID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRun]
            (
                [EntityID],
                [StartedByUserID],
                [SourceListID],
                [StartedAt],
                [EndedAt],
                [ApprovalStatus],
                [ApprovalComments],
                [ApprovedByUserID],
                [ProcessingStatus],
                [ProcessingErrorMessage],
                [TotalItemCount],
                [ProcessedItemCount],
                [LastProcessedOffset],
                [BatchSize],
                [CancellationRequested],
                [EntityDocumentID],
                [SourceViewID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @StartedByUserID,
                CASE WHEN @SourceListID_Clear = 1 THEN NULL ELSE ISNULL(@SourceListID, NULL) END,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                ISNULL(@ApprovalStatus, 'Pending'),
                CASE WHEN @ApprovalComments_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalComments, NULL) END,
                CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, NULL) END,
                ISNULL(@ProcessingStatus, 'Pending'),
                CASE WHEN @ProcessingErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ProcessingErrorMessage, NULL) END,
                CASE WHEN @TotalItemCount_Clear = 1 THEN NULL ELSE ISNULL(@TotalItemCount, NULL) END,
                CASE WHEN @ProcessedItemCount_Clear = 1 THEN NULL ELSE ISNULL(@ProcessedItemCount, 0) END,
                CASE WHEN @LastProcessedOffset_Clear = 1 THEN NULL ELSE ISNULL(@LastProcessedOffset, 0) END,
                CASE WHEN @BatchSize_Clear = 1 THEN NULL ELSE ISNULL(@BatchSize, 100) END,
                ISNULL(@CancellationRequested, 0),
                @EntityDocumentID,
                CASE WHEN @SourceViewID_Clear = 1 THEN NULL ELSE ISNULL(@SourceViewID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDuplicateRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRun] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Duplicate Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRun] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: spUpdateDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DuplicateRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDuplicateRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRun]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier = NULL,
    @StartedByUserID uniqueidentifier = NULL,
    @SourceListID_Clear bit = 0,
    @SourceListID uniqueidentifier = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @ApprovalStatus nvarchar(20) = NULL,
    @ApprovalComments_Clear bit = 0,
    @ApprovalComments nvarchar(MAX) = NULL,
    @ApprovedByUserID_Clear bit = 0,
    @ApprovedByUserID uniqueidentifier = NULL,
    @ProcessingStatus nvarchar(20) = NULL,
    @ProcessingErrorMessage_Clear bit = 0,
    @ProcessingErrorMessage nvarchar(MAX) = NULL,
    @TotalItemCount_Clear bit = 0,
    @TotalItemCount int = NULL,
    @ProcessedItemCount_Clear bit = 0,
    @ProcessedItemCount int = NULL,
    @LastProcessedOffset_Clear bit = 0,
    @LastProcessedOffset int = NULL,
    @BatchSize_Clear bit = 0,
    @BatchSize int = NULL,
    @CancellationRequested bit = NULL,
    @EntityDocumentID uniqueidentifier = NULL,
    @SourceViewID_Clear bit = 0,
    @SourceViewID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRun]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [StartedByUserID] = ISNULL(@StartedByUserID, [StartedByUserID]),
        [SourceListID] = CASE WHEN @SourceListID_Clear = 1 THEN NULL ELSE ISNULL(@SourceListID, [SourceListID]) END,
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [ApprovalStatus] = ISNULL(@ApprovalStatus, [ApprovalStatus]),
        [ApprovalComments] = CASE WHEN @ApprovalComments_Clear = 1 THEN NULL ELSE ISNULL(@ApprovalComments, [ApprovalComments]) END,
        [ApprovedByUserID] = CASE WHEN @ApprovedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ApprovedByUserID, [ApprovedByUserID]) END,
        [ProcessingStatus] = ISNULL(@ProcessingStatus, [ProcessingStatus]),
        [ProcessingErrorMessage] = CASE WHEN @ProcessingErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ProcessingErrorMessage, [ProcessingErrorMessage]) END,
        [TotalItemCount] = CASE WHEN @TotalItemCount_Clear = 1 THEN NULL ELSE ISNULL(@TotalItemCount, [TotalItemCount]) END,
        [ProcessedItemCount] = CASE WHEN @ProcessedItemCount_Clear = 1 THEN NULL ELSE ISNULL(@ProcessedItemCount, [ProcessedItemCount]) END,
        [LastProcessedOffset] = CASE WHEN @LastProcessedOffset_Clear = 1 THEN NULL ELSE ISNULL(@LastProcessedOffset, [LastProcessedOffset]) END,
        [BatchSize] = CASE WHEN @BatchSize_Clear = 1 THEN NULL ELSE ISNULL(@BatchSize, [BatchSize]) END,
        [CancellationRequested] = ISNULL(@CancellationRequested, [CancellationRequested]),
        [EntityDocumentID] = ISNULL(@EntityDocumentID, [EntityDocumentID]),
        [SourceViewID] = CASE WHEN @SourceViewID_Clear = 1 THEN NULL ELSE ISNULL(@SourceViewID, [SourceViewID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDuplicateRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDuplicateRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DuplicateRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDuplicateRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDuplicateRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDuplicateRun
ON [${flyway:defaultSchema}].[DuplicateRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DuplicateRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Duplicate Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Duplicate Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Runs
-- Item: spDeleteDuplicateRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuplicateRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDuplicateRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DuplicateRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Duplicate Runs */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRun] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRun] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRun] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f8b51573-1e6a-4841-917c-c02f9d070163' OR (EntityID = '30248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'SourceView')) BEGIN
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
            'f8b51573-1e6a-4841-917c-c02f9d070163',
            '30248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Runs
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '30248F34-2837-EF11-86D4-6045BDEE16E6'),
            'SourceView',
            'Source View',
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

