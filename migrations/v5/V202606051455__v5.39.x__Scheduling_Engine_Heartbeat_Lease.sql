-- =====================================================
-- v5.39.x — Scheduling engine heartbeat-based lease renewal (GH #2749)
-- =====================================================
-- Follow-up to the poll-loop decoupling work (GH #2736,
-- plans/scheduled-job-engine-decoupling.md). Replaces the fixed-duration
-- lease's residual starvation window with plugin-driven LIVENESS: a running
-- job periodically heartbeats to push ExpectedCompletionAt forward, and a job
-- that STOPS beating becomes reclaimable by the existing sweep shortly after
-- its last beat — independent of absolute clock time.
--
-- Full rationale: plans/scheduled-job-engine-heartbeat-lease.md.
--
-- This migration adds:
--   1. ScheduledJob.MaxRuntimeMinutes — optional per-job acquire-time lease
--      override (only ever EXTENDS the default lease, never shrinks it). For
--      jobs whose single long-running call cannot heartbeat mid-flight.
--   2. spExtendScheduledJobLease — the atomic heartbeat sproc. Mirrors the
--      token-checked WHERE of spReleaseScheduledJobLockIfTokenMatches so a
--      stale/reclaimed holder cannot renew a FRESH holder's lock (lost-mutex
--      protection). Engine-internal lock sproc → lives in a migration, not
--      CodeGen (same convention as V202606022336 atomic sprocs).
--
-- The sweep itself needs NO changes: its filter already reclaims any inflight
-- job whose ExpectedCompletionAt < now. Heartbeating simply keeps a healthy
-- job's ExpectedCompletionAt ahead of now.
-- =====================================================

ALTER TABLE [${flyway:defaultSchema}].[ScheduledJob] ADD
    MaxRuntimeMinutes INT NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional per-job override for the acquire-time lock lease length, in minutes. When set and positive, the engine uses max(default lease, MaxRuntimeMinutes) as the initial ExpectedCompletionAt — so it only ever EXTENDS the default lease, never shrinks it. Intended for jobs whose work is a single long-running call that cannot heartbeat mid-flight (e.g. one slow synchronous action). Jobs that heartbeat via the plugin opt-in pattern do not need this. NULL = use the engine default lease (LeaseTimeoutMinutes). See plans/scheduled-job-engine-heartbeat-lease.md (GH #2749).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'MaxRuntimeMinutes';
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spExtendScheduledJobLease]
    @JobID                  UNIQUEIDENTIFIER,
    @ExpectedToken          UNIQUEIDENTIFIER,
    @NewExpectedCompletionAt DATETIMEOFFSET
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @RowsAffected INT;

    UPDATE [${flyway:defaultSchema}].[ScheduledJob]
       SET ExpectedCompletionAt = @NewExpectedCompletionAt
     WHERE ID = @JobID
       AND LockToken = @ExpectedToken;

    SET @RowsAffected = @@ROWCOUNT;
    SELECT @RowsAffected AS Extended;
END;
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spExtendScheduledJobLease] TO [cdp_Developer];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spExtendScheduledJobLease] TO [cdp_Integration];
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Atomically extends (renews) a ScheduledJob lock''s lease by setting ExpectedCompletionAt = @NewExpectedCompletionAt, IF AND ONLY IF the current DB LockToken matches @ExpectedToken (the token this execution originally acquired via spAcquireScheduledJobLock). The token-checked WHERE is the load-bearing atomicity guarantee: it mirrors spReleaseScheduledJobLockIfTokenMatches so a stale/reclaimed holder cannot renew a FRESH holder''s lock (lost-mutex protection). Returns Extended = 1 if the lease was renewed, 0 on token mismatch / already released. Called by ScheduledJobEngine''s throttled heartbeat closure as part of the v5.39 heartbeat-based lease renewal (GH #2749). See plans/scheduled-job-engine-heartbeat-lease.md.',
    @level0type = N'SCHEMA',    @level0name = N'${flyway:defaultSchema}',
    @level1type = N'PROCEDURE', @level1name = N'spExtendScheduledJobLease';
GO































































/*-----------------------------------CODEGEN--------------------------*/
/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'a6df0f99-3ba4-46b9-89e1-1d07c13f0ad5' OR (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'MaxRuntimeMinutes')) BEGIN
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
            'a6df0f99-3ba4-46b9-89e1-1d07c13f0ad5',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100063,
            'MaxRuntimeMinutes',
            'Max Runtime Minutes',
            'Optional per-job override for the acquire-time lock lease length, in minutes. When set and positive, the engine uses max(default lease, MaxRuntimeMinutes) as the initial ExpectedCompletionAt — so it only ever EXTENDS the default lease, never shrinks it. Intended for jobs whose work is a single long-running call that cannot heartbeat mid-flight (e.g. one slow synchronous action). Jobs that heartbeat via the plugin opt-in pattern do not need this. NULL = use the engine default lease (LeaseTimeoutMinutes). See plans/scheduled-job-engine-heartbeat-lease.md (GH #2749).',
            'int',
            4,
            10,
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

/* Base View SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: vwAIAgentExamples
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Examples
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentExample
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentExamples]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentExamples];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentExamples]
AS
SELECT
    a.*,
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJUser_UserID.[Name] AS [User],
    MJCompany_CompanyID.[Name] AS [Company],
    MJConversation_SourceConversationID.[Name] AS [SourceConversation],
    MJConversationDetail_SourceConversationDetailID.[Message] AS [SourceConversationDetail],
    MJAIAgentRun_SourceAIAgentRunID.[ID] AS [SourceAIAgentRun],
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    MJEntity_PrimaryScopeEntityID.[Name] AS [PrimaryScopeEntity]
FROM
    [${flyway:defaultSchema}].[AIAgentExample] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Company] AS MJCompany_CompanyID
  ON
    [a].[CompanyID] = MJCompany_CompanyID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_SourceConversationID
  ON
    [a].[SourceConversationID] = MJConversation_SourceConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS MJConversationDetail_SourceConversationDetailID
  ON
    [a].[SourceConversationDetailID] = MJConversationDetail_SourceConversationDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_SourceAIAgentRunID
  ON
    [a].[SourceAIAgentRunID] = MJAIAgentRun_SourceAIAgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [a].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_PrimaryScopeEntityID
  ON
    [a].[PrimaryScopeEntityID] = MJEntity_PrimaryScopeEntityID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentExamples] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: Permissions for vwAIAgentExamples
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentExamples] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: spCreateAIAgentExample
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentExample
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentExample]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentExample];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentExample]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @Type nvarchar(20) = NULL,
    @ExampleInput nvarchar(MAX),
    @ExampleOutput nvarchar(MAX),
    @IsAutoGenerated bit = NULL,
    @SourceConversationID_Clear bit = 0,
    @SourceConversationID uniqueidentifier = NULL,
    @SourceConversationDetailID_Clear bit = 0,
    @SourceConversationDetailID uniqueidentifier = NULL,
    @SourceAIAgentRunID_Clear bit = 0,
    @SourceAIAgentRunID uniqueidentifier = NULL,
    @SuccessScore_Clear bit = 0,
    @SuccessScore decimal(5, 2) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @LastAccessedAt_Clear bit = 0,
    @LastAccessedAt datetimeoffset = NULL,
    @AccessCount int = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentExample]
            (
                [ID],
                [AgentID],
                [UserID],
                [CompanyID],
                [Type],
                [ExampleInput],
                [ExampleOutput],
                [IsAutoGenerated],
                [SourceConversationID],
                [SourceConversationDetailID],
                [SourceAIAgentRunID],
                [SuccessScore],
                [Comments],
                [Status],
                [EmbeddingVector],
                [EmbeddingModelID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [LastAccessedAt],
                [AccessCount],
                [ExpiresAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                ISNULL(@Type, 'Example'),
                @ExampleInput,
                @ExampleOutput,
                ISNULL(@IsAutoGenerated, 0),
                CASE WHEN @SourceConversationID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationID, NULL) END,
                CASE WHEN @SourceConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationDetailID, NULL) END,
                CASE WHEN @SourceAIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@SourceAIAgentRunID, NULL) END,
                CASE WHEN @SuccessScore_Clear = 1 THEN NULL ELSE ISNULL(@SuccessScore, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, NULL) END,
                ISNULL(@AccessCount, 0),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentExample]
            (
                [AgentID],
                [UserID],
                [CompanyID],
                [Type],
                [ExampleInput],
                [ExampleOutput],
                [IsAutoGenerated],
                [SourceConversationID],
                [SourceConversationDetailID],
                [SourceAIAgentRunID],
                [SuccessScore],
                [Comments],
                [Status],
                [EmbeddingVector],
                [EmbeddingModelID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [LastAccessedAt],
                [AccessCount],
                [ExpiresAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                ISNULL(@Type, 'Example'),
                @ExampleInput,
                @ExampleOutput,
                ISNULL(@IsAutoGenerated, 0),
                CASE WHEN @SourceConversationID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationID, NULL) END,
                CASE WHEN @SourceConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationDetailID, NULL) END,
                CASE WHEN @SourceAIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@SourceAIAgentRunID, NULL) END,
                CASE WHEN @SuccessScore_Clear = 1 THEN NULL ELSE ISNULL(@SuccessScore, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, NULL) END,
                ISNULL(@AccessCount, 0),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentExamples] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentExample] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Examples */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentExample] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: spUpdateAIAgentExample
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentExample
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentExample]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentExample];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentExample]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @Type nvarchar(20) = NULL,
    @ExampleInput nvarchar(MAX) = NULL,
    @ExampleOutput nvarchar(MAX) = NULL,
    @IsAutoGenerated bit = NULL,
    @SourceConversationID_Clear bit = 0,
    @SourceConversationID uniqueidentifier = NULL,
    @SourceConversationDetailID_Clear bit = 0,
    @SourceConversationDetailID uniqueidentifier = NULL,
    @SourceAIAgentRunID_Clear bit = 0,
    @SourceAIAgentRunID uniqueidentifier = NULL,
    @SuccessScore_Clear bit = 0,
    @SuccessScore decimal(5, 2) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @LastAccessedAt_Clear bit = 0,
    @LastAccessedAt datetimeoffset = NULL,
    @AccessCount int = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentExample]
    SET
        [AgentID] = ISNULL(@AgentID, [AgentID]),
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END,
        [Type] = ISNULL(@Type, [Type]),
        [ExampleInput] = ISNULL(@ExampleInput, [ExampleInput]),
        [ExampleOutput] = ISNULL(@ExampleOutput, [ExampleOutput]),
        [IsAutoGenerated] = ISNULL(@IsAutoGenerated, [IsAutoGenerated]),
        [SourceConversationID] = CASE WHEN @SourceConversationID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationID, [SourceConversationID]) END,
        [SourceConversationDetailID] = CASE WHEN @SourceConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationDetailID, [SourceConversationDetailID]) END,
        [SourceAIAgentRunID] = CASE WHEN @SourceAIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@SourceAIAgentRunID, [SourceAIAgentRunID]) END,
        [SuccessScore] = CASE WHEN @SuccessScore_Clear = 1 THEN NULL ELSE ISNULL(@SuccessScore, [SuccessScore]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [Status] = ISNULL(@Status, [Status]),
        [EmbeddingVector] = CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, [EmbeddingVector]) END,
        [EmbeddingModelID] = CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, [EmbeddingModelID]) END,
        [PrimaryScopeEntityID] = CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, [PrimaryScopeEntityID]) END,
        [PrimaryScopeRecordID] = CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, [PrimaryScopeRecordID]) END,
        [SecondaryScopes] = CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, [SecondaryScopes]) END,
        [LastAccessedAt] = CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, [LastAccessedAt]) END,
        [AccessCount] = ISNULL(@AccessCount, [AccessCount]),
        [ExpiresAt] = CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, [ExpiresAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentExamples] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentExamples]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentExample] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentExample table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentExample]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentExample];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentExample
ON [${flyway:defaultSchema}].[AIAgentExample]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentExample]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentExample] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Examples */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentExample] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: spDeleteAIAgentExample
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentExample
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentExample]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentExample];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentExample]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentExample]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentExample] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Examples */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentExample] TO [cdp_Developer], [cdp_Integration];

/* Root ID Function SQL for MJ: AI Agent Notes.ConsolidatedIntoNoteID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: fnAIAgentNoteConsolidatedIntoNoteID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgentNote].[ConsolidatedIntoNoteID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentNoteConsolidatedIntoNoteID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentNoteConsolidatedIntoNoteID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentNoteConsolidatedIntoNoteID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ConsolidatedIntoNoteID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentNote]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ConsolidatedIntoNoteID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentNote] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ConsolidatedIntoNoteID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ConsolidatedIntoNoteID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: vwAIAgentNotes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Notes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentNote
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentNotes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentNotes];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentNotes]
AS
SELECT
    a.*,
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJAIAgentNoteType_AgentNoteTypeID.[Name] AS [AgentNoteType],
    MJUser_UserID.[Name] AS [User],
    MJConversation_SourceConversationID.[Name] AS [SourceConversation],
    MJConversationDetail_SourceConversationDetailID.[Message] AS [SourceConversationDetail],
    MJAIAgentRun_SourceAIAgentRunID.[ID] AS [SourceAIAgentRun],
    MJCompany_CompanyID.[Name] AS [Company],
    MJAIModel_EmbeddingModelID.[Name] AS [EmbeddingModel],
    MJEntity_PrimaryScopeEntityID.[Name] AS [PrimaryScopeEntity],
    MJAIAgentNote_ConsolidatedIntoNoteID.[Note] AS [ConsolidatedIntoNote],
    root_ConsolidatedIntoNoteID.RootID AS [RootConsolidatedIntoNoteID]
FROM
    [${flyway:defaultSchema}].[AIAgentNote] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentNoteType] AS MJAIAgentNoteType_AgentNoteTypeID
  ON
    [a].[AgentNoteTypeID] = MJAIAgentNoteType_AgentNoteTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_SourceConversationID
  ON
    [a].[SourceConversationID] = MJConversation_SourceConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS MJConversationDetail_SourceConversationDetailID
  ON
    [a].[SourceConversationDetailID] = MJConversationDetail_SourceConversationDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_SourceAIAgentRunID
  ON
    [a].[SourceAIAgentRunID] = MJAIAgentRun_SourceAIAgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Company] AS MJCompany_CompanyID
  ON
    [a].[CompanyID] = MJCompany_CompanyID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_EmbeddingModelID
  ON
    [a].[EmbeddingModelID] = MJAIModel_EmbeddingModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_PrimaryScopeEntityID
  ON
    [a].[PrimaryScopeEntityID] = MJEntity_PrimaryScopeEntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentNote] AS MJAIAgentNote_ConsolidatedIntoNoteID
  ON
    [a].[ConsolidatedIntoNoteID] = MJAIAgentNote_ConsolidatedIntoNoteID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentNoteConsolidatedIntoNoteID_GetRootID]([a].[ID], [a].[ConsolidatedIntoNoteID]) AS root_ConsolidatedIntoNoteID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentNotes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: Permissions for vwAIAgentNotes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentNotes] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: spCreateAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentNote]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentNote];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentNote]
    @ID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @AgentNoteTypeID_Clear bit = 0,
    @AgentNoteTypeID uniqueidentifier = NULL,
    @Note_Clear bit = 0,
    @Note nvarchar(MAX) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @Type nvarchar(20) = NULL,
    @IsAutoGenerated bit = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @SourceConversationID_Clear bit = 0,
    @SourceConversationID uniqueidentifier = NULL,
    @SourceConversationDetailID_Clear bit = 0,
    @SourceConversationDetailID uniqueidentifier = NULL,
    @SourceAIAgentRunID_Clear bit = 0,
    @SourceAIAgentRunID uniqueidentifier = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @LastAccessedAt_Clear bit = 0,
    @LastAccessedAt datetimeoffset = NULL,
    @AccessCount int = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @ConsolidatedIntoNoteID_Clear bit = 0,
    @ConsolidatedIntoNoteID uniqueidentifier = NULL,
    @ConsolidationCount int = NULL,
    @DerivedFromNoteIDs_Clear bit = 0,
    @DerivedFromNoteIDs nvarchar(MAX) = NULL,
    @ProtectionTier nvarchar(20) = NULL,
    @ImportanceScore_Clear bit = 0,
    @ImportanceScore decimal(5, 2) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentNote]
            (
                [ID],
                [AgentID],
                [AgentNoteTypeID],
                [Note],
                [UserID],
                [Type],
                [IsAutoGenerated],
                [Comments],
                [Status],
                [SourceConversationID],
                [SourceConversationDetailID],
                [SourceAIAgentRunID],
                [CompanyID],
                [EmbeddingVector],
                [EmbeddingModelID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [LastAccessedAt],
                [AccessCount],
                [ExpiresAt],
                [ConsolidatedIntoNoteID],
                [ConsolidationCount],
                [DerivedFromNoteIDs],
                [ProtectionTier],
                [ImportanceScore]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @AgentNoteTypeID_Clear = 1 THEN NULL ELSE ISNULL(@AgentNoteTypeID, NULL) END,
                CASE WHEN @Note_Clear = 1 THEN NULL ELSE ISNULL(@Note, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                ISNULL(@Type, 'Preference'),
                ISNULL(@IsAutoGenerated, 0),
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @SourceConversationID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationID, NULL) END,
                CASE WHEN @SourceConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationDetailID, NULL) END,
                CASE WHEN @SourceAIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@SourceAIAgentRunID, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, NULL) END,
                ISNULL(@AccessCount, 0),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @ConsolidatedIntoNoteID_Clear = 1 THEN NULL ELSE ISNULL(@ConsolidatedIntoNoteID, NULL) END,
                ISNULL(@ConsolidationCount, 0),
                CASE WHEN @DerivedFromNoteIDs_Clear = 1 THEN NULL ELSE ISNULL(@DerivedFromNoteIDs, NULL) END,
                ISNULL(@ProtectionTier, 'Standard'),
                CASE WHEN @ImportanceScore_Clear = 1 THEN NULL ELSE ISNULL(@ImportanceScore, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentNote]
            (
                [AgentID],
                [AgentNoteTypeID],
                [Note],
                [UserID],
                [Type],
                [IsAutoGenerated],
                [Comments],
                [Status],
                [SourceConversationID],
                [SourceConversationDetailID],
                [SourceAIAgentRunID],
                [CompanyID],
                [EmbeddingVector],
                [EmbeddingModelID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [LastAccessedAt],
                [AccessCount],
                [ExpiresAt],
                [ConsolidatedIntoNoteID],
                [ConsolidationCount],
                [DerivedFromNoteIDs],
                [ProtectionTier],
                [ImportanceScore]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @AgentNoteTypeID_Clear = 1 THEN NULL ELSE ISNULL(@AgentNoteTypeID, NULL) END,
                CASE WHEN @Note_Clear = 1 THEN NULL ELSE ISNULL(@Note, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                ISNULL(@Type, 'Preference'),
                ISNULL(@IsAutoGenerated, 0),
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                ISNULL(@Status, 'Active'),
                CASE WHEN @SourceConversationID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationID, NULL) END,
                CASE WHEN @SourceConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationDetailID, NULL) END,
                CASE WHEN @SourceAIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@SourceAIAgentRunID, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, NULL) END,
                CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, NULL) END,
                ISNULL(@AccessCount, 0),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @ConsolidatedIntoNoteID_Clear = 1 THEN NULL ELSE ISNULL(@ConsolidatedIntoNoteID, NULL) END,
                ISNULL(@ConsolidationCount, 0),
                CASE WHEN @DerivedFromNoteIDs_Clear = 1 THEN NULL ELSE ISNULL(@DerivedFromNoteIDs, NULL) END,
                ISNULL(@ProtectionTier, 'Standard'),
                CASE WHEN @ImportanceScore_Clear = 1 THEN NULL ELSE ISNULL(@ImportanceScore, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentNotes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentNote] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Notes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentNote] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: spUpdateAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentNote]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentNote];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentNote]
    @ID uniqueidentifier,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @AgentNoteTypeID_Clear bit = 0,
    @AgentNoteTypeID uniqueidentifier = NULL,
    @Note_Clear bit = 0,
    @Note nvarchar(MAX) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @Type nvarchar(20) = NULL,
    @IsAutoGenerated bit = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @SourceConversationID_Clear bit = 0,
    @SourceConversationID uniqueidentifier = NULL,
    @SourceConversationDetailID_Clear bit = 0,
    @SourceConversationDetailID uniqueidentifier = NULL,
    @SourceAIAgentRunID_Clear bit = 0,
    @SourceAIAgentRunID uniqueidentifier = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @EmbeddingVector_Clear bit = 0,
    @EmbeddingVector nvarchar(MAX) = NULL,
    @EmbeddingModelID_Clear bit = 0,
    @EmbeddingModelID uniqueidentifier = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @LastAccessedAt_Clear bit = 0,
    @LastAccessedAt datetimeoffset = NULL,
    @AccessCount int = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @ConsolidatedIntoNoteID_Clear bit = 0,
    @ConsolidatedIntoNoteID uniqueidentifier = NULL,
    @ConsolidationCount int = NULL,
    @DerivedFromNoteIDs_Clear bit = 0,
    @DerivedFromNoteIDs nvarchar(MAX) = NULL,
    @ProtectionTier nvarchar(20) = NULL,
    @ImportanceScore_Clear bit = 0,
    @ImportanceScore decimal(5, 2) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentNote]
    SET
        [AgentID] = CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, [AgentID]) END,
        [AgentNoteTypeID] = CASE WHEN @AgentNoteTypeID_Clear = 1 THEN NULL ELSE ISNULL(@AgentNoteTypeID, [AgentNoteTypeID]) END,
        [Note] = CASE WHEN @Note_Clear = 1 THEN NULL ELSE ISNULL(@Note, [Note]) END,
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [Type] = ISNULL(@Type, [Type]),
        [IsAutoGenerated] = ISNULL(@IsAutoGenerated, [IsAutoGenerated]),
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [Status] = ISNULL(@Status, [Status]),
        [SourceConversationID] = CASE WHEN @SourceConversationID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationID, [SourceConversationID]) END,
        [SourceConversationDetailID] = CASE WHEN @SourceConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@SourceConversationDetailID, [SourceConversationDetailID]) END,
        [SourceAIAgentRunID] = CASE WHEN @SourceAIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@SourceAIAgentRunID, [SourceAIAgentRunID]) END,
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END,
        [EmbeddingVector] = CASE WHEN @EmbeddingVector_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingVector, [EmbeddingVector]) END,
        [EmbeddingModelID] = CASE WHEN @EmbeddingModelID_Clear = 1 THEN NULL ELSE ISNULL(@EmbeddingModelID, [EmbeddingModelID]) END,
        [PrimaryScopeEntityID] = CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, [PrimaryScopeEntityID]) END,
        [PrimaryScopeRecordID] = CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, [PrimaryScopeRecordID]) END,
        [SecondaryScopes] = CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, [SecondaryScopes]) END,
        [LastAccessedAt] = CASE WHEN @LastAccessedAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAccessedAt, [LastAccessedAt]) END,
        [AccessCount] = ISNULL(@AccessCount, [AccessCount]),
        [ExpiresAt] = CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, [ExpiresAt]) END,
        [ConsolidatedIntoNoteID] = CASE WHEN @ConsolidatedIntoNoteID_Clear = 1 THEN NULL ELSE ISNULL(@ConsolidatedIntoNoteID, [ConsolidatedIntoNoteID]) END,
        [ConsolidationCount] = ISNULL(@ConsolidationCount, [ConsolidationCount]),
        [DerivedFromNoteIDs] = CASE WHEN @DerivedFromNoteIDs_Clear = 1 THEN NULL ELSE ISNULL(@DerivedFromNoteIDs, [DerivedFromNoteIDs]) END,
        [ProtectionTier] = ISNULL(@ProtectionTier, [ProtectionTier]),
        [ImportanceScore] = CASE WHEN @ImportanceScore_Clear = 1 THEN NULL ELSE ISNULL(@ImportanceScore, [ImportanceScore]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentNotes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentNotes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentNote] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentNote table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentNote]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentNote];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentNote
ON [${flyway:defaultSchema}].[AIAgentNote]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentNote]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentNote] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Notes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentNote] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: spDeleteAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentNote
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentNote]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentNote];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentNote]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentNote]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentNote] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Notes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentNote] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: AI Agent Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Medias
-- Item: vwAIAgentRunMedias
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Run Medias
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRunMedia
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentRunMedias]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentRunMedias];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRunMedias]
AS
SELECT
    a.*,
    MJAIAgentRun_AgentRunID.[ID] AS [AgentRun],
    MJAIPromptRunMedia_SourcePromptRunMediaID.[FileName] AS [SourcePromptRunMedia],
    MJAIModality_ModalityID.[Name] AS [Modality],
    MJFile_FileID.[Name] AS [File]
FROM
    [${flyway:defaultSchema}].[AIAgentRunMedia] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_AgentRunID
  ON
    [a].[AgentRunID] = MJAIAgentRun_AgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptRunMedia] AS MJAIPromptRunMedia_SourcePromptRunMediaID
  ON
    [a].[SourcePromptRunMediaID] = MJAIPromptRunMedia_SourcePromptRunMediaID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModality] AS MJAIModality_ModalityID
  ON
    [a].[ModalityID] = MJAIModality_ModalityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_FileID
  ON
    [a].[FileID] = MJFile_FileID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunMedias] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Medias
-- Item: Permissions for vwAIAgentRunMedias
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunMedias] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Medias
-- Item: spCreateAIAgentRunMedia
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRunMedia
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentRunMedia]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRunMedia];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRunMedia]
    @ID uniqueidentifier = NULL,
    @AgentRunID uniqueidentifier,
    @SourcePromptRunMediaID_Clear bit = 0,
    @SourcePromptRunMediaID uniqueidentifier = NULL,
    @ModalityID uniqueidentifier,
    @MimeType nvarchar(100),
    @FileName_Clear bit = 0,
    @FileName nvarchar(255) = NULL,
    @FileSizeBytes_Clear bit = 0,
    @FileSizeBytes int = NULL,
    @Width_Clear bit = 0,
    @Width int = NULL,
    @Height_Clear bit = 0,
    @Height int = NULL,
    @DurationSeconds_Clear bit = 0,
    @DurationSeconds decimal(10, 2) = NULL,
    @InlineData_Clear bit = 0,
    @InlineData nvarchar(MAX) = NULL,
    @FileID_Clear bit = 0,
    @FileID uniqueidentifier = NULL,
    @ThumbnailBase64_Clear bit = 0,
    @ThumbnailBase64 nvarchar(MAX) = NULL,
    @Label_Clear bit = 0,
    @Label nvarchar(255) = NULL,
    @Metadata_Clear bit = 0,
    @Metadata nvarchar(MAX) = NULL,
    @DisplayOrder int = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRunMedia]
            (
                [ID],
                [AgentRunID],
                [SourcePromptRunMediaID],
                [ModalityID],
                [MimeType],
                [FileName],
                [FileSizeBytes],
                [Width],
                [Height],
                [DurationSeconds],
                [InlineData],
                [FileID],
                [ThumbnailBase64],
                [Label],
                [Metadata],
                [DisplayOrder],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentRunID,
                CASE WHEN @SourcePromptRunMediaID_Clear = 1 THEN NULL ELSE ISNULL(@SourcePromptRunMediaID, NULL) END,
                @ModalityID,
                @MimeType,
                CASE WHEN @FileName_Clear = 1 THEN NULL ELSE ISNULL(@FileName, NULL) END,
                CASE WHEN @FileSizeBytes_Clear = 1 THEN NULL ELSE ISNULL(@FileSizeBytes, NULL) END,
                CASE WHEN @Width_Clear = 1 THEN NULL ELSE ISNULL(@Width, NULL) END,
                CASE WHEN @Height_Clear = 1 THEN NULL ELSE ISNULL(@Height, NULL) END,
                CASE WHEN @DurationSeconds_Clear = 1 THEN NULL ELSE ISNULL(@DurationSeconds, NULL) END,
                CASE WHEN @InlineData_Clear = 1 THEN NULL ELSE ISNULL(@InlineData, NULL) END,
                CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, NULL) END,
                CASE WHEN @ThumbnailBase64_Clear = 1 THEN NULL ELSE ISNULL(@ThumbnailBase64, NULL) END,
                CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, NULL) END,
                CASE WHEN @Metadata_Clear = 1 THEN NULL ELSE ISNULL(@Metadata, NULL) END,
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRunMedia]
            (
                [AgentRunID],
                [SourcePromptRunMediaID],
                [ModalityID],
                [MimeType],
                [FileName],
                [FileSizeBytes],
                [Width],
                [Height],
                [DurationSeconds],
                [InlineData],
                [FileID],
                [ThumbnailBase64],
                [Label],
                [Metadata],
                [DisplayOrder],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentRunID,
                CASE WHEN @SourcePromptRunMediaID_Clear = 1 THEN NULL ELSE ISNULL(@SourcePromptRunMediaID, NULL) END,
                @ModalityID,
                @MimeType,
                CASE WHEN @FileName_Clear = 1 THEN NULL ELSE ISNULL(@FileName, NULL) END,
                CASE WHEN @FileSizeBytes_Clear = 1 THEN NULL ELSE ISNULL(@FileSizeBytes, NULL) END,
                CASE WHEN @Width_Clear = 1 THEN NULL ELSE ISNULL(@Width, NULL) END,
                CASE WHEN @Height_Clear = 1 THEN NULL ELSE ISNULL(@Height, NULL) END,
                CASE WHEN @DurationSeconds_Clear = 1 THEN NULL ELSE ISNULL(@DurationSeconds, NULL) END,
                CASE WHEN @InlineData_Clear = 1 THEN NULL ELSE ISNULL(@InlineData, NULL) END,
                CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, NULL) END,
                CASE WHEN @ThumbnailBase64_Clear = 1 THEN NULL ELSE ISNULL(@ThumbnailBase64, NULL) END,
                CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, NULL) END,
                CASE WHEN @Metadata_Clear = 1 THEN NULL ELSE ISNULL(@Metadata, NULL) END,
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRunMedias] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunMedia] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Run Medias */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunMedia] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Medias
-- Item: spUpdateAIAgentRunMedia
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRunMedia
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentRunMedia]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRunMedia];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRunMedia]
    @ID uniqueidentifier,
    @AgentRunID uniqueidentifier = NULL,
    @SourcePromptRunMediaID_Clear bit = 0,
    @SourcePromptRunMediaID uniqueidentifier = NULL,
    @ModalityID uniqueidentifier = NULL,
    @MimeType nvarchar(100) = NULL,
    @FileName_Clear bit = 0,
    @FileName nvarchar(255) = NULL,
    @FileSizeBytes_Clear bit = 0,
    @FileSizeBytes int = NULL,
    @Width_Clear bit = 0,
    @Width int = NULL,
    @Height_Clear bit = 0,
    @Height int = NULL,
    @DurationSeconds_Clear bit = 0,
    @DurationSeconds decimal(10, 2) = NULL,
    @InlineData_Clear bit = 0,
    @InlineData nvarchar(MAX) = NULL,
    @FileID_Clear bit = 0,
    @FileID uniqueidentifier = NULL,
    @ThumbnailBase64_Clear bit = 0,
    @ThumbnailBase64 nvarchar(MAX) = NULL,
    @Label_Clear bit = 0,
    @Label nvarchar(255) = NULL,
    @Metadata_Clear bit = 0,
    @Metadata nvarchar(MAX) = NULL,
    @DisplayOrder int = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRunMedia]
    SET
        [AgentRunID] = ISNULL(@AgentRunID, [AgentRunID]),
        [SourcePromptRunMediaID] = CASE WHEN @SourcePromptRunMediaID_Clear = 1 THEN NULL ELSE ISNULL(@SourcePromptRunMediaID, [SourcePromptRunMediaID]) END,
        [ModalityID] = ISNULL(@ModalityID, [ModalityID]),
        [MimeType] = ISNULL(@MimeType, [MimeType]),
        [FileName] = CASE WHEN @FileName_Clear = 1 THEN NULL ELSE ISNULL(@FileName, [FileName]) END,
        [FileSizeBytes] = CASE WHEN @FileSizeBytes_Clear = 1 THEN NULL ELSE ISNULL(@FileSizeBytes, [FileSizeBytes]) END,
        [Width] = CASE WHEN @Width_Clear = 1 THEN NULL ELSE ISNULL(@Width, [Width]) END,
        [Height] = CASE WHEN @Height_Clear = 1 THEN NULL ELSE ISNULL(@Height, [Height]) END,
        [DurationSeconds] = CASE WHEN @DurationSeconds_Clear = 1 THEN NULL ELSE ISNULL(@DurationSeconds, [DurationSeconds]) END,
        [InlineData] = CASE WHEN @InlineData_Clear = 1 THEN NULL ELSE ISNULL(@InlineData, [InlineData]) END,
        [FileID] = CASE WHEN @FileID_Clear = 1 THEN NULL ELSE ISNULL(@FileID, [FileID]) END,
        [ThumbnailBase64] = CASE WHEN @ThumbnailBase64_Clear = 1 THEN NULL ELSE ISNULL(@ThumbnailBase64, [ThumbnailBase64]) END,
        [Label] = CASE WHEN @Label_Clear = 1 THEN NULL ELSE ISNULL(@Label, [Label]) END,
        [Metadata] = CASE WHEN @Metadata_Clear = 1 THEN NULL ELSE ISNULL(@Metadata, [Metadata]) END,
        [DisplayOrder] = ISNULL(@DisplayOrder, [DisplayOrder]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentRunMedias] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRunMedias]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunMedia] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRunMedia table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentRunMedia]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentRunMedia];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRunMedia
ON [${flyway:defaultSchema}].[AIAgentRunMedia]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRunMedia]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRunMedia] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Run Medias */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunMedia] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Medias
-- Item: spDeleteAIAgentRunMedia
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRunMedia
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRunMedia]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRunMedia];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRunMedia]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRunMedia]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRunMedia] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Run Medias */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRunMedia] TO [cdp_Developer], [cdp_Integration];

/* Base View SQL for MJ: AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Requests
-- Item: vwAIAgentRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Requests
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRequest
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentRequests]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentRequests];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRequests]
AS
SELECT
    a.*,
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJUser_RequestForUserID.[Name] AS [RequestForUser],
    MJUser_ResponseByUserID.[Name] AS [ResponseByUser],
    MJAIAgentRequestType_RequestTypeID.[Name] AS [RequestType],
    MJAIAgentRun_OriginatingAgentRunID.[ID] AS [OriginatingAgentRun],
    MJAIAgentRunStep_OriginatingAgentRunStepID.[StepName] AS [OriginatingAgentRunStep],
    MJAIAgentRun_ResumingAgentRunID.[ID] AS [ResumingAgentRun]
FROM
    [${flyway:defaultSchema}].[AIAgentRequest] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_RequestForUserID
  ON
    [a].[RequestForUserID] = MJUser_RequestForUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_ResponseByUserID
  ON
    [a].[ResponseByUserID] = MJUser_ResponseByUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRequestType] AS MJAIAgentRequestType_RequestTypeID
  ON
    [a].[RequestTypeID] = MJAIAgentRequestType_RequestTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_OriginatingAgentRunID
  ON
    [a].[OriginatingAgentRunID] = MJAIAgentRun_OriginatingAgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRunStep] AS MJAIAgentRunStep_OriginatingAgentRunStepID
  ON
    [a].[OriginatingAgentRunStepID] = MJAIAgentRunStep_OriginatingAgentRunStepID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_ResumingAgentRunID
  ON
    [a].[ResumingAgentRunID] = MJAIAgentRun_ResumingAgentRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRequests] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Requests
-- Item: Permissions for vwAIAgentRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRequests] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Requests
-- Item: spCreateAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRequest]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @RequestedAt datetimeoffset,
    @RequestForUserID_Clear bit = 0,
    @RequestForUserID uniqueidentifier = NULL,
    @Status nvarchar(20),
    @Request nvarchar(MAX),
    @Response_Clear bit = 0,
    @Response nvarchar(MAX) = NULL,
    @ResponseByUserID_Clear bit = 0,
    @ResponseByUserID uniqueidentifier = NULL,
    @RespondedAt_Clear bit = 0,
    @RespondedAt datetimeoffset = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @RequestTypeID_Clear bit = 0,
    @RequestTypeID uniqueidentifier = NULL,
    @ResponseSchema_Clear bit = 0,
    @ResponseSchema nvarchar(MAX) = NULL,
    @ResponseData_Clear bit = 0,
    @ResponseData nvarchar(MAX) = NULL,
    @Priority int = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @OriginatingAgentRunID_Clear bit = 0,
    @OriginatingAgentRunID uniqueidentifier = NULL,
    @OriginatingAgentRunStepID_Clear bit = 0,
    @OriginatingAgentRunStepID uniqueidentifier = NULL,
    @ResumingAgentRunID_Clear bit = 0,
    @ResumingAgentRunID uniqueidentifier = NULL,
    @ResponseSource_Clear bit = 0,
    @ResponseSource nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRequest]
            (
                [ID],
                [AgentID],
                [RequestedAt],
                [RequestForUserID],
                [Status],
                [Request],
                [Response],
                [ResponseByUserID],
                [RespondedAt],
                [Comments],
                [RequestTypeID],
                [ResponseSchema],
                [ResponseData],
                [Priority],
                [ExpiresAt],
                [OriginatingAgentRunID],
                [OriginatingAgentRunStepID],
                [ResumingAgentRunID],
                [ResponseSource]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @RequestedAt,
                CASE WHEN @RequestForUserID_Clear = 1 THEN NULL ELSE ISNULL(@RequestForUserID, NULL) END,
                @Status,
                @Request,
                CASE WHEN @Response_Clear = 1 THEN NULL ELSE ISNULL(@Response, NULL) END,
                CASE WHEN @ResponseByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ResponseByUserID, NULL) END,
                CASE WHEN @RespondedAt_Clear = 1 THEN NULL ELSE ISNULL(@RespondedAt, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @RequestTypeID_Clear = 1 THEN NULL ELSE ISNULL(@RequestTypeID, NULL) END,
                CASE WHEN @ResponseSchema_Clear = 1 THEN NULL ELSE ISNULL(@ResponseSchema, NULL) END,
                CASE WHEN @ResponseData_Clear = 1 THEN NULL ELSE ISNULL(@ResponseData, NULL) END,
                ISNULL(@Priority, 50),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @OriginatingAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@OriginatingAgentRunID, NULL) END,
                CASE WHEN @OriginatingAgentRunStepID_Clear = 1 THEN NULL ELSE ISNULL(@OriginatingAgentRunStepID, NULL) END,
                CASE WHEN @ResumingAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@ResumingAgentRunID, NULL) END,
                CASE WHEN @ResponseSource_Clear = 1 THEN NULL ELSE ISNULL(@ResponseSource, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRequest]
            (
                [AgentID],
                [RequestedAt],
                [RequestForUserID],
                [Status],
                [Request],
                [Response],
                [ResponseByUserID],
                [RespondedAt],
                [Comments],
                [RequestTypeID],
                [ResponseSchema],
                [ResponseData],
                [Priority],
                [ExpiresAt],
                [OriginatingAgentRunID],
                [OriginatingAgentRunStepID],
                [ResumingAgentRunID],
                [ResponseSource]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @RequestedAt,
                CASE WHEN @RequestForUserID_Clear = 1 THEN NULL ELSE ISNULL(@RequestForUserID, NULL) END,
                @Status,
                @Request,
                CASE WHEN @Response_Clear = 1 THEN NULL ELSE ISNULL(@Response, NULL) END,
                CASE WHEN @ResponseByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ResponseByUserID, NULL) END,
                CASE WHEN @RespondedAt_Clear = 1 THEN NULL ELSE ISNULL(@RespondedAt, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @RequestTypeID_Clear = 1 THEN NULL ELSE ISNULL(@RequestTypeID, NULL) END,
                CASE WHEN @ResponseSchema_Clear = 1 THEN NULL ELSE ISNULL(@ResponseSchema, NULL) END,
                CASE WHEN @ResponseData_Clear = 1 THEN NULL ELSE ISNULL(@ResponseData, NULL) END,
                ISNULL(@Priority, 50),
                CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, NULL) END,
                CASE WHEN @OriginatingAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@OriginatingAgentRunID, NULL) END,
                CASE WHEN @OriginatingAgentRunStepID_Clear = 1 THEN NULL ELSE ISNULL(@OriginatingAgentRunStepID, NULL) END,
                CASE WHEN @ResumingAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@ResumingAgentRunID, NULL) END,
                CASE WHEN @ResponseSource_Clear = 1 THEN NULL ELSE ISNULL(@ResponseSource, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRequests] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRequest] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRequest] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Requests
-- Item: spUpdateAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRequest]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier = NULL,
    @RequestedAt datetimeoffset = NULL,
    @RequestForUserID_Clear bit = 0,
    @RequestForUserID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @Request nvarchar(MAX) = NULL,
    @Response_Clear bit = 0,
    @Response nvarchar(MAX) = NULL,
    @ResponseByUserID_Clear bit = 0,
    @ResponseByUserID uniqueidentifier = NULL,
    @RespondedAt_Clear bit = 0,
    @RespondedAt datetimeoffset = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @RequestTypeID_Clear bit = 0,
    @RequestTypeID uniqueidentifier = NULL,
    @ResponseSchema_Clear bit = 0,
    @ResponseSchema nvarchar(MAX) = NULL,
    @ResponseData_Clear bit = 0,
    @ResponseData nvarchar(MAX) = NULL,
    @Priority int = NULL,
    @ExpiresAt_Clear bit = 0,
    @ExpiresAt datetimeoffset = NULL,
    @OriginatingAgentRunID_Clear bit = 0,
    @OriginatingAgentRunID uniqueidentifier = NULL,
    @OriginatingAgentRunStepID_Clear bit = 0,
    @OriginatingAgentRunStepID uniqueidentifier = NULL,
    @ResumingAgentRunID_Clear bit = 0,
    @ResumingAgentRunID uniqueidentifier = NULL,
    @ResponseSource_Clear bit = 0,
    @ResponseSource nvarchar(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRequest]
    SET
        [AgentID] = ISNULL(@AgentID, [AgentID]),
        [RequestedAt] = ISNULL(@RequestedAt, [RequestedAt]),
        [RequestForUserID] = CASE WHEN @RequestForUserID_Clear = 1 THEN NULL ELSE ISNULL(@RequestForUserID, [RequestForUserID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Request] = ISNULL(@Request, [Request]),
        [Response] = CASE WHEN @Response_Clear = 1 THEN NULL ELSE ISNULL(@Response, [Response]) END,
        [ResponseByUserID] = CASE WHEN @ResponseByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ResponseByUserID, [ResponseByUserID]) END,
        [RespondedAt] = CASE WHEN @RespondedAt_Clear = 1 THEN NULL ELSE ISNULL(@RespondedAt, [RespondedAt]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [RequestTypeID] = CASE WHEN @RequestTypeID_Clear = 1 THEN NULL ELSE ISNULL(@RequestTypeID, [RequestTypeID]) END,
        [ResponseSchema] = CASE WHEN @ResponseSchema_Clear = 1 THEN NULL ELSE ISNULL(@ResponseSchema, [ResponseSchema]) END,
        [ResponseData] = CASE WHEN @ResponseData_Clear = 1 THEN NULL ELSE ISNULL(@ResponseData, [ResponseData]) END,
        [Priority] = ISNULL(@Priority, [Priority]),
        [ExpiresAt] = CASE WHEN @ExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpiresAt, [ExpiresAt]) END,
        [OriginatingAgentRunID] = CASE WHEN @OriginatingAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@OriginatingAgentRunID, [OriginatingAgentRunID]) END,
        [OriginatingAgentRunStepID] = CASE WHEN @OriginatingAgentRunStepID_Clear = 1 THEN NULL ELSE ISNULL(@OriginatingAgentRunStepID, [OriginatingAgentRunStepID]) END,
        [ResumingAgentRunID] = CASE WHEN @ResumingAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@ResumingAgentRunID, [ResumingAgentRunID]) END,
        [ResponseSource] = CASE WHEN @ResponseSource_Clear = 1 THEN NULL ELSE ISNULL(@ResponseSource, [ResponseSource]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentRequests] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRequests]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRequest] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRequest table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentRequest]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentRequest];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRequest
ON [${flyway:defaultSchema}].[AIAgentRequest]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRequest]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRequest] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRequest] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Requests
-- Item: spDeleteAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRequest]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRequest];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRequest]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRequest]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRequest] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Requests */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRequest] TO [cdp_Developer], [cdp_Integration];

