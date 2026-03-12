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

-- Add AllowMultipleSubtypes column to Entity table
-- Enables overlapping IS-A subtypes where a parent record can simultaneously
-- exist as multiple child types (e.g., a Person can be both a Member and a Volunteer).
-- Default false (0) preserves current disjoint behavior for all existing entities.

ALTER TABLE __mj."Entity"
 ADD COLUMN "AllowMultipleSubtypes" BOOLEAN NOT NULL
    CONSTRAINT DF_Entity_AllowMultipleSubtypes DEFAULT 0;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_Entity_ParentID" ON __mj."Entity" ("ParentID");


-- ===================== Stored Procedures (sp*) =====================

-- SKIPPED: References view "vwEntities" not created in this file (CodeGen will recreate)

-- SKIPPED: References view "vwEntities" not created in this file (CodeGen will recreate)

CREATE OR REPLACE FUNCTION __mj."spDeleteEntity"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."Entity"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateEntity_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateEntity" ON __mj."Entity";
CREATE TRIGGER "trgUpdateEntity"
    BEFORE UPDATE ON __mj."Entity"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateEntity_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "__mj"."EntityField"
        WHERE "ID" = '18b53a1b-ee59-4382-b902-85bac79bced0'  OR
        ("EntityID" = 'E0238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'AllowMultipleSubtypes')
        -- check to make sure we're not inserting a duplicate entity field metadata record
    ) THEN
        INSERT INTO "__mj"."EntityField"
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
        "RelatedEntityDisplayType"
        )
        VALUES
        (
        '18b53a1b-ee59-4382-b902-85bac79bced0',
        'E0238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entities"
        100121,
        'AllowMultipleSubtypes',
        'Allow Multiple Subtypes',
        'When false (default), child types are disjoint - a record can only be one child type at a time. When true, a record can simultaneously exist as multiple child types (e.g., a Person can be both a Member and a Volunteer).',
        'BOOLEAN',
        1,
        1,
        0,
        0,
        '(0)',
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
        'Search'
        );
    END IF;
END $$;

UPDATE "__mj"."EntityField"
            SET "IsNameField" = 1
            WHERE "ID" = 'D8FC1AEC-A3A9-4240-B9FE-0F84D3B46D1F'
            AND "AutoUpdateIsNameField" = 1;

UPDATE "__mj"."EntityField"
            SET "DefaultInView" = 1
            WHERE "ID" = '1B5817F0-6F36-EF11-86D4-6045BDEE16E6'
            AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
            SET "DefaultInView" = 1
            WHERE "ID" = '554D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
            SET "DefaultInView" = 1
            WHERE "ID" = '574D17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
            SET "DefaultInView" = 1
            WHERE "ID" = '5F4F17F0-6F36-EF11-86D4-6045BDEE16E6'
            AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
            SET "DefaultInView" = 1
            WHERE "ID" = 'B9992893-7BD7-42EA-A2A8-48928D7A5CCE'
            AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
            SET "DefaultInView" = 1
            WHERE "ID" = 'D8FC1AEC-A3A9-4240-B9FE-0F84D3B46D1F'
            AND "AutoUpdateDefaultInView" = 1;

UPDATE "__mj"."EntityField"
               SET "IncludeInUserSearchAPI" = 1
               WHERE "ID" = '1B5817F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE "__mj"."EntityField"
               SET "IncludeInUserSearchAPI" = 1
               WHERE "ID" = '554D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE "__mj"."EntityField"
               SET "IncludeInUserSearchAPI" = 1
               WHERE "ID" = '564D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE "__mj"."EntityField"
               SET "IncludeInUserSearchAPI" = 1
               WHERE "ID" = '574D17F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE "__mj"."EntityField"
               SET "IncludeInUserSearchAPI" = 1
               WHERE "ID" = 'D8FC1AEC-A3A9-4240-B9FE-0F84D3B46D1F'
               AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE "__mj"."EntityField"
               SET "IncludeInUserSearchAPI" = 1
               WHERE "ID" = 'AA4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE "__mj"."EntityField"
               SET "IncludeInUserSearchAPI" = 1
               WHERE "ID" = 'AB4217F0-6F36-EF11-86D4-6045BDEE16E6'
               AND "AutoUpdateIncludeInUserSearchAPI" = 1;
/* Set categories for 64 fields */

