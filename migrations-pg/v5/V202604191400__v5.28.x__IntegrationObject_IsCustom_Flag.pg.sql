
-- ===================== DDL: Tables, PKs, Indexes =====================

-- Add IsCustom flag to IntegrationObject and IntegrationObjectField to distinguish
-- static metadata (from mj-sync push) from objects/fields discovered at runtime by
-- IntrospectSchema. Default is 0 (static). Runtime-discovered rows get IsCustom=1
-- so downstream logic can re-introspect them on schema drift and exclude them from
-- metadata export.

ALTER TABLE __mj."IntegrationObject"
 ADD COLUMN "IsCustom" BOOLEAN NOT NULL CONSTRAINT "DF_IntegrationObject_IsCustom" DEFAULT FALSE;

ALTER TABLE __mj."IntegrationObjectField"
 ADD COLUMN "IsCustom" BOOLEAN NOT NULL CONSTRAINT "DF_IntegrationObjectField_IsCustom" DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_IntegrationObjectField_IntegrationObjectID" ON __mj."IntegrationObjectField" ("IntegrationObjectID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_IntegrationObjectField_RelatedIntegra_b9a3197b" ON __mj."IntegrationObjectField" ("RelatedIntegrationObjectID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_IntegrationObject_IntegrationID" ON __mj."IntegrationObject" ("IntegrationID");


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwIntegrationObjectFields';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwIntegrationObjectFields"
AS SELECT
    i.*,
    "MJIntegrationObject_IntegrationObjectID"."Name" AS "IntegrationObject",
    "MJIntegrationObject_RelatedIntegrationObjectID"."Name" AS "RelatedIntegrationObject"
FROM
    __mj."IntegrationObjectField" AS i
INNER JOIN
    __mj."IntegrationObject" AS "MJIntegrationObject_IntegrationObjectID"
  ON
    i."IntegrationObjectID" = "MJIntegrationObject_IntegrationObjectID"."ID"
LEFT OUTER JOIN
    __mj."IntegrationObject" AS "MJIntegrationObject_RelatedIntegrationObjectID"
  ON
    i."RelatedIntegrationObjectID" = "MJIntegrationObject_RelatedIntegrationObjectID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwIntegrationObjects';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwIntegrationObjects"
AS SELECT
    i.*,
    "MJIntegration_IntegrationID"."Name" AS "Integration"
FROM
    __mj."IntegrationObject" AS i
