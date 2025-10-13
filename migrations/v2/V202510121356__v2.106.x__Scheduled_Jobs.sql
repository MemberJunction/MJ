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
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[ScheduledJobType]') AND type in (N'U'))
BEGIN
    CREATE TABLE [${flyway:defaultSchema}].[ScheduledJobType] (
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
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJobType';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique name identifying this job type (e.g., Agent, Action, Report).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJobType',
    @level2type = N'COLUMN', @level2name = N'Name';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable description of what this job type does and when it should be used.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJobType',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'TypeScript class name that implements BaseScheduledJob for this job type. Used by ClassFactory to instantiate the correct plugin at runtime.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJobType',
    @level2type = N'COLUMN', @level2name = N'DriverClass';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the entity that stores execution records for this job type (e.g., "MJ: AI Agent Runs", "Action Execution Logs"). Used for generic UI linking to domain-specific run records. NULL if job type uses ScheduledJobRun as its only execution record.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJobType',
    @level2type = N'COLUMN', @level2name = N'DomainRunEntity';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Name of the foreign key field in the DomainRunEntity that links back to ScheduledJobRun (e.g., "ScheduleID"). Used for querying related domain runs. NULL if DomainRunEntity is NULL.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJobType',
    @level2type = N'COLUMN', @level2name = N'DomainRunEntityFKey';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Indicates whether this job type supports sending notifications on completion or failure.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJobType',
    @level2type = N'COLUMN', @level2name = N'NotificationsAvailable';
GO

/******************************************************************************************
* TABLE: ScheduledJob
* Description: Generic schedule configuration for any type of schedulable job
******************************************************************************************/
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[ScheduledJob]') AND type in (N'U'))
BEGIN
    CREATE TABLE [${flyway:defaultSchema}].[ScheduledJob] (
        [ID]                        UNIQUEIDENTIFIER NOT NULL
                                    CONSTRAINT [DF_ScheduledJob_ID] DEFAULT (NEWSEQUENTIALID())
                                    CONSTRAINT [PK_ScheduledJob] PRIMARY KEY,

        -- Type and Identification
        [JobTypeID]                 UNIQUEIDENTIFIER NOT NULL
                                    CONSTRAINT [FK_ScheduledJob_JobType]
                                    FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[ScheduledJobType]([ID]),

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
                                    FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[User]([ID]),

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
                                    FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[User]([ID]),

        [NotifyViaEmail]            BIT NOT NULL
                                    CONSTRAINT [DF_ScheduledJob_NotifyViaEmail] DEFAULT(0),

        [NotifyViaInApp]            BIT NOT NULL
                                    CONSTRAINT [DF_ScheduledJob_NotifyViaInApp] DEFAULT(1),

        -- Distributed Locking (for multi-server environments)
        [LockToken]                 UNIQUEIDENTIFIER NULL,
        [LockedAt]                  DATETIMEOFFSET(7) NULL,
        [LockedByInstance]          NVARCHAR(255) NULL,
        [ExpectedCompletionAt]      DATETIMEOFFSET(7) NULL,

        -- Concurrency Control
        [ConcurrencyMode]           NVARCHAR(20) NOT NULL
                                    CONSTRAINT [DF_ScheduledJob_ConcurrencyMode] DEFAULT('Skip')
                                    CONSTRAINT [CK_ScheduledJob_ConcurrencyMode]
                                    CHECK ([ConcurrencyMode] IN ('Skip', 'Queue', 'Concurrent'))
    );
END
GO

-- Extended Properties for ScheduledJob table
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Defines schedules for automated job execution across all schedulable types. Each record represents a scheduled job with its cron expression, configuration, and execution tracking.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Human-readable name for this scheduled job. Should clearly identify what the job does.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'Name';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Detailed description of the job''s purpose, what it does, and any important notes about its execution.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'Description';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Cron expression defining when the job should execute (e.g., "0 30 9 * * MON-FRI" for weekdays at 9:30 AM). Uses standard cron syntax with seconds precision.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'CronExpression';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'IANA timezone identifier for interpreting the cron expression (e.g., "America/Chicago", "UTC"). Ensures consistent scheduling across different server locations.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'Timezone';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional start date/time for when this schedule becomes active. Job will not execute before this time. NULL means active immediately upon creation.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'StartAt';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Optional end date/time for when this schedule expires. Job will not execute after this time. NULL means no expiration.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'EndAt';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the schedule. Pending=created but not yet active, Active=currently running on schedule, Paused=temporarily stopped, Disabled=manually disabled, Expired=past EndAt date.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Job-type specific configuration stored as JSON. Schema is defined by the ScheduledJobType plugin. For Agents: includes AgentID, StartingPayload, InitialMessage, etc. For Actions: includes ActionID and parameter mappings.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'Configuration';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User who owns this schedule. Used as the execution context if no specific user is configured in the job-specific configuration.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'OwnerUserID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Reference to the most recent execution of this schedule. Provides quick access to last run status and details.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'LastRunID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp of the most recent execution. Updated after each run. Used for monitoring and dashboard displays.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'LastRunAt';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Calculated timestamp of when this job should next execute based on the cron expression. Updated after each run. Used by scheduler to determine which jobs are due.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'NextRunAt';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Total number of times this schedule has been executed, including both successful and failed runs.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'RunCount';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of times this schedule has executed successfully (Success = true in ScheduledJobRun).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'SuccessCount';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Number of times this schedule has executed but failed (Success = false in ScheduledJobRun).',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'FailureCount';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether to send notifications when the job completes successfully.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'NotifyOnSuccess';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether to send notifications when the job fails. Defaults to true for alerting on failures.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'NotifyOnFailure';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User to notify about job execution results. If NULL and notifications are enabled, falls back to OwnerUserID.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'NotifyUserID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether to send email notifications. Requires NotifyOnSuccess or NotifyOnFailure to also be enabled.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'NotifyViaEmail';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether to send in-app notifications. Requires NotifyOnSuccess or NotifyOnFailure to also be enabled. Defaults to true.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'NotifyViaInApp';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Unique token used for distributed locking across multiple server instances. Set when a server claims the job for execution. Prevents duplicate executions in multi-server environments.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'LockToken';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when the lock was acquired. Used with ExpectedCompletionAt to detect stale locks from crashed server instances.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'LockedAt';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Identifier of the server instance that currently holds the lock (e.g., "hostname-12345"). Used for troubleshooting and monitoring which server is executing which job.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'LockedByInstance';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Expected completion time for the current execution. If current time exceeds this and lock still exists, the lock is considered stale and can be claimed by another instance. Handles crashed server cleanup.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'ExpectedCompletionAt';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Controls behavior when a new execution is scheduled while a previous execution is still running. Skip=do not start new execution (default), Queue=wait for current to finish then execute, Concurrent=allow multiple simultaneous executions.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJob',
    @level2type = N'COLUMN', @level2name = N'ConcurrencyMode';
GO

/******************************************************************************************
* TABLE: ScheduledJobRun
* Description: Tracks execution history for all scheduled jobs
******************************************************************************************/
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[${flyway:defaultSchema}].[ScheduledJobRun]') AND type in (N'U'))
BEGIN
    CREATE TABLE [${flyway:defaultSchema}].[ScheduledJobRun] (
        [ID]                        UNIQUEIDENTIFIER NOT NULL
                                    CONSTRAINT [DF_ScheduledJobRun_ID] DEFAULT (NEWSEQUENTIALID())
                                    CONSTRAINT [PK_ScheduledJobRun] PRIMARY KEY,

        [ScheduledJobID]            UNIQUEIDENTIFIER NOT NULL
                                    CONSTRAINT [FK_ScheduledJobRun_ScheduledJob]
                                    FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[ScheduledJob]([ID]),

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
                                    FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[User]([ID]),

        -- Queued Execution Support
        [QueuedAt]                  DATETIMEOFFSET(7) NULL
    );
END
GO

-- Extended Properties for ScheduledJobRun table
EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Records execution history for scheduled jobs. Provides uniform tracking across all job types. Each record represents one execution attempt of a scheduled job.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJobRun';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when this job execution began. Set immediately before calling the job plugin''s Execute method.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJobRun',
    @level2type = N'COLUMN', @level2name = N'StartedAt';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when this job execution completed (successfully or with failure). NULL while the job is still running.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJobRun',
    @level2type = N'COLUMN', @level2name = N'CompletedAt';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Current status of the job execution. Running=currently executing, Completed=finished (check Success for outcome), Failed=exception during execution, Cancelled=manually cancelled, Timeout=exceeded maximum execution time.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJobRun',
    @level2type = N'COLUMN', @level2name = N'Status';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Whether the job execution completed successfully. NULL while running, TRUE if successful, FALSE if failed. This is the job-level success from the plugin''s Execute method, separate from domain-specific success tracking.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJobRun',
    @level2type = N'COLUMN', @level2name = N'Success';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Error message if the job failed. NULL for successful runs. Contains exception messages or error details from the plugin''s Execute method.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJobRun',
    @level2type = N'COLUMN', @level2name = N'ErrorMessage';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Job-type specific execution details stored as JSON. May include references to domain-specific run records (e.g., {"AgentRunID": "...", "TokensUsed": 5000}), performance metrics, or other execution metadata. Schema is defined by the job type plugin.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJobRun',
    @level2type = N'COLUMN', @level2name = N'Details';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'User context under which the job was executed. Typically the OwnerUserID from the schedule, but can be overridden in job-specific configuration.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJobRun',
    @level2type = N'COLUMN', @level2name = N'ExecutedByUserID';
GO

EXEC sys.sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Timestamp when this execution was queued (for ConcurrencyMode=Queue). NULL for immediate executions. When set, indicates this run is waiting for a previous execution to complete before starting.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'ScheduledJobRun',
    @level2type = N'COLUMN', @level2name = N'QueuedAt';
GO

/******************************************************************************************
* Add Foreign Key from ScheduledJob.LastRunID to ScheduledJobRun
* (Must be done after ScheduledJobRun table exists)
******************************************************************************************/
IF NOT EXISTS (
    SELECT * FROM sys.foreign_keys
    WHERE name = 'FK_ScheduledJob_LastRun'
    AND parent_object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScheduledJob]')
)
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[ScheduledJob]
    ADD CONSTRAINT [FK_ScheduledJob_LastRun]
    FOREIGN KEY ([LastRunID]) REFERENCES [${flyway:defaultSchema}].[ScheduledJobRun]([ID]);
END
GO

/******************************************************************************************
* TABLE MODIFICATION: Add ScheduledJobRunID to AIAgentRun
* Links agent executions back to the schedule that triggered them
******************************************************************************************/
IF NOT EXISTS (
    SELECT * FROM sys.columns
    WHERE object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
    AND name = 'ScheduledJobRunID'
)
BEGIN
    ALTER TABLE [${flyway:defaultSchema}].[AIAgentRun]
    ADD [ScheduledJobRunID] UNIQUEIDENTIFIER NULL
        CONSTRAINT [FK_AIAgentRun_ScheduledJobRun]
        FOREIGN KEY REFERENCES [${flyway:defaultSchema}].[ScheduledJobRun]([ID]);

    -- Extended property for the new column
    EXEC sys.sp_addextendedproperty
        @name = N'MS_Description',
        @value = N'Links to the scheduled job run that triggered this agent execution. NULL for manually-triggered agent runs. Enables tracking which scheduled jobs spawned which agent executions.',
        @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
        @level1type = N'TABLE', @level1name = N'AIAgentRun',
        @level2type = N'COLUMN', @level2name = N'ScheduledJobRunID';
END
GO

/******************************************************************************************
* SEED DATA: Insert initial ScheduledJobType records
******************************************************************************************/

-- Agent Job Type
IF NOT EXISTS (SELECT * FROM [${flyway:defaultSchema}].[ScheduledJobType] WHERE [Name] = 'Agent')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ScheduledJobType] (
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
        'AgentScheduledJobDriver',
        'MJ: AI Agent Runs',
        'ScheduledJobRunID',
        1
    );
END
GO

-- Action Job Type
IF NOT EXISTS (SELECT * FROM [${flyway:defaultSchema}].[ScheduledJobType] WHERE [Name] = 'Action')
BEGIN
    INSERT INTO [${flyway:defaultSchema}].[ScheduledJobType] (
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
        'ActionScheduledJobDriver',
        NULL,  -- Actions use ScheduledJobRun as their only execution record
        NULL,
        1
    );
END
GO

PRINT 'Scheduled Jobs migration completed successfully';
GO




























































































