-- ============================================================================
-- MemberJunction PostgreSQL Migration — V202610190929__v6.2.x__Archive_StorageMode.sql
-- Split-and-regenerate with INLINE NATIVE CodeGen baking: hand-written DDL transpiled
-- (AST dialect), metadata DML inline, and CodeGen objects (views/sprocs/triggers/grants)
-- baked natively from `mj codegen`. Applies standalone via `mj migrate` — no deploy codegen.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;
SET standard_conforming_strings = on;

ALTER TABLE __mj."ArchiveConfiguration"
ADD COLUMN "StorageMode" VARCHAR(20) NOT NULL DEFAULT 'Store' /* ============================================================================= */ /* Archive StorageMode: purge without storing */ /* ============================================================================= */ /* An archive configuration can remove data without keeping a copy. */ /*   * ArchiveConfiguration.StorageMode */ /*       'Store' (default)  each record's archive document is written to the */ /*                          configured storage account, then the mode */ /*                          (StripFields / HardDelete) changes the source row. */ /*       'Purge'            the mode is applied with no copy written. No */ /*                          storage account is needed and nothing can be */ /*                          restored. */ /*   * ArchiveRun.StorageMode */ /*       The configuration's StorageMode when the run started, so run history */ /*       stays correct after the configuration changes. */ /*   * CHECK constraints keep ArchiveConfiguration.DefaultRetentionDays and */ /*     ArchiveConfigurationEntity.RetentionDays at zero or above. */ /* Existing rows default to 'Store'. */ /* ============================================================================= */;

ALTER TABLE __mj."ArchiveConfiguration"
  ADD CONSTRAINT "CK_ArchiveConfiguration_StorageMode" CHECK ("StorageMode" IN ('Store', 'Purge'));

ALTER TABLE __mj."ArchiveRun"
ADD COLUMN "StorageMode" VARCHAR(20) NOT NULL DEFAULT 'Store';

ALTER TABLE __mj."ArchiveRun"
  ADD CONSTRAINT "CK_ArchiveRun_StorageMode" CHECK ("StorageMode" IN ('Store', 'Purge'));

ALTER TABLE __mj."ArchiveConfiguration"
  ADD CONSTRAINT "CK_ArchiveConfiguration_DefaultRetentionDays" CHECK ("DefaultRetentionDays" >= 0)
 /* Retention periods cannot be negative (a NULL RetentionDays uses the configuration default). */;

ALTER TABLE __mj."ArchiveConfigurationEntity"
  ADD CONSTRAINT "CK_ArchiveConfigEntity_RetentionDays" CHECK ("RetentionDays" >= 0);

COMMENT ON COLUMN __mj."ArchiveConfiguration"."StorageMode" IS 'Whether runs keep a copy of the data they remove. Store (default): each record''s archive document is written to the storage account before the mode changes the source row. Purge: the mode is applied with no copy written, StorageAccountID is not needed, and cleared data cannot be restored. A Purge run refuses entities in ArchiveOnly mode, entities missing from metadata, entities that track Record Changes, entities whose driver is not registered or does not support purge, and HardDelete entities that use soft delete or whose delete cascade reaches an entity that tracks Record Changes or uses soft delete.';

