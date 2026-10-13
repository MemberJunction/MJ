-- ============================================================================
-- Realtime recording shard ledger (MJ#5294)
-- ============================================================================
-- WHY THIS EXISTS. A client-direct realtime call is recorded in the browser, because the browser talks
-- straight to the vendor and MJAPI never sees the audio. The recording used to reach the server as one
-- ~35 MB upload right after End, exactly when users close the tab, so it was routinely lost. Now the
-- browser uploads a 5 s Opus shard ("MJOPUS1") every 5 s plus a small keepalive terminal request, and
-- MJAPI assembles recording.wav from the shards within seconds of the terminal signal.
--
-- Shards are staged in SQL, not in the storage account: Box (production storage) cannot take a few
-- hundred small writes per second, and MJ's binary-field support already covers VARBINARY. Rows are
-- deleted once the session's recording is Complete, or by the session janitor after its lookback window.
--
-- AIAgentSession gains the assembly state: RecordingStatus, the expected shard count and captured sample
-- count from the terminal signal, the silent gaps a Partial recording carries, and a version bumped by
-- every assembly claim (fencing a slow assembler against a newer one).
--
-- GUARDED-WRITE PROCEDURES. MJ grants its runtime roles SELECT on views and EXECUTE on procedures, never
-- table-level DML, and the shard insert, the terminal stamp and the assembly claim each need one
-- conditional statement whose outcome is the arbitration signal (same remedy as the work queue,
-- V202610061701__v6.2.x__Work_Queue_Guarded_Write_Sprocs.sql). They live in this migration, above the
-- CodeGen block, because they depend only on the hand-written DDL. Row-returning writes capture OUTPUT
-- into a table variable (CodeGen tables carry update triggers, so a bare OUTPUT fails).
--
-- PostgreSQL counterpart is produced by the release build.
-- ============================================================================

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

ALTER TABLE [${flyway:defaultSchema}].[AIAgentSession] ADD
    [RecordingStatus] NVARCHAR(20) NULL
        CONSTRAINT [CK_AIAgentSession_RecordingStatus] CHECK ([RecordingStatus] IN ('Pending', 'Assembling', 'Complete', 'Partial', 'Failed')),
    [RecordingExpectedShards] INT NULL,
    [RecordingCapturedSamples] BIGINT NULL,
    [RecordingGaps] NVARCHAR(MAX) NULL,
    [RecordingAssemblyVersion] INT NOT NULL CONSTRAINT [DF_AIAgentSession_RecordingAssemblyVersion] DEFAULT 0;
GO

CREATE TABLE [${flyway:defaultSchema}].[AIAgentSessionRecordingShard] (
    [ID] UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    [AgentSessionID] UNIQUEIDENTIFIER NOT NULL,
    [Index] INT NOT NULL,
    [StartSample] BIGINT NOT NULL,
    [SampleCount] INT NOT NULL,
    [Bytes] INT NOT NULL,
    [Sha256] NVARCHAR(64) NOT NULL,
    [Data] VARBINARY(MAX) NOT NULL,
    [ReceivedAt] DATETIMEOFFSET NOT NULL CONSTRAINT [DF_AIAgentSessionRecordingShard_ReceivedAt] DEFAULT SYSDATETIMEOFFSET(),
    CONSTRAINT [PK_AIAgentSessionRecordingShard] PRIMARY KEY ([ID]),
    CONSTRAINT [FK_AIAgentSessionRecordingShard_AgentSession] FOREIGN KEY ([AgentSessionID]) REFERENCES [${flyway:defaultSchema}].[AIAgentSession]([ID]),
    CONSTRAINT [UQ_AIAgentSessionRecordingShard_Session_Index] UNIQUE ([AgentSessionID], [Index]),
    CONSTRAINT [CK_AIAgentSessionRecordingShard_Index] CHECK ([Index] >= 0),
    CONSTRAINT [CK_AIAgentSessionRecordingShard_Counts] CHECK ([StartSample] >= 0 AND [SampleCount] >= 0 AND [Bytes] >= 0)
);
GO

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Guarded-write procedures
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

-- Records one shard. Insert-if-absent under a key-range lock (the MERGE the design calls for):
--   * absent            → inserted; a NULL status becomes Pending, and a Complete/Partial session given a
--                         shard at or past its expected count becomes Pending again (the call went on after a
--                         terminal signal, so there is unassembled audio) — but only within 24 h of close:
--                         an older session's file and status are left alone (the shard is kept and the
--                         caller logs it). An insert while Assembling also
--                         re-opens it AND bumps the version: the running assembler may already have read the
--                         ledger, so its fenced finish must lose and a fresh claim must pick the shard up.
--   * same index + hash → Duplicate (a retry; acknowledged as success).
--   * same index, other hash → Conflict; the session is marked Failed for a human to look at.
-- Returns one row: Outcome plus the session's status, expected shard count and ClosedAt after the write.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spRecordAIAgentSessionRecordingShard];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spRecordAIAgentSessionRecordingShard]
    @AgentSessionID UNIQUEIDENTIFIER,
    @Index INT,
    @StartSample BIGINT,
    @SampleCount INT,
    @Bytes INT,
    @Sha256 NVARCHAR(64),
    @Data VARBINARY(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    DECLARE @Outcome NVARCHAR(20);
    DECLARE @Merged TABLE ([Action] NVARCHAR(10));
    BEGIN TRANSACTION;
    MERGE [${flyway:defaultSchema}].[AIAgentSessionRecordingShard] WITH (HOLDLOCK) AS t
    USING (SELECT @AgentSessionID AS [AgentSessionID], @Index AS [Index]) AS s
        ON t.[AgentSessionID] = s.[AgentSessionID] AND t.[Index] = s.[Index]
    WHEN NOT MATCHED THEN
        INSERT ([AgentSessionID], [Index], [StartSample], [SampleCount], [Bytes], [Sha256], [Data])
        VALUES (@AgentSessionID, @Index, @StartSample, @SampleCount, @Bytes, @Sha256, @Data)
    OUTPUT $action INTO @Merged;

    IF EXISTS (SELECT 1 FROM @Merged)
    BEGIN
        SET @Outcome = N'Inserted';
        UPDATE [${flyway:defaultSchema}].[AIAgentSession]
           SET [RecordingStatus] = N'Pending',
               [RecordingAssemblyVersion] = CASE WHEN [RecordingStatus] = N'Assembling' THEN [RecordingAssemblyVersion] + 1
                                                 ELSE [RecordingAssemblyVersion] END
         WHERE [ID] = @AgentSessionID
           AND ([RecordingStatus] IS NULL
                OR [RecordingStatus] = N'Assembling'
                OR ([RecordingStatus] IN (N'Complete', N'Partial') AND @Index >= ISNULL([RecordingExpectedShards], 0)
                    AND ([ClosedAt] IS NULL OR [ClosedAt] > DATEADD(HOUR, -24, SYSDATETIMEOFFSET()))));
    END
    ELSE IF EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[AIAgentSessionRecordingShard]
                     WHERE [AgentSessionID] = @AgentSessionID AND [Index] = @Index AND [Sha256] = @Sha256)
        SET @Outcome = N'Duplicate';
    ELSE
    BEGIN
        SET @Outcome = N'Conflict';
        UPDATE [${flyway:defaultSchema}].[AIAgentSession]
           SET [RecordingStatus] = N'Failed'
         WHERE [ID] = @AgentSessionID;
    END
    COMMIT TRANSACTION;

    SELECT @Outcome AS [Outcome], s.[RecordingStatus], s.[RecordingExpectedShards], s.[ClosedAt]
      FROM [${flyway:defaultSchema}].[AIAgentSession] s
     WHERE s.[ID] = @AgentSessionID;
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spRecordAIAgentSessionRecordingShard] TO [cdp_Developer], [cdp_Integration];
GO

-- Stamps the terminal signal. Idempotent: accepted when both counts are at or above what is stored (or
-- nothing is stored yet); a lower terminal is Ignored (the caller logs it). A strictly higher terminal on a
-- Complete/Partial/Assembling session re-opens it (Pending): the call continued after an earlier terminal (a
-- tab that went to the background and came back). On Assembling the version is bumped too, so the running
-- assembler's fenced finish loses and a fresh claim reads the new counts. Both counts rise together within a
-- call, so a mixed pair (one higher, one lower) is treated as lower and Ignored. A NULL status becomes
-- Pending; Failed stays Failed. NULL or negative counts are refused.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spStampAIAgentSessionRecordingTerminal];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spStampAIAgentSessionRecordingTerminal]
    @AgentSessionID UNIQUEIDENTIFIER,
    @ExpectedShards INT,
    @CapturedSamples BIGINT
AS
BEGIN
    SET NOCOUNT ON;
    IF @ExpectedShards IS NULL OR @ExpectedShards < 0 OR @CapturedSamples IS NULL OR @CapturedSamples < 0
        THROW 51100, N'spStampAIAgentSessionRecordingTerminal: expected shards and captured samples must be non-negative', 1;
    DECLARE @Stamped TABLE ([RecordingStatus] NVARCHAR(20));
    UPDATE [${flyway:defaultSchema}].[AIAgentSession]
       SET [RecordingStatus] = CASE
               WHEN [RecordingStatus] IS NULL THEN N'Pending'
               WHEN [RecordingStatus] IN (N'Complete', N'Partial', N'Assembling')
                    AND (@ExpectedShards > ISNULL([RecordingExpectedShards], -1) OR @CapturedSamples > ISNULL([RecordingCapturedSamples], -1))
                    THEN N'Pending'
               ELSE [RecordingStatus] END,
           [RecordingAssemblyVersion] = CASE
               WHEN [RecordingStatus] = N'Assembling'
                    AND (@ExpectedShards > ISNULL([RecordingExpectedShards], -1) OR @CapturedSamples > ISNULL([RecordingCapturedSamples], -1))
                    THEN [RecordingAssemblyVersion] + 1
               ELSE [RecordingAssemblyVersion] END,
           [RecordingExpectedShards] = @ExpectedShards,
           [RecordingCapturedSamples] = @CapturedSamples
    OUTPUT inserted.[RecordingStatus] INTO @Stamped
     WHERE [ID] = @AgentSessionID
       AND ([RecordingExpectedShards] IS NULL OR @ExpectedShards >= [RecordingExpectedShards])
       AND ([RecordingCapturedSamples] IS NULL OR @CapturedSamples >= [RecordingCapturedSamples]);

    IF EXISTS (SELECT 1 FROM @Stamped)
        SELECT N'Stamped' AS [Outcome], [RecordingStatus] FROM @Stamped;
    ELSE
        SELECT N'Ignored' AS [Outcome], s.[RecordingStatus]
          FROM [${flyway:defaultSchema}].[AIAgentSession] s
         WHERE s.[ID] = @AgentSessionID;
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spStampAIAgentSessionRecordingTerminal] TO [cdp_Developer], [cdp_Integration];
GO

-- Claims assembly: one conditional UPDATE, so of two concurrent callers exactly one gets a row back.
-- Claimable from Pending or Partial; also from Assembling when the previous claim is older than
-- @StaleBefore (an assembler that died — the janitor passes its attempt timeout; request paths pass NULL).
-- Staleness reads the row's __mj_UpdatedAt, which its update trigger stamps on ANY update (the claim, a
-- terminal stamp, a heartbeat), so it measures time since the row was last touched, not since the claim:
-- a re-claim can only be delayed, never early, and the janitor only sweeps closed sessions, which are
-- rarely touched. Returns the new version, or no row when the claim was lost.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spClaimAIAgentSessionRecordingAssembly];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spClaimAIAgentSessionRecordingAssembly]
    @AgentSessionID UNIQUEIDENTIFIER,
    @StaleBefore DATETIMEOFFSET = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Claimed TABLE ([RecordingAssemblyVersion] INT);
    UPDATE [${flyway:defaultSchema}].[AIAgentSession]
       SET [RecordingStatus] = N'Assembling',
           [RecordingAssemblyVersion] = [RecordingAssemblyVersion] + 1
    OUTPUT inserted.[RecordingAssemblyVersion] INTO @Claimed
     WHERE [ID] = @AgentSessionID
       AND ([RecordingStatus] IN (N'Pending', N'Partial')
            OR (@StaleBefore IS NOT NULL AND [RecordingStatus] = N'Assembling' AND [__mj_UpdatedAt] < @StaleBefore));
    SELECT [RecordingAssemblyVersion] FROM @Claimed;
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spClaimAIAgentSessionRecordingAssembly] TO [cdp_Developer], [cdp_Integration];
GO

-- Finishes an assembly, fenced on the version the assembler claimed: a newer claim makes this a no-op
-- (AffectedRows 0) so a slow assembler can never overwrite a newer result. @FileID NULL leaves the
-- recording file unchanged (a Failed assembly).
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spFinishAIAgentSessionRecordingAssembly];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spFinishAIAgentSessionRecordingAssembly]
    @AgentSessionID UNIQUEIDENTIFIER,
    @Version INT,
    @Status NVARCHAR(20),
    @Gaps NVARCHAR(MAX),
    @FileID UNIQUEIDENTIFIER = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE [${flyway:defaultSchema}].[AIAgentSession]
       SET [RecordingStatus] = @Status,
           [RecordingGaps] = @Gaps,
           [RecordingFileID] = ISNULL(@FileID, [RecordingFileID]),
           [RecordingMedia] = CASE WHEN @FileID IS NULL THEN [RecordingMedia] ELSE N'Audio' END
     WHERE [ID] = @AgentSessionID
       AND [RecordingAssemblyVersion] = @Version
       AND [RecordingStatus] = N'Assembling';
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spFinishAIAgentSessionRecordingAssembly] TO [cdp_Developer], [cdp_Integration];
GO

-- Deletes a session's assembled shards (indexes below the count that went into a Complete recording).
-- A shard at or past that count arrived after the assembly read the ledger and is kept.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentSessionRecordingShards];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentSessionRecordingShards]
    @AgentSessionID UNIQUEIDENTIFIER,
    @IndexBelow INT
AS
BEGIN
    SET NOCOUNT ON;
    DELETE FROM [${flyway:defaultSchema}].[AIAgentSessionRecordingShard]
     WHERE [AgentSessionID] = @AgentSessionID AND [Index] < @IndexBelow;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSessionRecordingShards] TO [cdp_Developer], [cdp_Integration];
GO

-- Janitor purge: shards of sessions closed before the cutoff (past the recovery lookback window, so
-- nothing will assemble them again). Bounded per call.
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spPurgeAIAgentSessionRecordingShards];
GO
CREATE PROCEDURE [${flyway:defaultSchema}].[spPurgeAIAgentSessionRecordingShards]
    @ClosedBefore DATETIMEOFFSET,
    @MaxRows INT
AS
BEGIN
    SET NOCOUNT ON;
    IF @ClosedBefore IS NULL OR @MaxRows IS NULL OR @MaxRows <= 0
        THROW 51101, N'spPurgeAIAgentSessionRecordingShards: a cutoff and a positive row limit are required', 1;
    DELETE TOP (@MaxRows) shard
      FROM [${flyway:defaultSchema}].[AIAgentSessionRecordingShard] shard WITH (READPAST)
      INNER JOIN [${flyway:defaultSchema}].[AIAgentSession] s ON s.[ID] = shard.[AgentSessionID]
     WHERE s.[ClosedAt] IS NOT NULL AND s.[ClosedAt] < @ClosedBefore;
    SELECT @@ROWCOUNT AS [AffectedRows];
END;
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spPurgeAIAgentSessionRecordingShards] TO [cdp_Developer], [cdp_Integration];
GO

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- Descriptions
-- ═══════════════════════════════════════════════════════════════════════════════════════════════

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'State of the server-side recording assembly for a client-direct session recorded as Opus shards: Pending (shards or a terminal signal are waiting to be assembled), Assembling (claimed by one server instance), Complete (recording.wav holds every captured sample), Partial (assembled with silent gaps, listed in RecordingGaps), Failed (a shard conflict or an assembly error needs a human). NULL when the session was not recorded this way.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'AIAgentSession', @level2type = N'COLUMN', @level2name = N'RecordingStatus';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Number of recording shards the browser reported in its terminal signal (last shard index + 1). NULL until a terminal signal arrives.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'AIAgentSession', @level2type = N'COLUMN', @level2name = N'RecordingExpectedShards';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Total audio samples (48 kHz mono) the browser captured, from its terminal signal. The assembled recording.wav is exactly this long. NULL until a terminal signal arrives.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'AIAgentSession', @level2type = N'COLUMN', @level2name = N'RecordingCapturedSamples';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'JSON array of the silent gaps in a Partial recording: [{startSample, sampleCount, indexes}], sample positions at 48 kHz and the shard indexes that were missing. Empty or NULL when nothing is missing.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'AIAgentSession', @level2type = N'COLUMN', @level2name = N'RecordingGaps';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Incremented by every assembly claim. The assembler finishes only if the version is still the one it claimed, so a newer assembly always wins over a slower older one.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'AIAgentSession', @level2type = N'COLUMN', @level2name = N'RecordingAssemblyVersion';
GO

EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'One 5-second Opus recording shard (MJOPUS1 format) uploaded by the browser during a client-direct realtime call, staged here until the server assembles the session recording. Deleted once the recording is Complete, or by the session janitor after its lookback window.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'AIAgentSessionRecordingShard';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Zero-based position of the shard in the recording. Unique per session; a retry of the same index with the same bytes is acknowledged, with different bytes it is refused.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'AIAgentSessionRecordingShard', @level2type = N'COLUMN', @level2name = N'Index';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Sample position (48 kHz) where this shard''s audio starts in the recording.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'AIAgentSessionRecordingShard', @level2type = N'COLUMN', @level2name = N'StartSample';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Number of audio samples (48 kHz) the shard covers.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'AIAgentSessionRecordingShard', @level2type = N'COLUMN', @level2name = N'SampleCount';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Size of Data in bytes.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'AIAgentSessionRecordingShard', @level2type = N'COLUMN', @level2name = N'Bytes';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'Lowercase hex SHA-256 of Data; decides whether a repeated upload of the same index is a retry or a conflict.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'AIAgentSessionRecordingShard', @level2type = N'COLUMN', @level2name = N'Sha256';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'The shard bytes as uploaded (MJOPUS1 header followed by length-prefixed Opus packets).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'AIAgentSessionRecordingShard', @level2type = N'COLUMN', @level2name = N'Data';
GO
EXEC sp_addextendedproperty @name = N'MS_Description', @value = N'When the server first stored this shard.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}', @level1type = N'TABLE', @level1name = N'AIAgentSessionRecordingShard', @level2type = N'COLUMN', @level2name = N'ReceivedAt';
GO























































/* ============================================================================================
 * EVERYTHING BELOW THIS LINE WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
 *
 * It contains the metadata and database objects CodeGen derived from the hand-written DDL above:
 * the Entity / EntityField / EntityFieldValue / EntityRelationship / EntityPermission inserts for
 * MJ: AI Agent Session Recording Shards and the new MJ: AI Agent Sessions columns (EntityField
 * Sequence values are apply-time MAX(Sequence)+1 expressions), the foreign-key indexes, the
 * regenerated vwAIAgentSessionRecordingShards / vwAIAgentSessions views, the spCreate / spUpdate /
 * spDelete procedures (including the spDeleteConversation and spDeleteAIAgent cascades that now
 * reach the shard table), permission grants, extended properties and the generated validators of the
 * new table's CHECK constraints. Validator rows CodeGen emitted for unrelated entities (drift in the
 * generating database) were removed.
 *
 * Do NOT edit it by hand. If the hand-written DDL above changes, re-run CodeGen against a database
 * at the last released version and replace this entire generated section.
 * ============================================================================================ */

/* SQL generated to create new entity MJ: AI Agent Session Recording Shards */

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
         [AllowCaching]
         , [TrackRecordChanges]
         , [AuditRecordAccess]
         , [AuditViewRuns]
         , [AllowAllRowsAPI]
         , [AllowCreateAPI]
         , [AllowUpdateAPI]
         , [AllowDeleteAPI]
         , [UserViewMaxRows]
         , [__mj_CreatedAt]
         , [__mj_UpdatedAt]
      )
      VALUES (
         'ebaed427-2514-46b1-a20c-777a2055c937',
         'MJ: AI Agent Session Recording Shards',
         'AI Agent Session Recording Shards',
         'One 5-second Opus recording shard (MJOPUS1 format) uploaded by the browser during a client-direct realtime call, staged here until the server assembles the session recording. Deleted once the recording is Complete, or by the session janitor after its lookback window.',
         NULL,
         'AIAgentSessionRecordingShard',
         'vwAIAgentSessionRecordingShards',
         '${flyway:defaultSchema}',
         1,
         1,
         1
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
         , GETUTCDATE()
         , GETUTCDATE()
      );

/* SQL generated to add new entity MJ: AI Agent Session Recording Shards to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'ebaed427-2514-46b1-a20c-777a2055c937', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: AI Agent Session Recording Shards for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('ebaed427-2514-46b1-a20c-777a2055c937' AS uniqueidentifier), CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('ebaed427-2514-46b1-a20c-777a2055c937' AS uniqueidentifier) AND [RoleID] = CAST('E0AFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: AI Agent Session Recording Shards for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('ebaed427-2514-46b1-a20c-777a2055c937' AS uniqueidentifier), CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('ebaed427-2514-46b1-a20c-777a2055c937' AS uniqueidentifier) AND [RoleID] = CAST('DEAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL generated to add new permission for entity MJ: AI Agent Session Recording Shards for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                ([EntityID], [RoleID], [Type], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt])
              SELECT CAST('ebaed427-2514-46b1-a20c-777a2055c937' AS uniqueidentifier), CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier), 'Allow', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE()
              WHERE NOT EXISTS (
                SELECT 1 FROM [${flyway:defaultSchema}].[EntityPermission]
                WHERE [EntityID] = CAST('ebaed427-2514-46b1-a20c-777a2055c937' AS uniqueidentifier) AND [RoleID] = CAST('DFAFCCEC-6A37-EF11-86D4-000D3A4E707E' AS uniqueidentifier) AND [Type] = 'Allow'
              );

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSessionRecordingShard */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSessionRecordingShard] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSessionRecordingShard */
UPDATE [${flyway:defaultSchema}].[AIAgentSessionRecordingShard] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSessionRecordingShard */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSessionRecordingShard] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.AIAgentSessionRecordingShard */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSessionRecordingShard] ADD CONSTRAINT [DF___mj_AIAgentSessionRecordingShard___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSessionRecordingShard */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSessionRecordingShard] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSessionRecordingShard */
UPDATE [${flyway:defaultSchema}].[AIAgentSessionRecordingShard] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSessionRecordingShard */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSessionRecordingShard] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.AIAgentSessionRecordingShard */
ALTER TABLE [${flyway:defaultSchema}].[AIAgentSessionRecordingShard] ADD CONSTRAINT [DF___mj_AIAgentSessionRecordingShard___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 16 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c74a743f-f9c8-432a-928e-23cd6af909ff' OR (EntityID = 'EBAED427-2514-46B1-A20C-777A2055C937' AND Name = 'ID')) BEGIN
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
            'c74a743f-f9c8-432a-928e-23cd6af909ff',
            'EBAED427-2514-46B1-A20C-777A2055C937', -- Entity: MJ: AI Agent Session Recording Shards
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBAED427-2514-46B1-A20C-777A2055C937'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ee88087e-de03-4409-9eec-b00007d32dc2' OR (EntityID = 'EBAED427-2514-46B1-A20C-777A2055C937' AND Name = 'AgentSessionID')) BEGIN
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
            'ee88087e-de03-4409-9eec-b00007d32dc2',
            'EBAED427-2514-46B1-A20C-777A2055C937', -- Entity: MJ: AI Agent Session Recording Shards
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBAED427-2514-46B1-A20C-777A2055C937'),
            'AgentSessionID',
            'Agent Session ID',
            NULL,
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
            '17198778-E25A-4457-80AF-9E8C4961DC29',
            'ID',
            0,
            0,
            1,
            0,
            0,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ae248773-4fcc-4d86-8b40-9bdc469b4eff' OR (EntityID = 'EBAED427-2514-46B1-A20C-777A2055C937' AND Name = 'Index')) BEGIN
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
            'ae248773-4fcc-4d86-8b40-9bdc469b4eff',
            'EBAED427-2514-46B1-A20C-777A2055C937', -- Entity: MJ: AI Agent Session Recording Shards
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBAED427-2514-46B1-A20C-777A2055C937'),
            'Index',
            'Index',
            'Zero-based position of the shard in the recording. Unique per session; a retry of the same index with the same bytes is acknowledged, with different bytes it is refused.',
            'int',
            4,
            10,
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
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '85d6c6b3-d9e3-4819-bf87-306bda555116' OR (EntityID = 'EBAED427-2514-46B1-A20C-777A2055C937' AND Name = 'StartSample')) BEGIN
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
            '85d6c6b3-d9e3-4819-bf87-306bda555116',
            'EBAED427-2514-46B1-A20C-777A2055C937', -- Entity: MJ: AI Agent Session Recording Shards
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBAED427-2514-46B1-A20C-777A2055C937'),
            'StartSample',
            'Start Sample',
            'Sample position (48 kHz) where this shard''s audio starts in the recording.',
            'bigint',
            8,
            19,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c660de10-8126-4d24-9360-5dc26126613c' OR (EntityID = 'EBAED427-2514-46B1-A20C-777A2055C937' AND Name = 'SampleCount')) BEGIN
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
            'c660de10-8126-4d24-9360-5dc26126613c',
            'EBAED427-2514-46B1-A20C-777A2055C937', -- Entity: MJ: AI Agent Session Recording Shards
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBAED427-2514-46B1-A20C-777A2055C937'),
            'SampleCount',
            'Sample Count',
            'Number of audio samples (48 kHz) the shard covers.',
            'int',
            4,
            10,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2a7f15fb-580a-439b-9de4-4fccf8907ddb' OR (EntityID = 'EBAED427-2514-46B1-A20C-777A2055C937' AND Name = 'Bytes')) BEGIN
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
            '2a7f15fb-580a-439b-9de4-4fccf8907ddb',
            'EBAED427-2514-46B1-A20C-777A2055C937', -- Entity: MJ: AI Agent Session Recording Shards
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBAED427-2514-46B1-A20C-777A2055C937'),
            'Bytes',
            'Bytes',
            'Size of Data in bytes.',
            'int',
            4,
            10,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ee2b8659-543c-4b72-bb5b-7cc1df073f3c' OR (EntityID = 'EBAED427-2514-46B1-A20C-777A2055C937' AND Name = 'Sha256')) BEGIN
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
            'ee2b8659-543c-4b72-bb5b-7cc1df073f3c',
            'EBAED427-2514-46B1-A20C-777A2055C937', -- Entity: MJ: AI Agent Session Recording Shards
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBAED427-2514-46B1-A20C-777A2055C937'),
            'Sha256',
            'Sha 256',
            'Lowercase hex SHA-256 of Data; decides whether a repeated upload of the same index is a retry or a conflict.',
            'nvarchar',
            128,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6866304a-1522-4fb6-bd42-1570dcc808ac' OR (EntityID = 'EBAED427-2514-46B1-A20C-777A2055C937' AND Name = 'Data')) BEGIN
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
            '6866304a-1522-4fb6-bd42-1570dcc808ac',
            'EBAED427-2514-46B1-A20C-777A2055C937', -- Entity: MJ: AI Agent Session Recording Shards
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBAED427-2514-46B1-A20C-777A2055C937'),
            'Data',
            'Data',
            'The shard bytes as uploaded (MJOPUS1 header followed by length-prefixed Opus packets).',
            'varbinary',
            -1,
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
            0,
            0,
            0,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0202b8c4-a0cf-41e6-b68b-769e25a5b4ea' OR (EntityID = 'EBAED427-2514-46B1-A20C-777A2055C937' AND Name = 'ReceivedAt')) BEGIN
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
            '0202b8c4-a0cf-41e6-b68b-769e25a5b4ea',
            'EBAED427-2514-46B1-A20C-777A2055C937', -- Entity: MJ: AI Agent Session Recording Shards
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBAED427-2514-46B1-A20C-777A2055C937'),
            'ReceivedAt',
            'Received At',
            'When the server first stored this shard.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'e7fc05d6-d76c-45e3-8d56-f659a98c529a' OR (EntityID = 'EBAED427-2514-46B1-A20C-777A2055C937' AND Name = '__mj_CreatedAt')) BEGIN
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
            'e7fc05d6-d76c-45e3-8d56-f659a98c529a',
            'EBAED427-2514-46B1-A20C-777A2055C937', -- Entity: MJ: AI Agent Session Recording Shards
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBAED427-2514-46B1-A20C-777A2055C937'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6ced36c5-6456-4f71-8a9a-6ec1c7951e95' OR (EntityID = 'EBAED427-2514-46B1-A20C-777A2055C937' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '6ced36c5-6456-4f71-8a9a-6ec1c7951e95',
            'EBAED427-2514-46B1-A20C-777A2055C937', -- Entity: MJ: AI Agent Session Recording Shards
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'EBAED427-2514-46B1-A20C-777A2055C937'),
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5c1a2e3d-fbe8-45dc-8a85-9ee2164a1356' OR (EntityID = '17198778-E25A-4457-80AF-9E8C4961DC29' AND Name = 'RecordingStatus')) BEGIN
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
            '5c1a2e3d-fbe8-45dc-8a85-9ee2164a1356',
            '17198778-E25A-4457-80AF-9E8C4961DC29', -- Entity: MJ: AI Agent Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '17198778-E25A-4457-80AF-9E8C4961DC29'),
            'RecordingStatus',
            'Recording Status',
            'State of the server-side recording assembly for a client-direct session recorded as Opus shards: Pending (shards or a terminal signal are waiting to be assembled), Assembling (claimed by one server instance), Complete (recording.wav holds every captured sample), Partial (assembled with silent gaps, listed in RecordingGaps), Failed (a shard conflict or an assembly error needs a human). NULL when the session was not recorded this way.',
            'nvarchar',
            40,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '68b99430-0bd8-4496-8b90-08d2cf58ea5b' OR (EntityID = '17198778-E25A-4457-80AF-9E8C4961DC29' AND Name = 'RecordingExpectedShards')) BEGIN
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
            '68b99430-0bd8-4496-8b90-08d2cf58ea5b',
            '17198778-E25A-4457-80AF-9E8C4961DC29', -- Entity: MJ: AI Agent Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '17198778-E25A-4457-80AF-9E8C4961DC29'),
            'RecordingExpectedShards',
            'Recording Expected Shards',
            'Number of recording shards the browser reported in its terminal signal (last shard index + 1). NULL until a terminal signal arrives.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1ce50980-e993-49d8-a45c-76dced905a2f' OR (EntityID = '17198778-E25A-4457-80AF-9E8C4961DC29' AND Name = 'RecordingCapturedSamples')) BEGIN
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
            '1ce50980-e993-49d8-a45c-76dced905a2f',
            '17198778-E25A-4457-80AF-9E8C4961DC29', -- Entity: MJ: AI Agent Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '17198778-E25A-4457-80AF-9E8C4961DC29'),
            'RecordingCapturedSamples',
            'Recording Captured Samples',
            'Total audio samples (48 kHz mono) the browser captured, from its terminal signal. The assembled recording.wav is exactly this long. NULL until a terminal signal arrives.',
            'bigint',
            8,
            19,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '70a98238-7aee-40b1-a1d4-0f2c03393316' OR (EntityID = '17198778-E25A-4457-80AF-9E8C4961DC29' AND Name = 'RecordingGaps')) BEGIN
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
            '70a98238-7aee-40b1-a1d4-0f2c03393316',
            '17198778-E25A-4457-80AF-9E8C4961DC29', -- Entity: MJ: AI Agent Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '17198778-E25A-4457-80AF-9E8C4961DC29'),
            'RecordingGaps',
            'Recording Gaps',
            'JSON array of the silent gaps in a Partial recording: [{startSample, sampleCount, indexes}], sample positions at 48 kHz and the shard indexes that were missing. Empty or NULL when nothing is missing.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '5506b605-5358-471c-b1d3-0677dbc00780' OR (EntityID = '17198778-E25A-4457-80AF-9E8C4961DC29' AND Name = 'RecordingAssemblyVersion')) BEGIN
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
            '5506b605-5358-471c-b1d3-0677dbc00780',
            '17198778-E25A-4457-80AF-9E8C4961DC29', -- Entity: MJ: AI Agent Sessions
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = '17198778-E25A-4457-80AF-9E8C4961DC29'),
            'RecordingAssemblyVersion',
            'Recording Assembly Version',
            'Incremented by every assembly claim. The assembler finishes only if the version is still the one it claimed, so a newer assembly always wins over a slower older one.',
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

