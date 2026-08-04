-- =====================================================
-- v5.39.x — Deprecate ConversationDetailAttachment table description
-- =====================================================
-- Updates the MS_Description extended property on the ConversationDetailAttachment
-- table to mark it deprecated. Because the corresponding Entity record has
-- AutoUpdateDescription=1, R__RefreshMetadata's spUpdateExistingEntitiesFromSchema
-- propagates this extended property into Entity.Description on every migrate cycle.
--
-- Without this migration, the metadata-sync file
-- metadata/entities/.conversation-detail-attachments-deprecation.json showed
-- perpetual "drift" on Entity.Description because each migrate cycle reverted
-- it back to the original "Stores attachments..." text from the stale extended
-- property. The metadata file now sets Status='Deprecated' only; the description
-- is owned here, by the extended property.
--
-- File uploads have moved to ConversationArtifactVersion. Table, generated
-- entity class, GraphQL types, and stored procedures all remain functional —
-- runtime use produces a console warning per the framework's standard handling
-- of Status='Deprecated'. See packages/AI/Agents/docs/ARTIFACT_TOOLS_GUIDE.md
-- for migration guidance.

IF EXISTS (
    SELECT 1
    FROM sys.extended_properties
    WHERE major_id = OBJECT_ID('${flyway:defaultSchema}.ConversationDetailAttachment')
      AND minor_id = 0
      AND name = 'MS_Description'
)
BEGIN
    EXEC sp_dropextendedproperty
        @name = N'MS_Description',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = N'ConversationDetailAttachment';
END;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'DEPRECATED: file uploads now flow through ConversationArtifactVersion so they share storage, identity, versioning, permissions, and the artifact-tool dispatch path. Table, generated entity class, GraphQL types, and stored procedures all remain functional — runtime use produces a console warning per the framework''s standard handling of Status=''Deprecated''. See packages/AI/Agents/docs/ARTIFACT_TOOLS_GUIDE.md for migration guidance. Originally: Stores attachments (images, videos, audio, documents) for conversation messages.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ConversationDetailAttachment';
GO
