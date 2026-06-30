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

ALTER TABLE __mj."AIPromptRun"
 ADD COLUMN IF NOT EXISTS "TokensCacheRead" INTEGER NULL,
 ADD COLUMN IF NOT EXISTS "TokensCacheWrite" INTEGER NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIPromptRun_PromptID" ON __mj."AIPromptRun" ("PromptID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIPromptRun_ModelID" ON __mj."AIPromptRun" ("ModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIPromptRun_VendorID" ON __mj."AIPromptRun" ("VendorID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIPromptRun_AgentID" ON __mj."AIPromptRun" ("AgentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIPromptRun_ConfigurationID" ON __mj."AIPromptRun" ("ConfigurationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIPromptRun_ParentID" ON __mj."AIPromptRun" ("ParentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIPromptRun_AgentRunID" ON __mj."AIPromptRun" ("AgentRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIPromptRun_OriginalModelID" ON __mj."AIPromptRun" ("OriginalModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIPromptRun_RerunFromPromptRunID" ON __mj."AIPromptRun" ("RerunFromPromptRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIPromptRun_JudgeID" ON __mj."AIPromptRun" ("JudgeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIPromptRun_ChildPromptID" ON __mj."AIPromptRun" ("ChildPromptID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIPromptRun_TestRunID" ON __mj."AIPromptRun" ("TestRunID");


-- ===================== Helper Functions (fn*) =====================

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

-- ============================================================================
-- spCreateAIPromptRun: 158 typed parameters exceeds PostgreSQL's hard
-- FUNC_MAX_ARGS limit (100). This CRUD sproc is created in
-- single-JSONB-argument shape (p_data JSONB) — the same shape the MJ runtime
-- invokes via crudSprocFieldRules.useJsonArgShape() and that
-- PostgreSQLCodeGenProvider emits natively. The typed-argument definition is
-- skipped here (no DROP emitted, so the JSON-arg version is preserved); the
-- JSON-arg definition is supplied by a pg-only CodeGen migration.
-- ============================================================================

-- ============================================================================
-- spUpdateAIPromptRun: 158 typed parameters exceeds PostgreSQL's hard
-- FUNC_MAX_ARGS limit (100). This CRUD sproc is created in
-- single-JSONB-argument shape (p_data JSONB) — the same shape the MJ runtime
-- invokes via crudSprocFieldRules.useJsonArgShape() and that
-- PostgreSQLCodeGenProvider emits natively. The typed-argument definition is
-- skipped here (no DROP emitted, so the JSON-arg version is preserved); the
-- JSON-arg definition is supplied by a pg-only CodeGen migration.
-- ============================================================================

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
    p_MJContentProcessRunPromptRuns_AIPromptRunIDID UUID;