/* SQL text to insert entity field value with ID 22fb7cff-5259-4cd6-96c1-7abe8ad38454 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('22fb7cff-5259-4cd6-96c1-7abe8ad38454', '5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356', 1, 'Assembling', 'Assembling', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID d4f2e074-ad0b-4485-8802-5619169fd0f2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('d4f2e074-ad0b-4485-8802-5619169fd0f2', '5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356', 2, 'Complete', 'Complete', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 510b210f-a167-490e-8372-6e8ce6959239 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('510b210f-a167-490e-8372-6e8ce6959239', '5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356', 3, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 15a740e1-98ed-4206-a9fd-fd0429fab9ff */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('15a740e1-98ed-4206-a9fd-fd0429fab9ff', '5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356', 4, 'Partial', 'Partial', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID dfefc0ce-e837-4bc4-b45b-c836674672e0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('dfefc0ce-e837-4bc4-b45b-c836674672e0', '5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356', 5, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356 */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356';

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


/* Create Entity Relationship: MJ: AI Agent Sessions -> MJ: AI Agent Session Recording Shards (One To Many via AgentSessionID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '79321923-b223-45b8-8365-fa8a9cb229c8'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('79321923-b223-45b8-8365-fa8a9cb229c8', '17198778-E25A-4457-80AF-9E8C4961DC29', 'EBAED427-2514-46B1-A20C-777A2055C937', 'AgentSessionID', 'One To Many', 1, 1, 7, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for AIAgentSessionRecordingShard */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Recording Shards
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentSessionID in table AIAgentSessionRecordingShard
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSessionRecordingShard_AgentSessionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSessionRecordingShard]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSessionRecordingShard_AgentSessionID ON [${flyway:defaultSchema}].[AIAgentSessionRecordingShard] ([AgentSessionID]);

/* Base View SQL for MJ: AI Agent Session Recording Shards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Recording Shards
-- Item: vwAIAgentSessionRecordingShards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Session Recording Shards
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentSessionRecordingShard
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentSessionRecordingShards]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentSessionRecordingShards];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentSessionRecordingShards]
AS
SELECT
    a.*
FROM
    [${flyway:defaultSchema}].[AIAgentSessionRecordingShard] AS a
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessionRecordingShards] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Session Recording Shards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Recording Shards
-- Item: Permissions for vwAIAgentSessionRecordingShards
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessionRecordingShards] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Session Recording Shards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Recording Shards
-- Item: spCreateAIAgentSessionRecordingShard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentSessionRecordingShard
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentSessionRecordingShard]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentSessionRecordingShard];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentSessionRecordingShard]
    @ID uniqueidentifier = NULL,
    @AgentSessionID uniqueidentifier,
    @Index int,
    @StartSample bigint,
    @SampleCount int,
    @Bytes int,
    @Sha256 nvarchar(64),
    @Data varbinary(MAX),
    @ReceivedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentSessionRecordingShard]
            (
                [ID],
                [AgentSessionID],
                [Index],
                [StartSample],
                [SampleCount],
                [Bytes],
                [Sha256],
                [Data],
                [ReceivedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentSessionID,
                @Index,
                @StartSample,
                @SampleCount,
                @Bytes,
                @Sha256,
                @Data,
                ISNULL(@ReceivedAt, sysdatetimeoffset())
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentSessionRecordingShard]
            (
                [AgentSessionID],
                [Index],
                [StartSample],
                [SampleCount],
                [Bytes],
                [Sha256],
                [Data],
                [ReceivedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentSessionID,
                @Index,
                @StartSample,
                @SampleCount,
                @Bytes,
                @Sha256,
                @Data,
                ISNULL(@ReceivedAt, sysdatetimeoffset())
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentSessionRecordingShards] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSessionRecordingShard] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Session Recording Shards */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSessionRecordingShard] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Session Recording Shards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Recording Shards
-- Item: spUpdateAIAgentSessionRecordingShard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentSessionRecordingShard
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentSessionRecordingShard]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentSessionRecordingShard];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentSessionRecordingShard]
    @ID uniqueidentifier,
    @AgentSessionID uniqueidentifier = NULL,
    @Index int = NULL,
    @StartSample bigint = NULL,
    @SampleCount int = NULL,
    @Bytes int = NULL,
    @Sha256 nvarchar(64) = NULL,
    @Data varbinary(MAX) = NULL,
    @ReceivedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentSessionRecordingShard]
    SET
        [AgentSessionID] = ISNULL(@AgentSessionID, [AgentSessionID]),
        [Index] = ISNULL(@Index, [Index]),
        [StartSample] = ISNULL(@StartSample, [StartSample]),
        [SampleCount] = ISNULL(@SampleCount, [SampleCount]),
        [Bytes] = ISNULL(@Bytes, [Bytes]),
        [Sha256] = ISNULL(@Sha256, [Sha256]),
        [Data] = ISNULL(@Data, [Data]),
        [ReceivedAt] = ISNULL(@ReceivedAt, [ReceivedAt])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentSessionRecordingShards] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentSessionRecordingShards]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSessionRecordingShard] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentSessionRecordingShard table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentSessionRecordingShard]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentSessionRecordingShard];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentSessionRecordingShard
ON [${flyway:defaultSchema}].[AIAgentSessionRecordingShard]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentSessionRecordingShard]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentSessionRecordingShard] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Session Recording Shards */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSessionRecordingShard] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Session Recording Shards */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Session Recording Shards
-- Item: spDeleteAIAgentSessionRecordingShard
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentSessionRecordingShard
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentSessionRecordingShard]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentSessionRecordingShard];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentSessionRecordingShard]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentSessionRecordingShard]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSessionRecordingShard] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Session Recording Shards */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSessionRecordingShard] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for AIAgentSession */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSession_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSession_AgentID ON [${flyway:defaultSchema}].[AIAgentSession] ([AgentID]);

-- Index for foreign key UserID in table AIAgentSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSession_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSession_UserID ON [${flyway:defaultSchema}].[AIAgentSession] ([UserID]);

-- Index for foreign key ConversationID in table AIAgentSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSession_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSession_ConversationID ON [${flyway:defaultSchema}].[AIAgentSession] ([ConversationID]);

-- Index for foreign key LastSessionID in table AIAgentSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSession_LastSessionID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSession_LastSessionID ON [${flyway:defaultSchema}].[AIAgentSession] ([LastSessionID]);

-- Index for foreign key RecordingFileID in table AIAgentSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSession_RecordingFileID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSession_RecordingFileID ON [${flyway:defaultSchema}].[AIAgentSession] ([RecordingFileID]);

-- Index for foreign key LinkedEntityID in table AIAgentSession
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentSession_LinkedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentSession]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentSession_LinkedEntityID ON [${flyway:defaultSchema}].[AIAgentSession] ([LinkedEntityID]);

