-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202607101200__v5.47.x__OpenApp_LastCompletedStep_CodeGen.sql
-- Regenerates the OpenApp base view + CRUD sprocs so LastCompletedStep /
-- LastCompletedStepTargetVersion are exposed on PostgreSQL. V202607090600 added the two
-- columns + EntityField metadata on PG but — unlike its SQL Server counterpart — did NOT
-- bake the CodeGen output, so __mj."vwOpenApps" never exposed them and every `mj app`
-- operation failed with `column "LastCompletedStep" does not exist`. This is the OpenApp
-- entity's `mj codegen` (postgresql) output against a fresh v5.46-migrated database.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS ${flyway:defaultSchema};
SET search_path TO ${flyway:defaultSchema}, public;
SET standard_conforming_strings = on;

/* Index for Foreign Keys for OpenApp */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Open Apps
-- Item: Index for Foreign Keys
-- Generated at: 2026-07-10T17:01:54.425Z
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_open_app_installed_by_user_id"
    ON ${flyway:defaultSchema}."OpenApp" ("InstalledByUserID");

/* Base View SQL for MJ: Open Apps */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Open Apps
-- Item: vwOpenApps
-- Generated at: 2026-07-10T17:01:54.425Z
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Open Apps
-----               SCHEMA:      ${flyway:defaultSchema}
-----               BASE TABLE:  OpenApp
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW ${flyway:defaultSchema}."vwOpenApps"
AS
SELECT
    o.*,
    MJUser_InstalledByUserID."Name" AS "InstalledByUser"
FROM
    ${flyway:defaultSchema}."OpenApp" AS o
INNER JOIN
    ${flyway:defaultSchema}."User" AS MJUser_InstalledByUserID
  ON
    "o"."InstalledByUserID" = MJUser_InstalledByUserID."ID"
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
  WHERE tn.nspname = '${flyway:defaultSchema}'
    AND tc.relname = 'vwOpenApps'
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
  WHERE tn.nspname = '${flyway:defaultSchema}'
    AND tc.relname = 'vwOpenApps'
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
        AND tn.nspname = '${flyway:defaultSchema}'
        AND tc.relname = 'vwOpenApps'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS ${flyway:defaultSchema}."vwOpenApps" CASCADE;
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
GRANT SELECT ON ${flyway:defaultSchema}."vwOpenApps" TO "cdp_UI";
GRANT SELECT ON ${flyway:defaultSchema}."vwOpenApps" TO "cdp_Developer";
GRANT SELECT ON ${flyway:defaultSchema}."vwOpenApps" TO "cdp_Integration";

/* Base View Permissions SQL for MJ: Open Apps */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Open Apps
-- Item: Permissions for vwOpenApps
-- Generated at: 2026-07-10T17:01:54.425Z
-- ============================================================
GRANT SELECT ON ${flyway:defaultSchema}."vwOpenApps" TO "cdp_UI";
GRANT SELECT ON ${flyway:defaultSchema}."vwOpenApps" TO "cdp_Developer";
GRANT SELECT ON ${flyway:defaultSchema}."vwOpenApps" TO "cdp_Integration";

