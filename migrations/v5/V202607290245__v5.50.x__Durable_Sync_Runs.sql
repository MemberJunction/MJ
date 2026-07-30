-- =====================================================
-- v5.50.x — Durable, owned, cross-process-cancellable sync runs
-- =====================================================
-- CompanyIntegrationRun previously had no ownership or liveness columns, so
-- "is this run alive?" was unanswerable from the database: cancel + progress
-- lived in per-process maps, boot-time orphan recovery had no liveness
-- predicate (it adopted runs another live instance was executing), and a
-- stale sweep could mark a row abandoned but had no way to make the original
-- owner stop writing.
--
-- This migration adds:
--   1. Ownership/lease/liveness columns on CompanyIntegrationRun:
--      OwnerToken, LeaseExpiresAt, HeartbeatAt, FenceToken (monotonic,
--      bumped on every claim/reclaim), CancelRequestedAt, ProgressJSON.
--   2. 'Queued' in the Status domain (worker-mode enqueue state).
--   3. An index on (Status, LeaseExpiresAt) for the stale sweep and the
--      worker poll.
--   4. Three atomic ownership sprocs — spClaimCompanyIntegrationRun,
--      spRenewCompanyIntegrationRunLease, spReleaseCompanyIntegrationRun.
--      Claim/renew are each a SINGLE token-checked UPDATE (never
--      select-then-update): zero rows returned = you lost; the caller must
--      not proceed. The fence-token check on renew means a reclaimed
--      (stale) holder cannot renew a fresh holder's lease — the same
--      lost-mutex protection as spExtendScheduledJobLease (V202606151055).
--      Engine-internal lock sprocs → live in a migration, not CodeGen
--      (same convention as V202606022336 / V202606151055 atomic sprocs).
--   5. RSUPendingWork — a durable table replacing the .rsu_pending
--      directory of delete-on-read JSON files. Rows are marked complete
--      only AFTER the work succeeds; failures record the error and leave
--      the row, so strandings are visible instead of silent.
--
-- NOTE ON OUTPUT INTO: every __mj table carries a CodeGen-generated
-- __mj_UpdatedAt UPDATE trigger, and SQL Server rejects an OUTPUT clause
-- without INTO on a table with enabled triggers (error 334). The sprocs
-- therefore OUTPUT INTO a table variable and SELECT from it — still one
-- atomic UPDATE statement.
--
-- UNDO (no standalone U-file: the Skyway migration parser accepts only
-- V/B/R prefixes, so an undo script is documented here instead):
--   DROP PROCEDURE [__mj].[spClaimCompanyIntegrationRun];
--   DROP PROCEDURE [__mj].[spRenewCompanyIntegrationRunLease];
--   DROP PROCEDURE [__mj].[spReleaseCompanyIntegrationRun];
--   DROP TABLE [__mj].[RSUPendingWork];
--   DROP INDEX [IDX_CompanyIntegrationRun_Status_LeaseExpiresAt]
--     ON [__mj].[CompanyIntegrationRun];
--   ALTER TABLE [__mj].[CompanyIntegrationRun]
--     DROP CONSTRAINT [CK_CompanyIntegrationRun_Status];
--   ALTER TABLE [__mj].[CompanyIntegrationRun]
--     ADD CONSTRAINT [CK_CompanyIntegrationRun_Status] CHECK
--     ([Status]='Failed' OR [Status]='Success' OR [Status]='In Progress'
--      OR [Status]='Pending');
--   ALTER TABLE [__mj].[CompanyIntegrationRun] DROP COLUMN
--     OwnerToken, LeaseExpiresAt, HeartbeatAt, FenceToken,
--     CancelRequestedAt, ProgressJSON;
--   (then re-run CodeGen to regenerate views/sprocs/entity metadata)
-- =====================================================

-- ─── 1. Ownership / lease / liveness columns ─────────────────────────

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationRun] ADD
    OwnerToken UNIQUEIDENTIFIER NULL,
    LeaseExpiresAt DATETIMEOFFSET NULL,
    HeartbeatAt DATETIMEOFFSET NULL,
    FenceToken INT NOT NULL DEFAULT 0,
    CancelRequestedAt DATETIMEOFFSET NULL,
    ProgressJSON NVARCHAR(MAX) NULL;
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Opaque token identifying the process currently executing this run. NULL = unowned. Set atomically by spClaimCompanyIntegrationRun; a claim succeeds only when the run is unowned or its lease has expired. Cleared by spReleaseCompanyIntegrationRun.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationRun',
    @level2type = N'COLUMN', @level2name = N'OwnerToken';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the current owner''s lease expires. A run whose lease has passed is reclaimable by the stale sweep or another worker via spClaimCompanyIntegrationRun. Renewed on a timer by the owning engine via spRenewCompanyIntegrationRunLease.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationRun',
    @level2type = N'COLUMN', @level2name = N'LeaseExpiresAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the owner''s most recent lease renewal (liveness signal). Updated by spClaimCompanyIntegrationRun and spRenewCompanyIntegrationRunLease.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationRun',
    @level2type = N'COLUMN', @level2name = N'HeartbeatAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Monotonic fencing token, incremented on every successful claim/reclaim by spClaimCompanyIntegrationRun. The engine re-checks this at every batch boundary BEFORE writing: if it has moved, another process owns the run and the original owner aborts without writing. This is what turns the stale sweep from a double-run cause into a double-run fix.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationRun',
    @level2type = N'COLUMN', @level2name = N'FenceToken';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When cancellation was requested for this run (from any process). NULL = no cancel requested. The owning engine checks this at the same batch boundary as the fence token and stops at the next boundary. Replaces the former per-process in-memory cancellation map — the database row is the single source of truth.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationRun',
    @level2type = N'COLUMN', @level2name = N'CancelRequestedAt';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON progress snapshot written (throttled, at most once per batch) by the owning engine. Readers query this row instead of an in-process map, so progress is visible from any process. Only the owner writes it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationRun',
    @level2type = N'COLUMN', @level2name = N'ProgressJSON';
