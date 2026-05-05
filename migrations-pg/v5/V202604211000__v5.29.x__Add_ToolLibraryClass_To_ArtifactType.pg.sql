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

-- ===================== DDL: Tables, PKs, Indexes =====================

-- Add ToolLibraryClass column to ArtifactType entity.
-- Enables plugin-based artifact tool resolution: each artifact type can register
-- a BaseArtifactToolLibrary subclass that provides type-specific exploration tools
-- for agents. When set, ArtifactToolManager resolves the library via ClassFactory.
-- When NULL, falls back to name-based heuristic resolution.

ALTER TABLE __mj."ArtifactType"
 ADD COLUMN "ToolLibraryClass" VARCHAR(100) NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ArtifactType_ParentID" ON __mj."ArtifactType" ("ParentID");


-- ===================== Helper Functions (fn*) =====================

CREATE OR REPLACE FUNCTION __mj."fnArtifactTypeParentID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "ParentID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."ArtifactType"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."ParentID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."ArtifactType" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ParentID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ParentID" IS NULL
    ORDER BY
        "RootParentID"

LIMIT 1
$$ LANGUAGE sql;


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwArtifactTypes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwArtifactTypes"
AS SELECT
    a.*,
    "MJArtifactType_ParentID"."Name" AS "Parent",
    "root_ParentID"."RootID" AS "RootParentID"
FROM
    __mj."ArtifactType" AS a
LEFT OUTER JOIN
    __mj."ArtifactType" AS "MJArtifactType_ParentID"
  ON
    a."ParentID" = "MJArtifactType_ParentID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnArtifactTypeParentID_GetRootID"(a."ID", a."ParentID")) AS "root_ParentID" ON TRUE$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateArtifactType"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(100) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_ContentType VARCHAR(100) DEFAULT NULL,
    IN p_IsEnabled BOOLEAN DEFAULT NULL,
    IN p_ParentID UUID DEFAULT NULL,
    IN p_ExtractRules TEXT DEFAULT NULL,
    IN p_DriverClass VARCHAR(255) DEFAULT NULL,
    IN p_Icon VARCHAR(255) DEFAULT NULL,
    IN p_ContentCategory VARCHAR(10) DEFAULT NULL,
    IN p_ToolLibraryClass VARCHAR(100) DEFAULT NULL
)
RETURNS SETOF __mj."vwArtifactTypes" AS
$$
DECLARE
    p_ActualID UUID := COALESCE(p_ID, gen_random_uuid());
BEGIN
INSERT INTO
    __mj."ArtifactType"
        (
            "Name",
                "Description",
                "ContentType",
                "IsEnabled",
                "ParentID",
                "ExtractRules",
                "DriverClass",
                "Icon",
                "ContentCategory",
                "ToolLibraryClass",
                "ID"
        )
    VALUES
        (
            p_Name,
                p_Description,
                p_ContentType,
                COALESCE(p_IsEnabled, TRUE),
                p_ParentID,
                p_ExtractRules,
                p_DriverClass,
                p_Icon,
                COALESCE(p_ContentCategory, 'Text'),
                p_ToolLibraryClass,
                p_ActualID
        );
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwArtifactTypes" WHERE "ID" = p_ActualID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateArtifactType"(
    IN p_ID UUID,
    IN p_Name VARCHAR(100),
    IN p_Description TEXT,
    IN p_ContentType VARCHAR(100),
    IN p_IsEnabled BOOLEAN,
    IN p_ParentID UUID,
    IN p_ExtractRules TEXT,
    IN p_DriverClass VARCHAR(255),
    IN p_Icon VARCHAR(255),
    IN p_ContentCategory VARCHAR(10),
    IN p_ToolLibraryClass VARCHAR(100)
)
RETURNS SETOF __mj."vwArtifactTypes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ArtifactType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "ContentType" = p_ContentType,
        "IsEnabled" = p_IsEnabled,
        "ParentID" = p_ParentID,
        "ExtractRules" = p_ExtractRules,
        "DriverClass" = p_DriverClass,
        "Icon" = p_Icon,
        "ContentCategory" = p_ContentCategory,
        "ToolLibraryClass" = p_ToolLibraryClass
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwArtifactTypes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwArtifactTypes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteArtifactType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArtifactType"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateArtifactType_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateArtifactType" ON __mj."ArtifactType";
CREATE TRIGGER "trgUpdateArtifactType"
    BEFORE UPDATE ON __mj."ArtifactType"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateArtifactType_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd7ee9cd5-da00-4d5c-ad67-a54b0ab7048b' OR ("EntityID" = '91797885-7128-4B71-8C4B-81C5FEE24F38' AND "Name" = 'ToolLibraryClass')
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
        'd7ee9cd5-da00-4d5c-ad67-a54b0ab7048b',
        '91797885-7128-4B71-8C4B-81C5FEE24F38', -- "Entity": "MJ": "Artifact" "Types"
        100028,
        'ToolLibraryClass',
        'Tool Library Class',
        'Class name for the BaseArtifactToolLibrary subclass that provides type-specific artifact exploration tools for agents. Resolved via ClassFactory. When NULL, ArtifactToolManager uses name-based fallback resolution.',
        'TEXT',
        200,
        0,
        0,
        TRUE,
        NULL,
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
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '79A9CC18-2F29-4D9C-93CB-82D9ED497B05'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = '91797885-7128-4B71-8C4B-81C5FEE24F38'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;
/* Set categories for 15 fields */
-- UPDATE Entity Field Category Info MJ: Artifact Types."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E3C8A690-7E75-499E-B603-3F900AB94704' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '79A9CC18-2F29-4D9C-93CB-82D9ED497B05' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '874E9B47-A201-4C78-896A-D41A607B1840' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."ContentType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B7B428EF-DE10-4882-8517-28636332C6DB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."IsEnabled"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A0B16E34-7C24-4811-84E6-75CCA5C499FB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."DriverClass"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2FEDE9AF-F0FE-438C-A369-93AC24A882C1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."Icon"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '011BB58C-1187-4107-A82E-D8C676A2A983' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."ContentCategory"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2492DE21-A1E2-497B-9B47-96CC61A08164' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."ToolLibraryClass"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Artifact Type Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D7EE9CD5-DA00-4D5C-AD67-A54B0AB7048B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."ParentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '02B6383F-BAE6-465C-BBB4-652E6F75A74C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."ExtractRules"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Extraction Rules',
   "ExtendedType" = 'Code',
   "CodeType" = 'TypeScript'
WHERE 
   "ID" = '6CACE3BF-BDF2-4443-9D2C-E28E4FE4E489' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."Parent"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '63D25BCF-550E-4013-AB1F-03657369B0E9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types."RootParentID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6C369578-B099-4E25-98B5-8218CE90A432' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A8CC25C6-C9DE-4726-9BA5-81E0C4749281' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Artifact Types.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6AE8938F-5656-4CC8-89BC-1CCAAC9DF213' AND "AutoUpdateCategory" = TRUE;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwArtifactTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: Permissions for vwArtifactTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwArtifactTypes" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spCreateArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArtifactType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArtifactType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Artifact Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArtifactType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spUpdateArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArtifactType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArtifactType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArtifactType" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Artifact Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Artifact Types
-- Item: spDeleteArtifactType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArtifactType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Artifact Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArtifactType" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."ArtifactType"."ToolLibraryClass" IS 'Class name for the BaseArtifactToolLibrary subclass that provides type-specific artifact exploration tools for agents. Resolved via ClassFactory. When NULL, ArtifactToolManager uses name-based fallback resolution.';


-- ===================== Other =====================

-- CODE GEN RUN
/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: Artifact Types */
