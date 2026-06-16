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

-- 2. AuthorType: the TYPE of author that created the note (an enum, not a user
--    reference). SourceAIAgentRunID alone can't distinguish written-in-flight-
--    by-agent from extracted-from-a-run-by-MemoryManager (both carry a run ID).
--    Default 'MemoryManager' backfills all legacy rows correctly (every existing
--    auto-generated note came from MM).
ALTER TABLE __mj."AIAgentNote"
 ADD COLUMN IF NOT EXISTS "AuthorType" VARCHAR(20) NOT NULL
    CONSTRAINT DF_AIAgentNote_AuthorType DEFAULT 'MemoryManager'
    CONSTRAINT CK_AIAgentNote_AuthorType CHECK ("AuthorType" IN ('Agent', 'MemoryManager', 'User'));

-- 3. AllowMemoryWrite: per-agent gate for in-flight memory writes, following
--    the InjectNotes gating pattern. ON by default — the Memory Manager already
--    extracts memories for every agent, so direct writes are consistent with
--    that posture; opt OUT for restricted or experimental agents.
ALTER TABLE __mj."AIAgent"
 ADD COLUMN IF NOT EXISTS "AllowMemoryWrite" BOOLEAN NOT NULL
    CONSTRAINT DF_AIAgent_AllowMemoryWrite DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentExample_AgentID" ON __mj."AIAgentExample" ("AgentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentExample_UserID" ON __mj."AIAgentExample" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentExample_CompanyID" ON __mj."AIAgentExample" ("CompanyID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentExample_SourceConversationID" ON __mj."AIAgentExample" ("SourceConversationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentExample_SourceConversationDetailID" ON __mj."AIAgentExample" ("SourceConversationDetailID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentExample_SourceAIAgentRunID" ON __mj."AIAgentExample" ("SourceAIAgentRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentExample_EmbeddingModelID" ON __mj."AIAgentExample" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentExample_PrimaryScopeEntityID" ON __mj."AIAgentExample" ("PrimaryScopeEntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentNote_AgentID" ON __mj."AIAgentNote" ("AgentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentNote_AgentNoteTypeID" ON __mj."AIAgentNote" ("AgentNoteTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentNote_UserID" ON __mj."AIAgentNote" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentNote_SourceConversationID" ON __mj."AIAgentNote" ("SourceConversationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentNote_SourceConversationDetailID" ON __mj."AIAgentNote" ("SourceConversationDetailID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentNote_SourceAIAgentRunID" ON __mj."AIAgentNote" ("SourceAIAgentRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentNote_CompanyID" ON __mj."AIAgentNote" ("CompanyID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentNote_EmbeddingModelID" ON __mj."AIAgentNote" ("EmbeddingModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentNote_PrimaryScopeEntityID" ON __mj."AIAgentNote" ("PrimaryScopeEntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentNote_ConsolidatedIntoNoteID" ON __mj."AIAgentNote" ("ConsolidatedIntoNoteID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetailArtifact_Conversati_4fb3bfff" ON __mj."ConversationDetailArtifact" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetailArtifact_ArtifactVersionID" ON __mj."ConversationDetailArtifact" ("ArtifactVersionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetailAttachment_Conversa_cf82ff61" ON __mj."ConversationDetailAttachment" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetailAttachment_ModalityID" ON __mj."ConversationDetailAttachment" ("ModalityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetailAttachment_FileID" ON __mj."ConversationDetailAttachment" ("FileID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetailAttachment_ArtifactVersionID" ON __mj."ConversationDetailAttachment" ("ArtifactVersionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetailRating_ConversationDetailID" ON __mj."ConversationDetailRating" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetailRating_UserID" ON __mj."ConversationDetailRating" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Report_CategoryID" ON __mj."Report" ("CategoryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Report_UserID" ON __mj."Report" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Report_ConversationID" ON __mj."Report" ("ConversationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Report_ConversationDetailID" ON __mj."Report" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Report_DataContextID" ON __mj."Report" ("DataContextID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Report_OutputTriggerTypeID" ON __mj."Report" ("OutputTriggerTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Report_OutputFormatTypeID" ON __mj."Report" ("OutputFormatTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Report_OutputDeliveryTypeID" ON __mj."Report" ("OutputDeliveryTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Report_OutputWorkflowID" ON __mj."Report" ("OutputWorkflowID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Report_EnvironmentID" ON __mj."Report" ("EnvironmentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_ParentID" ON __mj."Task" ("ParentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_TypeID" ON __mj."Task" ("TypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_EnvironmentID" ON __mj."Task" ("EnvironmentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_ProjectID" ON __mj."Task" ("ProjectID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_ConversationDetailID" ON __mj."Task" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_UserID" ON __mj."Task" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_AgentID" ON __mj."Task" ("AgentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRun_AgentID" ON __mj."AIAgentRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRun_ParentRunID" ON __mj."AIAgentRun" ("ParentRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationID" ON __mj."AIAgentRun" ("ConversationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRun_UserID" ON __mj."AIAgentRun" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRun_ConversationDetailID" ON __mj."AIAgentRun" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRun_LastRunID" ON __mj."AIAgentRun" ("LastRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRun_ConfigurationID" ON __mj."AIAgentRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideModelID" ON __mj."AIAgentRun" ("OverrideModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRun_OverrideVendorID" ON __mj."AIAgentRun" ("OverrideVendorID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRun_ScheduledJobRunID" ON __mj."AIAgentRun" ("ScheduledJobRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRun_TestRunID" ON __mj."AIAgentRun" ("TestRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRun_PrimaryScopeEntityID" ON __mj."AIAgentRun" ("PrimaryScopeEntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgentRun_AgentSessionID" ON __mj."AIAgentRun" ("AgentSessionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetail_ConversationID" ON __mj."ConversationDetail" ("ConversationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetail_UserID" ON __mj."ConversationDetail" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactID" ON __mj."ConversationDetail" ("ArtifactID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetail_ArtifactVersionID" ON __mj."ConversationDetail" ("ArtifactVersionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetail_ParentID" ON __mj."ConversationDetail" ("ParentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetail_AgentID" ON __mj."ConversationDetail" ("AgentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetail_TestRunID" ON __mj."ConversationDetail" ("TestRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ConversationDetail_AgentSessionID" ON __mj."ConversationDetail" ("AgentSessionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_ParentID" ON __mj."AIAgent" ("ParentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_ContextCompressionPromptID" ON __mj."AIAgent" ("ContextCompressionPromptID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_TypeID" ON __mj."AIAgent" ("TypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_DefaultArtifactTypeID" ON __mj."AIAgent" ("DefaultArtifactTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_OwnerUserID" ON __mj."AIAgent" ("OwnerUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_AttachmentStorageProviderID" ON __mj."AIAgent" ("AttachmentStorageProviderID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_CategoryID" ON __mj."AIAgent" ("CategoryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_DefaultStorageAccountID" ON __mj."AIAgent" ("DefaultStorageAccountID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIAgent_DefaultCoAgentID" ON __mj."AIAgent" ("DefaultCoAgentID");


-- ===================== Helper Functions (fn*) =====================

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'fnAIAgentNoteConsolidatedIntoNoteID_GetRootID'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."fnAIAgentNoteConsolidatedIntoNoteID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "ConsolidatedIntoNoteID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIAgentNote"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."ConsolidatedIntoNoteID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIAgentNote" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ConsolidatedIntoNoteID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ConsolidatedIntoNoteID" IS NULL
    ORDER BY
        "RootParentID"

LIMIT 1
$$ LANGUAGE sql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'fnTaskParentID_GetRootID'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."fnTaskParentID_GetRootID"(
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
            __mj."Task"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."Task" c
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
           WHERE proname = 'fnAIAgentRunParentRunID_GetRootID'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."fnAIAgentRunParentRunID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "ParentRunID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIAgentRun"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."ParentRunID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIAgentRun" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentRunID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentRunID" IS NULL
    ORDER BY
        "RootParentID"

LIMIT 1
$$ LANGUAGE sql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'fnAIAgentRunLastRunID_GetRootID'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."fnAIAgentRunLastRunID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "LastRunID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIAgentRun"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."LastRunID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIAgentRun" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."LastRunID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "LastRunID" IS NULL
    ORDER BY
        "RootParentID"

LIMIT 1
$$ LANGUAGE sql;

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
  v_target_name CONSTANT TEXT := 'vwAIAgentExamples';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentExamples"
AS SELECT
    a.*,
    "MJAIAgent_AgentID"."Name" AS "Agent",
    "MJUser_UserID"."Name" AS "User",
    "MJCompany_CompanyID"."Name" AS "Company",
    "MJConversation_SourceConversationID"."Name" AS "SourceConversation",
    "MJConversationDetail_SourceConversationDetailID"."ExternalID" AS "SourceConversationDetail",
    "MJAIAgentRun_SourceAIAgentRunID"."RunName" AS "SourceAIAgentRun",
    "MJAIModel_EmbeddingModelID"."Name" AS "EmbeddingModel",
    "MJEntity_PrimaryScopeEntityID"."Name" AS "PrimaryScopeEntity"
FROM
    __mj."AIAgentExample" AS a
INNER JOIN
    __mj."AIAgent" AS "MJAIAgent_AgentID"
  ON
    a."AgentID" = "MJAIAgent_AgentID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    a."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."Company" AS "MJCompany_CompanyID"
  ON
    a."CompanyID" = "MJCompany_CompanyID"."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS "MJConversation_SourceConversationID"
  ON
    a."SourceConversationID" = "MJConversation_SourceConversationID"."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS "MJConversationDetail_SourceConversationDetailID"
  ON
    a."SourceConversationDetailID" = "MJConversationDetail_SourceConversationDetailID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS "MJAIAgentRun_SourceAIAgentRunID"
  ON
    a."SourceAIAgentRunID" = "MJAIAgentRun_SourceAIAgentRunID"."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS "MJAIModel_EmbeddingModelID"
  ON
    a."EmbeddingModelID" = "MJAIModel_EmbeddingModelID"."ID"
LEFT OUTER JOIN
    __mj."Entity" AS "MJEntity_PrimaryScopeEntityID"
  ON
    a."PrimaryScopeEntityID" = "MJEntity_PrimaryScopeEntityID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwAIAgentNotes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentNotes"
AS SELECT
    a.*,
    "MJAIAgent_AgentID"."Name" AS "Agent",
    "MJAIAgentNoteType_AgentNoteTypeID"."Name" AS "AgentNoteType",
    "MJUser_UserID"."Name" AS "User",
    "MJConversation_SourceConversationID"."Name" AS "SourceConversation",
    "MJConversationDetail_SourceConversationDetailID"."ExternalID" AS "SourceConversationDetail",
    "MJAIAgentRun_SourceAIAgentRunID"."RunName" AS "SourceAIAgentRun",
    "MJCompany_CompanyID"."Name" AS "Company",
    "MJAIModel_EmbeddingModelID"."Name" AS "EmbeddingModel",
    "MJEntity_PrimaryScopeEntityID"."Name" AS "PrimaryScopeEntity",
    "MJAIAgentNote_ConsolidatedIntoNoteID"."Note" AS "ConsolidatedIntoNote",
    "root_ConsolidatedIntoNoteID"."RootID" AS "RootConsolidatedIntoNoteID"
FROM
    __mj."AIAgentNote" AS a
LEFT OUTER JOIN
    __mj."AIAgent" AS "MJAIAgent_AgentID"
  ON
    a."AgentID" = "MJAIAgent_AgentID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentNoteType" AS "MJAIAgentNoteType_AgentNoteTypeID"
  ON
    a."AgentNoteTypeID" = "MJAIAgentNoteType_AgentNoteTypeID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    a."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS "MJConversation_SourceConversationID"
  ON
    a."SourceConversationID" = "MJConversation_SourceConversationID"."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS "MJConversationDetail_SourceConversationDetailID"
  ON
    a."SourceConversationDetailID" = "MJConversationDetail_SourceConversationDetailID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS "MJAIAgentRun_SourceAIAgentRunID"
  ON
    a."SourceAIAgentRunID" = "MJAIAgentRun_SourceAIAgentRunID"."ID"
LEFT OUTER JOIN
    __mj."Company" AS "MJCompany_CompanyID"
  ON
    a."CompanyID" = "MJCompany_CompanyID"."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS "MJAIModel_EmbeddingModelID"
  ON
    a."EmbeddingModelID" = "MJAIModel_EmbeddingModelID"."ID"
LEFT OUTER JOIN
    __mj."Entity" AS "MJEntity_PrimaryScopeEntityID"
  ON
    a."PrimaryScopeEntityID" = "MJEntity_PrimaryScopeEntityID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentNote" AS "MJAIAgentNote_ConsolidatedIntoNoteID"
  ON
    a."ConsolidatedIntoNoteID" = "MJAIAgentNote_ConsolidatedIntoNoteID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnAIAgentNoteConsolidatedIntoNoteID_GetRootID"(a."ID", a."ConsolidatedIntoNoteID")) AS "root_ConsolidatedIntoNoteID"
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
  v_target_name CONSTANT TEXT := 'vwConversationDetailArtifacts';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationDetailArtifacts"
AS SELECT
    c.*,
    "MJConversationDetail_ConversationDetailID"."ExternalID" AS "ConversationDetail",
    "MJArtifactVersion_ArtifactVersionID"."Name" AS "ArtifactVersion"
FROM
    __mj."ConversationDetailArtifact" AS c
INNER JOIN
    __mj."ConversationDetail" AS "MJConversationDetail_ConversationDetailID"
  ON
    c."ConversationDetailID" = "MJConversationDetail_ConversationDetailID"."ID"
INNER JOIN
    __mj."ArtifactVersion" AS "MJArtifactVersion_ArtifactVersionID"
  ON
    c."ArtifactVersionID" = "MJArtifactVersion_ArtifactVersionID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwConversationDetailAttachments';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationDetailAttachments"
AS SELECT
    c.*,
    "MJConversationDetail_ConversationDetailID"."ExternalID" AS "ConversationDetail",
    "MJAIModality_ModalityID"."Name" AS "Modality",
    "MJFile_FileID"."Name" AS "File",
    "MJArtifactVersion_ArtifactVersionID"."Name" AS "ArtifactVersion"
FROM
    __mj."ConversationDetailAttachment" AS c
INNER JOIN
    __mj."ConversationDetail" AS "MJConversationDetail_ConversationDetailID"
  ON
    c."ConversationDetailID" = "MJConversationDetail_ConversationDetailID"."ID"
INNER JOIN
    __mj."AIModality" AS "MJAIModality_ModalityID"
  ON
    c."ModalityID" = "MJAIModality_ModalityID"."ID"
LEFT OUTER JOIN
    __mj."File" AS "MJFile_FileID"
  ON
    c."FileID" = "MJFile_FileID"."ID"
LEFT OUTER JOIN
    __mj."ArtifactVersion" AS "MJArtifactVersion_ArtifactVersionID"
  ON
    c."ArtifactVersionID" = "MJArtifactVersion_ArtifactVersionID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwConversationDetailRatings';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwConversationDetailRatings"
AS SELECT
    c.*,
    "MJConversationDetail_ConversationDetailID"."ExternalID" AS "ConversationDetail",
    "MJUser_UserID"."Name" AS "User"
FROM
    __mj."ConversationDetailRating" AS c
INNER JOIN
    __mj."ConversationDetail" AS "MJConversationDetail_ConversationDetailID"
  ON
    c."ConversationDetailID" = "MJConversationDetail_ConversationDetailID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    c."UserID" = "MJUser_UserID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwReports';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwReports"
AS SELECT
    r.*,
    "MJReportCategory_CategoryID"."Name" AS "Category",
    "MJUser_UserID"."Name" AS "User",
    "MJConversation_ConversationID"."Name" AS "Conversation",
    "MJConversationDetail_ConversationDetailID"."ExternalID" AS "ConversationDetail",
    "MJDataContext_DataContextID"."Name" AS "DataContext",
    "MJOutputTriggerType_OutputTriggerTypeID"."Name" AS "OutputTriggerType",
    "MJOutputFormatType_OutputFormatTypeID"."Name" AS "OutputFormatType",
    "MJOutputDeliveryType_OutputDeliveryTypeID"."Name" AS "OutputDeliveryType",
    "MJWorkflow_OutputWorkflowID"."Name" AS "OutputWorkflow",
    "MJEnvironment_EnvironmentID"."Name" AS "Environment"
FROM
    __mj."Report" AS r
LEFT OUTER JOIN
    __mj."ReportCategory" AS "MJReportCategory_CategoryID"
  ON
    r."CategoryID" = "MJReportCategory_CategoryID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    r."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS "MJConversation_ConversationID"
  ON
    r."ConversationID" = "MJConversation_ConversationID"."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS "MJConversationDetail_ConversationDetailID"
  ON
    r."ConversationDetailID" = "MJConversationDetail_ConversationDetailID"."ID"
LEFT OUTER JOIN
    __mj."DataContext" AS "MJDataContext_DataContextID"
  ON
    r."DataContextID" = "MJDataContext_DataContextID"."ID"
LEFT OUTER JOIN
    __mj."OutputTriggerType" AS "MJOutputTriggerType_OutputTriggerTypeID"
  ON
    r."OutputTriggerTypeID" = "MJOutputTriggerType_OutputTriggerTypeID"."ID"
LEFT OUTER JOIN
    __mj."OutputFormatType" AS "MJOutputFormatType_OutputFormatTypeID"
  ON
    r."OutputFormatTypeID" = "MJOutputFormatType_OutputFormatTypeID"."ID"
LEFT OUTER JOIN
    __mj."OutputDeliveryType" AS "MJOutputDeliveryType_OutputDeliveryTypeID"
  ON
    r."OutputDeliveryTypeID" = "MJOutputDeliveryType_OutputDeliveryTypeID"."ID"
LEFT OUTER JOIN
    __mj."Workflow" AS "MJWorkflow_OutputWorkflowID"
  ON
    r."OutputWorkflowID" = "MJWorkflow_OutputWorkflowID"."ID"
INNER JOIN
    __mj."Environment" AS "MJEnvironment_EnvironmentID"
  ON
    r."EnvironmentID" = "MJEnvironment_EnvironmentID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwTasks';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwTasks"
AS SELECT
    t.*,
    "MJTask_ParentID"."Name" AS "Parent",
    "MJTaskType_TypeID"."Name" AS "Type",
    "MJEnvironment_EnvironmentID"."Name" AS "Environment",
    "MJProject_ProjectID"."Name" AS "Project",
    "MJConversationDetail_ConversationDetailID"."ExternalID" AS "ConversationDetail",
    "MJUser_UserID"."Name" AS "User",
    "MJAIAgent_AgentID"."Name" AS "Agent",
    "root_ParentID"."RootID" AS "RootParentID"
FROM
    __mj."Task" AS t
LEFT OUTER JOIN
    __mj."Task" AS "MJTask_ParentID"
  ON
    t."ParentID" = "MJTask_ParentID"."ID"
INNER JOIN
    __mj."TaskType" AS "MJTaskType_TypeID"
  ON
    t."TypeID" = "MJTaskType_TypeID"."ID"
INNER JOIN
    __mj."Environment" AS "MJEnvironment_EnvironmentID"
  ON
    t."EnvironmentID" = "MJEnvironment_EnvironmentID"."ID"
LEFT OUTER JOIN
    __mj."Project" AS "MJProject_ProjectID"
  ON
    t."ProjectID" = "MJProject_ProjectID"."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS "MJConversationDetail_ConversationDetailID"
  ON
    t."ConversationDetailID" = "MJConversationDetail_ConversationDetailID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    t."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS "MJAIAgent_AgentID"
  ON
    t."AgentID" = "MJAIAgent_AgentID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnTaskParentID_GetRootID"(t."ID", t."ParentID")) AS "root_ParentID"
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
  v_target_name CONSTANT TEXT := 'vwAIAgentRuns';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentRuns"
AS SELECT
    a.*,
    "MJAIAgent_AgentID"."Name" AS "Agent",
    "MJAIAgentRun_ParentRunID"."RunName" AS "ParentRun",
    "MJConversation_ConversationID"."Name" AS "Conversation",
    "MJUser_UserID"."Name" AS "User",
    "MJConversationDetail_ConversationDetailID"."ExternalID" AS "ConversationDetail",
    "MJAIAgentRun_LastRunID"."RunName" AS "LastRun",
    "MJAIConfiguration_ConfigurationID"."Name" AS "Configuration",
    "MJAIModel_OverrideModelID"."Name" AS "OverrideModel",
    "MJAIVendor_OverrideVendorID"."Name" AS "OverrideVendor",
    "MJScheduledJobRun_ScheduledJobRunID"."ScheduledJob" AS "ScheduledJobRun",
    "MJTestRun_TestRunID"."Test" AS "TestRun",
    "MJEntity_PrimaryScopeEntityID"."Name" AS "PrimaryScopeEntity",
    "root_ParentRunID"."RootID" AS "RootParentRunID",
    "root_LastRunID"."RootID" AS "RootLastRunID"
FROM
    __mj."AIAgentRun" AS a
INNER JOIN
    __mj."AIAgent" AS "MJAIAgent_AgentID"
  ON
    a."AgentID" = "MJAIAgent_AgentID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS "MJAIAgentRun_ParentRunID"
  ON
    a."ParentRunID" = "MJAIAgentRun_ParentRunID"."ID"
LEFT OUTER JOIN
    __mj."Conversation" AS "MJConversation_ConversationID"
  ON
    a."ConversationID" = "MJConversation_ConversationID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    a."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."ConversationDetail" AS "MJConversationDetail_ConversationDetailID"
  ON
    a."ConversationDetailID" = "MJConversationDetail_ConversationDetailID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS "MJAIAgentRun_LastRunID"
  ON
    a."LastRunID" = "MJAIAgentRun_LastRunID"."ID"
LEFT OUTER JOIN
    __mj."AIConfiguration" AS "MJAIConfiguration_ConfigurationID"
  ON
    a."ConfigurationID" = "MJAIConfiguration_ConfigurationID"."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS "MJAIModel_OverrideModelID"
  ON
    a."OverrideModelID" = "MJAIModel_OverrideModelID"."ID"
LEFT OUTER JOIN
    __mj."AIVendor" AS "MJAIVendor_OverrideVendorID"
  ON
    a."OverrideVendorID" = "MJAIVendor_OverrideVendorID"."ID"
LEFT OUTER JOIN
    __mj."vwScheduledJobRuns" AS "MJScheduledJobRun_ScheduledJobRunID"
  ON
    a."ScheduledJobRunID" = "MJScheduledJobRun_ScheduledJobRunID"."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" AS "MJTestRun_TestRunID"
  ON
    a."TestRunID" = "MJTestRun_TestRunID"."ID"
LEFT OUTER JOIN
    __mj."Entity" AS "MJEntity_PrimaryScopeEntityID"
  ON
    a."PrimaryScopeEntityID" = "MJEntity_PrimaryScopeEntityID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnAIAgentRunParentRunID_GetRootID"(a."ID", a."ParentRunID")) AS "root_ParentRunID"
    ON TRUE
LEFT JOIN LATERAL (SELECT * FROM __mj."fnAIAgentRunLastRunID_GetRootID"(a."ID", a."LastRunID")) AS "root_LastRunID"
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
           WHERE proname = 'spCreateAIAgentExample'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentExample"(
    IN p_ID UUID DEFAULT NULL,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_CompanyID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompanyID UUID DEFAULT NULL,
    IN p_Type VARCHAR(20) DEFAULT NULL,
    IN p_ExampleInput TEXT DEFAULT NULL,
    IN p_ExampleOutput TEXT DEFAULT NULL,
    IN p_IsAutoGenerated BOOLEAN DEFAULT NULL,
    IN p_SourceConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceConversationID UUID DEFAULT NULL,
    IN p_SourceConversationDetailID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceConversationDetailID UUID DEFAULT NULL,
    IN p_SourceAIAgentRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceAIAgentRunID UUID DEFAULT NULL,
    IN p_SuccessScore_Clear BOOLEAN DEFAULT FALSE,
    IN p_SuccessScore NUMERIC(5,2) DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_EmbeddingVector_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingVector TEXT DEFAULT NULL,
    IN p_EmbeddingModelID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingModelID UUID DEFAULT NULL,
    IN p_PrimaryScopeEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeEntityID UUID DEFAULT NULL,
    IN p_PrimaryScopeRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeRecordID VARCHAR(100) DEFAULT NULL,
    IN p_SecondaryScopes_Clear BOOLEAN DEFAULT FALSE,
    IN p_SecondaryScopes TEXT DEFAULT NULL,
    IN p_LastAccessedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastAccessedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_AccessCount INTEGER DEFAULT NULL,
    IN p_ExpiresAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExpiresAt TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentExamples" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIAgentExample"
            (
                "ID",
                "AgentID",
                "UserID",
                "CompanyID",
                "Type",
                "ExampleInput",
                "ExampleOutput",
                "IsAutoGenerated",
                "SourceConversationID",
                "SourceConversationDetailID",
                "SourceAIAgentRunID",
                "SuccessScore",
                "Comments",
                "Status",
                "EmbeddingVector",
                "EmbeddingModelID",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes",
                "LastAccessedAt",
                "AccessCount",
                "ExpiresAt"
            )
        VALUES
            (
                p_ID,
                p_AgentID,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, NULL) END,
                COALESCE(p_Type, 'Example'),
                p_ExampleInput,
                p_ExampleOutput,
                COALESCE(p_IsAutoGenerated, FALSE),
                CASE WHEN p_SourceConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationID, NULL) END,
                CASE WHEN p_SourceConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationDetailID, NULL) END,
                CASE WHEN p_SourceAIAgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceAIAgentRunID, NULL) END,
                CASE WHEN p_SuccessScore_Clear = TRUE THEN NULL ELSE COALESCE(p_SuccessScore, NULL) END,
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END,
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_EmbeddingVector_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingVector, NULL) END,
                CASE WHEN p_EmbeddingModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingModelID, NULL) END,
                CASE WHEN p_PrimaryScopeEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeEntityID, NULL) END,
                CASE WHEN p_PrimaryScopeRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeRecordID, NULL) END,
                CASE WHEN p_SecondaryScopes_Clear = TRUE THEN NULL ELSE COALESCE(p_SecondaryScopes, NULL) END,
                CASE WHEN p_LastAccessedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastAccessedAt, NULL) END,
                COALESCE(p_AccessCount, 0),
                CASE WHEN p_ExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpiresAt, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIAgentExample"
            (
                "AgentID",
                "UserID",
                "CompanyID",
                "Type",
                "ExampleInput",
                "ExampleOutput",
                "IsAutoGenerated",
                "SourceConversationID",
                "SourceConversationDetailID",
                "SourceAIAgentRunID",
                "SuccessScore",
                "Comments",
                "Status",
                "EmbeddingVector",
                "EmbeddingModelID",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes",
                "LastAccessedAt",
                "AccessCount",
                "ExpiresAt"
            )
        VALUES
            (
                p_AgentID,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, NULL) END,
                COALESCE(p_Type, 'Example'),
                p_ExampleInput,
                p_ExampleOutput,
                COALESCE(p_IsAutoGenerated, FALSE),
                CASE WHEN p_SourceConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationID, NULL) END,
                CASE WHEN p_SourceConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationDetailID, NULL) END,
                CASE WHEN p_SourceAIAgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceAIAgentRunID, NULL) END,
                CASE WHEN p_SuccessScore_Clear = TRUE THEN NULL ELSE COALESCE(p_SuccessScore, NULL) END,
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END,
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_EmbeddingVector_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingVector, NULL) END,
                CASE WHEN p_EmbeddingModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingModelID, NULL) END,
                CASE WHEN p_PrimaryScopeEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeEntityID, NULL) END,
                CASE WHEN p_PrimaryScopeRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeRecordID, NULL) END,
                CASE WHEN p_SecondaryScopes_Clear = TRUE THEN NULL ELSE COALESCE(p_SecondaryScopes, NULL) END,
                CASE WHEN p_LastAccessedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastAccessedAt, NULL) END,
                COALESCE(p_AccessCount, 0),
                CASE WHEN p_ExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpiresAt, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIAgentExamples" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIAgentExample'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentExample"(
    IN p_ID UUID,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_CompanyID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompanyID UUID DEFAULT NULL,
    IN p_Type VARCHAR(20) DEFAULT NULL,
    IN p_ExampleInput TEXT DEFAULT NULL,
    IN p_ExampleOutput TEXT DEFAULT NULL,
    IN p_IsAutoGenerated BOOLEAN DEFAULT NULL,
    IN p_SourceConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceConversationID UUID DEFAULT NULL,
    IN p_SourceConversationDetailID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceConversationDetailID UUID DEFAULT NULL,
    IN p_SourceAIAgentRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceAIAgentRunID UUID DEFAULT NULL,
    IN p_SuccessScore_Clear BOOLEAN DEFAULT FALSE,
    IN p_SuccessScore NUMERIC(5,2) DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_EmbeddingVector_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingVector TEXT DEFAULT NULL,
    IN p_EmbeddingModelID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingModelID UUID DEFAULT NULL,
    IN p_PrimaryScopeEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeEntityID UUID DEFAULT NULL,
    IN p_PrimaryScopeRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeRecordID VARCHAR(100) DEFAULT NULL,
    IN p_SecondaryScopes_Clear BOOLEAN DEFAULT FALSE,
    IN p_SecondaryScopes TEXT DEFAULT NULL,
    IN p_LastAccessedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastAccessedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_AccessCount INTEGER DEFAULT NULL,
    IN p_ExpiresAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExpiresAt TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentExamples" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIAgentExample"
    SET
        "AgentID" = COALESCE(p_AgentID, "AgentID"),
        "UserID" = CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, "UserID") END,
        "CompanyID" = CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, "CompanyID") END,
        "Type" = COALESCE(p_Type, "Type"),
        "ExampleInput" = COALESCE(p_ExampleInput, "ExampleInput"),
        "ExampleOutput" = COALESCE(p_ExampleOutput, "ExampleOutput"),
        "IsAutoGenerated" = COALESCE(p_IsAutoGenerated, "IsAutoGenerated"),
        "SourceConversationID" = CASE WHEN p_SourceConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationID, "SourceConversationID") END,
        "SourceConversationDetailID" = CASE WHEN p_SourceConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationDetailID, "SourceConversationDetailID") END,
        "SourceAIAgentRunID" = CASE WHEN p_SourceAIAgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceAIAgentRunID, "SourceAIAgentRunID") END,
        "SuccessScore" = CASE WHEN p_SuccessScore_Clear = TRUE THEN NULL ELSE COALESCE(p_SuccessScore, "SuccessScore") END,
        "Comments" = CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, "Comments") END,
        "Status" = COALESCE(p_Status, "Status"),
        "EmbeddingVector" = CASE WHEN p_EmbeddingVector_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingVector, "EmbeddingVector") END,
        "EmbeddingModelID" = CASE WHEN p_EmbeddingModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingModelID, "EmbeddingModelID") END,
        "PrimaryScopeEntityID" = CASE WHEN p_PrimaryScopeEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeEntityID, "PrimaryScopeEntityID") END,
        "PrimaryScopeRecordID" = CASE WHEN p_PrimaryScopeRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeRecordID, "PrimaryScopeRecordID") END,
        "SecondaryScopes" = CASE WHEN p_SecondaryScopes_Clear = TRUE THEN NULL ELSE COALESCE(p_SecondaryScopes, "SecondaryScopes") END,
        "LastAccessedAt" = CASE WHEN p_LastAccessedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastAccessedAt, "LastAccessedAt") END,
        "AccessCount" = COALESCE(p_AccessCount, "AccessCount"),
        "ExpiresAt" = CASE WHEN p_ExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpiresAt, "ExpiresAt") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIAgentExamples" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIAgentExamples" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentExample'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentExample"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentExample"
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
           WHERE proname = 'spCreateAIAgentNote'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentNote"(
    IN p_ID UUID DEFAULT NULL,
    IN p_AgentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_AgentNoteTypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentNoteTypeID UUID DEFAULT NULL,
    IN p_Note_Clear BOOLEAN DEFAULT FALSE,
    IN p_Note TEXT DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Type VARCHAR(20) DEFAULT NULL,
    IN p_IsAutoGenerated BOOLEAN DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_SourceConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceConversationID UUID DEFAULT NULL,
    IN p_SourceConversationDetailID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceConversationDetailID UUID DEFAULT NULL,
    IN p_SourceAIAgentRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceAIAgentRunID UUID DEFAULT NULL,
    IN p_CompanyID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompanyID UUID DEFAULT NULL,
    IN p_EmbeddingVector_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingVector TEXT DEFAULT NULL,
    IN p_EmbeddingModelID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingModelID UUID DEFAULT NULL,
    IN p_PrimaryScopeEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeEntityID UUID DEFAULT NULL,
    IN p_PrimaryScopeRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeRecordID VARCHAR(100) DEFAULT NULL,
    IN p_SecondaryScopes_Clear BOOLEAN DEFAULT FALSE,
    IN p_SecondaryScopes TEXT DEFAULT NULL,
    IN p_LastAccessedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastAccessedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_AccessCount INTEGER DEFAULT NULL,
    IN p_ExpiresAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExpiresAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ConsolidatedIntoNoteID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConsolidatedIntoNoteID UUID DEFAULT NULL,
    IN p_ConsolidationCount INTEGER DEFAULT NULL,
    IN p_DerivedFromNoteIDs_Clear BOOLEAN DEFAULT FALSE,
    IN p_DerivedFromNoteIDs TEXT DEFAULT NULL,
    IN p_ProtectionTier VARCHAR(20) DEFAULT NULL,
    IN p_ImportanceScore_Clear BOOLEAN DEFAULT FALSE,
    IN p_ImportanceScore NUMERIC(5,2) DEFAULT NULL,
    IN p_AuthorType VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentNotes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIAgentNote"
            (
                "ID",
                "AgentID",
                "AgentNoteTypeID",
                "Note",
                "UserID",
                "Type",
                "IsAutoGenerated",
                "Comments",
                "Status",
                "SourceConversationID",
                "SourceConversationDetailID",
                "SourceAIAgentRunID",
                "CompanyID",
                "EmbeddingVector",
                "EmbeddingModelID",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes",
                "LastAccessedAt",
                "AccessCount",
                "ExpiresAt",
                "ConsolidatedIntoNoteID",
                "ConsolidationCount",
                "DerivedFromNoteIDs",
                "ProtectionTier",
                "ImportanceScore",
                "AuthorType"
            )
        VALUES
            (
                p_ID,
                CASE WHEN p_AgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentID, NULL) END,
                CASE WHEN p_AgentNoteTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentNoteTypeID, NULL) END,
                CASE WHEN p_Note_Clear = TRUE THEN NULL ELSE COALESCE(p_Note, NULL) END,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                COALESCE(p_Type, 'Preference'),
                COALESCE(p_IsAutoGenerated, FALSE),
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END,
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_SourceConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationID, NULL) END,
                CASE WHEN p_SourceConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationDetailID, NULL) END,
                CASE WHEN p_SourceAIAgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceAIAgentRunID, NULL) END,
                CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, NULL) END,
                CASE WHEN p_EmbeddingVector_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingVector, NULL) END,
                CASE WHEN p_EmbeddingModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingModelID, NULL) END,
                CASE WHEN p_PrimaryScopeEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeEntityID, NULL) END,
                CASE WHEN p_PrimaryScopeRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeRecordID, NULL) END,
                CASE WHEN p_SecondaryScopes_Clear = TRUE THEN NULL ELSE COALESCE(p_SecondaryScopes, NULL) END,
                CASE WHEN p_LastAccessedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastAccessedAt, NULL) END,
                COALESCE(p_AccessCount, 0),
                CASE WHEN p_ExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpiresAt, NULL) END,
                CASE WHEN p_ConsolidatedIntoNoteID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConsolidatedIntoNoteID, NULL) END,
                COALESCE(p_ConsolidationCount, 0),
                CASE WHEN p_DerivedFromNoteIDs_Clear = TRUE THEN NULL ELSE COALESCE(p_DerivedFromNoteIDs, NULL) END,
                COALESCE(p_ProtectionTier, 'Standard'),
                CASE WHEN p_ImportanceScore_Clear = TRUE THEN NULL ELSE COALESCE(p_ImportanceScore, NULL) END,
                COALESCE(p_AuthorType, 'MemoryManager')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIAgentNote"
            (
                "AgentID",
                "AgentNoteTypeID",
                "Note",
                "UserID",
                "Type",
                "IsAutoGenerated",
                "Comments",
                "Status",
                "SourceConversationID",
                "SourceConversationDetailID",
                "SourceAIAgentRunID",
                "CompanyID",
                "EmbeddingVector",
                "EmbeddingModelID",
                "PrimaryScopeEntityID",
                "PrimaryScopeRecordID",
                "SecondaryScopes",
                "LastAccessedAt",
                "AccessCount",
                "ExpiresAt",
                "ConsolidatedIntoNoteID",
                "ConsolidationCount",
                "DerivedFromNoteIDs",
                "ProtectionTier",
                "ImportanceScore",
                "AuthorType"
            )
        VALUES
            (
                CASE WHEN p_AgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentID, NULL) END,
                CASE WHEN p_AgentNoteTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentNoteTypeID, NULL) END,
                CASE WHEN p_Note_Clear = TRUE THEN NULL ELSE COALESCE(p_Note, NULL) END,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                COALESCE(p_Type, 'Preference'),
                COALESCE(p_IsAutoGenerated, FALSE),
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END,
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_SourceConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationID, NULL) END,
                CASE WHEN p_SourceConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationDetailID, NULL) END,
                CASE WHEN p_SourceAIAgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceAIAgentRunID, NULL) END,
                CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, NULL) END,
                CASE WHEN p_EmbeddingVector_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingVector, NULL) END,
                CASE WHEN p_EmbeddingModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingModelID, NULL) END,
                CASE WHEN p_PrimaryScopeEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeEntityID, NULL) END,
                CASE WHEN p_PrimaryScopeRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeRecordID, NULL) END,
                CASE WHEN p_SecondaryScopes_Clear = TRUE THEN NULL ELSE COALESCE(p_SecondaryScopes, NULL) END,
                CASE WHEN p_LastAccessedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastAccessedAt, NULL) END,
                COALESCE(p_AccessCount, 0),
                CASE WHEN p_ExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpiresAt, NULL) END,
                CASE WHEN p_ConsolidatedIntoNoteID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConsolidatedIntoNoteID, NULL) END,
                COALESCE(p_ConsolidationCount, 0),
                CASE WHEN p_DerivedFromNoteIDs_Clear = TRUE THEN NULL ELSE COALESCE(p_DerivedFromNoteIDs, NULL) END,
                COALESCE(p_ProtectionTier, 'Standard'),
                CASE WHEN p_ImportanceScore_Clear = TRUE THEN NULL ELSE COALESCE(p_ImportanceScore, NULL) END,
                COALESCE(p_AuthorType, 'MemoryManager')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIAgentNotes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIAgentNote'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentNote"(
    IN p_ID UUID,
    IN p_AgentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_AgentNoteTypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentNoteTypeID UUID DEFAULT NULL,
    IN p_Note_Clear BOOLEAN DEFAULT FALSE,
    IN p_Note TEXT DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Type VARCHAR(20) DEFAULT NULL,
    IN p_IsAutoGenerated BOOLEAN DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_SourceConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceConversationID UUID DEFAULT NULL,
    IN p_SourceConversationDetailID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceConversationDetailID UUID DEFAULT NULL,
    IN p_SourceAIAgentRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourceAIAgentRunID UUID DEFAULT NULL,
    IN p_CompanyID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompanyID UUID DEFAULT NULL,
    IN p_EmbeddingVector_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingVector TEXT DEFAULT NULL,
    IN p_EmbeddingModelID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EmbeddingModelID UUID DEFAULT NULL,
    IN p_PrimaryScopeEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeEntityID UUID DEFAULT NULL,
    IN p_PrimaryScopeRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeRecordID VARCHAR(100) DEFAULT NULL,
    IN p_SecondaryScopes_Clear BOOLEAN DEFAULT FALSE,
    IN p_SecondaryScopes TEXT DEFAULT NULL,
    IN p_LastAccessedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastAccessedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_AccessCount INTEGER DEFAULT NULL,
    IN p_ExpiresAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExpiresAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ConsolidatedIntoNoteID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConsolidatedIntoNoteID UUID DEFAULT NULL,
    IN p_ConsolidationCount INTEGER DEFAULT NULL,
    IN p_DerivedFromNoteIDs_Clear BOOLEAN DEFAULT FALSE,
    IN p_DerivedFromNoteIDs TEXT DEFAULT NULL,
    IN p_ProtectionTier VARCHAR(20) DEFAULT NULL,
    IN p_ImportanceScore_Clear BOOLEAN DEFAULT FALSE,
    IN p_ImportanceScore NUMERIC(5,2) DEFAULT NULL,
    IN p_AuthorType VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentNotes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIAgentNote"
    SET
        "AgentID" = CASE WHEN p_AgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentID, "AgentID") END,
        "AgentNoteTypeID" = CASE WHEN p_AgentNoteTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentNoteTypeID, "AgentNoteTypeID") END,
        "Note" = CASE WHEN p_Note_Clear = TRUE THEN NULL ELSE COALESCE(p_Note, "Note") END,
        "UserID" = CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, "UserID") END,
        "Type" = COALESCE(p_Type, "Type"),
        "IsAutoGenerated" = COALESCE(p_IsAutoGenerated, "IsAutoGenerated"),
        "Comments" = CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, "Comments") END,
        "Status" = COALESCE(p_Status, "Status"),
        "SourceConversationID" = CASE WHEN p_SourceConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationID, "SourceConversationID") END,
        "SourceConversationDetailID" = CASE WHEN p_SourceConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceConversationDetailID, "SourceConversationDetailID") END,
        "SourceAIAgentRunID" = CASE WHEN p_SourceAIAgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourceAIAgentRunID, "SourceAIAgentRunID") END,
        "CompanyID" = CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, "CompanyID") END,
        "EmbeddingVector" = CASE WHEN p_EmbeddingVector_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingVector, "EmbeddingVector") END,
        "EmbeddingModelID" = CASE WHEN p_EmbeddingModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_EmbeddingModelID, "EmbeddingModelID") END,
        "PrimaryScopeEntityID" = CASE WHEN p_PrimaryScopeEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeEntityID, "PrimaryScopeEntityID") END,
        "PrimaryScopeRecordID" = CASE WHEN p_PrimaryScopeRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeRecordID, "PrimaryScopeRecordID") END,
        "SecondaryScopes" = CASE WHEN p_SecondaryScopes_Clear = TRUE THEN NULL ELSE COALESCE(p_SecondaryScopes, "SecondaryScopes") END,
        "LastAccessedAt" = CASE WHEN p_LastAccessedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastAccessedAt, "LastAccessedAt") END,
        "AccessCount" = COALESCE(p_AccessCount, "AccessCount"),
        "ExpiresAt" = CASE WHEN p_ExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpiresAt, "ExpiresAt") END,
        "ConsolidatedIntoNoteID" = CASE WHEN p_ConsolidatedIntoNoteID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConsolidatedIntoNoteID, "ConsolidatedIntoNoteID") END,
        "ConsolidationCount" = COALESCE(p_ConsolidationCount, "ConsolidationCount"),
        "DerivedFromNoteIDs" = CASE WHEN p_DerivedFromNoteIDs_Clear = TRUE THEN NULL ELSE COALESCE(p_DerivedFromNoteIDs, "DerivedFromNoteIDs") END,
        "ProtectionTier" = COALESCE(p_ProtectionTier, "ProtectionTier"),
        "ImportanceScore" = CASE WHEN p_ImportanceScore_Clear = TRUE THEN NULL ELSE COALESCE(p_ImportanceScore, "ImportanceScore") END,
        "AuthorType" = COALESCE(p_AuthorType, "AuthorType")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIAgentNotes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIAgentNotes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentNote'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentNote"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentNote"
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
           WHERE proname = 'spCreateConversationDetailArtifact'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetailArtifact"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_ArtifactVersionID UUID DEFAULT NULL,
    IN p_Direction VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwConversationDetailArtifacts" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ConversationDetailArtifact"
            (
                "ID",
                "ConversationDetailID",
                "ArtifactVersionID",
                "Direction"
            )
        VALUES
            (
                p_ID,
                p_ConversationDetailID,
                p_ArtifactVersionID,
                COALESCE(p_Direction, 'Output')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ConversationDetailArtifact"
            (
                "ConversationDetailID",
                "ArtifactVersionID",
                "Direction"
            )
        VALUES
            (
                p_ConversationDetailID,
                p_ArtifactVersionID,
                COALESCE(p_Direction, 'Output')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwConversationDetailArtifacts" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateConversationDetailArtifact'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetailArtifact"(
    IN p_ID UUID,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_ArtifactVersionID UUID DEFAULT NULL,
    IN p_Direction VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwConversationDetailArtifacts" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ConversationDetailArtifact"
    SET
        "ConversationDetailID" = COALESCE(p_ConversationDetailID, "ConversationDetailID"),
        "ArtifactVersionID" = COALESCE(p_ArtifactVersionID, "ArtifactVersionID"),
        "Direction" = COALESCE(p_Direction, "Direction")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwConversationDetailArtifacts" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwConversationDetailArtifacts" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateConversationDetailAttachment'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetailAttachment"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_ModalityID UUID DEFAULT NULL,
    IN p_MimeType VARCHAR(100) DEFAULT NULL,
    IN p_FileName_Clear BOOLEAN DEFAULT FALSE,
    IN p_FileName VARCHAR(4000) DEFAULT NULL,
    IN p_FileSizeBytes INTEGER DEFAULT NULL,
    IN p_Width_Clear BOOLEAN DEFAULT FALSE,
    IN p_Width INTEGER DEFAULT NULL,
    IN p_Height_Clear BOOLEAN DEFAULT FALSE,
    IN p_Height INTEGER DEFAULT NULL,
    IN p_DurationSeconds_Clear BOOLEAN DEFAULT FALSE,
    IN p_DurationSeconds INTEGER DEFAULT NULL,
    IN p_InlineData_Clear BOOLEAN DEFAULT FALSE,
    IN p_InlineData TEXT DEFAULT NULL,
    IN p_FileID_Clear BOOLEAN DEFAULT FALSE,
    IN p_FileID UUID DEFAULT NULL,
    IN p_DisplayOrder INTEGER DEFAULT NULL,
    IN p_ThumbnailBase64_Clear BOOLEAN DEFAULT FALSE,
    IN p_ThumbnailBase64 TEXT DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_ArtifactVersionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ArtifactVersionID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwConversationDetailAttachments" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ConversationDetailAttachment"
            (
                "ID",
                "ConversationDetailID",
                "ModalityID",
                "MimeType",
                "FileName",
                "FileSizeBytes",
                "Width",
                "Height",
                "DurationSeconds",
                "InlineData",
                "FileID",
                "DisplayOrder",
                "ThumbnailBase64",
                "Description",
                "ArtifactVersionID"
            )
        VALUES
            (
                p_ID,
                p_ConversationDetailID,
                p_ModalityID,
                p_MimeType,
                CASE WHEN p_FileName_Clear = TRUE THEN NULL ELSE COALESCE(p_FileName, NULL) END,
                p_FileSizeBytes,
                CASE WHEN p_Width_Clear = TRUE THEN NULL ELSE COALESCE(p_Width, NULL) END,
                CASE WHEN p_Height_Clear = TRUE THEN NULL ELSE COALESCE(p_Height, NULL) END,
                CASE WHEN p_DurationSeconds_Clear = TRUE THEN NULL ELSE COALESCE(p_DurationSeconds, NULL) END,
                CASE WHEN p_InlineData_Clear = TRUE THEN NULL ELSE COALESCE(p_InlineData, NULL) END,
                CASE WHEN p_FileID_Clear = TRUE THEN NULL ELSE COALESCE(p_FileID, NULL) END,
                COALESCE(p_DisplayOrder, 0),
                CASE WHEN p_ThumbnailBase64_Clear = TRUE THEN NULL ELSE COALESCE(p_ThumbnailBase64, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_ArtifactVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactVersionID, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ConversationDetailAttachment"
            (
                "ConversationDetailID",
                "ModalityID",
                "MimeType",
                "FileName",
                "FileSizeBytes",
                "Width",
                "Height",
                "DurationSeconds",
                "InlineData",
                "FileID",
                "DisplayOrder",
                "ThumbnailBase64",
                "Description",
                "ArtifactVersionID"
            )
        VALUES
            (
                p_ConversationDetailID,
                p_ModalityID,
                p_MimeType,
                CASE WHEN p_FileName_Clear = TRUE THEN NULL ELSE COALESCE(p_FileName, NULL) END,
                p_FileSizeBytes,
                CASE WHEN p_Width_Clear = TRUE THEN NULL ELSE COALESCE(p_Width, NULL) END,
                CASE WHEN p_Height_Clear = TRUE THEN NULL ELSE COALESCE(p_Height, NULL) END,
                CASE WHEN p_DurationSeconds_Clear = TRUE THEN NULL ELSE COALESCE(p_DurationSeconds, NULL) END,
                CASE WHEN p_InlineData_Clear = TRUE THEN NULL ELSE COALESCE(p_InlineData, NULL) END,
                CASE WHEN p_FileID_Clear = TRUE THEN NULL ELSE COALESCE(p_FileID, NULL) END,
                COALESCE(p_DisplayOrder, 0),
                CASE WHEN p_ThumbnailBase64_Clear = TRUE THEN NULL ELSE COALESCE(p_ThumbnailBase64, NULL) END,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_ArtifactVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactVersionID, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwConversationDetailAttachments" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateConversationDetailAttachment'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetailAttachment"(
    IN p_ID UUID,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_ModalityID UUID DEFAULT NULL,
    IN p_MimeType VARCHAR(100) DEFAULT NULL,
    IN p_FileName_Clear BOOLEAN DEFAULT FALSE,
    IN p_FileName VARCHAR(4000) DEFAULT NULL,
    IN p_FileSizeBytes INTEGER DEFAULT NULL,
    IN p_Width_Clear BOOLEAN DEFAULT FALSE,
    IN p_Width INTEGER DEFAULT NULL,
    IN p_Height_Clear BOOLEAN DEFAULT FALSE,
    IN p_Height INTEGER DEFAULT NULL,
    IN p_DurationSeconds_Clear BOOLEAN DEFAULT FALSE,
    IN p_DurationSeconds INTEGER DEFAULT NULL,
    IN p_InlineData_Clear BOOLEAN DEFAULT FALSE,
    IN p_InlineData TEXT DEFAULT NULL,
    IN p_FileID_Clear BOOLEAN DEFAULT FALSE,
    IN p_FileID UUID DEFAULT NULL,
    IN p_DisplayOrder INTEGER DEFAULT NULL,
    IN p_ThumbnailBase64_Clear BOOLEAN DEFAULT FALSE,
    IN p_ThumbnailBase64 TEXT DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_ArtifactVersionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ArtifactVersionID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwConversationDetailAttachments" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ConversationDetailAttachment"
    SET
        "ConversationDetailID" = COALESCE(p_ConversationDetailID, "ConversationDetailID"),
        "ModalityID" = COALESCE(p_ModalityID, "ModalityID"),
        "MimeType" = COALESCE(p_MimeType, "MimeType"),
        "FileName" = CASE WHEN p_FileName_Clear = TRUE THEN NULL ELSE COALESCE(p_FileName, "FileName") END,
        "FileSizeBytes" = COALESCE(p_FileSizeBytes, "FileSizeBytes"),
        "Width" = CASE WHEN p_Width_Clear = TRUE THEN NULL ELSE COALESCE(p_Width, "Width") END,
        "Height" = CASE WHEN p_Height_Clear = TRUE THEN NULL ELSE COALESCE(p_Height, "Height") END,
        "DurationSeconds" = CASE WHEN p_DurationSeconds_Clear = TRUE THEN NULL ELSE COALESCE(p_DurationSeconds, "DurationSeconds") END,
        "InlineData" = CASE WHEN p_InlineData_Clear = TRUE THEN NULL ELSE COALESCE(p_InlineData, "InlineData") END,
        "FileID" = CASE WHEN p_FileID_Clear = TRUE THEN NULL ELSE COALESCE(p_FileID, "FileID") END,
        "DisplayOrder" = COALESCE(p_DisplayOrder, "DisplayOrder"),
        "ThumbnailBase64" = CASE WHEN p_ThumbnailBase64_Clear = TRUE THEN NULL ELSE COALESCE(p_ThumbnailBase64, "ThumbnailBase64") END,
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "ArtifactVersionID" = CASE WHEN p_ArtifactVersionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ArtifactVersionID, "ArtifactVersionID") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwConversationDetailAttachments" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwConversationDetailAttachments" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateConversationDetailRating'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateConversationDetailRating"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Rating INTEGER DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwConversationDetailRatings" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ConversationDetailRating"
            (
                "ID",
                "ConversationDetailID",
                "UserID",
                "Rating",
                "Comments"
            )
        VALUES
            (
                p_ID,
                p_ConversationDetailID,
                p_UserID,
                p_Rating,
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ConversationDetailRating"
            (
                "ConversationDetailID",
                "UserID",
                "Rating",
                "Comments"
            )
        VALUES
            (
                p_ConversationDetailID,
                p_UserID,
                p_Rating,
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwConversationDetailRatings" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateConversationDetailRating'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateConversationDetailRating"(
    IN p_ID UUID,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Rating INTEGER DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwConversationDetailRatings" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ConversationDetailRating"
    SET
        "ConversationDetailID" = COALESCE(p_ConversationDetailID, "ConversationDetailID"),
        "UserID" = COALESCE(p_UserID, "UserID"),
        "Rating" = COALESCE(p_Rating, "Rating"),
        "Comments" = CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, "Comments") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwConversationDetailRatings" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwConversationDetailRatings" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteConversationDetailArtifact'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetailArtifact"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ConversationDetailArtifact"
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
           WHERE proname = 'spDeleteConversationDetailAttachment'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetailAttachment"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ConversationDetailAttachment"
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
           WHERE proname = 'spDeleteConversationDetailRating'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteConversationDetailRating"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ConversationDetailRating"
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
           WHERE proname = 'spCreateReport'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateReport"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_CategoryID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CategoryID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_SharingScope VARCHAR(20) DEFAULT NULL,
    IN p_ConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationID UUID DEFAULT NULL,
    IN p_ConversationDetailID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_DataContextID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DataContextID UUID DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_OutputTriggerTypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OutputTriggerTypeID UUID DEFAULT NULL,
    IN p_OutputFormatTypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OutputFormatTypeID UUID DEFAULT NULL,
    IN p_OutputDeliveryTypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OutputDeliveryTypeID UUID DEFAULT NULL,
    IN p_OutputFrequency_Clear BOOLEAN DEFAULT FALSE,
    IN p_OutputFrequency VARCHAR(50) DEFAULT NULL,
    IN p_OutputTargetEmail_Clear BOOLEAN DEFAULT FALSE,
    IN p_OutputTargetEmail VARCHAR(255) DEFAULT NULL,
    IN p_OutputWorkflowID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OutputWorkflowID UUID DEFAULT NULL,
    IN p_Thumbnail_Clear BOOLEAN DEFAULT FALSE,
    IN p_Thumbnail TEXT DEFAULT NULL,
    IN p_EnvironmentID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwReports" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."Report"
            (
                "ID",
                "Name",
                "Description",
                "CategoryID",
                "UserID",
                "SharingScope",
                "ConversationID",
                "ConversationDetailID",
                "DataContextID",
                "Configuration",
                "OutputTriggerTypeID",
                "OutputFormatTypeID",
                "OutputDeliveryTypeID",
                "OutputFrequency",
                "OutputTargetEmail",
                "OutputWorkflowID",
                "Thumbnail",
                "EnvironmentID"
            )
        VALUES
            (
                p_ID,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_CategoryID_Clear = TRUE THEN NULL ELSE COALESCE(p_CategoryID, NULL) END,
                p_UserID,
                COALESCE(p_SharingScope, 'Personal'),
                CASE WHEN p_ConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationID, NULL) END,
                CASE WHEN p_ConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailID, NULL) END,
                CASE WHEN p_DataContextID_Clear = TRUE THEN NULL ELSE COALESCE(p_DataContextID, NULL) END,
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END,
                CASE WHEN p_OutputTriggerTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputTriggerTypeID, NULL) END,
                CASE WHEN p_OutputFormatTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputFormatTypeID, NULL) END,
                CASE WHEN p_OutputDeliveryTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputDeliveryTypeID, NULL) END,
                CASE WHEN p_OutputFrequency_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputFrequency, NULL) END,
                CASE WHEN p_OutputTargetEmail_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputTargetEmail, NULL) END,
                CASE WHEN p_OutputWorkflowID_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputWorkflowID, NULL) END,
                CASE WHEN p_Thumbnail_Clear = TRUE THEN NULL ELSE COALESCE(p_Thumbnail, NULL) END,
                CASE WHEN p_EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."Report"
            (
                "Name",
                "Description",
                "CategoryID",
                "UserID",
                "SharingScope",
                "ConversationID",
                "ConversationDetailID",
                "DataContextID",
                "Configuration",
                "OutputTriggerTypeID",
                "OutputFormatTypeID",
                "OutputDeliveryTypeID",
                "OutputFrequency",
                "OutputTargetEmail",
                "OutputWorkflowID",
                "Thumbnail",
                "EnvironmentID"
            )
        VALUES
            (
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                CASE WHEN p_CategoryID_Clear = TRUE THEN NULL ELSE COALESCE(p_CategoryID, NULL) END,
                p_UserID,
                COALESCE(p_SharingScope, 'Personal'),
                CASE WHEN p_ConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationID, NULL) END,
                CASE WHEN p_ConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailID, NULL) END,
                CASE WHEN p_DataContextID_Clear = TRUE THEN NULL ELSE COALESCE(p_DataContextID, NULL) END,
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END,
                CASE WHEN p_OutputTriggerTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputTriggerTypeID, NULL) END,
                CASE WHEN p_OutputFormatTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputFormatTypeID, NULL) END,
                CASE WHEN p_OutputDeliveryTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputDeliveryTypeID, NULL) END,
                CASE WHEN p_OutputFrequency_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputFrequency, NULL) END,
                CASE WHEN p_OutputTargetEmail_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputTargetEmail, NULL) END,
                CASE WHEN p_OutputWorkflowID_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputWorkflowID, NULL) END,
                CASE WHEN p_Thumbnail_Clear = TRUE THEN NULL ELSE COALESCE(p_Thumbnail, NULL) END,
                CASE WHEN p_EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwReports" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateReport'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateReport"(
    IN p_ID UUID,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_CategoryID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CategoryID UUID DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_SharingScope VARCHAR(20) DEFAULT NULL,
    IN p_ConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationID UUID DEFAULT NULL,
    IN p_ConversationDetailID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_DataContextID_Clear BOOLEAN DEFAULT FALSE,
    IN p_DataContextID UUID DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_OutputTriggerTypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OutputTriggerTypeID UUID DEFAULT NULL,
    IN p_OutputFormatTypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OutputFormatTypeID UUID DEFAULT NULL,
    IN p_OutputDeliveryTypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OutputDeliveryTypeID UUID DEFAULT NULL,
    IN p_OutputFrequency_Clear BOOLEAN DEFAULT FALSE,
    IN p_OutputFrequency VARCHAR(50) DEFAULT NULL,
    IN p_OutputTargetEmail_Clear BOOLEAN DEFAULT FALSE,
    IN p_OutputTargetEmail VARCHAR(255) DEFAULT NULL,
    IN p_OutputWorkflowID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OutputWorkflowID UUID DEFAULT NULL,
    IN p_Thumbnail_Clear BOOLEAN DEFAULT FALSE,
    IN p_Thumbnail TEXT DEFAULT NULL,
    IN p_EnvironmentID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwReports" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."Report"
    SET
        "Name" = COALESCE(p_Name, "Name"),
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "CategoryID" = CASE WHEN p_CategoryID_Clear = TRUE THEN NULL ELSE COALESCE(p_CategoryID, "CategoryID") END,
        "UserID" = COALESCE(p_UserID, "UserID"),
        "SharingScope" = COALESCE(p_SharingScope, "SharingScope"),
        "ConversationID" = CASE WHEN p_ConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationID, "ConversationID") END,
        "ConversationDetailID" = CASE WHEN p_ConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailID, "ConversationDetailID") END,
        "DataContextID" = CASE WHEN p_DataContextID_Clear = TRUE THEN NULL ELSE COALESCE(p_DataContextID, "DataContextID") END,
        "Configuration" = CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, "Configuration") END,
        "OutputTriggerTypeID" = CASE WHEN p_OutputTriggerTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputTriggerTypeID, "OutputTriggerTypeID") END,
        "OutputFormatTypeID" = CASE WHEN p_OutputFormatTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputFormatTypeID, "OutputFormatTypeID") END,
        "OutputDeliveryTypeID" = CASE WHEN p_OutputDeliveryTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputDeliveryTypeID, "OutputDeliveryTypeID") END,
        "OutputFrequency" = CASE WHEN p_OutputFrequency_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputFrequency, "OutputFrequency") END,
        "OutputTargetEmail" = CASE WHEN p_OutputTargetEmail_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputTargetEmail, "OutputTargetEmail") END,
        "OutputWorkflowID" = CASE WHEN p_OutputWorkflowID_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputWorkflowID, "OutputWorkflowID") END,
        "Thumbnail" = CASE WHEN p_Thumbnail_Clear = TRUE THEN NULL ELSE COALESCE(p_Thumbnail, "Thumbnail") END,
        "EnvironmentID" = COALESCE(p_EnvironmentID, "EnvironmentID")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwReports" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwReports" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteReport'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteReport"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJReportSnapshots_ReportIDID UUID;
    p_MJReportUserStates_ReportIDID UUID;
    p_MJReportVersions_ReportIDID UUID;
