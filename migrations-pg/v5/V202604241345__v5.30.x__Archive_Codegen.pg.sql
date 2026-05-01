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

-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwArchiveRunDetails';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwArchiveRunDetails"
AS SELECT
    a.*,
    "MJArchiveRun_ArchiveRunID"."StartedAt" AS "ArchiveRun",
    "MJEntity_EntityID"."Name" AS "Entity"
FROM
    __mj."ArchiveRunDetail" AS a
INNER JOIN
    __mj."ArchiveRun" AS "MJArchiveRun_ArchiveRunID"
  ON
    a."ArchiveRunID" = "MJArchiveRun_ArchiveRunID"."ID"
INNER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    a."EntityID" = "MJEntity_EntityID"."ID"$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateArchiveRunDetail"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ArchiveRunID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_RecordID VARCHAR(750) DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_StoragePath VARCHAR(1000) DEFAULT NULL,
    IN p_BytesArchived BIGINT DEFAULT NULL,
    IN p_ErrorMessage TEXT DEFAULT NULL,
    IN p_ArchivedAt TIMESTAMPTZ DEFAULT NULL,
    IN p_VersionStamp TIMESTAMPTZ DEFAULT NULL,
    IN p_IsRecordChangeArchive BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwArchiveRunDetails" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ArchiveRunDetail"
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
                p_ID,
                p_ArchiveRunID,
                p_EntityID,
                p_RecordID,
                p_Status,
                p_StoragePath,
                COALESCE(p_BytesArchived, 0),
                p_ErrorMessage,
                p_ArchivedAt,
                p_VersionStamp,
                COALESCE(p_IsRecordChangeArchive, FALSE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ArchiveRunDetail"
            (
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
                p_ArchiveRunID,
                p_EntityID,
                p_RecordID,
                p_Status,
                p_StoragePath,
                COALESCE(p_BytesArchived, 0),
                p_ErrorMessage,
                p_ArchivedAt,
                p_VersionStamp,
                COALESCE(p_IsRecordChangeArchive, FALSE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwArchiveRunDetails" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateArchiveRunDetail"(
    IN p_ID UUID,
    IN p_ArchiveRunID UUID,
    IN p_EntityID UUID,
    IN p_RecordID VARCHAR(750),
    IN p_Status VARCHAR(50),
    IN p_StoragePath VARCHAR(1000),
    IN p_BytesArchived BIGINT,
    IN p_ErrorMessage TEXT,
    IN p_ArchivedAt TIMESTAMPTZ,
    IN p_VersionStamp TIMESTAMPTZ,
    IN p_IsRecordChangeArchive BOOLEAN
)
RETURNS SETOF __mj."vwArchiveRunDetails" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ArchiveRunDetail"
    SET
        "ArchiveRunID" = p_ArchiveRunID,
        "EntityID" = p_EntityID,
        "RecordID" = p_RecordID,
        "Status" = p_Status,
        "StoragePath" = p_StoragePath,
        "BytesArchived" = p_BytesArchived,
        "ErrorMessage" = p_ErrorMessage,
        "ArchivedAt" = p_ArchivedAt,
        "VersionStamp" = p_VersionStamp,
        "IsRecordChangeArchive" = p_IsRecordChangeArchive
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwArchiveRunDetails" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwArchiveRunDetails" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteArchiveRunDetail"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ArchiveRunDetail"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateArchiveRunDetail_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateArchiveRunDetail" ON __mj."ArchiveRunDetail";
CREATE TRIGGER "trgUpdateArchiveRunDetail"
    BEFORE UPDATE ON __mj."ArchiveRunDetail"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateArchiveRunDetail_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ec2a696b-acb1-4b02-bc57-10c5dac8dbc7' OR ("EntityID" = 'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6' AND "Name" = 'ArchiveRun')
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
        'ec2a696b-acb1-4b02-bc57-10c5dac8dbc7',
        'C30F80EC-E7CE-468E-B6C6-B8888F0F45C6', -- "Entity": "MJ": "Archive" "Run" "Details"
        100028,
        'ArchiveRun',
        'Archive Run',
        NULL,
        'TIMESTAMPTZ',
        10,
        34,
        7,
        FALSE,
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
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'Contains'
               WHERE "ID" = '2CD99CC3-14AC-466E-B9D1-CE5E050B58AA'
               AND "AutoUpdateUserSearchPredicate" = TRUE;
/* Set categories for 15 fields */
-- UPDATE Entity Field Category Info MJ: Archive Run Details."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '79525349-F1A7-45CD-BDDB-15D45E1EA4D5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B90E24FD-D3A9-4D00-A94B-17E2B1FB2FE3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EB7FEB68-C246-4B48-9518-B8BCF5793611' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."ArchiveRunID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0C1AE9BD-D895-4ECF-B65B-43EA80D9949C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."EntityID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6170C43C-462B-42B1-972B-1D8B7789682B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."RecordID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2CD99CC3-14AC-466E-B9D1-CE5E050B58AA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."Entity"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Entity Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0A500C87-F127-4776-8EEF-7ECA8E7A414C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."ArchiveRun"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Archive Context',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Archive Run Timestamp',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EC2A696B-ACB1-4B02-BC57-10C5DAC8DBC7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B67B2260-8850-40F9-8902-5D91D0159FE7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."StoragePath"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2A48A363-DC62-4DD2-833B-EB7CFBABB283' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."BytesArchived"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5B53CD8F-01E4-41C3-A6E3-313A83103ECF' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."ErrorMessage"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0823FBF5-191B-4799-A64E-778C6AF033A1' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."ArchivedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BFCCF263-AF8A-405C-B57D-473AAC8A9E90' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."VersionStamp"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '07F192B4-3A6D-4FEB-869B-6ED067BB82F0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Archive Run Details."IsRecordChangeArchive"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4959B7F3-AD32-40DD-8E3F-8DF97E4C6844' AND "AutoUpdateCategory" = TRUE;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwArchiveRunDetails" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: Permissions for vwArchiveRunDetails
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwArchiveRunDetails" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: spCreateArchiveRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ArchiveRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArchiveRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Archive Run Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateArchiveRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: spUpdateArchiveRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ArchiveRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArchiveRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateArchiveRunDetail" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Archive Run Details */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Archive Run Details
-- Item: spDeleteArchiveRunDetail
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ArchiveRunDetail
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveRunDetail" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Archive Run Details */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteArchiveRunDetail" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */


-- ===================== Other =====================

/* SQL text to update entity field related entity name field map for entity field ID 0C1AE9BD-D895-4ECF-B65B-43EA80D9949C */

/* spUpdate Permissions for MJ: Archive Run Details */
