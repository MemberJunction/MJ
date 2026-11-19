-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202611062303__v6.3.x__EntityFieldValue_OrganicKey_Source.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."EntityFieldValue"
  ADD COLUMN "Source" VARCHAR(20) NOT NULL DEFAULT 'Manual' CONSTRAINT "CK_EntityFieldValue_Source" CHECK ("Source" IN ('Check', 'Config', 'Manual'))
 /* Migration: record where each EntityFieldValue and EntityOrganicKey row came from (#4535) */ /* CodeGen writes value lists and organic keys from two places: CHECK constraints (value lists only) */ /* and the additionalSchemaInfo config file. People also create both by hand. Until now the rows */ /* looked the same whatever their origin, so CodeGen could not remove what the config file stopped */ /* declaring without risking rows someone built by hand. The new Source column records the origin; */ /* CodeGen stamps it on every row it writes and only ever retracts rows whose Source is 'Config'. */ /* Backfill: */ /*   * EntityFieldValue rows on a field that has a column-level CHECK constraint become 'Check'. */ /*     CodeGen's CHECK pass is the only writer of value lists for such fields. */ /*   * Every other existing row, in both tables, becomes 'Manual' through the column default. The */ /*     origin of those rows cannot be told apart after the fact, and 'Manual' rows are never */ /*     retracted. CodeGen re-stamps a row as 'Config' when the config file still declares it. */;
ALTER TABLE __mj."EntityOrganicKey"
  ADD COLUMN "Source" VARCHAR(20) NOT NULL DEFAULT 'Manual' CONSTRAINT "CK_EntityOrganicKey_Source" CHECK ("Source" IN ('Config', 'Manual'));

UPDATE __mj."EntityFieldValue" SET "Source" = 'Check'
WHERE
  "EntityFieldID" IN (
    SELECT
      "EntityFieldID"
    FROM __mj."vwEntityFieldsWithCheckConstraints"
    WHERE
      NOT "EntityFieldID" IS NULL
  );

COMMENT ON COLUMN __mj."EntityFieldValue"."Source" IS 'Where this value came from. Check = parsed from the column''s CHECK constraint by CodeGen. Config = declared in the additionalSchemaInfo file and written by CodeGen. Manual = entered by a person or by any other process. CodeGen removes Config rows the file no longer declares (when retractRemovedSoftKeys is on) and never removes Manual rows.';

COMMENT ON COLUMN __mj."EntityOrganicKey"."Source" IS 'Where this organic key came from. Config = declared in the additionalSchemaInfo file and written by CodeGen. Manual = created by a person or by any other process. CodeGen removes Config keys the file no longer declares, with their related entities and unused bridge views (when retractRemovedSoftKeys is on), and never removes Manual keys.';

