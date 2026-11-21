-- =============================================================================
-- MemberJunction Core (${flyway:defaultSchema}) — SaveReturnMode = datestamps_only Stored Procedures
-- =============================================================================
--
-- PURPOSE:
--   This migration ships the MemberJunction CodeGen SQL output (regenerated
--   spCreate* and spUpdate* stored procedures and their GRANT EXECUTE permissions)
--   produced after syncing "Configuration": { "SaveReturnMode": "datestamps_only" }
--   via `mj sync push` on write-heavy / append-heavy logging, telemetry,
--   execution trace, and webhook/sync delivery entities in schema [${flyway:defaultSchema}].
--
-- WHY NO ENTITY METADATA UPDATE STATEMENT IS IN THIS FILE:
--   Per MemberJunction metadata and migration conventions, the declarative
--   Entity.Configuration metadata changes live in `/metadata/entities/` JSON
--   files (pushed during development via `mj sync push` and consolidated into
--   the release Metadata_Sync migration at release time). Subsequent to running
--   `mj sync push`, running `mj codegen` regenerates the SQL stored procedures
--   for those entities so their post-write SELECT queries only the primary key
--   and timestamp columns ([__mj_CreatedAt], [__mj_UpdatedAt]) directly from
--   [${flyway:defaultSchema}].[BaseTable] instead of `SELECT * FROM [vwBaseView]`.
--
-- PERFORMANCE IMPACT:
--   Skipping the post-write BaseView re-SELECT eliminates multi-JOIN view
--   evaluation and prevents re-reading large NVARCHAR(MAX) JSON/payload blobs
--   across TDS on every INSERT and UPDATE, while still returning the authoritative
--   database-generated primary key and timestamps so DatabaseProviderBase.Save()
--   merges them cleanly onto the in-memory BaseEntity instance.
--
-- ENTITIES COVERED IN THIS MIGRATION (25):
--   - MJ: Action Execution Logs ([ActionExecutionLog]): spCreateActionExecutionLog, spUpdateActionExecutionLog -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: AI Agent Run Medias ([AIAgentRunMedia]): spCreateAIAgentRunMedia, spUpdateAIAgentRunMedia -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: AI Agent Run Steps ([AIAgentRunStep]): spCreateAIAgentRunStep, spUpdateAIAgentRunStep -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: AI Agent Runs ([AIAgentRun]): spCreateAIAgentRun, spUpdateAIAgentRun -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: AI Prompt Run Medias ([AIPromptRunMedia]): spCreateAIPromptRunMedia, spUpdateAIPromptRunMedia -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: AI Prompt Runs ([AIPromptRun]): spCreateAIPromptRun, spUpdateAIPromptRun -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: API Key Usage Logs ([APIKeyUsageLog]): spCreateAPIKeyUsageLog, spUpdateAPIKeyUsageLog -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: Audit Logs ([AuditLog]): spCreateAuditLog, spUpdateAuditLog -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: Company Integration Run API Logs ([CompanyIntegrationRunAPILog]): spCreateCompanyIntegrationRunAPILog, spUpdateCompanyIntegrationRunAPILog -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: Company Integration Run Details ([CompanyIntegrationRunDetail]): spCreateCompanyIntegrationRunDetail, spUpdateCompanyIntegrationRunDetail -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: Content Process Run Details ([ContentProcessRunDetail]): spCreateContentProcessRunDetail, spUpdateContentProcessRunDetail -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: Error Logs ([ErrorLog]): spCreateErrorLog, spUpdateErrorLog -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: MCP Tool Execution Logs ([MCPToolExecutionLog]): spCreateMCPToolExecutionLog, spUpdateMCPToolExecutionLog -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: Process Run Details ([ProcessRunDetail]): spCreateProcessRunDetail, spUpdateProcessRunDetail -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: Queue Tasks ([QueueTask]): spCreateQueueTask, spUpdateQueueTask -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: Record Changes ([RecordChange]): spCreateRecordChange, spUpdateRecordChange -> returns [ID]
--   - MJ: Record Clone Log Items ([RecordCloneLogItem]): spCreateRecordCloneLogItem, spUpdateRecordCloneLogItem -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: Record Clone Logs ([RecordCloneLog]): spCreateRecordCloneLog, spUpdateRecordCloneLog -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: Scheduled Job Runs ([ScheduledJobRun]): spCreateScheduledJobRun, spUpdateScheduledJobRun -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: Search Execution Logs ([SearchExecutionLog]): spCreateSearchExecutionLog, spUpdateSearchExecutionLog -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: Test Run Outputs ([TestRunOutput]): spCreateTestRunOutput, spUpdateTestRunOutput -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: Test Runs ([TestRun]): spCreateTestRun, spUpdateTestRun -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: User Record Logs ([UserRecordLog]): spCreateUserRecordLog, spUpdateUserRecordLog -> returns [ID], [__mj_CreatedAt], [__mj_UpdatedAt]
--   - MJ: Work Queue Deliveries ([WorkQueueDelivery]): AllowCreateAPI=0, AllowUpdateAPI=0 (runtime-only metadata config)
--   - MJ: Work Queue Messages ([WorkQueueMessage]): AllowCreateAPI=0, AllowUpdateAPI=0 (runtime-only metadata config)
--
-- =============================================================================
-- CodeGen output (appended)
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
-- =============================================================================

/* spCreate SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: spCreateActionExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActionExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateActionExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateActionExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateActionExecutionLog]
    @ID uniqueidentifier = NULL,
    @ActionID uniqueidentifier,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Params_Clear bit = 0,
    @Params nvarchar(MAX) = NULL,
    @ResultCode_Clear bit = 0,
    @ResultCode nvarchar(255) = NULL,
    @UserID uniqueidentifier,
    @RetentionPeriod_Clear bit = 0,
    @RetentionPeriod int = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @EntityActionID_Clear bit = 0,
    @EntityActionID uniqueidentifier = NULL,
    @EntityActionInvocationTypeID_Clear bit = 0,
    @EntityActionInvocationTypeID uniqueidentifier = NULL,
    @TargetEntityID_Clear bit = 0,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetRecordID_Clear bit = 0,
    @TargetRecordID nvarchar(450) = NULL,
    @ResultParams_Clear bit = 0,
    @ResultParams nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ActionExecutionLog]
            (
                [ID],
                [ActionID],
                [StartedAt],
                [EndedAt],
                [Params],
                [ResultCode],
                [UserID],
                [RetentionPeriod],
                [Message],
                [EntityActionID],
                [EntityActionInvocationTypeID],
                [TargetEntityID],
                [TargetRecordID],
                [ResultParams]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ActionID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @Params_Clear = 1 THEN NULL ELSE ISNULL(@Params, NULL) END,
                CASE WHEN @ResultCode_Clear = 1 THEN NULL ELSE ISNULL(@ResultCode, NULL) END,
                @UserID,
                CASE WHEN @RetentionPeriod_Clear = 1 THEN NULL ELSE ISNULL(@RetentionPeriod, NULL) END,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                CASE WHEN @EntityActionID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionID, NULL) END,
                CASE WHEN @EntityActionInvocationTypeID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionInvocationTypeID, NULL) END,
                CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, NULL) END,
                CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, NULL) END,
                CASE WHEN @ResultParams_Clear = 1 THEN NULL ELSE ISNULL(@ResultParams, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ActionExecutionLog]
            (
                [ActionID],
                [StartedAt],
                [EndedAt],
                [Params],
                [ResultCode],
                [UserID],
                [RetentionPeriod],
                [Message],
                [EntityActionID],
                [EntityActionInvocationTypeID],
                [TargetEntityID],
                [TargetRecordID],
                [ResultParams]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ActionID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @Params_Clear = 1 THEN NULL ELSE ISNULL(@Params, NULL) END,
                CASE WHEN @ResultCode_Clear = 1 THEN NULL ELSE ISNULL(@ResultCode, NULL) END,
                @UserID,
                CASE WHEN @RetentionPeriod_Clear = 1 THEN NULL ELSE ISNULL(@RetentionPeriod, NULL) END,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                CASE WHEN @EntityActionID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionID, NULL) END,
                CASE WHEN @EntityActionInvocationTypeID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionInvocationTypeID, NULL) END,
                CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, NULL) END,
                CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, NULL) END,
                CASE WHEN @ResultParams_Clear = 1 THEN NULL ELSE ISNULL(@ResultParams, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[ActionExecutionLog] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionExecutionLog] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Action Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateActionExecutionLog] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: spUpdateActionExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActionExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateActionExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateActionExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateActionExecutionLog]
    @ID uniqueidentifier,
    @ActionID uniqueidentifier = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Params_Clear bit = 0,
    @Params nvarchar(MAX) = NULL,
    @ResultCode_Clear bit = 0,
    @ResultCode nvarchar(255) = NULL,
    @UserID uniqueidentifier = NULL,
    @RetentionPeriod_Clear bit = 0,
    @RetentionPeriod int = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @EntityActionID_Clear bit = 0,
    @EntityActionID uniqueidentifier = NULL,
    @EntityActionInvocationTypeID_Clear bit = 0,
    @EntityActionInvocationTypeID uniqueidentifier = NULL,
    @TargetEntityID_Clear bit = 0,
    @TargetEntityID uniqueidentifier = NULL,
    @TargetRecordID_Clear bit = 0,
    @TargetRecordID nvarchar(450) = NULL,
    @ResultParams_Clear bit = 0,
    @ResultParams nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionExecutionLog]
    SET
        [ActionID] = ISNULL(@ActionID, [ActionID]),
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [Params] = CASE WHEN @Params_Clear = 1 THEN NULL ELSE ISNULL(@Params, [Params]) END,
        [ResultCode] = CASE WHEN @ResultCode_Clear = 1 THEN NULL ELSE ISNULL(@ResultCode, [ResultCode]) END,
        [UserID] = ISNULL(@UserID, [UserID]),
        [RetentionPeriod] = CASE WHEN @RetentionPeriod_Clear = 1 THEN NULL ELSE ISNULL(@RetentionPeriod, [RetentionPeriod]) END,
        [Message] = CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, [Message]) END,
        [EntityActionID] = CASE WHEN @EntityActionID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionID, [EntityActionID]) END,
        [EntityActionInvocationTypeID] = CASE WHEN @EntityActionInvocationTypeID_Clear = 1 THEN NULL ELSE ISNULL(@EntityActionInvocationTypeID, [EntityActionInvocationTypeID]) END,
        [TargetEntityID] = CASE WHEN @TargetEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetEntityID, [TargetEntityID]) END,
        [TargetRecordID] = CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, [TargetRecordID]) END,
        [ResultParams] = CASE WHEN @ResultParams_Clear = 1 THEN NULL ELSE ISNULL(@ResultParams, [ResultParams]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[ActionExecutionLog] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[ActionExecutionLog] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionExecutionLog] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActionExecutionLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateActionExecutionLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateActionExecutionLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateActionExecutionLog
ON [${flyway:defaultSchema}].[ActionExecutionLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ActionExecutionLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ActionExecutionLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Action Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateActionExecutionLog] TO [cdp_Integration], [cdp_Developer];

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
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AIAgentRunMedia] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
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
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AIAgentRunMedia] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AIAgentRunMedia] WHERE [ID] = @ID
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
    @Comments nvarchar(MAX) = NULL,
    @Skills_Clear bit = 0,
    @Skills nvarchar(MAX) = NULL,
    @ToolCallingMode_Clear bit = 0,
    @ToolCallingMode nvarchar(25) = NULL,
    @NativeToolCallCount_Clear bit = 0,
    @NativeToolCallCount int = NULL,
    @NativeDualChannel_Clear bit = 0,
    @NativeDualChannel bit = NULL,
    @NativeToolResultsSent_Clear bit = 0,
    @NativeToolResultsSent bit = NULL,
    @PayloadAtStartSourceStepID_Clear bit = 0,
    @PayloadAtStartSourceStepID uniqueidentifier = NULL,
    @PayloadAtEndSourceStepID_Clear bit = 0,
    @PayloadAtEndSourceStepID uniqueidentifier = NULL
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
                [Comments],
                [Skills],
                [ToolCallingMode],
                [NativeToolCallCount],
                [NativeDualChannel],
                [NativeToolResultsSent],
                [PayloadAtStartSourceStepID],
                [PayloadAtEndSourceStepID]
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
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @Skills_Clear = 1 THEN NULL ELSE ISNULL(@Skills, NULL) END,
                CASE WHEN @ToolCallingMode_Clear = 1 THEN NULL ELSE ISNULL(@ToolCallingMode, NULL) END,
                CASE WHEN @NativeToolCallCount_Clear = 1 THEN NULL ELSE ISNULL(@NativeToolCallCount, NULL) END,
                CASE WHEN @NativeDualChannel_Clear = 1 THEN NULL ELSE ISNULL(@NativeDualChannel, NULL) END,
                CASE WHEN @NativeToolResultsSent_Clear = 1 THEN NULL ELSE ISNULL(@NativeToolResultsSent, NULL) END,
                CASE WHEN @PayloadAtStartSourceStepID_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtStartSourceStepID, NULL) END,
                CASE WHEN @PayloadAtEndSourceStepID_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtEndSourceStepID, NULL) END
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
                [Comments],
                [Skills],
                [ToolCallingMode],
                [NativeToolCallCount],
                [NativeDualChannel],
                [NativeToolResultsSent],
                [PayloadAtStartSourceStepID],
                [PayloadAtEndSourceStepID]
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
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @Skills_Clear = 1 THEN NULL ELSE ISNULL(@Skills, NULL) END,
                CASE WHEN @ToolCallingMode_Clear = 1 THEN NULL ELSE ISNULL(@ToolCallingMode, NULL) END,
                CASE WHEN @NativeToolCallCount_Clear = 1 THEN NULL ELSE ISNULL(@NativeToolCallCount, NULL) END,
                CASE WHEN @NativeDualChannel_Clear = 1 THEN NULL ELSE ISNULL(@NativeDualChannel, NULL) END,
                CASE WHEN @NativeToolResultsSent_Clear = 1 THEN NULL ELSE ISNULL(@NativeToolResultsSent, NULL) END,
                CASE WHEN @PayloadAtStartSourceStepID_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtStartSourceStepID, NULL) END,
                CASE WHEN @PayloadAtEndSourceStepID_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtEndSourceStepID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AIAgentRunStep] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
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
    @Comments nvarchar(MAX) = NULL,
    @Skills_Clear bit = 0,
    @Skills nvarchar(MAX) = NULL,
    @ToolCallingMode_Clear bit = 0,
    @ToolCallingMode nvarchar(25) = NULL,
    @NativeToolCallCount_Clear bit = 0,
    @NativeToolCallCount int = NULL,
    @NativeDualChannel_Clear bit = 0,
    @NativeDualChannel bit = NULL,
    @NativeToolResultsSent_Clear bit = 0,
    @NativeToolResultsSent bit = NULL,
    @PayloadAtStartSourceStepID_Clear bit = 0,
    @PayloadAtStartSourceStepID uniqueidentifier = NULL,
    @PayloadAtEndSourceStepID_Clear bit = 0,
    @PayloadAtEndSourceStepID uniqueidentifier = NULL
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
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [Skills] = CASE WHEN @Skills_Clear = 1 THEN NULL ELSE ISNULL(@Skills, [Skills]) END,
        [ToolCallingMode] = CASE WHEN @ToolCallingMode_Clear = 1 THEN NULL ELSE ISNULL(@ToolCallingMode, [ToolCallingMode]) END,
        [NativeToolCallCount] = CASE WHEN @NativeToolCallCount_Clear = 1 THEN NULL ELSE ISNULL(@NativeToolCallCount, [NativeToolCallCount]) END,
        [NativeDualChannel] = CASE WHEN @NativeDualChannel_Clear = 1 THEN NULL ELSE ISNULL(@NativeDualChannel, [NativeDualChannel]) END,
        [NativeToolResultsSent] = CASE WHEN @NativeToolResultsSent_Clear = 1 THEN NULL ELSE ISNULL(@NativeToolResultsSent, [NativeToolResultsSent]) END,
        [PayloadAtStartSourceStepID] = CASE WHEN @PayloadAtStartSourceStepID_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtStartSourceStepID, [PayloadAtStartSourceStepID]) END,
        [PayloadAtEndSourceStepID] = CASE WHEN @PayloadAtEndSourceStepID_Clear = 1 THEN NULL ELSE ISNULL(@PayloadAtEndSourceStepID, [PayloadAtEndSourceStepID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AIAgentRunStep] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AIAgentRunStep] WHERE [ID] = @ID
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
    @TotalCost decimal(19, 8) = NULL,
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
    @LastHeartbeatAt datetimeoffset = NULL,
    @AgentSessionID_Clear bit = 0,
    @AgentSessionID uniqueidentifier = NULL,
    @PlanMode bit = NULL,
    @ExternalSessionID_Clear bit = 0,
    @ExternalSessionID nvarchar(255) = NULL,
    @ContinuationDepth int = NULL
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
                [LastHeartbeatAt],
                [AgentSessionID],
                [PlanMode],
                [ExternalSessionID],
                [ContinuationDepth]
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
                CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, 0.00000000) END,
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
                CASE WHEN @LastHeartbeatAt_Clear = 1 THEN NULL ELSE ISNULL(@LastHeartbeatAt, NULL) END,
                CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, NULL) END,
                ISNULL(@PlanMode, 0),
                CASE WHEN @ExternalSessionID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSessionID, NULL) END,
                ISNULL(@ContinuationDepth, 0)
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
                [LastHeartbeatAt],
                [AgentSessionID],
                [PlanMode],
                [ExternalSessionID],
                [ContinuationDepth]
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
                CASE WHEN @TotalCost_Clear = 1 THEN NULL ELSE ISNULL(@TotalCost, 0.00000000) END,
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
                CASE WHEN @LastHeartbeatAt_Clear = 1 THEN NULL ELSE ISNULL(@LastHeartbeatAt, NULL) END,
                CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, NULL) END,
                ISNULL(@PlanMode, 0),
                CASE WHEN @ExternalSessionID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSessionID, NULL) END,
                ISNULL(@ContinuationDepth, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AIAgentRun] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
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
    @TotalCost decimal(19, 8) = NULL,
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
    @LastHeartbeatAt datetimeoffset = NULL,
    @AgentSessionID_Clear bit = 0,
    @AgentSessionID uniqueidentifier = NULL,
    @PlanMode bit = NULL,
    @ExternalSessionID_Clear bit = 0,
    @ExternalSessionID nvarchar(255) = NULL,
    @ContinuationDepth int = NULL
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
        [LastHeartbeatAt] = CASE WHEN @LastHeartbeatAt_Clear = 1 THEN NULL ELSE ISNULL(@LastHeartbeatAt, [LastHeartbeatAt]) END,
        [AgentSessionID] = CASE WHEN @AgentSessionID_Clear = 1 THEN NULL ELSE ISNULL(@AgentSessionID, [AgentSessionID]) END,
        [PlanMode] = ISNULL(@PlanMode, [PlanMode]),
        [ExternalSessionID] = CASE WHEN @ExternalSessionID_Clear = 1 THEN NULL ELSE ISNULL(@ExternalSessionID, [ExternalSessionID]) END,
        [ContinuationDepth] = ISNULL(@ContinuationDepth, [ContinuationDepth])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AIAgentRun] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AIAgentRun] WHERE [ID] = @ID
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

/* spCreate SQL for MJ: AI Prompt Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Run Medias
-- Item: spCreateAIPromptRunMedia
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPromptRunMedia
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIPromptRunMedia]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptRunMedia];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIPromptRunMedia]
    @ID uniqueidentifier = NULL,
    @PromptRunID uniqueidentifier,
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
        INSERT INTO [${flyway:defaultSchema}].[AIPromptRunMedia]
            (
                [ID],
                [PromptRunID],
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
                [Metadata],
                [DisplayOrder],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @PromptRunID,
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
                CASE WHEN @Metadata_Clear = 1 THEN NULL ELSE ISNULL(@Metadata, NULL) END,
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIPromptRunMedia]
            (
                [PromptRunID],
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
                [Metadata],
                [DisplayOrder],
                [Description]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @PromptRunID,
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
                CASE WHEN @Metadata_Clear = 1 THEN NULL ELSE ISNULL(@Metadata, NULL) END,
                ISNULL(@DisplayOrder, 0),
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AIPromptRunMedia] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRunMedia] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Prompt Run Medias */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIPromptRunMedia] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Prompt Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Run Medias
-- Item: spUpdateAIPromptRunMedia
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPromptRunMedia
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIPromptRunMedia]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptRunMedia];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIPromptRunMedia]
    @ID uniqueidentifier,
    @PromptRunID uniqueidentifier = NULL,
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
    @Metadata_Clear bit = 0,
    @Metadata nvarchar(MAX) = NULL,
    @DisplayOrder int = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptRunMedia]
    SET
        [PromptRunID] = ISNULL(@PromptRunID, [PromptRunID]),
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
        [Metadata] = CASE WHEN @Metadata_Clear = 1 THEN NULL ELSE ISNULL(@Metadata, [Metadata]) END,
        [DisplayOrder] = ISNULL(@DisplayOrder, [DisplayOrder]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AIPromptRunMedia] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AIPromptRunMedia] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRunMedia] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptRunMedia table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIPromptRunMedia]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIPromptRunMedia];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIPromptRunMedia
ON [${flyway:defaultSchema}].[AIPromptRunMedia]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIPromptRunMedia]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIPromptRunMedia] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Prompt Run Medias */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIPromptRunMedia] TO [cdp_Developer], [cdp_Integration];

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
    @TotalCost decimal(19, 8) = NULL,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @RunType nvarchar(20) = NULL,
    @ExecutionOrder_Clear bit = 0,
    @ExecutionOrder int = NULL,
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
    @DescendantCost decimal(19, 8) = NULL,
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
    @TokensCacheWriteRollup int = NULL,
    @InputUnitsUsed_Clear bit = 0,
    @InputUnitsUsed decimal(19, 8) = NULL,
    @OutputUnitsUsed_Clear bit = 0,
    @OutputUnitsUsed decimal(19, 8) = NULL,
    @UsageTypeID_Clear bit = 0,
    @UsageTypeID uniqueidentifier = NULL,
    @ToolCallingMode_Clear bit = 0,
    @ToolCallingMode nvarchar(25) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL
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
                [TokensCacheWriteRollup],
                [InputUnitsUsed],
                [OutputUnitsUsed],
                [UsageTypeID],
                [ToolCallingMode],
                [UserID]
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
                CASE WHEN @TokensCacheWriteRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWriteRollup, NULL) END,
                CASE WHEN @InputUnitsUsed_Clear = 1 THEN NULL ELSE ISNULL(@InputUnitsUsed, NULL) END,
                CASE WHEN @OutputUnitsUsed_Clear = 1 THEN NULL ELSE ISNULL(@OutputUnitsUsed, NULL) END,
                CASE WHEN @UsageTypeID_Clear = 1 THEN NULL ELSE ISNULL(@UsageTypeID, NULL) END,
                CASE WHEN @ToolCallingMode_Clear = 1 THEN NULL ELSE ISNULL(@ToolCallingMode, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END
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
                [TokensCacheWriteRollup],
                [InputUnitsUsed],
                [OutputUnitsUsed],
                [UsageTypeID],
                [ToolCallingMode],
                [UserID]
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
                CASE WHEN @TokensCacheWriteRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWriteRollup, NULL) END,
                CASE WHEN @InputUnitsUsed_Clear = 1 THEN NULL ELSE ISNULL(@InputUnitsUsed, NULL) END,
                CASE WHEN @OutputUnitsUsed_Clear = 1 THEN NULL ELSE ISNULL(@OutputUnitsUsed, NULL) END,
                CASE WHEN @UsageTypeID_Clear = 1 THEN NULL ELSE ISNULL(@UsageTypeID, NULL) END,
                CASE WHEN @ToolCallingMode_Clear = 1 THEN NULL ELSE ISNULL(@ToolCallingMode, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AIPromptRun] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
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
    @TotalCost decimal(19, 8) = NULL,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ParentID_Clear bit = 0,
    @ParentID uniqueidentifier = NULL,
    @RunType nvarchar(20) = NULL,
    @ExecutionOrder_Clear bit = 0,
    @ExecutionOrder int = NULL,
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
    @DescendantCost decimal(19, 8) = NULL,
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
    @TokensCacheWriteRollup int = NULL,
    @InputUnitsUsed_Clear bit = 0,
    @InputUnitsUsed decimal(19, 8) = NULL,
    @OutputUnitsUsed_Clear bit = 0,
    @OutputUnitsUsed decimal(19, 8) = NULL,
    @UsageTypeID_Clear bit = 0,
    @UsageTypeID uniqueidentifier = NULL,
    @ToolCallingMode_Clear bit = 0,
    @ToolCallingMode nvarchar(25) = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL
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
        [TokensCacheWriteRollup] = CASE WHEN @TokensCacheWriteRollup_Clear = 1 THEN NULL ELSE ISNULL(@TokensCacheWriteRollup, [TokensCacheWriteRollup]) END,
        [InputUnitsUsed] = CASE WHEN @InputUnitsUsed_Clear = 1 THEN NULL ELSE ISNULL(@InputUnitsUsed, [InputUnitsUsed]) END,
        [OutputUnitsUsed] = CASE WHEN @OutputUnitsUsed_Clear = 1 THEN NULL ELSE ISNULL(@OutputUnitsUsed, [OutputUnitsUsed]) END,
        [UsageTypeID] = CASE WHEN @UsageTypeID_Clear = 1 THEN NULL ELSE ISNULL(@UsageTypeID, [UsageTypeID]) END,
        [ToolCallingMode] = CASE WHEN @ToolCallingMode_Clear = 1 THEN NULL ELSE ISNULL(@ToolCallingMode, [ToolCallingMode]) END,
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AIPromptRun] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AIPromptRun] WHERE [ID] = @ID
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

