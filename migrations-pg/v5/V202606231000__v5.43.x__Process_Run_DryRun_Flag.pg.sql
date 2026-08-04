-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606231000__v5.43.x__Process_Run_DryRun_Flag.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."ProcessRun"
ADD COLUMN "DryRun" BOOLEAN NOT NULL DEFAULT FALSE /* Record Processes: mark a Process Run as a dry-run (compute-only preview). */ /* Until now a dry-run and a real apply produced an identical ProcessRun header (Status='Completed'), */ /* so run history could not tell them apart — the dry-run nature only survived per-record inside each */ /* Process Run Detail's ResultPayload JSON. This adds a first-class DryRun flag on the run header so the */ /* UI can badge (and optionally filter) dry-run previews. */;

COMMENT ON COLUMN __mj."ProcessRun"."DryRun" IS 'When 1, this run was a dry-run (compute-only) preview: the per-record diffs were computed and persisted as Process Run Details, but no changes were written back to the target records. When 0, the run applied its changes.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'fe13eba2-5697-4d80-bdc3-3f9647734891' OR ("EntityID" = '9989A9A4-5546-4552-A765-B27EE399BFEA' AND "Name" = 'DryRun')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('fe13eba2-5697-4d80-bdc3-3f9647734891', '9989A9A4-5546-4552-A765-B27EE399BFEA' /* Entity: MJ: Process Runs */, 100056, 'DryRun', 'Dry Run', 'When 1, this run was a dry-run (compute-only) preview: the per-record diffs were computed and persisted as Process Run Details, but no changes were written back to the target records. When 0, the run applied its changes.', 'bit', 1, 1, 0, FALSE, '(0)', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* Set categories for 30 fields */ /* UPDATE Entity Field Category Info MJ: Process Runs.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'A9FFCA8A-1099-4F8F-A325-CD624B51BB66' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '177CAE5F-FC07-45CF-B350-DCBBCD8AD401' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '63F725A3-D543-4CE7-B874-C3E5A36ABA95' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.RecordProcessID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1ECA5E38-BEBC-43A8-B33B-9F5CFBD0FB3E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.EntityID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '9170B1E1-FF8B-4EAC-8226-E2D15B1A76E2' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.ScheduledJobRunID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'DC7D5571-B22C-4FD6-A36D-790B190ADBBC' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.StartedByUserID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6241C397-A80E-49BC-8612-ED10E14DC1C9' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.RecordProcess */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4916C4A0-ECB1-4738-8141-E8DA4E6C651D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.Entity */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6267A92F-1921-46C0-963B-AE041390C4BD' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.ScheduledJobRun */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '998E51F3-F9A5-4981-92FD-05B87AABD197' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.StartedByUser */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '94624B23-BB5A-4B7C-9F62-234AAB9C246E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.TriggeredBy */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'B670820C-79D7-498F-8D38-0AD9D03C3A28' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.SourceType */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FF84A6E8-620E-4AB1-844D-90D5F8A6BE40' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.SourceID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'BEC4BA25-2CBA-4808-AA71-4DA546A95F0C' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.SourceFilter */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'E849E10D-69BB-48B7-B504-F931D4C6D302' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.DryRun */
UPDATE __mj."EntityField" SET "Category" = 'Execution Details', "GeneratedFormSection" = 'Category', "DisplayName" = 'Is Dry Run', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'FE13EBA2-5697-4D80-BDC3-3F9647734891' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.Status */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '11E29273-D8A3-4F91-9064-1BB488F36D74' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.StartTime */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C78EB8B6-294C-4B33-8956-3825DA34A4CF' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.EndTime */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7A7C3157-7F98-46B4-A475-125AA7E7F760' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.TotalItemCount */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '2CF14960-A8DE-4C6F-BA3A-4294ACD26512' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.ProcessedItems */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '23E3932F-567F-440F-B2E1-E6E9B61A8BE1' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.SuccessCount */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8F03BD3C-6433-4B40-8DA3-3F4C1261C722' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.ErrorCount */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '57D01D43-E27F-41A8-96EE-0A2E0FA65F8E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.SkippedCount */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '33E09621-2188-486B-8AB0-2228FFEB3334' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.ErrorMessage */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = 'C9877C8C-CCC0-4C18-925F-A4DBB9253928' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.LastProcessedOffset */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '5DC6B4A5-37CB-4A27-AAAC-74418D608358' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.LastProcessedKey */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '83849077-7BCB-4551-BF0F-F616950C1631' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.BatchSize */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '452E04A8-ADEF-4B51-A7F4-0734A7C14B0B' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.CancellationRequested */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '4F3E0043-532A-4D58-A4D3-DA02E000512E' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Process Runs.Configuration */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "DisplayName" = 'Configuration JSON', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '7E55C4BA-7F21-44D7-99A3-C32567525104' AND "AutoUpdateCategory" = TRUE;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_record_process_id"
    ON __mj."ProcessRun" ("RecordProcessID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_entity_id"
    ON __mj."ProcessRun" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_scheduled_job_run_id"
    ON __mj."ProcessRun" ("ScheduledJobRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_process_run_started_by_user_id"
    ON __mj."ProcessRun" ("StartedByUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Runs
-- Item: vwProcessRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Process Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  ProcessRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwProcessRuns"
AS
SELECT
    p.*,
    MJRecordProcess_RecordProcessID."Name" AS "RecordProcess",
    MJEntity_EntityID."Name" AS "Entity",
    MJScheduledJobRun_ScheduledJobRunID."ScheduledJob" AS "ScheduledJobRun",
    MJUser_StartedByUserID."Name" AS "StartedByUser"
FROM
    __mj."ProcessRun" AS p
LEFT OUTER JOIN
    __mj."RecordProcess" AS MJRecordProcess_RecordProcessID
  ON
    "p"."RecordProcessID" = MJRecordProcess_RecordProcessID."ID"
LEFT OUTER JOIN
    __mj."Entity" AS MJEntity_EntityID
  ON
    "p"."EntityID" = MJEntity_EntityID."ID"
LEFT OUTER JOIN
    __mj."vwScheduledJobRuns" AS MJScheduledJobRun_ScheduledJobRunID
  ON
    "p"."ScheduledJobRunID" = MJScheduledJobRun_ScheduledJobRunID."ID"
LEFT OUTER JOIN
    __mj."User" AS MJUser_StartedByUserID
  ON
    "p"."StartedByUserID" = MJUser_StartedByUserID."ID"
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
    grants_sql  TEXT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql)
  SELECT DISTINCT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'))
  FROM pg_depend d
  JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
  JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwProcessRuns'
    AND tc.relkind IN ('v', 'm')
    AND dc.oid <> tc.oid;

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
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_proc pp ON pp.oid = d.objid AND d.classid = 'pg_proc'::regclass
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  JOIN pg_class tc ON tc.oid = d.refobjid
  JOIN pg_namespace tn ON tn.oid = tc.relnamespace
  WHERE tn.nspname = '__mj'
    AND tc.relname = 'vwProcessRuns'
    AND tc.relkind IN ('v', 'm')
  UNION
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_depend d
  JOIN pg_type pt ON pt.oid = d.refobjid AND d.refclassid = 'pg_type'::regclass
  JOIN pg_proc pp ON pp.prorettype = pt.oid OR pt.typrelid = pp.oid
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE EXISTS (
      SELECT 1 FROM pg_class tc
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tc.reltype = pt.oid
        AND tn.nspname = '__mj'
        AND tc.relname = 'vwProcessRuns'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwProcessRuns" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps LOOP
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
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON __mj."vwProcessRuns" TO "cdp_UI";
GRANT SELECT ON __mj."vwProcessRuns" TO "cdp_Developer";
GRANT SELECT ON __mj."vwProcessRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Runs
-- Item: spCreateProcessRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ProcessRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateProcessRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateProcessRun"(
    p_id UUID DEFAULT NULL,
    p_recordprocessid_clear boolean DEFAULT false,
    p_recordprocessid UUID DEFAULT NULL,
    p_entityid_clear boolean DEFAULT false,
    p_entityid UUID DEFAULT NULL,
    p_triggeredby varchar(20) DEFAULT NULL,
    p_sourcetype varchar(20) DEFAULT NULL,
    p_sourceid_clear boolean DEFAULT false,
    p_sourceid UUID DEFAULT NULL,
    p_sourcefilter_clear boolean DEFAULT false,
    p_sourcefilter TEXT DEFAULT NULL,
    p_scheduledjobrunid_clear boolean DEFAULT false,
    p_scheduledjobrunid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_starttime_clear boolean DEFAULT false,
    p_starttime TIMESTAMPTZ DEFAULT NULL,
    p_endtime_clear boolean DEFAULT false,
    p_endtime TIMESTAMPTZ DEFAULT NULL,
    p_totalitemcount_clear boolean DEFAULT false,
    p_totalitemcount int DEFAULT NULL,
    p_processeditems int DEFAULT NULL,
    p_successcount int DEFAULT NULL,
    p_errorcount int DEFAULT NULL,
    p_skippedcount int DEFAULT NULL,
    p_lastprocessedoffset_clear boolean DEFAULT false,
    p_lastprocessedoffset int DEFAULT NULL,
    p_lastprocessedkey_clear boolean DEFAULT false,
    p_lastprocessedkey varchar(450) DEFAULT NULL,
    p_batchsize_clear boolean DEFAULT false,
    p_batchsize int DEFAULT NULL,
    p_cancellationrequested BOOLEAN DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_startedbyuserid_clear boolean DEFAULT false,
    p_startedbyuserid UUID DEFAULT NULL,
    p_dryrun BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwProcessRuns" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."ProcessRun"
        (
            "ID",
            "RecordProcessID",
                "EntityID",
                "TriggeredBy",
                "SourceType",
                "SourceID",
                "SourceFilter",
                "ScheduledJobRunID",
                "Status",
                "StartTime",
                "EndTime",
                "TotalItemCount",
                "ProcessedItems",
                "SuccessCount",
                "ErrorCount",
                "SkippedCount",
                "LastProcessedOffset",
                "LastProcessedKey",
                "BatchSize",
                "CancellationRequested",
                "Configuration",
                "ErrorMessage",
                "StartedByUserID",
                "DryRun"
        )
    VALUES
        (
            v_new_id,
            CASE WHEN p_recordprocessid_clear = true THEN NULL ELSE COALESCE(p_recordprocessid, NULL) END,
                CASE WHEN p_entityid_clear = true THEN NULL ELSE COALESCE(p_entityid, NULL) END,
                p_triggeredby,
                p_sourcetype,
                CASE WHEN p_sourceid_clear = true THEN NULL ELSE COALESCE(p_sourceid, NULL) END,
                CASE WHEN p_sourcefilter_clear = true THEN NULL ELSE COALESCE(p_sourcefilter, NULL) END,
                CASE WHEN p_scheduledjobrunid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobrunid, NULL) END,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_starttime_clear = true THEN NULL ELSE COALESCE(p_starttime, NULL) END,
                CASE WHEN p_endtime_clear = true THEN NULL ELSE COALESCE(p_endtime, NULL) END,
                CASE WHEN p_totalitemcount_clear = true THEN NULL ELSE COALESCE(p_totalitemcount, NULL) END,
                COALESCE(p_processeditems, 0),
                COALESCE(p_successcount, 0),
                COALESCE(p_errorcount, 0),
                COALESCE(p_skippedcount, 0),
                CASE WHEN p_lastprocessedoffset_clear = true THEN NULL ELSE COALESCE(p_lastprocessedoffset, NULL) END,
                CASE WHEN p_lastprocessedkey_clear = true THEN NULL ELSE COALESCE(p_lastprocessedkey, NULL) END,
                CASE WHEN p_batchsize_clear = true THEN NULL ELSE COALESCE(p_batchsize, NULL) END,
                COALESCE(p_cancellationrequested, FALSE),
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END,
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_startedbyuserid_clear = true THEN NULL ELSE COALESCE(p_startedbyuserid, NULL) END,
                COALESCE(p_dryrun, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwProcessRuns"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateProcessRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateProcessRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Runs
-- Item: spUpdateProcessRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ProcessRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateProcessRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateProcessRun"(
    p_id UUID,
    p_recordprocessid_clear boolean DEFAULT false,
    p_recordprocessid UUID DEFAULT NULL,
    p_entityid_clear boolean DEFAULT false,
    p_entityid UUID DEFAULT NULL,
    p_triggeredby varchar(20) DEFAULT NULL,
    p_sourcetype varchar(20) DEFAULT NULL,
    p_sourceid_clear boolean DEFAULT false,
    p_sourceid UUID DEFAULT NULL,
    p_sourcefilter_clear boolean DEFAULT false,
    p_sourcefilter TEXT DEFAULT NULL,
    p_scheduledjobrunid_clear boolean DEFAULT false,
    p_scheduledjobrunid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_starttime_clear boolean DEFAULT false,
    p_starttime TIMESTAMPTZ DEFAULT NULL,
    p_endtime_clear boolean DEFAULT false,
    p_endtime TIMESTAMPTZ DEFAULT NULL,
    p_totalitemcount_clear boolean DEFAULT false,
    p_totalitemcount int DEFAULT NULL,
    p_processeditems int DEFAULT NULL,
    p_successcount int DEFAULT NULL,
    p_errorcount int DEFAULT NULL,
    p_skippedcount int DEFAULT NULL,
    p_lastprocessedoffset_clear boolean DEFAULT false,
    p_lastprocessedoffset int DEFAULT NULL,
    p_lastprocessedkey_clear boolean DEFAULT false,
    p_lastprocessedkey varchar(450) DEFAULT NULL,
    p_batchsize_clear boolean DEFAULT false,
    p_batchsize int DEFAULT NULL,
    p_cancellationrequested BOOLEAN DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration TEXT DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_startedbyuserid_clear boolean DEFAULT false,
    p_startedbyuserid UUID DEFAULT NULL,
    p_dryrun BOOLEAN DEFAULT NULL
) RETURNS SETOF __mj."vwProcessRuns" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."ProcessRun"
    SET
        "RecordProcessID" = CASE WHEN p_recordprocessid_clear = true THEN NULL ELSE COALESCE(p_recordprocessid, "RecordProcessID") END,
        "EntityID" = CASE WHEN p_entityid_clear = true THEN NULL ELSE COALESCE(p_entityid, "EntityID") END,
        "TriggeredBy" = COALESCE(p_triggeredby, "TriggeredBy"),
        "SourceType" = COALESCE(p_sourcetype, "SourceType"),
        "SourceID" = CASE WHEN p_sourceid_clear = true THEN NULL ELSE COALESCE(p_sourceid, "SourceID") END,
        "SourceFilter" = CASE WHEN p_sourcefilter_clear = true THEN NULL ELSE COALESCE(p_sourcefilter, "SourceFilter") END,
        "ScheduledJobRunID" = CASE WHEN p_scheduledjobrunid_clear = true THEN NULL ELSE COALESCE(p_scheduledjobrunid, "ScheduledJobRunID") END,
        "Status" = COALESCE(p_status, "Status"),
        "StartTime" = CASE WHEN p_starttime_clear = true THEN NULL ELSE COALESCE(p_starttime, "StartTime") END,
        "EndTime" = CASE WHEN p_endtime_clear = true THEN NULL ELSE COALESCE(p_endtime, "EndTime") END,
        "TotalItemCount" = CASE WHEN p_totalitemcount_clear = true THEN NULL ELSE COALESCE(p_totalitemcount, "TotalItemCount") END,
        "ProcessedItems" = COALESCE(p_processeditems, "ProcessedItems"),
        "SuccessCount" = COALESCE(p_successcount, "SuccessCount"),
        "ErrorCount" = COALESCE(p_errorcount, "ErrorCount"),
        "SkippedCount" = COALESCE(p_skippedcount, "SkippedCount"),
        "LastProcessedOffset" = CASE WHEN p_lastprocessedoffset_clear = true THEN NULL ELSE COALESCE(p_lastprocessedoffset, "LastProcessedOffset") END,
        "LastProcessedKey" = CASE WHEN p_lastprocessedkey_clear = true THEN NULL ELSE COALESCE(p_lastprocessedkey, "LastProcessedKey") END,
        "BatchSize" = CASE WHEN p_batchsize_clear = true THEN NULL ELSE COALESCE(p_batchsize, "BatchSize") END,
        "CancellationRequested" = COALESCE(p_cancellationrequested, "CancellationRequested"),
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END,
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "StartedByUserID" = CASE WHEN p_startedbyuserid_clear = true THEN NULL ELSE COALESCE(p_startedbyuserid, "StartedByUserID") END,
        "DryRun" = COALESCE(p_dryrun, "DryRun")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwProcessRuns"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateProcessRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateProcessRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ProcessRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_process_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_process_run" ON __mj."ProcessRun";

CREATE TRIGGER "trg_update_process_run"
BEFORE UPDATE ON __mj."ProcessRun"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_process_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Process Runs
-- Item: spDeleteProcessRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ProcessRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteProcessRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteProcessRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."ProcessRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteProcessRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteProcessRun" TO "cdp_Integration";
