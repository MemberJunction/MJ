-- =====================================================================================
-- RecordChange: add 'Sync' Source discriminator, @IntegrationID proc parameter, and
-- composite (EntityID, ChangedAt) watermark index for MJ Peer Sync (#6021 / #6502)
--
-- 1. Widens CHK_RecordChange_Source to allow 'Sync' alongside
--    ('Internal', 'External', 'Restore', 'Clone').
-- 2. Adds IX_RecordChange_EntityID_ChangedAt on (EntityID, ChangedAt) INCLUDE
--    (RecordID, Type, Source) so Peer Sync composite cursor queries seek directly
--    instead of scanning RecordChange (IX_RecordChange_EntityID_RecordID_ChangedAt
--    has RecordID second and cannot serve entity-wide ChangedAt range seeks).
-- 3. Extends spCreateRecordChange_Internal (retaining @EntityID and @SuppressReturn
--    from V202611150900) with @IntegrationID UNIQUEIDENTIFIER = NULL and persists it
--    to RecordChange.IntegrationID (FK to Integration.ID).
-- =====================================================================================

ALTER TABLE [${flyway:defaultSchema}].[RecordChange]
    DROP CONSTRAINT [CHK_RecordChange_Source];
GO

ALTER TABLE [${flyway:defaultSchema}].[RecordChange]
    ADD CONSTRAINT [CHK_RecordChange_Source]
    CHECK ([Source] IN ('Internal', 'External', 'Restore', 'Clone', 'Sync'));
GO

CREATE NONCLUSTERED INDEX [IX_RecordChange_EntityID_ChangedAt]
    ON [${flyway:defaultSchema}].[RecordChange] ([EntityID] ASC, [ChangedAt] ASC)
    INCLUDE ([RecordID], [Type], [Source]);
GO

CREATE OR ALTER PROCEDURE [${flyway:defaultSchema}].[spCreateRecordChange_Internal]
    @EntityName          NVARCHAR(100),
    @RecordID            NVARCHAR(750),
    @UserID              UNIQUEIDENTIFIER,
    @Type                NVARCHAR(20),
    @ChangesJSON         NVARCHAR(MAX),
    @ChangesDescription  NVARCHAR(MAX),
    @FullRecordJSON      NVARCHAR(MAX),
    @Status              NCHAR(15),
    @Comments            NVARCHAR(MAX),
    @Source              NVARCHAR(20)     = NULL,
    @RestoredFromID      UNIQUEIDENTIFIER = NULL,
    @RestoreReason       NVARCHAR(MAX)    = NULL,
    @ChangeContext       NVARCHAR(MAX)    = NULL,
    @EntityID            UNIQUEIDENTIFIER = NULL,
    @SuppressReturn      BIT              = 0,
    @IntegrationID       UNIQUEIDENTIFIER = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @ResolvedEntityID UNIQUEIDENTIFIER = COALESCE(
        @EntityID,
        (SELECT ID FROM [${flyway:defaultSchema}].[Entity] WHERE [Name] = @EntityName)
    );

    IF @SuppressReturn = 1
    BEGIN
        INSERT INTO [${flyway:defaultSchema}].[RecordChange]
            (
                EntityID,
                RecordID,
                UserID,
                Type,
                Source,
                ChangedAt,
                ChangesJSON,
                ChangesDescription,
                FullRecordJSON,
                Status,
                Comments,
                RestoredFromID,
                RestoreReason,
                ChangeContext,
                IntegrationID
            )
        VALUES
            (
                @ResolvedEntityID,
                @RecordID,
                @UserID,
                @Type,
                ISNULL(@Source, 'Internal'),
                GETUTCDATE(),
                @ChangesJSON,
                @ChangesDescription,
                @FullRecordJSON,
                @Status,
                @Comments,
                @RestoredFromID,
                @RestoreReason,
                @ChangeContext,
                @IntegrationID
            );
        RETURN;
    END

    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER);

    INSERT INTO [${flyway:defaultSchema}].[RecordChange]
        (
            EntityID,
            RecordID,
            UserID,
            Type,
            Source,
            ChangedAt,
            ChangesJSON,
            ChangesDescription,
            FullRecordJSON,
            Status,
            Comments,
            RestoredFromID,
            RestoreReason,
            ChangeContext,
            IntegrationID
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            @ResolvedEntityID,
            @RecordID,
            @UserID,
            @Type,
            ISNULL(@Source, 'Internal'),
            GETUTCDATE(),
            @ChangesJSON,
            @ChangesDescription,
            @FullRecordJSON,
            @Status,
            @Comments,
            @RestoredFromID,
            @RestoreReason,
            @ChangeContext,
            @IntegrationID
        );

    -- Return the new record from the base view so calculated fields are included
    SELECT *
    FROM [${flyway:defaultSchema}].[vwRecordChanges]
    WHERE [ID] = (SELECT [ID] FROM @InsertedRow);
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChange_Internal] TO [cdp_Developer], [cdp_Integration], [cdp_UI];
GO























