/* spCreate SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: spCreateAPIKeyUsageLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR APIKeyUsageLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAPIKeyUsageLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog]
    @ID uniqueidentifier = NULL,
    @APIKeyID uniqueidentifier,
    @Endpoint nvarchar(500),
    @Operation_Clear bit = 0,
    @Operation nvarchar(255) = NULL,
    @Method nvarchar(10),
    @StatusCode int,
    @ResponseTimeMs_Clear bit = 0,
    @ResponseTimeMs int = NULL,
    @IPAddress_Clear bit = 0,
    @IPAddress nvarchar(45) = NULL,
    @UserAgent_Clear bit = 0,
    @UserAgent nvarchar(500) = NULL,
    @ApplicationID_Clear bit = 0,
    @ApplicationID uniqueidentifier = NULL,
    @RequestedResource_Clear bit = 0,
    @RequestedResource nvarchar(500) = NULL,
    @ScopesEvaluated_Clear bit = 0,
    @ScopesEvaluated nvarchar(MAX) = NULL,
    @AuthorizationResult nvarchar(20) = NULL,
    @DeniedReason_Clear bit = 0,
    @DeniedReason nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[APIKeyUsageLog]
            (
                [ID],
                [APIKeyID],
                [Endpoint],
                [Operation],
                [Method],
                [StatusCode],
                [ResponseTimeMs],
                [IPAddress],
                [UserAgent],
                [ApplicationID],
                [RequestedResource],
                [ScopesEvaluated],
                [AuthorizationResult],
                [DeniedReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @APIKeyID,
                @Endpoint,
                CASE WHEN @Operation_Clear = 1 THEN NULL ELSE ISNULL(@Operation, NULL) END,
                @Method,
                @StatusCode,
                CASE WHEN @ResponseTimeMs_Clear = 1 THEN NULL ELSE ISNULL(@ResponseTimeMs, NULL) END,
                CASE WHEN @IPAddress_Clear = 1 THEN NULL ELSE ISNULL(@IPAddress, NULL) END,
                CASE WHEN @UserAgent_Clear = 1 THEN NULL ELSE ISNULL(@UserAgent, NULL) END,
                CASE WHEN @ApplicationID_Clear = 1 THEN NULL ELSE ISNULL(@ApplicationID, NULL) END,
                CASE WHEN @RequestedResource_Clear = 1 THEN NULL ELSE ISNULL(@RequestedResource, NULL) END,
                CASE WHEN @ScopesEvaluated_Clear = 1 THEN NULL ELSE ISNULL(@ScopesEvaluated, NULL) END,
                ISNULL(@AuthorizationResult, 'Allowed'),
                CASE WHEN @DeniedReason_Clear = 1 THEN NULL ELSE ISNULL(@DeniedReason, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[APIKeyUsageLog]
            (
                [APIKeyID],
                [Endpoint],
                [Operation],
                [Method],
                [StatusCode],
                [ResponseTimeMs],
                [IPAddress],
                [UserAgent],
                [ApplicationID],
                [RequestedResource],
                [ScopesEvaluated],
                [AuthorizationResult],
                [DeniedReason]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @APIKeyID,
                @Endpoint,
                CASE WHEN @Operation_Clear = 1 THEN NULL ELSE ISNULL(@Operation, NULL) END,
                @Method,
                @StatusCode,
                CASE WHEN @ResponseTimeMs_Clear = 1 THEN NULL ELSE ISNULL(@ResponseTimeMs, NULL) END,
                CASE WHEN @IPAddress_Clear = 1 THEN NULL ELSE ISNULL(@IPAddress, NULL) END,
                CASE WHEN @UserAgent_Clear = 1 THEN NULL ELSE ISNULL(@UserAgent, NULL) END,
                CASE WHEN @ApplicationID_Clear = 1 THEN NULL ELSE ISNULL(@ApplicationID, NULL) END,
                CASE WHEN @RequestedResource_Clear = 1 THEN NULL ELSE ISNULL(@RequestedResource, NULL) END,
                CASE WHEN @ScopesEvaluated_Clear = 1 THEN NULL ELSE ISNULL(@ScopesEvaluated, NULL) END,
                ISNULL(@AuthorizationResult, 'Allowed'),
                CASE WHEN @DeniedReason_Clear = 1 THEN NULL ELSE ISNULL(@DeniedReason, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[APIKeyUsageLog] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: API Key Usage Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: API Key Usage Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: API Key Usage Logs
-- Item: spUpdateAPIKeyUsageLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR APIKeyUsageLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog]
    @ID uniqueidentifier,
    @APIKeyID uniqueidentifier = NULL,
    @Endpoint nvarchar(500) = NULL,
    @Operation_Clear bit = 0,
    @Operation nvarchar(255) = NULL,
    @Method nvarchar(10) = NULL,
    @StatusCode int = NULL,
    @ResponseTimeMs_Clear bit = 0,
    @ResponseTimeMs int = NULL,
    @IPAddress_Clear bit = 0,
    @IPAddress nvarchar(45) = NULL,
    @UserAgent_Clear bit = 0,
    @UserAgent nvarchar(500) = NULL,
    @ApplicationID_Clear bit = 0,
    @ApplicationID uniqueidentifier = NULL,
    @RequestedResource_Clear bit = 0,
    @RequestedResource nvarchar(500) = NULL,
    @ScopesEvaluated_Clear bit = 0,
    @ScopesEvaluated nvarchar(MAX) = NULL,
    @AuthorizationResult nvarchar(20) = NULL,
    @DeniedReason_Clear bit = 0,
    @DeniedReason nvarchar(500) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyUsageLog]
    SET
        [APIKeyID] = ISNULL(@APIKeyID, [APIKeyID]),
        [Endpoint] = ISNULL(@Endpoint, [Endpoint]),
        [Operation] = CASE WHEN @Operation_Clear = 1 THEN NULL ELSE ISNULL(@Operation, [Operation]) END,
        [Method] = ISNULL(@Method, [Method]),
        [StatusCode] = ISNULL(@StatusCode, [StatusCode]),
        [ResponseTimeMs] = CASE WHEN @ResponseTimeMs_Clear = 1 THEN NULL ELSE ISNULL(@ResponseTimeMs, [ResponseTimeMs]) END,
        [IPAddress] = CASE WHEN @IPAddress_Clear = 1 THEN NULL ELSE ISNULL(@IPAddress, [IPAddress]) END,
        [UserAgent] = CASE WHEN @UserAgent_Clear = 1 THEN NULL ELSE ISNULL(@UserAgent, [UserAgent]) END,
        [ApplicationID] = CASE WHEN @ApplicationID_Clear = 1 THEN NULL ELSE ISNULL(@ApplicationID, [ApplicationID]) END,
        [RequestedResource] = CASE WHEN @RequestedResource_Clear = 1 THEN NULL ELSE ISNULL(@RequestedResource, [RequestedResource]) END,
        [ScopesEvaluated] = CASE WHEN @ScopesEvaluated_Clear = 1 THEN NULL ELSE ISNULL(@ScopesEvaluated, [ScopesEvaluated]) END,
        [AuthorizationResult] = ISNULL(@AuthorizationResult, [AuthorizationResult]),
        [DeniedReason] = CASE WHEN @DeniedReason_Clear = 1 THEN NULL ELSE ISNULL(@DeniedReason, [DeniedReason]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[APIKeyUsageLog] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[APIKeyUsageLog] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the APIKeyUsageLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAPIKeyUsageLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAPIKeyUsageLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAPIKeyUsageLog
ON [${flyway:defaultSchema}].[APIKeyUsageLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[APIKeyUsageLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[APIKeyUsageLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: API Key Usage Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAPIKeyUsageLog] TO [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Audit Logs
-- Item: spCreateAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AuditLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAuditLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAuditLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAuditLog]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @AuditLogTypeID uniqueidentifier,
    @AuthorizationID_Clear bit = 0,
    @AuthorizationID uniqueidentifier = NULL,
    @Status nvarchar(50) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Details_Clear bit = 0,
    @Details nvarchar(MAX) = NULL,
    @EntityID_Clear bit = 0,
    @EntityID uniqueidentifier = NULL,
    @RecordID_Clear bit = 0,
    @RecordID nvarchar(450) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AuditLog]
            (
                [ID],
                [UserID],
                [AuditLogTypeID],
                [AuthorizationID],
                [Status],
                [Description],
                [Details],
                [EntityID],
                [RecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @AuditLogTypeID,
                CASE WHEN @AuthorizationID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizationID, NULL) END,
                ISNULL(@Status, 'Allow'),
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Details_Clear = 1 THEN NULL ELSE ISNULL(@Details, NULL) END,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                CASE WHEN @RecordID_Clear = 1 THEN NULL ELSE ISNULL(@RecordID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AuditLog]
            (
                [UserID],
                [AuditLogTypeID],
                [AuthorizationID],
                [Status],
                [Description],
                [Details],
                [EntityID],
                [RecordID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @AuditLogTypeID,
                CASE WHEN @AuthorizationID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizationID, NULL) END,
                ISNULL(@Status, 'Allow'),
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @Details_Clear = 1 THEN NULL ELSE ISNULL(@Details, NULL) END,
                CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, NULL) END,
                CASE WHEN @RecordID_Clear = 1 THEN NULL ELSE ISNULL(@RecordID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AuditLog] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAuditLog] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Audit Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAuditLog] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Audit Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Audit Logs
-- Item: spUpdateAuditLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AuditLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAuditLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAuditLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAuditLog]
    @ID uniqueidentifier,
    @UserID uniqueidentifier = NULL,
    @AuditLogTypeID uniqueidentifier = NULL,
    @AuthorizationID_Clear bit = 0,
    @AuthorizationID uniqueidentifier = NULL,
    @Status nvarchar(50) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @Details_Clear bit = 0,
    @Details nvarchar(MAX) = NULL,
    @EntityID_Clear bit = 0,
    @EntityID uniqueidentifier = NULL,
    @RecordID_Clear bit = 0,
    @RecordID nvarchar(450) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AuditLog]
    SET
        [UserID] = ISNULL(@UserID, [UserID]),
        [AuditLogTypeID] = ISNULL(@AuditLogTypeID, [AuditLogTypeID]),
        [AuthorizationID] = CASE WHEN @AuthorizationID_Clear = 1 THEN NULL ELSE ISNULL(@AuthorizationID, [AuthorizationID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [Details] = CASE WHEN @Details_Clear = 1 THEN NULL ELSE ISNULL(@Details, [Details]) END,
        [EntityID] = CASE WHEN @EntityID_Clear = 1 THEN NULL ELSE ISNULL(@EntityID, [EntityID]) END,
        [RecordID] = CASE WHEN @RecordID_Clear = 1 THEN NULL ELSE ISNULL(@RecordID, [RecordID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AuditLog] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[AuditLog] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAuditLog] TO [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AuditLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAuditLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAuditLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAuditLog
ON [${flyway:defaultSchema}].[AuditLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AuditLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AuditLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Audit Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAuditLog] TO [cdp_Developer];

/* spCreate SQL for MJ: Company Integration Run API Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Run API Logs
-- Item: spCreateCompanyIntegrationRunAPILog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationRunAPILog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegrationRunAPILog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunAPILog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunAPILog]
    @ID uniqueidentifier = NULL,
    @CompanyIntegrationRunID uniqueidentifier,
    @ExecutedAt datetimeoffset = NULL,
    @IsSuccess bit = NULL,
    @RequestMethod_Clear bit = 0,
    @RequestMethod nvarchar(12) = NULL,
    @URL_Clear bit = 0,
    @URL nvarchar(MAX) = NULL,
    @Parameters_Clear bit = 0,
    @Parameters nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]
            (
                [ID],
                [CompanyIntegrationRunID],
                [ExecutedAt],
                [IsSuccess],
                [RequestMethod],
                [URL],
                [Parameters]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyIntegrationRunID,
                ISNULL(@ExecutedAt, sysdatetimeoffset()),
                ISNULL(@IsSuccess, 0),
                CASE WHEN @RequestMethod_Clear = 1 THEN NULL ELSE ISNULL(@RequestMethod, NULL) END,
                CASE WHEN @URL_Clear = 1 THEN NULL ELSE ISNULL(@URL, NULL) END,
                CASE WHEN @Parameters_Clear = 1 THEN NULL ELSE ISNULL(@Parameters, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]
            (
                [CompanyIntegrationRunID],
                [ExecutedAt],
                [IsSuccess],
                [RequestMethod],
                [URL],
                [Parameters]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyIntegrationRunID,
                ISNULL(@ExecutedAt, sysdatetimeoffset()),
                ISNULL(@IsSuccess, 0),
                CASE WHEN @RequestMethod_Clear = 1 THEN NULL ELSE ISNULL(@RequestMethod, NULL) END,
                CASE WHEN @URL_Clear = 1 THEN NULL ELSE ISNULL(@URL, NULL) END,
                CASE WHEN @Parameters_Clear = 1 THEN NULL ELSE ISNULL(@Parameters, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunAPILog] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Company Integration Run API Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunAPILog] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Company Integration Run API Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Run API Logs
-- Item: spUpdateCompanyIntegrationRunAPILog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationRunAPILog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunAPILog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunAPILog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunAPILog]
    @ID uniqueidentifier,
    @CompanyIntegrationRunID uniqueidentifier = NULL,
    @ExecutedAt datetimeoffset = NULL,
    @IsSuccess bit = NULL,
    @RequestMethod_Clear bit = 0,
    @RequestMethod nvarchar(12) = NULL,
    @URL_Clear bit = 0,
    @URL nvarchar(MAX) = NULL,
    @Parameters_Clear bit = 0,
    @Parameters nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]
    SET
        [CompanyIntegrationRunID] = ISNULL(@CompanyIntegrationRunID, [CompanyIntegrationRunID]),
        [ExecutedAt] = ISNULL(@ExecutedAt, [ExecutedAt]),
        [IsSuccess] = ISNULL(@IsSuccess, [IsSuccess]),
        [RequestMethod] = CASE WHEN @RequestMethod_Clear = 1 THEN NULL ELSE ISNULL(@RequestMethod, [RequestMethod]) END,
        [URL] = CASE WHEN @URL_Clear = 1 THEN NULL ELSE ISNULL(@URL, [URL]) END,
        [Parameters] = CASE WHEN @Parameters_Clear = 1 THEN NULL ELSE ISNULL(@Parameters, [Parameters]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunAPILog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationRunAPILog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRunAPILog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRunAPILog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegrationRunAPILog
ON [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegrationRunAPILog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Company Integration Run API Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunAPILog] TO [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Company Integration Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Run Details
-- Item: spCreateCompanyIntegrationRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegrationRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunDetail]
    @ID uniqueidentifier = NULL,
    @CompanyIntegrationRunID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @Action nchar(20),
    @ExecutedAt datetimeoffset = NULL,
    @IsSuccess bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRunDetail]
            (
                [ID],
                [CompanyIntegrationRunID],
                [EntityID],
                [RecordID],
                [Action],
                [ExecutedAt],
                [IsSuccess]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyIntegrationRunID,
                @EntityID,
                @RecordID,
                @Action,
                ISNULL(@ExecutedAt, sysdatetimeoffset()),
                ISNULL(@IsSuccess, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRunDetail]
            (
                [CompanyIntegrationRunID],
                [EntityID],
                [RecordID],
                [Action],
                [ExecutedAt],
                [IsSuccess]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyIntegrationRunID,
                @EntityID,
                @RecordID,
                @Action,
                ISNULL(@ExecutedAt, sysdatetimeoffset()),
                ISNULL(@IsSuccess, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunDetail] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Company Integration Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRunDetail] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Company Integration Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Run Details
-- Item: spUpdateCompanyIntegrationRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunDetail]
    @ID uniqueidentifier,
    @CompanyIntegrationRunID uniqueidentifier = NULL,
    @EntityID uniqueidentifier = NULL,
    @RecordID nvarchar(450) = NULL,
    @Action nchar(20) = NULL,
    @ExecutedAt datetimeoffset = NULL,
    @IsSuccess bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRunDetail]
    SET
        [CompanyIntegrationRunID] = ISNULL(@CompanyIntegrationRunID, [CompanyIntegrationRunID]),
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [RecordID] = ISNULL(@RecordID, [RecordID]),
        [Action] = ISNULL(@Action, [Action]),
        [ExecutedAt] = ISNULL(@ExecutedAt, [ExecutedAt]),
        [IsSuccess] = ISNULL(@IsSuccess, [IsSuccess])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationRunDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRunDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRunDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegrationRunDetail
ON [${flyway:defaultSchema}].[CompanyIntegrationRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRunDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegrationRunDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Company Integration Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRunDetail] TO [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Content Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Details
-- Item: spCreateContentProcessRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentProcessRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateContentProcessRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateContentProcessRunDetail]
    @ID uniqueidentifier = NULL,
    @ContentProcessRunID uniqueidentifier,
    @ContentSourceID uniqueidentifier,
    @ContentSourceTypeID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @ItemsProcessed int = NULL,
    @ItemsTagged int = NULL,
    @ItemsVectorized int = NULL,
    @TagsCreated int = NULL,
    @ErrorCount int = NULL,
    @StartTime_Clear bit = 0,
    @StartTime datetimeoffset = NULL,
    @EndTime_Clear bit = 0,
    @EndTime datetimeoffset = NULL,
    @TotalTokensUsed int = NULL,
    @TotalCost decimal(18, 6) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRunDetail]
            (
                [ID],
                [ContentProcessRunID],
                [ContentSourceID],
                [ContentSourceTypeID],
                [Status],
                [ItemsProcessed],
                [ItemsTagged],
                [ItemsVectorized],
                [TagsCreated],
                [ErrorCount],
                [StartTime],
                [EndTime],
                [TotalTokensUsed],
                [TotalCost]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ContentProcessRunID,
                @ContentSourceID,
                @ContentSourceTypeID,
                ISNULL(@Status, 'Pending'),
                ISNULL(@ItemsProcessed, 0),
                ISNULL(@ItemsTagged, 0),
                ISNULL(@ItemsVectorized, 0),
                ISNULL(@TagsCreated, 0),
                ISNULL(@ErrorCount, 0),
                CASE WHEN @StartTime_Clear = 1 THEN NULL ELSE ISNULL(@StartTime, NULL) END,
                CASE WHEN @EndTime_Clear = 1 THEN NULL ELSE ISNULL(@EndTime, NULL) END,
                ISNULL(@TotalTokensUsed, 0),
                ISNULL(@TotalCost, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ContentProcessRunDetail]
            (
                [ContentProcessRunID],
                [ContentSourceID],
                [ContentSourceTypeID],
                [Status],
                [ItemsProcessed],
                [ItemsTagged],
                [ItemsVectorized],
                [TagsCreated],
                [ErrorCount],
                [StartTime],
                [EndTime],
                [TotalTokensUsed],
                [TotalCost]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ContentProcessRunID,
                @ContentSourceID,
                @ContentSourceTypeID,
                ISNULL(@Status, 'Pending'),
                ISNULL(@ItemsProcessed, 0),
                ISNULL(@ItemsTagged, 0),
                ISNULL(@ItemsVectorized, 0),
                ISNULL(@TagsCreated, 0),
                ISNULL(@ErrorCount, 0),
                CASE WHEN @StartTime_Clear = 1 THEN NULL ELSE ISNULL(@StartTime, NULL) END,
                CASE WHEN @EndTime_Clear = 1 THEN NULL ELSE ISNULL(@EndTime, NULL) END,
                ISNULL(@TotalTokensUsed, 0),
                ISNULL(@TotalCost, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[ContentProcessRunDetail] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRunDetail] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Content Process Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateContentProcessRunDetail] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Content Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Process Run Details
-- Item: spUpdateContentProcessRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentProcessRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateContentProcessRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateContentProcessRunDetail]
    @ID uniqueidentifier,
    @ContentProcessRunID uniqueidentifier = NULL,
    @ContentSourceID uniqueidentifier = NULL,
    @ContentSourceTypeID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @ItemsProcessed int = NULL,
    @ItemsTagged int = NULL,
    @ItemsVectorized int = NULL,
    @TagsCreated int = NULL,
    @ErrorCount int = NULL,
    @StartTime_Clear bit = 0,
    @StartTime datetimeoffset = NULL,
    @EndTime_Clear bit = 0,
    @EndTime datetimeoffset = NULL,
    @TotalTokensUsed int = NULL,
    @TotalCost decimal(18, 6) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRunDetail]
    SET
        [ContentProcessRunID] = ISNULL(@ContentProcessRunID, [ContentProcessRunID]),
        [ContentSourceID] = ISNULL(@ContentSourceID, [ContentSourceID]),
        [ContentSourceTypeID] = ISNULL(@ContentSourceTypeID, [ContentSourceTypeID]),
        [Status] = ISNULL(@Status, [Status]),
        [ItemsProcessed] = ISNULL(@ItemsProcessed, [ItemsProcessed]),
        [ItemsTagged] = ISNULL(@ItemsTagged, [ItemsTagged]),
        [ItemsVectorized] = ISNULL(@ItemsVectorized, [ItemsVectorized]),
        [TagsCreated] = ISNULL(@TagsCreated, [TagsCreated]),
        [ErrorCount] = ISNULL(@ErrorCount, [ErrorCount]),
        [StartTime] = CASE WHEN @StartTime_Clear = 1 THEN NULL ELSE ISNULL(@StartTime, [StartTime]) END,
        [EndTime] = CASE WHEN @EndTime_Clear = 1 THEN NULL ELSE ISNULL(@EndTime, [EndTime]) END,
        [TotalTokensUsed] = ISNULL(@TotalTokensUsed, [TotalTokensUsed]),
        [TotalCost] = ISNULL(@TotalCost, [TotalCost])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[ContentProcessRunDetail] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[ContentProcessRunDetail] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRunDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentProcessRunDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateContentProcessRunDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateContentProcessRunDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateContentProcessRunDetail
ON [${flyway:defaultSchema}].[ContentProcessRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ContentProcessRunDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ContentProcessRunDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Content Process Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateContentProcessRunDetail] TO [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Error Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Error Logs
-- Item: spCreateErrorLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ErrorLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateErrorLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateErrorLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateErrorLog]
    @ID uniqueidentifier = NULL,
    @CompanyIntegrationRunID_Clear bit = 0,
    @CompanyIntegrationRunID uniqueidentifier = NULL,
    @CompanyIntegrationRunDetailID_Clear bit = 0,
    @CompanyIntegrationRunDetailID uniqueidentifier = NULL,
    @Code_Clear bit = 0,
    @Code nchar(20) = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @CreatedBy_Clear bit = 0,
    @CreatedBy nvarchar(50) = NULL,
    @Status_Clear bit = 0,
    @Status nvarchar(10) = NULL,
    @Category_Clear bit = 0,
    @Category nvarchar(20) = NULL,
    @Details_Clear bit = 0,
    @Details nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ErrorLog]
            (
                [ID],
                [CompanyIntegrationRunID],
                [CompanyIntegrationRunDetailID],
                [Code],
                [Message],
                [CreatedBy],
                [Status],
                [Category],
                [Details]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @CompanyIntegrationRunID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationRunID, NULL) END,
                CASE WHEN @CompanyIntegrationRunDetailID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationRunDetailID, NULL) END,
                CASE WHEN @Code_Clear = 1 THEN NULL ELSE ISNULL(@Code, NULL) END,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                CASE WHEN @CreatedBy_Clear = 1 THEN NULL ELSE ISNULL(@CreatedBy, suser_name()) END,
                CASE WHEN @Status_Clear = 1 THEN NULL ELSE ISNULL(@Status, NULL) END,
                CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, NULL) END,
                CASE WHEN @Details_Clear = 1 THEN NULL ELSE ISNULL(@Details, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ErrorLog]
            (
                [CompanyIntegrationRunID],
                [CompanyIntegrationRunDetailID],
                [Code],
                [Message],
                [CreatedBy],
                [Status],
                [Category],
                [Details]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @CompanyIntegrationRunID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationRunID, NULL) END,
                CASE WHEN @CompanyIntegrationRunDetailID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationRunDetailID, NULL) END,
                CASE WHEN @Code_Clear = 1 THEN NULL ELSE ISNULL(@Code, NULL) END,
                CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, NULL) END,
                CASE WHEN @CreatedBy_Clear = 1 THEN NULL ELSE ISNULL(@CreatedBy, suser_name()) END,
                CASE WHEN @Status_Clear = 1 THEN NULL ELSE ISNULL(@Status, NULL) END,
                CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, NULL) END,
                CASE WHEN @Details_Clear = 1 THEN NULL ELSE ISNULL(@Details, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[ErrorLog] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateErrorLog] TO [cdp_Integration], [cdp_Developer];

/* spCreate Permissions for MJ: Error Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateErrorLog] TO [cdp_Integration], [cdp_Developer];

/* spUpdate SQL for MJ: Error Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Error Logs
-- Item: spUpdateErrorLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ErrorLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateErrorLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateErrorLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateErrorLog]
    @ID uniqueidentifier,
    @CompanyIntegrationRunID_Clear bit = 0,
    @CompanyIntegrationRunID uniqueidentifier = NULL,
    @CompanyIntegrationRunDetailID_Clear bit = 0,
    @CompanyIntegrationRunDetailID uniqueidentifier = NULL,
    @Code_Clear bit = 0,
    @Code nchar(20) = NULL,
    @Message_Clear bit = 0,
    @Message nvarchar(MAX) = NULL,
    @CreatedBy_Clear bit = 0,
    @CreatedBy nvarchar(50) = NULL,
    @Status_Clear bit = 0,
    @Status nvarchar(10) = NULL,
    @Category_Clear bit = 0,
    @Category nvarchar(20) = NULL,
    @Details_Clear bit = 0,
    @Details nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ErrorLog]
    SET
        [CompanyIntegrationRunID] = CASE WHEN @CompanyIntegrationRunID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationRunID, [CompanyIntegrationRunID]) END,
        [CompanyIntegrationRunDetailID] = CASE WHEN @CompanyIntegrationRunDetailID_Clear = 1 THEN NULL ELSE ISNULL(@CompanyIntegrationRunDetailID, [CompanyIntegrationRunDetailID]) END,
        [Code] = CASE WHEN @Code_Clear = 1 THEN NULL ELSE ISNULL(@Code, [Code]) END,
        [Message] = CASE WHEN @Message_Clear = 1 THEN NULL ELSE ISNULL(@Message, [Message]) END,
        [CreatedBy] = CASE WHEN @CreatedBy_Clear = 1 THEN NULL ELSE ISNULL(@CreatedBy, [CreatedBy]) END,
        [Status] = CASE WHEN @Status_Clear = 1 THEN NULL ELSE ISNULL(@Status, [Status]) END,
        [Category] = CASE WHEN @Category_Clear = 1 THEN NULL ELSE ISNULL(@Category, [Category]) END,
        [Details] = CASE WHEN @Details_Clear = 1 THEN NULL ELSE ISNULL(@Details, [Details]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[ErrorLog] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[ErrorLog] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateErrorLog] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ErrorLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateErrorLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateErrorLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateErrorLog
ON [${flyway:defaultSchema}].[ErrorLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ErrorLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ErrorLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Error Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateErrorLog] TO [cdp_Integration], [cdp_Developer];

/* spCreate SQL for MJ: MCP Tool Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Execution Logs
-- Item: spCreateMCPToolExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR MCPToolExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateMCPToolExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateMCPToolExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateMCPToolExecutionLog]
    @ID uniqueidentifier = NULL,
    @MCPServerConnectionID uniqueidentifier,
    @MCPServerToolID_Clear bit = 0,
    @MCPServerToolID uniqueidentifier = NULL,
    @ToolName nvarchar(255),
    @UserID uniqueidentifier,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @DurationMs_Clear bit = 0,
    @DurationMs int = NULL,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @InputParameters_Clear bit = 0,
    @InputParameters nvarchar(MAX) = NULL,
    @OutputContent_Clear bit = 0,
    @OutputContent nvarchar(MAX) = NULL,
    @OutputTruncated bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[MCPToolExecutionLog]
            (
                [ID],
                [MCPServerConnectionID],
                [MCPServerToolID],
                [ToolName],
                [UserID],
                [StartedAt],
                [EndedAt],
                [DurationMs],
                [Success],
                [ErrorMessage],
                [InputParameters],
                [OutputContent],
                [OutputTruncated]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @MCPServerConnectionID,
                CASE WHEN @MCPServerToolID_Clear = 1 THEN NULL ELSE ISNULL(@MCPServerToolID, NULL) END,
                @ToolName,
                @UserID,
                ISNULL(@StartedAt, getutcdate()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @DurationMs_Clear = 1 THEN NULL ELSE ISNULL(@DurationMs, NULL) END,
                ISNULL(@Success, 0),
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @InputParameters_Clear = 1 THEN NULL ELSE ISNULL(@InputParameters, NULL) END,
                CASE WHEN @OutputContent_Clear = 1 THEN NULL ELSE ISNULL(@OutputContent, NULL) END,
                ISNULL(@OutputTruncated, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[MCPToolExecutionLog]
            (
                [MCPServerConnectionID],
                [MCPServerToolID],
                [ToolName],
                [UserID],
                [StartedAt],
                [EndedAt],
                [DurationMs],
                [Success],
                [ErrorMessage],
                [InputParameters],
                [OutputContent],
                [OutputTruncated]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @MCPServerConnectionID,
                CASE WHEN @MCPServerToolID_Clear = 1 THEN NULL ELSE ISNULL(@MCPServerToolID, NULL) END,
                @ToolName,
                @UserID,
                ISNULL(@StartedAt, getutcdate()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @DurationMs_Clear = 1 THEN NULL ELSE ISNULL(@DurationMs, NULL) END,
                ISNULL(@Success, 0),
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @InputParameters_Clear = 1 THEN NULL ELSE ISNULL(@InputParameters, NULL) END,
                CASE WHEN @OutputContent_Clear = 1 THEN NULL ELSE ISNULL(@OutputContent, NULL) END,
                ISNULL(@OutputTruncated, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[MCPToolExecutionLog] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPToolExecutionLog] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: MCP Tool Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateMCPToolExecutionLog] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: MCP Tool Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: MCP Tool Execution Logs
-- Item: spUpdateMCPToolExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR MCPToolExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateMCPToolExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPToolExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateMCPToolExecutionLog]
    @ID uniqueidentifier,
    @MCPServerConnectionID uniqueidentifier = NULL,
    @MCPServerToolID_Clear bit = 0,
    @MCPServerToolID uniqueidentifier = NULL,
    @ToolName nvarchar(255) = NULL,
    @UserID uniqueidentifier = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @DurationMs_Clear bit = 0,
    @DurationMs int = NULL,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @InputParameters_Clear bit = 0,
    @InputParameters nvarchar(MAX) = NULL,
    @OutputContent_Clear bit = 0,
    @OutputContent nvarchar(MAX) = NULL,
    @OutputTruncated bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPToolExecutionLog]
    SET
        [MCPServerConnectionID] = ISNULL(@MCPServerConnectionID, [MCPServerConnectionID]),
        [MCPServerToolID] = CASE WHEN @MCPServerToolID_Clear = 1 THEN NULL ELSE ISNULL(@MCPServerToolID, [MCPServerToolID]) END,
        [ToolName] = ISNULL(@ToolName, [ToolName]),
        [UserID] = ISNULL(@UserID, [UserID]),
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [DurationMs] = CASE WHEN @DurationMs_Clear = 1 THEN NULL ELSE ISNULL(@DurationMs, [DurationMs]) END,
        [Success] = ISNULL(@Success, [Success]),
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [InputParameters] = CASE WHEN @InputParameters_Clear = 1 THEN NULL ELSE ISNULL(@InputParameters, [InputParameters]) END,
        [OutputContent] = CASE WHEN @OutputContent_Clear = 1 THEN NULL ELSE ISNULL(@OutputContent, [OutputContent]) END,
        [OutputTruncated] = ISNULL(@OutputTruncated, [OutputTruncated])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[MCPToolExecutionLog] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[MCPToolExecutionLog] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPToolExecutionLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MCPToolExecutionLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateMCPToolExecutionLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateMCPToolExecutionLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateMCPToolExecutionLog
ON [${flyway:defaultSchema}].[MCPToolExecutionLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[MCPToolExecutionLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[MCPToolExecutionLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: MCP Tool Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateMCPToolExecutionLog] TO [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Process Run Details
-- Item: spCreateProcessRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ProcessRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateProcessRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateProcessRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateProcessRunDetail]
    @ID uniqueidentifier = NULL,
    @ProcessRunID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @Status nvarchar(20) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @DurationMs_Clear bit = 0,
    @DurationMs int = NULL,
    @AttemptCount int = NULL,
    @ResultPayload_Clear bit = 0,
    @ResultPayload nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ActionExecutionLogID_Clear bit = 0,
    @ActionExecutionLogID uniqueidentifier = NULL,
    @AIAgentRunID_Clear bit = 0,
    @AIAgentRunID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ProcessRunDetail]
            (
                [ID],
                [ProcessRunID],
                [EntityID],
                [RecordID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [DurationMs],
                [AttemptCount],
                [ResultPayload],
                [ErrorMessage],
                [ActionExecutionLogID],
                [AIAgentRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ProcessRunID,
                @EntityID,
                @RecordID,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @DurationMs_Clear = 1 THEN NULL ELSE ISNULL(@DurationMs, NULL) END,
                ISNULL(@AttemptCount, 0),
                CASE WHEN @ResultPayload_Clear = 1 THEN NULL ELSE ISNULL(@ResultPayload, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ActionExecutionLogID_Clear = 1 THEN NULL ELSE ISNULL(@ActionExecutionLogID, NULL) END,
                CASE WHEN @AIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentRunID, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ProcessRunDetail]
            (
                [ProcessRunID],
                [EntityID],
                [RecordID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [DurationMs],
                [AttemptCount],
                [ResultPayload],
                [ErrorMessage],
                [ActionExecutionLogID],
                [AIAgentRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ProcessRunID,
                @EntityID,
                @RecordID,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @DurationMs_Clear = 1 THEN NULL ELSE ISNULL(@DurationMs, NULL) END,
                ISNULL(@AttemptCount, 0),
                CASE WHEN @ResultPayload_Clear = 1 THEN NULL ELSE ISNULL(@ResultPayload, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ActionExecutionLogID_Clear = 1 THEN NULL ELSE ISNULL(@ActionExecutionLogID, NULL) END,
                CASE WHEN @AIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentRunID, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[ProcessRunDetail] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProcessRunDetail] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Process Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateProcessRunDetail] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Process Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Process Run Details
-- Item: spUpdateProcessRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ProcessRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateProcessRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateProcessRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateProcessRunDetail]
    @ID uniqueidentifier,
    @ProcessRunID uniqueidentifier = NULL,
    @EntityID uniqueidentifier = NULL,
    @RecordID nvarchar(450) = NULL,
    @Status nvarchar(20) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @DurationMs_Clear bit = 0,
    @DurationMs int = NULL,
    @AttemptCount int = NULL,
    @ResultPayload_Clear bit = 0,
    @ResultPayload nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ActionExecutionLogID_Clear bit = 0,
    @ActionExecutionLogID uniqueidentifier = NULL,
    @AIAgentRunID_Clear bit = 0,
    @AIAgentRunID uniqueidentifier = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProcessRunDetail]
    SET
        [ProcessRunID] = ISNULL(@ProcessRunID, [ProcessRunID]),
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [RecordID] = ISNULL(@RecordID, [RecordID]),
        [Status] = ISNULL(@Status, [Status]),
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [DurationMs] = CASE WHEN @DurationMs_Clear = 1 THEN NULL ELSE ISNULL(@DurationMs, [DurationMs]) END,
        [AttemptCount] = ISNULL(@AttemptCount, [AttemptCount]),
        [ResultPayload] = CASE WHEN @ResultPayload_Clear = 1 THEN NULL ELSE ISNULL(@ResultPayload, [ResultPayload]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [ActionExecutionLogID] = CASE WHEN @ActionExecutionLogID_Clear = 1 THEN NULL ELSE ISNULL(@ActionExecutionLogID, [ActionExecutionLogID]) END,
        [AIAgentRunID] = CASE WHEN @AIAgentRunID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentRunID, [AIAgentRunID]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[ProcessRunDetail] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[ProcessRunDetail] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProcessRunDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProcessRunDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateProcessRunDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateProcessRunDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateProcessRunDetail
ON [${flyway:defaultSchema}].[ProcessRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ProcessRunDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ProcessRunDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Process Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateProcessRunDetail] TO [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Queue Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queue Tasks
-- Item: spCreateQueueTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR QueueTask
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateQueueTask]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateQueueTask];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateQueueTask]
    @ID uniqueidentifier = NULL,
    @QueueID uniqueidentifier,
    @Status nchar(10) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Data_Clear bit = 0,
    @Data nvarchar(MAX) = NULL,
    @Options_Clear bit = 0,
    @Options nvarchar(MAX) = NULL,
    @Output_Clear bit = 0,
    @Output nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[QueueTask]
            (
                [ID],
                [QueueID],
                [Status],
                [StartedAt],
                [EndedAt],
                [Data],
                [Options],
                [Output],
                [ErrorMessage],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @QueueID,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, NULL) END,
                CASE WHEN @Options_Clear = 1 THEN NULL ELSE ISNULL(@Options, NULL) END,
                CASE WHEN @Output_Clear = 1 THEN NULL ELSE ISNULL(@Output, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[QueueTask]
            (
                [QueueID],
                [Status],
                [StartedAt],
                [EndedAt],
                [Data],
                [Options],
                [Output],
                [ErrorMessage],
                [Comments]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @QueueID,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, NULL) END,
                CASE WHEN @Options_Clear = 1 THEN NULL ELSE ISNULL(@Options, NULL) END,
                CASE WHEN @Output_Clear = 1 THEN NULL ELSE ISNULL(@Output, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[QueueTask] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueueTask] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate Permissions for MJ: Queue Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateQueueTask] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spUpdate SQL for MJ: Queue Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Queue Tasks
-- Item: spUpdateQueueTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR QueueTask
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateQueueTask]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateQueueTask];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateQueueTask]
    @ID uniqueidentifier,
    @QueueID uniqueidentifier = NULL,
    @Status nchar(10) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @Data_Clear bit = 0,
    @Data nvarchar(MAX) = NULL,
    @Options_Clear bit = 0,
    @Options nvarchar(MAX) = NULL,
    @Output_Clear bit = 0,
    @Output nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueueTask]
    SET
        [QueueID] = ISNULL(@QueueID, [QueueID]),
        [Status] = ISNULL(@Status, [Status]),
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [Data] = CASE WHEN @Data_Clear = 1 THEN NULL ELSE ISNULL(@Data, [Data]) END,
        [Options] = CASE WHEN @Options_Clear = 1 THEN NULL ELSE ISNULL(@Options, [Options]) END,
        [Output] = CASE WHEN @Output_Clear = 1 THEN NULL ELSE ISNULL(@Output, [Output]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[QueueTask] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[QueueTask] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueueTask] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueueTask table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateQueueTask]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateQueueTask];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateQueueTask
ON [${flyway:defaultSchema}].[QueueTask]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[QueueTask]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[QueueTask] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Queue Tasks */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateQueueTask] TO [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Record Changes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Changes
-- Item: spCreateRecordChange
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordChange
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRecordChange]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRecordChange];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecordChange]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750),
    @UserID uniqueidentifier,
    @Type nvarchar(20) = NULL,
    @Source nvarchar(20) = NULL,
    @ChangedAt datetimeoffset = NULL,
    @ChangesJSON nvarchar(MAX),
    @ChangesDescription nvarchar(MAX),
    @FullRecordJSON nvarchar(MAX),
    @Status nvarchar(50) = NULL,
    @ErrorLog_Clear bit = 0,
    @ErrorLog nvarchar(MAX) = NULL,
    @ReplayRunID_Clear bit = 0,
    @ReplayRunID uniqueidentifier = NULL,
    @IntegrationID_Clear bit = 0,
    @IntegrationID uniqueidentifier = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @RestoredFromID_Clear bit = 0,
    @RestoredFromID uniqueidentifier = NULL,
    @RestoreReason_Clear bit = 0,
    @RestoreReason nvarchar(MAX) = NULL,
    @ChangeContext_Clear bit = 0,
    @ChangeContext nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RecordChange]
            (
                [ID],
                [EntityID],
                [RecordID],
                [UserID],
                [Type],
                [Source],
                [ChangedAt],
                [ChangesJSON],
                [ChangesDescription],
                [FullRecordJSON],
                [Status],
                [ErrorLog],
                [ReplayRunID],
                [IntegrationID],
                [Comments],
                [RestoredFromID],
                [RestoreReason],
                [ChangeContext]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                @RecordID,
                @UserID,
                ISNULL(@Type, 'Create'),
                ISNULL(@Source, 'Internal'),
                ISNULL(@ChangedAt, getutcdate()),
                @ChangesJSON,
                @ChangesDescription,
                @FullRecordJSON,
                ISNULL(@Status, 'Complete'),
                CASE WHEN @ErrorLog_Clear = 1 THEN NULL ELSE ISNULL(@ErrorLog, NULL) END,
                CASE WHEN @ReplayRunID_Clear = 1 THEN NULL ELSE ISNULL(@ReplayRunID, NULL) END,
                CASE WHEN @IntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@IntegrationID, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @RestoredFromID_Clear = 1 THEN NULL ELSE ISNULL(@RestoredFromID, NULL) END,
                CASE WHEN @RestoreReason_Clear = 1 THEN NULL ELSE ISNULL(@RestoreReason, NULL) END,
                CASE WHEN @ChangeContext_Clear = 1 THEN NULL ELSE ISNULL(@ChangeContext, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RecordChange]
            (
                [EntityID],
                [RecordID],
                [UserID],
                [Type],
                [Source],
                [ChangedAt],
                [ChangesJSON],
                [ChangesDescription],
                [FullRecordJSON],
                [Status],
                [ErrorLog],
                [ReplayRunID],
                [IntegrationID],
                [Comments],
                [RestoredFromID],
                [RestoreReason],
                [ChangeContext]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                @RecordID,
                @UserID,
                ISNULL(@Type, 'Create'),
                ISNULL(@Source, 'Internal'),
                ISNULL(@ChangedAt, getutcdate()),
                @ChangesJSON,
                @ChangesDescription,
                @FullRecordJSON,
                ISNULL(@Status, 'Complete'),
                CASE WHEN @ErrorLog_Clear = 1 THEN NULL ELSE ISNULL(@ErrorLog, NULL) END,
                CASE WHEN @ReplayRunID_Clear = 1 THEN NULL ELSE ISNULL(@ReplayRunID, NULL) END,
                CASE WHEN @IntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@IntegrationID, NULL) END,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                CASE WHEN @RestoredFromID_Clear = 1 THEN NULL ELSE ISNULL(@RestoredFromID, NULL) END,
                CASE WHEN @RestoreReason_Clear = 1 THEN NULL ELSE ISNULL(@RestoreReason, NULL) END,
                CASE WHEN @ChangeContext_Clear = 1 THEN NULL ELSE ISNULL(@ChangeContext, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID] FROM [${flyway:defaultSchema}].[RecordChange] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChange] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate Permissions for MJ: Record Changes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChange] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spUpdate SQL for MJ: Record Changes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Changes
