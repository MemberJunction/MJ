-- =============================================================================
-- RecordChange.ChangeContext and Source='Clone'
-- =============================================================================
-- Adds the ChangeContext column and 'Clone' Source discriminator value to
-- RecordChange to support structured provenance tracking for multi-record
-- operations such as cloning, merging, and replays.
--
-- 1. ChangeContext (NVARCHAR(MAX) NULL)
--    JSON bag carrying structured provenance context (shape = IRecordChangeContext).
--    Includes Clone context (CloneLogID, SourceRecordID, RootRecordID, Route, etc.).
--
-- 2. Source enum extension
--    Extends CHK_RecordChange_Source to permit 'Clone'.
--
-- 3. spCreateRecordChange_Internal update
--    Recreates the internal change-logging procedure with @ChangeContext.
-- =============================================================================

-------------------------------------------------------------------------------
-- 1. Extend RecordChange.Source CHECK to allow 'Clone'
-------------------------------------------------------------------------------
IF EXISTS (
    SELECT 1 FROM sys.check_constraints cc
    JOIN sys.tables t ON cc.parent_object_id = t.object_id
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = '${flyway:defaultSchema}' AND t.name = 'RecordChange' AND cc.name = 'CHK_RecordChange_Source'
)
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[RecordChange] DROP CONSTRAINT [CHK_RecordChange_Source];
END
GO

ALTER TABLE [${flyway:defaultSchema}].[RecordChange] ADD CONSTRAINT [CHK_RecordChange_Source]
    CHECK ([Source] IN ('Internal', 'External', 'Restore', 'Clone'));
GO

-------------------------------------------------------------------------------
-- 2. Add ChangeContext column to RecordChange
-------------------------------------------------------------------------------
IF NOT EXISTS (
    SELECT 1 FROM sys.columns c
    JOIN sys.tables t ON c.object_id = t.object_id
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = '${flyway:defaultSchema}' AND t.name = 'RecordChange' AND c.name = 'ChangeContext'
)
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[RecordChange]
        ADD [ChangeContext] NVARCHAR(MAX) NULL;
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.extended_properties ep
    JOIN sys.tables t ON ep.major_id = t.object_id
    JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
    JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = '${flyway:defaultSchema}' AND t.name = 'RecordChange' AND c.name = 'ChangeContext' AND ep.name = 'MS_Description'
)
BEGIN
    EXEC sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Optional JSON configuration bag carrying structured provenance context (shape = IRecordChangeContext). Used by clone, merge, and other multi-record or automated operations to record lineage, root records, and field change summaries.',
        @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
        @level1type = N'TABLE',  @level1name = 'RecordChange',
        @level2type = N'COLUMN', @level2name = 'ChangeContext';
END
GO

-------------------------------------------------------------------------------
-- 3. Recreate spCreateRecordChange_Internal with @ChangeContext
-------------------------------------------------------------------------------
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
    @ChangeContext       NVARCHAR(MAX)    = NULL
AS
BEGIN
    SET NOCOUNT ON;

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
            ChangeContext
        )
    OUTPUT INSERTED.[ID] INTO @InsertedRow
    VALUES
        (
            (SELECT ID FROM [${flyway:defaultSchema}].[Entity] WHERE [Name] = @EntityName),
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
            @ChangeContext
        );

    -- Return the new record from the base view so calculated fields are included
    SELECT *
    FROM [${flyway:defaultSchema}].[vwRecordChanges]
    WHERE [ID] = (SELECT [ID] FROM @InsertedRow);
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChange_Internal] TO [cdp_Developer], [cdp_Integration], [cdp_UI];
GO


















































-- =============================================================================
-- GENERATED BY MemberJunction CodeGen — DO NOT EDIT BY HAND
-- =============================================================================
-- Everything below this block was produced by `mj codegen --skipfiles` after
-- the hand-written ALTER TABLE above. It contains:
--   * EntityField INSERT for RecordChange.ChangeContext (apply-time Sequence)
--   * EntityFieldValue INSERT for RecordChange.Source 'Clone'
--   * Regenerated RecordChange FK indexes, vwRecordChanges, spCreateRecordChange,
--     spUpdateRecordChange, spDeleteRecordChange, and permissions
-- =============================================================================
/* SQL text to insert 1 new entity field(s) */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '44df31cd-5787-4b0d-82f7-547743cf6f7f' OR (EntityID = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'ChangeContext')) BEGIN
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
            [JSONType],
            [JSONTypeIsArray],
            [JSONTypeDefinition],
            [__mj_CreatedAt],
            [__mj_UpdatedAt]
         )
         VALUES
         (
            '44df31cd-5787-4b0d-82f7-547743cf6f7f',
            'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Record Changes
            (SELECT COALESCE(MAX([Sequence]), 0) + 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE [EntityID] = 'F5238F34-2837-EF11-86D4-6045BDEE16E6'),
            'ChangeContext',
            'Change Context',
            'Optional JSON configuration bag carrying structured provenance context (shape = IRecordChangeContext). Used by clone, merge, and other multi-record or automated operations to record lineage, root records, and field change summaries.',
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
            'IRecordChangeContext',
            0,
            '@file:JSONType-interfaces/IRecordChangeContext.ts',
            GETUTCDATE(),
            GETUTCDATE()
         )
      END;

/* SQL text to insert entity field value with ID b3aa2c30-a00e-4af8-ad34-9ebd18658651 */
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityFieldValue] WHERE [ID] = 'b3aa2c30-a00e-4af8-ad34-9ebd18658651')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
        ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
    VALUES
        ('b3aa2c30-a00e-4af8-ad34-9ebd18658651', 'B85717F0-6F36-EF11-86D4-6045BDEE16E6', 1, 'Clone', 'Clone', GETUTCDATE(), GETUTCDATE());
END
GO

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=2 WHERE ID='FFCA5310-D2BE-433B-AA87-22770FAFA950';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=3 WHERE ID='88A1D937-0A97-48BA-AF13-A7E9CDDC16F9';

/* SQL text to update entity field value sequence */
UPDATE [${flyway:defaultSchema}].[EntityFieldValue] SET Sequence=4 WHERE ID='CA0C7411-739A-480B-B084-3667C501525D';

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
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordChange_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordChange_EntityID ON [${flyway:defaultSchema}].[RecordChange] ([EntityID]);

-- Index for foreign key UserID in table RecordChange
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordChange_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordChange_UserID ON [${flyway:defaultSchema}].[RecordChange] ([UserID]);

-- Index for foreign key ReplayRunID in table RecordChange
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordChange_ReplayRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordChange_ReplayRunID ON [${flyway:defaultSchema}].[RecordChange] ([ReplayRunID]);

-- Index for foreign key IntegrationID in table RecordChange
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordChange_IntegrationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_RecordChange_IntegrationID ON [${flyway:defaultSchema}].[RecordChange] ([IntegrationID]);

-- Index for foreign key RestoredFromID in table RecordChange
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_RecordChange_RestoredFromID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[RecordChange]')
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
INNER JOIN
    [${flyway:defaultSchema}].[Entity] AS MJEntity_EntityID
  ON
    [r].[EntityID] = MJEntity_EntityID.[ID]
INNER JOIN
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
    SELECT * FROM [${flyway:defaultSchema}].[vwRecordChanges] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
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
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwRecordChanges] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwRecordChanges]
                                    WHERE
                                        [ID] = @ID
                                    
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

