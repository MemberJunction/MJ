
-- ===================== DDL: Tables, PKs, Indexes =====================

-- Add CredentialID to VectorDatabase so vector DB providers (Pinecone, etc.)
-- can use the MJ Credential Engine for encrypted API key storage instead of
-- relying solely on environment variables.
--
-- Follows the same pattern as FileStorageAccount."CredentialID" and
-- CompanyIntegration."CredentialID".
--
-- Changes:
--   VectorDatabase: +CredentialID (nullable FK to Credential)

ALTER TABLE __mj."VectorDatabase"
 ADD COLUMN "CredentialID" UUID NULL
        CONSTRAINT FK_VectorDatabase_Credential REFERENCES __mj."Credential"("ID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_VectorDatabase_CredentialID" ON __mj."VectorDatabase" ("CredentialID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwVectorDatabases';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwVectorDatabases"
AS SELECT
    v.*,
    "MJCredential_CredentialID"."Name" AS "Credential"
FROM
    __mj."VectorDatabase" AS v
LEFT OUTER JOIN
    __mj."Credential" AS "MJCredential_CredentialID"
  ON
    v."CredentialID" = "MJCredential_CredentialID"."ID"$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateVectorDatabase"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(100) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_DefaultURL VARCHAR(255) DEFAULT NULL,
    IN p_ClassKey VARCHAR(100) DEFAULT NULL,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_CredentialID UUID DEFAULT NULL
)
RETURNS SETOF __mj."vwVectorDatabases" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."VectorDatabase"
            (
                "ID",
                "Name",
                "Description",
                "DefaultURL",
                "ClassKey",
                "Configuration",
                "CredentialID"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_DefaultURL,
                p_ClassKey,
                p_Configuration,
                p_CredentialID
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."VectorDatabase"
            (
                "Name",
                "Description",
                "DefaultURL",
                "ClassKey",
                "Configuration",
                "CredentialID"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_DefaultURL,
                p_ClassKey,
                p_Configuration,
                p_CredentialID
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwVectorDatabases" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateVectorDatabase"(
    IN p_ID UUID,
    IN p_Name VARCHAR(100),
    IN p_Description TEXT,
    IN p_DefaultURL VARCHAR(255),
    IN p_ClassKey VARCHAR(100),
    IN p_Configuration TEXT,
    IN p_CredentialID UUID
)
RETURNS SETOF __mj."vwVectorDatabases" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."VectorDatabase"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DefaultURL" = p_DefaultURL,
        "ClassKey" = p_ClassKey,
        "Configuration" = p_Configuration,
        "CredentialID" = p_CredentialID
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwVectorDatabases" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwVectorDatabases" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteVectorDatabase"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."VectorDatabase"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateVectorDatabase_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateVectorDatabase" ON __mj."VectorDatabase";
CREATE TRIGGER "trgUpdateVectorDatabase"
    BEFORE UPDATE ON __mj."VectorDatabase"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateVectorDatabase_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cd29ceae-e2b8-4a61-9603-ac7a08756751' OR ("EntityID" = '20248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'CredentialID')
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
        'cd29ceae-e2b8-4a61-9603-ac7a08756751',
        '20248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Vector" "Databases"
        100017,
        'CredentialID',
        'Credential ID',
        'Optional link to a stored credential containing the API key and any other authentication details for this vector database provider. When set, the Credential Engine decrypts and supplies the key at runtime. When NULL, the system falls back to the environment variable AI_VENDOR_API_KEY__<ClassKey>.',
        'UUID',
        16,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        TRUE,
        FALSE,
        '7E023DDF-82C6-4B0C-9650-8D35699B9FD0',
        'ID',
        FALSE,
        FALSE,
        TRUE,
        FALSE,
        FALSE,
        FALSE,
        'Dropdown',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '6b154175-cb08-4d0b-b443-ed51f38185f2'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('6b154175-cb08-4d0b-b443-ed51f38185f2', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', '20248F34-2837-EF11-86D4-6045BDEE16E6', 'CredentialID', 'One To Many', TRUE, TRUE, 3, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1a404106-4589-4bcb-b254-541252e1a4f5' OR ("EntityID" = '20248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Credential')
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
        '1a404106-4589-4bcb-b254-541252e1a4f5',
        '20248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Vector" "Databases"
        100019,
        'Credential',
        'Credential',
        NULL,
        'TEXT',
        400,
        0,
        0,
        TRUE,
        NULL,
        FALSE,
        FALSE,
        TRUE,
        NULL,
        NULL,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        FALSE,
        'Dropdown',
        NOW(),
        NOW()
        );
    END IF;
END $$;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '1A404106-4589-4BCB-B254-541252E1A4F5'
               AND "AutoUpdateDefaultInView" = TRUE;
/* Set categories for 10 fields */
-- UPDATE Entity Field Category Info MJ: Vector Databases."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E64317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Vector Databases."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E74317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Vector Databases."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E84317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Vector Databases."DefaultURL"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'URL',
   "CodeType" = NULL
WHERE 
   "ID" = 'E94317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Vector Databases."ClassKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EA4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Vector Databases."Configuration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '2C4F4B15-7A37-49FA-87D5-6EF9D5B66699' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Vector Databases."CredentialID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Authentication',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Credential',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CD29CEAE-E2B8-4A61-9603-AC7A08756751' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Vector Databases."Credential"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Authentication',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Credential Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1A404106-4589-4BCB-B254-541252E1A4F5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Vector Databases.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C85817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Vector Databases.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C95817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('99f83bef-a7af-4326-a7c3-c8677700174b', '20248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Authentication":{"icon":"fa fa-key","description":"Security credentials and authentication settings for connecting to the vector database service."}}', NOW(), NOW());
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Authentication":"fa fa-key"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = '20248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'FieldCategoryIcons';


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwVectorDatabases" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Vector Databases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Databases
-- Item: Permissions for vwVectorDatabases
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwVectorDatabases" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Vector Databases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Databases
-- Item: spCreateVectorDatabase
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR VectorDatabase
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateVectorDatabase" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Vector Databases */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateVectorDatabase" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Vector Databases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Databases
-- Item: spUpdateVectorDatabase
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR VectorDatabase
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateVectorDatabase" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateVectorDatabase" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Vector Databases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Databases
-- Item: spDeleteVectorDatabase
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR VectorDatabase
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteVectorDatabase" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Vector Databases */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteVectorDatabase" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."VectorDatabase"."CredentialID" IS 'Optional link to a stored credential containing the API key and any other authentication details for this vector database provider. When set, the Credential Engine decrypts and supplies the key at runtime. When NULL, the system falls back to the environment variable AI_VENDOR_API_KEY__<ClassKey>.';


-- ===================== Other =====================

/* spUpdate Permissions for MJ: Vector Databases */
