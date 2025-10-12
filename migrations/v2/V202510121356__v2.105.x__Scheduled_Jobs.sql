/******************************************************************************************
* MemberJunction Migration - Scheduled Jobs System
*
* Description: Creates a generic scheduling infrastructure that supports multiple job types
*              through a plugin architecture. Includes ScheduledJobType registry,
*              ScheduledJob configuration, and ScheduledJobRun execution history.
*
* Version: 2.105.x
* Date: 2025-10-12
******************************************************************************************/

/******************************************************************************************
* TABLE: ScheduledJobType
* Description: Plugin registry for different types of schedulable jobs
******************************************************************************************/
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[__mj].[ScheduledJobType]') AND type in (N'U'))
BEGIN
    CREATE TABLE [__mj].[ScheduledJobType] (
        [ID]                        UNIQUEIDENTIFIER NOT NULL
                                    CONSTRAINT [DF_ScheduledJobType_ID] DEFAULT (NEWSEQUENTIALID())
                                    CONSTRAINT [PK_ScheduledJobType] PRIMARY KEY,

        [Name]                      NVARCHAR(100) NOT NULL,
        [Description]               NVARCHAR(MAX) NULL,

        -- Plugin Configuration
        [DriverClass]               NVARCHAR(255) NOT NULL,

        -- Domain Run Linking (for generic querying/UI linking)
        [DomainRunEntity]           NVARCHAR(255) NULL,
        [DomainRunEntityFKey]       NVARCHAR(100) NULL,

        -- Notification Support
        [NotificationsAvailable]    BIT NOT NULL
                                    CONSTRAINT [DF_ScheduledJobType_NotificationsAvailable] DEFAULT(1),

        CONSTRAINT [UQ_ScheduledJobType_Name] UNIQUE ([Name]),
        CONSTRAINT [UQ_ScheduledJobType_DriverClass] UNIQUE ([DriverClass])
    );
END
GO

-- Extended Properties for ScheduledJobType table
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines types of schedulable jobs and their plugin implementations. Each job type represents a different kind of work that can be scheduled (e.g., Agents, Actions, Reports).',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJobType';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique name identifying this job type (e.g., Agent, Action, Report).',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJobType',
    @level2type = N'COLUMN', @level2name = N'Name';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable description of what this job type does and when it should be used.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJobType',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'TypeScript class name that implements BaseScheduledJob for this job type. Used by ClassFactory to instantiate the correct plugin at runtime.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJobType',
    @level2type = N'COLUMN', @level2name = N'DriverClass';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the entity that stores execution records for this job type (e.g., "MJ: AI Agent Runs", "Action Execution Logs"). Used for generic UI linking to domain-specific run records. NULL if job type uses ScheduledJobRun as its only execution record.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJobType',
    @level2type = N'COLUMN', @level2name = N'DomainRunEntity';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the foreign key field in the DomainRunEntity that links back to ScheduledJobRun (e.g., "ScheduleID"). Used for querying related domain runs. NULL if DomainRunEntity is NULL.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJobType',
    @level2type = N'COLUMN', @level2name = N'DomainRunEntityFKey';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether this job type supports sending notifications on completion or failure.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJobType',
    @level2type = N'COLUMN', @level2name = N'NotificationsAvailable';
GO