/* Root ID Function SQL for MJ: AI Agent Run Steps.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: fnAIAgentRunStepParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgentRunStep].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRunStep] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100
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
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentRunSteps]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentRunSteps];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRunSteps]
AS
SELECT
    a.*,
    MJAIAgentRun_AgentRunID.[ID] AS [AgentRun],
    MJAIAgentRunStep_ParentID.[StepName] AS [Parent],
    root_ParentID.RootID AS [RootParentID]
FROM
    [${flyway:defaultSchema}].[AIAgentRunStep] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_AgentRunID
  ON
    [a].[AgentRunID] = MJAIAgentRun_AgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRunStep] AS MJAIAgentRunStep_ParentID
  ON
    [a].[ParentID] = MJAIAgentRunStep_ParentID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentRunStepParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunSteps] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: Permissions for vwAIAgentRunSteps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRunSteps] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentRunStep]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRunStep];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRunStep]
    @ID uniqueidentifier = NULL,
    @AgentRunID uniqueidentifier,
    @StepNumber int,
    @StepType nvarchar(50) = NULL,
    @StepName nvarchar(255),
    @TargetID_Clear bit = 0,
    @TargetID uniqueidentifier = NULL,
    @Status nvarchar(50) = NULL,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @Success_Clear bit = 0,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @InputData_Clear bit = 0,
    @InputData nvarchar(MAX) = NULL,
    @OutputData_Clear bit = 0,
    @OutputData nvarchar(MAX) = NULL,
    @TargetLogID_Clear bit = 0,
    @TargetLogID uniqueidentifier = NULL,
    @PayloadAtStart_Clear bit = 0,
    @PayloadAtStart nvarchar(MAX) = NULL,
    @PayloadAtEnd_Clear bit = 0,
    @PayloadAtEnd nvarchar(MAX) = NULL,
    @FinalPayloadValidationResult_Clear bit = 0,
    @FinalPayloadValidationResult nvarchar(25) = NULL,
    @FinalPayloadValidationMessages_Clear bit = 0,
    @FinalPayloadValidationMessages nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
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
                [PayloadAtEnd],
                [FinalPayloadValidationResult],
                [FinalPayloadValidationMessages],
                [ParentID],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentRunID,
                @StepNumber,
                ISNULL(@StepType, 'Prompt'),
                @StepName,
                CASE WHEN @TargetID_Clear = 1 THEN NULL ELSE ISNULL(@TargetID, NULL) END,
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @InputData_Clear = 1 THEN NULL ELSE ISNULL(@InputData, NULL) END,
                CASE WHEN @OutputData_Clear = 1 THEN NULL ELSE ISNULL(@OutputData, NULL) END,
                CASE WHEN @TargetLogID_Clear = 1 THEN NULL ELSE ISNULL(@TargetLogID, NULL) END,
                CASE WHEN @PayloadAtStart_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtStart, NULL) END,
                CASE WHEN @PayloadAtEnd_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtEnd, NULL) END,
                CASE WHEN @FinalPayloadValidationResult_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidationResult, NULL) END,
                CASE WHEN @FinalPayloadValidationMessages_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidationMessages, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
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
                [PayloadAtEnd],
                [FinalPayloadValidationResult],
                [FinalPayloadValidationMessages],
                [ParentID],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentRunID,
                @StepNumber,
                ISNULL(@StepType, 'Prompt'),
                @StepName,
                CASE WHEN @TargetID_Clear = 1 THEN NULL ELSE ISNULL(@TargetID, NULL) END,
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @InputData_Clear = 1 THEN NULL ELSE ISNULL(@InputData, NULL) END,
                CASE WHEN @OutputData_Clear = 1 THEN NULL ELSE ISNULL(@OutputData, NULL) END,
                CASE WHEN @TargetLogID_Clear = 1 THEN NULL ELSE ISNULL(@TargetLogID, NULL) END,
                CASE WHEN @PayloadAtStart_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtStart, NULL) END,
                CASE WHEN @PayloadAtEnd_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtEnd, NULL) END,
                CASE WHEN @FinalPayloadValidationResult_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidationResult, NULL) END,
                CASE WHEN @FinalPayloadValidationMessages_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidationMessages, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRunSteps] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunStep] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Run Steps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRunStep] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentRunStep]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRunStep];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRunStep]
    @ID uniqueidentifier,
    @AgentRunID uniqueidentifier = NULL,
    @StepNumber int = NULL,
    @StepType nvarchar(50) = NULL,
    @StepName nvarchar(255) = NULL,
    @TargetID_Clear bit = 0,
    @TargetID uniqueidentifier = NULL,
    @Status nvarchar(50) = NULL,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @Success_Clear bit = 0,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @InputData_Clear bit = 0,
    @InputData nvarchar(MAX) = NULL,
    @OutputData_Clear bit = 0,
    @OutputData nvarchar(MAX) = NULL,
    @TargetLogID_Clear bit = 0,
    @TargetLogID uniqueidentifier = NULL,
    @PayloadAtStart_Clear bit = 0,
    @PayloadAtStart nvarchar(MAX) = NULL,
    @PayloadAtEnd_Clear bit = 0,
    @PayloadAtEnd nvarchar(MAX) = NULL,
    @FinalPayloadValidationResult_Clear bit = 0,
    @FinalPayloadValidationResult nvarchar(25) = NULL,
    @FinalPayloadValidationMessages_Clear bit = 0,
    @FinalPayloadValidationMessages nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRunStep]
    SET
        [AgentRunID] = ISNULL(@AgentRunID, [AgentRunID]),
        [StepNumber] = ISNULL(@StepNumber, [StepNumber]),
        [StepType] = ISNULL(@StepType, [StepType]),
        [StepName] = ISNULL(@StepName, [StepName]),
        [TargetID] = CASE WHEN @TargetID_Clear = 1 THEN NULL ELSE ISNULL(@TargetID, [TargetID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [Success] = CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, [Success]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [InputData] = CASE WHEN @InputData_Clear = 1 THEN NULL ELSE ISNULL(@InputData, [InputData]) END,
        [OutputData] = CASE WHEN @OutputData_Clear = 1 THEN NULL ELSE ISNULL(@OutputData, [OutputData]) END,
        [TargetLogID] = CASE WHEN @TargetLogID_Clear = 1 THEN NULL ELSE ISNULL(@TargetLogID, [TargetLogID]) END,
        [PayloadAtStart] = CASE WHEN @PayloadAtStart_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtStart, [PayloadAtStart]) END,
        [PayloadAtEnd] = CASE WHEN @PayloadAtEnd_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtEnd, [PayloadAtEnd]) END,
        [FinalPayloadValidationResult] = CASE WHEN @FinalPayloadValidationResult_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidationResult, [FinalPayloadValidationResult]) END,
        [FinalPayloadValidationMessages] = CASE WHEN @FinalPayloadValidationMessages_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayloadValidationMessages, [FinalPayloadValidationMessages]) END,
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentRunSteps] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRunSteps]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRunStep table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentRunStep]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentRunStep];
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

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Root ID Function SQL for MJ: AI Agent Runs.ParentRunID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunParentRunID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgentRun].[ParentRunID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentRunParentRunID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunParentRunID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunParentRunID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentRunID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentRunID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentRunID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [ParentRunID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Root ID Function SQL for MJ: AI Agent Runs.LastRunID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunLastRunID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIAgentRun].[LastRunID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIAgentRunLastRunID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunLastRunID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIAgentRunLastRunID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [LastRunID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[LastRunID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[LastRunID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [LastRunID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

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
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRuns]
AS
SELECT
    a.*,
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJAIAgentRun_ParentRunID.[ID] AS [ParentRun],
    MJConversation_ConversationID.[Name] AS [Conversation],
    MJUser_UserID.[Name] AS [User],
    MJConversationDetail_ConversationDetailID.[Message] AS [ConversationDetail],
    MJAIAgentRun_LastRunID.[ID] AS [LastRun],
    MJAIConfiguration_ConfigurationID.[Name] AS [Configuration],
    MJAIModel_OverrideModelID.[Name] AS [OverrideModel],
    MJAIVendor_OverrideVendorID.[Name] AS [OverrideVendor],
    MJScheduledJobRun_ScheduledJobRunID.[ScheduledJob] AS [ScheduledJobRun],
    MJTestRun_TestRunID.[Test] AS [TestRun],
    MJEntity_PrimaryScopeEntityID.[Name] AS [PrimaryScopeEntity],
    root_ParentRunID.RootID AS [RootParentRunID],
    root_LastRunID.RootID AS [RootLastRunID]
FROM
    [${flyway:defaultSchema}].[AIAgentRun] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_ParentRunID
  ON
    [a].[ParentRunID] = MJAIAgentRun_ParentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_ConversationID
  ON
    [a].[ConversationID] = MJConversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[ConversationDetail] AS MJConversationDetail_ConversationDetailID
  ON
    [a].[ConversationDetailID] = MJConversationDetail_ConversationDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_LastRunID
  ON
    [a].[LastRunID] = MJAIAgentRun_LastRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS MJAIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = MJAIConfiguration_ConfigurationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_OverrideModelID
  ON
    [a].[OverrideModelID] = MJAIModel_OverrideModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS MJAIVendor_OverrideVendorID
  ON
    [a].[OverrideVendorID] = MJAIVendor_OverrideVendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwScheduledJobRuns] AS MJScheduledJobRun_ScheduledJobRunID
  ON
    [a].[ScheduledJobRunID] = MJScheduledJobRun_ScheduledJobRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS MJTestRun_TestRunID
  ON
    [a].[TestRunID] = MJTestRun_TestRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_PrimaryScopeEntityID
  ON
    [a].[PrimaryScopeEntityID] = MJEntity_PrimaryScopeEntityID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentRunParentRunID_GetRootID]([a].[ID], [a].[ParentRunID]) AS root_ParentRunID
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIAgentRunLastRunID_GetRootID]([a].[ID], [a].[LastRunID]) AS root_LastRunID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: Permissions for vwAIAgentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRun]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @ParentRunID_Clear bit = 0,
    @ParentRunID uniqueidentifier = NULL,
    @Status nvarchar(50) = NULL,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @Success_Clear bit = 0,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ConversationID_Clear bit = 0,
    @ConversationID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @Result_Clear bit = 0,
    @Result nvarchar(MAX) = NULL,
    @AgentState_Clear bit = 0,
    @AgentState nvarchar(MAX) = NULL,
    @TotalTokensUsed_Clear bit = 0,
    @TotalTokensUsed int = NULL,
    @TotalCost_Clear bit = 0,
    @TotalCost decimal(18, 6) = NULL,
    @TotalPromptTokensUsed_Clear bit = 0,
    @TotalPromptTokensUsed int = NULL,
    @TotalCompletionTokensUsed_Clear bit = 0,
    @TotalCompletionTokensUsed int = NULL,
    @TotalTokensUsedRollup_Clear bit = 0,
    @TotalTokensUsedRollup int = NULL,
    @TotalPromptTokensUsedRollup_Clear bit = 0,
    @TotalPromptTokensUsedRollup int = NULL,
    @TotalCompletionTokensUsedRollup_Clear bit = 0,
    @TotalCompletionTokensUsedRollup int = NULL,
    @TotalCostRollup_Clear bit = 0,
    @TotalCostRollup decimal(19, 8) = NULL,
    @ConversationDetailID_Clear bit = 0,
    @ConversationDetailID uniqueidentifier = NULL,
    @ConversationDetailSequence_Clear bit = 0,
    @ConversationDetailSequence int = NULL,
    @CancellationReason_Clear bit = 0,
    @CancellationReason nvarchar(30) = NULL,
    @FinalStep_Clear bit = 0,
    @FinalStep nvarchar(30) = NULL,
    @FinalPayload_Clear bit = 0,
    @FinalPayload nvarchar(MAX) = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @LastRunID_Clear bit = 0,
    @LastRunID uniqueidentifier = NULL,
    @StartingPayload_Clear bit = 0,
    @StartingPayload nvarchar(MAX) = NULL,
    @TotalPromptIterations int = NULL,
    @ConfigurationID_Clear bit = 0,
    @ConfigurationID uniqueidentifier = NULL,
    @OverrideModelID_Clear bit = 0,
    @OverrideModelID uniqueidentifier = NULL,
    @OverrideVendorID_Clear bit = 0,
    @OverrideVendorID uniqueidentifier = NULL,
    @Data_Clear bit = 0,
    @Data nvarchar(MAX) = NULL,
    @Verbose_Clear bit = 0,
    @Verbose bit = NULL,
    @EffortLevel_Clear bit = 0,
    @EffortLevel int = NULL,
    @RunName_Clear bit = 0,
    @RunName nvarchar(255) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @ScheduledJobRunID_Clear bit = 0,
    @ScheduledJobRunID uniqueidentifier = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @ExternalReferenceID_Clear bit = 0,
    @ExternalReferenceID nvarchar(200) = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @TotalCacheReadTokensUsed_Clear bit = 0,
    @TotalCacheReadTokensUsed int = NULL,
    @TotalCacheWriteTokensUsed_Clear bit = 0,
    @TotalCacheWriteTokensUsed int = NULL,
    @LastHeartbeatAt_Clear bit = 0,
    @LastHeartbeatAt datetimeoffset = NULL
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
                [TotalPromptIterations],
                [ConfigurationID],
                [OverrideModelID],
                [OverrideVendorID],
                [Data],
                [Verbose],
                [EffortLevel],
                [RunName],
                [Comments],
                [ScheduledJobRunID],
                [TestRunID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [ExternalReferenceID],
                [CompanyID],
                [TotalCacheReadTokensUsed],
                [TotalCacheWriteTokensUsed],
                [LastHeartbeatAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                CASE WHEN @ParentRunID_Clear = 1 THEN NULL ELSE ISNULL(@ParentRunID, NULL) END,
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, NULL) END,
                CASE WHEN @AgentState_Clear = 1 THEN NULL ELSE ISNULL(@AgentState, NULL) END,
                CASE WHEN @TotalTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsed, 0) END,
                CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, 0.000000) END,
                CASE WHEN @TotalPromptTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsed, NULL) END,
                CASE WHEN @TotalCompletionTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsed, NULL) END,
                CASE WHEN @TotalTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsedRollup, NULL) END,
                CASE WHEN @TotalPromptTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsedRollup, NULL) END,
                CASE WHEN @TotalCompletionTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsedRollup, NULL) END,
                CASE WHEN @TotalCostRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCostRollup, NULL) END,
                CASE WHEN @ConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailID, NULL) END,
                CASE WHEN @ConversationDetailSequence_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailSequence, NULL) END,
                CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, NULL) END,
                CASE WHEN @FinalStep_Clear = 1 THEN NULL ELSE ISNULL(@FinalStep, NULL) END,
                CASE WHEN @FinalPayload_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayload, NULL) END,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                CASE WHEN @LastRunID_Clear = 1 THEN NULL ELSE ISNULL(@LastRunID, NULL) END,
                CASE WHEN @StartingPayload_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayload, NULL) END,
                ISNULL(@TotalPromptIterations, 0),
                CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, NULL) END,
                CASE WHEN @OverrideModelID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideModelID, NULL) END,
                CASE WHEN @OverrideVendorID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideVendorID, NULL) END,
                CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, NULL) END,
                CASE WHEN @Verbose_Clear = 1 THEN NULL ELSE ISNULL(@Verbose, 0) END,
                CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, NULL) END,
                CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @ExternalReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalReferenceID, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                CASE WHEN @TotalCacheReadTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheReadTokensUsed, NULL) END,
                CASE WHEN @TotalCacheWriteTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheWriteTokensUsed, NULL) END,
                CASE WHEN @LastHeartbeatAt_Clear = 1 THEN NULL ELSE ISNULL(@LastHeartbeatAt, NULL) END
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
                [TotalPromptIterations],
                [ConfigurationID],
                [OverrideModelID],
                [OverrideVendorID],
                [Data],
                [Verbose],
                [EffortLevel],
                [RunName],
                [Comments],
                [ScheduledJobRunID],
                [TestRunID],
                [PrimaryScopeEntityID],
                [PrimaryScopeRecordID],
                [SecondaryScopes],
                [ExternalReferenceID],
                [CompanyID],
                [TotalCacheReadTokensUsed],
                [TotalCacheWriteTokensUsed],
                [LastHeartbeatAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                CASE WHEN @ParentRunID_Clear = 1 THEN NULL ELSE ISNULL(@ParentRunID, NULL) END,
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, NULL) END,
                CASE WHEN @AgentState_Clear = 1 THEN NULL ELSE ISNULL(@AgentState, NULL) END,
                CASE WHEN @TotalTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsed, 0) END,
                CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, 0.000000) END,
                CASE WHEN @TotalPromptTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsed, NULL) END,
                CASE WHEN @TotalCompletionTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsed, NULL) END,
                CASE WHEN @TotalTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsedRollup, NULL) END,
                CASE WHEN @TotalPromptTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsedRollup, NULL) END,
                CASE WHEN @TotalCompletionTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsedRollup, NULL) END,
                CASE WHEN @TotalCostRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCostRollup, NULL) END,
                CASE WHEN @ConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailID, NULL) END,
                CASE WHEN @ConversationDetailSequence_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailSequence, NULL) END,
                CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, NULL) END,
                CASE WHEN @FinalStep_Clear = 1 THEN NULL ELSE ISNULL(@FinalStep, NULL) END,
                CASE WHEN @FinalPayload_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayload, NULL) END,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                CASE WHEN @LastRunID_Clear = 1 THEN NULL ELSE ISNULL(@LastRunID, NULL) END,
                CASE WHEN @StartingPayload_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayload, NULL) END,
                ISNULL(@TotalPromptIterations, 0),
                CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, NULL) END,
                CASE WHEN @OverrideModelID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideModelID, NULL) END,
                CASE WHEN @OverrideVendorID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideVendorID, NULL) END,
                CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, NULL) END,
                CASE WHEN @Verbose_Clear = 1 THEN NULL ELSE ISNULL(@Verbose, 0) END,
                CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, NULL) END,
                CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, NULL) END,
                CASE WHEN @ExternalReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalReferenceID, NULL) END,
                CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, NULL) END,
                CASE WHEN @TotalCacheReadTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheReadTokensUsed, NULL) END,
                CASE WHEN @TotalCacheWriteTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheWriteTokensUsed, NULL) END,
                CASE WHEN @LastHeartbeatAt_Clear = 1 THEN NULL ELSE ISNULL(@LastHeartbeatAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRun]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier = NULL,
    @ParentRunID_Clear bit = 0,
    @ParentRunID uniqueidentifier = NULL,
    @Status nvarchar(50) = NULL,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @Success_Clear bit = 0,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ConversationID_Clear bit = 0,
    @ConversationID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @Result_Clear bit = 0,
    @Result nvarchar(MAX) = NULL,
    @AgentState_Clear bit = 0,
    @AgentState nvarchar(MAX) = NULL,
    @TotalTokensUsed_Clear bit = 0,
    @TotalTokensUsed int = NULL,
    @TotalCost_Clear bit = 0,
    @TotalCost decimal(18, 6) = NULL,
    @TotalPromptTokensUsed_Clear bit = 0,
    @TotalPromptTokensUsed int = NULL,
    @TotalCompletionTokensUsed_Clear bit = 0,
    @TotalCompletionTokensUsed int = NULL,
    @TotalTokensUsedRollup_Clear bit = 0,
    @TotalTokensUsedRollup int = NULL,
    @TotalPromptTokensUsedRollup_Clear bit = 0,
    @TotalPromptTokensUsedRollup int = NULL,
    @TotalCompletionTokensUsedRollup_Clear bit = 0,
    @TotalCompletionTokensUsedRollup int = NULL,
    @TotalCostRollup_Clear bit = 0,
    @TotalCostRollup decimal(19, 8) = NULL,
    @ConversationDetailID_Clear bit = 0,
    @ConversationDetailID uniqueidentifier = NULL,
    @ConversationDetailSequence_Clear bit = 0,
    @ConversationDetailSequence int = NULL,
    @CancellationReason_Clear bit = 0,
    @CancellationReason nvarchar(30) = NULL,
    @FinalStep_Clear bit = 0,
    @FinalStep nvarchar(30) = NULL,
    @FinalPayload_Clear bit = 0,
    @FinalPayload nvarchar(MAX) = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @LastRunID_Clear bit = 0,
    @LastRunID uniqueidentifier = NULL,
    @StartingPayload_Clear bit = 0,
    @StartingPayload nvarchar(MAX) = NULL,
    @TotalPromptIterations int = NULL,
    @ConfigurationID_Clear bit = 0,
    @ConfigurationID uniqueidentifier = NULL,
    @OverrideModelID_Clear bit = 0,
    @OverrideModelID uniqueidentifier = NULL,
    @OverrideVendorID_Clear bit = 0,
    @OverrideVendorID uniqueidentifier = NULL,
    @Data_Clear bit = 0,
    @Data nvarchar(MAX) = NULL,
    @Verbose_Clear bit = 0,
    @Verbose bit = NULL,
    @EffortLevel_Clear bit = 0,
    @EffortLevel int = NULL,
    @RunName_Clear bit = 0,
    @RunName nvarchar(255) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @ScheduledJobRunID_Clear bit = 0,
    @ScheduledJobRunID uniqueidentifier = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @PrimaryScopeEntityID_Clear bit = 0,
    @PrimaryScopeEntityID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID nvarchar(100) = NULL,
    @SecondaryScopes_Clear bit = 0,
    @SecondaryScopes nvarchar(MAX) = NULL,
    @ExternalReferenceID_Clear bit = 0,
    @ExternalReferenceID nvarchar(200) = NULL,
    @CompanyID_Clear bit = 0,
    @CompanyID uniqueidentifier = NULL,
    @TotalCacheReadTokensUsed_Clear bit = 0,
    @TotalCacheReadTokensUsed int = NULL,
    @TotalCacheWriteTokensUsed_Clear bit = 0,
    @TotalCacheWriteTokensUsed int = NULL,
    @LastHeartbeatAt_Clear bit = 0,
    @LastHeartbeatAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRun]
    SET
        [AgentID] = ISNULL(@AgentID, [AgentID]),
        [ParentRunID] = CASE WHEN @ParentRunID_Clear = 1 THEN NULL ELSE ISNULL(@ParentRunID, [ParentRunID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [Success] = CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, [Success]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [ConversationID] = CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, [ConversationID]) END,
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [Result] = CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, [Result]) END,
        [AgentState] = CASE WHEN @AgentState_Clear = 1 THEN NULL ELSE ISNULL(@AgentState, [AgentState]) END,
        [TotalTokensUsed] = CASE WHEN @TotalTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsed, [TotalTokensUsed]) END,
        [TotalCost] = CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, [TotalCost]) END,
        [TotalPromptTokensUsed] = CASE WHEN @TotalPromptTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsed, [TotalPromptTokensUsed]) END,
        [TotalCompletionTokensUsed] = CASE WHEN @TotalCompletionTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsed, [TotalCompletionTokensUsed]) END,
        [TotalTokensUsedRollup] = CASE WHEN @TotalTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalTokensUsedRollup, [TotalTokensUsedRollup]) END,
        [TotalPromptTokensUsedRollup] = CASE WHEN @TotalPromptTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalPromptTokensUsedRollup, [TotalPromptTokensUsedRollup]) END,
        [TotalCompletionTokensUsedRollup] = CASE WHEN @TotalCompletionTokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCompletionTokensUsedRollup, [TotalCompletionTokensUsedRollup]) END,
        [TotalCostRollup] = CASE WHEN @TotalCostRollup_Clear = 1 THEN NULL ELSE ISNULL(@TotalCostRollup, [TotalCostRollup]) END,
        [ConversationDetailID] = CASE WHEN @ConversationDetailID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailID, [ConversationDetailID]) END,
        [ConversationDetailSequence] = CASE WHEN @ConversationDetailSequence_Clear = 1 THEN NULL ELSE ISNULL(@ConversationDetailSequence, [ConversationDetailSequence]) END,
        [CancellationReason] = CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, [CancellationReason]) END,
        [FinalStep] = CASE WHEN @FinalStep_Clear = 1 THEN NULL ELSE ISNULL(@FinalStep, [FinalStep]) END,
        [FinalPayload] = CASE WHEN @FinalPayload_Clear = 1 THEN NULL ELSE ISNULL(@FinalPayload, [FinalPayload]) END,
        [Message] = CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, [Message]) END,
        [LastRunID] = CASE WHEN @LastRunID_Clear = 1 THEN NULL ELSE ISNULL(@LastRunID, [LastRunID]) END,
        [StartingPayload] = CASE WHEN @StartingPayload_Clear = 1 THEN NULL ELSE ISNULL(@StartingPayload, [StartingPayload]) END,
        [TotalPromptIterations] = ISNULL(@TotalPromptIterations, [TotalPromptIterations]),
        [ConfigurationID] = CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, [ConfigurationID]) END,
        [OverrideModelID] = CASE WHEN @OverrideModelID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideModelID, [OverrideModelID]) END,
        [OverrideVendorID] = CASE WHEN @OverrideVendorID_Clear = 1 THEN NULL ELSE ISNULL(@OverrideVendorID, [OverrideVendorID]) END,
        [Data] = CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, [Data]) END,
        [Verbose] = CASE WHEN @Verbose_Clear = 1 THEN NULL ELSE ISNULL(@Verbose, [Verbose]) END,
        [EffortLevel] = CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, [EffortLevel]) END,
        [RunName] = CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, [RunName]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [ScheduledJobRunID] = CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, [ScheduledJobRunID]) END,
        [TestRunID] = CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, [TestRunID]) END,
        [PrimaryScopeEntityID] = CASE WHEN @PrimaryScopeEntityID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeEntityID, [PrimaryScopeEntityID]) END,
        [PrimaryScopeRecordID] = CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, [PrimaryScopeRecordID]) END,
        [SecondaryScopes] = CASE WHEN @SecondaryScopes_Clear = 1 THEN NULL ELSE ISNULL(@SecondaryScopes, [SecondaryScopes]) END,
        [ExternalReferenceID] = CASE WHEN @ExternalReferenceID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalReferenceID, [ExternalReferenceID]) END,
        [CompanyID] = CASE WHEN @CompanyID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyID, [CompanyID]) END,
        [TotalCacheReadTokensUsed] = CASE WHEN @TotalCacheReadTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheReadTokensUsed, [TotalCacheReadTokensUsed]) END,
        [TotalCacheWriteTokensUsed] = CASE WHEN @TotalCacheWriteTokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TotalCacheWriteTokensUsed, [TotalCacheWriteTokensUsed]) END,
        [LastHeartbeatAt] = CASE WHEN @LastHeartbeatAt_Clear = 1 THEN NULL ELSE ISNULL(@LastHeartbeatAt, [LastHeartbeatAt]) END
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

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentRun];
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

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRunStep]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRunStep];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRunStep]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_Priority int
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSource nvarchar(20)
    DECLARE cascade_update_MJAIAgentRequests_OriginatingAgentRunStepID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [OriginatingAgentRunStepID] = @ID

    OPEN cascade_update_MJAIAgentRequests_OriginatingAgentRunStepID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunStepID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunStepIDID, @MJAIAgentRequests_OriginatingAgentRunStepID_AgentID, @MJAIAgentRequests_OriginatingAgentRunStepID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunStepID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunStepID_Status, @MJAIAgentRequests_OriginatingAgentRunStepID_Request, @MJAIAgentRequests_OriginatingAgentRunStepID_Response, @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunStepID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunStepID_Comments, @MJAIAgentRequests_OriginatingAgentRunStepID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunStepID_Priority, @MJAIAgentRequests_OriginatingAgentRunStepID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunStepID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSource

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunStepID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_OriginatingAgentRunStepIDID, @AgentID = @MJAIAgentRequests_OriginatingAgentRunStepID_AgentID, @RequestedAt = @MJAIAgentRequests_OriginatingAgentRunStepID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_OriginatingAgentRunStepID_RequestForUserID, @Status = @MJAIAgentRequests_OriginatingAgentRunStepID_Status, @Request = @MJAIAgentRequests_OriginatingAgentRunStepID_Request, @Response = @MJAIAgentRequests_OriginatingAgentRunStepID_Response, @ResponseByUserID = @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_OriginatingAgentRunStepID_RespondedAt, @Comments = @MJAIAgentRequests_OriginatingAgentRunStepID_Comments, @RequestTypeID = @MJAIAgentRequests_OriginatingAgentRunStepID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSchema, @ResponseData = @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseData, @Priority = @MJAIAgentRequests_OriginatingAgentRunStepID_Priority, @ExpiresAt = @MJAIAgentRequests_OriginatingAgentRunStepID_ExpiresAt, @OriginatingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunID, @OriginatingAgentRunStepID_Clear = 1, @OriginatingAgentRunStepID = @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunStepID, @ResumingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunStepID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSource

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunStepID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunStepIDID, @MJAIAgentRequests_OriginatingAgentRunStepID_AgentID, @MJAIAgentRequests_OriginatingAgentRunStepID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunStepID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunStepID_Status, @MJAIAgentRequests_OriginatingAgentRunStepID_Request, @MJAIAgentRequests_OriginatingAgentRunStepID_Response, @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunStepID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunStepID_Comments, @MJAIAgentRequests_OriginatingAgentRunStepID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunStepID_Priority, @MJAIAgentRequests_OriginatingAgentRunStepID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunStepID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunStepID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSource
    END

    CLOSE cascade_update_MJAIAgentRequests_OriginatingAgentRunStepID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_OriginatingAgentRunStepID_cursor
    
    -- Cascade update on AIAgentRunStep using cursor to call spUpdateAIAgentRunStep
    DECLARE @MJAIAgentRunSteps_ParentIDID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_ParentID_AgentRunID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_ParentID_StepNumber int
    DECLARE @MJAIAgentRunSteps_ParentID_StepType nvarchar(50)
    DECLARE @MJAIAgentRunSteps_ParentID_StepName nvarchar(255)
    DECLARE @MJAIAgentRunSteps_ParentID_TargetID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_ParentID_Status nvarchar(50)
    DECLARE @MJAIAgentRunSteps_ParentID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRunSteps_ParentID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRunSteps_ParentID_Success bit
    DECLARE @MJAIAgentRunSteps_ParentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_InputData nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_OutputData nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_TargetLogID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_ParentID_PayloadAtStart nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_PayloadAtEnd nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult nvarchar(25)
    DECLARE @MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages nvarchar(MAX)
    DECLARE @MJAIAgentRunSteps_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIAgentRunSteps_ParentID_Comments nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentRunSteps_ParentID_cursor CURSOR FOR
        SELECT [ID], [AgentRunID], [StepNumber], [StepType], [StepName], [TargetID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [InputData], [OutputData], [TargetLogID], [PayloadAtStart], [PayloadAtEnd], [FinalPayloadValidationResult], [FinalPayloadValidationMessages], [ParentID], [Comments]
        FROM [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIAgentRunSteps_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRunSteps_ParentID_cursor INTO @MJAIAgentRunSteps_ParentIDID, @MJAIAgentRunSteps_ParentID_AgentRunID, @MJAIAgentRunSteps_ParentID_StepNumber, @MJAIAgentRunSteps_ParentID_StepType, @MJAIAgentRunSteps_ParentID_StepName, @MJAIAgentRunSteps_ParentID_TargetID, @MJAIAgentRunSteps_ParentID_Status, @MJAIAgentRunSteps_ParentID_StartedAt, @MJAIAgentRunSteps_ParentID_CompletedAt, @MJAIAgentRunSteps_ParentID_Success, @MJAIAgentRunSteps_ParentID_ErrorMessage, @MJAIAgentRunSteps_ParentID_InputData, @MJAIAgentRunSteps_ParentID_OutputData, @MJAIAgentRunSteps_ParentID_TargetLogID, @MJAIAgentRunSteps_ParentID_PayloadAtStart, @MJAIAgentRunSteps_ParentID_PayloadAtEnd, @MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult, @MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages, @MJAIAgentRunSteps_ParentID_ParentID, @MJAIAgentRunSteps_ParentID_Comments

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRunSteps_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRunStep] @ID = @MJAIAgentRunSteps_ParentIDID, @AgentRunID = @MJAIAgentRunSteps_ParentID_AgentRunID, @StepNumber = @MJAIAgentRunSteps_ParentID_StepNumber, @StepType = @MJAIAgentRunSteps_ParentID_StepType, @StepName = @MJAIAgentRunSteps_ParentID_StepName, @TargetID = @MJAIAgentRunSteps_ParentID_TargetID, @Status = @MJAIAgentRunSteps_ParentID_Status, @StartedAt = @MJAIAgentRunSteps_ParentID_StartedAt, @CompletedAt = @MJAIAgentRunSteps_ParentID_CompletedAt, @Success = @MJAIAgentRunSteps_ParentID_Success, @ErrorMessage = @MJAIAgentRunSteps_ParentID_ErrorMessage, @InputData = @MJAIAgentRunSteps_ParentID_InputData, @OutputData = @MJAIAgentRunSteps_ParentID_OutputData, @TargetLogID = @MJAIAgentRunSteps_ParentID_TargetLogID, @PayloadAtStart = @MJAIAgentRunSteps_ParentID_PayloadAtStart, @PayloadAtEnd = @MJAIAgentRunSteps_ParentID_PayloadAtEnd, @FinalPayloadValidationResult = @MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult, @FinalPayloadValidationMessages = @MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages, @ParentID_Clear = 1, @ParentID = @MJAIAgentRunSteps_ParentID_ParentID, @Comments = @MJAIAgentRunSteps_ParentID_Comments

        FETCH NEXT FROM cascade_update_MJAIAgentRunSteps_ParentID_cursor INTO @MJAIAgentRunSteps_ParentIDID, @MJAIAgentRunSteps_ParentID_AgentRunID, @MJAIAgentRunSteps_ParentID_StepNumber, @MJAIAgentRunSteps_ParentID_StepType, @MJAIAgentRunSteps_ParentID_StepName, @MJAIAgentRunSteps_ParentID_TargetID, @MJAIAgentRunSteps_ParentID_Status, @MJAIAgentRunSteps_ParentID_StartedAt, @MJAIAgentRunSteps_ParentID_CompletedAt, @MJAIAgentRunSteps_ParentID_Success, @MJAIAgentRunSteps_ParentID_ErrorMessage, @MJAIAgentRunSteps_ParentID_InputData, @MJAIAgentRunSteps_ParentID_OutputData, @MJAIAgentRunSteps_ParentID_TargetLogID, @MJAIAgentRunSteps_ParentID_PayloadAtStart, @MJAIAgentRunSteps_ParentID_PayloadAtEnd, @MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult, @MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages, @MJAIAgentRunSteps_ParentID_ParentID, @MJAIAgentRunSteps_ParentID_Comments
    END

    CLOSE cascade_update_MJAIAgentRunSteps_ParentID_cursor
    DEALLOCATE cascade_update_MJAIAgentRunSteps_ParentID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRunStep]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Run Steps */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] TO [cdp_Developer], [cdp_Integration];

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
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceAIAgentRunIDID, @AgentID = @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @UserID = @MJAIAgentExamples_SourceAIAgentRunID_UserID, @CompanyID = @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @Type = @MJAIAgentExamples_SourceAIAgentRunID_Type, @ExampleInput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @SourceConversationID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID_Clear = 1, @SourceAIAgentRunID = @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @Comments = @MJAIAgentExamples_SourceAIAgentRunID_Comments, @Status = @MJAIAgentExamples_SourceAIAgentRunID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor INTO @MJAIAgentExamples_SourceAIAgentRunIDID, @MJAIAgentExamples_SourceAIAgentRunID_AgentID, @MJAIAgentExamples_SourceAIAgentRunID_UserID, @MJAIAgentExamples_SourceAIAgentRunID_CompanyID, @MJAIAgentExamples_SourceAIAgentRunID_Type, @MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, @MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, @MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, @MJAIAgentExamples_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, @MJAIAgentExamples_SourceAIAgentRunID_Comments, @MJAIAgentExamples_SourceAIAgentRunID_Status, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentExamples_SourceAIAgentRunID_AccessCount, @MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceAIAgentRunID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceAIAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore decimal(5, 2)
    DECLARE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceAIAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceAIAgentRunIDID, @AgentID = @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceAIAgentRunID_Note, @UserID = @MJAIAgentNotes_SourceAIAgentRunID_UserID, @Type = @MJAIAgentNotes_SourceAIAgentRunID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceAIAgentRunID_Comments, @Status = @MJAIAgentNotes_SourceAIAgentRunID_Status, @SourceConversationID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @SourceAIAgentRunID_Clear = 1, @SourceAIAgentRunID = @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor INTO @MJAIAgentNotes_SourceAIAgentRunIDID, @MJAIAgentNotes_SourceAIAgentRunID_AgentID, @MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, @MJAIAgentNotes_SourceAIAgentRunID_Note, @MJAIAgentNotes_SourceAIAgentRunID_UserID, @MJAIAgentNotes_SourceAIAgentRunID_Type, @MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, @MJAIAgentNotes_SourceAIAgentRunID_Comments, @MJAIAgentNotes_SourceAIAgentRunID_Status, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, @MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, @MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, @MJAIAgentNotes_SourceAIAgentRunID_CompanyID, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, @MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, @MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, @MJAIAgentNotes_SourceAIAgentRunID_AccessCount, @MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, @MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, @MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceAIAgentRunID_cursor
    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_OriginatingAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_Priority int
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource nvarchar(20)
    DECLARE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [OriginatingAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunIDID, @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunID_Status, @MJAIAgentRequests_OriginatingAgentRunID_Request, @MJAIAgentRequests_OriginatingAgentRunID_Response, @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunID_Comments, @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunID_Priority, @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_OriginatingAgentRunIDID, @AgentID = @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @RequestedAt = @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @Status = @MJAIAgentRequests_OriginatingAgentRunID_Status, @Request = @MJAIAgentRequests_OriginatingAgentRunID_Request, @Response = @MJAIAgentRequests_OriginatingAgentRunID_Response, @ResponseByUserID = @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @Comments = @MJAIAgentRequests_OriginatingAgentRunID_Comments, @RequestTypeID = @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @ResponseData = @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @Priority = @MJAIAgentRequests_OriginatingAgentRunID_Priority, @ExpiresAt = @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @OriginatingAgentRunID_Clear = 1, @OriginatingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @OriginatingAgentRunStepID = @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @ResumingAgentRunID = @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor INTO @MJAIAgentRequests_OriginatingAgentRunIDID, @MJAIAgentRequests_OriginatingAgentRunID_AgentID, @MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, @MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, @MJAIAgentRequests_OriginatingAgentRunID_Status, @MJAIAgentRequests_OriginatingAgentRunID_Request, @MJAIAgentRequests_OriginatingAgentRunID_Response, @MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, @MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, @MJAIAgentRequests_OriginatingAgentRunID_Comments, @MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, @MJAIAgentRequests_OriginatingAgentRunID_ResponseData, @MJAIAgentRequests_OriginatingAgentRunID_Priority, @MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_OriginatingAgentRunID_ResponseSource
    END

    CLOSE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_OriginatingAgentRunID_cursor
    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest
    DECLARE @MJAIAgentRequests_ResumingAgentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestedAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Status nvarchar(20)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Request nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Response nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RespondedAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseData nvarchar(MAX)
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_Priority int
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID uniqueidentifier
    DECLARE @MJAIAgentRequests_ResumingAgentRunID_ResponseSource nvarchar(20)
    DECLARE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [RequestedAt], [RequestForUserID], [Status], [Request], [Response], [ResponseByUserID], [RespondedAt], [Comments], [RequestTypeID], [ResponseSchema], [ResponseData], [Priority], [ExpiresAt], [OriginatingAgentRunID], [OriginatingAgentRunStepID], [ResumingAgentRunID], [ResponseSource]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [ResumingAgentRunID] = @ID

    OPEN cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor INTO @MJAIAgentRequests_ResumingAgentRunIDID, @MJAIAgentRequests_ResumingAgentRunID_AgentID, @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @MJAIAgentRequests_ResumingAgentRunID_Status, @MJAIAgentRequests_ResumingAgentRunID_Request, @MJAIAgentRequests_ResumingAgentRunID_Response, @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @MJAIAgentRequests_ResumingAgentRunID_Comments, @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @MJAIAgentRequests_ResumingAgentRunID_Priority, @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSource

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRequest] @ID = @MJAIAgentRequests_ResumingAgentRunIDID, @AgentID = @MJAIAgentRequests_ResumingAgentRunID_AgentID, @RequestedAt = @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @RequestForUserID = @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @Status = @MJAIAgentRequests_ResumingAgentRunID_Status, @Request = @MJAIAgentRequests_ResumingAgentRunID_Request, @Response = @MJAIAgentRequests_ResumingAgentRunID_Response, @ResponseByUserID = @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @RespondedAt = @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @Comments = @MJAIAgentRequests_ResumingAgentRunID_Comments, @RequestTypeID = @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @ResponseSchema = @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @ResponseData = @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @Priority = @MJAIAgentRequests_ResumingAgentRunID_Priority, @ExpiresAt = @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @OriginatingAgentRunID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @OriginatingAgentRunStepID = @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @ResumingAgentRunID_Clear = 1, @ResumingAgentRunID = @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @ResponseSource = @MJAIAgentRequests_ResumingAgentRunID_ResponseSource

        FETCH NEXT FROM cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor INTO @MJAIAgentRequests_ResumingAgentRunIDID, @MJAIAgentRequests_ResumingAgentRunID_AgentID, @MJAIAgentRequests_ResumingAgentRunID_RequestedAt, @MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, @MJAIAgentRequests_ResumingAgentRunID_Status, @MJAIAgentRequests_ResumingAgentRunID_Request, @MJAIAgentRequests_ResumingAgentRunID_Response, @MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, @MJAIAgentRequests_ResumingAgentRunID_RespondedAt, @MJAIAgentRequests_ResumingAgentRunID_Comments, @MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, @MJAIAgentRequests_ResumingAgentRunID_ResponseData, @MJAIAgentRequests_ResumingAgentRunID_Priority, @MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunStepID, @MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, @MJAIAgentRequests_ResumingAgentRunID_ResponseSource
    END

    CLOSE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRequests_ResumingAgentRunID_cursor
    
    -- Cascade delete from AIAgentRunMedia using cursor to call spDeleteAIAgentRunMedia
    DECLARE @MJAIAgentRunMedias_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunMedia]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunMedia] @ID = @MJAIAgentRunMedias_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor INTO @MJAIAgentRunMedias_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunMedias_AgentRunID_cursor
    
    -- Cascade delete from AIAgentRunStep using cursor to call spDeleteAIAgentRunStep
    DECLARE @MJAIAgentRunSteps_AgentRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRunStep]
        WHERE [AgentRunID] = @ID
    
    OPEN cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRunStep] @ID = @MJAIAgentRunSteps_AgentRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor INTO @MJAIAgentRunSteps_AgentRunIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRunSteps_AgentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ParentRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ParentRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ParentRunID_Success bit
    DECLARE @MJAIAgentRuns_ParentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ParentRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ParentRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ParentRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_Verbose bit
    DECLARE @MJAIAgentRuns_ParentRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_ParentRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ParentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ParentRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ParentRunID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ParentRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_ParentRunID_LastHeartbeatAt datetimeoffset
    DECLARE cascade_update_MJAIAgentRuns_ParentRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ParentRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ParentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes, @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @MJAIAgentRuns_ParentRunID_CompanyID, @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ParentRunID_LastHeartbeatAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ParentRunID_ParentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ParentRunIDID, @AgentID = @MJAIAgentRuns_ParentRunID_AgentID, @ParentRunID_Clear = 1, @ParentRunID = @MJAIAgentRuns_ParentRunID_ParentRunID, @Status = @MJAIAgentRuns_ParentRunID_Status, @StartedAt = @MJAIAgentRuns_ParentRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_ParentRunID_CompletedAt, @Success = @MJAIAgentRuns_ParentRunID_Success, @ErrorMessage = @MJAIAgentRuns_ParentRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_ParentRunID_ConversationID, @UserID = @MJAIAgentRuns_ParentRunID_UserID, @Result = @MJAIAgentRuns_ParentRunID_Result, @AgentState = @MJAIAgentRuns_ParentRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ParentRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ParentRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ParentRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ParentRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_ParentRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_ParentRunID_FinalPayload, @Message = @MJAIAgentRuns_ParentRunID_Message, @LastRunID = @MJAIAgentRuns_ParentRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_ParentRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ParentRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ParentRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ParentRunID_OverrideVendorID, @Data = @MJAIAgentRuns_ParentRunID_Data, @Verbose = @MJAIAgentRuns_ParentRunID_Verbose, @EffortLevel = @MJAIAgentRuns_ParentRunID_EffortLevel, @RunName = @MJAIAgentRuns_ParentRunID_RunName, @Comments = @MJAIAgentRuns_ParentRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ParentRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ParentRunID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ParentRunID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_ParentRunID_LastHeartbeatAt

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ParentRunID_cursor INTO @MJAIAgentRuns_ParentRunIDID, @MJAIAgentRuns_ParentRunID_AgentID, @MJAIAgentRuns_ParentRunID_ParentRunID, @MJAIAgentRuns_ParentRunID_Status, @MJAIAgentRuns_ParentRunID_StartedAt, @MJAIAgentRuns_ParentRunID_CompletedAt, @MJAIAgentRuns_ParentRunID_Success, @MJAIAgentRuns_ParentRunID_ErrorMessage, @MJAIAgentRuns_ParentRunID_ConversationID, @MJAIAgentRuns_ParentRunID_UserID, @MJAIAgentRuns_ParentRunID_Result, @MJAIAgentRuns_ParentRunID_AgentState, @MJAIAgentRuns_ParentRunID_TotalTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCost, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ParentRunID_TotalCostRollup, @MJAIAgentRuns_ParentRunID_ConversationDetailID, @MJAIAgentRuns_ParentRunID_ConversationDetailSequence, @MJAIAgentRuns_ParentRunID_CancellationReason, @MJAIAgentRuns_ParentRunID_FinalStep, @MJAIAgentRuns_ParentRunID_FinalPayload, @MJAIAgentRuns_ParentRunID_Message, @MJAIAgentRuns_ParentRunID_LastRunID, @MJAIAgentRuns_ParentRunID_StartingPayload, @MJAIAgentRuns_ParentRunID_TotalPromptIterations, @MJAIAgentRuns_ParentRunID_ConfigurationID, @MJAIAgentRuns_ParentRunID_OverrideModelID, @MJAIAgentRuns_ParentRunID_OverrideVendorID, @MJAIAgentRuns_ParentRunID_Data, @MJAIAgentRuns_ParentRunID_Verbose, @MJAIAgentRuns_ParentRunID_EffortLevel, @MJAIAgentRuns_ParentRunID_RunName, @MJAIAgentRuns_ParentRunID_Comments, @MJAIAgentRuns_ParentRunID_ScheduledJobRunID, @MJAIAgentRuns_ParentRunID_TestRunID, @MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, @MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, @MJAIAgentRuns_ParentRunID_SecondaryScopes, @MJAIAgentRuns_ParentRunID_ExternalReferenceID, @MJAIAgentRuns_ParentRunID_CompanyID, @MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ParentRunID_LastHeartbeatAt
    END

    CLOSE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ParentRunID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_LastRunIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_LastRunID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_LastRunID_Success bit
    DECLARE @MJAIAgentRuns_LastRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_LastRunID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_LastRunID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_LastRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_Verbose bit
    DECLARE @MJAIAgentRuns_LastRunID_EffortLevel int
    DECLARE @MJAIAgentRuns_LastRunID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_LastRunID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_LastRunID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_LastRunID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_LastRunID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_LastRunID_LastHeartbeatAt datetimeoffset
    DECLARE cascade_update_MJAIAgentRuns_LastRunID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [LastRunID] = @ID

    OPEN cascade_update_MJAIAgentRuns_LastRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes, @MJAIAgentRuns_LastRunID_ExternalReferenceID, @MJAIAgentRuns_LastRunID_CompanyID, @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_LastRunID_LastHeartbeatAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_LastRunID_LastRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_LastRunIDID, @AgentID = @MJAIAgentRuns_LastRunID_AgentID, @ParentRunID = @MJAIAgentRuns_LastRunID_ParentRunID, @Status = @MJAIAgentRuns_LastRunID_Status, @StartedAt = @MJAIAgentRuns_LastRunID_StartedAt, @CompletedAt = @MJAIAgentRuns_LastRunID_CompletedAt, @Success = @MJAIAgentRuns_LastRunID_Success, @ErrorMessage = @MJAIAgentRuns_LastRunID_ErrorMessage, @ConversationID = @MJAIAgentRuns_LastRunID_ConversationID, @UserID = @MJAIAgentRuns_LastRunID_UserID, @Result = @MJAIAgentRuns_LastRunID_Result, @AgentState = @MJAIAgentRuns_LastRunID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_LastRunID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_LastRunID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_LastRunID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_LastRunID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_LastRunID_CancellationReason, @FinalStep = @MJAIAgentRuns_LastRunID_FinalStep, @FinalPayload = @MJAIAgentRuns_LastRunID_FinalPayload, @Message = @MJAIAgentRuns_LastRunID_Message, @LastRunID_Clear = 1, @LastRunID = @MJAIAgentRuns_LastRunID_LastRunID, @StartingPayload = @MJAIAgentRuns_LastRunID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_LastRunID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_LastRunID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_LastRunID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_LastRunID_OverrideVendorID, @Data = @MJAIAgentRuns_LastRunID_Data, @Verbose = @MJAIAgentRuns_LastRunID_Verbose, @EffortLevel = @MJAIAgentRuns_LastRunID_EffortLevel, @RunName = @MJAIAgentRuns_LastRunID_RunName, @Comments = @MJAIAgentRuns_LastRunID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_LastRunID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_LastRunID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_LastRunID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_LastRunID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_LastRunID_LastHeartbeatAt

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_LastRunID_cursor INTO @MJAIAgentRuns_LastRunIDID, @MJAIAgentRuns_LastRunID_AgentID, @MJAIAgentRuns_LastRunID_ParentRunID, @MJAIAgentRuns_LastRunID_Status, @MJAIAgentRuns_LastRunID_StartedAt, @MJAIAgentRuns_LastRunID_CompletedAt, @MJAIAgentRuns_LastRunID_Success, @MJAIAgentRuns_LastRunID_ErrorMessage, @MJAIAgentRuns_LastRunID_ConversationID, @MJAIAgentRuns_LastRunID_UserID, @MJAIAgentRuns_LastRunID_Result, @MJAIAgentRuns_LastRunID_AgentState, @MJAIAgentRuns_LastRunID_TotalTokensUsed, @MJAIAgentRuns_LastRunID_TotalCost, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, @MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_LastRunID_TotalCostRollup, @MJAIAgentRuns_LastRunID_ConversationDetailID, @MJAIAgentRuns_LastRunID_ConversationDetailSequence, @MJAIAgentRuns_LastRunID_CancellationReason, @MJAIAgentRuns_LastRunID_FinalStep, @MJAIAgentRuns_LastRunID_FinalPayload, @MJAIAgentRuns_LastRunID_Message, @MJAIAgentRuns_LastRunID_LastRunID, @MJAIAgentRuns_LastRunID_StartingPayload, @MJAIAgentRuns_LastRunID_TotalPromptIterations, @MJAIAgentRuns_LastRunID_ConfigurationID, @MJAIAgentRuns_LastRunID_OverrideModelID, @MJAIAgentRuns_LastRunID_OverrideVendorID, @MJAIAgentRuns_LastRunID_Data, @MJAIAgentRuns_LastRunID_Verbose, @MJAIAgentRuns_LastRunID_EffortLevel, @MJAIAgentRuns_LastRunID_RunName, @MJAIAgentRuns_LastRunID_Comments, @MJAIAgentRuns_LastRunID_ScheduledJobRunID, @MJAIAgentRuns_LastRunID_TestRunID, @MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, @MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, @MJAIAgentRuns_LastRunID_SecondaryScopes, @MJAIAgentRuns_LastRunID_ExternalReferenceID, @MJAIAgentRuns_LastRunID_CompanyID, @MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, @MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_LastRunID_LastHeartbeatAt
    END

    CLOSE cascade_update_MJAIAgentRuns_LastRunID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_LastRunID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_AgentRunIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_AgentRunID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_TokensUsed int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensPrompt int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCompletion int
    DECLARE @MJAIPromptRuns_AgentRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentRunID_Success bit
    DECLARE @MJAIPromptRuns_AgentRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_AgentRunID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_AgentRunID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentRunID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_AgentRunID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_TopK int
    DECLARE @MJAIPromptRuns_AgentRunID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentRunID_Seed int
    DECLARE @MJAIPromptRuns_AgentRunID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_LogProbs bit
    DECLARE @MJAIPromptRuns_AgentRunID_TopLogProbs int
    DECLARE @MJAIPromptRuns_AgentRunID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_AgentRunID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_AgentRunID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_AgentRunID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentRunID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_AgentRunID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_Cancelled bit
    DECLARE @MJAIPromptRuns_AgentRunID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_AgentRunID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentRunID_CacheHit bit
    DECLARE @MJAIPromptRuns_AgentRunID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentRunID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_AgentRunID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_AgentRunID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_AgentRunID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_AgentRunID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_QueueTime int
    DECLARE @MJAIPromptRuns_AgentRunID_PromptTime int
    DECLARE @MJAIPromptRuns_AgentRunID_CompletionTime int
    DECLARE @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_EffortLevel int
    DECLARE @MJAIPromptRuns_AgentRunID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentRunID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentRunID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_AgentRunID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [AgentRunID] = @ID

    OPEN cascade_update_MJAIPromptRuns_AgentRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentRunID_cursor INTO @MJAIPromptRuns_AgentRunIDID, @MJAIPromptRuns_AgentRunID_PromptID, @MJAIPromptRuns_AgentRunID_ModelID, @MJAIPromptRuns_AgentRunID_VendorID, @MJAIPromptRuns_AgentRunID_AgentID, @MJAIPromptRuns_AgentRunID_ConfigurationID, @MJAIPromptRuns_AgentRunID_RunAt, @MJAIPromptRuns_AgentRunID_CompletedAt, @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @MJAIPromptRuns_AgentRunID_Messages, @MJAIPromptRuns_AgentRunID_Result, @MJAIPromptRuns_AgentRunID_TokensUsed, @MJAIPromptRuns_AgentRunID_TokensPrompt, @MJAIPromptRuns_AgentRunID_TokensCompletion, @MJAIPromptRuns_AgentRunID_TotalCost, @MJAIPromptRuns_AgentRunID_Success, @MJAIPromptRuns_AgentRunID_ErrorMessage, @MJAIPromptRuns_AgentRunID_ParentID, @MJAIPromptRuns_AgentRunID_RunType, @MJAIPromptRuns_AgentRunID_ExecutionOrder, @MJAIPromptRuns_AgentRunID_AgentRunID, @MJAIPromptRuns_AgentRunID_Cost, @MJAIPromptRuns_AgentRunID_CostCurrency, @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @MJAIPromptRuns_AgentRunID_Temperature, @MJAIPromptRuns_AgentRunID_TopP, @MJAIPromptRuns_AgentRunID_TopK, @MJAIPromptRuns_AgentRunID_MinP, @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @MJAIPromptRuns_AgentRunID_PresencePenalty, @MJAIPromptRuns_AgentRunID_Seed, @MJAIPromptRuns_AgentRunID_StopSequences, @MJAIPromptRuns_AgentRunID_ResponseFormat, @MJAIPromptRuns_AgentRunID_LogProbs, @MJAIPromptRuns_AgentRunID_TopLogProbs, @MJAIPromptRuns_AgentRunID_DescendantCost, @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @MJAIPromptRuns_AgentRunID_ValidationBehavior, @MJAIPromptRuns_AgentRunID_RetryStrategy, @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @MJAIPromptRuns_AgentRunID_FinalValidationError, @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @MJAIPromptRuns_AgentRunID_CommonValidationError, @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @MJAIPromptRuns_AgentRunID_LastAttemptAt, @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @MJAIPromptRuns_AgentRunID_ValidationAttempts, @MJAIPromptRuns_AgentRunID_ValidationSummary, @MJAIPromptRuns_AgentRunID_FailoverAttempts, @MJAIPromptRuns_AgentRunID_FailoverErrors, @MJAIPromptRuns_AgentRunID_FailoverDurations, @MJAIPromptRuns_AgentRunID_OriginalModelID, @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @MJAIPromptRuns_AgentRunID_ModelSelection, @MJAIPromptRuns_AgentRunID_Status, @MJAIPromptRuns_AgentRunID_Cancelled, @MJAIPromptRuns_AgentRunID_CancellationReason, @MJAIPromptRuns_AgentRunID_ModelPowerRank, @MJAIPromptRuns_AgentRunID_SelectionStrategy, @MJAIPromptRuns_AgentRunID_CacheHit, @MJAIPromptRuns_AgentRunID_CacheKey, @MJAIPromptRuns_AgentRunID_JudgeID, @MJAIPromptRuns_AgentRunID_JudgeScore, @MJAIPromptRuns_AgentRunID_WasSelectedResult, @MJAIPromptRuns_AgentRunID_StreamingEnabled, @MJAIPromptRuns_AgentRunID_FirstTokenTime, @MJAIPromptRuns_AgentRunID_ErrorDetails, @MJAIPromptRuns_AgentRunID_ChildPromptID, @MJAIPromptRuns_AgentRunID_QueueTime, @MJAIPromptRuns_AgentRunID_PromptTime, @MJAIPromptRuns_AgentRunID_CompletionTime, @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentRunID_EffortLevel, @MJAIPromptRuns_AgentRunID_RunName, @MJAIPromptRuns_AgentRunID_Comments, @MJAIPromptRuns_AgentRunID_TestRunID, @MJAIPromptRuns_AgentRunID_AssistantPrefill, @MJAIPromptRuns_AgentRunID_TokensCacheRead, @MJAIPromptRuns_AgentRunID_TokensCacheWrite, @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup, @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_AgentRunID_AgentRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_AgentRunIDID, @PromptID = @MJAIPromptRuns_AgentRunID_PromptID, @ModelID = @MJAIPromptRuns_AgentRunID_ModelID, @VendorID = @MJAIPromptRuns_AgentRunID_VendorID, @AgentID = @MJAIPromptRuns_AgentRunID_AgentID, @ConfigurationID = @MJAIPromptRuns_AgentRunID_ConfigurationID, @RunAt = @MJAIPromptRuns_AgentRunID_RunAt, @CompletedAt = @MJAIPromptRuns_AgentRunID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_AgentRunID_Messages, @Result = @MJAIPromptRuns_AgentRunID_Result, @TokensUsed = @MJAIPromptRuns_AgentRunID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_AgentRunID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_AgentRunID_TokensCompletion, @TotalCost = @MJAIPromptRuns_AgentRunID_TotalCost, @Success = @MJAIPromptRuns_AgentRunID_Success, @ErrorMessage = @MJAIPromptRuns_AgentRunID_ErrorMessage, @ParentID = @MJAIPromptRuns_AgentRunID_ParentID, @RunType = @MJAIPromptRuns_AgentRunID_RunType, @ExecutionOrder = @MJAIPromptRuns_AgentRunID_ExecutionOrder, @AgentRunID_Clear = 1, @AgentRunID = @MJAIPromptRuns_AgentRunID_AgentRunID, @Cost = @MJAIPromptRuns_AgentRunID_Cost, @CostCurrency = @MJAIPromptRuns_AgentRunID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_AgentRunID_Temperature, @TopP = @MJAIPromptRuns_AgentRunID_TopP, @TopK = @MJAIPromptRuns_AgentRunID_TopK, @MinP = @MJAIPromptRuns_AgentRunID_MinP, @FrequencyPenalty = @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_AgentRunID_PresencePenalty, @Seed = @MJAIPromptRuns_AgentRunID_Seed, @StopSequences = @MJAIPromptRuns_AgentRunID_StopSequences, @ResponseFormat = @MJAIPromptRuns_AgentRunID_ResponseFormat, @LogProbs = @MJAIPromptRuns_AgentRunID_LogProbs, @TopLogProbs = @MJAIPromptRuns_AgentRunID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_AgentRunID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_AgentRunID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_AgentRunID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_AgentRunID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_AgentRunID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_AgentRunID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_AgentRunID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_AgentRunID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_AgentRunID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_AgentRunID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_AgentRunID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_AgentRunID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_AgentRunID_ModelSelection, @Status = @MJAIPromptRuns_AgentRunID_Status, @Cancelled = @MJAIPromptRuns_AgentRunID_Cancelled, @CancellationReason = @MJAIPromptRuns_AgentRunID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_AgentRunID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_AgentRunID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_AgentRunID_CacheHit, @CacheKey = @MJAIPromptRuns_AgentRunID_CacheKey, @JudgeID = @MJAIPromptRuns_AgentRunID_JudgeID, @JudgeScore = @MJAIPromptRuns_AgentRunID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_AgentRunID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_AgentRunID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_AgentRunID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_AgentRunID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_AgentRunID_ChildPromptID, @QueueTime = @MJAIPromptRuns_AgentRunID_QueueTime, @PromptTime = @MJAIPromptRuns_AgentRunID_PromptTime, @CompletionTime = @MJAIPromptRuns_AgentRunID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_AgentRunID_EffortLevel, @RunName = @MJAIPromptRuns_AgentRunID_RunName, @Comments = @MJAIPromptRuns_AgentRunID_Comments, @TestRunID = @MJAIPromptRuns_AgentRunID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_AgentRunID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_AgentRunID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_AgentRunID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentRunID_cursor INTO @MJAIPromptRuns_AgentRunIDID, @MJAIPromptRuns_AgentRunID_PromptID, @MJAIPromptRuns_AgentRunID_ModelID, @MJAIPromptRuns_AgentRunID_VendorID, @MJAIPromptRuns_AgentRunID_AgentID, @MJAIPromptRuns_AgentRunID_ConfigurationID, @MJAIPromptRuns_AgentRunID_RunAt, @MJAIPromptRuns_AgentRunID_CompletedAt, @MJAIPromptRuns_AgentRunID_ExecutionTimeMS, @MJAIPromptRuns_AgentRunID_Messages, @MJAIPromptRuns_AgentRunID_Result, @MJAIPromptRuns_AgentRunID_TokensUsed, @MJAIPromptRuns_AgentRunID_TokensPrompt, @MJAIPromptRuns_AgentRunID_TokensCompletion, @MJAIPromptRuns_AgentRunID_TotalCost, @MJAIPromptRuns_AgentRunID_Success, @MJAIPromptRuns_AgentRunID_ErrorMessage, @MJAIPromptRuns_AgentRunID_ParentID, @MJAIPromptRuns_AgentRunID_RunType, @MJAIPromptRuns_AgentRunID_ExecutionOrder, @MJAIPromptRuns_AgentRunID_AgentRunID, @MJAIPromptRuns_AgentRunID_Cost, @MJAIPromptRuns_AgentRunID_CostCurrency, @MJAIPromptRuns_AgentRunID_TokensUsedRollup, @MJAIPromptRuns_AgentRunID_TokensPromptRollup, @MJAIPromptRuns_AgentRunID_TokensCompletionRollup, @MJAIPromptRuns_AgentRunID_Temperature, @MJAIPromptRuns_AgentRunID_TopP, @MJAIPromptRuns_AgentRunID_TopK, @MJAIPromptRuns_AgentRunID_MinP, @MJAIPromptRuns_AgentRunID_FrequencyPenalty, @MJAIPromptRuns_AgentRunID_PresencePenalty, @MJAIPromptRuns_AgentRunID_Seed, @MJAIPromptRuns_AgentRunID_StopSequences, @MJAIPromptRuns_AgentRunID_ResponseFormat, @MJAIPromptRuns_AgentRunID_LogProbs, @MJAIPromptRuns_AgentRunID_TopLogProbs, @MJAIPromptRuns_AgentRunID_DescendantCost, @MJAIPromptRuns_AgentRunID_ValidationAttemptCount, @MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, @MJAIPromptRuns_AgentRunID_FinalValidationPassed, @MJAIPromptRuns_AgentRunID_ValidationBehavior, @MJAIPromptRuns_AgentRunID_RetryStrategy, @MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, @MJAIPromptRuns_AgentRunID_FinalValidationError, @MJAIPromptRuns_AgentRunID_ValidationErrorCount, @MJAIPromptRuns_AgentRunID_CommonValidationError, @MJAIPromptRuns_AgentRunID_FirstAttemptAt, @MJAIPromptRuns_AgentRunID_LastAttemptAt, @MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, @MJAIPromptRuns_AgentRunID_ValidationAttempts, @MJAIPromptRuns_AgentRunID_ValidationSummary, @MJAIPromptRuns_AgentRunID_FailoverAttempts, @MJAIPromptRuns_AgentRunID_FailoverErrors, @MJAIPromptRuns_AgentRunID_FailoverDurations, @MJAIPromptRuns_AgentRunID_OriginalModelID, @MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, @MJAIPromptRuns_AgentRunID_TotalFailoverDuration, @MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, @MJAIPromptRuns_AgentRunID_ModelSelection, @MJAIPromptRuns_AgentRunID_Status, @MJAIPromptRuns_AgentRunID_Cancelled, @MJAIPromptRuns_AgentRunID_CancellationReason, @MJAIPromptRuns_AgentRunID_ModelPowerRank, @MJAIPromptRuns_AgentRunID_SelectionStrategy, @MJAIPromptRuns_AgentRunID_CacheHit, @MJAIPromptRuns_AgentRunID_CacheKey, @MJAIPromptRuns_AgentRunID_JudgeID, @MJAIPromptRuns_AgentRunID_JudgeScore, @MJAIPromptRuns_AgentRunID_WasSelectedResult, @MJAIPromptRuns_AgentRunID_StreamingEnabled, @MJAIPromptRuns_AgentRunID_FirstTokenTime, @MJAIPromptRuns_AgentRunID_ErrorDetails, @MJAIPromptRuns_AgentRunID_ChildPromptID, @MJAIPromptRuns_AgentRunID_QueueTime, @MJAIPromptRuns_AgentRunID_PromptTime, @MJAIPromptRuns_AgentRunID_CompletionTime, @MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentRunID_EffortLevel, @MJAIPromptRuns_AgentRunID_RunName, @MJAIPromptRuns_AgentRunID_Comments, @MJAIPromptRuns_AgentRunID_TestRunID, @MJAIPromptRuns_AgentRunID_AssistantPrefill, @MJAIPromptRuns_AgentRunID_TokensCacheRead, @MJAIPromptRuns_AgentRunID_TokensCacheWrite, @MJAIPromptRuns_AgentRunID_TokensCacheReadRollup, @MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_AgentRunID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_AgentRunID_cursor
    

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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Developer], [cdp_Integration];

