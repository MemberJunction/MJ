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
           WHERE proname = 'fnAIAgentRunStepParentID_GetRootID'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."fnAIAgentRunStepParentID_GetRootID"(
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
            __mj."AIAgentRunStep"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIAgentRunStep" c
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
           WHERE proname = 'fnAIPromptRunParentID_GetRootID'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."fnAIPromptRunParentID_GetRootID"(
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
            __mj."AIPromptRun"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIPromptRun" c
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
           WHERE proname = 'fnAIPromptRunRerunFromPromptRunID_GetRootID'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."fnAIPromptRunRerunFromPromptRunID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "RerunFromPromptRunID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIPromptRun"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."RerunFromPromptRunID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIPromptRun" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."RerunFromPromptRunID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "RerunFromPromptRunID" IS NULL
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
    "MJConversationDetail_SourceConversationDetailID"."Message" AS "SourceConversationDetail",
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
    "MJConversationDetail_SourceConversationDetailID"."Message" AS "SourceConversationDetail",
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
  v_target_name CONSTANT TEXT := 'vwAIAgentRequests';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentRequests"
AS SELECT
    a.*,
    "MJAIAgent_AgentID"."Name" AS "Agent",
    "MJUser_RequestForUserID"."Name" AS "RequestForUser",
    "MJUser_ResponseByUserID"."Name" AS "ResponseByUser",
    "MJAIAgentRequestType_RequestTypeID"."Name" AS "RequestType",
    "MJAIAgentRun_OriginatingAgentRunID"."RunName" AS "OriginatingAgentRun",
    "MJAIAgentRunStep_OriginatingAgentRunStepID"."StepName" AS "OriginatingAgentRunStep",
    "MJAIAgentRun_ResumingAgentRunID"."RunName" AS "ResumingAgentRun"
FROM
    __mj."AIAgentRequest" AS a
INNER JOIN
    __mj."AIAgent" AS "MJAIAgent_AgentID"
  ON
    a."AgentID" = "MJAIAgent_AgentID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_RequestForUserID"
  ON
    a."RequestForUserID" = "MJUser_RequestForUserID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_ResponseByUserID"
  ON
    a."ResponseByUserID" = "MJUser_ResponseByUserID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentRequestType" AS "MJAIAgentRequestType_RequestTypeID"
  ON
    a."RequestTypeID" = "MJAIAgentRequestType_RequestTypeID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS "MJAIAgentRun_OriginatingAgentRunID"
  ON
    a."OriginatingAgentRunID" = "MJAIAgentRun_OriginatingAgentRunID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentRunStep" AS "MJAIAgentRunStep_OriginatingAgentRunStepID"
  ON
    a."OriginatingAgentRunStepID" = "MJAIAgentRunStep_OriginatingAgentRunStepID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS "MJAIAgentRun_ResumingAgentRunID"
  ON
    a."ResumingAgentRunID" = "MJAIAgentRun_ResumingAgentRunID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwAIAgentRunMedias';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentRunMedias"
AS SELECT
    a.*,
    "MJAIAgentRun_AgentRunID"."RunName" AS "AgentRun",
    "MJAIPromptRunMedia_SourcePromptRunMediaID"."FileName" AS "SourcePromptRunMedia",
    "MJAIModality_ModalityID"."Name" AS "Modality",
    "MJFile_FileID"."Name" AS "File"
FROM
    __mj."AIAgentRunMedia" AS a
INNER JOIN
    __mj."AIAgentRun" AS "MJAIAgentRun_AgentRunID"
  ON
    a."AgentRunID" = "MJAIAgentRun_AgentRunID"."ID"
LEFT OUTER JOIN
    __mj."AIPromptRunMedia" AS "MJAIPromptRunMedia_SourcePromptRunMediaID"
  ON
    a."SourcePromptRunMediaID" = "MJAIPromptRunMedia_SourcePromptRunMediaID"."ID"
INNER JOIN
    __mj."AIModality" AS "MJAIModality_ModalityID"
  ON
    a."ModalityID" = "MJAIModality_ModalityID"."ID"
LEFT OUTER JOIN
    __mj."File" AS "MJFile_FileID"
  ON
    a."FileID" = "MJFile_FileID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwAIAgentRunSteps';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIAgentRunSteps"
AS SELECT
    a.*,
    "MJAIAgentRun_AgentRunID"."RunName" AS "AgentRun",
    "MJAIAgentRunStep_ParentID"."StepName" AS "Parent",
    "root_ParentID"."RootID" AS "RootParentID"
FROM
    __mj."AIAgentRunStep" AS a
INNER JOIN
    __mj."AIAgentRun" AS "MJAIAgentRun_AgentRunID"
  ON
    a."AgentRunID" = "MJAIAgentRun_AgentRunID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentRunStep" AS "MJAIAgentRunStep_ParentID"
  ON
    a."ParentID" = "MJAIAgentRunStep_ParentID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnAIAgentRunStepParentID_GetRootID"(a."ID", a."ParentID")) AS "root_ParentID"
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
    "MJConversationDetail_ConversationDetailID"."Message" AS "ConversationDetail",
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
  v_target_name CONSTANT TEXT := 'vwAIPromptRuns';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIPromptRuns"
AS SELECT
    a.*,
    "MJAIPrompt_PromptID"."Name" AS "Prompt",
    "MJAIModel_ModelID"."Name" AS "Model",
    "MJAIVendor_VendorID"."Name" AS "Vendor",
    "MJAIAgent_AgentID"."Name" AS "Agent",
    "MJAIConfiguration_ConfigurationID"."Name" AS "Configuration",
    "MJAIPromptRun_ParentID"."RunName" AS "Parent",
    "MJAIAgentRun_AgentRunID"."RunName" AS "AgentRun",
    "MJAIModel_OriginalModelID"."Name" AS "OriginalModel",
    "MJAIPromptRun_RerunFromPromptRunID"."RunName" AS "RerunFromPromptRun",
    "MJAIPrompt_JudgeID"."Name" AS "Judge",
    "MJAIPrompt_ChildPromptID"."Name" AS "ChildPrompt",
    "MJTestRun_TestRunID"."Test" AS "TestRun",
    "root_ParentID"."RootID" AS "RootParentID",
    "root_RerunFromPromptRunID"."RootID" AS "RootRerunFromPromptRunID"
FROM
    __mj."AIPromptRun" AS a
INNER JOIN
    __mj."AIPrompt" AS "MJAIPrompt_PromptID"
  ON
    a."PromptID" = "MJAIPrompt_PromptID"."ID"
INNER JOIN
    __mj."AIModel" AS "MJAIModel_ModelID"
  ON
    a."ModelID" = "MJAIModel_ModelID"."ID"
INNER JOIN
    __mj."AIVendor" AS "MJAIVendor_VendorID"
  ON
    a."VendorID" = "MJAIVendor_VendorID"."ID"
LEFT OUTER JOIN
    __mj."AIAgent" AS "MJAIAgent_AgentID"
  ON
    a."AgentID" = "MJAIAgent_AgentID"."ID"
LEFT OUTER JOIN
    __mj."AIConfiguration" AS "MJAIConfiguration_ConfigurationID"
  ON
    a."ConfigurationID" = "MJAIConfiguration_ConfigurationID"."ID"
LEFT OUTER JOIN
    __mj."AIPromptRun" AS "MJAIPromptRun_ParentID"
  ON
    a."ParentID" = "MJAIPromptRun_ParentID"."ID"
LEFT OUTER JOIN
    __mj."AIAgentRun" AS "MJAIAgentRun_AgentRunID"
  ON
    a."AgentRunID" = "MJAIAgentRun_AgentRunID"."ID"
LEFT OUTER JOIN
    __mj."AIModel" AS "MJAIModel_OriginalModelID"
  ON
    a."OriginalModelID" = "MJAIModel_OriginalModelID"."ID"
LEFT OUTER JOIN
    __mj."AIPromptRun" AS "MJAIPromptRun_RerunFromPromptRunID"
  ON
    a."RerunFromPromptRunID" = "MJAIPromptRun_RerunFromPromptRunID"."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS "MJAIPrompt_JudgeID"
  ON
    a."JudgeID" = "MJAIPrompt_JudgeID"."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS "MJAIPrompt_ChildPromptID"
  ON
    a."ChildPromptID" = "MJAIPrompt_ChildPromptID"."ID"
LEFT OUTER JOIN
    __mj."vwTestRuns" AS "MJTestRun_TestRunID"
  ON
    a."TestRunID" = "MJTestRun_TestRunID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnAIPromptRunParentID_GetRootID"(a."ID", a."ParentID")) AS "root_ParentID"
    ON TRUE
