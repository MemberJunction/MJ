-- =====================================================================
-- Add Restore Lineage to RecordChange
-- =====================================================================
-- Adds the columns needed to support a first-class "Restore record to
-- this version" capability on top of the existing change-tracking system.
--
-- 1. RestoredFromID (FK -> RecordChange.ID)
--    When a RecordChange row was produced by a restore operation, this
--    points at the historical change whose state was restored. Builds the
--    version-chain lineage that auditors can follow.
--
-- 2. RestoreReason (NVARCHAR(MAX))
--    Optional user-entered explanation captured at restore time and
--    persisted alongside the audit row. Useful for regulated-industry
--    workflows where every reversal needs justification.
--
-- 3. Source enum extension
--    Adds 'Restore' to the existing Internal/External CHECK so the
--    timeline can distinguish restore operations from regular edits and
--    from external-system imports.
--
-- ReplayRunID is intentionally untouched -- it tracks the unrelated
-- external-change-detection replay run, not user-initiated restore.
-- =====================================================================

-----------------------------------------------------------------------
-- 1. Extend RecordChange.Source CHECK to allow 'Restore'
-----------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.RecordChange DROP CONSTRAINT CHK_RecordChange_Source;

ALTER TABLE ${flyway:defaultSchema}.RecordChange ADD CONSTRAINT CHK_RecordChange_Source
    CHECK (Source IN ('Internal', 'External', 'Restore'));

-----------------------------------------------------------------------
-- 2. Add restore lineage columns
-----------------------------------------------------------------------
ALTER TABLE ${flyway:defaultSchema}.RecordChange ADD
    RestoredFromID UNIQUEIDENTIFIER NULL
        CONSTRAINT FK_RecordChange_RestoredFromID
        FOREIGN KEY REFERENCES ${flyway:defaultSchema}.RecordChange(ID),
    RestoreReason NVARCHAR(MAX) NULL;
