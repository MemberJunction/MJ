
-- ===================== DDL: Tables, PKs, Indexes =====================

ALTER TABLE __mj."EntityDocument"
 ADD COLUMN "Configuration" TEXT NULL;

-- VectorDatabase: provider-specific connection settings like custom host URLs,
-- authentication config, timeouts, retry policies, batch size limits, etc.;

ALTER TABLE __mj."VectorDatabase"
 ADD COLUMN "Configuration" TEXT NULL;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityDocument_TypeID" ON __mj."EntityDocument" ("TypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityDocument_EntityID" ON __mj."EntityDocument" ("EntityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityDocument_VectorDatabaseID" ON __mj."EntityDocument" ("VectorDatabaseID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityDocument_TemplateID" ON __mj."EntityDocument" ("TemplateID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityDocument_AIModelID" ON __mj."EntityDocument" ("AIModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_EntityDocument_VectorIndexID" ON __mj."EntityDocument" ("VectorIndexID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwEntityDocuments';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwEntityDocuments"
AS SELECT
    e.*,
    "MJEntityDocumentType_TypeID"."Name" AS "Type",
    "MJEntity_EntityID"."Name" AS "Entity",
    "MJVectorDatabase_VectorDatabaseID"."Name" AS "VectorDatabase",
    "MJTemplate_TemplateID"."Name" AS "Template",
    "MJAIModel_AIModelID"."Name" AS "AIModel",
    "MJVectorIndex_VectorIndexID"."Name" AS "VectorIndex"
FROM
    __mj."EntityDocument" AS e
INNER JOIN
    __mj."EntityDocumentType" AS "MJEntityDocumentType_TypeID"
  ON
    e."TypeID" = "MJEntityDocumentType_TypeID"."ID"
INNER JOIN
    __mj."Entity" AS "MJEntity_EntityID"
  ON
    e."EntityID" = "MJEntity_EntityID"."ID"
INNER JOIN
    __mj."VectorDatabase" AS "MJVectorDatabase_VectorDatabaseID"
  ON
    e."VectorDatabaseID" = "MJVectorDatabase_VectorDatabaseID"."ID"
INNER JOIN
    __mj."Template" AS "MJTemplate_TemplateID"
  ON
    e."TemplateID" = "MJTemplate_TemplateID"."ID"
INNER JOIN
    __mj."AIModel" AS "MJAIModel_AIModelID"
  ON
    e."AIModelID" = "MJAIModel_AIModelID"."ID"
LEFT OUTER JOIN
    __mj."VectorIndex" AS "MJVectorIndex_VectorIndexID"
  ON
    e."VectorIndexID" = "MJVectorIndex_VectorIndexID"."ID"$vsql$;
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

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwVectorDatabases';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwVectorDatabases"
AS SELECT
    v.*
