-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610122148__v6.2.x__AIModelCost_spCreate_PriceTypeID_Default.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- V202610122148__v6.2.x__AIModelCost_spCreate_PriceTypeID_Default.sql — no DDL to translate.
-- CodeGen objects are regenerated natively via `mj codegen` on PG.
-- ╔══ HAND-FINISHED FOR POSTGRESQL ══╗
-- The SQL Server migration drops spCreateAIModelCost so CodeGen recreates it with PriceTypeID
-- optional: a NOT NULL column with a database default becomes a parameter inserted as
-- ISNULL(@PriceTypeID, <default>). On SQL Server, CodeGen knows the default because the
-- schema-to-metadata field sync set EntityField.DefaultValue when V202608301800 added
-- DF_AIModelCost_PriceTypeID.
--
-- On PostgreSQL that field sync never filled in DefaultValue for PriceTypeID: the default was
-- added to an existing column, and it is the only NOT NULL defaulted column in the schema whose
-- DefaultValue is empty. So the bake below came out with a plain `p_pricetypeid` insert, and
-- V202610131859 Metadata_Sync failed on a fresh database with
-- `null value in column "PriceTypeID" of relation "AIModelCost" violates not-null constraint`.
--
-- Two hand edits, both matching what CodeGen produces once the metadata is right:
--   1. Set EntityField.DefaultValue to the value SQL Server's field sync records, so a later
--      PostgreSQL CodeGen run regenerates the same function rather than the broken one.
--   2. In spCreateAIModelCost's INSERT, PriceTypeID uses the empty-UUID / COALESCE fallback that
--      PostgreSQL CodeGen emits for defaulted UUID columns (same shape as p_environmentid and
--      p_sqldialectid in earlier counterparts).
-- ╚══════════════════════════════════╝

UPDATE __mj."EntityField" ef
   SET "DefaultValue" = '(''ECE2BCB7-C854-4BF7-A517-D72793A40652'')'
  FROM __mj."Entity" e
 WHERE e."ID" = ef."EntityID"
   AND e."Name" = 'MJ: AI Model Costs'
   AND ef."Name" = 'PriceTypeID'
   AND COALESCE(TRIM(ef."DefaultValue"), '') = '';


