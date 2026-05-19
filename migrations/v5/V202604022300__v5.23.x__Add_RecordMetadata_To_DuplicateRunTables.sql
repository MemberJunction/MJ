-- Add RecordMetadata columns to Duplicate Run Detail and Match tables.
-- Stores vector DB metadata (Name, Description, EntityIcon, etc.) captured at detection time
-- so the UI can display rich record info without additional lookups.

ALTER TABLE ${flyway:defaultSchema}.DuplicateRunDetail
    ADD RecordMetadata NVARCHAR(MAX) NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.DuplicateRunDetailMatch
    ADD RecordMetadata NVARCHAR(MAX) NULL;
GO

-- Extended properties for documentation
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON metadata snapshot of the source record from the vector database at detection time. Contains display fields (Name, Description, EntityIcon, etc.) for rich UI rendering without additional lookups.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'DuplicateRunDetail',
    @level2type = N'COLUMN', @level2name = 'RecordMetadata';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'JSON metadata snapshot of the matched record from the vector database at detection time. Contains display fields (Name, Description, EntityIcon, etc.) for rich UI rendering without additional lookups.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = 'DuplicateRunDetailMatch',
    @level2type = N'COLUMN', @level2name = 'RecordMetadata';












































-- CODE GEN RUN
/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'ae512782-4687-4d46-a9a5-f64e1e385504' OR (EntityID = '2D248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RecordMetadata')) BEGIN
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
            'ae512782-4687-4d46-a9a5-f64e1e385504',
            '2D248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Run Detail Matches
            100029,
            'RecordMetadata',
            'Record Metadata',
            'JSON metadata snapshot of the matched record from the vector database at detection time. Contains display fields (Name, Description, EntityIcon, etc.) for rich UI rendering without additional lookups.',
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

/* SQL text to insert new entity field */

      IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[EntityField] WHERE ID = 'd0181d15-798a-4aa1-82f5-d880adaffac4' OR (EntityID = '31248F34-2837-EF11-86D4-6045BDEE16E6' AND Name = 'RecordMetadata')) BEGIN
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
            'd0181d15-798a-4aa1-82f5-d880adaffac4',
            '31248F34-2837-EF11-86D4-6045BDEE16E6', -- Entity: MJ: Duplicate Run Details
            100022,
            'RecordMetadata',
            'Record Metadata',
            'JSON metadata snapshot of the source record from the vector database at detection time. Contains display fields (Name, Description, EntityIcon, etc.) for rich UI rendering without additional lookups.',
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

/* Index for Foreign Keys for DuplicateRunDetailMatch */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Detail Matches
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DuplicateRunDetailID in table DuplicateRunDetailMatch
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRunDetailMatch_DuplicateRunDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRunDetailMatch]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRunDetailMatch_DuplicateRunDetailID ON [${flyway:defaultSchema}].[DuplicateRunDetailMatch] ([DuplicateRunDetailID]);

-- Index for foreign key RecordMergeLogID in table DuplicateRunDetailMatch
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRunDetailMatch_RecordMergeLogID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRunDetailMatch]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRunDetailMatch_RecordMergeLogID ON [${flyway:defaultSchema}].[DuplicateRunDetailMatch] ([RecordMergeLogID]);

