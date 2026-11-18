-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610141513__v6.2.x__Theme_Login_Screen.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."Theme"
ADD COLUMN "LoginScreen" TEXT NULL, ADD COLUMN "LoginScreenDraft" TEXT NULL /* ============================================================================= */ /* Theme sign-in page design (Login Studio) */ /* ============================================================================= */ /* The Explorer login screen can be themed, rearranged and extended by a host */ /* application (the --mj-login-* tokens, the Login* inputs on <mj-explorer-app>, */ /* and the mjLoginSlot templates), but only in code. These two columns let an */ /* administrator design it as data instead, in the Login Studio app. */ /* A sign-in page belongs to a brand, so it lives on the Theme: the default */ /* Active theme's published design is what anonymous visitors see, and its logo */ /* variants are what a design's logo blocks draw. */ /*   * LoginScreen       the PUBLISHED design. Served unauthenticated by */ /*                       GET /auth/login-screen, because it is drawn before */ /*                       anyone signs in. NULL = the stock login screen. */ /*   * LoginScreenDraft  the design being edited. Never served publicly, so an */ /*                       administrator can arrange a page without visitors */ /*                       seeing it half-finished. */ /* Both hold the JSON document defined by @memberjunction/theme-engine */ /* (login-design.ts). The MJ: Themes server entity refuses any document that */ /* normalizing would change, so nothing reaches the public route that the */ /* contract does not name. */ /* ============================================================================= */;

COMMENT ON COLUMN __mj."Theme"."LoginScreen" IS 'The published sign-in page design as JSON (the LoginDesign shape from @memberjunction/theme-engine): layout, background, colors and the blocks in each login-screen region. The default Active theme''s value is served unauthenticated to draw the Explorer login screen. NULL means the stock login screen.';

COMMENT ON COLUMN __mj."Theme"."LoginScreenDraft" IS 'The sign-in page design being edited in Login Studio, as JSON in the same shape as LoginScreen. Never served publicly; publishing copies it to LoginScreen. NULL means no draft.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '29ca2a9c-9f22-4264-b42e-e3cd49224b5b' OR ("EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND "Name" = 'LoginScreen')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('29ca2a9c-9f22-4264-b42e-e3cd49224b5b', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' /* Entity: MJ: Themes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB'), 'LoginScreen', 'Login Screen', 'The published sign-in page design as JSON (the LoginDesign shape from @memberjunction/theme-engine): layout, background, colors and the blocks in each login-screen region. The default Active theme''s value is served unauthenticated to draw the Explorer login screen. NULL means the stock login screen.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '98d424d8-82b8-4ef7-8d51-285b7352e86c' OR ("EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' AND "Name" = 'LoginScreenDraft')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('98d424d8-82b8-4ef7-8d51-285b7352e86c', 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB' /* Entity: MJ: Themes */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'F38184CD-4CCD-4B52-B3BF-2A1F1A92A8EB'), 'LoginScreenDraft', 'Login Screen Draft', 'The sign-in page design being edited in Login Studio, as JSON in the same shape as LoginScreen. Never served publicly; publishing copies it to LoginScreen. NULL means no draft.', 'nvarchar', -1, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Themes
-- Item: Index for Foreign Keys
-- ============================================================


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Themes
-- Item: vwThemes
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Themes
-----               SCHEMA:      __mj
-----               BASE TABLE:  Theme
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwThemes"
AS
SELECT
    t.*
