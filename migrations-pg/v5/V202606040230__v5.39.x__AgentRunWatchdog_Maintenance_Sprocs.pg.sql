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
           WHERE proname = 'spStampAIAgentRunHeartbeat'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spStampAIAgentRunHeartbeat"(
    IN p_AgentRunID UUID
)
RETURNS VOID AS
$$
BEGIN
UPDATE __mj."AIAgentRun"
    SET "LastHeartbeatAt" = NOW()
    WHERE "ID" = p_AgentRunID AND "Status" = 'Running';
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spSweepStaleAIAgentRuns'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spSweepStaleAIAgentRuns"(
    IN p_StaleThresholdMinutes INTEGER DEFAULT 5
)
RETURNS TABLE("RunsFailed" INTEGER) AS
$$
DECLARE
    _v_row_count INTEGER;
    p_cutoff TIMESTAMPTZ := (NOW() + -p_StaleThresholdMinutes * INTERVAL '1 minute');
BEGIN
UPDATE __mj."AIAgentRun"
    SET "Status" = 'Failed',
        "CompletedAt" = NOW(),
        "ErrorMessage" = COALESCE("ErrorMessage",
            CONCAT('[watchdog] Run force-failed: no liveness heartbeat for over ',
                   p_StaleThresholdMinutes, ' minute(s) (owning process presumed dead)'))
    WHERE "Status" = 'Running'
      AND ("LastHeartbeatAt" < p_cutoff OR ("LastHeartbeatAt" IS NULL AND "StartedAt" < p_cutoff));
    GET DIAGNOSTICS _v_row_count = ROW_COUNT;
    RETURN QUERY SELECT _v_row_count AS "RunsFailed";
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCancelAIAgentRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCancelAIAgentRun"(
    IN p_AgentRunID UUID
)
RETURNS VOID AS
$$
BEGIN
UPDATE __mj."AIAgentRun"
    SET "Status" = 'Cancelled',
        "CompletedAt" = NOW(),
        "ErrorMessage" = COALESCE("ErrorMessage", '[watchdog] Run orphaned by graceful process shutdown')
    WHERE "ID" = p_AgentRunID AND "Status" = 'Running';
END;
$$ LANGUAGE plpgsql;


-- ===================== Grants =====================

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spStampAIAgentRunHeartbeat" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spSweepStaleAIAgentRuns" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCancelAIAgentRun" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;