-- Item: spUpdateRecordChange
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecordChange
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRecordChange]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordChange];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordChange]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier = NULL,
    @RecordID nvarchar(750) = NULL,
    @UserID uniqueidentifier = NULL,
    @Type nvarchar(20) = NULL,
    @Source nvarchar(20) = NULL,
    @ChangedAt datetimeoffset = NULL,
    @ChangesJSON nvarchar(MAX) = NULL,
    @ChangesDescription nvarchar(MAX) = NULL,
    @FullRecordJSON nvarchar(MAX) = NULL,
    @Status nvarchar(50) = NULL,
    @ErrorLog_Clear bit = 0,
    @ErrorLog nvarchar(MAX) = NULL,
    @ReplayRunID_Clear bit = 0,
    @ReplayRunID uniqueidentifier = NULL,
    @IntegrationID_Clear bit = 0,
    @IntegrationID uniqueidentifier = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @RestoredFromID_Clear bit = 0,
    @RestoredFromID uniqueidentifier = NULL,
    @RestoreReason_Clear bit = 0,
    @RestoreReason nvarchar(MAX) = NULL,
    @ChangeContext_Clear bit = 0,
    @ChangeContext nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordChange]
    SET
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [RecordID] = ISNULL(@RecordID, [RecordID]),
        [UserID] = ISNULL(@UserID, [UserID]),
        [Type] = ISNULL(@Type, [Type]),
        [Source] = ISNULL(@Source, [Source]),
        [ChangedAt] = ISNULL(@ChangedAt, [ChangedAt]),
        [ChangesJSON] = ISNULL(@ChangesJSON, [ChangesJSON]),
        [ChangesDescription] = ISNULL(@ChangesDescription, [ChangesDescription]),
        [FullRecordJSON] = ISNULL(@FullRecordJSON, [FullRecordJSON]),
        [Status] = ISNULL(@Status, [Status]),
        [ErrorLog] = CASE WHEN @ErrorLog_Clear = 1 THEN NULL ELSE ISNULL(@ErrorLog, [ErrorLog]) END,
        [ReplayRunID] = CASE WHEN @ReplayRunID_Clear = 1 THEN NULL ELSE ISNULL(@ReplayRunID, [ReplayRunID]) END,
        [IntegrationID] = CASE WHEN @IntegrationID_Clear = 1 THEN NULL ELSE ISNULL(@IntegrationID, [IntegrationID]) END,
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [RestoredFromID] = CASE WHEN @RestoredFromID_Clear = 1 THEN NULL ELSE ISNULL(@RestoredFromID, [RestoredFromID]) END,
        [RestoreReason] = CASE WHEN @RestoreReason_Clear = 1 THEN NULL ELSE ISNULL(@RestoreReason, [RestoreReason]) END,
        [ChangeContext] = CASE WHEN @ChangeContext_Clear = 1 THEN NULL ELSE ISNULL(@ChangeContext, [ChangeContext]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID] FROM [${flyway:defaultSchema}].[RecordChange] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID] FROM [${flyway:defaultSchema}].[RecordChange] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordChange] TO [cdp_Developer]
