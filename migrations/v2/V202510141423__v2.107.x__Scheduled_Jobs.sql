/******************************************************************************************
* MemberJunction Migration - Scheduled Jobs System
*
* Description: Creates a generic scheduling infrastructure that supports multiple job types
*              through a plugin architecture. Includes ScheduledJobType registry,
*              ScheduledJob configuration, and ScheduledJobRun execution history.
*
* Version: 2.107.x
* Date: 2025-10-14
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
         '05853432-5e13-4f2a-8618-77857adf17fa',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '05853432-5e13-4f2a-8618-77857adf17fa', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Scheduled Job Runs for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('05853432-5e13-4f2a-8618-77857adf17fa', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Scheduled Job Runs for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('05853432-5e13-4f2a-8618-77857adf17fa', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Scheduled Job Runs for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('05853432-5e13-4f2a-8618-77857adf17fa', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         '33e01250-c0fe-4b35-af8f-a4f444490065',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', '33e01250-c0fe-4b35-af8f-a4f444490065', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Scheduled Job Types for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('33e01250-c0fe-4b35-af8f-a4f444490065', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Scheduled Job Types for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('33e01250-c0fe-4b35-af8f-a4f444490065', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Scheduled Job Types for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('33e01250-c0fe-4b35-af8f-a4f444490065', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         'f48d2e6c-61c8-46b8-a617-c8228601eb3c',
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
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'f48d2e6c-61c8-46b8-a617-c8228601eb3c', (SELECT ISNULL(MAX(Sequence),0)+1 FROM ${flyway:defaultSchema}.ApplicationEntity WHERE ApplicationID = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'))

/* SQL generated to add new permission for entity MJ: Scheduled Jobs for role UI */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f48d2e6c-61c8-46b8-a617-c8228601eb3c', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 0, 0, 0)

/* SQL generated to add new permission for entity MJ: Scheduled Jobs for role Developer */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f48d2e6c-61c8-46b8-a617-c8228601eb3c', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 0)