LEFT JOIN LATERAL (SELECT * FROM __mj."fnAIPromptRunRerunFromPromptRunID_GetRootID"(a."ID", a."RerunFromPromptRunID")) AS "root_RerunFromPromptRunID"
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
    IN p_ImportanceScore NUMERIC(5,2) DEFAULT NULL
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
                "ImportanceScore"
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
                CASE WHEN p_ImportanceScore_Clear = TRUE THEN NULL ELSE COALESCE(p_ImportanceScore, NULL) END
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
                "ImportanceScore"
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
                CASE WHEN p_ImportanceScore_Clear = TRUE THEN NULL ELSE COALESCE(p_ImportanceScore, NULL) END
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
    IN p_ImportanceScore NUMERIC(5,2) DEFAULT NULL
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
        "ImportanceScore" = CASE WHEN p_ImportanceScore_Clear = TRUE THEN NULL ELSE COALESCE(p_ImportanceScore, "ImportanceScore") END
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
           WHERE proname = 'spCreateAIAgentRequest'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRequest"(
    IN p_ID UUID DEFAULT NULL,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_RequestedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_RequestForUserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RequestForUserID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_Request TEXT DEFAULT NULL,
    IN p_Response_Clear BOOLEAN DEFAULT FALSE,
    IN p_Response TEXT DEFAULT NULL,
    IN p_ResponseByUserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResponseByUserID UUID DEFAULT NULL,
    IN p_RespondedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_RespondedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_RequestTypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RequestTypeID UUID DEFAULT NULL,
    IN p_ResponseSchema_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResponseSchema TEXT DEFAULT NULL,
    IN p_ResponseData_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResponseData TEXT DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_ExpiresAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExpiresAt TIMESTAMPTZ DEFAULT NULL,
    IN p_OriginatingAgentRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OriginatingAgentRunID UUID DEFAULT NULL,
    IN p_OriginatingAgentRunStepID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OriginatingAgentRunStepID UUID DEFAULT NULL,
    IN p_ResumingAgentRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResumingAgentRunID UUID DEFAULT NULL,
    IN p_ResponseSource_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResponseSource VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentRequests" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIAgentRequest"
            (
                "ID",
                "AgentID",
                "RequestedAt",
                "RequestForUserID",
                "Status",
                "Request",
                "Response",
                "ResponseByUserID",
                "RespondedAt",
                "Comments",
                "RequestTypeID",
                "ResponseSchema",
                "ResponseData",
                "Priority",
                "ExpiresAt",
                "OriginatingAgentRunID",
                "OriginatingAgentRunStepID",
                "ResumingAgentRunID",
                "ResponseSource"
            )
        VALUES
            (
                p_ID,
                p_AgentID,
                p_RequestedAt,
                CASE WHEN p_RequestForUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_RequestForUserID, NULL) END,
                p_Status,
                p_Request,
                CASE WHEN p_Response_Clear = TRUE THEN NULL ELSE COALESCE(p_Response, NULL) END,
                CASE WHEN p_ResponseByUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseByUserID, NULL) END,
                CASE WHEN p_RespondedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_RespondedAt, NULL) END,
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END,
                CASE WHEN p_RequestTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_RequestTypeID, NULL) END,
                CASE WHEN p_ResponseSchema_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseSchema, NULL) END,
                CASE WHEN p_ResponseData_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseData, NULL) END,
                COALESCE(p_Priority, 50),
                CASE WHEN p_ExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpiresAt, NULL) END,
                CASE WHEN p_OriginatingAgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_OriginatingAgentRunID, NULL) END,
                CASE WHEN p_OriginatingAgentRunStepID_Clear = TRUE THEN NULL ELSE COALESCE(p_OriginatingAgentRunStepID, NULL) END,
                CASE WHEN p_ResumingAgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_ResumingAgentRunID, NULL) END,
                CASE WHEN p_ResponseSource_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseSource, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIAgentRequest"
            (
                "AgentID",
                "RequestedAt",
                "RequestForUserID",
                "Status",
                "Request",
                "Response",
                "ResponseByUserID",
                "RespondedAt",
                "Comments",
                "RequestTypeID",
                "ResponseSchema",
                "ResponseData",
                "Priority",
                "ExpiresAt",
                "OriginatingAgentRunID",
                "OriginatingAgentRunStepID",
                "ResumingAgentRunID",
                "ResponseSource"
            )
        VALUES
            (
                p_AgentID,
                p_RequestedAt,
                CASE WHEN p_RequestForUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_RequestForUserID, NULL) END,
                p_Status,
                p_Request,
                CASE WHEN p_Response_Clear = TRUE THEN NULL ELSE COALESCE(p_Response, NULL) END,
                CASE WHEN p_ResponseByUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseByUserID, NULL) END,
                CASE WHEN p_RespondedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_RespondedAt, NULL) END,
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END,
                CASE WHEN p_RequestTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_RequestTypeID, NULL) END,
                CASE WHEN p_ResponseSchema_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseSchema, NULL) END,
                CASE WHEN p_ResponseData_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseData, NULL) END,
                COALESCE(p_Priority, 50),
                CASE WHEN p_ExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpiresAt, NULL) END,
                CASE WHEN p_OriginatingAgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_OriginatingAgentRunID, NULL) END,
                CASE WHEN p_OriginatingAgentRunStepID_Clear = TRUE THEN NULL ELSE COALESCE(p_OriginatingAgentRunStepID, NULL) END,
                CASE WHEN p_ResumingAgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_ResumingAgentRunID, NULL) END,
                CASE WHEN p_ResponseSource_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseSource, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRequests" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIAgentRequest'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRequest"(
    IN p_ID UUID,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_RequestedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_RequestForUserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RequestForUserID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_Request TEXT DEFAULT NULL,
    IN p_Response_Clear BOOLEAN DEFAULT FALSE,
    IN p_Response TEXT DEFAULT NULL,
    IN p_ResponseByUserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResponseByUserID UUID DEFAULT NULL,
    IN p_RespondedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_RespondedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_RequestTypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RequestTypeID UUID DEFAULT NULL,
    IN p_ResponseSchema_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResponseSchema TEXT DEFAULT NULL,
    IN p_ResponseData_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResponseData TEXT DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_ExpiresAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExpiresAt TIMESTAMPTZ DEFAULT NULL,
    IN p_OriginatingAgentRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OriginatingAgentRunID UUID DEFAULT NULL,
    IN p_OriginatingAgentRunStepID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OriginatingAgentRunStepID UUID DEFAULT NULL,
    IN p_ResumingAgentRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResumingAgentRunID UUID DEFAULT NULL,
    IN p_ResponseSource_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResponseSource VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentRequests" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIAgentRequest"
    SET
        "AgentID" = COALESCE(p_AgentID, "AgentID"),
        "RequestedAt" = COALESCE(p_RequestedAt, "RequestedAt"),
        "RequestForUserID" = CASE WHEN p_RequestForUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_RequestForUserID, "RequestForUserID") END,
        "Status" = COALESCE(p_Status, "Status"),
        "Request" = COALESCE(p_Request, "Request"),
        "Response" = CASE WHEN p_Response_Clear = TRUE THEN NULL ELSE COALESCE(p_Response, "Response") END,
        "ResponseByUserID" = CASE WHEN p_ResponseByUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseByUserID, "ResponseByUserID") END,
        "RespondedAt" = CASE WHEN p_RespondedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_RespondedAt, "RespondedAt") END,
        "Comments" = CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, "Comments") END,
        "RequestTypeID" = CASE WHEN p_RequestTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_RequestTypeID, "RequestTypeID") END,
        "ResponseSchema" = CASE WHEN p_ResponseSchema_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseSchema, "ResponseSchema") END,
        "ResponseData" = CASE WHEN p_ResponseData_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseData, "ResponseData") END,
        "Priority" = COALESCE(p_Priority, "Priority"),
        "ExpiresAt" = CASE WHEN p_ExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpiresAt, "ExpiresAt") END,
        "OriginatingAgentRunID" = CASE WHEN p_OriginatingAgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_OriginatingAgentRunID, "OriginatingAgentRunID") END,
        "OriginatingAgentRunStepID" = CASE WHEN p_OriginatingAgentRunStepID_Clear = TRUE THEN NULL ELSE COALESCE(p_OriginatingAgentRunStepID, "OriginatingAgentRunStepID") END,
        "ResumingAgentRunID" = CASE WHEN p_ResumingAgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_ResumingAgentRunID, "ResumingAgentRunID") END,
        "ResponseSource" = CASE WHEN p_ResponseSource_Clear = TRUE THEN NULL ELSE COALESCE(p_ResponseSource, "ResponseSource") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIAgentRequests" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIAgentRequests" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentRequest'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRequest"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentRequest"
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
           WHERE proname = 'spCreateAIAgentRunMedia'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRunMedia"(
    IN p_ID UUID DEFAULT NULL,
    IN p_AgentRunID UUID DEFAULT NULL,
    IN p_SourcePromptRunMediaID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourcePromptRunMediaID UUID DEFAULT NULL,
    IN p_ModalityID UUID DEFAULT NULL,
    IN p_MimeType VARCHAR(100) DEFAULT NULL,
    IN p_FileName_Clear BOOLEAN DEFAULT FALSE,
    IN p_FileName VARCHAR(255) DEFAULT NULL,
    IN p_FileSizeBytes_Clear BOOLEAN DEFAULT FALSE,
    IN p_FileSizeBytes INTEGER DEFAULT NULL,
    IN p_Width_Clear BOOLEAN DEFAULT FALSE,
    IN p_Width INTEGER DEFAULT NULL,
    IN p_Height_Clear BOOLEAN DEFAULT FALSE,
    IN p_Height INTEGER DEFAULT NULL,
    IN p_DurationSeconds_Clear BOOLEAN DEFAULT FALSE,
    IN p_DurationSeconds NUMERIC(10,2) DEFAULT NULL,
    IN p_InlineData_Clear BOOLEAN DEFAULT FALSE,
    IN p_InlineData TEXT DEFAULT NULL,
    IN p_FileID_Clear BOOLEAN DEFAULT FALSE,
    IN p_FileID UUID DEFAULT NULL,
    IN p_ThumbnailBase64_Clear BOOLEAN DEFAULT FALSE,
    IN p_ThumbnailBase64 TEXT DEFAULT NULL,
    IN p_Label_Clear BOOLEAN DEFAULT FALSE,
    IN p_Label VARCHAR(255) DEFAULT NULL,
    IN p_Metadata_Clear BOOLEAN DEFAULT FALSE,
    IN p_Metadata TEXT DEFAULT NULL,
    IN p_DisplayOrder INTEGER DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentRunMedias" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIAgentRunMedia"
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
                p_ID,
                p_AgentRunID,
                CASE WHEN p_SourcePromptRunMediaID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourcePromptRunMediaID, NULL) END,
                p_ModalityID,
                p_MimeType,
                CASE WHEN p_FileName_Clear = TRUE THEN NULL ELSE COALESCE(p_FileName, NULL) END,
                CASE WHEN p_FileSizeBytes_Clear = TRUE THEN NULL ELSE COALESCE(p_FileSizeBytes, NULL) END,
                CASE WHEN p_Width_Clear = TRUE THEN NULL ELSE COALESCE(p_Width, NULL) END,
                CASE WHEN p_Height_Clear = TRUE THEN NULL ELSE COALESCE(p_Height, NULL) END,
                CASE WHEN p_DurationSeconds_Clear = TRUE THEN NULL ELSE COALESCE(p_DurationSeconds, NULL) END,
                CASE WHEN p_InlineData_Clear = TRUE THEN NULL ELSE COALESCE(p_InlineData, NULL) END,
                CASE WHEN p_FileID_Clear = TRUE THEN NULL ELSE COALESCE(p_FileID, NULL) END,
                CASE WHEN p_ThumbnailBase64_Clear = TRUE THEN NULL ELSE COALESCE(p_ThumbnailBase64, NULL) END,
                CASE WHEN p_Label_Clear = TRUE THEN NULL ELSE COALESCE(p_Label, NULL) END,
                CASE WHEN p_Metadata_Clear = TRUE THEN NULL ELSE COALESCE(p_Metadata, NULL) END,
                COALESCE(p_DisplayOrder, 0),
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIAgentRunMedia"
            (
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
                p_AgentRunID,
                CASE WHEN p_SourcePromptRunMediaID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourcePromptRunMediaID, NULL) END,
                p_ModalityID,
                p_MimeType,
                CASE WHEN p_FileName_Clear = TRUE THEN NULL ELSE COALESCE(p_FileName, NULL) END,
                CASE WHEN p_FileSizeBytes_Clear = TRUE THEN NULL ELSE COALESCE(p_FileSizeBytes, NULL) END,
                CASE WHEN p_Width_Clear = TRUE THEN NULL ELSE COALESCE(p_Width, NULL) END,
                CASE WHEN p_Height_Clear = TRUE THEN NULL ELSE COALESCE(p_Height, NULL) END,
                CASE WHEN p_DurationSeconds_Clear = TRUE THEN NULL ELSE COALESCE(p_DurationSeconds, NULL) END,
                CASE WHEN p_InlineData_Clear = TRUE THEN NULL ELSE COALESCE(p_InlineData, NULL) END,
                CASE WHEN p_FileID_Clear = TRUE THEN NULL ELSE COALESCE(p_FileID, NULL) END,
                CASE WHEN p_ThumbnailBase64_Clear = TRUE THEN NULL ELSE COALESCE(p_ThumbnailBase64, NULL) END,
                CASE WHEN p_Label_Clear = TRUE THEN NULL ELSE COALESCE(p_Label, NULL) END,
                CASE WHEN p_Metadata_Clear = TRUE THEN NULL ELSE COALESCE(p_Metadata, NULL) END,
                COALESCE(p_DisplayOrder, 0),
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRunMedias" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIAgentRunMedia'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRunMedia"(
    IN p_ID UUID,
    IN p_AgentRunID UUID DEFAULT NULL,
    IN p_SourcePromptRunMediaID_Clear BOOLEAN DEFAULT FALSE,
    IN p_SourcePromptRunMediaID UUID DEFAULT NULL,
    IN p_ModalityID UUID DEFAULT NULL,
    IN p_MimeType VARCHAR(100) DEFAULT NULL,
    IN p_FileName_Clear BOOLEAN DEFAULT FALSE,
    IN p_FileName VARCHAR(255) DEFAULT NULL,
    IN p_FileSizeBytes_Clear BOOLEAN DEFAULT FALSE,
    IN p_FileSizeBytes INTEGER DEFAULT NULL,
    IN p_Width_Clear BOOLEAN DEFAULT FALSE,
    IN p_Width INTEGER DEFAULT NULL,
    IN p_Height_Clear BOOLEAN DEFAULT FALSE,
    IN p_Height INTEGER DEFAULT NULL,
    IN p_DurationSeconds_Clear BOOLEAN DEFAULT FALSE,
    IN p_DurationSeconds NUMERIC(10,2) DEFAULT NULL,
    IN p_InlineData_Clear BOOLEAN DEFAULT FALSE,
    IN p_InlineData TEXT DEFAULT NULL,
    IN p_FileID_Clear BOOLEAN DEFAULT FALSE,
    IN p_FileID UUID DEFAULT NULL,
    IN p_ThumbnailBase64_Clear BOOLEAN DEFAULT FALSE,
    IN p_ThumbnailBase64 TEXT DEFAULT NULL,
    IN p_Label_Clear BOOLEAN DEFAULT FALSE,
    IN p_Label VARCHAR(255) DEFAULT NULL,
    IN p_Metadata_Clear BOOLEAN DEFAULT FALSE,
    IN p_Metadata TEXT DEFAULT NULL,
    IN p_DisplayOrder INTEGER DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentRunMedias" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIAgentRunMedia"
    SET
        "AgentRunID" = COALESCE(p_AgentRunID, "AgentRunID"),
        "SourcePromptRunMediaID" = CASE WHEN p_SourcePromptRunMediaID_Clear = TRUE THEN NULL ELSE COALESCE(p_SourcePromptRunMediaID, "SourcePromptRunMediaID") END,
        "ModalityID" = COALESCE(p_ModalityID, "ModalityID"),
        "MimeType" = COALESCE(p_MimeType, "MimeType"),
        "FileName" = CASE WHEN p_FileName_Clear = TRUE THEN NULL ELSE COALESCE(p_FileName, "FileName") END,
        "FileSizeBytes" = CASE WHEN p_FileSizeBytes_Clear = TRUE THEN NULL ELSE COALESCE(p_FileSizeBytes, "FileSizeBytes") END,
        "Width" = CASE WHEN p_Width_Clear = TRUE THEN NULL ELSE COALESCE(p_Width, "Width") END,
        "Height" = CASE WHEN p_Height_Clear = TRUE THEN NULL ELSE COALESCE(p_Height, "Height") END,
        "DurationSeconds" = CASE WHEN p_DurationSeconds_Clear = TRUE THEN NULL ELSE COALESCE(p_DurationSeconds, "DurationSeconds") END,
        "InlineData" = CASE WHEN p_InlineData_Clear = TRUE THEN NULL ELSE COALESCE(p_InlineData, "InlineData") END,
        "FileID" = CASE WHEN p_FileID_Clear = TRUE THEN NULL ELSE COALESCE(p_FileID, "FileID") END,
        "ThumbnailBase64" = CASE WHEN p_ThumbnailBase64_Clear = TRUE THEN NULL ELSE COALESCE(p_ThumbnailBase64, "ThumbnailBase64") END,
        "Label" = CASE WHEN p_Label_Clear = TRUE THEN NULL ELSE COALESCE(p_Label, "Label") END,
        "Metadata" = CASE WHEN p_Metadata_Clear = TRUE THEN NULL ELSE COALESCE(p_Metadata, "Metadata") END,
        "DisplayOrder" = COALESCE(p_DisplayOrder, "DisplayOrder"),
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIAgentRunMedias" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIAgentRunMedias" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentRunMedia'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRunMedia"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIAgentRunMedia"
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
           WHERE proname = 'spCreateAIAgentRunStep'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRunStep"(
    IN p_ID UUID DEFAULT NULL,
    IN p_AgentRunID UUID DEFAULT NULL,
    IN p_StepNumber INTEGER DEFAULT NULL,
    IN p_StepType VARCHAR(50) DEFAULT NULL,
    IN p_StepName VARCHAR(255) DEFAULT NULL,
    IN p_TargetID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TargetID UUID DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CompletedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompletedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Success_Clear BOOLEAN DEFAULT FALSE,
    IN p_Success BOOLEAN DEFAULT NULL,
    IN p_ErrorMessage_Clear BOOLEAN DEFAULT FALSE,
    IN p_ErrorMessage TEXT DEFAULT NULL,
    IN p_InputData_Clear BOOLEAN DEFAULT FALSE,
    IN p_InputData TEXT DEFAULT NULL,
    IN p_OutputData_Clear BOOLEAN DEFAULT FALSE,
    IN p_OutputData TEXT DEFAULT NULL,
    IN p_TargetLogID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TargetLogID UUID DEFAULT NULL,
    IN p_PayloadAtStart_Clear BOOLEAN DEFAULT FALSE,
    IN p_PayloadAtStart TEXT DEFAULT NULL,
    IN p_PayloadAtEnd_Clear BOOLEAN DEFAULT FALSE,
    IN p_PayloadAtEnd TEXT DEFAULT NULL,
    IN p_FinalPayloadValidationResult_Clear BOOLEAN DEFAULT FALSE,
    IN p_FinalPayloadValidationResult VARCHAR(25) DEFAULT NULL,
    IN p_FinalPayloadValidationMessages_Clear BOOLEAN DEFAULT FALSE,
    IN p_FinalPayloadValidationMessages TEXT DEFAULT NULL,
    IN p_ParentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentRunSteps" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIAgentRunStep"
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
                "Comments"
            )
        VALUES
            (
                p_ID,
                p_AgentRunID,
                p_StepNumber,
                COALESCE(p_StepType, 'Prompt'),
                p_StepName,
                CASE WHEN p_TargetID_Clear = TRUE THEN NULL ELSE COALESCE(p_TargetID, NULL) END,
                COALESCE(p_Status, 'Running'),
                COALESCE(p_StartedAt, NOW()),
                CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, NULL) END,
                CASE WHEN p_Success_Clear = TRUE THEN NULL ELSE COALESCE(p_Success, NULL) END,
                CASE WHEN p_ErrorMessage_Clear = TRUE THEN NULL ELSE COALESCE(p_ErrorMessage, NULL) END,
                CASE WHEN p_InputData_Clear = TRUE THEN NULL ELSE COALESCE(p_InputData, NULL) END,
                CASE WHEN p_OutputData_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputData, NULL) END,
                CASE WHEN p_TargetLogID_Clear = TRUE THEN NULL ELSE COALESCE(p_TargetLogID, NULL) END,
                CASE WHEN p_PayloadAtStart_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadAtStart, NULL) END,
                CASE WHEN p_PayloadAtEnd_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadAtEnd, NULL) END,
                CASE WHEN p_FinalPayloadValidationResult_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalPayloadValidationResult, NULL) END,
                CASE WHEN p_FinalPayloadValidationMessages_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalPayloadValidationMessages, NULL) END,
                CASE WHEN p_ParentID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentID, NULL) END,
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIAgentRunStep"
            (
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
                "Comments"
            )
        VALUES
            (
                p_AgentRunID,
                p_StepNumber,
                COALESCE(p_StepType, 'Prompt'),
                p_StepName,
                CASE WHEN p_TargetID_Clear = TRUE THEN NULL ELSE COALESCE(p_TargetID, NULL) END,
                COALESCE(p_Status, 'Running'),
                COALESCE(p_StartedAt, NOW()),
                CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, NULL) END,
                CASE WHEN p_Success_Clear = TRUE THEN NULL ELSE COALESCE(p_Success, NULL) END,
                CASE WHEN p_ErrorMessage_Clear = TRUE THEN NULL ELSE COALESCE(p_ErrorMessage, NULL) END,
                CASE WHEN p_InputData_Clear = TRUE THEN NULL ELSE COALESCE(p_InputData, NULL) END,
                CASE WHEN p_OutputData_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputData, NULL) END,
                CASE WHEN p_TargetLogID_Clear = TRUE THEN NULL ELSE COALESCE(p_TargetLogID, NULL) END,
                CASE WHEN p_PayloadAtStart_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadAtStart, NULL) END,
                CASE WHEN p_PayloadAtEnd_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadAtEnd, NULL) END,
                CASE WHEN p_FinalPayloadValidationResult_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalPayloadValidationResult, NULL) END,
                CASE WHEN p_FinalPayloadValidationMessages_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalPayloadValidationMessages, NULL) END,
                CASE WHEN p_ParentID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentID, NULL) END,
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRunSteps" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIAgentRunStep'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRunStep"(
    IN p_ID UUID,
    IN p_AgentRunID UUID DEFAULT NULL,
    IN p_StepNumber INTEGER DEFAULT NULL,
    IN p_StepType VARCHAR(50) DEFAULT NULL,
    IN p_StepName VARCHAR(255) DEFAULT NULL,
    IN p_TargetID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TargetID UUID DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CompletedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompletedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Success_Clear BOOLEAN DEFAULT FALSE,
    IN p_Success BOOLEAN DEFAULT NULL,
    IN p_ErrorMessage_Clear BOOLEAN DEFAULT FALSE,
    IN p_ErrorMessage TEXT DEFAULT NULL,
    IN p_InputData_Clear BOOLEAN DEFAULT FALSE,
    IN p_InputData TEXT DEFAULT NULL,
    IN p_OutputData_Clear BOOLEAN DEFAULT FALSE,
    IN p_OutputData TEXT DEFAULT NULL,
    IN p_TargetLogID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TargetLogID UUID DEFAULT NULL,
    IN p_PayloadAtStart_Clear BOOLEAN DEFAULT FALSE,
    IN p_PayloadAtStart TEXT DEFAULT NULL,
    IN p_PayloadAtEnd_Clear BOOLEAN DEFAULT FALSE,
    IN p_PayloadAtEnd TEXT DEFAULT NULL,
    IN p_FinalPayloadValidationResult_Clear BOOLEAN DEFAULT FALSE,
    IN p_FinalPayloadValidationResult VARCHAR(25) DEFAULT NULL,
    IN p_FinalPayloadValidationMessages_Clear BOOLEAN DEFAULT FALSE,
    IN p_FinalPayloadValidationMessages TEXT DEFAULT NULL,
    IN p_ParentID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentRunSteps" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIAgentRunStep"
    SET
        "AgentRunID" = COALESCE(p_AgentRunID, "AgentRunID"),
        "StepNumber" = COALESCE(p_StepNumber, "StepNumber"),
        "StepType" = COALESCE(p_StepType, "StepType"),
        "StepName" = COALESCE(p_StepName, "StepName"),
        "TargetID" = CASE WHEN p_TargetID_Clear = TRUE THEN NULL ELSE COALESCE(p_TargetID, "TargetID") END,
        "Status" = COALESCE(p_Status, "Status"),
        "StartedAt" = COALESCE(p_StartedAt, "StartedAt"),
        "CompletedAt" = CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, "CompletedAt") END,
        "Success" = CASE WHEN p_Success_Clear = TRUE THEN NULL ELSE COALESCE(p_Success, "Success") END,
        "ErrorMessage" = CASE WHEN p_ErrorMessage_Clear = TRUE THEN NULL ELSE COALESCE(p_ErrorMessage, "ErrorMessage") END,
        "InputData" = CASE WHEN p_InputData_Clear = TRUE THEN NULL ELSE COALESCE(p_InputData, "InputData") END,
        "OutputData" = CASE WHEN p_OutputData_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputData, "OutputData") END,
        "TargetLogID" = CASE WHEN p_TargetLogID_Clear = TRUE THEN NULL ELSE COALESCE(p_TargetLogID, "TargetLogID") END,
        "PayloadAtStart" = CASE WHEN p_PayloadAtStart_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadAtStart, "PayloadAtStart") END,
        "PayloadAtEnd" = CASE WHEN p_PayloadAtEnd_Clear = TRUE THEN NULL ELSE COALESCE(p_PayloadAtEnd, "PayloadAtEnd") END,
        "FinalPayloadValidationResult" = CASE WHEN p_FinalPayloadValidationResult_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalPayloadValidationResult, "FinalPayloadValidationResult") END,
        "FinalPayloadValidationMessages" = CASE WHEN p_FinalPayloadValidationMessages_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalPayloadValidationMessages, "FinalPayloadValidationMessages") END,
        "ParentID" = CASE WHEN p_ParentID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentID, "ParentID") END,
        "Comments" = CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, "Comments") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIAgentRunSteps" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIAgentRunSteps" WHERE "ID" = p_ID;
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
CREATE OR REPLACE FUNCTION __mj."spCreateAIAgentRun"(
    IN p_ID UUID DEFAULT NULL,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_ParentRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ParentRunID UUID DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CompletedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompletedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Success_Clear BOOLEAN DEFAULT FALSE,
    IN p_Success BOOLEAN DEFAULT NULL,
    IN p_ErrorMessage_Clear BOOLEAN DEFAULT FALSE,
    IN p_ErrorMessage TEXT DEFAULT NULL,
    IN p_ConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationID UUID DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Result_Clear BOOLEAN DEFAULT FALSE,
    IN p_Result TEXT DEFAULT NULL,
    IN p_AgentState_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentState TEXT DEFAULT NULL,
    IN p_TotalTokensUsed_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalCost_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCost NUMERIC(18,6) DEFAULT NULL,
    IN p_TotalPromptTokensUsed_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalPromptTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalCompletionTokensUsed_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCompletionTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalTokensUsedRollup_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalTokensUsedRollup INTEGER DEFAULT NULL,
    IN p_TotalPromptTokensUsedRollup_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalPromptTokensUsedRollup INTEGER DEFAULT NULL,
    IN p_TotalCompletionTokensUsedRollup_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCompletionTokensUsedRollup INTEGER DEFAULT NULL,
    IN p_TotalCostRollup_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCostRollup NUMERIC(19,8) DEFAULT NULL,
    IN p_ConversationDetailID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_ConversationDetailSequence_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationDetailSequence INTEGER DEFAULT NULL,
    IN p_CancellationReason_Clear BOOLEAN DEFAULT FALSE,
    IN p_CancellationReason VARCHAR(30) DEFAULT NULL,
    IN p_FinalStep_Clear BOOLEAN DEFAULT FALSE,
    IN p_FinalStep VARCHAR(30) DEFAULT NULL,
    IN p_FinalPayload_Clear BOOLEAN DEFAULT FALSE,
    IN p_FinalPayload TEXT DEFAULT NULL,
    IN p_Message_Clear BOOLEAN DEFAULT FALSE,
    IN p_Message TEXT DEFAULT NULL,
    IN p_LastRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastRunID UUID DEFAULT NULL,
    IN p_StartingPayload_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartingPayload TEXT DEFAULT NULL,
    IN p_TotalPromptIterations INTEGER DEFAULT NULL,
    IN p_ConfigurationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConfigurationID UUID DEFAULT NULL,
    IN p_OverrideModelID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OverrideModelID UUID DEFAULT NULL,
    IN p_OverrideVendorID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OverrideVendorID UUID DEFAULT NULL,
    IN p_Data_Clear BOOLEAN DEFAULT FALSE,
    IN p_Data TEXT DEFAULT NULL,
    IN p_Verbose_Clear BOOLEAN DEFAULT FALSE,
    IN p_Verbose BOOLEAN DEFAULT NULL,
    IN p_EffortLevel_Clear BOOLEAN DEFAULT FALSE,
    IN p_EffortLevel INTEGER DEFAULT NULL,
    IN p_RunName_Clear BOOLEAN DEFAULT FALSE,
    IN p_RunName VARCHAR(255) DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_ScheduledJobRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ScheduledJobRunID UUID DEFAULT NULL,
    IN p_TestRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TestRunID UUID DEFAULT NULL,
    IN p_PrimaryScopeEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeEntityID UUID DEFAULT NULL,
    IN p_PrimaryScopeRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeRecordID VARCHAR(100) DEFAULT NULL,
    IN p_SecondaryScopes_Clear BOOLEAN DEFAULT FALSE,
    IN p_SecondaryScopes TEXT DEFAULT NULL,
    IN p_ExternalReferenceID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalReferenceID VARCHAR(200) DEFAULT NULL,
    IN p_CompanyID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompanyID UUID DEFAULT NULL,
    IN p_TotalCacheReadTokensUsed_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCacheReadTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalCacheWriteTokensUsed_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCacheWriteTokensUsed INTEGER DEFAULT NULL,
    IN p_LastHeartbeatAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastHeartbeatAt TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentRuns" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
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
                "TotalCacheReadTokensUsed",
                "TotalCacheWriteTokensUsed",
                "LastHeartbeatAt"
            )
        VALUES
            (
                p_ID,
                p_AgentID,
                CASE WHEN p_ParentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentRunID, NULL) END,
                COALESCE(p_Status, 'Running'),
                COALESCE(p_StartedAt, NOW()),
                CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, NULL) END,
                CASE WHEN p_Success_Clear = TRUE THEN NULL ELSE COALESCE(p_Success, NULL) END,
                CASE WHEN p_ErrorMessage_Clear = TRUE THEN NULL ELSE COALESCE(p_ErrorMessage, NULL) END,
                CASE WHEN p_ConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationID, NULL) END,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_Result_Clear = TRUE THEN NULL ELSE COALESCE(p_Result, NULL) END,
                CASE WHEN p_AgentState_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentState, NULL) END,
                CASE WHEN p_TotalTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalTokensUsed, 0) END,
                CASE WHEN p_TotalCost_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCost, 0.000000) END,
                CASE WHEN p_TotalPromptTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalPromptTokensUsed, NULL) END,
                CASE WHEN p_TotalCompletionTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCompletionTokensUsed, NULL) END,
                CASE WHEN p_TotalTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalTokensUsedRollup, NULL) END,
                CASE WHEN p_TotalPromptTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalPromptTokensUsedRollup, NULL) END,
                CASE WHEN p_TotalCompletionTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCompletionTokensUsedRollup, NULL) END,
                CASE WHEN p_TotalCostRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCostRollup, NULL) END,
                CASE WHEN p_ConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailID, NULL) END,
                CASE WHEN p_ConversationDetailSequence_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailSequence, NULL) END,
                CASE WHEN p_CancellationReason_Clear = TRUE THEN NULL ELSE COALESCE(p_CancellationReason, NULL) END,
                CASE WHEN p_FinalStep_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalStep, NULL) END,
                CASE WHEN p_FinalPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalPayload, NULL) END,
                CASE WHEN p_Message_Clear = TRUE THEN NULL ELSE COALESCE(p_Message, NULL) END,
                CASE WHEN p_LastRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRunID, NULL) END,
                CASE WHEN p_StartingPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_StartingPayload, NULL) END,
                COALESCE(p_TotalPromptIterations, 0),
                CASE WHEN p_ConfigurationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConfigurationID, NULL) END,
                CASE WHEN p_OverrideModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_OverrideModelID, NULL) END,
                CASE WHEN p_OverrideVendorID_Clear = TRUE THEN NULL ELSE COALESCE(p_OverrideVendorID, NULL) END,
                CASE WHEN p_Data_Clear = TRUE THEN NULL ELSE COALESCE(p_Data, NULL) END,
                CASE WHEN p_Verbose_Clear = TRUE THEN NULL ELSE COALESCE(p_Verbose, FALSE) END,
                CASE WHEN p_EffortLevel_Clear = TRUE THEN NULL ELSE COALESCE(p_EffortLevel, NULL) END,
                CASE WHEN p_RunName_Clear = TRUE THEN NULL ELSE COALESCE(p_RunName, NULL) END,
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END,
                CASE WHEN p_ScheduledJobRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_ScheduledJobRunID, NULL) END,
                CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, NULL) END,
                CASE WHEN p_PrimaryScopeEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeEntityID, NULL) END,
                CASE WHEN p_PrimaryScopeRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeRecordID, NULL) END,
                CASE WHEN p_SecondaryScopes_Clear = TRUE THEN NULL ELSE COALESCE(p_SecondaryScopes, NULL) END,
                CASE WHEN p_ExternalReferenceID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalReferenceID, NULL) END,
                CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, NULL) END,
                CASE WHEN p_TotalCacheReadTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCacheReadTokensUsed, NULL) END,
                CASE WHEN p_TotalCacheWriteTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCacheWriteTokensUsed, NULL) END,
                CASE WHEN p_LastHeartbeatAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastHeartbeatAt, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIAgentRun"
            (
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
                "TotalCacheReadTokensUsed",
                "TotalCacheWriteTokensUsed",
                "LastHeartbeatAt"
            )
        VALUES
            (
                p_AgentID,
                CASE WHEN p_ParentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentRunID, NULL) END,
                COALESCE(p_Status, 'Running'),
                COALESCE(p_StartedAt, NOW()),
                CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, NULL) END,
                CASE WHEN p_Success_Clear = TRUE THEN NULL ELSE COALESCE(p_Success, NULL) END,
                CASE WHEN p_ErrorMessage_Clear = TRUE THEN NULL ELSE COALESCE(p_ErrorMessage, NULL) END,
                CASE WHEN p_ConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationID, NULL) END,
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_Result_Clear = TRUE THEN NULL ELSE COALESCE(p_Result, NULL) END,
                CASE WHEN p_AgentState_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentState, NULL) END,
                CASE WHEN p_TotalTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalTokensUsed, 0) END,
                CASE WHEN p_TotalCost_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCost, 0.000000) END,
                CASE WHEN p_TotalPromptTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalPromptTokensUsed, NULL) END,
                CASE WHEN p_TotalCompletionTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCompletionTokensUsed, NULL) END,
                CASE WHEN p_TotalTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalTokensUsedRollup, NULL) END,
                CASE WHEN p_TotalPromptTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalPromptTokensUsedRollup, NULL) END,
                CASE WHEN p_TotalCompletionTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCompletionTokensUsedRollup, NULL) END,
                CASE WHEN p_TotalCostRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCostRollup, NULL) END,
                CASE WHEN p_ConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailID, NULL) END,
                CASE WHEN p_ConversationDetailSequence_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailSequence, NULL) END,
                CASE WHEN p_CancellationReason_Clear = TRUE THEN NULL ELSE COALESCE(p_CancellationReason, NULL) END,
                CASE WHEN p_FinalStep_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalStep, NULL) END,
                CASE WHEN p_FinalPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalPayload, NULL) END,
                CASE WHEN p_Message_Clear = TRUE THEN NULL ELSE COALESCE(p_Message, NULL) END,
                CASE WHEN p_LastRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRunID, NULL) END,
                CASE WHEN p_StartingPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_StartingPayload, NULL) END,
                COALESCE(p_TotalPromptIterations, 0),
                CASE WHEN p_ConfigurationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConfigurationID, NULL) END,
                CASE WHEN p_OverrideModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_OverrideModelID, NULL) END,
                CASE WHEN p_OverrideVendorID_Clear = TRUE THEN NULL ELSE COALESCE(p_OverrideVendorID, NULL) END,
                CASE WHEN p_Data_Clear = TRUE THEN NULL ELSE COALESCE(p_Data, NULL) END,
                CASE WHEN p_Verbose_Clear = TRUE THEN NULL ELSE COALESCE(p_Verbose, FALSE) END,
                CASE WHEN p_EffortLevel_Clear = TRUE THEN NULL ELSE COALESCE(p_EffortLevel, NULL) END,
                CASE WHEN p_RunName_Clear = TRUE THEN NULL ELSE COALESCE(p_RunName, NULL) END,
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END,
                CASE WHEN p_ScheduledJobRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_ScheduledJobRunID, NULL) END,
                CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, NULL) END,
                CASE WHEN p_PrimaryScopeEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeEntityID, NULL) END,
                CASE WHEN p_PrimaryScopeRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeRecordID, NULL) END,
                CASE WHEN p_SecondaryScopes_Clear = TRUE THEN NULL ELSE COALESCE(p_SecondaryScopes, NULL) END,
                CASE WHEN p_ExternalReferenceID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalReferenceID, NULL) END,
                CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, NULL) END,
                CASE WHEN p_TotalCacheReadTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCacheReadTokensUsed, NULL) END,
                CASE WHEN p_TotalCacheWriteTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCacheWriteTokensUsed, NULL) END,
                CASE WHEN p_LastHeartbeatAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastHeartbeatAt, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIAgentRuns" WHERE "ID" = p_ID;
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
CREATE OR REPLACE FUNCTION __mj."spUpdateAIAgentRun"(
    IN p_ID UUID,
    IN p_AgentID UUID DEFAULT NULL,
    IN p_ParentRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ParentRunID UUID DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_CompletedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompletedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Success_Clear BOOLEAN DEFAULT FALSE,
    IN p_Success BOOLEAN DEFAULT NULL,
    IN p_ErrorMessage_Clear BOOLEAN DEFAULT FALSE,
    IN p_ErrorMessage TEXT DEFAULT NULL,
    IN p_ConversationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationID UUID DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_Result_Clear BOOLEAN DEFAULT FALSE,
    IN p_Result TEXT DEFAULT NULL,
    IN p_AgentState_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentState TEXT DEFAULT NULL,
    IN p_TotalTokensUsed_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalCost_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCost NUMERIC(18,6) DEFAULT NULL,
    IN p_TotalPromptTokensUsed_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalPromptTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalCompletionTokensUsed_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCompletionTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalTokensUsedRollup_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalTokensUsedRollup INTEGER DEFAULT NULL,
    IN p_TotalPromptTokensUsedRollup_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalPromptTokensUsedRollup INTEGER DEFAULT NULL,
    IN p_TotalCompletionTokensUsedRollup_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCompletionTokensUsedRollup INTEGER DEFAULT NULL,
    IN p_TotalCostRollup_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCostRollup NUMERIC(19,8) DEFAULT NULL,
    IN p_ConversationDetailID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationDetailID UUID DEFAULT NULL,
    IN p_ConversationDetailSequence_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConversationDetailSequence INTEGER DEFAULT NULL,
    IN p_CancellationReason_Clear BOOLEAN DEFAULT FALSE,
    IN p_CancellationReason VARCHAR(30) DEFAULT NULL,
    IN p_FinalStep_Clear BOOLEAN DEFAULT FALSE,
    IN p_FinalStep VARCHAR(30) DEFAULT NULL,
    IN p_FinalPayload_Clear BOOLEAN DEFAULT FALSE,
    IN p_FinalPayload TEXT DEFAULT NULL,
    IN p_Message_Clear BOOLEAN DEFAULT FALSE,
    IN p_Message TEXT DEFAULT NULL,
    IN p_LastRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastRunID UUID DEFAULT NULL,
    IN p_StartingPayload_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartingPayload TEXT DEFAULT NULL,
    IN p_TotalPromptIterations INTEGER DEFAULT NULL,
    IN p_ConfigurationID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ConfigurationID UUID DEFAULT NULL,
    IN p_OverrideModelID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OverrideModelID UUID DEFAULT NULL,
    IN p_OverrideVendorID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OverrideVendorID UUID DEFAULT NULL,
    IN p_Data_Clear BOOLEAN DEFAULT FALSE,
    IN p_Data TEXT DEFAULT NULL,
    IN p_Verbose_Clear BOOLEAN DEFAULT FALSE,
    IN p_Verbose BOOLEAN DEFAULT NULL,
    IN p_EffortLevel_Clear BOOLEAN DEFAULT FALSE,
    IN p_EffortLevel INTEGER DEFAULT NULL,
    IN p_RunName_Clear BOOLEAN DEFAULT FALSE,
    IN p_RunName VARCHAR(255) DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_ScheduledJobRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ScheduledJobRunID UUID DEFAULT NULL,
    IN p_TestRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TestRunID UUID DEFAULT NULL,
    IN p_PrimaryScopeEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeEntityID UUID DEFAULT NULL,
    IN p_PrimaryScopeRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PrimaryScopeRecordID VARCHAR(100) DEFAULT NULL,
    IN p_SecondaryScopes_Clear BOOLEAN DEFAULT FALSE,
    IN p_SecondaryScopes TEXT DEFAULT NULL,
    IN p_ExternalReferenceID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExternalReferenceID VARCHAR(200) DEFAULT NULL,
    IN p_CompanyID_Clear BOOLEAN DEFAULT FALSE,
    IN p_CompanyID UUID DEFAULT NULL,
    IN p_TotalCacheReadTokensUsed_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCacheReadTokensUsed INTEGER DEFAULT NULL,
    IN p_TotalCacheWriteTokensUsed_Clear BOOLEAN DEFAULT FALSE,
    IN p_TotalCacheWriteTokensUsed INTEGER DEFAULT NULL,
    IN p_LastHeartbeatAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastHeartbeatAt TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF __mj."vwAIAgentRuns" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIAgentRun"
    SET
        "AgentID" = COALESCE(p_AgentID, "AgentID"),
        "ParentRunID" = CASE WHEN p_ParentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_ParentRunID, "ParentRunID") END,
        "Status" = COALESCE(p_Status, "Status"),
        "StartedAt" = COALESCE(p_StartedAt, "StartedAt"),
        "CompletedAt" = CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, "CompletedAt") END,
        "Success" = CASE WHEN p_Success_Clear = TRUE THEN NULL ELSE COALESCE(p_Success, "Success") END,
        "ErrorMessage" = CASE WHEN p_ErrorMessage_Clear = TRUE THEN NULL ELSE COALESCE(p_ErrorMessage, "ErrorMessage") END,
        "ConversationID" = CASE WHEN p_ConversationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationID, "ConversationID") END,
        "UserID" = CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, "UserID") END,
        "Result" = CASE WHEN p_Result_Clear = TRUE THEN NULL ELSE COALESCE(p_Result, "Result") END,
        "AgentState" = CASE WHEN p_AgentState_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentState, "AgentState") END,
        "TotalTokensUsed" = CASE WHEN p_TotalTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalTokensUsed, "TotalTokensUsed") END,
        "TotalCost" = CASE WHEN p_TotalCost_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCost, "TotalCost") END,
        "TotalPromptTokensUsed" = CASE WHEN p_TotalPromptTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalPromptTokensUsed, "TotalPromptTokensUsed") END,
        "TotalCompletionTokensUsed" = CASE WHEN p_TotalCompletionTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCompletionTokensUsed, "TotalCompletionTokensUsed") END,
        "TotalTokensUsedRollup" = CASE WHEN p_TotalTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalTokensUsedRollup, "TotalTokensUsedRollup") END,
        "TotalPromptTokensUsedRollup" = CASE WHEN p_TotalPromptTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalPromptTokensUsedRollup, "TotalPromptTokensUsedRollup") END,
        "TotalCompletionTokensUsedRollup" = CASE WHEN p_TotalCompletionTokensUsedRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCompletionTokensUsedRollup, "TotalCompletionTokensUsedRollup") END,
        "TotalCostRollup" = CASE WHEN p_TotalCostRollup_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCostRollup, "TotalCostRollup") END,
        "ConversationDetailID" = CASE WHEN p_ConversationDetailID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailID, "ConversationDetailID") END,
        "ConversationDetailSequence" = CASE WHEN p_ConversationDetailSequence_Clear = TRUE THEN NULL ELSE COALESCE(p_ConversationDetailSequence, "ConversationDetailSequence") END,
        "CancellationReason" = CASE WHEN p_CancellationReason_Clear = TRUE THEN NULL ELSE COALESCE(p_CancellationReason, "CancellationReason") END,
        "FinalStep" = CASE WHEN p_FinalStep_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalStep, "FinalStep") END,
        "FinalPayload" = CASE WHEN p_FinalPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_FinalPayload, "FinalPayload") END,
        "Message" = CASE WHEN p_Message_Clear = TRUE THEN NULL ELSE COALESCE(p_Message, "Message") END,
        "LastRunID" = CASE WHEN p_LastRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRunID, "LastRunID") END,
        "StartingPayload" = CASE WHEN p_StartingPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_StartingPayload, "StartingPayload") END,
        "TotalPromptIterations" = COALESCE(p_TotalPromptIterations, "TotalPromptIterations"),
        "ConfigurationID" = CASE WHEN p_ConfigurationID_Clear = TRUE THEN NULL ELSE COALESCE(p_ConfigurationID, "ConfigurationID") END,
        "OverrideModelID" = CASE WHEN p_OverrideModelID_Clear = TRUE THEN NULL ELSE COALESCE(p_OverrideModelID, "OverrideModelID") END,
        "OverrideVendorID" = CASE WHEN p_OverrideVendorID_Clear = TRUE THEN NULL ELSE COALESCE(p_OverrideVendorID, "OverrideVendorID") END,
        "Data" = CASE WHEN p_Data_Clear = TRUE THEN NULL ELSE COALESCE(p_Data, "Data") END,
        "Verbose" = CASE WHEN p_Verbose_Clear = TRUE THEN NULL ELSE COALESCE(p_Verbose, "Verbose") END,
        "EffortLevel" = CASE WHEN p_EffortLevel_Clear = TRUE THEN NULL ELSE COALESCE(p_EffortLevel, "EffortLevel") END,
        "RunName" = CASE WHEN p_RunName_Clear = TRUE THEN NULL ELSE COALESCE(p_RunName, "RunName") END,
        "Comments" = CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, "Comments") END,
        "ScheduledJobRunID" = CASE WHEN p_ScheduledJobRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_ScheduledJobRunID, "ScheduledJobRunID") END,
        "TestRunID" = CASE WHEN p_TestRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_TestRunID, "TestRunID") END,
        "PrimaryScopeEntityID" = CASE WHEN p_PrimaryScopeEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeEntityID, "PrimaryScopeEntityID") END,
        "PrimaryScopeRecordID" = CASE WHEN p_PrimaryScopeRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_PrimaryScopeRecordID, "PrimaryScopeRecordID") END,
        "SecondaryScopes" = CASE WHEN p_SecondaryScopes_Clear = TRUE THEN NULL ELSE COALESCE(p_SecondaryScopes, "SecondaryScopes") END,
        "ExternalReferenceID" = CASE WHEN p_ExternalReferenceID_Clear = TRUE THEN NULL ELSE COALESCE(p_ExternalReferenceID, "ExternalReferenceID") END,
        "CompanyID" = CASE WHEN p_CompanyID_Clear = TRUE THEN NULL ELSE COALESCE(p_CompanyID, "CompanyID") END,
        "TotalCacheReadTokensUsed" = CASE WHEN p_TotalCacheReadTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCacheReadTokensUsed, "TotalCacheReadTokensUsed") END,
        "TotalCacheWriteTokensUsed" = CASE WHEN p_TotalCacheWriteTokensUsed_Clear = TRUE THEN NULL ELSE COALESCE(p_TotalCacheWriteTokensUsed, "TotalCacheWriteTokensUsed") END,
        "LastHeartbeatAt" = CASE WHEN p_LastHeartbeatAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastHeartbeatAt, "LastHeartbeatAt") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIAgentRuns" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIAgentRuns" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteAIAgentRunStep'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAIAgentRunStep"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJAIAgentRequests_OriginatingAgentRunStepIDID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_AgentID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestedAt TIMESTAMPTZ;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestForUserID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_Status VARCHAR(20);
    p_MJAIAgentRequests_OriginatingAgentRunStepID_Request TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_Response TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseByUserID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_RespondedAt TIMESTAMPTZ;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_Comments TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestTypeID UUID;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSchema TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseData TEXT;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_Priority INTEGER;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_ExpiresAt TIMESTAMPTZ;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_Originating_0a03b4 UUID;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_Originating_4e3246 UUID;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_ResumingAge_3f1d42 UUID;
    p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSource VARCHAR(20);
    p_MJAIAgentRunSteps_ParentIDID UUID;
    p_MJAIAgentRunSteps_ParentID_AgentRunID UUID;
    p_MJAIAgentRunSteps_ParentID_StepNumber INTEGER;
    p_MJAIAgentRunSteps_ParentID_StepType VARCHAR(50);
    p_MJAIAgentRunSteps_ParentID_StepName VARCHAR(255);
    p_MJAIAgentRunSteps_ParentID_TargetID UUID;
    p_MJAIAgentRunSteps_ParentID_Status VARCHAR(50);
    p_MJAIAgentRunSteps_ParentID_StartedAt TIMESTAMPTZ;
    p_MJAIAgentRunSteps_ParentID_CompletedAt TIMESTAMPTZ;
    p_MJAIAgentRunSteps_ParentID_Success BOOLEAN;
    p_MJAIAgentRunSteps_ParentID_ErrorMessage TEXT;
    p_MJAIAgentRunSteps_ParentID_InputData TEXT;
    p_MJAIAgentRunSteps_ParentID_OutputData TEXT;
    p_MJAIAgentRunSteps_ParentID_TargetLogID UUID;
    p_MJAIAgentRunSteps_ParentID_PayloadAtStart TEXT;
    p_MJAIAgentRunSteps_ParentID_PayloadAtEnd TEXT;
    p_MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult VARCHAR(25);
    p_MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages TEXT;
    p_MJAIAgentRunSteps_ParentID_ParentID UUID;
    p_MJAIAgentRunSteps_ParentID_Comments TEXT;
