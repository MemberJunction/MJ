-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611110215__v6.3.x__CompanyIntegrationRecordMap_Origin.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."CompanyIntegrationRecordMap"
  ADD COLUMN "Origin" VARCHAR(20) NOT NULL DEFAULT 'Created' CONSTRAINT "CK_CompanyIntegrationRecordMap_Origin" CHECK ("Origin" IN ('Created', 'Adopted'))
 /* #3528 — record whether an integration CREATED the MJ row a record map points at, or ADOPTED a row that already */ /* existed (matched by key fields or loaded by primary key). The orphan sweep never hard-deletes an adopted row: the */ /* integration did not create it, so a source deletion is no proof it may be removed. */ /* Existing rows default to 'Created', which keeps their behaviour exactly as before this column existed. */;

COMMENT ON COLUMN __mj."CompanyIntegrationRecordMap"."Origin" IS 'How the integration came to map this MJ row: Created when the sync inserted the row, Adopted when the row already existed and the sync matched it by key fields or primary key. The orphan sweep never hard-deletes an Adopted row; under HardDelete it archives the row when the entity has integration tombstone columns and otherwise leaves it with a warning.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1cdba536-0305-4ddc-8fc4-7dad97bbe35c' OR ("EntityID" = '16248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Origin')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('1cdba536-0305-4ddc-8fc4-7dad97bbe35c', '16248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Company Integration Record Maps */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '16248F34-2837-EF11-86D4-6045BDEE16E6'), 'Origin', 'Origin', 'How the integration came to map this MJ row: Created when the sync inserted the row, Adopted when the row already existed and the sync matched it by key fields or primary key. The orphan sweep never hard-deletes an Adopted row; under HardDelete it archives the row when the entity has integration tombstone columns and otherwise leaves it with a warning.', 'nvarchar', 40, 0, 0, FALSE, 'Created', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 072783e6-30a8-4c19-a1d7-e5bf8f8e0686 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '072783e6-30a8-4c19-a1d7-e5bf8f8e0686',
    '1CDBA536-0305-4DDC-8FC4-7DAD97BBE35C',
    1,
    'Adopted',
    'Adopted',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 315e63d5-e2b5-4c86-bc5d-7b9a9712b0e3 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "Source",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    '315e63d5-e2b5-4c86-bc5d-7b9a9712b0e3',
    '1CDBA536-0305-4DDC-8FC4-7DAD97BBE35C',
    2,
    'Created',
    'Created',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 1CDBA536-0305-4DDC-8FC4-7DAD97BBE35C */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '1CDBA536-0305-4DDC-8FC4-7DAD97BBE35C';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Record Maps
-- Item: Index for Foreign Keys
-- ============================================================
-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'CompanyIntegrationRecordMap'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'CompanyIntegrationID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_company_integration_record_map_company_integra"
            ON "__mj"."CompanyIntegrationRecordMap" ("CompanyIntegrationID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'CompanyIntegrationRecordMap'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'EntityID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_company_integration_record_map_entity_id"
            ON "__mj"."CompanyIntegrationRecordMap" ("EntityID");
    END IF;
END
$$;

-- Skipped when another non-partial index already leads with the column.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_index ix
        INNER JOIN pg_class t ON t.oid = ix.indrelid
        INNER JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = '__mj'
          AND t.relname = 'CompanyIntegrationRecordMap'
          AND ix.indpred IS NULL
          AND ix.indnkeyatts >= 1
              AND ix.indkey[0] = (SELECT a.attnum FROM pg_attribute a WHERE a.attrelid = t.oid AND a.attname = 'EntityRecordID')
    ) THEN
        CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_company_integration_record_map_entity_record_i"
            ON "__mj"."CompanyIntegrationRecordMap" ("EntityRecordID");
    END IF;
END
$$;

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Record Maps
-- Item: vwCompanyIntegrationRecordMaps
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Company Integration Record Maps
-----               SCHEMA:      __mj
-----               BASE TABLE:  CompanyIntegrationRecordMap
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwCompanyIntegrationRecordMaps"
AS
SELECT
    c.*,
    MJCompanyIntegration_CompanyIntegrationID."Name" AS "CompanyIntegration",
    MJEntity_EntityID."Name" AS "Entity"
FROM
    "__mj"."CompanyIntegrationRecordMap" AS c
LEFT OUTER JOIN
    "__mj"."CompanyIntegration" AS MJCompanyIntegration_CompanyIntegrationID
  ON
    "c"."CompanyIntegrationID" = MJCompanyIntegration_CompanyIntegrationID."ID"
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "c"."EntityID" = MJEntity_EntityID."ID"
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
        AND tc.relname = 'vwCompanyIntegrationRecordMaps'
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
                           AND tc.relname = 'vwCompanyIntegrationRecordMaps'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwCompanyIntegrationRecordMaps" CASCADE;
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
GRANT SELECT ON "__mj"."vwCompanyIntegrationRecordMaps" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwCompanyIntegrationRecordMaps" TO "cdp_Integration";
GRANT SELECT ON "__mj"."vwCompanyIntegrationRecordMaps" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Record Maps
-- Item: spCreateCompanyIntegrationRecordMap
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR CompanyIntegrationRecordMap
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateCompanyIntegrationRecordMap'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateCompanyIntegrationRecordMap"(
    p_id UUID DEFAULT NULL,
    p_companyintegrationid UUID DEFAULT NULL,
    p_externalsystemrecordid varchar(750) DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_entityrecordid varchar(750) DEFAULT NULL,
    p_origin varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwCompanyIntegrationRecordMaps" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."CompanyIntegrationRecordMap"
        (
            "ID",
            "CompanyIntegrationID",
                "ExternalSystemRecordID",
                "EntityID",
                "EntityRecordID",
                "Origin"
        )
    VALUES
        (
            v_new_id,
            p_companyintegrationid,
                p_externalsystemrecordid,
                p_entityid,
                p_entityrecordid,
                COALESCE(p_origin, 'Created')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwCompanyIntegrationRecordMaps"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCompanyIntegrationRecordMap" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateCompanyIntegrationRecordMap" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Record Maps
-- Item: spUpdateCompanyIntegrationRecordMap
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR CompanyIntegrationRecordMap
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateCompanyIntegrationRecordMap'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateCompanyIntegrationRecordMap"(
    p_id UUID,
    p_companyintegrationid UUID DEFAULT NULL,
    p_externalsystemrecordid varchar(750) DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_entityrecordid varchar(750) DEFAULT NULL,
    p_origin varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwCompanyIntegrationRecordMaps" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."CompanyIntegrationRecordMap"
    SET
        "CompanyIntegrationID" = COALESCE(p_companyintegrationid, "CompanyIntegrationID"),
        "ExternalSystemRecordID" = COALESCE(p_externalsystemrecordid, "ExternalSystemRecordID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "EntityRecordID" = COALESCE(p_entityrecordid, "EntityRecordID"),
        "Origin" = COALESCE(p_origin, "Origin"),
        "__mj_UpdatedAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwCompanyIntegrationRecordMaps"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCompanyIntegrationRecordMap" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateCompanyIntegrationRecordMap" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the CompanyIntegrationRecordMap table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_company_integration_record_map"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_company_integration_record_map" ON "__mj"."CompanyIntegrationRecordMap";

CREATE TRIGGER "trg_update_company_integration_record_map"
BEFORE UPDATE ON "__mj"."CompanyIntegrationRecordMap"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_company_integration_record_map"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Company Integration Record Maps
-- Item: spDeleteCompanyIntegrationRecordMap
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR CompanyIntegrationRecordMap
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteCompanyIntegrationRecordMap'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteCompanyIntegrationRecordMap"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."CompanyIntegrationRecordMap"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCompanyIntegrationRecordMap" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteCompanyIntegrationRecordMap" TO "cdp_Developer";