/* SQL generated to add new permission for entity MJ: Scheduled Jobs for role Integration */
INSERT INTO ${flyway:defaultSchema}.EntityPermission
                                                   (EntityID, RoleID, CanRead, CanCreate, CanUpdate, CanDelete) VALUES
                                                   ('f48d2e6c-61c8-46b8-a617-c8228601eb3c', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', 1, 1, 1, 1)

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
         WHERE ID = '77918e52-6ba1-4fa6-9ae1-f5987906d0c8'  OR 
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
            '77918e52-6ba1-4fa6-9ae1-f5987906d0c8',
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
            '05853432-5E13-4F2A-8618-77857ADF17FA',
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
         WHERE ID = '4bf98789-c7d3-4515-a980-17ca936545b7'  OR 
               (EntityID = '05853432-5E13-4F2A-8618-77857ADF17FA' AND Name = 'ID')
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
            '4bf98789-c7d3-4515-a980-17ca936545b7',
            '05853432-5E13-4F2A-8618-77857ADF17FA', -- Entity: MJ: Scheduled Job Runs
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
         WHERE ID = 'a8f8edbb-8304-4738-92da-6186f220eb94'  OR 
               (EntityID = '05853432-5E13-4F2A-8618-77857ADF17FA' AND Name = 'ScheduledJobID')
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
            'a8f8edbb-8304-4738-92da-6186f220eb94',
            '05853432-5E13-4F2A-8618-77857ADF17FA', -- Entity: MJ: Scheduled Job Runs
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
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C',
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
         WHERE ID = '257da11e-68b7-475e-9710-5c27d5805365'  OR 
               (EntityID = '05853432-5E13-4F2A-8618-77857ADF17FA' AND Name = 'StartedAt')
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
            '257da11e-68b7-475e-9710-5c27d5805365',
            '05853432-5E13-4F2A-8618-77857ADF17FA', -- Entity: MJ: Scheduled Job Runs
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
         WHERE ID = 'e4460981-1ab2-421e-953f-aea182e2bcf7'  OR 
               (EntityID = '05853432-5E13-4F2A-8618-77857ADF17FA' AND Name = 'CompletedAt')
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
            'e4460981-1ab2-421e-953f-aea182e2bcf7',
            '05853432-5E13-4F2A-8618-77857ADF17FA', -- Entity: MJ: Scheduled Job Runs
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
         WHERE ID = '9b974e30-454a-4f22-977e-efcc7114683a'  OR 
               (EntityID = '05853432-5E13-4F2A-8618-77857ADF17FA' AND Name = 'Status')
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
            '9b974e30-454a-4f22-977e-efcc7114683a',
            '05853432-5E13-4F2A-8618-77857ADF17FA', -- Entity: MJ: Scheduled Job Runs
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
         WHERE ID = 'c5f7c0ab-98b5-4251-b8ce-1a04a073df81'  OR 
               (EntityID = '05853432-5E13-4F2A-8618-77857ADF17FA' AND Name = 'Success')
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
            'c5f7c0ab-98b5-4251-b8ce-1a04a073df81',
            '05853432-5E13-4F2A-8618-77857ADF17FA', -- Entity: MJ: Scheduled Job Runs
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
         WHERE ID = '6f7f73d4-6e65-42a8-b9eb-8182c0851c97'  OR 
               (EntityID = '05853432-5E13-4F2A-8618-77857ADF17FA' AND Name = 'ErrorMessage')
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
            '6f7f73d4-6e65-42a8-b9eb-8182c0851c97',
            '05853432-5E13-4F2A-8618-77857ADF17FA', -- Entity: MJ: Scheduled Job Runs
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
         WHERE ID = '796599ef-b0c9-474c-845b-7c030b55159f'  OR 
               (EntityID = '05853432-5E13-4F2A-8618-77857ADF17FA' AND Name = 'Details')
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
            '796599ef-b0c9-474c-845b-7c030b55159f',
            '05853432-5E13-4F2A-8618-77857ADF17FA', -- Entity: MJ: Scheduled Job Runs
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
         WHERE ID = '6a782ba2-97df-45e0-9060-8fa0c9cd8c43'  OR 
               (EntityID = '05853432-5E13-4F2A-8618-77857ADF17FA' AND Name = 'ExecutedByUserID')
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
            '6a782ba2-97df-45e0-9060-8fa0c9cd8c43',
            '05853432-5E13-4F2A-8618-77857ADF17FA', -- Entity: MJ: Scheduled Job Runs
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
         WHERE ID = 'fd44bd10-011e-4b64-a9e1-0348660499d4'  OR 
               (EntityID = '05853432-5E13-4F2A-8618-77857ADF17FA' AND Name = 'QueuedAt')
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
            'fd44bd10-011e-4b64-a9e1-0348660499d4',
            '05853432-5E13-4F2A-8618-77857ADF17FA', -- Entity: MJ: Scheduled Job Runs
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
         WHERE ID = 'db448dc4-a2d1-43f9-a932-07ba0d224c9a'  OR 
               (EntityID = '05853432-5E13-4F2A-8618-77857ADF17FA' AND Name = '__mj_CreatedAt')
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
            'db448dc4-a2d1-43f9-a932-07ba0d224c9a',
            '05853432-5E13-4F2A-8618-77857ADF17FA', -- Entity: MJ: Scheduled Job Runs
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
         WHERE ID = '92729f75-665e-4fc0-a997-6fc7843d5b07'  OR 
               (EntityID = '05853432-5E13-4F2A-8618-77857ADF17FA' AND Name = '__mj_UpdatedAt')
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
            '92729f75-665e-4fc0-a997-6fc7843d5b07',
            '05853432-5E13-4F2A-8618-77857ADF17FA', -- Entity: MJ: Scheduled Job Runs
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
         WHERE ID = 'a3cdfb40-ff2d-4c59-a7ad-5c284b498ab6'  OR 
               (EntityID = '33E01250-C0FE-4B35-AF8F-A4F444490065' AND Name = 'ID')
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
            'a3cdfb40-ff2d-4c59-a7ad-5c284b498ab6',
            '33E01250-C0FE-4B35-AF8F-A4F444490065', -- Entity: MJ: Scheduled Job Types
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
         WHERE ID = '532e7665-6b66-4e22-a326-a4d5ee119eea'  OR 
               (EntityID = '33E01250-C0FE-4B35-AF8F-A4F444490065' AND Name = 'Name')
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
            '532e7665-6b66-4e22-a326-a4d5ee119eea',
            '33E01250-C0FE-4B35-AF8F-A4F444490065', -- Entity: MJ: Scheduled Job Types
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
         WHERE ID = '7c04e794-ef4b-4d80-a810-452b542ac4e1'  OR 
               (EntityID = '33E01250-C0FE-4B35-AF8F-A4F444490065' AND Name = 'Description')
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
            '7c04e794-ef4b-4d80-a810-452b542ac4e1',
            '33E01250-C0FE-4B35-AF8F-A4F444490065', -- Entity: MJ: Scheduled Job Types
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
         WHERE ID = '4fd18ef8-7a48-40d2-8b84-a853e1fd4fc7'  OR 
               (EntityID = '33E01250-C0FE-4B35-AF8F-A4F444490065' AND Name = 'DriverClass')
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
            '4fd18ef8-7a48-40d2-8b84-a853e1fd4fc7',
            '33E01250-C0FE-4B35-AF8F-A4F444490065', -- Entity: MJ: Scheduled Job Types
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
         WHERE ID = '614c9f85-ccab-44d2-865c-37f59ff04a09'  OR 
               (EntityID = '33E01250-C0FE-4B35-AF8F-A4F444490065' AND Name = 'DomainRunEntity')
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
            '614c9f85-ccab-44d2-865c-37f59ff04a09',
            '33E01250-C0FE-4B35-AF8F-A4F444490065', -- Entity: MJ: Scheduled Job Types
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
         WHERE ID = '40ee05c3-83bd-4fd8-80fc-7ad82967e376'  OR 
               (EntityID = '33E01250-C0FE-4B35-AF8F-A4F444490065' AND Name = 'DomainRunEntityFKey')
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
            '40ee05c3-83bd-4fd8-80fc-7ad82967e376',
            '33E01250-C0FE-4B35-AF8F-A4F444490065', -- Entity: MJ: Scheduled Job Types
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
         WHERE ID = 'e96901de-c9a4-4175-8357-1ad36d4f01e8'  OR 
               (EntityID = '33E01250-C0FE-4B35-AF8F-A4F444490065' AND Name = 'NotificationsAvailable')
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
            'e96901de-c9a4-4175-8357-1ad36d4f01e8',
            '33E01250-C0FE-4B35-AF8F-A4F444490065', -- Entity: MJ: Scheduled Job Types
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
         WHERE ID = 'a7dadef6-7749-403a-8ebd-f967037a582d'  OR 
               (EntityID = '33E01250-C0FE-4B35-AF8F-A4F444490065' AND Name = '__mj_CreatedAt')
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
            'a7dadef6-7749-403a-8ebd-f967037a582d',
            '33E01250-C0FE-4B35-AF8F-A4F444490065', -- Entity: MJ: Scheduled Job Types
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
         WHERE ID = '66491623-fd77-48a3-a3a2-965daab228ef'  OR 
               (EntityID = '33E01250-C0FE-4B35-AF8F-A4F444490065' AND Name = '__mj_UpdatedAt')
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
            '66491623-fd77-48a3-a3a2-965daab228ef',
            '33E01250-C0FE-4B35-AF8F-A4F444490065', -- Entity: MJ: Scheduled Job Types
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
         WHERE ID = '5ff3a193-496f-4a52-bfc4-c34a72b47170'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'ID')
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
            '5ff3a193-496f-4a52-bfc4-c34a72b47170',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
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
         WHERE ID = 'c30ff21a-65a1-4ef3-8978-430ce036c280'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'JobTypeID')
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
            'c30ff21a-65a1-4ef3-8978-430ce036c280',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
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
            '33E01250-C0FE-4B35-AF8F-A4F444490065',
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
         WHERE ID = '4b118964-92d4-49de-8c3e-fb5736ed5397'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'Name')
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
            '4b118964-92d4-49de-8c3e-fb5736ed5397',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
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
         WHERE ID = '3b91e50a-c0eb-47b7-89f5-b896933309ea'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'Description')
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
            '3b91e50a-c0eb-47b7-89f5-b896933309ea',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
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
         WHERE ID = '9fefb2a6-873f-4788-9f53-225baedf7333'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'CronExpression')
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
            '9fefb2a6-873f-4788-9f53-225baedf7333',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
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
         WHERE ID = 'e57ef025-b07c-4d17-8602-6120a345addf'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'Timezone')
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
            'e57ef025-b07c-4d17-8602-6120a345addf',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
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
         WHERE ID = '0f3b6855-16d4-486b-a589-698650bfff96'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'StartAt')
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
            '0f3b6855-16d4-486b-a589-698650bfff96',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
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
         WHERE ID = 'b2917c35-8b6b-4c02-a42a-6ca26d70125f'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'EndAt')
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
            'b2917c35-8b6b-4c02-a42a-6ca26d70125f',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
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
         WHERE ID = 'd34a3e50-e7a0-4241-8a1c-6fd61e3f7ee7'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'Status')
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
            'd34a3e50-e7a0-4241-8a1c-6fd61e3f7ee7',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
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
         WHERE ID = 'ac6d67f0-d805-4e42-9c4a-34e136107b46'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'Configuration')
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
            'ac6d67f0-d805-4e42-9c4a-34e136107b46',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
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
         WHERE ID = 'e4dccf26-14b1-4033-818d-180af7c04097'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'OwnerUserID')
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
            'e4dccf26-14b1-4033-818d-180af7c04097',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
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
         WHERE ID = 'e4f4b083-a687-43eb-b9e4-2b41273d82d7'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'LastRunAt')
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
            'e4f4b083-a687-43eb-b9e4-2b41273d82d7',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100012,
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
         WHERE ID = 'b44e0249-46e7-4c54-a0a5-a6a8e79fb4cd'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'NextRunAt')
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
            'b44e0249-46e7-4c54-a0a5-a6a8e79fb4cd',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100013,
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
         WHERE ID = 'cc28664e-cf7b-4791-b4be-d96cbd4e4549'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'RunCount')
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
            'cc28664e-cf7b-4791-b4be-d96cbd4e4549',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100014,
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
         WHERE ID = 'a0b299b6-fea3-4d84-a56e-0a5369b288d2'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'SuccessCount')
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
            'a0b299b6-fea3-4d84-a56e-0a5369b288d2',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100015,
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
         WHERE ID = '53667e7f-001e-4977-b588-3619d9a982c6'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'FailureCount')
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
            '53667e7f-001e-4977-b588-3619d9a982c6',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100016,
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
         WHERE ID = 'ab6d25bb-b06b-454d-8216-8d8416a856d6'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'NotifyOnSuccess')
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
            'ab6d25bb-b06b-454d-8216-8d8416a856d6',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100017,
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
         WHERE ID = 'd089dc8a-e08c-4295-b5ea-4c96dddeb8d1'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'NotifyOnFailure')
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
            'd089dc8a-e08c-4295-b5ea-4c96dddeb8d1',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100018,
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
         WHERE ID = '1ffb0397-c54b-4a7d-9394-cff8a392502a'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'NotifyUserID')
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
            '1ffb0397-c54b-4a7d-9394-cff8a392502a',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100019,
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
         WHERE ID = '4c6d0b08-d852-444f-9394-c5387c91139f'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'NotifyViaEmail')
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
            '4c6d0b08-d852-444f-9394-c5387c91139f',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100020,
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
         WHERE ID = '03768220-f023-4e46-87e2-5738aac55985'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'NotifyViaInApp')
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
            '03768220-f023-4e46-87e2-5738aac55985',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100021,
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
         WHERE ID = '105ceab7-9967-4956-b143-cbc983632481'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'LockToken')
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
            '105ceab7-9967-4956-b143-cbc983632481',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100022,
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
         WHERE ID = '4d1f66e6-e7dd-4463-bd85-6a34dadfd096'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'LockedAt')
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
            '4d1f66e6-e7dd-4463-bd85-6a34dadfd096',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100023,
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
         WHERE ID = '12ed9986-1339-4f4c-88dc-b8b479950062'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'LockedByInstance')
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
            '12ed9986-1339-4f4c-88dc-b8b479950062',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100024,
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
         WHERE ID = '4cef1a8f-edc1-4551-b3b8-2b8a6da3deaa'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'ExpectedCompletionAt')
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
            '4cef1a8f-edc1-4551-b3b8-2b8a6da3deaa',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100025,
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
         WHERE ID = 'bb4bfda6-0001-43d3-9f48-e9bdb1ac0331'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'ConcurrencyMode')
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
            'bb4bfda6-0001-43d3-9f48-e9bdb1ac0331',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100026,
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
         WHERE ID = '68ae196c-1cbd-44b9-a24d-c9f69cf1215d'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = '__mj_CreatedAt')
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
            '68ae196c-1cbd-44b9-a24d-c9f69cf1215d',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100027,
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
         WHERE ID = '0a7acd60-27e1-46f5-b162-00e87ee996e3'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = '__mj_UpdatedAt')
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
            '0a7acd60-27e1-46f5-b162-00e87ee996e3',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100028,
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