BEGIN
-- Cascade delete from ReportSnapshot using cursor to call spDeleteReportSnapshot

    FOR _rec IN SELECT "ID" FROM __mj."ReportSnapshot" WHERE "ReportID" = p_ID
    LOOP
        p_MJReportSnapshots_ReportIDID := _rec."ID";
        PERFORM __mj."spDeleteReportSnapshot"(p_ID => p_MJReportSnapshots_ReportIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ReportUserState using cursor to call spDeleteReportUserState

    FOR _rec IN SELECT "ID" FROM __mj."ReportUserState" WHERE "ReportID" = p_ID
    LOOP
        p_MJReportUserStates_ReportIDID := _rec."ID";
        PERFORM __mj."spDeleteReportUserState"(p_ID => p_MJReportUserStates_ReportIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ReportVersion using cursor to call spDeleteReportVersion

    FOR _rec IN SELECT "ID" FROM __mj."ReportVersion" WHERE "ReportID" = p_ID
    LOOP
        p_MJReportVersions_ReportIDID := _rec."ID";
        PERFORM __mj."spDeleteReportVersion"(p_ID => p_MJReportVersions_ReportIDID);
        
    END LOOP;
    
    

    DELETE FROM
        __mj."Report"
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
           WHERE proname = 'spCreateTask'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateTask"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ParentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_TypeID UUID DEFAULT NULL,
    IN p_EnvironmentID UUID DEFAULT NULL,
    IN p_ProjectID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ProjectID UUID DEFAULT NULL,
    IN p_ConversationDetailID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_AgentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_PercentComplete_Clear BOOLEAN DEFAULT FALSE,
    IN p_PercentComplete INTEGER DEFAULT NULL,
    IN p_DueAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_DueAt TIMESTAMPTZ DEFAULT NULL,
    IN p_StartedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CompletedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompletedAt TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF __mj."vwTasks" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."Task"
            (
                "ID",
                "ParentID",
                "Name",
                "Description",
                "TypeID",
                "EnvironmentID",
                "ProjectID",
                "ConversationDetailID",
                "UserID",
                "AgentID",
                "Status",
                "PercentComplete",
                "DueAt",
                "StartedAt",
                "CompletedAt"
            )
        VALUES
            (
                p_ID,
                CASE WHEN p_ParentID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentID, NULL) END,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                p_TypeID,
                CASE WHEN p_EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                CASE WHEN p_ProjectID_Clear = TRUE THEN NULL ELSE COALESCE(p_ProjectID, NULL) END,
                CASE WHEN p_ConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailID, NULL) END,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_AgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentID, NULL) END,
                COALESCE(p_Status, 'Pending'),
                CASE WHEN p_PercentComplete_Clear = TRUE THEN NULL ELSE COALESCE(p_PercentComplete, 0) END,
                CASE WHEN p_DueAt_Clear = TRUE THEN NULL ELSE COALESCE(p_DueAt, NULL) END,
                CASE WHEN p_StartedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_StartedAt, NULL) END,
                CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."Task"
            (
                "ParentID",
                "Name",
                "Description",
                "TypeID",
                "EnvironmentID",
                "ProjectID",
                "ConversationDetailID",
                "UserID",
                "AgentID",
                "Status",
                "PercentComplete",
                "DueAt",
                "StartedAt",
                "CompletedAt"
            )
        VALUES
            (
                CASE WHEN p_ParentID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentID, NULL) END,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                p_TypeID,
                CASE WHEN p_EnvironmentID = '00000000-0000-0000-0000-000000000000' THEN 'F51358F3-9447-4176-B313-BF8025FD8D09' ELSE COALESCE(p_EnvironmentID, 'F51358F3-9447-4176-B313-BF8025FD8D09') END,
                CASE WHEN p_ProjectID_Clear = TRUE THEN NULL ELSE COALESCE(p_ProjectID, NULL) END,
                CASE WHEN p_ConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailID, NULL) END,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_AgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentID, NULL) END,
                COALESCE(p_Status, 'Pending'),
                CASE WHEN p_PercentComplete_Clear = TRUE THEN NULL ELSE COALESCE(p_PercentComplete, 0) END,
                CASE WHEN p_DueAt_Clear = TRUE THEN NULL ELSE COALESCE(p_DueAt, NULL) END,
                CASE WHEN p_StartedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_StartedAt, NULL) END,
                CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwTasks" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateTask'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateTask"(
    IN p_ID UUID,
    IN p_ParentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_TypeID UUID DEFAULT NULL,
    IN p_EnvironmentID UUID DEFAULT NULL,
    IN p_ProjectID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ProjectID UUID DEFAULT NULL,
    IN p_ConversationDetailID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_AgentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_PercentComplete_Clear BOOLEAN DEFAULT FALSE,
    IN p_PercentComplete INTEGER DEFAULT NULL,
    IN p_DueAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_DueAt TIMESTAMPTZ DEFAULT NULL,
    IN p_StartedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CompletedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompletedAt TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF __mj."vwTasks" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."Task"
    SET
        "ParentID" = CASE WHEN p_ParentID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentID, "ParentID") END,
        "Name" = COALESCE(p_Name, "Name"),
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "TypeID" = COALESCE(p_TypeID, "TypeID"),
        "EnvironmentID" = COALESCE(p_EnvironmentID, "EnvironmentID"),
        "ProjectID" = CASE WHEN p_ProjectID_Clear = TRUE THEN NULL ELSE COALESCE(p_ProjectID, "ProjectID") END,
        "ConversationDetailID" = CASE WHEN p_ConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailID, "ConversationDetailID") END,
        "UserID" = CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, "UserID") END,
        "AgentID" = CASE WHEN p_AgentID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentID, "AgentID") END,
        "Status" = COALESCE(p_Status, "Status"),
        "PercentComplete" = CASE WHEN p_PercentComplete_Clear = TRUE THEN NULL ELSE COALESCE(p_PercentComplete, "PercentComplete") END,
        "DueAt" = CASE WHEN p_DueAt_Clear = TRUE THEN NULL ELSE COALESCE(p_DueAt, "DueAt") END,
        "StartedAt" = CASE WHEN p_StartedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_StartedAt, "StartedAt") END,
        "CompletedAt" = CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, "CompletedAt") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwTasks" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwTasks" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTask'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTask"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Task"
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
           WHERE proname = 'spCreateAIAgentRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgentRuns"
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
    FOREACH v_field_name IN ARRAY ARRAY['AgentID', 'ParentRunID', 'Status', 'StartedAt', 'CompletedAt', 'Success', 'ErrorMessage', 'ConversationID', 'UserID', 'Result', 'AgentState', 'TotalTokensUsed', 'TotalCost', 'TotalPromptTokensUsed', 'TotalCompletionTokensUsed', 'TotalTokensUsedRollup', 'TotalPromptTokensUsedRollup', 'TotalCompletionTokensUsedRollup', 'TotalCostRollup', 'ConversationDetailID', 'ConversationDetailSequence', 'CancellationReason', 'FinalStep', 'FinalPayload', 'Message', 'LastRunID', 'StartingPayload', 'TotalPromptIterations', 'ConfigurationID', 'OverrideModelID', 'OverrideVendorID', 'Data', 'Verbose', 'EffortLevel', 'RunName', 'Comments', 'ScheduledJobRunID', 'TestRunID', 'PrimaryScopeEntityID', 'PrimaryScopeRecordID', 'SecondaryScopes', 'ExternalReferenceID', 'CompanyID', 'TotalCacheReadTokensUsed', 'TotalCacheWriteTokensUsed', 'LastHeartbeatAt', 'AgentSessionID']
    LOOP
        IF p_data ? v_field_name AND jsonb_typeof(p_data->v_field_name) <> 'null' THEN
            v_cast_expr := CASE v_field_name
                WHEN 'AgentID' THEN '($1->>''AgentID'')::UUID'
                WHEN 'ParentRunID' THEN '($1->>''ParentRunID'')::UUID'
                WHEN 'Status' THEN '($1->>''Status'')'
                WHEN 'StartedAt' THEN '($1->>''StartedAt'')::TIMESTAMPTZ'
                WHEN 'CompletedAt' THEN '($1->>''CompletedAt'')::TIMESTAMPTZ'
                WHEN 'Success' THEN '($1->>''Success'')::BOOLEAN'
                WHEN 'ErrorMessage' THEN '($1->>''ErrorMessage'')'
                WHEN 'ConversationID' THEN '($1->>''ConversationID'')::UUID'
                WHEN 'UserID' THEN '($1->>''UserID'')::UUID'
                WHEN 'Result' THEN '($1->>''Result'')'
                WHEN 'AgentState' THEN '($1->>''AgentState'')'
                WHEN 'TotalTokensUsed' THEN '($1->>''TotalTokensUsed'')::INTEGER'
                WHEN 'TotalCost' THEN '($1->>''TotalCost'')::NUMERIC(18,6)'
                WHEN 'TotalPromptTokensUsed' THEN '($1->>''TotalPromptTokensUsed'')::INTEGER'
                WHEN 'TotalCompletionTokensUsed' THEN '($1->>''TotalCompletionTokensUsed'')::INTEGER'
                WHEN 'TotalTokensUsedRollup' THEN '($1->>''TotalTokensUsedRollup'')::INTEGER'
                WHEN 'TotalPromptTokensUsedRollup' THEN '($1->>''TotalPromptTokensUsedRollup'')::INTEGER'
                WHEN 'TotalCompletionTokensUsedRollup' THEN '($1->>''TotalCompletionTokensUsedRollup'')::INTEGER'
                WHEN 'TotalCostRollup' THEN '($1->>''TotalCostRollup'')::NUMERIC(19,8)'
                WHEN 'ConversationDetailID' THEN '($1->>''ConversationDetailID'')::UUID'
                WHEN 'ConversationDetailSequence' THEN '($1->>''ConversationDetailSequence'')::INTEGER'
                WHEN 'CancellationReason' THEN '($1->>''CancellationReason'')'
                WHEN 'FinalStep' THEN '($1->>''FinalStep'')'
                WHEN 'FinalPayload' THEN '($1->>''FinalPayload'')'
                WHEN 'Message' THEN '($1->>''Message'')'
                WHEN 'LastRunID' THEN '($1->>''LastRunID'')::UUID'
                WHEN 'StartingPayload' THEN '($1->>''StartingPayload'')'
                WHEN 'TotalPromptIterations' THEN '($1->>''TotalPromptIterations'')::INTEGER'
                WHEN 'ConfigurationID' THEN '($1->>''ConfigurationID'')::UUID'
                WHEN 'OverrideModelID' THEN '($1->>''OverrideModelID'')::UUID'
                WHEN 'OverrideVendorID' THEN '($1->>''OverrideVendorID'')::UUID'
                WHEN 'Data' THEN '($1->>''Data'')'
                WHEN 'Verbose' THEN '($1->>''Verbose'')::BOOLEAN'
                WHEN 'EffortLevel' THEN '($1->>''EffortLevel'')::INTEGER'
                WHEN 'RunName' THEN '($1->>''RunName'')'
                WHEN 'Comments' THEN '($1->>''Comments'')'
                WHEN 'ScheduledJobRunID' THEN '($1->>''ScheduledJobRunID'')::UUID'
                WHEN 'TestRunID' THEN '($1->>''TestRunID'')::UUID'
                WHEN 'PrimaryScopeEntityID' THEN '($1->>''PrimaryScopeEntityID'')::UUID'
                WHEN 'PrimaryScopeRecordID' THEN '($1->>''PrimaryScopeRecordID'')'
                WHEN 'SecondaryScopes' THEN '($1->>''SecondaryScopes'')'
                WHEN 'ExternalReferenceID' THEN '($1->>''ExternalReferenceID'')'
                WHEN 'CompanyID' THEN '($1->>''CompanyID'')::UUID'
                WHEN 'TotalCacheReadTokensUsed' THEN '($1->>''TotalCacheReadTokensUsed'')::INTEGER'
                WHEN 'TotalCacheWriteTokensUsed' THEN '($1->>''TotalCacheWriteTokensUsed'')::INTEGER'
                WHEN 'LastHeartbeatAt' THEN '($1->>''LastHeartbeatAt'')::TIMESTAMPTZ'
                WHEN 'AgentSessionID' THEN '($1->>''AgentSessionID'')::UUID'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format('INSERT INTO __mj."AIAgentRun" (%s) VALUES (%s)', v_col_list, v_val_list);
    EXECUTE v_sql USING p_data;

    RETURN QUERY SELECT * FROM __mj."vwAIAgentRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIAgentRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIAgentRuns"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIAgentRun: p_data must include "ID"';
    END IF;

    UPDATE __mj."AIAgentRun" SET
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
        "TotalTokensUsed" = CASE WHEN p_data ? 'TotalTokensUsed' THEN (p_data->>'TotalTokensUsed')::INTEGER ELSE "TotalTokensUsed" END,
        "TotalCost" = CASE WHEN p_data ? 'TotalCost' THEN (p_data->>'TotalCost')::NUMERIC(18,6) ELSE "TotalCost" END,
        "TotalPromptTokensUsed" = CASE WHEN p_data ? 'TotalPromptTokensUsed' THEN (p_data->>'TotalPromptTokensUsed')::INTEGER ELSE "TotalPromptTokensUsed" END,
        "TotalCompletionTokensUsed" = CASE WHEN p_data ? 'TotalCompletionTokensUsed' THEN (p_data->>'TotalCompletionTokensUsed')::INTEGER ELSE "TotalCompletionTokensUsed" END,
        "TotalTokensUsedRollup" = CASE WHEN p_data ? 'TotalTokensUsedRollup' THEN (p_data->>'TotalTokensUsedRollup')::INTEGER ELSE "TotalTokensUsedRollup" END,
        "TotalPromptTokensUsedRollup" = CASE WHEN p_data ? 'TotalPromptTokensUsedRollup' THEN (p_data->>'TotalPromptTokensUsedRollup')::INTEGER ELSE "TotalPromptTokensUsedRollup" END,
        "TotalCompletionTokensUsedRollup" = CASE WHEN p_data ? 'TotalCompletionTokensUsedRollup' THEN (p_data->>'TotalCompletionTokensUsedRollup')::INTEGER ELSE "TotalCompletionTokensUsedRollup" END,
        "TotalCostRollup" = CASE WHEN p_data ? 'TotalCostRollup' THEN (p_data->>'TotalCostRollup')::NUMERIC(19,8) ELSE "TotalCostRollup" END,
        "ConversationDetailID" = CASE WHEN p_data ? 'ConversationDetailID' THEN (p_data->>'ConversationDetailID')::UUID ELSE "ConversationDetailID" END,
        "ConversationDetailSequence" = CASE WHEN p_data ? 'ConversationDetailSequence' THEN (p_data->>'ConversationDetailSequence')::INTEGER ELSE "ConversationDetailSequence" END,
        "CancellationReason" = CASE WHEN p_data ? 'CancellationReason' THEN (p_data->>'CancellationReason') ELSE "CancellationReason" END,
        "FinalStep" = CASE WHEN p_data ? 'FinalStep' THEN (p_data->>'FinalStep') ELSE "FinalStep" END,
        "FinalPayload" = CASE WHEN p_data ? 'FinalPayload' THEN (p_data->>'FinalPayload') ELSE "FinalPayload" END,
        "Message" = CASE WHEN p_data ? 'Message' THEN (p_data->>'Message') ELSE "Message" END,
        "LastRunID" = CASE WHEN p_data ? 'LastRunID' THEN (p_data->>'LastRunID')::UUID ELSE "LastRunID" END,
        "StartingPayload" = CASE WHEN p_data ? 'StartingPayload' THEN (p_data->>'StartingPayload') ELSE "StartingPayload" END,
        "TotalPromptIterations" = CASE WHEN p_data ? 'TotalPromptIterations' THEN (p_data->>'TotalPromptIterations')::INTEGER ELSE "TotalPromptIterations" END,
        "ConfigurationID" = CASE WHEN p_data ? 'ConfigurationID' THEN (p_data->>'ConfigurationID')::UUID ELSE "ConfigurationID" END,
        "OverrideModelID" = CASE WHEN p_data ? 'OverrideModelID' THEN (p_data->>'OverrideModelID')::UUID ELSE "OverrideModelID" END,
        "OverrideVendorID" = CASE WHEN p_data ? 'OverrideVendorID' THEN (p_data->>'OverrideVendorID')::UUID ELSE "OverrideVendorID" END,
        "Data" = CASE WHEN p_data ? 'Data' THEN (p_data->>'Data') ELSE "Data" END,
        "Verbose" = CASE WHEN p_data ? 'Verbose' THEN (p_data->>'Verbose')::BOOLEAN ELSE "Verbose" END,
        "EffortLevel" = CASE WHEN p_data ? 'EffortLevel' THEN (p_data->>'EffortLevel')::INTEGER ELSE "EffortLevel" END,
        "RunName" = CASE WHEN p_data ? 'RunName' THEN (p_data->>'RunName') ELSE "RunName" END,
        "Comments" = CASE WHEN p_data ? 'Comments' THEN (p_data->>'Comments') ELSE "Comments" END,
        "ScheduledJobRunID" = CASE WHEN p_data ? 'ScheduledJobRunID' THEN (p_data->>'ScheduledJobRunID')::UUID ELSE "ScheduledJobRunID" END,
        "TestRunID" = CASE WHEN p_data ? 'TestRunID' THEN (p_data->>'TestRunID')::UUID ELSE "TestRunID" END,
        "PrimaryScopeEntityID" = CASE WHEN p_data ? 'PrimaryScopeEntityID' THEN (p_data->>'PrimaryScopeEntityID')::UUID ELSE "PrimaryScopeEntityID" END,
        "PrimaryScopeRecordID" = CASE WHEN p_data ? 'PrimaryScopeRecordID' THEN (p_data->>'PrimaryScopeRecordID') ELSE "PrimaryScopeRecordID" END,
        "SecondaryScopes" = CASE WHEN p_data ? 'SecondaryScopes' THEN (p_data->>'SecondaryScopes') ELSE "SecondaryScopes" END,
        "ExternalReferenceID" = CASE WHEN p_data ? 'ExternalReferenceID' THEN (p_data->>'ExternalReferenceID') ELSE "ExternalReferenceID" END,
        "CompanyID" = CASE WHEN p_data ? 'CompanyID' THEN (p_data->>'CompanyID')::UUID ELSE "CompanyID" END,
        "TotalCacheReadTokensUsed" = CASE WHEN p_data ? 'TotalCacheReadTokensUsed' THEN (p_data->>'TotalCacheReadTokensUsed')::INTEGER ELSE "TotalCacheReadTokensUsed" END,
        "TotalCacheWriteTokensUsed" = CASE WHEN p_data ? 'TotalCacheWriteTokensUsed' THEN (p_data->>'TotalCacheWriteTokensUsed')::INTEGER ELSE "TotalCacheWriteTokensUsed" END,
        "LastHeartbeatAt" = CASE WHEN p_data ? 'LastHeartbeatAt' THEN (p_data->>'LastHeartbeatAt')::TIMESTAMPTZ ELSE "LastHeartbeatAt" END,
        "AgentSessionID" = CASE WHEN p_data ? 'AgentSessionID' THEN (p_data->>'AgentSessionID')::UUID ELSE "AgentSessionID" END,
        "__mj_UpdatedAt" = NOW()
    WHERE "ID" = v_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY SELECT * FROM __mj."vwAIAgentRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRun"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJAIAgentExamples_SourceAIAgentRunIDID UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_AgentID UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_UserID UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_CompanyID UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_Type VARCHAR(20);
    p_MJAIAgentExamples_SourceAIAgentRunID_ExampleInput TEXT;
    p_MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput TEXT;
    p_MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated BOOLEAN;
    p_MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_SourceConversation_a05cb8 UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_SuccessScore NUMERIC(5,2);
    p_MJAIAgentExamples_SourceAIAgentRunID_Comments TEXT;
    p_MJAIAgentExamples_SourceAIAgentRunID_Status VARCHAR(20);
    p_MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector TEXT;
    p_MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID UUID;
    p_MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes TEXT;
    p_MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt TIMESTAMPTZ;
    p_MJAIAgentExamples_SourceAIAgentRunID_AccessCount INTEGER;
    p_MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceAIAgentRunIDID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_AgentID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_Note TEXT;
    p_MJAIAgentNotes_SourceAIAgentRunID_UserID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_Type VARCHAR(20);
    p_MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated BOOLEAN;
    p_MJAIAgentNotes_SourceAIAgentRunID_Comments TEXT;
    p_MJAIAgentNotes_SourceAIAgentRunID_Status VARCHAR(20);
    p_MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_CompanyID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector TEXT;
    p_MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes TEXT;
    p_MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceAIAgentRunID_AccessCount INTEGER;
    p_MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID UUID;
    p_MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount INTEGER;
    p_MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs TEXT;
    p_MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier VARCHAR(20);
    p_MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore NUMERIC(5,2);
    p_MJAIAgentNotes_SourceAIAgentRunID_AuthorType VARCHAR(20);
    p_MJAIAgentRequests_OriginatingAgentRunIDID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunID_AgentID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunID_RequestedAt TIMESTAMPTZ;
    p_MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunID_Status VARCHAR(20);
    p_MJAIAgentRequests_OriginatingAgentRunID_Request TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunID_Response TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunID_RespondedAt TIMESTAMPTZ;
    p_MJAIAgentRequests_OriginatingAgentRunID_Comments TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunID_ResponseData TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunID_Priority INTEGER;
    p_MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgen_2294cf UUID;
    p_MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunID_ResponseSource VARCHAR(20);
    p_MJAIAgentRequests_ResumingAgentRunIDID UUID;
    p_MJAIAgentRequests_ResumingAgentRunID_AgentID UUID;
    p_MJAIAgentRequests_ResumingAgentRunID_RequestedAt TIMESTAMPTZ;
    p_MJAIAgentRequests_ResumingAgentRunID_RequestForUserID UUID;
    p_MJAIAgentRequests_ResumingAgentRunID_Status VARCHAR(20);
    p_MJAIAgentRequests_ResumingAgentRunID_Request TEXT;
    p_MJAIAgentRequests_ResumingAgentRunID_Response TEXT;
    p_MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID UUID;
    p_MJAIAgentRequests_ResumingAgentRunID_RespondedAt TIMESTAMPTZ;
    p_MJAIAgentRequests_ResumingAgentRunID_Comments TEXT;
    p_MJAIAgentRequests_ResumingAgentRunID_RequestTypeID UUID;
    p_MJAIAgentRequests_ResumingAgentRunID_ResponseSchema TEXT;
    p_MJAIAgentRequests_ResumingAgentRunID_ResponseData TEXT;
    p_MJAIAgentRequests_ResumingAgentRunID_Priority INTEGER;
    p_MJAIAgentRequests_ResumingAgentRunID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID UUID;
    p_MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRu_4faa57 UUID;
    p_MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID UUID;
    p_MJAIAgentRequests_ResumingAgentRunID_ResponseSource VARCHAR(20);
    p_MJAIAgentRunMedias_AgentRunIDID UUID;
    p_MJAIAgentRunSteps_AgentRunIDID UUID;
    p_MJAIAgentRuns_ParentRunIDID UUID;
    p_MJAIAgentRuns_ParentRunID_AgentID UUID;
    p_MJAIAgentRuns_ParentRunID_ParentRunID UUID;
    p_MJAIAgentRuns_ParentRunID_Status VARCHAR(50);
    p_MJAIAgentRuns_ParentRunID_StartedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ParentRunID_CompletedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ParentRunID_Success BOOLEAN;
    p_MJAIAgentRuns_ParentRunID_ErrorMessage TEXT;
    p_MJAIAgentRuns_ParentRunID_ConversationID UUID;
    p_MJAIAgentRuns_ParentRunID_UserID UUID;
    p_MJAIAgentRuns_ParentRunID_Result TEXT;
    p_MJAIAgentRuns_ParentRunID_AgentState TEXT;
    p_MJAIAgentRuns_ParentRunID_TotalTokensUsed INTEGER;
    p_MJAIAgentRuns_ParentRunID_TotalCost NUMERIC(18,6);
    p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed INTEGER;
    p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed INTEGER;
    p_MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ParentRunID_TotalCostRollup NUMERIC(19,8);
    p_MJAIAgentRuns_ParentRunID_ConversationDetailID UUID;
    p_MJAIAgentRuns_ParentRunID_ConversationDetailSequence INTEGER;
    p_MJAIAgentRuns_ParentRunID_CancellationReason VARCHAR(30);
    p_MJAIAgentRuns_ParentRunID_FinalStep VARCHAR(30);
    p_MJAIAgentRuns_ParentRunID_FinalPayload TEXT;
    p_MJAIAgentRuns_ParentRunID_Message TEXT;
    p_MJAIAgentRuns_ParentRunID_LastRunID UUID;
    p_MJAIAgentRuns_ParentRunID_StartingPayload TEXT;
    p_MJAIAgentRuns_ParentRunID_TotalPromptIterations INTEGER;
    p_MJAIAgentRuns_ParentRunID_ConfigurationID UUID;
    p_MJAIAgentRuns_ParentRunID_OverrideModelID UUID;
    p_MJAIAgentRuns_ParentRunID_OverrideVendorID UUID;
    p_MJAIAgentRuns_ParentRunID_Data TEXT;
    p_MJAIAgentRuns_ParentRunID_Verbose BOOLEAN;
    p_MJAIAgentRuns_ParentRunID_EffortLevel INTEGER;
    p_MJAIAgentRuns_ParentRunID_RunName VARCHAR(255);
    p_MJAIAgentRuns_ParentRunID_Comments TEXT;
    p_MJAIAgentRuns_ParentRunID_ScheduledJobRunID UUID;
    p_MJAIAgentRuns_ParentRunID_TestRunID UUID;
    p_MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID UUID;
    p_MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentRuns_ParentRunID_SecondaryScopes TEXT;
    p_MJAIAgentRuns_ParentRunID_ExternalReferenceID VARCHAR(200);
    p_MJAIAgentRuns_ParentRunID_CompanyID UUID;
    p_MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed INTEGER;
    p_MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed INTEGER;
    p_MJAIAgentRuns_ParentRunID_LastHeartbeatAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ParentRunID_AgentSessionID UUID;
    p_MJAIAgentRuns_LastRunIDID UUID;
    p_MJAIAgentRuns_LastRunID_AgentID UUID;
    p_MJAIAgentRuns_LastRunID_ParentRunID UUID;
    p_MJAIAgentRuns_LastRunID_Status VARCHAR(50);
    p_MJAIAgentRuns_LastRunID_StartedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_LastRunID_CompletedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_LastRunID_Success BOOLEAN;
    p_MJAIAgentRuns_LastRunID_ErrorMessage TEXT;
    p_MJAIAgentRuns_LastRunID_ConversationID UUID;
    p_MJAIAgentRuns_LastRunID_UserID UUID;
    p_MJAIAgentRuns_LastRunID_Result TEXT;
    p_MJAIAgentRuns_LastRunID_AgentState TEXT;
    p_MJAIAgentRuns_LastRunID_TotalTokensUsed INTEGER;
    p_MJAIAgentRuns_LastRunID_TotalCost NUMERIC(18,6);
    p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsed INTEGER;
    p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed INTEGER;
    p_MJAIAgentRuns_LastRunID_TotalTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_LastRunID_TotalCostRollup NUMERIC(19,8);
    p_MJAIAgentRuns_LastRunID_ConversationDetailID UUID;
    p_MJAIAgentRuns_LastRunID_ConversationDetailSequence INTEGER;
    p_MJAIAgentRuns_LastRunID_CancellationReason VARCHAR(30);
    p_MJAIAgentRuns_LastRunID_FinalStep VARCHAR(30);
    p_MJAIAgentRuns_LastRunID_FinalPayload TEXT;
    p_MJAIAgentRuns_LastRunID_Message TEXT;
    p_MJAIAgentRuns_LastRunID_LastRunID UUID;
    p_MJAIAgentRuns_LastRunID_StartingPayload TEXT;
    p_MJAIAgentRuns_LastRunID_TotalPromptIterations INTEGER;
    p_MJAIAgentRuns_LastRunID_ConfigurationID UUID;
    p_MJAIAgentRuns_LastRunID_OverrideModelID UUID;
    p_MJAIAgentRuns_LastRunID_OverrideVendorID UUID;
    p_MJAIAgentRuns_LastRunID_Data TEXT;
    p_MJAIAgentRuns_LastRunID_Verbose BOOLEAN;
    p_MJAIAgentRuns_LastRunID_EffortLevel INTEGER;
    p_MJAIAgentRuns_LastRunID_RunName VARCHAR(255);
    p_MJAIAgentRuns_LastRunID_Comments TEXT;
    p_MJAIAgentRuns_LastRunID_ScheduledJobRunID UUID;
    p_MJAIAgentRuns_LastRunID_TestRunID UUID;
    p_MJAIAgentRuns_LastRunID_PrimaryScopeEntityID UUID;
    p_MJAIAgentRuns_LastRunID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentRuns_LastRunID_SecondaryScopes TEXT;
    p_MJAIAgentRuns_LastRunID_ExternalReferenceID VARCHAR(200);
    p_MJAIAgentRuns_LastRunID_CompanyID UUID;
    p_MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed INTEGER;
    p_MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed INTEGER;
    p_MJAIAgentRuns_LastRunID_LastHeartbeatAt TIMESTAMPTZ;
    p_MJAIAgentRuns_LastRunID_AgentSessionID UUID;
    p_MJAIPromptRuns_AgentRunIDID UUID;
    p_MJAIPromptRuns_AgentRunID_PromptID UUID;
    p_MJAIPromptRuns_AgentRunID_ModelID UUID;
    p_MJAIPromptRuns_AgentRunID_VendorID UUID;
    p_MJAIPromptRuns_AgentRunID_AgentID UUID;
    p_MJAIPromptRuns_AgentRunID_ConfigurationID UUID;
    p_MJAIPromptRuns_AgentRunID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentRunID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentRunID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_AgentRunID_Messages TEXT;
    p_MJAIPromptRuns_AgentRunID_Result TEXT;
    p_MJAIPromptRuns_AgentRunID_TokensUsed INTEGER;
    p_MJAIPromptRuns_AgentRunID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_AgentRunID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_AgentRunID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_AgentRunID_Success BOOLEAN;
    p_MJAIPromptRuns_AgentRunID_ErrorMessage TEXT;
    p_MJAIPromptRuns_AgentRunID_ParentID UUID;
    p_MJAIPromptRuns_AgentRunID_RunType VARCHAR(20);
    p_MJAIPromptRuns_AgentRunID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_AgentRunID_AgentRunID UUID;
    p_MJAIPromptRuns_AgentRunID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_AgentRunID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_AgentRunID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_AgentRunID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_AgentRunID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_AgentRunID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_AgentRunID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_AgentRunID_TopK INTEGER;
    p_MJAIPromptRuns_AgentRunID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_AgentRunID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_AgentRunID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_AgentRunID_Seed INTEGER;
    p_MJAIPromptRuns_AgentRunID_StopSequences TEXT;
    p_MJAIPromptRuns_AgentRunID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_AgentRunID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_AgentRunID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_AgentRunID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_AgentRunID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_AgentRunID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_AgentRunID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_AgentRunID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_AgentRunID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_AgentRunID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_AgentRunID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_AgentRunID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_AgentRunID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_AgentRunID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentRunID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentRunID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_AgentRunID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_AgentRunID_ValidationSummary TEXT;
    p_MJAIPromptRuns_AgentRunID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_AgentRunID_FailoverErrors TEXT;
    p_MJAIPromptRuns_AgentRunID_FailoverDurations TEXT;
    p_MJAIPromptRuns_AgentRunID_OriginalModelID UUID;
    p_MJAIPromptRuns_AgentRunID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_AgentRunID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_AgentRunID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_AgentRunID_ModelSelection TEXT;
    p_MJAIPromptRuns_AgentRunID_Status VARCHAR(50);
    p_MJAIPromptRuns_AgentRunID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_AgentRunID_CancellationReason TEXT;
    p_MJAIPromptRuns_AgentRunID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_AgentRunID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_AgentRunID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_AgentRunID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_AgentRunID_JudgeID UUID;
    p_MJAIPromptRuns_AgentRunID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_AgentRunID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_AgentRunID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_AgentRunID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_AgentRunID_ErrorDetails TEXT;
    p_MJAIPromptRuns_AgentRunID_ChildPromptID UUID;
    p_MJAIPromptRuns_AgentRunID_QueueTime INTEGER;
    p_MJAIPromptRuns_AgentRunID_PromptTime INTEGER;
    p_MJAIPromptRuns_AgentRunID_CompletionTime INTEGER;
    p_MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails TEXT;
    p_MJAIPromptRuns_AgentRunID_EffortLevel INTEGER;
    p_MJAIPromptRuns_AgentRunID_RunName VARCHAR(255);
    p_MJAIPromptRuns_AgentRunID_Comments TEXT;
    p_MJAIPromptRuns_AgentRunID_TestRunID UUID;
    p_MJAIPromptRuns_AgentRunID_AssistantPrefill TEXT;
    p_MJAIPromptRuns_AgentRunID_TokensCacheRead INTEGER;
    p_MJAIPromptRuns_AgentRunID_TokensCacheWrite INTEGER;
    p_MJAIPromptRuns_AgentRunID_TokensCacheReadRollup INTEGER;
    p_MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup INTEGER;
