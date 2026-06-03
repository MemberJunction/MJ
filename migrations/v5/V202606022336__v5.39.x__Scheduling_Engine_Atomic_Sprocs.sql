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