-- ╔══ HAND-FINISHED FOR POSTGRESQL: app-owned vwEntityFieldValues ══╗
-- MJ: Entity Field Values owns its base view (BaseViewGenerated = 0). The SQL Server migration ends
-- with EXEC sp_refreshview 'vwEntityFieldValues' so its efv.* picks up Source ("refresh custom base
-- views before entity field sync so new columns are not pruned"). The converter dropped that call
-- silently, and PostgreSQL's view has an explicit column list frozen at CREATE, so without this
-- block the view never gains Source and R__RefreshMetadata deletes the EntityField row this file
-- inserts for it (observed on the first fresh-DB gate run — DEPLOYMENT.md "App-owned base views").
-- CREATE OR REPLACE may only append columns, so Source goes last (on SQL Server it follows
-- __mj_UpdatedAt inside efv.*); the rest of the definition is the current PostgreSQL view, unchanged.
-- ╚══════════════════════════════════════════════════════════════════╝
CREATE OR REPLACE VIEW __mj."vwEntityFieldValues" AS
 SELECT efv."ID",
    efv."EntityFieldID",
    efv."Sequence",
    efv."Value",
    efv."Code",
    efv."Description",
    efv."__mj_CreatedAt",
    efv."__mj_UpdatedAt",
    ef."Name" AS "EntityField",
    ef."Entity",
    ef."EntityID",
    efv."Source"
   FROM __mj."EntityFieldValue" efv
     JOIN __mj."vwEntityFields" ef ON efv."EntityFieldID" = ef."ID";


DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '41c59d69-291c-429b-a1b6-857a74b5c743' OR ("EntityID" = 'FC238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Source')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('41c59d69-291c-429b-a1b6-857a74b5c743', 'FC238F34-2837-EF11-86D4-6045BDEE16E6' /* Entity: MJ: Entity Field Values */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = 'FC238F34-2837-EF11-86D4-6045BDEE16E6'), 'Source', 'Source', 'Where this value came from. Check = parsed from the column''s CHECK constraint by CodeGen. Config = declared in the additionalSchemaInfo file and written by CodeGen. Manual = entered by a person or by any other process. CodeGen removes Config rows the file no longer declares (when retractRemovedSoftKeys is on) and never removes Manual rows.', 'nvarchar', 40, 0, 0, FALSE, 'Manual', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e14359a0-8ce8-4496-88c2-2ab6621acc2b' OR ("EntityID" = '03716AC0-1509-471C-9159-C67D1BE6971E' AND "Name" = 'Source')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('e14359a0-8ce8-4496-88c2-2ab6621acc2b', '03716AC0-1509-471C-9159-C67D1BE6971E' /* Entity: MJ: Entity Organic Keys */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '03716AC0-1509-471C-9159-C67D1BE6971E'), 'Source', 'Source', 'Where this organic key came from. Config = declared in the additionalSchemaInfo file and written by CodeGen. Manual = created by a person or by any other process. CodeGen removes Config keys the file no longer declares, with their related entities and unused bridge views (when retractRemovedSoftKeys is on), and never removes Manual keys.', 'nvarchar', 40, 0, 0, FALSE, 'Manual', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID a1f00172-2277-436a-a3ef-a26a039a636d */
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
    'a1f00172-2277-436a-a3ef-a26a039a636d',
    '41C59D69-291C-429B-A1B6-857A74B5C743',
    1,
    'Check',
    'Check',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 6481d681-05a4-47f2-8fcc-c4f22bf5c889 */
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
    '6481d681-05a4-47f2-8fcc-c4f22bf5c889',
    '41C59D69-291C-429B-A1B6-857A74B5C743',
    2,
    'Config',
    'Config',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 21a59852-c4cc-4de9-a8a9-a9e7c1cf874b */
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
    '21a59852-c4cc-4de9-a8a9-a9e7c1cf874b',
    '41C59D69-291C-429B-A1B6-857A74B5C743',
    3,
    'Manual',
    'Manual',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 41C59D69-291C-429B-A1B6-857A74B5C743 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '41C59D69-291C-429B-A1B6-857A74B5C743';
/* SQL text to insert entity field value with ID 873b75d3-2b61-4e0b-94cc-7f4f8699fb41 */
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
    '873b75d3-2b61-4e0b-94cc-7f4f8699fb41',
    'E14359A0-8CE8-4496-88C2-2AB6621ACC2B',
    1,
    'Config',
    'Config',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 2bcc2615-f7f9-4db7-ad5b-5339c4a74187 */
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
    '2bcc2615-f7f9-4db7-ad5b-5339c4a74187',
    'E14359A0-8CE8-4496-88C2-2AB6621ACC2B',
    2,
    'Manual',
    'Manual',
    'Check',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID E14359A0-8CE8-4496-88C2-2AB6621ACC2B */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = 'E14359A0-8CE8-4496-88C2-2AB6621ACC2B';

-- Flush any pending deferred trigger events from prior DML so the index DDL below can proceed.
SET CONSTRAINTS ALL IMMEDIATE;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = '__mj' AND tablename = 'EntityFieldValue' AND indexname = 'IDX_AUTO_MJ_FKEY_EntityFieldValue_EntityFieldID') THEN
    CREATE INDEX "IDX_AUTO_MJ_FKEY_EntityFieldValue_EntityFieldID" ON __mj."EntityFieldValue"("EntityFieldID");
  END IF;