BEGIN
-- Cascade update on AIAgentExample using cursor to call spUpdateAIAgentExample


    FOR _rec IN SELECT "ID", "AgentID", "UserID", "CompanyID", "Type", "ExampleInput", "ExampleOutput", "IsAutoGenerated", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "SuccessScore", "Comments", "Status", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt" FROM __mj."AIAgentExample" WHERE "SourceAIAgentRunID" = p_ID
    LOOP
        p_MJAIAgentExamples_SourceAIAgentRunIDID := _rec."ID";
        p_MJAIAgentExamples_SourceAIAgentRunID_AgentID := _rec."AgentID";
        p_MJAIAgentExamples_SourceAIAgentRunID_UserID := _rec."UserID";
        p_MJAIAgentExamples_SourceAIAgentRunID_CompanyID := _rec."CompanyID";
        p_MJAIAgentExamples_SourceAIAgentRunID_Type := _rec."Type";
        p_MJAIAgentExamples_SourceAIAgentRunID_ExampleInput := _rec."ExampleInput";
        p_MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput := _rec."ExampleOutput";
        p_MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated := _rec."IsAutoGenerated";
        p_MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID := _rec."SourceConversationID";
        p_MJAIAgentExamples_SourceAIAgentRunID_SourceConversation_a05cb8 := _rec."SourceConversationDetailID";
        p_MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID := _rec."SourceAIAgentRunID";
        p_MJAIAgentExamples_SourceAIAgentRunID_SuccessScore := _rec."SuccessScore";
        p_MJAIAgentExamples_SourceAIAgentRunID_Comments := _rec."Comments";
        p_MJAIAgentExamples_SourceAIAgentRunID_Status := _rec."Status";
        p_MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector := _rec."EmbeddingVector";
        p_MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt := _rec."LastAccessedAt";
        p_MJAIAgentExamples_SourceAIAgentRunID_AccessCount := _rec."AccessCount";
        p_MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt := _rec."ExpiresAt";
        -- Set the FK field to NULL
        p_MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentExample"(p_ID => p_MJAIAgentExamples_SourceAIAgentRunIDID, p_AgentID => p_MJAIAgentExamples_SourceAIAgentRunID_AgentID, p_UserID => p_MJAIAgentExamples_SourceAIAgentRunID_UserID, p_CompanyID => p_MJAIAgentExamples_SourceAIAgentRunID_CompanyID, p_Type => p_MJAIAgentExamples_SourceAIAgentRunID_Type, p_ExampleInput => p_MJAIAgentExamples_SourceAIAgentRunID_ExampleInput, p_ExampleOutput => p_MJAIAgentExamples_SourceAIAgentRunID_ExampleOutput, p_IsAutoGenerated => p_MJAIAgentExamples_SourceAIAgentRunID_IsAutoGenerated, p_SourceConversationID => p_MJAIAgentExamples_SourceAIAgentRunID_SourceConversationID, p_SourceConversationDetailID => p_MJAIAgentExamples_SourceAIAgentRunID_SourceConversation_a05cb8, p_SourceAIAgentRunID_Clear => 1, p_SourceAIAgentRunID => p_MJAIAgentExamples_SourceAIAgentRunID_SourceAIAgentRunID, p_SuccessScore => p_MJAIAgentExamples_SourceAIAgentRunID_SuccessScore, p_Comments => p_MJAIAgentExamples_SourceAIAgentRunID_Comments, p_Status => p_MJAIAgentExamples_SourceAIAgentRunID_Status, p_EmbeddingVector => p_MJAIAgentExamples_SourceAIAgentRunID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentExamples_SourceAIAgentRunID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentExamples_SourceAIAgentRunID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentExamples_SourceAIAgentRunID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentExamples_SourceAIAgentRunID_LastAccessedAt, p_AccessCount => p_MJAIAgentExamples_SourceAIAgentRunID_AccessCount, p_ExpiresAt => p_MJAIAgentExamples_SourceAIAgentRunID_ExpiresAt);

    END LOOP;

    
    -- Cascade update on AIAgentNote using cursor to call spUpdateAIAgentNote


    FOR _rec IN SELECT "ID", "AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt", "ConsolidatedIntoNoteID", "ConsolidationCount", "DerivedFromNoteIDs", "ProtectionTier", "ImportanceScore", "AuthorType" FROM __mj."AIAgentNote" WHERE "SourceAIAgentRunID" = p_ID
    LOOP
        p_MJAIAgentNotes_SourceAIAgentRunIDID := _rec."ID";
        p_MJAIAgentNotes_SourceAIAgentRunID_AgentID := _rec."AgentID";
        p_MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID := _rec."AgentNoteTypeID";
        p_MJAIAgentNotes_SourceAIAgentRunID_Note := _rec."Note";
        p_MJAIAgentNotes_SourceAIAgentRunID_UserID := _rec."UserID";
        p_MJAIAgentNotes_SourceAIAgentRunID_Type := _rec."Type";
        p_MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated := _rec."IsAutoGenerated";
        p_MJAIAgentNotes_SourceAIAgentRunID_Comments := _rec."Comments";
        p_MJAIAgentNotes_SourceAIAgentRunID_Status := _rec."Status";
        p_MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID := _rec."SourceConversationID";
        p_MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID := _rec."SourceConversationDetailID";
        p_MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID := _rec."SourceAIAgentRunID";
        p_MJAIAgentNotes_SourceAIAgentRunID_CompanyID := _rec."CompanyID";
        p_MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector := _rec."EmbeddingVector";
        p_MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID := _rec."EmbeddingModelID";
        p_MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt := _rec."LastAccessedAt";
        p_MJAIAgentNotes_SourceAIAgentRunID_AccessCount := _rec."AccessCount";
        p_MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt := _rec."ExpiresAt";
        p_MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID := _rec."ConsolidatedIntoNoteID";
        p_MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount := _rec."ConsolidationCount";
        p_MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs := _rec."DerivedFromNoteIDs";
        p_MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier := _rec."ProtectionTier";
        p_MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore := _rec."ImportanceScore";
        p_MJAIAgentNotes_SourceAIAgentRunID_AuthorType := _rec."AuthorType";
        -- Set the FK field to NULL
        p_MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentNote"(p_ID => p_MJAIAgentNotes_SourceAIAgentRunIDID, p_AgentID => p_MJAIAgentNotes_SourceAIAgentRunID_AgentID, p_AgentNoteTypeID => p_MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, p_Note => p_MJAIAgentNotes_SourceAIAgentRunID_Note, p_UserID => p_MJAIAgentNotes_SourceAIAgentRunID_UserID, p_Type => p_MJAIAgentNotes_SourceAIAgentRunID_Type, p_IsAutoGenerated => p_MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, p_Comments => p_MJAIAgentNotes_SourceAIAgentRunID_Comments, p_Status => p_MJAIAgentNotes_SourceAIAgentRunID_Status, p_SourceConversationID => p_MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, p_SourceConversationDetailID => p_MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, p_SourceAIAgentRunID_Clear => 1, p_SourceAIAgentRunID => p_MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, p_CompanyID => p_MJAIAgentNotes_SourceAIAgentRunID_CompanyID, p_EmbeddingVector => p_MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, p_AccessCount => p_MJAIAgentNotes_SourceAIAgentRunID_AccessCount, p_ExpiresAt => p_MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, p_ConsolidatedIntoNoteID => p_MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, p_ConsolidationCount => p_MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, p_DerivedFromNoteIDs => p_MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, p_ProtectionTier => p_MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, p_ImportanceScore => p_MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore, p_AuthorType => p_MJAIAgentNotes_SourceAIAgentRunID_AuthorType);

    END LOOP;

    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest


    FOR _rec IN SELECT "ID", "AgentID", "RequestedAt", "RequestForUserID", "Status", "Request", "Response", "ResponseByUserID", "RespondedAt", "Comments", "RequestTypeID", "ResponseSchema", "ResponseData", "Priority", "ExpiresAt", "OriginatingAgentRunID", "OriginatingAgentRunStepID", "ResumingAgentRunID", "ResponseSource" FROM __mj."AIAgentRequest" WHERE "OriginatingAgentRunID" = p_ID
    LOOP
        p_MJAIAgentRequests_OriginatingAgentRunIDID := _rec."ID";
        p_MJAIAgentRequests_OriginatingAgentRunID_AgentID := _rec."AgentID";
        p_MJAIAgentRequests_OriginatingAgentRunID_RequestedAt := _rec."RequestedAt";
        p_MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID := _rec."RequestForUserID";
        p_MJAIAgentRequests_OriginatingAgentRunID_Status := _rec."Status";
        p_MJAIAgentRequests_OriginatingAgentRunID_Request := _rec."Request";
        p_MJAIAgentRequests_OriginatingAgentRunID_Response := _rec."Response";
        p_MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID := _rec."ResponseByUserID";
        p_MJAIAgentRequests_OriginatingAgentRunID_RespondedAt := _rec."RespondedAt";
        p_MJAIAgentRequests_OriginatingAgentRunID_Comments := _rec."Comments";
        p_MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID := _rec."RequestTypeID";
        p_MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema := _rec."ResponseSchema";
        p_MJAIAgentRequests_OriginatingAgentRunID_ResponseData := _rec."ResponseData";
        p_MJAIAgentRequests_OriginatingAgentRunID_Priority := _rec."Priority";
        p_MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt := _rec."ExpiresAt";
        p_MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID := _rec."OriginatingAgentRunID";
        p_MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgen_2294cf := _rec."OriginatingAgentRunStepID";
        p_MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID := _rec."ResumingAgentRunID";
        p_MJAIAgentRequests_OriginatingAgentRunID_ResponseSource := _rec."ResponseSource";
        -- Set the FK field to NULL
        p_MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRequest"(p_ID => p_MJAIAgentRequests_OriginatingAgentRunIDID, p_AgentID => p_MJAIAgentRequests_OriginatingAgentRunID_AgentID, p_RequestedAt => p_MJAIAgentRequests_OriginatingAgentRunID_RequestedAt, p_RequestForUserID => p_MJAIAgentRequests_OriginatingAgentRunID_RequestForUserID, p_Status => p_MJAIAgentRequests_OriginatingAgentRunID_Status, p_Request => p_MJAIAgentRequests_OriginatingAgentRunID_Request, p_Response => p_MJAIAgentRequests_OriginatingAgentRunID_Response, p_ResponseByUserID => p_MJAIAgentRequests_OriginatingAgentRunID_ResponseByUserID, p_RespondedAt => p_MJAIAgentRequests_OriginatingAgentRunID_RespondedAt, p_Comments => p_MJAIAgentRequests_OriginatingAgentRunID_Comments, p_RequestTypeID => p_MJAIAgentRequests_OriginatingAgentRunID_RequestTypeID, p_ResponseSchema => p_MJAIAgentRequests_OriginatingAgentRunID_ResponseSchema, p_ResponseData => p_MJAIAgentRequests_OriginatingAgentRunID_ResponseData, p_Priority => p_MJAIAgentRequests_OriginatingAgentRunID_Priority, p_ExpiresAt => p_MJAIAgentRequests_OriginatingAgentRunID_ExpiresAt, p_OriginatingAgentRunID_Clear => 1, p_OriginatingAgentRunID => p_MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgentRunID, p_OriginatingAgentRunStepID => p_MJAIAgentRequests_OriginatingAgentRunID_OriginatingAgen_2294cf, p_ResumingAgentRunID => p_MJAIAgentRequests_OriginatingAgentRunID_ResumingAgentRunID, p_ResponseSource => p_MJAIAgentRequests_OriginatingAgentRunID_ResponseSource);

    END LOOP;

    
    -- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest


    FOR _rec IN SELECT "ID", "AgentID", "RequestedAt", "RequestForUserID", "Status", "Request", "Response", "ResponseByUserID", "RespondedAt", "Comments", "RequestTypeID", "ResponseSchema", "ResponseData", "Priority", "ExpiresAt", "OriginatingAgentRunID", "OriginatingAgentRunStepID", "ResumingAgentRunID", "ResponseSource" FROM __mj."AIAgentRequest" WHERE "ResumingAgentRunID" = p_ID
    LOOP
        p_MJAIAgentRequests_ResumingAgentRunIDID := _rec."ID";
        p_MJAIAgentRequests_ResumingAgentRunID_AgentID := _rec."AgentID";
        p_MJAIAgentRequests_ResumingAgentRunID_RequestedAt := _rec."RequestedAt";
        p_MJAIAgentRequests_ResumingAgentRunID_RequestForUserID := _rec."RequestForUserID";
        p_MJAIAgentRequests_ResumingAgentRunID_Status := _rec."Status";
        p_MJAIAgentRequests_ResumingAgentRunID_Request := _rec."Request";
        p_MJAIAgentRequests_ResumingAgentRunID_Response := _rec."Response";
        p_MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID := _rec."ResponseByUserID";
        p_MJAIAgentRequests_ResumingAgentRunID_RespondedAt := _rec."RespondedAt";
        p_MJAIAgentRequests_ResumingAgentRunID_Comments := _rec."Comments";
        p_MJAIAgentRequests_ResumingAgentRunID_RequestTypeID := _rec."RequestTypeID";
        p_MJAIAgentRequests_ResumingAgentRunID_ResponseSchema := _rec."ResponseSchema";
        p_MJAIAgentRequests_ResumingAgentRunID_ResponseData := _rec."ResponseData";
        p_MJAIAgentRequests_ResumingAgentRunID_Priority := _rec."Priority";
        p_MJAIAgentRequests_ResumingAgentRunID_ExpiresAt := _rec."ExpiresAt";
        p_MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID := _rec."OriginatingAgentRunID";
        p_MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRu_4faa57 := _rec."OriginatingAgentRunStepID";
        p_MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID := _rec."ResumingAgentRunID";
        p_MJAIAgentRequests_ResumingAgentRunID_ResponseSource := _rec."ResponseSource";
        -- Set the FK field to NULL
        p_MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRequest"(p_ID => p_MJAIAgentRequests_ResumingAgentRunIDID, p_AgentID => p_MJAIAgentRequests_ResumingAgentRunID_AgentID, p_RequestedAt => p_MJAIAgentRequests_ResumingAgentRunID_RequestedAt, p_RequestForUserID => p_MJAIAgentRequests_ResumingAgentRunID_RequestForUserID, p_Status => p_MJAIAgentRequests_ResumingAgentRunID_Status, p_Request => p_MJAIAgentRequests_ResumingAgentRunID_Request, p_Response => p_MJAIAgentRequests_ResumingAgentRunID_Response, p_ResponseByUserID => p_MJAIAgentRequests_ResumingAgentRunID_ResponseByUserID, p_RespondedAt => p_MJAIAgentRequests_ResumingAgentRunID_RespondedAt, p_Comments => p_MJAIAgentRequests_ResumingAgentRunID_Comments, p_RequestTypeID => p_MJAIAgentRequests_ResumingAgentRunID_RequestTypeID, p_ResponseSchema => p_MJAIAgentRequests_ResumingAgentRunID_ResponseSchema, p_ResponseData => p_MJAIAgentRequests_ResumingAgentRunID_ResponseData, p_Priority => p_MJAIAgentRequests_ResumingAgentRunID_Priority, p_ExpiresAt => p_MJAIAgentRequests_ResumingAgentRunID_ExpiresAt, p_OriginatingAgentRunID => p_MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRunID, p_OriginatingAgentRunStepID => p_MJAIAgentRequests_ResumingAgentRunID_OriginatingAgentRu_4faa57, p_ResumingAgentRunID_Clear => 1, p_ResumingAgentRunID => p_MJAIAgentRequests_ResumingAgentRunID_ResumingAgentRunID, p_ResponseSource => p_MJAIAgentRequests_ResumingAgentRunID_ResponseSource);

    END LOOP;

    
    -- Cascade delete from AIAgentRunMedia using cursor to call spDeleteAIAgentRunMedia

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRunMedia" WHERE "AgentRunID" = p_ID
    LOOP
        p_MJAIAgentRunMedias_AgentRunIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRunMedia"(p_ID => p_MJAIAgentRunMedias_AgentRunIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIAgentRunStep using cursor to call spDeleteAIAgentRunStep

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentRunStep" WHERE "AgentRunID" = p_ID
    LOOP
        p_MJAIAgentRunSteps_AgentRunIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentRunStep"(p_ID => p_MJAIAgentRunSteps_AgentRunIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt", "AgentSessionID" FROM __mj."AIAgentRun" WHERE "ParentRunID" = p_ID
    LOOP
        p_MJAIAgentRuns_ParentRunIDID := _rec."ID";
        p_MJAIAgentRuns_ParentRunID_AgentID := _rec."AgentID";
        p_MJAIAgentRuns_ParentRunID_ParentRunID := _rec."ParentRunID";
        p_MJAIAgentRuns_ParentRunID_Status := _rec."Status";
        p_MJAIAgentRuns_ParentRunID_StartedAt := _rec."StartedAt";
        p_MJAIAgentRuns_ParentRunID_CompletedAt := _rec."CompletedAt";
        p_MJAIAgentRuns_ParentRunID_Success := _rec."Success";
        p_MJAIAgentRuns_ParentRunID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIAgentRuns_ParentRunID_ConversationID := _rec."ConversationID";
        p_MJAIAgentRuns_ParentRunID_UserID := _rec."UserID";
        p_MJAIAgentRuns_ParentRunID_Result := _rec."Result";
        p_MJAIAgentRuns_ParentRunID_AgentState := _rec."AgentState";
        p_MJAIAgentRuns_ParentRunID_TotalTokensUsed := _rec."TotalTokensUsed";
        p_MJAIAgentRuns_ParentRunID_TotalCost := _rec."TotalCost";
        p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed := _rec."TotalPromptTokensUsed";
        p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed := _rec."TotalCompletionTokensUsed";
        p_MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup := _rec."TotalTokensUsedRollup";
        p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup := _rec."TotalPromptTokensUsedRollup";
        p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup := _rec."TotalCompletionTokensUsedRollup";
        p_MJAIAgentRuns_ParentRunID_TotalCostRollup := _rec."TotalCostRollup";
        p_MJAIAgentRuns_ParentRunID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJAIAgentRuns_ParentRunID_ConversationDetailSequence := _rec."ConversationDetailSequence";
        p_MJAIAgentRuns_ParentRunID_CancellationReason := _rec."CancellationReason";
        p_MJAIAgentRuns_ParentRunID_FinalStep := _rec."FinalStep";
        p_MJAIAgentRuns_ParentRunID_FinalPayload := _rec."FinalPayload";
        p_MJAIAgentRuns_ParentRunID_Message := _rec."Message";
        p_MJAIAgentRuns_ParentRunID_LastRunID := _rec."LastRunID";
        p_MJAIAgentRuns_ParentRunID_StartingPayload := _rec."StartingPayload";
        p_MJAIAgentRuns_ParentRunID_TotalPromptIterations := _rec."TotalPromptIterations";
        p_MJAIAgentRuns_ParentRunID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIAgentRuns_ParentRunID_OverrideModelID := _rec."OverrideModelID";
        p_MJAIAgentRuns_ParentRunID_OverrideVendorID := _rec."OverrideVendorID";
        p_MJAIAgentRuns_ParentRunID_Data := _rec."Data";
        p_MJAIAgentRuns_ParentRunID_Verbose := _rec."Verbose";
        p_MJAIAgentRuns_ParentRunID_EffortLevel := _rec."EffortLevel";
        p_MJAIAgentRuns_ParentRunID_RunName := _rec."RunName";
        p_MJAIAgentRuns_ParentRunID_Comments := _rec."Comments";
        p_MJAIAgentRuns_ParentRunID_ScheduledJobRunID := _rec."ScheduledJobRunID";
        p_MJAIAgentRuns_ParentRunID_TestRunID := _rec."TestRunID";
        p_MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentRuns_ParentRunID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentRuns_ParentRunID_ExternalReferenceID := _rec."ExternalReferenceID";
        p_MJAIAgentRuns_ParentRunID_CompanyID := _rec."CompanyID";
        p_MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed := _rec."TotalCacheReadTokensUsed";
        p_MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed := _rec."TotalCacheWriteTokensUsed";
        p_MJAIAgentRuns_ParentRunID_LastHeartbeatAt := _rec."LastHeartbeatAt";
        p_MJAIAgentRuns_ParentRunID_AgentSessionID := _rec."AgentSessionID";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ParentRunID_ParentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ParentRunIDID, p_AgentID => p_MJAIAgentRuns_ParentRunID_AgentID, p_ParentRunID_Clear => 1, p_ParentRunID => p_MJAIAgentRuns_ParentRunID_ParentRunID, p_Status => p_MJAIAgentRuns_ParentRunID_Status, p_StartedAt => p_MJAIAgentRuns_ParentRunID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ParentRunID_CompletedAt, p_Success => p_MJAIAgentRuns_ParentRunID_Success, p_ErrorMessage => p_MJAIAgentRuns_ParentRunID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_ParentRunID_ConversationID, p_UserID => p_MJAIAgentRuns_ParentRunID_UserID, p_Result => p_MJAIAgentRuns_ParentRunID_Result, p_AgentState => p_MJAIAgentRuns_ParentRunID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ParentRunID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_ParentRunID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_ParentRunID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ParentRunID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ParentRunID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ParentRunID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ParentRunID_FinalPayload, p_Message => p_MJAIAgentRuns_ParentRunID_Message, p_LastRunID => p_MJAIAgentRuns_ParentRunID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ParentRunID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ParentRunID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_ParentRunID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ParentRunID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ParentRunID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ParentRunID_Data, p_Verbose => p_MJAIAgentRuns_ParentRunID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ParentRunID_EffortLevel, p_RunName => p_MJAIAgentRuns_ParentRunID_RunName, p_Comments => p_MJAIAgentRuns_ParentRunID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ParentRunID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ParentRunID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ParentRunID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ParentRunID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ParentRunID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_ParentRunID_LastHeartbeatAt, p_AgentSessionID => p_MJAIAgentRuns_ParentRunID_AgentSessionID);

    END LOOP;

    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt", "AgentSessionID" FROM __mj."AIAgentRun" WHERE "LastRunID" = p_ID
    LOOP
        p_MJAIAgentRuns_LastRunIDID := _rec."ID";
        p_MJAIAgentRuns_LastRunID_AgentID := _rec."AgentID";
        p_MJAIAgentRuns_LastRunID_ParentRunID := _rec."ParentRunID";
        p_MJAIAgentRuns_LastRunID_Status := _rec."Status";
        p_MJAIAgentRuns_LastRunID_StartedAt := _rec."StartedAt";
        p_MJAIAgentRuns_LastRunID_CompletedAt := _rec."CompletedAt";
        p_MJAIAgentRuns_LastRunID_Success := _rec."Success";
        p_MJAIAgentRuns_LastRunID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIAgentRuns_LastRunID_ConversationID := _rec."ConversationID";
        p_MJAIAgentRuns_LastRunID_UserID := _rec."UserID";
        p_MJAIAgentRuns_LastRunID_Result := _rec."Result";
        p_MJAIAgentRuns_LastRunID_AgentState := _rec."AgentState";
        p_MJAIAgentRuns_LastRunID_TotalTokensUsed := _rec."TotalTokensUsed";
        p_MJAIAgentRuns_LastRunID_TotalCost := _rec."TotalCost";
        p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsed := _rec."TotalPromptTokensUsed";
        p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed := _rec."TotalCompletionTokensUsed";
        p_MJAIAgentRuns_LastRunID_TotalTokensUsedRollup := _rec."TotalTokensUsedRollup";
        p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup := _rec."TotalPromptTokensUsedRollup";
        p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup := _rec."TotalCompletionTokensUsedRollup";
        p_MJAIAgentRuns_LastRunID_TotalCostRollup := _rec."TotalCostRollup";
        p_MJAIAgentRuns_LastRunID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJAIAgentRuns_LastRunID_ConversationDetailSequence := _rec."ConversationDetailSequence";
        p_MJAIAgentRuns_LastRunID_CancellationReason := _rec."CancellationReason";
        p_MJAIAgentRuns_LastRunID_FinalStep := _rec."FinalStep";
        p_MJAIAgentRuns_LastRunID_FinalPayload := _rec."FinalPayload";
        p_MJAIAgentRuns_LastRunID_Message := _rec."Message";
        p_MJAIAgentRuns_LastRunID_LastRunID := _rec."LastRunID";
        p_MJAIAgentRuns_LastRunID_StartingPayload := _rec."StartingPayload";
        p_MJAIAgentRuns_LastRunID_TotalPromptIterations := _rec."TotalPromptIterations";
        p_MJAIAgentRuns_LastRunID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIAgentRuns_LastRunID_OverrideModelID := _rec."OverrideModelID";
        p_MJAIAgentRuns_LastRunID_OverrideVendorID := _rec."OverrideVendorID";
        p_MJAIAgentRuns_LastRunID_Data := _rec."Data";
        p_MJAIAgentRuns_LastRunID_Verbose := _rec."Verbose";
        p_MJAIAgentRuns_LastRunID_EffortLevel := _rec."EffortLevel";
        p_MJAIAgentRuns_LastRunID_RunName := _rec."RunName";
        p_MJAIAgentRuns_LastRunID_Comments := _rec."Comments";
        p_MJAIAgentRuns_LastRunID_ScheduledJobRunID := _rec."ScheduledJobRunID";
        p_MJAIAgentRuns_LastRunID_TestRunID := _rec."TestRunID";
        p_MJAIAgentRuns_LastRunID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentRuns_LastRunID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentRuns_LastRunID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentRuns_LastRunID_ExternalReferenceID := _rec."ExternalReferenceID";
        p_MJAIAgentRuns_LastRunID_CompanyID := _rec."CompanyID";
        p_MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed := _rec."TotalCacheReadTokensUsed";
        p_MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed := _rec."TotalCacheWriteTokensUsed";
        p_MJAIAgentRuns_LastRunID_LastHeartbeatAt := _rec."LastHeartbeatAt";
        p_MJAIAgentRuns_LastRunID_AgentSessionID := _rec."AgentSessionID";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_LastRunID_LastRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_LastRunIDID, p_AgentID => p_MJAIAgentRuns_LastRunID_AgentID, p_ParentRunID => p_MJAIAgentRuns_LastRunID_ParentRunID, p_Status => p_MJAIAgentRuns_LastRunID_Status, p_StartedAt => p_MJAIAgentRuns_LastRunID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_LastRunID_CompletedAt, p_Success => p_MJAIAgentRuns_LastRunID_Success, p_ErrorMessage => p_MJAIAgentRuns_LastRunID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_LastRunID_ConversationID, p_UserID => p_MJAIAgentRuns_LastRunID_UserID, p_Result => p_MJAIAgentRuns_LastRunID_Result, p_AgentState => p_MJAIAgentRuns_LastRunID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_LastRunID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_LastRunID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_LastRunID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_LastRunID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_LastRunID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_LastRunID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_LastRunID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_LastRunID_FinalPayload, p_Message => p_MJAIAgentRuns_LastRunID_Message, p_LastRunID_Clear => 1, p_LastRunID => p_MJAIAgentRuns_LastRunID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_LastRunID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_LastRunID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_LastRunID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_LastRunID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_LastRunID_OverrideVendorID, p_Data => p_MJAIAgentRuns_LastRunID_Data, p_Verbose => p_MJAIAgentRuns_LastRunID_Verbose, p_EffortLevel => p_MJAIAgentRuns_LastRunID_EffortLevel, p_RunName => p_MJAIAgentRuns_LastRunID_RunName, p_Comments => p_MJAIAgentRuns_LastRunID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_LastRunID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_LastRunID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_LastRunID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_LastRunID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_LastRunID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_LastRunID_LastHeartbeatAt, p_AgentSessionID => p_MJAIAgentRuns_LastRunID_AgentSessionID);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite", "TokensCacheReadRollup", "TokensCacheWriteRollup" FROM __mj."AIPromptRun" WHERE "AgentRunID" = p_ID
    LOOP
        p_MJAIPromptRuns_AgentRunIDID := _rec."ID";
        p_MJAIPromptRuns_AgentRunID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_AgentRunID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_AgentRunID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_AgentRunID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_AgentRunID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_AgentRunID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_AgentRunID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_AgentRunID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_AgentRunID_Messages := _rec."Messages";
        p_MJAIPromptRuns_AgentRunID_Result := _rec."Result";
        p_MJAIPromptRuns_AgentRunID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_AgentRunID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_AgentRunID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_AgentRunID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_AgentRunID_Success := _rec."Success";
        p_MJAIPromptRuns_AgentRunID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_AgentRunID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_AgentRunID_RunType := _rec."RunType";
        p_MJAIPromptRuns_AgentRunID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_AgentRunID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_AgentRunID_Cost := _rec."Cost";
        p_MJAIPromptRuns_AgentRunID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_AgentRunID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_AgentRunID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_AgentRunID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_AgentRunID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_AgentRunID_TopP := _rec."TopP";
        p_MJAIPromptRuns_AgentRunID_TopK := _rec."TopK";
        p_MJAIPromptRuns_AgentRunID_MinP := _rec."MinP";
        p_MJAIPromptRuns_AgentRunID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_AgentRunID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_AgentRunID_Seed := _rec."Seed";
        p_MJAIPromptRuns_AgentRunID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_AgentRunID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_AgentRunID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_AgentRunID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_AgentRunID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_AgentRunID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_AgentRunID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_AgentRunID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_AgentRunID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_AgentRunID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_AgentRunID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_AgentRunID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_AgentRunID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_AgentRunID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_AgentRunID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_AgentRunID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_AgentRunID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_AgentRunID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_AgentRunID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_AgentRunID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_AgentRunID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_AgentRunID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_AgentRunID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_AgentRunID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_AgentRunID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_AgentRunID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_AgentRunID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_AgentRunID_Status := _rec."Status";
        p_MJAIPromptRuns_AgentRunID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_AgentRunID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_AgentRunID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_AgentRunID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_AgentRunID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_AgentRunID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_AgentRunID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_AgentRunID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_AgentRunID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_AgentRunID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_AgentRunID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_AgentRunID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_AgentRunID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_AgentRunID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_AgentRunID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_AgentRunID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_AgentRunID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_AgentRunID_RunName := _rec."RunName";
        p_MJAIPromptRuns_AgentRunID_Comments := _rec."Comments";
        p_MJAIPromptRuns_AgentRunID_TestRunID := _rec."TestRunID";
        p_MJAIPromptRuns_AgentRunID_AssistantPrefill := _rec."AssistantPrefill";
        p_MJAIPromptRuns_AgentRunID_TokensCacheRead := _rec."TokensCacheRead";
        p_MJAIPromptRuns_AgentRunID_TokensCacheWrite := _rec."TokensCacheWrite";
        p_MJAIPromptRuns_AgentRunID_TokensCacheReadRollup := _rec."TokensCacheReadRollup";
        p_MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup := _rec."TokensCacheWriteRollup";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_AgentRunID_AgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_AgentRunIDID, p_PromptID => p_MJAIPromptRuns_AgentRunID_PromptID, p_ModelID => p_MJAIPromptRuns_AgentRunID_ModelID, p_VendorID => p_MJAIPromptRuns_AgentRunID_VendorID, p_AgentID => p_MJAIPromptRuns_AgentRunID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_AgentRunID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_AgentRunID_RunAt, p_CompletedAt => p_MJAIPromptRuns_AgentRunID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_AgentRunID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_AgentRunID_Messages, p_Result => p_MJAIPromptRuns_AgentRunID_Result, p_TokensUsed => p_MJAIPromptRuns_AgentRunID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_AgentRunID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_AgentRunID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_AgentRunID_TotalCost, p_Success => p_MJAIPromptRuns_AgentRunID_Success, p_ErrorMessage => p_MJAIPromptRuns_AgentRunID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_AgentRunID_ParentID, p_RunType => p_MJAIPromptRuns_AgentRunID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_AgentRunID_ExecutionOrder, p_AgentRunID_Clear => 1, p_AgentRunID => p_MJAIPromptRuns_AgentRunID_AgentRunID, p_Cost => p_MJAIPromptRuns_AgentRunID_Cost, p_CostCurrency => p_MJAIPromptRuns_AgentRunID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_AgentRunID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_AgentRunID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_AgentRunID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_AgentRunID_Temperature, p_TopP => p_MJAIPromptRuns_AgentRunID_TopP, p_TopK => p_MJAIPromptRuns_AgentRunID_TopK, p_MinP => p_MJAIPromptRuns_AgentRunID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_AgentRunID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_AgentRunID_PresencePenalty, p_Seed => p_MJAIPromptRuns_AgentRunID_Seed, p_StopSequences => p_MJAIPromptRuns_AgentRunID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_AgentRunID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_AgentRunID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_AgentRunID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_AgentRunID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_AgentRunID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_AgentRunID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_AgentRunID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_AgentRunID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_AgentRunID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_AgentRunID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_AgentRunID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_AgentRunID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_AgentRunID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_AgentRunID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_AgentRunID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_AgentRunID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_AgentRunID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_AgentRunID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_AgentRunID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_AgentRunID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_AgentRunID_ModelSelection, p_Status => p_MJAIPromptRuns_AgentRunID_Status, p_Cancelled => p_MJAIPromptRuns_AgentRunID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_AgentRunID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_AgentRunID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_AgentRunID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_AgentRunID_CacheHit, p_CacheKey => p_MJAIPromptRuns_AgentRunID_CacheKey, p_JudgeID => p_MJAIPromptRuns_AgentRunID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_AgentRunID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_AgentRunID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_AgentRunID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_AgentRunID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_AgentRunID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_AgentRunID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_AgentRunID_QueueTime, p_PromptTime => p_MJAIPromptRuns_AgentRunID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_AgentRunID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_AgentRunID_EffortLevel, p_RunName => p_MJAIPromptRuns_AgentRunID_RunName, p_Comments => p_MJAIPromptRuns_AgentRunID_Comments, p_TestRunID => p_MJAIPromptRuns_AgentRunID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_AgentRunID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_AgentRunID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_AgentRunID_TokensCacheWrite, p_TokensCacheReadRollup => p_MJAIPromptRuns_AgentRunID_TokensCacheReadRollup, p_TokensCacheWriteRollup => p_MJAIPromptRuns_AgentRunID_TokensCacheWriteRollup);

    END LOOP;

    

    DELETE FROM
        __mj."AIAgentRun"
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
    IN p_AgentSessionID UUID DEFAULT NULL
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
                "AgentSessionID"
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
                CASE WHEN p_AgentSessionID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentSessionID, NULL) END
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
                "AgentSessionID"
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
                CASE WHEN p_AgentSessionID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentSessionID, NULL) END
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
    IN p_AgentSessionID UUID DEFAULT NULL
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
        "AgentSessionID" = CASE WHEN p_AgentSessionID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentSessionID, "AgentSessionID") END
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


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt", "AgentSessionID" FROM __mj."AIAgentRun" WHERE "ConversationDetailID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ConversationDetailID_ConversationDetailID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ConversationDetailIDID, p_AgentID => p_MJAIAgentRuns_ConversationDetailID_AgentID, p_ParentRunID => p_MJAIAgentRuns_ConversationDetailID_ParentRunID, p_Status => p_MJAIAgentRuns_ConversationDetailID_Status, p_StartedAt => p_MJAIAgentRuns_ConversationDetailID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ConversationDetailID_CompletedAt, p_Success => p_MJAIAgentRuns_ConversationDetailID_Success, p_ErrorMessage => p_MJAIAgentRuns_ConversationDetailID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_ConversationDetailID_ConversationID, p_UserID => p_MJAIAgentRuns_ConversationDetailID_UserID, p_Result => p_MJAIAgentRuns_ConversationDetailID_Result, p_AgentState => p_MJAIAgentRuns_ConversationDetailID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ConversationDetailID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUse_5ca82d, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ConversationDetailID_TotalCompletionToken_43c4ab, p_TotalCostRollup => p_MJAIAgentRuns_ConversationDetailID_TotalCostRollup, p_ConversationDetailID_Clear => 1, p_ConversationDetailID => p_MJAIAgentRuns_ConversationDetailID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ConversationDetailID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ConversationDetailID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ConversationDetailID_FinalPayload, p_Message => p_MJAIAgentRuns_ConversationDetailID_Message, p_LastRunID => p_MJAIAgentRuns_ConversationDetailID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ConversationDetailID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_ConversationDetailID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ConversationDetailID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ConversationDetailID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ConversationDetailID_Data, p_Verbose => p_MJAIAgentRuns_ConversationDetailID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ConversationDetailID_EffortLevel, p_RunName => p_MJAIAgentRuns_ConversationDetailID_RunName, p_Comments => p_MJAIAgentRuns_ConversationDetailID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ConversationDetailID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ConversationDetailID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ConversationDetailID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt, p_AgentSessionID => p_MJAIAgentRuns_ConversationDetailID_AgentSessionID);

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


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged", "AgentSessionID" FROM __mj."ConversationDetail" WHERE "ParentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJConversationDetails_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_ParentIDID, p_ConversationID => p_MJConversationDetails_ParentID_ConversationID, p_ExternalID => p_MJConversationDetails_ParentID_ExternalID, p_Role => p_MJConversationDetails_ParentID_Role, p_Message => p_MJConversationDetails_ParentID_Message, p_Error => p_MJConversationDetails_ParentID_Error, p_HiddenToUser => p_MJConversationDetails_ParentID_HiddenToUser, p_UserRating => p_MJConversationDetails_ParentID_UserRating, p_UserFeedback => p_MJConversationDetails_ParentID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_ParentID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_ParentID_SummaryOfEarlierConversation, p_UserID => p_MJConversationDetails_ParentID_UserID, p_ArtifactID => p_MJConversationDetails_ParentID_ArtifactID, p_ArtifactVersionID => p_MJConversationDetails_ParentID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_ParentID_CompletionTime, p_IsPinned => p_MJConversationDetails_ParentID_IsPinned, p_ParentID_Clear => 1, p_ParentID => p_MJConversationDetails_ParentID_ParentID, p_AgentID => p_MJConversationDetails_ParentID_AgentID, p_Status => p_MJConversationDetails_ParentID_Status, p_SuggestedResponses => p_MJConversationDetails_ParentID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_ParentID_TestRunID, p_ResponseForm => p_MJConversationDetails_ParentID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_ParentID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_ParentID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_ParentID_OriginalMessageChanged, p_AgentSessionID => p_MJConversationDetails_ParentID_AgentSessionID);

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
BEGIN
-- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged", "AgentSessionID" FROM __mj."ConversationDetail" WHERE "ArtifactVersionID" = p_ID
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
        -- Set the FK field to NULL
        p_MJConversationDetails_ArtifactVersionID_ArtifactVersionID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_ArtifactVersionIDID, p_ConversationID => p_MJConversationDetails_ArtifactVersionID_ConversationID, p_ExternalID => p_MJConversationDetails_ArtifactVersionID_ExternalID, p_Role => p_MJConversationDetails_ArtifactVersionID_Role, p_Message => p_MJConversationDetails_ArtifactVersionID_Message, p_Error => p_MJConversationDetails_ArtifactVersionID_Error, p_HiddenToUser => p_MJConversationDetails_ArtifactVersionID_HiddenToUser, p_UserRating => p_MJConversationDetails_ArtifactVersionID_UserRating, p_UserFeedback => p_MJConversationDetails_ArtifactVersionID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_ArtifactVersionID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_ArtifactVersionID_SummaryOfEarlie_0dd4da, p_UserID => p_MJConversationDetails_ArtifactVersionID_UserID, p_ArtifactID => p_MJConversationDetails_ArtifactVersionID_ArtifactID, p_ArtifactVersionID_Clear => 1, p_ArtifactVersionID => p_MJConversationDetails_ArtifactVersionID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_ArtifactVersionID_CompletionTime, p_IsPinned => p_MJConversationDetails_ArtifactVersionID_IsPinned, p_ParentID => p_MJConversationDetails_ArtifactVersionID_ParentID, p_AgentID => p_MJConversationDetails_ArtifactVersionID_AgentID, p_Status => p_MJConversationDetails_ArtifactVersionID_Status, p_SuggestedResponses => p_MJConversationDetails_ArtifactVersionID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_ArtifactVersionID_TestRunID, p_ResponseForm => p_MJConversationDetails_ArtifactVersionID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_ArtifactVersionID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_ArtifactVersionID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_ArtifactVersionID_OriginalMessage_672e5e, p_AgentSessionID => p_MJConversationDetails_ArtifactVersionID_AgentSessionID);

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


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged", "AgentSessionID" FROM __mj."ConversationDetail" WHERE "ArtifactID" = p_ID
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
        -- Set the FK field to NULL
        p_MJConversationDetails_ArtifactID_ArtifactID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_ArtifactIDID, p_ConversationID => p_MJConversationDetails_ArtifactID_ConversationID, p_ExternalID => p_MJConversationDetails_ArtifactID_ExternalID, p_Role => p_MJConversationDetails_ArtifactID_Role, p_Message => p_MJConversationDetails_ArtifactID_Message, p_Error => p_MJConversationDetails_ArtifactID_Error, p_HiddenToUser => p_MJConversationDetails_ArtifactID_HiddenToUser, p_UserRating => p_MJConversationDetails_ArtifactID_UserRating, p_UserFeedback => p_MJConversationDetails_ArtifactID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_ArtifactID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_ArtifactID_SummaryOfEarlierConversation, p_UserID => p_MJConversationDetails_ArtifactID_UserID, p_ArtifactID_Clear => 1, p_ArtifactID => p_MJConversationDetails_ArtifactID_ArtifactID, p_ArtifactVersionID => p_MJConversationDetails_ArtifactID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_ArtifactID_CompletionTime, p_IsPinned => p_MJConversationDetails_ArtifactID_IsPinned, p_ParentID => p_MJConversationDetails_ArtifactID_ParentID, p_AgentID => p_MJConversationDetails_ArtifactID_AgentID, p_Status => p_MJConversationDetails_ArtifactID_Status, p_SuggestedResponses => p_MJConversationDetails_ArtifactID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_ArtifactID_TestRunID, p_ResponseForm => p_MJConversationDetails_ArtifactID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_ArtifactID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_ArtifactID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_ArtifactID_OriginalMessageChanged, p_AgentSessionID => p_MJConversationDetails_ArtifactID_AgentSessionID);

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
    p_MJConversationArtifacts_ConversationIDID UUID;
    p_MJConversationDetails_ConversationIDID UUID;
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


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt", "AgentSessionID" FROM __mj."AIAgentRun" WHERE "ConversationID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ConversationID_ConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ConversationIDID, p_AgentID => p_MJAIAgentRuns_ConversationID_AgentID, p_ParentRunID => p_MJAIAgentRuns_ConversationID_ParentRunID, p_Status => p_MJAIAgentRuns_ConversationID_Status, p_StartedAt => p_MJAIAgentRuns_ConversationID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ConversationID_CompletedAt, p_Success => p_MJAIAgentRuns_ConversationID_Success, p_ErrorMessage => p_MJAIAgentRuns_ConversationID_ErrorMessage, p_ConversationID_Clear => 1, p_ConversationID => p_MJAIAgentRuns_ConversationID_ConversationID, p_UserID => p_MJAIAgentRuns_ConversationID_UserID, p_Result => p_MJAIAgentRuns_ConversationID_Result, p_AgentState => p_MJAIAgentRuns_ConversationID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ConversationID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ConversationID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_ConversationID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_ConversationID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ConversationID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ConversationID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ConversationID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ConversationID_FinalPayload, p_Message => p_MJAIAgentRuns_ConversationID_Message, p_LastRunID => p_MJAIAgentRuns_ConversationID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ConversationID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ConversationID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_ConversationID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ConversationID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ConversationID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ConversationID_Data, p_Verbose => p_MJAIAgentRuns_ConversationID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ConversationID_EffortLevel, p_RunName => p_MJAIAgentRuns_ConversationID_RunName, p_Comments => p_MJAIAgentRuns_ConversationID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ConversationID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ConversationID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ConversationID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ConversationID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ConversationID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_ConversationID_LastHeartbeatAt, p_AgentSessionID => p_MJAIAgentRuns_ConversationID_AgentSessionID);

    END LOOP;

    
    -- Cascade update on AIAgentSession using cursor to call spUpdateAIAgentSession


    FOR _rec IN SELECT "ID", "AgentID", "UserID", "Status", "ConversationID", "LastSessionID", "HostInstanceID", "Config", "LastActiveAt", "ClosedAt", "CloseReason" FROM __mj."AIAgentSession" WHERE "ConversationID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgentSessions_ConversationID_ConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentSession"(p_ID => p_MJAIAgentSessions_ConversationIDID, p_AgentID => p_MJAIAgentSessions_ConversationID_AgentID, p_UserID => p_MJAIAgentSessions_ConversationID_UserID, p_Status => p_MJAIAgentSessions_ConversationID_Status, p_ConversationID_Clear => 1, p_ConversationID => p_MJAIAgentSessions_ConversationID_ConversationID, p_LastSessionID => p_MJAIAgentSessions_ConversationID_LastSessionID, p_HostInstanceID => p_MJAIAgentSessions_ConversationID_HostInstanceID, p_Config => p_MJAIAgentSessions_ConversationID_Config, p_LastActiveAt => p_MJAIAgentSessions_ConversationID_LastActiveAt, p_ClosedAt => p_MJAIAgentSessions_ConversationID_ClosedAt, p_CloseReason => p_MJAIAgentSessions_ConversationID_CloseReason);

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
    FOREACH v_field_name IN ARRAY ARRAY['Name', 'Description', 'LogoURL', 'ParentID', 'ExposeAsAction', 'ExecutionOrder', 'ExecutionMode', 'EnableContextCompression', 'ContextCompressionMessageThreshold', 'ContextCompressionPromptID', 'ContextCompressionMessageRetentionCount', 'TypeID', 'Status', 'DriverClass', 'IconClass', 'ModelSelectionMode', 'PayloadDownstreamPaths', 'PayloadUpstreamPaths', 'PayloadSelfReadPaths', 'PayloadSelfWritePaths', 'PayloadScope', 'FinalPayloadValidation', 'FinalPayloadValidationMode', 'FinalPayloadValidationMaxRetries', 'MaxCostPerRun', 'MaxTokensPerRun', 'MaxIterationsPerRun', 'MaxTimePerRun', 'MinExecutionsPerRun', 'MaxExecutionsPerRun', 'StartingPayloadValidation', 'StartingPayloadValidationMode', 'DefaultPromptEffortLevel', 'ChatHandlingOption', 'DefaultArtifactTypeID', 'OwnerUserID', 'InvocationMode', 'ArtifactCreationMode', 'FunctionalRequirements', 'TechnicalDesign', 'InjectNotes', 'MaxNotesToInject', 'NoteInjectionStrategy', 'InjectExamples', 'MaxExamplesToInject', 'ExampleInjectionStrategy', 'IsRestricted', 'MessageMode', 'MaxMessages', 'AttachmentStorageProviderID', 'AttachmentRootPath', 'InlineStorageThresholdBytes', 'AgentTypePromptParams', 'ScopeConfig', 'NoteRetentionDays', 'ExampleRetentionDays', 'AutoArchiveEnabled', 'RerankerConfiguration', 'CategoryID', 'AllowEphemeralClientTools', 'DefaultStorageAccountID', 'SearchScopeAccess', 'AcceptUnregisteredFiles', 'DefaultCoAgentID', 'TypeConfiguration', 'AllowMemoryWrite']
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


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID", "AllowEphemeralClientTools", "DefaultStorageAccountID", "SearchScopeAccess", "AcceptUnregisteredFiles", "DefaultCoAgentID", "TypeConfiguration", "AllowMemoryWrite" FROM __mj."AIAgent" WHERE "ParentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgents_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_ID => p_MJAIAgents_ParentIDID, p_Name => p_MJAIAgents_ParentID_Name, p_Description => p_MJAIAgents_ParentID_Description, p_LogoURL => p_MJAIAgents_ParentID_LogoURL, p_ParentID_Clear => 1, p_ParentID => p_MJAIAgents_ParentID_ParentID, p_ExposeAsAction => p_MJAIAgents_ParentID_ExposeAsAction, p_ExecutionOrder => p_MJAIAgents_ParentID_ExecutionOrder, p_ExecutionMode => p_MJAIAgents_ParentID_ExecutionMode, p_EnableContextCompression => p_MJAIAgents_ParentID_EnableContextCompression, p_ContextCompressionMessageThreshold => p_MJAIAgents_ParentID_ContextCompressionMessageThreshold, p_ContextCompressionPromptID => p_MJAIAgents_ParentID_ContextCompressionPromptID, p_ContextCompressionMessageRetentionCount => p_MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, p_TypeID => p_MJAIAgents_ParentID_TypeID, p_Status => p_MJAIAgents_ParentID_Status, p_DriverClass => p_MJAIAgents_ParentID_DriverClass, p_IconClass => p_MJAIAgents_ParentID_IconClass, p_ModelSelectionMode => p_MJAIAgents_ParentID_ModelSelectionMode, p_PayloadDownstreamPaths => p_MJAIAgents_ParentID_PayloadDownstreamPaths, p_PayloadUpstreamPaths => p_MJAIAgents_ParentID_PayloadUpstreamPaths, p_PayloadSelfReadPaths => p_MJAIAgents_ParentID_PayloadSelfReadPaths, p_PayloadSelfWritePaths => p_MJAIAgents_ParentID_PayloadSelfWritePaths, p_PayloadScope => p_MJAIAgents_ParentID_PayloadScope, p_FinalPayloadValidation => p_MJAIAgents_ParentID_FinalPayloadValidation, p_FinalPayloadValidationMode => p_MJAIAgents_ParentID_FinalPayloadValidationMode, p_FinalPayloadValidationMaxRetries => p_MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, p_MaxCostPerRun => p_MJAIAgents_ParentID_MaxCostPerRun, p_MaxTokensPerRun => p_MJAIAgents_ParentID_MaxTokensPerRun, p_MaxIterationsPerRun => p_MJAIAgents_ParentID_MaxIterationsPerRun, p_MaxTimePerRun => p_MJAIAgents_ParentID_MaxTimePerRun, p_MinExecutionsPerRun => p_MJAIAgents_ParentID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgents_ParentID_MaxExecutionsPerRun, p_StartingPayloadValidation => p_MJAIAgents_ParentID_StartingPayloadValidation, p_StartingPayloadValidationMode => p_MJAIAgents_ParentID_StartingPayloadValidationMode, p_DefaultPromptEffortLevel => p_MJAIAgents_ParentID_DefaultPromptEffortLevel, p_ChatHandlingOption => p_MJAIAgents_ParentID_ChatHandlingOption, p_DefaultArtifactTypeID => p_MJAIAgents_ParentID_DefaultArtifactTypeID, p_OwnerUserID => p_MJAIAgents_ParentID_OwnerUserID, p_InvocationMode => p_MJAIAgents_ParentID_InvocationMode, p_ArtifactCreationMode => p_MJAIAgents_ParentID_ArtifactCreationMode, p_FunctionalRequirements => p_MJAIAgents_ParentID_FunctionalRequirements, p_TechnicalDesign => p_MJAIAgents_ParentID_TechnicalDesign, p_InjectNotes => p_MJAIAgents_ParentID_InjectNotes, p_MaxNotesToInject => p_MJAIAgents_ParentID_MaxNotesToInject, p_NoteInjectionStrategy => p_MJAIAgents_ParentID_NoteInjectionStrategy, p_InjectExamples => p_MJAIAgents_ParentID_InjectExamples, p_MaxExamplesToInject => p_MJAIAgents_ParentID_MaxExamplesToInject, p_ExampleInjectionStrategy => p_MJAIAgents_ParentID_ExampleInjectionStrategy, p_IsRestricted => p_MJAIAgents_ParentID_IsRestricted, p_MessageMode => p_MJAIAgents_ParentID_MessageMode, p_MaxMessages => p_MJAIAgents_ParentID_MaxMessages, p_AttachmentStorageProviderID => p_MJAIAgents_ParentID_AttachmentStorageProviderID, p_AttachmentRootPath => p_MJAIAgents_ParentID_AttachmentRootPath, p_InlineStorageThresholdBytes => p_MJAIAgents_ParentID_InlineStorageThresholdBytes, p_AgentTypePromptParams => p_MJAIAgents_ParentID_AgentTypePromptParams, p_ScopeConfig => p_MJAIAgents_ParentID_ScopeConfig, p_NoteRetentionDays => p_MJAIAgents_ParentID_NoteRetentionDays, p_ExampleRetentionDays => p_MJAIAgents_ParentID_ExampleRetentionDays, p_AutoArchiveEnabled => p_MJAIAgents_ParentID_AutoArchiveEnabled, p_RerankerConfiguration => p_MJAIAgents_ParentID_RerankerConfiguration, p_CategoryID => p_MJAIAgents_ParentID_CategoryID, p_AllowEphemeralClientTools => p_MJAIAgents_ParentID_AllowEphemeralClientTools, p_DefaultStorageAccountID => p_MJAIAgents_ParentID_DefaultStorageAccountID, p_SearchScopeAccess => p_MJAIAgents_ParentID_SearchScopeAccess, p_AcceptUnregisteredFiles => p_MJAIAgents_ParentID_AcceptUnregisteredFiles, p_DefaultCoAgentID => p_MJAIAgents_ParentID_DefaultCoAgentID, p_TypeConfiguration => p_MJAIAgents_ParentID_TypeConfiguration, p_AllowMemoryWrite => p_MJAIAgents_ParentID_AllowMemoryWrite);

    END LOOP;

    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID", "AllowEphemeralClientTools", "DefaultStorageAccountID", "SearchScopeAccess", "AcceptUnregisteredFiles", "DefaultCoAgentID", "TypeConfiguration", "AllowMemoryWrite" FROM __mj."AIAgent" WHERE "DefaultCoAgentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgents_DefaultCoAgentID_DefaultCoAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_ID => p_MJAIAgents_DefaultCoAgentIDID, p_Name => p_MJAIAgents_DefaultCoAgentID_Name, p_Description => p_MJAIAgents_DefaultCoAgentID_Description, p_LogoURL => p_MJAIAgents_DefaultCoAgentID_LogoURL, p_ParentID => p_MJAIAgents_DefaultCoAgentID_ParentID, p_ExposeAsAction => p_MJAIAgents_DefaultCoAgentID_ExposeAsAction, p_ExecutionOrder => p_MJAIAgents_DefaultCoAgentID_ExecutionOrder, p_ExecutionMode => p_MJAIAgents_DefaultCoAgentID_ExecutionMode, p_EnableContextCompression => p_MJAIAgents_DefaultCoAgentID_EnableContextCompression, p_ContextCompressionMessageThreshold => p_MJAIAgents_DefaultCoAgentID_ContextCompressionMessageTh_2ba4d7, p_ContextCompressionPromptID => p_MJAIAgents_DefaultCoAgentID_ContextCompressionPromptID, p_ContextCompressionMessageRetentionCount => p_MJAIAgents_DefaultCoAgentID_ContextCompressionMessageRe_601f1d, p_TypeID => p_MJAIAgents_DefaultCoAgentID_TypeID, p_Status => p_MJAIAgents_DefaultCoAgentID_Status, p_DriverClass => p_MJAIAgents_DefaultCoAgentID_DriverClass, p_IconClass => p_MJAIAgents_DefaultCoAgentID_IconClass, p_ModelSelectionMode => p_MJAIAgents_DefaultCoAgentID_ModelSelectionMode, p_PayloadDownstreamPaths => p_MJAIAgents_DefaultCoAgentID_PayloadDownstreamPaths, p_PayloadUpstreamPaths => p_MJAIAgents_DefaultCoAgentID_PayloadUpstreamPaths, p_PayloadSelfReadPaths => p_MJAIAgents_DefaultCoAgentID_PayloadSelfReadPaths, p_PayloadSelfWritePaths => p_MJAIAgents_DefaultCoAgentID_PayloadSelfWritePaths, p_PayloadScope => p_MJAIAgents_DefaultCoAgentID_PayloadScope, p_FinalPayloadValidation => p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidation, p_FinalPayloadValidationMode => p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMode, p_FinalPayloadValidationMaxRetries => p_MJAIAgents_DefaultCoAgentID_FinalPayloadValidationMaxRetries, p_MaxCostPerRun => p_MJAIAgents_DefaultCoAgentID_MaxCostPerRun, p_MaxTokensPerRun => p_MJAIAgents_DefaultCoAgentID_MaxTokensPerRun, p_MaxIterationsPerRun => p_MJAIAgents_DefaultCoAgentID_MaxIterationsPerRun, p_MaxTimePerRun => p_MJAIAgents_DefaultCoAgentID_MaxTimePerRun, p_MinExecutionsPerRun => p_MJAIAgents_DefaultCoAgentID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgents_DefaultCoAgentID_MaxExecutionsPerRun, p_StartingPayloadValidation => p_MJAIAgents_DefaultCoAgentID_StartingPayloadValidation, p_StartingPayloadValidationMode => p_MJAIAgents_DefaultCoAgentID_StartingPayloadValidationMode, p_DefaultPromptEffortLevel => p_MJAIAgents_DefaultCoAgentID_DefaultPromptEffortLevel, p_ChatHandlingOption => p_MJAIAgents_DefaultCoAgentID_ChatHandlingOption, p_DefaultArtifactTypeID => p_MJAIAgents_DefaultCoAgentID_DefaultArtifactTypeID, p_OwnerUserID => p_MJAIAgents_DefaultCoAgentID_OwnerUserID, p_InvocationMode => p_MJAIAgents_DefaultCoAgentID_InvocationMode, p_ArtifactCreationMode => p_MJAIAgents_DefaultCoAgentID_ArtifactCreationMode, p_FunctionalRequirements => p_MJAIAgents_DefaultCoAgentID_FunctionalRequirements, p_TechnicalDesign => p_MJAIAgents_DefaultCoAgentID_TechnicalDesign, p_InjectNotes => p_MJAIAgents_DefaultCoAgentID_InjectNotes, p_MaxNotesToInject => p_MJAIAgents_DefaultCoAgentID_MaxNotesToInject, p_NoteInjectionStrategy => p_MJAIAgents_DefaultCoAgentID_NoteInjectionStrategy, p_InjectExamples => p_MJAIAgents_DefaultCoAgentID_InjectExamples, p_MaxExamplesToInject => p_MJAIAgents_DefaultCoAgentID_MaxExamplesToInject, p_ExampleInjectionStrategy => p_MJAIAgents_DefaultCoAgentID_ExampleInjectionStrategy, p_IsRestricted => p_MJAIAgents_DefaultCoAgentID_IsRestricted, p_MessageMode => p_MJAIAgents_DefaultCoAgentID_MessageMode, p_MaxMessages => p_MJAIAgents_DefaultCoAgentID_MaxMessages, p_AttachmentStorageProviderID => p_MJAIAgents_DefaultCoAgentID_AttachmentStorageProviderID, p_AttachmentRootPath => p_MJAIAgents_DefaultCoAgentID_AttachmentRootPath, p_InlineStorageThresholdBytes => p_MJAIAgents_DefaultCoAgentID_InlineStorageThresholdBytes, p_AgentTypePromptParams => p_MJAIAgents_DefaultCoAgentID_AgentTypePromptParams, p_ScopeConfig => p_MJAIAgents_DefaultCoAgentID_ScopeConfig, p_NoteRetentionDays => p_MJAIAgents_DefaultCoAgentID_NoteRetentionDays, p_ExampleRetentionDays => p_MJAIAgents_DefaultCoAgentID_ExampleRetentionDays, p_AutoArchiveEnabled => p_MJAIAgents_DefaultCoAgentID_AutoArchiveEnabled, p_RerankerConfiguration => p_MJAIAgents_DefaultCoAgentID_RerankerConfiguration, p_CategoryID => p_MJAIAgents_DefaultCoAgentID_CategoryID, p_AllowEphemeralClientTools => p_MJAIAgents_DefaultCoAgentID_AllowEphemeralClientTools, p_DefaultStorageAccountID => p_MJAIAgents_DefaultCoAgentID_DefaultStorageAccountID, p_SearchScopeAccess => p_MJAIAgents_DefaultCoAgentID_SearchScopeAccess, p_AcceptUnregisteredFiles => p_MJAIAgents_DefaultCoAgentID_AcceptUnregisteredFiles, p_DefaultCoAgentID_Clear => 1, p_DefaultCoAgentID => p_MJAIAgents_DefaultCoAgentID_DefaultCoAgentID, p_TypeConfiguration => p_MJAIAgents_DefaultCoAgentID_TypeConfiguration, p_AllowMemoryWrite => p_MJAIAgents_DefaultCoAgentID_AllowMemoryWrite);

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

    
    -- Cascade update on ConversationDetail using cursor to call spUpdateConversationDetail


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged", "AgentSessionID" FROM __mj."ConversationDetail" WHERE "AgentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJConversationDetails_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_AgentIDID, p_ConversationID => p_MJConversationDetails_AgentID_ConversationID, p_ExternalID => p_MJConversationDetails_AgentID_ExternalID, p_Role => p_MJConversationDetails_AgentID_Role, p_Message => p_MJConversationDetails_AgentID_Message, p_Error => p_MJConversationDetails_AgentID_Error, p_HiddenToUser => p_MJConversationDetails_AgentID_HiddenToUser, p_UserRating => p_MJConversationDetails_AgentID_UserRating, p_UserFeedback => p_MJConversationDetails_AgentID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_AgentID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_AgentID_SummaryOfEarlierConversation, p_UserID => p_MJConversationDetails_AgentID_UserID, p_ArtifactID => p_MJConversationDetails_AgentID_ArtifactID, p_ArtifactVersionID => p_MJConversationDetails_AgentID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_AgentID_CompletionTime, p_IsPinned => p_MJConversationDetails_AgentID_IsPinned, p_ParentID => p_MJConversationDetails_AgentID_ParentID, p_AgentID_Clear => 1, p_AgentID => p_MJConversationDetails_AgentID_AgentID, p_Status => p_MJConversationDetails_AgentID_Status, p_SuggestedResponses => p_MJConversationDetails_AgentID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_AgentID_TestRunID, p_ResponseForm => p_MJConversationDetails_AgentID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_AgentID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_AgentID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_AgentID_OriginalMessageChanged, p_AgentSessionID => p_MJConversationDetails_AgentID_AgentSessionID);

    END LOOP;

    
    -- Cascade update on Conversation using cursor to call spUpdateConversation


    FOR _rec IN SELECT "ID", "UserID", "ExternalID", "Name", "Description", "Type", "IsArchived", "LinkedEntityID", "LinkedRecordID", "DataContextID", "Status", "EnvironmentID", "ProjectID", "IsPinned", "TestRunID", "ApplicationScope", "ApplicationID", "DefaultAgentID", "AdditionalData" FROM __mj."Conversation" WHERE "DefaultAgentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJConversations_DefaultAgentID_DefaultAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversation"(p_ID => p_MJConversations_DefaultAgentIDID, p_UserID => p_MJConversations_DefaultAgentID_UserID, p_ExternalID => p_MJConversations_DefaultAgentID_ExternalID, p_Name => p_MJConversations_DefaultAgentID_Name, p_Description => p_MJConversations_DefaultAgentID_Description, p_Type => p_MJConversations_DefaultAgentID_Type, p_IsArchived => p_MJConversations_DefaultAgentID_IsArchived, p_LinkedEntityID => p_MJConversations_DefaultAgentID_LinkedEntityID, p_LinkedRecordID => p_MJConversations_DefaultAgentID_LinkedRecordID, p_DataContextID => p_MJConversations_DefaultAgentID_DataContextID, p_Status => p_MJConversations_DefaultAgentID_Status, p_EnvironmentID => p_MJConversations_DefaultAgentID_EnvironmentID, p_ProjectID => p_MJConversations_DefaultAgentID_ProjectID, p_IsPinned => p_MJConversations_DefaultAgentID_IsPinned, p_TestRunID => p_MJConversations_DefaultAgentID_TestRunID, p_ApplicationScope => p_MJConversations_DefaultAgentID_ApplicationScope, p_ApplicationID => p_MJConversations_DefaultAgentID_ApplicationID, p_DefaultAgentID_Clear => 1, p_DefaultAgentID => p_MJConversations_DefaultAgentID_DefaultAgentID, p_AdditionalData => p_MJConversations_DefaultAgentID_AdditionalData);

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
           WHERE proname = 'spDeleteAIConfiguration'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIConfiguration"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJAIAgentConfigurations_AIConfigurationIDID UUID;
    p_MJAIAgentConfigurations_AIConfigurationID_AgentID UUID;
    p_MJAIAgentConfigurations_AIConfigurationID_Name VARCHAR(100);
    p_MJAIAgentConfigurations_AIConfigurationID_DisplayName VARCHAR(200);
    p_MJAIAgentConfigurations_AIConfigurationID_Description TEXT;
    p_MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID UUID;
    p_MJAIAgentConfigurations_AIConfigurationID_IsDefault BOOLEAN;
    p_MJAIAgentConfigurations_AIConfigurationID_Priority INTEGER;
    p_MJAIAgentConfigurations_AIConfigurationID_Status VARCHAR(20);
    p_MJAIAgentPrompts_ConfigurationIDID UUID;
    p_MJAIAgentRuns_ConfigurationIDID UUID;
    p_MJAIAgentRuns_ConfigurationID_AgentID UUID;
    p_MJAIAgentRuns_ConfigurationID_ParentRunID UUID;
    p_MJAIAgentRuns_ConfigurationID_Status VARCHAR(50);
    p_MJAIAgentRuns_ConfigurationID_StartedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConfigurationID_CompletedAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConfigurationID_Success BOOLEAN;
    p_MJAIAgentRuns_ConfigurationID_ErrorMessage TEXT;
    p_MJAIAgentRuns_ConfigurationID_ConversationID UUID;
    p_MJAIAgentRuns_ConfigurationID_UserID UUID;
    p_MJAIAgentRuns_ConfigurationID_Result TEXT;
    p_MJAIAgentRuns_ConfigurationID_AgentState TEXT;
    p_MJAIAgentRuns_ConfigurationID_TotalTokensUsed INTEGER;
    p_MJAIAgentRuns_ConfigurationID_TotalCost NUMERIC(18,6);
    p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed INTEGER;
    p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed INTEGER;
    p_MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup INTEGER;
    p_MJAIAgentRuns_ConfigurationID_TotalCostRollup NUMERIC(19,8);
    p_MJAIAgentRuns_ConfigurationID_ConversationDetailID UUID;
    p_MJAIAgentRuns_ConfigurationID_ConversationDetailSequence INTEGER;
    p_MJAIAgentRuns_ConfigurationID_CancellationReason VARCHAR(30);
    p_MJAIAgentRuns_ConfigurationID_FinalStep VARCHAR(30);
    p_MJAIAgentRuns_ConfigurationID_FinalPayload TEXT;
    p_MJAIAgentRuns_ConfigurationID_Message TEXT;
    p_MJAIAgentRuns_ConfigurationID_LastRunID UUID;
    p_MJAIAgentRuns_ConfigurationID_StartingPayload TEXT;
    p_MJAIAgentRuns_ConfigurationID_TotalPromptIterations INTEGER;
    p_MJAIAgentRuns_ConfigurationID_ConfigurationID UUID;
    p_MJAIAgentRuns_ConfigurationID_OverrideModelID UUID;
    p_MJAIAgentRuns_ConfigurationID_OverrideVendorID UUID;
    p_MJAIAgentRuns_ConfigurationID_Data TEXT;
    p_MJAIAgentRuns_ConfigurationID_Verbose BOOLEAN;
    p_MJAIAgentRuns_ConfigurationID_EffortLevel INTEGER;
    p_MJAIAgentRuns_ConfigurationID_RunName VARCHAR(255);
    p_MJAIAgentRuns_ConfigurationID_Comments TEXT;
    p_MJAIAgentRuns_ConfigurationID_ScheduledJobRunID UUID;
    p_MJAIAgentRuns_ConfigurationID_TestRunID UUID;
    p_MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID UUID;
    p_MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID VARCHAR(100);
    p_MJAIAgentRuns_ConfigurationID_SecondaryScopes TEXT;
    p_MJAIAgentRuns_ConfigurationID_ExternalReferenceID VARCHAR(200);
    p_MJAIAgentRuns_ConfigurationID_CompanyID UUID;
    p_MJAIAgentRuns_ConfigurationID_TotalCacheReadTokensUsed INTEGER;
    p_MJAIAgentRuns_ConfigurationID_TotalCacheWriteTokensUsed INTEGER;
    p_MJAIAgentRuns_ConfigurationID_LastHeartbeatAt TIMESTAMPTZ;
    p_MJAIAgentRuns_ConfigurationID_AgentSessionID UUID;
    p_MJAIConfigurationParams_ConfigurationIDID UUID;
    p_MJAIConfigurations_ParentIDID UUID;
    p_MJAIConfigurations_ParentID_Name VARCHAR(100);
    p_MJAIConfigurations_ParentID_Description TEXT;
    p_MJAIConfigurations_ParentID_IsDefault BOOLEAN;
    p_MJAIConfigurations_ParentID_Status VARCHAR(20);
    p_MJAIConfigurations_ParentID_DefaultPromptForContextComp_77efd6 UUID;
    p_MJAIConfigurations_ParentID_DefaultPromptForContextSumm_ff5147 UUID;
    p_MJAIConfigurations_ParentID_DefaultStorageProviderID UUID;
    p_MJAIConfigurations_ParentID_DefaultStorageRootPath VARCHAR(500);
    p_MJAIConfigurations_ParentID_ParentID UUID;
    p_MJAIPromptModels_ConfigurationIDID UUID;
    p_MJAIPromptRuns_ConfigurationIDID UUID;
    p_MJAIPromptRuns_ConfigurationID_PromptID UUID;
    p_MJAIPromptRuns_ConfigurationID_ModelID UUID;
    p_MJAIPromptRuns_ConfigurationID_VendorID UUID;
    p_MJAIPromptRuns_ConfigurationID_AgentID UUID;
    p_MJAIPromptRuns_ConfigurationID_ConfigurationID UUID;
    p_MJAIPromptRuns_ConfigurationID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ConfigurationID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ConfigurationID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_ConfigurationID_Messages TEXT;
    p_MJAIPromptRuns_ConfigurationID_Result TEXT;
    p_MJAIPromptRuns_ConfigurationID_TokensUsed INTEGER;
    p_MJAIPromptRuns_ConfigurationID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_ConfigurationID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_ConfigurationID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_ConfigurationID_Success BOOLEAN;
    p_MJAIPromptRuns_ConfigurationID_ErrorMessage TEXT;
    p_MJAIPromptRuns_ConfigurationID_ParentID UUID;
    p_MJAIPromptRuns_ConfigurationID_RunType VARCHAR(20);
    p_MJAIPromptRuns_ConfigurationID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_ConfigurationID_AgentRunID UUID;
    p_MJAIPromptRuns_ConfigurationID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_ConfigurationID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_ConfigurationID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_ConfigurationID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_ConfigurationID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_ConfigurationID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_ConfigurationID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_ConfigurationID_TopK INTEGER;
    p_MJAIPromptRuns_ConfigurationID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_ConfigurationID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_ConfigurationID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_ConfigurationID_Seed INTEGER;
    p_MJAIPromptRuns_ConfigurationID_StopSequences TEXT;
    p_MJAIPromptRuns_ConfigurationID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_ConfigurationID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_ConfigurationID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_ConfigurationID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_ConfigurationID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_ConfigurationID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_ConfigurationID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_ConfigurationID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_ConfigurationID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_ConfigurationID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_ConfigurationID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_ConfigurationID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ConfigurationID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_ConfigurationID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_ConfigurationID_ValidationSummary TEXT;
    p_MJAIPromptRuns_ConfigurationID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_ConfigurationID_FailoverErrors TEXT;
    p_MJAIPromptRuns_ConfigurationID_FailoverDurations TEXT;
    p_MJAIPromptRuns_ConfigurationID_OriginalModelID UUID;
    p_MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_ConfigurationID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_ConfigurationID_ModelSelection TEXT;
    p_MJAIPromptRuns_ConfigurationID_Status VARCHAR(50);
    p_MJAIPromptRuns_ConfigurationID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_ConfigurationID_CancellationReason TEXT;
    p_MJAIPromptRuns_ConfigurationID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_ConfigurationID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_ConfigurationID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_ConfigurationID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_ConfigurationID_JudgeID UUID;
    p_MJAIPromptRuns_ConfigurationID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_ConfigurationID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_ConfigurationID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_ConfigurationID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_ConfigurationID_ErrorDetails TEXT;
    p_MJAIPromptRuns_ConfigurationID_ChildPromptID UUID;
    p_MJAIPromptRuns_ConfigurationID_QueueTime INTEGER;
    p_MJAIPromptRuns_ConfigurationID_PromptTime INTEGER;
    p_MJAIPromptRuns_ConfigurationID_CompletionTime INTEGER;
    p_MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails TEXT;
    p_MJAIPromptRuns_ConfigurationID_EffortLevel INTEGER;
    p_MJAIPromptRuns_ConfigurationID_RunName VARCHAR(255);
    p_MJAIPromptRuns_ConfigurationID_Comments TEXT;
    p_MJAIPromptRuns_ConfigurationID_TestRunID UUID;
    p_MJAIPromptRuns_ConfigurationID_AssistantPrefill TEXT;
    p_MJAIPromptRuns_ConfigurationID_TokensCacheRead INTEGER;
    p_MJAIPromptRuns_ConfigurationID_TokensCacheWrite INTEGER;
    p_MJAIPromptRuns_ConfigurationID_TokensCacheReadRollup INTEGER;
    p_MJAIPromptRuns_ConfigurationID_TokensCacheWriteRollup INTEGER;
    p_MJAIResultCache_ConfigurationIDID UUID;
    p_MJAIResultCache_ConfigurationID_AIPromptID UUID;
    p_MJAIResultCache_ConfigurationID_AIModelID UUID;
    p_MJAIResultCache_ConfigurationID_RunAt TIMESTAMPTZ;
    p_MJAIResultCache_ConfigurationID_PromptText TEXT;
    p_MJAIResultCache_ConfigurationID_ResultText TEXT;
    p_MJAIResultCache_ConfigurationID_Status VARCHAR(50);
    p_MJAIResultCache_ConfigurationID_ExpiredOn TIMESTAMPTZ;
    p_MJAIResultCache_ConfigurationID_VendorID UUID;
    p_MJAIResultCache_ConfigurationID_AgentID UUID;
    p_MJAIResultCache_ConfigurationID_ConfigurationID UUID;
    p_MJAIResultCache_ConfigurationID_PromptEmbedding BYTEA;
    p_MJAIResultCache_ConfigurationID_PromptRunID UUID;
