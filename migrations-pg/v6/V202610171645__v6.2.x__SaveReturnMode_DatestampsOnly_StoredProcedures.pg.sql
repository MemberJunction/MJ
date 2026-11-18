-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610171645__v6.2.x__SaveReturnMode_DatestampsOnly_StoredProcedures.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- V202610171645__v6.2.x__SaveReturnMode_DatestampsOnly_StoredProcedures.sql — no DDL to translate.
-- CodeGen objects are regenerated natively via `mj codegen` on PG.

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Action Execution Logs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_execution_log_action_id"
    ON "__mj"."ActionExecutionLog" ("ActionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_execution_log_user_id"
    ON "__mj"."ActionExecutionLog" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_execution_log_entity_action_id"
    ON "__mj"."ActionExecutionLog" ("EntityActionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_execution_log_entity_action_invocation_"
    ON "__mj"."ActionExecutionLog" ("EntityActionInvocationTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_action_execution_log_target_entity_id"
    ON "__mj"."ActionExecutionLog" ("TargetEntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Action Execution Logs
-- Item: vwActionExecutionLogs
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Action Execution Logs
-----               SCHEMA:      __mj
-----               BASE TABLE:  ActionExecutionLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwActionExecutionLogs"
AS
SELECT
    a.*,
    MJAction_ActionID."Name" AS "Action",
    MJUser_UserID."Name" AS "User",
    MJEntityActionInvocationType_EntityActionInvocationTypeID."Name" AS "EntityActionInvocationType",
    MJEntity_TargetEntityID."Name" AS "TargetEntity"
FROM
    "__mj"."ActionExecutionLog" AS a
INNER JOIN
    "__mj"."Action" AS MJAction_ActionID
  ON
    "a"."ActionID" = MJAction_ActionID."ID"
INNER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."EntityActionInvocationType" AS MJEntityActionInvocationType_EntityActionInvocationTypeID
  ON
    "a"."EntityActionInvocationTypeID" = MJEntityActionInvocationType_EntityActionInvocationTypeID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_TargetEntityID
  ON
    "a"."TargetEntityID" = MJEntity_TargetEntityID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwActionExecutionLogs'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwActionExecutionLogs'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwActionExecutionLogs" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwActionExecutionLogs" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwActionExecutionLogs" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwActionExecutionLogs" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Action Execution Logs
-- Item: spCreateActionExecutionLog
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ActionExecutionLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateActionExecutionLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateActionExecutionLog"(
    p_id UUID DEFAULT NULL,
    p_actionid UUID DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_params_clear boolean DEFAULT false,
    p_params TEXT DEFAULT NULL,
    p_resultcode_clear boolean DEFAULT false,
    p_resultcode varchar(255) DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_retentionperiod_clear boolean DEFAULT false,
    p_retentionperiod int DEFAULT NULL,
    p_message_clear boolean DEFAULT false,
    p_message TEXT DEFAULT NULL,
    p_entityactionid_clear boolean DEFAULT false,
    p_entityactionid UUID DEFAULT NULL,
    p_entityactioninvocationtypeid_clear boolean DEFAULT false,
    p_entityactioninvocationtypeid UUID DEFAULT NULL,
    p_targetentityid_clear boolean DEFAULT false,
    p_targetentityid UUID DEFAULT NULL,
    p_targetrecordid_clear boolean DEFAULT false,
    p_targetrecordid varchar(450) DEFAULT NULL,
    p_resultparams_clear boolean DEFAULT false,
    p_resultparams TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwActionExecutionLogs" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ActionExecutionLog"
        (
            "ID",
            "ActionID",
                "StartedAt",
                "EndedAt",
                "Params",
                "ResultCode",
                "UserID",
                "RetentionPeriod",
                "Message",
                "EntityActionID",
                "EntityActionInvocationTypeID",
                "TargetEntityID",
                "TargetRecordID",
                "ResultParams"
        )
    VALUES
        (
            v_new_id,
            p_actionid,
                COALESCE(p_startedat, NOW()),
                CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, NULL) END,
                CASE WHEN p_params_clear = true THEN NULL ELSE COALESCE(p_params, NULL) END,
                CASE WHEN p_resultcode_clear = true THEN NULL ELSE COALESCE(p_resultcode, NULL) END,
                p_userid,
                CASE WHEN p_retentionperiod_clear = true THEN NULL ELSE COALESCE(p_retentionperiod, NULL) END,
                CASE WHEN p_message_clear = true THEN NULL ELSE COALESCE(p_message, NULL) END,
                CASE WHEN p_entityactionid_clear = true THEN NULL ELSE COALESCE(p_entityactionid, NULL) END,
                CASE WHEN p_entityactioninvocationtypeid_clear = true THEN NULL ELSE COALESCE(p_entityactioninvocationtypeid, NULL) END,
                CASE WHEN p_targetentityid_clear = true THEN NULL ELSE COALESCE(p_targetentityid, NULL) END,
                CASE WHEN p_targetrecordid_clear = true THEN NULL ELSE COALESCE(p_targetrecordid, NULL) END,
                CASE WHEN p_resultparams_clear = true THEN NULL ELSE COALESCE(p_resultparams, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwActionExecutionLogs"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateActionExecutionLog" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateActionExecutionLog" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Action Execution Logs
-- Item: spUpdateActionExecutionLog
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ActionExecutionLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateActionExecutionLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateActionExecutionLog"(
    p_id UUID,
    p_actionid UUID DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_params_clear boolean DEFAULT false,
    p_params TEXT DEFAULT NULL,
    p_resultcode_clear boolean DEFAULT false,
    p_resultcode varchar(255) DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_retentionperiod_clear boolean DEFAULT false,
    p_retentionperiod int DEFAULT NULL,
    p_message_clear boolean DEFAULT false,
    p_message TEXT DEFAULT NULL,
    p_entityactionid_clear boolean DEFAULT false,
    p_entityactionid UUID DEFAULT NULL,
    p_entityactioninvocationtypeid_clear boolean DEFAULT false,
    p_entityactioninvocationtypeid UUID DEFAULT NULL,
    p_targetentityid_clear boolean DEFAULT false,
    p_targetentityid UUID DEFAULT NULL,
    p_targetrecordid_clear boolean DEFAULT false,
    p_targetrecordid varchar(450) DEFAULT NULL,
    p_resultparams_clear boolean DEFAULT false,
    p_resultparams TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwActionExecutionLogs" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ActionExecutionLog"
    SET
        "ActionID" = COALESCE(p_actionid, "ActionID"),
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "EndedAt" = CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, "EndedAt") END,
        "Params" = CASE WHEN p_params_clear = true THEN NULL ELSE COALESCE(p_params, "Params") END,
        "ResultCode" = CASE WHEN p_resultcode_clear = true THEN NULL ELSE COALESCE(p_resultcode, "ResultCode") END,
        "UserID" = COALESCE(p_userid, "UserID"),
        "RetentionPeriod" = CASE WHEN p_retentionperiod_clear = true THEN NULL ELSE COALESCE(p_retentionperiod, "RetentionPeriod") END,
        "Message" = CASE WHEN p_message_clear = true THEN NULL ELSE COALESCE(p_message, "Message") END,
        "EntityActionID" = CASE WHEN p_entityactionid_clear = true THEN NULL ELSE COALESCE(p_entityactionid, "EntityActionID") END,
        "EntityActionInvocationTypeID" = CASE WHEN p_entityactioninvocationtypeid_clear = true THEN NULL ELSE COALESCE(p_entityactioninvocationtypeid, "EntityActionInvocationTypeID") END,
        "TargetEntityID" = CASE WHEN p_targetentityid_clear = true THEN NULL ELSE COALESCE(p_targetentityid, "TargetEntityID") END,
        "TargetRecordID" = CASE WHEN p_targetrecordid_clear = true THEN NULL ELSE COALESCE(p_targetrecordid, "TargetRecordID") END,
        "ResultParams" = CASE WHEN p_resultparams_clear = true THEN NULL ELSE COALESCE(p_resultparams, "ResultParams") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwActionExecutionLogs"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateActionExecutionLog" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateActionExecutionLog" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ActionExecutionLog table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_action_execution_log"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_action_execution_log" ON "__mj"."ActionExecutionLog";

CREATE TRIGGER "trg_update_action_execution_log"
BEFORE UPDATE ON "__mj"."ActionExecutionLog"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_action_execution_log"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Action Execution Logs
-- Item: spDeleteActionExecutionLog
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ActionExecutionLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteActionExecutionLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteActionExecutionLog"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ActionExecutionLog"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteActionExecutionLog" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Medias
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_media_agent_run_id"
    ON "__mj"."AIAgentRunMedia" ("AgentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_media_source_prompt_run_media_id"
    ON "__mj"."AIAgentRunMedia" ("SourcePromptRunMediaID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_media_modality_id"
    ON "__mj"."AIAgentRunMedia" ("ModalityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_media_file_id"
    ON "__mj"."AIAgentRunMedia" ("FileID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Medias
-- Item: vwAIAgentRunMedias
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Run Medias
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentRunMedia
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgentRunMedias"
AS
SELECT
    a.*,
    MJAIAgentRun_AgentRunID."RunName" AS "AgentRun",
    MJAIPromptRunMedia_SourcePromptRunMediaID."FileName" AS "SourcePromptRunMedia",
    MJAIModality_ModalityID."Name" AS "Modality",
    MJFile_FileID."Name" AS "File"
FROM
    "__mj"."AIAgentRunMedia" AS a
INNER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_AgentRunID
  ON
    "a"."AgentRunID" = MJAIAgentRun_AgentRunID."ID"
LEFT OUTER JOIN
    "__mj"."AIPromptRunMedia" AS MJAIPromptRunMedia_SourcePromptRunMediaID
  ON
    "a"."SourcePromptRunMediaID" = MJAIPromptRunMedia_SourcePromptRunMediaID."ID"
INNER JOIN
    "__mj"."AIModality" AS MJAIModality_ModalityID
  ON
    "a"."ModalityID" = MJAIModality_ModalityID."ID"
LEFT OUTER JOIN
    "__mj"."File" AS MJFile_FileID
  ON
    "a"."FileID" = MJFile_FileID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgentRunMedias'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwAIAgentRunMedias'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgentRunMedias" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAIAgentRunMedias" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgentRunMedias" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentRunMedias" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Medias
-- Item: spCreateAIAgentRunMedia
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRunMedia
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentRunMedia'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentRunMedia"(
    p_id UUID DEFAULT NULL,
    p_agentrunid UUID DEFAULT NULL,
    p_sourcepromptrunmediaid_clear boolean DEFAULT false,
    p_sourcepromptrunmediaid UUID DEFAULT NULL,
    p_modalityid UUID DEFAULT NULL,
    p_mimetype varchar(100) DEFAULT NULL,
    p_filename_clear boolean DEFAULT false,
    p_filename varchar(255) DEFAULT NULL,
    p_filesizebytes_clear boolean DEFAULT false,
    p_filesizebytes int DEFAULT NULL,
    p_width_clear boolean DEFAULT false,
    p_width int DEFAULT NULL,
    p_height_clear boolean DEFAULT false,
    p_height int DEFAULT NULL,
    p_durationseconds_clear boolean DEFAULT false,
    p_durationseconds decimal(10, 2) DEFAULT NULL,
    p_inlinedata_clear boolean DEFAULT false,
    p_inlinedata TEXT DEFAULT NULL,
    p_fileid_clear boolean DEFAULT false,
    p_fileid UUID DEFAULT NULL,
    p_thumbnailbase64_clear boolean DEFAULT false,
    p_thumbnailbase64 TEXT DEFAULT NULL,
    p_label_clear boolean DEFAULT false,
    p_label varchar(255) DEFAULT NULL,
    p_metadata_clear boolean DEFAULT false,
    p_metadata TEXT DEFAULT NULL,
    p_displayorder int DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentRunMedias" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIAgentRunMedia"
        (
            "ID",
            "AgentRunID",
                "SourcePromptRunMediaID",
                "ModalityID",
                "MimeType",
                "FileName",
                "FileSizeBytes",
                "Width",
                "Height",
                "DurationSeconds",
                "InlineData",
                "FileID",
                "ThumbnailBase64",
                "Label",
                "Metadata",
                "DisplayOrder",
                "Description"
        )
    VALUES
        (
            v_new_id,
            p_agentrunid,
                CASE WHEN p_sourcepromptrunmediaid_clear = true THEN NULL ELSE COALESCE(p_sourcepromptrunmediaid, NULL) END,
                p_modalityid,
                p_mimetype,
                CASE WHEN p_filename_clear = true THEN NULL ELSE COALESCE(p_filename, NULL) END,
                CASE WHEN p_filesizebytes_clear = true THEN NULL ELSE COALESCE(p_filesizebytes, NULL) END,
                CASE WHEN p_width_clear = true THEN NULL ELSE COALESCE(p_width, NULL) END,
                CASE WHEN p_height_clear = true THEN NULL ELSE COALESCE(p_height, NULL) END,
                CASE WHEN p_durationseconds_clear = true THEN NULL ELSE COALESCE(p_durationseconds, NULL) END,
                CASE WHEN p_inlinedata_clear = true THEN NULL ELSE COALESCE(p_inlinedata, NULL) END,
                CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, NULL) END,
                CASE WHEN p_thumbnailbase64_clear = true THEN NULL ELSE COALESCE(p_thumbnailbase64, NULL) END,
                CASE WHEN p_label_clear = true THEN NULL ELSE COALESCE(p_label, NULL) END,
                CASE WHEN p_metadata_clear = true THEN NULL ELSE COALESCE(p_metadata, NULL) END,
                COALESCE(p_displayorder, 0),
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRunMedias"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRunMedia" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRunMedia" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRunMedia" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Medias
-- Item: spUpdateAIAgentRunMedia
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRunMedia
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentRunMedia'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentRunMedia"(
    p_id UUID,
    p_agentrunid UUID DEFAULT NULL,
    p_sourcepromptrunmediaid_clear boolean DEFAULT false,
    p_sourcepromptrunmediaid UUID DEFAULT NULL,
    p_modalityid UUID DEFAULT NULL,
    p_mimetype varchar(100) DEFAULT NULL,
    p_filename_clear boolean DEFAULT false,
    p_filename varchar(255) DEFAULT NULL,
    p_filesizebytes_clear boolean DEFAULT false,
    p_filesizebytes int DEFAULT NULL,
    p_width_clear boolean DEFAULT false,
    p_width int DEFAULT NULL,
    p_height_clear boolean DEFAULT false,
    p_height int DEFAULT NULL,
    p_durationseconds_clear boolean DEFAULT false,
    p_durationseconds decimal(10, 2) DEFAULT NULL,
    p_inlinedata_clear boolean DEFAULT false,
    p_inlinedata TEXT DEFAULT NULL,
    p_fileid_clear boolean DEFAULT false,
    p_fileid UUID DEFAULT NULL,
    p_thumbnailbase64_clear boolean DEFAULT false,
    p_thumbnailbase64 TEXT DEFAULT NULL,
    p_label_clear boolean DEFAULT false,
    p_label varchar(255) DEFAULT NULL,
    p_metadata_clear boolean DEFAULT false,
    p_metadata TEXT DEFAULT NULL,
    p_displayorder int DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentRunMedias" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIAgentRunMedia"
    SET
        "AgentRunID" = COALESCE(p_agentrunid, "AgentRunID"),
        "SourcePromptRunMediaID" = CASE WHEN p_sourcepromptrunmediaid_clear = true THEN NULL ELSE COALESCE(p_sourcepromptrunmediaid, "SourcePromptRunMediaID") END,
        "ModalityID" = COALESCE(p_modalityid, "ModalityID"),
        "MimeType" = COALESCE(p_mimetype, "MimeType"),
        "FileName" = CASE WHEN p_filename_clear = true THEN NULL ELSE COALESCE(p_filename, "FileName") END,
        "FileSizeBytes" = CASE WHEN p_filesizebytes_clear = true THEN NULL ELSE COALESCE(p_filesizebytes, "FileSizeBytes") END,
        "Width" = CASE WHEN p_width_clear = true THEN NULL ELSE COALESCE(p_width, "Width") END,
        "Height" = CASE WHEN p_height_clear = true THEN NULL ELSE COALESCE(p_height, "Height") END,
        "DurationSeconds" = CASE WHEN p_durationseconds_clear = true THEN NULL ELSE COALESCE(p_durationseconds, "DurationSeconds") END,
        "InlineData" = CASE WHEN p_inlinedata_clear = true THEN NULL ELSE COALESCE(p_inlinedata, "InlineData") END,
        "FileID" = CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, "FileID") END,
        "ThumbnailBase64" = CASE WHEN p_thumbnailbase64_clear = true THEN NULL ELSE COALESCE(p_thumbnailbase64, "ThumbnailBase64") END,
        "Label" = CASE WHEN p_label_clear = true THEN NULL ELSE COALESCE(p_label, "Label") END,
        "Metadata" = CASE WHEN p_metadata_clear = true THEN NULL ELSE COALESCE(p_metadata, "Metadata") END,
        "DisplayOrder" = COALESCE(p_displayorder, "DisplayOrder"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRunMedias"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRunMedia" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRunMedia" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRunMedia" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRunMedia table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_run_media"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_run_media" ON "__mj"."AIAgentRunMedia";

CREATE TRIGGER "trg_update_ai_agent_run_media"
BEFORE UPDATE ON "__mj"."AIAgentRunMedia"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_run_media"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Medias
-- Item: spDeleteAIAgentRunMedia
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentRunMedia
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentRunMedia'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentRunMedia"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AIAgentRunMedia"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRunMedia" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRunMedia" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_step_agent_run_id"
    ON "__mj"."AIAgentRunStep" ("AgentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_step_parent_id"
    ON "__mj"."AIAgentRunStep" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_step_payload_at_start_source_step"
    ON "__mj"."AIAgentRunStep" ("PayloadAtStartSourceStepID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_step_payload_at_end_source_step_i"
    ON "__mj"."AIAgentRunStep" ("PayloadAtEndSourceStepID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: fn_ai_agent_run_step_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: AIAgentRunStep.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_step_parent_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRunStep"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgentRunStep" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgentRunStep" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgentRunStep" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: fn_ai_agent_run_step_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: AIAgentRunStep.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_step_parent_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRunStep"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRunStep" c
        INNER JOIN
            cte_descendants p ON c."ParentID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgentRunStep" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgentRunStep" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: fn_ai_agent_run_step_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: AIAgentRunStep.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_step_parent_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRunStep"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgentRunStep" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: fn_ai_agent_run_step_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRunStep.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_step_parent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."AIAgentRunStep"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            "__mj"."AIAgentRunStep" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: vwAIAgentRunSteps
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Run Steps
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentRunStep
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgentRunSteps"
AS
SELECT
    a.*,
    MJAIAgentRun_AgentRunID."RunName" AS "AgentRun",
    MJAIAgentRunStep_ParentID."StepName" AS "Parent",
    MJAIAgentRunStep_PayloadAtStartSourceStepID."StepName" AS "PayloadAtStartSourceStep",
    MJAIAgentRunStep_PayloadAtEndSourceStepID."StepName" AS "PayloadAtEndSourceStep",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."AIAgentRunStep" AS a
INNER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_AgentRunID
  ON
    "a"."AgentRunID" = MJAIAgentRun_AgentRunID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRunStep" AS MJAIAgentRunStep_ParentID
  ON
    "a"."ParentID" = MJAIAgentRunStep_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRunStep" AS MJAIAgentRunStep_PayloadAtStartSourceStepID
  ON
    "a"."PayloadAtStartSourceStepID" = MJAIAgentRunStep_PayloadAtStartSourceStepID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRunStep" AS MJAIAgentRunStep_PayloadAtEndSourceStepID
  ON
    "a"."PayloadAtEndSourceStepID" = MJAIAgentRunStep_PayloadAtEndSourceStepID."ID"

LEFT JOIN LATERAL "__mj"."fn_ai_agent_run_step_parent_id_get_hierarchy_meta"(a."ID", a."ParentID") AS hier_ParentID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgentRunSteps'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwAIAgentRunSteps'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgentRunSteps" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAIAgentRunSteps" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgentRunSteps" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentRunSteps" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: spCreateAIAgentRunStep
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRunStep
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentRunStep'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentRunStep"(
    p_id UUID DEFAULT NULL,
    p_agentrunid UUID DEFAULT NULL,
    p_stepnumber int DEFAULT NULL,
    p_steptype varchar(50) DEFAULT NULL,
    p_stepname varchar(255) DEFAULT NULL,
    p_targetid_clear boolean DEFAULT false,
    p_targetid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_success_clear boolean DEFAULT false,
    p_success BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_inputdata_clear boolean DEFAULT false,
    p_inputdata TEXT DEFAULT NULL,
    p_outputdata_clear boolean DEFAULT false,
    p_outputdata TEXT DEFAULT NULL,
    p_targetlogid_clear boolean DEFAULT false,
    p_targetlogid UUID DEFAULT NULL,
    p_payloadatstart_clear boolean DEFAULT false,
    p_payloadatstart TEXT DEFAULT NULL,
    p_payloadatend_clear boolean DEFAULT false,
    p_payloadatend TEXT DEFAULT NULL,
    p_finalpayloadvalidationresult_clear boolean DEFAULT false,
    p_finalpayloadvalidationresult varchar(25) DEFAULT NULL,
    p_finalpayloadvalidationmessages_clear boolean DEFAULT false,
    p_finalpayloadvalidationmessages TEXT DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_skills_clear boolean DEFAULT false,
    p_skills TEXT DEFAULT NULL,
    p_toolcallingmode_clear boolean DEFAULT false,
    p_toolcallingmode varchar(25) DEFAULT NULL,
    p_nativetoolcallcount_clear boolean DEFAULT false,
    p_nativetoolcallcount int DEFAULT NULL,
    p_nativedualchannel_clear boolean DEFAULT false,
    p_nativedualchannel BOOLEAN DEFAULT NULL,
    p_nativetoolresultssent_clear boolean DEFAULT false,
    p_nativetoolresultssent BOOLEAN DEFAULT NULL,
    p_payloadatstartsourcestepid_clear boolean DEFAULT false,
    p_payloadatstartsourcestepid UUID DEFAULT NULL,
    p_payloadatendsourcestepid_clear boolean DEFAULT false,
    p_payloadatendsourcestepid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentRunSteps" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIAgentRunStep"
        (
            "ID",
            "AgentRunID",
                "StepNumber",
                "StepType",
                "StepName",
                "TargetID",
                "Status",
                "StartedAt",
                "CompletedAt",
                "Success",
                "ErrorMessage",
                "InputData",
                "OutputData",
                "TargetLogID",
                "PayloadAtStart",
                "PayloadAtEnd",
                "FinalPayloadValidationResult",
                "FinalPayloadValidationMessages",
                "ParentID",
                "Comments",
                "Skills",
                "ToolCallingMode",
                "NativeToolCallCount",
                "NativeDualChannel",
                "NativeToolResultsSent",
                "PayloadAtStartSourceStepID",
                "PayloadAtEndSourceStepID"
        )
    VALUES
        (
            v_new_id,
            p_agentrunid,
                p_stepnumber,
                COALESCE(p_steptype, 'Prompt'),
                p_stepname,
                CASE WHEN p_targetid_clear = true THEN NULL ELSE COALESCE(p_targetid, NULL) END,
                COALESCE(p_status, 'Running'),
                COALESCE(p_startedat, NOW()),
                CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, NULL) END,
                CASE WHEN p_success_clear = true THEN NULL ELSE COALESCE(p_success, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_inputdata_clear = true THEN NULL ELSE COALESCE(p_inputdata, NULL) END,
                CASE WHEN p_outputdata_clear = true THEN NULL ELSE COALESCE(p_outputdata, NULL) END,
                CASE WHEN p_targetlogid_clear = true THEN NULL ELSE COALESCE(p_targetlogid, NULL) END,
                CASE WHEN p_payloadatstart_clear = true THEN NULL ELSE COALESCE(p_payloadatstart, NULL) END,
                CASE WHEN p_payloadatend_clear = true THEN NULL ELSE COALESCE(p_payloadatend, NULL) END,
                CASE WHEN p_finalpayloadvalidationresult_clear = true THEN NULL ELSE COALESCE(p_finalpayloadvalidationresult, NULL) END,
                CASE WHEN p_finalpayloadvalidationmessages_clear = true THEN NULL ELSE COALESCE(p_finalpayloadvalidationmessages, NULL) END,
                CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, NULL) END,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                CASE WHEN p_skills_clear = true THEN NULL ELSE COALESCE(p_skills, NULL) END,
                CASE WHEN p_toolcallingmode_clear = true THEN NULL ELSE COALESCE(p_toolcallingmode, NULL) END,
                CASE WHEN p_nativetoolcallcount_clear = true THEN NULL ELSE COALESCE(p_nativetoolcallcount, NULL) END,
                CASE WHEN p_nativedualchannel_clear = true THEN NULL ELSE COALESCE(p_nativedualchannel, NULL) END,
                CASE WHEN p_nativetoolresultssent_clear = true THEN NULL ELSE COALESCE(p_nativetoolresultssent, NULL) END,
                CASE WHEN p_payloadatstartsourcestepid_clear = true THEN NULL ELSE COALESCE(p_payloadatstartsourcestepid, NULL) END,
                CASE WHEN p_payloadatendsourcestepid_clear = true THEN NULL ELSE COALESCE(p_payloadatendsourcestepid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRunSteps"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRunStep" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRunStep" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRunStep" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: spUpdateAIAgentRunStep
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRunStep
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentRunStep'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentRunStep"(
    p_id UUID,
    p_agentrunid UUID DEFAULT NULL,
    p_stepnumber int DEFAULT NULL,
    p_steptype varchar(50) DEFAULT NULL,
    p_stepname varchar(255) DEFAULT NULL,
    p_targetid_clear boolean DEFAULT false,
    p_targetid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_success_clear boolean DEFAULT false,
    p_success BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_inputdata_clear boolean DEFAULT false,
    p_inputdata TEXT DEFAULT NULL,
    p_outputdata_clear boolean DEFAULT false,
    p_outputdata TEXT DEFAULT NULL,
    p_targetlogid_clear boolean DEFAULT false,
    p_targetlogid UUID DEFAULT NULL,
    p_payloadatstart_clear boolean DEFAULT false,
    p_payloadatstart TEXT DEFAULT NULL,
    p_payloadatend_clear boolean DEFAULT false,
    p_payloadatend TEXT DEFAULT NULL,
    p_finalpayloadvalidationresult_clear boolean DEFAULT false,
    p_finalpayloadvalidationresult varchar(25) DEFAULT NULL,
    p_finalpayloadvalidationmessages_clear boolean DEFAULT false,
    p_finalpayloadvalidationmessages TEXT DEFAULT NULL,
    p_parentid_clear boolean DEFAULT false,
    p_parentid UUID DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_skills_clear boolean DEFAULT false,
    p_skills TEXT DEFAULT NULL,
    p_toolcallingmode_clear boolean DEFAULT false,
    p_toolcallingmode varchar(25) DEFAULT NULL,
    p_nativetoolcallcount_clear boolean DEFAULT false,
    p_nativetoolcallcount int DEFAULT NULL,
    p_nativedualchannel_clear boolean DEFAULT false,
    p_nativedualchannel BOOLEAN DEFAULT NULL,
    p_nativetoolresultssent_clear boolean DEFAULT false,
    p_nativetoolresultssent BOOLEAN DEFAULT NULL,
    p_payloadatstartsourcestepid_clear boolean DEFAULT false,
    p_payloadatstartsourcestepid UUID DEFAULT NULL,
    p_payloadatendsourcestepid_clear boolean DEFAULT false,
    p_payloadatendsourcestepid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentRunSteps" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIAgentRunStep"
    SET
        "AgentRunID" = COALESCE(p_agentrunid, "AgentRunID"),
        "StepNumber" = COALESCE(p_stepnumber, "StepNumber"),
        "StepType" = COALESCE(p_steptype, "StepType"),
        "StepName" = COALESCE(p_stepname, "StepName"),
        "TargetID" = CASE WHEN p_targetid_clear = true THEN NULL ELSE COALESCE(p_targetid, "TargetID") END,
        "Status" = COALESCE(p_status, "Status"),
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "CompletedAt" = CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, "CompletedAt") END,
        "Success" = CASE WHEN p_success_clear = true THEN NULL ELSE COALESCE(p_success, "Success") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "InputData" = CASE WHEN p_inputdata_clear = true THEN NULL ELSE COALESCE(p_inputdata, "InputData") END,
        "OutputData" = CASE WHEN p_outputdata_clear = true THEN NULL ELSE COALESCE(p_outputdata, "OutputData") END,
        "TargetLogID" = CASE WHEN p_targetlogid_clear = true THEN NULL ELSE COALESCE(p_targetlogid, "TargetLogID") END,
        "PayloadAtStart" = CASE WHEN p_payloadatstart_clear = true THEN NULL ELSE COALESCE(p_payloadatstart, "PayloadAtStart") END,
        "PayloadAtEnd" = CASE WHEN p_payloadatend_clear = true THEN NULL ELSE COALESCE(p_payloadatend, "PayloadAtEnd") END,
        "FinalPayloadValidationResult" = CASE WHEN p_finalpayloadvalidationresult_clear = true THEN NULL ELSE COALESCE(p_finalpayloadvalidationresult, "FinalPayloadValidationResult") END,
        "FinalPayloadValidationMessages" = CASE WHEN p_finalpayloadvalidationmessages_clear = true THEN NULL ELSE COALESCE(p_finalpayloadvalidationmessages, "FinalPayloadValidationMessages") END,
        "ParentID" = CASE WHEN p_parentid_clear = true THEN NULL ELSE COALESCE(p_parentid, "ParentID") END,
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "Skills" = CASE WHEN p_skills_clear = true THEN NULL ELSE COALESCE(p_skills, "Skills") END,
        "ToolCallingMode" = CASE WHEN p_toolcallingmode_clear = true THEN NULL ELSE COALESCE(p_toolcallingmode, "ToolCallingMode") END,
        "NativeToolCallCount" = CASE WHEN p_nativetoolcallcount_clear = true THEN NULL ELSE COALESCE(p_nativetoolcallcount, "NativeToolCallCount") END,
        "NativeDualChannel" = CASE WHEN p_nativedualchannel_clear = true THEN NULL ELSE COALESCE(p_nativedualchannel, "NativeDualChannel") END,
        "NativeToolResultsSent" = CASE WHEN p_nativetoolresultssent_clear = true THEN NULL ELSE COALESCE(p_nativetoolresultssent, "NativeToolResultsSent") END,
        "PayloadAtStartSourceStepID" = CASE WHEN p_payloadatstartsourcestepid_clear = true THEN NULL ELSE COALESCE(p_payloadatstartsourcestepid, "PayloadAtStartSourceStepID") END,
        "PayloadAtEndSourceStepID" = CASE WHEN p_payloadatendsourcestepid_clear = true THEN NULL ELSE COALESCE(p_payloadatendsourcestepid, "PayloadAtEndSourceStepID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRunSteps"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRunStep" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRunStep" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRunStep" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRunStep table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_run_step"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_run_step" ON "__mj"."AIAgentRunStep";

CREATE TRIGGER "trg_update_ai_agent_run_step"
BEFORE UPDATE ON "__mj"."AIAgentRunStep"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_run_step"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Run Steps
-- Item: spDeleteAIAgentRunStep
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentRunStep
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentRunStep'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentRunStep"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Requests.OriginatingAgentRunStepID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRequest"
        WHERE "OriginatingAgentRunStepID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRequest"
        SET "OriginatingAgentRunStepID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Run Steps.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRunStep"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRunStep"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Run Steps.PayloadAtStartSourceStepID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRunStep"
        WHERE "PayloadAtStartSourceStepID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRunStep"
        SET "PayloadAtStartSourceStepID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Run Steps.PayloadAtEndSourceStepID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRunStep"
        WHERE "PayloadAtEndSourceStepID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRunStep"
        SET "PayloadAtEndSourceStepID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIAgentRunStep"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRunStep" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRunStep" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_id"
    ON "__mj"."AIAgentRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_parent_run_id"
    ON "__mj"."AIAgentRun" ("ParentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_id"
    ON "__mj"."AIAgentRun" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_user_id"
    ON "__mj"."AIAgentRun" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_detail_id"
    ON "__mj"."AIAgentRun" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_last_run_id"
    ON "__mj"."AIAgentRun" ("LastRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_configuration_id"
    ON "__mj"."AIAgentRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_model_id"
    ON "__mj"."AIAgentRun" ("OverrideModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_vendor_id"
    ON "__mj"."AIAgentRun" ("OverrideVendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_scheduled_job_run_id"
    ON "__mj"."AIAgentRun" ("ScheduledJobRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_test_run_id"
    ON "__mj"."AIAgentRun" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_primary_scope_entity_id"
    ON "__mj"."AIAgentRun" ("PrimaryScopeEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_session_id"
    ON "__mj"."AIAgentRun" ("AgentSessionID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentRunID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentRunID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgentRun" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentRunID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentRunID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentRunID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentRunID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun" c
        INNER JOIN
            cte_descendants p ON c."ParentRunID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIAgentRun" WHERE "ParentRunID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentRunID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIAgentRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentRunID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIAgentRun" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentRunID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fn_ai_agent_run_parent_run_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_agent_run_parent_run_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."AIAgentRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentRunID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            "__mj"."AIAgentRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentRunID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentRunID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: vwAIAgentRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgentRuns"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIAgentRun_ParentRunID."RunName" AS "ParentRun",
    MJConversation_ConversationID."Name" AS "Conversation",
    MJUser_UserID."Name" AS "User",
    MJConversationDetail_ConversationDetailID."ExternalID" AS "ConversationDetail",
    MJAIAgentRun_LastRunID."RunName" AS "LastRun",
    MJAIConfiguration_ConfigurationID."Name" AS "Configuration",
    MJAIModel_OverrideModelID."Name" AS "OverrideModel",
    MJAIVendor_OverrideVendorID."Name" AS "OverrideVendor",
    MJScheduledJobRun_ScheduledJobRunID."ScheduledJob" AS "ScheduledJobRun",
    MJTestRun_TestRunID."Test" AS "TestRun",
    MJEntity_PrimaryScopeEntityID."Name" AS "PrimaryScopeEntity",
    hier_ParentRunID."RootID" AS "RootParentRunID",
    hier_ParentRunID."Depth" AS "ParentRunIDDepth",
    hier_ParentRunID."Path" AS "ParentRunIDPath",
    hier_ParentRunID."IsLeaf" AS "ParentRunIDIsLeaf",
    hier_ParentRunID."ChildCount" AS "ParentRunIDChildCount"
FROM
    "__mj"."AIAgentRun" AS a
INNER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_ParentRunID
  ON
    "a"."ParentRunID" = MJAIAgentRun_ParentRunID."ID"
LEFT OUTER JOIN
    "__mj"."Conversation" AS MJConversation_ConversationID
  ON
    "a"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "a"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_LastRunID
  ON
    "a"."LastRunID" = MJAIAgentRun_LastRunID."ID"
LEFT OUTER JOIN
    "__mj"."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_OverrideModelID
  ON
    "a"."OverrideModelID" = MJAIModel_OverrideModelID."ID"
LEFT OUTER JOIN
    "__mj"."AIVendor" AS MJAIVendor_OverrideVendorID
  ON
    "a"."OverrideVendorID" = MJAIVendor_OverrideVendorID."ID"
LEFT OUTER JOIN
    "__mj"."vwScheduledJobRuns" AS MJScheduledJobRun_ScheduledJobRunID
  ON
    "a"."ScheduledJobRunID" = MJScheduledJobRun_ScheduledJobRunID."ID"
LEFT OUTER JOIN
    "__mj"."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "a"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "a"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"

LEFT JOIN LATERAL "__mj"."fn_ai_agent_run_parent_run_id_get_hierarchy_meta"(a."ID", a."ParentRunID") AS hier_ParentRunID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgentRuns'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwAIAgentRuns'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgentRuns" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAIAgentRuns" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIAgentRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spCreateAIAgentRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentRun"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIAgentRuns"
AS $$
DECLARE
    v_id UUID;
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::UUID;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    v_col_list := quote_ident('ID');
    v_val_list := quote_literal(v_id) || '::UUID';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY['AgentID', 'ParentRunID', 'Status', 'StartedAt', 'CompletedAt', 'Success', 'ErrorMessage', 'ConversationID', 'UserID', 'Result', 'AgentState', 'TotalTokensUsed', 'TotalCost', 'TotalPromptTokensUsed', 'TotalCompletionTokensUsed', 'TotalTokensUsedRollup', 'TotalPromptTokensUsedRollup', 'TotalCompletionTokensUsedRollup', 'TotalCostRollup', 'ConversationDetailID', 'ConversationDetailSequence', 'CancellationReason', 'FinalStep', 'FinalPayload', 'Message', 'LastRunID', 'StartingPayload', 'TotalPromptIterations', 'ConfigurationID', 'OverrideModelID', 'OverrideVendorID', 'Data', 'Verbose', 'EffortLevel', 'RunName', 'Comments', 'ScheduledJobRunID', 'TestRunID', 'PrimaryScopeEntityID', 'PrimaryScopeRecordID', 'SecondaryScopes', 'ExternalReferenceID', 'CompanyID', 'TotalCacheReadTokensUsed', 'TotalCacheWriteTokensUsed', 'LastHeartbeatAt', 'AgentSessionID', 'PlanMode', 'ExternalSessionID', 'ContinuationDepth']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'AgentID' THEN '($1->>''AgentID'')::UUID'
        WHEN 'ParentRunID' THEN '($1->>''ParentRunID'')::UUID'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Running'')'
        WHEN 'StartedAt' THEN 'COALESCE(($1->>''StartedAt'')::TIMESTAMPTZ, NOW())'
        WHEN 'CompletedAt' THEN '($1->>''CompletedAt'')::TIMESTAMPTZ'
        WHEN 'Success' THEN '($1->>''Success'')::BOOLEAN'
        WHEN 'ErrorMessage' THEN '($1->>''ErrorMessage'')'
        WHEN 'ConversationID' THEN '($1->>''ConversationID'')::UUID'
        WHEN 'UserID' THEN '($1->>''UserID'')::UUID'
        WHEN 'Result' THEN '($1->>''Result'')'
        WHEN 'AgentState' THEN '($1->>''AgentState'')'
        WHEN 'TotalTokensUsed' THEN '($1->>''TotalTokensUsed'')::INT'
        WHEN 'TotalCost' THEN '($1->>''TotalCost'')::DECIMAL(18, 6)'
        WHEN 'TotalPromptTokensUsed' THEN '($1->>''TotalPromptTokensUsed'')::INT'
        WHEN 'TotalCompletionTokensUsed' THEN '($1->>''TotalCompletionTokensUsed'')::INT'
        WHEN 'TotalTokensUsedRollup' THEN '($1->>''TotalTokensUsedRollup'')::INT'
        WHEN 'TotalPromptTokensUsedRollup' THEN '($1->>''TotalPromptTokensUsedRollup'')::INT'
        WHEN 'TotalCompletionTokensUsedRollup' THEN '($1->>''TotalCompletionTokensUsedRollup'')::INT'
        WHEN 'TotalCostRollup' THEN '($1->>''TotalCostRollup'')::DECIMAL(19, 8)'
        WHEN 'ConversationDetailID' THEN '($1->>''ConversationDetailID'')::UUID'
        WHEN 'ConversationDetailSequence' THEN '($1->>''ConversationDetailSequence'')::INT'
        WHEN 'CancellationReason' THEN '($1->>''CancellationReason'')'
        WHEN 'FinalStep' THEN '($1->>''FinalStep'')'
        WHEN 'FinalPayload' THEN '($1->>''FinalPayload'')'
        WHEN 'Message' THEN '($1->>''Message'')'
        WHEN 'LastRunID' THEN '($1->>''LastRunID'')::UUID'
        WHEN 'StartingPayload' THEN '($1->>''StartingPayload'')'
        WHEN 'TotalPromptIterations' THEN 'COALESCE(($1->>''TotalPromptIterations'')::INT, 0)'
        WHEN 'ConfigurationID' THEN '($1->>''ConfigurationID'')::UUID'
        WHEN 'OverrideModelID' THEN '($1->>''OverrideModelID'')::UUID'
        WHEN 'OverrideVendorID' THEN '($1->>''OverrideVendorID'')::UUID'
        WHEN 'Data' THEN '($1->>''Data'')'
        WHEN 'Verbose' THEN '($1->>''Verbose'')::BOOLEAN'
        WHEN 'EffortLevel' THEN '($1->>''EffortLevel'')::INT'
        WHEN 'RunName' THEN '($1->>''RunName'')'
        WHEN 'Comments' THEN '($1->>''Comments'')'
        WHEN 'ScheduledJobRunID' THEN '($1->>''ScheduledJobRunID'')::UUID'
        WHEN 'TestRunID' THEN '($1->>''TestRunID'')::UUID'
        WHEN 'PrimaryScopeEntityID' THEN '($1->>''PrimaryScopeEntityID'')::UUID'
        WHEN 'PrimaryScopeRecordID' THEN '($1->>''PrimaryScopeRecordID'')'
        WHEN 'SecondaryScopes' THEN '($1->>''SecondaryScopes'')'
        WHEN 'ExternalReferenceID' THEN '($1->>''ExternalReferenceID'')'
        WHEN 'CompanyID' THEN '($1->>''CompanyID'')::UUID'
        WHEN 'TotalCacheReadTokensUsed' THEN '($1->>''TotalCacheReadTokensUsed'')::INT'
        WHEN 'TotalCacheWriteTokensUsed' THEN '($1->>''TotalCacheWriteTokensUsed'')::INT'
        WHEN 'LastHeartbeatAt' THEN '($1->>''LastHeartbeatAt'')::TIMESTAMPTZ'
        WHEN 'AgentSessionID' THEN '($1->>''AgentSessionID'')::UUID'
        WHEN 'PlanMode' THEN 'COALESCE(($1->>''PlanMode'')::BOOLEAN, FALSE)'
        WHEN 'ExternalSessionID' THEN '($1->>''ExternalSessionID'')'
        WHEN 'ContinuationDepth' THEN 'COALESCE(($1->>''ContinuationDepth'')::INTEGER, 0)'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO "__mj"."AIAgentRun" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spUpdateAIAgentRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentRun"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIAgentRuns"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgentRun: p_data must include "ID"';
    END IF;

    UPDATE "__mj"."AIAgentRun"
    SET
        "AgentID" = CASE WHEN p_data ? 'AgentID' THEN (p_data->>'AgentID')::UUID ELSE "AgentID" END,
        "ParentRunID" = CASE WHEN p_data ? 'ParentRunID' THEN (p_data->>'ParentRunID')::UUID ELSE "ParentRunID" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "StartedAt" = CASE WHEN p_data ? 'StartedAt' THEN (p_data->>'StartedAt')::TIMESTAMPTZ ELSE "StartedAt" END,
        "CompletedAt" = CASE WHEN p_data ? 'CompletedAt' THEN (p_data->>'CompletedAt')::TIMESTAMPTZ ELSE "CompletedAt" END,
        "Success" = CASE WHEN p_data ? 'Success' THEN (p_data->>'Success')::BOOLEAN ELSE "Success" END,
        "ErrorMessage" = CASE WHEN p_data ? 'ErrorMessage' THEN (p_data->>'ErrorMessage') ELSE "ErrorMessage" END,
        "ConversationID" = CASE WHEN p_data ? 'ConversationID' THEN (p_data->>'ConversationID')::UUID ELSE "ConversationID" END,
        "UserID" = CASE WHEN p_data ? 'UserID' THEN (p_data->>'UserID')::UUID ELSE "UserID" END,
        "Result" = CASE WHEN p_data ? 'Result' THEN (p_data->>'Result') ELSE "Result" END,
        "AgentState" = CASE WHEN p_data ? 'AgentState' THEN (p_data->>'AgentState') ELSE "AgentState" END,
        "TotalTokensUsed" = CASE WHEN p_data ? 'TotalTokensUsed' THEN (p_data->>'TotalTokensUsed')::INT ELSE "TotalTokensUsed" END,
        "TotalCost" = CASE WHEN p_data ? 'TotalCost' THEN (p_data->>'TotalCost')::DECIMAL(18, 6) ELSE "TotalCost" END,
        "TotalPromptTokensUsed" = CASE WHEN p_data ? 'TotalPromptTokensUsed' THEN (p_data->>'TotalPromptTokensUsed')::INT ELSE "TotalPromptTokensUsed" END,
        "TotalCompletionTokensUsed" = CASE WHEN p_data ? 'TotalCompletionTokensUsed' THEN (p_data->>'TotalCompletionTokensUsed')::INT ELSE "TotalCompletionTokensUsed" END,
        "TotalTokensUsedRollup" = CASE WHEN p_data ? 'TotalTokensUsedRollup' THEN (p_data->>'TotalTokensUsedRollup')::INT ELSE "TotalTokensUsedRollup" END,
        "TotalPromptTokensUsedRollup" = CASE WHEN p_data ? 'TotalPromptTokensUsedRollup' THEN (p_data->>'TotalPromptTokensUsedRollup')::INT ELSE "TotalPromptTokensUsedRollup" END,
        "TotalCompletionTokensUsedRollup" = CASE WHEN p_data ? 'TotalCompletionTokensUsedRollup' THEN (p_data->>'TotalCompletionTokensUsedRollup')::INT ELSE "TotalCompletionTokensUsedRollup" END,
        "TotalCostRollup" = CASE WHEN p_data ? 'TotalCostRollup' THEN (p_data->>'TotalCostRollup')::DECIMAL(19, 8) ELSE "TotalCostRollup" END,
        "ConversationDetailID" = CASE WHEN p_data ? 'ConversationDetailID' THEN (p_data->>'ConversationDetailID')::UUID ELSE "ConversationDetailID" END,
        "ConversationDetailSequence" = CASE WHEN p_data ? 'ConversationDetailSequence' THEN (p_data->>'ConversationDetailSequence')::INT ELSE "ConversationDetailSequence" END,
        "CancellationReason" = CASE WHEN p_data ? 'CancellationReason' THEN (p_data->>'CancellationReason') ELSE "CancellationReason" END,
        "FinalStep" = CASE WHEN p_data ? 'FinalStep' THEN (p_data->>'FinalStep') ELSE "FinalStep" END,
        "FinalPayload" = CASE WHEN p_data ? 'FinalPayload' THEN (p_data->>'FinalPayload') ELSE "FinalPayload" END,
        "Message" = CASE WHEN p_data ? 'Message' THEN (p_data->>'Message') ELSE "Message" END,
        "LastRunID" = CASE WHEN p_data ? 'LastRunID' THEN (p_data->>'LastRunID')::UUID ELSE "LastRunID" END,
        "StartingPayload" = CASE WHEN p_data ? 'StartingPayload' THEN (p_data->>'StartingPayload') ELSE "StartingPayload" END,
        "TotalPromptIterations" = CASE WHEN p_data ? 'TotalPromptIterations' THEN (p_data->>'TotalPromptIterations')::INT ELSE "TotalPromptIterations" END,
        "ConfigurationID" = CASE WHEN p_data ? 'ConfigurationID' THEN (p_data->>'ConfigurationID')::UUID ELSE "ConfigurationID" END,
        "OverrideModelID" = CASE WHEN p_data ? 'OverrideModelID' THEN (p_data->>'OverrideModelID')::UUID ELSE "OverrideModelID" END,
        "OverrideVendorID" = CASE WHEN p_data ? 'OverrideVendorID' THEN (p_data->>'OverrideVendorID')::UUID ELSE "OverrideVendorID" END,
        "Data" = CASE WHEN p_data ? 'Data' THEN (p_data->>'Data') ELSE "Data" END,
        "Verbose" = CASE WHEN p_data ? 'Verbose' THEN (p_data->>'Verbose')::BOOLEAN ELSE "Verbose" END,
        "EffortLevel" = CASE WHEN p_data ? 'EffortLevel' THEN (p_data->>'EffortLevel')::INT ELSE "EffortLevel" END,
        "RunName" = CASE WHEN p_data ? 'RunName' THEN (p_data->>'RunName') ELSE "RunName" END,
        "Comments" = CASE WHEN p_data ? 'Comments' THEN (p_data->>'Comments') ELSE "Comments" END,
        "ScheduledJobRunID" = CASE WHEN p_data ? 'ScheduledJobRunID' THEN (p_data->>'ScheduledJobRunID')::UUID ELSE "ScheduledJobRunID" END,
        "TestRunID" = CASE WHEN p_data ? 'TestRunID' THEN (p_data->>'TestRunID')::UUID ELSE "TestRunID" END,
        "PrimaryScopeEntityID" = CASE WHEN p_data ? 'PrimaryScopeEntityID' THEN (p_data->>'PrimaryScopeEntityID')::UUID ELSE "PrimaryScopeEntityID" END,
        "PrimaryScopeRecordID" = CASE WHEN p_data ? 'PrimaryScopeRecordID' THEN (p_data->>'PrimaryScopeRecordID') ELSE "PrimaryScopeRecordID" END,
        "SecondaryScopes" = CASE WHEN p_data ? 'SecondaryScopes' THEN (p_data->>'SecondaryScopes') ELSE "SecondaryScopes" END,
        "ExternalReferenceID" = CASE WHEN p_data ? 'ExternalReferenceID' THEN (p_data->>'ExternalReferenceID') ELSE "ExternalReferenceID" END,
        "CompanyID" = CASE WHEN p_data ? 'CompanyID' THEN (p_data->>'CompanyID')::UUID ELSE "CompanyID" END,
        "TotalCacheReadTokensUsed" = CASE WHEN p_data ? 'TotalCacheReadTokensUsed' THEN (p_data->>'TotalCacheReadTokensUsed')::INT ELSE "TotalCacheReadTokensUsed" END,
        "TotalCacheWriteTokensUsed" = CASE WHEN p_data ? 'TotalCacheWriteTokensUsed' THEN (p_data->>'TotalCacheWriteTokensUsed')::INT ELSE "TotalCacheWriteTokensUsed" END,
        "LastHeartbeatAt" = CASE WHEN p_data ? 'LastHeartbeatAt' THEN (p_data->>'LastHeartbeatAt')::TIMESTAMPTZ ELSE "LastHeartbeatAt" END,
        "AgentSessionID" = CASE WHEN p_data ? 'AgentSessionID' THEN (p_data->>'AgentSessionID')::UUID ELSE "AgentSessionID" END,
        "PlanMode" = CASE WHEN p_data ? 'PlanMode' THEN (p_data->>'PlanMode')::BOOLEAN ELSE "PlanMode" END,
        "ExternalSessionID" = CASE WHEN p_data ? 'ExternalSessionID' THEN (p_data->>'ExternalSessionID') ELSE "ExternalSessionID" END,
        "ContinuationDepth" = CASE WHEN p_data ? 'ContinuationDepth' THEN (p_data->>'ContinuationDepth')::INTEGER ELSE "ContinuationDepth" END,
        "__mj_UpdatedAt" = NOW()
    WHERE
        "ID" = v_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_run" ON "__mj"."AIAgentRun";

CREATE TRIGGER "trg_update_ai_agent_run"
BEFORE UPDATE ON "__mj"."AIAgentRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentExample"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentExample"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentNote"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentNote"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.OriginatingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRequest"
        WHERE "OriginatingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRequest"
        SET "OriginatingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.ResumingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRequest"
        WHERE "ResumingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRequest"
        SET "ResumingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Medias records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRunMedia"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Steps records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRunStep"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIAgentRunStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ParentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRun"
        WHERE "ParentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRun"
        SET "ParentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.LastRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIAgentRun"
        WHERE "LastRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIAgentRun"
        SET "LastRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Conversation Skills.ActivatedByRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationSkill"
        WHERE "ActivatedByRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ConversationSkill"
        SET "ActivatedByRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Duplicate Run Detail Matches.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."DuplicateRunDetailMatch"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."DuplicateRunDetailMatch"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Experiment Session Iterations.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ExperimentSessionIteration"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ExperimentSessionIteration"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Experiment Sessions.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ExperimentSession"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ExperimentSession"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Process Run Details.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ProcessRunDetail"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ProcessRunDetail"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Rubric Evaluations.AIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."RubricEvaluation"
        WHERE "AIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."RubricEvaluation"
        SET "AIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Tasks.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."Task"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."Task"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: User Routine Runs.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."UserRoutineRun"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."UserRoutineRun"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIAgentRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Run Medias
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_media_prompt_run_id"
    ON "__mj"."AIPromptRunMedia" ("PromptRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_media_modality_id"
    ON "__mj"."AIPromptRunMedia" ("ModalityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_media_file_id"
    ON "__mj"."AIPromptRunMedia" ("FileID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Run Medias
-- Item: vwAIPromptRunMedias
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Run Medias
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIPromptRunMedia
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIPromptRunMedias"
AS
SELECT
    a.*,
    MJAIPromptRun_PromptRunID."RunName" AS "PromptRun",
    MJAIModality_ModalityID."Name" AS "Modality",
    MJFile_FileID."Name" AS "File"
FROM
    "__mj"."AIPromptRunMedia" AS a
INNER JOIN
    "__mj"."AIPromptRun" AS MJAIPromptRun_PromptRunID
  ON
    "a"."PromptRunID" = MJAIPromptRun_PromptRunID."ID"
INNER JOIN
    "__mj"."AIModality" AS MJAIModality_ModalityID
  ON
    "a"."ModalityID" = MJAIModality_ModalityID."ID"
LEFT OUTER JOIN
    "__mj"."File" AS MJFile_FileID
  ON
    "a"."FileID" = MJFile_FileID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwAIPromptRunMedias'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwAIPromptRunMedias'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIPromptRunMedias" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAIPromptRunMedias" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIPromptRunMedias" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIPromptRunMedias" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Run Medias
-- Item: spCreateAIPromptRunMedia
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIPromptRunMedia
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIPromptRunMedia'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIPromptRunMedia"(
    p_id UUID DEFAULT NULL,
    p_promptrunid UUID DEFAULT NULL,
    p_modalityid UUID DEFAULT NULL,
    p_mimetype varchar(100) DEFAULT NULL,
    p_filename_clear boolean DEFAULT false,
    p_filename varchar(255) DEFAULT NULL,
    p_filesizebytes_clear boolean DEFAULT false,
    p_filesizebytes int DEFAULT NULL,
    p_width_clear boolean DEFAULT false,
    p_width int DEFAULT NULL,
    p_height_clear boolean DEFAULT false,
    p_height int DEFAULT NULL,
    p_durationseconds_clear boolean DEFAULT false,
    p_durationseconds decimal(10, 2) DEFAULT NULL,
    p_inlinedata_clear boolean DEFAULT false,
    p_inlinedata TEXT DEFAULT NULL,
    p_fileid_clear boolean DEFAULT false,
    p_fileid UUID DEFAULT NULL,
    p_thumbnailbase64_clear boolean DEFAULT false,
    p_thumbnailbase64 TEXT DEFAULT NULL,
    p_metadata_clear boolean DEFAULT false,
    p_metadata TEXT DEFAULT NULL,
    p_displayorder int DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIPromptRunMedias" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIPromptRunMedia"
        (
            "ID",
            "PromptRunID",
                "ModalityID",
                "MimeType",
                "FileName",
                "FileSizeBytes",
                "Width",
                "Height",
                "DurationSeconds",
                "InlineData",
                "FileID",
                "ThumbnailBase64",
                "Metadata",
                "DisplayOrder",
                "Description"
        )
    VALUES
        (
            v_new_id,
            p_promptrunid,
                p_modalityid,
                p_mimetype,
                CASE WHEN p_filename_clear = true THEN NULL ELSE COALESCE(p_filename, NULL) END,
                CASE WHEN p_filesizebytes_clear = true THEN NULL ELSE COALESCE(p_filesizebytes, NULL) END,
                CASE WHEN p_width_clear = true THEN NULL ELSE COALESCE(p_width, NULL) END,
                CASE WHEN p_height_clear = true THEN NULL ELSE COALESCE(p_height, NULL) END,
                CASE WHEN p_durationseconds_clear = true THEN NULL ELSE COALESCE(p_durationseconds, NULL) END,
                CASE WHEN p_inlinedata_clear = true THEN NULL ELSE COALESCE(p_inlinedata, NULL) END,
                CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, NULL) END,
                CASE WHEN p_thumbnailbase64_clear = true THEN NULL ELSE COALESCE(p_thumbnailbase64, NULL) END,
                CASE WHEN p_metadata_clear = true THEN NULL ELSE COALESCE(p_metadata, NULL) END,
                COALESCE(p_displayorder, 0),
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIPromptRunMedias"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPromptRunMedia" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPromptRunMedia" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Run Medias
-- Item: spUpdateAIPromptRunMedia
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIPromptRunMedia
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIPromptRunMedia'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIPromptRunMedia"(
    p_id UUID,
    p_promptrunid UUID DEFAULT NULL,
    p_modalityid UUID DEFAULT NULL,
    p_mimetype varchar(100) DEFAULT NULL,
    p_filename_clear boolean DEFAULT false,
    p_filename varchar(255) DEFAULT NULL,
    p_filesizebytes_clear boolean DEFAULT false,
    p_filesizebytes int DEFAULT NULL,
    p_width_clear boolean DEFAULT false,
    p_width int DEFAULT NULL,
    p_height_clear boolean DEFAULT false,
    p_height int DEFAULT NULL,
    p_durationseconds_clear boolean DEFAULT false,
    p_durationseconds decimal(10, 2) DEFAULT NULL,
    p_inlinedata_clear boolean DEFAULT false,
    p_inlinedata TEXT DEFAULT NULL,
    p_fileid_clear boolean DEFAULT false,
    p_fileid UUID DEFAULT NULL,
    p_thumbnailbase64_clear boolean DEFAULT false,
    p_thumbnailbase64 TEXT DEFAULT NULL,
    p_metadata_clear boolean DEFAULT false,
    p_metadata TEXT DEFAULT NULL,
    p_displayorder int DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIPromptRunMedias" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIPromptRunMedia"
    SET
        "PromptRunID" = COALESCE(p_promptrunid, "PromptRunID"),
        "ModalityID" = COALESCE(p_modalityid, "ModalityID"),
        "MimeType" = COALESCE(p_mimetype, "MimeType"),
        "FileName" = CASE WHEN p_filename_clear = true THEN NULL ELSE COALESCE(p_filename, "FileName") END,
        "FileSizeBytes" = CASE WHEN p_filesizebytes_clear = true THEN NULL ELSE COALESCE(p_filesizebytes, "FileSizeBytes") END,
        "Width" = CASE WHEN p_width_clear = true THEN NULL ELSE COALESCE(p_width, "Width") END,
        "Height" = CASE WHEN p_height_clear = true THEN NULL ELSE COALESCE(p_height, "Height") END,
        "DurationSeconds" = CASE WHEN p_durationseconds_clear = true THEN NULL ELSE COALESCE(p_durationseconds, "DurationSeconds") END,
        "InlineData" = CASE WHEN p_inlinedata_clear = true THEN NULL ELSE COALESCE(p_inlinedata, "InlineData") END,
        "FileID" = CASE WHEN p_fileid_clear = true THEN NULL ELSE COALESCE(p_fileid, "FileID") END,
        "ThumbnailBase64" = CASE WHEN p_thumbnailbase64_clear = true THEN NULL ELSE COALESCE(p_thumbnailbase64, "ThumbnailBase64") END,
        "Metadata" = CASE WHEN p_metadata_clear = true THEN NULL ELSE COALESCE(p_metadata, "Metadata") END,
        "DisplayOrder" = COALESCE(p_displayorder, "DisplayOrder"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIPromptRunMedias"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPromptRunMedia" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPromptRunMedia" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptRunMedia table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_prompt_run_media"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_prompt_run_media" ON "__mj"."AIPromptRunMedia";

CREATE TRIGGER "trg_update_ai_prompt_run_media"
BEFORE UPDATE ON "__mj"."AIPromptRunMedia"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_prompt_run_media"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Run Medias
-- Item: spDeleteAIPromptRunMedia
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIPromptRunMedia
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIPromptRunMedia'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIPromptRunMedia"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AIPromptRunMedia"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPromptRunMedia" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPromptRunMedia" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_usage_type_id"
    ON "__mj"."AIPromptRun" ("UsageTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_prompt_id"
    ON "__mj"."AIPromptRun" ("PromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_model_id"
    ON "__mj"."AIPromptRun" ("ModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_vendor_id"
    ON "__mj"."AIPromptRun" ("VendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_agent_id"
    ON "__mj"."AIPromptRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_configuration_id"
    ON "__mj"."AIPromptRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_parent_id"
    ON "__mj"."AIPromptRun" ("ParentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_original_model_id"
    ON "__mj"."AIPromptRun" ("OriginalModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_rerun_from_prompt_run_id"
    ON "__mj"."AIPromptRun" ("RerunFromPromptRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_judge_id"
    ON "__mj"."AIPromptRun" ("JudgeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_child_prompt_id"
    ON "__mj"."AIPromptRun" ("ChildPromptID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_test_run_id"
    ON "__mj"."AIPromptRun" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_prompt_run_user_id"
    ON "__mj"."AIPromptRun" ("UserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fn_ai_prompt_run_parent_id_get_hierarchy_meta
-- ============================================================

------------------------------------------------------------
----- HIERARCHY METADATA FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_prompt_run_parent_id_get_hierarchy_meta"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS TABLE (
    "RootID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIPromptRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.depth + 1 AS depth,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIPromptRun" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.depth < 100
    )
    SELECT
        a."ID" AS "RootID",
        (SELECT MAX(depth) FROM cte_ancestors)::INTEGER AS "Depth",
        (SELECT path FROM cte_ancestors ORDER BY depth DESC LIMIT 1)::TEXT AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIPromptRun" WHERE "ParentID" = p_record_id))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIPromptRun" WHERE "ParentID" = p_record_id) AS "ChildCount"
    FROM
        cte_ancestors a
    WHERE
        a."ParentID" IS NULL OR p_parent_id IS NULL
    ORDER BY
        a.depth DESC
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fn_ai_prompt_run_parent_id_get_descendants
-- ============================================================

------------------------------------------------------------
----- DESCENDANTS FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_prompt_run_parent_id_get_descendants"(
    p_root_id UUID,
    p_max_depth INTEGER DEFAULT NULL
) RETURNS TABLE (
    "ID" UUID,
    "Depth" INTEGER,
    "Path" TEXT,
    "IsLeaf" BOOLEAN,
    "ChildCount" INTEGER
) AS $$
    WITH RECURSIVE cte_descendants AS (
        SELECT
            "ID",
            "ParentID",
            0 AS relative_depth,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIPromptRun"
        WHERE
            "ID" = p_root_id

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            p.relative_depth + 1 AS relative_depth,
            p.path || c."ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIPromptRun" c
        INNER JOIN
            cte_descendants p ON c."ParentID" = p."ID"
        WHERE
            (p_max_depth IS NULL OR p.relative_depth < p_max_depth)
            AND p.relative_depth < 100
    )
    SELECT
        d."ID" AS "ID",
        d.relative_depth AS "Depth",
        d.path AS "Path",
        (NOT EXISTS (SELECT 1 FROM "__mj"."AIPromptRun" WHERE "ParentID" = d."ID"))::BOOLEAN AS "IsLeaf",
        (SELECT COUNT(1)::INTEGER FROM "__mj"."AIPromptRun" WHERE "ParentID" = d."ID") AS "ChildCount"
    FROM
        cte_descendants d;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fn_ai_prompt_run_parent_id_get_ancestors
-- ============================================================

------------------------------------------------------------
----- ANCESTORS FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_prompt_run_parent_id_get_ancestors"(
    p_record_id UUID
) RETURNS TABLE (
    "ID" UUID,
    "LevelUp" INTEGER,
    "Path" TEXT
) AS $$
    WITH RECURSIVE cte_ancestors AS (
        SELECT
            "ID",
            "ParentID",
            0 AS level_up,
            '/' || "ID"::TEXT || '/' AS path
        FROM
            "__mj"."AIPromptRun"
        WHERE
            "ID" = p_record_id

        UNION ALL

        SELECT
            p."ID",
            p."ParentID",
            c.level_up + 1 AS level_up,
            '/' || p."ID"::TEXT || c.path AS path
        FROM
            "__mj"."AIPromptRun" p
        INNER JOIN
            cte_ancestors c ON p."ID" = c."ParentID"
        WHERE
            c.level_up < 100
    )
    SELECT
        a."ID" AS "ID",
        a.level_up AS "LevelUp",
        a.path AS "Path"
    FROM
        cte_ancestors a;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: fn_ai_prompt_run_parent_id_get_root_id
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIPromptRun.ParentID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_ai_prompt_run_parent_id_get_root_id"(
    p_record_id UUID,
    p_parent_id UUID
) RETURNS UUID AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            "__mj"."AIPromptRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            "__mj"."AIPromptRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."ParentID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "ParentID" IS NULL
    ORDER BY root_parent_id
    LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: vwAIPromptRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Prompt Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIPromptRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIPromptRuns"
AS
SELECT
    a.*,
    MJAIUsageType_UsageTypeID."Name" AS "UsageType",
    MJAIPrompt_PromptID."Name" AS "Prompt",
    MJAIModel_ModelID."Name" AS "Model",
    MJAIVendor_VendorID."Name" AS "Vendor",
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIConfiguration_ConfigurationID."Name" AS "Configuration",
    MJAIPromptRun_ParentID."RunName" AS "Parent",
    MJAIModel_OriginalModelID."Name" AS "OriginalModel",
    MJAIPromptRun_RerunFromPromptRunID."RunName" AS "RerunFromPromptRun",
    MJAIPrompt_JudgeID."Name" AS "Judge",
    MJAIPrompt_ChildPromptID."Name" AS "ChildPrompt",
    MJTestRun_TestRunID."Test" AS "TestRun",
    MJUser_UserID."Name" AS "User",
    hier_ParentID."RootID" AS "RootParentID",
    hier_ParentID."Depth" AS "ParentIDDepth",
    hier_ParentID."Path" AS "ParentIDPath",
    hier_ParentID."IsLeaf" AS "ParentIDIsLeaf",
    hier_ParentID."ChildCount" AS "ParentIDChildCount"
FROM
    "__mj"."AIPromptRun" AS a
LEFT OUTER JOIN
    "__mj"."AIUsageType" AS MJAIUsageType_UsageTypeID
  ON
    "a"."UsageTypeID" = MJAIUsageType_UsageTypeID."ID"
INNER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_PromptID
  ON
    "a"."PromptID" = MJAIPrompt_PromptID."ID"
INNER JOIN
    "__mj"."AIModel" AS MJAIModel_ModelID
  ON
    "a"."ModelID" = MJAIModel_ModelID."ID"
INNER JOIN
    "__mj"."AIVendor" AS MJAIVendor_VendorID
  ON
    "a"."VendorID" = MJAIVendor_VendorID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    "__mj"."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    "__mj"."AIPromptRun" AS MJAIPromptRun_ParentID
  ON
    "a"."ParentID" = MJAIPromptRun_ParentID."ID"
LEFT OUTER JOIN
    "__mj"."AIModel" AS MJAIModel_OriginalModelID
  ON
    "a"."OriginalModelID" = MJAIModel_OriginalModelID."ID"
LEFT OUTER JOIN
    "__mj"."AIPromptRun" AS MJAIPromptRun_RerunFromPromptRunID
  ON
    "a"."RerunFromPromptRunID" = MJAIPromptRun_RerunFromPromptRunID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_JudgeID
  ON
    "a"."JudgeID" = MJAIPrompt_JudgeID."ID"
LEFT OUTER JOIN
    "__mj"."AIPrompt" AS MJAIPrompt_ChildPromptID
  ON
    "a"."ChildPromptID" = MJAIPrompt_ChildPromptID."ID"
LEFT OUTER JOIN
    "__mj"."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "a"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"

LEFT JOIN LATERAL "__mj"."fn_ai_prompt_run_parent_id_get_hierarchy_meta"(a."ID", a."ParentID") AS hier_ParentID ON true
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwAIPromptRuns'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwAIPromptRuns'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIPromptRuns" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAIPromptRuns" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIPromptRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIPromptRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spCreateAIPromptRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIPromptRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIPromptRun"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIPromptRuns"
AS $$
DECLARE
    v_id UUID;
    v_field_name TEXT;
    v_cast_expr  TEXT;
    v_col_list   TEXT;
    v_val_list   TEXT;
    v_sql        TEXT;
BEGIN
    IF p_data ? 'ID' THEN
        v_id := (p_data->>'ID')::UUID;
    ELSE
        v_id := gen_random_uuid();
    END IF;

    v_col_list := quote_ident('ID');
    v_val_list := quote_literal(v_id) || '::UUID';

    -- Build column / value lists from keys present in p_data. Absent keys are
    -- omitted entirely so the column's DEFAULT applies (matching the typed-arg
    -- sproc's default-substitution semantics).
    FOREACH v_field_name IN ARRAY ARRAY['InputUnitsUsed', 'OutputUnitsUsed', 'UsageTypeID', 'PromptID', 'ModelID', 'VendorID', 'AgentID', 'ConfigurationID', 'RunAt', 'CompletedAt', 'ExecutionTimeMS', 'Messages', 'Result', 'TokensUsed', 'TokensPrompt', 'TokensCompletion', 'TotalCost', 'Success', 'ErrorMessage', 'ParentID', 'RunType', 'ExecutionOrder', 'Cost', 'CostCurrency', 'TokensUsedRollup', 'TokensPromptRollup', 'TokensCompletionRollup', 'Temperature', 'TopP', 'TopK', 'MinP', 'FrequencyPenalty', 'PresencePenalty', 'Seed', 'StopSequences', 'ResponseFormat', 'LogProbs', 'TopLogProbs', 'DescendantCost', 'ValidationAttemptCount', 'SuccessfulValidationCount', 'FinalValidationPassed', 'ValidationBehavior', 'RetryStrategy', 'MaxRetriesConfigured', 'FinalValidationError', 'ValidationErrorCount', 'CommonValidationError', 'FirstAttemptAt', 'LastAttemptAt', 'TotalRetryDurationMS', 'ValidationAttempts', 'ValidationSummary', 'FailoverAttempts', 'FailoverErrors', 'FailoverDurations', 'OriginalModelID', 'OriginalRequestStartTime', 'TotalFailoverDuration', 'RerunFromPromptRunID', 'ModelSelection', 'Status', 'Cancelled', 'CancellationReason', 'ModelPowerRank', 'SelectionStrategy', 'CacheHit', 'CacheKey', 'JudgeID', 'JudgeScore', 'WasSelectedResult', 'StreamingEnabled', 'FirstTokenTime', 'ErrorDetails', 'ChildPromptID', 'QueueTime', 'PromptTime', 'CompletionTime', 'ModelSpecificResponseDetails', 'EffortLevel', 'RunName', 'Comments', 'TestRunID', 'AssistantPrefill', 'TokensCacheRead', 'TokensCacheWrite', 'TokensCacheReadRollup', 'TokensCacheWriteRollup', 'ToolCallingMode', 'UserID']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
        WHEN 'InputUnitsUsed' THEN '($1->>''InputUnitsUsed'')::DECIMAL(19, 8)'
        WHEN 'OutputUnitsUsed' THEN '($1->>''OutputUnitsUsed'')::DECIMAL(19, 8)'
        WHEN 'UsageTypeID' THEN '($1->>''UsageTypeID'')::UUID'
        WHEN 'PromptID' THEN '($1->>''PromptID'')::UUID'
        WHEN 'ModelID' THEN '($1->>''ModelID'')::UUID'
        WHEN 'VendorID' THEN '($1->>''VendorID'')::UUID'
        WHEN 'AgentID' THEN '($1->>''AgentID'')::UUID'
        WHEN 'ConfigurationID' THEN '($1->>''ConfigurationID'')::UUID'
        WHEN 'RunAt' THEN 'COALESCE(($1->>''RunAt'')::TIMESTAMPTZ, NOW())'
        WHEN 'CompletedAt' THEN '($1->>''CompletedAt'')::TIMESTAMPTZ'
        WHEN 'ExecutionTimeMS' THEN '($1->>''ExecutionTimeMS'')::INT'
        WHEN 'Messages' THEN '($1->>''Messages'')'
        WHEN 'Result' THEN '($1->>''Result'')'
        WHEN 'TokensUsed' THEN '($1->>''TokensUsed'')::INT'
        WHEN 'TokensPrompt' THEN '($1->>''TokensPrompt'')::INT'
        WHEN 'TokensCompletion' THEN '($1->>''TokensCompletion'')::INT'
        WHEN 'TotalCost' THEN '($1->>''TotalCost'')::DECIMAL(18, 6)'
        WHEN 'Success' THEN 'COALESCE(($1->>''Success'')::BOOLEAN, FALSE)'
        WHEN 'ErrorMessage' THEN '($1->>''ErrorMessage'')'
        WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
        WHEN 'RunType' THEN 'COALESCE(($1->>''RunType''), ''Single'')'
        WHEN 'ExecutionOrder' THEN '($1->>''ExecutionOrder'')::INT'
        WHEN 'Cost' THEN '($1->>''Cost'')::DECIMAL(19, 8)'
        WHEN 'CostCurrency' THEN '($1->>''CostCurrency'')'
        WHEN 'TokensUsedRollup' THEN '($1->>''TokensUsedRollup'')::INT'
        WHEN 'TokensPromptRollup' THEN '($1->>''TokensPromptRollup'')::INT'
        WHEN 'TokensCompletionRollup' THEN '($1->>''TokensCompletionRollup'')::INT'
        WHEN 'Temperature' THEN '($1->>''Temperature'')::DECIMAL(3, 2)'
        WHEN 'TopP' THEN '($1->>''TopP'')::DECIMAL(3, 2)'
        WHEN 'TopK' THEN '($1->>''TopK'')::INT'
        WHEN 'MinP' THEN '($1->>''MinP'')::DECIMAL(3, 2)'
        WHEN 'FrequencyPenalty' THEN '($1->>''FrequencyPenalty'')::DECIMAL(3, 2)'
        WHEN 'PresencePenalty' THEN '($1->>''PresencePenalty'')::DECIMAL(3, 2)'
        WHEN 'Seed' THEN '($1->>''Seed'')::INT'
        WHEN 'StopSequences' THEN '($1->>''StopSequences'')'
        WHEN 'ResponseFormat' THEN '($1->>''ResponseFormat'')'
        WHEN 'LogProbs' THEN '($1->>''LogProbs'')::BOOLEAN'
        WHEN 'TopLogProbs' THEN '($1->>''TopLogProbs'')::INT'
        WHEN 'DescendantCost' THEN '($1->>''DescendantCost'')::DECIMAL(18, 6)'
        WHEN 'ValidationAttemptCount' THEN '($1->>''ValidationAttemptCount'')::INT'
        WHEN 'SuccessfulValidationCount' THEN '($1->>''SuccessfulValidationCount'')::INT'
        WHEN 'FinalValidationPassed' THEN '($1->>''FinalValidationPassed'')::BOOLEAN'
        WHEN 'ValidationBehavior' THEN '($1->>''ValidationBehavior'')'
        WHEN 'RetryStrategy' THEN '($1->>''RetryStrategy'')'
        WHEN 'MaxRetriesConfigured' THEN '($1->>''MaxRetriesConfigured'')::INT'
        WHEN 'FinalValidationError' THEN '($1->>''FinalValidationError'')'
        WHEN 'ValidationErrorCount' THEN '($1->>''ValidationErrorCount'')::INT'
        WHEN 'CommonValidationError' THEN '($1->>''CommonValidationError'')'
        WHEN 'FirstAttemptAt' THEN '($1->>''FirstAttemptAt'')::TIMESTAMPTZ'
        WHEN 'LastAttemptAt' THEN '($1->>''LastAttemptAt'')::TIMESTAMPTZ'
        WHEN 'TotalRetryDurationMS' THEN '($1->>''TotalRetryDurationMS'')::INT'
        WHEN 'ValidationAttempts' THEN '($1->>''ValidationAttempts'')'
        WHEN 'ValidationSummary' THEN '($1->>''ValidationSummary'')'
        WHEN 'FailoverAttempts' THEN '($1->>''FailoverAttempts'')::INT'
        WHEN 'FailoverErrors' THEN '($1->>''FailoverErrors'')'
        WHEN 'FailoverDurations' THEN '($1->>''FailoverDurations'')'
        WHEN 'OriginalModelID' THEN '($1->>''OriginalModelID'')::UUID'
        WHEN 'OriginalRequestStartTime' THEN '($1->>''OriginalRequestStartTime'')::TIMESTAMPTZ'
        WHEN 'TotalFailoverDuration' THEN '($1->>''TotalFailoverDuration'')::INT'
        WHEN 'RerunFromPromptRunID' THEN '($1->>''RerunFromPromptRunID'')::UUID'
        WHEN 'ModelSelection' THEN '($1->>''ModelSelection'')'
        WHEN 'Status' THEN 'COALESCE(($1->>''Status''), ''Pending'')'
        WHEN 'Cancelled' THEN 'COALESCE(($1->>''Cancelled'')::BOOLEAN, FALSE)'
        WHEN 'CancellationReason' THEN '($1->>''CancellationReason'')'
        WHEN 'ModelPowerRank' THEN '($1->>''ModelPowerRank'')::INT'
        WHEN 'SelectionStrategy' THEN '($1->>''SelectionStrategy'')'
        WHEN 'CacheHit' THEN 'COALESCE(($1->>''CacheHit'')::BOOLEAN, FALSE)'
        WHEN 'CacheKey' THEN '($1->>''CacheKey'')'
        WHEN 'JudgeID' THEN '($1->>''JudgeID'')::UUID'
        WHEN 'JudgeScore' THEN '($1->>''JudgeScore'')::FLOAT(53)'
        WHEN 'WasSelectedResult' THEN 'COALESCE(($1->>''WasSelectedResult'')::BOOLEAN, FALSE)'
        WHEN 'StreamingEnabled' THEN 'COALESCE(($1->>''StreamingEnabled'')::BOOLEAN, FALSE)'
        WHEN 'FirstTokenTime' THEN '($1->>''FirstTokenTime'')::INT'
        WHEN 'ErrorDetails' THEN '($1->>''ErrorDetails'')'
        WHEN 'ChildPromptID' THEN '($1->>''ChildPromptID'')::UUID'
        WHEN 'QueueTime' THEN '($1->>''QueueTime'')::INT'
        WHEN 'PromptTime' THEN '($1->>''PromptTime'')::INT'
        WHEN 'CompletionTime' THEN '($1->>''CompletionTime'')::INT'
        WHEN 'ModelSpecificResponseDetails' THEN '($1->>''ModelSpecificResponseDetails'')'
        WHEN 'EffortLevel' THEN '($1->>''EffortLevel'')::INT'
        WHEN 'RunName' THEN '($1->>''RunName'')'
        WHEN 'Comments' THEN '($1->>''Comments'')'
        WHEN 'TestRunID' THEN '($1->>''TestRunID'')::UUID'
        WHEN 'AssistantPrefill' THEN '($1->>''AssistantPrefill'')'
        WHEN 'TokensCacheRead' THEN '($1->>''TokensCacheRead'')::INT'
        WHEN 'TokensCacheWrite' THEN '($1->>''TokensCacheWrite'')::INT'
        WHEN 'TokensCacheReadRollup' THEN '($1->>''TokensCacheReadRollup'')::INT'
        WHEN 'TokensCacheWriteRollup' THEN '($1->>''TokensCacheWriteRollup'')::INT'
        WHEN 'ToolCallingMode' THEN '($1->>''ToolCallingMode'')'
        WHEN 'UserID' THEN '($1->>''UserID'')::UUID'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format(
        'INSERT INTO "__mj"."AIPromptRun" (%s) VALUES (%s)',
        v_col_list,
        v_val_list
    );
    -- Pass p_data as a positional parameter so the cast expressions inside
    -- v_val_list (which reference $1) can read the JSONB payload.
    EXECUTE v_sql USING p_data;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIPromptRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPromptRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIPromptRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spUpdateAIPromptRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIPromptRun (JSON-arg shape)
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIPromptRun"(p_data JSONB)
RETURNS SETOF "__mj"."vwAIPromptRuns"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIPromptRun: p_data must include "ID"';
    END IF;

    UPDATE "__mj"."AIPromptRun"
    SET
        "InputUnitsUsed" = CASE WHEN p_data ? 'InputUnitsUsed' THEN (p_data->>'InputUnitsUsed')::DECIMAL(19, 8) ELSE "InputUnitsUsed" END,
        "OutputUnitsUsed" = CASE WHEN p_data ? 'OutputUnitsUsed' THEN (p_data->>'OutputUnitsUsed')::DECIMAL(19, 8) ELSE "OutputUnitsUsed" END,
        "UsageTypeID" = CASE WHEN p_data ? 'UsageTypeID' THEN (p_data->>'UsageTypeID')::UUID ELSE "UsageTypeID" END,
        "PromptID" = CASE WHEN p_data ? 'PromptID' THEN (p_data->>'PromptID')::UUID ELSE "PromptID" END,
        "ModelID" = CASE WHEN p_data ? 'ModelID' THEN (p_data->>'ModelID')::UUID ELSE "ModelID" END,
        "VendorID" = CASE WHEN p_data ? 'VendorID' THEN (p_data->>'VendorID')::UUID ELSE "VendorID" END,
        "AgentID" = CASE WHEN p_data ? 'AgentID' THEN (p_data->>'AgentID')::UUID ELSE "AgentID" END,
        "ConfigurationID" = CASE WHEN p_data ? 'ConfigurationID' THEN (p_data->>'ConfigurationID')::UUID ELSE "ConfigurationID" END,
        "RunAt" = CASE WHEN p_data ? 'RunAt' THEN (p_data->>'RunAt')::TIMESTAMPTZ ELSE "RunAt" END,
        "CompletedAt" = CASE WHEN p_data ? 'CompletedAt' THEN (p_data->>'CompletedAt')::TIMESTAMPTZ ELSE "CompletedAt" END,
        "ExecutionTimeMS" = CASE WHEN p_data ? 'ExecutionTimeMS' THEN (p_data->>'ExecutionTimeMS')::INT ELSE "ExecutionTimeMS" END,
        "Messages" = CASE WHEN p_data ? 'Messages' THEN (p_data->>'Messages') ELSE "Messages" END,
        "Result" = CASE WHEN p_data ? 'Result' THEN (p_data->>'Result') ELSE "Result" END,
        "TokensUsed" = CASE WHEN p_data ? 'TokensUsed' THEN (p_data->>'TokensUsed')::INT ELSE "TokensUsed" END,
        "TokensPrompt" = CASE WHEN p_data ? 'TokensPrompt' THEN (p_data->>'TokensPrompt')::INT ELSE "TokensPrompt" END,
        "TokensCompletion" = CASE WHEN p_data ? 'TokensCompletion' THEN (p_data->>'TokensCompletion')::INT ELSE "TokensCompletion" END,
        "TotalCost" = CASE WHEN p_data ? 'TotalCost' THEN (p_data->>'TotalCost')::DECIMAL(18, 6) ELSE "TotalCost" END,
        "Success" = CASE WHEN p_data ? 'Success' THEN (p_data->>'Success')::BOOLEAN ELSE "Success" END,
        "ErrorMessage" = CASE WHEN p_data ? 'ErrorMessage' THEN (p_data->>'ErrorMessage') ELSE "ErrorMessage" END,
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "RunType" = CASE WHEN p_data ? 'RunType' THEN (p_data->>'RunType') ELSE "RunType" END,
        "ExecutionOrder" = CASE WHEN p_data ? 'ExecutionOrder' THEN (p_data->>'ExecutionOrder')::INT ELSE "ExecutionOrder" END,
        "Cost" = CASE WHEN p_data ? 'Cost' THEN (p_data->>'Cost')::DECIMAL(19, 8) ELSE "Cost" END,
        "CostCurrency" = CASE WHEN p_data ? 'CostCurrency' THEN (p_data->>'CostCurrency') ELSE "CostCurrency" END,
        "TokensUsedRollup" = CASE WHEN p_data ? 'TokensUsedRollup' THEN (p_data->>'TokensUsedRollup')::INT ELSE "TokensUsedRollup" END,
        "TokensPromptRollup" = CASE WHEN p_data ? 'TokensPromptRollup' THEN (p_data->>'TokensPromptRollup')::INT ELSE "TokensPromptRollup" END,
        "TokensCompletionRollup" = CASE WHEN p_data ? 'TokensCompletionRollup' THEN (p_data->>'TokensCompletionRollup')::INT ELSE "TokensCompletionRollup" END,
        "Temperature" = CASE WHEN p_data ? 'Temperature' THEN (p_data->>'Temperature')::DECIMAL(3, 2) ELSE "Temperature" END,
        "TopP" = CASE WHEN p_data ? 'TopP' THEN (p_data->>'TopP')::DECIMAL(3, 2) ELSE "TopP" END,
        "TopK" = CASE WHEN p_data ? 'TopK' THEN (p_data->>'TopK')::INT ELSE "TopK" END,
        "MinP" = CASE WHEN p_data ? 'MinP' THEN (p_data->>'MinP')::DECIMAL(3, 2) ELSE "MinP" END,
        "FrequencyPenalty" = CASE WHEN p_data ? 'FrequencyPenalty' THEN (p_data->>'FrequencyPenalty')::DECIMAL(3, 2) ELSE "FrequencyPenalty" END,
        "PresencePenalty" = CASE WHEN p_data ? 'PresencePenalty' THEN (p_data->>'PresencePenalty')::DECIMAL(3, 2) ELSE "PresencePenalty" END,
        "Seed" = CASE WHEN p_data ? 'Seed' THEN (p_data->>'Seed')::INT ELSE "Seed" END,
        "StopSequences" = CASE WHEN p_data ? 'StopSequences' THEN (p_data->>'StopSequences') ELSE "StopSequences" END,
        "ResponseFormat" = CASE WHEN p_data ? 'ResponseFormat' THEN (p_data->>'ResponseFormat') ELSE "ResponseFormat" END,
        "LogProbs" = CASE WHEN p_data ? 'LogProbs' THEN (p_data->>'LogProbs')::BOOLEAN ELSE "LogProbs" END,
        "TopLogProbs" = CASE WHEN p_data ? 'TopLogProbs' THEN (p_data->>'TopLogProbs')::INT ELSE "TopLogProbs" END,
        "DescendantCost" = CASE WHEN p_data ? 'DescendantCost' THEN (p_data->>'DescendantCost')::DECIMAL(18, 6) ELSE "DescendantCost" END,
        "ValidationAttemptCount" = CASE WHEN p_data ? 'ValidationAttemptCount' THEN (p_data->>'ValidationAttemptCount')::INT ELSE "ValidationAttemptCount" END,
        "SuccessfulValidationCount" = CASE WHEN p_data ? 'SuccessfulValidationCount' THEN (p_data->>'SuccessfulValidationCount')::INT ELSE "SuccessfulValidationCount" END,
        "FinalValidationPassed" = CASE WHEN p_data ? 'FinalValidationPassed' THEN (p_data->>'FinalValidationPassed')::BOOLEAN ELSE "FinalValidationPassed" END,
        "ValidationBehavior" = CASE WHEN p_data ? 'ValidationBehavior' THEN (p_data->>'ValidationBehavior') ELSE "ValidationBehavior" END,
        "RetryStrategy" = CASE WHEN p_data ? 'RetryStrategy' THEN (p_data->>'RetryStrategy') ELSE "RetryStrategy" END,
        "MaxRetriesConfigured" = CASE WHEN p_data ? 'MaxRetriesConfigured' THEN (p_data->>'MaxRetriesConfigured')::INT ELSE "MaxRetriesConfigured" END,
        "FinalValidationError" = CASE WHEN p_data ? 'FinalValidationError' THEN (p_data->>'FinalValidationError') ELSE "FinalValidationError" END,
        "ValidationErrorCount" = CASE WHEN p_data ? 'ValidationErrorCount' THEN (p_data->>'ValidationErrorCount')::INT ELSE "ValidationErrorCount" END,
        "CommonValidationError" = CASE WHEN p_data ? 'CommonValidationError' THEN (p_data->>'CommonValidationError') ELSE "CommonValidationError" END,
        "FirstAttemptAt" = CASE WHEN p_data ? 'FirstAttemptAt' THEN (p_data->>'FirstAttemptAt')::TIMESTAMPTZ ELSE "FirstAttemptAt" END,
        "LastAttemptAt" = CASE WHEN p_data ? 'LastAttemptAt' THEN (p_data->>'LastAttemptAt')::TIMESTAMPTZ ELSE "LastAttemptAt" END,
        "TotalRetryDurationMS" = CASE WHEN p_data ? 'TotalRetryDurationMS' THEN (p_data->>'TotalRetryDurationMS')::INT ELSE "TotalRetryDurationMS" END,
        "ValidationAttempts" = CASE WHEN p_data ? 'ValidationAttempts' THEN (p_data->>'ValidationAttempts') ELSE "ValidationAttempts" END,
        "ValidationSummary" = CASE WHEN p_data ? 'ValidationSummary' THEN (p_data->>'ValidationSummary') ELSE "ValidationSummary" END,
        "FailoverAttempts" = CASE WHEN p_data ? 'FailoverAttempts' THEN (p_data->>'FailoverAttempts')::INT ELSE "FailoverAttempts" END,
        "FailoverErrors" = CASE WHEN p_data ? 'FailoverErrors' THEN (p_data->>'FailoverErrors') ELSE "FailoverErrors" END,
        "FailoverDurations" = CASE WHEN p_data ? 'FailoverDurations' THEN (p_data->>'FailoverDurations') ELSE "FailoverDurations" END,
        "OriginalModelID" = CASE WHEN p_data ? 'OriginalModelID' THEN (p_data->>'OriginalModelID')::UUID ELSE "OriginalModelID" END,
        "OriginalRequestStartTime" = CASE WHEN p_data ? 'OriginalRequestStartTime' THEN (p_data->>'OriginalRequestStartTime')::TIMESTAMPTZ ELSE "OriginalRequestStartTime" END,
        "TotalFailoverDuration" = CASE WHEN p_data ? 'TotalFailoverDuration' THEN (p_data->>'TotalFailoverDuration')::INT ELSE "TotalFailoverDuration" END,
        "RerunFromPromptRunID" = CASE WHEN p_data ? 'RerunFromPromptRunID' THEN (p_data->>'RerunFromPromptRunID')::UUID ELSE "RerunFromPromptRunID" END,
        "ModelSelection" = CASE WHEN p_data ? 'ModelSelection' THEN (p_data->>'ModelSelection') ELSE "ModelSelection" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "Cancelled" = CASE WHEN p_data ? 'Cancelled' THEN (p_data->>'Cancelled')::BOOLEAN ELSE "Cancelled" END,
        "CancellationReason" = CASE WHEN p_data ? 'CancellationReason' THEN (p_data->>'CancellationReason') ELSE "CancellationReason" END,
        "ModelPowerRank" = CASE WHEN p_data ? 'ModelPowerRank' THEN (p_data->>'ModelPowerRank')::INT ELSE "ModelPowerRank" END,
        "SelectionStrategy" = CASE WHEN p_data ? 'SelectionStrategy' THEN (p_data->>'SelectionStrategy') ELSE "SelectionStrategy" END,
        "CacheHit" = CASE WHEN p_data ? 'CacheHit' THEN (p_data->>'CacheHit')::BOOLEAN ELSE "CacheHit" END,
        "CacheKey" = CASE WHEN p_data ? 'CacheKey' THEN (p_data->>'CacheKey') ELSE "CacheKey" END,
        "JudgeID" = CASE WHEN p_data ? 'JudgeID' THEN (p_data->>'JudgeID')::UUID ELSE "JudgeID" END,
        "JudgeScore" = CASE WHEN p_data ? 'JudgeScore' THEN (p_data->>'JudgeScore')::FLOAT(53) ELSE "JudgeScore" END,
        "WasSelectedResult" = CASE WHEN p_data ? 'WasSelectedResult' THEN (p_data->>'WasSelectedResult')::BOOLEAN ELSE "WasSelectedResult" END,
        "StreamingEnabled" = CASE WHEN p_data ? 'StreamingEnabled' THEN (p_data->>'StreamingEnabled')::BOOLEAN ELSE "StreamingEnabled" END,
        "FirstTokenTime" = CASE WHEN p_data ? 'FirstTokenTime' THEN (p_data->>'FirstTokenTime')::INT ELSE "FirstTokenTime" END,
        "ErrorDetails" = CASE WHEN p_data ? 'ErrorDetails' THEN (p_data->>'ErrorDetails') ELSE "ErrorDetails" END,
        "ChildPromptID" = CASE WHEN p_data ? 'ChildPromptID' THEN (p_data->>'ChildPromptID')::UUID ELSE "ChildPromptID" END,
        "QueueTime" = CASE WHEN p_data ? 'QueueTime' THEN (p_data->>'QueueTime')::INT ELSE "QueueTime" END,
        "PromptTime" = CASE WHEN p_data ? 'PromptTime' THEN (p_data->>'PromptTime')::INT ELSE "PromptTime" END,
        "CompletionTime" = CASE WHEN p_data ? 'CompletionTime' THEN (p_data->>'CompletionTime')::INT ELSE "CompletionTime" END,
        "ModelSpecificResponseDetails" = CASE WHEN p_data ? 'ModelSpecificResponseDetails' THEN (p_data->>'ModelSpecificResponseDetails') ELSE "ModelSpecificResponseDetails" END,
        "EffortLevel" = CASE WHEN p_data ? 'EffortLevel' THEN (p_data->>'EffortLevel')::INT ELSE "EffortLevel" END,
        "RunName" = CASE WHEN p_data ? 'RunName' THEN (p_data->>'RunName') ELSE "RunName" END,
        "Comments" = CASE WHEN p_data ? 'Comments' THEN (p_data->>'Comments') ELSE "Comments" END,
        "TestRunID" = CASE WHEN p_data ? 'TestRunID' THEN (p_data->>'TestRunID')::UUID ELSE "TestRunID" END,
        "AssistantPrefill" = CASE WHEN p_data ? 'AssistantPrefill' THEN (p_data->>'AssistantPrefill') ELSE "AssistantPrefill" END,
        "TokensCacheRead" = CASE WHEN p_data ? 'TokensCacheRead' THEN (p_data->>'TokensCacheRead')::INT ELSE "TokensCacheRead" END,
        "TokensCacheWrite" = CASE WHEN p_data ? 'TokensCacheWrite' THEN (p_data->>'TokensCacheWrite')::INT ELSE "TokensCacheWrite" END,
        "TokensCacheReadRollup" = CASE WHEN p_data ? 'TokensCacheReadRollup' THEN (p_data->>'TokensCacheReadRollup')::INT ELSE "TokensCacheReadRollup" END,
        "TokensCacheWriteRollup" = CASE WHEN p_data ? 'TokensCacheWriteRollup' THEN (p_data->>'TokensCacheWriteRollup')::INT ELSE "TokensCacheWriteRollup" END,
        "ToolCallingMode" = CASE WHEN p_data ? 'ToolCallingMode' THEN (p_data->>'ToolCallingMode') ELSE "ToolCallingMode" END,
        "UserID" = CASE WHEN p_data ? 'UserID' THEN (p_data->>'UserID')::UUID ELSE "UserID" END,
        "__mj_UpdatedAt" = NOW()
    WHERE
        "ID" = v_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIPromptRuns"
    WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPromptRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIPromptRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIPromptRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_prompt_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_prompt_run" ON "__mj"."AIPromptRun";

CREATE TRIGGER "trg_update_ai_prompt_run"
BEFORE UPDATE ON "__mj"."AIPromptRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_prompt_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIPromptRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIPromptRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIPromptRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Delete MJ: AI Prompt Run Medias records via PromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRunMedia"
        WHERE "PromptRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteAIPromptRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.ParentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "ParentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "ParentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.RerunFromPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIPromptRun"
        WHERE "RerunFromPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIPromptRun"
        SET "RerunFromPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Result Cache.PromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."AIResultCache"
        WHERE "PromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."AIResultCache"
        SET "PromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Content Item Tags.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ContentItemTag"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."ContentItemTag"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Content Process Run Prompt Runs records via AIPromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ContentProcessRunPromptRun"
        WHERE "AIPromptRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteContentProcessRunPromptRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Conversation Compaction Runs records via PromptRunID
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."ConversationCompactionRun"
        WHERE "PromptRunID" = p_id
    LOOP
        PERFORM "__mj"."spDeleteConversationCompactionRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: Duplicate Run Detail Matches.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."DuplicateRunDetailMatch"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."DuplicateRunDetailMatch"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: Rubric Evaluations.AIPromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."RubricEvaluation"
        WHERE "AIPromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."RubricEvaluation"
        SET "AIPromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: User Routine Runs.PromptRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM "__mj"."UserRoutineRun"
        WHERE "PromptRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE "__mj"."UserRoutineRun"
        SET "PromptRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM "__mj"."AIPromptRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPromptRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIPromptRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: API Key Usage Logs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_api_key_usage_log_api_key_id"
    ON "__mj"."APIKeyUsageLog" ("APIKeyID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_api_key_usage_log_application_id"
    ON "__mj"."APIKeyUsageLog" ("ApplicationID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: API Key Usage Logs
-- Item: vwAPIKeyUsageLogs
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: API Key Usage Logs
-----               SCHEMA:      __mj
-----               BASE TABLE:  APIKeyUsageLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAPIKeyUsageLogs"
AS
SELECT
    a.*,
    MJAPIKey_APIKeyID."Label" AS "APIKey",
    MJAPIApplication_ApplicationID."Name" AS "Application"
FROM
    "__mj"."APIKeyUsageLog" AS a
INNER JOIN
    "__mj"."APIKey" AS MJAPIKey_APIKeyID
  ON
    "a"."APIKeyID" = MJAPIKey_APIKeyID."ID"
LEFT OUTER JOIN
    "__mj"."APIApplication" AS MJAPIApplication_ApplicationID
  ON
    "a"."ApplicationID" = MJAPIApplication_ApplicationID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwAPIKeyUsageLogs'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwAPIKeyUsageLogs'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAPIKeyUsageLogs" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAPIKeyUsageLogs" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAPIKeyUsageLogs" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAPIKeyUsageLogs" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: API Key Usage Logs
-- Item: spCreateAPIKeyUsageLog
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR APIKeyUsageLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAPIKeyUsageLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAPIKeyUsageLog"(
    p_id UUID DEFAULT NULL,
    p_apikeyid UUID DEFAULT NULL,
    p_endpoint varchar(500) DEFAULT NULL,
    p_operation_clear boolean DEFAULT false,
    p_operation varchar(255) DEFAULT NULL,
    p_method varchar(10) DEFAULT NULL,
    p_statuscode int DEFAULT NULL,
    p_responsetimems_clear boolean DEFAULT false,
    p_responsetimems int DEFAULT NULL,
    p_ipaddress_clear boolean DEFAULT false,
    p_ipaddress varchar(45) DEFAULT NULL,
    p_useragent_clear boolean DEFAULT false,
    p_useragent varchar(500) DEFAULT NULL,
    p_applicationid_clear boolean DEFAULT false,
    p_applicationid UUID DEFAULT NULL,
    p_requestedresource_clear boolean DEFAULT false,
    p_requestedresource varchar(500) DEFAULT NULL,
    p_scopesevaluated_clear boolean DEFAULT false,
    p_scopesevaluated TEXT DEFAULT NULL,
    p_authorizationresult varchar(20) DEFAULT NULL,
    p_deniedreason_clear boolean DEFAULT false,
    p_deniedreason varchar(500) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAPIKeyUsageLogs" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."APIKeyUsageLog"
        (
            "ID",
            "APIKeyID",
                "Endpoint",
                "Operation",
                "Method",
                "StatusCode",
                "ResponseTimeMs",
                "IPAddress",
                "UserAgent",
                "ApplicationID",
                "RequestedResource",
                "ScopesEvaluated",
                "AuthorizationResult",
                "DeniedReason"
        )
    VALUES
        (
            v_new_id,
            p_apikeyid,
                p_endpoint,
                CASE WHEN p_operation_clear = true THEN NULL ELSE COALESCE(p_operation, NULL) END,
                p_method,
                p_statuscode,
                CASE WHEN p_responsetimems_clear = true THEN NULL ELSE COALESCE(p_responsetimems, NULL) END,
                CASE WHEN p_ipaddress_clear = true THEN NULL ELSE COALESCE(p_ipaddress, NULL) END,
                CASE WHEN p_useragent_clear = true THEN NULL ELSE COALESCE(p_useragent, NULL) END,
                CASE WHEN p_applicationid_clear = true THEN NULL ELSE COALESCE(p_applicationid, NULL) END,
                CASE WHEN p_requestedresource_clear = true THEN NULL ELSE COALESCE(p_requestedresource, NULL) END,
                CASE WHEN p_scopesevaluated_clear = true THEN NULL ELSE COALESCE(p_scopesevaluated, NULL) END,
                COALESCE(p_authorizationresult, 'Allowed'),
                CASE WHEN p_deniedreason_clear = true THEN NULL ELSE COALESCE(p_deniedreason, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAPIKeyUsageLogs"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAPIKeyUsageLog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAPIKeyUsageLog" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: API Key Usage Logs
-- Item: spUpdateAPIKeyUsageLog
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR APIKeyUsageLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAPIKeyUsageLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAPIKeyUsageLog"(
    p_id UUID,
    p_apikeyid UUID DEFAULT NULL,
    p_endpoint varchar(500) DEFAULT NULL,
    p_operation_clear boolean DEFAULT false,
    p_operation varchar(255) DEFAULT NULL,
    p_method varchar(10) DEFAULT NULL,
    p_statuscode int DEFAULT NULL,
    p_responsetimems_clear boolean DEFAULT false,
    p_responsetimems int DEFAULT NULL,
    p_ipaddress_clear boolean DEFAULT false,
    p_ipaddress varchar(45) DEFAULT NULL,
    p_useragent_clear boolean DEFAULT false,
    p_useragent varchar(500) DEFAULT NULL,
    p_applicationid_clear boolean DEFAULT false,
    p_applicationid UUID DEFAULT NULL,
    p_requestedresource_clear boolean DEFAULT false,
    p_requestedresource varchar(500) DEFAULT NULL,
    p_scopesevaluated_clear boolean DEFAULT false,
    p_scopesevaluated TEXT DEFAULT NULL,
    p_authorizationresult varchar(20) DEFAULT NULL,
    p_deniedreason_clear boolean DEFAULT false,
    p_deniedreason varchar(500) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAPIKeyUsageLogs" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."APIKeyUsageLog"
    SET
        "APIKeyID" = COALESCE(p_apikeyid, "APIKeyID"),
        "Endpoint" = COALESCE(p_endpoint, "Endpoint"),
        "Operation" = CASE WHEN p_operation_clear = true THEN NULL ELSE COALESCE(p_operation, "Operation") END,
        "Method" = COALESCE(p_method, "Method"),
        "StatusCode" = COALESCE(p_statuscode, "StatusCode"),
        "ResponseTimeMs" = CASE WHEN p_responsetimems_clear = true THEN NULL ELSE COALESCE(p_responsetimems, "ResponseTimeMs") END,
        "IPAddress" = CASE WHEN p_ipaddress_clear = true THEN NULL ELSE COALESCE(p_ipaddress, "IPAddress") END,
        "UserAgent" = CASE WHEN p_useragent_clear = true THEN NULL ELSE COALESCE(p_useragent, "UserAgent") END,
        "ApplicationID" = CASE WHEN p_applicationid_clear = true THEN NULL ELSE COALESCE(p_applicationid, "ApplicationID") END,
        "RequestedResource" = CASE WHEN p_requestedresource_clear = true THEN NULL ELSE COALESCE(p_requestedresource, "RequestedResource") END,
        "ScopesEvaluated" = CASE WHEN p_scopesevaluated_clear = true THEN NULL ELSE COALESCE(p_scopesevaluated, "ScopesEvaluated") END,
        "AuthorizationResult" = COALESCE(p_authorizationresult, "AuthorizationResult"),
        "DeniedReason" = CASE WHEN p_deniedreason_clear = true THEN NULL ELSE COALESCE(p_deniedreason, "DeniedReason") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAPIKeyUsageLogs"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAPIKeyUsageLog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAPIKeyUsageLog" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the APIKeyUsageLog table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_api_key_usage_log"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_api_key_usage_log" ON "__mj"."APIKeyUsageLog";

CREATE TRIGGER "trg_update_api_key_usage_log"
BEFORE UPDATE ON "__mj"."APIKeyUsageLog"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_api_key_usage_log"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: API Key Usage Logs
-- Item: spDeleteAPIKeyUsageLog
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR APIKeyUsageLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAPIKeyUsageLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAPIKeyUsageLog"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."APIKeyUsageLog"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAPIKeyUsageLog" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Audit Logs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_audit_log_user_id"
    ON "__mj"."AuditLog" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_audit_log_audit_log_type_id"
    ON "__mj"."AuditLog" ("AuditLogTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_audit_log_authorization_id"
    ON "__mj"."AuditLog" ("AuthorizationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_audit_log_entity_id"
    ON "__mj"."AuditLog" ("EntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Audit Logs
-- Item: vwAuditLogs
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Audit Logs
-----               SCHEMA:      __mj
-----               BASE TABLE:  AuditLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAuditLogs"
AS
SELECT
    a.*,
    MJUser_UserID."Name" AS "User",
    MJAuditLogType_AuditLogTypeID."Name" AS "AuditLogType",
    MJAuthorization_AuthorizationID."Name" AS "Authorization",
    MJEntity_EntityID."Name" AS "Entity"
FROM
    "__mj"."AuditLog" AS a
INNER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
INNER JOIN
    "__mj"."AuditLogType" AS MJAuditLogType_AuditLogTypeID
  ON
    "a"."AuditLogTypeID" = MJAuditLogType_AuditLogTypeID."ID"
LEFT OUTER JOIN
    "__mj"."Authorization" AS MJAuthorization_AuthorizationID
  ON
    "a"."AuthorizationID" = MJAuthorization_AuthorizationID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "a"."EntityID" = MJEntity_EntityID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwAuditLogs'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwAuditLogs'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAuditLogs" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwAuditLogs" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAuditLogs" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAuditLogs" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Audit Logs
-- Item: spCreateAuditLog
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AuditLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAuditLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAuditLog"(
    p_id UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_auditlogtypeid UUID DEFAULT NULL,
    p_authorizationid_clear boolean DEFAULT false,
    p_authorizationid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_details_clear boolean DEFAULT false,
    p_details TEXT DEFAULT NULL,
    p_entityid_clear boolean DEFAULT false,
    p_entityid UUID DEFAULT NULL,
    p_recordid_clear boolean DEFAULT false,
    p_recordid varchar(450) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAuditLogs" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AuditLog"
        (
            "ID",
            "UserID",
                "AuditLogTypeID",
                "AuthorizationID",
                "Status",
                "Description",
                "Details",
                "EntityID",
                "RecordID"
        )
    VALUES
        (
            v_new_id,
            p_userid,
                p_auditlogtypeid,
                CASE WHEN p_authorizationid_clear = true THEN NULL ELSE COALESCE(p_authorizationid, NULL) END,
                COALESCE(p_status, 'Allow'),
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_details_clear = true THEN NULL ELSE COALESCE(p_details, NULL) END,
                CASE WHEN p_entityid_clear = true THEN NULL ELSE COALESCE(p_entityid, NULL) END,
                CASE WHEN p_recordid_clear = true THEN NULL ELSE COALESCE(p_recordid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAuditLogs"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAuditLog" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAuditLog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAuditLog" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Audit Logs
-- Item: spUpdateAuditLog
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AuditLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAuditLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAuditLog"(
    p_id UUID,
    p_userid UUID DEFAULT NULL,
    p_auditlogtypeid UUID DEFAULT NULL,
    p_authorizationid_clear boolean DEFAULT false,
    p_authorizationid UUID DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_details_clear boolean DEFAULT false,
    p_details TEXT DEFAULT NULL,
    p_entityid_clear boolean DEFAULT false,
    p_entityid UUID DEFAULT NULL,
    p_recordid_clear boolean DEFAULT false,
    p_recordid varchar(450) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAuditLogs" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AuditLog"
    SET
        "UserID" = COALESCE(p_userid, "UserID"),
        "AuditLogTypeID" = COALESCE(p_auditlogtypeid, "AuditLogTypeID"),
        "AuthorizationID" = CASE WHEN p_authorizationid_clear = true THEN NULL ELSE COALESCE(p_authorizationid, "AuthorizationID") END,
        "Status" = COALESCE(p_status, "Status"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Details" = CASE WHEN p_details_clear = true THEN NULL ELSE COALESCE(p_details, "Details") END,
        "EntityID" = CASE WHEN p_entityid_clear = true THEN NULL ELSE COALESCE(p_entityid, "EntityID") END,
        "RecordID" = CASE WHEN p_recordid_clear = true THEN NULL ELSE COALESCE(p_recordid, "RecordID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAuditLogs"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAuditLog" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AuditLog table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_audit_log"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_audit_log" ON "__mj"."AuditLog";

CREATE TRIGGER "trg_update_audit_log"
BEFORE UPDATE ON "__mj"."AuditLog"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_audit_log"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Audit Logs
-- Item: spDeleteAuditLog
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AuditLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAuditLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAuditLog"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AuditLog"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAuditLog" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Run API Logs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_company_integration_run_api_log_company_integr"
    ON "__mj"."CompanyIntegrationRunAPILog" ("CompanyIntegrationRunID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Run API Logs
-- Item: vwCompanyIntegrationRunAPILogs
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Company Integration Run API Logs
-----               SCHEMA:      __mj
-----               BASE TABLE:  CompanyIntegrationRunAPILog
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwCompanyIntegrationRunAPILogs"
AS
SELECT
    c.*,
    MJCompanyIntegrationRun_CompanyIntegrationRunID."Integration" AS "CompanyIntegrationRun"
FROM
    "__mj"."CompanyIntegrationRunAPILog" AS c
INNER JOIN
    "__mj"."vwCompanyIntegrationRuns" AS MJCompanyIntegrationRun_CompanyIntegrationRunID
  ON
    "c"."CompanyIntegrationRunID" = MJCompanyIntegrationRun_CompanyIntegrationRunID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwCompanyIntegrationRunAPILogs'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwCompanyIntegrationRunAPILogs'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwCompanyIntegrationRunAPILogs" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwCompanyIntegrationRunAPILogs" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwCompanyIntegrationRunAPILogs" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwCompanyIntegrationRunAPILogs" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Run API Logs
-- Item: spCreateCompanyIntegrationRunAPILog
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR CompanyIntegrationRunAPILog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateCompanyIntegrationRunAPILog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateCompanyIntegrationRunAPILog"(
    p_id UUID DEFAULT NULL,
    p_companyintegrationrunid UUID DEFAULT NULL,
    p_executedat TIMESTAMPTZ DEFAULT NULL,
    p_issuccess BOOLEAN DEFAULT NULL,
    p_requestmethod_clear boolean DEFAULT false,
    p_requestmethod varchar(12) DEFAULT NULL,
    p_url_clear boolean DEFAULT false,
    p_url TEXT DEFAULT NULL,
    p_parameters_clear boolean DEFAULT false,
    p_parameters TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwCompanyIntegrationRunAPILogs" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."CompanyIntegrationRunAPILog"
        (
            "ID",
            "CompanyIntegrationRunID",
                "ExecutedAt",
                "IsSuccess",
                "RequestMethod",
                "URL",
                "Parameters"
        )
    VALUES
        (
            v_new_id,
            p_companyintegrationrunid,
                COALESCE(p_executedat, NOW()),
                COALESCE(p_issuccess, FALSE),
                CASE WHEN p_requestmethod_clear = true THEN NULL ELSE COALESCE(p_requestmethod, NULL) END,
                CASE WHEN p_url_clear = true THEN NULL ELSE COALESCE(p_url, NULL) END,
                CASE WHEN p_parameters_clear = true THEN NULL ELSE COALESCE(p_parameters, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwCompanyIntegrationRunAPILogs"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCompanyIntegrationRunAPILog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCompanyIntegrationRunAPILog" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Run API Logs
-- Item: spUpdateCompanyIntegrationRunAPILog
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR CompanyIntegrationRunAPILog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateCompanyIntegrationRunAPILog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateCompanyIntegrationRunAPILog"(
    p_id UUID,
    p_companyintegrationrunid UUID DEFAULT NULL,
    p_executedat TIMESTAMPTZ DEFAULT NULL,
    p_issuccess BOOLEAN DEFAULT NULL,
    p_requestmethod_clear boolean DEFAULT false,
    p_requestmethod varchar(12) DEFAULT NULL,
    p_url_clear boolean DEFAULT false,
    p_url TEXT DEFAULT NULL,
    p_parameters_clear boolean DEFAULT false,
    p_parameters TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwCompanyIntegrationRunAPILogs" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."CompanyIntegrationRunAPILog"
    SET
        "CompanyIntegrationRunID" = COALESCE(p_companyintegrationrunid, "CompanyIntegrationRunID"),
        "ExecutedAt" = COALESCE(p_executedat, "ExecutedAt"),
        "IsSuccess" = COALESCE(p_issuccess, "IsSuccess"),
        "RequestMethod" = CASE WHEN p_requestmethod_clear = true THEN NULL ELSE COALESCE(p_requestmethod, "RequestMethod") END,
        "URL" = CASE WHEN p_url_clear = true THEN NULL ELSE COALESCE(p_url, "URL") END,
        "Parameters" = CASE WHEN p_parameters_clear = true THEN NULL ELSE COALESCE(p_parameters, "Parameters") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwCompanyIntegrationRunAPILogs"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCompanyIntegrationRunAPILog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCompanyIntegrationRunAPILog" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationRunAPILog table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_company_integration_run_api_log"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_company_integration_run_api_log" ON "__mj"."CompanyIntegrationRunAPILog";

CREATE TRIGGER "trg_update_company_integration_run_api_log"
BEFORE UPDATE ON "__mj"."CompanyIntegrationRunAPILog"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_company_integration_run_api_log"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Run API Logs
-- Item: spDeleteCompanyIntegrationRunAPILog
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR CompanyIntegrationRunAPILog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteCompanyIntegrationRunAPILog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteCompanyIntegrationRunAPILog"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."CompanyIntegrationRunAPILog"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCompanyIntegrationRunAPILog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCompanyIntegrationRunAPILog" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Run Details
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_company_integration_run_detail_company_integra"
    ON "__mj"."CompanyIntegrationRunDetail" ("CompanyIntegrationRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_company_integration_run_detail_entity_id"
    ON "__mj"."CompanyIntegrationRunDetail" ("EntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Run Details
-- Item: Permissions for vwCompanyIntegrationRunDetails
-- ============================================================
GRANT SELECT ON "__mj"."vwCompanyIntegrationRunDetails" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwCompanyIntegrationRunDetails" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwCompanyIntegrationRunDetails" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Run Details
-- Item: spCreateCompanyIntegrationRunDetail
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR CompanyIntegrationRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateCompanyIntegrationRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateCompanyIntegrationRunDetail"(
    p_id UUID DEFAULT NULL,
    p_companyintegrationrunid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_action char(20) DEFAULT NULL,
    p_executedat TIMESTAMPTZ DEFAULT NULL,
    p_issuccess BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwCompanyIntegrationRunDetails" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."CompanyIntegrationRunDetail"
        (
            "ID",
            "CompanyIntegrationRunID",
                "EntityID",
                "RecordID",
                "Action",
                "ExecutedAt",
                "IsSuccess"
        )
    VALUES
        (
            v_new_id,
            p_companyintegrationrunid,
                p_entityid,
                p_recordid,
                p_action,
                COALESCE(p_executedat, NOW()),
                COALESCE(p_issuccess, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwCompanyIntegrationRunDetails"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCompanyIntegrationRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCompanyIntegrationRunDetail" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Run Details
-- Item: spUpdateCompanyIntegrationRunDetail
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR CompanyIntegrationRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateCompanyIntegrationRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateCompanyIntegrationRunDetail"(
    p_id UUID,
    p_companyintegrationrunid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_action char(20) DEFAULT NULL,
    p_executedat TIMESTAMPTZ DEFAULT NULL,
    p_issuccess BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwCompanyIntegrationRunDetails" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."CompanyIntegrationRunDetail"
    SET
        "CompanyIntegrationRunID" = COALESCE(p_companyintegrationrunid, "CompanyIntegrationRunID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "RecordID" = COALESCE(p_recordid, "RecordID"),
        "Action" = COALESCE(p_action, "Action"),
        "ExecutedAt" = COALESCE(p_executedat, "ExecutedAt"),
        "IsSuccess" = COALESCE(p_issuccess, "IsSuccess")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwCompanyIntegrationRunDetails"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCompanyIntegrationRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCompanyIntegrationRunDetail" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationRunDetail table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_company_integration_run_detail"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_company_integration_run_detail" ON "__mj"."CompanyIntegrationRunDetail";

CREATE TRIGGER "trg_update_company_integration_run_detail"
BEFORE UPDATE ON "__mj"."CompanyIntegrationRunDetail"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_company_integration_run_detail"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Run Details
-- Item: spDeleteCompanyIntegrationRunDetail
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR CompanyIntegrationRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteCompanyIntegrationRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteCompanyIntegrationRunDetail"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."CompanyIntegrationRunDetail"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCompanyIntegrationRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCompanyIntegrationRunDetail" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Process Run Details
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_process_run_detail_content_process_run"
    ON "__mj"."ContentProcessRunDetail" ("ContentProcessRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_process_run_detail_content_source_id"
    ON "__mj"."ContentProcessRunDetail" ("ContentSourceID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_content_process_run_detail_content_source_type"
    ON "__mj"."ContentProcessRunDetail" ("ContentSourceTypeID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Process Run Details
-- Item: vwContentProcessRunDetails
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Content Process Run Details
-----               SCHEMA:      __mj
-----               BASE TABLE:  ContentProcessRunDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwContentProcessRunDetails"
AS
SELECT
    c.*,
    MJContentProcessRun_ContentProcessRunID."Source" AS "ContentProcessRun",
    MJContentSource_ContentSourceID."Name" AS "ContentSource",
    MJContentSourceType_ContentSourceTypeID."Name" AS "ContentSourceType"
FROM
    "__mj"."ContentProcessRunDetail" AS c
INNER JOIN
    "__mj"."vwContentProcessRuns" AS MJContentProcessRun_ContentProcessRunID
  ON
    "c"."ContentProcessRunID" = MJContentProcessRun_ContentProcessRunID."ID"
INNER JOIN
    "__mj"."ContentSource" AS MJContentSource_ContentSourceID
  ON
    "c"."ContentSourceID" = MJContentSource_ContentSourceID."ID"
INNER JOIN
    "__mj"."ContentSourceType" AS MJContentSourceType_ContentSourceTypeID
  ON
    "c"."ContentSourceTypeID" = MJContentSourceType_ContentSourceTypeID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwContentProcessRunDetails'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwContentProcessRunDetails'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwContentProcessRunDetails" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwContentProcessRunDetails" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwContentProcessRunDetails" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwContentProcessRunDetails" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Process Run Details
-- Item: spCreateContentProcessRunDetail
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ContentProcessRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateContentProcessRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateContentProcessRunDetail"(
    p_id UUID DEFAULT NULL,
    p_contentprocessrunid UUID DEFAULT NULL,
    p_contentsourceid UUID DEFAULT NULL,
    p_contentsourcetypeid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_itemsprocessed int DEFAULT NULL,
    p_itemstagged int DEFAULT NULL,
    p_itemsvectorized int DEFAULT NULL,
    p_tagscreated int DEFAULT NULL,
    p_errorcount int DEFAULT NULL,
    p_starttime_clear boolean DEFAULT false,
    p_starttime TIMESTAMPTZ DEFAULT NULL,
    p_endtime_clear boolean DEFAULT false,
    p_endtime TIMESTAMPTZ DEFAULT NULL,
    p_totaltokensused int DEFAULT NULL,
    p_totalcost decimal(18, 6) DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentProcessRunDetails" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ContentProcessRunDetail"
        (
            "ID",
            "ContentProcessRunID",
                "ContentSourceID",
                "ContentSourceTypeID",
                "Status",
                "ItemsProcessed",
                "ItemsTagged",
                "ItemsVectorized",
                "TagsCreated",
                "ErrorCount",
                "StartTime",
                "EndTime",
                "TotalTokensUsed",
                "TotalCost"
        )
    VALUES
        (
            v_new_id,
            p_contentprocessrunid,
                p_contentsourceid,
                p_contentsourcetypeid,
                COALESCE(p_status, 'Pending'),
                COALESCE(p_itemsprocessed, 0),
                COALESCE(p_itemstagged, 0),
                COALESCE(p_itemsvectorized, 0),
                COALESCE(p_tagscreated, 0),
                COALESCE(p_errorcount, 0),
                CASE WHEN p_starttime_clear = true THEN NULL ELSE COALESCE(p_starttime, NULL) END,
                CASE WHEN p_endtime_clear = true THEN NULL ELSE COALESCE(p_endtime, NULL) END,
                COALESCE(p_totaltokensused, 0),
                COALESCE(p_totalcost, 0)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwContentProcessRunDetails"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentProcessRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateContentProcessRunDetail" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Process Run Details
-- Item: spUpdateContentProcessRunDetail
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ContentProcessRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateContentProcessRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateContentProcessRunDetail"(
    p_id UUID,
    p_contentprocessrunid UUID DEFAULT NULL,
    p_contentsourceid UUID DEFAULT NULL,
    p_contentsourcetypeid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_itemsprocessed int DEFAULT NULL,
    p_itemstagged int DEFAULT NULL,
    p_itemsvectorized int DEFAULT NULL,
    p_tagscreated int DEFAULT NULL,
    p_errorcount int DEFAULT NULL,
    p_starttime_clear boolean DEFAULT false,
    p_starttime TIMESTAMPTZ DEFAULT NULL,
    p_endtime_clear boolean DEFAULT false,
    p_endtime TIMESTAMPTZ DEFAULT NULL,
    p_totaltokensused int DEFAULT NULL,
    p_totalcost decimal(18, 6) DEFAULT NULL
) RETURNS SETOF "__mj"."vwContentProcessRunDetails" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ContentProcessRunDetail"
    SET
        "ContentProcessRunID" = COALESCE(p_contentprocessrunid, "ContentProcessRunID"),
        "ContentSourceID" = COALESCE(p_contentsourceid, "ContentSourceID"),
        "ContentSourceTypeID" = COALESCE(p_contentsourcetypeid, "ContentSourceTypeID"),
        "Status" = COALESCE(p_status, "Status"),
        "ItemsProcessed" = COALESCE(p_itemsprocessed, "ItemsProcessed"),
        "ItemsTagged" = COALESCE(p_itemstagged, "ItemsTagged"),
        "ItemsVectorized" = COALESCE(p_itemsvectorized, "ItemsVectorized"),
        "TagsCreated" = COALESCE(p_tagscreated, "TagsCreated"),
        "ErrorCount" = COALESCE(p_errorcount, "ErrorCount"),
        "StartTime" = CASE WHEN p_starttime_clear = true THEN NULL ELSE COALESCE(p_starttime, "StartTime") END,
        "EndTime" = CASE WHEN p_endtime_clear = true THEN NULL ELSE COALESCE(p_endtime, "EndTime") END,
        "TotalTokensUsed" = COALESCE(p_totaltokensused, "TotalTokensUsed"),
        "TotalCost" = COALESCE(p_totalcost, "TotalCost")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwContentProcessRunDetails"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentProcessRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateContentProcessRunDetail" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ContentProcessRunDetail table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_content_process_run_detail"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_content_process_run_detail" ON "__mj"."ContentProcessRunDetail";

CREATE TRIGGER "trg_update_content_process_run_detail"
BEFORE UPDATE ON "__mj"."ContentProcessRunDetail"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_content_process_run_detail"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Content Process Run Details
-- Item: spDeleteContentProcessRunDetail
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ContentProcessRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteContentProcessRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteContentProcessRunDetail"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ContentProcessRunDetail"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentProcessRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteContentProcessRunDetail" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Error Logs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_error_log_company_integration_run_id"
    ON "__mj"."ErrorLog" ("CompanyIntegrationRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_error_log_company_integration_run_detail_id"
    ON "__mj"."ErrorLog" ("CompanyIntegrationRunDetailID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Error Logs
-- Item: vwErrorLogs
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Error Logs
-----               SCHEMA:      __mj
-----               BASE TABLE:  ErrorLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwErrorLogs"
AS
SELECT
    e.*,
    MJCompanyIntegrationRun_CompanyIntegrationRunID."Integration" AS "CompanyIntegrationRun",
    MJCompanyIntegrationRunDetail_CompanyIntegrationRunDetailID."RecordID" AS "CompanyIntegrationRunDetail"
FROM
    "__mj"."ErrorLog" AS e
LEFT OUTER JOIN
    "__mj"."vwCompanyIntegrationRuns" AS MJCompanyIntegrationRun_CompanyIntegrationRunID
  ON
    "e"."CompanyIntegrationRunID" = MJCompanyIntegrationRun_CompanyIntegrationRunID."ID"
LEFT OUTER JOIN
    "__mj"."CompanyIntegrationRunDetail" AS MJCompanyIntegrationRunDetail_CompanyIntegrationRunDetailID
  ON
    "e"."CompanyIntegrationRunDetailID" = MJCompanyIntegrationRunDetail_CompanyIntegrationRunDetailID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwErrorLogs'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwErrorLogs'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwErrorLogs" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwErrorLogs" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwErrorLogs" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwErrorLogs" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Error Logs
-- Item: spCreateErrorLog
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ErrorLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateErrorLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateErrorLog"(
    p_id UUID DEFAULT NULL,
    p_companyintegrationrunid_clear boolean DEFAULT false,
    p_companyintegrationrunid UUID DEFAULT NULL,
    p_companyintegrationrundetailid_clear boolean DEFAULT false,
    p_companyintegrationrundetailid UUID DEFAULT NULL,
    p_code_clear boolean DEFAULT false,
    p_code char(20) DEFAULT NULL,
    p_message_clear boolean DEFAULT false,
    p_message TEXT DEFAULT NULL,
    p_createdby_clear boolean DEFAULT false,
    p_createdby varchar(50) DEFAULT NULL,
    p_status_clear boolean DEFAULT false,
    p_status varchar(10) DEFAULT NULL,
    p_category_clear boolean DEFAULT false,
    p_category varchar(20) DEFAULT NULL,
    p_details_clear boolean DEFAULT false,
    p_details TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwErrorLogs" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ErrorLog"
        (
            "ID",
            "CompanyIntegrationRunID",
                "CompanyIntegrationRunDetailID",
                "Code",
                "Message",
                "CreatedBy",
                "Status",
                "Category",
                "Details"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_companyintegrationrunid_clear = true THEN NULL ELSE COALESCE(p_companyintegrationrunid, NULL) END,
                CASE WHEN p_companyintegrationrundetailid_clear = true THEN NULL ELSE COALESCE(p_companyintegrationrundetailid, NULL) END,
                CASE WHEN p_code_clear = true THEN NULL ELSE COALESCE(p_code, NULL) END,
                CASE WHEN p_message_clear = true THEN NULL ELSE COALESCE(p_message, NULL) END,
                CASE WHEN p_createdby_clear = true THEN NULL ELSE COALESCE(p_createdby, 'current_user') END,
                CASE WHEN p_status_clear = true THEN NULL ELSE COALESCE(p_status, NULL) END,
                CASE WHEN p_category_clear = true THEN NULL ELSE COALESCE(p_category, NULL) END,
                CASE WHEN p_details_clear = true THEN NULL ELSE COALESCE(p_details, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwErrorLogs"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateErrorLog" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateErrorLog" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Error Logs
-- Item: spUpdateErrorLog
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ErrorLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateErrorLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateErrorLog"(
    p_id UUID,
    p_companyintegrationrunid_clear boolean DEFAULT false,
    p_companyintegrationrunid UUID DEFAULT NULL,
    p_companyintegrationrundetailid_clear boolean DEFAULT false,
    p_companyintegrationrundetailid UUID DEFAULT NULL,
    p_code_clear boolean DEFAULT false,
    p_code char(20) DEFAULT NULL,
    p_message_clear boolean DEFAULT false,
    p_message TEXT DEFAULT NULL,
    p_createdby_clear boolean DEFAULT false,
    p_createdby varchar(50) DEFAULT NULL,
    p_status_clear boolean DEFAULT false,
    p_status varchar(10) DEFAULT NULL,
    p_category_clear boolean DEFAULT false,
    p_category varchar(20) DEFAULT NULL,
    p_details_clear boolean DEFAULT false,
    p_details TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwErrorLogs" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ErrorLog"
    SET
        "CompanyIntegrationRunID" = CASE WHEN p_companyintegrationrunid_clear = true THEN NULL ELSE COALESCE(p_companyintegrationrunid, "CompanyIntegrationRunID") END,
        "CompanyIntegrationRunDetailID" = CASE WHEN p_companyintegrationrundetailid_clear = true THEN NULL ELSE COALESCE(p_companyintegrationrundetailid, "CompanyIntegrationRunDetailID") END,
        "Code" = CASE WHEN p_code_clear = true THEN NULL ELSE COALESCE(p_code, "Code") END,
        "Message" = CASE WHEN p_message_clear = true THEN NULL ELSE COALESCE(p_message, "Message") END,
        "CreatedBy" = CASE WHEN p_createdby_clear = true THEN NULL ELSE COALESCE(p_createdby, "CreatedBy") END,
        "Status" = CASE WHEN p_status_clear = true THEN NULL ELSE COALESCE(p_status, "Status") END,
        "Category" = CASE WHEN p_category_clear = true THEN NULL ELSE COALESCE(p_category, "Category") END,
        "Details" = CASE WHEN p_details_clear = true THEN NULL ELSE COALESCE(p_details, "Details") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwErrorLogs"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateErrorLog" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateErrorLog" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ErrorLog table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_error_log"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_error_log" ON "__mj"."ErrorLog";

CREATE TRIGGER "trg_update_error_log"
BEFORE UPDATE ON "__mj"."ErrorLog"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_error_log"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Error Logs
-- Item: spDeleteErrorLog
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ErrorLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteErrorLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteErrorLog"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ErrorLog"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteErrorLog" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteErrorLog" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: MCP Tool Execution Logs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_mcp_tool_execution_log_mcp_server_connection_i"
    ON "__mj"."MCPToolExecutionLog" ("MCPServerConnectionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_mcp_tool_execution_log_mcp_server_tool_id"
    ON "__mj"."MCPToolExecutionLog" ("MCPServerToolID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_mcp_tool_execution_log_user_id"
    ON "__mj"."MCPToolExecutionLog" ("UserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: MCP Tool Execution Logs
-- Item: vwMCPToolExecutionLogs
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: MCP Tool Execution Logs
-----               SCHEMA:      __mj
-----               BASE TABLE:  MCPToolExecutionLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwMCPToolExecutionLogs"
AS
SELECT
    m.*,
    MJMCPServerConnection_MCPServerConnectionID."Name" AS "MCPServerConnection",
    MJMCPServerTool_MCPServerToolID."ToolTitle" AS "MCPServerTool",
    MJUser_UserID."Name" AS "User"
FROM
    "__mj"."MCPToolExecutionLog" AS m
INNER JOIN
    "__mj"."MCPServerConnection" AS MJMCPServerConnection_MCPServerConnectionID
  ON
    "m"."MCPServerConnectionID" = MJMCPServerConnection_MCPServerConnectionID."ID"
LEFT OUTER JOIN
    "__mj"."MCPServerTool" AS MJMCPServerTool_MCPServerToolID
  ON
    "m"."MCPServerToolID" = MJMCPServerTool_MCPServerToolID."ID"
INNER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "m"."UserID" = MJUser_UserID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwMCPToolExecutionLogs'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwMCPToolExecutionLogs'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwMCPToolExecutionLogs" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwMCPToolExecutionLogs" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwMCPToolExecutionLogs" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwMCPToolExecutionLogs" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: MCP Tool Execution Logs
-- Item: spCreateMCPToolExecutionLog
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR MCPToolExecutionLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateMCPToolExecutionLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateMCPToolExecutionLog"(
    p_id UUID DEFAULT NULL,
    p_mcpserverconnectionid UUID DEFAULT NULL,
    p_mcpservertoolid_clear boolean DEFAULT false,
    p_mcpservertoolid UUID DEFAULT NULL,
    p_toolname varchar(255) DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_durationms_clear boolean DEFAULT false,
    p_durationms int DEFAULT NULL,
    p_success BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_inputparameters_clear boolean DEFAULT false,
    p_inputparameters TEXT DEFAULT NULL,
    p_outputcontent_clear boolean DEFAULT false,
    p_outputcontent TEXT DEFAULT NULL,
    p_outputtruncated BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwMCPToolExecutionLogs" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."MCPToolExecutionLog"
        (
            "ID",
            "MCPServerConnectionID",
                "MCPServerToolID",
                "ToolName",
                "UserID",
                "StartedAt",
                "EndedAt",
                "DurationMs",
                "Success",
                "ErrorMessage",
                "InputParameters",
                "OutputContent",
                "OutputTruncated"
        )
    VALUES
        (
            v_new_id,
            p_mcpserverconnectionid,
                CASE WHEN p_mcpservertoolid_clear = true THEN NULL ELSE COALESCE(p_mcpservertoolid, NULL) END,
                p_toolname,
                p_userid,
                COALESCE(p_startedat, NOW()),
                CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, NULL) END,
                CASE WHEN p_durationms_clear = true THEN NULL ELSE COALESCE(p_durationms, NULL) END,
                COALESCE(p_success, FALSE),
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_inputparameters_clear = true THEN NULL ELSE COALESCE(p_inputparameters, NULL) END,
                CASE WHEN p_outputcontent_clear = true THEN NULL ELSE COALESCE(p_outputcontent, NULL) END,
                COALESCE(p_outputtruncated, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwMCPToolExecutionLogs"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMCPToolExecutionLog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateMCPToolExecutionLog" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: MCP Tool Execution Logs
-- Item: spUpdateMCPToolExecutionLog
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR MCPToolExecutionLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateMCPToolExecutionLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateMCPToolExecutionLog"(
    p_id UUID,
    p_mcpserverconnectionid UUID DEFAULT NULL,
    p_mcpservertoolid_clear boolean DEFAULT false,
    p_mcpservertoolid UUID DEFAULT NULL,
    p_toolname varchar(255) DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_durationms_clear boolean DEFAULT false,
    p_durationms int DEFAULT NULL,
    p_success BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_inputparameters_clear boolean DEFAULT false,
    p_inputparameters TEXT DEFAULT NULL,
    p_outputcontent_clear boolean DEFAULT false,
    p_outputcontent TEXT DEFAULT NULL,
    p_outputtruncated BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwMCPToolExecutionLogs" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."MCPToolExecutionLog"
    SET
        "MCPServerConnectionID" = COALESCE(p_mcpserverconnectionid, "MCPServerConnectionID"),
        "MCPServerToolID" = CASE WHEN p_mcpservertoolid_clear = true THEN NULL ELSE COALESCE(p_mcpservertoolid, "MCPServerToolID") END,
        "ToolName" = COALESCE(p_toolname, "ToolName"),
        "UserID" = COALESCE(p_userid, "UserID"),
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "EndedAt" = CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, "EndedAt") END,
        "DurationMs" = CASE WHEN p_durationms_clear = true THEN NULL ELSE COALESCE(p_durationms, "DurationMs") END,
        "Success" = COALESCE(p_success, "Success"),
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "InputParameters" = CASE WHEN p_inputparameters_clear = true THEN NULL ELSE COALESCE(p_inputparameters, "InputParameters") END,
        "OutputContent" = CASE WHEN p_outputcontent_clear = true THEN NULL ELSE COALESCE(p_outputcontent, "OutputContent") END,
        "OutputTruncated" = COALESCE(p_outputtruncated, "OutputTruncated")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwMCPToolExecutionLogs"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMCPToolExecutionLog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateMCPToolExecutionLog" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the MCPToolExecutionLog table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_mcp_tool_execution_log"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_mcp_tool_execution_log" ON "__mj"."MCPToolExecutionLog";

CREATE TRIGGER "trg_update_mcp_tool_execution_log"
BEFORE UPDATE ON "__mj"."MCPToolExecutionLog"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_mcp_tool_execution_log"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: MCP Tool Execution Logs
-- Item: spDeleteMCPToolExecutionLog
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR MCPToolExecutionLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteMCPToolExecutionLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteMCPToolExecutionLog"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."MCPToolExecutionLog"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteMCPToolExecutionLog" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Run Details
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_detail_process_run_id"
    ON "__mj"."ProcessRunDetail" ("ProcessRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_detail_entity_id"
    ON "__mj"."ProcessRunDetail" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_detail_action_execution_log_id"
    ON "__mj"."ProcessRunDetail" ("ActionExecutionLogID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_detail_ai_agent_run_id"
    ON "__mj"."ProcessRunDetail" ("AIAgentRunID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Run Details
-- Item: vwProcessRunDetails
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Process Run Details
-----               SCHEMA:      __mj
-----               BASE TABLE:  ProcessRunDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwProcessRunDetails"
AS
SELECT
    p.*,
    MJEntity_EntityID."Name" AS "Entity",
    MJActionExecutionLog_ActionExecutionLogID."Action" AS "ActionExecutionLog",
    MJAIAgentRun_AIAgentRunID."RunName" AS "AIAgentRun"
FROM
    "__mj"."ProcessRunDetail" AS p
INNER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "p"."EntityID" = MJEntity_EntityID."ID"
LEFT OUTER JOIN
    "__mj"."vwActionExecutionLogs" AS MJActionExecutionLog_ActionExecutionLogID
  ON
    "p"."ActionExecutionLogID" = MJActionExecutionLog_ActionExecutionLogID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgentRun" AS MJAIAgentRun_AIAgentRunID
  ON
    "p"."AIAgentRunID" = MJAIAgentRun_AIAgentRunID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwProcessRunDetails'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwProcessRunDetails'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwProcessRunDetails" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwProcessRunDetails" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwProcessRunDetails" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwProcessRunDetails" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Run Details
-- Item: spCreateProcessRunDetail
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ProcessRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateProcessRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateProcessRunDetail"(
    p_id UUID DEFAULT NULL,
    p_processrunid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_durationms_clear boolean DEFAULT false,
    p_durationms int DEFAULT NULL,
    p_attemptcount int DEFAULT NULL,
    p_resultpayload_clear boolean DEFAULT false,
    p_resultpayload TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_actionexecutionlogid_clear boolean DEFAULT false,
    p_actionexecutionlogid UUID DEFAULT NULL,
    p_aiagentrunid_clear boolean DEFAULT false,
    p_aiagentrunid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwProcessRunDetails" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ProcessRunDetail"
        (
            "ID",
            "ProcessRunID",
                "EntityID",
                "RecordID",
                "Status",
                "StartedAt",
                "CompletedAt",
                "DurationMs",
                "AttemptCount",
                "ResultPayload",
                "ErrorMessage",
                "ActionExecutionLogID",
                "AIAgentRunID"
        )
    VALUES
        (
            v_new_id,
            p_processrunid,
                p_entityid,
                p_recordid,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, NULL) END,
                CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, NULL) END,
                CASE WHEN p_durationms_clear = true THEN NULL ELSE COALESCE(p_durationms, NULL) END,
                COALESCE(p_attemptcount, 0),
                CASE WHEN p_resultpayload_clear = true THEN NULL ELSE COALESCE(p_resultpayload, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_actionexecutionlogid_clear = true THEN NULL ELSE COALESCE(p_actionexecutionlogid, NULL) END,
                CASE WHEN p_aiagentrunid_clear = true THEN NULL ELSE COALESCE(p_aiagentrunid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwProcessRunDetails"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateProcessRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateProcessRunDetail" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Run Details
-- Item: spUpdateProcessRunDetail
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ProcessRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateProcessRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateProcessRunDetail"(
    p_id UUID,
    p_processrunid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_durationms_clear boolean DEFAULT false,
    p_durationms int DEFAULT NULL,
    p_attemptcount int DEFAULT NULL,
    p_resultpayload_clear boolean DEFAULT false,
    p_resultpayload TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_actionexecutionlogid_clear boolean DEFAULT false,
    p_actionexecutionlogid UUID DEFAULT NULL,
    p_aiagentrunid_clear boolean DEFAULT false,
    p_aiagentrunid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwProcessRunDetails" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ProcessRunDetail"
    SET
        "ProcessRunID" = COALESCE(p_processrunid, "ProcessRunID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "RecordID" = COALESCE(p_recordid, "RecordID"),
        "Status" = COALESCE(p_status, "Status"),
        "StartedAt" = CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, "StartedAt") END,
        "CompletedAt" = CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, "CompletedAt") END,
        "DurationMs" = CASE WHEN p_durationms_clear = true THEN NULL ELSE COALESCE(p_durationms, "DurationMs") END,
        "AttemptCount" = COALESCE(p_attemptcount, "AttemptCount"),
        "ResultPayload" = CASE WHEN p_resultpayload_clear = true THEN NULL ELSE COALESCE(p_resultpayload, "ResultPayload") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "ActionExecutionLogID" = CASE WHEN p_actionexecutionlogid_clear = true THEN NULL ELSE COALESCE(p_actionexecutionlogid, "ActionExecutionLogID") END,
        "AIAgentRunID" = CASE WHEN p_aiagentrunid_clear = true THEN NULL ELSE COALESCE(p_aiagentrunid, "AIAgentRunID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwProcessRunDetails"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateProcessRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateProcessRunDetail" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProcessRunDetail table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_process_run_detail"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_process_run_detail" ON "__mj"."ProcessRunDetail";

CREATE TRIGGER "trg_update_process_run_detail"
BEFORE UPDATE ON "__mj"."ProcessRunDetail"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_process_run_detail"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Run Details
-- Item: spDeleteProcessRunDetail
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ProcessRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteProcessRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteProcessRunDetail"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ProcessRunDetail"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteProcessRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteProcessRunDetail" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queue Tasks
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_queue_task_queue_id"
    ON "__mj"."QueueTask" ("QueueID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queue Tasks
-- Item: vwQueueTasks
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Queue Tasks
-----               SCHEMA:      __mj
-----               BASE TABLE:  QueueTask
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwQueueTasks"
AS
SELECT
    q.*,
    MJQueue_QueueID."Name" AS "Queue"
FROM
    "__mj"."QueueTask" AS q
INNER JOIN
    "__mj"."Queue" AS MJQueue_QueueID
  ON
    "q"."QueueID" = MJQueue_QueueID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwQueueTasks'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwQueueTasks'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwQueueTasks" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwQueueTasks" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwQueueTasks" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwQueueTasks" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queue Tasks
-- Item: spCreateQueueTask
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR QueueTask
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateQueueTask'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateQueueTask"(
    p_id UUID DEFAULT NULL,
    p_queueid UUID DEFAULT NULL,
    p_status char(10) DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_data_clear boolean DEFAULT false,
    p_data TEXT DEFAULT NULL,
    p_options_clear boolean DEFAULT false,
    p_options TEXT DEFAULT NULL,
    p_output_clear boolean DEFAULT false,
    p_output TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwQueueTasks" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."QueueTask"
        (
            "ID",
            "QueueID",
                "Status",
                "StartedAt",
                "EndedAt",
                "Data",
                "Options",
                "Output",
                "ErrorMessage",
                "Comments"
        )
    VALUES
        (
            v_new_id,
            p_queueid,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, NULL) END,
                CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, NULL) END,
                CASE WHEN p_data_clear = true THEN NULL ELSE COALESCE(p_data, NULL) END,
                CASE WHEN p_options_clear = true THEN NULL ELSE COALESCE(p_options, NULL) END,
                CASE WHEN p_output_clear = true THEN NULL ELSE COALESCE(p_output, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwQueueTasks"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateQueueTask" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateQueueTask" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateQueueTask" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queue Tasks
-- Item: spUpdateQueueTask
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR QueueTask
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateQueueTask'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateQueueTask"(
    p_id UUID,
    p_queueid UUID DEFAULT NULL,
    p_status char(10) DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_data_clear boolean DEFAULT false,
    p_data TEXT DEFAULT NULL,
    p_options_clear boolean DEFAULT false,
    p_options TEXT DEFAULT NULL,
    p_output_clear boolean DEFAULT false,
    p_output TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwQueueTasks" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."QueueTask"
    SET
        "QueueID" = COALESCE(p_queueid, "QueueID"),
        "Status" = COALESCE(p_status, "Status"),
        "StartedAt" = CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, "StartedAt") END,
        "EndedAt" = CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, "EndedAt") END,
        "Data" = CASE WHEN p_data_clear = true THEN NULL ELSE COALESCE(p_data, "Data") END,
        "Options" = CASE WHEN p_options_clear = true THEN NULL ELSE COALESCE(p_options, "Options") END,
        "Output" = CASE WHEN p_output_clear = true THEN NULL ELSE COALESCE(p_output, "Output") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwQueueTasks"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateQueueTask" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateQueueTask" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueueTask table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_queue_task"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_queue_task" ON "__mj"."QueueTask";

CREATE TRIGGER "trg_update_queue_task"
BEFORE UPDATE ON "__mj"."QueueTask"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_queue_task"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Queue Tasks
-- Item: spDeleteQueueTask
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR QueueTask
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteQueueTask'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteQueueTask"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."QueueTask"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteQueueTask" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteQueueTask" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Changes
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_change_entity_id"
    ON "__mj"."RecordChange" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_change_user_id"
    ON "__mj"."RecordChange" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_change_replay_run_id"
    ON "__mj"."RecordChange" ("ReplayRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_change_integration_id"
    ON "__mj"."RecordChange" ("IntegrationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_change_restored_from_id"
    ON "__mj"."RecordChange" ("RestoredFromID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Changes
-- Item: vwRecordChanges
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Record Changes
-----               SCHEMA:      __mj
-----               BASE TABLE:  RecordChange
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwRecordChanges"
AS
SELECT
    r.*,
    MJEntity_EntityID."Name" AS "Entity",
    MJUser_UserID."Name" AS "User",
    MJRecordChangeReplayRun_ReplayRunID."User" AS "ReplayRun",
    MJIntegration_IntegrationID."Name" AS "Integration",
    MJRecordChange_RestoredFromID."RecordID" AS "RestoredFrom"
FROM
    "__mj"."RecordChange" AS r
INNER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "r"."EntityID" = MJEntity_EntityID."ID"
INNER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "r"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."vwRecordChangeReplayRuns" AS MJRecordChangeReplayRun_ReplayRunID
  ON
    "r"."ReplayRunID" = MJRecordChangeReplayRun_ReplayRunID."ID"
LEFT OUTER JOIN
    "__mj"."Integration" AS MJIntegration_IntegrationID
  ON
    "r"."IntegrationID" = MJIntegration_IntegrationID."ID"
LEFT OUTER JOIN
    "__mj"."RecordChange" AS MJRecordChange_RestoredFromID
  ON
    "r"."RestoredFromID" = MJRecordChange_RestoredFromID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwRecordChanges'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwRecordChanges'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwRecordChanges" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwRecordChanges" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRecordChanges" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRecordChanges" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Changes
-- Item: spCreateRecordChange
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RecordChange
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRecordChange'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateRecordChange"(
    p_id UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(750) DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_type varchar(20) DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL,
    p_changedat TIMESTAMPTZ DEFAULT NULL,
    p_changesjson TEXT DEFAULT NULL,
    p_changesdescription TEXT DEFAULT NULL,
    p_fullrecordjson TEXT DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_errorlog_clear boolean DEFAULT false,
    p_errorlog TEXT DEFAULT NULL,
    p_replayrunid_clear boolean DEFAULT false,
    p_replayrunid UUID DEFAULT NULL,
    p_integrationid_clear boolean DEFAULT false,
    p_integrationid UUID DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_restoredfromid_clear boolean DEFAULT false,
    p_restoredfromid UUID DEFAULT NULL,
    p_restorereason_clear boolean DEFAULT false,
    p_restorereason TEXT DEFAULT NULL,
    p_changecontext_clear boolean DEFAULT false,
    p_changecontext TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwRecordChanges" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."RecordChange"
        (
            "ID",
            "EntityID",
                "RecordID",
                "UserID",
                "Type",
                "Source",
                "ChangedAt",
                "ChangesJSON",
                "ChangesDescription",
                "FullRecordJSON",
                "Status",
                "ErrorLog",
                "ReplayRunID",
                "IntegrationID",
                "Comments",
                "RestoredFromID",
                "RestoreReason",
                "ChangeContext"
        )
    VALUES
        (
            v_new_id,
            p_entityid,
                p_recordid,
                p_userid,
                COALESCE(p_type, 'Create'),
                COALESCE(p_source, 'Internal'),
                COALESCE(p_changedat, NOW()),
                p_changesjson,
                p_changesdescription,
                p_fullrecordjson,
                COALESCE(p_status, 'Complete'),
                CASE WHEN p_errorlog_clear = true THEN NULL ELSE COALESCE(p_errorlog, NULL) END,
                CASE WHEN p_replayrunid_clear = true THEN NULL ELSE COALESCE(p_replayrunid, NULL) END,
                CASE WHEN p_integrationid_clear = true THEN NULL ELSE COALESCE(p_integrationid, NULL) END,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                CASE WHEN p_restoredfromid_clear = true THEN NULL ELSE COALESCE(p_restoredfromid, NULL) END,
                CASE WHEN p_restorereason_clear = true THEN NULL ELSE COALESCE(p_restorereason, NULL) END,
                CASE WHEN p_changecontext_clear = true THEN NULL ELSE COALESCE(p_changecontext, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwRecordChanges"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRecordChange" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRecordChange" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRecordChange" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Changes
-- Item: spUpdateRecordChange
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RecordChange
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRecordChange'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateRecordChange"(
    p_id UUID,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(750) DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_type varchar(20) DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL,
    p_changedat TIMESTAMPTZ DEFAULT NULL,
    p_changesjson TEXT DEFAULT NULL,
    p_changesdescription TEXT DEFAULT NULL,
    p_fullrecordjson TEXT DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_errorlog_clear boolean DEFAULT false,
    p_errorlog TEXT DEFAULT NULL,
    p_replayrunid_clear boolean DEFAULT false,
    p_replayrunid UUID DEFAULT NULL,
    p_integrationid_clear boolean DEFAULT false,
    p_integrationid UUID DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_restoredfromid_clear boolean DEFAULT false,
    p_restoredfromid UUID DEFAULT NULL,
    p_restorereason_clear boolean DEFAULT false,
    p_restorereason TEXT DEFAULT NULL,
    p_changecontext_clear boolean DEFAULT false,
    p_changecontext TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwRecordChanges" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."RecordChange"
    SET
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "RecordID" = COALESCE(p_recordid, "RecordID"),
        "UserID" = COALESCE(p_userid, "UserID"),
        "Type" = COALESCE(p_type, "Type"),
        "Source" = COALESCE(p_source, "Source"),
        "ChangedAt" = COALESCE(p_changedat, "ChangedAt"),
        "ChangesJSON" = COALESCE(p_changesjson, "ChangesJSON"),
        "ChangesDescription" = COALESCE(p_changesdescription, "ChangesDescription"),
        "FullRecordJSON" = COALESCE(p_fullrecordjson, "FullRecordJSON"),
        "Status" = COALESCE(p_status, "Status"),
        "ErrorLog" = CASE WHEN p_errorlog_clear = true THEN NULL ELSE COALESCE(p_errorlog, "ErrorLog") END,
        "ReplayRunID" = CASE WHEN p_replayrunid_clear = true THEN NULL ELSE COALESCE(p_replayrunid, "ReplayRunID") END,
        "IntegrationID" = CASE WHEN p_integrationid_clear = true THEN NULL ELSE COALESCE(p_integrationid, "IntegrationID") END,
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "RestoredFromID" = CASE WHEN p_restoredfromid_clear = true THEN NULL ELSE COALESCE(p_restoredfromid, "RestoredFromID") END,
        "RestoreReason" = CASE WHEN p_restorereason_clear = true THEN NULL ELSE COALESCE(p_restorereason, "RestoreReason") END,
        "ChangeContext" = CASE WHEN p_changecontext_clear = true THEN NULL ELSE COALESCE(p_changecontext, "ChangeContext") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwRecordChanges"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRecordChange" TO "cdp_Developer";




-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Changes
-- Item: spDeleteRecordChange
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RecordChange
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRecordChange'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRecordChange"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."RecordChange"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Log Items
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_clone_log_item_record_clone_log_id"
    ON "__mj"."RecordCloneLogItem" ("RecordCloneLogID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_clone_log_item_entity_id"
    ON "__mj"."RecordCloneLogItem" ("EntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Log Items
-- Item: vwRecordCloneLogItems
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Record Clone Log Items
-----               SCHEMA:      __mj
-----               BASE TABLE:  RecordCloneLogItem
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwRecordCloneLogItems"
AS
SELECT
    r.*,
    MJEntity_EntityID."Name" AS "Entity"
FROM
    "__mj"."RecordCloneLogItem" AS r
INNER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "r"."EntityID" = MJEntity_EntityID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwRecordCloneLogItems'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwRecordCloneLogItems'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwRecordCloneLogItems" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwRecordCloneLogItems" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRecordCloneLogItems" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRecordCloneLogItems" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Log Items
-- Item: spCreateRecordCloneLogItem
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RecordCloneLogItem
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRecordCloneLogItem'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateRecordCloneLogItem"(
    p_id UUID DEFAULT NULL,
    p_recordclonelogid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_sourcerecordid varchar(750) DEFAULT NULL,
    p_targetrecordid_clear boolean DEFAULT false,
    p_targetrecordid varchar(750) DEFAULT NULL,
    p_depth int DEFAULT NULL,
    p_route varchar(20) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_reason_clear boolean DEFAULT false,
    p_reason TEXT DEFAULT NULL,
    p_fieldchangesjson_clear boolean DEFAULT false,
    p_fieldchangesjson TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwRecordCloneLogItems" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."RecordCloneLogItem"
        (
            "ID",
            "RecordCloneLogID",
                "EntityID",
                "SourceRecordID",
                "TargetRecordID",
                "Depth",
                "Route",
                "Status",
                "Sequence",
                "Reason",
                "FieldChangesJSON"
        )
    VALUES
        (
            v_new_id,
            p_recordclonelogid,
                p_entityid,
                p_sourcerecordid,
                CASE WHEN p_targetrecordid_clear = true THEN NULL ELSE COALESCE(p_targetrecordid, NULL) END,
                COALESCE(p_depth, 0),
                p_route,
                p_status,
                COALESCE(p_sequence, 0),
                CASE WHEN p_reason_clear = true THEN NULL ELSE COALESCE(p_reason, NULL) END,
                CASE WHEN p_fieldchangesjson_clear = true THEN NULL ELSE COALESCE(p_fieldchangesjson, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwRecordCloneLogItems"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRecordCloneLogItem" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRecordCloneLogItem" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Log Items
-- Item: spUpdateRecordCloneLogItem
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RecordCloneLogItem
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRecordCloneLogItem'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateRecordCloneLogItem"(
    p_id UUID,
    p_recordclonelogid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_sourcerecordid varchar(750) DEFAULT NULL,
    p_targetrecordid_clear boolean DEFAULT false,
    p_targetrecordid varchar(750) DEFAULT NULL,
    p_depth int DEFAULT NULL,
    p_route varchar(20) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_reason_clear boolean DEFAULT false,
    p_reason TEXT DEFAULT NULL,
    p_fieldchangesjson_clear boolean DEFAULT false,
    p_fieldchangesjson TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwRecordCloneLogItems" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."RecordCloneLogItem"
    SET
        "RecordCloneLogID" = COALESCE(p_recordclonelogid, "RecordCloneLogID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "SourceRecordID" = COALESCE(p_sourcerecordid, "SourceRecordID"),
        "TargetRecordID" = CASE WHEN p_targetrecordid_clear = true THEN NULL ELSE COALESCE(p_targetrecordid, "TargetRecordID") END,
        "Depth" = COALESCE(p_depth, "Depth"),
        "Route" = COALESCE(p_route, "Route"),
        "Status" = COALESCE(p_status, "Status"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "Reason" = CASE WHEN p_reason_clear = true THEN NULL ELSE COALESCE(p_reason, "Reason") END,
        "FieldChangesJSON" = CASE WHEN p_fieldchangesjson_clear = true THEN NULL ELSE COALESCE(p_fieldchangesjson, "FieldChangesJSON") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwRecordCloneLogItems"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRecordCloneLogItem" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRecordCloneLogItem" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordCloneLogItem table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_record_clone_log_item"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_record_clone_log_item" ON "__mj"."RecordCloneLogItem";

CREATE TRIGGER "trg_update_record_clone_log_item"
BEFORE UPDATE ON "__mj"."RecordCloneLogItem"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_record_clone_log_item"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Log Items
-- Item: spDeleteRecordCloneLogItem
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RecordCloneLogItem
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRecordCloneLogItem'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRecordCloneLogItem"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."RecordCloneLogItem"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRecordCloneLogItem" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRecordCloneLogItem" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Logs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_clone_log_root_entity_id"
    ON "__mj"."RecordCloneLog" ("RootEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_clone_log_initiated_by_user_id"
    ON "__mj"."RecordCloneLog" ("InitiatedByUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_clone_log_process_run_id"
    ON "__mj"."RecordCloneLog" ("ProcessRunID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Logs
-- Item: vwRecordCloneLogs
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Record Clone Logs
-----               SCHEMA:      __mj
-----               BASE TABLE:  RecordCloneLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwRecordCloneLogs"
AS
SELECT
    r.*,
    MJEntity_RootEntityID."Name" AS "RootEntity",
    MJUser_InitiatedByUserID."Name" AS "InitiatedByUser"
FROM
    "__mj"."RecordCloneLog" AS r
INNER JOIN
    "__mj"."Entity" AS MJEntity_RootEntityID
  ON
    "r"."RootEntityID" = MJEntity_RootEntityID."ID"
INNER JOIN
    "__mj"."User" AS MJUser_InitiatedByUserID
  ON
    "r"."InitiatedByUserID" = MJUser_InitiatedByUserID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwRecordCloneLogs'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwRecordCloneLogs'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwRecordCloneLogs" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwRecordCloneLogs" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRecordCloneLogs" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRecordCloneLogs" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Logs
-- Item: spCreateRecordCloneLog
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RecordCloneLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRecordCloneLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateRecordCloneLog"(
    p_id UUID DEFAULT NULL,
    p_rootentityid UUID DEFAULT NULL,
    p_rootsourcerecordid varchar(750) DEFAULT NULL,
    p_roottargetrecordid_clear boolean DEFAULT false,
    p_roottargetrecordid varchar(750) DEFAULT NULL,
    p_initiatedbyuserid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_planhash varchar(64) DEFAULT NULL,
    p_planjson TEXT DEFAULT NULL,
    p_optionsjson_clear boolean DEFAULT false,
    p_optionsjson TEXT DEFAULT NULL,
    p_resultjson_clear boolean DEFAULT false,
    p_resultjson TEXT DEFAULT NULL,
    p_reason_clear boolean DEFAULT false,
    p_reason TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_processrunid_clear boolean DEFAULT false,
    p_processrunid UUID DEFAULT NULL,
    p_createdcount int DEFAULT NULL,
    p_referencedcount int DEFAULT NULL,
    p_skippedcount int DEFAULT NULL
) RETURNS SETOF "__mj"."vwRecordCloneLogs" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."RecordCloneLog"
        (
            "ID",
            "RootEntityID",
                "RootSourceRecordID",
                "RootTargetRecordID",
                "InitiatedByUserID",
                "Status",
                "StartedAt",
                "EndedAt",
                "PlanHash",
                "PlanJSON",
                "OptionsJSON",
                "ResultJSON",
                "Reason",
                "ErrorMessage",
                "ProcessRunID",
                "CreatedCount",
                "ReferencedCount",
                "SkippedCount"
        )
    VALUES
        (
            v_new_id,
            p_rootentityid,
                p_rootsourcerecordid,
                CASE WHEN p_roottargetrecordid_clear = true THEN NULL ELSE COALESCE(p_roottargetrecordid, NULL) END,
                p_initiatedbyuserid,
                COALESCE(p_status, 'Planned'),
                COALESCE(p_startedat, NOW() AT TIME ZONE 'UTC'),
                CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, NULL) END,
                p_planhash,
                p_planjson,
                CASE WHEN p_optionsjson_clear = true THEN NULL ELSE COALESCE(p_optionsjson, NULL) END,
                CASE WHEN p_resultjson_clear = true THEN NULL ELSE COALESCE(p_resultjson, NULL) END,
                CASE WHEN p_reason_clear = true THEN NULL ELSE COALESCE(p_reason, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_processrunid_clear = true THEN NULL ELSE COALESCE(p_processrunid, NULL) END,
                COALESCE(p_createdcount, 0),
                COALESCE(p_referencedcount, 0),
                COALESCE(p_skippedcount, 0)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwRecordCloneLogs"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRecordCloneLog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRecordCloneLog" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Logs
-- Item: spUpdateRecordCloneLog
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RecordCloneLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRecordCloneLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateRecordCloneLog"(
    p_id UUID,
    p_rootentityid UUID DEFAULT NULL,
    p_rootsourcerecordid varchar(750) DEFAULT NULL,
    p_roottargetrecordid_clear boolean DEFAULT false,
    p_roottargetrecordid varchar(750) DEFAULT NULL,
    p_initiatedbyuserid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_planhash varchar(64) DEFAULT NULL,
    p_planjson TEXT DEFAULT NULL,
    p_optionsjson_clear boolean DEFAULT false,
    p_optionsjson TEXT DEFAULT NULL,
    p_resultjson_clear boolean DEFAULT false,
    p_resultjson TEXT DEFAULT NULL,
    p_reason_clear boolean DEFAULT false,
    p_reason TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_processrunid_clear boolean DEFAULT false,
    p_processrunid UUID DEFAULT NULL,
    p_createdcount int DEFAULT NULL,
    p_referencedcount int DEFAULT NULL,
    p_skippedcount int DEFAULT NULL
) RETURNS SETOF "__mj"."vwRecordCloneLogs" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."RecordCloneLog"
    SET
        "RootEntityID" = COALESCE(p_rootentityid, "RootEntityID"),
        "RootSourceRecordID" = COALESCE(p_rootsourcerecordid, "RootSourceRecordID"),
        "RootTargetRecordID" = CASE WHEN p_roottargetrecordid_clear = true THEN NULL ELSE COALESCE(p_roottargetrecordid, "RootTargetRecordID") END,
        "InitiatedByUserID" = COALESCE(p_initiatedbyuserid, "InitiatedByUserID"),
        "Status" = COALESCE(p_status, "Status"),
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "EndedAt" = CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, "EndedAt") END,
        "PlanHash" = COALESCE(p_planhash, "PlanHash"),
        "PlanJSON" = COALESCE(p_planjson, "PlanJSON"),
        "OptionsJSON" = CASE WHEN p_optionsjson_clear = true THEN NULL ELSE COALESCE(p_optionsjson, "OptionsJSON") END,
        "ResultJSON" = CASE WHEN p_resultjson_clear = true THEN NULL ELSE COALESCE(p_resultjson, "ResultJSON") END,
        "Reason" = CASE WHEN p_reason_clear = true THEN NULL ELSE COALESCE(p_reason, "Reason") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "ProcessRunID" = CASE WHEN p_processrunid_clear = true THEN NULL ELSE COALESCE(p_processrunid, "ProcessRunID") END,
        "CreatedCount" = COALESCE(p_createdcount, "CreatedCount"),
        "ReferencedCount" = COALESCE(p_referencedcount, "ReferencedCount"),
        "SkippedCount" = COALESCE(p_skippedcount, "SkippedCount")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwRecordCloneLogs"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRecordCloneLog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRecordCloneLog" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the RecordCloneLog table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_record_clone_log"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_record_clone_log" ON "__mj"."RecordCloneLog";

CREATE TRIGGER "trg_update_record_clone_log"
BEFORE UPDATE ON "__mj"."RecordCloneLog"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_record_clone_log"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Clone Logs
-- Item: spDeleteRecordCloneLog
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RecordCloneLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRecordCloneLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRecordCloneLog"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."RecordCloneLog"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRecordCloneLog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteRecordCloneLog" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Scheduled Job Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_scheduled_job_run_scheduled_job_id"
    ON "__mj"."ScheduledJobRun" ("ScheduledJobID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_scheduled_job_run_executed_by_user_id"
    ON "__mj"."ScheduledJobRun" ("ExecutedByUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Scheduled Job Runs
-- Item: vwScheduledJobRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Scheduled Job Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  ScheduledJobRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwScheduledJobRuns"
AS
SELECT
    s.*,
    MJScheduledJob_ScheduledJobID."Name" AS "ScheduledJob",
    MJUser_ExecutedByUserID."Name" AS "ExecutedByUser"
FROM
    "__mj"."ScheduledJobRun" AS s
INNER JOIN
    "__mj"."ScheduledJob" AS MJScheduledJob_ScheduledJobID
  ON
    "s"."ScheduledJobID" = MJScheduledJob_ScheduledJobID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_ExecutedByUserID
  ON
    "s"."ExecutedByUserID" = MJUser_ExecutedByUserID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwScheduledJobRuns'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwScheduledJobRuns'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwScheduledJobRuns" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwScheduledJobRuns" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwScheduledJobRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwScheduledJobRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Scheduled Job Runs
-- Item: spCreateScheduledJobRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ScheduledJobRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateScheduledJobRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateScheduledJobRun"(
    p_id UUID DEFAULT NULL,
    p_scheduledjobid UUID DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_success_clear boolean DEFAULT false,
    p_success BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_details_clear boolean DEFAULT false,
    p_details TEXT DEFAULT NULL,
    p_executedbyuserid_clear boolean DEFAULT false,
    p_executedbyuserid UUID DEFAULT NULL,
    p_queuedat_clear boolean DEFAULT false,
    p_queuedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwScheduledJobRuns" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ScheduledJobRun"
        (
            "ID",
            "ScheduledJobID",
                "StartedAt",
                "CompletedAt",
                "Status",
                "Success",
                "ErrorMessage",
                "Details",
                "ExecutedByUserID",
                "QueuedAt"
        )
    VALUES
        (
            v_new_id,
            p_scheduledjobid,
                COALESCE(p_startedat, NOW()),
                CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, NULL) END,
                COALESCE(p_status, 'Running'),
                CASE WHEN p_success_clear = true THEN NULL ELSE COALESCE(p_success, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_details_clear = true THEN NULL ELSE COALESCE(p_details, NULL) END,
                CASE WHEN p_executedbyuserid_clear = true THEN NULL ELSE COALESCE(p_executedbyuserid, NULL) END,
                CASE WHEN p_queuedat_clear = true THEN NULL ELSE COALESCE(p_queuedat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwScheduledJobRuns"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateScheduledJobRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateScheduledJobRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Scheduled Job Runs
-- Item: spUpdateScheduledJobRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ScheduledJobRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateScheduledJobRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateScheduledJobRun"(
    p_id UUID,
    p_scheduledjobid UUID DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_success_clear boolean DEFAULT false,
    p_success BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_details_clear boolean DEFAULT false,
    p_details TEXT DEFAULT NULL,
    p_executedbyuserid_clear boolean DEFAULT false,
    p_executedbyuserid UUID DEFAULT NULL,
    p_queuedat_clear boolean DEFAULT false,
    p_queuedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwScheduledJobRuns" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ScheduledJobRun"
    SET
        "ScheduledJobID" = COALESCE(p_scheduledjobid, "ScheduledJobID"),
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "CompletedAt" = CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, "CompletedAt") END,
        "Status" = COALESCE(p_status, "Status"),
        "Success" = CASE WHEN p_success_clear = true THEN NULL ELSE COALESCE(p_success, "Success") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "Details" = CASE WHEN p_details_clear = true THEN NULL ELSE COALESCE(p_details, "Details") END,
        "ExecutedByUserID" = CASE WHEN p_executedbyuserid_clear = true THEN NULL ELSE COALESCE(p_executedbyuserid, "ExecutedByUserID") END,
        "QueuedAt" = CASE WHEN p_queuedat_clear = true THEN NULL ELSE COALESCE(p_queuedat, "QueuedAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwScheduledJobRuns"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateScheduledJobRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateScheduledJobRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ScheduledJobRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_scheduled_job_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_scheduled_job_run" ON "__mj"."ScheduledJobRun";

CREATE TRIGGER "trg_update_scheduled_job_run"
BEFORE UPDATE ON "__mj"."ScheduledJobRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_scheduled_job_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Scheduled Job Runs
-- Item: spDeleteScheduledJobRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ScheduledJobRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteScheduledJobRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteScheduledJobRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ScheduledJobRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteScheduledJobRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteScheduledJobRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Search Execution Logs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_search_execution_log_search_scope_id"
    ON "__mj"."SearchExecutionLog" ("SearchScopeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_search_execution_log_user_id"
    ON "__mj"."SearchExecutionLog" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_search_execution_log_ai_agent_id"
    ON "__mj"."SearchExecutionLog" ("AIAgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_search_execution_log_ai_skill_id"
    ON "__mj"."SearchExecutionLog" ("AISkillID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Search Execution Logs
-- Item: vwSearchExecutionLogs
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Search Execution Logs
-----               SCHEMA:      __mj
-----               BASE TABLE:  SearchExecutionLog
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwSearchExecutionLogs"
AS
SELECT
    s.*,
    MJSearchScope_SearchScopeID."Name" AS "SearchScope",
    MJUser_UserID."Name" AS "User",
    MJAIAgent_AIAgentID."Name" AS "AIAgent",
    MJAISkill_AISkillID."Name" AS "AISkill"
FROM
    "__mj"."SearchExecutionLog" AS s
LEFT OUTER JOIN
    "__mj"."SearchScope" AS MJSearchScope_SearchScopeID
  ON
    "s"."SearchScopeID" = MJSearchScope_SearchScopeID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "s"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AIAgentID
  ON
    "s"."AIAgentID" = MJAIAgent_AIAgentID."ID"
LEFT OUTER JOIN
    "__mj"."AISkill" AS MJAISkill_AISkillID
  ON
    "s"."AISkillID" = MJAISkill_AISkillID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwSearchExecutionLogs'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwSearchExecutionLogs'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwSearchExecutionLogs" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwSearchExecutionLogs" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwSearchExecutionLogs" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwSearchExecutionLogs" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Search Execution Logs
-- Item: spCreateSearchExecutionLog
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR SearchExecutionLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateSearchExecutionLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateSearchExecutionLog"(
    p_id UUID DEFAULT NULL,
    p_searchscopeid_clear boolean DEFAULT false,
    p_searchscopeid UUID DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_aiagentid_clear boolean DEFAULT false,
    p_aiagentid UUID DEFAULT NULL,
    p_query TEXT DEFAULT NULL,
    p_totaldurationms int DEFAULT NULL,
    p_resultcount int DEFAULT NULL,
    p_rerankername_clear boolean DEFAULT false,
    p_rerankername varchar(100) DEFAULT NULL,
    p_rerankercostcents_clear boolean DEFAULT false,
    p_rerankercostcents decimal(10, 4) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_failurereason_clear boolean DEFAULT false,
    p_failurereason varchar(500) DEFAULT NULL,
    p_providersjson_clear boolean DEFAULT false,
    p_providersjson TEXT DEFAULT NULL,
    p_aiskillid_clear boolean DEFAULT false,
    p_aiskillid UUID DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid UUID DEFAULT NULL,
    p_scopedecisionjson_clear boolean DEFAULT false,
    p_scopedecisionjson TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwSearchExecutionLogs" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."SearchExecutionLog"
        (
            "ID",
            "SearchScopeID",
                "UserID",
                "AIAgentID",
                "Query",
                "TotalDurationMs",
                "ResultCount",
                "RerankerName",
                "RerankerCostCents",
                "Status",
                "FailureReason",
                "ProvidersJSON",
                "AISkillID",
                "PrimaryScopeRecordID",
                "ScopeDecisionJSON"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_searchscopeid_clear = true THEN NULL ELSE COALESCE(p_searchscopeid, NULL) END,
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                CASE WHEN p_aiagentid_clear = true THEN NULL ELSE COALESCE(p_aiagentid, NULL) END,
                p_query,
                p_totaldurationms,
                COALESCE(p_resultcount, 0),
                CASE WHEN p_rerankername_clear = true THEN NULL ELSE COALESCE(p_rerankername, NULL) END,
                CASE WHEN p_rerankercostcents_clear = true THEN NULL ELSE COALESCE(p_rerankercostcents, NULL) END,
                p_status,
                CASE WHEN p_failurereason_clear = true THEN NULL ELSE COALESCE(p_failurereason, NULL) END,
                CASE WHEN p_providersjson_clear = true THEN NULL ELSE COALESCE(p_providersjson, NULL) END,
                CASE WHEN p_aiskillid_clear = true THEN NULL ELSE COALESCE(p_aiskillid, NULL) END,
                CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, NULL) END,
                CASE WHEN p_scopedecisionjson_clear = true THEN NULL ELSE COALESCE(p_scopedecisionjson, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwSearchExecutionLogs"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateSearchExecutionLog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateSearchExecutionLog" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Search Execution Logs
-- Item: spUpdateSearchExecutionLog
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR SearchExecutionLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateSearchExecutionLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateSearchExecutionLog"(
    p_id UUID,
    p_searchscopeid_clear boolean DEFAULT false,
    p_searchscopeid UUID DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL,
    p_aiagentid_clear boolean DEFAULT false,
    p_aiagentid UUID DEFAULT NULL,
    p_query TEXT DEFAULT NULL,
    p_totaldurationms int DEFAULT NULL,
    p_resultcount int DEFAULT NULL,
    p_rerankername_clear boolean DEFAULT false,
    p_rerankername varchar(100) DEFAULT NULL,
    p_rerankercostcents_clear boolean DEFAULT false,
    p_rerankercostcents decimal(10, 4) DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_failurereason_clear boolean DEFAULT false,
    p_failurereason varchar(500) DEFAULT NULL,
    p_providersjson_clear boolean DEFAULT false,
    p_providersjson TEXT DEFAULT NULL,
    p_aiskillid_clear boolean DEFAULT false,
    p_aiskillid UUID DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid UUID DEFAULT NULL,
    p_scopedecisionjson_clear boolean DEFAULT false,
    p_scopedecisionjson TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwSearchExecutionLogs" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."SearchExecutionLog"
    SET
        "SearchScopeID" = CASE WHEN p_searchscopeid_clear = true THEN NULL ELSE COALESCE(p_searchscopeid, "SearchScopeID") END,
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "AIAgentID" = CASE WHEN p_aiagentid_clear = true THEN NULL ELSE COALESCE(p_aiagentid, "AIAgentID") END,
        "Query" = COALESCE(p_query, "Query"),
        "TotalDurationMs" = COALESCE(p_totaldurationms, "TotalDurationMs"),
        "ResultCount" = COALESCE(p_resultcount, "ResultCount"),
        "RerankerName" = CASE WHEN p_rerankername_clear = true THEN NULL ELSE COALESCE(p_rerankername, "RerankerName") END,
        "RerankerCostCents" = CASE WHEN p_rerankercostcents_clear = true THEN NULL ELSE COALESCE(p_rerankercostcents, "RerankerCostCents") END,
        "Status" = COALESCE(p_status, "Status"),
        "FailureReason" = CASE WHEN p_failurereason_clear = true THEN NULL ELSE COALESCE(p_failurereason, "FailureReason") END,
        "ProvidersJSON" = CASE WHEN p_providersjson_clear = true THEN NULL ELSE COALESCE(p_providersjson, "ProvidersJSON") END,
        "AISkillID" = CASE WHEN p_aiskillid_clear = true THEN NULL ELSE COALESCE(p_aiskillid, "AISkillID") END,
        "PrimaryScopeRecordID" = CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, "PrimaryScopeRecordID") END,
        "ScopeDecisionJSON" = CASE WHEN p_scopedecisionjson_clear = true THEN NULL ELSE COALESCE(p_scopedecisionjson, "ScopeDecisionJSON") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwSearchExecutionLogs"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateSearchExecutionLog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateSearchExecutionLog" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the SearchExecutionLog table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_search_execution_log"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_search_execution_log" ON "__mj"."SearchExecutionLog";

CREATE TRIGGER "trg_update_search_execution_log"
BEFORE UPDATE ON "__mj"."SearchExecutionLog"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_search_execution_log"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Search Execution Logs
-- Item: spDeleteSearchExecutionLog
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR SearchExecutionLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteSearchExecutionLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteSearchExecutionLog"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."SearchExecutionLog"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteSearchExecutionLog" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Run Outputs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_test_run_output_test_run_id"
    ON "__mj"."TestRunOutput" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_test_run_output_output_type_id"
    ON "__mj"."TestRunOutput" ("OutputTypeID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Run Outputs
-- Item: vwTestRunOutputs
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Test Run Outputs
-----               SCHEMA:      __mj
-----               BASE TABLE:  TestRunOutput
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwTestRunOutputs"
AS
SELECT
    t.*,
    MJTestRun_TestRunID."Test" AS "TestRun",
    MJTestRunOutputType_OutputTypeID."Name" AS "OutputType"
FROM
    "__mj"."TestRunOutput" AS t
INNER JOIN
    "__mj"."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "t"."TestRunID" = MJTestRun_TestRunID."ID"
INNER JOIN
    "__mj"."TestRunOutputType" AS MJTestRunOutputType_OutputTypeID
  ON
    "t"."OutputTypeID" = MJTestRunOutputType_OutputTypeID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwTestRunOutputs'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwTestRunOutputs'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwTestRunOutputs" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwTestRunOutputs" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwTestRunOutputs" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwTestRunOutputs" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Run Outputs
-- Item: spCreateTestRunOutput
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR TestRunOutput
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateTestRunOutput'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateTestRunOutput"(
    p_id UUID DEFAULT NULL,
    p_testrunid UUID DEFAULT NULL,
    p_outputtypeid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_stepnumber_clear boolean DEFAULT false,
    p_stepnumber int DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_mimetype_clear boolean DEFAULT false,
    p_mimetype varchar(100) DEFAULT NULL,
    p_inlinedata_clear boolean DEFAULT false,
    p_inlinedata TEXT DEFAULT NULL,
    p_filesizebytes_clear boolean DEFAULT false,
    p_filesizebytes int DEFAULT NULL,
    p_width_clear boolean DEFAULT false,
    p_width int DEFAULT NULL,
    p_height_clear boolean DEFAULT false,
    p_height int DEFAULT NULL,
    p_durationseconds_clear boolean DEFAULT false,
    p_durationseconds decimal(10, 3) DEFAULT NULL,
    p_metadata_clear boolean DEFAULT false,
    p_metadata TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwTestRunOutputs" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."TestRunOutput"
        (
            "ID",
            "TestRunID",
                "OutputTypeID",
                "Sequence",
                "StepNumber",
                "Name",
                "Description",
                "MimeType",
                "InlineData",
                "FileSizeBytes",
                "Width",
                "Height",
                "DurationSeconds",
                "Metadata"
        )
    VALUES
        (
            v_new_id,
            p_testrunid,
                p_outputtypeid,
                COALESCE(p_sequence, 0),
                CASE WHEN p_stepnumber_clear = true THEN NULL ELSE COALESCE(p_stepnumber, NULL) END,
                CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_mimetype_clear = true THEN NULL ELSE COALESCE(p_mimetype, NULL) END,
                CASE WHEN p_inlinedata_clear = true THEN NULL ELSE COALESCE(p_inlinedata, NULL) END,
                CASE WHEN p_filesizebytes_clear = true THEN NULL ELSE COALESCE(p_filesizebytes, NULL) END,
                CASE WHEN p_width_clear = true THEN NULL ELSE COALESCE(p_width, NULL) END,
                CASE WHEN p_height_clear = true THEN NULL ELSE COALESCE(p_height, NULL) END,
                CASE WHEN p_durationseconds_clear = true THEN NULL ELSE COALESCE(p_durationseconds, NULL) END,
                CASE WHEN p_metadata_clear = true THEN NULL ELSE COALESCE(p_metadata, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwTestRunOutputs"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateTestRunOutput" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateTestRunOutput" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Run Outputs
-- Item: spUpdateTestRunOutput
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR TestRunOutput
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateTestRunOutput'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateTestRunOutput"(
    p_id UUID,
    p_testrunid UUID DEFAULT NULL,
    p_outputtypeid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_stepnumber_clear boolean DEFAULT false,
    p_stepnumber int DEFAULT NULL,
    p_name_clear boolean DEFAULT false,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_mimetype_clear boolean DEFAULT false,
    p_mimetype varchar(100) DEFAULT NULL,
    p_inlinedata_clear boolean DEFAULT false,
    p_inlinedata TEXT DEFAULT NULL,
    p_filesizebytes_clear boolean DEFAULT false,
    p_filesizebytes int DEFAULT NULL,
    p_width_clear boolean DEFAULT false,
    p_width int DEFAULT NULL,
    p_height_clear boolean DEFAULT false,
    p_height int DEFAULT NULL,
    p_durationseconds_clear boolean DEFAULT false,
    p_durationseconds decimal(10, 3) DEFAULT NULL,
    p_metadata_clear boolean DEFAULT false,
    p_metadata TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwTestRunOutputs" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."TestRunOutput"
    SET
        "TestRunID" = COALESCE(p_testrunid, "TestRunID"),
        "OutputTypeID" = COALESCE(p_outputtypeid, "OutputTypeID"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "StepNumber" = CASE WHEN p_stepnumber_clear = true THEN NULL ELSE COALESCE(p_stepnumber, "StepNumber") END,
        "Name" = CASE WHEN p_name_clear = true THEN NULL ELSE COALESCE(p_name, "Name") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "MimeType" = CASE WHEN p_mimetype_clear = true THEN NULL ELSE COALESCE(p_mimetype, "MimeType") END,
        "InlineData" = CASE WHEN p_inlinedata_clear = true THEN NULL ELSE COALESCE(p_inlinedata, "InlineData") END,
        "FileSizeBytes" = CASE WHEN p_filesizebytes_clear = true THEN NULL ELSE COALESCE(p_filesizebytes, "FileSizeBytes") END,
        "Width" = CASE WHEN p_width_clear = true THEN NULL ELSE COALESCE(p_width, "Width") END,
        "Height" = CASE WHEN p_height_clear = true THEN NULL ELSE COALESCE(p_height, "Height") END,
        "DurationSeconds" = CASE WHEN p_durationseconds_clear = true THEN NULL ELSE COALESCE(p_durationseconds, "DurationSeconds") END,
        "Metadata" = CASE WHEN p_metadata_clear = true THEN NULL ELSE COALESCE(p_metadata, "Metadata") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwTestRunOutputs"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateTestRunOutput" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateTestRunOutput" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestRunOutput table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_test_run_output"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_test_run_output" ON "__mj"."TestRunOutput";

CREATE TRIGGER "trg_update_test_run_output"
BEFORE UPDATE ON "__mj"."TestRunOutput"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_test_run_output"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Run Outputs
-- Item: spDeleteTestRunOutput
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR TestRunOutput
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteTestRunOutput'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteTestRunOutput"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."TestRunOutput"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteTestRunOutput" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteTestRunOutput" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_test_run_test_id"
    ON "__mj"."TestRun" ("TestID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_test_run_test_suite_run_id"
    ON "__mj"."TestRun" ("TestSuiteRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_test_run_run_by_user_id"
    ON "__mj"."TestRun" ("RunByUserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_test_run_target_log_entity_id"
    ON "__mj"."TestRun" ("TargetLogEntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Runs
-- Item: vwTestRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Test Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  TestRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwTestRuns"
AS
SELECT
    t.*,
    MJTest_TestID."Name" AS "Test",
    MJTestSuiteRun_TestSuiteRunID."Suite" AS "TestSuiteRun",
    MJUser_RunByUserID."Name" AS "RunByUser",
    MJEntity_TargetLogEntityID."Name" AS "TargetLogEntity"
FROM
    "__mj"."TestRun" AS t
INNER JOIN
    "__mj"."Test" AS MJTest_TestID
  ON
    "t"."TestID" = MJTest_TestID."ID"
LEFT OUTER JOIN
    "__mj"."vwTestSuiteRuns" AS MJTestSuiteRun_TestSuiteRunID
  ON
    "t"."TestSuiteRunID" = MJTestSuiteRun_TestSuiteRunID."ID"
INNER JOIN
    "__mj"."User" AS MJUser_RunByUserID
  ON
    "t"."RunByUserID" = MJUser_RunByUserID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_TargetLogEntityID
  ON
    "t"."TargetLogEntityID" = MJEntity_TargetLogEntityID."ID"
$vsql$;
  rec RECORD;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- 42P16: column rename/reorder/type change. CREATE OR REPLACE can't handle
  -- non-additive shape changes — must DROP CASCADE + recreate. CASCADE drops
  -- every dependent view (anything that JOINs this view in its body), so we
  -- capture each dependent's definition + grants BEFORE the drop and replay
  -- them afterward (best-effort). Without this, on a fresh-DB replay where
  -- one entity's wrapper triggers (e.g. vwAIModelTypes shape changed since
  -- baseline V202605021056), CASCADE wipes downstream views (vwAIModels)
  -- that the wrapper for this entity doesn't know how to recreate, and
  -- those views stay permanently missing.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_deps (
    schema_name TEXT,
    view_name   TEXT,
    relkind     CHAR(1),
    definition  TEXT,
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwTestRuns'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

  -- Capture dependent FUNCTIONS too. CASCADE drops every function with
  -- RETURNS SETOF <view> (the codegen-emitted spCreate/spUpdate/spDelete
  -- pattern) when the target view is dropped. Without restoring them,
  -- post-codegen CRUD validation reports those routines as missing —
  -- e.g. "MJ: Recommendation Items → missing create routine
  -- spCreateRecommendationItem" — even though the next codegen pass
  -- emits them. The restored definitions are pg_get_functiondef() output
  -- which is a complete CREATE OR REPLACE FUNCTION statement plus a
  -- trailing semicolon; replaying them verbatim recreates the function
  -- with its original body, parameter list, and return type.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_fn_deps (
    schema_name TEXT,
    fn_name     TEXT,
    fn_oid      OID,
    definition  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_fn_deps;

  -- Capture dependents. NOTES on the grants_sql build:
  --   - Resolve role name via pg_get_userbyid(oid) — returns the bare,
  --     unquoted role name (or 'unknown (OID=N)' if the oid no longer
  --     exists). pg_get_userbyid is a public catalog function available to
  --     every database user, including unprivileged accounts on managed
  --     PostgreSQL services (Amazon RDS, Azure Database for PostgreSQL,
  --     Cloud SQL) where pg_authid is restricted to the rds_superuser /
  --     azure_pg_admin / cloudsqlsuperuser group. Earlier revisions joined
  --     to pg_authid which works on self-hosted PG but fails with
  --     "permission denied for table pg_authid" on managed services.
  --   - The earlier (broken) approach cast (aclexplode).grantee::regrole::text
  --     which RETURNS the role name pre-quoted when it contains uppercase
  --     (e.g. cdp_Developer comes back already wrapped); calling quote_ident
  --     on the already-quoted string double-wrapped and the GRANT failed at
  --     replay with "role does not exist". Using
  --     pg_get_userbyid returns a bare name and lets quote_ident wrap it
  --     correctly exactly once.
  --   - PUBLIC is grantee oid 0; pg_get_userbyid(0) returns 'unknown
  --     (OID=0)' so handle the PUBLIC case explicitly and use it as the
  --     literal 'PUBLIC' rather than quote_ident on the synthetic name.
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
      dn.nspname,
      dc.relname,
      dc.relkind,
      pg_get_viewdef(dc.oid),
      (SELECT string_agg(
          'GRANT ' || g.privilege || ' ON ' || quote_ident(dn.nspname) || '.' || quote_ident(dc.relname) ||
          ' TO ' || (CASE WHEN g.grantee_oid = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee_oid)) END) || ';',
          E'
')
       FROM (
           SELECT (aclexplode(dc.relacl)).grantee AS grantee_oid,
                  (aclexplode(dc.relacl)).privilege_type AS privilege
       ) g
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

  -- Capture dependent functions. Two paths matter on PG:
  --   1. Functions whose RETURN type references the view (RETURNS SETOF
  --      <view>) — pg_depend records this as type=pg_type → pg_class.
  --   2. Functions whose body references the view (used by sql functions
  --      and by some plpgsql edge cases) — pg_depend records this as
  --      pg_proc → pg_class.
  -- pg_get_functiondef returns a complete CREATE OR REPLACE FUNCTION
  -- statement that we replay verbatim. We DO include RETURNS-only
  -- references because that's the dominant codegen pattern (sp* CRUD
  -- functions all RETURNS SETOF the matching vwX).
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwTestRuns'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwTestRuns" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
    BEGIN
      IF rec.relkind = 'm' THEN
        EXECUTE 'CREATE MATERIALIZED VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      ELSE
        EXECUTE 'CREATE VIEW ' || quote_ident(rec.schema_name) || '.' || quote_ident(rec.view_name) || ' AS ' || rec.definition;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent %.%: %', rec.schema_name, rec.view_name, SQLERRM;
    END;

    IF rec.grants_sql IS NOT NULL THEN
      BEGIN
        EXECUTE rec.grants_sql;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Best-effort grant restore skipped %.%: %', rec.schema_name, rec.view_name, SQLERRM;
      END;
    END IF;
  END LOOP;

  -- Replay captured dependent functions AFTER all dependent views are
  -- restored — most codegen-emitted sp* functions reference both the
  -- target view AND the dependent views in their bodies/return types.
  -- Wrapped per-function in its own savepoint so a single failure
  -- doesn't poison subsequent restores or the just-recreated target.
  FOR rec IN SELECT schema_name, fn_name, definition FROM _vw_regen_fn_deps LOOP
    BEGIN
      EXECUTE rec.definition;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Best-effort restore skipped dependent function %.%: %', rec.schema_name, rec.fn_name, SQLERRM;
    END;
  END LOOP;

  DROP TABLE _vw_regen_deps;
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwTestRuns" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwTestRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwTestRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Runs
-- Item: spCreateTestRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR TestRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateTestRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateTestRun"(
    p_id UUID DEFAULT NULL,
    p_testid UUID DEFAULT NULL,
    p_testsuiterunid_clear boolean DEFAULT false,
    p_testsuiterunid UUID DEFAULT NULL,
    p_runbyuserid UUID DEFAULT NULL,
    p_sequence_clear boolean DEFAULT false,
    p_sequence int DEFAULT NULL,
    p_targettype_clear boolean DEFAULT false,
    p_targettype varchar(100) DEFAULT NULL,
    p_targetlogid_clear boolean DEFAULT false,
    p_targetlogid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_durationseconds_clear boolean DEFAULT false,
    p_durationseconds decimal(10, 3) DEFAULT NULL,
    p_inputdata_clear boolean DEFAULT false,
    p_inputdata TEXT DEFAULT NULL,
    p_expectedoutputdata_clear boolean DEFAULT false,
    p_expectedoutputdata TEXT DEFAULT NULL,
    p_actualoutputdata_clear boolean DEFAULT false,
    p_actualoutputdata TEXT DEFAULT NULL,
    p_passedchecks_clear boolean DEFAULT false,
    p_passedchecks int DEFAULT NULL,
    p_failedchecks_clear boolean DEFAULT false,
    p_failedchecks int DEFAULT NULL,
    p_totalchecks_clear boolean DEFAULT false,
    p_totalchecks int DEFAULT NULL,
    p_score_clear boolean DEFAULT false,
    p_score decimal(5, 4) DEFAULT NULL,
    p_costusd_clear boolean DEFAULT false,
    p_costusd decimal(10, 6) DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_resultdetails_clear boolean DEFAULT false,
    p_resultdetails TEXT DEFAULT NULL,
    p_log_clear boolean DEFAULT false,
    p_log TEXT DEFAULT NULL,
    p_tags_clear boolean DEFAULT false,
    p_tags TEXT DEFAULT NULL,
    p_machinename_clear boolean DEFAULT false,
    p_machinename varchar(255) DEFAULT NULL,
    p_machineid_clear boolean DEFAULT false,
    p_machineid varchar(255) DEFAULT NULL,
    p_runbyusername_clear boolean DEFAULT false,
    p_runbyusername varchar(255) DEFAULT NULL,
    p_runbyuseremail_clear boolean DEFAULT false,
    p_runbyuseremail varchar(255) DEFAULT NULL,
    p_runcontextdetails_clear boolean DEFAULT false,
    p_runcontextdetails TEXT DEFAULT NULL,
    p_targetlogentityid_clear boolean DEFAULT false,
    p_targetlogentityid UUID DEFAULT NULL,
    p_resolvedvariables_clear boolean DEFAULT false,
    p_resolvedvariables TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwTestRuns" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."TestRun"
        (
            "ID",
            "TestID",
                "TestSuiteRunID",
                "RunByUserID",
                "Sequence",
                "TargetType",
                "TargetLogID",
                "Status",
                "StartedAt",
                "CompletedAt",
                "DurationSeconds",
                "InputData",
                "ExpectedOutputData",
                "ActualOutputData",
                "PassedChecks",
                "FailedChecks",
                "TotalChecks",
                "Score",
                "CostUSD",
                "ErrorMessage",
                "ResultDetails",
                "Log",
                "Tags",
                "MachineName",
                "MachineID",
                "RunByUserName",
                "RunByUserEmail",
                "RunContextDetails",
                "TargetLogEntityID",
                "ResolvedVariables"
        )
    VALUES
        (
            v_new_id,
            p_testid,
                CASE WHEN p_testsuiterunid_clear = true THEN NULL ELSE COALESCE(p_testsuiterunid, NULL) END,
                p_runbyuserid,
                CASE WHEN p_sequence_clear = true THEN NULL ELSE COALESCE(p_sequence, NULL) END,
                CASE WHEN p_targettype_clear = true THEN NULL ELSE COALESCE(p_targettype, NULL) END,
                CASE WHEN p_targetlogid_clear = true THEN NULL ELSE COALESCE(p_targetlogid, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, NULL) END,
                CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, NULL) END,
                CASE WHEN p_durationseconds_clear = true THEN NULL ELSE COALESCE(p_durationseconds, NULL) END,
                CASE WHEN p_inputdata_clear = true THEN NULL ELSE COALESCE(p_inputdata, NULL) END,
                CASE WHEN p_expectedoutputdata_clear = true THEN NULL ELSE COALESCE(p_expectedoutputdata, NULL) END,
                CASE WHEN p_actualoutputdata_clear = true THEN NULL ELSE COALESCE(p_actualoutputdata, NULL) END,
                CASE WHEN p_passedchecks_clear = true THEN NULL ELSE COALESCE(p_passedchecks, NULL) END,
                CASE WHEN p_failedchecks_clear = true THEN NULL ELSE COALESCE(p_failedchecks, NULL) END,
                CASE WHEN p_totalchecks_clear = true THEN NULL ELSE COALESCE(p_totalchecks, NULL) END,
                CASE WHEN p_score_clear = true THEN NULL ELSE COALESCE(p_score, NULL) END,
                CASE WHEN p_costusd_clear = true THEN NULL ELSE COALESCE(p_costusd, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_resultdetails_clear = true THEN NULL ELSE COALESCE(p_resultdetails, NULL) END,
                CASE WHEN p_log_clear = true THEN NULL ELSE COALESCE(p_log, NULL) END,
                CASE WHEN p_tags_clear = true THEN NULL ELSE COALESCE(p_tags, NULL) END,
                CASE WHEN p_machinename_clear = true THEN NULL ELSE COALESCE(p_machinename, NULL) END,
                CASE WHEN p_machineid_clear = true THEN NULL ELSE COALESCE(p_machineid, NULL) END,
                CASE WHEN p_runbyusername_clear = true THEN NULL ELSE COALESCE(p_runbyusername, NULL) END,
                CASE WHEN p_runbyuseremail_clear = true THEN NULL ELSE COALESCE(p_runbyuseremail, NULL) END,
                CASE WHEN p_runcontextdetails_clear = true THEN NULL ELSE COALESCE(p_runcontextdetails, NULL) END,
                CASE WHEN p_targetlogentityid_clear = true THEN NULL ELSE COALESCE(p_targetlogentityid, NULL) END,
                CASE WHEN p_resolvedvariables_clear = true THEN NULL ELSE COALESCE(p_resolvedvariables, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwTestRuns"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateTestRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateTestRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Runs
-- Item: spUpdateTestRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR TestRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateTestRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateTestRun"(
    p_id UUID,
    p_testid UUID DEFAULT NULL,
    p_testsuiterunid_clear boolean DEFAULT false,
    p_testsuiterunid UUID DEFAULT NULL,
    p_runbyuserid UUID DEFAULT NULL,
    p_sequence_clear boolean DEFAULT false,
    p_sequence int DEFAULT NULL,
    p_targettype_clear boolean DEFAULT false,
    p_targettype varchar(100) DEFAULT NULL,
    p_targetlogid_clear boolean DEFAULT false,
    p_targetlogid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_durationseconds_clear boolean DEFAULT false,
    p_durationseconds decimal(10, 3) DEFAULT NULL,
    p_inputdata_clear boolean DEFAULT false,
    p_inputdata TEXT DEFAULT NULL,
    p_expectedoutputdata_clear boolean DEFAULT false,
    p_expectedoutputdata TEXT DEFAULT NULL,
    p_actualoutputdata_clear boolean DEFAULT false,
    p_actualoutputdata TEXT DEFAULT NULL,
    p_passedchecks_clear boolean DEFAULT false,
    p_passedchecks int DEFAULT NULL,
    p_failedchecks_clear boolean DEFAULT false,
    p_failedchecks int DEFAULT NULL,
    p_totalchecks_clear boolean DEFAULT false,
    p_totalchecks int DEFAULT NULL,
    p_score_clear boolean DEFAULT false,
    p_score decimal(5, 4) DEFAULT NULL,
    p_costusd_clear boolean DEFAULT false,
    p_costusd decimal(10, 6) DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_resultdetails_clear boolean DEFAULT false,
    p_resultdetails TEXT DEFAULT NULL,
    p_log_clear boolean DEFAULT false,
    p_log TEXT DEFAULT NULL,
    p_tags_clear boolean DEFAULT false,
    p_tags TEXT DEFAULT NULL,
    p_machinename_clear boolean DEFAULT false,
    p_machinename varchar(255) DEFAULT NULL,
    p_machineid_clear boolean DEFAULT false,
    p_machineid varchar(255) DEFAULT NULL,
    p_runbyusername_clear boolean DEFAULT false,
    p_runbyusername varchar(255) DEFAULT NULL,
    p_runbyuseremail_clear boolean DEFAULT false,
    p_runbyuseremail varchar(255) DEFAULT NULL,
    p_runcontextdetails_clear boolean DEFAULT false,
    p_runcontextdetails TEXT DEFAULT NULL,
    p_targetlogentityid_clear boolean DEFAULT false,
    p_targetlogentityid UUID DEFAULT NULL,
    p_resolvedvariables_clear boolean DEFAULT false,
    p_resolvedvariables TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwTestRuns" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."TestRun"
    SET
        "TestID" = COALESCE(p_testid, "TestID"),
        "TestSuiteRunID" = CASE WHEN p_testsuiterunid_clear = true THEN NULL ELSE COALESCE(p_testsuiterunid, "TestSuiteRunID") END,
        "RunByUserID" = COALESCE(p_runbyuserid, "RunByUserID"),
        "Sequence" = CASE WHEN p_sequence_clear = true THEN NULL ELSE COALESCE(p_sequence, "Sequence") END,
        "TargetType" = CASE WHEN p_targettype_clear = true THEN NULL ELSE COALESCE(p_targettype, "TargetType") END,
        "TargetLogID" = CASE WHEN p_targetlogid_clear = true THEN NULL ELSE COALESCE(p_targetlogid, "TargetLogID") END,
        "Status" = COALESCE(p_status, "Status"),
        "StartedAt" = CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, "StartedAt") END,
        "CompletedAt" = CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, "CompletedAt") END,
        "DurationSeconds" = CASE WHEN p_durationseconds_clear = true THEN NULL ELSE COALESCE(p_durationseconds, "DurationSeconds") END,
        "InputData" = CASE WHEN p_inputdata_clear = true THEN NULL ELSE COALESCE(p_inputdata, "InputData") END,
        "ExpectedOutputData" = CASE WHEN p_expectedoutputdata_clear = true THEN NULL ELSE COALESCE(p_expectedoutputdata, "ExpectedOutputData") END,
        "ActualOutputData" = CASE WHEN p_actualoutputdata_clear = true THEN NULL ELSE COALESCE(p_actualoutputdata, "ActualOutputData") END,
        "PassedChecks" = CASE WHEN p_passedchecks_clear = true THEN NULL ELSE COALESCE(p_passedchecks, "PassedChecks") END,
        "FailedChecks" = CASE WHEN p_failedchecks_clear = true THEN NULL ELSE COALESCE(p_failedchecks, "FailedChecks") END,
        "TotalChecks" = CASE WHEN p_totalchecks_clear = true THEN NULL ELSE COALESCE(p_totalchecks, "TotalChecks") END,
        "Score" = CASE WHEN p_score_clear = true THEN NULL ELSE COALESCE(p_score, "Score") END,
        "CostUSD" = CASE WHEN p_costusd_clear = true THEN NULL ELSE COALESCE(p_costusd, "CostUSD") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "ResultDetails" = CASE WHEN p_resultdetails_clear = true THEN NULL ELSE COALESCE(p_resultdetails, "ResultDetails") END,
        "Log" = CASE WHEN p_log_clear = true THEN NULL ELSE COALESCE(p_log, "Log") END,
        "Tags" = CASE WHEN p_tags_clear = true THEN NULL ELSE COALESCE(p_tags, "Tags") END,
        "MachineName" = CASE WHEN p_machinename_clear = true THEN NULL ELSE COALESCE(p_machinename, "MachineName") END,
        "MachineID" = CASE WHEN p_machineid_clear = true THEN NULL ELSE COALESCE(p_machineid, "MachineID") END,
        "RunByUserName" = CASE WHEN p_runbyusername_clear = true THEN NULL ELSE COALESCE(p_runbyusername, "RunByUserName") END,
        "RunByUserEmail" = CASE WHEN p_runbyuseremail_clear = true THEN NULL ELSE COALESCE(p_runbyuseremail, "RunByUserEmail") END,
        "RunContextDetails" = CASE WHEN p_runcontextdetails_clear = true THEN NULL ELSE COALESCE(p_runcontextdetails, "RunContextDetails") END,
        "TargetLogEntityID" = CASE WHEN p_targetlogentityid_clear = true THEN NULL ELSE COALESCE(p_targetlogentityid, "TargetLogEntityID") END,
        "ResolvedVariables" = CASE WHEN p_resolvedvariables_clear = true THEN NULL ELSE COALESCE(p_resolvedvariables, "ResolvedVariables") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwTestRuns"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateTestRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateTestRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the TestRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_test_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_test_run" ON "__mj"."TestRun";

CREATE TRIGGER "trg_update_test_run"
BEFORE UPDATE ON "__mj"."TestRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_test_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Test Runs
-- Item: spDeleteTestRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR TestRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteTestRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteTestRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."TestRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteTestRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteTestRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Record Logs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_record_log_user_id"
    ON "__mj"."UserRecordLog" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_user_record_log_entity_id"
    ON "__mj"."UserRecordLog" ("EntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Record Logs
-- Item: Permissions for vwUserRecordLogs
-- ============================================================
GRANT SELECT ON "__mj"."vwUserRecordLogs" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwUserRecordLogs" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwUserRecordLogs" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Record Logs
-- Item: spCreateUserRecordLog
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR UserRecordLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateUserRecordLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateUserRecordLog"(
    p_id UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_earliestat TIMESTAMPTZ DEFAULT NULL,
    p_latestat TIMESTAMPTZ DEFAULT NULL,
    p_totalcount int DEFAULT NULL
) RETURNS SETOF "__mj"."vwUserRecordLogs" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."UserRecordLog"
        (
            "ID",
            "UserID",
                "EntityID",
                "RecordID",
                "EarliestAt",
                "LatestAt",
                "TotalCount"
        )
    VALUES
        (
            v_new_id,
            p_userid,
                p_entityid,
                p_recordid,
                COALESCE(p_earliestat, NOW()),
                COALESCE(p_latestat, NOW()),
                COALESCE(p_totalcount, 0)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwUserRecordLogs"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateUserRecordLog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateUserRecordLog" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Record Logs
-- Item: spUpdateUserRecordLog
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR UserRecordLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateUserRecordLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateUserRecordLog"(
    p_id UUID,
    p_userid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(450) DEFAULT NULL,
    p_earliestat TIMESTAMPTZ DEFAULT NULL,
    p_latestat TIMESTAMPTZ DEFAULT NULL,
    p_totalcount int DEFAULT NULL
) RETURNS SETOF "__mj"."vwUserRecordLogs" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."UserRecordLog"
    SET
        "UserID" = COALESCE(p_userid, "UserID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "RecordID" = COALESCE(p_recordid, "RecordID"),
        "EarliestAt" = COALESCE(p_earliestat, "EarliestAt"),
        "LatestAt" = COALESCE(p_latestat, "LatestAt"),
        "TotalCount" = COALESCE(p_totalcount, "TotalCount")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwUserRecordLogs"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateUserRecordLog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateUserRecordLog" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserRecordLog table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_user_record_log"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_user_record_log" ON "__mj"."UserRecordLog";

CREATE TRIGGER "trg_update_user_record_log"
BEFORE UPDATE ON "__mj"."UserRecordLog"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_user_record_log"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Record Logs
-- Item: spDeleteUserRecordLog
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR UserRecordLog
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteUserRecordLog'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteUserRecordLog"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."UserRecordLog"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteUserRecordLog" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteUserRecordLog" TO "cdp_Integration";
