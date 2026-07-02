-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202606212041__v5.43.x__Record_Process_FieldRules_And_Action_UX_Driver.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

-- ╔══ CONVERSION GAPS — resolve before relying on this migration ══╗
-- UNHANDLED BY THE AST TRANSPILER (1 statement(s)):
--   [1] (parse-error) -- Adding the timestamp here ensures the checksum changes each time so this runs
--   Each statement above was REPORTED, not silently dropped — port it manually.
-- ╚════════════════════════════════════════════════════════════════╝

ALTER TABLE __mj."RecordProcess"
DROP CONSTRAINT IF EXISTS "CK_RecordProcess_WorkType" /* ===================================================================================================== */ /* Record Process: add the 'FieldRules' WorkType (rules-based bulk update), and give Entity Action */ /* Invocations an OPTIONAL pluggable runtime-UX driver so an action can declare a richer invocation */ /* experience (parameter collection / dry-run preview / confirmation / progress) WITHOUT the grid or */ /* toolbar knowing anything operation-specific. The runtime-UX driver is the generic seam that the */ /* rules-based bulk-update "Run Record Process" experience is the first consumer of. */ /* ===================================================================================================== */ /* 1) Extend RecordProcess.WorkType to include 'FieldRules'. CodeGen reads this CHECK constraint to */ /*    regenerate both the TypeScript union and the field's value list, so this is the single source. */;
ALTER TABLE __mj."RecordProcess"
  ADD CONSTRAINT "CK_RecordProcess_WorkType" CHECK ("WorkType" IN ('Action', 'Agent', 'Infer', 'FieldRules'));
ALTER TABLE __mj."EntityActionInvocation"
ADD COLUMN "RuntimeUXDriverClass" VARCHAR(255) NULL /* 2) Optional runtime-UX driver class on an Entity Action Invocation. */;