BEGIN
-- Cascade update on AIAgentConfiguration using cursor to call spUpdateAIAgentConfiguration


    FOR _rec IN SELECT "ID", "AgentID", "Name", "DisplayName", "Description", "AIConfigurationID", "IsDefault", "Priority", "Status" FROM __mj."AIAgentConfiguration" WHERE "AIConfigurationID" = p_ID
    LOOP
        p_MJAIAgentConfigurations_AIConfigurationIDID := _rec."ID";
        p_MJAIAgentConfigurations_AIConfigurationID_AgentID := _rec."AgentID";
        p_MJAIAgentConfigurations_AIConfigurationID_Name := _rec."Name";
        p_MJAIAgentConfigurations_AIConfigurationID_DisplayName := _rec."DisplayName";
        p_MJAIAgentConfigurations_AIConfigurationID_Description := _rec."Description";
        p_MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID := _rec."AIConfigurationID";
        p_MJAIAgentConfigurations_AIConfigurationID_IsDefault := _rec."IsDefault";
        p_MJAIAgentConfigurations_AIConfigurationID_Priority := _rec."Priority";
        p_MJAIAgentConfigurations_AIConfigurationID_Status := _rec."Status";
        -- Set the FK field to NULL
        p_MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentConfiguration"(p_ID => p_MJAIAgentConfigurations_AIConfigurationIDID, p_AgentID => p_MJAIAgentConfigurations_AIConfigurationID_AgentID, p_Name => p_MJAIAgentConfigurations_AIConfigurationID_Name, p_DisplayName => p_MJAIAgentConfigurations_AIConfigurationID_DisplayName, p_Description => p_MJAIAgentConfigurations_AIConfigurationID_Description, p_AIConfigurationID_Clear => 1, p_AIConfigurationID => p_MJAIAgentConfigurations_AIConfigurationID_AIConfigurationID, p_IsDefault => p_MJAIAgentConfigurations_AIConfigurationID_IsDefault, p_Priority => p_MJAIAgentConfigurations_AIConfigurationID_Priority, p_Status => p_MJAIAgentConfigurations_AIConfigurationID_Status);

    END LOOP;

    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentPrompt" WHERE "ConfigurationID" = p_ID
    LOOP
        p_MJAIAgentPrompts_ConfigurationIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentPrompt"(p_ID => p_MJAIAgentPrompts_ConfigurationIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt", "AgentSessionID" FROM __mj."AIAgentRun" WHERE "ConfigurationID" = p_ID
    LOOP
        p_MJAIAgentRuns_ConfigurationIDID := _rec."ID";
        p_MJAIAgentRuns_ConfigurationID_AgentID := _rec."AgentID";
        p_MJAIAgentRuns_ConfigurationID_ParentRunID := _rec."ParentRunID";
        p_MJAIAgentRuns_ConfigurationID_Status := _rec."Status";
        p_MJAIAgentRuns_ConfigurationID_StartedAt := _rec."StartedAt";
        p_MJAIAgentRuns_ConfigurationID_CompletedAt := _rec."CompletedAt";
        p_MJAIAgentRuns_ConfigurationID_Success := _rec."Success";
        p_MJAIAgentRuns_ConfigurationID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIAgentRuns_ConfigurationID_ConversationID := _rec."ConversationID";
        p_MJAIAgentRuns_ConfigurationID_UserID := _rec."UserID";
        p_MJAIAgentRuns_ConfigurationID_Result := _rec."Result";
        p_MJAIAgentRuns_ConfigurationID_AgentState := _rec."AgentState";
        p_MJAIAgentRuns_ConfigurationID_TotalTokensUsed := _rec."TotalTokensUsed";
        p_MJAIAgentRuns_ConfigurationID_TotalCost := _rec."TotalCost";
        p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed := _rec."TotalPromptTokensUsed";
        p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed := _rec."TotalCompletionTokensUsed";
        p_MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup := _rec."TotalTokensUsedRollup";
        p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup := _rec."TotalPromptTokensUsedRollup";
        p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup := _rec."TotalCompletionTokensUsedRollup";
        p_MJAIAgentRuns_ConfigurationID_TotalCostRollup := _rec."TotalCostRollup";
        p_MJAIAgentRuns_ConfigurationID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJAIAgentRuns_ConfigurationID_ConversationDetailSequence := _rec."ConversationDetailSequence";
        p_MJAIAgentRuns_ConfigurationID_CancellationReason := _rec."CancellationReason";
        p_MJAIAgentRuns_ConfigurationID_FinalStep := _rec."FinalStep";
        p_MJAIAgentRuns_ConfigurationID_FinalPayload := _rec."FinalPayload";
        p_MJAIAgentRuns_ConfigurationID_Message := _rec."Message";
        p_MJAIAgentRuns_ConfigurationID_LastRunID := _rec."LastRunID";
        p_MJAIAgentRuns_ConfigurationID_StartingPayload := _rec."StartingPayload";
        p_MJAIAgentRuns_ConfigurationID_TotalPromptIterations := _rec."TotalPromptIterations";
        p_MJAIAgentRuns_ConfigurationID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIAgentRuns_ConfigurationID_OverrideModelID := _rec."OverrideModelID";
        p_MJAIAgentRuns_ConfigurationID_OverrideVendorID := _rec."OverrideVendorID";
        p_MJAIAgentRuns_ConfigurationID_Data := _rec."Data";
        p_MJAIAgentRuns_ConfigurationID_Verbose := _rec."Verbose";
        p_MJAIAgentRuns_ConfigurationID_EffortLevel := _rec."EffortLevel";
        p_MJAIAgentRuns_ConfigurationID_RunName := _rec."RunName";
        p_MJAIAgentRuns_ConfigurationID_Comments := _rec."Comments";
        p_MJAIAgentRuns_ConfigurationID_ScheduledJobRunID := _rec."ScheduledJobRunID";
        p_MJAIAgentRuns_ConfigurationID_TestRunID := _rec."TestRunID";
        p_MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJAIAgentRuns_ConfigurationID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJAIAgentRuns_ConfigurationID_ExternalReferenceID := _rec."ExternalReferenceID";
        p_MJAIAgentRuns_ConfigurationID_CompanyID := _rec."CompanyID";
        p_MJAIAgentRuns_ConfigurationID_TotalCacheReadTokensUsed := _rec."TotalCacheReadTokensUsed";
        p_MJAIAgentRuns_ConfigurationID_TotalCacheWriteTokensUsed := _rec."TotalCacheWriteTokensUsed";
        p_MJAIAgentRuns_ConfigurationID_LastHeartbeatAt := _rec."LastHeartbeatAt";
        p_MJAIAgentRuns_ConfigurationID_AgentSessionID := _rec."AgentSessionID";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ConfigurationID_ConfigurationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ConfigurationIDID, p_AgentID => p_MJAIAgentRuns_ConfigurationID_AgentID, p_ParentRunID => p_MJAIAgentRuns_ConfigurationID_ParentRunID, p_Status => p_MJAIAgentRuns_ConfigurationID_Status, p_StartedAt => p_MJAIAgentRuns_ConfigurationID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ConfigurationID_CompletedAt, p_Success => p_MJAIAgentRuns_ConfigurationID_Success, p_ErrorMessage => p_MJAIAgentRuns_ConfigurationID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_ConfigurationID_ConversationID, p_UserID => p_MJAIAgentRuns_ConfigurationID_UserID, p_Result => p_MJAIAgentRuns_ConfigurationID_Result, p_AgentState => p_MJAIAgentRuns_ConfigurationID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ConfigurationID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ConfigurationID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_ConfigurationID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_ConfigurationID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ConfigurationID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ConfigurationID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ConfigurationID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ConfigurationID_FinalPayload, p_Message => p_MJAIAgentRuns_ConfigurationID_Message, p_LastRunID => p_MJAIAgentRuns_ConfigurationID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ConfigurationID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ConfigurationID_TotalPromptIterations, p_ConfigurationID_Clear => 1, p_ConfigurationID => p_MJAIAgentRuns_ConfigurationID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ConfigurationID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ConfigurationID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ConfigurationID_Data, p_Verbose => p_MJAIAgentRuns_ConfigurationID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ConfigurationID_EffortLevel, p_RunName => p_MJAIAgentRuns_ConfigurationID_RunName, p_Comments => p_MJAIAgentRuns_ConfigurationID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ConfigurationID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ConfigurationID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ConfigurationID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ConfigurationID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ConfigurationID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_ConfigurationID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_ConfigurationID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_ConfigurationID_LastHeartbeatAt, p_AgentSessionID => p_MJAIAgentRuns_ConfigurationID_AgentSessionID);

    END LOOP;

    
    -- Cascade delete from AIConfigurationParam using cursor to call spDeleteAIConfigurationParam

    FOR _rec IN SELECT "ID" FROM __mj."AIConfigurationParam" WHERE "ConfigurationID" = p_ID
    LOOP
        p_MJAIConfigurationParams_ConfigurationIDID := _rec."ID";
        PERFORM __mj."spDeleteAIConfigurationParam"(p_ID => p_MJAIConfigurationParams_ConfigurationIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration


    FOR _rec IN SELECT "ID", "Name", "Description", "IsDefault", "Status", "DefaultPromptForContextCompressionID", "DefaultPromptForContextSummarizationID", "DefaultStorageProviderID", "DefaultStorageRootPath", "ParentID" FROM __mj."AIConfiguration" WHERE "ParentID" = p_ID
    LOOP
        p_MJAIConfigurations_ParentIDID := _rec."ID";
        p_MJAIConfigurations_ParentID_Name := _rec."Name";
        p_MJAIConfigurations_ParentID_Description := _rec."Description";
        p_MJAIConfigurations_ParentID_IsDefault := _rec."IsDefault";
        p_MJAIConfigurations_ParentID_Status := _rec."Status";
        p_MJAIConfigurations_ParentID_DefaultPromptForContextComp_77efd6 := _rec."DefaultPromptForContextCompressionID";
        p_MJAIConfigurations_ParentID_DefaultPromptForContextSumm_ff5147 := _rec."DefaultPromptForContextSummarizationID";
        p_MJAIConfigurations_ParentID_DefaultStorageProviderID := _rec."DefaultStorageProviderID";
        p_MJAIConfigurations_ParentID_DefaultStorageRootPath := _rec."DefaultStorageRootPath";
        p_MJAIConfigurations_ParentID_ParentID := _rec."ParentID";
        -- Set the FK field to NULL
        p_MJAIConfigurations_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIConfiguration"(p_ID => p_MJAIConfigurations_ParentIDID, p_Name => p_MJAIConfigurations_ParentID_Name, p_Description => p_MJAIConfigurations_ParentID_Description, p_IsDefault => p_MJAIConfigurations_ParentID_IsDefault, p_Status => p_MJAIConfigurations_ParentID_Status, p_DefaultPromptForContextCompressionID => p_MJAIConfigurations_ParentID_DefaultPromptForContextComp_77efd6, p_DefaultPromptForContextSummarizationID => p_MJAIConfigurations_ParentID_DefaultPromptForContextSumm_ff5147, p_DefaultStorageProviderID => p_MJAIConfigurations_ParentID_DefaultStorageProviderID, p_DefaultStorageRootPath => p_MJAIConfigurations_ParentID_DefaultStorageRootPath, p_ParentID_Clear => 1, p_ParentID => p_MJAIConfigurations_ParentID_ParentID);

    END LOOP;

    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel

    FOR _rec IN SELECT "ID" FROM __mj."AIPromptModel" WHERE "ConfigurationID" = p_ID
    LOOP
        p_MJAIPromptModels_ConfigurationIDID := _rec."ID";
        PERFORM __mj."spDeleteAIPromptModel"(p_ID => p_MJAIPromptModels_ConfigurationIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite", "TokensCacheReadRollup", "TokensCacheWriteRollup" FROM __mj."AIPromptRun" WHERE "ConfigurationID" = p_ID
    LOOP
        p_MJAIPromptRuns_ConfigurationIDID := _rec."ID";
        p_MJAIPromptRuns_ConfigurationID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_ConfigurationID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_ConfigurationID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_ConfigurationID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_ConfigurationID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_ConfigurationID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_ConfigurationID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_ConfigurationID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_ConfigurationID_Messages := _rec."Messages";
        p_MJAIPromptRuns_ConfigurationID_Result := _rec."Result";
        p_MJAIPromptRuns_ConfigurationID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_ConfigurationID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_ConfigurationID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_ConfigurationID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_ConfigurationID_Success := _rec."Success";
        p_MJAIPromptRuns_ConfigurationID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_ConfigurationID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_ConfigurationID_RunType := _rec."RunType";
        p_MJAIPromptRuns_ConfigurationID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_ConfigurationID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_ConfigurationID_Cost := _rec."Cost";
        p_MJAIPromptRuns_ConfigurationID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_ConfigurationID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_ConfigurationID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_ConfigurationID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_ConfigurationID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_ConfigurationID_TopP := _rec."TopP";
        p_MJAIPromptRuns_ConfigurationID_TopK := _rec."TopK";
        p_MJAIPromptRuns_ConfigurationID_MinP := _rec."MinP";
        p_MJAIPromptRuns_ConfigurationID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_ConfigurationID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_ConfigurationID_Seed := _rec."Seed";
        p_MJAIPromptRuns_ConfigurationID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_ConfigurationID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_ConfigurationID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_ConfigurationID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_ConfigurationID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_ConfigurationID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_ConfigurationID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_ConfigurationID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_ConfigurationID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_ConfigurationID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_ConfigurationID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_ConfigurationID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_ConfigurationID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_ConfigurationID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_ConfigurationID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_ConfigurationID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_ConfigurationID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_ConfigurationID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_ConfigurationID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_ConfigurationID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_ConfigurationID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_ConfigurationID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_ConfigurationID_Status := _rec."Status";
        p_MJAIPromptRuns_ConfigurationID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_ConfigurationID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_ConfigurationID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_ConfigurationID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_ConfigurationID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_ConfigurationID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_ConfigurationID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_ConfigurationID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_ConfigurationID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_ConfigurationID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_ConfigurationID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_ConfigurationID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_ConfigurationID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_ConfigurationID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_ConfigurationID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_ConfigurationID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_ConfigurationID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_ConfigurationID_RunName := _rec."RunName";
        p_MJAIPromptRuns_ConfigurationID_Comments := _rec."Comments";
        p_MJAIPromptRuns_ConfigurationID_TestRunID := _rec."TestRunID";
        p_MJAIPromptRuns_ConfigurationID_AssistantPrefill := _rec."AssistantPrefill";
        p_MJAIPromptRuns_ConfigurationID_TokensCacheRead := _rec."TokensCacheRead";
        p_MJAIPromptRuns_ConfigurationID_TokensCacheWrite := _rec."TokensCacheWrite";
        p_MJAIPromptRuns_ConfigurationID_TokensCacheReadRollup := _rec."TokensCacheReadRollup";
        p_MJAIPromptRuns_ConfigurationID_TokensCacheWriteRollup := _rec."TokensCacheWriteRollup";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_ConfigurationID_ConfigurationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_ConfigurationIDID, p_PromptID => p_MJAIPromptRuns_ConfigurationID_PromptID, p_ModelID => p_MJAIPromptRuns_ConfigurationID_ModelID, p_VendorID => p_MJAIPromptRuns_ConfigurationID_VendorID, p_AgentID => p_MJAIPromptRuns_ConfigurationID_AgentID, p_ConfigurationID_Clear => 1, p_ConfigurationID => p_MJAIPromptRuns_ConfigurationID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_ConfigurationID_RunAt, p_CompletedAt => p_MJAIPromptRuns_ConfigurationID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_ConfigurationID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_ConfigurationID_Messages, p_Result => p_MJAIPromptRuns_ConfigurationID_Result, p_TokensUsed => p_MJAIPromptRuns_ConfigurationID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_ConfigurationID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_ConfigurationID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_ConfigurationID_TotalCost, p_Success => p_MJAIPromptRuns_ConfigurationID_Success, p_ErrorMessage => p_MJAIPromptRuns_ConfigurationID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_ConfigurationID_ParentID, p_RunType => p_MJAIPromptRuns_ConfigurationID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_ConfigurationID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_ConfigurationID_AgentRunID, p_Cost => p_MJAIPromptRuns_ConfigurationID_Cost, p_CostCurrency => p_MJAIPromptRuns_ConfigurationID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_ConfigurationID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_ConfigurationID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_ConfigurationID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_ConfigurationID_Temperature, p_TopP => p_MJAIPromptRuns_ConfigurationID_TopP, p_TopK => p_MJAIPromptRuns_ConfigurationID_TopK, p_MinP => p_MJAIPromptRuns_ConfigurationID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_ConfigurationID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_ConfigurationID_PresencePenalty, p_Seed => p_MJAIPromptRuns_ConfigurationID_Seed, p_StopSequences => p_MJAIPromptRuns_ConfigurationID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_ConfigurationID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_ConfigurationID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_ConfigurationID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_ConfigurationID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_ConfigurationID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_ConfigurationID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_ConfigurationID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_ConfigurationID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_ConfigurationID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_ConfigurationID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_ConfigurationID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_ConfigurationID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_ConfigurationID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_ConfigurationID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_ConfigurationID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_ConfigurationID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_ConfigurationID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_ConfigurationID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_ConfigurationID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_ConfigurationID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_ConfigurationID_ModelSelection, p_Status => p_MJAIPromptRuns_ConfigurationID_Status, p_Cancelled => p_MJAIPromptRuns_ConfigurationID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_ConfigurationID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_ConfigurationID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_ConfigurationID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_ConfigurationID_CacheHit, p_CacheKey => p_MJAIPromptRuns_ConfigurationID_CacheKey, p_JudgeID => p_MJAIPromptRuns_ConfigurationID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_ConfigurationID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_ConfigurationID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_ConfigurationID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_ConfigurationID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_ConfigurationID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_ConfigurationID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_ConfigurationID_QueueTime, p_PromptTime => p_MJAIPromptRuns_ConfigurationID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_ConfigurationID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_ConfigurationID_EffortLevel, p_RunName => p_MJAIPromptRuns_ConfigurationID_RunName, p_Comments => p_MJAIPromptRuns_ConfigurationID_Comments, p_TestRunID => p_MJAIPromptRuns_ConfigurationID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_ConfigurationID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_ConfigurationID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_ConfigurationID_TokensCacheWrite, p_TokensCacheReadRollup => p_MJAIPromptRuns_ConfigurationID_TokensCacheReadRollup, p_TokensCacheWriteRollup => p_MJAIPromptRuns_ConfigurationID_TokensCacheWriteRollup);

    END LOOP;

    
    -- Cascade update on AIResultCache using cursor to call spUpdateAIResultCache


    FOR _rec IN SELECT "ID", "AIPromptID", "AIModelID", "RunAt", "PromptText", "ResultText", "Status", "ExpiredOn", "VendorID", "AgentID", "ConfigurationID", "PromptEmbedding", "PromptRunID" FROM __mj."AIResultCache" WHERE "ConfigurationID" = p_ID
    LOOP
        p_MJAIResultCache_ConfigurationIDID := _rec."ID";
        p_MJAIResultCache_ConfigurationID_AIPromptID := _rec."AIPromptID";
        p_MJAIResultCache_ConfigurationID_AIModelID := _rec."AIModelID";
        p_MJAIResultCache_ConfigurationID_RunAt := _rec."RunAt";
        p_MJAIResultCache_ConfigurationID_PromptText := _rec."PromptText";
        p_MJAIResultCache_ConfigurationID_ResultText := _rec."ResultText";
        p_MJAIResultCache_ConfigurationID_Status := _rec."Status";
        p_MJAIResultCache_ConfigurationID_ExpiredOn := _rec."ExpiredOn";
        p_MJAIResultCache_ConfigurationID_VendorID := _rec."VendorID";
        p_MJAIResultCache_ConfigurationID_AgentID := _rec."AgentID";
        p_MJAIResultCache_ConfigurationID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIResultCache_ConfigurationID_PromptEmbedding := _rec."PromptEmbedding";
        p_MJAIResultCache_ConfigurationID_PromptRunID := _rec."PromptRunID";
        -- Set the FK field to NULL
        p_MJAIResultCache_ConfigurationID_ConfigurationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIResultCache"(p_ID => p_MJAIResultCache_ConfigurationIDID, p_AIPromptID => p_MJAIResultCache_ConfigurationID_AIPromptID, p_AIModelID => p_MJAIResultCache_ConfigurationID_AIModelID, p_RunAt => p_MJAIResultCache_ConfigurationID_RunAt, p_PromptText => p_MJAIResultCache_ConfigurationID_PromptText, p_ResultText => p_MJAIResultCache_ConfigurationID_ResultText, p_Status => p_MJAIResultCache_ConfigurationID_Status, p_ExpiredOn => p_MJAIResultCache_ConfigurationID_ExpiredOn, p_VendorID => p_MJAIResultCache_ConfigurationID_VendorID, p_AgentID => p_MJAIResultCache_ConfigurationID_AgentID, p_ConfigurationID_Clear => 1, p_ConfigurationID => p_MJAIResultCache_ConfigurationID_ConfigurationID, p_PromptEmbedding => p_MJAIResultCache_ConfigurationID_PromptEmbedding, p_PromptRunID => p_MJAIResultCache_ConfigurationID_PromptRunID);

    END LOOP;

    

    DELETE FROM
        __mj."AIConfiguration"
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


    FOR _rec IN SELECT "ID", "Name", "Description", "SystemPromptID", "IsActive", "AgentPromptPlaceholder", "DriverClass", "UIFormSectionKey", "UIFormKey", "UIFormSectionExpandedByDefault", "PromptParamsSchema", "AssignmentStrategy", "DefaultStorageAccountID", "ConfigSchema", "DefaultConfiguration" FROM __mj."AIAgentType" WHERE "SystemPromptID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgentTypes_SystemPromptID_SystemPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentType"(p_ID => p_MJAIAgentTypes_SystemPromptIDID, p_Name => p_MJAIAgentTypes_SystemPromptID_Name, p_Description => p_MJAIAgentTypes_SystemPromptID_Description, p_SystemPromptID_Clear => 1, p_SystemPromptID => p_MJAIAgentTypes_SystemPromptID_SystemPromptID, p_IsActive => p_MJAIAgentTypes_SystemPromptID_IsActive, p_AgentPromptPlaceholder => p_MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, p_DriverClass => p_MJAIAgentTypes_SystemPromptID_DriverClass, p_UIFormSectionKey => p_MJAIAgentTypes_SystemPromptID_UIFormSectionKey, p_UIFormKey => p_MJAIAgentTypes_SystemPromptID_UIFormKey, p_UIFormSectionExpandedByDefault => p_MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, p_PromptParamsSchema => p_MJAIAgentTypes_SystemPromptID_PromptParamsSchema, p_AssignmentStrategy => p_MJAIAgentTypes_SystemPromptID_AssignmentStrategy, p_DefaultStorageAccountID => p_MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID, p_ConfigSchema => p_MJAIAgentTypes_SystemPromptID_ConfigSchema, p_DefaultConfiguration => p_MJAIAgentTypes_SystemPromptID_DefaultConfiguration);

    END LOOP;

    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID", "AllowEphemeralClientTools", "DefaultStorageAccountID", "SearchScopeAccess", "AcceptUnregisteredFiles", "DefaultCoAgentID", "TypeConfiguration", "AllowMemoryWrite" FROM __mj."AIAgent" WHERE "ContextCompressionPromptID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_ID => p_MJAIAgents_ContextCompressionPromptIDID, p_Name => p_MJAIAgents_ContextCompressionPromptID_Name, p_Description => p_MJAIAgents_ContextCompressionPromptID_Description, p_LogoURL => p_MJAIAgents_ContextCompressionPromptID_LogoURL, p_ParentID => p_MJAIAgents_ContextCompressionPromptID_ParentID, p_ExposeAsAction => p_MJAIAgents_ContextCompressionPromptID_ExposeAsAction, p_ExecutionOrder => p_MJAIAgents_ContextCompressionPromptID_ExecutionOrder, p_ExecutionMode => p_MJAIAgents_ContextCompressionPromptID_ExecutionMode, p_EnableContextCompression => p_MJAIAgents_ContextCompressionPromptID_EnableContextComp_017508, p_ContextCompressionMessageThreshold => p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_09124d, p_ContextCompressionPromptID_Clear => 1, p_ContextCompressionPromptID => p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d, p_ContextCompressionMessageRetentionCount => p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_6c27f1, p_TypeID => p_MJAIAgents_ContextCompressionPromptID_TypeID, p_Status => p_MJAIAgents_ContextCompressionPromptID_Status, p_DriverClass => p_MJAIAgents_ContextCompressionPromptID_DriverClass, p_IconClass => p_MJAIAgents_ContextCompressionPromptID_IconClass, p_ModelSelectionMode => p_MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, p_PayloadDownstreamPaths => p_MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, p_PayloadUpstreamPaths => p_MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, p_PayloadSelfReadPaths => p_MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, p_PayloadSelfWritePaths => p_MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, p_PayloadScope => p_MJAIAgents_ContextCompressionPromptID_PayloadScope, p_FinalPayloadValidation => p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, p_FinalPayloadValidationMode => p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a7a211, p_FinalPayloadValidationMaxRetries => p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a47251, p_MaxCostPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, p_MaxTokensPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, p_MaxIterationsPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, p_MaxTimePerRun => p_MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, p_MinExecutionsPerRun => p_MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, p_StartingPayloadValidation => p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60, p_StartingPayloadValidationMode => p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60Mode, p_DefaultPromptEffortLevel => p_MJAIAgents_ContextCompressionPromptID_DefaultPromptEffo_322203, p_ChatHandlingOption => p_MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, p_DefaultArtifactTypeID => p_MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, p_OwnerUserID => p_MJAIAgents_ContextCompressionPromptID_OwnerUserID, p_InvocationMode => p_MJAIAgents_ContextCompressionPromptID_InvocationMode, p_ArtifactCreationMode => p_MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, p_FunctionalRequirements => p_MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, p_TechnicalDesign => p_MJAIAgents_ContextCompressionPromptID_TechnicalDesign, p_InjectNotes => p_MJAIAgents_ContextCompressionPromptID_InjectNotes, p_MaxNotesToInject => p_MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, p_NoteInjectionStrategy => p_MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, p_InjectExamples => p_MJAIAgents_ContextCompressionPromptID_InjectExamples, p_MaxExamplesToInject => p_MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, p_ExampleInjectionStrategy => p_MJAIAgents_ContextCompressionPromptID_ExampleInjectionS_27b212, p_IsRestricted => p_MJAIAgents_ContextCompressionPromptID_IsRestricted, p_MessageMode => p_MJAIAgents_ContextCompressionPromptID_MessageMode, p_MaxMessages => p_MJAIAgents_ContextCompressionPromptID_MaxMessages, p_AttachmentStorageProviderID => p_MJAIAgents_ContextCompressionPromptID_AttachmentStorage_81bfaf, p_AttachmentRootPath => p_MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, p_InlineStorageThresholdBytes => p_MJAIAgents_ContextCompressionPromptID_InlineStorageThre_804eef, p_AgentTypePromptParams => p_MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, p_ScopeConfig => p_MJAIAgents_ContextCompressionPromptID_ScopeConfig, p_NoteRetentionDays => p_MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, p_ExampleRetentionDays => p_MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, p_AutoArchiveEnabled => p_MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, p_RerankerConfiguration => p_MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, p_CategoryID => p_MJAIAgents_ContextCompressionPromptID_CategoryID, p_AllowEphemeralClientTools => p_MJAIAgents_ContextCompressionPromptID_AllowEphemeralCli_be674b, p_DefaultStorageAccountID => p_MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, p_SearchScopeAccess => p_MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, p_AcceptUnregisteredFiles => p_MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles, p_DefaultCoAgentID => p_MJAIAgents_ContextCompressionPromptID_DefaultCoAgentID, p_TypeConfiguration => p_MJAIAgents_ContextCompressionPromptID_TypeConfiguration, p_AllowMemoryWrite => p_MJAIAgents_ContextCompressionPromptID_AllowMemoryWrite);

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

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIAgentExample_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIAgentExample" ON __mj."AIAgentExample";
CREATE TRIGGER "trgUpdateAIAgentExample"
    BEFORE UPDATE ON __mj."AIAgentExample"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIAgentExample_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIAgentNote_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIAgentNote" ON __mj."AIAgentNote";
