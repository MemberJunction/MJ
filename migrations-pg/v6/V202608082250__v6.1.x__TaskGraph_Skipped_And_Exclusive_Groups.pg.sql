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

ALTER TABLE __mj."Task" DROP CONSTRAINT IF EXISTS "CK_Task_Status";

/* ---------------------------------------------------------------------------------------------
   2. TaskDependency — ordering and exclusive-group membership.
   --------------------------------------------------------------------------------------------- */
ALTER TABLE __mj."TaskDependency"
 ADD COLUMN IF NOT EXISTS "Priority"       INTEGER             NOT NULL CONSTRAINT "DF_TaskDependency_Priority" DEFAULT (0),
 ADD COLUMN IF NOT EXISTS "Sequence"       INTEGER             NOT NULL CONSTRAINT "DF_TaskDependency_Sequence" DEFAULT (0),
 ADD COLUMN IF NOT EXISTS "ExclusiveGroup" VARCHAR(255)   NULL;

/* ----------------------------------------------------------------------------------------------
   Give a Task row enough information to BE a workflow step.

   A workflow now compiles to a task graph and executes on the dispatcher, so a Task row has to
   carry what a workflow step carries: what kind of step it is, its kind-specific settings, how its
   input and output map onto the shared payload, and its execution policy. Today it can express only
   the first of those, and only for two of the seven kinds, through the AgentID and ActionID keys.

   Two consequences, both silent:

     1. A step that was neither agent nor action had nowhere to say what it was, so persistence fell
        through to "a person's task, assigned to whoever submitted it". A loop step became an
        approval request nobody wrote and no screen offers, and the workflow sat in Pending looking
        like it was politely waiting on someone.

     2. The input and output mappings were dropped on the way in. Those mappings are the only way a
        step's result reaches the payload, and branch conditions read the payload -- so the first
        branch in any real workflow could never evaluate. The Demo workflow branches on
        `payload.stockPrice > 500`, and stockPrice exists only because its first step maps
        CurrentPrice -> stockPrice. Without the mapping the condition has nothing to read.

   So this is not "add loop support". It is the set of columns without which a dispatched workflow
   cannot pass data between its own steps.

   Why two columns and one JSON bag, rather than eight columns:

     * StepType is the discriminator, so it must be a real column. The dispatcher's claiming query
       is SQL; routing on JSON_VALUE there is unindexable, and "find every loop step" should be a
       WHERE clause rather than a scan that parses JSON per row. Its value list is derived by
       CodeGen from the CHECK constraint below, which is what makes the generated union trustworthy.

       NOTE for readers who know AIAgentStep: this column is deliberately NOT the same value set as
       AIAgentStep.StepType, which is ('Action','ForEach','Prompt','Sub-Agent','While'). This one is
       the executable vocabulary -- 'Agent' rather than 'Sub-Agent', plus 'Human' and 'External',
       which a design-time step cannot express. Compilation maps between them. Same name, different
       lists, on purpose: they describe a step at two different stages of its life.

     * PromptID is a real foreign key for the same reason AgentID and ActionID are. A prompt name
       inside a JSON blob cannot be joined, cannot be constrained, and does not survive a rename.

     * Everything else -- kind-specific settings, the payload mappings, the execution policy -- goes
       into Configuration as a JSONType. None of it is ever a SQL predicate: the dispatcher loads
       the row and reads it in TypeScript. Keeping it in one typed bag means a new step kind, or a
       new policy knob, is a JSONType edit plus CodeGen rather than another migration. The typed
       shape lives in metadata/entities/JSONType-interfaces/ITaskStepConfiguration.ts and reaches
       the database through mj sync push, which is why CodeGen must run AFTER that push.

   NULL StepType is legal and meaningful: it is a Task that is not part of a workflow at all -- a
   hand-authored to-do. Defaulting the column would assert a kind for every such row.
   ---------------------------------------------------------------------------------------------- */

ALTER TABLE __mj."Task"
 ADD COLUMN IF NOT EXISTS "StepType" VARCHAR(20) NULL,
 ADD COLUMN IF NOT EXISTS "PromptID" UUID NULL,
 ADD COLUMN IF NOT EXISTS "Configuration" TEXT NULL;

