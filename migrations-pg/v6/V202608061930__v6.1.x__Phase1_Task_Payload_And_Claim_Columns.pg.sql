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

/*
    Phase 1 — Truthful engine (unified workflow DAG engine program)

    Plan: plans/task-graph-primitive.md §3.6 + §4 "Phase 1 — Truthful engine", PR #3456.

    Gives the task substrate the columns it has been smuggling through Description, the
    indexes the dispatcher's inner loop will need, and the run-step type that records a
    submitted graph. Purely additive to Task and AIAgentRunStep — no drops.

    ── What this adds, and why ─────────────────────────────────────────────────────────

    1. Task payload/link columns. Today inputs and outputs ride inside Task.Description
       behind `__TASK_METADATA__` / `__TASK_OUTPUT__` markers (TaskOrchestrator.ts:175,
       :535), which leaks orchestration plumbing into search results and the task detail
       panel. InputPayload / OutputPayload / ErrorMessage / AgentRunID give each its own
       column. AgentRunID additionally fixes the Gantt's agent-run mis-link, which today
       maps runs via the shared ConversationDetailID so every sibling task points at the
       same run.

    2. Dispatcher claim columns (D1/D2, §3.4). ClaimedBy + ClaimExpiresAt are the
       compare-and-swap claim protocol: a claim is `UPDATE ... WHERE ID=@id AND
       Status='Pending'`, rowcount 1 wins. Landing them now — one migration rather than
       two — means Phase 2 adds the dispatcher without further schema churn. Nothing
       reads them until then.

    3. Two indexes (review round 2). IX_Task_Status_ClaimExpiresAt serves the dispatcher's
       eligibility scan and the reconciliation sweep's expired-claim/anomaly queries — the
       inner loop of the whole engine. IX_Task_ParentID_Status serves per-graph rollup and
       progress. These are deliberate, hand-written indexes for known hot queries, not FK
       indexes (CodeGen owns those).

    4. AIAgentRunStep.StepType gains 'TaskGraph' (D10). The run step written for every
       emitted graph — folded or dispatched — so the fold decision is observable and
       Save as Workflow has something to attach to. The CHECK is dropped and re-added
       with the extended value set so CodeGen re-derives the EntityFieldValue rows and
       the generated TypeScript union from it.

    5. One-time backfill of the marker rows (review round 1). A fallback parse with no
       backfill never dies, so the markers are converted to columns here and stripped
       from Description. Phase 1 code carries no fallback.

    Status and DependencyType need no changes — their CHECK constraints already carry
    Blocked/Cancelled/Failed/Deferred and Prerequisite/Corequisite/Optional respectively.
    This phase starts honoring values the schema already allowed.
*/

-- ════════════════════════════════════════════════════════════════════════════════════
-- 1. Task: payload, error, agent-run link, and dispatcher claim columns
-- ════════════════════════════════════════════════════════════════════════════════════

ALTER TABLE __mj."Task"
 ADD COLUMN IF NOT EXISTS "InputPayload"    TEXT     NULL,
 ADD COLUMN IF NOT EXISTS "OutputPayload"   TEXT     NULL,
 ADD COLUMN IF NOT EXISTS "ErrorMessage"    TEXT     NULL,
 ADD COLUMN IF NOT EXISTS "AgentRunID"      UUID  NULL,
 ADD COLUMN IF NOT EXISTS "ClaimedBy"       VARCHAR(100)     NULL,
 ADD COLUMN IF NOT EXISTS "ClaimExpiresAt"  TIMESTAMPTZ    NULL;

-- ════════════════════════════════════════════════════════════════════════════════════
-- 2. Dispatcher hot-path indexes
--
--    Deliberate, hand-written indexes for the two known hot queries. NOT foreign-key
--    indexes (CodeGen owns those as IDX_AUTO_MJ_FKEY_*). TaskDependency needs nothing
--    new: UQ_TaskDependency_Pair serves forward lookups and the auto FK index on
--    DependsOnTaskID serves dependents-of-X, which is what failure propagation walks.
-- ════════════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS "IX_Task_Status_ClaimExpiresAt"
    ON __mj."Task" ("Status", "ClaimExpiresAt");

CREATE INDEX IF NOT EXISTS "IX_Task_ParentID_Status"
    ON __mj."Task" ("ParentID", "Status");

-- ════════════════════════════════════════════════════════════════════════════════════
-- 3. AIAgentRunStep.StepType gains 'TaskGraph'
--
--    Drop + re-add in a single migration so CodeGen re-derives the EntityFieldValue rows,
--    ValueListType, and the generated TypeScript union from the constraint. Never
--    hand-write those rows.
-- ════════════════════════════════════════════════════════════════════════════════════

-- IF EXISTS: the drop+re-add pattern must be idempotent on databases where the CHECK was
-- never created (PG CHECK constraint naming has diverged from SQL Server historically).
ALTER TABLE __mj."AIAgentRunStep"
    DROP CONSTRAINT IF EXISTS "CK_AIAgentRunStep_StepType";

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_ParentID" ON __mj."Task" ("ParentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_TypeID" ON __mj."Task" ("TypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_EnvironmentID" ON __mj."Task" ("EnvironmentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_ProjectID" ON __mj."Task" ("ProjectID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_ConversationDetailID" ON __mj."Task" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_UserID" ON __mj."Task" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_AgentID" ON __mj."Task" ("AgentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_AgentRunID" ON __mj."Task" ("AgentRunID");


-- ===================== Helper Functions (fn*) =====================

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


-- ===================== Views =====================

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
    "MJAIAgentRun_AgentRunID"."RunName" AS "AgentRun",
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
LEFT OUTER JOIN
    __mj."AIAgentRun" AS "MJAIAgentRun_AgentRunID"
  ON
    t."AgentRunID" = "MJAIAgentRun_AgentRunID"."ID"
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