CREATE TRIGGER "trgUpdateAIAgentNote"
    BEFORE UPDATE ON __mj."AIAgentNote"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIAgentNote_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateConversationDetailArtifact_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateConversationDetailArtifact" ON __mj."ConversationDetailArtifact";
CREATE TRIGGER "trgUpdateConversationDetailArtifact"
    BEFORE UPDATE ON __mj."ConversationDetailArtifact"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateConversationDetailArtifact_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateConversationDetailAttachment_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateConversationDetailAttachment" ON __mj."ConversationDetailAttachment";
CREATE TRIGGER "trgUpdateConversationDetailAttachment"
    BEFORE UPDATE ON __mj."ConversationDetailAttachment"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateConversationDetailAttachment_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateConversationDetailRating_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateConversationDetailRating" ON __mj."ConversationDetailRating";
CREATE TRIGGER "trgUpdateConversationDetailRating"
    BEFORE UPDATE ON __mj."ConversationDetailRating"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateConversationDetailRating_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateReport_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateReport" ON __mj."Report";
CREATE TRIGGER "trgUpdateReport"
    BEFORE UPDATE ON __mj."Report"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateReport_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateTask_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateTask" ON __mj."Task";
CREATE TRIGGER "trgUpdateTask"
    BEFORE UPDATE ON __mj."Task"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateTask_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIAgentRun_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIAgentRun" ON __mj."AIAgentRun";