/* SQL text to insert entity field value with ID b5977215-0ed2-4e5f-9627-6fea3d761583 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('b5977215-0ed2-4e5f-9627-6fea3d761583', 'BB4BFDA6-0001-43D3-9F48-E9BDB1AC0331', 1, 'Concurrent', 'Concurrent')

/* SQL text to insert entity field value with ID 5fdfb6d8-b3db-4064-917d-0ef7a7ad7c30 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('5fdfb6d8-b3db-4064-917d-0ef7a7ad7c30', 'BB4BFDA6-0001-43D3-9F48-E9BDB1AC0331', 2, 'Queue', 'Queue')

/* SQL text to insert entity field value with ID 8f748296-e050-48ca-853b-dfd156b2bbdf */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('8f748296-e050-48ca-853b-dfd156b2bbdf', 'BB4BFDA6-0001-43D3-9F48-E9BDB1AC0331', 3, 'Skip', 'Skip')

/* SQL text to update ValueListType for entity field ID BB4BFDA6-0001-43D3-9F48-E9BDB1AC0331 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='BB4BFDA6-0001-43D3-9F48-E9BDB1AC0331'

/* SQL text to insert entity field value with ID 1f48f9be-415c-448a-a932-e1a677f3fd57 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('1f48f9be-415c-448a-a932-e1a677f3fd57', '9B974E30-454A-4F22-977E-EFCC7114683A', 1, 'Cancelled', 'Cancelled')

/* SQL text to insert entity field value with ID 59785053-5012-4a37-89b5-bbacbcfa01e2 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('59785053-5012-4a37-89b5-bbacbcfa01e2', '9B974E30-454A-4F22-977E-EFCC7114683A', 2, 'Completed', 'Completed')

/* SQL text to insert entity field value with ID 2b5ff775-6fdc-41b7-b16b-ecb79f11bb42 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('2b5ff775-6fdc-41b7-b16b-ecb79f11bb42', '9B974E30-454A-4F22-977E-EFCC7114683A', 3, 'Failed', 'Failed')

/* SQL text to insert entity field value with ID 395efe5b-9f90-4208-a396-8197d82cedfd */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('395efe5b-9f90-4208-a396-8197d82cedfd', '9B974E30-454A-4F22-977E-EFCC7114683A', 4, 'Running', 'Running')