COMMENT ON COLUMN __mj."ArchiveRun"."StorageMode" IS 'The configuration''s StorageMode when this run started: Store (copies written to storage) or Purge (no copies kept; only failed records get an ArchiveRunDetail row).';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4be97cf2-201b-4758-9bb8-f8a2837846fd' OR ("EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' AND "Name" = 'StorageMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('4be97cf2-201b-4758-9bb8-f8a2837846fd', '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4' /* Entity: MJ: Archive Runs */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '3F740D68-8510-46A6-A1D3-3FA5D79EB7C4'), 'StorageMode', 'Storage Mode', 'The configuration''s StorageMode when this run started: Store (copies written to storage) or Purge (no copies kept; only failed records get an ArchiveRunDetail row).', 'nvarchar', 40, 0, 0, FALSE, 'Store', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2bcdafb3-baa2-412b-a297-57f9399dcd92' OR ("EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04' AND "Name" = 'StorageMode')) THEN
    INSERT INTO __mj."EntityField" ("ID", "EntityID", "Sequence", "Name", "DisplayName", "Description", "Type", "Length", "Precision", "Scale", "AllowsNull", "DefaultValue", "AutoIncrement", "AllowUpdateAPI", "IsVirtual", "IsComputed", "RelatedEntityID", "RelatedEntityFieldName", "IsNameField", "IncludeInUserSearchAPI", "IncludeRelatedEntityNameFieldInBaseView", "DefaultInView", "IsPrimaryKey", "IsUnique", "RelatedEntityDisplayType", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES ('2bcdafb3-baa2-412b-a297-57f9399dcd92', '4873B8B1-11E9-49E7-AC26-497C17C9CD04' /* Entity: MJ: Archive Configurations */, (SELECT COALESCE(MAX("Sequence"), 0) + 1 FROM __mj."EntityField" WHERE "EntityID" = '4873B8B1-11E9-49E7-AC26-497C17C9CD04'), 'StorageMode', 'Storage Mode', 'Whether runs keep a copy of the data they remove. Store (default): each record''s archive document is written to the storage account before the mode changes the source row. Purge: the mode is applied with no copy written, StorageAccountID is not needed, and cleared data cannot be restored. A Purge run refuses entities in ArchiveOnly mode, entities missing from metadata, entities that track Record Changes, entities whose driver is not registered or does not support purge, and HardDelete entities that use soft delete or whose delete cascade reaches an entity that tracks Record Changes or uses soft delete.', 'nvarchar', 40, 0, 0, FALSE, 'Store', FALSE, TRUE, FALSE, FALSE, NULL, NULL, FALSE, FALSE, FALSE, FALSE, FALSE, FALSE, 'Search', NOW(), NOW());
  END IF;
END $$;

/* SQL text to insert entity field value with ID 338620b5-df31-4445-ac6d-e82025fe6044 */
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
    '338620b5-df31-4445-ac6d-e82025fe6044',
    '2BCDAFB3-BAA2-412B-A297-57F9399DCD92',
    1,
    'Purge',
    'Purge',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID a4cd2974-5abd-4526-a2d9-282d16555969 */
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
    'a4cd2974-5abd-4526-a2d9-282d16555969',
    '2BCDAFB3-BAA2-412B-A297-57F9399DCD92',
    2,
    'Store',
    'Store',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 2BCDAFB3-BAA2-412B-A297-57F9399DCD92 */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '2BCDAFB3-BAA2-412B-A297-57F9399DCD92';
/* SQL text to insert entity field value with ID daa448fb-0e5e-4500-a6df-3969731a2da1 */
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
    'daa448fb-0e5e-4500-a6df-3969731a2da1',
    '4BE97CF2-201B-4758-9BB8-F8A2837846FD',
    1,
    'Purge',
    'Purge',
    NOW(),
    NOW()
  );
/* SQL text to insert entity field value with ID 220090b1-be4c-4693-b63a-8a0d0525705c */
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
    '220090b1-be4c-4693-b63a-8a0d0525705c',
    '4BE97CF2-201B-4758-9BB8-F8A2837846FD',
    2,
    'Store',
    'Store',
    NOW(),
    NOW()
  );
/* SQL text to update ValueListType for entity field ID 4BE97CF2-201B-4758-9BB8-F8A2837846FD */
UPDATE __mj."EntityField" SET "ValueListType" = 'List'
WHERE
  "ID" = '4BE97CF2-201B-4758-9BB8-F8A2837846FD';

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = FALSE
WHERE
  "ID" = '94285CB6-6AFB-453A-B128-A4F205A9B95B' AND "AutoUpdateIsNameField" = TRUE;

/* Set categories for 1 fields */
/* UPDATE Entity Field Category Info MJ: Archive Configurations.StorageMode */
UPDATE __mj."EntityField" SET "Category" = 'Storage Configuration', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '2BCDAFB3-BAA2-412B-A297-57F9399DCD92';

/* Set categories for 1 fields */
/* UPDATE Entity Field Category Info MJ: Archive Runs.StorageMode */
UPDATE __mj."EntityField" SET "Category" = 'Execution Context', "GeneratedFormSection" = 'Category'
WHERE
  "ID" = '4BE97CF2-201B-4758-9BB8-F8A2837846FD';

/* Set field properties for entity */
UPDATE __mj."EntityField" SET "IsNameField" = TRUE
WHERE
  "ID" = '5AAF4984-3F9E-4773-AE4E-A6FAFF14E073' AND "AutoUpdateIsNameField" = TRUE;