CREATE TRIGGER "trgUpdateAIAgentRun"
    BEFORE UPDATE ON __mj."AIAgentRun"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIAgentRun_func"();

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

DO $mj$
DECLARE
  v_NoteStatusConstraint VARCHAR(200);
BEGIN
  -- Agent In-Flight Memory Writes
  --
  -- Lets agents commit durable memories mid-run (the `memoryWrites` loop-response
  -- field). In-flight notes land with the new Status='Provisional' — immediately
  -- injectable into future runs — and are later hardened (Status -> 'Active') or
  -- pruned by the MemoryManagerAgent. See plans/agent-inflight-memory-writes.md.
  --
  -- DDL only: CodeGen regenerates the EntityFieldValue lists + typed unions from
  -- these constraints and the extended properties below.
  -- 1. Widen AIAgentNote."Status" CHECK to include 'Provisional'.
  --    Drop by dynamic lookup since system-generated constraint names vary per database.
  SELECT con.conname INTO v_NoteStatusConstraint FROM pg_constraint con
  JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = any(con.conkey)
  WHERE con.conrelid = '__mj."AIAgentNote"'::regclass
  AND a.attname = 'Status'
  AND con.contype = 'c';
  IF v_NoteStatusConstraint IS NOT NULL THEN
  EXECUTE format('ALTER TABLE __mj."AIAgentNote" DROP CONSTRAINT %I', v_NoteStatusConstraint);
  END IF;
  ALTER TABLE __mj."AIAgentNote"
  ADD CONSTRAINT "CK_AIAgentNote_Status"
  CHECK ("Status" IN ('Active', 'Pending', 'Revoked', 'Archived', 'Provisional'));
