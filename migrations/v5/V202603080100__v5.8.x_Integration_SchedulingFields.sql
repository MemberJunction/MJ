-- =============================================================================
-- Migration: Add scheduling and locking fields to Company Integrations
-- Version:   5.8.x
-- Purpose:   Enable per-integration sync scheduling with granular control,
--            plus distributed locking to prevent double-execution
-- =============================================================================

-- Add scheduling fields to Company Integrations
ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration ADD
    ScheduleEnabled BIT NOT NULL DEFAULT 0,
    ScheduleType NVARCHAR(20) NOT NULL DEFAULT 'Manual',
    ScheduleIntervalMinutes INT NULL,
    CronExpression NVARCHAR(200) NULL,
    NextScheduledRunAt DATETIMEOFFSET NULL,
    LastScheduledRunAt DATETIMEOFFSET NULL;

-- Add constraint for ScheduleType values
ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration
    ADD CONSTRAINT CK_CompanyIntegration_ScheduleType
    CHECK (ScheduleType IN ('Manual', 'Interval', 'Cron'));

-- Add distributed locking fields to prevent concurrent execution
ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration ADD
    IsLocked BIT NOT NULL DEFAULT 0,
    LockedAt DATETIMEOFFSET NULL,
    LockedByInstance NVARCHAR(200) NULL,
    LockExpiresAt DATETIMEOFFSET NULL;

-- Add extended properties for documentation
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether automatic sync scheduling is enabled for this integration', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'ScheduleEnabled';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Type of schedule: Manual (no auto-sync), Interval (every N minutes), Cron (cron expression)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'ScheduleType';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Interval in minutes for Interval schedule type', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'ScheduleIntervalMinutes';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Cron expression for Cron schedule type (e.g., "0 */6 * * *" for every 6 hours)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'CronExpression';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the next scheduled sync should run. Updated after each run based on schedule config.', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'NextScheduledRunAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the last scheduled sync was initiated', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'LastScheduledRunAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Whether a sync is currently locked/running for this integration', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'IsLocked';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the lock was acquired', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'LockedAt';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'Server instance identifier that holds the lock (hostname-pid)', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'LockedByInstance';
EXEC sp_addextendedproperty @name=N'MS_Description', @value=N'When the lock should be considered stale and eligible for cleanup', @level0type=N'SCHEMA', @level0name=N'${flyway:defaultSchema}', @level1type=N'TABLE', @level1name=N'CompanyIntegration', @level2type=N'COLUMN', @level2name=N'LockExpiresAt';
