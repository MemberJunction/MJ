
-- ===================== DDL: Tables, PKs, Indexes =====================

-- Migration: Add JSONType strong typing columns to EntityField
-- Enables metadata-driven TypeScript type definitions for JSON blob fields.
-- CodeGen reads these and emits entity-prefixed interfaces + Object-suffixed
-- typed accessors with Array<T> syntax, auto JSON.parse/stringify, and caching.

ALTER TABLE __mj."EntityField"
 ADD COLUMN "JSONType" VARCHAR(255) NULL,
 ADD COLUMN "JSONTypeIsArray" BOOLEAN NOT NULL CONSTRAINT DF_EntityField_JSONTypeIsArray DEFAULT 0,
 ADD COLUMN "JSONTypeDefinition" TEXT NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityField_EntityID" ON __mj."EntityField" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityField_RelatedEntityID" ON __mj."EntityField" ("RelatedEntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityField_EncryptionKeyID" ON __mj."EntityField" ("EncryptionKeyID");


-- ===================== Stored Procedures (sp*) =====================

-- SKIPPED: References view "vwEntityFields" not created in this file (CodeGen will recreate)

-- SKIPPED: References view "vwEntityFields" not created in this file (CodeGen will recreate)

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


-- ===================== Grants =====================

-- SKIPPED (view not created): GRANT SELECT ON __mj."vwEntityFields" TO "cdp_UI", "cdp_Integration", "cdp_Developer"

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
------------------------------------------------------------

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spCreateEntityField" TO "cdp_Integration", "cdp_Developer"
    

/* spCreate Permissions for MJ: Entity Fields */

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spCreateEntityField" TO "cdp_Integration", "cdp_Developer"


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
------------------------------------------------------------

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spUpdateEntityField" TO "cdp_Integration", "cdp_Developer"

-- SKIPPED (function not created): GRANT EXECUTE ON __mj."spUpdateEntityField" TO "cdp_Integration", "cdp_Developer"


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
------------------------------------------------------------

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