-- CODE GEN RUN
/* SQL generated to create new entity MJ: Scheduled Job Types */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '98254b66-599e-48fe-9051-1a033b32ae43',
         'MJ: Scheduled Job Types',
         'Scheduled Job Types',
         NULL,
         NULL,
         'ScheduledJobType',
         'vwScheduledJobTypes',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: Scheduled Job Types to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '98254b66-599e-48fe-9051-1a033b32ae43', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Scheduled Job Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('98254b66-599e-48fe-9051-1a033b32ae43', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Scheduled Job Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('98254b66-599e-48fe-9051-1a033b32ae43', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Scheduled Job Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('98254b66-599e-48fe-9051-1a033b32ae43', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Scheduled Jobs */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '302a55b5-aef0-4c57-8f35-73ee6b17e234',
         'MJ: Scheduled Jobs',
         'Scheduled Jobs',
         NULL,
         NULL,
         'ScheduledJob',
         'vwScheduledJobs',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: Scheduled Jobs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '302a55b5-aef0-4c57-8f35-73ee6b17e234', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Scheduled Jobs for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('302a55b5-aef0-4c57-8f35-73ee6b17e234', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Scheduled Jobs for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('302a55b5-aef0-4c57-8f35-73ee6b17e234', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Scheduled Jobs for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('302a55b5-aef0-4c57-8f35-73ee6b17e234', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL generated to create new entity MJ: Scheduled Job Runs */

      INSERT INTO [${flyway:defaultSchema}].Entity (
         ID,
         Name,
         DisplayName,
         Description,
         NameSuffix,
         BaseTable,
         BaseView,
         SchemaName,
         IncludeInAPI,
         AllowUserSearchAPI
         , TrackRecordChanges
         , AuditRecordAccess
         , AuditViewRuns
         , AllowAllRowsAPI
         , AllowCreateAPI
         , AllowUpdateAPI
         , AllowDeleteAPI
         , UserViewMaxRows
      )
      VALUES (
         '257a461e-ac75-4ae5-aadc-124d2ca1f383',
         'MJ: Scheduled Job Runs',
         'Scheduled Job Runs',
         NULL,
         NULL,
         'ScheduledJobRun',
         'vwScheduledJobRuns',
         '${flyway:defaultSchema}',
         1,
         0
         , 1
         , 0
         , 0
         , 0
         , 1
         , 1
         , 1
         , 1000
      )
   

/* SQL generated to add new entity MJ: Scheduled Job Runs to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */
INSERT INTO ${flyway:defaultSchema}.ApplicationEntity
                                       (ApplicationID, EntityID, Sequence) VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '257a461e-ac75-4ae5-aadc-124d2ca1f383', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Scheduled Job Runs for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('257a461e-ac75-4ae5-aadc-124d2ca1f383', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Scheduled Job Runs for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('257a461e-ac75-4ae5-aadc-124d2ca1f383', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Scheduled Job Runs for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('257a461e-ac75-4ae5-aadc-124d2ca1f383', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ScheduledJobRun */
ALTER TABLE [${flyway:defaultSchema}].[ScheduledJobRun] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ScheduledJobRun */
ALTER TABLE [${flyway:defaultSchema}].[ScheduledJobRun] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ScheduledJobType */
ALTER TABLE [${flyway:defaultSchema}].[ScheduledJobType] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ScheduledJobType */
ALTER TABLE [${flyway:defaultSchema}].[ScheduledJobType] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_CreatedAt to entity ${flyway:defaultSchema}.ScheduledJob */
ALTER TABLE [${flyway:defaultSchema}].[ScheduledJob] ADD __mj_CreatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to add special date field __mj_UpdatedAt to entity ${flyway:defaultSchema}.ScheduledJob */
ALTER TABLE [${flyway:defaultSchema}].[ScheduledJob] ADD __mj_UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE()

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0f496206-b3c0-400c-ba6d-0f943fc416bd'  OR 
               (EntityID = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND Name = 'ScheduledJobRunID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0f496206-b3c0-400c-ba6d-0f943fc416bd',
            '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- Entity: MJ: AI Agent Runs
            100087,
            'ScheduledJobRunID',
            'Scheduled Job Run ID',
            'Links to the scheduled job run that triggered this agent execution. NULL for manually-triggered agent runs. Enables tracking which scheduled jobs spawned which agent executions.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '257A461E-AC75-4AE5-AADC-124D2CA1F383',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3bd9f88a-0fc1-4c68-a8ba-228afe803c40'  OR 
               (EntityID = '257A461E-AC75-4AE5-AADC-124D2CA1F383' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3bd9f88a-0fc1-4c68-a8ba-228afe803c40',
            '257A461E-AC75-4AE5-AADC-124D2CA1F383', -- Entity: MJ: Scheduled Job Runs
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
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd8c590c7-e726-4f2a-9adc-7fae0cb58600'  OR 
               (EntityID = '257A461E-AC75-4AE5-AADC-124D2CA1F383' AND Name = 'ScheduledJobID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd8c590c7-e726-4f2a-9adc-7fae0cb58600',
            '257A461E-AC75-4AE5-AADC-124D2CA1F383', -- Entity: MJ: Scheduled Job Runs
            100002,
            'ScheduledJobID',
            'Scheduled Job ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a463fd3f-17b3-4a3a-8e3f-95f863ba67ea'  OR 
               (EntityID = '257A461E-AC75-4AE5-AADC-124D2CA1F383' AND Name = 'StartedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a463fd3f-17b3-4a3a-8e3f-95f863ba67ea',
            '257A461E-AC75-4AE5-AADC-124D2CA1F383', -- Entity: MJ: Scheduled Job Runs
            100003,
            'StartedAt',
            'Started At',
            'Timestamp when this job execution began. Set immediately before calling the job plugin''s Execute method.',
            'datetimeoffset',
            10,
            34,
            7,
            0,
            'sysdatetimeoffset()',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ef349d93-fcae-4775-a7f5-4a196c0bf669'  OR 
               (EntityID = '257A461E-AC75-4AE5-AADC-124D2CA1F383' AND Name = 'CompletedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ef349d93-fcae-4775-a7f5-4a196c0bf669',
            '257A461E-AC75-4AE5-AADC-124D2CA1F383', -- Entity: MJ: Scheduled Job Runs
            100004,
            'CompletedAt',
            'Completed At',
            'Timestamp when this job execution completed (successfully or with failure). NULL while the job is still running.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '82438f9d-6b8a-4317-b27b-5eab51a56d68'  OR 
               (EntityID = '257A461E-AC75-4AE5-AADC-124D2CA1F383' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '82438f9d-6b8a-4317-b27b-5eab51a56d68',
            '257A461E-AC75-4AE5-AADC-124D2CA1F383', -- Entity: MJ: Scheduled Job Runs
            100005,
            'Status',
            'Status',
            'Current status of the job execution. Running=currently executing, Completed=finished (check Success for outcome), Failed=exception during execution, Cancelled=manually cancelled, Timeout=exceeded maximum execution time.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Running',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '089052ce-164e-4a43-a1f7-87804d3aaf84'  OR 
               (EntityID = '257A461E-AC75-4AE5-AADC-124D2CA1F383' AND Name = 'Success')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '089052ce-164e-4a43-a1f7-87804d3aaf84',
            '257A461E-AC75-4AE5-AADC-124D2CA1F383', -- Entity: MJ: Scheduled Job Runs
            100006,
            'Success',
            'Success',
            'Whether the job execution completed successfully. NULL while running, TRUE if successful, FALSE if failed. This is the job-level success from the plugin''s Execute method, separate from domain-specific success tracking.',
            'bit',
            1,
            1,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c962b5d5-b7a3-453b-96f7-4f5f237b2281'  OR 
               (EntityID = '257A461E-AC75-4AE5-AADC-124D2CA1F383' AND Name = 'ErrorMessage')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c962b5d5-b7a3-453b-96f7-4f5f237b2281',
            '257A461E-AC75-4AE5-AADC-124D2CA1F383', -- Entity: MJ: Scheduled Job Runs
            100007,
            'ErrorMessage',
            'Error Message',
            'Error message if the job failed. NULL for successful runs. Contains exception messages or error details from the plugin''s Execute method.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8509832e-7783-4129-8493-1327fddb1ff7'  OR 
               (EntityID = '257A461E-AC75-4AE5-AADC-124D2CA1F383' AND Name = 'Details')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8509832e-7783-4129-8493-1327fddb1ff7',
            '257A461E-AC75-4AE5-AADC-124D2CA1F383', -- Entity: MJ: Scheduled Job Runs
            100008,
            'Details',
            'Details',
            'Job-type specific execution details stored as JSON. May include references to domain-specific run records (e.g., {"AgentRunID": "...", "TokensUsed": 5000}), performance metrics, or other execution metadata. Schema is defined by the job type plugin.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '90a6e720-9e0e-40c0-ab0d-224d59b98a3e'  OR 
               (EntityID = '257A461E-AC75-4AE5-AADC-124D2CA1F383' AND Name = 'ExecutedByUserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '90a6e720-9e0e-40c0-ab0d-224d59b98a3e',
            '257A461E-AC75-4AE5-AADC-124D2CA1F383', -- Entity: MJ: Scheduled Job Runs
            100009,
            'ExecutedByUserID',
            'Executed By User ID',
            'User context under which the job was executed. Typically the OwnerUserID from the schedule, but can be overridden in job-specific configuration.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4dfe2445-9f01-40f7-8912-69496dd607ae'  OR 
               (EntityID = '257A461E-AC75-4AE5-AADC-124D2CA1F383' AND Name = 'QueuedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4dfe2445-9f01-40f7-8912-69496dd607ae',
            '257A461E-AC75-4AE5-AADC-124D2CA1F383', -- Entity: MJ: Scheduled Job Runs
            100010,
            'QueuedAt',
            'Queued At',
            'Timestamp when this execution was queued (for ConcurrencyMode=Queue). NULL for immediate executions. When set, indicates this run is waiting for a previous execution to complete before starting.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd512685e-1931-40b5-a09e-7ab2d4ad67ce'  OR 
               (EntityID = '257A461E-AC75-4AE5-AADC-124D2CA1F383' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd512685e-1931-40b5-a09e-7ab2d4ad67ce',
            '257A461E-AC75-4AE5-AADC-124D2CA1F383', -- Entity: MJ: Scheduled Job Runs
            100011,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'bc7ff345-5c2e-4313-972a-e5ed56b0dde3'  OR 
               (EntityID = '257A461E-AC75-4AE5-AADC-124D2CA1F383' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'bc7ff345-5c2e-4313-972a-e5ed56b0dde3',
            '257A461E-AC75-4AE5-AADC-124D2CA1F383', -- Entity: MJ: Scheduled Job Runs
            100012,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'd563a319-78a7-4df4-bcec-c3df7e151fdd'  OR 
               (EntityID = '98254B66-599E-48FE-9051-1A033B32AE43' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'd563a319-78a7-4df4-bcec-c3df7e151fdd',
            '98254B66-599E-48FE-9051-1A033B32AE43', -- Entity: MJ: Scheduled Job Types
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
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '483fcb56-c15c-474b-aad1-7874f9c1fcae'  OR 
               (EntityID = '98254B66-599E-48FE-9051-1A033B32AE43' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '483fcb56-c15c-474b-aad1-7874f9c1fcae',
            '98254B66-599E-48FE-9051-1A033B32AE43', -- Entity: MJ: Scheduled Job Types
            100002,
            'Name',
            'Name',
            'Unique name identifying this job type (e.g., Agent, Action, Report).',
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3405901f-dbff-41ad-8c7f-f2ebd167633a'  OR 
               (EntityID = '98254B66-599E-48FE-9051-1A033B32AE43' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3405901f-dbff-41ad-8c7f-f2ebd167633a',
            '98254B66-599E-48FE-9051-1A033B32AE43', -- Entity: MJ: Scheduled Job Types
            100003,
            'Description',
            'Description',
            'Human-readable description of what this job type does and when it should be used.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '921ee969-dd08-4f93-a4e6-094b5a677d1d'  OR 
               (EntityID = '98254B66-599E-48FE-9051-1A033B32AE43' AND Name = 'DriverClass')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '921ee969-dd08-4f93-a4e6-094b5a677d1d',
            '98254B66-599E-48FE-9051-1A033B32AE43', -- Entity: MJ: Scheduled Job Types
            100004,
            'DriverClass',
            'Driver Class',
            'TypeScript class name that implements BaseScheduledJob for this job type. Used by ClassFactory to instantiate the correct plugin at runtime.',
            'nvarchar',
            510,
            0,
            0,
            0,
            'null',
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
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8753a3d1-618d-45f5-8905-e3aa61ab176c'  OR 
               (EntityID = '98254B66-599E-48FE-9051-1A033B32AE43' AND Name = 'DomainRunEntity')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8753a3d1-618d-45f5-8905-e3aa61ab176c',
            '98254B66-599E-48FE-9051-1A033B32AE43', -- Entity: MJ: Scheduled Job Types
            100005,
            'DomainRunEntity',
            'Domain Run Entity',
            'Name of the entity that stores execution records for this job type (e.g., "MJ: AI Agent Runs", "Action Execution Logs"). Used for generic UI linking to domain-specific run records. NULL if job type uses ScheduledJobRun as its only execution record.',
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b05d5abd-d614-4951-b665-bf623f4dcc8b'  OR 
               (EntityID = '98254B66-599E-48FE-9051-1A033B32AE43' AND Name = 'DomainRunEntityFKey')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b05d5abd-d614-4951-b665-bf623f4dcc8b',
            '98254B66-599E-48FE-9051-1A033B32AE43', -- Entity: MJ: Scheduled Job Types
            100006,
            'DomainRunEntityFKey',
            'Domain Run Entity F Key',
            'Name of the foreign key field in the DomainRunEntity that links back to ScheduledJobRun (e.g., "ScheduleID"). Used for querying related domain runs. NULL if DomainRunEntity is NULL.',
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5515ce9b-2956-4d90-a9e9-5689d405a21e'  OR 
               (EntityID = '98254B66-599E-48FE-9051-1A033B32AE43' AND Name = 'NotificationsAvailable')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5515ce9b-2956-4d90-a9e9-5689d405a21e',
            '98254B66-599E-48FE-9051-1A033B32AE43', -- Entity: MJ: Scheduled Job Types
            100007,
            'NotificationsAvailable',
            'Notifications Available',
            'Indicates whether this job type supports sending notifications on completion or failure.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '2c9760b4-6f42-4059-b30b-e2a0c98381ef'  OR 
               (EntityID = '98254B66-599E-48FE-9051-1A033B32AE43' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '2c9760b4-6f42-4059-b30b-e2a0c98381ef',
            '98254B66-599E-48FE-9051-1A033B32AE43', -- Entity: MJ: Scheduled Job Types
            100008,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c3d05021-b698-4165-b095-361c89c1716a'  OR 
               (EntityID = '98254B66-599E-48FE-9051-1A033B32AE43' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c3d05021-b698-4165-b095-361c89c1716a',
            '98254B66-599E-48FE-9051-1A033B32AE43', -- Entity: MJ: Scheduled Job Types
            100009,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a7019576-a2b1-4765-aacf-e1f7eb75857b'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'ID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a7019576-a2b1-4765-aacf-e1f7eb75857b',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
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
            NULL,
            NULL,
            0,
            1,
            0,
            1,
            1,
            1,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '80851c94-5ac0-4de9-8a07-a84e3c545d6c'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'JobTypeID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '80851c94-5ac0-4de9-8a07-a84e3c545d6c',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100002,
            'JobTypeID',
            'Job Type ID',
            NULL,
            'uniqueidentifier',
            16,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            '98254B66-599E-48FE-9051-1A033B32AE43',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '66858ae4-390a-4573-90a3-54448c968841'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'Name')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '66858ae4-390a-4573-90a3-54448c968841',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100003,
            'Name',
            'Name',
            'Human-readable name for this scheduled job. Should clearly identify what the job does.',
            'nvarchar',
            400,
            0,
            0,
            0,
            'null',
            0,
            1,
            0,
            NULL,
            NULL,
            1,
            1,
            0,
            1,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a2f74c27-3727-42af-82f2-32af4ae79165'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'Description')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a2f74c27-3727-42af-82f2-32af4ae79165',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100004,
            'Description',
            'Description',
            'Detailed description of the job''s purpose, what it does, and any important notes about its execution.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '81361c3d-ff60-45d8-b935-1e1015dcb991'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'CronExpression')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '81361c3d-ff60-45d8-b935-1e1015dcb991',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100005,
            'CronExpression',
            'Cron Expression',
            'Cron expression defining when the job should execute (e.g., "0 30 9 * * MON-FRI" for weekdays at 9:30 AM). Uses standard cron syntax with seconds precision.',
            'nvarchar',
            240,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '83be170e-3909-4466-a515-af0b70cb5994'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'Timezone')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '83be170e-3909-4466-a515-af0b70cb5994',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100006,
            'Timezone',
            'Timezone',
            'IANA timezone identifier for interpreting the cron expression (e.g., "America/Chicago", "UTC"). Ensures consistent scheduling across different server locations.',
            'nvarchar',
            128,
            0,
            0,
            0,
            'UTC',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '8987da31-99d7-4e2b-9c30-20cceae4926d'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'StartAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '8987da31-99d7-4e2b-9c30-20cceae4926d',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100007,
            'StartAt',
            'Start At',
            'Optional start date/time for when this schedule becomes active. Job will not execute before this time. NULL means active immediately upon creation.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0f33b6b4-6e15-43fa-9217-a62339ce1211'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'EndAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0f33b6b4-6e15-43fa-9217-a62339ce1211',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100008,
            'EndAt',
            'End At',
            'Optional end date/time for when this schedule expires. Job will not execute after this time. NULL means no expiration.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '3e785803-85e6-446e-a4f2-b2970bb6766c'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'Status')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '3e785803-85e6-446e-a4f2-b2970bb6766c',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100009,
            'Status',
            'Status',
            'Current status of the schedule. Pending=created but not yet active, Active=currently running on schedule, Paused=temporarily stopped, Disabled=manually disabled, Expired=past EndAt date.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Pending',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0475c76c-f2cc-47cf-9751-3e4dd9c9a177'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'Configuration')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0475c76c-f2cc-47cf-9751-3e4dd9c9a177',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100010,
            'Configuration',
            'Configuration',
            'Job-type specific configuration stored as JSON. Schema is defined by the ScheduledJobType plugin. For Agents: includes AgentID, StartingPayload, InitialMessage, etc. For Actions: includes ActionID and parameter mappings.',
            'nvarchar',
            -1,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '76aa6de8-dace-4243-800f-fdf6d7908a7c'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'OwnerUserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '76aa6de8-dace-4243-800f-fdf6d7908a7c',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100011,
            'OwnerUserID',
            'Owner User ID',
            'User who owns this schedule. Used as the execution context if no specific user is configured in the job-specific configuration.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '4354b2e1-5705-45d8-89d8-0327d5fdb423'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'LastRunID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '4354b2e1-5705-45d8-89d8-0327d5fdb423',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100012,
            'LastRunID',
            'Last Run ID',
            'Reference to the most recent execution of this schedule. Provides quick access to last run status and details.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            '257A461E-AC75-4AE5-AADC-124D2CA1F383',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'e6253f7e-9f86-43ab-b8d9-a2a4e28a022d'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'LastRunAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'e6253f7e-9f86-43ab-b8d9-a2a4e28a022d',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100013,
            'LastRunAt',
            'Last Run At',
            'Timestamp of the most recent execution. Updated after each run. Used for monitoring and dashboard displays.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'c5940a79-563a-49e9-99c2-fd694bdbf9cc'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'NextRunAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'c5940a79-563a-49e9-99c2-fd694bdbf9cc',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100014,
            'NextRunAt',
            'Next Run At',
            'Calculated timestamp of when this job should next execute based on the cron expression. Updated after each run. Used by scheduler to determine which jobs are due.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1c689256-2688-4b40-9e21-6dc51d0a2ac3'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'RunCount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1c689256-2688-4b40-9e21-6dc51d0a2ac3',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100015,
            'RunCount',
            'Run Count',
            'Total number of times this schedule has been executed, including both successful and failed runs.',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'a9b442a6-6f10-49be-9313-977b203c74f0'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'SuccessCount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'a9b442a6-6f10-49be-9313-977b203c74f0',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100016,
            'SuccessCount',
            'Success Count',
            'Number of times this schedule has executed successfully (Success = true in ScheduledJobRun).',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9385a799-ac29-4261-ba45-8fd28325f124'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'FailureCount')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9385a799-ac29-4261-ba45-8fd28325f124',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100017,
            'FailureCount',
            'Failure Count',
            'Number of times this schedule has executed but failed (Success = false in ScheduledJobRun).',
            'int',
            4,
            10,
            0,
            0,
            '(0)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'b7412ab0-300c-4761-bbaf-c5cffb195972'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'NotifyOnSuccess')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'b7412ab0-300c-4761-bbaf-c5cffb195972',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100018,
            'NotifyOnSuccess',
            'Notify On Success',
            'Whether to send notifications when the job completes successfully.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '04af2794-421d-4f97-a436-bc30dc84cef6'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'NotifyOnFailure')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '04af2794-421d-4f97-a436-bc30dc84cef6',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100019,
            'NotifyOnFailure',
            'Notify On Failure',
            'Whether to send notifications when the job fails. Defaults to true for alerting on failures.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '0f32d762-ac95-4567-8741-aa332da8b80b'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'NotifyUserID')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '0f32d762-ac95-4567-8741-aa332da8b80b',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100020,
            'NotifyUserID',
            'Notify User ID',
            'User to notify about job execution results. If NULL and notifications are enabled, falls back to OwnerUserID.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
            0,
            1,
            0,
            'E1238F34-2837-EF11-86D4-6045BDEE16E6',
            'ID',
            0,
            0,
            1,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '87208171-0df5-4079-9b07-bfa27affafe0'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'NotifyViaEmail')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '87208171-0df5-4079-9b07-bfa27affafe0',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100021,
            'NotifyViaEmail',
            'Notify Via Email',
            'Whether to send email notifications. Requires NotifyOnSuccess or NotifyOnFailure to also be enabled.',
            'bit',
            1,
            1,
            0,
            0,
            '(0)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '673ad91a-0a6d-4ea8-8b8b-cc8a8221a05b'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'NotifyViaInApp')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '673ad91a-0a6d-4ea8-8b8b-cc8a8221a05b',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100022,
            'NotifyViaInApp',
            'Notify Via In App',
            'Whether to send in-app notifications. Requires NotifyOnSuccess or NotifyOnFailure to also be enabled. Defaults to true.',
            'bit',
            1,
            1,
            0,
            0,
            '(1)',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'f8c10b8a-14ab-4a0d-ac72-2d564c6643e2'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'LockToken')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'f8c10b8a-14ab-4a0d-ac72-2d564c6643e2',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100023,
            'LockToken',
            'Lock Token',
            'Unique token used for distributed locking across multiple server instances. Set when a server claims the job for execution. Prevents duplicate executions in multi-server environments.',
            'uniqueidentifier',
            16,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '18bd33a7-d370-440e-91ae-7f2633c75c9d'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'LockedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '18bd33a7-d370-440e-91ae-7f2633c75c9d',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100024,
            'LockedAt',
            'Locked At',
            'Timestamp when the lock was acquired. Used with ExpectedCompletionAt to detect stale locks from crashed server instances.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = 'ae143496-0733-44d8-adf3-a602b2d1777c'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'LockedByInstance')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            'ae143496-0733-44d8-adf3-a602b2d1777c',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100025,
            'LockedByInstance',
            'Locked By Instance',
            'Identifier of the server instance that currently holds the lock (e.g., "hostname-12345"). Used for troubleshooting and monitoring which server is executing which job.',
            'nvarchar',
            510,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '1f61006f-c854-4062-a827-3af8ade49f54'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'ExpectedCompletionAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '1f61006f-c854-4062-a827-3af8ade49f54',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100026,
            'ExpectedCompletionAt',
            'Expected Completion At',
            'Expected completion time for the current execution. If current time exceeds this and lock still exists, the lock is considered stale and can be claimed by another instance. Handles crashed server cleanup.',
            'datetimeoffset',
            10,
            34,
            7,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '6afd6fcd-3f9b-4c04-b82d-e477744c2556'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'ConcurrencyMode')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '6afd6fcd-3f9b-4c04-b82d-e477744c2556',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100027,
            'ConcurrencyMode',
            'Concurrency Mode',
            'Controls behavior when a new execution is scheduled while a previous execution is still running. Skip=do not start new execution (default), Queue=wait for current to finish then execute, Concurrent=allow multiple simultaneous executions.',
            'nvarchar',
            40,
            0,
            0,
            0,
            'Skip',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '9259cf45-fe01-43c9-baa8-2576571e5bec'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = '__mj_CreatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '9259cf45-fe01-43c9-baa8-2576571e5bec',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100028,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '239ce41b-d71f-4366-9d35-f8c1366ef3d9'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = '__mj_UpdatedAt')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '239ce41b-d71f-4366-9d35-f8c1366ef3d9',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100029,
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
            NULL,
            NULL,
            0,
            0,
            0,
            0,
            0,
            0,
            'Search'
         )
      END

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3E785803-85E6-446E-A4F2-B2970BB6766C', 1, 'Pending', 'Pending')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3E785803-85E6-446E-A4F2-B2970BB6766C', 2, 'Active', 'Active')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3E785803-85E6-446E-A4F2-B2970BB6766C', 3, 'Paused', 'Paused')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3E785803-85E6-446E-A4F2-B2970BB6766C', 4, 'Disabled', 'Disabled')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('3E785803-85E6-446E-A4F2-B2970BB6766C', 5, 'Expired', 'Expired')

/* SQL text to update ValueListType for entity field ID 3E785803-85E6-446E-A4F2-B2970BB6766C */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='3E785803-85E6-446E-A4F2-B2970BB6766C'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6AFD6FCD-3F9B-4C04-B82D-E477744C2556', 1, 'Skip', 'Skip')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6AFD6FCD-3F9B-4C04-B82D-E477744C2556', 2, 'Queue', 'Queue')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('6AFD6FCD-3F9B-4C04-B82D-E477744C2556', 3, 'Concurrent', 'Concurrent')

/* SQL text to update ValueListType for entity field ID 6AFD6FCD-3F9B-4C04-B82D-E477744C2556 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='6AFD6FCD-3F9B-4C04-B82D-E477744C2556'

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('82438F9D-6B8A-4317-B27B-5EAB51A56D68', 1, 'Running', 'Running')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('82438F9D-6B8A-4317-B27B-5EAB51A56D68', 2, 'Completed', 'Completed')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('82438F9D-6B8A-4317-B27B-5EAB51A56D68', 3, 'Failed', 'Failed')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('82438F9D-6B8A-4317-B27B-5EAB51A56D68', 4, 'Cancelled', 'Cancelled')

/* SQL text to insert entity field values */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('82438F9D-6B8A-4317-B27B-5EAB51A56D68', 5, 'Timeout', 'Timeout')

/* SQL text to update ValueListType for entity field ID 82438F9D-6B8A-4317-B27B-5EAB51A56D68 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='82438F9D-6B8A-4317-B27B-5EAB51A56D68'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '6bd91e6c-99e3-4f41-9766-f4522fa6513b'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('6bd91e6c-99e3-4f41-9766-f4522fa6513b', '257A461E-AC75-4AE5-AADC-124D2CA1F383', '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'ScheduledJobRunID', 'One To Many', 1, 1, 'MJ: AI Agent Runs', 4);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'eb5eca09-33a0-405f-b236-3884f517a667'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('eb5eca09-33a0-405f-b236-3884f517a667', '257A461E-AC75-4AE5-AADC-124D2CA1F383', '302A55B5-AEF0-4C57-8F35-73EE6B17E234', 'LastRunID', 'One To Many', 1, 1, 'MJ: Scheduled Jobs', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '152d0e56-9c6c-457f-9601-4845063acec7'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('152d0e56-9c6c-457f-9601-4845063acec7', '98254B66-599E-48FE-9051-1A033B32AE43', '302A55B5-AEF0-4C57-8F35-73EE6B17E234', 'JobTypeID', 'One To Many', 1, 1, 'MJ: Scheduled Jobs', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'edecabaf-b187-4fc0-858b-50713c61eac2'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('edecabaf-b187-4fc0-858b-50713c61eac2', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '302A55B5-AEF0-4C57-8F35-73EE6B17E234', 'OwnerUserID', 'One To Many', 1, 1, 'MJ: Scheduled Jobs', 3);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '85b35234-65be-4c35-b678-6c38d26546c1'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('85b35234-65be-4c35-b678-6c38d26546c1', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '302A55B5-AEF0-4C57-8F35-73EE6B17E234', 'NotifyUserID', 'One To Many', 1, 1, 'MJ: Scheduled Jobs', 4);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '422ca569-1e4f-4b7b-8ecf-5fbbbcff8eeb'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('422ca569-1e4f-4b7b-8ecf-5fbbbcff8eeb', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '257A461E-AC75-4AE5-AADC-124D2CA1F383', 'ExecutedByUserID', 'One To Many', 1, 1, 'MJ: Scheduled Job Runs', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '33b3f058-af76-4bcb-a00d-a43ae5a2fb49'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('33b3f058-af76-4bcb-a00d-a43ae5a2fb49', '302A55B5-AEF0-4C57-8F35-73EE6B17E234', '257A461E-AC75-4AE5-AADC-124D2CA1F383', 'ScheduledJobID', 'One To Many', 1, 1, 'MJ: Scheduled Job Runs', 2);
   END
                              

/* Index for Foreign Keys for AIAgentRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_AgentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_AgentID ON [${flyway:defaultSchema}].[AIAgentRun] ([AgentID]);

-- Index for foreign key ParentRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ParentRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ParentRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([ParentRunID]);

-- Index for foreign key ConversationID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationID ON [${flyway:defaultSchema}].[AIAgentRun] ([ConversationID]);

-- Index for foreign key UserID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_UserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_UserID ON [${flyway:defaultSchema}].[AIAgentRun] ([UserID]);

-- Index for foreign key ConversationDetailID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationDetailID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationDetailID ON [${flyway:defaultSchema}].[AIAgentRun] ([ConversationDetailID]);

-- Index for foreign key LastRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_LastRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_LastRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([LastRunID]);

-- Index for foreign key ConfigurationID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ConfigurationID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ConfigurationID ON [${flyway:defaultSchema}].[AIAgentRun] ([ConfigurationID]);

-- Index for foreign key OverrideModelID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideModelID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideModelID ON [${flyway:defaultSchema}].[AIAgentRun] ([OverrideModelID]);

-- Index for foreign key OverrideVendorID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideVendorID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideVendorID ON [${flyway:defaultSchema}].[AIAgentRun] ([OverrideVendorID]);

-- Index for foreign key ScheduledJobRunID in table AIAgentRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_AIAgentRun_ScheduledJobRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[AIAgentRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_AIAgentRun_ScheduledJobRunID ON [${flyway:defaultSchema}].[AIAgentRun] ([ScheduledJobRunID]);

/* Base View SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: vwAIAgentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  AIAgentRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwAIAgentRuns]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwAIAgentRuns]
AS
WITH
    CTE_RootParentRunID AS (
        -- Anchor: rows with no parent (root nodes)
        SELECT
            [ID],
            [ID] AS [RootParentRunID]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun]
        WHERE
            [ParentRunID] IS NULL

        UNION ALL

        -- Recursive: traverse up the hierarchy
        SELECT
            child.[ID],
            parent.[RootParentRunID]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun] child
        INNER JOIN
            CTE_RootParentRunID parent ON child.[ParentRunID] = parent.[ID]
    ),
    CTE_RootLastRunID AS (
        -- Anchor: rows with no parent (root nodes)
        SELECT
            [ID],
            [ID] AS [RootLastRunID]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun]
        WHERE
            [LastRunID] IS NULL

        UNION ALL

        -- Recursive: traverse up the hierarchy
        SELECT
            child.[ID],
            parent.[RootLastRunID]
        FROM
            [${flyway:defaultSchema}].[AIAgentRun] child
        INNER JOIN
            CTE_RootLastRunID parent ON child.[LastRunID] = parent.[ID]
    )
SELECT
    a.*,
    AIAgent_AgentID.[Name] AS [Agent],
    Conversation_ConversationID.[Name] AS [Conversation],
    User_UserID.[Name] AS [User],
    AIConfiguration_ConfigurationID.[Name] AS [Configuration],
    AIModel_OverrideModelID.[Name] AS [OverrideModel],
    AIVendor_OverrideVendorID.[Name] AS [OverrideVendor],
    CTE_RootParentRunID.[RootParentRunID],
    CTE_RootLastRunID.[RootLastRunID]
FROM
    [${flyway:defaultSchema}].[AIAgentRun] AS a
INNER JOIN
    [${flyway:defaultSchema}].[AIAgent] AS AIAgent_AgentID
  ON
    [a].[AgentID] = AIAgent_AgentID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[Conversation] AS Conversation_ConversationID
  ON
    [a].[ConversationID] = Conversation_ConversationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_UserID
  ON
    [a].[UserID] = User_UserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIConfiguration] AS AIConfiguration_ConfigurationID
  ON
    [a].[ConfigurationID] = AIConfiguration_ConfigurationID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIModel] AS AIModel_OverrideModelID
  ON
    [a].[OverrideModelID] = AIModel_OverrideModelID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[AIVendor] AS AIVendor_OverrideVendorID
  ON
    [a].[OverrideVendorID] = AIVendor_OverrideVendorID.[ID]
LEFT OUTER JOIN
    CTE_RootParentRunID
  ON
    [a].[ID] = CTE_RootParentRunID.[ID]
LEFT OUTER JOIN
    CTE_RootLastRunID
  ON
    [a].[ID] = CTE_RootLastRunID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: Permissions for vwAIAgentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwAIAgentRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spCreateAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateAIAgentRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRun]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @ParentRunID uniqueidentifier,
    @Status nvarchar(50),
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @ConversationID uniqueidentifier,
    @UserID uniqueidentifier,
    @Result nvarchar(MAX),
    @AgentState nvarchar(MAX),
    @TotalTokensUsed int,
    @TotalCost decimal(18, 6),
    @TotalPromptTokensUsed int,
    @TotalCompletionTokensUsed int,
    @TotalTokensUsedRollup int,
    @TotalPromptTokensUsedRollup int,
    @TotalCompletionTokensUsedRollup int,
    @TotalCostRollup decimal(19, 8),
    @ConversationDetailID uniqueidentifier,
    @ConversationDetailSequence int,
    @CancellationReason nvarchar(30),
    @FinalStep nvarchar(30),
    @FinalPayload nvarchar(MAX),
    @Message nvarchar(MAX),
    @LastRunID uniqueidentifier,
    @StartingPayload nvarchar(MAX),
    @TotalPromptIterations int,
    @ConfigurationID uniqueidentifier,
    @OverrideModelID uniqueidentifier,
    @OverrideVendorID uniqueidentifier,
    @Data nvarchar(MAX),
    @Verbose bit,
    @EffortLevel int,
    @RunName nvarchar(255),
    @Comments nvarchar(MAX),
    @ScheduledJobRunID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRun]
            (
                [ID],
                [AgentID],
                [ParentRunID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [ConversationID],
                [UserID],
                [Result],
                [AgentState],
                [TotalTokensUsed],
                [TotalCost],
                [TotalPromptTokensUsed],
                [TotalCompletionTokensUsed],
                [TotalTokensUsedRollup],
                [TotalPromptTokensUsedRollup],
                [TotalCompletionTokensUsedRollup],
                [TotalCostRollup],
                [ConversationDetailID],
                [ConversationDetailSequence],
                [CancellationReason],
                [FinalStep],
                [FinalPayload],
                [Message],
                [LastRunID],
                [StartingPayload],
                [TotalPromptIterations],
                [ConfigurationID],
                [OverrideModelID],
                [OverrideVendorID],
                [Data],
                [Verbose],
                [EffortLevel],
                [RunName],
                [Comments],
                [ScheduledJobRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @AgentID,
                @ParentRunID,
                @Status,
                @StartedAt,
                @CompletedAt,
                @Success,
                @ErrorMessage,
                @ConversationID,
                @UserID,
                @Result,
                @AgentState,
                @TotalTokensUsed,
                @TotalCost,
                @TotalPromptTokensUsed,
                @TotalCompletionTokensUsed,
                @TotalTokensUsedRollup,
                @TotalPromptTokensUsedRollup,
                @TotalCompletionTokensUsedRollup,
                @TotalCostRollup,
                @ConversationDetailID,
                @ConversationDetailSequence,
                @CancellationReason,
                @FinalStep,
                @FinalPayload,
                @Message,
                @LastRunID,
                @StartingPayload,
                @TotalPromptIterations,
                @ConfigurationID,
                @OverrideModelID,
                @OverrideVendorID,
                @Data,
                @Verbose,
                @EffortLevel,
                @RunName,
                @Comments,
                @ScheduledJobRunID
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[AIAgentRun]
            (
                [AgentID],
                [ParentRunID],
                [Status],
                [StartedAt],
                [CompletedAt],
                [Success],
                [ErrorMessage],
                [ConversationID],
                [UserID],
                [Result],
                [AgentState],
                [TotalTokensUsed],
                [TotalCost],
                [TotalPromptTokensUsed],
                [TotalCompletionTokensUsed],
                [TotalTokensUsedRollup],
                [TotalPromptTokensUsedRollup],
                [TotalCompletionTokensUsedRollup],
                [TotalCostRollup],
                [ConversationDetailID],
                [ConversationDetailSequence],
                [CancellationReason],
                [FinalStep],
                [FinalPayload],
                [Message],
                [LastRunID],
                [StartingPayload],
                [TotalPromptIterations],
                [ConfigurationID],
                [OverrideModelID],
                [OverrideVendorID],
                [Data],
                [Verbose],
                [EffortLevel],
                [RunName],
                [Comments],
                [ScheduledJobRunID]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @AgentID,
                @ParentRunID,
                @Status,
                @StartedAt,
                @CompletedAt,
                @Success,
                @ErrorMessage,
                @ConversationID,
                @UserID,
                @Result,
                @AgentState,
                @TotalTokensUsed,
                @TotalCost,
                @TotalPromptTokensUsed,
                @TotalCompletionTokensUsed,
                @TotalTokensUsedRollup,
                @TotalPromptTokensUsedRollup,
                @TotalCompletionTokensUsedRollup,
                @TotalCostRollup,
                @ConversationDetailID,
                @ConversationDetailSequence,
                @CancellationReason,
                @FinalStep,
                @FinalPayload,
                @Message,
                @LastRunID,
                @StartingPayload,
                @TotalPromptIterations,
                @ConfigurationID,
                @OverrideModelID,
                @OverrideVendorID,
                @Data,
                @Verbose,
                @EffortLevel,
                @RunName,
                @Comments,
                @ScheduledJobRunID
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwAIAgentRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateAIAgentRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spUpdateAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateAIAgentRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRun]
    @ID uniqueidentifier,
    @AgentID uniqueidentifier,
    @ParentRunID uniqueidentifier,
    @Status nvarchar(50),
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @ConversationID uniqueidentifier,
    @UserID uniqueidentifier,
    @Result nvarchar(MAX),
    @AgentState nvarchar(MAX),
    @TotalTokensUsed int,
    @TotalCost decimal(18, 6),
    @TotalPromptTokensUsed int,
    @TotalCompletionTokensUsed int,
    @TotalTokensUsedRollup int,
    @TotalPromptTokensUsedRollup int,
    @TotalCompletionTokensUsedRollup int,
    @TotalCostRollup decimal(19, 8),
    @ConversationDetailID uniqueidentifier,
    @ConversationDetailSequence int,
    @CancellationReason nvarchar(30),
    @FinalStep nvarchar(30),
    @FinalPayload nvarchar(MAX),
    @Message nvarchar(MAX),
    @LastRunID uniqueidentifier,
    @StartingPayload nvarchar(MAX),
    @TotalPromptIterations int,
    @ConfigurationID uniqueidentifier,
    @OverrideModelID uniqueidentifier,
    @OverrideVendorID uniqueidentifier,
    @Data nvarchar(MAX),
    @Verbose bit,
    @EffortLevel int,
    @RunName nvarchar(255),
    @Comments nvarchar(MAX),
    @ScheduledJobRunID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRun]
    SET
        [AgentID] = @AgentID,
        [ParentRunID] = @ParentRunID,
        [Status] = @Status,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt,
        [Success] = @Success,
        [ErrorMessage] = @ErrorMessage,
        [ConversationID] = @ConversationID,
        [UserID] = @UserID,
        [Result] = @Result,
        [AgentState] = @AgentState,
        [TotalTokensUsed] = @TotalTokensUsed,
        [TotalCost] = @TotalCost,
        [TotalPromptTokensUsed] = @TotalPromptTokensUsed,
        [TotalCompletionTokensUsed] = @TotalCompletionTokensUsed,
        [TotalTokensUsedRollup] = @TotalTokensUsedRollup,
        [TotalPromptTokensUsedRollup] = @TotalPromptTokensUsedRollup,
        [TotalCompletionTokensUsedRollup] = @TotalCompletionTokensUsedRollup,
        [TotalCostRollup] = @TotalCostRollup,
        [ConversationDetailID] = @ConversationDetailID,
        [ConversationDetailSequence] = @ConversationDetailSequence,
        [CancellationReason] = @CancellationReason,
        [FinalStep] = @FinalStep,
        [FinalPayload] = @FinalPayload,
        [Message] = @Message,
        [LastRunID] = @LastRunID,
        [StartingPayload] = @StartingPayload,
        [TotalPromptIterations] = @TotalPromptIterations,
        [ConfigurationID] = @ConfigurationID,
        [OverrideModelID] = @OverrideModelID,
        [OverrideVendorID] = @OverrideVendorID,
        [Data] = @Data,
        [Verbose] = @Verbose,
        [EffortLevel] = @EffortLevel,
        [RunName] = @RunName,
        [Comments] = @Comments,
        [ScheduledJobRunID] = @ScheduledJobRunID
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwAIAgentRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwAIAgentRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateAIAgentRun
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateAIAgentRun
ON [${flyway:defaultSchema}].[AIAgentRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[AIAgentRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[AIAgentRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateAIAgentRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteAIAgentRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[AIAgentRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: AI Agent Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteAIAgentRun] TO [cdp_Integration]



/* Index for Foreign Keys for ScheduledJobRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Job Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ScheduledJobID in table ScheduledJobRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScheduledJobRun_ScheduledJobID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScheduledJobRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScheduledJobRun_ScheduledJobID ON [${flyway:defaultSchema}].[ScheduledJobRun] ([ScheduledJobID]);

-- Index for foreign key ExecutedByUserID in table ScheduledJobRun
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScheduledJobRun_ExecutedByUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScheduledJobRun]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScheduledJobRun_ExecutedByUserID ON [${flyway:defaultSchema}].[ScheduledJobRun] ([ExecutedByUserID]);

/* SQL text to update entity field related entity name field map for entity field ID D8C590C7-E726-4F2A-9ADC-7FAE0CB58600 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D8C590C7-E726-4F2A-9ADC-7FAE0CB58600',
         @RelatedEntityNameFieldMap='ScheduledJob'

/* Index for Foreign Keys for ScheduledJobType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Job Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Index for Foreign Keys for ScheduledJob */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key JobTypeID in table ScheduledJob
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScheduledJob_JobTypeID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScheduledJob]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScheduledJob_JobTypeID ON [${flyway:defaultSchema}].[ScheduledJob] ([JobTypeID]);

-- Index for foreign key OwnerUserID in table ScheduledJob
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScheduledJob_OwnerUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScheduledJob]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScheduledJob_OwnerUserID ON [${flyway:defaultSchema}].[ScheduledJob] ([OwnerUserID]);

-- Index for foreign key LastRunID in table ScheduledJob
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScheduledJob_LastRunID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScheduledJob]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScheduledJob_LastRunID ON [${flyway:defaultSchema}].[ScheduledJob] ([LastRunID]);

-- Index for foreign key NotifyUserID in table ScheduledJob
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScheduledJob_NotifyUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScheduledJob]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScheduledJob_NotifyUserID ON [${flyway:defaultSchema}].[ScheduledJob] ([NotifyUserID]);

/* SQL text to update entity field related entity name field map for entity field ID 80851C94-5AC0-4DE9-8A07-A84E3C545D6C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='80851C94-5AC0-4DE9-8A07-A84E3C545D6C',
         @RelatedEntityNameFieldMap='JobType'

/* Base View SQL for MJ: Scheduled Job Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Job Types
-- Item: vwScheduledJobTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Scheduled Job Types
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ScheduledJobType
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwScheduledJobTypes]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwScheduledJobTypes]
AS
SELECT
    s.*
FROM
    [${flyway:defaultSchema}].[ScheduledJobType] AS s
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwScheduledJobTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Scheduled Job Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Job Types
-- Item: Permissions for vwScheduledJobTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwScheduledJobTypes] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Scheduled Job Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Job Types
-- Item: spCreateScheduledJobType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ScheduledJobType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateScheduledJobType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledJobType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @DriverClass nvarchar(255),
    @DomainRunEntity nvarchar(255),
    @DomainRunEntityFKey nvarchar(100),
    @NotificationsAvailable bit
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ScheduledJobType]
            (
                [ID],
                [Name],
                [Description],
                [DriverClass],
                [DomainRunEntity],
                [DomainRunEntityFKey],
                [NotificationsAvailable]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @Name,
                @Description,
                @DriverClass,
                @DomainRunEntity,
                @DomainRunEntityFKey,
                @NotificationsAvailable
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ScheduledJobType]
            (
                [Name],
                [Description],
                [DriverClass],
                [DomainRunEntity],
                [DomainRunEntityFKey],
                [NotificationsAvailable]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @Name,
                @Description,
                @DriverClass,
                @DomainRunEntity,
                @DomainRunEntityFKey,
                @NotificationsAvailable
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwScheduledJobTypes] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScheduledJobType] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Scheduled Job Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScheduledJobType] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Scheduled Job Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Job Types
-- Item: spUpdateScheduledJobType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ScheduledJobType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateScheduledJobType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateScheduledJobType]
    @ID uniqueidentifier,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @DriverClass nvarchar(255),
    @DomainRunEntity nvarchar(255),
    @DomainRunEntityFKey nvarchar(100),
    @NotificationsAvailable bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScheduledJobType]
    SET
        [Name] = @Name,
        [Description] = @Description,
        [DriverClass] = @DriverClass,
        [DomainRunEntity] = @DomainRunEntity,
        [DomainRunEntityFKey] = @DomainRunEntityFKey,
        [NotificationsAvailable] = @NotificationsAvailable
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwScheduledJobTypes] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwScheduledJobTypes]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledJobType] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ScheduledJobType table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateScheduledJobType
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateScheduledJobType
ON [${flyway:defaultSchema}].[ScheduledJobType]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScheduledJobType]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ScheduledJobType] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Scheduled Job Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledJobType] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Scheduled Job Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Job Types
-- Item: spDeleteScheduledJobType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ScheduledJobType
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteScheduledJobType]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteScheduledJobType]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ScheduledJobType]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteScheduledJobType] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Scheduled Job Types */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteScheduledJobType] TO [cdp_Integration]



/* SQL text to update entity field related entity name field map for entity field ID 76AA6DE8-DACE-4243-800F-FDF6D7908A7C */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='76AA6DE8-DACE-4243-800F-FDF6D7908A7C',
         @RelatedEntityNameFieldMap='OwnerUser'

/* SQL text to update entity field related entity name field map for entity field ID 90A6E720-9E0E-40C0-AB0D-224D59B98A3E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='90A6E720-9E0E-40C0-AB0D-224D59B98A3E',
         @RelatedEntityNameFieldMap='ExecutedByUser'

/* SQL text to update entity field related entity name field map for entity field ID 0F32D762-AC95-4567-8741-AA332DA8B80B */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0F32D762-AC95-4567-8741-AA332DA8B80B',
         @RelatedEntityNameFieldMap='NotifyUser'

/* Base View SQL for MJ: Scheduled Job Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Job Runs
-- Item: vwScheduledJobRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Scheduled Job Runs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ScheduledJobRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwScheduledJobRuns]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwScheduledJobRuns]
AS
SELECT
    s.*,
    ScheduledJob_ScheduledJobID.[Name] AS [ScheduledJob],
    User_ExecutedByUserID.[Name] AS [ExecutedByUser]
FROM
    [${flyway:defaultSchema}].[ScheduledJobRun] AS s
INNER JOIN
    [${flyway:defaultSchema}].[ScheduledJob] AS ScheduledJob_ScheduledJobID
  ON
    [s].[ScheduledJobID] = ScheduledJob_ScheduledJobID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_ExecutedByUserID
  ON
    [s].[ExecutedByUserID] = User_ExecutedByUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwScheduledJobRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Scheduled Job Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Job Runs
-- Item: Permissions for vwScheduledJobRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwScheduledJobRuns] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Scheduled Job Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Job Runs
-- Item: spCreateScheduledJobRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ScheduledJobRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateScheduledJobRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledJobRun]
    @ID uniqueidentifier = NULL,
    @ScheduledJobID uniqueidentifier,
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @Status nvarchar(20),
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @Details nvarchar(MAX),
    @ExecutedByUserID uniqueidentifier,
    @QueuedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ScheduledJobRun]
            (
                [ID],
                [ScheduledJobID],
                [StartedAt],
                [CompletedAt],
                [Status],
                [Success],
                [ErrorMessage],
                [Details],
                [ExecutedByUserID],
                [QueuedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @ScheduledJobID,
                @StartedAt,
                @CompletedAt,
                @Status,
                @Success,
                @ErrorMessage,
                @Details,
                @ExecutedByUserID,
                @QueuedAt
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ScheduledJobRun]
            (
                [ScheduledJobID],
                [StartedAt],
                [CompletedAt],
                [Status],
                [Success],
                [ErrorMessage],
                [Details],
                [ExecutedByUserID],
                [QueuedAt]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ScheduledJobID,
                @StartedAt,
                @CompletedAt,
                @Status,
                @Success,
                @ErrorMessage,
                @Details,
                @ExecutedByUserID,
                @QueuedAt
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwScheduledJobRuns] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScheduledJobRun] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Scheduled Job Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScheduledJobRun] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Scheduled Job Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Job Runs
-- Item: spUpdateScheduledJobRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ScheduledJobRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateScheduledJobRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateScheduledJobRun]
    @ID uniqueidentifier,
    @ScheduledJobID uniqueidentifier,
    @StartedAt datetimeoffset,
    @CompletedAt datetimeoffset,
    @Status nvarchar(20),
    @Success bit,
    @ErrorMessage nvarchar(MAX),
    @Details nvarchar(MAX),
    @ExecutedByUserID uniqueidentifier,
    @QueuedAt datetimeoffset
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScheduledJobRun]
    SET
        [ScheduledJobID] = @ScheduledJobID,
        [StartedAt] = @StartedAt,
        [CompletedAt] = @CompletedAt,
        [Status] = @Status,
        [Success] = @Success,
        [ErrorMessage] = @ErrorMessage,
        [Details] = @Details,
        [ExecutedByUserID] = @ExecutedByUserID,
        [QueuedAt] = @QueuedAt
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwScheduledJobRuns] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwScheduledJobRuns]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledJobRun] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ScheduledJobRun table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateScheduledJobRun
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateScheduledJobRun
ON [${flyway:defaultSchema}].[ScheduledJobRun]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScheduledJobRun]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ScheduledJobRun] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Scheduled Job Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledJobRun] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Scheduled Job Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Job Runs
-- Item: spDeleteScheduledJobRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ScheduledJobRun
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteScheduledJobRun]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteScheduledJobRun]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ScheduledJobRun]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteScheduledJobRun] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Scheduled Job Runs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteScheduledJobRun] TO [cdp_Integration]



/* Base View SQL for MJ: Scheduled Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: vwScheduledJobs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Scheduled Jobs
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  ScheduledJob
-----               PRIMARY KEY: ID
------------------------------------------------------------
DROP VIEW IF EXISTS [${flyway:defaultSchema}].[vwScheduledJobs]
GO

CREATE VIEW [${flyway:defaultSchema}].[vwScheduledJobs]
AS
SELECT
    s.*,
    ScheduledJobType_JobTypeID.[Name] AS [JobType],
    User_OwnerUserID.[Name] AS [OwnerUser],
    User_NotifyUserID.[Name] AS [NotifyUser]
FROM
    [${flyway:defaultSchema}].[ScheduledJob] AS s
INNER JOIN
    [${flyway:defaultSchema}].[ScheduledJobType] AS ScheduledJobType_JobTypeID
  ON
    [s].[JobTypeID] = ScheduledJobType_JobTypeID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_OwnerUserID
  ON
    [s].[OwnerUserID] = User_OwnerUserID.[ID]
LEFT OUTER JOIN
    [${flyway:defaultSchema}].[User] AS User_NotifyUserID
  ON
    [s].[NotifyUserID] = User_NotifyUserID.[ID]
GO
GRANT SELECT ON [${flyway:defaultSchema}].[vwScheduledJobs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]
    

/* Base View Permissions SQL for MJ: Scheduled Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: Permissions for vwScheduledJobs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwScheduledJobs] TO [cdp_UI], [cdp_Developer], [cdp_Integration]

/* spCreate SQL for MJ: Scheduled Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: spCreateScheduledJob
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ScheduledJob
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spCreateScheduledJob]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledJob]
    @ID uniqueidentifier = NULL,
    @JobTypeID uniqueidentifier,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @CronExpression nvarchar(120),
    @Timezone nvarchar(64),
    @StartAt datetimeoffset,
    @EndAt datetimeoffset,
    @Status nvarchar(20),
    @Configuration nvarchar(MAX),
    @OwnerUserID uniqueidentifier,
    @LastRunID uniqueidentifier,
    @LastRunAt datetimeoffset,
    @NextRunAt datetimeoffset,
    @RunCount int,
    @SuccessCount int,
    @FailureCount int,
    @NotifyOnSuccess bit,
    @NotifyOnFailure bit,
    @NotifyUserID uniqueidentifier,
    @NotifyViaEmail bit,
    @NotifyViaInApp bit,
    @LockToken uniqueidentifier,
    @LockedAt datetimeoffset,
    @LockedByInstance nvarchar(255),
    @ExpectedCompletionAt datetimeoffset,
    @ConcurrencyMode nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[ScheduledJob]
            (
                [ID],
                [JobTypeID],
                [Name],
                [Description],
                [CronExpression],
                [Timezone],
                [StartAt],
                [EndAt],
                [Status],
                [Configuration],
                [OwnerUserID],
                [LastRunID],
                [LastRunAt],
                [NextRunAt],
                [RunCount],
                [SuccessCount],
                [FailureCount],
                [NotifyOnSuccess],
                [NotifyOnFailure],
                [NotifyUserID],
                [NotifyViaEmail],
                [NotifyViaInApp],
                [LockToken],
                [LockedAt],
                [LockedByInstance],
                [ExpectedCompletionAt],
                [ConcurrencyMode]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @JobTypeID,
                @Name,
                @Description,
                @CronExpression,
                @Timezone,
                @StartAt,
                @EndAt,
                @Status,
                @Configuration,
                @OwnerUserID,
                @LastRunID,
                @LastRunAt,
                @NextRunAt,
                @RunCount,
                @SuccessCount,
                @FailureCount,
                @NotifyOnSuccess,
                @NotifyOnFailure,
                @NotifyUserID,
                @NotifyViaEmail,
                @NotifyViaInApp,
                @LockToken,
                @LockedAt,
                @LockedByInstance,
                @ExpectedCompletionAt,
                @ConcurrencyMode
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[ScheduledJob]
            (
                [JobTypeID],
                [Name],
                [Description],
                [CronExpression],
                [Timezone],
                [StartAt],
                [EndAt],
                [Status],
                [Configuration],
                [OwnerUserID],
                [LastRunID],
                [LastRunAt],
                [NextRunAt],
                [RunCount],
                [SuccessCount],
                [FailureCount],
                [NotifyOnSuccess],
                [NotifyOnFailure],
                [NotifyUserID],
                [NotifyViaEmail],
                [NotifyViaInApp],
                [LockToken],
                [LockedAt],
                [LockedByInstance],
                [ExpectedCompletionAt],
                [ConcurrencyMode]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @JobTypeID,
                @Name,
                @Description,
                @CronExpression,
                @Timezone,
                @StartAt,
                @EndAt,
                @Status,
                @Configuration,
                @OwnerUserID,
                @LastRunID,
                @LastRunAt,
                @NextRunAt,
                @RunCount,
                @SuccessCount,
                @FailureCount,
                @NotifyOnSuccess,
                @NotifyOnFailure,
                @NotifyUserID,
                @NotifyViaEmail,
                @NotifyViaInApp,
                @LockToken,
                @LockedAt,
                @LockedByInstance,
                @ExpectedCompletionAt,
                @ConcurrencyMode
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwScheduledJobs] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScheduledJob] TO [cdp_Developer], [cdp_Integration]
    

/* spCreate Permissions for MJ: Scheduled Jobs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateScheduledJob] TO [cdp_Developer], [cdp_Integration]



/* spUpdate SQL for MJ: Scheduled Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: spUpdateScheduledJob
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ScheduledJob
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spUpdateScheduledJob]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateScheduledJob]
    @ID uniqueidentifier,
    @JobTypeID uniqueidentifier,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @CronExpression nvarchar(120),
    @Timezone nvarchar(64),
    @StartAt datetimeoffset,
    @EndAt datetimeoffset,
    @Status nvarchar(20),
    @Configuration nvarchar(MAX),
    @OwnerUserID uniqueidentifier,
    @LastRunID uniqueidentifier,
    @LastRunAt datetimeoffset,
    @NextRunAt datetimeoffset,
    @RunCount int,
    @SuccessCount int,
    @FailureCount int,
    @NotifyOnSuccess bit,
    @NotifyOnFailure bit,
    @NotifyUserID uniqueidentifier,
    @NotifyViaEmail bit,
    @NotifyViaInApp bit,
    @LockToken uniqueidentifier,
    @LockedAt datetimeoffset,
    @LockedByInstance nvarchar(255),
    @ExpectedCompletionAt datetimeoffset,
    @ConcurrencyMode nvarchar(20)
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScheduledJob]
    SET
        [JobTypeID] = @JobTypeID,
        [Name] = @Name,
        [Description] = @Description,
        [CronExpression] = @CronExpression,
        [Timezone] = @Timezone,
        [StartAt] = @StartAt,
        [EndAt] = @EndAt,
        [Status] = @Status,
        [Configuration] = @Configuration,
        [OwnerUserID] = @OwnerUserID,
        [LastRunID] = @LastRunID,
        [LastRunAt] = @LastRunAt,
        [NextRunAt] = @NextRunAt,
        [RunCount] = @RunCount,
        [SuccessCount] = @SuccessCount,
        [FailureCount] = @FailureCount,
        [NotifyOnSuccess] = @NotifyOnSuccess,
        [NotifyOnFailure] = @NotifyOnFailure,
        [NotifyUserID] = @NotifyUserID,
        [NotifyViaEmail] = @NotifyViaEmail,
        [NotifyViaInApp] = @NotifyViaInApp,
        [LockToken] = @LockToken,
        [LockedAt] = @LockedAt,
        [LockedByInstance] = @LockedByInstance,
        [ExpectedCompletionAt] = @ExpectedCompletionAt,
        [ConcurrencyMode] = @ConcurrencyMode
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwScheduledJobs] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwScheduledJobs]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledJob] TO [cdp_Developer], [cdp_Integration]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ScheduledJob table
------------------------------------------------------------
DROP TRIGGER IF EXISTS [${flyway:defaultSchema}].trgUpdateScheduledJob
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateScheduledJob
ON [${flyway:defaultSchema}].[ScheduledJob]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[ScheduledJob]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[ScheduledJob] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for MJ: Scheduled Jobs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledJob] TO [cdp_Developer], [cdp_Integration]



/* spDelete SQL for MJ: Scheduled Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: spDeleteScheduledJob
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ScheduledJob
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteScheduledJob]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteScheduledJob]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[ScheduledJob]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteScheduledJob] TO [cdp_Integration]
    

/* spDelete Permissions for MJ: Scheduled Jobs */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteScheduledJob] TO [cdp_Integration]



/* spDelete SQL for Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversation Details
-- Item: spDeleteConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetail
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversationDetail]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail
    DECLARE @ConversationDetailsID uniqueidentifier
    DECLARE @ConversationDetails_ConversationID uniqueidentifier
    DECLARE @ConversationDetails_ExternalID nvarchar(100)
    DECLARE @ConversationDetails_Role nvarchar(20)
    DECLARE @ConversationDetails_Message nvarchar(MAX)
    DECLARE @ConversationDetails_Error nvarchar(MAX)
    DECLARE @ConversationDetails_HiddenToUser bit
    DECLARE @ConversationDetails_UserRating int
    DECLARE @ConversationDetails_UserFeedback nvarchar(MAX)
    DECLARE @ConversationDetails_ReflectionInsights nvarchar(MAX)
    DECLARE @ConversationDetails_SummaryOfEarlierConversation nvarchar(MAX)
    DECLARE @ConversationDetails_UserID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactID uniqueidentifier
    DECLARE @ConversationDetails_ArtifactVersionID uniqueidentifier
    DECLARE @ConversationDetails_CompletionTime bigint
    DECLARE @ConversationDetails_IsPinned bit
    DECLARE @ConversationDetails_ParentID uniqueidentifier
    DECLARE @ConversationDetails_AgentID uniqueidentifier
    DECLARE @ConversationDetails_Status nvarchar(20)
    DECLARE cascade_update_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID], [ConversationID], [ExternalID], [Role], [Message], [Error], [HiddenToUser], [UserRating], [UserFeedback], [ReflectionInsights], [SummaryOfEarlierConversation], [UserID], [ArtifactID], [ArtifactVersionID], [CompletionTime], [IsPinned], [ParentID], [AgentID], [Status]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ParentID] = @ID
    
    OPEN cascade_update_ConversationDetails_cursor
    FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @ConversationDetails_ParentID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateConversationDetail] @ID = @ConversationDetailsID, @ConversationID = @ConversationDetails_ConversationID, @ExternalID = @ConversationDetails_ExternalID, @Role = @ConversationDetails_Role, @Message = @ConversationDetails_Message, @Error = @ConversationDetails_Error, @HiddenToUser = @ConversationDetails_HiddenToUser, @UserRating = @ConversationDetails_UserRating, @UserFeedback = @ConversationDetails_UserFeedback, @ReflectionInsights = @ConversationDetails_ReflectionInsights, @SummaryOfEarlierConversation = @ConversationDetails_SummaryOfEarlierConversation, @UserID = @ConversationDetails_UserID, @ArtifactID = @ConversationDetails_ArtifactID, @ArtifactVersionID = @ConversationDetails_ArtifactVersionID, @CompletionTime = @ConversationDetails_CompletionTime, @IsPinned = @ConversationDetails_IsPinned, @ParentID = @ConversationDetails_ParentID, @AgentID = @ConversationDetails_AgentID, @Status = @ConversationDetails_Status
        
        FETCH NEXT FROM cascade_update_ConversationDetails_cursor INTO @ConversationDetailsID, @ConversationDetails_ConversationID, @ConversationDetails_ExternalID, @ConversationDetails_Role, @ConversationDetails_Message, @ConversationDetails_Error, @ConversationDetails_HiddenToUser, @ConversationDetails_UserRating, @ConversationDetails_UserFeedback, @ConversationDetails_ReflectionInsights, @ConversationDetails_SummaryOfEarlierConversation, @ConversationDetails_UserID, @ConversationDetails_ArtifactID, @ConversationDetails_ArtifactVersionID, @ConversationDetails_CompletionTime, @ConversationDetails_IsPinned, @ConversationDetails_ParentID, @ConversationDetails_AgentID, @ConversationDetails_Status
    END
    
    CLOSE cascade_update_ConversationDetails_cursor
    DEALLOCATE cascade_update_ConversationDetails_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJ_AIAgentRunsID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ParentRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Status nvarchar(50)
    DECLARE @MJ_AIAgentRuns_StartedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_CompletedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_Success bit
    DECLARE @MJ_AIAgentRuns_ErrorMessage nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ConversationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_UserID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Result nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_AgentState nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCost decimal(18, 6)
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCostRollup decimal(19, 8)
    DECLARE @MJ_AIAgentRuns_ConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ConversationDetailSequence int
    DECLARE @MJ_AIAgentRuns_CancellationReason nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalStep nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Message nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_LastRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_StartingPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalPromptIterations int
    DECLARE @MJ_AIAgentRuns_ConfigurationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideModelID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideVendorID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Data nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Verbose bit
    DECLARE @MJ_AIAgentRuns_EffortLevel int
    DECLARE @MJ_AIAgentRuns_RunName nvarchar(255)
    DECLARE @MJ_AIAgentRuns_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ScheduledJobRunID uniqueidentifier
    DECLARE cascade_update_MJ_AIAgentRuns_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_AIAgentRuns_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentRuns_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJ_AIAgentRunsID, @AgentID = @MJ_AIAgentRuns_AgentID, @ParentRunID = @MJ_AIAgentRuns_ParentRunID, @Status = @MJ_AIAgentRuns_Status, @StartedAt = @MJ_AIAgentRuns_StartedAt, @CompletedAt = @MJ_AIAgentRuns_CompletedAt, @Success = @MJ_AIAgentRuns_Success, @ErrorMessage = @MJ_AIAgentRuns_ErrorMessage, @ConversationID = @MJ_AIAgentRuns_ConversationID, @UserID = @MJ_AIAgentRuns_UserID, @Result = @MJ_AIAgentRuns_Result, @AgentState = @MJ_AIAgentRuns_AgentState, @TotalTokensUsed = @MJ_AIAgentRuns_TotalTokensUsed, @TotalCost = @MJ_AIAgentRuns_TotalCost, @TotalPromptTokensUsed = @MJ_AIAgentRuns_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJ_AIAgentRuns_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJ_AIAgentRuns_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJ_AIAgentRuns_TotalCostRollup, @ConversationDetailID = @MJ_AIAgentRuns_ConversationDetailID, @ConversationDetailSequence = @MJ_AIAgentRuns_ConversationDetailSequence, @CancellationReason = @MJ_AIAgentRuns_CancellationReason, @FinalStep = @MJ_AIAgentRuns_FinalStep, @FinalPayload = @MJ_AIAgentRuns_FinalPayload, @Message = @MJ_AIAgentRuns_Message, @LastRunID = @MJ_AIAgentRuns_LastRunID, @StartingPayload = @MJ_AIAgentRuns_StartingPayload, @TotalPromptIterations = @MJ_AIAgentRuns_TotalPromptIterations, @ConfigurationID = @MJ_AIAgentRuns_ConfigurationID, @OverrideModelID = @MJ_AIAgentRuns_OverrideModelID, @OverrideVendorID = @MJ_AIAgentRuns_OverrideVendorID, @Data = @MJ_AIAgentRuns_Data, @Verbose = @MJ_AIAgentRuns_Verbose, @EffortLevel = @MJ_AIAgentRuns_EffortLevel, @RunName = @MJ_AIAgentRuns_RunName, @Comments = @MJ_AIAgentRuns_Comments, @ScheduledJobRunID = @MJ_AIAgentRuns_ScheduledJobRunID
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID
    END
    
    CLOSE cascade_update_MJ_AIAgentRuns_cursor
    DEALLOCATE cascade_update_MJ_AIAgentRuns_cursor
    
    -- Cascade delete from ConversationDetailArtifact using cursor to call spDeleteConversationDetailArtifact
    DECLARE @MJ_ConversationDetailArtifactsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationDetailArtifacts_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetailArtifact]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_delete_MJ_ConversationDetailArtifacts_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationDetailArtifacts_cursor INTO @MJ_ConversationDetailArtifactsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetailArtifact] @ID = @MJ_ConversationDetailArtifactsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationDetailArtifacts_cursor INTO @MJ_ConversationDetailArtifactsID
    END
    
    CLOSE cascade_delete_MJ_ConversationDetailArtifacts_cursor
    DEALLOCATE cascade_delete_MJ_ConversationDetailArtifacts_cursor
    
    -- Cascade update on Task using cursor to call spUpdateTask
    DECLARE @MJ_TasksID uniqueidentifier
    DECLARE @MJ_Tasks_ParentID uniqueidentifier
    DECLARE @MJ_Tasks_Name nvarchar(255)
    DECLARE @MJ_Tasks_Description nvarchar(MAX)
    DECLARE @MJ_Tasks_TypeID uniqueidentifier
    DECLARE @MJ_Tasks_EnvironmentID uniqueidentifier
    DECLARE @MJ_Tasks_ProjectID uniqueidentifier
    DECLARE @MJ_Tasks_ConversationDetailID uniqueidentifier
    DECLARE @MJ_Tasks_UserID uniqueidentifier
    DECLARE @MJ_Tasks_AgentID uniqueidentifier
    DECLARE @MJ_Tasks_Status nvarchar(50)
    DECLARE @MJ_Tasks_PercentComplete int
    DECLARE @MJ_Tasks_DueAt datetimeoffset
    DECLARE @MJ_Tasks_StartedAt datetimeoffset
    DECLARE @MJ_Tasks_CompletedAt datetimeoffset
    DECLARE cascade_update_MJ_Tasks_cursor CURSOR FOR 
        SELECT [ID], [ParentID], [Name], [Description], [TypeID], [EnvironmentID], [ProjectID], [ConversationDetailID], [UserID], [AgentID], [Status], [PercentComplete], [DueAt], [StartedAt], [CompletedAt]
        FROM [${flyway:defaultSchema}].[Task]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_MJ_Tasks_cursor
    FETCH NEXT FROM cascade_update_MJ_Tasks_cursor INTO @MJ_TasksID, @MJ_Tasks_ParentID, @MJ_Tasks_Name, @MJ_Tasks_Description, @MJ_Tasks_TypeID, @MJ_Tasks_EnvironmentID, @MJ_Tasks_ProjectID, @MJ_Tasks_ConversationDetailID, @MJ_Tasks_UserID, @MJ_Tasks_AgentID, @MJ_Tasks_Status, @MJ_Tasks_PercentComplete, @MJ_Tasks_DueAt, @MJ_Tasks_StartedAt, @MJ_Tasks_CompletedAt
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_Tasks_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateTask] @ID = @MJ_TasksID, @ParentID = @MJ_Tasks_ParentID, @Name = @MJ_Tasks_Name, @Description = @MJ_Tasks_Description, @TypeID = @MJ_Tasks_TypeID, @EnvironmentID = @MJ_Tasks_EnvironmentID, @ProjectID = @MJ_Tasks_ProjectID, @ConversationDetailID = @MJ_Tasks_ConversationDetailID, @UserID = @MJ_Tasks_UserID, @AgentID = @MJ_Tasks_AgentID, @Status = @MJ_Tasks_Status, @PercentComplete = @MJ_Tasks_PercentComplete, @DueAt = @MJ_Tasks_DueAt, @StartedAt = @MJ_Tasks_StartedAt, @CompletedAt = @MJ_Tasks_CompletedAt
        
        FETCH NEXT FROM cascade_update_MJ_Tasks_cursor INTO @MJ_TasksID, @MJ_Tasks_ParentID, @MJ_Tasks_Name, @MJ_Tasks_Description, @MJ_Tasks_TypeID, @MJ_Tasks_EnvironmentID, @MJ_Tasks_ProjectID, @MJ_Tasks_ConversationDetailID, @MJ_Tasks_UserID, @MJ_Tasks_AgentID, @MJ_Tasks_Status, @MJ_Tasks_PercentComplete, @MJ_Tasks_DueAt, @MJ_Tasks_StartedAt, @MJ_Tasks_CompletedAt
    END
    
    CLOSE cascade_update_MJ_Tasks_cursor
    DEALLOCATE cascade_update_MJ_Tasks_cursor
    
    -- Cascade update on Report using cursor to call spUpdateReport
    DECLARE @ReportsID uniqueidentifier
    DECLARE @Reports_Name nvarchar(255)
    DECLARE @Reports_Description nvarchar(MAX)
    DECLARE @Reports_CategoryID uniqueidentifier
    DECLARE @Reports_UserID uniqueidentifier
    DECLARE @Reports_SharingScope nvarchar(20)
    DECLARE @Reports_ConversationID uniqueidentifier
    DECLARE @Reports_ConversationDetailID uniqueidentifier
    DECLARE @Reports_DataContextID uniqueidentifier
    DECLARE @Reports_Configuration nvarchar(MAX)
    DECLARE @Reports_OutputTriggerTypeID uniqueidentifier
    DECLARE @Reports_OutputFormatTypeID uniqueidentifier
    DECLARE @Reports_OutputDeliveryTypeID uniqueidentifier
    DECLARE @Reports_OutputFrequency nvarchar(50)
    DECLARE @Reports_OutputTargetEmail nvarchar(255)
    DECLARE @Reports_OutputWorkflowID uniqueidentifier
    DECLARE @Reports_Thumbnail nvarchar(MAX)
    DECLARE @Reports_EnvironmentID uniqueidentifier
    DECLARE cascade_update_Reports_cursor CURSOR FOR 
        SELECT [ID], [Name], [Description], [CategoryID], [UserID], [SharingScope], [ConversationID], [ConversationDetailID], [DataContextID], [Configuration], [OutputTriggerTypeID], [OutputFormatTypeID], [OutputDeliveryTypeID], [OutputFrequency], [OutputTargetEmail], [OutputWorkflowID], [Thumbnail], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Report]
        WHERE [ConversationDetailID] = @ID
    
    OPEN cascade_update_Reports_cursor
    FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @Reports_ConversationDetailID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateReport] @ID = @ReportsID, @Name = @Reports_Name, @Description = @Reports_Description, @CategoryID = @Reports_CategoryID, @UserID = @Reports_UserID, @SharingScope = @Reports_SharingScope, @ConversationID = @Reports_ConversationID, @ConversationDetailID = @Reports_ConversationDetailID, @DataContextID = @Reports_DataContextID, @Configuration = @Reports_Configuration, @OutputTriggerTypeID = @Reports_OutputTriggerTypeID, @OutputFormatTypeID = @Reports_OutputFormatTypeID, @OutputDeliveryTypeID = @Reports_OutputDeliveryTypeID, @OutputFrequency = @Reports_OutputFrequency, @OutputTargetEmail = @Reports_OutputTargetEmail, @OutputWorkflowID = @Reports_OutputWorkflowID, @Thumbnail = @Reports_Thumbnail, @EnvironmentID = @Reports_EnvironmentID
        
        FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    END
    
    CLOSE cascade_update_Reports_cursor
    DEALLOCATE cascade_update_Reports_cursor
    

    DELETE FROM
        [${flyway:defaultSchema}].[ConversationDetail]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spDelete Permissions for Conversation Details */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversationDetail] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* spDelete SQL for Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Conversations
-- Item: spDeleteConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Conversation
------------------------------------------------------------
DROP PROCEDURE IF EXISTS [${flyway:defaultSchema}].[spDeleteConversation]
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteConversation]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;
    -- Cascade delete from ConversationDetail using cursor to call spDeleteConversationDetail
    DECLARE @ConversationDetailsID uniqueidentifier
    DECLARE cascade_delete_ConversationDetails_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationDetail]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_ConversationDetails_cursor
    FETCH NEXT FROM cascade_delete_ConversationDetails_cursor INTO @ConversationDetailsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationDetail] @ID = @ConversationDetailsID
        
        FETCH NEXT FROM cascade_delete_ConversationDetails_cursor INTO @ConversationDetailsID
    END
    
    CLOSE cascade_delete_ConversationDetails_cursor
    DEALLOCATE cascade_delete_ConversationDetails_cursor
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun
    DECLARE @MJ_AIAgentRunsID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_AgentID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ParentRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Status nvarchar(50)
    DECLARE @MJ_AIAgentRuns_StartedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_CompletedAt datetimeoffset
    DECLARE @MJ_AIAgentRuns_Success bit
    DECLARE @MJ_AIAgentRuns_ErrorMessage nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ConversationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_UserID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Result nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_AgentState nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCost decimal(18, 6)
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsed int
    DECLARE @MJ_AIAgentRuns_TotalTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalPromptTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup int
    DECLARE @MJ_AIAgentRuns_TotalCostRollup decimal(19, 8)
    DECLARE @MJ_AIAgentRuns_ConversationDetailID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_ConversationDetailSequence int
    DECLARE @MJ_AIAgentRuns_CancellationReason nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalStep nvarchar(30)
    DECLARE @MJ_AIAgentRuns_FinalPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Message nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_LastRunID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_StartingPayload nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_TotalPromptIterations int
    DECLARE @MJ_AIAgentRuns_ConfigurationID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideModelID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_OverrideVendorID uniqueidentifier
    DECLARE @MJ_AIAgentRuns_Data nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_Verbose bit
    DECLARE @MJ_AIAgentRuns_EffortLevel int
    DECLARE @MJ_AIAgentRuns_RunName nvarchar(255)
    DECLARE @MJ_AIAgentRuns_Comments nvarchar(MAX)
    DECLARE @MJ_AIAgentRuns_ScheduledJobRunID uniqueidentifier
    DECLARE cascade_update_MJ_AIAgentRuns_cursor CURSOR FOR 
        SELECT [ID], [AgentID], [ParentRunID], [Status], [StartedAt], [CompletedAt], [Success], [ErrorMessage], [ConversationID], [UserID], [Result], [AgentState], [TotalTokensUsed], [TotalCost], [TotalPromptTokensUsed], [TotalCompletionTokensUsed], [TotalTokensUsedRollup], [TotalPromptTokensUsedRollup], [TotalCompletionTokensUsedRollup], [TotalCostRollup], [ConversationDetailID], [ConversationDetailSequence], [CancellationReason], [FinalStep], [FinalPayload], [Message], [LastRunID], [StartingPayload], [TotalPromptIterations], [ConfigurationID], [OverrideModelID], [OverrideVendorID], [Data], [Verbose], [EffortLevel], [RunName], [Comments], [ScheduledJobRunID]
        FROM [${flyway:defaultSchema}].[AIAgentRun]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_update_MJ_AIAgentRuns_cursor
    FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @MJ_AIAgentRuns_ConversationID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateAIAgentRun] @ID = @MJ_AIAgentRunsID, @AgentID = @MJ_AIAgentRuns_AgentID, @ParentRunID = @MJ_AIAgentRuns_ParentRunID, @Status = @MJ_AIAgentRuns_Status, @StartedAt = @MJ_AIAgentRuns_StartedAt, @CompletedAt = @MJ_AIAgentRuns_CompletedAt, @Success = @MJ_AIAgentRuns_Success, @ErrorMessage = @MJ_AIAgentRuns_ErrorMessage, @ConversationID = @MJ_AIAgentRuns_ConversationID, @UserID = @MJ_AIAgentRuns_UserID, @Result = @MJ_AIAgentRuns_Result, @AgentState = @MJ_AIAgentRuns_AgentState, @TotalTokensUsed = @MJ_AIAgentRuns_TotalTokensUsed, @TotalCost = @MJ_AIAgentRuns_TotalCost, @TotalPromptTokensUsed = @MJ_AIAgentRuns_TotalPromptTokensUsed, @TotalCompletionTokensUsed = @MJ_AIAgentRuns_TotalCompletionTokensUsed, @TotalTokensUsedRollup = @MJ_AIAgentRuns_TotalTokensUsedRollup, @TotalPromptTokensUsedRollup = @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @TotalCompletionTokensUsedRollup = @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @TotalCostRollup = @MJ_AIAgentRuns_TotalCostRollup, @ConversationDetailID = @MJ_AIAgentRuns_ConversationDetailID, @ConversationDetailSequence = @MJ_AIAgentRuns_ConversationDetailSequence, @CancellationReason = @MJ_AIAgentRuns_CancellationReason, @FinalStep = @MJ_AIAgentRuns_FinalStep, @FinalPayload = @MJ_AIAgentRuns_FinalPayload, @Message = @MJ_AIAgentRuns_Message, @LastRunID = @MJ_AIAgentRuns_LastRunID, @StartingPayload = @MJ_AIAgentRuns_StartingPayload, @TotalPromptIterations = @MJ_AIAgentRuns_TotalPromptIterations, @ConfigurationID = @MJ_AIAgentRuns_ConfigurationID, @OverrideModelID = @MJ_AIAgentRuns_OverrideModelID, @OverrideVendorID = @MJ_AIAgentRuns_OverrideVendorID, @Data = @MJ_AIAgentRuns_Data, @Verbose = @MJ_AIAgentRuns_Verbose, @EffortLevel = @MJ_AIAgentRuns_EffortLevel, @RunName = @MJ_AIAgentRuns_RunName, @Comments = @MJ_AIAgentRuns_Comments, @ScheduledJobRunID = @MJ_AIAgentRuns_ScheduledJobRunID
        
        FETCH NEXT FROM cascade_update_MJ_AIAgentRuns_cursor INTO @MJ_AIAgentRunsID, @MJ_AIAgentRuns_AgentID, @MJ_AIAgentRuns_ParentRunID, @MJ_AIAgentRuns_Status, @MJ_AIAgentRuns_StartedAt, @MJ_AIAgentRuns_CompletedAt, @MJ_AIAgentRuns_Success, @MJ_AIAgentRuns_ErrorMessage, @MJ_AIAgentRuns_ConversationID, @MJ_AIAgentRuns_UserID, @MJ_AIAgentRuns_Result, @MJ_AIAgentRuns_AgentState, @MJ_AIAgentRuns_TotalTokensUsed, @MJ_AIAgentRuns_TotalCost, @MJ_AIAgentRuns_TotalPromptTokensUsed, @MJ_AIAgentRuns_TotalCompletionTokensUsed, @MJ_AIAgentRuns_TotalTokensUsedRollup, @MJ_AIAgentRuns_TotalPromptTokensUsedRollup, @MJ_AIAgentRuns_TotalCompletionTokensUsedRollup, @MJ_AIAgentRuns_TotalCostRollup, @MJ_AIAgentRuns_ConversationDetailID, @MJ_AIAgentRuns_ConversationDetailSequence, @MJ_AIAgentRuns_CancellationReason, @MJ_AIAgentRuns_FinalStep, @MJ_AIAgentRuns_FinalPayload, @MJ_AIAgentRuns_Message, @MJ_AIAgentRuns_LastRunID, @MJ_AIAgentRuns_StartingPayload, @MJ_AIAgentRuns_TotalPromptIterations, @MJ_AIAgentRuns_ConfigurationID, @MJ_AIAgentRuns_OverrideModelID, @MJ_AIAgentRuns_OverrideVendorID, @MJ_AIAgentRuns_Data, @MJ_AIAgentRuns_Verbose, @MJ_AIAgentRuns_EffortLevel, @MJ_AIAgentRuns_RunName, @MJ_AIAgentRuns_Comments, @MJ_AIAgentRuns_ScheduledJobRunID
    END
    
    CLOSE cascade_update_MJ_AIAgentRuns_cursor
    DEALLOCATE cascade_update_MJ_AIAgentRuns_cursor
    
    -- Cascade delete from ConversationArtifact using cursor to call spDeleteConversationArtifact
    DECLARE @MJ_ConversationArtifactsID uniqueidentifier
    DECLARE cascade_delete_MJ_ConversationArtifacts_cursor CURSOR FOR 
        SELECT [ID]
        FROM [${flyway:defaultSchema}].[ConversationArtifact]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_delete_MJ_ConversationArtifacts_cursor
    FETCH NEXT FROM cascade_delete_MJ_ConversationArtifacts_cursor INTO @MJ_ConversationArtifactsID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Call the delete SP for the related entity, which handles its own cascades
        EXEC [${flyway:defaultSchema}].[spDeleteConversationArtifact] @ID = @MJ_ConversationArtifactsID
        
        FETCH NEXT FROM cascade_delete_MJ_ConversationArtifacts_cursor INTO @MJ_ConversationArtifactsID
    END
    
    CLOSE cascade_delete_MJ_ConversationArtifacts_cursor
    DEALLOCATE cascade_delete_MJ_ConversationArtifacts_cursor
    
    -- Cascade update on Report using cursor to call spUpdateReport
    DECLARE @ReportsID uniqueidentifier
    DECLARE @Reports_Name nvarchar(255)
    DECLARE @Reports_Description nvarchar(MAX)
    DECLARE @Reports_CategoryID uniqueidentifier
    DECLARE @Reports_UserID uniqueidentifier
    DECLARE @Reports_SharingScope nvarchar(20)
    DECLARE @Reports_ConversationID uniqueidentifier
    DECLARE @Reports_ConversationDetailID uniqueidentifier
    DECLARE @Reports_DataContextID uniqueidentifier
    DECLARE @Reports_Configuration nvarchar(MAX)
    DECLARE @Reports_OutputTriggerTypeID uniqueidentifier
    DECLARE @Reports_OutputFormatTypeID uniqueidentifier
    DECLARE @Reports_OutputDeliveryTypeID uniqueidentifier
    DECLARE @Reports_OutputFrequency nvarchar(50)
    DECLARE @Reports_OutputTargetEmail nvarchar(255)
    DECLARE @Reports_OutputWorkflowID uniqueidentifier
    DECLARE @Reports_Thumbnail nvarchar(MAX)
    DECLARE @Reports_EnvironmentID uniqueidentifier
    DECLARE cascade_update_Reports_cursor CURSOR FOR 
        SELECT [ID], [Name], [Description], [CategoryID], [UserID], [SharingScope], [ConversationID], [ConversationDetailID], [DataContextID], [Configuration], [OutputTriggerTypeID], [OutputFormatTypeID], [OutputDeliveryTypeID], [OutputFrequency], [OutputTargetEmail], [OutputWorkflowID], [Thumbnail], [EnvironmentID]
        FROM [${flyway:defaultSchema}].[Report]
        WHERE [ConversationID] = @ID
    
    OPEN cascade_update_Reports_cursor
    FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    
    WHILE @@FETCH_STATUS = 0
    BEGIN
        -- Set the FK field to NULL
        SET @Reports_ConversationID = NULL
        
        -- Call the update SP for the related entity
        EXEC [${flyway:defaultSchema}].[spUpdateReport] @ID = @ReportsID, @Name = @Reports_Name, @Description = @Reports_Description, @CategoryID = @Reports_CategoryID, @UserID = @Reports_UserID, @SharingScope = @Reports_SharingScope, @ConversationID = @Reports_ConversationID, @ConversationDetailID = @Reports_ConversationDetailID, @DataContextID = @Reports_DataContextID, @Configuration = @Reports_Configuration, @OutputTriggerTypeID = @Reports_OutputTriggerTypeID, @OutputFormatTypeID = @Reports_OutputFormatTypeID, @OutputDeliveryTypeID = @Reports_OutputDeliveryTypeID, @OutputFrequency = @Reports_OutputFrequency, @OutputTargetEmail = @Reports_OutputTargetEmail, @OutputWorkflowID = @Reports_OutputWorkflowID, @Thumbnail = @Reports_Thumbnail, @EnvironmentID = @Reports_EnvironmentID
        
        FETCH NEXT FROM cascade_update_Reports_cursor INTO @ReportsID, @Reports_Name, @Reports_Description, @Reports_CategoryID, @Reports_UserID, @Reports_SharingScope, @Reports_ConversationID, @Reports_ConversationDetailID, @Reports_DataContextID, @Reports_Configuration, @Reports_OutputTriggerTypeID, @Reports_OutputFormatTypeID, @Reports_OutputDeliveryTypeID, @Reports_OutputFrequency, @Reports_OutputTargetEmail, @Reports_OutputWorkflowID, @Reports_Thumbnail, @Reports_EnvironmentID
    END
    
    CLOSE cascade_update_Reports_cursor
    DEALLOCATE cascade_update_Reports_cursor
    

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
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]
    

/* spDelete Permissions for Conversations */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteConversation] TO [cdp_Developer], [cdp_UI], [cdp_Integration]



/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '80bf04b1-c88a-4e23-a343-0c9b09207c93'  OR 
               (EntityID = '257A461E-AC75-4AE5-AADC-124D2CA1F383' AND Name = 'ScheduledJob')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '80bf04b1-c88a-4e23-a343-0c9b09207c93',
            '257A461E-AC75-4AE5-AADC-124D2CA1F383', -- Entity: MJ: Scheduled Job Runs
            100025,
            'ScheduledJob',
            'Scheduled Job',
            NULL,
            'nvarchar',
            400,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '59887993-956a-4364-bd2e-78730656c38d'  OR 
               (EntityID = '257A461E-AC75-4AE5-AADC-124D2CA1F383' AND Name = 'ExecutedByUser')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '59887993-956a-4364-bd2e-78730656c38d',
            '257A461E-AC75-4AE5-AADC-124D2CA1F383', -- Entity: MJ: Scheduled Job Runs
            100026,
            'ExecutedByUser',
            'Executed By User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '7b677da7-bb9d-4e7d-994e-ea2d498bee8b'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'JobType')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '7b677da7-bb9d-4e7d-994e-ea2d498bee8b',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100059,
            'JobType',
            'Job Type',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            0,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '5e807b26-e743-4f10-ad40-9db1bd298630'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'OwnerUser')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '5e807b26-e743-4f10-ad40-9db1bd298630',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100060,
            'OwnerUser',
            'Owner User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* SQL text to insert new entity field */

      IF NOT EXISTS (
         SELECT 1 FROM [${flyway:defaultSchema}].EntityField 
         WHERE ID = '77611f73-1175-4d08-bb11-316df7bed3c6'  OR 
               (EntityID = '302A55B5-AEF0-4C57-8F35-73EE6B17E234' AND Name = 'NotifyUser')
         -- check to make sure we're not inserting a duplicate entity field metadata record
      )
      BEGIN
         INSERT INTO [${flyway:defaultSchema}].EntityField
         (
            ID,
            EntityID,
            Sequence,
            Name,
            DisplayName,
            Description,
            Type,
            Length,
            Precision,
            Scale,
            AllowsNull,
            DefaultValue,
            AutoIncrement,
            AllowUpdateAPI,
            IsVirtual,
            RelatedEntityID,
            RelatedEntityFieldName,
            IsNameField,
            IncludeInUserSearchAPI,
            IncludeRelatedEntityNameFieldInBaseView,
            DefaultInView,
            IsPrimaryKey,
            IsUnique,
            RelatedEntityDisplayType
         )
         VALUES
         (
            '77611f73-1175-4d08-bb11-316df7bed3c6',
            '302A55B5-AEF0-4C57-8F35-73EE6B17E234', -- Entity: MJ: Scheduled Jobs
            100061,
            'NotifyUser',
            'Notify User',
            NULL,
            'nvarchar',
            200,
            0,
            0,
            1,
            'null',
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
            'Search'
         )
      END

/* Generated Validation Functions for MJ: Scheduled Job Runs */
-- CHECK constraint for MJ: Scheduled Job Runs: Field: Details was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Details] IS NULL OR isjson([Details])=(1))', 'public ValidateDetailsIfPresentMustBeJson(result: ValidationResult) {
	if (this.Details !== null && typeof this.Details === "string" && this.Details.trim() !== "") {
		try {
			JSON.parse(this.Details);
		} catch (e) {
			result.Errors.push(new ValidationErrorInfo("Details", "The Details field must contain valid JSON if it is provided.", this.Details, ValidationErrorType.Failure));
		}
	}
}', 'This rule ensures that if there is any information in the Details field, it must be valid JSON data. If the Details field is empty, this rule is always satisfied.', 'ValidateDetailsIfPresentMustBeJson', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '8509832E-7783-4129-8493-1327FDDB1FF7');
  
            

/* Generated Validation Functions for MJ: Scheduled Jobs */
-- CHECK constraint for MJ: Scheduled Jobs: Field: Configuration was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Configuration] IS NULL OR isjson([Configuration])=(1))', 'public ValidateConfigurationIsJson(result: ValidationResult) {
	if (this.Configuration !== null && typeof this.Configuration === "string") {
		try {
			JSON.parse(this.Configuration);
		} catch (e) {
			result.Errors.push(new ValidationErrorInfo("Configuration", "When provided, the Configuration field must contain valid JSON.", this.Configuration, ValidationErrorType.Failure));
		}
	}
}', 'This rule ensures that if the Configuration field is not empty, it must contain valid JSON data.', 'ValidateConfigurationIsJson', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '0475C76C-F2CC-47CF-9751-3E4DD9C9A177');
  
            