GO

-- ─── 2. Status domain gains 'Queued' (worker-mode enqueue state) ─────

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationRun]
    DROP CONSTRAINT [CK_CompanyIntegrationRun_Status];
GO

ALTER TABLE [${flyway:defaultSchema}].[CompanyIntegrationRun]
    ADD CONSTRAINT [CK_CompanyIntegrationRun_Status]
    CHECK ([Status]='Failed' OR [Status]='Success' OR [Status]='In Progress' OR [Status]='Pending' OR [Status]='Queued');
GO

-- ─── 3. Sweep / worker-poll index ────────────────────────────────────
-- Composite business index (not an FK index, so CodeGen does not create it):
-- the stale sweep filters Status='In Progress' AND LeaseExpiresAt < now, and
-- the worker poll filters Status='Queued'.

CREATE NONCLUSTERED INDEX [IDX_CompanyIntegrationRun_Status_LeaseExpiresAt]
    ON [${flyway:defaultSchema}].[CompanyIntegrationRun] ([Status], [LeaseExpiresAt]);
GO

-- ─── 4. Atomic ownership sprocs ──────────────────────────────────────

CREATE PROCEDURE [${flyway:defaultSchema}].[spClaimCompanyIntegrationRun]
    @RunID        UNIQUEIDENTIFIER,
    @OwnerToken   UNIQUEIDENTIFIER,
    @LeaseMinutes INT
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Claimed TABLE (FenceToken INT, LeaseExpiresAt DATETIMEOFFSET);

    -- Single atomic claim: succeeds only if unowned or the lease expired.
    -- OUTPUT INTO (not bare OUTPUT) because the table has an update trigger.
    UPDATE [${flyway:defaultSchema}].[CompanyIntegrationRun]
       SET OwnerToken     = @OwnerToken,
           LeaseExpiresAt = DATEADD(MINUTE, @LeaseMinutes, SYSDATETIMEOFFSET()),
           HeartbeatAt    = SYSDATETIMEOFFSET(),
           FenceToken     = FenceToken + 1
    OUTPUT INSERTED.FenceToken, INSERTED.LeaseExpiresAt INTO @Claimed
     WHERE ID = @RunID
       AND (OwnerToken IS NULL OR LeaseExpiresAt IS NULL OR LeaseExpiresAt < SYSDATETIMEOFFSET());

    -- Zero rows = claim lost; the caller must not proceed.
    SELECT FenceToken, LeaseExpiresAt FROM @Claimed;
END;
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spClaimCompanyIntegrationRun] TO [cdp_Developer];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spClaimCompanyIntegrationRun] TO [cdp_Integration];
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Atomically claims ownership of a CompanyIntegrationRun: a SINGLE UPDATE whose WHERE admits only unowned runs or runs whose lease has expired. Sets OwnerToken/LeaseExpiresAt/HeartbeatAt and increments FenceToken (the monotonic fence). Returns the new FenceToken + LeaseExpiresAt; ZERO rows returned = claim lost and the caller must not execute the run. Used by the engine before the first batch, by the worker poll, and by the stale sweep (whose reclaim bumps the fence so the abandoned owner aborts at its next boundary check). Never implemented as select-then-update — the single-statement atomicity is the mutual-exclusion guarantee.',
    @level0type = N'SCHEMA',    @level0name = N'${flyway:defaultSchema}',
    @level1type = N'PROCEDURE', @level1name = N'spClaimCompanyIntegrationRun';
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spRenewCompanyIntegrationRunLease]
    @RunID        UNIQUEIDENTIFIER,
    @OwnerToken   UNIQUEIDENTIFIER,
    @FenceToken   INT,
    @LeaseMinutes INT,
    @ProgressJSON NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Renewed TABLE (FenceToken INT, LeaseExpiresAt DATETIMEOFFSET, CancelRequestedAt DATETIMEOFFSET NULL);

    -- Renews ONLY if owner AND fence still match (lost-mutex protection:
    -- a reclaimed/stale holder cannot renew a fresh holder's lease).
    UPDATE [${flyway:defaultSchema}].[CompanyIntegrationRun]
       SET LeaseExpiresAt = DATEADD(MINUTE, @LeaseMinutes, SYSDATETIMEOFFSET()),
           HeartbeatAt    = SYSDATETIMEOFFSET(),
           ProgressJSON   = COALESCE(@ProgressJSON, ProgressJSON)
    OUTPUT INSERTED.FenceToken, INSERTED.LeaseExpiresAt, INSERTED.CancelRequestedAt INTO @Renewed
     WHERE ID = @RunID
       AND OwnerToken = @OwnerToken
       AND FenceToken = @FenceToken;

    -- Zero rows = the run was reclaimed underneath you; abort without writing.
    -- CancelRequestedAt rides along so the heartbeat doubles as the cancel check.
    SELECT FenceToken, LeaseExpiresAt, CancelRequestedAt FROM @Renewed;
END;
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spRenewCompanyIntegrationRunLease] TO [cdp_Developer];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spRenewCompanyIntegrationRunLease] TO [cdp_Integration];
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Atomically renews (extends) the owning process''s lease on a CompanyIntegrationRun IF AND ONLY IF both OwnerToken and FenceToken still match — a stale or reclaimed holder cannot renew a fresh holder''s lease (same lost-mutex protection as spExtendScheduledJobLease). Optionally updates ProgressJSON in the same statement. Returns the (unchanged) FenceToken, new LeaseExpiresAt, and CancelRequestedAt so the timer heartbeat doubles as the cross-process cancel check; ZERO rows returned = the run was reclaimed and the caller must abort without writing. Called from a timer at roughly one third of the lease interval, with the run''s configured MaxRuntimeMinutes-derived lease — so a single long batch cannot make a healthy run look dead.',
    @level0type = N'SCHEMA',    @level0name = N'${flyway:defaultSchema}',
    @level1type = N'PROCEDURE', @level1name = N'spRenewCompanyIntegrationRunLease';
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spReleaseCompanyIntegrationRun]
    @RunID       UNIQUEIDENTIFIER,
    @OwnerToken  UNIQUEIDENTIFIER,
    @FinalStatus NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Released TABLE (ID UNIQUEIDENTIFIER);

    UPDATE [${flyway:defaultSchema}].[CompanyIntegrationRun]
       SET Status         = @FinalStatus,
           OwnerToken     = NULL,
           LeaseExpiresAt = NULL,
           EndedAt        = COALESCE(EndedAt, SYSDATETIMEOFFSET())
    OUTPUT INSERTED.ID INTO @Released
     WHERE ID = @RunID
       AND OwnerToken = @OwnerToken;

    -- Zero rows = we no longer owned the run (reclaimed); the release is a no-op.
    SELECT ID FROM @Released;
