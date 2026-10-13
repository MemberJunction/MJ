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
    ScheduledJob.MissedRunPolicy — what a job does about fire times that passed while nothing was
    running.

    A scheduler is down sometimes: a deploy, a crash, a machine that slept. On restart, a job whose
    NextRunAt is in the past has to answer a question the schema never asked — should the missed
    occurrences happen now? The right answer depends on what the job does, and only its author knows:
    a nightly digest wants one catch-up run (running it five times sends five identical emails); a
    per-period billing snapshot wants every occurrence (each period is its own unit of work); a cache
    warm wants none of them.

    DEFAULT IS 'RunOnce' BECAUSE THAT IS WHAT THE ENGINE ALREADY DOES.
    This was very nearly defaulted to 'Skip' on the assumption that skipping was today's behavior.
    It is not. ScheduledJobEngine.updateJobStatistics calls
    CronExpressionHelper.GetNextRunTime(cron, timezone) with NO fromDate, so the next run is computed
    from *now* — meaning a job whose NextRunAt has passed runs once immediately and then jumps
    forward. That is precisely 'RunOnce'. Defaulting to 'Skip' would have silently stopped every
    existing job in every install from catching up after an outage, which is exactly the kind of
    change a default is supposed to avoid.

    'Skip' and 'RunAll' are therefore opt-ins, and no existing row changes meaning.

    WHY 'RunAll' IS SAFE TO OFFER. The obvious objection is a replay storm: a job down for a week
    firing 168 times on restart. The engine avoids that by construction — under 'RunAll' the next
    NextRunAt is computed from the occurrence just consumed rather than from now, so the backlog is
    walked one occurrence per poll tick instead of dispatched at once. The drain is naturally rate
    limited by the poll cadence and by MaxConcurrentJobs.
*/

-- =====================================================================================
-- ScheduledJob: missed-run policy
-- =====================================================================================
ALTER TABLE __mj."ScheduledJob"
 ADD COLUMN IF NOT EXISTS "MissedRunPolicy" VARCHAR(20) NOT NULL
        CONSTRAINT DF_ScheduledJob_MissedRunPolicy DEFAULT 'RunOnce';

/*
    AIAgentRun.ContinuationDepth — how many task-graph continuations produced this run.

    THE CAP THIS MAKES REAL. A task graph may declare continuation:'reinvoke', meaning "when this
    graph finishes, start the submitting agent a fresh turn carrying the outcome". That agent can
    emit another graph, which can reinvoke again — a loop with no natural end. Phase 3 shipped the
    guard for it (MAX_REINVOKE_DEPTH, IsReinvokeCapReached) and Phase 4 shipped the parent metadata
    that carries reinvokeDepth, but the chain was never actually closed:

      - TaskGraphService.Submit reads ReinvokeDepth from its caller.
      - BaseAgent, the only caller, never passes one — so every submission is depth 0.
      - A reinvoked agent had no way to know it WAS a continuation, let alone at what depth.

    So the cap could never trip. Phase 7 therefore left Reinvoke unimplemented on purpose and let the
    dispatcher degrade to posting a message: a cap that never fires is worse than one continuation
    mode being unavailable, because the failure is an unbounded chain of real agent runs.

    This column is the missing durable link. A run started as a continuation records its depth; when
    that run submits a graph, the depth travels into the graph's metadata as depth + 1; when THAT
    graph settles, IsReinvokeCapReached finally has a true number to compare.

    WHY A COLUMN RATHER THAN THE EXISTING JSON. The alternative was stashing a marker inside
    AIAgentRun.Data or StartingPayload, both of which already exist. Rejected: those fields belong to
    the caller's payload, and framework bookkeeping hidden in them is only reachable by string key —
    the weakly-typed pattern generated entity properties exist to eliminate. The value is also
    load-bearing for a safety cap, which is the last place to accept a silent typo.

    NOT NULL DEFAULT 0 rather than nullable: 0 is a meaningful, correct value — "this run is not a
    continuation" — and it is what every existing run is. A NULL would mean the same thing while
    forcing every reader to handle absence.

    Deliberately distinct from ParentRunID, which tracks SUB-AGENT lineage (a run that another run
    spawned as part of its own turn). A continuation is the opposite shape: a new top-level turn
    caused by work that already finished. Reusing ParentRunID would conflate two unrelated ancestries.
*/

-- =====================================================================================
-- AIAgentRun: task-graph continuation depth
-- =====================================================================================
ALTER TABLE __mj."AIAgentRun"
 ADD COLUMN IF NOT EXISTS "ContinuationDepth" INTEGER NOT NULL
        CONSTRAINT DF_AIAgentRun_ContinuationDepth DEFAULT 0;

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

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ScheduledJob_JobTypeID" ON __mj."ScheduledJob" ("JobTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ScheduledJob_OwnerUserID" ON __mj."ScheduledJob" ("OwnerUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ScheduledJob_NotifyUserID" ON __mj."ScheduledJob" ("NotifyUserID");


-- ===================== Helper Functions (fn*) =====================

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


-- ===================== Views =====================

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
  v_target_name CONSTANT TEXT := 'vwScheduledJobs';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwScheduledJobs"
AS SELECT
    s.*,
    "MJScheduledJobType_JobTypeID"."Name" AS "JobType",
    "MJUser_OwnerUserID"."Name" AS "OwnerUser",
    "MJUser_NotifyUserID"."Name" AS "NotifyUser"
FROM
    __mj."ScheduledJob" AS s