/* SQL text to update existing entity fields from schema (MJ: Archive Run Details.ArchiveRun) */
UPDATE __mj."EntityField" SET "Type" = 'nvarchar', "Length" = 510, "Precision" = 0, "Scale" = 0
WHERE
  "ID" = 'EC2A696B-ACB1-4B02-BC57-10C5DAC8DBC7';

-- ===================== CodeGen (native PG, baked) =====================

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Archive Configurations
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_archive_configuration_storage_account_id"
    ON "__mj"."ArchiveConfiguration" ("StorageAccountID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_archive_configuration_created_by_user_id"
    ON "__mj"."ArchiveConfiguration" ("CreatedByUserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Archive Configurations
-- Item: vwArchiveConfigurations
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Archive Configurations
-----               SCHEMA:      __mj
-----               BASE TABLE:  ArchiveConfiguration
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwArchiveConfigurations"
AS
SELECT
    a.*,
    MJFileStorageAccount_StorageAccountID."Name" AS "StorageAccount",
    MJUser_CreatedByUserID."Name" AS "CreatedByUser"
FROM
    "__mj"."ArchiveConfiguration" AS a
LEFT OUTER JOIN
    "__mj"."FileStorageAccount" AS MJFileStorageAccount_StorageAccountID
  ON
    "a"."StorageAccountID" = MJFileStorageAccount_StorageAccountID."ID"
INNER JOIN
    "__mj"."User" AS MJUser_CreatedByUserID
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
        AND tc.relname = 'vwArchiveConfigurations'
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
                           AND tc.relname = 'vwArchiveConfigurations'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwArchiveConfigurations" CASCADE;
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
GRANT SELECT ON "__mj"."vwArchiveConfigurations" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwArchiveConfigurations" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwArchiveConfigurations" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Archive Configurations
-- Item: spCreateArchiveConfiguration
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ArchiveConfiguration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateArchiveConfiguration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateArchiveConfiguration"(
    p_id UUID DEFAULT NULL,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_storageaccountid_clear boolean DEFAULT false,
    p_storageaccountid UUID DEFAULT NULL,
    p_rootpath varchar(500) DEFAULT NULL,
    p_archiveformat varchar(20) DEFAULT NULL,
    p_isactive BOOLEAN DEFAULT NULL,
    p_defaultretentiondays int DEFAULT NULL,
    p_defaultmode varchar(20) DEFAULT NULL,
    p_defaultbatchsize int DEFAULT NULL,
    p_archiverelatedrecordchanges BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_createdbyuserid UUID DEFAULT NULL,
    p_storagemode varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwArchiveConfigurations" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ArchiveConfiguration"
        (
            "ID",
            "Name",
                "Description",
                "StorageAccountID",
                "RootPath",
                "ArchiveFormat",
                "IsActive",
                "DefaultRetentionDays",
                "DefaultMode",
                "DefaultBatchSize",
                "ArchiveRelatedRecordChanges",
                "Status",
                "CreatedByUserID",
                "StorageMode"
        )
    VALUES
        (
            v_new_id,
            p_name,
                CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, NULL) END,
                CASE WHEN p_storageaccountid_clear = true THEN NULL ELSE COALESCE(p_storageaccountid, NULL) END,
                p_rootpath,
                COALESCE(p_archiveformat, 'JSON'),
                COALESCE(p_isactive, FALSE),
                COALESCE(p_defaultretentiondays, 365),
                COALESCE(p_defaultmode, 'StripFields'),
                COALESCE(p_defaultbatchsize, 100),
                COALESCE(p_archiverelatedrecordchanges, TRUE),
                COALESCE(p_status, 'Idle'),
                p_createdbyuserid,
                COALESCE(p_storagemode, 'Store')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwArchiveConfigurations"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateArchiveConfiguration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateArchiveConfiguration" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Archive Configurations
-- Item: spUpdateArchiveConfiguration
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ArchiveConfiguration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateArchiveConfiguration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateArchiveConfiguration"(
    p_id UUID,
    p_name varchar(255) DEFAULT NULL,
    p_description_clear boolean DEFAULT false,
    p_description TEXT DEFAULT NULL,
    p_storageaccountid_clear boolean DEFAULT false,
    p_storageaccountid UUID DEFAULT NULL,
    p_rootpath varchar(500) DEFAULT NULL,
    p_archiveformat varchar(20) DEFAULT NULL,
    p_isactive BOOLEAN DEFAULT NULL,
    p_defaultretentiondays int DEFAULT NULL,
    p_defaultmode varchar(20) DEFAULT NULL,
    p_defaultbatchsize int DEFAULT NULL,
    p_archiverelatedrecordchanges BOOLEAN DEFAULT NULL,
    p_status varchar(20) DEFAULT NULL,
    p_createdbyuserid UUID DEFAULT NULL,
    p_storagemode varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwArchiveConfigurations" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ArchiveConfiguration"
    SET
        "Name" = COALESCE(p_name, "Name"),
        "Description" = CASE WHEN p_description_clear = true THEN NULL ELSE COALESCE(p_description, "Description") END,
        "StorageAccountID" = CASE WHEN p_storageaccountid_clear = true THEN NULL ELSE COALESCE(p_storageaccountid, "StorageAccountID") END,
        "RootPath" = COALESCE(p_rootpath, "RootPath"),
        "ArchiveFormat" = COALESCE(p_archiveformat, "ArchiveFormat"),
        "IsActive" = COALESCE(p_isactive, "IsActive"),
        "DefaultRetentionDays" = COALESCE(p_defaultretentiondays, "DefaultRetentionDays"),
        "DefaultMode" = COALESCE(p_defaultmode, "DefaultMode"),
        "DefaultBatchSize" = COALESCE(p_defaultbatchsize, "DefaultBatchSize"),
        "ArchiveRelatedRecordChanges" = COALESCE(p_archiverelatedrecordchanges, "ArchiveRelatedRecordChanges"),
        "Status" = COALESCE(p_status, "Status"),
        "CreatedByUserID" = COALESCE(p_createdbyuserid, "CreatedByUserID"),
        "StorageMode" = COALESCE(p_storagemode, "StorageMode")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwArchiveConfigurations"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateArchiveConfiguration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateArchiveConfiguration" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArchiveConfiguration table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_archive_configuration"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_archive_configuration" ON "__mj"."ArchiveConfiguration";

CREATE TRIGGER "trg_update_archive_configuration"
BEFORE UPDATE ON "__mj"."ArchiveConfiguration"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_archive_configuration"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Archive Configurations
-- Item: spDeleteArchiveConfiguration
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ArchiveConfiguration
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteArchiveConfiguration'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteArchiveConfiguration"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ArchiveConfiguration"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteArchiveConfiguration" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteArchiveConfiguration" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Archive Runs
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_archive_run_archive_configuration_id"
    ON "__mj"."ArchiveRun" ("ArchiveConfigurationID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_archive_run_user_id"
    ON "__mj"."ArchiveRun" ("UserID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Archive Runs
-- Item: vwArchiveRuns
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Archive Runs
-----               SCHEMA:      __mj
-----               BASE TABLE:  ArchiveRun
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwArchiveRuns"
AS
SELECT
    a.*,
    MJArchiveConfiguration_ArchiveConfigurationID."Name" AS "ArchiveConfiguration",
    MJUser_UserID."Name" AS "User"
FROM
    "__mj"."ArchiveRun" AS a
INNER JOIN
    "__mj"."ArchiveConfiguration" AS MJArchiveConfiguration_ArchiveConfigurationID
  ON
    "a"."ArchiveConfigurationID" = MJArchiveConfiguration_ArchiveConfigurationID."ID"
INNER JOIN
    "__mj"."User" AS MJUser_UserID
  ON
    "a"."UserID" = MJUser_UserID."ID"
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
        AND tc.relname = 'vwArchiveRuns'
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
                           AND tc.relname = 'vwArchiveRuns'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwArchiveRuns" CASCADE;
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
GRANT SELECT ON "__mj"."vwArchiveRuns" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwArchiveRuns" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwArchiveRuns" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Archive Runs
-- Item: spCreateArchiveRun
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ArchiveRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateArchiveRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateArchiveRun"(
    p_id UUID DEFAULT NULL,
    p_archiveconfigurationid UUID DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_totalrecords int DEFAULT NULL,
    p_archivedrecords int DEFAULT NULL,
    p_failedrecords int DEFAULT NULL,
    p_skippedrecords int DEFAULT NULL,
    p_totalbytesarchived bigint DEFAULT NULL,
    p_errorlog_clear boolean DEFAULT false,
    p_errorlog TEXT DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_storagemode varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwArchiveRuns" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ArchiveRun"
        (
            "ID",
            "ArchiveConfigurationID",
                "StartedAt",
                "CompletedAt",
                "Status",
                "TotalRecords",
                "ArchivedRecords",
                "FailedRecords",
                "SkippedRecords",
                "TotalBytesArchived",
                "ErrorLog",
                "UserID",
                "StorageMode"
        )
    VALUES
        (
            v_new_id,
            p_archiveconfigurationid,
                COALESCE(p_startedat, NOW()),
                CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, NULL) END,
                COALESCE(p_status, 'Running'),
                COALESCE(p_totalrecords, 0),
                COALESCE(p_archivedrecords, 0),
                COALESCE(p_failedrecords, 0),
                COALESCE(p_skippedrecords, 0),
                COALESCE(p_totalbytesarchived, 0),
                CASE WHEN p_errorlog_clear = true THEN NULL ELSE COALESCE(p_errorlog, NULL) END,
                p_userid,
                COALESCE(p_storagemode, 'Store')
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwArchiveRuns"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateArchiveRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateArchiveRun" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Archive Runs
-- Item: spUpdateArchiveRun
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ArchiveRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateArchiveRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateArchiveRun"(
    p_id UUID,
    p_archiveconfigurationid UUID DEFAULT NULL,
    p_startedat TIMESTAMPTZ DEFAULT NULL,
    p_completedat_clear boolean DEFAULT false,
    p_completedat TIMESTAMPTZ DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_totalrecords int DEFAULT NULL,
    p_archivedrecords int DEFAULT NULL,
    p_failedrecords int DEFAULT NULL,
    p_skippedrecords int DEFAULT NULL,
    p_totalbytesarchived bigint DEFAULT NULL,
    p_errorlog_clear boolean DEFAULT false,
    p_errorlog TEXT DEFAULT NULL,
    p_userid UUID DEFAULT NULL,
    p_storagemode varchar(20) DEFAULT NULL
) RETURNS SETOF "__mj"."vwArchiveRuns" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ArchiveRun"
    SET
        "ArchiveConfigurationID" = COALESCE(p_archiveconfigurationid, "ArchiveConfigurationID"),
        "StartedAt" = COALESCE(p_startedat, "StartedAt"),
        "CompletedAt" = CASE WHEN p_completedat_clear = true THEN NULL ELSE COALESCE(p_completedat, "CompletedAt") END,
        "Status" = COALESCE(p_status, "Status"),
        "TotalRecords" = COALESCE(p_totalrecords, "TotalRecords"),
        "ArchivedRecords" = COALESCE(p_archivedrecords, "ArchivedRecords"),
        "FailedRecords" = COALESCE(p_failedrecords, "FailedRecords"),
        "SkippedRecords" = COALESCE(p_skippedrecords, "SkippedRecords"),
        "TotalBytesArchived" = COALESCE(p_totalbytesarchived, "TotalBytesArchived"),
        "ErrorLog" = CASE WHEN p_errorlog_clear = true THEN NULL ELSE COALESCE(p_errorlog, "ErrorLog") END,
        "UserID" = COALESCE(p_userid, "UserID"),
        "StorageMode" = COALESCE(p_storagemode, "StorageMode")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwArchiveRuns"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateArchiveRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateArchiveRun" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArchiveRun table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_archive_run"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_archive_run" ON "__mj"."ArchiveRun";

CREATE TRIGGER "trg_update_archive_run"
BEFORE UPDATE ON "__mj"."ArchiveRun"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_archive_run"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Archive Runs
-- Item: spDeleteArchiveRun
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ArchiveRun
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteArchiveRun'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteArchiveRun"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ArchiveRun"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteArchiveRun" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteArchiveRun" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Archive Run Details
-- Item: Index for Foreign Keys
-- ============================================================
CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_archive_run_detail_archive_run_id"
    ON "__mj"."ArchiveRunDetail" ("ArchiveRunID");

CREATE INDEX IF NOT EXISTS "idx_auto_mj_fkey_archive_run_detail_entity_id"
    ON "__mj"."ArchiveRunDetail" ("EntityID");

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Archive Run Details
-- Item: vwArchiveRunDetails
-- ============================================================

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Archive Run Details
-----               SCHEMA:      __mj
-----               BASE TABLE:  ArchiveRunDetail
-----               PRIMARY KEY: ID
------------------------------------------------------------
DO $vw_regen$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW "__mj"."vwArchiveRunDetails"
AS
SELECT
    a.*,
    MJArchiveRun_ArchiveRunID."ArchiveConfiguration" AS "ArchiveRun",
    MJEntity_EntityID."Name" AS "Entity"
FROM
    "__mj"."ArchiveRunDetail" AS a
INNER JOIN
    "__mj"."vwArchiveRuns" AS MJArchiveRun_ArchiveRunID
  ON
    "a"."ArchiveRunID" = MJArchiveRun_ArchiveRunID."ID"
INNER JOIN
    "__mj"."Entity" AS MJEntity_EntityID
  ON
    "a"."EntityID" = MJEntity_EntityID."ID"
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
        AND tc.relname = 'vwArchiveRunDetails'
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
                           AND tc.relname = 'vwArchiveRunDetails'
                           AND tc.relkind IN ('v', 'm')))
        AND (pp.prorettype = c.reltype
             OR EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = pp.oid
                          AND d.refobjid = c.oid))
  );

  DROP VIEW IF EXISTS "__mj"."vwArchiveRunDetails" CASCADE;
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
GRANT SELECT ON "__mj"."vwArchiveRunDetails" TO "cdp_UI";
GRANT SELECT ON "__mj"."vwArchiveRunDetails" TO "cdp_Developer";
GRANT SELECT ON "__mj"."vwArchiveRunDetails" TO "cdp_Integration";

