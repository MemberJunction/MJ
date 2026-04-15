
-- ===================== DDL: Tables, PKs, Indexes =====================

-- Add Icon column to Integration table
-- Supports Font Awesome CSS classes (e.g., "fa-solid fa-link"),
-- full URLs (e.g., "https://example.com/logo.png"),
-- or base64 data URIs (e.g., "data:BYTEA/png;base64,...")
ALTER TABLE __mj."Integration"
 ADD COLUMN "Icon" TEXT NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Integration_CredentialTypeID" ON __mj."Integration" ("CredentialTypeID");


-- ===================== Views =====================

DO $do$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwIntegrations"
AS SELECT
    i.*,
    "MJCredentialType_CredentialTypeID"."Name" AS "CredentialType"
FROM
    __mj."Integration" AS i
LEFT OUTER JOIN
    __mj."CredentialType" AS "MJCredentialType_CredentialTypeID"
  ON
    i."CredentialTypeID" = "MJCredentialType_CredentialTypeID"."ID"$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS __mj."vwIntegrations" CASCADE;
  EXECUTE vsql;
END;
$do$;


-- ===================== Stored Procedures (sp*) =====================

CREATE OR REPLACE FUNCTION __mj."spCreateIntegration"(
    IN p_Name VARCHAR(100),
    IN p_Description VARCHAR(255),
    IN p_NavigationBaseURL VARCHAR(500),
    IN p_ClassName VARCHAR(100),
    IN p_ImportPath VARCHAR(100),
    IN p_BatchMaxRequestCount INTEGER DEFAULT NULL,
    IN p_BatchRequestWaitTime INTEGER DEFAULT NULL,
    IN p_ID UUID DEFAULT NULL,
    IN p_CredentialTypeID UUID DEFAULT NULL,
    IN p_Icon TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwIntegrations" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."Integration"
            (
                "ID",
                "Name",
                "Description",
                "NavigationBaseURL",
                "ClassName",
                "ImportPath",
                "BatchMaxRequestCount",
                "BatchRequestWaitTime",
                "CredentialTypeID",
                "Icon"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_NavigationBaseURL,
                p_ClassName,
                p_ImportPath,
                COALESCE(p_BatchMaxRequestCount, -1),
                COALESCE(p_BatchRequestWaitTime, -1),
                p_CredentialTypeID,
                p_Icon
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."Integration"
            (
                "Name",
                "Description",
                "NavigationBaseURL",
                "ClassName",
                "ImportPath",
                "BatchMaxRequestCount",
                "BatchRequestWaitTime",
                "CredentialTypeID",
                "Icon"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_NavigationBaseURL,
                p_ClassName,
                p_ImportPath,
                COALESCE(p_BatchMaxRequestCount, -1),
                COALESCE(p_BatchRequestWaitTime, -1),
                p_CredentialTypeID,
                p_Icon
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwIntegrations" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateIntegration"(
    IN p_Name VARCHAR(100),
    IN p_Description VARCHAR(255),
    IN p_NavigationBaseURL VARCHAR(500),
    IN p_ClassName VARCHAR(100),
    IN p_ImportPath VARCHAR(100),
    IN p_BatchMaxRequestCount INTEGER,
    IN p_BatchRequestWaitTime INTEGER,
    IN p_ID UUID,
    IN p_CredentialTypeID UUID,
    IN p_Icon TEXT
)
RETURNS SETOF __mj."vwIntegrations" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."Integration"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "NavigationBaseURL" = p_NavigationBaseURL,
        "ClassName" = p_ClassName,
        "ImportPath" = p_ImportPath,
        "BatchMaxRequestCount" = p_BatchMaxRequestCount,
        "BatchRequestWaitTime" = p_BatchRequestWaitTime,
        "CredentialTypeID" = p_CredentialTypeID,
        "Icon" = p_Icon
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwIntegrations" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwIntegrations" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteIntegration"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Integration"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateIntegration_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateIntegration" ON __mj."Integration";
CREATE TRIGGER "trgUpdateIntegration"
    BEFORE UPDATE ON __mj."Integration"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateIntegration_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'c2a2f579-8a45-4eeb-aa3d-06b479de0edd' OR ("EntityID" = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Icon')
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
        'c2a2f579-8a45-4eeb-aa3d-06b479de0edd',
        'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Integrations"
        100024,
        'Icon',
        'Icon',
        'Icon for the integration. Supports Font Awesome CSS classes, BYTEA URLs, or base64 data URIs.',
        'TEXT',
        -1,
        0,
        0,
        1,
        NULL,
        0,
        1,
        0,
        NULL,
        NULL,
        0,
        0,
        0,
        0,
        0,
        0,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = 'C2A2F579-8A45-4EEB-AA3D-06B479DE0EDD'
               AND "AutoUpdateDefaultInView" = 1;
/* Set categories for 13 fields */
-- UPDATE Entity Field Category Info MJ: Integrations."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0E5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integrations."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0F5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integrations."NavigationBaseURL"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'URL',
   "CodeType" = NULL
WHERE 
   "ID" = '105817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integrations."Icon"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Integration Overview',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C2A2F579-8A45-4EEB-AA3D-06B479DE0EDD' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integrations."ClassName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '345817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integrations."ImportPath"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '355817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integrations."BatchMaxRequestCount"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B04217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integrations."BatchRequestWaitTime"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B14217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integrations."CredentialTypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9A4502A9-0E22-4038-8341-01B9A9211E44' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integrations."CredentialType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '40AD55DC-4D32-4225-BBB9-FDD3CCD62EBA' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integrations."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0D5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integrations.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '495817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integrations.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;


-- ===================== Grants =====================

GRANT SELECT ON __mj."vwIntegrations" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* Base View Permissions SQL for MJ: Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: Permissions for vwIntegrations
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwIntegrations" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: spCreateIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Integration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIntegration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Integrations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIntegration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: spUpdateIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Integration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: spDeleteIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Integration
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Integrations */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."Integration"."Icon" IS 'Icon for the integration. Supports Font Awesome CSS classes, image URLs, or base64 data URIs.';


-- ===================== Other =====================

-- CODE GEN RUN
/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: Integrations */