INNER JOIN
    __mj."ScheduledJobType" AS "MJScheduledJobType_JobTypeID"
  ON
    s."JobTypeID" = "MJScheduledJobType_JobTypeID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_OwnerUserID"
  ON
    s."OwnerUserID" = "MJUser_OwnerUserID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_NotifyUserID"
  ON
    s."NotifyUserID" = "MJUser_NotifyUserID"."ID"$vsql$;
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
    FOREACH v_field_name IN ARRAY ARRAY['AgentID', 'ParentRunID', 'Status', 'StartedAt', 'CompletedAt', 'Success', 'ErrorMessage', 'ConversationID', 'UserID', 'Result', 'AgentState', 'TotalTokensUsed', 'TotalCost', 'TotalPromptTokensUsed', 'TotalCompletionTokensUsed', 'TotalTokensUsedRollup', 'TotalPromptTokensUsedRollup', 'TotalCompletionTokensUsedRollup', 'TotalCostRollup', 'ConversationDetailID', 'ConversationDetailSequence', 'CancellationReason', 'FinalStep', 'FinalPayload', 'Message', 'LastRunID', 'StartingPayload', 'TotalPromptIterations', 'ConfigurationID', 'OverrideModelID', 'OverrideVendorID', 'Data', 'Verbose', 'EffortLevel', 'RunName', 'Comments', 'ScheduledJobRunID', 'TestRunID', 'PrimaryScopeEntityID', 'PrimaryScopeRecordID', 'SecondaryScopes', 'ExternalReferenceID', 'CompanyID', 'TotalCacheReadTokensUsed', 'TotalCacheWriteTokensUsed', 'LastHeartbeatAt', 'AgentSessionID', 'PlanMode', 'ExternalSessionID', 'ContinuationDepth']
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
                WHEN 'PlanMode' THEN '($1->>''PlanMode'')::BOOLEAN'
                WHEN 'ExternalSessionID' THEN '($1->>''ExternalSessionID'')'
                WHEN 'ContinuationDepth' THEN '($1->>''ContinuationDepth'')::INTEGER'
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
        "PlanMode" = CASE WHEN p_data ? 'PlanMode' THEN (p_data->>'PlanMode')::BOOLEAN ELSE "PlanMode" END,
        "ExternalSessionID" = CASE WHEN p_data ? 'ExternalSessionID' THEN (p_data->>'ExternalSessionID') ELSE "ExternalSessionID" END,
        "ContinuationDepth" = CASE WHEN p_data ? 'ContinuationDepth' THEN (p_data->>'ContinuationDepth')::INTEGER ELSE "ContinuationDepth" END,
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
           WHERE proname = 'spCreateScheduledJob'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateScheduledJob"(
    IN p_ID UUID DEFAULT NULL,
    IN p_JobTypeID UUID DEFAULT NULL,
    IN p_Name VARCHAR(200) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_CronExpression VARCHAR(120) DEFAULT NULL,
    IN p_Timezone VARCHAR(64) DEFAULT NULL,
    IN p_StartAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartAt TIMESTAMPTZ DEFAULT NULL,
    IN p_EndAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_EndAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_OwnerUserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OwnerUserID UUID DEFAULT NULL,
    IN p_LastRunAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastRunAt TIMESTAMPTZ DEFAULT NULL,
    IN p_NextRunAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_NextRunAt TIMESTAMPTZ DEFAULT NULL,
    IN p_RunCount INTEGER DEFAULT NULL,
    IN p_SuccessCount INTEGER DEFAULT NULL,
    IN p_FailureCount INTEGER DEFAULT NULL,
    IN p_NotifyOnSuccess BOOLEAN DEFAULT NULL,
    IN p_NotifyOnFailure BOOLEAN DEFAULT NULL,
    IN p_NotifyUserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_NotifyUserID UUID DEFAULT NULL,
    IN p_NotifyViaEmail BOOLEAN DEFAULT NULL,
    IN p_NotifyViaInApp BOOLEAN DEFAULT NULL,
    IN p_LockToken_Clear BOOLEAN DEFAULT FALSE,
    IN p_LockToken UUID DEFAULT NULL,
    IN p_LockedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LockedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_LockedByInstance_Clear BOOLEAN DEFAULT FALSE,
    IN p_LockedByInstance VARCHAR(255) DEFAULT NULL,
    IN p_ExpectedCompletionAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExpectedCompletionAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ConcurrencyMode VARCHAR(20) DEFAULT NULL,
    IN p_RunImmediatelyIfNeverRun BOOLEAN DEFAULT NULL,
    IN p_MaxRuntimeMinutes_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxRuntimeMinutes INTEGER DEFAULT NULL,
    IN p_MissedRunPolicy VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwScheduledJobs" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ScheduledJob"
            (
                "ID",
                "JobTypeID",
                "Name",
                "Description",
                "CronExpression",
                "Timezone",
                "StartAt",
                "EndAt",
                "Status",
                "Configuration",
                "OwnerUserID",
                "LastRunAt",
                "NextRunAt",
                "RunCount",
                "SuccessCount",
                "FailureCount",
                "NotifyOnSuccess",
                "NotifyOnFailure",
                "NotifyUserID",
                "NotifyViaEmail",
                "NotifyViaInApp",
                "LockToken",
                "LockedAt",
                "LockedByInstance",
                "ExpectedCompletionAt",
                "ConcurrencyMode",
                "RunImmediatelyIfNeverRun",
                "MaxRuntimeMinutes",
                "MissedRunPolicy"
            )
        VALUES
            (
                p_ID,
                p_JobTypeID,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                p_CronExpression,
                COALESCE(p_Timezone, 'UTC'),
                CASE WHEN p_StartAt_Clear = TRUE THEN NULL ELSE COALESCE(p_StartAt, NULL) END,
                CASE WHEN p_EndAt_Clear = TRUE THEN NULL ELSE COALESCE(p_EndAt, NULL) END,
                COALESCE(p_Status, 'Pending'),
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END,
                CASE WHEN p_OwnerUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_OwnerUserID, NULL) END,
                CASE WHEN p_LastRunAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRunAt, NULL) END,
                CASE WHEN p_NextRunAt_Clear = TRUE THEN NULL ELSE COALESCE(p_NextRunAt, NULL) END,
                COALESCE(p_RunCount, 0),
                COALESCE(p_SuccessCount, 0),
                COALESCE(p_FailureCount, 0),
                COALESCE(p_NotifyOnSuccess, FALSE),
                COALESCE(p_NotifyOnFailure, TRUE),
                CASE WHEN p_NotifyUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_NotifyUserID, NULL) END,
                COALESCE(p_NotifyViaEmail, FALSE),
                COALESCE(p_NotifyViaInApp, TRUE),
                CASE WHEN p_LockToken_Clear = TRUE THEN NULL ELSE COALESCE(p_LockToken, NULL) END,
                CASE WHEN p_LockedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LockedAt, NULL) END,
                CASE WHEN p_LockedByInstance_Clear = TRUE THEN NULL ELSE COALESCE(p_LockedByInstance, NULL) END,
                CASE WHEN p_ExpectedCompletionAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpectedCompletionAt, NULL) END,
                COALESCE(p_ConcurrencyMode, 'Skip'),
                COALESCE(p_RunImmediatelyIfNeverRun, FALSE),
                CASE WHEN p_MaxRuntimeMinutes_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxRuntimeMinutes, NULL) END,
                COALESCE(p_MissedRunPolicy, 'RunOnce')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ScheduledJob"
            (
                "JobTypeID",
                "Name",
                "Description",
                "CronExpression",
                "Timezone",
                "StartAt",
                "EndAt",
                "Status",
                "Configuration",
                "OwnerUserID",
                "LastRunAt",
                "NextRunAt",
                "RunCount",
                "SuccessCount",
                "FailureCount",
                "NotifyOnSuccess",
                "NotifyOnFailure",
                "NotifyUserID",
                "NotifyViaEmail",
                "NotifyViaInApp",
                "LockToken",
                "LockedAt",
                "LockedByInstance",
                "ExpectedCompletionAt",
                "ConcurrencyMode",
                "RunImmediatelyIfNeverRun",
                "MaxRuntimeMinutes",
                "MissedRunPolicy"
            )
        VALUES
            (
                p_JobTypeID,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                p_CronExpression,
                COALESCE(p_Timezone, 'UTC'),
                CASE WHEN p_StartAt_Clear = TRUE THEN NULL ELSE COALESCE(p_StartAt, NULL) END,
                CASE WHEN p_EndAt_Clear = TRUE THEN NULL ELSE COALESCE(p_EndAt, NULL) END,
                COALESCE(p_Status, 'Pending'),
                CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, NULL) END,
                CASE WHEN p_OwnerUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_OwnerUserID, NULL) END,
                CASE WHEN p_LastRunAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRunAt, NULL) END,
                CASE WHEN p_NextRunAt_Clear = TRUE THEN NULL ELSE COALESCE(p_NextRunAt, NULL) END,
                COALESCE(p_RunCount, 0),
                COALESCE(p_SuccessCount, 0),
                COALESCE(p_FailureCount, 0),
                COALESCE(p_NotifyOnSuccess, FALSE),
                COALESCE(p_NotifyOnFailure, TRUE),
                CASE WHEN p_NotifyUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_NotifyUserID, NULL) END,
                COALESCE(p_NotifyViaEmail, FALSE),
                COALESCE(p_NotifyViaInApp, TRUE),
                CASE WHEN p_LockToken_Clear = TRUE THEN NULL ELSE COALESCE(p_LockToken, NULL) END,
                CASE WHEN p_LockedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LockedAt, NULL) END,
                CASE WHEN p_LockedByInstance_Clear = TRUE THEN NULL ELSE COALESCE(p_LockedByInstance, NULL) END,
                CASE WHEN p_ExpectedCompletionAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpectedCompletionAt, NULL) END,
                COALESCE(p_ConcurrencyMode, 'Skip'),
                COALESCE(p_RunImmediatelyIfNeverRun, FALSE),
                CASE WHEN p_MaxRuntimeMinutes_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxRuntimeMinutes, NULL) END,
                COALESCE(p_MissedRunPolicy, 'RunOnce')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwScheduledJobs" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateScheduledJob'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateScheduledJob"(
    IN p_ID UUID,
    IN p_JobTypeID UUID DEFAULT NULL,
    IN p_Name VARCHAR(200) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_CronExpression VARCHAR(120) DEFAULT NULL,
    IN p_Timezone VARCHAR(64) DEFAULT NULL,
    IN p_StartAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_StartAt TIMESTAMPTZ DEFAULT NULL,
    IN p_EndAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_EndAt TIMESTAMPTZ DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_Configuration_Clear BOOLEAN DEFAULT FALSE,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_OwnerUserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_OwnerUserID UUID DEFAULT NULL,
    IN p_LastRunAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LastRunAt TIMESTAMPTZ DEFAULT NULL,
    IN p_NextRunAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_NextRunAt TIMESTAMPTZ DEFAULT NULL,
    IN p_RunCount INTEGER DEFAULT NULL,
    IN p_SuccessCount INTEGER DEFAULT NULL,
    IN p_FailureCount INTEGER DEFAULT NULL,
    IN p_NotifyOnSuccess BOOLEAN DEFAULT NULL,
    IN p_NotifyOnFailure BOOLEAN DEFAULT NULL,
    IN p_NotifyUserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_NotifyUserID UUID DEFAULT NULL,
    IN p_NotifyViaEmail BOOLEAN DEFAULT NULL,
    IN p_NotifyViaInApp BOOLEAN DEFAULT NULL,
    IN p_LockToken_Clear BOOLEAN DEFAULT FALSE,
    IN p_LockToken UUID DEFAULT NULL,
    IN p_LockedAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_LockedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_LockedByInstance_Clear BOOLEAN DEFAULT FALSE,
    IN p_LockedByInstance VARCHAR(255) DEFAULT NULL,
    IN p_ExpectedCompletionAt_Clear BOOLEAN DEFAULT FALSE,
    IN p_ExpectedCompletionAt TIMESTAMPTZ DEFAULT NULL,
    IN p_ConcurrencyMode VARCHAR(20) DEFAULT NULL,
    IN p_RunImmediatelyIfNeverRun BOOLEAN DEFAULT NULL,
    IN p_MaxRuntimeMinutes_Clear BOOLEAN DEFAULT FALSE,
    IN p_MaxRuntimeMinutes INTEGER DEFAULT NULL,
    IN p_MissedRunPolicy VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwScheduledJobs" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ScheduledJob"
    SET
        "JobTypeID" = COALESCE(p_JobTypeID, "JobTypeID"),
        "Name" = COALESCE(p_Name, "Name"),
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "CronExpression" = COALESCE(p_CronExpression, "CronExpression"),
        "Timezone" = COALESCE(p_Timezone, "Timezone"),
        "StartAt" = CASE WHEN p_StartAt_Clear = TRUE THEN NULL ELSE COALESCE(p_StartAt, "StartAt") END,
        "EndAt" = CASE WHEN p_EndAt_Clear = TRUE THEN NULL ELSE COALESCE(p_EndAt, "EndAt") END,
        "Status" = COALESCE(p_Status, "Status"),
        "Configuration" = CASE WHEN p_Configuration_Clear = TRUE THEN NULL ELSE COALESCE(p_Configuration, "Configuration") END,
        "OwnerUserID" = CASE WHEN p_OwnerUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_OwnerUserID, "OwnerUserID") END,
        "LastRunAt" = CASE WHEN p_LastRunAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LastRunAt, "LastRunAt") END,
        "NextRunAt" = CASE WHEN p_NextRunAt_Clear = TRUE THEN NULL ELSE COALESCE(p_NextRunAt, "NextRunAt") END,
        "RunCount" = COALESCE(p_RunCount, "RunCount"),
        "SuccessCount" = COALESCE(p_SuccessCount, "SuccessCount"),
        "FailureCount" = COALESCE(p_FailureCount, "FailureCount"),
        "NotifyOnSuccess" = COALESCE(p_NotifyOnSuccess, "NotifyOnSuccess"),
        "NotifyOnFailure" = COALESCE(p_NotifyOnFailure, "NotifyOnFailure"),
        "NotifyUserID" = CASE WHEN p_NotifyUserID_Clear = TRUE THEN NULL ELSE COALESCE(p_NotifyUserID, "NotifyUserID") END,
        "NotifyViaEmail" = COALESCE(p_NotifyViaEmail, "NotifyViaEmail"),
        "NotifyViaInApp" = COALESCE(p_NotifyViaInApp, "NotifyViaInApp"),
        "LockToken" = CASE WHEN p_LockToken_Clear = TRUE THEN NULL ELSE COALESCE(p_LockToken, "LockToken") END,
        "LockedAt" = CASE WHEN p_LockedAt_Clear = TRUE THEN NULL ELSE COALESCE(p_LockedAt, "LockedAt") END,
        "LockedByInstance" = CASE WHEN p_LockedByInstance_Clear = TRUE THEN NULL ELSE COALESCE(p_LockedByInstance, "LockedByInstance") END,
        "ExpectedCompletionAt" = CASE WHEN p_ExpectedCompletionAt_Clear = TRUE THEN NULL ELSE COALESCE(p_ExpectedCompletionAt, "ExpectedCompletionAt") END,
        "ConcurrencyMode" = COALESCE(p_ConcurrencyMode, "ConcurrencyMode"),
        "RunImmediatelyIfNeverRun" = COALESCE(p_RunImmediatelyIfNeverRun, "RunImmediatelyIfNeverRun"),
        "MaxRuntimeMinutes" = CASE WHEN p_MaxRuntimeMinutes_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxRuntimeMinutes, "MaxRuntimeMinutes") END,
        "MissedRunPolicy" = COALESCE(p_MissedRunPolicy, "MissedRunPolicy")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwScheduledJobs" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwScheduledJobs" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteScheduledJob'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteScheduledJob"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ScheduledJob"
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
    p_MJAIAgentRuns_ConversationID_ExternalSessionID VARCHAR(255);
    p_MJAIAgentRuns_ConversationID_ContinuationDepth INTEGER;
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


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt", "AgentSessionID", "PlanMode", "ExternalSessionID", "ContinuationDepth" FROM __mj."AIAgentRun" WHERE "ConversationID" = p_ID
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
        p_MJAIAgentRuns_ConversationID_ExternalSessionID := _rec."ExternalSessionID";
        p_MJAIAgentRuns_ConversationID_ContinuationDepth := _rec."ContinuationDepth";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ConversationID_ConversationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ConversationIDID, p_AgentID => p_MJAIAgentRuns_ConversationID_AgentID, p_ParentRunID => p_MJAIAgentRuns_ConversationID_ParentRunID, p_Status => p_MJAIAgentRuns_ConversationID_Status, p_StartedAt => p_MJAIAgentRuns_ConversationID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ConversationID_CompletedAt, p_Success => p_MJAIAgentRuns_ConversationID_Success, p_ErrorMessage => p_MJAIAgentRuns_ConversationID_ErrorMessage, p_ConversationID_Clear => 1, p_ConversationID => p_MJAIAgentRuns_ConversationID_ConversationID, p_UserID => p_MJAIAgentRuns_ConversationID_UserID, p_Result => p_MJAIAgentRuns_ConversationID_Result, p_AgentState => p_MJAIAgentRuns_ConversationID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ConversationID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ConversationID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ConversationID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ConversationID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ConversationID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_ConversationID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_ConversationID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ConversationID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ConversationID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ConversationID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ConversationID_FinalPayload, p_Message => p_MJAIAgentRuns_ConversationID_Message, p_LastRunID => p_MJAIAgentRuns_ConversationID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ConversationID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ConversationID_TotalPromptIterations, p_ConfigurationID => p_MJAIAgentRuns_ConversationID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ConversationID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ConversationID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ConversationID_Data, p_Verbose => p_MJAIAgentRuns_ConversationID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ConversationID_EffortLevel, p_RunName => p_MJAIAgentRuns_ConversationID_RunName, p_Comments => p_MJAIAgentRuns_ConversationID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ConversationID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ConversationID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ConversationID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ConversationID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ConversationID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ConversationID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ConversationID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_ConversationID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_ConversationID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_ConversationID_LastHeartbeatAt, p_AgentSessionID => p_MJAIAgentRuns_ConversationID_AgentSessionID, p_PlanMode => p_MJAIAgentRuns_ConversationID_PlanMode, p_ExternalSessionID => p_MJAIAgentRuns_ConversationID_ExternalSessionID, p_ContinuationDepth => p_MJAIAgentRuns_ConversationID_ContinuationDepth);

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
    p_MJAIAgentRuns_ConfigurationID_PlanMode BOOLEAN;
    p_MJAIAgentRuns_ConfigurationID_ExternalSessionID VARCHAR(255);
    p_MJAIAgentRuns_ConfigurationID_ContinuationDepth INTEGER;
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
    p_MJScopedPromptConfigs_ConfigurationIDID UUID;
    p_MJScopedPromptConfigs_ConfigurationID_PromptID UUID;
    p_MJScopedPromptConfigs_ConfigurationID_Description TEXT;
    p_MJScopedPromptConfigs_ConfigurationID_PrimaryScopeEntityID UUID;
    p_MJScopedPromptConfigs_ConfigurationID_PrimaryScopeRecordID VARCHAR(100);
    p_MJScopedPromptConfigs_ConfigurationID_SecondaryScopes TEXT;
    p_MJScopedPromptConfigs_ConfigurationID_Status VARCHAR(20);
    p_MJScopedPromptConfigs_ConfigurationID_Priority INTEGER;
    p_MJScopedPromptConfigs_ConfigurationID_ModelID UUID;
    p_MJScopedPromptConfigs_ConfigurationID_VendorID UUID;
    p_MJScopedPromptConfigs_ConfigurationID_ConfigurationID UUID;
    p_MJScopedPromptConfigs_ConfigurationID_Temperature NUMERIC(3,2);
    p_MJScopedPromptConfigs_ConfigurationID_TopP NUMERIC(3,2);
    p_MJScopedPromptConfigs_ConfigurationID_TopK INTEGER;
    p_MJScopedPromptConfigs_ConfigurationID_MinP NUMERIC(3,2);
    p_MJScopedPromptConfigs_ConfigurationID_FrequencyPenalty NUMERIC(3,2);
    p_MJScopedPromptConfigs_ConfigurationID_PresencePenalty NUMERIC(3,2);
    p_MJScopedPromptConfigs_ConfigurationID_Seed INTEGER;
    p_MJScopedPromptConfigs_ConfigurationID_StopSequences VARCHAR(1000);
    p_MJScopedPromptConfigs_ConfigurationID_ResponseFormat VARCHAR(20);
    p_MJScopedPromptConfigs_ConfigurationID_EffortLevel INTEGER;
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


    FOR _rec IN SELECT "ID", "AgentID", "ParentRunID", "Status", "StartedAt", "CompletedAt", "Success", "ErrorMessage", "ConversationID", "UserID", "Result", "AgentState", "TotalTokensUsed", "TotalCost", "TotalPromptTokensUsed", "TotalCompletionTokensUsed", "TotalTokensUsedRollup", "TotalPromptTokensUsedRollup", "TotalCompletionTokensUsedRollup", "TotalCostRollup", "ConversationDetailID", "ConversationDetailSequence", "CancellationReason", "FinalStep", "FinalPayload", "Message", "LastRunID", "StartingPayload", "TotalPromptIterations", "ConfigurationID", "OverrideModelID", "OverrideVendorID", "Data", "Verbose", "EffortLevel", "RunName", "Comments", "ScheduledJobRunID", "TestRunID", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "ExternalReferenceID", "CompanyID", "TotalCacheReadTokensUsed", "TotalCacheWriteTokensUsed", "LastHeartbeatAt", "AgentSessionID", "PlanMode", "ExternalSessionID", "ContinuationDepth" FROM __mj."AIAgentRun" WHERE "ConfigurationID" = p_ID
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
        p_MJAIAgentRuns_ConfigurationID_PlanMode := _rec."PlanMode";
        p_MJAIAgentRuns_ConfigurationID_ExternalSessionID := _rec."ExternalSessionID";
        p_MJAIAgentRuns_ConfigurationID_ContinuationDepth := _rec."ContinuationDepth";
        -- Set the FK field to NULL
        p_MJAIAgentRuns_ConfigurationID_ConfigurationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentRun"(p_ID => p_MJAIAgentRuns_ConfigurationIDID, p_AgentID => p_MJAIAgentRuns_ConfigurationID_AgentID, p_ParentRunID => p_MJAIAgentRuns_ConfigurationID_ParentRunID, p_Status => p_MJAIAgentRuns_ConfigurationID_Status, p_StartedAt => p_MJAIAgentRuns_ConfigurationID_StartedAt, p_CompletedAt => p_MJAIAgentRuns_ConfigurationID_CompletedAt, p_Success => p_MJAIAgentRuns_ConfigurationID_Success, p_ErrorMessage => p_MJAIAgentRuns_ConfigurationID_ErrorMessage, p_ConversationID => p_MJAIAgentRuns_ConfigurationID_ConversationID, p_UserID => p_MJAIAgentRuns_ConfigurationID_UserID, p_Result => p_MJAIAgentRuns_ConfigurationID_Result, p_AgentState => p_MJAIAgentRuns_ConfigurationID_AgentState, p_TotalTokensUsed => p_MJAIAgentRuns_ConfigurationID_TotalTokensUsed, p_TotalCost => p_MJAIAgentRuns_ConfigurationID_TotalCost, p_TotalPromptTokensUsed => p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsed, p_TotalCompletionTokensUsed => p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsed, p_TotalTokensUsedRollup => p_MJAIAgentRuns_ConfigurationID_TotalTokensUsedRollup, p_TotalPromptTokensUsedRollup => p_MJAIAgentRuns_ConfigurationID_TotalPromptTokensUsedRollup, p_TotalCompletionTokensUsedRollup => p_MJAIAgentRuns_ConfigurationID_TotalCompletionTokensUsedRollup, p_TotalCostRollup => p_MJAIAgentRuns_ConfigurationID_TotalCostRollup, p_ConversationDetailID => p_MJAIAgentRuns_ConfigurationID_ConversationDetailID, p_ConversationDetailSequence => p_MJAIAgentRuns_ConfigurationID_ConversationDetailSequence, p_CancellationReason => p_MJAIAgentRuns_ConfigurationID_CancellationReason, p_FinalStep => p_MJAIAgentRuns_ConfigurationID_FinalStep, p_FinalPayload => p_MJAIAgentRuns_ConfigurationID_FinalPayload, p_Message => p_MJAIAgentRuns_ConfigurationID_Message, p_LastRunID => p_MJAIAgentRuns_ConfigurationID_LastRunID, p_StartingPayload => p_MJAIAgentRuns_ConfigurationID_StartingPayload, p_TotalPromptIterations => p_MJAIAgentRuns_ConfigurationID_TotalPromptIterations, p_ConfigurationID_Clear => 1, p_ConfigurationID => p_MJAIAgentRuns_ConfigurationID_ConfigurationID, p_OverrideModelID => p_MJAIAgentRuns_ConfigurationID_OverrideModelID, p_OverrideVendorID => p_MJAIAgentRuns_ConfigurationID_OverrideVendorID, p_Data => p_MJAIAgentRuns_ConfigurationID_Data, p_Verbose => p_MJAIAgentRuns_ConfigurationID_Verbose, p_EffortLevel => p_MJAIAgentRuns_ConfigurationID_EffortLevel, p_RunName => p_MJAIAgentRuns_ConfigurationID_RunName, p_Comments => p_MJAIAgentRuns_ConfigurationID_Comments, p_ScheduledJobRunID => p_MJAIAgentRuns_ConfigurationID_ScheduledJobRunID, p_TestRunID => p_MJAIAgentRuns_ConfigurationID_TestRunID, p_PrimaryScopeEntityID => p_MJAIAgentRuns_ConfigurationID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJAIAgentRuns_ConfigurationID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJAIAgentRuns_ConfigurationID_SecondaryScopes, p_ExternalReferenceID => p_MJAIAgentRuns_ConfigurationID_ExternalReferenceID, p_CompanyID => p_MJAIAgentRuns_ConfigurationID_CompanyID, p_TotalCacheReadTokensUsed => p_MJAIAgentRuns_ConfigurationID_TotalCacheReadTokensUsed, p_TotalCacheWriteTokensUsed => p_MJAIAgentRuns_ConfigurationID_TotalCacheWriteTokensUsed, p_LastHeartbeatAt => p_MJAIAgentRuns_ConfigurationID_LastHeartbeatAt, p_AgentSessionID => p_MJAIAgentRuns_ConfigurationID_AgentSessionID, p_PlanMode => p_MJAIAgentRuns_ConfigurationID_PlanMode, p_ExternalSessionID => p_MJAIAgentRuns_ConfigurationID_ExternalSessionID, p_ContinuationDepth => p_MJAIAgentRuns_ConfigurationID_ContinuationDepth);

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


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID", "AssistantPrefill", "TokensCacheRead", "TokensCacheWrite", "TokensCacheReadRollup", "TokensCacheWriteRollup" FROM __mj."AIPromptRun" WHERE "ConfigurationID" = p_ID
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
        PERFORM __mj."spUpdateAIPromptRun"(p_ID => p_MJAIPromptRuns_ConfigurationIDID, p_PromptID => p_MJAIPromptRuns_ConfigurationID_PromptID, p_ModelID => p_MJAIPromptRuns_ConfigurationID_ModelID, p_VendorID => p_MJAIPromptRuns_ConfigurationID_VendorID, p_AgentID => p_MJAIPromptRuns_ConfigurationID_AgentID, p_ConfigurationID_Clear => 1, p_ConfigurationID => p_MJAIPromptRuns_ConfigurationID_ConfigurationID, p_RunAt => p_MJAIPromptRuns_ConfigurationID_RunAt, p_CompletedAt => p_MJAIPromptRuns_ConfigurationID_CompletedAt, p_ExecutionTimeMS => p_MJAIPromptRuns_ConfigurationID_ExecutionTimeMS, p_Messages => p_MJAIPromptRuns_ConfigurationID_Messages, p_Result => p_MJAIPromptRuns_ConfigurationID_Result, p_TokensUsed => p_MJAIPromptRuns_ConfigurationID_TokensUsed, p_TokensPrompt => p_MJAIPromptRuns_ConfigurationID_TokensPrompt, p_TokensCompletion => p_MJAIPromptRuns_ConfigurationID_TokensCompletion, p_TotalCost => p_MJAIPromptRuns_ConfigurationID_TotalCost, p_Success => p_MJAIPromptRuns_ConfigurationID_Success, p_ErrorMessage => p_MJAIPromptRuns_ConfigurationID_ErrorMessage, p_ParentID => p_MJAIPromptRuns_ConfigurationID_ParentID, p_RunType => p_MJAIPromptRuns_ConfigurationID_RunType, p_ExecutionOrder => p_MJAIPromptRuns_ConfigurationID_ExecutionOrder, p_Cost => p_MJAIPromptRuns_ConfigurationID_Cost, p_CostCurrency => p_MJAIPromptRuns_ConfigurationID_CostCurrency, p_TokensUsedRollup => p_MJAIPromptRuns_ConfigurationID_TokensUsedRollup, p_TokensPromptRollup => p_MJAIPromptRuns_ConfigurationID_TokensPromptRollup, p_TokensCompletionRollup => p_MJAIPromptRuns_ConfigurationID_TokensCompletionRollup, p_Temperature => p_MJAIPromptRuns_ConfigurationID_Temperature, p_TopP => p_MJAIPromptRuns_ConfigurationID_TopP, p_TopK => p_MJAIPromptRuns_ConfigurationID_TopK, p_MinP => p_MJAIPromptRuns_ConfigurationID_MinP, p_FrequencyPenalty => p_MJAIPromptRuns_ConfigurationID_FrequencyPenalty, p_PresencePenalty => p_MJAIPromptRuns_ConfigurationID_PresencePenalty, p_Seed => p_MJAIPromptRuns_ConfigurationID_Seed, p_StopSequences => p_MJAIPromptRuns_ConfigurationID_StopSequences, p_ResponseFormat => p_MJAIPromptRuns_ConfigurationID_ResponseFormat, p_LogProbs => p_MJAIPromptRuns_ConfigurationID_LogProbs, p_TopLogProbs => p_MJAIPromptRuns_ConfigurationID_TopLogProbs, p_DescendantCost => p_MJAIPromptRuns_ConfigurationID_DescendantCost, p_ValidationAttemptCount => p_MJAIPromptRuns_ConfigurationID_ValidationAttemptCount, p_SuccessfulValidationCount => p_MJAIPromptRuns_ConfigurationID_SuccessfulValidationCount, p_FinalValidationPassed => p_MJAIPromptRuns_ConfigurationID_FinalValidationPassed, p_ValidationBehavior => p_MJAIPromptRuns_ConfigurationID_ValidationBehavior, p_RetryStrategy => p_MJAIPromptRuns_ConfigurationID_RetryStrategy, p_MaxRetriesConfigured => p_MJAIPromptRuns_ConfigurationID_MaxRetriesConfigured, p_FinalValidationError => p_MJAIPromptRuns_ConfigurationID_FinalValidationError, p_ValidationErrorCount => p_MJAIPromptRuns_ConfigurationID_ValidationErrorCount, p_CommonValidationError => p_MJAIPromptRuns_ConfigurationID_CommonValidationError, p_FirstAttemptAt => p_MJAIPromptRuns_ConfigurationID_FirstAttemptAt, p_LastAttemptAt => p_MJAIPromptRuns_ConfigurationID_LastAttemptAt, p_TotalRetryDurationMS => p_MJAIPromptRuns_ConfigurationID_TotalRetryDurationMS, p_ValidationAttempts => p_MJAIPromptRuns_ConfigurationID_ValidationAttempts, p_ValidationSummary => p_MJAIPromptRuns_ConfigurationID_ValidationSummary, p_FailoverAttempts => p_MJAIPromptRuns_ConfigurationID_FailoverAttempts, p_FailoverErrors => p_MJAIPromptRuns_ConfigurationID_FailoverErrors, p_FailoverDurations => p_MJAIPromptRuns_ConfigurationID_FailoverDurations, p_OriginalModelID => p_MJAIPromptRuns_ConfigurationID_OriginalModelID, p_OriginalRequestStartTime => p_MJAIPromptRuns_ConfigurationID_OriginalRequestStartTime, p_TotalFailoverDuration => p_MJAIPromptRuns_ConfigurationID_TotalFailoverDuration, p_RerunFromPromptRunID => p_MJAIPromptRuns_ConfigurationID_RerunFromPromptRunID, p_ModelSelection => p_MJAIPromptRuns_ConfigurationID_ModelSelection, p_Status => p_MJAIPromptRuns_ConfigurationID_Status, p_Cancelled => p_MJAIPromptRuns_ConfigurationID_Cancelled, p_CancellationReason => p_MJAIPromptRuns_ConfigurationID_CancellationReason, p_ModelPowerRank => p_MJAIPromptRuns_ConfigurationID_ModelPowerRank, p_SelectionStrategy => p_MJAIPromptRuns_ConfigurationID_SelectionStrategy, p_CacheHit => p_MJAIPromptRuns_ConfigurationID_CacheHit, p_CacheKey => p_MJAIPromptRuns_ConfigurationID_CacheKey, p_JudgeID => p_MJAIPromptRuns_ConfigurationID_JudgeID, p_JudgeScore => p_MJAIPromptRuns_ConfigurationID_JudgeScore, p_WasSelectedResult => p_MJAIPromptRuns_ConfigurationID_WasSelectedResult, p_StreamingEnabled => p_MJAIPromptRuns_ConfigurationID_StreamingEnabled, p_FirstTokenTime => p_MJAIPromptRuns_ConfigurationID_FirstTokenTime, p_ErrorDetails => p_MJAIPromptRuns_ConfigurationID_ErrorDetails, p_ChildPromptID => p_MJAIPromptRuns_ConfigurationID_ChildPromptID, p_QueueTime => p_MJAIPromptRuns_ConfigurationID_QueueTime, p_PromptTime => p_MJAIPromptRuns_ConfigurationID_PromptTime, p_CompletionTime => p_MJAIPromptRuns_ConfigurationID_CompletionTime, p_ModelSpecificResponseDetails => p_MJAIPromptRuns_ConfigurationID_ModelSpecificResponseDetails, p_EffortLevel => p_MJAIPromptRuns_ConfigurationID_EffortLevel, p_RunName => p_MJAIPromptRuns_ConfigurationID_RunName, p_Comments => p_MJAIPromptRuns_ConfigurationID_Comments, p_TestRunID => p_MJAIPromptRuns_ConfigurationID_TestRunID, p_AssistantPrefill => p_MJAIPromptRuns_ConfigurationID_AssistantPrefill, p_TokensCacheRead => p_MJAIPromptRuns_ConfigurationID_TokensCacheRead, p_TokensCacheWrite => p_MJAIPromptRuns_ConfigurationID_TokensCacheWrite, p_TokensCacheReadRollup => p_MJAIPromptRuns_ConfigurationID_TokensCacheReadRollup, p_TokensCacheWriteRollup => p_MJAIPromptRuns_ConfigurationID_TokensCacheWriteRollup);

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

    
    -- Cascade update on ScopedPromptConfig using cursor to call spUpdateScopedPromptConfig


    FOR _rec IN SELECT "ID", "PromptID", "Description", "PrimaryScopeEntityID", "PrimaryScopeRecordID", "SecondaryScopes", "Status", "Priority", "ModelID", "VendorID", "ConfigurationID", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "EffortLevel" FROM __mj."ScopedPromptConfig" WHERE "ConfigurationID" = p_ID
    LOOP
        p_MJScopedPromptConfigs_ConfigurationIDID := _rec."ID";
        p_MJScopedPromptConfigs_ConfigurationID_PromptID := _rec."PromptID";
        p_MJScopedPromptConfigs_ConfigurationID_Description := _rec."Description";
        p_MJScopedPromptConfigs_ConfigurationID_PrimaryScopeEntityID := _rec."PrimaryScopeEntityID";
        p_MJScopedPromptConfigs_ConfigurationID_PrimaryScopeRecordID := _rec."PrimaryScopeRecordID";
        p_MJScopedPromptConfigs_ConfigurationID_SecondaryScopes := _rec."SecondaryScopes";
        p_MJScopedPromptConfigs_ConfigurationID_Status := _rec."Status";
        p_MJScopedPromptConfigs_ConfigurationID_Priority := _rec."Priority";
        p_MJScopedPromptConfigs_ConfigurationID_ModelID := _rec."ModelID";
        p_MJScopedPromptConfigs_ConfigurationID_VendorID := _rec."VendorID";
        p_MJScopedPromptConfigs_ConfigurationID_ConfigurationID := _rec."ConfigurationID";
        p_MJScopedPromptConfigs_ConfigurationID_Temperature := _rec."Temperature";
        p_MJScopedPromptConfigs_ConfigurationID_TopP := _rec."TopP";
        p_MJScopedPromptConfigs_ConfigurationID_TopK := _rec."TopK";
        p_MJScopedPromptConfigs_ConfigurationID_MinP := _rec."MinP";
        p_MJScopedPromptConfigs_ConfigurationID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJScopedPromptConfigs_ConfigurationID_PresencePenalty := _rec."PresencePenalty";
        p_MJScopedPromptConfigs_ConfigurationID_Seed := _rec."Seed";
        p_MJScopedPromptConfigs_ConfigurationID_StopSequences := _rec."StopSequences";
        p_MJScopedPromptConfigs_ConfigurationID_ResponseFormat := _rec."ResponseFormat";
        p_MJScopedPromptConfigs_ConfigurationID_EffortLevel := _rec."EffortLevel";
        -- Set the FK field to NULL
        p_MJScopedPromptConfigs_ConfigurationID_ConfigurationID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateScopedPromptConfig"(p_ID => p_MJScopedPromptConfigs_ConfigurationIDID, p_PromptID => p_MJScopedPromptConfigs_ConfigurationID_PromptID, p_Description => p_MJScopedPromptConfigs_ConfigurationID_Description, p_PrimaryScopeEntityID => p_MJScopedPromptConfigs_ConfigurationID_PrimaryScopeEntityID, p_PrimaryScopeRecordID => p_MJScopedPromptConfigs_ConfigurationID_PrimaryScopeRecordID, p_SecondaryScopes => p_MJScopedPromptConfigs_ConfigurationID_SecondaryScopes, p_Status => p_MJScopedPromptConfigs_ConfigurationID_Status, p_Priority => p_MJScopedPromptConfigs_ConfigurationID_Priority, p_ModelID => p_MJScopedPromptConfigs_ConfigurationID_ModelID, p_VendorID => p_MJScopedPromptConfigs_ConfigurationID_VendorID, p_ConfigurationID_Clear => 1, p_ConfigurationID => p_MJScopedPromptConfigs_ConfigurationID_ConfigurationID, p_Temperature => p_MJScopedPromptConfigs_ConfigurationID_Temperature, p_TopP => p_MJScopedPromptConfigs_ConfigurationID_TopP, p_TopK => p_MJScopedPromptConfigs_ConfigurationID_TopK, p_MinP => p_MJScopedPromptConfigs_ConfigurationID_MinP, p_FrequencyPenalty => p_MJScopedPromptConfigs_ConfigurationID_FrequencyPenalty, p_PresencePenalty => p_MJScopedPromptConfigs_ConfigurationID_PresencePenalty, p_Seed => p_MJScopedPromptConfigs_ConfigurationID_Seed, p_StopSequences => p_MJScopedPromptConfigs_ConfigurationID_StopSequences, p_ResponseFormat => p_MJScopedPromptConfigs_ConfigurationID_ResponseFormat, p_EffortLevel => p_MJScopedPromptConfigs_ConfigurationID_EffortLevel);

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


