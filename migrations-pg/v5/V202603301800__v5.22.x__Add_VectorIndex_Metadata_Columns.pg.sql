
-- ===================== DDL: Tables, PKs, Indexes =====================

ALTER TABLE __mj."VectorIndex"
 ADD COLUMN "ExternalID" VARCHAR(500) NULL,
 ADD COLUMN "Dimensions" INTEGER NULL,
 ADD COLUMN "Metric" VARCHAR(50) NULL,
 ADD COLUMN "ProviderConfig" TEXT NULL;

-- Extended properties for documentation;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_VectorIndex_VectorDatabaseID" ON __mj."VectorIndex" ("VectorDatabaseID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_VectorIndex_EmbeddingModelID" ON __mj."VectorIndex" ("EmbeddingModelID");


-- ===================== Views =====================

DO $do$
DECLARE
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwVectorIndexes"
AS SELECT
    v.*,
    "MJVectorDatabase_VectorDatabaseID"."Name" AS "VectorDatabase",
    "MJAIModel_EmbeddingModelID"."Name" AS "EmbeddingModel"
FROM
    __mj."VectorIndex" AS v
INNER JOIN
    __mj."VectorDatabase" AS "MJVectorDatabase_VectorDatabaseID"
  ON
    v."VectorDatabaseID" = "MJVectorDatabase_VectorDatabaseID"."ID"
INNER JOIN
    __mj."AIModel" AS "MJAIModel_EmbeddingModelID"
  ON
    v."EmbeddingModelID" = "MJAIModel_EmbeddingModelID"."ID"$vsql$;
BEGIN
  EXECUTE vsql;
EXCEPTION WHEN invalid_table_definition THEN
  DROP VIEW IF EXISTS __mj."vwVectorIndexes" CASCADE;
  EXECUTE vsql;
END;
$do$;


-- ===================== Stored Procedures (sp*) =====================

