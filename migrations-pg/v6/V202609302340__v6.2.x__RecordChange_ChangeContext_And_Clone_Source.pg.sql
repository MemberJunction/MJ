-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202609302340__v6.2.x__RecordChange_ChangeContext_And_Clone_Source.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- Hand-ported from the SQL Server source (the AST transpiler reported these three statements).
-- Every statement is re-runnable so the migration can be re-applied by `mj migrate rebake`.

-- 1. Extend RecordChange.Source CHECK to allow 'Clone'.
ALTER TABLE __mj."RecordChange" DROP CONSTRAINT IF EXISTS "CHK_RecordChange_Source";
ALTER TABLE __mj."RecordChange"
  ADD CONSTRAINT "CHK_RecordChange_Source" CHECK ("Source" IN ('Internal', 'External', 'Restore', 'Clone'));

-- 2. Add the ChangeContext column.
ALTER TABLE __mj."RecordChange" ADD COLUMN IF NOT EXISTS "ChangeContext" TEXT NULL;
COMMENT ON COLUMN __mj."RecordChange"."ChangeContext" IS 'Optional JSON configuration bag carrying structured provenance context (shape = IRecordChangeContext). Used by clone, merge, and other multi-record or automated operations to record lineage, root records, and field change summaries.';

-- 3. Recreate spCreateRecordChange_Internal with p_ChangeContext. The previous 12-argument
-- signature is dropped first: a CREATE OR REPLACE with a 13th defaulted argument would add an
-- overload, and every 12-argument call would then be ambiguous. PostgreSQLDataProvider writes
-- Record Changes with its own INSERT (including "ChangeContext"), so this function is kept for
-- parity with SQL Server; its body quotes the mixed-case columns and returns the inserted row.
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateRecordChange_Internal'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateRecordChange_Internal"(
    IN p_EntityName VARCHAR(100),
    IN p_RecordID VARCHAR(750),
    IN p_UserID UUID,
    IN p_Type VARCHAR(20),
    IN p_ChangesJSON TEXT,
    IN p_ChangesDescription TEXT,
    IN p_FullRecordJSON TEXT,
    IN p_Status CHAR(15),
    IN p_Comments TEXT,
    IN p_Source VARCHAR(20) DEFAULT NULL,
    IN p_RestoredFromID UUID DEFAULT NULL,
    IN p_RestoreReason TEXT DEFAULT NULL,
    IN p_ChangeContext TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwRecordChanges" AS
$$
DECLARE
    v_ID UUID;
