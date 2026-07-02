-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== Stored Procedures (sp*) =====================

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spAcquireScheduledJobLock'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spAcquireScheduledJobLock"(
    IN p_JobID UUID,
    IN p_Token UUID,
    IN p_Instance VARCHAR(255),
    IN p_ExpectedCompletionAt TIMESTAMPTZ
)
RETURNS TABLE("Acquired" INTEGER) AS
$$
DECLARE
    _v_row_count INTEGER;
    p_Now TIMESTAMPTZ := NOW();
    p_RowsAffected INTEGER;
BEGIN
UPDATE __mj."ScheduledJob"
       SET LockToken            = p_Token,
           LockedAt             = p_Now,
           LockedByInstance     = p_Instance,
           ExpectedCompletionAt = p_ExpectedCompletionAt
     WHERE ID = p_JobID
       AND (LockToken IS NULL
            OR ExpectedCompletionAt IS NULL
            OR ExpectedCompletionAt < p_Now);

    p_RowsAffected := _v_row_count;
    RETURN QUERY SELECT p_RowsAffected AS Acquired;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateScheduledJobStatistics'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateScheduledJobStatistics"(
    IN p_JobID UUID,
    IN p_Success BOOLEAN,
    IN p_LastRunAt TIMESTAMPTZ,
    IN p_NextRunAt TIMESTAMPTZ
)
RETURNS VOID AS
$$
BEGIN
UPDATE __mj."ScheduledJob"
       SET RunCount     = RunCount + 1,
           SuccessCount = SuccessCount + CASE WHEN p_Success = TRUE THEN 1 ELSE 0 END,
           FailureCount = FailureCount + CASE WHEN p_Success = FALSE THEN 1 ELSE 0 END,
           LastRunAt    = p_LastRunAt,
           NextRunAt    = p_NextRunAt
     WHERE ID = p_JobID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spReleaseScheduledJobLockIfTokenMatches'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spReleaseScheduledJobLockIfTokenMatches"(
    IN p_JobID UUID,
    IN p_ExpectedToken UUID
)
RETURNS TABLE("Released" INTEGER) AS
$$
DECLARE
    _v_row_count INTEGER;
    p_RowsAffected INTEGER;
BEGIN
UPDATE __mj."ScheduledJob"
       SET LockToken            = NULL,
           LockedAt             = NULL,
           LockedByInstance     = NULL,
           ExpectedCompletionAt = NULL
     WHERE ID = p_JobID
       AND LockToken = p_ExpectedToken;

    p_RowsAffected := _v_row_count;
    RETURN QUERY SELECT p_RowsAffected AS Released;
END;
$$ LANGUAGE plpgsql;


-- ===================== Grants =====================

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spAcquireScheduledJobLock" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spAcquireScheduledJobLock" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateScheduledJobStatistics" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateScheduledJobStatistics" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spReleaseScheduledJobLockIfTokenMatches" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spReleaseScheduledJobLockIfTokenMatches" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
-- ===================== Comments =====================

-- COMMENT ON FUNCTION __mj."spAcquireScheduledJobLock" (procedure-level comment skipped)

-- COMMENT ON FUNCTION __mj."spUpdateScheduledJobStatistics" (procedure-level comment skipped)

-- COMMENT ON FUNCTION __mj."spReleaseScheduledJobLockIfTokenMatches" (procedure-level comment skipped)