/******************************************************************************************
* TABLE: ScheduledJob
* Description: Generic schedule configuration for any type of schedulable job
******************************************************************************************/
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[__mj].[ScheduledJob]') AND type in (N'U'))
BEGIN
    CREATE TABLE [__mj].[ScheduledJob] (
        [ID]                        UNIQUEIDENTIFIER NOT NULL
                                    CONSTRAINT [DF_ScheduledJob_ID] DEFAULT (NEWSEQUENTIALID())
                                    CONSTRAINT [PK_ScheduledJob] PRIMARY KEY,

        -- Type and Identification
        [JobTypeID]                 UNIQUEIDENTIFIER NOT NULL
                                    CONSTRAINT [FK_ScheduledJob_JobType]
                                    FOREIGN KEY REFERENCES [__mj].[ScheduledJobType]([ID]),

        [Name]                      NVARCHAR(200) NOT NULL,
        [Description]               NVARCHAR(MAX) NULL,

        -- Schedule Configuration
        [CronExpression]            NVARCHAR(120) NOT NULL,
        [Timezone]                  NVARCHAR(64) NOT NULL
                                    CONSTRAINT [DF_ScheduledJob_Timezone] DEFAULT ('UTC'),

        [StartAt]                   DATETIMEOFFSET(7) NULL,
        [EndAt]                     DATETIMEOFFSET(7) NULL,

        [Status]                    NVARCHAR(20) NOT NULL
                                    CONSTRAINT [DF_ScheduledJob_Status] DEFAULT ('Pending')
                                    CONSTRAINT [CK_ScheduledJob_Status]
                                    CHECK ([Status] IN ('Pending', 'Active', 'Paused', 'Disabled', 'Expired')),

        -- Job-Specific Configuration (JSON)
        [Configuration]             NVARCHAR(MAX) NULL
                                    CONSTRAINT [CK_ScheduledJob_Configuration_IsJson]
                                    CHECK ([Configuration] IS NULL OR ISJSON([Configuration]) = 1),

        -- Ownership
        [OwnerUserID]               UNIQUEIDENTIFIER NULL
                                    CONSTRAINT [FK_ScheduledJob_OwnerUser]
                                    FOREIGN KEY REFERENCES [__mj].[User]([ID]),

        -- Execution Tracking
        [LastRunID]                 UNIQUEIDENTIFIER NULL,  -- FK added after ScheduledJobRun table exists

        [LastRunAt]                 DATETIMEOFFSET(7) NULL,
        [NextRunAt]                 DATETIMEOFFSET(7) NULL,

        [RunCount]                  INT NOT NULL
                                    CONSTRAINT [DF_ScheduledJob_RunCount] DEFAULT(0),

        [SuccessCount]              INT NOT NULL
                                    CONSTRAINT [DF_ScheduledJob_SuccessCount] DEFAULT(0),

        [FailureCount]              INT NOT NULL
                                    CONSTRAINT [DF_ScheduledJob_FailureCount] DEFAULT(0),

        -- Notification Settings
        [NotifyOnSuccess]           BIT NOT NULL
                                    CONSTRAINT [DF_ScheduledJob_NotifyOnSuccess] DEFAULT(0),

        [NotifyOnFailure]           BIT NOT NULL
                                    CONSTRAINT [DF_ScheduledJob_NotifyOnFailure] DEFAULT(1),

        [NotifyUserID]              UNIQUEIDENTIFIER NULL
                                    CONSTRAINT [FK_ScheduledJob_NotifyUser]
                                    FOREIGN KEY REFERENCES [__mj].[User]([ID]),

        [NotifyViaEmail]            BIT NOT NULL
                                    CONSTRAINT [DF_ScheduledJob_NotifyViaEmail] DEFAULT(0),

        [NotifyViaInApp]            BIT NOT NULL
                                    CONSTRAINT [DF_ScheduledJob_NotifyViaInApp] DEFAULT(1)
    );
END
GO