BEGIN
-- Cascade delete from AIPromptRunMedia using cursor to call spDeleteAIPromptRunMedia

    FOR _rec IN SELECT "ID" FROM __mj."AIPromptRunMedia" WHERE "PromptRunID" = p_ID
    LOOP
        p_MJAIPromptRunMedias_PromptRunIDID := _rec."ID";
        PERFORM __mj."spDeleteAIPromptRunMedia"(p_ID => p_MJAIPromptRunMedias_PromptRunIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite" FROM __mj."AIPromptRun" WHERE "ParentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIPromptRuns_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_ParentIDID, p_PromptID => p_MJAIPromptRuns_ParentID_PromptID, p_ModelID => p_MJAIPromptRuns_ParentID_ModelID, p_VendorID => p_MJAIPromptRuns_ParentID_VendorID, p_AgentID => p_MJAIPromptRuns_ParentID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_ParentID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_ParentID_RunAt, p_CompletedAt => p_MJAIPromptRuns_ParentID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_ParentID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_ParentID_Messages, p_Result => p_MJAIPromptRuns_ParentID_Result, p_TokensUsed => p_MJAIPromptRuns_ParentID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_ParentID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_ParentID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_ParentID_TotalCost, p_Success => p_MJAIPromptRuns_ParentID_Success, p_ErrorMessage => p_MJAIPromptRuns_ParentID_ErrorMessage, p_ParentID_Clear => 1, p_ParentID => p_MJAIPromptRuns_ParentID_ParentID, p_RunType => p_MJAIPromptRuns_ParentID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_ParentID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_ParentID_AgentRunID, p_Cost => p_MJAIPromptRuns_ParentID_Cost, p_CostCurrency => p_MJAIPromptRuns_ParentID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_ParentID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_ParentID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_ParentID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_ParentID_Temperature, p_TopP => p_MJAIPromptRuns_ParentID_TopP, p_TopK => p_MJAIPromptRuns_ParentID_TopK, p_MinP => p_MJAIPromptRuns_ParentID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_ParentID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_ParentID_PresencePenalty, p_Seed => p_MJAIPromptRuns_ParentID_Seed, p_StopSequences => p_MJAIPromptRuns_ParentID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_ParentID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_ParentID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_ParentID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_ParentID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_ParentID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_ParentID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_ParentID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_ParentID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_ParentID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_ParentID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_ParentID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_ParentID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_ParentID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_ParentID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_ParentID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_ParentID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_ParentID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_ParentID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_ParentID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_ParentID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_ParentID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_ParentID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_ParentID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_ParentID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_ParentID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_ParentID_ModelSelection, p_Status => p_MJAIPromptRuns_ParentID_Status, p_Cancelled => p_MJAIPromptRuns_ParentID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_ParentID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_ParentID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_ParentID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_ParentID_CacheHit, p_CacheKey => p_MJAIPromptRuns_ParentID_CacheKey, p_JudgeID => p_MJAIPromptRuns_ParentID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_ParentID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_ParentID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_ParentID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_ParentID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_ParentID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_ParentID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_ParentID_QueueTime, p_PromptTime => p_MJAIPromptRuns_ParentID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_ParentID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_ParentID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_ParentID_EffortLevel, p_RunName => p_MJAIPromptRuns_ParentID_RunName, p_Comments => p_MJAIPromptRuns_ParentID_Comments, p_TestRunID => p_MJAIPromptRuns_ParentID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_ParentID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_ParentID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_ParentID_TokensCacheWrite);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite" FROM __mj."AIPromptRun" WHERE "RerunFromPromptRunID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_RerunFromPromptRunIDID, p_PromptID => p_MJAIPromptRuns_RerunFromPromptRunID_PromptID, p_ModelID => p_MJAIPromptRuns_RerunFromPromptRunID_ModelID, p_VendorID => p_MJAIPromptRuns_RerunFromPromptRunID_VendorID, p_AgentID => p_MJAIPromptRuns_RerunFromPromptRunID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_RerunFromPromptRunID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_RerunFromPromptRunID_RunAt, p_CompletedAt => p_MJAIPromptRuns_RerunFromPromptRunID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_RerunFromPromptRunID_Messages, p_Result => p_MJAIPromptRuns_RerunFromPromptRunID_Result, p_TokensUsed => p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_RerunFromPromptRunID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_RerunFromPromptRunID_TotalCost, p_Success => p_MJAIPromptRuns_RerunFromPromptRunID_Success, p_ErrorMessage => p_MJAIPromptRuns_RerunFromPromptRunID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_RerunFromPromptRunID_ParentID, p_RunType => p_MJAIPromptRuns_RerunFromPromptRunID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_RerunFromPromptRunID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_RerunFromPromptRunID_AgentRunID, p_Cost => p_MJAIPromptRuns_RerunFromPromptRunID_Cost, p_CostCurrency => p_MJAIPromptRuns_RerunFromPromptRunID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_RerunFromPromptRunID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_RerunFromPromptRunID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_RerunFromPromptRunID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_RerunFromPromptRunID_Temperature, p_TopP => p_MJAIPromptRuns_RerunFromPromptRunID_TopP, p_TopK => p_MJAIPromptRuns_RerunFromPromptRunID_TopK, p_MinP => p_MJAIPromptRuns_RerunFromPromptRunID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_RerunFromPromptRunID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_RerunFromPromptRunID_PresencePenalty, p_Seed => p_MJAIPromptRuns_RerunFromPromptRunID_Seed, p_StopSequences => p_MJAIPromptRuns_RerunFromPromptRunID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_RerunFromPromptRunID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_RerunFromPromptRunID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_RerunFromPromptRunID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_RerunFromPromptRunID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_RerunFromPromptRunID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_RerunFromPromptRunID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_RerunFromPromptRunID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_RerunFromPromptRunID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_RerunFromPromptRunID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_RerunFromPromptRunID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_RerunFromPromptRunID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_RerunFromPromptRunID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_RerunFromPromptRunID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_RerunFromPromptRunID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_RerunFromPromptRunID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_RerunFromPromptRunID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_RerunFromPromptRunID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_RerunFromPromptRunID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_RerunFromPromptRunID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_RerunFromPromptRunID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_RerunFromPromptRunID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_RerunFromPromptRunID_TotalFailoverDuration, p_RerunFromPromptRunID_Clear => 1, p_RerunFromPromptRunID => p_MJAIPromptRuns_RerunFromPromptRunID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_RerunFromPromptRunID_ModelSelection, p_Status => p_MJAIPromptRuns_RerunFromPromptRunID_Status, p_Cancelled => p_MJAIPromptRuns_RerunFromPromptRunID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_RerunFromPromptRunID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_RerunFromPromptRunID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_RerunFromPromptRunID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_RerunFromPromptRunID_CacheHit, p_CacheKey => p_MJAIPromptRuns_RerunFromPromptRunID_CacheKey, p_JudgeID => p_MJAIPromptRuns_RerunFromPromptRunID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_RerunFromPromptRunID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_RerunFromPromptRunID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_RerunFromPromptRunID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_RerunFromPromptRunID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_RerunFromPromptRunID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_RerunFromPromptRunID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_RerunFromPromptRunID_QueueTime, p_PromptTime => p_MJAIPromptRuns_RerunFromPromptRunID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_RerunFromPromptRunID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_RerunFromPromptRunID_ModelSpecificRespon_874f7c, p_EffortLevel => p_MJAIPromptRuns_RerunFromPromptRunID_EffortLevel, p_RunName => p_MJAIPromptRuns_RerunFromPromptRunID_RunName, p_Comments => p_MJAIPromptRuns_RerunFromPromptRunID_Comments, p_TestRunID => p_MJAIPromptRuns_RerunFromPromptRunID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_RerunFromPromptRunID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_RerunFromPromptRunID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_RerunFromPromptRunID_TokensCacheWrite);

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


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID" FROM __mj."AIAgentRun" WHERE "ParentRunID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ParentRunID_ParentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ParentRunIDID, p_AgentID => p_MJAIAgentRuns_ParentRunID_AgentID, p_ParentRunID_Clear => 1, p_ParentRunID => p_MJAIAgentRuns_ParentRunID_ParentRunID, p_Status => p_MJAIAgentRuns_ParentRunID_Status, p_StartedAt => p_MJAIAgentRuns_ParentRunID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ParentRunID_CompletedAt, p_Success => p_MJAIAgentRuns_ParentRunID_Success, p_ErrorMessage => p_MJAIAgentRuns_ParentRunID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_ParentRunID_ConversationID, p_UserID => p_MJAIAgentRuns_ParentRunID_UserID, p_Result => p_MJAIAgentRuns_ParentRunID_Result, p_AgentState => p_MJAIAgentRuns_ParentRunID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ParentRunID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_ParentRunID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_ParentRunID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ParentRunID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ParentRunID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ParentRunID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ParentRunID_FinalPayload, p_Message => p_MJAIAgentRuns_ParentRunID_Message, p_LastRunID => p_MJAIAgentRuns_ParentRunID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ParentRunID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ParentRunID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_ParentRunID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ParentRunID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ParentRunID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ParentRunID_Data, p_Verbose => p_MJAIAgentRuns_ParentRunID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ParentRunID_EffortLevel, p_RunName => p_MJAIAgentRuns_ParentRunID_RunName, p_Comments => p_MJAIAgentRuns_ParentRunID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ParentRunID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ParentRunID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ParentRunID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ParentRunID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ParentRunID_CompanyID);

    END LOOP;

    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID" FROM __mj."AIAgentRun" WHERE "LastRunID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgentRuns_LastRunID_LastRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_LastRunIDID, p_AgentID => p_MJAIAgentRuns_LastRunID_AgentID, p_ParentRunID => p_MJAIAgentRuns_LastRunID_ParentRunID, p_Status => p_MJAIAgentRuns_LastRunID_Status, p_StartedAt => p_MJAIAgentRuns_LastRunID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_LastRunID_CompletedAt, p_Success => p_MJAIAgentRuns_LastRunID_Success, p_ErrorMessage => p_MJAIAgentRuns_LastRunID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_LastRunID_ConversationID, p_UserID => p_MJAIAgentRuns_LastRunID_UserID, p_Result => p_MJAIAgentRuns_LastRunID_Result, p_AgentState => p_MJAIAgentRuns_LastRunID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_LastRunID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_LastRunID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_LastRunID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_LastRunID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_LastRunID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_LastRunID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_LastRunID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_LastRunID_FinalPayload, p_Message => p_MJAIAgentRuns_LastRunID_Message, p_LastRunID_Clear => 1, p_LastRunID => p_MJAIAgentRuns_LastRunID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_LastRunID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_LastRunID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_LastRunID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_LastRunID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_LastRunID_OverrideVendorID, p_Data => p_MJAIAgentRuns_LastRunID_Data, p_Verbose => p_MJAIAgentRuns_LastRunID_Verbose, p_EffortLevel => p_MJAIAgentRuns_LastRunID_EffortLevel, p_RunName => p_MJAIAgentRuns_LastRunID_RunName, p_Comments => p_MJAIAgentRuns_LastRunID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_LastRunID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_LastRunID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_LastRunID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_LastRunID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_LastRunID_CompanyID);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite" FROM __mj."AIPromptRun" WHERE "AgentRunID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIPromptRuns_AgentRunID_AgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_AgentRunIDID, p_PromptID => p_MJAIPromptRuns_AgentRunID_PromptID, p_ModelID => p_MJAIPromptRuns_AgentRunID_ModelID, p_VendorID => p_MJAIPromptRuns_AgentRunID_VendorID, p_AgentID => p_MJAIPromptRuns_AgentRunID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_AgentRunID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_AgentRunID_RunAt, p_CompletedAt => p_MJAIPromptRuns_AgentRunID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_AgentRunID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_AgentRunID_Messages, p_Result => p_MJAIPromptRuns_AgentRunID_Result, p_TokensUsed => p_MJAIPromptRuns_AgentRunID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_AgentRunID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_AgentRunID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_AgentRunID_TotalCost, p_Success => p_MJAIPromptRuns_AgentRunID_Success, p_ErrorMessage => p_MJAIPromptRuns_AgentRunID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_AgentRunID_ParentID, p_RunType => p_MJAIPromptRuns_AgentRunID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_AgentRunID_ExecutionOrder, p_AgentRunID_Clear => 1, p_AgentRunID => p_MJAIPromptRuns_AgentRunID_AgentRunID, p_Cost => p_MJAIPromptRuns_AgentRunID_Cost, p_CostCurrency => p_MJAIPromptRuns_AgentRunID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_AgentRunID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_AgentRunID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_AgentRunID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_AgentRunID_Temperature, p_TopP => p_MJAIPromptRuns_AgentRunID_TopP, p_TopK => p_MJAIPromptRuns_AgentRunID_TopK, p_MinP => p_MJAIPromptRuns_AgentRunID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_AgentRunID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_AgentRunID_PresencePenalty, p_Seed => p_MJAIPromptRuns_AgentRunID_Seed, p_StopSequences => p_MJAIPromptRuns_AgentRunID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_AgentRunID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_AgentRunID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_AgentRunID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_AgentRunID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_AgentRunID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_AgentRunID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_AgentRunID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_AgentRunID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_AgentRunID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_AgentRunID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_AgentRunID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_AgentRunID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_AgentRunID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_AgentRunID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_AgentRunID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_AgentRunID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_AgentRunID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_AgentRunID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_AgentRunID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_AgentRunID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_AgentRunID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_AgentRunID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_AgentRunID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_AgentRunID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_AgentRunID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_AgentRunID_ModelSelection, p_Status => p_MJAIPromptRuns_AgentRunID_Status, p_Cancelled => p_MJAIPromptRuns_AgentRunID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_AgentRunID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_AgentRunID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_AgentRunID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_AgentRunID_CacheHit, p_CacheKey => p_MJAIPromptRuns_AgentRunID_CacheKey, p_JudgeID => p_MJAIPromptRuns_AgentRunID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_AgentRunID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_AgentRunID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_AgentRunID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_AgentRunID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_AgentRunID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_AgentRunID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_AgentRunID_QueueTime, p_PromptTime => p_MJAIPromptRuns_AgentRunID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_AgentRunID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_AgentRunID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_AgentRunID_EffortLevel, p_RunName => p_MJAIPromptRuns_AgentRunID_RunName, p_Comments => p_MJAIPromptRuns_AgentRunID_Comments, p_TestRunID => p_MJAIPromptRuns_AgentRunID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_AgentRunID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_AgentRunID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_AgentRunID_TokensCacheWrite);

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
    p_MJAIAgentPermissions_AgentIDID UUID;
    p_MJAIAgentPrompts_AgentIDID UUID;
    p_MJAIAgentRelationships_AgentIDID UUID;
    p_MJAIAgentRelationships_SubAgentIDID UUID;
    p_MJAIAgentRequests_AgentIDID UUID;
    p_MJAIAgentRuns_AgentIDID UUID;
    p_MJAIAgentSearchScopes_AgentIDID UUID;
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


    FOR _rec IN SELECT "ID", "AgentID", "AgentNoteTypeID", "Note", "UserID", "Type", "IsAutoGenerated", "Comments", "Status", "SourceConversationID", "SourceConversationDetailID", "SourceAIAgentRunID", "CompanyID", "EmbeddingVector", "EmbeddingModelID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "LastAccessedAt", "AccessCount", "ExpiresAt", "ConsolidatedIntoNoteID", "ConsolidationCount", "DerivedFromNoteIDs", "ProtectionTier", "ImportanceScore" FROM __mj."AIAgentNote" WHERE "AgentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgentNotes_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentNote"(p_ID => p_MJAIAgentNotes_AgentIDID, p_AgentID_Clear => 1, p_AgentID => p_MJAIAgentNotes_AgentID_AgentID, p_AgentNoteTypeID => p_MJAIAgentNotes_AgentID_AgentNoteTypeID, p_Note => p_MJAIAgentNotes_AgentID_Note, p_UserID => p_MJAIAgentNotes_AgentID_UserID, p_Type => p_MJAIAgentNotes_AgentID_Type, p_IsAutoGenerated => p_MJAIAgentNotes_AgentID_IsAutoGenerated, p_Comments => p_MJAIAgentNotes_AgentID_Comments, p_Status => p_MJAIAgentNotes_AgentID_Status, p_SourceConversationID => p_MJAIAgentNotes_AgentID_SourceConversationID, p_SourceConversationDetailID => p_MJAIAgentNotes_AgentID_SourceConversationDetailID, p_SourceAIAgentRunID => p_MJAIAgentNotes_AgentID_SourceAIAgentRunID, p_CompanyID => p_MJAIAgentNotes_AgentID_CompanyID, p_EmbeddingVector => p_MJAIAgentNotes_AgentID_EmbeddingVector, p_EmbeddingModelID => p_MJAIAgentNotes_AgentID_EmbeddingModelID, p_PrimaryScopeEntityID => p_MJAIAgentNotes_AgentID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentNotes_AgentID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentNotes_AgentID_SecondaryScopes, p_LastAccessedAt => p_MJAIAgentNotes_AgentID_LastAccessedAt, p_AccessCount => p_MJAIAgentNotes_AgentID_AccessCount, p_ExpiresAt => p_MJAIAgentNotes_AgentID_ExpiresAt, p_ConsolidatedIntoNoteID => p_MJAIAgentNotes_AgentID_ConsolidatedIntoNoteID, p_ConsolidationCount => p_MJAIAgentNotes_AgentID_ConsolidationCount, p_DerivedFromNoteIDs => p_MJAIAgentNotes_AgentID_DerivedFromNoteIDs, p_ProtectionTier => p_MJAIAgentNotes_AgentID_ProtectionTier, p_ImportanceScore => p_MJAIAgentNotes_AgentID_ImportanceScore);

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


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID", "AllowEphemeralClientTools", "DefaultStorageAccountID", "SearchScopeAccess", "AcceptUnregisteredFiles" FROM __mj."AIAgent" WHERE "ParentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgents_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_ID => p_MJAIAgents_ParentIDID, p_Name => p_MJAIAgents_ParentID_Name, p_Description => p_MJAIAgents_ParentID_Description, p_LogoURL => p_MJAIAgents_ParentID_LogoURL, p_ParentID_Clear => 1, p_ParentID => p_MJAIAgents_ParentID_ParentID, p_ExposeAsAction => p_MJAIAgents_ParentID_ExposeAsAction, p_ExecutionOrder => p_MJAIAgents_ParentID_ExecutionOrder, p_ExecutionMode => p_MJAIAgents_ParentID_ExecutionMode, p_EnableContextCompression => p_MJAIAgents_ParentID_EnableContextCompression, p_ContextCompressionMessageThreshold => p_MJAIAgents_ParentID_ContextCompressionMessageThreshold, p_ContextCompressionPromptID => p_MJAIAgents_ParentID_ContextCompressionPromptID, p_ContextCompressionMessageRetentionCount => p_MJAIAgents_ParentID_ContextCompressionMessageRetentionCount, p_TypeID => p_MJAIAgents_ParentID_TypeID, p_Status => p_MJAIAgents_ParentID_Status, p_DriverClass => p_MJAIAgents_ParentID_DriverClass, p_IconClass => p_MJAIAgents_ParentID_IconClass, p_ModelSelectionMode => p_MJAIAgents_ParentID_ModelSelectionMode, p_PayloadDownstreamPaths => p_MJAIAgents_ParentID_PayloadDownstreamPaths, p_PayloadUpstreamPaths => p_MJAIAgents_ParentID_PayloadUpstreamPaths, p_PayloadSelfReadPaths => p_MJAIAgents_ParentID_PayloadSelfReadPaths, p_PayloadSelfWritePaths => p_MJAIAgents_ParentID_PayloadSelfWritePaths, p_PayloadScope => p_MJAIAgents_ParentID_PayloadScope, p_FinalPayloadValidation => p_MJAIAgents_ParentID_FinalPayloadValidation, p_FinalPayloadValidationMode => p_MJAIAgents_ParentID_FinalPayloadValidationMode, p_FinalPayloadValidationMaxRetries => p_MJAIAgents_ParentID_FinalPayloadValidationMaxRetries, p_MaxCostPerRun => p_MJAIAgents_ParentID_MaxCostPerRun, p_MaxTokensPerRun => p_MJAIAgents_ParentID_MaxTokensPerRun, p_MaxIterationsPerRun => p_MJAIAgents_ParentID_MaxIterationsPerRun, p_MaxTimePerRun => p_MJAIAgents_ParentID_MaxTimePerRun, p_MinExecutionsPerRun => p_MJAIAgents_ParentID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgents_ParentID_MaxExecutionsPerRun, p_StartingPayloadValidation => p_MJAIAgents_ParentID_StartingPayloadValidation, p_StartingPayloadValidationMode => p_MJAIAgents_ParentID_StartingPayloadValidationMode, p_DefaultPromptEffortLevel => p_MJAIAgents_ParentID_DefaultPromptEffortLevel, p_ChatHandlingOption => p_MJAIAgents_ParentID_ChatHandlingOption, p_DefaultArtifactTypeID => p_MJAIAgents_ParentID_DefaultArtifactTypeID, p_OwnerUserID => p_MJAIAgents_ParentID_OwnerUserID, p_InvocationMode => p_MJAIAgents_ParentID_InvocationMode, p_ArtifactCreationMode => p_MJAIAgents_ParentID_ArtifactCreationMode, p_FunctionalRequirements => p_MJAIAgents_ParentID_FunctionalRequirements, p_TechnicalDesign => p_MJAIAgents_ParentID_TechnicalDesign, p_InjectNotes => p_MJAIAgents_ParentID_InjectNotes, p_MaxNotesToInject => p_MJAIAgents_ParentID_MaxNotesToInject, p_NoteInjectionStrategy => p_MJAIAgents_ParentID_NoteInjectionStrategy, p_InjectExamples => p_MJAIAgents_ParentID_InjectExamples, p_MaxExamplesToInject => p_MJAIAgents_ParentID_MaxExamplesToInject, p_ExampleInjectionStrategy => p_MJAIAgents_ParentID_ExampleInjectionStrategy, p_IsRestricted => p_MJAIAgents_ParentID_IsRestricted, p_MessageMode => p_MJAIAgents_ParentID_MessageMode, p_MaxMessages => p_MJAIAgents_ParentID_MaxMessages, p_AttachmentStorageProviderID => p_MJAIAgents_ParentID_AttachmentStorageProviderID, p_AttachmentRootPath => p_MJAIAgents_ParentID_AttachmentRootPath, p_InlineStorageThresholdBytes => p_MJAIAgents_ParentID_InlineStorageThresholdBytes, p_AgentTypePromptParams => p_MJAIAgents_ParentID_AgentTypePromptParams, p_ScopeConfig => p_MJAIAgents_ParentID_ScopeConfig, p_NoteRetentionDays => p_MJAIAgents_ParentID_NoteRetentionDays, p_ExampleRetentionDays => p_MJAIAgents_ParentID_ExampleRetentionDays, p_AutoArchiveEnabled => p_MJAIAgents_ParentID_AutoArchiveEnabled, p_RerankerConfiguration => p_MJAIAgents_ParentID_RerankerConfiguration, p_CategoryID => p_MJAIAgents_ParentID_CategoryID, p_AllowEphemeralClientTools => p_MJAIAgents_ParentID_AllowEphemeralClientTools, p_DefaultStorageAccountID => p_MJAIAgents_ParentID_DefaultStorageAccountID, p_SearchScopeAccess => p_MJAIAgents_ParentID_SearchScopeAccess, p_AcceptUnregisteredFiles => p_MJAIAgents_ParentID_AcceptUnregisteredFiles);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite" FROM __mj."AIPromptRun" WHERE "AgentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIPromptRuns_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_AgentIDID, p_PromptID => p_MJAIPromptRuns_AgentID_PromptID, p_ModelID => p_MJAIPromptRuns_AgentID_ModelID, p_VendorID => p_MJAIPromptRuns_AgentID_VendorID, p_AgentID_Clear => 1, p_AgentID => p_MJAIPromptRuns_AgentID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_AgentID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_AgentID_RunAt, p_CompletedAt => p_MJAIPromptRuns_AgentID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_AgentID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_AgentID_Messages, p_Result => p_MJAIPromptRuns_AgentID_Result, p_TokensUsed => p_MJAIPromptRuns_AgentID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_AgentID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_AgentID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_AgentID_TotalCost, p_Success => p_MJAIPromptRuns_AgentID_Success, p_ErrorMessage => p_MJAIPromptRuns_AgentID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_AgentID_ParentID, p_RunType => p_MJAIPromptRuns_AgentID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_AgentID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_AgentID_AgentRunID, p_Cost => p_MJAIPromptRuns_AgentID_Cost, p_CostCurrency => p_MJAIPromptRuns_AgentID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_AgentID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_AgentID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_AgentID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_AgentID_Temperature, p_TopP => p_MJAIPromptRuns_AgentID_TopP, p_TopK => p_MJAIPromptRuns_AgentID_TopK, p_MinP => p_MJAIPromptRuns_AgentID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_AgentID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_AgentID_PresencePenalty, p_Seed => p_MJAIPromptRuns_AgentID_Seed, p_StopSequences => p_MJAIPromptRuns_AgentID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_AgentID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_AgentID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_AgentID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_AgentID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_AgentID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_AgentID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_AgentID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_AgentID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_AgentID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_AgentID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_AgentID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_AgentID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_AgentID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_AgentID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_AgentID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_AgentID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_AgentID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_AgentID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_AgentID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_AgentID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_AgentID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_AgentID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_AgentID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_AgentID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_AgentID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_AgentID_ModelSelection, p_Status => p_MJAIPromptRuns_AgentID_Status, p_Cancelled => p_MJAIPromptRuns_AgentID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_AgentID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_AgentID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_AgentID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_AgentID_CacheHit, p_CacheKey => p_MJAIPromptRuns_AgentID_CacheKey, p_JudgeID => p_MJAIPromptRuns_AgentID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_AgentID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_AgentID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_AgentID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_AgentID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_AgentID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_AgentID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_AgentID_QueueTime, p_PromptTime => p_MJAIPromptRuns_AgentID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_AgentID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_AgentID_EffortLevel, p_RunName => p_MJAIPromptRuns_AgentID_RunName, p_Comments => p_MJAIPromptRuns_AgentID_Comments, p_TestRunID => p_MJAIPromptRuns_AgentID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_AgentID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_AgentID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_AgentID_TokensCacheWrite);

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


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged" FROM __mj."ConversationDetail" WHERE "AgentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJConversationDetails_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_AgentIDID, p_ConversationID => p_MJConversationDetails_AgentID_ConversationID, p_ExternalID => p_MJConversationDetails_AgentID_ExternalID, p_Role => p_MJConversationDetails_AgentID_Role, p_Message => p_MJConversationDetails_AgentID_Message, p_Error => p_MJConversationDetails_AgentID_Error, p_HiddenToUser => p_MJConversationDetails_AgentID_HiddenToUser, p_UserRating => p_MJConversationDetails_AgentID_UserRating, p_UserFeedback => p_MJConversationDetails_AgentID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_AgentID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_AgentID_SummaryOfEarlierConversation, p_UserID => p_MJConversationDetails_AgentID_UserID, p_ArtifactID => p_MJConversationDetails_AgentID_ArtifactID, p_ArtifactVersionID => p_MJConversationDetails_AgentID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_AgentID_CompletionTime, p_IsPinned => p_MJConversationDetails_AgentID_IsPinned, p_ParentID => p_MJConversationDetails_AgentID_ParentID, p_AgentID_Clear => 1, p_AgentID => p_MJConversationDetails_AgentID_AgentID, p_Status => p_MJConversationDetails_AgentID_Status, p_SuggestedResponses => p_MJConversationDetails_AgentID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_AgentID_TestRunID, p_ResponseForm => p_MJConversationDetails_AgentID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_AgentID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_AgentID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_AgentID_OriginalMessageChanged);

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


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID" FROM __mj."AIAgentRun" WHERE "ConfigurationID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ConfigurationID_ConfigurationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ConfigurationIDID, p_AgentID => p_MJAIAgentRuns_ConfigurationID_AgentID, p_ParentRunID => p_MJAIAgentRuns_ConfigurationID_ParentRunID, p_Status => p_MJAIAgentRuns_ConfigurationID_Status, p_StartedAt => p_MJAIAgentRuns_ConfigurationID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ConfigurationID_CompletedAt, p_Success => p_MJAIAgentRuns_ConfigurationID_Success, p_ErrorMessage => p_MJAIAgentRuns_ConfigurationID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_ConfigurationID_ConversationID, p_UserID => p_MJAIAgentRuns_ConfigurationID_UserID, p_Result => p_MJAIAgentRuns_ConfigurationID_Result, p_AgentState => p_MJAIAgentRuns_ConfigurationID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ConfigurationID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ConfigurationID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_ConfigurationID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_ConfigurationID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ConfigurationID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ConfigurationID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ConfigurationID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ConfigurationID_FinalPayload, p_Message => p_MJAIAgentRuns_ConfigurationID_Message, p_LastRunID => p_MJAIAgentRuns_ConfigurationID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ConfigurationID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ConfigurationID_TotalPromptIterations, p_ConfigurationID_Clear => 1, p_ConfigurationID => p_MJAIAgentRuns_ConfigurationID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ConfigurationID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ConfigurationID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ConfigurationID_Data, p_Verbose => p_MJAIAgentRuns_ConfigurationID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ConfigurationID_EffortLevel, p_RunName => p_MJAIAgentRuns_ConfigurationID_RunName, p_Comments => p_MJAIAgentRuns_ConfigurationID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ConfigurationID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ConfigurationID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ConfigurationID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ConfigurationID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ConfigurationID_CompanyID);

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


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite" FROM __mj."AIPromptRun" WHERE "ConfigurationID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIPromptRuns_ConfigurationID_ConfigurationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_ConfigurationIDID, p_PromptID => p_MJAIPromptRuns_ConfigurationID_PromptID, p_ModelID => p_MJAIPromptRuns_ConfigurationID_ModelID, p_VendorID => p_MJAIPromptRuns_ConfigurationID_VendorID, p_AgentID => p_MJAIPromptRuns_ConfigurationID_AgentID, p_ConfigurationID_Clear => 1, p_ConfigurationID => p_MJAIPromptRuns_ConfigurationID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_ConfigurationID_RunAt, p_CompletedAt => p_MJAIPromptRuns_ConfigurationID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_ConfigurationID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_ConfigurationID_Messages, p_Result => p_MJAIPromptRuns_ConfigurationID_Result, p_TokensUsed => p_MJAIPromptRuns_ConfigurationID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_ConfigurationID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_ConfigurationID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_ConfigurationID_TotalCost, p_Success => p_MJAIPromptRuns_ConfigurationID_Success, p_ErrorMessage => p_MJAIPromptRuns_ConfigurationID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_ConfigurationID_ParentID, p_RunType => p_MJAIPromptRuns_ConfigurationID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_ConfigurationID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_ConfigurationID_AgentRunID, p_Cost => p_MJAIPromptRuns_ConfigurationID_Cost, p_CostCurrency => p_MJAIPromptRuns_ConfigurationID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_ConfigurationID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_ConfigurationID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_ConfigurationID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_ConfigurationID_Temperature, p_TopP => p_MJAIPromptRuns_ConfigurationID_TopP, p_TopK => p_MJAIPromptRuns_ConfigurationID_TopK, p_MinP => p_MJAIPromptRuns_ConfigurationID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_ConfigurationID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_ConfigurationID_PresencePenalty, p_Seed => p_MJAIPromptRuns_ConfigurationID_Seed, p_StopSequences => p_MJAIPromptRuns_ConfigurationID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_ConfigurationID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_ConfigurationID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_ConfigurationID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_ConfigurationID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_ConfigurationID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_ConfigurationID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_ConfigurationID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_ConfigurationID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_ConfigurationID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_ConfigurationID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_ConfigurationID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_ConfigurationID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_ConfigurationID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_ConfigurationID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_ConfigurationID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_ConfigurationID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_ConfigurationID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_ConfigurationID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_ConfigurationID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_ConfigurationID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_ConfigurationID_ModelSelection, p_Status => p_MJAIPromptRuns_ConfigurationID_Status, p_Cancelled => p_MJAIPromptRuns_ConfigurationID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_ConfigurationID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_ConfigurationID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_ConfigurationID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_ConfigurationID_CacheHit, p_CacheKey => p_MJAIPromptRuns_ConfigurationID_CacheKey, p_JudgeID => p_MJAIPromptRuns_ConfigurationID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_ConfigurationID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_ConfigurationID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_ConfigurationID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_ConfigurationID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_ConfigurationID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_ConfigurationID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_ConfigurationID_QueueTime, p_PromptTime => p_MJAIPromptRuns_ConfigurationID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_ConfigurationID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_ConfigurationID_EffortLevel, p_RunName => p_MJAIPromptRuns_ConfigurationID_RunName, p_Comments => p_MJAIPromptRuns_ConfigurationID_Comments, p_TestRunID => p_MJAIPromptRuns_ConfigurationID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_ConfigurationID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_ConfigurationID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_ConfigurationID_TokensCacheWrite);

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


    FOR _rec IN SELECT "ID", "Name", "Description", "SystemPromptID", "IsActive", "AgentPromptPlaceholder", "DriverClass", "UIFormSectionKey", "UIFormKey", "UIFormSectionExpandedByDefault", "PromptParamsSchema", "AssignmentStrategy", "DefaultStorageAccountID" FROM __mj."AIAgentType" WHERE "SystemPromptID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgentTypes_SystemPromptID_SystemPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentType"(p_ID => p_MJAIAgentTypes_SystemPromptIDID, p_Name => p_MJAIAgentTypes_SystemPromptID_Name, p_Description => p_MJAIAgentTypes_SystemPromptID_Description, p_SystemPromptID_Clear => 1, p_SystemPromptID => p_MJAIAgentTypes_SystemPromptID_SystemPromptID, p_IsActive => p_MJAIAgentTypes_SystemPromptID_IsActive, p_AgentPromptPlaceholder => p_MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, p_DriverClass => p_MJAIAgentTypes_SystemPromptID_DriverClass, p_UIFormSectionKey => p_MJAIAgentTypes_SystemPromptID_UIFormSectionKey, p_UIFormKey => p_MJAIAgentTypes_SystemPromptID_UIFormKey, p_UIFormSectionExpandedByDefault => p_MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, p_PromptParamsSchema => p_MJAIAgentTypes_SystemPromptID_PromptParamsSchema, p_AssignmentStrategy => p_MJAIAgentTypes_SystemPromptID_AssignmentStrategy, p_DefaultStorageAccountID => p_MJAIAgentTypes_SystemPromptID_DefaultStorageAccountID);

    END LOOP;

    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID", "AllowEphemeralClientTools", "DefaultStorageAccountID", "SearchScopeAccess", "AcceptUnregisteredFiles" FROM __mj."AIAgent" WHERE "ContextCompressionPromptID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_ID => p_MJAIAgents_ContextCompressionPromptIDID, p_Name => p_MJAIAgents_ContextCompressionPromptID_Name, p_Description => p_MJAIAgents_ContextCompressionPromptID_Description, p_LogoURL => p_MJAIAgents_ContextCompressionPromptID_LogoURL, p_ParentID => p_MJAIAgents_ContextCompressionPromptID_ParentID, p_ExposeAsAction => p_MJAIAgents_ContextCompressionPromptID_ExposeAsAction, p_ExecutionOrder => p_MJAIAgents_ContextCompressionPromptID_ExecutionOrder, p_ExecutionMode => p_MJAIAgents_ContextCompressionPromptID_ExecutionMode, p_EnableContextCompression => p_MJAIAgents_ContextCompressionPromptID_EnableContextComp_017508, p_ContextCompressionMessageThreshold => p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_09124d, p_ContextCompressionPromptID_Clear => 1, p_ContextCompressionPromptID => p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d, p_ContextCompressionMessageRetentionCount => p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_6c27f1, p_TypeID => p_MJAIAgents_ContextCompressionPromptID_TypeID, p_Status => p_MJAIAgents_ContextCompressionPromptID_Status, p_DriverClass => p_MJAIAgents_ContextCompressionPromptID_DriverClass, p_IconClass => p_MJAIAgents_ContextCompressionPromptID_IconClass, p_ModelSelectionMode => p_MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, p_PayloadDownstreamPaths => p_MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, p_PayloadUpstreamPaths => p_MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, p_PayloadSelfReadPaths => p_MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, p_PayloadSelfWritePaths => p_MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, p_PayloadScope => p_MJAIAgents_ContextCompressionPromptID_PayloadScope, p_FinalPayloadValidation => p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, p_FinalPayloadValidationMode => p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a7a211, p_FinalPayloadValidationMaxRetries => p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a47251, p_MaxCostPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, p_MaxTokensPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, p_MaxIterationsPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, p_MaxTimePerRun => p_MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, p_MinExecutionsPerRun => p_MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, p_StartingPayloadValidation => p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60, p_StartingPayloadValidationMode => p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60Mode, p_DefaultPromptEffortLevel => p_MJAIAgents_ContextCompressionPromptID_DefaultPromptEffo_322203, p_ChatHandlingOption => p_MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, p_DefaultArtifactTypeID => p_MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, p_OwnerUserID => p_MJAIAgents_ContextCompressionPromptID_OwnerUserID, p_InvocationMode => p_MJAIAgents_ContextCompressionPromptID_InvocationMode, p_ArtifactCreationMode => p_MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, p_FunctionalRequirements => p_MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, p_TechnicalDesign => p_MJAIAgents_ContextCompressionPromptID_TechnicalDesign, p_InjectNotes => p_MJAIAgents_ContextCompressionPromptID_InjectNotes, p_MaxNotesToInject => p_MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, p_NoteInjectionStrategy => p_MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, p_InjectExamples => p_MJAIAgents_ContextCompressionPromptID_InjectExamples, p_MaxExamplesToInject => p_MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, p_ExampleInjectionStrategy => p_MJAIAgents_ContextCompressionPromptID_ExampleInjectionS_27b212, p_IsRestricted => p_MJAIAgents_ContextCompressionPromptID_IsRestricted, p_MessageMode => p_MJAIAgents_ContextCompressionPromptID_MessageMode, p_MaxMessages => p_MJAIAgents_ContextCompressionPromptID_MaxMessages, p_AttachmentStorageProviderID => p_MJAIAgents_ContextCompressionPromptID_AttachmentStorage_81bfaf, p_AttachmentRootPath => p_MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, p_InlineStorageThresholdBytes => p_MJAIAgents_ContextCompressionPromptID_InlineStorageThre_804eef, p_AgentTypePromptParams => p_MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, p_ScopeConfig => p_MJAIAgents_ContextCompressionPromptID_ScopeConfig, p_NoteRetentionDays => p_MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, p_ExampleRetentionDays => p_MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, p_AutoArchiveEnabled => p_MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, p_RerankerConfiguration => p_MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, p_CategoryID => p_MJAIAgents_ContextCompressionPromptID_CategoryID, p_AllowEphemeralClientTools => p_MJAIAgents_ContextCompressionPromptID_AllowEphemeralCli_be674b, p_DefaultStorageAccountID => p_MJAIAgents_ContextCompressionPromptID_DefaultStorageAccountID, p_SearchScopeAccess => p_MJAIAgents_ContextCompressionPromptID_SearchScopeAccess, p_AcceptUnregisteredFiles => p_MJAIAgents_ContextCompressionPromptID_AcceptUnregisteredFiles);

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


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite" FROM __mj."AIPromptRun" WHERE "JudgeID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIPromptRuns_JudgeID_JudgeID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_JudgeIDID, p_PromptID => p_MJAIPromptRuns_JudgeID_PromptID, p_ModelID => p_MJAIPromptRuns_JudgeID_ModelID, p_VendorID => p_MJAIPromptRuns_JudgeID_VendorID, p_AgentID => p_MJAIPromptRuns_JudgeID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_JudgeID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_JudgeID_RunAt, p_CompletedAt => p_MJAIPromptRuns_JudgeID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_JudgeID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_JudgeID_Messages, p_Result => p_MJAIPromptRuns_JudgeID_Result, p_TokensUsed => p_MJAIPromptRuns_JudgeID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_JudgeID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_JudgeID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_JudgeID_TotalCost, p_Success => p_MJAIPromptRuns_JudgeID_Success, p_ErrorMessage => p_MJAIPromptRuns_JudgeID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_JudgeID_ParentID, p_RunType => p_MJAIPromptRuns_JudgeID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_JudgeID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_JudgeID_AgentRunID, p_Cost => p_MJAIPromptRuns_JudgeID_Cost, p_CostCurrency => p_MJAIPromptRuns_JudgeID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_JudgeID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_JudgeID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_JudgeID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_JudgeID_Temperature, p_TopP => p_MJAIPromptRuns_JudgeID_TopP, p_TopK => p_MJAIPromptRuns_JudgeID_TopK, p_MinP => p_MJAIPromptRuns_JudgeID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_JudgeID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_JudgeID_PresencePenalty, p_Seed => p_MJAIPromptRuns_JudgeID_Seed, p_StopSequences => p_MJAIPromptRuns_JudgeID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_JudgeID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_JudgeID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_JudgeID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_JudgeID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_JudgeID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_JudgeID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_JudgeID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_JudgeID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_JudgeID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_JudgeID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_JudgeID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_JudgeID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_JudgeID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_JudgeID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_JudgeID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_JudgeID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_JudgeID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_JudgeID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_JudgeID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_JudgeID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_JudgeID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_JudgeID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_JudgeID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_JudgeID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_JudgeID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_JudgeID_ModelSelection, p_Status => p_MJAIPromptRuns_JudgeID_Status, p_Cancelled => p_MJAIPromptRuns_JudgeID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_JudgeID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_JudgeID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_JudgeID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_JudgeID_CacheHit, p_CacheKey => p_MJAIPromptRuns_JudgeID_CacheKey, p_JudgeID_Clear => 1, p_JudgeID => p_MJAIPromptRuns_JudgeID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_JudgeID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_JudgeID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_JudgeID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_JudgeID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_JudgeID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_JudgeID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_JudgeID_QueueTime, p_PromptTime => p_MJAIPromptRuns_JudgeID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_JudgeID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_JudgeID_EffortLevel, p_RunName => p_MJAIPromptRuns_JudgeID_RunName, p_Comments => p_MJAIPromptRuns_JudgeID_Comments, p_TestRunID => p_MJAIPromptRuns_JudgeID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_JudgeID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_JudgeID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_JudgeID_TokensCacheWrite);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite" FROM __mj."AIPromptRun" WHERE "ChildPromptID" = p_ID
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
        -- Set the FK field to NULL
        p_MJAIPromptRuns_ChildPromptID_ChildPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_ChildPromptIDID, p_PromptID => p_MJAIPromptRuns_ChildPromptID_PromptID, p_ModelID => p_MJAIPromptRuns_ChildPromptID_ModelID, p_VendorID => p_MJAIPromptRuns_ChildPromptID_VendorID, p_AgentID => p_MJAIPromptRuns_ChildPromptID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_ChildPromptID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_ChildPromptID_RunAt, p_CompletedAt => p_MJAIPromptRuns_ChildPromptID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_ChildPromptID_Messages, p_Result => p_MJAIPromptRuns_ChildPromptID_Result, p_TokensUsed => p_MJAIPromptRuns_ChildPromptID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_ChildPromptID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_ChildPromptID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_ChildPromptID_TotalCost, p_Success => p_MJAIPromptRuns_ChildPromptID_Success, p_ErrorMessage => p_MJAIPromptRuns_ChildPromptID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_ChildPromptID_ParentID, p_RunType => p_MJAIPromptRuns_ChildPromptID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_ChildPromptID_ExecutionOrder, p_AgentRunID => p_MJAIPromptRuns_ChildPromptID_AgentRunID, p_Cost => p_MJAIPromptRuns_ChildPromptID_Cost, p_CostCurrency => p_MJAIPromptRuns_ChildPromptID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_ChildPromptID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_ChildPromptID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_ChildPromptID_Temperature, p_TopP => p_MJAIPromptRuns_ChildPromptID_TopP, p_TopK => p_MJAIPromptRuns_ChildPromptID_TopK, p_MinP => p_MJAIPromptRuns_ChildPromptID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_ChildPromptID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_ChildPromptID_PresencePenalty, p_Seed => p_MJAIPromptRuns_ChildPromptID_Seed, p_StopSequences => p_MJAIPromptRuns_ChildPromptID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_ChildPromptID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_ChildPromptID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_ChildPromptID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_ChildPromptID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_ChildPromptID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_ChildPromptID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_ChildPromptID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_ChildPromptID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_ChildPromptID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_ChildPromptID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_ChildPromptID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_ChildPromptID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_ChildPromptID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_ChildPromptID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_ChildPromptID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_ChildPromptID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_ChildPromptID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_ChildPromptID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_ChildPromptID_ModelSelection, p_Status => p_MJAIPromptRuns_ChildPromptID_Status, p_Cancelled => p_MJAIPromptRuns_ChildPromptID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_ChildPromptID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_ChildPromptID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_ChildPromptID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_ChildPromptID_CacheHit, p_CacheKey => p_MJAIPromptRuns_ChildPromptID_CacheKey, p_JudgeID => p_MJAIPromptRuns_ChildPromptID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_ChildPromptID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_ChildPromptID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_ChildPromptID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_ChildPromptID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_ChildPromptID_ErrorDetails, p_ChildPromptID_Clear => 1, p_ChildPromptID => p_MJAIPromptRuns_ChildPromptID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_ChildPromptID_QueueTime, p_PromptTime => p_MJAIPromptRuns_ChildPromptID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_ChildPromptID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_ChildPromptID_EffortLevel, p_RunName => p_MJAIPromptRuns_ChildPromptID_RunName, p_Comments => p_MJAIPromptRuns_ChildPromptID_Comments, p_TestRunID => p_MJAIPromptRuns_ChildPromptID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_ChildPromptID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_ChildPromptID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_ChildPromptID_TokensCacheWrite);

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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ce759024-edce-42be-85e1-15069d68626c' OR ("EntityID" = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND "Name" = 'TokensCacheRead')
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
        'ce759024-edce-42be-85e1-15069d68626c',
        '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- "Entity": "MJ": "AI" "Prompt" "Runs"
        100187,
        'TokensCacheRead',
        'Tokens Cache Read',
        'Number of input tokens served from the AI provider''s prompt cache (a cache READ / hit) for this run, as reported by the provider. Counts only; no cost is derived here. NULL if the provider did not report cache reads or caching did not engage. Distinct from CacheHit/CacheKey, which track MemberJunction''s own result cache.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f81872de-be88-47ee-a581-8e5808e48013' OR ("EntityID" = '7C1C98D0-3978-4CE8-8E3F-C90301E59767' AND "Name" = 'TokensCacheWrite')
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
        'f81872de-be88-47ee-a581-8e5808e48013',
        '7C1C98D0-3978-4CE8-8E3F-C90301E59767', -- "Entity": "MJ": "AI" "Prompt" "Runs"
        100188,
        'TokensCacheWrite',
        'Tokens Cache Write',
        'Number of input tokens written to the AI provider''s prompt cache (a cache WRITE / creation) for this run, as reported by the provider. Populated for providers that report cache writes (e.g. Anthropic cache_creation_input_tokens); NULL or 0 for providers that do not bill/report writes (OpenAI, Gemini, Groq, Cerebras). Counts only; no cost is derived here.',
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

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BB1A9EFA-52A5-4D39-A67B-0C623C037EA8' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."PromptID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9407CD9F-EB55-4BB5-8CDD-5D2E70D9D739' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ModelID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '71548843-FAAA-493F-A7D3-FDCB4A3A80DF' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."VendorID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F4E86C22-D315-4DB1-9DA1-A5779B78EAAC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."AgentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C1D2EC52-E3DE-46E1-A7B7-C353C811E74C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ConfigurationID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FE9C78CB-14F9-4F2D-85A1-51860E35C95B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."RunAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '403EBB3C-A506-4A45-807C-28B5BE669837' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."CompletedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C292566B-AEB6-495C-B228-97F4509E159F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ExecutionTimeMS"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6C2E9D77-1A55-40B2-A6B5-B385BB95C14F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."Success"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '621DBFAD-A8A3-4B94-9247-418F4B310FD2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ErrorMessage"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F9A3491B-AC3C-4CD2-BBC6-6CC0BCD674DA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ParentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '559A6C83-012D-436E-BCD0-BF5BC195D1DD' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."RunType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0524D957-C4AA-4CB6-AFEB-EAA4A0B831A0' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ExecutionOrder"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '54DFB777-475B-4C79-A736-10556471D86E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."AgentRunID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3527B188-23DD-4C21-8716-BD17A5E05BB5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."RerunFromPromptRunID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Rerun From Run',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AF55FAF1-BC63-432B-9137-5D0678DC08AA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '206BDDB4-41C4-4CC4-8057-43BE145DFE13' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."Cancelled"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '70260832-4420-451A-9A22-359FD83885FC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."CancellationReason"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '085BE7AF-5389-43C0-BEE4-3748840E61F6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."CacheHit"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1E91D9BA-2775-488F-B647-EB44EF9E6112' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."CacheKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6D6AC347-E634-4846-B9F3-B9F46FBE16CC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."WasSelectedResult"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3A3908B7-C914-48AD-9C91-3095CB4B6475' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."StreamingEnabled"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '69C2BA6E-FB8B-4F52-90CF-6D4D3FEAB81B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."FirstTokenTime"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F2B24363-336F-48D2-9B68-D9A81B27A224' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ErrorDetails"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '4B843B2C-8CC0-4B48-814C-1BF3B88D69BA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ChildPromptID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2CD14363-BDDB-45BA-AEDE-731EE053CAB1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."RunName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F3050F3E-E62C-47B3-8F6F-F12DC42C86E7' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."Comments"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '037160AF-8D33-43F7-9C60-F200306B6DBC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."TestRunID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CECDF34F-B76C-421E-9746-416F3C1CAB0B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."Parent"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Parent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6B04C39C-CB71-464E-95BD-FFE0473C3799' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."AgentRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Agent Run',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B9212269-5523-48F4-8C80-71FEDBDA14AD' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."RerunFromPromptRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Rerun From Run',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E433AB22-95B8-42C7-921E-37B9BB04E6E2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."TestRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Test Run',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3F5B9551-EB7D-4CA9-B177-9D0473598E32' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."RootParentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Root Parent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F9F9EC70-B3C6-4619-9A43-0D8986A28A85' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."RootRerunFromPromptRunID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Root Rerun From Run',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '55613DC7-0DDA-43AF-AE04-0F3D2BC709D0' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."Messages"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'A863F3D6-18E5-4FBD-B498-BC74BB6C7592' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."Result"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D3C9BC7E-8FDA-4CC9-A6AF-F928183ED4EC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."StopSequences"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '81BC5339-5D6D-41F7-8D40-B619AC308284' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ResponseFormat"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '500B3FE9-F420-4036-AD0A-0CC999E6478A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."JudgeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Judge',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CC0E9225-A041-4DA5-8C1C-AB26091D9A37' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."JudgeScore"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FCF30C26-0363-49F8-AF94-D8403348A6F1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ModelSpecificResponseDetails"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Model Specific Details',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '645594E9-9A4D-4302-9268-C5D0656D4189' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."AssistantPrefill"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DD1CA15C-264A-4D3A-A85A-9F6EE270C338' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."Prompt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Prompt',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E114B8EB-89A2-4EF2-A45E-0D52E011FCCE' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."Model"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Model',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5603B884-25A8-4D10-94A3-636E59F3E91C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."Vendor"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Vendor',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F1D62EEE-FEEF-4D0C-8955-7AB4442A9150' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."Agent"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Agent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2DE35331-2554-4E99-8C8E-2FB392B3B658' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."Configuration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Configuration',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F7A51776-F0C9-4411-9481-E46DC3EE9D4F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."OriginalModel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Original Model',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E939815B-9896-49C5-BA22-6E25BEFE2F34' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."Judge"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Judge',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '20386410-106D-4540-A077-111FF35B281C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ChildPrompt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Child Prompt',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6EE88511-CE87-4BA6-AA0F-DA675C5C757B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."TokensUsed"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8EB9EB12-02C0-4D19-BC14-0DC706C9EE58' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."TokensPrompt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Tokens Prompt',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '82D0E001-0826-44BC-B394-0299DAFBBB62' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."TokensCompletion"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Tokens Completion',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4F3C2E1E-2F65-4B98-82BB-CB48B6285546' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."TotalCost"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '74BCF682-06A6-4DDC-BF1E-C7B5601D715E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."Cost"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'ADCD9C84-0FB1-45F4-9A9F-B42BD51A2503' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."CostCurrency"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Cost Currency',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2A925F19-E0EA-41AF-8323-4542F310A09E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."TokensUsedRollup"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Tokens Used Rollup',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '16B3DCD4-E1A3-456B-AC93-FF72B2507B19' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."TokensPromptRollup"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Tokens Prompt Rollup',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '05F66D0A-9E5B-4A31-9B03-F26DF3FA70B1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."TokensCompletionRollup"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Tokens Completion Rollup',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BF642024-62C7-41E2-86AA-FCE253463DE1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."DescendantCost"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E1E51DB3-0F7A-4A20-8E82-0CE8E9257F47' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."FailoverAttempts"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C84B4CE2-5FE8-4BE0-9A3A-D0C5440E58B8' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."FailoverErrors"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '67CB5D9F-21C7-472F-968B-1A546D4DF8B1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."FailoverDurations"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'E592040A-9AB1-4181-974D-D40598259CF2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."OriginalModelID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '12569670-4ECE-445A-ADCF-E3018DC1B723' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."OriginalRequestStartTime"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '24CB1A5A-CC8F-4FAB-BCF8-3324534165BF' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."TotalFailoverDuration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9C1D702A-F8B3-4B2B-8B88-E64621FDAA08' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."QueueTime"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9DF1B01F-510B-481F-A669-F0C128437817' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."PromptTime"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '01E72544-1D2A-4FF2-9BC0-497E41F65473' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."CompletionTime"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '248F35BE-627E-4A29-8A08-CAB9DF3BA396' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."TokensCacheRead"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Performance & Cost Metrics',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CE759024-EDCE-42BE-85E1-15069D68626C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."TokensCacheWrite"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Performance & Cost Metrics',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F81872DE-BE88-47EE-A581-8E5808E48013' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BAFFFCD7-77C9-4716-A0E2-60C41814CCC8' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C32DE832-7849-457C-9A45-5F9BE3AF68CE' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."Temperature"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '95C3A075-173A-4858-9EC2-49EF6B976669' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."TopP"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B7B30E68-EE85-4883-96D9-A1E3053396DF' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."TopK"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C39350C9-4593-4129-A130-73C730EE8559' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."MinP"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EBC17D08-2D86-4B7C-9B37-3A9D19E1E98F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."FrequencyPenalty"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F4723C61-222A-40F3-9C97-941715514B96' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."PresencePenalty"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AF8F23C2-DEFE-442D-BD79-2178777C48EA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."Seed"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DED8E59B-666C-4D6E-9CEA-EB762B444F42' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."LogProbs"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '180A9E6F-8C78-42F1-9187-D969F3A0DFF2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."TopLogProbs"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5601E9C4-A756-4453-8117-E8E5460CAEFC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ModelSelection"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Model Selection Details',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'F7B5B241-3D39-4715-80CA-77AB79AF8374' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ModelPowerRank"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FF696B62-DD4F-4D12-A120-27464D4F3BEE' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."SelectionStrategy"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0F79694C-7A55-4E18-BBF6-C0A3B8D9BAF0' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."EffortLevel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7B1032DB-F8AF-4EAF-9F03-7B9049FBA39D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ValidationAttemptCount"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Validation Attempt Count',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E5C8EB19-4E38-4962-A9C3-01B99B2CAF71' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."SuccessfulValidationCount"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Successful Validation Count',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BB43B8DA-7A21-4734-9EE0-49BBAB0A2EBC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."FinalValidationPassed"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B818BC71-69CA-48AB-8E82-FDBA4ACE9B9E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ValidationBehavior"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '19C655EA-36B6-4D1E-AD16-07E68D848C07' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."RetryStrategy"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D8524915-5BE7-4BF6-8751-847427DCDFF5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."MaxRetriesConfigured"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Max Retries Configured',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '90035368-1453-43A8-B3D0-F822A75E63C3' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."FinalValidationError"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A56CAAE4-C17C-4217-BF68-D4D1CE427ADF' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ValidationErrorCount"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AA772A8F-17FC-453A-AB19-69766C073663' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."CommonValidationError"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2F7169BB-CDD8-43BE-B74D-C2D2D5AA2734' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."FirstAttemptAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3FB83B39-DC79-4824-91B1-F4C7AC91FD50' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."LastAttemptAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '70717F1D-4FF4-488A-8BE4-0A2D47A0C702' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."TotalRetryDurationMS"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '10064F90-AA41-4DC5-981B-D308C767FD63' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ValidationAttempts"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Validation Attempts',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '33BF165E-77A3-447D-94F3-DCB61EF83698' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ValidationSummary"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '730E6B0B-B28C-4E90-A879-003181340C68' AND "AutoUpdateCategory" = TRUE;


