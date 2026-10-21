-- ============================================================================
-- PG-ONLY: CodeGen object regeneration for the v6.2.0-edge.5 content
--
-- WHY THIS FILE EXISTS. On SQL Server, V202610151535__v6.2.x__Realtime_Recording_Shard_Ledger and
-- V202610171900__v6.2.x__AIAgentUserPolicy_And_UserRoutine_Wake carry their regenerated CodeGen
-- objects inline. Their PostgreSQL counterparts cannot: both have transpile gaps (six hand-written
-- guarded-write procedures in the first, CodeGen's metadata-refresh EXECUTE block in the second),
-- and `mj migrate convert --split --bake-codegen` HALTS at a gap before baking; `mj migrate rebake`
-- then preserves a gapped counterpart as committed rather than baking it. Both counterparts ship
-- DDL-only, and PostgreSQL freezes a view's column list at CREATE, so without this file:
--   * vwUserRoutines, spCreateUserRoutine and spUpdateUserRoutine are missing outright — the
--     UserRoutine.CronExpression type change drops them by CASCADE;
--   * MJ: AI Agent Session Recording Shards and MJ: AI Agent User Policies have no base view and no
--     CRUD routines;
--   * vwAIAgentSessions, vwCommunicationProviders and vwAIBridgeAgentIdentities lack the columns this
--     release adds, and the Metadata_Sync migration that follows calls routine signatures they create.
--
-- This is the remedy DEPLOYMENT.md prescribes ("generate the objects separately with `mj codegen`
-- and ship them as one .pg-only.sql stamped BEFORE the Metadata_Sync migration"), the same shape as
-- V202609011600__v6.1.x__PG_CodeGen_Regen.pg-only.sql.
--
-- STAMPED BEFORE Metadata_Sync ON PURPOSE (202610202323 vs 202610202324), and after the last DDL it
-- regenerates against (202610201100).
--
-- SCOPE IS BY ENTITY, NOT BY DIFF, taken from the two SQL Server migrations' CodeGen tails:
--   AIAgentSessionRecordingShard  NEW entity — FK index, base view, spCreate/spUpdate/spDelete
--   AIAgentUserPolicy             NEW entity — FK indexes, base view, spCreate/spUpdate/spDelete
--   UserRoutine                   +ScheduleMode, +WakeConfiguration, +LastCheckedAt — base view,
--                                 spCreate/spUpdate (spDelete survives the CASCADE)
--   AIAgentSession                +Recording* columns — base view, spCreate/spUpdate/spDelete
--   CommunicationProvider         +UserID, +Supports*, +EnterpriseScopeMode, … — FK index, view, CRUD
--   AIBridgeAgentIdentity         +UserID — FK index, base view, spCreate/spUpdate/spDelete
-- spDeleteConversation and spDeleteAIAgent appear in the SQL Server tails but are not here. On
-- PostgreSQL, spDeleteAIAgent cascades through spDeleteAIAgentSession by name (regenerated below),
-- and spDeleteConversation sets AIAgentSession.ConversationID to NULL with a direct UPDATE, so
-- neither depends on a routine signature this release changes.
--
-- SOURCES. Routines, and the views of the three existing entities, are verbatim `mj codegen` output
-- from its CodeGen_Run SQL log, captured against a PostgreSQL database holding this release's DDL
-- and nothing else (`--skipfiles --no-ai`), with ${flyway:defaultSchema} written as __mj. CodeGen
-- created the three NEW base views outside that log, so they are pg_get_viewdef dumps of the
-- objects it created, with the same three SELECT grants it applied. It created no FK indexes for
-- the new columns; those are written in its own naming convention (truncated to 63 characters).
--
-- VIEWS PRECEDE ROUTINES. Every CRUD routine is RETURNS SETOF its entity's base view.
-- ============================================================================

SET search_path TO __mj, public;

-- ============================================================================
-- INDEXES — foreign-key indexes the SQL Server tails create (IDX_AUTO_MJ_FKEY_*) and the
-- PostgreSQL CodeGen run did not, named in PostgreSQL CodeGen's own convention.
-- ============================================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_session_recording_shard_agent_session" ON __mj."AIAgentSessionRecordingShard" ("AgentSessionID");
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_user_policy_agent_id" ON __mj."AIAgentUserPolicy" ("AgentID");
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_user_policy_user_id" ON __mj."AIAgentUserPolicy" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_agent_user_policy_preferred_persona_id" ON __mj."AIAgentUserPolicy" ("PreferredPersonaID");
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_bridge_agent_identity_user_id" ON __mj."AIBridgeAgentIdentity" ("UserID");
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_communication_provider_default_credential_id" ON __mj."CommunicationProvider" ("DefaultCredentialID");

-- ============================================================================
-- VIEWS — new entities (dumped)
-- ============================================================================

-- ============================================================
-- Base view vwAIAgentSessionRecordingShards (dumped from the CodeGen-built database; CodeGen created it outside its SQL log)
-- ============================================================
CREATE OR REPLACE VIEW __mj."vwAIAgentSessionRecordingShards" AS
 SELECT "ID",
    "AgentSessionID",
    "Index",
    "StartSample",
    "SampleCount",
    "Bytes",
    "Sha256",
    "Data",
    "ReceivedAt",
    "__mj_CreatedAt",
    "__mj_UpdatedAt"
   FROM __mj."AIAgentSessionRecordingShard" a;

DO $$
DECLARE _role TEXT;
BEGIN
  FOREACH _role IN ARRAY ARRAY['cdp_UI', 'cdp_Developer', 'cdp_Integration']
  LOOP
    BEGIN
      EXECUTE format('GRANT SELECT ON __mj.%I TO %I', 'vwAIAgentSessionRecordingShards', _role);
    EXCEPTION WHEN undefined_object THEN
      RAISE NOTICE 'Skipping GRANT SELECT ON __mj.% TO %: role does not exist on this install', 'vwAIAgentSessionRecordingShards', _role;
    END;
  END LOOP;
END $$;

-- ============================================================
-- Base view vwAIAgentUserPolicies (dumped from the CodeGen-built database; CodeGen created it outside its SQL log)
-- ============================================================
CREATE OR REPLACE VIEW __mj."vwAIAgentUserPolicies" AS
 SELECT a."ID",
    a."AgentID",
    a."UserID",
    a."DisplayNameOverride",
    a."PreferredPersonaID",
    a."Status",
    a."OnboardingStatus",
    a."OnboardedAt",
    a."CoordinationMode",
    a."DefaultDataAccessMode",
    a."EmailChannelMode",
    a."PhoneChannelMode",
    a."MessagingChannelMode",
    a."CalendarChannelMode",
    a."AllowInterAgentCoordination",
    a."RequireApprovalForExternalComms",
    a."RequireApprovalForFinancials",
    a."RequireApprovalForDestructiveActions",
    a."AutoApproveAmountThreshold",
    a."EntityAccessRules",
    a."ActionPolicyRules",
    a."InstructionsOverride",
    a."__mj_CreatedAt",
    a."__mj_UpdatedAt",
    mjaiagent_agentid."Name" AS "Agent",
    mjuser_userid."Name" AS "User",
    mjaipersona_preferredpersonaid."Name" AS "PreferredPersona"
   FROM __mj."AIAgentUserPolicy" a
     JOIN __mj."AIAgent" mjaiagent_agentid ON a."AgentID" = mjaiagent_agentid."ID"
     JOIN __mj."User" mjuser_userid ON a."UserID" = mjuser_userid."ID"
     LEFT JOIN __mj."AIPersona" mjaipersona_preferredpersonaid ON a."PreferredPersonaID" = mjaipersona_preferredpersonaid."ID";

DO $$
DECLARE _role TEXT;
BEGIN
  FOREACH _role IN ARRAY ARRAY['cdp_UI', 'cdp_Developer', 'cdp_Integration']
  LOOP
    BEGIN
      EXECUTE format('GRANT SELECT ON __mj.%I TO %I', 'vwAIAgentUserPolicies', _role);
    EXCEPTION WHEN undefined_object THEN
      RAISE NOTICE 'Skipping GRANT SELECT ON __mj.% TO %: role does not exist on this install', 'vwAIAgentUserPolicies', _role;
    END;
  END LOOP;
END $$;

-- ============================================================
-- Base view vwUserRoutines (dumped from the CodeGen-built database; CodeGen created it outside its SQL log)
-- ============================================================
CREATE OR REPLACE VIEW __mj."vwUserRoutines" AS
 SELECT u."ID",
    u."UserID",
    u."EnvironmentID",
    u."Name",
    u."Description",
    u."Status",
    u."RoutineType",
    u."TargetType",
    u."TargetID",
    u."InitialMessage",
    u."StartingPayload",
    u."RequestedSkillIDs",
    u."CronExpression",
    u."StartAt",
    u."EndAt",
    u."NotificationTemplateID",
    u."Timezone",
    u."NextRunAt",
    u."LastRunAt",
    u."LastRunStatus",
    u."LastResultHash",
    u."NotifyCondition",
    u."NotifyViaInApp",
    u."NotifyViaEmail",
    u."__mj_CreatedAt",
    u."__mj_UpdatedAt",
    u."ConversationID",
    u."ScheduleMode",
    u."WakeConfiguration",
    u."LastCheckedAt",
    mjuser_userid."Name" AS "User",
    mjenvironment_environmentid."Name" AS "Environment",
    mjtemplate_notificationtemplateid."Name" AS "NotificationTemplate",
    mjconversation_conversationid."Name" AS "Conversation"
   FROM __mj."UserRoutine" u
     JOIN __mj."User" mjuser_userid ON u."UserID" = mjuser_userid."ID"
     LEFT JOIN __mj."Environment" mjenvironment_environmentid ON u."EnvironmentID" = mjenvironment_environmentid."ID"
     LEFT JOIN __mj."Template" mjtemplate_notificationtemplateid ON u."NotificationTemplateID" = mjtemplate_notificationtemplateid."ID"
     LEFT JOIN __mj."Conversation" mjconversation_conversationid ON u."ConversationID" = mjconversation_conversationid."ID";

DO $$
DECLARE _role TEXT;
BEGIN
  FOREACH _role IN ARRAY ARRAY['cdp_UI', 'cdp_Developer', 'cdp_Integration']
  LOOP
    BEGIN
      EXECUTE format('GRANT SELECT ON __mj.%I TO %I', 'vwUserRoutines', _role);
    EXCEPTION WHEN undefined_object THEN
      RAISE NOTICE 'Skipping GRANT SELECT ON __mj.% TO %: role does not exist on this install', 'vwUserRoutines', _role;
    END;
  END LOOP;
END $$;

-- ============================================================================
-- VIEWS — existing entities (CodeGen log)
-- ============================================================================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Sessions
-- Item: vwAIAgentSessions
-- Generated at: 2026-10-21T02:23:00.757Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Sessions
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentSession
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIAgentSessions"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJUser_UserID."Name" AS "User",
    MJConversation_ConversationID."Name" AS "Conversation",
    MJFile_RecordingFileID."Name" AS "RecordingFile",
    MJEntity_LinkedEntityID."Name" AS "LinkedEntity"
FROM
    "__mj"."AIAgentSession" AS a
INNER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
INNER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."Conversation" AS MJConversation_ConversationID
  ON
    "a"."ConversationID" = MJConversation_ConversationID."ID"
LEFT OUTER JOIN
    "__mj"."File" AS MJFile_RecordingFileID
  ON
    "a"."RecordingFileID" = MJFile_RecordingFileID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_LinkedEntityID
  ON
    "a"."LinkedEntityID" = MJEntity_LinkedEntityID."ID"
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
        AND tc.relname = 'vwAIAgentSessions'
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
                           AND tc.relname = 'vwAIAgentSessions'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIAgentSessions" CASCADE;
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
GRANT SELECT ON "__mj"."vwAIAgentSessions" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentSessions" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwAIAgentSessions" TO "cdp_UI";

/* Base View Permissions SQL for MJ: AI Agent Sessions */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Sessions
-- Item: Permissions for vwAIAgentSessions
-- Generated at: 2026-10-21T02:23:00.758Z
-- ============================================================
GRANT SELECT ON "__mj"."vwAIAgentSessions" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIAgentSessions" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwAIAgentSessions" TO "cdp_UI";

/* spCreate SQL for MJ: AI Agent Sessions */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Agent Identities
-- Item: vwAIBridgeAgentIdentities
-- Generated at: 2026-10-21T02:23:00.975Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Bridge Agent Identities
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIBridgeAgentIdentity
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIBridgeAgentIdentities"
AS
SELECT
    a.*,
    MJAIAgent_AgentID."Name" AS "Agent",
    MJAIBridgeProvider_ProviderID."Name" AS "Provider",
    MJUser_UserID."Name" AS "User"
FROM
    "__mj"."AIBridgeAgentIdentity" AS a
INNER JOIN
    "__mj"."AIAgent" AS MJAIAgent_AgentID
  ON
    "a"."AgentID" = MJAIAgent_AgentID."ID"
INNER JOIN
    "__mj"."AIBridgeProvider" AS MJAIBridgeProvider_ProviderID
  ON
    "a"."ProviderID" = MJAIBridgeProvider_ProviderID."ID"
LEFT OUTER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
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
        AND tc.relname = 'vwAIBridgeAgentIdentities'
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
                           AND tc.relname = 'vwAIBridgeAgentIdentities'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIBridgeAgentIdentities" CASCADE;
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
GRANT SELECT ON "__mj"."vwAIBridgeAgentIdentities" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIBridgeAgentIdentities" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwAIBridgeAgentIdentities" TO "cdp_UI";

/* Base View Permissions SQL for MJ: AI Bridge Agent Identities */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Agent Identities
-- Item: Permissions for vwAIBridgeAgentIdentities
-- Generated at: 2026-10-21T02:23:00.976Z
-- ============================================================
GRANT SELECT ON "__mj"."vwAIBridgeAgentIdentities" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIBridgeAgentIdentities" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwAIBridgeAgentIdentities" TO "cdp_UI";

/* spCreate SQL for MJ: AI Bridge Agent Identities */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Communication Providers
-- Item: vwCommunicationProviders
-- Generated at: 2026-10-21T02:23:01.497Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Communication Providers
-----               SCHEMA:      __mj
-----               BASE TABLE:  CommunicationProvider
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwCommunicationProviders"
AS
SELECT
    c.*,
    MJCredential_DefaultCredentialID."Name" AS "DefaultCredential"
FROM
    "__mj"."CommunicationProvider" AS c
LEFT OUTER JOIN
    "__mj"."Credential" AS MJCredential_DefaultCredentialID
  ON
    "c"."DefaultCredentialID" = MJCredential_DefaultCredentialID."ID"
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
        AND tc.relname = 'vwCommunicationProviders'
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
                           AND tc.relname = 'vwCommunicationProviders'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwCommunicationProviders" CASCADE;
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
GRANT SELECT ON "__mj"."vwCommunicationProviders" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwCommunicationProviders" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwCommunicationProviders" TO "cdp_Developer";

/* Base View Permissions SQL for MJ: Communication Providers */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Communication Providers
-- Item: Permissions for vwCommunicationProviders
-- Generated at: 2026-10-21T02:23:01.499Z
-- ============================================================
GRANT SELECT ON "__mj"."vwCommunicationProviders" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwCommunicationProviders" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwCommunicationProviders" TO "cdp_Developer";

/* spCreate SQL for MJ: Communication Providers */

-- ============================================================================
-- ROUTINES (CodeGen log)
-- ============================================================================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Recording Shards
-- Item: spCreateAIAgentSessionRecordingShard
-- Generated at: 2026-10-21T02:23:00.753Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentSessionRecordingShard
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentSessionRecordingShard'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentSessionRecordingShard"(
    p_id UUID DEFAULT NULL,
    p_agentsessionid UUID DEFAULT NULL,
    p_index int DEFAULT NULL,
    p_startsample bigint DEFAULT NULL,
    p_samplecount int DEFAULT NULL,
    p_bytes int DEFAULT NULL,
    p_sha256 varchar(64) DEFAULT NULL,
    p_data BYTEA DEFAULT NULL,
    p_receivedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentSessionRecordingShards" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIAgentSessionRecordingShard"
        (
            "ID",
            "AgentSessionID",
                "Index",
                "StartSample",
                "SampleCount",
                "Bytes",
                "Sha256",
                "Data",
                "ReceivedAt"
        )
    VALUES
        (
            v_new_id,
            p_agentsessionid,
                p_index,
                p_startsample,
                p_samplecount,
                p_bytes,
                p_sha256,
                p_data,
                COALESCE(p_receivedat, NOW() AT TIME ZONE 'UTC')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentSessionRecordingShards"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSessionRecordingShard" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSessionRecordingShard" TO "cdp_Integration";

/* spCreate Permissions for MJ: AI Agent Session Recording Shards */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSessionRecordingShard" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSessionRecordingShard" TO "cdp_Integration";

/* spUpdate SQL for MJ: AI Agent Session Recording Shards */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Recording Shards
-- Item: spUpdateAIAgentSessionRecordingShard
-- Generated at: 2026-10-21T02:23:00.753Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentSessionRecordingShard
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentSessionRecordingShard'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentSessionRecordingShard"(
    p_id UUID,
    p_agentsessionid UUID DEFAULT NULL,
    p_index int DEFAULT NULL,
    p_startsample bigint DEFAULT NULL,
    p_samplecount int DEFAULT NULL,
    p_bytes int DEFAULT NULL,
    p_sha256 varchar(64) DEFAULT NULL,
    p_data BYTEA DEFAULT NULL,
    p_receivedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentSessionRecordingShards" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIAgentSessionRecordingShard"
    SET
        "AgentSessionID" = COALESCE(p_agentsessionid, "AgentSessionID"),
        "Index" = COALESCE(p_index, "Index"),
        "StartSample" = COALESCE(p_startsample, "StartSample"),
        "SampleCount" = COALESCE(p_samplecount, "SampleCount"),
        "Bytes" = COALESCE(p_bytes, "Bytes"),
        "Sha256" = COALESCE(p_sha256, "Sha256"),
        "Data" = COALESCE(p_data, "Data"),
        "ReceivedAt" = COALESCE(p_receivedat, "ReceivedAt")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentSessionRecordingShards"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSessionRecordingShard" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSessionRecordingShard" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentSessionRecordingShard table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_session_recording_shard"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_session_recording_shard" ON "__mj"."AIAgentSessionRecordingShard";

CREATE TRIGGER "trg_update_ai_agent_session_recording_shard"
BEFORE UPDATE ON "__mj"."AIAgentSessionRecordingShard"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_session_recording_shard"();

/* spUpdate Permissions for MJ: AI Agent Session Recording Shards */
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSessionRecordingShard" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSessionRecordingShard" TO "cdp_Integration";

/* spDelete SQL for MJ: AI Agent Session Recording Shards */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Session Recording Shards
-- Item: spDeleteAIAgentSessionRecordingShard
-- Generated at: 2026-10-21T02:23:00.753Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentSessionRecordingShard
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentSessionRecordingShard'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentSessionRecordingShard"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AIAgentSessionRecordingShard"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentSessionRecordingShard" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentSessionRecordingShard" TO "cdp_Integration";

/* spDelete Permissions for MJ: AI Agent Session Recording Shards */
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentSessionRecordingShard" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentSessionRecordingShard" TO "cdp_Integration";

/* Base View SQL for MJ: AI Agent Sessions */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Sessions
-- Item: spCreateAIAgentSession
-- Generated at: 2026-10-21T02:23:00.758Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentSession
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentSession'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentSession"(
    p_id UUID DEFAULT NULL,
    p_agentid UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid UUID DEFAULT NULL,
    p_lastsessionid_clear boolean DEFAULT false,
    p_lastsessionid UUID DEFAULT NULL,
    p_hostinstanceid_clear boolean DEFAULT false,
    p_hostinstanceid varchar(200) DEFAULT NULL,
    p_config_clear boolean DEFAULT false,
    p_config TEXT DEFAULT NULL,
    p_lastactiveat TIMESTAMPTZ DEFAULT NULL,
    p_closedat_clear boolean DEFAULT false,
    p_closedat TIMESTAMPTZ DEFAULT NULL,
    p_closereason_clear boolean DEFAULT false,
    p_closereason varchar(20) DEFAULT NULL,
    p_recordingmedia_clear boolean DEFAULT false,
    p_recordingmedia varchar(20) DEFAULT NULL,
    p_recordingstartedat_clear boolean DEFAULT false,
    p_recordingstartedat TIMESTAMPTZ DEFAULT NULL,
    p_recordingfileid_clear boolean DEFAULT false,
    p_recordingfileid UUID DEFAULT NULL,
    p_linkedentityid_clear boolean DEFAULT false,
    p_linkedentityid UUID DEFAULT NULL,
    p_linkedrecordid_clear boolean DEFAULT false,
    p_linkedrecordid varchar(500) DEFAULT NULL,
    p_recordingstatus_clear boolean DEFAULT false,
    p_recordingstatus varchar(20) DEFAULT NULL,
    p_recordingexpectedshards_clear boolean DEFAULT false,
    p_recordingexpectedshards int DEFAULT NULL,
    p_recordingcapturedsamples_clear boolean DEFAULT false,
    p_recordingcapturedsamples bigint DEFAULT NULL,
    p_recordinggaps_clear boolean DEFAULT false,
    p_recordinggaps TEXT DEFAULT NULL,
    p_recordingassemblyversion int DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentSessions" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIAgentSession"
        (
            "ID",
            "AgentID",
                "UserID",
                "Status",
                "ConversationID",
                "LastSessionID",
                "HostInstanceID",
                "Config",
                "LastActiveAt",
                "ClosedAt",
                "CloseReason",
                "RecordingMedia",
                "RecordingStartedAt",
                "RecordingFileID",
                "LinkedEntityID",
                "LinkedRecordID",
                "RecordingStatus",
                "RecordingExpectedShards",
                "RecordingCapturedSamples",
                "RecordingGaps",
                "RecordingAssemblyVersion"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                p_userid,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, NULL) END,
                CASE WHEN p_lastsessionid_clear = true THEN NULL ELSE COALESCE(p_lastsessionid, NULL) END,
                CASE WHEN p_hostinstanceid_clear = true THEN NULL ELSE COALESCE(p_hostinstanceid, NULL) END,
                CASE WHEN p_config_clear = true THEN NULL ELSE COALESCE(p_config, NULL) END,
                COALESCE(p_lastactiveat, NOW()),
                CASE WHEN p_closedat_clear = true THEN NULL ELSE COALESCE(p_closedat, NULL) END,
                CASE WHEN p_closereason_clear = true THEN NULL ELSE COALESCE(p_closereason, NULL) END,
                CASE WHEN p_recordingmedia_clear = true THEN NULL ELSE COALESCE(p_recordingmedia, NULL) END,
                CASE WHEN p_recordingstartedat_clear = true THEN NULL ELSE COALESCE(p_recordingstartedat, NULL) END,
                CASE WHEN p_recordingfileid_clear = true THEN NULL ELSE COALESCE(p_recordingfileid, NULL) END,
                CASE WHEN p_linkedentityid_clear = true THEN NULL ELSE COALESCE(p_linkedentityid, NULL) END,
                CASE WHEN p_linkedrecordid_clear = true THEN NULL ELSE COALESCE(p_linkedrecordid, NULL) END,
                CASE WHEN p_recordingstatus_clear = true THEN NULL ELSE COALESCE(p_recordingstatus, NULL) END,
                CASE WHEN p_recordingexpectedshards_clear = true THEN NULL ELSE COALESCE(p_recordingexpectedshards, NULL) END,
                CASE WHEN p_recordingcapturedsamples_clear = true THEN NULL ELSE COALESCE(p_recordingcapturedsamples, NULL) END,
                CASE WHEN p_recordinggaps_clear = true THEN NULL ELSE COALESCE(p_recordinggaps, NULL) END,
                COALESCE(p_recordingassemblyversion, 0)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentSessions"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSession" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSession" TO "cdp_UI";

/* spCreate Permissions for MJ: AI Agent Sessions */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSession" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentSession" TO "cdp_UI";

/* spUpdate SQL for MJ: AI Agent Sessions */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Sessions
-- Item: spUpdateAIAgentSession
-- Generated at: 2026-10-21T02:23:00.759Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentSession
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentSession'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentSession"(
    p_id UUID,
    p_agentid UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid UUID DEFAULT NULL,
    p_lastsessionid_clear boolean DEFAULT false,
    p_lastsessionid UUID DEFAULT NULL,
    p_hostinstanceid_clear boolean DEFAULT false,
    p_hostinstanceid varchar(200) DEFAULT NULL,
    p_config_clear boolean DEFAULT false,
    p_config TEXT DEFAULT NULL,
    p_lastactiveat TIMESTAMPTZ DEFAULT NULL,
    p_closedat_clear boolean DEFAULT false,
    p_closedat TIMESTAMPTZ DEFAULT NULL,
    p_closereason_clear boolean DEFAULT false,
    p_closereason varchar(20) DEFAULT NULL,
    p_recordingmedia_clear boolean DEFAULT false,
    p_recordingmedia varchar(20) DEFAULT NULL,
    p_recordingstartedat_clear boolean DEFAULT false,
    p_recordingstartedat TIMESTAMPTZ DEFAULT NULL,
    p_recordingfileid_clear boolean DEFAULT false,
    p_recordingfileid UUID DEFAULT NULL,
    p_linkedentityid_clear boolean DEFAULT false,
    p_linkedentityid UUID DEFAULT NULL,
    p_linkedrecordid_clear boolean DEFAULT false,
    p_linkedrecordid varchar(500) DEFAULT NULL,
    p_recordingstatus_clear boolean DEFAULT false,
    p_recordingstatus varchar(20) DEFAULT NULL,
    p_recordingexpectedshards_clear boolean DEFAULT false,
    p_recordingexpectedshards int DEFAULT NULL,
    p_recordingcapturedsamples_clear boolean DEFAULT false,
    p_recordingcapturedsamples bigint DEFAULT NULL,
    p_recordinggaps_clear boolean DEFAULT false,
    p_recordinggaps TEXT DEFAULT NULL,
    p_recordingassemblyversion int DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentSessions" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIAgentSession"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "UserID" = COALESCE(p_userid, "UserID"),
        "Status" = COALESCE(p_status, "Status"),
        "ConversationID" = CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, "ConversationID") END,
        "LastSessionID" = CASE WHEN p_lastsessionid_clear = true THEN NULL ELSE COALESCE(p_lastsessionid, "LastSessionID") END,
        "HostInstanceID" = CASE WHEN p_hostinstanceid_clear = true THEN NULL ELSE COALESCE(p_hostinstanceid, "HostInstanceID") END,
        "Config" = CASE WHEN p_config_clear = true THEN NULL ELSE COALESCE(p_config, "Config") END,
        "LastActiveAt" = COALESCE(p_lastactiveat, "LastActiveAt"),
        "ClosedAt" = CASE WHEN p_closedat_clear = true THEN NULL ELSE COALESCE(p_closedat, "ClosedAt") END,
        "CloseReason" = CASE WHEN p_closereason_clear = true THEN NULL ELSE COALESCE(p_closereason, "CloseReason") END,
        "RecordingMedia" = CASE WHEN p_recordingmedia_clear = true THEN NULL ELSE COALESCE(p_recordingmedia, "RecordingMedia") END,
        "RecordingStartedAt" = CASE WHEN p_recordingstartedat_clear = true THEN NULL ELSE COALESCE(p_recordingstartedat, "RecordingStartedAt") END,
        "RecordingFileID" = CASE WHEN p_recordingfileid_clear = true THEN NULL ELSE COALESCE(p_recordingfileid, "RecordingFileID") END,
        "LinkedEntityID" = CASE WHEN p_linkedentityid_clear = true THEN NULL ELSE COALESCE(p_linkedentityid, "LinkedEntityID") END,
        "LinkedRecordID" = CASE WHEN p_linkedrecordid_clear = true THEN NULL ELSE COALESCE(p_linkedrecordid, "LinkedRecordID") END,
        "RecordingStatus" = CASE WHEN p_recordingstatus_clear = true THEN NULL ELSE COALESCE(p_recordingstatus, "RecordingStatus") END,
        "RecordingExpectedShards" = CASE WHEN p_recordingexpectedshards_clear = true THEN NULL ELSE COALESCE(p_recordingexpectedshards, "RecordingExpectedShards") END,
        "RecordingCapturedSamples" = CASE WHEN p_recordingcapturedsamples_clear = true THEN NULL ELSE COALESCE(p_recordingcapturedsamples, "RecordingCapturedSamples") END,
        "RecordingGaps" = CASE WHEN p_recordinggaps_clear = true THEN NULL ELSE COALESCE(p_recordinggaps, "RecordingGaps") END,
        "RecordingAssemblyVersion" = COALESCE(p_recordingassemblyversion, "RecordingAssemblyVersion")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentSessions"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSession" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSession" TO "cdp_UI";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentSession table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_session"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_session" ON "__mj"."AIAgentSession";

CREATE TRIGGER "trg_update_ai_agent_session"
BEFORE UPDATE ON "__mj"."AIAgentSession"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_session"();

/* spUpdate Permissions for MJ: AI Agent Sessions */
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSession" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentSession" TO "cdp_UI";

/* spDelete SQL for MJ: AI Agent Sessions */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent Sessions
-- Item: spDeleteAIAgentSession
-- Generated at: 2026-10-21T02:23:00.759Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentSession
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentSession'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentSession"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AIAgentSession"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentSession" TO "cdp_Integration";

/* spDelete Permissions for MJ: AI Agent Sessions */
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentSession" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentSession" TO "cdp_Integration";

/* spCreate SQL for MJ: AI Agent User Policies */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent User Policies
-- Item: spCreateAIAgentUserPolicy
-- Generated at: 2026-10-21T02:23:00.932Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIAgentUserPolicy
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIAgentUserPolicy'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIAgentUserPolicy"(
    p_id UUID DEFAULT NULL,
    p_agentid UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_displaynameoverride_clear boolean DEFAULT false,
    p_displaynameoverride varchar(100) DEFAULT NULL,
    p_preferredpersonaid_clear boolean DEFAULT false,
    p_preferredpersonaid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_onboardingstatus varchar(20) DEFAULT NULL,
    p_onboardedat_clear boolean DEFAULT false,
    p_onboardedat TIMESTAMPTZ DEFAULT NULL,
    p_coordinationmode varchar(20) DEFAULT NULL,
    p_defaultdataaccessmode varchar(20) DEFAULT NULL,
    p_emailchannelmode varchar(20) DEFAULT NULL,
    p_phonechannelmode varchar(20) DEFAULT NULL,
    p_messagingchannelmode varchar(20) DEFAULT NULL,
    p_allowinteragentcoordination BOOLEAN DEFAULT NULL,
    p_requireapprovalforexternalcomms BOOLEAN DEFAULT NULL,
    p_requireapprovalforfinancials BOOLEAN DEFAULT NULL,
    p_requireapprovalfordestructiveactions BOOLEAN DEFAULT NULL,
    p_autoapproveamountthreshold_clear boolean DEFAULT false,
    p_autoapproveamountthreshold decimal(18, 2) DEFAULT NULL,
    p_entityaccessrules_clear boolean DEFAULT false,
    p_entityaccessrules TEXT DEFAULT NULL,
    p_actionpolicyrules_clear boolean DEFAULT false,
    p_actionpolicyrules TEXT DEFAULT NULL,
    p_instructionsoverride_clear boolean DEFAULT false,
    p_instructionsoverride TEXT DEFAULT NULL,
    p_calendarchannelmode varchar(30) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentUserPolicies" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIAgentUserPolicy"
        (
            "ID",
            "AgentID",
                "UserID",
                "DisplayNameOverride",
                "PreferredPersonaID",
                "Status",
                "OnboardingStatus",
                "OnboardedAt",
                "CoordinationMode",
                "DefaultDataAccessMode",
                "EmailChannelMode",
                "PhoneChannelMode",
                "MessagingChannelMode",
                "AllowInterAgentCoordination",
                "RequireApprovalForExternalComms",
                "RequireApprovalForFinancials",
                "RequireApprovalForDestructiveActions",
                "AutoApproveAmountThreshold",
                "EntityAccessRules",
                "ActionPolicyRules",
                "InstructionsOverride",
                "CalendarChannelMode"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                p_userid,
                CASE WHEN p_displaynameoverride_clear = true THEN NULL ELSE COALESCE(p_displaynameoverride, NULL) END,
                CASE WHEN p_preferredpersonaid_clear = true THEN NULL ELSE COALESCE(p_preferredpersonaid, NULL) END,
                COALESCE(p_status, 'Active'),
                COALESCE(p_onboardingstatus, 'NotStarted'),
                CASE WHEN p_onboardedat_clear = true THEN NULL ELSE COALESCE(p_onboardedat, NULL) END,
                COALESCE(p_coordinationmode, 'Observer'),
                COALESCE(p_defaultdataaccessmode, 'UserCeiling'),
                COALESCE(p_emailchannelmode, 'DraftOnly'),
                COALESCE(p_phonechannelmode, 'InboundOnly'),
                COALESCE(p_messagingchannelmode, 'Enabled'),
                COALESCE(p_allowinteragentcoordination, TRUE),
                COALESCE(p_requireapprovalforexternalcomms, TRUE),
                COALESCE(p_requireapprovalforfinancials, TRUE),
                COALESCE(p_requireapprovalfordestructiveactions, TRUE),
                CASE WHEN p_autoapproveamountthreshold_clear = true THEN NULL ELSE COALESCE(p_autoapproveamountthreshold, NULL) END,
                CASE WHEN p_entityaccessrules_clear = true THEN NULL ELSE COALESCE(p_entityaccessrules, NULL) END,
                CASE WHEN p_actionpolicyrules_clear = true THEN NULL ELSE COALESCE(p_actionpolicyrules, NULL) END,
                CASE WHEN p_instructionsoverride_clear = true THEN NULL ELSE COALESCE(p_instructionsoverride, NULL) END,
                COALESCE(p_calendarchannelmode, 'ReadOnly')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentUserPolicies"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentUserPolicy" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentUserPolicy" TO "cdp_Integration";

/* spCreate Permissions for MJ: AI Agent User Policies */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentUserPolicy" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIAgentUserPolicy" TO "cdp_Integration";

/* spUpdate SQL for MJ: AI Agent User Policies */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent User Policies
-- Item: spUpdateAIAgentUserPolicy
-- Generated at: 2026-10-21T02:23:00.932Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIAgentUserPolicy
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIAgentUserPolicy'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIAgentUserPolicy"(
    p_id UUID,
    p_agentid UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_displaynameoverride_clear boolean DEFAULT false,
    p_displaynameoverride varchar(100) DEFAULT NULL,
    p_preferredpersonaid_clear boolean DEFAULT false,
    p_preferredpersonaid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_onboardingstatus varchar(20) DEFAULT NULL,
    p_onboardedat_clear boolean DEFAULT false,
    p_onboardedat TIMESTAMPTZ DEFAULT NULL,
    p_coordinationmode varchar(20) DEFAULT NULL,
    p_defaultdataaccessmode varchar(20) DEFAULT NULL,
    p_emailchannelmode varchar(20) DEFAULT NULL,
    p_phonechannelmode varchar(20) DEFAULT NULL,
    p_messagingchannelmode varchar(20) DEFAULT NULL,
    p_allowinteragentcoordination BOOLEAN DEFAULT NULL,
    p_requireapprovalforexternalcomms BOOLEAN DEFAULT NULL,
    p_requireapprovalforfinancials BOOLEAN DEFAULT NULL,
    p_requireapprovalfordestructiveactions BOOLEAN DEFAULT NULL,
    p_autoapproveamountthreshold_clear boolean DEFAULT false,
    p_autoapproveamountthreshold decimal(18, 2) DEFAULT NULL,
    p_entityaccessrules_clear boolean DEFAULT false,
    p_entityaccessrules TEXT DEFAULT NULL,
    p_actionpolicyrules_clear boolean DEFAULT false,
    p_actionpolicyrules TEXT DEFAULT NULL,
    p_instructionsoverride_clear boolean DEFAULT false,
    p_instructionsoverride TEXT DEFAULT NULL,
    p_calendarchannelmode varchar(30) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIAgentUserPolicies" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIAgentUserPolicy"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "UserID" = COALESCE(p_userid, "UserID"),
        "DisplayNameOverride" = CASE WHEN p_displaynameoverride_clear = true THEN NULL ELSE COALESCE(p_displaynameoverride, "DisplayNameOverride") END,
        "PreferredPersonaID" = CASE WHEN p_preferredpersonaid_clear = true THEN NULL ELSE COALESCE(p_preferredpersonaid, "PreferredPersonaID") END,
        "Status" = COALESCE(p_status, "Status"),
        "OnboardingStatus" = COALESCE(p_onboardingstatus, "OnboardingStatus"),
        "OnboardedAt" = CASE WHEN p_onboardedat_clear = true THEN NULL ELSE COALESCE(p_onboardedat, "OnboardedAt") END,
        "CoordinationMode" = COALESCE(p_coordinationmode, "CoordinationMode"),
        "DefaultDataAccessMode" = COALESCE(p_defaultdataaccessmode, "DefaultDataAccessMode"),
        "EmailChannelMode" = COALESCE(p_emailchannelmode, "EmailChannelMode"),
        "PhoneChannelMode" = COALESCE(p_phonechannelmode, "PhoneChannelMode"),
        "MessagingChannelMode" = COALESCE(p_messagingchannelmode, "MessagingChannelMode"),
        "AllowInterAgentCoordination" = COALESCE(p_allowinteragentcoordination, "AllowInterAgentCoordination"),
        "RequireApprovalForExternalComms" = COALESCE(p_requireapprovalforexternalcomms, "RequireApprovalForExternalComms"),
        "RequireApprovalForFinancials" = COALESCE(p_requireapprovalforfinancials, "RequireApprovalForFinancials"),
        "RequireApprovalForDestructiveActions" = COALESCE(p_requireapprovalfordestructiveactions, "RequireApprovalForDestructiveActions"),
        "AutoApproveAmountThreshold" = CASE WHEN p_autoapproveamountthreshold_clear = true THEN NULL ELSE COALESCE(p_autoapproveamountthreshold, "AutoApproveAmountThreshold") END,
        "EntityAccessRules" = CASE WHEN p_entityaccessrules_clear = true THEN NULL ELSE COALESCE(p_entityaccessrules, "EntityAccessRules") END,
        "ActionPolicyRules" = CASE WHEN p_actionpolicyrules_clear = true THEN NULL ELSE COALESCE(p_actionpolicyrules, "ActionPolicyRules") END,
        "InstructionsOverride" = CASE WHEN p_instructionsoverride_clear = true THEN NULL ELSE COALESCE(p_instructionsoverride, "InstructionsOverride") END,
        "CalendarChannelMode" = COALESCE(p_calendarchannelmode, "CalendarChannelMode")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIAgentUserPolicies"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentUserPolicy" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentUserPolicy" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIAgentUserPolicy table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_agent_user_policy"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_agent_user_policy" ON "__mj"."AIAgentUserPolicy";

CREATE TRIGGER "trg_update_ai_agent_user_policy"
BEFORE UPDATE ON "__mj"."AIAgentUserPolicy"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_agent_user_policy"();

/* spUpdate Permissions for MJ: AI Agent User Policies */
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentUserPolicy" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIAgentUserPolicy" TO "cdp_Integration";

/* spDelete SQL for MJ: AI Agent User Policies */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Agent User Policies
-- Item: spDeleteAIAgentUserPolicy
-- Generated at: 2026-10-21T02:23:00.932Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIAgentUserPolicy
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIAgentUserPolicy'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIAgentUserPolicy"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AIAgentUserPolicy"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentUserPolicy" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentUserPolicy" TO "cdp_Integration";

/* spDelete Permissions for MJ: AI Agent User Policies */
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentUserPolicy" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIAgentUserPolicy" TO "cdp_Integration";

/* SQL text to update entity field related entity name field map for entity field ID ef8683e5-db2c-4770-893a-5c34319018b8 */
SELECT * FROM "__mj"."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => 'ef8683e5-db2c-4770-893a-5c34319018b8', p_RelatedEntityNameFieldMap => 'User');

/* Base View SQL for MJ: AI Bridge Agent Identities */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Agent Identities
-- Item: spCreateAIBridgeAgentIdentity
-- Generated at: 2026-10-21T02:23:00.976Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIBridgeAgentIdentity
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIBridgeAgentIdentity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIBridgeAgentIdentity"(
    p_id UUID DEFAULT NULL,
    p_agentid UUID DEFAULT NULL,
    p_providerid UUID DEFAULT NULL,
    p_identitytype varchar(20) DEFAULT NULL,
    p_identityvalue varchar(500) DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_isactive BOOLEAN DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIBridgeAgentIdentities" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIBridgeAgentIdentity"
        (
            "ID",
            "AgentID",
                "ProviderID",
                "IdentityType",
                "IdentityValue",
                "DisplayName",
                "IsActive",
                "Configuration",
                "UserID"
        )
    VALUES
        (
            v_new_id,
            p_agentid,
                p_providerid,
                p_identitytype,
                p_identityvalue,
                CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, NULL) END,
                COALESCE(p_isactive, TRUE),
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIBridgeAgentIdentities"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIBridgeAgentIdentity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIBridgeAgentIdentity" TO "cdp_Integration";

/* spCreate Permissions for MJ: AI Bridge Agent Identities */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIBridgeAgentIdentity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIBridgeAgentIdentity" TO "cdp_Integration";

/* spUpdate SQL for MJ: AI Bridge Agent Identities */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Agent Identities
-- Item: spUpdateAIBridgeAgentIdentity
-- Generated at: 2026-10-21T02:23:00.976Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIBridgeAgentIdentity
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIBridgeAgentIdentity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIBridgeAgentIdentity"(
    p_id UUID,
    p_agentid UUID DEFAULT NULL,
    p_providerid UUID DEFAULT NULL,
    p_identitytype varchar(20) DEFAULT NULL,
    p_identityvalue varchar(500) DEFAULT NULL,
    p_displayname_clear boolean DEFAULT false,
    p_displayname varchar(255) DEFAULT NULL,
    p_isactive BOOLEAN DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_userid_clear boolean DEFAULT false,
    p_userid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIBridgeAgentIdentities" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIBridgeAgentIdentity"
    SET
        "AgentID" = COALESCE(p_agentid, "AgentID"),
        "ProviderID" = COALESCE(p_providerid, "ProviderID"),
        "IdentityType" = COALESCE(p_identitytype, "IdentityType"),
        "IdentityValue" = COALESCE(p_identityvalue, "IdentityValue"),
        "DisplayName" = CASE WHEN p_displayname_clear = true THEN NULL ELSE COALESCE(p_displayname, "DisplayName") END,
        "IsActive" = COALESCE(p_isactive, "IsActive"),
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "UserID" = CASE WHEN p_userid_clear = true THEN NULL ELSE COALESCE(p_userid, "UserID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIBridgeAgentIdentities"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIBridgeAgentIdentity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIBridgeAgentIdentity" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIBridgeAgentIdentity table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_bridge_agent_identity"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_bridge_agent_identity" ON "__mj"."AIBridgeAgentIdentity";

CREATE TRIGGER "trg_update_ai_bridge_agent_identity"
BEFORE UPDATE ON "__mj"."AIBridgeAgentIdentity"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_bridge_agent_identity"();

/* spUpdate Permissions for MJ: AI Bridge Agent Identities */
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIBridgeAgentIdentity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIBridgeAgentIdentity" TO "cdp_Integration";

/* spDelete SQL for MJ: AI Bridge Agent Identities */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Bridge Agent Identities
-- Item: spDeleteAIBridgeAgentIdentity
-- Generated at: 2026-10-21T02:23:00.977Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIBridgeAgentIdentity
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIBridgeAgentIdentity'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIBridgeAgentIdentity"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AIBridgeAgentIdentity"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIBridgeAgentIdentity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIBridgeAgentIdentity" TO "cdp_Integration";

/* spDelete Permissions for MJ: AI Bridge Agent Identities */
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIBridgeAgentIdentity" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIBridgeAgentIdentity" TO "cdp_Integration";

/* spCreate SQL for MJ: AI Credential Bindings */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Communication Providers
-- Item: spCreateCommunicationProvider
-- Generated at: 2026-10-21T02:23:01.499Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR CommunicationProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateCommunicationProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateCommunicationProvider"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_supportssending BOOLEAN DEFAULT NULL,
    p_supportsreceiving BOOLEAN DEFAULT NULL,
    p_supportsscheduledsending BOOLEAN DEFAULT NULL,
    p_supportsforwarding BOOLEAN DEFAULT NULL,
    p_supportsreplying BOOLEAN DEFAULT NULL,
    p_supportsdrafts BOOLEAN DEFAULT NULL,
    p_supportscalendar BOOLEAN DEFAULT NULL,
    p_supportsfreebusy BOOLEAN DEFAULT NULL,
    p_enterprisescopemode varchar(40) DEFAULT NULL,
    p_allowedemaildomains_clear boolean DEFAULT false,
    p_allowedemaildomains varchar(500) DEFAULT NULL,
    p_defaultcredentialid_clear boolean DEFAULT false,
    p_defaultcredentialid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwCommunicationProviders" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."CommunicationProvider"
        (
            "ID",
            "Name",
                "Description",
                "Status",
                "SupportsSending",
                "SupportsReceiving",
                "SupportsScheduledSending",
                "SupportsForwarding",
                "SupportsReplying",
                "SupportsDrafts",
                "SupportsCalendar",
                "SupportsFreeBusy",
                "EnterpriseScopeMode",
                "AllowedEmailDomains",
                "DefaultCredentialID"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_status, 'Disabled'),
                COALESCE(p_supportssending, TRUE),
                COALESCE(p_supportsreceiving, FALSE),
                COALESCE(p_supportsscheduledsending, FALSE),
                COALESCE(p_supportsforwarding, FALSE),
                COALESCE(p_supportsreplying, FALSE),
                COALESCE(p_supportsdrafts, FALSE),
                COALESCE(p_supportscalendar, FALSE),
                COALESCE(p_supportsfreebusy, FALSE),
                COALESCE(p_enterprisescopemode, 'UtilityMailboxesOnly'),
                CASE WHEN p_allowedemaildomains_clear = true THEN NULL ELSE COALESCE(p_allowedemaildomains, NULL) END,
                CASE WHEN p_defaultcredentialid_clear = true THEN NULL ELSE COALESCE(p_defaultcredentialid, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwCommunicationProviders"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCommunicationProvider" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCommunicationProvider" TO "cdp_Developer";

/* spCreate Permissions for MJ: Communication Providers */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCommunicationProvider" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCommunicationProvider" TO "cdp_Developer";

/* spUpdate SQL for MJ: Communication Providers */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Communication Providers
-- Item: spUpdateCommunicationProvider
-- Generated at: 2026-10-21T02:23:01.500Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR CommunicationProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateCommunicationProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateCommunicationProvider"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_supportssending BOOLEAN DEFAULT NULL,
    p_supportsreceiving BOOLEAN DEFAULT NULL,
    p_supportsscheduledsending BOOLEAN DEFAULT NULL,
    p_supportsforwarding BOOLEAN DEFAULT NULL,
    p_supportsreplying BOOLEAN DEFAULT NULL,
    p_supportsdrafts BOOLEAN DEFAULT NULL,
    p_supportscalendar BOOLEAN DEFAULT NULL,
    p_supportsfreebusy BOOLEAN DEFAULT NULL,
    p_enterprisescopemode varchar(40) DEFAULT NULL,
    p_allowedemaildomains_clear boolean DEFAULT false,
    p_allowedemaildomains varchar(500) DEFAULT NULL,
    p_defaultcredentialid_clear boolean DEFAULT false,
    p_defaultcredentialid UUID DEFAULT NULL
) RETURNS SETOF "__mj"."vwCommunicationProviders" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."CommunicationProvider"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Status" = COALESCE(p_status, "Status"),
        "SupportsSending" = COALESCE(p_supportssending, "SupportsSending"),
        "SupportsReceiving" = COALESCE(p_supportsreceiving, "SupportsReceiving"),
        "SupportsScheduledSending" = COALESCE(p_supportsscheduledsending, "SupportsScheduledSending"),
        "SupportsForwarding" = COALESCE(p_supportsforwarding, "SupportsForwarding"),
        "SupportsReplying" = COALESCE(p_supportsreplying, "SupportsReplying"),
        "SupportsDrafts" = COALESCE(p_supportsdrafts, "SupportsDrafts"),
        "SupportsCalendar" = COALESCE(p_supportscalendar, "SupportsCalendar"),
        "SupportsFreeBusy" = COALESCE(p_supportsfreebusy, "SupportsFreeBusy"),
        "EnterpriseScopeMode" = COALESCE(p_enterprisescopemode, "EnterpriseScopeMode"),
        "AllowedEmailDomains" = CASE WHEN p_allowedemaildomains_clear = true THEN NULL ELSE COALESCE(p_allowedemaildomains, "AllowedEmailDomains") END,
        "DefaultCredentialID" = CASE WHEN p_defaultcredentialid_clear = true THEN NULL ELSE COALESCE(p_defaultcredentialid, "DefaultCredentialID") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwCommunicationProviders"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCommunicationProvider" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCommunicationProvider" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CommunicationProvider table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_communication_provider"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_communication_provider" ON "__mj"."CommunicationProvider";

CREATE TRIGGER "trg_update_communication_provider"
BEFORE UPDATE ON "__mj"."CommunicationProvider"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_communication_provider"();

/* spUpdate Permissions for MJ: Communication Providers */
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCommunicationProvider" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCommunicationProvider" TO "cdp_Developer";

/* spDelete SQL for MJ: Communication Providers */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Communication Providers
-- Item: spDeleteCommunicationProvider
-- Generated at: 2026-10-21T02:23:01.500Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR CommunicationProvider
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteCommunicationProvider'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteCommunicationProvider"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."CommunicationProvider"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCommunicationProvider" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCommunicationProvider" TO "cdp_Developer";

/* spDelete Permissions for MJ: Communication Providers */
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCommunicationProvider" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCommunicationProvider" TO "cdp_Developer";

/* SQL text to update entity field related entity name field map for entity field ID 5caaea2f-4fab-444c-8997-7d18220e5e29 */
SELECT * FROM "__mj"."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '5caaea2f-4fab-444c-8997-7d18220e5e29', p_RelatedEntityNameFieldMap => 'Conversation');

/* SQL text to update entity field related entity name field map for entity field ID ece1c405-0c2e-42ae-8840-9de6faa5c029 */
SELECT * FROM "__mj"."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => 'ece1c405-0c2e-42ae-8840-9de6faa5c029', p_RelatedEntityNameFieldMap => 'ParentBranch');

/* SQL text to update entity field related entity name field map for entity field ID ec1290ea-a783-4dd5-b374-f22ff6805f02 */
SELECT * FROM "__mj"."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => 'ec1290ea-a783-4dd5-b374-f22ff6805f02', p_RelatedEntityNameFieldMap => 'User');

/* SQL text to update entity field related entity name field map for entity field ID eea65c41-e1ff-4976-ba32-aa4e0ba70463 */
SELECT * FROM "__mj"."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => 'eea65c41-e1ff-4976-ba32-aa4e0ba70463', p_RelatedEntityNameFieldMap => 'Branch');

/* SQL text to update entity field related entity name field map for entity field ID 56693a11-25d6-48f4-90d7-ecb1a850d4d7 */
SELECT * FROM "__mj"."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '56693a11-25d6-48f4-90d7-ecb1a850d4d7', p_RelatedEntityNameFieldMap => 'Conversation');

/* SQL text to update entity field related entity name field map for entity field ID 88f0e3c9-f8bd-4a69-b51c-9bdd61e695d0 */
SELECT * FROM "__mj"."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '88f0e3c9-f8bd-4a69-b51c-9bdd61e695d0', p_RelatedEntityNameFieldMap => 'Skill');

/* SQL text to update entity field related entity name field map for entity field ID 70fc39bb-0302-47c4-bab2-b931466e1e6a */
SELECT * FROM "__mj"."spUpdateEntityFieldRelatedEntityNameFieldMap"(p_EntityFieldID => '70fc39bb-0302-47c4-bab2-b931466e1e6a', p_RelatedEntityNameFieldMap => 'ActivatedByRun');

/* Index for Foreign Keys for Entity */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routines
-- Item: spCreateUserRoutine
-- Generated at: 2026-10-21T02:23:03.755Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR UserRoutine
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateUserRoutine'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateUserRoutine"(
    p_id UUID DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_environmentid_clear boolean DEFAULT false,
    p_environmentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_routinetype varchar(20) DEFAULT NULL,
    p_targettype varchar(20) DEFAULT NULL,
    p_targetid UUID DEFAULT NULL,
    p_initialmessage_clear boolean DEFAULT false,
    p_initialmessage TEXT DEFAULT NULL,
    p_startingpayload_clear boolean DEFAULT false,
    p_startingpayload TEXT DEFAULT NULL,
    p_requestedskillids_clear boolean DEFAULT false,
    p_requestedskillids TEXT DEFAULT NULL,
    p_cronexpression varchar(100) DEFAULT NULL,
    p_startat_clear boolean DEFAULT false,
    p_startat TIMESTAMPTZ DEFAULT NULL,
    p_endat_clear boolean DEFAULT false,
    p_endat TIMESTAMPTZ DEFAULT NULL,
    p_notificationtemplateid_clear boolean DEFAULT false,
    p_notificationtemplateid UUID DEFAULT NULL,
    p_timezone varchar(100) DEFAULT NULL,
    p_nextrunat_clear boolean DEFAULT false,
    p_nextrunat TIMESTAMPTZ DEFAULT NULL,
    p_lastrunat_clear boolean DEFAULT false,
    p_lastrunat TIMESTAMPTZ DEFAULT NULL,
    p_lastrunstatus_clear boolean DEFAULT false,
    p_lastrunstatus varchar(20) DEFAULT NULL,
    p_lastresulthash_clear boolean DEFAULT false,
    p_lastresulthash varchar(100) DEFAULT NULL,
    p_notifycondition varchar(20) DEFAULT NULL,
    p_notifyviainapp BOOLEAN DEFAULT NULL,
    p_notifyviaemail BOOLEAN DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid UUID DEFAULT NULL,
    p_schedulemode varchar(20) DEFAULT NULL,
    p_wakeconfiguration_clear boolean DEFAULT false,
    p_wakeconfiguration TEXT DEFAULT NULL,
    p_lastcheckedat_clear boolean DEFAULT false,
    p_lastcheckedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwUserRoutines" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."UserRoutine"
        (
            "ID",
            "UserID",
                "EnvironmentID",
                "Name",
                "Description",
                "Status",
                "RoutineType",
                "TargetType",
                "TargetID",
                "InitialMessage",
                "StartingPayload",
                "RequestedSkillIDs",
                "CronExpression",
                "StartAt",
                "EndAt",
                "NotificationTemplateID",
                "Timezone",
                "NextRunAt",
                "LastRunAt",
                "LastRunStatus",
                "LastResultHash",
                "NotifyCondition",
                "NotifyViaInApp",
                "NotifyViaEmail",
                "ConversationID",
                "ScheduleMode",
                "WakeConfiguration",
                "LastCheckedAt"
        )
    VALUES
        (
            v_new_id,
            p_userid,
                CASE WHEN p_environmentid_clear = true THEN NULL ELSE COALESCE(p_environmentid, NULL) END,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_status, 'Active'),
                COALESCE(p_routinetype, 'Scheduled'),
                p_targettype,
                p_targetid,
                CASE WHEN p_initialmessage_clear = true THEN NULL ELSE COALESCE(p_initialmessage, NULL) END,
                CASE WHEN p_startingpayload_clear = true THEN NULL ELSE COALESCE(p_startingpayload, NULL) END,
                CASE WHEN p_requestedskillids_clear = true THEN NULL ELSE COALESCE(p_requestedskillids, NULL) END,
                p_cronexpression,
                CASE WHEN p_startat_clear = true THEN NULL ELSE COALESCE(p_startat, NULL) END,
                CASE WHEN p_endat_clear = true THEN NULL ELSE COALESCE(p_endat, NULL) END,
                CASE WHEN p_notificationtemplateid_clear = true THEN NULL ELSE COALESCE(p_notificationtemplateid, NULL) END,
                COALESCE(p_timezone, 'UTC'),
                CASE WHEN p_nextrunat_clear = true THEN NULL ELSE COALESCE(p_nextrunat, NULL) END,
                CASE WHEN p_lastrunat_clear = true THEN NULL ELSE COALESCE(p_lastrunat, NULL) END,
                CASE WHEN p_lastrunstatus_clear = true THEN NULL ELSE COALESCE(p_lastrunstatus, NULL) END,
                CASE WHEN p_lastresulthash_clear = true THEN NULL ELSE COALESCE(p_lastresulthash, NULL) END,
                COALESCE(p_notifycondition, 'Always'),
                COALESCE(p_notifyviainapp, TRUE),
                COALESCE(p_notifyviaemail, FALSE),
                CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, NULL) END,
                COALESCE(p_schedulemode, 'Recurring'),
                CASE WHEN p_wakeconfiguration_clear = true THEN NULL ELSE COALESCE(p_wakeconfiguration, NULL) END,
                CASE WHEN p_lastcheckedat_clear = true THEN NULL ELSE COALESCE(p_lastcheckedat, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwUserRoutines"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateUserRoutine" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateUserRoutine" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateUserRoutine" TO "cdp_UI";

/* spCreate Permissions for MJ: User Routines */
GRANT EXECUTE ON FUNCTION "__mj"."spCreateUserRoutine" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateUserRoutine" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateUserRoutine" TO "cdp_UI";

/* spUpdate SQL for MJ: User Routines */

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: User Routines
-- Item: spUpdateUserRoutine
-- Generated at: 2026-10-21T02:23:03.756Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR UserRoutine
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateUserRoutine'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateUserRoutine"(
    p_id UUID,
    p_userid UUID DEFAULT NULL,
    p_environmentid_clear boolean DEFAULT false,
    p_environmentid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_routinetype varchar(20) DEFAULT NULL,
    p_targettype varchar(20) DEFAULT NULL,
    p_targetid UUID DEFAULT NULL,
    p_initialmessage_clear boolean DEFAULT false,
    p_initialmessage TEXT DEFAULT NULL,
    p_startingpayload_clear boolean DEFAULT false,
    p_startingpayload TEXT DEFAULT NULL,
    p_requestedskillids_clear boolean DEFAULT false,
    p_requestedskillids TEXT DEFAULT NULL,
    p_cronexpression varchar(100) DEFAULT NULL,
    p_startat_clear boolean DEFAULT false,
    p_startat TIMESTAMPTZ DEFAULT NULL,
    p_endat_clear boolean DEFAULT false,
    p_endat TIMESTAMPTZ DEFAULT NULL,
    p_notificationtemplateid_clear boolean DEFAULT false,
    p_notificationtemplateid UUID DEFAULT NULL,
    p_timezone varchar(100) DEFAULT NULL,
    p_nextrunat_clear boolean DEFAULT false,
    p_nextrunat TIMESTAMPTZ DEFAULT NULL,
    p_lastrunat_clear boolean DEFAULT false,
    p_lastrunat TIMESTAMPTZ DEFAULT NULL,
    p_lastrunstatus_clear boolean DEFAULT false,
    p_lastrunstatus varchar(20) DEFAULT NULL,
    p_lastresulthash_clear boolean DEFAULT false,
    p_lastresulthash varchar(100) DEFAULT NULL,
    p_notifycondition varchar(20) DEFAULT NULL,
    p_notifyviainapp BOOLEAN DEFAULT NULL,
    p_notifyviaemail BOOLEAN DEFAULT NULL,
    p_conversationid_clear boolean DEFAULT false,
    p_conversationid UUID DEFAULT NULL,
    p_schedulemode varchar(20) DEFAULT NULL,
    p_wakeconfiguration_clear boolean DEFAULT false,
    p_wakeconfiguration TEXT DEFAULT NULL,
    p_lastcheckedat_clear boolean DEFAULT false,
    p_lastcheckedat TIMESTAMPTZ DEFAULT NULL
) RETURNS SETOF "__mj"."vwUserRoutines" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."UserRoutine"
    SET
        "UserID" = COALESCE(p_userid, "UserID"),
        "EnvironmentID" = CASE WHEN p_environmentid_clear = true THEN NULL ELSE COALESCE(p_environmentid, "EnvironmentID") END,
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Status" = COALESCE(p_status, "Status"),
        "RoutineType" = COALESCE(p_routinetype, "RoutineType"),
        "TargetType" = COALESCE(p_targettype, "TargetType"),
        "TargetID" = COALESCE(p_targetid, "TargetID"),
        "InitialMessage" = CASE WHEN p_initialmessage_clear = true THEN NULL ELSE COALESCE(p_initialmessage, "InitialMessage") END,
        "StartingPayload" = CASE WHEN p_startingpayload_clear = true THEN NULL ELSE COALESCE(p_startingpayload, "StartingPayload") END,
        "RequestedSkillIDs" = CASE WHEN p_requestedskillids_clear = true THEN NULL ELSE COALESCE(p_requestedskillids, "RequestedSkillIDs") END,
        "CronExpression" = COALESCE(p_cronexpression, "CronExpression"),
        "StartAt" = CASE WHEN p_startat_clear = true THEN NULL ELSE COALESCE(p_startat, "StartAt") END,
        "EndAt" = CASE WHEN p_endat_clear = true THEN NULL ELSE COALESCE(p_endat, "EndAt") END,
        "NotificationTemplateID" = CASE WHEN p_notificationtemplateid_clear = true THEN NULL ELSE COALESCE(p_notificationtemplateid, "NotificationTemplateID") END,
        "Timezone" = COALESCE(p_timezone, "Timezone"),
        "NextRunAt" = CASE WHEN p_nextrunat_clear = true THEN NULL ELSE COALESCE(p_nextrunat, "NextRunAt") END,
        "LastRunAt" = CASE WHEN p_lastrunat_clear = true THEN NULL ELSE COALESCE(p_lastrunat, "LastRunAt") END,
        "LastRunStatus" = CASE WHEN p_lastrunstatus_clear = true THEN NULL ELSE COALESCE(p_lastrunstatus, "LastRunStatus") END,
        "LastResultHash" = CASE WHEN p_lastresulthash_clear = true THEN NULL ELSE COALESCE(p_lastresulthash, "LastResultHash") END,
        "NotifyCondition" = COALESCE(p_notifycondition, "NotifyCondition"),
        "NotifyViaInApp" = COALESCE(p_notifyviainapp, "NotifyViaInApp"),
        "NotifyViaEmail" = COALESCE(p_notifyviaemail, "NotifyViaEmail"),
        "ConversationID" = CASE WHEN p_conversationid_clear = true THEN NULL ELSE COALESCE(p_conversationid, "ConversationID") END,
        "ScheduleMode" = COALESCE(p_schedulemode, "ScheduleMode"),
        "WakeConfiguration" = CASE WHEN p_wakeconfiguration_clear = true THEN NULL ELSE COALESCE(p_wakeconfiguration, "WakeConfiguration") END,
        "LastCheckedAt" = CASE WHEN p_lastcheckedat_clear = true THEN NULL ELSE COALESCE(p_lastcheckedat, "LastCheckedAt") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwUserRoutines"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateUserRoutine" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateUserRoutine" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateUserRoutine" TO "cdp_UI";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the UserRoutine table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_user_routine"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_user_routine" ON "__mj"."UserRoutine";

CREATE TRIGGER "trg_update_user_routine"
BEFORE UPDATE ON "__mj"."UserRoutine"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_user_routine"();

/* spUpdate Permissions for MJ: User Routines */
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateUserRoutine" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateUserRoutine" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateUserRoutine" TO "cdp_UI";

/* Index for Foreign Keys for UserViewRunDetail */