BEGIN
    INSERT INTO __mj."RecordChange"
        ("EntityID", "RecordID", "UserID", "Type", "Source", "ChangedAt", "ChangesJSON",
         "ChangesDescription", "FullRecordJSON", "Status", "Comments", "RestoredFromID",
         "RestoreReason", "ChangeContext")
    VALUES
        ((SELECT "ID" FROM __mj."Entity" WHERE "Name" = p_EntityName),
         p_RecordID, p_UserID, p_Type, COALESCE(p_Source, 'Internal'), NOW(), p_ChangesJSON,
         p_ChangesDescription, p_FullRecordJSON, p_Status, p_Comments, p_RestoredFromID,
         p_RestoreReason, p_ChangeContext)
    RETURNING "ID" INTO v_ID;

    -- Return the new record from the base view so calculated fields are included
    RETURN QUERY SELECT * FROM __mj."vwRecordChanges" WHERE "ID" = v_ID;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION __mj."spCreateRecordChange_Internal" TO "cdp_Developer", "cdp_Integration", "cdp_UI";


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '44df31cd-5787-4b0d-82f7-547743cf6f7f' OR ("EntityID" = 'F5238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'ChangeContext')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('44df31cd-5787-4b0d-82f7-547743cf6f7f', 'F5238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Record Changes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F5238F34-2837-EF11-86D4-6045BDEE16E6'), 'ChangeContext', 'Change Context', 'Optional JSON configuration bag carrying structured provenance context (shape = IRecordChangeContext). Used by clone, merge, and other multi-record or automated operations to record lineage, root records, and field change summaries.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityFieldValue" WHERE "ID" = 'b3aa2c30-a00e-4af8-ad34-9ebd18658651') THEN
    INSERT INTO __mj."EntityFieldValue" ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('b3aa2c30-a00e-4af8-ad34-9ebd18658651', 'B85717F0-6F36-EF11-86D4-6045BDEE16E6', 1, 'Clone', 'Clone', NOW(), NOW());
  END IF;
END $$;

/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 2
WHERE
  "ID" = 'FFCA5310-D2BE-433B-AA87-22770FAFA950';
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 3
WHERE
  "ID" = '88A1D937-0A97-48BA-AF13-A7E9CDDC16F9';
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 4
WHERE
  "ID" = 'CA0C7411-739A-480B-B084-3667C501525D';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Changes
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_change_entity_id"
    ON "__mj"."RecordChange" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_change_user_id"
    ON "__mj"."RecordChange" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_change_replay_run_id"
    ON "__mj"."RecordChange" ("ReplayRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_change_integration_id"
    ON "__mj"."RecordChange" ("IntegrationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_record_change_restored_from_id"
    ON "__mj"."RecordChange" ("RestoredFromID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Changes
-- Item: vwRecordChanges
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Record Changes
-----               SCHEMA:      __mj
-----               BASE TABLE:  RecordChange
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwRecordChanges"
AS
SELECT
    r.*,
    MJEntity_EntityID."Name" AS "Entity",
    MJUser_UserID."Name" AS "User",
    MJRecordChangeReplayRun_ReplayRunID."User" AS "ReplayRun",
    MJIntegration_IntegrationID."Name" AS "Integration",
    MJRecordChange_RestoredFromID."RecordID" AS "RestoredFrom"
FROM
    "__mj"."RecordChange" AS r
INNER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "r"."EntityID" = MJEntity_EntityID."ID"
INNER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "r"."UserID" = MJUser_UserID."ID"
LEFT OUTER JOIN
    "__mj"."vwRecordChangeReplayRuns" AS MJRecordChangeReplayRun_ReplayRunID
  ON
    "r"."ReplayRunID" = MJRecordChangeReplayRun_ReplayRunID."ID"
LEFT OUTER JOIN
    "__mj"."Integration" AS MJIntegration_IntegrationID
  ON
    "r"."IntegrationID" = MJIntegration_IntegrationID."ID"
LEFT OUTER JOIN
    "__mj"."RecordChange" AS MJRecordChange_RestoredFromID
  ON
    "r"."RestoredFromID" = MJRecordChange_RestoredFromID."ID"
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
    grants_sql  TEXT,
    depth       INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_deps;

  -- Every view that DROP ... CASCADE removes: direct dependents AND theirs, transitively.
  -- Capturing only direct dependents restored vwTestRuns after a vwTestSuiteRuns regen but
  -- not vwConversations / vwConversationDetails, which select from vwTestRuns — they and their
  -- CRUD functions stayed permanently missing. depth is the LONGEST path from the target, so
  -- replaying in depth order always recreates a view after every view it reads.
  CREATE TEMP TABLE IF NOT EXISTS _vw_regen_dep_oids (
    view_oid OID,
    depth    INT
  ) ON COMMIT DROP;
  DELETE FROM _vw_regen_dep_oids;
  INSERT INTO _vw_regen_dep_oids (view_oid, depth)
  WITH RECURSIVE deps(view_oid, depth) AS (
      SELECT DISTINCT dc.oid, 1
      FROM pg_depend d
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      JOIN pg_class tc ON tc.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = tc.relnamespace
      WHERE tn.nspname = '__mj'
        AND tc.relname = 'vwRecordChanges'
        AND tc.relkind IN ('v', 'm')
        AND dc.oid <> tc.oid
    UNION
      SELECT dc.oid, deps.depth + 1
      FROM deps
      JOIN pg_depend d ON d.refobjid = deps.view_oid
      JOIN pg_rewrite r ON r.oid = d.objid AND d.classid = 'pg_rewrite'::regclass
      JOIN pg_class dc ON dc.oid = r.ev_class AND dc.relkind IN ('v', 'm')
      WHERE dc.oid <> deps.view_oid
        AND deps.depth < 50
  )
  SELECT view_oid, MAX(depth) FROM deps GROUP BY view_oid;

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
  INSERT INTO _vw_regen_deps (schema_name, view_name, relkind, definition, grants_sql, depth)
  SELECT
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
       WHERE g.privilege IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
      o.depth
  FROM _vw_regen_dep_oids o
  JOIN pg_class dc ON dc.oid = o.view_oid
  JOIN pg_namespace dn ON dn.oid = dc.relnamespace;

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
  -- The set is the target view plus every view captured above, because CASCADE drops the
  -- functions of each of them, not only the target's.
  INSERT INTO _vw_regen_fn_deps (schema_name, fn_name, fn_oid, definition)
  SELECT DISTINCT
      pn.nspname,
      pp.proname,
      pp.oid,
      pg_get_functiondef(pp.oid)
  FROM pg_proc pp
  JOIN pg_namespace pn ON pn.oid = pp.pronamespace
  WHERE pp.prokind IN ('f', 'p')
    AND EXISTS (
      SELECT 1
      FROM pg_class c
      WHERE (c.oid IN (SELECT view_oid FROM _vw_regen_dep_oids)
             OR c.oid = (SELECT tc.oid FROM pg_class tc
                         JOIN pg_namespace tn ON tn.oid = tc.relnamespace
                         WHERE tn.nspname = '__mj'
                           AND tc.relname = 'vwRecordChanges'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwRecordChanges" CASCADE;
  EXECUTE vsql;

  -- Replay captured dependents. Best-effort: log + continue on failure.
  -- IMPORTANT: the CREATE VIEW and the GRANTs run in SEPARATE inner BEGIN
  -- blocks. PL/pgSQL's BEGIN ... EXCEPTION creates an implicit savepoint
  -- and rolls back EVERY statement in the block on any exception. If we
  -- combined CREATE+GRANT in one block and a GRANT failed (e.g. role not
  -- present in target environment), the just-recreated VIEW would also
  -- get rolled back and stay missing — the exact failure mode this
  -- wrapper exists to prevent.
  FOR rec IN SELECT schema_name, view_name, relkind, definition, grants_sql FROM _vw_regen_deps ORDER BY depth, view_name LOOP
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
  DROP TABLE _vw_regen_dep_oids;
  DROP TABLE _vw_regen_fn_deps;
END $vw_regen$;
GRANT SELECT ON "__mj"."vwRecordChanges" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwRecordChanges" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwRecordChanges" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Changes
-- Item: spCreateRecordChange
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR RecordChange
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateRecordChange'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateRecordChange"(
    p_id UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(750) DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_type varchar(20) DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL,
    p_changedat TIMESTAMPTZ DEFAULT NULL,
    p_changesjson TEXT DEFAULT NULL,
    p_changesdescription TEXT DEFAULT NULL,
    p_fullrecordjson TEXT DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_errorlog_clear boolean DEFAULT false,
    p_errorlog TEXT DEFAULT NULL,
    p_replayrunid_clear boolean DEFAULT false,
    p_replayrunid UUID DEFAULT NULL,
    p_integrationid_clear boolean DEFAULT false,
    p_integrationid UUID DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_restoredfromid_clear boolean DEFAULT false,
    p_restoredfromid UUID DEFAULT NULL,
    p_restorereason_clear boolean DEFAULT false,
    p_restorereason TEXT DEFAULT NULL,
    p_changecontext_clear boolean DEFAULT false,
    p_changecontext TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwRecordChanges" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."RecordChange"
        (
            "ID",
            "EntityID",
                "RecordID",
                "UserID",
                "Type",
                "Source",
                "ChangedAt",
                "ChangesJSON",
                "ChangesDescription",
                "FullRecordJSON",
                "Status",
                "ErrorLog",
                "ReplayRunID",
                "IntegrationID",
                "Comments",
                "RestoredFromID",
                "RestoreReason",
                "ChangeContext"
        )
    VALUES
        (
            v_new_id,
            p_entityid,
                p_recordid,
                p_userid,
                COALESCE(p_type, 'Create'),
                COALESCE(p_source, 'Internal'),
                COALESCE(p_changedat, NOW()),
                p_changesjson,
                p_changesdescription,
                p_fullrecordjson,
                COALESCE(p_status, 'Complete'),
                CASE WHEN p_errorlog_clear = true THEN NULL ELSE COALESCE(p_errorlog, NULL) END,
                CASE WHEN p_replayrunid_clear = true THEN NULL ELSE COALESCE(p_replayrunid, NULL) END,
                CASE WHEN p_integrationid_clear = true THEN NULL ELSE COALESCE(p_integrationid, NULL) END,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                CASE WHEN p_restoredfromid_clear = true THEN NULL ELSE COALESCE(p_restoredfromid, NULL) END,
                CASE WHEN p_restorereason_clear = true THEN NULL ELSE COALESCE(p_restorereason, NULL) END,
                CASE WHEN p_changecontext_clear = true THEN NULL ELSE COALESCE(p_changecontext, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwRecordChanges"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRecordChange" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRecordChange" TO "cdp_UI";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateRecordChange" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Changes
-- Item: spUpdateRecordChange
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR RecordChange
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateRecordChange'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateRecordChange"(
    p_id UUID,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(750) DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_type varchar(20) DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL,
    p_changedat TIMESTAMPTZ DEFAULT NULL,
    p_changesjson TEXT DEFAULT NULL,
    p_changesdescription TEXT DEFAULT NULL,
    p_fullrecordjson TEXT DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_errorlog_clear boolean DEFAULT false,
    p_errorlog TEXT DEFAULT NULL,
    p_replayrunid_clear boolean DEFAULT false,
    p_replayrunid UUID DEFAULT NULL,
    p_integrationid_clear boolean DEFAULT false,
    p_integrationid UUID DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_restoredfromid_clear boolean DEFAULT false,
    p_restoredfromid UUID DEFAULT NULL,
    p_restorereason_clear boolean DEFAULT false,
    p_restorereason TEXT DEFAULT NULL,
    p_changecontext_clear boolean DEFAULT false,
    p_changecontext TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwRecordChanges" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."RecordChange"
    SET
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "RecordID" = COALESCE(p_recordid, "RecordID"),
        "UserID" = COALESCE(p_userid, "UserID"),
        "Type" = COALESCE(p_type, "Type"),
        "Source" = COALESCE(p_source, "Source"),
        "ChangedAt" = COALESCE(p_changedat, "ChangedAt"),
        "ChangesJSON" = COALESCE(p_changesjson, "ChangesJSON"),
        "ChangesDescription" = COALESCE(p_changesdescription, "ChangesDescription"),
        "FullRecordJSON" = COALESCE(p_fullrecordjson, "FullRecordJSON"),
        "Status" = COALESCE(p_status, "Status"),
        "ErrorLog" = CASE WHEN p_errorlog_clear = true THEN NULL ELSE COALESCE(p_errorlog, "ErrorLog") END,
        "ReplayRunID" = CASE WHEN p_replayrunid_clear = true THEN NULL ELSE COALESCE(p_replayrunid, "ReplayRunID") END,
        "IntegrationID" = CASE WHEN p_integrationid_clear = true THEN NULL ELSE COALESCE(p_integrationid, "IntegrationID") END,
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "RestoredFromID" = CASE WHEN p_restoredfromid_clear = true THEN NULL ELSE COALESCE(p_restoredfromid, "RestoredFromID") END,
        "RestoreReason" = CASE WHEN p_restorereason_clear = true THEN NULL ELSE COALESCE(p_restorereason, "RestoreReason") END,
        "ChangeContext" = CASE WHEN p_changecontext_clear = true THEN NULL ELSE COALESCE(p_changecontext, "ChangeContext") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwRecordChanges"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateRecordChange" TO "cdp_Developer";




-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Record Changes
-- Item: spDeleteRecordChange
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR RecordChange
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteRecordChange'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteRecordChange"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."RecordChange"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
