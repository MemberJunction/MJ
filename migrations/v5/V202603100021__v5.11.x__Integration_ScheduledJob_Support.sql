-- =============================================================================
-- Migration: Integration Scheduled Job Support
-- Version:   5.10.x
-- Purpose:   1. Add ScheduledJobRunID FK to CompanyIntegrationRun for traceability
--            2. Add ScheduledJobID FK to CompanyIntegration for association
-- =============================================================================

-- 1a. Add ScheduledJobRunID to CompanyIntegrationRun
ALTER TABLE ${flyway:defaultSchema}.CompanyIntegrationRun
ADD ScheduledJobRunID UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.CompanyIntegrationRun
ADD CONSTRAINT FK_CompanyIntegrationRun_ScheduledJobRun
    FOREIGN KEY (ScheduledJobRunID)
    REFERENCES ${flyway:defaultSchema}.ScheduledJobRun(ID);
GO

-- 1b. Add ScheduledJobID to CompanyIntegration
ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration
ADD ScheduledJobID UNIQUEIDENTIFIER NULL;
GO

ALTER TABLE ${flyway:defaultSchema}.CompanyIntegration
ADD CONSTRAINT FK_CompanyIntegration_ScheduledJob
    FOREIGN KEY (ScheduledJobID)
    REFERENCES ${flyway:defaultSchema}.ScheduledJob(ID);
GO

-- CompanyIntegration has a custom base view, refresh it so CodeGen picks up the changes
EXEC sp_refreshview '${flyway:defaultSchema}.vwCompanyIntegrations'
GO

-- Extended properties
EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Links to the scheduled job run that triggered this integration sync. NULL for manually-triggered syncs.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegrationRun',
    @level2type = N'COLUMN', @level2name = N'ScheduledJobRunID';

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Associates this company integration with a scheduled job for automatic sync execution. NULL if no schedule is configured.',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'CompanyIntegration',
    @level2type = N'COLUMN', @level2name = N'ScheduledJobID';