/* Index for Foreign Keys for DuplicateRunDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DuplicateRunID in table DuplicateRunDetail
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_DuplicateRunDetail_DuplicateRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[DuplicateRunDetail]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_DuplicateRunDetail_DuplicateRunID ON [${flyway:defaultSchema}].[DuplicateRunDetail] ([DuplicateRunID]);

/* Base View SQL for MJ: Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Detail Matches
-- Item: vwDuplicateRunDetailMatches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Duplicate Run Detail Matches
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DuplicateRunDetailMatch
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDuplicateRunDetailMatches]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches]
AS
SELECT
    d.*,
    MJDuplicateRunDetail_DuplicateRunDetailID.[RecordID] AS [DuplicateRunDetail],
    MJRecordMergeLog_RecordMergeLogID.[SurvivingRecordID] AS [RecordMergeLog]
FROM
    [${flyway:defaultSchema}].[DuplicateRunDetailMatch] AS d
INNER JOIN
    [${flyway:defaultSchema}].[DuplicateRunDetail] AS MJDuplicateRunDetail_DuplicateRunDetailID
  ON
    [d].[DuplicateRunDetailID] = MJDuplicateRunDetail_DuplicateRunDetailID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[RecordMergeLog] AS MJRecordMergeLog_RecordMergeLogID
  ON
    [d].[RecordMergeLogID] = MJRecordMergeLog_RecordMergeLogID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* Base View Permissions SQL for MJ: Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Detail Matches
-- Item: Permissions for vwDuplicateRunDetailMatches
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches] TO [cdp_UI], [cdp_Integration], [cdp_Developer]

/* spCreate SQL for MJ: Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Detail Matches
-- Item: spCreateDuplicateRunDetailMatch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DuplicateRunDetailMatch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDuplicateRunDetailMatch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRunDetailMatch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRunDetailMatch]
    @ID uniqueidentifier = NULL,
    @DuplicateRunDetailID uniqueidentifier,
    @MatchSource nvarchar(20) = NULL,
    @MatchRecordID nvarchar(500),
    @MatchProbability numeric(12, 11) = NULL,
    @MatchedAt datetimeoffset = NULL,
    @Action nvarchar(20) = NULL,
    @ApprovalStatus nvarchar(20) = NULL,
    @RecordMergeLogID uniqueidentifier,
    @MergeStatus nvarchar(20) = NULL,
    @MergedAt datetimeoffset = NULL,
    @RecordMetadata nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
            (
                [ID],
                [DuplicateRunDetailID],
                [MatchSource],
                [MatchRecordID],
                [MatchProbability],
                [MatchedAt],
                [Action],
                [ApprovalStatus],
                [RecordMergeLogID],
                [MergeStatus],
                [MergedAt],
                [RecordMetadata]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DuplicateRunDetailID,
                ISNULL(@MatchSource, 'Vector'),
                @MatchRecordID,
                ISNULL(@MatchProbability, 0),
                ISNULL(@MatchedAt, sysdatetimeoffset()),
                ISNULL(@Action, 'Ignore'),
                ISNULL(@ApprovalStatus, 'Pending'),
                @RecordMergeLogID,
                ISNULL(@MergeStatus, 'Pending'),
                ISNULL(@MergedAt, sysdatetimeoffset()),
                @RecordMetadata
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
            (
                [DuplicateRunDetailID],
                [MatchSource],
                [MatchRecordID],
                [MatchProbability],
                [MatchedAt],
                [Action],
                [ApprovalStatus],
                [RecordMergeLogID],
                [MergeStatus],
                [MergedAt],
                [RecordMetadata]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DuplicateRunDetailID,
                ISNULL(@MatchSource, 'Vector'),
                @MatchRecordID,
                ISNULL(@MatchProbability, 0),
                ISNULL(@MatchedAt, sysdatetimeoffset()),
                ISNULL(@Action, 'Ignore'),
                ISNULL(@ApprovalStatus, 'Pending'),
                @RecordMergeLogID,
                ISNULL(@MergeStatus, 'Pending'),
                ISNULL(@MergedAt, sysdatetimeoffset()),
                @RecordMetadata
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRunDetailMatch] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for MJ: Duplicate Run Detail Matches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRunDetailMatch] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for MJ: Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Detail Matches
-- Item: spUpdateDuplicateRunDetailMatch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DuplicateRunDetailMatch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch]
    @ID uniqueidentifier,
    @DuplicateRunDetailID uniqueidentifier,
    @MatchSource nvarchar(20),
    @MatchRecordID nvarchar(500),
    @MatchProbability numeric(12, 11),
    @MatchedAt datetimeoffset,
    @Action nvarchar(20),
    @ApprovalStatus nvarchar(20),
    @RecordMergeLogID uniqueidentifier,
    @MergeStatus nvarchar(20),
    @MergedAt datetimeoffset,
    @RecordMetadata nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
    SET
        [DuplicateRunDetailID] = @DuplicateRunDetailID,
        [MatchSource] = @MatchSource,
        [MatchRecordID] = @MatchRecordID,
        [MatchProbability] = @MatchProbability,
        [MatchedAt] = @MatchedAt,
        [Action] = @Action,
        [ApprovalStatus] = @ApprovalStatus,
        [RecordMergeLogID] = @RecordMergeLogID,
        [MergeStatus] = @MergeStatus,
        [MergedAt] = @MergedAt,
        [RecordMetadata] = @RecordMetadata
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDuplicateRunDetailMatches]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DuplicateRunDetailMatch table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDuplicateRunDetailMatch]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDuplicateRunDetailMatch];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDuplicateRunDetailMatch
ON [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DuplicateRunDetailMatch] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Duplicate Run Detail Matches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRunDetailMatch] TO [cdp_Integration], [cdp_Developer]



/* Base View SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: vwDuplicateRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Duplicate Run Details
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  DuplicateRunDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwDuplicateRunDetails]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwDuplicateRunDetails];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwDuplicateRunDetails]
AS
SELECT
    d.*,
    MJDuplicateRun_DuplicateRunID.[Entity] AS [DuplicateRun]
FROM
    [${flyway:defaultSchema}].[DuplicateRunDetail] AS d
INNER JOIN
    [${flyway:defaultSchema}].[vwDuplicateRuns] AS MJDuplicateRun_DuplicateRunID
  ON
    [d].[DuplicateRunID] = MJDuplicateRun_DuplicateRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* Base View Permissions SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: Permissions for vwDuplicateRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwDuplicateRunDetails] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: spCreateDuplicateRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR DuplicateRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateDuplicateRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateDuplicateRunDetail]
    @ID uniqueidentifier = NULL,
    @DuplicateRunID uniqueidentifier,
    @RecordID nvarchar(500),
    @MatchStatus nvarchar(20) = NULL,
    @SkippedReason nvarchar(MAX),
    @MatchErrorMessage nvarchar(MAX),
    @MergeStatus nvarchar(20) = NULL,
    @MergeErrorMessage nvarchar(MAX),
    @RecordMetadata nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRunDetail]
            (
                [ID],
                [DuplicateRunID],
                [RecordID],
                [MatchStatus],
                [SkippedReason],
                [MatchErrorMessage],
                [MergeStatus],
                [MergeErrorMessage],
                [RecordMetadata]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @DuplicateRunID,
                @RecordID,
                ISNULL(@MatchStatus, 'Pending'),
                @SkippedReason,
                @MatchErrorMessage,
                ISNULL(@MergeStatus, 'Not Applicable'),
                @MergeErrorMessage,
                @RecordMetadata
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[DuplicateRunDetail]
            (
                [DuplicateRunID],
                [RecordID],
                [MatchStatus],
                [SkippedReason],
                [MatchErrorMessage],
                [MergeStatus],
                [MergeErrorMessage],
                [RecordMetadata]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @DuplicateRunID,
                @RecordID,
                ISNULL(@MatchStatus, 'Pending'),
                @SkippedReason,
                @MatchErrorMessage,
                ISNULL(@MergeStatus, 'Not Applicable'),
                @MergeErrorMessage,
                @RecordMetadata
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwDuplicateRunDetails] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRunDetail] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Duplicate Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateDuplicateRunDetail] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: spUpdateDuplicateRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR DuplicateRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateDuplicateRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateDuplicateRunDetail]
    @ID uniqueidentifier,
    @DuplicateRunID uniqueidentifier,
    @RecordID nvarchar(500),
    @MatchStatus nvarchar(20),
    @SkippedReason nvarchar(MAX),
    @MatchErrorMessage nvarchar(MAX),
    @MergeStatus nvarchar(20),
    @MergeErrorMessage nvarchar(MAX),
    @RecordMetadata nvarchar(MAX)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRunDetail]
    SET
        [DuplicateRunID] = @DuplicateRunID,
        [RecordID] = @RecordID,
        [MatchStatus] = @MatchStatus,
        [SkippedReason] = @SkippedReason,
        [MatchErrorMessage] = @MatchErrorMessage,
        [MergeStatus] = @MergeStatus,
        [MergeErrorMessage] = @MergeErrorMessage,
        [RecordMetadata] = @RecordMetadata
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwDuplicateRunDetails] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwDuplicateRunDetails]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRunDetail] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the DuplicateRunDetail table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateDuplicateRunDetail]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateDuplicateRunDetail];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateDuplicateRunDetail
ON [${flyway:defaultSchema}].[DuplicateRunDetail]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[DuplicateRunDetail]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[DuplicateRunDetail] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Duplicate Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateDuplicateRunDetail] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Duplicate Run Detail Matches */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Detail Matches
-- Item: spDeleteDuplicateRunDetailMatch
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuplicateRunDetailMatch
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDuplicateRunDetailMatch]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRunDetailMatch];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRunDetailMatch]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DuplicateRunDetailMatch]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRunDetailMatch] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Duplicate Run Detail Matches */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRunDetailMatch] TO [cdp_Integration]