GO

/* spUpdate Permissions for MJ: Record Changes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordChange] TO [cdp_Developer];

/* spCreate SQL for MJ: Record Clone Log Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Clone Log Items
-- Item: spCreateRecordCloneLogItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordCloneLogItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRecordCloneLogItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRecordCloneLogItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecordCloneLogItem]
    @ID uniqueidentifier = NULL,
    @RecordCloneLogID uniqueidentifier,
    @EntityID uniqueidentifier,
    @SourceRecordID nvarchar(750),
    @TargetRecordID_Clear bit = 0,
    @TargetRecordID nvarchar(750) = NULL,
    @Depth int = NULL,
    @Route nvarchar(20),
    @Status nvarchar(20),
    @Sequence int = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(MAX) = NULL,
    @FieldChangesJSON_Clear bit = 0,
    @FieldChangesJSON nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RecordCloneLogItem]
            (
                [ID],
                [RecordCloneLogID],
                [EntityID],
                [SourceRecordID],
                [TargetRecordID],
                [Depth],
                [Route],
                [Status],
                [Sequence],
                [Reason],
                [FieldChangesJSON]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RecordCloneLogID,
                @EntityID,
                @SourceRecordID,
                CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, NULL) END,
                ISNULL(@Depth, 0),
                @Route,
                @Status,
                ISNULL(@Sequence, 0),
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                CASE WHEN @FieldChangesJSON_Clear = 1 THEN NULL ELSE ISNULL(@FieldChangesJSON, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RecordCloneLogItem]
            (
                [RecordCloneLogID],
                [EntityID],
                [SourceRecordID],
                [TargetRecordID],
                [Depth],
                [Route],
                [Status],
                [Sequence],
                [Reason],
                [FieldChangesJSON]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RecordCloneLogID,
                @EntityID,
                @SourceRecordID,
                CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, NULL) END,
                ISNULL(@Depth, 0),
                @Route,
                @Status,
                ISNULL(@Sequence, 0),
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                CASE WHEN @FieldChangesJSON_Clear = 1 THEN NULL ELSE ISNULL(@FieldChangesJSON, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[RecordCloneLogItem] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordCloneLogItem] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Record Clone Log Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordCloneLogItem] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Record Clone Log Items */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Clone Log Items
-- Item: spUpdateRecordCloneLogItem
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecordCloneLogItem
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRecordCloneLogItem]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordCloneLogItem];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordCloneLogItem]
    @ID uniqueidentifier,
    @RecordCloneLogID uniqueidentifier = NULL,
    @EntityID uniqueidentifier = NULL,
    @SourceRecordID nvarchar(750) = NULL,
    @TargetRecordID_Clear bit = 0,
    @TargetRecordID nvarchar(750) = NULL,
    @Depth int = NULL,
    @Route nvarchar(20) = NULL,
    @Status nvarchar(20) = NULL,
    @Sequence int = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(MAX) = NULL,
    @FieldChangesJSON_Clear bit = 0,
    @FieldChangesJSON nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordCloneLogItem]
    SET
        [RecordCloneLogID] = ISNULL(@RecordCloneLogID, [RecordCloneLogID]),
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [SourceRecordID] = ISNULL(@SourceRecordID, [SourceRecordID]),
        [TargetRecordID] = CASE WHEN @TargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@TargetRecordID, [TargetRecordID]) END,
        [Depth] = ISNULL(@Depth, [Depth]),
        [Route] = ISNULL(@Route, [Route]),
        [Status] = ISNULL(@Status, [Status]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [Reason] = CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, [Reason]) END,
        [FieldChangesJSON] = CASE WHEN @FieldChangesJSON_Clear = 1 THEN NULL ELSE ISNULL(@FieldChangesJSON, [FieldChangesJSON]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[RecordCloneLogItem] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[RecordCloneLogItem] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordCloneLogItem] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordCloneLogItem table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRecordCloneLogItem]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRecordCloneLogItem];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRecordCloneLogItem
ON [${flyway:defaultSchema}].[RecordCloneLogItem]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordCloneLogItem]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RecordCloneLogItem] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Record Clone Log Items */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordCloneLogItem] TO [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Record Clone Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Clone Logs
-- Item: spCreateRecordCloneLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RecordCloneLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRecordCloneLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRecordCloneLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRecordCloneLog]
    @ID uniqueidentifier = NULL,
    @RootEntityID uniqueidentifier,
    @RootSourceRecordID nvarchar(750),
    @RootTargetRecordID_Clear bit = 0,
    @RootTargetRecordID nvarchar(750) = NULL,
    @InitiatedByUserID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @PlanHash nvarchar(64),
    @PlanJSON nvarchar(MAX),
    @OptionsJSON_Clear bit = 0,
    @OptionsJSON nvarchar(MAX) = NULL,
    @ResultJSON_Clear bit = 0,
    @ResultJSON nvarchar(MAX) = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ProcessRunID_Clear bit = 0,
    @ProcessRunID uniqueidentifier = NULL,
    @CreatedCount int = NULL,
    @ReferencedCount int = NULL,
    @SkippedCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RecordCloneLog]
            (
                [ID],
                [RootEntityID],
                [RootSourceRecordID],
                [RootTargetRecordID],
                [InitiatedByUserID],
                [Status],
                [StartedAt],
                [EndedAt],
                [PlanHash],
                [PlanJSON],
                [OptionsJSON],
                [ResultJSON],
                [Reason],
                [ErrorMessage],
                [ProcessRunID],
                [CreatedCount],
                [ReferencedCount],
                [SkippedCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @RootEntityID,
                @RootSourceRecordID,
                CASE WHEN @RootTargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@RootTargetRecordID, NULL) END,
                @InitiatedByUserID,
                ISNULL(@Status, 'Planned'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                @PlanHash,
                @PlanJSON,
                CASE WHEN @OptionsJSON_Clear = 1 THEN NULL ELSE ISNULL(@OptionsJSON, NULL) END,
                CASE WHEN @ResultJSON_Clear = 1 THEN NULL ELSE ISNULL(@ResultJSON, NULL) END,
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ProcessRunID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunID, NULL) END,
                ISNULL(@CreatedCount, 0),
                ISNULL(@ReferencedCount, 0),
                ISNULL(@SkippedCount, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RecordCloneLog]
            (
                [RootEntityID],
                [RootSourceRecordID],
                [RootTargetRecordID],
                [InitiatedByUserID],
                [Status],
                [StartedAt],
                [EndedAt],
                [PlanHash],
                [PlanJSON],
                [OptionsJSON],
                [ResultJSON],
                [Reason],
                [ErrorMessage],
                [ProcessRunID],
                [CreatedCount],
                [ReferencedCount],
                [SkippedCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @RootEntityID,
                @RootSourceRecordID,
                CASE WHEN @RootTargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@RootTargetRecordID, NULL) END,
                @InitiatedByUserID,
                ISNULL(@Status, 'Planned'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                @PlanHash,
                @PlanJSON,
                CASE WHEN @OptionsJSON_Clear = 1 THEN NULL ELSE ISNULL(@OptionsJSON, NULL) END,
                CASE WHEN @ResultJSON_Clear = 1 THEN NULL ELSE ISNULL(@ResultJSON, NULL) END,
                CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ProcessRunID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunID, NULL) END,
                ISNULL(@CreatedCount, 0),
                ISNULL(@ReferencedCount, 0),
                ISNULL(@SkippedCount, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[RecordCloneLog] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordCloneLog] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Record Clone Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordCloneLog] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Record Clone Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Clone Logs
-- Item: spUpdateRecordCloneLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RecordCloneLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRecordCloneLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordCloneLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRecordCloneLog]
    @ID uniqueidentifier,
    @RootEntityID uniqueidentifier = NULL,
    @RootSourceRecordID nvarchar(750) = NULL,
    @RootTargetRecordID_Clear bit = 0,
    @RootTargetRecordID nvarchar(750) = NULL,
    @InitiatedByUserID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @PlanHash nvarchar(64) = NULL,
    @PlanJSON nvarchar(MAX) = NULL,
    @OptionsJSON_Clear bit = 0,
    @OptionsJSON nvarchar(MAX) = NULL,
    @ResultJSON_Clear bit = 0,
    @ResultJSON nvarchar(MAX) = NULL,
    @Reason_Clear bit = 0,
    @Reason nvarchar(MAX) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ProcessRunID_Clear bit = 0,
    @ProcessRunID uniqueidentifier = NULL,
    @CreatedCount int = NULL,
    @ReferencedCount int = NULL,
    @SkippedCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordCloneLog]
    SET
        [RootEntityID] = ISNULL(@RootEntityID, [RootEntityID]),
        [RootSourceRecordID] = ISNULL(@RootSourceRecordID, [RootSourceRecordID]),
        [RootTargetRecordID] = CASE WHEN @RootTargetRecordID_Clear = 1 THEN NULL ELSE ISNULL(@RootTargetRecordID, [RootTargetRecordID]) END,
        [InitiatedByUserID] = ISNULL(@InitiatedByUserID, [InitiatedByUserID]),
        [Status] = ISNULL(@Status, [Status]),
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [PlanHash] = ISNULL(@PlanHash, [PlanHash]),
        [PlanJSON] = ISNULL(@PlanJSON, [PlanJSON]),
        [OptionsJSON] = CASE WHEN @OptionsJSON_Clear = 1 THEN NULL ELSE ISNULL(@OptionsJSON, [OptionsJSON]) END,
        [ResultJSON] = CASE WHEN @ResultJSON_Clear = 1 THEN NULL ELSE ISNULL(@ResultJSON, [ResultJSON]) END,
        [Reason] = CASE WHEN @Reason_Clear = 1 THEN NULL ELSE ISNULL(@Reason, [Reason]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [ProcessRunID] = CASE WHEN @ProcessRunID_Clear = 1 THEN NULL ELSE ISNULL(@ProcessRunID, [ProcessRunID]) END,
        [CreatedCount] = ISNULL(@CreatedCount, [CreatedCount]),
        [ReferencedCount] = ISNULL(@ReferencedCount, [ReferencedCount]),
        [SkippedCount] = ISNULL(@SkippedCount, [SkippedCount])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[RecordCloneLog] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[RecordCloneLog] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordCloneLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordCloneLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRecordCloneLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRecordCloneLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRecordCloneLog
ON [${flyway:defaultSchema}].[RecordCloneLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordCloneLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RecordCloneLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Record Clone Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordCloneLog] TO [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Scheduled Job Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Job Runs
-- Item: spCreateScheduledJobRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ScheduledJobRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateScheduledJobRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledJobRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledJobRun]
    @ID uniqueidentifier = NULL,
    @ScheduledJobID uniqueidentifier,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @Status nvarchar(20) = NULL,
    @Success_Clear bit = 0,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @Details_Clear bit = 0,
    @Details nvarchar(MAX) = NULL,
    @ExecutedByUserID_Clear bit = 0,
    @ExecutedByUserID uniqueidentifier = NULL,
    @QueuedAt_Clear bit = 0,
    @QueuedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ScheduledJobRun]
            (
                [ID],
                [ScheduledJobID],
                [StartedAt],
                [CompletedAt],
                [Status],
                [Success],
                [ErrorMessage],
                [Details],
                [ExecutedByUserID],
                [QueuedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ScheduledJobID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                ISNULL(@Status, 'Running'),
                CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @Details_Clear = 1 THEN NULL ELSE ISNULL(@Details, NULL) END,
                CASE WHEN @ExecutedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ExecutedByUserID, NULL) END,
                CASE WHEN @QueuedAt_Clear = 1 THEN NULL ELSE ISNULL(@QueuedAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ScheduledJobRun]
            (
                [ScheduledJobID],
                [StartedAt],
                [CompletedAt],
                [Status],
                [Success],
                [ErrorMessage],
                [Details],
                [ExecutedByUserID],
                [QueuedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ScheduledJobID,
                ISNULL(@StartedAt, sysdatetimeoffset()),
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                ISNULL(@Status, 'Running'),
                CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @Details_Clear = 1 THEN NULL ELSE ISNULL(@Details, NULL) END,
                CASE WHEN @ExecutedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ExecutedByUserID, NULL) END,
                CASE WHEN @QueuedAt_Clear = 1 THEN NULL ELSE ISNULL(@QueuedAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[ScheduledJobRun] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScheduledJobRun] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Scheduled Job Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScheduledJobRun] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Scheduled Job Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Job Runs
-- Item: spUpdateScheduledJobRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ScheduledJobRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateScheduledJobRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateScheduledJobRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateScheduledJobRun]
    @ID uniqueidentifier,
    @ScheduledJobID uniqueidentifier = NULL,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @Status nvarchar(20) = NULL,
    @Success_Clear bit = 0,
    @Success bit = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @Details_Clear bit = 0,
    @Details nvarchar(MAX) = NULL,
    @ExecutedByUserID_Clear bit = 0,
    @ExecutedByUserID uniqueidentifier = NULL,
    @QueuedAt_Clear bit = 0,
    @QueuedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScheduledJobRun]
    SET
        [ScheduledJobID] = ISNULL(@ScheduledJobID, [ScheduledJobID]),
        [StartedAt] = ISNULL(@StartedAt, [StartedAt]),
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [Status] = ISNULL(@Status, [Status]),
        [Success] = CASE WHEN @Success_Clear = 1 THEN NULL ELSE ISNULL(@Success, [Success]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [Details] = CASE WHEN @Details_Clear = 1 THEN NULL ELSE ISNULL(@Details, [Details]) END,
        [ExecutedByUserID] = CASE WHEN @ExecutedByUserID_Clear = 1 THEN NULL ELSE ISNULL(@ExecutedByUserID, [ExecutedByUserID]) END,
        [QueuedAt] = CASE WHEN @QueuedAt_Clear = 1 THEN NULL ELSE ISNULL(@QueuedAt, [QueuedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[ScheduledJobRun] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[ScheduledJobRun] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledJobRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ScheduledJobRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateScheduledJobRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateScheduledJobRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateScheduledJobRun
ON [${flyway:defaultSchema}].[ScheduledJobRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScheduledJobRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ScheduledJobRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Scheduled Job Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledJobRun] TO [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Search Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Execution Logs
-- Item: spCreateSearchExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR SearchExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateSearchExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateSearchExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateSearchExecutionLog]
    @ID uniqueidentifier = NULL,
    @SearchScopeID_Clear bit = 0,
    @SearchScopeID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @AIAgentID_Clear bit = 0,
    @AIAgentID uniqueidentifier = NULL,
    @Query nvarchar(MAX),
    @TotalDurationMs int,
    @ResultCount int = NULL,
    @RerankerName_Clear bit = 0,
    @RerankerName nvarchar(100) = NULL,
    @RerankerCostCents_Clear bit = 0,
    @RerankerCostCents decimal(10, 4) = NULL,
    @Status nvarchar(20),
    @FailureReason_Clear bit = 0,
    @FailureReason nvarchar(500) = NULL,
    @ProvidersJSON_Clear bit = 0,
    @ProvidersJSON nvarchar(MAX) = NULL,
    @AISkillID_Clear bit = 0,
    @AISkillID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID uniqueidentifier = NULL,
    @ScopeDecisionJSON_Clear bit = 0,
    @ScopeDecisionJSON nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[SearchExecutionLog]
            (
                [ID],
                [SearchScopeID],
                [UserID],
                [AIAgentID],
                [Query],
                [TotalDurationMs],
                [ResultCount],
                [RerankerName],
                [RerankerCostCents],
                [Status],
                [FailureReason],
                [ProvidersJSON],
                [AISkillID],
                [PrimaryScopeRecordID],
                [ScopeDecisionJSON]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                CASE WHEN @SearchScopeID_Clear = 1 THEN NULL ELSE ISNULL(@SearchScopeID, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @AIAgentID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentID, NULL) END,
                @Query,
                @TotalDurationMs,
                ISNULL(@ResultCount, 0),
                CASE WHEN @RerankerName_Clear = 1 THEN NULL ELSE ISNULL(@RerankerName, NULL) END,
                CASE WHEN @RerankerCostCents_Clear = 1 THEN NULL ELSE ISNULL(@RerankerCostCents, NULL) END,
                @Status,
                CASE WHEN @FailureReason_Clear = 1 THEN NULL ELSE ISNULL(@FailureReason, NULL) END,
                CASE WHEN @ProvidersJSON_Clear = 1 THEN NULL ELSE ISNULL(@ProvidersJSON, NULL) END,
                CASE WHEN @AISkillID_Clear = 1 THEN NULL ELSE ISNULL(@AISkillID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @ScopeDecisionJSON_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDecisionJSON, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[SearchExecutionLog]
            (
                [SearchScopeID],
                [UserID],
                [AIAgentID],
                [Query],
                [TotalDurationMs],
                [ResultCount],
                [RerankerName],
                [RerankerCostCents],
                [Status],
                [FailureReason],
                [ProvidersJSON],
                [AISkillID],
                [PrimaryScopeRecordID],
                [ScopeDecisionJSON]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                CASE WHEN @SearchScopeID_Clear = 1 THEN NULL ELSE ISNULL(@SearchScopeID, NULL) END,
                CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, NULL) END,
                CASE WHEN @AIAgentID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentID, NULL) END,
                @Query,
                @TotalDurationMs,
                ISNULL(@ResultCount, 0),
                CASE WHEN @RerankerName_Clear = 1 THEN NULL ELSE ISNULL(@RerankerName, NULL) END,
                CASE WHEN @RerankerCostCents_Clear = 1 THEN NULL ELSE ISNULL(@RerankerCostCents, NULL) END,
                @Status,
                CASE WHEN @FailureReason_Clear = 1 THEN NULL ELSE ISNULL(@FailureReason, NULL) END,
                CASE WHEN @ProvidersJSON_Clear = 1 THEN NULL ELSE ISNULL(@ProvidersJSON, NULL) END,
                CASE WHEN @AISkillID_Clear = 1 THEN NULL ELSE ISNULL(@AISkillID, NULL) END,
                CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, NULL) END,
                CASE WHEN @ScopeDecisionJSON_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDecisionJSON, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[SearchExecutionLog] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchExecutionLog] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Search Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateSearchExecutionLog] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Search Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Search Execution Logs
-- Item: spUpdateSearchExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR SearchExecutionLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateSearchExecutionLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchExecutionLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateSearchExecutionLog]
    @ID uniqueidentifier,
    @SearchScopeID_Clear bit = 0,
    @SearchScopeID uniqueidentifier = NULL,
    @UserID_Clear bit = 0,
    @UserID uniqueidentifier = NULL,
    @AIAgentID_Clear bit = 0,
    @AIAgentID uniqueidentifier = NULL,
    @Query nvarchar(MAX) = NULL,
    @TotalDurationMs int = NULL,
    @ResultCount int = NULL,
    @RerankerName_Clear bit = 0,
    @RerankerName nvarchar(100) = NULL,
    @RerankerCostCents_Clear bit = 0,
    @RerankerCostCents decimal(10, 4) = NULL,
    @Status nvarchar(20) = NULL,
    @FailureReason_Clear bit = 0,
    @FailureReason nvarchar(500) = NULL,
    @ProvidersJSON_Clear bit = 0,
    @ProvidersJSON nvarchar(MAX) = NULL,
    @AISkillID_Clear bit = 0,
    @AISkillID uniqueidentifier = NULL,
    @PrimaryScopeRecordID_Clear bit = 0,
    @PrimaryScopeRecordID uniqueidentifier = NULL,
    @ScopeDecisionJSON_Clear bit = 0,
    @ScopeDecisionJSON nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchExecutionLog]
    SET
        [SearchScopeID] = CASE WHEN @SearchScopeID_Clear = 1 THEN NULL ELSE ISNULL(@SearchScopeID, [SearchScopeID]) END,
        [UserID] = CASE WHEN @UserID_Clear = 1 THEN NULL ELSE ISNULL(@UserID, [UserID]) END,
        [AIAgentID] = CASE WHEN @AIAgentID_Clear = 1 THEN NULL ELSE ISNULL(@AIAgentID, [AIAgentID]) END,
        [Query] = ISNULL(@Query, [Query]),
        [TotalDurationMs] = ISNULL(@TotalDurationMs, [TotalDurationMs]),
        [ResultCount] = ISNULL(@ResultCount, [ResultCount]),
        [RerankerName] = CASE WHEN @RerankerName_Clear = 1 THEN NULL ELSE ISNULL(@RerankerName, [RerankerName]) END,
        [RerankerCostCents] = CASE WHEN @RerankerCostCents_Clear = 1 THEN NULL ELSE ISNULL(@RerankerCostCents, [RerankerCostCents]) END,
        [Status] = ISNULL(@Status, [Status]),
        [FailureReason] = CASE WHEN @FailureReason_Clear = 1 THEN NULL ELSE ISNULL(@FailureReason, [FailureReason]) END,
        [ProvidersJSON] = CASE WHEN @ProvidersJSON_Clear = 1 THEN NULL ELSE ISNULL(@ProvidersJSON, [ProvidersJSON]) END,
        [AISkillID] = CASE WHEN @AISkillID_Clear = 1 THEN NULL ELSE ISNULL(@AISkillID, [AISkillID]) END,
        [PrimaryScopeRecordID] = CASE WHEN @PrimaryScopeRecordID_Clear = 1 THEN NULL ELSE ISNULL(@PrimaryScopeRecordID, [PrimaryScopeRecordID]) END,
        [ScopeDecisionJSON] = CASE WHEN @ScopeDecisionJSON_Clear = 1 THEN NULL ELSE ISNULL(@ScopeDecisionJSON, [ScopeDecisionJSON]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[SearchExecutionLog] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[SearchExecutionLog] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchExecutionLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SearchExecutionLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateSearchExecutionLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateSearchExecutionLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateSearchExecutionLog
ON [${flyway:defaultSchema}].[SearchExecutionLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[SearchExecutionLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[SearchExecutionLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Search Execution Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateSearchExecutionLog] TO [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Test Run Outputs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Outputs
-- Item: spCreateTestRunOutput
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TestRunOutput
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTestRunOutput]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTestRunOutput];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTestRunOutput]
    @ID uniqueidentifier = NULL,
    @TestRunID uniqueidentifier,
    @OutputTypeID uniqueidentifier,
    @Sequence int = NULL,
    @StepNumber_Clear bit = 0,
    @StepNumber int = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @MimeType_Clear bit = 0,
    @MimeType nvarchar(100) = NULL,
    @InlineData_Clear bit = 0,
    @InlineData nvarchar(MAX) = NULL,
    @FileSizeBytes_Clear bit = 0,
    @FileSizeBytes int = NULL,
    @Width_Clear bit = 0,
    @Width int = NULL,
    @Height_Clear bit = 0,
    @Height int = NULL,
    @DurationSeconds_Clear bit = 0,
    @DurationSeconds decimal(10, 3) = NULL,
    @Metadata_Clear bit = 0,
    @Metadata nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TestRunOutput]
            (
                [ID],
                [TestRunID],
                [OutputTypeID],
                [Sequence],
                [StepNumber],
                [Name],
                [Description],
                [MimeType],
                [InlineData],
                [FileSizeBytes],
                [Width],
                [Height],
                [DurationSeconds],
                [Metadata]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TestRunID,
                @OutputTypeID,
                ISNULL(@Sequence, 0),
                CASE WHEN @StepNumber_Clear = 1 THEN NULL ELSE ISNULL(@StepNumber, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @MimeType_Clear = 1 THEN NULL ELSE ISNULL(@MimeType, NULL) END,
                CASE WHEN @InlineData_Clear = 1 THEN NULL ELSE ISNULL(@InlineData, NULL) END,
                CASE WHEN @FileSizeBytes_Clear = 1 THEN NULL ELSE ISNULL(@FileSizeBytes, NULL) END,
                CASE WHEN @Width_Clear = 1 THEN NULL ELSE ISNULL(@Width, NULL) END,
                CASE WHEN @Height_Clear = 1 THEN NULL ELSE ISNULL(@Height, NULL) END,
                CASE WHEN @DurationSeconds_Clear = 1 THEN NULL ELSE ISNULL(@DurationSeconds, NULL) END,
                CASE WHEN @Metadata_Clear = 1 THEN NULL ELSE ISNULL(@Metadata, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TestRunOutput]
            (
                [TestRunID],
                [OutputTypeID],
                [Sequence],
                [StepNumber],
                [Name],
                [Description],
                [MimeType],
                [InlineData],
                [FileSizeBytes],
                [Width],
                [Height],
                [DurationSeconds],
                [Metadata]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TestRunID,
                @OutputTypeID,
                ISNULL(@Sequence, 0),
                CASE WHEN @StepNumber_Clear = 1 THEN NULL ELSE ISNULL(@StepNumber, NULL) END,
                CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, NULL) END,
                CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, NULL) END,
                CASE WHEN @MimeType_Clear = 1 THEN NULL ELSE ISNULL(@MimeType, NULL) END,
                CASE WHEN @InlineData_Clear = 1 THEN NULL ELSE ISNULL(@InlineData, NULL) END,
                CASE WHEN @FileSizeBytes_Clear = 1 THEN NULL ELSE ISNULL(@FileSizeBytes, NULL) END,
                CASE WHEN @Width_Clear = 1 THEN NULL ELSE ISNULL(@Width, NULL) END,
                CASE WHEN @Height_Clear = 1 THEN NULL ELSE ISNULL(@Height, NULL) END,
                CASE WHEN @DurationSeconds_Clear = 1 THEN NULL ELSE ISNULL(@DurationSeconds, NULL) END,
                CASE WHEN @Metadata_Clear = 1 THEN NULL ELSE ISNULL(@Metadata, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[TestRunOutput] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRunOutput] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Test Run Outputs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRunOutput] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Test Run Outputs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Run Outputs
