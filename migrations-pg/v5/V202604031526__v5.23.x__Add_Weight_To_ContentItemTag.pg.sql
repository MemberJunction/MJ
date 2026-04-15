
-- ===================== DDL: Tables, PKs, Indexes =====================

-- Add Weight column to ContentItemTag for semantic relevance scoring.
-- LLM assigns a weight (0.0-1.0) indicating how relevant each tag is to the content.
-- 1.0 = highly relevant/central topic, 0.5 = moderately relevant, 0.1 = tangentially related.

ALTER TABLE __mj."ContentItemTag"
 ADD COLUMN "Weight" NUMERIC(5, 4) NOT NULL DEFAULT 1.0;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_ContentItemTag_ItemID" ON __mj."ContentItemTag" ("ItemID");


-- ===================== Views =====================

DO $do$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwContentItemTags"
AS SELECT
    c.*,
    "MJContentItem_ItemID"."Name" AS "Item"
FROM
    __mj."ContentItemTag" AS c
INNER JOIN
    __mj."ContentItem" AS "MJContentItem_ItemID"
  ON
    c."ItemID" = "MJContentItem_ItemID"."ID"$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS __mj."vwContentItemTags" CASCADE;
  EXECUTE vsql;
END;
$do$;


-- ===================== Stored Procedures (sp*) =====================

CREATE OR REPLACE FUNCTION __mj."spCreateContentItemTag"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ItemID UUID DEFAULT NULL,
    IN p_Tag VARCHAR(200) DEFAULT NULL,
    IN p_Weight NUMERIC(5,4) DEFAULT NULL
)
RETURNS SETOF __mj."vwContentItemTags" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."ContentItemTag"
            (
                "ID",
                "ItemID",
                "Tag",
                "Weight"
            )
        VALUES
            (
                p_ID,
                p_ItemID,
                p_Tag,
                COALESCE(p_Weight, 1.0)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."ContentItemTag"
            (
                "ItemID",
                "Tag",
                "Weight"
            )
        VALUES
            (
                p_ItemID,
                p_Tag,
                COALESCE(p_Weight, 1.0)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwContentItemTags" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateContentItemTag"(
    IN p_ID UUID,
    IN p_ItemID UUID,
    IN p_Tag VARCHAR(200),
    IN p_Weight NUMERIC(5,4)
)
RETURNS SETOF __mj."vwContentItemTags" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."ContentItemTag"
    SET
        "ItemID" = p_ItemID,
        "Tag" = p_Tag,
        "Weight" = p_Weight
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwContentItemTags" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwContentItemTags" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteContentItemTag"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."ContentItemTag"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateContentItemTag_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateContentItemTag" ON __mj."ContentItemTag";
CREATE TRIGGER "trgUpdateContentItemTag"
    BEFORE UPDATE ON __mj."ContentItemTag"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateContentItemTag_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2ef1276a-d856-4408-a72a-be0907abca75' OR ("EntityID" = 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'Weight')
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
        '2ef1276a-d856-4408-a72a-be0907abca75',
        'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', -- "Entity": "MJ": "Content" "Item" "Tags"
        100012,
        'Weight',
        'Weight',
        'Relevance weight for this tag (0.0-1.0). 1.0 = highly relevant central topic, 0.5 = moderately relevant, 0.1 = tangentially related. Assigned by the LLM during autotagging.',
        'numeric',
        5,
        5,
        4,
        0,
        '(1.0)',
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
            SET "IsNameField" = 1
            WHERE "ID" = '33B9433E-F36B-1410-867F-007B559E242F'
            AND "AutoUpdateIsNameField" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '2EF1276A-D856-4408-A72A-BE0907ABCA75'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '33B9433E-F36B-1410-867F-007B559E242F'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '8D73962B-3D7D-489E-837F-732C90578325'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;
/* Set categories for 7 fields */
-- UPDATE Entity Field Category Info MJ: Content Item Tags."ItemID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Association',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2DB9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Content Item Tags."Item"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8D73962B-3D7D-489E-837F-732C90578325' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Content Item Tags."Tag"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Association',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '33B9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Content Item Tags."Weight"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Tag Association',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2EF1276A-D856-4408-A72A-BE0907ABCA75' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Content Item Tags."ID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '27B9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Content Item Tags.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '39B9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Content Item Tags.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "Category" = 'System Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3FB9433E-F36B-1410-867F-007B559E242F' AND "AutoUpdateCategory" = 1;
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('a60f8abf-8d27-4c8b-9381-1c6df38d3214', 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22', 'FieldCategoryInfo', '{"System Metadata":{"icon":"fa fa-database","description":"Internal system identifiers and audit timestamps for record tracking."}}', NOW(), NOW());
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"System Metadata":"fa fa-database"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = 'F63EC656-0E66-EF11-A752-C0A5E8ACCB22' AND "Name" = 'FieldCategoryIcons';


-- ===================== Grants =====================

GRANT SELECT ON __mj."vwContentItemTags" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* Base View Permissions SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: Permissions for vwContentItemTags
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwContentItemTags" TO "cdp_UI", "cdp_Developer", "cdp_Integration";

/* spCreate SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: spCreateContentItemTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR ContentItemTag
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentItemTag" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Content Item Tags */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateContentItemTag" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: spUpdateContentItemTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR ContentItemTag
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentItemTag" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateContentItemTag" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Content Item Tags */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Content Item Tags
-- Item: spDeleteContentItemTag
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR ContentItemTag
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemTag" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Content Item Tags */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteContentItemTag" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."ContentItemTag"."Weight" IS 'Relevance weight for this tag (0.0-1.0). 1.0 = highly relevant central topic, 0.5 = moderately relevant, 0.1 = tangentially related. Assigned by the LLM during autotagging.';


-- ===================== Other =====================

/* spUpdate Permissions for MJ: Content Item Tags */
