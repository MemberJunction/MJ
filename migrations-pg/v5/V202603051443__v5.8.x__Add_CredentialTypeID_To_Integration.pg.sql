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

-- Implicit INTEGER -> BOOLEAN cast (SQL Server BIT columns accept 0/1 in INSERTs)
-- PostgreSQL has a built-in explicit-only INTEGER->bool cast. We upgrade it to implicit
-- so INSERT VALUES with 0/1 for BOOLEAN columns work like SQL Server BIT.
UPDATE pg_cast SET castcontext = 'i'
WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype;


-- ===================== DDL: Tables, PKs, Indexes =====================

-- Migration: Add CredentialTypeID to Integration and CredentialID to CompanyIntegration
-- This links integrations to the credential system so the UI can:
--   1. Pre-select the correct credential type when creating credentials for an integration
--   2. Filter existing credentials by type when attaching to a company integration
--   3. Store a direct reference from CompanyIntegration to the new Credential entity

-- Add CredentialTypeID (nullable FK) to Integration
ALTER TABLE __mj."Integration"
 ADD COLUMN "CredentialTypeID" UUID NULL;

-- Add CredentialID (nullable FK) to CompanyIntegration
ALTER TABLE __mj."CompanyIntegration"
 ADD COLUMN "CredentialID" UUID NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegration_CompanyID" ON __mj."CompanyIntegration" ("CompanyID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegration_IntegrationID" ON __mj."CompanyIntegration" ("IntegrationID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegration_SourceTypeID" ON __mj."CompanyIntegration" ("SourceTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_CompanyIntegration_CredentialID" ON __mj."CompanyIntegration" ("CredentialID");

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

-- SKIPPED: References view "vwCompanyIntegrations" not created in this file (CodeGen will recreate)

-- SKIPPED: References view "vwCompanyIntegrations" not created in this file (CodeGen will recreate)

CREATE OR REPLACE FUNCTION __mj."spDeleteCompanyIntegration"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."CompanyIntegration"
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

