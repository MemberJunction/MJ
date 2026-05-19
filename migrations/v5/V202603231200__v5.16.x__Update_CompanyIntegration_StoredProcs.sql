-- Update stored procedures for CompanyIntegration and CompanyIntegrationRun
-- to include new scheduling, locking, and config columns.

------------------------------------------------------------
-- spCreateCompanyIntegrationRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateCompanyIntegrationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegrationRun]
    @ID uniqueidentifier = NULL,
    @CompanyIntegrationID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @TotalRecords int,
    @Comments nvarchar(MAX),
    @Status nvarchar(20) = NULL,
    @ErrorLog nvarchar(MAX),
    @ConfigData nvarchar(MAX),
    @ScheduledJobRunID uniqueidentifier
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
                [ScheduledJobRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyIntegrationID,
                @RunByUserID,
                @StartedAt,
                @EndedAt,
                @TotalRecords,
                @Comments,
                ISNULL(@Status, 'Pending'),
                @ErrorLog,
                @ConfigData,
                @ScheduledJobRunID
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
                [ScheduledJobRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyIntegrationID,
                @RunByUserID,
                @StartedAt,
                @EndedAt,
                @TotalRecords,
                @Comments,
                ISNULL(@Status, 'Pending'),
                @ErrorLog,
                @ConfigData,
                @ScheduledJobRunID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO

------------------------------------------------------------
-- spCreateCompanyIntegration
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateCompanyIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateCompanyIntegration]
    @ID uniqueidentifier = NULL,
    @CompanyID uniqueidentifier,
    @IntegrationID uniqueidentifier,
    @IsActive bit,
    @AccessToken nvarchar(255),
    @RefreshToken nvarchar(255),
    @TokenExpirationDate datetimeoffset,
    @APIKey nvarchar(255),
    @ExternalSystemID nvarchar(100),
    @IsExternalSystemReadOnly bit = NULL,
    @ClientID nvarchar(255),
    @ClientSecret nvarchar(255),
    @CustomAttribute1 nvarchar(255),
    @Name nvarchar(255),
    @SourceTypeID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @CredentialID uniqueidentifier,
    @ScheduleEnabled bit = NULL,
    @ScheduleType nvarchar(20) = NULL,
    @ScheduleIntervalMinutes int,
    @CronExpression nvarchar(200),
    @NextScheduledRunAt datetimeoffset,
    @LastScheduledRunAt datetimeoffset,
    @IsLocked bit = NULL,
    @LockedAt datetimeoffset,
    @LockedByInstance nvarchar(200),
    @LockExpiresAt datetimeoffset,
    @ScheduledJobID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)

    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegration]
            (
                [ID],
                [CompanyID],
                [IntegrationID],
                [IsActive],
                [AccessToken],
                [RefreshToken],
                [TokenExpirationDate],
                [APIKey],
                [ExternalSystemID],
                [IsExternalSystemReadOnly],
                [ClientID],
                [ClientSecret],
                [CustomAttribute1],
                [Name],
                [SourceTypeID],
                [Configuration],
                [CredentialID],
                [ScheduleEnabled],
                [ScheduleType],
                [ScheduleIntervalMinutes],
                [CronExpression],
                [NextScheduledRunAt],
                [LastScheduledRunAt],
                [IsLocked],
                [LockedAt],
                [LockedByInstance],
                [LockExpiresAt],
                [ScheduledJobID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @CompanyID,
                @IntegrationID,
                @IsActive,
                @AccessToken,
                @RefreshToken,
                @TokenExpirationDate,
                @APIKey,
                @ExternalSystemID,
                ISNULL(@IsExternalSystemReadOnly, 0),
                @ClientID,
                @ClientSecret,
                @CustomAttribute1,
                @Name,
                @SourceTypeID,
                @Configuration,
                @CredentialID,
                ISNULL(@ScheduleEnabled, 0),
                ISNULL(@ScheduleType, 'Manual'),
                @ScheduleIntervalMinutes,
                @CronExpression,
                @NextScheduledRunAt,
                @LastScheduledRunAt,
                ISNULL(@IsLocked, 0),
                @LockedAt,
                @LockedByInstance,
                @LockExpiresAt,
                @ScheduledJobID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[CompanyIntegration]
            (
                [CompanyID],
                [IntegrationID],
                [IsActive],
                [AccessToken],
                [RefreshToken],
                [TokenExpirationDate],
                [APIKey],
                [ExternalSystemID],
                [IsExternalSystemReadOnly],
                [ClientID],
                [ClientSecret],
                [CustomAttribute1],
                [Name],
                [SourceTypeID],
                [Configuration],
                [CredentialID],
                [ScheduleEnabled],
                [ScheduleType],
                [ScheduleIntervalMinutes],
                [CronExpression],
                [NextScheduledRunAt],
                [LastScheduledRunAt],
                [IsLocked],
                [LockedAt],
                [LockedByInstance],
                [LockExpiresAt],
                [ScheduledJobID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @CompanyID,
                @IntegrationID,
                @IsActive,
                @AccessToken,
                @RefreshToken,
                @TokenExpirationDate,
                @APIKey,
                @ExternalSystemID,
                ISNULL(@IsExternalSystemReadOnly, 0),
                @ClientID,
                @ClientSecret,
                @CustomAttribute1,
                @Name,
                @SourceTypeID,
                @Configuration,
                @CredentialID,
                ISNULL(@ScheduleEnabled, 0),
                ISNULL(@ScheduleType, 'Manual'),
                @ScheduleIntervalMinutes,
                @CronExpression,
                @NextScheduledRunAt,
                @LastScheduledRunAt,
                ISNULL(@IsLocked, 0),
                @LockedAt,
                @LockedByInstance,
                @LockExpiresAt,
                @ScheduledJobID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrations] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO

------------------------------------------------------------
-- spUpdateCompanyIntegration
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateCompanyIntegration];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegration]
    @ID uniqueidentifier,
    @CompanyID uniqueidentifier,
    @IntegrationID uniqueidentifier,
    @IsActive bit,
    @AccessToken nvarchar(255),
    @RefreshToken nvarchar(255),
    @TokenExpirationDate datetimeoffset,
    @APIKey nvarchar(255),
    @ExternalSystemID nvarchar(100),
    @IsExternalSystemReadOnly bit,
    @ClientID nvarchar(255),
    @ClientSecret nvarchar(255),
    @CustomAttribute1 nvarchar(255),
    @Name nvarchar(255),
    @SourceTypeID uniqueidentifier,
    @Configuration nvarchar(MAX),
    @CredentialID uniqueidentifier,
    @ScheduleEnabled bit,
    @ScheduleType nvarchar(20),
    @ScheduleIntervalMinutes int,
    @CronExpression nvarchar(200),
    @NextScheduledRunAt datetimeoffset,
    @LastScheduledRunAt datetimeoffset,
    @IsLocked bit,
    @LockedAt datetimeoffset,
    @LockedByInstance nvarchar(200),
    @LockExpiresAt datetimeoffset,
    @ScheduledJobID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegration]
    SET
        [CompanyID] = @CompanyID,
        [IntegrationID] = @IntegrationID,
        [IsActive] = @IsActive,
        [AccessToken] = @AccessToken,
        [RefreshToken] = @RefreshToken,
        [TokenExpirationDate] = @TokenExpirationDate,
        [APIKey] = @APIKey,
        [ExternalSystemID] = @ExternalSystemID,
        [IsExternalSystemReadOnly] = @IsExternalSystemReadOnly,
        [ClientID] = @ClientID,
        [ClientSecret] = @ClientSecret,
        [CustomAttribute1] = @CustomAttribute1,
        [Name] = @Name,
        [SourceTypeID] = @SourceTypeID,
        [Configuration] = @Configuration,
        [CredentialID] = @CredentialID,
        [ScheduleEnabled] = @ScheduleEnabled,
        [ScheduleType] = @ScheduleType,
        [ScheduleIntervalMinutes] = @ScheduleIntervalMinutes,
        [CronExpression] = @CronExpression,
        [NextScheduledRunAt] = @NextScheduledRunAt,
        [LastScheduledRunAt] = @LastScheduledRunAt,
        [IsLocked] = @IsLocked,
        [LockedAt] = @LockedAt,
        [LockedByInstance] = @LockedByInstance,
        [LockExpiresAt] = @LockExpiresAt,
        [ScheduledJobID] = @ScheduledJobID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrations] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrations] WHERE [ID] = @ID
END
GO

------------------------------------------------------------
-- spUpdateCompanyIntegrationRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateCompanyIntegrationRun]
    @ID uniqueidentifier,
    @CompanyIntegrationID uniqueidentifier,
    @RunByUserID uniqueidentifier,
    @StartedAt datetimeoffset,
    @EndedAt datetimeoffset,
    @TotalRecords int,
    @Comments nvarchar(MAX),
    @Status nvarchar(20),
    @ErrorLog nvarchar(MAX),
    @ConfigData nvarchar(MAX),
    @ScheduledJobRunID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[CompanyIntegrationRun]
    SET
        [CompanyIntegrationID] = @CompanyIntegrationID,
        [RunByUserID] = @RunByUserID,
        [StartedAt] = @StartedAt,
        [EndedAt] = @EndedAt,
        [TotalRecords] = @TotalRecords,
        [Comments] = @Comments,
        [Status] = @Status,
        [ErrorLog] = @ErrorLog,
        [ConfigData] = @ConfigData,
        [ScheduledJobRunID] = @ScheduledJobRunID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT * FROM [${flyway:defaultSchema}].[vwCompanyIntegrationRuns] WHERE [ID] = @ID
END
GO