UPDATE "__mj"."EntityField"
   SET "Category" = 'Identity & Structure',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'ID',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '195817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Identity & Structure',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Parent ID',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '1A5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Identity & Structure',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Name',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '1B5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Identity & Structure',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Name Suffix',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '164E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Identity & Structure',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Display Name',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'D8FC1AEC-A3A9-4240-B9FE-0F84D3B46D1F'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Identity & Structure',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Code Name',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'AA4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Identity & Structure',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Class Name',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'AB4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Identity & Structure',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Schema Name',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '574D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Identity & Structure',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Base Table',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '554D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Identity & Structure',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Base Table Code Name',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'AC4217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Identity & Structure',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Base View',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '564D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Identity & Structure',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Base View Generated',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '964D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Identity & Structure',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Virtual Entity',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '5F4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Identity & Structure',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Allow Multiple Subtypes',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '18B53A1B-EE59-4382-B902-85BAC79BCED0'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Identity & Structure',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Parent Entity',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '1D5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Identity & Structure',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Parent Base Table',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '1E5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Identity & Structure',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Parent Base View',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '1F5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'User Interface & Customization',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Description',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '1C5817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'User Interface & Customization',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Relationship Default Display Type',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'F75817F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'User Interface & Customization',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'User Form Generated',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '9A4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'User Interface & Customization',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Entity Object Subclass Name',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'D84217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'User Interface & Customization',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Entity Object Subclass Import',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '4F4317F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Auditing & Lifecycle',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Status',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'B9992893-7BD7-42EA-A2A8-48928D7A5CCE'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Auditing & Lifecycle',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Icon',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'B15717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Auditing & Lifecycle',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Auto Update Description',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'F34E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Auditing & Lifecycle',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Track Record Changes',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'B94D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Auditing & Lifecycle',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Audit Record Access',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'C74D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Auditing & Lifecycle',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Audit View Runs',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'C84D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Auditing & Lifecycle',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Preferred Communication Field',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'EE4C17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Include In API',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '5B4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Allow All Rows API',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '7E4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Allow Create API',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '7F4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Allow Update API',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '414F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Allow Delete API',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '804D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Custom Resolver API',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '814D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Allow User Search API',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '444F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Full Text Search Enabled',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '1F4E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Full Text Catalog',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '204E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Full Text Catalog Generated',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '214E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Full Text Index',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '224E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Full Text Index Generated',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '234E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Full Text Search Function',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '244E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Full Text Search Function Generated',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '254E17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'User View Max Rows',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'F84217F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Scope Default',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'BCA2D814-7530-48F8-9AB7-DCEF70AC5FC9'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Rows To Pack With Schema',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'C6AC9CC7-0C99-46B4-9940-C5A9E60EED0A'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Rows To Pack Sample Method',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'EFB53FA7-D868-4E1C-9932-A5E624092DC5'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Rows To Pack Sample Count',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '4B3B3BCB-9E96-4FB0-B2B2-93C676C43261'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'API & Search Settings',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Rows To Pack Sample Order',
       "ExtendedType" = 'Code',
       "CodeType" = 'SQL'
   WHERE "ID" = '29690283-5206-48EA-ADF6-43C40DA3220B'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Procedures & Deletion',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Create Stored Procedure',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '8C4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Procedures & Deletion',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Update Stored Procedure',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '8D4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Procedures & Deletion',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Delete Stored Procedure',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '8E4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Procedures & Deletion',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Create Procedure Generated',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '8F4D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Procedures & Deletion',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Update Procedure Generated',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '904D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Procedures & Deletion',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Delete Procedure Generated',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '914D17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Procedures & Deletion',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Cascade Deletes',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '5D4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Procedures & Deletion',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Delete Type',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '115917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Procedures & Deletion',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Allow Record Merge',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '125917F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Procedures & Deletion',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Match Stored Procedure',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '3E4F17F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'System Metadata',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Created At',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'D05717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'System Metadata',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Updated At',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = 'D15717F0-6F36-EF11-86D4-6045BDEE16E6'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Row Statistics',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Auto Row Count Frequency',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '2212928A-D5D0-4AE3-8F5A-25C4DFE8C373'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Row Statistics',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Row Count',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '84C51291-65AB-4677-A0B6-5DACD698A255'
   AND "AutoUpdateCategory" = 1;

UPDATE "__mj"."EntityField"
   SET "Category" = 'Row Statistics',
       "GeneratedFormSection" = 'Category',
       "DisplayName" = 'Row Count Run At',
       "ExtendedType" = NULL,
       "CodeType" = NULL
   WHERE "ID" = '5A02DE6F-6D75-46B7-B800-D42B82227D1A'
   AND "AutoUpdateCategory" = 1;


-- ===================== Grants =====================

-- SKIPPED (view not created): GRANT SELECT ON __mj."vwEntities" TO "cdp_Developer", "cdp_Integration", "cdp_UI"

/* spCreate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spCreateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR Entity
------------------------------------------------------------

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spCreateEntity" TO "cdp_Developer", "cdp_Integration"
    

/* spCreate Permissions for MJ: Entities */

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spCreateEntity" TO "cdp_Developer", "cdp_Integration"


/* spUpdate SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spUpdateEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR Entity
------------------------------------------------------------

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spUpdateEntity" TO "cdp_Developer", "cdp_Integration"

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spUpdateEntity" TO "cdp_Developer", "cdp_Integration"


/* spDelete SQL for MJ: Entities */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entities
-- Item: spDeleteEntity
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR Entity
------------------------------------------------------------

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entities */;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntity" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set field properties for entity */;


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."Entity"."AllowMultipleSubtypes" IS 'When false (default), child types are disjoint - a record can only be one child type at a time. When true, a record can simultaneously exist as multiple child types (e.g., a Person can be both a Member and a Volunteer).';


-- ===================== Other =====================

-- CODE GEN RUN
/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: Entities */