BEGIN
-- Cascade update on AIAgentRequest using cursor to call spUpdateAIAgentRequest


    FOR _rec IN SELECT "ID", "AgentID", "RequestedAt", "RequestForUserID", "Status", "Request", "Response", "ResponseByUserID", "RespondedAt", "Comments", "RequestTypeID", "ResponseSchema", "ResponseData", "Priority", "ExpiresAt", "OriginatingAgentRunID", "OriginatingAgentRunStepID", "ResumingAgentRunID", "ResponseSource" FROM __mj."AIAgentRequest" WHERE "OriginatingAgentRunStepID" = p_ID
    LOOP
        p_MJAIAgentRequests_OriginatingAgentRunStepIDID := _rec."ID";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_AgentID := _rec."AgentID";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestedAt := _rec."RequestedAt";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestForUserID := _rec."RequestForUserID";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_Status := _rec."Status";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_Request := _rec."Request";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_Response := _rec."Response";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseByUserID := _rec."ResponseByUserID";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_RespondedAt := _rec."RespondedAt";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_Comments := _rec."Comments";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestTypeID := _rec."RequestTypeID";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSchema := _rec."ResponseSchema";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseData := _rec."ResponseData";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_Priority := _rec."Priority";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_ExpiresAt := _rec."ExpiresAt";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_Originating_0a03b4 := _rec."OriginatingAgentRunID";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_Originating_4e3246 := _rec."OriginatingAgentRunStepID";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_ResumingAge_3f1d42 := _rec."ResumingAgentRunID";
        p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSource := _rec."ResponseSource";
        -- Set the FK field to NULL
        p_MJAIAgentRequests_OriginatingAgentRunStepID_Originating_4e3246 := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRequest"(p_ID => p_MJAIAgentRequests_OriginatingAgentRunStepIDID, p_AgentID => p_MJAIAgentRequests_OriginatingAgentRunStepID_AgentID, p_RequestedAt => p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestedAt, p_RequestForUserID => p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestForUserID, p_Status => p_MJAIAgentRequests_OriginatingAgentRunStepID_Status, p_Request => p_MJAIAgentRequests_OriginatingAgentRunStepID_Request, p_Response => p_MJAIAgentRequests_OriginatingAgentRunStepID_Response, p_ResponseByUserID => p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseByUserID, p_RespondedAt => p_MJAIAgentRequests_OriginatingAgentRunStepID_RespondedAt, p_Comments => p_MJAIAgentRequests_OriginatingAgentRunStepID_Comments, p_RequestTypeID => p_MJAIAgentRequests_OriginatingAgentRunStepID_RequestTypeID, p_ResponseSchema => p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSchema, p_ResponseData => p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseData, p_Priority => p_MJAIAgentRequests_OriginatingAgentRunStepID_Priority, p_ExpiresAt => p_MJAIAgentRequests_OriginatingAgentRunStepID_ExpiresAt, p_OriginatingAgentRunID => p_MJAIAgentRequests_OriginatingAgentRunStepID_Originating_0a03b4, p_OriginatingAgentRunStepID_Clear => 1, p_OriginatingAgentRunStepID => p_MJAIAgentRequests_OriginatingAgentRunStepID_Originating_4e3246, p_ResumingAgentRunID => p_MJAIAgentRequests_OriginatingAgentRunStepID_ResumingAge_3f1d42, p_ResponseSource => p_MJAIAgentRequests_OriginatingAgentRunStepID_ResponseSource);

    END LOOP;

    
    -- Cascade update on AIAgentRunStep using cursor to call spUpdateAIAgentRunStep


    FOR _rec IN SELECT "ID", "AgentRunID", "StepNumber", "StepType", "StepName", "TargetID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "InputData", "OutputData", "TargetLogID", "PayloadAtStart", "PayloadAtEnd", "FinalPayloadValidationResult", "FinalPayloadValidationMessages", "ParentID", "Comments" FROM __mj."AIAgentRunStep" WHERE "ParentID" = p_ID
    LOOP
        p_MJAIAgentRunSteps_ParentIDID := _rec."ID";
        p_MJAIAgentRunSteps_ParentID_AgentRunID := _rec."AgentRunID";
        p_MJAIAgentRunSteps_ParentID_StepNumber := _rec."StepNumber";
        p_MJAIAgentRunSteps_ParentID_StepType := _rec."StepType";
        p_MJAIAgentRunSteps_ParentID_StepName := _rec."StepName";
        p_MJAIAgentRunSteps_ParentID_TargetID := _rec."TargetID";
        p_MJAIAgentRunSteps_ParentID_Status := _rec."Status";
        p_MJAIAgentRunSteps_ParentID_StartedAt := _rec."StartedAt";
        p_MJAIAgentRunSteps_ParentID_CompletedAt := _rec."CompletedAt";
        p_MJAIAgentRunSteps_ParentID_Success := _rec."Success";
        p_MJAIAgentRunSteps_ParentID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIAgentRunSteps_ParentID_InputData := _rec."InputData";
        p_MJAIAgentRunSteps_ParentID_OutputData := _rec."OutputData";
        p_MJAIAgentRunSteps_ParentID_TargetLogID := _rec."TargetLogID";
        p_MJAIAgentRunSteps_ParentID_PayloadAtStart := _rec."PayloadAtStart";
        p_MJAIAgentRunSteps_ParentID_PayloadAtEnd := _rec."PayloadAtEnd";
        p_MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult := _rec."FinalPayloadValidationResult";
        p_MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages := _rec."FinalPayloadValidationMessages";
        p_MJAIAgentRunSteps_ParentID_ParentID := _rec."ParentID";
        p_MJAIAgentRunSteps_ParentID_Comments := _rec."Comments";
        -- Set the FK field to NULL
        p_MJAIAgentRunSteps_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRunStep"(p_ID => p_MJAIAgentRunSteps_ParentIDID, p_AgentRunID => p_MJAIAgentRunSteps_ParentID_AgentRunID, p_StepNumber => p_MJAIAgentRunSteps_ParentID_StepNumber, p_StepType => p_MJAIAgentRunSteps_ParentID_StepType, p_StepName => p_MJAIAgentRunSteps_ParentID_StepName, p_TargetID => p_MJAIAgentRunSteps_ParentID_TargetID, p_Status => p_MJAIAgentRunSteps_ParentID_Status, p_StartedAt => p_MJAIAgentRunSteps_ParentID_StartedAt, p_CompletedAt => p_MJAIAgentRunSteps_ParentID_CompletedAt, p_Success => p_MJAIAgentRunSteps_ParentID_Success, p_ErrorMessage => p_MJAIAgentRunSteps_ParentID_ErrorMessage, p_InputData => p_MJAIAgentRunSteps_ParentID_InputData, p_OutputData => p_MJAIAgentRunSteps_ParentID_OutputData, p_TargetLogID => p_MJAIAgentRunSteps_ParentID_TargetLogID, p_PayloadAtStart => p_MJAIAgentRunSteps_ParentID_PayloadAtStart, p_PayloadAtEnd => p_MJAIAgentRunSteps_ParentID_PayloadAtEnd, p_FinalPayloadValidationResult => p_MJAIAgentRunSteps_ParentID_FinalPayloadValidationResult, p_FinalPayloadValidationMessages => p_MJAIAgentRunSteps_ParentID_FinalPayloadValidationMessages, p_ParentID_Clear => 1, p_ParentID => p_MJAIAgentRunSteps_ParentID_ParentID, p_Comments => p_MJAIAgentRunSteps_ParentID_Comments);

    END LOOP;

    

    DELETE FROM
        __mj."AIAgentRunStep"
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


    FOR _rec IN SELECT "ID", "AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt", "ConsolidatedIntoNoteID", "ConsolidationCount", "DerivedFromNoteIDs", "ProtectionTier", "ImportanceScore" FROM __mj."AIAgentNote" WHERE "SourceAIAgentRunID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentNote"(p_ID => p_MJAIAgentNotes_SourceAIAgentRunIDID, p_AgentID => p_MJAIAgentNotes_SourceAIAgentRunID_AgentID, p_AgentNoteTypeID => p_MJAIAgentNotes_SourceAIAgentRunID_AgentNoteTypeID, p_Note => p_MJAIAgentNotes_SourceAIAgentRunID_Note, p_UserID => p_MJAIAgentNotes_SourceAIAgentRunID_UserID, p_Type => p_MJAIAgentNotes_SourceAIAgentRunID_Type, p_IsAutoGenerated => p_MJAIAgentNotes_SourceAIAgentRunID_IsAutoGenerated, p_Comments => p_MJAIAgentNotes_SourceAIAgentRunID_Comments, p_Status => p_MJAIAgentNotes_SourceAIAgentRunID_Status, p_SourceConversationID => p_MJAIAgentNotes_SourceAIAgentRunID_SourceConversationID, p_SourceConversationDetailID => p_MJAIAgentNotes_SourceAIAgentRunID_SourceConversationDetailID, p_SourceAIAgentRunID_Clear => 1, p_SourceAIAgentRunID => p_MJAIAgentNotes_SourceAIAgentRunID_SourceAIAgentRunID, p_CompanyID => p_MJAIAgentNotes_SourceAIAgentRunID_CompanyID, p_EmbeddingVector => p_MJAIAgentNotes_SourceAIAgentRunID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentNotes_SourceAIAgentRunID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentNotes_SourceAIAgentRunID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentNotes_SourceAIAgentRunID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentNotes_SourceAIAgentRunID_LastAccessedAt, p_AccessCount => p_MJAIAgentNotes_SourceAIAgentRunID_AccessCount, p_ExpiresAt => p_MJAIAgentNotes_SourceAIAgentRunID_ExpiresAt, p_ConsolidatedIntoNoteID => p_MJAIAgentNotes_SourceAIAgentRunID_ConsolidatedIntoNoteID, p_ConsolidationCount => p_MJAIAgentNotes_SourceAIAgentRunID_ConsolidationCount, p_DerivedFromNoteIDs => p_MJAIAgentNotes_SourceAIAgentRunID_DerivedFromNoteIDs, p_ProtectionTier => p_MJAIAgentNotes_SourceAIAgentRunID_ProtectionTier, p_ImportanceScore => p_MJAIAgentNotes_SourceAIAgentRunID_ImportanceScore);

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


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt" FROM __mj."AIAgentRun" WHERE "ParentRunID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ParentRunID_ParentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ParentRunIDID, p_AgentID => p_MJAIAgentRuns_ParentRunID_AgentID, p_ParentRunID_Clear => 1, p_ParentRunID => p_MJAIAgentRuns_ParentRunID_ParentRunID, p_Status => p_MJAIAgentRuns_ParentRunID_Status, p_StartedAt => p_MJAIAgentRuns_ParentRunID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ParentRunID_CompletedAt, p_Success => p_MJAIAgentRuns_ParentRunID_Success, p_ErrorMessage => p_MJAIAgentRuns_ParentRunID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_ParentRunID_ConversationID, p_UserID => p_MJAIAgentRuns_ParentRunID_UserID, p_Result => p_MJAIAgentRuns_ParentRunID_Result, p_AgentState => p_MJAIAgentRuns_ParentRunID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ParentRunID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_ParentRunID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_ParentRunID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ParentRunID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ParentRunID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ParentRunID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ParentRunID_FinalPayload, p_Message => p_MJAIAgentRuns_ParentRunID_Message, p_LastRunID => p_MJAIAgentRuns_ParentRunID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ParentRunID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ParentRunID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_ParentRunID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ParentRunID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ParentRunID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ParentRunID_Data, p_Verbose => p_MJAIAgentRuns_ParentRunID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ParentRunID_EffortLevel, p_RunName => p_MJAIAgentRuns_ParentRunID_RunName, p_Comments => p_MJAIAgentRuns_ParentRunID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ParentRunID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ParentRunID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ParentRunID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ParentRunID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ParentRunID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_ParentRunID_LastHeartbeatAt);

    END LOOP;

    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt" FROM __mj."AIAgentRun" WHERE "LastRunID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgentRuns_LastRunID_LastRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_LastRunIDID, p_AgentID => p_MJAIAgentRuns_LastRunID_AgentID, p_ParentRunID => p_MJAIAgentRuns_LastRunID_ParentRunID, p_Status => p_MJAIAgentRuns_LastRunID_Status, p_StartedAt => p_MJAIAgentRuns_LastRunID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_LastRunID_CompletedAt, p_Success => p_MJAIAgentRuns_LastRunID_Success, p_ErrorMessage => p_MJAIAgentRuns_LastRunID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_LastRunID_ConversationID, p_UserID => p_MJAIAgentRuns_LastRunID_UserID, p_Result => p_MJAIAgentRuns_LastRunID_Result, p_AgentState => p_MJAIAgentRuns_LastRunID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_LastRunID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_LastRunID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_LastRunID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_LastRunID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_LastRunID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_LastRunID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_LastRunID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_LastRunID_FinalPayload, p_Message => p_MJAIAgentRuns_LastRunID_Message, p_LastRunID_Clear => 1, p_LastRunID => p_MJAIAgentRuns_LastRunID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_LastRunID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_LastRunID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_LastRunID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_LastRunID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_LastRunID_OverrideVendorID, p_Data => p_MJAIAgentRuns_LastRunID_Data, p_Verbose => p_MJAIAgentRuns_LastRunID_Verbose, p_EffortLevel => p_MJAIAgentRuns_LastRunID_EffortLevel, p_RunName => p_MJAIAgentRuns_LastRunID_RunName, p_Comments => p_MJAIAgentRuns_LastRunID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_LastRunID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_LastRunID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_LastRunID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_LastRunID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_LastRunID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_LastRunID_LastHeartbeatAt);

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
           WHERE proname = 'spCreateAIPromptRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateAIPromptRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIPromptRuns"
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

    -- Build column/value lists from the keys present in p_data; absent keys are
    -- omitted so the column DEFAULT applies (matching typed-arg sproc semantics).
    FOREACH v_field_name IN ARRAY ARRAY['PromptID', 'ModelID', 'VendorID', 'AgentID', 'ConfigurationID', 'RunAt', 'CompletedAt', 'ExecutionTimeMS', 'Messages', 'Result', 'TokensUsed', 'TokensPrompt', 'TokensCompletion', 'TotalCost', 'Success', 'ErrorMessage', 'ParentID', 'RunType', 'ExecutionOrder', 'AgentRunID', 'Cost', 'CostCurrency', 'TokensUsedRollup', 'TokensPromptRollup', 'TokensCompletionRollup', 'Temperature', 'TopP', 'TopK', 'MinP', 'FrequencyPenalty', 'PresencePenalty', 'Seed', 'StopSequences', 'ResponseFormat', 'LogProbs', 'TopLogProbs', 'DescendantCost', 'ValidationAttemptCount', 'SuccessfulValidationCount', 'FinalValidationPassed', 'ValidationBehavior', 'RetryStrategy', 'MaxRetriesConfigured', 'FinalValidationError', 'ValidationErrorCount', 'CommonValidationError', 'FirstAttemptAt', 'LastAttemptAt', 'TotalRetryDurationMS', 'ValidationAttempts', 'ValidationSummary', 'FailoverAttempts', 'FailoverErrors', 'FailoverDurations', 'OriginalModelID', 'OriginalRequestStartTime', 'TotalFailoverDuration', 'RerunFromPromptRunID', 'ModelSelection', 'Status', 'Cancelled', 'CancellationReason', 'ModelPowerRank', 'SelectionStrategy', 'CacheHit', 'CacheKey', 'JudgeID', 'JudgeScore', 'WasSelectedResult', 'StreamingEnabled', 'FirstTokenTime', 'ErrorDetails', 'ChildPromptID', 'QueueTime', 'PromptTime', 'CompletionTime', 'ModelSpecificResponseDetails', 'EffortLevel', 'RunName', 'Comments', 'TestRunID', 'AssistantPrefill', 'TokensCacheRead', 'TokensCacheWrite', 'TokensCacheReadRollup', 'TokensCacheWriteRollup']
    LOOP
        IF p_data ? v_field_name THEN
            v_cast_expr := CASE v_field_name
                WHEN 'PromptID' THEN '($1->>''PromptID'')::UUID'
                WHEN 'ModelID' THEN '($1->>''ModelID'')::UUID'
                WHEN 'VendorID' THEN '($1->>''VendorID'')::UUID'
                WHEN 'AgentID' THEN '($1->>''AgentID'')::UUID'
                WHEN 'ConfigurationID' THEN '($1->>''ConfigurationID'')::UUID'
                WHEN 'RunAt' THEN '($1->>''RunAt'')::TIMESTAMPTZ'
                WHEN 'CompletedAt' THEN '($1->>''CompletedAt'')::TIMESTAMPTZ'
                WHEN 'ExecutionTimeMS' THEN '($1->>''ExecutionTimeMS'')::INTEGER'
                WHEN 'Messages' THEN '($1->>''Messages'')'
                WHEN 'Result' THEN '($1->>''Result'')'
                WHEN 'TokensUsed' THEN '($1->>''TokensUsed'')::INTEGER'
                WHEN 'TokensPrompt' THEN '($1->>''TokensPrompt'')::INTEGER'
                WHEN 'TokensCompletion' THEN '($1->>''TokensCompletion'')::INTEGER'
                WHEN 'TotalCost' THEN '($1->>''TotalCost'')::NUMERIC(18,6)'
                WHEN 'Success' THEN '($1->>''Success'')::BOOLEAN'
                WHEN 'ErrorMessage' THEN '($1->>''ErrorMessage'')'
                WHEN 'ParentID' THEN '($1->>''ParentID'')::UUID'
                WHEN 'RunType' THEN '($1->>''RunType'')'
                WHEN 'ExecutionOrder' THEN '($1->>''ExecutionOrder'')::INTEGER'
                WHEN 'AgentRunID' THEN '($1->>''AgentRunID'')::UUID'
                WHEN 'Cost' THEN '($1->>''Cost'')::NUMERIC(19,8)'
                WHEN 'CostCurrency' THEN '($1->>''CostCurrency'')'
                WHEN 'TokensUsedRollup' THEN '($1->>''TokensUsedRollup'')::INTEGER'
                WHEN 'TokensPromptRollup' THEN '($1->>''TokensPromptRollup'')::INTEGER'
                WHEN 'TokensCompletionRollup' THEN '($1->>''TokensCompletionRollup'')::INTEGER'
                WHEN 'Temperature' THEN '($1->>''Temperature'')::NUMERIC(3,2)'
                WHEN 'TopP' THEN '($1->>''TopP'')::NUMERIC(3,2)'
                WHEN 'TopK' THEN '($1->>''TopK'')::INTEGER'
                WHEN 'MinP' THEN '($1->>''MinP'')::NUMERIC(3,2)'
                WHEN 'FrequencyPenalty' THEN '($1->>''FrequencyPenalty'')::NUMERIC(3,2)'
                WHEN 'PresencePenalty' THEN '($1->>''PresencePenalty'')::NUMERIC(3,2)'
                WHEN 'Seed' THEN '($1->>''Seed'')::INTEGER'
                WHEN 'StopSequences' THEN '($1->>''StopSequences'')'
                WHEN 'ResponseFormat' THEN '($1->>''ResponseFormat'')'
                WHEN 'LogProbs' THEN '($1->>''LogProbs'')::BOOLEAN'
                WHEN 'TopLogProbs' THEN '($1->>''TopLogProbs'')::INTEGER'
                WHEN 'DescendantCost' THEN '($1->>''DescendantCost'')::NUMERIC(18,6)'
                WHEN 'ValidationAttemptCount' THEN '($1->>''ValidationAttemptCount'')::INTEGER'
                WHEN 'SuccessfulValidationCount' THEN '($1->>''SuccessfulValidationCount'')::INTEGER'
                WHEN 'FinalValidationPassed' THEN '($1->>''FinalValidationPassed'')::BOOLEAN'
                WHEN 'ValidationBehavior' THEN '($1->>''ValidationBehavior'')'
                WHEN 'RetryStrategy' THEN '($1->>''RetryStrategy'')'
                WHEN 'MaxRetriesConfigured' THEN '($1->>''MaxRetriesConfigured'')::INTEGER'
                WHEN 'FinalValidationError' THEN '($1->>''FinalValidationError'')'
                WHEN 'ValidationErrorCount' THEN '($1->>''ValidationErrorCount'')::INTEGER'
                WHEN 'CommonValidationError' THEN '($1->>''CommonValidationError'')'
                WHEN 'FirstAttemptAt' THEN '($1->>''FirstAttemptAt'')::TIMESTAMPTZ'
                WHEN 'LastAttemptAt' THEN '($1->>''LastAttemptAt'')::TIMESTAMPTZ'
                WHEN 'TotalRetryDurationMS' THEN '($1->>''TotalRetryDurationMS'')::INTEGER'
                WHEN 'ValidationAttempts' THEN '($1->>''ValidationAttempts'')'
                WHEN 'ValidationSummary' THEN '($1->>''ValidationSummary'')'
                WHEN 'FailoverAttempts' THEN '($1->>''FailoverAttempts'')::INTEGER'
                WHEN 'FailoverErrors' THEN '($1->>''FailoverErrors'')'
                WHEN 'FailoverDurations' THEN '($1->>''FailoverDurations'')'
                WHEN 'OriginalModelID' THEN '($1->>''OriginalModelID'')::UUID'
                WHEN 'OriginalRequestStartTime' THEN '($1->>''OriginalRequestStartTime'')::TIMESTAMPTZ'
                WHEN 'TotalFailoverDuration' THEN '($1->>''TotalFailoverDuration'')::INTEGER'
                WHEN 'RerunFromPromptRunID' THEN '($1->>''RerunFromPromptRunID'')::UUID'
                WHEN 'ModelSelection' THEN '($1->>''ModelSelection'')'
                WHEN 'Status' THEN '($1->>''Status'')'
                WHEN 'Cancelled' THEN '($1->>''Cancelled'')::BOOLEAN'
                WHEN 'CancellationReason' THEN '($1->>''CancellationReason'')'
                WHEN 'ModelPowerRank' THEN '($1->>''ModelPowerRank'')::INTEGER'
                WHEN 'SelectionStrategy' THEN '($1->>''SelectionStrategy'')'
                WHEN 'CacheHit' THEN '($1->>''CacheHit'')::BOOLEAN'
                WHEN 'CacheKey' THEN '($1->>''CacheKey'')'
                WHEN 'JudgeID' THEN '($1->>''JudgeID'')::UUID'
                WHEN 'JudgeScore' THEN '($1->>''JudgeScore'')::DOUBLE PRECISION'
                WHEN 'WasSelectedResult' THEN '($1->>''WasSelectedResult'')::BOOLEAN'
                WHEN 'StreamingEnabled' THEN '($1->>''StreamingEnabled'')::BOOLEAN'
                WHEN 'FirstTokenTime' THEN '($1->>''FirstTokenTime'')::INTEGER'
                WHEN 'ErrorDetails' THEN '($1->>''ErrorDetails'')'
                WHEN 'ChildPromptID' THEN '($1->>''ChildPromptID'')::UUID'
                WHEN 'QueueTime' THEN '($1->>''QueueTime'')::INTEGER'
                WHEN 'PromptTime' THEN '($1->>''PromptTime'')::INTEGER'
                WHEN 'CompletionTime' THEN '($1->>''CompletionTime'')::INTEGER'
                WHEN 'ModelSpecificResponseDetails' THEN '($1->>''ModelSpecificResponseDetails'')'
                WHEN 'EffortLevel' THEN '($1->>''EffortLevel'')::INTEGER'
                WHEN 'RunName' THEN '($1->>''RunName'')'
                WHEN 'Comments' THEN '($1->>''Comments'')'
                WHEN 'TestRunID' THEN '($1->>''TestRunID'')::UUID'
                WHEN 'AssistantPrefill' THEN '($1->>''AssistantPrefill'')'
                WHEN 'TokensCacheRead' THEN '($1->>''TokensCacheRead'')::INTEGER'
                WHEN 'TokensCacheWrite' THEN '($1->>''TokensCacheWrite'')::INTEGER'
                WHEN 'TokensCacheReadRollup' THEN '($1->>''TokensCacheReadRollup'')::INTEGER'
                WHEN 'TokensCacheWriteRollup' THEN '($1->>''TokensCacheWriteRollup'')::INTEGER'
            END;
            v_col_list := v_col_list || ', ' || quote_ident(v_field_name);
            v_val_list := v_val_list || ', ' || v_cast_expr;
        END IF;
    END LOOP;

    v_sql := format('INSERT INTO __mj."AIPromptRun" (%s) VALUES (%s)', v_col_list, v_val_list);
    EXECUTE v_sql USING p_data;

    RETURN QUERY SELECT * FROM __mj."vwAIPromptRuns" WHERE "ID" = v_id;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateAIPromptRun'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateAIPromptRun"(p_data JSONB)
