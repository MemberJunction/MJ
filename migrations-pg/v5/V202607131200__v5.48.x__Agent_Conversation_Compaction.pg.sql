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


-- ===================== DDL: Tables, PKs, Indexes =====================

-- =====================================================================================
-- Agent Conversation Compaction & Recursive Context Access
-- =====================================================================================
-- Adds the durable, cross-turn conversation compaction layer + sequence-addressable
-- history for RLM-style retrieval tooling. See plans/agent-conversation-compaction.md.
--
-- This migration:
--   1. ConversationDetail
--        - Sequence            : stable, monotonic-per-conversation ordinal (the symbolic
--                                handle for retrieval tools + summary markers). Backfilled
--                                from __mj_CreatedAt order, assigned on insert by a trigger.
--        - SummaryPromptRunID  : FK -> AIPromptRun; links a populated
--                                SummaryOfEarlierConversation to the prompt run that made it.
--   2. AIAgentType  : gains the context-compression config it was missing (promoted from
--                     AIAgent as TYPE-LEVEL DEFAULTS) + new token-budget knobs. Percent
--                     knobs are NOT NULL DEFAULT so the type always provides a floor.
--   3. AIAgent      : gains ONLY the new token-budget knobs (it already owns the
--                     compression trio). All nullable => NULL means "inherit from type".
--   4. AIAgentRunStep.StepType : widened to include 'Compaction' so the cross-turn summary
--                                prompt run is recorded as a step in the agent run lifecycle.
--
-- Resolution at runtime: Agent value ?? AgentType value ?? (for ContextWindowMaxTokens)
-- model MaxInputTokens. Effective budget is clamped to the model and a warning is logged.
--
-- NOTE: Views / EntityField metadata / stored procedures are handled by CodeGen. This file
--       contains DDL + extended properties only.
-- =====================================================================================

-- =====================================================================================
-- 1. ConversationDetail : new columns
-- =====================================================================================
ALTER TABLE __mj."ConversationDetail"
 ADD COLUMN IF NOT EXISTS "Sequence"           INTEGER NULL,
 ADD COLUMN IF NOT EXISTS "SummaryPromptRunID" UUID NULL;

-- =====================================================================================
-- 2. AIAgentType : context-compression defaults (promoted from AIAgent) + token knobs
-- =====================================================================================
ALTER TABLE __mj."AIAgentType"
 ADD COLUMN IF NOT EXISTS "ContextCompressionMessageThreshold"      INTEGER NULL,
 ADD COLUMN IF NOT EXISTS "ContextCompressionPromptID"              UUID NULL,
 ADD COLUMN IF NOT EXISTS "ContextCompressionMessageRetentionCount" INTEGER NULL,
 ADD COLUMN IF NOT EXISTS "ContextWindowMaxTokens"                  INTEGER NULL,
 ADD COLUMN IF NOT EXISTS "CompactionTriggerPercent"                INTEGER NOT NULL CONSTRAINT "DF_AIAgentType_CompactionTriggerPercent" DEFAULT (75),
 ADD COLUMN IF NOT EXISTS "CompactionTargetPercent"                 INTEGER NOT NULL CONSTRAINT "DF_AIAgentType_CompactionTargetPercent"  DEFAULT (30),
 ADD COLUMN IF NOT EXISTS "ConversationSummaryPromptID"             UUID NULL;

-- =====================================================================================
-- 3. AIAgent : new token knobs only (trio already exists). All nullable => inherit.
-- =====================================================================================
ALTER TABLE __mj."AIAgent"
 ADD COLUMN IF NOT EXISTS "ContextWindowMaxTokens"      INTEGER NULL,
 ADD COLUMN IF NOT EXISTS "CompactionTriggerPercent"    INTEGER NULL,
 ADD COLUMN IF NOT EXISTS "CompactionTargetPercent"     INTEGER NULL,
 ADD COLUMN IF NOT EXISTS "ConversationSummaryPromptID" UUID NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentType_SystemPromptID" ON __mj."AIAgentType" ("SystemPromptID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentType_DefaultStorageAccountID" ON __mj."AIAgentType" ("DefaultStorageAccountID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentType_ContextCompressionPromptID" ON __mj."AIAgentType" ("ContextCompressionPromptID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentType_ConversationSummaryPromptID" ON __mj."AIAgentType" ("ConversationSummaryPromptID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetail_ConversationID" ON __mj."ConversationDetail" ("ConversationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetail_UserID" ON __mj."ConversationDetail" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactID" ON __mj."ConversationDetail" ("ArtifactID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactVersionID" ON __mj."ConversationDetail" ("ArtifactVersionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetail_ParentID" ON __mj."ConversationDetail" ("ParentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetail_AgentID" ON __mj."ConversationDetail" ("AgentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetail_TestRunID" ON __mj."ConversationDetail" ("TestRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetail_AgentSessionID" ON __mj."ConversationDetail" ("AgentSessionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetail_SummaryPromptRunID" ON __mj."ConversationDetail" ("SummaryPromptRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_ParentID" ON __mj."AIAgent" ("ParentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID" ON __mj."AIAgent" ("ContextCompressionPromptID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_TypeID" ON __mj."AIAgent" ("TypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_DefaultArtifactTypeID" ON __mj."AIAgent" ("DefaultArtifactTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_OwnerUserID" ON __mj."AIAgent" ("OwnerUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_AttachmentStorageProviderID" ON __mj."AIAgent" ("AttachmentStorageProviderID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_CategoryID" ON __mj."AIAgent" ("CategoryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_DefaultStorageAccountID" ON __mj."AIAgent" ("DefaultStorageAccountID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_DefaultCoAgentID" ON __mj."AIAgent" ("DefaultCoAgentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_RecordingStorageProviderID" ON __mj."AIAgent" ("RecordingStorageProviderID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_DefaultMediaCollectionID" ON __mj."AIAgent" ("DefaultMediaCollectionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_ConversationSummaryPromptID" ON __mj."AIAgent" ("ConversationSummaryPromptID");


-- ===================== Helper Functions (fn*) =====================

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'fnConversationDetailParentID_GetRootID'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."fnConversationDetailParentID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."ConversationDetail"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."ConversationDetail" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"

LIMIT 1
$$ LANGUAGE sql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'fnAIAgentParentID_GetRootID'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."fnAIAgentParentID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIAgent"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIAgent" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"

LIMIT 1
$$ LANGUAGE sql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'fnAIAgentDefaultCoAgentID_GetRootID'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."fnAIAgentDefaultCoAgentID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "DefaultCoAgentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIAgent"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."DefaultCoAgentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIAgent" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."DefaultCoAgentID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "DefaultCoAgentID" IS NULL
    ORDER BY
        "RootParentID"

LIMIT 1
$$ LANGUAGE sql;


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwAIAgentTypes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentTypes"
AS SELECT
    a.*,
    "MJAIPrompt_SystemPromptID"."Name" AS "SystemPrompt",
    "MJFileStorageAccount_DefaultStorageAccountID"."Name" AS "DefaultStorageAccount",
    "MJAIPrompt_ContextCompressionPromptID"."Name" AS "ContextCompressionPrompt",
    "MJAIPrompt_ConversationSummaryPromptID"."Name" AS "ConversationSummaryPrompt"
FROM
    __mj."AIAgentType" AS a
LEFT OUTER JOIN
    __mj."AIPrompt" AS "MJAIPrompt_SystemPromptID"
  ON
    a."SystemPromptID" = "MJAIPrompt_SystemPromptID"."ID"
LEFT OUTER JOIN
    __mj."FileStorageAccount" AS "MJFileStorageAccount_DefaultStorageAccountID"
  ON
    a."DefaultStorageAccountID" = "MJFileStorageAccount_DefaultStorageAccountID"."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS "MJAIPrompt_ContextCompressionPromptID"
  ON
    a."ContextCompressionPromptID" = "MJAIPrompt_ContextCompressionPromptID"."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS "MJAIPrompt_ConversationSummaryPromptID"
  ON
    a."ConversationSummaryPromptID" = "MJAIPrompt_ConversationSummaryPromptID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwConversationDetails';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationDetails"
AS SELECT
    c.*,
    "MJConversation_ConversationID"."Name" AS "Conversation",
    "MJUser_UserID"."Name" AS "User",
    "MJConversationArtifact_ArtifactID"."Name" AS "Artifact",
    "MJConversationArtifactVersion_ArtifactVersionID"."ConversationArtifact" AS "ArtifactVersion",
    "MJConversationDetail_ParentID"."ExternalID" AS "Parent",
    "MJAIAgent_AgentID"."Name" AS "Agent",
    "MJTestRun_TestRunID"."Test" AS "TestRun",
    "MJAIPromptRun_SummaryPromptRunID"."RunName" AS "SummaryPromptRun",
    "root_ParentID"."RootID" AS "RootParentID"
FROM
    __mj."ConversationDetail" AS c
INNER JOIN
    __mj."Conversation" AS "MJConversation_ConversationID"
  ON
    c."ConversationID" = "MJConversation_ConversationID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    c."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."ConversationArtifact" AS "MJConversationArtifact_ArtifactID"
  ON
    c."ArtifactID" = "MJConversationArtifact_ArtifactID"."ID"
LEFT OUTER JOIN
    __mj."vwConversationArtifactVersions" AS "MJConversationArtifactVersion_ArtifactVersionID"
  ON
    c."ArtifactVersionID" = "MJConversationArtifactVersion_ArtifactVersionID"."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS "MJConversationDetail_ParentID"
  ON
    c."ParentID" = "MJConversationDetail_ParentID"."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS "MJAIAgent_AgentID"
  ON
    c."AgentID" = "MJAIAgent_AgentID"."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" AS "MJTestRun_TestRunID"
  ON
    c."TestRunID" = "MJTestRun_TestRunID"."ID"
LEFT OUTER JOIN
    __mj."AIPromptRun" AS "MJAIPromptRun_SummaryPromptRunID"
  ON
    c."SummaryPromptRunID" = "MJAIPromptRun_SummaryPromptRunID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnConversationDetailParentID_GetRootID"(c."ID", c."ParentID")) AS "root_ParentID"
    ON TRUE$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwAIAgents';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgents"
AS SELECT
    a.*,
    "MJAIAgent_ParentID"."Name" AS "Parent",
    "MJAIPrompt_ContextCompressionPromptID"."Name" AS "ContextCompressionPrompt",
    "MJAIAgentType_TypeID"."Name" AS "Type",
    "MJArtifactType_DefaultArtifactTypeID"."Name" AS "DefaultArtifactType",
    "MJUser_OwnerUserID"."Name" AS "OwnerUser",
    "MJFileStorageProvider_AttachmentStorageProviderID"."Name" AS "AttachmentStorageProvider",
    "MJAIAgentCategory_CategoryID"."Name" AS "Category",
    "MJFileStorageAccount_DefaultStorageAccountID"."Name" AS "DefaultStorageAccount",
    "MJAIAgent_DefaultCoAgentID"."Name" AS "DefaultCoAgent",
    "MJFileStorageProvider_RecordingStorageProviderID"."Name" AS "RecordingStorageProvider",
    "MJCollection_DefaultMediaCollectionID"."Name" AS "DefaultMediaCollection",
    "MJAIPrompt_ConversationSummaryPromptID"."Name" AS "ConversationSummaryPrompt",
    "root_ParentID"."RootID" AS "RootParentID",
    "root_DefaultCoAgentID"."RootID" AS "RootDefaultCoAgentID"
FROM
    __mj."AIAgent" AS a
LEFT OUTER JOIN
    __mj."AIAgent" AS "MJAIAgent_ParentID"
  ON
    a."ParentID" = "MJAIAgent_ParentID"."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS "MJAIPrompt_ContextCompressionPromptID"
  ON
    a."ContextCompressionPromptID" = "MJAIPrompt_ContextCompressionPromptID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentType" AS "MJAIAgentType_TypeID"
  ON
    a."TypeID" = "MJAIAgentType_TypeID"."ID"
LEFT OUTER JOIN
    __mj."ArtifactType" AS "MJArtifactType_DefaultArtifactTypeID"
  ON
    a."DefaultArtifactTypeID" = "MJArtifactType_DefaultArtifactTypeID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_OwnerUserID"
  ON
    a."OwnerUserID" = "MJUser_OwnerUserID"."ID"
LEFT OUTER JOIN
    __mj."FileStorageProvider" AS "MJFileStorageProvider_AttachmentStorageProviderID"
  ON
    a."AttachmentStorageProviderID" = "MJFileStorageProvider_AttachmentStorageProviderID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentCategory" AS "MJAIAgentCategory_CategoryID"
  ON
    a."CategoryID" = "MJAIAgentCategory_CategoryID"."ID"
LEFT OUTER JOIN
    __mj."FileStorageAccount" AS "MJFileStorageAccount_DefaultStorageAccountID"
  ON
    a."DefaultStorageAccountID" = "MJFileStorageAccount_DefaultStorageAccountID"."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS "MJAIAgent_DefaultCoAgentID"
  ON
    a."DefaultCoAgentID" = "MJAIAgent_DefaultCoAgentID"."ID"
LEFT OUTER JOIN
    __mj."FileStorageProvider" AS "MJFileStorageProvider_RecordingStorageProviderID"
  ON
    a."RecordingStorageProviderID" = "MJFileStorageProvider_RecordingStorageProviderID"."ID"
LEFT OUTER JOIN
    __mj."Collection" AS "MJCollection_DefaultMediaCollectionID"
  ON
    a."DefaultMediaCollectionID" = "MJCollection_DefaultMediaCollectionID"."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS "MJAIPrompt_ConversationSummaryPromptID"
  ON
    a."ConversationSummaryPromptID" = "MJAIPrompt_ConversationSummaryPromptID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnAIAgentParentID_GetRootID"(a."ID", a."ParentID")) AS "root_ParentID"
    ON TRUE
LEFT JOIN LATERAL (SELECT * FROM __mj."fnAIAgentDefaultCoAgentID_GetRootID"(a."ID", a."DefaultCoAgentID")) AS "root_DefaultCoAgentID"
    ON TRUE$vsql$;
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
           WHERE proname = 'spCreateAIAgentType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentType"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(100) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_SystemPromptID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SystemPromptID UUID DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL,
    IN p_AgentPromptPlaceholder_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentPromptPlaceholder VARCHAR(255) DEFAULT NULL,
    IN p_DriverClass_Clear BOOLEAN DEFAULT FALSE,
    IN p_DriverClass VARCHAR(255) DEFAULT NULL,
    IN p_UIFormSectionKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_UIFormSectionKey VARCHAR(500) DEFAULT NULL,
    IN p_UIFormKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_UIFormKey VARCHAR(500) DEFAULT NULL,
    IN p_UIFormSectionExpandedByDefault BOOLEAN DEFAULT NULL,
    IN p_PromptParamsSchema_Clear BOOLEAN DEFAULT FALSE,
    IN p_PromptParamsSchema TEXT DEFAULT NULL,
    IN p_AssignmentStrategy_Clear BOOLEAN DEFAULT FALSE,
    IN p_AssignmentStrategy TEXT DEFAULT NULL,
    IN p_DefaultStorageAccountID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultStorageAccountID UUID DEFAULT NULL,
    IN p_ConfigSchema_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConfigSchema TEXT DEFAULT NULL,
    IN p_DefaultConfiguration_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultConfiguration TEXT DEFAULT NULL,
    IN p_ContextCompressionMessageThreshold_Clear BOOLEAN DEFAULT FALSE,
    IN p_ContextCompressionMessageThreshold INTEGER DEFAULT NULL,
    IN p_ContextCompressionPromptID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ContextCompressionPromptID UUID DEFAULT NULL,
    IN p_ContextCompressionMessageRetentionCount_Clear BOOLEAN DEFAULT FALSE,
    IN p_ContextCompressionMessageRetentionCount INTEGER DEFAULT NULL,
    IN p_ContextWindowMaxTokens_Clear BOOLEAN DEFAULT FALSE,
    IN p_ContextWindowMaxTokens INTEGER DEFAULT NULL,
    IN p_CompactionTriggerPercent INTEGER DEFAULT NULL,
    IN p_CompactionTargetPercent INTEGER DEFAULT NULL,
    IN p_ConversationSummaryPromptID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationSummaryPromptID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentTypes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIAgentType"
            (
                "ID",
                "Name",
                "Description",
                "SystemPromptID",
                "IsActive",
                "AgentPromptPlaceholder",
                "DriverClass",
                "UIFormSectionKey",
                "UIFormKey",
                "UIFormSectionExpandedByDefault",
                "PromptParamsSchema",
                "AssignmentStrategy",
                "DefaultStorageAccountID",
                "ConfigSchema",
                "DefaultConfiguration",
                "ContextCompressionMessageThreshold",
                "ContextCompressionPromptID",
                "ContextCompressionMessageRetentionCount",
                "ContextWindowMaxTokens",
                "CompactionTriggerPercent",
                "CompactionTargetPercent",
                "ConversationSummaryPromptID"
            )
        VALUES
            (
                p_ID,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_SystemPromptID_Clear = TRUE THEN NULL ELSE COALESCE(p_SystemPromptID, NULL) END,
                COALESCE(p_IsActive, TRUE),
                CASE WHEN p_AgentPromptPlaceholder_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentPromptPlaceholder, NULL) END,
                CASE WHEN p_DriverClass_Clear = TRUE THEN NULL ELSE COALESCE(p_DriverClass, NULL) END,
                CASE WHEN p_UIFormSectionKey_Clear = TRUE THEN NULL ELSE COALESCE(p_UIFormSectionKey, NULL) END,
                CASE WHEN p_UIFormKey_Clear = TRUE THEN NULL ELSE COALESCE(p_UIFormKey, NULL) END,
                COALESCE(p_UIFormSectionExpandedByDefault, TRUE),
                CASE WHEN p_PromptParamsSchema_Clear = TRUE THEN NULL ELSE COALESCE(p_PromptParamsSchema, NULL) END,
                CASE WHEN p_AssignmentStrategy_Clear = TRUE THEN NULL ELSE COALESCE(p_AssignmentStrategy, NULL) END,
                CASE WHEN p_DefaultStorageAccountID_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultStorageAccountID, NULL) END,
                CASE WHEN p_ConfigSchema_Clear = TRUE THEN NULL ELSE COALESCE(p_ConfigSchema, NULL) END,
                CASE WHEN p_DefaultConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultConfiguration, NULL) END,
                CASE WHEN p_ContextCompressionMessageThreshold_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionMessageThreshold, NULL) END,
                CASE WHEN p_ContextCompressionPromptID_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionPromptID, NULL) END,
                CASE WHEN p_ContextCompressionMessageRetentionCount_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionMessageRetentionCount, NULL) END,
                CASE WHEN p_ContextWindowMaxTokens_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextWindowMaxTokens, NULL) END,
                COALESCE(p_CompactionTriggerPercent, 75),
                COALESCE(p_CompactionTargetPercent, 30),
                CASE WHEN p_ConversationSummaryPromptID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationSummaryPromptID, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIAgentType"
            (
                "Name",
                "Description",
                "SystemPromptID",
                "IsActive",
                "AgentPromptPlaceholder",
                "DriverClass",
                "UIFormSectionKey",
                "UIFormKey",
                "UIFormSectionExpandedByDefault",
                "PromptParamsSchema",
                "AssignmentStrategy",
                "DefaultStorageAccountID",
                "ConfigSchema",
                "DefaultConfiguration",
                "ContextCompressionMessageThreshold",
                "ContextCompressionPromptID",
                "ContextCompressionMessageRetentionCount",
                "ContextWindowMaxTokens",
                "CompactionTriggerPercent",
                "CompactionTargetPercent",
                "ConversationSummaryPromptID"
            )
        VALUES
            (
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_SystemPromptID_Clear = TRUE THEN NULL ELSE COALESCE(p_SystemPromptID, NULL) END,
                COALESCE(p_IsActive, TRUE),
                CASE WHEN p_AgentPromptPlaceholder_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentPromptPlaceholder, NULL) END,
                CASE WHEN p_DriverClass_Clear = TRUE THEN NULL ELSE COALESCE(p_DriverClass, NULL) END,
                CASE WHEN p_UIFormSectionKey_Clear = TRUE THEN NULL ELSE COALESCE(p_UIFormSectionKey, NULL) END,
                CASE WHEN p_UIFormKey_Clear = TRUE THEN NULL ELSE COALESCE(p_UIFormKey, NULL) END,
                COALESCE(p_UIFormSectionExpandedByDefault, TRUE),
                CASE WHEN p_PromptParamsSchema_Clear = TRUE THEN NULL ELSE COALESCE(p_PromptParamsSchema, NULL) END,
                CASE WHEN p_AssignmentStrategy_Clear = TRUE THEN NULL ELSE COALESCE(p_AssignmentStrategy, NULL) END,
                CASE WHEN p_DefaultStorageAccountID_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultStorageAccountID, NULL) END,
                CASE WHEN p_ConfigSchema_Clear = TRUE THEN NULL ELSE COALESCE(p_ConfigSchema, NULL) END,
                CASE WHEN p_DefaultConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultConfiguration, NULL) END,
                CASE WHEN p_ContextCompressionMessageThreshold_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionMessageThreshold, NULL) END,
                CASE WHEN p_ContextCompressionPromptID_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionPromptID, NULL) END,
                CASE WHEN p_ContextCompressionMessageRetentionCount_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionMessageRetentionCount, NULL) END,
                CASE WHEN p_ContextWindowMaxTokens_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextWindowMaxTokens, NULL) END,
                COALESCE(p_CompactionTriggerPercent, 75),
                COALESCE(p_CompactionTargetPercent, 30),
                CASE WHEN p_ConversationSummaryPromptID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationSummaryPromptID, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIAgentTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIAgentType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentType"(
    IN p_ID UUID,
    IN p_Name VARCHAR(100) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_SystemPromptID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SystemPromptID UUID DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL,
    IN p_AgentPromptPlaceholder_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentPromptPlaceholder VARCHAR(255) DEFAULT NULL,
    IN p_DriverClass_Clear BOOLEAN DEFAULT FALSE,
    IN p_DriverClass VARCHAR(255) DEFAULT NULL,
    IN p_UIFormSectionKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_UIFormSectionKey VARCHAR(500) DEFAULT NULL,
    IN p_UIFormKey_Clear BOOLEAN DEFAULT FALSE,
    IN p_UIFormKey VARCHAR(500) DEFAULT NULL,
    IN p_UIFormSectionExpandedByDefault BOOLEAN DEFAULT NULL,
    IN p_PromptParamsSchema_Clear BOOLEAN DEFAULT FALSE,
    IN p_PromptParamsSchema TEXT DEFAULT NULL,
    IN p_AssignmentStrategy_Clear BOOLEAN DEFAULT FALSE,
    IN p_AssignmentStrategy TEXT DEFAULT NULL,
    IN p_DefaultStorageAccountID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultStorageAccountID UUID DEFAULT NULL,
    IN p_ConfigSchema_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConfigSchema TEXT DEFAULT NULL,
    IN p_DefaultConfiguration_Clear BOOLEAN DEFAULT FALSE,
    IN p_DefaultConfiguration TEXT DEFAULT NULL,
    IN p_ContextCompressionMessageThreshold_Clear BOOLEAN DEFAULT FALSE,
    IN p_ContextCompressionMessageThreshold INTEGER DEFAULT NULL,
    IN p_ContextCompressionPromptID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ContextCompressionPromptID UUID DEFAULT NULL,
    IN p_ContextCompressionMessageRetentionCount_Clear BOOLEAN DEFAULT FALSE,
    IN p_ContextCompressionMessageRetentionCount INTEGER DEFAULT NULL,
    IN p_ContextWindowMaxTokens_Clear BOOLEAN DEFAULT FALSE,
    IN p_ContextWindowMaxTokens INTEGER DEFAULT NULL,
    IN p_CompactionTriggerPercent INTEGER DEFAULT NULL,
    IN p_CompactionTargetPercent INTEGER DEFAULT NULL,
    IN p_ConversationSummaryPromptID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationSummaryPromptID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentTypes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIAgentType"
    SET
        "Name" = COALESCE(p_Name, "Name"),
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "SystemPromptID" = CASE WHEN p_SystemPromptID_Clear = TRUE THEN NULL ELSE COALESCE(p_SystemPromptID, "SystemPromptID") END,
        "IsActive" = COALESCE(p_IsActive, "IsActive"),
        "AgentPromptPlaceholder" = CASE WHEN p_AgentPromptPlaceholder_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentPromptPlaceholder, "AgentPromptPlaceholder") END,
        "DriverClass" = CASE WHEN p_DriverClass_Clear = TRUE THEN NULL ELSE COALESCE(p_DriverClass, "DriverClass") END,
        "UIFormSectionKey" = CASE WHEN p_UIFormSectionKey_Clear = TRUE THEN NULL ELSE COALESCE(p_UIFormSectionKey, "UIFormSectionKey") END,
        "UIFormKey" = CASE WHEN p_UIFormKey_Clear = TRUE THEN NULL ELSE COALESCE(p_UIFormKey, "UIFormKey") END,
        "UIFormSectionExpandedByDefault" = COALESCE(p_UIFormSectionExpandedByDefault, "UIFormSectionExpandedByDefault"),
        "PromptParamsSchema" = CASE WHEN p_PromptParamsSchema_Clear = TRUE THEN NULL ELSE COALESCE(p_PromptParamsSchema, "PromptParamsSchema") END,
        "AssignmentStrategy" = CASE WHEN p_AssignmentStrategy_Clear = TRUE THEN NULL ELSE COALESCE(p_AssignmentStrategy, "AssignmentStrategy") END,
        "DefaultStorageAccountID" = CASE WHEN p_DefaultStorageAccountID_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultStorageAccountID, "DefaultStorageAccountID") END,
        "ConfigSchema" = CASE WHEN p_ConfigSchema_Clear = TRUE THEN NULL ELSE COALESCE(p_ConfigSchema, "ConfigSchema") END,
        "DefaultConfiguration" = CASE WHEN p_DefaultConfiguration_Clear = TRUE THEN NULL ELSE COALESCE(p_DefaultConfiguration, "DefaultConfiguration") END,
        "ContextCompressionMessageThreshold" = CASE WHEN p_ContextCompressionMessageThreshold_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionMessageThreshold, "ContextCompressionMessageThreshold") END,
        "ContextCompressionPromptID" = CASE WHEN p_ContextCompressionPromptID_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionPromptID, "ContextCompressionPromptID") END,
        "ContextCompressionMessageRetentionCount" = CASE WHEN p_ContextCompressionMessageRetentionCount_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextCompressionMessageRetentionCount, "ContextCompressionMessageRetentionCount") END,
        "ContextWindowMaxTokens" = CASE WHEN p_ContextWindowMaxTokens_Clear = TRUE THEN NULL ELSE COALESCE(p_ContextWindowMaxTokens, "ContextWindowMaxTokens") END,
        "CompactionTriggerPercent" = COALESCE(p_CompactionTriggerPercent, "CompactionTriggerPercent"),
        "CompactionTargetPercent" = COALESCE(p_CompactionTargetPercent, "CompactionTargetPercent"),
        "ConversationSummaryPromptID" = CASE WHEN p_ConversationSummaryPromptID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationSummaryPromptID, "ConversationSummaryPromptID") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIAgentTypes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIAgentTypes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentType'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentType"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateConversationDetail'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetail"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ConversationID UUID DEFAULT NULL,
    IN p_ExternalID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalID VARCHAR(100) DEFAULT NULL,
    IN p_Role VARCHAR(20) DEFAULT NULL,
    IN p_Message TEXT DEFAULT NULL,
    IN p_Error_Clear BOOLEAN DEFAULT FALSE,
    IN p_Error TEXT DEFAULT NULL,
    IN p_HiddenToUser BOOLEAN DEFAULT NULL,
    IN p_UserRating_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserRating INTEGER DEFAULT NULL,
    IN p_UserFeedback_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserFeedback TEXT DEFAULT NULL,
    IN p_ReflectionInsights_Clear BOOLEAN DEFAULT FALSE,
    IN p_ReflectionInsights TEXT DEFAULT NULL,
    IN p_SummaryOfEarlierConversation_Clear BOOLEAN DEFAULT FALSE,
    IN p_SummaryOfEarlierConversation TEXT DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_ArtifactID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ArtifactID UUID DEFAULT NULL,
    IN p_ArtifactVersionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ArtifactVersionID UUID DEFAULT NULL,
    IN p_CompletionTime_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompletionTime BIGINT DEFAULT NULL,
    IN p_IsPinned BOOLEAN DEFAULT NULL,
    IN p_ParentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_AgentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_SuggestedResponses_Clear BOOLEAN DEFAULT FALSE,
    IN p_SuggestedResponses TEXT DEFAULT NULL,
    IN p_TestRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TestRunID UUID DEFAULT NULL,
    IN p_ResponseForm_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResponseForm TEXT DEFAULT NULL,
    IN p_ActionableCommands_Clear BOOLEAN DEFAULT FALSE,
    IN p_ActionableCommands TEXT DEFAULT NULL,
    IN p_AutomaticCommands_Clear BOOLEAN DEFAULT FALSE,
    IN p_AutomaticCommands TEXT DEFAULT NULL,
    IN p_OriginalMessageChanged BOOLEAN DEFAULT NULL,
    IN p_AgentSessionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentSessionID UUID DEFAULT NULL,
    IN p_TurnEndedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_TurnEndedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_UtteranceStartMs_Clear BOOLEAN DEFAULT FALSE,
    IN p_UtteranceStartMs INTEGER DEFAULT NULL,
    IN p_UtteranceEndMs_Clear BOOLEAN DEFAULT FALSE,
    IN p_UtteranceEndMs INTEGER DEFAULT NULL,
    IN p_MediaType_Clear BOOLEAN DEFAULT FALSE,
    IN p_MediaType VARCHAR(20) DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_SummaryPromptRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SummaryPromptRunID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwConversationDetails" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ConversationDetail"
            (
                "ID",
                "ConversationID",
                "ExternalID",
                "Role",
                "Message",
                "Error",
                "HiddenToUser",
                "UserRating",
                "UserFeedback",
                "ReflectionInsights",
                "SummaryOfEarlierConversation",
                "UserID",
                "ArtifactID",
                "ArtifactVersionID",
                "CompletionTime",
                "IsPinned",
                "ParentID",
                "AgentID",
                "Status",
                "SuggestedResponses",
                "TestRunID",
                "ResponseForm",
                "ActionableCommands",
                "AutomaticCommands",
                "OriginalMessageChanged",
                "AgentSessionID",
                "TurnEndedAt",
                "UtteranceStartMs",
                "UtteranceEndMs",
                "MediaType",
                "Sequence",
                "SummaryPromptRunID"
            )
        VALUES
            (
                p_ID,
                p_ConversationID,
                CASE WHEN p_ExternalID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalID, NULL) END,
                COALESCE(p_Role, current_user),
                p_Message,
                CASE WHEN p_Error_Clear = TRUE THEN NULL ELSE COALESCE(p_Error, NULL) END,
                COALESCE(p_HiddenToUser, FALSE),
                CASE WHEN p_UserRating_Clear = TRUE THEN NULL ELSE COALESCE(p_UserRating, NULL) END,
                CASE WHEN p_UserFeedback_Clear = TRUE THEN NULL ELSE COALESCE(p_UserFeedback, NULL) END,
                CASE WHEN p_ReflectionInsights_Clear = TRUE THEN NULL ELSE COALESCE(p_ReflectionInsights, NULL) END,
                CASE WHEN p_SummaryOfEarlierConversation_Clear = TRUE THEN NULL ELSE COALESCE(p_SummaryOfEarlierConversation, NULL) END,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_ArtifactID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactID, NULL) END,
                CASE WHEN p_ArtifactVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactVersionID, NULL) END,
                CASE WHEN p_CompletionTime_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletionTime, NULL) END,
                COALESCE(p_IsPinned, FALSE),
                CASE WHEN p_ParentID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentID, NULL) END,
                CASE WHEN p_AgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentID, NULL) END,
                COALESCE(p_Status, 'Complete'),
                CASE WHEN p_SuggestedResponses_Clear = TRUE THEN NULL ELSE COALESCE(p_SuggestedResponses, NULL) END,
                CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, NULL) END,
                CASE WHEN p_ResponseForm_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseForm, NULL) END,
                CASE WHEN p_ActionableCommands_Clear = TRUE THEN NULL ELSE COALESCE(p_ActionableCommands, NULL) END,
                CASE WHEN p_AutomaticCommands_Clear = TRUE THEN NULL ELSE COALESCE(p_AutomaticCommands, NULL) END,
                COALESCE(p_OriginalMessageChanged, FALSE),
                CASE WHEN p_AgentSessionID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentSessionID, NULL) END,
                CASE WHEN p_TurnEndedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_TurnEndedAt, NULL) END,
                CASE WHEN p_UtteranceStartMs_Clear = TRUE THEN NULL ELSE COALESCE(p_UtteranceStartMs, NULL) END,
                CASE WHEN p_UtteranceEndMs_Clear = TRUE THEN NULL ELSE COALESCE(p_UtteranceEndMs, NULL) END,
                CASE WHEN p_MediaType_Clear = TRUE THEN NULL ELSE COALESCE(p_MediaType, NULL) END,
                COALESCE(p_Sequence, 0),
                CASE WHEN p_SummaryPromptRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_SummaryPromptRunID, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ConversationDetail"
            (
                "ConversationID",
                "ExternalID",
                "Role",
                "Message",
                "Error",
                "HiddenToUser",
                "UserRating",
                "UserFeedback",
                "ReflectionInsights",
                "SummaryOfEarlierConversation",
                "UserID",
                "ArtifactID",
                "ArtifactVersionID",
                "CompletionTime",
                "IsPinned",
                "ParentID",
                "AgentID",
                "Status",
                "SuggestedResponses",
                "TestRunID",
                "ResponseForm",
                "ActionableCommands",
                "AutomaticCommands",
                "OriginalMessageChanged",
                "AgentSessionID",
                "TurnEndedAt",
                "UtteranceStartMs",
                "UtteranceEndMs",
                "MediaType",
                "Sequence",
                "SummaryPromptRunID"
            )
        VALUES
            (
                p_ConversationID,
                CASE WHEN p_ExternalID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalID, NULL) END,
                COALESCE(p_Role, current_user),
                p_Message,
                CASE WHEN p_Error_Clear = TRUE THEN NULL ELSE COALESCE(p_Error, NULL) END,
                COALESCE(p_HiddenToUser, FALSE),
                CASE WHEN p_UserRating_Clear = TRUE THEN NULL ELSE COALESCE(p_UserRating, NULL) END,
                CASE WHEN p_UserFeedback_Clear = TRUE THEN NULL ELSE COALESCE(p_UserFeedback, NULL) END,
                CASE WHEN p_ReflectionInsights_Clear = TRUE THEN NULL ELSE COALESCE(p_ReflectionInsights, NULL) END,
                CASE WHEN p_SummaryOfEarlierConversation_Clear = TRUE THEN NULL ELSE COALESCE(p_SummaryOfEarlierConversation, NULL) END,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_ArtifactID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactID, NULL) END,
                CASE WHEN p_ArtifactVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactVersionID, NULL) END,
                CASE WHEN p_CompletionTime_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletionTime, NULL) END,
                COALESCE(p_IsPinned, FALSE),
                CASE WHEN p_ParentID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentID, NULL) END,
                CASE WHEN p_AgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentID, NULL) END,
                COALESCE(p_Status, 'Complete'),
                CASE WHEN p_SuggestedResponses_Clear = TRUE THEN NULL ELSE COALESCE(p_SuggestedResponses, NULL) END,
                CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, NULL) END,
                CASE WHEN p_ResponseForm_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseForm, NULL) END,
                CASE WHEN p_ActionableCommands_Clear = TRUE THEN NULL ELSE COALESCE(p_ActionableCommands, NULL) END,
                CASE WHEN p_AutomaticCommands_Clear = TRUE THEN NULL ELSE COALESCE(p_AutomaticCommands, NULL) END,
                COALESCE(p_OriginalMessageChanged, FALSE),
                CASE WHEN p_AgentSessionID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentSessionID, NULL) END,
                CASE WHEN p_TurnEndedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_TurnEndedAt, NULL) END,
                CASE WHEN p_UtteranceStartMs_Clear = TRUE THEN NULL ELSE COALESCE(p_UtteranceStartMs, NULL) END,
                CASE WHEN p_UtteranceEndMs_Clear = TRUE THEN NULL ELSE COALESCE(p_UtteranceEndMs, NULL) END,
                CASE WHEN p_MediaType_Clear = TRUE THEN NULL ELSE COALESCE(p_MediaType, NULL) END,
                COALESCE(p_Sequence, 0),
                CASE WHEN p_SummaryPromptRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_SummaryPromptRunID, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwConversationDetails" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateConversationDetail'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetail"(
    IN p_ID UUID,
    IN p_ConversationID UUID DEFAULT NULL,
    IN p_ExternalID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalID VARCHAR(100) DEFAULT NULL,
    IN p_Role VARCHAR(20) DEFAULT NULL,
    IN p_Message TEXT DEFAULT NULL,
    IN p_Error_Clear BOOLEAN DEFAULT FALSE,
    IN p_Error TEXT DEFAULT NULL,
    IN p_HiddenToUser BOOLEAN DEFAULT NULL,
    IN p_UserRating_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserRating INTEGER DEFAULT NULL,
    IN p_UserFeedback_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserFeedback TEXT DEFAULT NULL,
    IN p_ReflectionInsights_Clear BOOLEAN DEFAULT FALSE,
    IN p_ReflectionInsights TEXT DEFAULT NULL,
    IN p_SummaryOfEarlierConversation_Clear BOOLEAN DEFAULT FALSE,
    IN p_SummaryOfEarlierConversation TEXT DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_ArtifactID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ArtifactID UUID DEFAULT NULL,
    IN p_ArtifactVersionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ArtifactVersionID UUID DEFAULT NULL,
    IN p_CompletionTime_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompletionTime BIGINT DEFAULT NULL,
    IN p_IsPinned BOOLEAN DEFAULT NULL,
    IN p_ParentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_AgentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_SuggestedResponses_Clear BOOLEAN DEFAULT FALSE,
    IN p_SuggestedResponses TEXT DEFAULT NULL,
    IN p_TestRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TestRunID UUID DEFAULT NULL,
    IN p_ResponseForm_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResponseForm TEXT DEFAULT NULL,
    IN p_ActionableCommands_Clear BOOLEAN DEFAULT FALSE,
    IN p_ActionableCommands TEXT DEFAULT NULL,
    IN p_AutomaticCommands_Clear BOOLEAN DEFAULT FALSE,
    IN p_AutomaticCommands TEXT DEFAULT NULL,
    IN p_OriginalMessageChanged BOOLEAN DEFAULT NULL,
    IN p_AgentSessionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentSessionID UUID DEFAULT NULL,
    IN p_TurnEndedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_TurnEndedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_UtteranceStartMs_Clear BOOLEAN DEFAULT FALSE,
    IN p_UtteranceStartMs INTEGER DEFAULT NULL,
    IN p_UtteranceEndMs_Clear BOOLEAN DEFAULT FALSE,
    IN p_UtteranceEndMs INTEGER DEFAULT NULL,
    IN p_MediaType_Clear BOOLEAN DEFAULT FALSE,
    IN p_MediaType VARCHAR(20) DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_SummaryPromptRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SummaryPromptRunID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwConversationDetails" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ConversationDetail"
    SET
        "ConversationID" = COALESCE(p_ConversationID, "ConversationID"),
        "ExternalID" = CASE WHEN p_ExternalID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalID, "ExternalID") END,
        "Role" = COALESCE(p_Role, "Role"),
        "Message" = COALESCE(p_Message, "Message"),
        "Error" = CASE WHEN p_Error_Clear = TRUE THEN NULL ELSE COALESCE(p_Error, "Error") END,
        "HiddenToUser" = COALESCE(p_HiddenToUser, "HiddenToUser"),
        "UserRating" = CASE WHEN p_UserRating_Clear = TRUE THEN NULL ELSE COALESCE(p_UserRating, "UserRating") END,
        "UserFeedback" = CASE WHEN p_UserFeedback_Clear = TRUE THEN NULL ELSE COALESCE(p_UserFeedback, "UserFeedback") END,
        "ReflectionInsights" = CASE WHEN p_ReflectionInsights_Clear = TRUE THEN NULL ELSE COALESCE(p_ReflectionInsights, "ReflectionInsights") END,
        "SummaryOfEarlierConversation" = CASE WHEN p_SummaryOfEarlierConversation_Clear = TRUE THEN NULL ELSE COALESCE(p_SummaryOfEarlierConversation, "SummaryOfEarlierConversation") END,
        "UserID" = CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, "UserID") END,
        "ArtifactID" = CASE WHEN p_ArtifactID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactID, "ArtifactID") END,
        "ArtifactVersionID" = CASE WHEN p_ArtifactVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactVersionID, "ArtifactVersionID") END,
        "CompletionTime" = CASE WHEN p_CompletionTime_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletionTime, "CompletionTime") END,
        "IsPinned" = COALESCE(p_IsPinned, "IsPinned"),
        "ParentID" = CASE WHEN p_ParentID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentID, "ParentID") END,
        "AgentID" = CASE WHEN p_AgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentID, "AgentID") END,
        "Status" = COALESCE(p_Status, "Status"),
        "SuggestedResponses" = CASE WHEN p_SuggestedResponses_Clear = TRUE THEN NULL ELSE COALESCE(p_SuggestedResponses, "SuggestedResponses") END,
        "TestRunID" = CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, "TestRunID") END,
        "ResponseForm" = CASE WHEN p_ResponseForm_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseForm, "ResponseForm") END,
        "ActionableCommands" = CASE WHEN p_ActionableCommands_Clear = TRUE THEN NULL ELSE COALESCE(p_ActionableCommands, "ActionableCommands") END,
        "AutomaticCommands" = CASE WHEN p_AutomaticCommands_Clear = TRUE THEN NULL ELSE COALESCE(p_AutomaticCommands, "AutomaticCommands") END,
        "OriginalMessageChanged" = COALESCE(p_OriginalMessageChanged, "OriginalMessageChanged"),
        "AgentSessionID" = CASE WHEN p_AgentSessionID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentSessionID, "AgentSessionID") END,
        "TurnEndedAt" = CASE WHEN p_TurnEndedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_TurnEndedAt, "TurnEndedAt") END,
        "UtteranceStartMs" = CASE WHEN p_UtteranceStartMs_Clear = TRUE THEN NULL ELSE COALESCE(p_UtteranceStartMs, "UtteranceStartMs") END,
        "UtteranceEndMs" = CASE WHEN p_UtteranceEndMs_Clear = TRUE THEN NULL ELSE COALESCE(p_UtteranceEndMs, "UtteranceEndMs") END,
        "MediaType" = CASE WHEN p_MediaType_Clear = TRUE THEN NULL ELSE COALESCE(p_MediaType, "MediaType") END,
        "Sequence" = COALESCE(p_Sequence, "Sequence"),
        "SummaryPromptRunID" = CASE WHEN p_SummaryPromptRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_SummaryPromptRunID, "SummaryPromptRunID") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwConversationDetails" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwConversationDetails" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteConversationDetail'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetail"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJAIAgentExamples_SourceConversationDetailIDID UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_AgentID UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_UserID UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_CompanyID UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_Type VARCHAR(20);
    p_MJAIAgentExamples_SourceConversationDetailID_ExampleInput TEXT;
    p_MJAIAgentExamples_SourceConversationDetailID_ExampleOutput TEXT;
    p_MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated BOOLEAN;
    p_MJAIAgentExamples_SourceConversationDetailID_SourceConv_b3263f UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_SourceConv_591540 UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_SourceAIAg_987eaf UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_SuccessScore NUMERIC(5,2);
    p_MJAIAgentExamples_SourceConversationDetailID_Comments TEXT;
    p_MJAIAgentExamples_SourceConversationDetailID_Status VARCHAR(20);
    p_MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector TEXT;
    p_MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_PrimarySco_8c9509 UUID;
    p_MJAIAgentExamples_SourceConversationDetailID_PrimarySco_da3d2d VARCHAR(100);
    p_MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes TEXT;
    p_MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt TIMESTAMPTZ;
    p_MJAIAgentExamples_SourceConversationDetailID_AccessCount INTEGER;
    p_MJAIAgentExamples_SourceConversationDetailID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceConversationDetailIDID UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_AgentID UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_Note TEXT;
    p_MJAIAgentNotes_SourceConversationDetailID_UserID UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_Type VARCHAR(20);
    p_MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated BOOLEAN;
    p_MJAIAgentNotes_SourceConversationDetailID_Comments TEXT;
    p_MJAIAgentNotes_SourceConversationDetailID_Status VARCHAR(20);
    p_MJAIAgentNotes_SourceConversationDetailID_SourceConvers_d7e41b UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_SourceConvers_ec3b0d UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_CompanyID UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector TEXT;
    p_MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeE_b152e5 UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeR_fefb0a VARCHAR(100);
    p_MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes TEXT;
    p_MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceConversationDetailID_AccessCount INTEGER;
    p_MJAIAgentNotes_SourceConversationDetailID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceConversationDetailID_ConsolidatedI_88bda0 UUID;
    p_MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount INTEGER;
    p_MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs TEXT;
    p_MJAIAgentNotes_SourceConversationDetailID_ProtectionTier VARCHAR(20);
    p_MJAIAgentNotes_SourceConversationDetailID_ImportanceScore NUMERIC(5,2);
    p_MJAIAgentNotes_SourceConversationDetailID_AuthorType VARCHAR(20);
    p_MJAIAgentRuns_ConversationDetailIDID UUID;
    p_MJAIAgentRuns_ConversationDetailID_AgentID UUID;
    p_MJAIAgentRuns_ConversationDetailID_ParentRunID UUID;
    p_MJAIAgentRuns_ConversationDetailID_Status VARCHAR(50);
    p_MJAIAgentRuns_ConversationDetailID_StartedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConversationDetailID_CompletedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConversationDetailID_Success BOOLEAN;
    p_MJAIAgentRuns_ConversationDetailID_ErrorMessage TEXT;
    p_MJAIAgentRuns_ConversationDetailID_ConversationID UUID;
    p_MJAIAgentRuns_ConversationDetailID_UserID UUID;
    p_MJAIAgentRuns_ConversationDetailID_Result TEXT;
    p_MJAIAgentRuns_ConversationDetailID_AgentState TEXT;
    p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_TotalCost NUMERIC(18,6);
    p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUse_5ca82d INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_TotalCompletionToken_43c4ab INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_TotalCostRollup NUMERIC(19,8);
    p_MJAIAgentRuns_ConversationDetailID_ConversationDetailID UUID;
    p_MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_CancellationReason VARCHAR(30);
    p_MJAIAgentRuns_ConversationDetailID_FinalStep VARCHAR(30);
    p_MJAIAgentRuns_ConversationDetailID_FinalPayload TEXT;
    p_MJAIAgentRuns_ConversationDetailID_Message TEXT;
    p_MJAIAgentRuns_ConversationDetailID_LastRunID UUID;
    p_MJAIAgentRuns_ConversationDetailID_StartingPayload TEXT;
    p_MJAIAgentRuns_ConversationDetailID_TotalPromptIterations INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_ConfigurationID UUID;
    p_MJAIAgentRuns_ConversationDetailID_OverrideModelID UUID;
    p_MJAIAgentRuns_ConversationDetailID_OverrideVendorID UUID;
    p_MJAIAgentRuns_ConversationDetailID_Data TEXT;
    p_MJAIAgentRuns_ConversationDetailID_Verbose BOOLEAN;
    p_MJAIAgentRuns_ConversationDetailID_EffortLevel INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_RunName VARCHAR(255);
    p_MJAIAgentRuns_ConversationDetailID_Comments TEXT;
    p_MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID UUID;
    p_MJAIAgentRuns_ConversationDetailID_TestRunID UUID;
    p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID UUID;
    p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentRuns_ConversationDetailID_SecondaryScopes TEXT;
    p_MJAIAgentRuns_ConversationDetailID_ExternalReferenceID VARCHAR(200);
    p_MJAIAgentRuns_ConversationDetailID_CompanyID UUID;
    p_MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConversationDetailID_AgentSessionID UUID;
    p_MJAIAgentRuns_ConversationDetailID_PlanMode BOOLEAN;
    p_MJConversationDetailArtifacts_ConversationDetailIDID UUID;
    p_MJConversationDetailAttachments_ConversationDetailIDID UUID;
    p_MJConversationDetailRatings_ConversationDetailIDID UUID;
    p_MJConversationDetails_ParentIDID UUID;
    p_MJConversationDetails_ParentID_ConversationID UUID;
    p_MJConversationDetails_ParentID_ExternalID VARCHAR(100);
    p_MJConversationDetails_ParentID_Role VARCHAR(20);
    p_MJConversationDetails_ParentID_Message TEXT;
    p_MJConversationDetails_ParentID_Error TEXT;
    p_MJConversationDetails_ParentID_HiddenToUser BOOLEAN;
    p_MJConversationDetails_ParentID_UserRating INTEGER;
    p_MJConversationDetails_ParentID_UserFeedback TEXT;
    p_MJConversationDetails_ParentID_ReflectionInsights TEXT;
    p_MJConversationDetails_ParentID_SummaryOfEarlierConversation TEXT;
    p_MJConversationDetails_ParentID_UserID UUID;
    p_MJConversationDetails_ParentID_ArtifactID UUID;
    p_MJConversationDetails_ParentID_ArtifactVersionID UUID;
    p_MJConversationDetails_ParentID_CompletionTime BIGINT;
    p_MJConversationDetails_ParentID_IsPinned BOOLEAN;
    p_MJConversationDetails_ParentID_ParentID UUID;
    p_MJConversationDetails_ParentID_AgentID UUID;
    p_MJConversationDetails_ParentID_Status VARCHAR(20);
    p_MJConversationDetails_ParentID_SuggestedResponses TEXT;
    p_MJConversationDetails_ParentID_TestRunID UUID;
    p_MJConversationDetails_ParentID_ResponseForm TEXT;
    p_MJConversationDetails_ParentID_ActionableCommands TEXT;
    p_MJConversationDetails_ParentID_AutomaticCommands TEXT;
    p_MJConversationDetails_ParentID_OriginalMessageChanged BOOLEAN;
    p_MJConversationDetails_ParentID_AgentSessionID UUID;
    p_MJConversationDetails_ParentID_TurnEndedAt TIMESTAMPTZ;
    p_MJConversationDetails_ParentID_UtteranceStartMs INTEGER;
    p_MJConversationDetails_ParentID_UtteranceEndMs INTEGER;
    p_MJConversationDetails_ParentID_MediaType VARCHAR(20);
    p_MJConversationDetails_ParentID_Sequence INTEGER;
    p_MJConversationDetails_ParentID_SummaryPromptRunID UUID;
    p_MJReports_ConversationDetailIDID UUID;
    p_MJReports_ConversationDetailID_Name VARCHAR(255);
    p_MJReports_ConversationDetailID_Description TEXT;
    p_MJReports_ConversationDetailID_CategoryID UUID;
    p_MJReports_ConversationDetailID_UserID UUID;
    p_MJReports_ConversationDetailID_SharingScope VARCHAR(20);
    p_MJReports_ConversationDetailID_ConversationID UUID;
    p_MJReports_ConversationDetailID_ConversationDetailID UUID;
    p_MJReports_ConversationDetailID_DataContextID UUID;
    p_MJReports_ConversationDetailID_Configuration TEXT;
    p_MJReports_ConversationDetailID_OutputTriggerTypeID UUID;
    p_MJReports_ConversationDetailID_OutputFormatTypeID UUID;
    p_MJReports_ConversationDetailID_OutputDeliveryTypeID UUID;
    p_MJReports_ConversationDetailID_OutputFrequency VARCHAR(50);
    p_MJReports_ConversationDetailID_OutputTargetEmail VARCHAR(255);
    p_MJReports_ConversationDetailID_OutputWorkflowID UUID;
    p_MJReports_ConversationDetailID_Thumbnail TEXT;
    p_MJReports_ConversationDetailID_EnvironmentID UUID;
    p_MJTasks_ConversationDetailIDID UUID;
    p_MJTasks_ConversationDetailID_ParentID UUID;
    p_MJTasks_ConversationDetailID_Name VARCHAR(255);
    p_MJTasks_ConversationDetailID_Description TEXT;
    p_MJTasks_ConversationDetailID_TypeID UUID;
    p_MJTasks_ConversationDetailID_EnvironmentID UUID;
    p_MJTasks_ConversationDetailID_ProjectID UUID;
    p_MJTasks_ConversationDetailID_ConversationDetailID UUID;
    p_MJTasks_ConversationDetailID_UserID UUID;
    p_MJTasks_ConversationDetailID_AgentID UUID;
    p_MJTasks_ConversationDetailID_Status VARCHAR(50);
    p_MJTasks_ConversationDetailID_PercentComplete INTEGER;
    p_MJTasks_ConversationDetailID_DueAt TIMESTAMPTZ;
    p_MJTasks_ConversationDetailID_StartedAt TIMESTAMPTZ;
    p_MJTasks_ConversationDetailID_CompletedAt TIMESTAMPTZ;
BEGIN
-- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample


    FOR _rec IN SELECT "ID", "AgentID", "UserID", "CompanyID", "Type", "ExampleInput", "ExampleOutput", "IsAutoGenerated", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "SuccessScore", "Comments", "Status", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt" FROM __mj."AIAgentExample" WHERE "SourceConversationDetailID" = p_ID
    LOOP
        p_MJAIAgentExamples_SourceConversationDetailIDID := _rec."ID";
        p_MJAIAgentExamples_SourceConversationDetailID_AgentID := _rec."AgentID";
        p_MJAIAgentExamples_SourceConversationDetailID_UserID := _rec."UserID";
        p_MJAIAgentExamples_SourceConversationDetailID_CompanyID := _rec."CompanyID";
        p_MJAIAgentExamples_SourceConversationDetailID_Type := _rec."Type";
        p_MJAIAgentExamples_SourceConversationDetailID_ExampleInput := _rec."ExampleInput";
        p_MJAIAgentExamples_SourceConversationDetailID_ExampleOutput := _rec."ExampleOutput";
        p_MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated := _rec."IsAutoGenerated";
        p_MJAIAgentExamples_SourceConversationDetailID_SourceConv_b3263f := _rec."SourceConversationID";
        p_MJAIAgentExamples_SourceConversationDetailID_SourceConv_591540 := _rec."SourceConversationDetailID";
        p_MJAIAgentExamples_SourceConversationDetailID_SourceAIAg_987eaf := _rec."SourceAIAgentRunID";
        p_MJAIAgentExamples_SourceConversationDetailID_SuccessScore := _rec."SuccessScore";
        p_MJAIAgentExamples_SourceConversationDetailID_Comments := _rec."Comments";
        p_MJAIAgentExamples_SourceConversationDetailID_Status := _rec."Status";
        p_MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector := _rec."EmbeddingVector";
        p_MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJAIAgentExamples_SourceConversationDetailID_PrimarySco_8c9509 := _rec."PrimaryScopeEntityID";
        p_MJAIAgentExamples_SourceConversationDetailID_PrimarySco_da3d2d := _rec."PrimaryScopeRecordID";
        p_MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt := _rec."LastAccessedAt";
        p_MJAIAgentExamples_SourceConversationDetailID_AccessCount := _rec."AccessCount";
        p_MJAIAgentExamples_SourceConversationDetailID_ExpiresAt := _rec."ExpiresAt";
        -- Set the FK field to NULL
        p_MJAIAgentExamples_SourceConversationDetailID_SourceConv_591540 := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentExample"(p_ID => p_MJAIAgentExamples_SourceConversationDetailIDID, p_AgentID => p_MJAIAgentExamples_SourceConversationDetailID_AgentID, p_UserID => p_MJAIAgentExamples_SourceConversationDetailID_UserID, p_CompanyID => p_MJAIAgentExamples_SourceConversationDetailID_CompanyID, p_Type => p_MJAIAgentExamples_SourceConversationDetailID_Type, p_ExampleInput => p_MJAIAgentExamples_SourceConversationDetailID_ExampleInput, p_ExampleOutput => p_MJAIAgentExamples_SourceConversationDetailID_ExampleOutput, p_IsAutoGenerated => p_MJAIAgentExamples_SourceConversationDetailID_IsAutoGenerated, p_SourceConversationID => p_MJAIAgentExamples_SourceConversationDetailID_SourceConv_b3263f, p_SourceConversationDetailID_Clear => 1, p_SourceConversationDetailID => p_MJAIAgentExamples_SourceConversationDetailID_SourceConv_591540, p_SourceAIAgentRunID => p_MJAIAgentExamples_SourceConversationDetailID_SourceAIAg_987eaf, p_SuccessScore => p_MJAIAgentExamples_SourceConversationDetailID_SuccessScore, p_Comments => p_MJAIAgentExamples_SourceConversationDetailID_Comments, p_Status => p_MJAIAgentExamples_SourceConversationDetailID_Status, p_EmbeddingVector => p_MJAIAgentExamples_SourceConversationDetailID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentExamples_SourceConversationDetailID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentExamples_SourceConversationDetailID_PrimarySco_8c9509, p_PrimaryScopeRecordID => p_MJAIAgentExamples_SourceConversationDetailID_PrimarySco_da3d2d, p_SecondaryScopes => p_MJAIAgentExamples_SourceConversationDetailID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentExamples_SourceConversationDetailID_LastAccessedAt, p_AccessCount => p_MJAIAgentExamples_SourceConversationDetailID_AccessCount, p_ExpiresAt => p_MJAIAgentExamples_SourceConversationDetailID_ExpiresAt);

    END LOOP;

    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote


    FOR _rec IN SELECT "ID", "AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt", "ConsolidatedIntoNoteID", "ConsolidationCount", "DerivedFromNoteIDs", "ProtectionTier", "ImportanceScore", "AuthorType" FROM __mj."AIAgentNote" WHERE "SourceConversationDetailID" = p_ID
    LOOP
        p_MJAIAgentNotes_SourceConversationDetailIDID := _rec."ID";
        p_MJAIAgentNotes_SourceConversationDetailID_AgentID := _rec."AgentID";
        p_MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID := _rec."AgentNoteTypeID";
        p_MJAIAgentNotes_SourceConversationDetailID_Note := _rec."Note";
        p_MJAIAgentNotes_SourceConversationDetailID_UserID := _rec."UserID";
        p_MJAIAgentNotes_SourceConversationDetailID_Type := _rec."Type";
        p_MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated := _rec."IsAutoGenerated";
        p_MJAIAgentNotes_SourceConversationDetailID_Comments := _rec."Comments";
        p_MJAIAgentNotes_SourceConversationDetailID_Status := _rec."Status";
        p_MJAIAgentNotes_SourceConversationDetailID_SourceConvers_d7e41b := _rec."SourceConversationID";
        p_MJAIAgentNotes_SourceConversationDetailID_SourceConvers_ec3b0d := _rec."SourceConversationDetailID";
        p_MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID := _rec."SourceAIAgentRunID";
        p_MJAIAgentNotes_SourceConversationDetailID_CompanyID := _rec."CompanyID";
        p_MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector := _rec."EmbeddingVector";
        p_MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeE_b152e5 := _rec."PrimaryScopeEntityID";
        p_MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeR_fefb0a := _rec."PrimaryScopeRecordID";
        p_MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt := _rec."LastAccessedAt";
        p_MJAIAgentNotes_SourceConversationDetailID_AccessCount := _rec."AccessCount";
        p_MJAIAgentNotes_SourceConversationDetailID_ExpiresAt := _rec."ExpiresAt";
        p_MJAIAgentNotes_SourceConversationDetailID_ConsolidatedI_88bda0 := _rec."ConsolidatedIntoNoteID";
        p_MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount := _rec."ConsolidationCount";
        p_MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs := _rec."DerivedFromNoteIDs";
        p_MJAIAgentNotes_SourceConversationDetailID_ProtectionTier := _rec."ProtectionTier";
        p_MJAIAgentNotes_SourceConversationDetailID_ImportanceScore := _rec."ImportanceScore";
        p_MJAIAgentNotes_SourceConversationDetailID_AuthorType := _rec."AuthorType";
        -- Set the FK field to NULL
        p_MJAIAgentNotes_SourceConversationDetailID_SourceConvers_ec3b0d := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentNote"(p_ID => p_MJAIAgentNotes_SourceConversationDetailIDID, p_AgentID => p_MJAIAgentNotes_SourceConversationDetailID_AgentID, p_AgentNoteTypeID => p_MJAIAgentNotes_SourceConversationDetailID_AgentNoteTypeID, p_Note => p_MJAIAgentNotes_SourceConversationDetailID_Note, p_UserID => p_MJAIAgentNotes_SourceConversationDetailID_UserID, p_Type => p_MJAIAgentNotes_SourceConversationDetailID_Type, p_IsAutoGenerated => p_MJAIAgentNotes_SourceConversationDetailID_IsAutoGenerated, p_Comments => p_MJAIAgentNotes_SourceConversationDetailID_Comments, p_Status => p_MJAIAgentNotes_SourceConversationDetailID_Status, p_SourceConversationID => p_MJAIAgentNotes_SourceConversationDetailID_SourceConvers_d7e41b, p_SourceConversationDetailID_Clear => 1, p_SourceConversationDetailID => p_MJAIAgentNotes_SourceConversationDetailID_SourceConvers_ec3b0d, p_SourceAIAgentRunID => p_MJAIAgentNotes_SourceConversationDetailID_SourceAIAgentRunID, p_CompanyID => p_MJAIAgentNotes_SourceConversationDetailID_CompanyID, p_EmbeddingVector => p_MJAIAgentNotes_SourceConversationDetailID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentNotes_SourceConversationDetailID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeE_b152e5, p_PrimaryScopeRecordID => p_MJAIAgentNotes_SourceConversationDetailID_PrimaryScopeR_fefb0a, p_SecondaryScopes => p_MJAIAgentNotes_SourceConversationDetailID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentNotes_SourceConversationDetailID_LastAccessedAt, p_AccessCount => p_MJAIAgentNotes_SourceConversationDetailID_AccessCount, p_ExpiresAt => p_MJAIAgentNotes_SourceConversationDetailID_ExpiresAt, p_ConsolidatedIntoNoteID => p_MJAIAgentNotes_SourceConversationDetailID_ConsolidatedI_88bda0, p_ConsolidationCount => p_MJAIAgentNotes_SourceConversationDetailID_ConsolidationCount, p_DerivedFromNoteIDs => p_MJAIAgentNotes_SourceConversationDetailID_DerivedFromNoteIDs, p_ProtectionTier => p_MJAIAgentNotes_SourceConversationDetailID_ProtectionTier, p_ImportanceScore => p_MJAIAgentNotes_SourceConversationDetailID_ImportanceScore, p_AuthorType => p_MJAIAgentNotes_SourceConversationDetailID_AuthorType);

    END LOOP;

    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt", "AgentSessionID", "PlanMode" FROM __mj."AIAgentRun" WHERE "ConversationDetailID" = p_ID
    LOOP
        p_MJAIAgentRuns_ConversationDetailIDID := _rec."ID";
        p_MJAIAgentRuns_ConversationDetailID_AgentID := _rec."AgentID";
        p_MJAIAgentRuns_ConversationDetailID_ParentRunID := _rec."ParentRunID";
        p_MJAIAgentRuns_ConversationDetailID_Status := _rec."Status";
        p_MJAIAgentRuns_ConversationDetailID_StartedAt := _rec."StartedAt";
        p_MJAIAgentRuns_ConversationDetailID_CompletedAt := _rec."CompletedAt";
        p_MJAIAgentRuns_ConversationDetailID_Success := _rec."Success";
        p_MJAIAgentRuns_ConversationDetailID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIAgentRuns_ConversationDetailID_ConversationID := _rec."ConversationID";
        p_MJAIAgentRuns_ConversationDetailID_UserID := _rec."UserID";
        p_MJAIAgentRuns_ConversationDetailID_Result := _rec."Result";
        p_MJAIAgentRuns_ConversationDetailID_AgentState := _rec."AgentState";
        p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsed := _rec."TotalTokensUsed";
        p_MJAIAgentRuns_ConversationDetailID_TotalCost := _rec."TotalCost";
        p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed := _rec."TotalPromptTokensUsed";
        p_MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed := _rec."TotalCompletionTokensUsed";
        p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup := _rec."TotalTokensUsedRollup";
        p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUse_5ca82d := _rec."TotalPromptTokensUsedRollup";
        p_MJAIAgentRuns_ConversationDetailID_TotalCompletionToken_43c4ab := _rec."TotalCompletionTokensUsedRollup";
        p_MJAIAgentRuns_ConversationDetailID_TotalCostRollup := _rec."TotalCostRollup";
        p_MJAIAgentRuns_ConversationDetailID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence := _rec."ConversationDetailSequence";
        p_MJAIAgentRuns_ConversationDetailID_CancellationReason := _rec."CancellationReason";
        p_MJAIAgentRuns_ConversationDetailID_FinalStep := _rec."FinalStep";
        p_MJAIAgentRuns_ConversationDetailID_FinalPayload := _rec."FinalPayload";
        p_MJAIAgentRuns_ConversationDetailID_Message := _rec."Message";
        p_MJAIAgentRuns_ConversationDetailID_LastRunID := _rec."LastRunID";
        p_MJAIAgentRuns_ConversationDetailID_StartingPayload := _rec."StartingPayload";
        p_MJAIAgentRuns_ConversationDetailID_TotalPromptIterations := _rec."TotalPromptIterations";
        p_MJAIAgentRuns_ConversationDetailID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIAgentRuns_ConversationDetailID_OverrideModelID := _rec."OverrideModelID";
        p_MJAIAgentRuns_ConversationDetailID_OverrideVendorID := _rec."OverrideVendorID";
        p_MJAIAgentRuns_ConversationDetailID_Data := _rec."Data";
        p_MJAIAgentRuns_ConversationDetailID_Verbose := _rec."Verbose";
        p_MJAIAgentRuns_ConversationDetailID_EffortLevel := _rec."EffortLevel";
        p_MJAIAgentRuns_ConversationDetailID_RunName := _rec."RunName";
        p_MJAIAgentRuns_ConversationDetailID_Comments := _rec."Comments";
        p_MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID := _rec."ScheduledJobRunID";
        p_MJAIAgentRuns_ConversationDetailID_TestRunID := _rec."TestRunID";
        p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentRuns_ConversationDetailID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentRuns_ConversationDetailID_ExternalReferenceID := _rec."ExternalReferenceID";
        p_MJAIAgentRuns_ConversationDetailID_CompanyID := _rec."CompanyID";
        p_MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed := _rec."TotalCacheReadTokensUsed";
        p_MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed := _rec."TotalCacheWriteTokensUsed";
        p_MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt := _rec."LastHeartbeatAt";
        p_MJAIAgentRuns_ConversationDetailID_AgentSessionID := _rec."AgentSessionID";
        p_MJAIAgentRuns_ConversationDetailID_PlanMode := _rec."PlanMode";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ConversationDetailID_ConversationDetailID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ConversationDetailIDID, p_AgentID => p_MJAIAgentRuns_ConversationDetailID_AgentID, p_ParentRunID => p_MJAIAgentRuns_ConversationDetailID_ParentRunID, p_Status => p_MJAIAgentRuns_ConversationDetailID_Status, p_StartedAt => p_MJAIAgentRuns_ConversationDetailID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ConversationDetailID_CompletedAt, p_Success => p_MJAIAgentRuns_ConversationDetailID_Success, p_ErrorMessage => p_MJAIAgentRuns_ConversationDetailID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_ConversationDetailID_ConversationID, p_UserID => p_MJAIAgentRuns_ConversationDetailID_UserID, p_Result => p_MJAIAgentRuns_ConversationDetailID_Result, p_AgentState => p_MJAIAgentRuns_ConversationDetailID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ConversationDetailID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUse_5ca82d, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ConversationDetailID_TotalCompletionToken_43c4ab, p_TotalCostRollup => p_MJAIAgentRuns_ConversationDetailID_TotalCostRollup, p_ConversationDetailID_Clear => 1, p_ConversationDetailID => p_MJAIAgentRuns_ConversationDetailID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ConversationDetailID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ConversationDetailID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ConversationDetailID_FinalPayload, p_Message => p_MJAIAgentRuns_ConversationDetailID_Message, p_LastRunID => p_MJAIAgentRuns_ConversationDetailID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ConversationDetailID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_ConversationDetailID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ConversationDetailID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ConversationDetailID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ConversationDetailID_Data, p_Verbose => p_MJAIAgentRuns_ConversationDetailID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ConversationDetailID_EffortLevel, p_RunName => p_MJAIAgentRuns_ConversationDetailID_RunName, p_Comments => p_MJAIAgentRuns_ConversationDetailID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ConversationDetailID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ConversationDetailID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ConversationDetailID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt, p_AgentSessionID => p_MJAIAgentRuns_ConversationDetailID_AgentSessionID, p_PlanMode => p_MJAIAgentRuns_ConversationDetailID_PlanMode);

    END LOOP;

    
    -- Cascade delete from ConversationDetailArtifact using cursor to call spDeleteConversationDetailArtifact

    FOR _rec IN SELECT "ID" FROM __mj."ConversationDetailArtifact" WHERE "ConversationDetailID" = p_ID
    LOOP
        p_MJConversationDetailArtifacts_ConversationDetailIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationDetailArtifact"(p_ID => p_MJConversationDetailArtifacts_ConversationDetailIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ConversationDetailAttachment using cursor to call spDeleteConversationDetailAttachment

    FOR _rec IN SELECT "ID" FROM __mj."ConversationDetailAttachment" WHERE "ConversationDetailID" = p_ID
    LOOP
        p_MJConversationDetailAttachments_ConversationDetailIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationDetailAttachment"(p_ID => p_MJConversationDetailAttachments_ConversationDetailIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ConversationDetailRating using cursor to call spDeleteConversationDetailRating

    FOR _rec IN SELECT "ID" FROM __mj."ConversationDetailRating" WHERE "ConversationDetailID" = p_ID
    LOOP
        p_MJConversationDetailRatings_ConversationDetailIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationDetailRating"(p_ID => p_MJConversationDetailRatings_ConversationDetailIDID);
        
    END LOOP;
    
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged", "AgentSessionID", "TurnEndedAt", "UtteranceStartMs", "UtteranceEndMs", "MediaType", "Sequence", "SummaryPromptRunID" FROM __mj."ConversationDetail" WHERE "ParentID" = p_ID
    LOOP
        p_MJConversationDetails_ParentIDID := _rec."ID";
        p_MJConversationDetails_ParentID_ConversationID := _rec."ConversationID";
        p_MJConversationDetails_ParentID_ExternalID := _rec."ExternalID";
        p_MJConversationDetails_ParentID_Role := _rec."Role";
        p_MJConversationDetails_ParentID_Message := _rec."Message";
        p_MJConversationDetails_ParentID_Error := _rec."Error";
        p_MJConversationDetails_ParentID_HiddenToUser := _rec."HiddenToUser";
        p_MJConversationDetails_ParentID_UserRating := _rec."UserRating";
        p_MJConversationDetails_ParentID_UserFeedback := _rec."UserFeedback";
        p_MJConversationDetails_ParentID_ReflectionInsights := _rec."ReflectionInsights";
        p_MJConversationDetails_ParentID_SummaryOfEarlierConversation := _rec."SummaryOfEarlierConversation";
        p_MJConversationDetails_ParentID_UserID := _rec."UserID";
        p_MJConversationDetails_ParentID_ArtifactID := _rec."ArtifactID";
        p_MJConversationDetails_ParentID_ArtifactVersionID := _rec."ArtifactVersionID";
        p_MJConversationDetails_ParentID_CompletionTime := _rec."CompletionTime";
        p_MJConversationDetails_ParentID_IsPinned := _rec."IsPinned";
        p_MJConversationDetails_ParentID_ParentID := _rec."ParentID";
        p_MJConversationDetails_ParentID_AgentID := _rec."AgentID";
        p_MJConversationDetails_ParentID_Status := _rec."Status";
        p_MJConversationDetails_ParentID_SuggestedResponses := _rec."SuggestedResponses";
        p_MJConversationDetails_ParentID_TestRunID := _rec."TestRunID";
        p_MJConversationDetails_ParentID_ResponseForm := _rec."ResponseForm";
        p_MJConversationDetails_ParentID_ActionableCommands := _rec."ActionableCommands";
        p_MJConversationDetails_ParentID_AutomaticCommands := _rec."AutomaticCommands";
        p_MJConversationDetails_ParentID_OriginalMessageChanged := _rec."OriginalMessageChanged";
        p_MJConversationDetails_ParentID_AgentSessionID := _rec."AgentSessionID";
        p_MJConversationDetails_ParentID_TurnEndedAt := _rec."TurnEndedAt";
        p_MJConversationDetails_ParentID_UtteranceStartMs := _rec."UtteranceStartMs";
        p_MJConversationDetails_ParentID_UtteranceEndMs := _rec."UtteranceEndMs";
        p_MJConversationDetails_ParentID_MediaType := _rec."MediaType";
        p_MJConversationDetails_ParentID_Sequence := _rec."Sequence";
        p_MJConversationDetails_ParentID_SummaryPromptRunID := _rec."SummaryPromptRunID";
        -- Set the FK field to NULL
        p_MJConversationDetails_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_ParentIDID, p_ConversationID => p_MJConversationDetails_ParentID_ConversationID, p_ExternalID => p_MJConversationDetails_ParentID_ExternalID, p_Role => p_MJConversationDetails_ParentID_Role, p_Message => p_MJConversationDetails_ParentID_Message, p_Error => p_MJConversationDetails_ParentID_Error, p_HiddenToUser => p_MJConversationDetails_ParentID_HiddenToUser, p_UserRating => p_MJConversationDetails_ParentID_UserRating, p_UserFeedback => p_MJConversationDetails_ParentID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_ParentID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_ParentID_SummaryOfEarlierConversation, p_UserID => p_MJConversationDetails_ParentID_UserID, p_ArtifactID => p_MJConversationDetails_ParentID_ArtifactID, p_ArtifactVersionID => p_MJConversationDetails_ParentID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_ParentID_CompletionTime, p_IsPinned => p_MJConversationDetails_ParentID_IsPinned, p_ParentID_Clear => 1, p_ParentID => p_MJConversationDetails_ParentID_ParentID, p_AgentID => p_MJConversationDetails_ParentID_AgentID, p_Status => p_MJConversationDetails_ParentID_Status, p_SuggestedResponses => p_MJConversationDetails_ParentID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_ParentID_TestRunID, p_ResponseForm => p_MJConversationDetails_ParentID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_ParentID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_ParentID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_ParentID_OriginalMessageChanged, p_AgentSessionID => p_MJConversationDetails_ParentID_AgentSessionID, p_TurnEndedAt => p_MJConversationDetails_ParentID_TurnEndedAt, p_UtteranceStartMs => p_MJConversationDetails_ParentID_UtteranceStartMs, p_UtteranceEndMs => p_MJConversationDetails_ParentID_UtteranceEndMs, p_MediaType => p_MJConversationDetails_ParentID_MediaType, p_Sequence => p_MJConversationDetails_ParentID_Sequence, p_SummaryPromptRunID => p_MJConversationDetails_ParentID_SummaryPromptRunID);

    END LOOP;

    
    -- Cascade update on Report using cursor to call spUpdateReport


    FOR _rec IN SELECT "ID", "Name", "Description", "CategoryID", "UserID", "SharingScope", "ConversationID", "ConversationDetailID", "DataContextID", "Configuration", "OutputTriggerTypeID", "OutputFormatTypeID", "OutputDeliveryTypeID", "OutputFrequency", "OutputTargetEmail", "OutputWorkflowID", "Thumbnail", "EnvironmentID" FROM __mj."Report" WHERE "ConversationDetailID" = p_ID
    LOOP
        p_MJReports_ConversationDetailIDID := _rec."ID";
        p_MJReports_ConversationDetailID_Name := _rec."Name";
        p_MJReports_ConversationDetailID_Description := _rec."Description";
        p_MJReports_ConversationDetailID_CategoryID := _rec."CategoryID";
        p_MJReports_ConversationDetailID_UserID := _rec."UserID";
        p_MJReports_ConversationDetailID_SharingScope := _rec."SharingScope";
        p_MJReports_ConversationDetailID_ConversationID := _rec."ConversationID";
        p_MJReports_ConversationDetailID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJReports_ConversationDetailID_DataContextID := _rec."DataContextID";
        p_MJReports_ConversationDetailID_Configuration := _rec."Configuration";
        p_MJReports_ConversationDetailID_OutputTriggerTypeID := _rec."OutputTriggerTypeID";
        p_MJReports_ConversationDetailID_OutputFormatTypeID := _rec."OutputFormatTypeID";
        p_MJReports_ConversationDetailID_OutputDeliveryTypeID := _rec."OutputDeliveryTypeID";
        p_MJReports_ConversationDetailID_OutputFrequency := _rec."OutputFrequency";
        p_MJReports_ConversationDetailID_OutputTargetEmail := _rec."OutputTargetEmail";
        p_MJReports_ConversationDetailID_OutputWorkflowID := _rec."OutputWorkflowID";
        p_MJReports_ConversationDetailID_Thumbnail := _rec."Thumbnail";
        p_MJReports_ConversationDetailID_EnvironmentID := _rec."EnvironmentID";
        -- Set the FK field to NULL
        p_MJReports_ConversationDetailID_ConversationDetailID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateReport"(p_ID => p_MJReports_ConversationDetailIDID, p_Name => p_MJReports_ConversationDetailID_Name, p_Description => p_MJReports_ConversationDetailID_Description, p_CategoryID => p_MJReports_ConversationDetailID_CategoryID, p_UserID => p_MJReports_ConversationDetailID_UserID, p_SharingScope => p_MJReports_ConversationDetailID_SharingScope, p_ConversationID => p_MJReports_ConversationDetailID_ConversationID, p_ConversationDetailID_Clear => 1, p_ConversationDetailID => p_MJReports_ConversationDetailID_ConversationDetailID, p_DataContextID => p_MJReports_ConversationDetailID_DataContextID, p_Configuration => p_MJReports_ConversationDetailID_Configuration, p_OutputTriggerTypeID => p_MJReports_ConversationDetailID_OutputTriggerTypeID, p_OutputFormatTypeID => p_MJReports_ConversationDetailID_OutputFormatTypeID, p_OutputDeliveryTypeID => p_MJReports_ConversationDetailID_OutputDeliveryTypeID, p_OutputFrequency => p_MJReports_ConversationDetailID_OutputFrequency, p_OutputTargetEmail => p_MJReports_ConversationDetailID_OutputTargetEmail, p_OutputWorkflowID => p_MJReports_ConversationDetailID_OutputWorkflowID, p_Thumbnail => p_MJReports_ConversationDetailID_Thumbnail, p_EnvironmentID => p_MJReports_ConversationDetailID_EnvironmentID);

    END LOOP;

    
    -- Cascade update on Task using cursor to call spUpdateTask


    FOR _rec IN SELECT "ID", "ParentID", "Name", "Description", "TypeID", "EnvironmentID", "ProjectID", "ConversationDetailID", "UserID", "AgentID", "Status", "PercentComplete", "DueAt", "StartedAt", "CompletedAt" FROM __mj."Task" WHERE "ConversationDetailID" = p_ID
    LOOP
        p_MJTasks_ConversationDetailIDID := _rec."ID";
        p_MJTasks_ConversationDetailID_ParentID := _rec."ParentID";
        p_MJTasks_ConversationDetailID_Name := _rec."Name";
        p_MJTasks_ConversationDetailID_Description := _rec."Description";
        p_MJTasks_ConversationDetailID_TypeID := _rec."TypeID";
        p_MJTasks_ConversationDetailID_EnvironmentID := _rec."EnvironmentID";
        p_MJTasks_ConversationDetailID_ProjectID := _rec."ProjectID";
        p_MJTasks_ConversationDetailID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJTasks_ConversationDetailID_UserID := _rec."UserID";
        p_MJTasks_ConversationDetailID_AgentID := _rec."AgentID";
        p_MJTasks_ConversationDetailID_Status := _rec."Status";
        p_MJTasks_ConversationDetailID_PercentComplete := _rec."PercentComplete";
        p_MJTasks_ConversationDetailID_DueAt := _rec."DueAt";
        p_MJTasks_ConversationDetailID_StartedAt := _rec."StartedAt";
        p_MJTasks_ConversationDetailID_CompletedAt := _rec."CompletedAt";
        -- Set the FK field to NULL
        p_MJTasks_ConversationDetailID_ConversationDetailID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateTask"(p_ID => p_MJTasks_ConversationDetailIDID, p_ParentID => p_MJTasks_ConversationDetailID_ParentID, p_Name => p_MJTasks_ConversationDetailID_Name, p_Description => p_MJTasks_ConversationDetailID_Description, p_TypeID => p_MJTasks_ConversationDetailID_TypeID, p_EnvironmentID => p_MJTasks_ConversationDetailID_EnvironmentID, p_ProjectID => p_MJTasks_ConversationDetailID_ProjectID, p_ConversationDetailID_Clear => 1, p_ConversationDetailID => p_MJTasks_ConversationDetailID_ConversationDetailID, p_UserID => p_MJTasks_ConversationDetailID_UserID, p_AgentID => p_MJTasks_ConversationDetailID_AgentID, p_Status => p_MJTasks_ConversationDetailID_Status, p_PercentComplete => p_MJTasks_ConversationDetailID_PercentComplete, p_DueAt => p_MJTasks_ConversationDetailID_DueAt, p_StartedAt => p_MJTasks_ConversationDetailID_StartedAt, p_CompletedAt => p_MJTasks_ConversationDetailID_CompletedAt);

    END LOOP;

    

    DELETE FROM
        __mj."ConversationDetail"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIPromptRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIPromptRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJAIPromptRunMedias_PromptRunIDID UUID;
    p_MJAIPromptRuns_ParentIDID UUID;
    p_MJAIPromptRuns_ParentID_PromptID UUID;
    p_MJAIPromptRuns_ParentID_ModelID UUID;
    p_MJAIPromptRuns_ParentID_VendorID UUID;
    p_MJAIPromptRuns_ParentID_AgentID UUID;
    p_MJAIPromptRuns_ParentID_ConfigurationID UUID;
    p_MJAIPromptRuns_ParentID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ParentID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ParentID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_ParentID_Messages TEXT;
    p_MJAIPromptRuns_ParentID_Result TEXT;
    p_MJAIPromptRuns_ParentID_TokensUsed INTEGER;
    p_MJAIPromptRuns_ParentID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_ParentID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_ParentID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_ParentID_Success BOOLEAN;
    p_MJAIPromptRuns_ParentID_ErrorMessage TEXT;
    p_MJAIPromptRuns_ParentID_ParentID UUID;
    p_MJAIPromptRuns_ParentID_RunType VARCHAR(20);
    p_MJAIPromptRuns_ParentID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_ParentID_AgentRunID UUID;
    p_MJAIPromptRuns_ParentID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_ParentID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_ParentID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_ParentID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_ParentID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_ParentID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_ParentID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_ParentID_TopK INTEGER;
    p_MJAIPromptRuns_ParentID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_ParentID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_ParentID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_ParentID_Seed INTEGER;
    p_MJAIPromptRuns_ParentID_StopSequences TEXT;
    p_MJAIPromptRuns_ParentID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_ParentID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_ParentID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_ParentID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_ParentID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_ParentID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_ParentID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_ParentID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_ParentID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_ParentID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_ParentID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_ParentID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_ParentID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_ParentID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ParentID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ParentID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_ParentID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_ParentID_ValidationSummary TEXT;
    p_MJAIPromptRuns_ParentID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_ParentID_FailoverErrors TEXT;
    p_MJAIPromptRuns_ParentID_FailoverDurations TEXT;
    p_MJAIPromptRuns_ParentID_OriginalModelID UUID;
    p_MJAIPromptRuns_ParentID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_ParentID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_ParentID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_ParentID_ModelSelection TEXT;
    p_MJAIPromptRuns_ParentID_Status VARCHAR(50);
    p_MJAIPromptRuns_ParentID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_ParentID_CancellationReason TEXT;
    p_MJAIPromptRuns_ParentID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_ParentID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_ParentID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_ParentID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_ParentID_JudgeID UUID;
    p_MJAIPromptRuns_ParentID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_ParentID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_ParentID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_ParentID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_ParentID_ErrorDetails TEXT;
    p_MJAIPromptRuns_ParentID_ChildPromptID UUID;
    p_MJAIPromptRuns_ParentID_QueueTime INTEGER;
    p_MJAIPromptRuns_ParentID_PromptTime INTEGER;
    p_MJAIPromptRuns_ParentID_CompletionTime INTEGER;
    p_MJAIPromptRuns_ParentID_ModelSpecificResponseDetails TEXT;
    p_MJAIPromptRuns_ParentID_EffortLevel INTEGER;
    p_MJAIPromptRuns_ParentID_RunName VARCHAR(255);
    p_MJAIPromptRuns_ParentID_Comments TEXT;
    p_MJAIPromptRuns_ParentID_TestRunID UUID;
    p_MJAIPromptRuns_ParentID_AssistantPrefill TEXT;
    p_MJAIPromptRuns_ParentID_TokensCacheRead INTEGER;
    p_MJAIPromptRuns_ParentID_TokensCacheWrite INTEGER;
    p_MJAIPromptRuns_ParentID_TokensCacheReadRollup INTEGER;
    p_MJAIPromptRuns_ParentID_TokensCacheWriteRollup INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunIDID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_PromptID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_ModelID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_VendorID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_AgentID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_RerunFromPromptRunID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_Messages TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_Result TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsed INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_RerunFromPromptRunID_Success BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_ParentID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_RunType VARCHAR(20);
    p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_AgentRunID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_RerunFromPromptRunID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_RerunFromPromptRunID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_RerunFromPromptRunID_TopK INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_RerunFromPromptRunID_Seed INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_StopSequences TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_RerunFromPromptRunID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_ModelSelection TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_Status VARCHAR(50);
    p_MJAIPromptRuns_RerunFromPromptRunID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_CancellationReason TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_RerunFromPromptRunID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_RerunFromPromptRunID_JudgeID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_QueueTime INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_PromptTime INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_CompletionTime INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificRespon_874f7c TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_EffortLevel INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_RunName VARCHAR(255);
    p_MJAIPromptRuns_RerunFromPromptRunID_Comments TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_TestRunID UUID;
    p_MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill TEXT;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup INTEGER;
    p_MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup INTEGER;
    p_MJAIResultCache_PromptRunIDID UUID;
    p_MJAIResultCache_PromptRunID_AIPromptID UUID;
    p_MJAIResultCache_PromptRunID_AIModelID UUID;
    p_MJAIResultCache_PromptRunID_RunAt TIMESTAMPTZ;
    p_MJAIResultCache_PromptRunID_PromptText TEXT;
    p_MJAIResultCache_PromptRunID_ResultText TEXT;
    p_MJAIResultCache_PromptRunID_Status VARCHAR(50);
    p_MJAIResultCache_PromptRunID_ExpiredOn TIMESTAMPTZ;
    p_MJAIResultCache_PromptRunID_VendorID UUID;
    p_MJAIResultCache_PromptRunID_AgentID UUID;
    p_MJAIResultCache_PromptRunID_ConfigurationID UUID;
    p_MJAIResultCache_PromptRunID_PromptEmbedding BYTEA;
    p_MJAIResultCache_PromptRunID_PromptRunID UUID;
    p_MJContentItemTags_AIPromptRunIDID UUID;
    p_MJContentItemTags_AIPromptRunID_ItemID UUID;
    p_MJContentItemTags_AIPromptRunID_Tag VARCHAR(200);
    p_MJContentItemTags_AIPromptRunID_Weight NUMERIC(5,4);
    p_MJContentItemTags_AIPromptRunID_TagID UUID;
    p_MJContentItemTags_AIPromptRunID_AIPromptRunID UUID;
    p_MJContentItemTags_AIPromptRunID_Reasoning TEXT;
    p_MJContentProcessRunPromptRuns_AIPromptRunIDID UUID;
    p_MJConversationDetails_SummaryPromptRunIDID UUID;
    p_MJConversationDetails_SummaryPromptRunID_ConversationID UUID;
    p_MJConversationDetails_SummaryPromptRunID_ExternalID VARCHAR(100);
    p_MJConversationDetails_SummaryPromptRunID_Role VARCHAR(20);
    p_MJConversationDetails_SummaryPromptRunID_Message TEXT;
    p_MJConversationDetails_SummaryPromptRunID_Error TEXT;
    p_MJConversationDetails_SummaryPromptRunID_HiddenToUser BOOLEAN;
    p_MJConversationDetails_SummaryPromptRunID_UserRating INTEGER;
    p_MJConversationDetails_SummaryPromptRunID_UserFeedback TEXT;
    p_MJConversationDetails_SummaryPromptRunID_ReflectionInsights TEXT;
    p_MJConversationDetails_SummaryPromptRunID_SummaryOfEarli_8f3b0c TEXT;
    p_MJConversationDetails_SummaryPromptRunID_UserID UUID;
    p_MJConversationDetails_SummaryPromptRunID_ArtifactID UUID;
    p_MJConversationDetails_SummaryPromptRunID_ArtifactVersionID UUID;
    p_MJConversationDetails_SummaryPromptRunID_CompletionTime BIGINT;
    p_MJConversationDetails_SummaryPromptRunID_IsPinned BOOLEAN;
    p_MJConversationDetails_SummaryPromptRunID_ParentID UUID;
    p_MJConversationDetails_SummaryPromptRunID_AgentID UUID;
    p_MJConversationDetails_SummaryPromptRunID_Status VARCHAR(20);
    p_MJConversationDetails_SummaryPromptRunID_SuggestedResponses TEXT;
    p_MJConversationDetails_SummaryPromptRunID_TestRunID UUID;
    p_MJConversationDetails_SummaryPromptRunID_ResponseForm TEXT;
    p_MJConversationDetails_SummaryPromptRunID_ActionableCommands TEXT;
    p_MJConversationDetails_SummaryPromptRunID_AutomaticCommands TEXT;
    p_MJConversationDetails_SummaryPromptRunID_OriginalMessag_38a835 BOOLEAN;
    p_MJConversationDetails_SummaryPromptRunID_AgentSessionID UUID;
    p_MJConversationDetails_SummaryPromptRunID_TurnEndedAt TIMESTAMPTZ;
    p_MJConversationDetails_SummaryPromptRunID_UtteranceStartMs INTEGER;
    p_MJConversationDetails_SummaryPromptRunID_UtteranceEndMs INTEGER;
    p_MJConversationDetails_SummaryPromptRunID_MediaType VARCHAR(20);
    p_MJConversationDetails_SummaryPromptRunID_Sequence INTEGER;
    p_MJConversationDetails_SummaryPromptRunID_SummaryPromptRunID UUID;
    p_MJDuplicateRunDetailMatches_AIPromptRunIDID UUID;
    p_MJDuplicateRunDetailMatches_AIPromptRunID_DuplicateRunD_cabc8a UUID;
    p_MJDuplicateRunDetailMatches_AIPromptRunID_MatchSource VARCHAR(20);
    p_MJDuplicateRunDetailMatches_AIPromptRunID_MatchRecordID VARCHAR(500);
    p_MJDuplicateRunDetailMatches_AIPromptRunID_MatchProbability NUMERIC(12,11);
    p_MJDuplicateRunDetailMatches_AIPromptRunID_MatchedAt TIMESTAMPTZ;
    p_MJDuplicateRunDetailMatches_AIPromptRunID_Action VARCHAR(20);
    p_MJDuplicateRunDetailMatches_AIPromptRunID_ApprovalStatus VARCHAR(20);
    p_MJDuplicateRunDetailMatches_AIPromptRunID_RecordMergeLogID UUID;
    p_MJDuplicateRunDetailMatches_AIPromptRunID_MergeStatus VARCHAR(20);
    p_MJDuplicateRunDetailMatches_AIPromptRunID_MergedAt TIMESTAMPTZ;
    p_MJDuplicateRunDetailMatches_AIPromptRunID_RecordMetadata TEXT;
    p_MJDuplicateRunDetailMatches_AIPromptRunID_AIAgentRunID UUID;
    p_MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID UUID;
    p_MJDuplicateRunDetailMatches_AIPromptRunID_LLMRecommendation VARCHAR(20);
    p_MJDuplicateRunDetailMatches_AIPromptRunID_LLMConfidence NUMERIC(12,11);
    p_MJDuplicateRunDetailMatches_AIPromptRunID_LLMReasoning TEXT;
    p_MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedSu_a07a48 VARCHAR(500);
    p_MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedFieldMap TEXT;
    p_MJUserRoutineRuns_PromptRunIDID UUID;
    p_MJUserRoutineRuns_PromptRunID_RoutineID UUID;
    p_MJUserRoutineRuns_PromptRunID_StartedAt TIMESTAMPTZ;
    p_MJUserRoutineRuns_PromptRunID_CompletedAt TIMESTAMPTZ;
    p_MJUserRoutineRuns_PromptRunID_Status VARCHAR(20);
    p_MJUserRoutineRuns_PromptRunID_AgentRunID UUID;
    p_MJUserRoutineRuns_PromptRunID_PromptRunID UUID;
    p_MJUserRoutineRuns_PromptRunID_ActionExecutionLogID UUID;
    p_MJUserRoutineRuns_PromptRunID_ResultSummary TEXT;
    p_MJUserRoutineRuns_PromptRunID_ResultHash VARCHAR(100);
    p_MJUserRoutineRuns_PromptRunID_NotificationSent BOOLEAN;
    p_MJUserRoutineRuns_PromptRunID_ErrorMessage TEXT;
BEGIN
-- Cascade delete from AIPromptRunMedia using cursor to call spDeleteAIPromptRunMedia

    FOR _rec IN SELECT "ID" FROM __mj."AIPromptRunMedia" WHERE "PromptRunID" = p_ID
    LOOP
        p_MJAIPromptRunMedias_PromptRunIDID := _rec."ID";
        PERFORM __mj."spDeleteAIPromptRunMedia"(p_ID => p_MJAIPromptRunMedias_PromptRunIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite", "TokensCacheReadRollup", "TokensCacheWriteRollup" FROM __mj."AIPromptRun" WHERE "ParentID" = p_ID
    LOOP
        p_MJAIPromptRuns_ParentIDID := _rec."ID";
        p_MJAIPromptRuns_ParentID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_ParentID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_ParentID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_ParentID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_ParentID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_ParentID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_ParentID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_ParentID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_ParentID_Messages := _rec."Messages";
        p_MJAIPromptRuns_ParentID_Result := _rec."Result";
        p_MJAIPromptRuns_ParentID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_ParentID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_ParentID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_ParentID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_ParentID_Success := _rec."Success";
        p_MJAIPromptRuns_ParentID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_ParentID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_ParentID_RunType := _rec."RunType";
        p_MJAIPromptRuns_ParentID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_ParentID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_ParentID_Cost := _rec."Cost";
        p_MJAIPromptRuns_ParentID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_ParentID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_ParentID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_ParentID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_ParentID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_ParentID_TopP := _rec."TopP";
        p_MJAIPromptRuns_ParentID_TopK := _rec."TopK";
        p_MJAIPromptRuns_ParentID_MinP := _rec."MinP";
        p_MJAIPromptRuns_ParentID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_ParentID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_ParentID_Seed := _rec."Seed";
        p_MJAIPromptRuns_ParentID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_ParentID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_ParentID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_ParentID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_ParentID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_ParentID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_ParentID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_ParentID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_ParentID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_ParentID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_ParentID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_ParentID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_ParentID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_ParentID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_ParentID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_ParentID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_ParentID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_ParentID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_ParentID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_ParentID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_ParentID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_ParentID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_ParentID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_ParentID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_ParentID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_ParentID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_ParentID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_ParentID_Status := _rec."Status";
        p_MJAIPromptRuns_ParentID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_ParentID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_ParentID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_ParentID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_ParentID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_ParentID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_ParentID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_ParentID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_ParentID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_ParentID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_ParentID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_ParentID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_ParentID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_ParentID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_ParentID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_ParentID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_ParentID_ModelSpecificResponseDetails := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_ParentID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_ParentID_RunName := _rec."RunName";
        p_MJAIPromptRuns_ParentID_Comments := _rec."Comments";
        p_MJAIPromptRuns_ParentID_TestRunID := _rec."TestRunID";
        p_MJAIPromptRuns_ParentID_AssistantPrefill := _rec."AssistantPrefill";
        p_MJAIPromptRuns_ParentID_TokensCacheRead := _rec."TokensCacheRead";
        p_MJAIPromptRuns_ParentID_TokensCacheWrite := _rec."TokensCacheWrite";
        p_MJAIPromptRuns_ParentID_TokensCacheReadRollup := _rec."TokensCacheReadRollup";
        p_MJAIPromptRuns_ParentID_TokensCacheWriteRollup := _rec."TokensCacheWriteRollup";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_ParentIDID, p_PromptID => p_MJAIPromptRuns_ParentID_PromptID, p_ModelID => p_MJAIPromptRuns_ParentID_ModelID, p_VendorID => p_MJAIPromptRuns_ParentID_VendorID, p_AgentID => p_MJAIPromptRuns_ParentID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_ParentID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_ParentID_RunAt, p_CompletedAt => p_MJAIPromptRuns_ParentID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_ParentID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_ParentID_Messages, p_Result => p_MJAIPromptRuns_ParentID_Result, p_TokensUsed => p_MJAIPromptRuns_ParentID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_ParentID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_ParentID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_ParentID_TotalCost, p_Success => p_MJAIPromptRuns_ParentID_Success, p_ErrorMessage => p_MJAIPromptRuns_ParentID_ErrorMessage, p_ParentID_Clear => 1, p_ParentID => p_MJAIPromptRuns_ParentID_ParentID, p_RunType => p_MJAIPromptRuns_ParentID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_ParentID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_ParentID_AgentRunID, p_Cost => p_MJAIPromptRuns_ParentID_Cost, p_CostCurrency => p_MJAIPromptRuns_ParentID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_ParentID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_ParentID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_ParentID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_ParentID_Temperature, p_TopP => p_MJAIPromptRuns_ParentID_TopP, p_TopK => p_MJAIPromptRuns_ParentID_TopK, p_MinP => p_MJAIPromptRuns_ParentID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_ParentID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_ParentID_PresencePenalty, p_Seed => p_MJAIPromptRuns_ParentID_Seed, p_StopSequences => p_MJAIPromptRuns_ParentID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_ParentID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_ParentID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_ParentID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_ParentID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_ParentID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_ParentID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_ParentID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_ParentID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_ParentID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_ParentID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_ParentID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_ParentID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_ParentID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_ParentID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_ParentID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_ParentID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_ParentID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_ParentID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_ParentID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_ParentID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_ParentID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_ParentID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_ParentID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_ParentID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_ParentID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_ParentID_ModelSelection, p_Status => p_MJAIPromptRuns_ParentID_Status, p_Cancelled => p_MJAIPromptRuns_ParentID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_ParentID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_ParentID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_ParentID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_ParentID_CacheHit, p_CacheKey => p_MJAIPromptRuns_ParentID_CacheKey, p_JudgeID => p_MJAIPromptRuns_ParentID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_ParentID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_ParentID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_ParentID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_ParentID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_ParentID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_ParentID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_ParentID_QueueTime, p_PromptTime => p_MJAIPromptRuns_ParentID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_ParentID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_ParentID_EffortLevel, p_RunName => p_MJAIPromptRuns_ParentID_RunName, p_Comments => p_MJAIPromptRuns_ParentID_Comments, p_TestRunID => p_MJAIPromptRuns_ParentID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_ParentID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_ParentID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_ParentID_TokensCacheWrite, p_TokensCacheReadRollup => p_MJAIPromptRuns_ParentID_TokensCacheReadRollup, p_TokensCacheWriteRollup => p_MJAIPromptRuns_ParentID_TokensCacheWriteRollup);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite", "TokensCacheReadRollup", "TokensCacheWriteRollup" FROM __mj."AIPromptRun" WHERE "RerunFromPromptRunID" = p_ID
    LOOP
        p_MJAIPromptRuns_RerunFromPromptRunIDID := _rec."ID";
        p_MJAIPromptRuns_RerunFromPromptRunID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_RerunFromPromptRunID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_RerunFromPromptRunID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_RerunFromPromptRunID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_RerunFromPromptRunID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_RerunFromPromptRunID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_RerunFromPromptRunID_Messages := _rec."Messages";
        p_MJAIPromptRuns_RerunFromPromptRunID_Result := _rec."Result";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_RerunFromPromptRunID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_RerunFromPromptRunID_Success := _rec."Success";
        p_MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_RerunFromPromptRunID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_RerunFromPromptRunID_RunType := _rec."RunType";
        p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_RerunFromPromptRunID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_RerunFromPromptRunID_Cost := _rec."Cost";
        p_MJAIPromptRuns_RerunFromPromptRunID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_RerunFromPromptRunID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_RerunFromPromptRunID_TopP := _rec."TopP";
        p_MJAIPromptRuns_RerunFromPromptRunID_TopK := _rec."TopK";
        p_MJAIPromptRuns_RerunFromPromptRunID_MinP := _rec."MinP";
        p_MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_RerunFromPromptRunID_Seed := _rec."Seed";
        p_MJAIPromptRuns_RerunFromPromptRunID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_RerunFromPromptRunID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_RerunFromPromptRunID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_RerunFromPromptRunID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_RerunFromPromptRunID_Status := _rec."Status";
        p_MJAIPromptRuns_RerunFromPromptRunID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_RerunFromPromptRunID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_RerunFromPromptRunID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_RerunFromPromptRunID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_RerunFromPromptRunID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_RerunFromPromptRunID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_RerunFromPromptRunID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_RerunFromPromptRunID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_RerunFromPromptRunID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificRespon_874f7c := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_RerunFromPromptRunID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_RerunFromPromptRunID_RunName := _rec."RunName";
        p_MJAIPromptRuns_RerunFromPromptRunID_Comments := _rec."Comments";
        p_MJAIPromptRuns_RerunFromPromptRunID_TestRunID := _rec."TestRunID";
        p_MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill := _rec."AssistantPrefill";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead := _rec."TokensCacheRead";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite := _rec."TokensCacheWrite";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup := _rec."TokensCacheReadRollup";
        p_MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup := _rec."TokensCacheWriteRollup";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_RerunFromPromptRunIDID, p_PromptID => p_MJAIPromptRuns_RerunFromPromptRunID_PromptID, p_ModelID => p_MJAIPromptRuns_RerunFromPromptRunID_ModelID, p_VendorID => p_MJAIPromptRuns_RerunFromPromptRunID_VendorID, p_AgentID => p_MJAIPromptRuns_RerunFromPromptRunID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_RerunFromPromptRunID_RunAt, p_CompletedAt => p_MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_RerunFromPromptRunID_Messages, p_Result => p_MJAIPromptRuns_RerunFromPromptRunID_Result, p_TokensUsed => p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_RerunFromPromptRunID_TotalCost, p_Success => p_MJAIPromptRuns_RerunFromPromptRunID_Success, p_ErrorMessage => p_MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_RerunFromPromptRunID_ParentID, p_RunType => p_MJAIPromptRuns_RerunFromPromptRunID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, p_Cost => p_MJAIPromptRuns_RerunFromPromptRunID_Cost, p_CostCurrency => p_MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_RerunFromPromptRunID_Temperature, p_TopP => p_MJAIPromptRuns_RerunFromPromptRunID_TopP, p_TopK => p_MJAIPromptRuns_RerunFromPromptRunID_TopK, p_MinP => p_MJAIPromptRuns_RerunFromPromptRunID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, p_Seed => p_MJAIPromptRuns_RerunFromPromptRunID_Seed, p_StopSequences => p_MJAIPromptRuns_RerunFromPromptRunID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_RerunFromPromptRunID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, p_RerunFromPromptRunID_Clear => 1, p_RerunFromPromptRunID => p_MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, p_Status => p_MJAIPromptRuns_RerunFromPromptRunID_Status, p_Cancelled => p_MJAIPromptRuns_RerunFromPromptRunID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_RerunFromPromptRunID_CacheHit, p_CacheKey => p_MJAIPromptRuns_RerunFromPromptRunID_CacheKey, p_JudgeID => p_MJAIPromptRuns_RerunFromPromptRunID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_RerunFromPromptRunID_QueueTime, p_PromptTime => p_MJAIPromptRuns_RerunFromPromptRunID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificRespon_874f7c, p_EffortLevel => p_MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, p_RunName => p_MJAIPromptRuns_RerunFromPromptRunID_RunName, p_Comments => p_MJAIPromptRuns_RerunFromPromptRunID_Comments, p_TestRunID => p_MJAIPromptRuns_RerunFromPromptRunID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite, p_TokensCacheReadRollup => p_MJAIPromptRuns_RerunFromPromptRunID_TokensCacheReadRollup, p_TokensCacheWriteRollup => p_MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWriteRollup);

    END LOOP;

    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache


    FOR _rec IN SELECT "ID", "AIPromptID", "AIModelID", "RunAt", "PromptText", "ResultText", "Status", "ExpiredOn", "VendorID", "AgentID", "ConfigurationID", "PromptEmbedding", "PromptRunID" FROM __mj."AIResultCache" WHERE "PromptRunID" = p_ID
    LOOP
        p_MJAIResultCache_PromptRunIDID := _rec."ID";
        p_MJAIResultCache_PromptRunID_AIPromptID := _rec."AIPromptID";
        p_MJAIResultCache_PromptRunID_AIModelID := _rec."AIModelID";
        p_MJAIResultCache_PromptRunID_RunAt := _rec."RunAt";
        p_MJAIResultCache_PromptRunID_PromptText := _rec."PromptText";
        p_MJAIResultCache_PromptRunID_ResultText := _rec."ResultText";
        p_MJAIResultCache_PromptRunID_Status := _rec."Status";
        p_MJAIResultCache_PromptRunID_ExpiredOn := _rec."ExpiredOn";
        p_MJAIResultCache_PromptRunID_VendorID := _rec."VendorID";
        p_MJAIResultCache_PromptRunID_AgentID := _rec."AgentID";
        p_MJAIResultCache_PromptRunID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIResultCache_PromptRunID_PromptEmbedding := _rec."PromptEmbedding";
        p_MJAIResultCache_PromptRunID_PromptRunID := _rec."PromptRunID";
        -- Set the FK field to NULL
        p_MJAIResultCache_PromptRunID_PromptRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIResultCache"(p_ID => p_MJAIResultCache_PromptRunIDID, p_AIPromptID => p_MJAIResultCache_PromptRunID_AIPromptID, p_AIModelID => p_MJAIResultCache_PromptRunID_AIModelID, p_RunAt => p_MJAIResultCache_PromptRunID_RunAt, p_PromptText => p_MJAIResultCache_PromptRunID_PromptText, p_ResultText => p_MJAIResultCache_PromptRunID_ResultText, p_Status => p_MJAIResultCache_PromptRunID_Status, p_ExpiredOn => p_MJAIResultCache_PromptRunID_ExpiredOn, p_VendorID => p_MJAIResultCache_PromptRunID_VendorID, p_AgentID => p_MJAIResultCache_PromptRunID_AgentID, p_ConfigurationID => p_MJAIResultCache_PromptRunID_ConfigurationID, p_PromptEmbedding => p_MJAIResultCache_PromptRunID_PromptEmbedding, p_PromptRunID_Clear => 1, p_PromptRunID => p_MJAIResultCache_PromptRunID_PromptRunID);

    END LOOP;

    
    -- Cascade update on ContentItemTag using cursor to call spUpdateContentItemTag


    FOR _rec IN SELECT "ID", "ItemID", "Tag", "Weight", "TagID", "AIPromptRunID", "Reasoning" FROM __mj."ContentItemTag" WHERE "AIPromptRunID" = p_ID
    LOOP
        p_MJContentItemTags_AIPromptRunIDID := _rec."ID";
        p_MJContentItemTags_AIPromptRunID_ItemID := _rec."ItemID";
        p_MJContentItemTags_AIPromptRunID_Tag := _rec."Tag";
        p_MJContentItemTags_AIPromptRunID_Weight := _rec."Weight";
        p_MJContentItemTags_AIPromptRunID_TagID := _rec."TagID";
        p_MJContentItemTags_AIPromptRunID_AIPromptRunID := _rec."AIPromptRunID";
        p_MJContentItemTags_AIPromptRunID_Reasoning := _rec."Reasoning";
        -- Set the FK field to NULL
        p_MJContentItemTags_AIPromptRunID_AIPromptRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateContentItemTag"(p_ID => p_MJContentItemTags_AIPromptRunIDID, p_ItemID => p_MJContentItemTags_AIPromptRunID_ItemID, p_Tag => p_MJContentItemTags_AIPromptRunID_Tag, p_Weight => p_MJContentItemTags_AIPromptRunID_Weight, p_TagID => p_MJContentItemTags_AIPromptRunID_TagID, p_AIPromptRunID_Clear => 1, p_AIPromptRunID => p_MJContentItemTags_AIPromptRunID_AIPromptRunID, p_Reasoning => p_MJContentItemTags_AIPromptRunID_Reasoning);

    END LOOP;

    
    -- Cascade delete from ContentProcessRunPromptRun using cursor to call spDeleteContentProcessRunPromptRun

    FOR _rec IN SELECT "ID" FROM __mj."ContentProcessRunPromptRun" WHERE "AIPromptRunID" = p_ID
    LOOP
        p_MJContentProcessRunPromptRuns_AIPromptRunIDID := _rec."ID";
        PERFORM __mj."spDeleteContentProcessRunPromptRun"(p_ID => p_MJContentProcessRunPromptRuns_AIPromptRunIDID);
        
    END LOOP;
    
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged", "AgentSessionID", "TurnEndedAt", "UtteranceStartMs", "UtteranceEndMs", "MediaType", "Sequence", "SummaryPromptRunID" FROM __mj."ConversationDetail" WHERE "SummaryPromptRunID" = p_ID
    LOOP
        p_MJConversationDetails_SummaryPromptRunIDID := _rec."ID";
        p_MJConversationDetails_SummaryPromptRunID_ConversationID := _rec."ConversationID";
        p_MJConversationDetails_SummaryPromptRunID_ExternalID := _rec."ExternalID";
        p_MJConversationDetails_SummaryPromptRunID_Role := _rec."Role";
        p_MJConversationDetails_SummaryPromptRunID_Message := _rec."Message";
        p_MJConversationDetails_SummaryPromptRunID_Error := _rec."Error";
        p_MJConversationDetails_SummaryPromptRunID_HiddenToUser := _rec."HiddenToUser";
        p_MJConversationDetails_SummaryPromptRunID_UserRating := _rec."UserRating";
        p_MJConversationDetails_SummaryPromptRunID_UserFeedback := _rec."UserFeedback";
        p_MJConversationDetails_SummaryPromptRunID_ReflectionInsights := _rec."ReflectionInsights";
        p_MJConversationDetails_SummaryPromptRunID_SummaryOfEarli_8f3b0c := _rec."SummaryOfEarlierConversation";
        p_MJConversationDetails_SummaryPromptRunID_UserID := _rec."UserID";
        p_MJConversationDetails_SummaryPromptRunID_ArtifactID := _rec."ArtifactID";
        p_MJConversationDetails_SummaryPromptRunID_ArtifactVersionID := _rec."ArtifactVersionID";
        p_MJConversationDetails_SummaryPromptRunID_CompletionTime := _rec."CompletionTime";
        p_MJConversationDetails_SummaryPromptRunID_IsPinned := _rec."IsPinned";
        p_MJConversationDetails_SummaryPromptRunID_ParentID := _rec."ParentID";
        p_MJConversationDetails_SummaryPromptRunID_AgentID := _rec."AgentID";
        p_MJConversationDetails_SummaryPromptRunID_Status := _rec."Status";
        p_MJConversationDetails_SummaryPromptRunID_SuggestedResponses := _rec."SuggestedResponses";
        p_MJConversationDetails_SummaryPromptRunID_TestRunID := _rec."TestRunID";
        p_MJConversationDetails_SummaryPromptRunID_ResponseForm := _rec."ResponseForm";
        p_MJConversationDetails_SummaryPromptRunID_ActionableCommands := _rec."ActionableCommands";
        p_MJConversationDetails_SummaryPromptRunID_AutomaticCommands := _rec."AutomaticCommands";
        p_MJConversationDetails_SummaryPromptRunID_OriginalMessag_38a835 := _rec."OriginalMessageChanged";
        p_MJConversationDetails_SummaryPromptRunID_AgentSessionID := _rec."AgentSessionID";
        p_MJConversationDetails_SummaryPromptRunID_TurnEndedAt := _rec."TurnEndedAt";
        p_MJConversationDetails_SummaryPromptRunID_UtteranceStartMs := _rec."UtteranceStartMs";
        p_MJConversationDetails_SummaryPromptRunID_UtteranceEndMs := _rec."UtteranceEndMs";
        p_MJConversationDetails_SummaryPromptRunID_MediaType := _rec."MediaType";
        p_MJConversationDetails_SummaryPromptRunID_Sequence := _rec."Sequence";
        p_MJConversationDetails_SummaryPromptRunID_SummaryPromptRunID := _rec."SummaryPromptRunID";
        -- Set the FK field to NULL
        p_MJConversationDetails_SummaryPromptRunID_SummaryPromptRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_SummaryPromptRunIDID, p_ConversationID => p_MJConversationDetails_SummaryPromptRunID_ConversationID, p_ExternalID => p_MJConversationDetails_SummaryPromptRunID_ExternalID, p_Role => p_MJConversationDetails_SummaryPromptRunID_Role, p_Message => p_MJConversationDetails_SummaryPromptRunID_Message, p_Error => p_MJConversationDetails_SummaryPromptRunID_Error, p_HiddenToUser => p_MJConversationDetails_SummaryPromptRunID_HiddenToUser, p_UserRating => p_MJConversationDetails_SummaryPromptRunID_UserRating, p_UserFeedback => p_MJConversationDetails_SummaryPromptRunID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_SummaryPromptRunID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_SummaryPromptRunID_SummaryOfEarli_8f3b0c, p_UserID => p_MJConversationDetails_SummaryPromptRunID_UserID, p_ArtifactID => p_MJConversationDetails_SummaryPromptRunID_ArtifactID, p_ArtifactVersionID => p_MJConversationDetails_SummaryPromptRunID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_SummaryPromptRunID_CompletionTime, p_IsPinned => p_MJConversationDetails_SummaryPromptRunID_IsPinned, p_ParentID => p_MJConversationDetails_SummaryPromptRunID_ParentID, p_AgentID => p_MJConversationDetails_SummaryPromptRunID_AgentID, p_Status => p_MJConversationDetails_SummaryPromptRunID_Status, p_SuggestedResponses => p_MJConversationDetails_SummaryPromptRunID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_SummaryPromptRunID_TestRunID, p_ResponseForm => p_MJConversationDetails_SummaryPromptRunID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_SummaryPromptRunID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_SummaryPromptRunID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_SummaryPromptRunID_OriginalMessag_38a835, p_AgentSessionID => p_MJConversationDetails_SummaryPromptRunID_AgentSessionID, p_TurnEndedAt => p_MJConversationDetails_SummaryPromptRunID_TurnEndedAt, p_UtteranceStartMs => p_MJConversationDetails_SummaryPromptRunID_UtteranceStartMs, p_UtteranceEndMs => p_MJConversationDetails_SummaryPromptRunID_UtteranceEndMs, p_MediaType => p_MJConversationDetails_SummaryPromptRunID_MediaType, p_Sequence => p_MJConversationDetails_SummaryPromptRunID_Sequence, p_SummaryPromptRunID_Clear => 1, p_SummaryPromptRunID => p_MJConversationDetails_SummaryPromptRunID_SummaryPromptRunID);

    END LOOP;

    
    -- Cascade update on DuplicateRunDetailMatch using cursor to call spUpdateDuplicateRunDetailMatch


    FOR _rec IN SELECT "ID", "DuplicateRunDetailID", "MatchSource", "MatchRecordID", "MatchProbability", "MatchedAt", "Action", "ApprovalStatus", "RecordMergeLogID", "MergeStatus", "MergedAt", "RecordMetadata", "AIAgentRunID", "AIPromptRunID", "LLMRecommendation", "LLMConfidence", "LLMReasoning", "LLMProposedSurvivorRecordID", "LLMProposedFieldMap" FROM __mj."DuplicateRunDetailMatch" WHERE "AIPromptRunID" = p_ID
    LOOP
        p_MJDuplicateRunDetailMatches_AIPromptRunIDID := _rec."ID";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_DuplicateRunD_cabc8a := _rec."DuplicateRunDetailID";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_MatchSource := _rec."MatchSource";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_MatchRecordID := _rec."MatchRecordID";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_MatchProbability := _rec."MatchProbability";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_MatchedAt := _rec."MatchedAt";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_Action := _rec."Action";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_ApprovalStatus := _rec."ApprovalStatus";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_RecordMergeLogID := _rec."RecordMergeLogID";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_MergeStatus := _rec."MergeStatus";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_MergedAt := _rec."MergedAt";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_RecordMetadata := _rec."RecordMetadata";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_AIAgentRunID := _rec."AIAgentRunID";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID := _rec."AIPromptRunID";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_LLMRecommendation := _rec."LLMRecommendation";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_LLMConfidence := _rec."LLMConfidence";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_LLMReasoning := _rec."LLMReasoning";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedSu_a07a48 := _rec."LLMProposedSurvivorRecordID";
        p_MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedFieldMap := _rec."LLMProposedFieldMap";
        -- Set the FK field to NULL
        p_MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateDuplicateRunDetailMatch"(p_ID => p_MJDuplicateRunDetailMatches_AIPromptRunIDID, p_DuplicateRunDetailID => p_MJDuplicateRunDetailMatches_AIPromptRunID_DuplicateRunD_cabc8a, p_MatchSource => p_MJDuplicateRunDetailMatches_AIPromptRunID_MatchSource, p_MatchRecordID => p_MJDuplicateRunDetailMatches_AIPromptRunID_MatchRecordID, p_MatchProbability => p_MJDuplicateRunDetailMatches_AIPromptRunID_MatchProbability, p_MatchedAt => p_MJDuplicateRunDetailMatches_AIPromptRunID_MatchedAt, p_Action => p_MJDuplicateRunDetailMatches_AIPromptRunID_Action, p_ApprovalStatus => p_MJDuplicateRunDetailMatches_AIPromptRunID_ApprovalStatus, p_RecordMergeLogID => p_MJDuplicateRunDetailMatches_AIPromptRunID_RecordMergeLogID, p_MergeStatus => p_MJDuplicateRunDetailMatches_AIPromptRunID_MergeStatus, p_MergedAt => p_MJDuplicateRunDetailMatches_AIPromptRunID_MergedAt, p_RecordMetadata => p_MJDuplicateRunDetailMatches_AIPromptRunID_RecordMetadata, p_AIAgentRunID => p_MJDuplicateRunDetailMatches_AIPromptRunID_AIAgentRunID, p_AIPromptRunID_Clear => 1, p_AIPromptRunID => p_MJDuplicateRunDetailMatches_AIPromptRunID_AIPromptRunID, p_LLMRecommendation => p_MJDuplicateRunDetailMatches_AIPromptRunID_LLMRecommendation, p_LLMConfidence => p_MJDuplicateRunDetailMatches_AIPromptRunID_LLMConfidence, p_LLMReasoning => p_MJDuplicateRunDetailMatches_AIPromptRunID_LLMReasoning, p_LLMProposedSurvivorRecordID => p_MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedSu_a07a48, p_LLMProposedFieldMap => p_MJDuplicateRunDetailMatches_AIPromptRunID_LLMProposedFieldMap);

    END LOOP;

    
    -- Cascade update on UserRoutineRun using cursor to call spUpdateUserRoutineRun


    FOR _rec IN SELECT "ID", "RoutineID", "StartedAt", "CompletedAt", "Status", "AgentRunID", "PromptRunID", "ActionExecutionLogID", "ResultSummary", "ResultHash", "NotificationSent", "ErrorMessage" FROM __mj."UserRoutineRun" WHERE "PromptRunID" = p_ID
    LOOP
        p_MJUserRoutineRuns_PromptRunIDID := _rec."ID";
        p_MJUserRoutineRuns_PromptRunID_RoutineID := _rec."RoutineID";
        p_MJUserRoutineRuns_PromptRunID_StartedAt := _rec."StartedAt";
        p_MJUserRoutineRuns_PromptRunID_CompletedAt := _rec."CompletedAt";
        p_MJUserRoutineRuns_PromptRunID_Status := _rec."Status";
        p_MJUserRoutineRuns_PromptRunID_AgentRunID := _rec."AgentRunID";
        p_MJUserRoutineRuns_PromptRunID_PromptRunID := _rec."PromptRunID";
        p_MJUserRoutineRuns_PromptRunID_ActionExecutionLogID := _rec."ActionExecutionLogID";
        p_MJUserRoutineRuns_PromptRunID_ResultSummary := _rec."ResultSummary";
        p_MJUserRoutineRuns_PromptRunID_ResultHash := _rec."ResultHash";
        p_MJUserRoutineRuns_PromptRunID_NotificationSent := _rec."NotificationSent";
        p_MJUserRoutineRuns_PromptRunID_ErrorMessage := _rec."ErrorMessage";
        -- Set the FK field to NULL
        p_MJUserRoutineRuns_PromptRunID_PromptRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateUserRoutineRun"(p_ID => p_MJUserRoutineRuns_PromptRunIDID, p_RoutineID => p_MJUserRoutineRuns_PromptRunID_RoutineID, p_StartedAt => p_MJUserRoutineRuns_PromptRunID_StartedAt, p_CompletedAt => p_MJUserRoutineRuns_PromptRunID_CompletedAt, p_Status => p_MJUserRoutineRuns_PromptRunID_Status, p_AgentRunID => p_MJUserRoutineRuns_PromptRunID_AgentRunID, p_PromptRunID_Clear => 1, p_PromptRunID => p_MJUserRoutineRuns_PromptRunID_PromptRunID, p_ActionExecutionLogID => p_MJUserRoutineRuns_PromptRunID_ActionExecutionLogID, p_ResultSummary => p_MJUserRoutineRuns_PromptRunID_ResultSummary, p_ResultHash => p_MJUserRoutineRuns_PromptRunID_ResultHash, p_NotificationSent => p_MJUserRoutineRuns_PromptRunID_NotificationSent, p_ErrorMessage => p_MJUserRoutineRuns_PromptRunID_ErrorMessage);

    END LOOP;

    

    DELETE FROM
        __mj."AIPromptRun"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteConversationArtifactVersion'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationArtifactVersion"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJConversationDetails_ArtifactVersionIDID UUID;
    p_MJConversationDetails_ArtifactVersionID_ConversationID UUID;
    p_MJConversationDetails_ArtifactVersionID_ExternalID VARCHAR(100);
    p_MJConversationDetails_ArtifactVersionID_Role VARCHAR(20);
    p_MJConversationDetails_ArtifactVersionID_Message TEXT;
    p_MJConversationDetails_ArtifactVersionID_Error TEXT;
    p_MJConversationDetails_ArtifactVersionID_HiddenToUser BOOLEAN;
    p_MJConversationDetails_ArtifactVersionID_UserRating INTEGER;
    p_MJConversationDetails_ArtifactVersionID_UserFeedback TEXT;
    p_MJConversationDetails_ArtifactVersionID_ReflectionInsights TEXT;
    p_MJConversationDetails_ArtifactVersionID_SummaryOfEarlie_0dd4da TEXT;
    p_MJConversationDetails_ArtifactVersionID_UserID UUID;
    p_MJConversationDetails_ArtifactVersionID_ArtifactID UUID;
    p_MJConversationDetails_ArtifactVersionID_ArtifactVersionID UUID;
    p_MJConversationDetails_ArtifactVersionID_CompletionTime BIGINT;
    p_MJConversationDetails_ArtifactVersionID_IsPinned BOOLEAN;
    p_MJConversationDetails_ArtifactVersionID_ParentID UUID;
    p_MJConversationDetails_ArtifactVersionID_AgentID UUID;
    p_MJConversationDetails_ArtifactVersionID_Status VARCHAR(20);
    p_MJConversationDetails_ArtifactVersionID_SuggestedResponses TEXT;
    p_MJConversationDetails_ArtifactVersionID_TestRunID UUID;
    p_MJConversationDetails_ArtifactVersionID_ResponseForm TEXT;
    p_MJConversationDetails_ArtifactVersionID_ActionableCommands TEXT;
    p_MJConversationDetails_ArtifactVersionID_AutomaticCommands TEXT;
    p_MJConversationDetails_ArtifactVersionID_OriginalMessage_672e5e BOOLEAN;
    p_MJConversationDetails_ArtifactVersionID_AgentSessionID UUID;
    p_MJConversationDetails_ArtifactVersionID_TurnEndedAt TIMESTAMPTZ;
    p_MJConversationDetails_ArtifactVersionID_UtteranceStartMs INTEGER;
    p_MJConversationDetails_ArtifactVersionID_UtteranceEndMs INTEGER;
    p_MJConversationDetails_ArtifactVersionID_MediaType VARCHAR(20);
    p_MJConversationDetails_ArtifactVersionID_Sequence INTEGER;
    p_MJConversationDetails_ArtifactVersionID_SummaryPromptRunID UUID;
BEGIN
-- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged", "AgentSessionID", "TurnEndedAt", "UtteranceStartMs", "UtteranceEndMs", "MediaType", "Sequence", "SummaryPromptRunID" FROM __mj."ConversationDetail" WHERE "ArtifactVersionID" = p_ID
    LOOP
        p_MJConversationDetails_ArtifactVersionIDID := _rec."ID";
        p_MJConversationDetails_ArtifactVersionID_ConversationID := _rec."ConversationID";
        p_MJConversationDetails_ArtifactVersionID_ExternalID := _rec."ExternalID";
        p_MJConversationDetails_ArtifactVersionID_Role := _rec."Role";
        p_MJConversationDetails_ArtifactVersionID_Message := _rec."Message";
        p_MJConversationDetails_ArtifactVersionID_Error := _rec."Error";
        p_MJConversationDetails_ArtifactVersionID_HiddenToUser := _rec."HiddenToUser";
        p_MJConversationDetails_ArtifactVersionID_UserRating := _rec."UserRating";
        p_MJConversationDetails_ArtifactVersionID_UserFeedback := _rec."UserFeedback";
        p_MJConversationDetails_ArtifactVersionID_ReflectionInsights := _rec."ReflectionInsights";
        p_MJConversationDetails_ArtifactVersionID_SummaryOfEarlie_0dd4da := _rec."SummaryOfEarlierConversation";
        p_MJConversationDetails_ArtifactVersionID_UserID := _rec."UserID";
        p_MJConversationDetails_ArtifactVersionID_ArtifactID := _rec."ArtifactID";
        p_MJConversationDetails_ArtifactVersionID_ArtifactVersionID := _rec."ArtifactVersionID";
        p_MJConversationDetails_ArtifactVersionID_CompletionTime := _rec."CompletionTime";
        p_MJConversationDetails_ArtifactVersionID_IsPinned := _rec."IsPinned";
        p_MJConversationDetails_ArtifactVersionID_ParentID := _rec."ParentID";
        p_MJConversationDetails_ArtifactVersionID_AgentID := _rec."AgentID";
        p_MJConversationDetails_ArtifactVersionID_Status := _rec."Status";
        p_MJConversationDetails_ArtifactVersionID_SuggestedResponses := _rec."SuggestedResponses";
        p_MJConversationDetails_ArtifactVersionID_TestRunID := _rec."TestRunID";
        p_MJConversationDetails_ArtifactVersionID_ResponseForm := _rec."ResponseForm";
        p_MJConversationDetails_ArtifactVersionID_ActionableCommands := _rec."ActionableCommands";
        p_MJConversationDetails_ArtifactVersionID_AutomaticCommands := _rec."AutomaticCommands";
        p_MJConversationDetails_ArtifactVersionID_OriginalMessage_672e5e := _rec."OriginalMessageChanged";
        p_MJConversationDetails_ArtifactVersionID_AgentSessionID := _rec."AgentSessionID";
        p_MJConversationDetails_ArtifactVersionID_TurnEndedAt := _rec."TurnEndedAt";
        p_MJConversationDetails_ArtifactVersionID_UtteranceStartMs := _rec."UtteranceStartMs";
        p_MJConversationDetails_ArtifactVersionID_UtteranceEndMs := _rec."UtteranceEndMs";
        p_MJConversationDetails_ArtifactVersionID_MediaType := _rec."MediaType";
        p_MJConversationDetails_ArtifactVersionID_Sequence := _rec."Sequence";
        p_MJConversationDetails_ArtifactVersionID_SummaryPromptRunID := _rec."SummaryPromptRunID";
        -- Set the FK field to NULL
        p_MJConversationDetails_ArtifactVersionID_ArtifactVersionID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_ArtifactVersionIDID, p_ConversationID => p_MJConversationDetails_ArtifactVersionID_ConversationID, p_ExternalID => p_MJConversationDetails_ArtifactVersionID_ExternalID, p_Role => p_MJConversationDetails_ArtifactVersionID_Role, p_Message => p_MJConversationDetails_ArtifactVersionID_Message, p_Error => p_MJConversationDetails_ArtifactVersionID_Error, p_HiddenToUser => p_MJConversationDetails_ArtifactVersionID_HiddenToUser, p_UserRating => p_MJConversationDetails_ArtifactVersionID_UserRating, p_UserFeedback => p_MJConversationDetails_ArtifactVersionID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_ArtifactVersionID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_ArtifactVersionID_SummaryOfEarlie_0dd4da, p_UserID => p_MJConversationDetails_ArtifactVersionID_UserID, p_ArtifactID => p_MJConversationDetails_ArtifactVersionID_ArtifactID, p_ArtifactVersionID_Clear => 1, p_ArtifactVersionID => p_MJConversationDetails_ArtifactVersionID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_ArtifactVersionID_CompletionTime, p_IsPinned => p_MJConversationDetails_ArtifactVersionID_IsPinned, p_ParentID => p_MJConversationDetails_ArtifactVersionID_ParentID, p_AgentID => p_MJConversationDetails_ArtifactVersionID_AgentID, p_Status => p_MJConversationDetails_ArtifactVersionID_Status, p_SuggestedResponses => p_MJConversationDetails_ArtifactVersionID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_ArtifactVersionID_TestRunID, p_ResponseForm => p_MJConversationDetails_ArtifactVersionID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_ArtifactVersionID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_ArtifactVersionID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_ArtifactVersionID_OriginalMessage_672e5e, p_AgentSessionID => p_MJConversationDetails_ArtifactVersionID_AgentSessionID, p_TurnEndedAt => p_MJConversationDetails_ArtifactVersionID_TurnEndedAt, p_UtteranceStartMs => p_MJConversationDetails_ArtifactVersionID_UtteranceStartMs, p_UtteranceEndMs => p_MJConversationDetails_ArtifactVersionID_UtteranceEndMs, p_MediaType => p_MJConversationDetails_ArtifactVersionID_MediaType, p_Sequence => p_MJConversationDetails_ArtifactVersionID_Sequence, p_SummaryPromptRunID => p_MJConversationDetails_ArtifactVersionID_SummaryPromptRunID);

    END LOOP;

    

    DELETE FROM
        __mj."ConversationArtifactVersion"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteConversationArtifact'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationArtifact"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJConversationArtifactPermissions_ConversationArtifactIDID UUID;
    p_MJConversationArtifactVersions_ConversationArtifactIDID UUID;
    p_MJConversationDetails_ArtifactIDID UUID;
    p_MJConversationDetails_ArtifactID_ConversationID UUID;
    p_MJConversationDetails_ArtifactID_ExternalID VARCHAR(100);
    p_MJConversationDetails_ArtifactID_Role VARCHAR(20);
    p_MJConversationDetails_ArtifactID_Message TEXT;
    p_MJConversationDetails_ArtifactID_Error TEXT;
    p_MJConversationDetails_ArtifactID_HiddenToUser BOOLEAN;
    p_MJConversationDetails_ArtifactID_UserRating INTEGER;
    p_MJConversationDetails_ArtifactID_UserFeedback TEXT;
    p_MJConversationDetails_ArtifactID_ReflectionInsights TEXT;
    p_MJConversationDetails_ArtifactID_SummaryOfEarlierConversation TEXT;
    p_MJConversationDetails_ArtifactID_UserID UUID;
    p_MJConversationDetails_ArtifactID_ArtifactID UUID;
    p_MJConversationDetails_ArtifactID_ArtifactVersionID UUID;
    p_MJConversationDetails_ArtifactID_CompletionTime BIGINT;
    p_MJConversationDetails_ArtifactID_IsPinned BOOLEAN;
    p_MJConversationDetails_ArtifactID_ParentID UUID;
    p_MJConversationDetails_ArtifactID_AgentID UUID;
    p_MJConversationDetails_ArtifactID_Status VARCHAR(20);
    p_MJConversationDetails_ArtifactID_SuggestedResponses TEXT;
    p_MJConversationDetails_ArtifactID_TestRunID UUID;
    p_MJConversationDetails_ArtifactID_ResponseForm TEXT;
    p_MJConversationDetails_ArtifactID_ActionableCommands TEXT;
    p_MJConversationDetails_ArtifactID_AutomaticCommands TEXT;
    p_MJConversationDetails_ArtifactID_OriginalMessageChanged BOOLEAN;
    p_MJConversationDetails_ArtifactID_AgentSessionID UUID;
    p_MJConversationDetails_ArtifactID_TurnEndedAt TIMESTAMPTZ;
    p_MJConversationDetails_ArtifactID_UtteranceStartMs INTEGER;
    p_MJConversationDetails_ArtifactID_UtteranceEndMs INTEGER;
    p_MJConversationDetails_ArtifactID_MediaType VARCHAR(20);
    p_MJConversationDetails_ArtifactID_Sequence INTEGER;
    p_MJConversationDetails_ArtifactID_SummaryPromptRunID UUID;
BEGIN
-- Cascade delete from ConversationArtifactPermission using cursor to call spDeleteConversationArtifactPermission

    FOR _rec IN SELECT "ID" FROM __mj."ConversationArtifactPermission" WHERE "ConversationArtifactID" = p_ID
    LOOP
        p_MJConversationArtifactPermissions_ConversationArtifactIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationArtifactPermission"(p_ID => p_MJConversationArtifactPermissions_ConversationArtifactIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ConversationArtifactVersion using cursor to call spDeleteConversationArtifactVersion

    FOR _rec IN SELECT "ID" FROM __mj."ConversationArtifactVersion" WHERE "ConversationArtifactID" = p_ID
    LOOP
        p_MJConversationArtifactVersions_ConversationArtifactIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationArtifactVersion"(p_ID => p_MJConversationArtifactVersions_ConversationArtifactIDID);
        
    END LOOP;
    
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged", "AgentSessionID", "TurnEndedAt", "UtteranceStartMs", "UtteranceEndMs", "MediaType", "Sequence", "SummaryPromptRunID" FROM __mj."ConversationDetail" WHERE "ArtifactID" = p_ID
    LOOP
        p_MJConversationDetails_ArtifactIDID := _rec."ID";
        p_MJConversationDetails_ArtifactID_ConversationID := _rec."ConversationID";
        p_MJConversationDetails_ArtifactID_ExternalID := _rec."ExternalID";
        p_MJConversationDetails_ArtifactID_Role := _rec."Role";
        p_MJConversationDetails_ArtifactID_Message := _rec."Message";
        p_MJConversationDetails_ArtifactID_Error := _rec."Error";
        p_MJConversationDetails_ArtifactID_HiddenToUser := _rec."HiddenToUser";
        p_MJConversationDetails_ArtifactID_UserRating := _rec."UserRating";
        p_MJConversationDetails_ArtifactID_UserFeedback := _rec."UserFeedback";
        p_MJConversationDetails_ArtifactID_ReflectionInsights := _rec."ReflectionInsights";
        p_MJConversationDetails_ArtifactID_SummaryOfEarlierConversation := _rec."SummaryOfEarlierConversation";
        p_MJConversationDetails_ArtifactID_UserID := _rec."UserID";
        p_MJConversationDetails_ArtifactID_ArtifactID := _rec."ArtifactID";
        p_MJConversationDetails_ArtifactID_ArtifactVersionID := _rec."ArtifactVersionID";
        p_MJConversationDetails_ArtifactID_CompletionTime := _rec."CompletionTime";
        p_MJConversationDetails_ArtifactID_IsPinned := _rec."IsPinned";
        p_MJConversationDetails_ArtifactID_ParentID := _rec."ParentID";
        p_MJConversationDetails_ArtifactID_AgentID := _rec."AgentID";
        p_MJConversationDetails_ArtifactID_Status := _rec."Status";
        p_MJConversationDetails_ArtifactID_SuggestedResponses := _rec."SuggestedResponses";
        p_MJConversationDetails_ArtifactID_TestRunID := _rec."TestRunID";
        p_MJConversationDetails_ArtifactID_ResponseForm := _rec."ResponseForm";
        p_MJConversationDetails_ArtifactID_ActionableCommands := _rec."ActionableCommands";
        p_MJConversationDetails_ArtifactID_AutomaticCommands := _rec."AutomaticCommands";
        p_MJConversationDetails_ArtifactID_OriginalMessageChanged := _rec."OriginalMessageChanged";
        p_MJConversationDetails_ArtifactID_AgentSessionID := _rec."AgentSessionID";
        p_MJConversationDetails_ArtifactID_TurnEndedAt := _rec."TurnEndedAt";
        p_MJConversationDetails_ArtifactID_UtteranceStartMs := _rec."UtteranceStartMs";
        p_MJConversationDetails_ArtifactID_UtteranceEndMs := _rec."UtteranceEndMs";
        p_MJConversationDetails_ArtifactID_MediaType := _rec."MediaType";
        p_MJConversationDetails_ArtifactID_Sequence := _rec."Sequence";
        p_MJConversationDetails_ArtifactID_SummaryPromptRunID := _rec."SummaryPromptRunID";
        -- Set the FK field to NULL
        p_MJConversationDetails_ArtifactID_ArtifactID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_ArtifactIDID, p_ConversationID => p_MJConversationDetails_ArtifactID_ConversationID, p_ExternalID => p_MJConversationDetails_ArtifactID_ExternalID, p_Role => p_MJConversationDetails_ArtifactID_Role, p_Message => p_MJConversationDetails_ArtifactID_Message, p_Error => p_MJConversationDetails_ArtifactID_Error, p_HiddenToUser => p_MJConversationDetails_ArtifactID_HiddenToUser, p_UserRating => p_MJConversationDetails_ArtifactID_UserRating, p_UserFeedback => p_MJConversationDetails_ArtifactID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_ArtifactID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_ArtifactID_SummaryOfEarlierConversation, p_UserID => p_MJConversationDetails_ArtifactID_UserID, p_ArtifactID_Clear => 1, p_ArtifactID => p_MJConversationDetails_ArtifactID_ArtifactID, p_ArtifactVersionID => p_MJConversationDetails_ArtifactID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_ArtifactID_CompletionTime, p_IsPinned => p_MJConversationDetails_ArtifactID_IsPinned, p_ParentID => p_MJConversationDetails_ArtifactID_ParentID, p_AgentID => p_MJConversationDetails_ArtifactID_AgentID, p_Status => p_MJConversationDetails_ArtifactID_Status, p_SuggestedResponses => p_MJConversationDetails_ArtifactID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_ArtifactID_TestRunID, p_ResponseForm => p_MJConversationDetails_ArtifactID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_ArtifactID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_ArtifactID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_ArtifactID_OriginalMessageChanged, p_AgentSessionID => p_MJConversationDetails_ArtifactID_AgentSessionID, p_TurnEndedAt => p_MJConversationDetails_ArtifactID_TurnEndedAt, p_UtteranceStartMs => p_MJConversationDetails_ArtifactID_UtteranceStartMs, p_UtteranceEndMs => p_MJConversationDetails_ArtifactID_UtteranceEndMs, p_MediaType => p_MJConversationDetails_ArtifactID_MediaType, p_Sequence => p_MJConversationDetails_ArtifactID_Sequence, p_SummaryPromptRunID => p_MJConversationDetails_ArtifactID_SummaryPromptRunID);

    END LOOP;

    

    DELETE FROM
        __mj."ConversationArtifact"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteConversation'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversation"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJAIAgentExamples_SourceConversationIDID UUID;
    p_MJAIAgentExamples_SourceConversationID_AgentID UUID;
    p_MJAIAgentExamples_SourceConversationID_UserID UUID;
    p_MJAIAgentExamples_SourceConversationID_CompanyID UUID;
    p_MJAIAgentExamples_SourceConversationID_Type VARCHAR(20);
    p_MJAIAgentExamples_SourceConversationID_ExampleInput TEXT;
    p_MJAIAgentExamples_SourceConversationID_ExampleOutput TEXT;
    p_MJAIAgentExamples_SourceConversationID_IsAutoGenerated BOOLEAN;
    p_MJAIAgentExamples_SourceConversationID_SourceConversationID UUID;
    p_MJAIAgentExamples_SourceConversationID_SourceConversati_b98bb5 UUID;
    p_MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID UUID;
    p_MJAIAgentExamples_SourceConversationID_SuccessScore NUMERIC(5,2);
    p_MJAIAgentExamples_SourceConversationID_Comments TEXT;
    p_MJAIAgentExamples_SourceConversationID_Status VARCHAR(20);
    p_MJAIAgentExamples_SourceConversationID_EmbeddingVector TEXT;
    p_MJAIAgentExamples_SourceConversationID_EmbeddingModelID UUID;
    p_MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID UUID;
    p_MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentExamples_SourceConversationID_SecondaryScopes TEXT;
    p_MJAIAgentExamples_SourceConversationID_LastAccessedAt TIMESTAMPTZ;
    p_MJAIAgentExamples_SourceConversationID_AccessCount INTEGER;
    p_MJAIAgentExamples_SourceConversationID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceConversationIDID UUID;
    p_MJAIAgentNotes_SourceConversationID_AgentID UUID;
    p_MJAIAgentNotes_SourceConversationID_AgentNoteTypeID UUID;
    p_MJAIAgentNotes_SourceConversationID_Note TEXT;
    p_MJAIAgentNotes_SourceConversationID_UserID UUID;
    p_MJAIAgentNotes_SourceConversationID_Type VARCHAR(20);
    p_MJAIAgentNotes_SourceConversationID_IsAutoGenerated BOOLEAN;
    p_MJAIAgentNotes_SourceConversationID_Comments TEXT;
    p_MJAIAgentNotes_SourceConversationID_Status VARCHAR(20);
    p_MJAIAgentNotes_SourceConversationID_SourceConversationID UUID;
    p_MJAIAgentNotes_SourceConversationID_SourceConversationD_de4992 UUID;
    p_MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID UUID;
    p_MJAIAgentNotes_SourceConversationID_CompanyID UUID;
    p_MJAIAgentNotes_SourceConversationID_EmbeddingVector TEXT;
    p_MJAIAgentNotes_SourceConversationID_EmbeddingModelID UUID;
    p_MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID UUID;
    p_MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentNotes_SourceConversationID_SecondaryScopes TEXT;
    p_MJAIAgentNotes_SourceConversationID_LastAccessedAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceConversationID_AccessCount INTEGER;
    p_MJAIAgentNotes_SourceConversationID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID UUID;
    p_MJAIAgentNotes_SourceConversationID_ConsolidationCount INTEGER;
    p_MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs TEXT;
    p_MJAIAgentNotes_SourceConversationID_ProtectionTier VARCHAR(20);
    p_MJAIAgentNotes_SourceConversationID_ImportanceScore NUMERIC(5,2);
    p_MJAIAgentNotes_SourceConversationID_AuthorType VARCHAR(20);
    p_MJAIAgentRuns_ConversationIDID UUID;
    p_MJAIAgentRuns_ConversationID_AgentID UUID;
    p_MJAIAgentRuns_ConversationID_ParentRunID UUID;
    p_MJAIAgentRuns_ConversationID_Status VARCHAR(50);
    p_MJAIAgentRuns_ConversationID_StartedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConversationID_CompletedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConversationID_Success BOOLEAN;
    p_MJAIAgentRuns_ConversationID_ErrorMessage TEXT;
    p_MJAIAgentRuns_ConversationID_ConversationID UUID;
    p_MJAIAgentRuns_ConversationID_UserID UUID;
    p_MJAIAgentRuns_ConversationID_Result TEXT;
    p_MJAIAgentRuns_ConversationID_AgentState TEXT;
    p_MJAIAgentRuns_ConversationID_TotalTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalCost NUMERIC(18,6);
    p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalCostRollup NUMERIC(19,8);
    p_MJAIAgentRuns_ConversationID_ConversationDetailID UUID;
    p_MJAIAgentRuns_ConversationID_ConversationDetailSequence INTEGER;
    p_MJAIAgentRuns_ConversationID_CancellationReason VARCHAR(30);
    p_MJAIAgentRuns_ConversationID_FinalStep VARCHAR(30);
    p_MJAIAgentRuns_ConversationID_FinalPayload TEXT;
    p_MJAIAgentRuns_ConversationID_Message TEXT;
    p_MJAIAgentRuns_ConversationID_LastRunID UUID;
    p_MJAIAgentRuns_ConversationID_StartingPayload TEXT;
    p_MJAIAgentRuns_ConversationID_TotalPromptIterations INTEGER;
    p_MJAIAgentRuns_ConversationID_ConfigurationID UUID;
    p_MJAIAgentRuns_ConversationID_OverrideModelID UUID;
    p_MJAIAgentRuns_ConversationID_OverrideVendorID UUID;
    p_MJAIAgentRuns_ConversationID_Data TEXT;
    p_MJAIAgentRuns_ConversationID_Verbose BOOLEAN;
    p_MJAIAgentRuns_ConversationID_EffortLevel INTEGER;
    p_MJAIAgentRuns_ConversationID_RunName VARCHAR(255);
    p_MJAIAgentRuns_ConversationID_Comments TEXT;
    p_MJAIAgentRuns_ConversationID_ScheduledJobRunID UUID;
    p_MJAIAgentRuns_ConversationID_TestRunID UUID;
    p_MJAIAgentRuns_ConversationID_PrimaryScopeEntityID UUID;
    p_MJAIAgentRuns_ConversationID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentRuns_ConversationID_SecondaryScopes TEXT;
    p_MJAIAgentRuns_ConversationID_ExternalReferenceID VARCHAR(200);
    p_MJAIAgentRuns_ConversationID_CompanyID UUID;
    p_MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed INTEGER;
    p_MJAIAgentRuns_ConversationID_LastHeartbeatAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConversationID_AgentSessionID UUID;
    p_MJAIAgentRuns_ConversationID_PlanMode BOOLEAN;
    p_MJAIAgentSessions_ConversationIDID UUID;
    p_MJAIAgentSessions_ConversationID_AgentID UUID;
    p_MJAIAgentSessions_ConversationID_UserID UUID;
    p_MJAIAgentSessions_ConversationID_Status VARCHAR(20);
    p_MJAIAgentSessions_ConversationID_ConversationID UUID;
    p_MJAIAgentSessions_ConversationID_LastSessionID UUID;
    p_MJAIAgentSessions_ConversationID_HostInstanceID VARCHAR(200);
    p_MJAIAgentSessions_ConversationID_Config TEXT;
    p_MJAIAgentSessions_ConversationID_LastActiveAt TIMESTAMPTZ;
    p_MJAIAgentSessions_ConversationID_ClosedAt TIMESTAMPTZ;
    p_MJAIAgentSessions_ConversationID_CloseReason VARCHAR(20);
    p_MJAIAgentSessions_ConversationID_RecordingMedia VARCHAR(20);
    p_MJAIAgentSessions_ConversationID_RecordingStartedAt TIMESTAMPTZ;
    p_MJAIAgentSessions_ConversationID_RecordingFileID UUID;
    p_MJAIAgentSessions_ConversationID_LinkedEntityID UUID;
    p_MJAIAgentSessions_ConversationID_LinkedRecordID VARCHAR(500);
    p_MJConversationArtifacts_ConversationIDID UUID;
    p_MJConversationDetails_ConversationIDID UUID;
    p_MJConversations_LastConversationIDID UUID;
    p_MJConversations_LastConversationID_UserID UUID;
    p_MJConversations_LastConversationID_ExternalID VARCHAR(500);
    p_MJConversations_LastConversationID_Name VARCHAR(255);
    p_MJConversations_LastConversationID_Description TEXT;
    p_MJConversations_LastConversationID_Type VARCHAR(50);
    p_MJConversations_LastConversationID_IsArchived BOOLEAN;
    p_MJConversations_LastConversationID_LinkedEntityID UUID;
    p_MJConversations_LastConversationID_LinkedRecordID VARCHAR(500);
    p_MJConversations_LastConversationID_DataContextID UUID;
    p_MJConversations_LastConversationID_Status VARCHAR(20);
    p_MJConversations_LastConversationID_EnvironmentID UUID;
    p_MJConversations_LastConversationID_ProjectID UUID;
    p_MJConversations_LastConversationID_IsPinned BOOLEAN;
    p_MJConversations_LastConversationID_TestRunID UUID;
    p_MJConversations_LastConversationID_ApplicationScope VARCHAR(20);
    p_MJConversations_LastConversationID_ApplicationID UUID;
    p_MJConversations_LastConversationID_DefaultAgentID UUID;
    p_MJConversations_LastConversationID_AdditionalData TEXT;
    p_MJConversations_LastConversationID_RecordingFileID UUID;
    p_MJConversations_LastConversationID_EgressID VARCHAR(255);
    p_MJConversations_LastConversationID_VisitorKey VARCHAR(255);
    p_MJConversations_LastConversationID_LastConversationID UUID;
    p_MJReports_ConversationIDID UUID;
    p_MJReports_ConversationID_Name VARCHAR(255);
    p_MJReports_ConversationID_Description TEXT;
    p_MJReports_ConversationID_CategoryID UUID;
    p_MJReports_ConversationID_UserID UUID;
    p_MJReports_ConversationID_SharingScope VARCHAR(20);
    p_MJReports_ConversationID_ConversationID UUID;
    p_MJReports_ConversationID_ConversationDetailID UUID;
    p_MJReports_ConversationID_DataContextID UUID;
    p_MJReports_ConversationID_Configuration TEXT;
    p_MJReports_ConversationID_OutputTriggerTypeID UUID;
    p_MJReports_ConversationID_OutputFormatTypeID UUID;
    p_MJReports_ConversationID_OutputDeliveryTypeID UUID;
    p_MJReports_ConversationID_OutputFrequency VARCHAR(50);
    p_MJReports_ConversationID_OutputTargetEmail VARCHAR(255);
    p_MJReports_ConversationID_OutputWorkflowID UUID;
    p_MJReports_ConversationID_Thumbnail TEXT;
    p_MJReports_ConversationID_EnvironmentID UUID;
    p_MJUserRoutines_ConversationIDID UUID;
    p_MJUserRoutines_ConversationID_UserID UUID;
    p_MJUserRoutines_ConversationID_EnvironmentID UUID;
    p_MJUserRoutines_ConversationID_Name VARCHAR(255);
    p_MJUserRoutines_ConversationID_Description TEXT;
    p_MJUserRoutines_ConversationID_Status VARCHAR(20);
    p_MJUserRoutines_ConversationID_RoutineType VARCHAR(20);
    p_MJUserRoutines_ConversationID_TargetType VARCHAR(20);
    p_MJUserRoutines_ConversationID_TargetID UUID;
    p_MJUserRoutines_ConversationID_InitialMessage TEXT;
    p_MJUserRoutines_ConversationID_StartingPayload TEXT;
    p_MJUserRoutines_ConversationID_RequestedSkillIDs TEXT;
    p_MJUserRoutines_ConversationID_CronExpression VARCHAR(100);
    p_MJUserRoutines_ConversationID_StartAt TIMESTAMPTZ;
    p_MJUserRoutines_ConversationID_EndAt TIMESTAMPTZ;
    p_MJUserRoutines_ConversationID_NotificationTemplateID UUID;
    p_MJUserRoutines_ConversationID_Timezone VARCHAR(100);
    p_MJUserRoutines_ConversationID_NextRunAt TIMESTAMPTZ;
    p_MJUserRoutines_ConversationID_LastRunAt TIMESTAMPTZ;
    p_MJUserRoutines_ConversationID_LastRunStatus VARCHAR(20);
    p_MJUserRoutines_ConversationID_LastResultHash VARCHAR(100);
    p_MJUserRoutines_ConversationID_NotifyCondition VARCHAR(20);
    p_MJUserRoutines_ConversationID_NotifyViaInApp BOOLEAN;
    p_MJUserRoutines_ConversationID_NotifyViaEmail BOOLEAN;
    p_MJUserRoutines_ConversationID_ConversationID UUID;
BEGIN
-- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample


    FOR _rec IN SELECT "ID", "AgentID", "UserID", "CompanyID", "Type", "ExampleInput", "ExampleOutput", "IsAutoGenerated", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "SuccessScore", "Comments", "Status", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt" FROM __mj."AIAgentExample" WHERE "SourceConversationID" = p_ID
    LOOP
        p_MJAIAgentExamples_SourceConversationIDID := _rec."ID";
        p_MJAIAgentExamples_SourceConversationID_AgentID := _rec."AgentID";
        p_MJAIAgentExamples_SourceConversationID_UserID := _rec."UserID";
        p_MJAIAgentExamples_SourceConversationID_CompanyID := _rec."CompanyID";
        p_MJAIAgentExamples_SourceConversationID_Type := _rec."Type";
        p_MJAIAgentExamples_SourceConversationID_ExampleInput := _rec."ExampleInput";
        p_MJAIAgentExamples_SourceConversationID_ExampleOutput := _rec."ExampleOutput";
        p_MJAIAgentExamples_SourceConversationID_IsAutoGenerated := _rec."IsAutoGenerated";
        p_MJAIAgentExamples_SourceConversationID_SourceConversationID := _rec."SourceConversationID";
        p_MJAIAgentExamples_SourceConversationID_SourceConversati_b98bb5 := _rec."SourceConversationDetailID";
        p_MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID := _rec."SourceAIAgentRunID";
        p_MJAIAgentExamples_SourceConversationID_SuccessScore := _rec."SuccessScore";
        p_MJAIAgentExamples_SourceConversationID_Comments := _rec."Comments";
        p_MJAIAgentExamples_SourceConversationID_Status := _rec."Status";
        p_MJAIAgentExamples_SourceConversationID_EmbeddingVector := _rec."EmbeddingVector";
        p_MJAIAgentExamples_SourceConversationID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentExamples_SourceConversationID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentExamples_SourceConversationID_LastAccessedAt := _rec."LastAccessedAt";
        p_MJAIAgentExamples_SourceConversationID_AccessCount := _rec."AccessCount";
        p_MJAIAgentExamples_SourceConversationID_ExpiresAt := _rec."ExpiresAt";
        -- Set the FK field to NULL
        p_MJAIAgentExamples_SourceConversationID_SourceConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentExample"(p_ID => p_MJAIAgentExamples_SourceConversationIDID, p_AgentID => p_MJAIAgentExamples_SourceConversationID_AgentID, p_UserID => p_MJAIAgentExamples_SourceConversationID_UserID, p_CompanyID => p_MJAIAgentExamples_SourceConversationID_CompanyID, p_Type => p_MJAIAgentExamples_SourceConversationID_Type, p_ExampleInput => p_MJAIAgentExamples_SourceConversationID_ExampleInput, p_ExampleOutput => p_MJAIAgentExamples_SourceConversationID_ExampleOutput, p_IsAutoGenerated => p_MJAIAgentExamples_SourceConversationID_IsAutoGenerated, p_SourceConversationID_Clear => 1, p_SourceConversationID => p_MJAIAgentExamples_SourceConversationID_SourceConversationID, p_SourceConversationDetailID => p_MJAIAgentExamples_SourceConversationID_SourceConversati_b98bb5, p_SourceAIAgentRunID => p_MJAIAgentExamples_SourceConversationID_SourceAIAgentRunID, p_SuccessScore => p_MJAIAgentExamples_SourceConversationID_SuccessScore, p_Comments => p_MJAIAgentExamples_SourceConversationID_Comments, p_Status => p_MJAIAgentExamples_SourceConversationID_Status, p_EmbeddingVector => p_MJAIAgentExamples_SourceConversationID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentExamples_SourceConversationID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentExamples_SourceConversationID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentExamples_SourceConversationID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentExamples_SourceConversationID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentExamples_SourceConversationID_LastAccessedAt, p_AccessCount => p_MJAIAgentExamples_SourceConversationID_AccessCount, p_ExpiresAt => p_MJAIAgentExamples_SourceConversationID_ExpiresAt);

    END LOOP;

    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote


    FOR _rec IN SELECT "ID", "AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt", "ConsolidatedIntoNoteID", "ConsolidationCount", "DerivedFromNoteIDs", "ProtectionTier", "ImportanceScore", "AuthorType" FROM __mj."AIAgentNote" WHERE "SourceConversationID" = p_ID
    LOOP
        p_MJAIAgentNotes_SourceConversationIDID := _rec."ID";
        p_MJAIAgentNotes_SourceConversationID_AgentID := _rec."AgentID";
        p_MJAIAgentNotes_SourceConversationID_AgentNoteTypeID := _rec."AgentNoteTypeID";
        p_MJAIAgentNotes_SourceConversationID_Note := _rec."Note";
        p_MJAIAgentNotes_SourceConversationID_UserID := _rec."UserID";
        p_MJAIAgentNotes_SourceConversationID_Type := _rec."Type";
        p_MJAIAgentNotes_SourceConversationID_IsAutoGenerated := _rec."IsAutoGenerated";
        p_MJAIAgentNotes_SourceConversationID_Comments := _rec."Comments";
        p_MJAIAgentNotes_SourceConversationID_Status := _rec."Status";
        p_MJAIAgentNotes_SourceConversationID_SourceConversationID := _rec."SourceConversationID";
        p_MJAIAgentNotes_SourceConversationID_SourceConversationD_de4992 := _rec."SourceConversationDetailID";
        p_MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID := _rec."SourceAIAgentRunID";
        p_MJAIAgentNotes_SourceConversationID_CompanyID := _rec."CompanyID";
        p_MJAIAgentNotes_SourceConversationID_EmbeddingVector := _rec."EmbeddingVector";
        p_MJAIAgentNotes_SourceConversationID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentNotes_SourceConversationID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentNotes_SourceConversationID_LastAccessedAt := _rec."LastAccessedAt";
        p_MJAIAgentNotes_SourceConversationID_AccessCount := _rec."AccessCount";
        p_MJAIAgentNotes_SourceConversationID_ExpiresAt := _rec."ExpiresAt";
        p_MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID := _rec."ConsolidatedIntoNoteID";
        p_MJAIAgentNotes_SourceConversationID_ConsolidationCount := _rec."ConsolidationCount";
        p_MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs := _rec."DerivedFromNoteIDs";
        p_MJAIAgentNotes_SourceConversationID_ProtectionTier := _rec."ProtectionTier";
        p_MJAIAgentNotes_SourceConversationID_ImportanceScore := _rec."ImportanceScore";
        p_MJAIAgentNotes_SourceConversationID_AuthorType := _rec."AuthorType";
        -- Set the FK field to NULL
        p_MJAIAgentNotes_SourceConversationID_SourceConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentNote"(p_ID => p_MJAIAgentNotes_SourceConversationIDID, p_AgentID => p_MJAIAgentNotes_SourceConversationID_AgentID, p_AgentNoteTypeID => p_MJAIAgentNotes_SourceConversationID_AgentNoteTypeID, p_Note => p_MJAIAgentNotes_SourceConversationID_Note, p_UserID => p_MJAIAgentNotes_SourceConversationID_UserID, p_Type => p_MJAIAgentNotes_SourceConversationID_Type, p_IsAutoGenerated => p_MJAIAgentNotes_SourceConversationID_IsAutoGenerated, p_Comments => p_MJAIAgentNotes_SourceConversationID_Comments, p_Status => p_MJAIAgentNotes_SourceConversationID_Status, p_SourceConversationID_Clear => 1, p_SourceConversationID => p_MJAIAgentNotes_SourceConversationID_SourceConversationID, p_SourceConversationDetailID => p_MJAIAgentNotes_SourceConversationID_SourceConversationD_de4992, p_SourceAIAgentRunID => p_MJAIAgentNotes_SourceConversationID_SourceAIAgentRunID, p_CompanyID => p_MJAIAgentNotes_SourceConversationID_CompanyID, p_EmbeddingVector => p_MJAIAgentNotes_SourceConversationID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentNotes_SourceConversationID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentNotes_SourceConversationID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentNotes_SourceConversationID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentNotes_SourceConversationID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentNotes_SourceConversationID_LastAccessedAt, p_AccessCount => p_MJAIAgentNotes_SourceConversationID_AccessCount, p_ExpiresAt => p_MJAIAgentNotes_SourceConversationID_ExpiresAt, p_ConsolidatedIntoNoteID => p_MJAIAgentNotes_SourceConversationID_ConsolidatedIntoNoteID, p_ConsolidationCount => p_MJAIAgentNotes_SourceConversationID_ConsolidationCount, p_DerivedFromNoteIDs => p_MJAIAgentNotes_SourceConversationID_DerivedFromNoteIDs, p_ProtectionTier => p_MJAIAgentNotes_SourceConversationID_ProtectionTier, p_ImportanceScore => p_MJAIAgentNotes_SourceConversationID_ImportanceScore, p_AuthorType => p_MJAIAgentNotes_SourceConversationID_AuthorType);

    END LOOP;

    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt", "AgentSessionID", "PlanMode" FROM __mj."AIAgentRun" WHERE "ConversationID" = p_ID
    LOOP
        p_MJAIAgentRuns_ConversationIDID := _rec."ID";
        p_MJAIAgentRuns_ConversationID_AgentID := _rec."AgentID";
        p_MJAIAgentRuns_ConversationID_ParentRunID := _rec."ParentRunID";
        p_MJAIAgentRuns_ConversationID_Status := _rec."Status";
        p_MJAIAgentRuns_ConversationID_StartedAt := _rec."StartedAt";
        p_MJAIAgentRuns_ConversationID_CompletedAt := _rec."CompletedAt";
        p_MJAIAgentRuns_ConversationID_Success := _rec."Success";
        p_MJAIAgentRuns_ConversationID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIAgentRuns_ConversationID_ConversationID := _rec."ConversationID";
        p_MJAIAgentRuns_ConversationID_UserID := _rec."UserID";
        p_MJAIAgentRuns_ConversationID_Result := _rec."Result";
        p_MJAIAgentRuns_ConversationID_AgentState := _rec."AgentState";
        p_MJAIAgentRuns_ConversationID_TotalTokensUsed := _rec."TotalTokensUsed";
        p_MJAIAgentRuns_ConversationID_TotalCost := _rec."TotalCost";
        p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsed := _rec."TotalPromptTokensUsed";
        p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed := _rec."TotalCompletionTokensUsed";
        p_MJAIAgentRuns_ConversationID_TotalTokensUsedRollup := _rec."TotalTokensUsedRollup";
        p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup := _rec."TotalPromptTokensUsedRollup";
        p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup := _rec."TotalCompletionTokensUsedRollup";
        p_MJAIAgentRuns_ConversationID_TotalCostRollup := _rec."TotalCostRollup";
        p_MJAIAgentRuns_ConversationID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJAIAgentRuns_ConversationID_ConversationDetailSequence := _rec."ConversationDetailSequence";
        p_MJAIAgentRuns_ConversationID_CancellationReason := _rec."CancellationReason";
        p_MJAIAgentRuns_ConversationID_FinalStep := _rec."FinalStep";
        p_MJAIAgentRuns_ConversationID_FinalPayload := _rec."FinalPayload";
        p_MJAIAgentRuns_ConversationID_Message := _rec."Message";
        p_MJAIAgentRuns_ConversationID_LastRunID := _rec."LastRunID";
        p_MJAIAgentRuns_ConversationID_StartingPayload := _rec."StartingPayload";
        p_MJAIAgentRuns_ConversationID_TotalPromptIterations := _rec."TotalPromptIterations";
        p_MJAIAgentRuns_ConversationID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIAgentRuns_ConversationID_OverrideModelID := _rec."OverrideModelID";
        p_MJAIAgentRuns_ConversationID_OverrideVendorID := _rec."OverrideVendorID";
        p_MJAIAgentRuns_ConversationID_Data := _rec."Data";
        p_MJAIAgentRuns_ConversationID_Verbose := _rec."Verbose";
        p_MJAIAgentRuns_ConversationID_EffortLevel := _rec."EffortLevel";
        p_MJAIAgentRuns_ConversationID_RunName := _rec."RunName";
        p_MJAIAgentRuns_ConversationID_Comments := _rec."Comments";
        p_MJAIAgentRuns_ConversationID_ScheduledJobRunID := _rec."ScheduledJobRunID";
        p_MJAIAgentRuns_ConversationID_TestRunID := _rec."TestRunID";
        p_MJAIAgentRuns_ConversationID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentRuns_ConversationID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentRuns_ConversationID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentRuns_ConversationID_ExternalReferenceID := _rec."ExternalReferenceID";
        p_MJAIAgentRuns_ConversationID_CompanyID := _rec."CompanyID";
        p_MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed := _rec."TotalCacheReadTokensUsed";
        p_MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed := _rec."TotalCacheWriteTokensUsed";
        p_MJAIAgentRuns_ConversationID_LastHeartbeatAt := _rec."LastHeartbeatAt";
        p_MJAIAgentRuns_ConversationID_AgentSessionID := _rec."AgentSessionID";
        p_MJAIAgentRuns_ConversationID_PlanMode := _rec."PlanMode";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ConversationID_ConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ConversationIDID, p_AgentID => p_MJAIAgentRuns_ConversationID_AgentID, p_ParentRunID => p_MJAIAgentRuns_ConversationID_ParentRunID, p_Status => p_MJAIAgentRuns_ConversationID_Status, p_StartedAt => p_MJAIAgentRuns_ConversationID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ConversationID_CompletedAt, p_Success => p_MJAIAgentRuns_ConversationID_Success, p_ErrorMessage => p_MJAIAgentRuns_ConversationID_ErrorMessage, p_ConversationID_Clear => 1, p_ConversationID => p_MJAIAgentRuns_ConversationID_ConversationID, p_UserID => p_MJAIAgentRuns_ConversationID_UserID, p_Result => p_MJAIAgentRuns_ConversationID_Result, p_AgentState => p_MJAIAgentRuns_ConversationID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ConversationID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ConversationID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_ConversationID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_ConversationID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ConversationID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ConversationID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ConversationID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ConversationID_FinalPayload, p_Message => p_MJAIAgentRuns_ConversationID_Message, p_LastRunID => p_MJAIAgentRuns_ConversationID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ConversationID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ConversationID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_ConversationID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ConversationID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ConversationID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ConversationID_Data, p_Verbose => p_MJAIAgentRuns_ConversationID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ConversationID_EffortLevel, p_RunName => p_MJAIAgentRuns_ConversationID_RunName, p_Comments => p_MJAIAgentRuns_ConversationID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ConversationID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ConversationID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ConversationID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ConversationID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ConversationID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_ConversationID_LastHeartbeatAt, p_AgentSessionID => p_MJAIAgentRuns_ConversationID_AgentSessionID, p_PlanMode => p_MJAIAgentRuns_ConversationID_PlanMode);

    END LOOP;

    
    -- Cascade update on AIAgentSession using cursor to call spUpdateAIAgentSession


    FOR _rec IN SELECT "ID", "AgentID", "UserID", "Status", "ConversationID", "LastSessionID", "HostInstanceID", "Config", "LastActiveAt", "ClosedAt", "CloseReason", "RecordingMedia", "RecordingStartedAt", "RecordingFileID", "LinkedEntityID", "LinkedRecordID" FROM __mj."AIAgentSession" WHERE "ConversationID" = p_ID
    LOOP
        p_MJAIAgentSessions_ConversationIDID := _rec."ID";
        p_MJAIAgentSessions_ConversationID_AgentID := _rec."AgentID";
        p_MJAIAgentSessions_ConversationID_UserID := _rec."UserID";
        p_MJAIAgentSessions_ConversationID_Status := _rec."Status";
        p_MJAIAgentSessions_ConversationID_ConversationID := _rec."ConversationID";
        p_MJAIAgentSessions_ConversationID_LastSessionID := _rec."LastSessionID";
        p_MJAIAgentSessions_ConversationID_HostInstanceID := _rec."HostInstanceID";
        p_MJAIAgentSessions_ConversationID_Config := _rec."Config";
        p_MJAIAgentSessions_ConversationID_LastActiveAt := _rec."LastActiveAt";
        p_MJAIAgentSessions_ConversationID_ClosedAt := _rec."ClosedAt";
        p_MJAIAgentSessions_ConversationID_CloseReason := _rec."CloseReason";
        p_MJAIAgentSessions_ConversationID_RecordingMedia := _rec."RecordingMedia";
        p_MJAIAgentSessions_ConversationID_RecordingStartedAt := _rec."RecordingStartedAt";
        p_MJAIAgentSessions_ConversationID_RecordingFileID := _rec."RecordingFileID";
        p_MJAIAgentSessions_ConversationID_LinkedEntityID := _rec."LinkedEntityID";
        p_MJAIAgentSessions_ConversationID_LinkedRecordID := _rec."LinkedRecordID";
        -- Set the FK field to NULL
        p_MJAIAgentSessions_ConversationID_ConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentSession"(p_ID => p_MJAIAgentSessions_ConversationIDID, p_AgentID => p_MJAIAgentSessions_ConversationID_AgentID, p_UserID => p_MJAIAgentSessions_ConversationID_UserID, p_Status => p_MJAIAgentSessions_ConversationID_Status, p_ConversationID_Clear => 1, p_ConversationID => p_MJAIAgentSessions_ConversationID_ConversationID, p_LastSessionID => p_MJAIAgentSessions_ConversationID_LastSessionID, p_HostInstanceID => p_MJAIAgentSessions_ConversationID_HostInstanceID, p_Config => p_MJAIAgentSessions_ConversationID_Config, p_LastActiveAt => p_MJAIAgentSessions_ConversationID_LastActiveAt, p_ClosedAt => p_MJAIAgentSessions_ConversationID_ClosedAt, p_CloseReason => p_MJAIAgentSessions_ConversationID_CloseReason, p_RecordingMedia => p_MJAIAgentSessions_ConversationID_RecordingMedia, p_RecordingStartedAt => p_MJAIAgentSessions_ConversationID_RecordingStartedAt, p_RecordingFileID => p_MJAIAgentSessions_ConversationID_RecordingFileID, p_LinkedEntityID => p_MJAIAgentSessions_ConversationID_LinkedEntityID, p_LinkedRecordID => p_MJAIAgentSessions_ConversationID_LinkedRecordID);

    END LOOP;

    
    -- Cascade delete from ConversationArtifact using cursor to call spDeleteConversationArtifact

    FOR _rec IN SELECT "ID" FROM __mj."ConversationArtifact" WHERE "ConversationID" = p_ID
    LOOP
        p_MJConversationArtifacts_ConversationIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationArtifact"(p_ID => p_MJConversationArtifacts_ConversationIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ConversationDetail using cursor to call spDeleteConversationDetail

    FOR _rec IN SELECT "ID" FROM __mj."ConversationDetail" WHERE "ConversationID" = p_ID
    LOOP
        p_MJConversationDetails_ConversationIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationDetail"(p_ID => p_MJConversationDetails_ConversationIDID);
        
    END LOOP;
    
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation


    FOR _rec IN SELECT "ID", "UserID", "ExternalID", "Name", "Description", "Type", "IsArchived", "LinkedEntityID", "LinkedRecordID", "DataContextID", "Status", "EnvironmentID", "ProjectID", "IsPinned", "TestRunID", "ApplicationScope", "ApplicationID", "DefaultAgentID", "AdditionalData", "RecordingFileID", "EgressID", "VisitorKey", "LastConversationID" FROM __mj."Conversation" WHERE "LastConversationID" = p_ID
    LOOP
        p_MJConversations_LastConversationIDID := _rec."ID";
        p_MJConversations_LastConversationID_UserID := _rec."UserID";
        p_MJConversations_LastConversationID_ExternalID := _rec."ExternalID";
        p_MJConversations_LastConversationID_Name := _rec."Name";
        p_MJConversations_LastConversationID_Description := _rec."Description";
        p_MJConversations_LastConversationID_Type := _rec."Type";
        p_MJConversations_LastConversationID_IsArchived := _rec."IsArchived";
        p_MJConversations_LastConversationID_LinkedEntityID := _rec."LinkedEntityID";
        p_MJConversations_LastConversationID_LinkedRecordID := _rec."LinkedRecordID";
        p_MJConversations_LastConversationID_DataContextID := _rec."DataContextID";
        p_MJConversations_LastConversationID_Status := _rec."Status";
        p_MJConversations_LastConversationID_EnvironmentID := _rec."EnvironmentID";
        p_MJConversations_LastConversationID_ProjectID := _rec."ProjectID";
        p_MJConversations_LastConversationID_IsPinned := _rec."IsPinned";
        p_MJConversations_LastConversationID_TestRunID := _rec."TestRunID";
        p_MJConversations_LastConversationID_ApplicationScope := _rec."ApplicationScope";
        p_MJConversations_LastConversationID_ApplicationID := _rec."ApplicationID";
        p_MJConversations_LastConversationID_DefaultAgentID := _rec."DefaultAgentID";
        p_MJConversations_LastConversationID_AdditionalData := _rec."AdditionalData";
        p_MJConversations_LastConversationID_RecordingFileID := _rec."RecordingFileID";
        p_MJConversations_LastConversationID_EgressID := _rec."EgressID";
        p_MJConversations_LastConversationID_VisitorKey := _rec."VisitorKey";
        p_MJConversations_LastConversationID_LastConversationID := _rec."LastConversationID";
        -- Set the FK field to NULL
        p_MJConversations_LastConversationID_LastConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversation"(p_ID => p_MJConversations_LastConversationIDID, p_UserID => p_MJConversations_LastConversationID_UserID, p_ExternalID => p_MJConversations_LastConversationID_ExternalID, p_Name => p_MJConversations_LastConversationID_Name, p_Description => p_MJConversations_LastConversationID_Description, p_Type => p_MJConversations_LastConversationID_Type, p_IsArchived => p_MJConversations_LastConversationID_IsArchived, p_LinkedEntityID => p_MJConversations_LastConversationID_LinkedEntityID, p_LinkedRecordID => p_MJConversations_LastConversationID_LinkedRecordID, p_DataContextID => p_MJConversations_LastConversationID_DataContextID, p_Status => p_MJConversations_LastConversationID_Status, p_EnvironmentID => p_MJConversations_LastConversationID_EnvironmentID, p_ProjectID => p_MJConversations_LastConversationID_ProjectID, p_IsPinned => p_MJConversations_LastConversationID_IsPinned, p_TestRunID => p_MJConversations_LastConversationID_TestRunID, p_ApplicationScope => p_MJConversations_LastConversationID_ApplicationScope, p_ApplicationID => p_MJConversations_LastConversationID_ApplicationID, p_DefaultAgentID => p_MJConversations_LastConversationID_DefaultAgentID, p_AdditionalData => p_MJConversations_LastConversationID_AdditionalData, p_RecordingFileID => p_MJConversations_LastConversationID_RecordingFileID, p_EgressID => p_MJConversations_LastConversationID_EgressID, p_VisitorKey => p_MJConversations_LastConversationID_VisitorKey, p_LastConversationID_Clear => 1, p_LastConversationID => p_MJConversations_LastConversationID_LastConversationID);

    END LOOP;

    
    -- Cascade update on Report using cursor to call spUpdateReport


    FOR _rec IN SELECT "ID", "Name", "Description", "CategoryID", "UserID", "SharingScope", "ConversationID", "ConversationDetailID", "DataContextID", "Configuration", "OutputTriggerTypeID", "OutputFormatTypeID", "OutputDeliveryTypeID", "OutputFrequency", "OutputTargetEmail", "OutputWorkflowID", "Thumbnail", "EnvironmentID" FROM __mj."Report" WHERE "ConversationID" = p_ID
    LOOP
        p_MJReports_ConversationIDID := _rec."ID";
        p_MJReports_ConversationID_Name := _rec."Name";
        p_MJReports_ConversationID_Description := _rec."Description";
        p_MJReports_ConversationID_CategoryID := _rec."CategoryID";
        p_MJReports_ConversationID_UserID := _rec."UserID";
        p_MJReports_ConversationID_SharingScope := _rec."SharingScope";
        p_MJReports_ConversationID_ConversationID := _rec."ConversationID";
        p_MJReports_ConversationID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJReports_ConversationID_DataContextID := _rec."DataContextID";
        p_MJReports_ConversationID_Configuration := _rec."Configuration";
        p_MJReports_ConversationID_OutputTriggerTypeID := _rec."OutputTriggerTypeID";
        p_MJReports_ConversationID_OutputFormatTypeID := _rec."OutputFormatTypeID";
        p_MJReports_ConversationID_OutputDeliveryTypeID := _rec."OutputDeliveryTypeID";
        p_MJReports_ConversationID_OutputFrequency := _rec."OutputFrequency";
        p_MJReports_ConversationID_OutputTargetEmail := _rec."OutputTargetEmail";
        p_MJReports_ConversationID_OutputWorkflowID := _rec."OutputWorkflowID";
        p_MJReports_ConversationID_Thumbnail := _rec."Thumbnail";
        p_MJReports_ConversationID_EnvironmentID := _rec."EnvironmentID";
        -- Set the FK field to NULL
        p_MJReports_ConversationID_ConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateReport"(p_ID => p_MJReports_ConversationIDID, p_Name => p_MJReports_ConversationID_Name, p_Description => p_MJReports_ConversationID_Description, p_CategoryID => p_MJReports_ConversationID_CategoryID, p_UserID => p_MJReports_ConversationID_UserID, p_SharingScope => p_MJReports_ConversationID_SharingScope, p_ConversationID_Clear => 1, p_ConversationID => p_MJReports_ConversationID_ConversationID, p_ConversationDetailID => p_MJReports_ConversationID_ConversationDetailID, p_DataContextID => p_MJReports_ConversationID_DataContextID, p_Configuration => p_MJReports_ConversationID_Configuration, p_OutputTriggerTypeID => p_MJReports_ConversationID_OutputTriggerTypeID, p_OutputFormatTypeID => p_MJReports_ConversationID_OutputFormatTypeID, p_OutputDeliveryTypeID => p_MJReports_ConversationID_OutputDeliveryTypeID, p_OutputFrequency => p_MJReports_ConversationID_OutputFrequency, p_OutputTargetEmail => p_MJReports_ConversationID_OutputTargetEmail, p_OutputWorkflowID => p_MJReports_ConversationID_OutputWorkflowID, p_Thumbnail => p_MJReports_ConversationID_Thumbnail, p_EnvironmentID => p_MJReports_ConversationID_EnvironmentID);

    END LOOP;

    
    -- Cascade update on UserRoutine using cursor to call spUpdateUserRoutine


    FOR _rec IN SELECT "ID", "UserID", "EnvironmentID", "Name", "Description", "Status", "RoutineType", "TargetType", "TargetID", "InitialMessage", "StartingPayload", "RequestedSkillIDs", "CronExpression", "StartAt", "EndAt", "NotificationTemplateID", "Timezone", "NextRunAt", "LastRunAt", "LastRunStatus", "LastResultHash", "NotifyCondition", "NotifyViaInApp", "NotifyViaEmail", "ConversationID" FROM __mj."UserRoutine" WHERE "ConversationID" = p_ID
    LOOP
        p_MJUserRoutines_ConversationIDID := _rec."ID";
        p_MJUserRoutines_ConversationID_UserID := _rec."UserID";
        p_MJUserRoutines_ConversationID_EnvironmentID := _rec."EnvironmentID";
        p_MJUserRoutines_ConversationID_Name := _rec."Name";
        p_MJUserRoutines_ConversationID_Description := _rec."Description";
        p_MJUserRoutines_ConversationID_Status := _rec."Status";
        p_MJUserRoutines_ConversationID_RoutineType := _rec."RoutineType";
        p_MJUserRoutines_ConversationID_TargetType := _rec."TargetType";
        p_MJUserRoutines_ConversationID_TargetID := _rec."TargetID";
        p_MJUserRoutines_ConversationID_InitialMessage := _rec."InitialMessage";
        p_MJUserRoutines_ConversationID_StartingPayload := _rec."StartingPayload";
        p_MJUserRoutines_ConversationID_RequestedSkillIDs := _rec."RequestedSkillIDs";
        p_MJUserRoutines_ConversationID_CronExpression := _rec."CronExpression";
        p_MJUserRoutines_ConversationID_StartAt := _rec."StartAt";
        p_MJUserRoutines_ConversationID_EndAt := _rec."EndAt";
        p_MJUserRoutines_ConversationID_NotificationTemplateID := _rec."NotificationTemplateID";
        p_MJUserRoutines_ConversationID_Timezone := _rec."Timezone";
        p_MJUserRoutines_ConversationID_NextRunAt := _rec."NextRunAt";
        p_MJUserRoutines_ConversationID_LastRunAt := _rec."LastRunAt";
        p_MJUserRoutines_ConversationID_LastRunStatus := _rec."LastRunStatus";
        p_MJUserRoutines_ConversationID_LastResultHash := _rec."LastResultHash";
        p_MJUserRoutines_ConversationID_NotifyCondition := _rec."NotifyCondition";
        p_MJUserRoutines_ConversationID_NotifyViaInApp := _rec."NotifyViaInApp";
        p_MJUserRoutines_ConversationID_NotifyViaEmail := _rec."NotifyViaEmail";
        p_MJUserRoutines_ConversationID_ConversationID := _rec."ConversationID";
        -- Set the FK field to NULL
        p_MJUserRoutines_ConversationID_ConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateUserRoutine"(p_ID => p_MJUserRoutines_ConversationIDID, p_UserID => p_MJUserRoutines_ConversationID_UserID, p_EnvironmentID => p_MJUserRoutines_ConversationID_EnvironmentID, p_Name => p_MJUserRoutines_ConversationID_Name, p_Description => p_MJUserRoutines_ConversationID_Description, p_Status => p_MJUserRoutines_ConversationID_Status, p_RoutineType => p_MJUserRoutines_ConversationID_RoutineType, p_TargetType => p_MJUserRoutines_ConversationID_TargetType, p_TargetID => p_MJUserRoutines_ConversationID_TargetID, p_InitialMessage => p_MJUserRoutines_ConversationID_InitialMessage, p_StartingPayload => p_MJUserRoutines_ConversationID_StartingPayload, p_RequestedSkillIDs => p_MJUserRoutines_ConversationID_RequestedSkillIDs, p_CronExpression => p_MJUserRoutines_ConversationID_CronExpression, p_StartAt => p_MJUserRoutines_ConversationID_StartAt, p_EndAt => p_MJUserRoutines_ConversationID_EndAt, p_NotificationTemplateID => p_MJUserRoutines_ConversationID_NotificationTemplateID, p_Timezone => p_MJUserRoutines_ConversationID_Timezone, p_NextRunAt => p_MJUserRoutines_ConversationID_NextRunAt, p_LastRunAt => p_MJUserRoutines_ConversationID_LastRunAt, p_LastRunStatus => p_MJUserRoutines_ConversationID_LastRunStatus, p_LastResultHash => p_MJUserRoutines_ConversationID_LastResultHash, p_NotifyCondition => p_MJUserRoutines_ConversationID_NotifyCondition, p_NotifyViaInApp => p_MJUserRoutines_ConversationID_NotifyViaInApp, p_NotifyViaEmail => p_MJUserRoutines_ConversationID_NotifyViaEmail, p_ConversationID_Clear => 1, p_ConversationID => p_MJUserRoutines_ConversationID_ConversationID);

    END LOOP;

    

    DELETE FROM
        __mj."Conversation"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateAIAgent'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgent"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgents"
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

    -- Build column/value lists from the keys present in p_data. A key that is
    -- absent OR explicitly JSON null is omitted so the column DEFAULT applies,
    -- matching the typed-arg sproc per-column coalescing (a defaulted NOT NULL
    -- column such as OwnerUserID falls back to its DEFAULT instead of inserting NULL).
    FOREACH v_field_name IN ARRAY ARRAY['Name', 'Description', 'LogoURL', 'ParentID', 'ExposeAsAction', 'ExecutionOrder', 'ExecutionMode', 'EnableContextCompression', 'ContextCompressionMessageThreshold', 'ContextCompressionPromptID', 'ContextCompressionMessageRetentionCount', 'TypeID', 'Status', 'DriverClass', 'IconClass', 'ModelSelectionMode', 'PayloadDownstreamPaths', 'PayloadUpstreamPaths', 'PayloadSelfReadPaths', 'PayloadSelfWritePaths', 'PayloadScope', 'FinalPayloadValidation', 'FinalPayloadValidationMode', 'FinalPayloadValidationMaxRetries', 'MaxCostPerRun', 'MaxTokensPerRun', 'MaxIterationsPerRun', 'MaxTimePerRun', 'MinExecutionsPerRun', 'MaxExecutionsPerRun', 'StartingPayloadValidation', 'StartingPayloadValidationMode', 'DefaultPromptEffortLevel', 'ChatHandlingOption', 'DefaultArtifactTypeID', 'OwnerUserID', 'InvocationMode', 'ArtifactCreationMode', 'FunctionalRequirements', 'TechnicalDesign', 'InjectNotes', 'MaxNotesToInject', 'NoteInjectionStrategy', 'InjectExamples', 'MaxExamplesToInject', 'ExampleInjectionStrategy', 'IsRestricted', 'MessageMode', 'MaxMessages', 'AttachmentStorageProviderID', 'AttachmentRootPath', 'InlineStorageThresholdBytes', 'AgentTypePromptParams', 'ScopeConfig', 'NoteRetentionDays', 'ExampleRetentionDays', 'AutoArchiveEnabled', 'RerankerConfiguration', 'CategoryID', 'AllowEphemeralClientTools', 'DefaultStorageAccountID', 'SearchScopeAccess', 'AcceptUnregisteredFiles', 'DefaultCoAgentID', 'TypeConfiguration', 'AllowMemoryWrite', 'RecordingDefault', 'RecordingStorageProviderID', 'DefaultMediaCollectionID', 'SupportsPlanMode', 'AcceptsSkills', 'SkillActivationMode', 'RequirePlanMode', 'ContextWindowMaxTokens', 'CompactionTriggerPercent', 'CompactionTargetPercent', 'ConversationSummaryPromptID']
    LOOP
        IF p_data ? v_field_name AND jsonb_typeof(p_data->v_field_name) <> 'null' THEN
            v_cast_expr := CASE v_field_name
                WHEN 'Name' THEN '($1->>''Name'')'
                WHEN 'Description' THEN '($1->>''Description'')'
                WHEN 'LogoURL' THEN '($1->>''LogoURL'')'
                WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
                WHEN 'ExposeAsAction' THEN '($1->>''ExposeAsAction'')::BOOLEAN'
                WHEN 'ExecutionOrder' THEN '($1->>''ExecutionOrder'')::INTEGER'
                WHEN 'ExecutionMode' THEN '($1->>''ExecutionMode'')'
                WHEN 'EnableContextCompression' THEN '($1->>''EnableContextCompression'')::BOOLEAN'
                WHEN 'ContextCompressionMessageThreshold' THEN '($1->>''ContextCompressionMessageThreshold'')::INTEGER'
                WHEN 'ContextCompressionPromptID' THEN '($1->>''ContextCompressionPromptID'')::UUID'
                WHEN 'ContextCompressionMessageRetentionCount' THEN '($1->>''ContextCompressionMessageRetentionCount'')::INTEGER'
                WHEN 'TypeID' THEN '($1->>''TypeID'')::UUID'
                WHEN 'Status' THEN '($1->>''Status'')'
                WHEN 'DriverClass' THEN '($1->>''DriverClass'')'
                WHEN 'IconClass' THEN '($1->>''IconClass'')'
                WHEN 'ModelSelectionMode' THEN '($1->>''ModelSelectionMode'')'
                WHEN 'PayloadDownstreamPaths' THEN '($1->>''PayloadDownstreamPaths'')'
                WHEN 'PayloadUpstreamPaths' THEN '($1->>''PayloadUpstreamPaths'')'
                WHEN 'PayloadSelfReadPaths' THEN '($1->>''PayloadSelfReadPaths'')'
                WHEN 'PayloadSelfWritePaths' THEN '($1->>''PayloadSelfWritePaths'')'
                WHEN 'PayloadScope' THEN '($1->>''PayloadScope'')'
                WHEN 'FinalPayloadValidation' THEN '($1->>''FinalPayloadValidation'')'
                WHEN 'FinalPayloadValidationMode' THEN '($1->>''FinalPayloadValidationMode'')'
                WHEN 'FinalPayloadValidationMaxRetries' THEN '($1->>''FinalPayloadValidationMaxRetries'')::INTEGER'
                WHEN 'MaxCostPerRun' THEN '($1->>''MaxCostPerRun'')::NUMERIC(10,4)'
                WHEN 'MaxTokensPerRun' THEN '($1->>''MaxTokensPerRun'')::INTEGER'
                WHEN 'MaxIterationsPerRun' THEN '($1->>''MaxIterationsPerRun'')::INTEGER'
                WHEN 'MaxTimePerRun' THEN '($1->>''MaxTimePerRun'')::INTEGER'
                WHEN 'MinExecutionsPerRun' THEN '($1->>''MinExecutionsPerRun'')::INTEGER'
                WHEN 'MaxExecutionsPerRun' THEN '($1->>''MaxExecutionsPerRun'')::INTEGER'
                WHEN 'StartingPayloadValidation' THEN '($1->>''StartingPayloadValidation'')'
                WHEN 'StartingPayloadValidationMode' THEN '($1->>''StartingPayloadValidationMode'')'
                WHEN 'DefaultPromptEffortLevel' THEN '($1->>''DefaultPromptEffortLevel'')::INTEGER'
                WHEN 'ChatHandlingOption' THEN '($1->>''ChatHandlingOption'')'
                WHEN 'DefaultArtifactTypeID' THEN '($1->>''DefaultArtifactTypeID'')::UUID'
                WHEN 'OwnerUserID' THEN '($1->>''OwnerUserID'')::UUID'
                WHEN 'InvocationMode' THEN '($1->>''InvocationMode'')'
                WHEN 'ArtifactCreationMode' THEN '($1->>''ArtifactCreationMode'')'
                WHEN 'FunctionalRequirements' THEN '($1->>''FunctionalRequirements'')'
                WHEN 'TechnicalDesign' THEN '($1->>''TechnicalDesign'')'
                WHEN 'InjectNotes' THEN '($1->>''InjectNotes'')::BOOLEAN'
                WHEN 'MaxNotesToInject' THEN '($1->>''MaxNotesToInject'')::INTEGER'
                WHEN 'NoteInjectionStrategy' THEN '($1->>''NoteInjectionStrategy'')'
                WHEN 'InjectExamples' THEN '($1->>''InjectExamples'')::BOOLEAN'
                WHEN 'MaxExamplesToInject' THEN '($1->>''MaxExamplesToInject'')::INTEGER'
                WHEN 'ExampleInjectionStrategy' THEN '($1->>''ExampleInjectionStrategy'')'
                WHEN 'IsRestricted' THEN '($1->>''IsRestricted'')::BOOLEAN'
                WHEN 'MessageMode' THEN '($1->>''MessageMode'')'
                WHEN 'MaxMessages' THEN '($1->>''MaxMessages'')::INTEGER'
                WHEN 'AttachmentStorageProviderID' THEN '($1->>''AttachmentStorageProviderID'')::UUID'
                WHEN 'AttachmentRootPath' THEN '($1->>''AttachmentRootPath'')'
                WHEN 'InlineStorageThresholdBytes' THEN '($1->>''InlineStorageThresholdBytes'')::INTEGER'
                WHEN 'AgentTypePromptParams' THEN '($1->>''AgentTypePromptParams'')'
                WHEN 'ScopeConfig' THEN '($1->>''ScopeConfig'')'
                WHEN 'NoteRetentionDays' THEN '($1->>''NoteRetentionDays'')::INTEGER'
                WHEN 'ExampleRetentionDays' THEN '($1->>''ExampleRetentionDays'')::INTEGER'
                WHEN 'AutoArchiveEnabled' THEN '($1->>''AutoArchiveEnabled'')::BOOLEAN'
                WHEN 'RerankerConfiguration' THEN '($1->>''RerankerConfiguration'')'
                WHEN 'CategoryID' THEN '($1->>''CategoryID'')::UUID'
                WHEN 'AllowEphemeralClientTools' THEN '($1->>''AllowEphemeralClientTools'')::BOOLEAN'
                WHEN 'DefaultStorageAccountID' THEN '($1->>''DefaultStorageAccountID'')::UUID'
                WHEN 'SearchScopeAccess' THEN '($1->>''SearchScopeAccess'')'
                WHEN 'AcceptUnregisteredFiles' THEN '($1->>''AcceptUnregisteredFiles'')::BOOLEAN'
                WHEN 'DefaultCoAgentID' THEN '($1->>''DefaultCoAgentID'')::UUID'
                WHEN 'TypeConfiguration' THEN '($1->>''TypeConfiguration'')'
                WHEN 'AllowMemoryWrite' THEN '($1->>''AllowMemoryWrite'')::BOOLEAN'
                WHEN 'RecordingDefault' THEN '($1->>''RecordingDefault'')'
                WHEN 'RecordingStorageProviderID' THEN '($1->>''RecordingStorageProviderID'')::UUID'
                WHEN 'DefaultMediaCollectionID' THEN '($1->>''DefaultMediaCollectionID'')::UUID'
                WHEN 'SupportsPlanMode' THEN '($1->>''SupportsPlanMode'')::BOOLEAN'
                WHEN 'AcceptsSkills' THEN '($1->>''AcceptsSkills'')'
                WHEN 'SkillActivationMode' THEN '($1->>''SkillActivationMode'')'
                WHEN 'RequirePlanMode' THEN '($1->>''RequirePlanMode'')::BOOLEAN'
                WHEN 'ContextWindowMaxTokens' THEN '($1->>''ContextWindowMaxTokens'')::INTEGER'
                WHEN 'CompactionTriggerPercent' THEN '($1->>''CompactionTriggerPercent'')::INTEGER'
                WHEN 'CompactionTargetPercent' THEN '($1->>''CompactionTargetPercent'')::INTEGER'
                WHEN 'ConversationSummaryPromptID' THEN '($1->>''ConversationSummaryPromptID'')::UUID'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format('INSERT INTO __mj."AIAgent" (%s) VALUES (%s)', v_col_list, v_val_list);
    EXECUTE v_sql USING p_data;

    RETURN QUERY SELECT * FROM __mj."vwAIAgents" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIAgent'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgent"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgents"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgent: p_data must include "ID"';
    END IF;

    UPDATE __mj."AIAgent" SET
        "Name" = CASE WHEN p_data ? 'Name' THEN (p_data->>'Name') ELSE "Name" END,
        "Description" = CASE WHEN p_data ? 'Description' THEN (p_data->>'Description') ELSE "Description" END,
        "LogoURL" = CASE WHEN p_data ? 'LogoURL' THEN (p_data->>'LogoURL') ELSE "LogoURL" END,
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "ExposeAsAction" = CASE WHEN p_data ? 'ExposeAsAction' THEN (p_data->>'ExposeAsAction')::BOOLEAN ELSE "ExposeAsAction" END,
        "ExecutionOrder" = CASE WHEN p_data ? 'ExecutionOrder' THEN (p_data->>'ExecutionOrder')::INTEGER ELSE "ExecutionOrder" END,
        "ExecutionMode" = CASE WHEN p_data ? 'ExecutionMode' THEN (p_data->>'ExecutionMode') ELSE "ExecutionMode" END,
        "EnableContextCompression" = CASE WHEN p_data ? 'EnableContextCompression' THEN (p_data->>'EnableContextCompression')::BOOLEAN ELSE "EnableContextCompression" END,
        "ContextCompressionMessageThreshold" = CASE WHEN p_data ? 'ContextCompressionMessageThreshold' THEN (p_data->>'ContextCompressionMessageThreshold')::INTEGER ELSE "ContextCompressionMessageThreshold" END,
        "ContextCompressionPromptID" = CASE WHEN p_data ? 'ContextCompressionPromptID' THEN (p_data->>'ContextCompressionPromptID')::UUID ELSE "ContextCompressionPromptID" END,
        "ContextCompressionMessageRetentionCount" = CASE WHEN p_data ? 'ContextCompressionMessageRetentionCount' THEN (p_data->>'ContextCompressionMessageRetentionCount')::INTEGER ELSE "ContextCompressionMessageRetentionCount" END,
        "TypeID" = CASE WHEN p_data ? 'TypeID' THEN (p_data->>'TypeID')::UUID ELSE "TypeID" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "DriverClass" = CASE WHEN p_data ? 'DriverClass' THEN (p_data->>'DriverClass') ELSE "DriverClass" END,
        "IconClass" = CASE WHEN p_data ? 'IconClass' THEN (p_data->>'IconClass') ELSE "IconClass" END,
        "ModelSelectionMode" = CASE WHEN p_data ? 'ModelSelectionMode' THEN (p_data->>'ModelSelectionMode') ELSE "ModelSelectionMode" END,
        "PayloadDownstreamPaths" = CASE WHEN p_data ? 'PayloadDownstreamPaths' THEN (p_data->>'PayloadDownstreamPaths') ELSE "PayloadDownstreamPaths" END,
        "PayloadUpstreamPaths" = CASE WHEN p_data ? 'PayloadUpstreamPaths' THEN (p_data->>'PayloadUpstreamPaths') ELSE "PayloadUpstreamPaths" END,
        "PayloadSelfReadPaths" = CASE WHEN p_data ? 'PayloadSelfReadPaths' THEN (p_data->>'PayloadSelfReadPaths') ELSE "PayloadSelfReadPaths" END,
        "PayloadSelfWritePaths" = CASE WHEN p_data ? 'PayloadSelfWritePaths' THEN (p_data->>'PayloadSelfWritePaths') ELSE "PayloadSelfWritePaths" END,
        "PayloadScope" = CASE WHEN p_data ? 'PayloadScope' THEN (p_data->>'PayloadScope') ELSE "PayloadScope" END,
        "FinalPayloadValidation" = CASE WHEN p_data ? 'FinalPayloadValidation' THEN (p_data->>'FinalPayloadValidation') ELSE "FinalPayloadValidation" END,
        "FinalPayloadValidationMode" = CASE WHEN p_data ? 'FinalPayloadValidationMode' THEN (p_data->>'FinalPayloadValidationMode') ELSE "FinalPayloadValidationMode" END,
        "FinalPayloadValidationMaxRetries" = CASE WHEN p_data ? 'FinalPayloadValidationMaxRetries' THEN (p_data->>'FinalPayloadValidationMaxRetries')::INTEGER ELSE "FinalPayloadValidationMaxRetries" END,
        "MaxCostPerRun" = CASE WHEN p_data ? 'MaxCostPerRun' THEN (p_data->>'MaxCostPerRun')::NUMERIC(10,4) ELSE "MaxCostPerRun" END,
        "MaxTokensPerRun" = CASE WHEN p_data ? 'MaxTokensPerRun' THEN (p_data->>'MaxTokensPerRun')::INTEGER ELSE "MaxTokensPerRun" END,
        "MaxIterationsPerRun" = CASE WHEN p_data ? 'MaxIterationsPerRun' THEN (p_data->>'MaxIterationsPerRun')::INTEGER ELSE "MaxIterationsPerRun" END,
        "MaxTimePerRun" = CASE WHEN p_data ? 'MaxTimePerRun' THEN (p_data->>'MaxTimePerRun')::INTEGER ELSE "MaxTimePerRun" END,
        "MinExecutionsPerRun" = CASE WHEN p_data ? 'MinExecutionsPerRun' THEN (p_data->>'MinExecutionsPerRun')::INTEGER ELSE "MinExecutionsPerRun" END,
        "MaxExecutionsPerRun" = CASE WHEN p_data ? 'MaxExecutionsPerRun' THEN (p_data->>'MaxExecutionsPerRun')::INTEGER ELSE "MaxExecutionsPerRun" END,
        "StartingPayloadValidation" = CASE WHEN p_data ? 'StartingPayloadValidation' THEN (p_data->>'StartingPayloadValidation') ELSE "StartingPayloadValidation" END,
        "StartingPayloadValidationMode" = CASE WHEN p_data ? 'StartingPayloadValidationMode' THEN (p_data->>'StartingPayloadValidationMode') ELSE "StartingPayloadValidationMode" END,
        "DefaultPromptEffortLevel" = CASE WHEN p_data ? 'DefaultPromptEffortLevel' THEN (p_data->>'DefaultPromptEffortLevel')::INTEGER ELSE "DefaultPromptEffortLevel" END,
        "ChatHandlingOption" = CASE WHEN p_data ? 'ChatHandlingOption' THEN (p_data->>'ChatHandlingOption') ELSE "ChatHandlingOption" END,
        "DefaultArtifactTypeID" = CASE WHEN p_data ? 'DefaultArtifactTypeID' THEN (p_data->>'DefaultArtifactTypeID')::UUID ELSE "DefaultArtifactTypeID" END,
        "OwnerUserID" = CASE WHEN p_data ? 'OwnerUserID' THEN (p_data->>'OwnerUserID')::UUID ELSE "OwnerUserID" END,
        "InvocationMode" = CASE WHEN p_data ? 'InvocationMode' THEN (p_data->>'InvocationMode') ELSE "InvocationMode" END,
        "ArtifactCreationMode" = CASE WHEN p_data ? 'ArtifactCreationMode' THEN (p_data->>'ArtifactCreationMode') ELSE "ArtifactCreationMode" END,
        "FunctionalRequirements" = CASE WHEN p_data ? 'FunctionalRequirements' THEN (p_data->>'FunctionalRequirements') ELSE "FunctionalRequirements" END,
        "TechnicalDesign" = CASE WHEN p_data ? 'TechnicalDesign' THEN (p_data->>'TechnicalDesign') ELSE "TechnicalDesign" END,
        "InjectNotes" = CASE WHEN p_data ? 'InjectNotes' THEN (p_data->>'InjectNotes')::BOOLEAN ELSE "InjectNotes" END,
        "MaxNotesToInject" = CASE WHEN p_data ? 'MaxNotesToInject' THEN (p_data->>'MaxNotesToInject')::INTEGER ELSE "MaxNotesToInject" END,
        "NoteInjectionStrategy" = CASE WHEN p_data ? 'NoteInjectionStrategy' THEN (p_data->>'NoteInjectionStrategy') ELSE "NoteInjectionStrategy" END,
        "InjectExamples" = CASE WHEN p_data ? 'InjectExamples' THEN (p_data->>'InjectExamples')::BOOLEAN ELSE "InjectExamples" END,
        "MaxExamplesToInject" = CASE WHEN p_data ? 'MaxExamplesToInject' THEN (p_data->>'MaxExamplesToInject')::INTEGER ELSE "MaxExamplesToInject" END,
        "ExampleInjectionStrategy" = CASE WHEN p_data ? 'ExampleInjectionStrategy' THEN (p_data->>'ExampleInjectionStrategy') ELSE "ExampleInjectionStrategy" END,
        "IsRestricted" = CASE WHEN p_data ? 'IsRestricted' THEN (p_data->>'IsRestricted')::BOOLEAN ELSE "IsRestricted" END,
        "MessageMode" = CASE WHEN p_data ? 'MessageMode' THEN (p_data->>'MessageMode') ELSE "MessageMode" END,
        "MaxMessages" = CASE WHEN p_data ? 'MaxMessages' THEN (p_data->>'MaxMessages')::INTEGER ELSE "MaxMessages" END,
        "AttachmentStorageProviderID" = CASE WHEN p_data ? 'AttachmentStorageProviderID' THEN (p_data->>'AttachmentStorageProviderID')::UUID ELSE "AttachmentStorageProviderID" END,
        "AttachmentRootPath" = CASE WHEN p_data ? 'AttachmentRootPath' THEN (p_data->>'AttachmentRootPath') ELSE "AttachmentRootPath" END,
        "InlineStorageThresholdBytes" = CASE WHEN p_data ? 'InlineStorageThresholdBytes' THEN (p_data->>'InlineStorageThresholdBytes')::INTEGER ELSE "InlineStorageThresholdBytes" END,
        "AgentTypePromptParams" = CASE WHEN p_data ? 'AgentTypePromptParams' THEN (p_data->>'AgentTypePromptParams') ELSE "AgentTypePromptParams" END,
        "ScopeConfig" = CASE WHEN p_data ? 'ScopeConfig' THEN (p_data->>'ScopeConfig') ELSE "ScopeConfig" END,
        "NoteRetentionDays" = CASE WHEN p_data ? 'NoteRetentionDays' THEN (p_data->>'NoteRetentionDays')::INTEGER ELSE "NoteRetentionDays" END,
        "ExampleRetentionDays" = CASE WHEN p_data ? 'ExampleRetentionDays' THEN (p_data->>'ExampleRetentionDays')::INTEGER ELSE "ExampleRetentionDays" END,
        "AutoArchiveEnabled" = CASE WHEN p_data ? 'AutoArchiveEnabled' THEN (p_data->>'AutoArchiveEnabled')::BOOLEAN ELSE "AutoArchiveEnabled" END,
        "RerankerConfiguration" = CASE WHEN p_data ? 'RerankerConfiguration' THEN (p_data->>'RerankerConfiguration') ELSE "RerankerConfiguration" END,
        "CategoryID" = CASE WHEN p_data ? 'CategoryID' THEN (p_data->>'CategoryID')::UUID ELSE "CategoryID" END,
        "AllowEphemeralClientTools" = CASE WHEN p_data ? 'AllowEphemeralClientTools' THEN (p_data->>'AllowEphemeralClientTools')::BOOLEAN ELSE "AllowEphemeralClientTools" END,
        "DefaultStorageAccountID" = CASE WHEN p_data ? 'DefaultStorageAccountID' THEN (p_data->>'DefaultStorageAccountID')::UUID ELSE "DefaultStorageAccountID" END,
        "SearchScopeAccess" = CASE WHEN p_data ? 'SearchScopeAccess' THEN (p_data->>'SearchScopeAccess') ELSE "SearchScopeAccess" END,
        "AcceptUnregisteredFiles" = CASE WHEN p_data ? 'AcceptUnregisteredFiles' THEN (p_data->>'AcceptUnregisteredFiles')::BOOLEAN ELSE "AcceptUnregisteredFiles" END,
        "DefaultCoAgentID" = CASE WHEN p_data ? 'DefaultCoAgentID' THEN (p_data->>'DefaultCoAgentID')::UUID ELSE "DefaultCoAgentID" END,
        "TypeConfiguration" = CASE WHEN p_data ? 'TypeConfiguration' THEN (p_data->>'TypeConfiguration') ELSE "TypeConfiguration" END,
        "AllowMemoryWrite" = CASE WHEN p_data ? 'AllowMemoryWrite' THEN (p_data->>'AllowMemoryWrite')::BOOLEAN ELSE "AllowMemoryWrite" END,
        "RecordingDefault" = CASE WHEN p_data ? 'RecordingDefault' THEN (p_data->>'RecordingDefault') ELSE "RecordingDefault" END,
        "RecordingStorageProviderID" = CASE WHEN p_data ? 'RecordingStorageProviderID' THEN (p_data->>'RecordingStorageProviderID')::UUID ELSE "RecordingStorageProviderID" END,
        "DefaultMediaCollectionID" = CASE WHEN p_data ? 'DefaultMediaCollectionID' THEN (p_data->>'DefaultMediaCollectionID')::UUID ELSE "DefaultMediaCollectionID" END,
        "SupportsPlanMode" = CASE WHEN p_data ? 'SupportsPlanMode' THEN (p_data->>'SupportsPlanMode')::BOOLEAN ELSE "SupportsPlanMode" END,
        "AcceptsSkills" = CASE WHEN p_data ? 'AcceptsSkills' THEN (p_data->>'AcceptsSkills') ELSE "AcceptsSkills" END,
        "SkillActivationMode" = CASE WHEN p_data ? 'SkillActivationMode' THEN (p_data->>'SkillActivationMode') ELSE "SkillActivationMode" END,
        "RequirePlanMode" = CASE WHEN p_data ? 'RequirePlanMode' THEN (p_data->>'RequirePlanMode')::BOOLEAN ELSE "RequirePlanMode" END,
        "ContextWindowMaxTokens" = CASE WHEN p_data ? 'ContextWindowMaxTokens' THEN (p_data->>'ContextWindowMaxTokens')::INTEGER ELSE "ContextWindowMaxTokens" END,
        "CompactionTriggerPercent" = CASE WHEN p_data ? 'CompactionTriggerPercent' THEN (p_data->>'CompactionTriggerPercent')::INTEGER ELSE "CompactionTriggerPercent" END,
        "CompactionTargetPercent" = CASE WHEN p_data ? 'CompactionTargetPercent' THEN (p_data->>'CompactionTargetPercent')::INTEGER ELSE "CompactionTargetPercent" END,
        "ConversationSummaryPromptID" = CASE WHEN p_data ? 'ConversationSummaryPromptID' THEN (p_data->>'ConversationSummaryPromptID')::UUID ELSE "ConversationSummaryPromptID" END,
        "__mj_UpdatedAt" = NOW()
    WHERE "ID" = v_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY SELECT * FROM __mj."vwAIAgents" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgent'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgent"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJActions_CreatedByAgentIDID UUID;
    p_MJActions_CreatedByAgentID_CategoryID UUID;
    p_MJActions_CreatedByAgentID_Name VARCHAR(425);
    p_MJActions_CreatedByAgentID_Description TEXT;
    p_MJActions_CreatedByAgentID_Type VARCHAR(20);
    p_MJActions_CreatedByAgentID_UserPrompt TEXT;
    p_MJActions_CreatedByAgentID_UserComments TEXT;
    p_MJActions_CreatedByAgentID_Code TEXT;
    p_MJActions_CreatedByAgentID_CodeComments TEXT;
    p_MJActions_CreatedByAgentID_CodeApprovalStatus VARCHAR(20);
    p_MJActions_CreatedByAgentID_CodeApprovalComments TEXT;
    p_MJActions_CreatedByAgentID_CodeApprovedByUserID UUID;
    p_MJActions_CreatedByAgentID_CodeApprovedAt TIMESTAMPTZ;
    p_MJActions_CreatedByAgentID_CodeLocked BOOLEAN;
    p_MJActions_CreatedByAgentID_ForceCodeGeneration BOOLEAN;
    p_MJActions_CreatedByAgentID_RetentionPeriod INTEGER;
    p_MJActions_CreatedByAgentID_Status VARCHAR(20);
    p_MJActions_CreatedByAgentID_DriverClass VARCHAR(255);
    p_MJActions_CreatedByAgentID_ParentID UUID;
    p_MJActions_CreatedByAgentID_IconClass VARCHAR(100);
    p_MJActions_CreatedByAgentID_DefaultCompactPromptID UUID;
    p_MJActions_CreatedByAgentID_Config TEXT;
    p_MJActions_CreatedByAgentID_RuntimeActionConfiguration TEXT;
    p_MJActions_CreatedByAgentID_MaxExecutionTimeMS INTEGER;
    p_MJActions_CreatedByAgentID_CreatedByAgentID UUID;
    p_MJAIAgentActions_AgentIDID UUID;
    p_MJAIAgentActions_AgentID_AgentID UUID;
    p_MJAIAgentActions_AgentID_ActionID UUID;
    p_MJAIAgentActions_AgentID_Status VARCHAR(15);
    p_MJAIAgentActions_AgentID_MinExecutionsPerRun INTEGER;
    p_MJAIAgentActions_AgentID_MaxExecutionsPerRun INTEGER;
    p_MJAIAgentActions_AgentID_ResultExpirationTurns INTEGER;
    p_MJAIAgentActions_AgentID_ResultExpirationMode VARCHAR(20);
    p_MJAIAgentActions_AgentID_CompactMode VARCHAR(20);
    p_MJAIAgentActions_AgentID_CompactLength INTEGER;
    p_MJAIAgentActions_AgentID_CompactPromptID UUID;
    p_MJAIAgentArtifactTypes_AgentIDID UUID;
    p_MJAIAgentClientTools_AgentIDID UUID;
    p_MJAIAgentCoAgents_CoAgentIDID UUID;
    p_MJAIAgentCoAgents_TargetAgentIDID UUID;
    p_MJAIAgentCoAgents_TargetAgentID_CoAgentID UUID;
    p_MJAIAgentCoAgents_TargetAgentID_TargetAgentID UUID;
    p_MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID UUID;
    p_MJAIAgentCoAgents_TargetAgentID_Type VARCHAR(30);
    p_MJAIAgentCoAgents_TargetAgentID_IsDefault BOOLEAN;
    p_MJAIAgentCoAgents_TargetAgentID_Sequence INTEGER;
    p_MJAIAgentCoAgents_TargetAgentID_Status VARCHAR(20);
    p_MJAIAgentCoAgents_TargetAgentID_Configuration TEXT;
    p_MJAIAgentConfigurations_AgentIDID UUID;
    p_MJAIAgentDataSources_AgentIDID UUID;
    p_MJAIAgentExamples_AgentIDID UUID;
    p_MJAIAgentLearningCycles_AgentIDID UUID;
    p_MJAIAgentModalities_AgentIDID UUID;
    p_MJAIAgentModels_AgentIDID UUID;
    p_MJAIAgentModels_AgentID_AgentID UUID;
    p_MJAIAgentModels_AgentID_ModelID UUID;
    p_MJAIAgentModels_AgentID_Active BOOLEAN;
    p_MJAIAgentModels_AgentID_Priority INTEGER;
    p_MJAIAgentNotes_AgentIDID UUID;
    p_MJAIAgentNotes_AgentID_AgentID UUID;
    p_MJAIAgentNotes_AgentID_AgentNoteTypeID UUID;
    p_MJAIAgentNotes_AgentID_Note TEXT;
    p_MJAIAgentNotes_AgentID_UserID UUID;
    p_MJAIAgentNotes_AgentID_Type VARCHAR(20);
    p_MJAIAgentNotes_AgentID_IsAutoGenerated BOOLEAN;
    p_MJAIAgentNotes_AgentID_Comments TEXT;
    p_MJAIAgentNotes_AgentID_Status VARCHAR(20);
    p_MJAIAgentNotes_AgentID_SourceConversationID UUID;
    p_MJAIAgentNotes_AgentID_SourceConversationDetailID UUID;
    p_MJAIAgentNotes_AgentID_SourceAIAgentRunID UUID;
    p_MJAIAgentNotes_AgentID_CompanyID UUID;
    p_MJAIAgentNotes_AgentID_EmbeddingVector TEXT;
    p_MJAIAgentNotes_AgentID_EmbeddingModelID UUID;
    p_MJAIAgentNotes_AgentID_PrimaryScopeEntityID UUID;
    p_MJAIAgentNotes_AgentID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentNotes_AgentID_SecondaryScopes TEXT;
    p_MJAIAgentNotes_AgentID_LastAccessedAt TIMESTAMPTZ;
    p_MJAIAgentNotes_AgentID_AccessCount INTEGER;
    p_MJAIAgentNotes_AgentID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID UUID;
    p_MJAIAgentNotes_AgentID_ConsolidationCount INTEGER;
    p_MJAIAgentNotes_AgentID_DerivedFromNoteIDs TEXT;
    p_MJAIAgentNotes_AgentID_ProtectionTier VARCHAR(20);
    p_MJAIAgentNotes_AgentID_ImportanceScore NUMERIC(5,2);
    p_MJAIAgentNotes_AgentID_AuthorType VARCHAR(20);
    p_MJAIAgentPermissions_AgentIDID UUID;
    p_MJAIAgentPrompts_AgentIDID UUID;
    p_MJAIAgentRelationships_AgentIDID UUID;
    p_MJAIAgentRelationships_SubAgentIDID UUID;
    p_MJAIAgentRequests_AgentIDID UUID;
    p_MJAIAgentRuns_AgentIDID UUID;
    p_MJAIAgentSearchScopes_AgentIDID UUID;
    p_MJAIAgentSessions_AgentIDID UUID;
    p_MJAIAgentSkills_AgentIDID UUID;
    p_MJAIAgentSteps_AgentIDID UUID;
    p_MJAIAgentSteps_SubAgentIDID UUID;
    p_MJAIAgentSteps_SubAgentID_AgentID UUID;
    p_MJAIAgentSteps_SubAgentID_Name VARCHAR(255);
    p_MJAIAgentSteps_SubAgentID_Description TEXT;
    p_MJAIAgentSteps_SubAgentID_StepType VARCHAR(20);
    p_MJAIAgentSteps_SubAgentID_StartingStep BOOLEAN;
    p_MJAIAgentSteps_SubAgentID_TimeoutSeconds INTEGER;
    p_MJAIAgentSteps_SubAgentID_RetryCount INTEGER;
    p_MJAIAgentSteps_SubAgentID_OnErrorBehavior VARCHAR(20);
    p_MJAIAgentSteps_SubAgentID_ActionID UUID;
    p_MJAIAgentSteps_SubAgentID_SubAgentID UUID;
    p_MJAIAgentSteps_SubAgentID_PromptID UUID;
    p_MJAIAgentSteps_SubAgentID_ActionOutputMapping TEXT;
    p_MJAIAgentSteps_SubAgentID_PositionX INTEGER;
    p_MJAIAgentSteps_SubAgentID_PositionY INTEGER;
    p_MJAIAgentSteps_SubAgentID_Width INTEGER;
    p_MJAIAgentSteps_SubAgentID_Height INTEGER;
    p_MJAIAgentSteps_SubAgentID_Status VARCHAR(20);
    p_MJAIAgentSteps_SubAgentID_ActionInputMapping TEXT;
    p_MJAIAgentSteps_SubAgentID_LoopBodyType VARCHAR(50);
    p_MJAIAgentSteps_SubAgentID_Configuration TEXT;
    p_MJAIAgents_ParentIDID UUID;
    p_MJAIAgents_ParentID_Name VARCHAR(255);
    p_MJAIAgents_ParentID_Description TEXT;
    p_MJAIAgents_ParentID_LogoURL VARCHAR(255);
    p_MJAIAgents_ParentID_ParentID UUID;
    p_MJAIAgents_ParentID_ExposeAsAction BOOLEAN;
    p_MJAIAgents_ParentID_ExecutionOrder INTEGER;
    p_MJAIAgents_ParentID_ExecutionMode VARCHAR(20);
    p_MJAIAgents_ParentID_EnableContextCompression BOOLEAN;
    p_MJAIAgents_ParentID_ContextCompressionMessageThreshold INTEGER;
    p_MJAIAgents_ParentID_ContextCompressionPromptID UUID;
    p_MJAIAgents_ParentID_ContextCompressionMessageRetentionCount INTEGER;
    p_MJAIAgents_ParentID_TypeID UUID;
    p_MJAIAgents_ParentID_Status VARCHAR(20);
    p_MJAIAgents_ParentID_DriverClass VARCHAR(255);
    p_MJAIAgents_ParentID_IconClass VARCHAR(100);
    p_MJAIAgents_ParentID_ModelSelectionMode VARCHAR(50);
    p_MJAIAgents_ParentID_PayloadDownstreamPaths TEXT;
    p_MJAIAgents_ParentID_PayloadUpstreamPaths TEXT;
    p_MJAIAgents_ParentID_PayloadSelfReadPaths TEXT;
    p_MJAIAgents_ParentID_PayloadSelfWritePaths TEXT;
    p_MJAIAgents_ParentID_PayloadScope TEXT;
    p_MJAIAgents_ParentID_FinalPayloadValidation TEXT;
    p_MJAIAgents_ParentID_FinalPayloadValidationMode VARCHAR(25);
    p_MJAIAgents_ParentID_FinalPayloadValidationMaxRetries INTEGER;
    p_MJAIAgents_ParentID_MaxCostPerRun NUMERIC(10,4);
    p_MJAIAgents_ParentID_MaxTokensPerRun INTEGER;
    p_MJAIAgents_ParentID_MaxIterationsPerRun INTEGER;
    p_MJAIAgents_ParentID_MaxTimePerRun INTEGER;
    p_MJAIAgents_ParentID_MinExecutionsPerRun INTEGER;
    p_MJAIAgents_ParentID_MaxExecutionsPerRun INTEGER;
    p_MJAIAgents_ParentID_StartingPayloadValidation TEXT;
    p_MJAIAgents_ParentID_StartingPayloadValidationMode VARCHAR(25);
    p_MJAIAgents_ParentID_DefaultPromptEffortLevel INTEGER;
    p_MJAIAgents_ParentID_ChatHandlingOption VARCHAR(30);
    p_MJAIAgents_ParentID_DefaultArtifactTypeID UUID;
    p_MJAIAgents_ParentID_OwnerUserID UUID;
    p_MJAIAgents_ParentID_InvocationMode VARCHAR(20);
    p_MJAIAgents_ParentID_ArtifactCreationMode VARCHAR(20);
    p_MJAIAgents_ParentID_FunctionalRequirements TEXT;
    p_MJAIAgents_ParentID_TechnicalDesign TEXT;
    p_MJAIAgents_ParentID_InjectNotes BOOLEAN;
    p_MJAIAgents_ParentID_MaxNotesToInject INTEGER;
    p_MJAIAgents_ParentID_NoteInjectionStrategy VARCHAR(20);
    p_MJAIAgents_ParentID_InjectExamples BOOLEAN;
    p_MJAIAgents_ParentID_MaxExamplesToInject INTEGER;
    p_MJAIAgents_ParentID_ExampleInjectionStrategy VARCHAR(20);
    p_MJAIAgents_ParentID_IsRestricted BOOLEAN;
    p_MJAIAgents_ParentID_MessageMode VARCHAR(50);
    p_MJAIAgents_ParentID_MaxMessages INTEGER;
    p_MJAIAgents_ParentID_AttachmentStorageProviderID UUID;
    p_MJAIAgents_ParentID_AttachmentRootPath VARCHAR(500);
    p_MJAIAgents_ParentID_InlineStorageThresholdBytes INTEGER;
    p_MJAIAgents_ParentID_AgentTypePromptParams TEXT;
    p_MJAIAgents_ParentID_ScopeConfig TEXT;
    p_MJAIAgents_ParentID_NoteRetentionDays INTEGER;
    p_MJAIAgents_ParentID_ExampleRetentionDays INTEGER;
    p_MJAIAgents_ParentID_AutoArchiveEnabled BOOLEAN;
    p_MJAIAgents_ParentID_RerankerConfiguration TEXT;
    p_MJAIAgents_ParentID_CategoryID UUID;
    p_MJAIAgents_ParentID_AllowEphemeralClientTools BOOLEAN;
    p_MJAIAgents_ParentID_DefaultStorageAccountID UUID;
    p_MJAIAgents_ParentID_SearchScopeAccess VARCHAR(20);
    p_MJAIAgents_ParentID_AcceptUnregisteredFiles BOOLEAN;
    p_MJAIAgents_ParentID_DefaultCoAgentID UUID;
    p_MJAIAgents_ParentID_TypeConfiguration TEXT;
    p_MJAIAgents_ParentID_AllowMemoryWrite BOOLEAN;
    p_MJAIAgents_ParentID_RecordingDefault VARCHAR(20);
    p_MJAIAgents_ParentID_RecordingStorageProviderID UUID;
    p_MJAIAgents_ParentID_DefaultMediaCollectionID UUID;
    p_MJAIAgents_ParentID_SupportsPlanMode BOOLEAN;
    p_MJAIAgents_ParentID_AcceptsSkills VARCHAR(20);
    p_MJAIAgents_ParentID_SkillActivationMode VARCHAR(20);
    p_MJAIAgents_ParentID_RequirePlanMode BOOLEAN;
    p_MJAIAgents_ParentID_ContextWindowMaxTokens INTEGER;
    p_MJAIAgents_ParentID_CompactionTriggerPercent INTEGER;
    p_MJAIAgents_ParentID_CompactionTargetPercent INTEGER;
    p_MJAIAgents_ParentID_ConversationSummaryPromptID UUID;
    p_MJAIAgents_DefaultCoAgentIDID UUID;
    p_MJAIAgents_DefaultCoAgentID_Name VARCHAR(255);
    p_MJAIAgents_DefaultCoAgentID_Description TEXT;
    p_MJAIAgents_DefaultCoAgentID_LogoURL VARCHAR(255);
    p_MJAIAgents_DefaultCoAgentID_ParentID UUID;
    p_MJAIAgents_DefaultCoAgentID_ExposeAsAction BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_ExecutionOrder INTEGER;
    p_MJAIAgents_DefaultCoAgentID_ExecutionMode VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_EnableContextCompression BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_ContextCompressionMessageTh_2ba4d7 INTEGER;
    p_MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID UUID;
    p_MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRe_601f1d INTEGER;
    p_MJAIAgents_DefaultCoAgentID_TypeID UUID;
    p_MJAIAgents_DefaultCoAgentID_Status VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_DriverClass VARCHAR(255);
    p_MJAIAgents_DefaultCoAgentID_IconClass VARCHAR(100);
    p_MJAIAgents_DefaultCoAgentID_ModelSelectionMode VARCHAR(50);
    p_MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths TEXT;
    p_MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths TEXT;
    p_MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths TEXT;
    p_MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths TEXT;
    p_MJAIAgents_DefaultCoAgentID_PayloadScope TEXT;
    p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidation TEXT;
    p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode VARCHAR(25);
    p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries INTEGER;
    p_MJAIAgents_DefaultCoAgentID_MaxCostPerRun NUMERIC(10,4);
    p_MJAIAgents_DefaultCoAgentID_MaxTokensPerRun INTEGER;
    p_MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun INTEGER;
    p_MJAIAgents_DefaultCoAgentID_MaxTimePerRun INTEGER;
    p_MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun INTEGER;
    p_MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun INTEGER;
    p_MJAIAgents_DefaultCoAgentID_StartingPayloadValidation TEXT;
    p_MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode VARCHAR(25);
    p_MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel INTEGER;
    p_MJAIAgents_DefaultCoAgentID_ChatHandlingOption VARCHAR(30);
    p_MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID UUID;
    p_MJAIAgents_DefaultCoAgentID_OwnerUserID UUID;
    p_MJAIAgents_DefaultCoAgentID_InvocationMode VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_ArtifactCreationMode VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_FunctionalRequirements TEXT;
    p_MJAIAgents_DefaultCoAgentID_TechnicalDesign TEXT;
    p_MJAIAgents_DefaultCoAgentID_InjectNotes BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_MaxNotesToInject INTEGER;
    p_MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_InjectExamples BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_MaxExamplesToInject INTEGER;
    p_MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_IsRestricted BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_MessageMode VARCHAR(50);
    p_MJAIAgents_DefaultCoAgentID_MaxMessages INTEGER;
    p_MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID UUID;
    p_MJAIAgents_DefaultCoAgentID_AttachmentRootPath VARCHAR(500);
    p_MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes INTEGER;
    p_MJAIAgents_DefaultCoAgentID_AgentTypePromptParams TEXT;
    p_MJAIAgents_DefaultCoAgentID_ScopeConfig TEXT;
    p_MJAIAgents_DefaultCoAgentID_NoteRetentionDays INTEGER;
    p_MJAIAgents_DefaultCoAgentID_ExampleRetentionDays INTEGER;
    p_MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_RerankerConfiguration TEXT;
    p_MJAIAgents_DefaultCoAgentID_CategoryID UUID;
    p_MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID UUID;
    p_MJAIAgents_DefaultCoAgentID_SearchScopeAccess VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_DefaultCoAgentID UUID;
    p_MJAIAgents_DefaultCoAgentID_TypeConfiguration TEXT;
    p_MJAIAgents_DefaultCoAgentID_AllowMemoryWrite BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_RecordingDefault VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID UUID;
    p_MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID UUID;
    p_MJAIAgents_DefaultCoAgentID_SupportsPlanMode BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_AcceptsSkills VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_SkillActivationMode VARCHAR(20);
    p_MJAIAgents_DefaultCoAgentID_RequirePlanMode BOOLEAN;
    p_MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens INTEGER;
    p_MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent INTEGER;
    p_MJAIAgents_DefaultCoAgentID_CompactionTargetPercent INTEGER;
    p_MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID UUID;
    p_MJAIBridgeAgentIdentities_AgentIDID UUID;
    p_MJAIPromptRuns_AgentIDID UUID;
    p_MJAIPromptRuns_AgentID_PromptID UUID;
    p_MJAIPromptRuns_AgentID_ModelID UUID;
    p_MJAIPromptRuns_AgentID_VendorID UUID;
    p_MJAIPromptRuns_AgentID_AgentID UUID;
    p_MJAIPromptRuns_AgentID_ConfigurationID UUID;
    p_MJAIPromptRuns_AgentID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_AgentID_Messages TEXT;
    p_MJAIPromptRuns_AgentID_Result TEXT;
    p_MJAIPromptRuns_AgentID_TokensUsed INTEGER;
    p_MJAIPromptRuns_AgentID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_AgentID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_AgentID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_AgentID_Success BOOLEAN;
    p_MJAIPromptRuns_AgentID_ErrorMessage TEXT;
    p_MJAIPromptRuns_AgentID_ParentID UUID;
    p_MJAIPromptRuns_AgentID_RunType VARCHAR(20);
    p_MJAIPromptRuns_AgentID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_AgentID_AgentRunID UUID;
    p_MJAIPromptRuns_AgentID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_AgentID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_AgentID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_AgentID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_AgentID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_AgentID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_AgentID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_AgentID_TopK INTEGER;
    p_MJAIPromptRuns_AgentID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_AgentID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_AgentID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_AgentID_Seed INTEGER;
    p_MJAIPromptRuns_AgentID_StopSequences TEXT;
    p_MJAIPromptRuns_AgentID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_AgentID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_AgentID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_AgentID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_AgentID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_AgentID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_AgentID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_AgentID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_AgentID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_AgentID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_AgentID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_AgentID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_AgentID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_AgentID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_AgentID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_AgentID_ValidationSummary TEXT;
    p_MJAIPromptRuns_AgentID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_AgentID_FailoverErrors TEXT;
    p_MJAIPromptRuns_AgentID_FailoverDurations TEXT;
    p_MJAIPromptRuns_AgentID_OriginalModelID UUID;
    p_MJAIPromptRuns_AgentID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_AgentID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_AgentID_ModelSelection TEXT;
    p_MJAIPromptRuns_AgentID_Status VARCHAR(50);
    p_MJAIPromptRuns_AgentID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_AgentID_CancellationReason TEXT;
    p_MJAIPromptRuns_AgentID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_AgentID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_AgentID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_AgentID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_AgentID_JudgeID UUID;
    p_MJAIPromptRuns_AgentID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_AgentID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_AgentID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_AgentID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_AgentID_ErrorDetails TEXT;
    p_MJAIPromptRuns_AgentID_ChildPromptID UUID;
    p_MJAIPromptRuns_AgentID_QueueTime INTEGER;
    p_MJAIPromptRuns_AgentID_PromptTime INTEGER;
    p_MJAIPromptRuns_AgentID_CompletionTime INTEGER;
    p_MJAIPromptRuns_AgentID_ModelSpecificResponseDetails TEXT;
    p_MJAIPromptRuns_AgentID_EffortLevel INTEGER;
    p_MJAIPromptRuns_AgentID_RunName VARCHAR(255);
    p_MJAIPromptRuns_AgentID_Comments TEXT;
    p_MJAIPromptRuns_AgentID_TestRunID UUID;
    p_MJAIPromptRuns_AgentID_AssistantPrefill TEXT;
    p_MJAIPromptRuns_AgentID_TokensCacheRead INTEGER;
    p_MJAIPromptRuns_AgentID_TokensCacheWrite INTEGER;
    p_MJAIPromptRuns_AgentID_TokensCacheReadRollup INTEGER;
    p_MJAIPromptRuns_AgentID_TokensCacheWriteRollup INTEGER;
    p_MJAIResultCache_AgentIDID UUID;
    p_MJAIResultCache_AgentID_AIPromptID UUID;
    p_MJAIResultCache_AgentID_AIModelID UUID;
    p_MJAIResultCache_AgentID_RunAt TIMESTAMPTZ;
    p_MJAIResultCache_AgentID_PromptText TEXT;
    p_MJAIResultCache_AgentID_ResultText TEXT;
    p_MJAIResultCache_AgentID_Status VARCHAR(50);
    p_MJAIResultCache_AgentID_ExpiredOn TIMESTAMPTZ;
    p_MJAIResultCache_AgentID_VendorID UUID;
    p_MJAIResultCache_AgentID_AgentID UUID;
    p_MJAIResultCache_AgentID_ConfigurationID UUID;
    p_MJAIResultCache_AgentID_PromptEmbedding BYTEA;
    p_MJAIResultCache_AgentID_PromptRunID UUID;
    p_MJAISkillSubAgents_SubAgentIDID UUID;
    p_MJConversationDetails_AgentIDID UUID;
    p_MJConversationDetails_AgentID_ConversationID UUID;
    p_MJConversationDetails_AgentID_ExternalID VARCHAR(100);
    p_MJConversationDetails_AgentID_Role VARCHAR(20);
    p_MJConversationDetails_AgentID_Message TEXT;
    p_MJConversationDetails_AgentID_Error TEXT;
    p_MJConversationDetails_AgentID_HiddenToUser BOOLEAN;
    p_MJConversationDetails_AgentID_UserRating INTEGER;
    p_MJConversationDetails_AgentID_UserFeedback TEXT;
    p_MJConversationDetails_AgentID_ReflectionInsights TEXT;
    p_MJConversationDetails_AgentID_SummaryOfEarlierConversation TEXT;
    p_MJConversationDetails_AgentID_UserID UUID;
    p_MJConversationDetails_AgentID_ArtifactID UUID;
    p_MJConversationDetails_AgentID_ArtifactVersionID UUID;
    p_MJConversationDetails_AgentID_CompletionTime BIGINT;
    p_MJConversationDetails_AgentID_IsPinned BOOLEAN;
    p_MJConversationDetails_AgentID_ParentID UUID;
    p_MJConversationDetails_AgentID_AgentID UUID;
    p_MJConversationDetails_AgentID_Status VARCHAR(20);
    p_MJConversationDetails_AgentID_SuggestedResponses TEXT;
    p_MJConversationDetails_AgentID_TestRunID UUID;
    p_MJConversationDetails_AgentID_ResponseForm TEXT;
    p_MJConversationDetails_AgentID_ActionableCommands TEXT;
    p_MJConversationDetails_AgentID_AutomaticCommands TEXT;
    p_MJConversationDetails_AgentID_OriginalMessageChanged BOOLEAN;
    p_MJConversationDetails_AgentID_AgentSessionID UUID;
    p_MJConversationDetails_AgentID_TurnEndedAt TIMESTAMPTZ;
    p_MJConversationDetails_AgentID_UtteranceStartMs INTEGER;
    p_MJConversationDetails_AgentID_UtteranceEndMs INTEGER;
    p_MJConversationDetails_AgentID_MediaType VARCHAR(20);
    p_MJConversationDetails_AgentID_Sequence INTEGER;
    p_MJConversationDetails_AgentID_SummaryPromptRunID UUID;
    p_MJConversationWidgetInstances_PinnedAgentIDID UUID;
    p_MJConversations_DefaultAgentIDID UUID;
    p_MJConversations_DefaultAgentID_UserID UUID;
    p_MJConversations_DefaultAgentID_ExternalID VARCHAR(500);
    p_MJConversations_DefaultAgentID_Name VARCHAR(255);
    p_MJConversations_DefaultAgentID_Description TEXT;
    p_MJConversations_DefaultAgentID_Type VARCHAR(50);
    p_MJConversations_DefaultAgentID_IsArchived BOOLEAN;
    p_MJConversations_DefaultAgentID_LinkedEntityID UUID;
    p_MJConversations_DefaultAgentID_LinkedRecordID VARCHAR(500);
    p_MJConversations_DefaultAgentID_DataContextID UUID;
    p_MJConversations_DefaultAgentID_Status VARCHAR(20);
    p_MJConversations_DefaultAgentID_EnvironmentID UUID;
    p_MJConversations_DefaultAgentID_ProjectID UUID;
    p_MJConversations_DefaultAgentID_IsPinned BOOLEAN;
    p_MJConversations_DefaultAgentID_TestRunID UUID;
    p_MJConversations_DefaultAgentID_ApplicationScope VARCHAR(20);
    p_MJConversations_DefaultAgentID_ApplicationID UUID;
    p_MJConversations_DefaultAgentID_DefaultAgentID UUID;
    p_MJConversations_DefaultAgentID_AdditionalData TEXT;
    p_MJConversations_DefaultAgentID_RecordingFileID UUID;
    p_MJConversations_DefaultAgentID_EgressID VARCHAR(255);
    p_MJConversations_DefaultAgentID_VisitorKey VARCHAR(255);
    p_MJConversations_DefaultAgentID_LastConversationID UUID;
    p_MJEntityDocuments_ReasoningAgentIDID UUID;
    p_MJEntityDocuments_ReasoningAgentID_Name VARCHAR(250);
    p_MJEntityDocuments_ReasoningAgentID_TypeID UUID;
    p_MJEntityDocuments_ReasoningAgentID_EntityID UUID;
    p_MJEntityDocuments_ReasoningAgentID_VectorDatabaseID UUID;
    p_MJEntityDocuments_ReasoningAgentID_Status VARCHAR(15);
    p_MJEntityDocuments_ReasoningAgentID_TemplateID UUID;
    p_MJEntityDocuments_ReasoningAgentID_AIModelID UUID;
    p_MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold NUMERIC(12,11);
    p_MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold NUMERIC(12,11);
    p_MJEntityDocuments_ReasoningAgentID_VectorIndexID UUID;
    p_MJEntityDocuments_ReasoningAgentID_Configuration TEXT;
    p_MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning BOOLEAN;
    p_MJEntityDocuments_ReasoningAgentID_ReasoningMode VARCHAR(20);
    p_MJEntityDocuments_ReasoningAgentID_ReasoningThreshold NUMERIC(12,11);
    p_MJEntityDocuments_ReasoningAgentID_ReasoningPromptID UUID;
    p_MJEntityDocuments_ReasoningAgentID_ReasoningAgentID UUID;
    p_MJEntityDocuments_ReasoningAgentID_AutomationLevel VARCHAR(30);
    p_MJRecordProcesses_AgentIDID UUID;
    p_MJRecordProcesses_AgentID_Name VARCHAR(255);
    p_MJRecordProcesses_AgentID_Description TEXT;
    p_MJRecordProcesses_AgentID_CategoryID UUID;
    p_MJRecordProcesses_AgentID_EntityID UUID;
    p_MJRecordProcesses_AgentID_Status VARCHAR(20);
    p_MJRecordProcesses_AgentID_WorkType VARCHAR(20);
    p_MJRecordProcesses_AgentID_ActionID UUID;
    p_MJRecordProcesses_AgentID_AgentID UUID;
    p_MJRecordProcesses_AgentID_PromptID UUID;
    p_MJRecordProcesses_AgentID_ScopeType VARCHAR(20);
    p_MJRecordProcesses_AgentID_ScopeViewID UUID;
    p_MJRecordProcesses_AgentID_ScopeListID UUID;
    p_MJRecordProcesses_AgentID_ScopeFilter TEXT;
    p_MJRecordProcesses_AgentID_OnChangeEnabled BOOLEAN;
    p_MJRecordProcesses_AgentID_OnChangeInvocationType VARCHAR(30);
    p_MJRecordProcesses_AgentID_OnChangeFilter TEXT;
    p_MJRecordProcesses_AgentID_ScheduleEnabled BOOLEAN;
    p_MJRecordProcesses_AgentID_CronExpression VARCHAR(120);
    p_MJRecordProcesses_AgentID_Timezone VARCHAR(100);
    p_MJRecordProcesses_AgentID_OnDemandEnabled BOOLEAN;
    p_MJRecordProcesses_AgentID_InputMapping TEXT;
    p_MJRecordProcesses_AgentID_OutputMapping TEXT;
    p_MJRecordProcesses_AgentID_SkipUnchanged BOOLEAN;
    p_MJRecordProcesses_AgentID_WatermarkStrategy VARCHAR(20);
    p_MJRecordProcesses_AgentID_BatchSize INTEGER;
    p_MJRecordProcesses_AgentID_MaxConcurrency INTEGER;
    p_MJRecordProcesses_AgentID_Configuration TEXT;
    p_MJSearchExecutionLogs_AIAgentIDID UUID;
    p_MJSearchExecutionLogs_AIAgentID_SearchScopeID UUID;
    p_MJSearchExecutionLogs_AIAgentID_UserID UUID;
    p_MJSearchExecutionLogs_AIAgentID_AIAgentID UUID;
    p_MJSearchExecutionLogs_AIAgentID_Query TEXT;
    p_MJSearchExecutionLogs_AIAgentID_TotalDurationMs INTEGER;
    p_MJSearchExecutionLogs_AIAgentID_ResultCount INTEGER;
    p_MJSearchExecutionLogs_AIAgentID_RerankerName VARCHAR(100);
    p_MJSearchExecutionLogs_AIAgentID_RerankerCostCents NUMERIC(10,4);
    p_MJSearchExecutionLogs_AIAgentID_Status VARCHAR(20);
    p_MJSearchExecutionLogs_AIAgentID_FailureReason VARCHAR(500);
    p_MJSearchExecutionLogs_AIAgentID_ProvidersJSON TEXT;
    p_MJTasks_AgentIDID UUID;
    p_MJTasks_AgentID_ParentID UUID;
    p_MJTasks_AgentID_Name VARCHAR(255);
    p_MJTasks_AgentID_Description TEXT;
    p_MJTasks_AgentID_TypeID UUID;
    p_MJTasks_AgentID_EnvironmentID UUID;
    p_MJTasks_AgentID_ProjectID UUID;
    p_MJTasks_AgentID_ConversationDetailID UUID;
    p_MJTasks_AgentID_UserID UUID;
    p_MJTasks_AgentID_AgentID UUID;
    p_MJTasks_AgentID_Status VARCHAR(50);
    p_MJTasks_AgentID_PercentComplete INTEGER;
    p_MJTasks_AgentID_DueAt TIMESTAMPTZ;
    p_MJTasks_AgentID_StartedAt TIMESTAMPTZ;
    p_MJTasks_AgentID_CompletedAt TIMESTAMPTZ;
BEGIN
-- Cascade update on Action using cursor to call spUpdateAction


    FOR _rec IN SELECT "ID", "CategoryID", "Name", "Description", "Type", "UserPrompt", "UserComments", "Code", "CodeComments", "CodeApprovalStatus", "CodeApprovalComments", "CodeApprovedByUserID", "CodeApprovedAt", "CodeLocked", "ForceCodeGeneration", "RetentionPeriod", "Status", "DriverClass", "ParentID", "IconClass", "DefaultCompactPromptID", "Config", "RuntimeActionConfiguration", "MaxExecutionTimeMS", "CreatedByAgentID" FROM __mj."Action" WHERE "CreatedByAgentID" = p_ID
    LOOP
        p_MJActions_CreatedByAgentIDID := _rec."ID";
        p_MJActions_CreatedByAgentID_CategoryID := _rec."CategoryID";
        p_MJActions_CreatedByAgentID_Name := _rec."Name";
        p_MJActions_CreatedByAgentID_Description := _rec."Description";
        p_MJActions_CreatedByAgentID_Type := _rec."Type";
        p_MJActions_CreatedByAgentID_UserPrompt := _rec."UserPrompt";
        p_MJActions_CreatedByAgentID_UserComments := _rec."UserComments";
        p_MJActions_CreatedByAgentID_Code := _rec."Code";
        p_MJActions_CreatedByAgentID_CodeComments := _rec."CodeComments";
        p_MJActions_CreatedByAgentID_CodeApprovalStatus := _rec."CodeApprovalStatus";
        p_MJActions_CreatedByAgentID_CodeApprovalComments := _rec."CodeApprovalComments";
        p_MJActions_CreatedByAgentID_CodeApprovedByUserID := _rec."CodeApprovedByUserID";
        p_MJActions_CreatedByAgentID_CodeApprovedAt := _rec."CodeApprovedAt";
        p_MJActions_CreatedByAgentID_CodeLocked := _rec."CodeLocked";
        p_MJActions_CreatedByAgentID_ForceCodeGeneration := _rec."ForceCodeGeneration";
        p_MJActions_CreatedByAgentID_RetentionPeriod := _rec."RetentionPeriod";
        p_MJActions_CreatedByAgentID_Status := _rec."Status";
        p_MJActions_CreatedByAgentID_DriverClass := _rec."DriverClass";
        p_MJActions_CreatedByAgentID_ParentID := _rec."ParentID";
        p_MJActions_CreatedByAgentID_IconClass := _rec."IconClass";
        p_MJActions_CreatedByAgentID_DefaultCompactPromptID := _rec."DefaultCompactPromptID";
        p_MJActions_CreatedByAgentID_Config := _rec."Config";
        p_MJActions_CreatedByAgentID_RuntimeActionConfiguration := _rec."RuntimeActionConfiguration";
        p_MJActions_CreatedByAgentID_MaxExecutionTimeMS := _rec."MaxExecutionTimeMS";
        p_MJActions_CreatedByAgentID_CreatedByAgentID := _rec."CreatedByAgentID";
        -- Set the FK field to NULL
        p_MJActions_CreatedByAgentID_CreatedByAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAction"(p_ID => p_MJActions_CreatedByAgentIDID, p_CategoryID => p_MJActions_CreatedByAgentID_CategoryID, p_Name => p_MJActions_CreatedByAgentID_Name, p_Description => p_MJActions_CreatedByAgentID_Description, p_Type => p_MJActions_CreatedByAgentID_Type, p_UserPrompt => p_MJActions_CreatedByAgentID_UserPrompt, p_UserComments => p_MJActions_CreatedByAgentID_UserComments, p_Code => p_MJActions_CreatedByAgentID_Code, p_CodeComments => p_MJActions_CreatedByAgentID_CodeComments, p_CodeApprovalStatus => p_MJActions_CreatedByAgentID_CodeApprovalStatus, p_CodeApprovalComments => p_MJActions_CreatedByAgentID_CodeApprovalComments, p_CodeApprovedByUserID => p_MJActions_CreatedByAgentID_CodeApprovedByUserID, p_CodeApprovedAt => p_MJActions_CreatedByAgentID_CodeApprovedAt, p_CodeLocked => p_MJActions_CreatedByAgentID_CodeLocked, p_ForceCodeGeneration => p_MJActions_CreatedByAgentID_ForceCodeGeneration, p_RetentionPeriod => p_MJActions_CreatedByAgentID_RetentionPeriod, p_Status => p_MJActions_CreatedByAgentID_Status, p_DriverClass => p_MJActions_CreatedByAgentID_DriverClass, p_ParentID => p_MJActions_CreatedByAgentID_ParentID, p_IconClass => p_MJActions_CreatedByAgentID_IconClass, p_DefaultCompactPromptID => p_MJActions_CreatedByAgentID_DefaultCompactPromptID, p_Config => p_MJActions_CreatedByAgentID_Config, p_RuntimeActionConfiguration => p_MJActions_CreatedByAgentID_RuntimeActionConfiguration, p_MaxExecutionTimeMS => p_MJActions_CreatedByAgentID_MaxExecutionTimeMS, p_CreatedByAgentID_Clear => 1, p_CreatedByAgentID => p_MJActions_CreatedByAgentID_CreatedByAgentID);

    END LOOP;

    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction


    FOR _rec IN SELECT "ID", "AgentID", "ActionID", "Status", "MinExecutionsPerRun", "MaxExecutionsPerRun", "ResultExpirationTurns", "ResultExpirationMode", "CompactMode", "CompactLength", "CompactPromptID" FROM __mj."AIAgentAction" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentActions_AgentIDID := _rec."ID";
        p_MJAIAgentActions_AgentID_AgentID := _rec."AgentID";
        p_MJAIAgentActions_AgentID_ActionID := _rec."ActionID";
        p_MJAIAgentActions_AgentID_Status := _rec."Status";
        p_MJAIAgentActions_AgentID_MinExecutionsPerRun := _rec."MinExecutionsPerRun";
        p_MJAIAgentActions_AgentID_MaxExecutionsPerRun := _rec."MaxExecutionsPerRun";
        p_MJAIAgentActions_AgentID_ResultExpirationTurns := _rec."ResultExpirationTurns";
        p_MJAIAgentActions_AgentID_ResultExpirationMode := _rec."ResultExpirationMode";
        p_MJAIAgentActions_AgentID_CompactMode := _rec."CompactMode";
        p_MJAIAgentActions_AgentID_CompactLength := _rec."CompactLength";
        p_MJAIAgentActions_AgentID_CompactPromptID := _rec."CompactPromptID";
        -- Set the FK field to NULL
        p_MJAIAgentActions_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentAction"(p_ID => p_MJAIAgentActions_AgentIDID, p_AgentID_Clear => 1, p_AgentID => p_MJAIAgentActions_AgentID_AgentID, p_ActionID => p_MJAIAgentActions_AgentID_ActionID, p_Status => p_MJAIAgentActions_AgentID_Status, p_MinExecutionsPerRun => p_MJAIAgentActions_AgentID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgentActions_AgentID_MaxExecutionsPerRun, p_ResultExpirationTurns => p_MJAIAgentActions_AgentID_ResultExpirationTurns, p_ResultExpirationMode => p_MJAIAgentActions_AgentID_ResultExpirationMode, p_CompactMode => p_MJAIAgentActions_AgentID_CompactMode, p_CompactLength => p_MJAIAgentActions_AgentID_CompactLength, p_CompactPromptID => p_MJAIAgentActions_AgentID_CompactPromptID);

    END LOOP;

    
    -- Cascade delete from AIAgentArtifactType using cursor to call spDeleteAIAgentArtifactType

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentArtifactType" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentArtifactTypes_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentArtifactType"(p_ID => p_MJAIAgentArtifactTypes_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentClientTool using cursor to call spDeleteAIAgentClientTool

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentClientTool" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentClientTools_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentClientTool"(p_ID => p_MJAIAgentClientTools_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentCoAgent using cursor to call spDeleteAIAgentCoAgent

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentCoAgent" WHERE "CoAgentID" = p_ID
    LOOP
        p_MJAIAgentCoAgents_CoAgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentCoAgent"(p_ID => p_MJAIAgentCoAgents_CoAgentIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentCoAgent using cursor to call spUpdateAIAgentCoAgent


    FOR _rec IN SELECT "ID", "CoAgentID", "TargetAgentID", "TargetAgentTypeID", "Type", "IsDefault", "Sequence", "Status", "Configuration" FROM __mj."AIAgentCoAgent" WHERE "TargetAgentID" = p_ID
    LOOP
        p_MJAIAgentCoAgents_TargetAgentIDID := _rec."ID";
        p_MJAIAgentCoAgents_TargetAgentID_CoAgentID := _rec."CoAgentID";
        p_MJAIAgentCoAgents_TargetAgentID_TargetAgentID := _rec."TargetAgentID";
        p_MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID := _rec."TargetAgentTypeID";
        p_MJAIAgentCoAgents_TargetAgentID_Type := _rec."Type";
        p_MJAIAgentCoAgents_TargetAgentID_IsDefault := _rec."IsDefault";
        p_MJAIAgentCoAgents_TargetAgentID_Sequence := _rec."Sequence";
        p_MJAIAgentCoAgents_TargetAgentID_Status := _rec."Status";
        p_MJAIAgentCoAgents_TargetAgentID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJAIAgentCoAgents_TargetAgentID_TargetAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentCoAgent"(p_ID => p_MJAIAgentCoAgents_TargetAgentIDID, p_CoAgentID => p_MJAIAgentCoAgents_TargetAgentID_CoAgentID, p_TargetAgentID_Clear => 1, p_TargetAgentID => p_MJAIAgentCoAgents_TargetAgentID_TargetAgentID, p_TargetAgentTypeID => p_MJAIAgentCoAgents_TargetAgentID_TargetAgentTypeID, p_Type => p_MJAIAgentCoAgents_TargetAgentID_Type, p_IsDefault => p_MJAIAgentCoAgents_TargetAgentID_IsDefault, p_Sequence => p_MJAIAgentCoAgents_TargetAgentID_Sequence, p_Status => p_MJAIAgentCoAgents_TargetAgentID_Status, p_Configuration => p_MJAIAgentCoAgents_TargetAgentID_Configuration);

    END LOOP;

    
    -- Cascade delete from AIAgentConfiguration using cursor to call spDeleteAIAgentConfiguration

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentConfiguration" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentConfigurations_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentConfiguration"(p_ID => p_MJAIAgentConfigurations_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentDataSource using cursor to call spDeleteAIAgentDataSource

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentDataSource" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentDataSources_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentDataSource"(p_ID => p_MJAIAgentDataSources_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentExample using cursor to call spDeleteAIAgentExample

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentExample" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentExamples_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentExample"(p_ID => p_MJAIAgentExamples_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentLearningCycle using cursor to call spDeleteAIAgentLearningCycle

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentLearningCycle" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentLearningCycles_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentLearningCycle"(p_ID => p_MJAIAgentLearningCycles_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentModality using cursor to call spDeleteAIAgentModality

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentModality" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentModalities_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentModality"(p_ID => p_MJAIAgentModalities_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentModel using cursor to call spUpdateAIAgentModel


    FOR _rec IN SELECT "ID", "AgentID", "ModelID", "Active", "Priority" FROM __mj."AIAgentModel" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentModels_AgentIDID := _rec."ID";
        p_MJAIAgentModels_AgentID_AgentID := _rec."AgentID";
        p_MJAIAgentModels_AgentID_ModelID := _rec."ModelID";
        p_MJAIAgentModels_AgentID_Active := _rec."Active";
        p_MJAIAgentModels_AgentID_Priority := _rec."Priority";
        -- Set the FK field to NULL
        p_MJAIAgentModels_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentModel"(p_ID => p_MJAIAgentModels_AgentIDID, p_AgentID_Clear => 1, p_AgentID => p_MJAIAgentModels_AgentID_AgentID, p_ModelID => p_MJAIAgentModels_AgentID_ModelID, p_Active => p_MJAIAgentModels_AgentID_Active, p_Priority => p_MJAIAgentModels_AgentID_Priority);

    END LOOP;

    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote


    FOR _rec IN SELECT "ID", "AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt", "ConsolidatedIntoNoteID", "ConsolidationCount", "DerivedFromNoteIDs", "ProtectionTier", "ImportanceScore", "AuthorType" FROM __mj."AIAgentNote" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentNotes_AgentIDID := _rec."ID";
        p_MJAIAgentNotes_AgentID_AgentID := _rec."AgentID";
        p_MJAIAgentNotes_AgentID_AgentNoteTypeID := _rec."AgentNoteTypeID";
        p_MJAIAgentNotes_AgentID_Note := _rec."Note";
        p_MJAIAgentNotes_AgentID_UserID := _rec."UserID";
        p_MJAIAgentNotes_AgentID_Type := _rec."Type";
        p_MJAIAgentNotes_AgentID_IsAutoGenerated := _rec."IsAutoGenerated";
        p_MJAIAgentNotes_AgentID_Comments := _rec."Comments";
        p_MJAIAgentNotes_AgentID_Status := _rec."Status";
        p_MJAIAgentNotes_AgentID_SourceConversationID := _rec."SourceConversationID";
        p_MJAIAgentNotes_AgentID_SourceConversationDetailID := _rec."SourceConversationDetailID";
        p_MJAIAgentNotes_AgentID_SourceAIAgentRunID := _rec."SourceAIAgentRunID";
        p_MJAIAgentNotes_AgentID_CompanyID := _rec."CompanyID";
        p_MJAIAgentNotes_AgentID_EmbeddingVector := _rec."EmbeddingVector";
        p_MJAIAgentNotes_AgentID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJAIAgentNotes_AgentID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentNotes_AgentID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentNotes_AgentID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentNotes_AgentID_LastAccessedAt := _rec."LastAccessedAt";
        p_MJAIAgentNotes_AgentID_AccessCount := _rec."AccessCount";
        p_MJAIAgentNotes_AgentID_ExpiresAt := _rec."ExpiresAt";
        p_MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID := _rec."ConsolidatedIntoNoteID";
        p_MJAIAgentNotes_AgentID_ConsolidationCount := _rec."ConsolidationCount";
        p_MJAIAgentNotes_AgentID_DerivedFromNoteIDs := _rec."DerivedFromNoteIDs";
        p_MJAIAgentNotes_AgentID_ProtectionTier := _rec."ProtectionTier";
        p_MJAIAgentNotes_AgentID_ImportanceScore := _rec."ImportanceScore";
        p_MJAIAgentNotes_AgentID_AuthorType := _rec."AuthorType";
        -- Set the FK field to NULL
        p_MJAIAgentNotes_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentNote"(p_ID => p_MJAIAgentNotes_AgentIDID, p_AgentID_Clear => 1, p_AgentID => p_MJAIAgentNotes_AgentID_AgentID, p_AgentNoteTypeID => p_MJAIAgentNotes_AgentID_AgentNoteTypeID, p_Note => p_MJAIAgentNotes_AgentID_Note, p_UserID => p_MJAIAgentNotes_AgentID_UserID, p_Type => p_MJAIAgentNotes_AgentID_Type, p_IsAutoGenerated => p_MJAIAgentNotes_AgentID_IsAutoGenerated, p_Comments => p_MJAIAgentNotes_AgentID_Comments, p_Status => p_MJAIAgentNotes_AgentID_Status, p_SourceConversationID => p_MJAIAgentNotes_AgentID_SourceConversationID, p_SourceConversationDetailID => p_MJAIAgentNotes_AgentID_SourceConversationDetailID, p_SourceAIAgentRunID => p_MJAIAgentNotes_AgentID_SourceAIAgentRunID, p_CompanyID => p_MJAIAgentNotes_AgentID_CompanyID, p_EmbeddingVector => p_MJAIAgentNotes_AgentID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentNotes_AgentID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentNotes_AgentID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentNotes_AgentID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentNotes_AgentID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentNotes_AgentID_LastAccessedAt, p_AccessCount => p_MJAIAgentNotes_AgentID_AccessCount, p_ExpiresAt => p_MJAIAgentNotes_AgentID_ExpiresAt, p_ConsolidatedIntoNoteID => p_MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, p_ConsolidationCount => p_MJAIAgentNotes_AgentID_ConsolidationCount, p_DerivedFromNoteIDs => p_MJAIAgentNotes_AgentID_DerivedFromNoteIDs, p_ProtectionTier => p_MJAIAgentNotes_AgentID_ProtectionTier, p_ImportanceScore => p_MJAIAgentNotes_AgentID_ImportanceScore, p_AuthorType => p_MJAIAgentNotes_AgentID_AuthorType);

    END LOOP;

    
    -- Cascade delete from AIAgentPermission using cursor to call spDeleteAIAgentPermission

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentPermission" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentPermissions_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentPermission"(p_ID => p_MJAIAgentPermissions_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentPrompt" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentPrompts_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentPrompt"(p_ID => p_MJAIAgentPrompts_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRelationship" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentRelationships_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRelationship"(p_ID => p_MJAIAgentRelationships_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRelationship using cursor to call spDeleteAIAgentRelationship

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRelationship" WHERE "SubAgentID" = p_ID
    LOOP
        p_MJAIAgentRelationships_SubAgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRelationship"(p_ID => p_MJAIAgentRelationships_SubAgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRequest using cursor to call spDeleteAIAgentRequest

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRequest" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentRequests_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRequest"(p_ID => p_MJAIAgentRequests_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRun using cursor to call spDeleteAIAgentRun

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRun" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentRuns_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRun"(p_ID => p_MJAIAgentRuns_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentSearchScope using cursor to call spDeleteAIAgentSearchScope

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentSearchScope" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentSearchScopes_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentSearchScope"(p_ID => p_MJAIAgentSearchScopes_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentSession using cursor to call spDeleteAIAgentSession

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentSession" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentSessions_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentSession"(p_ID => p_MJAIAgentSessions_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentSkill using cursor to call spDeleteAIAgentSkill

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentSkill" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentSkills_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentSkill"(p_ID => p_MJAIAgentSkills_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentStep using cursor to call spDeleteAIAgentStep

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentStep" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentSteps_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentStep"(p_ID => p_MJAIAgentSteps_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep


    FOR _rec IN SELECT "ID", "AgentID", "Name", "Description", "StepType", "StartingStep", "TimeoutSeconds", "RetryCount", "OnErrorBehavior", "ActionID", "SubAgentID", "PromptID", "ActionOutputMapping", "PositionX", "PositionY", "Width", "Height", "Status", "ActionInputMapping", "LoopBodyType", "Configuration" FROM __mj."AIAgentStep" WHERE "SubAgentID" = p_ID
    LOOP
        p_MJAIAgentSteps_SubAgentIDID := _rec."ID";
        p_MJAIAgentSteps_SubAgentID_AgentID := _rec."AgentID";
        p_MJAIAgentSteps_SubAgentID_Name := _rec."Name";
        p_MJAIAgentSteps_SubAgentID_Description := _rec."Description";
        p_MJAIAgentSteps_SubAgentID_StepType := _rec."StepType";
        p_MJAIAgentSteps_SubAgentID_StartingStep := _rec."StartingStep";
        p_MJAIAgentSteps_SubAgentID_TimeoutSeconds := _rec."TimeoutSeconds";
        p_MJAIAgentSteps_SubAgentID_RetryCount := _rec."RetryCount";
        p_MJAIAgentSteps_SubAgentID_OnErrorBehavior := _rec."OnErrorBehavior";
        p_MJAIAgentSteps_SubAgentID_ActionID := _rec."ActionID";
        p_MJAIAgentSteps_SubAgentID_SubAgentID := _rec."SubAgentID";
        p_MJAIAgentSteps_SubAgentID_PromptID := _rec."PromptID";
        p_MJAIAgentSteps_SubAgentID_ActionOutputMapping := _rec."ActionOutputMapping";
        p_MJAIAgentSteps_SubAgentID_PositionX := _rec."PositionX";
        p_MJAIAgentSteps_SubAgentID_PositionY := _rec."PositionY";
        p_MJAIAgentSteps_SubAgentID_Width := _rec."Width";
        p_MJAIAgentSteps_SubAgentID_Height := _rec."Height";
        p_MJAIAgentSteps_SubAgentID_Status := _rec."Status";
        p_MJAIAgentSteps_SubAgentID_ActionInputMapping := _rec."ActionInputMapping";
        p_MJAIAgentSteps_SubAgentID_LoopBodyType := _rec."LoopBodyType";
        p_MJAIAgentSteps_SubAgentID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJAIAgentSteps_SubAgentID_SubAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentStep"(p_ID => p_MJAIAgentSteps_SubAgentIDID, p_AgentID => p_MJAIAgentSteps_SubAgentID_AgentID, p_Name => p_MJAIAgentSteps_SubAgentID_Name, p_Description => p_MJAIAgentSteps_SubAgentID_Description, p_StepType => p_MJAIAgentSteps_SubAgentID_StepType, p_StartingStep => p_MJAIAgentSteps_SubAgentID_StartingStep, p_TimeoutSeconds => p_MJAIAgentSteps_SubAgentID_TimeoutSeconds, p_RetryCount => p_MJAIAgentSteps_SubAgentID_RetryCount, p_OnErrorBehavior => p_MJAIAgentSteps_SubAgentID_OnErrorBehavior, p_ActionID => p_MJAIAgentSteps_SubAgentID_ActionID, p_SubAgentID_Clear => 1, p_SubAgentID => p_MJAIAgentSteps_SubAgentID_SubAgentID, p_PromptID => p_MJAIAgentSteps_SubAgentID_PromptID, p_ActionOutputMapping => p_MJAIAgentSteps_SubAgentID_ActionOutputMapping, p_PositionX => p_MJAIAgentSteps_SubAgentID_PositionX, p_PositionY => p_MJAIAgentSteps_SubAgentID_PositionY, p_Width => p_MJAIAgentSteps_SubAgentID_Width, p_Height => p_MJAIAgentSteps_SubAgentID_Height, p_Status => p_MJAIAgentSteps_SubAgentID_Status, p_ActionInputMapping => p_MJAIAgentSteps_SubAgentID_ActionInputMapping, p_LoopBodyType => p_MJAIAgentSteps_SubAgentID_LoopBodyType, p_Configuration => p_MJAIAgentSteps_SubAgentID_Configuration);

    END LOOP;

    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID", "AllowEphemeralClientTools", "DefaultStorageAccountID", "SearchScopeAccess", "AcceptUnregisteredFiles", "DefaultCoAgentID", "TypeConfiguration", "AllowMemoryWrite", "RecordingDefault", "RecordingStorageProviderID", "DefaultMediaCollectionID", "SupportsPlanMode", "AcceptsSkills", "SkillActivationMode", "RequirePlanMode", "ContextWindowMaxTokens", "CompactionTriggerPercent", "CompactionTargetPercent", "ConversationSummaryPromptID" FROM __mj."AIAgent" WHERE "ParentID" = p_ID
    LOOP
        p_MJAIAgents_ParentIDID := _rec."ID";
        p_MJAIAgents_ParentID_Name := _rec."Name";
        p_MJAIAgents_ParentID_Description := _rec."Description";
        p_MJAIAgents_ParentID_LogoURL := _rec."LogoURL";
        p_MJAIAgents_ParentID_ParentID := _rec."ParentID";
        p_MJAIAgents_ParentID_ExposeAsAction := _rec."ExposeAsAction";
        p_MJAIAgents_ParentID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIAgents_ParentID_ExecutionMode := _rec."ExecutionMode";
        p_MJAIAgents_ParentID_EnableContextCompression := _rec."EnableContextCompression";
        p_MJAIAgents_ParentID_ContextCompressionMessageThreshold := _rec."ContextCompressionMessageThreshold";
        p_MJAIAgents_ParentID_ContextCompressionPromptID := _rec."ContextCompressionPromptID";
        p_MJAIAgents_ParentID_ContextCompressionMessageRetentionCount := _rec."ContextCompressionMessageRetentionCount";
        p_MJAIAgents_ParentID_TypeID := _rec."TypeID";
        p_MJAIAgents_ParentID_Status := _rec."Status";
        p_MJAIAgents_ParentID_DriverClass := _rec."DriverClass";
        p_MJAIAgents_ParentID_IconClass := _rec."IconClass";
        p_MJAIAgents_ParentID_ModelSelectionMode := _rec."ModelSelectionMode";
        p_MJAIAgents_ParentID_PayloadDownstreamPaths := _rec."PayloadDownstreamPaths";
        p_MJAIAgents_ParentID_PayloadUpstreamPaths := _rec."PayloadUpstreamPaths";
        p_MJAIAgents_ParentID_PayloadSelfReadPaths := _rec."PayloadSelfReadPaths";
        p_MJAIAgents_ParentID_PayloadSelfWritePaths := _rec."PayloadSelfWritePaths";
        p_MJAIAgents_ParentID_PayloadScope := _rec."PayloadScope";
        p_MJAIAgents_ParentID_FinalPayloadValidation := _rec."FinalPayloadValidation";
        p_MJAIAgents_ParentID_FinalPayloadValidationMode := _rec."FinalPayloadValidationMode";
        p_MJAIAgents_ParentID_FinalPayloadValidationMaxRetries := _rec."FinalPayloadValidationMaxRetries";
        p_MJAIAgents_ParentID_MaxCostPerRun := _rec."MaxCostPerRun";
        p_MJAIAgents_ParentID_MaxTokensPerRun := _rec."MaxTokensPerRun";
        p_MJAIAgents_ParentID_MaxIterationsPerRun := _rec."MaxIterationsPerRun";
        p_MJAIAgents_ParentID_MaxTimePerRun := _rec."MaxTimePerRun";
        p_MJAIAgents_ParentID_MinExecutionsPerRun := _rec."MinExecutionsPerRun";
        p_MJAIAgents_ParentID_MaxExecutionsPerRun := _rec."MaxExecutionsPerRun";
        p_MJAIAgents_ParentID_StartingPayloadValidation := _rec."StartingPayloadValidation";
        p_MJAIAgents_ParentID_StartingPayloadValidationMode := _rec."StartingPayloadValidationMode";
        p_MJAIAgents_ParentID_DefaultPromptEffortLevel := _rec."DefaultPromptEffortLevel";
        p_MJAIAgents_ParentID_ChatHandlingOption := _rec."ChatHandlingOption";
        p_MJAIAgents_ParentID_DefaultArtifactTypeID := _rec."DefaultArtifactTypeID";
        p_MJAIAgents_ParentID_OwnerUserID := _rec."OwnerUserID";
        p_MJAIAgents_ParentID_InvocationMode := _rec."InvocationMode";
        p_MJAIAgents_ParentID_ArtifactCreationMode := _rec."ArtifactCreationMode";
        p_MJAIAgents_ParentID_FunctionalRequirements := _rec."FunctionalRequirements";
        p_MJAIAgents_ParentID_TechnicalDesign := _rec."TechnicalDesign";
        p_MJAIAgents_ParentID_InjectNotes := _rec."InjectNotes";
        p_MJAIAgents_ParentID_MaxNotesToInject := _rec."MaxNotesToInject";
        p_MJAIAgents_ParentID_NoteInjectionStrategy := _rec."NoteInjectionStrategy";
        p_MJAIAgents_ParentID_InjectExamples := _rec."InjectExamples";
        p_MJAIAgents_ParentID_MaxExamplesToInject := _rec."MaxExamplesToInject";
        p_MJAIAgents_ParentID_ExampleInjectionStrategy := _rec."ExampleInjectionStrategy";
        p_MJAIAgents_ParentID_IsRestricted := _rec."IsRestricted";
        p_MJAIAgents_ParentID_MessageMode := _rec."MessageMode";
        p_MJAIAgents_ParentID_MaxMessages := _rec."MaxMessages";
        p_MJAIAgents_ParentID_AttachmentStorageProviderID := _rec."AttachmentStorageProviderID";
        p_MJAIAgents_ParentID_AttachmentRootPath := _rec."AttachmentRootPath";
        p_MJAIAgents_ParentID_InlineStorageThresholdBytes := _rec."InlineStorageThresholdBytes";
        p_MJAIAgents_ParentID_AgentTypePromptParams := _rec."AgentTypePromptParams";
        p_MJAIAgents_ParentID_ScopeConfig := _rec."ScopeConfig";
        p_MJAIAgents_ParentID_NoteRetentionDays := _rec."NoteRetentionDays";
        p_MJAIAgents_ParentID_ExampleRetentionDays := _rec."ExampleRetentionDays";
        p_MJAIAgents_ParentID_AutoArchiveEnabled := _rec."AutoArchiveEnabled";
        p_MJAIAgents_ParentID_RerankerConfiguration := _rec."RerankerConfiguration";
        p_MJAIAgents_ParentID_CategoryID := _rec."CategoryID";
        p_MJAIAgents_ParentID_AllowEphemeralClientTools := _rec."AllowEphemeralClientTools";
        p_MJAIAgents_ParentID_DefaultStorageAccountID := _rec."DefaultStorageAccountID";
        p_MJAIAgents_ParentID_SearchScopeAccess := _rec."SearchScopeAccess";
        p_MJAIAgents_ParentID_AcceptUnregisteredFiles := _rec."AcceptUnregisteredFiles";
        p_MJAIAgents_ParentID_DefaultCoAgentID := _rec."DefaultCoAgentID";
        p_MJAIAgents_ParentID_TypeConfiguration := _rec."TypeConfiguration";
        p_MJAIAgents_ParentID_AllowMemoryWrite := _rec."AllowMemoryWrite";
        p_MJAIAgents_ParentID_RecordingDefault := _rec."RecordingDefault";
        p_MJAIAgents_ParentID_RecordingStorageProviderID := _rec."RecordingStorageProviderID";
        p_MJAIAgents_ParentID_DefaultMediaCollectionID := _rec."DefaultMediaCollectionID";
        p_MJAIAgents_ParentID_SupportsPlanMode := _rec."SupportsPlanMode";
        p_MJAIAgents_ParentID_AcceptsSkills := _rec."AcceptsSkills";
        p_MJAIAgents_ParentID_SkillActivationMode := _rec."SkillActivationMode";
        p_MJAIAgents_ParentID_RequirePlanMode := _rec."RequirePlanMode";
        p_MJAIAgents_ParentID_ContextWindowMaxTokens := _rec."ContextWindowMaxTokens";
        p_MJAIAgents_ParentID_CompactionTriggerPercent := _rec."CompactionTriggerPercent";
        p_MJAIAgents_ParentID_CompactionTargetPercent := _rec."CompactionTargetPercent";
        p_MJAIAgents_ParentID_ConversationSummaryPromptID := _rec."ConversationSummaryPromptID";
        -- Set the FK field to NULL
        p_MJAIAgents_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_ID => p_MJAIAgents_ParentIDID, p_Name => p_MJAIAgents_ParentID_Name, p_Description => p_MJAIAgents_ParentID_Description, p_LogoURL => p_MJAIAgents_ParentID_LogoURL, p_ParentID_Clear => 1, p_ParentID => p_MJAIAgents_ParentID_ParentID, p_ExposeAsAction => p_MJAIAgents_ParentID_ExposeAsAction, p_ExecutionOrder => p_MJAIAgents_ParentID_ExecutionOrder, p_ExecutionMode => p_MJAIAgents_ParentID_ExecutionMode, p_EnableContextCompression => p_MJAIAgents_ParentID_EnableContextCompression, p_ContextCompressionMessageThreshold => p_MJAIAgents_ParentID_ContextCompressionMessageThreshold, p_ContextCompressionPromptID => p_MJAIAgents_ParentID_ContextCompressionPromptID, p_ContextCompressionMessageRetentionCount => p_MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, p_TypeID => p_MJAIAgents_ParentID_TypeID, p_Status => p_MJAIAgents_ParentID_Status, p_DriverClass => p_MJAIAgents_ParentID_DriverClass, p_IconClass => p_MJAIAgents_ParentID_IconClass, p_ModelSelectionMode => p_MJAIAgents_ParentID_ModelSelectionMode, p_PayloadDownstreamPaths => p_MJAIAgents_ParentID_PayloadDownstreamPaths, p_PayloadUpstreamPaths => p_MJAIAgents_ParentID_PayloadUpstreamPaths, p_PayloadSelfReadPaths => p_MJAIAgents_ParentID_PayloadSelfReadPaths, p_PayloadSelfWritePaths => p_MJAIAgents_ParentID_PayloadSelfWritePaths, p_PayloadScope => p_MJAIAgents_ParentID_PayloadScope, p_FinalPayloadValidation => p_MJAIAgents_ParentID_FinalPayloadValidation, p_FinalPayloadValidationMode => p_MJAIAgents_ParentID_FinalPayloadValidationMode, p_FinalPayloadValidationMaxRetries => p_MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, p_MaxCostPerRun => p_MJAIAgents_ParentID_MaxCostPerRun, p_MaxTokensPerRun => p_MJAIAgents_ParentID_MaxTokensPerRun, p_MaxIterationsPerRun => p_MJAIAgents_ParentID_MaxIterationsPerRun, p_MaxTimePerRun => p_MJAIAgents_ParentID_MaxTimePerRun, p_MinExecutionsPerRun => p_MJAIAgents_ParentID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgents_ParentID_MaxExecutionsPerRun, p_StartingPayloadValidation => p_MJAIAgents_ParentID_StartingPayloadValidation, p_StartingPayloadValidationMode => p_MJAIAgents_ParentID_StartingPayloadValidationMode, p_DefaultPromptEffortLevel => p_MJAIAgents_ParentID_DefaultPromptEffortLevel, p_ChatHandlingOption => p_MJAIAgents_ParentID_ChatHandlingOption, p_DefaultArtifactTypeID => p_MJAIAgents_ParentID_DefaultArtifactTypeID, p_OwnerUserID => p_MJAIAgents_ParentID_OwnerUserID, p_InvocationMode => p_MJAIAgents_ParentID_InvocationMode, p_ArtifactCreationMode => p_MJAIAgents_ParentID_ArtifactCreationMode, p_FunctionalRequirements => p_MJAIAgents_ParentID_FunctionalRequirements, p_TechnicalDesign => p_MJAIAgents_ParentID_TechnicalDesign, p_InjectNotes => p_MJAIAgents_ParentID_InjectNotes, p_MaxNotesToInject => p_MJAIAgents_ParentID_MaxNotesToInject, p_NoteInjectionStrategy => p_MJAIAgents_ParentID_NoteInjectionStrategy, p_InjectExamples => p_MJAIAgents_ParentID_InjectExamples, p_MaxExamplesToInject => p_MJAIAgents_ParentID_MaxExamplesToInject, p_ExampleInjectionStrategy => p_MJAIAgents_ParentID_ExampleInjectionStrategy, p_IsRestricted => p_MJAIAgents_ParentID_IsRestricted, p_MessageMode => p_MJAIAgents_ParentID_MessageMode, p_MaxMessages => p_MJAIAgents_ParentID_MaxMessages, p_AttachmentStorageProviderID => p_MJAIAgents_ParentID_AttachmentStorageProviderID, p_AttachmentRootPath => p_MJAIAgents_ParentID_AttachmentRootPath, p_InlineStorageThresholdBytes => p_MJAIAgents_ParentID_InlineStorageThresholdBytes, p_AgentTypePromptParams => p_MJAIAgents_ParentID_AgentTypePromptParams, p_ScopeConfig => p_MJAIAgents_ParentID_ScopeConfig, p_NoteRetentionDays => p_MJAIAgents_ParentID_NoteRetentionDays, p_ExampleRetentionDays => p_MJAIAgents_ParentID_ExampleRetentionDays, p_AutoArchiveEnabled => p_MJAIAgents_ParentID_AutoArchiveEnabled, p_RerankerConfiguration => p_MJAIAgents_ParentID_RerankerConfiguration, p_CategoryID => p_MJAIAgents_ParentID_CategoryID, p_AllowEphemeralClientTools => p_MJAIAgents_ParentID_AllowEphemeralClientTools, p_DefaultStorageAccountID => p_MJAIAgents_ParentID_DefaultStorageAccountID, p_SearchScopeAccess => p_MJAIAgents_ParentID_SearchScopeAccess, p_AcceptUnregisteredFiles => p_MJAIAgents_ParentID_AcceptUnregisteredFiles, p_DefaultCoAgentID => p_MJAIAgents_ParentID_DefaultCoAgentID, p_TypeConfiguration => p_MJAIAgents_ParentID_TypeConfiguration, p_AllowMemoryWrite => p_MJAIAgents_ParentID_AllowMemoryWrite, p_RecordingDefault => p_MJAIAgents_ParentID_RecordingDefault, p_RecordingStorageProviderID => p_MJAIAgents_ParentID_RecordingStorageProviderID, p_DefaultMediaCollectionID => p_MJAIAgents_ParentID_DefaultMediaCollectionID, p_SupportsPlanMode => p_MJAIAgents_ParentID_SupportsPlanMode, p_AcceptsSkills => p_MJAIAgents_ParentID_AcceptsSkills, p_SkillActivationMode => p_MJAIAgents_ParentID_SkillActivationMode, p_RequirePlanMode => p_MJAIAgents_ParentID_RequirePlanMode, p_ContextWindowMaxTokens => p_MJAIAgents_ParentID_ContextWindowMaxTokens, p_CompactionTriggerPercent => p_MJAIAgents_ParentID_CompactionTriggerPercent, p_CompactionTargetPercent => p_MJAIAgents_ParentID_CompactionTargetPercent, p_ConversationSummaryPromptID => p_MJAIAgents_ParentID_ConversationSummaryPromptID);

    END LOOP;

    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID", "AllowEphemeralClientTools", "DefaultStorageAccountID", "SearchScopeAccess", "AcceptUnregisteredFiles", "DefaultCoAgentID", "TypeConfiguration", "AllowMemoryWrite", "RecordingDefault", "RecordingStorageProviderID", "DefaultMediaCollectionID", "SupportsPlanMode", "AcceptsSkills", "SkillActivationMode", "RequirePlanMode", "ContextWindowMaxTokens", "CompactionTriggerPercent", "CompactionTargetPercent", "ConversationSummaryPromptID" FROM __mj."AIAgent" WHERE "DefaultCoAgentID" = p_ID
    LOOP
        p_MJAIAgents_DefaultCoAgentIDID := _rec."ID";
        p_MJAIAgents_DefaultCoAgentID_Name := _rec."Name";
        p_MJAIAgents_DefaultCoAgentID_Description := _rec."Description";
        p_MJAIAgents_DefaultCoAgentID_LogoURL := _rec."LogoURL";
        p_MJAIAgents_DefaultCoAgentID_ParentID := _rec."ParentID";
        p_MJAIAgents_DefaultCoAgentID_ExposeAsAction := _rec."ExposeAsAction";
        p_MJAIAgents_DefaultCoAgentID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIAgents_DefaultCoAgentID_ExecutionMode := _rec."ExecutionMode";
        p_MJAIAgents_DefaultCoAgentID_EnableContextCompression := _rec."EnableContextCompression";
        p_MJAIAgents_DefaultCoAgentID_ContextCompressionMessageTh_2ba4d7 := _rec."ContextCompressionMessageThreshold";
        p_MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID := _rec."ContextCompressionPromptID";
        p_MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRe_601f1d := _rec."ContextCompressionMessageRetentionCount";
        p_MJAIAgents_DefaultCoAgentID_TypeID := _rec."TypeID";
        p_MJAIAgents_DefaultCoAgentID_Status := _rec."Status";
        p_MJAIAgents_DefaultCoAgentID_DriverClass := _rec."DriverClass";
        p_MJAIAgents_DefaultCoAgentID_IconClass := _rec."IconClass";
        p_MJAIAgents_DefaultCoAgentID_ModelSelectionMode := _rec."ModelSelectionMode";
        p_MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths := _rec."PayloadDownstreamPaths";
        p_MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths := _rec."PayloadUpstreamPaths";
        p_MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths := _rec."PayloadSelfReadPaths";
        p_MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths := _rec."PayloadSelfWritePaths";
        p_MJAIAgents_DefaultCoAgentID_PayloadScope := _rec."PayloadScope";
        p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidation := _rec."FinalPayloadValidation";
        p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode := _rec."FinalPayloadValidationMode";
        p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries := _rec."FinalPayloadValidationMaxRetries";
        p_MJAIAgents_DefaultCoAgentID_MaxCostPerRun := _rec."MaxCostPerRun";
        p_MJAIAgents_DefaultCoAgentID_MaxTokensPerRun := _rec."MaxTokensPerRun";
        p_MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun := _rec."MaxIterationsPerRun";
        p_MJAIAgents_DefaultCoAgentID_MaxTimePerRun := _rec."MaxTimePerRun";
        p_MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun := _rec."MinExecutionsPerRun";
        p_MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun := _rec."MaxExecutionsPerRun";
        p_MJAIAgents_DefaultCoAgentID_StartingPayloadValidation := _rec."StartingPayloadValidation";
        p_MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode := _rec."StartingPayloadValidationMode";
        p_MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel := _rec."DefaultPromptEffortLevel";
        p_MJAIAgents_DefaultCoAgentID_ChatHandlingOption := _rec."ChatHandlingOption";
        p_MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID := _rec."DefaultArtifactTypeID";
        p_MJAIAgents_DefaultCoAgentID_OwnerUserID := _rec."OwnerUserID";
        p_MJAIAgents_DefaultCoAgentID_InvocationMode := _rec."InvocationMode";
        p_MJAIAgents_DefaultCoAgentID_ArtifactCreationMode := _rec."ArtifactCreationMode";
        p_MJAIAgents_DefaultCoAgentID_FunctionalRequirements := _rec."FunctionalRequirements";
        p_MJAIAgents_DefaultCoAgentID_TechnicalDesign := _rec."TechnicalDesign";
        p_MJAIAgents_DefaultCoAgentID_InjectNotes := _rec."InjectNotes";
        p_MJAIAgents_DefaultCoAgentID_MaxNotesToInject := _rec."MaxNotesToInject";
        p_MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy := _rec."NoteInjectionStrategy";
        p_MJAIAgents_DefaultCoAgentID_InjectExamples := _rec."InjectExamples";
        p_MJAIAgents_DefaultCoAgentID_MaxExamplesToInject := _rec."MaxExamplesToInject";
        p_MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy := _rec."ExampleInjectionStrategy";
        p_MJAIAgents_DefaultCoAgentID_IsRestricted := _rec."IsRestricted";
        p_MJAIAgents_DefaultCoAgentID_MessageMode := _rec."MessageMode";
        p_MJAIAgents_DefaultCoAgentID_MaxMessages := _rec."MaxMessages";
        p_MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID := _rec."AttachmentStorageProviderID";
        p_MJAIAgents_DefaultCoAgentID_AttachmentRootPath := _rec."AttachmentRootPath";
        p_MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes := _rec."InlineStorageThresholdBytes";
        p_MJAIAgents_DefaultCoAgentID_AgentTypePromptParams := _rec."AgentTypePromptParams";
        p_MJAIAgents_DefaultCoAgentID_ScopeConfig := _rec."ScopeConfig";
        p_MJAIAgents_DefaultCoAgentID_NoteRetentionDays := _rec."NoteRetentionDays";
        p_MJAIAgents_DefaultCoAgentID_ExampleRetentionDays := _rec."ExampleRetentionDays";
        p_MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled := _rec."AutoArchiveEnabled";
        p_MJAIAgents_DefaultCoAgentID_RerankerConfiguration := _rec."RerankerConfiguration";
        p_MJAIAgents_DefaultCoAgentID_CategoryID := _rec."CategoryID";
        p_MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools := _rec."AllowEphemeralClientTools";
        p_MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID := _rec."DefaultStorageAccountID";
        p_MJAIAgents_DefaultCoAgentID_SearchScopeAccess := _rec."SearchScopeAccess";
        p_MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles := _rec."AcceptUnregisteredFiles";
        p_MJAIAgents_DefaultCoAgentID_DefaultCoAgentID := _rec."DefaultCoAgentID";
        p_MJAIAgents_DefaultCoAgentID_TypeConfiguration := _rec."TypeConfiguration";
        p_MJAIAgents_DefaultCoAgentID_AllowMemoryWrite := _rec."AllowMemoryWrite";
        p_MJAIAgents_DefaultCoAgentID_RecordingDefault := _rec."RecordingDefault";
        p_MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID := _rec."RecordingStorageProviderID";
        p_MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID := _rec."DefaultMediaCollectionID";
        p_MJAIAgents_DefaultCoAgentID_SupportsPlanMode := _rec."SupportsPlanMode";
        p_MJAIAgents_DefaultCoAgentID_AcceptsSkills := _rec."AcceptsSkills";
        p_MJAIAgents_DefaultCoAgentID_SkillActivationMode := _rec."SkillActivationMode";
        p_MJAIAgents_DefaultCoAgentID_RequirePlanMode := _rec."RequirePlanMode";
        p_MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens := _rec."ContextWindowMaxTokens";
        p_MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent := _rec."CompactionTriggerPercent";
        p_MJAIAgents_DefaultCoAgentID_CompactionTargetPercent := _rec."CompactionTargetPercent";
        p_MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID := _rec."ConversationSummaryPromptID";
        -- Set the FK field to NULL
        p_MJAIAgents_DefaultCoAgentID_DefaultCoAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_ID => p_MJAIAgents_DefaultCoAgentIDID, p_Name => p_MJAIAgents_DefaultCoAgentID_Name, p_Description => p_MJAIAgents_DefaultCoAgentID_Description, p_LogoURL => p_MJAIAgents_DefaultCoAgentID_LogoURL, p_ParentID => p_MJAIAgents_DefaultCoAgentID_ParentID, p_ExposeAsAction => p_MJAIAgents_DefaultCoAgentID_ExposeAsAction, p_ExecutionOrder => p_MJAIAgents_DefaultCoAgentID_ExecutionOrder, p_ExecutionMode => p_MJAIAgents_DefaultCoAgentID_ExecutionMode, p_EnableContextCompression => p_MJAIAgents_DefaultCoAgentID_EnableContextCompression, p_ContextCompressionMessageThreshold => p_MJAIAgents_DefaultCoAgentID_ContextCompressionMessageTh_2ba4d7, p_ContextCompressionPromptID => p_MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, p_ContextCompressionMessageRetentionCount => p_MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRe_601f1d, p_TypeID => p_MJAIAgents_DefaultCoAgentID_TypeID, p_Status => p_MJAIAgents_DefaultCoAgentID_Status, p_DriverClass => p_MJAIAgents_DefaultCoAgentID_DriverClass, p_IconClass => p_MJAIAgents_DefaultCoAgentID_IconClass, p_ModelSelectionMode => p_MJAIAgents_DefaultCoAgentID_ModelSelectionMode, p_PayloadDownstreamPaths => p_MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, p_PayloadUpstreamPaths => p_MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, p_PayloadSelfReadPaths => p_MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, p_PayloadSelfWritePaths => p_MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, p_PayloadScope => p_MJAIAgents_DefaultCoAgentID_PayloadScope, p_FinalPayloadValidation => p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, p_FinalPayloadValidationMode => p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, p_FinalPayloadValidationMaxRetries => p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, p_MaxCostPerRun => p_MJAIAgents_DefaultCoAgentID_MaxCostPerRun, p_MaxTokensPerRun => p_MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, p_MaxIterationsPerRun => p_MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, p_MaxTimePerRun => p_MJAIAgents_DefaultCoAgentID_MaxTimePerRun, p_MinExecutionsPerRun => p_MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, p_StartingPayloadValidation => p_MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, p_StartingPayloadValidationMode => p_MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, p_DefaultPromptEffortLevel => p_MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, p_ChatHandlingOption => p_MJAIAgents_DefaultCoAgentID_ChatHandlingOption, p_DefaultArtifactTypeID => p_MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, p_OwnerUserID => p_MJAIAgents_DefaultCoAgentID_OwnerUserID, p_InvocationMode => p_MJAIAgents_DefaultCoAgentID_InvocationMode, p_ArtifactCreationMode => p_MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, p_FunctionalRequirements => p_MJAIAgents_DefaultCoAgentID_FunctionalRequirements, p_TechnicalDesign => p_MJAIAgents_DefaultCoAgentID_TechnicalDesign, p_InjectNotes => p_MJAIAgents_DefaultCoAgentID_InjectNotes, p_MaxNotesToInject => p_MJAIAgents_DefaultCoAgentID_MaxNotesToInject, p_NoteInjectionStrategy => p_MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, p_InjectExamples => p_MJAIAgents_DefaultCoAgentID_InjectExamples, p_MaxExamplesToInject => p_MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, p_ExampleInjectionStrategy => p_MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, p_IsRestricted => p_MJAIAgents_DefaultCoAgentID_IsRestricted, p_MessageMode => p_MJAIAgents_DefaultCoAgentID_MessageMode, p_MaxMessages => p_MJAIAgents_DefaultCoAgentID_MaxMessages, p_AttachmentStorageProviderID => p_MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, p_AttachmentRootPath => p_MJAIAgents_DefaultCoAgentID_AttachmentRootPath, p_InlineStorageThresholdBytes => p_MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, p_AgentTypePromptParams => p_MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, p_ScopeConfig => p_MJAIAgents_DefaultCoAgentID_ScopeConfig, p_NoteRetentionDays => p_MJAIAgents_DefaultCoAgentID_NoteRetentionDays, p_ExampleRetentionDays => p_MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, p_AutoArchiveEnabled => p_MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, p_RerankerConfiguration => p_MJAIAgents_DefaultCoAgentID_RerankerConfiguration, p_CategoryID => p_MJAIAgents_DefaultCoAgentID_CategoryID, p_AllowEphemeralClientTools => p_MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, p_DefaultStorageAccountID => p_MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, p_SearchScopeAccess => p_MJAIAgents_DefaultCoAgentID_SearchScopeAccess, p_AcceptUnregisteredFiles => p_MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, p_DefaultCoAgentID_Clear => 1, p_DefaultCoAgentID => p_MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, p_TypeConfiguration => p_MJAIAgents_DefaultCoAgentID_TypeConfiguration, p_AllowMemoryWrite => p_MJAIAgents_DefaultCoAgentID_AllowMemoryWrite, p_RecordingDefault => p_MJAIAgents_DefaultCoAgentID_RecordingDefault, p_RecordingStorageProviderID => p_MJAIAgents_DefaultCoAgentID_RecordingStorageProviderID, p_DefaultMediaCollectionID => p_MJAIAgents_DefaultCoAgentID_DefaultMediaCollectionID, p_SupportsPlanMode => p_MJAIAgents_DefaultCoAgentID_SupportsPlanMode, p_AcceptsSkills => p_MJAIAgents_DefaultCoAgentID_AcceptsSkills, p_SkillActivationMode => p_MJAIAgents_DefaultCoAgentID_SkillActivationMode, p_RequirePlanMode => p_MJAIAgents_DefaultCoAgentID_RequirePlanMode, p_ContextWindowMaxTokens => p_MJAIAgents_DefaultCoAgentID_ContextWindowMaxTokens, p_CompactionTriggerPercent => p_MJAIAgents_DefaultCoAgentID_CompactionTriggerPercent, p_CompactionTargetPercent => p_MJAIAgents_DefaultCoAgentID_CompactionTargetPercent, p_ConversationSummaryPromptID => p_MJAIAgents_DefaultCoAgentID_ConversationSummaryPromptID);

    END LOOP;

    
    -- Cascade delete from AIBridgeAgentIdentity using cursor to call spDeleteAIBridgeAgentIdentity

    FOR _rec IN SELECT "ID" FROM __mj."AIBridgeAgentIdentity" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIBridgeAgentIdentities_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIBridgeAgentIdentity"(p_ID => p_MJAIBridgeAgentIdentities_AgentIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite", "TokensCacheReadRollup", "TokensCacheWriteRollup" FROM __mj."AIPromptRun" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIPromptRuns_AgentIDID := _rec."ID";
        p_MJAIPromptRuns_AgentID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_AgentID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_AgentID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_AgentID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_AgentID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_AgentID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_AgentID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_AgentID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_AgentID_Messages := _rec."Messages";
        p_MJAIPromptRuns_AgentID_Result := _rec."Result";
        p_MJAIPromptRuns_AgentID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_AgentID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_AgentID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_AgentID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_AgentID_Success := _rec."Success";
        p_MJAIPromptRuns_AgentID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_AgentID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_AgentID_RunType := _rec."RunType";
        p_MJAIPromptRuns_AgentID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_AgentID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_AgentID_Cost := _rec."Cost";
        p_MJAIPromptRuns_AgentID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_AgentID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_AgentID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_AgentID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_AgentID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_AgentID_TopP := _rec."TopP";
        p_MJAIPromptRuns_AgentID_TopK := _rec."TopK";
        p_MJAIPromptRuns_AgentID_MinP := _rec."MinP";
        p_MJAIPromptRuns_AgentID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_AgentID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_AgentID_Seed := _rec."Seed";
        p_MJAIPromptRuns_AgentID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_AgentID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_AgentID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_AgentID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_AgentID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_AgentID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_AgentID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_AgentID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_AgentID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_AgentID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_AgentID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_AgentID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_AgentID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_AgentID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_AgentID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_AgentID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_AgentID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_AgentID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_AgentID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_AgentID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_AgentID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_AgentID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_AgentID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_AgentID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_AgentID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_AgentID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_AgentID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_AgentID_Status := _rec."Status";
        p_MJAIPromptRuns_AgentID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_AgentID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_AgentID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_AgentID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_AgentID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_AgentID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_AgentID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_AgentID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_AgentID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_AgentID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_AgentID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_AgentID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_AgentID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_AgentID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_AgentID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_AgentID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_AgentID_ModelSpecificResponseDetails := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_AgentID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_AgentID_RunName := _rec."RunName";
        p_MJAIPromptRuns_AgentID_Comments := _rec."Comments";
        p_MJAIPromptRuns_AgentID_TestRunID := _rec."TestRunID";
        p_MJAIPromptRuns_AgentID_AssistantPrefill := _rec."AssistantPrefill";
        p_MJAIPromptRuns_AgentID_TokensCacheRead := _rec."TokensCacheRead";
        p_MJAIPromptRuns_AgentID_TokensCacheWrite := _rec."TokensCacheWrite";
        p_MJAIPromptRuns_AgentID_TokensCacheReadRollup := _rec."TokensCacheReadRollup";
        p_MJAIPromptRuns_AgentID_TokensCacheWriteRollup := _rec."TokensCacheWriteRollup";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_AgentIDID, p_PromptID => p_MJAIPromptRuns_AgentID_PromptID, p_ModelID => p_MJAIPromptRuns_AgentID_ModelID, p_VendorID => p_MJAIPromptRuns_AgentID_VendorID, p_AgentID_Clear => 1, p_AgentID => p_MJAIPromptRuns_AgentID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_AgentID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_AgentID_RunAt, p_CompletedAt => p_MJAIPromptRuns_AgentID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_AgentID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_AgentID_Messages, p_Result => p_MJAIPromptRuns_AgentID_Result, p_TokensUsed => p_MJAIPromptRuns_AgentID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_AgentID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_AgentID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_AgentID_TotalCost, p_Success => p_MJAIPromptRuns_AgentID_Success, p_ErrorMessage => p_MJAIPromptRuns_AgentID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_AgentID_ParentID, p_RunType => p_MJAIPromptRuns_AgentID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_AgentID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_AgentID_AgentRunID, p_Cost => p_MJAIPromptRuns_AgentID_Cost, p_CostCurrency => p_MJAIPromptRuns_AgentID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_AgentID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_AgentID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_AgentID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_AgentID_Temperature, p_TopP => p_MJAIPromptRuns_AgentID_TopP, p_TopK => p_MJAIPromptRuns_AgentID_TopK, p_MinP => p_MJAIPromptRuns_AgentID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_AgentID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_AgentID_PresencePenalty, p_Seed => p_MJAIPromptRuns_AgentID_Seed, p_StopSequences => p_MJAIPromptRuns_AgentID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_AgentID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_AgentID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_AgentID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_AgentID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_AgentID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_AgentID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_AgentID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_AgentID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_AgentID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_AgentID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_AgentID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_AgentID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_AgentID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_AgentID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_AgentID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_AgentID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_AgentID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_AgentID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_AgentID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_AgentID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_AgentID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_AgentID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_AgentID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_AgentID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_AgentID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_AgentID_ModelSelection, p_Status => p_MJAIPromptRuns_AgentID_Status, p_Cancelled => p_MJAIPromptRuns_AgentID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_AgentID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_AgentID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_AgentID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_AgentID_CacheHit, p_CacheKey => p_MJAIPromptRuns_AgentID_CacheKey, p_JudgeID => p_MJAIPromptRuns_AgentID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_AgentID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_AgentID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_AgentID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_AgentID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_AgentID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_AgentID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_AgentID_QueueTime, p_PromptTime => p_MJAIPromptRuns_AgentID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_AgentID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_AgentID_EffortLevel, p_RunName => p_MJAIPromptRuns_AgentID_RunName, p_Comments => p_MJAIPromptRuns_AgentID_Comments, p_TestRunID => p_MJAIPromptRuns_AgentID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_AgentID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_AgentID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_AgentID_TokensCacheWrite, p_TokensCacheReadRollup => p_MJAIPromptRuns_AgentID_TokensCacheReadRollup, p_TokensCacheWriteRollup => p_MJAIPromptRuns_AgentID_TokensCacheWriteRollup);

    END LOOP;

    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache


    FOR _rec IN SELECT "ID", "AIPromptID", "AIModelID", "RunAt", "PromptText", "ResultText", "Status", "ExpiredOn", "VendorID", "AgentID", "ConfigurationID", "PromptEmbedding", "PromptRunID" FROM __mj."AIResultCache" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIResultCache_AgentIDID := _rec."ID";
        p_MJAIResultCache_AgentID_AIPromptID := _rec."AIPromptID";
        p_MJAIResultCache_AgentID_AIModelID := _rec."AIModelID";
        p_MJAIResultCache_AgentID_RunAt := _rec."RunAt";
        p_MJAIResultCache_AgentID_PromptText := _rec."PromptText";
        p_MJAIResultCache_AgentID_ResultText := _rec."ResultText";
        p_MJAIResultCache_AgentID_Status := _rec."Status";
        p_MJAIResultCache_AgentID_ExpiredOn := _rec."ExpiredOn";
        p_MJAIResultCache_AgentID_VendorID := _rec."VendorID";
        p_MJAIResultCache_AgentID_AgentID := _rec."AgentID";
        p_MJAIResultCache_AgentID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIResultCache_AgentID_PromptEmbedding := _rec."PromptEmbedding";
        p_MJAIResultCache_AgentID_PromptRunID := _rec."PromptRunID";
        -- Set the FK field to NULL
        p_MJAIResultCache_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIResultCache"(p_ID => p_MJAIResultCache_AgentIDID, p_AIPromptID => p_MJAIResultCache_AgentID_AIPromptID, p_AIModelID => p_MJAIResultCache_AgentID_AIModelID, p_RunAt => p_MJAIResultCache_AgentID_RunAt, p_PromptText => p_MJAIResultCache_AgentID_PromptText, p_ResultText => p_MJAIResultCache_AgentID_ResultText, p_Status => p_MJAIResultCache_AgentID_Status, p_ExpiredOn => p_MJAIResultCache_AgentID_ExpiredOn, p_VendorID => p_MJAIResultCache_AgentID_VendorID, p_AgentID_Clear => 1, p_AgentID => p_MJAIResultCache_AgentID_AgentID, p_ConfigurationID => p_MJAIResultCache_AgentID_ConfigurationID, p_PromptEmbedding => p_MJAIResultCache_AgentID_PromptEmbedding, p_PromptRunID => p_MJAIResultCache_AgentID_PromptRunID);

    END LOOP;

    
    -- Cascade delete from AISkillSubAgent using cursor to call spDeleteAISkillSubAgent

    FOR _rec IN SELECT "ID" FROM __mj."AISkillSubAgent" WHERE "SubAgentID" = p_ID
    LOOP
        p_MJAISkillSubAgents_SubAgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAISkillSubAgent"(p_ID => p_MJAISkillSubAgents_SubAgentIDID);
        
    END LOOP;
    
    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged", "AgentSessionID", "TurnEndedAt", "UtteranceStartMs", "UtteranceEndMs", "MediaType", "Sequence", "SummaryPromptRunID" FROM __mj."ConversationDetail" WHERE "AgentID" = p_ID
    LOOP
        p_MJConversationDetails_AgentIDID := _rec."ID";
        p_MJConversationDetails_AgentID_ConversationID := _rec."ConversationID";
        p_MJConversationDetails_AgentID_ExternalID := _rec."ExternalID";
        p_MJConversationDetails_AgentID_Role := _rec."Role";
        p_MJConversationDetails_AgentID_Message := _rec."Message";
        p_MJConversationDetails_AgentID_Error := _rec."Error";
        p_MJConversationDetails_AgentID_HiddenToUser := _rec."HiddenToUser";
        p_MJConversationDetails_AgentID_UserRating := _rec."UserRating";
        p_MJConversationDetails_AgentID_UserFeedback := _rec."UserFeedback";
        p_MJConversationDetails_AgentID_ReflectionInsights := _rec."ReflectionInsights";
        p_MJConversationDetails_AgentID_SummaryOfEarlierConversation := _rec."SummaryOfEarlierConversation";
        p_MJConversationDetails_AgentID_UserID := _rec."UserID";
        p_MJConversationDetails_AgentID_ArtifactID := _rec."ArtifactID";
        p_MJConversationDetails_AgentID_ArtifactVersionID := _rec."ArtifactVersionID";
        p_MJConversationDetails_AgentID_CompletionTime := _rec."CompletionTime";
        p_MJConversationDetails_AgentID_IsPinned := _rec."IsPinned";
        p_MJConversationDetails_AgentID_ParentID := _rec."ParentID";
        p_MJConversationDetails_AgentID_AgentID := _rec."AgentID";
        p_MJConversationDetails_AgentID_Status := _rec."Status";
        p_MJConversationDetails_AgentID_SuggestedResponses := _rec."SuggestedResponses";
        p_MJConversationDetails_AgentID_TestRunID := _rec."TestRunID";
        p_MJConversationDetails_AgentID_ResponseForm := _rec."ResponseForm";
        p_MJConversationDetails_AgentID_ActionableCommands := _rec."ActionableCommands";
        p_MJConversationDetails_AgentID_AutomaticCommands := _rec."AutomaticCommands";
        p_MJConversationDetails_AgentID_OriginalMessageChanged := _rec."OriginalMessageChanged";
        p_MJConversationDetails_AgentID_AgentSessionID := _rec."AgentSessionID";
        p_MJConversationDetails_AgentID_TurnEndedAt := _rec."TurnEndedAt";
        p_MJConversationDetails_AgentID_UtteranceStartMs := _rec."UtteranceStartMs";
        p_MJConversationDetails_AgentID_UtteranceEndMs := _rec."UtteranceEndMs";
        p_MJConversationDetails_AgentID_MediaType := _rec."MediaType";
        p_MJConversationDetails_AgentID_Sequence := _rec."Sequence";
        p_MJConversationDetails_AgentID_SummaryPromptRunID := _rec."SummaryPromptRunID";
        -- Set the FK field to NULL
        p_MJConversationDetails_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_AgentIDID, p_ConversationID => p_MJConversationDetails_AgentID_ConversationID, p_ExternalID => p_MJConversationDetails_AgentID_ExternalID, p_Role => p_MJConversationDetails_AgentID_Role, p_Message => p_MJConversationDetails_AgentID_Message, p_Error => p_MJConversationDetails_AgentID_Error, p_HiddenToUser => p_MJConversationDetails_AgentID_HiddenToUser, p_UserRating => p_MJConversationDetails_AgentID_UserRating, p_UserFeedback => p_MJConversationDetails_AgentID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_AgentID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_AgentID_SummaryOfEarlierConversation, p_UserID => p_MJConversationDetails_AgentID_UserID, p_ArtifactID => p_MJConversationDetails_AgentID_ArtifactID, p_ArtifactVersionID => p_MJConversationDetails_AgentID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_AgentID_CompletionTime, p_IsPinned => p_MJConversationDetails_AgentID_IsPinned, p_ParentID => p_MJConversationDetails_AgentID_ParentID, p_AgentID_Clear => 1, p_AgentID => p_MJConversationDetails_AgentID_AgentID, p_Status => p_MJConversationDetails_AgentID_Status, p_SuggestedResponses => p_MJConversationDetails_AgentID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_AgentID_TestRunID, p_ResponseForm => p_MJConversationDetails_AgentID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_AgentID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_AgentID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_AgentID_OriginalMessageChanged, p_AgentSessionID => p_MJConversationDetails_AgentID_AgentSessionID, p_TurnEndedAt => p_MJConversationDetails_AgentID_TurnEndedAt, p_UtteranceStartMs => p_MJConversationDetails_AgentID_UtteranceStartMs, p_UtteranceEndMs => p_MJConversationDetails_AgentID_UtteranceEndMs, p_MediaType => p_MJConversationDetails_AgentID_MediaType, p_Sequence => p_MJConversationDetails_AgentID_Sequence, p_SummaryPromptRunID => p_MJConversationDetails_AgentID_SummaryPromptRunID);

    END LOOP;

    
    -- Cascade delete from ConversationWidgetInstance using cursor to call spDeleteConversationWidgetInstance

    FOR _rec IN SELECT "ID" FROM __mj."ConversationWidgetInstance" WHERE "PinnedAgentID" = p_ID
    LOOP
        p_MJConversationWidgetInstances_PinnedAgentIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationWidgetInstance"(p_ID => p_MJConversationWidgetInstances_PinnedAgentIDID);
        
    END LOOP;
    
    
    -- Cascade update on Conversation using cursor to call spUpdateConversation


    FOR _rec IN SELECT "ID", "UserID", "ExternalID", "Name", "Description", "Type", "IsArchived", "LinkedEntityID", "LinkedRecordID", "DataContextID", "Status", "EnvironmentID", "ProjectID", "IsPinned", "TestRunID", "ApplicationScope", "ApplicationID", "DefaultAgentID", "AdditionalData", "RecordingFileID", "EgressID", "VisitorKey", "LastConversationID" FROM __mj."Conversation" WHERE "DefaultAgentID" = p_ID
    LOOP
        p_MJConversations_DefaultAgentIDID := _rec."ID";
        p_MJConversations_DefaultAgentID_UserID := _rec."UserID";
        p_MJConversations_DefaultAgentID_ExternalID := _rec."ExternalID";
        p_MJConversations_DefaultAgentID_Name := _rec."Name";
        p_MJConversations_DefaultAgentID_Description := _rec."Description";
        p_MJConversations_DefaultAgentID_Type := _rec."Type";
        p_MJConversations_DefaultAgentID_IsArchived := _rec."IsArchived";
        p_MJConversations_DefaultAgentID_LinkedEntityID := _rec."LinkedEntityID";
        p_MJConversations_DefaultAgentID_LinkedRecordID := _rec."LinkedRecordID";
        p_MJConversations_DefaultAgentID_DataContextID := _rec."DataContextID";
        p_MJConversations_DefaultAgentID_Status := _rec."Status";
        p_MJConversations_DefaultAgentID_EnvironmentID := _rec."EnvironmentID";
        p_MJConversations_DefaultAgentID_ProjectID := _rec."ProjectID";
        p_MJConversations_DefaultAgentID_IsPinned := _rec."IsPinned";
        p_MJConversations_DefaultAgentID_TestRunID := _rec."TestRunID";
        p_MJConversations_DefaultAgentID_ApplicationScope := _rec."ApplicationScope";
        p_MJConversations_DefaultAgentID_ApplicationID := _rec."ApplicationID";
        p_MJConversations_DefaultAgentID_DefaultAgentID := _rec."DefaultAgentID";
        p_MJConversations_DefaultAgentID_AdditionalData := _rec."AdditionalData";
        p_MJConversations_DefaultAgentID_RecordingFileID := _rec."RecordingFileID";
        p_MJConversations_DefaultAgentID_EgressID := _rec."EgressID";
        p_MJConversations_DefaultAgentID_VisitorKey := _rec."VisitorKey";
        p_MJConversations_DefaultAgentID_LastConversationID := _rec."LastConversationID";
        -- Set the FK field to NULL
        p_MJConversations_DefaultAgentID_DefaultAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversation"(p_ID => p_MJConversations_DefaultAgentIDID, p_UserID => p_MJConversations_DefaultAgentID_UserID, p_ExternalID => p_MJConversations_DefaultAgentID_ExternalID, p_Name => p_MJConversations_DefaultAgentID_Name, p_Description => p_MJConversations_DefaultAgentID_Description, p_Type => p_MJConversations_DefaultAgentID_Type, p_IsArchived => p_MJConversations_DefaultAgentID_IsArchived, p_LinkedEntityID => p_MJConversations_DefaultAgentID_LinkedEntityID, p_LinkedRecordID => p_MJConversations_DefaultAgentID_LinkedRecordID, p_DataContextID => p_MJConversations_DefaultAgentID_DataContextID, p_Status => p_MJConversations_DefaultAgentID_Status, p_EnvironmentID => p_MJConversations_DefaultAgentID_EnvironmentID, p_ProjectID => p_MJConversations_DefaultAgentID_ProjectID, p_IsPinned => p_MJConversations_DefaultAgentID_IsPinned, p_TestRunID => p_MJConversations_DefaultAgentID_TestRunID, p_ApplicationScope => p_MJConversations_DefaultAgentID_ApplicationScope, p_ApplicationID => p_MJConversations_DefaultAgentID_ApplicationID, p_DefaultAgentID_Clear => 1, p_DefaultAgentID => p_MJConversations_DefaultAgentID_DefaultAgentID, p_AdditionalData => p_MJConversations_DefaultAgentID_AdditionalData, p_RecordingFileID => p_MJConversations_DefaultAgentID_RecordingFileID, p_EgressID => p_MJConversations_DefaultAgentID_EgressID, p_VisitorKey => p_MJConversations_DefaultAgentID_VisitorKey, p_LastConversationID => p_MJConversations_DefaultAgentID_LastConversationID);

    END LOOP;

    
    -- Cascade update on EntityDocument using cursor to call spUpdateEntityDocument


    FOR _rec IN SELECT "ID", "Name", "TypeID", "EntityID", "VectorDatabaseID", "Status", "TemplateID", "AIModelID", "PotentialMatchThreshold", "AbsoluteMatchThreshold", "VectorIndexID", "Configuration", "EnableLLMReasoning", "ReasoningMode", "ReasoningThreshold", "ReasoningPromptID", "ReasoningAgentID", "AutomationLevel" FROM __mj."EntityDocument" WHERE "ReasoningAgentID" = p_ID
    LOOP
        p_MJEntityDocuments_ReasoningAgentIDID := _rec."ID";
        p_MJEntityDocuments_ReasoningAgentID_Name := _rec."Name";
        p_MJEntityDocuments_ReasoningAgentID_TypeID := _rec."TypeID";
        p_MJEntityDocuments_ReasoningAgentID_EntityID := _rec."EntityID";
        p_MJEntityDocuments_ReasoningAgentID_VectorDatabaseID := _rec."VectorDatabaseID";
        p_MJEntityDocuments_ReasoningAgentID_Status := _rec."Status";
        p_MJEntityDocuments_ReasoningAgentID_TemplateID := _rec."TemplateID";
        p_MJEntityDocuments_ReasoningAgentID_AIModelID := _rec."AIModelID";
        p_MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold := _rec."PotentialMatchThreshold";
        p_MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold := _rec."AbsoluteMatchThreshold";
        p_MJEntityDocuments_ReasoningAgentID_VectorIndexID := _rec."VectorIndexID";
        p_MJEntityDocuments_ReasoningAgentID_Configuration := _rec."Configuration";
        p_MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning := _rec."EnableLLMReasoning";
        p_MJEntityDocuments_ReasoningAgentID_ReasoningMode := _rec."ReasoningMode";
        p_MJEntityDocuments_ReasoningAgentID_ReasoningThreshold := _rec."ReasoningThreshold";
        p_MJEntityDocuments_ReasoningAgentID_ReasoningPromptID := _rec."ReasoningPromptID";
        p_MJEntityDocuments_ReasoningAgentID_ReasoningAgentID := _rec."ReasoningAgentID";
        p_MJEntityDocuments_ReasoningAgentID_AutomationLevel := _rec."AutomationLevel";
        -- Set the FK field to NULL
        p_MJEntityDocuments_ReasoningAgentID_ReasoningAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateEntityDocument"(p_ID => p_MJEntityDocuments_ReasoningAgentIDID, p_Name => p_MJEntityDocuments_ReasoningAgentID_Name, p_TypeID => p_MJEntityDocuments_ReasoningAgentID_TypeID, p_EntityID => p_MJEntityDocuments_ReasoningAgentID_EntityID, p_VectorDatabaseID => p_MJEntityDocuments_ReasoningAgentID_VectorDatabaseID, p_Status => p_MJEntityDocuments_ReasoningAgentID_Status, p_TemplateID => p_MJEntityDocuments_ReasoningAgentID_TemplateID, p_AIModelID => p_MJEntityDocuments_ReasoningAgentID_AIModelID, p_PotentialMatchThreshold => p_MJEntityDocuments_ReasoningAgentID_PotentialMatchThreshold, p_AbsoluteMatchThreshold => p_MJEntityDocuments_ReasoningAgentID_AbsoluteMatchThreshold, p_VectorIndexID => p_MJEntityDocuments_ReasoningAgentID_VectorIndexID, p_Configuration => p_MJEntityDocuments_ReasoningAgentID_Configuration, p_EnableLLMReasoning => p_MJEntityDocuments_ReasoningAgentID_EnableLLMReasoning, p_ReasoningMode => p_MJEntityDocuments_ReasoningAgentID_ReasoningMode, p_ReasoningThreshold => p_MJEntityDocuments_ReasoningAgentID_ReasoningThreshold, p_ReasoningPromptID => p_MJEntityDocuments_ReasoningAgentID_ReasoningPromptID, p_ReasoningAgentID_Clear => 1, p_ReasoningAgentID => p_MJEntityDocuments_ReasoningAgentID_ReasoningAgentID, p_AutomationLevel => p_MJEntityDocuments_ReasoningAgentID_AutomationLevel);

    END LOOP;

    
    -- Cascade update on RecordProcess using cursor to call spUpdateRecordProcess


    FOR _rec IN SELECT "ID", "Name", "Description", "CategoryID", "EntityID", "Status", "WorkType", "ActionID", "AgentID", "PromptID", "ScopeType", "ScopeViewID", "ScopeListID", "ScopeFilter", "OnChangeEnabled", "OnChangeInvocationType", "OnChangeFilter", "ScheduleEnabled", "CronExpression", "Timezone", "OnDemandEnabled", "InputMapping", "OutputMapping", "SkipUnchanged", "WatermarkStrategy", "BatchSize", "MaxConcurrency", "Configuration" FROM __mj."RecordProcess" WHERE "AgentID" = p_ID
    LOOP
        p_MJRecordProcesses_AgentIDID := _rec."ID";
        p_MJRecordProcesses_AgentID_Name := _rec."Name";
        p_MJRecordProcesses_AgentID_Description := _rec."Description";
        p_MJRecordProcesses_AgentID_CategoryID := _rec."CategoryID";
        p_MJRecordProcesses_AgentID_EntityID := _rec."EntityID";
        p_MJRecordProcesses_AgentID_Status := _rec."Status";
        p_MJRecordProcesses_AgentID_WorkType := _rec."WorkType";
        p_MJRecordProcesses_AgentID_ActionID := _rec."ActionID";
        p_MJRecordProcesses_AgentID_AgentID := _rec."AgentID";
        p_MJRecordProcesses_AgentID_PromptID := _rec."PromptID";
        p_MJRecordProcesses_AgentID_ScopeType := _rec."ScopeType";
        p_MJRecordProcesses_AgentID_ScopeViewID := _rec."ScopeViewID";
        p_MJRecordProcesses_AgentID_ScopeListID := _rec."ScopeListID";
        p_MJRecordProcesses_AgentID_ScopeFilter := _rec."ScopeFilter";
        p_MJRecordProcesses_AgentID_OnChangeEnabled := _rec."OnChangeEnabled";
        p_MJRecordProcesses_AgentID_OnChangeInvocationType := _rec."OnChangeInvocationType";
        p_MJRecordProcesses_AgentID_OnChangeFilter := _rec."OnChangeFilter";
        p_MJRecordProcesses_AgentID_ScheduleEnabled := _rec."ScheduleEnabled";
        p_MJRecordProcesses_AgentID_CronExpression := _rec."CronExpression";
        p_MJRecordProcesses_AgentID_Timezone := _rec."Timezone";
        p_MJRecordProcesses_AgentID_OnDemandEnabled := _rec."OnDemandEnabled";
        p_MJRecordProcesses_AgentID_InputMapping := _rec."InputMapping";
        p_MJRecordProcesses_AgentID_OutputMapping := _rec."OutputMapping";
        p_MJRecordProcesses_AgentID_SkipUnchanged := _rec."SkipUnchanged";
        p_MJRecordProcesses_AgentID_WatermarkStrategy := _rec."WatermarkStrategy";
        p_MJRecordProcesses_AgentID_BatchSize := _rec."BatchSize";
        p_MJRecordProcesses_AgentID_MaxConcurrency := _rec."MaxConcurrency";
        p_MJRecordProcesses_AgentID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJRecordProcesses_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateRecordProcess"(p_ID => p_MJRecordProcesses_AgentIDID, p_Name => p_MJRecordProcesses_AgentID_Name, p_Description => p_MJRecordProcesses_AgentID_Description, p_CategoryID => p_MJRecordProcesses_AgentID_CategoryID, p_EntityID => p_MJRecordProcesses_AgentID_EntityID, p_Status => p_MJRecordProcesses_AgentID_Status, p_WorkType => p_MJRecordProcesses_AgentID_WorkType, p_ActionID => p_MJRecordProcesses_AgentID_ActionID, p_AgentID_Clear => 1, p_AgentID => p_MJRecordProcesses_AgentID_AgentID, p_PromptID => p_MJRecordProcesses_AgentID_PromptID, p_ScopeType => p_MJRecordProcesses_AgentID_ScopeType, p_ScopeViewID => p_MJRecordProcesses_AgentID_ScopeViewID, p_ScopeListID => p_MJRecordProcesses_AgentID_ScopeListID, p_ScopeFilter => p_MJRecordProcesses_AgentID_ScopeFilter, p_OnChangeEnabled => p_MJRecordProcesses_AgentID_OnChangeEnabled, p_OnChangeInvocationType => p_MJRecordProcesses_AgentID_OnChangeInvocationType, p_OnChangeFilter => p_MJRecordProcesses_AgentID_OnChangeFilter, p_ScheduleEnabled => p_MJRecordProcesses_AgentID_ScheduleEnabled, p_CronExpression => p_MJRecordProcesses_AgentID_CronExpression, p_Timezone => p_MJRecordProcesses_AgentID_Timezone, p_OnDemandEnabled => p_MJRecordProcesses_AgentID_OnDemandEnabled, p_InputMapping => p_MJRecordProcesses_AgentID_InputMapping, p_OutputMapping => p_MJRecordProcesses_AgentID_OutputMapping, p_SkipUnchanged => p_MJRecordProcesses_AgentID_SkipUnchanged, p_WatermarkStrategy => p_MJRecordProcesses_AgentID_WatermarkStrategy, p_BatchSize => p_MJRecordProcesses_AgentID_BatchSize, p_MaxConcurrency => p_MJRecordProcesses_AgentID_MaxConcurrency, p_Configuration => p_MJRecordProcesses_AgentID_Configuration);

    END LOOP;

    
    -- Cascade update on SearchExecutionLog using cursor to call spUpdateSearchExecutionLog


    FOR _rec IN SELECT "ID", "SearchScopeID", "UserID", "AIAgentID", "Query", "TotalDurationMs", "ResultCount", "RerankerName", "RerankerCostCents", "Status", "FailureReason", "ProvidersJSON" FROM __mj."SearchExecutionLog" WHERE "AIAgentID" = p_ID
    LOOP
        p_MJSearchExecutionLogs_AIAgentIDID := _rec."ID";
        p_MJSearchExecutionLogs_AIAgentID_SearchScopeID := _rec."SearchScopeID";
        p_MJSearchExecutionLogs_AIAgentID_UserID := _rec."UserID";
        p_MJSearchExecutionLogs_AIAgentID_AIAgentID := _rec."AIAgentID";
        p_MJSearchExecutionLogs_AIAgentID_Query := _rec."Query";
        p_MJSearchExecutionLogs_AIAgentID_TotalDurationMs := _rec."TotalDurationMs";
        p_MJSearchExecutionLogs_AIAgentID_ResultCount := _rec."ResultCount";
        p_MJSearchExecutionLogs_AIAgentID_RerankerName := _rec."RerankerName";
        p_MJSearchExecutionLogs_AIAgentID_RerankerCostCents := _rec."RerankerCostCents";
        p_MJSearchExecutionLogs_AIAgentID_Status := _rec."Status";
        p_MJSearchExecutionLogs_AIAgentID_FailureReason := _rec."FailureReason";
        p_MJSearchExecutionLogs_AIAgentID_ProvidersJSON := _rec."ProvidersJSON";
        -- Set the FK field to NULL
        p_MJSearchExecutionLogs_AIAgentID_AIAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateSearchExecutionLog"(p_ID => p_MJSearchExecutionLogs_AIAgentIDID, p_SearchScopeID => p_MJSearchExecutionLogs_AIAgentID_SearchScopeID, p_UserID => p_MJSearchExecutionLogs_AIAgentID_UserID, p_AIAgentID_Clear => 1, p_AIAgentID => p_MJSearchExecutionLogs_AIAgentID_AIAgentID, p_Query => p_MJSearchExecutionLogs_AIAgentID_Query, p_TotalDurationMs => p_MJSearchExecutionLogs_AIAgentID_TotalDurationMs, p_ResultCount => p_MJSearchExecutionLogs_AIAgentID_ResultCount, p_RerankerName => p_MJSearchExecutionLogs_AIAgentID_RerankerName, p_RerankerCostCents => p_MJSearchExecutionLogs_AIAgentID_RerankerCostCents, p_Status => p_MJSearchExecutionLogs_AIAgentID_Status, p_FailureReason => p_MJSearchExecutionLogs_AIAgentID_FailureReason, p_ProvidersJSON => p_MJSearchExecutionLogs_AIAgentID_ProvidersJSON);

    END LOOP;

    
    -- Cascade update on Task using cursor to call spUpdateTask


    FOR _rec IN SELECT "ID", "ParentID", "Name", "Description", "TypeID", "EnvironmentID", "ProjectID", "ConversationDetailID", "UserID", "AgentID", "Status", "PercentComplete", "DueAt", "StartedAt", "CompletedAt" FROM __mj."Task" WHERE "AgentID" = p_ID
    LOOP
        p_MJTasks_AgentIDID := _rec."ID";
        p_MJTasks_AgentID_ParentID := _rec."ParentID";
        p_MJTasks_AgentID_Name := _rec."Name";
        p_MJTasks_AgentID_Description := _rec."Description";
        p_MJTasks_AgentID_TypeID := _rec."TypeID";
        p_MJTasks_AgentID_EnvironmentID := _rec."EnvironmentID";
        p_MJTasks_AgentID_ProjectID := _rec."ProjectID";
        p_MJTasks_AgentID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJTasks_AgentID_UserID := _rec."UserID";
        p_MJTasks_AgentID_AgentID := _rec."AgentID";
        p_MJTasks_AgentID_Status := _rec."Status";
        p_MJTasks_AgentID_PercentComplete := _rec."PercentComplete";
        p_MJTasks_AgentID_DueAt := _rec."DueAt";
        p_MJTasks_AgentID_StartedAt := _rec."StartedAt";
        p_MJTasks_AgentID_CompletedAt := _rec."CompletedAt";
        -- Set the FK field to NULL
        p_MJTasks_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateTask"(p_ID => p_MJTasks_AgentIDID, p_ParentID => p_MJTasks_AgentID_ParentID, p_Name => p_MJTasks_AgentID_Name, p_Description => p_MJTasks_AgentID_Description, p_TypeID => p_MJTasks_AgentID_TypeID, p_EnvironmentID => p_MJTasks_AgentID_EnvironmentID, p_ProjectID => p_MJTasks_AgentID_ProjectID, p_ConversationDetailID => p_MJTasks_AgentID_ConversationDetailID, p_UserID => p_MJTasks_AgentID_UserID, p_AgentID_Clear => 1, p_AgentID => p_MJTasks_AgentID_AgentID, p_Status => p_MJTasks_AgentID_Status, p_PercentComplete => p_MJTasks_AgentID_PercentComplete, p_DueAt => p_MJTasks_AgentID_DueAt, p_StartedAt => p_MJTasks_AgentID_StartedAt, p_CompletedAt => p_MJTasks_AgentID_CompletedAt);

    END LOOP;

    

    DELETE FROM
        __mj."AIAgent"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIPrompt'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIPrompt"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJActions_DefaultCompactPromptIDID UUID;
    p_MJActions_DefaultCompactPromptID_CategoryID UUID;
    p_MJActions_DefaultCompactPromptID_Name VARCHAR(425);
    p_MJActions_DefaultCompactPromptID_Description TEXT;
    p_MJActions_DefaultCompactPromptID_Type VARCHAR(20);
    p_MJActions_DefaultCompactPromptID_UserPrompt TEXT;
    p_MJActions_DefaultCompactPromptID_UserComments TEXT;
    p_MJActions_DefaultCompactPromptID_Code TEXT;
    p_MJActions_DefaultCompactPromptID_CodeComments TEXT;
    p_MJActions_DefaultCompactPromptID_CodeApprovalStatus VARCHAR(20);
    p_MJActions_DefaultCompactPromptID_CodeApprovalComments TEXT;
    p_MJActions_DefaultCompactPromptID_CodeApprovedByUserID UUID;
    p_MJActions_DefaultCompactPromptID_CodeApprovedAt TIMESTAMPTZ;
    p_MJActions_DefaultCompactPromptID_CodeLocked BOOLEAN;
    p_MJActions_DefaultCompactPromptID_ForceCodeGeneration BOOLEAN;
    p_MJActions_DefaultCompactPromptID_RetentionPeriod INTEGER;
    p_MJActions_DefaultCompactPromptID_Status VARCHAR(20);
    p_MJActions_DefaultCompactPromptID_DriverClass VARCHAR(255);
    p_MJActions_DefaultCompactPromptID_ParentID UUID;
    p_MJActions_DefaultCompactPromptID_IconClass VARCHAR(100);
    p_MJActions_DefaultCompactPromptID_DefaultCompactPromptID UUID;
    p_MJActions_DefaultCompactPromptID_Config TEXT;
    p_MJActions_DefaultCompactPromptID_RuntimeActionConfiguration TEXT;
    p_MJActions_DefaultCompactPromptID_MaxExecutionTimeMS INTEGER;
    p_MJActions_DefaultCompactPromptID_CreatedByAgentID UUID;
    p_MJAIAgentActions_CompactPromptIDID UUID;
    p_MJAIAgentActions_CompactPromptID_AgentID UUID;
    p_MJAIAgentActions_CompactPromptID_ActionID UUID;
    p_MJAIAgentActions_CompactPromptID_Status VARCHAR(15);
    p_MJAIAgentActions_CompactPromptID_MinExecutionsPerRun INTEGER;
    p_MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun INTEGER;
    p_MJAIAgentActions_CompactPromptID_ResultExpirationTurns INTEGER;
    p_MJAIAgentActions_CompactPromptID_ResultExpirationMode VARCHAR(20);
    p_MJAIAgentActions_CompactPromptID_CompactMode VARCHAR(20);
    p_MJAIAgentActions_CompactPromptID_CompactLength INTEGER;
    p_MJAIAgentActions_CompactPromptID_CompactPromptID UUID;
    p_MJAIAgentPrompts_PromptIDID UUID;
    p_MJAIAgentSteps_PromptIDID UUID;
    p_MJAIAgentSteps_PromptID_AgentID UUID;
    p_MJAIAgentSteps_PromptID_Name VARCHAR(255);
    p_MJAIAgentSteps_PromptID_Description TEXT;
    p_MJAIAgentSteps_PromptID_StepType VARCHAR(20);
    p_MJAIAgentSteps_PromptID_StartingStep BOOLEAN;
    p_MJAIAgentSteps_PromptID_TimeoutSeconds INTEGER;
    p_MJAIAgentSteps_PromptID_RetryCount INTEGER;
    p_MJAIAgentSteps_PromptID_OnErrorBehavior VARCHAR(20);
    p_MJAIAgentSteps_PromptID_ActionID UUID;
    p_MJAIAgentSteps_PromptID_SubAgentID UUID;
    p_MJAIAgentSteps_PromptID_PromptID UUID;
    p_MJAIAgentSteps_PromptID_ActionOutputMapping TEXT;
    p_MJAIAgentSteps_PromptID_PositionX INTEGER;
    p_MJAIAgentSteps_PromptID_PositionY INTEGER;
    p_MJAIAgentSteps_PromptID_Width INTEGER;
    p_MJAIAgentSteps_PromptID_Height INTEGER;
    p_MJAIAgentSteps_PromptID_Status VARCHAR(20);
    p_MJAIAgentSteps_PromptID_ActionInputMapping TEXT;
    p_MJAIAgentSteps_PromptID_LoopBodyType VARCHAR(50);
    p_MJAIAgentSteps_PromptID_Configuration TEXT;
    p_MJAIAgentTypes_SystemPromptIDID UUID;
    p_MJAIAgentTypes_SystemPromptID_Name VARCHAR(100);
    p_MJAIAgentTypes_SystemPromptID_Description TEXT;
    p_MJAIAgentTypes_SystemPromptID_SystemPromptID UUID;
    p_MJAIAgentTypes_SystemPromptID_IsActive BOOLEAN;
    p_MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder VARCHAR(255);
    p_MJAIAgentTypes_SystemPromptID_DriverClass VARCHAR(255);
    p_MJAIAgentTypes_SystemPromptID_UIFormSectionKey VARCHAR(500);
    p_MJAIAgentTypes_SystemPromptID_UIFormKey VARCHAR(500);
    p_MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault BOOLEAN;
    p_MJAIAgentTypes_SystemPromptID_PromptParamsSchema TEXT;
    p_MJAIAgentTypes_SystemPromptID_AssignmentStrategy TEXT;
    p_MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID UUID;
    p_MJAIAgentTypes_SystemPromptID_ConfigSchema TEXT;
    p_MJAIAgentTypes_SystemPromptID_DefaultConfiguration TEXT;
    p_MJAIAgentTypes_SystemPromptID_ContextCompressionMessage_7a3347 INTEGER;
    p_MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID UUID;
    p_MJAIAgentTypes_SystemPromptID_ContextCompressionMessage_06484b INTEGER;
    p_MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens INTEGER;
    p_MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent INTEGER;
    p_MJAIAgentTypes_SystemPromptID_CompactionTargetPercent INTEGER;
    p_MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID UUID;
    p_MJAIAgentTypes_ContextCompressionPromptIDID UUID;
    p_MJAIAgentTypes_ContextCompressionPromptID_Name VARCHAR(100);
    p_MJAIAgentTypes_ContextCompressionPromptID_Description TEXT;
    p_MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID UUID;
    p_MJAIAgentTypes_ContextCompressionPromptID_IsActive BOOLEAN;
    p_MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPl_c49b8c VARCHAR(255);
    p_MJAIAgentTypes_ContextCompressionPromptID_DriverClass VARCHAR(255);
    p_MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey VARCHAR(500);
    p_MJAIAgentTypes_ContextCompressionPromptID_UIFormKey VARCHAR(500);
    p_MJAIAgentTypes_ContextCompressionPromptID_UIFormSection_5569b3 BOOLEAN;
    p_MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema TEXT;
    p_MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy TEXT;
    p_MJAIAgentTypes_ContextCompressionPromptID_DefaultStorag_c580a6 UUID;
    p_MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema TEXT;
    p_MJAIAgentTypes_ContextCompressionPromptID_DefaultConfig_945274 TEXT;
    p_MJAIAgentTypes_ContextCompressionPromptID_ContextCompre_fcb1f7 INTEGER;
    p_MJAIAgentTypes_ContextCompressionPromptID_ContextCompre_1ec96d UUID;
    p_MJAIAgentTypes_ContextCompressionPromptID_ContextCompre_cf6487 INTEGER;
    p_MJAIAgentTypes_ContextCompressionPromptID_ContextWindow_a6c9b3 INTEGER;
    p_MJAIAgentTypes_ContextCompressionPromptID_CompactionTri_aee967 INTEGER;
    p_MJAIAgentTypes_ContextCompressionPromptID_CompactionTar_886d4a INTEGER;
    p_MJAIAgentTypes_ContextCompressionPromptID_ConversationS_fa6377 UUID;
    p_MJAIAgentTypes_ConversationSummaryPromptIDID UUID;
    p_MJAIAgentTypes_ConversationSummaryPromptID_Name VARCHAR(100);
    p_MJAIAgentTypes_ConversationSummaryPromptID_Description TEXT;
    p_MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID UUID;
    p_MJAIAgentTypes_ConversationSummaryPromptID_IsActive BOOLEAN;
    p_MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptP_debf22 VARCHAR(255);
    p_MJAIAgentTypes_ConversationSummaryPromptID_DriverClass VARCHAR(255);
    p_MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey VARCHAR(500);
    p_MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey VARCHAR(500);
    p_MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectio_77c9c8 BOOLEAN;
    p_MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema TEXT;
    p_MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy TEXT;
    p_MJAIAgentTypes_ConversationSummaryPromptID_DefaultStora_efcfdc UUID;
    p_MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema TEXT;
    p_MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfi_25cc3b TEXT;
    p_MJAIAgentTypes_ConversationSummaryPromptID_ContextCompr_0e4d0a INTEGER;
    p_MJAIAgentTypes_ConversationSummaryPromptID_ContextCompr_b69702 UUID;
    p_MJAIAgentTypes_ConversationSummaryPromptID_ContextCompr_99f841 INTEGER;
    p_MJAIAgentTypes_ConversationSummaryPromptID_ContextWindo_c0ed4a INTEGER;
    p_MJAIAgentTypes_ConversationSummaryPromptID_CompactionTr_ce80ed INTEGER;
    p_MJAIAgentTypes_ConversationSummaryPromptID_CompactionTa_b2bc7f INTEGER;
    p_MJAIAgentTypes_ConversationSummaryPromptID_Conversation_5c488e UUID;
    p_MJAIAgents_ContextCompressionPromptIDID UUID;
    p_MJAIAgents_ContextCompressionPromptID_Name VARCHAR(255);
    p_MJAIAgents_ContextCompressionPromptID_Description TEXT;
    p_MJAIAgents_ContextCompressionPromptID_LogoURL VARCHAR(255);
    p_MJAIAgents_ContextCompressionPromptID_ParentID UUID;
    p_MJAIAgents_ContextCompressionPromptID_ExposeAsAction BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_ExecutionOrder INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_ExecutionMode VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_EnableContextComp_017508 BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_09124d INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d UUID;
    p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_6c27f1 INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_TypeID UUID;
    p_MJAIAgents_ContextCompressionPromptID_Status VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_DriverClass VARCHAR(255);
    p_MJAIAgents_ContextCompressionPromptID_IconClass VARCHAR(100);
    p_MJAIAgents_ContextCompressionPromptID_ModelSelectionMode VARCHAR(50);
    p_MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths TEXT;
    p_MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths TEXT;
    p_MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths TEXT;
    p_MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths TEXT;
    p_MJAIAgents_ContextCompressionPromptID_PayloadScope TEXT;
    p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation TEXT;
    p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a7a211 VARCHAR(25);
    p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a47251 INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_MaxCostPerRun NUMERIC(10,4);
    p_MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_MaxTimePerRun INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60 TEXT;
    p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_849b88 VARCHAR(25);
    p_MJAIAgents_ContextCompressionPromptID_DefaultPromptEffo_322203 INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_ChatHandlingOption VARCHAR(30);
    p_MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID UUID;
    p_MJAIAgents_ContextCompressionPromptID_OwnerUserID UUID;
    p_MJAIAgents_ContextCompressionPromptID_InvocationMode VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_FunctionalRequirements TEXT;
    p_MJAIAgents_ContextCompressionPromptID_TechnicalDesign TEXT;
    p_MJAIAgents_ContextCompressionPromptID_InjectNotes BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_MaxNotesToInject INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_InjectExamples BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_ExampleInjectionS_27b212 VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_IsRestricted BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_MessageMode VARCHAR(50);
    p_MJAIAgents_ContextCompressionPromptID_MaxMessages INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_AttachmentStorage_81bfaf UUID;
    p_MJAIAgents_ContextCompressionPromptID_AttachmentRootPath VARCHAR(500);
    p_MJAIAgents_ContextCompressionPromptID_InlineStorageThre_804eef INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams TEXT;
    p_MJAIAgents_ContextCompressionPromptID_ScopeConfig TEXT;
    p_MJAIAgents_ContextCompressionPromptID_NoteRetentionDays INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_RerankerConfiguration TEXT;
    p_MJAIAgents_ContextCompressionPromptID_CategoryID UUID;
    p_MJAIAgents_ContextCompressionPromptID_AllowEphemeralCli_be674b BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID UUID;
    p_MJAIAgents_ContextCompressionPromptID_SearchScopeAccess VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID UUID;
    p_MJAIAgents_ContextCompressionPromptID_TypeConfiguration TEXT;
    p_MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_RecordingDefault VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_RecordingStorageP_fced08 UUID;
    p_MJAIAgents_ContextCompressionPromptID_DefaultMediaColle_6f55d3 UUID;
    p_MJAIAgents_ContextCompressionPromptID_SupportsPlanMode BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_AcceptsSkills VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_SkillActivationMode VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_RequirePlanMode BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_CompactionTrigger_cebfb6 INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_ConversationSumma_e6886b UUID;
    p_MJAIAgents_ConversationSummaryPromptIDID UUID;
    p_MJAIAgents_ConversationSummaryPromptID_Name VARCHAR(255);
    p_MJAIAgents_ConversationSummaryPromptID_Description TEXT;
    p_MJAIAgents_ConversationSummaryPromptID_LogoURL VARCHAR(255);
    p_MJAIAgents_ConversationSummaryPromptID_ParentID UUID;
    p_MJAIAgents_ConversationSummaryPromptID_ExposeAsAction BOOLEAN;
    p_MJAIAgents_ConversationSummaryPromptID_ExecutionOrder INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_ExecutionMode VARCHAR(20);
    p_MJAIAgents_ConversationSummaryPromptID_EnableContextCom_dc29c4 BOOLEAN;
    p_MJAIAgents_ConversationSummaryPromptID_ContextCompressi_8df777 INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_ContextCompressi_a2bbf5 UUID;
    p_MJAIAgents_ConversationSummaryPromptID_ContextCompressi_95a21b INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_TypeID UUID;
    p_MJAIAgents_ConversationSummaryPromptID_Status VARCHAR(20);
    p_MJAIAgents_ConversationSummaryPromptID_DriverClass VARCHAR(255);
    p_MJAIAgents_ConversationSummaryPromptID_IconClass VARCHAR(100);
    p_MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode VARCHAR(50);
    p_MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths TEXT;
    p_MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths TEXT;
    p_MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths TEXT;
    p_MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths TEXT;
    p_MJAIAgents_ConversationSummaryPromptID_PayloadScope TEXT;
    p_MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation TEXT;
    p_MJAIAgents_ConversationSummaryPromptID_FinalPayloadVali_a8178a VARCHAR(25);
    p_MJAIAgents_ConversationSummaryPromptID_FinalPayloadVali_5fdb3f INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun NUMERIC(10,4);
    p_MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_StartingPayloadV_5b0d21 TEXT;
    p_MJAIAgents_ConversationSummaryPromptID_StartingPayloadV_eac511 VARCHAR(25);
    p_MJAIAgents_ConversationSummaryPromptID_DefaultPromptEff_0cd6bf INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption VARCHAR(30);
    p_MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID UUID;
    p_MJAIAgents_ConversationSummaryPromptID_OwnerUserID UUID;
    p_MJAIAgents_ConversationSummaryPromptID_InvocationMode VARCHAR(20);
    p_MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode VARCHAR(20);
    p_MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements TEXT;
    p_MJAIAgents_ConversationSummaryPromptID_TechnicalDesign TEXT;
    p_MJAIAgents_ConversationSummaryPromptID_InjectNotes BOOLEAN;
    p_MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy VARCHAR(20);
    p_MJAIAgents_ConversationSummaryPromptID_InjectExamples BOOLEAN;
    p_MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_ExampleInjection_0266ce VARCHAR(20);
    p_MJAIAgents_ConversationSummaryPromptID_IsRestricted BOOLEAN;
    p_MJAIAgents_ConversationSummaryPromptID_MessageMode VARCHAR(50);
    p_MJAIAgents_ConversationSummaryPromptID_MaxMessages INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_AttachmentStorag_8ff944 UUID;
    p_MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath VARCHAR(500);
    p_MJAIAgents_ConversationSummaryPromptID_InlineStorageThr_8e8885 INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams TEXT;
    p_MJAIAgents_ConversationSummaryPromptID_ScopeConfig TEXT;
    p_MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled BOOLEAN;
    p_MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration TEXT;
    p_MJAIAgents_ConversationSummaryPromptID_CategoryID UUID;
    p_MJAIAgents_ConversationSummaryPromptID_AllowEphemeralCl_3a4a0d BOOLEAN;
    p_MJAIAgents_ConversationSummaryPromptID_DefaultStorageAc_0fa62b UUID;
    p_MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess VARCHAR(20);
    p_MJAIAgents_ConversationSummaryPromptID_AcceptUnregister_c99ef4 BOOLEAN;
    p_MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID UUID;
    p_MJAIAgents_ConversationSummaryPromptID_TypeConfiguration TEXT;
    p_MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite BOOLEAN;
    p_MJAIAgents_ConversationSummaryPromptID_RecordingDefault VARCHAR(20);
    p_MJAIAgents_ConversationSummaryPromptID_RecordingStorage_fd6280 UUID;
    p_MJAIAgents_ConversationSummaryPromptID_DefaultMediaColl_4a0a8f UUID;
    p_MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode BOOLEAN;
    p_MJAIAgents_ConversationSummaryPromptID_AcceptsSkills VARCHAR(20);
    p_MJAIAgents_ConversationSummaryPromptID_SkillActivationMode VARCHAR(20);
    p_MJAIAgents_ConversationSummaryPromptID_RequirePlanMode BOOLEAN;
    p_MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_CompactionTrigge_a97472 INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_CompactionTarget_d292ce INTEGER;
    p_MJAIAgents_ConversationSummaryPromptID_ConversationSumm_f4c200 UUID;
    p_MJAIConfigurations_DefaultPromptForContextCompressionIDID UUID;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_Name VARCHAR(100);
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_da9038 TEXT;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_6adeb7 BOOLEAN;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_d74408 VARCHAR(20);
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_62528c UUID;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_dbdd4d UUID;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_30722a UUID;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_70e3ed VARCHAR(500);
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_0dd4a4 UUID;
    p_MJAIConfigurations_DefaultPromptForContextSummarizationIDID UUID;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_c5c467 VARCHAR(100);
    p_MJAIConfigurations_DefaultPromptForContextSummarization_6a1d29 TEXT;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_bf32c6 BOOLEAN;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_6fd740 VARCHAR(20);
    p_MJAIConfigurations_DefaultPromptForContextSummarization_ac095a UUID;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_931872 UUID;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_991e80 UUID;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_b4211c VARCHAR(500);
    p_MJAIConfigurations_DefaultPromptForContextSummarization_ce7c84 UUID;
    p_MJAIPromptModels_PromptIDID UUID;
    p_MJAIPromptRuns_PromptIDID UUID;
    p_MJAIPromptRuns_JudgeIDID UUID;
    p_MJAIPromptRuns_JudgeID_PromptID UUID;
    p_MJAIPromptRuns_JudgeID_ModelID UUID;
    p_MJAIPromptRuns_JudgeID_VendorID UUID;
    p_MJAIPromptRuns_JudgeID_AgentID UUID;
    p_MJAIPromptRuns_JudgeID_ConfigurationID UUID;
    p_MJAIPromptRuns_JudgeID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_JudgeID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_JudgeID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_JudgeID_Messages TEXT;
    p_MJAIPromptRuns_JudgeID_Result TEXT;
    p_MJAIPromptRuns_JudgeID_TokensUsed INTEGER;
    p_MJAIPromptRuns_JudgeID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_JudgeID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_JudgeID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_JudgeID_Success BOOLEAN;
    p_MJAIPromptRuns_JudgeID_ErrorMessage TEXT;
    p_MJAIPromptRuns_JudgeID_ParentID UUID;
    p_MJAIPromptRuns_JudgeID_RunType VARCHAR(20);
    p_MJAIPromptRuns_JudgeID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_JudgeID_AgentRunID UUID;
    p_MJAIPromptRuns_JudgeID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_JudgeID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_JudgeID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_JudgeID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_JudgeID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_JudgeID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_JudgeID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_JudgeID_TopK INTEGER;
    p_MJAIPromptRuns_JudgeID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_JudgeID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_JudgeID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_JudgeID_Seed INTEGER;
    p_MJAIPromptRuns_JudgeID_StopSequences TEXT;
    p_MJAIPromptRuns_JudgeID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_JudgeID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_JudgeID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_JudgeID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_JudgeID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_JudgeID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_JudgeID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_JudgeID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_JudgeID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_JudgeID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_JudgeID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_JudgeID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_JudgeID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_JudgeID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_JudgeID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_JudgeID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_JudgeID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_JudgeID_ValidationSummary TEXT;
    p_MJAIPromptRuns_JudgeID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_JudgeID_FailoverErrors TEXT;
    p_MJAIPromptRuns_JudgeID_FailoverDurations TEXT;
    p_MJAIPromptRuns_JudgeID_OriginalModelID UUID;
    p_MJAIPromptRuns_JudgeID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_JudgeID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_JudgeID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_JudgeID_ModelSelection TEXT;
    p_MJAIPromptRuns_JudgeID_Status VARCHAR(50);
    p_MJAIPromptRuns_JudgeID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_JudgeID_CancellationReason TEXT;
    p_MJAIPromptRuns_JudgeID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_JudgeID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_JudgeID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_JudgeID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_JudgeID_JudgeID UUID;
    p_MJAIPromptRuns_JudgeID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_JudgeID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_JudgeID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_JudgeID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_JudgeID_ErrorDetails TEXT;
    p_MJAIPromptRuns_JudgeID_ChildPromptID UUID;
    p_MJAIPromptRuns_JudgeID_QueueTime INTEGER;
    p_MJAIPromptRuns_JudgeID_PromptTime INTEGER;
    p_MJAIPromptRuns_JudgeID_CompletionTime INTEGER;
    p_MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails TEXT;
    p_MJAIPromptRuns_JudgeID_EffortLevel INTEGER;
    p_MJAIPromptRuns_JudgeID_RunName VARCHAR(255);
    p_MJAIPromptRuns_JudgeID_Comments TEXT;
    p_MJAIPromptRuns_JudgeID_TestRunID UUID;
    p_MJAIPromptRuns_JudgeID_AssistantPrefill TEXT;
    p_MJAIPromptRuns_JudgeID_TokensCacheRead INTEGER;
    p_MJAIPromptRuns_JudgeID_TokensCacheWrite INTEGER;
    p_MJAIPromptRuns_JudgeID_TokensCacheReadRollup INTEGER;
    p_MJAIPromptRuns_JudgeID_TokensCacheWriteRollup INTEGER;
    p_MJAIPromptRuns_ChildPromptIDID UUID;
    p_MJAIPromptRuns_ChildPromptID_PromptID UUID;
    p_MJAIPromptRuns_ChildPromptID_ModelID UUID;
    p_MJAIPromptRuns_ChildPromptID_VendorID UUID;
    p_MJAIPromptRuns_ChildPromptID_AgentID UUID;
    p_MJAIPromptRuns_ChildPromptID_ConfigurationID UUID;
    p_MJAIPromptRuns_ChildPromptID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ChildPromptID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ChildPromptID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_ChildPromptID_Messages TEXT;
    p_MJAIPromptRuns_ChildPromptID_Result TEXT;
    p_MJAIPromptRuns_ChildPromptID_TokensUsed INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_ChildPromptID_Success BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_ErrorMessage TEXT;
    p_MJAIPromptRuns_ChildPromptID_ParentID UUID;
    p_MJAIPromptRuns_ChildPromptID_RunType VARCHAR(20);
    p_MJAIPromptRuns_ChildPromptID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_ChildPromptID_AgentRunID UUID;
    p_MJAIPromptRuns_ChildPromptID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_ChildPromptID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_ChildPromptID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_ChildPromptID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_ChildPromptID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_ChildPromptID_TopK INTEGER;
    p_MJAIPromptRuns_ChildPromptID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_ChildPromptID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_ChildPromptID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_ChildPromptID_Seed INTEGER;
    p_MJAIPromptRuns_ChildPromptID_StopSequences TEXT;
    p_MJAIPromptRuns_ChildPromptID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_ChildPromptID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_ChildPromptID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_ChildPromptID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_ChildPromptID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_ChildPromptID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_ChildPromptID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_ChildPromptID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_ChildPromptID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_ChildPromptID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ChildPromptID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_ChildPromptID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_ChildPromptID_ValidationSummary TEXT;
    p_MJAIPromptRuns_ChildPromptID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_ChildPromptID_FailoverErrors TEXT;
    p_MJAIPromptRuns_ChildPromptID_FailoverDurations TEXT;
    p_MJAIPromptRuns_ChildPromptID_OriginalModelID UUID;
    p_MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_ChildPromptID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_ChildPromptID_ModelSelection TEXT;
    p_MJAIPromptRuns_ChildPromptID_Status VARCHAR(50);
    p_MJAIPromptRuns_ChildPromptID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_CancellationReason TEXT;
    p_MJAIPromptRuns_ChildPromptID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_ChildPromptID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_ChildPromptID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_ChildPromptID_JudgeID UUID;
    p_MJAIPromptRuns_ChildPromptID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_ChildPromptID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_ChildPromptID_ErrorDetails TEXT;
    p_MJAIPromptRuns_ChildPromptID_ChildPromptID UUID;
    p_MJAIPromptRuns_ChildPromptID_QueueTime INTEGER;
    p_MJAIPromptRuns_ChildPromptID_PromptTime INTEGER;
    p_MJAIPromptRuns_ChildPromptID_CompletionTime INTEGER;
    p_MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails TEXT;
    p_MJAIPromptRuns_ChildPromptID_EffortLevel INTEGER;
    p_MJAIPromptRuns_ChildPromptID_RunName VARCHAR(255);
    p_MJAIPromptRuns_ChildPromptID_Comments TEXT;
    p_MJAIPromptRuns_ChildPromptID_TestRunID UUID;
    p_MJAIPromptRuns_ChildPromptID_AssistantPrefill TEXT;
    p_MJAIPromptRuns_ChildPromptID_TokensCacheRead INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TokensCacheWrite INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup INTEGER;
    p_MJAIPrompts_ResultSelectorPromptIDID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_Name VARCHAR(255);
    p_MJAIPrompts_ResultSelectorPromptID_Description TEXT;
    p_MJAIPrompts_ResultSelectorPromptID_TemplateID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_CategoryID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_TypeID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_Status VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_ResponseFormat VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_ModelSpecificRespons_905abd TEXT;
    p_MJAIPrompts_ResultSelectorPromptID_AIModelTypeID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_MinPowerRank INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_SelectionStrategy VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_PowerPreference VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_ParallelizationMode VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_ParallelCount INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam VARCHAR(100);
    p_MJAIPrompts_ResultSelectorPromptID_OutputType VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_OutputExample TEXT;
    p_MJAIPrompts_ResultSelectorPromptID_ValidationBehavior VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_MaxRetries INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_RetryDelayMS INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_RetryStrategy VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_EnableCaching BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_CacheMatchType VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold DOUBLE PRECISION;
    p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_PromptRole VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_PromptPosition VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_Temperature NUMERIC(3,2);
    p_MJAIPrompts_ResultSelectorPromptID_TopP NUMERIC(3,2);
    p_MJAIPrompts_ResultSelectorPromptID_TopK INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_MinP NUMERIC(3,2);
    p_MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPrompts_ResultSelectorPromptID_PresencePenalty NUMERIC(3,2);
    p_MJAIPrompts_ResultSelectorPromptID_Seed INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_StopSequences VARCHAR(1000);
    p_MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_TopLogProbs INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_FailoverStrategy VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_EffortLevel INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_AssistantPrefill TEXT;
    p_MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels BOOLEAN;
    p_MJAIResultCache_AIPromptIDID UUID;
    p_MJEntityDocuments_ReasoningPromptIDID UUID;
    p_MJEntityDocuments_ReasoningPromptID_Name VARCHAR(250);
    p_MJEntityDocuments_ReasoningPromptID_TypeID UUID;
    p_MJEntityDocuments_ReasoningPromptID_EntityID UUID;
    p_MJEntityDocuments_ReasoningPromptID_VectorDatabaseID UUID;
    p_MJEntityDocuments_ReasoningPromptID_Status VARCHAR(15);
    p_MJEntityDocuments_ReasoningPromptID_TemplateID UUID;
    p_MJEntityDocuments_ReasoningPromptID_AIModelID UUID;
    p_MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold NUMERIC(12,11);
    p_MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold NUMERIC(12,11);
    p_MJEntityDocuments_ReasoningPromptID_VectorIndexID UUID;
    p_MJEntityDocuments_ReasoningPromptID_Configuration TEXT;
    p_MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning BOOLEAN;
    p_MJEntityDocuments_ReasoningPromptID_ReasoningMode VARCHAR(20);
    p_MJEntityDocuments_ReasoningPromptID_ReasoningThreshold NUMERIC(12,11);
    p_MJEntityDocuments_ReasoningPromptID_ReasoningPromptID UUID;
    p_MJEntityDocuments_ReasoningPromptID_ReasoningAgentID UUID;
    p_MJEntityDocuments_ReasoningPromptID_AutomationLevel VARCHAR(30);
    p_MJRecordProcesses_PromptIDID UUID;
    p_MJRecordProcesses_PromptID_Name VARCHAR(255);
    p_MJRecordProcesses_PromptID_Description TEXT;
    p_MJRecordProcesses_PromptID_CategoryID UUID;
    p_MJRecordProcesses_PromptID_EntityID UUID;
    p_MJRecordProcesses_PromptID_Status VARCHAR(20);
    p_MJRecordProcesses_PromptID_WorkType VARCHAR(20);
    p_MJRecordProcesses_PromptID_ActionID UUID;
    p_MJRecordProcesses_PromptID_AgentID UUID;
    p_MJRecordProcesses_PromptID_PromptID UUID;
    p_MJRecordProcesses_PromptID_ScopeType VARCHAR(20);
    p_MJRecordProcesses_PromptID_ScopeViewID UUID;
    p_MJRecordProcesses_PromptID_ScopeListID UUID;
    p_MJRecordProcesses_PromptID_ScopeFilter TEXT;
    p_MJRecordProcesses_PromptID_OnChangeEnabled BOOLEAN;
    p_MJRecordProcesses_PromptID_OnChangeInvocationType VARCHAR(30);
    p_MJRecordProcesses_PromptID_OnChangeFilter TEXT;
    p_MJRecordProcesses_PromptID_ScheduleEnabled BOOLEAN;
    p_MJRecordProcesses_PromptID_CronExpression VARCHAR(120);
    p_MJRecordProcesses_PromptID_Timezone VARCHAR(100);
    p_MJRecordProcesses_PromptID_OnDemandEnabled BOOLEAN;
    p_MJRecordProcesses_PromptID_InputMapping TEXT;
    p_MJRecordProcesses_PromptID_OutputMapping TEXT;
    p_MJRecordProcesses_PromptID_SkipUnchanged BOOLEAN;
    p_MJRecordProcesses_PromptID_WatermarkStrategy VARCHAR(20);
    p_MJRecordProcesses_PromptID_BatchSize INTEGER;
    p_MJRecordProcesses_PromptID_MaxConcurrency INTEGER;
    p_MJRecordProcesses_PromptID_Configuration TEXT;
    p_MJScopedPromptConfigs_PromptIDID UUID;
    p_MJScopedPromptParts_PromptIDID UUID;
BEGIN
-- Cascade update on Action using cursor to call spUpdateAction


    FOR _rec IN SELECT "ID", "CategoryID", "Name", "Description", "Type", "UserPrompt", "UserComments", "Code", "CodeComments", "CodeApprovalStatus", "CodeApprovalComments", "CodeApprovedByUserID", "CodeApprovedAt", "CodeLocked", "ForceCodeGeneration", "RetentionPeriod", "Status", "DriverClass", "ParentID", "IconClass", "DefaultCompactPromptID", "Config", "RuntimeActionConfiguration", "MaxExecutionTimeMS", "CreatedByAgentID" FROM __mj."Action" WHERE "DefaultCompactPromptID" = p_ID
    LOOP
        p_MJActions_DefaultCompactPromptIDID := _rec."ID";
        p_MJActions_DefaultCompactPromptID_CategoryID := _rec."CategoryID";
        p_MJActions_DefaultCompactPromptID_Name := _rec."Name";
        p_MJActions_DefaultCompactPromptID_Description := _rec."Description";
        p_MJActions_DefaultCompactPromptID_Type := _rec."Type";
        p_MJActions_DefaultCompactPromptID_UserPrompt := _rec."UserPrompt";
        p_MJActions_DefaultCompactPromptID_UserComments := _rec."UserComments";
        p_MJActions_DefaultCompactPromptID_Code := _rec."Code";
        p_MJActions_DefaultCompactPromptID_CodeComments := _rec."CodeComments";
        p_MJActions_DefaultCompactPromptID_CodeApprovalStatus := _rec."CodeApprovalStatus";
        p_MJActions_DefaultCompactPromptID_CodeApprovalComments := _rec."CodeApprovalComments";
        p_MJActions_DefaultCompactPromptID_CodeApprovedByUserID := _rec."CodeApprovedByUserID";
        p_MJActions_DefaultCompactPromptID_CodeApprovedAt := _rec."CodeApprovedAt";
        p_MJActions_DefaultCompactPromptID_CodeLocked := _rec."CodeLocked";
        p_MJActions_DefaultCompactPromptID_ForceCodeGeneration := _rec."ForceCodeGeneration";
        p_MJActions_DefaultCompactPromptID_RetentionPeriod := _rec."RetentionPeriod";
        p_MJActions_DefaultCompactPromptID_Status := _rec."Status";
        p_MJActions_DefaultCompactPromptID_DriverClass := _rec."DriverClass";
        p_MJActions_DefaultCompactPromptID_ParentID := _rec."ParentID";
        p_MJActions_DefaultCompactPromptID_IconClass := _rec."IconClass";
        p_MJActions_DefaultCompactPromptID_DefaultCompactPromptID := _rec."DefaultCompactPromptID";
        p_MJActions_DefaultCompactPromptID_Config := _rec."Config";
        p_MJActions_DefaultCompactPromptID_RuntimeActionConfiguration := _rec."RuntimeActionConfiguration";
        p_MJActions_DefaultCompactPromptID_MaxExecutionTimeMS := _rec."MaxExecutionTimeMS";
        p_MJActions_DefaultCompactPromptID_CreatedByAgentID := _rec."CreatedByAgentID";
        -- Set the FK field to NULL
        p_MJActions_DefaultCompactPromptID_DefaultCompactPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAction"(p_ID => p_MJActions_DefaultCompactPromptIDID, p_CategoryID => p_MJActions_DefaultCompactPromptID_CategoryID, p_Name => p_MJActions_DefaultCompactPromptID_Name, p_Description => p_MJActions_DefaultCompactPromptID_Description, p_Type => p_MJActions_DefaultCompactPromptID_Type, p_UserPrompt => p_MJActions_DefaultCompactPromptID_UserPrompt, p_UserComments => p_MJActions_DefaultCompactPromptID_UserComments, p_Code => p_MJActions_DefaultCompactPromptID_Code, p_CodeComments => p_MJActions_DefaultCompactPromptID_CodeComments, p_CodeApprovalStatus => p_MJActions_DefaultCompactPromptID_CodeApprovalStatus, p_CodeApprovalComments => p_MJActions_DefaultCompactPromptID_CodeApprovalComments, p_CodeApprovedByUserID => p_MJActions_DefaultCompactPromptID_CodeApprovedByUserID, p_CodeApprovedAt => p_MJActions_DefaultCompactPromptID_CodeApprovedAt, p_CodeLocked => p_MJActions_DefaultCompactPromptID_CodeLocked, p_ForceCodeGeneration => p_MJActions_DefaultCompactPromptID_ForceCodeGeneration, p_RetentionPeriod => p_MJActions_DefaultCompactPromptID_RetentionPeriod, p_Status => p_MJActions_DefaultCompactPromptID_Status, p_DriverClass => p_MJActions_DefaultCompactPromptID_DriverClass, p_ParentID => p_MJActions_DefaultCompactPromptID_ParentID, p_IconClass => p_MJActions_DefaultCompactPromptID_IconClass, p_DefaultCompactPromptID_Clear => 1, p_DefaultCompactPromptID => p_MJActions_DefaultCompactPromptID_DefaultCompactPromptID, p_Config => p_MJActions_DefaultCompactPromptID_Config, p_RuntimeActionConfiguration => p_MJActions_DefaultCompactPromptID_RuntimeActionConfiguration, p_MaxExecutionTimeMS => p_MJActions_DefaultCompactPromptID_MaxExecutionTimeMS, p_CreatedByAgentID => p_MJActions_DefaultCompactPromptID_CreatedByAgentID);

    END LOOP;

    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction


    FOR _rec IN SELECT "ID", "AgentID", "ActionID", "Status", "MinExecutionsPerRun", "MaxExecutionsPerRun", "ResultExpirationTurns", "ResultExpirationMode", "CompactMode", "CompactLength", "CompactPromptID" FROM __mj."AIAgentAction" WHERE "CompactPromptID" = p_ID
    LOOP
        p_MJAIAgentActions_CompactPromptIDID := _rec."ID";
        p_MJAIAgentActions_CompactPromptID_AgentID := _rec."AgentID";
        p_MJAIAgentActions_CompactPromptID_ActionID := _rec."ActionID";
        p_MJAIAgentActions_CompactPromptID_Status := _rec."Status";
        p_MJAIAgentActions_CompactPromptID_MinExecutionsPerRun := _rec."MinExecutionsPerRun";
        p_MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun := _rec."MaxExecutionsPerRun";
        p_MJAIAgentActions_CompactPromptID_ResultExpirationTurns := _rec."ResultExpirationTurns";
        p_MJAIAgentActions_CompactPromptID_ResultExpirationMode := _rec."ResultExpirationMode";
        p_MJAIAgentActions_CompactPromptID_CompactMode := _rec."CompactMode";
        p_MJAIAgentActions_CompactPromptID_CompactLength := _rec."CompactLength";
        p_MJAIAgentActions_CompactPromptID_CompactPromptID := _rec."CompactPromptID";
        -- Set the FK field to NULL
        p_MJAIAgentActions_CompactPromptID_CompactPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentAction"(p_ID => p_MJAIAgentActions_CompactPromptIDID, p_AgentID => p_MJAIAgentActions_CompactPromptID_AgentID, p_ActionID => p_MJAIAgentActions_CompactPromptID_ActionID, p_Status => p_MJAIAgentActions_CompactPromptID_Status, p_MinExecutionsPerRun => p_MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, p_ResultExpirationTurns => p_MJAIAgentActions_CompactPromptID_ResultExpirationTurns, p_ResultExpirationMode => p_MJAIAgentActions_CompactPromptID_ResultExpirationMode, p_CompactMode => p_MJAIAgentActions_CompactPromptID_CompactMode, p_CompactLength => p_MJAIAgentActions_CompactPromptID_CompactLength, p_CompactPromptID_Clear => 1, p_CompactPromptID => p_MJAIAgentActions_CompactPromptID_CompactPromptID);

    END LOOP;

    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentPrompt" WHERE "PromptID" = p_ID
    LOOP
        p_MJAIAgentPrompts_PromptIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentPrompt"(p_ID => p_MJAIAgentPrompts_PromptIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep


    FOR _rec IN SELECT "ID", "AgentID", "Name", "Description", "StepType", "StartingStep", "TimeoutSeconds", "RetryCount", "OnErrorBehavior", "ActionID", "SubAgentID", "PromptID", "ActionOutputMapping", "PositionX", "PositionY", "Width", "Height", "Status", "ActionInputMapping", "LoopBodyType", "Configuration" FROM __mj."AIAgentStep" WHERE "PromptID" = p_ID
    LOOP
        p_MJAIAgentSteps_PromptIDID := _rec."ID";
        p_MJAIAgentSteps_PromptID_AgentID := _rec."AgentID";
        p_MJAIAgentSteps_PromptID_Name := _rec."Name";
        p_MJAIAgentSteps_PromptID_Description := _rec."Description";
        p_MJAIAgentSteps_PromptID_StepType := _rec."StepType";
        p_MJAIAgentSteps_PromptID_StartingStep := _rec."StartingStep";
        p_MJAIAgentSteps_PromptID_TimeoutSeconds := _rec."TimeoutSeconds";
        p_MJAIAgentSteps_PromptID_RetryCount := _rec."RetryCount";
        p_MJAIAgentSteps_PromptID_OnErrorBehavior := _rec."OnErrorBehavior";
        p_MJAIAgentSteps_PromptID_ActionID := _rec."ActionID";
        p_MJAIAgentSteps_PromptID_SubAgentID := _rec."SubAgentID";
        p_MJAIAgentSteps_PromptID_PromptID := _rec."PromptID";
        p_MJAIAgentSteps_PromptID_ActionOutputMapping := _rec."ActionOutputMapping";
        p_MJAIAgentSteps_PromptID_PositionX := _rec."PositionX";
        p_MJAIAgentSteps_PromptID_PositionY := _rec."PositionY";
        p_MJAIAgentSteps_PromptID_Width := _rec."Width";
        p_MJAIAgentSteps_PromptID_Height := _rec."Height";
        p_MJAIAgentSteps_PromptID_Status := _rec."Status";
        p_MJAIAgentSteps_PromptID_ActionInputMapping := _rec."ActionInputMapping";
        p_MJAIAgentSteps_PromptID_LoopBodyType := _rec."LoopBodyType";
        p_MJAIAgentSteps_PromptID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJAIAgentSteps_PromptID_PromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentStep"(p_ID => p_MJAIAgentSteps_PromptIDID, p_AgentID => p_MJAIAgentSteps_PromptID_AgentID, p_Name => p_MJAIAgentSteps_PromptID_Name, p_Description => p_MJAIAgentSteps_PromptID_Description, p_StepType => p_MJAIAgentSteps_PromptID_StepType, p_StartingStep => p_MJAIAgentSteps_PromptID_StartingStep, p_TimeoutSeconds => p_MJAIAgentSteps_PromptID_TimeoutSeconds, p_RetryCount => p_MJAIAgentSteps_PromptID_RetryCount, p_OnErrorBehavior => p_MJAIAgentSteps_PromptID_OnErrorBehavior, p_ActionID => p_MJAIAgentSteps_PromptID_ActionID, p_SubAgentID => p_MJAIAgentSteps_PromptID_SubAgentID, p_PromptID_Clear => 1, p_PromptID => p_MJAIAgentSteps_PromptID_PromptID, p_ActionOutputMapping => p_MJAIAgentSteps_PromptID_ActionOutputMapping, p_PositionX => p_MJAIAgentSteps_PromptID_PositionX, p_PositionY => p_MJAIAgentSteps_PromptID_PositionY, p_Width => p_MJAIAgentSteps_PromptID_Width, p_Height => p_MJAIAgentSteps_PromptID_Height, p_Status => p_MJAIAgentSteps_PromptID_Status, p_ActionInputMapping => p_MJAIAgentSteps_PromptID_ActionInputMapping, p_LoopBodyType => p_MJAIAgentSteps_PromptID_LoopBodyType, p_Configuration => p_MJAIAgentSteps_PromptID_Configuration);

    END LOOP;

    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType


    FOR _rec IN SELECT "ID", "Name", "Description", "SystemPromptID", "IsActive", "AgentPromptPlaceholder", "DriverClass", "UIFormSectionKey", "UIFormKey", "UIFormSectionExpandedByDefault", "PromptParamsSchema", "AssignmentStrategy", "DefaultStorageAccountID", "ConfigSchema", "DefaultConfiguration", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "ContextWindowMaxTokens", "CompactionTriggerPercent", "CompactionTargetPercent", "ConversationSummaryPromptID" FROM __mj."AIAgentType" WHERE "SystemPromptID" = p_ID
    LOOP
        p_MJAIAgentTypes_SystemPromptIDID := _rec."ID";
        p_MJAIAgentTypes_SystemPromptID_Name := _rec."Name";
        p_MJAIAgentTypes_SystemPromptID_Description := _rec."Description";
        p_MJAIAgentTypes_SystemPromptID_SystemPromptID := _rec."SystemPromptID";
        p_MJAIAgentTypes_SystemPromptID_IsActive := _rec."IsActive";
        p_MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder := _rec."AgentPromptPlaceholder";
        p_MJAIAgentTypes_SystemPromptID_DriverClass := _rec."DriverClass";
        p_MJAIAgentTypes_SystemPromptID_UIFormSectionKey := _rec."UIFormSectionKey";
        p_MJAIAgentTypes_SystemPromptID_UIFormKey := _rec."UIFormKey";
        p_MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault := _rec."UIFormSectionExpandedByDefault";
        p_MJAIAgentTypes_SystemPromptID_PromptParamsSchema := _rec."PromptParamsSchema";
        p_MJAIAgentTypes_SystemPromptID_AssignmentStrategy := _rec."AssignmentStrategy";
        p_MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID := _rec."DefaultStorageAccountID";
        p_MJAIAgentTypes_SystemPromptID_ConfigSchema := _rec."ConfigSchema";
        p_MJAIAgentTypes_SystemPromptID_DefaultConfiguration := _rec."DefaultConfiguration";
        p_MJAIAgentTypes_SystemPromptID_ContextCompressionMessage_7a3347 := _rec."ContextCompressionMessageThreshold";
        p_MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID := _rec."ContextCompressionPromptID";
        p_MJAIAgentTypes_SystemPromptID_ContextCompressionMessage_06484b := _rec."ContextCompressionMessageRetentionCount";
        p_MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens := _rec."ContextWindowMaxTokens";
        p_MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent := _rec."CompactionTriggerPercent";
        p_MJAIAgentTypes_SystemPromptID_CompactionTargetPercent := _rec."CompactionTargetPercent";
        p_MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID := _rec."ConversationSummaryPromptID";
        -- Set the FK field to NULL
        p_MJAIAgentTypes_SystemPromptID_SystemPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentType"(p_ID => p_MJAIAgentTypes_SystemPromptIDID, p_Name => p_MJAIAgentTypes_SystemPromptID_Name, p_Description => p_MJAIAgentTypes_SystemPromptID_Description, p_SystemPromptID_Clear => 1, p_SystemPromptID => p_MJAIAgentTypes_SystemPromptID_SystemPromptID, p_IsActive => p_MJAIAgentTypes_SystemPromptID_IsActive, p_AgentPromptPlaceholder => p_MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, p_DriverClass => p_MJAIAgentTypes_SystemPromptID_DriverClass, p_UIFormSectionKey => p_MJAIAgentTypes_SystemPromptID_UIFormSectionKey, p_UIFormKey => p_MJAIAgentTypes_SystemPromptID_UIFormKey, p_UIFormSectionExpandedByDefault => p_MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, p_PromptParamsSchema => p_MJAIAgentTypes_SystemPromptID_PromptParamsSchema, p_AssignmentStrategy => p_MJAIAgentTypes_SystemPromptID_AssignmentStrategy, p_DefaultStorageAccountID => p_MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, p_ConfigSchema => p_MJAIAgentTypes_SystemPromptID_ConfigSchema, p_DefaultConfiguration => p_MJAIAgentTypes_SystemPromptID_DefaultConfiguration, p_ContextCompressionMessageThreshold => p_MJAIAgentTypes_SystemPromptID_ContextCompressionMessage_7a3347, p_ContextCompressionPromptID => p_MJAIAgentTypes_SystemPromptID_ContextCompressionPromptID, p_ContextCompressionMessageRetentionCount => p_MJAIAgentTypes_SystemPromptID_ContextCompressionMessage_06484b, p_ContextWindowMaxTokens => p_MJAIAgentTypes_SystemPromptID_ContextWindowMaxTokens, p_CompactionTriggerPercent => p_MJAIAgentTypes_SystemPromptID_CompactionTriggerPercent, p_CompactionTargetPercent => p_MJAIAgentTypes_SystemPromptID_CompactionTargetPercent, p_ConversationSummaryPromptID => p_MJAIAgentTypes_SystemPromptID_ConversationSummaryPromptID);

    END LOOP;

    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType


    FOR _rec IN SELECT "ID", "Name", "Description", "SystemPromptID", "IsActive", "AgentPromptPlaceholder", "DriverClass", "UIFormSectionKey", "UIFormKey", "UIFormSectionExpandedByDefault", "PromptParamsSchema", "AssignmentStrategy", "DefaultStorageAccountID", "ConfigSchema", "DefaultConfiguration", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "ContextWindowMaxTokens", "CompactionTriggerPercent", "CompactionTargetPercent", "ConversationSummaryPromptID" FROM __mj."AIAgentType" WHERE "ContextCompressionPromptID" = p_ID
    LOOP
        p_MJAIAgentTypes_ContextCompressionPromptIDID := _rec."ID";
        p_MJAIAgentTypes_ContextCompressionPromptID_Name := _rec."Name";
        p_MJAIAgentTypes_ContextCompressionPromptID_Description := _rec."Description";
        p_MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID := _rec."SystemPromptID";
        p_MJAIAgentTypes_ContextCompressionPromptID_IsActive := _rec."IsActive";
        p_MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPl_c49b8c := _rec."AgentPromptPlaceholder";
        p_MJAIAgentTypes_ContextCompressionPromptID_DriverClass := _rec."DriverClass";
        p_MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey := _rec."UIFormSectionKey";
        p_MJAIAgentTypes_ContextCompressionPromptID_UIFormKey := _rec."UIFormKey";
        p_MJAIAgentTypes_ContextCompressionPromptID_UIFormSection_5569b3 := _rec."UIFormSectionExpandedByDefault";
        p_MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema := _rec."PromptParamsSchema";
        p_MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy := _rec."AssignmentStrategy";
        p_MJAIAgentTypes_ContextCompressionPromptID_DefaultStorag_c580a6 := _rec."DefaultStorageAccountID";
        p_MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema := _rec."ConfigSchema";
        p_MJAIAgentTypes_ContextCompressionPromptID_DefaultConfig_945274 := _rec."DefaultConfiguration";
        p_MJAIAgentTypes_ContextCompressionPromptID_ContextCompre_fcb1f7 := _rec."ContextCompressionMessageThreshold";
        p_MJAIAgentTypes_ContextCompressionPromptID_ContextCompre_1ec96d := _rec."ContextCompressionPromptID";
        p_MJAIAgentTypes_ContextCompressionPromptID_ContextCompre_cf6487 := _rec."ContextCompressionMessageRetentionCount";
        p_MJAIAgentTypes_ContextCompressionPromptID_ContextWindow_a6c9b3 := _rec."ContextWindowMaxTokens";
        p_MJAIAgentTypes_ContextCompressionPromptID_CompactionTri_aee967 := _rec."CompactionTriggerPercent";
        p_MJAIAgentTypes_ContextCompressionPromptID_CompactionTar_886d4a := _rec."CompactionTargetPercent";
        p_MJAIAgentTypes_ContextCompressionPromptID_ConversationS_fa6377 := _rec."ConversationSummaryPromptID";
        -- Set the FK field to NULL
        p_MJAIAgentTypes_ContextCompressionPromptID_ContextCompre_1ec96d := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentType"(p_ID => p_MJAIAgentTypes_ContextCompressionPromptIDID, p_Name => p_MJAIAgentTypes_ContextCompressionPromptID_Name, p_Description => p_MJAIAgentTypes_ContextCompressionPromptID_Description, p_SystemPromptID => p_MJAIAgentTypes_ContextCompressionPromptID_SystemPromptID, p_IsActive => p_MJAIAgentTypes_ContextCompressionPromptID_IsActive, p_AgentPromptPlaceholder => p_MJAIAgentTypes_ContextCompressionPromptID_AgentPromptPl_c49b8c, p_DriverClass => p_MJAIAgentTypes_ContextCompressionPromptID_DriverClass, p_UIFormSectionKey => p_MJAIAgentTypes_ContextCompressionPromptID_UIFormSectionKey, p_UIFormKey => p_MJAIAgentTypes_ContextCompressionPromptID_UIFormKey, p_UIFormSectionExpandedByDefault => p_MJAIAgentTypes_ContextCompressionPromptID_UIFormSection_5569b3, p_PromptParamsSchema => p_MJAIAgentTypes_ContextCompressionPromptID_PromptParamsSchema, p_AssignmentStrategy => p_MJAIAgentTypes_ContextCompressionPromptID_AssignmentStrategy, p_DefaultStorageAccountID => p_MJAIAgentTypes_ContextCompressionPromptID_DefaultStorag_c580a6, p_ConfigSchema => p_MJAIAgentTypes_ContextCompressionPromptID_ConfigSchema, p_DefaultConfiguration => p_MJAIAgentTypes_ContextCompressionPromptID_DefaultConfig_945274, p_ContextCompressionMessageThreshold => p_MJAIAgentTypes_ContextCompressionPromptID_ContextCompre_fcb1f7, p_ContextCompressionPromptID_Clear => 1, p_ContextCompressionPromptID => p_MJAIAgentTypes_ContextCompressionPromptID_ContextCompre_1ec96d, p_ContextCompressionMessageRetentionCount => p_MJAIAgentTypes_ContextCompressionPromptID_ContextCompre_cf6487, p_ContextWindowMaxTokens => p_MJAIAgentTypes_ContextCompressionPromptID_ContextWindow_a6c9b3, p_CompactionTriggerPercent => p_MJAIAgentTypes_ContextCompressionPromptID_CompactionTri_aee967, p_CompactionTargetPercent => p_MJAIAgentTypes_ContextCompressionPromptID_CompactionTar_886d4a, p_ConversationSummaryPromptID => p_MJAIAgentTypes_ContextCompressionPromptID_ConversationS_fa6377);

    END LOOP;

    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType


    FOR _rec IN SELECT "ID", "Name", "Description", "SystemPromptID", "IsActive", "AgentPromptPlaceholder", "DriverClass", "UIFormSectionKey", "UIFormKey", "UIFormSectionExpandedByDefault", "PromptParamsSchema", "AssignmentStrategy", "DefaultStorageAccountID", "ConfigSchema", "DefaultConfiguration", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "ContextWindowMaxTokens", "CompactionTriggerPercent", "CompactionTargetPercent", "ConversationSummaryPromptID" FROM __mj."AIAgentType" WHERE "ConversationSummaryPromptID" = p_ID
    LOOP
        p_MJAIAgentTypes_ConversationSummaryPromptIDID := _rec."ID";
        p_MJAIAgentTypes_ConversationSummaryPromptID_Name := _rec."Name";
        p_MJAIAgentTypes_ConversationSummaryPromptID_Description := _rec."Description";
        p_MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID := _rec."SystemPromptID";
        p_MJAIAgentTypes_ConversationSummaryPromptID_IsActive := _rec."IsActive";
        p_MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptP_debf22 := _rec."AgentPromptPlaceholder";
        p_MJAIAgentTypes_ConversationSummaryPromptID_DriverClass := _rec."DriverClass";
        p_MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey := _rec."UIFormSectionKey";
        p_MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey := _rec."UIFormKey";
        p_MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectio_77c9c8 := _rec."UIFormSectionExpandedByDefault";
        p_MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema := _rec."PromptParamsSchema";
        p_MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy := _rec."AssignmentStrategy";
        p_MJAIAgentTypes_ConversationSummaryPromptID_DefaultStora_efcfdc := _rec."DefaultStorageAccountID";
        p_MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema := _rec."ConfigSchema";
        p_MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfi_25cc3b := _rec."DefaultConfiguration";
        p_MJAIAgentTypes_ConversationSummaryPromptID_ContextCompr_0e4d0a := _rec."ContextCompressionMessageThreshold";
        p_MJAIAgentTypes_ConversationSummaryPromptID_ContextCompr_b69702 := _rec."ContextCompressionPromptID";
        p_MJAIAgentTypes_ConversationSummaryPromptID_ContextCompr_99f841 := _rec."ContextCompressionMessageRetentionCount";
        p_MJAIAgentTypes_ConversationSummaryPromptID_ContextWindo_c0ed4a := _rec."ContextWindowMaxTokens";
        p_MJAIAgentTypes_ConversationSummaryPromptID_CompactionTr_ce80ed := _rec."CompactionTriggerPercent";
        p_MJAIAgentTypes_ConversationSummaryPromptID_CompactionTa_b2bc7f := _rec."CompactionTargetPercent";
        p_MJAIAgentTypes_ConversationSummaryPromptID_Conversation_5c488e := _rec."ConversationSummaryPromptID";
        -- Set the FK field to NULL
        p_MJAIAgentTypes_ConversationSummaryPromptID_Conversation_5c488e := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentType"(p_ID => p_MJAIAgentTypes_ConversationSummaryPromptIDID, p_Name => p_MJAIAgentTypes_ConversationSummaryPromptID_Name, p_Description => p_MJAIAgentTypes_ConversationSummaryPromptID_Description, p_SystemPromptID => p_MJAIAgentTypes_ConversationSummaryPromptID_SystemPromptID, p_IsActive => p_MJAIAgentTypes_ConversationSummaryPromptID_IsActive, p_AgentPromptPlaceholder => p_MJAIAgentTypes_ConversationSummaryPromptID_AgentPromptP_debf22, p_DriverClass => p_MJAIAgentTypes_ConversationSummaryPromptID_DriverClass, p_UIFormSectionKey => p_MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectionKey, p_UIFormKey => p_MJAIAgentTypes_ConversationSummaryPromptID_UIFormKey, p_UIFormSectionExpandedByDefault => p_MJAIAgentTypes_ConversationSummaryPromptID_UIFormSectio_77c9c8, p_PromptParamsSchema => p_MJAIAgentTypes_ConversationSummaryPromptID_PromptParamsSchema, p_AssignmentStrategy => p_MJAIAgentTypes_ConversationSummaryPromptID_AssignmentStrategy, p_DefaultStorageAccountID => p_MJAIAgentTypes_ConversationSummaryPromptID_DefaultStora_efcfdc, p_ConfigSchema => p_MJAIAgentTypes_ConversationSummaryPromptID_ConfigSchema, p_DefaultConfiguration => p_MJAIAgentTypes_ConversationSummaryPromptID_DefaultConfi_25cc3b, p_ContextCompressionMessageThreshold => p_MJAIAgentTypes_ConversationSummaryPromptID_ContextCompr_0e4d0a, p_ContextCompressionPromptID => p_MJAIAgentTypes_ConversationSummaryPromptID_ContextCompr_b69702, p_ContextCompressionMessageRetentionCount => p_MJAIAgentTypes_ConversationSummaryPromptID_ContextCompr_99f841, p_ContextWindowMaxTokens => p_MJAIAgentTypes_ConversationSummaryPromptID_ContextWindo_c0ed4a, p_CompactionTriggerPercent => p_MJAIAgentTypes_ConversationSummaryPromptID_CompactionTr_ce80ed, p_CompactionTargetPercent => p_MJAIAgentTypes_ConversationSummaryPromptID_CompactionTa_b2bc7f, p_ConversationSummaryPromptID_Clear => 1, p_ConversationSummaryPromptID => p_MJAIAgentTypes_ConversationSummaryPromptID_Conversation_5c488e);

    END LOOP;

    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID", "AllowEphemeralClientTools", "DefaultStorageAccountID", "SearchScopeAccess", "AcceptUnregisteredFiles", "DefaultCoAgentID", "TypeConfiguration", "AllowMemoryWrite", "RecordingDefault", "RecordingStorageProviderID", "DefaultMediaCollectionID", "SupportsPlanMode", "AcceptsSkills", "SkillActivationMode", "RequirePlanMode", "ContextWindowMaxTokens", "CompactionTriggerPercent", "CompactionTargetPercent", "ConversationSummaryPromptID" FROM __mj."AIAgent" WHERE "ContextCompressionPromptID" = p_ID
    LOOP
        p_MJAIAgents_ContextCompressionPromptIDID := _rec."ID";
        p_MJAIAgents_ContextCompressionPromptID_Name := _rec."Name";
        p_MJAIAgents_ContextCompressionPromptID_Description := _rec."Description";
        p_MJAIAgents_ContextCompressionPromptID_LogoURL := _rec."LogoURL";
        p_MJAIAgents_ContextCompressionPromptID_ParentID := _rec."ParentID";
        p_MJAIAgents_ContextCompressionPromptID_ExposeAsAction := _rec."ExposeAsAction";
        p_MJAIAgents_ContextCompressionPromptID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIAgents_ContextCompressionPromptID_ExecutionMode := _rec."ExecutionMode";
        p_MJAIAgents_ContextCompressionPromptID_EnableContextComp_017508 := _rec."EnableContextCompression";
        p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_09124d := _rec."ContextCompressionMessageThreshold";
        p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d := _rec."ContextCompressionPromptID";
        p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_6c27f1 := _rec."ContextCompressionMessageRetentionCount";
        p_MJAIAgents_ContextCompressionPromptID_TypeID := _rec."TypeID";
        p_MJAIAgents_ContextCompressionPromptID_Status := _rec."Status";
        p_MJAIAgents_ContextCompressionPromptID_DriverClass := _rec."DriverClass";
        p_MJAIAgents_ContextCompressionPromptID_IconClass := _rec."IconClass";
        p_MJAIAgents_ContextCompressionPromptID_ModelSelectionMode := _rec."ModelSelectionMode";
        p_MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths := _rec."PayloadDownstreamPaths";
        p_MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths := _rec."PayloadUpstreamPaths";
        p_MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths := _rec."PayloadSelfReadPaths";
        p_MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths := _rec."PayloadSelfWritePaths";
        p_MJAIAgents_ContextCompressionPromptID_PayloadScope := _rec."PayloadScope";
        p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation := _rec."FinalPayloadValidation";
        p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a7a211 := _rec."FinalPayloadValidationMode";
        p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a47251 := _rec."FinalPayloadValidationMaxRetries";
        p_MJAIAgents_ContextCompressionPromptID_MaxCostPerRun := _rec."MaxCostPerRun";
        p_MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun := _rec."MaxTokensPerRun";
        p_MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun := _rec."MaxIterationsPerRun";
        p_MJAIAgents_ContextCompressionPromptID_MaxTimePerRun := _rec."MaxTimePerRun";
        p_MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun := _rec."MinExecutionsPerRun";
        p_MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun := _rec."MaxExecutionsPerRun";
        p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60 := _rec."StartingPayloadValidation";
        p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60Mode := _rec."StartingPayloadValidationMode";
        p_MJAIAgents_ContextCompressionPromptID_DefaultPromptEffo_322203 := _rec."DefaultPromptEffortLevel";
        p_MJAIAgents_ContextCompressionPromptID_ChatHandlingOption := _rec."ChatHandlingOption";
        p_MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID := _rec."DefaultArtifactTypeID";
        p_MJAIAgents_ContextCompressionPromptID_OwnerUserID := _rec."OwnerUserID";
        p_MJAIAgents_ContextCompressionPromptID_InvocationMode := _rec."InvocationMode";
        p_MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode := _rec."ArtifactCreationMode";
        p_MJAIAgents_ContextCompressionPromptID_FunctionalRequirements := _rec."FunctionalRequirements";
        p_MJAIAgents_ContextCompressionPromptID_TechnicalDesign := _rec."TechnicalDesign";
        p_MJAIAgents_ContextCompressionPromptID_InjectNotes := _rec."InjectNotes";
        p_MJAIAgents_ContextCompressionPromptID_MaxNotesToInject := _rec."MaxNotesToInject";
        p_MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy := _rec."NoteInjectionStrategy";
        p_MJAIAgents_ContextCompressionPromptID_InjectExamples := _rec."InjectExamples";
        p_MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject := _rec."MaxExamplesToInject";
        p_MJAIAgents_ContextCompressionPromptID_ExampleInjectionS_27b212 := _rec."ExampleInjectionStrategy";
        p_MJAIAgents_ContextCompressionPromptID_IsRestricted := _rec."IsRestricted";
        p_MJAIAgents_ContextCompressionPromptID_MessageMode := _rec."MessageMode";
        p_MJAIAgents_ContextCompressionPromptID_MaxMessages := _rec."MaxMessages";
        p_MJAIAgents_ContextCompressionPromptID_AttachmentStorage_81bfaf := _rec."AttachmentStorageProviderID";
        p_MJAIAgents_ContextCompressionPromptID_AttachmentRootPath := _rec."AttachmentRootPath";
        p_MJAIAgents_ContextCompressionPromptID_InlineStorageThre_804eef := _rec."InlineStorageThresholdBytes";
        p_MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams := _rec."AgentTypePromptParams";
        p_MJAIAgents_ContextCompressionPromptID_ScopeConfig := _rec."ScopeConfig";
        p_MJAIAgents_ContextCompressionPromptID_NoteRetentionDays := _rec."NoteRetentionDays";
        p_MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays := _rec."ExampleRetentionDays";
        p_MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled := _rec."AutoArchiveEnabled";
        p_MJAIAgents_ContextCompressionPromptID_RerankerConfiguration := _rec."RerankerConfiguration";
        p_MJAIAgents_ContextCompressionPromptID_CategoryID := _rec."CategoryID";
        p_MJAIAgents_ContextCompressionPromptID_AllowEphemeralCli_be674b := _rec."AllowEphemeralClientTools";
        p_MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID := _rec."DefaultStorageAccountID";
        p_MJAIAgents_ContextCompressionPromptID_SearchScopeAccess := _rec."SearchScopeAccess";
        p_MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles := _rec."AcceptUnregisteredFiles";
        p_MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID := _rec."DefaultCoAgentID";
        p_MJAIAgents_ContextCompressionPromptID_TypeConfiguration := _rec."TypeConfiguration";
        p_MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite := _rec."AllowMemoryWrite";
        p_MJAIAgents_ContextCompressionPromptID_RecordingDefault := _rec."RecordingDefault";
        p_MJAIAgents_ContextCompressionPromptID_RecordingStorageP_fced08 := _rec."RecordingStorageProviderID";
        p_MJAIAgents_ContextCompressionPromptID_DefaultMediaColle_6f55d3 := _rec."DefaultMediaCollectionID";
        p_MJAIAgents_ContextCompressionPromptID_SupportsPlanMode := _rec."SupportsPlanMode";
        p_MJAIAgents_ContextCompressionPromptID_AcceptsSkills := _rec."AcceptsSkills";
        p_MJAIAgents_ContextCompressionPromptID_SkillActivationMode := _rec."SkillActivationMode";
        p_MJAIAgents_ContextCompressionPromptID_RequirePlanMode := _rec."RequirePlanMode";
        p_MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens := _rec."ContextWindowMaxTokens";
        p_MJAIAgents_ContextCompressionPromptID_CompactionTrigger_cebfb6 := _rec."CompactionTriggerPercent";
        p_MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent := _rec."CompactionTargetPercent";
        p_MJAIAgents_ContextCompressionPromptID_ConversationSumma_e6886b := _rec."ConversationSummaryPromptID";
        -- Set the FK field to NULL
        p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_ID => p_MJAIAgents_ContextCompressionPromptIDID, p_Name => p_MJAIAgents_ContextCompressionPromptID_Name, p_Description => p_MJAIAgents_ContextCompressionPromptID_Description, p_LogoURL => p_MJAIAgents_ContextCompressionPromptID_LogoURL, p_ParentID => p_MJAIAgents_ContextCompressionPromptID_ParentID, p_ExposeAsAction => p_MJAIAgents_ContextCompressionPromptID_ExposeAsAction, p_ExecutionOrder => p_MJAIAgents_ContextCompressionPromptID_ExecutionOrder, p_ExecutionMode => p_MJAIAgents_ContextCompressionPromptID_ExecutionMode, p_EnableContextCompression => p_MJAIAgents_ContextCompressionPromptID_EnableContextComp_017508, p_ContextCompressionMessageThreshold => p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_09124d, p_ContextCompressionPromptID_Clear => 1, p_ContextCompressionPromptID => p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d, p_ContextCompressionMessageRetentionCount => p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_6c27f1, p_TypeID => p_MJAIAgents_ContextCompressionPromptID_TypeID, p_Status => p_MJAIAgents_ContextCompressionPromptID_Status, p_DriverClass => p_MJAIAgents_ContextCompressionPromptID_DriverClass, p_IconClass => p_MJAIAgents_ContextCompressionPromptID_IconClass, p_ModelSelectionMode => p_MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, p_PayloadDownstreamPaths => p_MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, p_PayloadUpstreamPaths => p_MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, p_PayloadSelfReadPaths => p_MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, p_PayloadSelfWritePaths => p_MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, p_PayloadScope => p_MJAIAgents_ContextCompressionPromptID_PayloadScope, p_FinalPayloadValidation => p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, p_FinalPayloadValidationMode => p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a7a211, p_FinalPayloadValidationMaxRetries => p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a47251, p_MaxCostPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, p_MaxTokensPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, p_MaxIterationsPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, p_MaxTimePerRun => p_MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, p_MinExecutionsPerRun => p_MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, p_StartingPayloadValidation => p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60, p_StartingPayloadValidationMode => p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60Mode, p_DefaultPromptEffortLevel => p_MJAIAgents_ContextCompressionPromptID_DefaultPromptEffo_322203, p_ChatHandlingOption => p_MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, p_DefaultArtifactTypeID => p_MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, p_OwnerUserID => p_MJAIAgents_ContextCompressionPromptID_OwnerUserID, p_InvocationMode => p_MJAIAgents_ContextCompressionPromptID_InvocationMode, p_ArtifactCreationMode => p_MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, p_FunctionalRequirements => p_MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, p_TechnicalDesign => p_MJAIAgents_ContextCompressionPromptID_TechnicalDesign, p_InjectNotes => p_MJAIAgents_ContextCompressionPromptID_InjectNotes, p_MaxNotesToInject => p_MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, p_NoteInjectionStrategy => p_MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, p_InjectExamples => p_MJAIAgents_ContextCompressionPromptID_InjectExamples, p_MaxExamplesToInject => p_MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, p_ExampleInjectionStrategy => p_MJAIAgents_ContextCompressionPromptID_ExampleInjectionS_27b212, p_IsRestricted => p_MJAIAgents_ContextCompressionPromptID_IsRestricted, p_MessageMode => p_MJAIAgents_ContextCompressionPromptID_MessageMode, p_MaxMessages => p_MJAIAgents_ContextCompressionPromptID_MaxMessages, p_AttachmentStorageProviderID => p_MJAIAgents_ContextCompressionPromptID_AttachmentStorage_81bfaf, p_AttachmentRootPath => p_MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, p_InlineStorageThresholdBytes => p_MJAIAgents_ContextCompressionPromptID_InlineStorageThre_804eef, p_AgentTypePromptParams => p_MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, p_ScopeConfig => p_MJAIAgents_ContextCompressionPromptID_ScopeConfig, p_NoteRetentionDays => p_MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, p_ExampleRetentionDays => p_MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, p_AutoArchiveEnabled => p_MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, p_RerankerConfiguration => p_MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, p_CategoryID => p_MJAIAgents_ContextCompressionPromptID_CategoryID, p_AllowEphemeralClientTools => p_MJAIAgents_ContextCompressionPromptID_AllowEphemeralCli_be674b, p_DefaultStorageAccountID => p_MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, p_SearchScopeAccess => p_MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, p_AcceptUnregisteredFiles => p_MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, p_DefaultCoAgentID => p_MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, p_TypeConfiguration => p_MJAIAgents_ContextCompressionPromptID_TypeConfiguration, p_AllowMemoryWrite => p_MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite, p_RecordingDefault => p_MJAIAgents_ContextCompressionPromptID_RecordingDefault, p_RecordingStorageProviderID => p_MJAIAgents_ContextCompressionPromptID_RecordingStorageP_fced08, p_DefaultMediaCollectionID => p_MJAIAgents_ContextCompressionPromptID_DefaultMediaColle_6f55d3, p_SupportsPlanMode => p_MJAIAgents_ContextCompressionPromptID_SupportsPlanMode, p_AcceptsSkills => p_MJAIAgents_ContextCompressionPromptID_AcceptsSkills, p_SkillActivationMode => p_MJAIAgents_ContextCompressionPromptID_SkillActivationMode, p_RequirePlanMode => p_MJAIAgents_ContextCompressionPromptID_RequirePlanMode, p_ContextWindowMaxTokens => p_MJAIAgents_ContextCompressionPromptID_ContextWindowMaxTokens, p_CompactionTriggerPercent => p_MJAIAgents_ContextCompressionPromptID_CompactionTrigger_cebfb6, p_CompactionTargetPercent => p_MJAIAgents_ContextCompressionPromptID_CompactionTargetPercent, p_ConversationSummaryPromptID => p_MJAIAgents_ContextCompressionPromptID_ConversationSumma_e6886b);

    END LOOP;

    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID", "AllowEphemeralClientTools", "DefaultStorageAccountID", "SearchScopeAccess", "AcceptUnregisteredFiles", "DefaultCoAgentID", "TypeConfiguration", "AllowMemoryWrite", "RecordingDefault", "RecordingStorageProviderID", "DefaultMediaCollectionID", "SupportsPlanMode", "AcceptsSkills", "SkillActivationMode", "RequirePlanMode", "ContextWindowMaxTokens", "CompactionTriggerPercent", "CompactionTargetPercent", "ConversationSummaryPromptID" FROM __mj."AIAgent" WHERE "ConversationSummaryPromptID" = p_ID
    LOOP
        p_MJAIAgents_ConversationSummaryPromptIDID := _rec."ID";
        p_MJAIAgents_ConversationSummaryPromptID_Name := _rec."Name";
        p_MJAIAgents_ConversationSummaryPromptID_Description := _rec."Description";
        p_MJAIAgents_ConversationSummaryPromptID_LogoURL := _rec."LogoURL";
        p_MJAIAgents_ConversationSummaryPromptID_ParentID := _rec."ParentID";
        p_MJAIAgents_ConversationSummaryPromptID_ExposeAsAction := _rec."ExposeAsAction";
        p_MJAIAgents_ConversationSummaryPromptID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIAgents_ConversationSummaryPromptID_ExecutionMode := _rec."ExecutionMode";
        p_MJAIAgents_ConversationSummaryPromptID_EnableContextCom_dc29c4 := _rec."EnableContextCompression";
        p_MJAIAgents_ConversationSummaryPromptID_ContextCompressi_8df777 := _rec."ContextCompressionMessageThreshold";
        p_MJAIAgents_ConversationSummaryPromptID_ContextCompressi_a2bbf5 := _rec."ContextCompressionPromptID";
        p_MJAIAgents_ConversationSummaryPromptID_ContextCompressi_95a21b := _rec."ContextCompressionMessageRetentionCount";
        p_MJAIAgents_ConversationSummaryPromptID_TypeID := _rec."TypeID";
        p_MJAIAgents_ConversationSummaryPromptID_Status := _rec."Status";
        p_MJAIAgents_ConversationSummaryPromptID_DriverClass := _rec."DriverClass";
        p_MJAIAgents_ConversationSummaryPromptID_IconClass := _rec."IconClass";
        p_MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode := _rec."ModelSelectionMode";
        p_MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths := _rec."PayloadDownstreamPaths";
        p_MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths := _rec."PayloadUpstreamPaths";
        p_MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths := _rec."PayloadSelfReadPaths";
        p_MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths := _rec."PayloadSelfWritePaths";
        p_MJAIAgents_ConversationSummaryPromptID_PayloadScope := _rec."PayloadScope";
        p_MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation := _rec."FinalPayloadValidation";
        p_MJAIAgents_ConversationSummaryPromptID_FinalPayloadVali_a8178a := _rec."FinalPayloadValidationMode";
        p_MJAIAgents_ConversationSummaryPromptID_FinalPayloadVali_5fdb3f := _rec."FinalPayloadValidationMaxRetries";
        p_MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun := _rec."MaxCostPerRun";
        p_MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun := _rec."MaxTokensPerRun";
        p_MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun := _rec."MaxIterationsPerRun";
        p_MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun := _rec."MaxTimePerRun";
        p_MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun := _rec."MinExecutionsPerRun";
        p_MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun := _rec."MaxExecutionsPerRun";
        p_MJAIAgents_ConversationSummaryPromptID_StartingPayloadV_5b0d21 := _rec."StartingPayloadValidation";
        p_MJAIAgents_ConversationSummaryPromptID_StartingPayloadV_5b0d21Mode := _rec."StartingPayloadValidationMode";
        p_MJAIAgents_ConversationSummaryPromptID_DefaultPromptEff_0cd6bf := _rec."DefaultPromptEffortLevel";
        p_MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption := _rec."ChatHandlingOption";
        p_MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID := _rec."DefaultArtifactTypeID";
        p_MJAIAgents_ConversationSummaryPromptID_OwnerUserID := _rec."OwnerUserID";
        p_MJAIAgents_ConversationSummaryPromptID_InvocationMode := _rec."InvocationMode";
        p_MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode := _rec."ArtifactCreationMode";
        p_MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements := _rec."FunctionalRequirements";
        p_MJAIAgents_ConversationSummaryPromptID_TechnicalDesign := _rec."TechnicalDesign";
        p_MJAIAgents_ConversationSummaryPromptID_InjectNotes := _rec."InjectNotes";
        p_MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject := _rec."MaxNotesToInject";
        p_MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy := _rec."NoteInjectionStrategy";
        p_MJAIAgents_ConversationSummaryPromptID_InjectExamples := _rec."InjectExamples";
        p_MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject := _rec."MaxExamplesToInject";
        p_MJAIAgents_ConversationSummaryPromptID_ExampleInjection_0266ce := _rec."ExampleInjectionStrategy";
        p_MJAIAgents_ConversationSummaryPromptID_IsRestricted := _rec."IsRestricted";
        p_MJAIAgents_ConversationSummaryPromptID_MessageMode := _rec."MessageMode";
        p_MJAIAgents_ConversationSummaryPromptID_MaxMessages := _rec."MaxMessages";
        p_MJAIAgents_ConversationSummaryPromptID_AttachmentStorag_8ff944 := _rec."AttachmentStorageProviderID";
        p_MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath := _rec."AttachmentRootPath";
        p_MJAIAgents_ConversationSummaryPromptID_InlineStorageThr_8e8885 := _rec."InlineStorageThresholdBytes";
        p_MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams := _rec."AgentTypePromptParams";
        p_MJAIAgents_ConversationSummaryPromptID_ScopeConfig := _rec."ScopeConfig";
        p_MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays := _rec."NoteRetentionDays";
        p_MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays := _rec."ExampleRetentionDays";
        p_MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled := _rec."AutoArchiveEnabled";
        p_MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration := _rec."RerankerConfiguration";
        p_MJAIAgents_ConversationSummaryPromptID_CategoryID := _rec."CategoryID";
        p_MJAIAgents_ConversationSummaryPromptID_AllowEphemeralCl_3a4a0d := _rec."AllowEphemeralClientTools";
        p_MJAIAgents_ConversationSummaryPromptID_DefaultStorageAc_0fa62b := _rec."DefaultStorageAccountID";
        p_MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess := _rec."SearchScopeAccess";
        p_MJAIAgents_ConversationSummaryPromptID_AcceptUnregister_c99ef4 := _rec."AcceptUnregisteredFiles";
        p_MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID := _rec."DefaultCoAgentID";
        p_MJAIAgents_ConversationSummaryPromptID_TypeConfiguration := _rec."TypeConfiguration";
        p_MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite := _rec."AllowMemoryWrite";
        p_MJAIAgents_ConversationSummaryPromptID_RecordingDefault := _rec."RecordingDefault";
        p_MJAIAgents_ConversationSummaryPromptID_RecordingStorage_fd6280 := _rec."RecordingStorageProviderID";
        p_MJAIAgents_ConversationSummaryPromptID_DefaultMediaColl_4a0a8f := _rec."DefaultMediaCollectionID";
        p_MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode := _rec."SupportsPlanMode";
        p_MJAIAgents_ConversationSummaryPromptID_AcceptsSkills := _rec."AcceptsSkills";
        p_MJAIAgents_ConversationSummaryPromptID_SkillActivationMode := _rec."SkillActivationMode";
        p_MJAIAgents_ConversationSummaryPromptID_RequirePlanMode := _rec."RequirePlanMode";
        p_MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens := _rec."ContextWindowMaxTokens";
        p_MJAIAgents_ConversationSummaryPromptID_CompactionTrigge_a97472 := _rec."CompactionTriggerPercent";
        p_MJAIAgents_ConversationSummaryPromptID_CompactionTarget_d292ce := _rec."CompactionTargetPercent";
        p_MJAIAgents_ConversationSummaryPromptID_ConversationSumm_f4c200 := _rec."ConversationSummaryPromptID";
        -- Set the FK field to NULL
        p_MJAIAgents_ConversationSummaryPromptID_ConversationSumm_f4c200 := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_ID => p_MJAIAgents_ConversationSummaryPromptIDID, p_Name => p_MJAIAgents_ConversationSummaryPromptID_Name, p_Description => p_MJAIAgents_ConversationSummaryPromptID_Description, p_LogoURL => p_MJAIAgents_ConversationSummaryPromptID_LogoURL, p_ParentID => p_MJAIAgents_ConversationSummaryPromptID_ParentID, p_ExposeAsAction => p_MJAIAgents_ConversationSummaryPromptID_ExposeAsAction, p_ExecutionOrder => p_MJAIAgents_ConversationSummaryPromptID_ExecutionOrder, p_ExecutionMode => p_MJAIAgents_ConversationSummaryPromptID_ExecutionMode, p_EnableContextCompression => p_MJAIAgents_ConversationSummaryPromptID_EnableContextCom_dc29c4, p_ContextCompressionMessageThreshold => p_MJAIAgents_ConversationSummaryPromptID_ContextCompressi_8df777, p_ContextCompressionPromptID => p_MJAIAgents_ConversationSummaryPromptID_ContextCompressi_a2bbf5, p_ContextCompressionMessageRetentionCount => p_MJAIAgents_ConversationSummaryPromptID_ContextCompressi_95a21b, p_TypeID => p_MJAIAgents_ConversationSummaryPromptID_TypeID, p_Status => p_MJAIAgents_ConversationSummaryPromptID_Status, p_DriverClass => p_MJAIAgents_ConversationSummaryPromptID_DriverClass, p_IconClass => p_MJAIAgents_ConversationSummaryPromptID_IconClass, p_ModelSelectionMode => p_MJAIAgents_ConversationSummaryPromptID_ModelSelectionMode, p_PayloadDownstreamPaths => p_MJAIAgents_ConversationSummaryPromptID_PayloadDownstreamPaths, p_PayloadUpstreamPaths => p_MJAIAgents_ConversationSummaryPromptID_PayloadUpstreamPaths, p_PayloadSelfReadPaths => p_MJAIAgents_ConversationSummaryPromptID_PayloadSelfReadPaths, p_PayloadSelfWritePaths => p_MJAIAgents_ConversationSummaryPromptID_PayloadSelfWritePaths, p_PayloadScope => p_MJAIAgents_ConversationSummaryPromptID_PayloadScope, p_FinalPayloadValidation => p_MJAIAgents_ConversationSummaryPromptID_FinalPayloadValidation, p_FinalPayloadValidationMode => p_MJAIAgents_ConversationSummaryPromptID_FinalPayloadVali_a8178a, p_FinalPayloadValidationMaxRetries => p_MJAIAgents_ConversationSummaryPromptID_FinalPayloadVali_5fdb3f, p_MaxCostPerRun => p_MJAIAgents_ConversationSummaryPromptID_MaxCostPerRun, p_MaxTokensPerRun => p_MJAIAgents_ConversationSummaryPromptID_MaxTokensPerRun, p_MaxIterationsPerRun => p_MJAIAgents_ConversationSummaryPromptID_MaxIterationsPerRun, p_MaxTimePerRun => p_MJAIAgents_ConversationSummaryPromptID_MaxTimePerRun, p_MinExecutionsPerRun => p_MJAIAgents_ConversationSummaryPromptID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgents_ConversationSummaryPromptID_MaxExecutionsPerRun, p_StartingPayloadValidation => p_MJAIAgents_ConversationSummaryPromptID_StartingPayloadV_5b0d21, p_StartingPayloadValidationMode => p_MJAIAgents_ConversationSummaryPromptID_StartingPayloadV_5b0d21Mode, p_DefaultPromptEffortLevel => p_MJAIAgents_ConversationSummaryPromptID_DefaultPromptEff_0cd6bf, p_ChatHandlingOption => p_MJAIAgents_ConversationSummaryPromptID_ChatHandlingOption, p_DefaultArtifactTypeID => p_MJAIAgents_ConversationSummaryPromptID_DefaultArtifactTypeID, p_OwnerUserID => p_MJAIAgents_ConversationSummaryPromptID_OwnerUserID, p_InvocationMode => p_MJAIAgents_ConversationSummaryPromptID_InvocationMode, p_ArtifactCreationMode => p_MJAIAgents_ConversationSummaryPromptID_ArtifactCreationMode, p_FunctionalRequirements => p_MJAIAgents_ConversationSummaryPromptID_FunctionalRequirements, p_TechnicalDesign => p_MJAIAgents_ConversationSummaryPromptID_TechnicalDesign, p_InjectNotes => p_MJAIAgents_ConversationSummaryPromptID_InjectNotes, p_MaxNotesToInject => p_MJAIAgents_ConversationSummaryPromptID_MaxNotesToInject, p_NoteInjectionStrategy => p_MJAIAgents_ConversationSummaryPromptID_NoteInjectionStrategy, p_InjectExamples => p_MJAIAgents_ConversationSummaryPromptID_InjectExamples, p_MaxExamplesToInject => p_MJAIAgents_ConversationSummaryPromptID_MaxExamplesToInject, p_ExampleInjectionStrategy => p_MJAIAgents_ConversationSummaryPromptID_ExampleInjection_0266ce, p_IsRestricted => p_MJAIAgents_ConversationSummaryPromptID_IsRestricted, p_MessageMode => p_MJAIAgents_ConversationSummaryPromptID_MessageMode, p_MaxMessages => p_MJAIAgents_ConversationSummaryPromptID_MaxMessages, p_AttachmentStorageProviderID => p_MJAIAgents_ConversationSummaryPromptID_AttachmentStorag_8ff944, p_AttachmentRootPath => p_MJAIAgents_ConversationSummaryPromptID_AttachmentRootPath, p_InlineStorageThresholdBytes => p_MJAIAgents_ConversationSummaryPromptID_InlineStorageThr_8e8885, p_AgentTypePromptParams => p_MJAIAgents_ConversationSummaryPromptID_AgentTypePromptParams, p_ScopeConfig => p_MJAIAgents_ConversationSummaryPromptID_ScopeConfig, p_NoteRetentionDays => p_MJAIAgents_ConversationSummaryPromptID_NoteRetentionDays, p_ExampleRetentionDays => p_MJAIAgents_ConversationSummaryPromptID_ExampleRetentionDays, p_AutoArchiveEnabled => p_MJAIAgents_ConversationSummaryPromptID_AutoArchiveEnabled, p_RerankerConfiguration => p_MJAIAgents_ConversationSummaryPromptID_RerankerConfiguration, p_CategoryID => p_MJAIAgents_ConversationSummaryPromptID_CategoryID, p_AllowEphemeralClientTools => p_MJAIAgents_ConversationSummaryPromptID_AllowEphemeralCl_3a4a0d, p_DefaultStorageAccountID => p_MJAIAgents_ConversationSummaryPromptID_DefaultStorageAc_0fa62b, p_SearchScopeAccess => p_MJAIAgents_ConversationSummaryPromptID_SearchScopeAccess, p_AcceptUnregisteredFiles => p_MJAIAgents_ConversationSummaryPromptID_AcceptUnregister_c99ef4, p_DefaultCoAgentID => p_MJAIAgents_ConversationSummaryPromptID_DefaultCoAgentID, p_TypeConfiguration => p_MJAIAgents_ConversationSummaryPromptID_TypeConfiguration, p_AllowMemoryWrite => p_MJAIAgents_ConversationSummaryPromptID_AllowMemoryWrite, p_RecordingDefault => p_MJAIAgents_ConversationSummaryPromptID_RecordingDefault, p_RecordingStorageProviderID => p_MJAIAgents_ConversationSummaryPromptID_RecordingStorage_fd6280, p_DefaultMediaCollectionID => p_MJAIAgents_ConversationSummaryPromptID_DefaultMediaColl_4a0a8f, p_SupportsPlanMode => p_MJAIAgents_ConversationSummaryPromptID_SupportsPlanMode, p_AcceptsSkills => p_MJAIAgents_ConversationSummaryPromptID_AcceptsSkills, p_SkillActivationMode => p_MJAIAgents_ConversationSummaryPromptID_SkillActivationMode, p_RequirePlanMode => p_MJAIAgents_ConversationSummaryPromptID_RequirePlanMode, p_ContextWindowMaxTokens => p_MJAIAgents_ConversationSummaryPromptID_ContextWindowMaxTokens, p_CompactionTriggerPercent => p_MJAIAgents_ConversationSummaryPromptID_CompactionTrigge_a97472, p_CompactionTargetPercent => p_MJAIAgents_ConversationSummaryPromptID_CompactionTarget_d292ce, p_ConversationSummaryPromptID_Clear => 1, p_ConversationSummaryPromptID => p_MJAIAgents_ConversationSummaryPromptID_ConversationSumm_f4c200);

    END LOOP;

    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration


    FOR _rec IN SELECT "ID", "Name", "Description", "IsDefault", "Status", "DefaultPromptForContextCompressionID", "DefaultPromptForContextSummarizationID", "DefaultStorageProviderID", "DefaultStorageRootPath", "ParentID" FROM __mj."AIConfiguration" WHERE "DefaultPromptForContextCompressionID" = p_ID
    LOOP
        p_MJAIConfigurations_DefaultPromptForContextCompressionIDID := _rec."ID";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_Name := _rec."Name";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_da9038 := _rec."Description";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_6adeb7 := _rec."IsDefault";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_d74408 := _rec."Status";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_62528c := _rec."DefaultPromptForContextCompressionID";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_dbdd4d := _rec."DefaultPromptForContextSummarizationID";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_30722a := _rec."DefaultStorageProviderID";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_70e3ed := _rec."DefaultStorageRootPath";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_0dd4a4 := _rec."ParentID";
        -- Set the FK field to NULL
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_62528c := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIConfiguration"(p_ID => p_MJAIConfigurations_DefaultPromptForContextCompressionIDID, p_Name => p_MJAIConfigurations_DefaultPromptForContextCompressionID_Name, p_Description => p_MJAIConfigurations_DefaultPromptForContextCompressionID_da9038, p_IsDefault => p_MJAIConfigurations_DefaultPromptForContextCompressionID_6adeb7, p_Status => p_MJAIConfigurations_DefaultPromptForContextCompressionID_d74408, p_DefaultPromptForContextCompressionID_Clear => 1, p_DefaultPromptForContextCompressionID => p_MJAIConfigurations_DefaultPromptForContextCompressionID_62528c, p_DefaultPromptForContextSummarizationID => p_MJAIConfigurations_DefaultPromptForContextCompressionID_dbdd4d, p_DefaultStorageProviderID => p_MJAIConfigurations_DefaultPromptForContextCompressionID_30722a, p_DefaultStorageRootPath => p_MJAIConfigurations_DefaultPromptForContextCompressionID_70e3ed, p_ParentID => p_MJAIConfigurations_DefaultPromptForContextCompressionID_0dd4a4);

    END LOOP;

    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration


    FOR _rec IN SELECT "ID", "Name", "Description", "IsDefault", "Status", "DefaultPromptForContextCompressionID", "DefaultPromptForContextSummarizationID", "DefaultStorageProviderID", "DefaultStorageRootPath", "ParentID" FROM __mj."AIConfiguration" WHERE "DefaultPromptForContextSummarizationID" = p_ID
    LOOP
        p_MJAIConfigurations_DefaultPromptForContextSummarizationIDID := _rec."ID";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_c5c467 := _rec."Name";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_6a1d29 := _rec."Description";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_bf32c6 := _rec."IsDefault";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_6fd740 := _rec."Status";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_ac095a := _rec."DefaultPromptForContextCompressionID";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_931872 := _rec."DefaultPromptForContextSummarizationID";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_991e80 := _rec."DefaultStorageProviderID";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_b4211c := _rec."DefaultStorageRootPath";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_ce7c84 := _rec."ParentID";
        -- Set the FK field to NULL
        p_MJAIConfigurations_DefaultPromptForContextSummarization_931872 := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIConfiguration"(p_ID => p_MJAIConfigurations_DefaultPromptForContextSummarizationIDID, p_Name => p_MJAIConfigurations_DefaultPromptForContextSummarization_c5c467, p_Description => p_MJAIConfigurations_DefaultPromptForContextSummarization_6a1d29, p_IsDefault => p_MJAIConfigurations_DefaultPromptForContextSummarization_bf32c6, p_Status => p_MJAIConfigurations_DefaultPromptForContextSummarization_6fd740, p_DefaultPromptForContextCompressionID => p_MJAIConfigurations_DefaultPromptForContextSummarization_ac095a, p_DefaultPromptForContextSummarizationID_Clear => 1, p_DefaultPromptForContextSummarizationID => p_MJAIConfigurations_DefaultPromptForContextSummarization_931872, p_DefaultStorageProviderID => p_MJAIConfigurations_DefaultPromptForContextSummarization_991e80, p_DefaultStorageRootPath => p_MJAIConfigurations_DefaultPromptForContextSummarization_b4211c, p_ParentID => p_MJAIConfigurations_DefaultPromptForContextSummarization_ce7c84);

    END LOOP;

    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel

    FOR _rec IN SELECT "ID" FROM __mj."AIPromptModel" WHERE "PromptID" = p_ID
    LOOP
        p_MJAIPromptModels_PromptIDID := _rec."ID";
        PERFORM __mj."spDeleteAIPromptModel"(p_ID => p_MJAIPromptModels_PromptIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIPromptRun using cursor to call spDeleteAIPromptRun

    FOR _rec IN SELECT "ID" FROM __mj."AIPromptRun" WHERE "PromptID" = p_ID
    LOOP
        p_MJAIPromptRuns_PromptIDID := _rec."ID";
        PERFORM __mj."spDeleteAIPromptRun"(p_ID => p_MJAIPromptRuns_PromptIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite", "TokensCacheReadRollup", "TokensCacheWriteRollup" FROM __mj."AIPromptRun" WHERE "JudgeID" = p_ID
    LOOP
        p_MJAIPromptRuns_JudgeIDID := _rec."ID";
        p_MJAIPromptRuns_JudgeID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_JudgeID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_JudgeID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_JudgeID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_JudgeID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_JudgeID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_JudgeID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_JudgeID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_JudgeID_Messages := _rec."Messages";
        p_MJAIPromptRuns_JudgeID_Result := _rec."Result";
        p_MJAIPromptRuns_JudgeID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_JudgeID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_JudgeID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_JudgeID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_JudgeID_Success := _rec."Success";
        p_MJAIPromptRuns_JudgeID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_JudgeID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_JudgeID_RunType := _rec."RunType";
        p_MJAIPromptRuns_JudgeID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_JudgeID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_JudgeID_Cost := _rec."Cost";
        p_MJAIPromptRuns_JudgeID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_JudgeID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_JudgeID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_JudgeID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_JudgeID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_JudgeID_TopP := _rec."TopP";
        p_MJAIPromptRuns_JudgeID_TopK := _rec."TopK";
        p_MJAIPromptRuns_JudgeID_MinP := _rec."MinP";
        p_MJAIPromptRuns_JudgeID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_JudgeID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_JudgeID_Seed := _rec."Seed";
        p_MJAIPromptRuns_JudgeID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_JudgeID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_JudgeID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_JudgeID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_JudgeID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_JudgeID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_JudgeID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_JudgeID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_JudgeID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_JudgeID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_JudgeID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_JudgeID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_JudgeID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_JudgeID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_JudgeID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_JudgeID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_JudgeID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_JudgeID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_JudgeID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_JudgeID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_JudgeID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_JudgeID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_JudgeID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_JudgeID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_JudgeID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_JudgeID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_JudgeID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_JudgeID_Status := _rec."Status";
        p_MJAIPromptRuns_JudgeID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_JudgeID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_JudgeID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_JudgeID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_JudgeID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_JudgeID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_JudgeID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_JudgeID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_JudgeID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_JudgeID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_JudgeID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_JudgeID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_JudgeID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_JudgeID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_JudgeID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_JudgeID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_JudgeID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_JudgeID_RunName := _rec."RunName";
        p_MJAIPromptRuns_JudgeID_Comments := _rec."Comments";
        p_MJAIPromptRuns_JudgeID_TestRunID := _rec."TestRunID";
        p_MJAIPromptRuns_JudgeID_AssistantPrefill := _rec."AssistantPrefill";
        p_MJAIPromptRuns_JudgeID_TokensCacheRead := _rec."TokensCacheRead";
        p_MJAIPromptRuns_JudgeID_TokensCacheWrite := _rec."TokensCacheWrite";
        p_MJAIPromptRuns_JudgeID_TokensCacheReadRollup := _rec."TokensCacheReadRollup";
        p_MJAIPromptRuns_JudgeID_TokensCacheWriteRollup := _rec."TokensCacheWriteRollup";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_JudgeID_JudgeID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_JudgeIDID, p_PromptID => p_MJAIPromptRuns_JudgeID_PromptID, p_ModelID => p_MJAIPromptRuns_JudgeID_ModelID, p_VendorID => p_MJAIPromptRuns_JudgeID_VendorID, p_AgentID => p_MJAIPromptRuns_JudgeID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_JudgeID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_JudgeID_RunAt, p_CompletedAt => p_MJAIPromptRuns_JudgeID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_JudgeID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_JudgeID_Messages, p_Result => p_MJAIPromptRuns_JudgeID_Result, p_TokensUsed => p_MJAIPromptRuns_JudgeID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_JudgeID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_JudgeID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_JudgeID_TotalCost, p_Success => p_MJAIPromptRuns_JudgeID_Success, p_ErrorMessage => p_MJAIPromptRuns_JudgeID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_JudgeID_ParentID, p_RunType => p_MJAIPromptRuns_JudgeID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_JudgeID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_JudgeID_AgentRunID, p_Cost => p_MJAIPromptRuns_JudgeID_Cost, p_CostCurrency => p_MJAIPromptRuns_JudgeID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_JudgeID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_JudgeID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_JudgeID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_JudgeID_Temperature, p_TopP => p_MJAIPromptRuns_JudgeID_TopP, p_TopK => p_MJAIPromptRuns_JudgeID_TopK, p_MinP => p_MJAIPromptRuns_JudgeID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_JudgeID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_JudgeID_PresencePenalty, p_Seed => p_MJAIPromptRuns_JudgeID_Seed, p_StopSequences => p_MJAIPromptRuns_JudgeID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_JudgeID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_JudgeID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_JudgeID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_JudgeID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_JudgeID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_JudgeID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_JudgeID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_JudgeID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_JudgeID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_JudgeID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_JudgeID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_JudgeID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_JudgeID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_JudgeID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_JudgeID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_JudgeID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_JudgeID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_JudgeID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_JudgeID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_JudgeID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_JudgeID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_JudgeID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_JudgeID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_JudgeID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_JudgeID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_JudgeID_ModelSelection, p_Status => p_MJAIPromptRuns_JudgeID_Status, p_Cancelled => p_MJAIPromptRuns_JudgeID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_JudgeID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_JudgeID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_JudgeID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_JudgeID_CacheHit, p_CacheKey => p_MJAIPromptRuns_JudgeID_CacheKey, p_JudgeID_Clear => 1, p_JudgeID => p_MJAIPromptRuns_JudgeID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_JudgeID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_JudgeID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_JudgeID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_JudgeID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_JudgeID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_JudgeID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_JudgeID_QueueTime, p_PromptTime => p_MJAIPromptRuns_JudgeID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_JudgeID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_JudgeID_EffortLevel, p_RunName => p_MJAIPromptRuns_JudgeID_RunName, p_Comments => p_MJAIPromptRuns_JudgeID_Comments, p_TestRunID => p_MJAIPromptRuns_JudgeID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_JudgeID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_JudgeID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_JudgeID_TokensCacheWrite, p_TokensCacheReadRollup => p_MJAIPromptRuns_JudgeID_TokensCacheReadRollup, p_TokensCacheWriteRollup => p_MJAIPromptRuns_JudgeID_TokensCacheWriteRollup);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite", "TokensCacheReadRollup", "TokensCacheWriteRollup" FROM __mj."AIPromptRun" WHERE "ChildPromptID" = p_ID
    LOOP
        p_MJAIPromptRuns_ChildPromptIDID := _rec."ID";
        p_MJAIPromptRuns_ChildPromptID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_ChildPromptID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_ChildPromptID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_ChildPromptID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_ChildPromptID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_ChildPromptID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_ChildPromptID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_ChildPromptID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_ChildPromptID_Messages := _rec."Messages";
        p_MJAIPromptRuns_ChildPromptID_Result := _rec."Result";
        p_MJAIPromptRuns_ChildPromptID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_ChildPromptID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_ChildPromptID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_ChildPromptID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_ChildPromptID_Success := _rec."Success";
        p_MJAIPromptRuns_ChildPromptID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_ChildPromptID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_ChildPromptID_RunType := _rec."RunType";
        p_MJAIPromptRuns_ChildPromptID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_ChildPromptID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_ChildPromptID_Cost := _rec."Cost";
        p_MJAIPromptRuns_ChildPromptID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_ChildPromptID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_ChildPromptID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_ChildPromptID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_ChildPromptID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_ChildPromptID_TopP := _rec."TopP";
        p_MJAIPromptRuns_ChildPromptID_TopK := _rec."TopK";
        p_MJAIPromptRuns_ChildPromptID_MinP := _rec."MinP";
        p_MJAIPromptRuns_ChildPromptID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_ChildPromptID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_ChildPromptID_Seed := _rec."Seed";
        p_MJAIPromptRuns_ChildPromptID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_ChildPromptID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_ChildPromptID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_ChildPromptID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_ChildPromptID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_ChildPromptID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_ChildPromptID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_ChildPromptID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_ChildPromptID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_ChildPromptID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_ChildPromptID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_ChildPromptID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_ChildPromptID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_ChildPromptID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_ChildPromptID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_ChildPromptID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_ChildPromptID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_ChildPromptID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_ChildPromptID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_ChildPromptID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_ChildPromptID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_ChildPromptID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_ChildPromptID_Status := _rec."Status";
        p_MJAIPromptRuns_ChildPromptID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_ChildPromptID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_ChildPromptID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_ChildPromptID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_ChildPromptID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_ChildPromptID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_ChildPromptID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_ChildPromptID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_ChildPromptID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_ChildPromptID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_ChildPromptID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_ChildPromptID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_ChildPromptID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_ChildPromptID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_ChildPromptID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_ChildPromptID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_ChildPromptID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_ChildPromptID_RunName := _rec."RunName";
        p_MJAIPromptRuns_ChildPromptID_Comments := _rec."Comments";
        p_MJAIPromptRuns_ChildPromptID_TestRunID := _rec."TestRunID";
        p_MJAIPromptRuns_ChildPromptID_AssistantPrefill := _rec."AssistantPrefill";
        p_MJAIPromptRuns_ChildPromptID_TokensCacheRead := _rec."TokensCacheRead";
        p_MJAIPromptRuns_ChildPromptID_TokensCacheWrite := _rec."TokensCacheWrite";
        p_MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup := _rec."TokensCacheReadRollup";
        p_MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup := _rec."TokensCacheWriteRollup";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_ChildPromptID_ChildPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_ChildPromptIDID, p_PromptID => p_MJAIPromptRuns_ChildPromptID_PromptID, p_ModelID => p_MJAIPromptRuns_ChildPromptID_ModelID, p_VendorID => p_MJAIPromptRuns_ChildPromptID_VendorID, p_AgentID => p_MJAIPromptRuns_ChildPromptID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_ChildPromptID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_ChildPromptID_RunAt, p_CompletedAt => p_MJAIPromptRuns_ChildPromptID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_ChildPromptID_Messages, p_Result => p_MJAIPromptRuns_ChildPromptID_Result, p_TokensUsed => p_MJAIPromptRuns_ChildPromptID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_ChildPromptID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_ChildPromptID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_ChildPromptID_TotalCost, p_Success => p_MJAIPromptRuns_ChildPromptID_Success, p_ErrorMessage => p_MJAIPromptRuns_ChildPromptID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_ChildPromptID_ParentID, p_RunType => p_MJAIPromptRuns_ChildPromptID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_ChildPromptID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_ChildPromptID_AgentRunID, p_Cost => p_MJAIPromptRuns_ChildPromptID_Cost, p_CostCurrency => p_MJAIPromptRuns_ChildPromptID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_ChildPromptID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_ChildPromptID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_ChildPromptID_Temperature, p_TopP => p_MJAIPromptRuns_ChildPromptID_TopP, p_TopK => p_MJAIPromptRuns_ChildPromptID_TopK, p_MinP => p_MJAIPromptRuns_ChildPromptID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_ChildPromptID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_ChildPromptID_PresencePenalty, p_Seed => p_MJAIPromptRuns_ChildPromptID_Seed, p_StopSequences => p_MJAIPromptRuns_ChildPromptID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_ChildPromptID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_ChildPromptID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_ChildPromptID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_ChildPromptID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_ChildPromptID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_ChildPromptID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_ChildPromptID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_ChildPromptID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_ChildPromptID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_ChildPromptID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_ChildPromptID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_ChildPromptID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_ChildPromptID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_ChildPromptID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_ChildPromptID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_ChildPromptID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_ChildPromptID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_ChildPromptID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_ChildPromptID_ModelSelection, p_Status => p_MJAIPromptRuns_ChildPromptID_Status, p_Cancelled => p_MJAIPromptRuns_ChildPromptID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_ChildPromptID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_ChildPromptID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_ChildPromptID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_ChildPromptID_CacheHit, p_CacheKey => p_MJAIPromptRuns_ChildPromptID_CacheKey, p_JudgeID => p_MJAIPromptRuns_ChildPromptID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_ChildPromptID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_ChildPromptID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_ChildPromptID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_ChildPromptID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_ChildPromptID_ErrorDetails, p_ChildPromptID_Clear => 1, p_ChildPromptID => p_MJAIPromptRuns_ChildPromptID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_ChildPromptID_QueueTime, p_PromptTime => p_MJAIPromptRuns_ChildPromptID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_ChildPromptID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_ChildPromptID_EffortLevel, p_RunName => p_MJAIPromptRuns_ChildPromptID_RunName, p_Comments => p_MJAIPromptRuns_ChildPromptID_Comments, p_TestRunID => p_MJAIPromptRuns_ChildPromptID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_ChildPromptID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_ChildPromptID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_ChildPromptID_TokensCacheWrite, p_TokensCacheReadRollup => p_MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, p_TokensCacheWriteRollup => p_MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup);

    END LOOP;

    
    -- Cascade update on AIPrompt using cursor to call spUpdateAIPrompt


    FOR _rec IN SELECT "ID", "Name", "Description", "TemplateID", "CategoryID", "TypeID", "Status", "ResponseFormat", "ModelSpecificResponseFormat", "AIModelTypeID", "MinPowerRank", "SelectionStrategy", "PowerPreference", "ParallelizationMode", "ParallelCount", "ParallelConfigParam", "OutputType", "OutputExample", "ValidationBehavior", "MaxRetries", "RetryDelayMS", "RetryStrategy", "ResultSelectorPromptID", "EnableCaching", "CacheTTLSeconds", "CacheMatchType", "CacheSimilarityThreshold", "CacheMustMatchModel", "CacheMustMatchVendor", "CacheMustMatchAgent", "CacheMustMatchConfig", "PromptRole", "PromptPosition", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "IncludeLogProbs", "TopLogProbs", "FailoverStrategy", "FailoverMaxAttempts", "FailoverDelaySeconds", "FailoverModelStrategy", "FailoverErrorScope", "EffortLevel", "AssistantPrefill", "PrefillFallbackMode", "RequireSpecificModels" FROM __mj."AIPrompt" WHERE "ResultSelectorPromptID" = p_ID
    LOOP
        p_MJAIPrompts_ResultSelectorPromptIDID := _rec."ID";
        p_MJAIPrompts_ResultSelectorPromptID_Name := _rec."Name";
        p_MJAIPrompts_ResultSelectorPromptID_Description := _rec."Description";
        p_MJAIPrompts_ResultSelectorPromptID_TemplateID := _rec."TemplateID";
        p_MJAIPrompts_ResultSelectorPromptID_CategoryID := _rec."CategoryID";
        p_MJAIPrompts_ResultSelectorPromptID_TypeID := _rec."TypeID";
        p_MJAIPrompts_ResultSelectorPromptID_Status := _rec."Status";
        p_MJAIPrompts_ResultSelectorPromptID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPrompts_ResultSelectorPromptID_ModelSpecificRespons_905abd := _rec."ModelSpecificResponseFormat";
        p_MJAIPrompts_ResultSelectorPromptID_AIModelTypeID := _rec."AIModelTypeID";
        p_MJAIPrompts_ResultSelectorPromptID_MinPowerRank := _rec."MinPowerRank";
        p_MJAIPrompts_ResultSelectorPromptID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPrompts_ResultSelectorPromptID_PowerPreference := _rec."PowerPreference";
        p_MJAIPrompts_ResultSelectorPromptID_ParallelizationMode := _rec."ParallelizationMode";
        p_MJAIPrompts_ResultSelectorPromptID_ParallelCount := _rec."ParallelCount";
        p_MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam := _rec."ParallelConfigParam";
        p_MJAIPrompts_ResultSelectorPromptID_OutputType := _rec."OutputType";
        p_MJAIPrompts_ResultSelectorPromptID_OutputExample := _rec."OutputExample";
        p_MJAIPrompts_ResultSelectorPromptID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPrompts_ResultSelectorPromptID_MaxRetries := _rec."MaxRetries";
        p_MJAIPrompts_ResultSelectorPromptID_RetryDelayMS := _rec."RetryDelayMS";
        p_MJAIPrompts_ResultSelectorPromptID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID := _rec."ResultSelectorPromptID";
        p_MJAIPrompts_ResultSelectorPromptID_EnableCaching := _rec."EnableCaching";
        p_MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds := _rec."CacheTTLSeconds";
        p_MJAIPrompts_ResultSelectorPromptID_CacheMatchType := _rec."CacheMatchType";
        p_MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold := _rec."CacheSimilarityThreshold";
        p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel := _rec."CacheMustMatchModel";
        p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor := _rec."CacheMustMatchVendor";
        p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent := _rec."CacheMustMatchAgent";
        p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig := _rec."CacheMustMatchConfig";
        p_MJAIPrompts_ResultSelectorPromptID_PromptRole := _rec."PromptRole";
        p_MJAIPrompts_ResultSelectorPromptID_PromptPosition := _rec."PromptPosition";
        p_MJAIPrompts_ResultSelectorPromptID_Temperature := _rec."Temperature";
        p_MJAIPrompts_ResultSelectorPromptID_TopP := _rec."TopP";
        p_MJAIPrompts_ResultSelectorPromptID_TopK := _rec."TopK";
        p_MJAIPrompts_ResultSelectorPromptID_MinP := _rec."MinP";
        p_MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPrompts_ResultSelectorPromptID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPrompts_ResultSelectorPromptID_Seed := _rec."Seed";
        p_MJAIPrompts_ResultSelectorPromptID_StopSequences := _rec."StopSequences";
        p_MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs := _rec."IncludeLogProbs";
        p_MJAIPrompts_ResultSelectorPromptID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPrompts_ResultSelectorPromptID_FailoverStrategy := _rec."FailoverStrategy";
        p_MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts := _rec."FailoverMaxAttempts";
        p_MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds := _rec."FailoverDelaySeconds";
        p_MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy := _rec."FailoverModelStrategy";
        p_MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope := _rec."FailoverErrorScope";
        p_MJAIPrompts_ResultSelectorPromptID_EffortLevel := _rec."EffortLevel";
        p_MJAIPrompts_ResultSelectorPromptID_AssistantPrefill := _rec."AssistantPrefill";
        p_MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode := _rec."PrefillFallbackMode";
        p_MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels := _rec."RequireSpecificModels";
        -- Set the FK field to NULL
        p_MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPrompt"(p_ID => p_MJAIPrompts_ResultSelectorPromptIDID, p_Name => p_MJAIPrompts_ResultSelectorPromptID_Name, p_Description => p_MJAIPrompts_ResultSelectorPromptID_Description, p_TemplateID => p_MJAIPrompts_ResultSelectorPromptID_TemplateID, p_CategoryID => p_MJAIPrompts_ResultSelectorPromptID_CategoryID, p_TypeID => p_MJAIPrompts_ResultSelectorPromptID_TypeID, p_Status => p_MJAIPrompts_ResultSelectorPromptID_Status, p_ResponseFormat => p_MJAIPrompts_ResultSelectorPromptID_ResponseFormat, p_ModelSpecificResponseFormat => p_MJAIPrompts_ResultSelectorPromptID_ModelSpecificRespons_905abd, p_AIModelTypeID => p_MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, p_MinPowerRank => p_MJAIPrompts_ResultSelectorPromptID_MinPowerRank, p_SelectionStrategy => p_MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, p_PowerPreference => p_MJAIPrompts_ResultSelectorPromptID_PowerPreference, p_ParallelizationMode => p_MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, p_ParallelCount => p_MJAIPrompts_ResultSelectorPromptID_ParallelCount, p_ParallelConfigParam => p_MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, p_OutputType => p_MJAIPrompts_ResultSelectorPromptID_OutputType, p_OutputExample => p_MJAIPrompts_ResultSelectorPromptID_OutputExample, p_ValidationBehavior => p_MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, p_MaxRetries => p_MJAIPrompts_ResultSelectorPromptID_MaxRetries, p_RetryDelayMS => p_MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, p_RetryStrategy => p_MJAIPrompts_ResultSelectorPromptID_RetryStrategy, p_ResultSelectorPromptID_Clear => 1, p_ResultSelectorPromptID => p_MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, p_EnableCaching => p_MJAIPrompts_ResultSelectorPromptID_EnableCaching, p_CacheTTLSeconds => p_MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, p_CacheMatchType => p_MJAIPrompts_ResultSelectorPromptID_CacheMatchType, p_CacheSimilarityThreshold => p_MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, p_CacheMustMatchModel => p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, p_CacheMustMatchVendor => p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, p_CacheMustMatchAgent => p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, p_CacheMustMatchConfig => p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, p_PromptRole => p_MJAIPrompts_ResultSelectorPromptID_PromptRole, p_PromptPosition => p_MJAIPrompts_ResultSelectorPromptID_PromptPosition, p_Temperature => p_MJAIPrompts_ResultSelectorPromptID_Temperature, p_TopP => p_MJAIPrompts_ResultSelectorPromptID_TopP, p_TopK => p_MJAIPrompts_ResultSelectorPromptID_TopK, p_MinP => p_MJAIPrompts_ResultSelectorPromptID_MinP, p_FrequencyPenalty => p_MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, p_PresencePenalty => p_MJAIPrompts_ResultSelectorPromptID_PresencePenalty, p_Seed => p_MJAIPrompts_ResultSelectorPromptID_Seed, p_StopSequences => p_MJAIPrompts_ResultSelectorPromptID_StopSequences, p_IncludeLogProbs => p_MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, p_TopLogProbs => p_MJAIPrompts_ResultSelectorPromptID_TopLogProbs, p_FailoverStrategy => p_MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, p_FailoverMaxAttempts => p_MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, p_FailoverDelaySeconds => p_MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, p_FailoverModelStrategy => p_MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, p_FailoverErrorScope => p_MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, p_EffortLevel => p_MJAIPrompts_ResultSelectorPromptID_EffortLevel, p_AssistantPrefill => p_MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, p_PrefillFallbackMode => p_MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode, p_RequireSpecificModels => p_MJAIPrompts_ResultSelectorPromptID_RequireSpecificModels);

    END LOOP;

    
    -- Cascade delete from AIResultCache using cursor to call spDeleteAIResultCache

    FOR _rec IN SELECT "ID" FROM __mj."AIResultCache" WHERE "AIPromptID" = p_ID
    LOOP
        p_MJAIResultCache_AIPromptIDID := _rec."ID";
        PERFORM __mj."spDeleteAIResultCache"(p_ID => p_MJAIResultCache_AIPromptIDID);
        
    END LOOP;
    
    
    -- Cascade update on EntityDocument using cursor to call spUpdateEntityDocument


    FOR _rec IN SELECT "ID", "Name", "TypeID", "EntityID", "VectorDatabaseID", "Status", "TemplateID", "AIModelID", "PotentialMatchThreshold", "AbsoluteMatchThreshold", "VectorIndexID", "Configuration", "EnableLLMReasoning", "ReasoningMode", "ReasoningThreshold", "ReasoningPromptID", "ReasoningAgentID", "AutomationLevel" FROM __mj."EntityDocument" WHERE "ReasoningPromptID" = p_ID
    LOOP
        p_MJEntityDocuments_ReasoningPromptIDID := _rec."ID";
        p_MJEntityDocuments_ReasoningPromptID_Name := _rec."Name";
        p_MJEntityDocuments_ReasoningPromptID_TypeID := _rec."TypeID";
        p_MJEntityDocuments_ReasoningPromptID_EntityID := _rec."EntityID";
        p_MJEntityDocuments_ReasoningPromptID_VectorDatabaseID := _rec."VectorDatabaseID";
        p_MJEntityDocuments_ReasoningPromptID_Status := _rec."Status";
        p_MJEntityDocuments_ReasoningPromptID_TemplateID := _rec."TemplateID";
        p_MJEntityDocuments_ReasoningPromptID_AIModelID := _rec."AIModelID";
        p_MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold := _rec."PotentialMatchThreshold";
        p_MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold := _rec."AbsoluteMatchThreshold";
        p_MJEntityDocuments_ReasoningPromptID_VectorIndexID := _rec."VectorIndexID";
        p_MJEntityDocuments_ReasoningPromptID_Configuration := _rec."Configuration";
        p_MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning := _rec."EnableLLMReasoning";
        p_MJEntityDocuments_ReasoningPromptID_ReasoningMode := _rec."ReasoningMode";
        p_MJEntityDocuments_ReasoningPromptID_ReasoningThreshold := _rec."ReasoningThreshold";
        p_MJEntityDocuments_ReasoningPromptID_ReasoningPromptID := _rec."ReasoningPromptID";
        p_MJEntityDocuments_ReasoningPromptID_ReasoningAgentID := _rec."ReasoningAgentID";
        p_MJEntityDocuments_ReasoningPromptID_AutomationLevel := _rec."AutomationLevel";
        -- Set the FK field to NULL
        p_MJEntityDocuments_ReasoningPromptID_ReasoningPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateEntityDocument"(p_ID => p_MJEntityDocuments_ReasoningPromptIDID, p_Name => p_MJEntityDocuments_ReasoningPromptID_Name, p_TypeID => p_MJEntityDocuments_ReasoningPromptID_TypeID, p_EntityID => p_MJEntityDocuments_ReasoningPromptID_EntityID, p_VectorDatabaseID => p_MJEntityDocuments_ReasoningPromptID_VectorDatabaseID, p_Status => p_MJEntityDocuments_ReasoningPromptID_Status, p_TemplateID => p_MJEntityDocuments_ReasoningPromptID_TemplateID, p_AIModelID => p_MJEntityDocuments_ReasoningPromptID_AIModelID, p_PotentialMatchThreshold => p_MJEntityDocuments_ReasoningPromptID_PotentialMatchThreshold, p_AbsoluteMatchThreshold => p_MJEntityDocuments_ReasoningPromptID_AbsoluteMatchThreshold, p_VectorIndexID => p_MJEntityDocuments_ReasoningPromptID_VectorIndexID, p_Configuration => p_MJEntityDocuments_ReasoningPromptID_Configuration, p_EnableLLMReasoning => p_MJEntityDocuments_ReasoningPromptID_EnableLLMReasoning, p_ReasoningMode => p_MJEntityDocuments_ReasoningPromptID_ReasoningMode, p_ReasoningThreshold => p_MJEntityDocuments_ReasoningPromptID_ReasoningThreshold, p_ReasoningPromptID_Clear => 1, p_ReasoningPromptID => p_MJEntityDocuments_ReasoningPromptID_ReasoningPromptID, p_ReasoningAgentID => p_MJEntityDocuments_ReasoningPromptID_ReasoningAgentID, p_AutomationLevel => p_MJEntityDocuments_ReasoningPromptID_AutomationLevel);

    END LOOP;

    
    -- Cascade update on RecordProcess using cursor to call spUpdateRecordProcess


    FOR _rec IN SELECT "ID", "Name", "Description", "CategoryID", "EntityID", "Status", "WorkType", "ActionID", "AgentID", "PromptID", "ScopeType", "ScopeViewID", "ScopeListID", "ScopeFilter", "OnChangeEnabled", "OnChangeInvocationType", "OnChangeFilter", "ScheduleEnabled", "CronExpression", "Timezone", "OnDemandEnabled", "InputMapping", "OutputMapping", "SkipUnchanged", "WatermarkStrategy", "BatchSize", "MaxConcurrency", "Configuration" FROM __mj."RecordProcess" WHERE "PromptID" = p_ID
    LOOP
        p_MJRecordProcesses_PromptIDID := _rec."ID";
        p_MJRecordProcesses_PromptID_Name := _rec."Name";
        p_MJRecordProcesses_PromptID_Description := _rec."Description";
        p_MJRecordProcesses_PromptID_CategoryID := _rec."CategoryID";
        p_MJRecordProcesses_PromptID_EntityID := _rec."EntityID";
        p_MJRecordProcesses_PromptID_Status := _rec."Status";
        p_MJRecordProcesses_PromptID_WorkType := _rec."WorkType";
        p_MJRecordProcesses_PromptID_ActionID := _rec."ActionID";
        p_MJRecordProcesses_PromptID_AgentID := _rec."AgentID";
        p_MJRecordProcesses_PromptID_PromptID := _rec."PromptID";
        p_MJRecordProcesses_PromptID_ScopeType := _rec."ScopeType";
        p_MJRecordProcesses_PromptID_ScopeViewID := _rec."ScopeViewID";
        p_MJRecordProcesses_PromptID_ScopeListID := _rec."ScopeListID";
        p_MJRecordProcesses_PromptID_ScopeFilter := _rec."ScopeFilter";
        p_MJRecordProcesses_PromptID_OnChangeEnabled := _rec."OnChangeEnabled";
        p_MJRecordProcesses_PromptID_OnChangeInvocationType := _rec."OnChangeInvocationType";
        p_MJRecordProcesses_PromptID_OnChangeFilter := _rec."OnChangeFilter";
        p_MJRecordProcesses_PromptID_ScheduleEnabled := _rec."ScheduleEnabled";
        p_MJRecordProcesses_PromptID_CronExpression := _rec."CronExpression";
        p_MJRecordProcesses_PromptID_Timezone := _rec."Timezone";
        p_MJRecordProcesses_PromptID_OnDemandEnabled := _rec."OnDemandEnabled";
        p_MJRecordProcesses_PromptID_InputMapping := _rec."InputMapping";
        p_MJRecordProcesses_PromptID_OutputMapping := _rec."OutputMapping";
        p_MJRecordProcesses_PromptID_SkipUnchanged := _rec."SkipUnchanged";
        p_MJRecordProcesses_PromptID_WatermarkStrategy := _rec."WatermarkStrategy";
        p_MJRecordProcesses_PromptID_BatchSize := _rec."BatchSize";
        p_MJRecordProcesses_PromptID_MaxConcurrency := _rec."MaxConcurrency";
        p_MJRecordProcesses_PromptID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJRecordProcesses_PromptID_PromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateRecordProcess"(p_ID => p_MJRecordProcesses_PromptIDID, p_Name => p_MJRecordProcesses_PromptID_Name, p_Description => p_MJRecordProcesses_PromptID_Description, p_CategoryID => p_MJRecordProcesses_PromptID_CategoryID, p_EntityID => p_MJRecordProcesses_PromptID_EntityID, p_Status => p_MJRecordProcesses_PromptID_Status, p_WorkType => p_MJRecordProcesses_PromptID_WorkType, p_ActionID => p_MJRecordProcesses_PromptID_ActionID, p_AgentID => p_MJRecordProcesses_PromptID_AgentID, p_PromptID_Clear => 1, p_PromptID => p_MJRecordProcesses_PromptID_PromptID, p_ScopeType => p_MJRecordProcesses_PromptID_ScopeType, p_ScopeViewID => p_MJRecordProcesses_PromptID_ScopeViewID, p_ScopeListID => p_MJRecordProcesses_PromptID_ScopeListID, p_ScopeFilter => p_MJRecordProcesses_PromptID_ScopeFilter, p_OnChangeEnabled => p_MJRecordProcesses_PromptID_OnChangeEnabled, p_OnChangeInvocationType => p_MJRecordProcesses_PromptID_OnChangeInvocationType, p_OnChangeFilter => p_MJRecordProcesses_PromptID_OnChangeFilter, p_ScheduleEnabled => p_MJRecordProcesses_PromptID_ScheduleEnabled, p_CronExpression => p_MJRecordProcesses_PromptID_CronExpression, p_Timezone => p_MJRecordProcesses_PromptID_Timezone, p_OnDemandEnabled => p_MJRecordProcesses_PromptID_OnDemandEnabled, p_InputMapping => p_MJRecordProcesses_PromptID_InputMapping, p_OutputMapping => p_MJRecordProcesses_PromptID_OutputMapping, p_SkipUnchanged => p_MJRecordProcesses_PromptID_SkipUnchanged, p_WatermarkStrategy => p_MJRecordProcesses_PromptID_WatermarkStrategy, p_BatchSize => p_MJRecordProcesses_PromptID_BatchSize, p_MaxConcurrency => p_MJRecordProcesses_PromptID_MaxConcurrency, p_Configuration => p_MJRecordProcesses_PromptID_Configuration);

    END LOOP;

    
    -- Cascade delete from ScopedPromptConfig using cursor to call spDeleteScopedPromptConfig

    FOR _rec IN SELECT "ID" FROM __mj."ScopedPromptConfig" WHERE "PromptID" = p_ID
    LOOP
        p_MJScopedPromptConfigs_PromptIDID := _rec."ID";
        PERFORM __mj."spDeleteScopedPromptConfig"(p_ID => p_MJScopedPromptConfigs_PromptIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ScopedPromptPart using cursor to call spDeleteScopedPromptPart

    FOR _rec IN SELECT "ID" FROM __mj."ScopedPromptPart" WHERE "PromptID" = p_ID
    LOOP
        p_MJScopedPromptParts_PromptIDID := _rec."ID";
        PERFORM __mj."spDeleteScopedPromptPart"(p_ID => p_MJScopedPromptParts_PromptIDID);
        
    END LOOP;
    
    

    DELETE FROM
        __mj."AIPrompt"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;


-- ===================== Triggers =====================

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIAgentType_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIAgentType" ON __mj."AIAgentType";
CREATE TRIGGER "trgUpdateAIAgentType"
    BEFORE UPDATE ON __mj."AIAgentType"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIAgentType_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateConversationDetail_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateConversationDetail" ON __mj."ConversationDetail";
CREATE TRIGGER "trgUpdateConversationDetail"
    BEFORE UPDATE ON __mj."ConversationDetail"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateConversationDetail_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIAgent_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIAgent" ON __mj."AIAgent";
CREATE TRIGGER "trgUpdateAIAgent"
    BEFORE UPDATE ON __mj."AIAgent"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIAgent_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- Backfill Sequence for all existing rows, ordered by creation time within each conversation.
WITH numbered AS (
    SELECT "ID",
           ROW_NUMBER() OVER (PARTITION BY "ConversationID"
                              ORDER BY "__mj_CreatedAt" ASC, "ID" ASC) AS rn
    FROM __mj."ConversationDetail"
)
UPDATE __mj."ConversationDetail" AS cd
    SET "Sequence" = numbered.rn
FROM
	numbered
WHERE
	numbered."ID" = cd."ID";

-- Now that every row has a value, enforce NOT NULL and provide a DEFAULT (0) so inserts
-- satisfy the constraint before the AFTER-INSERT trigger overwrites it with the real value.
ALTER TABLE __mj."ConversationDetail"
    ALTER COLUMN "Sequence" SET NOT NULL;

ALTER TABLE __mj."ConversationDetail"
  ALTER COLUMN "Sequence" SET DEFAULT 0;

DO $mj$
DECLARE
  v_ConstraintName VARCHAR(200);
BEGIN
  -- =====================================================================================
  -- 4. AIAgentRunStep.StepType : add 'Compaction'
  -- =====================================================================================
  -- Drop existing CHECK constraint (name varies by environment), then re-add widened.
  SELECT con.conname INTO v_ConstraintName FROM pg_constraint con
  JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = any(con.conkey)
  WHERE con.conrelid = '__mj."AIAgentRunStep"'::regclass
  AND a.attname = 'StepType'
  AND con.contype = 'c';
  IF v_ConstraintName IS NOT NULL THEN
  EXECUTE format('ALTER TABLE __mj."AIAgentRunStep" DROP CONSTRAINT %I', v_ConstraintName);
  RAISE NOTICE '%', 'Dropped existing StepType check constraint: ' || v_ConstraintName;
  END IF;
END $mj$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '03b2dcaa-9fff-4a88-babf-1fb41085cfb1' OR ("EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'ContextWindowMaxTokens')
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
        '03b2dcaa-9fff-4a88-babf-1fb41085cfb1',
        'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- "Entity": "MJ": "AI" "Agents"
        100170,
        'ContextWindowMaxTokens',
        'Context Window Max Tokens',
        'Per-agent override for the effective working-context budget, in tokens. Null inherits the agent type''s value (which, if also null, falls back to the selected model''s MaxInputTokens). The resolved value is clamped to the model''s limit at runtime.',
        'INTEGER',
        4,
        10,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ecd9e558-9503-402e-b1bb-553c423df7c8' OR ("EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'CompactionTriggerPercent')
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
        'ecd9e558-9503-402e-b1bb-553c423df7c8',
        'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- "Entity": "MJ": "AI" "Agents"
        100171,
        'CompactionTriggerPercent',
        'Compaction Trigger Percent',
        'Per-agent override for the cross-turn compaction trigger percentage. Null inherits the agent type''s value.',
        'INTEGER',
        4,
        10,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '743cb348-e133-474d-a915-dcf6cd212f60' OR ("EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'CompactionTargetPercent')
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
        '743cb348-e133-474d-a915-dcf6cd212f60',
        'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- "Entity": "MJ": "AI" "Agents"
        100172,
        'CompactionTargetPercent',
        'Compaction Target Percent',
        'Per-agent override for the cross-turn compaction target percentage. Null inherits the agent type''s value.',
        'INTEGER',
        4,
        10,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c0ca3839-427c-4003-afd7-6354086172ad' OR ("EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'ConversationSummaryPromptID')
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
        'c0ca3839-427c-4003-afd7-6354086172ad',
        'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- "Entity": "MJ": "AI" "Agents"
        100173,
        'ConversationSummaryPromptID',
        'Conversation Summary Prompt ID',
        'Per-agent override for the cross-turn conversation compaction prompt. Null inherits the agent type''s value.',
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
        '73AD0238-8B56-EF11-991A-6045BDEBA539',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '74aea67c-46e4-4d81-b63f-11fc077e4249' OR ("EntityID" = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND "Name" = 'ContextCompressionMessageThreshold')
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
        '74aea67c-46e4-4d81-b63f-11fc077e4249',
        '65CDC348-C4A6-4D00-A57B-2D489C56F128', -- "Entity": "MJ": "AI" "Agent" "Types"
        100044,
        'ContextCompressionMessageThreshold',
        'Context Compression Message Threshold',
        'Type-level default for the in-turn context-compression message-count threshold. Overridable per agent via AIAgent.ContextCompressionMessageThreshold.',
        'INTEGER',
        4,
        10,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1e82d32e-0170-4cee-8e95-45233138a6d1' OR ("EntityID" = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND "Name" = 'ContextCompressionPromptID')
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
        '1e82d32e-0170-4cee-8e95-45233138a6d1',
        '65CDC348-C4A6-4D00-A57B-2D489C56F128', -- "Entity": "MJ": "AI" "Agent" "Types"
        100045,
        'ContextCompressionPromptID',
        'Context Compression Prompt ID',
        'Type-level default prompt used for in-turn context compression. Overridable per agent via AIAgent.ContextCompressionPromptID.',
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
        '73AD0238-8B56-EF11-991A-6045BDEBA539',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '94f31456-c45f-4517-a4f8-81c0964a5db1' OR ("EntityID" = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND "Name" = 'ContextCompressionMessageRetentionCount')
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
        '94f31456-c45f-4517-a4f8-81c0964a5db1',
        '65CDC348-C4A6-4D00-A57B-2D489C56F128', -- "Entity": "MJ": "AI" "Agent" "Types"
        100046,
        'ContextCompressionMessageRetentionCount',
        'Context Compression Message Retention Count',
        'Type-level default for the number of most-recent messages kept uncompressed (the "hot tail") when context compression is applied. Overridable per agent via AIAgent.ContextCompressionMessageRetentionCount.',
        'INTEGER',
        4,
        10,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6cb241d0-437f-4fec-9ba2-9db1131c59f6' OR ("EntityID" = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND "Name" = 'ContextWindowMaxTokens')
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
        '6cb241d0-437f-4fec-9ba2-9db1131c59f6',
        '65CDC348-C4A6-4D00-A57B-2D489C56F128', -- "Entity": "MJ": "AI" "Agent" "Types"
        100047,
        'ContextWindowMaxTokens',
        'Context Window Max Tokens',
        'Type-level default effective working-context budget, in tokens. Null means use the selected model''s MaxInputTokens. The resolved value is clamped to the model''s limit at runtime (a warning is logged if it would exceed it). Overridable per agent via AIAgent.ContextWindowMaxTokens.',
        'INTEGER',
        4,
        10,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'be42811a-7c55-4c1e-a654-f7812897b633' OR ("EntityID" = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND "Name" = 'CompactionTriggerPercent')
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
        'be42811a-7c55-4c1e-a654-f7812897b633',
        '65CDC348-C4A6-4D00-A57B-2D489C56F128', -- "Entity": "MJ": "AI" "Agent" "Types"
        100048,
        'CompactionTriggerPercent',
        'Compaction Trigger Percent',
        'Type-level default: the percentage of the effective context budget at which cross-turn conversation compaction is triggered. Defaults to 75. Overridable per agent via AIAgent.CompactionTriggerPercent.',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(75)',
        FALSE,
        TRUE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '88e226af-5bb9-4e4d-baeb-642443bcf85e' OR ("EntityID" = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND "Name" = 'CompactionTargetPercent')
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
        '88e226af-5bb9-4e4d-baeb-642443bcf85e',
        '65CDC348-C4A6-4D00-A57B-2D489C56F128', -- "Entity": "MJ": "AI" "Agent" "Types"
        100049,
        'CompactionTargetPercent',
        'Compaction Target Percent',
        'Type-level default: the target percentage of the effective context budget to reduce to after a cross-turn compaction. Defaults to 30. Overridable per agent via AIAgent.CompactionTargetPercent.',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(30)',
        FALSE,
        TRUE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '51e3a46c-0f14-45bd-b607-42ccb658a60f' OR ("EntityID" = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND "Name" = 'ConversationSummaryPromptID')
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
        '51e3a46c-0f14-45bd-b607-42ccb658a60f',
        '65CDC348-C4A6-4D00-A57B-2D489C56F128', -- "Entity": "MJ": "AI" "Agent" "Types"
        100050,
        'ConversationSummaryPromptID',
        'Conversation Summary Prompt ID',
        'Type-level default prompt used for cross-turn conversation compaction (the durable summary baseline). Distinct from ContextCompressionPromptID, which governs in-turn compression. Overridable per agent via AIAgent.ConversationSummaryPromptID.',
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
        '73AD0238-8B56-EF11-991A-6045BDEBA539',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'bc484d90-8cb0-4568-8f0d-e02713dff744' OR ("EntityID" = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Sequence')
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
        'bc484d90-8cb0-4568-8f0d-e02713dff744',
        '12248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Conversation" "Details"
        100075,
        'Sequence',
        'Sequence',
        'Monotonic, per-conversation ordinal assigned on insert (1-based). Provides a stable symbolic handle used by conversation-history retrieval tools and by the sequence markers embedded in compaction summaries. A summary stored in SummaryOfEarlierConversation on a given row covers all rows with a lower Sequence in the same conversation.',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3cdfa3a7-9e68-42ca-845d-de71b0f29988' OR ("EntityID" = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SummaryPromptRunID')
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
        '3cdfa3a7-9e68-42ca-845d-de71b0f29988',
        '12248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Conversation" "Details"
        100076,
        'SummaryPromptRunID',
        'Summary Prompt Run ID',
        'When SummaryOfEarlierConversation is populated by a cross-turn compaction, this links to the AIPromptRun that produced it (model, tokens, cost, prompt version). Null for ordinary (non-summary) rows.',
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
        '7C1C98D0-3978-4CE8-8E3F-C90301E59767',
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

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('f74c6369-8078-4559-b759-646e3875d564', 'B04A327B-55BF-4914-9DCF-3552A5DD0293', 3, 'Compaction', 'Compaction', NOW(), NOW());

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=4 WHERE "ID"='09D69AEB-989E-4098-AA96-DE34E06A8486';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=5 WHERE "ID"='25F32577-92F9-4EDD-8824-C5F7A9FDA8B9';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=6 WHERE "ID"='6B6811BD-344F-4805-A13A-94076410C986';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=7 WHERE "ID"='B4FDC768-5F15-4720-B9EA-FB39634AFEF9';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=8 WHERE "ID"='903515EF-293D-4186-8FA1-95AC7A83F5AB';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=9 WHERE "ID"='B1115D73-2524-4329-B202-B6D453DE8FA9';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=10 WHERE "ID"='BA69DCBC-B743-4DED-930D-6F0DB4E8C01E';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=11 WHERE "ID"='61F9CF39-ECB3-4476-9AFC-7F037F5EB34E';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=12 WHERE "ID"='5E90D638-0329-4FF7-BA05-B38037474BF5';


/* Create Entity Relationship: MJ: AI Prompts -> MJ: AI Agents (One To Many via ConversationSummaryPromptID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '67abb937-2b1f-4b6c-a4cb-4541a1a8432e'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('67abb937-2b1f-4b6c-a4cb-4541a1a8432e', '73AD0238-8B56-EF11-991A-6045BDEBA539', 'CDB135CC-6D3C-480B-90AE-25B7805F82C1', 'ConversationSummaryPromptID', 'One To Many', TRUE, TRUE, 19, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '6c6da859-6cdb-46db-8782-254c2e7d626d'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('6c6da859-6cdb-46db-8782-254c2e7d626d', '73AD0238-8B56-EF11-991A-6045BDEBA539', '65CDC348-C4A6-4D00-A57B-2D489C56F128', 'ContextCompressionPromptID', 'One To Many', TRUE, TRUE, 20, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'bcc04b45-03e8-496c-8f67-2d35d0371b9d'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('bcc04b45-03e8-496c-8f67-2d35d0371b9d', '73AD0238-8B56-EF11-991A-6045BDEBA539', '65CDC348-C4A6-4D00-A57B-2D489C56F128', 'ConversationSummaryPromptID', 'One To Many', TRUE, TRUE, 21, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '02b70fe0-9d31-4d66-b8c4-a1ee87403c7f'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('02b70fe0-9d31-4d66-b8c4-a1ee87403c7f', '7C1C98D0-3978-4CE8-8E3F-C90301E59767', '12248F34-2837-EF11-86D4-6045BDEE16E6', 'SummaryPromptRunID', 'One To Many', TRUE, TRUE, 9, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2758fc37-4c31-4f7a-a25d-a12efaa47ce7' OR ("EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'ConversationSummaryPrompt')
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
        '2758fc37-4c31-4f7a-a25d-a12efaa47ce7',
        'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- "Entity": "MJ": "AI" "Agents"
        100185,
        'ConversationSummaryPrompt',
        'Conversation Summary Prompt',
        NULL,
        'TEXT',
        510,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b7c99603-eb0c-4572-b35f-de9ea58f9e3a' OR ("EntityID" = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND "Name" = 'ContextCompressionPrompt')
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
        'b7c99603-eb0c-4572-b35f-de9ea58f9e3a',
        '65CDC348-C4A6-4D00-A57B-2D489C56F128', -- "Entity": "MJ": "AI" "Agent" "Types"
        100053,
        'ContextCompressionPrompt',
        'Context Compression Prompt',
        NULL,
        'TEXT',
        510,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1b1beb44-c67e-418d-bf6f-2a2acf9bf89b' OR ("EntityID" = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND "Name" = 'ConversationSummaryPrompt')
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
        '1b1beb44-c67e-418d-bf6f-2a2acf9bf89b',
        '65CDC348-C4A6-4D00-A57B-2D489C56F128', -- "Entity": "MJ": "AI" "Agent" "Types"
        100054,
        'ConversationSummaryPrompt',
        'Conversation Summary Prompt',
        NULL,
        'TEXT',
        510,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1592382d-5b9c-4383-b98f-1e61d2df7971' OR ("EntityID" = '12248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SummaryPromptRun')
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
        '1592382d-5b9c-4383-b98f-1e61d2df7971',
        '12248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Conversation" "Details"
        100084,
        'SummaryPromptRun',
        'Summary Prompt Run',
        NULL,
        'TEXT',
        510,
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

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '64FAC701-8AB3-43C0-B741-71252122E8B0'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'B098B41F-7953-473E-8257-DB6BFFEF48A0'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 28 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Types.ID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5BDF7CC2-8BB6-4B10-A69B-F5C4EF647FAF' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.Name

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5C0C0D1C-4B14-417E-9280-B4545A8AF1EF' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.Description

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0C6E768F-C587-4538-BC48-C869854F3A18' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.SystemPromptID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '24424A6A-C0E3-4DB0-9AF1-551D12AE7E10' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.AgentPromptPlaceholder

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '47FCBE6A-43EA-47FA-912B-ACB82A311471' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.PromptParamsSchema

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Prompt Params Schema',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '41DA3898-26C0-4AE9-B934-84EA97C726B7' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.SystemPrompt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'System Prompt',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '200792E6-E7EC-4293-A821-77B42A49DAB5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.IsActive

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Active',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '980B9BE8-5C4E-45A4-BE62-32874A339AF6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.DriverClass

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DB83502E-F00C-4CF8-AD0E-FFE9BF3C8904' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.UIFormSectionKey

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7763B64B-E410-4247-89DE-5E9E565F15A0' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.UIFormKey

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FAC68362-126A-4F7E-B706-8DD7B40897A1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.UIFormSectionExpandedByDefault

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DA3D74E3-D1A2-4932-A1FB-4219F3BE1CC9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.AssignmentStrategy

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '27C830A6-A889-4A9C-908C-33BB7A6CDB37' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.ConfigSchema

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Config Schema',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A1045C5B-01CE-47D7-8738-ED980447B714' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.DefaultConfiguration

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FD82EBC4-4921-4C5B-A0A8-A8F0A50201CA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7A190481-BB1D-4B6D-8EA1-E554E56B83B9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4AEB4F4F-664A-409A-AD4E-FD96800BF5FF' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.DefaultStorageAccountID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Default Storage Account ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6B31A64B-6BD8-446B-B306-0BDD65645694' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.DefaultStorageAccount

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Default Storage Account',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BC5FC66F-CDED-4316-8E1A-F0B3F0577F3D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.ContextCompressionMessageThreshold

UPDATE __mj."EntityField"
SET 
   "Category" = 'Context Management',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '74AEA67C-46E4-4D81-B63F-11FC077E4249' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.ContextCompressionPromptID

UPDATE __mj."EntityField"
SET 
   "Category" = 'Context Management',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1E82D32E-0170-4CEE-8E95-45233138A6D1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.ContextCompressionMessageRetentionCount

UPDATE __mj."EntityField"
SET 
   "Category" = 'Context Management',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '94F31456-C45F-4517-A4F8-81C0964A5DB1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.ContextWindowMaxTokens

UPDATE __mj."EntityField"
SET 
   "Category" = 'Context Management',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6CB241D0-437F-4FEC-9BA2-9DB1131C59F6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.CompactionTriggerPercent

UPDATE __mj."EntityField"
SET 
   "Category" = 'Context Management',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BE42811A-7C55-4C1E-A654-F7812897B633' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.CompactionTargetPercent

UPDATE __mj."EntityField"
SET 
   "Category" = 'Context Management',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '88E226AF-5BB9-4E4D-BAEB-642443BCF85E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.ConversationSummaryPromptID

UPDATE __mj."EntityField"
SET 
   "Category" = 'Context Management',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '51E3A46C-0F14-45BD-B607-42CCB658A60F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.ContextCompressionPrompt

UPDATE __mj."EntityField"
SET 
   "Category" = 'Context Management',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B7C99603-EB0C-4572-B35F-DE9EA58F9E3A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Types.ConversationSummaryPrompt

UPDATE __mj."EntityField"
SET 
   "Category" = 'Context Management',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1B1BEB44-C67E-418D-BF6F-2A2ACF9BF89B' AND "AutoUpdateCategory" = TRUE;

/* Update FieldCategoryInfo setting for entity */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Context Management":{"icon":"fa fa-sliders-h","description":"Settings that control context compression, token budgets, and conversation summarisation for the agent type"}}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND "Name" = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Context Management":"fa fa-sliders-h"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = '65CDC348-C4A6-4D00-A57B-2D489C56F128' AND "Name" = 'FieldCategoryIcons';

/* Set categories for 43 fields */

-- UPDATE Entity Field Category Info MJ: Conversation Details.ID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0B4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ConversationID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0C4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ExternalID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0D4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.Role

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '124E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.Message

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '134E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.Error

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0E4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.HiddenToUser

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Hidden To User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7E4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '695817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.UserRating

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'ACAB0610-A4EA-433B-A39A-C2D6EFB46F59' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.UserFeedback

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C400A5F2-1BE3-4441-AEFA-06344A12AAB2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ReflectionInsights

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E69363F6-164F-41B8-B521-889B56493CE9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.SummaryOfEarlierConversation

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Summary Of Earlier Conversation',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '21B640E1-D21E-4E4B-95BC-E9862FD11C8A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.UserID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '68EA370B-0AB9-45AF-A1EC-88A94329A3A2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ArtifactID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Artifact',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E9AB7E01-35D5-4FDB-8C61-24292B0F0A19' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ArtifactVersionID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Artifact Version',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'ABF64F53-7927-4039-B5B8-DC07E8435B36' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.CompletionTime

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Completion Time',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '55E7C54B-74F7-4E25-BF60-A79C28AD2410' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.IsPinned

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D04D36AE-BCB4-4DF2-8BB7-0ED3567FACF2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ParentID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Parent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '14488A57-7BC6-455F-88DF-2264585DA63F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.AgentID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Agent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8BE14CF2-2F23-4208-8313-91259D312DB2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.Status

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '64FAC701-8AB3-43C0-B741-71252122E8B0' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.SuggestedResponses

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '79639F85-7B4A-4ACA-89B3-3D043D0AE9FB' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.TestRunID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Test Run',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B4BAC05B-4345-49B2-97B2-FB761777078D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ResponseForm

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '811099AE-EFF5-4BAE-BFD1-66F68F95C36E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ActionableCommands

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2433C81E-0921-404B-969F-7A37DBF23D4A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.AutomaticCommands

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5D185550-A536-43BD-8A45-1324F35B7BA1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.OriginalMessageChanged

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F99F9670-A9A8-44BE-8F4F-1C3138490591' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.AgentSessionID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Agent Session',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '09433588-7E71-406B-B1B7-5621C66A23E4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.TurnEndedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DEDBD88A-5A3D-43BC-B215-0D23AC93D04A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.UtteranceStartMs

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Utterance Start Ms',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EAFFAE67-4CE7-4F6D-8791-6326B7308A97' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.UtteranceEndMs

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Utterance End Ms',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '73A5C2FD-CBAA-48CE-9B45-A95AEA8FEA1D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.MediaType

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6AF5462A-A664-4779-9AB6-85E466164420' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.Sequence

UPDATE __mj."EntityField"
SET 
   "Category" = 'Message Core',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BC484D90-8CB0-4568-8F0D-E02713DFF744' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.SummaryPromptRunID

UPDATE __mj."EntityField"
SET 
   "Category" = 'Message Core',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Summary Prompt Run',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3CDFA3A7-9E68-42CA-845D-DE71B0F29988' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.Conversation

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6D4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.User

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '50D773C6-6E9F-4C00-AAE3-A284ABE38676' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.Artifact

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D350E5F8-8128-4A32-851E-BA6A227E4D5C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.ArtifactVersion

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D510523A-90B9-4797-B1B9-83B5C16AC117' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.Parent

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6B4B63C2-91A7-4B53-ABAC-E15AA9600FEB' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.Agent

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6C6CC59F-D153-47DB-A664-3C9884B07059' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.TestRun

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '84FA19A3-7667-43C6-9273-070A9A925D7F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.SummaryPromptRun

UPDATE __mj."EntityField"
SET 
   "Category" = 'Message Core',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1592382D-5B9C-4383-B98F-1E61D2DF7971' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Conversation Details.RootParentID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Root Parent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4F2FE5B3-6AD4-485C-AEBA-F7060064E62C' AND "AutoUpdateCategory" = TRUE;

/* Set categories for 50 fields */

-- UPDATE Entity Field Category Info MJ: AI Agents.ID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AA64DA98-1DA1-4525-8CC5-BC3E3E4893B6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.Name

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.Description

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6EDC921F-36C4-4739-9F2A-8F9F00E95AE7' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.LogoURL

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'URL',
   "CodeType" = NULL
WHERE 
   "ID" = '77845738-5781-458B-AD3C-5DAE745373C2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.TypeID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '91CA077D-3F59-48E1-A593-AF8686276115' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.Status

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.DriverClass

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BB9AD9CB-40C0-41F1-B54B-750C844FD41B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.IconClass

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E3E05E29-CDAF-4BFE-9FC8-4450EEBE05E5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.ModelSelectionMode

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FEEBD49D-5572-45D7-9F1E-08AE762F41D9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultArtifactTypeID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F58EA638-CE95-4D2A-9095-9909149B83C7' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.OwnerUserID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Owner User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '261B4D18-464B-4AD9-9FFD-EA8B70C576D8' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.ArtifactCreationMode

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4371BED0-7C4A-4D24-9E07-17E15D617607' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.FunctionalRequirements

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F613597C-C38F-4D71-B64A-8BBCFD87D8CC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.TechnicalDesign

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CAEA2872-B089-4192-8FA8-1737FF357FFD' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.IsRestricted

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E5B17B79-282F-4F19-9656-246DE119D588' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.AgentTypePromptParams

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Agent Type Prompt Params',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FD515BF1-7E8A-4CB0-A8CE-D5C0C8C132D7' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.CategoryID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7DCA7B3C-9A81-4D32-AF2E-5EA32B22D988' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.Type

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.DefaultArtifactType

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Default Artifact Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6C1C76DF-BBFF-4903-9BB9-3325B5ABB4B1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.OwnerUser

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Owner User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B098B41F-7953-473E-8257-DB6BFFEF48A0' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.Category

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6517DB09-A12E-4F1B-95B6-0B0A92918A1D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '353D4710-73B2-4AF5-8A93-9DC1F47FF6E5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3177830D-10A0-4003-B95D-8514974BA846' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.ParentID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Parent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A6F8773F-4021-45DD-B142-9BFE4F67EC87' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.ExposeAsAction

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DF61AC7C-79A7-4058-96A1-85EBA9339D45' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.ExecutionOrder

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '090830CE-4073-486C-BBF2-E2105BEADD91' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.ExecutionMode

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8261D630-2560-4C03-BE14-C8A9682ABBB4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.InvocationMode

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.Parent

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Parent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '52E74C81-D246-4B52-B7A7-91757C299671' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.RootParentID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Root Parent ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '644AA4B2-1044-430C-BCBA-245644294E02' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.RootDefaultCoAgentID

UPDATE __mj."EntityField"
SET 
   "Category" = 'Hierarchy & Invocation',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Root Default Co‑Agent ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1861E78B-4306-44CA-8E62-70991A1F58CA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.EnableContextCompression

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '09AFE563-63E3-4F2B-B6F1-5945432FF07B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionMessageThreshold

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Context Compression Message Threshold',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '451D5C8F-6749-4789-A158-658B38A74AE4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionPromptID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Context Compression Prompt ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FFD209C5-48F3-45D1-9094-E76EC832EA07' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionMessageRetentionCount

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Context Compression Message Retention Count',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '73A50D68-976F-49A7-9737-12D1D26C6011' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.ContextCompressionPrompt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Context Compression Prompt',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AD36EF69-1494-409C-A97E-FE73669DD28A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.PayloadDownstreamPaths

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Payload Downstream Paths',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '85B6AA86-796D-4970-9E35-5A483498B517' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.PayloadUpstreamPaths

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Payload Upstream Paths',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DA784B76-66CD-434B-90BD-DEC808917E68' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.PayloadSelfReadPaths

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Payload Self Read Paths',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EBF3B958-F07C-420B-82BE-2CB1E396A0F5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.PayloadSelfWritePaths

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Payload Self Write Paths',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '61E51FC3-8EFA-40D9-9525-F3FAD0A95DCA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.PayloadScope

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2E542986-0164-4B9E-8457-06826A4AB892' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.FinalPayloadValidation

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1C7959AE-F48B-4858-8383-28C3F4706314' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.FinalPayloadValidationMode

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Final Payload Validation Mode',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8931DE12-4048-4DEB-A2A3-E821354CFFB2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.FinalPayloadValidationMaxRetries

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Final Payload Validation Max Retries',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AF62DAAB-74D4-4539-9B47-58DD4A023E4B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.StartingPayloadValidation

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B7A2371C-A22C-48EA-827E-824F8A40DA3D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.StartingPayloadValidationMode

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Starting Payload Validation Mode',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0947203D-A5CA-4ED2-895B-17A8007323FC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.InjectNotes

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '37E075BD-CC4B-4AE1-8D12-7EC45B663F69' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.MaxNotesToInject

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A8DA4C67-B2F7-4C1D-8522-A2B5B4BADA21' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.NoteInjectionStrategy

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F5F6BE87-06F4-404D-A1C3-B315C562C32B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents.InjectExamples

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1C9957C7-A851-4C05-83B3-F49A5FC3FE4D' AND "AutoUpdateCategory" = TRUE;


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

-- FK: SummaryPromptRunID -> AIPromptRun
ALTER TABLE __mj."ConversationDetail"
 ADD CONSTRAINT "FK_ConversationDetail_SummaryPromptRun"
        FOREIGN KEY ("SummaryPromptRunID")
        REFERENCES __mj."AIPromptRun"("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE __mj."AIAgentType"
 ADD CONSTRAINT "FK_AIAgentType_ContextCompressionPrompt"
        FOREIGN KEY ("ContextCompressionPromptID")
        REFERENCES __mj."AIPrompt"("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE __mj."AIAgentType"
 ADD CONSTRAINT "FK_AIAgentType_ConversationSummaryPrompt"
        FOREIGN KEY ("ConversationSummaryPromptID")
        REFERENCES __mj."AIPrompt"("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE __mj."AIAgent"
 ADD CONSTRAINT "FK_AIAgent_ConversationSummaryPrompt"
        FOREIGN KEY ("ConversationSummaryPromptID")
        REFERENCES __mj."AIPrompt"("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE __mj."AIAgentRunStep"
 ADD CONSTRAINT "CK_AIAgentRunStep_StepType"
        CHECK ("StepType" IN ('Prompt', 'Actions', 'Sub-Agent', 'Chat', 'Decision', 'Validation', 'ForEach', 'While', 'Tool', 'Plan', 'Skill', 'Compaction')) NOT VALID;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: Permissions for vwAIAgentTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: spCreateAIAgentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Agent Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: spUpdateAIAgentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Types
-- Item: spDeleteAIAgentType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for ConversationDetail */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationID in table ConversationDetail;

DO $$ BEGIN GRANT SELECT ON __mj."vwConversationDetails" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: Permissions for vwConversationDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwConversationDetails" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spCreateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetail" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Conversation Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetail" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spUpdateConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetail" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetail" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversation Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Details
-- Item: spDeleteConversationDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetail" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversation Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetail" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spDeleteAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPromptRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Prompt Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPromptRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversation Artifact Versions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifact Versions
-- Item: spDeleteConversationArtifactVersion
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifactVersion
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationArtifactVersion" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversation Artifact Versions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationArtifactVersion" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversation Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Artifacts
-- Item: spDeleteConversationArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationArtifact
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationArtifact" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversation Artifacts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationArtifact" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversations
-- Item: spDeleteConversation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Conversation
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversation" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversation" TO "cdp_Developer", "cdp_UI", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for AIAgent */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table AIAgent;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgents" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: Permissions for vwAIAgents
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgents" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spCreateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgent
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Agents */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgent" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spUpdateAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgent
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgent" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agents
-- Item: spDeleteAIAgent
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgent
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agents */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgent" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: spDeleteAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPrompt
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPrompt" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Prompts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPrompt" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."ConversationDetail"."Sequence" IS 'Monotonic, per-conversation ordinal assigned on insert (1-based). Provides a stable symbolic handle used by conversation-history retrieval tools and by the sequence markers embedded in compaction summaries. A summary stored in SummaryOfEarlierConversation on a given row covers all rows with a lower Sequence in the same conversation.';

COMMENT ON COLUMN __mj."ConversationDetail"."SummaryPromptRunID" IS 'When SummaryOfEarlierConversation is populated by a cross-turn compaction, this links to the AIPromptRun that produced it (model, tokens, cost, prompt version). Null for ordinary (non-summary) rows.';

COMMENT ON COLUMN __mj."AIAgentType"."ContextCompressionMessageThreshold" IS 'Type-level default for the in-turn context-compression message-count threshold. Overridable per agent via AIAgent.ContextCompressionMessageThreshold.';

COMMENT ON COLUMN __mj."AIAgentType"."ContextCompressionPromptID" IS 'Type-level default prompt used for in-turn context compression. Overridable per agent via AIAgent.ContextCompressionPromptID.';

COMMENT ON COLUMN __mj."AIAgentType"."ContextCompressionMessageRetentionCount" IS 'Type-level default for the number of most-recent messages kept uncompressed (the "hot tail") when context compression is applied. Overridable per agent via AIAgent.ContextCompressionMessageRetentionCount.';

COMMENT ON COLUMN __mj."AIAgentType"."ContextWindowMaxTokens" IS 'Type-level default effective working-context budget, in tokens. Null means use the selected model''s MaxInputTokens. The resolved value is clamped to the model''s limit at runtime (a warning is logged if it would exceed it). Overridable per agent via AIAgent.ContextWindowMaxTokens.';

COMMENT ON COLUMN __mj."AIAgentType"."CompactionTriggerPercent" IS 'Type-level default: the percentage of the effective context budget at which cross-turn conversation compaction is triggered. Defaults to 75. Overridable per agent via AIAgent.CompactionTriggerPercent.';

COMMENT ON COLUMN __mj."AIAgentType"."CompactionTargetPercent" IS 'Type-level default: the target percentage of the effective context budget to reduce to after a cross-turn compaction. Defaults to 30. Overridable per agent via AIAgent.CompactionTargetPercent.';

COMMENT ON COLUMN __mj."AIAgentType"."ConversationSummaryPromptID" IS 'Type-level default prompt used for cross-turn conversation compaction (the durable summary baseline). Distinct from ContextCompressionPromptID, which governs in-turn compression. Overridable per agent via AIAgent.ConversationSummaryPromptID.';

COMMENT ON COLUMN __mj."AIAgent"."ContextWindowMaxTokens" IS 'Per-agent override for the effective working-context budget, in tokens. Null inherits the agent type''s value (which, if also null, falls back to the selected model''s MaxInputTokens). The resolved value is clamped to the model''s limit at runtime.';

COMMENT ON COLUMN __mj."AIAgent"."CompactionTriggerPercent" IS 'Per-agent override for the cross-turn compaction trigger percentage. Null inherits the agent type''s value.';

COMMENT ON COLUMN __mj."AIAgent"."CompactionTargetPercent" IS 'Per-agent override for the cross-turn compaction target percentage. Null inherits the agent type''s value.';

COMMENT ON COLUMN __mj."AIAgent"."ConversationSummaryPromptID" IS 'Per-agent override for the cross-turn conversation compaction prompt. Null inherits the agent type''s value.';


-- ===================== Other =====================

-- =====================================================================================
-- 1b. ConversationDetail : Sequence-assignment trigger
-- =====================================================================================
-- Assigns the next per-conversation Sequence on insert. Handles multi-row inserts and
-- guards the rare concurrent same-conversation insert with UPDLOCK/HOLDLOCK on the read
-- of the current max. Runs AFTER INSERT and overwrites the DEFAULT(0) value.

-- HAND-AUTHORED PG VERSION of the hand-written T-SQL statement-level trigger in the
-- SQL Server migration (the SQLConverter's MigrationSplitter classifies hand-written
-- procedural SQL as needing a human PG version — arbitrary trigger bodies are out of
-- scope for the rule pipeline). Re-apply this block if the file is ever re-converted.
--
-- Semantics parity with the T-SQL AFTER INSERT trigger:
--   * Per-conversation monotonic Sequence = existing MAX + position within the insert.
--     PG uses a BEFORE ROW trigger; for multi-row INSERTs each row's trigger sees rows
--     already inserted by the same statement, yielding the same 1..N batch numbering.
--   * The advisory xact lock on ConversationID serializes concurrent same-conversation
--     inserts — the PG analog of the T-SQL UPDLOCK/HOLDLOCK max-read guard.
--   * Overrides the DEFAULT(0) placeholder value before the row lands.

CREATE OR REPLACE FUNCTION __mj."trgConversationDetail_AssignSequence"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW."ConversationID"::text, 0));
    SELECT COALESCE(MAX("Sequence"), 0) + 1
      INTO NEW."Sequence"
      FROM __mj."ConversationDetail"
     WHERE "ConversationID" = NEW."ConversationID";
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "trgConversationDetail_AssignSequence" ON __mj."ConversationDetail";
CREATE TRIGGER "trgConversationDetail_AssignSequence"
    BEFORE INSERT ON __mj."ConversationDetail"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgConversationDetail_AssignSequence"();

-- =====================================================================================
-- 5. Extended properties (CodeGen reads these for descriptions)
-- =====================================================================================

-- ConversationDetail.Sequence

-- =====================================================================================
-- =====================================================================================
-- =====================================================================================
--
--  EVERYTHING BELOW THIS BLOCK WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL
--  (CodeGen run 2026-07-13 16:37:55, against the schema DDL above).
--
--  Contents: EntityField / EntityFieldValue / EntityRelationship metadata inserts and
--  updates for the new columns; regenerated base views (vwConversationDetails,
--  vwAIAgents, vwAIAgentTypes); regenerated spCreate/spUpdate/spDelete stored
--  procedures for the touched entities (including cascade-delete updates for entities
--  referencing the new foreign keys); permission grants; and extended-property sync.
--
--  DO NOT EDIT THIS SECTION BY HAND. If the hand-written DDL above changes, re-run
--  `mj codegen` and replace this entire generated section with the new output.
--
-- =====================================================================================
-- =====================================================================================
-- =====================================================================================

/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: AI Agent Types */

/* spUpdate Permissions for MJ: Conversation Details */

/* spUpdate Permissions for MJ: AI Agents */