END $mj$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f224b93a-955b-4810-a042-20cd259d4ced' OR ("EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'AllowMemoryWrite')
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
        'f224b93a-955b-4810-a042-20cd259d4ced',
        'CDB135CC-6D3C-480B-90AE-25B7805F82C1', -- "Entity": "MJ": "AI" "Agents"
        100148,
        'AllowMemoryWrite',
        'Allow Memory Write',
        'When enabled, the agent may commit durable memories mid-run via the memoryWrites loop-response field. Writes are framework-guarded (type restriction, scope clamp, near-duplicate check, per-run cap) and land as Provisional notes pending Memory Manager hardening. On by default; disable for restricted or experimental agents.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(1)',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e2e404e5-2526-4a62-8267-95df85b51f8c' OR ("EntityID" = 'A24EF5EC-D32C-4A53-85A9-364E322451E6' AND "Name" = 'AuthorType')
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
        'e2e404e5-2526-4a62-8267-95df85b51f8c',
        'A24EF5EC-D32C-4A53-85A9-364E322451E6', -- "Entity": "MJ": "AI" "Agent" "Notes"
        100068,
        'AuthorType',
        'Author Type',
        'Type of author that created the note: Agent = written in-flight during an agent run, MemoryManager = extracted/consolidated by the scheduled Memory Manager, User = manually created by a person.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'MemoryManager',
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

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('10b3046d-1ecc-4804-9350-87fe7f2bcffc', '70B237B2-D508-4C19-8838-850ACC9961F1', 4, 'Provisional', 'Provisional', NOW(), NOW());

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=5 WHERE "ID"='77CEFA16-8DD3-4768-A5B0-CE237ABA1308';