-- ===================== Stored Procedures (sp*) =====================

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
    IN p_CompletedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_InputPayload_Clear BOOLEAN DEFAULT FALSE,
    IN p_InputPayload TEXT DEFAULT NULL,
    IN p_OutputPayload_Clear BOOLEAN DEFAULT FALSE,
    IN p_OutputPayload TEXT DEFAULT NULL,
    IN p_ErrorMessage_Clear BOOLEAN DEFAULT FALSE,
    IN p_ErrorMessage TEXT DEFAULT NULL,
    IN p_AgentRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentRunID UUID DEFAULT NULL,
    IN p_ClaimedBy_Clear BOOLEAN DEFAULT FALSE,
    IN p_ClaimedBy VARCHAR(100) DEFAULT NULL,
    IN p_ClaimExpiresAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ClaimExpiresAt TIMESTAMPTZ DEFAULT NULL
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
                "CompletedAt",
                "InputPayload",
                "OutputPayload",
                "ErrorMessage",
                "AgentRunID",
                "ClaimedBy",
                "ClaimExpiresAt"
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
                CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, NULL) END,
                CASE WHEN p_InputPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_InputPayload, NULL) END,
                CASE WHEN p_OutputPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputPayload, NULL) END,
                CASE WHEN p_ErrorMessage_Clear = TRUE THEN NULL ELSE COALESCE(p_ErrorMessage, NULL) END,
                CASE WHEN p_AgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentRunID, NULL) END,
                CASE WHEN p_ClaimedBy_Clear = TRUE THEN NULL ELSE COALESCE(p_ClaimedBy, NULL) END,
                CASE WHEN p_ClaimExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ClaimExpiresAt, NULL) END
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
                "CompletedAt",
                "InputPayload",
                "OutputPayload",
                "ErrorMessage",
                "AgentRunID",
                "ClaimedBy",
                "ClaimExpiresAt"
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
                CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, NULL) END,
                CASE WHEN p_InputPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_InputPayload, NULL) END,
                CASE WHEN p_OutputPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputPayload, NULL) END,
                CASE WHEN p_ErrorMessage_Clear = TRUE THEN NULL ELSE COALESCE(p_ErrorMessage, NULL) END,
                CASE WHEN p_AgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentRunID, NULL) END,
                CASE WHEN p_ClaimedBy_Clear = TRUE THEN NULL ELSE COALESCE(p_ClaimedBy, NULL) END,
                CASE WHEN p_ClaimExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ClaimExpiresAt, NULL) END
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
    IN p_CompletedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_InputPayload_Clear BOOLEAN DEFAULT FALSE,
    IN p_InputPayload TEXT DEFAULT NULL,
    IN p_OutputPayload_Clear BOOLEAN DEFAULT FALSE,
    IN p_OutputPayload TEXT DEFAULT NULL,
    IN p_ErrorMessage_Clear BOOLEAN DEFAULT FALSE,
    IN p_ErrorMessage TEXT DEFAULT NULL,
    IN p_AgentRunID_Clear BOOLEAN DEFAULT FALSE,
    IN p_AgentRunID UUID DEFAULT NULL,
    IN p_ClaimedBy_Clear BOOLEAN DEFAULT FALSE,
    IN p_ClaimedBy VARCHAR(100) DEFAULT NULL,
    IN p_ClaimExpiresAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ClaimExpiresAt TIMESTAMPTZ DEFAULT NULL
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
        "CompletedAt" = CASE WHEN p_CompletedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_CompletedAt, "CompletedAt") END,
        "InputPayload" = CASE WHEN p_InputPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_InputPayload, "InputPayload") END,
        "OutputPayload" = CASE WHEN p_OutputPayload_Clear = TRUE THEN NULL ELSE COALESCE(p_OutputPayload, "OutputPayload") END,
        "ErrorMessage" = CASE WHEN p_ErrorMessage_Clear = TRUE THEN NULL ELSE COALESCE(p_ErrorMessage, "ErrorMessage") END,
        "AgentRunID" = CASE WHEN p_AgentRunID_Clear = TRUE THEN NULL ELSE COALESCE(p_AgentRunID, "AgentRunID") END,
        "ClaimedBy" = CASE WHEN p_ClaimedBy_Clear = TRUE THEN NULL ELSE COALESCE(p_ClaimedBy, "ClaimedBy") END,
        "ClaimExpiresAt" = CASE WHEN p_ClaimExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ClaimExpiresAt, "ClaimExpiresAt") END
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
    p_MJAIAgentRuns_ParentRunID_PlanMode BOOLEAN;
    p_MJAIAgentRuns_ParentRunID_ExternalSessionID VARCHAR(255);
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
    p_MJAIAgentRuns_LastRunID_PlanMode BOOLEAN;
    p_MJAIAgentRuns_LastRunID_ExternalSessionID VARCHAR(255);
    p_MJDuplicateRunDetailMatches_AIAgentRunIDID UUID;
    p_MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID UUID;
    p_MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource VARCHAR(20);
    p_MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID VARCHAR(500);
    p_MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability NUMERIC(12,11);
    p_MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt TIMESTAMPTZ;
    p_MJDuplicateRunDetailMatches_AIAgentRunID_Action VARCHAR(20);
    p_MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus VARCHAR(20);
    p_MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID UUID;
    p_MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus VARCHAR(20);
    p_MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt TIMESTAMPTZ;
    p_MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata TEXT;
    p_MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID UUID;
    p_MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID UUID;
    p_MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation VARCHAR(20);
    p_MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence NUMERIC(12,11);
    p_MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning TEXT;
    p_MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSur_52977e VARCHAR(500);
    p_MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap TEXT;
    p_MJExperimentSessionIterations_AIAgentRunIDID UUID;
    p_MJExperimentSessionIterations_AIAgentRunID_ExperimentSe_d552e6 UUID;
    p_MJExperimentSessionIterations_AIAgentRunID_Sequence INTEGER;
    p_MJExperimentSessionIterations_AIAgentRunID_Label VARCHAR(255);
    p_MJExperimentSessionIterations_AIAgentRunID_Status VARCHAR(20);
    p_MJExperimentSessionIterations_AIAgentRunID_Score NUMERIC(18,6);
    p_MJExperimentSessionIterations_AIAgentRunID_ComputeCost NUMERIC(18,6);
    p_MJExperimentSessionIterations_AIAgentRunID_TokensUsed INTEGER;
    p_MJExperimentSessionIterations_AIAgentRunID_Rationale TEXT;
    p_MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID UUID;
    p_MJExperimentSessions_AgentRunIDID UUID;
    p_MJExperimentSessions_AgentRunID_ExperimentID UUID;
    p_MJExperimentSessions_AgentRunID_Name VARCHAR(255);
    p_MJExperimentSessions_AgentRunID_Goal TEXT;
    p_MJExperimentSessions_AgentRunID_Budget TEXT;
    p_MJExperimentSessions_AgentRunID_Status VARCHAR(20);
    p_MJExperimentSessions_AgentRunID_PlanSpec TEXT;
    p_MJExperimentSessions_AgentRunID_Leaderboard TEXT;
    p_MJExperimentSessions_AgentRunID_AgentRunID UUID;
    p_MJProcessRunDetails_AIAgentRunIDID UUID;
    p_MJProcessRunDetails_AIAgentRunID_ProcessRunID UUID;
    p_MJProcessRunDetails_AIAgentRunID_EntityID UUID;
    p_MJProcessRunDetails_AIAgentRunID_RecordID VARCHAR(450);
    p_MJProcessRunDetails_AIAgentRunID_Status VARCHAR(20);
    p_MJProcessRunDetails_AIAgentRunID_StartedAt TIMESTAMPTZ;
    p_MJProcessRunDetails_AIAgentRunID_CompletedAt TIMESTAMPTZ;
    p_MJProcessRunDetails_AIAgentRunID_DurationMs INTEGER;
    p_MJProcessRunDetails_AIAgentRunID_AttemptCount INTEGER;
    p_MJProcessRunDetails_AIAgentRunID_ResultPayload TEXT;
    p_MJProcessRunDetails_AIAgentRunID_ErrorMessage TEXT;
    p_MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID UUID;
    p_MJProcessRunDetails_AIAgentRunID_AIAgentRunID UUID;
    p_MJTasks_AgentRunIDID UUID;
    p_MJTasks_AgentRunID_ParentID UUID;
    p_MJTasks_AgentRunID_Name VARCHAR(255);
    p_MJTasks_AgentRunID_Description TEXT;
    p_MJTasks_AgentRunID_TypeID UUID;
    p_MJTasks_AgentRunID_EnvironmentID UUID;
    p_MJTasks_AgentRunID_ProjectID UUID;
    p_MJTasks_AgentRunID_ConversationDetailID UUID;
    p_MJTasks_AgentRunID_UserID UUID;
    p_MJTasks_AgentRunID_AgentID UUID;
    p_MJTasks_AgentRunID_Status VARCHAR(50);
    p_MJTasks_AgentRunID_PercentComplete INTEGER;
    p_MJTasks_AgentRunID_DueAt TIMESTAMPTZ;
    p_MJTasks_AgentRunID_StartedAt TIMESTAMPTZ;
    p_MJTasks_AgentRunID_CompletedAt TIMESTAMPTZ;
    p_MJTasks_AgentRunID_InputPayload TEXT;
    p_MJTasks_AgentRunID_OutputPayload TEXT;
    p_MJTasks_AgentRunID_ErrorMessage TEXT;
    p_MJTasks_AgentRunID_AgentRunID UUID;
    p_MJTasks_AgentRunID_ClaimedBy VARCHAR(100);
    p_MJTasks_AgentRunID_ClaimExpiresAt TIMESTAMPTZ;
    p_MJUserRoutineRuns_AgentRunIDID UUID;
    p_MJUserRoutineRuns_AgentRunID_RoutineID UUID;
    p_MJUserRoutineRuns_AgentRunID_StartedAt TIMESTAMPTZ;
    p_MJUserRoutineRuns_AgentRunID_CompletedAt TIMESTAMPTZ;
    p_MJUserRoutineRuns_AgentRunID_Status VARCHAR(20);
    p_MJUserRoutineRuns_AgentRunID_AgentRunID UUID;
    p_MJUserRoutineRuns_AgentRunID_PromptRunID UUID;
    p_MJUserRoutineRuns_AgentRunID_ActionExecutionLogID UUID;
    p_MJUserRoutineRuns_AgentRunID_ResultSummary TEXT;
    p_MJUserRoutineRuns_AgentRunID_ResultHash VARCHAR(100);
    p_MJUserRoutineRuns_AgentRunID_NotificationSent BOOLEAN;
    p_MJUserRoutineRuns_AgentRunID_ErrorMessage TEXT;
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


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt", "AgentSessionID", "PlanMode", "ExternalSessionID" FROM __mj."AIAgentRun" WHERE "ParentRunID" = p_ID
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
        p_MJAIAgentRuns_ParentRunID_PlanMode := _rec."PlanMode";
        p_MJAIAgentRuns_ParentRunID_ExternalSessionID := _rec."ExternalSessionID";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ParentRunID_ParentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ParentRunIDID, p_AgentID => p_MJAIAgentRuns_ParentRunID_AgentID, p_ParentRunID_Clear => 1, p_ParentRunID => p_MJAIAgentRuns_ParentRunID_ParentRunID, p_Status => p_MJAIAgentRuns_ParentRunID_Status, p_StartedAt => p_MJAIAgentRuns_ParentRunID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ParentRunID_CompletedAt, p_Success => p_MJAIAgentRuns_ParentRunID_Success, p_ErrorMessage => p_MJAIAgentRuns_ParentRunID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_ParentRunID_ConversationID, p_UserID => p_MJAIAgentRuns_ParentRunID_UserID, p_Result => p_MJAIAgentRuns_ParentRunID_Result, p_AgentState => p_MJAIAgentRuns_ParentRunID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ParentRunID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_ParentRunID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_ParentRunID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ParentRunID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ParentRunID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ParentRunID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ParentRunID_FinalPayload, p_Message => p_MJAIAgentRuns_ParentRunID_Message, p_LastRunID => p_MJAIAgentRuns_ParentRunID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ParentRunID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ParentRunID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_ParentRunID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ParentRunID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ParentRunID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ParentRunID_Data, p_Verbose => p_MJAIAgentRuns_ParentRunID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ParentRunID_EffortLevel, p_RunName => p_MJAIAgentRuns_ParentRunID_RunName, p_Comments => p_MJAIAgentRuns_ParentRunID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ParentRunID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ParentRunID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ParentRunID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ParentRunID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ParentRunID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_ParentRunID_LastHeartbeatAt, p_AgentSessionID => p_MJAIAgentRuns_ParentRunID_AgentSessionID, p_PlanMode => p_MJAIAgentRuns_ParentRunID_PlanMode, p_ExternalSessionID => p_MJAIAgentRuns_ParentRunID_ExternalSessionID);

    END LOOP;

    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt", "AgentSessionID", "PlanMode", "ExternalSessionID" FROM __mj."AIAgentRun" WHERE "LastRunID" = p_ID
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
        p_MJAIAgentRuns_LastRunID_PlanMode := _rec."PlanMode";
        p_MJAIAgentRuns_LastRunID_ExternalSessionID := _rec."ExternalSessionID";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_LastRunID_LastRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_LastRunIDID, p_AgentID => p_MJAIAgentRuns_LastRunID_AgentID, p_ParentRunID => p_MJAIAgentRuns_LastRunID_ParentRunID, p_Status => p_MJAIAgentRuns_LastRunID_Status, p_StartedAt => p_MJAIAgentRuns_LastRunID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_LastRunID_CompletedAt, p_Success => p_MJAIAgentRuns_LastRunID_Success, p_ErrorMessage => p_MJAIAgentRuns_LastRunID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_LastRunID_ConversationID, p_UserID => p_MJAIAgentRuns_LastRunID_UserID, p_Result => p_MJAIAgentRuns_LastRunID_Result, p_AgentState => p_MJAIAgentRuns_LastRunID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_LastRunID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_LastRunID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_LastRunID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_LastRunID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_LastRunID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_LastRunID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_LastRunID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_LastRunID_FinalPayload, p_Message => p_MJAIAgentRuns_LastRunID_Message, p_LastRunID_Clear => 1, p_LastRunID => p_MJAIAgentRuns_LastRunID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_LastRunID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_LastRunID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_LastRunID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_LastRunID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_LastRunID_OverrideVendorID, p_Data => p_MJAIAgentRuns_LastRunID_Data, p_Verbose => p_MJAIAgentRuns_LastRunID_Verbose, p_EffortLevel => p_MJAIAgentRuns_LastRunID_EffortLevel, p_RunName => p_MJAIAgentRuns_LastRunID_RunName, p_Comments => p_MJAIAgentRuns_LastRunID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_LastRunID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_LastRunID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_LastRunID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_LastRunID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_LastRunID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_LastRunID_LastHeartbeatAt, p_AgentSessionID => p_MJAIAgentRuns_LastRunID_AgentSessionID, p_PlanMode => p_MJAIAgentRuns_LastRunID_PlanMode, p_ExternalSessionID => p_MJAIAgentRuns_LastRunID_ExternalSessionID);

    END LOOP;

    
    -- Cascade update on DuplicateRunDetailMatch using cursor to call spUpdateDuplicateRunDetailMatch


    FOR _rec IN SELECT "ID", "DuplicateRunDetailID", "MatchSource", "MatchRecordID", "MatchProbability", "MatchedAt", "Action", "ApprovalStatus", "RecordMergeLogID", "MergeStatus", "MergedAt", "RecordMetadata", "AIAgentRunID", "AIPromptRunID", "LLMRecommendation", "LLMConfidence", "LLMReasoning", "LLMProposedSurvivorRecordID", "LLMProposedFieldMap" FROM __mj."DuplicateRunDetailMatch" WHERE "AIAgentRunID" = p_ID
    LOOP
        p_MJDuplicateRunDetailMatches_AIAgentRunIDID := _rec."ID";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID := _rec."DuplicateRunDetailID";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource := _rec."MatchSource";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID := _rec."MatchRecordID";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability := _rec."MatchProbability";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt := _rec."MatchedAt";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_Action := _rec."Action";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus := _rec."ApprovalStatus";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID := _rec."RecordMergeLogID";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus := _rec."MergeStatus";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt := _rec."MergedAt";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata := _rec."RecordMetadata";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID := _rec."AIAgentRunID";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID := _rec."AIPromptRunID";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation := _rec."LLMRecommendation";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence := _rec."LLMConfidence";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning := _rec."LLMReasoning";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSur_52977e := _rec."LLMProposedSurvivorRecordID";
        p_MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap := _rec."LLMProposedFieldMap";
        -- Set the FK field to NULL
        p_MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateDuplicateRunDetailMatch"(p_ID => p_MJDuplicateRunDetailMatches_AIAgentRunIDID, p_DuplicateRunDetailID => p_MJDuplicateRunDetailMatches_AIAgentRunID_DuplicateRunDetailID, p_MatchSource => p_MJDuplicateRunDetailMatches_AIAgentRunID_MatchSource, p_MatchRecordID => p_MJDuplicateRunDetailMatches_AIAgentRunID_MatchRecordID, p_MatchProbability => p_MJDuplicateRunDetailMatches_AIAgentRunID_MatchProbability, p_MatchedAt => p_MJDuplicateRunDetailMatches_AIAgentRunID_MatchedAt, p_Action => p_MJDuplicateRunDetailMatches_AIAgentRunID_Action, p_ApprovalStatus => p_MJDuplicateRunDetailMatches_AIAgentRunID_ApprovalStatus, p_RecordMergeLogID => p_MJDuplicateRunDetailMatches_AIAgentRunID_RecordMergeLogID, p_MergeStatus => p_MJDuplicateRunDetailMatches_AIAgentRunID_MergeStatus, p_MergedAt => p_MJDuplicateRunDetailMatches_AIAgentRunID_MergedAt, p_RecordMetadata => p_MJDuplicateRunDetailMatches_AIAgentRunID_RecordMetadata, p_AIAgentRunID_Clear => 1, p_AIAgentRunID => p_MJDuplicateRunDetailMatches_AIAgentRunID_AIAgentRunID, p_AIPromptRunID => p_MJDuplicateRunDetailMatches_AIAgentRunID_AIPromptRunID, p_LLMRecommendation => p_MJDuplicateRunDetailMatches_AIAgentRunID_LLMRecommendation, p_LLMConfidence => p_MJDuplicateRunDetailMatches_AIAgentRunID_LLMConfidence, p_LLMReasoning => p_MJDuplicateRunDetailMatches_AIAgentRunID_LLMReasoning, p_LLMProposedSurvivorRecordID => p_MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedSur_52977e, p_LLMProposedFieldMap => p_MJDuplicateRunDetailMatches_AIAgentRunID_LLMProposedFieldMap);

    END LOOP;

    
    -- Cascade update on ExperimentSessionIteration using cursor to call spUpdateExperimentSessionIteration


    FOR _rec IN SELECT "ID", "ExperimentSessionID", "Sequence", "Label", "Status", "Score", "ComputeCost", "TokensUsed", "Rationale", "AIAgentRunID" FROM __mj."ExperimentSessionIteration" WHERE "AIAgentRunID" = p_ID
    LOOP
        p_MJExperimentSessionIterations_AIAgentRunIDID := _rec."ID";
        p_MJExperimentSessionIterations_AIAgentRunID_ExperimentSe_d552e6 := _rec."ExperimentSessionID";
        p_MJExperimentSessionIterations_AIAgentRunID_Sequence := _rec."Sequence";
        p_MJExperimentSessionIterations_AIAgentRunID_Label := _rec."Label";
        p_MJExperimentSessionIterations_AIAgentRunID_Status := _rec."Status";
        p_MJExperimentSessionIterations_AIAgentRunID_Score := _rec."Score";
        p_MJExperimentSessionIterations_AIAgentRunID_ComputeCost := _rec."ComputeCost";
        p_MJExperimentSessionIterations_AIAgentRunID_TokensUsed := _rec."TokensUsed";
        p_MJExperimentSessionIterations_AIAgentRunID_Rationale := _rec."Rationale";
        p_MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID := _rec."AIAgentRunID";
        -- Set the FK field to NULL
        p_MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateExperimentSessionIteration"(p_ID => p_MJExperimentSessionIterations_AIAgentRunIDID, p_ExperimentSessionID => p_MJExperimentSessionIterations_AIAgentRunID_ExperimentSe_d552e6, p_Sequence => p_MJExperimentSessionIterations_AIAgentRunID_Sequence, p_Label => p_MJExperimentSessionIterations_AIAgentRunID_Label, p_Status => p_MJExperimentSessionIterations_AIAgentRunID_Status, p_Score => p_MJExperimentSessionIterations_AIAgentRunID_Score, p_ComputeCost => p_MJExperimentSessionIterations_AIAgentRunID_ComputeCost, p_TokensUsed => p_MJExperimentSessionIterations_AIAgentRunID_TokensUsed, p_Rationale => p_MJExperimentSessionIterations_AIAgentRunID_Rationale, p_AIAgentRunID_Clear => 1, p_AIAgentRunID => p_MJExperimentSessionIterations_AIAgentRunID_AIAgentRunID);

    END LOOP;

    
    -- Cascade update on ExperimentSession using cursor to call spUpdateExperimentSession


    FOR _rec IN SELECT "ID", "ExperimentID", "Name", "Goal", "Budget", "Status", "PlanSpec", "Leaderboard", "AgentRunID" FROM __mj."ExperimentSession" WHERE "AgentRunID" = p_ID
    LOOP
        p_MJExperimentSessions_AgentRunIDID := _rec."ID";
        p_MJExperimentSessions_AgentRunID_ExperimentID := _rec."ExperimentID";
        p_MJExperimentSessions_AgentRunID_Name := _rec."Name";
        p_MJExperimentSessions_AgentRunID_Goal := _rec."Goal";
        p_MJExperimentSessions_AgentRunID_Budget := _rec."Budget";
        p_MJExperimentSessions_AgentRunID_Status := _rec."Status";
        p_MJExperimentSessions_AgentRunID_PlanSpec := _rec."PlanSpec";
        p_MJExperimentSessions_AgentRunID_Leaderboard := _rec."Leaderboard";
        p_MJExperimentSessions_AgentRunID_AgentRunID := _rec."AgentRunID";
        -- Set the FK field to NULL
        p_MJExperimentSessions_AgentRunID_AgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateExperimentSession"(p_ID => p_MJExperimentSessions_AgentRunIDID, p_ExperimentID => p_MJExperimentSessions_AgentRunID_ExperimentID, p_Name => p_MJExperimentSessions_AgentRunID_Name, p_Goal => p_MJExperimentSessions_AgentRunID_Goal, p_Budget => p_MJExperimentSessions_AgentRunID_Budget, p_Status => p_MJExperimentSessions_AgentRunID_Status, p_PlanSpec => p_MJExperimentSessions_AgentRunID_PlanSpec, p_Leaderboard => p_MJExperimentSessions_AgentRunID_Leaderboard, p_AgentRunID_Clear => 1, p_AgentRunID => p_MJExperimentSessions_AgentRunID_AgentRunID);

    END LOOP;

    
    -- Cascade update on ProcessRunDetail using cursor to call spUpdateProcessRunDetail


    FOR _rec IN SELECT "ID", "ProcessRunID", "EntityID", "RecordID", "Status", "StartedAt", "CompletedAt", "DurationMs", "AttemptCount", "ResultPayload", "ErrorMessage", "ActionExecutionLogID", "AIAgentRunID" FROM __mj."ProcessRunDetail" WHERE "AIAgentRunID" = p_ID
    LOOP
        p_MJProcessRunDetails_AIAgentRunIDID := _rec."ID";
        p_MJProcessRunDetails_AIAgentRunID_ProcessRunID := _rec."ProcessRunID";
        p_MJProcessRunDetails_AIAgentRunID_EntityID := _rec."EntityID";
        p_MJProcessRunDetails_AIAgentRunID_RecordID := _rec."RecordID";
        p_MJProcessRunDetails_AIAgentRunID_Status := _rec."Status";
        p_MJProcessRunDetails_AIAgentRunID_StartedAt := _rec."StartedAt";
        p_MJProcessRunDetails_AIAgentRunID_CompletedAt := _rec."CompletedAt";
        p_MJProcessRunDetails_AIAgentRunID_DurationMs := _rec."DurationMs";
        p_MJProcessRunDetails_AIAgentRunID_AttemptCount := _rec."AttemptCount";
        p_MJProcessRunDetails_AIAgentRunID_ResultPayload := _rec."ResultPayload";
        p_MJProcessRunDetails_AIAgentRunID_ErrorMessage := _rec."ErrorMessage";
        p_MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID := _rec."ActionExecutionLogID";
        p_MJProcessRunDetails_AIAgentRunID_AIAgentRunID := _rec."AIAgentRunID";
        -- Set the FK field to NULL
        p_MJProcessRunDetails_AIAgentRunID_AIAgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateProcessRunDetail"(p_ID => p_MJProcessRunDetails_AIAgentRunIDID, p_ProcessRunID => p_MJProcessRunDetails_AIAgentRunID_ProcessRunID, p_EntityID => p_MJProcessRunDetails_AIAgentRunID_EntityID, p_RecordID => p_MJProcessRunDetails_AIAgentRunID_RecordID, p_Status => p_MJProcessRunDetails_AIAgentRunID_Status, p_StartedAt => p_MJProcessRunDetails_AIAgentRunID_StartedAt, p_CompletedAt => p_MJProcessRunDetails_AIAgentRunID_CompletedAt, p_DurationMs => p_MJProcessRunDetails_AIAgentRunID_DurationMs, p_AttemptCount => p_MJProcessRunDetails_AIAgentRunID_AttemptCount, p_ResultPayload => p_MJProcessRunDetails_AIAgentRunID_ResultPayload, p_ErrorMessage => p_MJProcessRunDetails_AIAgentRunID_ErrorMessage, p_ActionExecutionLogID => p_MJProcessRunDetails_AIAgentRunID_ActionExecutionLogID, p_AIAgentRunID_Clear => 1, p_AIAgentRunID => p_MJProcessRunDetails_AIAgentRunID_AIAgentRunID);

    END LOOP;

    
    -- Cascade update on Task using cursor to call spUpdateTask


    FOR _rec IN SELECT "ID", "ParentID", "Name", "Description", "TypeID", "EnvironmentID", "ProjectID", "ConversationDetailID", "UserID", "AgentID", "Status", "PercentComplete", "DueAt", "StartedAt", "CompletedAt", "InputPayload", "OutputPayload", "ErrorMessage", "AgentRunID", "ClaimedBy", "ClaimExpiresAt" FROM __mj."Task" WHERE "AgentRunID" = p_ID
    LOOP
        p_MJTasks_AgentRunIDID := _rec."ID";
        p_MJTasks_AgentRunID_ParentID := _rec."ParentID";
        p_MJTasks_AgentRunID_Name := _rec."Name";
        p_MJTasks_AgentRunID_Description := _rec."Description";
        p_MJTasks_AgentRunID_TypeID := _rec."TypeID";
        p_MJTasks_AgentRunID_EnvironmentID := _rec."EnvironmentID";
        p_MJTasks_AgentRunID_ProjectID := _rec."ProjectID";
        p_MJTasks_AgentRunID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJTasks_AgentRunID_UserID := _rec."UserID";
        p_MJTasks_AgentRunID_AgentID := _rec."AgentID";
        p_MJTasks_AgentRunID_Status := _rec."Status";
        p_MJTasks_AgentRunID_PercentComplete := _rec."PercentComplete";
        p_MJTasks_AgentRunID_DueAt := _rec."DueAt";
        p_MJTasks_AgentRunID_StartedAt := _rec."StartedAt";
        p_MJTasks_AgentRunID_CompletedAt := _rec."CompletedAt";
        p_MJTasks_AgentRunID_InputPayload := _rec."InputPayload";
        p_MJTasks_AgentRunID_OutputPayload := _rec."OutputPayload";
        p_MJTasks_AgentRunID_ErrorMessage := _rec."ErrorMessage";
        p_MJTasks_AgentRunID_AgentRunID := _rec."AgentRunID";
        p_MJTasks_AgentRunID_ClaimedBy := _rec."ClaimedBy";
        p_MJTasks_AgentRunID_ClaimExpiresAt := _rec."ClaimExpiresAt";
        -- Set the FK field to NULL
        p_MJTasks_AgentRunID_AgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateTask"(p_ID => p_MJTasks_AgentRunIDID, p_ParentID => p_MJTasks_AgentRunID_ParentID, p_Name => p_MJTasks_AgentRunID_Name, p_Description => p_MJTasks_AgentRunID_Description, p_TypeID => p_MJTasks_AgentRunID_TypeID, p_EnvironmentID => p_MJTasks_AgentRunID_EnvironmentID, p_ProjectID => p_MJTasks_AgentRunID_ProjectID, p_ConversationDetailID => p_MJTasks_AgentRunID_ConversationDetailID, p_UserID => p_MJTasks_AgentRunID_UserID, p_AgentID => p_MJTasks_AgentRunID_AgentID, p_Status => p_MJTasks_AgentRunID_Status, p_PercentComplete => p_MJTasks_AgentRunID_PercentComplete, p_DueAt => p_MJTasks_AgentRunID_DueAt, p_StartedAt => p_MJTasks_AgentRunID_StartedAt, p_CompletedAt => p_MJTasks_AgentRunID_CompletedAt, p_InputPayload => p_MJTasks_AgentRunID_InputPayload, p_OutputPayload => p_MJTasks_AgentRunID_OutputPayload, p_ErrorMessage => p_MJTasks_AgentRunID_ErrorMessage, p_AgentRunID_Clear => 1, p_AgentRunID => p_MJTasks_AgentRunID_AgentRunID, p_ClaimedBy => p_MJTasks_AgentRunID_ClaimedBy, p_ClaimExpiresAt => p_MJTasks_AgentRunID_ClaimExpiresAt);

    END LOOP;

    
    -- Cascade update on UserRoutineRun using cursor to call spUpdateUserRoutineRun


    FOR _rec IN SELECT "ID", "RoutineID", "StartedAt", "CompletedAt", "Status", "AgentRunID", "PromptRunID", "ActionExecutionLogID", "ResultSummary", "ResultHash", "NotificationSent", "ErrorMessage" FROM __mj."UserRoutineRun" WHERE "AgentRunID" = p_ID
    LOOP
        p_MJUserRoutineRuns_AgentRunIDID := _rec."ID";
        p_MJUserRoutineRuns_AgentRunID_RoutineID := _rec."RoutineID";
        p_MJUserRoutineRuns_AgentRunID_StartedAt := _rec."StartedAt";
        p_MJUserRoutineRuns_AgentRunID_CompletedAt := _rec."CompletedAt";
        p_MJUserRoutineRuns_AgentRunID_Status := _rec."Status";
        p_MJUserRoutineRuns_AgentRunID_AgentRunID := _rec."AgentRunID";
        p_MJUserRoutineRuns_AgentRunID_PromptRunID := _rec."PromptRunID";
        p_MJUserRoutineRuns_AgentRunID_ActionExecutionLogID := _rec."ActionExecutionLogID";
        p_MJUserRoutineRuns_AgentRunID_ResultSummary := _rec."ResultSummary";
        p_MJUserRoutineRuns_AgentRunID_ResultHash := _rec."ResultHash";
        p_MJUserRoutineRuns_AgentRunID_NotificationSent := _rec."NotificationSent";
        p_MJUserRoutineRuns_AgentRunID_ErrorMessage := _rec."ErrorMessage";
        -- Set the FK field to NULL
        p_MJUserRoutineRuns_AgentRunID_AgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateUserRoutineRun"(p_ID => p_MJUserRoutineRuns_AgentRunIDID, p_RoutineID => p_MJUserRoutineRuns_AgentRunID_RoutineID, p_StartedAt => p_MJUserRoutineRuns_AgentRunID_StartedAt, p_CompletedAt => p_MJUserRoutineRuns_AgentRunID_CompletedAt, p_Status => p_MJUserRoutineRuns_AgentRunID_Status, p_AgentRunID_Clear => 1, p_AgentRunID => p_MJUserRoutineRuns_AgentRunID_AgentRunID, p_PromptRunID => p_MJUserRoutineRuns_AgentRunID_PromptRunID, p_ActionExecutionLogID => p_MJUserRoutineRuns_AgentRunID_ActionExecutionLogID, p_ResultSummary => p_MJUserRoutineRuns_AgentRunID_ResultSummary, p_ResultHash => p_MJUserRoutineRuns_AgentRunID_ResultHash, p_NotificationSent => p_MJUserRoutineRuns_AgentRunID_NotificationSent, p_ErrorMessage => p_MJUserRoutineRuns_AgentRunID_ErrorMessage);

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
    p_MJAIAgentRuns_ConversationDetailID_ExternalSessionID VARCHAR(255);
    p_MJConversationCompactionRuns_ConversationDetailIDID UUID;
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
    p_MJTasks_ConversationDetailID_InputPayload TEXT;
    p_MJTasks_ConversationDetailID_OutputPayload TEXT;
    p_MJTasks_ConversationDetailID_ErrorMessage TEXT;
    p_MJTasks_ConversationDetailID_AgentRunID UUID;
    p_MJTasks_ConversationDetailID_ClaimedBy VARCHAR(100);
    p_MJTasks_ConversationDetailID_ClaimExpiresAt TIMESTAMPTZ;
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


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt", "AgentSessionID", "PlanMode", "ExternalSessionID" FROM __mj."AIAgentRun" WHERE "ConversationDetailID" = p_ID
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
        p_MJAIAgentRuns_ConversationDetailID_ExternalSessionID := _rec."ExternalSessionID";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ConversationDetailID_ConversationDetailID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ConversationDetailIDID, p_AgentID => p_MJAIAgentRuns_ConversationDetailID_AgentID, p_ParentRunID => p_MJAIAgentRuns_ConversationDetailID_ParentRunID, p_Status => p_MJAIAgentRuns_ConversationDetailID_Status, p_StartedAt => p_MJAIAgentRuns_ConversationDetailID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ConversationDetailID_CompletedAt, p_Success => p_MJAIAgentRuns_ConversationDetailID_Success, p_ErrorMessage => p_MJAIAgentRuns_ConversationDetailID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_ConversationDetailID_ConversationID, p_UserID => p_MJAIAgentRuns_ConversationDetailID_UserID, p_Result => p_MJAIAgentRuns_ConversationDetailID_Result, p_AgentState => p_MJAIAgentRuns_ConversationDetailID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ConversationDetailID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUse_5ca82d, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ConversationDetailID_TotalCompletionToken_43c4ab, p_TotalCostRollup => p_MJAIAgentRuns_ConversationDetailID_TotalCostRollup, p_ConversationDetailID_Clear => 1, p_ConversationDetailID => p_MJAIAgentRuns_ConversationDetailID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ConversationDetailID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ConversationDetailID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ConversationDetailID_FinalPayload, p_Message => p_MJAIAgentRuns_ConversationDetailID_Message, p_LastRunID => p_MJAIAgentRuns_ConversationDetailID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ConversationDetailID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_ConversationDetailID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ConversationDetailID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ConversationDetailID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ConversationDetailID_Data, p_Verbose => p_MJAIAgentRuns_ConversationDetailID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ConversationDetailID_EffortLevel, p_RunName => p_MJAIAgentRuns_ConversationDetailID_RunName, p_Comments => p_MJAIAgentRuns_ConversationDetailID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ConversationDetailID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ConversationDetailID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ConversationDetailID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt, p_AgentSessionID => p_MJAIAgentRuns_ConversationDetailID_AgentSessionID, p_PlanMode => p_MJAIAgentRuns_ConversationDetailID_PlanMode, p_ExternalSessionID => p_MJAIAgentRuns_ConversationDetailID_ExternalSessionID);

    END LOOP;

    
    -- Cascade delete from ConversationCompactionRun using cursor to call spDeleteConversationCompactionRun

    FOR _rec IN SELECT "ID" FROM __mj."ConversationCompactionRun" WHERE "ConversationDetailID" = p_ID
    LOOP
        p_MJConversationCompactionRuns_ConversationDetailIDID := _rec."ID";
        PERFORM __mj."spDeleteConversationCompactionRun"(p_ID => p_MJConversationCompactionRuns_ConversationDetailIDID);
        
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


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged", "AgentSessionID", "TurnEndedAt", "UtteranceStartMs", "UtteranceEndMs", "MediaType" FROM __mj."ConversationDetail" WHERE "ParentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJConversationDetails_ParentID_ParentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_ParentIDID, p_ConversationID => p_MJConversationDetails_ParentID_ConversationID, p_ExternalID => p_MJConversationDetails_ParentID_ExternalID, p_Role => p_MJConversationDetails_ParentID_Role, p_Message => p_MJConversationDetails_ParentID_Message, p_Error => p_MJConversationDetails_ParentID_Error, p_HiddenToUser => p_MJConversationDetails_ParentID_HiddenToUser, p_UserRating => p_MJConversationDetails_ParentID_UserRating, p_UserFeedback => p_MJConversationDetails_ParentID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_ParentID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_ParentID_SummaryOfEarlierConversation, p_UserID => p_MJConversationDetails_ParentID_UserID, p_ArtifactID => p_MJConversationDetails_ParentID_ArtifactID, p_ArtifactVersionID => p_MJConversationDetails_ParentID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_ParentID_CompletionTime, p_IsPinned => p_MJConversationDetails_ParentID_IsPinned, p_ParentID_Clear => 1, p_ParentID => p_MJConversationDetails_ParentID_ParentID, p_AgentID => p_MJConversationDetails_ParentID_AgentID, p_Status => p_MJConversationDetails_ParentID_Status, p_SuggestedResponses => p_MJConversationDetails_ParentID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_ParentID_TestRunID, p_ResponseForm => p_MJConversationDetails_ParentID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_ParentID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_ParentID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_ParentID_OriginalMessageChanged, p_AgentSessionID => p_MJConversationDetails_ParentID_AgentSessionID, p_TurnEndedAt => p_MJConversationDetails_ParentID_TurnEndedAt, p_UtteranceStartMs => p_MJConversationDetails_ParentID_UtteranceStartMs, p_UtteranceEndMs => p_MJConversationDetails_ParentID_UtteranceEndMs, p_MediaType => p_MJConversationDetails_ParentID_MediaType);

    END LOOP;

    
    -- Cascade update on Task using cursor to call spUpdateTask


    FOR _rec IN SELECT "ID", "ParentID", "Name", "Description", "TypeID", "EnvironmentID", "ProjectID", "ConversationDetailID", "UserID", "AgentID", "Status", "PercentComplete", "DueAt", "StartedAt", "CompletedAt", "InputPayload", "OutputPayload", "ErrorMessage", "AgentRunID", "ClaimedBy", "ClaimExpiresAt" FROM __mj."Task" WHERE "ConversationDetailID" = p_ID
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
        p_MJTasks_ConversationDetailID_InputPayload := _rec."InputPayload";
        p_MJTasks_ConversationDetailID_OutputPayload := _rec."OutputPayload";
        p_MJTasks_ConversationDetailID_ErrorMessage := _rec."ErrorMessage";
        p_MJTasks_ConversationDetailID_AgentRunID := _rec."AgentRunID";
        p_MJTasks_ConversationDetailID_ClaimedBy := _rec."ClaimedBy";
        p_MJTasks_ConversationDetailID_ClaimExpiresAt := _rec."ClaimExpiresAt";
        -- Set the FK field to NULL
        p_MJTasks_ConversationDetailID_ConversationDetailID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateTask"(p_ID => p_MJTasks_ConversationDetailIDID, p_ParentID => p_MJTasks_ConversationDetailID_ParentID, p_Name => p_MJTasks_ConversationDetailID_Name, p_Description => p_MJTasks_ConversationDetailID_Description, p_TypeID => p_MJTasks_ConversationDetailID_TypeID, p_EnvironmentID => p_MJTasks_ConversationDetailID_EnvironmentID, p_ProjectID => p_MJTasks_ConversationDetailID_ProjectID, p_ConversationDetailID_Clear => 1, p_ConversationDetailID => p_MJTasks_ConversationDetailID_ConversationDetailID, p_UserID => p_MJTasks_ConversationDetailID_UserID, p_AgentID => p_MJTasks_ConversationDetailID_AgentID, p_Status => p_MJTasks_ConversationDetailID_Status, p_PercentComplete => p_MJTasks_ConversationDetailID_PercentComplete, p_DueAt => p_MJTasks_ConversationDetailID_DueAt, p_StartedAt => p_MJTasks_ConversationDetailID_StartedAt, p_CompletedAt => p_MJTasks_ConversationDetailID_CompletedAt, p_InputPayload => p_MJTasks_ConversationDetailID_InputPayload, p_OutputPayload => p_MJTasks_ConversationDetailID_OutputPayload, p_ErrorMessage => p_MJTasks_ConversationDetailID_ErrorMessage, p_AgentRunID => p_MJTasks_ConversationDetailID_AgentRunID, p_ClaimedBy => p_MJTasks_ConversationDetailID_ClaimedBy, p_ClaimExpiresAt => p_MJTasks_ConversationDetailID_ClaimExpiresAt);

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
    p_MJAIAgentCredentials_AgentIDID UUID;
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
    p_MJSearchExecutionLogs_AIAgentID_AISkillID UUID;
    p_MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID UUID;
    p_MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON TEXT;
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
    p_MJTasks_AgentID_InputPayload TEXT;
    p_MJTasks_AgentID_OutputPayload TEXT;
    p_MJTasks_AgentID_ErrorMessage TEXT;
    p_MJTasks_AgentID_AgentRunID UUID;
    p_MJTasks_AgentID_ClaimedBy VARCHAR(100);
    p_MJTasks_AgentID_ClaimExpiresAt TIMESTAMPTZ;
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
    
    
    -- Cascade delete from AIAgentCredential using cursor to call spDeleteAIAgentCredential

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentCredential" WHERE "AgentID" = p_ID
    LOOP
        p_MJAIAgentCredentials_AgentIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentCredential"(p_ID => p_MJAIAgentCredentials_AgentIDID);
        
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


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite", "TokensCacheReadRollup", "TokensCacheWriteRollup" FROM __mj."AIPromptRun" WHERE "AgentID" = p_ID
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
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_AgentIDID, p_PromptID => p_MJAIPromptRuns_AgentID_PromptID, p_ModelID => p_MJAIPromptRuns_AgentID_ModelID, p_VendorID => p_MJAIPromptRuns_AgentID_VendorID, p_AgentID_Clear => 1, p_AgentID => p_MJAIPromptRuns_AgentID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_AgentID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_AgentID_RunAt, p_CompletedAt => p_MJAIPromptRuns_AgentID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_AgentID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_AgentID_Messages, p_Result => p_MJAIPromptRuns_AgentID_Result, p_TokensUsed => p_MJAIPromptRuns_AgentID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_AgentID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_AgentID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_AgentID_TotalCost, p_Success => p_MJAIPromptRuns_AgentID_Success, p_ErrorMessage => p_MJAIPromptRuns_AgentID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_AgentID_ParentID, p_RunType => p_MJAIPromptRuns_AgentID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_AgentID_ExecutionOrder, p_Cost => p_MJAIPromptRuns_AgentID_Cost, p_CostCurrency => p_MJAIPromptRuns_AgentID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_AgentID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_AgentID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_AgentID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_AgentID_Temperature, p_TopP => p_MJAIPromptRuns_AgentID_TopP, p_TopK => p_MJAIPromptRuns_AgentID_TopK, p_MinP => p_MJAIPromptRuns_AgentID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_AgentID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_AgentID_PresencePenalty, p_Seed => p_MJAIPromptRuns_AgentID_Seed, p_StopSequences => p_MJAIPromptRuns_AgentID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_AgentID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_AgentID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_AgentID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_AgentID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_AgentID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_AgentID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_AgentID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_AgentID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_AgentID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_AgentID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_AgentID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_AgentID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_AgentID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_AgentID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_AgentID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_AgentID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_AgentID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_AgentID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_AgentID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_AgentID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_AgentID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_AgentID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_AgentID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_AgentID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_AgentID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_AgentID_ModelSelection, p_Status => p_MJAIPromptRuns_AgentID_Status, p_Cancelled => p_MJAIPromptRuns_AgentID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_AgentID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_AgentID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_AgentID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_AgentID_CacheHit, p_CacheKey => p_MJAIPromptRuns_AgentID_CacheKey, p_JudgeID => p_MJAIPromptRuns_AgentID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_AgentID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_AgentID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_AgentID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_AgentID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_AgentID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_AgentID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_AgentID_QueueTime, p_PromptTime => p_MJAIPromptRuns_AgentID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_AgentID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_AgentID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_AgentID_EffortLevel, p_RunName => p_MJAIPromptRuns_AgentID_RunName, p_Comments => p_MJAIPromptRuns_AgentID_Comments, p_TestRunID => p_MJAIPromptRuns_AgentID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_AgentID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_AgentID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_AgentID_TokensCacheWrite, p_TokensCacheReadRollup => p_MJAIPromptRuns_AgentID_TokensCacheReadRollup, p_TokensCacheWriteRollup => p_MJAIPromptRuns_AgentID_TokensCacheWriteRollup);

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


    FOR _rec IN SELECT "ID", "ConversationID", "ExternalID", "Role", "Message", "Error", "HiddenToUser", "UserRating", "UserFeedback", "ReflectionInsights", "SummaryOfEarlierConversation", "UserID", "ArtifactID", "ArtifactVersionID", "CompletionTime", "IsPinned", "ParentID", "AgentID", "Status", "SuggestedResponses", "TestRunID", "ResponseForm", "ActionableCommands", "AutomaticCommands", "OriginalMessageChanged", "AgentSessionID", "TurnEndedAt", "UtteranceStartMs", "UtteranceEndMs", "MediaType" FROM __mj."ConversationDetail" WHERE "AgentID" = p_ID
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
        -- Set the FK field to NULL
        p_MJConversationDetails_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateConversationDetail"(p_ID => p_MJConversationDetails_AgentIDID, p_ConversationID => p_MJConversationDetails_AgentID_ConversationID, p_ExternalID => p_MJConversationDetails_AgentID_ExternalID, p_Role => p_MJConversationDetails_AgentID_Role, p_Message => p_MJConversationDetails_AgentID_Message, p_Error => p_MJConversationDetails_AgentID_Error, p_HiddenToUser => p_MJConversationDetails_AgentID_HiddenToUser, p_UserRating => p_MJConversationDetails_AgentID_UserRating, p_UserFeedback => p_MJConversationDetails_AgentID_UserFeedback, p_ReflectionInsights => p_MJConversationDetails_AgentID_ReflectionInsights, p_SummaryOfEarlierConversation => p_MJConversationDetails_AgentID_SummaryOfEarlierConversation, p_UserID => p_MJConversationDetails_AgentID_UserID, p_ArtifactID => p_MJConversationDetails_AgentID_ArtifactID, p_ArtifactVersionID => p_MJConversationDetails_AgentID_ArtifactVersionID, p_CompletionTime => p_MJConversationDetails_AgentID_CompletionTime, p_IsPinned => p_MJConversationDetails_AgentID_IsPinned, p_ParentID => p_MJConversationDetails_AgentID_ParentID, p_AgentID_Clear => 1, p_AgentID => p_MJConversationDetails_AgentID_AgentID, p_Status => p_MJConversationDetails_AgentID_Status, p_SuggestedResponses => p_MJConversationDetails_AgentID_SuggestedResponses, p_TestRunID => p_MJConversationDetails_AgentID_TestRunID, p_ResponseForm => p_MJConversationDetails_AgentID_ResponseForm, p_ActionableCommands => p_MJConversationDetails_AgentID_ActionableCommands, p_AutomaticCommands => p_MJConversationDetails_AgentID_AutomaticCommands, p_OriginalMessageChanged => p_MJConversationDetails_AgentID_OriginalMessageChanged, p_AgentSessionID => p_MJConversationDetails_AgentID_AgentSessionID, p_TurnEndedAt => p_MJConversationDetails_AgentID_TurnEndedAt, p_UtteranceStartMs => p_MJConversationDetails_AgentID_UtteranceStartMs, p_UtteranceEndMs => p_MJConversationDetails_AgentID_UtteranceEndMs, p_MediaType => p_MJConversationDetails_AgentID_MediaType);

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


    FOR _rec IN SELECT "ID", "SearchScopeID", "UserID", "AIAgentID", "Query", "TotalDurationMs", "ResultCount", "RerankerName", "RerankerCostCents", "Status", "FailureReason", "ProvidersJSON", "AISkillID", "PrimaryScopeRecordID", "ScopeDecisionJSON" FROM __mj."SearchExecutionLog" WHERE "AIAgentID" = p_ID
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
        p_MJSearchExecutionLogs_AIAgentID_AISkillID := _rec."AISkillID";
        p_MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON := _rec."ScopeDecisionJSON";
        -- Set the FK field to NULL
        p_MJSearchExecutionLogs_AIAgentID_AIAgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateSearchExecutionLog"(p_ID => p_MJSearchExecutionLogs_AIAgentIDID, p_SearchScopeID => p_MJSearchExecutionLogs_AIAgentID_SearchScopeID, p_UserID => p_MJSearchExecutionLogs_AIAgentID_UserID, p_AIAgentID_Clear => 1, p_AIAgentID => p_MJSearchExecutionLogs_AIAgentID_AIAgentID, p_Query => p_MJSearchExecutionLogs_AIAgentID_Query, p_TotalDurationMs => p_MJSearchExecutionLogs_AIAgentID_TotalDurationMs, p_ResultCount => p_MJSearchExecutionLogs_AIAgentID_ResultCount, p_RerankerName => p_MJSearchExecutionLogs_AIAgentID_RerankerName, p_RerankerCostCents => p_MJSearchExecutionLogs_AIAgentID_RerankerCostCents, p_Status => p_MJSearchExecutionLogs_AIAgentID_Status, p_FailureReason => p_MJSearchExecutionLogs_AIAgentID_FailureReason, p_ProvidersJSON => p_MJSearchExecutionLogs_AIAgentID_ProvidersJSON, p_AISkillID => p_MJSearchExecutionLogs_AIAgentID_AISkillID, p_PrimaryScopeRecordID => p_MJSearchExecutionLogs_AIAgentID_PrimaryScopeRecordID, p_ScopeDecisionJSON => p_MJSearchExecutionLogs_AIAgentID_ScopeDecisionJSON);

    END LOOP;

    
    -- Cascade update on Task using cursor to call spUpdateTask


    FOR _rec IN SELECT "ID", "ParentID", "Name", "Description", "TypeID", "EnvironmentID", "ProjectID", "ConversationDetailID", "UserID", "AgentID", "Status", "PercentComplete", "DueAt", "StartedAt", "CompletedAt", "InputPayload", "OutputPayload", "ErrorMessage", "AgentRunID", "ClaimedBy", "ClaimExpiresAt" FROM __mj."Task" WHERE "AgentID" = p_ID
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
        p_MJTasks_AgentID_InputPayload := _rec."InputPayload";
        p_MJTasks_AgentID_OutputPayload := _rec."OutputPayload";
        p_MJTasks_AgentID_ErrorMessage := _rec."ErrorMessage";
        p_MJTasks_AgentID_AgentRunID := _rec."AgentRunID";
        p_MJTasks_AgentID_ClaimedBy := _rec."ClaimedBy";
        p_MJTasks_AgentID_ClaimExpiresAt := _rec."ClaimExpiresAt";
        -- Set the FK field to NULL
        p_MJTasks_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateTask"(p_ID => p_MJTasks_AgentIDID, p_ParentID => p_MJTasks_AgentID_ParentID, p_Name => p_MJTasks_AgentID_Name, p_Description => p_MJTasks_AgentID_Description, p_TypeID => p_MJTasks_AgentID_TypeID, p_EnvironmentID => p_MJTasks_AgentID_EnvironmentID, p_ProjectID => p_MJTasks_AgentID_ProjectID, p_ConversationDetailID => p_MJTasks_AgentID_ConversationDetailID, p_UserID => p_MJTasks_AgentID_UserID, p_AgentID_Clear => 1, p_AgentID => p_MJTasks_AgentID_AgentID, p_Status => p_MJTasks_AgentID_Status, p_PercentComplete => p_MJTasks_AgentID_PercentComplete, p_DueAt => p_MJTasks_AgentID_DueAt, p_StartedAt => p_MJTasks_AgentID_StartedAt, p_CompletedAt => p_MJTasks_AgentID_CompletedAt, p_InputPayload => p_MJTasks_AgentID_InputPayload, p_OutputPayload => p_MJTasks_AgentID_OutputPayload, p_ErrorMessage => p_MJTasks_AgentID_ErrorMessage, p_AgentRunID => p_MJTasks_AgentID_AgentRunID, p_ClaimedBy => p_MJTasks_AgentID_ClaimedBy, p_ClaimExpiresAt => p_MJTasks_AgentID_ClaimExpiresAt);

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


