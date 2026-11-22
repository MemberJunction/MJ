-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
--
-- The schema name is emitted UNQUOTED, so PostgreSQL folds it to lowercase. That is deliberate and
-- self-consistent: everything downstream in a converted migration refers to it unquoted too, so
-- both definition and lookup land on the same folded name.
--
-- DOWNSTREAM NOTE for the build engineer: a PostgreSQL database that was populated by an EARLIER
-- converter — one that emitted a quoted, case-preserved name — already holds that mixed-case
-- schema: for a target named MySchema_Name, the quoted "MySchema_Name". Re-converting against
-- that database creates a SECOND, empty schema myschema_name rather than reusing the existing
-- one, because IF NOT EXISTS compares the folded name and finds no match. The repo's own committed
-- migrations-pg files are unaffected (the only quoted CREATE SCHEMAs there are the four pg_dump
-- baselines, which this path does not produce), so this is an open-app / downstream concern, not
-- one for this repo's Flyway history.
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


-- ===================== DDL: Tables, PKs, Indexes =====================

ALTER TABLE __mj."AIAgentRhythmTemplate"
 ADD COLUMN IF NOT EXISTS "DefaultAgentConfigurationID" UUID NULL,
 ADD CONSTRAINT "FK_AIAgentRhythmTemplate_AIConfiguration" FOREIGN KEY ("DefaultAgentConfigurationID")
        REFERENCES __mj."AIConfiguration"("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE __mj."UserRoutine"
 ADD COLUMN IF NOT EXISTS "AgentConfigurationID" UUID NULL,
 ADD CONSTRAINT "FK_UserRoutine_AIConfiguration" FOREIGN KEY ("AgentConfigurationID")
        REFERENCES __mj."AIConfiguration"("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE __mj."AIAgentUserPolicy"
    DROP CONSTRAINT IF EXISTS "DF_AIAgentUserPolicy_CoordinationMode";

ALTER TABLE __mj."AIAgentUserPolicy"
    DROP CONSTRAINT IF EXISTS "DF_AIAgentUserPolicy_CalendarChannelMode";

ALTER TABLE __mj."AIAgentUserPolicy"
    DROP CONSTRAINT IF EXISTS "DF_AIAgentUserPolicy_PhoneChannelMode";

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRhythmTemplate_DefaultAgentCon_49d86f68" ON __mj."AIAgentRhythmTemplate" ("DefaultAgentConfigurationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_UserRoutine_AgentConfigurationID" ON __mj."UserRoutine" ("AgentConfigurationID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwAIAgentRhythmTemplates';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentRhythmTemplates"
AS SELECT
    a.*,
    "MJAIAgent_AgentID"."Name" AS "Agent",
    "MJAISkill_SkillID"."Name" AS "Skill",
    "MJAIConfiguration_DefaultAgentConfigurationID"."Name" AS "DefaultAgentConfiguration"
FROM
    __mj."AIAgentRhythmTemplate" AS a
LEFT OUTER JOIN
    __mj."AIAgent" AS "MJAIAgent_AgentID"
  ON
    a."AgentID" = "MJAIAgent_AgentID"."ID"
LEFT OUTER JOIN
    __mj."AISkill" AS "MJAISkill_SkillID"
  ON
    a."SkillID" = "MJAISkill_SkillID"."ID"
LEFT OUTER JOIN
    __mj."AIConfiguration" AS "MJAIConfiguration_DefaultAgentConfigurationID"
  ON
    a."DefaultAgentConfigurationID" = "MJAIConfiguration_DefaultAgentConfigurationID"."ID"$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwUserRoutines';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwUserRoutines"
AS SELECT
    u.*,
    "MJUser_UserID"."Name" AS "User",
    "MJEnvironment_EnvironmentID"."Name" AS "Environment",
    "MJTemplate_NotificationTemplateID"."Name" AS "NotificationTemplate",
    "MJConversation_ConversationID"."Name" AS "Conversation",
    "MJAIConfiguration_AgentConfigurationID"."Name" AS "AgentConfiguration"
FROM
    __mj."UserRoutine" AS u
LEFT OUTER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    u."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."Environment" AS "MJEnvironment_EnvironmentID"
  ON
    u."EnvironmentID" = "MJEnvironment_EnvironmentID"."ID"
LEFT OUTER JOIN
    __mj."Template" AS "MJTemplate_NotificationTemplateID"
  ON
    u."NotificationTemplateID" = "MJTemplate_NotificationTemplateID"."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS "MJConversation_ConversationID"
  ON
    u."ConversationID" = "MJConversation_ConversationID"."ID"
LEFT OUTER JOIN
    __mj."AIConfiguration" AS "MJAIConfiguration_AgentConfigurationID"
  ON
    u."AgentConfigurationID" = "MJAIConfiguration_AgentConfigurationID"."ID"$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;


-- ===================== Stored Procedures (sp*) =====================

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateAIAgentRhythmTemplate'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRhythmTemplate"(
    IN p_ID UUID DEFAULT NULL,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_SkillID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SkillID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_WorkstreamKey VARCHAR(150) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_DefaultCronExpression VARCHAR(100) DEFAULT NULL,
    IN p_DefaultWakeGate_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultWakeGate TEXT DEFAULT NULL,
    IN p_WakeReason VARCHAR(500) DEFAULT NULL,
    IN p_OfferAt VARCHAR(20) DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_DefaultAgentConfigurationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultAgentConfigurationID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentRhythmTemplates" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentRhythmTemplate"
            (
                "ID",
                "AgentID",
                "SkillID",
                "Name",
                "WorkstreamKey",
                "Description",
                "DefaultCronExpression",
                "DefaultWakeGate",
                "WakeReason",
                "OfferAt",
                "Status",
                "DefaultAgentConfigurationID"
            )
        VALUES
            (
                p_ID,
                p_AgentID,
                CASE WHEN p_SkillID_Clear = TRUE THEN NULL ELSE COALESCE(p_SkillID, NULL) END,
                p_Name,
                p_WorkstreamKey,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                p_DefaultCronExpression,
                CASE WHEN p_DefaultWakeGate_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultWakeGate, NULL) END,
                p_WakeReason,
                COALESCE(p_OfferAt, 'Onboarding'),
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_DefaultAgentConfigurationID_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultAgentConfigurationID, NULL) END
            );
    ELSE
        INSERT INTO __mj."AIAgentRhythmTemplate"
            (
                "AgentID",
                "SkillID",
                "Name",
                "WorkstreamKey",
                "Description",
                "DefaultCronExpression",
                "DefaultWakeGate",
                "WakeReason",
                "OfferAt",
                "Status",
                "DefaultAgentConfigurationID"
            )
        VALUES
            (
                p_AgentID,
                CASE WHEN p_SkillID_Clear = TRUE THEN NULL ELSE COALESCE(p_SkillID, NULL) END,
                p_Name,
                p_WorkstreamKey,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                p_DefaultCronExpression,
                CASE WHEN p_DefaultWakeGate_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultWakeGate, NULL) END,
                p_WakeReason,
                COALESCE(p_OfferAt, 'Onboarding'),
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_DefaultAgentConfigurationID_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultAgentConfigurationID, NULL) END
            );
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRhythmTemplates" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIAgentRhythmTemplate'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRhythmTemplate"(
    IN p_ID UUID,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_SkillID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SkillID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_WorkstreamKey VARCHAR(150) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_DefaultCronExpression VARCHAR(100) DEFAULT NULL,
    IN p_DefaultWakeGate_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultWakeGate TEXT DEFAULT NULL,
    IN p_WakeReason VARCHAR(500) DEFAULT NULL,
    IN p_OfferAt VARCHAR(20) DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_DefaultAgentConfigurationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultAgentConfigurationID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentRhythmTemplates" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIAgentRhythmTemplate"
    SET
        "AgentID" = COALESCE(p_AgentID, "AgentID"),
        "SkillID" = CASE WHEN p_SkillID_Clear = TRUE THEN NULL ELSE COALESCE(p_SkillID, "SkillID") END,
        "Name" = COALESCE(p_Name, "Name"),
        "WorkstreamKey" = COALESCE(p_WorkstreamKey, "WorkstreamKey"),
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "DefaultCronExpression" = COALESCE(p_DefaultCronExpression, "DefaultCronExpression"),
        "DefaultWakeGate" = CASE WHEN p_DefaultWakeGate_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultWakeGate, "DefaultWakeGate") END,
        "WakeReason" = COALESCE(p_WakeReason, "WakeReason"),
        "OfferAt" = COALESCE(p_OfferAt, "OfferAt"),
        "Status" = COALESCE(p_Status, "Status"),
        "DefaultAgentConfigurationID" = CASE WHEN p_DefaultAgentConfigurationID_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultAgentConfigurationID, "DefaultAgentConfigurationID") END,
        "__mj_UpdatedAt" = NOW()
    WHERE
        "ID" = p_ID;

    IF _v_row_count = 0 THEN
        SELECT * FROM __mj."vwAIAgentRhythmTemplates" WHERE 1=0
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIAgentRhythmTemplates" WHERE "ID" = p_ID;
LIMIT 0;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateUserRoutine'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateUserRoutine"(
    IN p_ID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_EnvironmentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EnvironmentID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_RoutineType VARCHAR(20) DEFAULT NULL,
    IN p_TargetType VARCHAR(20) DEFAULT NULL,
    IN p_TargetID UUID DEFAULT NULL,
    IN p_InitialMessage_Clear BOOLEAN DEFAULT FALSE,
    IN p_InitialMessage TEXT DEFAULT NULL,
    IN p_StartingPayload_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartingPayload TEXT DEFAULT NULL,
    IN p_RequestedSkillIDs_Clear BOOLEAN DEFAULT FALSE,
    IN p_RequestedSkillIDs TEXT DEFAULT NULL,
    IN p_CronExpression_Clear BOOLEAN DEFAULT FALSE,
    IN p_CronExpression VARCHAR(100) DEFAULT NULL,
    IN p_StartAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartAt TIMESTAMPTZ DEFAULT NULL,
    IN p_EndAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_EndAt TIMESTAMPTZ DEFAULT NULL,
    IN p_NotificationTemplateID_Clear BOOLEAN DEFAULT FALSE,
    IN p_NotificationTemplateID UUID DEFAULT NULL,
    IN p_Timezone VARCHAR(100) DEFAULT NULL,
    IN p_NextRunAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_NextRunAt TIMESTAMPTZ DEFAULT NULL,
    IN p_LastRunAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastRunAt TIMESTAMPTZ DEFAULT NULL,
    IN p_LastRunStatus_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastRunStatus VARCHAR(20) DEFAULT NULL,
    IN p_LastResultHash_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastResultHash VARCHAR(100) DEFAULT NULL,
    IN p_NotifyCondition VARCHAR(20) DEFAULT NULL,
    IN p_NotifyViaInApp BOOLEAN DEFAULT NULL,
    IN p_NotifyViaEmail BOOLEAN DEFAULT NULL,
    IN p_ConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationID UUID DEFAULT NULL,
    IN p_ScheduleMode VARCHAR(20) DEFAULT NULL,
    IN p_WakeConfiguration_Clear BOOLEAN DEFAULT FALSE,
    IN p_WakeConfiguration TEXT DEFAULT NULL,
    IN p_LastCheckedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastCheckedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_AgentConfigurationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentConfigurationID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwUserRoutines" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."UserRoutine"
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
                "LastCheckedAt",
                "AgentConfigurationID"
            )
        VALUES
            (
                p_ID,
                p_UserID,
                CASE WHEN p_EnvironmentID_Clear = TRUE THEN NULL ELSE COALESCE(p_EnvironmentID, NULL) END,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                COALESCE(p_Status, 'Active'),
                COALESCE(p_RoutineType, 'Scheduled'),
                p_TargetType,
                p_TargetID,
                CASE WHEN p_InitialMessage_Clear = TRUE THEN NULL ELSE COALESCE(p_InitialMessage, NULL) END,
                CASE WHEN p_StartingPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_StartingPayload, NULL) END,
                CASE WHEN p_RequestedSkillIDs_Clear = TRUE THEN NULL ELSE COALESCE(p_RequestedSkillIDs, NULL) END,
                CASE WHEN p_CronExpression_Clear = TRUE THEN NULL ELSE COALESCE(p_CronExpression, NULL) END,
                CASE WHEN p_StartAt_Clear = TRUE THEN NULL ELSE COALESCE(p_StartAt, NULL) END,
                CASE WHEN p_EndAt_Clear = TRUE THEN NULL ELSE COALESCE(p_EndAt, NULL) END,
                CASE WHEN p_NotificationTemplateID_Clear = TRUE THEN NULL ELSE COALESCE(p_NotificationTemplateID, NULL) END,
                COALESCE(p_Timezone, 'UTC'),
                CASE WHEN p_NextRunAt_Clear = TRUE THEN NULL ELSE COALESCE(p_NextRunAt, NULL) END,
                CASE WHEN p_LastRunAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRunAt, NULL) END,
                CASE WHEN p_LastRunStatus_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRunStatus, NULL) END,
                CASE WHEN p_LastResultHash_Clear = TRUE THEN NULL ELSE COALESCE(p_LastResultHash, NULL) END,
                COALESCE(p_NotifyCondition, 'Always'),
                COALESCE(p_NotifyViaInApp, TRUE),
                COALESCE(p_NotifyViaEmail, FALSE),
                CASE WHEN p_ConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationID, NULL) END,
                COALESCE(p_ScheduleMode, 'Recurring'),
                CASE WHEN p_WakeConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_WakeConfiguration, NULL) END,
                CASE WHEN p_LastCheckedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastCheckedAt, NULL) END,
                CASE WHEN p_AgentConfigurationID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentConfigurationID, NULL) END
            );
    ELSE
        INSERT INTO __mj."UserRoutine"
            (
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
                "LastCheckedAt",
                "AgentConfigurationID"
            )
        VALUES
            (
                p_UserID,
                CASE WHEN p_EnvironmentID_Clear = TRUE THEN NULL ELSE COALESCE(p_EnvironmentID, NULL) END,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                COALESCE(p_Status, 'Active'),
                COALESCE(p_RoutineType, 'Scheduled'),
                p_TargetType,
                p_TargetID,
                CASE WHEN p_InitialMessage_Clear = TRUE THEN NULL ELSE COALESCE(p_InitialMessage, NULL) END,
                CASE WHEN p_StartingPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_StartingPayload, NULL) END,
                CASE WHEN p_RequestedSkillIDs_Clear = TRUE THEN NULL ELSE COALESCE(p_RequestedSkillIDs, NULL) END,
                CASE WHEN p_CronExpression_Clear = TRUE THEN NULL ELSE COALESCE(p_CronExpression, NULL) END,
                CASE WHEN p_StartAt_Clear = TRUE THEN NULL ELSE COALESCE(p_StartAt, NULL) END,
                CASE WHEN p_EndAt_Clear = TRUE THEN NULL ELSE COALESCE(p_EndAt, NULL) END,
                CASE WHEN p_NotificationTemplateID_Clear = TRUE THEN NULL ELSE COALESCE(p_NotificationTemplateID, NULL) END,
                COALESCE(p_Timezone, 'UTC'),
                CASE WHEN p_NextRunAt_Clear = TRUE THEN NULL ELSE COALESCE(p_NextRunAt, NULL) END,
                CASE WHEN p_LastRunAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRunAt, NULL) END,
                CASE WHEN p_LastRunStatus_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRunStatus, NULL) END,
                CASE WHEN p_LastResultHash_Clear = TRUE THEN NULL ELSE COALESCE(p_LastResultHash, NULL) END,
                COALESCE(p_NotifyCondition, 'Always'),
                COALESCE(p_NotifyViaInApp, TRUE),
                COALESCE(p_NotifyViaEmail, FALSE),
                CASE WHEN p_ConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationID, NULL) END,
                COALESCE(p_ScheduleMode, 'Recurring'),
                CASE WHEN p_WakeConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_WakeConfiguration, NULL) END,
                CASE WHEN p_LastCheckedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastCheckedAt, NULL) END,
                CASE WHEN p_AgentConfigurationID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentConfigurationID, NULL) END
            );
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwUserRoutines" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateUserRoutine'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateUserRoutine"(
    IN p_ID UUID,
    IN p_UserID UUID DEFAULT NULL,
    IN p_EnvironmentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EnvironmentID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_RoutineType VARCHAR(20) DEFAULT NULL,
    IN p_TargetType VARCHAR(20) DEFAULT NULL,
    IN p_TargetID UUID DEFAULT NULL,
    IN p_InitialMessage_Clear BOOLEAN DEFAULT FALSE,
    IN p_InitialMessage TEXT DEFAULT NULL,
    IN p_StartingPayload_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartingPayload TEXT DEFAULT NULL,
    IN p_RequestedSkillIDs_Clear BOOLEAN DEFAULT FALSE,
    IN p_RequestedSkillIDs TEXT DEFAULT NULL,
    IN p_CronExpression_Clear BOOLEAN DEFAULT FALSE,
    IN p_CronExpression VARCHAR(100) DEFAULT NULL,
    IN p_StartAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartAt TIMESTAMPTZ DEFAULT NULL,
    IN p_EndAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_EndAt TIMESTAMPTZ DEFAULT NULL,
    IN p_NotificationTemplateID_Clear BOOLEAN DEFAULT FALSE,
    IN p_NotificationTemplateID UUID DEFAULT NULL,
    IN p_Timezone VARCHAR(100) DEFAULT NULL,
    IN p_NextRunAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_NextRunAt TIMESTAMPTZ DEFAULT NULL,
    IN p_LastRunAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastRunAt TIMESTAMPTZ DEFAULT NULL,
    IN p_LastRunStatus_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastRunStatus VARCHAR(20) DEFAULT NULL,
    IN p_LastResultHash_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastResultHash VARCHAR(100) DEFAULT NULL,
    IN p_NotifyCondition VARCHAR(20) DEFAULT NULL,
    IN p_NotifyViaInApp BOOLEAN DEFAULT NULL,
    IN p_NotifyViaEmail BOOLEAN DEFAULT NULL,
    IN p_ConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationID UUID DEFAULT NULL,
    IN p_ScheduleMode VARCHAR(20) DEFAULT NULL,
    IN p_WakeConfiguration_Clear BOOLEAN DEFAULT FALSE,
    IN p_WakeConfiguration TEXT DEFAULT NULL,
    IN p_LastCheckedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastCheckedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_AgentConfigurationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentConfigurationID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwUserRoutines" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."UserRoutine"
    SET
        "UserID" = COALESCE(p_UserID, "UserID"),
        "EnvironmentID" = CASE WHEN p_EnvironmentID_Clear = TRUE THEN NULL ELSE COALESCE(p_EnvironmentID, "EnvironmentID") END,
        "Name" = COALESCE(p_Name, "Name"),
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "Status" = COALESCE(p_Status, "Status"),
        "RoutineType" = COALESCE(p_RoutineType, "RoutineType"),
        "TargetType" = COALESCE(p_TargetType, "TargetType"),
        "TargetID" = COALESCE(p_TargetID, "TargetID"),
        "InitialMessage" = CASE WHEN p_InitialMessage_Clear = TRUE THEN NULL ELSE COALESCE(p_InitialMessage, "InitialMessage") END,
        "StartingPayload" = CASE WHEN p_StartingPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_StartingPayload, "StartingPayload") END,
        "RequestedSkillIDs" = CASE WHEN p_RequestedSkillIDs_Clear = TRUE THEN NULL ELSE COALESCE(p_RequestedSkillIDs, "RequestedSkillIDs") END,
        "CronExpression" = CASE WHEN p_CronExpression_Clear = TRUE THEN NULL ELSE COALESCE(p_CronExpression, "CronExpression") END,
        "StartAt" = CASE WHEN p_StartAt_Clear = TRUE THEN NULL ELSE COALESCE(p_StartAt, "StartAt") END,
        "EndAt" = CASE WHEN p_EndAt_Clear = TRUE THEN NULL ELSE COALESCE(p_EndAt, "EndAt") END,
        "NotificationTemplateID" = CASE WHEN p_NotificationTemplateID_Clear = TRUE THEN NULL ELSE COALESCE(p_NotificationTemplateID, "NotificationTemplateID") END,
        "Timezone" = COALESCE(p_Timezone, "Timezone"),
        "NextRunAt" = CASE WHEN p_NextRunAt_Clear = TRUE THEN NULL ELSE COALESCE(p_NextRunAt, "NextRunAt") END,
        "LastRunAt" = CASE WHEN p_LastRunAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRunAt, "LastRunAt") END,
        "LastRunStatus" = CASE WHEN p_LastRunStatus_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRunStatus, "LastRunStatus") END,
        "LastResultHash" = CASE WHEN p_LastResultHash_Clear = TRUE THEN NULL ELSE COALESCE(p_LastResultHash, "LastResultHash") END,
        "NotifyCondition" = COALESCE(p_NotifyCondition, "NotifyCondition"),
        "NotifyViaInApp" = COALESCE(p_NotifyViaInApp, "NotifyViaInApp"),
        "NotifyViaEmail" = COALESCE(p_NotifyViaEmail, "NotifyViaEmail"),
        "ConversationID" = CASE WHEN p_ConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationID, "ConversationID") END,
        "ScheduleMode" = COALESCE(p_ScheduleMode, "ScheduleMode"),
        "WakeConfiguration" = CASE WHEN p_WakeConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_WakeConfiguration, "WakeConfiguration") END,
        "LastCheckedAt" = CASE WHEN p_LastCheckedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastCheckedAt, "LastCheckedAt") END,
        "AgentConfigurationID" = CASE WHEN p_AgentConfigurationID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentConfigurationID, "AgentConfigurationID") END,
        "__mj_UpdatedAt" = NOW()
    WHERE
        "ID" = p_ID;

    IF _v_row_count = 0 THEN
        SELECT * FROM __mj."vwUserRoutines" WHERE 1=0
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwUserRoutines" WHERE "ID" = p_ID;
LIMIT 0;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateAIAgentUserPolicy'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentUserPolicy"(
    IN p_ID UUID DEFAULT NULL,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_DisplayNameOverride_Clear BOOLEAN DEFAULT FALSE,
    IN p_DisplayNameOverride VARCHAR(100) DEFAULT NULL,
    IN p_PreferredPersonaID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PreferredPersonaID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_OnboardingStatus VARCHAR(20) DEFAULT NULL,
    IN p_OnboardedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_OnboardedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CoordinationMode VARCHAR(20) DEFAULT NULL,
    IN p_DefaultDataAccessMode VARCHAR(20) DEFAULT NULL,
    IN p_EmailChannelMode VARCHAR(20) DEFAULT NULL,
    IN p_PhoneChannelMode VARCHAR(20) DEFAULT NULL,
    IN p_MessagingChannelMode VARCHAR(20) DEFAULT NULL,
    IN p_CalendarChannelMode VARCHAR(30) DEFAULT NULL,
    IN p_AllowInterAgentCoordination BOOLEAN DEFAULT NULL,
    IN p_RequireApprovalForExternalComms BOOLEAN DEFAULT NULL,
    IN p_RequireApprovalForFinancials BOOLEAN DEFAULT NULL,
    IN p_RequireApprovalForDestructiveActions BOOLEAN DEFAULT NULL,
    IN p_AutoApproveAmountThreshold_Clear BOOLEAN DEFAULT FALSE,
    IN p_AutoApproveAmountThreshold NUMERIC(18,2) DEFAULT NULL,
    IN p_EntityAccessRules_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityAccessRules TEXT DEFAULT NULL,
    IN p_ActionPolicyRules_Clear BOOLEAN DEFAULT FALSE,
    IN p_ActionPolicyRules TEXT DEFAULT NULL,
    IN p_InstructionsOverride_Clear BOOLEAN DEFAULT FALSE,
    IN p_InstructionsOverride TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentUserPolicies" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        INSERT INTO __mj."AIAgentUserPolicy"
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
                "CalendarChannelMode",
                "AllowInterAgentCoordination",
                "RequireApprovalForExternalComms",
                "RequireApprovalForFinancials",
                "RequireApprovalForDestructiveActions",
                "AutoApproveAmountThreshold",
                "EntityAccessRules",
                "ActionPolicyRules",
                "InstructionsOverride"
            )
        VALUES
            (
                p_ID,
                p_AgentID,
                p_UserID,
                CASE WHEN p_DisplayNameOverride_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayNameOverride, NULL) END,
                CASE WHEN p_PreferredPersonaID_Clear = TRUE THEN NULL ELSE COALESCE(p_PreferredPersonaID, NULL) END,
                COALESCE(p_Status, 'Active'),
                COALESCE(p_OnboardingStatus, 'NotStarted'),
                CASE WHEN p_OnboardedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_OnboardedAt, NULL) END,
                COALESCE(p_CoordinationMode, 'Autonomous'),
                COALESCE(p_DefaultDataAccessMode, 'UserCeiling'),
                COALESCE(p_EmailChannelMode, 'DraftOnly'),
                COALESCE(p_PhoneChannelMode, 'Disabled'),
                COALESCE(p_MessagingChannelMode, 'Enabled'),
                COALESCE(p_CalendarChannelMode, 'ProposeWithApproval'),
                COALESCE(p_AllowInterAgentCoordination, TRUE),
                COALESCE(p_RequireApprovalForExternalComms, TRUE),
                COALESCE(p_RequireApprovalForFinancials, TRUE),
                COALESCE(p_RequireApprovalForDestructiveActions, TRUE),
                CASE WHEN p_AutoApproveAmountThreshold_Clear = TRUE THEN NULL ELSE COALESCE(p_AutoApproveAmountThreshold, NULL) END,
                CASE WHEN p_EntityAccessRules_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityAccessRules, NULL) END,
                CASE WHEN p_ActionPolicyRules_Clear = TRUE THEN NULL ELSE COALESCE(p_ActionPolicyRules, NULL) END,
                CASE WHEN p_InstructionsOverride_Clear = TRUE THEN NULL ELSE COALESCE(p_InstructionsOverride, NULL) END
            );
    ELSE
        INSERT INTO __mj."AIAgentUserPolicy"
            (
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
                "CalendarChannelMode",
                "AllowInterAgentCoordination",
                "RequireApprovalForExternalComms",
                "RequireApprovalForFinancials",
                "RequireApprovalForDestructiveActions",
                "AutoApproveAmountThreshold",
                "EntityAccessRules",
                "ActionPolicyRules",
                "InstructionsOverride"
            )
        VALUES
            (
                p_AgentID,
                p_UserID,
                CASE WHEN p_DisplayNameOverride_Clear = TRUE THEN NULL ELSE COALESCE(p_DisplayNameOverride, NULL) END,
                CASE WHEN p_PreferredPersonaID_Clear = TRUE THEN NULL ELSE COALESCE(p_PreferredPersonaID, NULL) END,
                COALESCE(p_Status, 'Active'),
                COALESCE(p_OnboardingStatus, 'NotStarted'),
                CASE WHEN p_OnboardedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_OnboardedAt, NULL) END,
                COALESCE(p_CoordinationMode, 'Autonomous'),
                COALESCE(p_DefaultDataAccessMode, 'UserCeiling'),
                COALESCE(p_EmailChannelMode, 'DraftOnly'),
                COALESCE(p_PhoneChannelMode, 'Disabled'),
                COALESCE(p_MessagingChannelMode, 'Enabled'),
                COALESCE(p_CalendarChannelMode, 'ProposeWithApproval'),
                COALESCE(p_AllowInterAgentCoordination, TRUE),
                COALESCE(p_RequireApprovalForExternalComms, TRUE),
                COALESCE(p_RequireApprovalForFinancials, TRUE),
                COALESCE(p_RequireApprovalForDestructiveActions, TRUE),
                CASE WHEN p_AutoApproveAmountThreshold_Clear = TRUE THEN NULL ELSE COALESCE(p_AutoApproveAmountThreshold, NULL) END,
                CASE WHEN p_EntityAccessRules_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityAccessRules, NULL) END,
                CASE WHEN p_ActionPolicyRules_Clear = TRUE THEN NULL ELSE COALESCE(p_ActionPolicyRules, NULL) END,
                CASE WHEN p_InstructionsOverride_Clear = TRUE THEN NULL ELSE COALESCE(p_InstructionsOverride, NULL) END
            );
    END IF;
    RETURN QUERY SELECT * FROM __mj."vwAIAgentUserPolicies" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