END $$;

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Field Values
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_field_value_entity_field_id"
    ON "__mj"."EntityFieldValue" ("EntityFieldID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Field Values
-- Item: Permissions for vwEntityFieldValues
-- ============================================================
GRANT SELECT ON "__mj"."vwEntityFieldValues" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwEntityFieldValues" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwEntityFieldValues" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Field Values
-- Item: spCreateEntityFieldValue
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityFieldValue
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityFieldValue'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateEntityFieldValue"(
    p_id UUID DEFAULT NULL,
    p_entityfieldid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_value varchar(255) DEFAULT NULL,
    p_code_clear boolean DEFAULT false,
    p_code varchar(50) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityFieldValues" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."EntityFieldValue"
        (
            "ID",
            "EntityFieldID",
                "Sequence",
                "Value",
                "Code",
                "Description",
                "Source"
        )
    VALUES
        (
            v_new_id,
            p_entityfieldid,
                p_sequence,
                p_value,
                CASE WHEN p_code_clear = true THEN NULL ELSE COALESCE(p_code, NULL) END,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                COALESCE(p_source, 'Manual')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityFieldValues"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Field Values
-- Item: spUpdateEntityFieldValue
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityFieldValue
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityFieldValue'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateEntityFieldValue"(
    p_id UUID,
    p_entityfieldid UUID DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_value varchar(255) DEFAULT NULL,
    p_code_clear boolean DEFAULT false,
    p_code varchar(50) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityFieldValues" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."EntityFieldValue"
    SET
        "EntityFieldID" = COALESCE(p_entityfieldid, "EntityFieldID"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "Value" = COALESCE(p_value, "Value"),
        "Code" = CASE WHEN p_code_clear = true THEN NULL ELSE COALESCE(p_code, "Code") END,
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "Source" = COALESCE(p_source, "Source")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityFieldValues"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;



------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityFieldValue table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_entity_field_value"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_field_value" ON "__mj"."EntityFieldValue";

CREATE TRIGGER "trg_update_entity_field_value"
BEFORE UPDATE ON "__mj"."EntityFieldValue"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_entity_field_value"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Field Values
-- Item: spDeleteEntityFieldValue
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityFieldValue
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityFieldValue'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteEntityFieldValue"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."EntityFieldValue"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityFieldValue" TO "cdp_Developer";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Organic Keys
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_entity_organic_key_entity_id"
    ON "__mj"."EntityOrganicKey" ("EntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Organic Keys
-- Item: vwEntityOrganicKeys
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Entity Organic Keys
-----               SCHEMA:      __mj
-----               BASE TABLE:  EntityOrganicKey
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwEntityOrganicKeys"
AS
SELECT
    e.*,
    MJEntity_EntityID."Name" AS "Entity"
FROM
    "__mj"."EntityOrganicKey" AS e
LEFT OUTER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "e"."EntityID" = MJEntity_EntityID."ID"
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
        AND tc.relname = 'vwEntityOrganicKeys'
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
                           AND tc.relname = 'vwEntityOrganicKeys'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwEntityOrganicKeys" CASCADE;
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
GRANT SELECT ON "__mj"."vwEntityOrganicKeys" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwEntityOrganicKeys" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwEntityOrganicKeys" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Organic Keys
-- Item: spCreateEntityOrganicKey
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR EntityOrganicKey
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateEntityOrganicKey'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateEntityOrganicKey"(
    p_id UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_matchfieldnames varchar(500) DEFAULT NULL,
    p_normalizationstrategy varchar(50) DEFAULT NULL,
    p_customnormalizationexpression_clear boolean DEFAULT false,
    p_customnormalizationexpression TEXT DEFAULT NULL,
    p_autocreaterelatedviewonform BOOLEAN DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityOrganicKeys" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."EntityOrganicKey"
        (
            "ID",
            "EntityID",
                "Name",
                "Description",
                "MatchFieldNames",
                "NormalizationStrategy",
                "CustomNormalizationExpression",
                "AutoCreateRelatedViewOnForm",
                "Sequence",
                "Status",
                "Source"
        )
    VALUES
        (
            v_new_id,
            p_entityid,
                p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                p_matchfieldnames,
                COALESCE(p_normalizationstrategy, 'LowerCaseTrim'),
                CASE WHEN p_customnormalizationexpression_clear = true THEN NULL ELSE COALESCE(p_customnormalizationexpression, NULL) END,
                COALESCE(p_autocreaterelatedviewonform, FALSE),
                COALESCE(p_sequence, 0),
                COALESCE(p_status, 'Active'),
                COALESCE(p_source, 'Manual')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityOrganicKeys"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityOrganicKey" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateEntityOrganicKey" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Organic Keys
-- Item: spUpdateEntityOrganicKey
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR EntityOrganicKey
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateEntityOrganicKey'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateEntityOrganicKey"(
    p_id UUID,
    p_entityid UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_matchfieldnames varchar(500) DEFAULT NULL,
    p_normalizationstrategy varchar(50) DEFAULT NULL,
    p_customnormalizationexpression_clear boolean DEFAULT false,
    p_customnormalizationexpression TEXT DEFAULT NULL,
    p_autocreaterelatedviewonform BOOLEAN DEFAULT NULL,
    p_sequence int DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_source varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwEntityOrganicKeys" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."EntityOrganicKey"
    SET
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "MatchFieldNames" = COALESCE(p_matchfieldnames, "MatchFieldNames"),
        "NormalizationStrategy" = COALESCE(p_normalizationstrategy, "NormalizationStrategy"),
        "CustomNormalizationExpression" = CASE WHEN p_customnormalizationexpression_clear = true THEN NULL ELSE COALESCE(p_customnormalizationexpression, "CustomNormalizationExpression") END,
        "AutoCreateRelatedViewOnForm" = COALESCE(p_autocreaterelatedviewonform, "AutoCreateRelatedViewOnForm"),
        "Sequence" = COALESCE(p_sequence, "Sequence"),
        "Status" = COALESCE(p_status, "Status"),
        "Source" = COALESCE(p_source, "Source")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwEntityOrganicKeys"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityOrganicKey" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateEntityOrganicKey" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the EntityOrganicKey table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_entity_organic_key"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_entity_organic_key" ON "__mj"."EntityOrganicKey";

CREATE TRIGGER "trg_update_entity_organic_key"
BEFORE UPDATE ON "__mj"."EntityOrganicKey"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_entity_organic_key"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Entity Organic Keys
-- Item: spDeleteEntityOrganicKey
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR EntityOrganicKey
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteEntityOrganicKey'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteEntityOrganicKey"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."EntityOrganicKey"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityOrganicKey" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteEntityOrganicKey" TO "cdp_Integration";