/* SQL text to insert entity field value with ID fa90770d-3645-40ab-81d2-b1401519ec1c */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('fa90770d-3645-40ab-81d2-b1401519ec1c', '9B974E30-454A-4F22-977E-EFCC7114683A', 5, 'Timeout', 'Timeout')

/* SQL text to update ValueListType for entity field ID 9B974E30-454A-4F22-977E-EFCC7114683A */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='9B974E30-454A-4F22-977E-EFCC7114683A'

/* SQL text to insert entity field value with ID 92b4bb4b-3ae0-407b-b314-c24ced8d061a */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('92b4bb4b-3ae0-407b-b314-c24ced8d061a', 'D34A3E50-E7A0-4241-8A1C-6FD61E3F7EE7', 1, 'Active', 'Active')

/* SQL text to insert entity field value with ID 4ce91b85-b2cc-4cfd-8544-2ea3203a80ef */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('4ce91b85-b2cc-4cfd-8544-2ea3203a80ef', 'D34A3E50-E7A0-4241-8A1C-6FD61E3F7EE7', 2, 'Disabled', 'Disabled')

/* SQL text to insert entity field value with ID 96b3c8cd-916f-419b-9572-55d66b5bda76 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('96b3c8cd-916f-419b-9572-55d66b5bda76', 'D34A3E50-E7A0-4241-8A1C-6FD61E3F7EE7', 3, 'Expired', 'Expired')

/* SQL text to insert entity field value with ID 54d9f9ad-e350-4fbb-bf6c-00634851c260 */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('54d9f9ad-e350-4fbb-bf6c-00634851c260', 'D34A3E50-E7A0-4241-8A1C-6FD61E3F7EE7', 4, 'Paused', 'Paused')

/* SQL text to insert entity field value with ID d0084569-5947-416b-91ce-95c410ac90fd */
INSERT INTO [${flyway:defaultSchema}].EntityFieldValue
                                       (ID, EntityFieldID, Sequence, Value, Code)
                                    VALUES
                                       ('d0084569-5947-416b-91ce-95c410ac90fd', 'D34A3E50-E7A0-4241-8A1C-6FD61E3F7EE7', 5, 'Pending', 'Pending')

