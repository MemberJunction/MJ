-- ============================================================================
-- MemberJunction PostgreSQL Migration
-- Converted from SQL Server using TypeScript conversion pipeline
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Schema
CREATE SCHEMA IF NOT EXISTS __mj;
SET search_path TO __mj, public;

-- Ensure backslashes in string literals are treated literally (not as escape sequences)
SET standard_conforming_strings = on;

-- NOTE: Earlier converter versions made INTEGER to BOOLEAN cast implicit by
-- modifying the system catalog so SS-style INSERT INTO bool_col VALUES (1)
-- would work. That modification required pg_catalog write privileges, which
-- managed PG (RDS, Aurora, Cloud SQL, Azure) does not grant. As of v5.30 all
-- bulk INSERTs are emitted with native TRUE/FALSE values directly, so the
-- cast modification is no longer needed. Removed to support managed-PG
-- installs out of the box.


-- ===================== DDL: Tables, PKs, Indexes =====================

CREATE TABLE __mj."EntityFormOverride" (
 "ID" UUID NOT NULL DEFAULT gen_random_uuid(),
 "EntityID" UUID NOT NULL,
 "ComponentID" UUID NOT NULL,
 "Name" VARCHAR(255) NOT NULL,
 "Description" TEXT NULL,
 "Scope" VARCHAR(20) NOT NULL DEFAULT 'Global',
 "UserID" UUID NULL,
 "RoleID" UUID NULL,
 "Priority" INTEGER NOT NULL DEFAULT 0,
 "Status" VARCHAR(20) NOT NULL DEFAULT 'Active',
 "Notes" TEXT NULL,
 CONSTRAINT PK_EntityFormOverride PRIMARY KEY ("ID"),
 CONSTRAINT FK_EntityFormOverride_Entity FOREIGN KEY ("EntityID")
 REFERENCES __mj."Entity"("ID") ON DELETE CASCADE,
 CONSTRAINT FK_EntityFormOverride_Component FOREIGN KEY ("ComponentID")
 REFERENCES __mj."Component"("ID") ON DELETE CASCADE,
 CONSTRAINT FK_EntityFormOverride_User FOREIGN KEY ("UserID")
 REFERENCES __mj."User"("ID"),
 CONSTRAINT FK_EntityFormOverride_Role FOREIGN KEY ("RoleID")
 REFERENCES __mj."Role"("ID"),
 CONSTRAINT CK_EntityFormOverride_Scope
 CHECK ("Scope" IN ('User', 'Role', 'Global')),
 CONSTRAINT CK_EntityFormOverride_Status
 CHECK ("Status" IN ('Active', 'Inactive', 'Pending')),
 CONSTRAINT CK_EntityFormOverride_Scope_Consistency
 CHECK (
 ("Scope" = 'User' AND "UserID" IS NOT NULL AND "RoleID" IS NULL) OR
 ("Scope" = 'Role' AND "RoleID" IS NOT NULL AND "UserID" IS NULL) OR
 ("Scope" = 'Global' AND "UserID" IS NULL AND "RoleID" IS NULL)
 )
);

ALTER TABLE __mj."EntityFormOverride"
 ADD COLUMN IF NOT EXISTS "__mj_CreatedAt" TIMESTAMPTZ NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."EntityFormOverride" */