/* Root ID Function SQL for MJ: AI Prompt Runs.ParentID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: fnAIPromptRunParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIPromptRun].[ParentID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIPromptRunParentID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIPromptRunParentID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIPromptRunParentID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [ParentID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIPromptRun]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[ParentID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIPromptRun] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[ParentID]
        WHERE
            p.[Depth] < 100
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

/* Root ID Function SQL for MJ: AI Prompt Runs.RerunFromPromptRunID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: fnAIPromptRunRerunFromPromptRunID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [AIPromptRun].[RerunFromPromptRunID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnAIPromptRunRerunFromPromptRunID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnAIPromptRunRerunFromPromptRunID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnAIPromptRunRerunFromPromptRunID_GetRootID]
(
    @RecordID uniqueidentifier,
    @ParentID uniqueidentifier
)
RETURNS TABLE
AS
RETURN
(
    WITH CTE_RootParent AS (
        SELECT
            [ID],
            [RerunFromPromptRunID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIPromptRun]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[RerunFromPromptRunID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[AIPromptRun] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[RerunFromPromptRunID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [RerunFromPromptRunID] IS NULL
    ORDER BY
        [RootParentID]
);
GO

/* Base View SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: vwAIPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIPromptRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIPromptRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIPromptRuns];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIPromptRuns]
AS
SELECT
    a.*,
    MJAIPrompt_PromptID.[Name] AS [Prompt],
    MJAIModel_ModelID.[Name] AS [Model],
    MJAIVendor_VendorID.[Name] AS [Vendor],
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJAIConfiguration_ConfigurationID.[Name] AS [Configuration],
    MJAIPromptRun_ParentID.[RunName] AS [Parent],
    MJAIAgentRun_AgentRunID.[ID] AS [AgentRun],
    MJAIModel_OriginalModelID.[Name] AS [OriginalModel],
    MJAIPromptRun_RerunFromPromptRunID.[RunName] AS [RerunFromPromptRun],
    MJAIPrompt_JudgeID.[Name] AS [Judge],
    MJAIPrompt_ChildPromptID.[Name] AS [ChildPrompt],
    MJTestRun_TestRunID.[Test] AS [TestRun],
    root_ParentID.RootID AS [RootParentID],
    root_RerunFromPromptRunID.RootID AS [RootRerunFromPromptRunID]
FROM
    [${flyway:defaultSchema}].[AIPromptRun] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_PromptID
  ON
    [a].[PromptID] = MJAIPrompt_PromptID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_ModelID
  ON
    [a].[ModelID] = MJAIModel_ModelID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS MJAIVendor_VendorID
  ON
    [a].[VendorID] = MJAIVendor_VendorID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS MJAIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = MJAIConfiguration_ConfigurationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptRun] AS MJAIPromptRun_ParentID
  ON
    [a].[ParentID] = MJAIPromptRun_ParentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIAgentRun] AS MJAIAgentRun_AgentRunID
  ON
    [a].[AgentRunID] = MJAIAgentRun_AgentRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS MJAIModel_OriginalModelID
  ON
    [a].[OriginalModelID] = MJAIModel_OriginalModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPromptRun] AS MJAIPromptRun_RerunFromPromptRunID
  ON
    [a].[RerunFromPromptRunID] = MJAIPromptRun_RerunFromPromptRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_JudgeID
  ON
    [a].[JudgeID] = MJAIPrompt_JudgeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIPrompt] AS MJAIPrompt_ChildPromptID
  ON
    [a].[ChildPromptID] = MJAIPrompt_ChildPromptID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwTestRuns] AS MJTestRun_TestRunID
  ON
    [a].[TestRunID] = MJTestRun_TestRunID.[ID]
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIPromptRunParentID_GetRootID]([a].[ID], [a].[ParentID]) AS root_ParentID
OUTER APPLY
    [${flyway:defaultSchema}].[fnAIPromptRunRerunFromPromptRunID_GetRootID]([a].[ID], [a].[RerunFromPromptRunID]) AS root_RerunFromPromptRunID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: Permissions for vwAIPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIPromptRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spCreateAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptRun]
    @ID uniqueidentifier = NULL,
    @PromptID uniqueidentifier,
    @ModelID uniqueidentifier,
    @VendorID uniqueidentifier,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @ConfigurationID_Clear bit = 0,
    @ConfigurationID uniqueidentifier = NULL,
    @RunAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @ExecutionTimeMS_Clear bit = 0,
    @ExecutionTimeMS int = NULL,
    @Messages_Clear bit = 0,
    @Messages nvarchar(MAX) = NULL,
    @Result_Clear bit = 0,
    @Result nvarchar(MAX) = NULL,
    @TokensUsed_Clear bit = 0,
    @TokensUsed int = NULL,
    @TokensPrompt_Clear bit = 0,
    @TokensPrompt int = NULL,
    @TokensCompletion_Clear bit = 0,
    @TokensCompletion int = NULL,
    @TotalCost_Clear bit = 0,
    @TotalCost decimal(18, 6) = NULL,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @RunType nvarchar(20) = NULL,
    @ExecutionOrder_Clear bit = 0,
    @ExecutionOrder int = NULL,
    @AgentRunID_Clear bit = 0,
    @AgentRunID uniqueidentifier = NULL,
    @Cost_Clear bit = 0,
    @Cost decimal(19, 8) = NULL,
    @CostCurrency_Clear bit = 0,
    @CostCurrency nvarchar(10) = NULL,
    @TokensUsedRollup_Clear bit = 0,
    @TokensUsedRollup int = NULL,
    @TokensPromptRollup_Clear bit = 0,
    @TokensPromptRollup int = NULL,
    @TokensCompletionRollup_Clear bit = 0,
    @TokensCompletionRollup int = NULL,
    @Temperature_Clear bit = 0,
    @Temperature decimal(3, 2) = NULL,
    @TopP_Clear bit = 0,
    @TopP decimal(3, 2) = NULL,
    @TopK_Clear bit = 0,
    @TopK int = NULL,
    @MinP_Clear bit = 0,
    @MinP decimal(3, 2) = NULL,
    @FrequencyPenalty_Clear bit = 0,
    @FrequencyPenalty decimal(3, 2) = NULL,
    @PresencePenalty_Clear bit = 0,
    @PresencePenalty decimal(3, 2) = NULL,
    @Seed_Clear bit = 0,
    @Seed int = NULL,
    @StopSequences_Clear bit = 0,
    @StopSequences nvarchar(MAX) = NULL,
    @ResponseFormat_Clear bit = 0,
    @ResponseFormat nvarchar(50) = NULL,
    @LogProbs_Clear bit = 0,
    @LogProbs bit = NULL,
    @TopLogProbs_Clear bit = 0,
    @TopLogProbs int = NULL,
    @DescendantCost_Clear bit = 0,
    @DescendantCost decimal(18, 6) = NULL,
    @ValidationAttemptCount_Clear bit = 0,
    @ValidationAttemptCount int = NULL,
    @SuccessfulValidationCount_Clear bit = 0,
    @SuccessfulValidationCount int = NULL,
    @FinalValidationPassed_Clear bit = 0,
    @FinalValidationPassed bit = NULL,
    @ValidationBehavior_Clear bit = 0,
    @ValidationBehavior nvarchar(50) = NULL,
    @RetryStrategy_Clear bit = 0,
    @RetryStrategy nvarchar(50) = NULL,
    @MaxRetriesConfigured_Clear bit = 0,
    @MaxRetriesConfigured int = NULL,
    @FinalValidationError_Clear bit = 0,
    @FinalValidationError nvarchar(500) = NULL,
    @ValidationErrorCount_Clear bit = 0,
    @ValidationErrorCount int = NULL,
    @CommonValidationError_Clear bit = 0,
    @CommonValidationError nvarchar(255) = NULL,
    @FirstAttemptAt_Clear bit = 0,
    @FirstAttemptAt datetimeoffset = NULL,
    @LastAttemptAt_Clear bit = 0,
    @LastAttemptAt datetimeoffset = NULL,
    @TotalRetryDurationMS_Clear bit = 0,
    @TotalRetryDurationMS int = NULL,
    @ValidationAttempts_Clear bit = 0,
    @ValidationAttempts nvarchar(MAX) = NULL,
    @ValidationSummary_Clear bit = 0,
    @ValidationSummary nvarchar(MAX) = NULL,
    @FailoverAttempts_Clear bit = 0,
    @FailoverAttempts int = NULL,
    @FailoverErrors_Clear bit = 0,
    @FailoverErrors nvarchar(MAX) = NULL,
    @FailoverDurations_Clear bit = 0,
    @FailoverDurations nvarchar(MAX) = NULL,
    @OriginalModelID_Clear bit = 0,
    @OriginalModelID uniqueidentifier = NULL,
    @OriginalRequestStartTime_Clear bit = 0,
    @OriginalRequestStartTime datetimeoffset = NULL,
    @TotalFailoverDuration_Clear bit = 0,
    @TotalFailoverDuration int = NULL,
    @RerunFromPromptRunID_Clear bit = 0,
    @RerunFromPromptRunID uniqueidentifier = NULL,
    @ModelSelection_Clear bit = 0,
    @ModelSelection nvarchar(MAX) = NULL,
    @Status nvarchar(50) = NULL,
    @Cancelled bit = NULL,
    @CancellationReason_Clear bit = 0,
    @CancellationReason nvarchar(MAX) = NULL,
    @ModelPowerRank_Clear bit = 0,
    @ModelPowerRank int = NULL,
    @SelectionStrategy_Clear bit = 0,
    @SelectionStrategy nvarchar(50) = NULL,
    @CacheHit bit = NULL,
    @CacheKey_Clear bit = 0,
    @CacheKey nvarchar(500) = NULL,
    @JudgeID_Clear bit = 0,
    @JudgeID uniqueidentifier = NULL,
    @JudgeScore_Clear bit = 0,
    @JudgeScore float(53) = NULL,
    @WasSelectedResult bit = NULL,
    @StreamingEnabled bit = NULL,
    @FirstTokenTime_Clear bit = 0,
    @FirstTokenTime int = NULL,
    @ErrorDetails_Clear bit = 0,
    @ErrorDetails nvarchar(MAX) = NULL,
    @ChildPromptID_Clear bit = 0,
    @ChildPromptID uniqueidentifier = NULL,
    @QueueTime_Clear bit = 0,
    @QueueTime int = NULL,
    @PromptTime_Clear bit = 0,
    @PromptTime int = NULL,
    @CompletionTime_Clear bit = 0,
    @CompletionTime int = NULL,
    @ModelSpecificResponseDetails_Clear bit = 0,
    @ModelSpecificResponseDetails nvarchar(MAX) = NULL,
    @EffortLevel_Clear bit = 0,
    @EffortLevel int = NULL,
    @RunName_Clear bit = 0,
    @RunName nvarchar(255) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @AssistantPrefill_Clear bit = 0,
    @AssistantPrefill nvarchar(MAX) = NULL,
    @TokensCacheRead_Clear bit = 0,
    @TokensCacheRead int = NULL,
    @TokensCacheWrite_Clear bit = 0,
    @TokensCacheWrite int = NULL,
    @TokensCacheReadRollup_Clear bit = 0,
    @TokensCacheReadRollup int = NULL,
    @TokensCacheWriteRollup_Clear bit = 0,
    @TokensCacheWriteRollup int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIPromptRun]
            (
                [ID],
                [PromptID],
                [ModelID],
                [VendorID],
                [AgentID],
                [ConfigurationID],
                [RunAt],
                [CompletedAt],
                [ExecutionTimeMS],
                [Messages],
                [Result],
                [TokensUsed],
                [TokensPrompt],
                [TokensCompletion],
                [TotalCost],
                [Success],
                [ErrorMessage],
                [ParentID],
                [RunType],
                [ExecutionOrder],
                [AgentRunID],
                [Cost],
                [CostCurrency],
                [TokensUsedRollup],
                [TokensPromptRollup],
                [TokensCompletionRollup],
                [Temperature],
                [TopP],
                [TopK],
                [MinP],
                [FrequencyPenalty],
                [PresencePenalty],
                [Seed],
                [StopSequences],
                [ResponseFormat],
                [LogProbs],
                [TopLogProbs],
                [DescendantCost],
                [ValidationAttemptCount],
                [SuccessfulValidationCount],
                [FinalValidationPassed],
                [ValidationBehavior],
                [RetryStrategy],
                [MaxRetriesConfigured],
                [FinalValidationError],
                [ValidationErrorCount],
                [CommonValidationError],
                [FirstAttemptAt],
                [LastAttemptAt],
                [TotalRetryDurationMS],
                [ValidationAttempts],
                [ValidationSummary],
                [FailoverAttempts],
                [FailoverErrors],
                [FailoverDurations],
                [OriginalModelID],
                [OriginalRequestStartTime],
                [TotalFailoverDuration],
                [RerunFromPromptRunID],
                [ModelSelection],
                [Status],
                [Cancelled],
                [CancellationReason],
                [ModelPowerRank],
                [SelectionStrategy],
                [CacheHit],
                [CacheKey],
                [JudgeID],
                [JudgeScore],
                [WasSelectedResult],
                [StreamingEnabled],
                [FirstTokenTime],
                [ErrorDetails],
                [ChildPromptID],
                [QueueTime],
                [PromptTime],
                [CompletionTime],
                [ModelSpecificResponseDetails],
                [EffortLevel],
                [RunName],
                [Comments],
                [TestRunID],
                [AssistantPrefill],
                [TokensCacheRead],
                [TokensCacheWrite],
                [TokensCacheReadRollup],
                [TokensCacheWriteRollup]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PromptID,
                @ModelID,
                @VendorID,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, NULL) END,
                ISNULL(@RunAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @ExecutionTimeMS_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionTimeMS, NULL) END,
                CASE WHEN @Messages_Clear = 1 THEN NULL ELSE ISNULL(@Messages, NULL) END,
                CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, NULL) END,
                CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, NULL) END,
                CASE WHEN @TokensPrompt_Clear = 1 THEN NULL ELSE ISNULL(@TokensPrompt, NULL) END,
                CASE WHEN @TokensCompletion_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletion, NULL) END,
                CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, NULL) END,
                ISNULL(@Success, 0),
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                ISNULL(@RunType, 'Single'),
                CASE WHEN @ExecutionOrder_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionOrder, NULL) END,
                CASE WHEN @AgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AgentRunID, NULL) END,
                CASE WHEN @Cost_Clear = 1 THEN NULL ELSE ISNULL(@Cost, NULL) END,
                CASE WHEN @CostCurrency_Clear = 1 THEN NULL ELSE ISNULL(@CostCurrency, NULL) END,
                CASE WHEN @TokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsedRollup, NULL) END,
                CASE WHEN @TokensPromptRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensPromptRollup, NULL) END,
                CASE WHEN @TokensCompletionRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletionRollup, NULL) END,
                CASE WHEN @Temperature_Clear = 1 THEN NULL ELSE ISNULL(@Temperature, NULL) END,
                CASE WHEN @TopP_Clear = 1 THEN NULL ELSE ISNULL(@TopP, NULL) END,
                CASE WHEN @TopK_Clear = 1 THEN NULL ELSE ISNULL(@TopK, NULL) END,
                CASE WHEN @MinP_Clear = 1 THEN NULL ELSE ISNULL(@MinP, NULL) END,
                CASE WHEN @FrequencyPenalty_Clear = 1 THEN NULL ELSE ISNULL(@FrequencyPenalty, NULL) END,
                CASE WHEN @PresencePenalty_Clear = 1 THEN NULL ELSE ISNULL(@PresencePenalty, NULL) END,
                CASE WHEN @Seed_Clear = 1 THEN NULL ELSE ISNULL(@Seed, NULL) END,
                CASE WHEN @StopSequences_Clear = 1 THEN NULL ELSE ISNULL(@StopSequences, NULL) END,
                CASE WHEN @ResponseFormat_Clear = 1 THEN NULL ELSE ISNULL(@ResponseFormat, NULL) END,
                CASE WHEN @LogProbs_Clear = 1 THEN NULL ELSE ISNULL(@LogProbs, NULL) END,
                CASE WHEN @TopLogProbs_Clear = 1 THEN NULL ELSE ISNULL(@TopLogProbs, NULL) END,
                CASE WHEN @DescendantCost_Clear = 1 THEN NULL ELSE ISNULL(@DescendantCost, NULL) END,
                CASE WHEN @ValidationAttemptCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttemptCount, NULL) END,
                CASE WHEN @SuccessfulValidationCount_Clear = 1 THEN NULL ELSE ISNULL(@SuccessfulValidationCount, NULL) END,
                CASE WHEN @FinalValidationPassed_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationPassed, NULL) END,
                CASE WHEN @ValidationBehavior_Clear = 1 THEN NULL ELSE ISNULL(@ValidationBehavior, NULL) END,
                CASE WHEN @RetryStrategy_Clear = 1 THEN NULL ELSE ISNULL(@RetryStrategy, NULL) END,
                CASE WHEN @MaxRetriesConfigured_Clear = 1 THEN NULL ELSE ISNULL(@MaxRetriesConfigured, NULL) END,
                CASE WHEN @FinalValidationError_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationError, NULL) END,
                CASE WHEN @ValidationErrorCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationErrorCount, NULL) END,
                CASE WHEN @CommonValidationError_Clear = 1 THEN NULL ELSE ISNULL(@CommonValidationError, NULL) END,
                CASE WHEN @FirstAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstAttemptAt, NULL) END,
                CASE WHEN @LastAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAttemptAt, NULL) END,
                CASE WHEN @TotalRetryDurationMS_Clear = 1 THEN NULL ELSE ISNULL(@TotalRetryDurationMS, NULL) END,
                CASE WHEN @ValidationAttempts_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttempts, NULL) END,
                CASE WHEN @ValidationSummary_Clear = 1 THEN NULL ELSE ISNULL(@ValidationSummary, NULL) END,
                CASE WHEN @FailoverAttempts_Clear = 1 THEN NULL ELSE ISNULL(@FailoverAttempts, 0) END,
                CASE WHEN @FailoverErrors_Clear = 1 THEN NULL ELSE ISNULL(@FailoverErrors, NULL) END,
                CASE WHEN @FailoverDurations_Clear = 1 THEN NULL ELSE ISNULL(@FailoverDurations, NULL) END,
                CASE WHEN @OriginalModelID_Clear = 1 THEN NULL ELSE ISNULL(@OriginalModelID, NULL) END,
                CASE WHEN @OriginalRequestStartTime_Clear = 1 THEN NULL ELSE ISNULL(@OriginalRequestStartTime, NULL) END,
                CASE WHEN @TotalFailoverDuration_Clear = 1 THEN NULL ELSE ISNULL(@TotalFailoverDuration, NULL) END,
                CASE WHEN @RerunFromPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@RerunFromPromptRunID, NULL) END,
                CASE WHEN @ModelSelection_Clear = 1 THEN NULL ELSE ISNULL(@ModelSelection, NULL) END,
                ISNULL(@Status, 'Pending'),
                ISNULL(@Cancelled, 0),
                CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, NULL) END,
                CASE WHEN @ModelPowerRank_Clear = 1 THEN NULL ELSE ISNULL(@ModelPowerRank, NULL) END,
                CASE WHEN @SelectionStrategy_Clear = 1 THEN NULL ELSE ISNULL(@SelectionStrategy, NULL) END,
                ISNULL(@CacheHit, 0),
                CASE WHEN @CacheKey_Clear = 1 THEN NULL ELSE ISNULL(@CacheKey, NULL) END,
                CASE WHEN @JudgeID_Clear = 1 THEN NULL ELSE ISNULL(@JudgeID, NULL) END,
                CASE WHEN @JudgeScore_Clear = 1 THEN NULL ELSE ISNULL(@JudgeScore, NULL) END,
                ISNULL(@WasSelectedResult, 0),
                ISNULL(@StreamingEnabled, 0),
                CASE WHEN @FirstTokenTime_Clear = 1 THEN NULL ELSE ISNULL(@FirstTokenTime, NULL) END,
                CASE WHEN @ErrorDetails_Clear = 1 THEN NULL ELSE ISNULL(@ErrorDetails, NULL) END,
                CASE WHEN @ChildPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ChildPromptID, NULL) END,
                CASE WHEN @QueueTime_Clear = 1 THEN NULL ELSE ISNULL(@QueueTime, NULL) END,
                CASE WHEN @PromptTime_Clear = 1 THEN NULL ELSE ISNULL(@PromptTime, NULL) END,
                CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, NULL) END,
                CASE WHEN @ModelSpecificResponseDetails_Clear = 1 THEN NULL ELSE ISNULL(@ModelSpecificResponseDetails, NULL) END,
                CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, NULL) END,
                CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @AssistantPrefill_Clear = 1 THEN NULL ELSE ISNULL(@AssistantPrefill, NULL) END,
                CASE WHEN @TokensCacheRead_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheRead, NULL) END,
                CASE WHEN @TokensCacheWrite_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWrite, NULL) END,
                CASE WHEN @TokensCacheReadRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheReadRollup, NULL) END,
                CASE WHEN @TokensCacheWriteRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWriteRollup, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIPromptRun]
            (
                [PromptID],
                [ModelID],
                [VendorID],
                [AgentID],
                [ConfigurationID],
                [RunAt],
                [CompletedAt],
                [ExecutionTimeMS],
                [Messages],
                [Result],
                [TokensUsed],
                [TokensPrompt],
                [TokensCompletion],
                [TotalCost],
                [Success],
                [ErrorMessage],
                [ParentID],
                [RunType],
                [ExecutionOrder],
                [AgentRunID],
                [Cost],
                [CostCurrency],
                [TokensUsedRollup],
                [TokensPromptRollup],
                [TokensCompletionRollup],
                [Temperature],
                [TopP],
                [TopK],
                [MinP],
                [FrequencyPenalty],
                [PresencePenalty],
                [Seed],
                [StopSequences],
                [ResponseFormat],
                [LogProbs],
                [TopLogProbs],
                [DescendantCost],
                [ValidationAttemptCount],
                [SuccessfulValidationCount],
                [FinalValidationPassed],
                [ValidationBehavior],
                [RetryStrategy],
                [MaxRetriesConfigured],
                [FinalValidationError],
                [ValidationErrorCount],
                [CommonValidationError],
                [FirstAttemptAt],
                [LastAttemptAt],
                [TotalRetryDurationMS],
                [ValidationAttempts],
                [ValidationSummary],
                [FailoverAttempts],
                [FailoverErrors],
                [FailoverDurations],
                [OriginalModelID],
                [OriginalRequestStartTime],
                [TotalFailoverDuration],
                [RerunFromPromptRunID],
                [ModelSelection],
                [Status],
                [Cancelled],
                [CancellationReason],
                [ModelPowerRank],
                [SelectionStrategy],
                [CacheHit],
                [CacheKey],
                [JudgeID],
                [JudgeScore],
                [WasSelectedResult],
                [StreamingEnabled],
                [FirstTokenTime],
                [ErrorDetails],
                [ChildPromptID],
                [QueueTime],
                [PromptTime],
                [CompletionTime],
                [ModelSpecificResponseDetails],
                [EffortLevel],
                [RunName],
                [Comments],
                [TestRunID],
                [AssistantPrefill],
                [TokensCacheRead],
                [TokensCacheWrite],
                [TokensCacheReadRollup],
                [TokensCacheWriteRollup]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PromptID,
                @ModelID,
                @VendorID,
                CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, NULL) END,
                CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, NULL) END,
                ISNULL(@RunAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @ExecutionTimeMS_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionTimeMS, NULL) END,
                CASE WHEN @Messages_Clear = 1 THEN NULL ELSE ISNULL(@Messages, NULL) END,
                CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, NULL) END,
                CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, NULL) END,
                CASE WHEN @TokensPrompt_Clear = 1 THEN NULL ELSE ISNULL(@TokensPrompt, NULL) END,
                CASE WHEN @TokensCompletion_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletion, NULL) END,
                CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, NULL) END,
                ISNULL(@Success, 0),
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, NULL) END,
                ISNULL(@RunType, 'Single'),
                CASE WHEN @ExecutionOrder_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionOrder, NULL) END,
                CASE WHEN @AgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AgentRunID, NULL) END,
                CASE WHEN @Cost_Clear = 1 THEN NULL ELSE ISNULL(@Cost, NULL) END,
                CASE WHEN @CostCurrency_Clear = 1 THEN NULL ELSE ISNULL(@CostCurrency, NULL) END,
                CASE WHEN @TokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsedRollup, NULL) END,
                CASE WHEN @TokensPromptRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensPromptRollup, NULL) END,
                CASE WHEN @TokensCompletionRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletionRollup, NULL) END,
                CASE WHEN @Temperature_Clear = 1 THEN NULL ELSE ISNULL(@Temperature, NULL) END,
                CASE WHEN @TopP_Clear = 1 THEN NULL ELSE ISNULL(@TopP, NULL) END,
                CASE WHEN @TopK_Clear = 1 THEN NULL ELSE ISNULL(@TopK, NULL) END,
                CASE WHEN @MinP_Clear = 1 THEN NULL ELSE ISNULL(@MinP, NULL) END,
                CASE WHEN @FrequencyPenalty_Clear = 1 THEN NULL ELSE ISNULL(@FrequencyPenalty, NULL) END,
                CASE WHEN @PresencePenalty_Clear = 1 THEN NULL ELSE ISNULL(@PresencePenalty, NULL) END,
                CASE WHEN @Seed_Clear = 1 THEN NULL ELSE ISNULL(@Seed, NULL) END,
                CASE WHEN @StopSequences_Clear = 1 THEN NULL ELSE ISNULL(@StopSequences, NULL) END,
                CASE WHEN @ResponseFormat_Clear = 1 THEN NULL ELSE ISNULL(@ResponseFormat, NULL) END,
                CASE WHEN @LogProbs_Clear = 1 THEN NULL ELSE ISNULL(@LogProbs, NULL) END,
                CASE WHEN @TopLogProbs_Clear = 1 THEN NULL ELSE ISNULL(@TopLogProbs, NULL) END,
                CASE WHEN @DescendantCost_Clear = 1 THEN NULL ELSE ISNULL(@DescendantCost, NULL) END,
                CASE WHEN @ValidationAttemptCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttemptCount, NULL) END,
                CASE WHEN @SuccessfulValidationCount_Clear = 1 THEN NULL ELSE ISNULL(@SuccessfulValidationCount, NULL) END,
                CASE WHEN @FinalValidationPassed_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationPassed, NULL) END,
                CASE WHEN @ValidationBehavior_Clear = 1 THEN NULL ELSE ISNULL(@ValidationBehavior, NULL) END,
                CASE WHEN @RetryStrategy_Clear = 1 THEN NULL ELSE ISNULL(@RetryStrategy, NULL) END,
                CASE WHEN @MaxRetriesConfigured_Clear = 1 THEN NULL ELSE ISNULL(@MaxRetriesConfigured, NULL) END,
                CASE WHEN @FinalValidationError_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationError, NULL) END,
                CASE WHEN @ValidationErrorCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationErrorCount, NULL) END,
                CASE WHEN @CommonValidationError_Clear = 1 THEN NULL ELSE ISNULL(@CommonValidationError, NULL) END,
                CASE WHEN @FirstAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstAttemptAt, NULL) END,
                CASE WHEN @LastAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAttemptAt, NULL) END,
                CASE WHEN @TotalRetryDurationMS_Clear = 1 THEN NULL ELSE ISNULL(@TotalRetryDurationMS, NULL) END,
                CASE WHEN @ValidationAttempts_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttempts, NULL) END,
                CASE WHEN @ValidationSummary_Clear = 1 THEN NULL ELSE ISNULL(@ValidationSummary, NULL) END,
                CASE WHEN @FailoverAttempts_Clear = 1 THEN NULL ELSE ISNULL(@FailoverAttempts, 0) END,
                CASE WHEN @FailoverErrors_Clear = 1 THEN NULL ELSE ISNULL(@FailoverErrors, NULL) END,
                CASE WHEN @FailoverDurations_Clear = 1 THEN NULL ELSE ISNULL(@FailoverDurations, NULL) END,
                CASE WHEN @OriginalModelID_Clear = 1 THEN NULL ELSE ISNULL(@OriginalModelID, NULL) END,
                CASE WHEN @OriginalRequestStartTime_Clear = 1 THEN NULL ELSE ISNULL(@OriginalRequestStartTime, NULL) END,
                CASE WHEN @TotalFailoverDuration_Clear = 1 THEN NULL ELSE ISNULL(@TotalFailoverDuration, NULL) END,
                CASE WHEN @RerunFromPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@RerunFromPromptRunID, NULL) END,
                CASE WHEN @ModelSelection_Clear = 1 THEN NULL ELSE ISNULL(@ModelSelection, NULL) END,
                ISNULL(@Status, 'Pending'),
                ISNULL(@Cancelled, 0),
                CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, NULL) END,
                CASE WHEN @ModelPowerRank_Clear = 1 THEN NULL ELSE ISNULL(@ModelPowerRank, NULL) END,
                CASE WHEN @SelectionStrategy_Clear = 1 THEN NULL ELSE ISNULL(@SelectionStrategy, NULL) END,
                ISNULL(@CacheHit, 0),
                CASE WHEN @CacheKey_Clear = 1 THEN NULL ELSE ISNULL(@CacheKey, NULL) END,
                CASE WHEN @JudgeID_Clear = 1 THEN NULL ELSE ISNULL(@JudgeID, NULL) END,
                CASE WHEN @JudgeScore_Clear = 1 THEN NULL ELSE ISNULL(@JudgeScore, NULL) END,
                ISNULL(@WasSelectedResult, 0),
                ISNULL(@StreamingEnabled, 0),
                CASE WHEN @FirstTokenTime_Clear = 1 THEN NULL ELSE ISNULL(@FirstTokenTime, NULL) END,
                CASE WHEN @ErrorDetails_Clear = 1 THEN NULL ELSE ISNULL(@ErrorDetails, NULL) END,
                CASE WHEN @ChildPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ChildPromptID, NULL) END,
                CASE WHEN @QueueTime_Clear = 1 THEN NULL ELSE ISNULL(@QueueTime, NULL) END,
                CASE WHEN @PromptTime_Clear = 1 THEN NULL ELSE ISNULL(@PromptTime, NULL) END,
                CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, NULL) END,
                CASE WHEN @ModelSpecificResponseDetails_Clear = 1 THEN NULL ELSE ISNULL(@ModelSpecificResponseDetails, NULL) END,
                CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, NULL) END,
                CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, NULL) END,
                CASE WHEN @AssistantPrefill_Clear = 1 THEN NULL ELSE ISNULL(@AssistantPrefill, NULL) END,
                CASE WHEN @TokensCacheRead_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheRead, NULL) END,
                CASE WHEN @TokensCacheWrite_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWrite, NULL) END,
                CASE WHEN @TokensCacheReadRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheReadRollup, NULL) END,
                CASE WHEN @TokensCacheWriteRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWriteRollup, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIPromptRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spUpdateAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptRun]
    @ID uniqueidentifier,
    @PromptID uniqueidentifier = NULL,
    @ModelID uniqueidentifier = NULL,
    @VendorID uniqueidentifier = NULL,
    @AgentID_Clear bit = 0,
    @AgentID uniqueidentifier = NULL,
    @ConfigurationID_Clear bit = 0,
    @ConfigurationID uniqueidentifier = NULL,
    @RunAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @ExecutionTimeMS_Clear bit = 0,
    @ExecutionTimeMS int = NULL,
    @Messages_Clear bit = 0,
    @Messages nvarchar(MAX) = NULL,
    @Result_Clear bit = 0,
    @Result nvarchar(MAX) = NULL,
    @TokensUsed_Clear bit = 0,
    @TokensUsed int = NULL,
    @TokensPrompt_Clear bit = 0,
    @TokensPrompt int = NULL,
    @TokensCompletion_Clear bit = 0,
    @TokensCompletion int = NULL,
    @TotalCost_Clear bit = 0,
    @TotalCost decimal(18, 6) = NULL,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @RunType nvarchar(20) = NULL,
    @ExecutionOrder_Clear bit = 0,
    @ExecutionOrder int = NULL,
    @AgentRunID_Clear bit = 0,
    @AgentRunID uniqueidentifier = NULL,
    @Cost_Clear bit = 0,
    @Cost decimal(19, 8) = NULL,
    @CostCurrency_Clear bit = 0,
    @CostCurrency nvarchar(10) = NULL,
    @TokensUsedRollup_Clear bit = 0,
    @TokensUsedRollup int = NULL,
    @TokensPromptRollup_Clear bit = 0,
    @TokensPromptRollup int = NULL,
    @TokensCompletionRollup_Clear bit = 0,
    @TokensCompletionRollup int = NULL,
    @Temperature_Clear bit = 0,
    @Temperature decimal(3, 2) = NULL,
    @TopP_Clear bit = 0,
    @TopP decimal(3, 2) = NULL,
    @TopK_Clear bit = 0,
    @TopK int = NULL,
    @MinP_Clear bit = 0,
    @MinP decimal(3, 2) = NULL,
    @FrequencyPenalty_Clear bit = 0,
    @FrequencyPenalty decimal(3, 2) = NULL,
    @PresencePenalty_Clear bit = 0,
    @PresencePenalty decimal(3, 2) = NULL,
    @Seed_Clear bit = 0,
    @Seed int = NULL,
    @StopSequences_Clear bit = 0,
    @StopSequences nvarchar(MAX) = NULL,
    @ResponseFormat_Clear bit = 0,
    @ResponseFormat nvarchar(50) = NULL,
    @LogProbs_Clear bit = 0,
    @LogProbs bit = NULL,
    @TopLogProbs_Clear bit = 0,
    @TopLogProbs int = NULL,
    @DescendantCost_Clear bit = 0,
    @DescendantCost decimal(18, 6) = NULL,
    @ValidationAttemptCount_Clear bit = 0,
    @ValidationAttemptCount int = NULL,
    @SuccessfulValidationCount_Clear bit = 0,
    @SuccessfulValidationCount int = NULL,
    @FinalValidationPassed_Clear bit = 0,
    @FinalValidationPassed bit = NULL,
    @ValidationBehavior_Clear bit = 0,
    @ValidationBehavior nvarchar(50) = NULL,
    @RetryStrategy_Clear bit = 0,
    @RetryStrategy nvarchar(50) = NULL,
    @MaxRetriesConfigured_Clear bit = 0,
    @MaxRetriesConfigured int = NULL,
    @FinalValidationError_Clear bit = 0,
    @FinalValidationError nvarchar(500) = NULL,
    @ValidationErrorCount_Clear bit = 0,
    @ValidationErrorCount int = NULL,
    @CommonValidationError_Clear bit = 0,
    @CommonValidationError nvarchar(255) = NULL,
    @FirstAttemptAt_Clear bit = 0,
    @FirstAttemptAt datetimeoffset = NULL,
    @LastAttemptAt_Clear bit = 0,
    @LastAttemptAt datetimeoffset = NULL,
    @TotalRetryDurationMS_Clear bit = 0,
    @TotalRetryDurationMS int = NULL,
    @ValidationAttempts_Clear bit = 0,
    @ValidationAttempts nvarchar(MAX) = NULL,
    @ValidationSummary_Clear bit = 0,
    @ValidationSummary nvarchar(MAX) = NULL,
    @FailoverAttempts_Clear bit = 0,
    @FailoverAttempts int = NULL,
    @FailoverErrors_Clear bit = 0,
    @FailoverErrors nvarchar(MAX) = NULL,
    @FailoverDurations_Clear bit = 0,
    @FailoverDurations nvarchar(MAX) = NULL,
    @OriginalModelID_Clear bit = 0,
    @OriginalModelID uniqueidentifier = NULL,
    @OriginalRequestStartTime_Clear bit = 0,
    @OriginalRequestStartTime datetimeoffset = NULL,
    @TotalFailoverDuration_Clear bit = 0,
    @TotalFailoverDuration int = NULL,
    @RerunFromPromptRunID_Clear bit = 0,
    @RerunFromPromptRunID uniqueidentifier = NULL,
    @ModelSelection_Clear bit = 0,
    @ModelSelection nvarchar(MAX) = NULL,
    @Status nvarchar(50) = NULL,
    @Cancelled bit = NULL,
    @CancellationReason_Clear bit = 0,
    @CancellationReason nvarchar(MAX) = NULL,
    @ModelPowerRank_Clear bit = 0,
    @ModelPowerRank int = NULL,
    @SelectionStrategy_Clear bit = 0,
    @SelectionStrategy nvarchar(50) = NULL,
    @CacheHit bit = NULL,
    @CacheKey_Clear bit = 0,
    @CacheKey nvarchar(500) = NULL,
    @JudgeID_Clear bit = 0,
    @JudgeID uniqueidentifier = NULL,
    @JudgeScore_Clear bit = 0,
    @JudgeScore float(53) = NULL,
    @WasSelectedResult bit = NULL,
    @StreamingEnabled bit = NULL,
    @FirstTokenTime_Clear bit = 0,
    @FirstTokenTime int = NULL,
    @ErrorDetails_Clear bit = 0,
    @ErrorDetails nvarchar(MAX) = NULL,
    @ChildPromptID_Clear bit = 0,
    @ChildPromptID uniqueidentifier = NULL,
    @QueueTime_Clear bit = 0,
    @QueueTime int = NULL,
    @PromptTime_Clear bit = 0,
    @PromptTime int = NULL,
    @CompletionTime_Clear bit = 0,
    @CompletionTime int = NULL,
    @ModelSpecificResponseDetails_Clear bit = 0,
    @ModelSpecificResponseDetails nvarchar(MAX) = NULL,
    @EffortLevel_Clear bit = 0,
    @EffortLevel int = NULL,
    @RunName_Clear bit = 0,
    @RunName nvarchar(255) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @TestRunID_Clear bit = 0,
    @TestRunID uniqueidentifier = NULL,
    @AssistantPrefill_Clear bit = 0,
    @AssistantPrefill nvarchar(MAX) = NULL,
    @TokensCacheRead_Clear bit = 0,
    @TokensCacheRead int = NULL,
    @TokensCacheWrite_Clear bit = 0,
    @TokensCacheWrite int = NULL,
    @TokensCacheReadRollup_Clear bit = 0,
    @TokensCacheReadRollup int = NULL,
    @TokensCacheWriteRollup_Clear bit = 0,
    @TokensCacheWriteRollup int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptRun]
    SET
        [PromptID] = ISNULL(@PromptID, [PromptID]),
        [ModelID] = ISNULL(@ModelID, [ModelID]),
        [VendorID] = ISNULL(@VendorID, [VendorID]),
        [AgentID] = CASE WHEN @AgentID_Clear = 1 THEN NULL ELSE ISNULL(@AgentID, [AgentID]) END,
        [ConfigurationID] = CASE WHEN @ConfigurationID_Clear = 1 THEN NULL ELSE ISNULL(@ConfigurationID, [ConfigurationID]) END,
        [RunAt] = ISNULL(@RunAt, [RunAt]),
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [ExecutionTimeMS] = CASE WHEN @ExecutionTimeMS_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionTimeMS, [ExecutionTimeMS]) END,
        [Messages] = CASE WHEN @Messages_Clear = 1 THEN NULL ELSE ISNULL(@Messages, [Messages]) END,
        [Result] = CASE WHEN @Result_Clear = 1 THEN NULL ELSE ISNULL(@Result, [Result]) END,
        [TokensUsed] = CASE WHEN @TokensUsed_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsed, [TokensUsed]) END,
        [TokensPrompt] = CASE WHEN @TokensPrompt_Clear = 1 THEN NULL ELSE ISNULL(@TokensPrompt, [TokensPrompt]) END,
        [TokensCompletion] = CASE WHEN @TokensCompletion_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletion, [TokensCompletion]) END,
        [TotalCost] = CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, [TotalCost]) END,
        [Success] = ISNULL(@Success, [Success]),
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [ParentID] = CASE WHEN @ParentID_Clear = 1 THEN NULL ELSE ISNULL(@ParentID, [ParentID]) END,
        [RunType] = ISNULL(@RunType, [RunType]),
        [ExecutionOrder] = CASE WHEN @ExecutionOrder_Clear = 1 THEN NULL ELSE ISNULL(@ExecutionOrder, [ExecutionOrder]) END,
        [AgentRunID] = CASE WHEN @AgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AgentRunID, [AgentRunID]) END,
        [Cost] = CASE WHEN @Cost_Clear = 1 THEN NULL ELSE ISNULL(@Cost, [Cost]) END,
        [CostCurrency] = CASE WHEN @CostCurrency_Clear = 1 THEN NULL ELSE ISNULL(@CostCurrency, [CostCurrency]) END,
        [TokensUsedRollup] = CASE WHEN @TokensUsedRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensUsedRollup, [TokensUsedRollup]) END,
        [TokensPromptRollup] = CASE WHEN @TokensPromptRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensPromptRollup, [TokensPromptRollup]) END,
        [TokensCompletionRollup] = CASE WHEN @TokensCompletionRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCompletionRollup, [TokensCompletionRollup]) END,
        [Temperature] = CASE WHEN @Temperature_Clear = 1 THEN NULL ELSE ISNULL(@Temperature, [Temperature]) END,
        [TopP] = CASE WHEN @TopP_Clear = 1 THEN NULL ELSE ISNULL(@TopP, [TopP]) END,
        [TopK] = CASE WHEN @TopK_Clear = 1 THEN NULL ELSE ISNULL(@TopK, [TopK]) END,
        [MinP] = CASE WHEN @MinP_Clear = 1 THEN NULL ELSE ISNULL(@MinP, [MinP]) END,
        [FrequencyPenalty] = CASE WHEN @FrequencyPenalty_Clear = 1 THEN NULL ELSE ISNULL(@FrequencyPenalty, [FrequencyPenalty]) END,
        [PresencePenalty] = CASE WHEN @PresencePenalty_Clear = 1 THEN NULL ELSE ISNULL(@PresencePenalty, [PresencePenalty]) END,
        [Seed] = CASE WHEN @Seed_Clear = 1 THEN NULL ELSE ISNULL(@Seed, [Seed]) END,
        [StopSequences] = CASE WHEN @StopSequences_Clear = 1 THEN NULL ELSE ISNULL(@StopSequences, [StopSequences]) END,
        [ResponseFormat] = CASE WHEN @ResponseFormat_Clear = 1 THEN NULL ELSE ISNULL(@ResponseFormat, [ResponseFormat]) END,
        [LogProbs] = CASE WHEN @LogProbs_Clear = 1 THEN NULL ELSE ISNULL(@LogProbs, [LogProbs]) END,
        [TopLogProbs] = CASE WHEN @TopLogProbs_Clear = 1 THEN NULL ELSE ISNULL(@TopLogProbs, [TopLogProbs]) END,
        [DescendantCost] = CASE WHEN @DescendantCost_Clear = 1 THEN NULL ELSE ISNULL(@DescendantCost, [DescendantCost]) END,
        [ValidationAttemptCount] = CASE WHEN @ValidationAttemptCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttemptCount, [ValidationAttemptCount]) END,
        [SuccessfulValidationCount] = CASE WHEN @SuccessfulValidationCount_Clear = 1 THEN NULL ELSE ISNULL(@SuccessfulValidationCount, [SuccessfulValidationCount]) END,
        [FinalValidationPassed] = CASE WHEN @FinalValidationPassed_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationPassed, [FinalValidationPassed]) END,
        [ValidationBehavior] = CASE WHEN @ValidationBehavior_Clear = 1 THEN NULL ELSE ISNULL(@ValidationBehavior, [ValidationBehavior]) END,
        [RetryStrategy] = CASE WHEN @RetryStrategy_Clear = 1 THEN NULL ELSE ISNULL(@RetryStrategy, [RetryStrategy]) END,
        [MaxRetriesConfigured] = CASE WHEN @MaxRetriesConfigured_Clear = 1 THEN NULL ELSE ISNULL(@MaxRetriesConfigured, [MaxRetriesConfigured]) END,
        [FinalValidationError] = CASE WHEN @FinalValidationError_Clear = 1 THEN NULL ELSE ISNULL(@FinalValidationError, [FinalValidationError]) END,
        [ValidationErrorCount] = CASE WHEN @ValidationErrorCount_Clear = 1 THEN NULL ELSE ISNULL(@ValidationErrorCount, [ValidationErrorCount]) END,
        [CommonValidationError] = CASE WHEN @CommonValidationError_Clear = 1 THEN NULL ELSE ISNULL(@CommonValidationError, [CommonValidationError]) END,
        [FirstAttemptAt] = CASE WHEN @FirstAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@FirstAttemptAt, [FirstAttemptAt]) END,
        [LastAttemptAt] = CASE WHEN @LastAttemptAt_Clear = 1 THEN NULL ELSE ISNULL(@LastAttemptAt, [LastAttemptAt]) END,
        [TotalRetryDurationMS] = CASE WHEN @TotalRetryDurationMS_Clear = 1 THEN NULL ELSE ISNULL(@TotalRetryDurationMS, [TotalRetryDurationMS]) END,
        [ValidationAttempts] = CASE WHEN @ValidationAttempts_Clear = 1 THEN NULL ELSE ISNULL(@ValidationAttempts, [ValidationAttempts]) END,
        [ValidationSummary] = CASE WHEN @ValidationSummary_Clear = 1 THEN NULL ELSE ISNULL(@ValidationSummary, [ValidationSummary]) END,
        [FailoverAttempts] = CASE WHEN @FailoverAttempts_Clear = 1 THEN NULL ELSE ISNULL(@FailoverAttempts, [FailoverAttempts]) END,
        [FailoverErrors] = CASE WHEN @FailoverErrors_Clear = 1 THEN NULL ELSE ISNULL(@FailoverErrors, [FailoverErrors]) END,
        [FailoverDurations] = CASE WHEN @FailoverDurations_Clear = 1 THEN NULL ELSE ISNULL(@FailoverDurations, [FailoverDurations]) END,
        [OriginalModelID] = CASE WHEN @OriginalModelID_Clear = 1 THEN NULL ELSE ISNULL(@OriginalModelID, [OriginalModelID]) END,
        [OriginalRequestStartTime] = CASE WHEN @OriginalRequestStartTime_Clear = 1 THEN NULL ELSE ISNULL(@OriginalRequestStartTime, [OriginalRequestStartTime]) END,
        [TotalFailoverDuration] = CASE WHEN @TotalFailoverDuration_Clear = 1 THEN NULL ELSE ISNULL(@TotalFailoverDuration, [TotalFailoverDuration]) END,
        [RerunFromPromptRunID] = CASE WHEN @RerunFromPromptRunID_Clear = 1 THEN NULL ELSE ISNULL(@RerunFromPromptRunID, [RerunFromPromptRunID]) END,
        [ModelSelection] = CASE WHEN @ModelSelection_Clear = 1 THEN NULL ELSE ISNULL(@ModelSelection, [ModelSelection]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Cancelled] = ISNULL(@Cancelled, [Cancelled]),
        [CancellationReason] = CASE WHEN @CancellationReason_Clear = 1 THEN NULL ELSE ISNULL(@CancellationReason, [CancellationReason]) END,
        [ModelPowerRank] = CASE WHEN @ModelPowerRank_Clear = 1 THEN NULL ELSE ISNULL(@ModelPowerRank, [ModelPowerRank]) END,
        [SelectionStrategy] = CASE WHEN @SelectionStrategy_Clear = 1 THEN NULL ELSE ISNULL(@SelectionStrategy, [SelectionStrategy]) END,
        [CacheHit] = ISNULL(@CacheHit, [CacheHit]),
        [CacheKey] = CASE WHEN @CacheKey_Clear = 1 THEN NULL ELSE ISNULL(@CacheKey, [CacheKey]) END,
        [JudgeID] = CASE WHEN @JudgeID_Clear = 1 THEN NULL ELSE ISNULL(@JudgeID, [JudgeID]) END,
        [JudgeScore] = CASE WHEN @JudgeScore_Clear = 1 THEN NULL ELSE ISNULL(@JudgeScore, [JudgeScore]) END,
        [WasSelectedResult] = ISNULL(@WasSelectedResult, [WasSelectedResult]),
        [StreamingEnabled] = ISNULL(@StreamingEnabled, [StreamingEnabled]),
        [FirstTokenTime] = CASE WHEN @FirstTokenTime_Clear = 1 THEN NULL ELSE ISNULL(@FirstTokenTime, [FirstTokenTime]) END,
        [ErrorDetails] = CASE WHEN @ErrorDetails_Clear = 1 THEN NULL ELSE ISNULL(@ErrorDetails, [ErrorDetails]) END,
        [ChildPromptID] = CASE WHEN @ChildPromptID_Clear = 1 THEN NULL ELSE ISNULL(@ChildPromptID, [ChildPromptID]) END,
        [QueueTime] = CASE WHEN @QueueTime_Clear = 1 THEN NULL ELSE ISNULL(@QueueTime, [QueueTime]) END,
        [PromptTime] = CASE WHEN @PromptTime_Clear = 1 THEN NULL ELSE ISNULL(@PromptTime, [PromptTime]) END,
        [CompletionTime] = CASE WHEN @CompletionTime_Clear = 1 THEN NULL ELSE ISNULL(@CompletionTime, [CompletionTime]) END,
        [ModelSpecificResponseDetails] = CASE WHEN @ModelSpecificResponseDetails_Clear = 1 THEN NULL ELSE ISNULL(@ModelSpecificResponseDetails, [ModelSpecificResponseDetails]) END,
        [EffortLevel] = CASE WHEN @EffortLevel_Clear = 1 THEN NULL ELSE ISNULL(@EffortLevel, [EffortLevel]) END,
        [RunName] = CASE WHEN @RunName_Clear = 1 THEN NULL ELSE ISNULL(@RunName, [RunName]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [TestRunID] = CASE WHEN @TestRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestRunID, [TestRunID]) END,
        [AssistantPrefill] = CASE WHEN @AssistantPrefill_Clear = 1 THEN NULL ELSE ISNULL(@AssistantPrefill, [AssistantPrefill]) END,
        [TokensCacheRead] = CASE WHEN @TokensCacheRead_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheRead, [TokensCacheRead]) END,
        [TokensCacheWrite] = CASE WHEN @TokensCacheWrite_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWrite, [TokensCacheWrite]) END,
        [TokensCacheReadRollup] = CASE WHEN @TokensCacheReadRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheReadRollup, [TokensCacheReadRollup]) END,
        [TokensCacheWriteRollup] = CASE WHEN @TokensCacheWriteRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWriteRollup, [TokensCacheWriteRollup]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIPromptRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIPromptRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIPromptRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIPromptRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPromptRun
ON [${flyway:defaultSchema}].[AIPromptRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPromptRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRun] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIPromptRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIPromptRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from AIPromptRunMedia using cursor to call spDeleteAIPromptRunMedia
    DECLARE @MJAIPromptRunMedias_PromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIPromptRunMedia]
        WHERE [PromptRunID] = @ID
    
    OPEN cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor INTO @MJAIPromptRunMedias_PromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIPromptRunMedia] @ID = @MJAIPromptRunMedias_PromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor INTO @MJAIPromptRunMedias_PromptRunIDID
    END
    
    CLOSE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    DEALLOCATE cascade_delete_MJAIPromptRunMedias_PromptRunID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_ParentIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_ParentID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TokensUsed int
    DECLARE @MJAIPromptRuns_ParentID_TokensPrompt int
    DECLARE @MJAIPromptRuns_ParentID_TokensCompletion int
    DECLARE @MJAIPromptRuns_ParentID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ParentID_Success bit
    DECLARE @MJAIPromptRuns_ParentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_ParentID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_ParentID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_ParentID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_ParentID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_ParentID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_TopK int
    DECLARE @MJAIPromptRuns_ParentID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_ParentID_Seed int
    DECLARE @MJAIPromptRuns_ParentID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_LogProbs bit
    DECLARE @MJAIPromptRuns_ParentID_TopLogProbs int
    DECLARE @MJAIPromptRuns_ParentID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_ParentID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_ParentID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_ParentID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_ParentID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_ParentID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_ParentID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_ParentID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_ParentID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_ParentID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_ParentID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_ParentID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_ParentID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_Cancelled bit
    DECLARE @MJAIPromptRuns_ParentID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_ParentID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_ParentID_CacheHit bit
    DECLARE @MJAIPromptRuns_ParentID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_ParentID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_ParentID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_ParentID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_ParentID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_ParentID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_QueueTime int
    DECLARE @MJAIPromptRuns_ParentID_PromptTime int
    DECLARE @MJAIPromptRuns_ParentID_CompletionTime int
    DECLARE @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_EffortLevel int
    DECLARE @MJAIPromptRuns_ParentID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_ParentID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_ParentID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_ParentID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_ParentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_AgentRunID, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID, @MJAIPromptRuns_ParentID_AssistantPrefill, @MJAIPromptRuns_ParentID_TokensCacheRead, @MJAIPromptRuns_ParentID_TokensCacheWrite, @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @MJAIPromptRuns_ParentID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_ParentIDID, @PromptID = @MJAIPromptRuns_ParentID_PromptID, @ModelID = @MJAIPromptRuns_ParentID_ModelID, @VendorID = @MJAIPromptRuns_ParentID_VendorID, @AgentID = @MJAIPromptRuns_ParentID_AgentID, @ConfigurationID = @MJAIPromptRuns_ParentID_ConfigurationID, @RunAt = @MJAIPromptRuns_ParentID_RunAt, @CompletedAt = @MJAIPromptRuns_ParentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_ParentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_ParentID_Messages, @Result = @MJAIPromptRuns_ParentID_Result, @TokensUsed = @MJAIPromptRuns_ParentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_ParentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_ParentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_ParentID_TotalCost, @Success = @MJAIPromptRuns_ParentID_Success, @ErrorMessage = @MJAIPromptRuns_ParentID_ErrorMessage, @ParentID_Clear = 1, @ParentID = @MJAIPromptRuns_ParentID_ParentID, @RunType = @MJAIPromptRuns_ParentID_RunType, @ExecutionOrder = @MJAIPromptRuns_ParentID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_ParentID_AgentRunID, @Cost = @MJAIPromptRuns_ParentID_Cost, @CostCurrency = @MJAIPromptRuns_ParentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_ParentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_ParentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_ParentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_ParentID_Temperature, @TopP = @MJAIPromptRuns_ParentID_TopP, @TopK = @MJAIPromptRuns_ParentID_TopK, @MinP = @MJAIPromptRuns_ParentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_ParentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_ParentID_PresencePenalty, @Seed = @MJAIPromptRuns_ParentID_Seed, @StopSequences = @MJAIPromptRuns_ParentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_ParentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_ParentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_ParentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_ParentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_ParentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_ParentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_ParentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_ParentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_ParentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_ParentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_ParentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_ParentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_ParentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_ParentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_ParentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_ParentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_ParentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_ParentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_ParentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_ParentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_ParentID_ModelSelection, @Status = @MJAIPromptRuns_ParentID_Status, @Cancelled = @MJAIPromptRuns_ParentID_Cancelled, @CancellationReason = @MJAIPromptRuns_ParentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_ParentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_ParentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_ParentID_CacheHit, @CacheKey = @MJAIPromptRuns_ParentID_CacheKey, @JudgeID = @MJAIPromptRuns_ParentID_JudgeID, @JudgeScore = @MJAIPromptRuns_ParentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_ParentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_ParentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_ParentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_ParentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_ParentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_ParentID_QueueTime, @PromptTime = @MJAIPromptRuns_ParentID_PromptTime, @CompletionTime = @MJAIPromptRuns_ParentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_ParentID_EffortLevel, @RunName = @MJAIPromptRuns_ParentID_RunName, @Comments = @MJAIPromptRuns_ParentID_Comments, @TestRunID = @MJAIPromptRuns_ParentID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_ParentID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_ParentID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_ParentID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_ParentID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_ParentID_cursor INTO @MJAIPromptRuns_ParentIDID, @MJAIPromptRuns_ParentID_PromptID, @MJAIPromptRuns_ParentID_ModelID, @MJAIPromptRuns_ParentID_VendorID, @MJAIPromptRuns_ParentID_AgentID, @MJAIPromptRuns_ParentID_ConfigurationID, @MJAIPromptRuns_ParentID_RunAt, @MJAIPromptRuns_ParentID_CompletedAt, @MJAIPromptRuns_ParentID_ExecutionTimeMS, @MJAIPromptRuns_ParentID_Messages, @MJAIPromptRuns_ParentID_Result, @MJAIPromptRuns_ParentID_TokensUsed, @MJAIPromptRuns_ParentID_TokensPrompt, @MJAIPromptRuns_ParentID_TokensCompletion, @MJAIPromptRuns_ParentID_TotalCost, @MJAIPromptRuns_ParentID_Success, @MJAIPromptRuns_ParentID_ErrorMessage, @MJAIPromptRuns_ParentID_ParentID, @MJAIPromptRuns_ParentID_RunType, @MJAIPromptRuns_ParentID_ExecutionOrder, @MJAIPromptRuns_ParentID_AgentRunID, @MJAIPromptRuns_ParentID_Cost, @MJAIPromptRuns_ParentID_CostCurrency, @MJAIPromptRuns_ParentID_TokensUsedRollup, @MJAIPromptRuns_ParentID_TokensPromptRollup, @MJAIPromptRuns_ParentID_TokensCompletionRollup, @MJAIPromptRuns_ParentID_Temperature, @MJAIPromptRuns_ParentID_TopP, @MJAIPromptRuns_ParentID_TopK, @MJAIPromptRuns_ParentID_MinP, @MJAIPromptRuns_ParentID_FrequencyPenalty, @MJAIPromptRuns_ParentID_PresencePenalty, @MJAIPromptRuns_ParentID_Seed, @MJAIPromptRuns_ParentID_StopSequences, @MJAIPromptRuns_ParentID_ResponseFormat, @MJAIPromptRuns_ParentID_LogProbs, @MJAIPromptRuns_ParentID_TopLogProbs, @MJAIPromptRuns_ParentID_DescendantCost, @MJAIPromptRuns_ParentID_ValidationAttemptCount, @MJAIPromptRuns_ParentID_SuccessfulValidationCount, @MJAIPromptRuns_ParentID_FinalValidationPassed, @MJAIPromptRuns_ParentID_ValidationBehavior, @MJAIPromptRuns_ParentID_RetryStrategy, @MJAIPromptRuns_ParentID_MaxRetriesConfigured, @MJAIPromptRuns_ParentID_FinalValidationError, @MJAIPromptRuns_ParentID_ValidationErrorCount, @MJAIPromptRuns_ParentID_CommonValidationError, @MJAIPromptRuns_ParentID_FirstAttemptAt, @MJAIPromptRuns_ParentID_LastAttemptAt, @MJAIPromptRuns_ParentID_TotalRetryDurationMS, @MJAIPromptRuns_ParentID_ValidationAttempts, @MJAIPromptRuns_ParentID_ValidationSummary, @MJAIPromptRuns_ParentID_FailoverAttempts, @MJAIPromptRuns_ParentID_FailoverErrors, @MJAIPromptRuns_ParentID_FailoverDurations, @MJAIPromptRuns_ParentID_OriginalModelID, @MJAIPromptRuns_ParentID_OriginalRequestStartTime, @MJAIPromptRuns_ParentID_TotalFailoverDuration, @MJAIPromptRuns_ParentID_RerunFromPromptRunID, @MJAIPromptRuns_ParentID_ModelSelection, @MJAIPromptRuns_ParentID_Status, @MJAIPromptRuns_ParentID_Cancelled, @MJAIPromptRuns_ParentID_CancellationReason, @MJAIPromptRuns_ParentID_ModelPowerRank, @MJAIPromptRuns_ParentID_SelectionStrategy, @MJAIPromptRuns_ParentID_CacheHit, @MJAIPromptRuns_ParentID_CacheKey, @MJAIPromptRuns_ParentID_JudgeID, @MJAIPromptRuns_ParentID_JudgeScore, @MJAIPromptRuns_ParentID_WasSelectedResult, @MJAIPromptRuns_ParentID_StreamingEnabled, @MJAIPromptRuns_ParentID_FirstTokenTime, @MJAIPromptRuns_ParentID_ErrorDetails, @MJAIPromptRuns_ParentID_ChildPromptID, @MJAIPromptRuns_ParentID_QueueTime, @MJAIPromptRuns_ParentID_PromptTime, @MJAIPromptRuns_ParentID_CompletionTime, @MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, @MJAIPromptRuns_ParentID_EffortLevel, @MJAIPromptRuns_ParentID_RunName, @MJAIPromptRuns_ParentID_Comments, @MJAIPromptRuns_ParentID_TestRunID, @MJAIPromptRuns_ParentID_AssistantPrefill, @MJAIPromptRuns_ParentID_TokensCacheRead, @MJAIPromptRuns_ParentID_TokensCacheWrite, @MJAIPromptRuns_ParentID_TokensCacheReadRollup, @MJAIPromptRuns_ParentID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_ParentID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_ParentID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_RerunFromPromptRunIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Success bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopK int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Seed int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_LogProbs bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost decimal(18, 6)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Cancelled bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CacheHit bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_QueueTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_PromptTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup int
    DECLARE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [AgentRunID], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [RerunFromPromptRunID] = @ID

    OPEN cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_RerunFromPromptRunIDID, @PromptID = @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @ModelID = @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @VendorID = @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @AgentID = @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @ConfigurationID = @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @RunAt = @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @CompletedAt = @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_RerunFromPromptRunID_Messages, @Result = @MJAIPromptRuns_RerunFromPromptRunID_Result, @TokensUsed = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @TotalCost = @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @Success = @MJAIPromptRuns_RerunFromPromptRunID_Success, @ErrorMessage = @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @ParentID = @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @RunType = @MJAIPromptRuns_RerunFromPromptRunID_RunType, @ExecutionOrder = @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @AgentRunID = @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @Cost = @MJAIPromptRuns_RerunFromPromptRunID_Cost, @CostCurrency = @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @TopP = @MJAIPromptRuns_RerunFromPromptRunID_TopP, @TopK = @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MinP = @MJAIPromptRuns_RerunFromPromptRunID_MinP, @FrequencyPenalty = @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @Seed = @MJAIPromptRuns_RerunFromPromptRunID_Seed, @StopSequences = @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @ResponseFormat = @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @LogProbs = @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @TopLogProbs = @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @RerunFromPromptRunID_Clear = 1, @RerunFromPromptRunID = @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @Status = @MJAIPromptRuns_RerunFromPromptRunID_Status, @Cancelled = @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @CancellationReason = @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @CacheKey = @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @JudgeID = @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @JudgeScore = @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @QueueTime = @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @PromptTime = @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @CompletionTime = @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @RunName = @MJAIPromptRuns_RerunFromPromptRunID_RunName, @Comments = @MJAIPromptRuns_RerunFromPromptRunID_Comments, @TestRunID = @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor INTO @MJAIPromptRuns_RerunFromPromptRunIDID, @MJAIPromptRuns_RerunFromPromptRunID_PromptID, @MJAIPromptRuns_RerunFromPromptRunID_ModelID, @MJAIPromptRuns_RerunFromPromptRunID_VendorID, @MJAIPromptRuns_RerunFromPromptRunID_AgentID, @MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, @MJAIPromptRuns_RerunFromPromptRunID_RunAt, @MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, @MJAIPromptRuns_RerunFromPromptRunID_Messages, @MJAIPromptRuns_RerunFromPromptRunID_Result, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, @MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, @MJAIPromptRuns_RerunFromPromptRunID_TotalCost, @MJAIPromptRuns_RerunFromPromptRunID_Success, @MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, @MJAIPromptRuns_RerunFromPromptRunID_ParentID, @MJAIPromptRuns_RerunFromPromptRunID_RunType, @MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, @MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, @MJAIPromptRuns_RerunFromPromptRunID_Cost, @MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, @MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, @MJAIPromptRuns_RerunFromPromptRunID_Temperature, @MJAIPromptRuns_RerunFromPromptRunID_TopP, @MJAIPromptRuns_RerunFromPromptRunID_TopK, @MJAIPromptRuns_RerunFromPromptRunID_MinP, @MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, @MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, @MJAIPromptRuns_RerunFromPromptRunID_Seed, @MJAIPromptRuns_RerunFromPromptRunID_StopSequences, @MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, @MJAIPromptRuns_RerunFromPromptRunID_LogProbs, @MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, @MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, @MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, @MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, @MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, @MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, @MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, @MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, @MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, @MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, @MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, @MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, @MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, @MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, @MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, @MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, @MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, @MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, @MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, @MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, @MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, @MJAIPromptRuns_RerunFromPromptRunID_Status, @MJAIPromptRuns_RerunFromPromptRunID_Cancelled, @MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, @MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, @MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, @MJAIPromptRuns_RerunFromPromptRunID_CacheHit, @MJAIPromptRuns_RerunFromPromptRunID_CacheKey, @MJAIPromptRuns_RerunFromPromptRunID_JudgeID, @MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, @MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, @MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, @MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, @MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, @MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, @MJAIPromptRuns_RerunFromPromptRunID_QueueTime, @MJAIPromptRuns_RerunFromPromptRunID_PromptTime, @MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, @MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificResponseDetails, @MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, @MJAIPromptRuns_RerunFromPromptRunID_RunName, @MJAIPromptRuns_RerunFromPromptRunID_Comments, @MJAIPromptRuns_RerunFromPromptRunID_TestRunID, @MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, @MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup
    END

    CLOSE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_RerunFromPromptRunID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_PromptRunIDID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_PromptRunID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_PromptRunID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_PromptRunID_Status nvarchar(50)
    DECLARE @MJAIResultCache_PromptRunID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_PromptRunID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_PromptRunID_PromptEmbedding varbinary
    DECLARE @MJAIResultCache_PromptRunID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_PromptRunID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [PromptRunID] = @ID

    OPEN cascade_update_MJAIResultCache_PromptRunID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_PromptRunID_cursor INTO @MJAIResultCache_PromptRunIDID, @MJAIResultCache_PromptRunID_AIPromptID, @MJAIResultCache_PromptRunID_AIModelID, @MJAIResultCache_PromptRunID_RunAt, @MJAIResultCache_PromptRunID_PromptText, @MJAIResultCache_PromptRunID_ResultText, @MJAIResultCache_PromptRunID_Status, @MJAIResultCache_PromptRunID_ExpiredOn, @MJAIResultCache_PromptRunID_VendorID, @MJAIResultCache_PromptRunID_AgentID, @MJAIResultCache_PromptRunID_ConfigurationID, @MJAIResultCache_PromptRunID_PromptEmbedding, @MJAIResultCache_PromptRunID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_PromptRunID_PromptRunID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_PromptRunIDID, @AIPromptID = @MJAIResultCache_PromptRunID_AIPromptID, @AIModelID = @MJAIResultCache_PromptRunID_AIModelID, @RunAt = @MJAIResultCache_PromptRunID_RunAt, @PromptText = @MJAIResultCache_PromptRunID_PromptText, @ResultText = @MJAIResultCache_PromptRunID_ResultText, @Status = @MJAIResultCache_PromptRunID_Status, @ExpiredOn = @MJAIResultCache_PromptRunID_ExpiredOn, @VendorID = @MJAIResultCache_PromptRunID_VendorID, @AgentID = @MJAIResultCache_PromptRunID_AgentID, @ConfigurationID = @MJAIResultCache_PromptRunID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_PromptRunID_PromptEmbedding, @PromptRunID_Clear = 1, @PromptRunID = @MJAIResultCache_PromptRunID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_PromptRunID_cursor INTO @MJAIResultCache_PromptRunIDID, @MJAIResultCache_PromptRunID_AIPromptID, @MJAIResultCache_PromptRunID_AIModelID, @MJAIResultCache_PromptRunID_RunAt, @MJAIResultCache_PromptRunID_PromptText, @MJAIResultCache_PromptRunID_ResultText, @MJAIResultCache_PromptRunID_Status, @MJAIResultCache_PromptRunID_ExpiredOn, @MJAIResultCache_PromptRunID_VendorID, @MJAIResultCache_PromptRunID_AgentID, @MJAIResultCache_PromptRunID_ConfigurationID, @MJAIResultCache_PromptRunID_PromptEmbedding, @MJAIResultCache_PromptRunID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_PromptRunID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_PromptRunID_cursor
    
    -- Cascade delete from ContentProcessRunPromptRun using cursor to call spDeleteContentProcessRunPromptRun
    DECLARE @MJContentProcessRunPromptRuns_AIPromptRunIDID uniqueidentifier
    DECLARE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ContentProcessRunPromptRun]
        WHERE [AIPromptRunID] = @ID
    
    OPEN cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    FETCH NEXT FROM cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor INTO @MJContentProcessRunPromptRuns_AIPromptRunIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteContentProcessRunPromptRun] @ID = @MJContentProcessRunPromptRuns_AIPromptRunIDID
        
        FETCH NEXT FROM cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor INTO @MJContentProcessRunPromptRuns_AIPromptRunIDID
    END
    
    CLOSE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    DEALLOCATE cascade_delete_MJContentProcessRunPromptRuns_AIPromptRunID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[AIPromptRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Prompt Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIPromptRun] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for ScheduledJob */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key JobTypeID in table ScheduledJob
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScheduledJob_JobTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScheduledJob]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScheduledJob_JobTypeID ON [${flyway:defaultSchema}].[ScheduledJob] ([JobTypeID]);