END;
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spReleaseCompanyIntegrationRun] TO [cdp_Developer];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spReleaseCompanyIntegrationRun] TO [cdp_Integration];
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Releases ownership of a CompanyIntegrationRun, setting the terminal Status and clearing OwnerToken/LeaseExpiresAt (EndedAt is stamped if not already set) — but ONLY if the caller''s OwnerToken still matches. A stale holder''s release is a harmless no-op (zero rows returned) because a reclaim already replaced the token. Called by the engine on normal completion/failure and by the worker after execution.',
    @level0type = N'SCHEMA',    @level0name = N'${flyway:defaultSchema}',
    @level1type = N'PROCEDURE', @level1name = N'spReleaseCompanyIntegrationRun';
GO

-- ─── 5. RSUPendingWork — durable replacement for the .rsu_pending dir ─
-- The former mechanism was a directory of ${Date.now()}.json files with
-- delete-BEFORE-process semantics: a crash between read and process silently
-- lost the work, and corrupt files were silently skipped. Rows here are
-- completed only after the work succeeds; failures record the error and
-- leave the row visible.

CREATE TABLE [${flyway:defaultSchema}].[RSUPendingWork] (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    CompanyIntegrationID UNIQUEIDENTIFIER NOT NULL,
    PayloadJSON NVARCHAR(MAX) NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Pending',
    ErrorMessage NVARCHAR(MAX) NULL,
    ProcessedAt DATETIMEOFFSET NULL,
    CONSTRAINT PK_RSUPendingWork PRIMARY KEY (ID),
    CONSTRAINT FK_RSUPendingWork_CompanyIntegration FOREIGN KEY (CompanyIntegrationID)
        REFERENCES [${flyway:defaultSchema}].[CompanyIntegration](ID),
    CONSTRAINT CK_RSUPendingWork_Status
        CHECK (Status='Pending' OR Status='Completed' OR Status='Failed')
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Durable queue of Runtime Schema Update (RSU) pending setup work that must survive a server restart — replaces the former .rsu_pending directory of delete-on-read JSON files. A row is inserted when post-restart work is registered, marked Completed only AFTER the work succeeds, and marked Failed with ErrorMessage on error (never deleted on read), so stranded work older than N minutes is queryable instead of silently lost.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RSUPendingWork';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'The RSU pending-work payload (the RSUPendingWork JSON shape: SourceObjectNames, SchemaName, sync/schedule options). Stored as JSON so the payload can evolve without schema churn; only the RSU pipeline interprets it.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RSUPendingWork',
    @level2type = N'COLUMN', @level2name = N'PayloadJSON';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Lifecycle state of this pending work item. Pending = registered, not yet processed (rows Pending for longer than expected indicate stranded work). Completed = the post-restart consumer finished successfully. Failed = processing errored; see ErrorMessage.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RSUPendingWork',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Error detail recorded when processing this work item failed. The row is left in place (Status=Failed) rather than deleted, so failures are visible and re-runnable.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RSUPendingWork',
    @level2type = N'COLUMN', @level2name = N'ErrorMessage';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When the post-restart consumer finished processing this row (success or failure). NULL while Pending.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'RSUPendingWork',
    @level2type = N'COLUMN', @level2name = N'ProcessedAt';
GO


-- ==============================================================================
-- CODEGEN OUTPUT — generated by `mj codegen` against a fresh MJ database with
-- the DDL above applied. Entity/EntityField metadata, value lists, relationships,
-- FK indexes, base views, and CRUD sprocs for the schema changes in this
-- migration. Do not edit by hand.
-- ==============================================================================

/* SQL generated to create new entity MJ: RSU Pending Works */

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
         '4bc729d5-e37d-4b8a-8653-0cf009b42c10',
         'MJ: RSU Pending Works',
         'RSU Pending Works',
         'Durable queue of Runtime Schema Update (RSU) pending setup work that must survive a server restart — replaces the former .rsu_pending directory of delete-on-read JSON files. A row is inserted when post-restart work is registered, marked Completed only AFTER the work succeeds, and marked Failed with ErrorMessage on error (never deleted on read), so stranded work older than N minutes is queryable instead of silently lost.',
         NULL,
         'RSUPendingWork',
         'vwRSUPendingWorks',
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

/* SQL generated to add new entity MJ: RSU Pending Works to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
                                       ([ApplicationID], [EntityID], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '4bc729d5-e37d-4b8a-8653-0cf009b42c10', (SELECT COALESCE(MAX([Sequence]),0)+1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ApplicationID] = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Pending Works for role UI */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4bc729d5-e37d-4b8a-8653-0cf009b42c10', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Pending Works for role Developer */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4bc729d5-e37d-4b8a-8653-0cf009b42c10', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL generated to add new permission for entity MJ: RSU Pending Works for role Integration */
INSERT INTO [${flyway:defaultSchema}].[EntityPermission]
                                                   ([EntityID], [RoleID], [CanRead], [CanCreate], [CanUpdate], [CanDelete], [__mj_CreatedAt], [__mj_UpdatedAt]) VALUES
                                                   ('4bc729d5-e37d-4b8a-8653-0cf009b42c10', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1, GETUTCDATE(), GETUTCDATE());

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RSUPendingWork */
ALTER TABLE [${flyway:defaultSchema}].[RSUPendingWork] ADD [__mj_CreatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RSUPendingWork */
UPDATE [${flyway:defaultSchema}].[RSUPendingWork] SET [__mj_CreatedAt] = GETUTCDATE() WHERE [__mj_CreatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RSUPendingWork */
ALTER TABLE [${flyway:defaultSchema}].[RSUPendingWork] ALTER COLUMN [__mj_CreatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.RSUPendingWork */
ALTER TABLE [${flyway:defaultSchema}].[RSUPendingWork] ADD CONSTRAINT [DF___mj_RSUPendingWork___mj_CreatedAt] DEFAULT GETUTCDATE() FOR [__mj_CreatedAt];
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RSUPendingWork */
ALTER TABLE [${flyway:defaultSchema}].[RSUPendingWork] ADD [__mj_UpdatedAt] DATETIMEOFFSET NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RSUPendingWork */
UPDATE [${flyway:defaultSchema}].[RSUPendingWork] SET [__mj_UpdatedAt] = GETUTCDATE() WHERE [__mj_UpdatedAt] IS NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RSUPendingWork */
ALTER TABLE [${flyway:defaultSchema}].[RSUPendingWork] ALTER COLUMN [__mj_UpdatedAt] DATETIMEOFFSET NOT NULL;
GO

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.RSUPendingWork */
ALTER TABLE [${flyway:defaultSchema}].[RSUPendingWork] ADD CONSTRAINT [DF___mj_RSUPendingWork___mj_UpdatedAt] DEFAULT GETUTCDATE() FOR [__mj_UpdatedAt];
GO

/* SQL text to insert 14 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '23435976-52d3-4ebf-89b9-90d2cd8b2dd2' OR (EntityID = '4BC729D5-E37D-4B8A-8653-0CF009B42C10' AND Name = 'ID')) BEGIN
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
            '23435976-52d3-4ebf-89b9-90d2cd8b2dd2',
            '4BC729D5-E37D-4B8A-8653-0CF009B42C10', -- Entity: MJ: RSU Pending Works
            100001,
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
            1,
            0,
            0,
            1,
            1,
            'Search',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '7bf1de44-6f7a-4a3d-8977-21114ea59e14' OR (EntityID = '4BC729D5-E37D-4B8A-8653-0CF009B42C10' AND Name = 'CompanyIntegrationID')) BEGIN
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
            '7bf1de44-6f7a-4a3d-8977-21114ea59e14',
            '4BC729D5-E37D-4B8A-8653-0CF009B42C10', -- Entity: MJ: RSU Pending Works
            100002,
            'CompanyIntegrationID',
            'Company Integration ID',
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
            'DE238F34-2837-EF11-86D4-6045BDEE16E6',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '8fe7fb1d-8340-4289-9bca-f40950103a69' OR (EntityID = '4BC729D5-E37D-4B8A-8653-0CF009B42C10' AND Name = 'PayloadJSON')) BEGIN
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
            '8fe7fb1d-8340-4289-9bca-f40950103a69',
            '4BC729D5-E37D-4B8A-8653-0CF009B42C10', -- Entity: MJ: RSU Pending Works
            100003,
            'PayloadJSON',
            'Payload JSON',
            'The RSU pending-work payload (the RSUPendingWork JSON shape: SourceObjectNames, SchemaName, sync/schedule options). Stored as JSON so the payload can evolve without schema churn; only the RSU pipeline interprets it.',
            'nvarchar',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1b85b6a3-105e-40b1-b1b6-99e86b2fc19b' OR (EntityID = '4BC729D5-E37D-4B8A-8653-0CF009B42C10' AND Name = 'Status')) BEGIN
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
            '1b85b6a3-105e-40b1-b1b6-99e86b2fc19b',
            '4BC729D5-E37D-4B8A-8653-0CF009B42C10', -- Entity: MJ: RSU Pending Works
            100004,
            'Status',
            'Status',
            'Lifecycle state of this pending work item. Pending = registered, not yet processed (rows Pending for longer than expected indicate stranded work). Completed = the post-restart consumer finished successfully. Failed = processing errored; see ErrorMessage.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f0d3adee-b047-4dc6-b7a8-6b84eafd39ec' OR (EntityID = '4BC729D5-E37D-4B8A-8653-0CF009B42C10' AND Name = 'ErrorMessage')) BEGIN
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
            'f0d3adee-b047-4dc6-b7a8-6b84eafd39ec',
            '4BC729D5-E37D-4B8A-8653-0CF009B42C10', -- Entity: MJ: RSU Pending Works
            100005,
            'ErrorMessage',
            'Error Message',
            'Error detail recorded when processing this work item failed. The row is left in place (Status=Failed) rather than deleted, so failures are visible and re-runnable.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ee3f8713-8941-4c7d-97d8-3d8719463443' OR (EntityID = '4BC729D5-E37D-4B8A-8653-0CF009B42C10' AND Name = 'ProcessedAt')) BEGIN
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
            'ee3f8713-8941-4c7d-97d8-3d8719463443',
            '4BC729D5-E37D-4B8A-8653-0CF009B42C10', -- Entity: MJ: RSU Pending Works
            100006,
            'ProcessedAt',
            'Processed At',
            'When the post-restart consumer finished processing this row (success or failure). NULL while Pending.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '2dcd6237-cdf2-47bf-a30c-90ea60cc70b3' OR (EntityID = '4BC729D5-E37D-4B8A-8653-0CF009B42C10' AND Name = '__mj_CreatedAt')) BEGIN
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
            '2dcd6237-cdf2-47bf-a30c-90ea60cc70b3',
            '4BC729D5-E37D-4B8A-8653-0CF009B42C10', -- Entity: MJ: RSU Pending Works
            100007,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '6b898c30-5290-4956-a136-72c03aa7ca49' OR (EntityID = '4BC729D5-E37D-4B8A-8653-0CF009B42C10' AND Name = '__mj_UpdatedAt')) BEGIN
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
            '6b898c30-5290-4956-a136-72c03aa7ca49',
            '4BC729D5-E37D-4B8A-8653-0CF009B42C10', -- Entity: MJ: RSU Pending Works
            100008,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1cfc0cab-9501-4e75-8895-a1f70201de2d' OR (EntityID = 'E5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'OwnerToken')) BEGIN
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
            '1cfc0cab-9501-4e75-8895-a1f70201de2d',
            'E5238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integration Runs
            100036,
            'OwnerToken',
            'Owner Token',
            'Opaque token identifying the process currently executing this run. NULL = unowned. Set atomically by spClaimCompanyIntegrationRun; a claim succeeds only when the run is unowned or its lease has expired. Cleared by spReleaseCompanyIntegrationRun.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'c34608a3-bdfb-4931-867c-8a8ffd49c55c' OR (EntityID = 'E5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'LeaseExpiresAt')) BEGIN
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
            'c34608a3-bdfb-4931-867c-8a8ffd49c55c',
            'E5238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integration Runs
            100037,
            'LeaseExpiresAt',
            'Lease Expires At',
            'When the current owner''s lease expires. A run whose lease has passed is reclaimable by the stale sweep or another worker via spClaimCompanyIntegrationRun. Renewed on a timer by the owning engine via spRenewCompanyIntegrationRunLease.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f9a387a2-964c-4eda-b959-e2f3c771f9f9' OR (EntityID = 'E5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'HeartbeatAt')) BEGIN
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
            'f9a387a2-964c-4eda-b959-e2f3c771f9f9',
            'E5238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integration Runs
            100038,
            'HeartbeatAt',
            'Heartbeat At',
            'Timestamp of the owner''s most recent lease renewal (liveness signal). Updated by spClaimCompanyIntegrationRun and spRenewCompanyIntegrationRunLease.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '44dcc259-6252-4a3b-b485-89b0585799aa' OR (EntityID = 'E5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FenceToken')) BEGIN
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
            '44dcc259-6252-4a3b-b485-89b0585799aa',
            'E5238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integration Runs
            100039,
            'FenceToken',
            'Fence Token',
            'Monotonic fencing token, incremented on every successful claim/reclaim by spClaimCompanyIntegrationRun. The engine re-checks this at every batch boundary BEFORE writing: if it has moved, another process owns the run and the original owner aborts without writing. This is what turns the stale sweep from a double-run cause into a double-run fix.',
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '761351e1-56c1-4d4b-beec-df76be5a2898' OR (EntityID = 'E5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'CancelRequestedAt')) BEGIN
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
            '761351e1-56c1-4d4b-beec-df76be5a2898',
            'E5238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integration Runs
            100040,
            'CancelRequestedAt',
            'Cancel Requested At',
            'When cancellation was requested for this run (from any process). NULL = no cancel requested. The owning engine checks this at the same batch boundary as the fence token and stops at the next boundary. Replaces the former per-process in-memory cancellation map — the database row is the single source of truth.',
            'datetimeoffset',
            10,
            34,
            7,
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

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '1baed062-e987-4402-bdd5-0ac1facdd578' OR (EntityID = 'E5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ProgressJSON')) BEGIN
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
            '1baed062-e987-4402-bdd5-0ac1facdd578',
            'E5238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Company Integration Runs
            100041,
            'ProgressJSON',
            'Progress JSON',
            'JSON progress snapshot written (throttled, at most once per batch) by the owning engine. Readers query this row instead of an in-process map, so progress is visible from any process. Only the owner writes it.',
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

/* SQL text to insert entity field value with ID 21fd9711-86c1-4ebf-bef4-27363ff39ae8 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('21fd9711-86c1-4ebf-bef4-27363ff39ae8', '7D91381D-ABC9-46DD-AA66-3E1909BE1CB2', 4, 'Queued', 'Queued', GETUTCDATE(), GETUTCDATE());

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=5 WHERE ID='3C33762F-0B1F-420D-9F4D-9FFE92BED452';

/* SQL text to insert entity field value with ID b84812e1-822d-4a31-97e7-66d4bc5233f0 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b84812e1-822d-4a31-97e7-66d4bc5233f0', '1B85B6A3-105E-40B1-B1B6-99E86B2FC19B', 1, 'Completed', 'Completed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID ce79cd40-cbd9-4e82-818f-b48f68f29ed2 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ce79cd40-cbd9-4e82-818f-b48f68f29ed2', '1B85B6A3-105E-40B1-B1B6-99E86B2FC19B', 2, 'Failed', 'Failed', GETUTCDATE(), GETUTCDATE());

/* SQL text to insert entity field value with ID 92e7abd2-3b9d-4b88-9a18-bed73d3485da */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('92e7abd2-3b9d-4b88-9a18-bed73d3485da', '1B85B6A3-105E-40B1-B1B6-99E86B2FC19B', 3, 'Pending', 'Pending', GETUTCDATE(), GETUTCDATE());

/* SQL text to update ValueListType for entity field ID 1B85B6A3-105E-40B1-B1B6-99E86B2FC19B */
UPDATE [${flyway:defaultSchema}].[EntityField] SET ValueListType='List' WHERE ID='1B85B6A3-105E-40B1-B1B6-99E86B2FC19B';


/* Create Entity Relationship: MJ: Company Integrations -> MJ: RSU Pending Works (One To Many via CompanyIntegrationID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '9d1a461b-3aea-4f39-b573-67c1eac4a021'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('9d1a461b-3aea-4f39-b573-67c1eac4a021', 'DE238F34-2837-EF11-86D4-6045BDEE16E6', '4BC729D5-E37D-4B8A-8653-0CF009B42C10', 'CompanyIntegrationID', 'One To Many', 1, 1, 6, GETUTCDATE(), GETUTCDATE())
   END;

/* Index for Foreign Keys for CompanyIntegrationRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyIntegrationID in table CompanyIntegrationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_CompanyIntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_CompanyIntegrationID ON [${flyway:defaultSchema}].[CompanyIntegrationRun] ([CompanyIntegrationID]);

-- Index for foreign key RunByUserID in table CompanyIntegrationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_RunByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_RunByUserID ON [${flyway:defaultSchema}].[CompanyIntegrationRun] ([RunByUserID]);

-- Index for foreign key ScheduledJobRunID in table CompanyIntegrationRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_ScheduledJobRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[CompanyIntegrationRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_CompanyIntegrationRun_ScheduledJobRunID ON [${flyway:defaultSchema}].[CompanyIntegrationRun] ([ScheduledJobRunID]);

/* Base View Permissions SQL for MJ: Company Integration Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Runs
-- Item: Permissions for vwCompanyIntegrationRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwCompanyIntegrationRuns] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate SQL for MJ: Company Integration Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Runs
-- Item: spCreateCompanyIntegrationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegrationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateCompanyIntegrationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRun]
    @ID uniqueidentifier = NULL,
    @CompanyIntegrationID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @TotalRecords int,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @ErrorLog_Clear bit = 0,
    @ErrorLog nvarchar(MAX) = NULL,
    @ConfigData_Clear bit = 0,
    @ConfigData nvarchar(MAX) = NULL,
    @ScheduledJobRunID_Clear bit = 0,
    @ScheduledJobRunID uniqueidentifier = NULL,
    @OwnerToken_Clear bit = 0,
    @OwnerToken uniqueidentifier = NULL,
    @LeaseExpiresAt_Clear bit = 0,
    @LeaseExpiresAt datetimeoffset = NULL,
    @HeartbeatAt_Clear bit = 0,
    @HeartbeatAt datetimeoffset = NULL,
    @FenceToken int = NULL,
    @CancelRequestedAt_Clear bit = 0,
    @CancelRequestedAt datetimeoffset = NULL,
    @ProgressJSON_Clear bit = 0,
    @ProgressJSON nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun]
            (
                [ID],
                [CompanyIntegrationID],
                [RunByUserID],
                [StartedAt],
                [EndedAt],
                [TotalRecords],
                [Comments],
                [Status],
                [ErrorLog],
                [ConfigData],
                [ScheduledJobRunID],
                [OwnerToken],
                [LeaseExpiresAt],
                [HeartbeatAt],
                [FenceToken],
                [CancelRequestedAt],
                [ProgressJSON]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyIntegrationID,
                @RunByUserID,
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                @TotalRecords,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @ErrorLog_Clear = 1 THEN NULL ELSE ISNULL(@ErrorLog, NULL) END,
                CASE WHEN @ConfigData_Clear = 1 THEN NULL ELSE ISNULL(@ConfigData, NULL) END,
                CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, NULL) END,
                CASE WHEN @OwnerToken_Clear = 1 THEN NULL ELSE ISNULL(@OwnerToken, NULL) END,
                CASE WHEN @LeaseExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@LeaseExpiresAt, NULL) END,
                CASE WHEN @HeartbeatAt_Clear = 1 THEN NULL ELSE ISNULL(@HeartbeatAt, NULL) END,
                ISNULL(@FenceToken, 0),
                CASE WHEN @CancelRequestedAt_Clear = 1 THEN NULL ELSE ISNULL(@CancelRequestedAt, NULL) END,
                CASE WHEN @ProgressJSON_Clear = 1 THEN NULL ELSE ISNULL(@ProgressJSON, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegrationRun]
            (
                [CompanyIntegrationID],
                [RunByUserID],
                [StartedAt],
                [EndedAt],
                [TotalRecords],
                [Comments],
                [Status],
                [ErrorLog],
                [ConfigData],
                [ScheduledJobRunID],
                [OwnerToken],
                [LeaseExpiresAt],
                [HeartbeatAt],
                [FenceToken],
                [CancelRequestedAt],
                [ProgressJSON]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyIntegrationID,
                @RunByUserID,
                CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, NULL) END,
                CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, NULL) END,
                @TotalRecords,
                CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, NULL) END,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @ErrorLog_Clear = 1 THEN NULL ELSE ISNULL(@ErrorLog, NULL) END,
                CASE WHEN @ConfigData_Clear = 1 THEN NULL ELSE ISNULL(@ConfigData, NULL) END,
                CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, NULL) END,
                CASE WHEN @OwnerToken_Clear = 1 THEN NULL ELSE ISNULL(@OwnerToken, NULL) END,
                CASE WHEN @LeaseExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@LeaseExpiresAt, NULL) END,
                CASE WHEN @HeartbeatAt_Clear = 1 THEN NULL ELSE ISNULL(@HeartbeatAt, NULL) END,
                ISNULL(@FenceToken, 0),
                CASE WHEN @CancelRequestedAt_Clear = 1 THEN NULL ELSE ISNULL(@CancelRequestedAt, NULL) END,
                CASE WHEN @ProgressJSON_Clear = 1 THEN NULL ELSE ISNULL(@ProgressJSON, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: Company Integration Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: Company Integration Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Runs
-- Item: spUpdateCompanyIntegrationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegrationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateCompanyIntegrationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRun]
    @ID uniqueidentifier,
    @CompanyIntegrationID uniqueidentifier = NULL,
    @RunByUserID uniqueidentifier = NULL,
    @StartedAt_Clear bit = 0,
    @StartedAt datetimeoffset = NULL,
    @EndedAt_Clear bit = 0,
    @EndedAt datetimeoffset = NULL,
    @TotalRecords int = NULL,
    @Comments_Clear bit = 0,
    @Comments nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @ErrorLog_Clear bit = 0,
    @ErrorLog nvarchar(MAX) = NULL,
    @ConfigData_Clear bit = 0,
    @ConfigData nvarchar(MAX) = NULL,
    @ScheduledJobRunID_Clear bit = 0,
    @ScheduledJobRunID uniqueidentifier = NULL,
    @OwnerToken_Clear bit = 0,
    @OwnerToken uniqueidentifier = NULL,
    @LeaseExpiresAt_Clear bit = 0,
    @LeaseExpiresAt datetimeoffset = NULL,
    @HeartbeatAt_Clear bit = 0,
    @HeartbeatAt datetimeoffset = NULL,
    @FenceToken int = NULL,
    @CancelRequestedAt_Clear bit = 0,
    @CancelRequestedAt datetimeoffset = NULL,
    @ProgressJSON_Clear bit = 0,
    @ProgressJSON nvarchar(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRun]
    SET
        [CompanyIntegrationID] = ISNULL(@CompanyIntegrationID, [CompanyIntegrationID]),
        [RunByUserID] = ISNULL(@RunByUserID, [RunByUserID]),
        [StartedAt] = CASE WHEN @StartedAt_Clear = 1 THEN NULL ELSE ISNULL(@StartedAt, [StartedAt]) END,
        [EndedAt] = CASE WHEN @EndedAt_Clear = 1 THEN NULL ELSE ISNULL(@EndedAt, [EndedAt]) END,
        [TotalRecords] = ISNULL(@TotalRecords, [TotalRecords]),
        [Comments] = CASE WHEN @Comments_Clear = 1 THEN NULL ELSE ISNULL(@Comments, [Comments]) END,
        [Status] = ISNULL(@Status, [Status]),
        [ErrorLog] = CASE WHEN @ErrorLog_Clear = 1 THEN NULL ELSE ISNULL(@ErrorLog, [ErrorLog]) END,
        [ConfigData] = CASE WHEN @ConfigData_Clear = 1 THEN NULL ELSE ISNULL(@ConfigData, [ConfigData]) END,
        [ScheduledJobRunID] = CASE WHEN @ScheduledJobRunID_Clear = 1 THEN NULL ELSE ISNULL(@ScheduledJobRunID, [ScheduledJobRunID]) END,
        [OwnerToken] = CASE WHEN @OwnerToken_Clear = 1 THEN NULL ELSE ISNULL(@OwnerToken, [OwnerToken]) END,
        [LeaseExpiresAt] = CASE WHEN @LeaseExpiresAt_Clear = 1 THEN NULL ELSE ISNULL(@LeaseExpiresAt, [LeaseExpiresAt]) END,
        [HeartbeatAt] = CASE WHEN @HeartbeatAt_Clear = 1 THEN NULL ELSE ISNULL(@HeartbeatAt, [HeartbeatAt]) END,
        [FenceToken] = ISNULL(@FenceToken, [FenceToken]),
        [CancelRequestedAt] = CASE WHEN @CancelRequestedAt_Clear = 1 THEN NULL ELSE ISNULL(@CancelRequestedAt, [CancelRequestedAt]) END,
        [ProgressJSON] = CASE WHEN @ProgressJSON_Clear = 1 THEN NULL ELSE ISNULL(@ProgressJSON, [ProgressJSON]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwCompanyIntegrationRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationRun table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateCompanyIntegrationRun];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateCompanyIntegrationRun
ON [${flyway:defaultSchema}].[CompanyIntegrationRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[CompanyIntegrationRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: Company Integration Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: Company Integration Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integration Runs
-- Item: spDeleteCompanyIntegrationRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegrationRun
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteCompanyIntegrationRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[CompanyIntegrationRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: Company Integration Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteCompanyIntegrationRun] TO [cdp_Developer], [cdp_Integration];

/* Index for Foreign Keys for RSUPendingWork */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Pending Works
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CompanyIntegrationID in table RSUPendingWork
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RSUPendingWork_CompanyIntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RSUPendingWork]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RSUPendingWork_CompanyIntegrationID ON [${flyway:defaultSchema}].[RSUPendingWork] ([CompanyIntegrationID]);

/* SQL text to update entity field related entity name field map for entity field ID 7BF1DE44-6F7A-4A3D-8977-21114EA59E14 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='7BF1DE44-6F7A-4A3D-8977-21114EA59E14', @RelatedEntityNameFieldMap='CompanyIntegration';

/* Base View SQL for MJ: RSU Pending Works */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Pending Works
-- Item: vwRSUPendingWorks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: RSU Pending Works
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RSUPendingWork
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRSUPendingWorks]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRSUPendingWorks];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRSUPendingWorks]
AS
SELECT
    r.*,
    MJCompanyIntegration_CompanyIntegrationID.[Name] AS [CompanyIntegration]
