-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610130044__v6.2.x__Scheduling_spSetScheduledJobNextRunAt.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — RESOLVED BY HAND ══╗
-- The AST transpiler reported the CREATE PROCEDURE as unhandled; the routine is hand-authored
-- below on the model of spUpdateScheduledJobStatistics in
-- migrations-pg/v5/V202606081200__v5.40.x__Scheduling_Engine_Atomic_Sprocs.pg-only.sql.
-- ScheduledJobEngine calls it through the dialect's ProcedureCallSyntax, which on PostgreSQL emits
-- `SELECT * FROM __mj."spSetScheduledJobNextRunAt"($1, $2)`: positional, T-SQL parameter order
-- (JobID, NextRunAt). The converter's own GRANT and COMMENT treated the routine as a table and
-- are replaced by the function forms below.
-- ╚════════════════════════════════════════╝
--
-- Scheduling engine: targeted NextRunAt seed for jobs activated at runtime. A job switched from
-- Disabled to Active while the engine is polling arrives with a null NextRunAt, which the engine
-- treats as "never due". The engine now seeds it on the job-change notification. Polling may hold
-- live locks at that moment, so the write touches only NextRunAt.

DROP FUNCTION IF EXISTS __mj."spSetScheduledJobNextRunAt"(UUID, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION __mj."spSetScheduledJobNextRunAt"(
    p_JobID     UUID,
    p_NextRunAt TIMESTAMPTZ
)
RETURNS VOID AS
$$
BEGIN
    UPDATE __mj."ScheduledJob"
       SET "NextRunAt" = p_NextRunAt
     WHERE "ID" = p_JobID;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    GRANT EXECUTE ON FUNCTION __mj."spSetScheduledJobNextRunAt"(UUID, TIMESTAMPTZ)
        TO "cdp_Developer", "cdp_Integration";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

COMMENT ON FUNCTION __mj."spSetScheduledJobNextRunAt"(UUID, TIMESTAMPTZ) IS 'Sets ONLY the NextRunAt column on a ScheduledJob row. Called by ScheduledJobEngine.seedNextRunAtForActivatedJobs when a job is activated while polling is live and arrives with a null NextRunAt. Deliberately does NOT touch the lock columns (LockToken, LockedAt, LockedByInstance, ExpectedCompletionAt): a full-entity BaseEntity.Save() during polling would write stale in-memory lock values over a live lock. Same targeted-update rule as spUpdateScheduledJobStatistics.';