/* Base View SQL for MJ: AI Agent Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: vwAIAgentSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Sessions
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentSession
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentSessions]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentSessions];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentSessions]
AS
SELECT
    a.*,
    MJAIAgent_AgentID.[Name] AS [Agent],
    MJUser_UserID.[Name] AS [User],
    MJConversation_ConversationID.[Name] AS [Conversation],
    MJFile_RecordingFileID.[Name] AS [RecordingFile],
    MJEntity_LinkedEntityID.[Name] AS [LinkedEntity]
FROM
    [${flyway:defaultSchema}].[AIAgentSession] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS MJAIAgent_AgentID
  ON
    [a].[AgentID] = MJAIAgent_AgentID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [a].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS MJConversation_ConversationID
  ON
    [a].[ConversationID] = MJConversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[File] AS MJFile_RecordingFileID
  ON
    [a].[RecordingFileID] = MJFile_RecordingFileID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_LinkedEntityID
  ON
    [a].[LinkedEntityID] = MJEntity_LinkedEntityID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessions] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessions] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessions] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: AI Agent Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: Permissions for vwAIAgentSessions
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessions] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessions] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessions] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentSessions] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: AI Agent Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: spCreateAIAgentSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentSession]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @UserID uniqueidentifier,
    @Status nvarchar(20) = NULL,
    @ConversationID_Clear bit = 0,
    @ConversationID uniqueidentifier = NULL,
    @LastSessionID_Clear bit = 0,
    @LastSessionID uniqueidentifier = NULL,
    @HostInstanceID_Clear bit = 0,
    @HostInstanceID nvarchar(200) = NULL,
    @Config_Clear bit = 0,
    @Config nvarchar(MAX) = NULL,
    @LastActiveAt datetimeoffset = NULL,
    @ClosedAt_Clear bit = 0,
    @ClosedAt datetimeoffset = NULL,
    @CloseReason_Clear bit = 0,
    @CloseReason nvarchar(20) = NULL,
    @RecordingMedia_Clear bit = 0,
    @RecordingMedia nvarchar(20) = NULL,
    @RecordingStartedAt_Clear bit = 0,
    @RecordingStartedAt datetimeoffset = NULL,
    @RecordingFileID_Clear bit = 0,
    @RecordingFileID uniqueidentifier = NULL,
    @LinkedEntityID_Clear bit = 0,
    @LinkedEntityID uniqueidentifier = NULL,
    @LinkedRecordID_Clear bit = 0,
    @LinkedRecordID nvarchar(500) = NULL,
    @RecordingStatus_Clear bit = 0,
    @RecordingStatus nvarchar(20) = NULL,
    @RecordingExpectedShards_Clear bit = 0,
    @RecordingExpectedShards int = NULL,
    @RecordingCapturedSamples_Clear bit = 0,
    @RecordingCapturedSamples bigint = NULL,
    @RecordingGaps_Clear bit = 0,
    @RecordingGaps nvarchar(MAX) = NULL,
    @RecordingAssemblyVersion int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentSession]
            (
                [ID],
                [AgentID],
                [UserID],
                [Status],
                [ConversationID],
                [LastSessionID],
                [HostInstanceID],
                [Config],
                [LastActiveAt],
                [ClosedAt],
                [CloseReason],
                [RecordingMedia],
                [RecordingStartedAt],
                [RecordingFileID],
                [LinkedEntityID],
                [LinkedRecordID],
                [RecordingStatus],
                [RecordingExpectedShards],
                [RecordingCapturedSamples],
                [RecordingGaps],
                [RecordingAssemblyVersion]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @UserID,
                ISNULL(@Status, 'Active'),
                CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, NULL) END,
                CASE WHEN @LastSessionID_Clear = 1 THEN NULL ELSE ISNULL(@LastSessionID, NULL) END,
                CASE WHEN @HostInstanceID_Clear = 1 THEN NULL ELSE ISNULL(@HostInstanceID, NULL) END,
                CASE WHEN @Config_Clear = 1 THEN NULL ELSE ISNULL(@Config, NULL) END,
                ISNULL(@LastActiveAt, sysdatetimeoffset()),
                CASE WHEN @ClosedAt_Clear = 1 THEN NULL ELSE ISNULL(@ClosedAt, NULL) END,
                CASE WHEN @CloseReason_Clear = 1 THEN NULL ELSE ISNULL(@CloseReason, NULL) END,
                CASE WHEN @RecordingMedia_Clear = 1 THEN NULL ELSE ISNULL(@RecordingMedia, NULL) END,
                CASE WHEN @RecordingStartedAt_Clear = 1 THEN NULL ELSE ISNULL(@RecordingStartedAt, NULL) END,
                CASE WHEN @RecordingFileID_Clear = 1 THEN NULL ELSE ISNULL(@RecordingFileID, NULL) END,
                CASE WHEN @LinkedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedEntityID, NULL) END,
                CASE WHEN @LinkedRecordID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedRecordID, NULL) END,
                CASE WHEN @RecordingStatus_Clear = 1 THEN NULL ELSE ISNULL(@RecordingStatus, NULL) END,
                CASE WHEN @RecordingExpectedShards_Clear = 1 THEN NULL ELSE ISNULL(@RecordingExpectedShards, NULL) END,
                CASE WHEN @RecordingCapturedSamples_Clear = 1 THEN NULL ELSE ISNULL(@RecordingCapturedSamples, NULL) END,
                CASE WHEN @RecordingGaps_Clear = 1 THEN NULL ELSE ISNULL(@RecordingGaps, NULL) END,
                ISNULL(@RecordingAssemblyVersion, 0)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentSession]
            (
                [AgentID],
                [UserID],
                [Status],
                [ConversationID],
                [LastSessionID],
                [HostInstanceID],
                [Config],
                [LastActiveAt],
                [ClosedAt],
                [CloseReason],
                [RecordingMedia],
                [RecordingStartedAt],
                [RecordingFileID],
                [LinkedEntityID],
                [LinkedRecordID],
                [RecordingStatus],
                [RecordingExpectedShards],
                [RecordingCapturedSamples],
                [RecordingGaps],
                [RecordingAssemblyVersion]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @UserID,
                ISNULL(@Status, 'Active'),
                CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, NULL) END,
                CASE WHEN @LastSessionID_Clear = 1 THEN NULL ELSE ISNULL(@LastSessionID, NULL) END,
                CASE WHEN @HostInstanceID_Clear = 1 THEN NULL ELSE ISNULL(@HostInstanceID, NULL) END,
                CASE WHEN @Config_Clear = 1 THEN NULL ELSE ISNULL(@Config, NULL) END,
                ISNULL(@LastActiveAt, sysdatetimeoffset()),
                CASE WHEN @ClosedAt_Clear = 1 THEN NULL ELSE ISNULL(@ClosedAt, NULL) END,
                CASE WHEN @CloseReason_Clear = 1 THEN NULL ELSE ISNULL(@CloseReason, NULL) END,
                CASE WHEN @RecordingMedia_Clear = 1 THEN NULL ELSE ISNULL(@RecordingMedia, NULL) END,
                CASE WHEN @RecordingStartedAt_Clear = 1 THEN NULL ELSE ISNULL(@RecordingStartedAt, NULL) END,
                CASE WHEN @RecordingFileID_Clear = 1 THEN NULL ELSE ISNULL(@RecordingFileID, NULL) END,
                CASE WHEN @LinkedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedEntityID, NULL) END,
                CASE WHEN @LinkedRecordID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedRecordID, NULL) END,
                CASE WHEN @RecordingStatus_Clear = 1 THEN NULL ELSE ISNULL(@RecordingStatus, NULL) END,
                CASE WHEN @RecordingExpectedShards_Clear = 1 THEN NULL ELSE ISNULL(@RecordingExpectedShards, NULL) END,
                CASE WHEN @RecordingCapturedSamples_Clear = 1 THEN NULL ELSE ISNULL(@RecordingCapturedSamples, NULL) END,
                CASE WHEN @RecordingGaps_Clear = 1 THEN NULL ELSE ISNULL(@RecordingGaps, NULL) END,
                ISNULL(@RecordingAssemblyVersion, 0)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentSessions] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSession] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: AI Agent Sessions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentSession] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: AI Agent Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: spUpdateAIAgentSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentSession]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier = NULL,
    @UserID uniqueidentifier = NULL,
    @Status nvarchar(20) = NULL,
    @ConversationID_Clear bit = 0,
    @ConversationID uniqueidentifier = NULL,
    @LastSessionID_Clear bit = 0,
    @LastSessionID uniqueidentifier = NULL,
    @HostInstanceID_Clear bit = 0,
    @HostInstanceID nvarchar(200) = NULL,
    @Config_Clear bit = 0,
    @Config nvarchar(MAX) = NULL,
    @LastActiveAt datetimeoffset = NULL,
    @ClosedAt_Clear bit = 0,
    @ClosedAt datetimeoffset = NULL,
    @CloseReason_Clear bit = 0,
    @CloseReason nvarchar(20) = NULL,
    @RecordingMedia_Clear bit = 0,
    @RecordingMedia nvarchar(20) = NULL,
    @RecordingStartedAt_Clear bit = 0,
    @RecordingStartedAt datetimeoffset = NULL,
    @RecordingFileID_Clear bit = 0,
    @RecordingFileID uniqueidentifier = NULL,
    @LinkedEntityID_Clear bit = 0,
    @LinkedEntityID uniqueidentifier = NULL,
    @LinkedRecordID_Clear bit = 0,
    @LinkedRecordID nvarchar(500) = NULL,
    @RecordingStatus_Clear bit = 0,
    @RecordingStatus nvarchar(20) = NULL,
    @RecordingExpectedShards_Clear bit = 0,
    @RecordingExpectedShards int = NULL,
    @RecordingCapturedSamples_Clear bit = 0,
    @RecordingCapturedSamples bigint = NULL,
    @RecordingGaps_Clear bit = 0,
    @RecordingGaps nvarchar(MAX) = NULL,
    @RecordingAssemblyVersion int = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentSession]
    SET
        [AgentID] = ISNULL(@AgentID, [AgentID]),
        [UserID] = ISNULL(@UserID, [UserID]),
        [Status] = ISNULL(@Status, [Status]),
        [ConversationID] = CASE WHEN @ConversationID_Clear = 1 THEN NULL ELSE ISNULL(@ConversationID, [ConversationID]) END,
        [LastSessionID] = CASE WHEN @LastSessionID_Clear = 1 THEN NULL ELSE ISNULL(@LastSessionID, [LastSessionID]) END,
        [HostInstanceID] = CASE WHEN @HostInstanceID_Clear = 1 THEN NULL ELSE ISNULL(@HostInstanceID, [HostInstanceID]) END,
        [Config] = CASE WHEN @Config_Clear = 1 THEN NULL ELSE ISNULL(@Config, [Config]) END,
        [LastActiveAt] = ISNULL(@LastActiveAt, [LastActiveAt]),
        [ClosedAt] = CASE WHEN @ClosedAt_Clear = 1 THEN NULL ELSE ISNULL(@ClosedAt, [ClosedAt]) END,
        [CloseReason] = CASE WHEN @CloseReason_Clear = 1 THEN NULL ELSE ISNULL(@CloseReason, [CloseReason]) END,
        [RecordingMedia] = CASE WHEN @RecordingMedia_Clear = 1 THEN NULL ELSE ISNULL(@RecordingMedia, [RecordingMedia]) END,
        [RecordingStartedAt] = CASE WHEN @RecordingStartedAt_Clear = 1 THEN NULL ELSE ISNULL(@RecordingStartedAt, [RecordingStartedAt]) END,
        [RecordingFileID] = CASE WHEN @RecordingFileID_Clear = 1 THEN NULL ELSE ISNULL(@RecordingFileID, [RecordingFileID]) END,
        [LinkedEntityID] = CASE WHEN @LinkedEntityID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedEntityID, [LinkedEntityID]) END,
        [LinkedRecordID] = CASE WHEN @LinkedRecordID_Clear = 1 THEN NULL ELSE ISNULL(@LinkedRecordID, [LinkedRecordID]) END,
        [RecordingStatus] = CASE WHEN @RecordingStatus_Clear = 1 THEN NULL ELSE ISNULL(@RecordingStatus, [RecordingStatus]) END,
        [RecordingExpectedShards] = CASE WHEN @RecordingExpectedShards_Clear = 1 THEN NULL ELSE ISNULL(@RecordingExpectedShards, [RecordingExpectedShards]) END,
        [RecordingCapturedSamples] = CASE WHEN @RecordingCapturedSamples_Clear = 1 THEN NULL ELSE ISNULL(@RecordingCapturedSamples, [RecordingCapturedSamples]) END,
        [RecordingGaps] = CASE WHEN @RecordingGaps_Clear = 1 THEN NULL ELSE ISNULL(@RecordingGaps, [RecordingGaps]) END,
        [RecordingAssemblyVersion] = ISNULL(@RecordingAssemblyVersion, [RecordingAssemblyVersion])
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentSessions] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentSessions]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSession] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentSession table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentSession]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentSession];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentSession
ON [${flyway:defaultSchema}].[AIAgentSession]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentSession]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentSession] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: AI Agent Sessions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentSession] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: AI Agent Sessions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Sessions
-- Item: spDeleteAIAgentSession
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentSession
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentSession]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentSession];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentSession]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentSession]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSession] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agent Sessions */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSession] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSession] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentSession] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: spDeleteConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Conversation
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversation];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample
    DECLARE @MJAIAgentExamples_SourceConversationIDID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_UserID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_Type nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationID_ExampleInput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_ExampleOutput nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_IsAutoGenerated bit
    DECLARE @MJAIAgentExamples_SourceConversationID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_SuccessScore decimal(5, 2)
    DECLARE @MJAIAgentExamples_SourceConversationID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_Status nvarchar(20)
    DECLARE @MJAIAgentExamples_SourceConversationID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentExamples_SourceConversationID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentExamples_SourceConversationID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceConversationID_AccessCount int
    DECLARE @MJAIAgentExamples_SourceConversationID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentExamples_SourceConversationID_EmbeddingVectorBinary varbinary(MAX)
    DECLARE cascade_update_MJAIAgentExamples_SourceConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [CompanyID], [Type], [ExampleInput], [ExampleOutput], [IsAutoGenerated], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [SuccessScore], [Comments], [Status], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [EmbeddingVectorBinary]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [SourceConversationID] = @ID

    OPEN cascade_update_MJAIAgentExamples_SourceConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationID_cursor INTO @MJAIAgentExamples_SourceConversationIDID, @MJAIAgentExamples_SourceConversationID_AgentID, @MJAIAgentExamples_SourceConversationID_UserID, @MJAIAgentExamples_SourceConversationID_CompanyID, @MJAIAgentExamples_SourceConversationID_Type, @MJAIAgentExamples_SourceConversationID_ExampleInput, @MJAIAgentExamples_SourceConversationID_ExampleOutput, @MJAIAgentExamples_SourceConversationID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationID_SourceConversationID, @MJAIAgentExamples_SourceConversationID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationID_SuccessScore, @MJAIAgentExamples_SourceConversationID_Comments, @MJAIAgentExamples_SourceConversationID_Status, @MJAIAgentExamples_SourceConversationID_EmbeddingVector, @MJAIAgentExamples_SourceConversationID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationID_SecondaryScopes, @MJAIAgentExamples_SourceConversationID_LastAccessedAt, @MJAIAgentExamples_SourceConversationID_AccessCount, @MJAIAgentExamples_SourceConversationID_ExpiresAt, @MJAIAgentExamples_SourceConversationID_EmbeddingVectorBinary

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentExamples_SourceConversationID_SourceConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentExample] @ID = @MJAIAgentExamples_SourceConversationIDID, @AgentID = @MJAIAgentExamples_SourceConversationID_AgentID, @UserID = @MJAIAgentExamples_SourceConversationID_UserID, @CompanyID = @MJAIAgentExamples_SourceConversationID_CompanyID, @Type = @MJAIAgentExamples_SourceConversationID_Type, @ExampleInput = @MJAIAgentExamples_SourceConversationID_ExampleInput, @ExampleOutput = @MJAIAgentExamples_SourceConversationID_ExampleOutput, @IsAutoGenerated = @MJAIAgentExamples_SourceConversationID_IsAutoGenerated, @SourceConversationID_Clear = 1, @SourceConversationID = @MJAIAgentExamples_SourceConversationID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentExamples_SourceConversationID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID, @SuccessScore = @MJAIAgentExamples_SourceConversationID_SuccessScore, @Comments = @MJAIAgentExamples_SourceConversationID_Comments, @Status = @MJAIAgentExamples_SourceConversationID_Status, @EmbeddingVector = @MJAIAgentExamples_SourceConversationID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentExamples_SourceConversationID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentExamples_SourceConversationID_SecondaryScopes, @LastAccessedAt = @MJAIAgentExamples_SourceConversationID_LastAccessedAt, @AccessCount = @MJAIAgentExamples_SourceConversationID_AccessCount, @ExpiresAt = @MJAIAgentExamples_SourceConversationID_ExpiresAt, @EmbeddingVectorBinary = @MJAIAgentExamples_SourceConversationID_EmbeddingVectorBinary

        FETCH NEXT FROM cascade_update_MJAIAgentExamples_SourceConversationID_cursor INTO @MJAIAgentExamples_SourceConversationIDID, @MJAIAgentExamples_SourceConversationID_AgentID, @MJAIAgentExamples_SourceConversationID_UserID, @MJAIAgentExamples_SourceConversationID_CompanyID, @MJAIAgentExamples_SourceConversationID_Type, @MJAIAgentExamples_SourceConversationID_ExampleInput, @MJAIAgentExamples_SourceConversationID_ExampleOutput, @MJAIAgentExamples_SourceConversationID_IsAutoGenerated, @MJAIAgentExamples_SourceConversationID_SourceConversationID, @MJAIAgentExamples_SourceConversationID_SourceConversationDetailID, @MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID, @MJAIAgentExamples_SourceConversationID_SuccessScore, @MJAIAgentExamples_SourceConversationID_Comments, @MJAIAgentExamples_SourceConversationID_Status, @MJAIAgentExamples_SourceConversationID_EmbeddingVector, @MJAIAgentExamples_SourceConversationID_EmbeddingModelID, @MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentExamples_SourceConversationID_SecondaryScopes, @MJAIAgentExamples_SourceConversationID_LastAccessedAt, @MJAIAgentExamples_SourceConversationID_AccessCount, @MJAIAgentExamples_SourceConversationID_ExpiresAt, @MJAIAgentExamples_SourceConversationID_EmbeddingVectorBinary
    END

    CLOSE cascade_update_MJAIAgentExamples_SourceConversationID_cursor
    DEALLOCATE cascade_update_MJAIAgentExamples_SourceConversationID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_SourceConversationIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_SourceConversationID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_SourceConversationID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationID_AccessCount int
    DECLARE @MJAIAgentNotes_SourceConversationID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_SourceConversationID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_SourceConversationID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationID_ImportanceScore decimal(5, 2)
    DECLARE @MJAIAgentNotes_SourceConversationID_AuthorType nvarchar(20)
    DECLARE @MJAIAgentNotes_SourceConversationID_EmbeddingVectorBinary varbinary(MAX)
    DECLARE cascade_update_MJAIAgentNotes_SourceConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore], [AuthorType], [EmbeddingVectorBinary]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [SourceConversationID] = @ID

    OPEN cascade_update_MJAIAgentNotes_SourceConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationID_cursor INTO @MJAIAgentNotes_SourceConversationIDID, @MJAIAgentNotes_SourceConversationID_AgentID, @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationID_Note, @MJAIAgentNotes_SourceConversationID_UserID, @MJAIAgentNotes_SourceConversationID_Type, @MJAIAgentNotes_SourceConversationID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationID_Comments, @MJAIAgentNotes_SourceConversationID_Status, @MJAIAgentNotes_SourceConversationID_SourceConversationID, @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationID_CompanyID, @MJAIAgentNotes_SourceConversationID_EmbeddingVector, @MJAIAgentNotes_SourceConversationID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationID_SecondaryScopes, @MJAIAgentNotes_SourceConversationID_LastAccessedAt, @MJAIAgentNotes_SourceConversationID_AccessCount, @MJAIAgentNotes_SourceConversationID_ExpiresAt, @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationID_ConsolidationCount, @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationID_ProtectionTier, @MJAIAgentNotes_SourceConversationID_ImportanceScore, @MJAIAgentNotes_SourceConversationID_AuthorType, @MJAIAgentNotes_SourceConversationID_EmbeddingVectorBinary

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_SourceConversationID_SourceConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_SourceConversationIDID, @AgentID = @MJAIAgentNotes_SourceConversationID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, @Note = @MJAIAgentNotes_SourceConversationID_Note, @UserID = @MJAIAgentNotes_SourceConversationID_UserID, @Type = @MJAIAgentNotes_SourceConversationID_Type, @IsAutoGenerated = @MJAIAgentNotes_SourceConversationID_IsAutoGenerated, @Comments = @MJAIAgentNotes_SourceConversationID_Comments, @Status = @MJAIAgentNotes_SourceConversationID_Status, @SourceConversationID_Clear = 1, @SourceConversationID = @MJAIAgentNotes_SourceConversationID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_SourceConversationID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_SourceConversationID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_SourceConversationID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_SourceConversationID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_SourceConversationID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_SourceConversationID_AccessCount, @ExpiresAt = @MJAIAgentNotes_SourceConversationID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_SourceConversationID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_SourceConversationID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_SourceConversationID_ImportanceScore, @AuthorType = @MJAIAgentNotes_SourceConversationID_AuthorType, @EmbeddingVectorBinary = @MJAIAgentNotes_SourceConversationID_EmbeddingVectorBinary

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_SourceConversationID_cursor INTO @MJAIAgentNotes_SourceConversationIDID, @MJAIAgentNotes_SourceConversationID_AgentID, @MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, @MJAIAgentNotes_SourceConversationID_Note, @MJAIAgentNotes_SourceConversationID_UserID, @MJAIAgentNotes_SourceConversationID_Type, @MJAIAgentNotes_SourceConversationID_IsAutoGenerated, @MJAIAgentNotes_SourceConversationID_Comments, @MJAIAgentNotes_SourceConversationID_Status, @MJAIAgentNotes_SourceConversationID_SourceConversationID, @MJAIAgentNotes_SourceConversationID_SourceConversationDetailID, @MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, @MJAIAgentNotes_SourceConversationID_CompanyID, @MJAIAgentNotes_SourceConversationID_EmbeddingVector, @MJAIAgentNotes_SourceConversationID_EmbeddingModelID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, @MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, @MJAIAgentNotes_SourceConversationID_SecondaryScopes, @MJAIAgentNotes_SourceConversationID_LastAccessedAt, @MJAIAgentNotes_SourceConversationID_AccessCount, @MJAIAgentNotes_SourceConversationID_ExpiresAt, @MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, @MJAIAgentNotes_SourceConversationID_ConsolidationCount, @MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, @MJAIAgentNotes_SourceConversationID_ProtectionTier, @MJAIAgentNotes_SourceConversationID_ImportanceScore, @MJAIAgentNotes_SourceConversationID_AuthorType, @MJAIAgentNotes_SourceConversationID_EmbeddingVectorBinary
    END

    CLOSE cascade_update_MJAIAgentNotes_SourceConversationID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_SourceConversationID_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJAIAgentRuns_ConversationIDID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_ParentRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_Status nvarchar(50)
    DECLARE @MJAIAgentRuns_ConversationID_StartedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationID_CompletedAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationID_Success bit
    DECLARE @MJAIAgentRuns_ConversationID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_UserID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_Result nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_AgentState nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_TotalTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCost decimal(19, 8)
    DECLARE @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCostRollup decimal(19, 8)
    DECLARE @MJAIAgentRuns_ConversationID_ConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_ConversationDetailSequence int
    DECLARE @MJAIAgentRuns_ConversationID_CancellationReason nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationID_FinalStep nvarchar(30)
    DECLARE @MJAIAgentRuns_ConversationID_FinalPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_Message nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_LastRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_StartingPayload nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_TotalPromptIterations int
    DECLARE @MJAIAgentRuns_ConversationID_ConfigurationID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_OverrideModelID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_OverrideVendorID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_Data nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_Verbose bit
    DECLARE @MJAIAgentRuns_ConversationID_EffortLevel int
    DECLARE @MJAIAgentRuns_ConversationID_RunName nvarchar(255)
    DECLARE @MJAIAgentRuns_ConversationID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_ScheduledJobRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_TestRunID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentRuns_ConversationID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentRuns_ConversationID_ExternalReferenceID nvarchar(200)
    DECLARE @MJAIAgentRuns_ConversationID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed int
    DECLARE @MJAIAgentRuns_ConversationID_LastHeartbeatAt datetimeoffset
    DECLARE @MJAIAgentRuns_ConversationID_AgentSessionID uniqueidentifier
    DECLARE @MJAIAgentRuns_ConversationID_PlanMode bit
    DECLARE @MJAIAgentRuns_ConversationID_ExternalSessionID nvarchar(255)
    DECLARE @MJAIAgentRuns_ConversationID_ContinuationDepth int
    DECLARE cascade_update_MJAIAgentRuns_ConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID], [TestRunID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [ExternalReferenceID], [CompanyID], [TotalCacheReadTokensUsed], [TotalCacheWriteTokensUsed], [LastHeartbeatAt], [AgentSessionID], [PlanMode], [ExternalSessionID], [ContinuationDepth]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJAIAgentRuns_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationID_cursor INTO @MJAIAgentRuns_ConversationIDID, @MJAIAgentRuns_ConversationID_AgentID, @MJAIAgentRuns_ConversationID_ParentRunID, @MJAIAgentRuns_ConversationID_Status, @MJAIAgentRuns_ConversationID_StartedAt, @MJAIAgentRuns_ConversationID_CompletedAt, @MJAIAgentRuns_ConversationID_Success, @MJAIAgentRuns_ConversationID_ErrorMessage, @MJAIAgentRuns_ConversationID_ConversationID, @MJAIAgentRuns_ConversationID_UserID, @MJAIAgentRuns_ConversationID_Result, @MJAIAgentRuns_ConversationID_AgentState, @MJAIAgentRuns_ConversationID_TotalTokensUsed, @MJAIAgentRuns_ConversationID_TotalCost, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCostRollup, @MJAIAgentRuns_ConversationID_ConversationDetailID, @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @MJAIAgentRuns_ConversationID_CancellationReason, @MJAIAgentRuns_ConversationID_FinalStep, @MJAIAgentRuns_ConversationID_FinalPayload, @MJAIAgentRuns_ConversationID_Message, @MJAIAgentRuns_ConversationID_LastRunID, @MJAIAgentRuns_ConversationID_StartingPayload, @MJAIAgentRuns_ConversationID_TotalPromptIterations, @MJAIAgentRuns_ConversationID_ConfigurationID, @MJAIAgentRuns_ConversationID_OverrideModelID, @MJAIAgentRuns_ConversationID_OverrideVendorID, @MJAIAgentRuns_ConversationID_Data, @MJAIAgentRuns_ConversationID_Verbose, @MJAIAgentRuns_ConversationID_EffortLevel, @MJAIAgentRuns_ConversationID_RunName, @MJAIAgentRuns_ConversationID_Comments, @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @MJAIAgentRuns_ConversationID_TestRunID, @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationID_SecondaryScopes, @MJAIAgentRuns_ConversationID_ExternalReferenceID, @MJAIAgentRuns_ConversationID_CompanyID, @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationID_LastHeartbeatAt, @MJAIAgentRuns_ConversationID_AgentSessionID, @MJAIAgentRuns_ConversationID_PlanMode, @MJAIAgentRuns_ConversationID_ExternalSessionID, @MJAIAgentRuns_ConversationID_ContinuationDepth

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentRuns_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJAIAgentRuns_ConversationIDID, @AgentID = @MJAIAgentRuns_ConversationID_AgentID, @ParentRunID = @MJAIAgentRuns_ConversationID_ParentRunID, @Status = @MJAIAgentRuns_ConversationID_Status, @StartedAt = @MJAIAgentRuns_ConversationID_StartedAt, @CompletedAt = @MJAIAgentRuns_ConversationID_CompletedAt, @Success = @MJAIAgentRuns_ConversationID_Success, @ErrorMessage = @MJAIAgentRuns_ConversationID_ErrorMessage, @ConversationID_Clear = 1, @ConversationID = @MJAIAgentRuns_ConversationID_ConversationID, @UserID = @MJAIAgentRuns_ConversationID_UserID, @Result = @MJAIAgentRuns_ConversationID_Result, @AgentState = @MJAIAgentRuns_ConversationID_AgentState, @TotalTokensUsed = @MJAIAgentRuns_ConversationID_TotalTokensUsed, @TotalCost = @MJAIAgentRuns_ConversationID_TotalCost, @TotalPromptTokensUsed = @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJAIAgentRuns_ConversationID_TotalCostRollup, @ConversationDetailID = @MJAIAgentRuns_ConversationID_ConversationDetailID, @ConversationDetailSequence = @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @CancellationReason = @MJAIAgentRuns_ConversationID_CancellationReason, @FinalStep = @MJAIAgentRuns_ConversationID_FinalStep, @FinalPayload = @MJAIAgentRuns_ConversationID_FinalPayload, @Message = @MJAIAgentRuns_ConversationID_Message, @LastRunID = @MJAIAgentRuns_ConversationID_LastRunID, @StartingPayload = @MJAIAgentRuns_ConversationID_StartingPayload, @TotalPromptIterations = @MJAIAgentRuns_ConversationID_TotalPromptIterations, @ConfigurationID = @MJAIAgentRuns_ConversationID_ConfigurationID, @OverrideModelID = @MJAIAgentRuns_ConversationID_OverrideModelID, @OverrideVendorID = @MJAIAgentRuns_ConversationID_OverrideVendorID, @Data = @MJAIAgentRuns_ConversationID_Data, @Verbose = @MJAIAgentRuns_ConversationID_Verbose, @EffortLevel = @MJAIAgentRuns_ConversationID_EffortLevel, @RunName = @MJAIAgentRuns_ConversationID_RunName, @Comments = @MJAIAgentRuns_ConversationID_Comments, @ScheduledJobRunID = @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @TestRunID = @MJAIAgentRuns_ConversationID_TestRunID, @PrimaryScopeEntityID = @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentRuns_ConversationID_SecondaryScopes, @ExternalReferenceID = @MJAIAgentRuns_ConversationID_ExternalReferenceID, @CompanyID = @MJAIAgentRuns_ConversationID_CompanyID, @TotalCacheReadTokensUsed = @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @TotalCacheWriteTokensUsed = @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, @LastHeartbeatAt = @MJAIAgentRuns_ConversationID_LastHeartbeatAt, @AgentSessionID = @MJAIAgentRuns_ConversationID_AgentSessionID, @PlanMode = @MJAIAgentRuns_ConversationID_PlanMode, @ExternalSessionID = @MJAIAgentRuns_ConversationID_ExternalSessionID, @ContinuationDepth = @MJAIAgentRuns_ConversationID_ContinuationDepth

        FETCH NEXT FROM cascade_update_MJAIAgentRuns_ConversationID_cursor INTO @MJAIAgentRuns_ConversationIDID, @MJAIAgentRuns_ConversationID_AgentID, @MJAIAgentRuns_ConversationID_ParentRunID, @MJAIAgentRuns_ConversationID_Status, @MJAIAgentRuns_ConversationID_StartedAt, @MJAIAgentRuns_ConversationID_CompletedAt, @MJAIAgentRuns_ConversationID_Success, @MJAIAgentRuns_ConversationID_ErrorMessage, @MJAIAgentRuns_ConversationID_ConversationID, @MJAIAgentRuns_ConversationID_UserID, @MJAIAgentRuns_ConversationID_Result, @MJAIAgentRuns_ConversationID_AgentState, @MJAIAgentRuns_ConversationID_TotalTokensUsed, @MJAIAgentRuns_ConversationID_TotalCost, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, @MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, @MJAIAgentRuns_ConversationID_TotalCostRollup, @MJAIAgentRuns_ConversationID_ConversationDetailID, @MJAIAgentRuns_ConversationID_ConversationDetailSequence, @MJAIAgentRuns_ConversationID_CancellationReason, @MJAIAgentRuns_ConversationID_FinalStep, @MJAIAgentRuns_ConversationID_FinalPayload, @MJAIAgentRuns_ConversationID_Message, @MJAIAgentRuns_ConversationID_LastRunID, @MJAIAgentRuns_ConversationID_StartingPayload, @MJAIAgentRuns_ConversationID_TotalPromptIterations, @MJAIAgentRuns_ConversationID_ConfigurationID, @MJAIAgentRuns_ConversationID_OverrideModelID, @MJAIAgentRuns_ConversationID_OverrideVendorID, @MJAIAgentRuns_ConversationID_Data, @MJAIAgentRuns_ConversationID_Verbose, @MJAIAgentRuns_ConversationID_EffortLevel, @MJAIAgentRuns_ConversationID_RunName, @MJAIAgentRuns_ConversationID_Comments, @MJAIAgentRuns_ConversationID_ScheduledJobRunID, @MJAIAgentRuns_ConversationID_TestRunID, @MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, @MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, @MJAIAgentRuns_ConversationID_SecondaryScopes, @MJAIAgentRuns_ConversationID_ExternalReferenceID, @MJAIAgentRuns_ConversationID_CompanyID, @MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, @MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, @MJAIAgentRuns_ConversationID_LastHeartbeatAt, @MJAIAgentRuns_ConversationID_AgentSessionID, @MJAIAgentRuns_ConversationID_PlanMode, @MJAIAgentRuns_ConversationID_ExternalSessionID, @MJAIAgentRuns_ConversationID_ContinuationDepth
    END

    CLOSE cascade_update_MJAIAgentRuns_ConversationID_cursor
    DEALLOCATE cascade_update_MJAIAgentRuns_ConversationID_cursor
    
    -- Cascade update on AIAgentSession using cursor to call spUpdateAIAgentSession
    DECLARE @MJAIAgentSessions_ConversationIDID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_UserID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_Status nvarchar(20)
    DECLARE @MJAIAgentSessions_ConversationID_ConversationID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_LastSessionID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_HostInstanceID nvarchar(200)
    DECLARE @MJAIAgentSessions_ConversationID_Config nvarchar(MAX)
    DECLARE @MJAIAgentSessions_ConversationID_LastActiveAt datetimeoffset
    DECLARE @MJAIAgentSessions_ConversationID_ClosedAt datetimeoffset
    DECLARE @MJAIAgentSessions_ConversationID_CloseReason nvarchar(20)
    DECLARE @MJAIAgentSessions_ConversationID_RecordingMedia nvarchar(20)
    DECLARE @MJAIAgentSessions_ConversationID_RecordingStartedAt datetimeoffset
    DECLARE @MJAIAgentSessions_ConversationID_RecordingFileID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_LinkedEntityID uniqueidentifier
    DECLARE @MJAIAgentSessions_ConversationID_LinkedRecordID nvarchar(500)
    DECLARE @MJAIAgentSessions_ConversationID_RecordingStatus nvarchar(20)
    DECLARE @MJAIAgentSessions_ConversationID_RecordingExpectedShards int
    DECLARE @MJAIAgentSessions_ConversationID_RecordingCapturedSamples bigint
    DECLARE @MJAIAgentSessions_ConversationID_RecordingGaps nvarchar(MAX)
    DECLARE @MJAIAgentSessions_ConversationID_RecordingAssemblyVersion int
    DECLARE cascade_update_MJAIAgentSessions_ConversationID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [UserID], [Status], [ConversationID], [LastSessionID], [HostInstanceID], [Config], [LastActiveAt], [ClosedAt], [CloseReason], [RecordingMedia], [RecordingStartedAt], [RecordingFileID], [LinkedEntityID], [LinkedRecordID], [RecordingStatus], [RecordingExpectedShards], [RecordingCapturedSamples], [RecordingGaps], [RecordingAssemblyVersion]
        FROM [${flyway:defaultSchema}].[AIAgentSession]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJAIAgentSessions_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSessions_ConversationID_cursor INTO @MJAIAgentSessions_ConversationIDID, @MJAIAgentSessions_ConversationID_AgentID, @MJAIAgentSessions_ConversationID_UserID, @MJAIAgentSessions_ConversationID_Status, @MJAIAgentSessions_ConversationID_ConversationID, @MJAIAgentSessions_ConversationID_LastSessionID, @MJAIAgentSessions_ConversationID_HostInstanceID, @MJAIAgentSessions_ConversationID_Config, @MJAIAgentSessions_ConversationID_LastActiveAt, @MJAIAgentSessions_ConversationID_ClosedAt, @MJAIAgentSessions_ConversationID_CloseReason, @MJAIAgentSessions_ConversationID_RecordingMedia, @MJAIAgentSessions_ConversationID_RecordingStartedAt, @MJAIAgentSessions_ConversationID_RecordingFileID, @MJAIAgentSessions_ConversationID_LinkedEntityID, @MJAIAgentSessions_ConversationID_LinkedRecordID, @MJAIAgentSessions_ConversationID_RecordingStatus, @MJAIAgentSessions_ConversationID_RecordingExpectedShards, @MJAIAgentSessions_ConversationID_RecordingCapturedSamples, @MJAIAgentSessions_ConversationID_RecordingGaps, @MJAIAgentSessions_ConversationID_RecordingAssemblyVersion

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSessions_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentSession] @ID = @MJAIAgentSessions_ConversationIDID, @AgentID = @MJAIAgentSessions_ConversationID_AgentID, @UserID = @MJAIAgentSessions_ConversationID_UserID, @Status = @MJAIAgentSessions_ConversationID_Status, @ConversationID_Clear = 1, @ConversationID = @MJAIAgentSessions_ConversationID_ConversationID, @LastSessionID = @MJAIAgentSessions_ConversationID_LastSessionID, @HostInstanceID = @MJAIAgentSessions_ConversationID_HostInstanceID, @Config = @MJAIAgentSessions_ConversationID_Config, @LastActiveAt = @MJAIAgentSessions_ConversationID_LastActiveAt, @ClosedAt = @MJAIAgentSessions_ConversationID_ClosedAt, @CloseReason = @MJAIAgentSessions_ConversationID_CloseReason, @RecordingMedia = @MJAIAgentSessions_ConversationID_RecordingMedia, @RecordingStartedAt = @MJAIAgentSessions_ConversationID_RecordingStartedAt, @RecordingFileID = @MJAIAgentSessions_ConversationID_RecordingFileID, @LinkedEntityID = @MJAIAgentSessions_ConversationID_LinkedEntityID, @LinkedRecordID = @MJAIAgentSessions_ConversationID_LinkedRecordID, @RecordingStatus = @MJAIAgentSessions_ConversationID_RecordingStatus, @RecordingExpectedShards = @MJAIAgentSessions_ConversationID_RecordingExpectedShards, @RecordingCapturedSamples = @MJAIAgentSessions_ConversationID_RecordingCapturedSamples, @RecordingGaps = @MJAIAgentSessions_ConversationID_RecordingGaps, @RecordingAssemblyVersion = @MJAIAgentSessions_ConversationID_RecordingAssemblyVersion

        FETCH NEXT FROM cascade_update_MJAIAgentSessions_ConversationID_cursor INTO @MJAIAgentSessions_ConversationIDID, @MJAIAgentSessions_ConversationID_AgentID, @MJAIAgentSessions_ConversationID_UserID, @MJAIAgentSessions_ConversationID_Status, @MJAIAgentSessions_ConversationID_ConversationID, @MJAIAgentSessions_ConversationID_LastSessionID, @MJAIAgentSessions_ConversationID_HostInstanceID, @MJAIAgentSessions_ConversationID_Config, @MJAIAgentSessions_ConversationID_LastActiveAt, @MJAIAgentSessions_ConversationID_ClosedAt, @MJAIAgentSessions_ConversationID_CloseReason, @MJAIAgentSessions_ConversationID_RecordingMedia, @MJAIAgentSessions_ConversationID_RecordingStartedAt, @MJAIAgentSessions_ConversationID_RecordingFileID, @MJAIAgentSessions_ConversationID_LinkedEntityID, @MJAIAgentSessions_ConversationID_LinkedRecordID, @MJAIAgentSessions_ConversationID_RecordingStatus, @MJAIAgentSessions_ConversationID_RecordingExpectedShards, @MJAIAgentSessions_ConversationID_RecordingCapturedSamples, @MJAIAgentSessions_ConversationID_RecordingGaps, @MJAIAgentSessions_ConversationID_RecordingAssemblyVersion
    END

    CLOSE cascade_update_MJAIAgentSessions_ConversationID_cursor
    DEALLOCATE cascade_update_MJAIAgentSessions_ConversationID_cursor
    
    -- Cascade delete from ConversationArtifact using cursor to call spDeleteConversationArtifact
    DECLARE @MJConversationArtifacts_ConversationIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationArtifacts_ConversationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifact]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_MJConversationArtifacts_ConversationID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationArtifacts_ConversationID_cursor INTO @MJConversationArtifacts_ConversationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifact] @ID = @MJConversationArtifacts_ConversationIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationArtifacts_ConversationID_cursor INTO @MJConversationArtifacts_ConversationIDID
    END
    
    CLOSE cascade_delete_MJConversationArtifacts_ConversationID_cursor
    DEALLOCATE cascade_delete_MJConversationArtifacts_ConversationID_cursor
    
    -- Cascade delete from ConversationDetail using cursor to call spDeleteConversationDetail
    DECLARE @MJConversationDetails_ConversationIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationDetails_ConversationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_MJConversationDetails_ConversationID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationDetails_ConversationID_cursor INTO @MJConversationDetails_ConversationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetail] @ID = @MJConversationDetails_ConversationIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationDetails_ConversationID_cursor INTO @MJConversationDetails_ConversationIDID
    END
    
    CLOSE cascade_delete_MJConversationDetails_ConversationID_cursor
    DEALLOCATE cascade_delete_MJConversationDetails_ConversationID_cursor
    
    -- Cascade delete from ConversationSkill using cursor to call spDeleteConversationSkill
    DECLARE @MJConversationSkills_ConversationIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationSkills_ConversationID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationSkill]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_MJConversationSkills_ConversationID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationSkills_ConversationID_cursor INTO @MJConversationSkills_ConversationIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationSkill] @ID = @MJConversationSkills_ConversationIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationSkills_ConversationID_cursor INTO @MJConversationSkills_ConversationIDID
    END
    
    CLOSE cascade_delete_MJConversationSkills_ConversationID_cursor
    DEALLOCATE cascade_delete_MJConversationSkills_ConversationID_cursor
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation
    DECLARE @MJConversations_LastConversationIDID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_UserID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_ExternalID nvarchar(500)
    DECLARE @MJConversations_LastConversationID_Name nvarchar(255)
    DECLARE @MJConversations_LastConversationID_Description nvarchar(MAX)
    DECLARE @MJConversations_LastConversationID_Type nvarchar(50)
    DECLARE @MJConversations_LastConversationID_IsArchived bit
    DECLARE @MJConversations_LastConversationID_LinkedEntityID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_LinkedRecordID nvarchar(500)
    DECLARE @MJConversations_LastConversationID_DataContextID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_Status nvarchar(20)
    DECLARE @MJConversations_LastConversationID_EnvironmentID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_ProjectID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_IsPinned bit
    DECLARE @MJConversations_LastConversationID_TestRunID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_ApplicationScope nvarchar(20)
    DECLARE @MJConversations_LastConversationID_ApplicationID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_DefaultAgentID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_AdditionalData nvarchar(MAX)
    DECLARE @MJConversations_LastConversationID_RecordingFileID uniqueidentifier
    DECLARE @MJConversations_LastConversationID_EgressID nvarchar(255)
    DECLARE @MJConversations_LastConversationID_VisitorKey nvarchar(255)
    DECLARE @MJConversations_LastConversationID_LastConversationID uniqueidentifier
    DECLARE cascade_update_MJConversations_LastConversationID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [Type], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData], [RecordingFileID], [EgressID], [VisitorKey], [LastConversationID]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [LastConversationID] = @ID

    OPEN cascade_update_MJConversations_LastConversationID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_LastConversationID_cursor INTO @MJConversations_LastConversationIDID, @MJConversations_LastConversationID_UserID, @MJConversations_LastConversationID_ExternalID, @MJConversations_LastConversationID_Name, @MJConversations_LastConversationID_Description, @MJConversations_LastConversationID_Type, @MJConversations_LastConversationID_IsArchived, @MJConversations_LastConversationID_LinkedEntityID, @MJConversations_LastConversationID_LinkedRecordID, @MJConversations_LastConversationID_DataContextID, @MJConversations_LastConversationID_Status, @MJConversations_LastConversationID_EnvironmentID, @MJConversations_LastConversationID_ProjectID, @MJConversations_LastConversationID_IsPinned, @MJConversations_LastConversationID_TestRunID, @MJConversations_LastConversationID_ApplicationScope, @MJConversations_LastConversationID_ApplicationID, @MJConversations_LastConversationID_DefaultAgentID, @MJConversations_LastConversationID_AdditionalData, @MJConversations_LastConversationID_RecordingFileID, @MJConversations_LastConversationID_EgressID, @MJConversations_LastConversationID_VisitorKey, @MJConversations_LastConversationID_LastConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_LastConversationID_LastConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_LastConversationIDID, @UserID = @MJConversations_LastConversationID_UserID, @ExternalID = @MJConversations_LastConversationID_ExternalID, @Name = @MJConversations_LastConversationID_Name, @Description = @MJConversations_LastConversationID_Description, @Type = @MJConversations_LastConversationID_Type, @IsArchived = @MJConversations_LastConversationID_IsArchived, @LinkedEntityID = @MJConversations_LastConversationID_LinkedEntityID, @LinkedRecordID = @MJConversations_LastConversationID_LinkedRecordID, @DataContextID = @MJConversations_LastConversationID_DataContextID, @Status = @MJConversations_LastConversationID_Status, @EnvironmentID = @MJConversations_LastConversationID_EnvironmentID, @ProjectID = @MJConversations_LastConversationID_ProjectID, @IsPinned = @MJConversations_LastConversationID_IsPinned, @TestRunID = @MJConversations_LastConversationID_TestRunID, @ApplicationScope = @MJConversations_LastConversationID_ApplicationScope, @ApplicationID = @MJConversations_LastConversationID_ApplicationID, @DefaultAgentID = @MJConversations_LastConversationID_DefaultAgentID, @AdditionalData = @MJConversations_LastConversationID_AdditionalData, @RecordingFileID = @MJConversations_LastConversationID_RecordingFileID, @EgressID = @MJConversations_LastConversationID_EgressID, @VisitorKey = @MJConversations_LastConversationID_VisitorKey, @LastConversationID_Clear = 1, @LastConversationID = @MJConversations_LastConversationID_LastConversationID

        FETCH NEXT FROM cascade_update_MJConversations_LastConversationID_cursor INTO @MJConversations_LastConversationIDID, @MJConversations_LastConversationID_UserID, @MJConversations_LastConversationID_ExternalID, @MJConversations_LastConversationID_Name, @MJConversations_LastConversationID_Description, @MJConversations_LastConversationID_Type, @MJConversations_LastConversationID_IsArchived, @MJConversations_LastConversationID_LinkedEntityID, @MJConversations_LastConversationID_LinkedRecordID, @MJConversations_LastConversationID_DataContextID, @MJConversations_LastConversationID_Status, @MJConversations_LastConversationID_EnvironmentID, @MJConversations_LastConversationID_ProjectID, @MJConversations_LastConversationID_IsPinned, @MJConversations_LastConversationID_TestRunID, @MJConversations_LastConversationID_ApplicationScope, @MJConversations_LastConversationID_ApplicationID, @MJConversations_LastConversationID_DefaultAgentID, @MJConversations_LastConversationID_AdditionalData, @MJConversations_LastConversationID_RecordingFileID, @MJConversations_LastConversationID_EgressID, @MJConversations_LastConversationID_VisitorKey, @MJConversations_LastConversationID_LastConversationID
    END

    CLOSE cascade_update_MJConversations_LastConversationID_cursor
    DEALLOCATE cascade_update_MJConversations_LastConversationID_cursor
    
    -- Cascade update on Meeting using cursor to call spUpdateMeeting
    DECLARE @MJMeetings_ConversationIDID uniqueidentifier
    DECLARE @MJMeetings_ConversationID_Title nvarchar(255)
    DECLARE @MJMeetings_ConversationID_Description nvarchar(MAX)
    DECLARE @MJMeetings_ConversationID_HostUserID uniqueidentifier
    DECLARE @MJMeetings_ConversationID_RoomName nvarchar(255)
    DECLARE @MJMeetings_ConversationID_Status nvarchar(20)
    DECLARE @MJMeetings_ConversationID_ScheduledStartAt datetimeoffset
    DECLARE @MJMeetings_ConversationID_ScheduledEndAt datetimeoffset
    DECLARE @MJMeetings_ConversationID_StartedAt datetimeoffset
    DECLARE @MJMeetings_ConversationID_EndedAt datetimeoffset
    DECLARE @MJMeetings_ConversationID_AllowPhoneDialIn bit
    DECLARE @MJMeetings_ConversationID_DialInPhoneNumberID uniqueidentifier
    DECLARE @MJMeetings_ConversationID_DialInCode nvarchar(20)
    DECLARE @MJMeetings_ConversationID_RecordingPolicy nvarchar(20)
    DECLARE @MJMeetings_ConversationID_ConversationID uniqueidentifier
    DECLARE cascade_update_MJMeetings_ConversationID_cursor CURSOR FOR
        SELECT [ID], [Title], [Description], [HostUserID], [RoomName], [Status], [ScheduledStartAt], [ScheduledEndAt], [StartedAt], [EndedAt], [AllowPhoneDialIn], [DialInPhoneNumberID], [DialInCode], [RecordingPolicy], [ConversationID]
        FROM [${flyway:defaultSchema}].[Meeting]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJMeetings_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJMeetings_ConversationID_cursor INTO @MJMeetings_ConversationIDID, @MJMeetings_ConversationID_Title, @MJMeetings_ConversationID_Description, @MJMeetings_ConversationID_HostUserID, @MJMeetings_ConversationID_RoomName, @MJMeetings_ConversationID_Status, @MJMeetings_ConversationID_ScheduledStartAt, @MJMeetings_ConversationID_ScheduledEndAt, @MJMeetings_ConversationID_StartedAt, @MJMeetings_ConversationID_EndedAt, @MJMeetings_ConversationID_AllowPhoneDialIn, @MJMeetings_ConversationID_DialInPhoneNumberID, @MJMeetings_ConversationID_DialInCode, @MJMeetings_ConversationID_RecordingPolicy, @MJMeetings_ConversationID_ConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJMeetings_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateMeeting] @ID = @MJMeetings_ConversationIDID, @Title = @MJMeetings_ConversationID_Title, @Description = @MJMeetings_ConversationID_Description, @HostUserID = @MJMeetings_ConversationID_HostUserID, @RoomName = @MJMeetings_ConversationID_RoomName, @Status = @MJMeetings_ConversationID_Status, @ScheduledStartAt = @MJMeetings_ConversationID_ScheduledStartAt, @ScheduledEndAt = @MJMeetings_ConversationID_ScheduledEndAt, @StartedAt = @MJMeetings_ConversationID_StartedAt, @EndedAt = @MJMeetings_ConversationID_EndedAt, @AllowPhoneDialIn = @MJMeetings_ConversationID_AllowPhoneDialIn, @DialInPhoneNumberID = @MJMeetings_ConversationID_DialInPhoneNumberID, @DialInCode = @MJMeetings_ConversationID_DialInCode, @RecordingPolicy = @MJMeetings_ConversationID_RecordingPolicy, @ConversationID_Clear = 1, @ConversationID = @MJMeetings_ConversationID_ConversationID

        FETCH NEXT FROM cascade_update_MJMeetings_ConversationID_cursor INTO @MJMeetings_ConversationIDID, @MJMeetings_ConversationID_Title, @MJMeetings_ConversationID_Description, @MJMeetings_ConversationID_HostUserID, @MJMeetings_ConversationID_RoomName, @MJMeetings_ConversationID_Status, @MJMeetings_ConversationID_ScheduledStartAt, @MJMeetings_ConversationID_ScheduledEndAt, @MJMeetings_ConversationID_StartedAt, @MJMeetings_ConversationID_EndedAt, @MJMeetings_ConversationID_AllowPhoneDialIn, @MJMeetings_ConversationID_DialInPhoneNumberID, @MJMeetings_ConversationID_DialInCode, @MJMeetings_ConversationID_RecordingPolicy, @MJMeetings_ConversationID_ConversationID
    END

    CLOSE cascade_update_MJMeetings_ConversationID_cursor
    DEALLOCATE cascade_update_MJMeetings_ConversationID_cursor
    
    -- Cascade update on UserRoutine using cursor to call spUpdateUserRoutine
    DECLARE @MJUserRoutines_ConversationIDID uniqueidentifier
    DECLARE @MJUserRoutines_ConversationID_UserID uniqueidentifier
    DECLARE @MJUserRoutines_ConversationID_EnvironmentID uniqueidentifier
    DECLARE @MJUserRoutines_ConversationID_Name nvarchar(255)
    DECLARE @MJUserRoutines_ConversationID_Description nvarchar(MAX)
    DECLARE @MJUserRoutines_ConversationID_Status nvarchar(20)
    DECLARE @MJUserRoutines_ConversationID_RoutineType nvarchar(20)
    DECLARE @MJUserRoutines_ConversationID_TargetType nvarchar(20)
    DECLARE @MJUserRoutines_ConversationID_TargetID uniqueidentifier
    DECLARE @MJUserRoutines_ConversationID_InitialMessage nvarchar(MAX)
    DECLARE @MJUserRoutines_ConversationID_StartingPayload nvarchar(MAX)
    DECLARE @MJUserRoutines_ConversationID_RequestedSkillIDs nvarchar(MAX)
    DECLARE @MJUserRoutines_ConversationID_CronExpression nvarchar(100)
    DECLARE @MJUserRoutines_ConversationID_StartAt datetimeoffset
    DECLARE @MJUserRoutines_ConversationID_EndAt datetimeoffset
    DECLARE @MJUserRoutines_ConversationID_NotificationTemplateID uniqueidentifier
    DECLARE @MJUserRoutines_ConversationID_Timezone nvarchar(100)
    DECLARE @MJUserRoutines_ConversationID_NextRunAt datetimeoffset
    DECLARE @MJUserRoutines_ConversationID_LastRunAt datetimeoffset
    DECLARE @MJUserRoutines_ConversationID_LastRunStatus nvarchar(20)
    DECLARE @MJUserRoutines_ConversationID_LastResultHash nvarchar(100)
    DECLARE @MJUserRoutines_ConversationID_NotifyCondition nvarchar(20)
    DECLARE @MJUserRoutines_ConversationID_NotifyViaInApp bit
    DECLARE @MJUserRoutines_ConversationID_NotifyViaEmail bit
    DECLARE @MJUserRoutines_ConversationID_ConversationID uniqueidentifier
    DECLARE cascade_update_MJUserRoutines_ConversationID_cursor CURSOR FOR
        SELECT [ID], [UserID], [EnvironmentID], [Name], [Description], [Status], [RoutineType], [TargetType], [TargetID], [InitialMessage], [StartingPayload], [RequestedSkillIDs], [CronExpression], [StartAt], [EndAt], [NotificationTemplateID], [Timezone], [NextRunAt], [LastRunAt], [LastRunStatus], [LastResultHash], [NotifyCondition], [NotifyViaInApp], [NotifyViaEmail], [ConversationID]
        FROM [${flyway:defaultSchema}].[UserRoutine]
        WHERE [ConversationID] = @ID

    OPEN cascade_update_MJUserRoutines_ConversationID_cursor
    FETCH NEXT FROM cascade_update_MJUserRoutines_ConversationID_cursor INTO @MJUserRoutines_ConversationIDID, @MJUserRoutines_ConversationID_UserID, @MJUserRoutines_ConversationID_EnvironmentID, @MJUserRoutines_ConversationID_Name, @MJUserRoutines_ConversationID_Description, @MJUserRoutines_ConversationID_Status, @MJUserRoutines_ConversationID_RoutineType, @MJUserRoutines_ConversationID_TargetType, @MJUserRoutines_ConversationID_TargetID, @MJUserRoutines_ConversationID_InitialMessage, @MJUserRoutines_ConversationID_StartingPayload, @MJUserRoutines_ConversationID_RequestedSkillIDs, @MJUserRoutines_ConversationID_CronExpression, @MJUserRoutines_ConversationID_StartAt, @MJUserRoutines_ConversationID_EndAt, @MJUserRoutines_ConversationID_NotificationTemplateID, @MJUserRoutines_ConversationID_Timezone, @MJUserRoutines_ConversationID_NextRunAt, @MJUserRoutines_ConversationID_LastRunAt, @MJUserRoutines_ConversationID_LastRunStatus, @MJUserRoutines_ConversationID_LastResultHash, @MJUserRoutines_ConversationID_NotifyCondition, @MJUserRoutines_ConversationID_NotifyViaInApp, @MJUserRoutines_ConversationID_NotifyViaEmail, @MJUserRoutines_ConversationID_ConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJUserRoutines_ConversationID_ConversationID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateUserRoutine] @ID = @MJUserRoutines_ConversationIDID, @UserID = @MJUserRoutines_ConversationID_UserID, @EnvironmentID = @MJUserRoutines_ConversationID_EnvironmentID, @Name = @MJUserRoutines_ConversationID_Name, @Description = @MJUserRoutines_ConversationID_Description, @Status = @MJUserRoutines_ConversationID_Status, @RoutineType = @MJUserRoutines_ConversationID_RoutineType, @TargetType = @MJUserRoutines_ConversationID_TargetType, @TargetID = @MJUserRoutines_ConversationID_TargetID, @InitialMessage = @MJUserRoutines_ConversationID_InitialMessage, @StartingPayload = @MJUserRoutines_ConversationID_StartingPayload, @RequestedSkillIDs = @MJUserRoutines_ConversationID_RequestedSkillIDs, @CronExpression = @MJUserRoutines_ConversationID_CronExpression, @StartAt = @MJUserRoutines_ConversationID_StartAt, @EndAt = @MJUserRoutines_ConversationID_EndAt, @NotificationTemplateID = @MJUserRoutines_ConversationID_NotificationTemplateID, @Timezone = @MJUserRoutines_ConversationID_Timezone, @NextRunAt = @MJUserRoutines_ConversationID_NextRunAt, @LastRunAt = @MJUserRoutines_ConversationID_LastRunAt, @LastRunStatus = @MJUserRoutines_ConversationID_LastRunStatus, @LastResultHash = @MJUserRoutines_ConversationID_LastResultHash, @NotifyCondition = @MJUserRoutines_ConversationID_NotifyCondition, @NotifyViaInApp = @MJUserRoutines_ConversationID_NotifyViaInApp, @NotifyViaEmail = @MJUserRoutines_ConversationID_NotifyViaEmail, @ConversationID_Clear = 1, @ConversationID = @MJUserRoutines_ConversationID_ConversationID

        FETCH NEXT FROM cascade_update_MJUserRoutines_ConversationID_cursor INTO @MJUserRoutines_ConversationIDID, @MJUserRoutines_ConversationID_UserID, @MJUserRoutines_ConversationID_EnvironmentID, @MJUserRoutines_ConversationID_Name, @MJUserRoutines_ConversationID_Description, @MJUserRoutines_ConversationID_Status, @MJUserRoutines_ConversationID_RoutineType, @MJUserRoutines_ConversationID_TargetType, @MJUserRoutines_ConversationID_TargetID, @MJUserRoutines_ConversationID_InitialMessage, @MJUserRoutines_ConversationID_StartingPayload, @MJUserRoutines_ConversationID_RequestedSkillIDs, @MJUserRoutines_ConversationID_CronExpression, @MJUserRoutines_ConversationID_StartAt, @MJUserRoutines_ConversationID_EndAt, @MJUserRoutines_ConversationID_NotificationTemplateID, @MJUserRoutines_ConversationID_Timezone, @MJUserRoutines_ConversationID_NextRunAt, @MJUserRoutines_ConversationID_LastRunAt, @MJUserRoutines_ConversationID_LastRunStatus, @MJUserRoutines_ConversationID_LastResultHash, @MJUserRoutines_ConversationID_NotifyCondition, @MJUserRoutines_ConversationID_NotifyViaInApp, @MJUserRoutines_ConversationID_NotifyViaEmail, @MJUserRoutines_ConversationID_ConversationID
    END

    CLOSE cascade_update_MJUserRoutines_ConversationID_cursor
    DEALLOCATE cascade_update_MJUserRoutines_ConversationID_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[Conversation]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete Permissions for MJ: Conversations */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spDelete SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
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
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction
    DECLARE @MJAIAgentActions_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_ActionID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_Status nvarchar(15)
    DECLARE @MJAIAgentActions_AgentID_MinExecutionsPerRun int
    DECLARE @MJAIAgentActions_AgentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgentActions_AgentID_ResultExpirationTurns int
    DECLARE @MJAIAgentActions_AgentID_ResultExpirationMode nvarchar(20)
    DECLARE @MJAIAgentActions_AgentID_CompactMode nvarchar(20)
    DECLARE @MJAIAgentActions_AgentID_CompactLength int
    DECLARE @MJAIAgentActions_AgentID_CompactPromptID uniqueidentifier
    DECLARE @MJAIAgentActions_AgentID_DeclareAsNativeTool bit
    DECLARE cascade_update_MJAIAgentActions_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ActionID], [Status], [MinExecutionsPerRun], [MaxExecutionsPerRun], [ResultExpirationTurns], [ResultExpirationMode], [CompactMode], [CompactLength], [CompactPromptID], [DeclareAsNativeTool]
        FROM [${flyway:defaultSchema}].[AIAgentAction]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentActions_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID, @MJAIAgentActions_AgentID_DeclareAsNativeTool

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentActions_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentAction] @ID = @MJAIAgentActions_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentActions_AgentID_AgentID, @ActionID = @MJAIAgentActions_AgentID_ActionID, @Status = @MJAIAgentActions_AgentID_Status, @MinExecutionsPerRun = @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @ResultExpirationTurns = @MJAIAgentActions_AgentID_ResultExpirationTurns, @ResultExpirationMode = @MJAIAgentActions_AgentID_ResultExpirationMode, @CompactMode = @MJAIAgentActions_AgentID_CompactMode, @CompactLength = @MJAIAgentActions_AgentID_CompactLength, @CompactPromptID = @MJAIAgentActions_AgentID_CompactPromptID, @DeclareAsNativeTool = @MJAIAgentActions_AgentID_DeclareAsNativeTool

        FETCH NEXT FROM cascade_update_MJAIAgentActions_AgentID_cursor INTO @MJAIAgentActions_AgentIDID, @MJAIAgentActions_AgentID_AgentID, @MJAIAgentActions_AgentID_ActionID, @MJAIAgentActions_AgentID_Status, @MJAIAgentActions_AgentID_MinExecutionsPerRun, @MJAIAgentActions_AgentID_MaxExecutionsPerRun, @MJAIAgentActions_AgentID_ResultExpirationTurns, @MJAIAgentActions_AgentID_ResultExpirationMode, @MJAIAgentActions_AgentID_CompactMode, @MJAIAgentActions_AgentID_CompactLength, @MJAIAgentActions_AgentID_CompactPromptID, @MJAIAgentActions_AgentID_DeclareAsNativeTool
    END

    CLOSE cascade_update_MJAIAgentActions_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentActions_AgentID_cursor
    
    -- Cascade delete from AIAgentArtifactType using cursor to call spDeleteAIAgentArtifactType
    DECLARE @MJAIAgentArtifactTypes_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentArtifactType]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor INTO @MJAIAgentArtifactTypes_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentArtifactType] @ID = @MJAIAgentArtifactTypes_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor INTO @MJAIAgentArtifactTypes_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentArtifactTypes_AgentID_cursor
    
    -- Cascade delete from AIAgentClientTool using cursor to call spDeleteAIAgentClientTool
    DECLARE @MJAIAgentClientTools_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentClientTools_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentClientTool]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentClientTools_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentClientTools_AgentID_cursor INTO @MJAIAgentClientTools_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentClientTool] @ID = @MJAIAgentClientTools_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentClientTools_AgentID_cursor INTO @MJAIAgentClientTools_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentClientTools_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentClientTools_AgentID_cursor
    
    -- Cascade delete from AIAgentCoAgent using cursor to call spDeleteAIAgentCoAgent
    DECLARE @MJAIAgentCoAgents_CoAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentCoAgent]
        WHERE [CoAgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor INTO @MJAIAgentCoAgents_CoAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentCoAgent] @ID = @MJAIAgentCoAgents_CoAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor INTO @MJAIAgentCoAgents_CoAgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentCoAgents_CoAgentID_cursor
    
    -- Cascade update on AIAgentCoAgent using cursor to call spUpdateAIAgentCoAgent
    DECLARE @MJAIAgentCoAgents_TargetAgentIDID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_CoAgentID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_TargetAgentID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID uniqueidentifier
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Type nvarchar(30)
    DECLARE @MJAIAgentCoAgents_TargetAgentID_IsDefault bit
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Sequence int
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Status nvarchar(20)
    DECLARE @MJAIAgentCoAgents_TargetAgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor CURSOR FOR
        SELECT [ID], [CoAgentID], [TargetAgentID], [TargetAgentTypeID], [Type], [IsDefault], [Sequence], [Status], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentCoAgent]
        WHERE [TargetAgentID] = @ID

    OPEN cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor INTO @MJAIAgentCoAgents_TargetAgentIDID, @MJAIAgentCoAgents_TargetAgentID_CoAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID, @MJAIAgentCoAgents_TargetAgentID_Type, @MJAIAgentCoAgents_TargetAgentID_IsDefault, @MJAIAgentCoAgents_TargetAgentID_Sequence, @MJAIAgentCoAgents_TargetAgentID_Status, @MJAIAgentCoAgents_TargetAgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentCoAgents_TargetAgentID_TargetAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentCoAgent] @ID = @MJAIAgentCoAgents_TargetAgentIDID, @CoAgentID = @MJAIAgentCoAgents_TargetAgentID_CoAgentID, @TargetAgentID_Clear = 1, @TargetAgentID = @MJAIAgentCoAgents_TargetAgentID_TargetAgentID, @TargetAgentTypeID = @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID, @Type = @MJAIAgentCoAgents_TargetAgentID_Type, @IsDefault = @MJAIAgentCoAgents_TargetAgentID_IsDefault, @Sequence = @MJAIAgentCoAgents_TargetAgentID_Sequence, @Status = @MJAIAgentCoAgents_TargetAgentID_Status, @Configuration = @MJAIAgentCoAgents_TargetAgentID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor INTO @MJAIAgentCoAgents_TargetAgentIDID, @MJAIAgentCoAgents_TargetAgentID_CoAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentID, @MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID, @MJAIAgentCoAgents_TargetAgentID_Type, @MJAIAgentCoAgents_TargetAgentID_IsDefault, @MJAIAgentCoAgents_TargetAgentID_Sequence, @MJAIAgentCoAgents_TargetAgentID_Status, @MJAIAgentCoAgents_TargetAgentID_Configuration
    END

    CLOSE cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentCoAgents_TargetAgentID_cursor
    
    -- Cascade delete from AIAgentConfiguration using cursor to call spDeleteAIAgentConfiguration
    DECLARE @MJAIAgentConfigurations_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentConfigurations_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentConfiguration]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentConfigurations_AgentID_cursor INTO @MJAIAgentConfigurations_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentConfiguration] @ID = @MJAIAgentConfigurations_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentConfigurations_AgentID_cursor INTO @MJAIAgentConfigurations_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentConfigurations_AgentID_cursor
    
    -- Cascade delete from AIAgentCredential using cursor to call spDeleteAIAgentCredential
    DECLARE @MJAIAgentCredentials_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentCredentials_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentCredential]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentCredentials_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentCredentials_AgentID_cursor INTO @MJAIAgentCredentials_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentCredential] @ID = @MJAIAgentCredentials_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentCredentials_AgentID_cursor INTO @MJAIAgentCredentials_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentCredentials_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentCredentials_AgentID_cursor
    
    -- Cascade delete from AIAgentDataSource using cursor to call spDeleteAIAgentDataSource
    DECLARE @MJAIAgentDataSources_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentDataSources_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentDataSource]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentDataSources_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentDataSources_AgentID_cursor INTO @MJAIAgentDataSources_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentDataSource] @ID = @MJAIAgentDataSources_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentDataSources_AgentID_cursor INTO @MJAIAgentDataSources_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentDataSources_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentDataSources_AgentID_cursor
    
    -- Cascade delete from AIAgentExample using cursor to call spDeleteAIAgentExample
    DECLARE @MJAIAgentExamples_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentExamples_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentExample]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentExamples_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentExamples_AgentID_cursor INTO @MJAIAgentExamples_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentExample] @ID = @MJAIAgentExamples_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentExamples_AgentID_cursor INTO @MJAIAgentExamples_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentExamples_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentExamples_AgentID_cursor
    
    -- Cascade delete from AIAgentLearningCycle using cursor to call spDeleteAIAgentLearningCycle
    DECLARE @MJAIAgentLearningCycles_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentLearningCycle]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentLearningCycles_AgentID_cursor INTO @MJAIAgentLearningCycles_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentLearningCycle] @ID = @MJAIAgentLearningCycles_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentLearningCycles_AgentID_cursor INTO @MJAIAgentLearningCycles_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentLearningCycles_AgentID_cursor
    
    -- Cascade delete from AIAgentModality using cursor to call spDeleteAIAgentModality
    DECLARE @MJAIAgentModalities_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentModalities_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentModality]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentModalities_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentModalities_AgentID_cursor INTO @MJAIAgentModalities_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentModality] @ID = @MJAIAgentModalities_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentModalities_AgentID_cursor INTO @MJAIAgentModalities_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentModalities_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentModalities_AgentID_cursor
    
    -- Cascade update on AIAgentModel using cursor to call spUpdateAIAgentModel
    DECLARE @MJAIAgentModels_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_ModelID uniqueidentifier
    DECLARE @MJAIAgentModels_AgentID_Active bit
    DECLARE @MJAIAgentModels_AgentID_Priority int
    DECLARE cascade_update_MJAIAgentModels_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [ModelID], [Active], [Priority]
        FROM [${flyway:defaultSchema}].[AIAgentModel]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentModels_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentModels_AgentID_cursor INTO @MJAIAgentModels_AgentIDID, @MJAIAgentModels_AgentID_AgentID, @MJAIAgentModels_AgentID_ModelID, @MJAIAgentModels_AgentID_Active, @MJAIAgentModels_AgentID_Priority

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentModels_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentModel] @ID = @MJAIAgentModels_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentModels_AgentID_AgentID, @ModelID = @MJAIAgentModels_AgentID_ModelID, @Active = @MJAIAgentModels_AgentID_Active, @Priority = @MJAIAgentModels_AgentID_Priority

        FETCH NEXT FROM cascade_update_MJAIAgentModels_AgentID_cursor INTO @MJAIAgentModels_AgentIDID, @MJAIAgentModels_AgentID_AgentID, @MJAIAgentModels_AgentID_ModelID, @MJAIAgentModels_AgentID_Active, @MJAIAgentModels_AgentID_Priority
    END

    CLOSE cascade_update_MJAIAgentModels_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentModels_AgentID_cursor
    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote
    DECLARE @MJAIAgentNotes_AgentIDID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_AgentNoteTypeID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_Note nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_UserID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_Type nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_IsAutoGenerated bit
    DECLARE @MJAIAgentNotes_AgentID_Comments nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_Status nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_SourceConversationID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_SourceConversationDetailID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_SourceAIAgentRunID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_CompanyID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingVector nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingModelID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_PrimaryScopeEntityID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_PrimaryScopeRecordID nvarchar(100)
    DECLARE @MJAIAgentNotes_AgentID_SecondaryScopes nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_LastAccessedAt datetimeoffset
    DECLARE @MJAIAgentNotes_AgentID_AccessCount int
    DECLARE @MJAIAgentNotes_AgentID_ExpiresAt datetimeoffset
    DECLARE @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID uniqueidentifier
    DECLARE @MJAIAgentNotes_AgentID_ConsolidationCount int
    DECLARE @MJAIAgentNotes_AgentID_DerivedFromNoteIDs nvarchar(MAX)
    DECLARE @MJAIAgentNotes_AgentID_ProtectionTier nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_ImportanceScore decimal(5, 2)
    DECLARE @MJAIAgentNotes_AgentID_AuthorType nvarchar(20)
    DECLARE @MJAIAgentNotes_AgentID_EmbeddingVectorBinary varbinary(MAX)
    DECLARE cascade_update_MJAIAgentNotes_AgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [AgentNoteTypeID], [Note], [UserID], [Type], [IsAutoGenerated], [Comments], [Status], [SourceConversationID], [SourceConversationDetailID], [SourceAIAgentRunID], [CompanyID], [EmbeddingVector], [EmbeddingModelID], [PrimaryScopeEntityID], [PrimaryScopeRecordID], [SecondaryScopes], [LastAccessedAt], [AccessCount], [ExpiresAt], [ConsolidatedIntoNoteID], [ConsolidationCount], [DerivedFromNoteIDs], [ProtectionTier], [ImportanceScore], [AuthorType], [EmbeddingVectorBinary]
        FROM [${flyway:defaultSchema}].[AIAgentNote]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIAgentNotes_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt, @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @MJAIAgentNotes_AgentID_ConsolidationCount, @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @MJAIAgentNotes_AgentID_ProtectionTier, @MJAIAgentNotes_AgentID_ImportanceScore, @MJAIAgentNotes_AgentID_AuthorType, @MJAIAgentNotes_AgentID_EmbeddingVectorBinary

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentNotes_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentNote] @ID = @MJAIAgentNotes_AgentIDID, @AgentID_Clear = 1, @AgentID = @MJAIAgentNotes_AgentID_AgentID, @AgentNoteTypeID = @MJAIAgentNotes_AgentID_AgentNoteTypeID, @Note = @MJAIAgentNotes_AgentID_Note, @UserID = @MJAIAgentNotes_AgentID_UserID, @Type = @MJAIAgentNotes_AgentID_Type, @IsAutoGenerated = @MJAIAgentNotes_AgentID_IsAutoGenerated, @Comments = @MJAIAgentNotes_AgentID_Comments, @Status = @MJAIAgentNotes_AgentID_Status, @SourceConversationID = @MJAIAgentNotes_AgentID_SourceConversationID, @SourceConversationDetailID = @MJAIAgentNotes_AgentID_SourceConversationDetailID, @SourceAIAgentRunID = @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @CompanyID = @MJAIAgentNotes_AgentID_CompanyID, @EmbeddingVector = @MJAIAgentNotes_AgentID_EmbeddingVector, @EmbeddingModelID = @MJAIAgentNotes_AgentID_EmbeddingModelID, @PrimaryScopeEntityID = @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @PrimaryScopeRecordID = @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @SecondaryScopes = @MJAIAgentNotes_AgentID_SecondaryScopes, @LastAccessedAt = @MJAIAgentNotes_AgentID_LastAccessedAt, @AccessCount = @MJAIAgentNotes_AgentID_AccessCount, @ExpiresAt = @MJAIAgentNotes_AgentID_ExpiresAt, @ConsolidatedIntoNoteID = @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @ConsolidationCount = @MJAIAgentNotes_AgentID_ConsolidationCount, @DerivedFromNoteIDs = @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @ProtectionTier = @MJAIAgentNotes_AgentID_ProtectionTier, @ImportanceScore = @MJAIAgentNotes_AgentID_ImportanceScore, @AuthorType = @MJAIAgentNotes_AgentID_AuthorType, @EmbeddingVectorBinary = @MJAIAgentNotes_AgentID_EmbeddingVectorBinary

        FETCH NEXT FROM cascade_update_MJAIAgentNotes_AgentID_cursor INTO @MJAIAgentNotes_AgentIDID, @MJAIAgentNotes_AgentID_AgentID, @MJAIAgentNotes_AgentID_AgentNoteTypeID, @MJAIAgentNotes_AgentID_Note, @MJAIAgentNotes_AgentID_UserID, @MJAIAgentNotes_AgentID_Type, @MJAIAgentNotes_AgentID_IsAutoGenerated, @MJAIAgentNotes_AgentID_Comments, @MJAIAgentNotes_AgentID_Status, @MJAIAgentNotes_AgentID_SourceConversationID, @MJAIAgentNotes_AgentID_SourceConversationDetailID, @MJAIAgentNotes_AgentID_SourceAIAgentRunID, @MJAIAgentNotes_AgentID_CompanyID, @MJAIAgentNotes_AgentID_EmbeddingVector, @MJAIAgentNotes_AgentID_EmbeddingModelID, @MJAIAgentNotes_AgentID_PrimaryScopeEntityID, @MJAIAgentNotes_AgentID_PrimaryScopeRecordID, @MJAIAgentNotes_AgentID_SecondaryScopes, @MJAIAgentNotes_AgentID_LastAccessedAt, @MJAIAgentNotes_AgentID_AccessCount, @MJAIAgentNotes_AgentID_ExpiresAt, @MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, @MJAIAgentNotes_AgentID_ConsolidationCount, @MJAIAgentNotes_AgentID_DerivedFromNoteIDs, @MJAIAgentNotes_AgentID_ProtectionTier, @MJAIAgentNotes_AgentID_ImportanceScore, @MJAIAgentNotes_AgentID_AuthorType, @MJAIAgentNotes_AgentID_EmbeddingVectorBinary
    END

    CLOSE cascade_update_MJAIAgentNotes_AgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentNotes_AgentID_cursor
    
    -- Cascade delete from AIAgentPermission using cursor to call spDeleteAIAgentPermission
    DECLARE @MJAIAgentPermissions_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPermissions_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPermission]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPermissions_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPermissions_AgentID_cursor INTO @MJAIAgentPermissions_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPermission] @ID = @MJAIAgentPermissions_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPermissions_AgentID_cursor INTO @MJAIAgentPermissions_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPermissions_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPermissions_AgentID_cursor
    
    -- Cascade delete from AIAgentPersona using cursor to call spDeleteAIAgentPersona
    DECLARE @MJAIAgentPersonas_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPersonas_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPersona]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPersonas_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPersonas_AgentID_cursor INTO @MJAIAgentPersonas_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPersona] @ID = @MJAIAgentPersonas_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPersonas_AgentID_cursor INTO @MJAIAgentPersonas_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPersonas_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPersonas_AgentID_cursor
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt
    DECLARE @MJAIAgentPrompts_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentPrompts_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentPrompt]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentPrompts_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_AgentID_cursor INTO @MJAIAgentPrompts_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentPrompt] @ID = @MJAIAgentPrompts_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentPrompts_AgentID_cursor INTO @MJAIAgentPrompts_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentPrompts_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentPrompts_AgentID_cursor
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship
    DECLARE @MJAIAgentRelationships_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRelationships_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRelationship]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRelationships_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_AgentID_cursor INTO @MJAIAgentRelationships_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] @ID = @MJAIAgentRelationships_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_AgentID_cursor INTO @MJAIAgentRelationships_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRelationships_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRelationships_AgentID_cursor
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship
    DECLARE @MJAIAgentRelationships_SubAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRelationship]
        WHERE [SubAgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_SubAgentID_cursor INTO @MJAIAgentRelationships_SubAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRelationship] @ID = @MJAIAgentRelationships_SubAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRelationships_SubAgentID_cursor INTO @MJAIAgentRelationships_SubAgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRelationships_SubAgentID_cursor
    
    -- Cascade delete from AIAgentRequest using cursor to call spDeleteAIAgentRequest
    DECLARE @MJAIAgentRequests_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRequests_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRequest]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRequests_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRequests_AgentID_cursor INTO @MJAIAgentRequests_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRequest] @ID = @MJAIAgentRequests_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRequests_AgentID_cursor INTO @MJAIAgentRequests_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRequests_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRequests_AgentID_cursor
    
    -- Cascade delete from AIAgentRubric using cursor to call spDeleteAIAgentRubric
    DECLARE @MJAIAgentRubrics_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRubrics_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRubric]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRubrics_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRubrics_AgentID_cursor INTO @MJAIAgentRubrics_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRubric] @ID = @MJAIAgentRubrics_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRubrics_AgentID_cursor INTO @MJAIAgentRubrics_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRubrics_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRubrics_AgentID_cursor
    
    -- Cascade delete from AIAgentRun using cursor to call spDeleteAIAgentRun
    DECLARE @MJAIAgentRuns_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentRuns_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentRuns_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentRuns_AgentID_cursor INTO @MJAIAgentRuns_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentRun] @ID = @MJAIAgentRuns_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentRuns_AgentID_cursor INTO @MJAIAgentRuns_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentRuns_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentRuns_AgentID_cursor
    
    -- Cascade delete from AIAgentSearchScope using cursor to call spDeleteAIAgentSearchScope
    DECLARE @MJAIAgentSearchScopes_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSearchScope]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSearchScopes_AgentID_cursor INTO @MJAIAgentSearchScopes_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSearchScope] @ID = @MJAIAgentSearchScopes_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSearchScopes_AgentID_cursor INTO @MJAIAgentSearchScopes_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSearchScopes_AgentID_cursor
    
    -- Cascade delete from AIAgentSession using cursor to call spDeleteAIAgentSession
    DECLARE @MJAIAgentSessions_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSessions_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSession]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSessions_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSessions_AgentID_cursor INTO @MJAIAgentSessions_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSession] @ID = @MJAIAgentSessions_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSessions_AgentID_cursor INTO @MJAIAgentSessions_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSessions_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSessions_AgentID_cursor
    
    -- Cascade delete from AIAgentSkill using cursor to call spDeleteAIAgentSkill
    DECLARE @MJAIAgentSkills_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSkills_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentSkill]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSkills_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSkills_AgentID_cursor INTO @MJAIAgentSkills_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentSkill] @ID = @MJAIAgentSkills_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSkills_AgentID_cursor INTO @MJAIAgentSkills_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSkills_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSkills_AgentID_cursor
    
    -- Cascade delete from AIAgentStep using cursor to call spDeleteAIAgentStep
    DECLARE @MJAIAgentSteps_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIAgentSteps_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIAgentSteps_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIAgentSteps_AgentID_cursor INTO @MJAIAgentSteps_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIAgentStep] @ID = @MJAIAgentSteps_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIAgentSteps_AgentID_cursor INTO @MJAIAgentSteps_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIAgentSteps_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIAgentSteps_AgentID_cursor
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep
    DECLARE @MJAIAgentSteps_SubAgentIDID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_AgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_Name nvarchar(255)
    DECLARE @MJAIAgentSteps_SubAgentID_Description nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_StepType nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_StartingStep bit
    DECLARE @MJAIAgentSteps_SubAgentID_TimeoutSeconds int
    DECLARE @MJAIAgentSteps_SubAgentID_RetryCount int
    DECLARE @MJAIAgentSteps_SubAgentID_OnErrorBehavior nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_ActionID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_SubAgentID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_PromptID uniqueidentifier
    DECLARE @MJAIAgentSteps_SubAgentID_ActionOutputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_PositionX int
    DECLARE @MJAIAgentSteps_SubAgentID_PositionY int
    DECLARE @MJAIAgentSteps_SubAgentID_Width int
    DECLARE @MJAIAgentSteps_SubAgentID_Height int
    DECLARE @MJAIAgentSteps_SubAgentID_Status nvarchar(20)
    DECLARE @MJAIAgentSteps_SubAgentID_ActionInputMapping nvarchar(MAX)
    DECLARE @MJAIAgentSteps_SubAgentID_LoopBodyType nvarchar(50)
    DECLARE @MJAIAgentSteps_SubAgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJAIAgentSteps_SubAgentID_cursor CURSOR FOR
        SELECT [ID], [AgentID], [Name], [Description], [StepType], [StartingStep], [TimeoutSeconds], [RetryCount], [OnErrorBehavior], [ActionID], [SubAgentID], [PromptID], [ActionOutputMapping], [PositionX], [PositionY], [Width], [Height], [Status], [ActionInputMapping], [LoopBodyType], [Configuration]
        FROM [${flyway:defaultSchema}].[AIAgentStep]
        WHERE [SubAgentID] = @ID

    OPEN cascade_update_MJAIAgentSteps_SubAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgentSteps_SubAgentID_cursor INTO @MJAIAgentSteps_SubAgentIDID, @MJAIAgentSteps_SubAgentID_AgentID, @MJAIAgentSteps_SubAgentID_Name, @MJAIAgentSteps_SubAgentID_Description, @MJAIAgentSteps_SubAgentID_StepType, @MJAIAgentSteps_SubAgentID_StartingStep, @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @MJAIAgentSteps_SubAgentID_RetryCount, @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @MJAIAgentSteps_SubAgentID_ActionID, @MJAIAgentSteps_SubAgentID_SubAgentID, @MJAIAgentSteps_SubAgentID_PromptID, @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @MJAIAgentSteps_SubAgentID_PositionX, @MJAIAgentSteps_SubAgentID_PositionY, @MJAIAgentSteps_SubAgentID_Width, @MJAIAgentSteps_SubAgentID_Height, @MJAIAgentSteps_SubAgentID_Status, @MJAIAgentSteps_SubAgentID_ActionInputMapping, @MJAIAgentSteps_SubAgentID_LoopBodyType, @MJAIAgentSteps_SubAgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgentSteps_SubAgentID_SubAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentStep] @ID = @MJAIAgentSteps_SubAgentIDID, @AgentID = @MJAIAgentSteps_SubAgentID_AgentID, @Name = @MJAIAgentSteps_SubAgentID_Name, @Description = @MJAIAgentSteps_SubAgentID_Description, @StepType = @MJAIAgentSteps_SubAgentID_StepType, @StartingStep = @MJAIAgentSteps_SubAgentID_StartingStep, @TimeoutSeconds = @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @RetryCount = @MJAIAgentSteps_SubAgentID_RetryCount, @OnErrorBehavior = @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @ActionID = @MJAIAgentSteps_SubAgentID_ActionID, @SubAgentID_Clear = 1, @SubAgentID = @MJAIAgentSteps_SubAgentID_SubAgentID, @PromptID = @MJAIAgentSteps_SubAgentID_PromptID, @ActionOutputMapping = @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @PositionX = @MJAIAgentSteps_SubAgentID_PositionX, @PositionY = @MJAIAgentSteps_SubAgentID_PositionY, @Width = @MJAIAgentSteps_SubAgentID_Width, @Height = @MJAIAgentSteps_SubAgentID_Height, @Status = @MJAIAgentSteps_SubAgentID_Status, @ActionInputMapping = @MJAIAgentSteps_SubAgentID_ActionInputMapping, @LoopBodyType = @MJAIAgentSteps_SubAgentID_LoopBodyType, @Configuration = @MJAIAgentSteps_SubAgentID_Configuration

        FETCH NEXT FROM cascade_update_MJAIAgentSteps_SubAgentID_cursor INTO @MJAIAgentSteps_SubAgentIDID, @MJAIAgentSteps_SubAgentID_AgentID, @MJAIAgentSteps_SubAgentID_Name, @MJAIAgentSteps_SubAgentID_Description, @MJAIAgentSteps_SubAgentID_StepType, @MJAIAgentSteps_SubAgentID_StartingStep, @MJAIAgentSteps_SubAgentID_TimeoutSeconds, @MJAIAgentSteps_SubAgentID_RetryCount, @MJAIAgentSteps_SubAgentID_OnErrorBehavior, @MJAIAgentSteps_SubAgentID_ActionID, @MJAIAgentSteps_SubAgentID_SubAgentID, @MJAIAgentSteps_SubAgentID_PromptID, @MJAIAgentSteps_SubAgentID_ActionOutputMapping, @MJAIAgentSteps_SubAgentID_PositionX, @MJAIAgentSteps_SubAgentID_PositionY, @MJAIAgentSteps_SubAgentID_Width, @MJAIAgentSteps_SubAgentID_Height, @MJAIAgentSteps_SubAgentID_Status, @MJAIAgentSteps_SubAgentID_ActionInputMapping, @MJAIAgentSteps_SubAgentID_LoopBodyType, @MJAIAgentSteps_SubAgentID_Configuration
    END

    CLOSE cascade_update_MJAIAgentSteps_SubAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgentSteps_SubAgentID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_ParentIDID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_Name nvarchar(255)
    DECLARE @MJAIAgents_ParentID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_ParentID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_ExposeAsAction bit
    DECLARE @MJAIAgents_ParentID_ExecutionOrder int
    DECLARE @MJAIAgents_ParentID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_EnableContextCompression bit
    DECLARE @MJAIAgents_ParentID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_ParentID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_ParentID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_Status nvarchar(20)
    DECLARE @MJAIAgents_ParentID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_ParentID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_ParentID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_ParentID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_ParentID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_ParentID_MaxTokensPerRun int
    DECLARE @MJAIAgents_ParentID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_ParentID_MaxTimePerRun int
    DECLARE @MJAIAgents_ParentID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_ParentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_ParentID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_ParentID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_ParentID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_ParentID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_InjectNotes bit
    DECLARE @MJAIAgents_ParentID_MaxNotesToInject int
    DECLARE @MJAIAgents_ParentID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ParentID_InjectExamples bit
    DECLARE @MJAIAgents_ParentID_MaxExamplesToInject int
    DECLARE @MJAIAgents_ParentID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_ParentID_IsRestricted bit
    DECLARE @MJAIAgents_ParentID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_ParentID_MaxMessages int
    DECLARE @MJAIAgents_ParentID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_ParentID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_ParentID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_NoteRetentionDays int
    DECLARE @MJAIAgents_ParentID_ExampleRetentionDays int
    DECLARE @MJAIAgents_ParentID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_ParentID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_ParentID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_ParentID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_ParentID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_ParentID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_ParentID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_ParentID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_SupportsPlanMode bit
    DECLARE @MJAIAgents_ParentID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_ParentID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_ParentID_RequirePlanMode bit
    DECLARE @MJAIAgents_ParentID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_ParentID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_ParentID_CompactionTargetPercent int
    DECLARE @MJAIAgents_ParentID_ConversationSummaryPromptID uniqueidentifier
    DECLARE @MJAIAgents_ParentID_DeclareActionsAsNativeTools bit
    DECLARE cascade_update_MJAIAgents_ParentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [ParentID] = @ID

    OPEN cascade_update_MJAIAgents_ParentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID, @MJAIAgents_ParentID_DefaultMediaCollectionID, @MJAIAgents_ParentID_SupportsPlanMode, @MJAIAgents_ParentID_AcceptsSkills, @MJAIAgents_ParentID_SkillActivationMode, @MJAIAgents_ParentID_RequirePlanMode, @MJAIAgents_ParentID_ContextWindowMaxTokens, @MJAIAgents_ParentID_CompactionTriggerPercent, @MJAIAgents_ParentID_CompactionTargetPercent, @MJAIAgents_ParentID_ConversationSummaryPromptID, @MJAIAgents_ParentID_DeclareActionsAsNativeTools

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_ParentID_ParentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_ParentIDID, @Name = @MJAIAgents_ParentID_Name, @Description = @MJAIAgents_ParentID_Description, @LogoURL = @MJAIAgents_ParentID_LogoURL, @ParentID_Clear = 1, @ParentID = @MJAIAgents_ParentID_ParentID, @ExposeAsAction = @MJAIAgents_ParentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_ParentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_ParentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_ParentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_ParentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_ParentID_TypeID, @Status = @MJAIAgents_ParentID_Status, @DriverClass = @MJAIAgents_ParentID_DriverClass, @IconClass = @MJAIAgents_ParentID_IconClass, @ModelSelectionMode = @MJAIAgents_ParentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_ParentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_ParentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_ParentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_ParentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_ParentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_ParentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_ParentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_ParentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_ParentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_ParentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_ParentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_ParentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_ParentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_ParentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_ParentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_ParentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_ParentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_ParentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_ParentID_OwnerUserID, @InvocationMode = @MJAIAgents_ParentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_ParentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_ParentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_ParentID_TechnicalDesign, @InjectNotes = @MJAIAgents_ParentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_ParentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_ParentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_ParentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_ParentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_ParentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_ParentID_IsRestricted, @MessageMode = @MJAIAgents_ParentID_MessageMode, @MaxMessages = @MJAIAgents_ParentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_ParentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_ParentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_ParentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_ParentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_ParentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_ParentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_ParentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_ParentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_ParentID_RerankerConfiguration, @CategoryID = @MJAIAgents_ParentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_ParentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_ParentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_ParentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_ParentID_AcceptUnregisteredFiles, @DefaultCoAgentID = @MJAIAgents_ParentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_ParentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_ParentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_ParentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_ParentID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_ParentID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_ParentID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_ParentID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_ParentID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_ParentID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_ParentID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_ParentID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_ParentID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_ParentID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_ParentID_DeclareActionsAsNativeTools

        FETCH NEXT FROM cascade_update_MJAIAgents_ParentID_cursor INTO @MJAIAgents_ParentIDID, @MJAIAgents_ParentID_Name, @MJAIAgents_ParentID_Description, @MJAIAgents_ParentID_LogoURL, @MJAIAgents_ParentID_ParentID, @MJAIAgents_ParentID_ExposeAsAction, @MJAIAgents_ParentID_ExecutionOrder, @MJAIAgents_ParentID_ExecutionMode, @MJAIAgents_ParentID_EnableContextCompression, @MJAIAgents_ParentID_ContextCompressionMessageThreshold, @MJAIAgents_ParentID_ContextCompressionPromptID, @MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, @MJAIAgents_ParentID_TypeID, @MJAIAgents_ParentID_Status, @MJAIAgents_ParentID_DriverClass, @MJAIAgents_ParentID_IconClass, @MJAIAgents_ParentID_ModelSelectionMode, @MJAIAgents_ParentID_PayloadDownstreamPaths, @MJAIAgents_ParentID_PayloadUpstreamPaths, @MJAIAgents_ParentID_PayloadSelfReadPaths, @MJAIAgents_ParentID_PayloadSelfWritePaths, @MJAIAgents_ParentID_PayloadScope, @MJAIAgents_ParentID_FinalPayloadValidation, @MJAIAgents_ParentID_FinalPayloadValidationMode, @MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, @MJAIAgents_ParentID_MaxCostPerRun, @MJAIAgents_ParentID_MaxTokensPerRun, @MJAIAgents_ParentID_MaxIterationsPerRun, @MJAIAgents_ParentID_MaxTimePerRun, @MJAIAgents_ParentID_MinExecutionsPerRun, @MJAIAgents_ParentID_MaxExecutionsPerRun, @MJAIAgents_ParentID_StartingPayloadValidation, @MJAIAgents_ParentID_StartingPayloadValidationMode, @MJAIAgents_ParentID_DefaultPromptEffortLevel, @MJAIAgents_ParentID_ChatHandlingOption, @MJAIAgents_ParentID_DefaultArtifactTypeID, @MJAIAgents_ParentID_OwnerUserID, @MJAIAgents_ParentID_InvocationMode, @MJAIAgents_ParentID_ArtifactCreationMode, @MJAIAgents_ParentID_FunctionalRequirements, @MJAIAgents_ParentID_TechnicalDesign, @MJAIAgents_ParentID_InjectNotes, @MJAIAgents_ParentID_MaxNotesToInject, @MJAIAgents_ParentID_NoteInjectionStrategy, @MJAIAgents_ParentID_InjectExamples, @MJAIAgents_ParentID_MaxExamplesToInject, @MJAIAgents_ParentID_ExampleInjectionStrategy, @MJAIAgents_ParentID_IsRestricted, @MJAIAgents_ParentID_MessageMode, @MJAIAgents_ParentID_MaxMessages, @MJAIAgents_ParentID_AttachmentStorageProviderID, @MJAIAgents_ParentID_AttachmentRootPath, @MJAIAgents_ParentID_InlineStorageThresholdBytes, @MJAIAgents_ParentID_AgentTypePromptParams, @MJAIAgents_ParentID_ScopeConfig, @MJAIAgents_ParentID_NoteRetentionDays, @MJAIAgents_ParentID_ExampleRetentionDays, @MJAIAgents_ParentID_AutoArchiveEnabled, @MJAIAgents_ParentID_RerankerConfiguration, @MJAIAgents_ParentID_CategoryID, @MJAIAgents_ParentID_AllowEphemeralClientTools, @MJAIAgents_ParentID_DefaultStorageAccountID, @MJAIAgents_ParentID_SearchScopeAccess, @MJAIAgents_ParentID_AcceptUnregisteredFiles, @MJAIAgents_ParentID_DefaultCoAgentID, @MJAIAgents_ParentID_TypeConfiguration, @MJAIAgents_ParentID_AllowMemoryWrite, @MJAIAgents_ParentID_RecordingDefault, @MJAIAgents_ParentID_RecordingStorageProviderID, @MJAIAgents_ParentID_DefaultMediaCollectionID, @MJAIAgents_ParentID_SupportsPlanMode, @MJAIAgents_ParentID_AcceptsSkills, @MJAIAgents_ParentID_SkillActivationMode, @MJAIAgents_ParentID_RequirePlanMode, @MJAIAgents_ParentID_ContextWindowMaxTokens, @MJAIAgents_ParentID_CompactionTriggerPercent, @MJAIAgents_ParentID_CompactionTargetPercent, @MJAIAgents_ParentID_ConversationSummaryPromptID, @MJAIAgents_ParentID_DeclareActionsAsNativeTools
    END

    CLOSE cascade_update_MJAIAgents_ParentID_cursor
    DEALLOCATE cascade_update_MJAIAgents_ParentID_cursor
    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent
    DECLARE @MJAIAgents_DefaultCoAgentIDID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_Name nvarchar(255)
    DECLARE @MJAIAgents_DefaultCoAgentID_Description nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_LogoURL nvarchar(255)
    DECLARE @MJAIAgents_DefaultCoAgentID_ParentID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_ExposeAsAction bit
    DECLARE @MJAIAgents_DefaultCoAgentID_ExecutionOrder int
    DECLARE @MJAIAgents_DefaultCoAgentID_ExecutionMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_EnableContextCompression bit
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold int
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount int
    DECLARE @MJAIAgents_DefaultCoAgentID_TypeID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_Status nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_DriverClass nvarchar(255)
    DECLARE @MJAIAgents_DefaultCoAgentID_IconClass nvarchar(100)
    DECLARE @MJAIAgents_DefaultCoAgentID_ModelSelectionMode nvarchar(50)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_PayloadScope nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxCostPerRun decimal(10, 4)
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxTimePerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun int
    DECLARE @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode nvarchar(25)
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel int
    DECLARE @MJAIAgents_DefaultCoAgentID_ChatHandlingOption nvarchar(30)
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_OwnerUserID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_InvocationMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_FunctionalRequirements nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_TechnicalDesign nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_InjectNotes bit
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxNotesToInject int
    DECLARE @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_InjectExamples bit
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject int
    DECLARE @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_IsRestricted bit
    DECLARE @MJAIAgents_DefaultCoAgentID_MessageMode nvarchar(50)
    DECLARE @MJAIAgents_DefaultCoAgentID_MaxMessages int
    DECLARE @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_AttachmentRootPath nvarchar(500)
    DECLARE @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes int
    DECLARE @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_ScopeConfig nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_NoteRetentionDays int
    DECLARE @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays int
    DECLARE @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled bit
    DECLARE @MJAIAgents_DefaultCoAgentID_RerankerConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_CategoryID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools bit
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_SearchScopeAccess nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles bit
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_TypeConfiguration nvarchar(MAX)
    DECLARE @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite bit
    DECLARE @MJAIAgents_DefaultCoAgentID_RecordingDefault nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_SupportsPlanMode bit
    DECLARE @MJAIAgents_DefaultCoAgentID_AcceptsSkills nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_SkillActivationMode nvarchar(20)
    DECLARE @MJAIAgents_DefaultCoAgentID_RequirePlanMode bit
    DECLARE @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens int
    DECLARE @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent int
    DECLARE @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent int
    DECLARE @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID uniqueidentifier
    DECLARE @MJAIAgents_DefaultCoAgentID_DeclareActionsAsNativeTools bit
    DECLARE cascade_update_MJAIAgents_DefaultCoAgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [LogoURL], [ParentID], [ExposeAsAction], [ExecutionOrder], [ExecutionMode], [EnableContextCompression], [ContextCompressionMessageThreshold], [ContextCompressionPromptID], [ContextCompressionMessageRetentionCount], [TypeID], [Status], [DriverClass], [IconClass], [ModelSelectionMode], [PayloadDownstreamPaths], [PayloadUpstreamPaths], [PayloadSelfReadPaths], [PayloadSelfWritePaths], [PayloadScope], [FinalPayloadValidation], [FinalPayloadValidationMode], [FinalPayloadValidationMaxRetries], [MaxCostPerRun], [MaxTokensPerRun], [MaxIterationsPerRun], [MaxTimePerRun], [MinExecutionsPerRun], [MaxExecutionsPerRun], [StartingPayloadValidation], [StartingPayloadValidationMode], [DefaultPromptEffortLevel], [ChatHandlingOption], [DefaultArtifactTypeID], [OwnerUserID], [InvocationMode], [ArtifactCreationMode], [FunctionalRequirements], [TechnicalDesign], [InjectNotes], [MaxNotesToInject], [NoteInjectionStrategy], [InjectExamples], [MaxExamplesToInject], [ExampleInjectionStrategy], [IsRestricted], [MessageMode], [MaxMessages], [AttachmentStorageProviderID], [AttachmentRootPath], [InlineStorageThresholdBytes], [AgentTypePromptParams], [ScopeConfig], [NoteRetentionDays], [ExampleRetentionDays], [AutoArchiveEnabled], [RerankerConfiguration], [CategoryID], [AllowEphemeralClientTools], [DefaultStorageAccountID], [SearchScopeAccess], [AcceptUnregisteredFiles], [DefaultCoAgentID], [TypeConfiguration], [AllowMemoryWrite], [RecordingDefault], [RecordingStorageProviderID], [DefaultMediaCollectionID], [SupportsPlanMode], [AcceptsSkills], [SkillActivationMode], [RequirePlanMode], [ContextWindowMaxTokens], [CompactionTriggerPercent], [CompactionTargetPercent], [ConversationSummaryPromptID], [DeclareActionsAsNativeTools]
        FROM [${flyway:defaultSchema}].[AIAgent]
        WHERE [DefaultCoAgentID] = @ID

    OPEN cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID, @MJAIAgents_DefaultCoAgentID_DeclareActionsAsNativeTools

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgent] @ID = @MJAIAgents_DefaultCoAgentIDID, @Name = @MJAIAgents_DefaultCoAgentID_Name, @Description = @MJAIAgents_DefaultCoAgentID_Description, @LogoURL = @MJAIAgents_DefaultCoAgentID_LogoURL, @ParentID = @MJAIAgents_DefaultCoAgentID_ParentID, @ExposeAsAction = @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @ExecutionOrder = @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @ExecutionMode = @MJAIAgents_DefaultCoAgentID_ExecutionMode, @EnableContextCompression = @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @ContextCompressionMessageThreshold = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @ContextCompressionPromptID = @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @ContextCompressionMessageRetentionCount = @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @TypeID = @MJAIAgents_DefaultCoAgentID_TypeID, @Status = @MJAIAgents_DefaultCoAgentID_Status, @DriverClass = @MJAIAgents_DefaultCoAgentID_DriverClass, @IconClass = @MJAIAgents_DefaultCoAgentID_IconClass, @ModelSelectionMode = @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @PayloadDownstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @PayloadUpstreamPaths = @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @PayloadSelfReadPaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @PayloadSelfWritePaths = @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @PayloadScope = @MJAIAgents_DefaultCoAgentID_PayloadScope, @FinalPayloadValidation = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @FinalPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @FinalPayloadValidationMaxRetries = @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MaxCostPerRun = @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MaxTokensPerRun = @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MaxIterationsPerRun = @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MaxTimePerRun = @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MinExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MaxExecutionsPerRun = @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @StartingPayloadValidation = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @StartingPayloadValidationMode = @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @DefaultPromptEffortLevel = @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @ChatHandlingOption = @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @DefaultArtifactTypeID = @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @OwnerUserID = @MJAIAgents_DefaultCoAgentID_OwnerUserID, @InvocationMode = @MJAIAgents_DefaultCoAgentID_InvocationMode, @ArtifactCreationMode = @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @FunctionalRequirements = @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @TechnicalDesign = @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @InjectNotes = @MJAIAgents_DefaultCoAgentID_InjectNotes, @MaxNotesToInject = @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @NoteInjectionStrategy = @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @InjectExamples = @MJAIAgents_DefaultCoAgentID_InjectExamples, @MaxExamplesToInject = @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @ExampleInjectionStrategy = @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @IsRestricted = @MJAIAgents_DefaultCoAgentID_IsRestricted, @MessageMode = @MJAIAgents_DefaultCoAgentID_MessageMode, @MaxMessages = @MJAIAgents_DefaultCoAgentID_MaxMessages, @AttachmentStorageProviderID = @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @AttachmentRootPath = @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @InlineStorageThresholdBytes = @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @AgentTypePromptParams = @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @ScopeConfig = @MJAIAgents_DefaultCoAgentID_ScopeConfig, @NoteRetentionDays = @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @ExampleRetentionDays = @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @AutoArchiveEnabled = @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @RerankerConfiguration = @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @CategoryID = @MJAIAgents_DefaultCoAgentID_CategoryID, @AllowEphemeralClientTools = @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @DefaultStorageAccountID = @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @SearchScopeAccess = @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @AcceptUnregisteredFiles = @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @DefaultCoAgentID_Clear = 1, @DefaultCoAgentID = @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @TypeConfiguration = @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @AllowMemoryWrite = @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @RecordingDefault = @MJAIAgents_DefaultCoAgentID_RecordingDefault, @RecordingStorageProviderID = @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @DefaultMediaCollectionID = @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @SupportsPlanMode = @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @AcceptsSkills = @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @SkillActivationMode = @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @RequirePlanMode = @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @ContextWindowMaxTokens = @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @CompactionTriggerPercent = @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @CompactionTargetPercent = @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @ConversationSummaryPromptID = @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID, @DeclareActionsAsNativeTools = @MJAIAgents_DefaultCoAgentID_DeclareActionsAsNativeTools

        FETCH NEXT FROM cascade_update_MJAIAgents_DefaultCoAgentID_cursor INTO @MJAIAgents_DefaultCoAgentIDID, @MJAIAgents_DefaultCoAgentID_Name, @MJAIAgents_DefaultCoAgentID_Description, @MJAIAgents_DefaultCoAgentID_LogoURL, @MJAIAgents_DefaultCoAgentID_ParentID, @MJAIAgents_DefaultCoAgentID_ExposeAsAction, @MJAIAgents_DefaultCoAgentID_ExecutionOrder, @MJAIAgents_DefaultCoAgentID_ExecutionMode, @MJAIAgents_DefaultCoAgentID_EnableContextCompression, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageThreshold, @MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, @MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRetentionCount, @MJAIAgents_DefaultCoAgentID_TypeID, @MJAIAgents_DefaultCoAgentID_Status, @MJAIAgents_DefaultCoAgentID_DriverClass, @MJAIAgents_DefaultCoAgentID_IconClass, @MJAIAgents_DefaultCoAgentID_ModelSelectionMode, @MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, @MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, @MJAIAgents_DefaultCoAgentID_PayloadScope, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, @MJAIAgents_DefaultCoAgentID_MaxCostPerRun, @MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, @MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, @MJAIAgents_DefaultCoAgentID_MaxTimePerRun, @MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, @MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, @MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, @MJAIAgents_DefaultCoAgentID_ChatHandlingOption, @MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, @MJAIAgents_DefaultCoAgentID_OwnerUserID, @MJAIAgents_DefaultCoAgentID_InvocationMode, @MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, @MJAIAgents_DefaultCoAgentID_FunctionalRequirements, @MJAIAgents_DefaultCoAgentID_TechnicalDesign, @MJAIAgents_DefaultCoAgentID_InjectNotes, @MJAIAgents_DefaultCoAgentID_MaxNotesToInject, @MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, @MJAIAgents_DefaultCoAgentID_InjectExamples, @MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, @MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, @MJAIAgents_DefaultCoAgentID_IsRestricted, @MJAIAgents_DefaultCoAgentID_MessageMode, @MJAIAgents_DefaultCoAgentID_MaxMessages, @MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, @MJAIAgents_DefaultCoAgentID_AttachmentRootPath, @MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, @MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, @MJAIAgents_DefaultCoAgentID_ScopeConfig, @MJAIAgents_DefaultCoAgentID_NoteRetentionDays, @MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, @MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, @MJAIAgents_DefaultCoAgentID_RerankerConfiguration, @MJAIAgents_DefaultCoAgentID_CategoryID, @MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, @MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, @MJAIAgents_DefaultCoAgentID_SearchScopeAccess, @MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, @MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, @MJAIAgents_DefaultCoAgentID_TypeConfiguration, @MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, @MJAIAgents_DefaultCoAgentID_RecordingDefault, @MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, @MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, @MJAIAgents_DefaultCoAgentID_SupportsPlanMode, @MJAIAgents_DefaultCoAgentID_AcceptsSkills, @MJAIAgents_DefaultCoAgentID_SkillActivationMode, @MJAIAgents_DefaultCoAgentID_RequirePlanMode, @MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, @MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, @MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, @MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID, @MJAIAgents_DefaultCoAgentID_DeclareActionsAsNativeTools
    END

    CLOSE cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    DEALLOCATE cascade_update_MJAIAgents_DefaultCoAgentID_cursor
    
    -- Cascade delete from AIBridgeAgentIdentity using cursor to call spDeleteAIBridgeAgentIdentity
    DECLARE @MJAIBridgeAgentIdentities_AgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AIBridgeAgentIdentity]
        WHERE [AgentID] = @ID
    
    OPEN cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor INTO @MJAIBridgeAgentIdentities_AgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAIBridgeAgentIdentity] @ID = @MJAIBridgeAgentIdentities_AgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor INTO @MJAIBridgeAgentIdentities_AgentIDID
    END
    
    CLOSE cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor
    DEALLOCATE cascade_delete_MJAIBridgeAgentIdentities_AgentID_cursor
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun
    DECLARE @MJAIPromptRuns_AgentIDID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_PromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_VendorID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_RunAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_CompletedAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_ExecutionTimeMS int
    DECLARE @MJAIPromptRuns_AgentID_Messages nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_Result nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TokensUsed int
    DECLARE @MJAIPromptRuns_AgentID_TokensPrompt int
    DECLARE @MJAIPromptRuns_AgentID_TokensCompletion int
    DECLARE @MJAIPromptRuns_AgentID_TotalCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_Success bit
    DECLARE @MJAIPromptRuns_AgentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ParentID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_RunType nvarchar(20)
    DECLARE @MJAIPromptRuns_AgentID_ExecutionOrder int
    DECLARE @MJAIPromptRuns_AgentID_Cost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_CostCurrency nvarchar(10)
    DECLARE @MJAIPromptRuns_AgentID_TokensUsedRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensPromptRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensCompletionRollup int
    DECLARE @MJAIPromptRuns_AgentID_Temperature decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_TopP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_TopK int
    DECLARE @MJAIPromptRuns_AgentID_MinP decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_FrequencyPenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_PresencePenalty decimal(3, 2)
    DECLARE @MJAIPromptRuns_AgentID_Seed int
    DECLARE @MJAIPromptRuns_AgentID_StopSequences nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ResponseFormat nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_LogProbs bit
    DECLARE @MJAIPromptRuns_AgentID_TopLogProbs int
    DECLARE @MJAIPromptRuns_AgentID_DescendantCost decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_ValidationAttemptCount int
    DECLARE @MJAIPromptRuns_AgentID_SuccessfulValidationCount int
    DECLARE @MJAIPromptRuns_AgentID_FinalValidationPassed bit
    DECLARE @MJAIPromptRuns_AgentID_ValidationBehavior nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_RetryStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_MaxRetriesConfigured int
    DECLARE @MJAIPromptRuns_AgentID_FinalValidationError nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentID_ValidationErrorCount int
    DECLARE @MJAIPromptRuns_AgentID_CommonValidationError nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentID_FirstAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_LastAttemptAt datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_TotalRetryDurationMS int
    DECLARE @MJAIPromptRuns_AgentID_ValidationAttempts nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ValidationSummary nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_FailoverAttempts int
    DECLARE @MJAIPromptRuns_AgentID_FailoverErrors nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_FailoverDurations nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_OriginalModelID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_OriginalRequestStartTime datetimeoffset
    DECLARE @MJAIPromptRuns_AgentID_TotalFailoverDuration int
    DECLARE @MJAIPromptRuns_AgentID_RerunFromPromptRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ModelSelection nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_Status nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_Cancelled bit
    DECLARE @MJAIPromptRuns_AgentID_CancellationReason nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ModelPowerRank int
    DECLARE @MJAIPromptRuns_AgentID_SelectionStrategy nvarchar(50)
    DECLARE @MJAIPromptRuns_AgentID_CacheHit bit
    DECLARE @MJAIPromptRuns_AgentID_CacheKey nvarchar(500)
    DECLARE @MJAIPromptRuns_AgentID_JudgeID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_JudgeScore float(53)
    DECLARE @MJAIPromptRuns_AgentID_WasSelectedResult bit
    DECLARE @MJAIPromptRuns_AgentID_StreamingEnabled bit
    DECLARE @MJAIPromptRuns_AgentID_FirstTokenTime int
    DECLARE @MJAIPromptRuns_AgentID_ErrorDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_ChildPromptID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_QueueTime int
    DECLARE @MJAIPromptRuns_AgentID_PromptTime int
    DECLARE @MJAIPromptRuns_AgentID_CompletionTime int
    DECLARE @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_EffortLevel int
    DECLARE @MJAIPromptRuns_AgentID_RunName nvarchar(255)
    DECLARE @MJAIPromptRuns_AgentID_Comments nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TestRunID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_AssistantPrefill nvarchar(MAX)
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheRead int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheWrite int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheReadRollup int
    DECLARE @MJAIPromptRuns_AgentID_TokensCacheWriteRollup int
    DECLARE @MJAIPromptRuns_AgentID_InputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_OutputUnitsUsed decimal(19, 8)
    DECLARE @MJAIPromptRuns_AgentID_UsageTypeID uniqueidentifier
    DECLARE @MJAIPromptRuns_AgentID_ToolCallingMode nvarchar(25)
    DECLARE @MJAIPromptRuns_AgentID_UserID uniqueidentifier
    DECLARE cascade_update_MJAIPromptRuns_AgentID_cursor CURSOR FOR
        SELECT [ID], [PromptID], [ModelID], [VendorID], [AgentID], [ConfigurationID], [RunAt], [CompletedAt], [ExecutionTimeMS], [Messages], [Result], [TokensUsed], [TokensPrompt], [TokensCompletion], [TotalCost], [Success], [ErrorMessage], [ParentID], [RunType], [ExecutionOrder], [Cost], [CostCurrency], [TokensUsedRollup], [TokensPromptRollup], [TokensCompletionRollup], [Temperature], [TopP], [TopK], [MinP], [FrequencyPenalty], [PresencePenalty], [Seed], [StopSequences], [ResponseFormat], [LogProbs], [TopLogProbs], [DescendantCost], [ValidationAttemptCount], [SuccessfulValidationCount], [FinalValidationPassed], [ValidationBehavior], [RetryStrategy], [MaxRetriesConfigured], [FinalValidationError], [ValidationErrorCount], [CommonValidationError], [FirstAttemptAt], [LastAttemptAt], [TotalRetryDurationMS], [ValidationAttempts], [ValidationSummary], [FailoverAttempts], [FailoverErrors], [FailoverDurations], [OriginalModelID], [OriginalRequestStartTime], [TotalFailoverDuration], [RerunFromPromptRunID], [ModelSelection], [Status], [Cancelled], [CancellationReason], [ModelPowerRank], [SelectionStrategy], [CacheHit], [CacheKey], [JudgeID], [JudgeScore], [WasSelectedResult], [StreamingEnabled], [FirstTokenTime], [ErrorDetails], [ChildPromptID], [QueueTime], [PromptTime], [CompletionTime], [ModelSpecificResponseDetails], [EffortLevel], [RunName], [Comments], [TestRunID], [AssistantPrefill], [TokensCacheRead], [TokensCacheWrite], [TokensCacheReadRollup], [TokensCacheWriteRollup], [InputUnitsUsed], [OutputUnitsUsed], [UsageTypeID], [ToolCallingMode], [UserID]
        FROM [${flyway:defaultSchema}].[AIPromptRun]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIPromptRuns_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID, @MJAIPromptRuns_AgentID_AssistantPrefill, @MJAIPromptRuns_AgentID_TokensCacheRead, @MJAIPromptRuns_AgentID_TokensCacheWrite, @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @MJAIPromptRuns_AgentID_TokensCacheWriteRollup, @MJAIPromptRuns_AgentID_InputUnitsUsed, @MJAIPromptRuns_AgentID_OutputUnitsUsed, @MJAIPromptRuns_AgentID_UsageTypeID, @MJAIPromptRuns_AgentID_ToolCallingMode, @MJAIPromptRuns_AgentID_UserID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIPromptRuns_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIPromptRun] @ID = @MJAIPromptRuns_AgentIDID, @PromptID = @MJAIPromptRuns_AgentID_PromptID, @ModelID = @MJAIPromptRuns_AgentID_ModelID, @VendorID = @MJAIPromptRuns_AgentID_VendorID, @AgentID_Clear = 1, @AgentID = @MJAIPromptRuns_AgentID_AgentID, @ConfigurationID = @MJAIPromptRuns_AgentID_ConfigurationID, @RunAt = @MJAIPromptRuns_AgentID_RunAt, @CompletedAt = @MJAIPromptRuns_AgentID_CompletedAt, @ExecutionTimeMS = @MJAIPromptRuns_AgentID_ExecutionTimeMS, @Messages = @MJAIPromptRuns_AgentID_Messages, @Result = @MJAIPromptRuns_AgentID_Result, @TokensUsed = @MJAIPromptRuns_AgentID_TokensUsed, @TokensPrompt = @MJAIPromptRuns_AgentID_TokensPrompt, @TokensCompletion = @MJAIPromptRuns_AgentID_TokensCompletion, @TotalCost = @MJAIPromptRuns_AgentID_TotalCost, @Success = @MJAIPromptRuns_AgentID_Success, @ErrorMessage = @MJAIPromptRuns_AgentID_ErrorMessage, @ParentID = @MJAIPromptRuns_AgentID_ParentID, @RunType = @MJAIPromptRuns_AgentID_RunType, @ExecutionOrder = @MJAIPromptRuns_AgentID_ExecutionOrder, @Cost = @MJAIPromptRuns_AgentID_Cost, @CostCurrency = @MJAIPromptRuns_AgentID_CostCurrency, @TokensUsedRollup = @MJAIPromptRuns_AgentID_TokensUsedRollup, @TokensPromptRollup = @MJAIPromptRuns_AgentID_TokensPromptRollup, @TokensCompletionRollup = @MJAIPromptRuns_AgentID_TokensCompletionRollup, @Temperature = @MJAIPromptRuns_AgentID_Temperature, @TopP = @MJAIPromptRuns_AgentID_TopP, @TopK = @MJAIPromptRuns_AgentID_TopK, @MinP = @MJAIPromptRuns_AgentID_MinP, @FrequencyPenalty = @MJAIPromptRuns_AgentID_FrequencyPenalty, @PresencePenalty = @MJAIPromptRuns_AgentID_PresencePenalty, @Seed = @MJAIPromptRuns_AgentID_Seed, @StopSequences = @MJAIPromptRuns_AgentID_StopSequences, @ResponseFormat = @MJAIPromptRuns_AgentID_ResponseFormat, @LogProbs = @MJAIPromptRuns_AgentID_LogProbs, @TopLogProbs = @MJAIPromptRuns_AgentID_TopLogProbs, @DescendantCost = @MJAIPromptRuns_AgentID_DescendantCost, @ValidationAttemptCount = @MJAIPromptRuns_AgentID_ValidationAttemptCount, @SuccessfulValidationCount = @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @FinalValidationPassed = @MJAIPromptRuns_AgentID_FinalValidationPassed, @ValidationBehavior = @MJAIPromptRuns_AgentID_ValidationBehavior, @RetryStrategy = @MJAIPromptRuns_AgentID_RetryStrategy, @MaxRetriesConfigured = @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @FinalValidationError = @MJAIPromptRuns_AgentID_FinalValidationError, @ValidationErrorCount = @MJAIPromptRuns_AgentID_ValidationErrorCount, @CommonValidationError = @MJAIPromptRuns_AgentID_CommonValidationError, @FirstAttemptAt = @MJAIPromptRuns_AgentID_FirstAttemptAt, @LastAttemptAt = @MJAIPromptRuns_AgentID_LastAttemptAt, @TotalRetryDurationMS = @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @ValidationAttempts = @MJAIPromptRuns_AgentID_ValidationAttempts, @ValidationSummary = @MJAIPromptRuns_AgentID_ValidationSummary, @FailoverAttempts = @MJAIPromptRuns_AgentID_FailoverAttempts, @FailoverErrors = @MJAIPromptRuns_AgentID_FailoverErrors, @FailoverDurations = @MJAIPromptRuns_AgentID_FailoverDurations, @OriginalModelID = @MJAIPromptRuns_AgentID_OriginalModelID, @OriginalRequestStartTime = @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @TotalFailoverDuration = @MJAIPromptRuns_AgentID_TotalFailoverDuration, @RerunFromPromptRunID = @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @ModelSelection = @MJAIPromptRuns_AgentID_ModelSelection, @Status = @MJAIPromptRuns_AgentID_Status, @Cancelled = @MJAIPromptRuns_AgentID_Cancelled, @CancellationReason = @MJAIPromptRuns_AgentID_CancellationReason, @ModelPowerRank = @MJAIPromptRuns_AgentID_ModelPowerRank, @SelectionStrategy = @MJAIPromptRuns_AgentID_SelectionStrategy, @CacheHit = @MJAIPromptRuns_AgentID_CacheHit, @CacheKey = @MJAIPromptRuns_AgentID_CacheKey, @JudgeID = @MJAIPromptRuns_AgentID_JudgeID, @JudgeScore = @MJAIPromptRuns_AgentID_JudgeScore, @WasSelectedResult = @MJAIPromptRuns_AgentID_WasSelectedResult, @StreamingEnabled = @MJAIPromptRuns_AgentID_StreamingEnabled, @FirstTokenTime = @MJAIPromptRuns_AgentID_FirstTokenTime, @ErrorDetails = @MJAIPromptRuns_AgentID_ErrorDetails, @ChildPromptID = @MJAIPromptRuns_AgentID_ChildPromptID, @QueueTime = @MJAIPromptRuns_AgentID_QueueTime, @PromptTime = @MJAIPromptRuns_AgentID_PromptTime, @CompletionTime = @MJAIPromptRuns_AgentID_CompletionTime, @ModelSpecificResponseDetails = @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @EffortLevel = @MJAIPromptRuns_AgentID_EffortLevel, @RunName = @MJAIPromptRuns_AgentID_RunName, @Comments = @MJAIPromptRuns_AgentID_Comments, @TestRunID = @MJAIPromptRuns_AgentID_TestRunID, @AssistantPrefill = @MJAIPromptRuns_AgentID_AssistantPrefill, @TokensCacheRead = @MJAIPromptRuns_AgentID_TokensCacheRead, @TokensCacheWrite = @MJAIPromptRuns_AgentID_TokensCacheWrite, @TokensCacheReadRollup = @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @TokensCacheWriteRollup = @MJAIPromptRuns_AgentID_TokensCacheWriteRollup, @InputUnitsUsed = @MJAIPromptRuns_AgentID_InputUnitsUsed, @OutputUnitsUsed = @MJAIPromptRuns_AgentID_OutputUnitsUsed, @UsageTypeID = @MJAIPromptRuns_AgentID_UsageTypeID, @ToolCallingMode = @MJAIPromptRuns_AgentID_ToolCallingMode, @UserID = @MJAIPromptRuns_AgentID_UserID

        FETCH NEXT FROM cascade_update_MJAIPromptRuns_AgentID_cursor INTO @MJAIPromptRuns_AgentIDID, @MJAIPromptRuns_AgentID_PromptID, @MJAIPromptRuns_AgentID_ModelID, @MJAIPromptRuns_AgentID_VendorID, @MJAIPromptRuns_AgentID_AgentID, @MJAIPromptRuns_AgentID_ConfigurationID, @MJAIPromptRuns_AgentID_RunAt, @MJAIPromptRuns_AgentID_CompletedAt, @MJAIPromptRuns_AgentID_ExecutionTimeMS, @MJAIPromptRuns_AgentID_Messages, @MJAIPromptRuns_AgentID_Result, @MJAIPromptRuns_AgentID_TokensUsed, @MJAIPromptRuns_AgentID_TokensPrompt, @MJAIPromptRuns_AgentID_TokensCompletion, @MJAIPromptRuns_AgentID_TotalCost, @MJAIPromptRuns_AgentID_Success, @MJAIPromptRuns_AgentID_ErrorMessage, @MJAIPromptRuns_AgentID_ParentID, @MJAIPromptRuns_AgentID_RunType, @MJAIPromptRuns_AgentID_ExecutionOrder, @MJAIPromptRuns_AgentID_Cost, @MJAIPromptRuns_AgentID_CostCurrency, @MJAIPromptRuns_AgentID_TokensUsedRollup, @MJAIPromptRuns_AgentID_TokensPromptRollup, @MJAIPromptRuns_AgentID_TokensCompletionRollup, @MJAIPromptRuns_AgentID_Temperature, @MJAIPromptRuns_AgentID_TopP, @MJAIPromptRuns_AgentID_TopK, @MJAIPromptRuns_AgentID_MinP, @MJAIPromptRuns_AgentID_FrequencyPenalty, @MJAIPromptRuns_AgentID_PresencePenalty, @MJAIPromptRuns_AgentID_Seed, @MJAIPromptRuns_AgentID_StopSequences, @MJAIPromptRuns_AgentID_ResponseFormat, @MJAIPromptRuns_AgentID_LogProbs, @MJAIPromptRuns_AgentID_TopLogProbs, @MJAIPromptRuns_AgentID_DescendantCost, @MJAIPromptRuns_AgentID_ValidationAttemptCount, @MJAIPromptRuns_AgentID_SuccessfulValidationCount, @MJAIPromptRuns_AgentID_FinalValidationPassed, @MJAIPromptRuns_AgentID_ValidationBehavior, @MJAIPromptRuns_AgentID_RetryStrategy, @MJAIPromptRuns_AgentID_MaxRetriesConfigured, @MJAIPromptRuns_AgentID_FinalValidationError, @MJAIPromptRuns_AgentID_ValidationErrorCount, @MJAIPromptRuns_AgentID_CommonValidationError, @MJAIPromptRuns_AgentID_FirstAttemptAt, @MJAIPromptRuns_AgentID_LastAttemptAt, @MJAIPromptRuns_AgentID_TotalRetryDurationMS, @MJAIPromptRuns_AgentID_ValidationAttempts, @MJAIPromptRuns_AgentID_ValidationSummary, @MJAIPromptRuns_AgentID_FailoverAttempts, @MJAIPromptRuns_AgentID_FailoverErrors, @MJAIPromptRuns_AgentID_FailoverDurations, @MJAIPromptRuns_AgentID_OriginalModelID, @MJAIPromptRuns_AgentID_OriginalRequestStartTime, @MJAIPromptRuns_AgentID_TotalFailoverDuration, @MJAIPromptRuns_AgentID_RerunFromPromptRunID, @MJAIPromptRuns_AgentID_ModelSelection, @MJAIPromptRuns_AgentID_Status, @MJAIPromptRuns_AgentID_Cancelled, @MJAIPromptRuns_AgentID_CancellationReason, @MJAIPromptRuns_AgentID_ModelPowerRank, @MJAIPromptRuns_AgentID_SelectionStrategy, @MJAIPromptRuns_AgentID_CacheHit, @MJAIPromptRuns_AgentID_CacheKey, @MJAIPromptRuns_AgentID_JudgeID, @MJAIPromptRuns_AgentID_JudgeScore, @MJAIPromptRuns_AgentID_WasSelectedResult, @MJAIPromptRuns_AgentID_StreamingEnabled, @MJAIPromptRuns_AgentID_FirstTokenTime, @MJAIPromptRuns_AgentID_ErrorDetails, @MJAIPromptRuns_AgentID_ChildPromptID, @MJAIPromptRuns_AgentID_QueueTime, @MJAIPromptRuns_AgentID_PromptTime, @MJAIPromptRuns_AgentID_CompletionTime, @MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, @MJAIPromptRuns_AgentID_EffortLevel, @MJAIPromptRuns_AgentID_RunName, @MJAIPromptRuns_AgentID_Comments, @MJAIPromptRuns_AgentID_TestRunID, @MJAIPromptRuns_AgentID_AssistantPrefill, @MJAIPromptRuns_AgentID_TokensCacheRead, @MJAIPromptRuns_AgentID_TokensCacheWrite, @MJAIPromptRuns_AgentID_TokensCacheReadRollup, @MJAIPromptRuns_AgentID_TokensCacheWriteRollup, @MJAIPromptRuns_AgentID_InputUnitsUsed, @MJAIPromptRuns_AgentID_OutputUnitsUsed, @MJAIPromptRuns_AgentID_UsageTypeID, @MJAIPromptRuns_AgentID_ToolCallingMode, @MJAIPromptRuns_AgentID_UserID
    END

    CLOSE cascade_update_MJAIPromptRuns_AgentID_cursor
    DEALLOCATE cascade_update_MJAIPromptRuns_AgentID_cursor
    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache
    DECLARE @MJAIResultCache_AgentIDID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AIPromptID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AIModelID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_RunAt datetimeoffset
    DECLARE @MJAIResultCache_AgentID_PromptText nvarchar(MAX)
    DECLARE @MJAIResultCache_AgentID_ResultText nvarchar(MAX)
    DECLARE @MJAIResultCache_AgentID_Status nvarchar(50)
    DECLARE @MJAIResultCache_AgentID_ExpiredOn datetimeoffset
    DECLARE @MJAIResultCache_AgentID_VendorID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_AgentID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_ConfigurationID uniqueidentifier
    DECLARE @MJAIResultCache_AgentID_PromptEmbedding varbinary(MAX)
    DECLARE @MJAIResultCache_AgentID_PromptRunID uniqueidentifier
    DECLARE cascade_update_MJAIResultCache_AgentID_cursor CURSOR FOR
        SELECT [ID], [AIPromptID], [AIModelID], [RunAt], [PromptText], [ResultText], [Status], [ExpiredOn], [VendorID], [AgentID], [ConfigurationID], [PromptEmbedding], [PromptRunID]
        FROM [${flyway:defaultSchema}].[AIResultCache]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJAIResultCache_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJAIResultCache_AgentID_cursor INTO @MJAIResultCache_AgentIDID, @MJAIResultCache_AgentID_AIPromptID, @MJAIResultCache_AgentID_AIModelID, @MJAIResultCache_AgentID_RunAt, @MJAIResultCache_AgentID_PromptText, @MJAIResultCache_AgentID_ResultText, @MJAIResultCache_AgentID_Status, @MJAIResultCache_AgentID_ExpiredOn, @MJAIResultCache_AgentID_VendorID, @MJAIResultCache_AgentID_AgentID, @MJAIResultCache_AgentID_ConfigurationID, @MJAIResultCache_AgentID_PromptEmbedding, @MJAIResultCache_AgentID_PromptRunID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJAIResultCache_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIResultCache] @ID = @MJAIResultCache_AgentIDID, @AIPromptID = @MJAIResultCache_AgentID_AIPromptID, @AIModelID = @MJAIResultCache_AgentID_AIModelID, @RunAt = @MJAIResultCache_AgentID_RunAt, @PromptText = @MJAIResultCache_AgentID_PromptText, @ResultText = @MJAIResultCache_AgentID_ResultText, @Status = @MJAIResultCache_AgentID_Status, @ExpiredOn = @MJAIResultCache_AgentID_ExpiredOn, @VendorID = @MJAIResultCache_AgentID_VendorID, @AgentID_Clear = 1, @AgentID = @MJAIResultCache_AgentID_AgentID, @ConfigurationID = @MJAIResultCache_AgentID_ConfigurationID, @PromptEmbedding = @MJAIResultCache_AgentID_PromptEmbedding, @PromptRunID = @MJAIResultCache_AgentID_PromptRunID

        FETCH NEXT FROM cascade_update_MJAIResultCache_AgentID_cursor INTO @MJAIResultCache_AgentIDID, @MJAIResultCache_AgentID_AIPromptID, @MJAIResultCache_AgentID_AIModelID, @MJAIResultCache_AgentID_RunAt, @MJAIResultCache_AgentID_PromptText, @MJAIResultCache_AgentID_ResultText, @MJAIResultCache_AgentID_Status, @MJAIResultCache_AgentID_ExpiredOn, @MJAIResultCache_AgentID_VendorID, @MJAIResultCache_AgentID_AgentID, @MJAIResultCache_AgentID_ConfigurationID, @MJAIResultCache_AgentID_PromptEmbedding, @MJAIResultCache_AgentID_PromptRunID
    END

    CLOSE cascade_update_MJAIResultCache_AgentID_cursor
    DEALLOCATE cascade_update_MJAIResultCache_AgentID_cursor
    
    -- Cascade delete from AISkillSubAgent using cursor to call spDeleteAISkillSubAgent
    DECLARE @MJAISkillSubAgents_SubAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[AISkillSubAgent]
        WHERE [SubAgentID] = @ID
    
    OPEN cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJAISkillSubAgents_SubAgentID_cursor INTO @MJAISkillSubAgents_SubAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteAISkillSubAgent] @ID = @MJAISkillSubAgents_SubAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJAISkillSubAgents_SubAgentID_cursor INTO @MJAISkillSubAgents_SubAgentIDID
    END
    
    CLOSE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    DEALLOCATE cascade_delete_MJAISkillSubAgents_SubAgentID_cursor
    
    -- Cascade update on Action using cursor to call spUpdateAction
    DECLARE @MJActions_CreatedByAgentIDID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_CategoryID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_Name nvarchar(425)
    DECLARE @MJActions_CreatedByAgentID_Description nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_Type nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_UserPrompt nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_UserComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_Code nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovalStatus nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovalComments nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_CodeApprovedByUserID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_CodeApprovedAt datetimeoffset
    DECLARE @MJActions_CreatedByAgentID_CodeLocked bit
    DECLARE @MJActions_CreatedByAgentID_ForceCodeGeneration bit
    DECLARE @MJActions_CreatedByAgentID_RetentionPeriod int
    DECLARE @MJActions_CreatedByAgentID_Status nvarchar(20)
    DECLARE @MJActions_CreatedByAgentID_DriverClass nvarchar(255)
    DECLARE @MJActions_CreatedByAgentID_ParentID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_IconClass nvarchar(100)
    DECLARE @MJActions_CreatedByAgentID_DefaultCompactPromptID uniqueidentifier
    DECLARE @MJActions_CreatedByAgentID_Config nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_RuntimeActionConfiguration nvarchar(MAX)
    DECLARE @MJActions_CreatedByAgentID_MaxExecutionTimeMS int
    DECLARE @MJActions_CreatedByAgentID_CreatedByAgentID uniqueidentifier
    DECLARE cascade_update_MJActions_CreatedByAgentID_cursor CURSOR FOR
        SELECT [ID], [CategoryID], [Name], [Description], [Type], [UserPrompt], [UserComments], [Code], [CodeComments], [CodeApprovalStatus], [CodeApprovalComments], [CodeApprovedByUserID], [CodeApprovedAt], [CodeLocked], [ForceCodeGeneration], [RetentionPeriod], [Status], [DriverClass], [ParentID], [IconClass], [DefaultCompactPromptID], [Config], [RuntimeActionConfiguration], [MaxExecutionTimeMS], [CreatedByAgentID]
        FROM [${flyway:defaultSchema}].[Action]
        WHERE [CreatedByAgentID] = @ID

    OPEN cascade_update_MJActions_CreatedByAgentID_cursor
    FETCH NEXT FROM cascade_update_MJActions_CreatedByAgentID_cursor INTO @MJActions_CreatedByAgentIDID, @MJActions_CreatedByAgentID_CategoryID, @MJActions_CreatedByAgentID_Name, @MJActions_CreatedByAgentID_Description, @MJActions_CreatedByAgentID_Type, @MJActions_CreatedByAgentID_UserPrompt, @MJActions_CreatedByAgentID_UserComments, @MJActions_CreatedByAgentID_Code, @MJActions_CreatedByAgentID_CodeComments, @MJActions_CreatedByAgentID_CodeApprovalStatus, @MJActions_CreatedByAgentID_CodeApprovalComments, @MJActions_CreatedByAgentID_CodeApprovedByUserID, @MJActions_CreatedByAgentID_CodeApprovedAt, @MJActions_CreatedByAgentID_CodeLocked, @MJActions_CreatedByAgentID_ForceCodeGeneration, @MJActions_CreatedByAgentID_RetentionPeriod, @MJActions_CreatedByAgentID_Status, @MJActions_CreatedByAgentID_DriverClass, @MJActions_CreatedByAgentID_ParentID, @MJActions_CreatedByAgentID_IconClass, @MJActions_CreatedByAgentID_DefaultCompactPromptID, @MJActions_CreatedByAgentID_Config, @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @MJActions_CreatedByAgentID_CreatedByAgentID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJActions_CreatedByAgentID_CreatedByAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAction] @ID = @MJActions_CreatedByAgentIDID, @CategoryID = @MJActions_CreatedByAgentID_CategoryID, @Name = @MJActions_CreatedByAgentID_Name, @Description = @MJActions_CreatedByAgentID_Description, @Type = @MJActions_CreatedByAgentID_Type, @UserPrompt = @MJActions_CreatedByAgentID_UserPrompt, @UserComments = @MJActions_CreatedByAgentID_UserComments, @Code = @MJActions_CreatedByAgentID_Code, @CodeComments = @MJActions_CreatedByAgentID_CodeComments, @CodeApprovalStatus = @MJActions_CreatedByAgentID_CodeApprovalStatus, @CodeApprovalComments = @MJActions_CreatedByAgentID_CodeApprovalComments, @CodeApprovedByUserID = @MJActions_CreatedByAgentID_CodeApprovedByUserID, @CodeApprovedAt = @MJActions_CreatedByAgentID_CodeApprovedAt, @CodeLocked = @MJActions_CreatedByAgentID_CodeLocked, @ForceCodeGeneration = @MJActions_CreatedByAgentID_ForceCodeGeneration, @RetentionPeriod = @MJActions_CreatedByAgentID_RetentionPeriod, @Status = @MJActions_CreatedByAgentID_Status, @DriverClass = @MJActions_CreatedByAgentID_DriverClass, @ParentID = @MJActions_CreatedByAgentID_ParentID, @IconClass = @MJActions_CreatedByAgentID_IconClass, @DefaultCompactPromptID = @MJActions_CreatedByAgentID_DefaultCompactPromptID, @Config = @MJActions_CreatedByAgentID_Config, @RuntimeActionConfiguration = @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MaxExecutionTimeMS = @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @CreatedByAgentID_Clear = 1, @CreatedByAgentID = @MJActions_CreatedByAgentID_CreatedByAgentID

        FETCH NEXT FROM cascade_update_MJActions_CreatedByAgentID_cursor INTO @MJActions_CreatedByAgentIDID, @MJActions_CreatedByAgentID_CategoryID, @MJActions_CreatedByAgentID_Name, @MJActions_CreatedByAgentID_Description, @MJActions_CreatedByAgentID_Type, @MJActions_CreatedByAgentID_UserPrompt, @MJActions_CreatedByAgentID_UserComments, @MJActions_CreatedByAgentID_Code, @MJActions_CreatedByAgentID_CodeComments, @MJActions_CreatedByAgentID_CodeApprovalStatus, @MJActions_CreatedByAgentID_CodeApprovalComments, @MJActions_CreatedByAgentID_CodeApprovedByUserID, @MJActions_CreatedByAgentID_CodeApprovedAt, @MJActions_CreatedByAgentID_CodeLocked, @MJActions_CreatedByAgentID_ForceCodeGeneration, @MJActions_CreatedByAgentID_RetentionPeriod, @MJActions_CreatedByAgentID_Status, @MJActions_CreatedByAgentID_DriverClass, @MJActions_CreatedByAgentID_ParentID, @MJActions_CreatedByAgentID_IconClass, @MJActions_CreatedByAgentID_DefaultCompactPromptID, @MJActions_CreatedByAgentID_Config, @MJActions_CreatedByAgentID_RuntimeActionConfiguration, @MJActions_CreatedByAgentID_MaxExecutionTimeMS, @MJActions_CreatedByAgentID_CreatedByAgentID
    END

    CLOSE cascade_update_MJActions_CreatedByAgentID_cursor
    DEALLOCATE cascade_update_MJActions_CreatedByAgentID_cursor
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @MJConversationDetails_AgentIDID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ConversationID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ExternalID nvarchar(100)
    DECLARE @MJConversationDetails_AgentID_Role nvarchar(20)
    DECLARE @MJConversationDetails_AgentID_Message nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_Error nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_HiddenToUser bit
    DECLARE @MJConversationDetails_AgentID_UserRating int
    DECLARE @MJConversationDetails_AgentID_UserFeedback nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_ReflectionInsights nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_UserID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ArtifactID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ArtifactVersionID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_CompletionTime bigint
    DECLARE @MJConversationDetails_AgentID_IsPinned bit
    DECLARE @MJConversationDetails_AgentID_ParentID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_AgentID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_Status nvarchar(20)
    DECLARE @MJConversationDetails_AgentID_SuggestedResponses nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_TestRunID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_ResponseForm nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_ActionableCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_AutomaticCommands nvarchar(MAX)
    DECLARE @MJConversationDetails_AgentID_OriginalMessageChanged bit
    DECLARE @MJConversationDetails_AgentID_AgentSessionID uniqueidentifier
    DECLARE @MJConversationDetails_AgentID_TurnEndedAt datetimeoffset
    DECLARE @MJConversationDetails_AgentID_UtteranceStartMs int
    DECLARE @MJConversationDetails_AgentID_UtteranceEndMs int
    DECLARE @MJConversationDetails_AgentID_MediaType nvarchar(20)
    DECLARE cascade_update_MJConversationDetails_AgentID_cursor CURSOR FOR
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status], [SuggestedResponses], [TestRunID], [ResponseForm], [ActionableCommands], [AutomaticCommands], [OriginalMessageChanged], [AgentSessionID], [TurnEndedAt], [UtteranceStartMs], [UtteranceEndMs], [MediaType]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJConversationDetails_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged, @MJConversationDetails_AgentID_AgentSessionID, @MJConversationDetails_AgentID_TurnEndedAt, @MJConversationDetails_AgentID_UtteranceStartMs, @MJConversationDetails_AgentID_UtteranceEndMs, @MJConversationDetails_AgentID_MediaType

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversationDetails_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @MJConversationDetails_AgentIDID, @ConversationID = @MJConversationDetails_AgentID_ConversationID, @ExternalID = @MJConversationDetails_AgentID_ExternalID, @Role = @MJConversationDetails_AgentID_Role, @Message = @MJConversationDetails_AgentID_Message, @Error = @MJConversationDetails_AgentID_Error, @HiddenToUser = @MJConversationDetails_AgentID_HiddenToUser, @UserRating = @MJConversationDetails_AgentID_UserRating, @UserFeedback = @MJConversationDetails_AgentID_UserFeedback, @ReflectionInsights = @MJConversationDetails_AgentID_ReflectionInsights, @SummaryOfEarlierConversation = @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @UserID = @MJConversationDetails_AgentID_UserID, @ArtifactID = @MJConversationDetails_AgentID_ArtifactID, @ArtifactVersionID = @MJConversationDetails_AgentID_ArtifactVersionID, @CompletionTime = @MJConversationDetails_AgentID_CompletionTime, @IsPinned = @MJConversationDetails_AgentID_IsPinned, @ParentID = @MJConversationDetails_AgentID_ParentID, @AgentID_Clear = 1, @AgentID = @MJConversationDetails_AgentID_AgentID, @Status = @MJConversationDetails_AgentID_Status, @SuggestedResponses = @MJConversationDetails_AgentID_SuggestedResponses, @TestRunID = @MJConversationDetails_AgentID_TestRunID, @ResponseForm = @MJConversationDetails_AgentID_ResponseForm, @ActionableCommands = @MJConversationDetails_AgentID_ActionableCommands, @AutomaticCommands = @MJConversationDetails_AgentID_AutomaticCommands, @OriginalMessageChanged = @MJConversationDetails_AgentID_OriginalMessageChanged, @AgentSessionID = @MJConversationDetails_AgentID_AgentSessionID, @TurnEndedAt = @MJConversationDetails_AgentID_TurnEndedAt, @UtteranceStartMs = @MJConversationDetails_AgentID_UtteranceStartMs, @UtteranceEndMs = @MJConversationDetails_AgentID_UtteranceEndMs, @MediaType = @MJConversationDetails_AgentID_MediaType

        FETCH NEXT FROM cascade_update_MJConversationDetails_AgentID_cursor INTO @MJConversationDetails_AgentIDID, @MJConversationDetails_AgentID_ConversationID, @MJConversationDetails_AgentID_ExternalID, @MJConversationDetails_AgentID_Role, @MJConversationDetails_AgentID_Message, @MJConversationDetails_AgentID_Error, @MJConversationDetails_AgentID_HiddenToUser, @MJConversationDetails_AgentID_UserRating, @MJConversationDetails_AgentID_UserFeedback, @MJConversationDetails_AgentID_ReflectionInsights, @MJConversationDetails_AgentID_SummaryOfEarlierConversation, @MJConversationDetails_AgentID_UserID, @MJConversationDetails_AgentID_ArtifactID, @MJConversationDetails_AgentID_ArtifactVersionID, @MJConversationDetails_AgentID_CompletionTime, @MJConversationDetails_AgentID_IsPinned, @MJConversationDetails_AgentID_ParentID, @MJConversationDetails_AgentID_AgentID, @MJConversationDetails_AgentID_Status, @MJConversationDetails_AgentID_SuggestedResponses, @MJConversationDetails_AgentID_TestRunID, @MJConversationDetails_AgentID_ResponseForm, @MJConversationDetails_AgentID_ActionableCommands, @MJConversationDetails_AgentID_AutomaticCommands, @MJConversationDetails_AgentID_OriginalMessageChanged, @MJConversationDetails_AgentID_AgentSessionID, @MJConversationDetails_AgentID_TurnEndedAt, @MJConversationDetails_AgentID_UtteranceStartMs, @MJConversationDetails_AgentID_UtteranceEndMs, @MJConversationDetails_AgentID_MediaType
    END

    CLOSE cascade_update_MJConversationDetails_AgentID_cursor
    DEALLOCATE cascade_update_MJConversationDetails_AgentID_cursor
    
    -- Cascade delete from ConversationWidgetInstance using cursor to call spDeleteConversationWidgetInstance
    DECLARE @MJConversationWidgetInstances_PinnedAgentIDID uniqueidentifier
    DECLARE cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationWidgetInstance]
        WHERE [PinnedAgentID] = @ID
    
    OPEN cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor
    FETCH NEXT FROM cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor INTO @MJConversationWidgetInstances_PinnedAgentIDID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        EXEC [${flyway:defaultSchema}].[spDeleteConversationWidgetInstance] @ID = @MJConversationWidgetInstances_PinnedAgentIDID
        
        FETCH NEXT FROM cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor INTO @MJConversationWidgetInstances_PinnedAgentIDID
    END
    
    CLOSE cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor
    DEALLOCATE cascade_delete_MJConversationWidgetInstances_PinnedAgentID_cursor
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation
    DECLARE @MJConversations_DefaultAgentIDID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_UserID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ExternalID nvarchar(500)
    DECLARE @MJConversations_DefaultAgentID_Name nvarchar(255)
    DECLARE @MJConversations_DefaultAgentID_Description nvarchar(MAX)
    DECLARE @MJConversations_DefaultAgentID_Type nvarchar(50)
    DECLARE @MJConversations_DefaultAgentID_IsArchived bit
    DECLARE @MJConversations_DefaultAgentID_LinkedEntityID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_LinkedRecordID nvarchar(500)
    DECLARE @MJConversations_DefaultAgentID_DataContextID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_Status nvarchar(20)
    DECLARE @MJConversations_DefaultAgentID_EnvironmentID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ProjectID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_IsPinned bit
    DECLARE @MJConversations_DefaultAgentID_TestRunID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_ApplicationScope nvarchar(20)
    DECLARE @MJConversations_DefaultAgentID_ApplicationID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_DefaultAgentID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_AdditionalData nvarchar(MAX)
    DECLARE @MJConversations_DefaultAgentID_RecordingFileID uniqueidentifier
    DECLARE @MJConversations_DefaultAgentID_EgressID nvarchar(255)
    DECLARE @MJConversations_DefaultAgentID_VisitorKey nvarchar(255)
    DECLARE @MJConversations_DefaultAgentID_LastConversationID uniqueidentifier
    DECLARE cascade_update_MJConversations_DefaultAgentID_cursor CURSOR FOR
        SELECT [ID], [UserID], [ExternalID], [Name], [Description], [Type], [IsArchived], [LinkedEntityID], [LinkedRecordID], [DataContextID], [Status], [EnvironmentID], [ProjectID], [IsPinned], [TestRunID], [ApplicationScope], [ApplicationID], [DefaultAgentID], [AdditionalData], [RecordingFileID], [EgressID], [VisitorKey], [LastConversationID]
        FROM [${flyway:defaultSchema}].[Conversation]
        WHERE [DefaultAgentID] = @ID

    OPEN cascade_update_MJConversations_DefaultAgentID_cursor
    FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData, @MJConversations_DefaultAgentID_RecordingFileID, @MJConversations_DefaultAgentID_EgressID, @MJConversations_DefaultAgentID_VisitorKey, @MJConversations_DefaultAgentID_LastConversationID

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJConversations_DefaultAgentID_DefaultAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversation] @ID = @MJConversations_DefaultAgentIDID, @UserID = @MJConversations_DefaultAgentID_UserID, @ExternalID = @MJConversations_DefaultAgentID_ExternalID, @Name = @MJConversations_DefaultAgentID_Name, @Description = @MJConversations_DefaultAgentID_Description, @Type = @MJConversations_DefaultAgentID_Type, @IsArchived = @MJConversations_DefaultAgentID_IsArchived, @LinkedEntityID = @MJConversations_DefaultAgentID_LinkedEntityID, @LinkedRecordID = @MJConversations_DefaultAgentID_LinkedRecordID, @DataContextID = @MJConversations_DefaultAgentID_DataContextID, @Status = @MJConversations_DefaultAgentID_Status, @EnvironmentID = @MJConversations_DefaultAgentID_EnvironmentID, @ProjectID = @MJConversations_DefaultAgentID_ProjectID, @IsPinned = @MJConversations_DefaultAgentID_IsPinned, @TestRunID = @MJConversations_DefaultAgentID_TestRunID, @ApplicationScope = @MJConversations_DefaultAgentID_ApplicationScope, @ApplicationID = @MJConversations_DefaultAgentID_ApplicationID, @DefaultAgentID_Clear = 1, @DefaultAgentID = @MJConversations_DefaultAgentID_DefaultAgentID, @AdditionalData = @MJConversations_DefaultAgentID_AdditionalData, @RecordingFileID = @MJConversations_DefaultAgentID_RecordingFileID, @EgressID = @MJConversations_DefaultAgentID_EgressID, @VisitorKey = @MJConversations_DefaultAgentID_VisitorKey, @LastConversationID = @MJConversations_DefaultAgentID_LastConversationID

        FETCH NEXT FROM cascade_update_MJConversations_DefaultAgentID_cursor INTO @MJConversations_DefaultAgentIDID, @MJConversations_DefaultAgentID_UserID, @MJConversations_DefaultAgentID_ExternalID, @MJConversations_DefaultAgentID_Name, @MJConversations_DefaultAgentID_Description, @MJConversations_DefaultAgentID_Type, @MJConversations_DefaultAgentID_IsArchived, @MJConversations_DefaultAgentID_LinkedEntityID, @MJConversations_DefaultAgentID_LinkedRecordID, @MJConversations_DefaultAgentID_DataContextID, @MJConversations_DefaultAgentID_Status, @MJConversations_DefaultAgentID_EnvironmentID, @MJConversations_DefaultAgentID_ProjectID, @MJConversations_DefaultAgentID_IsPinned, @MJConversations_DefaultAgentID_TestRunID, @MJConversations_DefaultAgentID_ApplicationScope, @MJConversations_DefaultAgentID_ApplicationID, @MJConversations_DefaultAgentID_DefaultAgentID, @MJConversations_DefaultAgentID_AdditionalData, @MJConversations_DefaultAgentID_RecordingFileID, @MJConversations_DefaultAgentID_EgressID, @MJConversations_DefaultAgentID_VisitorKey, @MJConversations_DefaultAgentID_LastConversationID
    END

    CLOSE cascade_update_MJConversations_DefaultAgentID_cursor
    DEALLOCATE cascade_update_MJConversations_DefaultAgentID_cursor
    
    -- Cascade update on EntityDocument using cursor to call spUpdateEntityDocument
    DECLARE @MJEntityDocuments_ReasoningAgentIDID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_Name nvarchar(250)
    DECLARE @MJEntityDocuments_ReasoningAgentID_TypeID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_EntityID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_Status nvarchar(15)
    DECLARE @MJEntityDocuments_ReasoningAgentID_TemplateID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_AIModelID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningAgentID_VectorIndexID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_Configuration nvarchar(MAX)
    DECLARE @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning bit
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningMode nvarchar(20)
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold numeric(12, 11)
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID uniqueidentifier
    DECLARE @MJEntityDocuments_ReasoningAgentID_AutomationLevel nvarchar(30)
    DECLARE cascade_update_MJEntityDocuments_ReasoningAgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [TypeID], [EntityID], [VectorDatabaseID], [Status], [TemplateID], [AIModelID], [PotentialMatchThreshold], [AbsoluteMatchThreshold], [VectorIndexID], [Configuration], [EnableLLMReasoning], [ReasoningMode], [ReasoningThreshold], [ReasoningPromptID], [ReasoningAgentID], [AutomationLevel]
        FROM [${flyway:defaultSchema}].[EntityDocument]
        WHERE [ReasoningAgentID] = @ID

    OPEN cascade_update_MJEntityDocuments_ReasoningAgentID_cursor
    FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningAgentID_cursor INTO @MJEntityDocuments_ReasoningAgentIDID, @MJEntityDocuments_ReasoningAgentID_Name, @MJEntityDocuments_ReasoningAgentID_TypeID, @MJEntityDocuments_ReasoningAgentID_EntityID, @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID, @MJEntityDocuments_ReasoningAgentID_Status, @MJEntityDocuments_ReasoningAgentID_TemplateID, @MJEntityDocuments_ReasoningAgentID_AIModelID, @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningAgentID_VectorIndexID, @MJEntityDocuments_ReasoningAgentID_Configuration, @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning, @MJEntityDocuments_ReasoningAgentID_ReasoningMode, @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold, @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID, @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID, @MJEntityDocuments_ReasoningAgentID_AutomationLevel

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateEntityDocument] @ID = @MJEntityDocuments_ReasoningAgentIDID, @Name = @MJEntityDocuments_ReasoningAgentID_Name, @TypeID = @MJEntityDocuments_ReasoningAgentID_TypeID, @EntityID = @MJEntityDocuments_ReasoningAgentID_EntityID, @VectorDatabaseID = @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID, @Status = @MJEntityDocuments_ReasoningAgentID_Status, @TemplateID = @MJEntityDocuments_ReasoningAgentID_TemplateID, @AIModelID = @MJEntityDocuments_ReasoningAgentID_AIModelID, @PotentialMatchThreshold = @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold, @AbsoluteMatchThreshold = @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold, @VectorIndexID = @MJEntityDocuments_ReasoningAgentID_VectorIndexID, @Configuration = @MJEntityDocuments_ReasoningAgentID_Configuration, @EnableLLMReasoning = @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning, @ReasoningMode = @MJEntityDocuments_ReasoningAgentID_ReasoningMode, @ReasoningThreshold = @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold, @ReasoningPromptID = @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID, @ReasoningAgentID_Clear = 1, @ReasoningAgentID = @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID, @AutomationLevel = @MJEntityDocuments_ReasoningAgentID_AutomationLevel

        FETCH NEXT FROM cascade_update_MJEntityDocuments_ReasoningAgentID_cursor INTO @MJEntityDocuments_ReasoningAgentIDID, @MJEntityDocuments_ReasoningAgentID_Name, @MJEntityDocuments_ReasoningAgentID_TypeID, @MJEntityDocuments_ReasoningAgentID_EntityID, @MJEntityDocuments_ReasoningAgentID_VectorDatabaseID, @MJEntityDocuments_ReasoningAgentID_Status, @MJEntityDocuments_ReasoningAgentID_TemplateID, @MJEntityDocuments_ReasoningAgentID_AIModelID, @MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold, @MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold, @MJEntityDocuments_ReasoningAgentID_VectorIndexID, @MJEntityDocuments_ReasoningAgentID_Configuration, @MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning, @MJEntityDocuments_ReasoningAgentID_ReasoningMode, @MJEntityDocuments_ReasoningAgentID_ReasoningThreshold, @MJEntityDocuments_ReasoningAgentID_ReasoningPromptID, @MJEntityDocuments_ReasoningAgentID_ReasoningAgentID, @MJEntityDocuments_ReasoningAgentID_AutomationLevel
    END

    CLOSE cascade_update_MJEntityDocuments_ReasoningAgentID_cursor
    DEALLOCATE cascade_update_MJEntityDocuments_ReasoningAgentID_cursor
    
    -- Cascade update on InteractionEvent using cursor to call spUpdateInteractionEvent
    DECLARE @MJInteractionEvents_ActorAgentIDID uniqueidentifier
    DECLARE @MJInteractionEvents_ActorAgentID_InteractionID uniqueidentifier
    DECLARE @MJInteractionEvents_ActorAgentID_EventType nvarchar(20)
    DECLARE @MJInteractionEvents_ActorAgentID_OccurredAt datetimeoffset
    DECLARE @MJInteractionEvents_ActorAgentID_ActorUserID uniqueidentifier
    DECLARE @MJInteractionEvents_ActorAgentID_ActorAgentID uniqueidentifier
    DECLARE @MJInteractionEvents_ActorAgentID_Details nvarchar(MAX)
    DECLARE cascade_update_MJInteractionEvents_ActorAgentID_cursor CURSOR FOR
        SELECT [ID], [InteractionID], [EventType], [OccurredAt], [ActorUserID], [ActorAgentID], [Details]
        FROM [${flyway:defaultSchema}].[InteractionEvent]
        WHERE [ActorAgentID] = @ID

    OPEN cascade_update_MJInteractionEvents_ActorAgentID_cursor
    FETCH NEXT FROM cascade_update_MJInteractionEvents_ActorAgentID_cursor INTO @MJInteractionEvents_ActorAgentIDID, @MJInteractionEvents_ActorAgentID_InteractionID, @MJInteractionEvents_ActorAgentID_EventType, @MJInteractionEvents_ActorAgentID_OccurredAt, @MJInteractionEvents_ActorAgentID_ActorUserID, @MJInteractionEvents_ActorAgentID_ActorAgentID, @MJInteractionEvents_ActorAgentID_Details

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJInteractionEvents_ActorAgentID_ActorAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateInteractionEvent] @ID = @MJInteractionEvents_ActorAgentIDID, @InteractionID = @MJInteractionEvents_ActorAgentID_InteractionID, @EventType = @MJInteractionEvents_ActorAgentID_EventType, @OccurredAt = @MJInteractionEvents_ActorAgentID_OccurredAt, @ActorUserID = @MJInteractionEvents_ActorAgentID_ActorUserID, @ActorAgentID_Clear = 1, @ActorAgentID = @MJInteractionEvents_ActorAgentID_ActorAgentID, @Details = @MJInteractionEvents_ActorAgentID_Details

        FETCH NEXT FROM cascade_update_MJInteractionEvents_ActorAgentID_cursor INTO @MJInteractionEvents_ActorAgentIDID, @MJInteractionEvents_ActorAgentID_InteractionID, @MJInteractionEvents_ActorAgentID_EventType, @MJInteractionEvents_ActorAgentID_OccurredAt, @MJInteractionEvents_ActorAgentID_ActorUserID, @MJInteractionEvents_ActorAgentID_ActorAgentID, @MJInteractionEvents_ActorAgentID_Details
    END

    CLOSE cascade_update_MJInteractionEvents_ActorAgentID_cursor
    DEALLOCATE cascade_update_MJInteractionEvents_ActorAgentID_cursor
    
    -- Cascade update on InteractionOffer using cursor to call spUpdateInteractionOffer
    DECLARE @MJInteractionOffers_OfferedByAgentIDID uniqueidentifier
    DECLARE @MJInteractionOffers_OfferedByAgentID_InteractionID uniqueidentifier
    DECLARE @MJInteractionOffers_OfferedByAgentID_TargetUserID uniqueidentifier
    DECLARE @MJInteractionOffers_OfferedByAgentID_OfferedByAgentID uniqueidentifier
    DECLARE @MJInteractionOffers_OfferedByAgentID_Mode nvarchar(20)
    DECLARE @MJInteractionOffers_OfferedByAgentID_Status nvarchar(20)
    DECLARE @MJInteractionOffers_OfferedByAgentID_RoomName nvarchar(255)
    DECLARE @MJInteractionOffers_OfferedByAgentID_CallerLabel nvarchar(255)
    DECLARE @MJInteractionOffers_OfferedByAgentID_Summary nvarchar(MAX)
    DECLARE @MJInteractionOffers_OfferedByAgentID_OfferedAt datetimeoffset
    DECLARE @MJInteractionOffers_OfferedByAgentID_ExpiresAt datetimeoffset
    DECLARE @MJInteractionOffers_OfferedByAgentID_RespondedAt datetimeoffset
    DECLARE cascade_update_MJInteractionOffers_OfferedByAgentID_cursor CURSOR FOR
        SELECT [ID], [InteractionID], [TargetUserID], [OfferedByAgentID], [Mode], [Status], [RoomName], [CallerLabel], [Summary], [OfferedAt], [ExpiresAt], [RespondedAt]
        FROM [${flyway:defaultSchema}].[InteractionOffer]
        WHERE [OfferedByAgentID] = @ID

    OPEN cascade_update_MJInteractionOffers_OfferedByAgentID_cursor
    FETCH NEXT FROM cascade_update_MJInteractionOffers_OfferedByAgentID_cursor INTO @MJInteractionOffers_OfferedByAgentIDID, @MJInteractionOffers_OfferedByAgentID_InteractionID, @MJInteractionOffers_OfferedByAgentID_TargetUserID, @MJInteractionOffers_OfferedByAgentID_OfferedByAgentID, @MJInteractionOffers_OfferedByAgentID_Mode, @MJInteractionOffers_OfferedByAgentID_Status, @MJInteractionOffers_OfferedByAgentID_RoomName, @MJInteractionOffers_OfferedByAgentID_CallerLabel, @MJInteractionOffers_OfferedByAgentID_Summary, @MJInteractionOffers_OfferedByAgentID_OfferedAt, @MJInteractionOffers_OfferedByAgentID_ExpiresAt, @MJInteractionOffers_OfferedByAgentID_RespondedAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJInteractionOffers_OfferedByAgentID_OfferedByAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateInteractionOffer] @ID = @MJInteractionOffers_OfferedByAgentIDID, @InteractionID = @MJInteractionOffers_OfferedByAgentID_InteractionID, @TargetUserID = @MJInteractionOffers_OfferedByAgentID_TargetUserID, @OfferedByAgentID_Clear = 1, @OfferedByAgentID = @MJInteractionOffers_OfferedByAgentID_OfferedByAgentID, @Mode = @MJInteractionOffers_OfferedByAgentID_Mode, @Status = @MJInteractionOffers_OfferedByAgentID_Status, @RoomName = @MJInteractionOffers_OfferedByAgentID_RoomName, @CallerLabel = @MJInteractionOffers_OfferedByAgentID_CallerLabel, @Summary = @MJInteractionOffers_OfferedByAgentID_Summary, @OfferedAt = @MJInteractionOffers_OfferedByAgentID_OfferedAt, @ExpiresAt = @MJInteractionOffers_OfferedByAgentID_ExpiresAt, @RespondedAt = @MJInteractionOffers_OfferedByAgentID_RespondedAt

        FETCH NEXT FROM cascade_update_MJInteractionOffers_OfferedByAgentID_cursor INTO @MJInteractionOffers_OfferedByAgentIDID, @MJInteractionOffers_OfferedByAgentID_InteractionID, @MJInteractionOffers_OfferedByAgentID_TargetUserID, @MJInteractionOffers_OfferedByAgentID_OfferedByAgentID, @MJInteractionOffers_OfferedByAgentID_Mode, @MJInteractionOffers_OfferedByAgentID_Status, @MJInteractionOffers_OfferedByAgentID_RoomName, @MJInteractionOffers_OfferedByAgentID_CallerLabel, @MJInteractionOffers_OfferedByAgentID_Summary, @MJInteractionOffers_OfferedByAgentID_OfferedAt, @MJInteractionOffers_OfferedByAgentID_ExpiresAt, @MJInteractionOffers_OfferedByAgentID_RespondedAt
    END

    CLOSE cascade_update_MJInteractionOffers_OfferedByAgentID_cursor
    DEALLOCATE cascade_update_MJInteractionOffers_OfferedByAgentID_cursor
    
    -- Cascade update on MeetingParticipant using cursor to call spUpdateMeetingParticipant
    DECLARE @MJMeetingParticipants_AgentIDID uniqueidentifier
    DECLARE @MJMeetingParticipants_AgentID_MeetingID uniqueidentifier
    DECLARE @MJMeetingParticipants_AgentID_UserID uniqueidentifier
    DECLARE @MJMeetingParticipants_AgentID_AgentID uniqueidentifier
    DECLARE @MJMeetingParticipants_AgentID_ExternalName nvarchar(255)
    DECLARE @MJMeetingParticipants_AgentID_ExternalEmail nvarchar(255)
    DECLARE @MJMeetingParticipants_AgentID_ExternalPhone nvarchar(20)
    DECLARE @MJMeetingParticipants_AgentID_Role nvarchar(20)
    DECLARE @MJMeetingParticipants_AgentID_InviteStatus nvarchar(20)
    DECLARE @MJMeetingParticipants_AgentID_JoinedAt datetimeoffset
    DECLARE @MJMeetingParticipants_AgentID_LeftAt datetimeoffset
    DECLARE cascade_update_MJMeetingParticipants_AgentID_cursor CURSOR FOR
        SELECT [ID], [MeetingID], [UserID], [AgentID], [ExternalName], [ExternalEmail], [ExternalPhone], [Role], [InviteStatus], [JoinedAt], [LeftAt]
        FROM [${flyway:defaultSchema}].[MeetingParticipant]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJMeetingParticipants_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJMeetingParticipants_AgentID_cursor INTO @MJMeetingParticipants_AgentIDID, @MJMeetingParticipants_AgentID_MeetingID, @MJMeetingParticipants_AgentID_UserID, @MJMeetingParticipants_AgentID_AgentID, @MJMeetingParticipants_AgentID_ExternalName, @MJMeetingParticipants_AgentID_ExternalEmail, @MJMeetingParticipants_AgentID_ExternalPhone, @MJMeetingParticipants_AgentID_Role, @MJMeetingParticipants_AgentID_InviteStatus, @MJMeetingParticipants_AgentID_JoinedAt, @MJMeetingParticipants_AgentID_LeftAt

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJMeetingParticipants_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateMeetingParticipant] @ID = @MJMeetingParticipants_AgentIDID, @MeetingID = @MJMeetingParticipants_AgentID_MeetingID, @UserID = @MJMeetingParticipants_AgentID_UserID, @AgentID_Clear = 1, @AgentID = @MJMeetingParticipants_AgentID_AgentID, @ExternalName = @MJMeetingParticipants_AgentID_ExternalName, @ExternalEmail = @MJMeetingParticipants_AgentID_ExternalEmail, @ExternalPhone = @MJMeetingParticipants_AgentID_ExternalPhone, @Role = @MJMeetingParticipants_AgentID_Role, @InviteStatus = @MJMeetingParticipants_AgentID_InviteStatus, @JoinedAt = @MJMeetingParticipants_AgentID_JoinedAt, @LeftAt = @MJMeetingParticipants_AgentID_LeftAt

        FETCH NEXT FROM cascade_update_MJMeetingParticipants_AgentID_cursor INTO @MJMeetingParticipants_AgentIDID, @MJMeetingParticipants_AgentID_MeetingID, @MJMeetingParticipants_AgentID_UserID, @MJMeetingParticipants_AgentID_AgentID, @MJMeetingParticipants_AgentID_ExternalName, @MJMeetingParticipants_AgentID_ExternalEmail, @MJMeetingParticipants_AgentID_ExternalPhone, @MJMeetingParticipants_AgentID_Role, @MJMeetingParticipants_AgentID_InviteStatus, @MJMeetingParticipants_AgentID_JoinedAt, @MJMeetingParticipants_AgentID_LeftAt
    END

    CLOSE cascade_update_MJMeetingParticipants_AgentID_cursor
    DEALLOCATE cascade_update_MJMeetingParticipants_AgentID_cursor
    
    -- Cascade update on RecordProcess using cursor to call spUpdateRecordProcess
    DECLARE @MJRecordProcesses_AgentIDID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_Name nvarchar(255)
    DECLARE @MJRecordProcesses_AgentID_Description nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_CategoryID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_EntityID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_Status nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_WorkType nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_ActionID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_AgentID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_PromptID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_ScopeType nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_ScopeViewID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_ScopeListID uniqueidentifier
    DECLARE @MJRecordProcesses_AgentID_ScopeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_OnChangeEnabled bit
    DECLARE @MJRecordProcesses_AgentID_OnChangeInvocationType nvarchar(30)
    DECLARE @MJRecordProcesses_AgentID_OnChangeFilter nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_ScheduleEnabled bit
    DECLARE @MJRecordProcesses_AgentID_CronExpression nvarchar(120)
    DECLARE @MJRecordProcesses_AgentID_Timezone nvarchar(100)
    DECLARE @MJRecordProcesses_AgentID_OnDemandEnabled bit
    DECLARE @MJRecordProcesses_AgentID_InputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_OutputMapping nvarchar(MAX)
    DECLARE @MJRecordProcesses_AgentID_SkipUnchanged bit
    DECLARE @MJRecordProcesses_AgentID_WatermarkStrategy nvarchar(20)
    DECLARE @MJRecordProcesses_AgentID_BatchSize int
    DECLARE @MJRecordProcesses_AgentID_MaxConcurrency int
    DECLARE @MJRecordProcesses_AgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJRecordProcesses_AgentID_cursor CURSOR FOR
        SELECT [ID], [Name], [Description], [CategoryID], [EntityID], [Status], [WorkType], [ActionID], [AgentID], [PromptID], [ScopeType], [ScopeViewID], [ScopeListID], [ScopeFilter], [OnChangeEnabled], [OnChangeInvocationType], [OnChangeFilter], [ScheduleEnabled], [CronExpression], [Timezone], [OnDemandEnabled], [InputMapping], [OutputMapping], [SkipUnchanged], [WatermarkStrategy], [BatchSize], [MaxConcurrency], [Configuration]
        FROM [${flyway:defaultSchema}].[RecordProcess]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJRecordProcesses_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJRecordProcesses_AgentID_cursor INTO @MJRecordProcesses_AgentIDID, @MJRecordProcesses_AgentID_Name, @MJRecordProcesses_AgentID_Description, @MJRecordProcesses_AgentID_CategoryID, @MJRecordProcesses_AgentID_EntityID, @MJRecordProcesses_AgentID_Status, @MJRecordProcesses_AgentID_WorkType, @MJRecordProcesses_AgentID_ActionID, @MJRecordProcesses_AgentID_AgentID, @MJRecordProcesses_AgentID_PromptID, @MJRecordProcesses_AgentID_ScopeType, @MJRecordProcesses_AgentID_ScopeViewID, @MJRecordProcesses_AgentID_ScopeListID, @MJRecordProcesses_AgentID_ScopeFilter, @MJRecordProcesses_AgentID_OnChangeEnabled, @MJRecordProcesses_AgentID_OnChangeInvocationType, @MJRecordProcesses_AgentID_OnChangeFilter, @MJRecordProcesses_AgentID_ScheduleEnabled, @MJRecordProcesses_AgentID_CronExpression, @MJRecordProcesses_AgentID_Timezone, @MJRecordProcesses_AgentID_OnDemandEnabled, @MJRecordProcesses_AgentID_InputMapping, @MJRecordProcesses_AgentID_OutputMapping, @MJRecordProcesses_AgentID_SkipUnchanged, @MJRecordProcesses_AgentID_WatermarkStrategy, @MJRecordProcesses_AgentID_BatchSize, @MJRecordProcesses_AgentID_MaxConcurrency, @MJRecordProcesses_AgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJRecordProcesses_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateRecordProcess] @ID = @MJRecordProcesses_AgentIDID, @Name = @MJRecordProcesses_AgentID_Name, @Description = @MJRecordProcesses_AgentID_Description, @CategoryID = @MJRecordProcesses_AgentID_CategoryID, @EntityID = @MJRecordProcesses_AgentID_EntityID, @Status = @MJRecordProcesses_AgentID_Status, @WorkType = @MJRecordProcesses_AgentID_WorkType, @ActionID = @MJRecordProcesses_AgentID_ActionID, @AgentID_Clear = 1, @AgentID = @MJRecordProcesses_AgentID_AgentID, @PromptID = @MJRecordProcesses_AgentID_PromptID, @ScopeType = @MJRecordProcesses_AgentID_ScopeType, @ScopeViewID = @MJRecordProcesses_AgentID_ScopeViewID, @ScopeListID = @MJRecordProcesses_AgentID_ScopeListID, @ScopeFilter = @MJRecordProcesses_AgentID_ScopeFilter, @OnChangeEnabled = @MJRecordProcesses_AgentID_OnChangeEnabled, @OnChangeInvocationType = @MJRecordProcesses_AgentID_OnChangeInvocationType, @OnChangeFilter = @MJRecordProcesses_AgentID_OnChangeFilter, @ScheduleEnabled = @MJRecordProcesses_AgentID_ScheduleEnabled, @CronExpression = @MJRecordProcesses_AgentID_CronExpression, @Timezone = @MJRecordProcesses_AgentID_Timezone, @OnDemandEnabled = @MJRecordProcesses_AgentID_OnDemandEnabled, @InputMapping = @MJRecordProcesses_AgentID_InputMapping, @OutputMapping = @MJRecordProcesses_AgentID_OutputMapping, @SkipUnchanged = @MJRecordProcesses_AgentID_SkipUnchanged, @WatermarkStrategy = @MJRecordProcesses_AgentID_WatermarkStrategy, @BatchSize = @MJRecordProcesses_AgentID_BatchSize, @MaxConcurrency = @MJRecordProcesses_AgentID_MaxConcurrency, @Configuration = @MJRecordProcesses_AgentID_Configuration

        FETCH NEXT FROM cascade_update_MJRecordProcesses_AgentID_cursor INTO @MJRecordProcesses_AgentIDID, @MJRecordProcesses_AgentID_Name, @MJRecordProcesses_AgentID_Description, @MJRecordProcesses_AgentID_CategoryID, @MJRecordProcesses_AgentID_EntityID, @MJRecordProcesses_AgentID_Status, @MJRecordProcesses_AgentID_WorkType, @MJRecordProcesses_AgentID_ActionID, @MJRecordProcesses_AgentID_AgentID, @MJRecordProcesses_AgentID_PromptID, @MJRecordProcesses_AgentID_ScopeType, @MJRecordProcesses_AgentID_ScopeViewID, @MJRecordProcesses_AgentID_ScopeListID, @MJRecordProcesses_AgentID_ScopeFilter, @MJRecordProcesses_AgentID_OnChangeEnabled, @MJRecordProcesses_AgentID_OnChangeInvocationType, @MJRecordProcesses_AgentID_OnChangeFilter, @MJRecordProcesses_AgentID_ScheduleEnabled, @MJRecordProcesses_AgentID_CronExpression, @MJRecordProcesses_AgentID_Timezone, @MJRecordProcesses_AgentID_OnDemandEnabled, @MJRecordProcesses_AgentID_InputMapping, @MJRecordProcesses_AgentID_OutputMapping, @MJRecordProcesses_AgentID_SkipUnchanged, @MJRecordProcesses_AgentID_WatermarkStrategy, @MJRecordProcesses_AgentID_BatchSize, @MJRecordProcesses_AgentID_MaxConcurrency, @MJRecordProcesses_AgentID_Configuration
    END

    CLOSE cascade_update_MJRecordProcesses_AgentID_cursor
    DEALLOCATE cascade_update_MJRecordProcesses_AgentID_cursor
    
    -- Cascade update on SearchExecutionLog using cursor to call spUpdateSearchExecutionLog
    DECLARE @MJSearchExecutionLogs_AIAgentIDID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_SearchScopeID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_UserID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_AIAgentID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_Query nvarchar(MAX)
    DECLARE @MJSearchExecutionLogs_AIAgentID_TotalDurationMs int
    DECLARE @MJSearchExecutionLogs_AIAgentID_ResultCount int
    DECLARE @MJSearchExecutionLogs_AIAgentID_RerankerName nvarchar(100)
    DECLARE @MJSearchExecutionLogs_AIAgentID_RerankerCostCents decimal(10, 4)
    DECLARE @MJSearchExecutionLogs_AIAgentID_Status nvarchar(20)
    DECLARE @MJSearchExecutionLogs_AIAgentID_FailureReason nvarchar(500)
    DECLARE @MJSearchExecutionLogs_AIAgentID_ProvidersJSON nvarchar(MAX)
    DECLARE @MJSearchExecutionLogs_AIAgentID_AISkillID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID uniqueidentifier
    DECLARE @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON nvarchar(MAX)
    DECLARE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor CURSOR FOR
        SELECT [ID], [SearchScopeID], [UserID], [AIAgentID], [Query], [TotalDurationMs], [ResultCount], [RerankerName], [RerankerCostCents], [Status], [FailureReason], [ProvidersJSON], [AISkillID], [PrimaryScopeRecordID], [ScopeDecisionJSON]
        FROM [${flyway:defaultSchema}].[SearchExecutionLog]
        WHERE [AIAgentID] = @ID

    OPEN cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    FETCH NEXT FROM cascade_update_MJSearchExecutionLogs_AIAgentID_cursor INTO @MJSearchExecutionLogs_AIAgentIDID, @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @MJSearchExecutionLogs_AIAgentID_UserID, @MJSearchExecutionLogs_AIAgentID_AIAgentID, @MJSearchExecutionLogs_AIAgentID_Query, @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @MJSearchExecutionLogs_AIAgentID_ResultCount, @MJSearchExecutionLogs_AIAgentID_RerankerName, @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @MJSearchExecutionLogs_AIAgentID_Status, @MJSearchExecutionLogs_AIAgentID_FailureReason, @MJSearchExecutionLogs_AIAgentID_ProvidersJSON, @MJSearchExecutionLogs_AIAgentID_AISkillID, @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID, @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJSearchExecutionLogs_AIAgentID_AIAgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateSearchExecutionLog] @ID = @MJSearchExecutionLogs_AIAgentIDID, @SearchScopeID = @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @UserID = @MJSearchExecutionLogs_AIAgentID_UserID, @AIAgentID_Clear = 1, @AIAgentID = @MJSearchExecutionLogs_AIAgentID_AIAgentID, @Query = @MJSearchExecutionLogs_AIAgentID_Query, @TotalDurationMs = @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @ResultCount = @MJSearchExecutionLogs_AIAgentID_ResultCount, @RerankerName = @MJSearchExecutionLogs_AIAgentID_RerankerName, @RerankerCostCents = @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @Status = @MJSearchExecutionLogs_AIAgentID_Status, @FailureReason = @MJSearchExecutionLogs_AIAgentID_FailureReason, @ProvidersJSON = @MJSearchExecutionLogs_AIAgentID_ProvidersJSON, @AISkillID = @MJSearchExecutionLogs_AIAgentID_AISkillID, @PrimaryScopeRecordID = @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID, @ScopeDecisionJSON = @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON

        FETCH NEXT FROM cascade_update_MJSearchExecutionLogs_AIAgentID_cursor INTO @MJSearchExecutionLogs_AIAgentIDID, @MJSearchExecutionLogs_AIAgentID_SearchScopeID, @MJSearchExecutionLogs_AIAgentID_UserID, @MJSearchExecutionLogs_AIAgentID_AIAgentID, @MJSearchExecutionLogs_AIAgentID_Query, @MJSearchExecutionLogs_AIAgentID_TotalDurationMs, @MJSearchExecutionLogs_AIAgentID_ResultCount, @MJSearchExecutionLogs_AIAgentID_RerankerName, @MJSearchExecutionLogs_AIAgentID_RerankerCostCents, @MJSearchExecutionLogs_AIAgentID_Status, @MJSearchExecutionLogs_AIAgentID_FailureReason, @MJSearchExecutionLogs_AIAgentID_ProvidersJSON, @MJSearchExecutionLogs_AIAgentID_AISkillID, @MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID, @MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON
    END

    CLOSE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    DEALLOCATE cascade_update_MJSearchExecutionLogs_AIAgentID_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJTasks_AgentIDID uniqueidentifier
    DECLARE @MJTasks_AgentID_ParentID uniqueidentifier
    DECLARE @MJTasks_AgentID_Name nvarchar(255)
    DECLARE @MJTasks_AgentID_Description nvarchar(MAX)
    DECLARE @MJTasks_AgentID_TypeID uniqueidentifier
    DECLARE @MJTasks_AgentID_EnvironmentID uniqueidentifier
    DECLARE @MJTasks_AgentID_ProjectID uniqueidentifier
    DECLARE @MJTasks_AgentID_ConversationDetailID uniqueidentifier
    DECLARE @MJTasks_AgentID_UserID uniqueidentifier
    DECLARE @MJTasks_AgentID_AgentID uniqueidentifier
    DECLARE @MJTasks_AgentID_Status nvarchar(50)
    DECLARE @MJTasks_AgentID_PercentComplete int
    DECLARE @MJTasks_AgentID_DueAt datetimeoffset
    DECLARE @MJTasks_AgentID_StartedAt datetimeoffset
    DECLARE @MJTasks_AgentID_CompletedAt datetimeoffset
    DECLARE @MJTasks_AgentID_InputPayload nvarchar(MAX)
    DECLARE @MJTasks_AgentID_OutputPayload nvarchar(MAX)
    DECLARE @MJTasks_AgentID_ErrorMessage nvarchar(MAX)
    DECLARE @MJTasks_AgentID_AgentRunID uniqueidentifier
    DECLARE @MJTasks_AgentID_ClaimedBy nvarchar(100)
    DECLARE @MJTasks_AgentID_ClaimExpiresAt datetimeoffset
    DECLARE @MJTasks_AgentID_ActionID uniqueidentifier
    DECLARE @MJTasks_AgentID_StepType nvarchar(20)
    DECLARE @MJTasks_AgentID_PromptID uniqueidentifier
    DECLARE @MJTasks_AgentID_Configuration nvarchar(MAX)
    DECLARE cascade_update_MJTasks_AgentID_cursor CURSOR FOR
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt], [InputPayload], [OutputPayload], [ErrorMessage], [AgentRunID], [ClaimedBy], [ClaimExpiresAt], [ActionID], [StepType], [PromptID], [Configuration]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [AgentID] = @ID

    OPEN cascade_update_MJTasks_AgentID_cursor
    FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt, @MJTasks_AgentID_InputPayload, @MJTasks_AgentID_OutputPayload, @MJTasks_AgentID_ErrorMessage, @MJTasks_AgentID_AgentRunID, @MJTasks_AgentID_ClaimedBy, @MJTasks_AgentID_ClaimExpiresAt, @MJTasks_AgentID_ActionID, @MJTasks_AgentID_StepType, @MJTasks_AgentID_PromptID, @MJTasks_AgentID_Configuration

    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJTasks_AgentID_AgentID = NULL

        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJTasks_AgentIDID, @ParentID = @MJTasks_AgentID_ParentID, @Name = @MJTasks_AgentID_Name, @Description = @MJTasks_AgentID_Description, @TypeID = @MJTasks_AgentID_TypeID, @EnvironmentID = @MJTasks_AgentID_EnvironmentID, @ProjectID = @MJTasks_AgentID_ProjectID, @ConversationDetailID = @MJTasks_AgentID_ConversationDetailID, @UserID = @MJTasks_AgentID_UserID, @AgentID_Clear = 1, @AgentID = @MJTasks_AgentID_AgentID, @Status = @MJTasks_AgentID_Status, @PercentComplete = @MJTasks_AgentID_PercentComplete, @DueAt = @MJTasks_AgentID_DueAt, @StartedAt = @MJTasks_AgentID_StartedAt, @CompletedAt = @MJTasks_AgentID_CompletedAt, @InputPayload = @MJTasks_AgentID_InputPayload, @OutputPayload = @MJTasks_AgentID_OutputPayload, @ErrorMessage = @MJTasks_AgentID_ErrorMessage, @AgentRunID = @MJTasks_AgentID_AgentRunID, @ClaimedBy = @MJTasks_AgentID_ClaimedBy, @ClaimExpiresAt = @MJTasks_AgentID_ClaimExpiresAt, @ActionID = @MJTasks_AgentID_ActionID, @StepType = @MJTasks_AgentID_StepType, @PromptID = @MJTasks_AgentID_PromptID, @Configuration = @MJTasks_AgentID_Configuration

        FETCH NEXT FROM cascade_update_MJTasks_AgentID_cursor INTO @MJTasks_AgentIDID, @MJTasks_AgentID_ParentID, @MJTasks_AgentID_Name, @MJTasks_AgentID_Description, @MJTasks_AgentID_TypeID, @MJTasks_AgentID_EnvironmentID, @MJTasks_AgentID_ProjectID, @MJTasks_AgentID_ConversationDetailID, @MJTasks_AgentID_UserID, @MJTasks_AgentID_AgentID, @MJTasks_AgentID_Status, @MJTasks_AgentID_PercentComplete, @MJTasks_AgentID_DueAt, @MJTasks_AgentID_StartedAt, @MJTasks_AgentID_CompletedAt, @MJTasks_AgentID_InputPayload, @MJTasks_AgentID_OutputPayload, @MJTasks_AgentID_ErrorMessage, @MJTasks_AgentID_AgentRunID, @MJTasks_AgentID_ClaimedBy, @MJTasks_AgentID_ClaimExpiresAt, @MJTasks_AgentID_ActionID, @MJTasks_AgentID_StepType, @MJTasks_AgentID_PromptID, @MJTasks_AgentID_Configuration
    END

    CLOSE cascade_update_MJTasks_AgentID_cursor
    DEALLOCATE cascade_update_MJTasks_AgentID_cursor
    

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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: AI Agents */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] FROM [cdp_Integration]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgent] TO [cdp_Developer], [cdp_Integration];

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'EE88087E-DE03-4409-9EEC-B00007D32DC2'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '2A7F15FB-580A-439B-9DE4-4FCCF8907DDB'
               AND AutoUpdateDefaultInView = 1;

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '0202B8C4-A0CF-41E6-B68B-769E25A5B4EA'
               AND AutoUpdateDefaultInView = 1;

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = '5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356'
               AND AutoUpdateDefaultInView = 1;