-- Item: spUpdateTestRunOutput
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TestRunOutput
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTestRunOutput]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRunOutput];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRunOutput]
    @ID uniqueidentifier,
    @TestRunID uniqueidentifier = NULL,
    @OutputTypeID uniqueidentifier = NULL,
    @Sequence int = NULL,
    @StepNumber_Clear bit = 0,
    @StepNumber int = NULL,
    @Name_Clear bit = 0,
    @Name nvarchar(255) = NULL,
    @Description_Clear bit = 0,
    @Description nvarchar(MAX) = NULL,
    @MimeType_Clear bit = 0,
    @MimeType nvarchar(100) = NULL,
    @InlineData_Clear bit = 0,
    @InlineData nvarchar(MAX) = NULL,
    @FileSizeBytes_Clear bit = 0,
    @FileSizeBytes int = NULL,
    @Width_Clear bit = 0,
    @Width int = NULL,
    @Height_Clear bit = 0,
    @Height int = NULL,
    @DurationSeconds_Clear bit = 0,
    @DurationSeconds decimal(10, 3) = NULL,
    @Metadata_Clear bit = 0,
    @Metadata nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRunOutput]
    SET
        [TestRunID] = ISNULL(@TestRunID, [TestRunID]),
        [OutputTypeID] = ISNULL(@OutputTypeID, [OutputTypeID]),
        [Sequence] = ISNULL(@Sequence, [Sequence]),
        [StepNumber] = CASE WHEN @StepNumber_Clear = 1 THEN NULL ELSE ISNULL(@StepNumber, [StepNumber]) END,
        [Name] = CASE WHEN @Name_Clear = 1 THEN NULL ELSE ISNULL(@Name, [Name]) END,
        [Description] = CASE WHEN @Description_Clear = 1 THEN NULL ELSE ISNULL(@Description, [Description]) END,
        [MimeType] = CASE WHEN @MimeType_Clear = 1 THEN NULL ELSE ISNULL(@MimeType, [MimeType]) END,
        [InlineData] = CASE WHEN @InlineData_Clear = 1 THEN NULL ELSE ISNULL(@InlineData, [InlineData]) END,
        [FileSizeBytes] = CASE WHEN @FileSizeBytes_Clear = 1 THEN NULL ELSE ISNULL(@FileSizeBytes, [FileSizeBytes]) END,
        [Width] = CASE WHEN @Width_Clear = 1 THEN NULL ELSE ISNULL(@Width, [Width]) END,
        [Height] = CASE WHEN @Height_Clear = 1 THEN NULL ELSE ISNULL(@Height, [Height]) END,
        [DurationSeconds] = CASE WHEN @DurationSeconds_Clear = 1 THEN NULL ELSE ISNULL(@DurationSeconds, [DurationSeconds]) END,
        [Metadata] = CASE WHEN @Metadata_Clear = 1 THEN NULL ELSE ISNULL(@Metadata, [Metadata]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[TestRunOutput] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[TestRunOutput] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRunOutput] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestRunOutput table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTestRunOutput]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTestRunOutput];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTestRunOutput
ON [${flyway:defaultSchema}].[TestRunOutput]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRunOutput]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TestRunOutput] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Test Run Outputs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRunOutput] TO [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: spCreateTestRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TestRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateTestRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateTestRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateTestRun]
    @ID uniqueidentifier = NULL,
    @TestID uniqueidentifier,
    @TestSuiteRunID_Clear bit = 0,
    @TestSuiteRunID uniqueidentifier = NULL,
    @RunByUserID uniqueidentifier,
    @Sequence_Clear bit = 0,
    @Sequence int = NULL,
    @TargetType_Clear bit = 0,
    @TargetType nvarchar(100) = NULL,
    @TargetLogID_Clear bit = 0,
    @TargetLogID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @DurationSeconds_Clear bit = 0,
    @DurationSeconds decimal(10, 3) = NULL,
    @InputData_Clear bit = 0,
    @InputData nvarchar(MAX) = NULL,
    @ExpectedOutputData_Clear bit = 0,
    @ExpectedOutputData nvarchar(MAX) = NULL,
    @ActualOutputData_Clear bit = 0,
    @ActualOutputData nvarchar(MAX) = NULL,
    @PassedChecks_Clear bit = 0,
    @PassedChecks int = NULL,
    @FailedChecks_Clear bit = 0,
    @FailedChecks int = NULL,
    @TotalChecks_Clear bit = 0,
    @TotalChecks int = NULL,
    @Score_Clear bit = 0,
    @Score decimal(5, 4) = NULL,
    @CostUSD_Clear bit = 0,
    @CostUSD decimal(10, 6) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ResultDetails_Clear bit = 0,
    @ResultDetails nvarchar(MAX) = NULL,
    @Log_Clear bit = 0,
    @Log nvarchar(MAX) = NULL,
    @Tags_Clear bit = 0,
    @Tags nvarchar(MAX) = NULL,
    @MachineName_Clear bit = 0,
    @MachineName nvarchar(255) = NULL,
    @MachineID_Clear bit = 0,
    @MachineID nvarchar(255) = NULL,
    @RunByUserName_Clear bit = 0,
    @RunByUserName nvarchar(255) = NULL,
    @RunByUserEmail_Clear bit = 0,
    @RunByUserEmail nvarchar(255) = NULL,
    @RunContextDetails_Clear bit = 0,
    @RunContextDetails nvarchar(MAX) = NULL,
    @TargetLogEntityID_Clear bit = 0,
    @TargetLogEntityID uniqueidentifier = NULL,
    @ResolvedVariables_Clear bit = 0,
    @ResolvedVariables nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[TestRun]
            (
                [ID],
                [TestID],
                [TestSuiteRunID],
                [RunByUserID],
                [Sequence],
                [TargetType],
                [TargetLogID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [DurationSeconds],
                [InputData],
                [ExpectedOutputData],
                [ActualOutputData],
                [PassedChecks],
                [FailedChecks],
                [TotalChecks],
                [Score],
                [CostUSD],
                [ErrorMessage],
                [ResultDetails],
                [Log],
                [Tags],
                [MachineName],
                [MachineID],
                [RunByUserName],
                [RunByUserEmail],
                [RunContextDetails],
                [TargetLogEntityID],
                [ResolvedVariables]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @TestID,
                CASE WHEN @TestSuiteRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestSuiteRunID, NULL) END,
                @RunByUserID,
                CASE WHEN @Sequence_Clear = 1 THEN NULL ELSE ISNULL(@Sequence, NULL) END,
                CASE WHEN @TargetType_Clear = 1 THEN NULL ELSE ISNULL(@TargetType, NULL) END,
                CASE WHEN @TargetLogID_Clear = 1 THEN NULL ELSE ISNULL(@TargetLogID, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @DurationSeconds_Clear = 1 THEN NULL ELSE ISNULL(@DurationSeconds, NULL) END,
                CASE WHEN @InputData_Clear = 1 THEN NULL ELSE ISNULL(@InputData, NULL) END,
                CASE WHEN @ExpectedOutputData_Clear = 1 THEN NULL ELSE ISNULL(@ExpectedOutputData, NULL) END,
                CASE WHEN @ActualOutputData_Clear = 1 THEN NULL ELSE ISNULL(@ActualOutputData, NULL) END,
                CASE WHEN @PassedChecks_Clear = 1 THEN NULL ELSE ISNULL(@PassedChecks, NULL) END,
                CASE WHEN @FailedChecks_Clear = 1 THEN NULL ELSE ISNULL(@FailedChecks, NULL) END,
                CASE WHEN @TotalChecks_Clear = 1 THEN NULL ELSE ISNULL(@TotalChecks, NULL) END,
                CASE WHEN @Score_Clear = 1 THEN NULL ELSE ISNULL(@Score, NULL) END,
                CASE WHEN @CostUSD_Clear = 1 THEN NULL ELSE ISNULL(@CostUSD, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ResultDetails_Clear = 1 THEN NULL ELSE ISNULL(@ResultDetails, NULL) END,
                CASE WHEN @Log_Clear = 1 THEN NULL ELSE ISNULL(@Log, NULL) END,
                CASE WHEN @Tags_Clear = 1 THEN NULL ELSE ISNULL(@Tags, NULL) END,
                CASE WHEN @MachineName_Clear = 1 THEN NULL ELSE ISNULL(@MachineName, NULL) END,
                CASE WHEN @MachineID_Clear = 1 THEN NULL ELSE ISNULL(@MachineID, NULL) END,
                CASE WHEN @RunByUserName_Clear = 1 THEN NULL ELSE ISNULL(@RunByUserName, NULL) END,
                CASE WHEN @RunByUserEmail_Clear = 1 THEN NULL ELSE ISNULL(@RunByUserEmail, NULL) END,
                CASE WHEN @RunContextDetails_Clear = 1 THEN NULL ELSE ISNULL(@RunContextDetails, NULL) END,
                CASE WHEN @TargetLogEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetLogEntityID, NULL) END,
                CASE WHEN @ResolvedVariables_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedVariables, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[TestRun]
            (
                [TestID],
                [TestSuiteRunID],
                [RunByUserID],
                [Sequence],
                [TargetType],
                [TargetLogID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [DurationSeconds],
                [InputData],
                [ExpectedOutputData],
                [ActualOutputData],
                [PassedChecks],
                [FailedChecks],
                [TotalChecks],
                [Score],
                [CostUSD],
                [ErrorMessage],
                [ResultDetails],
                [Log],
                [Tags],
                [MachineName],
                [MachineID],
                [RunByUserName],
                [RunByUserEmail],
                [RunContextDetails],
                [TargetLogEntityID],
                [ResolvedVariables]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @TestID,
                CASE WHEN @TestSuiteRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestSuiteRunID, NULL) END,
                @RunByUserID,
                CASE WHEN @Sequence_Clear = 1 THEN NULL ELSE ISNULL(@Sequence, NULL) END,
                CASE WHEN @TargetType_Clear = 1 THEN NULL ELSE ISNULL(@TargetType, NULL) END,
                CASE WHEN @TargetLogID_Clear = 1 THEN NULL ELSE ISNULL(@TargetLogID, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, NULL) END,
                CASE WHEN @DurationSeconds_Clear = 1 THEN NULL ELSE ISNULL(@DurationSeconds, NULL) END,
                CASE WHEN @InputData_Clear = 1 THEN NULL ELSE ISNULL(@InputData, NULL) END,
                CASE WHEN @ExpectedOutputData_Clear = 1 THEN NULL ELSE ISNULL(@ExpectedOutputData, NULL) END,
                CASE WHEN @ActualOutputData_Clear = 1 THEN NULL ELSE ISNULL(@ActualOutputData, NULL) END,
                CASE WHEN @PassedChecks_Clear = 1 THEN NULL ELSE ISNULL(@PassedChecks, NULL) END,
                CASE WHEN @FailedChecks_Clear = 1 THEN NULL ELSE ISNULL(@FailedChecks, NULL) END,
                CASE WHEN @TotalChecks_Clear = 1 THEN NULL ELSE ISNULL(@TotalChecks, NULL) END,
                CASE WHEN @Score_Clear = 1 THEN NULL ELSE ISNULL(@Score, NULL) END,
                CASE WHEN @CostUSD_Clear = 1 THEN NULL ELSE ISNULL(@CostUSD, NULL) END,
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ResultDetails_Clear = 1 THEN NULL ELSE ISNULL(@ResultDetails, NULL) END,
                CASE WHEN @Log_Clear = 1 THEN NULL ELSE ISNULL(@Log, NULL) END,
                CASE WHEN @Tags_Clear = 1 THEN NULL ELSE ISNULL(@Tags, NULL) END,
                CASE WHEN @MachineName_Clear = 1 THEN NULL ELSE ISNULL(@MachineName, NULL) END,
                CASE WHEN @MachineID_Clear = 1 THEN NULL ELSE ISNULL(@MachineID, NULL) END,
                CASE WHEN @RunByUserName_Clear = 1 THEN NULL ELSE ISNULL(@RunByUserName, NULL) END,
                CASE WHEN @RunByUserEmail_Clear = 1 THEN NULL ELSE ISNULL(@RunByUserEmail, NULL) END,
                CASE WHEN @RunContextDetails_Clear = 1 THEN NULL ELSE ISNULL(@RunContextDetails, NULL) END,
                CASE WHEN @TargetLogEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetLogEntityID, NULL) END,
                CASE WHEN @ResolvedVariables_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedVariables, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[TestRun] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRun] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Test Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateTestRun] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Test Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Test Runs
-- Item: spUpdateTestRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TestRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateTestRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateTestRun]
    @ID uniqueidentifier,
    @TestID uniqueidentifier = NULL,
    @TestSuiteRunID_Clear bit = 0,
    @TestSuiteRunID uniqueidentifier = NULL,
    @RunByUserID uniqueidentifier = NULL,
    @Sequence_Clear bit = 0,
    @Sequence int = NULL,
    @TargetType_Clear bit = 0,
    @TargetType nvarchar(100) = NULL,
    @TargetLogID_Clear bit = 0,
    @TargetLogID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt_Clear bit = 0,
    @CompletedAt datetimeoffset = NULL,
    @DurationSeconds_Clear bit = 0,
    @DurationSeconds decimal(10, 3) = NULL,
    @InputData_Clear bit = 0,
    @InputData nvarchar(MAX) = NULL,
    @ExpectedOutputData_Clear bit = 0,
    @ExpectedOutputData nvarchar(MAX) = NULL,
    @ActualOutputData_Clear bit = 0,
    @ActualOutputData nvarchar(MAX) = NULL,
    @PassedChecks_Clear bit = 0,
    @PassedChecks int = NULL,
    @FailedChecks_Clear bit = 0,
    @FailedChecks int = NULL,
    @TotalChecks_Clear bit = 0,
    @TotalChecks int = NULL,
    @Score_Clear bit = 0,
    @Score decimal(5, 4) = NULL,
    @CostUSD_Clear bit = 0,
    @CostUSD decimal(10, 6) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ResultDetails_Clear bit = 0,
    @ResultDetails nvarchar(MAX) = NULL,
    @Log_Clear bit = 0,
    @Log nvarchar(MAX) = NULL,
    @Tags_Clear bit = 0,
    @Tags nvarchar(MAX) = NULL,
    @MachineName_Clear bit = 0,
    @MachineName nvarchar(255) = NULL,
    @MachineID_Clear bit = 0,
    @MachineID nvarchar(255) = NULL,
    @RunByUserName_Clear bit = 0,
    @RunByUserName nvarchar(255) = NULL,
    @RunByUserEmail_Clear bit = 0,
    @RunByUserEmail nvarchar(255) = NULL,
    @RunContextDetails_Clear bit = 0,
    @RunContextDetails nvarchar(MAX) = NULL,
    @TargetLogEntityID_Clear bit = 0,
    @TargetLogEntityID uniqueidentifier = NULL,
    @ResolvedVariables_Clear bit = 0,
    @ResolvedVariables nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRun]
    SET
        [TestID] = ISNULL(@TestID, [TestID]),
        [TestSuiteRunID] = CASE WHEN @TestSuiteRunID_Clear = 1 THEN NULL ELSE ISNULL(@TestSuiteRunID, [TestSuiteRunID]) END,
        [RunByUserID] = ISNULL(@RunByUserID, [RunByUserID]),
        [Sequence] = CASE WHEN @Sequence_Clear = 1 THEN NULL ELSE ISNULL(@Sequence, [Sequence]) END,
        [TargetType] = CASE WHEN @TargetType_Clear = 1 THEN NULL ELSE ISNULL(@TargetType, [TargetType]) END,
        [TargetLogID] = CASE WHEN @TargetLogID_Clear = 1 THEN NULL ELSE ISNULL(@TargetLogID, [TargetLogID]) END,
        [Status] = ISNULL(@Status, [Status]),
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [CompletedAt] = CASE WHEN @CompletedAt_Clear = 1 THEN NULL ELSE ISNULL(@CompletedAt, [CompletedAt]) END,
        [DurationSeconds] = CASE WHEN @DurationSeconds_Clear = 1 THEN NULL ELSE ISNULL(@DurationSeconds, [DurationSeconds]) END,
        [InputData] = CASE WHEN @InputData_Clear = 1 THEN NULL ELSE ISNULL(@InputData, [InputData]) END,
        [ExpectedOutputData] = CASE WHEN @ExpectedOutputData_Clear = 1 THEN NULL ELSE ISNULL(@ExpectedOutputData, [ExpectedOutputData]) END,
        [ActualOutputData] = CASE WHEN @ActualOutputData_Clear = 1 THEN NULL ELSE ISNULL(@ActualOutputData, [ActualOutputData]) END,
        [PassedChecks] = CASE WHEN @PassedChecks_Clear = 1 THEN NULL ELSE ISNULL(@PassedChecks, [PassedChecks]) END,
        [FailedChecks] = CASE WHEN @FailedChecks_Clear = 1 THEN NULL ELSE ISNULL(@FailedChecks, [FailedChecks]) END,
        [TotalChecks] = CASE WHEN @TotalChecks_Clear = 1 THEN NULL ELSE ISNULL(@TotalChecks, [TotalChecks]) END,
        [Score] = CASE WHEN @Score_Clear = 1 THEN NULL ELSE ISNULL(@Score, [Score]) END,
        [CostUSD] = CASE WHEN @CostUSD_Clear = 1 THEN NULL ELSE ISNULL(@CostUSD, [CostUSD]) END,
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [ResultDetails] = CASE WHEN @ResultDetails_Clear = 1 THEN NULL ELSE ISNULL(@ResultDetails, [ResultDetails]) END,
        [Log] = CASE WHEN @Log_Clear = 1 THEN NULL ELSE ISNULL(@Log, [Log]) END,
        [Tags] = CASE WHEN @Tags_Clear = 1 THEN NULL ELSE ISNULL(@Tags, [Tags]) END,
        [MachineName] = CASE WHEN @MachineName_Clear = 1 THEN NULL ELSE ISNULL(@MachineName, [MachineName]) END,
        [MachineID] = CASE WHEN @MachineID_Clear = 1 THEN NULL ELSE ISNULL(@MachineID, [MachineID]) END,
        [RunByUserName] = CASE WHEN @RunByUserName_Clear = 1 THEN NULL ELSE ISNULL(@RunByUserName, [RunByUserName]) END,
        [RunByUserEmail] = CASE WHEN @RunByUserEmail_Clear = 1 THEN NULL ELSE ISNULL(@RunByUserEmail, [RunByUserEmail]) END,
        [RunContextDetails] = CASE WHEN @RunContextDetails_Clear = 1 THEN NULL ELSE ISNULL(@RunContextDetails, [RunContextDetails]) END,
        [TargetLogEntityID] = CASE WHEN @TargetLogEntityID_Clear = 1 THEN NULL ELSE ISNULL(@TargetLogEntityID, [TargetLogEntityID]) END,
        [ResolvedVariables] = CASE WHEN @ResolvedVariables_Clear = 1 THEN NULL ELSE ISNULL(@ResolvedVariables, [ResolvedVariables]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[TestRun] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[TestRun] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateTestRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateTestRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateTestRun
ON [${flyway:defaultSchema}].[TestRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[TestRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[TestRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Test Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateTestRun] TO [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Record Logs
-- Item: spCreateUserRecordLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR UserRecordLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateUserRecordLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateUserRecordLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateUserRecordLog]
    @ID uniqueidentifier = NULL,
    @UserID uniqueidentifier,
    @EntityID uniqueidentifier,
    @RecordID nvarchar(450),
    @EarliestAt datetimeoffset = NULL,
    @LatestAt datetimeoffset = NULL,
    @TotalCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[UserRecordLog]
            (
                [ID],
                [UserID],
                [EntityID],
                [RecordID],
                [EarliestAt],
                [LatestAt],
                [TotalCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @UserID,
                @EntityID,
                @RecordID,
                ISNULL(@EarliestAt, sysdatetimeoffset()),
                ISNULL(@LatestAt, sysdatetimeoffset()),
                ISNULL(@TotalCount, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[UserRecordLog]
            (
                [UserID],
                [EntityID],
                [RecordID],
                [EarliestAt],
                [LatestAt],
                [TotalCount]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @UserID,
                @EntityID,
                @RecordID,
                ISNULL(@EarliestAt, sysdatetimeoffset()),
                ISNULL(@LatestAt, sysdatetimeoffset()),
                ISNULL(@TotalCount, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[UserRecordLog] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRecordLog] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: User Record Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateUserRecordLog] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: User Record Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Record Logs
-- Item: spUpdateUserRecordLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR UserRecordLog
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateUserRecordLog]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateUserRecordLog];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateUserRecordLog]
    @ID uniqueidentifier,
    @UserID uniqueidentifier = NULL,
    @EntityID uniqueidentifier = NULL,
    @RecordID nvarchar(450) = NULL,
    @EarliestAt datetimeoffset = NULL,
    @LatestAt datetimeoffset = NULL,
    @TotalCount int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserRecordLog]
    SET
        [UserID] = ISNULL(@UserID, [UserID]),
        [EntityID] = ISNULL(@EntityID, [EntityID]),
        [RecordID] = ISNULL(@RecordID, [RecordID]),
        [EarliestAt] = ISNULL(@EarliestAt, [EarliestAt]),
        [LatestAt] = ISNULL(@LatestAt, [LatestAt]),
        [TotalCount] = ISNULL(@TotalCount, [TotalCount])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[UserRecordLog] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT [ID], [__mj_CreatedAt], [__mj_UpdatedAt] FROM [${flyway:defaultSchema}].[UserRecordLog] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRecordLog] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserRecordLog table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateUserRecordLog]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateUserRecordLog];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateUserRecordLog
ON [${flyway:defaultSchema}].[UserRecordLog]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[UserRecordLog]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[UserRecordLog] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: User Record Logs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateUserRecordLog] TO [cdp_Developer], [cdp_Integration];