CREATE OR REPLACE FUNCTION __mj."spCreateVectorIndex"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_VectorDatabaseID UUID DEFAULT NULL,
    IN p_EmbeddingModelID UUID DEFAULT NULL,
    IN p_ExternalID VARCHAR(500) DEFAULT NULL,
    IN p_Dimensions INTEGER DEFAULT NULL,
    IN p_Metric VARCHAR(50) DEFAULT NULL,
    IN p_ProviderConfig TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwVectorIndexes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."VectorIndex"
            (
                "ID",
                "Name",
                "Description",
                "VectorDatabaseID",
                "EmbeddingModelID",
                "ExternalID",
                "Dimensions",
                "Metric",
                "ProviderConfig"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_VectorDatabaseID,
                p_EmbeddingModelID,
                p_ExternalID,
                p_Dimensions,
                p_Metric,
                p_ProviderConfig
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."VectorIndex"
            (
                "Name",
                "Description",
                "VectorDatabaseID",
                "EmbeddingModelID",
                "ExternalID",
                "Dimensions",
                "Metric",
                "ProviderConfig"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_VectorDatabaseID,
                p_EmbeddingModelID,
                p_ExternalID,
                p_Dimensions,
                p_Metric,
                p_ProviderConfig
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwVectorIndexes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateVectorIndex"(
    IN p_ID UUID,
    IN p_Name VARCHAR(255),
    IN p_Description TEXT,
    IN p_VectorDatabaseID UUID,
    IN p_EmbeddingModelID UUID,
    IN p_ExternalID VARCHAR(500),
    IN p_Dimensions INTEGER,
    IN p_Metric VARCHAR(50),
    IN p_ProviderConfig TEXT
)
RETURNS SETOF __mj."vwVectorIndexes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."VectorIndex"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "VectorDatabaseID" = p_VectorDatabaseID,
        "EmbeddingModelID" = p_EmbeddingModelID,
        "ExternalID" = p_ExternalID,
        "Dimensions" = p_Dimensions,
        "Metric" = p_Metric,
        "ProviderConfig" = p_ProviderConfig
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwVectorIndexes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwVectorIndexes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteVectorIndex"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."VectorIndex"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateVectorIndex_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateVectorIndex" ON __mj."VectorIndex";
CREATE TRIGGER "trgUpdateVectorIndex"
    BEFORE UPDATE ON __mj."VectorIndex"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateVectorIndex_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'cbee8b17-bdc3-4241-8645-e8169953405f' OR ("EntityID" = '1D248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'ExternalID')
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
        'cbee8b17-bdc3-4241-8645-e8169953405f',
        '1D248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Vector" "Indexes"
        100017,
        'ExternalID',
        'External ID',
        'The provider''s native identifier for this index. For Pinecone this is the index name; for other providers it may be a separate UUID or identifier. Used for syncing operations between MJ metadata and the remote vector database.',
        'TEXT',
        1000,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '43e02f2e-0137-47ee-9f37-526e9f3025d9' OR ("EntityID" = '1D248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Dimensions')
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
        '43e02f2e-0137-47ee-9f37-526e9f3025d9',
        '1D248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Vector" "Indexes"
        100018,
        'Dimensions',
        'Dimensions',
        'The number of dimensions for vectors stored in this index. Determined by the embedding model (e.g., 1536 for text-embedding-3-small, 768 for all-mpnet-base-v2). Set automatically when the index is created via the vector database provider.',
        'INTEGER',
        4,
        10,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '54faa5b0-a7ee-4242-8039-8808e63a3f49' OR ("EntityID" = '1D248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Metric')
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
        '54faa5b0-a7ee-4242-8039-8808e63a3f49',
        '1D248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Vector" "Indexes"
        100019,
        'Metric',
        'Metric',
        'The distance metric used for similarity calculations in this index. Common values: cosine (default, measures angular similarity), euclidean (L2 distance), dotproduct (inner product). Must match what the vector database provider was configured with.',
        'TEXT',
        100,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'f91e3615-c22f-4bcd-a81f-49e7f2e46a64' OR ("EntityID" = '1D248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'ProviderConfig')
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
        'f91e3615-c22f-4bcd-a81f-49e7f2e46a64',
        '1D248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Vector" "Indexes"
        100020,
        'ProviderConfig',
        'Provider Config',
        'JSON object containing provider-specific configuration for this index. For Pinecone serverless: {"cloud":"aws","region":"us-east-1"}. For pod-based: {"environment":"us-east1-gcp","podType":"p1.x1","replicas":1}. Stored as a flexible JSON bag to support any provider without schema changes.',
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
               WHERE "ID" = 'CBEE8B17-BDC3-4241-8645-E8169953405F'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '43E02F2E-0137-47EE-9F37-526E9F3025D9'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
               SET "DefaultInView" = 1
               WHERE "ID" = '54FAA5B0-A7EE-4242-8039-8808E63A3F49'
               AND "AutoUpdateDefaultInView" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = 'CBEE8B17-BDC3-4241-8645-E8169953405F'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = '54FAA5B0-A7EE-4242-8039-8808E63A3F49'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = 'E74E17F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = 1
                  WHERE "ID" = 'E84E17F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = 1;
/* Set categories for 13 fields */
-- UPDATE Entity Field Category Info MJ: Vector Indexes."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DB4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Vector Indexes."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DC4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Vector Indexes."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DD4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Vector Indexes."ExternalID"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Index Profile',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CBEE8B17-BDC3-4241-8645-E8169953405F' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Vector Indexes."VectorDatabaseID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Vector Database',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DE4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Vector Indexes."EmbeddingModelID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Embedding Model',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DF4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Vector Indexes."VectorDatabase"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Vector Database Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E74E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Vector Indexes."EmbeddingModel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Embedding Model Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E84E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Vector Indexes."Dimensions"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Index Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '43E02F2E-0137-47EE-9F37-526E9F3025D9' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Vector Indexes."Metric"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Index Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Distance Metric',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '54FAA5B0-A7EE-4242-8039-8808E63A3F49' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Vector Indexes."ProviderConfig"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Index Configuration',
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Provider Configuration',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'F91E3615-C22F-4BCD-A81F-49E7F2E46A64' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Vector Indexes.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C65817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
-- UPDATE Entity Field Category Info MJ: Vector Indexes.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C75817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = 1;
/* Insert FieldCategoryInfo setting for entity */

INSERT INTO __mj."EntitySetting" ("ID", "EntityID", "Name", "Value", "__mj_CreatedAt", "__mj_UpdatedAt")
               VALUES ('66c42dcd-5931-4155-ba52-a1b9d1515c18', '1D248F34-2837-EF11-86D4-6045BDEE16E6', 'FieldCategoryInfo', '{"Index Configuration":{"icon":"fa fa-sliders-h","description":"Technical settings including vector dimensions, distance metrics, and provider-specific configurations"}}', NOW(), NOW());
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Index Configuration":"fa fa-sliders-h"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = '1D248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'FieldCategoryIcons';


-- ===================== Grants =====================

GRANT SELECT ON __mj."vwVectorIndexes" TO "cdp_Integration", "cdp_UI", "cdp_Developer";

/* Base View Permissions SQL for MJ: Vector Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Indexes
-- Item: Permissions for vwVectorIndexes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

GRANT SELECT ON __mj."vwVectorIndexes" TO "cdp_Integration", "cdp_UI", "cdp_Developer";

/* spCreate SQL for MJ: Vector Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Indexes
-- Item: spCreateVectorIndex
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR VectorIndex
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateVectorIndex" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Vector Indexes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateVectorIndex" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Vector Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Indexes
-- Item: spUpdateVectorIndex
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR VectorIndex
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateVectorIndex" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateVectorIndex" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Vector Indexes */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Indexes
-- Item: spDeleteVectorIndex
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR VectorIndex
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteVectorIndex" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Vector Indexes */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteVectorIndex" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."VectorIndex"."ExternalID" IS 'The provider';

COMMENT ON COLUMN __mj."VectorIndex"."Dimensions" IS 'The number of dimensions for vectors stored in this index. Determined by the embedding model (e.g., 1536 for text-embedding-3-small, 768 for all-mpnet-base-v2). Set automatically when the index is created via the vector database provider.';

COMMENT ON COLUMN __mj."VectorIndex"."Metric" IS 'The distance metric used for similarity calculations in this index. Common values: cosine (default, measures angular similarity), euclidean (L2 distance), dotproduct (inner product). Must match what the vector database provider was configured with.';

COMMENT ON COLUMN __mj."VectorIndex"."ProviderConfig" IS 'JSON object containing provider-specific configuration for this index. For Pinecone serverless: {"cloud":"aws","region":"us-east-1"}. For pod-based: {"environment":"us-east1-gcp","podType":"p1.x1","replicas":1}. Stored as a flexible JSON bag to support any provider without schema changes.';


-- ===================== Other =====================

-- Add metadata columns to VectorIndex for provider sync and configuration

/* spUpdate Permissions for MJ: Vector Indexes */