/* SQL text to update ValueListType for entity field ID D34A3E50-E7A0-4241-8A1C-6FD61E3F7EE7 */
UPDATE [${flyway:defaultSchema}].EntityField SET ValueListType='List' WHERE ID='D34A3E50-E7A0-4241-8A1C-6FD61E3F7EE7'

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '29b73ccf-1517-4bda-9bb5-ee6d48e1609a'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('29b73ccf-1517-4bda-9bb5-ee6d48e1609a', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'F48D2E6C-61C8-46B8-A617-C8228601EB3C', 'NotifyUserID', 'One To Many', 1, 1, 'MJ: Scheduled Jobs', 1);
   END
                              
   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'fea0a41e-14a4-4c1d-929b-bade744a889c'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('fea0a41e-14a4-4c1d-929b-bade744a889c', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'F48D2E6C-61C8-46B8-A617-C8228601EB3C', 'OwnerUserID', 'One To Many', 1, 1, 'MJ: Scheduled Jobs', 2);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '2c88f441-7624-4e1a-b4bb-98be9036ad83'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('2c88f441-7624-4e1a-b4bb-98be9036ad83', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', '05853432-5E13-4F2A-8618-77857ADF17FA', 'ExecutedByUserID', 'One To Many', 1, 1, 'MJ: Scheduled Job Runs', 1);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'f698138e-3441-464c-865a-ce7108c237cb'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('f698138e-3441-464c-865a-ce7108c237cb', '05853432-5E13-4F2A-8618-77857ADF17FA', '5190AF93-4C39-4429-BDAA-0AEB492A0256', 'ScheduledJobRunID', 'One To Many', 1, 1, 'MJ: AI Agent Runs', 4);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = '03b54bb6-2212-44f5-9f86-a8401bbad5d4'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('03b54bb6-2212-44f5-9f86-a8401bbad5d4', '33E01250-C0FE-4B35-AF8F-A4F444490065', 'F48D2E6C-61C8-46B8-A617-C8228601EB3C', 'JobTypeID', 'One To Many', 1, 1, 'MJ: Scheduled Jobs', 3);
   END
                              

/* SQL text to create Entitiy Relationships */

   IF NOT EXISTS (
      SELECT 1
      FROM [${flyway:defaultSchema}].EntityRelationship
      WHERE ID = 'a7ecb826-ac8f-4a3c-b992-d81bb8a0b4f9'
   )
   BEGIN
      INSERT INTO ${flyway:defaultSchema}.EntityRelationship (ID, EntityID, RelatedEntityID, RelatedEntityJoinField, Type, BundleInAPI, DisplayInForm, DisplayName, Sequence)
                              VALUES ('a7ecb826-ac8f-4a3c-b992-d81bb8a0b4f9', 'F48D2E6C-61C8-46B8-A617-C8228601EB3C', '05853432-5E13-4F2A-8618-77857ADF17FA', 'ScheduledJobID', 'One To Many', 1, 1, 'MJ: Scheduled Job Runs', 2);
   END
                              

/* SQL text to update entity field related entity name field map for entity field ID 6A62443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6A62443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentItem'

/* SQL text to update entity field related entity name field map for entity field ID 8E62443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='8E62443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='Item'

/* SQL text to update entity field related entity name field map for entity field ID 2262443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='2262443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID D860443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='D860443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='Source'

/* SQL text to update entity field related entity name field map for entity field ID 3861443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3861443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSource'

/* SQL text to update entity field related entity name field map for entity field ID 3462443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3462443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID 3A62443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='3A62443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 4062443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4062443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* SQL text to update entity field related entity name field map for entity field ID 0E61443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0E61443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentType'

/* SQL text to update entity field related entity name field map for entity field ID B661443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='B661443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='AIModel'

/* SQL text to update entity field related entity name field map for entity field ID 1461443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1461443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentSourceType'

/* SQL text to update entity field related entity name field map for entity field ID 1A61443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1A61443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ContentFileType'

/* Index for Foreign Keys for EntityRelationship */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_EntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_EntityID ON [${flyway:defaultSchema}].[EntityRelationship] ([EntityID]);

-- Index for foreign key RelatedEntityID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_RelatedEntityID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_RelatedEntityID ON [${flyway:defaultSchema}].[EntityRelationship] ([RelatedEntityID]);

-- Index for foreign key DisplayUserViewID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayUserViewID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayUserViewID ON [${flyway:defaultSchema}].[EntityRelationship] ([DisplayUserViewID]);

-- Index for foreign key DisplayComponentID in table EntityRelationship
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayComponentID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[EntityRelationship]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_EntityRelationship_DisplayComponentID ON [${flyway:defaultSchema}].[EntityRelationship] ([DisplayComponentID]);

/* Base View Permissions SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: Permissions for vwEntityRelationships
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

GRANT SELECT ON [${flyway:defaultSchema}].[vwEntityRelationships] TO [cdp_Integration], [cdp_Developer], [cdp_UI]

/* spCreate SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spCreateEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateEntityRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateEntityRelationship]
    @ID uniqueidentifier = NULL,
    @EntityID uniqueidentifier,
    @Sequence int = NULL,
    @RelatedEntityID uniqueidentifier,
    @BundleInAPI bit = NULL,
    @IncludeInParentAllQuery bit = NULL,
    @Type nchar(20) = NULL,
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit = NULL,
    @DisplayLocation nvarchar(50) = NULL,
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50) = NULL,
    @DisplayIcon nvarchar(255),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX),
    @AutoUpdateFromSchema bit = NULL
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @InsertedRow TABLE ([ID] UNIQUEIDENTIFIER)
    
    IF @ID IS NOT NULL
    BEGIN
        -- User provided a value, use it
        INSERT INTO [${flyway:defaultSchema}].[EntityRelationship]
            (
                [ID],
                [EntityID],
                [Sequence],
                [RelatedEntityID],
                [BundleInAPI],
                [IncludeInParentAllQuery],
                [Type],
                [EntityKeyField],
                [RelatedEntityJoinField],
                [JoinView],
                [JoinEntityJoinField],
                [JoinEntityInverseJoinField],
                [DisplayInForm],
                [DisplayLocation],
                [DisplayName],
                [DisplayIconType],
                [DisplayIcon],
                [DisplayComponentID],
                [DisplayComponentConfiguration],
                [AutoUpdateFromSchema]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @ID,
                @EntityID,
                ISNULL(@Sequence, 0),
                @RelatedEntityID,
                ISNULL(@BundleInAPI, 1),
                ISNULL(@IncludeInParentAllQuery, 0),
                ISNULL(@Type, 'One To Many'),
                @EntityKeyField,
                @RelatedEntityJoinField,
                @JoinView,
                @JoinEntityJoinField,
                @JoinEntityInverseJoinField,
                ISNULL(@DisplayInForm, 1),
                ISNULL(@DisplayLocation, 'After Field Tabs'),
                @DisplayName,
                ISNULL(@DisplayIconType, 'Related Entity Icon'),
                @DisplayIcon,
                @DisplayComponentID,
                @DisplayComponentConfiguration,
                ISNULL(@AutoUpdateFromSchema, 1)
            )
    END
    ELSE
    BEGIN
        -- No value provided, let database use its default (e.g., NEWSEQUENTIALID())
        INSERT INTO [${flyway:defaultSchema}].[EntityRelationship]
            (
                [EntityID],
                [Sequence],
                [RelatedEntityID],
                [BundleInAPI],
                [IncludeInParentAllQuery],
                [Type],
                [EntityKeyField],
                [RelatedEntityJoinField],
                [JoinView],
                [JoinEntityJoinField],
                [JoinEntityInverseJoinField],
                [DisplayInForm],
                [DisplayLocation],
                [DisplayName],
                [DisplayIconType],
                [DisplayIcon],
                [DisplayComponentID],
                [DisplayComponentConfiguration],
                [AutoUpdateFromSchema]
            )
        OUTPUT INSERTED.[ID] INTO @InsertedRow
        VALUES
            (
                @EntityID,
                ISNULL(@Sequence, 0),
                @RelatedEntityID,
                ISNULL(@BundleInAPI, 1),
                ISNULL(@IncludeInParentAllQuery, 0),
                ISNULL(@Type, 'One To Many'),
                @EntityKeyField,
                @RelatedEntityJoinField,
                @JoinView,
                @JoinEntityJoinField,
                @JoinEntityInverseJoinField,
                ISNULL(@DisplayInForm, 1),
                ISNULL(@DisplayLocation, 'After Field Tabs'),
                @DisplayName,
                ISNULL(@DisplayIconType, 'Related Entity Icon'),
                @DisplayIcon,
                @DisplayComponentID,
                @DisplayComponentConfiguration,
                ISNULL(@AutoUpdateFromSchema, 1)
            )
    END
    -- return the new record from the base view, which might have some calculated fields
    SELECT * FROM [${flyway:defaultSchema}].[vwEntityRelationships] WHERE [ID] = (SELECT [ID] FROM @InsertedRow)
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRelationship] TO [cdp_Integration], [cdp_Developer]
    

/* spCreate Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spCreateEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* spUpdate SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spUpdateEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateEntityRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateEntityRelationship]
    @ID uniqueidentifier,
    @EntityID uniqueidentifier,
    @Sequence int,
    @RelatedEntityID uniqueidentifier,
    @BundleInAPI bit,
    @IncludeInParentAllQuery bit,
    @Type nchar(20),
    @EntityKeyField nvarchar(255),
    @RelatedEntityJoinField nvarchar(255),
    @JoinView nvarchar(255),
    @JoinEntityJoinField nvarchar(255),
    @JoinEntityInverseJoinField nvarchar(255),
    @DisplayInForm bit,
    @DisplayLocation nvarchar(50),
    @DisplayName nvarchar(255),
    @DisplayIconType nvarchar(50),
    @DisplayIcon nvarchar(255),
    @DisplayComponentID uniqueidentifier,
    @DisplayComponentConfiguration nvarchar(MAX),
    @AutoUpdateFromSchema bit
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRelationship]
    SET
        [EntityID] = @EntityID,
        [Sequence] = @Sequence,
        [RelatedEntityID] = @RelatedEntityID,
        [BundleInAPI] = @BundleInAPI,
        [IncludeInParentAllQuery] = @IncludeInParentAllQuery,
        [Type] = @Type,
        [EntityKeyField] = @EntityKeyField,
        [RelatedEntityJoinField] = @RelatedEntityJoinField,
        [JoinView] = @JoinView,
        [JoinEntityJoinField] = @JoinEntityJoinField,
        [JoinEntityInverseJoinField] = @JoinEntityInverseJoinField,
        [DisplayInForm] = @DisplayInForm,
        [DisplayLocation] = @DisplayLocation,
        [DisplayName] = @DisplayName,
        [DisplayIconType] = @DisplayIconType,
        [DisplayIcon] = @DisplayIcon,
        [DisplayComponentID] = @DisplayComponentID,
        [DisplayComponentConfiguration] = @DisplayComponentConfiguration,
        [AutoUpdateFromSchema] = @AutoUpdateFromSchema
    WHERE
        [ID] = @ID

    -- Check if the update was successful
    IF @@ROWCOUNT = 0
        -- Nothing was updated, return no rows, but column structure from base view intact, semantically correct this way.
        SELECT TOP 0 * FROM [${flyway:defaultSchema}].[vwEntityRelationships] WHERE 1=0
    ELSE
        -- Return the updated record so the caller can see the updated values and any calculated fields
        SELECT
                                        *
                                    FROM
                                        [${flyway:defaultSchema}].[vwEntityRelationships]
                                    WHERE
                                        [ID] = @ID
                                    
END
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRelationship] TO [cdp_Integration], [cdp_Developer]
GO

------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityRelationship table
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateEntityRelationship]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateEntityRelationship];
GO
CREATE TRIGGER [${flyway:defaultSchema}].trgUpdateEntityRelationship
ON [${flyway:defaultSchema}].[EntityRelationship]
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    UPDATE
        [${flyway:defaultSchema}].[EntityRelationship]
    SET
        __mj_UpdatedAt = GETUTCDATE()
    FROM
        [${flyway:defaultSchema}].[EntityRelationship] AS _organicTable
    INNER JOIN
        INSERTED AS I ON
        _organicTable.[ID] = I.[ID];
END;
GO
        

/* spUpdate Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateEntityRelationship] TO [cdp_Integration], [cdp_Developer]



/* spDelete SQL for Entity Relationships */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: Entity Relationships
-- Item: spDeleteEntityRelationship
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityRelationship
------------------------------------------------------------
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteEntityRelationship]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityRelationship];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spDeleteEntityRelationship]
    @ID uniqueidentifier
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM
        [${flyway:defaultSchema}].[EntityRelationship]
    WHERE
        [ID] = @ID


    -- Check if the delete was successful
    IF @@ROWCOUNT = 0
        SELECT NULL AS [ID] -- Return NULL for all primary key fields to indicate no record was deleted
    ELSE
        SELECT @ID AS [ID] -- Return the primary key values to indicate we successfully deleted the record