ALTER TABLE __mj."Task" DROP CONSTRAINT IF EXISTS "CK_Task_Assignment";

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ActionExecutionLog_ActionID" ON __mj."ActionExecutionLog" ("ActionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ActionExecutionLog_UserID" ON __mj."ActionExecutionLog" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ActionExecutionLog_EntityActionID" ON __mj."ActionExecutionLog" ("EntityActionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ActionExecutionLog_EntityActionInvoca_7e70ad5b" ON __mj."ActionExecutionLog" ("EntityActionInvocationTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ActionExecutionLog_TargetEntityID" ON __mj."ActionExecutionLog" ("TargetEntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityActionFilter_EntityActionID" ON __mj."EntityActionFilter" ("EntityActionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityActionFilter_ActionFilterID" ON __mj."EntityActionFilter" ("ActionFilterID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityActionInvocation_EntityActionID" ON __mj."EntityActionInvocation" ("EntityActionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityActionInvocation_InvocationTypeID" ON __mj."EntityActionInvocation" ("InvocationTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityActionParam_EntityActionID" ON __mj."EntityActionParam" ("EntityActionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityActionParam_ActionParamID" ON __mj."EntityActionParam" ("ActionParamID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TaskDependency_TaskID" ON __mj."TaskDependency" ("TaskID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_TaskDependency_DependsOnTaskID" ON __mj."TaskDependency" ("DependsOnTaskID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_ParentID" ON __mj."Task" ("ParentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_TypeID" ON __mj."Task" ("TypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_EnvironmentID" ON __mj."Task" ("EnvironmentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_ProjectID" ON __mj."Task" ("ProjectID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_ConversationDetailID" ON __mj."Task" ("ConversationDetailID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_UserID" ON __mj."Task" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_AgentID" ON __mj."Task" ("AgentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_AgentRunID" ON __mj."Task" ("AgentRunID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_ActionID" ON __mj."Task" ("ActionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Task_PromptID" ON __mj."Task" ("PromptID");


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
  v_target_name CONSTANT TEXT := 'vwActionExecutionLogs';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwActionExecutionLogs"
AS SELECT
    a.*,
    "MJAction_ActionID"."Name" AS "Action",
    "MJUser_UserID"."Name" AS "User",
    "MJEntityActionInvocationType_EntityActionInvocationTypeID"."Name" AS "EntityActionInvocationType",
    "MJEntity_TargetEntityID"."Name" AS "TargetEntity"
FROM
    __mj."ActionExecutionLog" AS a
INNER JOIN
    __mj."Action" AS "MJAction_ActionID"
  ON
    a."ActionID" = "MJAction_ActionID"."ID"
INNER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    a."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."EntityActionInvocationType" AS "MJEntityActionInvocationType_EntityActionInvocationTypeID"
  ON
    a."EntityActionInvocationTypeID" = "MJEntityActionInvocationType_EntityActionInvocationTypeID"."ID"
LEFT OUTER JOIN
    __mj."Entity" AS "MJEntity_TargetEntityID"
  ON
    a."TargetEntityID" = "MJEntity_TargetEntityID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwEntityActionFilters';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwEntityActionFilters"
AS SELECT
    e.*,
    "MJActionFilter_ActionFilterID"."UserDescription" AS "ActionFilter"
FROM
    __mj."EntityActionFilter" AS e
INNER JOIN
    __mj."ActionFilter" AS "MJActionFilter_ActionFilterID"
  ON
    e."ActionFilterID" = "MJActionFilter_ActionFilterID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwEntityActionInvocations';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwEntityActionInvocations"
AS SELECT
    e.*,
    "MJEntityActionInvocationType_InvocationTypeID"."Name" AS "InvocationType"
FROM
    __mj."EntityActionInvocation" AS e
INNER JOIN
    __mj."EntityActionInvocationType" AS "MJEntityActionInvocationType_InvocationTypeID"
  ON
    e."InvocationTypeID" = "MJEntityActionInvocationType_InvocationTypeID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwEntityActionParams';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwEntityActionParams"
AS SELECT
    e.*,
    "MJActionParam_ActionParamID"."Name" AS "ActionParam"
FROM
    __mj."EntityActionParam" AS e
INNER JOIN
    __mj."ActionParam" AS "MJActionParam_ActionParamID"
  ON
    e."ActionParamID" = "MJActionParam_ActionParamID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwTaskDependencies';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwTaskDependencies"
AS SELECT
    t.*,
    "MJTask_TaskID"."Name" AS "Task",
    "MJTask_DependsOnTaskID"."Name" AS "DependsOnTask"
FROM
    __mj."TaskDependency" AS t
INNER JOIN
    __mj."Task" AS "MJTask_TaskID"
  ON
    t."TaskID" = "MJTask_TaskID"."ID"
INNER JOIN
    __mj."Task" AS "MJTask_DependsOnTaskID"
  ON
    t."DependsOnTaskID" = "MJTask_DependsOnTaskID"."ID"$vsql$;
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
    "MJAIAgentRun_AgentRunID"."RunName" AS "AgentRun",
    "MJAction_ActionID"."Name" AS "Action",
    "MJAIPrompt_PromptID"."Name" AS "Prompt",
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
LEFT OUTER JOIN
    __mj."Action" AS "MJAction_ActionID"
  ON
    t."ActionID" = "MJAction_ActionID"."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS "MJAIPrompt_PromptID"
  ON
    t."PromptID" = "MJAIPrompt_PromptID"."ID"
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
           WHERE proname = 'spCreateActionExecutionLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateActionExecutionLog"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ActionID UUID DEFAULT NULL,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_EndedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_EndedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Params_Clear BOOLEAN DEFAULT FALSE,
    IN p_Params TEXT DEFAULT NULL,
    IN p_ResultCode_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResultCode VARCHAR(255) DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_RetentionPeriod_Clear BOOLEAN DEFAULT FALSE,
    IN p_RetentionPeriod INTEGER DEFAULT NULL,
    IN p_Message_Clear BOOLEAN DEFAULT FALSE,
    IN p_Message TEXT DEFAULT NULL,
    IN p_EntityActionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityActionID UUID DEFAULT NULL,
    IN p_EntityActionInvocationTypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityActionInvocationTypeID UUID DEFAULT NULL,
    IN p_TargetEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TargetEntityID UUID DEFAULT NULL,
    IN p_TargetRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TargetRecordID VARCHAR(450) DEFAULT NULL,
    IN p_ResultParams_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResultParams TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwActionExecutionLogs" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ActionExecutionLog"
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
                p_ID,
                p_ActionID,
                COALESCE(p_StartedAt, NOW()),
                CASE WHEN p_EndedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_EndedAt, NULL) END,
                CASE WHEN p_Params_Clear = TRUE THEN NULL ELSE COALESCE(p_Params, NULL) END,
                CASE WHEN p_ResultCode_Clear = TRUE THEN NULL ELSE COALESCE(p_ResultCode, NULL) END,
                p_UserID,
                CASE WHEN p_RetentionPeriod_Clear = TRUE THEN NULL ELSE COALESCE(p_RetentionPeriod, NULL) END,
                CASE WHEN p_Message_Clear = TRUE THEN NULL ELSE COALESCE(p_Message, NULL) END,
                CASE WHEN p_EntityActionID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityActionID, NULL) END,
                CASE WHEN p_EntityActionInvocationTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityActionInvocationTypeID, NULL) END,
                CASE WHEN p_TargetEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_TargetEntityID, NULL) END,
                CASE WHEN p_TargetRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_TargetRecordID, NULL) END,
                CASE WHEN p_ResultParams_Clear = TRUE THEN NULL ELSE COALESCE(p_ResultParams, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ActionExecutionLog"
            (
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
                p_ActionID,
                COALESCE(p_StartedAt, NOW()),
                CASE WHEN p_EndedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_EndedAt, NULL) END,
                CASE WHEN p_Params_Clear = TRUE THEN NULL ELSE COALESCE(p_Params, NULL) END,
                CASE WHEN p_ResultCode_Clear = TRUE THEN NULL ELSE COALESCE(p_ResultCode, NULL) END,
                p_UserID,
                CASE WHEN p_RetentionPeriod_Clear = TRUE THEN NULL ELSE COALESCE(p_RetentionPeriod, NULL) END,
                CASE WHEN p_Message_Clear = TRUE THEN NULL ELSE COALESCE(p_Message, NULL) END,
                CASE WHEN p_EntityActionID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityActionID, NULL) END,
                CASE WHEN p_EntityActionInvocationTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityActionInvocationTypeID, NULL) END,
                CASE WHEN p_TargetEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_TargetEntityID, NULL) END,
                CASE WHEN p_TargetRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_TargetRecordID, NULL) END,
                CASE WHEN p_ResultParams_Clear = TRUE THEN NULL ELSE COALESCE(p_ResultParams, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwActionExecutionLogs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateActionExecutionLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateActionExecutionLog"(
    IN p_ID UUID,
    IN p_ActionID UUID DEFAULT NULL,
    IN p_StartedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_EndedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_EndedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Params_Clear BOOLEAN DEFAULT FALSE,
    IN p_Params TEXT DEFAULT NULL,
    IN p_ResultCode_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResultCode VARCHAR(255) DEFAULT NULL,
    IN p_UserID UUID DEFAULT NULL,
    IN p_RetentionPeriod_Clear BOOLEAN DEFAULT FALSE,
    IN p_RetentionPeriod INTEGER DEFAULT NULL,
    IN p_Message_Clear BOOLEAN DEFAULT FALSE,
    IN p_Message TEXT DEFAULT NULL,
    IN p_EntityActionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityActionID UUID DEFAULT NULL,
    IN p_EntityActionInvocationTypeID_Clear BOOLEAN DEFAULT FALSE,
    IN p_EntityActionInvocationTypeID UUID DEFAULT NULL,
    IN p_TargetEntityID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TargetEntityID UUID DEFAULT NULL,
    IN p_TargetRecordID_Clear BOOLEAN DEFAULT FALSE,
    IN p_TargetRecordID VARCHAR(450) DEFAULT NULL,
    IN p_ResultParams_Clear BOOLEAN DEFAULT FALSE,
    IN p_ResultParams TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwActionExecutionLogs" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ActionExecutionLog"
    SET
        "ActionID" = COALESCE(p_ActionID, "ActionID"),
        "StartedAt" = COALESCE(p_StartedAt, "StartedAt"),
        "EndedAt" = CASE WHEN p_EndedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_EndedAt, "EndedAt") END,
        "Params" = CASE WHEN p_Params_Clear = TRUE THEN NULL ELSE COALESCE(p_Params, "Params") END,
        "ResultCode" = CASE WHEN p_ResultCode_Clear = TRUE THEN NULL ELSE COALESCE(p_ResultCode, "ResultCode") END,
        "UserID" = COALESCE(p_UserID, "UserID"),
        "RetentionPeriod" = CASE WHEN p_RetentionPeriod_Clear = TRUE THEN NULL ELSE COALESCE(p_RetentionPeriod, "RetentionPeriod") END,
        "Message" = CASE WHEN p_Message_Clear = TRUE THEN NULL ELSE COALESCE(p_Message, "Message") END,
        "EntityActionID" = CASE WHEN p_EntityActionID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityActionID, "EntityActionID") END,
        "EntityActionInvocationTypeID" = CASE WHEN p_EntityActionInvocationTypeID_Clear = TRUE THEN NULL ELSE COALESCE(p_EntityActionInvocationTypeID, "EntityActionInvocationTypeID") END,
        "TargetEntityID" = CASE WHEN p_TargetEntityID_Clear = TRUE THEN NULL ELSE COALESCE(p_TargetEntityID, "TargetEntityID") END,
        "TargetRecordID" = CASE WHEN p_TargetRecordID_Clear = TRUE THEN NULL ELSE COALESCE(p_TargetRecordID, "TargetRecordID") END,
        "ResultParams" = CASE WHEN p_ResultParams_Clear = TRUE THEN NULL ELSE COALESCE(p_ResultParams, "ResultParams") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwActionExecutionLogs" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwActionExecutionLogs" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteActionExecutionLog'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteActionExecutionLog"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ActionExecutionLog"
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
           WHERE proname = 'spCreateEntityActionFilter'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateEntityActionFilter"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityActionID UUID DEFAULT NULL,
    IN p_ActionFilterID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityActionFilters" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityActionFilter"
            (
                "ID",
                "EntityActionID",
                "ActionFilterID",
                "Sequence",
                "Status"
            )
        VALUES
            (
                p_ID,
                p_EntityActionID,
                p_ActionFilterID,
                p_Sequence,
                COALESCE(p_Status, 'Pending')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityActionFilter"
            (
                "EntityActionID",
                "ActionFilterID",
                "Sequence",
                "Status"
            )
        VALUES
            (
                p_EntityActionID,
                p_ActionFilterID,
                p_Sequence,
                COALESCE(p_Status, 'Pending')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityActionFilters" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateEntityActionFilter'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateEntityActionFilter"(
    IN p_ID UUID,
    IN p_EntityActionID UUID DEFAULT NULL,
    IN p_ActionFilterID UUID DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityActionFilters" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityActionFilter"
    SET
        "EntityActionID" = COALESCE(p_EntityActionID, "EntityActionID"),
        "ActionFilterID" = COALESCE(p_ActionFilterID, "ActionFilterID"),
        "Sequence" = COALESCE(p_Sequence, "Sequence"),
        "Status" = COALESCE(p_Status, "Status")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityActionFilters" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityActionFilters" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateEntityActionInvocation'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateEntityActionInvocation"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityActionID UUID DEFAULT NULL,
    IN p_InvocationTypeID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_RuntimeUXDriverClass_Clear BOOLEAN DEFAULT FALSE,
    IN p_RuntimeUXDriverClass VARCHAR(255) DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityActionInvocations" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityActionInvocation"
            (
                "ID",
                "EntityActionID",
                "InvocationTypeID",
                "Status",
                "RuntimeUXDriverClass"
            )
        VALUES
            (
                p_ID,
                p_EntityActionID,
                p_InvocationTypeID,
                COALESCE(p_Status, 'Pending'),
                CASE WHEN p_RuntimeUXDriverClass_Clear = TRUE THEN NULL ELSE COALESCE(p_RuntimeUXDriverClass, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityActionInvocation"
            (
                "EntityActionID",
                "InvocationTypeID",
                "Status",
                "RuntimeUXDriverClass"
            )
        VALUES
            (
                p_EntityActionID,
                p_InvocationTypeID,
                COALESCE(p_Status, 'Pending'),
                CASE WHEN p_RuntimeUXDriverClass_Clear = TRUE THEN NULL ELSE COALESCE(p_RuntimeUXDriverClass, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityActionInvocations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateEntityActionInvocation'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateEntityActionInvocation"(
    IN p_ID UUID,
    IN p_EntityActionID UUID DEFAULT NULL,
    IN p_InvocationTypeID UUID DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_RuntimeUXDriverClass_Clear BOOLEAN DEFAULT FALSE,
    IN p_RuntimeUXDriverClass VARCHAR(255) DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityActionInvocations" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityActionInvocation"
    SET
        "EntityActionID" = COALESCE(p_EntityActionID, "EntityActionID"),
        "InvocationTypeID" = COALESCE(p_InvocationTypeID, "InvocationTypeID"),
        "Status" = COALESCE(p_Status, "Status"),
        "RuntimeUXDriverClass" = CASE WHEN p_RuntimeUXDriverClass_Clear = TRUE THEN NULL ELSE COALESCE(p_RuntimeUXDriverClass, "RuntimeUXDriverClass") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityActionInvocations" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityActionInvocations" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateEntityActionParam'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateEntityActionParam"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityActionID UUID DEFAULT NULL,
    IN p_ActionParamID UUID DEFAULT NULL,
    IN p_ValueType VARCHAR(20) DEFAULT NULL,
    IN p_Value_Clear BOOLEAN DEFAULT FALSE,
    IN p_Value TEXT DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_LogValue_Clear BOOLEAN DEFAULT FALSE,
    IN p_LogValue BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityActionParams" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityActionParam"
            (
                "ID",
                "EntityActionID",
                "ActionParamID",
                "ValueType",
                "Value",
                "Comments",
                "LogValue"
            )
        VALUES
            (
                p_ID,
                p_EntityActionID,
                p_ActionParamID,
                p_ValueType,
                CASE WHEN p_Value_Clear = TRUE THEN NULL ELSE COALESCE(p_Value, NULL) END,
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END,
                CASE WHEN p_LogValue_Clear = TRUE THEN NULL ELSE COALESCE(p_LogValue, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityActionParam"
            (
                "EntityActionID",
                "ActionParamID",
                "ValueType",
                "Value",
                "Comments",
                "LogValue"
            )
        VALUES
            (
                p_EntityActionID,
                p_ActionParamID,
                p_ValueType,
                CASE WHEN p_Value_Clear = TRUE THEN NULL ELSE COALESCE(p_Value, NULL) END,
                CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, NULL) END,
                CASE WHEN p_LogValue_Clear = TRUE THEN NULL ELSE COALESCE(p_LogValue, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityActionParams" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateEntityActionParam'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateEntityActionParam"(
    IN p_ID UUID,
    IN p_EntityActionID UUID DEFAULT NULL,
    IN p_ActionParamID UUID DEFAULT NULL,
    IN p_ValueType VARCHAR(20) DEFAULT NULL,
    IN p_Value_Clear BOOLEAN DEFAULT FALSE,
    IN p_Value TEXT DEFAULT NULL,
    IN p_Comments_Clear BOOLEAN DEFAULT FALSE,
    IN p_Comments TEXT DEFAULT NULL,
    IN p_LogValue_Clear BOOLEAN DEFAULT FALSE,
    IN p_LogValue BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityActionParams" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityActionParam"
    SET
        "EntityActionID" = COALESCE(p_EntityActionID, "EntityActionID"),
        "ActionParamID" = COALESCE(p_ActionParamID, "ActionParamID"),
        "ValueType" = COALESCE(p_ValueType, "ValueType"),
        "Value" = CASE WHEN p_Value_Clear = TRUE THEN NULL ELSE COALESCE(p_Value, "Value") END,
        "Comments" = CASE WHEN p_Comments_Clear = TRUE THEN NULL ELSE COALESCE(p_Comments, "Comments") END,
        "LogValue" = CASE WHEN p_LogValue_Clear = TRUE THEN NULL ELSE COALESCE(p_LogValue, "LogValue") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityActionParams" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityActionParams" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityActionFilter'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityActionFilter"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityActionFilter"
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
           WHERE proname = 'spDeleteEntityActionInvocation'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityActionInvocation"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityActionInvocation"
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
           WHERE proname = 'spDeleteEntityActionParam'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityActionParam"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityActionParam"
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
           WHERE proname = 'spCreateTaskDependency'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateTaskDependency"(
    IN p_ID UUID DEFAULT NULL,
    IN p_TaskID UUID DEFAULT NULL,
    IN p_DependsOnTaskID UUID DEFAULT NULL,
    IN p_DependencyType VARCHAR(50) DEFAULT NULL,
    IN p_Condition_Clear BOOLEAN DEFAULT FALSE,
    IN p_Condition TEXT DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_ExclusiveGroup_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExclusiveGroup VARCHAR(255) DEFAULT NULL
)
RETURNS SETOF __mj."vwTaskDependencies" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."TaskDependency"
            (
                "ID",
                "TaskID",
                "DependsOnTaskID",
                "DependencyType",
                "Condition",
                "Priority",
                "Sequence",
                "ExclusiveGroup"
            )
        VALUES
            (
                p_ID,
                p_TaskID,
                p_DependsOnTaskID,
                COALESCE(p_DependencyType, 'Prerequisite'),
                CASE WHEN p_Condition_Clear = TRUE THEN NULL ELSE COALESCE(p_Condition, NULL) END,
                COALESCE(p_Priority, 0),
                COALESCE(p_Sequence, 0),
                CASE WHEN p_ExclusiveGroup_Clear = TRUE THEN NULL ELSE COALESCE(p_ExclusiveGroup, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."TaskDependency"
            (
                "TaskID",
                "DependsOnTaskID",
                "DependencyType",
                "Condition",
                "Priority",
                "Sequence",
                "ExclusiveGroup"
            )
        VALUES
            (
                p_TaskID,
                p_DependsOnTaskID,
                COALESCE(p_DependencyType, 'Prerequisite'),
                CASE WHEN p_Condition_Clear = TRUE THEN NULL ELSE COALESCE(p_Condition, NULL) END,
                COALESCE(p_Priority, 0),
                COALESCE(p_Sequence, 0),
                CASE WHEN p_ExclusiveGroup_Clear = TRUE THEN NULL ELSE COALESCE(p_ExclusiveGroup, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwTaskDependencies" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateTaskDependency'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateTaskDependency"(
    IN p_ID UUID,
    IN p_TaskID UUID DEFAULT NULL,
    IN p_DependsOnTaskID UUID DEFAULT NULL,
    IN p_DependencyType VARCHAR(50) DEFAULT NULL,
    IN p_Condition_Clear BOOLEAN DEFAULT FALSE,
    IN p_Condition TEXT DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_ExclusiveGroup_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExclusiveGroup VARCHAR(255) DEFAULT NULL
)
RETURNS SETOF __mj."vwTaskDependencies" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."TaskDependency"
    SET
        "TaskID" = COALESCE(p_TaskID, "TaskID"),
        "DependsOnTaskID" = COALESCE(p_DependsOnTaskID, "DependsOnTaskID"),
        "DependencyType" = COALESCE(p_DependencyType, "DependencyType"),
        "Condition" = CASE WHEN p_Condition_Clear = TRUE THEN NULL ELSE COALESCE(p_Condition, "Condition") END,
        "Priority" = COALESCE(p_Priority, "Priority"),
        "Sequence" = COALESCE(p_Sequence, "Sequence"),
        "ExclusiveGroup" = CASE WHEN p_ExclusiveGroup_Clear = TRUE THEN NULL ELSE COALESCE(p_ExclusiveGroup, "ExclusiveGroup") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwTaskDependencies" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwTaskDependencies" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteTaskDependency'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteTaskDependency"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."TaskDependency"
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
    IN p_ClaimExpiresAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ActionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ActionID UUID DEFAULT NULL,
    IN p_StepType_Clear BOOLEAN DEFAULT FALSE,
    IN p_StepType VARCHAR(20) DEFAULT NULL,
    IN p_PromptID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PromptID UUID DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL
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
                "ClaimExpiresAt",
                "ActionID",
                "StepType",
                "PromptID",
                "Configuration"
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
                CASE WHEN p_ClaimExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ClaimExpiresAt, NULL) END,
                CASE WHEN p_ActionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ActionID, NULL) END,
                CASE WHEN p_StepType_Clear = TRUE THEN NULL ELSE COALESCE(p_StepType, NULL) END,
                CASE WHEN p_PromptID_Clear = TRUE THEN NULL ELSE COALESCE(p_PromptID, NULL) END,
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END
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
                "ClaimExpiresAt",
                "ActionID",
                "StepType",
                "PromptID",
                "Configuration"
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
                CASE WHEN p_ClaimExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ClaimExpiresAt, NULL) END,
                CASE WHEN p_ActionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ActionID, NULL) END,
                CASE WHEN p_StepType_Clear = TRUE THEN NULL ELSE COALESCE(p_StepType, NULL) END,
                CASE WHEN p_PromptID_Clear = TRUE THEN NULL ELSE COALESCE(p_PromptID, NULL) END,
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END
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
    IN p_ClaimExpiresAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ActionID_Clear BOOLEAN DEFAULT FALSE,
    IN p_ActionID UUID DEFAULT NULL,
    IN p_StepType_Clear BOOLEAN DEFAULT FALSE,
    IN p_StepType VARCHAR(20) DEFAULT NULL,
    IN p_PromptID_Clear BOOLEAN DEFAULT FALSE,
    IN p_PromptID UUID DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL
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
        "ClaimExpiresAt" = CASE WHEN p_ClaimExpiresAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ClaimExpiresAt, "ClaimExpiresAt") END,
        "ActionID" = CASE WHEN p_ActionID_Clear = TRUE THEN NULL ELSE COALESCE(p_ActionID, "ActionID") END,
        "StepType" = CASE WHEN p_StepType_Clear = TRUE THEN NULL ELSE COALESCE(p_StepType, "StepType") END,
        "PromptID" = CASE WHEN p_PromptID_Clear = TRUE THEN NULL ELSE COALESCE(p_PromptID, "PromptID") END,
        "Configuration" = CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, "Configuration") END
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
           WHERE proname = 'spDeleteAction'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteAction"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJActionAuthorizations_ActionIDID UUID;
    p_MJActionContexts_ActionIDID UUID;
    p_MJActionExecutionLogs_ActionIDID UUID;
    p_MJActionLibraries_ActionIDID UUID;
    p_MJActionParams_ActionIDID UUID;
    p_MJActionResultCodes_ActionIDID UUID;
    p_MJActions_ParentIDID UUID;
    p_MJAIAgentActions_ActionIDID UUID;
    p_MJAIAgentActions_ActionID_AgentID UUID;
    p_MJAIAgentActions_ActionID_ActionID UUID;
    p_MJAIAgentActions_ActionID_Status VARCHAR(15);
    p_MJAIAgentActions_ActionID_MinExecutionsPerRun INTEGER;
    p_MJAIAgentActions_ActionID_MaxExecutionsPerRun INTEGER;
    p_MJAIAgentActions_ActionID_ResultExpirationTurns INTEGER;
    p_MJAIAgentActions_ActionID_ResultExpirationMode VARCHAR(20);
    p_MJAIAgentActions_ActionID_CompactMode VARCHAR(20);
    p_MJAIAgentActions_ActionID_CompactLength INTEGER;
    p_MJAIAgentActions_ActionID_CompactPromptID UUID;
    p_MJAIAgentSteps_ActionIDID UUID;
    p_MJAIAgentSteps_ActionID_AgentID UUID;
    p_MJAIAgentSteps_ActionID_Name VARCHAR(255);
    p_MJAIAgentSteps_ActionID_Description TEXT;
    p_MJAIAgentSteps_ActionID_StepType VARCHAR(20);
    p_MJAIAgentSteps_ActionID_StartingStep BOOLEAN;
    p_MJAIAgentSteps_ActionID_TimeoutSeconds INTEGER;
    p_MJAIAgentSteps_ActionID_RetryCount INTEGER;
    p_MJAIAgentSteps_ActionID_OnErrorBehavior VARCHAR(20);
    p_MJAIAgentSteps_ActionID_ActionID UUID;
    p_MJAIAgentSteps_ActionID_SubAgentID UUID;
    p_MJAIAgentSteps_ActionID_PromptID UUID;
    p_MJAIAgentSteps_ActionID_ActionOutputMapping TEXT;
    p_MJAIAgentSteps_ActionID_PositionX INTEGER;
    p_MJAIAgentSteps_ActionID_PositionY INTEGER;
    p_MJAIAgentSteps_ActionID_Width INTEGER;
    p_MJAIAgentSteps_ActionID_Height INTEGER;
    p_MJAIAgentSteps_ActionID_Status VARCHAR(20);
    p_MJAIAgentSteps_ActionID_ActionInputMapping TEXT;
    p_MJAIAgentSteps_ActionID_LoopBodyType VARCHAR(50);
    p_MJAIAgentSteps_ActionID_Configuration TEXT;
    p_MJAISkillActions_ActionIDID UUID;
    p_MJEntityActions_ActionIDID UUID;
    p_MJMCPServerTools_GeneratedActionIDID UUID;
    p_MJMCPServerTools_GeneratedActionID_MCPServerID UUID;
    p_MJMCPServerTools_GeneratedActionID_ToolName VARCHAR(255);
    p_MJMCPServerTools_GeneratedActionID_ToolTitle VARCHAR(255);
    p_MJMCPServerTools_GeneratedActionID_ToolDescription TEXT;
    p_MJMCPServerTools_GeneratedActionID_InputSchema TEXT;
    p_MJMCPServerTools_GeneratedActionID_OutputSchema TEXT;
    p_MJMCPServerTools_GeneratedActionID_Annotations TEXT;
    p_MJMCPServerTools_GeneratedActionID_Status VARCHAR(50);
    p_MJMCPServerTools_GeneratedActionID_DiscoveredAt TIMESTAMPTZ;
    p_MJMCPServerTools_GeneratedActionID_LastSeenAt TIMESTAMPTZ;
    p_MJMCPServerTools_GeneratedActionID_GeneratedActionID UUID;
    p_MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID UUID;
    p_MJRecordProcesses_ActionIDID UUID;
    p_MJRecordProcesses_ActionID_Name VARCHAR(255);
    p_MJRecordProcesses_ActionID_Description TEXT;
    p_MJRecordProcesses_ActionID_CategoryID UUID;
    p_MJRecordProcesses_ActionID_EntityID UUID;
    p_MJRecordProcesses_ActionID_Status VARCHAR(20);
    p_MJRecordProcesses_ActionID_WorkType VARCHAR(20);
    p_MJRecordProcesses_ActionID_ActionID UUID;
    p_MJRecordProcesses_ActionID_AgentID UUID;
    p_MJRecordProcesses_ActionID_PromptID UUID;
    p_MJRecordProcesses_ActionID_ScopeType VARCHAR(20);
    p_MJRecordProcesses_ActionID_ScopeViewID UUID;
    p_MJRecordProcesses_ActionID_ScopeListID UUID;
    p_MJRecordProcesses_ActionID_ScopeFilter TEXT;
    p_MJRecordProcesses_ActionID_OnChangeEnabled BOOLEAN;
    p_MJRecordProcesses_ActionID_OnChangeInvocationType VARCHAR(30);
    p_MJRecordProcesses_ActionID_OnChangeFilter TEXT;
    p_MJRecordProcesses_ActionID_ScheduleEnabled BOOLEAN;
    p_MJRecordProcesses_ActionID_CronExpression VARCHAR(120);
    p_MJRecordProcesses_ActionID_Timezone VARCHAR(100);
    p_MJRecordProcesses_ActionID_OnDemandEnabled BOOLEAN;
    p_MJRecordProcesses_ActionID_InputMapping TEXT;
    p_MJRecordProcesses_ActionID_OutputMapping TEXT;
    p_MJRecordProcesses_ActionID_SkipUnchanged BOOLEAN;
    p_MJRecordProcesses_ActionID_WatermarkStrategy VARCHAR(20);
    p_MJRecordProcesses_ActionID_BatchSize INTEGER;
    p_MJRecordProcesses_ActionID_MaxConcurrency INTEGER;
    p_MJRecordProcesses_ActionID_Configuration TEXT;
    p_MJTasks_ActionIDID UUID;
    p_MJTasks_ActionID_ParentID UUID;
    p_MJTasks_ActionID_Name VARCHAR(255);
    p_MJTasks_ActionID_Description TEXT;
    p_MJTasks_ActionID_TypeID UUID;
    p_MJTasks_ActionID_EnvironmentID UUID;
    p_MJTasks_ActionID_ProjectID UUID;
    p_MJTasks_ActionID_ConversationDetailID UUID;
    p_MJTasks_ActionID_UserID UUID;
    p_MJTasks_ActionID_AgentID UUID;
    p_MJTasks_ActionID_Status VARCHAR(50);
    p_MJTasks_ActionID_PercentComplete INTEGER;
    p_MJTasks_ActionID_DueAt TIMESTAMPTZ;
    p_MJTasks_ActionID_StartedAt TIMESTAMPTZ;
    p_MJTasks_ActionID_CompletedAt TIMESTAMPTZ;
    p_MJTasks_ActionID_InputPayload TEXT;
    p_MJTasks_ActionID_OutputPayload TEXT;
    p_MJTasks_ActionID_ErrorMessage TEXT;
    p_MJTasks_ActionID_AgentRunID UUID;
    p_MJTasks_ActionID_ClaimedBy VARCHAR(100);
    p_MJTasks_ActionID_ClaimExpiresAt TIMESTAMPTZ;
    p_MJTasks_ActionID_ActionID UUID;
    p_MJTasks_ActionID_StepType VARCHAR(20);
    p_MJTasks_ActionID_PromptID UUID;
    p_MJTasks_ActionID_Configuration TEXT;
BEGIN
-- Cascade delete from ActionAuthorization using cursor to call spDeleteActionAuthorization

    FOR _rec IN SELECT "ID" FROM __mj."ActionAuthorization" WHERE "ActionID" = p_ID
    LOOP
        p_MJActionAuthorizations_ActionIDID := _rec."ID";
        PERFORM __mj."spDeleteActionAuthorization"(p_ID => p_MJActionAuthorizations_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ActionContext using cursor to call spDeleteActionContext

    FOR _rec IN SELECT "ID" FROM __mj."ActionContext" WHERE "ActionID" = p_ID
    LOOP
        p_MJActionContexts_ActionIDID := _rec."ID";
        PERFORM __mj."spDeleteActionContext"(p_ID => p_MJActionContexts_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ActionExecutionLog using cursor to call spDeleteActionExecutionLog

    FOR _rec IN SELECT "ID" FROM __mj."ActionExecutionLog" WHERE "ActionID" = p_ID
    LOOP
        p_MJActionExecutionLogs_ActionIDID := _rec."ID";
        PERFORM __mj."spDeleteActionExecutionLog"(p_ID => p_MJActionExecutionLogs_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ActionLibrary using cursor to call spDeleteActionLibrary

    FOR _rec IN SELECT "ID" FROM __mj."ActionLibrary" WHERE "ActionID" = p_ID
    LOOP
        p_MJActionLibraries_ActionIDID := _rec."ID";
        PERFORM __mj."spDeleteActionLibrary"(p_ID => p_MJActionLibraries_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ActionParam using cursor to call spDeleteActionParam

    FOR _rec IN SELECT "ID" FROM __mj."ActionParam" WHERE "ActionID" = p_ID
    LOOP
        p_MJActionParams_ActionIDID := _rec."ID";
        PERFORM __mj."spDeleteActionParam"(p_ID => p_MJActionParams_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from ActionResultCode using cursor to call spDeleteActionResultCode

    FOR _rec IN SELECT "ID" FROM __mj."ActionResultCode" WHERE "ActionID" = p_ID
    LOOP
        p_MJActionResultCodes_ActionIDID := _rec."ID";
        PERFORM __mj."spDeleteActionResultCode"(p_ID => p_MJActionResultCodes_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from Action using cursor to call spDeleteAction

    FOR _rec IN SELECT "ID" FROM __mj."Action" WHERE "ParentID" = p_ID
    LOOP
        p_MJActions_ParentIDID := _rec."ID";
        PERFORM __mj."spDeleteAction"(p_ID => p_MJActions_ParentIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction


    FOR _rec IN SELECT "ID", "AgentID", "ActionID", "Status", "MinExecutionsPerRun", "MaxExecutionsPerRun", "ResultExpirationTurns", "ResultExpirationMode", "CompactMode", "CompactLength", "CompactPromptID" FROM __mj."AIAgentAction" WHERE "ActionID" = p_ID
    LOOP
        p_MJAIAgentActions_ActionIDID := _rec."ID";
        p_MJAIAgentActions_ActionID_AgentID := _rec."AgentID";
        p_MJAIAgentActions_ActionID_ActionID := _rec."ActionID";
        p_MJAIAgentActions_ActionID_Status := _rec."Status";
        p_MJAIAgentActions_ActionID_MinExecutionsPerRun := _rec."MinExecutionsPerRun";
        p_MJAIAgentActions_ActionID_MaxExecutionsPerRun := _rec."MaxExecutionsPerRun";
        p_MJAIAgentActions_ActionID_ResultExpirationTurns := _rec."ResultExpirationTurns";
        p_MJAIAgentActions_ActionID_ResultExpirationMode := _rec."ResultExpirationMode";
        p_MJAIAgentActions_ActionID_CompactMode := _rec."CompactMode";
        p_MJAIAgentActions_ActionID_CompactLength := _rec."CompactLength";
        p_MJAIAgentActions_ActionID_CompactPromptID := _rec."CompactPromptID";
        -- Set the FK field to NULL
        p_MJAIAgentActions_ActionID_ActionID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentAction"(p_ID => p_MJAIAgentActions_ActionIDID, p_AgentID => p_MJAIAgentActions_ActionID_AgentID, p_ActionID_Clear => 1, p_ActionID => p_MJAIAgentActions_ActionID_ActionID, p_Status => p_MJAIAgentActions_ActionID_Status, p_MinExecutionsPerRun => p_MJAIAgentActions_ActionID_MinExecutionsPerRun, p_MaxExecutionsPerRun => p_MJAIAgentActions_ActionID_MaxExecutionsPerRun, p_ResultExpirationTurns => p_MJAIAgentActions_ActionID_ResultExpirationTurns, p_ResultExpirationMode => p_MJAIAgentActions_ActionID_ResultExpirationMode, p_CompactMode => p_MJAIAgentActions_ActionID_CompactMode, p_CompactLength => p_MJAIAgentActions_ActionID_CompactLength, p_CompactPromptID => p_MJAIAgentActions_ActionID_CompactPromptID);

    END LOOP;

    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep


    FOR _rec IN SELECT "ID", "AgentID", "Name", "Description", "StepType", "StartingStep", "TimeoutSeconds", "RetryCount", "OnErrorBehavior", "ActionID", "SubAgentID", "PromptID", "ActionOutputMapping", "PositionX", "PositionY", "Width", "Height", "Status", "ActionInputMapping", "LoopBodyType", "Configuration" FROM __mj."AIAgentStep" WHERE "ActionID" = p_ID
    LOOP
        p_MJAIAgentSteps_ActionIDID := _rec."ID";
        p_MJAIAgentSteps_ActionID_AgentID := _rec."AgentID";
        p_MJAIAgentSteps_ActionID_Name := _rec."Name";
        p_MJAIAgentSteps_ActionID_Description := _rec."Description";
        p_MJAIAgentSteps_ActionID_StepType := _rec."StepType";
        p_MJAIAgentSteps_ActionID_StartingStep := _rec."StartingStep";
        p_MJAIAgentSteps_ActionID_TimeoutSeconds := _rec."TimeoutSeconds";
        p_MJAIAgentSteps_ActionID_RetryCount := _rec."RetryCount";
        p_MJAIAgentSteps_ActionID_OnErrorBehavior := _rec."OnErrorBehavior";
        p_MJAIAgentSteps_ActionID_ActionID := _rec."ActionID";
        p_MJAIAgentSteps_ActionID_SubAgentID := _rec."SubAgentID";
        p_MJAIAgentSteps_ActionID_PromptID := _rec."PromptID";
        p_MJAIAgentSteps_ActionID_ActionOutputMapping := _rec."ActionOutputMapping";
        p_MJAIAgentSteps_ActionID_PositionX := _rec."PositionX";
        p_MJAIAgentSteps_ActionID_PositionY := _rec."PositionY";
        p_MJAIAgentSteps_ActionID_Width := _rec."Width";
        p_MJAIAgentSteps_ActionID_Height := _rec."Height";
        p_MJAIAgentSteps_ActionID_Status := _rec."Status";
        p_MJAIAgentSteps_ActionID_ActionInputMapping := _rec."ActionInputMapping";
        p_MJAIAgentSteps_ActionID_LoopBodyType := _rec."LoopBodyType";
        p_MJAIAgentSteps_ActionID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJAIAgentSteps_ActionID_ActionID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentStep"(p_ID => p_MJAIAgentSteps_ActionIDID, p_AgentID => p_MJAIAgentSteps_ActionID_AgentID, p_Name => p_MJAIAgentSteps_ActionID_Name, p_Description => p_MJAIAgentSteps_ActionID_Description, p_StepType => p_MJAIAgentSteps_ActionID_StepType, p_StartingStep => p_MJAIAgentSteps_ActionID_StartingStep, p_TimeoutSeconds => p_MJAIAgentSteps_ActionID_TimeoutSeconds, p_RetryCount => p_MJAIAgentSteps_ActionID_RetryCount, p_OnErrorBehavior => p_MJAIAgentSteps_ActionID_OnErrorBehavior, p_ActionID_Clear => 1, p_ActionID => p_MJAIAgentSteps_ActionID_ActionID, p_SubAgentID => p_MJAIAgentSteps_ActionID_SubAgentID, p_PromptID => p_MJAIAgentSteps_ActionID_PromptID, p_ActionOutputMapping => p_MJAIAgentSteps_ActionID_ActionOutputMapping, p_PositionX => p_MJAIAgentSteps_ActionID_PositionX, p_PositionY => p_MJAIAgentSteps_ActionID_PositionY, p_Width => p_MJAIAgentSteps_ActionID_Width, p_Height => p_MJAIAgentSteps_ActionID_Height, p_Status => p_MJAIAgentSteps_ActionID_Status, p_ActionInputMapping => p_MJAIAgentSteps_ActionID_ActionInputMapping, p_LoopBodyType => p_MJAIAgentSteps_ActionID_LoopBodyType, p_Configuration => p_MJAIAgentSteps_ActionID_Configuration);

    END LOOP;

    
    -- Cascade delete from AISkillAction using cursor to call spDeleteAISkillAction

    FOR _rec IN SELECT "ID" FROM __mj."AISkillAction" WHERE "ActionID" = p_ID
    LOOP
        p_MJAISkillActions_ActionIDID := _rec."ID";
        PERFORM __mj."spDeleteAISkillAction"(p_ID => p_MJAISkillActions_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade delete from EntityAction using cursor to call spDeleteEntityAction

    FOR _rec IN SELECT "ID" FROM __mj."EntityAction" WHERE "ActionID" = p_ID
    LOOP
        p_MJEntityActions_ActionIDID := _rec."ID";
        PERFORM __mj."spDeleteEntityAction"(p_ID => p_MJEntityActions_ActionIDID);
        
    END LOOP;
    
    
    -- Cascade update on MCPServerTool using cursor to call spUpdateMCPServerTool


    FOR _rec IN SELECT "ID", "MCPServerID", "ToolName", "ToolTitle", "ToolDescription", "InputSchema", "OutputSchema", "Annotations", "Status", "DiscoveredAt", "LastSeenAt", "GeneratedActionID", "GeneratedActionCategoryID" FROM __mj."MCPServerTool" WHERE "GeneratedActionID" = p_ID
    LOOP
        p_MJMCPServerTools_GeneratedActionIDID := _rec."ID";
        p_MJMCPServerTools_GeneratedActionID_MCPServerID := _rec."MCPServerID";
        p_MJMCPServerTools_GeneratedActionID_ToolName := _rec."ToolName";
        p_MJMCPServerTools_GeneratedActionID_ToolTitle := _rec."ToolTitle";
        p_MJMCPServerTools_GeneratedActionID_ToolDescription := _rec."ToolDescription";
        p_MJMCPServerTools_GeneratedActionID_InputSchema := _rec."InputSchema";
        p_MJMCPServerTools_GeneratedActionID_OutputSchema := _rec."OutputSchema";
        p_MJMCPServerTools_GeneratedActionID_Annotations := _rec."Annotations";
        p_MJMCPServerTools_GeneratedActionID_Status := _rec."Status";
        p_MJMCPServerTools_GeneratedActionID_DiscoveredAt := _rec."DiscoveredAt";
        p_MJMCPServerTools_GeneratedActionID_LastSeenAt := _rec."LastSeenAt";
        p_MJMCPServerTools_GeneratedActionID_GeneratedActionID := _rec."GeneratedActionID";
        p_MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID := _rec."GeneratedActionCategoryID";
        -- Set the FK field to NULL
        p_MJMCPServerTools_GeneratedActionID_GeneratedActionID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateMCPServerTool"(p_ID => p_MJMCPServerTools_GeneratedActionIDID, p_MCPServerID => p_MJMCPServerTools_GeneratedActionID_MCPServerID, p_ToolName => p_MJMCPServerTools_GeneratedActionID_ToolName, p_ToolTitle => p_MJMCPServerTools_GeneratedActionID_ToolTitle, p_ToolDescription => p_MJMCPServerTools_GeneratedActionID_ToolDescription, p_InputSchema => p_MJMCPServerTools_GeneratedActionID_InputSchema, p_OutputSchema => p_MJMCPServerTools_GeneratedActionID_OutputSchema, p_Annotations => p_MJMCPServerTools_GeneratedActionID_Annotations, p_Status => p_MJMCPServerTools_GeneratedActionID_Status, p_DiscoveredAt => p_MJMCPServerTools_GeneratedActionID_DiscoveredAt, p_LastSeenAt => p_MJMCPServerTools_GeneratedActionID_LastSeenAt, p_GeneratedActionID_Clear => 1, p_GeneratedActionID => p_MJMCPServerTools_GeneratedActionID_GeneratedActionID, p_GeneratedActionCategoryID => p_MJMCPServerTools_GeneratedActionID_GeneratedActionCategoryID);

    END LOOP;

    
    -- Cascade update on RecordProcess using cursor to call spUpdateRecordProcess


    FOR _rec IN SELECT "ID", "Name", "Description", "CategoryID", "EntityID", "Status", "WorkType", "ActionID", "AgentID", "PromptID", "ScopeType", "ScopeViewID", "ScopeListID", "ScopeFilter", "OnChangeEnabled", "OnChangeInvocationType", "OnChangeFilter", "ScheduleEnabled", "CronExpression", "Timezone", "OnDemandEnabled", "InputMapping", "OutputMapping", "SkipUnchanged", "WatermarkStrategy", "BatchSize", "MaxConcurrency", "Configuration" FROM __mj."RecordProcess" WHERE "ActionID" = p_ID
    LOOP
        p_MJRecordProcesses_ActionIDID := _rec."ID";
        p_MJRecordProcesses_ActionID_Name := _rec."Name";
        p_MJRecordProcesses_ActionID_Description := _rec."Description";
        p_MJRecordProcesses_ActionID_CategoryID := _rec."CategoryID";
        p_MJRecordProcesses_ActionID_EntityID := _rec."EntityID";
        p_MJRecordProcesses_ActionID_Status := _rec."Status";
        p_MJRecordProcesses_ActionID_WorkType := _rec."WorkType";
        p_MJRecordProcesses_ActionID_ActionID := _rec."ActionID";
        p_MJRecordProcesses_ActionID_AgentID := _rec."AgentID";
        p_MJRecordProcesses_ActionID_PromptID := _rec."PromptID";
        p_MJRecordProcesses_ActionID_ScopeType := _rec."ScopeType";
        p_MJRecordProcesses_ActionID_ScopeViewID := _rec."ScopeViewID";
        p_MJRecordProcesses_ActionID_ScopeListID := _rec."ScopeListID";
        p_MJRecordProcesses_ActionID_ScopeFilter := _rec."ScopeFilter";
        p_MJRecordProcesses_ActionID_OnChangeEnabled := _rec."OnChangeEnabled";
        p_MJRecordProcesses_ActionID_OnChangeInvocationType := _rec."OnChangeInvocationType";
        p_MJRecordProcesses_ActionID_OnChangeFilter := _rec."OnChangeFilter";
        p_MJRecordProcesses_ActionID_ScheduleEnabled := _rec."ScheduleEnabled";
        p_MJRecordProcesses_ActionID_CronExpression := _rec."CronExpression";
        p_MJRecordProcesses_ActionID_Timezone := _rec."Timezone";
        p_MJRecordProcesses_ActionID_OnDemandEnabled := _rec."OnDemandEnabled";
        p_MJRecordProcesses_ActionID_InputMapping := _rec."InputMapping";
        p_MJRecordProcesses_ActionID_OutputMapping := _rec."OutputMapping";
        p_MJRecordProcesses_ActionID_SkipUnchanged := _rec."SkipUnchanged";
        p_MJRecordProcesses_ActionID_WatermarkStrategy := _rec."WatermarkStrategy";
        p_MJRecordProcesses_ActionID_BatchSize := _rec."BatchSize";
        p_MJRecordProcesses_ActionID_MaxConcurrency := _rec."MaxConcurrency";
        p_MJRecordProcesses_ActionID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJRecordProcesses_ActionID_ActionID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateRecordProcess"(p_ID => p_MJRecordProcesses_ActionIDID, p_Name => p_MJRecordProcesses_ActionID_Name, p_Description => p_MJRecordProcesses_ActionID_Description, p_CategoryID => p_MJRecordProcesses_ActionID_CategoryID, p_EntityID => p_MJRecordProcesses_ActionID_EntityID, p_Status => p_MJRecordProcesses_ActionID_Status, p_WorkType => p_MJRecordProcesses_ActionID_WorkType, p_ActionID_Clear => 1, p_ActionID => p_MJRecordProcesses_ActionID_ActionID, p_AgentID => p_MJRecordProcesses_ActionID_AgentID, p_PromptID => p_MJRecordProcesses_ActionID_PromptID, p_ScopeType => p_MJRecordProcesses_ActionID_ScopeType, p_ScopeViewID => p_MJRecordProcesses_ActionID_ScopeViewID, p_ScopeListID => p_MJRecordProcesses_ActionID_ScopeListID, p_ScopeFilter => p_MJRecordProcesses_ActionID_ScopeFilter, p_OnChangeEnabled => p_MJRecordProcesses_ActionID_OnChangeEnabled, p_OnChangeInvocationType => p_MJRecordProcesses_ActionID_OnChangeInvocationType, p_OnChangeFilter => p_MJRecordProcesses_ActionID_OnChangeFilter, p_ScheduleEnabled => p_MJRecordProcesses_ActionID_ScheduleEnabled, p_CronExpression => p_MJRecordProcesses_ActionID_CronExpression, p_Timezone => p_MJRecordProcesses_ActionID_Timezone, p_OnDemandEnabled => p_MJRecordProcesses_ActionID_OnDemandEnabled, p_InputMapping => p_MJRecordProcesses_ActionID_InputMapping, p_OutputMapping => p_MJRecordProcesses_ActionID_OutputMapping, p_SkipUnchanged => p_MJRecordProcesses_ActionID_SkipUnchanged, p_WatermarkStrategy => p_MJRecordProcesses_ActionID_WatermarkStrategy, p_BatchSize => p_MJRecordProcesses_ActionID_BatchSize, p_MaxConcurrency => p_MJRecordProcesses_ActionID_MaxConcurrency, p_Configuration => p_MJRecordProcesses_ActionID_Configuration);

    END LOOP;

    
    -- Cascade update on Task using cursor to call spUpdateTask


    FOR _rec IN SELECT "ID", "ParentID", "Name", "Description", "TypeID", "EnvironmentID", "ProjectID", "ConversationDetailID", "UserID", "AgentID", "Status", "PercentComplete", "DueAt", "StartedAt", "CompletedAt", "InputPayload", "OutputPayload", "ErrorMessage", "AgentRunID", "ClaimedBy", "ClaimExpiresAt", "ActionID", "StepType", "PromptID", "Configuration" FROM __mj."Task" WHERE "ActionID" = p_ID
    LOOP
        p_MJTasks_ActionIDID := _rec."ID";
        p_MJTasks_ActionID_ParentID := _rec."ParentID";
        p_MJTasks_ActionID_Name := _rec."Name";
        p_MJTasks_ActionID_Description := _rec."Description";
        p_MJTasks_ActionID_TypeID := _rec."TypeID";
        p_MJTasks_ActionID_EnvironmentID := _rec."EnvironmentID";
        p_MJTasks_ActionID_ProjectID := _rec."ProjectID";
        p_MJTasks_ActionID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJTasks_ActionID_UserID := _rec."UserID";
        p_MJTasks_ActionID_AgentID := _rec."AgentID";
        p_MJTasks_ActionID_Status := _rec."Status";
        p_MJTasks_ActionID_PercentComplete := _rec."PercentComplete";
        p_MJTasks_ActionID_DueAt := _rec."DueAt";
        p_MJTasks_ActionID_StartedAt := _rec."StartedAt";
        p_MJTasks_ActionID_CompletedAt := _rec."CompletedAt";
        p_MJTasks_ActionID_InputPayload := _rec."InputPayload";
        p_MJTasks_ActionID_OutputPayload := _rec."OutputPayload";
        p_MJTasks_ActionID_ErrorMessage := _rec."ErrorMessage";
        p_MJTasks_ActionID_AgentRunID := _rec."AgentRunID";
        p_MJTasks_ActionID_ClaimedBy := _rec."ClaimedBy";
        p_MJTasks_ActionID_ClaimExpiresAt := _rec."ClaimExpiresAt";
        p_MJTasks_ActionID_ActionID := _rec."ActionID";
        p_MJTasks_ActionID_StepType := _rec."StepType";
        p_MJTasks_ActionID_PromptID := _rec."PromptID";
        p_MJTasks_ActionID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJTasks_ActionID_ActionID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateTask"(p_ID => p_MJTasks_ActionIDID, p_ParentID => p_MJTasks_ActionID_ParentID, p_Name => p_MJTasks_ActionID_Name, p_Description => p_MJTasks_ActionID_Description, p_TypeID => p_MJTasks_ActionID_TypeID, p_EnvironmentID => p_MJTasks_ActionID_EnvironmentID, p_ProjectID => p_MJTasks_ActionID_ProjectID, p_ConversationDetailID => p_MJTasks_ActionID_ConversationDetailID, p_UserID => p_MJTasks_ActionID_UserID, p_AgentID => p_MJTasks_ActionID_AgentID, p_Status => p_MJTasks_ActionID_Status, p_PercentComplete => p_MJTasks_ActionID_PercentComplete, p_DueAt => p_MJTasks_ActionID_DueAt, p_StartedAt => p_MJTasks_ActionID_StartedAt, p_CompletedAt => p_MJTasks_ActionID_CompletedAt, p_InputPayload => p_MJTasks_ActionID_InputPayload, p_OutputPayload => p_MJTasks_ActionID_OutputPayload, p_ErrorMessage => p_MJTasks_ActionID_ErrorMessage, p_AgentRunID => p_MJTasks_ActionID_AgentRunID, p_ClaimedBy => p_MJTasks_ActionID_ClaimedBy, p_ClaimExpiresAt => p_MJTasks_ActionID_ClaimExpiresAt, p_ActionID_Clear => 1, p_ActionID => p_MJTasks_ActionID_ActionID, p_StepType => p_MJTasks_ActionID_StepType, p_PromptID => p_MJTasks_ActionID_PromptID, p_Configuration => p_MJTasks_ActionID_Configuration);

    END LOOP;

    

    DELETE FROM
        __mj."Action"
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
    p_MJAIAgentRuns_ParentRunID_ContinuationDepth INTEGER;
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
    p_MJAIAgentRuns_LastRunID_ContinuationDepth INTEGER;
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
    p_MJTasks_AgentRunID_ActionID UUID;
    p_MJTasks_AgentRunID_StepType VARCHAR(20);
    p_MJTasks_AgentRunID_PromptID UUID;
    p_MJTasks_AgentRunID_Configuration TEXT;
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


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt", "AgentSessionID", "PlanMode", "ExternalSessionID", "ContinuationDepth" FROM __mj."AIAgentRun" WHERE "ParentRunID" = p_ID
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
        p_MJAIAgentRuns_ParentRunID_ContinuationDepth := _rec."ContinuationDepth";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ParentRunID_ParentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ParentRunIDID, p_AgentID => p_MJAIAgentRuns_ParentRunID_AgentID, p_ParentRunID_Clear => 1, p_ParentRunID => p_MJAIAgentRuns_ParentRunID_ParentRunID, p_Status => p_MJAIAgentRuns_ParentRunID_Status, p_StartedAt => p_MJAIAgentRuns_ParentRunID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ParentRunID_CompletedAt, p_Success => p_MJAIAgentRuns_ParentRunID_Success, p_ErrorMessage => p_MJAIAgentRuns_ParentRunID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_ParentRunID_ConversationID, p_UserID => p_MJAIAgentRuns_ParentRunID_UserID, p_Result => p_MJAIAgentRuns_ParentRunID_Result, p_AgentState => p_MJAIAgentRuns_ParentRunID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ParentRunID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ParentRunID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_ParentRunID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_ParentRunID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ParentRunID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ParentRunID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ParentRunID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ParentRunID_FinalPayload, p_Message => p_MJAIAgentRuns_ParentRunID_Message, p_LastRunID => p_MJAIAgentRuns_ParentRunID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ParentRunID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ParentRunID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_ParentRunID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ParentRunID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ParentRunID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ParentRunID_Data, p_Verbose => p_MJAIAgentRuns_ParentRunID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ParentRunID_EffortLevel, p_RunName => p_MJAIAgentRuns_ParentRunID_RunName, p_Comments => p_MJAIAgentRuns_ParentRunID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ParentRunID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ParentRunID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ParentRunID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ParentRunID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ParentRunID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ParentRunID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ParentRunID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_ParentRunID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_ParentRunID_LastHeartbeatAt, p_AgentSessionID => p_MJAIAgentRuns_ParentRunID_AgentSessionID, p_PlanMode => p_MJAIAgentRuns_ParentRunID_PlanMode, p_ExternalSessionID => p_MJAIAgentRuns_ParentRunID_ExternalSessionID, p_ContinuationDepth => p_MJAIAgentRuns_ParentRunID_ContinuationDepth);

    END LOOP;

    
    -- Cascade update on AIAgentRun using cursor to call spUpdateAIAgentRun


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt", "AgentSessionID", "PlanMode", "ExternalSessionID", "ContinuationDepth" FROM __mj."AIAgentRun" WHERE "LastRunID" = p_ID
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
        p_MJAIAgentRuns_LastRunID_ContinuationDepth := _rec."ContinuationDepth";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_LastRunID_LastRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_LastRunIDID, p_AgentID => p_MJAIAgentRuns_LastRunID_AgentID, p_ParentRunID => p_MJAIAgentRuns_LastRunID_ParentRunID, p_Status => p_MJAIAgentRuns_LastRunID_Status, p_StartedAt => p_MJAIAgentRuns_LastRunID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_LastRunID_CompletedAt, p_Success => p_MJAIAgentRuns_LastRunID_Success, p_ErrorMessage => p_MJAIAgentRuns_LastRunID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_LastRunID_ConversationID, p_UserID => p_MJAIAgentRuns_LastRunID_UserID, p_Result => p_MJAIAgentRuns_LastRunID_Result, p_AgentState => p_MJAIAgentRuns_LastRunID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_LastRunID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_LastRunID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_LastRunID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_LastRunID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_LastRunID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_LastRunID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_LastRunID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_LastRunID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_LastRunID_FinalPayload, p_Message => p_MJAIAgentRuns_LastRunID_Message, p_LastRunID_Clear => 1, p_LastRunID => p_MJAIAgentRuns_LastRunID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_LastRunID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_LastRunID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_LastRunID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_LastRunID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_LastRunID_OverrideVendorID, p_Data => p_MJAIAgentRuns_LastRunID_Data, p_Verbose => p_MJAIAgentRuns_LastRunID_Verbose, p_EffortLevel => p_MJAIAgentRuns_LastRunID_EffortLevel, p_RunName => p_MJAIAgentRuns_LastRunID_RunName, p_Comments => p_MJAIAgentRuns_LastRunID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_LastRunID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_LastRunID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_LastRunID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_LastRunID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_LastRunID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_LastRunID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_LastRunID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_LastRunID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_LastRunID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_LastRunID_LastHeartbeatAt, p_AgentSessionID => p_MJAIAgentRuns_LastRunID_AgentSessionID, p_PlanMode => p_MJAIAgentRuns_LastRunID_PlanMode, p_ExternalSessionID => p_MJAIAgentRuns_LastRunID_ExternalSessionID, p_ContinuationDepth => p_MJAIAgentRuns_LastRunID_ContinuationDepth);

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


    FOR _rec IN SELECT "ID", "ParentID", "Name", "Description", "TypeID", "EnvironmentID", "ProjectID", "ConversationDetailID", "UserID", "AgentID", "Status", "PercentComplete", "DueAt", "StartedAt", "CompletedAt", "InputPayload", "OutputPayload", "ErrorMessage", "AgentRunID", "ClaimedBy", "ClaimExpiresAt", "ActionID", "StepType", "PromptID", "Configuration" FROM __mj."Task" WHERE "AgentRunID" = p_ID
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
        p_MJTasks_AgentRunID_ActionID := _rec."ActionID";
        p_MJTasks_AgentRunID_StepType := _rec."StepType";
        p_MJTasks_AgentRunID_PromptID := _rec."PromptID";
        p_MJTasks_AgentRunID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJTasks_AgentRunID_AgentRunID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateTask"(p_ID => p_MJTasks_AgentRunIDID, p_ParentID => p_MJTasks_AgentRunID_ParentID, p_Name => p_MJTasks_AgentRunID_Name, p_Description => p_MJTasks_AgentRunID_Description, p_TypeID => p_MJTasks_AgentRunID_TypeID, p_EnvironmentID => p_MJTasks_AgentRunID_EnvironmentID, p_ProjectID => p_MJTasks_AgentRunID_ProjectID, p_ConversationDetailID => p_MJTasks_AgentRunID_ConversationDetailID, p_UserID => p_MJTasks_AgentRunID_UserID, p_AgentID => p_MJTasks_AgentRunID_AgentID, p_Status => p_MJTasks_AgentRunID_Status, p_PercentComplete => p_MJTasks_AgentRunID_PercentComplete, p_DueAt => p_MJTasks_AgentRunID_DueAt, p_StartedAt => p_MJTasks_AgentRunID_StartedAt, p_CompletedAt => p_MJTasks_AgentRunID_CompletedAt, p_InputPayload => p_MJTasks_AgentRunID_InputPayload, p_OutputPayload => p_MJTasks_AgentRunID_OutputPayload, p_ErrorMessage => p_MJTasks_AgentRunID_ErrorMessage, p_AgentRunID_Clear => 1, p_AgentRunID => p_MJTasks_AgentRunID_AgentRunID, p_ClaimedBy => p_MJTasks_AgentRunID_ClaimedBy, p_ClaimExpiresAt => p_MJTasks_AgentRunID_ClaimExpiresAt, p_ActionID => p_MJTasks_AgentRunID_ActionID, p_StepType => p_MJTasks_AgentRunID_StepType, p_PromptID => p_MJTasks_AgentRunID_PromptID, p_Configuration => p_MJTasks_AgentRunID_Configuration);

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
    p_MJAIAgentRuns_ConversationDetailID_ContinuationDepth INTEGER;
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
    p_MJTasks_ConversationDetailID_ActionID UUID;
    p_MJTasks_ConversationDetailID_StepType VARCHAR(20);
    p_MJTasks_ConversationDetailID_PromptID UUID;
    p_MJTasks_ConversationDetailID_Configuration TEXT;
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


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt", "AgentSessionID", "PlanMode", "ExternalSessionID", "ContinuationDepth" FROM __mj."AIAgentRun" WHERE "ConversationDetailID" = p_ID
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
        p_MJAIAgentRuns_ConversationDetailID_ContinuationDepth := _rec."ContinuationDepth";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ConversationDetailID_ConversationDetailID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ConversationDetailIDID, p_AgentID => p_MJAIAgentRuns_ConversationDetailID_AgentID, p_ParentRunID => p_MJAIAgentRuns_ConversationDetailID_ParentRunID, p_Status => p_MJAIAgentRuns_ConversationDetailID_Status, p_StartedAt => p_MJAIAgentRuns_ConversationDetailID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ConversationDetailID_CompletedAt, p_Success => p_MJAIAgentRuns_ConversationDetailID_Success, p_ErrorMessage => p_MJAIAgentRuns_ConversationDetailID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_ConversationDetailID_ConversationID, p_UserID => p_MJAIAgentRuns_ConversationDetailID_UserID, p_Result => p_MJAIAgentRuns_ConversationDetailID_Result, p_AgentState => p_MJAIAgentRuns_ConversationDetailID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ConversationDetailID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ConversationDetailID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ConversationDetailID_TotalPromptTokensUse_5ca82d, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ConversationDetailID_TotalCompletionToken_43c4ab, p_TotalCostRollup => p_MJAIAgentRuns_ConversationDetailID_TotalCostRollup, p_ConversationDetailID_Clear => 1, p_ConversationDetailID => p_MJAIAgentRuns_ConversationDetailID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ConversationDetailID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ConversationDetailID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ConversationDetailID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ConversationDetailID_FinalPayload, p_Message => p_MJAIAgentRuns_ConversationDetailID_Message, p_LastRunID => p_MJAIAgentRuns_ConversationDetailID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ConversationDetailID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ConversationDetailID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_ConversationDetailID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ConversationDetailID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ConversationDetailID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ConversationDetailID_Data, p_Verbose => p_MJAIAgentRuns_ConversationDetailID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ConversationDetailID_EffortLevel, p_RunName => p_MJAIAgentRuns_ConversationDetailID_RunName, p_Comments => p_MJAIAgentRuns_ConversationDetailID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ConversationDetailID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ConversationDetailID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ConversationDetailID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ConversationDetailID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ConversationDetailID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ConversationDetailID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_ConversationDetailID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_ConversationDetailID_LastHeartbeatAt, p_AgentSessionID => p_MJAIAgentRuns_ConversationDetailID_AgentSessionID, p_PlanMode => p_MJAIAgentRuns_ConversationDetailID_PlanMode, p_ExternalSessionID => p_MJAIAgentRuns_ConversationDetailID_ExternalSessionID, p_ContinuationDepth => p_MJAIAgentRuns_ConversationDetailID_ContinuationDepth);

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


    FOR _rec IN SELECT "ID", "ParentID", "Name", "Description", "TypeID", "EnvironmentID", "ProjectID", "ConversationDetailID", "UserID", "AgentID", "Status", "PercentComplete", "DueAt", "StartedAt", "CompletedAt", "InputPayload", "OutputPayload", "ErrorMessage", "AgentRunID", "ClaimedBy", "ClaimExpiresAt", "ActionID", "StepType", "PromptID", "Configuration" FROM __mj."Task" WHERE "ConversationDetailID" = p_ID
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
        p_MJTasks_ConversationDetailID_ActionID := _rec."ActionID";
        p_MJTasks_ConversationDetailID_StepType := _rec."StepType";
        p_MJTasks_ConversationDetailID_PromptID := _rec."PromptID";
        p_MJTasks_ConversationDetailID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJTasks_ConversationDetailID_ConversationDetailID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateTask"(p_ID => p_MJTasks_ConversationDetailIDID, p_ParentID => p_MJTasks_ConversationDetailID_ParentID, p_Name => p_MJTasks_ConversationDetailID_Name, p_Description => p_MJTasks_ConversationDetailID_Description, p_TypeID => p_MJTasks_ConversationDetailID_TypeID, p_EnvironmentID => p_MJTasks_ConversationDetailID_EnvironmentID, p_ProjectID => p_MJTasks_ConversationDetailID_ProjectID, p_ConversationDetailID_Clear => 1, p_ConversationDetailID => p_MJTasks_ConversationDetailID_ConversationDetailID, p_UserID => p_MJTasks_ConversationDetailID_UserID, p_AgentID => p_MJTasks_ConversationDetailID_AgentID, p_Status => p_MJTasks_ConversationDetailID_Status, p_PercentComplete => p_MJTasks_ConversationDetailID_PercentComplete, p_DueAt => p_MJTasks_ConversationDetailID_DueAt, p_StartedAt => p_MJTasks_ConversationDetailID_StartedAt, p_CompletedAt => p_MJTasks_ConversationDetailID_CompletedAt, p_InputPayload => p_MJTasks_ConversationDetailID_InputPayload, p_OutputPayload => p_MJTasks_ConversationDetailID_OutputPayload, p_ErrorMessage => p_MJTasks_ConversationDetailID_ErrorMessage, p_AgentRunID => p_MJTasks_ConversationDetailID_AgentRunID, p_ClaimedBy => p_MJTasks_ConversationDetailID_ClaimedBy, p_ClaimExpiresAt => p_MJTasks_ConversationDetailID_ClaimExpiresAt, p_ActionID => p_MJTasks_ConversationDetailID_ActionID, p_StepType => p_MJTasks_ConversationDetailID_StepType, p_PromptID => p_MJTasks_ConversationDetailID_PromptID, p_Configuration => p_MJTasks_ConversationDetailID_Configuration);

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
    p_MJTasks_AgentID_ActionID UUID;
    p_MJTasks_AgentID_StepType VARCHAR(20);
    p_MJTasks_AgentID_PromptID UUID;
    p_MJTasks_AgentID_Configuration TEXT;
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


    FOR _rec IN SELECT "ID", "ParentID", "Name", "Description", "TypeID", "EnvironmentID", "ProjectID", "ConversationDetailID", "UserID", "AgentID", "Status", "PercentComplete", "DueAt", "StartedAt", "CompletedAt", "InputPayload", "OutputPayload", "ErrorMessage", "AgentRunID", "ClaimedBy", "ClaimExpiresAt", "ActionID", "StepType", "PromptID", "Configuration" FROM __mj."Task" WHERE "AgentID" = p_ID
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
        p_MJTasks_AgentID_ActionID := _rec."ActionID";
        p_MJTasks_AgentID_StepType := _rec."StepType";
        p_MJTasks_AgentID_PromptID := _rec."PromptID";
        p_MJTasks_AgentID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJTasks_AgentID_AgentID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateTask"(p_ID => p_MJTasks_AgentIDID, p_ParentID => p_MJTasks_AgentID_ParentID, p_Name => p_MJTasks_AgentID_Name, p_Description => p_MJTasks_AgentID_Description, p_TypeID => p_MJTasks_AgentID_TypeID, p_EnvironmentID => p_MJTasks_AgentID_EnvironmentID, p_ProjectID => p_MJTasks_AgentID_ProjectID, p_ConversationDetailID => p_MJTasks_AgentID_ConversationDetailID, p_UserID => p_MJTasks_AgentID_UserID, p_AgentID_Clear => 1, p_AgentID => p_MJTasks_AgentID_AgentID, p_Status => p_MJTasks_AgentID_Status, p_PercentComplete => p_MJTasks_AgentID_PercentComplete, p_DueAt => p_MJTasks_AgentID_DueAt, p_StartedAt => p_MJTasks_AgentID_StartedAt, p_CompletedAt => p_MJTasks_AgentID_CompletedAt, p_InputPayload => p_MJTasks_AgentID_InputPayload, p_OutputPayload => p_MJTasks_AgentID_OutputPayload, p_ErrorMessage => p_MJTasks_AgentID_ErrorMessage, p_AgentRunID => p_MJTasks_AgentID_AgentRunID, p_ClaimedBy => p_MJTasks_AgentID_ClaimedBy, p_ClaimExpiresAt => p_MJTasks_AgentID_ClaimExpiresAt, p_ActionID => p_MJTasks_AgentID_ActionID, p_StepType => p_MJTasks_AgentID_StepType, p_PromptID => p_MJTasks_AgentID_PromptID, p_Configuration => p_MJTasks_AgentID_Configuration);

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
    p_MJTasks_PromptIDID UUID;
    p_MJTasks_PromptID_ParentID UUID;
    p_MJTasks_PromptID_Name VARCHAR(255);
    p_MJTasks_PromptID_Description TEXT;
    p_MJTasks_PromptID_TypeID UUID;
    p_MJTasks_PromptID_EnvironmentID UUID;
    p_MJTasks_PromptID_ProjectID UUID;
    p_MJTasks_PromptID_ConversationDetailID UUID;
    p_MJTasks_PromptID_UserID UUID;
    p_MJTasks_PromptID_AgentID UUID;
    p_MJTasks_PromptID_Status VARCHAR(50);
    p_MJTasks_PromptID_PercentComplete INTEGER;
    p_MJTasks_PromptID_DueAt TIMESTAMPTZ;
    p_MJTasks_PromptID_StartedAt TIMESTAMPTZ;
    p_MJTasks_PromptID_CompletedAt TIMESTAMPTZ;
    p_MJTasks_PromptID_InputPayload TEXT;
    p_MJTasks_PromptID_OutputPayload TEXT;
    p_MJTasks_PromptID_ErrorMessage TEXT;
    p_MJTasks_PromptID_AgentRunID UUID;
    p_MJTasks_PromptID_ClaimedBy VARCHAR(100);
    p_MJTasks_PromptID_ClaimExpiresAt TIMESTAMPTZ;
    p_MJTasks_PromptID_ActionID UUID;
    p_MJTasks_PromptID_StepType VARCHAR(20);
    p_MJTasks_PromptID_PromptID UUID;
    p_MJTasks_PromptID_Configuration TEXT;
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


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite", "TokensCacheReadRollup", "TokensCacheWriteRollup" FROM __mj."AIPromptRun" WHERE "JudgeID" = p_ID
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
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_JudgeIDID, p_PromptID => p_MJAIPromptRuns_JudgeID_PromptID, p_ModelID => p_MJAIPromptRuns_JudgeID_ModelID, p_VendorID => p_MJAIPromptRuns_JudgeID_VendorID, p_AgentID => p_MJAIPromptRuns_JudgeID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_JudgeID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_JudgeID_RunAt, p_CompletedAt => p_MJAIPromptRuns_JudgeID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_JudgeID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_JudgeID_Messages, p_Result => p_MJAIPromptRuns_JudgeID_Result, p_TokensUsed => p_MJAIPromptRuns_JudgeID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_JudgeID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_JudgeID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_JudgeID_TotalCost, p_Success => p_MJAIPromptRuns_JudgeID_Success, p_ErrorMessage => p_MJAIPromptRuns_JudgeID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_JudgeID_ParentID, p_RunType => p_MJAIPromptRuns_JudgeID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_JudgeID_ExecutionOrder, p_Cost => p_MJAIPromptRuns_JudgeID_Cost, p_CostCurrency => p_MJAIPromptRuns_JudgeID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_JudgeID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_JudgeID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_JudgeID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_JudgeID_Temperature, p_TopP => p_MJAIPromptRuns_JudgeID_TopP, p_TopK => p_MJAIPromptRuns_JudgeID_TopK, p_MinP => p_MJAIPromptRuns_JudgeID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_JudgeID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_JudgeID_PresencePenalty, p_Seed => p_MJAIPromptRuns_JudgeID_Seed, p_StopSequences => p_MJAIPromptRuns_JudgeID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_JudgeID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_JudgeID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_JudgeID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_JudgeID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_JudgeID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_JudgeID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_JudgeID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_JudgeID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_JudgeID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_JudgeID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_JudgeID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_JudgeID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_JudgeID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_JudgeID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_JudgeID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_JudgeID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_JudgeID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_JudgeID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_JudgeID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_JudgeID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_JudgeID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_JudgeID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_JudgeID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_JudgeID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_JudgeID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_JudgeID_ModelSelection, p_Status => p_MJAIPromptRuns_JudgeID_Status, p_Cancelled => p_MJAIPromptRuns_JudgeID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_JudgeID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_JudgeID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_JudgeID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_JudgeID_CacheHit, p_CacheKey => p_MJAIPromptRuns_JudgeID_CacheKey, p_JudgeID_Clear => 1, p_JudgeID => p_MJAIPromptRuns_JudgeID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_JudgeID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_JudgeID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_JudgeID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_JudgeID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_JudgeID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_JudgeID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_JudgeID_QueueTime, p_PromptTime => p_MJAIPromptRuns_JudgeID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_JudgeID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_JudgeID_EffortLevel, p_RunName => p_MJAIPromptRuns_JudgeID_RunName, p_Comments => p_MJAIPromptRuns_JudgeID_Comments, p_TestRunID => p_MJAIPromptRuns_JudgeID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_JudgeID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_JudgeID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_JudgeID_TokensCacheWrite, p_TokensCacheReadRollup => p_MJAIPromptRuns_JudgeID_TokensCacheReadRollup, p_TokensCacheWriteRollup => p_MJAIPromptRuns_JudgeID_TokensCacheWriteRollup);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite", "TokensCacheReadRollup", "TokensCacheWriteRollup" FROM __mj."AIPromptRun" WHERE "ChildPromptID" = p_ID
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
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_ChildPromptIDID, p_PromptID => p_MJAIPromptRuns_ChildPromptID_PromptID, p_ModelID => p_MJAIPromptRuns_ChildPromptID_ModelID, p_VendorID => p_MJAIPromptRuns_ChildPromptID_VendorID, p_AgentID => p_MJAIPromptRuns_ChildPromptID_AgentID, p_ConfigurationID => p_MJAIPromptRuns_ChildPromptID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_ChildPromptID_RunAt, p_CompletedAt => p_MJAIPromptRuns_ChildPromptID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_ChildPromptID_Messages, p_Result => p_MJAIPromptRuns_ChildPromptID_Result, p_TokensUsed => p_MJAIPromptRuns_ChildPromptID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_ChildPromptID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_ChildPromptID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_ChildPromptID_TotalCost, p_Success => p_MJAIPromptRuns_ChildPromptID_Success, p_ErrorMessage => p_MJAIPromptRuns_ChildPromptID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_ChildPromptID_ParentID, p_RunType => p_MJAIPromptRuns_ChildPromptID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_ChildPromptID_ExecutionOrder, p_Cost => p_MJAIPromptRuns_ChildPromptID_Cost, p_CostCurrency => p_MJAIPromptRuns_ChildPromptID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_ChildPromptID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_ChildPromptID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_ChildPromptID_Temperature, p_TopP => p_MJAIPromptRuns_ChildPromptID_TopP, p_TopK => p_MJAIPromptRuns_ChildPromptID_TopK, p_MinP => p_MJAIPromptRuns_ChildPromptID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_ChildPromptID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_ChildPromptID_PresencePenalty, p_Seed => p_MJAIPromptRuns_ChildPromptID_Seed, p_StopSequences => p_MJAIPromptRuns_ChildPromptID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_ChildPromptID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_ChildPromptID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_ChildPromptID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_ChildPromptID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_ChildPromptID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_ChildPromptID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_ChildPromptID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_ChildPromptID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_ChildPromptID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_ChildPromptID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_ChildPromptID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_ChildPromptID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_ChildPromptID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_ChildPromptID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_ChildPromptID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_ChildPromptID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_ChildPromptID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_ChildPromptID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_ChildPromptID_ModelSelection, p_Status => p_MJAIPromptRuns_ChildPromptID_Status, p_Cancelled => p_MJAIPromptRuns_ChildPromptID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_ChildPromptID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_ChildPromptID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_ChildPromptID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_ChildPromptID_CacheHit, p_CacheKey => p_MJAIPromptRuns_ChildPromptID_CacheKey, p_JudgeID => p_MJAIPromptRuns_ChildPromptID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_ChildPromptID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_ChildPromptID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_ChildPromptID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_ChildPromptID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_ChildPromptID_ErrorDetails, p_ChildPromptID_Clear => 1, p_ChildPromptID => p_MJAIPromptRuns_ChildPromptID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_ChildPromptID_QueueTime, p_PromptTime => p_MJAIPromptRuns_ChildPromptID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_ChildPromptID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_ChildPromptID_EffortLevel, p_RunName => p_MJAIPromptRuns_ChildPromptID_RunName, p_Comments => p_MJAIPromptRuns_ChildPromptID_Comments, p_TestRunID => p_MJAIPromptRuns_ChildPromptID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_ChildPromptID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_ChildPromptID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_ChildPromptID_TokensCacheWrite, p_TokensCacheReadRollup => p_MJAIPromptRuns_ChildPromptID_TokensCacheReadRollup, p_TokensCacheWriteRollup => p_MJAIPromptRuns_ChildPromptID_TokensCacheWriteRollup);

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
    
    
    -- Cascade update on Task using cursor to call spUpdateTask


    FOR _rec IN SELECT "ID", "ParentID", "Name", "Description", "TypeID", "EnvironmentID", "ProjectID", "ConversationDetailID", "UserID", "AgentID", "Status", "PercentComplete", "DueAt", "StartedAt", "CompletedAt", "InputPayload", "OutputPayload", "ErrorMessage", "AgentRunID", "ClaimedBy", "ClaimExpiresAt", "ActionID", "StepType", "PromptID", "Configuration" FROM __mj."Task" WHERE "PromptID" = p_ID
    LOOP
        p_MJTasks_PromptIDID := _rec."ID";
        p_MJTasks_PromptID_ParentID := _rec."ParentID";
        p_MJTasks_PromptID_Name := _rec."Name";
        p_MJTasks_PromptID_Description := _rec."Description";
        p_MJTasks_PromptID_TypeID := _rec."TypeID";
        p_MJTasks_PromptID_EnvironmentID := _rec."EnvironmentID";
        p_MJTasks_PromptID_ProjectID := _rec."ProjectID";
        p_MJTasks_PromptID_ConversationDetailID := _rec."ConversationDetailID";
        p_MJTasks_PromptID_UserID := _rec."UserID";
        p_MJTasks_PromptID_AgentID := _rec."AgentID";
        p_MJTasks_PromptID_Status := _rec."Status";
        p_MJTasks_PromptID_PercentComplete := _rec."PercentComplete";
        p_MJTasks_PromptID_DueAt := _rec."DueAt";
        p_MJTasks_PromptID_StartedAt := _rec."StartedAt";
        p_MJTasks_PromptID_CompletedAt := _rec."CompletedAt";
        p_MJTasks_PromptID_InputPayload := _rec."InputPayload";
        p_MJTasks_PromptID_OutputPayload := _rec."OutputPayload";
        p_MJTasks_PromptID_ErrorMessage := _rec."ErrorMessage";
        p_MJTasks_PromptID_AgentRunID := _rec."AgentRunID";
        p_MJTasks_PromptID_ClaimedBy := _rec."ClaimedBy";
        p_MJTasks_PromptID_ClaimExpiresAt := _rec."ClaimExpiresAt";
        p_MJTasks_PromptID_ActionID := _rec."ActionID";
        p_MJTasks_PromptID_StepType := _rec."StepType";
        p_MJTasks_PromptID_PromptID := _rec."PromptID";
        p_MJTasks_PromptID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJTasks_PromptID_PromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateTask"(p_ID => p_MJTasks_PromptIDID, p_ParentID => p_MJTasks_PromptID_ParentID, p_Name => p_MJTasks_PromptID_Name, p_Description => p_MJTasks_PromptID_Description, p_TypeID => p_MJTasks_PromptID_TypeID, p_EnvironmentID => p_MJTasks_PromptID_EnvironmentID, p_ProjectID => p_MJTasks_PromptID_ProjectID, p_ConversationDetailID => p_MJTasks_PromptID_ConversationDetailID, p_UserID => p_MJTasks_PromptID_UserID, p_AgentID => p_MJTasks_PromptID_AgentID, p_Status => p_MJTasks_PromptID_Status, p_PercentComplete => p_MJTasks_PromptID_PercentComplete, p_DueAt => p_MJTasks_PromptID_DueAt, p_StartedAt => p_MJTasks_PromptID_StartedAt, p_CompletedAt => p_MJTasks_PromptID_CompletedAt, p_InputPayload => p_MJTasks_PromptID_InputPayload, p_OutputPayload => p_MJTasks_PromptID_OutputPayload, p_ErrorMessage => p_MJTasks_PromptID_ErrorMessage, p_AgentRunID => p_MJTasks_PromptID_AgentRunID, p_ClaimedBy => p_MJTasks_PromptID_ClaimedBy, p_ClaimExpiresAt => p_MJTasks_PromptID_ClaimExpiresAt, p_ActionID => p_MJTasks_PromptID_ActionID, p_StepType => p_MJTasks_PromptID_StepType, p_PromptID_Clear => 1, p_PromptID => p_MJTasks_PromptID_PromptID, p_Configuration => p_MJTasks_PromptID_Configuration);

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

CREATE OR REPLACE FUNCTION __mj."trgUpdateActionExecutionLog_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateActionExecutionLog" ON __mj."ActionExecutionLog";
CREATE TRIGGER "trgUpdateActionExecutionLog"
    BEFORE UPDATE ON __mj."ActionExecutionLog"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateActionExecutionLog_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateEntityActionFilter_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateEntityActionFilter" ON __mj."EntityActionFilter";
CREATE TRIGGER "trgUpdateEntityActionFilter"
    BEFORE UPDATE ON __mj."EntityActionFilter"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateEntityActionFilter_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateEntityActionInvocation_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateEntityActionInvocation" ON __mj."EntityActionInvocation";
CREATE TRIGGER "trgUpdateEntityActionInvocation"
    BEFORE UPDATE ON __mj."EntityActionInvocation"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateEntityActionInvocation_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateEntityActionParam_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateEntityActionParam" ON __mj."EntityActionParam";
CREATE TRIGGER "trgUpdateEntityActionParam"
    BEFORE UPDATE ON __mj."EntityActionParam"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateEntityActionParam_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateTaskDependency_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateTaskDependency" ON __mj."TaskDependency";
CREATE TRIGGER "trgUpdateTaskDependency"
    BEFORE UPDATE ON __mj."TaskDependency"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateTaskDependency_func"();

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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4cda9696-9323-4f39-8f1c-5420fc4a3d30' OR ("EntityID" = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND "Name" = 'Priority')
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
        '4cda9696-9323-4f39-8f1c-5420fc4a3d30',
        'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', -- "Entity": "MJ": "Task" "Dependencies"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524') + 8,
        'Priority',
        'Priority',
        'Ordering within an exclusive group — higher wins. Mirrors AIAgentStepPath.Priority so a compiled workflow chooses the same branch the flow editor shows. Ignored for edges that are not part of an ExclusiveGroup.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'a7c3836b-046c-46cd-9153-4e39c616f88c' OR ("EntityID" = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND "Name" = 'Sequence')
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
        'a7c3836b-046c-46cd-9153-4e39c616f88c',
        'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', -- "Entity": "MJ": "Task" "Dependencies"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524') + 9,
        'Sequence',
        'Sequence',
        'Deterministic tiebreak when two edges in an ExclusiveGroup share a Priority, applied ascending. Load-bearing rather than cosmetic: compiled dependencies get fresh UUIDs and Priority defaults to 0, so without a stored ordinal a tie would resolve by row order and the same workflow could take a different branch on a different machine.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1acd1af2-0477-47ec-a3cf-9e63c563cc72' OR ("EntityID" = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND "Name" = 'ExclusiveGroup')
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
        '1acd1af2-0477-47ec-a3cf-9e63c563cc72',
        'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', -- "Entity": "MJ": "Task" "Dependencies"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524') + 10,
        'ExclusiveGroup',
        'Exclusive Group',
        'XOR group key: sibling edges leaving the same origin that share a non-null ExclusiveGroup are an exclusive fan-out. The highest-Priority satisfied edge wins, ties broken by ascending Sequence; the rest are Skipped. NULL (the default) means an ordinary dependency, so existing graphs are unaffected. An unevaluable condition anywhere in the group holds the whole group rather than firing every branch.',
        'TEXT',
        510,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '3c0ce0ef-3780-4f25-9cad-e466668d4a36' OR ("EntityID" = '35248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EntityAction')
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
        '3c0ce0ef-3780-4f25-9cad-e466668d4a36',
        '35248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entity" "Action" "Invocations"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = '35248F34-2837-EF11-86D4-6045BDEE16E6') + 8,
        'EntityAction',
        'Entity Action',
        NULL,
        'TEXT',
        850,
        0,
        0,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ebfe65ba-61e6-4c46-aaa1-02bfd1555fa6' OR ("EntityID" = '39248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EntityAction')
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
        'ebfe65ba-61e6-4c46-aaa1-02bfd1555fa6',
        '39248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entity" "Action" "Filters"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = '39248F34-2837-EF11-86D4-6045BDEE16E6') + 8,
        'EntityAction',
        'Entity Action',
        NULL,
        'TEXT',
        850,
        0,
        0,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '89d8f12c-147b-4e4a-9039-ca7135753a66' OR ("EntityID" = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EntityAction')
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
        '89d8f12c-147b-4e4a-9039-ca7135753a66',
        '3E248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Action" "Execution" "Logs"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = '3E248F34-2837-EF11-86D4-6045BDEE16E6') + 19,
        'EntityAction',
        'Entity Action',
        NULL,
        'TEXT',
        850,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1106b6f6-6631-41ba-b73a-6489b6738655' OR ("EntityID" = '56248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'EntityAction')
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
        '1106b6f6-6631-41ba-b73a-6489b6738655',
        '56248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entity" "Action" "Params"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = '56248F34-2837-EF11-86D4-6045BDEE16E6') + 10,
        'EntityAction',
        'Entity Action',
        NULL,
        'TEXT',
        850,
        0,
        0,
        FALSE,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0efec745-eb79-4b5f-974e-3ef93a02b3f3' OR ("EntityID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND "Name" = 'StepType')
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
        '0efec745-eb79-4b5f-974e-3ef93a02b3f3',
        '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- "Entity": "MJ": "Tasks"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1') + 25,
        'StepType',
        'Step Type',
        'Which kind of workflow step this task represents. NULL for a task that is not part of a workflow, such as a hand-authored to-do. Determines which of AgentID/ActionID/PromptID/UserID is meaningful and how Configuration is read. This is the executable vocabulary and is deliberately not the same value list as AIAgentStep.StepType, which describes a step at design time.',
        'TEXT',
        40,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '42cf0a0b-1729-468d-ad07-9697999fa8b8' OR ("EntityID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND "Name" = 'PromptID')
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
        '42cf0a0b-1729-468d-ad07-9697999fa8b8',
        '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- "Entity": "MJ": "Tasks"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1') + 26,
        'PromptID',
        'Prompt ID',
        NULL,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9f4fcd1b-cb01-43e6-8bf5-af01af34ce4a' OR ("EntityID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND "Name" = 'Configuration')
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
        '9f4fcd1b-cb01-43e6-8bf5-af01af34ce4a',
        '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- "Entity": "MJ": "Tasks"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1') + 27,
        'Configuration',
        'Configuration',
        'Everything about this step that has no column of its own, as JSON: the loop definition for a ForEach or While step, an agent step''s message and template parameters, the mappings that move data between this step and the workflow payload, and the execution policy (timeout, retries, what to do on failure). Typed by ITaskStepConfiguration.',
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

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('3a2cda93-8280-4399-8edf-058d596d7dd2', '9320E9C7-764E-401B-BF2D-A07358E4DD00', 8, 'Skipped', 'Skipped', NOW(), NOW());

/* SQL text to insert entity field value with ID 1ce90fe7-1612-4f99-8b0d-572f850f03ee */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('1ce90fe7-1612-4f99-8b0d-572f850f03ee', '0EFEC745-EB79-4B5F-974E-3EF93A02B3F3', 1, 'Action', 'Action', NOW(), NOW());

/* SQL text to insert entity field value with ID 4a82ebee-f8b7-4776-affd-2e86a185c202 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('4a82ebee-f8b7-4776-affd-2e86a185c202', '0EFEC745-EB79-4B5F-974E-3EF93A02B3F3', 2, 'Agent', 'Agent', NOW(), NOW());

/* SQL text to insert entity field value with ID 6198725b-8dd0-4161-8d8e-de752edb140f */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('6198725b-8dd0-4161-8d8e-de752edb140f', '0EFEC745-EB79-4B5F-974E-3EF93A02B3F3', 3, 'External', 'External', NOW(), NOW());

/* SQL text to insert entity field value with ID fa0a7bea-da45-4581-bf9d-b0fb41be706e */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('fa0a7bea-da45-4581-bf9d-b0fb41be706e', '0EFEC745-EB79-4B5F-974E-3EF93A02B3F3', 4, 'ForEach', 'ForEach', NOW(), NOW());

/* SQL text to insert entity field value with ID a32ad617-18ad-4b60-8921-20fafd43075b */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('a32ad617-18ad-4b60-8921-20fafd43075b', '0EFEC745-EB79-4B5F-974E-3EF93A02B3F3', 5, 'Human', 'Human', NOW(), NOW());

/* SQL text to insert entity field value with ID 72eddbc2-2419-4b1e-add7-2975b69099ac */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('72eddbc2-2419-4b1e-add7-2975b69099ac', '0EFEC745-EB79-4B5F-974E-3EF93A02B3F3', 6, 'Prompt', 'Prompt', NOW(), NOW());

/* SQL text to insert entity field value with ID 3ad5aa6d-3d27-4550-8919-5f720df9ec8f */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('3ad5aa6d-3d27-4550-8919-5f720df9ec8f', '0EFEC745-EB79-4B5F-974E-3EF93A02B3F3', 7, 'While', 'While', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID 0EFEC745-EB79-4B5F-974E-3EF93A02B3F3 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='0EFEC745-EB79-4B5F-974E-3EF93A02B3F3';


/* Create Entity Relationship: MJ: AI Prompts -> MJ: Tasks (One To Many via PromptID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'f285a24a-6d4a-4df3-a899-87180035a392'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('f285a24a-6d4a-4df3-a899-87180035a392', '73AD0238-8B56-EF11-991A-6045BDEBA539', '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', 'PromptID', 'One To Many', TRUE, TRUE, 22, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '35ca8550-1bc0-43c3-997a-d0f237eece24' OR ("EntityID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1' AND "Name" = 'Prompt')
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
        '35ca8550-1bc0-43c3-997a-d0f237eece24',
        '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1', -- "Entity": "MJ": "Tasks"
        (SELECT COALESCE(MAX("Sequence"), 0) FROM __mj."EntityField" WHERE "EntityID" = '64AD3C8D-0570-48AF-AF4C-D0A2B173FDE1') + 37,
        'Prompt',
        'Prompt',
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
               SET "IsNameField" = FALSE
               WHERE "ID" = 'B3786698-56A7-4C58-BEB4-7127D992CE08'
               AND "AutoUpdateIsNameField" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '596F0FFE-6E36-4E9B-90D2-EB5BD65933D6'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = FALSE
            WHERE "ID" = '35248F34-2837-EF11-86D4-6045BDEE16E6'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '4CDA9696-9323-4F39-8F1C-5420FC4A3D30'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '1ACD1AF2-0477-47EC-A3CF-9E63C563CC72'
               AND "AutoUpdateDefaultInView" = TRUE;

/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '898D7496-DF26-4AAF-BA4B-6BE563D78184'
               AND "AutoUpdateDefaultInView" = TRUE;

/* Set categories for 10 fields */

-- UPDATE Entity Field Category Info MJ: Entity Action Params.ID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F95717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.EntityActionID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Action',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9F5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.ActionParamID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Action Parameter',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '985817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.ValueType

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '995817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.Value

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'JavaScript'
WHERE 
   "ID" = '9A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.Comments

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9B5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.ActionParam

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Action Parameter Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9E5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.LogValue

UPDATE __mj."EntityField"
SET 
   "Category" = 'Parameter Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CA3B5587-44A5-4266-9CE5-EDAA583DACA2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9C5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Action Params.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9D5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

/* Set categories for 12 fields */

-- UPDATE Entity Field Category Info MJ: Task Dependencies.ID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '36FFBC49-1613-4DDF-BB5C-651AF6FF195F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.TaskID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BB9353EF-735C-4D86-9C5B-110CE8580BF9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.Task

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1EBFF46F-9F99-4E18-AEF0-C00D03FCD0B9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.DependsOnTaskID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Depends On Task ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9233F1DA-6E87-4662-80B2-4227F37CE3DC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.DependencyType

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9AEC13B1-8C8B-4AF0-BA96-DD5E70BAA4E8' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.Condition

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'E48355ED-E858-4621-9E40-989891EC68F9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.DependsOnTask

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '28044698-7E43-4AFA-9676-195B01FB5C54' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.Priority

UPDATE __mj."EntityField"
SET 
   "Category" = 'Dependency Logic',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4CDA9696-9323-4F39-8F1C-5420FC4A3D30' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.Sequence

UPDATE __mj."EntityField"
SET 
   "Category" = 'Dependency Logic',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A7C3836B-046C-46CD-9153-4E39C616F88C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.ExclusiveGroup

UPDATE __mj."EntityField"
SET 
   "Category" = 'Dependency Logic',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1ACD1AF2-0477-47EC-A3CF-9E63C563CC72' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D8793880-61E7-465E-86F7-5521BDCD4FD9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Task Dependencies.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E70F4C17-C4C4-4A89-AFDC-7C0C992360B4' AND "AutoUpdateCategory" = TRUE;

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('b77a809f-aee6-431b-852c-d9b5ce5e1bd5', 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524', 'FieldCategoryInfo', '{"Dependency Logic":{"icon":"fa fa-sort-numeric-down","description":"Configuration for workflow branching, priority, and execution order"}}', NOW(), NOW());

/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Dependency Logic":"fa fa-sort-numeric-down"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'DD6EE217-00EC-4DE8-A2E6-489A08D4E524' AND "Name" = 'FieldCategoryIcons';

/* Set categories for 20 fields */

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.ID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '974C17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.RetentionPeriod

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Retention Period (Days)',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '675717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.ActionID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '984C17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.UserID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '665717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.Action

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Action Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9D4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.User

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6E5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.EntityActionID

UPDATE __mj."EntityField"
SET 
   "Category" = 'Associated Entities',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A06BAC2D-D59E-4D0E-BA24-DB99A3D7F4C5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.StartedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '635717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.EndedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '645717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.Params

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Input Parameters',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'A94C17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.ResultParams

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Result Parameters',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '1C62E051-5ABE-44B2-919D-44B19AB41BC8' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.ResultCode

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '655717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.Message

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'ACF9E782-BB68-4F6E-B6A9-EB120312C97C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.EntityActionInvocationTypeID

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Invocation Type ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '82F166B9-98C5-419B-8CA3-94C75F6923D0' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.EntityActionInvocationType

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Details',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Invocation Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9D336063-C666-47EA-B0D5-ED692E81E6E7' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.TargetEntityID

UPDATE __mj."EntityField"
SET 
   "Category" = 'Target Record',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '927CFE61-12A6-42FE-9CEF-DD20F4475BA5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.TargetEntity

UPDATE __mj."EntityField"
SET 
   "Category" = 'Target Record',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '898D7496-DF26-4AAF-BA4B-6BE563D78184' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.TargetRecordID

UPDATE __mj."EntityField"
SET 
   "Category" = 'Target Record',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AA659C40-FE09-430C-B9A6-750263BFDC77' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DE5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Action Execution Logs.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DF5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('63fe2924-70e9-4bae-a409-5e33e84bb7e9', '3E248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Target Record":{"icon":"fa fa-crosshairs","description":"Details regarding the specific entity and record targeted by the action execution"}}', NOW(), NOW());

/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Target Record":"fa fa-crosshairs"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = '3E248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'FieldCategoryIcons';

/* Set categories for 38 fields */

-- UPDATE Entity Field Category Info MJ: Tasks.ID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FD227316-95F3-468B-8DB8-AEA5E3A4C431' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.ParentID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C866D300-E97C-44E7-8848-F3DA97CE3F77' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.Name

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
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

-- UPDATE Entity Field Category Info MJ: Tasks.TypeID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
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
   "DisplayName" = 'Assigned User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9F585440-DA55-4A2A-A48B-2937A3B24483' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.AgentID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Assigned Agent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A1E1C7BA-66FA-4BDC-A21A-A27AB8C577C4' AND "AutoUpdateCategory" = TRUE;

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

-- UPDATE Entity Field Category Info MJ: Tasks.DueAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
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

-- UPDATE Entity Field Category Info MJ: Tasks.InputPayload

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '90A53434-F817-472C-AB60-28DB645385E2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.OutputPayload

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0DBE401E-846B-4BA5-90F5-880F6002BE3A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.ErrorMessage

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '459FABC9-0114-4C9A-BDED-EA8BFE3A01A1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.AgentRunID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4BBBBCC7-939D-4263-8E9E-739734722F01' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.ClaimedBy

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7248FCE9-F49E-4E2A-92D8-A9415FC3E032' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.ClaimExpiresAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D1672AB4-9C50-4948-8098-3C19847559B9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.ActionID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '24EE08A4-B3A0-45D6-8B08-1CF6750B17EB' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.StepType

UPDATE __mj."EntityField"
SET 
   "Category" = 'Task Execution Data',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0EFEC745-EB79-4B5F-974E-3EF93A02B3F3' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.PromptID

UPDATE __mj."EntityField"
SET 
   "Category" = 'Task Execution Data',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '42CF0A0B-1729-468D-AD07-9697999FA8B8' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.Configuration

UPDATE __mj."EntityField"
SET 
   "Category" = 'Task Execution Data',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '9F4FCD1B-CB01-43E6-8BF5-AF01AF34CE4A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.Parent

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Parent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2344E41B-6F21-419A-B80F-43636478A814' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.Type

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E1E5F477-3ABE-4793-BC11-A719CB078463' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.Environment

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Environment',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9A8AEAF5-9065-4B87-8A63-B04F84E83886' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.Project

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Project',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '65ABF2B8-3355-4427-828B-E3082806C557' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.ConversationDetail

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Conversation Detail',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2E0A3E85-A949-41A8-9B8B-5303EF016D72' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.User

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1EFAD61D-3A38-4CEA-86FE-67463E887920' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.Agent

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Agent',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E7951B0E-3F0A-45DA-BFC3-A4ABB3AC5E0C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.AgentRun

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '24928914-3408-43F5-B68A-83FBE325D603' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.Action

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Action',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '65D3238C-157A-47EF-AF55-84BF199B7522' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.Prompt

UPDATE __mj."EntityField"
SET 
   "Category" = 'Task Execution Data',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '35CA8550-1BC0-43C3-997A-D0F237EECE24' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Tasks.RootParentID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Root Parent ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '18585DF4-33D0-4CFC-95E4-6674186DCD9C' AND "AutoUpdateCategory" = TRUE;


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE __mj."Task"
 ADD CONSTRAINT "CK_Task_Status" CHECK
(
    "Status" IN ('Pending', 'In Progress', 'Complete', 'Failed', 'Blocked', 'Cancelled', 'Deferred', 'Skipped')
) NOT VALID;

ALTER TABLE __mj."Task"
 ADD CONSTRAINT "CK_Task_StepType"
    CHECK ("StepType" IN ('Agent', 'Action', 'Human', 'Prompt', 'ForEach', 'While', 'External')) NOT VALID;

ALTER TABLE __mj."Task"
 ADD CONSTRAINT "FK_Task_Prompt"
    FOREIGN KEY ("PromptID") REFERENCES __mj."AIPrompt"("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE __mj."Task"
 ADD CONSTRAINT "CK_Task_Assignment" CHECK (
        -- At most one assignment. All-NULL stays legal: a parent graph row is assigned to nothing.
        (CASE WHEN "UserID"   IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "AgentID"  IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "ActionID" IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN "PromptID" IS NOT NULL THEN 1 ELSE 0 END) <= 1
    ) NOT VALID;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwActionExecutionLogs" TO "cdp_UI", "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: Permissions for vwActionExecutionLogs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwActionExecutionLogs" TO "cdp_UI", "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: spCreateActionExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ActionExecutionLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateActionExecutionLog" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Action Execution Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateActionExecutionLog" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: spUpdateActionExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ActionExecutionLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateActionExecutionLog" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateActionExecutionLog" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Action Execution Logs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Action Execution Logs
-- Item: spDeleteActionExecutionLog
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ActionExecutionLog
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionExecutionLog" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Action Execution Logs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteActionExecutionLog" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for EntityActionFilter */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key EntityActionID in table EntityActionFilter;

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityActionFilters" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Entity Action Filters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: Permissions for vwEntityActionFilters
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityActionFilters" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Entity Action Filters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: spCreateEntityActionFilter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityActionFilter
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityActionFilter" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Entity Action Filters */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityActionFilter" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Entity Action Filters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: spUpdateEntityActionFilter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityActionFilter
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityActionFilter" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityActionFilter" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: vwEntityActionInvocations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Action Invocations
-----               SCHEMA:      __mj
-----               BASE TABLE:  EntityActionInvocation
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityActionInvocations" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: Permissions for vwEntityActionInvocations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityActionInvocations" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: spCreateEntityActionInvocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityActionInvocation
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityActionInvocation" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Entity Action Invocations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityActionInvocation" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: spUpdateEntityActionInvocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityActionInvocation
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityActionInvocation" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityActionInvocation" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: vwEntityActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Action Params
-----               SCHEMA:      __mj
-----               BASE TABLE:  EntityActionParam
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityActionParams" TO "cdp_Developer", "cdp_Integration", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: Permissions for vwEntityActionParams
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityActionParams" TO "cdp_Developer", "cdp_Integration", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: spCreateEntityActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityActionParam
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityActionParam" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Entity Action Params */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityActionParam" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: spUpdateEntityActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityActionParam
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityActionParam" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityActionParam" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Action Filters */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Filters
-- Item: spDeleteEntityActionFilter
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityActionFilter
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionFilter" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Action Filters */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionFilter" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Action Invocations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Invocations
-- Item: spDeleteEntityActionInvocation
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityActionInvocation
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionInvocation" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Action Invocations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionInvocation" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Action Params */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Action Params
-- Item: spDeleteEntityActionParam
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityActionParam
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionParam" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Action Params */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionParam" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for TaskDependency */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TaskID in table TaskDependency;

DO $$ BEGIN GRANT SELECT ON __mj."vwTaskDependencies" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: Permissions for vwTaskDependencies
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwTaskDependencies" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: spCreateTaskDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR TaskDependency
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTaskDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Task Dependencies */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateTaskDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: spUpdateTaskDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR TaskDependency
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTaskDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateTaskDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Task Dependencies */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Task Dependencies
-- Item: spDeleteTaskDependency
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR TaskDependency
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTaskDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Task Dependencies */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteTaskDependency" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* spDelete SQL for MJ: Actions */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Actions
-- Item: spDeleteAction
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Action
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAction" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Actions */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAction" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* SQL text to insert 1 new entity field(s) */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."TaskDependency"."Priority" IS 'Ordering within an exclusive group — higher wins. Mirrors AIAgentStepPath.Priority so a compiled workflow chooses the same branch the flow editor shows. Ignored for edges that are not part of an ExclusiveGroup.';

COMMENT ON COLUMN __mj."TaskDependency"."Sequence" IS 'Deterministic tiebreak when two edges in an ExclusiveGroup share a Priority, applied ascending. Load-bearing rather than cosmetic: compiled dependencies get fresh UUIDs and Priority defaults to 0, so without a stored ordinal a tie would resolve by row order and the same workflow could take a different branch on a different machine.';

COMMENT ON COLUMN __mj."TaskDependency"."ExclusiveGroup" IS 'XOR group key: sibling edges leaving the same origin that share a non-null ExclusiveGroup are an exclusive fan-out. The highest-Priority satisfied edge wins, ties broken by ascending Sequence; the rest are Skipped. NULL (the default) means an ordinary dependency, so existing graphs are unaffected. An unevaluable condition anywhere in the group holds the whole group rather than firing every branch.';

COMMENT ON COLUMN __mj."Task"."StepType" IS 'Which kind of workflow step this task represents. NULL for a task that is not part of a workflow, such as a hand-authored to-do. Determines which of AgentID/ActionID/PromptID/UserID is meaningful and how Configuration is read. This is the executable vocabulary and is deliberately not the same value list as AIAgentStep.StepType, which describes a step at design time.';

COMMENT ON COLUMN __mj."Task"."Configuration" IS 'Everything about this step that has no column of its own, as JSON: the loop definition for a ForEach or While step, an agent step''s message and template parameters, the mappings that move data between this step and the workflow payload, and the execution policy (timeout, retries, what to do on failure). Typed by ITaskStepConfiguration.';


-- ===================== Other =====================

/* ==============================================================================================
   ==============================================================================================
   ==
   ==   EVERYTHING BELOW THIS LINE WAS GENERATED BY THE MEMBERJUNCTION CODEGEN TOOL.
   ==   DO NOT EDIT IT BY HAND.
   ==
   ==   It is the database-side consequence of the hand-written DDL above: the EntityField rows for
   ==   Task.StepType / Task.PromptID / Task.Configuration and TaskDependency.Priority / .Sequence /
   ==   .ExclusiveGroup, the EntityFieldValue rows CodeGen derives from CK_Task_StepType and the
   ==   widened CK_Task_Status (including 'Skipped'), the Task -> AI Prompts relationship, the
   ==   regenerated vwTasks / vwTaskDependencies views, the regenerated spCreate / spUpdate /
   ==   spDelete procedures for both entities, the permission grants on those procedures, and the
   ==   extended properties.
   ==
   ==   WHY THIS SECTION IS REQUIRED, and why it sits BELOW the metadata refresh rather than above
   ==   it. The refresh reconciles entity fields that already EXIST; it does not create rows for new
   ==   columns and it does not derive value lists from CHECK constraints -- both of those are
   ==   CodeGen's job. Verified rather than assumed: a migrate-only build of this database produced
   ==   zero EntityField rows for the six columns above and zero EntityFieldValue rows for StepType,
   ==   while vwTasks did pick the columns up (spRecompileAllViews regenerates views from schema).
   ==   So without this block a from-scratch database would carry the columns but no metadata for
   ==   them, and the generated ORM would silently lack the fields.
   ==
   ==   That ordering also makes the hardcoded IDs below safe. Because the refresh never creates
   ==   these rows, the EntityField INSERTs here are what bring them into existence -- so the
   ==   EntityFieldValue rows that reference those IDs always find them. Running this section BEFORE
   ==   the refresh would be equally correct; running the refresh in a way that created the rows
   ==   first would NOT be, because the IDs would diverge and the value-list inserts would fail a
   ==   foreign key -- reported, as they always are, as an error that looks unrelated.
   ==
   ==   IF THE HAND-WRITTEN DDL ABOVE CHANGES, DO NOT PATCH THIS SECTION. Re-run `mj codegen` and
   ==   replace this entire generated block with the new CodeGen_Run_*.sql output.
   ==
   ==============================================================================================
   ============================================================================================== */

/* SQL text to insert 10 new entity field(s) */

/* spUpdate Permissions for MJ: Action Execution Logs */

/* spUpdate Permissions for MJ: Entity Action Filters */

/* spUpdate Permissions for MJ: Entity Action Invocations */

/* spUpdate Permissions for MJ: Entity Action Params */

/* spUpdate Permissions for MJ: Task Dependencies */

/* spUpdate Permissions for MJ: Tasks */