-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Model Costs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_model_cost_model_id"
    ON "__mj"."AIModelCost" ("ModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_model_cost_vendor_id"
    ON "__mj"."AIModelCost" ("VendorID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_model_cost_price_type_id"
    ON "__mj"."AIModelCost" ("PriceTypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_ai_model_cost_unit_type_id"
    ON "__mj"."AIModelCost" ("UnitTypeID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Model Costs
-- Item: vwAIModelCosts
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Costs
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIModelCost
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwAIModelCosts"
AS
SELECT
    a.*,
    MJAIModel_ModelID."Name" AS "Model",
    MJAIVendor_VendorID."Name" AS "Vendor",
    MJAIModelPriceType_PriceTypeID."Name" AS "PriceType",
    MJAIModelPriceUnitType_UnitTypeID."Name" AS "UnitType"
FROM
    "__mj"."AIModelCost" AS a
INNER JOIN
    "__mj"."AIModel" AS MJAIModel_ModelID
  ON
    "a"."ModelID" = MJAIModel_ModelID."ID"
INNER JOIN
    "__mj"."AIVendor" AS MJAIVendor_VendorID
  ON
    "a"."VendorID" = MJAIVendor_VendorID."ID"
INNER JOIN
    "__mj"."AIModelPriceType" AS MJAIModelPriceType_PriceTypeID
  ON
    "a"."PriceTypeID" = MJAIModelPriceType_PriceTypeID."ID"
INNER JOIN
    "__mj"."AIModelPriceUnitType" AS MJAIModelPriceUnitType_UnitTypeID
  ON
    "a"."UnitTypeID" = MJAIModelPriceUnitType_UnitTypeID."ID"
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
        AND tc.relname = 'vwAIModelCosts'
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
                           AND tc.relname = 'vwAIModelCosts'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwAIModelCosts" CASCADE;
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
GRANT SELECT ON "__mj"."vwAIModelCosts" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwAIModelCosts" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwAIModelCosts" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Model Costs
-- Item: spCreateAIModelCost
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR AIModelCost
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateAIModelCost'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateAIModelCost"(
    p_id UUID DEFAULT NULL,
    p_modelid UUID DEFAULT NULL,
    p_vendorid UUID DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_currency char(3) DEFAULT NULL,
    p_pricetypeid UUID DEFAULT NULL,
    p_inputpriceperunit decimal(18, 8) DEFAULT NULL,
    p_outputpriceperunit decimal(18, 8) DEFAULT NULL,
    p_unittypeid UUID DEFAULT NULL,
    p_processingtype varchar(20) DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_cachereadpriceperunit_clear boolean DEFAULT false,
    p_cachereadpriceperunit decimal(18, 8) DEFAULT NULL,
    p_cachewritepriceperunit_clear boolean DEFAULT false,
    p_cachewritepriceperunit decimal(18, 8) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIModelCosts" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."AIModelCost"
        (
            "ID",
            "ModelID",
                "VendorID",
                "StartedAt",
                "EndedAt",
                "Status",
                "Currency",
                "PriceTypeID",
                "InputPricePerUnit",
                "OutputPricePerUnit",
                "UnitTypeID",
                "ProcessingType",
                "Comments",
                "CacheReadPricePerUnit",
                "CacheWritePricePerUnit"
        )
    VALUES
        (
            v_new_id,
            p_modelid,
                p_vendorid,
                CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, NOW()) END,
                CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, NULL) END,
                p_status,
                p_currency,
                CASE WHEN p_pricetypeid = '00000000-0000-0000-0000-000000000000'::UUID THEN 'ECE2BCB7-C854-4BF7-A517-D72793A40652' ELSE COALESCE(p_pricetypeid, 'ECE2BCB7-C854-4BF7-A517-D72793A40652') END,
                p_inputpriceperunit,
                p_outputpriceperunit,
                p_unittypeid,
                p_processingtype,
                CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, NULL) END,
                CASE WHEN p_cachereadpriceperunit_clear = true THEN NULL ELSE COALESCE(p_cachereadpriceperunit, NULL) END,
                CASE WHEN p_cachewritepriceperunit_clear = true THEN NULL ELSE COALESCE(p_cachewritepriceperunit, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwAIModelCosts"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIModelCost" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateAIModelCost" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Model Costs
-- Item: spUpdateAIModelCost
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR AIModelCost
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateAIModelCost'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateAIModelCost"(
    p_id UUID,
    p_modelid UUID DEFAULT NULL,
    p_vendorid UUID DEFAULT NULL,
    p_startedat_clear boolean DEFAULT false,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_endedat_clear boolean DEFAULT false,
    p_endedat TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_currency char(3) DEFAULT NULL,
    p_pricetypeid UUID DEFAULT NULL,
    p_inputpriceperunit decimal(18, 8) DEFAULT NULL,
    p_outputpriceperunit decimal(18, 8) DEFAULT NULL,
    p_unittypeid UUID DEFAULT NULL,
    p_processingtype varchar(20) DEFAULT NULL,
    p_comments_clear boolean DEFAULT false,
    p_comments TEXT DEFAULT NULL,
    p_cachereadpriceperunit_clear boolean DEFAULT false,
    p_cachereadpriceperunit decimal(18, 8) DEFAULT NULL,
    p_cachewritepriceperunit_clear boolean DEFAULT false,
    p_cachewritepriceperunit decimal(18, 8) DEFAULT NULL
) RETURNS SETOF "__mj"."vwAIModelCosts" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."AIModelCost"
    SET
        "ModelID" = COALESCE(p_modelid, "ModelID"),
        "VendorID" = COALESCE(p_vendorid, "VendorID"),
        "StartedAt" = CASE WHEN p_startedat_clear = true THEN NULL ELSE COALESCE(p_startedat, "StartedAt") END,
        "EndedAt" = CASE WHEN p_endedat_clear = true THEN NULL ELSE COALESCE(p_endedat, "EndedAt") END,
        "Status" = COALESCE(p_status, "Status"),
        "Currency" = COALESCE(p_currency, "Currency"),
        "PriceTypeID" = COALESCE(p_pricetypeid, "PriceTypeID"),
        "InputPricePerUnit" = COALESCE(p_inputpriceperunit, "InputPricePerUnit"),
        "OutputPricePerUnit" = COALESCE(p_outputpriceperunit, "OutputPricePerUnit"),
        "UnitTypeID" = COALESCE(p_unittypeid, "UnitTypeID"),
        "ProcessingType" = COALESCE(p_processingtype, "ProcessingType"),
        "Comments" = CASE WHEN p_comments_clear = true THEN NULL ELSE COALESCE(p_comments, "Comments") END,
        "CacheReadPricePerUnit" = CASE WHEN p_cachereadpriceperunit_clear = true THEN NULL ELSE COALESCE(p_cachereadpriceperunit, "CacheReadPricePerUnit") END,
        "CacheWritePricePerUnit" = CASE WHEN p_cachewritepriceperunit_clear = true THEN NULL ELSE COALESCE(p_cachewritepriceperunit, "CacheWritePricePerUnit") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwAIModelCosts"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIModelCost" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateAIModelCost" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the AIModelCost table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_ai_model_cost"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_ai_model_cost" ON "__mj"."AIModelCost";

CREATE TRIGGER "trg_update_ai_model_cost"
BEFORE UPDATE ON "__mj"."AIModelCost"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_ai_model_cost"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: AI Model Costs
-- Item: spDeleteAIModelCost
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR AIModelCost
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteAIModelCost'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteAIModelCost"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."AIModelCost"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIModelCost" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteAIModelCost" TO "cdp_Integration";