ALTER TABLE __mj."AIAgentUserPolicy"
  ALTER COLUMN "CoordinationMode" SET DEFAULT 'Autonomous';

ALTER TABLE __mj."AIAgentUserPolicy"
  ALTER COLUMN "CalendarChannelMode" SET DEFAULT 'ProposeWithApproval';

ALTER TABLE __mj."AIAgentUserPolicy"
  ALTER COLUMN "PhoneChannelMode" SET DEFAULT 'Disabled';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cd0276af-4431-47c1-85e6-a827367ab848' OR ("EntityID" = '9C0E4D6F-8F07-48F8-8372-3631DBC1B317' AND "Name" = 'DefaultAgentConfigurationID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'cd0276af-4431-47c1-85e6-a827367ab848',
        '9C0E4D6F-8F07-48F8-8372-3631DBC1B317', -- "Entity": "MJ": "AI" "Agent" "Rhythm" "Templates"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '9C0E4D6F-8F07-48F8-8372-3631DBC1B317'),
        'DefaultAgentConfigurationID',
        'Default Agent Configuration ID',
        'Optional default AI Configuration (model tier such as Fast, Standard, or High Power) seeded onto UserRoutine.AgentConfigurationID when this rhythm template is enabled and used as a fallback on wake.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        '6AE1BBF0-2085-4D2F-B724-219DC4212026',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0c17773e-a295-41b5-8404-b90ed739c5fd' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'AgentConfigurationID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '0c17773e-a295-41b5-8404-b90ed739c5fd',
        'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- "Entity": "MJ": "User" "Routines"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B'),
        'AgentConfigurationID',
        'Agent Configuration ID',
        'Optional AI Configuration (model tier such as Fast, Standard, or High Power) used when executing this routine''s Agent target. Seeded from the originating rhythm template''s DefaultAgentConfigurationID on creation and changeable by the user or agent.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        '6AE1BBF0-2085-4D2F-B724-219DC4212026',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '8c37e394-c2f5-451d-b805-b79d9e012ce9' OR ("EntityID" = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND "RelatedEntityID" = '9C0E4D6F-8F07-48F8-8372-3631DBC1B317' AND "RelatedEntityJoinField" = 'DefaultAgentConfigurationID')
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('8c37e394-c2f5-451d-b805-b79d9e012ce9', '6AE1BBF0-2085-4D2F-B724-219DC4212026', '9C0E4D6F-8F07-48F8-8372-3631DBC1B317', 'DefaultAgentConfigurationID', 'One To Many', TRUE, TRUE, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityRelationship" WHERE "EntityID" = '6AE1BBF0-2085-4D2F-B724-219DC4212026'), NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '89d462e5-e342-4ae3-babd-0247fd458624' OR ("EntityID" = '6AE1BBF0-2085-4D2F-B724-219DC4212026' AND "RelatedEntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "RelatedEntityJoinField" = 'AgentConfigurationID')
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('89d462e5-e342-4ae3-babd-0247fd458624', '6AE1BBF0-2085-4D2F-B724-219DC4212026', 'D6CA6018-D288-4F79-B6A9-168C75C3363B', 'AgentConfigurationID', 'One To Many', TRUE, TRUE, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityRelationship" WHERE "EntityID" = '6AE1BBF0-2085-4D2F-B724-219DC4212026'), NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '38e6b428-3af6-42eb-b34e-8c005c03f2bf' OR ("EntityID" = '9C0E4D6F-8F07-48F8-8372-3631DBC1B317' AND "Name" = 'DefaultAgentConfiguration')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '38e6b428-3af6-42eb-b34e-8c005c03f2bf',
        '9C0E4D6F-8F07-48F8-8372-3631DBC1B317', -- "Entity": "MJ": "AI" "Agent" "Rhythm" "Templates"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '9C0E4D6F-8F07-48F8-8372-3631DBC1B317'),
        'DefaultAgentConfiguration',
        'Default Agent Configuration',
        NULL,
        'nvarchar',
        200,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd866ae68-4f3d-4d41-8235-93bb57e70049' OR ("EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B' AND "Name" = 'AgentConfiguration')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'd866ae68-4f3d-4d41-8235-93bb57e70049',
        'D6CA6018-D288-4F79-B6A9-168C75C3363B', -- "Entity": "MJ": "User" "Routines"
        (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'D6CA6018-D288-4F79-B6A9-168C75C3363B'),
        'AgentConfiguration',
        'Agent Configuration',
        NULL,
        'nvarchar',
        200,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;