ALTER TABLE __mj."EntityFormOverride"
 ADD COLUMN IF NOT EXISTS "__mj_UpdatedAt" TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityFormOverride_EntityID" ON __mj."EntityFormOverride" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityFormOverride_ComponentID" ON __mj."EntityFormOverride" ("ComponentID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityFormOverride_UserID" ON __mj."EntityFormOverride" ("UserID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityFormOverride_RoleID" ON __mj."EntityFormOverride" ("RoleID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwEntityFormOverrides';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwEntityFormOverrides"
AS SELECT
    e.*,
    "MJEntity_EntityID"."Name" AS "Entity",
    "MJComponent_ComponentID"."Name" AS "Component",
    "MJUser_UserID"."Name" AS "User",
    "MJRole_RoleID"."Name" AS "Role"
FROM
    __mj."EntityFormOverride" AS e
INNER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    e."EntityID" = "MJEntity_EntityID"."ID"
INNER JOIN
    __mj."Component" AS "MJComponent_ComponentID"
  ON
    e."ComponentID" = "MJComponent_ComponentID"."ID"
LEFT OUTER JOIN
    __mj."User" AS "MJUser_UserID"
  ON
    e."UserID" = "MJUser_UserID"."ID"
LEFT OUTER JOIN
    __mj."Role" AS "MJRole_RoleID"
  ON
    e."RoleID" = "MJRole_RoleID"."ID"$vsql$;
  v_target_oid OID;
  v_dep RECORD;
  v_captured JSONB[] := ARRAY[]::JSONB[];
  v_n INTEGER;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  -- Column list changed; need CASCADE. Preserve dependent views first.
  SELECT c.oid INTO v_target_oid
  FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
  WHERE n.nspname = v_target_schema AND c.relname = v_target_name AND c.relkind = 'v';
  IF v_target_oid IS NOT NULL THEN
    FOR v_dep IN
      WITH RECURSIVE deps AS (
        SELECT c.oid, c.relname AS name, n.nspname AS schema, 1 AS depth
        FROM pg_rewrite r
        JOIN pg_depend d ON d.objid = r.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE d.refobjid = v_target_oid AND d.deptype = 'n'
          AND c.oid <> v_target_oid AND c.relkind = 'v'
        UNION
        SELECT c.oid, c.relname, n.nspname, p.depth + 1
        FROM deps p
        JOIN pg_rewrite r ON TRUE
        JOIN pg_depend d ON d.objid = r.oid AND d.refobjid = p.oid
        JOIN pg_class c ON c.oid = r.ev_class
        JOIN pg_namespace n ON c.relnamespace = n.oid
        WHERE c.relkind = 'v' AND c.oid <> p.oid
      )
      SELECT oid, name, schema, MAX(depth) AS max_depth,
             pg_catalog.pg_get_viewdef(oid, true) AS viewdef
      FROM deps GROUP BY oid, name, schema
      ORDER BY MAX(depth) ASC
    LOOP
      v_captured := v_captured || jsonb_build_object(
        'schema', v_dep.schema, 'name', v_dep.name, 'def', v_dep.viewdef);
    END LOOP;
  END IF;
  EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', v_target_schema, v_target_name);
  EXECUTE vsql;
  IF v_captured IS NOT NULL AND array_length(v_captured, 1) > 0 THEN
    FOR v_n IN 1..array_length(v_captured, 1) LOOP
      BEGIN
        EXECUTE format('CREATE VIEW %I.%I AS %s',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', v_captured[v_n]->>'def');
      EXCEPTION WHEN others THEN
        RAISE WARNING 'Could not restore dependent view %.%: %',
          v_captured[v_n]->>'schema', v_captured[v_n]->>'name', SQLERRM;
      END;
    END LOOP;
  END IF;
END;
$do$;


-- ===================== Stored Procedures (sp*) =====================

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spCreateEntityFormOverride'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateEntityFormOverride"(
    IN p_ID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_ComponentID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Scope VARCHAR(20) DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_RoleID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RoleID UUID DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_Notes_Clear BOOLEAN DEFAULT FALSE,
    IN p_Notes TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityFormOverrides" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityFormOverride"
            (
                "ID",
                "EntityID",
                "ComponentID",
                "Name",
                "Description",
                "Scope",
                "UserID",
                "RoleID",
                "Priority",
                "Status",
                "Notes"
            )
        VALUES
            (
                p_ID,
                p_EntityID,
                p_ComponentID,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                COALESCE(p_Scope, 'Global'),
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_RoleID_Clear = TRUE THEN NULL ELSE COALESCE(p_RoleID, NULL) END,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_Notes_Clear = TRUE THEN NULL ELSE COALESCE(p_Notes, NULL) END
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityFormOverride"
            (
                "EntityID",
                "ComponentID",
                "Name",
                "Description",
                "Scope",
                "UserID",
                "RoleID",
                "Priority",
                "Status",
                "Notes"
            )
        VALUES
            (
                p_EntityID,
                p_ComponentID,
                p_Name,
                CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, NULL) END,
                COALESCE(p_Scope, 'Global'),
                CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, NULL) END,
                CASE WHEN p_RoleID_Clear = TRUE THEN NULL ELSE COALESCE(p_RoleID, NULL) END,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active'),
                CASE WHEN p_Notes_Clear = TRUE THEN NULL ELSE COALESCE(p_Notes, NULL) END
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityFormOverrides" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateEntityFormOverride'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateEntityFormOverride"(
    IN p_ID UUID,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_ComponentID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description_Clear BOOLEAN DEFAULT FALSE,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Scope VARCHAR(20) DEFAULT NULL,
    IN p_UserID_Clear BOOLEAN DEFAULT FALSE,
    IN p_UserID UUID DEFAULT NULL,
    IN p_RoleID_Clear BOOLEAN DEFAULT FALSE,
    IN p_RoleID UUID DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_Notes_Clear BOOLEAN DEFAULT FALSE,
    IN p_Notes TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityFormOverrides" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityFormOverride"
    SET
        "EntityID" = COALESCE(p_EntityID, "EntityID"),
        "ComponentID" = COALESCE(p_ComponentID, "ComponentID"),
        "Name" = COALESCE(p_Name, "Name"),
        "Description" = CASE WHEN p_Description_Clear = TRUE THEN NULL ELSE COALESCE(p_Description, "Description") END,
        "Scope" = COALESCE(p_Scope, "Scope"),
        "UserID" = CASE WHEN p_UserID_Clear = TRUE THEN NULL ELSE COALESCE(p_UserID, "UserID") END,
        "RoleID" = CASE WHEN p_RoleID_Clear = TRUE THEN NULL ELSE COALESCE(p_RoleID, "RoleID") END,
        "Priority" = COALESCE(p_Priority, "Priority"),
        "Status" = COALESCE(p_Status, "Status"),
        "Notes" = CASE WHEN p_Notes_Clear = TRUE THEN NULL ELSE COALESCE(p_Notes, "Notes") END
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityFormOverrides" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityFormOverrides" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteEntityFormOverride'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteEntityFormOverride"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityFormOverride"
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT NULL::UUID AS "_result_id";
    ELSE
        RETURN QUERY SELECT p_ID::UUID AS "_result_id";
    END IF;
END;
$$ LANGUAGE plpgsql;


-- ===================== Triggers =====================

CREATE OR REPLACE FUNCTION __mj."trgUpdateEntityFormOverride_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateEntityFormOverride" ON __mj."EntityFormOverride";
CREATE TRIGGER "trgUpdateEntityFormOverride"
    BEFORE UPDATE ON __mj."EntityFormOverride"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateEntityFormOverride_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

INSERT INTO __mj."Entity" (
         "ID",
         "Name",
         "DisplayName",
         "Description",
         "NameSuffix",
         "BaseTable",
         "BaseView",
         "SchemaName",
         "IncludeInAPI",
         "AllowUserSearchAPI",
         "AllowCaching"
         , "TrackRecordChanges"
         , "AuditRecordAccess"
         , "AuditViewRuns"
         , "AllowAllRowsAPI"
         , "AllowCreateAPI"
         , "AllowUpdateAPI"
         , "AllowDeleteAPI"
         , "UserViewMaxRows"
         , "__mj_CreatedAt"
         , "__mj_UpdatedAt"
      )
      VALUES (
         'bc845dbd-7248-4290-a5ad-7884c067e3a1',
         'MJ: Entity Form Overrides',
         'Entity Form Overrides',
         'Points an Entity at a Component to serve as its form at runtime. Scoped to User > Role > Global with priority-based resolution. When present and Active, takes precedence over the entity''s @RegisterClass-registered or CodeGen-generated Angular form.',
         NULL,
         'EntityFormOverride',
         'vwEntityFormOverrides',
         '__mj',
         TRUE,
         TRUE,
         TRUE
         , TRUE
         , FALSE
         , FALSE
         , FALSE
         , TRUE
         , TRUE
         , TRUE
         , 1000
         , NOW()
         , NOW()
      );

/* SQL generated to add new entity MJ: Entity Form Overrides to application ID: 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E' */

INSERT INTO __mj."ApplicationEntity"
                                       ("ApplicationID", "EntityID", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                       ('EBA5CCEC-6A37-EF11-86D4-000D3A4E707E', 'bc845dbd-7248-4290-a5ad-7884c067e3a1', (SELECT COALESCE(MAX("Sequence"),0)+1 FROM __mj."ApplicationEntity" WHERE "ApplicationID" = 'EBA5CCEC-6A37-EF11-86D4-000D3A4E707E'), NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Entity Form Overrides for role UI */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('bc845dbd-7248-4290-a5ad-7884c067e3a1', 'E0AFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, FALSE, FALSE, FALSE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Entity Form Overrides for role Developer */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('bc845dbd-7248-4290-a5ad-7884c067e3a1', 'DEAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL generated to add new permission for entity MJ: Entity Form Overrides for role Integration */

INSERT INTO __mj."EntityPermission"
                                                   ("EntityID", "RoleID", "CanRead", "CanCreate", "CanUpdate", "CanDelete", "__mj_CreatedAt", "__mj_UpdatedAt") VALUES
                                                   ('bc845dbd-7248-4290-a5ad-7884c067e3a1', 'DFAFCCEC-6A37-EF11-86D4-000D3A4E707E', TRUE, TRUE, TRUE, TRUE, NOW(), NOW());

/* SQL text to add special date field __mj_CreatedAt to entity __mj."EntityFormOverride" */

/* SQL text to add special date field __mj_CreatedAt to entity __mj."EntityFormOverride" */
UPDATE __mj."EntityFormOverride" SET "__mj_CreatedAt" = NOW() WHERE "__mj_CreatedAt" IS NULL;

/* SQL text to add special date field __mj_CreatedAt to entity __mj."EntityFormOverride" */
ALTER TABLE __mj."EntityFormOverride" ALTER COLUMN "__mj_CreatedAt" SET NOT NULL;

ALTER TABLE __mj."EntityFormOverride"
  ALTER COLUMN "__mj_CreatedAt" SET DEFAULT NOW();

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."EntityFormOverride" */
UPDATE __mj."EntityFormOverride" SET "__mj_UpdatedAt" = NOW() WHERE "__mj_UpdatedAt" IS NULL;

/* SQL text to add special date field __mj_UpdatedAt to entity __mj."EntityFormOverride" */
ALTER TABLE __mj."EntityFormOverride" ALTER COLUMN "__mj_UpdatedAt" SET NOT NULL;

ALTER TABLE __mj."EntityFormOverride"
  ALTER COLUMN "__mj_UpdatedAt" SET DEFAULT NOW();

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '29611c01-faaf-4f0d-b468-e1c44d887ce0' OR ("EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND "Name" = 'ID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '29611c01-faaf-4f0d-b468-e1c44d887ce0',
        'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- "Entity": "MJ": "Entity" "Form" "Overrides"
        100001,
        'ID',
        'ID',
        NULL,
        'UUID',
        16,
        0,
        0,
        FALSE,
        'gen_random_uuid()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        TRUE,
        TRUE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '7928ab00-4ee6-409e-9450-41d857fb6650' OR ("EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND "Name" = 'EntityID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '7928ab00-4ee6-409e-9450-41d857fb6650',
        'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- "Entity": "MJ": "Entity" "Form" "Overrides"
        100002,
        'EntityID',
        'Entity ID',
        'Foreign key to Entity — which entity this override is for.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'E0238F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '48f5b8e7-2ff3-492a-8ea8-2b8ce719fdc2' OR ("EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND "Name" = 'ComponentID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '48f5b8e7-2ff3-492a-8ea8-2b8ce719fdc2',
        'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- "Entity": "MJ": "Entity" "Form" "Overrides"
        100003,
        'ComponentID',
        'Component ID',
        'Foreign key to Component — the component that renders the form. Must declare componentRole=''form'' and implement the FormHostProps contract.',
        'UUID',
        16,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        '0FB98A1D-C6AE-4427-B66C-7B31E669756F',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '26d29d35-6566-4483-91b9-d4648bc6900a' OR ("EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND "Name" = 'Name')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '26d29d35-6566-4483-91b9-d4648bc6900a',
        'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- "Entity": "MJ": "Entity" "Form" "Overrides"
        100004,
        'Name',
        'Name',
        'Human-readable label for this override (e.g., "CSR Customer Form", "Compact Mobile Variant").',
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        TRUE,
        TRUE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '6266a8d6-4076-4205-b7c4-b356e18a4f28' OR ("EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND "Name" = 'Description')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '6266a8d6-4076-4205-b7c4-b356e18a4f28',
        'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- "Entity": "MJ": "Entity" "Form" "Overrides"
        100005,
        'Description',
        'Description',
        'Optional longer description of what this override is for and when it applies.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e3b0726f-e3a6-4ee1-a905-89cd99561fcf' OR ("EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND "Name" = 'Scope')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'e3b0726f-e3a6-4ee1-a905-89cd99561fcf',
        'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- "Entity": "MJ": "Entity" "Form" "Overrides"
        100006,
        'Scope',
        'Scope',
        'Resolution tier: User (requires UserID), Role (requires RoleID), or Global. The resolver evaluates in that order — a User row beats a Role row beats a Global row.',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Global',
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '87c36f01-6073-4f02-9b1b-661f475ce4b9' OR ("EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND "Name" = 'UserID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '87c36f01-6073-4f02-9b1b-661f475ce4b9',
        'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- "Entity": "MJ": "Entity" "Form" "Overrides"
        100007,
        'UserID',
        'User ID',
        'Required when Scope=''User''. The single user this override applies to.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'E1238F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1942590c-6e7a-4aa3-8a94-ac669ce52dde' OR ("EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND "Name" = 'RoleID')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '1942590c-6e7a-4aa3-8a94-ac669ce52dde',
        'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- "Entity": "MJ": "Entity" "Form" "Overrides"
        100008,
        'RoleID',
        'Role ID',
        'Required when Scope=''Role''. The role whose members see this override.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        'DA238F34-2837-EF11-86D4-6045BDEE16E6',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '651979fa-d370-4db5-9a5a-b7e4320d8a6e' OR ("EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND "Name" = 'Priority')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '651979fa-d370-4db5-9a5a-b7e4320d8a6e',
        'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- "Entity": "MJ": "Entity" "Form" "Overrides"
        100009,
        'Priority',
        'Priority',
        'Higher value wins within a scope tier. Ties broken by __mj_CreatedAt DESC. No IsDefault — Priority is the only mechanism.',
        'INTEGER',
        4,
        10,
        0,
        FALSE,
        '(0)',
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c802f5ac-15a3-4023-b8d1-bd810404b7b5' OR ("EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND "Name" = 'Status')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'c802f5ac-15a3-4023-b8d1-bd810404b7b5',
        'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- "Entity": "MJ": "Entity" "Form" "Overrides"
        100010,
        'Status',
        'Status',
        'Active = eligible for resolution. Inactive = ignored. Pending = AI-authored, awaiting human activation (resolver treats as Inactive).',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Active',
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'eb691608-dcbf-4630-82ad-33a102ffa960' OR ("EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND "Name" = 'Notes')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'eb691608-dcbf-4630-82ad-33a102ffa960',
        'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- "Entity": "MJ": "Entity" "Form" "Overrides"
        100011,
        'Notes',
        'Notes',
        'Optional free-form commentary about this override — e.g. who authored it, why it exists, what should change before it goes Global, links to related discussions. Does not affect resolution.',
        'TEXT',
        -1,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '376b951e-67d4-47a8-bb7e-7a0195648478' OR ("EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND "Name" = '__mj_CreatedAt')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '376b951e-67d4-47a8-bb7e-7a0195648478',
        'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- "Entity": "MJ": "Entity" "Form" "Overrides"
        100012,
        '__mj_CreatedAt',
        'Created At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '53ec4001-4d4e-457b-ae9a-8ef9615dd994' OR ("EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND "Name" = '__mj_UpdatedAt')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '53ec4001-4d4e-457b-ae9a-8ef9615dd994',
        'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- "Entity": "MJ": "Entity" "Form" "Overrides"
        100013,
        '__mj_UpdatedAt',
        'Updated At',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
        'NOW()',
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('59802e1f-3127-4009-a664-3095d3f9b47d', 'E3B0726F-E3A6-4EE1-A905-89CD99561FCF', 1, 'Global', 'Global', NOW(), NOW());

/* SQL text to insert entity field value with ID d57942bc-2e9e-46d6-ae35-ddea506dfbe7 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('d57942bc-2e9e-46d6-ae35-ddea506dfbe7', 'E3B0726F-E3A6-4EE1-A905-89CD99561FCF', 2, 'Role', 'Role', NOW(), NOW());

/* SQL text to insert entity field value with ID 2b562a75-f5a2-4c6f-a5f6-e1badd27224e */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('2b562a75-f5a2-4c6f-a5f6-e1badd27224e', 'E3B0726F-E3A6-4EE1-A905-89CD99561FCF', 3, 'User', 'User', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID E3B0726F-E3A6-4EE1-A905-89CD99561FCF */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='E3B0726F-E3A6-4EE1-A905-89CD99561FCF';

/* SQL text to insert entity field value with ID c98ff9ff-09fc-4248-ba6f-ce6a5d649dc9 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('c98ff9ff-09fc-4248-ba6f-ce6a5d649dc9', 'C802F5AC-15A3-4023-B8D1-BD810404B7B5', 1, 'Active', 'Active', NOW(), NOW());

/* SQL text to insert entity field value with ID 993273ff-f87d-487f-8708-fa6f831e16b5 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('993273ff-f87d-487f-8708-fa6f831e16b5', 'C802F5AC-15A3-4023-B8D1-BD810404B7B5', 2, 'Inactive', 'Inactive', NOW(), NOW());

/* SQL text to insert entity field value with ID 467ad88a-4727-4d8b-a98b-514dadf61cbe */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('467ad88a-4727-4d8b-a98b-514dadf61cbe', 'C802F5AC-15A3-4023-B8D1-BD810404B7B5', 3, 'Pending', 'Pending', NOW(), NOW());

/* SQL text to update ValueListType for entity field ID C802F5AC-15A3-4023-B8D1-BD810404B7B5 */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='C802F5AC-15A3-4023-B8D1-BD810404B7B5';


/* Create Entity Relationship: MJ: Roles -> MJ: Entity Form Overrides (One To Many via RoleID) */

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b9bd2659-489e-403f-85d8-632caab5fcce'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('b9bd2659-489e-403f-85d8-632caab5fcce', 'DA238F34-2837-EF11-86D4-6045BDEE16E6', 'BC845DBD-7248-4290-A5AD-7884C067E3A1', 'RoleID', 'One To Many', TRUE, TRUE, 12, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'd2727ba3-611e-4d6a-84bc-9834d2d4ea77'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('d2727ba3-611e-4d6a-84bc-9834d2d4ea77', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'BC845DBD-7248-4290-A5AD-7884C067E3A1', 'EntityID', 'One To Many', TRUE, TRUE, 60, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '2679b73f-9679-42f8-9621-a25fca5bc2ae'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('2679b73f-9679-42f8-9621-a25fca5bc2ae', 'E1238F34-2837-EF11-86D4-6045BDEE16E6', 'BC845DBD-7248-4290-A5AD-7884C067E3A1', 'UserID', 'One To Many', TRUE, TRUE, 98, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = 'b1f0701d-b774-4502-af30-12c7d9b35d06'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('b1f0701d-b774-4502-af30-12c7d9b35d06', '0FB98A1D-C6AE-4427-B66C-7B31E669756F', 'BC845DBD-7248-4290-A5AD-7884C067E3A1', 'ComponentID', 'One To Many', TRUE, TRUE, 4, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f0502c15-efc2-40b3-a57d-bb9ce2ea7996' OR ("EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND "Name" = 'Entity')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'f0502c15-efc2-40b3-a57d-bb9ce2ea7996',
        'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- "Entity": "MJ": "Entity" "Form" "Overrides"
        100027,
        'Entity',
        'Entity',
        NULL,
        'TEXT',
        510,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8e88ece5-6a90-4006-b706-279f93897759' OR ("EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND "Name" = 'Component')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '8e88ece5-6a90-4006-b706-279f93897759',
        'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- "Entity": "MJ": "Entity" "Form" "Overrides"
        100028,
        'Component',
        'Component',
        NULL,
        'TEXT',
        1000,
        0,
        0,
        FALSE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd1987230-2cf0-4e94-b5a3-8272b7611671' OR ("EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND "Name" = 'User')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        'd1987230-2cf0-4e94-b5a3-8272b7611671',
        'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- "Entity": "MJ": "Entity" "Form" "Overrides"
        100029,
        'User',
        'User',
        NULL,
        'TEXT',
        200,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4a174983-6830-432e-be5a-d6bf936121de' OR ("EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1' AND "Name" = 'Role')
    ) THEN
        INSERT INTO __mj."EntityField"
        (
        "ID",
        "EntityID",
        "Sequence",
        "Name",
        "DisplayName",
        "Description",
        "Type",
        "Length",
        "Precision",
        "Scale",
        "AllowsNull",
        "DefaultValue",
        "AutoIncrement",
        "AllowUpdateAPI",
        "IsVirtual",
        "IsComputed",
        "RelatedEntityID",
        "RelatedEntityFieldName",
        "IsNameField",
        "IncludeInUserSearchAPI",
        "IncludeRelatedEntityNameFieldInBaseView",
        "DefaultInView",
        "IsPrimaryKey",
        "IsUnique",
        "RelatedEntityDisplayType",
        "__mj_CreatedAt",
        "__mj_UpdatedAt"
        )
        VALUES
        (
        '4a174983-6830-432e-be5a-d6bf936121de',
        'BC845DBD-7248-4290-A5AD-7884C067E3A1', -- "Entity": "MJ": "Entity" "Form" "Overrides"
        100030,
        'Role',
        'Role',
        NULL,
        'TEXT',
        100,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E3B0726F-E3A6-4EE1-A905-89CD99561FCF'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '651979FA-D370-4DB5-9A5A-B7E4320D8A6E'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'C802F5AC-15A3-4023-B8D1-BD810404B7B5'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'F0502C15-EFC2-40B3-A57D-BB9CE2EA7996'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'E3B0726F-E3A6-4EE1-A905-89CD99561FCF'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'C802F5AC-15A3-4023-B8D1-BD810404B7B5'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'F0502C15-EFC2-40B3-A57D-BB9CE2EA7996'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'F0502C15-EFC2-40B3-A57D-BB9CE2EA7996'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'E3B0726F-E3A6-4EE1-A905-89CD99561FCF'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'C802F5AC-15A3-4023-B8D1-BD810404B7B5'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

/* Set categories for 17 fields */

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '29611C01-FAAF-4F0D-B468-E1C44D887CE0' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides."EntityID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Override Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7928AB00-4EE6-409E-9450-41D857FB6650' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides."ComponentID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Override Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Component',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '48F5B8E7-2FF3-492A-8EA8-2B8CE719FDC2' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides."Name"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Override Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '26D29D35-6566-4483-91B9-D4648BC6900A' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides."Description"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Override Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6266A8D6-4076-4205-B7C4-B356E18A4F28' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides."Scope"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Resolution Rules',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E3B0726F-E3A6-4EE1-A905-89CD99561FCF' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides."UserID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Resolution Rules',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '87C36F01-6073-4F02-9B1B-661F475CE4B9' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides."RoleID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Resolution Rules',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Role',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1942590C-6E7A-4AA3-8A94-AC669CE52DDE' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides."Priority"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Resolution Rules',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '651979FA-D370-4DB5-9A5A-B7E4320D8A6E' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides."Status"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Override Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C802F5AC-15A3-4023-B8D1-BD810404B7B5' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides."Notes"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Override Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EB691608-DCBF-4630-82AD-33A102FFA960' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '376B951E-67D4-47A8-BB7E-7A0195648478' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '53EC4001-4D4E-457B-AE9A-8EF9615DD994' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides."Entity"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Override Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F0502C15-EFC2-40B3-A57D-BB9CE2EA7996' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides."Component"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Override Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Component Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8E88ECE5-6A90-4006-B706-279F93897759' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides."User"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Resolution Rules',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'User Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D1987230-2CF0-4E94-B5A3-8272B7611671' AND "AutoUpdateCategory" = TRUE;

-- UPDATE Entity Field Category Info MJ: Entity Form Overrides."Role"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Resolution Rules',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Role Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4A174983-6830-432E-BE5A-D6BF936121DE' AND "AutoUpdateCategory" = TRUE;

/* Set entity icon to fa fa-window-restore */

UPDATE __mj."Entity"
               SET "Icon" = 'fa fa-window-restore', "__mj_UpdatedAt" = NOW()
               WHERE "ID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1';

/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('0dd43638-81f5-41c2-8912-897aac5607ea', 'BC845DBD-7248-4290-A5AD-7884C067E3A1', 'FieldCategoryInfo', '{"Override Configuration":{"icon":"fa fa-cogs","description":"Core technical mapping between entities and their UI components"},"Override Details":{"icon":"fa fa-info-circle","description":"Descriptive information and status of the form override"},"Resolution Rules":{"icon":"fa fa-project-diagram","description":"Logic defining scope, priority, and audience for the override"},"System Metadata":{"icon":"fa fa-database","description":"System-managed audit and tracking fields"}}', NOW(), NOW());

/* Insert FieldCategoryIcons setting (legacy) */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('5e45936f-e3e8-4008-9426-94f7926a8c42', 'BC845DBD-7248-4290-A5AD-7884C067E3A1', 'FieldCategoryIcons', '{"Override Configuration":"fa fa-cogs","Override Details":"fa fa-info-circle","Resolution Rules":"fa fa-project-diagram","System Metadata":"fa fa-database"}', NOW(), NOW());

/* Set DefaultForNewUser=false for NEW entity (category: supporting, confidence: high) */

UPDATE __mj."ApplicationEntity"
         SET "DefaultForNewUser" = FALSE, "__mj_UpdatedAt" = NOW()
         WHERE "EntityID" = 'BC845DBD-7248-4290-A5AD-7884C067E3A1';

/* Generated Validation Functions for MJ: Entity Form Overrides */
-- CHECK constraint for MJ: Entity Form Overrides @ Table Level was newly set or modified since the last generation of the validation function, the code was regenerated and updating the GeneratedCode table with the new generated validation function

INSERT INTO __mj."GeneratedCode" ("CategoryID", "GeneratedByModelID", "GeneratedAt", "Language", "Status", "Source", "Code", "Description", "Name", "LinkedEntityID", "LinkedRecordPrimaryKey")
                      VALUES ((SELECT "ID" FROM __mj."vwGeneratedCodeCategories" WHERE "Name"='CodeGen: Validators'), '7B31F48E-EDA3-47B4-9602-D98B7EB1AF45', NOW(), 'TypeScript', 'Approved', '([Scope]=''User'' AND [UserID] IS NOT NULL AND [RoleID] IS NULL OR [Scope]=''Role'' AND [RoleID] IS NOT NULL AND [UserID] IS NULL OR [Scope]=''Global'' AND [UserID] IS NULL AND [RoleID] IS NULL)', 'public ValidateScopeAndIdentifierConsistency(result: ValidationResult) {
	if (this."Scope" === ''User'') {
		if (this."UserID" == null || this."RoleID" != null) {
			result."Errors".push(new ValidationErrorInfo(
				"UserID",
				"When the scope is set to ''User'', a User must be specified and the Role must be left empty.",
				this."UserID",
				ValidationErrorType."Failure"
			));
		}
	} else if (this."Scope" === ''Role'') {
		if (this."RoleID" == null || this."UserID" != null) {
			result."Errors".push(new ValidationErrorInfo(
				"RoleID",
				"When the scope is set to ''Role'', a Role must be specified and the User must be left empty.",
				this."RoleID",
				ValidationErrorType."Failure"
			));
		}
	} else if (this."Scope" === ''Global'') {
		if (this."UserID" != null || this."RoleID" != null) {
			result."Errors".push(new ValidationErrorInfo(
				"Scope",
				"When the scope is set to ''Global'', both the User and Role fields must be empty.",
				this."Scope",
				ValidationErrorType."Failure"
			));
		}
	}
}', 'Ensures that the correct identifier is provided based on the selected scope: ''User'' requires a User ID without a Role, ''Role'' requires a Role ID without a User, and ''Global'' requires both to be empty. This prevents data inconsistency by ensuring records are correctly assigned to exactly one target type.', 'ValidateScopeAndIdentifierConsistency', 'E0238F34-2837-EF11-86D4-6045BDEE16E6', 'BC845DBD-7248-4290-A5AD-7884C067E3A1');


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityFormOverrides" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Entity Form Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Overrides
-- Item: Permissions for vwEntityFormOverrides
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityFormOverrides" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Entity Form Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Overrides
-- Item: spCreateEntityFormOverride
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityFormOverride
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityFormOverride" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Entity Form Overrides */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityFormOverride" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Entity Form Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Overrides
-- Item: spUpdateEntityFormOverride
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityFormOverride
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityFormOverride" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityFormOverride" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Form Overrides */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Form Overrides
-- Item: spDeleteEntityFormOverride
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityFormOverride
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityFormOverride" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Form Overrides */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityFormOverride" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON TABLE __mj."EntityFormOverride" IS 'Points an Entity at a Component to serve as its form at runtime. Scoped to User > Role > Global with priority-based resolution. When present and Active, takes precedence over the entity';

COMMENT ON COLUMN __mj."EntityFormOverride"."EntityID" IS 'Foreign key to Entity — which entity this override is for.';

COMMENT ON COLUMN __mj."EntityFormOverride"."ComponentID" IS 'Foreign key to Component — the component that renders the form. Must declare componentRole=';

COMMENT ON COLUMN __mj."EntityFormOverride"."Name" IS 'Human-readable label for this override (e.g., "CSR Customer Form", "Compact Mobile Variant").';

COMMENT ON COLUMN __mj."EntityFormOverride"."Description" IS 'Optional longer description of what this override is for and when it applies.';

COMMENT ON COLUMN __mj."EntityFormOverride"."Scope" IS 'Resolution tier: User (requires UserID), Role (requires RoleID), or Global. The resolver evaluates in that order — a User row beats a Role row beats a Global row.';

COMMENT ON COLUMN __mj."EntityFormOverride"."UserID" IS 'Required when Scope=';

COMMENT ON COLUMN __mj."EntityFormOverride"."RoleID" IS 'Required when Scope=';

COMMENT ON COLUMN __mj."EntityFormOverride"."Priority" IS 'Higher value wins within a scope tier. Ties broken by __mj_CreatedAt DESC. No IsDefault — Priority is the only mechanism.';

COMMENT ON COLUMN __mj."EntityFormOverride"."Status" IS 'Active = eligible for resolution. Inactive = ignored. Pending = AI-authored, awaiting human activation (resolver treats as Inactive).';

COMMENT ON COLUMN __mj."EntityFormOverride"."Notes" IS 'Optional free-form commentary about this override — e.g. who authored it, why it exists, what should change before it goes Global, links to related discussions. Does not affect resolution.';


-- ===================== Other =====================

-- Migration: Create EntityFormOverride table
-- Description: Bridge table that points an Entity at a Component to serve as
--   its form at runtime, scoped to User > Role > Global with priority-based
--   resolution. Foundation for Run-Time/Interactive Forms (plan PR #2609).
--
-- Resolution semantics (implemented client-side in form-resolver.service.ts):
--   1. Find Status='Active' rows for the entity matching the caller's scope.
--   2. Order by scope tier (User > Role > Global), then Priority DESC, then
--      __mj_CreatedAt DESC. First row wins.
--   3. If no row matches, fall through to the existing @RegisterClass /
--      CodeGen-generated form path — zero behavior change for entities with
--      no override.

/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: Entity Form Overrides */
