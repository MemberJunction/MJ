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

-- =====================================================
-- v5.41.x — Scheduling engine heartbeat-based lease renewal (GH #2749)
-- =====================================================
-- Follow-up to the poll-loop decoupling work (GH #2736,
-- plans/scheduled-job-engine-decoupling.md). Replaces the fixed-duration
-- lease's residual starvation window with plugin-driven LIVENESS: a running
-- job periodically heartbeats to push ExpectedCompletionAt forward, and a job
-- that STOPS beating becomes reclaimable by the existing sweep shortly after
-- its last beat — independent of absolute clock time.
--
-- Full rationale: plans/scheduled-job-engine-heartbeat-lease.md.
--
-- This migration adds:
--   1. ScheduledJob."MaxRuntimeMinutes" — optional per-job acquire-time lease
--      override (only ever EXTENDS the default lease, never shrinks it). For
--      jobs whose single long-running call cannot heartbeat mid-flight.
--   2. spExtendScheduledJobLease — the atomic heartbeat sproc. Mirrors the
--      token-checked WHERE of spReleaseScheduledJobLockIfTokenMatches so a
--      stale/reclaimed holder cannot renew a FRESH holder's lock (lost-mutex
--      protection). Engine-internal lock sproc → lives in a migration, not
--      CodeGen (same convention as V202606022336 atomic sprocs).
--
-- The sweep itself needs NO changes: its filter already reclaims any inflight
-- job whose ExpectedCompletionAt < now. Heartbeating simply keeps a healthy
-- job's ExpectedCompletionAt ahead of now.
-- =====================================================

ALTER TABLE __mj."ScheduledJob"
 ADD COLUMN IF NOT EXISTS "MaxRuntimeMinutes" INTEGER NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ScheduledJob_JobTypeID" ON __mj."ScheduledJob" ("JobTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ScheduledJob_OwnerUserID" ON __mj."ScheduledJob" ("OwnerUserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ScheduledJob_NotifyUserID" ON __mj."ScheduledJob" ("NotifyUserID");


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
           WHERE proname = 'spExtendScheduledJobLease'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spExtendScheduledJobLease"(
    IN p_JobID UUID,
    IN p_ExpectedToken UUID,
    IN p_NewExpectedCompletionAt TIMESTAMPTZ
)
RETURNS TABLE("Extended" INTEGER) AS
$$
DECLARE
    _v_row_count INTEGER;
    p_RowsAffected INTEGER;
BEGIN
UPDATE __mj."ScheduledJob"
       SET ExpectedCompletionAt = p_NewExpectedCompletionAt
     WHERE ID = p_JobID
       AND LockToken = p_ExpectedToken;

    p_RowsAffected := _v_row_count;
    RETURN QUERY SELECT p_RowsAffected AS Extended;
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
    IN p_MaxRuntimeMinutes INTEGER DEFAULT NULL
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
                "MaxRuntimeMinutes"
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
                CASE WHEN p_MaxRuntimeMinutes_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxRuntimeMinutes, NULL) END
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
                "MaxRuntimeMinutes"
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
                CASE WHEN p_MaxRuntimeMinutes_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxRuntimeMinutes, NULL) END
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
    IN p_MaxRuntimeMinutes INTEGER DEFAULT NULL
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
        "MaxRuntimeMinutes" = CASE WHEN p_MaxRuntimeMinutes_Clear = TRUE THEN NULL ELSE COALESCE(p_MaxRuntimeMinutes, "MaxRuntimeMinutes") END
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