GO
-----------------------------------------------------------------------
-- 3. Extended properties (descriptions used by CodeGen)
-----------------------------------------------------------------------
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When this RecordChange was produced by a restore operation, points at the historical RecordChange whose state was restored. NULL for ordinary changes. Together with Source=''Restore'' this builds the version-chain lineage for auditing and timeline navigation.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'RecordChange',
    @level2type = N'COLUMN', @level2name = 'RestoredFromID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional user-entered explanation captured at restore time. Persisted for audit purposes (regulated industries often require a reason for every reversal). NULL when the user did not enter one or when the change was not a restore.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'RecordChange',
    @level2type = N'COLUMN', @level2name = 'RestoreReason';









































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f3896b5f-5caa-4c47-95ca-0c95d67b6c58' OR (EntityID = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RestoredFromID')) BEGIN
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
            'f3896b5f-5caa-4c47-95ca-0c95d67b6c58',
            'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Record Changes
            100039,
            'RestoredFromID',
            'Restored From ID',
            'When this RecordChange was produced by a restore operation, points at the historical RecordChange whose state was restored. NULL for ordinary changes. Together with Source=''Restore'' this builds the version-chain lineage for auditing and timeline navigation.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            1,
            0,
            'F5238F34-2837-EF11-86D4-6045BDEE16E6',
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'f68a6734-5b76-4a35-8652-09e51dbae5a2' OR (EntityID = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RestoreReason')) BEGIN
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
            'f68a6734-5b76-4a35-8652-09e51dbae5a2',
            'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Record Changes
            100040,
            'RestoreReason',
            'Restore Reason',
            'Optional user-entered explanation captured at restore time. Persisted for audit purposes (regulated industries often require a reason for every reversal). NULL when the user did not enter one or when the change was not a restore.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
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
      END

/* SQL text to insert entity field value with ID ca0c7411-739a-480b-b084-3667c501525d */
INSERT INTO [${flyway:defaultSchema}].[EntityFieldValue]
                                       ([ID], [EntityFieldID], [Sequence], [Value], [Code], [__mj_CreatedAt], [__mj_UpdatedAt])
                                    VALUES
                                       ('ca0c7411-739a-480b-b084-3667c501525d', 'B85717F0-6F36-EF11-86D4-6045BDEE16E6', 3, 'Restore', 'Restore', GETUTCDATE(), GETUTCDATE())


/* Create Entity Relationship: MJ: Record Changes -> MJ: Record Changes (One To Many via RestoredFromID) */
   IF NOT EXISTS (
      SELECT 1 FROM [${flyway:defaultSchema}].[EntityRelationship] WHERE [ID] = '02b3513a-c5d8-46fc-9033-5bafd03052df'
   )
   BEGIN
      INSERT INTO [${flyway:defaultSchema}].[EntityRelationship] ([ID], [EntityID], [RelatedEntityID], [RelatedEntityJoinField], [Type], [BundleInAPI], [DisplayInForm], [Sequence], [__mj_CreatedAt], [__mj_UpdatedAt])
                    VALUES ('02b3513a-c5d8-46fc-9033-5bafd03052df', 'F5238F34-2837-EF11-86D4-6045BDEE16E6', 'F5238F34-2837-EF11-86D4-6045BDEE16E6', 'RestoredFromID', 'One To Many', 1, 1, 2, GETUTCDATE(), GETUTCDATE())
   END;
                    

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

/* SQL text to update entity field related entity name field map for entity field ID F3896B5F-5CAA-4C47-95CA-0C95D67B6C58 */
EXEC [${flyway:defaultSchema}].[spUpdateEntityFieldRelatedEntityNameFieldMap] @EntityFieldID='F3896B5F-5CAA-4C47-95CA-0C95D67B6C58', @RelatedEntityNameFieldMap='RestoredFrom'

/* Root ID Function SQL for MJ: Record Changes.RestoredFromID */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Changes
-- Item: fnRecordChangeRestoredFromID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [RecordChange].[RestoredFromID]
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[fnRecordChangeRestoredFromID_GetRootID]', 'IF') IS NOT NULL
    DROP FUNCTION [${flyway:defaultSchema}].[fnRecordChangeRestoredFromID_GetRootID];
GO

CREATE FUNCTION [${flyway:defaultSchema}].[fnRecordChangeRestoredFromID_GetRootID]
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
            [RestoredFromID],
            [ID] AS [RootParentID],
            0 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[RecordChange]
        WHERE
            [ID] = COALESCE(@ParentID, @RecordID)

        UNION ALL

        SELECT
            c.[ID],
            c.[RestoredFromID],
            c.[ID] AS [RootParentID],
            p.[Depth] + 1 AS [Depth]
        FROM
            [${flyway:defaultSchema}].[RecordChange] c
        INNER JOIN
            CTE_RootParent p ON c.[ID] = p.[RestoredFromID]
        WHERE
            p.[Depth] < 100
    )
    SELECT TOP 1
        [RootParentID] AS RootID
    FROM
        CTE_RootParent
    WHERE
        [RestoredFromID] IS NULL
    ORDER BY
        [RootParentID]
);
GO


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
    MJRecordChange_RestoredFromID.[ChangesDescription] AS [RestoredFrom],
    root_RestoredFromID.RootID AS [RootRestoredFromID]
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
OUTER APPLY
    [${flyway:defaultSchema}].[fnRecordChangeRestoredFromID_GetRootID]([r].[ID], [r].[RestoredFromID]) AS root_RestoredFromID
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordChanges] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

/* Base View Permissions SQL for MJ: Record Changes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Record Changes
-- Item: Permissions for vwRecordChanges
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwRecordChanges] TO [cdp_Developer], [cdp_UI], [cdp_Integration]

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
    @ErrorLog nvarchar(MAX),
    @ReplayRunID uniqueidentifier,
    @IntegrationID uniqueidentifier,
    @Comments nvarchar(MAX),
    @RestoredFromID uniqueidentifier,
    @RestoreReason nvarchar(MAX)
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
                [RestoreReason]
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
                @ErrorLog,
                @ReplayRunID,
                @IntegrationID,
                @Comments,
                @RestoredFromID,
                @RestoreReason
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
                [RestoreReason]
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
                @ErrorLog,
                @ReplayRunID,
                @IntegrationID,
                @Comments,
                @RestoredFromID,
                @RestoreReason
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwRecordChanges] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChange] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spCreate Permissions for MJ: Record Changes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateRecordChange] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



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
    @EntityID uniqueidentifier,
    @RecordID nvarchar(750),
    @UserID uniqueidentifier,
    @Type nvarchar(20),
    @Source nvarchar(20),
    @ChangedAt datetimeoffset,
    @ChangesJSON nvarchar(MAX),
    @ChangesDescription nvarchar(MAX),
    @FullRecordJSON nvarchar(MAX),
    @Status nvarchar(50),
    @ErrorLog nvarchar(MAX),
    @ReplayRunID uniqueidentifier,
    @IntegrationID uniqueidentifier,
    @Comments nvarchar(MAX),
    @RestoredFromID uniqueidentifier,
    @RestoreReason nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[RecordChange]
    SET
        [EntityID] = @EntityID,
        [RecordID] = @RecordID,
        [UserID] = @UserID,
        [Type] = @Type,
        [Source] = @Source,
        [ChangedAt] = @ChangedAt,
        [ChangesJSON] = @ChangesJSON,
        [ChangesDescription] = @ChangesDescription,
        [FullRecordJSON] = @FullRecordJSON,
        [Status] = @Status,
        [ErrorLog] = @ErrorLog,
        [ReplayRunID] = @ReplayRunID,
        [IntegrationID] = @IntegrationID,
        [Comments] = @Comments,
        [RestoredFromID] = @RestoredFromID,
        [RestoreReason] = @RestoreReason
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

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordChange] TO [cdp_Developer]
GO

        

/* spUpdate Permissions for MJ: Record Changes */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateRecordChange] TO [cdp_Developer]



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
    