/* =====================================================================================
   CODEGEN OUTPUT — everything below this banner was generated by the MemberJunction
   CodeGen tool (mj codegen) against a database built from migrations + metadata, then
   appended here. It contains the EntityFieldValue row for the new 'Sync' value on
   MJ: Record Changes.Source, the foreign-key indexes for RecordChange, the regenerated
   vwRecordChanges view and its permissions, and the spCreateRecordChange /
   spUpdateRecordChange / spDeleteRecordChange procedures and grants.

   Left out: blocks produced in the same run that this migration does not cause
   (EntityUniqueKey rows for ArtifactGuestShareLink + three ML entities, SubtypeSelector
   updates on MJ: Conversations and MJ: Comments, and RelatedEntityNameFieldMap updates
   on ArtifactGuestShareLink).

   Do NOT edit it by hand. If the hand-written DDL above changes, re-run CodeGen and
   replace this entire section.
   ===================================================================================== */

/* SQL text to sync 1 entity field value row(s) for entity field ID B85717F0-6F36-EF11-86D4-6045BDEE16E6 */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [Source], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('b314f05d-e84b-4a97-9386-3e66e6ee8513', 'B85717F0-6F36-EF11-86D4-6045BDEE16E6', 5, 'Sync', 'Sync', 'Check', GETUTCDATE(), GETUTCDATE());


/* Index for Foreign Keys for RecordChange */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Changes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table RecordChange
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordChange_EntityID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
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
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordChange_EntityID ON [${flyway:defaultSchema}].[RecordChange] ([EntityID]);

-- Index for foreign key RecordID in table RecordChange
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordChange_RecordID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'RecordID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordChange_RecordID ON [${flyway:defaultSchema}].[RecordChange] ([RecordID]);

-- Index for foreign key UserID in table RecordChange
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordChange_UserID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'UserID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordChange_UserID ON [${flyway:defaultSchema}].[RecordChange] ([UserID]);

-- Index for foreign key ReplayRunID in table RecordChange
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordChange_ReplayRunID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'ReplayRunID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordChange_ReplayRunID ON [${flyway:defaultSchema}].[RecordChange] ([ReplayRunID]);

-- Index for foreign key IntegrationID in table RecordChange
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordChange_IntegrationID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'IntegrationID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordChange_IntegrationID ON [${flyway:defaultSchema}].[RecordChange] ([IntegrationID]);

-- Index for foreign key RestoredFromID in table RecordChange
-- Skipped when the index exists or another unfiltered index already leads with the column.
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordChange_RestoredFromID'
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
    UNION ALL
    SELECT 1
    FROM sys.indexes i
    WHERE i.object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
    AND i.has_filter = 0
    AND i.is_disabled = 0
    AND i.is_hypothetical = 0
    AND (
        SELECT COUNT(*)
        FROM sys.index_columns ic
        WHERE ic.object_id = i.object_id
        AND ic.index_id = i.index_id
        AND ic.is_included_column = 0
        AND ((ic.key_ordinal = 1 AND COL_NAME(ic.object_id, ic.column_id) = 'RestoredFromID'))
    ) = 1
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordChange_RestoredFromID ON [${flyway:defaultSchema}].[RecordChange] ([RestoredFromID]);

/* Base View SQL for MJ: Record Changes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Changes
-- Item: vwRecordChanges
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Record Changes
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  RecordChange
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwRecordChanges]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwRecordChanges];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwRecordChanges]
AS
SELECT
    r.*,
    MJEntity_EntityID.[Name] AS [Entity],
    MJUser_UserID.[Name] AS [User],
    MJRecordChangeReplayRun_ReplayRunID.[User] AS [ReplayRun],
    MJIntegration_IntegrationID.[Name] AS [Integration],
    MJRecordChange_RestoredFromID.[RecordID] AS [RestoredFrom]
FROM
    [${flyway:defaultSchema}].[RecordChange] AS r
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [r].[EntityID] = MJEntity_EntityID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_UserID
  ON
    [r].[UserID] = MJUser_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[vwRecordChangeReplayRuns] AS MJRecordChangeReplayRun_ReplayRunID
  ON
    [r].[ReplayRunID] = MJRecordChangeReplayRun_ReplayRunID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Integration] AS MJIntegration_IntegrationID
  ON
    [r].[IntegrationID] = MJIntegration_IntegrationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RecordChange] AS MJRecordChange_RestoredFromID
  ON
    [r].[RestoredFromID] = MJRecordChange_RestoredFromID.[ID]
GO
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRecordChanges] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRecordChanges] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRecordChanges] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordChanges] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* Base View Permissions SQL for MJ: Record Changes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Changes
-- Item: Permissions for vwRecordChanges
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

REVOKE SELECT ON [${flyway:defaultSchema}].[vwRecordChanges] FROM [cdp_Developer]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRecordChanges] FROM [cdp_Integration]
REVOKE SELECT ON [${flyway:defaultSchema}].[vwRecordChanges] FROM [cdp_UI]
GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordChanges] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

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
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChange] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChange] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChange] FROM [cdp_UI]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChange] TO [cdp_Developer], [cdp_UI], [cdp_Integration];

/* spCreate Permissions for MJ: Record Changes */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChange] FROM [cdp_Developer]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChange] FROM [cdp_Integration]
REVOKE EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChange] FROM [cdp_UI]
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

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordChange] FROM [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordChange] TO [cdp_Developer]
GO

/* spUpdate Permissions for MJ: Record Changes */

REVOKE EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordChange] FROM [cdp_Developer]
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordChange] TO [cdp_Developer];

/* spDelete SQL for MJ: Record Changes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Changes
-- Item: spDeleteRecordChange
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR RecordChange
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteRecordChange]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordChange];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteRecordChange]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[RecordChange]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO

/* spDelete Permissions for MJ: Record Changes */;

