-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Application Setup for Scheduling
-- Item: Create Application, ApplicationEntity, and Dashboard records
--
-- This script creates the Application registry for the Scheduling
-- Management system, links all related entities, and registers
-- the Scheduling Management Dashboard.
-----------------------------------------------------------------

-- UUID Variables (generated via uuidgen)
DECLARE @ApplicationID UNIQUEIDENTIFIER = '09CBDAE2-4F2A-4F01-BA8C-C7EB4AFAC36A';
DECLARE @AppEntity_ScheduledJobs UNIQUEIDENTIFIER = 'AC393C35-A880-4625-9A25-5A53102015D0';
DECLARE @AppEntity_ScheduledJobRuns UNIQUEIDENTIFIER = '7B85BCA9-B5BB-4DC3-861A-3664659FC20E';
DECLARE @AppEntity_ScheduledJobTypes UNIQUEIDENTIFIER = 'C2371DA7-013D-4766-950D-9928553FEB86';
DECLARE @AppEntity_ScheduledActions UNIQUEIDENTIFIER = 'C0C555EE-8609-4549-8FD2-30E26F419C5E';
DECLARE @AppEntity_ScheduledActionParams UNIQUEIDENTIFIER = '7CCD71CE-6E17-4F84-AF69-00782C58CDB4';
DECLARE @DashboardID UNIQUEIDENTIFIER = '2EE84B84-5166-4227-86AD-5CD9927C3428';

-- Constants
DECLARE @SystemUserID UNIQUEIDENTIFIER = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @DefaultEnvironmentID UNIQUEIDENTIFIER = 'F51358F3-9447-4176-B313-BF8025FD8D09';

-- Entity IDs (provided by user)
DECLARE @EntityID_ScheduledJobs UNIQUEIDENTIFIER = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C';
DECLARE @EntityID_ScheduledJobRuns UNIQUEIDENTIFIER = '05853432-5E13-4F2A-8618-77857ADF17FA';
DECLARE @EntityID_ScheduledJobTypes UNIQUEIDENTIFIER = '33E01250-C0FE-4B35-AF8F-A4F444490065';
DECLARE @EntityID_ScheduledActions UNIQUEIDENTIFIER = '12CD5A5D-A83B-EF11-86D4-0022481D1B23';
DECLARE @EntityID_ScheduledActionParams UNIQUEIDENTIFIER = '58E4EE77-0A3C-EF11-86D4-0022481D1B23';

-----------------------------------------------------------------
-- Create Application Record
-----------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Application] WHERE [ID] = @ApplicationID)
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[Application]
    (
        [ID],
        [Name],
        [Description],
        [Icon],
        [DefaultForNewUser]
    )
    VALUES
    (
        @ApplicationID,
        N'Scheduling Management',
        N'Manage and monitor scheduled jobs across the system. Configure job schedules, view execution history, track performance metrics, and manage system health.',
        N'fa-calendar-check',
        0  -- Not default for new users (admin tool)
    );

    PRINT 'Created Application record for Scheduling Management';
END
ELSE
BEGIN
    PRINT 'Application record for Scheduling Management already exists';
END
GO

-----------------------------------------------------------------
-- Create ApplicationEntity Records
-----------------------------------------------------------------

-- Link: MJ: Scheduled Jobs (primary entity)
DECLARE @ApplicationID UNIQUEIDENTIFIER = '09CBDAE2-4F2A-4F01-BA8C-C7EB4AFAC36A';
DECLARE @AppEntity_ScheduledJobs UNIQUEIDENTIFIER = 'AC393C35-A880-4625-9A25-5A53102015D0';
DECLARE @EntityID_ScheduledJobs UNIQUEIDENTIFIER = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C';

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ID] = @AppEntity_ScheduledJobs)
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
    (
        [ID],
        [ApplicationID],
        [EntityID],
        [Sequence],
        [DefaultForNewUser]
    )
    VALUES
    (
        @AppEntity_ScheduledJobs,
        @ApplicationID,
        @EntityID_ScheduledJobs,
        1,  -- Primary entity, first in list
        1   -- Show by default
    );

    PRINT 'Created ApplicationEntity record for MJ: Scheduled Jobs';
END
ELSE
BEGIN
    PRINT 'ApplicationEntity record for MJ: Scheduled Jobs already exists';
END
GO

