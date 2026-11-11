-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611081614__v6.3.x__QueryField_InAllBranchVariants.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."QueryField"
ADD COLUMN "InAllBranchVariants" BOOLEAN NOT NULL DEFAULT TRUE /* Migration: Add InAllBranchVariants column to QueryField */ /* Tracks whether an output field is returned by every branch variant of a templated query */ /* (QueryTemplate.BranchVariants). Fields present in all branches are emitted as required */ /* properties on generated TypeScript row interfaces; branch-specific fields are emitted */ /* as optional (`fieldName?: T`). */;

COMMENT ON COLUMN __mj."QueryField"."InAllBranchVariants" IS 'True when this output field is returned by every branch variant of a templated query (or when the query does not use template branches). False when the field is only returned by a subset of conditional {% if %} branches, so generated TypeScript row interfaces mark the property optional.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd4028ec0-aa67-4a1f-b6a1-3c2bd831449a' OR ("EntityID" = '19248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'InAllBranchVariants')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('d4028ec0-aa67-4a1f-b6a1-3c2bd831449a', '19248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Query Fields */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '19248F34-2837-EF11-86D4-6045BDEE16E6'), 'InAllBranchVariants', 'In All Branch Variants', 'True when this output field is returned by every branch variant of a templated query (or when the query does not use template branches). False when the field is only returned by a subset of conditional {% if %} branches, so generated TypeScript row interfaces mark the property optional.', 'bit', 1, 1, 0, FALSE, '((1))', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Query Fields
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_field_query_id"
    ON "__mj"."QueryField" ("QueryID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_field_source_entity_id"
    ON "__mj"."QueryField" ("SourceEntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_query_field_source_entity_field_id"
    ON "__mj"."QueryField" ("SourceEntityFieldID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Query Fields
-- Item: vwQueryFields
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Query Fields
-----               SCHEMA:      __mj
-----               BASE TABLE:  QueryField
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwQueryFields"
AS
SELECT
    q.*,
    MJQuery_QueryID."Name" AS "Query",
    MJEntity_SourceEntityID."Name" AS "SourceEntity",
    MJEntityField_SourceEntityFieldID."Name" AS "SourceEntityField"
FROM
    "__mj"."QueryField" AS q
LEFT OUTER JOIN
    "__mj"."Query" AS MJQuery_QueryID
  ON
    "q"."QueryID" = MJQuery_QueryID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_SourceEntityID
  ON
    "q"."SourceEntityID" = MJEntity_SourceEntityID."ID"
LEFT OUTER JOIN
    "__mj"."EntityField" AS MJEntityField_SourceEntityFieldID
  ON
    "q"."SourceEntityFieldID" = MJEntityField_SourceEntityFieldID."ID"
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
        AND tc.relname = 'vwQueryFields'
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
                           AND tc.relname = 'vwQueryFields'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwQueryFields" CASCADE;
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
GRANT SELECT ON "__mj"."vwQueryFields" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwQueryFields" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwQueryFields" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Query Fields
-- Item: spCreateQueryField
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR QueryField
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateQueryField'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateQueryField"(
    p_id UUID DEFAULT NULL,
    p_queryid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_sqlbasetype varchar(50) DEFAULT NULL,
    p_sqlfulltype varchar(100) DEFAULT NULL,
    p_sourceentityid_clear boolean DEFAULT false,
    p_sourceentityid UUID DEFAULT NULL,
    p_sourcefieldname_clear boolean DEFAULT false,
    p_sourcefieldname varchar(255) DEFAULT NULL,
    p_iscomputed BOOLEAN DEFAULT NULL,
    p_computationdescription_clear boolean DEFAULT false,
    p_computationdescription TEXT DEFAULT NULL,
    p_issummary BOOLEAN DEFAULT NULL,
    p_summarydescription_clear boolean DEFAULT false,
    p_summarydescription TEXT DEFAULT NULL,
    p_detectionmethod varchar(50) DEFAULT NULL,
    p_autodetectconfidencescore_clear boolean DEFAULT false,
    p_autodetectconfidencescore decimal(3, 2) DEFAULT NULL,
    p_sourceentityfieldid_clear boolean DEFAULT false,
    p_sourceentityfieldid UUID DEFAULT NULL,
    p_isnullable_clear boolean DEFAULT false,
    p_isnullable BOOLEAN DEFAULT NULL,
    p_sourceobjectname_clear boolean DEFAULT false,
    p_sourceobjectname varchar(500) DEFAULT NULL,
    p_inallbranchvariants BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwQueryFields" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."QueryField"
        (
            "ID",
            "QueryID",
                "Name",
                "Description",
                "Sequence",
                "SQLBaseType",
                "SQLFullType",
                "SourceEntityID",
                "SourceFieldName",
                "IsComputed",
                "ComputationDescription",
                "IsSummary",
                "SummaryDescription",
                "DetectionMethod",
                "AutoDetectConfidenceScore",
                "SourceEntityFieldID",
                "IsNullable",
                "SourceObjectName",
                "InAllBranchVariants"
        )
    VALUES
        (
            v_new_id,
            p_queryid,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_sequence,
                p_sqlbasetype,
                p_sqlfulltype,
                CASE WHEN p_sourceentityid_clear = true THEN NULL ELSE COALESCE(p_sourceentityid, NULL) END,
                CASE WHEN p_sourcefieldname_clear = true THEN NULL ELSE COALESCE(p_sourcefieldname, NULL) END,
                COALESCE(p_iscomputed, FALSE),
                CASE WHEN p_computationdescription_clear = true THEN NULL ELSE COALESCE(p_computationdescription, NULL) END,
                COALESCE(p_issummary, FALSE),
                CASE WHEN p_summarydescription_clear = true THEN NULL ELSE COALESCE(p_summarydescription, NULL) END,
                COALESCE(p_detectionmethod, 'Manual'),
                CASE WHEN p_autodetectconfidencescore_clear = true THEN NULL ELSE COALESCE(p_autodetectconfidencescore, NULL) END,
                CASE WHEN p_sourceentityfieldid_clear = true THEN NULL ELSE COALESCE(p_sourceentityfieldid, NULL) END,
                CASE WHEN p_isnullable_clear = true THEN NULL ELSE COALESCE(p_isnullable, NULL) END,
                CASE WHEN p_sourceobjectname_clear = true THEN NULL ELSE COALESCE(p_sourceobjectname, NULL) END,
                COALESCE(p_inallbranchvariants, TRUE)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwQueryFields"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateQueryField" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateQueryField" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Query Fields
-- Item: spUpdateQueryField
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR QueryField
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateQueryField'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateQueryField"(
    p_id UUID,
    p_queryid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_sqlbasetype varchar(50) DEFAULT NULL,
    p_sqlfulltype varchar(100) DEFAULT NULL,
    p_sourceentityid_clear boolean DEFAULT false,
    p_sourceentityid UUID DEFAULT NULL,
    p_sourcefieldname_clear boolean DEFAULT false,
    p_sourcefieldname varchar(255) DEFAULT NULL,
    p_iscomputed BOOLEAN DEFAULT NULL,
    p_computationdescription_clear boolean DEFAULT false,
    p_computationdescription TEXT DEFAULT NULL,
    p_issummary BOOLEAN DEFAULT NULL,
    p_summarydescription_clear boolean DEFAULT false,
    p_summarydescription TEXT DEFAULT NULL,
    p_detectionmethod varchar(50) DEFAULT NULL,
    p_autodetectconfidencescore_clear boolean DEFAULT false,
    p_autodetectconfidencescore decimal(3, 2) DEFAULT NULL,
    p_sourceentityfieldid_clear boolean DEFAULT false,
    p_sourceentityfieldid UUID DEFAULT NULL,
    p_isnullable_clear boolean DEFAULT false,
    p_isnullable BOOLEAN DEFAULT NULL,
    p_sourceobjectname_clear boolean DEFAULT false,
    p_sourceobjectname varchar(500) DEFAULT NULL,
    p_inallbranchvariants BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwQueryFields" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."QueryField"
    SET
        "QueryID" = COALESCE(p_queryid, "QueryID"),
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "SQLBaseType" = COALESCE(p_sqlbasetype, "SQLBaseType"),
        "SQLFullType" = COALESCE(p_sqlfulltype, "SQLFullType"),
        "SourceEntityID" = CASE WHEN p_sourceentityid_clear = true THEN NULL ELSE COALESCE(p_sourceentityid, "SourceEntityID") END,
        "SourceFieldName" = CASE WHEN p_sourcefieldname_clear = true THEN NULL ELSE COALESCE(p_sourcefieldname, "SourceFieldName") END,
        "IsComputed" = COALESCE(p_iscomputed, "IsComputed"),
        "ComputationDescription" = CASE WHEN p_computationdescription_clear = true THEN NULL ELSE COALESCE(p_computationdescription, "ComputationDescription") END,
        "IsSummary" = COALESCE(p_issummary, "IsSummary"),
        "SummaryDescription" = CASE WHEN p_summarydescription_clear = true THEN NULL ELSE COALESCE(p_summarydescription, "SummaryDescription") END,
        "DetectionMethod" = COALESCE(p_detectionmethod, "DetectionMethod"),
        "AutoDetectConfidenceScore" = CASE WHEN p_autodetectconfidencescore_clear = true THEN NULL ELSE COALESCE(p_autodetectconfidencescore, "AutoDetectConfidenceScore") END,
        "SourceEntityFieldID" = CASE WHEN p_sourceentityfieldid_clear = true THEN NULL ELSE COALESCE(p_sourceentityfieldid, "SourceEntityFieldID") END,
        "IsNullable" = CASE WHEN p_isnullable_clear = true THEN NULL ELSE COALESCE(p_isnullable, "IsNullable") END,
        "SourceObjectName" = CASE WHEN p_sourceobjectname_clear = true THEN NULL ELSE COALESCE(p_sourceobjectname, "SourceObjectName") END,
        "InAllBranchVariants" = COALESCE(p_inallbranchvariants, "InAllBranchVariants")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwQueryFields"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateQueryField" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateQueryField" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the QueryField table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_query_field"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_query_field" ON "__mj"."QueryField";

CREATE TRIGGER "trg_update_query_field"
BEFORE UPDATE ON "__mj"."QueryField"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_query_field"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Query Fields
-- Item: spDeleteQueryField
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR QueryField
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteQueryField'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteQueryField"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."QueryField"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteQueryField" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteQueryField" TO "cdp_Integration";