END
GO
GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]
    

/* spDelete Permissions for Entity Relationships */

GRANT EXECUTE ON [${flyway:defaultSchema}].[spDeleteEntityRelationship] TO [cdp_Integration], [cdp_Developer]



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
IF OBJECT_ID('[${flyway:defaultSchema}].[vwAIAgentRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwAIAgentRuns];
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateAIAgentRun]
    @ID uniqueidentifier = NULL,
    @AgentID uniqueidentifier,
    @ParentRunID uniqueidentifier,
    @Status nvarchar(50) = NULL,
    @StartedAt datetimeoffset = NULL,
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
    @TotalPromptIterations int = NULL,
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
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
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
                ISNULL(@TotalPromptIterations, 0),
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
                ISNULL(@Status, 'Running'),
                ISNULL(@StartedAt, sysdatetimeoffset()),
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
                ISNULL(@TotalPromptIterations, 0),
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateAIAgentRun];
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
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateAIAgentRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateAIAgentRun];
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteAIAgentRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteAIAgentRun];
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

/* SQL text to update entity field related entity name field map for entity field ID A8F8EDBB-8304-4738-92DA-6186F220EB94 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='A8F8EDBB-8304-4738-92DA-6186F220EB94',
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

-- Index for foreign key NotifyUserID in table ScheduledJob
IF NOT EXISTS (
    SELECT 1
    FROM sys.indexes
    WHERE name = 'IDX_AUTO_MJ_FKEY_ScheduledJob_NotifyUserID' 
    AND object_id = OBJECT_ID('[${flyway:defaultSchema}].[ScheduledJob]')
)
CREATE INDEX IDX_AUTO_MJ_FKEY_ScheduledJob_NotifyUserID ON [${flyway:defaultSchema}].[ScheduledJob] ([NotifyUserID]);

/* SQL text to update entity field related entity name field map for entity field ID C30FF21A-65A1-4EF3-8978-430CE036C280 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='C30FF21A-65A1-4EF3-8978-430CE036C280',
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
IF OBJECT_ID('[${flyway:defaultSchema}].[vwScheduledJobTypes]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwScheduledJobTypes];
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateScheduledJobType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledJobType];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledJobType]
    @ID uniqueidentifier = NULL,
    @Name nvarchar(100),
    @Description nvarchar(MAX),
    @DriverClass nvarchar(255),
    @DomainRunEntity nvarchar(255),
    @DomainRunEntityFKey nvarchar(100),
    @NotificationsAvailable bit = NULL
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
                ISNULL(@NotificationsAvailable, 1)
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
                ISNULL(@NotificationsAvailable, 1)
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateScheduledJobType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateScheduledJobType];
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
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateScheduledJobType]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateScheduledJobType];
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteScheduledJobType]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteScheduledJobType];
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



/* SQL text to update entity field related entity name field map for entity field ID 6A782BA2-97DF-45E0-9060-8FA0C9CD8C43 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='6A782BA2-97DF-45E0-9060-8FA0C9CD8C43',
         @RelatedEntityNameFieldMap='ExecutedByUser'

/* SQL text to update entity field related entity name field map for entity field ID E4DCCF26-14B1-4033-818D-180AF7C04097 */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='E4DCCF26-14B1-4033-818D-180AF7C04097',
         @RelatedEntityNameFieldMap='OwnerUser'

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
IF OBJECT_ID('[${flyway:defaultSchema}].[vwScheduledJobRuns]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwScheduledJobRuns];
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateScheduledJobRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledJobRun];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledJobRun]
    @ID uniqueidentifier = NULL,
    @ScheduledJobID uniqueidentifier,
    @StartedAt datetimeoffset = NULL,
    @CompletedAt datetimeoffset,
    @Status nvarchar(20) = NULL,
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
                ISNULL(@StartedAt, sysdatetimeoffset()),
                @CompletedAt,
                ISNULL(@Status, 'Running'),
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
                ISNULL(@StartedAt, sysdatetimeoffset()),
                @CompletedAt,
                ISNULL(@Status, 'Running'),
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateScheduledJobRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateScheduledJobRun];
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
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateScheduledJobRun]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateScheduledJobRun];
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteScheduledJobRun]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteScheduledJobRun];
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



