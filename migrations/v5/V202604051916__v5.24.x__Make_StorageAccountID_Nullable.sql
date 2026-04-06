-- Migration: Make ArchiveConfiguration.StorageAccountID nullable
-- Description: Default archive configurations ship without a storage account assigned.
--              Users configure storage later when activating a configuration.
--              StorageAccountID must be nullable to support this workflow.
--              Includes regenerated view (LEFT OUTER JOIN) and stored procedures.

ALTER TABLE ${flyway:defaultSchema}.ArchiveConfiguration
    ALTER COLUMN StorageAccountID UNIQUEIDENTIFIER NULL;
GO






-----------------------------------------------------------------
-- Regenerated View: vwArchiveConfigurations
-- Changed INNER JOIN to LEFT OUTER JOIN on FileStorageAccount
-- to allow rows with NULL StorageAccountID to be returned.
-----------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[vwArchiveConfigurations]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwArchiveConfigurations];
GO

CREATE VIEW [${flyway:defaultSchema}].[vwArchiveConfigurations]
AS
SELECT
    a.*,
    MJFileStorageAccount_StorageAccountID.[Name] AS [StorageAccount],
    MJUser_CreatedByUserID.[Name] AS [CreatedByUser]
FROM
    [${flyway:defaultSchema}].[ArchiveConfiguration] AS a
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[FileStorageAccount] AS MJFileStorageAccount_StorageAccountID
  ON
    [a].[StorageAccountID] = MJFileStorageAccount_StorageAccountID.[ID]
INNER JOIN
    [${flyway:defaultSchema}].[User] AS MJUser_CreatedByUserID
  ON
    [a].[CreatedByUserID] = MJUser_CreatedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwArchiveConfigurations] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
GO

-----------------------------------------------------------------
-- Regenerated SP: spCreateArchiveConfiguration
-- StorageAccountID parameter now defaults to NULL.
-----------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateArchiveConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateArchiveConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateArchiveConfiguration]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @StorageAccountID uniqueidentifier = NULL,
    @RootPath nvarchar(500),
    @ArchiveFormat nvarchar(20) = NULL,
    @IsActive bit = NULL,
    @DefaultRetentionDays int = NULL,
    @DefaultMode nvarchar(20) = NULL,
    @DefaultBatchSize int = NULL,
    @ArchiveRelatedRecordChanges bit = NULL,
    @Status nvarchar(20) = NULL,
    @CreatedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
            (
                [ID],
                [Name],
                [Description],
                [StorageAccountID],
                [RootPath],
                [ArchiveFormat],
                [IsActive],
                [DefaultRetentionDays],
                [DefaultMode],
                [DefaultBatchSize],
                [ArchiveRelatedRecordChanges],
                [Status],
                [CreatedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @StorageAccountID,
                @RootPath,
                ISNULL(@ArchiveFormat, 'JSON'),
                ISNULL(@IsActive, 0),
                ISNULL(@DefaultRetentionDays, 365),
                ISNULL(@DefaultMode, 'StripFields'),
                ISNULL(@DefaultBatchSize, 100),
                ISNULL(@ArchiveRelatedRecordChanges, 1),
                ISNULL(@Status, 'Idle'),
                @CreatedByUserID
            )
    END
    ELSE
    BEGIN
        INSERT INTO [${flyway:defaultSchema}].[ArchiveConfiguration]
            (
                [Name],
                [Description],
                [StorageAccountID],
                [RootPath],
                [ArchiveFormat],
                [IsActive],
                [DefaultRetentionDays],
                [DefaultMode],
                [DefaultBatchSize],
                [ArchiveRelatedRecordChanges],
                [Status],
                [CreatedByUserID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @StorageAccountID,
                @RootPath,
                ISNULL(@ArchiveFormat, 'JSON'),
                ISNULL(@IsActive, 0),
                ISNULL(@DefaultRetentionDays, 365),
                ISNULL(@DefaultMode, 'StripFields'),
                ISNULL(@DefaultBatchSize, 100),
                ISNULL(@ArchiveRelatedRecordChanges, 1),
                ISNULL(@Status, 'Idle'),
                @CreatedByUserID
            )
    END
    SELECT * FROM [${flyway:defaultSchema}].[vwArchiveConfigurations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateArchiveConfiguration] TO [cdp_Developer], [cdp_Integration]
GO

-----------------------------------------------------------------
-- Regenerated SP: spUpdateArchiveConfiguration
-- StorageAccountID parameter accepts NULL.
-----------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateArchiveConfiguration]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateArchiveConfiguration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateArchiveConfiguration]
    @ID uniqueidentifier,
    @Name nvarchar(255),
    @Description nvarchar(MAX),
    @StorageAccountID uniqueidentifier,
    @RootPath nvarchar(500),
    @ArchiveFormat nvarchar(20),
    @IsActive bit,
    @DefaultRetentionDays int,
    @DefaultMode nvarchar(20),
    @DefaultBatchSize int,
    @ArchiveRelatedRecordChanges bit,
    @Status nvarchar(20),
    @CreatedByUserID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ArchiveConfiguration]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [StorageAccountID] = @StorageAccountID,
        [RootPath] = @RootPath,
        [ArchiveFormat] = @ArchiveFormat,
        [IsActive] = @IsActive,
        [DefaultRetentionDays] = @DefaultRetentionDays,
        [DefaultMode] = @DefaultMode,
        [DefaultBatchSize] = @DefaultBatchSize,
        [ArchiveRelatedRecordChanges] = @ArchiveRelatedRecordChanges,
        [Status] = @Status,
        [CreatedByUserID] = @CreatedByUserID
    WHERE
        [ID] = @ID

    IF @@ROWCOUNT = 0
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwArchiveConfigurations] WHERE 1=0
    ELSE
        SELECT * FROM [${flyway:defaultSchema}].[vwArchiveConfigurations] WHERE [ID] = @ID
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateArchiveConfiguration] TO [cdp_Developer], [cdp_Integration]
GO