/* spDelete Permissions for MJ: Record Changes */




/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '3c5f84e1-ec19-4c26-a79e-e08164ee3c6b' OR (EntityID = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RestoredFrom')) BEGIN
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
            '3c5f84e1-ec19-4c26-a79e-e08164ee3c6b',
            'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Record Changes
            100047,
            'RestoredFrom',
            'Restored From',
            NULL,
            'nvarchar',
            -1,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = '9ca6ccb4-4562-4ac1-9de0-6ec951cdac91' OR (EntityID = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RootRestoredFromID')) BEGIN
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
            '9ca6ccb4-4562-4ac1-9de0-6ec951cdac91',
            'F5238F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Record Changes
            100048,
            'RootRestoredFromID',
            'Root Restored From ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            NULL,
            0,
            0,
            1,
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
      END

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = '145917F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET IsNameField = 1
               WHERE ID = 'DD4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateIsNameField = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'BeginsWith'
               WHERE ID = '145917F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'DD4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'B75717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'B85717F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateUserSearchPredicate = 1
            

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET UserSearchPredicateAPI = 'Exact'
               WHERE ID = 'B24D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND AutoUpdateUserSearchPredicate = 1
            

            UPDATE [${flyway:defaultSchema}].[Entity]
            SET AllowUserSearchAPI = 1
            WHERE ID = 'F5238F34-2837-EF11-86D4-6045BDEE16E6'
            AND AutoUpdateAllowUserSearchAPI = 1
         

/* Set categories for 25 fields */

-- UPDATE Entity Field Category Info MJ: Record Changes.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DB4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F14C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F24C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.EntityID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DC4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DD4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.UserID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '0A4317F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.ReplayRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F34C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.IntegrationID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EF4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.Comments 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B64D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.Entity 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Entity Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '145917F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.User 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'EF5717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.ReplayRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DDF2790F-BB2A-4895-9CFB-82D50116830F' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.Integration 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'E7A8FEEC-7840-EF11-86C3-00224821D189' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.Type 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B75717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.Source 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B85717F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.ChangedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'DA4217F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.Status 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B24D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.ErrorLog 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F04C17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.ChangesJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'B34D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.ChangesDescription 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'B44D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.FullRecordJSON 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Full Record JSON',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'B54D17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.RestoredFromID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Lineage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F3896B5F-5CAA-4C47-95CA-0C95D67B6C58' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.RestoreReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Lineage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'F68A6734-5B76-4A35-8652-09E51DBAE5A2' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.RestoredFrom 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Lineage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C5F84E1-EC19-4C26-A79E-E08164EE3C6B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Record Changes.RootRestoredFromID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Audit Lineage',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '9CA6CCB4-4562-4AC1-9DE0-6EC951CDAC91' AND AutoUpdateCategory = 1

/* Update FieldCategoryInfo setting for entity */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Audit Lineage":{"icon":"fa fa-code-branch","description":"Historical versioning and restoration chain information"}}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryInfo'
            

/* Update FieldCategoryIcons setting (legacy) */

               UPDATE [${flyway:defaultSchema}].[EntitySetting]
               SET Value = '{"Audit Lineage":"fa fa-code-branch"}', __mj_UpdatedAt = GETUTCDATE()
               WHERE EntityID = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'FieldCategoryIcons'
            