CREATE OR REPLACE FUNCTION __mj."spCreateIntegration"(
    IN p_Name VARCHAR(100),
    IN p_Description VARCHAR(255),
    IN p_NavigationBaseURL VARCHAR(500),
    IN p_ClassName VARCHAR(100),
    IN p_ImportPath VARCHAR(100),
    IN p_BatchMaxRequestCount INTEGER DEFAULT NULL,
    IN p_BatchRequestWaitTime INTEGER DEFAULT NULL,
    IN p_ID UUID DEFAULT NULL,
    IN p_CredentialTypeID UUID DEFAULT NULL
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
                "CredentialTypeID"
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
                p_CredentialTypeID
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
                "CredentialTypeID"
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
                p_CredentialTypeID
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
    IN p_CredentialTypeID UUID
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
        "CredentialTypeID" = p_CredentialTypeID
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateCompanyIntegration_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateCompanyIntegration" ON __mj."CompanyIntegration";
CREATE TRIGGER "trgUpdateCompanyIntegration"
    BEFORE UPDATE ON __mj."CompanyIntegration"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateCompanyIntegration_func"();

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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '9a4502a9-0e22-4038-8341-01b9a9211e44' OR ("EntityID" = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'CredentialTypeID')
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
        '9a4502a9-0e22-4038-8341-01b9a9211e44',
        'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Integrations"
        100021,
        'CredentialTypeID',
        'Credential Type ID',
        'Optional link to the credential type required by this integration. Used by the UI to pre-select the credential type when creating new credentials and to filter existing credentials.',
        'UUID',
        16,
        0,
        0,
        1,
        NULL,
        0,
        1,
        0,
        'D512FF2E-A140-45A2-979A-20657AB77137',
        'ID',
        0,
        0,
        1,
        0,
        0,
        0,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '131b9cc4-3755-46f6-925a-7e3a13bcdfd6' OR ("EntityID" = 'DE238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'CredentialID')
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
        '131b9cc4-3755-46f6-925a-7e3a13bcdfd6',
        'DE238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Company" "Integrations"
        100045,
        'CredentialID',
        'Credential ID',
        'Optional reference to a Credential record that stores encrypted authentication values for this company integration. Replaces the legacy inline auth fields (AccessToken, RefreshToken, APIKey, etc.).',
        'UUID',
        16,
        0,
        0,
        1,
        NULL,
        0,
        1,
        0,
        '7E023DDF-82C6-4B0C-9650-8D35699B9FD0',
        'ID',
        0,
        0,
        1,
        0,
        0,
        0,
        'Search',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '86c97642-5ce8-475a-b3bf-ce6e1857beb4'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('86c97642-5ce8-475a-b3bf-ce6e1857beb4', 'D512FF2E-A140-45A2-979A-20657AB77137', 'DD238F34-2837-EF11-86D4-6045BDEE16E6', 'CredentialTypeID', 'One To Many', 1, 1, 4, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityRelationship" WHERE "ID" = '385afc53-989f-4fc6-924d-cec4c8a9aa21'
    ) THEN
        INSERT INTO __mj."EntityRelationship" ("ID", "EntityID", "RelatedEntityID", "RelatedEntityJoinField", "Type", "BundleInAPI", "DisplayInForm", "Sequence", "__mj_CreatedAt", "__mj_UpdatedAt")
        VALUES ('385afc53-989f-4fc6-924d-cec4c8a9aa21', '7E023DDF-82C6-4B0C-9650-8D35699B9FD0', 'DE238F34-2837-EF11-86D4-6045BDEE16E6', 'CredentialID', 'One To Many', 1, 1, 6, NOW(), NOW());
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '40ad55dc-4d32-4225-bbb9-fdd3ccd62eba' OR ("EntityID" = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'CredentialType')
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
        '40ad55dc-4d32-4225-bbb9-fdd3ccd62eba',
        'DD238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Integrations"
        100023,
        'CredentialType',
        'Credential Type',
        NULL,
        'TEXT',
        200,
        0,
        0,
        1,
        NULL,
        0,
        0,
        1,
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
               WHERE "ID" = '40AD55DC-4D32-4225-BBB9-FDD3CCD62EBA'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '0F5817F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '345817F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '40AD55DC-4D32-4225-BBB9-FDD3CCD62EBA'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;
/* Set categories for 12 fields */
-- UPDATE Entity Field Category Info MJ: Integrations."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0E5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integrations."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Description',
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
-- UPDATE Entity Field Category Info MJ: Integrations."ClassName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'TypeScript'
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
   "Category" = 'Authentication & Security',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Credential Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9A4502A9-0E22-4038-8341-01B9A9211E44' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integrations."CredentialType"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Authentication & Security',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Credential Type Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '40AD55DC-4D32-4225-BBB9-FDD3CCD62EBA' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integrations."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0D5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integrations."__mj_CreatedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '495817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Integrations."__mj_UpdatedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('d13fc7c4-57a1-4bc9-b828-7412b39a4c03', 'DD238F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Authentication & Security":{"icon":"fa fa-shield-alt","description":"Configuration regarding credential requirements and secure access for the integration."}}', NOW(), NOW());
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Authentication & Security":"fa fa-shield-alt"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'DD238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'FieldCategoryIcons';
/* Set categories for 26 fields */
-- UPDATE Entity Field Category Info MJ: Company Integrations."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '115817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."CompanyID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '125817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."IntegrationID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '135817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."IsActive"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '145817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '64799DD4-A537-4B9C-897F-EC2AFE9A28D0' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."SourceTypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F647023E-D909-4ECB-B59D-EE477C274827' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."Company"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '365817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."Integration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '375817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."IsExternalSystemReadOnly"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B24217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."AccessToken"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '155817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."RefreshToken"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '165817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."TokenExpirationDate"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '175817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."APIKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '185817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."ClientID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B34217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."ClientSecret"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B44217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."CredentialID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Credentials & Tokens',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Credential',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '131B9CC4-3755-46F6-925A-7E3A13BCDFD6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."ExternalSystemID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '425817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."CustomAttribute1"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C44217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."Configuration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '987EAF20-227F-4043-BD87-06C9E01598F4' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."DriverClassName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '385817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."DriverImportPath"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '395817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."LastRunID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Last Run',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3A5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."LastRunStartedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3B5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."LastRunEndedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3C5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."__mj_CreatedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0D5917F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Company Integrations."__mj_UpdatedAt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E85817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;


-- ===================== FK & CHECK Constraints =====================

ALTER TABLE __mj."Integration"
ADD CONSTRAINT FK_Integration_CredentialType
    FOREIGN KEY ("CredentialTypeID")
    REFERENCES __mj."CredentialType"("ID") DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE __mj."CompanyIntegration"
ADD CONSTRAINT FK_CompanyIntegration_Credential
    FOREIGN KEY ("CredentialID")
    REFERENCES __mj."Credential"("ID") DEFERRABLE INITIALLY DEFERRED;


-- ===================== Grants =====================

-- SKIPPED (view not created): GRANT SELECT ON __mj."vwCompanyIntegrations" TO "cdp_UI", "cdp_Integration", "cdp_Developer"

/* spCreate SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spCreateCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spCreateCompanyIntegration" TO "cdp_Integration", "cdp_Developer"
    

/* spCreate Permissions for MJ: Company Integrations */

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spCreateCompanyIntegration" TO "cdp_Integration", "cdp_Developer"


/* spUpdate SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spUpdateCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spUpdateCompanyIntegration" TO "cdp_Integration", "cdp_Developer"

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spUpdateCompanyIntegration" TO "cdp_Integration", "cdp_Developer"


/* spDelete SQL for MJ: Company Integrations */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Company Integrations
-- Item: spDeleteCompanyIntegration
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR CompanyIntegration
------------------------------------------------------------

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Company Integrations */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteCompanyIntegration" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for Integration */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integrations
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key CredentialTypeID in table Integration;

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
/* spCreate Permissions for MJ: Integrations */;

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
/* spDelete Permissions for MJ: Integrations */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegration" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* SQL text to insert new entity field */;


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."Integration"."CredentialTypeID" IS 'Optional link to the credential type required by this integration. Used by the UI to pre-select the credential type when creating new credentials and to filter existing credentials.';

COMMENT ON COLUMN __mj."CompanyIntegration"."CredentialID" IS 'Optional reference to a Credential record that stores encrypted authentication values for this company integration. Replaces the legacy inline auth fields (AccessToken, RefreshToken, APIKey, etc.).';


-- ===================== Other =====================

-- CODE GEN RUN
/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: Company Integrations */

/* spUpdate Permissions for MJ: Integrations */