/* SQL text to update entity field related entity name field map for entity field ID 1FFB0397-C54B-4A7D-9394-CFF8A392502A */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1FFB0397-C54B-4A7D-9394-CFF8A392502A',
         @RelatedEntityNameFieldMap='NotifyUser'

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
IF OBJECT_ID('[${flyway:defaultSchema}].[vwScheduledJobs]', 'V') IS NOT NULL
    DROP VIEW [${flyway:defaultSchema}].[vwScheduledJobs];
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spCreateScheduledJob]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledJob];
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spCreateScheduledJob]
    @ID uniqueidentifier = NULL,
    @JobTypeID uniqueidentifier,
    @Name nvarchar(200),
    @Description nvarchar(MAX),
    @CronExpression nvarchar(120),
    @Timezone nvarchar(64) = NULL,
    @StartAt datetimeoffset,
    @EndAt datetimeoffset,
    @Status nvarchar(20) = NULL,
    @Configuration nvarchar(MAX),
    @OwnerUserID uniqueidentifier,
    @LastRunAt datetimeoffset,
    @NextRunAt datetimeoffset,
    @RunCount int = NULL,
    @SuccessCount int = NULL,
    @FailureCount int = NULL,
    @NotifyOnSuccess bit = NULL,
    @NotifyOnFailure bit = NULL,
    @NotifyUserID uniqueidentifier,
    @NotifyViaEmail bit = NULL,
    @NotifyViaInApp bit = NULL,
    @LockToken uniqueidentifier,
    @LockedAt datetimeoffset,
    @LockedByInstance nvarchar(255),
    @ExpectedCompletionAt datetimeoffset,
    @ConcurrencyMode nvarchar(20) = NULL
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
                ISNULL(@Timezone, 'UTC'),
                @StartAt,
                @EndAt,
                ISNULL(@Status, 'Pending'),
                @Configuration,
                @OwnerUserID,
                @LastRunAt,
                @NextRunAt,
                ISNULL(@RunCount, 0),
                ISNULL(@SuccessCount, 0),
                ISNULL(@FailureCount, 0),
                ISNULL(@NotifyOnSuccess, 0),
                ISNULL(@NotifyOnFailure, 1),
                @NotifyUserID,
                ISNULL(@NotifyViaEmail, 0),
                ISNULL(@NotifyViaInApp, 1),
                @LockToken,
                @LockedAt,
                @LockedByInstance,
                @ExpectedCompletionAt,
                ISNULL(@ConcurrencyMode, 'Skip')
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
                ISNULL(@Timezone, 'UTC'),
                @StartAt,
                @EndAt,
                ISNULL(@Status, 'Pending'),
                @Configuration,
                @OwnerUserID,
                @LastRunAt,
                @NextRunAt,
                ISNULL(@RunCount, 0),
                ISNULL(@SuccessCount, 0),
                ISNULL(@FailureCount, 0),
                ISNULL(@NotifyOnSuccess, 0),
                ISNULL(@NotifyOnFailure, 1),
                @NotifyUserID,
                ISNULL(@NotifyViaEmail, 0),
                ISNULL(@NotifyViaInApp, 1),
                @LockToken,
                @LockedAt,
                @LockedByInstance,
                @ExpectedCompletionAt,
                ISNULL(@ConcurrencyMode, 'Skip')
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spUpdateScheduledJob]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spUpdateScheduledJob];
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
IF OBJECT_ID('[${flyway:defaultSchema}].[trgUpdateScheduledJob]', 'TR') IS NOT NULL
    DROP TRIGGER [${flyway:defaultSchema}].[trgUpdateScheduledJob];
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteScheduledJob]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteScheduledJob];
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