/* Set categories for 8 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.LinkedEntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '39D168D2-F07B-4D85-BB95-08CB2D786E0F';

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.LinkedRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'F69E7371-7F9C-4C91-A5FE-CA430F295583';

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.LinkedEntity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Context',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'A216D3DE-11C4-44BE-86DE-C7AA488A3189';

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.RecordingStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Recording',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '5C1A2E3D-FBE8-45DC-8A85-9EE2164A1356';

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.RecordingExpectedShards 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Recording',
   GeneratedFormSection = 'Category',
   DisplayName = 'Expected Shards'
WHERE 
   ID = '68B99430-0BD8-4496-8B90-08D2CF58EA5B';

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.RecordingCapturedSamples 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Recording',
   GeneratedFormSection = 'Category',
   DisplayName = 'Captured Samples'
WHERE 
   ID = '1CE50980-E993-49D8-A45C-76DCED905A2F';

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.RecordingGaps 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Recording',
   GeneratedFormSection = 'Category',
   ExtendedType = 'JSON'
WHERE 
   ID = '70A98238-7AEE-40B1-A1D4-0F2C03393316';

-- UPDATE Entity Field Category Info MJ: AI Agent Sessions.RecordingAssemblyVersion 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Recording',
   GeneratedFormSection = 'Category',
   DisplayName = 'Assembly Version'
WHERE 
   ID = '5506B605-5358-471C-B1D3-0677DBC00780';

/* Set categories for 11 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C74A743F-F9C8-432A-928E-23CD6AF909FF';

-- UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.AgentSessionID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Session Association',
   GeneratedFormSection = 'Category',
   DisplayName = 'Agent Session'
WHERE 
   ID = 'EE88087E-DE03-4409-9EEC-B00007D32DC2';

-- UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.Index 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Shard Details',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'AE248773-4FCC-4D86-8B40-9BDC469B4EFF';

-- UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.StartSample 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audio Properties',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '85D6C6B3-D9E3-4819-BF87-306BDA555116';

-- UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.SampleCount 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audio Properties',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'C660DE10-8126-4D24-9360-5DC26126613C';

-- UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.Bytes 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audio Properties',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '2A7F15FB-580A-439B-9DE4-4FCCF8907DDB';

-- UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.Sha256 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Shard Details',
   GeneratedFormSection = 'Category',
   DisplayName = 'SHA-256'
WHERE 
   ID = 'EE2B8659-543C-4B72-BB5B-7CC1DF073F3C';

-- UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.Data 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audio Data',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6866304A-1522-4FB6-BD42-1570DCC808AC';

-- UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.ReceivedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '0202B8C4-A0CF-41E6-B68B-769E25A5B4EA';

-- UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = 'E7FC05D6-D76C-45E3-8D56-F659A98C529A';

-- UPDATE Entity Field Category Info MJ: AI Agent Session Recording Shards.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'System Metadata',
   GeneratedFormSection = 'Category'
WHERE 
   ID = '6CED36C5-6456-4F71-8A9A-6EC1C7951E95';

/* Set entity icon to fa fa-microphone-alt */

               UPDATE [${flyway:defaultSchema}].[Entity]
               SET [Icon] = 'fa fa-microphone-alt', [__mj_UpdatedAt] = GETUTCDATE()
               WHERE [ID] = 'EBAED427-2514-46B1-A20C-777A2055C937';