-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Archive Run Details
-- Item: spCreateArchiveRunDetail
-- ============================================================

------------------------------------------------------------
----- CREATE FUNCTION FOR ArchiveRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spCreateArchiveRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spCreateArchiveRunDetail"(
    p_id UUID DEFAULT NULL,
    p_archiverunid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(750) DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_storagepath_clear boolean DEFAULT false,
    p_storagepath varchar(1000) DEFAULT NULL,
    p_bytesarchived bigint DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_archivedat_clear boolean DEFAULT false,
    p_archivedat TIMESTAMPTZ DEFAULT NULL,
    p_versionstamp_clear boolean DEFAULT false,
    p_versionstamp TIMESTAMPTZ DEFAULT NULL,
    p_isrecordchangearchive BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwArchiveRunDetails" AS $$
DECLARE
    v_new_id UUID;
BEGIN
    v_new_id := COALESCE(p_id, gen_random_uuid());
    INSERT INTO "__mj"."ArchiveRunDetail"
        (
            "ID",
            "ArchiveRunID",
                "EntityID",
                "RecordID",
                "Status",
                "StoragePath",
                "BytesArchived",
                "ErrorMessage",
                "ArchivedAt",
                "VersionStamp",
                "IsRecordChangeArchive"
        )
    VALUES
        (
            v_new_id,
            p_archiverunid,
                p_entityid,
                p_recordid,
                p_status,
                CASE WHEN p_storagepath_clear = true THEN NULL ELSE COALESCE(p_storagepath, NULL) END,
                COALESCE(p_bytesarchived, 0),
                CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, NULL) END,
                CASE WHEN p_archivedat_clear = true THEN NULL ELSE COALESCE(p_archivedat, NULL) END,
                CASE WHEN p_versionstamp_clear = true THEN NULL ELSE COALESCE(p_versionstamp, NULL) END,
                COALESCE(p_isrecordchangearchive, FALSE)
        )
    ;

    RETURN QUERY
    SELECT * FROM "__mj"."vwArchiveRunDetails"
    WHERE "ID" = v_new_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spCreateArchiveRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spCreateArchiveRunDetail" TO "cdp_Integration";