-- ===================== Grants =====================

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
/* Set categories for 101 fields */

-- UPDATE Entity Field Category Info MJ: AI Prompt Runs."ID";


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."AIPromptRun"."TokensCacheRead" IS 'Number of input tokens served from the AI provider';

COMMENT ON COLUMN __mj."AIPromptRun"."TokensCacheWrite" IS 'Number of input tokens written to the AI provider';


-- ===================== Other =====================

-- Add prompt-cache token columns to AIPromptRun so provider prompt-cache usage (cache reads/writes)
-- is captured alongside the existing token counts. These are populated from the LLM provider's
-- reported usage (Anthropic cache_read/creation_input_tokens; OpenAI/Gemini/Groq/Cerebras
-- prompt_tokens_details.cached_tokens). They are informational token COUNTS only — no cost-formula
-- change. NULL means the provider did not report cache usage (or caching did not engage).
--
-- Named in the Tokens* family (not Cache*) to group with TokensPrompt/TokensCompletion/TokensUsed
-- and to avoid confusion with the existing CacheHit/CacheKey columns, which refer to MemberJunction's
-- own server-side RESULT cache, not the provider's prompt cache.
--
-- NOTE: The hand-written DDL + extended properties are below. The CodeGen-generated metadata
-- (EntityField records for these columns, the AIPromptRun base view, and the CRUD procedures) is
-- appended after the whitespace below, per MJ convention.

/* spUpdate Permissions for MJ: AI Prompt Runs */