FROM
    [${flyway:defaultSchema}].[RSUPendingWork] AS r
INNER JOIN
    [${flyway:defaultSchema}].[CompanyIntegration] AS MJCompanyIntegration_CompanyIntegrationID
  ON
    [r].[CompanyIntegrationID] = MJCompanyIntegration_CompanyIntegrationID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRSUPendingWorks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* Base View Permissions SQL for MJ: RSU Pending Works */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Pending Works
-- Item: Permissions for vwRSUPendingWorks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRSUPendingWorks] TO [cdp_UI], [cdp_Developer], [cdp_Integration];

/* spCreate SQL for MJ: RSU Pending Works */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Pending Works
-- Item: spCreateRSUPendingWork
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR RSUPendingWork
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateRSUPendingWork]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateRSUPendingWork];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateRSUPendingWork]
    @ID uniqueidentifier = NULL,
    @CompanyIntegrationID uniqueidentifier,
    @PayloadJSON nvarchar(MAX),
    @Status nvarchar(20) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ProcessedAt_Clear bit = 0,
    @ProcessedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[RSUPendingWork]
            (
                [ID],
                [CompanyIntegrationID],
                [PayloadJSON],
                [Status],
                [ErrorMessage],
                [ProcessedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyIntegrationID,
                @PayloadJSON,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ProcessedAt_Clear = 1 THEN NULL ELSE ISNULL(@ProcessedAt, NULL) END
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[RSUPendingWork]
            (
                [CompanyIntegrationID],
                [PayloadJSON],
                [Status],
                [ErrorMessage],
                [ProcessedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyIntegrationID,
                @PayloadJSON,
                ISNULL(@Status, 'Pending'),
                CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, NULL) END,
                CASE WHEN @ProcessedAt_Clear = 1 THEN NULL ELSE ISNULL(@ProcessedAt, NULL) END
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRSUPendingWorks] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRSUPendingWork] TO [cdp_Developer], [cdp_Integration];

/* spCreate Permissions for MJ: RSU Pending Works */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRSUPendingWork] TO [cdp_Developer], [cdp_Integration];