/* SQL text to insert entity field value with ID ed75b82d-7e4d-46c8-8c45-15788ebc06ac */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('ed75b82d-7e4d-46c8-8c45-15788ebc06ac', 'E2E404E5-2526-4A62-8267-95DF85B51F8C', 1, 'Agent', 'Agent', NOW(), NOW());

/* SQL text to insert entity field value with ID 744fb222-cfe0-46e6-801e-629116bacca6 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('744fb222-cfe0-46e6-801e-629116bacca6', 'E2E404E5-2526-4A62-8267-95DF85B51F8C', 2, 'MemoryManager', 'MemoryManager', NOW(), NOW());

/* SQL text to insert entity field value with ID fe475341-e0e3-42b5-a493-86094563a31f */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('fe475341-e0e3-42b5-a493-86094563a31f', 'E2E404E5-2526-4A62-8267-95DF85B51F8C', 3, 'User', 'User', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID E2E404E5-2526-4A62-8267-95DF85B51F8C */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='E2E404E5-2526-4A62-8267-95DF85B51F8C';

/* Index for Foreign Keys for AIAgentExample */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentExample

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '294317F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'E9A8FEEC-7840-EF11-86C3-00224821D189'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = '09248F34-2837-EF11-86D4-6045BDEE16E6'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '24940E6C-FC69-40F1-9EA6-D860F38FC93F'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '55602C1C-FB4A-4678-A847-7889860791D5'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'C400A5F2-1BE3-4441-AEFA-06344A12AAB2'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = FALSE
               WHERE "ID" = 'CB7692F5-554C-48A6-B88B-207DD35A3072'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '2C6E811B-94B8-45F6-93C3-004CAFB054F8'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = '16AB21D1-8047-41B9-8AEA-CD253DED9743'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'A60033A0-D13C-4954-8EF3-6BB8A5618126'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '51A944B0-A282-4ED0-9D4E-1EE41498065A'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'C769307F-0D9E-4ED3-9FE1-9DD39E9D8F8C'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = FALSE
               WHERE "ID" = '68D6F8C2-3A54-4D7A-92DD-F90792348295'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'D720FC44-1C0D-43BB-ACF5-051F4E65FE5B'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'C769307F-0D9E-4ED3-9FE1-9DD39E9D8F8C'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = '3A139346-CC48-479A-A53B-8892664F5DFD'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = FALSE
            WHERE "ID" = '4EDC5656-949F-4FA4-B909-DFC61AD4E1C3'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = FALSE
               WHERE "ID" = '95427194-037B-40BB-8A70-23D84323BC4B'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '8D564214-0633-4D21-93D9-18FF2CE1CDFE'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = 'DE8EE300-B423-4B86-9E92-B06CAF7F0C3E'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "IsNameField" = TRUE
               WHERE "ID" = 'C01717BE-FF5A-4C92-820A-A547324F6F1B'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "IsNameField" = FALSE
               WHERE "ID" = '4AB03803-B3E2-4482-986B-13A5EBB70E76'
               AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'FF6598BB-8BAA-4C44-AAF5-80ACBB4C1C69'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E2E404E5-2526-4A62-8267-95DF85B51F8C'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'C01717BE-FF5A-4C92-820A-A547324F6F1B'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '4EB4FD5F-749F-4A11-B5C4-8F70995DAC3C'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'B5569F04-CBF7-4660-8BA5-CA0D1EAB75CF'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'C43547D2-E1F3-4AE5-9A2B-9C63ADBE2365'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '70B237B2-D508-4C19-8838-850ACC9961F1'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = 'A24EF5EC-D32C-4A53-85A9-364E322451E6'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set categories for 40 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '225421C0-34B7-466F-95C9-74DE8432B137' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."AgentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '54E9381D-F8B7-4AE2-BE4D-B8BA612E2923' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."AgentNoteTypeID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Note Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '324755A2-657E-42A0-A339-620F7379397D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."Note"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4AB03803-B3E2-4482-986B-13A5EBB70E76' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7CF765EF-9212-427B-B7BA-2CA57E27CD22' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4B2B427D-3F97-494F-94D6-AB18FD7E83CA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."UserID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B8B8C7B4-2F27-4555-80F1-FEF0D2F662C3' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."Type"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C01717BE-FF5A-4C92-820A-A547324F6F1B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."IsAutoGenerated"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0A9FC5B8-D931-4741-91FE-1C40ABF4B1AD' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."Comments"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '93CEF268-8B79-4985-9E7F-5F584B7F1D14' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '70B237B2-D508-4C19-8838-850ACC9961F1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."SourceConversationID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A96D7811-B4EF-47B3-B044-C5F1D0658AAB' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."SourceConversationDetailID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8C2C7801-F008-49D7-A663-1A16BE929C5B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."SourceAIAgentRunID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A343B2F0-D157-4574-BADD-0520A2D9C4A9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."CompanyID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4796734A-9D50-4726-A04A-59010C91A3E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."EmbeddingVector"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7309EF51-3A04-4AE1-A7DC-B999BB0044A3' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."EmbeddingModelID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '55BA7B81-7947-4990-928B-083BE2BFC916' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."PrimaryScopeEntityID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1F1E84FE-99C5-4AEB-817E-6B03BB6FD5BC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."PrimaryScopeRecordID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Primary Scope Record ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '702F4025-07E3-458E-9B93-82313A52DBD0' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."SecondaryScopes"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '513178C8-F947-4A4F-9A9C-678648E51368' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."LastAccessedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E122CC35-6540-4A2F-90EE-5A32C7BF1F1E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."AccessCount"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2282BF73-E454-4868-A2D1-DCCDA9D54AB3' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."ExpiresAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EAF1C1AB-4019-4A41-BF59-20B88DA44567' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."ConsolidatedIntoNoteID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Consolidation & History',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Consolidated Into Note',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2D8BE8BB-AD23-44AC-8735-0A3D450439BB' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."ConsolidationCount"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Consolidation & History',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5F8DDF01-E2AD-4C5F-ACE6-FC65AE72FBC6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."DerivedFromNoteIDs"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Consolidation & History',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Derived From Note IDs',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '12D40F7B-87E8-4C4F-910D-E751288D179F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."ProtectionTier"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Consolidation & History',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BCD8589F-8CC6-4D4D-B13C-426FD982F3ED' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."ImportanceScore"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Usage & Lifecycle',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FF6598BB-8BAA-4C44-AAF5-80ACBB4C1C69' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."AuthorType"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Note Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E2E404E5-2526-4A62-8267-95DF85B51F8C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."Agent"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4EB4FD5F-749F-4A11-B5C4-8F70995DAC3C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."AgentNoteType"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Note Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '45946792-C4FA-4D0B-81C9-C1C764E185BC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."User"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B5569F04-CBF7-4660-8BA5-CA0D1EAB75CF' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."SourceConversation"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0FCB492C-5AFA-492B-8E6C-B56A269BD486' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."SourceConversationDetail"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D9422A2E-4C9B-4DAA-AD7C-484C063C240B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."SourceAIAgentRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '65862A21-C4A3-4848-AAB9-BDFD79AD1117' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."Company"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C43547D2-E1F3-4AE5-9A2B-9C63ADBE2365' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."EmbeddingModel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '728A2DC6-ED02-4841-B9D2-B2641A4BF107' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."PrimaryScopeEntity"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '79FAD22E-7080-4283-B3DD-ED140949E39A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."ConsolidatedIntoNote"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Consolidation & History',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CF526B9D-E927-4084-8AA6-C2B2EBB0EB2D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Notes."RootConsolidatedIntoNoteID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Consolidation & History',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '991F078C-B367-4530-88DC-B9C65568B495' AND "AutoUpdateCategory" = TRUE;

/* Update FieldCategoryInfo setting for entity */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Consolidation & History":{"icon":"fa fa-code-branch","description":"Note consolidation tracking, provenance chain, and protection policies"}}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'A24EF5EC-D32C-4A53-85A9-364E322451E6' AND "Name" = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Consolidation & History":"fa fa-code-branch"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'A24EF5EC-D32C-4A53-85A9-364E322451E6' AND "Name" = 'FieldCategoryIcons';

/* Set categories for 80 fields */

-- UPDATE Entity Field Category Info MJ: AI Agents."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AA64DA98-1DA1-4525-8CC5-BC3E3E4893B6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1B312173-DA2A-492C-A8F7-EB92CC0F8BDA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6EDC921F-36C4-4739-9F2A-8F9F00E95AE7' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."LogoURL"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'URL',
   "CodeType" = NULL
WHERE 
   "ID" = '77845738-5781-458B-AD3C-5DAE745373C2' AND "AutoUpdateCategory" = TRUE;

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

-- UPDATE Entity Field Category Info MJ: AI Agents."ParentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A6F8773F-4021-45DD-B142-9BFE4F67EC87' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."Parent"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Parent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '52E74C81-D246-4B52-B7A7-91757C299671' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."RootParentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Root Parent ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '644AA4B2-1044-430C-BCBA-245644294E02' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."ExposeAsAction"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DF61AC7C-79A7-4058-96A1-85EBA9339D45' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."ExecutionOrder"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '090830CE-4073-486C-BBF2-E2105BEADD91' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."ExecutionMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8261D630-2560-4C03-BE14-C8A9682ABBB4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."InvocationMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3AFE3A93-073F-4EF0-A03F-BF1C1BE3C39C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."EnableContextCompression"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '09AFE563-63E3-4F2B-B6F1-5945432FF07B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."ContextCompressionMessageThreshold"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Context Compression Message Threshold',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '451D5C8F-6749-4789-A158-658B38A74AE4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."ContextCompressionPromptID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FFD209C5-48F3-45D1-9094-E76EC832EA07' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."ContextCompressionPrompt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Context Compression Prompt',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AD36EF69-1494-409C-A97E-FE73669DD28A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."ContextCompressionMessageRetentionCount"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Context Compression Message Retention Count',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '73A50D68-976F-49A7-9737-12D1D26C6011' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."TypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '91CA077D-3F59-48E1-A593-AF8686276115' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."Type"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C4F745BD-57E7-4F87-9B65-8BBDD2B50529' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BC44595E-6FCA-42A9-AAF8-4A730088BE46' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."DriverClass"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'BB9AD9CB-40C0-41F1-B54B-750C844FD41B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."IconClass"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E3E05E29-CDAF-4BFE-9FC8-4450EEBE05E5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."ModelSelectionMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FEEBD49D-5572-45D7-9F1E-08AE762F41D9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."PayloadDownstreamPaths"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '85B6AA86-796D-4970-9E35-5A483498B517' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."PayloadUpstreamPaths"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'DA784B76-66CD-434B-90BD-DEC808917E68' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."PayloadSelfReadPaths"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'EBF3B958-F07C-420B-82BE-2CB1E396A0F5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."PayloadSelfWritePaths"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '61E51FC3-8EFA-40D9-9525-F3FAD0A95DCA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."PayloadScope"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2E542986-0164-4B9E-8457-06826A4AB892' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."FinalPayloadValidation"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '1C7959AE-F48B-4858-8383-28C3F4706314' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."FinalPayloadValidationMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Final Payload Validation Mode',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8931DE12-4048-4DEB-A2A3-E821354CFFB2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."FinalPayloadValidationMaxRetries"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Final Payload Validation Max Retries',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AF62DAAB-74D4-4539-9B47-58DD4A023E4B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."StartingPayloadValidation"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'B7A2371C-A22C-48EA-827E-824F8A40DA3D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."StartingPayloadValidationMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Starting Payload Validation Mode',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0947203D-A5CA-4ED2-895B-17A8007323FC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."InjectNotes"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '37E075BD-CC4B-4AE1-8D12-7EC45B663F69' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."MaxNotesToInject"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A8DA4C67-B2F7-4C1D-8522-A2B5B4BADA21' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."NoteInjectionStrategy"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F5F6BE87-06F4-404D-A1C3-B315C562C32B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."InjectExamples"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1C9957C7-A851-4C05-83B3-F49A5FC3FE4D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."MaxExamplesToInject"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DDEE3E91-4B0D-4264-9EF1-ACAAB8D105E5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."ExampleInjectionStrategy"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '291FEE7A-1245-4C82-A470-07EEB8847F1E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."MaxCostPerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '23850C5A-311A-4271-AE53-BD36921C5AA5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."MaxTokensPerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C5F8BB50-DC10-4DFC-AC45-8613C152EE94' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."MaxIterationsPerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3FA6B9F3-60BC-4631-8EB4-7ED0D04844C4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."MaxTimePerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E64A4FF8-BAD5-491C-9D8D-E5E70378ED67' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."MinExecutionsPerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BCCCA2DC-8A15-4701-98E2-337FB60B463A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."MaxExecutionsPerRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F0CCA759-DEA4-4F61-B233-C632EE9317E1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."DefaultPromptEffortLevel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DCBAEEFD-C5A2-449D-A4B9-EAB1290C2F89' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."ChatHandlingOption"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BC671EC0-ED51-4F0B-A46C-50BE0CE53E51' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."MessageMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '445C1618-EADB-4B34-B318-40C662141FE1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."MaxMessages"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F8924303-D53A-43B0-B70F-5B74FA6248D9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."AllowEphemeralClientTools"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '98BE9EE9-A855-488E-9D97-441AEBA2B34D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."AcceptUnregisteredFiles"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1380146E-BF7D-4624-803A-45B1E65F0B52' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."DefaultArtifactTypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F58EA638-CE95-4D2A-9095-9909149B83C7' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."DefaultArtifactType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Default Artifact Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6C1C76DF-BBFF-4903-9BB9-3325B5ABB4B1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."OwnerUserID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '261B4D18-464B-4AD9-9FFD-EA8B70C576D8' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."OwnerUser"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Owner User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B098B41F-7953-473E-8257-DB6BFFEF48A0' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."ArtifactCreationMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4371BED0-7C4A-4D24-9E07-17E15D617607' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."FunctionalRequirements"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'F613597C-C38F-4D71-B64A-8BBCFD87D8CC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."TechnicalDesign"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'CAEA2872-B089-4192-8FA8-1737FF357FFD' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."IsRestricted"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E5B17B79-282F-4F19-9656-246DE119D588' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."AttachmentStorageProviderID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4B5A24CC-1BC2-40E3-B83E-C8E164E6CFED' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."AttachmentStorageProvider"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Attachment Storage Provider',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B6261245-1F52-43BA-9C92-A3E494D8C5BE' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."AttachmentRootPath"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BA112220-B0D8-4C6F-B63A-027EB706B132' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."InlineStorageThresholdBytes"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Inline Storage Threshold Bytes',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EC3D6539-FAF4-49B7-9A9B-6327249C9D06' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."DefaultStorageAccountID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '76AF4818-C79E-4DB5-8039-6B51C1C3A832' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."DefaultStorageAccount"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Default Storage Account',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D900C3B8-F414-4468-AAA1-3CEB52C80ACD' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."AgentTypePromptParams"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'FD515BF1-7E8A-4CB0-A8CE-D5C0C8C132D7' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."ScopeConfig"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Scope Config',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'F644A0DD-0C7D-44E5-A2D5-0DAE4F0455AD' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."NoteRetentionDays"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '38ABFFF6-5E0D-4AF1-B5CC-AB46B2358FB4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."ExampleRetentionDays"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A112A808-63DB-4B48-B38F-06554B912DED' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."AutoArchiveEnabled"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '85774265-68C5-4067-9C2B-F70A7F21B94A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."RerankerConfiguration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '269087F5-DEBE-4B14-8FA3-5938ADCF7325' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."CategoryID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7DCA7B3C-9A81-4D32-AF2E-5EA32B22D988' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."Category"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6517DB09-A12E-4F1B-95B6-0B0A92918A1D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."DefaultCoAgentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '724ADC60-12A5-4C77-8C7D-AC8F110EE069' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."DefaultCoAgent"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Default Co-Agent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AAC9DA92-2BBE-4599-B742-4AE9E01DA10B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."RootDefaultCoAgentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Root Default Co-Agent ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1861E78B-4306-44CA-8E62-70991A1F58CA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."TypeConfiguration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '6F17DFC0-75FA-4F2A-9CF7-DF90B51C1239' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."AllowMemoryWrite"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Context & Memory Management',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F224B93A-955B-4810-A042-20CD259D4CED' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agents."SearchScopeAccess"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '948E9C24-C50E-47BF-8A93-D4ABAA0BBBBB' AND "AutoUpdateCategory" = TRUE;

/* Update FieldCategoryInfo setting for entity */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Context & Memory Management":{"icon":"fa fa-brain","description":"Controls automatic injection of notes, examples, and memory capabilities into agent context"}}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Context & Memory Management":"fa fa-brain"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'CDB135CC-6D3C-480B-90AE-25B7805F82C1' AND "Name" = 'FieldCategoryIcons';


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentExamples" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: Permissions for vwAIAgentExamples
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentExamples" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: spCreateAIAgentExample
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentExample
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentExample" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Agent Examples */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentExample" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: spUpdateAIAgentExample
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentExample
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentExample" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentExample" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: spDeleteAIAgentExample
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentExample
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentExample" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Examples */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentExample" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for AIAgentNote */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentNote;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentNotes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: Permissions for vwAIAgentNotes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentNotes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: spCreateAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentNote" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Agent Notes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentNote" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: spUpdateAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentNote
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentNote" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentNote" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Notes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: spDeleteAIAgentNote
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentNote
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentNote" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Notes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentNote" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for ConversationDetailArtifact */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Artifacts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ConversationDetailID in table ConversationDetailArtifact;

DO $$ BEGIN GRANT SELECT ON __mj."vwConversationDetailArtifacts" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Conversation Detail Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Artifacts
-- Item: Permissions for vwConversationDetailArtifacts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwConversationDetailArtifacts" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Conversation Detail Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Artifacts
-- Item: spCreateConversationDetailArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetailArtifact
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailArtifact" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Conversation Detail Artifacts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailArtifact" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Conversation Detail Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Artifacts
-- Item: spUpdateConversationDetailArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetailArtifact
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailArtifact" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailArtifact" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: vwConversationDetailAttachments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Detail Attachments
-----               SCHEMA:      __mj
-----               BASE TABLE:  ConversationDetailAttachment
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwConversationDetailAttachments" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: Permissions for vwConversationDetailAttachments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwConversationDetailAttachments" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: spCreateConversationDetailAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetailAttachment
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailAttachment" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Conversation Detail Attachments */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailAttachment" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: spUpdateConversationDetailAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetailAttachment
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailAttachment" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailAttachment" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Conversation Detail Ratings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Ratings
-- Item: vwConversationDetailRatings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Conversation Detail Ratings
-----               SCHEMA:      __mj
-----               BASE TABLE:  ConversationDetailRating
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwConversationDetailRatings" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Conversation Detail Ratings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Ratings
-- Item: Permissions for vwConversationDetailRatings
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwConversationDetailRatings" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Conversation Detail Ratings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Ratings
-- Item: spCreateConversationDetailRating
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ConversationDetailRating
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailRating" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Conversation Detail Ratings */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateConversationDetailRating" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Conversation Detail Ratings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Ratings
-- Item: spUpdateConversationDetailRating
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ConversationDetailRating
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailRating" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateConversationDetailRating" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversation Detail Artifacts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Artifacts
-- Item: spDeleteConversationDetailArtifact
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetailArtifact
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailArtifact" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversation Detail Artifacts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailArtifact" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversation Detail Attachments */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Attachments
-- Item: spDeleteConversationDetailAttachment
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetailAttachment
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailAttachment" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversation Detail Attachments */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailAttachment" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Conversation Detail Ratings */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Conversation Detail Ratings
-- Item: spDeleteConversationDetailRating
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ConversationDetailRating
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailRating" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Conversation Detail Ratings */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteConversationDetailRating" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for Report */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Reports
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CategoryID in table Report;

DO $$ BEGIN GRANT SELECT ON __mj."vwReports" TO "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Reports
-- Item: Permissions for vwReports
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwReports" TO "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Reports
-- Item: spCreateReport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Report
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateReport" TO "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Reports */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateReport" TO "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Reports
-- Item: spUpdateReport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Report
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateReport" TO "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateReport" TO "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Reports */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Reports
-- Item: spDeleteReport
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Report
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteReport" TO "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Reports */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteReport" TO "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for Task */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key ParentID in table Task;

DO $$ BEGIN GRANT SELECT ON __mj."vwTasks" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: Permissions for vwTasks
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwTasks" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: spCreateTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Task
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTask" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Tasks */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTask" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: spUpdateTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Task
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTask" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTask" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Tasks */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: spDeleteTask
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Task
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTask" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Tasks */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTask" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for AIAgentRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentRun;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: Permissions for vwAIAgentRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentRuns" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spCreateAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Agent Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRun" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spUpdateAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRun" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: spDeleteAIAgentRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRun" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* spDelete SQL for MJ: AI Configurations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Configurations
-- Item: spDeleteAIConfiguration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIConfiguration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIConfiguration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Configurations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIConfiguration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."AIAgentNote"."Status" IS 'Lifecycle status of the note. Pending = awaiting approval, Active = vetted and injectable, Provisional = written in-flight by an agent (immediately injectable, awaiting Memory Manager hardening to Active), Revoked = superseded/withdrawn, Archived = retired by consolidation or decay.';

COMMENT ON COLUMN __mj."AIAgentNote"."AuthorType" IS 'Type of author that created the note: Agent = written in-flight during an agent run, MemoryManager = extracted/consolidated by the scheduled Memory Manager, User = manually created by a person.';

COMMENT ON COLUMN __mj."AIAgent"."AllowMemoryWrite" IS 'When enabled, the agent may commit durable memories mid-run via the memoryWrites loop-response field. Writes are framework-guarded (type restriction, scope clamp, near-duplicate check, per-run cap) and land as Provisional notes pending Memory Manager hardening. On by default; disable for restricted or experimental agents.';


-- ===================== Other =====================

-- CODE GEN RUN
-- CodeGen output appended below (entity field metadata sync, regenerated views/procs)

/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: AI Agent Examples */

/* spUpdate Permissions for MJ: AI Agent Notes */

/* spUpdate Permissions for MJ: Conversation Detail Artifacts */

/* spUpdate Permissions for MJ: Conversation Detail Attachments */

/* spUpdate Permissions for MJ: Conversation Detail Ratings */

/* spUpdate Permissions for MJ: Reports */

/* spUpdate Permissions for MJ: Tasks */

/* spUpdate Permissions for MJ: AI Agent Runs */

/* spUpdate Permissions for MJ: Conversation Details */

/* spUpdate Permissions for MJ: AI Agents */