-- ===================== Grants =====================

DO $$ BEGIN REVOKE SELECT ON __mj."vwAIAgentRhythmTemplates" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj."vwAIAgentRhythmTemplates" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj."vwAIAgentRhythmTemplates" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentRhythmTemplates" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Agent Rhythm Templates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Rhythm Templates
-- Item: spCreateAIAgentRhythmTemplate
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRhythmTemplate" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Agent Rhythm Templates */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Rhythm Templates
-- Item: spUpdateAIAgentRhythmTemplate
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRhythmTemplate" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for UserRoutine */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routines
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN REVOKE SELECT ON __mj."vwUserRoutines" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj."vwUserRoutines" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE SELECT ON __mj."vwUserRoutines" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT SELECT ON __mj."vwUserRoutines" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: User Routines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routines
-- Item: spCreateUserRoutine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateUserRoutine" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: User Routines */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: User Routines
-- Item: spUpdateUserRoutine
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateUserRoutine" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert 2 virtual entity field(s) */

DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj."spCreateAIAgentUserPolicy" FROM "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj."spCreateAIAgentUserPolicy" FROM "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN REVOKE EXECUTE ON FUNCTION __mj."spCreateAIAgentUserPolicy" FROM "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentUserPolicy" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
-- ===================== Comments =====================