RETURNS SETOF __mj."vwAIPromptRuns"
AS $$
DECLARE
    v_id UUID := (p_data->>'ID')::UUID;
    v_updated_count INTEGER;
BEGIN
    IF p_data IS NULL OR NOT (p_data ? 'ID') THEN
        RAISE EXCEPTION 'spUpdateAIPromptRun: p_data must include "ID"';
    END IF;

    UPDATE __mj."AIPromptRun" SET
        "PromptID" = CASE WHEN p_data ? 'PromptID' THEN (p_data->>'PromptID')::UUID ELSE "PromptID" END,
        "ModelID" = CASE WHEN p_data ? 'ModelID' THEN (p_data->>'ModelID')::UUID ELSE "ModelID" END,
        "VendorID" = CASE WHEN p_data ? 'VendorID' THEN (p_data->>'VendorID')::UUID ELSE "VendorID" END,
        "AgentID" = CASE WHEN p_data ? 'AgentID' THEN (p_data->>'AgentID')::UUID ELSE "AgentID" END,
        "ConfigurationID" = CASE WHEN p_data ? 'ConfigurationID' THEN (p_data->>'ConfigurationID')::UUID ELSE "ConfigurationID" END,
        "RunAt" = CASE WHEN p_data ? 'RunAt' THEN (p_data->>'RunAt')::TIMESTAMPTZ ELSE "RunAt" END,
        "CompletedAt" = CASE WHEN p_data ? 'CompletedAt' THEN (p_data->>'CompletedAt')::TIMESTAMPTZ ELSE "CompletedAt" END,
        "ExecutionTimeMS" = CASE WHEN p_data ? 'ExecutionTimeMS' THEN (p_data->>'ExecutionTimeMS')::INTEGER ELSE "ExecutionTimeMS" END,
        "Messages" = CASE WHEN p_data ? 'Messages' THEN (p_data->>'Messages') ELSE "Messages" END,
        "Result" = CASE WHEN p_data ? 'Result' THEN (p_data->>'Result') ELSE "Result" END,
        "TokensUsed" = CASE WHEN p_data ? 'TokensUsed' THEN (p_data->>'TokensUsed')::INTEGER ELSE "TokensUsed" END,
        "TokensPrompt" = CASE WHEN p_data ? 'TokensPrompt' THEN (p_data->>'TokensPrompt')::INTEGER ELSE "TokensPrompt" END,
        "TokensCompletion" = CASE WHEN p_data ? 'TokensCompletion' THEN (p_data->>'TokensCompletion')::INTEGER ELSE "TokensCompletion" END,
        "TotalCost" = CASE WHEN p_data ? 'TotalCost' THEN (p_data->>'TotalCost')::NUMERIC(18,6) ELSE "TotalCost" END,
        "Success" = CASE WHEN p_data ? 'Success' THEN (p_data->>'Success')::BOOLEAN ELSE "Success" END,
        "ErrorMessage" = CASE WHEN p_data ? 'ErrorMessage' THEN (p_data->>'ErrorMessage') ELSE "ErrorMessage" END,
        "ParentID" = CASE WHEN p_data ? 'ParentID' THEN (p_data->>'ParentID')::UUID ELSE "ParentID" END,
        "RunType" = CASE WHEN p_data ? 'RunType' THEN (p_data->>'RunType') ELSE "RunType" END,
        "ExecutionOrder" = CASE WHEN p_data ? 'ExecutionOrder' THEN (p_data->>'ExecutionOrder')::INTEGER ELSE "ExecutionOrder" END,
        "AgentRunID" = CASE WHEN p_data ? 'AgentRunID' THEN (p_data->>'AgentRunID')::UUID ELSE "AgentRunID" END,
        "Cost" = CASE WHEN p_data ? 'Cost' THEN (p_data->>'Cost')::NUMERIC(19,8) ELSE "Cost" END,
        "CostCurrency" = CASE WHEN p_data ? 'CostCurrency' THEN (p_data->>'CostCurrency') ELSE "CostCurrency" END,
        "TokensUsedRollup" = CASE WHEN p_data ? 'TokensUsedRollup' THEN (p_data->>'TokensUsedRollup')::INTEGER ELSE "TokensUsedRollup" END,
        "TokensPromptRollup" = CASE WHEN p_data ? 'TokensPromptRollup' THEN (p_data->>'TokensPromptRollup')::INTEGER ELSE "TokensPromptRollup" END,
        "TokensCompletionRollup" = CASE WHEN p_data ? 'TokensCompletionRollup' THEN (p_data->>'TokensCompletionRollup')::INTEGER ELSE "TokensCompletionRollup" END,
        "Temperature" = CASE WHEN p_data ? 'Temperature' THEN (p_data->>'Temperature')::NUMERIC(3,2) ELSE "Temperature" END,
        "TopP" = CASE WHEN p_data ? 'TopP' THEN (p_data->>'TopP')::NUMERIC(3,2) ELSE "TopP" END,
        "TopK" = CASE WHEN p_data ? 'TopK' THEN (p_data->>'TopK')::INTEGER ELSE "TopK" END,
        "MinP" = CASE WHEN p_data ? 'MinP' THEN (p_data->>'MinP')::NUMERIC(3,2) ELSE "MinP" END,
        "FrequencyPenalty" = CASE WHEN p_data ? 'FrequencyPenalty' THEN (p_data->>'FrequencyPenalty')::NUMERIC(3,2) ELSE "FrequencyPenalty" END,
        "PresencePenalty" = CASE WHEN p_data ? 'PresencePenalty' THEN (p_data->>'PresencePenalty')::NUMERIC(3,2) ELSE "PresencePenalty" END,
        "Seed" = CASE WHEN p_data ? 'Seed' THEN (p_data->>'Seed')::INTEGER ELSE "Seed" END,
        "StopSequences" = CASE WHEN p_data ? 'StopSequences' THEN (p_data->>'StopSequences') ELSE "StopSequences" END,
        "ResponseFormat" = CASE WHEN p_data ? 'ResponseFormat' THEN (p_data->>'ResponseFormat') ELSE "ResponseFormat" END,
        "LogProbs" = CASE WHEN p_data ? 'LogProbs' THEN (p_data->>'LogProbs')::BOOLEAN ELSE "LogProbs" END,
        "TopLogProbs" = CASE WHEN p_data ? 'TopLogProbs' THEN (p_data->>'TopLogProbs')::INTEGER ELSE "TopLogProbs" END,
        "DescendantCost" = CASE WHEN p_data ? 'DescendantCost' THEN (p_data->>'DescendantCost')::NUMERIC(18,6) ELSE "DescendantCost" END,
        "ValidationAttemptCount" = CASE WHEN p_data ? 'ValidationAttemptCount' THEN (p_data->>'ValidationAttemptCount')::INTEGER ELSE "ValidationAttemptCount" END,
        "SuccessfulValidationCount" = CASE WHEN p_data ? 'SuccessfulValidationCount' THEN (p_data->>'SuccessfulValidationCount')::INTEGER ELSE "SuccessfulValidationCount" END,
        "FinalValidationPassed" = CASE WHEN p_data ? 'FinalValidationPassed' THEN (p_data->>'FinalValidationPassed')::BOOLEAN ELSE "FinalValidationPassed" END,
        "ValidationBehavior" = CASE WHEN p_data ? 'ValidationBehavior' THEN (p_data->>'ValidationBehavior') ELSE "ValidationBehavior" END,
        "RetryStrategy" = CASE WHEN p_data ? 'RetryStrategy' THEN (p_data->>'RetryStrategy') ELSE "RetryStrategy" END,
        "MaxRetriesConfigured" = CASE WHEN p_data ? 'MaxRetriesConfigured' THEN (p_data->>'MaxRetriesConfigured')::INTEGER ELSE "MaxRetriesConfigured" END,
        "FinalValidationError" = CASE WHEN p_data ? 'FinalValidationError' THEN (p_data->>'FinalValidationError') ELSE "FinalValidationError" END,
        "ValidationErrorCount" = CASE WHEN p_data ? 'ValidationErrorCount' THEN (p_data->>'ValidationErrorCount')::INTEGER ELSE "ValidationErrorCount" END,
        "CommonValidationError" = CASE WHEN p_data ? 'CommonValidationError' THEN (p_data->>'CommonValidationError') ELSE "CommonValidationError" END,
        "FirstAttemptAt" = CASE WHEN p_data ? 'FirstAttemptAt' THEN (p_data->>'FirstAttemptAt')::TIMESTAMPTZ ELSE "FirstAttemptAt" END,
        "LastAttemptAt" = CASE WHEN p_data ? 'LastAttemptAt' THEN (p_data->>'LastAttemptAt')::TIMESTAMPTZ ELSE "LastAttemptAt" END,
        "TotalRetryDurationMS" = CASE WHEN p_data ? 'TotalRetryDurationMS' THEN (p_data->>'TotalRetryDurationMS')::INTEGER ELSE "TotalRetryDurationMS" END,
        "ValidationAttempts" = CASE WHEN p_data ? 'ValidationAttempts' THEN (p_data->>'ValidationAttempts') ELSE "ValidationAttempts" END,
        "ValidationSummary" = CASE WHEN p_data ? 'ValidationSummary' THEN (p_data->>'ValidationSummary') ELSE "ValidationSummary" END,
        "FailoverAttempts" = CASE WHEN p_data ? 'FailoverAttempts' THEN (p_data->>'FailoverAttempts')::INTEGER ELSE "FailoverAttempts" END,
        "FailoverErrors" = CASE WHEN p_data ? 'FailoverErrors' THEN (p_data->>'FailoverErrors') ELSE "FailoverErrors" END,
        "FailoverDurations" = CASE WHEN p_data ? 'FailoverDurations' THEN (p_data->>'FailoverDurations') ELSE "FailoverDurations" END,
        "OriginalModelID" = CASE WHEN p_data ? 'OriginalModelID' THEN (p_data->>'OriginalModelID')::UUID ELSE "OriginalModelID" END,
        "OriginalRequestStartTime" = CASE WHEN p_data ? 'OriginalRequestStartTime' THEN (p_data->>'OriginalRequestStartTime')::TIMESTAMPTZ ELSE "OriginalRequestStartTime" END,
        "TotalFailoverDuration" = CASE WHEN p_data ? 'TotalFailoverDuration' THEN (p_data->>'TotalFailoverDuration')::INTEGER ELSE "TotalFailoverDuration" END,
        "RerunFromPromptRunID" = CASE WHEN p_data ? 'RerunFromPromptRunID' THEN (p_data->>'RerunFromPromptRunID')::UUID ELSE "RerunFromPromptRunID" END,
        "ModelSelection" = CASE WHEN p_data ? 'ModelSelection' THEN (p_data->>'ModelSelection') ELSE "ModelSelection" END,
        "Status" = CASE WHEN p_data ? 'Status' THEN (p_data->>'Status') ELSE "Status" END,
        "Cancelled" = CASE WHEN p_data ? 'Cancelled' THEN (p_data->>'Cancelled')::BOOLEAN ELSE "Cancelled" END,
        "CancellationReason" = CASE WHEN p_data ? 'CancellationReason' THEN (p_data->>'CancellationReason') ELSE "CancellationReason" END,
        "ModelPowerRank" = CASE WHEN p_data ? 'ModelPowerRank' THEN (p_data->>'ModelPowerRank')::INTEGER ELSE "ModelPowerRank" END,
        "SelectionStrategy" = CASE WHEN p_data ? 'SelectionStrategy' THEN (p_data->>'SelectionStrategy') ELSE "SelectionStrategy" END,
        "CacheHit" = CASE WHEN p_data ? 'CacheHit' THEN (p_data->>'CacheHit')::BOOLEAN ELSE "CacheHit" END,
        "CacheKey" = CASE WHEN p_data ? 'CacheKey' THEN (p_data->>'CacheKey') ELSE "CacheKey" END,
        "JudgeID" = CASE WHEN p_data ? 'JudgeID' THEN (p_data->>'JudgeID')::UUID ELSE "JudgeID" END,
        "JudgeScore" = CASE WHEN p_data ? 'JudgeScore' THEN (p_data->>'JudgeScore')::DOUBLE PRECISION ELSE "JudgeScore" END,
        "WasSelectedResult" = CASE WHEN p_data ? 'WasSelectedResult' THEN (p_data->>'WasSelectedResult')::BOOLEAN ELSE "WasSelectedResult" END,
        "StreamingEnabled" = CASE WHEN p_data ? 'StreamingEnabled' THEN (p_data->>'StreamingEnabled')::BOOLEAN ELSE "StreamingEnabled" END,
        "FirstTokenTime" = CASE WHEN p_data ? 'FirstTokenTime' THEN (p_data->>'FirstTokenTime')::INTEGER ELSE "FirstTokenTime" END,
        "ErrorDetails" = CASE WHEN p_data ? 'ErrorDetails' THEN (p_data->>'ErrorDetails') ELSE "ErrorDetails" END,
        "ChildPromptID" = CASE WHEN p_data ? 'ChildPromptID' THEN (p_data->>'ChildPromptID')::UUID ELSE "ChildPromptID" END,
        "QueueTime" = CASE WHEN p_data ? 'QueueTime' THEN (p_data->>'QueueTime')::INTEGER ELSE "QueueTime" END,
        "PromptTime" = CASE WHEN p_data ? 'PromptTime' THEN (p_data->>'PromptTime')::INTEGER ELSE "PromptTime" END,
        "CompletionTime" = CASE WHEN p_data ? 'CompletionTime' THEN (p_data->>'CompletionTime')::INTEGER ELSE "CompletionTime" END,
        "ModelSpecificResponseDetails" = CASE WHEN p_data ? 'ModelSpecificResponseDetails' THEN (p_data->>'ModelSpecificResponseDetails') ELSE "ModelSpecificResponseDetails" END,
        "EffortLevel" = CASE WHEN p_data ? 'EffortLevel' THEN (p_data->>'EffortLevel')::INTEGER ELSE "EffortLevel" END,
        "RunName" = CASE WHEN p_data ? 'RunName' THEN (p_data->>'RunName') ELSE "RunName" END,
        "Comments" = CASE WHEN p_data ? 'Comments' THEN (p_data->>'Comments') ELSE "Comments" END,
        "TestRunID" = CASE WHEN p_data ? 'TestRunID' THEN (p_data->>'TestRunID')::UUID ELSE "TestRunID" END,
        "AssistantPrefill" = CASE WHEN p_data ? 'AssistantPrefill' THEN (p_data->>'AssistantPrefill') ELSE "AssistantPrefill" END,
        "TokensCacheRead" = CASE WHEN p_data ? 'TokensCacheRead' THEN (p_data->>'TokensCacheRead')::INTEGER ELSE "TokensCacheRead" END,
        "TokensCacheWrite" = CASE WHEN p_data ? 'TokensCacheWrite' THEN (p_data->>'TokensCacheWrite')::INTEGER ELSE "TokensCacheWrite" END,
        "TokensCacheReadRollup" = CASE WHEN p_data ? 'TokensCacheReadRollup' THEN (p_data->>'TokensCacheReadRollup')::INTEGER ELSE "TokensCacheReadRollup" END,
        "TokensCacheWriteRollup" = CASE WHEN p_data ? 'TokensCacheWriteRollup' THEN (p_data->>'TokensCacheWriteRollup')::INTEGER ELSE "TokensCacheWriteRollup" END,
        "__mj_UpdatedAt" = NOW()
    WHERE "ID" = v_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    IF v_updated_count = 0 THEN
        RETURN;
    END IF;

    RETURN QUERY SELECT * FROM __mj."vwAIPromptRuns" WHERE "ID" = v_id;
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIAgentRequest_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIAgentRequest" ON __mj."AIAgentRequest";
CREATE TRIGGER "trgUpdateAIAgentRequest"
    BEFORE UPDATE ON __mj."AIAgentRequest"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIAgentRequest_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIAgentRunMedia_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIAgentRunMedia" ON __mj."AIAgentRunMedia";
