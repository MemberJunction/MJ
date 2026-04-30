
-- ===================== DDL: Tables, PKs, Indexes =====================

-- Migration: Add JSONType strong typing columns to EntityField
-- Enables metadata-driven TypeScript type definitions for JSON blob fields.
-- CodeGen reads these and emits entity-prefixed interfaces + Object-suffixed
-- typed accessors with Array<T> syntax, auto JSON.parse/stringify, and caching.

ALTER TABLE __mj."EntityField"
 ADD COLUMN "JSONType" VARCHAR(255) NULL,
 ADD COLUMN "JSONTypeIsArray" BOOLEAN NOT NULL CONSTRAINT DF_EntityField_JSONTypeIsArray DEFAULT FALSE,
 ADD COLUMN "JSONTypeDefinition" TEXT NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityField_EntityID" ON __mj."EntityField" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID" ON __mj."EntityField" ("RelatedEntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID" ON __mj."EntityField" ("EncryptionKeyID");


-- ===================== Stored Procedures (sp*) =====================

CREATE OR REPLACE FUNCTION __mj."spCreateEntityField"(
    IN p_ID UUID DEFAULT NULL,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_AutoUpdateDescription BOOLEAN DEFAULT NULL,
    IN p_IsPrimaryKey BOOLEAN DEFAULT NULL,
    IN p_IsUnique BOOLEAN DEFAULT NULL,
    IN p_Category VARCHAR(255) DEFAULT NULL,
    IN p_ValueListType VARCHAR(20) DEFAULT NULL,
    IN p_ExtendedType VARCHAR(50) DEFAULT NULL,
    IN p_CodeType VARCHAR(50) DEFAULT NULL,
    IN p_DefaultInView BOOLEAN DEFAULT NULL,
    IN p_ViewCellTemplate TEXT DEFAULT NULL,
    IN p_DefaultColumnWidth INTEGER DEFAULT NULL,
    IN p_AllowUpdateAPI BOOLEAN DEFAULT NULL,
    IN p_AllowUpdateInView BOOLEAN DEFAULT NULL,
    IN p_IncludeInUserSearchAPI BOOLEAN DEFAULT NULL,
    IN p_FullTextSearchEnabled BOOLEAN DEFAULT NULL,
    IN p_UserSearchParamFormatAPI VARCHAR(500) DEFAULT NULL,
    IN p_IncludeInGeneratedForm BOOLEAN DEFAULT NULL,
    IN p_GeneratedFormSection VARCHAR(10) DEFAULT NULL,
    IN p_IsNameField BOOLEAN DEFAULT NULL,
    IN p_RelatedEntityID UUID DEFAULT NULL,
    IN p_RelatedEntityFieldName VARCHAR(255) DEFAULT NULL,
    IN p_IncludeRelatedEntityNameFieldInBaseView BOOLEAN DEFAULT NULL,
    IN p_RelatedEntityNameFieldMap VARCHAR(255) DEFAULT NULL,
    IN p_RelatedEntityDisplayType VARCHAR(20) DEFAULT NULL,
    IN p_EntityIDFieldName VARCHAR(100) DEFAULT NULL,
    IN p_ScopeDefault VARCHAR(100) DEFAULT NULL,
    IN p_AutoUpdateRelatedEntityInfo BOOLEAN DEFAULT NULL,
    IN p_ValuesToPackWithSchema VARCHAR(10) DEFAULT NULL,
    IN p_Status VARCHAR(25) DEFAULT NULL,
    IN p_AutoUpdateIsNameField BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateDefaultInView BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateCategory BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateDisplayName BOOLEAN DEFAULT NULL,
    IN p_AutoUpdateIncludeInUserSearchAPI BOOLEAN DEFAULT NULL,
    IN p_Encrypt BOOLEAN DEFAULT NULL,
    IN p_EncryptionKeyID UUID DEFAULT NULL,
    IN p_AllowDecryptInAPI BOOLEAN DEFAULT NULL,
    IN p_SendEncryptedValue BOOLEAN DEFAULT NULL,
    IN p_IsSoftPrimaryKey BOOLEAN DEFAULT NULL,
    IN p_IsSoftForeignKey BOOLEAN DEFAULT NULL,
    IN p_RelatedEntityJoinFields TEXT DEFAULT NULL,
    IN p_JSONType VARCHAR(255) DEFAULT NULL,
    IN p_JSONTypeIsArray BOOLEAN DEFAULT NULL,
    IN p_JSONTypeDefinition TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityFields" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityField"
            (
                "ID",
                "DisplayName",
                "Description",
                "AutoUpdateDescription",
                "IsPrimaryKey",
                "IsUnique",
                "Category",
                "ValueListType",
                "ExtendedType",
                "CodeType",
                "DefaultInView",
                "ViewCellTemplate",
                "DefaultColumnWidth",
                "AllowUpdateAPI",
                "AllowUpdateInView",
                "IncludeInUserSearchAPI",
                "FullTextSearchEnabled",
                "UserSearchParamFormatAPI",
                "IncludeInGeneratedForm",
                "GeneratedFormSection",
                "IsNameField",
                "RelatedEntityID",
                "RelatedEntityFieldName",
                "IncludeRelatedEntityNameFieldInBaseView",
                "RelatedEntityNameFieldMap",
                "RelatedEntityDisplayType",
                "EntityIDFieldName",
                "ScopeDefault",
                "AutoUpdateRelatedEntityInfo",
                "ValuesToPackWithSchema",
                "Status",
                "AutoUpdateIsNameField",
                "AutoUpdateDefaultInView",
                "AutoUpdateCategory",
                "AutoUpdateDisplayName",
                "AutoUpdateIncludeInUserSearchAPI",
                "Encrypt",
                "EncryptionKeyID",
                "AllowDecryptInAPI",
                "SendEncryptedValue",
                "IsSoftPrimaryKey",
                "IsSoftForeignKey",
                "RelatedEntityJoinFields",
                "JSONType",
                "JSONTypeIsArray",
                "JSONTypeDefinition"
            )
        VALUES
            (
                p_ID,
                p_DisplayName,
                p_Description,
                COALESCE(p_AutoUpdateDescription, TRUE),
                COALESCE(p_IsPrimaryKey, FALSE),
                COALESCE(p_IsUnique, FALSE),
                p_Category,
                COALESCE(p_ValueListType, 'None'),
                p_ExtendedType,
                p_CodeType,
                COALESCE(p_DefaultInView, FALSE),
                p_ViewCellTemplate,
                p_DefaultColumnWidth,
                COALESCE(p_AllowUpdateAPI, TRUE),
                COALESCE(p_AllowUpdateInView, TRUE),
                COALESCE(p_IncludeInUserSearchAPI, FALSE),
                COALESCE(p_FullTextSearchEnabled, FALSE),
                p_UserSearchParamFormatAPI,
                COALESCE(p_IncludeInGeneratedForm, TRUE),
                COALESCE(p_GeneratedFormSection, 'Details'),
                COALESCE(p_IsNameField, FALSE),
                p_RelatedEntityID,
                p_RelatedEntityFieldName,
                COALESCE(p_IncludeRelatedEntityNameFieldInBaseView, TRUE),
                p_RelatedEntityNameFieldMap,
                COALESCE(p_RelatedEntityDisplayType, 'Search'),
                p_EntityIDFieldName,
                p_ScopeDefault,
                COALESCE(p_AutoUpdateRelatedEntityInfo, TRUE),
                COALESCE(p_ValuesToPackWithSchema, 'Auto'),
                COALESCE(p_Status, 'Active'),
                COALESCE(p_AutoUpdateIsNameField, TRUE),
                COALESCE(p_AutoUpdateDefaultInView, TRUE),
                COALESCE(p_AutoUpdateCategory, TRUE),
                COALESCE(p_AutoUpdateDisplayName, TRUE),
                COALESCE(p_AutoUpdateIncludeInUserSearchAPI, TRUE),
                COALESCE(p_Encrypt, FALSE),
                p_EncryptionKeyID,
                COALESCE(p_AllowDecryptInAPI, FALSE),
                COALESCE(p_SendEncryptedValue, FALSE),
                COALESCE(p_IsSoftPrimaryKey, FALSE),
                COALESCE(p_IsSoftForeignKey, FALSE),
                p_RelatedEntityJoinFields,
                p_JSONType,
                COALESCE(p_JSONTypeIsArray, FALSE),
                p_JSONTypeDefinition
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityField"
            (
                "DisplayName",
                "Description",
                "AutoUpdateDescription",
                "IsPrimaryKey",
                "IsUnique",
                "Category",
                "ValueListType",
                "ExtendedType",
                "CodeType",
                "DefaultInView",
                "ViewCellTemplate",
                "DefaultColumnWidth",
                "AllowUpdateAPI",
                "AllowUpdateInView",
                "IncludeInUserSearchAPI",
                "FullTextSearchEnabled",
                "UserSearchParamFormatAPI",
                "IncludeInGeneratedForm",
                "GeneratedFormSection",
                "IsNameField",
                "RelatedEntityID",
                "RelatedEntityFieldName",
                "IncludeRelatedEntityNameFieldInBaseView",
                "RelatedEntityNameFieldMap",
                "RelatedEntityDisplayType",
                "EntityIDFieldName",
                "ScopeDefault",
                "AutoUpdateRelatedEntityInfo",
                "ValuesToPackWithSchema",
                "Status",
                "AutoUpdateIsNameField",
                "AutoUpdateDefaultInView",
                "AutoUpdateCategory",
                "AutoUpdateDisplayName",
                "AutoUpdateIncludeInUserSearchAPI",
                "Encrypt",
                "EncryptionKeyID",
                "AllowDecryptInAPI",
                "SendEncryptedValue",
                "IsSoftPrimaryKey",
                "IsSoftForeignKey",
                "RelatedEntityJoinFields",
                "JSONType",
                "JSONTypeIsArray",
                "JSONTypeDefinition"
            )
        VALUES
            (
                p_DisplayName,
                p_Description,
                COALESCE(p_AutoUpdateDescription, TRUE),
                COALESCE(p_IsPrimaryKey, FALSE),
                COALESCE(p_IsUnique, FALSE),
                p_Category,
                COALESCE(p_ValueListType, 'None'),
                p_ExtendedType,
                p_CodeType,
                COALESCE(p_DefaultInView, FALSE),
                p_ViewCellTemplate,
                p_DefaultColumnWidth,
                COALESCE(p_AllowUpdateAPI, TRUE),
                COALESCE(p_AllowUpdateInView, TRUE),
                COALESCE(p_IncludeInUserSearchAPI, FALSE),
                COALESCE(p_FullTextSearchEnabled, FALSE),
                p_UserSearchParamFormatAPI,
                COALESCE(p_IncludeInGeneratedForm, TRUE),
                COALESCE(p_GeneratedFormSection, 'Details'),
                COALESCE(p_IsNameField, FALSE),
                p_RelatedEntityID,
                p_RelatedEntityFieldName,
                COALESCE(p_IncludeRelatedEntityNameFieldInBaseView, TRUE),
                p_RelatedEntityNameFieldMap,
                COALESCE(p_RelatedEntityDisplayType, 'Search'),
                p_EntityIDFieldName,
                p_ScopeDefault,
                COALESCE(p_AutoUpdateRelatedEntityInfo, TRUE),
                COALESCE(p_ValuesToPackWithSchema, 'Auto'),
                COALESCE(p_Status, 'Active'),
                COALESCE(p_AutoUpdateIsNameField, TRUE),
                COALESCE(p_AutoUpdateDefaultInView, TRUE),
                COALESCE(p_AutoUpdateCategory, TRUE),
                COALESCE(p_AutoUpdateDisplayName, TRUE),
                COALESCE(p_AutoUpdateIncludeInUserSearchAPI, TRUE),
                COALESCE(p_Encrypt, FALSE),
                p_EncryptionKeyID,
                COALESCE(p_AllowDecryptInAPI, FALSE),
                COALESCE(p_SendEncryptedValue, FALSE),
                COALESCE(p_IsSoftPrimaryKey, FALSE),
                COALESCE(p_IsSoftForeignKey, FALSE),
                p_RelatedEntityJoinFields,
                p_JSONType,
                COALESCE(p_JSONTypeIsArray, FALSE),
                p_JSONTypeDefinition
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityFields" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityField"(
    IN p_ID UUID,
    IN p_DisplayName VARCHAR(255),
    IN p_Description TEXT,
    IN p_AutoUpdateDescription BOOLEAN,
    IN p_IsPrimaryKey BOOLEAN,
    IN p_IsUnique BOOLEAN,
    IN p_Category VARCHAR(255),
    IN p_ValueListType VARCHAR(20),
    IN p_ExtendedType VARCHAR(50),
    IN p_CodeType VARCHAR(50),
    IN p_DefaultInView BOOLEAN,
    IN p_ViewCellTemplate TEXT,
    IN p_DefaultColumnWidth INTEGER,
    IN p_AllowUpdateAPI BOOLEAN,
    IN p_AllowUpdateInView BOOLEAN,
    IN p_IncludeInUserSearchAPI BOOLEAN,
    IN p_FullTextSearchEnabled BOOLEAN,
    IN p_UserSearchParamFormatAPI VARCHAR(500),
    IN p_IncludeInGeneratedForm BOOLEAN,
    IN p_GeneratedFormSection VARCHAR(10),
    IN p_IsNameField BOOLEAN,
    IN p_RelatedEntityID UUID,
    IN p_RelatedEntityFieldName VARCHAR(255),
    IN p_IncludeRelatedEntityNameFieldInBaseView BOOLEAN,
    IN p_RelatedEntityNameFieldMap VARCHAR(255),
    IN p_RelatedEntityDisplayType VARCHAR(20),
    IN p_EntityIDFieldName VARCHAR(100),
    IN p_ScopeDefault VARCHAR(100),
    IN p_AutoUpdateRelatedEntityInfo BOOLEAN,
    IN p_ValuesToPackWithSchema VARCHAR(10),
    IN p_Status VARCHAR(25),
    IN p_AutoUpdateIsNameField BOOLEAN,
    IN p_AutoUpdateDefaultInView BOOLEAN,
    IN p_AutoUpdateCategory BOOLEAN,
    IN p_AutoUpdateDisplayName BOOLEAN,
    IN p_AutoUpdateIncludeInUserSearchAPI BOOLEAN,
    IN p_Encrypt BOOLEAN,
    IN p_EncryptionKeyID UUID,
    IN p_AllowDecryptInAPI BOOLEAN,
    IN p_SendEncryptedValue BOOLEAN,
    IN p_IsSoftPrimaryKey BOOLEAN,
    IN p_IsSoftForeignKey BOOLEAN,
    IN p_RelatedEntityJoinFields TEXT,
    IN p_JSONType VARCHAR(255),
    IN p_JSONTypeIsArray BOOLEAN,
    IN p_JSONTypeDefinition TEXT
)
RETURNS SETOF __mj."vwEntityFields" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityField"
    SET
        "DisplayName" = p_DisplayName,
        "Description" = p_Description,
        "AutoUpdateDescription" = p_AutoUpdateDescription,
        "IsPrimaryKey" = p_IsPrimaryKey,
        "IsUnique" = p_IsUnique,
        "Category" = p_Category,
        "ValueListType" = p_ValueListType,
        "ExtendedType" = p_ExtendedType,
        "CodeType" = p_CodeType,
        "DefaultInView" = p_DefaultInView,
        "ViewCellTemplate" = p_ViewCellTemplate,
        "DefaultColumnWidth" = p_DefaultColumnWidth,
        "AllowUpdateAPI" = p_AllowUpdateAPI,
        "AllowUpdateInView" = p_AllowUpdateInView,
        "IncludeInUserSearchAPI" = p_IncludeInUserSearchAPI,
        "FullTextSearchEnabled" = p_FullTextSearchEnabled,
        "UserSearchParamFormatAPI" = p_UserSearchParamFormatAPI,
        "IncludeInGeneratedForm" = p_IncludeInGeneratedForm,
        "GeneratedFormSection" = p_GeneratedFormSection,
        "IsNameField" = p_IsNameField,
        "RelatedEntityID" = p_RelatedEntityID,
        "RelatedEntityFieldName" = p_RelatedEntityFieldName,
        "IncludeRelatedEntityNameFieldInBaseView" = p_IncludeRelatedEntityNameFieldInBaseView,
        "RelatedEntityNameFieldMap" = p_RelatedEntityNameFieldMap,
        "RelatedEntityDisplayType" = p_RelatedEntityDisplayType,
        "EntityIDFieldName" = p_EntityIDFieldName,
        "ScopeDefault" = p_ScopeDefault,
        "AutoUpdateRelatedEntityInfo" = p_AutoUpdateRelatedEntityInfo,
        "ValuesToPackWithSchema" = p_ValuesToPackWithSchema,
        "Status" = p_Status,
        "AutoUpdateIsNameField" = p_AutoUpdateIsNameField,
        "AutoUpdateDefaultInView" = p_AutoUpdateDefaultInView,
        "AutoUpdateCategory" = p_AutoUpdateCategory,
        "AutoUpdateDisplayName" = p_AutoUpdateDisplayName,
        "AutoUpdateIncludeInUserSearchAPI" = p_AutoUpdateIncludeInUserSearchAPI,
        "Encrypt" = p_Encrypt,
        "EncryptionKeyID" = p_EncryptionKeyID,
        "AllowDecryptInAPI" = p_AllowDecryptInAPI,
        "SendEncryptedValue" = p_SendEncryptedValue,
        "IsSoftPrimaryKey" = p_IsSoftPrimaryKey,
        "IsSoftForeignKey" = p_IsSoftForeignKey,
        "RelatedEntityJoinFields" = p_RelatedEntityJoinFields,
        "JSONType" = p_JSONType,
        "JSONTypeIsArray" = p_JSONTypeIsArray,
        "JSONTypeDefinition" = p_JSONTypeDefinition
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityFields" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityFields" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityField"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityField"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateEntityField_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateEntityField" ON __mj."EntityField";
CREATE TRIGGER "trgUpdateEntityField"
    BEFORE UPDATE ON __mj."EntityField"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateEntityField_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'd97c0bec-3b59-4ba2-bab5-432944ad257b' OR ("EntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'JSONType')
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
        'd97c0bec-3b59-4ba2-bab5-432944ad257b',
        'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entity" "Fields"
        100129,
        'JSONType',
        'JSON Type',
        'The name of the TypeScript interface/type for this JSON field. When set, CodeGen emits a strongly-typed Object-suffixed accessor using this type instead of only the default string getter/setter.',
        'TEXT',
        510,
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'b94f8690-5226-48a9-9c89-4549f141fbb7' OR ("EntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'JSONTypeIsArray')
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
        'b94f8690-5226-48a9-9c89-4549f141fbb7',
        'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entity" "Fields"
        100130,
        'JSONTypeIsArray',
        'JSON Type Is Array',
        'If true, the field holds a JSON array of JSONType items. The Object accessor returns Array<JSONType> | null and the setter accepts Array<JSONType> | null.',
        'BOOLEAN',
        1,
        1,
        0,
        FALSE,
        '(0)',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '1187c2ff-0226-4790-8d0d-036d9f8a15c1' OR ("EntityID" = 'DF238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'JSONTypeDefinition')
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
        '1187c2ff-0226-4790-8d0d-036d9f8a15c1',
        'DF238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entity" "Fields"
        100131,
        'JSONTypeDefinition',
        'JSON Type Definition',
        'Raw TypeScript code emitted by CodeGen above the entity class definition. Typically contains the interface/type definition referenced by JSONType. Can include imports, multiple types, or any valid TypeScript.',
        'TEXT',
        -1,
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


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityFields" TO "cdp_UI", "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spCreateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityField
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Entity Fields */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spUpdateEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityField
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Fields
-- Item: spDeleteEntityField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityField
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Fields */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityField" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Refresh custom base views for modified entities so schema changes are picked up */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."EntityField"."JSONType" IS 'The name of the TypeScript interface/type for this JSON field. When set, CodeGen emits a strongly-typed Object-suffixed accessor using this type instead of only the default string getter/setter.';

COMMENT ON COLUMN __mj."EntityField"."JSONTypeIsArray" IS 'If true, the field holds a JSON array of JSONType items. The Object accessor returns Array<JSONType> | null and the setter accepts Array<JSONType> | null.';

COMMENT ON COLUMN __mj."EntityField"."JSONTypeDefinition" IS 'Raw TypeScript code emitted by CodeGen above the entity class definition. Typically contains the interface/type definition referenced by JSONType. Can include imports, multiple types, or any valid TypeScript.';


-- ===================== Other =====================

-- ============================================================================
-- CODE GEN RUN
-- Output from CodeGen run on a fresh database after applying the migration above
-- ============================================================================

/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: Entity Fields */