COMMENT ON COLUMN __mj."EntityActionInvocation"."RuntimeUXDriverClass" IS 'Optional class name of a registered runtime-UX driver component (a BaseEntityActionRuntimeUX subclass resolved via MJGlobal.ClassFactory) that owns this invocation''s interaction — parameter collection, dry-run preview, confirmation, and progress. NULL invokes the action directly with no custom UX. This lets any action opt into a richer, reusable runtime experience while the grid/toolbar stays operation-agnostic.';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '596f0ffe-6e36-4e9b-90d2-eb5bd65933d6' OR ("EntityID" = '35248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'RuntimeUXDriverClass')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('596f0ffe-6e36-4e9b-90d2-eb5bd65933d6', '35248F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entity Action Invocations */, 100016, 'RuntimeUXDriverClass', 'Runtime UX Driver Class', 'Optional class name of a registered runtime-UX driver component (a BaseEntityActionRuntimeUX subclass resolved via MJGlobal.ClassFactory) that owns this invocation''s interaction — parameter collection, dry-run preview, confirmation, and progress. NULL invokes the action directly with no custom UX. This lets any action opt into a richer, reusable runtime experience while the grid/toolbar stays operation-agnostic.', 'nvarchar', 510, 0, 0, TRUE, NULL, FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID d355dd72-601d-4ceb-a7e3-709c2c8b2e98 */
INSERT INTO __mj."EntityFieldValue" (
  "ID",
  "EntityFieldID",
  "Sequence",
  "Value",
  "Code",
  "__mj_CreatedAt",
  "__mj_UpdatedAt"
)
VALUES
  (
    'd355dd72-601d-4ceb-a7e3-709c2c8b2e98',
    '58345D95-711E-470F-BD28-1AA4AD8214D2',
    3,
    'FieldRules',
    'FieldRules',
    NOW(),
    NOW()
  );
/* SQL text to update entity field value sequence */
UPDATE __mj."EntityFieldValue" SET "Sequence" = 4
WHERE
  "ID" = '17B04C7F-47ED-49ED-B92E-C069F2ED620E';

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = FALSE
WHERE
  "ID" = '8BADDA90-4D3C-4D2A-8E7E-52CF83ABBE0D' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "IsNameField" = FALSE
WHERE
  "ID" = '6A5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateIsNameField" = TRUE;
UPDATE __mj."EntityField" SET "UserSearchPredicateAPI" = 'Exact'
WHERE
  "ID" = '7E4C17F0-6F36-EF11-86D4-6045BDEE16E6'
  AND "AutoUpdateUserSearchPredicate" = TRUE;
UPDATE __mj."Entity" SET "AllowUserSearchAPI" = TRUE
WHERE
  "ID" = '35248F34-2837-EF11-86D4-6045BDEE16E6'
  AND "AutoUpdateAllowUserSearchAPI" = TRUE;

/* Set categories for 9 fields */ /* UPDATE Entity Field Category Info MJ: Entity Action Invocations.ID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7B4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Entity Action Invocations.__mj_CreatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1C4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Entity Action Invocations.__mj_UpdatedAt */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '1D4D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Entity Action Invocations.EntityActionID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7C4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Entity Action Invocations.InvocationTypeID */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7D4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Entity Action Invocations.EntityAction */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '8BADDA90-4D3C-4D2A-8E7E-52CF83ABBE0D' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Entity Action Invocations.InvocationType */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '6A5717F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Entity Action Invocations.RuntimeUXDriverClass */
UPDATE __mj."EntityField" SET "Category" = 'Invocation Configuration', "GeneratedFormSection" = 'Category', "ExtendedType" = 'Code', "CodeType" = 'Other'
WHERE
  "ID" = '596F0FFE-6E36-4E9B-90D2-EB5BD65933D6' AND "AutoUpdateCategory" = TRUE;
/* UPDATE Entity Field Category Info MJ: Entity Action Invocations.Status */
UPDATE __mj."EntityField" SET "GeneratedFormSection" = 'Category', "ExtendedType" = NULL, "CodeType" = NULL
WHERE
  "ID" = '7E4C17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Action Invocations
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_action_invocation_entity_action_id"
    ON __mj."EntityActionInvocation" ("EntityActionID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_action_invocation_invocation_type_id"
    ON __mj."EntityActionInvocation" ("InvocationTypeID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Action Invocations
-- Item: vwEntityActionInvocations
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Action Invocations
-----               SCHEMA:      __mj
-----               BASE TABLE:  EntityActionInvocation
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwEntityActionInvocations"
AS
SELECT
    e.*,
    MJEntityAction_EntityActionID."Action" AS "EntityAction",
    MJEntityActionInvocationType_InvocationTypeID."Name" AS "InvocationType"
FROM
    __mj."EntityActionInvocation" AS e
INNER JOIN
    __mj."vwEntityActions" AS MJEntityAction_EntityActionID
  ON
    "e"."EntityActionID" = MJEntityAction_EntityActionID."ID"
INNER JOIN
    __mj."EntityActionInvocationType" AS MJEntityActionInvocationType_InvocationTypeID
  ON
    "e"."InvocationTypeID" = MJEntityActionInvocationType_InvocationTypeID."ID"
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
    AND tc.relname = 'vwEntityActionInvocations'
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
    AND tc.relname = 'vwEntityActionInvocations'
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
        AND tc.relname = 'vwEntityActionInvocations'
        AND tc.relkind IN ('v', 'm')
  );

  DROP VIEW IF EXISTS __mj."vwEntityActionInvocations" CASCADE;
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
GRANT SELECT ON __mj."vwEntityActionInvocations" TO "cdp_Integration";
GRANT SELECT ON __mj."vwEntityActionInvocations" TO "cdp_UI";
GRANT SELECT ON __mj."vwEntityActionInvocations" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Action Invocations
-- Item: spCreateEntityActionInvocation
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityActionInvocation
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityActionInvocation'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spCreateEntityActionInvocation"(
    p_id UUID DEFAULT NULL,
    p_entityactionid UUID DEFAULT NULL,
    p_invocationtypeid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_runtimeuxdriverclass_clear boolean DEFAULT false,
    p_runtimeuxdriverclass varchar(255) DEFAULT NULL
) RETURNS SETOF __mj."vwEntityActionInvocations" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO __mj."EntityActionInvocation"
        (
            "ID",
            "EntityActionID",
                "InvocationTypeID",
                "Status",
                "RuntimeUXDriverClass"
        )
    VALUES
        (
            v_new_id,
            p_entityactionid,
                p_invocationtypeid,
                COALESCE(p_status, 'Pending'),
                CASE WHEN p_runtimeuxdriverclass_clear = true THEN NULL ELSE COALESCE(p_runtimeuxdriverclass, NULL) END
        )
    ;

    RETURN QUERY
    SELECT * FROM __mj."vwEntityActionInvocations"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spCreateEntityActionInvocation" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spCreateEntityActionInvocation" TO "cdp_Developer";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Action Invocations
-- Item: spUpdateEntityActionInvocation
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityActionInvocation
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityActionInvocation'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityActionInvocation"(
    p_id UUID,
    p_entityactionid UUID DEFAULT NULL,
    p_invocationtypeid UUID DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_runtimeuxdriverclass_clear boolean DEFAULT false,
    p_runtimeuxdriverclass varchar(255) DEFAULT NULL
) RETURNS SETOF __mj."vwEntityActionInvocations" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE __mj."EntityActionInvocation"
    SET
        "EntityActionID" = COALESCE(p_entityactionid, "EntityActionID"),
        "InvocationTypeID" = COALESCE(p_invocationtypeid, "InvocationTypeID"),
        "Status" = COALESCE(p_status, "Status"),
        "RuntimeUXDriverClass" = CASE WHEN p_runtimeuxdriverclass_clear = true THEN NULL ELSE COALESCE(p_runtimeuxdriverclass, "RuntimeUXDriverClass") END
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM __mj."vwEntityActionInvocations"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityActionInvocation" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityActionInvocation" TO "cdp_Developer";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityActionInvocation table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION __mj."fn_trg_update_entity_action_invocation"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_action_invocation" ON __mj."EntityActionInvocation";

CREATE TRIGGER "trg_update_entity_action_invocation"
BEFORE UPDATE ON __mj."EntityActionInvocation"
FOR EACH ROW
EXECUTE FUNCTION __mj."fn_trg_update_entity_action_invocation"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Action Invocations
-- Item: spDeleteEntityActionInvocation
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityActionInvocation
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityActionInvocation'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityActionInvocation"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM __mj."EntityActionInvocation"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionInvocation" TO "cdp_Integration";
GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityActionInvocation" TO "cdp_Developer";