/* spDelete SQL for MJ: Duplicate Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Duplicate Run Details
-- Item: spDeleteDuplicateRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR DuplicateRunDetail
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteDuplicateRunDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRunDetail];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteDuplicateRunDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[DuplicateRunDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRunDetail] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Duplicate Run Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteDuplicateRunDetail] TO [cdp_Integration]



/* Set field properties for entity */

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '3A4417F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

                  UPDATE [${flyway:defaultSchema}].[EntityField]
                  SET IncludeInUserSearchAPI = 1
                  WHERE ID = '3C4417F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND AutoUpdateIncludeInUserSearchAPI = 1
               

/* Set field properties for entity */

               UPDATE [${flyway:defaultSchema}].[EntityField]
               SET DefaultInView = 1
               WHERE ID = 'C0659D37-75B1-4FB4-8CE4-C7EA3A243A1D'
               AND AutoUpdateDefaultInView = 1
            

/* Set categories for 16 fields */

-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '284417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.DuplicateRunDetailID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Duplicate Run Detail ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '294417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.MatchSource 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3F4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.MatchRecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Match Record ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2A4417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.MatchProbability 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2B4417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.MatchedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2C4417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.RecordMetadata 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Match Results',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'AE512782-4687-4D46-A9A5-F64E1E385504' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.DuplicateRunDetail 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Match Results',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = 'C0659D37-75B1-4FB4-8CE4-C7EA3A243A1D' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.Action 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2D4417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.ApprovalStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2E4417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.RecordMergeLogID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Record Merge Log ID',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '314417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.MergeStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '2F4417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.MergedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '304417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.RecordMergeLog 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Resolution Management',
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '064EF859-8C2F-464E-8DF0-822E69644E1B' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '7F5817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Detail Matches.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '805817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.ID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '354417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.DuplicateRunID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Duplicate Run',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '364417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.RecordID 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Source Record',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '374417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.DuplicateRun 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   DisplayName = 'Run Name',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '87C64C19-39F4-46BC-B95C-265113B019DE' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.RecordMetadata 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   Category = 'Run Identification',
   GeneratedFormSection = 'Category',
   ExtendedType = 'Code',
   CodeType = 'Other'
WHERE 
   ID = 'D0181D15-798A-4AA1-82F5-D880ADAFFAC4' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.MatchStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '384417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.SkippedReason 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '394417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.MatchErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3A4417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.MergeStatus 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3B4417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.MergeErrorMessage 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '3C4417F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.__mj_CreatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '835817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

-- UPDATE Entity Field Category Info MJ: Duplicate Run Details.__mj_UpdatedAt 
UPDATE [${flyway:defaultSchema}].[EntityField]
SET 
   GeneratedFormSection = 'Category',
   ExtendedType = NULL,
   CodeType = NULL
WHERE 
   ID = '845817F0-6F36-EF11-86D4-6045BDEE16E6' AND AutoUpdateCategory = 1