-- ===================== Triggers =====================

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


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

-- ════════════════════════════════════════════════════════════════════════════════════
-- 4. One-time backfill: __TASK_METADATA__ / __TASK_OUTPUT__ markers -> columns
--
--    Legacy Description shape written by TaskOrchestrator:
--
--        {description}
--        <blank>
--        __TASK_METADATA__
--        {"inputPayload": {...}, ...}
--        <blank>                          <-- only when an output was also appended
--        __TASK_OUTPUT__
--        {"output": {...}}
--
--    Rows are converted in place and the markers stripped, so Description returns to
--    being a human description. Deliberately conservative: a row is only rewritten when
--    the extracted text actually parses as JSON, so a malformed marker is left untouched
--    for manual inspection rather than silently discarded.
--
--    This is the ONLY place the marker format is understood — Phase 1 application code
--    carries no fallback parse.
-- ════════════════════════════════════════════════════════════════════════════════════

WITH marked AS (
    SELECT
        "ID",
        "Description",
        POSITION('__TASK_METADATA__' || chr(10) IN "Description") AS "MetaPos",
        POSITION('__TASK_OUTPUT__'   || chr(10) IN "Description") AS "OutPos"
    FROM __mj."Task"
    -- NOTE: underscores are escaped. In T-SQL LIKE, `_` is a single-character wildcard, so
    -- an unescaped '%__TASK_METADATA__%' would match rows that merely resemble the marker.
    WHERE "Description" LIKE '%\_\_TASK\_METADATA\_\_%' ESCAPE '\'
       OR "Description" LIKE '%\_\_TASK\_OUTPUT\_\_%'   ESCAPE '\'
),
sliced AS (
    SELECT
        "ID",
        "Description",
        "MetaPos",
        "OutPos",
        -- JSON that follows the metadata marker: runs to the output marker if present,
        -- otherwise to the end of the string.
        CASE WHEN "MetaPos" > 0 THEN
            LTRIM(RTRIM(SUBSTRING(
                "Description",
                "MetaPos" + LENGTH('__TASK_METADATA__') + 1,
                CASE WHEN "OutPos" > "MetaPos"
                     THEN "OutPos" - ("MetaPos" + LENGTH('__TASK_METADATA__') + 1)
                     ELSE LENGTH("Description")
                END)))
        END AS "MetaJson",
        -- JSON that follows the output marker: always runs to the end.
        CASE WHEN "OutPos" > 0 THEN
            LTRIM(RTRIM(SUBSTRING(
                "Description",
                "OutPos" + LENGTH('__TASK_OUTPUT__') + 1,
                LENGTH("Description"))))
        END AS "OutJson",
        -- Description with everything from the first marker onward removed. Still carries
        -- the blank line that separated the prose from the marker; trimmed below.
        CASE
            WHEN "MetaPos" > 0 THEN LEFT("Description", "MetaPos" - 1)
            WHEN "OutPos"  > 0 THEN LEFT("Description", "OutPos"  - 1)
        END AS "RawDescription"
    FROM marked
),
trimmed AS (
    SELECT
        "ID",
        "Description",
        "MetaPos",
        "OutPos",
        "MetaJson",
        "OutJson",
        -- Strip trailing newlines. RTRIM removes spaces only, so a plain LTRIM(RTRIM(...))
        -- leaves the CR/LF pair that preceded the marker. LENGTH() ignores trailing SPACES,
        -- so measuring a whitespace-normalized copy and cutting the ORIGINAL to that
        -- length drops trailing CR/LF on every supported SQL Server version (no
        -- dependency on the 2022-only `TRIM(chars FROM ...)` syntax).
        LTRIM(LEFT(
            "RawDescription",
            LENGTH(REPLACE(REPLACE("RawDescription", chr(13), ' '), chr(10), ' '))
        )) AS "CleanDescription"
    FROM sliced
)
UPDATE __mj."Task" AS t
SET
    "InputPayload" = CASE
        WHEN s."MetaJson" IS NOT NULL AND (s."MetaJson") IS JSON
        THEN (s."MetaJson"::jsonb -> 'inputPayload')::text
        ELSE t."InputPayload"
    END,
    "OutputPayload" = CASE
        WHEN s."OutJson" IS NOT NULL AND (s."OutJson") IS JSON
        THEN (s."OutJson"::jsonb -> 'output')::text
        ELSE t."OutputPayload"
    END,
    "Description" = CASE
        -- Only rewrite when a marker was genuinely located (belt-and-braces against the
        -- LIKE above ever widening) AND every marker we found parsed as JSON. Anything
        -- else is left byte-for-byte intact for manual inspection.
        WHEN (s."MetaPos" > 0 OR s."OutPos" > 0)
         AND (s."MetaJson" IS NULL OR (s."MetaJson") IS JSON)
         AND (s."OutJson"  IS NULL OR (s."OutJson") IS JSON)
        THEN NULLIF(s."CleanDescription", '')
        ELSE t."Description"
    END