-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Archive Run Details
-- Item: spUpdateArchiveRunDetail
-- ============================================================

------------------------------------------------------------
----- UPDATE FUNCTION FOR ArchiveRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spUpdateArchiveRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spUpdateArchiveRunDetail"(
    p_id UUID,
    p_archiverunid UUID DEFAULT NULL,
    p_entityid UUID DEFAULT NULL,
    p_recordid varchar(750) DEFAULT NULL,
    p_status varchar(50) DEFAULT NULL,
    p_storagepath_clear boolean DEFAULT false,
    p_storagepath varchar(1000) DEFAULT NULL,
    p_bytesarchived bigint DEFAULT NULL,
    p_errormessage_clear boolean DEFAULT false,
    p_errormessage TEXT DEFAULT NULL,
    p_archivedat_clear boolean DEFAULT false,
    p_archivedat TIMESTAMPTZ DEFAULT NULL,
    p_versionstamp_clear boolean DEFAULT false,
    p_versionstamp TIMESTAMPTZ DEFAULT NULL,
    p_isrecordchangearchive BOOLEAN DEFAULT NULL
) RETURNS SETOF "__mj"."vwArchiveRunDetails" AS $$
DECLARE
    v_updated_count INTEGER;
BEGIN
    UPDATE "__mj"."ArchiveRunDetail"
    SET
        "ArchiveRunID" = COALESCE(p_archiverunid, "ArchiveRunID"),
        "EntityID" = COALESCE(p_entityid, "EntityID"),
        "RecordID" = COALESCE(p_recordid, "RecordID"),
        "Status" = COALESCE(p_status, "Status"),
        "StoragePath" = CASE WHEN p_storagepath_clear = true THEN NULL ELSE COALESCE(p_storagepath, "StoragePath") END,
        "BytesArchived" = COALESCE(p_bytesarchived, "BytesArchived"),
        "ErrorMessage" = CASE WHEN p_errormessage_clear = true THEN NULL ELSE COALESCE(p_errormessage, "ErrorMessage") END,
        "ArchivedAt" = CASE WHEN p_archivedat_clear = true THEN NULL ELSE COALESCE(p_archivedat, "ArchivedAt") END,
        "VersionStamp" = CASE WHEN p_versionstamp_clear = true THEN NULL ELSE COALESCE(p_versionstamp, "VersionStamp") END,
        "IsRecordChangeArchive" = COALESCE(p_isrecordchangearchive, "IsRecordChangeArchive")
    WHERE
        "ID" = p_id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    IF v_updated_count = 0 THEN
        -- Nothing was updated, return empty result set
        RETURN;
    END IF;

    -- Return the updated record from the base view
    RETURN QUERY
    SELECT * FROM "__mj"."vwArchiveRunDetails"
    WHERE "ID" = p_id;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateArchiveRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spUpdateArchiveRunDetail" TO "cdp_Integration";


