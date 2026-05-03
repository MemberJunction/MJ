
-- ===================== DDL: Tables, PKs, Indexes =====================

ALTER TABLE __mj."AIPrompt"
 ADD COLUMN "AssistantPrefill" TEXT NULL,
 ADD COLUMN "PrefillFallbackMode" VARCHAR(20) NOT NULL DEFAULT 'Ignore',
 ADD CONSTRAINT "CK_AIPrompt_PrefillFallbackMode" CHECK ("PrefillFallbackMode" IN ('Ignore', 'SystemInstruction', 'None')) NOT VALID;

ALTER TABLE __mj."AIModelType"
 ADD COLUMN "SupportsPrefill" BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN "PrefillFallbackText" TEXT NULL;

ALTER TABLE __mj."AIModel"
 ADD COLUMN "SupportsPrefill" BOOLEAN NULL,
 ADD COLUMN "PrefillFallbackText" TEXT NULL;

ALTER TABLE __mj."AIModelVendor"
 ADD COLUMN "SupportsPrefill" BOOLEAN NULL,
 ADD COLUMN "PrefillFallbackText" TEXT NULL;

-----------------------------------------------
-- 2. Extended Properties: Column descriptions
-----------------------------------------------

-- AIPrompt columns;

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIModelType_DefaultInputModalityID" ON __mj."AIModelType" ("DefaultInputModalityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIModelType_DefaultOutputModalityID" ON __mj."AIModelType" ("DefaultOutputModalityID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIModelVendor_ModelID" ON __mj."AIModelVendor" ("ModelID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIModelVendor_VendorID" ON __mj."AIModelVendor" ("VendorID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIModelVendor_TypeID" ON __mj."AIModelVendor" ("TypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIModel_AIModelTypeID" ON __mj."AIModel" ("AIModelTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIModel_PriorVersionID" ON __mj."AIModel" ("PriorVersionID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIPrompt_TemplateID" ON __mj."AIPrompt" ("TemplateID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIPrompt_CategoryID" ON __mj."AIPrompt" ("CategoryID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIPrompt_TypeID" ON __mj."AIPrompt" ("TypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIPrompt_AIModelTypeID" ON __mj."AIPrompt" ("AIModelTypeID");

CREATE INDEX IF NOT EXISTS "IDX_AUTO_MJ_FKEY_AIPrompt_ResultSelectorPromptID" ON __mj."AIPrompt" ("ResultSelectorPromptID");


-- ===================== Helper Functions (fn*) =====================

CREATE OR REPLACE FUNCTION __mj."fnAIPromptResultSelectorPromptID_GetRootID"(
    p_RecordID UUID,
    p_ParentID UUID
)
RETURNS TABLE("RootID" UUID) AS $$
WITH RECURSIVE CTE_RootParent AS (
        SELECT
            "ID",
            "ResultSelectorPromptID",
            "ID" AS "RootParentID",
            0 AS "Depth"
        FROM
            __mj."AIPrompt"
        WHERE
            "ID" = COALESCE(p_ParentID, p_RecordID)

        UNION ALL

        SELECT
            c."ID",
            c."ResultSelectorPromptID",
            c."ID" AS "RootParentID",
            p."Depth" + 1 AS "Depth"
        FROM
            __mj."AIPrompt" c
        INNER JOIN
            CTE_RootParent p ON c."ID" = p."ResultSelectorPromptID"
        WHERE
            p."Depth" < 100
    )
    SELECT         "RootParentID" AS RootID
    FROM
        CTE_RootParent
    WHERE
        "ResultSelectorPromptID" IS NULL
    ORDER BY
        "RootParentID"

LIMIT 1
$$ LANGUAGE sql;


-- ===================== Views =====================

DO $do$
DECLARE
  v_target_schema CONSTANT TEXT := '__mj';
  v_target_name CONSTANT TEXT := 'vwAIModelTypes';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIModelTypes"
AS SELECT
    a.*,
    "MJAIModality_DefaultInputModalityID"."Name" AS "DefaultInputModality",
    "MJAIModality_DefaultOutputModalityID"."Name" AS "DefaultOutputModality"
FROM
    __mj."AIModelType" AS a
INNER JOIN
    __mj."AIModality" AS "MJAIModality_DefaultInputModalityID"
  ON
    a."DefaultInputModalityID" = "MJAIModality_DefaultInputModalityID"."ID"
INNER JOIN
    __mj."AIModality" AS "MJAIModality_DefaultOutputModalityID"
  ON
    a."DefaultOutputModalityID" = "MJAIModality_DefaultOutputModalityID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwAIModelVendors';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIModelVendors"
AS SELECT
    a.*,
    "MJAIModel_ModelID"."Name" AS "Model",
    "MJAIVendor_VendorID"."Name" AS "Vendor",
    "MJAIVendorTypeDefinition_TypeID"."Name" AS "Type"
FROM
    __mj."AIModelVendor" AS a
INNER JOIN
    __mj."AIModel" AS "MJAIModel_ModelID"
  ON
    a."ModelID" = "MJAIModel_ModelID"."ID"
INNER JOIN
    __mj."AIVendor" AS "MJAIVendor_VendorID"
  ON
    a."VendorID" = "MJAIVendor_VendorID"."ID"
INNER JOIN
    __mj."AIVendorTypeDefinition" AS "MJAIVendorTypeDefinition_TypeID"
  ON
    a."TypeID" = "MJAIVendorTypeDefinition_TypeID"."ID"$vsql$;
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
  v_target_name CONSTANT TEXT := 'vwAIPrompts';
  vsql CONSTANT TEXT := $vsql$CREATE OR REPLACE VIEW __mj."vwAIPrompts"
AS SELECT
    a.*,
    "MJTemplate_TemplateID"."Name" AS "Template",
    "MJAIPromptCategory_CategoryID"."Name" AS "Category",
    "MJAIPromptType_TypeID"."Name" AS "Type",
    "MJAIModelType_AIModelTypeID"."Name" AS "AIModelType",
    "MJAIPrompt_ResultSelectorPromptID"."Name" AS "ResultSelectorPrompt",
    "root_ResultSelectorPromptID"."RootID" AS "RootResultSelectorPromptID"
FROM
    __mj."AIPrompt" AS a
INNER JOIN
    __mj."Template" AS "MJTemplate_TemplateID"
  ON
    a."TemplateID" = "MJTemplate_TemplateID"."ID"
LEFT OUTER JOIN
    __mj."AIPromptCategory" AS "MJAIPromptCategory_CategoryID"
  ON
    a."CategoryID" = "MJAIPromptCategory_CategoryID"."ID"
INNER JOIN
    __mj."AIPromptType" AS "MJAIPromptType_TypeID"
  ON
    a."TypeID" = "MJAIPromptType_TypeID"."ID"
LEFT OUTER JOIN
    __mj."AIModelType" AS "MJAIModelType_AIModelTypeID"
  ON
    a."AIModelTypeID" = "MJAIModelType_AIModelTypeID"."ID"
LEFT OUTER JOIN
    __mj."AIPrompt" AS "MJAIPrompt_ResultSelectorPromptID"
  ON
    a."ResultSelectorPromptID" = "MJAIPrompt_ResultSelectorPromptID"."ID"
LEFT JOIN LATERAL (SELECT * FROM __mj."fnAIPromptResultSelectorPromptID_GetRootID"(a."ID", a."ResultSelectorPromptID")) AS "root_ResultSelectorPromptID" ON TRUE$vsql$;
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

