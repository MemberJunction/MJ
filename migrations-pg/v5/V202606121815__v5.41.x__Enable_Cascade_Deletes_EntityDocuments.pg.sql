-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606121815__v5.41.x__Enable_Cascade_Deletes_EntityDocuments.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

/* Migration: Enable Cascade Deletes for MJ: Entity Documents */ /* Description: Setting CascadeDeletes = 1 on Entity Documents so that deleting an */ /*              EntityDocument automatically cleans up its child Entity Record Documents */ /*              (which currently blocks the delete via FK constraint). */ /* Child entities of MJ: Entity Documents: */ /*   - MJ: Entity Record Documents (EntityDocumentID, NOT NULL) -> DELETE cascade */ /* After this UPDATE runs, the next CodeGen run will regenerate spDeleteEntityDocument */ /* to first delete the dependent EntityRecordDocument rows via spDeleteEntityRecordDocument, */ /* then delete the parent EntityDocument row -- all within a single transaction with */ /* proper RecordChanges audit entries. */ /* ============================================================================ */ /* Entity metadata CascadeDeletes flag */ /* ============================================================================ */ /* MJ: Entity Documents */
UPDATE __mj."Entity" SET "CascadeDeletes" = TRUE
WHERE
  "ID" = '22248F34-2837-EF11-86D4-6045BDEE16E6';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Documents
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_type_id"
    ON __mj."EntityDocument" ("TypeID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_entity_id"
    ON __mj."EntityDocument" ("EntityID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_vector_database_id"
    ON __mj."EntityDocument" ("VectorDatabaseID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_template_id"
    ON __mj."EntityDocument" ("TemplateID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_ai_model_id"
    ON __mj."EntityDocument" ("AIModelID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_document_vector_index_id"
    ON __mj."EntityDocument" ("VectorIndexID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Documents
-- Item: vwEntityDocuments
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Documents
-----               SCHEMA:      __mj
-----               BASE TABLE:  EntityDocument
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwEntityDocuments"
AS
SELECT
    e.*,
    MJEntityDocumentType_TypeID."Name" AS "Type",
    MJEntity_EntityID."Name" AS "Entity",
    MJVectorDatabase_VectorDatabaseID."Name" AS "VectorDatabase",
    MJTemplate_TemplateID."Name" AS "Template",
    MJAIModel_AIModelID."Name" AS "AIModel",
    MJVectorIndex_VectorIndexID."Name" AS "VectorIndex"
FROM
    __mj."EntityDocument" AS e
INNER JOIN
    __mj."EntityDocumentType" AS MJEntityDocumentType_TypeID
  ON
    "e"."TypeID" = MJEntityDocumentType_TypeID."ID"
INNER JOIN
    __mj."Entity" AS MJEntity_EntityID
  ON
    "e"."EntityID" = MJEntity_EntityID."ID"
INNER JOIN
    __mj."VectorDatabase" AS MJVectorDatabase_VectorDatabaseID
  ON
    "e"."VectorDatabaseID" = MJVectorDatabase_VectorDatabaseID."ID"
INNER JOIN
    __mj."Template" AS MJTemplate_TemplateID
  ON
    "e"."TemplateID" = MJTemplate_TemplateID."ID"
INNER JOIN
    __mj."AIModel" AS MJAIModel_AIModelID
  ON
    "e"."AIModelID" = MJAIModel_AIModelID."ID"
LEFT OUTER JOIN
    __mj."VectorIndex" AS MJVectorIndex_VectorIndexID
  ON
    "e"."VectorIndexID" = MJVectorIndex_VectorIndexID."ID"
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
    AND tc.relname = 'vwEntityDocuments'
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
    AND tc.relname = 'vwEntityDocuments'
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
        AND tc.relname = 'vwEntityDocuments'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwEntityDocuments" CASCADE;
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
GRANT SELECT ON __mj."vwEntityDocuments" TO "cdp_Integration";
GRANT SELECT ON __mj."vwEntityDocuments" TO "cdp_UI";
GRANT SELECT ON __mj."vwEntityDocuments" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Documents
-- Item: spCreateEntityDocument
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityDocument
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityDocument'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityDocument"(
    p_id uuid DEFAULT NULL,
    p_name text DEFAULT NULL,
    p_typeid uuid DEFAULT NULL,
    p_entityid uuid DEFAULT NULL,
    p_vectordatabaseid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_templateid uuid DEFAULT NULL,
    p_aimodelid uuid DEFAULT NULL,
    p_potentialmatchthreshold numeric(12, 11) DEFAULT NULL,
    p_absolutematchthreshold numeric(12, 11) DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid uuid DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration text DEFAULT NULL
) RETURNS SETOF __mj."vwEntityDocuments" AS $$
DECLARE
    v_new_id uuid;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."EntityDocument"
        (
            "ID",
            "Name",
                "TypeID",
                "EntityID",
                "VectorDatabaseID",
                "Status",
                "TemplateID",
                "AIModelID",
                "PotentialMatchThreshold",
                "AbsoluteMatchThreshold",
                "VectorIndexID",
                "Configuration"
        )
    VALUES
        (
            v_new_id,
            p_name,
                p_typeid,
                p_entityid,
                p_vectordatabaseid,
                COALESCE(p_status, 'Active'),
                p_templateid,
                p_aimodelid,
                COALESCE(p_potentialmatchthreshold, 0.7),
                COALESCE(p_absolutematchthreshold, 0.95),
                CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, NULL) END,
                CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwEntityDocuments"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateEntityDocument" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spCreateEntityDocument" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Documents
-- Item: spUpdateEntityDocument
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityDocument
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityDocument'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityDocument"(
    p_id uuid,
    p_name text DEFAULT NULL,
    p_typeid uuid DEFAULT NULL,
    p_entityid uuid DEFAULT NULL,
    p_vectordatabaseid uuid DEFAULT NULL,
    p_status text DEFAULT NULL,
    p_templateid uuid DEFAULT NULL,
    p_aimodelid uuid DEFAULT NULL,
    p_potentialmatchthreshold numeric(12, 11) DEFAULT NULL,
    p_absolutematchthreshold numeric(12, 11) DEFAULT NULL,
    p_vectorindexid_clear boolean DEFAULT false,
    p_vectorindexid uuid DEFAULT NULL,
    p_configuration_clear boolean DEFAULT false,
    p_configuration text DEFAULT NULL
) RETURNS SETOF __mj."vwEntityDocuments" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."EntityDocument"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "TypeID" = COALESCE(p_typeid, "TypeID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "VectorDatabaseID" = COALESCE(p_vectordatabaseid, "VectorDatabaseID"),
        "Status" = COALESCE(p_status, "Status"),
        "TemplateID" = COALESCE(p_templateid, "TemplateID"),
        "AIModelID" = COALESCE(p_aimodelid, "AIModelID"),
        "PotentialMatchThreshold" = COALESCE(p_potentialmatchthreshold, "PotentialMatchThreshold"),
        "AbsoluteMatchThreshold" = COALESCE(p_absolutematchthreshold, "AbsoluteMatchThreshold"),
        "VectorIndexID" = CASE WHEN p_vectorindexid_clear = true THEN NULL ELSE COALESCE(p_vectorindexid, "VectorIndexID") END,
        "Configuration" = CASE WHEN p_configuration_clear = true THEN NULL ELSE COALESCE(p_configuration, "Configuration") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwEntityDocuments"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityDocument" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityDocument" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityDocument table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_entity_document"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_document" ON __mj."EntityDocument";

CREATE TRIGGER "trg_update_entity_document"
BEFORE UPDATE ON __mj."EntityDocument"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_entity_document"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Documents
-- Item: spDeleteEntityDocument
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityDocument
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityDocument'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityDocument"(
    p_id uuid
) RETURNS TABLE("ID" uuid) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
    v_rec RECORD;
BEGIN
    -- Cascade: Set MJ: Content Sources.EntityDocumentID to NULL
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."ContentSource"
        WHERE "EntityDocumentID" = p_id
    LOOP
        -- Update related record to set FK to NULL
        UPDATE __mj."ContentSource"
        SET "EntityDocumentID" = NULL
        WHERE "ID" = v_rec."ID";
    END LOOP;

        -- Cascade: Delete MJ: Entity Document Runs records via EntityDocumentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."EntityDocumentRun"
        WHERE "EntityDocumentID" = p_id
    LOOP
        PERFORM __mj."spDeleteEntityDocumentRun"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Entity Document Settings records via EntityDocumentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."EntityDocumentSetting"
        WHERE "EntityDocumentID" = p_id
    LOOP
        PERFORM __mj."spDeleteEntityDocumentSetting"(v_rec."ID");
    END LOOP;

        -- Cascade: Delete MJ: Entity Record Documents records via EntityDocumentID
    FOR v_rec IN
        SELECT "ID"
        FROM __mj."EntityRecordDocument"
        WHERE "EntityDocumentID" = p_id
    LOOP
        PERFORM __mj."spDeleteEntityRecordDocument"(v_rec."ID");
    END LOOP;

    
    DELETE FROM __mj."EntityDocument"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::uuid AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocument" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocument" TO "cdp_Developer";
