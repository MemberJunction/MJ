-- =====================================================
-- v5.39.x — Scheduling engine atomic sprocs for poll-loop decoupling
-- =====================================================
-- Adds three stored procedures used by ScheduledJobEngine to perform atomic
-- conditional updates on ScheduledJob rows. Together these eliminate the
-- TOCTOU window in the BaseEntity load-compare-save pattern that became
-- exploitable once the poll loop was decoupled from job execution (GH #2736).
--
-- Background and full rationale: plans/scheduled-job-engine-decoupling.md.
--
-- Sprocs are ordered below to match the runtime execution sequence:
--   1. spAcquireScheduledJobLock        — dispatch path acquires the lock
--   2. spUpdateScheduledJobStatistics   — execution completes (success or fail)
--   3. spReleaseScheduledJobLockIfTokenMatches — finally block releases the lock
--
-- spAcquireScheduledJobLock
--   Atomic UPDATE if the row's lock is free OR stale (ExpectedCompletionAt
--   < now). Returns Acquired = 1 if the row was updated, 0 otherwise.
--   Replaces the engine's load → check → save acquire pattern, eliminating
--   the window between "load showed no lock" and "save writes the lock"
--   where another instance could acquire the same lock.
--
-- spUpdateScheduledJobStatistics
--   Atomic UPDATE that touches ONLY the five statistics columns (RunCount,
--   SuccessCount, FailureCount, LastRunAt, NextRunAt). Replaces a full-entity
--   `job.Save()` in updateJobStatistics that previously wrote ALL columns,
--   including stale in-memory lock columns — that clobbered the live lock
--   token set by spAcquireScheduledJobLock, causing every successful
--   completion to see a false-positive token mismatch in
--   releaseLockIfTokenMatches. Architectural decision #8b in the design doc.
--
-- spReleaseScheduledJobLockIfTokenMatches
--   Atomic UPDATE that clears the lock columns ONLY if the current LockToken
--   matches the expected token (the token this execution acquired).
--   Returns Released = 1 if cleared, 0 if token mismatch / already released.
--   Prevents the lost-mutex hazard where a stale holder's eventual settlement
--   would clobber a fresh holder's lock after lease expiry + reclaim.
-- =====================================================

CREATE PROCEDURE [${flyway:defaultSchema}].[spAcquireScheduledJobLock]
    @JobID                  UNIQUEIDENTIFIER,
    @Token                  UNIQUEIDENTIFIER,
    @Instance               NVARCHAR(255),
    @ExpectedCompletionAt   DATETIMEOFFSET
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Now DATETIMEOFFSET = SYSDATETIMEOFFSET();
    DECLARE @RowsAffected INT;

    UPDATE [${flyway:defaultSchema}].[ScheduledJob]
       SET LockToken            = @Token,
           LockedAt             = @Now,
           LockedByInstance     = @Instance,
           ExpectedCompletionAt = @ExpectedCompletionAt
     WHERE ID = @JobID
       AND (LockToken IS NULL
            OR ExpectedCompletionAt IS NULL
            OR ExpectedCompletionAt < @Now);

    SET @RowsAffected = @@ROWCOUNT;
    SELECT @RowsAffected AS Acquired;
END;
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spAcquireScheduledJobLock] TO [cdp_Developer];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spAcquireScheduledJobLock] TO [cdp_Integration];
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Atomically acquires a lock on a ScheduledJob row if the row is currently unlocked (LockToken IS NULL) OR if the existing lock is stale (ExpectedCompletionAt < now). The conditional WHERE clause collapses the load → check → save acquire pattern into a single atomic UPDATE, eliminating the TOCTOU window where two overlapping polls could both pass a check and both write. Returns Acquired = 1 if the row was updated, 0 otherwise. Called by ScheduledJobEngine.tryAcquireLock as part of the v5.39 poll-loop decoupling fix (GH #2736).',
    @level0type = N'SCHEMA',    @level0name = N'${flyway:defaultSchema}',
    @level1type = N'PROCEDURE', @level1name = N'spAcquireScheduledJobLock';
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spUpdateScheduledJobStatistics]
    @JobID         UNIQUEIDENTIFIER,
    @Success       BIT,
    @LastRunAt     DATETIMEOFFSET,
    @NextRunAt     DATETIMEOFFSET
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE [${flyway:defaultSchema}].[ScheduledJob]
       SET RunCount     = RunCount + 1,
           SuccessCount = SuccessCount + CASE WHEN @Success = 1 THEN 1 ELSE 0 END,
           FailureCount = FailureCount + CASE WHEN @Success = 0 THEN 1 ELSE 0 END,
           LastRunAt    = @LastRunAt,
           NextRunAt    = @NextRunAt
     WHERE ID = @JobID;
END;
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledJobStatistics] TO [cdp_Developer];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spUpdateScheduledJobStatistics] TO [cdp_Integration];
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Atomically updates ONLY the five per-run statistics columns on a ScheduledJob row: RunCount (incremented), SuccessCount (incremented if @Success=1), FailureCount (incremented if @Success=0), LastRunAt, NextRunAt. Deliberately does NOT touch the four lock columns (LockToken, LockedAt, LockedByInstance, ExpectedCompletionAt) — a full-entity BaseEntity.Save() would write stale in-memory lock values back to the DB and clobber the live token set by spAcquireScheduledJobLock. Called by ScheduledJobEngine.updateJobStatistics. Any future engine code path that mutates a ScheduledJob row during normal polling must follow this targeted-update pattern, not BaseEntity.Save(). See plans/scheduled-job-engine-decoupling.md decision #8b.',
    @level0type = N'SCHEMA',    @level0name = N'${flyway:defaultSchema}',
    @level1type = N'PROCEDURE', @level1name = N'spUpdateScheduledJobStatistics';
GO

CREATE PROCEDURE [${flyway:defaultSchema}].[spReleaseScheduledJobLockIfTokenMatches]
    @JobID          UNIQUEIDENTIFIER,
    @ExpectedToken  UNIQUEIDENTIFIER
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @RowsAffected INT;

    UPDATE [${flyway:defaultSchema}].[ScheduledJob]
       SET LockToken            = NULL,
           LockedAt             = NULL,
           LockedByInstance     = NULL,
           ExpectedCompletionAt = NULL
     WHERE ID = @JobID
       AND LockToken = @ExpectedToken;

    SET @RowsAffected = @@ROWCOUNT;
    SELECT @RowsAffected AS Released;
END;
GO

GRANT EXECUTE ON [${flyway:defaultSchema}].[spReleaseScheduledJobLockIfTokenMatches] TO [cdp_Developer];
GRANT EXECUTE ON [${flyway:defaultSchema}].[spReleaseScheduledJobLockIfTokenMatches] TO [cdp_Integration];
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Atomically releases a ScheduledJob lock IF AND ONLY IF the current DB LockToken matches the expected token (the token this execution originally acquired via spAcquireScheduledJobLock). Prevents the lost-mutex hazard reachable after the v5.39 poll-loop decoupling: a stale holder whose lease expired and was reclaimed by a fresh holder must not be able to release the fresh holder''s lock when it eventually settles. Returns Released = 1 if cleared, 0 if the token did not match (someone else holds the lock now) or the lock was already released. Called by ScheduledJobEngine.releaseLockIfTokenMatches in executeJobWithLock''s finally block.',
    @level0type = N'SCHEMA',    @level0name = N'${flyway:defaultSchema}',
    @level1type = N'PROCEDURE', @level1name = N'spReleaseScheduledJobLockIfTokenMatches';
GO
