-- =============================================================================
-- V202606022336__v5.39.x__Scheduling_Engine_Atomic_Sprocs.pg-only.sql
-- =============================================================================
--
-- WHY THIS MIGRATION EXISTS:
--   The SQL Server migration V202606022336__v5.39.x__Scheduling_Engine_Atomic_Sprocs.sql
--   added three stored procedures used by ScheduledJobEngine to perform atomic
--   conditional updates on ScheduledJob rows (GH #2736 poll-loop decoupling).
--   That migration shipped SQL Server ONLY — it has no PostgreSQL counterpart,
--   so fresh/upgraded PG installs lack these routines entirely. The result:
--   ScheduledJobEngine.tryAcquireLock throws on every dispatch tick and NO
--   scheduled job ever fires on PostgreSQL.
--
--   The T-SQL CREATE PROCEDURE bodies use SET NOCOUNT ON, @@ROWCOUNT and the
--   "SELECT @scalar AS Col" result-set idiom, which the T-SQL -> PG baseline
--   converter cannot translate. This pg-only migration hand-ports the three
--   routines to plpgsql functions, semantics-for-semantics with the SQL Server
--   originals. It is the DB half of the fix; the engine half makes the three
--   call sites dialect-aware (EXEC vs SELECT * FROM fn()) via
--   ScheduledJobEngine.buildLockSprocCall.
--
--   Functions live in ${flyway:defaultSchema} (the placeholder is used for
--   consistency with sibling migrations). Parameters are p_-prefixed so they
--   never collide with the (identically named, double-quoted) ScheduledJob
--   columns inside the UPDATE bodies.
--
--   Ordered below to match the runtime execution sequence:
--     1. spAcquireScheduledJobLock        — dispatch path acquires the lock
--     2. spUpdateScheduledJobStatistics   — execution completes (success or fail)
--     3. spReleaseScheduledJobLockIfTokenMatches — finally block releases the lock
-- =============================================================================


-- =============================================================================
-- 1. spAcquireScheduledJobLock
--    Atomic UPDATE if the row's lock is free OR stale (ExpectedCompletionAt
--    < now). Returns Acquired = 1 if the row was updated, 0 otherwise.
--    Collapses the load -> check -> save acquire pattern into a single atomic
--    statement, eliminating the TOCTOU window where two overlapping polls could
--    both pass a check and both write.
-- =============================================================================
DROP FUNCTION IF EXISTS ${flyway:defaultSchema}."spAcquireScheduledJobLock"(UUID, UUID, VARCHAR, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spAcquireScheduledJobLock"(
    p_JobID                UUID,
    p_Token                UUID,
    p_Instance             VARCHAR(255),
    p_ExpectedCompletionAt TIMESTAMPTZ
)
RETURNS TABLE("Acquired" INTEGER) AS
$$
DECLARE
    _v_now        TIMESTAMPTZ := NOW();
    _v_row_count  INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."ScheduledJob"
       SET "LockToken"            = p_Token,
           "LockedAt"             = _v_now,
           "LockedByInstance"     = p_Instance,
           "ExpectedCompletionAt" = p_ExpectedCompletionAt
     WHERE "ID" = p_JobID
       AND ("LockToken" IS NULL
            OR "ExpectedCompletionAt" IS NULL
            OR "ExpectedCompletionAt" < _v_now);

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spAcquireScheduledJobLock"(UUID, UUID, VARCHAR, TIMESTAMPTZ)
        TO "cdp_Developer", "cdp_Integration";
EXCEPTION WHEN others THEN NULL; END $$;


-- =============================================================================
-- 2. spUpdateScheduledJobStatistics
--    Atomic UPDATE touching ONLY the five statistics columns (RunCount,
--    SuccessCount, FailureCount, LastRunAt, NextRunAt). Deliberately does NOT
--    touch the four lock columns — a full-entity Save() would write stale
--    in-memory lock values back and clobber the live token set by
--    spAcquireScheduledJobLock. @Success arrives as 1/0 (integer) from the engine.
-- =============================================================================
DROP FUNCTION IF EXISTS ${flyway:defaultSchema}."spUpdateScheduledJobStatistics"(UUID, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateScheduledJobStatistics"(
    p_JobID     UUID,
    p_Success   INTEGER,
    p_LastRunAt TIMESTAMPTZ,
    p_NextRunAt TIMESTAMPTZ
)
RETURNS VOID AS
$$
BEGIN
    UPDATE ${flyway:defaultSchema}."ScheduledJob"
       SET "RunCount"     = "RunCount" + 1,
           "SuccessCount" = "SuccessCount" + CASE WHEN p_Success = 1 THEN 1 ELSE 0 END,
           "FailureCount" = "FailureCount" + CASE WHEN p_Success = 0 THEN 1 ELSE 0 END,
           "LastRunAt"    = p_LastRunAt,
           "NextRunAt"    = p_NextRunAt
     WHERE "ID" = p_JobID;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateScheduledJobStatistics"(UUID, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ)
        TO "cdp_Developer", "cdp_Integration";
EXCEPTION WHEN others THEN NULL; END $$;


-- =============================================================================
-- 3. spReleaseScheduledJobLockIfTokenMatches
--    Atomic UPDATE clearing the lock columns ONLY if the current LockToken
--    matches the expected token (the token this execution acquired). Returns
--    Released = 1 if cleared, 0 on token mismatch / already released. Prevents
--    the lost-mutex hazard where a stale holder settling after lease expiry +
--    reclaim would clobber a fresh holder's lock.
-- =============================================================================
DROP FUNCTION IF EXISTS ${flyway:defaultSchema}."spReleaseScheduledJobLockIfTokenMatches"(UUID, UUID);
CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spReleaseScheduledJobLockIfTokenMatches"(
    p_JobID         UUID,
    p_ExpectedToken UUID
)
RETURNS TABLE("Released" INTEGER) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."ScheduledJob"
       SET "LockToken"            = NULL,
           "LockedAt"             = NULL,
           "LockedByInstance"     = NULL,
           "ExpectedCompletionAt" = NULL
     WHERE "ID" = p_JobID
       AND "LockToken" = p_ExpectedToken;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spReleaseScheduledJobLockIfTokenMatches"(UUID, UUID)
        TO "cdp_Developer", "cdp_Integration";
EXCEPTION WHEN others THEN NULL; END $$;