FROM
    "__mj"."Theme" AS t
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
        AND tc.relname = 'vwThemes'
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
                           AND tc.relname = 'vwThemes'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwThemes" CASCADE;
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
GRANT SELECT ON "__mj"."vwThemes" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwThemes" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwThemes" TO "cdp_UI";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Themes
-- Item: spCreateTheme
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR Theme
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateTheme'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateTheme"(
    p_id UUID DEFAULT NULL,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_seeds TEXT DEFAULT NULL,
    p_lightmarkurl_clear boolean DEFAULT false,
    p_lightmarkurl varchar(1000) DEFAULT NULL,
    p_darkmarkurl_clear boolean DEFAULT false,
    p_darkmarkurl varchar(1000) DEFAULT NULL,
    p_wordmarkurl_clear boolean DEFAULT false,
    p_wordmarkurl varchar(1000) DEFAULT NULL,
    p_monochromeurl_clear boolean DEFAULT false,
    p_monochromeurl varchar(1000) DEFAULT NULL,
    p_isdefault BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_overrides_clear boolean DEFAULT false,
    p_overrides TEXT DEFAULT NULL,
    p_customcss_clear boolean DEFAULT false,
    p_customcss TEXT DEFAULT NULL,
    p_loginscreen_clear boolean DEFAULT false,
    p_loginscreen TEXT DEFAULT NULL,
    p_loginscreendraft_clear boolean DEFAULT false,
    p_loginscreendraft TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwThemes" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."Theme"
        (
            "ID",
            "Name",
                "Description",
                "Seeds",
                "LightMarkURL",
                "DarkMarkURL",
                "WordmarkURL",
                "MonochromeURL",
                "IsDefault",
                "Status",
                "Overrides",
                "CustomCSS",
                "LoginScreen",
                "LoginScreenDraft"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_seeds,
                CASE WHEN p_lightmarkurl_clear = true THEN NULL ELSE COALESCE(p_lightmarkurl, NULL) END,
                CASE WHEN p_darkmarkurl_clear = true THEN NULL ELSE COALESCE(p_darkmarkurl, NULL) END,
                CASE WHEN p_wordmarkurl_clear = true THEN NULL ELSE COALESCE(p_wordmarkurl, NULL) END,
                CASE WHEN p_monochromeurl_clear = true THEN NULL ELSE COALESCE(p_monochromeurl, NULL) END,
                COALESCE(p_isdefault, FALSE),
                COALESCE(p_status, 'Active'),
                CASE WHEN p_overrides_clear = true THEN NULL ELSE COALESCE(p_overrides, NULL) END,
                CASE WHEN p_customcss_clear = true THEN NULL ELSE COALESCE(p_customcss, NULL) END,
                CASE WHEN p_loginscreen_clear = true THEN NULL ELSE COALESCE(p_loginscreen, NULL) END,
                CASE WHEN p_loginscreendraft_clear = true THEN NULL ELSE COALESCE(p_loginscreendraft, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwThemes"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateTheme" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateTheme" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Themes
-- Item: spUpdateTheme
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR Theme
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateTheme'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateTheme"(
    p_id UUID,
    p_name varchar(100) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_seeds TEXT DEFAULT NULL,
    p_lightmarkurl_clear boolean DEFAULT false,
    p_lightmarkurl varchar(1000) DEFAULT NULL,
    p_darkmarkurl_clear boolean DEFAULT false,
    p_darkmarkurl varchar(1000) DEFAULT NULL,
    p_wordmarkurl_clear boolean DEFAULT false,
    p_wordmarkurl varchar(1000) DEFAULT NULL,
    p_monochromeurl_clear boolean DEFAULT false,
    p_monochromeurl varchar(1000) DEFAULT NULL,
    p_isdefault BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_overrides_clear boolean DEFAULT false,
    p_overrides TEXT DEFAULT NULL,
    p_customcss_clear boolean DEFAULT false,
    p_customcss TEXT DEFAULT NULL,
    p_loginscreen_clear boolean DEFAULT false,
    p_loginscreen TEXT DEFAULT NULL,
    p_loginscreendraft_clear boolean DEFAULT false,
    p_loginscreendraft TEXT DEFAULT NULL
) RETURNS SETOF "__mj"."vwThemes" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."Theme"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Seeds" = COALESCE(p_seeds, "Seeds"),
        "LightMarkURL" = CASE WHEN p_lightmarkurl_clear = true THEN NULL ELSE COALESCE(p_lightmarkurl, "LightMarkURL") END,
        "DarkMarkURL" = CASE WHEN p_darkmarkurl_clear = true THEN NULL ELSE COALESCE(p_darkmarkurl, "DarkMarkURL") END,
        "WordmarkURL" = CASE WHEN p_wordmarkurl_clear = true THEN NULL ELSE COALESCE(p_wordmarkurl, "WordmarkURL") END,
        "MonochromeURL" = CASE WHEN p_monochromeurl_clear = true THEN NULL ELSE COALESCE(p_monochromeurl, "MonochromeURL") END,
        "IsDefault" = COALESCE(p_isdefault, "IsDefault"),
        "Status" = COALESCE(p_status, "Status"),
        "Overrides" = CASE WHEN p_overrides_clear = true THEN NULL ELSE COALESCE(p_overrides, "Overrides") END,
        "CustomCSS" = CASE WHEN p_customcss_clear = true THEN NULL ELSE COALESCE(p_customcss, "CustomCSS") END,
        "LoginScreen" = CASE WHEN p_loginscreen_clear = true THEN NULL ELSE COALESCE(p_loginscreen, "LoginScreen") END,
        "LoginScreenDraft" = CASE WHEN p_loginscreendraft_clear = true THEN NULL ELSE COALESCE(p_loginscreendraft, "LoginScreenDraft") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwThemes"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateTheme" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateTheme" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the Theme table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_theme"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_theme" ON "__mj"."Theme";

CREATE TRIGGER "trg_update_theme"
BEFORE UPDATE ON "__mj"."Theme"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_theme"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Themes
-- Item: spDeleteTheme
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR Theme
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteTheme'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteTheme"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."Theme"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteTheme" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteTheme" TO "cdp_Integration";