-- ===================== Triggers =====================

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

CREATE OR REPLACE FUNCTION __mj."trgUpdateScheduledJob_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateScheduledJob" ON __mj."ScheduledJob";
CREATE TRIGGER "trgUpdateScheduledJob"
    BEFORE UPDATE ON __mj."ScheduledJob"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateScheduledJob_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd8d441da-e73d-4f52-abfa-5411e4dbf579' OR ("EntityID" = '5190AF93-4C39-4429-BDAA-0AEB492A0256' AND "Name" = 'ContinuationDepth')
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
        'd8d441da-e73d-4f52-abfa-5411e4dbf579',
        '5190AF93-4C39-4429-BDAA-0AEB492A0256', -- "Entity": "MJ": "AI" "Agent" "Runs"
        100120,
        'ContinuationDepth',
        'Continuation Depth',
        'How many task-graph continuations led to this run. 0 (the default, and the value every ordinary run carries) means the run was not started by a finished graph. A run started because a graph declared continuation=''reinvoke'' records its source graph''s depth plus one, and any graph that run subsequently submits inherits that value — which is what allows MAX_REINVOKE_DEPTH to bound a chain of graph-reinvokes-agent-emits-graph. Without a durable value here the cap could never fire, because a reinvoked agent has no other way to learn it was a continuation. Distinct from ParentRunID, which tracks sub-agent lineage within a single turn; a continuation is a NEW top-level turn caused by work that already completed.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'dc35cc46-ccd7-4f61-a54b-4d28c4b5b27a' OR ("EntityID" = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND "Name" = 'MissedRunPolicy')
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
        'dc35cc46-ccd7-4f61-a54b-4d28c4b5b27a',
        'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- "Entity": "MJ": "Scheduled" "Jobs"
        100065,
        'MissedRunPolicy',
        'Missed Run Policy',
        'What this job does about fire times that passed while the scheduler was not running (a deploy, a crash, a sleeping machine). RunOnce (the default) performs a single catch-up run and then resumes the normal schedule — correct for digests, syncs and anything where only the latest state matters, and identical to the behavior every job had before this column existed. RunAll replays each missed occurrence, one per poll tick so a long outage drains gradually rather than dispatching at once — correct for per-period work such as billing or metric snapshots, where skipping a period loses data nothing else recreates. Skip performs no catch-up at all and simply advances to the next future occurrence — correct for work whose value expires, such as a cache warm. A run is only treated as missed when a LATER occurrence has also come due, so a job that merely became due seconds ago is never misclassified; this is evaluated cron-relatively rather than against a fixed grace window, which would misjudge both a per-minute job after a short pause and a monthly job that is a week late.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'RunOnce',
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
                                       ('05b27e61-c3c3-4b59-85d7-64b156b05fb3', 'DC35CC46-CCD7-4F61-A54B-4D28C4B5B27A', 1, 'RunAll', 'RunAll', NOW(), NOW());