/* spUpdate SQL for MJ: RSU Pending Works */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Pending Works
-- Item: spUpdateRSUPendingWork
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR RSUPendingWork
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateRSUPendingWork]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateRSUPendingWork];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateRSUPendingWork]
    @ID uniqueidentifier,
    @CompanyIntegrationID uniqueidentifier = NULL,
    @PayloadJSON nvarchar(MAX) = NULL,
    @Status nvarchar(20) = NULL,
    @ErrorMessage_Clear bit = 0,
    @ErrorMessage nvarchar(MAX) = NULL,
    @ProcessedAt_Clear bit = 0,
    @ProcessedAt datetimeoffset = NULL
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RSUPendingWork]
    SET
        [CompanyIntegrationID] = ISNULL(@CompanyIntegrationID, [CompanyIntegrationID]),
        [PayloadJSON] = ISNULL(@PayloadJSON, [PayloadJSON]),
        [Status] = ISNULL(@Status, [Status]),
        [ErrorMessage] = CASE WHEN @ErrorMessage_Clear = 1 THEN NULL ELSE ISNULL(@ErrorMessage, [ErrorMessage]) END,
        [ProcessedAt] = CASE WHEN @ProcessedAt_Clear = 1 THEN NULL ELSE ISNULL(@ProcessedAt, [ProcessedAt]) END
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRSUPendingWorks] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRSUPendingWorks]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRSUPendingWork] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RSUPendingWork table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateRSUPendingWork]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateRSUPendingWork];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateRSUPendingWork
ON [${flyway:defaultSchema}].[RSUPendingWork]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RSUPendingWork]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[RSUPendingWork] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO

/* spUpdate Permissions for MJ: RSU Pending Works */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRSUPendingWork] TO [cdp_Developer], [cdp_Integration];

/* spDelete SQL for MJ: RSU Pending Works */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: RSU Pending Works
-- Item: spDeleteRSUPendingWork
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RSUPendingWork
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRSUPendingWork]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRSUPendingWork];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRSUPendingWork]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RSUPendingWork]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRSUPendingWork] TO [cdp_Developer], [cdp_Integration];

/* spDelete Permissions for MJ: RSU Pending Works */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteRSUPendingWork] TO [cdp_Developer], [cdp_Integration];

/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '0374a147-0c25-482f-ae1f-4cde88bbd0c1' OR (EntityID = '4BC729D5-E37D-4B8A-8653-0CF009B42C10' AND Name = 'CompanyIntegration')) BEGIN
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
            '0374a147-0c25-482f-ae1f-4cde88bbd0c1',
            '4BC729D5-E37D-4B8A-8653-0CF009B42C10', -- Entity: MJ: RSU Pending Works
            100017,
            'CompanyIntegration',
            'Company Integration',
            NULL,
            'nvarchar',
            510,
            0,
            0,
            0,
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

/* Refresh custom base views for modified entities so schema changes are picked up */
EXEC sp_refreshview '${flyway:defaultSchema}.vwCompanyIntegrationRuns';

