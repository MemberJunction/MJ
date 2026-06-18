-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606031813__v5.39.x__AIAgentRun_LastHeartbeatAt.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."AIAgentRun"
ADD COLUMN "LastHeartbeatAt" TIMESTAMPTZ NULL /* Adds a liveness heartbeat column to AIAgentRun so a watchdog can distinguish a */ /* run whose owning process is alive and working from one whose process died (restart, */ /* crash, OOM) or whose terminal-state write failed. A run proves liveness by beating; */ /* a stale heartbeat is what makes a Running run safe to force-fail, which is correct */ /* regardless of how many MJAPI instances are running (no blanket "fail all Running"). */ /* Written and compared on the DB clock (GETUTCDATE) by the runtime, never process time, */ /* so heartbeats from different instances behind a load balancer can't disagree. */;

COMMENT ON COLUMN __mj."AIAgentRun"."LastHeartbeatAt" IS 'Timestamp of the most recent liveness heartbeat written by the owning process while this run is in progress. Used by the agent-run watchdog to detect runs orphaned by a process restart/crash or a failed terminal-state write: a Running row whose LastHeartbeatAt has gone stale (or is NULL with an old StartedAt) is force-failed. Always stamped on the database clock (GETUTCDATE), never process time.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ae864635-13fe-474c-bcd9-2238a8cdd682' OR ("EntityID" = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND "Name" = 'LastHeartbeatAt')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('ae864635-13fe-474c-bcd9-2238a8cdd682', '5190AF93-4C39-4429-BDAA-0AEB492A0256' /* Entity: MJ: AI Agent Runs */, 100108, 'LastHeartbeatAt', 'Last Heartbeat At', 'Timestamp of the most recent liveness heartbeat written by the owning process while this run is in progress. Used by the agent-run watchdog to detect runs orphaned by a process restart/crash or a failed terminal-state write: a Running row whose LastHeartbeatAt has gone stale (or is NULL with an old StartedAt) is force-failed. Always stamped on the database clock (GETUTCDATE), never process time.', 'datetimeoffset', 10, 34, 7, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_agent_id"
    ON __mj."AIAgentRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_parent_run_id"
    ON __mj."AIAgentRun" ("ParentRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_id"
    ON __mj."AIAgentRun" ("ConversationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_user_id"
    ON __mj."AIAgentRun" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_conversation_detail_id"
    ON __mj."AIAgentRun" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_last_run_id"
    ON __mj."AIAgentRun" ("LastRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_configuration_id"
    ON __mj."AIAgentRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_model_id"
    ON __mj."AIAgentRun" ("OverrideModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_override_vendor_id"
    ON __mj."AIAgentRun" ("OverrideVendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_scheduled_job_run_id"
    ON __mj."AIAgentRun" ("ScheduledJobRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_test_run_id"
    ON __mj."AIAgentRun" ("TestRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_run_primary_scope_entity_id"
    ON __mj."AIAgentRun" ("PrimaryScopeEntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunParentRunID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRun.ParentRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_run_parent_run_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "ParentRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgentRun"
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
            __mj."AIAgentRun" c
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
-- Item: fnAIAgentRunLastRunID_GetRootID
-- ============================================================

------------------------------------------------------------
----- ROOT ID FUNCTION FOR: AIAgentRun.LastRunID
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_ai_agent_run_last_run_id_get_root_id"(
    p_record_id uuid,
    p_parent_id uuid
) RETURNS uuid AS $$
    WITH RECURSIVE cte_root_parent AS (
        -- Anchor: Start from p_parent_id if not null, otherwise start from p_record_id
        SELECT
            "ID",
            "LastRunID",
            "ID" AS root_parent_id,
            0 AS depth
        FROM
            __mj."AIAgentRun"
        WHERE
            "ID" = COALESCE(p_parent_id, p_record_id)

        UNION ALL

        -- Recursive: Keep going up the hierarchy
        SELECT
            c."ID",
            c."LastRunID",
            c."ID" AS root_parent_id,
            p.depth + 1 AS depth
        FROM
            __mj."AIAgentRun" c
        INNER JOIN
            cte_root_parent p ON c."ID" = p."LastRunID"
        WHERE
            p.depth < 100  -- Prevent infinite loops
    )
    SELECT root_parent_id
    FROM cte_root_parent
    WHERE "LastRunID" IS NULL
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
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentRuns"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIAgentRun_ParentRunID."ID" AS "ParentRun",
    MJConversation_ConversationID."Name" AS "Conversation",
    MJUser_UserID."Name" AS "User",
    MJConversationDetail_ConversationDetailID."Message" AS "ConversationDetail",
    MJAIAgentRun_LastRunID."ID" AS "LastRun",
    MJAIConfiguration_ConfigurationID."Name" AS "Configuration",
    MJAIModel_OverrideModelID."Name" AS "OverrideModel",
    MJAIVendor_OverrideVendorID."Name" AS "OverrideVendor",
    MJScheduledJobRun_ScheduledJobRunID."ScheduledJob" AS "ScheduledJobRun",
    MJTestRun_TestRunID."Test" AS "TestRun",
    MJEntity_PrimaryScopeEntityID."Name" AS "PrimaryScopeEntity",
    root_ParentRunID.root_id AS "RootParentRunID",
    root_LastRunID.root_id AS "RootLastRunID"
FROM
    __mj."AIAgentRun" AS a
INNER JOIN
    __mj."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_ParentRunID
  ON
    "a"."ParentRunID" = MJAIAgentRun_ParentRunID."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS MJConversation_ConversationID
  ON
    "a"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS MJConversationDetail_ConversationDetailID
  ON
    "a"."ConversationDetailID" = MJConversationDetail_ConversationDetailID."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS MJAIAgentRun_LastRunID
  ON
    "a"."LastRunID" = MJAIAgentRun_LastRunID."ID"
LEFT OUTER JOIN
    __mj."AIConfiguration" AS MJAIConfiguration_ConfigurationID
  ON
    "a"."ConfigurationID" = MJAIConfiguration_ConfigurationID."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS MJAIModel_OverrideModelID
  ON
    "a"."OverrideModelID" = MJAIModel_OverrideModelID."ID"
LEFT OUTER JOIN
    __mj."AIVendor" AS MJAIVendor_OverrideVendorID
  ON
    "a"."OverrideVendorID" = MJAIVendor_OverrideVendorID."ID"
LEFT OUTER JOIN
    __mj."vwScheduledJobRuns" AS MJScheduledJobRun_ScheduledJobRunID
  ON
    "a"."ScheduledJobRunID" = MJScheduledJobRun_ScheduledJobRunID."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" AS MJTestRun_TestRunID
  ON
    "a"."TestRunID" = MJTestRun_TestRunID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_PrimaryScopeEntityID
  ON
    "a"."PrimaryScopeEntityID" = MJEntity_PrimaryScopeEntityID."ID"

LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_run_parent_run_id_get_root_id"(a."ID", a."ParentRunID") AS root_id
) AS root_ParentRunID ON true
LEFT JOIN LATERAL (
    SELECT __mj."fn_ai_agent_run_last_run_id_get_root_id"(a."ID", a."LastRunID") AS root_id
) AS root_LastRunID ON true
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentRuns'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwAIAgentRuns'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwAIAgentRuns'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAIAgentRuns" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_UI";
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spCreateAIAgentRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentRun
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

CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRun"(
    p_id uuid DEFAULT NULL,
    p_agentid uuid DEFAULT NULL,
    p_parentrunid_clear boolean DEFAULT false,
    p_parentrunid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_success_clear boolean DEFAULT false,
    p_success BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage text DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid uuid DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_result_clear boolean DEFAULT false,
    p_result text DEFAULT NULL,
    p_agentstate_clear boolean DEFAULT false,
    p_agentstate text DEFAULT NULL,
    p_totaltokensused_clear boolean DEFAULT false,
    p_totaltokensused integer DEFAULT NULL,
    p_totalcost_clear boolean DEFAULT false,
    p_totalcost decimal(18, 6) DEFAULT NULL,
    p_totalprompttokensused_clear boolean DEFAULT false,
    p_totalprompttokensused integer DEFAULT NULL,
    p_totalcompletiontokensused_clear boolean DEFAULT false,
    p_totalcompletiontokensused integer DEFAULT NULL,
    p_totaltokensusedrollup_clear boolean DEFAULT false,
    p_totaltokensusedrollup integer DEFAULT NULL,
    p_totalprompttokensusedrollup_clear boolean DEFAULT false,
    p_totalprompttokensusedrollup integer DEFAULT NULL,
    p_totalcompletiontokensusedrollup_clear boolean DEFAULT false,
    p_totalcompletiontokensusedrollup integer DEFAULT NULL,
    p_totalcostrollup_clear boolean DEFAULT false,
    p_totalcostrollup decimal(19, 8) DEFAULT NULL,
    p_conversationdetailid_clear boolean DEFAULT false,
    p_conversationdetailid uuid DEFAULT NULL,
    p_conversationdetailsequence_clear boolean DEFAULT false,
    p_conversationdetailsequence integer DEFAULT NULL,
    p_cancellationreason_clear boolean DEFAULT false,
    p_cancellationreason text DEFAULT NULL,
    p_finalstep_clear boolean DEFAULT false,
    p_finalstep text DEFAULT NULL,
    p_finalpayload_clear boolean DEFAULT false,
    p_finalpayload text DEFAULT NULL,
    p_message_clear boolean DEFAULT false,
    p_message text DEFAULT NULL,
    p_lastrunid_clear boolean DEFAULT false,
    p_lastrunid uuid DEFAULT NULL,
    p_startingpayload_clear boolean DEFAULT false,
    p_startingpayload text DEFAULT NULL,
    p_totalpromptiterations integer DEFAULT NULL,
    p_configurationid_clear boolean DEFAULT false,
    p_configurationid uuid DEFAULT NULL,
    p_overridemodelid_clear boolean DEFAULT false,
    p_overridemodelid uuid DEFAULT NULL,
    p_overridevendorid_clear boolean DEFAULT false,
    p_overridevendorid uuid DEFAULT NULL,
    p_data_clear boolean DEFAULT false,
    p_data text DEFAULT NULL,
    p_verbose_clear boolean DEFAULT false,
    p_verbose BOOLEAN DEFAULT NULL,
    p_effortlevel_clear boolean DEFAULT false,
    p_effortlevel integer DEFAULT NULL,
    p_runname_clear boolean DEFAULT false,
    p_runname text DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL,
    p_scheduledjobrunid_clear boolean DEFAULT false,
    p_scheduledjobrunid uuid DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid uuid DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid uuid DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid text DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes text DEFAULT NULL,
    p_externalreferenceid_clear boolean DEFAULT false,
    p_externalreferenceid text DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid uuid DEFAULT NULL,
    p_lastheartbeatat_clear boolean DEFAULT false,
    p_lastheartbeatat timestamptz DEFAULT NULL,
    p_totalcachereadtokensused_clear boolean DEFAULT false,
    p_totalcachereadtokensused integer DEFAULT NULL,
    p_totalcachewritetokensused_clear boolean DEFAULT false,
    p_totalcachewritetokensused integer DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentRuns" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."AIAgentRun"
        (
            "ID",
            "AgentID",
                "ParentRunID",
                "Status",
                "StartedAt",
                "CompletedAt",
                "Success",
                "ErrorMessage",
                "ConversationID",
                "UserID",
                "Result",
                "AgentState",
                "TotalTokensUsed",
                "TotalCost",
                "TotalPromptTokensUsed",
                "TotalCompletionTokensUsed",
                "TotalTokensUsedRollup",
                "TotalPromptTokensUsedRollup",
                "TotalCompletionTokensUsedRollup",
                "TotalCostRollup",
                "ConversationDetailID",
                "ConversationDetailSequence",
                "CancellationReason",
                "FinalStep",
                "FinalPayload",
                "Message",
                "LastRunID",
                "StartingPayload",
                "TotalPromptIterations",
                "ConfigurationID",
                "OverrideModelID",
                "OverrideVendorID",
                "Data",
                "Verbose",
                "EffortLevel",
                "RunName",
                "Comments",
                "ScheduledJobRunID",
                "TestRunID",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes",
                "ExternalReferenceID",
                "CompanyID",
                "LastHeartbeatAt",
                "TotalCacheReadTokensUsed",
                "TotalCacheWriteTokensUsed"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                CASE WHEN p_parentrunid_clear = true THEN NULL ELSE COALESCE(p_parentrunid, NULL) END,
                COALESCE(p_status, 'Running'),
                COALESCE(p_startedat, NOW()),
                CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, NULL) END,
                CASE WHEN p_success_clear = true THEN NULL ELSE COALESCE(p_success, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, NULL) END,
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END,
                CASE WHEN p_result_clear = true THEN NULL ELSE COALESCE(p_result, NULL) END,
                CASE WHEN p_agentstate_clear = true THEN NULL ELSE COALESCE(p_agentstate, NULL) END,
                CASE WHEN p_totaltokensused_clear = true THEN NULL ELSE COALESCE(p_totaltokensused, 0) END,
                CASE WHEN p_totalcost_clear = true THEN NULL ELSE COALESCE(p_totalcost, 0.000000) END,
                CASE WHEN p_totalprompttokensused_clear = true THEN NULL ELSE COALESCE(p_totalprompttokensused, NULL) END,
                CASE WHEN p_totalcompletiontokensused_clear = true THEN NULL ELSE COALESCE(p_totalcompletiontokensused, NULL) END,
                CASE WHEN p_totaltokensusedrollup_clear = true THEN NULL ELSE COALESCE(p_totaltokensusedrollup, NULL) END,
                CASE WHEN p_totalprompttokensusedrollup_clear = true THEN NULL ELSE COALESCE(p_totalprompttokensusedrollup, NULL) END,
                CASE WHEN p_totalcompletiontokensusedrollup_clear = true THEN NULL ELSE COALESCE(p_totalcompletiontokensusedrollup, NULL) END,
                CASE WHEN p_totalcostrollup_clear = true THEN NULL ELSE COALESCE(p_totalcostrollup, NULL) END,
                CASE WHEN p_conversationdetailid_clear = true THEN NULL ELSE COALESCE(p_conversationdetailid, NULL) END,
                CASE WHEN p_conversationdetailsequence_clear = true THEN NULL ELSE COALESCE(p_conversationdetailsequence, NULL) END,
                CASE WHEN p_cancellationreason_clear = true THEN NULL ELSE COALESCE(p_cancellationreason, NULL) END,
                CASE WHEN p_finalstep_clear = true THEN NULL ELSE COALESCE(p_finalstep, NULL) END,
                CASE WHEN p_finalpayload_clear = true THEN NULL ELSE COALESCE(p_finalpayload, NULL) END,
                CASE WHEN p_message_clear = true THEN NULL ELSE COALESCE(p_message, NULL) END,
                CASE WHEN p_lastrunid_clear = true THEN NULL ELSE COALESCE(p_lastrunid, NULL) END,
                CASE WHEN p_startingpayload_clear = true THEN NULL ELSE COALESCE(p_startingpayload, NULL) END,
                COALESCE(p_totalpromptiterations, 0),
                CASE WHEN p_configurationid_clear = true THEN NULL ELSE COALESCE(p_configurationid, NULL) END,
                CASE WHEN p_overridemodelid_clear = true THEN NULL ELSE COALESCE(p_overridemodelid, NULL) END,
                CASE WHEN p_overridevendorid_clear = true THEN NULL ELSE COALESCE(p_overridevendorid, NULL) END,
                CASE WHEN p_data_clear = true THEN NULL ELSE COALESCE(p_data, NULL) END,
                CASE WHEN p_verbose_clear = true THEN NULL ELSE COALESCE(p_verbose, FALSE) END,
                CASE WHEN p_effortlevel_clear = true THEN NULL ELSE COALESCE(p_effortlevel, NULL) END,
                CASE WHEN p_runname_clear = true THEN NULL ELSE COALESCE(p_runname, NULL) END,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                CASE WHEN p_scheduledjobrunid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobrunid, NULL) END,
                CASE WHEN p_testrunid_clear = true THEN NULL ELSE COALESCE(p_testrunid, NULL) END,
                CASE WHEN p_primaryscopeentityid_clear = true THEN NULL ELSE COALESCE(p_primaryscopeentityid, NULL) END,
                CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, NULL) END,
                CASE WHEN p_secondaryscopes_clear = true THEN NULL ELSE COALESCE(p_secondaryscopes, NULL) END,
                CASE WHEN p_externalreferenceid_clear = true THEN NULL ELSE COALESCE(p_externalreferenceid, NULL) END,
                CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, NULL) END,
                CASE WHEN p_lastheartbeatat_clear = true THEN NULL ELSE COALESCE(p_lastheartbeatat, NULL) END,
                CASE WHEN p_totalcachereadtokensused_clear = true THEN NULL ELSE COALESCE(p_totalcachereadtokensused, NULL) END,
                CASE WHEN p_totalcachewritetokensused_clear = true THEN NULL ELSE COALESCE(p_totalcachewritetokensused, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRuns"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Runs
-- Item: spUpdateAIAgentRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentRun
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

CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRun"(
    p_id uuid,
    p_agentid uuid DEFAULT NULL,
    p_parentrunid_clear boolean DEFAULT false,
    p_parentrunid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_success_clear boolean DEFAULT false,
    p_success BOOLEAN DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage text DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid uuid DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid uuid DEFAULT NULL,
    p_result_clear boolean DEFAULT false,
    p_result text DEFAULT NULL,
    p_agentstate_clear boolean DEFAULT false,
    p_agentstate text DEFAULT NULL,
    p_totaltokensused_clear boolean DEFAULT false,
    p_totaltokensused integer DEFAULT NULL,
    p_totalcost_clear boolean DEFAULT false,
    p_totalcost decimal(18, 6) DEFAULT NULL,
    p_totalprompttokensused_clear boolean DEFAULT false,
    p_totalprompttokensused integer DEFAULT NULL,
    p_totalcompletiontokensused_clear boolean DEFAULT false,
    p_totalcompletiontokensused integer DEFAULT NULL,
    p_totaltokensusedrollup_clear boolean DEFAULT false,
    p_totaltokensusedrollup integer DEFAULT NULL,
    p_totalprompttokensusedrollup_clear boolean DEFAULT false,
    p_totalprompttokensusedrollup integer DEFAULT NULL,
    p_totalcompletiontokensusedrollup_clear boolean DEFAULT false,
    p_totalcompletiontokensusedrollup integer DEFAULT NULL,
    p_totalcostrollup_clear boolean DEFAULT false,
    p_totalcostrollup decimal(19, 8) DEFAULT NULL,
    p_conversationdetailid_clear boolean DEFAULT false,
    p_conversationdetailid uuid DEFAULT NULL,
    p_conversationdetailsequence_clear boolean DEFAULT false,
    p_conversationdetailsequence integer DEFAULT NULL,
    p_cancellationreason_clear boolean DEFAULT false,
    p_cancellationreason text DEFAULT NULL,
    p_finalstep_clear boolean DEFAULT false,
    p_finalstep text DEFAULT NULL,
    p_finalpayload_clear boolean DEFAULT false,
    p_finalpayload text DEFAULT NULL,
    p_message_clear boolean DEFAULT false,
    p_message text DEFAULT NULL,
    p_lastrunid_clear boolean DEFAULT false,
    p_lastrunid uuid DEFAULT NULL,
    p_startingpayload_clear boolean DEFAULT false,
    p_startingpayload text DEFAULT NULL,
    p_totalpromptiterations integer DEFAULT NULL,
    p_configurationid_clear boolean DEFAULT false,
    p_configurationid uuid DEFAULT NULL,
    p_overridemodelid_clear boolean DEFAULT false,
    p_overridemodelid uuid DEFAULT NULL,
    p_overridevendorid_clear boolean DEFAULT false,
    p_overridevendorid uuid DEFAULT NULL,
    p_data_clear boolean DEFAULT false,
    p_data text DEFAULT NULL,
    p_verbose_clear boolean DEFAULT false,
    p_verbose BOOLEAN DEFAULT NULL,
    p_effortlevel_clear boolean DEFAULT false,
    p_effortlevel integer DEFAULT NULL,
    p_runname_clear boolean DEFAULT false,
    p_runname text DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments text DEFAULT NULL,
    p_scheduledjobrunid_clear boolean DEFAULT false,
    p_scheduledjobrunid uuid DEFAULT NULL,
    p_testrunid_clear boolean DEFAULT false,
    p_testrunid uuid DEFAULT NULL,
    p_primaryscopeentityid_clear boolean DEFAULT false,
    p_primaryscopeentityid uuid DEFAULT NULL,
    p_primaryscoperecordid_clear boolean DEFAULT false,
    p_primaryscoperecordid text DEFAULT NULL,
    p_secondaryscopes_clear boolean DEFAULT false,
    p_secondaryscopes text DEFAULT NULL,
    p_externalreferenceid_clear boolean DEFAULT false,
    p_externalreferenceid text DEFAULT NULL,
    p_companyid_clear boolean DEFAULT false,
    p_companyid uuid DEFAULT NULL,
    p_lastheartbeatat_clear boolean DEFAULT false,
    p_lastheartbeatat timestamptz DEFAULT NULL,
    p_totalcachereadtokensused_clear boolean DEFAULT false,
    p_totalcachereadtokensused integer DEFAULT NULL,
    p_totalcachewritetokensused_clear boolean DEFAULT false,
    p_totalcachewritetokensused integer DEFAULT NULL
) RETURNS SETOF __mj."vwAIAgentRuns" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."AIAgentRun"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "ParentRunID" = CASE WHEN p_parentrunid_clear = true THEN NULL ELSE COALESCE(p_parentrunid, "ParentRunID") END,
        "Status" = COALESCE(p_status, "Status"),
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "CompletedAt" = CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, "CompletedAt") END,
        "Success" = CASE WHEN p_success_clear = true THEN NULL ELSE COALESCE(p_success, "Success") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "ConversationID" = CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, "ConversationID") END,
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END,
        "Result" = CASE WHEN p_result_clear = true THEN NULL ELSE COALESCE(p_result, "Result") END,
        "AgentState" = CASE WHEN p_agentstate_clear = true THEN NULL ELSE COALESCE(p_agentstate, "AgentState") END,
        "TotalTokensUsed" = CASE WHEN p_totaltokensused_clear = true THEN NULL ELSE COALESCE(p_totaltokensused, "TotalTokensUsed") END,
        "TotalCost" = CASE WHEN p_totalcost_clear = true THEN NULL ELSE COALESCE(p_totalcost, "TotalCost") END,
        "TotalPromptTokensUsed" = CASE WHEN p_totalprompttokensused_clear = true THEN NULL ELSE COALESCE(p_totalprompttokensused, "TotalPromptTokensUsed") END,
        "TotalCompletionTokensUsed" = CASE WHEN p_totalcompletiontokensused_clear = true THEN NULL ELSE COALESCE(p_totalcompletiontokensused, "TotalCompletionTokensUsed") END,
        "TotalTokensUsedRollup" = CASE WHEN p_totaltokensusedrollup_clear = true THEN NULL ELSE COALESCE(p_totaltokensusedrollup, "TotalTokensUsedRollup") END,
        "TotalPromptTokensUsedRollup" = CASE WHEN p_totalprompttokensusedrollup_clear = true THEN NULL ELSE COALESCE(p_totalprompttokensusedrollup, "TotalPromptTokensUsedRollup") END,
        "TotalCompletionTokensUsedRollup" = CASE WHEN p_totalcompletiontokensusedrollup_clear = true THEN NULL ELSE COALESCE(p_totalcompletiontokensusedrollup, "TotalCompletionTokensUsedRollup") END,
        "TotalCostRollup" = CASE WHEN p_totalcostrollup_clear = true THEN NULL ELSE COALESCE(p_totalcostrollup, "TotalCostRollup") END,
        "ConversationDetailID" = CASE WHEN p_conversationdetailid_clear = true THEN NULL ELSE COALESCE(p_conversationdetailid, "ConversationDetailID") END,
        "ConversationDetailSequence" = CASE WHEN p_conversationdetailsequence_clear = true THEN NULL ELSE COALESCE(p_conversationdetailsequence, "ConversationDetailSequence") END,
        "CancellationReason" = CASE WHEN p_cancellationreason_clear = true THEN NULL ELSE COALESCE(p_cancellationreason, "CancellationReason") END,
        "FinalStep" = CASE WHEN p_finalstep_clear = true THEN NULL ELSE COALESCE(p_finalstep, "FinalStep") END,
        "FinalPayload" = CASE WHEN p_finalpayload_clear = true THEN NULL ELSE COALESCE(p_finalpayload, "FinalPayload") END,
        "Message" = CASE WHEN p_message_clear = true THEN NULL ELSE COALESCE(p_message, "Message") END,
        "LastRunID" = CASE WHEN p_lastrunid_clear = true THEN NULL ELSE COALESCE(p_lastrunid, "LastRunID") END,
        "StartingPayload" = CASE WHEN p_startingpayload_clear = true THEN NULL ELSE COALESCE(p_startingpayload, "StartingPayload") END,
        "TotalPromptIterations" = COALESCE(p_totalpromptiterations, "TotalPromptIterations"),
        "ConfigurationID" = CASE WHEN p_configurationid_clear = true THEN NULL ELSE COALESCE(p_configurationid, "ConfigurationID") END,
        "OverrideModelID" = CASE WHEN p_overridemodelid_clear = true THEN NULL ELSE COALESCE(p_overridemodelid, "OverrideModelID") END,
        "OverrideVendorID" = CASE WHEN p_overridevendorid_clear = true THEN NULL ELSE COALESCE(p_overridevendorid, "OverrideVendorID") END,
        "Data" = CASE WHEN p_data_clear = true THEN NULL ELSE COALESCE(p_data, "Data") END,
        "Verbose" = CASE WHEN p_verbose_clear = true THEN NULL ELSE COALESCE(p_verbose, "Verbose") END,
        "EffortLevel" = CASE WHEN p_effortlevel_clear = true THEN NULL ELSE COALESCE(p_effortlevel, "EffortLevel") END,
        "RunName" = CASE WHEN p_runname_clear = true THEN NULL ELSE COALESCE(p_runname, "RunName") END,
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "ScheduledJobRunID" = CASE WHEN p_scheduledjobrunid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobrunid, "ScheduledJobRunID") END,
        "TestRunID" = CASE WHEN p_testrunid_clear = true THEN NULL ELSE COALESCE(p_testrunid, "TestRunID") END,
        "PrimaryScopeEntityID" = CASE WHEN p_primaryscopeentityid_clear = true THEN NULL ELSE COALESCE(p_primaryscopeentityid, "PrimaryScopeEntityID") END,
        "PrimaryScopeRecordID" = CASE WHEN p_primaryscoperecordid_clear = true THEN NULL ELSE COALESCE(p_primaryscoperecordid, "PrimaryScopeRecordID") END,
        "SecondaryScopes" = CASE WHEN p_secondaryscopes_clear = true THEN NULL ELSE COALESCE(p_secondaryscopes, "SecondaryScopes") END,
        "ExternalReferenceID" = CASE WHEN p_externalreferenceid_clear = true THEN NULL ELSE COALESCE(p_externalreferenceid, "ExternalReferenceID") END,
        "CompanyID" = CASE WHEN p_companyid_clear = true THEN NULL ELSE COALESCE(p_companyid, "CompanyID") END,
        "LastHeartbeatAt" = CASE WHEN p_lastheartbeatat_clear = true THEN NULL ELSE COALESCE(p_lastheartbeatat, "LastHeartbeatAt") END,
        "TotalCacheReadTokensUsed" = CASE WHEN p_totalcachereadtokensused_clear = true THEN NULL ELSE COALESCE(p_totalcachereadtokensused, "TotalCacheReadTokensUsed") END,
        "TotalCacheWriteTokensUsed" = CASE WHEN p_totalcachewritetokensused_clear = true THEN NULL ELSE COALESCE(p_totalcachewritetokensused, "TotalCacheWriteTokensUsed") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAIAgentRuns"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_ai_agent_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_run" ON __mj."AIAgentRun";

CREATE TRIGGER "trg_update_ai_agent_run"
BEFORE UPDATE ON __mj."AIAgentRun"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_ai_agent_run"();



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

CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRun"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: AI Agent Examples.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentExample"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentExample"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Notes.SourceAIAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentNote"
        WHERE "SourceAIAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentNote"
        SET "SourceAIAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.OriginatingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "OriginatingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRequest"
        SET "OriginatingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Requests.ResumingAgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRequest"
        WHERE "ResumingAgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRequest"
        SET "ResumingAgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Medias records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRunMedia"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRunMedia"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: AI Agent Run Steps records via AgentRunID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRunStep"
        WHERE "AgentRunID" = p_id
    LOOP
        PERFORM __mj."spDeleteAIAgentRunStep"(v_rec."ID");
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.ParentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "ParentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "ParentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Agent Runs.LastRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIAgentRun"
        WHERE "LastRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIAgentRun"
        SET "LastRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Set MJ: AI Prompt Runs.AgentRunID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."AIPromptRun"
        WHERE "AgentRunID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."AIPromptRun"
        SET "AgentRunID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

    
    DELETE FROM __mj."AIAgentRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRun" TO "cdp_Integration";
