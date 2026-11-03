-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610222240__v6.2.x__Recording_Ledger_Columns_Not_Entity_Updatable.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — RESOLVED BY HAND ══╗
-- The AST transpiler reported the CREATE PROCEDURE as unhandled; spStampAIAgentSessionRecordingFile
-- is hand-authored below in the idiom of the other recording-ledger routines
-- (V202610151535__v6.2.x__Realtime_Recording_Shard_Ledger.pg.sql): a plpgsql FUNCTION … RETURNS TABLE
-- with the T-SQL result-set column, T-SQL parameter order (realtime-recording-ledger.ts calls it
-- positionally through ProcedureCallSyntax: `SELECT * FROM __mj."spStampAIAgentSessionRecordingFile"
-- ($1, $2, $3, $4)`), and OUTPUT … INTO a table variable as UPDATE … RETURNING.
--
-- The SQL Server migration's CodeGen tail regenerates spCreate/spUpdateAIAgentSession without the seven
-- recording-ledger columns (AllowUpdateAPI = 0, set by the release's metadata). A gapped counterpart is
-- not baked, so those routines are in the release's PG_CodeGen_Regen.pg-only.sql.
-- ╚════════════════════════════════════════╝

-- Stamps a session's recording file, media kind and t0. Each NULL parameter leaves its column as stored,
-- so a caller writes only what it knows. Returns one row with the session's RecordingStatus after the
-- write, or no row when the session does not exist (the caller treats that as an error).
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = '__mj' AND p.proname = 'spStampAIAgentSessionRecordingFile'
  LOOP
    EXECUTE 'DROP ROUTINE IF EXISTS ' || r.sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION __mj."spStampAIAgentSessionRecordingFile"(
    IN p_AgentSessionID     UUID,
    IN p_RecordingFileID    UUID        DEFAULT NULL,
    IN p_RecordingMedia     VARCHAR(20) DEFAULT NULL,
    IN p_RecordingStartedAt TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE("RecordingStatus" VARCHAR) AS
$mjfn$
#variable_conflict use_column
BEGIN
    RETURN QUERY
    WITH "stamped" AS (
        UPDATE __mj."AIAgentSession" AS "s"
           SET "RecordingFileID"    = COALESCE(p_RecordingFileID, "s"."RecordingFileID"),
               "RecordingMedia"     = COALESCE(p_RecordingMedia, "s"."RecordingMedia"),
               "RecordingStartedAt" = COALESCE(p_RecordingStartedAt, "s"."RecordingStartedAt")
         WHERE "s"."ID" = p_AgentSessionID
        RETURNING "s"."RecordingStatus"
    )
    SELECT "stamped"."RecordingStatus"::VARCHAR FROM "stamped";
END;
$mjfn$ LANGUAGE plpgsql;

-- cdp_Developer and cdp_Integration only, mirroring the T-SQL grant; a role this install lacks is skipped.
DO $$
DECLARE _role TEXT;
BEGIN
  FOREACH _role IN ARRAY ARRAY['cdp_Developer', 'cdp_Integration'] LOOP
    BEGIN
      EXECUTE format('GRANT EXECUTE ON FUNCTION __mj."spStampAIAgentSessionRecordingFile"(UUID, UUID, VARCHAR, TIMESTAMPTZ) TO %I', _role);
    EXCEPTION WHEN undefined_object THEN
      RAISE NOTICE 'Skipping GRANT EXECUTE ON __mj.spStampAIAgentSessionRecordingFile TO %: role does not exist on this install', _role;
    END;
  END LOOP;
END $$;