/* SQL text to update entity field related entity name field map for entity field ID 4963443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='4963443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

/* SQL text to update entity field related entity name field map for entity field ID 0263443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0263443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 5063443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='5063443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='ResourceType'

/* SQL text to update entity field related entity name field map for entity field ID 0E63443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='0E63443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='Role'

/* SQL text to update entity field related entity name field map for entity field ID 1163443E-F36B-1410-8DCA-00021F8B792E */
EXEC [${flyway:defaultSchema}].spUpdateEntityFieldRelatedEntityNameFieldMap
         @EntityFieldID='1163443E-F36B-1410-8DCA-00021F8B792E',
         @RelatedEntityNameFieldMap='User'

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
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversationDetail]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversationDetail];
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
IF OBJECT_ID('[${flyway:defaultSchema}].[spDeleteConversation]', 'P') IS NOT NULL
    DROP PROCEDURE [${flyway:defaultSchema}].[spDeleteConversation];
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
         WHERE ID = 'bac1c342-aa76-4821-980f-084b6a4e658d'  OR 
               (EntityID = '05853432-5E13-4F2A-8618-77857ADF17FA' AND Name = 'ScheduledJob')
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
            'bac1c342-aa76-4821-980f-084b6a4e658d',
            '05853432-5E13-4F2A-8618-77857ADF17FA', -- Entity: MJ: Scheduled Job Runs
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
         WHERE ID = 'd2685b34-024e-4412-b5c7-4ea5eba0a6f0'  OR 
               (EntityID = '05853432-5E13-4F2A-8618-77857ADF17FA' AND Name = 'ExecutedByUser')
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
            'd2685b34-024e-4412-b5c7-4ea5eba0a6f0',
            '05853432-5E13-4F2A-8618-77857ADF17FA', -- Entity: MJ: Scheduled Job Runs
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
         WHERE ID = '7ced4f5b-2a51-4d30-968a-7cb0c302f5be'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'JobType')
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
            '7ced4f5b-2a51-4d30-968a-7cb0c302f5be',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100057,
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
         WHERE ID = 'c8ac395c-04d8-4e85-881b-d4f5a70b759d'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'OwnerUser')
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
            'c8ac395c-04d8-4e85-881b-d4f5a70b759d',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100058,
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
         WHERE ID = '0ea25537-7efd-4fb3-83dd-2e876202d09d'  OR 
               (EntityID = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND Name = 'NotifyUser')
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
            '0ea25537-7efd-4fb3-83dd-2e876202d09d',
            'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- Entity: MJ: Scheduled Jobs
            100059,
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
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Details] IS NULL OR isjson([Details])=(1))', 'public ValidateDetailsAsJson(result: ValidationResult) {
	if (this.Details != null) {
		try {
			JSON.parse(this.Details);
		} catch (e) {
			result.Errors.push(new ValidationErrorInfo("Details", "Details must be a valid JSON if provided.", this.Details, ValidationErrorType.Failure));
		}
	}
}', 'This rule ensures that if the Details field is not empty, it must contain a valid JSON value.', 'ValidateDetailsAsJson', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', '796599EF-B0C9-474C-845B-7C030B55159F');
  
            

/* Generated Validation Functions for MJ: Scheduled Jobs */
-- CHECK constraint for MJ: Scheduled Jobs: Field: Configuration was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function
INSERT INTO [${flyway:defaultSchema}].[GeneratedCode] (CategoryID, GeneratedByModelID, GeneratedAt, Language, Status, Source, Code, Description, Name, LinkedEntityID, LinkedRecordPrimaryKey)
                      VALUES ((SELECT ID FROM ${flyway:defaultSchema}.vwGeneratedCodeCategories WHERE Name='CodeGen: Validators'), '287E317F-BF26-F011-A770-AC1A3D21423D', GETUTCDATE(), 'TypeScript','Approved', '([Configuration] IS NULL OR isjson([Configuration])=(1))', 'public ValidateConfigurationIsJson(result: ValidationResult) {
	if (this.Configuration != null) {
		try {
			JSON.parse(this.Configuration);
		} catch (e) {
			result.Errors.push(new ValidationErrorInfo("Configuration", "If specified, Configuration must be valid JSON.", this.Configuration, ValidationErrorType.Failure));
		}
	}
}', 'This rule ensures that if the Configuration field has a value, it must be valid JSON. If the Configuration field is empty or not set, this rule does not apply.', 'ValidateConfigurationIsJson', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'AC6D67F0-D805-4E42-9C4A-34E136107B46');
  
            