-- Link: MJ: Scheduled Job Runs
DECLARE @ApplicationID UNIQUEIDENTIFIER = '09CBDAE2-4F2A-4F01-BA8C-C7EB4AFAC36A';
DECLARE @AppEntity_ScheduledJobRuns UNIQUEIDENTIFIER = '7B85BCA9-B5BB-4DC3-861A-3664659FC20E';
DECLARE @EntityID_ScheduledJobRuns UNIQUEIDENTIFIER = '05853432-5E13-4F2A-8618-77857ADF17FA';

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ID] = @AppEntity_ScheduledJobRuns)
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
    (
        [ID],
        [ApplicationID],
        [EntityID],
        [Sequence],
        [DefaultForNewUser]
    )
    VALUES
    (
        @AppEntity_ScheduledJobRuns,
        @ApplicationID,
        @EntityID_ScheduledJobRuns,
        2,  -- Execution history, second in list
        1   -- Show by default
    );

    PRINT 'Created ApplicationEntity record for MJ: Scheduled Job Runs';
END
ELSE
BEGIN
    PRINT 'ApplicationEntity record for MJ: Scheduled Job Runs already exists';
END
GO

-- Link: MJ: Scheduled Job Types
DECLARE @ApplicationID UNIQUEIDENTIFIER = '09CBDAE2-4F2A-4F01-BA8C-C7EB4AFAC36A';
DECLARE @AppEntity_ScheduledJobTypes UNIQUEIDENTIFIER = 'C2371DA7-013D-4766-950D-9928553FEB86';
DECLARE @EntityID_ScheduledJobTypes UNIQUEIDENTIFIER = '33E01250-C0FE-4B35-AF8F-A4F444490065';

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ID] = @AppEntity_ScheduledJobTypes)
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
    (
        [ID],
        [ApplicationID],
        [EntityID],
        [Sequence],
        [DefaultForNewUser]
    )
    VALUES
    (
        @AppEntity_ScheduledJobTypes,
        @ApplicationID,
        @EntityID_ScheduledJobTypes,
        3,  -- Job type registry, third in list
        1   -- Show by default
    );

    PRINT 'Created ApplicationEntity record for MJ: Scheduled Job Types';
END
ELSE
BEGIN
    PRINT 'ApplicationEntity record for MJ: Scheduled Job Types already exists';
END
GO

-- Link: Scheduled Actions
DECLARE @ApplicationID UNIQUEIDENTIFIER = '09CBDAE2-4F2A-4F01-BA8C-C7EB4AFAC36A';
DECLARE @AppEntity_ScheduledActions UNIQUEIDENTIFIER = 'C0C555EE-8609-4549-8FD2-30E26F419C5E';
DECLARE @EntityID_ScheduledActions UNIQUEIDENTIFIER = '12CD5A5D-A83B-EF11-86D4-0022481D1B23';

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ID] = @AppEntity_ScheduledActions)
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
    (
        [ID],
        [ApplicationID],
        [EntityID],
        [Sequence],
        [DefaultForNewUser]
    )
    VALUES
    (
        @AppEntity_ScheduledActions,
        @ApplicationID,
        @EntityID_ScheduledActions,
        4,  -- Legacy scheduled actions, fourth in list
        0   -- Don't show by default (legacy)
    );

    PRINT 'Created ApplicationEntity record for Scheduled Actions';
END
ELSE
BEGIN
    PRINT 'ApplicationEntity record for Scheduled Actions already exists';
END
GO

-- Link: Scheduled Action Params
DECLARE @ApplicationID UNIQUEIDENTIFIER = '09CBDAE2-4F2A-4F01-BA8C-C7EB4AFAC36A';
DECLARE @AppEntity_ScheduledActionParams UNIQUEIDENTIFIER = '7CCD71CE-6E17-4F84-AF69-00782C58CDB4';
DECLARE @EntityID_ScheduledActionParams UNIQUEIDENTIFIER = '58E4EE77-0A3C-EF11-86D4-0022481D1B23';

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[ApplicationEntity] WHERE [ID] = @AppEntity_ScheduledActionParams)
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ApplicationEntity]
    (
        [ID],
        [ApplicationID],
        [EntityID],
        [Sequence],
        [DefaultForNewUser]
    )
    VALUES
    (
        @AppEntity_ScheduledActionParams,
        @ApplicationID,
        @EntityID_ScheduledActionParams,
        5,  -- Legacy scheduled action params, fifth in list
        0   -- Don't show by default (legacy)
    );

    PRINT 'Created ApplicationEntity record for Scheduled Action Params';
END
ELSE
BEGIN
    PRINT 'ApplicationEntity record for Scheduled Action Params already exists';
END
GO