-- Index for foreign key OwnerUserID in table ScheduledJob
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScheduledJob_OwnerUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScheduledJob]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScheduledJob_OwnerUserID ON [${flyway:defaultSchema}].[ScheduledJob] ([OwnerUserID]);

-- Index for foreign key NotifyUserID in table ScheduledJob
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScheduledJob_NotifyUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScheduledJob]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScheduledJob_NotifyUserID ON [${flyway:defaultSchema}].[ScheduledJob] ([NotifyUserID]);

/* Base View SQL for MJ: Scheduled Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: vwScheduledJobs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Scheduled Jobs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ScheduledJob
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwScheduledJobs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwScheduledJobs];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwScheduledJobs]
AS
SELECT
    s.*,
    MJScheduledJobType_JobTypeID.[Name] AS [JobType],
    MJUser_OwnerUserID.[Name] AS [OwnerUser],
    MJUser_NotifyUserID.[Name] AS [NotifyUser]
FROM
    [${flyway:defaultSchema}].[ScheduledJob] AS s
INNER JOIN
    [${flyway:defaultSchema}].[ScheduledJobType] AS MJScheduledJobType_JobTypeID
  ON
    [s].[JobTypeID] = MJScheduledJobType_JobTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_OwnerUserID
  ON
    [s].[OwnerUserID] = MJUser_OwnerUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_NotifyUserID
  ON
    [s].[NotifyUserID] = MJUser_NotifyUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwScheduledJobs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: Scheduled Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: Permissions for vwScheduledJobs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwScheduledJobs] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Scheduled Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: spCreateScheduledJob
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ScheduledJob
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateScheduledJob]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledJob];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledJob]
    @ID uniqueidentifier = NULL,
    @JobTypeID uniqueidentifier,
    @Name nvarchar(200),
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @CronExpression nvarchar(120),
    @Timezone nvarchar(64) = NULL,
    @StartAt_Clear bit = 0,
    @StartAt datetimeoffset = NULL,
    @EndAt_Clear bit = 0,
    @EndAt datetimeoffset = NULL,
    @Status nvarchar(20) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @OwnerUserID_Clear bit = 0,
    @OwnerUserID uniqueidentifier = NULL,
    @LastRunAt_Clear bit = 0,
    @LastRunAt datetimeoffset = NULL,
    @NextRunAt_Clear bit = 0,
    @NextRunAt datetimeoffset = NULL,
    @RunCount int = NULL,
    @SuccessCount int = NULL,
    @FailureCount int = NULL,
    @NotifyOnSuccess bit = NULL,
    @NotifyOnFailure bit = NULL,
    @NotifyUserID_Clear bit = 0,
    @NotifyUserID uniqueidentifier = NULL,
    @NotifyViaEmail bit = NULL,
    @NotifyViaInApp bit = NULL,
    @LockToken_Clear bit = 0,
    @LockToken uniqueidentifier = NULL,
    @LockedAt_Clear bit = 0,
    @LockedAt datetimeoffset = NULL,
    @LockedByInstance_Clear bit = 0,
    @LockedByInstance nvarchar(255) = NULL,
    @ExpectedCompletionAt_Clear bit = 0,
    @ExpectedCompletionAt datetimeoffset = NULL,
    @ConcurrencyMode nvarchar(20) = NULL,
    @RunImmediatelyIfNeverRun bit = NULL,
    @MaxRuntimeMinutes_Clear bit = 0,
    @MaxRuntimeMinutes int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ScheduledJob]
            (
                [ID],
                [JobTypeID],
                [Name],
                [Description],
                [CronExpression],
                [Timezone],
                [StartAt],
                [EndAt],
                [Status],
                [Configuration],
                [OwnerUserID],
                [LastRunAt],
                [NextRunAt],
                [RunCount],
                [SuccessCount],
                [FailureCount],
                [NotifyOnSuccess],
                [NotifyOnFailure],
                [NotifyUserID],
                [NotifyViaEmail],
                [NotifyViaInApp],
                [LockToken],
                [LockedAt],
                [LockedByInstance],
                [ExpectedCompletionAt],
                [ConcurrencyMode],
                [RunImmediatelyIfNeverRun],
                [MaxRuntimeMinutes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @JobTypeID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @CronExpression,
                ISNULL(@Timezone, 'UTC'),
                CASE WHEN @StartAt_Clear = 1 THEN NULL ELSE ISNULL(@StartAt, NULL) END,
                CASE WHEN @EndAt_Clear = 1 THEN NULL ELSE ISNULL(@EndAt, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @OwnerUserID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerUserID, NULL) END,
                CASE WHEN @LastRunAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRunAt, NULL) END,
                CASE WHEN @NextRunAt_Clear = 1 THEN NULL ELSE ISNULL(@NextRunAt, NULL) END,
                ISNULL(@RunCount, 0),
                ISNULL(@SuccessCount, 0),
                ISNULL(@FailureCount, 0),
                ISNULL(@NotifyOnSuccess, 0),
                ISNULL(@NotifyOnFailure, 1),
                CASE WHEN @NotifyUserID_Clear = 1 THEN NULL ELSE ISNULL(@NotifyUserID, NULL) END,
                ISNULL(@NotifyViaEmail, 0),
                ISNULL(@NotifyViaInApp, 1),
                CASE WHEN @LockToken_Clear = 1 THEN NULL ELSE ISNULL(@LockToken, NULL) END,
                CASE WHEN @LockedAt_Clear = 1 THEN NULL ELSE ISNULL(@LockedAt, NULL) END,
                CASE WHEN @LockedByInstance_Clear = 1 THEN NULL ELSE ISNULL(@LockedByInstance, NULL) END,
                CASE WHEN @ExpectedCompletionAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpectedCompletionAt, NULL) END,
                ISNULL(@ConcurrencyMode, 'Skip'),
                ISNULL(@RunImmediatelyIfNeverRun, 0),
                CASE WHEN @MaxRuntimeMinutes_Clear = 1 THEN NULL ELSE ISNULL(@MaxRuntimeMinutes, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ScheduledJob]
            (
                [JobTypeID],
                [Name],
                [Description],
                [CronExpression],
                [Timezone],
                [StartAt],
                [EndAt],
                [Status],
                [Configuration],
                [OwnerUserID],
                [LastRunAt],
                [NextRunAt],
                [RunCount],
                [SuccessCount],
                [FailureCount],
                [NotifyOnSuccess],
                [NotifyOnFailure],
                [NotifyUserID],
                [NotifyViaEmail],
                [NotifyViaInApp],
                [LockToken],
                [LockedAt],
                [LockedByInstance],
                [ExpectedCompletionAt],
                [ConcurrencyMode],
                [RunImmediatelyIfNeverRun],
                [MaxRuntimeMinutes]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @JobTypeID,
                @Name,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                @CronExpression,
                ISNULL(@Timezone, 'UTC'),
                CASE WHEN @StartAt_Clear = 1 THEN NULL ELSE ISNULL(@StartAt, NULL) END,
                CASE WHEN @EndAt_Clear = 1 THEN NULL ELSE ISNULL(@EndAt, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, NULL) END,
                CASE WHEN @OwnerUserID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerUserID, NULL) END,
                CASE WHEN @LastRunAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRunAt, NULL) END,
                CASE WHEN @NextRunAt_Clear = 1 THEN NULL ELSE ISNULL(@NextRunAt, NULL) END,
                ISNULL(@RunCount, 0),
                ISNULL(@SuccessCount, 0),
                ISNULL(@FailureCount, 0),
                ISNULL(@NotifyOnSuccess, 0),
                ISNULL(@NotifyOnFailure, 1),
                CASE WHEN @NotifyUserID_Clear = 1 THEN NULL ELSE ISNULL(@NotifyUserID, NULL) END,
                ISNULL(@NotifyViaEmail, 0),
                ISNULL(@NotifyViaInApp, 1),
                CASE WHEN @LockToken_Clear = 1 THEN NULL ELSE ISNULL(@LockToken, NULL) END,
                CASE WHEN @LockedAt_Clear = 1 THEN NULL ELSE ISNULL(@LockedAt, NULL) END,
                CASE WHEN @LockedByInstance_Clear = 1 THEN NULL ELSE ISNULL(@LockedByInstance, NULL) END,
                CASE WHEN @ExpectedCompletionAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpectedCompletionAt, NULL) END,
                ISNULL(@ConcurrencyMode, 'Skip'),
                ISNULL(@RunImmediatelyIfNeverRun, 0),
                CASE WHEN @MaxRuntimeMinutes_Clear = 1 THEN NULL ELSE ISNULL(@MaxRuntimeMinutes, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwScheduledJobs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScheduledJob] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Scheduled Jobs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScheduledJob] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Scheduled Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: spUpdateScheduledJob
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ScheduledJob
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateScheduledJob]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateScheduledJob];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateScheduledJob]
    @ID uniqueidentifier,
    @JobTypeID uniqueidentifier = NULL,
    @Name nvarchar(200) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @CronExpression nvarchar(120) = NULL,
    @Timezone nvarchar(64) = NULL,
    @StartAt_Clear bit = 0,
    @StartAt datetimeoffset = NULL,
    @EndAt_Clear bit = 0,
    @EndAt datetimeoffset = NULL,
    @Status nvarchar(20) = NULL,
    @Configuration_Clear bit = 0,
    @Configuration nvarchar(MAX) = NULL,
    @OwnerUserID_Clear bit = 0,
    @OwnerUserID uniqueidentifier = NULL,
    @LastRunAt_Clear bit = 0,
    @LastRunAt datetimeoffset = NULL,
    @NextRunAt_Clear bit = 0,
    @NextRunAt datetimeoffset = NULL,
    @RunCount int = NULL,
    @SuccessCount int = NULL,
    @FailureCount int = NULL,
    @NotifyOnSuccess bit = NULL,
    @NotifyOnFailure bit = NULL,
    @NotifyUserID_Clear bit = 0,
    @NotifyUserID uniqueidentifier = NULL,
    @NotifyViaEmail bit = NULL,
    @NotifyViaInApp bit = NULL,
    @LockToken_Clear bit = 0,
    @LockToken uniqueidentifier = NULL,
    @LockedAt_Clear bit = 0,
    @LockedAt datetimeoffset = NULL,
    @LockedByInstance_Clear bit = 0,
    @LockedByInstance nvarchar(255) = NULL,
    @ExpectedCompletionAt_Clear bit = 0,
    @ExpectedCompletionAt datetimeoffset = NULL,
    @ConcurrencyMode nvarchar(20) = NULL,
    @RunImmediatelyIfNeverRun bit = NULL,
    @MaxRuntimeMinutes_Clear bit = 0,
    @MaxRuntimeMinutes int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScheduledJob]
    SET
        [JobTypeID] = ISNULL(@JobTypeID, [JobTypeID]),
        [Name] = ISNULL(@Name, [Name]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [CronExpression] = ISNULL(@CronExpression, [CronExpression]),
        [Timezone] = ISNULL(@Timezone, [Timezone]),
        [StartAt] = CASE WHEN @StartAt_Clear = 1 THEN NULL ELSE ISNULL(@StartAt, [StartAt]) END,
        [EndAt] = CASE WHEN @EndAt_Clear = 1 THEN NULL ELSE ISNULL(@EndAt, [EndAt]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Configuration] = CASE WHEN @Configuration_Clear = 1 THEN NULL ELSE ISNULL(@Configuration, [Configuration]) END,
        [OwnerUserID] = CASE WHEN @OwnerUserID_Clear = 1 THEN NULL ELSE ISNULL(@OwnerUserID, [OwnerUserID]) END,
        [LastRunAt] = CASE WHEN @LastRunAt_Clear = 1 THEN NULL ELSE ISNULL(@LastRunAt, [LastRunAt]) END,
        [NextRunAt] = CASE WHEN @NextRunAt_Clear = 1 THEN NULL ELSE ISNULL(@NextRunAt, [NextRunAt]) END,
        [RunCount] = ISNULL(@RunCount, [RunCount]),
        [SuccessCount] = ISNULL(@SuccessCount, [SuccessCount]),
        [FailureCount] = ISNULL(@FailureCount, [FailureCount]),
        [NotifyOnSuccess] = ISNULL(@NotifyOnSuccess, [NotifyOnSuccess]),
        [NotifyOnFailure] = ISNULL(@NotifyOnFailure, [NotifyOnFailure]),
        [NotifyUserID] = CASE WHEN @NotifyUserID_Clear = 1 THEN NULL ELSE ISNULL(@NotifyUserID, [NotifyUserID]) END,
        [NotifyViaEmail] = ISNULL(@NotifyViaEmail, [NotifyViaEmail]),
        [NotifyViaInApp] = ISNULL(@NotifyViaInApp, [NotifyViaInApp]),
        [LockToken] = CASE WHEN @LockToken_Clear = 1 THEN NULL ELSE ISNULL(@LockToken, [LockToken]) END,
        [LockedAt] = CASE WHEN @LockedAt_Clear = 1 THEN NULL ELSE ISNULL(@LockedAt, [LockedAt]) END,
        [LockedByInstance] = CASE WHEN @LockedByInstance_Clear = 1 THEN NULL ELSE ISNULL(@LockedByInstance, [LockedByInstance]) END,
        [ExpectedCompletionAt] = CASE WHEN @ExpectedCompletionAt_Clear = 1 THEN NULL ELSE ISNULL(@ExpectedCompletionAt, [ExpectedCompletionAt]) END,
        [ConcurrencyMode] = ISNULL(@ConcurrencyMode, [ConcurrencyMode]),
        [RunImmediatelyIfNeverRun] = ISNULL(@RunImmediatelyIfNeverRun, [RunImmediatelyIfNeverRun]),
        [MaxRuntimeMinutes] = CASE WHEN @MaxRuntimeMinutes_Clear = 1 THEN NULL ELSE ISNULL(@MaxRuntimeMinutes, [MaxRuntimeMinutes]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwScheduledJobs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwScheduledJobs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledJob] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ScheduledJob table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateScheduledJob]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateScheduledJob];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateScheduledJob
ON [${flyway:defaultSchema}].[ScheduledJob]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScheduledJob]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ScheduledJob] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Scheduled Jobs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledJob] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Scheduled Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: spDeleteScheduledJob
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ScheduledJob
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteScheduledJob]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteScheduledJob];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteScheduledJob]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ScheduledJob]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteScheduledJob] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Scheduled Jobs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteScheduledJob] TO [cdp_Developer], [cdp_Integration];

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'E57EF025-B07C-4D17-8602-6120A345ADDF'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'CC28664E-CF7B-4791-B4BE-D96CBD4E4549'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '3B91E50A-C0EB-47B7-89F5-B896933309EA'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = '9FEFB2A6-873F-4788-9F53-225BAEDF7333'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IncludeInUserSearchAPI = 1
               WHERE ID = 'E57EF025-B07C-4D17-8602-6120A345ADDF'
               AND AutoUpdateIncludeInUserSearchAPI = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '4B118964-92D4-49DE-8C3E-FB5736ED5397'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '9FEFB2A6-873F-4788-9F53-225BAEDF7333'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'E57EF025-B07C-4D17-8602-6120A345ADDF'
               AND AutoUpdateUserSearchPredicate = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = 'D34A3E50-E7A0-4241-8A1C-6FD61E3F7EE7'
               AND AutoUpdateUserSearchPredicate = 1;

/* Set categories for 33 fields */

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '5FF3A193-496F-4A52-BFC4-C34A72B47170' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '68AE196C-1CBD-44B9-A24D-C9F69CF1215D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0A7ACD60-27E1-46F5-B162-00E87EE996E3' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.JobTypeID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Job Type',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C30FF21A-65A1-4EF3-8978-430CE036C280' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.Name 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4B118964-92D4-49DE-8C3E-FB5736ED5397' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.Description 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3B91E50A-C0EB-47B7-89F5-B896933309EA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.Configuration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'AC6D67F0-D805-4E42-9C4A-34E136107B46' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.ConcurrencyMode 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'BB4BFDA6-0001-43D3-9F48-E9BDB1AC0331' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.JobType 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7CED4F5B-2A51-4D30-968A-7CB0C302F5BE' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.CronExpression 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9FEFB2A6-873F-4788-9F53-225BAEDF7333' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.Timezone 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E57EF025-B07C-4D17-8602-6120A345ADDF' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.StartAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0F3B6855-16D4-486B-A589-698650BFFF96' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.EndAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B2917C35-8B6B-4C02-A42A-6CA26D70125F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.LastRunAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E4F4B083-A687-43EB-B9E4-2B41273D82D7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.NextRunAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B44E0249-46E7-4C54-A0A5-A6A8E79FB4CD' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.ExpectedCompletionAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4CEF1A8F-EDC1-4551-B3B8-2B8A6DA3DEAA' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.RunImmediatelyIfNeverRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C3233A2E-EEE3-4F43-8F80-587DD45E6820' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D34A3E50-E7A0-4241-8A1C-6FD61E3F7EE7' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.RunCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'CC28664E-CF7B-4791-B4BE-D96CBD4E4549' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.SuccessCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A0B299B6-FEA3-4D84-A56E-0A5369B288D2' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.FailureCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '53667E7F-001E-4977-B588-3619D9A982C6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.OwnerUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Owner User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E4DCCF26-14B1-4033-818D-180AF7C04097' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyOnSuccess 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'AB6D25BB-B06B-454D-8216-8D8416A856D6' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyOnFailure 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'D089DC8A-E08C-4295-B5EA-4C96DDDEB8D1' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyUserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Notify User',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '1FFB0397-C54B-4A7D-9394-CFF8A392502A' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyViaEmail 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4C6D0B08-D852-444F-9394-C5387C91139F' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyViaInApp 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Notify Via In‑App',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '03768220-F023-4E46-87E2-5738AAC55985' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.OwnerUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C8AC395C-04D8-4E85-881B-D4F5A70B759D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyUser 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0EA25537-7EFD-4FB3-83DD-2E876202D09D' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.LockToken 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '105CEAB7-9967-4956-B143-CBC983632481' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.LockedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '4D1F66E6-E7DD-4463-BD85-6A34DADFD096' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.LockedByInstance 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '12ED9986-1339-4F4C-88DC-B8B479950062' AND AutoUpdateCategory = 1;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.MaxRuntimeMinutes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Distributed Locking',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'A6DF0F99-3BA4-46B9-89E1-1D07C13F0AD5' AND AutoUpdateCategory = 1;