------------------------------------------------------------
----- TRIGGER FOR __mj_UpdatedAt field for the ArchiveRunDetail table
------------------------------------------------------------
CREATE OR REPLACE FUNCTION "__mj"."fn_trg_update_archive_run_detail"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" := NOW() AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trg_update_archive_run_detail" ON "__mj"."ArchiveRunDetail";

CREATE TRIGGER "trg_update_archive_run_detail"
BEFORE UPDATE ON "__mj"."ArchiveRunDetail"
FOR EACH ROW
EXECUTE FUNCTION "__mj"."fn_trg_update_archive_run_detail"();



-- ============================================================
-- PostgreSQL Generated SQL for Entity: MJ: Archive Run Details
-- Item: spDeleteArchiveRunDetail
-- ============================================================

------------------------------------------------------------
----- DELETE FUNCTION FOR ArchiveRunDetail
------------------------------------------------------------
DO $do$
DECLARE r RECORD;
BEGIN
    FOR r IN SELECT oid::regprocedure AS sig
             FROM pg_proc
             WHERE proname = 'spDeleteArchiveRunDetail'
               AND pronamespace = '__mj'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION ' || r.sig::text;
    END LOOP;
END
$do$;

CREATE OR REPLACE FUNCTION "__mj"."spDeleteArchiveRunDetail"(
    p_id UUID
) RETURNS TABLE("ID" UUID) AS $$
#variable_conflict use_column
DECLARE
    v_affected_count INTEGER;
BEGIN

    DELETE FROM "__mj"."ArchiveRunDetail"
    WHERE "ID" = p_id;

    GET DIAGNOSTICS v_affected_count = ROW_COUNT;

    IF v_affected_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "ID";
    ELSE
        RETURN QUERY SELECT p_id AS "ID";
    END IF;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteArchiveRunDetail" TO "cdp_Developer";
GRANT EXECUTE ON FUNCTION "__mj"."spDeleteArchiveRunDetail" TO "cdp_Integration";