-----------------------------------------------------------------
-- Create Dashboard Record
-----------------------------------------------------------------
DECLARE @ApplicationID UNIQUEIDENTIFIER = '09CBDAE2-4F2A-4F01-BA8C-C7EB4AFAC36A';
DECLARE @DashboardID UNIQUEIDENTIFIER = '2EE84B84-5166-4227-86AD-5CD9927C3428';
DECLARE @SystemUserID UNIQUEIDENTIFIER = 'ECAFCCEC-6A37-EF11-86D4-000D3A4E707E';
DECLARE @DefaultEnvironmentID UNIQUEIDENTIFIER = 'F51358F3-9447-4176-B313-BF8025FD8D09';

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[Dashboard] WHERE [ID] = @DashboardID)
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[Dashboard]
    (
        [ID],
        [Name],
        [Description],
        [UserID],
        [CategoryID],
        [UIConfigDetails],
        [Type],
        [Thumbnail],
        [Scope],
        [ApplicationID],
        [DriverClass],
        [Code],
        [EnvironmentID]
    )
    VALUES
    (
        @DashboardID,
        N'Scheduling Management',
        N'Comprehensive dashboard for managing and monitoring scheduled jobs. Features real-time KPIs, live execution tracking, job management, execution history with trends, job type registry, and system health monitoring with lock management.',
        @SystemUserID,
        NULL,  -- No category (top-level)
        N'',   -- Empty for code-based dashboards
        N'Code',  -- Code-based dashboard
        NULL,  -- No thumbnail
        N'Global',  -- Global scope (not app-specific)
        @ApplicationID,  -- Links to Scheduling Management application
        N'SchedulingDashboard',  -- Class name registered in DashboardsModule
        NULL,  -- No code identifier needed
        @DefaultEnvironmentID  -- Default environment
    );

    PRINT 'Created Dashboard record for Scheduling Management';
END
ELSE
BEGIN
    PRINT 'Dashboard record for Scheduling Management already exists';
END
GO

-----------------------------------------------------------------
-- Create DashboardUserPreference Records
-----------------------------------------------------------------

-- DashboardUserPreference for Scheduling Management Dashboard
DECLARE @ApplicationID UNIQUEIDENTIFIER = '09CBDAE2-4F2A-4F01-BA8C-C7EB4AFAC36A';
DECLARE @DashboardID UNIQUEIDENTIFIER = '2EE84B84-5166-4227-86AD-5CD9927C3428';
DECLARE @DashboardUserPref_Scheduling UNIQUEIDENTIFIER = 'C8039C1B-B777-4657-8D5F-E5C442DF99E6';

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[DashboardUserPreference] WHERE [ID] = @DashboardUserPref_Scheduling)
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[DashboardUserPreference]
    (
        [ID],
        [UserID],
        [DashboardID],
        [Scope],
        [ApplicationID],
        [DisplayOrder]
    )
    VALUES
    (
        @DashboardUserPref_Scheduling,
        NULL,  -- NULL for global/default preference
        @DashboardID,
        N'App',  -- App scope
        @ApplicationID,
        0  -- First dashboard in the app
    );

    PRINT 'Created DashboardUserPreference record for Scheduling Management Dashboard';
END
ELSE
BEGIN
    PRINT 'DashboardUserPreference record for Scheduling Management Dashboard already exists';
END
GO

-- DashboardUserPreference for Component Studio Dashboard (previously missing)
DECLARE @ComponentStudio_ApplicationID UNIQUEIDENTIFIER = 'ADDAD2F1-BA9A-442C-A08A-6E461F60985B';
DECLARE @ComponentStudio_DashboardID UNIQUEIDENTIFIER = 'C479F2E9-774B-4432-9513-5BE640B7F0AF';
DECLARE @DashboardUserPref_ComponentStudio UNIQUEIDENTIFIER = '7B32323D-1D2B-4AC3-848F-56D63762F531';

IF NOT EXISTS (SELECT 1 FROM [${flyway:defaultSchema}].[DashboardUserPreference] WHERE [ID] = @DashboardUserPref_ComponentStudio)
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[DashboardUserPreference]
    (
        [ID],
        [UserID],
        [DashboardID],
        [Scope],
        [ApplicationID],
        [DisplayOrder]
    )
    VALUES
    (
        @DashboardUserPref_ComponentStudio,
        NULL,  -- NULL for global/default preference
        @ComponentStudio_DashboardID,
        N'App',  -- App scope
        @ComponentStudio_ApplicationID,
        0  -- First dashboard in the app
    );

    PRINT 'Created DashboardUserPreference record for Component Studio Dashboard';
END
ELSE
BEGIN
    PRINT 'DashboardUserPreference record for Component Studio Dashboard already exists';
END
GO

PRINT 'Scheduling Management Application and Dashboard setup complete';
GO