/* Insert FieldCategoryInfo setting for entity */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'EBAED427-2514-46B1-A20C-777A2055C937' AND [Name] = 'FieldCategoryInfo'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('87a2549f-06a8-5941-91c6-242e3f05069d', 'EBAED427-2514-46B1-A20C-777A2055C937', 'FieldCategoryInfo', '{
  "Audio Data": {
    "description": "Raw binary payload representing the Opus audio recording packets",
    "icon": "fa fa-file-audio"
  },
  "Audio Properties": {
    "description": "Technical audio sample metrics and data size specifications",
    "icon": "fa fa-sliders-h"
  },
  "Session Association": {
    "description": "Association linking the shard to the overarching agent session",
    "icon": "fa fa-link"
  },
  "Shard Details": {
    "description": "Sequential positioning and validation identifiers for the shard",
    "icon": "fa fa-list-ol"
  },
  "System Metadata": {
    "description": "System-managed audit and tracking fields",
    "icon": "fa fa-cog"
  }
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Insert FieldCategoryIcons setting (legacy) */
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntitySetting] WHERE [EntityID] = 'EBAED427-2514-46B1-A20C-777A2055C937' AND [Name] = 'FieldCategoryIcons'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntitySetting] ([ID], [EntityID], [Name], [Value], [__mj_CreatedAt], [__mj_UpdatedAt])
               VALUES ('2c58c71f-46f2-56f8-b01a-43e6855ca7e2', 'EBAED427-2514-46B1-A20C-777A2055C937', 'FieldCategoryIcons', '{
  "Audio Data": "fa fa-file-audio",
  "Audio Properties": "fa fa-sliders-h",
  "Session Association": "fa fa-link",
  "Shard Details": "fa fa-list-ol",
  "System Metadata": "fa fa-cog"
}', GETUTCDATE(), GETUTCDATE())
   END;

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

         UPDATE [${flyway:defaultSchema}].[ApplicationEntity]
         SET [DefaultForNewUser] = 0, [__mj_UpdatedAt] = GETUTCDATE()
         WHERE [EntityID] = 'EBAED427-2514-46B1-A20C-777A2055C937';