FROM
	trimmed s
WHERE
	s."ID" = t."ID";

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '90a53434-f817-472c-ab60-28db645385e2' OR ("EntityID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND "Name" = 'InputPayload')
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
        '90a53434-f817-472c-ab60-28db645385e2',
        '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- "Entity": "MJ": "Tasks"
        100049,
        'InputPayload',
        'Input Payload',
        'Structured input for this task, stored as JSON. Replaces the legacy __TASK_METADATA__ marker that was embedded in Description.',
        'TEXT',
        -1,
        0,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0dbe401e-846b-4ba5-90f5-880f6002be3a' OR ("EntityID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND "Name" = 'OutputPayload')
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
        '0dbe401e-846b-4ba5-90f5-880f6002be3a',
        '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- "Entity": "MJ": "Tasks"
        100050,
        'OutputPayload',
        'Output Payload',
        'Structured output produced by this task, stored as JSON. Downstream tasks read their dependencies'' outputs from here. Replaces the legacy __TASK_OUTPUT__ marker that was embedded in Description.',
        'TEXT',
        -1,
        0,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '459fabc9-0114-4c9a-bded-ea8bfe3a01a1' OR ("EntityID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND "Name" = 'ErrorMessage')
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
        '459fabc9-0114-4c9a-bded-ea8bfe3a01a1',
        '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- "Entity": "MJ": "Tasks"
        100051,
        'ErrorMessage',
        'Error Message',
        'Failure detail when Status is Failed. Null for tasks that have not failed.',
        'TEXT',
        -1,
        0,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4bbbbcc7-939d-4263-8e9e-739734722f01' OR ("EntityID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND "Name" = 'AgentRunID')
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
        '4bbbbcc7-939d-4263-8e9e-739734722f01',
        '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- "Entity": "MJ": "Tasks"
        100052,
        'AgentRunID',
        'Agent Run ID',
        'The specific AI Agent Run that executed this task. Distinct from the conversation-level link: sibling tasks in one graph each get their own run, so this is what run-history and Gantt views should follow.',
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
        '5190AF93-4C39-4429-BDAA-0AEB492A0256',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7248fce9-f49e-4e2a-92d8-a9415fc3e032' OR ("EntityID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND "Name" = 'ClaimedBy')
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
        '7248fce9-f49e-4e2a-92d8-a9415fc3e032',
        '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- "Entity": "MJ": "Tasks"
        100053,
        'ClaimedBy',
        'Claimed By',
        'Identifier of the dispatcher instance currently executing this task. Part of the compare-and-swap claim protocol; set only by the dispatcher, never by user-facing writes. Null when unclaimed. Human-assigned tasks never carry a claim.',
        'TEXT',
        200,
        0,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd1672ab4-9c50-4948-8098-3c19847559b9' OR ("EntityID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND "Name" = 'ClaimExpiresAt')
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
        'd1672ab4-9c50-4948-8098-3c19847559b9',
        '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- "Entity": "MJ": "Tasks"
        100054,
        'ClaimExpiresAt',
        'Claim Expires At',
        'When the current dispatcher claim lapses. Long-running tasks extend it by heartbeat; reconciliation treats an expired claim as an orphaned task and returns it to Pending.',
        'TIMESTAMPTZ',
        10,
        34,
        7,
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

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('da03086d-1b74-4356-81ac-edaa33e2c3f3', 'B04A327B-55BF-4914-9DCF-3552A5DD0293', 10, 'TaskGraph', 'TaskGraph', NOW(), NOW());

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=11 WHERE "ID"='BA69DCBC-B743-4DED-930D-6F0DB4E8C01E';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=12 WHERE "ID"='61F9CF39-ECB3-4476-9AFC-7F037F5EB34E';

/* SQL text to update entity field value sequence */

UPDATE __mj."EntityFieldValue" SET "Sequence"=13 WHERE "ID"='5E90D638-0329-4FF7-BA05-B38037474BF5';


/* Create Entity Relationship: MJ: AI Agent Runs -> MJ: Tasks (One To Many via AgentRunID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '1300ce73-c6a6-4050-a62e-cbfdf8ca46bb'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('1300ce73-c6a6-4050-a62e-cbfdf8ca46bb', '5190AF93-4C39-4429-BDAA-0AEB492A0256', '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', 'AgentRunID', 'One To Many', TRUE, TRUE, 14, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '24928914-3408-43f5-b68a-83fbe325d603' OR ("EntityID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND "Name" = 'AgentRun')
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
        '24928914-3408-43f5-b68a-83fbe325d603',
        '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- "Entity": "MJ": "Tasks"
        100062,
        'AgentRun',
        'Agent Run',
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
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FD227316-95F3-468B-8DB8-AEA5E3A4C431' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7B6A3F29-48A9-41B8-8374-214F12A5659C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0B5358D5-C6C2-4579-879E-D2BA19D95541' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.ParentID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Parent Task',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C866D300-E97C-44E7-8848-F3DA97CE3F77' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.TypeID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Task Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F8719181-09B2-4C98-86F1-9A7828F46D2B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.EnvironmentID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1B80F5CC-B3AD-4C4E-9F64-4C061AC14EC2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.ProjectID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E94662C2-69B9-4603-9BFC-279CFD42A222' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.ConversationDetailID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CCE153EB-99AC-42DD-9BF7-628C0E121C62' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.UserID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9F585440-DA55-4A2A-A48B-2937A3B24483' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.AgentID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A1E1C7BA-66FA-4BDC-A21A-A27AB8C577C4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.Parent

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2344E41B-6F21-419A-B80F-43636478A814' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.ConversationDetail

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Conversation',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2E0A3E85-A949-41A8-9B8B-5303EF016D72' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.User

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1EFAD61D-3A38-4CEA-86FE-67463E887920' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.Agent

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E7951B0E-3F0A-45DA-BFC3-A4ABB3AC5E0C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.RootParentID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Root Task',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '18585DF4-33D0-4CFC-95E4-6674186DCD9C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.Name

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Task Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '55602C1C-FB4A-4678-A847-7889860791D5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.Description

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '24940E6C-FC69-40F1-9EA6-D860F38FC93F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.Status

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9320E9C7-764E-401B-BF2D-A07358E4DD00' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.PercentComplete

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8071305E-E1C1-48BF-AE70-E345D6B892EE' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.Type

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Task Type Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E1E5F477-3ABE-4793-BC11-A719CB078463' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.Environment

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9A8AEAF5-9065-4B87-8A63-B04F84E83886' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.Project

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '65ABF2B8-3355-4427-828B-E3082806C557' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.DueAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Due Date',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '97A0A3EA-5563-4C55-9935-397C26BFD00A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.StartedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B267C59C-3370-4EDF-A9D4-106D46A6BBF4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.CompletedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F09901B1-A4C3-4845-A639-B9730146021A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.InputPayload

UPDATE __mj."EntityField"
SET 
   "Category" = 'Task Execution Data',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '90A53434-F817-472C-AB60-28DB645385E2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.OutputPayload

UPDATE __mj."EntityField"
SET 
   "Category" = 'Task Execution Data',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '0DBE401E-846B-4BA5-90F5-880F6002BE3A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.ErrorMessage

UPDATE __mj."EntityField"
SET 
   "Category" = 'Task Execution Data',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '459FABC9-0114-4C9A-BDED-EA8BFE3A01A1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.AgentRunID

UPDATE __mj."EntityField"
SET 
   "Category" = 'Task Execution Data',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4BBBBCC7-939D-4263-8E9E-739734722F01' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.ClaimedBy

UPDATE __mj."EntityField"
SET 
   "Category" = 'Task Execution Data',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7248FCE9-F49E-4E2A-92D8-A9415FC3E032' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.ClaimExpiresAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'Task Execution Data',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D1672AB4-9C50-4948-8098-3C19847559B9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.AgentRun

UPDATE __mj."EntityField"
SET 
   "Category" = 'Task Execution Data',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '24928914-3408-43F5-B68A-83FBE325D603' AND "AutoUpdateCategory" = TRUE;

/* Update FieldCategoryInfo setting for entity */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Task Execution Data":{"icon":"fa fa-terminal","description":"Technical data related to task processing, agent runs, and dispatcher claims"}}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND "Name" = 'FieldCategoryInfo';

/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Task Execution Data":"fa fa-terminal"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND "Name" = 'FieldCategoryIcons';


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE __mj."Task"
 ADD CONSTRAINT "FK_Task_AIAgentRun" FOREIGN KEY ("AgentRunID")
        REFERENCES __mj."AIAgentRun"("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE __mj."AIAgentRunStep"
 ADD CONSTRAINT "CK_AIAgentRunStep_StepType" CHECK ("StepType" IN (
        'Actions', 'Chat', 'Compaction', 'Decision', 'ForEach', 'Plan', 'Prompt',
        'Skill', 'Sub-Agent', 'TaskGraph', 'Tool', 'Validation', 'While'
    )) NOT VALID;


-- ===================== Grants =====================

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
/* SQL text to insert 1 new entity field(s) */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."Task"."InputPayload" IS 'Structured input for this task, stored as JSON. Replaces the legacy __TASK_METADATA__ marker that was embedded in Description.';

COMMENT ON COLUMN __mj."Task"."OutputPayload" IS 'Structured output produced by this task, stored as JSON. Downstream tasks read their dependencies'' outputs from here. Replaces the legacy __TASK_OUTPUT__ marker that was embedded in Description.';

COMMENT ON COLUMN __mj."Task"."ErrorMessage" IS 'Failure detail when Status is Failed. Null for tasks that have not failed.';

COMMENT ON COLUMN __mj."Task"."AgentRunID" IS 'The specific AI Agent Run that executed this task. Distinct from the conversation-level link: sibling tasks in one graph each get their own run, so this is what run-history and Gantt views should follow.';

COMMENT ON COLUMN __mj."Task"."ClaimedBy" IS 'Identifier of the dispatcher instance currently executing this task. Part of the compare-and-swap claim protocol; set only by the dispatcher, never by user-facing writes. Null when unclaimed. Human-assigned tasks never carry a claim.';

COMMENT ON COLUMN __mj."Task"."ClaimExpiresAt" IS 'When the current dispatcher claim lapses. Long-running tasks extend it by heartbeat; reconciliation treats an expired claim as an orphaned task and returns it to Pending.';


-- ===================== Other =====================

/*
================================================================================================
================================================================================================
====                                                                                        ====
====                  GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL                          ====
====                          DO NOT EDIT BY HAND                                           ====
====                                                                                        ====
================================================================================================
================================================================================================

Everything below this block was produced by `mj codegen` against a database carrying the
hand-written DDL above. It is the generated counterpart of that DDL.

WHAT IT CONTAINS
  * New EntityField rows for the six Task columns (InputPayload, OutputPayload, ErrorMessage,
    AgentRunID, ClaimedBy, ClaimExpiresAt) plus the related-entity-name-field-map entry for
    AgentRunID -> AI Agent Runs.
  * The new 'TaskGraph' EntityFieldValue for AIAgentRunStep.StepType, re-derived from the
    rewritten CHECK constraint (which is why the constraint is dropped and re-added above
    rather than edited).
  * Regenerated base views and spCreate/spUpdate/spDelete procedures for the affected
    entities: MJ: Tasks, MJ: AI Agent Runs, MJ: AI Agents, MJ: Conversation Details.

Verified on generation: references __mj throughout with no hardcoded schema
name, and every statement is attributable to the DDL above.

IF THE HAND-WRITTEN DDL ABOVE CHANGES, DO NOT PATCH THIS SECTION BY HAND.
Re-run CodeGen and replace this entire generated section wholesale.
================================================================================================
*/

/* SQL text to insert 6 new entity field(s) */

/* spUpdate Permissions for MJ: Tasks */