-- Extended Properties for ScheduledJob table
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines schedules for automated job execution across all schedulable types. Each record represents a scheduled job with its cron expression, configuration, and execution tracking.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable name for this scheduled job. Should clearly identify what the job does.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'Name';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed description of the job''s purpose, what it does, and any important notes about its execution.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cron expression defining when the job should execute (e.g., "0 30 9 * * MON-FRI" for weekdays at 9:30 AM). Uses standard cron syntax with seconds precision.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'CronExpression';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'IANA timezone identifier for interpreting the cron expression (e.g., "America/Chicago", "UTC"). Ensures consistent scheduling across different server locations.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'Timezone';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional start date/time for when this schedule becomes active. Job will not execute before this time. NULL means active immediately upon creation.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'StartAt';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional end date/time for when this schedule expires. Job will not execute after this time. NULL means no expiration.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'EndAt';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the schedule. Pending=created but not yet active, Active=currently running on schedule, Paused=temporarily stopped, Disabled=manually disabled, Expired=past EndAt date.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Job-type specific configuration stored as JSON. Schema is defined by the ScheduledJobType plugin. For Agents: includes AgentID, StartingPayload, InitialMessage, etc. For Actions: includes ActionID and parameter mappings.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'Configuration';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User who owns this schedule. Used as the execution context if no specific user is configured in the job-specific configuration.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'OwnerUserID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the most recent execution of this schedule. Provides quick access to last run status and details.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'LastRunID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the most recent execution. Updated after each run. Used for monitoring and dashboard displays.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'LastRunAt';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Calculated timestamp of when this job should next execute based on the cron expression. Updated after each run. Used by scheduler to determine which jobs are due.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'NextRunAt';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total number of times this schedule has been executed, including both successful and failed runs.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'RunCount';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of times this schedule has executed successfully (Success = true in ScheduledJobRun).',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'SuccessCount';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of times this schedule has executed but failed (Success = false in ScheduledJobRun).',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'FailureCount';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether to send notifications when the job completes successfully.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'NotifyOnSuccess';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether to send notifications when the job fails. Defaults to true for alerting on failures.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'NotifyOnFailure';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User to notify about job execution results. If NULL and notifications are enabled, falls back to OwnerUserID.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'NotifyUserID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether to send email notifications. Requires NotifyOnSuccess or NotifyOnFailure to also be enabled.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'NotifyViaEmail';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether to send in-app notifications. Requires NotifyOnSuccess or NotifyOnFailure to also be enabled. Defaults to true.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'NotifyViaInApp';
GO

/******************************************************************************************
* TABLE: ScheduledJobRun
* Description: Tracks execution history for all scheduled jobs
******************************************************************************************/
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[__mj].[ScheduledJobRun]') AND type in (N'U'))
BEGIN
    CREATE TABLE [__mj].[ScheduledJobRun] (
        [ID]                        UNIQUEIDENTIFIER NOT NULL
                                    CONSTRAINT [DF_ScheduledJobRun_ID] DEFAULT (NEWSEQUENTIALID())
                                    CONSTRAINT [PK_ScheduledJobRun] PRIMARY KEY,

        [ScheduledJobID]            UNIQUEIDENTIFIER NOT NULL
                                    CONSTRAINT [FK_ScheduledJobRun_ScheduledJob]
                                    FOREIGN KEY REFERENCES [__mj].[ScheduledJob]([ID]),

        -- Timing
        [StartedAt]                 DATETIMEOFFSET(7) NOT NULL
                                    CONSTRAINT [DF_ScheduledJobRun_StartedAt] DEFAULT (SYSDATETIMEOFFSET()),

        [CompletedAt]               DATETIMEOFFSET(7) NULL,

        -- Status
        [Status]                    NVARCHAR(20) NOT NULL
                                    CONSTRAINT [DF_ScheduledJobRun_Status] DEFAULT ('Running')
                                    CONSTRAINT [CK_ScheduledJobRun_Status]
                                    CHECK ([Status] IN ('Running', 'Completed', 'Failed', 'Cancelled', 'Timeout')),

        [Success]                   BIT NULL,
        [ErrorMessage]              NVARCHAR(MAX) NULL,

        -- Job-Specific Details (JSON)
        [Details]                   NVARCHAR(MAX) NULL
                                    CONSTRAINT [CK_ScheduledJobRun_Details_IsJson]
                                    CHECK ([Details] IS NULL OR ISJSON([Details]) = 1),

        -- Execution Context
        [ExecutedByUserID]          UNIQUEIDENTIFIER NULL
                                    CONSTRAINT [FK_ScheduledJobRun_ExecutedByUser]
                                    FOREIGN KEY REFERENCES [__mj].[User]([ID])
    );
END
GO