/* SQL text to insert entity field value with ID 9808473c-fdec-4e77-9a9c-d409c0e53e4a */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('9808473c-fdec-4e77-9a9c-d409c0e53e4a', 'DC35CC46-CCD7-4F61-A54B-4D28C4B5B27A', 2, 'RunOnce', 'RunOnce', NOW(), NOW());

/* SQL text to insert entity field value with ID 899464de-6788-4e6d-be75-8d56fc7a361a */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('899464de-6788-4e6d-be75-8d56fc7a361a', 'DC35CC46-CCD7-4F61-A54B-4D28C4B5B27A', 3, 'Skip', 'Skip', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID DC35CC46-CCD7-4F61-A54B-4D28C4B5B27A */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='DC35CC46-CCD7-4F61-A54B-4D28C4B5B27A';

/* Index for Foreign Keys for AIAgentRun */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Agent Runs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key AgentID in table AIAgentRun

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '4B118964-92D4-49DE-8C3E-FB5736ED5397'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 34 fields */

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.ID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5FF3A193-496F-4A52-BFC4-C34A72B47170' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '68AE196C-1CBD-44B9-A24D-C9F69CF1215D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0A7ACD60-27E1-46F5-B162-00E87EE996E3' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.JobTypeID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Job Type ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C30FF21A-65A1-4EF3-8978-430CE036C280' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.Name

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4B118964-92D4-49DE-8C3E-FB5736ED5397' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.Description

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3B91E50A-C0EB-47B7-89F5-B896933309EA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.Configuration

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'AC6D67F0-D805-4E42-9C4A-34E136107B46' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.ConcurrencyMode

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BB4BFDA6-0001-43D3-9F48-E9BDB1AC0331' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.JobType

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Job Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7CED4F5B-2A51-4D30-968A-7CB0C302F5BE' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.CronExpression

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9FEFB2A6-873F-4788-9F53-225BAEDF7333' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.Timezone

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E57EF025-B07C-4D17-8602-6120A345ADDF' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.StartAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0F3B6855-16D4-486B-A589-698650BFFF96' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.EndAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B2917C35-8B6B-4C02-A42A-6CA26D70125F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.LastRunAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E4F4B083-A687-43EB-B9E4-2B41273D82D7' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.NextRunAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B44E0249-46E7-4C54-A0A5-A6A8E79FB4CD' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.ExpectedCompletionAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4CEF1A8F-EDC1-4551-B3B8-2B8A6DA3DEAA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.RunImmediatelyIfNeverRun

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C3233A2E-EEE3-4F43-8F80-587DD45E6820' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.MaxRuntimeMinutes

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Max Runtime Minutes',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '42C29C95-91A7-4448-A067-B754909A52AB' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.MissedRunPolicy

UPDATE __mj."EntityField"
SET 
   "Category" = 'Schedule & Timing',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DC35CC46-CCD7-4F61-A54B-4D28C4B5B27A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.Status

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D34A3E50-E7A0-4241-8A1C-6FD61E3F7EE7' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.RunCount

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CC28664E-CF7B-4791-B4BE-D96CBD4E4549' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.SuccessCount

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A0B299B6-FEA3-4D84-A56E-0A5369B288D2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.FailureCount

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '53667E7F-001E-4977-B588-3619D9A982C6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.OwnerUserID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Owner User ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E4DCCF26-14B1-4033-818D-180AF7C04097' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyOnSuccess

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AB6D25BB-B06B-454D-8216-8D8416A856D6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyOnFailure

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D089DC8A-E08C-4295-B5EA-4C96DDDEB8D1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyUserID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Notify User ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1FFB0397-C54B-4A7D-9394-CFF8A392502A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyViaEmail

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4C6D0B08-D852-444F-9394-C5387C91139F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyViaInApp

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '03768220-F023-4E46-87E2-5738AAC55985' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.OwnerUser

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Owner User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C8AC395C-04D8-4E85-881B-D4F5A70B759D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.NotifyUser

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Notify User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0EA25537-7EFD-4FB3-83DD-2E876202D09D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.LockToken

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '105CEAB7-9967-4956-B143-CBC983632481' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.LockedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4D1F66E6-E7DD-4463-BD85-6A34DADFD096' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs.LockedByInstance

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '12ED9986-1339-4F4C-88DC-B8B479950062' AND "AutoUpdateCategory" = TRUE;

/* Set categories for 67 fields */

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0CDCEFDE-FBFE-44CD-ACAF-A1543F309EC4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.AgentID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4B5B91C2-2D8D-441D-9281-19089EF7B21E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ParentRunID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8BE780BC-757D-4AC0-9ECC-5C9FFBAA38FD' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Status

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E1F5A7A4-9248-4C45-9D74-04E7B44A1DD5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.StartedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '025D0895-4A17-4168-8B38-9B9C6D68CFD8' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.CompletedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '80FAFCF2-539E-4A38-86CD-9E9395C8664F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Success

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B3C8FBEA-CA05-462D-94E5-7B4875446A79' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ErrorMessage

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '057C84E7-BAD3-405A-B2B9-5D13551EFCD4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ConversationID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4FF245A3-C823-49F8-B20A-31A64D0E6E77' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.UserID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '625FE9E6-9058-4FDD-8970-4595336C60D3' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Result

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '974746E9-53D2-484B-AFF3-9B7D9292D6B7' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.AgentState

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6FF56877-27AE-47D9-A6CD-641088C2458E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalTokensUsed

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Total Tokens Used',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A7C0AFAA-E27C-41DA-8FAA-0B48E276089D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCost

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '34F910FE-C31E-42FE-9A9E-08407AF79BDB' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '13198D22-60EB-4694-B420-7BDB4E3E9BB8' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B025CDE5-5300-46DA-BC49-7130D0689E81' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalPromptTokensUsed

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '69B7EB99-3409-4B84-B979-877E992964DC' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCompletionTokensUsed

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4BE28D8A-2E06-460D-BDD7-34E5BEB5DBB0' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalTokensUsedRollup

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A60033A0-D13C-4954-8EF3-6BB8A5618126' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalPromptTokensUsedRollup

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FCD5864B-65BB-4E9F-A3FE-2C09D3461364' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCompletionTokensUsedRollup

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B1401167-0C3B-4D14-9633-6A3A1DC429A9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCostRollup

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F9928463-5F2B-46C0-8DA3-6EEF2FA816EF' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ConversationDetailID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8505597E-558F-4222-ABF7-5BA4E163A97D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ConversationDetailSequence

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Detail Sequence',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D4896B2F-D530-4844-8C96-A0016F0A81D4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.CancellationReason

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '14A76D05-D24C-4EE0-B24E-B840DD330F60' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.FinalStep

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A04BEDCF-F261-4734-A1A6-91A1AEFEE5ED' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.FinalPayload

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6FFF2754-A03E-4DFD-AC17-FB16CDAD5346' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Message

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0B55CD7D-06C3-485C-9FC0-CF4C33D66DF5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.LastRunID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '44D62D04-D013-4C3B-A535-555E3AA388BB' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.StartingPayload

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B106357D-347F-45BE-89AA-B96298ED1DDA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalPromptIterations

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Prompt Iterations',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7411D673-9C57-4419-96BA-1C607B77DA43' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ConfigurationID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '038B0DB2-EB71-4E8D-945E-EBA1AA570391' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.OverrideModelID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Override Model',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E95FDE6B-12E3-4A41-AA15-9EAD7695B266' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.OverrideVendorID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Override Vendor',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F8747D24-8E7D-4D12-BCF8-8CD9F7749566' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Data

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Execution Data',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '08037344-3952-4EBE-BA34-F87BD670C61A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Verbose

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '07CD2EF5-1737-4662-BE76-301A3E88BD9D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.EffortLevel

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B16B5B36-7238-4A90-ABAD-DA64ED8FADCA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.RunName

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '51A944B0-A282-4ED0-9D4E-1EE41498065A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Comments

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6962DE96-798F-4E1C-AE87-489429927C4C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ScheduledJobRunID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '77918E52-6BA1-4FA6-9AE1-F5987906D0C8' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TestRunID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7685B81B-FD95-40F8-A3D6-4EB710DB054D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.PrimaryScopeEntityID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Primary Scope Entity',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B0F924E4-A919-4AE5-A0E6-F5D4847926D6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.PrimaryScopeRecordID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Primary Scope Record',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C6602391-0B0C-4ECB-8A16-3A8B019B5C3D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.SecondaryScopes

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '21FC62F2-F9CC-40C4-A1BA-462699CCD289' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ExternalReferenceID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'External Reference',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '40EA5AB0-58A3-4CCE-B7E1-C9BB56E7D5A4' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.CompanyID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '766B0728-BB2E-4827-B23A-7A4CA04FB7F6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCacheReadTokensUsed

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CAEE3E16-509E-4F64-A4FD-6B5428D325BE' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TotalCacheWriteTokensUsed

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3B815F5A-2C13-4FE8-9C8F-ED4A1022883B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.LastHeartbeatAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AE864635-13FE-474C-BCD9-2238A8CDD682' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.AgentSessionID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7E320744-89D1-4315-88DE-29A8F59FD61F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.PlanMode

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '861FE881-C9FA-497F-A092-C7B8C7C4F81F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ExternalSessionID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'External Session',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A86FFA34-D554-498A-B2A0-E8973BD86D75' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ContinuationDepth

UPDATE __mj."EntityField"
SET 
   "Category" = 'Execution Details & Outcome',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D8D441DA-E73D-4F52-ABFA-5411E4DBF579' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Agent

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Agent Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '38A3F73F-9364-428E-A195-5DF74B9F9ACB' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ParentRun

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Parent Run Info',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D94F2321-5DCA-4B11-8E17-57DC851BFDC5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Conversation

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Conversation Info',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8FAF86E8-F74E-4D76-972A-197FBB245478' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.User

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User Info',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9FEAEC67-96DB-4551-9954-AC631C8ADF0A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ConversationDetail

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Conversation Detail Info',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '66AAF27B-995D-4F5F-8149-BE6E35C7694C' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.LastRun

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Last Run Info',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2996B20E-9DFD-41C8-A810-B0EC3038622B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.Configuration

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Configuration Info',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2F32D57F-954A-4DDD-BE50-A52E7E9FA1FF' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.OverrideModel

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Override Model Info',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F27EECF4-14ED-4338-9ABE-3E472415CE2B' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.OverrideVendor

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Override Vendor Info',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9E8614CB-65CB-4C28-9D0B-198CBA49CBBF' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.ScheduledJobRun

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Scheduled Job Run Info',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3C30AB32-15A4-460D-9955-DD89EDEF5F62' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.TestRun

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Test Run Info',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '34DF8E45-2C56-4E9D-AC4C-2FD4C4EEE196' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.PrimaryScopeEntity

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Primary Scope Entity Info',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'ECFA16C9-1005-4B07-90CB-690623428037' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.RootParentRunID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A860DAE5-5AA8-4EBE-9C5F-914AFDD0E3C6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: AI Agent Runs.RootLastRunID

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D3B3BBE7-627B-4A67-BFC3-81C2F248B9ED' AND "AutoUpdateCategory" = TRUE;

/* Generated Validation Functions for MJ: AI Agent Runs */
-- CHECK constraint for MJ: AI Agent Runs: Field: ContinuationDepth was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function

INSERT INTO __mj."GeneratedCode" ("CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
                      VALUES ((SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), 'C43229F6-4CC8-4838-9D04-03419A2DA191', NOW(), 'TypeScript', 'Approved', '("ContinuationDepth">=(0))', 'public ValidateContinuationDepthGreaterThanOrEqualToZero(result: ValidationResult) {
	if (this.ContinuationDepth != null && this.ContinuationDepth < 0) {
		result.Errors.push(new ValidationErrorInfo(
			"ContinuationDepth",
			"Continuation depth must be greater than or equal to 0.",
			this.ContinuationDepth,
			ValidationErrorType.Failure
		));
	}
}', 'The continuation depth must be a non-negative number (0 or greater) to ensure valid execution tracking.', 'ValidateContinuationDepthGreaterThanOrEqualToZero', 'DF238F34-2837-EF11-86D4-6045BDEE16E6', 'D8D441DA-E73D-4F52-ABFA-5411E4DBF579');


-- ===================== FK & CHECK Constraints =====================


-- Flush any pending deferred trigger events from prior DML so DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;

ALTER TABLE __mj."ScheduledJob"
 ADD CONSTRAINT "CK_ScheduledJob_MissedRunPolicy"
        CHECK ("MissedRunPolicy" IN ('Skip', 'RunOnce', 'RunAll')) NOT VALID;

ALTER TABLE __mj."AIAgentRun"
 ADD CONSTRAINT "CK_AIAgentRun_ContinuationDepth"
        CHECK ("ContinuationDepth" >= 0) NOT VALID;


-- ===================== Grants =====================

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
/* Index for Foreign Keys for ScheduledJob */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key JobTypeID in table ScheduledJob;

DO $$ BEGIN GRANT SELECT ON __mj."vwScheduledJobs" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Scheduled Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: Permissions for vwScheduledJobs
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwScheduledJobs" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Scheduled Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: spCreateScheduledJob
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ScheduledJob
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateScheduledJob" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Scheduled Jobs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateScheduledJob" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Scheduled Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: spUpdateScheduledJob
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ScheduledJob
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateScheduledJob" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateScheduledJob" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Scheduled Jobs */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Scheduled Jobs
-- Item: spDeleteScheduledJob
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ScheduledJob
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteScheduledJob" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Scheduled Jobs */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteScheduledJob" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."ScheduledJob"."MissedRunPolicy" IS 'What this job does about fire times that passed while the scheduler was not running (a deploy, a crash, a sleeping machine). RunOnce (the default) performs a single catch-up run and then resumes the normal schedule — correct for digests, syncs and anything where only the latest state matters, and identical to the behavior every job had before this column existed. RunAll replays each missed occurrence, one per poll tick so a long outage drains gradually rather than dispatching at once — correct for per-period work such as billing or metric snapshots, where skipping a period loses data nothing else recreates. Skip performs no catch-up at all and simply advances to the next future occurrence — correct for work whose value expires, such as a cache warm. A run is only treated as missed when a LATER occurrence has also come due, so a job that merely became due seconds ago is never misclassified; this is evaluated cron-relatively rather than against a fixed grace window, which would misjudge both a per-minute job after a short pause and a monthly job that is a week late.';

COMMENT ON COLUMN __mj."AIAgentRun"."ContinuationDepth" IS 'How many task-graph continuations led to this run. 0 (the default, and the value every ordinary run carries) means the run was not started by a finished graph. A run started because a graph declared continuation=''reinvoke'' records its source graph''s depth plus one, and any graph that run subsequently submits inherits that value — which is what allows MAX_REINVOKE_DEPTH to bound a chain of graph-reinvokes-agent-emits-graph. Without a durable value here the cap could never fire, because a reinvoked agent has no other way to learn it was a continuation. Distinct from ParentRunID, which tracks sub-agent lineage within a single turn; a continuation is a NEW top-level turn caused by work that already completed.';


-- ===================== Other =====================

-- CodeGen Run 
/* SQL text to insert 2 new entity field(s) */

/* spUpdate Permissions for MJ: AI Agent Runs */

/* spUpdate Permissions for MJ: Scheduled Jobs */