CREATE TRIGGER "trgUpdateAIAgentRunMedia"
    BEFORE UPDATE ON __mj."AIAgentRunMedia"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIAgentRunMedia_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIAgentRunStep_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIAgentRunStep" ON __mj."AIAgentRunStep";
CREATE TRIGGER "trgUpdateAIAgentRunStep"
    BEFORE UPDATE ON __mj."AIAgentRunStep"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIAgentRunStep_func"();

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

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIPromptRun_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIPromptRun" ON __mj."AIPromptRun";
CREATE TRIGGER "trgUpdateAIPromptRun"
    BEFORE UPDATE ON __mj."AIPromptRun"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIPromptRun_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

UPDATE __mj."EntityField"
SET "IsNameField" = FALSE
WHERE "ID" = '0CDCEFDE-FBFE-44CD-ACAF-A1543F309EC4'  -- MJ: AI Agent Runs."ID" (UUID PK)
  AND "IsNameField" = TRUE;


-- CODE GEN RUN OUTPUT
/* Base View SQL for MJ: AI Agent Examples */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Examples
-- Item: vwAIAgentExamples
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Examples
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentExample
-----               PRIMARY KEY: ID
------------------------------------------------------------


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
/* Root ID Function SQL for MJ: AI Agent Notes."ConsolidatedIntoNoteID" */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Notes
-- Item: fnAIAgentNoteConsolidatedIntoNoteID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: "AIAgentNote"."ConsolidatedIntoNoteID"
------------------------------------------------------------;

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
/* Base View SQL for MJ: AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Requests
-- Item: vwAIAgentRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Requests
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentRequest
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentRequests" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Requests
-- Item: Permissions for vwAIAgentRequests
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentRequests" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Requests
-- Item: spCreateAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Agent Requests */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Requests
-- Item: spUpdateAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Requests */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Requests
-- Item: spDeleteAIAgentRequest
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRequest
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Requests */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRequest" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: AI Agent Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Medias
-- Item: vwAIAgentRunMedias
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Agent Run Medias
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIAgentRunMedia
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentRunMedias" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Agent Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Medias
-- Item: Permissions for vwAIAgentRunMedias
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentRunMedias" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Agent Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Medias
-- Item: spCreateAIAgentRunMedia
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRunMedia
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRunMedia" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Agent Run Medias */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRunMedia" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Agent Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Medias
-- Item: spUpdateAIAgentRunMedia
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRunMedia
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRunMedia" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRunMedia" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Agent Run Medias */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Medias
-- Item: spDeleteAIAgentRunMedia
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRunMedia
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRunMedia" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Run Medias */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRunMedia" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Root ID Function SQL for MJ: AI Agent Run Steps."ParentID" */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: fnAIAgentRunStepParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: "AIAgentRunStep"."ParentID"
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentRunSteps" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: Permissions for vwAIAgentRunSteps
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIAgentRunSteps" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: spCreateAIAgentRunStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIAgentRunStep
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRunStep" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Agent Run Steps */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIAgentRunStep" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: spUpdateAIAgentRunStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIAgentRunStep
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRunStep" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIAgentRunStep" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Root ID Function SQL for MJ: AI Agent Runs."ParentRunID" */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: fnAIAgentRunParentRunID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: "AIAgentRun"."ParentRunID"
------------------------------------------------------------;

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
/* spDelete SQL for MJ: AI Agent Run Steps */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Run Steps
-- Item: spDeleteAIAgentRunStep
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIAgentRunStep
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRunStep" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Agent Run Steps */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIAgentRunStep" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* Root ID Function SQL for MJ: AI Prompt Runs."ParentID" */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: fnAIPromptRunParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: "AIPromptRun"."ParentID"
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIPromptRuns" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: Permissions for vwAIPromptRuns
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIPromptRuns" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spCreateAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPromptRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIPromptRun" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Prompt Runs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIPromptRun" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Prompt Runs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompt Runs
-- Item: spUpdateAIPromptRun
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPromptRun
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIPromptRun" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIPromptRun" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
-- ===================== Other =====================

