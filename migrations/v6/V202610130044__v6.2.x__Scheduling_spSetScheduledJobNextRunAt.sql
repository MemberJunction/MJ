-- Scheduling engine: targeted NextRunAt seed for jobs activated at runtime.
--
-- A job switched from Disabled to Active while the engine is polling arrives with a null
-- NextRunAt, which the engine treats as "never due", so it would not run until the next
-- server restart (when StartPolling seeds NextRunAt). The engine now seeds it on the
-- job-change notification. Polling may hold live locks at that moment, so the write must
-- touch only NextRunAt: a full-entity Save() would write the entity's stale lock columns
-- over a live lock (see spUpdateScheduledJobStatistics for the same rule).

CREATE PROCEDURE [${flyway:defaultSchema}].[spSetScheduledJobNextRunAt]
    @JobID      UNIQUEIDENTIFIER,
    @NextRunAt  DATETIMEOFFSET
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE [${flyway:defaultSchema}].[ScheduledJob]
       SET NextRunAt = @NextRunAt
     WHERE ID = @JobID;
END;
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spSetScheduledJobNextRunAt] TO [cdp_Developer];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spSetScheduledJobNextRunAt] TO [cdp_Integration];
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Sets ONLY the NextRunAt column on a ScheduledJob row. Called by ScheduledJobEngine.seedNextRunAtForActivatedJobs when a job is activated while polling is live and arrives with a null NextRunAt. Deliberately does NOT touch the lock columns (LockToken, LockedAt, LockedByInstance, ExpectedCompletionAt): a full-entity BaseEntity.Save() during polling would write stale in-memory lock values over a live lock. Same targeted-update rule as spUpdateScheduledJobStatistics.',
    @level0type = N'SCHEMA',    @level0name = N'${flyway:defaultSchema}',
    @level1type = N'PROCEDURE', @level1name = N'spSetScheduledJobNextRunAt';
GO
