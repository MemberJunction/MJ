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

ALTER TABLE __mj."ComponentLibrary"
 ADD COLUMN IF NOT EXISTS "UsageInstructions" TEXT NULL;


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwComponentLibraries';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwComponentLibraries"
AS SELECT
    c.*
FROM
    __mj."ComponentLibrary" AS c$vsql$;
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
           WHERE proname = 'spCreateComponentLibrary'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spCreateComponentLibrary"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(500) DEFAULT NULL,
    IN p_DisplayName VARCHAR(500) DEFAULT NULL,
    IN p_Version VARCHAR(100) DEFAULT NULL,
    IN p_GlobalVariable VARCHAR(255) DEFAULT NULL,
    IN p_Category VARCHAR(100) DEFAULT NULL,
    IN p_CDNUrl VARCHAR(1000) DEFAULT NULL,
    IN p_CDNCssUrl VARCHAR(1000) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_LintRules TEXT DEFAULT NULL,
    IN p_Dependencies TEXT DEFAULT NULL,
    IN p_UsageType VARCHAR(50) DEFAULT NULL,
    IN p_UsageInstructions TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwComponentLibraries" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ComponentLibrary"
            (
                "ID",
                "Name",
                "DisplayName",
                "Version",
                "GlobalVariable",
                "Category",
                "CDNUrl",
                "CDNCssUrl",
                "Description",
                "Status",
                "LintRules",
                "Dependencies",
                "UsageType",
                "UsageInstructions"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_DisplayName,
                p_Version,
                p_GlobalVariable,
                p_Category,
                p_CDNUrl,
                p_CDNCssUrl,
                p_Description,
                COALESCE(p_Status, 'Active'),
                p_LintRules,
                p_Dependencies,
                COALESCE(p_UsageType, 'Both'),
                p_UsageInstructions
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ComponentLibrary"
            (
                "Name",
                "DisplayName",
                "Version",
                "GlobalVariable",
                "Category",
                "CDNUrl",
                "CDNCssUrl",
                "Description",
                "Status",
                "LintRules",
                "Dependencies",
                "UsageType",
                "UsageInstructions"
            )
        VALUES
            (
                p_Name,
                p_DisplayName,
                p_Version,
                p_GlobalVariable,
                p_Category,
                p_CDNUrl,
                p_CDNCssUrl,
                p_Description,
                COALESCE(p_Status, 'Active'),
                p_LintRules,
                p_Dependencies,
                COALESCE(p_UsageType, 'Both'),
                p_UsageInstructions
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwComponentLibraries" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spUpdateComponentLibrary'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spUpdateComponentLibrary"(
    IN p_ID UUID,
    IN p_Name VARCHAR(500) DEFAULT NULL,
    IN p_DisplayName VARCHAR(500) DEFAULT NULL,
    IN p_Version VARCHAR(100) DEFAULT NULL,
    IN p_GlobalVariable VARCHAR(255) DEFAULT NULL,
    IN p_Category VARCHAR(100) DEFAULT NULL,
    IN p_CDNUrl VARCHAR(1000) DEFAULT NULL,
    IN p_CDNCssUrl VARCHAR(1000) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_LintRules TEXT DEFAULT NULL,
    IN p_Dependencies TEXT DEFAULT NULL,
    IN p_UsageType VARCHAR(50) DEFAULT NULL,
    IN p_UsageInstructions TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwComponentLibraries" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ComponentLibrary"
    SET
        "Name" = COALESCE(p_Name, "Name"),
        "DisplayName" = COALESCE(p_DisplayName, "DisplayName"),
        "Version" = COALESCE(p_Version, "Version"),
        "GlobalVariable" = COALESCE(p_GlobalVariable, "GlobalVariable"),
        "Category" = COALESCE(p_Category, "Category"),
        "CDNUrl" = COALESCE(p_CDNUrl, "CDNUrl"),
        "CDNCssUrl" = COALESCE(p_CDNCssUrl, "CDNCssUrl"),
        "Description" = COALESCE(p_Description, "Description"),
        "Status" = COALESCE(p_Status, "Status"),
        "LintRules" = COALESCE(p_LintRules, "LintRules"),
        "Dependencies" = COALESCE(p_Dependencies, "Dependencies"),
        "UsageType" = COALESCE(p_UsageType, "UsageType"),
        "UsageInstructions" = COALESCE(p_UsageInstructions, "UsageInstructions")
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwComponentLibraries" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwComponentLibraries" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT oid::regprocedure AS sig FROM pg_proc
           WHERE proname = 'spDeleteComponentLibrary'
             AND pronamespace = '__mj'::regnamespace
  LOOP EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION __mj."spDeleteComponentLibrary"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ComponentLibrary"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateComponentLibrary_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateComponentLibrary" ON __mj."ComponentLibrary";
CREATE TRIGGER "trgUpdateComponentLibrary"
    BEFORE UPDATE ON __mj."ComponentLibrary"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateComponentLibrary_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '0d9048b3-ef1d-497d-8cb2-a70c8fc35cdb' OR ("EntityID" = '2264AA9A-2197-48E2-BB3D-A498006B37A5' AND "Name" = 'UsageInstructions')
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
        '0d9048b3-ef1d-497d-8cb2-a70c8fc35cdb',
        '2264AA9A-2197-48E2-BB3D-A498006B37A5', -- "Entity": "MJ": "Component" "Libraries"
        100031,
        'UsageInstructions',
        'Usage Instructions',
        'Markdown-formatted usage instructions for AI code generators and agents. Injected into prompts when a component references this library. Covers container requirements, initialization patterns, required config options, and common pitfalls. Distinct from Description which is a high-level summary of what the library does.',
        'TEXT',
        -1,
        0,         -- "Precision" (int)
        0,         -- "Scale" (int)
        TRUE,      -- "AllowsNull" (boolean — manually coerced from converter's `1`)
        NULL,      -- "DefaultValue"
        FALSE,     -- "AutoIncrement" (boolean — manually coerced from `0`)
        TRUE,      -- "AllowUpdateAPI" (boolean — manually coerced from `1`)
        FALSE,     -- "IsVirtual" (boolean — manually coerced from `0`)
        NULL,      -- "RelatedEntityID"
        NULL,      -- "RelatedEntityFieldName"
        FALSE,     -- "IsNameField" (boolean — from `0`)
        FALSE,     -- "IncludeInUserSearchAPI" (boolean — from `0`)
        FALSE,     -- "IncludeRelatedEntityNameFieldInBaseView" (boolean — from `0`)
        FALSE,     -- "DefaultInView" (boolean — from `0`)
        FALSE,     -- "IsPrimaryKey" (boolean — from `0`)
        FALSE,     -- "IsUnique" (boolean — from `0`)
        'Search',  -- "RelatedEntityDisplayType"
        NOW(),
        NOW()
        );
    END IF;
END $$;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '5C4868E1-CE8B-45D7-948A-CF4D0508CFAE'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = 'D989C070-1094-4777-8CC3-BA2FFC520ABB'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "IncludeInUserSearchAPI" = TRUE
               WHERE "ID" = '7366E819-CF7C-4F5F-94F5-CD01914DAD98'
               AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '3894C205-5E5F-4C7C-ADB2-9ACFA1D4F93C'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = '7366E819-CF7C-4F5F-94F5-CD01914DAD98'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Exact'
               WHERE "ID" = 'D989C070-1094-4777-8CC3-BA2FFC520ABB'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = '2264AA9A-2197-48E2-BB3D-A498006B37A5'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;
/* Set categories for 16 fields */
-- UPDATE Entity Field Category Info MJ: Component Libraries."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5FE19283-3176-4CC8-958C-7EC72018EAE1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Component Libraries."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3894C205-5E5F-4C7C-ADB2-9ACFA1D4F93C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Component Libraries."DisplayName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5C4868E1-CE8B-45D7-948A-CF4D0508CFAE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Component Libraries."Version"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DAF7974B-C104-44CA-960B-550BCBF3A523' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Component Libraries."GlobalVariable"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D989C070-1094-4777-8CC3-BA2FFC520ABB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Component Libraries."Category"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7366E819-CF7C-4F5F-94F5-CD01914DAD98' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Component Libraries."CDNUrl"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'CDN URL',
   "ExtendedType" = 'URL',
   "CodeType" = NULL
WHERE 
   "ID" = '3465499E-959F-41CC-8BBC-2E99E8A78473' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Component Libraries."CDNCssUrl"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'CDN CSS URL',
   "ExtendedType" = 'URL',
   "CodeType" = NULL
WHERE 
   "ID" = 'AA3C7D8C-9455-4CEF-9EE2-39B62C0B1EA7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Component Libraries."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C9652FDE-E74A-44EE-8C44-C155C9731D0D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Component Libraries."UsageInstructions"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Distribution & Assets',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0D9048B3-EF1D-497D-8CB2-A70C8FC35CDB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Component Libraries."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CB48A0F4-C84D-42AB-BD73-B075244F9655' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Component Libraries."LintRules"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '84EB967A-67A4-41C8-AB1F-54042A66BBDF' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Component Libraries."Dependencies"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '3A0C1530-DF4A-4630-A9E6-123CE4E2F117' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Component Libraries."UsageType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FD030E2A-3A2E-427F-971C-9D1CAED65A8B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Component Libraries.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AC898D19-1A34-4803-95F3-EC37A2FA5487' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Component Libraries.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'ED0C1E5D-4943-4CC9-9BFF-41D3F932606D' AND "AutoUpdateCategory" = TRUE;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwComponentLibraries" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Component Libraries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Libraries
-- Item: Permissions for vwComponentLibraries
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwComponentLibraries" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Component Libraries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Libraries
-- Item: spCreateComponentLibrary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ComponentLibrary
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateComponentLibrary" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Component Libraries */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateComponentLibrary" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Component Libraries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Libraries
-- Item: spUpdateComponentLibrary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ComponentLibrary
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateComponentLibrary" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateComponentLibrary" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Component Libraries */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Component Libraries
-- Item: spDeleteComponentLibrary
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ComponentLibrary
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteComponentLibrary" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Component Libraries */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteComponentLibrary" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."ComponentLibrary"."UsageInstructions" IS 'Markdown-formatted usage instructions for AI code generators and agents. Injected into prompts when a component references this library. Covers container requirements, initialization patterns, required config options, and common pitfalls. Distinct from Description which is a high-level summary of what the library does.';


-- ===================== Other =====================

-- Migration: Add UsageInstructions column to ComponentLibrary
--
-- Adds a dedicated TEXT column for structured usage instructions
-- that AI code generators and agents can consume. Separates "what the library
-- is" (Description) from "how to use it correctly" (UsageInstructions).
--
-- Example content: Chart.js container requirements, D3 SVG setup patterns,
-- antd Typography destructuring rules, etc.

/* spUpdate Permissions for MJ: Component Libraries */