FROM
    __mj."VectorDatabase" AS v$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateEntityDocument"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(250) DEFAULT NULL,
    IN p_TypeID UUID DEFAULT NULL,
    IN p_EntityID UUID DEFAULT NULL,
    IN p_VectorDatabaseID UUID DEFAULT NULL,
    IN p_Status VARCHAR(15) DEFAULT NULL,
    IN p_TemplateID UUID DEFAULT NULL,
    IN p_AIModelID UUID DEFAULT NULL,
    IN p_PotentialMatchThreshold NUMERIC(12,11) DEFAULT NULL,
    IN p_AbsoluteMatchThreshold NUMERIC(12,11) DEFAULT NULL,
    IN p_VectorIndexID UUID DEFAULT NULL,
    IN p_Configuration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwEntityDocuments" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."EntityDocument"
            (
                "ID",
                "Name",
                "TypeID",
                "EntityID",
                "VectorDatabaseID",
                "Status",
                "TemplateID",
                "AIModelID",
                "PotentialMatchThreshold",
                "AbsoluteMatchThreshold",
                "VectorIndexID",
                "Configuration"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_TypeID,
                p_EntityID,
                p_VectorDatabaseID,
                COALESCE(p_Status, 'Active'),
                p_TemplateID,
                p_AIModelID,
                COALESCE(p_PotentialMatchThreshold, 1),
                COALESCE(p_AbsoluteMatchThreshold, 1),
                p_VectorIndexID,
                p_Configuration
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."EntityDocument"
            (
                "Name",
                "TypeID",
                "EntityID",
                "VectorDatabaseID",
                "Status",
                "TemplateID",
                "AIModelID",
                "PotentialMatchThreshold",
                "AbsoluteMatchThreshold",
                "VectorIndexID",
                "Configuration"
            )
        VALUES
            (
                p_Name,
                p_TypeID,
                p_EntityID,
                p_VectorDatabaseID,
                COALESCE(p_Status, 'Active'),
                p_TemplateID,
                p_AIModelID,
                COALESCE(p_PotentialMatchThreshold, 1),
                COALESCE(p_AbsoluteMatchThreshold, 1),
                p_VectorIndexID,
                p_Configuration
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwEntityDocuments" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateEntityDocument"(
    IN p_ID UUID,
    IN p_Name VARCHAR(250),
    IN p_TypeID UUID,
    IN p_EntityID UUID,
    IN p_VectorDatabaseID UUID,
    IN p_Status VARCHAR(15),
    IN p_TemplateID UUID,
    IN p_AIModelID UUID,
    IN p_PotentialMatchThreshold NUMERIC(12,11),
    IN p_AbsoluteMatchThreshold NUMERIC(12,11),
    IN p_VectorIndexID UUID,
    IN p_Configuration TEXT
)
RETURNS SETOF __mj."vwEntityDocuments" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."EntityDocument"
    SET
        "Name" = p_Name,
        "TypeID" = p_TypeID,
        "EntityID" = p_EntityID,
        "VectorDatabaseID" = p_VectorDatabaseID,
        "Status" = p_Status,
        "TemplateID" = p_TemplateID,
        "AIModelID" = p_AIModelID,
        "PotentialMatchThreshold" = p_PotentialMatchThreshold,
        "AbsoluteMatchThreshold" = p_AbsoluteMatchThreshold,
        "VectorIndexID" = p_VectorIndexID,
        "Configuration" = p_Configuration
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwEntityDocuments" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwEntityDocuments" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteEntityDocument"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."EntityDocument"
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

CREATE OR REPLACE FUNCTION __mj."spCreateVectorDatabase"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(100) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_DefaultURL VARCHAR(255) DEFAULT NULL,
    IN p_ClassKey VARCHAR(100) DEFAULT NULL,
    IN p_Configuration TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwVectorDatabases" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."VectorDatabase"
            (
                "ID",
                "Name",
                "Description",
                "DefaultURL",
                "ClassKey",
                "Configuration"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_DefaultURL,
                p_ClassKey,
                p_Configuration
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."VectorDatabase"
            (
                "Name",
                "Description",
                "DefaultURL",
                "ClassKey",
                "Configuration"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_DefaultURL,
                p_ClassKey,
                p_Configuration
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwVectorDatabases" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateVectorDatabase"(
    IN p_ID UUID,
    IN p_Name VARCHAR(100),
    IN p_Description TEXT,
    IN p_DefaultURL VARCHAR(255),
    IN p_ClassKey VARCHAR(100),
    IN p_Configuration TEXT
)
RETURNS SETOF __mj."vwVectorDatabases" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."VectorDatabase"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DefaultURL" = p_DefaultURL,
        "ClassKey" = p_ClassKey,
        "Configuration" = p_Configuration
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwVectorDatabases" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwVectorDatabases" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteVectorDatabase"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."VectorDatabase"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateEntityDocument_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateEntityDocument" ON __mj."EntityDocument";
CREATE TRIGGER "trgUpdateEntityDocument"
    BEFORE UPDATE ON __mj."EntityDocument"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateEntityDocument_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateVectorDatabase_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateVectorDatabase" ON __mj."VectorDatabase";
CREATE TRIGGER "trgUpdateVectorDatabase"
    BEFORE UPDATE ON __mj."VectorDatabase"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateVectorDatabase_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '2c4f4b15-7a37-49fa-87d5-6ef9d5b66699' OR ("EntityID" = '20248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Configuration')
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
        '2c4f4b15-7a37-49fa-87d5-6ef9d5b66699',
        '20248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Vector" "Databases"
        100015,
        'Configuration',
        'Configuration',
        'JSON configuration settings for this vector database provider. Stores provider-specific connection settings like custom host URLs, authentication configuration, timeouts, retry policies, and batch size limits. NULL means use defaults from environment variables or provider defaults.',
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
        'Dropdown',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5997b3e4-6b33-49e1-9c6f-88b8e5bd4c03' OR ("EntityID" = '22248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'Configuration')
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
        '5997b3e4-6b33-49e1-9c6f-88b8e5bd4c03',
        '22248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "Entity" "Documents"
        100033,
        'Configuration',
        'Configuration',
        'JSON configuration settings for this entity document. Controls vector metadata field inclusion (which fields get stored in the vector index for search result display), large field truncation limits, and future settings like sync scheduling and threshold overrides. NULL means use system defaults.',
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

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'E84317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'E94317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'EA4317F0-6F36-EF11-86D4-6045BDEE16E6'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 8 fields */
-- UPDATE Entity Field Category Info MJ: Vector Databases."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E64317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Vector Databases."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E74317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Vector Databases."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E84317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Vector Databases."DefaultURL"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'URL',
   "CodeType" = NULL
WHERE 
   "ID" = 'E94317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Vector Databases."ClassKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EA4317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Vector Databases."Configuration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Vector Database Details',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '2C4F4B15-7A37-49FA-87D5-6EF9D5B66699' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Vector Databases.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C85817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Vector Databases.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C95817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* Set categories for 20 fields */
-- UPDATE Entity Field Category Info MJ: Entity Documents."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F34317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F44317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents."Type"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EA4E17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents."TypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F64317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents."EntityID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F54317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents."VectorDatabaseID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2A4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents."TemplateID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B0EB26E0-3E3B-EF11-86D4-0022481D1B23' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents."AIModelID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2B4F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents."VectorIndexID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7EC088B4-C4AA-4E8F-841B-1650720C4FD7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents."Entity"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '024F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents."VectorDatabase"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CCADD97E-8E07-4B42-A16F-ADCFF9F9B385' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents."Template"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AF9D284C-DA9C-409B-ABB0-4BB4AA1F778F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents."AIModel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EAE4FA06-2E28-4959-9179-7C6420F7FE60' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents."VectorIndex"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BAC4C88D-29FE-46E9-9BC4-37B473206A08' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F74317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents."PotentialMatchThreshold"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '264417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents."AbsoluteMatchThreshold"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '274417F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents."Configuration"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Matching Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '5997B3E4-6B33-49E1-9C6F-88B8E5BD4C03' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '144D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Entity Documents.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '154D17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityDocuments" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: Permissions for vwEntityDocuments
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwEntityDocuments" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: spCreateEntityDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR EntityDocument
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityDocument" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Entity Documents */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateEntityDocument" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: spUpdateEntityDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR EntityDocument
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityDocument" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateEntityDocument" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Entity Documents */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Entity Documents
-- Item: spDeleteEntityDocument
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR EntityDocument
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocument" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Entity Documents */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteEntityDocument" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for VectorDatabase */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Databases
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------


/* Base View SQL for MJ: Vector Databases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Databases
-- Item: vwVectorDatabases
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Vector Databases
-----               SCHEMA:      __mj
-----               BASE TABLE:  VectorDatabase
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwVectorDatabases" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Vector Databases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Databases
-- Item: Permissions for vwVectorDatabases
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwVectorDatabases" TO "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Vector Databases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Databases
-- Item: spCreateVectorDatabase
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR VectorDatabase
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateVectorDatabase" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Vector Databases */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateVectorDatabase" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Vector Databases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Databases
-- Item: spUpdateVectorDatabase
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR VectorDatabase
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateVectorDatabase" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateVectorDatabase" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Vector Databases */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Vector Databases
-- Item: spDeleteVectorDatabase
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR VectorDatabase
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteVectorDatabase" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Vector Databases */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteVectorDatabase" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."EntityDocument"."Configuration" IS 'JSON configuration settings for this entity document. Controls vector metadata field inclusion (which fields get stored in the vector index for search result display), large field truncation limits, and future settings like sync scheduling and threshold overrides. NULL means use system defaults.';

COMMENT ON COLUMN __mj."VectorDatabase"."Configuration" IS 'JSON configuration settings for this vector database provider. Stores provider-specific connection settings like custom host URLs, authentication configuration, timeouts, retry policies, and batch size limits. NULL means use defaults from environment variables or provider defaults.';


-- ===================== Other =====================

-- Add Configuration columns to EntityDocument and VectorDatabase for extensible JSON settings.

-- EntityDocument: controls vector metadata field inclusion, large field truncation,
-- sync scheduling, thresholds, pipeline options, etc.

/* spUpdate Permissions for MJ: Entity Documents */

/* spUpdate Permissions for MJ: Vector Databases */