-- ===================== Triggers =====================

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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '42c29c95-91a7-4448-a067-b754909a52ab' OR ("EntityID" = 'F48D2E6C-61C8-46B8-A617-C8228601EB3C' AND "Name" = 'MaxRuntimeMinutes')
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
        '42c29c95-91a7-4448-a067-b754909a52ab',
        'F48D2E6C-61C8-46B8-A617-C8228601EB3C', -- "Entity": "MJ": "Scheduled" "Jobs"
        100063,
        'MaxRuntimeMinutes',
        'Max Runtime Minutes',
        'Optional per-job override for the acquire-time lock lease length, in minutes. When set and positive, the engine uses max(default lease, MaxRuntimeMinutes) as the initial ExpectedCompletionAt — so it only ever EXTENDS the default lease, never shrinks it. Intended for jobs whose work is a single long-running call that cannot heartbeat mid-flight (e.g. one slow synchronous action). Jobs that heartbeat via the plugin opt-in pattern do not need this. NULL = use the engine default lease (LeaseTimeoutMinutes). See plans/scheduled-job-engine-heartbeat-lease.md (GH #2749).',
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

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."JobTypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Job Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C30FF21A-65A1-4EF3-8978-430CE036C280' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4B118964-92D4-49DE-8C3E-FB5736ED5397' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3B91E50A-C0EB-47B7-89F5-B896933309EA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."Configuration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'AC6D67F0-D805-4E42-9C4A-34E136107B46' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."ConcurrencyMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BB4BFDA6-0001-43D3-9F48-E9BDB1AC0331' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."JobType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Job Type Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7CED4F5B-2A51-4D30-968A-7CB0C302F5BE' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."CronExpression"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9FEFB2A6-873F-4788-9F53-225BAEDF7333' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."Timezone"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E57EF025-B07C-4D17-8602-6120A345ADDF' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."StartAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0F3B6855-16D4-486B-A589-698650BFFF96' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."EndAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B2917C35-8B6B-4C02-A42A-6CA26D70125F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."LastRunAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E4F4B083-A687-43EB-B9E4-2B41273D82D7' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."NextRunAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B44E0249-46E7-4C54-A0A5-A6A8E79FB4CD' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."ExpectedCompletionAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4CEF1A8F-EDC1-4551-B3B8-2B8A6DA3DEAA' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."RunImmediatelyIfNeverRun"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C3233A2E-EEE3-4F43-8F80-587DD45E6820' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."MaxRuntimeMinutes"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Schedule & Timing',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Max Runtime (Minutes)',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '42C29C95-91A7-4448-A067-B754909A52AB' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D34A3E50-E7A0-4241-8A1C-6FD61E3F7EE7' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."RunCount"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CC28664E-CF7B-4791-B4BE-D96CBD4E4549' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."SuccessCount"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A0B299B6-FEA3-4D84-A56E-0A5369B288D2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."FailureCount"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '53667E7F-001E-4977-B588-3619D9A982C6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."OwnerUserID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Owner',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E4DCCF26-14B1-4033-818D-180AF7C04097' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."NotifyOnSuccess"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AB6D25BB-B06B-454D-8216-8D8416A856D6' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."NotifyOnFailure"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D089DC8A-E08C-4295-B5EA-4C96DDDEB8D1' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."NotifyUserID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Notify User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1FFB0397-C54B-4A7D-9394-CFF8A392502A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."NotifyViaEmail"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4C6D0B08-D852-444F-9394-C5387C91139F' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."NotifyViaInApp"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '03768220-F023-4E46-87E2-5738AAC55985' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."OwnerUser"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Owner User Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C8AC395C-04D8-4E85-881B-D4F5A70B759D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."NotifyUser"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Notify User Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0EA25537-7EFD-4FB3-83DD-2E876202D09D' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."LockToken"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '105CEAB7-9967-4956-B143-CBC983632481' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."LockedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4D1F66E6-E7DD-4463-BD85-6A34DADFD096' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."LockedByInstance"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '12ED9986-1339-4F4C-88DC-B8B479950062' AND "AutoUpdateCategory" = TRUE;


-- ===================== Grants =====================

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spExtendScheduledJobLease" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spExtendScheduledJobLease" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
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
/* Root ID Function SQL for MJ: Tasks."ParentID" */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Tasks
-- Item: fnTaskParentID_GetRootID
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
------------------------------------------------------------
----- ROOT ID FUNCTION FOR: [Task].[ParentID]
------------------------------------------------------------;


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."ScheduledJob"."MaxRuntimeMinutes" IS 'Optional per-job override for the acquire-time lock lease length, in minutes. When set and positive, the engine uses max(default lease, MaxRuntimeMinutes) as the initial ExpectedCompletionAt — so it only ever EXTENDS the default lease, never shrinks it. Intended for jobs whose work is a single long-running call that cannot heartbeat mid-flight (e.g. one slow synchronous action). Jobs that heartbeat via the plugin opt-in pattern do not need this. NULL = use the engine default lease (LeaseTimeoutMinutes). See plans/scheduled-job-engine-heartbeat-lease.md (GH #2749).';

-- COMMENT ON FUNCTION __mj."spExtendScheduledJobLease" (procedure-level comment skipped)


-- ===================== Other =====================

/* ============================================================================
   CodeGen output (scoped to MJ: Scheduled Jobs)
   ----------------------------------------------------------------------------
   Generated by CodeGen for the MaxRuntimeMinutes field. The full CodeGen run
   also re-emitted views/sprocs for entities in ScheduledJob's relationship
   graph (AI Agent Runs etc. via the ScheduledJobRunID FK lookup), but those
   regenerated byte-for-byte identical to the current DB — no actual change —
   so only the MaxRuntimeMinutes EntityField, vwScheduledJobs, the ScheduledJob
   CRUD sprocs, the FK index, and the ScheduledJob field-category updates are
   retained here.
   ============================================================================ */

/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: Scheduled Jobs */

/* Set categories for 33 fields */

-- UPDATE Entity Field Category Info MJ: Scheduled Jobs."ID"
