-- Adds RunImmediatelyIfNeverRun to ScheduledJob.
--
-- When true AND LastRunAt IS NULL, ScheduledJobEngine.initializeNextRunTimes()
-- sets NextRunAt = now() instead of the next cron tick. This ensures a
-- freshly-seeded job runs on the next polling cycle instead of waiting up
-- to a full cron interval (e.g. 24h for a daily job) for its first run.
--
-- Generally useful well beyond the entity-search-via-EntityDocument feature
-- that motivated it — any seeded job that should run as soon as it's
-- installed (data backfill, initial sync, etc.) benefits from this flag.

ALTER TABLE ${flyway:defaultSchema}.ScheduledJob ADD
    RunImmediatelyIfNeverRun BIT NOT NULL
        CONSTRAINT DF_ScheduledJob_RunImmediatelyIfNeverRun DEFAULT (0);

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'When true AND LastRunAt IS NULL, the scheduler sets NextRunAt to now() instead of the next cron tick on initialization, so the job runs on the next polling cycle. Useful for newly-seeded jobs that should not wait up to a full cron interval before their first execution.',
    @level0type = N'SCHEMA', @level0name = '${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = 'ScheduledJob',
    @level2type = N'COLUMN', @level2name = 'RunImmediatelyIfNeverRun';