-- Extended Properties for ScheduledJobRun table
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Records execution history for scheduled jobs. Provides uniform tracking across all job types. Each record represents one execution attempt of a scheduled job.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJobRun';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when this job execution began. Set immediately before calling the job plugin''s Execute method.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJobRun',
    @level2type = N'COLUMN', @level2name = N'StartedAt';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when this job execution completed (successfully or with failure). NULL while the job is still running.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJobRun',
    @level2type = N'COLUMN', @level2name = N'CompletedAt';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the job execution. Running=currently executing, Completed=finished (check Success for outcome), Failed=exception during execution, Cancelled=manually cancelled, Timeout=exceeded maximum execution time.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJobRun',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the job execution completed successfully. NULL while running, TRUE if successful, FALSE if failed. This is the job-level success from the plugin''s Execute method, separate from domain-specific success tracking.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJobRun',
    @level2type = N'COLUMN', @level2name = N'Success';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Error message if the job failed. NULL for successful runs. Contains exception messages or error details from the plugin''s Execute method.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJobRun',
    @level2type = N'COLUMN', @level2name = N'ErrorMessage';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Job-type specific execution details stored as JSON. May include references to domain-specific run records (e.g., {"AgentRunID": "...", "TokensUsed": 5000}), performance metrics, or other execution metadata. Schema is defined by the job type plugin.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJobRun',
    @level2type = N'COLUMN', @level2name = N'Details';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User context under which the job was executed. Typically the OwnerUserID from the schedule, but can be overridden in job-specific configuration.',
    @level0type = N'SCHEMA', @level0name = N'__mj',
    @level1type = N'TABLE', @level1name = N'ScheduledJobRun',
    @level2type = N'COLUMN', @level2name = N'ExecutedByUserID';
GO

/******************************************************************************************
* Add Foreign Key from ScheduledJob.LastRunID to ScheduledJobRun
* (Must be done after ScheduledJobRun table exists)
******************************************************************************************/
IF NOT EXISTS (
    SELECT * FROM sys.foreign_keys
    WHERE name = 'FK_ScheduledJob_LastRun'
    AND parent_object_id = OBJECT_ID('[__mj].[ScheduledJob]')
)
BEGIN
    ALTER TABLE [__mj].[ScheduledJob]
    ADD CONSTRAINT [FK_ScheduledJob_LastRun]
    FOREIGN KEY ([LastRunID]) REFERENCES [__mj].[ScheduledJobRun]([ID]);
END
GO

/******************************************************************************************
* TABLE MODIFICATION: Add ScheduledJobRunID to AIAgentRun
* Links agent executions back to the schedule that triggered them
******************************************************************************************/
IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('[__mj].[AIAgentRun]')
    AND name = 'ScheduledJobRunID'
)
BEGIN
    ALTER TABLE [__mj].[AIAgentRun]
    ADD [ScheduledJobRunID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_AIAgentRun_ScheduledJobRun]
        FOREIGN KEY REFERENCES [__mj].[ScheduledJobRun]([ID]);

    -- Extended property for the new column
    EXEC sys.sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Links to the scheduled job run that triggered this agent execution. NULL for manually-triggered agent runs. Enables tracking which scheduled jobs spawned which agent executions.',
        @level0type = N'SCHEMA', @level0name = N'__mj',
        @level1type = N'TABLE', @level1name = N'AIAgentRun',
        @level2type = N'COLUMN', @level2name = N'ScheduledJobRunID';
END
GO

/******************************************************************************************
* SEED DATA: Insert initial ScheduledJobType records
******************************************************************************************/

-- Agent Job Type
IF NOT EXISTS (SELECT * FROM [__mj].[ScheduledJobType] WHERE [Name] = 'Agent')
BEGIN
    INSERT INTO [__mj].[ScheduledJobType] (
        [ID],
        [Name],
        [Description],
        [DriverClass],
        [DomainRunEntity],
        [DomainRunEntityFKey],
        [NotificationsAvailable]
    )
    VALUES (
        NEWID(),
        'Agent',
        'Execute AI Agents on a schedule with configurable starting payload, conversation context, and model overrides.',
        'ScheduledJobAgent',
        'MJ: AI Agent Runs',
        'ScheduledJobRunID',
        1
    );
END
GO

-- Action Job Type
IF NOT EXISTS (SELECT * FROM [__mj].[ScheduledJobType] WHERE [Name] = 'Action')
BEGIN
    INSERT INTO [__mj].[ScheduledJobType] (
        [ID],
        [Name],
        [Description],
        [DriverClass],
        [DomainRunEntity],
        [DomainRunEntityFKey],
        [NotificationsAvailable]
    )
    VALUES (
        NEWID(),
        'Action',
        'Execute Actions on a schedule with static or SQL-derived parameter values.',
        'ScheduledJobAction',
        NULL,  -- Actions use ScheduledJobRun as their only execution record
        NULL,
        1
    );
END
GO

PRINT 'Scheduled Jobs migration completed successfully';
GO
