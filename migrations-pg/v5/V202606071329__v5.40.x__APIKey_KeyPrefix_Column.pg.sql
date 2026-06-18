-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606071329__v5.40.x__APIKey_KeyPrefix_Column.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."APIKey"
ADD COLUMN "KeyPrefix" VARCHAR(20) NULL /* Add KeyPrefix column to APIKey table */ /* Stores the configured prefix + first 4 characters of the random body */ /* (e.g., "mj_sk_a1b2") so administrators can visually identify keys */ /* without exposing the full key. NULL for keys created before this migration */ /* since the raw key was never stored. */;

COMMENT ON COLUMN __mj."APIKey"."KeyPrefix" IS 'A short preview of the key shown at creation time (e.g. mj_sk_a1b2). Stores the configured prefix plus the first 4 characters of the random body for visual identification. NULL for keys created before this column was added.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '08336b23-33f3-49c1-8739-58528d8156ca' OR ("EntityID" = 'B56DB373-2982-4E91-AACB-075CB8BECBBB' AND "Name" = 'KeyPrefix')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('08336b23-33f3-49c1-8739-58528d8156ca', 'B56DB373-2982-4E91-AACB-075CB8BECBBB' /* Entity: MJ: API Keys */, 100026, 'KeyPrefix', 'Key Prefix', 'A short preview of the key shown at creation time (e.g. mj_sk_a1b2). Stores the configured prefix plus the first 4 characters of the random body for visual identification. NULL for keys created before this column was added.', 'nvarchar', 40, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: API Keys
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_api_key_user_id"
    ON __mj."APIKey" ("UserID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_api_key_created_by_user_id"
    ON __mj."APIKey" ("CreatedByUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: API Keys
-- Item: vwAPIKeys
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: API Keys
-----               SCHEMA:      __mj
-----               BASE TABLE:  APIKey
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAPIKeys"
AS
SELECT
    a.*,
    MJUser_UserID."Name" AS "User",
    MJUser_CreatedByUserID."Name" AS "CreatedByUser"
FROM
    __mj."APIKey" AS a
INNER JOIN
    __mj."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
INNER JOIN
    __mj."User" AS MJUser_CreatedByUserID
  ON
    "a"."CreatedByUserID" = MJUser_CreatedByUserID."ID"
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
    AND tc.relname = 'vwAPIKeys'
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
    AND tc.relname = 'vwAPIKeys'
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
        AND tc.relname = 'vwAPIKeys'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwAPIKeys" CASCADE;
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
GRANT SELECT ON __mj."vwAPIKeys" TO "cdp_UI";
GRANT SELECT ON __mj."vwAPIKeys" TO "cdp_Developer";
GRANT SELECT ON __mj."vwAPIKeys" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: API Keys
-- Item: spCreateAPIKey
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR APIKey
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAPIKey'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateAPIKey"(
    p_id uuid DEFAULT NULL,
    p_hash text DEFAULT NULL,
    p_userid uuid DEFAULT NULL,
    p_label text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_lastusedat_clear boolean DEFAULT false,
    p_lastusedat TIMESTAMPTZ DEFAULT NULL,
    p_createdbyuserid uuid DEFAULT NULL,
    p_keyprefix_clear boolean DEFAULT false,
    p_keyprefix text DEFAULT NULL
) RETURNS SETOF __mj."vwAPIKeys" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."APIKey"
        (
            "ID",
            "Hash",
                "UserID",
                "Label",
                "Description",
                "Status",
                "ExpiresAt",
                "LastUsedAt",
                "CreatedByUserID",
                "KeyPrefix"
        )
    VALUES
        (
            v_new_id,
            p_hash,
                p_userid,
                p_label,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_status, 'Active'),
                CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, NULL) END,
                CASE WHEN p_lastusedat_clear = true THEN NULL ELSE COALESCE(p_lastusedat, NULL) END,
                p_createdbyuserid,
                CASE WHEN p_keyprefix_clear = true THEN NULL ELSE COALESCE(p_keyprefix, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwAPIKeys"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateAPIKey" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spCreateAPIKey" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: API Keys
-- Item: spUpdateAPIKey
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR APIKey
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAPIKey'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateAPIKey"(
    p_id uuid,
    p_hash text DEFAULT NULL,
    p_userid uuid DEFAULT NULL,
    p_label text DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description text DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_expiresat_clear boolean DEFAULT false,
    p_expiresat TIMESTAMPTZ DEFAULT NULL,
    p_lastusedat_clear boolean DEFAULT false,
    p_lastusedat TIMESTAMPTZ DEFAULT NULL,
    p_createdbyuserid uuid DEFAULT NULL,
    p_keyprefix_clear boolean DEFAULT false,
    p_keyprefix text DEFAULT NULL
) RETURNS SETOF __mj."vwAPIKeys" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."APIKey"
    SET
        "Hash" = COALESCE(p_hash, "Hash"),
        "UserID" = COALESCE(p_userid, "UserID"),
        "Label" = COALESCE(p_label, "Label"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Status" = COALESCE(p_status, "Status"),
        "ExpiresAt" = CASE WHEN p_expiresat_clear = true THEN NULL ELSE COALESCE(p_expiresat, "ExpiresAt") END,
        "LastUsedAt" = CASE WHEN p_lastusedat_clear = true THEN NULL ELSE COALESCE(p_lastusedat, "LastUsedAt") END,
        "CreatedByUserID" = COALESCE(p_createdbyuserid, "CreatedByUserID"),
        "KeyPrefix" = CASE WHEN p_keyprefix_clear = true THEN NULL ELSE COALESCE(p_keyprefix, "KeyPrefix") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwAPIKeys"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateAPIKey" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spUpdateAPIKey" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the APIKey table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_api_key"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_api_key" ON __mj."APIKey";

CREATE TRIGGER "trg_update_api_key"
BEFORE UPDATE ON __mj."APIKey"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_api_key"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: API Keys
-- Item: spDeleteAPIKey
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR APIKey
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAPIKey'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteAPIKey"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."APIKey"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIKey" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION __mj."spDeleteAPIKey" TO "cdp_Integration";