/* Generated Validation Functions for MJ: AI Agent Session Recording Shards */
-- CHECK constraint for MJ: AI Agent Session Recording Shards: Field: Index was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'AE248773-4FCC-4D86-8B40-9BDC469B4EFF'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('0214ac7e-e564-41e1-ac95-7cb8153307c3', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '([Index]>=(0))', 'public ValidateIndexNonNegative(result: ValidationResult) {
	if (this.Index != null && this.Index < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Index",
			"Index must be greater than or equal to 0.",
			this.Index,
			ValidationErrorType.Failure
		));
	}
}', 'The index must be zero or a positive number.', 'ValidateIndexNonNegative', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'AE248773-4FCC-4D86-8B40-9BDC469B4EFF')
   END;

-- CHECK constraint for MJ: AI Agent Session Recording Shards @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[GeneratedCode] WHERE [CategoryID] = (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators') AND [LinkedEntityID] = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND [LinkedRecordPrimaryKey] = 'EBAED427-2514-46B1-A20C-777A2055C937' AND [Name] = 'ValidateStartSampleSampleCountAndBytesNonNegative'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] ([ID], [CategoryID], [GeneratedByModelID], [GeneratedAt], [Language], [Status], [Source], [Code], [Description], [Name], [LinkedEntityID], [LinkedRecordPrimaryKey])
VALUES ('b287d6d8-612a-4c6a-83a9-135b46330627', (SELECT [ID] FROM [${flyway:defaultSchema}].[vwGeneratedCodeCategories] WHERE [Name]='CodeGen: Validators'), '4B500A24-0259-4EFF-9E34-24E9F5EC9DAB', GETUTCDATE(), 'TypeScript', 'Approved', '([StartSample]>=(0) AND [SampleCount]>=(0) AND [Bytes]>=(0))', 'public ValidateStartSampleSampleCountAndBytesNonNegative(result: ValidationResult) {
	if (this.StartSample != null && this.StartSample < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"StartSample",
			"Start sample must be greater than or equal to 0.",
			this.StartSample,
			ValidationErrorType.Failure
		));
	}
	if (this.SampleCount != null && this.SampleCount < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"SampleCount",
			"Sample count must be greater than or equal to 0.",
			this.SampleCount,
			ValidationErrorType.Failure
		));
	}
	if (this.Bytes != null && this.Bytes < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"Bytes",
			"Bytes must be greater than or equal to 0.",
			this.Bytes,
			ValidationErrorType.Failure
		));
	}
}', 'Start sample, sample count, and byte count must each be zero or greater to ensure recording data measurements are valid and non-negative.', 'ValidateStartSampleSampleCountAndBytesNonNegative', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'EBAED427-2514-46B1-A20C-777A2055C937')
   END;