CREATE OR REPLACE FUNCTION __mj."spCreateAIModel"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(50) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_AIModelTypeID UUID DEFAULT NULL,
    IN p_PowerRank INTEGER DEFAULT NULL,
    IN p_IsActive BOOLEAN DEFAULT NULL,
    IN p_SpeedRank INTEGER DEFAULT NULL,
    IN p_CostRank INTEGER DEFAULT NULL,
    IN p_ModelSelectionInsights TEXT DEFAULT NULL,
    IN p_InheritTypeModalities BOOLEAN DEFAULT NULL,
    IN p_PriorVersionID UUID DEFAULT NULL,
    IN p_SupportsPrefill BOOLEAN DEFAULT NULL,
    IN p_PrefillFallbackText TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwAIModels" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIModel"
            (
                "ID",
                "Name",
                "Description",
                "AIModelTypeID",
                "PowerRank",
                "IsActive",
                "SpeedRank",
                "CostRank",
                "ModelSelectionInsights",
                "InheritTypeModalities",
                "PriorVersionID",
                "SupportsPrefill",
                "PrefillFallbackText"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_AIModelTypeID,
                p_PowerRank,
                COALESCE(p_IsActive, TRUE),
                p_SpeedRank,
                p_CostRank,
                p_ModelSelectionInsights,
                COALESCE(p_InheritTypeModalities, TRUE),
                p_PriorVersionID,
                p_SupportsPrefill,
                p_PrefillFallbackText
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIModel"
            (
                "Name",
                "Description",
                "AIModelTypeID",
                "PowerRank",
                "IsActive",
                "SpeedRank",
                "CostRank",
                "ModelSelectionInsights",
                "InheritTypeModalities",
                "PriorVersionID",
                "SupportsPrefill",
                "PrefillFallbackText"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_AIModelTypeID,
                p_PowerRank,
                COALESCE(p_IsActive, TRUE),
                p_SpeedRank,
                p_CostRank,
                p_ModelSelectionInsights,
                COALESCE(p_InheritTypeModalities, TRUE),
                p_PriorVersionID,
                p_SupportsPrefill,
                p_PrefillFallbackText
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIModels" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIModel"(
    IN p_ID UUID,
    IN p_Name VARCHAR(50),
    IN p_Description TEXT,
    IN p_AIModelTypeID UUID,
    IN p_PowerRank INTEGER,
    IN p_IsActive BOOLEAN,
    IN p_SpeedRank INTEGER,
    IN p_CostRank INTEGER,
    IN p_ModelSelectionInsights TEXT,
    IN p_InheritTypeModalities BOOLEAN,
    IN p_PriorVersionID UUID,
    IN p_SupportsPrefill BOOLEAN,
    IN p_PrefillFallbackText TEXT
)
RETURNS SETOF __mj."vwAIModels" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIModel"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "AIModelTypeID" = p_AIModelTypeID,
        "PowerRank" = p_PowerRank,
        "IsActive" = p_IsActive,
        "SpeedRank" = p_SpeedRank,
        "CostRank" = p_CostRank,
        "ModelSelectionInsights" = p_ModelSelectionInsights,
        "InheritTypeModalities" = p_InheritTypeModalities,
        "PriorVersionID" = p_PriorVersionID,
        "SupportsPrefill" = p_SupportsPrefill,
        "PrefillFallbackText" = p_PrefillFallbackText
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIModels" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIModels" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIModel"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIModel"
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

CREATE OR REPLACE FUNCTION __mj."spCreateAIModelType"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(50) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_DefaultInputModalityID UUID DEFAULT NULL,
    IN p_DefaultOutputModalityID UUID DEFAULT NULL,
    IN p_SupportsPrefill BOOLEAN DEFAULT NULL,
    IN p_PrefillFallbackText TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwAIModelTypes" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIModelType"
            (
                "ID",
                "Name",
                "Description",
                "DefaultInputModalityID",
                "DefaultOutputModalityID",
                "SupportsPrefill",
                "PrefillFallbackText"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_DefaultInputModalityID,
                p_DefaultOutputModalityID,
                COALESCE(p_SupportsPrefill, FALSE),
                p_PrefillFallbackText
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIModelType"
            (
                "Name",
                "Description",
                "DefaultInputModalityID",
                "DefaultOutputModalityID",
                "SupportsPrefill",
                "PrefillFallbackText"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_DefaultInputModalityID,
                p_DefaultOutputModalityID,
                COALESCE(p_SupportsPrefill, FALSE),
                p_PrefillFallbackText
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIModelTypes" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIModelType"(
    IN p_ID UUID,
    IN p_Name VARCHAR(50),
    IN p_Description TEXT,
    IN p_DefaultInputModalityID UUID,
    IN p_DefaultOutputModalityID UUID,
    IN p_SupportsPrefill BOOLEAN,
    IN p_PrefillFallbackText TEXT
)
RETURNS SETOF __mj."vwAIModelTypes" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIModelType"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "DefaultInputModalityID" = p_DefaultInputModalityID,
        "DefaultOutputModalityID" = p_DefaultOutputModalityID,
        "SupportsPrefill" = p_SupportsPrefill,
        "PrefillFallbackText" = p_PrefillFallbackText
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIModelTypes" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIModelTypes" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spCreateAIModelVendor"(
    IN p_ID UUID DEFAULT NULL,
    IN p_ModelID UUID DEFAULT NULL,
    IN p_VendorID UUID DEFAULT NULL,
    IN p_Priority INTEGER DEFAULT NULL,
    IN p_Status VARCHAR(20) DEFAULT NULL,
    IN p_DriverClass VARCHAR(100) DEFAULT NULL,
    IN p_DriverImportPath VARCHAR(255) DEFAULT NULL,
    IN p_APIName VARCHAR(100) DEFAULT NULL,
    IN p_MaxInputTokens INTEGER DEFAULT NULL,
    IN p_MaxOutputTokens INTEGER DEFAULT NULL,
    IN p_SupportedResponseFormats VARCHAR(100) DEFAULT NULL,
    IN p_SupportsEffortLevel BOOLEAN DEFAULT NULL,
    IN p_SupportsStreaming BOOLEAN DEFAULT NULL,
    IN p_TypeID UUID DEFAULT NULL,
    IN p_SupportsPrefill BOOLEAN DEFAULT NULL,
    IN p_PrefillFallbackText TEXT DEFAULT NULL
)
RETURNS SETOF __mj."vwAIModelVendors" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIModelVendor"
            (
                "ID",
                "ModelID",
                "VendorID",
                "Priority",
                "Status",
                "DriverClass",
                "DriverImportPath",
                "APIName",
                "MaxInputTokens",
                "MaxOutputTokens",
                "SupportedResponseFormats",
                "SupportsEffortLevel",
                "SupportsStreaming",
                "TypeID",
                "SupportsPrefill",
                "PrefillFallbackText"
            )
        VALUES
            (
                p_ID,
                p_ModelID,
                p_VendorID,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active'),
                p_DriverClass,
                p_DriverImportPath,
                p_APIName,
                p_MaxInputTokens,
                p_MaxOutputTokens,
                COALESCE(p_SupportedResponseFormats, 'Any'),
                COALESCE(p_SupportsEffortLevel, FALSE),
                COALESCE(p_SupportsStreaming, FALSE),
                p_TypeID,
                p_SupportsPrefill,
                p_PrefillFallbackText
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIModelVendor"
            (
                "ModelID",
                "VendorID",
                "Priority",
                "Status",
                "DriverClass",
                "DriverImportPath",
                "APIName",
                "MaxInputTokens",
                "MaxOutputTokens",
                "SupportedResponseFormats",
                "SupportsEffortLevel",
                "SupportsStreaming",
                "TypeID",
                "SupportsPrefill",
                "PrefillFallbackText"
            )
        VALUES
            (
                p_ModelID,
                p_VendorID,
                COALESCE(p_Priority, 0),
                COALESCE(p_Status, 'Active'),
                p_DriverClass,
                p_DriverImportPath,
                p_APIName,
                p_MaxInputTokens,
                p_MaxOutputTokens,
                COALESCE(p_SupportedResponseFormats, 'Any'),
                COALESCE(p_SupportsEffortLevel, FALSE),
                COALESCE(p_SupportsStreaming, FALSE),
                p_TypeID,
                p_SupportsPrefill,
                p_PrefillFallbackText
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIModelVendors" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIModelVendor"(
    IN p_ID UUID,
    IN p_ModelID UUID,
    IN p_VendorID UUID,
    IN p_Priority INTEGER,
    IN p_Status VARCHAR(20),
    IN p_DriverClass VARCHAR(100),
    IN p_DriverImportPath VARCHAR(255),
    IN p_APIName VARCHAR(100),
    IN p_MaxInputTokens INTEGER,
    IN p_MaxOutputTokens INTEGER,
    IN p_SupportedResponseFormats VARCHAR(100),
    IN p_SupportsEffortLevel BOOLEAN,
    IN p_SupportsStreaming BOOLEAN,
    IN p_TypeID UUID,
    IN p_SupportsPrefill BOOLEAN,
    IN p_PrefillFallbackText TEXT
)
RETURNS SETOF __mj."vwAIModelVendors" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIModelVendor"
    SET
        "ModelID" = p_ModelID,
        "VendorID" = p_VendorID,
        "Priority" = p_Priority,
        "Status" = p_Status,
        "DriverClass" = p_DriverClass,
        "DriverImportPath" = p_DriverImportPath,
        "APIName" = p_APIName,
        "MaxInputTokens" = p_MaxInputTokens,
        "MaxOutputTokens" = p_MaxOutputTokens,
        "SupportedResponseFormats" = p_SupportedResponseFormats,
        "SupportsEffortLevel" = p_SupportsEffortLevel,
        "SupportsStreaming" = p_SupportsStreaming,
        "TypeID" = p_TypeID,
        "SupportsPrefill" = p_SupportsPrefill,
        "PrefillFallbackText" = p_PrefillFallbackText
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIModelVendors" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIModelVendors" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelType"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIModelType"
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

CREATE OR REPLACE FUNCTION __mj."spDeleteAIModelVendor"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
DELETE FROM
        __mj."AIModelVendor"
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

CREATE OR REPLACE FUNCTION __mj."spCreateAIPrompt"(
    IN p_ID UUID DEFAULT NULL,
    IN p_Name VARCHAR(255) DEFAULT NULL,
    IN p_Description TEXT DEFAULT NULL,
    IN p_TemplateID UUID DEFAULT NULL,
    IN p_CategoryID UUID DEFAULT NULL,
    IN p_TypeID UUID DEFAULT NULL,
    IN p_Status VARCHAR(50) DEFAULT NULL,
    IN p_ResponseFormat VARCHAR(20) DEFAULT NULL,
    IN p_ModelSpecificResponseFormat TEXT DEFAULT NULL,
    IN p_AIModelTypeID UUID DEFAULT NULL,
    IN p_MinPowerRank INTEGER DEFAULT NULL,
    IN p_SelectionStrategy VARCHAR(20) DEFAULT NULL,
    IN p_PowerPreference VARCHAR(20) DEFAULT NULL,
    IN p_ParallelizationMode VARCHAR(20) DEFAULT NULL,
    IN p_ParallelCount INTEGER DEFAULT NULL,
    IN p_ParallelConfigParam VARCHAR(100) DEFAULT NULL,
    IN p_OutputType VARCHAR(50) DEFAULT NULL,
    IN p_OutputExample TEXT DEFAULT NULL,
    IN p_ValidationBehavior VARCHAR(50) DEFAULT NULL,
    IN p_MaxRetries INTEGER DEFAULT NULL,
    IN p_RetryDelayMS INTEGER DEFAULT NULL,
    IN p_RetryStrategy VARCHAR(20) DEFAULT NULL,
    IN p_ResultSelectorPromptID UUID DEFAULT NULL,
    IN p_EnableCaching BOOLEAN DEFAULT NULL,
    IN p_CacheTTLSeconds INTEGER DEFAULT NULL,
    IN p_CacheMatchType VARCHAR(20) DEFAULT NULL,
    IN p_CacheSimilarityThreshold DOUBLE PRECISION DEFAULT NULL,
    IN p_CacheMustMatchModel BOOLEAN DEFAULT NULL,
    IN p_CacheMustMatchVendor BOOLEAN DEFAULT NULL,
    IN p_CacheMustMatchAgent BOOLEAN DEFAULT NULL,
    IN p_CacheMustMatchConfig BOOLEAN DEFAULT NULL,
    IN p_PromptRole VARCHAR(20) DEFAULT NULL,
    IN p_PromptPosition VARCHAR(20) DEFAULT NULL,
    IN p_Temperature NUMERIC(3,2) DEFAULT NULL,
    IN p_TopP NUMERIC(3,2) DEFAULT NULL,
    IN p_TopK INTEGER DEFAULT NULL,
    IN p_MinP NUMERIC(3,2) DEFAULT NULL,
    IN p_FrequencyPenalty NUMERIC(3,2) DEFAULT NULL,
    IN p_PresencePenalty NUMERIC(3,2) DEFAULT NULL,
    IN p_Seed INTEGER DEFAULT NULL,
    IN p_StopSequences VARCHAR(1000) DEFAULT NULL,
    IN p_IncludeLogProbs BOOLEAN DEFAULT NULL,
    IN p_TopLogProbs INTEGER DEFAULT NULL,
    IN p_FailoverStrategy VARCHAR(50) DEFAULT NULL,
    IN p_FailoverMaxAttempts INTEGER DEFAULT NULL,
    IN p_FailoverDelaySeconds INTEGER DEFAULT NULL,
    IN p_FailoverModelStrategy VARCHAR(50) DEFAULT NULL,
    IN p_FailoverErrorScope VARCHAR(50) DEFAULT NULL,
    IN p_EffortLevel INTEGER DEFAULT NULL,
    IN p_AssistantPrefill TEXT DEFAULT NULL,
    IN p_PrefillFallbackMode VARCHAR(20) DEFAULT NULL
)
RETURNS SETOF __mj."vwAIPrompts" AS
$$
BEGIN
IF p_ID IS NOT NULL THEN
        -- User provided a value, use it
        INSERT INTO __mj."AIPrompt"
            (
                "ID",
                "Name",
                "Description",
                "TemplateID",
                "CategoryID",
                "TypeID",
                "Status",
                "ResponseFormat",
                "ModelSpecificResponseFormat",
                "AIModelTypeID",
                "MinPowerRank",
                "SelectionStrategy",
                "PowerPreference",
                "ParallelizationMode",
                "ParallelCount",
                "ParallelConfigParam",
                "OutputType",
                "OutputExample",
                "ValidationBehavior",
                "MaxRetries",
                "RetryDelayMS",
                "RetryStrategy",
                "ResultSelectorPromptID",
                "EnableCaching",
                "CacheTTLSeconds",
                "CacheMatchType",
                "CacheSimilarityThreshold",
                "CacheMustMatchModel",
                "CacheMustMatchVendor",
                "CacheMustMatchAgent",
                "CacheMustMatchConfig",
                "PromptRole",
                "PromptPosition",
                "Temperature",
                "TopP",
                "TopK",
                "MinP",
                "FrequencyPenalty",
                "PresencePenalty",
                "Seed",
                "StopSequences",
                "IncludeLogProbs",
                "TopLogProbs",
                "FailoverStrategy",
                "FailoverMaxAttempts",
                "FailoverDelaySeconds",
                "FailoverModelStrategy",
                "FailoverErrorScope",
                "EffortLevel",
                "AssistantPrefill",
                "PrefillFallbackMode"
            )
        VALUES
            (
                p_ID,
                p_Name,
                p_Description,
                p_TemplateID,
                p_CategoryID,
                p_TypeID,
                p_Status,
                COALESCE(p_ResponseFormat, 'Any'),
                p_ModelSpecificResponseFormat,
                p_AIModelTypeID,
                p_MinPowerRank,
                COALESCE(p_SelectionStrategy, 'Default'),
                COALESCE(p_PowerPreference, 'Highest'),
                COALESCE(p_ParallelizationMode, 'None'),
                p_ParallelCount,
                p_ParallelConfigParam,
                COALESCE(p_OutputType, 'string'),
                p_OutputExample,
                COALESCE(p_ValidationBehavior, 'Warn'),
                COALESCE(p_MaxRetries, 0),
                COALESCE(p_RetryDelayMS, 0),
                COALESCE(p_RetryStrategy, 'Fixed'),
                p_ResultSelectorPromptID,
                COALESCE(p_EnableCaching, FALSE),
                p_CacheTTLSeconds,
                COALESCE(p_CacheMatchType, 'Exact'),
                p_CacheSimilarityThreshold,
                COALESCE(p_CacheMustMatchModel, TRUE),
                COALESCE(p_CacheMustMatchVendor, TRUE),
                COALESCE(p_CacheMustMatchAgent, FALSE),
                COALESCE(p_CacheMustMatchConfig, FALSE),
                COALESCE(p_PromptRole, 'System'),
                COALESCE(p_PromptPosition, 'First'),
                p_Temperature,
                p_TopP,
                p_TopK,
                p_MinP,
                p_FrequencyPenalty,
                p_PresencePenalty,
                p_Seed,
                p_StopSequences,
                p_IncludeLogProbs,
                p_TopLogProbs,
                COALESCE(p_FailoverStrategy, 'SameModelDifferentVendor'),
                p_FailoverMaxAttempts,
                p_FailoverDelaySeconds,
                COALESCE(p_FailoverModelStrategy, 'PreferSameModel'),
                COALESCE(p_FailoverErrorScope, 'All'),
                p_EffortLevel,
                p_AssistantPrefill,
                COALESCE(p_PrefillFallbackMode, 'Ignore')
            );
    ELSE
        -- No value provided, let database use its default (e.g., gen_random_uuid())
        INSERT INTO __mj."AIPrompt"
            (
                "Name",
                "Description",
                "TemplateID",
                "CategoryID",
                "TypeID",
                "Status",
                "ResponseFormat",
                "ModelSpecificResponseFormat",
                "AIModelTypeID",
                "MinPowerRank",
                "SelectionStrategy",
                "PowerPreference",
                "ParallelizationMode",
                "ParallelCount",
                "ParallelConfigParam",
                "OutputType",
                "OutputExample",
                "ValidationBehavior",
                "MaxRetries",
                "RetryDelayMS",
                "RetryStrategy",
                "ResultSelectorPromptID",
                "EnableCaching",
                "CacheTTLSeconds",
                "CacheMatchType",
                "CacheSimilarityThreshold",
                "CacheMustMatchModel",
                "CacheMustMatchVendor",
                "CacheMustMatchAgent",
                "CacheMustMatchConfig",
                "PromptRole",
                "PromptPosition",
                "Temperature",
                "TopP",
                "TopK",
                "MinP",
                "FrequencyPenalty",
                "PresencePenalty",
                "Seed",
                "StopSequences",
                "IncludeLogProbs",
                "TopLogProbs",
                "FailoverStrategy",
                "FailoverMaxAttempts",
                "FailoverDelaySeconds",
                "FailoverModelStrategy",
                "FailoverErrorScope",
                "EffortLevel",
                "AssistantPrefill",
                "PrefillFallbackMode"
            )
        VALUES
            (
                p_Name,
                p_Description,
                p_TemplateID,
                p_CategoryID,
                p_TypeID,
                p_Status,
                COALESCE(p_ResponseFormat, 'Any'),
                p_ModelSpecificResponseFormat,
                p_AIModelTypeID,
                p_MinPowerRank,
                COALESCE(p_SelectionStrategy, 'Default'),
                COALESCE(p_PowerPreference, 'Highest'),
                COALESCE(p_ParallelizationMode, 'None'),
                p_ParallelCount,
                p_ParallelConfigParam,
                COALESCE(p_OutputType, 'string'),
                p_OutputExample,
                COALESCE(p_ValidationBehavior, 'Warn'),
                COALESCE(p_MaxRetries, 0),
                COALESCE(p_RetryDelayMS, 0),
                COALESCE(p_RetryStrategy, 'Fixed'),
                p_ResultSelectorPromptID,
                COALESCE(p_EnableCaching, FALSE),
                p_CacheTTLSeconds,
                COALESCE(p_CacheMatchType, 'Exact'),
                p_CacheSimilarityThreshold,
                COALESCE(p_CacheMustMatchModel, TRUE),
                COALESCE(p_CacheMustMatchVendor, TRUE),
                COALESCE(p_CacheMustMatchAgent, FALSE),
                COALESCE(p_CacheMustMatchConfig, FALSE),
                COALESCE(p_PromptRole, 'System'),
                COALESCE(p_PromptPosition, 'First'),
                p_Temperature,
                p_TopP,
                p_TopK,
                p_MinP,
                p_FrequencyPenalty,
                p_PresencePenalty,
                p_Seed,
                p_StopSequences,
                p_IncludeLogProbs,
                p_TopLogProbs,
                COALESCE(p_FailoverStrategy, 'SameModelDifferentVendor'),
                p_FailoverMaxAttempts,
                p_FailoverDelaySeconds,
                COALESCE(p_FailoverModelStrategy, 'PreferSameModel'),
                COALESCE(p_FailoverErrorScope, 'All'),
                p_EffortLevel,
                p_AssistantPrefill,
                COALESCE(p_PrefillFallbackMode, 'Ignore')
            );
    END IF;
    -- return the new record from the base view, which might have some calculated fields
    RETURN QUERY SELECT * FROM __mj."vwAIPrompts" WHERE "ID" = p_ID;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spUpdateAIPrompt"(
    IN p_ID UUID,
    IN p_Name VARCHAR(255),
    IN p_Description TEXT,
    IN p_TemplateID UUID,
    IN p_CategoryID UUID,
    IN p_TypeID UUID,
    IN p_Status VARCHAR(50),
    IN p_ResponseFormat VARCHAR(20),
    IN p_ModelSpecificResponseFormat TEXT,
    IN p_AIModelTypeID UUID,
    IN p_MinPowerRank INTEGER,
    IN p_SelectionStrategy VARCHAR(20),
    IN p_PowerPreference VARCHAR(20),
    IN p_ParallelizationMode VARCHAR(20),
    IN p_ParallelCount INTEGER,
    IN p_ParallelConfigParam VARCHAR(100),
    IN p_OutputType VARCHAR(50),
    IN p_OutputExample TEXT,
    IN p_ValidationBehavior VARCHAR(50),
    IN p_MaxRetries INTEGER,
    IN p_RetryDelayMS INTEGER,
    IN p_RetryStrategy VARCHAR(20),
    IN p_ResultSelectorPromptID UUID,
    IN p_EnableCaching BOOLEAN,
    IN p_CacheTTLSeconds INTEGER,
    IN p_CacheMatchType VARCHAR(20),
    IN p_CacheSimilarityThreshold DOUBLE PRECISION,
    IN p_CacheMustMatchModel BOOLEAN,
    IN p_CacheMustMatchVendor BOOLEAN,
    IN p_CacheMustMatchAgent BOOLEAN,
    IN p_CacheMustMatchConfig BOOLEAN,
    IN p_PromptRole VARCHAR(20),
    IN p_PromptPosition VARCHAR(20),
    IN p_Temperature NUMERIC(3,2),
    IN p_TopP NUMERIC(3,2),
    IN p_TopK INTEGER,
    IN p_MinP NUMERIC(3,2),
    IN p_FrequencyPenalty NUMERIC(3,2),
    IN p_PresencePenalty NUMERIC(3,2),
    IN p_Seed INTEGER,
    IN p_StopSequences VARCHAR(1000),
    IN p_IncludeLogProbs BOOLEAN,
    IN p_TopLogProbs INTEGER,
    IN p_FailoverStrategy VARCHAR(50),
    IN p_FailoverMaxAttempts INTEGER,
    IN p_FailoverDelaySeconds INTEGER,
    IN p_FailoverModelStrategy VARCHAR(50),
    IN p_FailoverErrorScope VARCHAR(50),
    IN p_EffortLevel INTEGER,
    IN p_AssistantPrefill TEXT,
    IN p_PrefillFallbackMode VARCHAR(20)
)
RETURNS SETOF __mj."vwAIPrompts" AS
$$
DECLARE
    _v_row_count INTEGER;
BEGIN
UPDATE
        __mj."AIPrompt"
    SET
        "Name" = p_Name,
        "Description" = p_Description,
        "TemplateID" = p_TemplateID,
        "CategoryID" = p_CategoryID,
        "TypeID" = p_TypeID,
        "Status" = p_Status,
        "ResponseFormat" = p_ResponseFormat,
        "ModelSpecificResponseFormat" = p_ModelSpecificResponseFormat,
        "AIModelTypeID" = p_AIModelTypeID,
        "MinPowerRank" = p_MinPowerRank,
        "SelectionStrategy" = p_SelectionStrategy,
        "PowerPreference" = p_PowerPreference,
        "ParallelizationMode" = p_ParallelizationMode,
        "ParallelCount" = p_ParallelCount,
        "ParallelConfigParam" = p_ParallelConfigParam,
        "OutputType" = p_OutputType,
        "OutputExample" = p_OutputExample,
        "ValidationBehavior" = p_ValidationBehavior,
        "MaxRetries" = p_MaxRetries,
        "RetryDelayMS" = p_RetryDelayMS,
        "RetryStrategy" = p_RetryStrategy,
        "ResultSelectorPromptID" = p_ResultSelectorPromptID,
        "EnableCaching" = p_EnableCaching,
        "CacheTTLSeconds" = p_CacheTTLSeconds,
        "CacheMatchType" = p_CacheMatchType,
        "CacheSimilarityThreshold" = p_CacheSimilarityThreshold,
        "CacheMustMatchModel" = p_CacheMustMatchModel,
        "CacheMustMatchVendor" = p_CacheMustMatchVendor,
        "CacheMustMatchAgent" = p_CacheMustMatchAgent,
        "CacheMustMatchConfig" = p_CacheMustMatchConfig,
        "PromptRole" = p_PromptRole,
        "PromptPosition" = p_PromptPosition,
        "Temperature" = p_Temperature,
        "TopP" = p_TopP,
        "TopK" = p_TopK,
        "MinP" = p_MinP,
        "FrequencyPenalty" = p_FrequencyPenalty,
        "PresencePenalty" = p_PresencePenalty,
        "Seed" = p_Seed,
        "StopSequences" = p_StopSequences,
        "IncludeLogProbs" = p_IncludeLogProbs,
        "TopLogProbs" = p_TopLogProbs,
        "FailoverStrategy" = p_FailoverStrategy,
        "FailoverMaxAttempts" = p_FailoverMaxAttempts,
        "FailoverDelaySeconds" = p_FailoverDelaySeconds,
        "FailoverModelStrategy" = p_FailoverModelStrategy,
        "FailoverErrorScope" = p_FailoverErrorScope,
        "EffortLevel" = p_EffortLevel,
        "AssistantPrefill" = p_AssistantPrefill,
        "PrefillFallbackMode" = p_PrefillFallbackMode
    WHERE
        "ID" = p_ID;

    GET DIAGNOSTICS _v_row_count = ROW_COUNT;

    IF _v_row_count = 0 THEN
        RETURN QUERY SELECT * FROM __mj."vwAIPrompts" WHERE 1=0;
    ELSE
        RETURN QUERY SELECT * FROM __mj."vwAIPrompts" WHERE "ID" = p_ID;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION __mj."spDeleteAIPrompt"(
    IN p_ID UUID
)
RETURNS TABLE("_result_id" UUID) AS
$$
DECLARE
    _rec RECORD;
    _v_row_count INTEGER;
    p_MJActions_DefaultCompactPromptIDID UUID;
    p_MJActions_DefaultCompactPromptID_CategoryID UUID;
    p_MJActions_DefaultCompactPromptID_Name VARCHAR(425);
    p_MJActions_DefaultCompactPromptID_Description TEXT;
    p_MJActions_DefaultCompactPromptID_Type VARCHAR(20);
    p_MJActions_DefaultCompactPromptID_UserPrompt TEXT;
    p_MJActions_DefaultCompactPromptID_UserComments TEXT;
    p_MJActions_DefaultCompactPromptID_Code TEXT;
    p_MJActions_DefaultCompactPromptID_CodeComments TEXT;
    p_MJActions_DefaultCompactPromptID_CodeApprovalStatus VARCHAR(20);
    p_MJActions_DefaultCompactPromptID_CodeApprovalComments TEXT;
    p_MJActions_DefaultCompactPromptID_CodeApprovedByUserID UUID;
    p_MJActions_DefaultCompactPromptID_CodeApprovedAt TIMESTAMPTZ;
    p_MJActions_DefaultCompactPromptID_CodeLocked BOOLEAN;
    p_MJActions_DefaultCompactPromptID_ForceCodeGeneration BOOLEAN;
    p_MJActions_DefaultCompactPromptID_RetentionPeriod INTEGER;
    p_MJActions_DefaultCompactPromptID_Status VARCHAR(20);
    p_MJActions_DefaultCompactPromptID_DriverClass VARCHAR(255);
    p_MJActions_DefaultCompactPromptID_ParentID UUID;
    p_MJActions_DefaultCompactPromptID_IconClass VARCHAR(100);
    p_MJActions_DefaultCompactPromptID_DefaultCompactPromptID UUID;
    p_MJActions_DefaultCompactPromptID_Config TEXT;
    p_MJAIAgentActions_CompactPromptIDID UUID;
    p_MJAIAgentActions_CompactPromptID_AgentID UUID;
    p_MJAIAgentActions_CompactPromptID_ActionID UUID;
    p_MJAIAgentActions_CompactPromptID_Status VARCHAR(15);
    p_MJAIAgentActions_CompactPromptID_MinExecutionsPerRun INTEGER;
    p_MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun INTEGER;
    p_MJAIAgentActions_CompactPromptID_ResultExpirationTurns INTEGER;
    p_MJAIAgentActions_CompactPromptID_ResultExpirationMode VARCHAR(20);
    p_MJAIAgentActions_CompactPromptID_CompactMode VARCHAR(20);
    p_MJAIAgentActions_CompactPromptID_CompactLength INTEGER;
    p_MJAIAgentActions_CompactPromptID_CompactPromptID UUID;
    p_MJAIAgentPrompts_PromptIDID UUID;
    p_MJAIAgentSteps_PromptIDID UUID;
    p_MJAIAgentSteps_PromptID_AgentID UUID;
    p_MJAIAgentSteps_PromptID_Name VARCHAR(255);
    p_MJAIAgentSteps_PromptID_Description TEXT;
    p_MJAIAgentSteps_PromptID_StepType VARCHAR(20);
    p_MJAIAgentSteps_PromptID_StartingStep BOOLEAN;
    p_MJAIAgentSteps_PromptID_TimeoutSeconds INTEGER;
    p_MJAIAgentSteps_PromptID_RetryCount INTEGER;
    p_MJAIAgentSteps_PromptID_OnErrorBehavior VARCHAR(20);
    p_MJAIAgentSteps_PromptID_ActionID UUID;
    p_MJAIAgentSteps_PromptID_SubAgentID UUID;
    p_MJAIAgentSteps_PromptID_PromptID UUID;
    p_MJAIAgentSteps_PromptID_ActionOutputMapping TEXT;
    p_MJAIAgentSteps_PromptID_PositionX INTEGER;
    p_MJAIAgentSteps_PromptID_PositionY INTEGER;
    p_MJAIAgentSteps_PromptID_Width INTEGER;
    p_MJAIAgentSteps_PromptID_Height INTEGER;
    p_MJAIAgentSteps_PromptID_Status VARCHAR(20);
    p_MJAIAgentSteps_PromptID_ActionInputMapping TEXT;
    p_MJAIAgentSteps_PromptID_LoopBodyType VARCHAR(50);
    p_MJAIAgentSteps_PromptID_Configuration TEXT;
    p_MJAIAgentTypes_SystemPromptIDID UUID;
    p_MJAIAgentTypes_SystemPromptID_Name VARCHAR(100);
    p_MJAIAgentTypes_SystemPromptID_Description TEXT;
    p_MJAIAgentTypes_SystemPromptID_SystemPromptID UUID;
    p_MJAIAgentTypes_SystemPromptID_IsActive BOOLEAN;
    p_MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder VARCHAR(255);
    p_MJAIAgentTypes_SystemPromptID_DriverClass VARCHAR(255);
    p_MJAIAgentTypes_SystemPromptID_UIFormSectionKey VARCHAR(500);
    p_MJAIAgentTypes_SystemPromptID_UIFormKey VARCHAR(500);
    p_MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault BOOLEAN;
    p_MJAIAgentTypes_SystemPromptID_PromptParamsSchema TEXT;
    p_MJAIAgentTypes_SystemPromptID_AssignmentStrategy TEXT;
    p_MJAIAgents_ContextCompressionPromptIDID UUID;
    p_MJAIAgents_ContextCompressionPromptID_Name VARCHAR(255);
    p_MJAIAgents_ContextCompressionPromptID_Description TEXT;
    p_MJAIAgents_ContextCompressionPromptID_LogoURL VARCHAR(255);
    p_MJAIAgents_ContextCompressionPromptID_ParentID UUID;
    p_MJAIAgents_ContextCompressionPromptID_ExposeAsAction BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_ExecutionOrder INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_ExecutionMode VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_EnableContextComp_017508 BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_09124d INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d UUID;
    p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_6c27f1 INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_TypeID UUID;
    p_MJAIAgents_ContextCompressionPromptID_Status VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_DriverClass VARCHAR(255);
    p_MJAIAgents_ContextCompressionPromptID_IconClass VARCHAR(100);
    p_MJAIAgents_ContextCompressionPromptID_ModelSelectionMode VARCHAR(50);
    p_MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths TEXT;
    p_MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths TEXT;
    p_MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths TEXT;
    p_MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths TEXT;
    p_MJAIAgents_ContextCompressionPromptID_PayloadScope TEXT;
    p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation TEXT;
    p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a7a211 VARCHAR(25);
    p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a47251 INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_MaxCostPerRun NUMERIC(10,4);
    p_MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_MaxTimePerRun INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60 TEXT;
    p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_849b88 VARCHAR(25);
    p_MJAIAgents_ContextCompressionPromptID_DefaultPromptEffo_322203 INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_ChatHandlingOption VARCHAR(30);
    p_MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID UUID;
    p_MJAIAgents_ContextCompressionPromptID_OwnerUserID UUID;
    p_MJAIAgents_ContextCompressionPromptID_InvocationMode VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_FunctionalRequirements TEXT;
    p_MJAIAgents_ContextCompressionPromptID_TechnicalDesign TEXT;
    p_MJAIAgents_ContextCompressionPromptID_InjectNotes BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_MaxNotesToInject INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_InjectExamples BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_ExampleInjectionS_27b212 VARCHAR(20);
    p_MJAIAgents_ContextCompressionPromptID_IsRestricted BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_MessageMode VARCHAR(50);
    p_MJAIAgents_ContextCompressionPromptID_MaxMessages INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_AttachmentStorage_81bfaf UUID;
    p_MJAIAgents_ContextCompressionPromptID_AttachmentRootPath VARCHAR(500);
    p_MJAIAgents_ContextCompressionPromptID_InlineStorageThre_804eef INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams TEXT;
    p_MJAIAgents_ContextCompressionPromptID_ScopeConfig TEXT;
    p_MJAIAgents_ContextCompressionPromptID_NoteRetentionDays INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays INTEGER;
    p_MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled BOOLEAN;
    p_MJAIAgents_ContextCompressionPromptID_RerankerConfiguration TEXT;
    p_MJAIAgents_ContextCompressionPromptID_CategoryID UUID;
    p_MJAIConfigurations_DefaultPromptForContextCompressionIDID UUID;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_Name VARCHAR(100);
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_da9038 TEXT;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_6adeb7 BOOLEAN;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_d74408 VARCHAR(20);
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_62528c UUID;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_dbdd4d UUID;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_30722a UUID;
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_70e3ed VARCHAR(500);
    p_MJAIConfigurations_DefaultPromptForContextCompressionID_0dd4a4 UUID;
    p_MJAIConfigurations_DefaultPromptForContextSummarizationIDID UUID;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_c5c467 VARCHAR(100);
    p_MJAIConfigurations_DefaultPromptForContextSummarization_6a1d29 TEXT;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_bf32c6 BOOLEAN;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_6fd740 VARCHAR(20);
    p_MJAIConfigurations_DefaultPromptForContextSummarization_ac095a UUID;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_931872 UUID;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_991e80 UUID;
    p_MJAIConfigurations_DefaultPromptForContextSummarization_b4211c VARCHAR(500);
    p_MJAIConfigurations_DefaultPromptForContextSummarization_ce7c84 UUID;
    p_MJAIPromptModels_PromptIDID UUID;
    p_MJAIPromptRuns_PromptIDID UUID;
    p_MJAIPromptRuns_JudgeIDID UUID;
    p_MJAIPromptRuns_JudgeID_PromptID UUID;
    p_MJAIPromptRuns_JudgeID_ModelID UUID;
    p_MJAIPromptRuns_JudgeID_VendorID UUID;
    p_MJAIPromptRuns_JudgeID_AgentID UUID;
    p_MJAIPromptRuns_JudgeID_ConfigurationID UUID;
    p_MJAIPromptRuns_JudgeID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_JudgeID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_JudgeID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_JudgeID_Messages TEXT;
    p_MJAIPromptRuns_JudgeID_Result TEXT;
    p_MJAIPromptRuns_JudgeID_TokensUsed INTEGER;
    p_MJAIPromptRuns_JudgeID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_JudgeID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_JudgeID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_JudgeID_Success BOOLEAN;
    p_MJAIPromptRuns_JudgeID_ErrorMessage TEXT;
    p_MJAIPromptRuns_JudgeID_ParentID UUID;
    p_MJAIPromptRuns_JudgeID_RunType VARCHAR(20);
    p_MJAIPromptRuns_JudgeID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_JudgeID_AgentRunID UUID;
    p_MJAIPromptRuns_JudgeID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_JudgeID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_JudgeID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_JudgeID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_JudgeID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_JudgeID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_JudgeID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_JudgeID_TopK INTEGER;
    p_MJAIPromptRuns_JudgeID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_JudgeID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_JudgeID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_JudgeID_Seed INTEGER;
    p_MJAIPromptRuns_JudgeID_StopSequences TEXT;
    p_MJAIPromptRuns_JudgeID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_JudgeID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_JudgeID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_JudgeID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_JudgeID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_JudgeID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_JudgeID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_JudgeID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_JudgeID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_JudgeID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_JudgeID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_JudgeID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_JudgeID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_JudgeID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_JudgeID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_JudgeID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_JudgeID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_JudgeID_ValidationSummary TEXT;
    p_MJAIPromptRuns_JudgeID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_JudgeID_FailoverErrors TEXT;
    p_MJAIPromptRuns_JudgeID_FailoverDurations TEXT;
    p_MJAIPromptRuns_JudgeID_OriginalModelID UUID;
    p_MJAIPromptRuns_JudgeID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_JudgeID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_JudgeID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_JudgeID_ModelSelection TEXT;
    p_MJAIPromptRuns_JudgeID_Status VARCHAR(50);
    p_MJAIPromptRuns_JudgeID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_JudgeID_CancellationReason TEXT;
    p_MJAIPromptRuns_JudgeID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_JudgeID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_JudgeID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_JudgeID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_JudgeID_JudgeID UUID;
    p_MJAIPromptRuns_JudgeID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_JudgeID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_JudgeID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_JudgeID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_JudgeID_ErrorDetails TEXT;
    p_MJAIPromptRuns_JudgeID_ChildPromptID UUID;
    p_MJAIPromptRuns_JudgeID_QueueTime INTEGER;
    p_MJAIPromptRuns_JudgeID_PromptTime INTEGER;
    p_MJAIPromptRuns_JudgeID_CompletionTime INTEGER;
    p_MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails TEXT;
    p_MJAIPromptRuns_JudgeID_EffortLevel INTEGER;
    p_MJAIPromptRuns_JudgeID_RunName VARCHAR(255);
    p_MJAIPromptRuns_JudgeID_Comments TEXT;
    p_MJAIPromptRuns_JudgeID_TestRunID UUID;
    p_MJAIPromptRuns_ChildPromptIDID UUID;
    p_MJAIPromptRuns_ChildPromptID_PromptID UUID;
    p_MJAIPromptRuns_ChildPromptID_ModelID UUID;
    p_MJAIPromptRuns_ChildPromptID_VendorID UUID;
    p_MJAIPromptRuns_ChildPromptID_AgentID UUID;
    p_MJAIPromptRuns_ChildPromptID_ConfigurationID UUID;
    p_MJAIPromptRuns_ChildPromptID_RunAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ChildPromptID_CompletedAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ChildPromptID_ExecutionTimeMS INTEGER;
    p_MJAIPromptRuns_ChildPromptID_Messages TEXT;
    p_MJAIPromptRuns_ChildPromptID_Result TEXT;
    p_MJAIPromptRuns_ChildPromptID_TokensUsed INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TokensPrompt INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TokensCompletion INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TotalCost NUMERIC(18,6);
    p_MJAIPromptRuns_ChildPromptID_Success BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_ErrorMessage TEXT;
    p_MJAIPromptRuns_ChildPromptID_ParentID UUID;
    p_MJAIPromptRuns_ChildPromptID_RunType VARCHAR(20);
    p_MJAIPromptRuns_ChildPromptID_ExecutionOrder INTEGER;
    p_MJAIPromptRuns_ChildPromptID_AgentRunID UUID;
    p_MJAIPromptRuns_ChildPromptID_Cost NUMERIC(19,8);
    p_MJAIPromptRuns_ChildPromptID_CostCurrency VARCHAR(10);
    p_MJAIPromptRuns_ChildPromptID_TokensUsedRollup INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TokensPromptRollup INTEGER;
    p_MJAIPromptRuns_ChildPromptID_TokensCompletionRollup INTEGER;
    p_MJAIPromptRuns_ChildPromptID_Temperature NUMERIC(3,2);
    p_MJAIPromptRuns_ChildPromptID_TopP NUMERIC(3,2);
    p_MJAIPromptRuns_ChildPromptID_TopK INTEGER;
    p_MJAIPromptRuns_ChildPromptID_MinP NUMERIC(3,2);
    p_MJAIPromptRuns_ChildPromptID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPromptRuns_ChildPromptID_PresencePenalty NUMERIC(3,2);
    p_MJAIPromptRuns_ChildPromptID_Seed INTEGER;
    p_MJAIPromptRuns_ChildPromptID_StopSequences TEXT;
    p_MJAIPromptRuns_ChildPromptID_ResponseFormat VARCHAR(50);
    p_MJAIPromptRuns_ChildPromptID_LogProbs BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_TopLogProbs INTEGER;
    p_MJAIPromptRuns_ChildPromptID_DescendantCost NUMERIC(18,6);
    p_MJAIPromptRuns_ChildPromptID_ValidationAttemptCount INTEGER;
    p_MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount INTEGER;
    p_MJAIPromptRuns_ChildPromptID_FinalValidationPassed BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_ValidationBehavior VARCHAR(50);
    p_MJAIPromptRuns_ChildPromptID_RetryStrategy VARCHAR(50);
    p_MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured INTEGER;
    p_MJAIPromptRuns_ChildPromptID_FinalValidationError VARCHAR(500);
    p_MJAIPromptRuns_ChildPromptID_ValidationErrorCount INTEGER;
    p_MJAIPromptRuns_ChildPromptID_CommonValidationError VARCHAR(255);
    p_MJAIPromptRuns_ChildPromptID_FirstAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ChildPromptID_LastAttemptAt TIMESTAMPTZ;
    p_MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS INTEGER;
    p_MJAIPromptRuns_ChildPromptID_ValidationAttempts TEXT;
    p_MJAIPromptRuns_ChildPromptID_ValidationSummary TEXT;
    p_MJAIPromptRuns_ChildPromptID_FailoverAttempts INTEGER;
    p_MJAIPromptRuns_ChildPromptID_FailoverErrors TEXT;
    p_MJAIPromptRuns_ChildPromptID_FailoverDurations TEXT;
    p_MJAIPromptRuns_ChildPromptID_OriginalModelID UUID;
    p_MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime TIMESTAMPTZ;
    p_MJAIPromptRuns_ChildPromptID_TotalFailoverDuration INTEGER;
    p_MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID UUID;
    p_MJAIPromptRuns_ChildPromptID_ModelSelection TEXT;
    p_MJAIPromptRuns_ChildPromptID_Status VARCHAR(50);
    p_MJAIPromptRuns_ChildPromptID_Cancelled BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_CancellationReason TEXT;
    p_MJAIPromptRuns_ChildPromptID_ModelPowerRank INTEGER;
    p_MJAIPromptRuns_ChildPromptID_SelectionStrategy VARCHAR(50);
    p_MJAIPromptRuns_ChildPromptID_CacheHit BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_CacheKey VARCHAR(500);
    p_MJAIPromptRuns_ChildPromptID_JudgeID UUID;
    p_MJAIPromptRuns_ChildPromptID_JudgeScore DOUBLE PRECISION;
    p_MJAIPromptRuns_ChildPromptID_WasSelectedResult BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_StreamingEnabled BOOLEAN;
    p_MJAIPromptRuns_ChildPromptID_FirstTokenTime INTEGER;
    p_MJAIPromptRuns_ChildPromptID_ErrorDetails TEXT;
    p_MJAIPromptRuns_ChildPromptID_ChildPromptID UUID;
    p_MJAIPromptRuns_ChildPromptID_QueueTime INTEGER;
    p_MJAIPromptRuns_ChildPromptID_PromptTime INTEGER;
    p_MJAIPromptRuns_ChildPromptID_CompletionTime INTEGER;
    p_MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails TEXT;
    p_MJAIPromptRuns_ChildPromptID_EffortLevel INTEGER;
    p_MJAIPromptRuns_ChildPromptID_RunName VARCHAR(255);
    p_MJAIPromptRuns_ChildPromptID_Comments TEXT;
    p_MJAIPromptRuns_ChildPromptID_TestRunID UUID;
    p_MJAIPrompts_ResultSelectorPromptIDID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_Name VARCHAR(255);
    p_MJAIPrompts_ResultSelectorPromptID_Description TEXT;
    p_MJAIPrompts_ResultSelectorPromptID_TemplateID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_CategoryID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_TypeID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_Status VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_ResponseFormat VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_ModelSpecificRespons_905abd TEXT;
    p_MJAIPrompts_ResultSelectorPromptID_AIModelTypeID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_MinPowerRank INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_SelectionStrategy VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_PowerPreference VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_ParallelizationMode VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_ParallelCount INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam VARCHAR(100);
    p_MJAIPrompts_ResultSelectorPromptID_OutputType VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_OutputExample TEXT;
    p_MJAIPrompts_ResultSelectorPromptID_ValidationBehavior VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_MaxRetries INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_RetryDelayMS INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_RetryStrategy VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID UUID;
    p_MJAIPrompts_ResultSelectorPromptID_EnableCaching BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_CacheMatchType VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold DOUBLE PRECISION;
    p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_PromptRole VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_PromptPosition VARCHAR(20);
    p_MJAIPrompts_ResultSelectorPromptID_Temperature NUMERIC(3,2);
    p_MJAIPrompts_ResultSelectorPromptID_TopP NUMERIC(3,2);
    p_MJAIPrompts_ResultSelectorPromptID_TopK INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_MinP NUMERIC(3,2);
    p_MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty NUMERIC(3,2);
    p_MJAIPrompts_ResultSelectorPromptID_PresencePenalty NUMERIC(3,2);
    p_MJAIPrompts_ResultSelectorPromptID_Seed INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_StopSequences VARCHAR(1000);
    p_MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs BOOLEAN;
    p_MJAIPrompts_ResultSelectorPromptID_TopLogProbs INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_FailoverStrategy VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope VARCHAR(50);
    p_MJAIPrompts_ResultSelectorPromptID_EffortLevel INTEGER;
    p_MJAIPrompts_ResultSelectorPromptID_AssistantPrefill TEXT;
    p_MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode VARCHAR(20);
    p_MJAIResultCache_AIPromptIDID UUID;
BEGIN
-- Cascade update on Action using cursor to call spUpdateAction


    FOR _rec IN SELECT "ID", "CategoryID", "Name", "Description", "Type", "UserPrompt", "UserComments", "Code", "CodeComments", "CodeApprovalStatus", "CodeApprovalComments", "CodeApprovedByUserID", "CodeApprovedAt", "CodeLocked", "ForceCodeGeneration", "RetentionPeriod", "Status", "DriverClass", "ParentID", "IconClass", "DefaultCompactPromptID", "Config" FROM __mj."Action" WHERE "DefaultCompactPromptID" = p_ID
    LOOP
        p_MJActions_DefaultCompactPromptIDID := _rec."ID";
        p_MJActions_DefaultCompactPromptID_CategoryID := _rec."CategoryID";
        p_MJActions_DefaultCompactPromptID_Name := _rec."Name";
        p_MJActions_DefaultCompactPromptID_Description := _rec."Description";
        p_MJActions_DefaultCompactPromptID_Type := _rec."Type";
        p_MJActions_DefaultCompactPromptID_UserPrompt := _rec."UserPrompt";
        p_MJActions_DefaultCompactPromptID_UserComments := _rec."UserComments";
        p_MJActions_DefaultCompactPromptID_Code := _rec."Code";
        p_MJActions_DefaultCompactPromptID_CodeComments := _rec."CodeComments";
        p_MJActions_DefaultCompactPromptID_CodeApprovalStatus := _rec."CodeApprovalStatus";
        p_MJActions_DefaultCompactPromptID_CodeApprovalComments := _rec."CodeApprovalComments";
        p_MJActions_DefaultCompactPromptID_CodeApprovedByUserID := _rec."CodeApprovedByUserID";
        p_MJActions_DefaultCompactPromptID_CodeApprovedAt := _rec."CodeApprovedAt";
        p_MJActions_DefaultCompactPromptID_CodeLocked := _rec."CodeLocked";
        p_MJActions_DefaultCompactPromptID_ForceCodeGeneration := _rec."ForceCodeGeneration";
        p_MJActions_DefaultCompactPromptID_RetentionPeriod := _rec."RetentionPeriod";
        p_MJActions_DefaultCompactPromptID_Status := _rec."Status";
        p_MJActions_DefaultCompactPromptID_DriverClass := _rec."DriverClass";
        p_MJActions_DefaultCompactPromptID_ParentID := _rec."ParentID";
        p_MJActions_DefaultCompactPromptID_IconClass := _rec."IconClass";
        p_MJActions_DefaultCompactPromptID_DefaultCompactPromptID := _rec."DefaultCompactPromptID";
        p_MJActions_DefaultCompactPromptID_Config := _rec."Config";
        -- Set the FK field to NULL
        p_MJActions_DefaultCompactPromptID_DefaultCompactPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAction"(p_MJActions_DefaultCompactPromptIDID, p_MJActions_DefaultCompactPromptID_CategoryID, p_MJActions_DefaultCompactPromptID_Name, p_MJActions_DefaultCompactPromptID_Description, p_MJActions_DefaultCompactPromptID_Type, p_MJActions_DefaultCompactPromptID_UserPrompt, p_MJActions_DefaultCompactPromptID_UserComments, p_MJActions_DefaultCompactPromptID_Code, p_MJActions_DefaultCompactPromptID_CodeComments, p_MJActions_DefaultCompactPromptID_CodeApprovalStatus, p_MJActions_DefaultCompactPromptID_CodeApprovalComments, p_MJActions_DefaultCompactPromptID_CodeApprovedByUserID, p_MJActions_DefaultCompactPromptID_CodeApprovedAt, p_MJActions_DefaultCompactPromptID_CodeLocked, p_MJActions_DefaultCompactPromptID_ForceCodeGeneration, p_MJActions_DefaultCompactPromptID_RetentionPeriod, p_MJActions_DefaultCompactPromptID_Status, p_MJActions_DefaultCompactPromptID_DriverClass, p_MJActions_DefaultCompactPromptID_ParentID, p_MJActions_DefaultCompactPromptID_IconClass, p_MJActions_DefaultCompactPromptID_DefaultCompactPromptID, p_MJActions_DefaultCompactPromptID_Config);

    END LOOP;

    
    -- Cascade update on AIAgentAction using cursor to call spUpdateAIAgentAction


    FOR _rec IN SELECT "ID", "AgentID", "ActionID", "Status", "MinExecutionsPerRun", "MaxExecutionsPerRun", "ResultExpirationTurns", "ResultExpirationMode", "CompactMode", "CompactLength", "CompactPromptID" FROM __mj."AIAgentAction" WHERE "CompactPromptID" = p_ID
    LOOP
        p_MJAIAgentActions_CompactPromptIDID := _rec."ID";
        p_MJAIAgentActions_CompactPromptID_AgentID := _rec."AgentID";
        p_MJAIAgentActions_CompactPromptID_ActionID := _rec."ActionID";
        p_MJAIAgentActions_CompactPromptID_Status := _rec."Status";
        p_MJAIAgentActions_CompactPromptID_MinExecutionsPerRun := _rec."MinExecutionsPerRun";
        p_MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun := _rec."MaxExecutionsPerRun";
        p_MJAIAgentActions_CompactPromptID_ResultExpirationTurns := _rec."ResultExpirationTurns";
        p_MJAIAgentActions_CompactPromptID_ResultExpirationMode := _rec."ResultExpirationMode";
        p_MJAIAgentActions_CompactPromptID_CompactMode := _rec."CompactMode";
        p_MJAIAgentActions_CompactPromptID_CompactLength := _rec."CompactLength";
        p_MJAIAgentActions_CompactPromptID_CompactPromptID := _rec."CompactPromptID";
        -- Set the FK field to NULL
        p_MJAIAgentActions_CompactPromptID_CompactPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentAction"(p_MJAIAgentActions_CompactPromptIDID, p_MJAIAgentActions_CompactPromptID_AgentID, p_MJAIAgentActions_CompactPromptID_ActionID, p_MJAIAgentActions_CompactPromptID_Status, p_MJAIAgentActions_CompactPromptID_MinExecutionsPerRun, p_MJAIAgentActions_CompactPromptID_MaxExecutionsPerRun, p_MJAIAgentActions_CompactPromptID_ResultExpirationTurns, p_MJAIAgentActions_CompactPromptID_ResultExpirationMode, p_MJAIAgentActions_CompactPromptID_CompactMode, p_MJAIAgentActions_CompactPromptID_CompactLength, p_MJAIAgentActions_CompactPromptID_CompactPromptID);

    END LOOP;

    
    -- Cascade delete from AIAgentPrompt using cursor to call spDeleteAIAgentPrompt

    FOR _rec IN SELECT "ID" FROM __mj."AIAgentPrompt" WHERE "PromptID" = p_ID
    LOOP
        p_MJAIAgentPrompts_PromptIDID := _rec."ID";
        PERFORM __mj."spDeleteAIAgentPrompt"(p_MJAIAgentPrompts_PromptIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIAgentStep using cursor to call spUpdateAIAgentStep


    FOR _rec IN SELECT "ID", "AgentID", "Name", "Description", "StepType", "StartingStep", "TimeoutSeconds", "RetryCount", "OnErrorBehavior", "ActionID", "SubAgentID", "PromptID", "ActionOutputMapping", "PositionX", "PositionY", "Width", "Height", "Status", "ActionInputMapping", "LoopBodyType", "Configuration" FROM __mj."AIAgentStep" WHERE "PromptID" = p_ID
    LOOP
        p_MJAIAgentSteps_PromptIDID := _rec."ID";
        p_MJAIAgentSteps_PromptID_AgentID := _rec."AgentID";
        p_MJAIAgentSteps_PromptID_Name := _rec."Name";
        p_MJAIAgentSteps_PromptID_Description := _rec."Description";
        p_MJAIAgentSteps_PromptID_StepType := _rec."StepType";
        p_MJAIAgentSteps_PromptID_StartingStep := _rec."StartingStep";
        p_MJAIAgentSteps_PromptID_TimeoutSeconds := _rec."TimeoutSeconds";
        p_MJAIAgentSteps_PromptID_RetryCount := _rec."RetryCount";
        p_MJAIAgentSteps_PromptID_OnErrorBehavior := _rec."OnErrorBehavior";
        p_MJAIAgentSteps_PromptID_ActionID := _rec."ActionID";
        p_MJAIAgentSteps_PromptID_SubAgentID := _rec."SubAgentID";
        p_MJAIAgentSteps_PromptID_PromptID := _rec."PromptID";
        p_MJAIAgentSteps_PromptID_ActionOutputMapping := _rec."ActionOutputMapping";
        p_MJAIAgentSteps_PromptID_PositionX := _rec."PositionX";
        p_MJAIAgentSteps_PromptID_PositionY := _rec."PositionY";
        p_MJAIAgentSteps_PromptID_Width := _rec."Width";
        p_MJAIAgentSteps_PromptID_Height := _rec."Height";
        p_MJAIAgentSteps_PromptID_Status := _rec."Status";
        p_MJAIAgentSteps_PromptID_ActionInputMapping := _rec."ActionInputMapping";
        p_MJAIAgentSteps_PromptID_LoopBodyType := _rec."LoopBodyType";
        p_MJAIAgentSteps_PromptID_Configuration := _rec."Configuration";
        -- Set the FK field to NULL
        p_MJAIAgentSteps_PromptID_PromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentStep"(p_MJAIAgentSteps_PromptIDID, p_MJAIAgentSteps_PromptID_AgentID, p_MJAIAgentSteps_PromptID_Name, p_MJAIAgentSteps_PromptID_Description, p_MJAIAgentSteps_PromptID_StepType, p_MJAIAgentSteps_PromptID_StartingStep, p_MJAIAgentSteps_PromptID_TimeoutSeconds, p_MJAIAgentSteps_PromptID_RetryCount, p_MJAIAgentSteps_PromptID_OnErrorBehavior, p_MJAIAgentSteps_PromptID_ActionID, p_MJAIAgentSteps_PromptID_SubAgentID, p_MJAIAgentSteps_PromptID_PromptID, p_MJAIAgentSteps_PromptID_ActionOutputMapping, p_MJAIAgentSteps_PromptID_PositionX, p_MJAIAgentSteps_PromptID_PositionY, p_MJAIAgentSteps_PromptID_Width, p_MJAIAgentSteps_PromptID_Height, p_MJAIAgentSteps_PromptID_Status, p_MJAIAgentSteps_PromptID_ActionInputMapping, p_MJAIAgentSteps_PromptID_LoopBodyType, p_MJAIAgentSteps_PromptID_Configuration);

    END LOOP;

    
    -- Cascade update on AIAgentType using cursor to call spUpdateAIAgentType


    FOR _rec IN SELECT "ID", "Name", "Description", "SystemPromptID", "IsActive", "AgentPromptPlaceholder", "DriverClass", "UIFormSectionKey", "UIFormKey", "UIFormSectionExpandedByDefault", "PromptParamsSchema", "AssignmentStrategy" FROM __mj."AIAgentType" WHERE "SystemPromptID" = p_ID
    LOOP
        p_MJAIAgentTypes_SystemPromptIDID := _rec."ID";
        p_MJAIAgentTypes_SystemPromptID_Name := _rec."Name";
        p_MJAIAgentTypes_SystemPromptID_Description := _rec."Description";
        p_MJAIAgentTypes_SystemPromptID_SystemPromptID := _rec."SystemPromptID";
        p_MJAIAgentTypes_SystemPromptID_IsActive := _rec."IsActive";
        p_MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder := _rec."AgentPromptPlaceholder";
        p_MJAIAgentTypes_SystemPromptID_DriverClass := _rec."DriverClass";
        p_MJAIAgentTypes_SystemPromptID_UIFormSectionKey := _rec."UIFormSectionKey";
        p_MJAIAgentTypes_SystemPromptID_UIFormKey := _rec."UIFormKey";
        p_MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault := _rec."UIFormSectionExpandedByDefault";
        p_MJAIAgentTypes_SystemPromptID_PromptParamsSchema := _rec."PromptParamsSchema";
        p_MJAIAgentTypes_SystemPromptID_AssignmentStrategy := _rec."AssignmentStrategy";
        -- Set the FK field to NULL
        p_MJAIAgentTypes_SystemPromptID_SystemPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgentType"(p_MJAIAgentTypes_SystemPromptIDID, p_MJAIAgentTypes_SystemPromptID_Name, p_MJAIAgentTypes_SystemPromptID_Description, p_MJAIAgentTypes_SystemPromptID_SystemPromptID, p_MJAIAgentTypes_SystemPromptID_IsActive, p_MJAIAgentTypes_SystemPromptID_AgentPromptPlaceholder, p_MJAIAgentTypes_SystemPromptID_DriverClass, p_MJAIAgentTypes_SystemPromptID_UIFormSectionKey, p_MJAIAgentTypes_SystemPromptID_UIFormKey, p_MJAIAgentTypes_SystemPromptID_UIFormSectionExpandedByDefault, p_MJAIAgentTypes_SystemPromptID_PromptParamsSchema, p_MJAIAgentTypes_SystemPromptID_AssignmentStrategy);

    END LOOP;

    
    -- Cascade update on AIAgent using cursor to call spUpdateAIAgent


    FOR _rec IN SELECT "ID", "Name", "Description", "LogoURL", "ParentID", "ExposeAsAction", "ExecutionOrder", "ExecutionMode", "EnableContextCompression", "ContextCompressionMessageThreshold", "ContextCompressionPromptID", "ContextCompressionMessageRetentionCount", "TypeID", "Status", "DriverClass", "IconClass", "ModelSelectionMode", "PayloadDownstreamPaths", "PayloadUpstreamPaths", "PayloadSelfReadPaths", "PayloadSelfWritePaths", "PayloadScope", "FinalPayloadValidation", "FinalPayloadValidationMode", "FinalPayloadValidationMaxRetries", "MaxCostPerRun", "MaxTokensPerRun", "MaxIterationsPerRun", "MaxTimePerRun", "MinExecutionsPerRun", "MaxExecutionsPerRun", "StartingPayloadValidation", "StartingPayloadValidationMode", "DefaultPromptEffortLevel", "ChatHandlingOption", "DefaultArtifactTypeID", "OwnerUserID", "InvocationMode", "ArtifactCreationMode", "FunctionalRequirements", "TechnicalDesign", "InjectNotes", "MaxNotesToInject", "NoteInjectionStrategy", "InjectExamples", "MaxExamplesToInject", "ExampleInjectionStrategy", "IsRestricted", "MessageMode", "MaxMessages", "AttachmentStorageProviderID", "AttachmentRootPath", "InlineStorageThresholdBytes", "AgentTypePromptParams", "ScopeConfig", "NoteRetentionDays", "ExampleRetentionDays", "AutoArchiveEnabled", "RerankerConfiguration", "CategoryID" FROM __mj."AIAgent" WHERE "ContextCompressionPromptID" = p_ID
    LOOP
        p_MJAIAgents_ContextCompressionPromptIDID := _rec."ID";
        p_MJAIAgents_ContextCompressionPromptID_Name := _rec."Name";
        p_MJAIAgents_ContextCompressionPromptID_Description := _rec."Description";
        p_MJAIAgents_ContextCompressionPromptID_LogoURL := _rec."LogoURL";
        p_MJAIAgents_ContextCompressionPromptID_ParentID := _rec."ParentID";
        p_MJAIAgents_ContextCompressionPromptID_ExposeAsAction := _rec."ExposeAsAction";
        p_MJAIAgents_ContextCompressionPromptID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIAgents_ContextCompressionPromptID_ExecutionMode := _rec."ExecutionMode";
        p_MJAIAgents_ContextCompressionPromptID_EnableContextComp_017508 := _rec."EnableContextCompression";
        p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_09124d := _rec."ContextCompressionMessageThreshold";
        p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d := _rec."ContextCompressionPromptID";
        p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_6c27f1 := _rec."ContextCompressionMessageRetentionCount";
        p_MJAIAgents_ContextCompressionPromptID_TypeID := _rec."TypeID";
        p_MJAIAgents_ContextCompressionPromptID_Status := _rec."Status";
        p_MJAIAgents_ContextCompressionPromptID_DriverClass := _rec."DriverClass";
        p_MJAIAgents_ContextCompressionPromptID_IconClass := _rec."IconClass";
        p_MJAIAgents_ContextCompressionPromptID_ModelSelectionMode := _rec."ModelSelectionMode";
        p_MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths := _rec."PayloadDownstreamPaths";
        p_MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths := _rec."PayloadUpstreamPaths";
        p_MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths := _rec."PayloadSelfReadPaths";
        p_MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths := _rec."PayloadSelfWritePaths";
        p_MJAIAgents_ContextCompressionPromptID_PayloadScope := _rec."PayloadScope";
        p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation := _rec."FinalPayloadValidation";
        p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a7a211 := _rec."FinalPayloadValidationMode";
        p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a47251 := _rec."FinalPayloadValidationMaxRetries";
        p_MJAIAgents_ContextCompressionPromptID_MaxCostPerRun := _rec."MaxCostPerRun";
        p_MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun := _rec."MaxTokensPerRun";
        p_MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun := _rec."MaxIterationsPerRun";
        p_MJAIAgents_ContextCompressionPromptID_MaxTimePerRun := _rec."MaxTimePerRun";
        p_MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun := _rec."MinExecutionsPerRun";
        p_MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun := _rec."MaxExecutionsPerRun";
        p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60 := _rec."StartingPayloadValidation";
        p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60Mode := _rec."StartingPayloadValidationMode";
        p_MJAIAgents_ContextCompressionPromptID_DefaultPromptEffo_322203 := _rec."DefaultPromptEffortLevel";
        p_MJAIAgents_ContextCompressionPromptID_ChatHandlingOption := _rec."ChatHandlingOption";
        p_MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID := _rec."DefaultArtifactTypeID";
        p_MJAIAgents_ContextCompressionPromptID_OwnerUserID := _rec."OwnerUserID";
        p_MJAIAgents_ContextCompressionPromptID_InvocationMode := _rec."InvocationMode";
        p_MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode := _rec."ArtifactCreationMode";
        p_MJAIAgents_ContextCompressionPromptID_FunctionalRequirements := _rec."FunctionalRequirements";
        p_MJAIAgents_ContextCompressionPromptID_TechnicalDesign := _rec."TechnicalDesign";
        p_MJAIAgents_ContextCompressionPromptID_InjectNotes := _rec."InjectNotes";
        p_MJAIAgents_ContextCompressionPromptID_MaxNotesToInject := _rec."MaxNotesToInject";
        p_MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy := _rec."NoteInjectionStrategy";
        p_MJAIAgents_ContextCompressionPromptID_InjectExamples := _rec."InjectExamples";
        p_MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject := _rec."MaxExamplesToInject";
        p_MJAIAgents_ContextCompressionPromptID_ExampleInjectionS_27b212 := _rec."ExampleInjectionStrategy";
        p_MJAIAgents_ContextCompressionPromptID_IsRestricted := _rec."IsRestricted";
        p_MJAIAgents_ContextCompressionPromptID_MessageMode := _rec."MessageMode";
        p_MJAIAgents_ContextCompressionPromptID_MaxMessages := _rec."MaxMessages";
        p_MJAIAgents_ContextCompressionPromptID_AttachmentStorage_81bfaf := _rec."AttachmentStorageProviderID";
        p_MJAIAgents_ContextCompressionPromptID_AttachmentRootPath := _rec."AttachmentRootPath";
        p_MJAIAgents_ContextCompressionPromptID_InlineStorageThre_804eef := _rec."InlineStorageThresholdBytes";
        p_MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams := _rec."AgentTypePromptParams";
        p_MJAIAgents_ContextCompressionPromptID_ScopeConfig := _rec."ScopeConfig";
        p_MJAIAgents_ContextCompressionPromptID_NoteRetentionDays := _rec."NoteRetentionDays";
        p_MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays := _rec."ExampleRetentionDays";
        p_MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled := _rec."AutoArchiveEnabled";
        p_MJAIAgents_ContextCompressionPromptID_RerankerConfiguration := _rec."RerankerConfiguration";
        p_MJAIAgents_ContextCompressionPromptID_CategoryID := _rec."CategoryID";
        -- Set the FK field to NULL
        p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIAgent"(p_MJAIAgents_ContextCompressionPromptIDID, p_MJAIAgents_ContextCompressionPromptID_Name, p_MJAIAgents_ContextCompressionPromptID_Description, p_MJAIAgents_ContextCompressionPromptID_LogoURL, p_MJAIAgents_ContextCompressionPromptID_ParentID, p_MJAIAgents_ContextCompressionPromptID_ExposeAsAction, p_MJAIAgents_ContextCompressionPromptID_ExecutionOrder, p_MJAIAgents_ContextCompressionPromptID_ExecutionMode, p_MJAIAgents_ContextCompressionPromptID_EnableContextComp_017508, p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_09124d, p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_a2467d, p_MJAIAgents_ContextCompressionPromptID_ContextCompressio_6c27f1, p_MJAIAgents_ContextCompressionPromptID_TypeID, p_MJAIAgents_ContextCompressionPromptID_Status, p_MJAIAgents_ContextCompressionPromptID_DriverClass, p_MJAIAgents_ContextCompressionPromptID_IconClass, p_MJAIAgents_ContextCompressionPromptID_ModelSelectionMode, p_MJAIAgents_ContextCompressionPromptID_PayloadDownstreamPaths, p_MJAIAgents_ContextCompressionPromptID_PayloadUpstreamPaths, p_MJAIAgents_ContextCompressionPromptID_PayloadSelfReadPaths, p_MJAIAgents_ContextCompressionPromptID_PayloadSelfWritePaths, p_MJAIAgents_ContextCompressionPromptID_PayloadScope, p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValidation, p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a7a211, p_MJAIAgents_ContextCompressionPromptID_FinalPayloadValid_a47251, p_MJAIAgents_ContextCompressionPromptID_MaxCostPerRun, p_MJAIAgents_ContextCompressionPromptID_MaxTokensPerRun, p_MJAIAgents_ContextCompressionPromptID_MaxIterationsPerRun, p_MJAIAgents_ContextCompressionPromptID_MaxTimePerRun, p_MJAIAgents_ContextCompressionPromptID_MinExecutionsPerRun, p_MJAIAgents_ContextCompressionPromptID_MaxExecutionsPerRun, p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60, p_MJAIAgents_ContextCompressionPromptID_StartingPayloadVa_df2a60Mode, p_MJAIAgents_ContextCompressionPromptID_DefaultPromptEffo_322203, p_MJAIAgents_ContextCompressionPromptID_ChatHandlingOption, p_MJAIAgents_ContextCompressionPromptID_DefaultArtifactTypeID, p_MJAIAgents_ContextCompressionPromptID_OwnerUserID, p_MJAIAgents_ContextCompressionPromptID_InvocationMode, p_MJAIAgents_ContextCompressionPromptID_ArtifactCreationMode, p_MJAIAgents_ContextCompressionPromptID_FunctionalRequirements, p_MJAIAgents_ContextCompressionPromptID_TechnicalDesign, p_MJAIAgents_ContextCompressionPromptID_InjectNotes, p_MJAIAgents_ContextCompressionPromptID_MaxNotesToInject, p_MJAIAgents_ContextCompressionPromptID_NoteInjectionStrategy, p_MJAIAgents_ContextCompressionPromptID_InjectExamples, p_MJAIAgents_ContextCompressionPromptID_MaxExamplesToInject, p_MJAIAgents_ContextCompressionPromptID_ExampleInjectionS_27b212, p_MJAIAgents_ContextCompressionPromptID_IsRestricted, p_MJAIAgents_ContextCompressionPromptID_MessageMode, p_MJAIAgents_ContextCompressionPromptID_MaxMessages, p_MJAIAgents_ContextCompressionPromptID_AttachmentStorage_81bfaf, p_MJAIAgents_ContextCompressionPromptID_AttachmentRootPath, p_MJAIAgents_ContextCompressionPromptID_InlineStorageThre_804eef, p_MJAIAgents_ContextCompressionPromptID_AgentTypePromptParams, p_MJAIAgents_ContextCompressionPromptID_ScopeConfig, p_MJAIAgents_ContextCompressionPromptID_NoteRetentionDays, p_MJAIAgents_ContextCompressionPromptID_ExampleRetentionDays, p_MJAIAgents_ContextCompressionPromptID_AutoArchiveEnabled, p_MJAIAgents_ContextCompressionPromptID_RerankerConfiguration, p_MJAIAgents_ContextCompressionPromptID_CategoryID);

    END LOOP;

    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration


    FOR _rec IN SELECT "ID", "Name", "Description", "IsDefault", "Status", "DefaultPromptForContextCompressionID", "DefaultPromptForContextSummarizationID", "DefaultStorageProviderID", "DefaultStorageRootPath", "ParentID" FROM __mj."AIConfiguration" WHERE "DefaultPromptForContextCompressionID" = p_ID
    LOOP
        p_MJAIConfigurations_DefaultPromptForContextCompressionIDID := _rec."ID";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_Name := _rec."Name";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_da9038 := _rec."Description";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_6adeb7 := _rec."IsDefault";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_d74408 := _rec."Status";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_62528c := _rec."DefaultPromptForContextCompressionID";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_dbdd4d := _rec."DefaultPromptForContextSummarizationID";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_30722a := _rec."DefaultStorageProviderID";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_70e3ed := _rec."DefaultStorageRootPath";
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_0dd4a4 := _rec."ParentID";
        -- Set the FK field to NULL
        p_MJAIConfigurations_DefaultPromptForContextCompressionID_62528c := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIConfiguration"(p_MJAIConfigurations_DefaultPromptForContextCompressionIDID, p_MJAIConfigurations_DefaultPromptForContextCompressionID_Name, p_MJAIConfigurations_DefaultPromptForContextCompressionID_da9038, p_MJAIConfigurations_DefaultPromptForContextCompressionID_6adeb7, p_MJAIConfigurations_DefaultPromptForContextCompressionID_d74408, p_MJAIConfigurations_DefaultPromptForContextCompressionID_62528c, p_MJAIConfigurations_DefaultPromptForContextCompressionID_dbdd4d, p_MJAIConfigurations_DefaultPromptForContextCompressionID_30722a, p_MJAIConfigurations_DefaultPromptForContextCompressionID_70e3ed, p_MJAIConfigurations_DefaultPromptForContextCompressionID_0dd4a4);

    END LOOP;

    
    -- Cascade update on AIConfiguration using cursor to call spUpdateAIConfiguration


    FOR _rec IN SELECT "ID", "Name", "Description", "IsDefault", "Status", "DefaultPromptForContextCompressionID", "DefaultPromptForContextSummarizationID", "DefaultStorageProviderID", "DefaultStorageRootPath", "ParentID" FROM __mj."AIConfiguration" WHERE "DefaultPromptForContextSummarizationID" = p_ID
    LOOP
        p_MJAIConfigurations_DefaultPromptForContextSummarizationIDID := _rec."ID";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_c5c467 := _rec."Name";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_6a1d29 := _rec."Description";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_bf32c6 := _rec."IsDefault";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_6fd740 := _rec."Status";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_ac095a := _rec."DefaultPromptForContextCompressionID";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_931872 := _rec."DefaultPromptForContextSummarizationID";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_991e80 := _rec."DefaultStorageProviderID";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_b4211c := _rec."DefaultStorageRootPath";
        p_MJAIConfigurations_DefaultPromptForContextSummarization_ce7c84 := _rec."ParentID";
        -- Set the FK field to NULL
        p_MJAIConfigurations_DefaultPromptForContextSummarization_931872 := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIConfiguration"(p_MJAIConfigurations_DefaultPromptForContextSummarizationIDID, p_MJAIConfigurations_DefaultPromptForContextSummarization_c5c467, p_MJAIConfigurations_DefaultPromptForContextSummarization_6a1d29, p_MJAIConfigurations_DefaultPromptForContextSummarization_bf32c6, p_MJAIConfigurations_DefaultPromptForContextSummarization_6fd740, p_MJAIConfigurations_DefaultPromptForContextSummarization_ac095a, p_MJAIConfigurations_DefaultPromptForContextSummarization_931872, p_MJAIConfigurations_DefaultPromptForContextSummarization_991e80, p_MJAIConfigurations_DefaultPromptForContextSummarization_b4211c, p_MJAIConfigurations_DefaultPromptForContextSummarization_ce7c84);

    END LOOP;

    
    -- Cascade delete from AIPromptModel using cursor to call spDeleteAIPromptModel

    FOR _rec IN SELECT "ID" FROM __mj."AIPromptModel" WHERE "PromptID" = p_ID
    LOOP
        p_MJAIPromptModels_PromptIDID := _rec."ID";
        PERFORM __mj."spDeleteAIPromptModel"(p_MJAIPromptModels_PromptIDID);
        
    END LOOP;
    
    
    -- Cascade delete from AIPromptRun using cursor to call spDeleteAIPromptRun

    FOR _rec IN SELECT "ID" FROM __mj."AIPromptRun" WHERE "PromptID" = p_ID
    LOOP
        p_MJAIPromptRuns_PromptIDID := _rec."ID";
        PERFORM __mj."spDeleteAIPromptRun"(p_MJAIPromptRuns_PromptIDID);
        
    END LOOP;
    
    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID" FROM __mj."AIPromptRun" WHERE "JudgeID" = p_ID
    LOOP
        p_MJAIPromptRuns_JudgeIDID := _rec."ID";
        p_MJAIPromptRuns_JudgeID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_JudgeID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_JudgeID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_JudgeID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_JudgeID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_JudgeID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_JudgeID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_JudgeID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_JudgeID_Messages := _rec."Messages";
        p_MJAIPromptRuns_JudgeID_Result := _rec."Result";
        p_MJAIPromptRuns_JudgeID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_JudgeID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_JudgeID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_JudgeID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_JudgeID_Success := _rec."Success";
        p_MJAIPromptRuns_JudgeID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_JudgeID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_JudgeID_RunType := _rec."RunType";
        p_MJAIPromptRuns_JudgeID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_JudgeID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_JudgeID_Cost := _rec."Cost";
        p_MJAIPromptRuns_JudgeID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_JudgeID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_JudgeID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_JudgeID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_JudgeID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_JudgeID_TopP := _rec."TopP";
        p_MJAIPromptRuns_JudgeID_TopK := _rec."TopK";
        p_MJAIPromptRuns_JudgeID_MinP := _rec."MinP";
        p_MJAIPromptRuns_JudgeID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_JudgeID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_JudgeID_Seed := _rec."Seed";
        p_MJAIPromptRuns_JudgeID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_JudgeID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_JudgeID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_JudgeID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_JudgeID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_JudgeID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_JudgeID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_JudgeID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_JudgeID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_JudgeID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_JudgeID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_JudgeID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_JudgeID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_JudgeID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_JudgeID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_JudgeID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_JudgeID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_JudgeID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_JudgeID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_JudgeID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_JudgeID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_JudgeID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_JudgeID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_JudgeID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_JudgeID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_JudgeID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_JudgeID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_JudgeID_Status := _rec."Status";
        p_MJAIPromptRuns_JudgeID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_JudgeID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_JudgeID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_JudgeID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_JudgeID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_JudgeID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_JudgeID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_JudgeID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_JudgeID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_JudgeID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_JudgeID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_JudgeID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_JudgeID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_JudgeID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_JudgeID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_JudgeID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_JudgeID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_JudgeID_RunName := _rec."RunName";
        p_MJAIPromptRuns_JudgeID_Comments := _rec."Comments";
        p_MJAIPromptRuns_JudgeID_TestRunID := _rec."TestRunID";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_JudgeID_JudgeID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_MJAIPromptRuns_JudgeIDID, p_MJAIPromptRuns_JudgeID_PromptID, p_MJAIPromptRuns_JudgeID_ModelID, p_MJAIPromptRuns_JudgeID_VendorID, p_MJAIPromptRuns_JudgeID_AgentID, p_MJAIPromptRuns_JudgeID_ConfigurationID, p_MJAIPromptRuns_JudgeID_RunAt, p_MJAIPromptRuns_JudgeID_CompletedAt, p_MJAIPromptRuns_JudgeID_ExecutionTimeMS, p_MJAIPromptRuns_JudgeID_Messages, p_MJAIPromptRuns_JudgeID_Result, p_MJAIPromptRuns_JudgeID_TokensUsed, p_MJAIPromptRuns_JudgeID_TokensPrompt, p_MJAIPromptRuns_JudgeID_TokensCompletion, p_MJAIPromptRuns_JudgeID_TotalCost, p_MJAIPromptRuns_JudgeID_Success, p_MJAIPromptRuns_JudgeID_ErrorMessage, p_MJAIPromptRuns_JudgeID_ParentID, p_MJAIPromptRuns_JudgeID_RunType, p_MJAIPromptRuns_JudgeID_ExecutionOrder, p_MJAIPromptRuns_JudgeID_AgentRunID, p_MJAIPromptRuns_JudgeID_Cost, p_MJAIPromptRuns_JudgeID_CostCurrency, p_MJAIPromptRuns_JudgeID_TokensUsedRollup, p_MJAIPromptRuns_JudgeID_TokensPromptRollup, p_MJAIPromptRuns_JudgeID_TokensCompletionRollup, p_MJAIPromptRuns_JudgeID_Temperature, p_MJAIPromptRuns_JudgeID_TopP, p_MJAIPromptRuns_JudgeID_TopK, p_MJAIPromptRuns_JudgeID_MinP, p_MJAIPromptRuns_JudgeID_FrequencyPenalty, p_MJAIPromptRuns_JudgeID_PresencePenalty, p_MJAIPromptRuns_JudgeID_Seed, p_MJAIPromptRuns_JudgeID_StopSequences, p_MJAIPromptRuns_JudgeID_ResponseFormat, p_MJAIPromptRuns_JudgeID_LogProbs, p_MJAIPromptRuns_JudgeID_TopLogProbs, p_MJAIPromptRuns_JudgeID_DescendantCost, p_MJAIPromptRuns_JudgeID_ValidationAttemptCount, p_MJAIPromptRuns_JudgeID_SuccessfulValidationCount, p_MJAIPromptRuns_JudgeID_FinalValidationPassed, p_MJAIPromptRuns_JudgeID_ValidationBehavior, p_MJAIPromptRuns_JudgeID_RetryStrategy, p_MJAIPromptRuns_JudgeID_MaxRetriesConfigured, p_MJAIPromptRuns_JudgeID_FinalValidationError, p_MJAIPromptRuns_JudgeID_ValidationErrorCount, p_MJAIPromptRuns_JudgeID_CommonValidationError, p_MJAIPromptRuns_JudgeID_FirstAttemptAt, p_MJAIPromptRuns_JudgeID_LastAttemptAt, p_MJAIPromptRuns_JudgeID_TotalRetryDurationMS, p_MJAIPromptRuns_JudgeID_ValidationAttempts, p_MJAIPromptRuns_JudgeID_ValidationSummary, p_MJAIPromptRuns_JudgeID_FailoverAttempts, p_MJAIPromptRuns_JudgeID_FailoverErrors, p_MJAIPromptRuns_JudgeID_FailoverDurations, p_MJAIPromptRuns_JudgeID_OriginalModelID, p_MJAIPromptRuns_JudgeID_OriginalRequestStartTime, p_MJAIPromptRuns_JudgeID_TotalFailoverDuration, p_MJAIPromptRuns_JudgeID_RerunFromPromptRunID, p_MJAIPromptRuns_JudgeID_ModelSelection, p_MJAIPromptRuns_JudgeID_Status, p_MJAIPromptRuns_JudgeID_Cancelled, p_MJAIPromptRuns_JudgeID_CancellationReason, p_MJAIPromptRuns_JudgeID_ModelPowerRank, p_MJAIPromptRuns_JudgeID_SelectionStrategy, p_MJAIPromptRuns_JudgeID_CacheHit, p_MJAIPromptRuns_JudgeID_CacheKey, p_MJAIPromptRuns_JudgeID_JudgeID, p_MJAIPromptRuns_JudgeID_JudgeScore, p_MJAIPromptRuns_JudgeID_WasSelectedResult, p_MJAIPromptRuns_JudgeID_StreamingEnabled, p_MJAIPromptRuns_JudgeID_FirstTokenTime, p_MJAIPromptRuns_JudgeID_ErrorDetails, p_MJAIPromptRuns_JudgeID_ChildPromptID, p_MJAIPromptRuns_JudgeID_QueueTime, p_MJAIPromptRuns_JudgeID_PromptTime, p_MJAIPromptRuns_JudgeID_CompletionTime, p_MJAIPromptRuns_JudgeID_ModelSpecificResponseDetails, p_MJAIPromptRuns_JudgeID_EffortLevel, p_MJAIPromptRuns_JudgeID_RunName, p_MJAIPromptRuns_JudgeID_Comments, p_MJAIPromptRuns_JudgeID_TestRunID);

    END LOOP;

    
    -- Cascade update on AIPromptRun using cursor to call spUpdateAIPromptRun


    FOR _rec IN SELECT "ID", "PromptID", "ModelID", "VendorID", "AgentID", "ConfigurationID", "RunAt", "CompletedAt", "ExecutionTimeMS", "Messages", "Result", "TokensUsed", "TokensPrompt", "TokensCompletion", "TotalCost", "Success", "ErrorMessage", "ParentID", "RunType", "ExecutionOrder", "AgentRunID", "Cost", "CostCurrency", "TokensUsedRollup", "TokensPromptRollup", "TokensCompletionRollup", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "ResponseFormat", "LogProbs", "TopLogProbs", "DescendantCost", "ValidationAttemptCount", "SuccessfulValidationCount", "FinalValidationPassed", "ValidationBehavior", "RetryStrategy", "MaxRetriesConfigured", "FinalValidationError", "ValidationErrorCount", "CommonValidationError", "FirstAttemptAt", "LastAttemptAt", "TotalRetryDurationMS", "ValidationAttempts", "ValidationSummary", "FailoverAttempts", "FailoverErrors", "FailoverDurations", "OriginalModelID", "OriginalRequestStartTime", "TotalFailoverDuration", "RerunFromPromptRunID", "ModelSelection", "Status", "Cancelled", "CancellationReason", "ModelPowerRank", "SelectionStrategy", "CacheHit", "CacheKey", "JudgeID", "JudgeScore", "WasSelectedResult", "StreamingEnabled", "FirstTokenTime", "ErrorDetails", "ChildPromptID", "QueueTime", "PromptTime", "CompletionTime", "ModelSpecificResponseDetails", "EffortLevel", "RunName", "Comments", "TestRunID" FROM __mj."AIPromptRun" WHERE "ChildPromptID" = p_ID
    LOOP
        p_MJAIPromptRuns_ChildPromptIDID := _rec."ID";
        p_MJAIPromptRuns_ChildPromptID_PromptID := _rec."PromptID";
        p_MJAIPromptRuns_ChildPromptID_ModelID := _rec."ModelID";
        p_MJAIPromptRuns_ChildPromptID_VendorID := _rec."VendorID";
        p_MJAIPromptRuns_ChildPromptID_AgentID := _rec."AgentID";
        p_MJAIPromptRuns_ChildPromptID_ConfigurationID := _rec."ConfigurationID";
        p_MJAIPromptRuns_ChildPromptID_RunAt := _rec."RunAt";
        p_MJAIPromptRuns_ChildPromptID_CompletedAt := _rec."CompletedAt";
        p_MJAIPromptRuns_ChildPromptID_ExecutionTimeMS := _rec."ExecutionTimeMS";
        p_MJAIPromptRuns_ChildPromptID_Messages := _rec."Messages";
        p_MJAIPromptRuns_ChildPromptID_Result := _rec."Result";
        p_MJAIPromptRuns_ChildPromptID_TokensUsed := _rec."TokensUsed";
        p_MJAIPromptRuns_ChildPromptID_TokensPrompt := _rec."TokensPrompt";
        p_MJAIPromptRuns_ChildPromptID_TokensCompletion := _rec."TokensCompletion";
        p_MJAIPromptRuns_ChildPromptID_TotalCost := _rec."TotalCost";
        p_MJAIPromptRuns_ChildPromptID_Success := _rec."Success";
        p_MJAIPromptRuns_ChildPromptID_ErrorMessage := _rec."ErrorMessage";
        p_MJAIPromptRuns_ChildPromptID_ParentID := _rec."ParentID";
        p_MJAIPromptRuns_ChildPromptID_RunType := _rec."RunType";
        p_MJAIPromptRuns_ChildPromptID_ExecutionOrder := _rec."ExecutionOrder";
        p_MJAIPromptRuns_ChildPromptID_AgentRunID := _rec."AgentRunID";
        p_MJAIPromptRuns_ChildPromptID_Cost := _rec."Cost";
        p_MJAIPromptRuns_ChildPromptID_CostCurrency := _rec."CostCurrency";
        p_MJAIPromptRuns_ChildPromptID_TokensUsedRollup := _rec."TokensUsedRollup";
        p_MJAIPromptRuns_ChildPromptID_TokensPromptRollup := _rec."TokensPromptRollup";
        p_MJAIPromptRuns_ChildPromptID_TokensCompletionRollup := _rec."TokensCompletionRollup";
        p_MJAIPromptRuns_ChildPromptID_Temperature := _rec."Temperature";
        p_MJAIPromptRuns_ChildPromptID_TopP := _rec."TopP";
        p_MJAIPromptRuns_ChildPromptID_TopK := _rec."TopK";
        p_MJAIPromptRuns_ChildPromptID_MinP := _rec."MinP";
        p_MJAIPromptRuns_ChildPromptID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPromptRuns_ChildPromptID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPromptRuns_ChildPromptID_Seed := _rec."Seed";
        p_MJAIPromptRuns_ChildPromptID_StopSequences := _rec."StopSequences";
        p_MJAIPromptRuns_ChildPromptID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPromptRuns_ChildPromptID_LogProbs := _rec."LogProbs";
        p_MJAIPromptRuns_ChildPromptID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPromptRuns_ChildPromptID_DescendantCost := _rec."DescendantCost";
        p_MJAIPromptRuns_ChildPromptID_ValidationAttemptCount := _rec."ValidationAttemptCount";
        p_MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount := _rec."SuccessfulValidationCount";
        p_MJAIPromptRuns_ChildPromptID_FinalValidationPassed := _rec."FinalValidationPassed";
        p_MJAIPromptRuns_ChildPromptID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPromptRuns_ChildPromptID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured := _rec."MaxRetriesConfigured";
        p_MJAIPromptRuns_ChildPromptID_FinalValidationError := _rec."FinalValidationError";
        p_MJAIPromptRuns_ChildPromptID_ValidationErrorCount := _rec."ValidationErrorCount";
        p_MJAIPromptRuns_ChildPromptID_CommonValidationError := _rec."CommonValidationError";
        p_MJAIPromptRuns_ChildPromptID_FirstAttemptAt := _rec."FirstAttemptAt";
        p_MJAIPromptRuns_ChildPromptID_LastAttemptAt := _rec."LastAttemptAt";
        p_MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS := _rec."TotalRetryDurationMS";
        p_MJAIPromptRuns_ChildPromptID_ValidationAttempts := _rec."ValidationAttempts";
        p_MJAIPromptRuns_ChildPromptID_ValidationSummary := _rec."ValidationSummary";
        p_MJAIPromptRuns_ChildPromptID_FailoverAttempts := _rec."FailoverAttempts";
        p_MJAIPromptRuns_ChildPromptID_FailoverErrors := _rec."FailoverErrors";
        p_MJAIPromptRuns_ChildPromptID_FailoverDurations := _rec."FailoverDurations";
        p_MJAIPromptRuns_ChildPromptID_OriginalModelID := _rec."OriginalModelID";
        p_MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime := _rec."OriginalRequestStartTime";
        p_MJAIPromptRuns_ChildPromptID_TotalFailoverDuration := _rec."TotalFailoverDuration";
        p_MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID := _rec."RerunFromPromptRunID";
        p_MJAIPromptRuns_ChildPromptID_ModelSelection := _rec."ModelSelection";
        p_MJAIPromptRuns_ChildPromptID_Status := _rec."Status";
        p_MJAIPromptRuns_ChildPromptID_Cancelled := _rec."Cancelled";
        p_MJAIPromptRuns_ChildPromptID_CancellationReason := _rec."CancellationReason";
        p_MJAIPromptRuns_ChildPromptID_ModelPowerRank := _rec."ModelPowerRank";
        p_MJAIPromptRuns_ChildPromptID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPromptRuns_ChildPromptID_CacheHit := _rec."CacheHit";
        p_MJAIPromptRuns_ChildPromptID_CacheKey := _rec."CacheKey";
        p_MJAIPromptRuns_ChildPromptID_JudgeID := _rec."JudgeID";
        p_MJAIPromptRuns_ChildPromptID_JudgeScore := _rec."JudgeScore";
        p_MJAIPromptRuns_ChildPromptID_WasSelectedResult := _rec."WasSelectedResult";
        p_MJAIPromptRuns_ChildPromptID_StreamingEnabled := _rec."StreamingEnabled";
        p_MJAIPromptRuns_ChildPromptID_FirstTokenTime := _rec."FirstTokenTime";
        p_MJAIPromptRuns_ChildPromptID_ErrorDetails := _rec."ErrorDetails";
        p_MJAIPromptRuns_ChildPromptID_ChildPromptID := _rec."ChildPromptID";
        p_MJAIPromptRuns_ChildPromptID_QueueTime := _rec."QueueTime";
        p_MJAIPromptRuns_ChildPromptID_PromptTime := _rec."PromptTime";
        p_MJAIPromptRuns_ChildPromptID_CompletionTime := _rec."CompletionTime";
        p_MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails := _rec."ModelSpecificResponseDetails";
        p_MJAIPromptRuns_ChildPromptID_EffortLevel := _rec."EffortLevel";
        p_MJAIPromptRuns_ChildPromptID_RunName := _rec."RunName";
        p_MJAIPromptRuns_ChildPromptID_Comments := _rec."Comments";
        p_MJAIPromptRuns_ChildPromptID_TestRunID := _rec."TestRunID";
        -- Set the FK field to NULL
        p_MJAIPromptRuns_ChildPromptID_ChildPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPromptRun"(p_MJAIPromptRuns_ChildPromptIDID, p_MJAIPromptRuns_ChildPromptID_PromptID, p_MJAIPromptRuns_ChildPromptID_ModelID, p_MJAIPromptRuns_ChildPromptID_VendorID, p_MJAIPromptRuns_ChildPromptID_AgentID, p_MJAIPromptRuns_ChildPromptID_ConfigurationID, p_MJAIPromptRuns_ChildPromptID_RunAt, p_MJAIPromptRuns_ChildPromptID_CompletedAt, p_MJAIPromptRuns_ChildPromptID_ExecutionTimeMS, p_MJAIPromptRuns_ChildPromptID_Messages, p_MJAIPromptRuns_ChildPromptID_Result, p_MJAIPromptRuns_ChildPromptID_TokensUsed, p_MJAIPromptRuns_ChildPromptID_TokensPrompt, p_MJAIPromptRuns_ChildPromptID_TokensCompletion, p_MJAIPromptRuns_ChildPromptID_TotalCost, p_MJAIPromptRuns_ChildPromptID_Success, p_MJAIPromptRuns_ChildPromptID_ErrorMessage, p_MJAIPromptRuns_ChildPromptID_ParentID, p_MJAIPromptRuns_ChildPromptID_RunType, p_MJAIPromptRuns_ChildPromptID_ExecutionOrder, p_MJAIPromptRuns_ChildPromptID_AgentRunID, p_MJAIPromptRuns_ChildPromptID_Cost, p_MJAIPromptRuns_ChildPromptID_CostCurrency, p_MJAIPromptRuns_ChildPromptID_TokensUsedRollup, p_MJAIPromptRuns_ChildPromptID_TokensPromptRollup, p_MJAIPromptRuns_ChildPromptID_TokensCompletionRollup, p_MJAIPromptRuns_ChildPromptID_Temperature, p_MJAIPromptRuns_ChildPromptID_TopP, p_MJAIPromptRuns_ChildPromptID_TopK, p_MJAIPromptRuns_ChildPromptID_MinP, p_MJAIPromptRuns_ChildPromptID_FrequencyPenalty, p_MJAIPromptRuns_ChildPromptID_PresencePenalty, p_MJAIPromptRuns_ChildPromptID_Seed, p_MJAIPromptRuns_ChildPromptID_StopSequences, p_MJAIPromptRuns_ChildPromptID_ResponseFormat, p_MJAIPromptRuns_ChildPromptID_LogProbs, p_MJAIPromptRuns_ChildPromptID_TopLogProbs, p_MJAIPromptRuns_ChildPromptID_DescendantCost, p_MJAIPromptRuns_ChildPromptID_ValidationAttemptCount, p_MJAIPromptRuns_ChildPromptID_SuccessfulValidationCount, p_MJAIPromptRuns_ChildPromptID_FinalValidationPassed, p_MJAIPromptRuns_ChildPromptID_ValidationBehavior, p_MJAIPromptRuns_ChildPromptID_RetryStrategy, p_MJAIPromptRuns_ChildPromptID_MaxRetriesConfigured, p_MJAIPromptRuns_ChildPromptID_FinalValidationError, p_MJAIPromptRuns_ChildPromptID_ValidationErrorCount, p_MJAIPromptRuns_ChildPromptID_CommonValidationError, p_MJAIPromptRuns_ChildPromptID_FirstAttemptAt, p_MJAIPromptRuns_ChildPromptID_LastAttemptAt, p_MJAIPromptRuns_ChildPromptID_TotalRetryDurationMS, p_MJAIPromptRuns_ChildPromptID_ValidationAttempts, p_MJAIPromptRuns_ChildPromptID_ValidationSummary, p_MJAIPromptRuns_ChildPromptID_FailoverAttempts, p_MJAIPromptRuns_ChildPromptID_FailoverErrors, p_MJAIPromptRuns_ChildPromptID_FailoverDurations, p_MJAIPromptRuns_ChildPromptID_OriginalModelID, p_MJAIPromptRuns_ChildPromptID_OriginalRequestStartTime, p_MJAIPromptRuns_ChildPromptID_TotalFailoverDuration, p_MJAIPromptRuns_ChildPromptID_RerunFromPromptRunID, p_MJAIPromptRuns_ChildPromptID_ModelSelection, p_MJAIPromptRuns_ChildPromptID_Status, p_MJAIPromptRuns_ChildPromptID_Cancelled, p_MJAIPromptRuns_ChildPromptID_CancellationReason, p_MJAIPromptRuns_ChildPromptID_ModelPowerRank, p_MJAIPromptRuns_ChildPromptID_SelectionStrategy, p_MJAIPromptRuns_ChildPromptID_CacheHit, p_MJAIPromptRuns_ChildPromptID_CacheKey, p_MJAIPromptRuns_ChildPromptID_JudgeID, p_MJAIPromptRuns_ChildPromptID_JudgeScore, p_MJAIPromptRuns_ChildPromptID_WasSelectedResult, p_MJAIPromptRuns_ChildPromptID_StreamingEnabled, p_MJAIPromptRuns_ChildPromptID_FirstTokenTime, p_MJAIPromptRuns_ChildPromptID_ErrorDetails, p_MJAIPromptRuns_ChildPromptID_ChildPromptID, p_MJAIPromptRuns_ChildPromptID_QueueTime, p_MJAIPromptRuns_ChildPromptID_PromptTime, p_MJAIPromptRuns_ChildPromptID_CompletionTime, p_MJAIPromptRuns_ChildPromptID_ModelSpecificResponseDetails, p_MJAIPromptRuns_ChildPromptID_EffortLevel, p_MJAIPromptRuns_ChildPromptID_RunName, p_MJAIPromptRuns_ChildPromptID_Comments, p_MJAIPromptRuns_ChildPromptID_TestRunID);

    END LOOP;

    
    -- Cascade update on AIPrompt using cursor to call spUpdateAIPrompt


    FOR _rec IN SELECT "ID", "Name", "Description", "TemplateID", "CategoryID", "TypeID", "Status", "ResponseFormat", "ModelSpecificResponseFormat", "AIModelTypeID", "MinPowerRank", "SelectionStrategy", "PowerPreference", "ParallelizationMode", "ParallelCount", "ParallelConfigParam", "OutputType", "OutputExample", "ValidationBehavior", "MaxRetries", "RetryDelayMS", "RetryStrategy", "ResultSelectorPromptID", "EnableCaching", "CacheTTLSeconds", "CacheMatchType", "CacheSimilarityThreshold", "CacheMustMatchModel", "CacheMustMatchVendor", "CacheMustMatchAgent", "CacheMustMatchConfig", "PromptRole", "PromptPosition", "Temperature", "TopP", "TopK", "MinP", "FrequencyPenalty", "PresencePenalty", "Seed", "StopSequences", "IncludeLogProbs", "TopLogProbs", "FailoverStrategy", "FailoverMaxAttempts", "FailoverDelaySeconds", "FailoverModelStrategy", "FailoverErrorScope", "EffortLevel", "AssistantPrefill", "PrefillFallbackMode" FROM __mj."AIPrompt" WHERE "ResultSelectorPromptID" = p_ID
    LOOP
        p_MJAIPrompts_ResultSelectorPromptIDID := _rec."ID";
        p_MJAIPrompts_ResultSelectorPromptID_Name := _rec."Name";
        p_MJAIPrompts_ResultSelectorPromptID_Description := _rec."Description";
        p_MJAIPrompts_ResultSelectorPromptID_TemplateID := _rec."TemplateID";
        p_MJAIPrompts_ResultSelectorPromptID_CategoryID := _rec."CategoryID";
        p_MJAIPrompts_ResultSelectorPromptID_TypeID := _rec."TypeID";
        p_MJAIPrompts_ResultSelectorPromptID_Status := _rec."Status";
        p_MJAIPrompts_ResultSelectorPromptID_ResponseFormat := _rec."ResponseFormat";
        p_MJAIPrompts_ResultSelectorPromptID_ModelSpecificRespons_905abd := _rec."ModelSpecificResponseFormat";
        p_MJAIPrompts_ResultSelectorPromptID_AIModelTypeID := _rec."AIModelTypeID";
        p_MJAIPrompts_ResultSelectorPromptID_MinPowerRank := _rec."MinPowerRank";
        p_MJAIPrompts_ResultSelectorPromptID_SelectionStrategy := _rec."SelectionStrategy";
        p_MJAIPrompts_ResultSelectorPromptID_PowerPreference := _rec."PowerPreference";
        p_MJAIPrompts_ResultSelectorPromptID_ParallelizationMode := _rec."ParallelizationMode";
        p_MJAIPrompts_ResultSelectorPromptID_ParallelCount := _rec."ParallelCount";
        p_MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam := _rec."ParallelConfigParam";
        p_MJAIPrompts_ResultSelectorPromptID_OutputType := _rec."OutputType";
        p_MJAIPrompts_ResultSelectorPromptID_OutputExample := _rec."OutputExample";
        p_MJAIPrompts_ResultSelectorPromptID_ValidationBehavior := _rec."ValidationBehavior";
        p_MJAIPrompts_ResultSelectorPromptID_MaxRetries := _rec."MaxRetries";
        p_MJAIPrompts_ResultSelectorPromptID_RetryDelayMS := _rec."RetryDelayMS";
        p_MJAIPrompts_ResultSelectorPromptID_RetryStrategy := _rec."RetryStrategy";
        p_MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID := _rec."ResultSelectorPromptID";
        p_MJAIPrompts_ResultSelectorPromptID_EnableCaching := _rec."EnableCaching";
        p_MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds := _rec."CacheTTLSeconds";
        p_MJAIPrompts_ResultSelectorPromptID_CacheMatchType := _rec."CacheMatchType";
        p_MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold := _rec."CacheSimilarityThreshold";
        p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel := _rec."CacheMustMatchModel";
        p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor := _rec."CacheMustMatchVendor";
        p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent := _rec."CacheMustMatchAgent";
        p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig := _rec."CacheMustMatchConfig";
        p_MJAIPrompts_ResultSelectorPromptID_PromptRole := _rec."PromptRole";
        p_MJAIPrompts_ResultSelectorPromptID_PromptPosition := _rec."PromptPosition";
        p_MJAIPrompts_ResultSelectorPromptID_Temperature := _rec."Temperature";
        p_MJAIPrompts_ResultSelectorPromptID_TopP := _rec."TopP";
        p_MJAIPrompts_ResultSelectorPromptID_TopK := _rec."TopK";
        p_MJAIPrompts_ResultSelectorPromptID_MinP := _rec."MinP";
        p_MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty := _rec."FrequencyPenalty";
        p_MJAIPrompts_ResultSelectorPromptID_PresencePenalty := _rec."PresencePenalty";
        p_MJAIPrompts_ResultSelectorPromptID_Seed := _rec."Seed";
        p_MJAIPrompts_ResultSelectorPromptID_StopSequences := _rec."StopSequences";
        p_MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs := _rec."IncludeLogProbs";
        p_MJAIPrompts_ResultSelectorPromptID_TopLogProbs := _rec."TopLogProbs";
        p_MJAIPrompts_ResultSelectorPromptID_FailoverStrategy := _rec."FailoverStrategy";
        p_MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts := _rec."FailoverMaxAttempts";
        p_MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds := _rec."FailoverDelaySeconds";
        p_MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy := _rec."FailoverModelStrategy";
        p_MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope := _rec."FailoverErrorScope";
        p_MJAIPrompts_ResultSelectorPromptID_EffortLevel := _rec."EffortLevel";
        p_MJAIPrompts_ResultSelectorPromptID_AssistantPrefill := _rec."AssistantPrefill";
        p_MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode := _rec."PrefillFallbackMode";
        -- Set the FK field to NULL
        p_MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID := NULL;
        -- Call the update SP for the related entity
        PERFORM __mj."spUpdateAIPrompt"(p_MJAIPrompts_ResultSelectorPromptIDID, p_MJAIPrompts_ResultSelectorPromptID_Name, p_MJAIPrompts_ResultSelectorPromptID_Description, p_MJAIPrompts_ResultSelectorPromptID_TemplateID, p_MJAIPrompts_ResultSelectorPromptID_CategoryID, p_MJAIPrompts_ResultSelectorPromptID_TypeID, p_MJAIPrompts_ResultSelectorPromptID_Status, p_MJAIPrompts_ResultSelectorPromptID_ResponseFormat, p_MJAIPrompts_ResultSelectorPromptID_ModelSpecificRespons_905abd, p_MJAIPrompts_ResultSelectorPromptID_AIModelTypeID, p_MJAIPrompts_ResultSelectorPromptID_MinPowerRank, p_MJAIPrompts_ResultSelectorPromptID_SelectionStrategy, p_MJAIPrompts_ResultSelectorPromptID_PowerPreference, p_MJAIPrompts_ResultSelectorPromptID_ParallelizationMode, p_MJAIPrompts_ResultSelectorPromptID_ParallelCount, p_MJAIPrompts_ResultSelectorPromptID_ParallelConfigParam, p_MJAIPrompts_ResultSelectorPromptID_OutputType, p_MJAIPrompts_ResultSelectorPromptID_OutputExample, p_MJAIPrompts_ResultSelectorPromptID_ValidationBehavior, p_MJAIPrompts_ResultSelectorPromptID_MaxRetries, p_MJAIPrompts_ResultSelectorPromptID_RetryDelayMS, p_MJAIPrompts_ResultSelectorPromptID_RetryStrategy, p_MJAIPrompts_ResultSelectorPromptID_ResultSelectorPromptID, p_MJAIPrompts_ResultSelectorPromptID_EnableCaching, p_MJAIPrompts_ResultSelectorPromptID_CacheTTLSeconds, p_MJAIPrompts_ResultSelectorPromptID_CacheMatchType, p_MJAIPrompts_ResultSelectorPromptID_CacheSimilarityThreshold, p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchModel, p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchVendor, p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchAgent, p_MJAIPrompts_ResultSelectorPromptID_CacheMustMatchConfig, p_MJAIPrompts_ResultSelectorPromptID_PromptRole, p_MJAIPrompts_ResultSelectorPromptID_PromptPosition, p_MJAIPrompts_ResultSelectorPromptID_Temperature, p_MJAIPrompts_ResultSelectorPromptID_TopP, p_MJAIPrompts_ResultSelectorPromptID_TopK, p_MJAIPrompts_ResultSelectorPromptID_MinP, p_MJAIPrompts_ResultSelectorPromptID_FrequencyPenalty, p_MJAIPrompts_ResultSelectorPromptID_PresencePenalty, p_MJAIPrompts_ResultSelectorPromptID_Seed, p_MJAIPrompts_ResultSelectorPromptID_StopSequences, p_MJAIPrompts_ResultSelectorPromptID_IncludeLogProbs, p_MJAIPrompts_ResultSelectorPromptID_TopLogProbs, p_MJAIPrompts_ResultSelectorPromptID_FailoverStrategy, p_MJAIPrompts_ResultSelectorPromptID_FailoverMaxAttempts, p_MJAIPrompts_ResultSelectorPromptID_FailoverDelaySeconds, p_MJAIPrompts_ResultSelectorPromptID_FailoverModelStrategy, p_MJAIPrompts_ResultSelectorPromptID_FailoverErrorScope, p_MJAIPrompts_ResultSelectorPromptID_EffortLevel, p_MJAIPrompts_ResultSelectorPromptID_AssistantPrefill, p_MJAIPrompts_ResultSelectorPromptID_PrefillFallbackMode);

    END LOOP;

    
    -- Cascade delete from AIResultCache using cursor to call spDeleteAIResultCache

    FOR _rec IN SELECT "ID" FROM __mj."AIResultCache" WHERE "AIPromptID" = p_ID
    LOOP
        p_MJAIResultCache_AIPromptIDID := _rec."ID";
        PERFORM __mj."spDeleteAIResultCache"(p_MJAIResultCache_AIPromptIDID);
        
    END LOOP;
    
    

    DELETE FROM
        __mj."AIPrompt"
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

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIModel_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIModel" ON __mj."AIModel";
CREATE TRIGGER "trgUpdateAIModel"
    BEFORE UPDATE ON __mj."AIModel"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIModel_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIModelType_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIModelType" ON __mj."AIModelType";
CREATE TRIGGER "trgUpdateAIModelType"
    BEFORE UPDATE ON __mj."AIModelType"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIModelType_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIModelVendor_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIModelVendor" ON __mj."AIModelVendor";
CREATE TRIGGER "trgUpdateAIModelVendor"
    BEFORE UPDATE ON __mj."AIModelVendor"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIModelVendor_func"();

CREATE OR REPLACE FUNCTION __mj."trgUpdateAIPrompt_func"()
RETURNS TRIGGER AS $$
BEGIN
    NEW."__mj_UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "trgUpdateAIPrompt" ON __mj."AIPrompt";
CREATE TRIGGER "trgUpdateAIPrompt"
    BEFORE UPDATE ON __mj."AIPrompt"
    FOR EACH ROW
    EXECUTE FUNCTION __mj."trgUpdateAIPrompt_func"();


-- ===================== Data (INSERT/UPDATE/DELETE) =====================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '83d5418e-4e0b-4847-97f0-e1cfb0587b5e' OR ("EntityID" = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND "Name" = 'AssistantPrefill')
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
        '83d5418e-4e0b-4847-97f0-e1cfb0587b5e',
        '73AD0238-8B56-EF11-991A-6045BDEBA539', -- "Entity": "MJ": "AI" "Prompts"
        100111,
        'AssistantPrefill',
        'Assistant Prefill',
        'Optional text to prefill the assistant response. The model will continue generating from where this text ends. Used with StopSequences for structured output extraction (e.g., prefill with ```json to get raw JSON). Only effective with providers that support prefill natively; see PrefillFallbackMode for non-supporting providers.',
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '52bc694c-b043-4426-a79b-af3b22c6c58a' OR ("EntityID" = '73AD0238-8B56-EF11-991A-6045BDEBA539' AND "Name" = 'PrefillFallbackMode')
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
        '52bc694c-b043-4426-a79b-af3b22c6c58a',
        '73AD0238-8B56-EF11-991A-6045BDEBA539', -- "Entity": "MJ": "AI" "Prompts"
        100112,
        'PrefillFallbackMode',
        'Prefill Fallback Mode',
        'Controls behavior when the selected provider does not support native assistant prefill. Ignore = silently skip prefill, SystemInstruction = inject a system message instructing the model to start its response with the prefill text (uses fallback text from AI Model Vendor or AI Model Type), None = no fallback (prefill only works with supported providers).',
        'TEXT',
        40,
        0,
        0,
        FALSE,
        'Ignore',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '5ceb95a4-e2b8-43df-a3f0-10c996be0f2f' OR ("EntityID" = 'FD238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SupportsPrefill')
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
        '5ceb95a4-e2b8-43df-a3f0-10c996be0f2f',
        'FD238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "AI" "Models"
        100037,
        'SupportsPrefill',
        'Supports Prefill',
        'Whether this model supports assistant prefill. Overrides the AI Model Type default when set. NULL means inherit from the AI Model Type. Can be further overridden per-vendor in AI Model Vendor.',
        'BOOLEAN',
        1,
        1,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e8cb6d77-91c1-449f-951c-fdfd423dbec6' OR ("EntityID" = 'FD238F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'PrefillFallbackText')
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
        'e8cb6d77-91c1-449f-951c-fdfd423dbec6',
        'FD238F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "AI" "Models"
        100038,
        'PrefillFallbackText',
        'Prefill Fallback Text',
        'Model-level fallback instruction text used when PrefillFallbackMode is SystemInstruction and the provider does not support native prefill. Overrides the AI Model Type default, can be further overridden per-vendor in AI Model Vendor. Use {{prefill}} as a placeholder.',
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

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e98da083-3098-48c8-80e2-a6d0bf54d56e' OR ("EntityID" = '01248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'SupportsPrefill')
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
        'e98da083-3098-48c8-80e2-a6d0bf54d56e',
        '01248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "AI" "Model" "Types"
        100019,
        'SupportsPrefill',
        'Supports Prefill',
        'Whether models of this type generally support assistant prefill. This is a default value that individual AI Model Vendor records can override. For LLM types, many providers support prefill; for BYTEA/audio types, this is typically false.',
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
        'Dropdown',
        NOW(),
        NOW()
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = 'e902aceb-b25a-4a67-916c-bdf4a75d9517' OR ("EntityID" = '01248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'PrefillFallbackText')
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
        'e902aceb-b25a-4a67-916c-bdf4a75d9517',
        '01248F34-2837-EF11-86D4-6045BDEE16E6', -- "Entity": "MJ": "AI" "Model" "Types"
        100020,
        'PrefillFallbackText',
        'Prefill Fallback Text',
        'Default fallback instruction text used when PrefillFallbackMode is SystemInstruction and the provider does not support native prefill. Use {{prefill}} as a placeholder for the actual prefill text. Example: "IMPORTANT: You must begin your response with exactly: {{prefill}}". Individual AI Model Vendor records can override this. If null, a generic fallback is used.',
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '339bddf1-0070-409b-9f57-ee8780e05da9' OR ("EntityID" = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND "Name" = 'SupportsPrefill')
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
        '339bddf1-0070-409b-9f57-ee8780e05da9',
        'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- "Entity": "MJ": "AI" "Model" "Vendors"
        100038,
        'SupportsPrefill',
        'Supports Prefill',
        'Whether this specific model-vendor implementation supports assistant prefill. Overrides the AI Model Type default when set. NULL means inherit from the AI Model Type. For example, Claude via Anthropic supports prefill (true), but GPT-4 via OpenAI does not (false).',
        'BOOLEAN',
        1,
        1,
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
        SELECT 1 FROM __mj."EntityField" WHERE "ID" = '8eef536d-4ae4-4ab8-9c11-4e47e69f2214' OR ("EntityID" = 'F386546E-EC07-46E6-B780-6B1FEA5892E6' AND "Name" = 'PrefillFallbackText')
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
        '8eef536d-4ae4-4ab8-9c11-4e47e69f2214',
        'F386546E-EC07-46E6-B780-6B1FEA5892E6', -- "Entity": "MJ": "AI" "Model" "Vendors"
        100039,
        'PrefillFallbackText',
        'Prefill Fallback Text',
        'Model-specific fallback instruction text used when PrefillFallbackMode is SystemInstruction and the provider does not support native prefill. Overrides the AI Model Type default. Use {{prefill}} as a placeholder. Allows tuning the fallback instruction per model since different models respond better to different phrasing.',
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

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('48100b61-46c8-4289-ab31-452fead3cff5', '52BC694C-B043-4426-A79B-AF3B22C6C58A', 1, 'Ignore', 'Ignore', NOW(), NOW());
/* SQL text to insert entity field value with ID 7c0ab0a0-1869-4c9e-89a8-c05f74cc0e01 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('7c0ab0a0-1869-4c9e-89a8-c05f74cc0e01', '52BC694C-B043-4426-A79B-AF3B22C6C58A', 2, 'None', 'None', NOW(), NOW());
/* SQL text to insert entity field value with ID 497cabcb-db1d-4e5f-84a5-59d943dc3d48 */

INSERT INTO __mj."EntityFieldValue"
                                       ("ID", "EntityFieldID", "Sequence", "Value", "Code", "__mj_CreatedAt", "__mj_UpdatedAt")
                                    VALUES
                                       ('497cabcb-db1d-4e5f-84a5-59d943dc3d48', '52BC694C-B043-4426-A79B-AF3B22C6C58A', 3, 'SystemInstruction', 'SystemInstruction', NOW(), NOW());
/* SQL text to update ValueListType for entity field ID 52BC694C-B043-4426-A79B-AF3B22C6C58A */

UPDATE __mj."EntityField" SET "ValueListType"='List' WHERE "ID"='52BC694C-B043-4426-A79B-AF3B22C6C58A';
/* Index for Foreign Keys for AIModelType */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Types
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key DefaultInputModalityID in table AIModelType

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '5EC9D425-B9DA-4FED-ACC9-596859658679'
               AND "AutoUpdateDefaultInView" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = '7D3C2217-5058-478B-B3EE-3AAF168B4018'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '8B74433E-F36B-1410-883E-00D02208DC50'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '8F74433E-F36B-1410-883E-00D02208DC50'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '9374433E-F36B-1410-883E-00D02208DC50'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = '9AEEBDE0-1200-48A2-83FE-58A9A566E57A'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'E98DA083-3098-48C8-80E2-A6D0BF54D56E'
               AND "AutoUpdateDefaultInView" = TRUE;
/* Set field properties for entity */

UPDATE __mj."EntityField"
            SET "IsNameField" = TRUE
            WHERE "ID" = 'FBEE7EC7-7AD6-45D1-874B-CAAE97C51B22'
            AND "AutoUpdateIsNameField" = TRUE;

UPDATE __mj."EntityField"
               SET "DefaultInView" = TRUE
               WHERE "ID" = 'FBEE7EC7-7AD6-45D1-874B-CAAE97C51B22'
               AND "AutoUpdateDefaultInView" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'BF1B7891-03FE-4B11-ABE7-4BDF4C832A56'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'FBEE7EC7-7AD6-45D1-874B-CAAE97C51B22'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'EA94D7B8-080D-4525-B0E9-6E620B3E901E'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;

UPDATE __mj."EntityField"
                  SET "IncludeInUserSearchAPI" = TRUE
                  WHERE "ID" = 'FBD754C7-2336-494C-9E4F-F3A6EADDB575'
                  AND "AutoUpdateIncludeInUserSearchAPI" = TRUE;
/* Set categories for 23 fields */
-- UPDATE Entity Field Category Info MJ: AI Models."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F94217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FA4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FB4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."AIModelTypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '024317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."IsActive"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '064317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."ModelSelectionInsights"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '309321B0-2443-47A1-85E6-A134664B4AAB' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."InheritTypeModalities"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A6755DF4-8B80-4E06-9D3F-B02188DB8A12' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."PriorVersionID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9C2DD641-F764-4C55-8527-FD5E37BD1895' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."AIModelType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Model Type Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AF5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."Vendor"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '014317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."PowerRank"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '284F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."SpeedRank"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5B8E8CA9-7728-455A-A528-0F13782242C0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."CostRank"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2ED7BE95-4E39-439B-8152-D0A6516C1398' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."DriverClass"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FC4217F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."DriverImportPath"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '094317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."APIName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '274F17F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."InputTokenLimit"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5EC9D425-B9DA-4FED-ACC9-596859658679' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."SupportedResponseFormats"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8B0575EC-3B6E-4F64-B9AC-052B44127021' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."SupportsEffortLevel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A7850674-D31F-4669-8F25-30D9F581E873' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."SupportsPrefill"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Technical Specifications',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5CEB95A4-E2B8-43DF-A3F0-10C996BE0F2F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models."PrefillFallbackText"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Technical Specifications',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E8CB6D77-91C1-449F-951C-FDFD423DBEC6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AD5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Models.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AE5817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
/* Set categories for 21 fields */
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4536A71E-5AD6-4F8C-A663-21F3CEF4831A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."ModelID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Model',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C7583B81-0BC4-4302-98ED-BE6E5DD22D50' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."VendorID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Vendor',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B30005CE-FA92-4DEE-8F56-BEFC7D5E2AAE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."Priority"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '37BFE134-5935-4863-8B22-29EFE58B2150' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1B9F8D2C-F8B4-45D1-B45C-2E946B0C9429' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."TypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1A83EAF3-4F88-48BA-8B4B-BA7E0A4AB513' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."Model"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Model Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EA94D7B8-080D-4525-B0E9-6E620B3E901E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."Vendor"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Vendor Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FBD754C7-2336-494C-9E4F-F3A6EADDB575' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."Type"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Type Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0A17D759-76BD-4954-8851-86F14EAEB203' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."DriverClass"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'BF1B7891-03FE-4B11-ABE7-4BDF4C832A56' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."DriverImportPath"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D57079F0-0DE2-45D8-8ECB-4DC006888664' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."APIName"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'FBEE7EC7-7AD6-45D1-874B-CAAE97C51B22' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."MaxInputTokens"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '20E5AFFE-1F52-478D-AD83-C5A0A90A2C4E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."MaxOutputTokens"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C5799595-5330-4762-BD3C-12F9CD02E933' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."SupportedResponseFormats"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '1099A0DE-EEE4-4D04-B0F6-AC9ED896690D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."SupportsEffortLevel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B36B3620-899F-4851-AD2A-ED14F2D22A4C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."SupportsStreaming"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2E9DA543-3A02-4695-A96C-3017025842CE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."SupportsPrefill"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Implementation Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '339BDDF1-0070-409B-9F57-EE8780E05DA9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors."PrefillFallbackText"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Implementation Configuration',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8EEF536D-4AE4-4AB8-9C11-4E47E69F2214' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C8EA3975-296E-4432-A2CF-78BA773F7CD0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Vendors.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0199799B-8D89-4306-AA33-67D7A326165A' AND "AutoUpdateCategory" = TRUE;
/* Set categories for 11 fields */
-- UPDATE Entity Field Category Info MJ: AI Model Types."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '034317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Types."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '044317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Types."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '054317F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Types.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '585817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Types.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '595817F0-6F36-EF11-86D4-6045BDEE16E6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Types."DefaultInputModalityID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C0BAE356-2818-4B55-9737-5BFA97225462' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Types."DefaultOutputModalityID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '5E5F9F7F-708F-4595-9F32-5F0574F25F01' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Types."SupportsPrefill"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Prefill Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E98DA083-3098-48C8-80E2-A6D0BF54D56E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Types."PrefillFallbackText"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Prefill Settings',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E902ACEB-B25A-4A67-916C-BDF4A75D9517' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Types."DefaultInputModality"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Default Input Modality Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B35C64CB-7EC6-4396-BDA1-59F9F28EED58' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Model Types."DefaultOutputModality"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Default Output Modality Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '6D6D28B3-C88C-40BD-ABE8-A30D2A81420A' AND "AutoUpdateCategory" = TRUE;
/* Update FieldCategoryInfo setting for entity */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Prefill Settings":{"icon":"fa fa-comment-dots","description":"Configuration for assistant response prefill capabilities and fallback instruction templates"}}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = '01248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'FieldCategoryInfo';
/* Update FieldCategoryIcons setting (legacy) */

UPDATE __mj."EntitySetting"
               SET "Value" = '{"Prefill Settings":"fa fa-comment-dots"}', "__mj_UpdatedAt" = NOW()
               WHERE "EntityID" = '01248F34-2837-EF11-86D4-6045BDEE16E6' AND "Name" = 'FieldCategoryIcons';
/* Set categories for 59 fields */
-- UPDATE Entity Field Category Info MJ: AI Prompts."ID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EF73433E-F36B-1410-883E-00D02208DC50' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."Name"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F073433E-F36B-1410-883E-00D02208DC50' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."Description"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F173433E-F36B-1410-883E-00D02208DC50' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."TemplateID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Template',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F273433E-F36B-1410-883E-00D02208DC50' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."CategoryID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F373433E-F36B-1410-883E-00D02208DC50' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."TypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F473433E-F36B-1410-883E-00D02208DC50' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."Status"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F573433E-F36B-1410-883E-00D02208DC50' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."ResponseFormat"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4EBEB02B-AC46-4440-948F-0FCD6C6C26DE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."ModelSpecificResponseFormat"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'DAC94188-E300-4AF8-9CD1-7ED8AFF561BF' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."AIModelTypeID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'AI Model Type',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CDA86CD9-BE45-45BE-8D10-643F8F1EDAAD' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."ResultSelectorPromptID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Result Selector Prompt',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'CB91DE8E-B02C-42DD-9252-44D3905A5B9E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."PromptRole"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '7D3C2217-5058-478B-B3EE-3AAF168B4018' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."PromptPosition"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DFFD6A70-101A-4CA0-AD9F-BDD9CD93F6E7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."Template"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Template Text',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '8B74433E-F36B-1410-883E-00D02208DC50' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."Category"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Category Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8F74433E-F36B-1410-883E-00D02208DC50' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."Type"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Type Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9374433E-F36B-1410-883E-00D02208DC50' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."AIModelType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'AI Model Type Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9AEEBDE0-1200-48A2-83FE-58A9A566E57A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."ResultSelectorPrompt"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Result Selector Prompt Name',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '10EEE5B8-B577-4F8B-9102-AFCCE345086A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."RootResultSelectorPromptID"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Root Result Selector Prompt',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4B2F08BC-1733-4447-B9F2-43A73026D68E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."AssistantPrefill"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Prompt Definition & Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = '83D5418E-4E0B-4847-97F0-E1CFB0587B5E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."PrefillFallbackMode"

UPDATE __mj."EntityField"
SET 
   "Category" = 'Prompt Definition & Metadata',
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '52BC694C-B043-4426-A79B-AF3B22C6C58A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts.__mj_CreatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F873433E-F36B-1410-883E-00D02208DC50' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts.__mj_UpdatedAt

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F973433E-F36B-1410-883E-00D02208DC50' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."MinPowerRank"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Minimum Power Rank',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '351F6694-A797-4177-A8DD-9EA4CB2FACBC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."SelectionStrategy"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A014DE78-5FB6-4114-AC50-40739A24E122' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."PowerPreference"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3A0FD2B4-C4DB-4E4B-B971-1C0F319DFA5A' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."ParallelizationMode"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'A93C0CBB-A329-4E92-90D8-471FF627D055' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."ParallelCount"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '4C01FB80-4497-4547-B0AA-411163649A40' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."ParallelConfigParam"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Parallel Config Parameter',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B44041FC-9647-4A7D-A985-E2A22A733E26' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."Temperature"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8EF6CA12-C07E-4FB3-83A8-A05D6729A112' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."TopP"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '922935E9-659F-4269-9EA6-959F09635A0E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."TopK"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3AE83D23-0D11-4D7F-AFCE-6DA5125B729D' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."MinP"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F9B94902-AE17-4926-B313-CCE5BF1AAF16' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."FrequencyPenalty"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '9032E4D9-3FD3-4AE2-8547-34E5764DECD6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."PresencePenalty"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F84B8FF8-BB66-48AB-B182-A314AF5D9777' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."Seed"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'D872353C-01BD-42A4-901B-003664E51F8C' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."StopSequences"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'EC6AE13E-4162-4A41-840A-70AFC92FB3A9' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."IncludeLogProbs"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Include Log Probabilities',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'E766FB1D-F25A-4852-88FC-36C3C1F0E654' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."TopLogProbs"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Top Log Probabilities',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'AB2E1067-5397-446D-9551-D3838D36CEDF' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."EffortLevel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'DAFA54D5-F48A-499F-8F4E-E329AF0B5B6B' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."OutputType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '45F16173-581A-4383-BCBA-61538C5747D6' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."OutputExample"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = 'Code',
   "CodeType" = 'Other'
WHERE 
   "ID" = 'D23659B1-735A-4943-8BCA-3C6827F576DC' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."ValidationBehavior"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2A15842A-B85B-450F-ACD2-65E3DF0B29F2' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."MaxRetries"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B651F87E-4F28-4076-987F-D62E0976377F' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."RetryDelayMS"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Retry Delay (ms)',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C5605BDA-0E1E-4F0D-B12B-6851A6B048F8' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."RetryStrategy"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0049EE44-5535-4D29-9CE2-2522E5BCD811' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."FailoverStrategy"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F9C62D4B-92AB-45B3-B870-F3060054493E' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."FailoverMaxAttempts"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '53B481B2-BD69-4BF0-AC27-E0CB78F311CA' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."FailoverDelaySeconds"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Failover Delay (seconds)',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'C60ED7E9-60E1-4955-AA36-BC25D0EC64B8' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."FailoverModelStrategy"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '3E98B899-C100-450E-864A-AB108923A721' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."FailoverErrorScope"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '58591F07-7E15-4F0D-987D-A5B09351E4E0' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."EnableCaching"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '758D2C13-2CE3-466A-9FBD-CBE8A2691DFE' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."CacheTTLSeconds"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Cache TTL (Seconds)',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '32FC4550-A54F-453A-9855-65760AD3C4A8' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."CacheMatchType"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'B007D2D5-549E-4688-B48D-8EDD2C5075D4' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."CacheSimilarityThreshold"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = 'F8C70016-D404-4D8F-BBFB-F36D62CD1FE3' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."CacheMustMatchModel"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '8DFDF996-6CB2-4943-BE6B-329AB6F36576' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."CacheMustMatchVendor"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '0A990225-81CB-4355-909E-BC018EABDBD7' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."CacheMustMatchAgent"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '45E6FC9C-7ECD-42D9-AA6A-CDEFBDC97F26' AND "AutoUpdateCategory" = TRUE;
-- UPDATE Entity Field Category Info MJ: AI Prompts."CacheMustMatchConfig"

UPDATE __mj."EntityField"
SET 
   "GeneratedFormSection" = 'Category',
   "DisplayName" = 'Cache Must Match Configuration',
   "ExtendedType" = NULL,
   "CodeType" = NULL
WHERE 
   "ID" = '2861D3B4-040E-48D0-907E-C42ED42BD3AB' AND "AutoUpdateCategory" = TRUE;
/* Refresh custom base views for modified entities so schema changes are picked up */


-- ===================== Grants =====================

DO $$ BEGIN GRANT SELECT ON __mj."vwAIModels" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Models
-- Item: spCreateAIModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModel
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIModel" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Models */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIModel" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Models
-- Item: spUpdateAIModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModel
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIModel" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIModel" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Models */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Models
-- Item: spDeleteAIModel
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModel
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModel" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Models */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModel" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: AI Model Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Types
-- Item: vwAIModelTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Types
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIModelType
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIModelTypes" TO "cdp_Integration", "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Model Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Types
-- Item: Permissions for vwAIModelTypes
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIModelTypes" TO "cdp_Integration", "cdp_Developer", "cdp_UI"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Model Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Types
-- Item: spCreateAIModelType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModelType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIModelType" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Model Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIModelType" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Model Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Types
-- Item: spUpdateAIModelType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModelType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIModelType" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIModelType" TO "cdp_Integration", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: vwAIModelVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- BASE VIEW FOR ENTITY:      MJ: AI Model Vendors
-----               SCHEMA:      __mj
-----               BASE TABLE:  AIModelVendor
-----               PRIMARY KEY: ID
------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIModelVendors" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: Permissions for vwAIModelVendors
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIModelVendors" TO "cdp_UI", "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spCreateAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIModelVendor
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIModelVendor" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Model Vendors */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIModelVendor" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spUpdateAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIModelVendor
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIModelVendor" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIModelVendor" TO "cdp_Developer", "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Model Types */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Types
-- Item: spDeleteAIModelType
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelType
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelType" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Model Types */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelType" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Model Vendors */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Model Vendors
-- Item: spDeleteAIModelVendor
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIModelVendor
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelVendor" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Model Vendors */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIModelVendor" TO "cdp_Integration"; EXCEPTION WHEN others THEN NULL; END $$;
/* Index for Foreign Keys for AIPrompt */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: Index for Foreign Keys
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------
-- Index for foreign key TemplateID in table AIPrompt;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIPrompts" TO "cdp_UI", "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Base View Permissions SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: Permissions for vwAIPrompts
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------;

DO $$ BEGIN GRANT SELECT ON __mj."vwAIPrompts" TO "cdp_UI", "cdp_Integration", "cdp_UI", "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: spCreateAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- CREATE PROCEDURE FOR AIPrompt
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIPrompt" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spCreate Permissions for MJ: AI Prompts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spCreateAIPrompt" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spUpdate SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: spUpdateAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- UPDATE PROCEDURE FOR AIPrompt
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIPrompt" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spUpdateAIPrompt" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete SQL for MJ: AI Prompts */
-----------------------------------------------------------------
-- SQL Code Generation
-- Entity: MJ: AI Prompts
-- Item: spDeleteAIPrompt
--
-- This was generated by the MemberJunction CodeGen tool.
-- This file should NOT be edited by hand.
-----------------------------------------------------------------

------------------------------------------------------------
----- DELETE PROCEDURE FOR AIPrompt
------------------------------------------------------------;

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPrompt" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* spDelete Permissions for MJ: AI Prompts */

DO $$ BEGIN GRANT EXECUTE ON FUNCTION __mj."spDeleteAIPrompt" TO "cdp_Developer"; EXCEPTION WHEN others THEN NULL; END $$;
/* Set field properties for entity */


-- ===================== Comments =====================

COMMENT ON COLUMN __mj."AIPrompt"."AssistantPrefill" IS 'Optional text to prefill the assistant response. The model will continue generating from where this text ends. Used with StopSequences for structured output extraction (e.g., prefill with ```json to get raw JSON). Only effective with providers that support prefill natively; see PrefillFallbackMode for non-supporting providers.';

COMMENT ON COLUMN __mj."AIPrompt"."PrefillFallbackMode" IS 'Controls behavior when the selected provider does not support native assistant prefill. Ignore = silently skip prefill, SystemInstruction = inject a system message instructing the model to start its response with the prefill text (uses fallback text from AI Model Vendor or AI Model Type), None = no fallback (prefill only works with supported providers).';

COMMENT ON COLUMN __mj."AIModelType"."SupportsPrefill" IS 'Whether models of this type generally support assistant prefill. This is a default value that individual AI Model Vendor records can override. For LLM types, many providers support prefill; for image/audio types, this is typically false.';

COMMENT ON COLUMN __mj."AIModelType"."PrefillFallbackText" IS 'Default fallback instruction text used when PrefillFallbackMode is SystemInstruction and the provider does not support native prefill. Use {{prefill}} as a placeholder for the actual prefill text. Example: "IMPORTANT: You must begin your response with exactly: {{prefill}}". Individual AI Model Vendor records can override this. If null, a generic fallback is used.';

COMMENT ON COLUMN __mj."AIModel"."SupportsPrefill" IS 'Whether this model supports assistant prefill. Overrides the AI Model Type default when set. NULL means inherit from the AI Model Type. Can be further overridden per-vendor in AI Model Vendor.';

COMMENT ON COLUMN __mj."AIModel"."PrefillFallbackText" IS 'Model-level fallback instruction text used when PrefillFallbackMode is SystemInstruction and the provider does not support native prefill. Overrides the AI Model Type default, can be further overridden per-vendor in AI Model Vendor. Use {{prefill}} as a placeholder.';

COMMENT ON COLUMN __mj."AIModelVendor"."SupportsPrefill" IS 'Whether this specific model-vendor implementation supports assistant prefill. Overrides the AI Model Type default when set. NULL means inherit from the AI Model Type. For example, Claude via Anthropic supports prefill (true), but GPT-4 via OpenAI does not (false).';

COMMENT ON COLUMN __mj."AIModelVendor"."PrefillFallbackText" IS 'Model-specific fallback instruction text used when PrefillFallbackMode is SystemInstruction and the provider does not support native prefill. Overrides the AI Model Type default. Use {{prefill}} as a placeholder. Allows tuning the fallback instruction per model since different models respond better to different phrasing.';


-- ===================== Other =====================

-- Migration: Add Prefill support to AI Prompts, AI Model Types, and AI Model Vendors
-- Version: 5.15.x
-- Description: Adds columns for assistant prefill and prefill fallback behavior
--              to enable structured output optimization across providers.
--              Note: StopSequences already exists on AIPrompt.

-----------------------------------------------
-- 1. DDL: All ALTER TABLE operations
-----------------------------------------------

-- StopSequences already exists on AIPrompt, only adding prefill columns

/* spUpdate Permissions for MJ: AI Models */

/* spUpdate Permissions for MJ: AI Model Types */

/* spUpdate Permissions for MJ: AI Model Vendors */

/* spUpdate Permissions for MJ: AI Prompts */


-- ===================== Refresh hand-rolled view to expose SupportsPrefill =====================
-- The SupportsPrefill column was added to __mj."AIModel", __mj."AIModelType", and
-- __mj."AIModelVendor" earlier in this migration. vwAIModelTypes and vwAIModelVendors are
-- auto-generated (CodeGen regenerates them on next run) but __mj."vwAIModels" is hand-rolled
-- (BaseViewGenerated=FALSE) so CodeGen does not regenerate it. SQL Server's counterpart uses
-- EXEC sp_refreshview; PG has no equivalent for hand-rolled views. Plain CREATE OR REPLACE
-- VIEW with the column appended at the end (PG accepts a superset column list as long as
-- existing columns are preserved).
CREATE OR REPLACE VIEW __mj."vwAIModels" AS
 SELECT m."ID",
    m."Name",
    m."Description",
    m."AIModelTypeID",
    m."PowerRank",
    m."IsActive",
    m."__mj_CreatedAt",
    m."__mj_UpdatedAt",
    m."SpeedRank",
    m."CostRank",
    m."ModelSelectionInsights",
    m."InheritTypeModalities",
    m."PriorVersionID",
    amt."Name" AS "AIModelType",
    v."Name" AS "Vendor",
    mv."DriverClass",
    mv."DriverImportPath",
    mv."APIName",
    mv."MaxInputTokens" AS "InputTokenLimit",
    mv."SupportedResponseFormats",
    mv."SupportsEffortLevel",
    -- New column appended (v5.15.x): expose SupportsPrefill from AIModel base table.
    m."SupportsPrefill"
   FROM __mj."AIModel" m
     JOIN __mj."AIModelType" amt ON m."AIModelTypeID" = amt."ID"
     LEFT JOIN LATERAL ( SELECT amv."ModelID",
            amv."DriverClass",
            amv."DriverImportPath",
            amv."APIName",
            amv."MaxInputTokens",
            amv."SupportedResponseFormats",
            amv."SupportsEffortLevel",
            amv."VendorID"
           FROM __mj."vwAIModelVendors" amv
          WHERE amv."ModelID" = m."ID" AND amv."Status"::text = 'Active'::text AND amv."Type"::text = 'Inference Provider'::text
          ORDER BY amv."Priority" DESC
         LIMIT 1) mv ON true
     LEFT JOIN __mj."AIVendor" v ON mv."VendorID" = v."ID";