INNER JOIN
    __mj."Integration" AS "MJIntegration_IntegrationID"
  ON
    i."IntegrationID" = "MJIntegration_IntegrationID"."ID"$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateIntegrationObjectField"(
    IN p_ID UUID DEFAULT NULL,
    IN p_IntegrationObjectID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Category VARCHAR(100) DEFAULT NULL,
    IN p_Type VARCHAR(100) DEFAULT NULL,
    IN p_Length INTEGER DEFAULT NULL,
    IN p_Precision INTEGER DEFAULT NULL,
    IN p_Scale INTEGER DEFAULT NULL,
    IN p_AllowsNull BOOLEAN DEFAULT NULL,
    IN p_DefaultValue VARCHAR(255) DEFAULT NULL,
    IN p_IsPrimaryKey BOOLEAN DEFAULT NULL,
    IN p_IsUniqueKey BOOLEAN DEFAULT NULL,
    IN p_IsReadOnly BOOLEAN DEFAULT NULL,
    IN p_IsRequired BOOLEAN DEFAULT NULL,
    IN p_RelatedIntegrationObjectID UUID DEFAULT NULL,
    IN p_RelatedIntegrationObjectFieldName VARCHAR(255) DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_Status VARCHAR(25) DEFAULT NULL,
    IN p_IsCustom BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwIntegrationObjectFields" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."IntegrationObjectField"
            (
                "ID",
                "IntegrationObjectID",
                "Name",
                "DisplayName",
                "Description",
                "Category",
                "Type",
                "Length",
                "Precision",
                "Scale",
                "AllowsNull",
                "DefaultValue",
                "IsPrimaryKey",
                "IsUniqueKey",
                "IsReadOnly",
                "IsRequired",
                "RelatedIntegrationObjectID",
                "RelatedIntegrationObjectFieldName",
                "Sequence",
                "Configuration",
                "Status",
                "IsCustom"
            )
        VALUES
            (
                p_ID,
                p_IntegrationObjectID,
                p_Name,
                p_DisplayName,
                p_Description,
                p_Category,
                p_Type,
                p_Length,
                p_Precision,
                p_Scale,
                COALESCE(p_AllowsNull, TRUE),
                p_DefaultValue,
                COALESCE(p_IsPrimaryKey, FALSE),
                COALESCE(p_IsUniqueKey, FALSE),
                COALESCE(p_IsReadOnly, FALSE),
                COALESCE(p_IsRequired, FALSE),
                p_RelatedIntegrationObjectID,
                p_RelatedIntegrationObjectFieldName,
                COALESCE(p_Sequence, 0),
                p_Configuration,
                COALESCE(p_Status, 'Active'),
                COALESCE(p_IsCustom, FALSE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."IntegrationObjectField"
            (
                "IntegrationObjectID",
                "Name",
                "DisplayName",
                "Description",
                "Category",
                "Type",
                "Length",
                "Precision",
                "Scale",
                "AllowsNull",
                "DefaultValue",
                "IsPrimaryKey",
                "IsUniqueKey",
                "IsReadOnly",
                "IsRequired",
                "RelatedIntegrationObjectID",
                "RelatedIntegrationObjectFieldName",
                "Sequence",
                "Configuration",
                "Status",
                "IsCustom"
            )
        VALUES
            (
                p_IntegrationObjectID,
                p_Name,
                p_DisplayName,
                p_Description,
                p_Category,
                p_Type,
                p_Length,
                p_Precision,
                p_Scale,
                COALESCE(p_AllowsNull, TRUE),
                p_DefaultValue,
                COALESCE(p_IsPrimaryKey, FALSE),
                COALESCE(p_IsUniqueKey, FALSE),
                COALESCE(p_IsReadOnly, FALSE),
                COALESCE(p_IsRequired, FALSE),
                p_RelatedIntegrationObjectID,
                p_RelatedIntegrationObjectFieldName,
                COALESCE(p_Sequence, 0),
                p_Configuration,
                COALESCE(p_Status, 'Active'),
                COALESCE(p_IsCustom, FALSE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwIntegrationObjectFields" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateIntegrationObjectField"(
    IN p_ID UUID,
    IN p_IntegrationObjectID UUID,
    IN p_Name VARCHAR(255),
    IN p_DisplayName VARCHAR(255),
    IN p_Description TEXT,
    IN p_Category VARCHAR(100),
    IN p_Type VARCHAR(100),
    IN p_Length INTEGER,
    IN p_Precision INTEGER,
    IN p_Scale INTEGER,
    IN p_AllowsNull BOOLEAN,
    IN p_DefaultValue VARCHAR(255),
    IN p_IsPrimaryKey BOOLEAN,
    IN p_IsUniqueKey BOOLEAN,
    IN p_IsReadOnly BOOLEAN,
    IN p_IsRequired BOOLEAN,
    IN p_RelatedIntegrationObjectID UUID,
    IN p_RelatedIntegrationObjectFieldName VARCHAR(255),
    IN p_Sequence INTEGER,
    IN p_Configuration TEXT,
    IN p_Status VARCHAR(25),
    IN p_IsCustom BOOLEAN
)
RETURNS SETOF __mj."vwIntegrationObjectFields" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."IntegrationObjectField"
    SET
        "IntegrationObjectID" = p_IntegrationObjectID,
        "Name" = p_Name,
        "DisplayName" = p_DisplayName,
        "Description" = p_Description,
        "Category" = p_Category,
        "Type" = p_Type,
        "Length" = p_Length,
        "Precision" = p_Precision,
        "Scale" = p_Scale,
        "AllowsNull" = p_AllowsNull,
        "DefaultValue" = p_DefaultValue,
        "IsPrimaryKey" = p_IsPrimaryKey,
        "IsUniqueKey" = p_IsUniqueKey,
        "IsReadOnly" = p_IsReadOnly,
        "IsRequired" = p_IsRequired,
        "RelatedIntegrationObjectID" = p_RelatedIntegrationObjectID,
        "RelatedIntegrationObjectFieldName" = p_RelatedIntegrationObjectFieldName,
        "Sequence" = p_Sequence,
        "Configuration" = p_Configuration,
        "Status" = p_Status,
        "IsCustom" = p_IsCustom
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwIntegrationObjectFields" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwIntegrationObjectFields" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateIntegrationObject"(
    IN p_ID UUID DEFAULT NULL,
    IN p_IntegrationID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_DisplayName VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_Category VARCHAR(100) DEFAULT NULL,
    IN p_APIPath VARCHAR(500) DEFAULT NULL,
    IN p_ResponseDataKey VARCHAR(255) DEFAULT NULL,
    IN p_DefaultPageSize INTEGER DEFAULT NULL,
    IN p_SupportsPagination BOOLEAN DEFAULT NULL,
    IN p_PaginationType VARCHAR(20) DEFAULT NULL,
    IN p_SupportsIncrementalSync BOOLEAN DEFAULT NULL,
    IN p_SupportsWrite BOOLEAN DEFAULT NULL,
    IN p_DefaultQueryParams TEXT DEFAULT NULL,
    IN p_Configuration TEXT DEFAULT NULL,
    IN p_Sequence INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(25) DEFAULT NULL,
    IN p_WriteAPIPath VARCHAR(500) DEFAULT NULL,
    IN p_WriteMethod VARCHAR(10) DEFAULT NULL,
    IN p_DeleteMethod VARCHAR(10) DEFAULT NULL,
    IN p_IsCustom BOOLEAN DEFAULT NULL
)
RETURNS SETOF __mj."vwIntegrationObjects" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."IntegrationObject"
            (
                "ID",
                "IntegrationID",
                "Name",
                "DisplayName",
                "Description",
                "Category",
                "APIPath",
                "ResponseDataKey",
                "DefaultPageSize",
                "SupportsPagination",
                "PaginationType",
                "SupportsIncrementalSync",
                "SupportsWrite",
                "DefaultQueryParams",
                "Configuration",
                "Sequence",
                "Status",
                "WriteAPIPath",
                "WriteMethod",
                "DeleteMethod",
                "IsCustom"
            )
        VALUES
            (
                p_ID,
                p_IntegrationID,
                p_Name,
                p_DisplayName,
                p_Description,
                p_Category,
                p_APIPath,
                p_ResponseDataKey,
                COALESCE(p_DefaultPageSize, 100),
                COALESCE(p_SupportsPagination, TRUE),
                COALESCE(p_PaginationType, 'PageNumber'),
                COALESCE(p_SupportsIncrementalSync, FALSE),
                COALESCE(p_SupportsWrite, FALSE),
                p_DefaultQueryParams,
                p_Configuration,
                COALESCE(p_Sequence, 0),
                COALESCE(p_Status, 'Active'),
                p_WriteAPIPath,
                p_WriteMethod,
                p_DeleteMethod,
                COALESCE(p_IsCustom, FALSE)
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."IntegrationObject"
            (
                "IntegrationID",
                "Name",
                "DisplayName",
                "Description",
                "Category",
                "APIPath",
                "ResponseDataKey",
                "DefaultPageSize",
                "SupportsPagination",
                "PaginationType",
                "SupportsIncrementalSync",
                "SupportsWrite",
                "DefaultQueryParams",
                "Configuration",
                "Sequence",
                "Status",
                "WriteAPIPath",
                "WriteMethod",
                "DeleteMethod",
                "IsCustom"
            )
        VALUES
            (
                p_IntegrationID,
                p_Name,
                p_DisplayName,
                p_Description,
                p_Category,
                p_APIPath,
                p_ResponseDataKey,
                COALESCE(p_DefaultPageSize, 100),
                COALESCE(p_SupportsPagination, TRUE),
                COALESCE(p_PaginationType, 'PageNumber'),
                COALESCE(p_SupportsIncrementalSync, FALSE),
                COALESCE(p_SupportsWrite, FALSE),
                p_DefaultQueryParams,
                p_Configuration,
                COALESCE(p_Sequence, 0),
                COALESCE(p_Status, 'Active'),
                p_WriteAPIPath,
                p_WriteMethod,
                p_DeleteMethod,
                COALESCE(p_IsCustom, FALSE)
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwIntegrationObjects" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateIntegrationObject"(
    IN p_ID UUID,
    IN p_IntegrationID UUID,
    IN p_Name VARCHAR(255),
    IN p_DisplayName VARCHAR(255),
    IN p_Description TEXT,
    IN p_Category VARCHAR(100),
    IN p_APIPath VARCHAR(500),
    IN p_ResponseDataKey VARCHAR(255),
    IN p_DefaultPageSize INTEGER,
    IN p_SupportsPagination BOOLEAN,
    IN p_PaginationType VARCHAR(20),
    IN p_SupportsIncrementalSync BOOLEAN,
    IN p_SupportsWrite BOOLEAN,
    IN p_DefaultQueryParams TEXT,
    IN p_Configuration TEXT,
    IN p_Sequence INTEGER,
    IN p_Status VARCHAR(25),
    IN p_WriteAPIPath VARCHAR(500),
    IN p_WriteMethod VARCHAR(10),
    IN p_DeleteMethod VARCHAR(10),
    IN p_IsCustom BOOLEAN
)
RETURNS SETOF __mj."vwIntegrationObjects" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."IntegrationObject"
    SET
        "IntegrationID" = p_IntegrationID,
        "Name" = p_Name,
        "DisplayName" = p_DisplayName,
        "Description" = p_Description,
        "Category" = p_Category,
        "APIPath" = p_APIPath,
        "ResponseDataKey" = p_ResponseDataKey,
        "DefaultPageSize" = p_DefaultPageSize,
        "SupportsPagination" = p_SupportsPagination,
        "PaginationType" = p_PaginationType,
        "SupportsIncrementalSync" = p_SupportsIncrementalSync,
        "SupportsWrite" = p_SupportsWrite,
        "DefaultQueryParams" = p_DefaultQueryParams,
        "Configuration" = p_Configuration,
        "Sequence" = p_Sequence,
        "Status" = p_Status,
        "WriteAPIPath" = p_WriteAPIPath,
        "WriteMethod" = p_WriteMethod,
        "DeleteMethod" = p_DeleteMethod,
        "IsCustom" = p_IsCustom
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwIntegrationObjects" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwIntegrationObjects" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteIntegrationObjectField"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."IntegrationObjectField"
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

CREATE OR REPLACE FUNCTION __mj."spDeleteIntegrationObject"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."IntegrationObject"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateIntegrationObjectField_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateIntegrationObjectField" ON __mj."IntegrationObjectField";
CREATE TRIGGER "trgUpdateIntegrationObjectField"
    BEFORE UPDATE ON __mj."IntegrationObjectField"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateIntegrationObjectField_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateIntegrationObject_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateIntegrationObject" ON __mj."IntegrationObject";
CREATE TRIGGER "trgUpdateIntegrationObject"
    BEFORE UPDATE ON __mj."IntegrationObject"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateIntegrationObject_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'ea459761-25b4-4820-b056-e10e04f8ec28' OR ("EntityID" = '3630CBFD-4C85-4B24-8A51-88D67389373E' AND "Name" = 'IsCustom')
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
        'ea459761-25b4-4820-b056-e10e04f8ec28',
        '3630CBFD-4C85-4B24-8A51-88D67389373E', -- "Entity": "MJ": "Integration" "Object" "Fields"
        100050,
        'IsCustom',
        'Is Custom',
        'When true, this field was dynamically discovered by IntrospectSchema and is not defined in static connector metadata.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '4a4675f9-36f6-4edf-83c0-29dffee0b61e' OR ("EntityID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021' AND "Name" = 'IsCustom')
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
        '4a4675f9-36f6-4edf-83c0-29dffee0b61e',
        '86D3ED6F-2D1D-43F6-9777-FD9672FA9021', -- "Entity": "MJ": "Integration" "Objects"
        100047,
        'IsCustom',
        'Is Custom',
        'When true, this object was dynamically discovered by IntrospectSchema and is not defined in static connector metadata.',
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

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '7F19F87B-4609-4738-97D6-8627DE23AF4B'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = '0F0F0147-386F-45C8-AA9F-021C26B634A5'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = '86D3ED6F-2D1D-43F6-9777-FD9672FA9021'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'CC99E8BA-DDB8-4CFB-8F0A-A4A68769A942'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
               SET "UserSearchPredicateAPI" = 'BeginsWith'
               WHERE "ID" = 'CC99E8BA-DDB8-4CFB-8F0A-A4A68769A942'
               AND "AutoUpdateUserSearchPredicate" = TRUE;

UPDATE __mj."Entity"
            SET "AllowUserSearchAPI" = TRUE
            WHERE "ID" = '3630CBFD-4C85-4B24-8A51-88D67389373E'
            AND "AutoUpdateAllowUserSearchAPI" = TRUE;
/* Set categories for 24 fields */
-- UPDATE Entity Field Category Info MJ: Integration Objects."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F5F7651F-56E2-4E92-A9FE-CFCD61B58B25' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4C7B2511-B32A-4E05-AD8F-71A8D7438E96' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '17416191-6BA9-4D7D-B38D-5D32220C994E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."IntegrationID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Integration ID',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A0EAB738-4BB1-499F-80FC-AA8A0B46B389' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."Integration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Integration',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8DEFCEAD-C227-45E0-AF79-6B3318C563C7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7F19F87B-4609-4738-97D6-8627DE23AF4B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."DisplayName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8B3F3DFF-3E46-4DB2-9FC6-D5B764D80B7E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DBFED2A5-355D-4617-B4F8-237B4D3B2365' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."Category"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0F0F0147-386F-45C8-AA9F-021C26B634A5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."Sequence"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9057E47C-7633-4B86-8ADF-F09044FE4470' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '027BC6FB-AC73-41C5-8856-981FB0031897' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."IsCustom"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Object Definition',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4A4675F9-36F6-4EDF-83C0-29DFFEE0B61E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."APIPath"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1CFA6C37-9057-4662-8C40-F835AA972EDF' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."ResponseDataKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'ADE52A5E-ADBA-4414-AAE2-12B535F85AC3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."DefaultQueryParams"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Default Query Params',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '38708EAC-BEC9-4BD1-AFA5-AF93A00F0FEA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."Configuration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'ED9326F4-6377-4FB3-84FA-EBCC9859FC07' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."WriteAPIPath"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D0BEDA5A-9F7B-4611-867D-59AA8EF8B849' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."WriteMethod"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F0FC7DA1-9649-427C-AEE2-DF31700F7512' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."DeleteMethod"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3006B046-676A-4DF8-B861-2A9A8EFE059D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."DefaultPageSize"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '85D95D3F-DAD6-492D-90AF-5207D16780EE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."SupportsPagination"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '27719863-6129-44D5-A77C-7827DB58BD91' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."PaginationType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '248DBCEF-E551-4913-8579-200B33459E16' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."SupportsIncrementalSync"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C73A053E-44E2-40A8-9A0A-899E6E28AF4D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Objects."SupportsWrite"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E48963CB-3027-4554-BF48-52ECA282D983' AND "AutoUpdateCategory" = TRUE;
/* Set categories for 26 fields */
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C29BAC47-FD92-4209-B600-998618C2A052' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A40B0908-76CC-4D93-B7FF-659D450CDF19' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1E19F566-6FFB-4B64-96C9-8EA44B3DAE08' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."IntegrationObjectID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8EA456AD-785F-4E37-B397-8FF6F2040810' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."RelatedIntegrationObjectID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '22A62BF2-861B-4B29-A7E1-B69B476E706E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."RelatedIntegrationObjectFieldName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EFD4B858-690A-4AD6-9BCE-DACBE0F0BDF3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Configuration"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '2EFA2D36-459B-4433-BFBC-4E76E8A5A461' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."IntegrationObject"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0DCDA729-DB83-421E-B5EC-1B1636C7BC1E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."RelatedIntegrationObject"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E1ED4D02-2463-457C-9C8D-761D24CC5288' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Field Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F087BB9D-A16E-4778-A711-026B5CDB5ECB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."DisplayName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C0279D61-5DD7-4636-ACAF-3C07B4EBF599' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EB935245-A13B-46BA-B54C-BEDE08FAFEC0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Category"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CC99E8BA-DDB8-4CFB-8F0A-A4A68769A942' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Sequence"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5BC346A1-8015-4F20-9247-CB0039EE14E4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '82D4929E-1BBF-4EB5-AFC4-40D1DA3D01D4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."IsCustom"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Field Identity',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EA459761-25B4-4820-B056-E10E04F8EC28' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Type"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Data Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FE592595-E4FD-458A-A892-918DB3ABC0B8' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Length"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A184FA33-D1E3-4341-854A-63BA62571622' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Precision"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FC62F3D1-514C-4850-A884-098ACCEA440C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."Scale"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A27F5839-CA61-42FC-B724-C4F885FB5FA0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."AllowsNull"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4F48E0A4-576C-4746-AF78-0CED62880881' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."DefaultValue"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1E996E3E-68A6-468D-92B5-B1E7D905AB64' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."IsPrimaryKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Is Primary Key',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A41406EF-D751-4E1D-8B03-537EC3F5ED26' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."IsUniqueKey"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Is Unique Key',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DB6D509C-4DDC-4F2B-A2ED-6ABDEFD210A5' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."IsReadOnly"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Is Read Only',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6B8579C3-5351-4263-AEF4-BB44E30D4B4D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: Integration Object Fields."IsRequired"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Is Required',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DA3BC5CE-671C-48AC-9CD5-497CA602D0E5' AND "AutoUpdateCategory" = TRUE;


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwIntegrationObjectFields" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: Permissions for vwIntegrationObjectFields
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwIntegrationObjectFields" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: spCreateIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IntegrationObjectField
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIntegrationObjectField" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Integration Object Fields */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIntegrationObjectField" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: spUpdateIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IntegrationObjectField
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegrationObjectField" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegrationObjectField" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: vwIntegrationObjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: Integration Objects
-----               SCHEMA:      __mj
-----               BASE TABLE:  IntegrationObject
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwIntegrationObjects" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: Permissions for vwIntegrationObjects
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwIntegrationObjects" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: spCreateIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR IntegrationObject
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIntegrationObject" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: Integration Objects */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateIntegrationObject" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: spUpdateIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR IntegrationObject
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegrationObject" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateIntegrationObject" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Integration Object Fields */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Object Fields
-- Item: spDeleteIntegrationObjectField
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IntegrationObjectField
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationObjectField" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Integration Object Fields */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationObjectField" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: Integration Objects */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: Integration Objects
-- Item: spDeleteIntegrationObject
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR IntegrationObject
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationObject" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: Integration Objects */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteIntegrationObject" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."IntegrationObject"."IsCustom" IS 'When true, this object was dynamically discovered by IntrospectSchema and is not defined in static connector metadata.';

COMMENT ON COLUMN __mj."IntegrationObjectField"."IsCustom" IS 'When true, this field was dynamically discovered by IntrospectSchema and is not defined in static connector metadata.';


-- ===================== Other =====================

--- CODEGEN OUTPUT ---


/* SQL text to insert new entity field */

/* spUpdate Permissions for MJ: Integration Object Fields */

/* spUpdate Permissions for MJ: Integration Objects */