COMMENT ON COLUMN __mj."AIAgentRhythmTemplate"."DefaultAgentConfigurationID" IS 'Optional default AI Configuration (model tier such as Fast, Standard, or High Power) seeded onto UserRoutine.AgentConfigurationID when this rhythm template is enabled and used as a fallback on wake.';

COMMENT ON COLUMN __mj."UserRoutine"."AgentConfigurationID" IS 'Optional AI Configuration (model tier such as Fast, Standard, or High Power) used when executing this routine''s Agent target. Seeded from the originating rhythm template''s DefaultAgentConfigurationID on creation and changeable by the user or agent.';


-- ===================== Other =====================

/**************************************************************************************
 * EVERYTHING BELOW THIS BLOCK WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
 *
 * It registers the new MJ: AI Agent Rhythm Templates DefaultAgentConfigurationID and
 * MJ: User Routines AgentConfigurationID fields (and their virtual name fields) in
 * EntityField, creates EntityRelationship rows, creates FK indexes, and regenerates
 * vwAIAgentRhythmTemplates / vwUserRoutines views, spCreate/spUpdate procedures,
 * triggers, and permission grants.
 *
 * DO NOT EDIT BY HAND. If the DDL above changes, re-run CodeGen and replace this
 * entire section.
 **************************************************************************************/

/* SQL text to insert 2 new entity field(s) */