/* spCreate SQL for MJ: Open Apps */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Open Apps
-- Item: spCreateOpenApp
-- Generated at: 2026-07-10T17:01:54.425Z
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR OpenApp
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateOpenApp'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spCreateOpenApp"(
    p_id UUID DEFAULT NULL,
    p_name varchar(64) DEFAULT NULL,
    p_displayname varchar(200) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_version varchar(50) DEFAULT NULL,
    p_publisher varchar(200) DEFAULT NULL,
    p_publisheremail_clear boolean DEFAULT false,
    p_publisheremail varchar(255) DEFAULT NULL,
    p_publisherurl_clear boolean DEFAULT false,
    p_publisherurl varchar(500) DEFAULT NULL,
    p_repositoryurl varchar(500) DEFAULT NULL,
    p_schemaname_clear boolean DEFAULT false,
    p_schemaname varchar(128) DEFAULT NULL,
    p_mjversionrange varchar(100) DEFAULT NULL,
    p_license_clear boolean DEFAULT false,
    p_license varchar(50) DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(100) DEFAULT NULL,
    p_color_clear boolean DEFAULT false,
    p_color varchar(20) DEFAULT NULL,
    p_manifestjson TEXT DEFAULT NULL,
    p_configurationschemajson_clear boolean DEFAULT false,
    p_configurationschemajson TEXT DEFAULT NULL,
    p_installedbyuserid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_subpath_clear boolean DEFAULT false,
    p_subpath varchar(500) DEFAULT NULL,
    p_lastcompletedstep_clear boolean DEFAULT false,
    p_lastcompletedstep varchar(50) DEFAULT NULL,
    p_lastcompletedsteptargetversion_clear boolean DEFAULT false,
    p_lastcompletedsteptargetversion varchar(20) DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."vwOpenApps" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO ${flyway:defaultSchema}."OpenApp"
        (
            "ID",
            "Name",
                "DisplayName",
                "Description",
                "Version",
                "Publisher",
                "PublisherEmail",
                "PublisherURL",
                "RepositoryURL",
                "SchemaName",
                "MJVersionRange",
                "License",
                "Icon",
                "Color",
                "ManifestJSON",
                "ConfigurationSchemaJSON",
                "InstalledByUserID",
                "Status",
                "Subpath",
                "LastCompletedStep",
                "LastCompletedStepTargetVersion"
        )
    VALUES
        (
            v_new_id,
            p_name,
                p_displayname,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_version,
                p_publisher,
                CASE WHEN p_publisheremail_clear = true THEN NULL ELSE COALESCE(p_publisheremail, NULL) END,
                CASE WHEN p_publisherurl_clear = true THEN NULL ELSE COALESCE(p_publisherurl, NULL) END,
                p_repositoryurl,
                CASE WHEN p_schemaname_clear = true THEN NULL ELSE COALESCE(p_schemaname, NULL) END,
                p_mjversionrange,
                CASE WHEN p_license_clear = true THEN NULL ELSE COALESCE(p_license, NULL) END,
                CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, NULL) END,
                CASE WHEN p_color_clear = true THEN NULL ELSE COALESCE(p_color, NULL) END,
                p_manifestjson,
                CASE WHEN p_configurationschemajson_clear = true THEN NULL ELSE COALESCE(p_configurationschemajson, NULL) END,
                p_installedbyuserid,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_subpath_clear = true THEN NULL ELSE COALESCE(p_subpath, NULL) END,
                CASE WHEN p_lastcompletedstep_clear = true THEN NULL ELSE COALESCE(p_lastcompletedstep, NULL) END,
                CASE WHEN p_lastcompletedsteptargetversion_clear = true THEN NULL ELSE COALESCE(p_lastcompletedsteptargetversion, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwOpenApps"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateOpenApp" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateOpenApp" TO "cdp_Integration";

/* spCreate Permissions for MJ: Open Apps */
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateOpenApp" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spCreateOpenApp" TO "cdp_Integration";

/* spUpdate SQL for MJ: Open Apps */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Open Apps
-- Item: spUpdateOpenApp
-- Generated at: 2026-07-10T17:01:54.426Z
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR OpenApp
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateOpenApp'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spUpdateOpenApp"(
    p_id UUID,
    p_name varchar(64) DEFAULT NULL,
    p_displayname varchar(200) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_version varchar(50) DEFAULT NULL,
    p_publisher varchar(200) DEFAULT NULL,
    p_publisheremail_clear boolean DEFAULT false,
    p_publisheremail varchar(255) DEFAULT NULL,
    p_publisherurl_clear boolean DEFAULT false,
    p_publisherurl varchar(500) DEFAULT NULL,
    p_repositoryurl varchar(500) DEFAULT NULL,
    p_schemaname_clear boolean DEFAULT false,
    p_schemaname varchar(128) DEFAULT NULL,
    p_mjversionrange varchar(100) DEFAULT NULL,
    p_license_clear boolean DEFAULT false,
    p_license varchar(50) DEFAULT NULL,
    p_icon_clear boolean DEFAULT false,
    p_icon varchar(100) DEFAULT NULL,
    p_color_clear boolean DEFAULT false,
    p_color varchar(20) DEFAULT NULL,
    p_manifestjson TEXT DEFAULT NULL,
    p_configurationschemajson_clear boolean DEFAULT false,
    p_configurationschemajson TEXT DEFAULT NULL,
    p_installedbyuserid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_subpath_clear boolean DEFAULT false,
    p_subpath varchar(500) DEFAULT NULL,
    p_lastcompletedstep_clear boolean DEFAULT false,
    p_lastcompletedstep varchar(50) DEFAULT NULL,
    p_lastcompletedsteptargetversion_clear boolean DEFAULT false,
    p_lastcompletedsteptargetversion varchar(20) DEFAULT NULL
) RETURNS SETOF ${flyway:defaultSchema}."vwOpenApps" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE ${flyway:defaultSchema}."OpenApp"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "DisplayName" = COALESCE(p_displayname, "DisplayName"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Version" = COALESCE(p_version, "Version"),
        "Publisher" = COALESCE(p_publisher, "Publisher"),
        "PublisherEmail" = CASE WHEN p_publisheremail_clear = true THEN NULL ELSE COALESCE(p_publisheremail, "PublisherEmail") END,
        "PublisherURL" = CASE WHEN p_publisherurl_clear = true THEN NULL ELSE COALESCE(p_publisherurl, "PublisherURL") END,
        "RepositoryURL" = COALESCE(p_repositoryurl, "RepositoryURL"),
        "SchemaName" = CASE WHEN p_schemaname_clear = true THEN NULL ELSE COALESCE(p_schemaname, "SchemaName") END,
        "MJVersionRange" = COALESCE(p_mjversionrange, "MJVersionRange"),
        "License" = CASE WHEN p_license_clear = true THEN NULL ELSE COALESCE(p_license, "License") END,
        "Icon" = CASE WHEN p_icon_clear = true THEN NULL ELSE COALESCE(p_icon, "Icon") END,
        "Color" = CASE WHEN p_color_clear = true THEN NULL ELSE COALESCE(p_color, "Color") END,
        "ManifestJSON" = COALESCE(p_manifestjson, "ManifestJSON"),
        "ConfigurationSchemaJSON" = CASE WHEN p_configurationschemajson_clear = true THEN NULL ELSE COALESCE(p_configurationschemajson, "ConfigurationSchemaJSON") END,
        "InstalledByUserID" = COALESCE(p_installedbyuserid, "InstalledByUserID"),
        "Status" = COALESCE(p_status, "Status"),
        "Subpath" = CASE WHEN p_subpath_clear = true THEN NULL ELSE COALESCE(p_subpath, "Subpath") END,
        "LastCompletedStep" = CASE WHEN p_lastcompletedstep_clear = true THEN NULL ELSE COALESCE(p_lastcompletedstep, "LastCompletedStep") END,
        "LastCompletedStepTargetVersion" = CASE WHEN p_lastcompletedsteptargetversion_clear = true THEN NULL ELSE COALESCE(p_lastcompletedsteptargetversion, "LastCompletedStepTargetVersion") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM ${flyway:defaultSchema}."vwOpenApps"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateOpenApp" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateOpenApp" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the OpenApp table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."fn_trg_update_open_app"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_open_app" ON ${flyway:defaultSchema}."OpenApp";

CREATE TRIGGER "trg_update_open_app"
BEFORE UPDATE ON ${flyway:defaultSchema}."OpenApp"
FOR EACH ROW
EXECUTE FUNCTION ${flyway:defaultSchema}."fn_trg_update_open_app"();

/* spUpdate Permissions for MJ: Open Apps */
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateOpenApp" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spUpdateOpenApp" TO "cdp_Integration";

/* spDelete SQL for MJ: Open Apps */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Open Apps
-- Item: spDeleteOpenApp
-- Generated at: 2026-07-10T17:01:54.426Z
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR OpenApp
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteOpenApp'
               AND pronamespace = '${flyway:defaultSchema}'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION ${flyway:defaultSchema}."spDeleteOpenApp"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM ${flyway:defaultSchema}."OpenApp"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spDeleteOpenApp" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spDeleteOpenApp" TO "cdp_Integration";

/* spDelete Permissions for MJ: Open Apps */
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spDeleteOpenApp" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION ${flyway:defaultSchema}."spDeleteOpenApp" TO "cdp_Integration";

/* Base View SQL for MJ: Output Delivery Types */
-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Output Delivery Types