-- Corrective metadata repair for a regression shipped in v5.39.
--
-- Background:
--   The migration V202606021958__v5.39.x__AI_Prompt_Cache_Columns.sql included
--   CodeGen-generated "Set field properties" output produced with the Advanced
--   Generation "Smart Field Identification" (SFI) feature enabled. The SFI LLM
--   incorrectly flagged MJ: AI Agent Runs."ID" (a UUID PRIMARY KEY) as
--   IsNameField=1, so that entity ended up with TWO name fields: ID and RunName.
--
--   EntityInfo."NameField" resolves a multi-name-field entity to the first field by
--   sequence when none is literally named "Name" — that's ID (sequence 1). Every
--   FK that joins to AI Agent Runs (SourceAIAgentRun, OriginatingAgentRun,
--   ResumingAgentRun, AgentRun, ParentRun, LastRun, ...) therefore had its
--   related-entity name virtual field resolve to the UUID PK instead
--   of the TEXT RunName column, corrupting those virtual fields' SQL type
--   (VARCHAR(255) -> UUID) on the next CodeGen run.
--
-- Why this lives in a migration (exception to the usual "no EntityField metadata
-- updates in migrations — CodeGen handles those" rule):
--   * The bad value SHIPPED in a versioned migration, so it is already applied on
--     every database that ran v5.39. CodeGen will NOT repair it: applyNameFieldUpdates
--     only ever SETS IsNameField, never clears it. A forward migration is the only
--     channel that reliably reaches every installed database (metadata-sync runs
--     only in the MJ dev repo, not customer installs).
--   * The CodeGenLib guardrail added alongside this migration (isFieldEligibleForNameField)
--     prevents SFI from re-flagging a PK/UUID as a name field going forward,
--     so this correction will not be undone by a later CodeGen run.
--
-- Effect: RunName becomes the sole IsNameField for MJ: AI Agent Runs (its intended,
-- pre-v5.39 state). RunName is nullable, so the FK name virtual fields go back to
-- nullable VARCHAR(255); when a run has no RunName the virtual field is NULL, which
-- is the correct semantic. The next CodeGen run regenerates the views and entity
-- subclasses with the correct TEXT type.

/* spUpdate Permissions for MJ: AI Agent Examples */

/* spUpdate Permissions for MJ: AI Agent Notes */

/* spUpdate Permissions for MJ: AI Agent Requests */

/* spUpdate Permissions for MJ: AI Agent Run Medias */

/* spUpdate Permissions for MJ: AI Agent Run Steps */

/* spUpdate Permissions for MJ: AI Agent Runs */

/* spUpdate Permissions for MJ: AI Prompt Runs */
